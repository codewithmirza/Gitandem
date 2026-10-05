import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import {
  CoordinationError,
  CreateProjectInputSchema,
  PROJECT_CONTRACT_VERSION,
  SubmitWorkInputSchema,
  SubmitWorkResultInputSchema,
  UpdateProjectPlanInputSchema,
  type RepositoryMetadata,
} from "@gitandem/core";
import { z } from "zod";
import type { ProjectCoordinator } from "./coordinator";
import { ArtifactsRepository } from "./artifacts-repository";
import { assessWorkPlan } from "./plan-assessment";
import { clearOAuthStateCookie, clearSessionCookie, createOAuthStateCookie, createSessionCookie, isSameOrigin, readOAuthStateCookie, readSessionCookie, type SessionClaims } from "./auth";
import type { WorkspaceRunner } from "./workspace-runner";
import type { UserDirectory } from "./user-directory";

declare global {
  interface Env { GITANDEM_API_TOKEN?: string; GITANDEM_AGENT_TOKEN?: string; GITANDEM_GITHUB_CLIENT_ID?: string; GITANDEM_GITHUB_CLIENT_SECRET?: string; GITANDEM_SESSION_SECRET?: string; GITANDEM_PUBLIC_URL?: string; USER_DIRECTORY: DurableObjectNamespace<UserDirectory> }
}

export { ProjectCoordinator } from "./coordinator";
export { WorkspaceRunner } from "./workspace-runner";
export { UserDirectory } from "./user-directory";
const coordinator = (env: Env, id: string) => env.COORDINATOR.getByName(id) as DurableObjectStub<ProjectCoordinator>;
const workspaceRunner = (env: Env, id: string) => env.WORKSPACE_RUNNER.getByName(id) as DurableObjectStub<WorkspaceRunner>;
const runnerId = (projectId: string, workId: string) => `${projectId}-${workId}-runner2`;
const json = (data: unknown, status = 200, extraHeaders?: HeadersInit) => {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Gitandem-Contract-Version": String(PROJECT_CONTRACT_VERSION) });
  new Headers(extraHeaders).forEach((value, name) => headers.set(name, value));
  return Response.json(data, { status, headers });
};
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Unexpected error.";
const authorized = (request: Request, env: Env) => Boolean(env.GITANDEM_API_TOKEN && request.headers.get("Authorization") === `Bearer ${env.GITANDEM_API_TOKEN}`);
const authorizedAgent = (request: Request, env: Env) => Boolean(env.GITANDEM_AGENT_TOKEN && request.headers.get("Authorization") === `Bearer ${env.GITANDEM_AGENT_TOKEN}`);

type ProjectCreation = { id: string; name: string; goal: string; constraints?: string[]; decisions?: Array<{ name: string; value: string }>; repositoryMode: "create" | "import"; sourceUrl?: string; sourceBranch?: string; agentName?: string };
type AgentIdentity = { id: string; name: string; projectId: string };

async function createGitandemProject(env: Env, input: ProjectCreation, owner?: { subject: string; login: string }) {
  if (!import.meta.env?.DEV && !owner) throw new Error("A signed-in project owner is required to create a project.");
  if (import.meta.env?.DEV) {
    if (input.repositoryMode === "import") throw new Error("Remote Git import is disabled in local-only development. Use a deployed Worker with Artifacts access.");
    const snapshot = await coordinator(env, input.id).createProject({ id: input.id, name: input.name, goal: input.goal, constraints: input.constraints ?? [], decisions: input.decisions ?? [] }, owner);
    const issued = input.agentName ? await coordinator(env, input.id).createAgentCredential(input.agentName) : undefined;
    const agentAccess = issued ? { ...issued, endpoint: `/mcp/${encodeURIComponent(input.id)}` } : undefined;
    return { snapshot, repositoryAccess: null, ...(agentAccess ? { agentAccess } : {}) };
  }
  if (input.repositoryMode === "import") {
    let source: URL;
    try { source = new URL(input.sourceUrl ?? ""); } catch { throw new Error("Enter a valid public HTTPS Git remote."); }
    if (source.protocol !== "https:" || source.username || source.password || /(^localhost$|\.localhost$|\.local$|^127\.|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.)/i.test(source.hostname)) {
      throw new Error("Repository import requires a public HTTPS Git remote without embedded credentials.");
    }
  }
  const repositories = new ArtifactsRepository(env.ARTIFACTS);
  const created: RepositoryMetadata = input.repositoryMode === "import"
    ? await repositories.import({ name: input.id, sourceUrl: input.sourceUrl!, sourceBranch: input.sourceBranch })
    : await repositories.create({ name: input.id, description: input.name, defaultBranch: "main" });
  try {
    const access = await repositories.issueToken(input.id, "read", 900);
    const snapshot = await coordinator(env, input.id).createProject({ id: input.id, name: input.name, goal: input.goal, repository: created.remote, constraints: input.constraints ?? [], decisions: input.decisions ?? [] }, owner);
    const issued = input.agentName ? await coordinator(env, input.id).createAgentCredential(input.agentName) : undefined;
    const agentAccess = issued ? { ...issued, endpoint: `/mcp/${encodeURIComponent(input.id)}` } : undefined;
    return { snapshot, repositoryAccess: { remote: created.remote, token: access.plaintext, expiresAt: access.expiresAt, defaultBranch: created.defaultBranch, importedFrom: input.repositoryMode === "import" ? input.sourceUrl : undefined }, ...(agentAccess ? { agentAccess } : {}) };
  } catch (error) {
    await repositories.delete(input.id).catch(() => false);
    throw error;
  }
}

