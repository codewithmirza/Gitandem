import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CircleAlert, X } from "lucide-react";
import type {
  User,
  ProjectSnapshot,
  WorkIntent,
  RepositoryAccess,
  AgentAccess,
  WorkspaceAccess,
  WorkPlanAssessment,
} from "./types";

import { ProjectBar } from "./components/ProjectBar/ProjectBar";
import { NavigationRail, type NavSection } from "./components/NavigationRail/NavigationRail";
import { MissionControl } from "./components/MissionControl/MissionControl";
import { DecisionLens } from "./components/DecisionLens/DecisionLens";
import { CommitReview4D } from "./components/CommitReview4D/CommitReview4D";
import { PlanView } from "./components/PlanView/PlanView";
import { EventTicker } from "./components/MissionControl/EventTicker";
import { LoginGate } from "./components/Onboarding/LoginGate";
import { AgentAccessDialog } from "./components/Dialogs/AgentAccessDialog";
import { RepositoryAccessDialog } from "./components/Dialogs/RepositoryAccessDialog";
import { WorkspaceAccessDialog } from "./components/Dialogs/WorkspaceAccessDialog";
import { ProjectDialog } from "./components/Dialogs/ProjectDialog";
import { WorkDialog } from "./components/Dialogs/WorkDialog";
import { Brand } from "./components/common/Brand";

import "./styles.css";

