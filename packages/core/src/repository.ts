export type RepositoryAccess = "read" | "write";

export type RepositoryMetadata = {
  remote: string;
  defaultBranch: string;
};

export type RepositoryToken = {
  id: string;
  plaintext: string;
  expiresAt: string;
};

export type ForkRepositoryInput = {
  sourceName: string;
  name: string;
  description: string;
};

export type ForkedRepository = RepositoryMetadata & { initialToken: string };

export type CreateRepositoryInput = {
  name: string;
  description: string;
  defaultBranch: string;
};

export type ImportRepositoryInput = {
  name: string;
  sourceUrl: string;
  sourceBranch?: string;
};

/** Gitandem's provider-neutral boundary to canonical Git storage. */
export interface RepositoryPort {
  create(input: CreateRepositoryInput): Promise<RepositoryMetadata>;
  import(input: ImportRepositoryInput): Promise<RepositoryMetadata>;
  fork(input: ForkRepositoryInput): Promise<ForkedRepository>;
  inspect(name: string): Promise<RepositoryMetadata>;
  issueToken(name: string, access: RepositoryAccess, ttlSeconds: number): Promise<RepositoryToken>;
  revokeToken(name: string, tokenId: string): Promise<boolean>;
  latestCommit(name: string): Promise<string | null>;
  delete(name: string): Promise<boolean>;
}
