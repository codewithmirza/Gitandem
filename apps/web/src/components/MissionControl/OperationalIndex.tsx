import type { WorkIntent } from "../../types";

export type OperationalFilter = "all" | "attention" | "running" | "ready" | "completed" | "connections";

interface OperationalIndexProps {
  intents: WorkIntent[];
  activeFilter: OperationalFilter;
  onSelectFilter: (filter: OperationalFilter) => void;
  connectionsCount: number;
}

export function OperationalIndex({
  intents,
  activeFilter,
  onSelectFilter,
  connectionsCount,
}: OperationalIndexProps) {
  const needsAttention = intents.filter(
    (i) => i.status === "needs_resolution" || i.status === "needs_alignment"
  );
  const running = intents.filter(
    (i) => i.status === "in_progress" || i.status === "authorized"
  );
  const ready = intents.filter((i) => i.status === "submitted" || i.status === "ready_for_review");
  const completed = intents.filter((i) => i.status === "accepted");

  const cards: Array<{
    id: OperationalFilter;
    label: string;
    detail: string;
    highlight?: boolean;
  }> = [
    {
      id: "attention",
      label: "Needs attention",
      detail: `${needsAttention.length} tasks`,
      highlight: needsAttention.length > 0,
    },
    {
      id: "running",
      label: "Running",
      detail: running.map((i) => `T-${i.id.slice(0, 4)}`).slice(0, 2).join(" · ") || "0 active",
    },
    {
      id: "ready",
      label: "Ready to accept",
      detail: `${ready.length} ready`,
    },
    {
      id: "completed",
      label: "Completed",
      detail: `${completed.length} merged`,
    },
    {
      id: "connections",
      label: "Connections",
      detail: `${connectionsCount} agents active`,
    },
  ];

  return (
    <div
      style={{
        width: "168px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--text-secondary)",
          letterSpacing: "0.06em",
          marginBottom: "4px",
        }}
      >
        OPERATIONAL INDEX
      </div>

      {cards.map((card) => {
        const isSelected = activeFilter === card.id;
        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectFilter(isSelected ? "all" : card.id)}
            style={{
              padding: "10px 12px",
              borderRadius: "8px",
              border: isSelected
                ? "1px solid var(--focus-ring)"
                : card.highlight
                ? "1px solid rgba(200, 135, 25, 0.4)"
                : "1px solid var(--border-muted)",
              background: isSelected
                ? "var(--surface-subtle)"
                : "var(--surface-panel)",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              textAlign: "left",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
              {card.label}
            </span>
            <span
              style={{
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: isSelected ? "var(--brand)" : "var(--text-secondary)",
              }}
            >
              {card.detail}
            </span>
          </button>
        );
      })}

      <div
        style={{
          fontSize: "10px",
          color: "var(--text-muted)",
          marginTop: "12px",
          lineHeight: "1.4",
        }}
      >
        Dependency-led ordering. Healthy tasks stay quiet.
      </div>
    </div>
  );
}