async function latestCommit(env: Env, projectId: string) {
  if (import.meta.env?.DEV) return null;
  return new ArtifactsRepository(env.ARTIFACTS).latestCommit(projectId);
}

async function revokeWorkspaceTokens(env: Env, tokens: Array<{ tokenId: string; remote: string }>) {
  const repositories = new ArtifactsRepository(env.ARTIFACTS);
  await Promise.allSettled(tokens.map(async ({ tokenId, remote }) => {
    const repository = parseArtifactsRemote(remote);
    if (repository) await repositories.revokeToken(repository.name, tokenId);
  }));
}

function parseArtifactsRemote(remote: string) {
  let url: URL;
  try { url = new URL(remote); } catch { return null; }
  const parts = url.pathname.split("/").filter(Boolean);
  const fileName = parts[2];
  if (url.protocol !== "https:" || url.username || url.password || !url.hostname.endsWith(".artifacts.cloudflare.net") || parts.length !== 3 || parts[0] !== "git" || !parts[1] || !fileName?.endsWith(".git")) return null;
  const name = fileName.slice(0, -4);
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) return null;
  return { name, namespace: parts[1], host: url.host };
}

async function authorizeWork(env: Env, projectId: string, workId: string, actor: string, actorSubject?: string) {
  const project = coordinator(env, projectId);
  if (import.meta.env?.DEV) {
    return { snapshot: await project.resolveWork(workId, { action: "review", actor, currentBaseCommit: undefined }), workspaceAccess: null };
  }

  if (actorSubject && await project.getMemberRole(actorSubject) !== "owner") throw new Error("Only the project owner can authorize work.");

  const before = actorSubject ? await project.getSnapshotFor(actorSubject) : await project.getSnapshot();
  const intent = before.work.find((item) => item.id === workId);
  if (!intent) throw new CoordinationError("Work intent not found.", "work_intent_not_found");
  if (intent.status !== "ready_for_review") throw new CoordinationError("Resolve this work intent's issues before authorization.", "unresolved_conflict");
  if (!intent.baseCommit) throw new CoordinationError("This work intent has no recorded Git commit to use as its workspace base. Submit it again after the repository has a commit.", "missing_base_commit");

  const workSlug = workId.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 24).replace(/-$/g, "");
  const workspaceName = `task-${workSlug}-${crypto.randomUUID().slice(0, 8)}`;
  const repositories = new ArtifactsRepository(env.ARTIFACTS);
  let forkCreated = false;
  try {
    const canonicalBase = await repositories.latestCommit(projectId);
    if (canonicalBase !== intent.baseCommit) {
      return { snapshot: await project.resolveWork(workId, { action: "review", actor, currentBaseCommit: canonicalBase }, actorSubject), workspaceAccess: null };
    }

    const fork = await repositories.fork({ sourceName: projectId, name: workspaceName, description: `Gitandem workspace for ${intent.outcome}` });
    forkCreated = true;
    const forkBase = await repositories.latestCommit(workspaceName);
    if (forkBase !== intent.baseCommit) throw new CoordinationError("The workspace fork does not match the intent's recorded base commit. No access was granted.", "workspace_base_mismatch");
    await repositories.revokeToken(workspaceName, fork.initialToken);

    const currentBaseCommit = await repositories.latestCommit(projectId);
    const snapshot = await project.resolveWork(workId, {
      action: "review",
      actor,
      currentBaseCommit,
      workspace: { remote: fork.remote, defaultBranch: fork.defaultBranch },
    }, actorSubject);
    const grant = snapshot.grants.find((item) => item.workId === workId && item.status === "active");
    if (!grant) {
      await repositories.delete(workspaceName).catch(() => false);
      return { snapshot, workspaceAccess: null };
    }
    return { snapshot, workspaceAccess: { workId, remote: fork.remote, defaultBranch: fork.defaultBranch, baseCommit: intent.baseCommit } };
  } catch (error) {
    if (forkCreated) await repositories.delete(workspaceName).catch(() => false);
    throw error;
  }
}

