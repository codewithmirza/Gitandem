import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Check, CircleAlert, Command, GitBranch, Layers2, LockKeyhole, Plus, RotateCw, Shield, Sparkles, X } from "lucide-react";
import type { ProjectPlan, ProjectSnapshot, WorkGrant, WorkIntent } from "@gitandem/core";
import "./styles.css";

const TOKEN_KEY = "gitandem:api-token";
const PROJECT_KEY = "gitandem:project";
type RepositoryAccess = { remote: string; token: string; expiresAt?: string; importedFrom?: string };
type WorkspaceAccess = { workId: string; remote: string; defaultBranch: string; baseCommit: string };
const lines = (text: string) => text.split("\n").map((part) => part.trim()).filter(Boolean);
const parsePairs = (text: string) => lines(text).map((line) => { const at = line.indexOf(":"); return at < 0 ? { name: line, value: "" } : { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() }; }).filter((item) => item.name && item.value);
const slug = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 63);

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [projectId, setProjectId] = useState(() => localStorage.getItem(PROJECT_KEY) ?? "");
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [repoAccess, setRepoAccess] = useState<RepositoryAccess | null>(null);
  const [workspaceAccess, setWorkspaceAccess] = useState<WorkspaceAccess | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"project" | "plan">("project");
  const [createOpen, setCreateOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  }, [token]);
  const refresh = useCallback(async () => {
    if (!token || !projectId) return;
    try { setError(""); setSnapshot(await request(`/api/projects/${encodeURIComponent(projectId)}`) as ProjectSnapshot); }
    catch (e) { setSnapshot(null); setError(e instanceof Error ? e.message : "Could not load this project."); }
  }, [projectId, request, token]);
  useEffect(() => { void refresh(); }, [refresh]);
  const mutate = async (path: string, init: RequestInit) => {
    setBusy(true); setError("");
    try { const result = await request(path, init); if (result && typeof result === "object" && "project" in result) setSnapshot(result as ProjectSnapshot); else await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "The request could not be completed."); }
    finally { setBusy(false); }
  };
  const showRepositoryAccess = async () => {
    if (!snapshot) return;
    setBusy(true); setError("");
    try { setRepoAccess(await request(`/api/projects/${snapshot.project.id}/repository-token`, { method: "POST" }) as RepositoryAccess); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not issue a repository token."); }
    finally { setBusy(false); }
  };
  const authorizeWork = async (workId: string) => {
    setBusy(true); setError("");
    try {
      const result = await request(`/api/projects/${snapshot!.project.id}/work-intents/${workId}/review`, { method: "POST", body: JSON.stringify({ actor: "Project owner" }) }) as { snapshot: ProjectSnapshot; workspaceAccess: WorkspaceAccess | null };
      setSnapshot(result.snapshot);
      setWorkspaceAccess(result.workspaceAccess);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not authorize this work."); }
    finally { setBusy(false); }
  };
  const saveToken = (value: string) => { localStorage.setItem(TOKEN_KEY, value.trim()); setToken(value.trim()); };
  const chooseProject = (value: string) => { const next = slug(value); localStorage.setItem(PROJECT_KEY, next); setProjectId(next); };

  if (!token) return <TokenGate onSave={saveToken} error={error} />;
  if (!projectId || (!snapshot && /not found|Unauthorized/i.test(error))) return <StartPage onCreate={() => setCreateOpen(true)} onToken={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); }} error={error} />;
  if (!snapshot) return <div className="loading"><Brand /><div className="loader" /><p>{error || "Opening project…"}</p><button className="button quiet" onClick={() => void refresh()}>Try again</button><button className="text-button" onClick={() => { localStorage.removeItem(PROJECT_KEY); setProjectId(""); }}>Choose another project</button></div>;

  const active = snapshot.work.filter((item) => ["needs_resolution", "ready_for_review", "authorized", "in_progress", "submitted", "needs_alignment"].includes(item.status));
  const reviewCount = active.filter((item) => item.status === "ready_for_review" || item.status === "needs_resolution" || item.status === "needs_alignment" || item.status === "submitted").length;
  return <div className="shell">
    <header className="topbar"><Brand /><div className="top-project"><span className="slash">/</span><span>{snapshot.project.name}</span><span className="repo-tag"><GitBranch size={13} />{snapshot.project.repository ? "Gitandem repo" : "Local plan mode"}</span></div><div className="top-actions">{snapshot.project.repository && <button className="button quiet repo-access-button" disabled={busy} onClick={() => void showRepositoryAccess()}>Git access <ArrowUpRight size={14} /></button>}<button className="icon-button" title="Refresh" onClick={() => void refresh()}><RotateCw size={16} /></button><button className="avatar" title="Change API token" onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); }}><LockKeyhole size={14} /></button></div></header>
    <main className="content">
      <div className="crumb">PROJECT <span>/</span> {snapshot.project.id.toUpperCase()}</div>
      <section className="intro"><div><div className="kicker"><span className="pulse" /> SHARED PROJECT · PLAN REVISION {snapshot.project.revision}</div><h1>{view === "plan" ? "The plan comes first." : <>Give every agent<br />the <em>same direction.</em></>}</h1><p>{view === "plan" ? "This is the current agreement. Work intents are checked against it before an agent receives permission to act." : "Agents tell Gitandem what they intend to build before they start. Gitandem checks that work against the shared plan."}</p></div><div className="intro-mark"><span>G</span><i /><i /><i /></div></section>
      {error && <div className="notice"><CircleAlert size={16} />{error}<button className="icon-button" onClick={() => setError("")}><X size={15} /></button></div>}
      <div className="tabs"><button className={view === "project" ? "active" : ""} onClick={() => setView("project")}>Work overview <span>{active.length}</span></button><button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>Shared plan <span>v{snapshot.project.revision}</span></button><div className="tabs-fill" /><button className="button primary" onClick={() => setWorkOpen(true)}><Plus size={16} /> Propose work</button></div>

      {view === "plan" ? <PlanView snapshot={snapshot} busy={busy} onSave={(plan) => void mutate(`/api/projects/${snapshot.project.id}/plan`, { method: "PUT", body: JSON.stringify({ ...plan, actor: "Project owner" }) })} /> : <>
        <section className="plan-strip"><div className="plan-symbol"><Layers2 size={19} /></div><div className="plan-summary"><span className="label">APPROVED PROJECT GOAL</span><p>{snapshot.plan.goal}</p><span className="subtle">{snapshot.plan.constraints.length} constraints <i /> {snapshot.plan.decisions.length} shared decisions</span></div><button className="button outline" onClick={() => setView("plan")}>Open plan <ArrowUpRight size={15} /></button></section>
        <section className="section-heading"><div><div className="kicker">BEFORE ANY CODE CHANGES</div><h2>Work intents</h2><p>Scope and interfaces are agreed here, before implementation begins.</p></div><div className="review-counter"><b>{reviewCount.toString().padStart(2, "0")}</b><span>NEED REVIEW</span></div></section>
        {active.length ? <div className="work-list">{active.map((item) => <WorkCard key={item.id} item={item} grant={snapshot.grants.find((grant) => grant.workId === item.id && grant.status === "active")} busy={busy} onAction={(action) => action === "review" ? void authorizeWork(item.id) : action === "accept" ? void mutate(`/api/projects/${snapshot.project.id}/work-intents/${item.id}/accept`, { method: "POST", body: JSON.stringify({ actor: "Project owner" }) }) : void mutate(`/api/projects/${snapshot.project.id}/work-intents/${item.id}/reject`, { method: "POST", body: JSON.stringify({ actor: "Project owner" }) })} />)}</div> : <div className="empty-state"><div className="empty-icon"><Sparkles size={19} /></div><h3>No work is underway.</h3><p>When an agent is asked to work, it should propose a plan first. Review that intent here before granting access to execution.</p><button className="button primary" onClick={() => setWorkOpen(true)}><Plus size={16} /> Create a work intent</button></div>}
        <section className="lower-grid"><div className="subsection"><div className="subsection-head"><div><div className="kicker">TRACEABLE CHANGES</div><h3>Coordination history</h3></div><span className="label">LATEST</span></div>{snapshot.activity.length ? snapshot.activity.slice(0, 6).map((event) => <div className="activity" key={event.id}><span className="activity-mark"><Check size={12} /></span><div><b>{event.actor}</b><p>{event.detail}</p></div><time>{new Date(event.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time></div>) : <p className="muted">New project activity will appear here.</p>}</div>
          <aside className="principle"><div className="principle-icon"><Shield size={18} /></div><div className="kicker">AUTHORITY STAYS EXPLICIT</div><h3>A proposal is not permission.</h3><p>Gitandem only creates a scoped work grant after review. If the plan changes, active grants are revoked and intents must be aligned again.</p><div className="principle-foot"><span>PLAN REVISION</span><code>{String(snapshot.project.revision).padStart(3, "0")}</code></div></aside></section>
      </>}
      <footer><span><Command size={13} /> GITANDEM</span><span>Projects <i /> Plans <i /> Work grants</span><button onClick={() => { localStorage.removeItem(PROJECT_KEY); setSnapshot(null); setProjectId(""); }}>Switch project</button></footer>
    </main>
    {createOpen && <ProjectDialog busy={busy} onClose={() => setCreateOpen(false)} onSubmit={async (input) => { setBusy(true); setError(""); try { const result = await request("/api/projects", { method: "POST", body: JSON.stringify(input) }) as { snapshot: ProjectSnapshot; repositoryAccess: RepositoryAccess | null }; chooseProject(input.id); setSnapshot(result.snapshot); setRepoAccess(result.repositoryAccess); setCreateOpen(false); } catch (e) { setError(e instanceof Error ? e.message : "Could not create project."); } finally { setBusy(false); } }} />}
    {workOpen && <WorkDialog busy={busy} onClose={() => setWorkOpen(false)} onSubmit={(input) => { void mutate(`/api/projects/${snapshot.project.id}/work-intents`, { method: "POST", body: JSON.stringify(input) }).then(() => setWorkOpen(false)); }} />}
    {repoAccess && <RepositoryAccessDialog access={repoAccess} onClose={() => setRepoAccess(null)} />}
    {workspaceAccess && <WorkspaceAccessDialog access={workspaceAccess} onClose={() => setWorkspaceAccess(null)} />}
  </div>;
}

function Brand() { return <div className="brand"><span className="brand-glyph">g<span>.</span></span><span>gitandem</span></div>; }

function TokenGate({ onSave, error }: { onSave: (value: string) => void; error: string }) {
  const [value, setValue] = useState("");
  return <main className="gate"><div className="gate-lines" /><div className="gate-card"><Brand /><div className="kicker">A SHARED PLACE FOR AGENT WORK</div><h1>Plan together.<br /><em>Build with intent.</em></h1><p>Gitandem checks what agents plan to do against a shared project plan before they get permission to work.</p><form onSubmit={(e) => { e.preventDefault(); onSave(value); }}><label htmlFor="token">Local API token</label><div className="field-row"><input id="token" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Paste your development token" autoComplete="current-password" /><button className="button primary" disabled={!value.trim()}>Connect <ArrowRight size={16} /></button></div></form><div className="gate-note"><LockKeyhole size={14} /><span>This local prototype uses a development token. Your token stays in this browser.</span></div>{error && <div className="form-error">{error}</div>}</div><div className="gate-caption">COORDINATION BEFORE EXECUTION <span>·</span> OPEN SOURCE</div></main>;
}

function StartPage({ onCreate, onToken, error }: { onCreate: () => void; onToken: () => void; error: string }) {
  return <main className="gate"><div className="gate-lines" /><div className="gate-card start-card"><Brand /><div className="kicker">YOUR PROJECT SPACE</div><h1>Start with the<br /><em>shared plan.</em></h1><p>Create a local coordination project now. A deployed Gitandem project also creates or imports its canonical Gitandem repository.</p><button className="button primary wide" onClick={onCreate}>Create or import a project <ArrowRight size={16} /></button><div className="start-options"><div><b>Local development</b><span>Run the plan and work-intent flow without remote Cloudflare resources.</span></div><ArrowDownRight size={17} /><div><b>Deployed project</b><span>Create a repo or import a public HTTPS Git remote using Artifacts.</span></div></div><button className="text-button" onClick={onToken}>Change local token</button>{error && <div className="form-error">{error}</div>}</div><div className="gate-caption">A PROJECT HOST FOR AGENTIC WORK</div></main>;
}

function ProjectDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: { id: string; name: string; goal: string; constraints: string[]; repositoryMode: "create" | "import"; sourceUrl?: string; sourceBranch?: string }) => void }) {
  const [name, setName] = useState(""); const [goal, setGoal] = useState(""); const [sourceUrl, setSourceUrl] = useState(""); const [sourceBranch, setSourceBranch] = useState(""); const [constraints, setConstraints] = useState(""); const [mode, setMode] = useState<"create" | "import">("create");
  return <Dialog title="Create a project" subtitle="Start with the project goal. A deployed project also gets its canonical Git repository." onClose={onClose}><form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ id: slug(name), name: name.trim(), goal: goal.trim(), constraints: lines(constraints), repositoryMode: mode, sourceUrl: mode === "import" ? sourceUrl.trim() : undefined, sourceBranch: mode === "import" ? sourceBranch.trim() || undefined : undefined }); }}><div className="choice-row"><button type="button" className={mode === "create" ? "choice selected" : "choice"} onClick={() => setMode("create")}><b>New repository</b><span>Available on a deployed Worker</span></button><button type="button" className={mode === "import" ? "choice selected" : "choice"} onClick={() => setMode("import")}><b>Import Git remote</b><span>Public HTTPS remote; deployed Worker</span></button></div><Field label="Project name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Inventory service" required /></Field><Field label="What are we building?"><textarea value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Describe the outcome this project should deliver…" required rows={3} /></Field>{mode === "import" && <><Field label="Public HTTPS Git remote"><input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://github.com/owner/repository.git" required /></Field><Field label="Branch (optional)"><input value={sourceBranch} onChange={(e) => setSourceBranch(e.target.value)} placeholder="Use the source repository default" /></Field></>}<Field label="Starting constraints (one per line)"><textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} placeholder="Keep the public API backwards compatible" rows={2} /></Field><div className="dialog-footnote">Local development creates a plan-only project. Repository setup uses Cloudflare Artifacts on an eligible deployed account.</div><div className="dialog-actions"><button type="button" className="button outline" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !slug(name) || !goal.trim() || (mode === "import" && !sourceUrl.trim())}>{busy ? (mode === "import" ? "Importing…" : "Creating…") : (mode === "import" ? "Import project" : "Create project")}<ArrowRight size={15} /></button></div></form></Dialog>;
}

