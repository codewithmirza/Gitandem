import type { ActivityEntry } from "../../types";

interface EventTickerProps {
  activity: ActivityEntry[];
}

export function EventTicker({ activity }: EventTickerProps) {
  const latestEvents = activity.slice(0, 3);

  const displayString =
    latestEvents.length > 0
      ? latestEvents
          .map((a) => {
            const time = new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return `${time}  ${a.actor}: ${a.detail}`;
          })
          .join("   |   ")
      : "Active consensus protocol · No recent warnings · All agent task forks verified";

  return (
    <footer
      style={{
        height: "32px",
        background: "var(--surface-panel)",
        borderTop: "1px solid var(--border-muted)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        overflow: "hidden",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {displayString}
      </p>
    </footer>
  );
}
