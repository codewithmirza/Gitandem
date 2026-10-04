# Gitandem

**Shared coordination for independent agents.** Gitandem gives coding agents one versioned place for project intent, decisions, assignments, and proposed changes. It is a coordination layer that can sit beside GitHub; repository history remains the place for code history.

The first runnable slice includes a React dashboard, a Cloudflare Worker REST API, a stateless MCP endpoint, and a SQLite-backed Durable Object per project. The dashboard and MCP tools call the same project coordinator, so agents and people see the same contracts and proposal state.

## What works today

- Versioned shared decisions (contracts) with an actor and change history.
- Work assignments that snapshot the project revision and current decision versions.
- Agent proposals with explicit validation against both the project revision and each shared decision version.
- Stale proposal blocking, explicit rebase, validation, and acceptance that advances the authoritative project revision.
- A shared recent activity feed, usable through REST, MCP, and the dashboard.
- A two-agent demo that shows one proposal built against an older contract.
- Bearer-token protection for both API and MCP requests.

The GitHub card in the dashboard is illustrative. OAuth installation, branch/worktree creation, reading and writing repository contents, patch application, and provider webhooks are not connected yet. Acceptance currently advances Gitandem’s coordination revision; it does not merge code into GitHub. Those are adapter layers to add after the coordination contract has been proven.

## Run locally

Requires Node.js 22+ and pnpm 10+.

```powershell
pnpm install
Copy-Item .dev.vars.example .dev.vars
# Edit .dev.vars and replace the placeholder with a long random token.
pnpm dev
```

Open the local Vite URL. Paste the same token from `.dev.vars` into the connect screen. The token is kept in this browser’s local storage and sent only to the local Gitandem server. You can remove it using the profile button in the lower-left corner.

To produce the static and Worker build:

```powershell
pnpm build
```

The build removes the local `.dev.vars` copy from the generated Worker directory so a development token cannot ship inside the build output.

## MCP connection

Connect an MCP client to `http://localhost:5173/mcp` (or the Vite URL shown by `pnpm dev`) using Streamable HTTP and an `Authorization: Bearer <GITANDEM_API_TOKEN>` header. The server exposes these tools:

| Tool | Purpose |
| --- | --- |
| `get_project_context` | Read revision, shared decisions, assignments, proposals, and activity. |
| `update_decision` | Create or version a shared project contract. |
| `create_assignment` | Create work against the current project and decision versions. |
| `submit_proposal` | Submit a change proposal against the current shared context. |
| `validate_proposal` | Check whether a proposal’s base is still current. |
| `rebase_proposal` | Restamp a proposal after the agent has reconciled it with current context. |
| `revise_proposal` | Record the agent-reviewed update required after a rebase. |
| `accept_proposal` | Validate and accept a current proposal, advancing project revision. |

Every tool requires a `projectId`. The bundled demo project is `atlas-commerce`; call `POST /api/demo` once to initialize it.

## Architecture

```text
Person / Agent host
        │
        ├── Dashboard ── REST ─┐
        └── MCP client ────────┤
                               ▼
                    Gitandem Worker API
                               │
                COORDINATOR namespace binding
                               │
              ProjectCoordinator(projectId)
                   Durable Object + SQLite
```

The Durable Object serializes writes for one project. A proposal records the project revision and decision versions it read. Validation compares those values to current state; acceptance repeats validation immediately before writing. When the context moved, acceptance is rejected. Rebase is an explicit operation, and the UI asks for a fresh validation after it.

See [docs/architecture.md](docs/architecture.md) for the data model and [docs/api.md](docs/api.md) for REST routes.

## Cloudflare configuration

`wrangler.jsonc` declares the Worker, a Durable Object namespace binding, and a SQLite-backed Durable Object class migration. These are **unprovisioned declarations**: no Cloudflare resources, account IDs, database IDs, KV IDs, or secrets have been created. The binding and migration become real only after a future deployment. This project has not been deployed.

For a future deployment, set `GITANDEM_API_TOKEN` as a Worker secret before exposing the service. Do not set a production token in `wrangler.jsonc` or commit `.dev.vars`.

## Design system

The dashboard uses `gitandem-design-system` (`^0.4.1`) as an npm dependency for its design tokens, buttons, badges, and cards. That package currently declares `UNLICENSED`; review its distribution rights before publishing Gitandem as open source or bundling it for external clients. The Gitandem app itself is standalone and does not import third-party runtime code.

## Current boundaries

- The database is the per-project Durable Object’s embedded SQLite storage; no D1 or external database binding is needed for this model.
- The API uses one configured bearer token. Multi-user identity, scoped roles, OAuth, token rotation, and organization tenancy are not implemented.
- Proposals store a text summary and artifact description, not a Git patch. Accepted changes do not alter repository files.
- The included demo is seeded through the API, not stored as static frontend state.
- There are no automated tests in this initial slice.

## Challenge release note

This GitHub repository was created as **private** per the project owner’s instruction. The Cloudflare Git challenge calls for open-source code. Before using this repository as the public submission, change its visibility and make sure every dependency can be redistributed; in particular, resolve the design-system package’s current `UNLICENSED` declaration.