function RepositoryAccessDialog({ access, onClose }: { access: RepositoryAccess; onClose: () => void }) {
  const remoteCommand = access.importedFrom
    ? `git remote add gitandem ${access.remote}\ngit -c http.extraHeader="Authorization: Bearer ${access.token}" fetch gitandem`
    : `git remote add gitandem ${access.remote}\ngit -c http.extraHeader="Authorization: Bearer ${access.token}" push -u gitandem HEAD:main`;
  return <Dialog title="Connect your Git client" subtitle="This write token is short-lived and can push only to this repository. Keep it private." onClose={onClose}><div className="repo-info"><span className="label">GIT REMOTE</span><code>{access.remote}</code>{access.importedFrom && <p>Imported from <a href={access.importedFrom} target="_blank" rel="noreferrer">{access.importedFrom}</a></p>}</div><div className="token-panel"><span className="label">TEMPORARY WRITE TOKEN · EXPIRES IN 15 MINUTES</span><code>{access.token}</code></div><div className="command-panel"><div><span className="label">CONNECT A LOCAL FOLDER</span><button className="text-button" onClick={() => void navigator.clipboard.writeText(remoteCommand)}>Copy commands</button></div><pre>{remoteCommand}</pre></div><div className="dialog-footnote">The token is shown only for this session. You can issue another from Git access when needed.</div><div className="dialog-actions"><button className="button primary" onClick={onClose}>Done <Check size={15} /></button></div></Dialog>;
}

