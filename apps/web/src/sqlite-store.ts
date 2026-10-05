import {
  ActivityEntrySchema,
  CoordinationIssueSchema,
  ProjectPlanSchema,
  ProjectSchema,
  ProjectSnapshotSchema,
  PROJECT_CONTRACT_VERSION,
  WorkGrantSchema,
  WorkIntentSchema,
  type ActivityEvent,
  type CoordinationIssue,
  type CoordinationStore,
  type ProjectPlan,
  type ProjectRecord,
  type ProjectSnapshot,
  type WorkGrant,
  type WorkIntent,
} from "@gitandem/core";

type ProjectRow = { id: string; name: string; repository: string | null; revision: number; updated_at: string };
type WorkRow = { id: string; agent: string; details: string; status: string; reasons: string; plan_revision: number; base_commit: string | null; created_at: string };
type GrantRow = { id: string; work_id: string; agent: string; plan_revision: number; base_commit: string | null; workspace: string | null; status: string; created_at: string };
type ActivityRow = { id: number; actor: string; detail: string; created_at: string };
type WorkDetails = Pick<WorkIntent, "agent" | "agentIdentityId" | "outcome" | "scope" | "assumptions" | "interfaces" | "dependencies" | "acceptance" | "result">;

const detailsOf = (work: WorkIntent): WorkDetails => ({
  agent: work.agent,
  ...(work.agentIdentityId ? { agentIdentityId: work.agentIdentityId } : {}),
  outcome: work.outcome,
  scope: work.scope,
  assumptions: work.assumptions,
  interfaces: work.interfaces,
  dependencies: work.dependencies,
  acceptance: work.acceptance,
  ...(work.result ? { result: work.result } : {}),
});

function decodeIssues(raw: string, workId: string): CoordinationIssue[] {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "string")) {
    return value.map((message, index) => CoordinationIssueSchema.parse({
      id: `legacy:${workId}:${index}`,
      kind: "legacy",
      message,
    }));
  }
  return value.map((item) => CoordinationIssueSchema.parse(item));
}

export class SqliteCoordinationStore implements CoordinationStore {
  constructor(private readonly sql: SqlStorage) {}

  readSnapshot(): ProjectSnapshot | null {
    const row = this.sql.exec<ProjectRow>("SELECT * FROM project LIMIT 1").toArray()[0];
    if (!row) return null;
    const planRow = this.sql.exec<{ body: string }>("SELECT body FROM plan WHERE id = 1").toArray()[0];
    if (!planRow) throw new Error("Project plan storage is missing.");
    const work = this.sql.exec<WorkRow>("SELECT * FROM work_intents ORDER BY created_at DESC").toArray().map((item) => WorkIntentSchema.parse({
      ...JSON.parse(item.details) as WorkDetails,
      id: item.id,
      status: item.status,
      issues: decodeIssues(item.reasons, item.id),
      planRevision: item.plan_revision,
      ...(item.base_commit ? { baseCommit: item.base_commit } : {}),
      createdAt: item.created_at,
    }));
    const grants = this.sql.exec<GrantRow>("SELECT * FROM grants ORDER BY created_at DESC").toArray().map((item) => WorkGrantSchema.parse({
      id: item.id,
      workId: item.work_id,
      agent: item.agent,
      planRevision: item.plan_revision,
      ...(item.base_commit ? { baseCommit: item.base_commit } : {}),
      ...(item.workspace ? { workspace: JSON.parse(item.workspace) } : {}),
      status: item.status,
      createdAt: item.created_at,
    }));
    const activity = this.sql.exec<ActivityRow>("SELECT * FROM activity ORDER BY id DESC LIMIT 12").toArray().map((item) => ActivityEntrySchema.parse({
      id: item.id,
      actor: item.actor,
      detail: item.detail,
      createdAt: item.created_at,
    }));
    return ProjectSnapshotSchema.parse({
      contractVersion: PROJECT_CONTRACT_VERSION,
      project: ProjectSchema.parse({ id: row.id, name: row.name, repository: row.repository, revision: row.revision, updatedAt: row.updated_at }),
      plan: ProjectPlanSchema.parse(JSON.parse(planRow.body)),
      work,
      grants,
      activity,
    });
  }

  createProject(project: ProjectRecord, plan: ProjectPlan, event: ActivityEvent): void {
    this.sql.exec("INSERT INTO project VALUES (?, ?, ?, ?, ?)", project.id, project.name, project.repository, project.revision, project.updatedAt);
    this.sql.exec("INSERT INTO plan VALUES (1, ?)", JSON.stringify(plan));
    this.addActivity(event);
  }

  updatePlan(project: ProjectRecord, plan: ProjectPlan, alignedWork: WorkIntent[], revokedGrants: WorkGrant[], event: ActivityEvent): void {
    this.sql.exec("UPDATE plan SET body = ? WHERE id = 1", JSON.stringify(plan));
    this.sql.exec("UPDATE project SET revision = ?, updated_at = ? WHERE id = ?", project.revision, project.updatedAt, project.id);
    for (const work of alignedWork) this.updateWork(work);
    for (const grant of revokedGrants) this.sql.exec("UPDATE grants SET status = 'revoked' WHERE id = ?", grant.id);
    this.addActivity(event);
  }

  createWorkIntent(intent: WorkIntent, event: ActivityEvent): void {
    this.sql.exec(
      "INSERT INTO work_intents VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      intent.id,
      intent.agent,
      JSON.stringify(detailsOf(intent)),
      intent.status,
      JSON.stringify(intent.issues),
      intent.planRevision,
      intent.baseCommit ?? null,
      intent.createdAt,
    );
    this.addActivity(event);
  }

  resolveWorkIntent(intent: WorkIntent, grant: WorkGrant | null, event: ActivityEvent): void {
    this.updateWork(intent);
    if (grant) {
      if (grant.status === "revoked") this.sql.exec("UPDATE grants SET status = 'revoked' WHERE id = ?", grant.id);
      else this.sql.exec(
          "INSERT INTO grants (id, work_id, agent, plan_revision, base_commit, workspace, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          grant.id,
          grant.workId,
          grant.agent,
          grant.planRevision,
          grant.baseCommit ?? null,
          grant.workspace ? JSON.stringify(grant.workspace) : null,
          grant.status,
          grant.createdAt,
        );
    }
    this.addActivity(event);
  }

  private updateWork(work: WorkIntent): void {
    this.sql.exec("UPDATE work_intents SET details = ?, status = ?, reasons = ? WHERE id = ?", JSON.stringify(detailsOf(work)), work.status, JSON.stringify(work.issues), work.id);
  }

  private addActivity(event: ActivityEvent): void {
    this.sql.exec("INSERT INTO activity (actor, detail, created_at) VALUES (?, ?, ?)", event.actor, event.detail, event.createdAt);
  }
}