async function acceptWork(env: Env, projectId: string, workId: string, actor: string, actorSubject?: string) {
  if (import.meta.env?.DEV) throw new Error("Canonical repository acceptance requires a deployed Artifacts-backed project.");
  const project = coordinator(env, projectId);
  const before = actorSubject ? await project.getSnapshotFor(actorSubject) : await project.getSnapshot();
  const intent = before.work.find((item) => item.id === workId);
  const grant = before.grants.find((item) => item.workId === workId && item.status === "active");
  if (!intent?.result || intent.status !== "submitted" || !grant?.workspace || !intent.baseCommit) throw new CoordinationError("This work has no active submitted result to accept.", "result_not_submitted");
  const repositories = new ArtifactsRepository(env.ARTIFACTS);
  const taskRepository = parseArtifactsRemote(grant.workspace.remote);
  const canonicalRepository = before.project.repository ? parseArtifactsRemote(before.project.repository) : null;
  const taskName = taskRepository?.name;
  if (!taskRepository || !taskName || !canonicalRepository || canonicalRepository.name !== projectId || taskRepository.namespace !== canonicalRepository.namespace || taskRepository.host !== canonicalRepository.host) throw new CoordinationError("The recorded task repository is invalid or belongs to a different Artifacts namespace.", "workspace_remote_invalid");
  const [canonical, canonicalHead, taskHead, baseExists, resultExists] = await Promise.all([
    repositories.inspect(projectId),
    repositories.latestCommit(projectId),
    repositories.latestCommit(taskName),
    repositories.containsCommit(taskName, intent.baseCommit),
    repositories.containsCommit(taskName, intent.result.commit),
  ]);
  if (canonicalHead !== intent.baseCommit && canonicalHead !== intent.result.commit) throw new CoordinationError("The canonical repository changed since this work began. Reconcile against the new base before accepting.", "stale_base");
  if (taskHead !== intent.result.commit || !baseExists || !resultExists) throw new CoordinationError("The submitted commit is not the current task-fork head based on the approved commit.", "invalid_result_commit");

  const { snapshot } = await project.prepareAcceptance(workId, before.project.revision, intent.result.commit, actorSubject);
  const currentGrant = snapshot.grants.find((item) => item.workId === workId && item.status === "active");
  if (!currentGrant?.workspace) {
    await project.cancelAcceptance(workId, intent.result.commit);
    throw new CoordinationError("The work grant changed before acceptance.", "workspace_revoked");
  }
  const issued: Array<{ name: string; id: string }> = [];
  try {
    const runner = workspaceRunner(env, runnerId(projectId, workId));
    const taskToken = await repositories.issueToken(taskName, "write", 900);
    issued.push({ name: taskName, id: taskToken.id });
    if (!await project.registerWorkspaceToken(workId, intent.agent, before.project.revision, taskToken.id)) throw new CoordinationError("The task grant changed before acceptance.", "workspace_revoked");
    const taskPush = await runner.pushCommit(
      { remote: currentGrant.workspace.remote, defaultBranch: currentGrant.workspace.defaultBranch, baseCommit: intent.baseCommit },
      currentGrant.workspace.remote,
      currentGrant.workspace.defaultBranch,
      intent.result.commit,
      taskToken.plaintext,
    );
    if (taskPush.exitCode !== 0) throw new CoordinationError(`Could not confirm the task result in its fork: ${taskPush.stderr || taskPush.stdout}`, "workspace_commit_mismatch");

    const canonicalToken = await repositories.issueToken(projectId, "write", 900);
    issued.push({ name: projectId, id: canonicalToken.id });
    if (!await project.registerWorkspaceToken(workId, intent.agent, before.project.revision, canonicalToken.id)) throw new CoordinationError("The task grant changed before canonical acceptance.", "workspace_revoked");
    let canonicalPushExitCode = 0;
    if (canonicalHead !== intent.result.commit) {
      const push = await runner.pushCommit(
        { remote: currentGrant.workspace.remote, defaultBranch: currentGrant.workspace.defaultBranch, baseCommit: intent.baseCommit },
        canonical.remote,
        canonical.defaultBranch,
        intent.result.commit,
        canonicalToken.plaintext,
      );
      if (push.exitCode !== 0) throw new CoordinationError(`Gitandem could not fast-forward the canonical branch: ${push.stderr || push.stdout || `exit ${push.exitCode}`}`, "canonical_push_failed");
      canonicalPushExitCode = push.exitCode;
    }
    const acceptedHead = await repositories.latestCommit(projectId);
    if (acceptedHead !== intent.result.commit) throw new CoordinationError("The canonical branch moved during acceptance. No accepted result was recorded.", "canonical_head_mismatch");
    await project.recordWorkspaceCommand(actor, workId, "accept", canonicalPushExitCode);
    return await project.completeAcceptance(workId, before.project.revision, intent.result.commit, actor);
  } catch (error) {
    await project.cancelAcceptance(workId, intent.result.commit).catch(() => undefined);
    throw error;
  } finally {
    await Promise.allSettled(issued.map(({ name, id }) => repositories.revokeToken(name, id)));
  }
}

