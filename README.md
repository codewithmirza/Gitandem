# Gitandem

Gitandem is an early project-hosting and coordination system for work shared by people and AI agents. Its central idea is simple: agents should agree on the intended work against a shared project plan before they receive permission to execute it.

Today this repository contains an early project host. It creates a canonical Git repository on Cloudflare Artifacts or imports a public HTTPS Git remote, stores a shared project plan, accepts structured work intents, detects explicit scope and interface collisions, and runs owner-authorized work in a separate task workspace.

## Why Gitandem

Version history answers what changed. A merge tool can show that two edits touch the same lines. Neither can decide whether two agents understood the product goal in the same way or whether their proposed designs fit the same contract.

Gitandem makes the plan part of the shared project state. Before implementation, an agent submits:

- The outcome it plans to deliver
- The parts of the project it expects to change
- Assumptions, shared interfaces, and dependencies
- Evidence that will show the work is complete

Gitandem compares declared scopes and interfaces. A clear intent can be reviewed and authorized. A detected collision is held for a human decision. Authorization is bound to the current plan revision; changing the plan revokes active grants and requires realignment.

This is coordination policy, not an AI judge. The current prototype detects explicit structured collisions. It does not infer which design is correct or silently expose one agent's private reasoning to another. A project owner resolves choices using the project plan and the context each contributor is allowed to see.

## Current scope

Implemented:

- A versioned coordination contract in `packages/core`, shared by the web app, REST, and MCP adapters
- A headless coordination service with a persistence port and explicit plan, work, conflict, and grant transitions
- Create a project with a goal and initial constraints
- Create a canonical Gitandem repository or import a public HTTPS Git remote
- Issue a short-lived, repository-scoped Git token for clone and push setup
- Maintain versioned shared plans and decisions
- Submit work intents through the web UI, REST API, or MCP
- Detect exact scope overlap and conflicting proposals for a named interface
- Hold conflicting work for resolution and review conflict-free work before authorization
- Bind grants to a plan revision and revoke them when that plan changes
- Store project state in one SQLite-backed Durable Object per project
- Fork an approved intent's exact base commit into its own Artifacts repository
- Run authorized argv commands in a managed Linux container with the task fork mounted as its working repository
- Keep per-task Git credentials inside Gitandem and revoke them after each command
- Verify a submitted task commit is the task fork head and includes the approved base commit
- Let the owner fast-forward the canonical branch to that submitted commit; revoke the work grant after acceptance

Next work:

- Private remote import and a guided browser folder upload; a local Git folder can push to a new project repository with the short-lived token
- Live-check the complete submit and accept flow against Cloudflare Artifacts
- Strengthen result review with clearer commit diffs and evidence against each acceptance condition
- Strong user, project, and cryptographic agent identities in place of deployment-wide prototype secrets
- Fine-grained container egress and resource limits
- Multi-user identity, project roles, and scoped credentials
- Automatic semantic interpretation or resolution of competing plans

Gitandem is intended to become the project home itself. Existing repositories are migration paths; the imported Artifacts repository becomes the canonical copy for that Gitandem project.

## Run locally

Requirements: Node.js 20 or newer and pnpm.

```sh
pnpm install
Copy-Item apps/web/.dev.vars.example apps/web/.dev.vars
# Edit apps/web/.dev.vars and set a long random local token.
pnpm dev
```

Open the local URL shown by Vite and enter the token from `apps/web/.dev.vars`. The local token is a development guard, not production authentication. Do not commit that file.

Local mode keeps Worker execution on your machine and lets you create plan-only projects and exercise the coordination routes. Repository create/import and Git tokens are intentionally disabled locally. They call Cloudflare Artifacts, which requires an eligible Workers Paid account. This avoids making every `pnpm dev` startup depend on a paid remote preview or accidentally sending local work to a remote repository.

Useful commands:

```sh
pnpm build
pnpm test
pnpm cf-typegen
```

`apps/web/wrangler.jsonc` declares the SQLite-backed Durable Object and Artifacts namespace binding. The binding uses the name `gitandem` and contains no account ID, deployed namespace ID, or created remote resource. Cloudflare Artifacts access requires an eligible Workers plan and a configured account. The app does not provision account resources automatically.

## API and agent access

Owner REST routes use `Authorization: Bearer <GITANDEM_API_TOKEN>`. MCP uses a separate `GITANDEM_AGENT_TOKEN`. An agent can submit a result via MCP; only the owner REST interface can accept it into the canonical branch.

REST routes are documented in [docs/api.md](docs/api.md). The MCP server exposes tools to create a project, read its context, propose work, run commands after owner authorization, and submit a finished commit. MCP is an interface an agent can use to work with Gitandem; it does not require a separate agent-to-agent protocol.

Use separate `GITANDEM_API_TOKEN` and `GITANDEM_AGENT_TOKEN` values. The owner token guards REST; the agent token guards MCP, whose tools cannot update the plan, authorize work, or accept results. These are deployment-wide prototype secrets, not a user or membership system. The runner currently has Internet access and limits each command to 120 seconds. The owner acceptance path has not yet had a live end-to-end check.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the current data flow and the boundaries between project coordination, Git history, and code execution.

See the implementation order. The project interface is a client of the coordination protocol; it is not the core product.

The existing web application lives in `apps/web`. Future protocol packages and SDKs will live in `packages/`, so all parts of Gitandem stay in one monorepo.

The v1 coordination contract is documented in [docs/protocol.md](docs/protocol.md). JSON API responses include `X-Gitandem-Contract-Version`; project snapshots include the same version as `contractVersion`.

Cloudflare Workers serves the app and APIs. Each project maps to a SQLite-backed Durable Object, which is the single coordination authority for that project. Cloudflare documents Durable Objects as strongly consistent, serializable storage attached to globally named coordinators: [Durable Objects](https://developers.cloudflare.com/durable-objects/), [SQLite-backed storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

## Contributing

This is an early open-source project. See [CONTRIBUTING.md](CONTRIBUTING.md) for the current development rules and planned boundaries. Please describe the user problem and intended behavior before making a large change.

## License

No license has been selected yet. Until a license file is added, standard copyright restrictions apply. Do not assume the code is available for reuse just because the repository is public.
