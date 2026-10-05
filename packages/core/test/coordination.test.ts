import { describe, expect, it } from "vitest";
import {
  CoordinationService,
  PROJECT_CONTRACT_VERSION,
  type ActivityEvent,
  type CoordinationStore,
  type ProjectPlan,
  type ProjectRecord,
  type ProjectSnapshot,
  type WorkGrant,
  type WorkIntent,
} from "../src/index";

class MemoryStore implements CoordinationStore {
  snapshot: ProjectSnapshot | null = null;

  readSnapshot() { return this.snapshot; }
  createProject(project: ProjectRecord, plan: ProjectPlan, event: ActivityEvent) {
    this.snapshot = { contractVersion: PROJECT_CONTRACT_VERSION, project, plan, work: [], grants: [], activity: [{ ...event, id: 1 }] };
  }
  updatePlan(project: ProjectRecord, plan: ProjectPlan, alignedWork: WorkIntent[], revokedGrants: WorkGrant[], event: ActivityEvent) {
    const current = this.required();
    const ids = new Set(alignedWork.map((work) => work.id));
    this.snapshot = {
      ...current,
      project,
      plan,
      work: current.work.map((work) => ids.has(work.id) ? alignedWork.find((next) => next.id === work.id)! : work),
      grants: current.grants.map((grant) => revokedGrants.some((next) => next.id === grant.id) ? { ...grant, status: "revoked" } : grant),
      activity: [...current.activity, { ...event, id: current.activity.length + 1 }],
    };
  }
  createWorkIntent(intent: WorkIntent, event: ActivityEvent) {
    const current = this.required();
    this.snapshot = { ...current, work: [intent, ...current.work], activity: [...current.activity, { ...event, id: current.activity.length + 1 }] };
  }
  resolveWorkIntent(intent: WorkIntent, grant: WorkGrant | null, event: ActivityEvent) {
    const current = this.required();
    this.snapshot = {
      ...current,
      work: current.work.map((item) => item.id === intent.id ? intent : item),
      grants: grant
        ? grant.status === "revoked"
          ? current.grants.map((item) => item.id === grant.id ? grant : item)
          : [grant, ...current.grants]
        : current.grants,
      activity: [...current.activity, { ...event, id: current.activity.length + 1 }],
    };
  }
  private required() { if (!this.snapshot) throw new Error("Missing snapshot"); return this.snapshot; }
}

function setup() {
  const store = new MemoryStore();
  let id = 0;
  let time = 0;
  const service = new CoordinationService(store, {
    id: () => `id-${++id}`,
    now: () => new Date(Date.UTC(2026, 9, 5, 0, 0, time++)).toISOString(),
  });
  service.createProject({ id: "coordination-demo", name: "Coordination demo", goal: "A plan-led project" });
  return { service, store };
}

const proposal = (overrides: Partial<Parameters<CoordinationService["submitWork"]>[0]> = {}) => ({
  agent: "Agent A",
  outcome: "Add account settings",
  scope: ["src/settings"],
  interfaces: [{ name: "SettingsRoute", proposal: "GET /settings" }],
  acceptance: ["Settings page loads"],
  baseCommit: "commit-1",
  ...overrides,
});

