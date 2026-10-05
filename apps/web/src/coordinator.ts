import { DurableObject } from "cloudflare:workers";
import { CoordinationService, type CreateProjectInput, type ResolveWorkInput, type SubmitWorkInput, type UpdateProjectPlanInput } from "@gitandem/core";
import { SqliteCoordinationStore } from "./sqlite-store";

const credentialHash = async (token: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
};

const createCredentialToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = String.fromCharCode(...bytes);
  return `gta_${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
};

export type ProjectMemberRole = "owner" | "editor" | "viewer";
export type ProjectIdentity = { subject: string; login: string };
export type ProjectMember = ProjectIdentity & { role: ProjectMemberRole; createdAt: string };

export class ProjectCoordinator extends DurableObject<Env> {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec("CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY, name TEXT NOT NULL, repository TEXT, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS project_members (subject TEXT PRIMARY KEY, login TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')), created_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS plan (id INTEGER PRIMARY KEY CHECK (id = 1), body TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS work_intents (id TEXT PRIMARY KEY, agent TEXT NOT NULL, details TEXT NOT NULL, status TEXT NOT NULL, reasons TEXT NOT NULL, plan_revision INTEGER NOT NULL, base_commit TEXT, created_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS grants (id TEXT PRIMARY KEY, work_id TEXT NOT NULL, agent TEXT NOT NULL, plan_revision INTEGER NOT NULL, base_commit TEXT, status TEXT NOT NULL, created_at TEXT NOT NULL)");
      try { sql.exec("ALTER TABLE grants ADD COLUMN workspace TEXT"); } catch { /* Existing instances already have the column. */ }
      sql.exec("CREATE TABLE IF NOT EXISTS workspace_tokens (token_id TEXT PRIMARY KEY, grant_id TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS agent_credentials (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, revoked_at TEXT)");
      sql.exec("CREATE TABLE IF NOT EXISTS acceptance_locks (work_id TEXT PRIMARY KEY, plan_revision INTEGER NOT NULL, result_commit TEXT NOT NULL, created_at TEXT NOT NULL)");
      sql.exec("CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)");
    });
  }

  private async service() {
    await this.ready;
    return new CoordinationService(new SqliteCoordinationStore(this.ctx.storage.sql));
  }

  async createProject(input: CreateProjectInput, owner?: ProjectIdentity) {
    const snapshot = (await this.service()).createProject(input);
    if (owner) this.ctx.storage.sql.exec("INSERT INTO project_members (subject, login, role, created_at) VALUES (?, ?, 'owner', ?)", owner.subject, owner.login, new Date().toISOString());
    return snapshot;
  }
  async getSnapshot() { return (await this.service()).getSnapshot(); }
  async getSnapshotFor(subject: string) {
    const service = await this.service();
    this.requireRole(subject, "viewer");
    return service.getSnapshot();
  }
  async getMemberRole(subject: string): Promise<ProjectMemberRole | null> {
    await this.service();
    return this.ctx.storage.sql.exec<{ role: ProjectMemberRole }>("SELECT role FROM project_members WHERE subject = ?", subject).toArray()[0]?.role ?? null;
  }
  async listMembers(actor: string): Promise<ProjectMember[]> {
    await this.service();
    this.requireRole(actor, "viewer");
    return this.ctx.storage.sql.exec<{ subject: string; login: string; role: ProjectMemberRole; created_at: string }>("SELECT subject, login, role, created_at FROM project_members ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'editor' THEN 1 ELSE 2 END, login COLLATE NOCASE").toArray().map(({ subject, login, role, created_at }) => ({ subject, login, role, createdAt: created_at }));
  }
  async addMember(actor: string, member: ProjectIdentity, role: Exclude<ProjectMemberRole, "owner">): Promise<ProjectMember> {
    await this.service();
    this.requireRole(actor, "owner");
    if (!member.subject.startsWith("github:") || !member.login.trim() || member.login.length > 120) throw new Error("The GitHub member identity is invalid.");
    const current = this.ctx.storage.sql.exec<{ role: ProjectMemberRole; created_at: string }>("SELECT role, created_at FROM project_members WHERE subject = ?", member.subject).toArray()[0];
    if (current?.role === "owner") throw new Error("The project owner cannot be changed through member invitations.");
    const createdAt = current?.created_at ?? new Date().toISOString();
    this.ctx.storage.sql.exec("INSERT INTO project_members (subject, login, role, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(subject) DO UPDATE SET login = excluded.login, role = excluded.role", member.subject, member.login.trim(), role, createdAt);
    return { ...member, login: member.login.trim(), role, createdAt };
  }
  async removeMember(actor: string, subject: string): Promise<boolean> {
    await this.service();
    this.requireRole(actor, "owner");
    const result = this.ctx.storage.sql.exec<{ subject: string }>("DELETE FROM project_members WHERE subject = ? AND role != 'owner' RETURNING subject", subject).toArray();
    return result.length > 0;
  }
  private requireRole(subject: string, minimum: ProjectMemberRole) {
    const role = this.ctx.storage.sql.exec<{ role: ProjectMemberRole }>("SELECT role FROM project_members WHERE subject = ?", subject).toArray()[0]?.role;
    const allowed = minimum === "viewer" ? ["owner", "editor", "viewer"] : minimum === "editor" ? ["owner", "editor"] : ["owner"];
    if (!role || !allowed.includes(role)) throw new Error("You are not a member with permission to do this in this project.");
    return role;
  }
  async createAgentCredential(name: string, actorSubject?: string) {
    await this.service();
    if (actorSubject) this.requireRole(actorSubject, "owner");
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 120) throw new Error("Agent name must be between 1 and 120 characters.");
    const id = crypto.randomUUID();
    const token = createCredentialToken();
    const createdAt = new Date().toISOString();
    this.ctx.storage.sql.exec(
      "INSERT INTO agent_credentials (id, name, token_hash, created_at, revoked_at) VALUES (?, ?, ?, ?, NULL)",
      id,
      cleanName,
      await credentialHash(token),
      createdAt,
    );
    return { id, name: cleanName, token, createdAt };
  }
  async listAgentCredentials(actorSubject?: string) {
    await this.service();
    if (actorSubject) this.requireRole(actorSubject, "owner");
    return this.ctx.storage.sql.exec<{ id: string; name: string; created_at: string; revoked_at: string | null }>(
      "SELECT id, name, created_at, revoked_at FROM agent_credentials ORDER BY created_at DESC",
    ).toArray().map(({ id, name, created_at, revoked_at }) => ({ id, name, createdAt: created_at, revokedAt: revoked_at }));
  }
  async authenticateAgentCredential(token: string) {
    await this.service();
    if (!token.startsWith("gta_") || token.length > 100) return null;
    return this.ctx.storage.sql.exec<{ id: string; name: string }>(
      "SELECT id, name FROM agent_credentials WHERE token_hash = ? AND revoked_at IS NULL",
      await credentialHash(token),
    ).toArray()[0] ?? null;
  }
  async revokeAgentCredential(id: string, actorSubject?: string) {
    await this.service();
    if (actorSubject) this.requireRole(actorSubject, "owner");
    const changed = this.ctx.storage.sql.exec<{ id: string }>(
      "UPDATE agent_credentials SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL RETURNING id",
      new Date().toISOString(),
      id,
    ).toArray();
    return changed.length > 0;
  }
  async updatePlan(input: UpdateProjectPlanInput, actorSubject?: string) {
    const service = await this.service();
    if (actorSubject) this.requireRole(actorSubject, "owner");
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
  async resolveWork(id: string, input: ResolveWorkInput, actorSubject?: string) {
    await this.service();
    if (actorSubject) this.requireRole(actorSubject, "owner");
    const lock = this.ctx.storage.sql.exec<{ work_id: string }>("SELECT work_id FROM acceptance_locks WHERE work_id = ? AND created_at > ?", id, new Date(Date.now() - 5 * 60_000).toISOString()).toArray()[0];
    if (lock) throw new Error("This result is being accepted. Try again after acceptance finishes.");
    return (await this.service()).resolveWork(id, input);
  }
  async rejectWork(id: string, actor: string, actorSubject?: string) {
    const service = await this.service();
    if (actorSubject) this.requireRole(actorSubject, "owner");
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
  async prepareAcceptance(id: string, expectedRevision: number, resultCommit: string, actorSubject?: string) {
    const snapshot = await (await this.service()).getSnapshot();
    if (actorSubject) this.requireRole(actorSubject, "owner");
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
