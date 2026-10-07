import { useState } from "react";
import { ArrowRight, Bot } from "lucide-react";
import { Brand } from "../common/Brand";

interface StartPageProps {
  login?: string;
  showDevToken: boolean;
  onLogout: () => void;
  onToken: () => void;
  onCreate: () => void;
  onDirectSubmit: (repoName: string, goal: string) => void;
  busy: boolean;
  error: string;
}

export function StartPage({
  login,
  showDevToken,
  onLogout,
  onToken,
  onCreate,
  onDirectSubmit,
  busy,
  error,
}: StartPageProps) {
  const [repoName, setRepoName] = useState("");
  const [goal, setGoal] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim() || busy) return;
    onDirectSubmit(repoName.trim(), goal.trim() || `Repository for ${repoName.trim()}`);
  };

  return (
    <main className="gate">
      <div className="gate-card">
        <Brand />

        {!showDevToken && login && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", margin: "16px 0", fontSize: "11px", color: "var(--text-secondary)" }}>
            <span>Signed in as <b>{login}</b></span>
            <button type="button" className="text-button" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}

        <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--surface-subtle)", padding: "4px 10px", borderRadius: "100px", fontSize: "11px", color: "var(--brand)", fontWeight: 600, margin: "12px 0 16px" }}>
          <Bot size={13} /> CLOUDFLARE ARTIFACTS GIT PLATFORM
        </div>

        <h1>
          Create a repository.<br />
          <em>Coordinate your agents.</em>
        </h1>

        <p>
          Gitandem coordinates multi-agent swarms before code is written. Name your repository to establish its canonical home.
        </p>

        <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "12px", textAlign: "left" }}>
          <div className="field">
            <label>REPOSITORY NAME</label>
            <input
              autoFocus
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="e.g. billing-service or auth-worker"
              required
            />
          </div>

          <div className="field">
            <label>PROJECT GOAL / INTENDED OUTCOME (OPTIONAL)</label>
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should the agents build together?"
            />
          </div>

          <button
            type="submit"
            className="button primary"
            disabled={busy || !repoName.trim()}
            style={{ padding: "10px", justifyContent: "center", marginTop: "4px" }}
          >
            {busy ? "Creating repository…" : "Create repository"} <ArrowRight size={14} />
          </button>
        </form>

        <div style={{ display: "flex", gap: "16px", justifyContent: "center", marginTop: "20px" }}>
          <button type="button" className="text-button" onClick={onCreate}>
            Import existing Git remote
          </button>
          {showDevToken && (
            <button type="button" className="text-button" onClick={onToken}>
              Change local token
            </button>
          )}
        </div>

        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="gate-caption">CONCURRENT AGENTS · PRE-COMMIT INTENT · ZERO CONFLICTS</div>
    </main>
  );
}
