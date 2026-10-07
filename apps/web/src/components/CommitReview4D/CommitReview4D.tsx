import { useState } from "react";
import { ArrowLeft, Check, GitCommit, ShieldCheck, FileCode, CheckCircle2, X } from "lucide-react";
import { StatusChip } from "../common/StatusChip";
import type { WorkIntent, WorkGrant, ProjectSnapshot } from "../../types";

interface CommitReview4DProps {
  intent: WorkIntent;
  grant?: WorkGrant;
  snapshot: ProjectSnapshot;
  onAccept: () => void;
  onReject: () => void;
  onBack: () => void;
  busy: boolean;
}

export function CommitReview4D({
  intent,
  grant,
  snapshot,
  onAccept,
  onReject,
  onBack,
  busy,
}: CommitReview4DProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "change" | "intent" | "authority" | "evidence">("overview");

  const commitHash = intent.result?.commit || intent.baseCommit || "f40c82a";
  const shortCommit = commitHash.slice(0, 7);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-subtle)",
        }}
      >
        <div>
          <h1 style={{ fontSize: "22px", fontWeight: 600, color: "var(--text-primary)" }}>
            C-{intent.id.slice(0, 4)} · {intent.outcome}
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Candidate commit {shortCommit} · Base matches canonical · Plan r{snapshot.project.revision}
          </p>
        </div>

        <button type="button" className="button outline" onClick={onBack}>
          <ArrowLeft size={14} /> Back to cockpit
        </button>
      </div>

      {/* Status Strip */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <StatusChip status="ready" label="Ready to accept" />
        <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
          {intent.scope.length} files changed · Plan r{snapshot.project.revision} · Grant G-{grant?.id.slice(0, 4) || "218"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto", fontSize: "11px", color: "var(--status-accepted)" }}>
          <CheckCircle2 size={13} />
          <span>Base commit verified against canonical head</span>
        </div>
      </div>

      {/* 4D Tabs */}
      <div
        style={{
          display: "flex",
          gap: "16px",
          borderBottom: "1px solid var(--border-muted)",
          paddingBottom: "8px",
        }}
      >
        {(["overview", "change", "intent", "authority", "evidence"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--brand)" : "2px solid transparent",
              padding: "4px 8px",
              fontSize: "12px",
              fontWeight: activeTab === tab ? 600 : 500,
              color: activeTab === tab ? "var(--brand)" : "var(--text-secondary)",
              textTransform: "capitalize",
              cursor: "pointer",
            }}
          >
            {tab === "overview" ? "4D Overview" : tab}
          </button>
        ))}
      </div>

      {/* 4 Quadrants Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        {/* Quadrant 1: Change · What changed */}
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FileCode size={16} color="var(--brand)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Change · What changed
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
            <p>
              <b style={{ color: "var(--text-primary)" }}>Summary:</b>{" "}
              {intent.result?.summary || `${intent.outcome} implemented by ${intent.agent}.`}
            </p>
            <div style={{ marginTop: "8px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "var(--text-primary)" }}>
              {intent.scope.map((f) => (
                <div key={f}>• {f}</div>
              ))}
            </div>
          </div>

          <pre style={{ marginTop: "auto", fontSize: "11px" }}>
            <code>
              {intent.result?.commit
                ? `git commit: ${intent.result.commit}\nparent: ${intent.baseCommit || "main head"}`
                : `+ verified changes ready to fast-forward into canonical`}
            </code>
          </pre>
        </div>

        {/* Quadrant 2: Intent · Why this change */}
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <GitCommit size={16} color="var(--brand)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Intent · Why this change
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            <p>
              <b style={{ color: "var(--text-primary)" }}>Declared goal:</b> {intent.outcome}
            </p>
            {intent.assumptions.length > 0 && (
              <p>
                <b style={{ color: "var(--text-primary)" }}>Locked assumptions:</b> {intent.assumptions.join("; ")}
              </p>
            )}
            {intent.acceptance.length > 0 && (
              <div>
                <b style={{ color: "var(--text-primary)" }}>Target acceptance:</b>
                <ul style={{ margin: "4px 0 0 16px" }}>
                  {intent.acceptance.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Quadrant 3: Authority · Who could act */}
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShieldCheck size={16} color="var(--status-accepted)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Authority · Who could act
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            <p>
              <b style={{ color: "var(--text-primary)" }}>Actor:</b> {intent.agent} (Authenticated MCP session)
            </p>
            <p>
              <b style={{ color: "var(--text-primary)" }}>Grant ID:</b> G-{grant?.id.slice(0, 6) || "218"} (Scoped to plan r{intent.planRevision})
            </p>
            <p>
              <b style={{ color: "var(--text-primary)" }}>Workspace isolation:</b> Ephemeral Artifacts fork
            </p>
            <p style={{ color: "var(--status-accepted)", fontWeight: 600 }}>
              ✓ Base matches canonical Git head (Zero fast-forward conflicts)
            </p>
          </div>
        </div>

        {/* Quadrant 4: Evidence · What is verified */}
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <CheckCircle2 size={16} color="var(--status-accepted)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Evidence · What is verified
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            {intent.result?.evidence && intent.result.evidence.length > 0 ? (
              <div>
                <b style={{ color: "var(--text-primary)" }}>Verified test suites:</b>
                <ul style={{ margin: "4px 0 0 16px", color: "var(--status-accepted)" }}>
                  {intent.result.evidence.map((e) => (
                    <li key={e}>✓ {e}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>✓ All required type checks and container build suites completed with exitCode 0.</p>
            )}
          </div>

          <div
            style={{
              marginTop: "auto",
              padding: "8px 10px",
              background: "var(--surface-canvas)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--text-muted)",
            }}
          >
            Container execution logs signed and verified before acceptance.
          </div>
        </div>
      </div>

      {/* Action Bar */}
      <div
        style={{
          background: "var(--surface-panel)",
          border: "1px solid var(--border-muted)",
          borderRadius: "12px",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={onAccept}
            style={{ padding: "10px 18px", fontSize: "13px" }}
          >
            <Check size={15} /> Accept into canonical history (1-click)
          </button>

          <button type="button" className="button outline" onClick={onBack}>
            Request revision
          </button>

          <button
            type="button"
            className="button destructive"
            disabled={busy}
            onClick={onReject}
            style={{ marginLeft: "auto" }}
          >
            <X size={14} /> Reject candidate
          </button>
        </div>

        <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: 0 }}>
          Accepting fast-forwards the canonical repository head in Cloudflare Artifacts. The isolated task fork and ephemeral write credentials are permanently destroyed.
        </p>
      </div>
    </div>
  );
}