const TOKEN_KEY = "gitandem:api-token";
const PROJECT_KEY = "gitandem:project";
const DEVELOPMENT = import.meta.env.DEV;

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projectId, setProjectId] = useState(() => localStorage.getItem(PROJECT_KEY) || "workspace-1");
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [assessments, setAssessments] = useState<Record<string, WorkPlanAssessment>>({});
  const [repoAccess, setRepoAccess] = useState<RepositoryAccess | null>(null);
  const [agentAccess, setAgentAccess] = useState<AgentAccess | null>(null);
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccess | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Navigation & view state
  const [actorMode, setActorMode] = useState<"human" | "agent">("human");
  const [activeSection, setActiveSection] = useState<NavSection>("cockpit");
  const [decisionIntent, setDecisionIntent] = useState<WorkIntent | null>(null);
  const [reviewIntent, setReviewIntent] = useState<WorkIntent | null>(null);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);

  // Live agent heartbeats are not collected yet, so no connection is reported.
  const connectedAgents: Array<{ name: string; lastSeen: string }> = [];

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/me", { credentials: "same-origin" })
      .then(async (res) => (res.ok ? ((await res.json()) as { user?: User }) : null))
      .then((data) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setAuthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("Content-Type", "application/json");
      if (DEVELOPMENT && token) headers.set("Authorization", `Bearer ${token}`);
      const res = await fetch(path, { ...init, credentials: "same-origin", headers });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      return data;
    },
    [token]
  );

  const refresh = useCallback(async () => {
    const activeUser = DEVELOPMENT ? Boolean(token) : Boolean(user);
    if (!activeUser) return;
    const currentId = projectId || "workspace-1";
    try {
      setError("");
      // Check user's projects first
      const listRes = await request("/api/projects").catch(() => null) as { projects?: Array<{ id: string; name: string }> } | null;
      let targetId = currentId;
      if (listRes?.projects && listRes.projects.length > 0 && !localStorage.getItem(PROJECT_KEY)) {
        targetId = listRes.projects[0]!.id;
        chooseProject(targetId);
      }
      try {
        const snap = (await request(`/api/projects/${encodeURIComponent(targetId)}`)) as ProjectSnapshot;
        setSnapshot(snap);
        if (targetId !== projectId) setProjectId(targetId);
      } catch (err) {
        // If workspace doesn't exist yet, automatically initialize it with zero friction
        const createRes = (await request("/api/projects", {
          method: "POST",
          body: JSON.stringify({
            id: targetId,
            name: "Workspace 1",
            goal: "Collaborative agentic workspace",
            constraints: [],
            repositoryMode: "create",
          }),
        })) as { snapshot: ProjectSnapshot; repositoryAccess: RepositoryAccess | null };
        chooseProject(targetId);
        setSnapshot(createRes.snapshot);
        setRepoAccess(createRes.repositoryAccess);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load workspace.");
    }
  }, [projectId, request, token, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const mutate = async (path: string, init: RequestInit) => {
    setBusy(true);
    setError("");
    try {
      const result = await request(path, init);
      if (result && typeof result === "object" && "project" in result) {
        setSnapshot(result as ProjectSnapshot);
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The request could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  const showRepositoryAccess = async () => {
    if (!snapshot) return;
    setBusy(true);
    setError("");
    try {
      setRepoAccess((await request(`/api/projects/${snapshot.project.id}/repository-token`, { method: "POST" })) as RepositoryAccess);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue repository access.");
    } finally {
      setBusy(false);
    }
  };

  const createAgentToken = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      const res = (await request(`/api/projects/${snapshot.project.id}/agent-credentials`, {
        method: "POST",
        body: JSON.stringify({ agent: `agent-${Date.now().toString(36)}` }),
      })) as AgentAccess;
      setAgentAccess(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not issue agent MCP credential.");
    } finally {
      setBusy(false);
    }
  };

  const authorizeWork = async (workId: string) => {
    setBusy(true);
    setError("");
    try {
      const result = (await request(`/api/projects/${snapshot!.project.id}/work-intents/${workId}/review`, {
        method: "POST",
        body: JSON.stringify({ actor: user?.login || "Project owner" }),
      })) as { snapshot: ProjectSnapshot; workspaceAccess: WorkspaceAccess | null };
      setSnapshot(result.snapshot);
      setWorkspaceAccess(result.workspaceAccess);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not authorize this work.");
    } finally {
      setBusy(false);
    }
  };

  const assessWork = async (workId: string) => {
    setBusy(true);
    setError("");
    try {
      const report = (await request(`/api/projects/${snapshot!.project.id}/work-intents/${workId}/assessment`, {
        method: "POST",
      })) as WorkPlanAssessment;
      setAssessments((cur) => ({ ...cur, [workId]: report }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assess this work plan.");
    } finally {
      setBusy(false);
    }
  };

  const chooseProject = (val: string) => {
    const slugVal = val.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);
    localStorage.setItem(PROJECT_KEY, slugVal);
    setProjectId(slugVal);
  };

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error(`Sign out failed (${res.status})`);
      setUser(null);
      setSnapshot(null);
      setProjectId("");
      localStorage.removeItem(PROJECT_KEY);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out.");
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="loading">
        <Brand />
        <div className="loader" />
        <p>Verifying authentication session…</p>
      </div>
    );
  }

  if (!user && !token) {
    return <LoginGate error={error} onUseDevToken={() => { localStorage.setItem(TOKEN_KEY, "dev-token"); setToken("dev-token"); }} isDev={DEVELOPMENT} />;
  }

  // If project is still loading, show loading spinner
  if (!snapshot) {
    return (
      <div className="loading">
        <Brand />
        <div className="loader" />
        <p>Connecting to Mission Control Cockpit…</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="loading">
        <Brand />
        <div className="loader" />
        <p>{error || "Opening project cockpit…"}</p>
        <button type="button" className="button outline small" onClick={() => void refresh()}>Try again</button>
        <button type="button" className="text-button" onClick={() => { localStorage.removeItem(PROJECT_KEY); setProjectId(""); }}>
          Switch project
        </button>
      </div>
    );
  }

  const activeIntents = snapshot.work.filter((i) =>
    ["needs_resolution", "ready_for_review", "authorized", "in_progress", "submitted", "needs_alignment"].includes(i.status)
  );

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <ProjectBar
        snapshot={snapshot}
        user={user}
        actorMode={actorMode}
        onActorModeChange={setActorMode}
        onConnectAgent={() => void createAgentToken()}
        onRefresh={() => void refresh()}
        onLogout={() => void logout()}
        onSwitchProject={() => { localStorage.removeItem(PROJECT_KEY); setSnapshot(null); setProjectId(""); }}
        onCreateProject={() => setCreateOpen(true)}
        busy={busy}
        isDev={DEVELOPMENT}
      />

      <div style={{ display: "flex", flex: 1 }}>
        <NavigationRail
          snapshot={snapshot}
          activeSection={activeSection}
          onSelectSection={(sec) => {
            setActiveSection(sec);
            setDecisionIntent(null);
            setReviewIntent(null);
          }}
          activeTaskCount={activeIntents.length}
          onShowRepoAccess={() => void showRepositoryAccess()}
        />

        <main style={{ flex: 1, padding: "24px 32px 48px", overflowY: "auto" }}>
          {error && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 14px",
                background: "#fff5f5",
                border: "1px solid var(--status-blocked)",
                borderRadius: "8px",
                color: "var(--status-blocked)",
                fontSize: "12px",
                marginBottom: "16px",
              }}
            >
              <CircleAlert size={14} />
              <span style={{ flex: 1 }}>{error}</span>
              <button type="button" className="button quiet small" onClick={() => setError("")} style={{ padding: "2px" }}>
                <X size={14} />
              </button>
            </div>
          )}

          {actorMode === "agent" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ borderBottom: "1px solid var(--border-subtle)", paddingBottom: "12px" }}>
                <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)" }}>
                  Agent Protocol & Model Context Bus
                </h2>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
                  Autonomous agents query the project context, register intent, and run tools via standard MCP JSON-RPC.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-muted)", borderRadius: "10px", padding: "18px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--brand)", fontFamily: "var(--font-mono)" }}>
                    ACTIVE MCP INTERFACE DEFINITIONS
                  </div>
                  <pre style={{ marginTop: "10px" }}>
{`• get_project_context({ projectId })
• propose_work({ outcome, scope, assumptions, interfaces, evidence })
• run_workspace_command({ projectId, workId, argv })
• submit_work_result({ projectId, workId, commit, summary, evidence })`}
                  </pre>
                </div>

                <div style={{ background: "var(--surface-panel)", border: "1px solid var(--border-muted)", borderRadius: "10px", padding: "18px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--status-accepted)", fontFamily: "var(--font-mono)" }}>
                    DURABLE OBJECT STATE SERIALIZATION
                  </div>
                  <pre style={{ marginTop: "10px", maxHeight: "240px" }}>
                    {JSON.stringify(
                      {
                        project: snapshot.project,
                        activeGrants: snapshot.grants.filter((g) => g.status === "active"),
                        workCount: activeIntents.length,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </div>
          ) : decisionIntent ? (
            <DecisionLens
              intent={decisionIntent}
              snapshot={snapshot}
              assessment={assessments[decisionIntent.id]}
              onBack={() => setDecisionIntent(null)}
              busy={busy}
              onResolve={async (action, contractDetails) => {
                if (action === "define_contract" && contractDetails) {
                  const updatedDecisions = [
                    ...snapshot.plan.decisions.filter((d) => d.name !== contractDetails.title),
                    { name: contractDetails.title, value: contractDetails.semantics },
                  ];
                  await mutate(`/api/projects/${snapshot.project.id}/plan`, {
                    method: "PUT",
                    body: JSON.stringify({
                      goal: snapshot.plan.goal,
                      constraints: snapshot.plan.constraints,
                      decisions: updatedDecisions,
                      actor: user?.login || "Project owner",
                    }),
                  });
                  setDecisionIntent(null);
                } else if (action === "adopt_a") {
                  await authorizeWork(decisionIntent.id);
                  setDecisionIntent(null);
                } else {
                  setDecisionIntent(null);
                }
              }}
            />
          ) : reviewIntent ? (
            <CommitReview4D
              intent={reviewIntent}
              grant={snapshot.grants.find((g) => g.workId === reviewIntent.id && g.status === "active")}
              snapshot={snapshot}
              onBack={() => setReviewIntent(null)}
              busy={busy}
              onAccept={async () => {
                await mutate(`/api/projects/${snapshot.project.id}/work-intents/${reviewIntent.id}/accept`, {
                  method: "POST",
                  body: JSON.stringify({ actor: user?.login || "Project owner" }),
                });
                setReviewIntent(null);
              }}
              onReject={async () => {
                await mutate(`/api/projects/${snapshot.project.id}/work-intents/${reviewIntent.id}/reject`, {
                  method: "POST",
                  body: JSON.stringify({ actor: user?.login || "Project owner" }),
                });
                setReviewIntent(null);
              }}
            />
          ) : activeSection === "plan" ? (
            <PlanView
              snapshot={snapshot}
              busy={busy}
              onSave={(plan) =>
                void mutate(`/api/projects/${snapshot.project.id}/plan`, {
                  method: "PUT",
                  body: JSON.stringify({ ...plan, actor: user?.login || "Project owner" }),
                })
              }
            />
          ) : (
            <MissionControl
              snapshot={snapshot}
              onSelectIntent={(intent) => {
                
                if (intent.status === "submitted" || intent.status === "ready_for_review") {
                  setReviewIntent(intent);
                } else {
                  void assessWork(intent.id);
                }
              }}
              onOpenDecisionLens={(intent) => {
                setDecisionIntent(intent);
                void assessWork(intent.id);
              }}
              onReviewCandidate={(intent) => setReviewIntent(intent)}
              onProposeWork={() => setWorkOpen(true)}
              connectedAgents={connectedAgents}
            />
          )}
        </main>
      </div>

      <EventTicker activity={snapshot.activity} />

      {/* Global Dialogs */}
      {createOpen && (
        <ProjectDialog
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onSubmit={async (input) => {
            setBusy(true);
            setError("");
            try {
              const res = (await request("/api/projects", { method: "POST", body: JSON.stringify(input) })) as {
                snapshot: ProjectSnapshot;
                repositoryAccess: RepositoryAccess | null;
              };
              chooseProject(input.id);
              setSnapshot(res.snapshot);
              setRepoAccess(res.repositoryAccess);
              setCreateOpen(false);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not create project.");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      {workOpen && (
        <WorkDialog
          busy={busy}
          onClose={() => setWorkOpen(false)}
          onSubmit={(input) => {
            void mutate(`/api/projects/${snapshot.project.id}/work-intents`, {
              method: "POST",
              body: JSON.stringify(input),
            }).then(() => setWorkOpen(false));
          }}
        />
      )}

      {repoAccess && <RepositoryAccessDialog access={repoAccess} onClose={() => setRepoAccess(null)} />}
      {workspaceAccess && <WorkspaceAccessDialog access={workspaceAccess} onClose={() => setWorkspaceAccess(null)} />}
      {agentAccess && <AgentAccessDialog access={agentAccess} onClose={() => setAgentAccess(null)} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