function WorkspaceAccessDialog({ access, onClose }: { access: WorkspaceAccess; onClose: () => void }) {
  return <Dialog title="Work is authorized" subtitle="The proposing agent can now use the run_workspace_command tool. Its commands run in an isolated Linux container connected to this task repository." onClose={onClose}><div className="repo-info"><span className="label">ISOLATED TASK REPOSITORY · {access.defaultBranch}</span><code>{access.remote}</code><p>Based on commit {access.baseCommit.slice(0, 12)} · intent {access.workId.slice(0, 8)}</p></div><div className="dialog-footnote">Git credentials stay in Gitandem and are revoked after each command. The agent works in this task's environment through MCP.</div><div className="dialog-actions"><button className="button primary" onClick={onClose}>Done <Check size={15} /></button></div></Dialog>;
}

function WorkDialog({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (input: Omit<WorkIntent, "id" | "status" | "issues" | "planRevision" | "createdAt">) => void }) {
  const [agent, setAgent] = useState(""); const [outcome, setOutcome] = useState(""); const [scope, setScope] = useState(""); const [assumptions, setAssumptions] = useState(""); const [interfaces, setInterfaces] = useState(""); const [dependencies, setDependencies] = useState(""); const [acceptance, setAcceptance] = useState("");
  return <Dialog title="Propose a piece of work" subtitle="Describe the intended change first. Gitandem checks this against the shared plan and other active intents." onClose={onClose}><form className="dialog-form" onSubmit={(e) => { e.preventDefault(); onSubmit({ agent: agent.trim() || "Agent", outcome: outcome.trim(), scope: lines(scope), assumptions: lines(assumptions), interfaces: parsePairs(interfaces).map(({ name, value }) => ({ name, proposal: value })), dependencies: lines(dependencies), acceptance: lines(acceptance) }); }}><Field label="Agent or contributor"><input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="Agent name" /></Field><Field label="Intended outcome"><textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="What should be true when this work is done?" required rows={2} /></Field><div className="form-columns"><Field label="Scope (one item per line)"><textarea value={scope} onChange={(e) => setScope(e.target.value)} placeholder="checkout flow" required rows={3} /></Field><Field label="Acceptance evidence (one per line)"><textarea value={acceptance} onChange={(e) => setAcceptance(e.target.value)} placeholder="A declined card shows a retry option" required rows={3} /></Field></div><Field label="Assumptions (one per line)"><textarea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} placeholder="The payment provider remains unchanged" rows={2} /></Field><Field label="Shared interfaces (name: proposal, one per line)"><textarea value={interfaces} onChange={(e) => setInterfaces(e.target.value)} placeholder="Error response: { code, message }" rows={2} /></Field><Field label="Dependencies (one per line)"><textarea value={dependencies} onChange={(e) => setDependencies(e.target.value)} placeholder="Needs the account API first" rows={2} /></Field><div className="dialog-actions"><button type="button" className="button outline" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || !outcome.trim() || !lines(scope).length || !lines(acceptance).length}>{busy ? "Submitting…" : "Submit intent"}<ArrowRight size={15} /></button></div></form></Dialog>;
}

