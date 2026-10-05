import { DurableObject } from "cloudflare:workers";

type WorkspaceSetup = { remote: string; defaultBranch: string; baseCommit: string };
type CommandResult = { argv: string[]; exitCode: number; stdout: string; stderr: string };
type PushResult = { exitCode: number; stdout: string; stderr: string };

const decode = (value: ArrayBuffer, limit = 24_000) => new TextDecoder().decode(value).slice(0, limit);
const commitHash = /^[a-f0-9]{40,64}$/i;
const validBranch = (value: string) => /^[A-Za-z0-9._/-]{1,240}$/.test(value) && !value.startsWith("-") && !value.includes("..") && !value.includes("@{");

/** One Durable Object and one isolated Linux container for an authorized work item. */
export class WorkspaceRunner extends DurableObject<Env> {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS workspace (id INTEGER PRIMARY KEY CHECK (id = 1), remote TEXT NOT NULL, default_branch TEXT NOT NULL, base_commit TEXT NOT NULL)");
    });
  }

  ping() { return "runner-ready"; }

  async runCommand(setup: WorkspaceSetup, argv: string[], token: string): Promise<CommandResult> {
    if (!argv.length || argv.length > 32 || argv.some((part) => part.length > 2_000)) throw new Error("Command arguments are invalid or too large.");
    try {
      console.log("WorkspaceRunner: preparing checkout");
      const workspaceUser = await this.ensureWorkspace(setup, token);
      console.log("WorkspaceRunner: checkout ready; starting agent command");
      const process = await this.ctx.container!.exec(argv, { cwd: "/workspace/repo", user: workspaceUser, signal: AbortSignal.timeout(120_000) });
      const output = await process.output();
      console.log("WorkspaceRunner: agent command finished", output.exitCode);
      return { argv, exitCode: output.exitCode, stdout: decode(output.stdout), stderr: decode(output.stderr) };
    } catch (error) {
      const message = (error instanceof Error ? error.message : "unknown runtime error").replaceAll(token, "[REDACTED]");
      console.error("WorkspaceRunner command failed", message);
      throw new Error(`WorkspaceRunner failed to run the command: ${message}`);
    }
  }

  /** Gitandem-only push path. Agents cannot supply a shell, remote, or Git subcommand here. */
  async pushCommit(setup: WorkspaceSetup, remote: string, branch: string, commit: string, token: string): Promise<PushResult> {
    if (!commitHash.test(commit) || !validBranch(branch)) throw new Error("The commit or target branch is invalid.");
    {
      await this.ensureWorkspace(setup, token);
      const container = this.ctx.container!;
      const validRemote = (() => { try { const url = new URL(remote); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } })();
      if (!validRemote) throw new Error("The target Git remote is invalid.");
      const clean = await container.exec(
        ["/bin/sh", "-c", "rm -rf /workspace/gitandem-push && test -d /workspace/repo/.git && test ! -L /workspace/repo/.git && test ! -e /workspace/repo/.git/objects/info/alternates && test -z \"$(find /workspace/repo/.git -type l -print -quit)\" && cp -R /workspace/repo/.git /workspace/gitandem-push && rm -f /workspace/gitandem-push/config && printf '[core]\\n\\trepositoryformatversion = 0\\n\\tbare = true\\n' > /workspace/gitandem-push/config && chmod -R go-rwx /workspace/gitandem-push"],
        { user: "0:0", signal: AbortSignal.timeout(120_000) },
      );
      const cleanResult = await clean.output();
      if (cleanResult.exitCode !== 0) return { exitCode: cleanResult.exitCode, stdout: "", stderr: `Could not prepare a clean Git push environment: ${decode(cleanResult.stderr).replaceAll(token, "[REDACTED]").trim()}` };
      try {
        const head = await container.exec(["git", "--git-dir=/workspace/gitandem-push", "rev-parse", "HEAD"], { user: "0:0", env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null" }, signal: AbortSignal.timeout(120_000) });
        const headResult = await head.output();
        if (headResult.exitCode !== 0 || decode(headResult.stdout, 128).trim() !== commit) return { exitCode: 1, stdout: "", stderr: "The submitted commit is not the current checkout head." };
        const ancestry = await container.exec(["git", "--git-dir=/workspace/gitandem-push", "merge-base", "--is-ancestor", setup.baseCommit, commit], { user: "0:0", env: { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "core.hooksPath", GIT_CONFIG_VALUE_0: "/dev/null" }, signal: AbortSignal.timeout(120_000) });
        const ancestryResult = await ancestry.output();
        if (ancestryResult.exitCode !== 0) return { exitCode: 1, stdout: "", stderr: "The commit does not descend from the approved base." };
        const push = await container.exec(
          ["git", "--git-dir=/workspace/gitandem-push", "push", remote, `${commit}:refs/heads/${branch}`],
          { env: {
            GIT_CONFIG_COUNT: "2",
            GIT_CONFIG_KEY_0: "http.extraHeader",
            GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
            GIT_CONFIG_KEY_1: "core.hooksPath",
            GIT_CONFIG_VALUE_1: "/dev/null",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: "/dev/null",
          }, user: "0:0", signal: AbortSignal.timeout(120_000) },
        );
        const result = await push.output();
        return {
          exitCode: result.exitCode,
          stdout: decode(result.stdout).replaceAll(token, "[REDACTED]"),
          stderr: decode(result.stderr).replaceAll(token, "[REDACTED]"),
        };
      } finally {
        await container.exec(["/bin/sh", "-c", "rm -rf /workspace/gitandem-push"], { user: "0:0" }).then((process) => process.output()).catch(() => undefined);
      }
    }
  }

  private async ensureWorkspace(setup: WorkspaceSetup, token: string): Promise<string> {
    await this.ready;
    console.log("WorkspaceRunner: storage ready");
    const sql = this.ctx.storage.sql;
    const existing = sql.exec<{ remote: string; default_branch: string; base_commit: string }>("SELECT remote, default_branch, base_commit FROM workspace WHERE id = 1").toArray()[0];
    if (existing && (existing.remote !== setup.remote || existing.default_branch !== setup.defaultBranch || existing.base_commit !== setup.baseCommit)) throw new Error("This execution environment is already attached to another workspace.");
    if (!existing) sql.exec("INSERT INTO workspace (id, remote, default_branch, base_commit) VALUES (1, ?, ?, ?)", setup.remote, setup.defaultBranch, setup.baseCommit);

    const container = this.ctx.container;
    if (!container) throw new Error("Cloudflare did not provide the task container.");
    console.log("WorkspaceRunner: container attached", container.running);
    const instance = "standard-1";
    if (container.running) {
      const info = await container.inspect();
      console.log("WorkspaceRunner: container inspected", info?.labels.runtime);
      if (info?.labels.runtime !== "std1") await container.destroy();
    }
    if (!container.running) {
      await container.start({
        image: "cloudflare/debian-trixie",
        entrypoint: ["sleep", "infinity"],
        enableInternet: true,
        instance,
        labels: { gitandem: "work", runtime: "std1" },
      });
      console.log("WorkspaceRunner: container start requested");
    }
    await container.setInactivityTimeout(10 * 60 * 1000);
    console.log("WorkspaceRunner: timeout set");

    const present = await this.runStage("checking the workspace checkout", () => container.exec(["/bin/sh", "-c", "test -d /workspace/repo/.git"]));
    const presentResult = await this.runStage("reading the workspace checkout status", () => present.output());
    console.log("WorkspaceRunner: checkout presence checked", presentResult.exitCode);
    if (presentResult.exitCode !== 0) {
      const install = await this.runStage("starting Git installation", () => container.exec(["/bin/sh", "-c", "apt-get update -qq && apt-get install -y -qq git ca-certificates passwd"], { signal: AbortSignal.timeout(120_000) }));
      const installResult = await this.runStage("waiting for Git installation", () => install.output());
      if (installResult.exitCode !== 0) throw new Error(`Could not prepare Git in the task container (exit ${installResult.exitCode}).`);
      const clone = await this.runStage("starting the approved repository clone", () => container.exec(
        ["git", "clone", "--branch", setup.defaultBranch, setup.remote, "/workspace/repo"],
        { env: {
          GIT_CONFIG_COUNT: "2",
          GIT_CONFIG_KEY_0: "http.extraHeader",
          GIT_CONFIG_VALUE_0: `Authorization: Bearer ${token}`,
          GIT_CONFIG_KEY_1: "core.hooksPath",
          GIT_CONFIG_VALUE_1: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "/dev/null",
        }, user: "0:0", signal: AbortSignal.timeout(120_000) },
      ));
      const cloneResult = await this.runStage("waiting for the approved repository clone", () => clone.output());
      if (cloneResult.exitCode !== 0) throw new Error("Could not clone the approved task workspace.");
    }
    const ancestry = await this.runStage("starting the approved-base check", () => container.exec(["git", "-c", "safe.directory=/workspace/repo", "-C", "/workspace/repo", "merge-base", "--is-ancestor", setup.baseCommit, "HEAD"]));
    const ancestryResult = await this.runStage("reading the approved-base check", () => ancestry.output());
    console.log("WorkspaceRunner: base ancestry checked", ancestryResult.exitCode);
    if (ancestryResult.exitCode !== 0) throw new Error("The task checkout does not descend from the approved base commit.");
    const permissions = await this.runStage("starting isolated-account setup", () => container.exec(["/bin/sh", "-c", "if ! id -u gitandem >/dev/null 2>&1; then if ! command -v useradd >/dev/null 2>&1; then apt-get update -qq && apt-get install -y -qq passwd || exit 1; fi; useradd --user-group --create-home --shell /usr/sbin/nologin gitandem || exit 1; fi; uid=$(id -u gitandem) && gid=$(id -g gitandem) || exit 1; if [ ! -f /workspace/.gitandem-owner-ready ]; then chown -R gitandem:gitandem /workspace/repo && touch /workspace/.gitandem-owner-ready; fi; printf '%s:%s' \"$uid\" \"$gid\""], { user: "0:0" }));
    const permissionsResult = await this.runStage("reading isolated-account setup", () => permissions.output());
    console.log("WorkspaceRunner: command user prepared", permissionsResult.exitCode);
    if (permissionsResult.exitCode !== 0) throw new Error(`Could not prepare the isolated task account (exit ${permissionsResult.exitCode}).`);
    const workspaceUser = decode(permissionsResult.stdout, 64).trim();
    if (!/^\d+:\d+$/.test(workspaceUser)) throw new Error("Could not identify the isolated task account.");
    return workspaceUser;
  }

  private async runStage<T>(stage: string, operation: () => Promise<T>): Promise<T> {
    try { return await operation(); }
    catch (error) {
      const detail = error instanceof Error ? error.message : "unknown container error";
      throw new Error(`Container failed while ${stage}: ${detail}`);
    }
  }

}
