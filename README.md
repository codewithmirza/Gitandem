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

The current prototype detects explicit structured collisions and can optionally ask Cloudflare Workers AI's Clef Flash model to compare a proposal with the approved plan and other active proposals. The model returns scored advice, not a decision. Gitandem does not let AI change the plan, clear a conflict, grant execution access, or accept code. Owners remain responsible for decisions. Only the shared plan and submitted proposals are sent for assessment; hidden agent reasoning is not collected.

## Current scope

Implemented:

- A versioned coordination contract in `packages/core`, shared by the web app, REST, and MCP adapters
- A headless coordination service with a persistence port and explicit plan, work, conflict, and grant transitions
- Create a project with a goal and initial constraints
- Create a canonical Gitandem repository or import a public HTTPS Git remote
- Issue a short-lived, repository-scoped Git token for clone and push setup
- Maintain versioned shared plans and decisions
- Submit work intents through the web UI, REST API, or MCP
- Detect exact scope overlap, conflicting proposals for named interfaces, and differences in named design choices or shared plan decisions
- Assess a proposal's fit with the shared plan and compare up to eight relevant active proposals using direct Workers AI inference (no AI Gateway); bound model input and show scores as advice only
- Hold conflicting work for resolution and review conflict-free work before authorization
- Bind grants to a plan revision and revoke them when that plan changes
- Store project state in one SQLite-backed Durable Object per project
- Fork an approved intent's exact base commit into its own Artifacts repository
- Run authorized argv commands in a managed Linux container with the task fork mounted as its working repository
- Issue revocable, project-scoped MCP credentials; derive agent identity from its credential and store only a token hash
- Keep per-task Git credentials inside Gitandem and revoke them after each command
- Verify a submitted task commit is the task fork head and includes the approved base commit
- Let the owner fast-forward the canonical branch to that submitted commit; revoke the work grant after acceptance

Next work:

- Add user login and project membership to replace the deployment-wide owner token
- Connect Git providers for authenticated private-repository import
- Add a local folder import/export path that creates a verifiable Git commit
- Protect canonical Git writes so routine changes pass through plan review and acceptance
- Live-check a changed commit through submission and owner acceptance
- Improve result review with commit diffs and evidence tied to acceptance conditions
- Tighten container network and resource limits
- Evaluate semantic assessments on realistic competing plans

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

Local mode keeps Worker execution on your machine and lets you create plan-only projects and exercise the coordination routes. Clicking **Assess plan with AI** sends the approved plan and selected active proposals to the configured Cloudflare Workers AI model through a remote binding. It does not use AI Gateway. This remote model call can use account credits or incur account usage. Repository create/import and Git tokens are disabled locally. Local container execution is disabled; run commands only in a deployed authorized workspace.

Useful commands:

```sh
pnpm build
pnpm test
pnpm cf-typegen
```

`apps/web/wrangler.jsonc` declares the SQLite-backed Durable Object, Artifacts namespace, and Workers AI bindings. It contains no account ID or pre-created resource IDs. The app does not provision account resources automatically.

## API and agent access

Owner REST routes use `Authorization: Bearer <GITANDEM_API_TOKEN>`. The deployment-wide `GITANDEM_AGENT_TOKEN` is a bootstrap credential for project creation; agents use project-specific MCP credentials for project work. An agent can submit a result via MCP; only the owner REST interface can accept it into the canonical branch.

REST routes are documented in [docs/api.md](docs/api.md). The MCP server exposes tools to create a project, read its context, propose work, run commands after owner authorization, and submit a finished commit. MCP is an interface an agent can use to work with Gitandem; it does not require a separate agent-to-agent protocol.

Use separate `GITANDEM_API_TOKEN` and `GITANDEM_AGENT_TOKEN` values. The owner token guards REST. The bootstrap token only creates projects; each project agent receives a revocable credential scoped to that project's MCP endpoint. Project credentials are stored as hashes, and proposal identity comes from the credential rather than a caller-supplied label. The owner and bootstrap tokens remain deployment-wide prototype secrets, not a user or membership system. The runner currently has Internet access and limits each command to 120 seconds. The owner acceptance path has not yet had a live end-to-end check.

## Architecture

See [docs/architecture.md](docs/architecture.md) for the current data flow and the boundaries between project coordination, Git history, and code execution.

See [docs/target-architecture.md](docs/target-architecture.md) for the larger design Gitandem is moving toward, including user identity, provider imports, and the boundary around independent agents.

See the implementation order. The project interface is a client of the coordination protocol; it is not the core product.

The existing web application lives in `apps/web`. Future protocol packages and SDKs will live in `packages/`, so all parts of Gitandem stay in one monorepo.

The v2 coordination contract is documented in [docs/protocol.md](docs/protocol.md). JSON API responses include `X-Gitandem-Contract-Version`; project snapshots include the same version as `contractVersion`.

Cloudflare Workers serves the app and APIs. Each project maps to a SQLite-backed Durable Object, which is the single coordination authority for that project. Cloudflare documents Durable Objects as strongly consistent, serializable storage attached to globally named coordinators: [Durable Objects](https://developers.cloudflare.com/durable-objects/), [SQLite-backed storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

## Contributing

This is an early open-source project. See [CONTRIBUTING.md](CONTRIBUTING.md) for the current development rules and planned boundaries. Please describe the user problem and intended behavior before making a large change.

## License

This project is licensed under the MIT License; see [LICENSE](LICENSE).
