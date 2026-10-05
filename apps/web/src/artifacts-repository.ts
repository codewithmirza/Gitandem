import type {
  CreateRepositoryInput,
  ForkRepositoryInput,
  ForkedRepository,
  ImportRepositoryInput,
  RepositoryMetadata,
  RepositoryPort,
  RepositoryToken,
} from "@gitandem/core";

export class ArtifactsRepository implements RepositoryPort {
  constructor(private readonly artifacts: Artifacts) {}

  async create(input: CreateRepositoryInput): Promise<RepositoryMetadata> {
    const result = await this.artifacts.create(input.name, {
      description: input.description,
      readOnly: false,
      setDefaultBranch: input.defaultBranch,
    });
    return { remote: result.remote, defaultBranch: result.defaultBranch };
  }

  async import(input: ImportRepositoryInput): Promise<RepositoryMetadata> {
    const result = await this.artifacts.import({
      source: { url: input.sourceUrl, ...(input.sourceBranch ? { branch: input.sourceBranch } : {}) },
      target: { name: input.name },
    });
    return { remote: result.remote, defaultBranch: result.defaultBranch };
  }

  async fork(input: ForkRepositoryInput): Promise<ForkedRepository> {
    using source = await this.artifacts.get(input.sourceName);
    const result = await source.fork(input.name, {
      description: input.description,
      readOnly: false,
      defaultBranchOnly: true,
    });
    return { remote: result.remote, defaultBranch: result.defaultBranch, initialToken: result.token };
  }

  async inspect(name: string): Promise<RepositoryMetadata> {
    using repo = await this.artifacts.get(name);
    const info = await repo.info();
    return { remote: info.remote, defaultBranch: info.defaultBranch };
  }

  async issueToken(name: string, access: "read" | "write", ttlSeconds: number): Promise<RepositoryToken> {
    using repo = await this.artifacts.get(name);
    const token = await repo.createToken(access, ttlSeconds);
    return { id: token.id, plaintext: token.plaintext, expiresAt: token.expiresAt };
  }

  async replaceInitialToken(name: string, initialToken: string, ttlSeconds: number): Promise<RepositoryToken> {
    using repo = await this.artifacts.get(name);
    await repo.revokeToken(initialToken);
    const token = await repo.createToken("write", ttlSeconds);
    return { id: token.id, plaintext: token.plaintext, expiresAt: token.expiresAt };
  }

  async revokeToken(name: string, tokenId: string): Promise<boolean> {
    using repo = await this.artifacts.get(name);
    return repo.revokeToken(tokenId);
  }

  async latestCommit(name: string): Promise<string | null> {
    using repo = await this.artifacts.get(name);
    const info = await repo.info();
    const commits = await repo.log({ ref: info.defaultBranch, limit: 1 });
    return commits[0]?.hash ?? null;
  }

  async containsCommit(name: string, commit: string): Promise<boolean> {
    using repo = await this.artifacts.get(name);
    const info = await repo.info();
    const commits = await repo.log({ ref: info.defaultBranch, limit: 2_000 });
    return commits.some((item) => item.hash === commit);
  }

  async delete(name: string): Promise<boolean> {
    return this.artifacts.delete(name);
  }
}
