import type {
  ActivityEntry,
  ProjectPlan,
  ProjectRecord,
  ProjectSnapshot,
  WorkGrant,
  WorkIntent,
} from "./schema";

export type ActivityEvent = Omit<ActivityEntry, "id">;

/**
 * Persistence port for one project aggregate. Implementations must keep each
 * mutation and its related rows atomic. The Durable Object adapter does this
 * with synchronous SQLite writes in one input-gated turn.
 */
export interface CoordinationStore {
  readSnapshot(): ProjectSnapshot | null;
  createProject(project: ProjectRecord, plan: ProjectPlan, event: ActivityEvent): void;
  updatePlan(
    project: ProjectRecord,
    plan: ProjectPlan,
    alignedWork: WorkIntent[],
    revokedGrants: WorkGrant[],
    event: ActivityEvent,
  ): void;
  createWorkIntent(intent: WorkIntent, event: ActivityEvent): void;
  resolveWorkIntent(intent: WorkIntent, grant: WorkGrant | null, event: ActivityEvent): void;
}
