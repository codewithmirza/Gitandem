import type { ActivityEvent, Assignment, Decision, ProjectSnapshot, Proposal } from "./types";
import { DurableObject } from "cloudflare:workers";

type ProjectRow = { id: string; name: string; repository: string; revision: number; updated_at: string };
type DecisionRow = { key: string; title: string; value: string; version: number; updated_by: string };
type AssignmentRow = { id: string; title: string; agent: string; status: Assignment["status"]; base_revision: number; contract_versions: string };
type ProposalRow = { id: string; assignment_id: string; agent: string; summary: string; body: string; status: Proposal["status"]; base_revision: number; contract_versions: string; validation: string | null; created_at: string };
type ActivityRow = { id: number; type: string; actor: string; detail: string; created_at: string };

const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const parseVersions = (value: string): Record<string, number> => JSON.parse(value) as Record<string, number>;

export class ProjectCoordinator extends DurableObject {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec(`CREATE TABLE IF NOT EXISTS project (id TEXT PRIMARY KEY, name TEXT NOT NULL, repository TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS decisions (key TEXT PRIMARY KEY, title TEXT NOT NULL, value TEXT NOT NULL, version INTEGER NOT NULL, updated_by TEXT NOT NULL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS assignments (id TEXT PRIMARY KEY, title TEXT NOT NULL, agent TEXT NOT NULL, status TEXT NOT NULL, base_revision INTEGER NOT NULL, contract_versions TEXT NOT NULL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY, assignment_id TEXT NOT NULL, agent TEXT NOT NULL, summary TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL, base_revision INTEGER NOT NULL, contract_versions TEXT NOT NULL, validation TEXT, created_at TEXT NOT NULL)`);
      sql.exec(`CREATE TABLE IF NOT EXISTS activity (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL)`);
    });
  }

  private async ensureReady() { await this.ready; }
  private get sql() { return this.ctx.storage.sql; }
  private record(type: string, actor: string, detail: string) {
    this.sql.exec(`INSERT INTO activity (type, actor, detail, created_at) VALUES (?, ?, ?, ?)`, type, actor, detail, now());
  }
  private currentProject() {
    return this.sql.exec<ProjectRow>(`SELECT * FROM project LIMIT 1`).toArray()[0];
  }

  private markOutdatedProposals() {
    const project = this.currentProject();
    if (!project) return;
    const current = Object.fromEntries(this.sql.exec<DecisionRow>(`SELECT key, version FROM decisions`).toArray().map((r) => [r.key, r.version]));
    for (const proposal of this.sql.exec<ProposalRow>(`SELECT * FROM proposals WHERE status IN ('proposed', 'needs_review')`).toArray()) {
      const oldVersions = parseVersions(proposal.contract_versions);
      const changed = Array.from(new Set([...Object.keys(oldVersions), ...Object.keys(current)])).filter((key) => oldVersions[key] !== current[key]);
      if (changed.length || proposal.base_revision !== project.revision) {
        this.sql.exec(`UPDATE proposals SET status = 'stale', validation = ? WHERE id = ?`, `The shared project moved to revision ${project.revision} or its contracts changed. Reconcile against the latest context before rebasing.`, proposal.id);
      }
    }
  }

  async seedDemo(): Promise<ProjectSnapshot> {
    await this.ensureReady();
    if (this.currentProject()) return this.getSnapshot();
    const stamp = now();
    this.sql.exec(`INSERT INTO project VALUES (?, ?, ?, ?, ?)`, "atlas-commerce", "Atlas Commerce", "gitandem/atlas-store", 4, stamp);
    const decisions: Array<[string, string, string, number, string]> = [
      ["api-errors", "API error shape", "All API errors use { code, message, requestId }.", 2, "Product architect"],
      ["auth", "Authentication boundary", "Session tokens stay server-side; never persist them in browser storage.", 1, "Security agent"],
      ["runtime", "Runtime target", "Cloudflare Workers with TypeScript; no Node-only runtime APIs.", 1, "Platform agent"],
    ];
    for (const row of decisions) this.sql.exec(`INSERT INTO decisions VALUES (?, ?, ?, ?, ?)`, ...row);
    this.sql.exec(`INSERT INTO assignments VALUES (?, ?, ?, ?, ?, ?)`, "assignment-checkout", "Implement checkout error handling", "Agent · Checkout", "submitted", 4, JSON.stringify({ "api-errors": 2, auth: 1 }));
    this.sql.exec(`INSERT INTO assignments VALUES (?, ?, ?, ?, ?, ?)`, "assignment-receipts", "Add purchase receipt view", "Agent · Receipts", "in_progress", 4, JSON.stringify({ "api-errors": 1, auth: 1 }));
    this.sql.exec(`INSERT INTO proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, "proposal-checkout", "assignment-checkout", "Agent · Checkout", "Normalize checkout failure responses", "Maps upstream failures into the agreed error envelope and adds request IDs.", "proposed", 4, JSON.stringify({ "api-errors": 2, auth: 1 }), null, stamp);
    this.sql.exec(`INSERT INTO proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, "proposal-receipts", "assignment-receipts", "Agent · Receipts", "Build receipt view", "Adds receipt details and an empty state for purchases without a receipt.", "stale", 4, JSON.stringify({ "api-errors": 1, auth: 1 }), "Decision api-errors advanced from v1 to v2 while this agent was working.", stamp);
    this.record("project.created", "Gitandem", "Created a coordinated workspace and loaded the two-agent demo.");
    this.record("decision.updated", "Product architect", "API error shape is now at contract v2.");
    this.record("proposal.submitted", "Agent · Checkout", "Submitted checkout response changes for validation.");
    this.record("proposal.stale", "Gitandem", "Receipts proposal references the previous API error contract.");
    return this.getSnapshot();
  }

  async getSnapshot(): Promise<ProjectSnapshot> {
    await this.ensureReady();
    const project = this.currentProject();
    if (!project) throw new Error("Project is not initialized. Load the demo or create a project first.");
    const decisions = this.sql.exec<DecisionRow>(`SELECT * FROM decisions ORDER BY key`).toArray().map((r): Decision => ({ key: r.key, title: r.title, value: r.value, version: r.version, updatedBy: r.updated_by }));
    const assignments = this.sql.exec<AssignmentRow>(`SELECT * FROM assignments ORDER BY rowid DESC`).toArray().map((r): Assignment => ({ id: r.id, title: r.title, agent: r.agent, status: r.status, baseRevision: r.base_revision, contractVersions: parseVersions(r.contract_versions) }));
    const proposals = this.sql.exec<ProposalRow>(`SELECT * FROM proposals ORDER BY created_at DESC`).toArray().map((r): Proposal => ({ id: r.id, assignmentId: r.assignment_id, agent: r.agent, summary: r.summary, body: r.body, status: r.status, baseRevision: r.base_revision, contractVersions: parseVersions(r.contract_versions), validation: r.validation ?? undefined, createdAt: r.created_at }));
    const activity = this.sql.exec<ActivityRow>(`SELECT * FROM activity ORDER BY id DESC LIMIT 12`).toArray().map((r): ActivityEvent => ({ id: r.id, type: r.type, actor: r.actor, detail: r.detail, createdAt: r.created_at }));
    return { project: { id: project.id, name: project.name, repository: project.repository, revision: project.revision, updatedAt: project.updated_at }, decisions, assignments, proposals, activity };
  }

  async updateDecision(input: { key: string; title: string; value: string; actor: string }) {
    await this.ensureReady();
    if (!this.currentProject()) throw new Error("Project not initialized.");
    const prior = this.sql.exec<DecisionRow>(`SELECT * FROM decisions WHERE key = ?`, input.key).toArray()[0];
    const version = (prior?.version ?? 0) + 1;
    this.sql.exec(`INSERT INTO decisions VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET title=excluded.title, value=excluded.value, version=excluded.version, updated_by=excluded.updated_by`, input.key, input.title, input.value, version, input.actor);
    this.markOutdatedProposals();
    this.record("decision.updated", input.actor, `${input.title} is now contract v${version}.`);
    return this.getSnapshot();
  }

  async createAssignment(input: { title: string; agent: string }) {
    await this.ensureReady();
    const project = this.currentProject();
    if (!project) throw new Error("Project not initialized.");
    const versions = Object.fromEntries(this.sql.exec<DecisionRow>(`SELECT key, version FROM decisions`).toArray().map((r) => [r.key, r.version]));
    this.sql.exec(`INSERT INTO assignments VALUES (?, ?, ?, ?, ?, ?)`, id(), input.title, input.agent, "in_progress", project.revision, JSON.stringify(versions));
    this.record("assignment.created", input.agent, `Started ${input.title} at project revision ${project.revision}.`);
    return this.getSnapshot();
  }

  async submitProposal(input: { assignmentId: string; summary: string; body: string; actor: string }) {
    await this.ensureReady();
    const project = this.currentProject();
    const assignment = this.sql.exec<AssignmentRow>(`SELECT * FROM assignments WHERE id = ?`, input.assignmentId).toArray()[0];
    if (!project || !assignment) throw new Error("Project or assignment not found.");
    const proposalId = id();
    const versions = parseVersions(assignment.contract_versions);
    const changed = Array.from(new Set([...Object.keys(versions), ...this.sql.exec<DecisionRow>(`SELECT key, version FROM decisions`).toArray().map((r) => r.key)])).some((key) => versions[key] !== this.sql.exec<DecisionRow>(`SELECT version, key FROM decisions WHERE key = ?`, key).toArray()[0]?.version);
    const stale = assignment.base_revision !== project.revision || changed;
    this.sql.exec(`INSERT INTO proposals VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, proposalId, assignment.id, input.actor, input.summary, input.body, stale ? "stale" : "proposed", assignment.base_revision, JSON.stringify(versions), stale ? "The shared project or its contracts changed since this assignment began." : null, now());
    this.sql.exec(`UPDATE assignments SET status = 'submitted' WHERE id = ?`, assignment.id);
    this.record("proposal.submitted", input.actor, `Submitted “${input.summary}” against project revision ${project.revision}.`);
    return this.getSnapshot();
  }

  async validateProposal(proposalId: string) {
    await this.ensureReady();
    const proposal = this.sql.exec<ProposalRow>(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray()[0];
    const project = this.currentProject();
    if (!proposal || !project) throw new Error("Proposal not found.");
    if (proposal.status === "needs_review") {
      return { valid: false, message: "Agent review and a revised proposal are required after rebase.", snapshot: await this.getSnapshot() };
    }
    const current = Object.fromEntries(this.sql.exec<DecisionRow>(`SELECT key, version FROM decisions`).toArray().map((r) => [r.key, r.version]));
    const expected = parseVersions(proposal.contract_versions);
    const changed = Array.from(new Set([...Object.keys(expected), ...Object.keys(current)])).filter((key) => current[key] !== expected[key]).map((key) => `${key} v${expected[key] ?? 0} → v${current[key] ?? 0}`);
    const revisionChanged = proposal.base_revision !== project.revision;
    const message = changed.length ? `Contract changed: ${changed.join(", ")}.` : revisionChanged ? `Project moved from revision ${proposal.base_revision} to ${project.revision}.` : "Current contracts and project revision match.";
    const valid = !changed.length && !revisionChanged;
    this.sql.exec(`UPDATE proposals SET status = ?, validation = ? WHERE id = ?`, valid ? "proposed" : "stale", message, proposalId);
    this.record(valid ? "proposal.validated" : "proposal.stale", "Gitandem validator", `${proposal.summary}: ${message}`);
    return { valid, message, snapshot: await this.getSnapshot() };
  }

  async rebaseProposal(proposalId: string) {
    await this.ensureReady();
    const project = this.currentProject();
    const proposal = this.sql.exec<ProposalRow>(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray()[0];
    if (!project || !proposal) throw new Error("Proposal not found.");
    const versions = Object.fromEntries(this.sql.exec<DecisionRow>(`SELECT key, version FROM decisions`).toArray().map((r) => [r.key, r.version]));
    this.sql.exec(`UPDATE proposals SET status = 'needs_review', base_revision = ?, contract_versions = ?, validation = ? WHERE id = ?`, project.revision, JSON.stringify(versions), "Rebased. Agent review and an updated proposal are required before acceptance.", proposalId);
    this.record("proposal.rebased", proposal.agent, `Rebased “${proposal.summary}” onto revision ${project.revision}; agent review is required before acceptance.`);
    return this.getSnapshot();
  }

  async reviseProposal(proposalId: string, input: { summary: string; body: string; actor: string }) {
    await this.ensureReady();
    const proposal = this.sql.exec<ProposalRow>(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray()[0];
    if (!proposal) throw new Error("Proposal not found.");
    if (proposal.status !== "needs_review") throw new Error("Only a rebased proposal awaiting agent review can be revised.");
    if (!input.summary.trim() || !input.body.trim()) throw new Error("A revised summary and change description are required.");
    this.sql.exec(`UPDATE proposals SET summary = ?, body = ?, status = 'proposed', validation = NULL, created_at = ? WHERE id = ?`, input.summary.trim(), input.body.trim(), now(), proposalId);
    this.record("proposal.revised", input.actor, `Reviewed and updated “${input.summary.trim()}” against the rebased context.`);
    return this.getSnapshot();
  }

  async acceptProposal(proposalId: string) {
    await this.ensureReady();
    const validation = await this.validateProposal(proposalId);
    if (!validation.valid) throw new Error(`Cannot accept stale proposal. ${validation.message}`);
    const proposal = this.sql.exec<ProposalRow>(`SELECT * FROM proposals WHERE id = ?`, proposalId).toArray()[0];
    const project = this.currentProject();
    if (!proposal || !project) throw new Error("Proposal not found.");
    const nextRevision = project.revision + 1;
    this.sql.exec(`UPDATE project SET revision = ?, updated_at = ?`, nextRevision, now());
    this.sql.exec(`UPDATE proposals SET status = 'accepted', validation = ? WHERE id = ?`, `Accepted as revision ${nextRevision}.`, proposalId);
    this.sql.exec(`UPDATE assignments SET status = 'accepted' WHERE id = ?`, proposal.assignment_id);
    this.record("proposal.accepted", "Project owner", `Accepted “${proposal.summary}” as revision ${nextRevision}.`);
    this.markOutdatedProposals();
    return this.getSnapshot();
  }
}
