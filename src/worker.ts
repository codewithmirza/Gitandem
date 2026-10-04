import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import type { ProjectCoordinator } from "./coordinator";

export { ProjectCoordinator } from "./coordinator";

const coordinator = (env: Env, projectId: string) => env.COORDINATOR.getByName(projectId) as DurableObjectStub<ProjectCoordinator>;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const message = (error: unknown) => error instanceof Error ? error.message : "Unexpected error.";

function isAuthorized(request: Request, env: Env) {
  const expected = env.GITANDEM_API_TOKEN;
  return Boolean(expected && request.headers.get("Authorization") === `Bearer ${expected}`);
}

async function api(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, "");
  try {
    if (request.method === "POST" && path === "/api/demo") {
      return json(await coordinator(env, "atlas-commerce").seedDemo());
    }
    const match = path.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
    if (!match) return json({ error: "Route not found." }, 404);
    const [, projectId, resource = ""] = match;
    const project = coordinator(env, projectId);
    if (request.method === "GET" && resource === "") return json(await project.getSnapshot());
    const payload = await request.json().catch(() => ({})) as Record<string, string>;
    if (request.method === "POST" && resource === "decisions") {
      return json(await project.updateDecision({ key: payload.key, title: payload.title, value: payload.value, actor: payload.actor || "Project owner" }));
    }
    if (request.method === "POST" && resource === "assignments") {
      return json(await project.createAssignment({ title: payload.title, agent: payload.agent || "Agent · New" }));
    }
    if (request.method === "POST" && resource === "proposals") {
      return json(await project.submitProposal({ assignmentId: payload.assignmentId, summary: payload.summary, body: payload.body, actor: payload.actor || "Agent · New" }));
    }
    const proposalAction = resource.match(/^proposals\/([^/]+)\/(validate|rebase|accept)$/);
    if (request.method === "POST" && proposalAction) {
      const [, proposalId, action] = proposalAction;
      if (action === "validate") return json(await project.validateProposal(proposalId));
      if (action === "rebase") return json(await project.rebaseProposal(proposalId));
      return json(await project.acceptProposal(proposalId));
    }
    const reviseAction = resource.match(/^proposals\/([^/]+)\/revise$/);
    if (request.method === "POST" && reviseAction) {
      return json(await project.reviseProposal(reviseAction[1], { summary: payload.summary, body: payload.body, actor: payload.actor || "Agent · New" }));
    }
    return json({ error: "Route not found." }, 404);
  } catch (error) {
    const text = message(error);
    return json({ error: text }, /not found|not initialized/i.test(text) ? 404 : 400);
  }
}

function createServer(env: Env) {
  const server = new McpServer({ name: "gitandem", version: "0.1.0" });
  const projectFor = (projectId: string) => coordinator(env, projectId);
  const toolText = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

  server.registerTool("get_project_context", {
    description: "Read the shared project revision, decisions, assignments, proposals, and recent activity.",
    inputSchema: { projectId: z.string().min(1) },
  }, async ({ projectId }) => toolText(await projectFor(projectId).getSnapshot()));

  server.registerTool("update_decision", {
    description: "Create or update a shared product or engineering contract. This increments its version.",
    inputSchema: { projectId: z.string().min(1), key: z.string().min(1), title: z.string().min(1), value: z.string().min(1), actor: z.string().default("Agent") },
  }, async ({ projectId, key, title, value, actor }) => toolText(await projectFor(projectId).updateDecision({ key, title, value, actor })));

  server.registerTool("create_assignment", {
    description: "Create a named unit of work for an agent, snapshotting the current project revision and contract versions.",
    inputSchema: { projectId: z.string().min(1), title: z.string().min(1), agent: z.string().min(1) },
  }, async ({ projectId, title, agent }) => toolText(await projectFor(projectId).createAssignment({ title, agent })));

  server.registerTool("submit_proposal", {
    description: "Submit an agent's proposed change. Gitandem records the current contract and project revision as its base.",
    inputSchema: { projectId: z.string().min(1), assignmentId: z.string().min(1), summary: z.string().min(1), body: z.string().min(1), actor: z.string().default("Agent") },
  }, async ({ projectId, assignmentId, summary, body, actor }) => toolText(await projectFor(projectId).submitProposal({ assignmentId, summary, body, actor })));

  server.registerTool("validate_proposal", {
    description: "Compare a proposal's base revision and contract versions with the shared project. Stale proposals cannot be accepted.",
    inputSchema: { projectId: z.string().min(1), proposalId: z.string().min(1) },
  }, async ({ projectId, proposalId }) => toolText(await projectFor(projectId).validateProposal(proposalId)));

  server.registerTool("rebase_proposal", {
    description: "Explicitly rebase a stale proposal to current contract versions and revision. This records a requirement for agent review before acceptance.",
    inputSchema: { projectId: z.string().min(1), proposalId: z.string().min(1) },
  }, async ({ projectId, proposalId }) => toolText(await projectFor(projectId).rebaseProposal(proposalId)));

  server.registerTool("revise_proposal", {
    description: "Record an agent-reviewed update to a rebased proposal. Required before a rebased proposal can be validated and accepted.",
    inputSchema: { projectId: z.string().min(1), proposalId: z.string().min(1), summary: z.string().min(1), body: z.string().min(1), actor: z.string().default("Agent") },
  }, async ({ projectId, proposalId, summary, body, actor }) => toolText(await projectFor(projectId).reviseProposal(proposalId, { summary, body, actor })));

  server.registerTool("accept_proposal", {
    description: "Validate and accept a current proposal, advancing the shared project revision. Stale proposals are rejected.",
    inputSchema: { projectId: z.string().min(1), proposalId: z.string().min(1) },
  }, async ({ projectId, proposalId }) => toolText(await projectFor(projectId).acceptProposal(proposalId)));
  return server;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/") || url.pathname === "/mcp") {
      if (!isAuthorized(request, env)) return json({ error: "Unauthorized. Add a valid Bearer token." }, 401);
      if (url.pathname === "/mcp") return createMcpHandler(() => createServer(env), { route: "/mcp" })(request, env, ctx);
      return api(request, env);
    }
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
