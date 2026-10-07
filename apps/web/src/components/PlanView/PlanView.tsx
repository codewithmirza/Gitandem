import { useState, useEffect } from "react";
import { ArrowRight, Layers } from "lucide-react";
import type { ProjectPlan, ProjectSnapshot } from "../../types";

interface PlanViewProps {
  snapshot: ProjectSnapshot;
  busy: boolean;
  onSave: (plan: ProjectPlan) => void;
}

export function PlanView({ snapshot, busy, onSave }: PlanViewProps) {
  const [goal, setGoal] = useState(snapshot.plan.goal);
  const [constraints, setConstraints] = useState(snapshot.plan.constraints.join("\n"));
  const [decisions, setDecisions] = useState(
    snapshot.plan.decisions.map((item) => `${item.name}: ${item.value}`).join("\n")
  );

  useEffect(() => {
    setGoal(snapshot.plan.goal);
    setConstraints(snapshot.plan.constraints.join("\n"));
    setDecisions(snapshot.plan.decisions.map((item) => `${item.name}: ${item.value}`).join("\n"));
  }, [snapshot]);

  const parsePairs = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const at = line.indexOf(":");
        return at < 0 ? { name: line, value: "" } : { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
      })
      .filter((item) => item.name && item.value);

  const lines = (text: string) =>
    text
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

  return (
    <div
      style={{
        background: "var(--surface-panel)",
        border: "1px solid var(--border-muted)",
        borderRadius: "12px",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingBottom: "16px",
          borderBottom: "1px solid var(--border-muted)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Layers size={18} color="var(--brand)" />
            <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text-primary)" }}>
              Project Plan & Shared Contracts <span>v{snapshot.project.revision}</span>
            </h2>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Changing this plan updates active work grants and invalidates conflicting assumptions across the agent swarm.
          </p>
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            background: "var(--surface-canvas)",
            padding: "4px 8px",
            borderRadius: "4px",
            border: "1px solid var(--border-muted)",
          }}
        >
          REVISION {snapshot.project.revision}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div className="field">
          <label>PROJECT GOAL / OUTCOME</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={3}
            placeholder="Describe the desired system behavior..."
          />
        </div>

        <div className="field">
          <label>GLOBAL CONSTRAINTS (ONE PER LINE)</label>
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            rows={4}
            placeholder="e.g. Strict backwards-compatible API contracts"
          />
        </div>

        <div className="field">
          <label>SHARED CONTRACTS & DECISIONS (NAME: VALUE)</label>
          <textarea
            value={decisions}
            onChange={(e) => setDecisions(e.target.value)}
            rows={4}
            placeholder="e.g. Queue: Shared Redis"
          />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
        <button
          type="button"
          className="button primary"
          disabled={busy || !goal.trim()}
          onClick={() =>
            onSave({
              goal: goal.trim(),
              constraints: lines(constraints),
              decisions: parsePairs(decisions),
            })
          }
        >
          {busy ? "Saving plan revision…" : "Save new plan revision"} <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
