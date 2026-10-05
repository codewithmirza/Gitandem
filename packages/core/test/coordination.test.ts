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
      grants: grant ? [grant, ...current.grants] : current.grants,
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

describe("Gitandem coordination contract v1", () => {
  it("returns a versioned snapshot and rejects incomplete work proposals", () => {
    const { service } = setup();
    expect(service.getSnapshot().contractVersion).toBe(1);
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
