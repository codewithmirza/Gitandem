import { useState } from "react";
import { ArrowLeft, Check,  Sparkles } from "lucide-react";
import { StatusChip } from "../common/StatusChip";
import type { WorkIntent, WorkPlanAssessment, ProjectSnapshot } from "../../types";

interface DecisionLensProps {
  intent: WorkIntent;
  snapshot: ProjectSnapshot;
  assessment?: WorkPlanAssessment;
  onBack: () => void;
  onResolve: (action: "adopt_a" | "adopt_b" | "define_contract", contractDetails?: { title: string; semantics: string }) => void;
  busy: boolean;
}

export function DecisionLens({
  intent,
  snapshot,
  assessment,
  onBack,
  onResolve,
  busy,
}: DecisionLensProps) {
  const [contractTitle, setContractTitle] = useState(
    `Contract v${snapshot.project.revision + 1}: Shared specification for ${intent.outcome}`
  );
  const [contractSemantics, setContractSemantics] = useState(
    intent.assumptions.join("; ") || "Shared interfaces, atomic execution, explicit recovery evidence."
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "24px", width: "100%" }}>
      {/* Heading */}
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
            D-{intent.id.slice(0, 4)} · Resolve intent collision
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Pre-commit conflict caught before code exists. Choose an approach or define a shared contract.
          </p>
        </div>

        <button type="button" className="button outline" onClick={onBack}>
          <ArrowLeft size={14} /> Return to cockpit
        </button>
      </div>

      {/* 3-Way Card Comparison Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
        {/* Card A: Proposed Intent */}
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
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            Candidate A · {intent.agent}
          </div>
          <StatusChip status="ready" label="Proposed" />

          <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
            T-{intent.id.slice(0, 4)} · Plan r{intent.planRevision} · no code written
          </div>

          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
            {intent.outcome}
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            <div>
              <b style={{ color: "var(--text-primary)" }}>Scope:</b> {intent.scope.join(", ") || "General"}
            </div>
            {intent.assumptions.length > 0 && (
              <div>
                <b style={{ color: "var(--text-primary)" }}>Assumptions:</b> {intent.assumptions.join("; ")}
              </div>
            )}
            {intent.interfaces.length > 0 && (
              <div>
                <b style={{ color: "var(--text-primary)" }}>Interfaces:</b>{" "}
                {intent.interfaces.map((i) => `${i.name}: ${i.proposal}`).join("; ")}
              </div>
            )}
          </div>

          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => onResolve("adopt_a")}
            style={{ marginTop: "auto", justifyContent: "center" }}
          >
            Adopt A
          </button>
        </div>

        {/* Card Middle: Exact Incompatibility */}
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid rgba(209, 75, 62, 0.3)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--status-blocked)" }}>
            Exact Incompatibility
          </div>
          <StatusChip status="blocked" label="Needs decision" />

          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
            {intent.issues[0]?.message || "Competing architectural assumptions detected."}
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            <div>
              <b style={{ color: "var(--text-primary)" }}>Downstream impact:</b> Sibling agent tasks and verification
              suites rely on conflicting state models.
            </div>
            <div style={{ marginTop: "6px" }}>
              <b style={{ color: "var(--text-primary)" }}>Current plan gap:</b> Plan r{snapshot.project.revision} left
              this implementation contract open.
            </div>
          </div>

          <div
            style={{
              marginTop: "auto",
              padding: "10px",
              background: "var(--surface-canvas)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--text-muted)",
              lineHeight: "1.4",
            }}
          >
            Observed explicit choices. No merge conflict allowed to reach Git history.
          </div>
        </div>

        {/* Card B: Competing or Baseline Intent */}
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
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            Candidate B · Active Constraints
          </div>
          <StatusChip status="attention" label="Current baseline" />

          <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>
            Current Plan r{snapshot.project.revision}
          </div>

          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginTop: "4px" }}>
            {snapshot.plan.goal}
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            <div>
              <b style={{ color: "var(--text-primary)" }}>Constraints:</b>{" "}
              {snapshot.plan.constraints.join("; ") || "None"}
            </div>
            <div>
              <b style={{ color: "var(--text-primary)" }}>Agreed decisions:</b>{" "}
              {snapshot.plan.decisions.map((d) => `${d.name}: ${d.value}`).join("; ") || "None"}
            </div>
          </div>

          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => onResolve("adopt_b")}
            style={{ marginTop: "auto", justifyContent: "center" }}
          >
            Preserve current plan
          </button>
        </div>
      </div>

      {/* Bottom Section: Workers AI Advisory & Shared Contract Definition */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "24px" }}>
        {/* Workers AI Advisory Panel */}
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
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Sparkles size={16} color="var(--brand)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
              Workers AI (Clef Model) Advisory
            </span>
          </div>

          <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            <p>
              <b style={{ color: "var(--text-primary)" }}>Model evaluation:</b>{" "}
              {assessment
                ? `Plan fit: ${assessment.planFit.choice} (${Math.round((assessment.planFit.probabilities[assessment.planFit.choice] || 0) * 100)}% confidence).`
                : "Assessed using @cf/cloudflare/clef-flash decision framework."}
            </p>
            <p style={{ marginTop: "6px" }}>
              <b style={{ color: "var(--text-primary)" }}>Suggested resolution:</b> Define a single shared contract
              and issue updated work grants to both agents simultaneously.
            </p>
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "auto", fontStyle: "italic" }}>
            Workers AI recommendation is strictly advisory. Human owner retains full authority over plan updates.
          </div>
        </div>

        {/* Shared Contract Editor */}
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "12px",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            Define shared contract
          </div>

          <div className="field">
            <label>CONTRACT TITLE</label>
            <input
              value={contractTitle}
              onChange={(e) => setContractTitle(e.target.value)}
              placeholder="e.g. Contract v2: Shared Redis for retry queue"
            />
          </div>

          <div className="field">
            <label>REQUIRED SEMANTICS</label>
            <textarea
              value={contractSemantics}
              onChange={(e) => setContractSemantics(e.target.value)}
              rows={2}
              placeholder="e.g. Shared keys; atomic 60s claims; restart recovery evidence."
            />
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button
              type="button"
              className="button primary"
              disabled={busy || !contractTitle.trim()}
              onClick={() =>
                onResolve("define_contract", { title: contractTitle.trim(), semantics: contractSemantics.trim() })
              }
            >
              <Check size={14} /> Define shared contract
            </button>
            <button type="button" className="button outline" onClick={onBack}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
