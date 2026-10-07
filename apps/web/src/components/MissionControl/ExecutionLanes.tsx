import { StatusChip } from "../common/StatusChip";
import type { WorkIntent, WorkGrant } from "../../types";

const MILESTONES = [
  "Proposed",
  "Authorized",
  "Forked",
  "Executing",
  "Validating",
  "Ready",
  "Accepted",
];

interface ExecutionLanesProps {
  intents: WorkIntent[];
  grants: WorkGrant[];
  onSelectIntent: (intent: WorkIntent) => void;
  onOpenDecisionLens?: (intent: WorkIntent) => void;
}

export function ExecutionLanes({
  intents,
  grants,
  onSelectIntent,
  onOpenDecisionLens,
}: ExecutionLanesProps) {
  const getMilestoneIndex = (status: WorkIntent["status"]): number => {
    switch (status) {
      case "needs_resolution":
      case "ready_for_review":
        return 0; // Proposed
      case "authorized":
        return 1; // Authorized
      case "in_progress":
        return 3; // Executing
      case "submitted":
        return 5; // Ready
      case "accepted":
        return 6; // Accepted
      default:
        return 0;
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
          Execution lanes
        </span>
        <span
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
          }}
        >
          Task milestones
        </span>
      </div>

      {/* Milestone Track Column Headers */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "0 16px",
          fontSize: "10px",
          color: "var(--text-muted)",
          fontFamily: "var(--font-sans)",
        }}
      >
        {MILESTONES.map((m) => (
          <span key={m} style={{ flex: 1, textAlign: "left" }}>
            {m}
          </span>
        ))}
      </div>

      {/* Task Lanes */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {intents.map((intent) => {
          const grant = grants.find((g) => g.workId === intent.id && g.status === "active");
          const stepIdx = getMilestoneIndex(intent.status);
          const isBlocked = intent.status === "needs_resolution" || intent.status === "needs_alignment";

          return (
            <div
              key={intent.id}
              onClick={() => {
                if (isBlocked && onOpenDecisionLens) {
                  onOpenDecisionLens(intent);
                } else {
                  onSelectIntent(intent);
                }
              }}
              style={{
                background: "var(--surface-panel)",
                border: "1px solid var(--border-muted)",
                borderRadius: "10px",
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--border-muted)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-muted)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {intent.outcome}
                  </div>
                  <div
                    style={{
                      fontSize: "11px",
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                    }}
                  >
                    T-{intent.id.slice(0, 4)} · {intent.agent}
                  </div>
                </div>

                <StatusChip status={intent.status} />
              </div>

              {/* 7-Segment Milestone Progress Bar */}
              <div style={{ display: "flex", gap: "6px", height: "10px", alignItems: "center" }}>
                {MILESTONES.map((_, i) => {
                  const isDone = i < stepIdx;
                  const isCurrent = i === stepIdx;
                  const barColor = isBlocked
                    ? isCurrent
                      ? "var(--status-blocked)"
                      : "var(--border-muted)"
                    : isDone || isCurrent
                    ? "var(--brand)"
                    : "var(--border-muted)";

                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: isCurrent ? "6px" : "2px",
                        borderRadius: "2px",
                        background: barColor,
                        transition: "all 0.2s ease",
                      }}
                    />
                  );
                })}
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-secondary)",
                }}
              >
                <span>
                  {grant ? `Grant G-${grant.id.slice(0, 4)} · scope locked` : "Intent registered · pre-commit"}
                </span>
                <span>
                  {intent.scope.length} file{intent.scope.length !== 1 ? "s" : ""} declared
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