function PlanView({ snapshot, busy, onSave }: { snapshot: ProjectSnapshot; busy: boolean; onSave: (plan: ProjectPlan) => void }) {
  const [goal, setGoal] = useState(snapshot.plan.goal); const [constraints, setConstraints] = useState(snapshot.plan.constraints.join("\n")); const [decisions, setDecisions] = useState(snapshot.plan.decisions.map((item) => `${item.name}: ${item.value}`).join("\n"));
  useEffect(() => { setGoal(snapshot.plan.goal); setConstraints(snapshot.plan.constraints.join("\n")); setDecisions(snapshot.plan.decisions.map((item) => `${item.name}: ${item.value}`).join("\n")); }, [snapshot]);
  return <section className="plan-editor"><div className="plan-editor-head"><div><div className="kicker">THE SHARED AGREEMENT</div><h2>Project plan <span>v{snapshot.project.revision}</span></h2><p>Changing this plan sends active work back for alignment and revokes its current grants.</p></div><div className="revision-stamp">REVISION <b>{String(snapshot.project.revision).padStart(3, "0")}</b></div></div><div className="editor-fields"><Field label="Project goal"><textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={4} /></Field><Field label="Constraints (one per line)"><textarea value={constraints} onChange={(e) => setConstraints(e.target.value)} rows={5} placeholder="Things all work must preserve" /></Field><Field label="Shared decisions (name: agreed value, one per line)"><textarea value={decisions} onChange={(e) => setDecisions(e.target.value)} rows={5} placeholder="Runtime: Cloudflare Workers" /></Field></div><div className="dialog-actions"><button className="button primary" disabled={busy || !goal.trim()} onClick={() => onSave({ goal, constraints: lines(constraints), decisions: parsePairs(decisions) })}>{busy ? "Saving…" : "Save new plan revision"}<ArrowRight size={15} /></button></div></section>;
}

