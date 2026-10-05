import { DurableObject } from "cloudflare:workers";
import { CoordinationService, type CreateProjectInput, type ResolveWorkInput, type SubmitWorkInput, type UpdateProjectPlanInput } from "@gitandem/core";
import { SqliteCoordinationStore } from "./sqlite-store";

export class ProjectCoordinator extends DurableObject<Env> {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY, name TEXT NOT NULL, repository TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS plan (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS work_intents (id TEXT PRIMARY KEY, agent TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, reasons TEXT NOT NULL, plan_revision INTEGER NOT NULL, base_commit TEXT, created_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, agent TEXT NOT NULL, plan_revision INTEGER NOT NULL, base_commit TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)");
      try { sql.exec("ALTER TABLE grants ADD COLUMN workspace TEXT"); } catch { /* Existing instances already have the column. */ }
      sql.exec("CREATE TABLE IF NOT EXISTS workspace_tokens (token_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS acceptance_locks (work_id TEXT PRIMARY KEY, plan_revision INTEGER NOT NULL, result_commit TEXT NOT NULL, created_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)");
    });
  }

  private async service() {
    await this.ready;
    return new CoordinationService(new SqliteCoordinationStore(this.ctx.storage.sql));
  }

  async createProject(input: CreateProjectInput) { return (await this.service()).createProject(input); }
  async getSnapshot() { return (await this.service()).getSnapshot(); }
  async updatePlan(input: UpdateProjectPlanInput) {
    const service = await this.service();
    const lock = this.ctx.storage.sql.exec<{ work_id: string }>("SELECT work_id FROM acceptance_locks WHERE created_at > ? LIMIT 1", new Date(Date.now() - 5 * 60_000).toISOString()).toArray()[0];
    if (lock) throw new Error("A result is being accepted. Try the plan update again in a few minutes.");
    this.ctx.storage.sql.exec("DELETE FROM acceptance_locks");
    const current = service.getSnapshot();
    const grants = new Map(current.grants.map((grant) => [grant.id, grant]));
    const workspaceTokens = this.ctx.storage.sql.exec<{ token_id: string; grant_id: string }>("SELECT wt.token_id, wt.grant_id FROM workspace_tokens wt JOIN grants g ON g.id = wt.grant_id WHERE g.status = 'active'").toArray().flatMap((token) => {
      const grant = grants.get(token.grant_id);
      return grant?.workspace ? [{ tokenId: token.token_id, remote: grant.workspace.remote }] : [];
    });
    const snapshot = service.updatePlan(input);
    return { snapshot, workspaceTokens };
  }
  async submitWork(input: SubmitWorkInput) { return (await this.service()).submitWork(input); }
  async resolveWork(id: string, input: ResolveWorkInput) {
    const lock = this.ctx.storage.sql.exec<{ work_id: string }>("SELECT work_id FROM acceptance_locks WHERE work_id = ? AND created_at > ?", id, new Date(Date.now() - 5 * 60_000).toISOString()).toArray()[0];
    if (lock) throw new Error("This result is being accepted. Try again after acceptance finishes.");
    return (await this.service()).resolveWork(id, input);
  }
  async rejectWork(id: string, actor: string) {
    const service = await this.service();
    const before = service.getSnapshot();
    const grant = before.grants.find((item) => item.workId === id && item.status === "active");
    const tokens = grant
      ? this.ctx.storage.sql.exec<{ token_id: string }>("SELECT token_id FROM workspace_tokens WHERE grant_id = ?", grant.id).toArray()
      : [];
    const snapshot = service.resolveWork(id, { action: "reject", actor });
    return {
      snapshot,
      workspaceTokens: grant?.workspace
        ? tokens.map(({ token_id }) => ({ tokenId: token_id, remote: grant.workspace!.remote }))
        : [],
    };
  }
  async submitResult(id: string, input: Parameters<CoordinationService["submitResult"]>[1]) {
    const lock = this.ctx.storage.sql.exec<{ work_id: string }>("SELECT work_id FROM acceptance_locks WHERE work_id = ?", id).toArray()[0];
    if (lock) throw new Error("This result is already being accepted.");
    return (await this.service()).submitResult(id, input);
  }
  async prepareAcceptance(id: string, expectedRevision: number, resultCommit: string) {
    const snapshot = await (await this.service()).getSnapshot();
    const intent = snapshot.work.find((item) => item.id === id);
    if (!intent || intent.status !== "submitted" || intent.result?.commit !== resultCommit) throw new Error("The submitted result changed before acceptance.");
    if (snapshot.project.revision !== expectedRevision || intent.planRevision !== expectedRevision) throw new Error("The project plan changed before acceptance.");
    const sql = this.ctx.storage.sql;
    const now = Date.now();
    const existing = sql.exec<{ created_at: string }>("SELECT created_at FROM acceptance_locks WHERE work_id = ?", id).toArray()[0];
    if (existing && now - Date.parse(existing.created_at) < 5 * 60_000) throw new Error("This result is already being accepted.");
    sql.exec("DELETE FROM acceptance_locks WHERE work_id = ?", id);
    sql.exec("INSERT INTO acceptance_locks (work_id, plan_revision, result_commit, created_at) VALUES (?, ?, ?, ?)", id, expectedRevision, resultCommit, new Date(now).toISOString());
    return { intent, snapshot };
  }
  async completeAcceptance(id: string, expectedRevision: number, resultCommit: string, actor: string) {
    const lock = this.ctx.storage.sql.exec<{ plan_revision: number; result_commit: string }>("SELECT plan_revision, result_commit FROM acceptance_locks WHERE work_id = ?", id).toArray()[0];
    if (!lock || lock.plan_revision !== expectedRevision || lock.result_commit !== resultCommit) throw new Error("The acceptance lock expired or changed. Retry the acceptance.");
    const snapshot = await (await this.service()).acceptResult(id, actor, resultCommit);
    this.ctx.storage.sql.exec("DELETE FROM acceptance_locks WHERE work_id = ?", id);
    return snapshot;
  }
  async cancelAcceptance(id: string, resultCommit: string) {
    this.ctx.storage.sql.exec("DELETE FROM acceptance_locks WHERE work_id = ? AND result_commit = ?", id, resultCommit);
  }
  async resolveWorkWithToken(id: string, input: ResolveWorkInput, tokenId: string) {
    const snapshot = (await this.service()).resolveWork(id, input);
    const grant = snapshot.grants.find((item) => item.workId === id && item.status === "active");
    if (grant) this.ctx.storage.sql.exec("INSERT INTO workspace_tokens (token_id, grant_id) VALUES (?, ?)", tokenId, grant.id);
    return snapshot;
  }
  async registerWorkspaceToken(workId: string, agent: string, expectedRevision: number, tokenId: string) {
    const snapshot = (await this.service()).getSnapshot();
    const intent = snapshot.work.find((item) => item.id === workId);
    const grant = snapshot.grants.find((item) => item.workId === workId && item.status === "active");
    if (!intent || !["authorized", "in_progress", "submitted"].includes(intent.status) || intent.agent !== agent || !grant?.workspace || grant.planRevision !== expectedRevision || snapshot.project.revision !== expectedRevision) return false;
    this.ctx.storage.sql.exec("INSERT INTO workspace_tokens (token_id, grant_id) VALUES (?, ?)", tokenId, grant.id);
    return true;
  }
  async recordWorkspaceCommand(agent: string, workId: string, executable: string, exitCode: number) {
    await this.service();
    this.ctx.storage.sql.exec(
      "INSERT INTO activity (actor, detail, created_at) VALUES (?, ?, ?)",
      agent,
      `Ran ${executable.slice(0, 32)} in authorized work ${workId.slice(0, 8)} (exit ${exitCode}).`,
      new Date().toISOString(),
    );
  }
}