const userDirectory = (env: Env, subject: string) => env.USER_DIRECTORY.getByName(subject) as DurableObjectStub<UserDirectory>;

function publicUrl(env: Env): URL | null {
  try {
    const url = new URL(env.GITANDEM_PUBLIC_URL ?? "");
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url;
  } catch { return null; }
}

function githubAuthConfigured(env: Env): boolean {
  return Boolean(env.GITANDEM_GITHUB_CLIENT_ID && env.GITANDEM_GITHUB_CLIENT_SECRET && env.GITANDEM_SESSION_SECRET && env.GITANDEM_SESSION_SECRET.length >= 32 && publicUrl(env));
}

async function currentUser(request: Request, env: Env): Promise<SessionClaims | null> {
  if (!env.GITANDEM_SESSION_SECRET) return null;
  const claims = await readSessionCookie(request.headers.get("Cookie"), env.GITANDEM_SESSION_SECRET);
  if (!claims || !await userDirectory(env, claims.subject).hasSession(claims.sessionId)) return null;
  return claims;
}

async function authRoute(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === "/api/me" && request.method === "GET") {
    const user = await currentUser(request, env);
    return json({ user: user ? { subject: user.subject, login: user.login } : null });
  }
  if (url.pathname === "/auth/github/start" && request.method === "GET") {
    if (!githubAuthConfigured(env)) return json({ error: "GitHub sign-in is not configured for this deployment." }, 503);
    const attempt = await createOAuthStateCookie(env.GITANDEM_SESSION_SECRET!);
    const callback = new URL("/auth/github/callback", publicUrl(env)!);
    const authorize = new URL("https://github.com/login/oauth/authorize");
    authorize.searchParams.set("client_id", env.GITANDEM_GITHUB_CLIENT_ID!);
    authorize.searchParams.set("redirect_uri", callback.toString());
    authorize.searchParams.set("state", attempt.state);
    authorize.searchParams.set("code_challenge", attempt.challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    return new Response(null, { status: 302, headers: { Location: authorize.toString(), "Set-Cookie": attempt.cookie, "Cache-Control": "no-store" } });
  }
  if (url.pathname === "/auth/github/callback" && request.method === "GET") {
    const clearState = clearOAuthStateCookie();
    if (!githubAuthConfigured(env)) return json({ error: "GitHub sign-in is not configured for this deployment." }, 503, { "Set-Cookie": clearState });
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) return json({ error: "GitHub did not return a valid sign-in response." }, 400, { "Set-Cookie": clearState });
    const attempt = await readOAuthStateCookie(request.headers.get("Cookie"), state, env.GITANDEM_SESSION_SECRET!);
    if (!attempt) return json({ error: "Sign-in expired or could not be verified. Start again from Gitandem." }, 400, { "Set-Cookie": clearState });
    const callback = new URL("/auth/github/callback", publicUrl(env)!);
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "Gitandem" },
      body: JSON.stringify({ client_id: env.GITANDEM_GITHUB_CLIENT_ID, client_secret: env.GITANDEM_GITHUB_CLIENT_SECRET, code, redirect_uri: callback.toString(), code_verifier: attempt.verifier }),
    });
    if (!tokenResponse.ok) return json({ error: "GitHub could not complete sign-in. Start again." }, 502, { "Set-Cookie": clearState });
    const tokenPayload = await tokenResponse.json() as { access_token?: unknown; error?: unknown };
    if (typeof tokenPayload.access_token !== "string") return json({ error: "GitHub rejected the sign-in exchange." }, 502, { "Set-Cookie": clearState });
    const profileResponse = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${tokenPayload.access_token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Gitandem" } });
    if (!profileResponse.ok) return json({ error: "GitHub could not verify this account." }, 502, { "Set-Cookie": clearState });
    const profile = await profileResponse.json() as { id?: unknown; login?: unknown };
    const githubId = typeof profile.id === "number" && Number.isSafeInteger(profile.id) && profile.id > 0 ? String(profile.id)
      : typeof profile.id === "string" && /^\d+$/.test(profile.id) ? profile.id : null;
    if (!githubId || typeof profile.login !== "string" || !profile.login.trim()) return json({ error: "GitHub returned an invalid account profile." }, 502, { "Set-Cookie": clearState });
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const claims: SessionClaims = { sessionId: crypto.randomUUID() + crypto.randomUUID(), subject: `github:${githubId}`, login: profile.login.trim(), expiresAt };
    await userDirectory(env, claims.subject).createSession(claims.sessionId, expiresAt);
    const sessionCookie = await createSessionCookie(claims, env.GITANDEM_SESSION_SECRET!);
    const headers = new Headers({ Location: "/", "Cache-Control": "no-store" });
    headers.append("Set-Cookie", `${sessionCookie.split(";")[0]}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
    headers.append("Set-Cookie", clearState);
    return new Response(null, { status: 302, headers });
  }
  if (url.pathname === "/auth/logout" && request.method === "POST") {
    if (!isSameOrigin(request)) return json({ error: "Sign-out request must come from this site." }, 403);
    const user = await currentUser(request, env);
    if (user) await userDirectory(env, user.subject).revokeSession(user.sessionId);
    return new Response(JSON.stringify({ signedOut: true }), { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Set-Cookie": clearSessionCookie() } });
  }
  return null;
}

async function api(request: Request, env: Env, user: SessionClaims | null) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  try {
    const body = await request.json().catch(() => ({})) as Record<string, any>;
    if (request.method === "POST" && path === "/api/projects") {
      const parsed = CreateProjectInputSchema.safeParse({ id: body.id, name: body.name, goal: body.goal, constraints: body.constraints ?? [] });
      if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Project details are invalid." }, 400);
      const mode = body.repositoryMode === "import" ? "import" : "create";
      return json(await createGitandemProject(env, { ...parsed.data, repositoryMode: mode, sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl : undefined, sourceBranch: typeof body.sourceBranch === "string" ? body.sourceBranch : undefined, agentName: typeof body.agentName === "string" ? body.agentName : undefined }, user ? { subject: user.subject, login: user.login } : undefined));
    }
    const match = path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
    if (!match) return json({ error: "Route not found." }, 404);
    const [, id, resource = ""] = match;
    const project = coordinator(env, id);
    if (request.method === "GET" && !resource) return json(user ? await project.getSnapshotFor(user.subject) : await project.getSnapshot());
    if (resource === "members" && request.method === "GET") {
      if (!user) return json({ error: "Member management requires a signed-in owner." }, 403);
      return json({ members: await project.listMembers(user.subject) });
    }
    if (resource === "members" && request.method === "POST") {
      if (!user) return json({ error: "Member management requires a signed-in owner." }, 403);
      const input = z.object({ subject: z.string().regex(/^github:\d+$/), login: z.string().trim().min(1).max(120), role: z.enum(["editor", "viewer"]) }).safeParse(body);
      if (!input.success) return json({ error: "Provide a GitHub identity, login, and editor or viewer role." }, 400);
      return json({ member: await project.addMember(user.subject, input.data, input.data.role) }, 201);
    }
    const memberAction = resource.match(/^members\/(github%3A)?(\d+)$/i);
    if (request.method === "DELETE" && memberAction) {
      if (!user) return json({ error: "Member management requires a signed-in owner." }, 403);
      return json({ removed: await project.removeMember(user.subject, `github:${memberAction[2]}`) });
    }
    if (resource === "agent-credentials" && request.method === "GET") {
      if (user) return json({ credentials: await project.listAgentCredentials(user.subject) });
      await project.getSnapshot();
      return json({ credentials: await project.listAgentCredentials() });
    }
    if (resource === "agent-credentials" && request.method === "POST") {
      if (user) await project.getSnapshotFor(user.subject); else await project.getSnapshot();
      const name = z.string().trim().min(1).max(120).safeParse(body.agent);
      if (!name.success) return json({ error: "Provide an agent name between 1 and 120 characters." }, 400);
      const credential = await project.createAgentCredential(name.data, user?.subject);
      return json({ ...credential, endpoint: `/mcp/${encodeURIComponent(id)}` }, 201);
    }
    const credentialAction = resource.match(/^agent-credentials\/([^/]+)$/);
    if (request.method === "DELETE" && credentialAction) {
      const revoked = await project.revokeAgentCredential(credentialAction[1]!, user?.subject);
      return revoked ? json({ revoked: true }) : json({ error: "Agent credential not found or already revoked." }, 404);
    }
    if (request.method === "POST" && resource === "repository-token") {
      if (user) await project.getSnapshotFor(user.subject); else await project.getSnapshot();
      if (import.meta.env?.DEV) return json({ error: "Git access tokens require a deployed Artifacts-backed project." }, 503);
      const repositories = new ArtifactsRepository(env.ARTIFACTS);
      const [info, token] = await Promise.all([repositories.inspect(id), repositories.issueToken(id, "read", 900)]);
      return json({ remote: info.remote, token: token.plaintext, expiresAt: token.expiresAt });
    }
    if (request.method === "PUT" && resource === "plan") {
      const parsed = UpdateProjectPlanInputSchema.safeParse({ ...body, actor: user?.login ?? body.actor ?? "Project owner" });
      if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Plan details are invalid." }, 400);
      const updated = await project.updatePlan(parsed.data, user?.subject);
      await revokeWorkspaceTokens(env, updated.workspaceTokens);
      return json(updated.snapshot);
    }
    if (request.method === "POST" && resource === "work-intents") {
      const parsed = SubmitWorkInputSchema.safeParse({ ...body, agent: body.agent ?? "Agent", baseCommit: await latestCommit(env, id) ?? undefined });
      if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Work intent is invalid." }, 400);
      if (user) {
        const role = await project.getMemberRole(user.subject);
        if (role !== "owner" && role !== "editor") return json({ error: "Only project members who can contribute may propose work." }, 403);
      }
      return json(await project.submitWork(parsed.data));
    }
    const assessment = resource.match(/^work-intents\/([^/]+)\/assessment$/);
    if (request.method === "POST" && assessment) {
      const snapshot = user ? await project.getSnapshotFor(user.subject) : await project.getSnapshot();
      const intent = snapshot.work.find((item) => item.id === assessment[1]);
      if (!intent || !["needs_resolution", "ready_for_review", "authorized", "in_progress", "submitted", "needs_alignment"].includes(intent.status)) {
        throw new CoordinationError("Only active work proposals can be assessed.", "work_intent_not_found");
      }
      try {
        return json(await assessWorkPlan(snapshot, intent.id, env.AI));
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const category = /model.{0,30}(not found|unavailable|unsupported)/i.test(message) ? "model unavailable"
          : /(401|403|unauthori[sz]ed|forbidden|authentication)/i.test(message) ? "authentication rejected"
            : /(429|rate.?limit|quota|credits|billing)/i.test(message) ? "usage limit or billing restriction"
              : /(400|bad request|invalid|validation|schema)/i.test(message) ? "request rejected"
                : "provider error";
        const diagnostic = error instanceof z.ZodError
          ? `Invalid model response fields: ${error.issues.map((issue) => issue.path.join(".")).join(", ")}`
          : error instanceof Error
            ? `${error.name} (${category})${typeof error === "object" && "status" in error ? ` status=${String(error.status)}` : ""}${typeof error === "object" && "code" in error ? ` code=${String(error.code)}` : ""}`
            : "Unknown error";
        console.error(`Workers AI plan assessment failed (${diagnostic}).`);
        return json({ error: "Gitandem could not assess this plan right now. The proposal and project plan are unchanged." }, 502);
      }
    }
    const action = resource.match(/^work-intents\/([^/]+)\/(review|reject|accept)$/);
    if (request.method === "POST" && action) {
      const actor = user?.login ?? body.actor ?? "Project owner";
      if (action[2] === "review") return json(await authorizeWork(env, id, action[1]!, actor, user?.subject));
      if (action[2] === "accept") return json(await acceptWork(env, id, action[1]!, actor, user?.subject));
      const rejected = await project.rejectWork(action[1]!, actor, user?.subject);
      await revokeWorkspaceTokens(env, rejected.workspaceTokens);
      return json(rejected.snapshot);
    }
    return json({ error: "Route not found." }, 404);
  } catch (error) {
    const message = errorMessage(error);
    const remoteCoordinationConflict = /only work that is ready for review|resolve the listed .*before review|uses an older plan|already being accepted|no active authorized workspace/i.test(message);
    const status = error instanceof CoordinationError
      ? error.code === "project_not_found" || error.code === "work_intent_not_found" ? 404 : 409
      : remoteCoordinationConflict ? 409 : /not a member|permission to do this|signed-in owner/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json({ error: message }, status);
  }
}

function createServer(env: Env, identity: AgentIdentity | null) {
  const server = new McpServer({ name: "gitandem", version: "0.2.0" });
  const toolText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
  if (identity === null) {
    server.registerTool("create_project", { description: "Create a project and canonical repository. Set agentName to also create a one-time, project-scoped MCP credential for the first agent.", inputSchema: { ...CreateProjectInputSchema.shape, repositoryMode: z.enum(["create", "import"]).default("create"), sourceUrl: z.string().optional(), sourceBranch: z.string().optional(), agentName: z.string().trim().min(1).max(120).optional() } }, async (input) => toolText(await createGitandemProject(env, input)));
    return server;
  }
  const projectForIdentity = (projectId: string) => {
    if (projectId !== identity.projectId) throw new CoordinationError("This MCP credential only grants access to its own project.", "agent_credential_scope_mismatch");
    return projectId;
  };
  server.registerTool("get_project_context", { description: "Read the approved project goal and plan plus a limited summary of active commitments. Agent assumptions and private working context are not included.", inputSchema: { projectId: z.string().min(1) } }, async ({ projectId }) => {
    projectForIdentity(projectId);
    const snapshot = await coordinator(env, projectId).getSnapshot();
    return toolText({ contractVersion: PROJECT_CONTRACT_VERSION, project: snapshot.project, plan: snapshot.plan, activeCommitments: snapshot.work.filter((work) => ["needs_resolution", "ready_for_review", "authorized", "in_progress", "submitted", "needs_alignment"].includes(work.status)).map(({ id, agent, outcome, scope, interfaces, designChoices, issues, status, planRevision, baseCommit, result }) => ({ id, agent, outcome, scope, interfaces, designChoices, issues, status, planRevision, baseCommit, result })) });
  });
  server.registerTool("run_workspace_command", { description: "Run an argv command inside the isolated Linux container for an owner-authorized work intent. First use get_project_context, then propose work and ask the owner to approve it. Git credentials stay inside Gitandem; use submit_work_result to push and submit a commit.", inputSchema: { projectId: z.string().min(1), workId: z.string().min(1), argv: z.array(z.string().max(2000)).min(1).max(32) } }, async ({ projectId, workId, argv }) => {
    projectForIdentity(projectId);
    const { id: agentIdentityId, name: agent } = identity;
    if (import.meta.env?.DEV) throw new Error("Task containers require a deployed Cloudflare Worker.");
    const snapshot = await coordinator(env, projectId).getSnapshot();
    const intent = snapshot.work.find((work) => work.id === workId);
    const grant = snapshot.grants.find((item) => item.workId === workId && item.status === "active");
    if (!intent || !grant || !grant.workspace || intent.status !== "authorized" || grant.planRevision !== snapshot.project.revision || intent.planRevision !== snapshot.project.revision) {
      throw new CoordinationError("There is no active authorized workspace for this work intent.", "workspace_not_authorized");
    }
    if (intent.agent !== agent || grant.agent !== agent || (intent.agentIdentityId && intent.agentIdentityId !== agentIdentityId)) throw new CoordinationError("This credential does not belong to the approved work intent.", "agent_mismatch");
    const repository = parseArtifactsRemote(grant.workspace.remote);
    const canonicalRepository = snapshot.project.repository ? parseArtifactsRemote(snapshot.project.repository) : null;
    const repositoryName = repository?.name;
    if (!repository || !repositoryName || !canonicalRepository || canonicalRepository.name !== projectId || repository.namespace !== canonicalRepository.namespace || repository.host !== canonicalRepository.host) throw new CoordinationError("The recorded workspace remote is invalid.", "workspace_remote_invalid");
    const repositories = new ArtifactsRepository(env.ARTIFACTS);
    const token = await repositories.issueToken(repositoryName, "write", 900);
    const recorded = await coordinator(env, projectId).registerWorkspaceToken(workId, agent, grant.planRevision, token.id);
    if (!recorded) {
      await repositories.revokeToken(repositoryName, token.id).catch(() => false);
      throw new CoordinationError("The work grant changed while access was being issued. Request access again after approval.", "workspace_revoked");
    }
    try {
      let result: Awaited<ReturnType<WorkspaceRunner["runCommand"]>>;
      try {
        const runner = workspaceRunner(env, runnerId(projectId, workId));
        console.log("Calling authorized workspace runner");
        console.log("Authorized workspace runner ping", await runner.ping());
        result = await runner.runCommand(
          { remote: grant.workspace.remote, defaultBranch: grant.workspace.defaultBranch, baseCommit: grant.baseCommit! },
          argv,
          token.plaintext,
        );
        console.log("Authorized workspace runner returned", result.exitCode);
      } catch (error) {
        console.error("Authorized workspace command failed", errorMessage(error));
        return toolText({ workId, error: "Cloudflare could not run the command in the authorized workspace.", detail: errorMessage(error), tokenRevoked: true });
      }
      let activityRecorded = true;
      try { await coordinator(env, projectId).recordWorkspaceCommand(agent, workId, argv[0] ?? "command", result.exitCode); }
      catch (error) { activityRecorded = false; console.error("Could not record workspace command activity", errorMessage(error)); }
      return toolText({ workId, exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr, activityRecorded });
    } finally {
      await repositories.revokeToken(repositoryName, token.id).catch(() => false);
    }
  });
  server.registerTool("submit_work_result", { description: "Submit a finished commit for an authorized work intent. Gitandem safely pushes the current checkout commit to the task fork using a hidden short-lived credential, verifies the fork head and approved base, and records your summary and evidence. Only the owner can accept it into the canonical repository.", inputSchema: { projectId: z.string().min(1), workId: z.string().min(1), ...SubmitWorkResultInputSchema.shape } }, async ({ projectId, workId, ...input }) => {
    projectForIdentity(projectId);
    const { id: agentIdentityId, name: agent } = identity;
    if (import.meta.env?.DEV) throw new Error("Task result verification requires a deployed Artifacts-backed project.");
    const snapshot = await coordinator(env, projectId).getSnapshot();
    const intent = snapshot.work.find((work) => work.id === workId);
    const grant = snapshot.grants.find((item) => item.workId === workId && item.status === "active");
    if (!intent || !grant?.workspace || grant.planRevision !== snapshot.project.revision || intent.planRevision !== snapshot.project.revision) throw new CoordinationError("There is no active authorized workspace for this work intent.", "workspace_not_authorized");
    if (intent.agent !== agent || grant.agent !== agent || (intent.agentIdentityId && intent.agentIdentityId !== agentIdentityId)) throw new CoordinationError("This credential does not belong to the approved work intent.", "agent_mismatch");
    const repository = parseArtifactsRemote(grant.workspace.remote);
    const canonicalRepository = snapshot.project.repository ? parseArtifactsRemote(snapshot.project.repository) : null;
    const repositoryName = repository?.name;
    if (!repository || !repositoryName || !canonicalRepository || canonicalRepository.name !== projectId || repository.namespace !== canonicalRepository.namespace || repository.host !== canonicalRepository.host) throw new CoordinationError("The recorded workspace remote is invalid.", "workspace_remote_invalid");
    const repositories = new ArtifactsRepository(env.ARTIFACTS);
    const project = coordinator(env, projectId);
    const token = await repositories.issueToken(repositoryName, "write", 900);
    if (!await project.registerWorkspaceToken(workId, agent, grant.planRevision, token.id)) {
      await repositories.revokeToken(repositoryName, token.id).catch(() => false);
      throw new CoordinationError("The work grant changed before result submission.", "workspace_revoked");
    }
    try {
      const pushed = await workspaceRunner(env, runnerId(projectId, workId)).pushCommit(
        { remote: grant.workspace.remote, defaultBranch: grant.workspace.defaultBranch, baseCommit: grant.baseCommit! },
        grant.workspace.remote,
        grant.workspace.defaultBranch,
        input.commit,
        token.plaintext,
      );
      if (pushed.exitCode !== 0) throw new CoordinationError(`Could not push the submitted commit to its task fork: ${pushed.stderr || pushed.stdout}`, "invalid_result_commit");
      const [head, containsBase, containsResult] = await Promise.all([repositories.latestCommit(repositoryName), repositories.containsCommit(repositoryName, grant.baseCommit!), repositories.containsCommit(repositoryName, input.commit)]);
      if (head !== input.commit || !containsBase || !containsResult || input.commit === grant.baseCommit) throw new CoordinationError("The submitted commit must be a new task-fork head based on the approved commit.", "invalid_result_commit");
      return toolText(await project.submitResult(workId, input));
    } finally {
      await repositories.revokeToken(repositoryName, token.id).catch(() => false);
    }
  });
  server.registerTool("propose_work", { description: "Before coding, submit intended outcome, scope, assumptions, interfaces, named design choices, dependencies, and acceptance evidence. Gitandem compares declarations with the shared plan and other active intents. The credential sets the agent identity; caller-supplied agent names are not accepted.", inputSchema: { projectId: z.string().min(1), ...SubmitWorkInputSchema.omit({ baseCommit: true, agent: true, agentIdentityId: true }).shape } }, async ({ projectId, ...input }) => {
    projectForIdentity(projectId);
    return toolText(await coordinator(env, projectId).submitWork({ ...input, agent: identity.name, agentIdentityId: identity.id, baseCommit: await latestCommit(env, projectId) ?? undefined }));
  });
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    const authResponse = await authRoute(request, env);
    if (authResponse) return authResponse;
    if (url.pathname === "/mcp") {
      if (!authorizedAgent(request, env)) return json({ error: "Unauthorized agent connection." }, 401);
      return createMcpHandler(() => createServer(env, null), { route: "/mcp" })(request, env, ctx);
    }
    const projectMcp = url.pathname.match(/^\/mcp\/([a-z0-9][a-z0-9-]{1,62})$/);
    if (projectMcp) {
      const projectId = projectMcp[1]!;
      const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      const credential = await coordinator(env, projectId).authenticateAgentCredential(token);
      if (!credential) return json({ error: "Unauthorized project agent credential." }, 401);
      const identity = { ...credential, projectId };
      return createMcpHandler(() => createServer(env, identity), { route: url.pathname })(request, env, ctx);
    }
    if (url.pathname.startsWith("/api/")) {
      const user = await currentUser(request, env);
      const developmentOwner = import.meta.env?.DEV && authorized(request, env);
      if (!user && !developmentOwner) return json({ error: "Sign in with GitHub to use Gitandem." }, 401);
      if (request.method !== "GET" && !isSameOrigin(request)) return json({ error: "This request must come from Gitandem." }, 403);
      return api(request, env, user);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
