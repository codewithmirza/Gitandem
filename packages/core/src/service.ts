import {
  CoordinationIssueSchema,
  CreateProjectInputSchema,
  PROJECT_CONTRACT_VERSION,
  ProjectPlanSchema,
  ProjectSnapshotSchema,
  ResolveWorkInputSchema,
  SubmitWorkResultInputSchema,
  SubmitWorkInputSchema,
  UpdateProjectPlanInputSchema,
  WorkIntentSchema,
  type CoordinationIssue,
  type CreateProjectInput,
  type ProjectPlan,
  type ProjectRecord,
  type ProjectSnapshot,
  type ResolveWorkInput,
  type SubmitWorkInput,
  type SubmitWorkResultInput,
  type UpdateProjectPlanInput,
  type WorkGrant,
  type WorkStatus,
} from "./schema";
import type { CoordinationStore } from "./store";

export class CoordinationError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "CoordinationError";
  }
}

export interface CoordinationRuntime {
  now(): string;
  id(): string;
}

const defaultRuntime: CoordinationRuntime = {
  now: () => new Date().toISOString(),
  id: () => crypto.randomUUID(),
};

const activeStatuses = new Set<WorkStatus>([
  "needs_resolution",
  "ready_for_review",
  "authorized",
  "in_progress",
  "submitted",
]);
const pendingStatuses = new Set<WorkStatus>([...activeStatuses, "needs_alignment"]);