function WorkCard({ item, grant, busy, onAction }: { item: WorkIntent; grant?: WorkGrant; busy: boolean; onAction: (action: "review" | "reject" | "accept") => void }) {
  const needs = item.status === "needs_resolution" || item.status === "needs_alignment";
  return <article className={`work-card ${needs ? "work-needs" : ""}`}>
    <div className="work-card-top"><div className="work-id"><span className={`status-dot ${needs ? "amber" : item.status === "authorized" || item.status === "in_progress" ? "green" : ""}`} /><span>{item.agent}</span><span className="work-separator">/</span><code>INTENT {item.id.slice(0, 7).toUpperCase()}</code></div><Status status={item.status} /></div>
    <h3>{item.outcome}</h3>
    {item.issues.length > 0 && <div className="conflict-box"><CircleAlert size={15} /><div><b>{item.status === "needs_alignment" ? "This intent needs a fresh review" : "Resolve before granting access"}</b>{item.issues.map((issue) => <p key={issue.id}>{issue.message}</p>)}</div></div>}
    <details className="intent-details"><summary>View declared scope and evidence <span>Plan revision {String(item.planRevision).padStart(3, "0")}</span></summary>
      <div className="work-detail-grid"><div><span className="label">SCOPE</span><div className="chips">{item.scope.map((part) => <code key={part}>{part}</code>)}</div></div><div><span className="label">ACCEPTANCE EVIDENCE</span><ul>{item.acceptance.map((part) => <li key={part}>{part}</li>)}</ul></div></div>
      {item.assumptions.length > 0 && <div className="assumption-line"><span>ASSUMPTIONS</span>{item.assumptions.join(" · ")}</div>}
      {item.interfaces.length > 0 && <div className="interfaces">{item.interfaces.map((part) => <div key={part.name}><span>{part.name}</span><code>{part.proposal}</code></div>)}</div>}
      {item.dependencies.length > 0 && <div className="assumption-line"><span>DEPENDENCIES</span>{item.dependencies.join(" · ")}</div>}
    </details>
    {item.result && <div className="repo-info result-info"><span className="label">SUBMITTED RESULT · {item.result.commit.slice(0, 12)}</span><p>{item.result.summary}</p><div className="chips">{item.result.evidence.map((part) => <code key={part}>{part}</code>)}</div></div>}
    {grant?.workspace && <div className="assumption-line"><span>AUTHORIZED WORKSPACE</span><a href={grant.workspace.remote}>{grant.workspace.remote}</a> · {grant.workspace.defaultBranch}</div>}
    <div className="work-footer"><span>PLAN REVISION {String(item.planRevision).padStart(3, "0")}{item.baseCommit ? ` · BASE ${item.baseCommit.slice(0, 8)}` : " · NO CODE BASE ATTACHED"}</span><div>{item.status !== "authorized" && item.status !== "in_progress" && item.status !== "accepted" && <button className="button quiet" disabled={busy} onClick={() => onAction("reject")}>Reject</button>}{item.status === "ready_for_review" && <button className="button primary small" disabled={busy} onClick={() => onAction("review")}><Check size={14} /> Authorize work</button>}{item.status === "submitted" && <button className="button primary small" disabled={busy} onClick={() => onAction("accept")}><Check size={14} /> Accept into project</button>}</div></div>
  </article>;
}

function Status({ status }: { status: WorkIntent["status"] }) { const copy: Record<WorkIntent["status"], string> = { needs_resolution: "Needs decision", ready_for_review: "Ready for review", authorized: "Authorized", in_progress: "In progress", submitted: "Submitted", accepted: "Accepted", rejected: "Rejected", needs_alignment: "Needs alignment" }; return <span className={`status status-${status}`}>{copy[status]}</span>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Dialog({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) { return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section className="modal"><div className="modal-head"><div><div className="kicker">GITANDEM · PROJECT CONTROL</div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={17} /></button></div>{children}</section></div>; }

createRoot(document.getElementById("root")!).render(<App />);
