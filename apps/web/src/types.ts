import type { ProjectPlan, ProjectSnapshot, WorkGrant, WorkIntent, WorkStatus, ActivityEntry } from "@gitandem/core";
import type { WorkPlanAssessment } from "./plan-assessment";

export type { ProjectPlan, ProjectSnapshot, WorkGrant, WorkIntent, WorkStatus, ActivityEntry, WorkPlanAssessment };

export type User = {
  subject: string;
  login: string;
};

export type RepositoryAccess = {
  remote: string;
  token: string;
  expiresAt?: string;
  importedFrom?: string;
};

export type AgentAccess = {
  id: string;
  name: string;
  token: string;
  endpoint: string;
};

export type WorkspaceAccess = {
  workId: string;
  remote: string;
  defaultBranch: string;
  baseCommit: string;
};

export type ProjectMember = {
  subject: string;
  login: string;
  role: string;
  createdAt: string;
};
