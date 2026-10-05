import { z } from "zod";

export const PROJECT_CONTRACT_VERSION = 2 as const;

const Text = z.string().trim().min(1);
const TextList = z.array(Text);

export const WorkStatusSchema = z.enum([
  "needs_resolution",
  "ready_for_review",
  "authorized",
  "in_progress",
  "submitted",
  "accepted",
  "rejected",
  "needs_alignment",
]);

export const ProjectPlanSchema = z.object({
  goal: Text,
  constraints: TextList,
  decisions: z.array(z.object({ name: Text, value: Text })),
});

export const CoordinationIssueSchema = z.object({
  id: Text,
  kind: z.enum(["scope_overlap", "interface_mismatch", "design_conflict", "plan_decision_conflict", "plan_changed", "repository_changed", "legacy"]),
  relatedWorkIntentId: Text.optional(),
  subject: Text.optional(),
  message: Text,
});

export const WorkProposalSchema = z.object({
  agent: Text,
  agentIdentityId: Text.optional(),
  outcome: Text,
  scope: z.array(Text).min(1),
  assumptions: TextList.default([]),
  interfaces: z.array(z.object({ name: Text, proposal: Text })).default([]),
  designChoices: z.array(z.object({ name: Text, proposal: Text })).default([]),
  dependencies: TextList.default([]),
  acceptance: z.array(Text).min(1),
  baseCommit: Text.optional(),
});

export const WorkIntentSchema = WorkProposalSchema.extend({
  id: Text,
  status: WorkStatusSchema,
  issues: z.array(CoordinationIssueSchema),
  planRevision: z.number().int().positive(),
  createdAt: z.string().datetime(),
  result: z.object({
    commit: z.string().regex(/^[a-f0-9]{40,64}$/i),
    summary: Text,
    evidence: z.array(Text).min(1),
    submittedAt: z.string().datetime(),
  }).optional(),
});

export const ProjectSchema = z.object({
  id: Text,
  name: Text,
  repository: z.string().nullable(),
  revision: z.number().int().positive(),
  updatedAt: z.string().datetime(),
});

export const WorkGrantSchema = z.object({
  id: Text,
  workId: Text,
  agent: Text,
  planRevision: z.number().int().positive(),
  baseCommit: Text.optional(),
  workspace: z.object({ remote: Text, defaultBranch: Text }).optional(),
  status: z.enum(["active", "revoked"]),
  createdAt: z.string().datetime(),
});

export const ActivityEntrySchema = z.object({
  id: z.number().int().positive(),
  actor: Text,
  detail: Text,
  createdAt: z.string().datetime(),
});

export const ProjectSnapshotSchema = z.object({
  contractVersion: z.literal(PROJECT_CONTRACT_VERSION),
  project: ProjectSchema,
  plan: ProjectPlanSchema,
  work: z.array(WorkIntentSchema),
  grants: z.array(WorkGrantSchema),
  activity: z.array(ActivityEntrySchema),
});

export const CreateProjectInputSchema = z.object({
  id: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  name: Text,
  goal: Text,
  repository: z.string().trim().min(1).optional(),
  constraints: TextList.default([]),
  decisions: ProjectPlanSchema.shape.decisions.default([]),
});

export const UpdateProjectPlanInputSchema = ProjectPlanSchema.extend({ actor: Text });
export const SubmitWorkInputSchema = WorkProposalSchema;
export const ResolveWorkInputSchema = z.object({
  action: z.enum(["review", "reject"]),
  actor: Text,
  currentBaseCommit: Text.nullable().optional(),
  workspace: z.object({ remote: Text, defaultBranch: Text }).optional(),
});
export const SubmitWorkResultInputSchema = z.object({
  commit: z.string().regex(/^[a-f0-9]{40,64}$/i),
  summary: Text,
  evidence: z.array(Text).min(1).max(20),
});

export type WorkStatus = z.infer<typeof WorkStatusSchema>;
export type ProjectPlan = z.infer<typeof ProjectPlanSchema>;
export type CoordinationIssue = z.infer<typeof CoordinationIssueSchema>;
export type WorkProposal = z.infer<typeof WorkProposalSchema>;
export type WorkIntent = z.infer<typeof WorkIntentSchema>;
export type ProjectRecord = z.infer<typeof ProjectSchema>;
export type WorkGrant = z.infer<typeof WorkGrantSchema>;
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;
export type CreateProjectInput = z.input<typeof CreateProjectInputSchema>;
export type UpdateProjectPlanInput = z.input<typeof UpdateProjectPlanInputSchema>;
export type SubmitWorkInput = z.input<typeof SubmitWorkInputSchema>;
export type ResolveWorkInput = z.input<typeof ResolveWorkInputSchema>;
export type SubmitWorkResultInput = z.input<typeof SubmitWorkResultInputSchema>;