const cleanList = (values: string[]) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export class CoordinationService {
  constructor(
    private readonly store: CoordinationStore,
    private readonly runtime: CoordinationRuntime = defaultRuntime,
  ) {}

  getSnapshot(): ProjectSnapshot {
    const snapshot = this.store.readSnapshot();
    if (!snapshot) throw new CoordinationError("Project not found.", "project_not_found");
    return ProjectSnapshotSchema.parse({ ...snapshot, contractVersion: PROJECT_CONTRACT_VERSION });
  }

  createProject(input: CreateProjectInput): ProjectSnapshot {
    const value = CreateProjectInputSchema.parse(input);
    if (this.store.readSnapshot()) throw new CoordinationError("This project already exists.", "project_exists");
    const now = this.runtime.now();
    const project: ProjectRecord = {
      id: value.id,
      name: value.name,
      repository: value.repository ?? null,
      revision: 1,
      updatedAt: now,
    };
    const plan: ProjectPlan = ProjectPlanSchema.parse({
      goal: value.goal,
      constraints: cleanList(value.constraints),
      decisions: value.decisions,
    });
    this.store.createProject(project, plan, {
      actor: "Project owner",
      detail: `Created project “${project.name}” and its first plan revision.`,
      createdAt: now,
    });
    return this.getSnapshot();
  }

  updatePlan(input: UpdateProjectPlanInput): ProjectSnapshot {
    const value = UpdateProjectPlanInputSchema.parse(input);
    const snapshot = this.getSnapshot();
    const now = this.runtime.now();
    const revision = snapshot.project.revision + 1;
    const plan = ProjectPlanSchema.parse({
      goal: value.goal,
      constraints: cleanList(value.constraints),
      decisions: value.decisions,
    });
    const project = { ...snapshot.project, revision, updatedAt: now };
    const alignedWork = snapshot.work
      .filter((item) => pendingStatuses.has(item.status))
      .map((item) => WorkIntentSchema.parse({
        ...item,
        status: "needs_alignment",
        result: undefined,
        issues: [this.issue(item.id, "plan_changed", `The shared plan changed to revision ${revision}. Recheck this intent against the new plan.`)],
      }));
    const revokedGrants = snapshot.grants
      .filter((grant) => grant.status === "active")
      .map((grant) => ({ ...grant, status: "revoked" as const }));
    this.store.updatePlan(project, plan, alignedWork, revokedGrants, {
      actor: value.actor,
      detail: `Updated the shared plan to revision ${revision}; active grants were revoked for realignment.`,
      createdAt: now,
    });
    return this.getSnapshot();
  }

  submitWork(input: SubmitWorkInput): ProjectSnapshot {
    const value = SubmitWorkInputSchema.parse(input);
    const snapshot = this.getSnapshot();
    const id = this.runtime.id();
    const scope = cleanList(value.scope);
    const interfaces = value.interfaces
      .map((item) => ({ name: item.name.trim(), proposal: item.proposal.trim() }))
      .filter((item) => item.name && item.proposal);
    const designChoices = value.designChoices
      .map((item) => ({ name: item.name.trim(), proposal: item.proposal.trim() }))
      .filter((item) => item.name && item.proposal);
    const issues: CoordinationIssue[] = [];

    for (const choice of designChoices) {
      const agreedDecision = snapshot.plan.decisions.find((item) => item.name.toLowerCase() === choice.name.toLowerCase());
      if (agreedDecision && agreedDecision.value !== choice.proposal) {
        issues.push(this.issue(
          id,
          "plan_decision_conflict",
          `This proposal differs from the shared plan decision “${agreedDecision.name}”.`,
          undefined,
          choice.name,
        ));
      }
    }

    for (const existing of snapshot.work.filter((item) => activeStatuses.has(item.status))) {
      const overlap = scope.filter((item) => existing.scope.includes(item));
      if (overlap.length) {
        issues.push(this.issue(
          id,
          "scope_overlap",
          `Scope overlaps with ${existing.agent} on: ${overlap.join(", ")}.`,
          existing.id,
          overlap.join(", "),
        ));
      }
      for (const proposal of interfaces) {
        const prior = existing.interfaces.find((item) => item.name.toLowerCase() === proposal.name.toLowerCase());
        if (prior && prior.proposal !== proposal.proposal) {
          issues.push(this.issue(
            id,
            "interface_mismatch",
            `The shared interface “${proposal.name}” has two different proposals.`,
            existing.id,
            proposal.name,
          ));
        }
      }
      for (const choice of designChoices) {
        const prior = existing.designChoices.find((item) => item.name.toLowerCase() === choice.name.toLowerCase());
        if (prior && prior.proposal !== choice.proposal) {
          issues.push(this.issue(
            id,
            "design_conflict",
            `Agents propose different choices for “${choice.name}”.`,
            existing.id,
            choice.name,
          ));
        }
      }
    }

    const uniqueIssues = [...new Map(issues.map((item) => [item.id, item])).values()];
    const intent = WorkIntentSchema.parse({
      id,
      ...value,
      scope,
      interfaces,
      designChoices,
      issues: uniqueIssues,
      status: uniqueIssues.length ? "needs_resolution" : "ready_for_review",
      planRevision: snapshot.project.revision,
      createdAt: this.runtime.now(),
    });
    this.store.createWorkIntent(intent, {
      actor: intent.agent,
      detail: `Submitted a work intent: “${intent.outcome}”. ${uniqueIssues.length ? "It needs a decision before authorization." : "It is ready for owner review."}`,
      createdAt: intent.createdAt,
    });
    return this.getSnapshot();
  }

  submitResult(id: string, input: SubmitWorkResultInput): ProjectSnapshot {
    const value = SubmitWorkResultInputSchema.parse(input);
    const snapshot = this.getSnapshot();
    const intent = snapshot.work.find((item) => item.id === id);
    if (!intent) throw new CoordinationError("Work intent not found.", "work_intent_not_found");
    if (intent.planRevision !== snapshot.project.revision || intent.status === "needs_alignment") {
      throw new CoordinationError("This intent is based on an older plan. Align it before submitting a result.", "stale_plan");
    }
    const grant = snapshot.grants.find((item) => item.workId === id && item.status === "active");
    if (!grant || grant.planRevision !== snapshot.project.revision || !grant.workspace) {
      throw new CoordinationError("This work intent has no active authorized workspace.", "workspace_not_authorized");
    }
    if (intent.status !== "authorized" && intent.status !== "in_progress") {
      throw new CoordinationError("Only active work can submit a result.", "invalid_work_transition");
    }
    const submitted = WorkIntentSchema.parse({
      ...intent,
      status: "submitted",
      result: { ...value, submittedAt: this.runtime.now() },
    });
    this.store.resolveWorkIntent(submitted, null, {
      actor: intent.agent,
      detail: `Submitted commit ${value.commit.slice(0, 12)} for owner review.`,
      createdAt: this.runtime.now(),
    });
    return this.getSnapshot();
  }

  acceptResult(id: string, actor: string, canonicalHead: string): ProjectSnapshot {
    const snapshot = this.getSnapshot();
    const intent = snapshot.work.find((item) => item.id === id);
    if (!intent) throw new CoordinationError("Work intent not found.", "work_intent_not_found");
    if (intent.status !== "submitted" || !intent.result) throw new CoordinationError("This work has no submitted result to accept.", "result_not_submitted");
    if (intent.planRevision !== snapshot.project.revision) throw new CoordinationError("The project plan changed after this work was authorized.", "stale_plan");
    if (canonicalHead !== intent.result.commit) throw new CoordinationError("The canonical branch does not point to the submitted result.", "canonical_head_mismatch");
    const accepted = WorkIntentSchema.parse({ ...intent, status: "accepted" });
    const grant = snapshot.grants.find((item) => item.workId === id && item.status === "active");
    this.store.resolveWorkIntent(accepted, grant ? { ...grant, status: "revoked" } : null, {
      actor,
      detail: `Accepted commit ${intent.result.commit.slice(0, 12)} for “${intent.outcome}”.`,
      createdAt: this.runtime.now(),
    });
    return this.getSnapshot();
  }

  resolveWork(id: string, input: ResolveWorkInput): ProjectSnapshot {
    const value = ResolveWorkInputSchema.parse(input);
    const snapshot = this.getSnapshot();
    const intent = snapshot.work.find((item) => item.id === id);
    if (!intent) throw new CoordinationError("Work intent not found.", "work_intent_not_found");
    if (intent.planRevision !== snapshot.project.revision || intent.status === "needs_alignment") {
      throw new CoordinationError("This intent uses an older plan. Ask the agent to resubmit it against the current plan.", "stale_plan");
    }
    const now = this.runtime.now();

    if (value.action === "reject") {
      const rejected = WorkIntentSchema.parse({ ...intent, status: "rejected" });
      this.store.resolveWorkIntent(rejected, null, {
        actor: value.actor,
        detail: `Rejected the work intent “${intent.outcome}”.`,
        createdAt: now,
      });
      return this.getSnapshot();
    }

    if (intent.status === "needs_resolution") {
      throw new CoordinationError("Resolve the listed scope, interface, or design-choice conflicts before review.", "unresolved_conflict");
    }
    if ((intent.baseCommit ?? null) !== (value.currentBaseCommit ?? null)) {
      const issue = this.issue(intent.id, "repository_changed", "The repository changed after this intent was submitted. Resubmit it against the latest commit.");
      const held = WorkIntentSchema.parse({ ...intent, status: "needs_alignment", issues: [issue] });
      this.store.resolveWorkIntent(held, null, {
        actor: value.actor,
        detail: `Held “${intent.outcome}” for alignment because the repository base changed.`,
        createdAt: now,
      });
      return this.getSnapshot();
    }

    const authorized = WorkIntentSchema.parse({ ...intent, status: "authorized" });
    const grant: WorkGrant = {
      id: this.runtime.id(),
      workId: intent.id,
      agent: intent.agent,
      planRevision: snapshot.project.revision,
      ...(intent.baseCommit ? { baseCommit: intent.baseCommit } : {}),
      ...(value.workspace ? { workspace: value.workspace } : {}),
      status: "active",
      createdAt: now,
    };
    this.store.resolveWorkIntent(authorized, grant, {
      actor: value.actor,
      detail: `Authorized “${intent.outcome}” for ${intent.agent} at plan revision ${snapshot.project.revision}.`,
      createdAt: now,
    });
    return this.getSnapshot();
  }

  private issue(
    sourceId: string,
    kind: CoordinationIssue["kind"],
    message: string,
    relatedWorkIntentId?: string,
    subject?: string,
  ): CoordinationIssue {
    return CoordinationIssueSchema.parse({
      id: `${sourceId}:${kind}:${relatedWorkIntentId ?? "project"}:${subject ?? ""}`,
      kind,
      ...(relatedWorkIntentId ? { relatedWorkIntentId } : {}),
      ...(subject ? { subject } : {}),
      message,
    });
  }
}