describe("Gitandem coordination contract v2", () => {
  it("returns a versioned snapshot and rejects incomplete work proposals", () => {
    const { service } = setup();
    expect(service.getSnapshot().contractVersion).toBe(PROJECT_CONTRACT_VERSION);
    expect(() => service.submitWork(proposal({ scope: [], acceptance: [] }))).toThrow();
  });

  it("records explicit scope and interface conflicts as structured issues", () => {
    const { service } = setup();
    service.submitWork(proposal());
    const snapshot = service.submitWork(proposal({
      agent: "Agent B",
      outcome: "Add profile editing",
      interfaces: [{ name: "settingsroute", proposal: "PUT /settings" }],
    }));
    const conflict = snapshot.work[0]!;
    expect(conflict.status).toBe("needs_resolution");
    expect(conflict.issues.map((issue) => issue.kind)).toEqual(["scope_overlap", "interface_mismatch"]);
    expect(conflict.issues[0]?.relatedWorkIntentId).toBe(snapshot.work[1]?.id);
  });

  it("catches different agent designs for one feature even when their code scopes and APIs do not overlap", () => {
    const { service } = setup();
    service.submitWork(proposal({
      agent: "Snapshot agent",
      outcome: "Resume work from a versioned session snapshot",
      scope: ["session snapshot bundle", "restore path validation"],
      interfaces: [{ name: "save_work_session", proposal: "Store versioned files in a per-work Artifacts sidecar." }],
      designChoices: [{ name: "Session recovery authority", proposal: "Versioned files in a per-work Artifacts sidecar; the coordinator stores a manifest." }],
    }));
    const contested = service.submitWork(proposal({
      agent: "Journal agent",
      outcome: "Resume work by replaying durable execution events",
      scope: ["command lifecycle journal", "checkpoint replay"],
      interfaces: [{ name: "WorkSessionJournal", proposal: "Append ordered events to coordinator SQLite." }],
      designChoices: [{ name: "session recovery authority", proposal: "Coordinator SQLite event log is authoritative; there is no sidecar snapshot repository." }],
    }));

    expect(contested.work[0]?.status).toBe("needs_resolution");
    expect(contested.work[0]?.issues.map((issue) => issue.kind)).toEqual(["design_conflict"]);
    expect(contested.work[0]?.issues[0]?.relatedWorkIntentId).toBe(contested.work[1]?.id);
  });

  it("holds an agent proposal that contradicts a named choice in the shared plan", () => {
    const { service } = setup();
    service.updatePlan({
      goal: "A plan-led project",
      constraints: [],
      decisions: [{ name: "Session recovery authority", value: "Versioned files in a per-work Artifact sidecar." }],
      actor: "Owner",
    });
    const snapshot = service.submitWork(proposal({
      designChoices: [{ name: "session recovery authority", proposal: "Coordinator SQLite event log is authoritative." }],
    }));

    expect(snapshot.work[0]?.status).toBe("needs_resolution");
    expect(snapshot.work[0]?.issues.map((issue) => issue.kind)).toEqual(["plan_decision_conflict"]);
  });

  it("records a submitted result and accepts only the canonical commit while revoking its grant", () => {
    const { service } = setup();
    service.submitWork(proposal());
    service.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1", workspace: { remote: "https://example.test/task.git", defaultBranch: "main" } });
    const commit = "a".repeat(40);
    const submitted = service.submitResult("id-1", { commit, summary: "Finished settings work", evidence: ["Build succeeds"] });
    expect(submitted.work[0]?.status).toBe("submitted");
    expect(() => service.acceptResult("id-1", "Owner", "b".repeat(40))).toThrow(/canonical branch/);

    const accepted = service.acceptResult("id-1", "Owner", commit);
    expect(accepted.work[0]?.status).toBe("accepted");
    expect(accepted.grants[0]?.status).toBe("revoked");
  });

  it("authorizes an intent only once and never reactivates terminal work", () => {
    const { service } = setup();
    service.submitWork(proposal());
    const authorized = service.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1", workspace: { remote: "https://example.test/task.git", defaultBranch: "main" } });
    expect(authorized.grants.filter((grant) => grant.status === "active")).toHaveLength(1);
    expect(() => service.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1" }))
      .toThrowError(expect.objectContaining({ code: "invalid_work_transition" }));

    const submitted = service.submitResult("id-1", { commit: "a".repeat(40), summary: "Done", evidence: ["Checks passed"] });
    expect(submitted.work[0]?.status).toBe("submitted");
    expect(() => service.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1" }))
      .toThrowError(expect.objectContaining({ code: "invalid_work_transition" }));
    const accepted = service.acceptResult("id-1", "Owner", "a".repeat(40));
    expect(() => service.resolveWork("id-1", { action: "reject", actor: "Owner", currentBaseCommit: "commit-1" }))
      .toThrowError(expect.objectContaining({ code: "invalid_work_transition" }));
    expect(accepted.grants.filter((grant) => grant.status === "active")).toHaveLength(0);
  });

  it("revokes an active workspace grant when its work is rejected", () => {
    const { service } = setup();
    service.submitWork(proposal());
    service.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1", workspace: { remote: "https://example.test/task.git", defaultBranch: "main" } });
    const rejected = service.resolveWork("id-1", { action: "reject", actor: "Owner" });
    expect(rejected.work[0]?.status).toBe("rejected");
    expect(rejected.grants[0]?.status).toBe("revoked");
  });

  it("allows an owner to reject stale work but does not authorize it", () => {
    const { service } = setup();
    service.submitWork(proposal());
    service.updatePlan({ goal: "A new goal", constraints: [], decisions: [], actor: "Owner" });
    const rejected = service.resolveWork("id-1", { action: "reject", actor: "Owner" });
    expect(rejected.work[0]?.status).toBe("rejected");
    expect(rejected.grants).toHaveLength(0);
  });

  it("invalidates grants and sends pending work back for alignment on plan change", () => {
    const { service } = setup();
    service.submitWork(proposal());
    const authorized = service.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1" });
    expect(authorized.work[0]?.status).toBe("authorized");
    const updated = service.updatePlan({ goal: "A revised project goal", constraints: ["Keep settings private"], decisions: [], actor: "Owner" });
    expect(updated.project.revision).toBe(2);
    expect(updated.work[0]?.status).toBe("needs_alignment");
    expect(updated.work[0]?.issues[0]?.kind).toBe("plan_changed");
    expect(updated.grants[0]?.status).toBe("revoked");
  });

  it("holds work when the repository base changes and authorizes only an unchanged base", () => {
    const stale = setup().service;
    stale.submitWork(proposal());
    const held = stale.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-2" });
    expect(held.work[0]?.status).toBe("needs_alignment");
    expect(held.work[0]?.issues[0]?.kind).toBe("repository_changed");
    expect(held.grants).toHaveLength(0);

    const current = setup().service;
    current.submitWork(proposal());
    const allowed = current.resolveWork("id-1", { action: "review", actor: "Owner", currentBaseCommit: "commit-1" });
    expect(allowed.work[0]?.status).toBe("authorized");
    expect(allowed.grants[0]?.baseCommit).toBe("commit-1");
  });
});
