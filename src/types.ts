export type Decision = {
  key: string;
  title: string;
  value: string;
  version: number;
  updatedBy: string;
};

export type Assignment = {
  id: string;
  title: string;
  agent: string;
  status: "in_progress" | "submitted" | "accepted";
  baseRevision: number;
  contractVersions: Record<string, number>;
};

export type Proposal = {
  id: string;
  assignmentId: string;
  agent: string;
  summary: string;
  body: string;
  status: "proposed" | "stale" | "needs_review" | "accepted" | "rejected";
  baseRevision: number;
  contractVersions: Record<string, number>;
  validation?: string;
  createdAt: string;
};

export type ActivityEvent = {
  id: number;
  type: string;
  actor: string;
  detail: string;
  createdAt: string;
};

export type ProjectSnapshot = {
  project: { id: string; name: string; repository: string; revision: number; updatedAt: string };
  decisions: Decision[];
  assignments: Assignment[];
  proposals: Proposal[];
  activity: ActivityEvent[];
};

export type ApiError = { error: string };
