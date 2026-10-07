import { CheckCircle2, Circle, CircleDot, AlertOctagon, AlertTriangle } from "lucide-react";
import type { WorkStatus } from "../../types";

export type StatusVariant = WorkStatus | "current" | "forked" | "executing" | "validating" | "ready" | "stale" | "blocked" | "canceled";

interface StatusChipProps {
  status: string;
  label?: string;
}

export function StatusChip({ status, label }: StatusChipProps) {
  const norm = status.toLowerCase();

  let color = "var(--text-secondary)";
  let bg = "var(--surface-panel)";
  let borderColor = "var(--border-muted)";
  let Icon = Circle;

  if (norm === "current" || norm === "accepted") {
    color = "var(--status-accepted)";
    borderColor = "rgba(46, 139, 87, 0.3)";
    Icon = CheckCircle2;
  } else if (norm === "running" || norm === "executing" || norm === "validating" || norm === "in_progress") {
    color = "var(--status-running)";
    borderColor = "rgba(41, 159, 183, 0.3)";
    Icon = CircleDot;
  } else if (norm === "authorized" || norm === "ready" || norm === "ready_for_review" || norm === "forked") {
    color = "var(--brand)";
    borderColor = "rgba(91, 91, 214, 0.3)";
    Icon = Circle;
  } else if (norm === "needs_resolution" || norm === "needs_alignment" || norm === "stale" || norm === "attention") {
    color = "var(--status-attention)";
    borderColor = "rgba(200, 135, 25, 0.3)";
    Icon = AlertTriangle;
  } else if (norm === "blocked" || norm === "failed" || norm === "rejected") {
    color = "var(--status-blocked)";
    borderColor = "rgba(209, 75, 62, 0.3)";
    Icon = AlertOctagon;
  }

  const displayText = label || status.replace(/_/g, " ");

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "3px 8px",
        borderRadius: "6px",
        background: bg,
        border: `1px solid ${borderColor}`,
        fontSize: "11px",
        fontWeight: 600,
        color,
        fontFamily: "var(--font-sans)",
        textTransform: "capitalize",
      }}
    >
      <Icon size={12} style={{ color }} />
      <span>{displayText}</span>
    </div>
  );
}
