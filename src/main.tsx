import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, ArrowRight, ArrowUpRight, Bell, Blocks, Bot, Check, CheckCheck, ChevronDown, CircleAlert, CircleHelp, Code2, GitBranch, GitCommitHorizontal, GitFork, GitPullRequest, KeyRound, Layers3, LoaderCircle, LockKeyhole, Menu, MoreHorizontal, Plus, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";
import { Badge, Button, Card } from "gitandem-design-system";
import "gitandem-design-system/tokens.css";
import type { ActivityEvent, Decision, ProjectSnapshot, Proposal } from "./types";
import "./styles.css";

const TOKEN_KEY = "gitandem:api-token";
const PROJECT_ID = "atlas-commerce";
const timeAgo = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hr ago` : `${Math.floor(hours / 24)} days ago`;
};

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [tokenDraft, setTokenDraft] = useState("");
  const [snapshot, setSnapshot] = useState<ProjectSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"decision" | "assignment" | "revise" | null>(null);
  const [revisingProposal, setRevisingProposal] = useState<Proposal | null>(null);
  const [activeNav, setActiveNav] = useState("Overview");
  const [mobileNav, setMobileNav] = useState(false);

  const request = useCallback(async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`);
    return data;
  }, [token]);

  const load = useCallback(async (fresh = false) => {
    if (!token) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      let data: ProjectSnapshot;
      if (fresh) data = await request<ProjectSnapshot>("/api/demo", "POST", {});
      else {
        try { data = await request<ProjectSnapshot>(`/api/projects/${PROJECT_ID}`); }
        catch (err) {
          if (err instanceof Error && /not initialized|not found/i.test(err.message)) data = await request<ProjectSnapshot>("/api/demo", "POST", {});
          else throw err;
        }
      }
      setSnapshot(data);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect to Gitandem."); setSnapshot(null); }
    finally { setLoading(false); }
  }, [request, token]);

  useEffect(() => { void load(); }, [load]);
  const proposals = snapshot?.proposals ?? [];
  const activeProposals = proposals.filter((proposal) => proposal.status !== "accepted" && proposal.status !== "rejected");
  const activeAgents = useMemo(() => Array.from(new Set((snapshot?.assignments ?? []).map((item) => item.agent))), [snapshot]);

  async function action(key: string, op: () => Promise<ProjectSnapshot>, success: string) {
    setBusy(key); setError(""); setNotice("");
    try { setSnapshot(await op()); setNotice(success); }
    catch (err) { setError(err instanceof Error ? err.message : "Action failed."); }
    finally { setBusy(null); }
  }

  function submitToken(event: React.FormEvent) {
    event.preventDefault();
    if (!tokenDraft.trim()) return;
    localStorage.setItem(TOKEN_KEY, tokenDraft.trim()); setToken(tokenDraft.trim()); setTokenDraft("");
  }
  function removeToken() { localStorage.removeItem(TOKEN_KEY); setToken(""); setSnapshot(null); }

  async function updateDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("decision", () => request<ProjectSnapshot>(`/api/projects/${PROJECT_ID}/decisions`, "POST", { key: String(form.get("key")).toLowerCase().replace(/[^a-z0-9-]/g, "-"), title: form.get("title"), value: form.get("value"), actor: "Mirza · Project owner" }), "Shared decision updated. Proposals on the previous version now need a fresh validation.");
    setDialog(null);
  }
  async function createAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("assignment", () => request<ProjectSnapshot>(`/api/projects/${PROJECT_ID}/assignments`, "POST", { title: form.get("title"), agent: form.get("agent") }), "Work assigned against the current project and contract versions.");
    setDialog(null);
  }
  async function reviseProposal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revisingProposal) return;
    const form = new FormData(event.currentTarget);
    await action(revisingProposal.id, () => request<ProjectSnapshot>(`/api/projects/${PROJECT_ID}/proposals/${revisingProposal.id}/revise`, "POST", { summary: form.get("summary"), body: form.get("body"), actor: revisingProposal.agent }), "Agent-reviewed proposal saved. Validate it against the latest shared context before accepting.");
    setDialog(null); setRevisingProposal(null);
  }

  if (!token) return <div className="connect-page"><div className="connect-card"><Brand /><div className="eyebrow">YOUR COORDINATION LAYER</div><h1>Give your agents<br />a shared source of truth.</h1><p>Connect the Gitandem API token for this local environment. Your token stays in this browser and is only sent to this server.</p><form onSubmit={submitToken} className="token-form"><label htmlFor="api-token">Development API token</label><div className="token-input"><KeyRound size={17} /><input id="api-token" autoComplete="off" type="password" value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} placeholder="Paste your local token"/><Button type="submit">Connect <ArrowRight size={15} /></Button></div></form><div className="connect-help"><LockKeyhole size={14}/> Set <code>GITANDEM_API_TOKEN</code> in <code>.dev.vars</code> before starting the local server.</div></div><div className="connect-orbit orbit-a"/><div className="connect-orbit orbit-b"/></div>;

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
      <div className="sidebar-brand"><Brand /><button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-switch"><div className="workspace-avatar">A</div><div className="workspace-meta"><b>Atlas workspace</b><span>Personal · Free</span></div><ChevronDown size={15} /></div>
      <div className="nav-group-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <NavItem icon={<Layers3 />} label="Overview" active={activeNav === "Overview"} onClick={() => { setActiveNav("Overview"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
        <NavItem icon={<GitPullRequest />} label="Changes" count={String(activeProposals.length)} active={activeNav === "Changes"} onClick={() => { setActiveNav("Changes"); document.getElementById("change-review")?.scrollIntoView({ behavior: "smooth" }); }} />
        <NavItem icon={<Blocks />} label="Contracts" active={activeNav === "Contracts"} onClick={() => { setActiveNav("Contracts"); document.getElementById("contracts-panel")?.scrollIntoView({ behavior: "smooth" }); }} />
        <NavItem icon={<Bot />} label="Agents" active={activeNav === "Agents"} onClick={() => { setActiveNav("Agents"); document.getElementById("active-agents")?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />
      </nav>
      <div className="nav-group-label nav-spaced">CONNECTIONS</div>
      <div className="connection-item"><div className="github-mark">⌘</div><div><b>GitHub</b><span>Connected</span></div><span className="connection-dot" /></div>
      <button className="connect-repo" onClick={() => setNotice("GitHub repository connection is ready to configure in a future integration step.")}><Plus size={15}/> Connect repository</button>
      <div className="sidebar-bottom"><div className="sidebar-help"><CircleHelp size={16}/><span>How Gitandem works</span><ArrowUpRight size={13}/></div><button className="profile-row" onClick={removeToken}><div className="profile-avatar">M</div><div><b>Mirza</b><span>Local developer</span></div><MoreHorizontal size={17}/></button></div>
    </aside>
    {mobileNav && <button className="nav-backdrop" onClick={() => setMobileNav(false)} aria-label="Close navigation"/>}
    <main className="main-area">
      <header className="topbar"><button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspaces</span><span className="crumb-slash">/</span><b>{snapshot?.project.name ?? "Atlas Commerce"}</b><ChevronDown size={14}/></div><div className="topbar-actions"><div className="search-pill"><Search size={15}/><span>Search anything</span><kbd>⌘ K</kbd></div><button className="icon-button top-icon" title="Notifications"><Bell size={17}/><i/></button><div className="avatar-stack"><span>CO</span><span>AI</span><span>+2</span></div></div></header>
      <div className="page-content">
        <div className="page-heading"><div><div className="eyebrow">MONDAY, OCTOBER 5, 2026 <span className="eyebrow-dot"/> TEAM WORKSPACE</div><h1>Good morning, Mirza <span className="wave">✳</span></h1><p>Shared context. Independent agents. Work that fits together.</p></div><div className="heading-actions"><Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? "spin" : ""}/> Sync</Button><Button onClick={() => setDialog("assignment")}><Plus size={16}/> Assign work</Button></div></div>
        {(error || notice) && <div className={`toast-banner ${error ? "toast-error" : "toast-success"}`}><span>{error || notice}</span><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss"><X size={15}/></button></div>}
        {loading && !snapshot ? <div className="loading-state"><LoaderCircle className="spin"/> Connecting to your shared workspace…</div> : snapshot ? <>
          <section className="overview-grid" aria-label="Project overview">
            <Card className="project-card" padding="none"><div className="project-card-top"><div className="repo-icon"><Code2 size={19}/></div><div className="repo-path"><div className="repo-title">{snapshot.project.name}<Badge hue="green" variant="muted">Active</Badge></div><div className="repo-subtitle"><span className="github-small">⌘</span>{snapshot.project.repository}<span className="repo-separator">·</span><GitBranch size={13}/> main</div></div><button className="icon-button" aria-label="Project options"><MoreHorizontal size={18}/></button></div><div className="project-card-stats" id="active-agents"><div><span>Project revision</span><b><GitCommitHorizontal size={14}/> r{String(snapshot.project.revision).padStart(3, "0")}</b></div><div><span>Active agents</span><b className="agent-faces">{activeAgents.slice(0, 3).map((agent, i) => <i key={agent} className={`agent-face face-${i}`}>{agent.split("·").pop()?.trim().slice(0, 1)}</i>)}<strong>{activeAgents.length} working</strong></b></div><div><span>Last activity</span><b><Activity size={14}/>{snapshot.activity[0] ? timeAgo(snapshot.activity[0].createdAt) : "—"}</b></div></div><div className="revision-line"><div className="revision-line-start"><span className="rev-dot"/><span>Coordinated workspace is up to date</span></div><span>{snapshot.proposals.filter((proposal) => proposal.status === "accepted").length} changes accepted</span></div></Card>
            <Card className="health-card" padding="none"><div className="health-head"><span className="health-icon"><ShieldCheck size={17}/></span><span>Coordination health</span><button className="icon-button" aria-label="Health info"><CircleHelp size={16}/></button></div><div className="health-score-row"><div className="health-score">{snapshot.proposals.some((p) => p.status === "stale") ? "83" : "100"}<span>/100</span></div><Badge hue={snapshot.proposals.some((p) => p.status === "stale") ? "yellow" : "green"} variant="muted">{snapshot.proposals.some((p) => p.status === "stale") ? "1 needs attention" : "All aligned"}</Badge></div><div className="health-meter"><span style={{ width: snapshot.proposals.some((p) => p.status === "stale") ? "83%" : "100%" }}/></div><div className="health-foot"><span>{snapshot.proposals.some((p) => p.status === "stale") ? "One proposal uses an older contract" : "No contract drift detected"}</span><ArrowUpRight size={14}/></div></Card>
          </section>

          <section id="change-review" className="section-head"><div><div className="section-title-line"><h2>Change review</h2><span className="count-pill">{activeProposals.length}</span></div><p>Agent work stays proposed until it fits the current shared context.</p></div><button className="text-action" onClick={() => setActiveNav("Changes")}>View change history <ArrowRight size={14}/></button></section>
          <section className="proposal-grid">
            {activeProposals.length ? activeProposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={busy === proposal.id} onValidate={() => action(proposal.id, async () => (await request<{ snapshot: ProjectSnapshot }>(`/api/projects/${PROJECT_ID}/proposals/${proposal.id}/validate`, "POST", {})).snapshot, "Proposal checked against current shared context.")} onRebase={() => action(proposal.id, () => request<ProjectSnapshot>(`/api/projects/${PROJECT_ID}/proposals/${proposal.id}/rebase`, "POST", {}), "Proposal rebased. Agent review is required before acceptance.")} onReview={() => { setRevisingProposal(proposal); setDialog("revise"); }} onAccept={() => action(proposal.id, () => request<ProjectSnapshot>(`/api/projects/${PROJECT_ID}/proposals/${proposal.id}/accept`, "POST", {}), "Change accepted. Shared project revision advanced.")} />) : <Card className="empty-proposals" padding="md"><CheckCheck size={22}/><b>Nothing waiting for review</b><span>New agent proposals will appear here.</span></Card>}
          </section>

          <section className="lower-grid"><div className="contracts-panel" id="contracts-panel"><div className="section-head compact"><div><h2>Shared contracts</h2><p>Decisions every agent builds against.</p></div><button className="icon-button" onClick={() => setDialog("decision")} title="Add shared decision"><Plus size={17}/></button></div><div className="contracts-list">{snapshot.decisions.map((decision) => <DecisionRow key={decision.key} decision={decision} />)}</div><button className="add-contract" onClick={() => setDialog("decision")}><Plus size={14}/> Add a shared decision</button></div>
            <div className="activity-panel"><div className="section-head compact"><div><h2>Activity</h2><p>The project’s shared memory, as it changes.</p></div><button className="text-action">All activity <ArrowRight size={14}/></button></div><div className="activity-list">{snapshot.activity.slice(0, 5).map((item) => <ActivityRow key={item.id} item={item}/>)}</div></div></section>
          <div className="bottom-note"><span className="tiny-mark"><GitFork size={13}/></span><span>Gitandem keeps coordination state beside your repository, not inside an agent’s private context.</span><button onClick={() => setNotice("Gitandem separates shared intent from Git history. Agents still work independently; changes become authoritative only after validation and acceptance.")}>See how it works <ArrowUpRight size={13}/></button></div>
        </> : <div className="error-state"><CircleAlert size={25}/><h2>Couldn’t open this workspace</h2><p>{error}</p><Button onClick={() => void load()}>Try again</Button><button className="change-token" onClick={removeToken}>Change API token</button></div>}
      </div>
      <footer className="app-footer"><span>GITANDEM <i/> PRIVATE BETA</span><span>BUILD TOGETHER, INDEPENDENTLY <Sparkles size={12}/></span></footer>
    </main>
    {dialog && <div className="dialog-backdrop" onClick={() => setDialog(null)}><div className="dialog-card" onClick={(event) => event.stopPropagation()}><div className="dialog-title"><div><span className="eyebrow">{dialog === "decision" ? "PROJECT CONTEXT" : dialog === "assignment" ? "DISTRIBUTE WORK" : "AGENT REVIEW"}</span><h2>{dialog === "decision" ? "Add a shared decision" : dialog === "assignment" ? "Create an assignment" : "Revise the proposal"}</h2></div><button className="icon-button" onClick={() => setDialog(null)}><X size={17}/></button></div><p>{dialog === "decision" ? "Agents receive this contract as versioned project context." : dialog === "assignment" ? "The work item will capture the current project revision and contract versions." : "Update the proposed change to show how it fits the current shared contracts."}</p><form onSubmit={dialog === "decision" ? updateDecision : dialog === "assignment" ? createAssignment : reviseProposal} className="dialog-form">{dialog === "decision" ? <><label>Decision title<input name="title" required placeholder="e.g. API error shape"/></label><label>Shared contract<textarea name="value" required rows={3} placeholder="Describe the decision agents must follow…"/></label><label>Key<input name="key" required placeholder="e.g. api-errors"/></label></> : dialog === "assignment" ? <><label>Work to assign<input name="title" required placeholder="e.g. Implement saved carts"/></label><label>Agent or client<input name="agent" required placeholder="e.g. Agent · Checkout"/></label></> : <><label>Change summary<input name="summary" required defaultValue={revisingProposal?.summary}/></label><label>Updated change description<textarea name="body" required rows={4} defaultValue={revisingProposal?.body}/></label><div className="review-context"><ShieldCheck size={14}/> Rebased on the current contract and project versions.</div></>}<div className="dialog-buttons"><Button type="button" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button><Button type="submit" disabled={Boolean(busy)}>{dialog === "decision" ? "Save decision" : dialog === "assignment" ? "Create assignment" : "Save reviewed proposal"}</Button></div></form></div></div>}
  </div>;
}

function Brand() { return <div className="brand"><div className="brand-symbol"><span/><span/><span/><span/></div><span>gitandem</span></div>; }
function NavItem({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count?: string; active: boolean; onClick: () => void }) { return <button className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span>{count && <small>{count}</small>}</button>; }
function ProposalCard({ proposal, busy, onValidate, onRebase, onReview, onAccept }: { proposal: Proposal; busy: boolean; onValidate: () => void; onRebase: () => void; onReview: () => void; onAccept: () => void }) {
  const stale = proposal.status === "stale";
  const needsReview = proposal.status === "needs_review";
  return <Card className={`proposal-card ${stale || needsReview ? "proposal-stale" : ""}`} padding="none"><div className="proposal-topline"><div className="proposal-agent"><div className={`proposal-agent-avatar ${stale || needsReview ? "avatar-amber" : "avatar-purple"}`}><Bot size={16}/></div><div><b>{proposal.agent}</b><span>submitted {timeAgo(proposal.createdAt)}</span></div></div><Badge hue={stale || needsReview ? "orange" : "purple"} variant="muted" icon={stale ? <CircleAlert size={12}/> : needsReview ? <RefreshCw size={12}/> : <GitPullRequest size={12}/>}>{stale ? "Stale context" : needsReview ? "Agent review" : "Needs review"}</Badge></div><h3>{proposal.summary}</h3><p className="proposal-body">{proposal.body}</p><div className={`proposal-validation ${stale || needsReview ? "validation-warn" : ""}`}><span>{stale ? <CircleAlert size={14}/> : <ShieldCheck size={14}/>}</span><div><b>{stale ? "Shared context changed" : needsReview ? "Reconciled version needed" : "Ready to validate"}</b><small>{stale ? (proposal.validation ?? "This proposal started from an earlier contract version.") : needsReview ? "Confirm the agent’s updated change before validation." : `Based on project r${String(proposal.baseRevision).padStart(3, "0")} · Current contracts`}</small></div><button className="icon-button" title="Validation info"><CircleHelp size={14}/></button></div><div className="proposal-footer"><button className="text-action details-action"><Code2 size={14}/> Review change <ArrowUpRight size={13}/></button><div className="proposal-buttons">{stale ? <><Button size="sm" variant="secondary" onClick={onRebase} disabled={busy}><GitBranch size={14}/> Rebase</Button><Button size="sm" onClick={onValidate} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>} Recheck</Button></> : needsReview ? <Button size="sm" onClick={onReview}><Check size={14}/> Confirm agent review</Button> : <><Button size="sm" variant="secondary" onClick={onValidate} disabled={busy}>{busy ? <LoaderCircle size={14} className="spin"/> : <ShieldCheck size={14}/>} Validate</Button><Button size="sm" onClick={onAccept} disabled={busy}><Check size={14}/> Accept change</Button></>}</div></div></Card>;
}
function DecisionRow({ decision }: { decision: Decision }) { return <div className="decision-row"><div className="decision-symbol"><Check size={14}/></div><div className="decision-copy"><b>{decision.title}</b><span>{decision.value}</span><small>Updated by {decision.updatedBy}</small></div><div className="decision-version">v{String(decision.version).padStart(2, "0")}</div><button className="icon-button decision-more" aria-label={`More about ${decision.title}`}><MoreHorizontal size={16}/></button></div>; }
function ActivityRow({ item }: { item: ActivityEvent }) { const accepted = item.type.includes("accepted"); const stale = item.type.includes("stale"); return <div className="activity-row"><div className={`activity-type ${accepted ? "event-green" : stale ? "event-amber" : "event-blue"}`}>{accepted ? <Check size={13}/> : stale ? <CircleAlert size={13}/> : <GitCommitHorizontal size={13}/>}</div><div className="activity-copy"><b>{item.actor}</b><span>{item.detail}</span></div><time>{timeAgo(item.createdAt)}</time></div>; }

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
