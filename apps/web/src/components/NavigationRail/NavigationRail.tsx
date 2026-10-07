import type { ProjectSnapshot } from "../../types";

export type NavSection = "cockpit" | "plan" | "intents" | "workspaces" | "changes" | "history" | "agents" | "audit" | "settings";

interface NavigationRailProps {
  snapshot: ProjectSnapshot;
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  activeTaskCount: number;
  onShowRepoAccess?: () => void;
}

export function NavigationRail({
  snapshot,
  activeSection,
  onSelectSection,
  activeTaskCount,
  onShowRepoAccess,
}: NavigationRailProps) {
  const items: Array<{ id: NavSection; label: string; count?: number }> = [
    { id: "cockpit", label: "Cockpit", count: activeTaskCount },
    { id: "plan", label: "Plan & contracts" },
    { id: "intents", label: "Intents" },
    { id: "workspaces", label: "Workspaces" },
    { id: "changes", label: "Changes" },
    { id: "history", label: "History" },
    { id: "agents", label: "Agents" },
    { id: "audit", label: "Audit" },
    { id: "settings", label: "Settings" },
  ];

  return (
    <aside
      style={{
        width: "220px",
        background: "var(--surface-panel)",
        borderRight: "1px solid var(--border-muted)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 16px",
        gap: "24px",
        height: "calc(100vh - 56px)",
        position: "sticky",
        top: "56px",
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
          {snapshot.project.name}
        </div>
        <div
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-secondary)",
            marginTop: "2px",
          }}
        >
          {snapshot.project.id}
        </div>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {items.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                borderRadius: "6px",
                border: "none",
                background: isActive ? "var(--surface-subtle)" : "transparent",
                color: isActive ? "var(--brand)" : "var(--text-secondary)",
                fontWeight: isActive ? 600 : 500,
                fontSize: "13px",
                textAlign: "left",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              <span>{item.label}</span>
              {typeof item.count === "number" && item.count > 0 && (
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                    color: isActive ? "var(--brand)" : "var(--text-muted)",
                  }}
                >
                  · {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ marginTop: "auto", paddingTop: "16px", borderTop: "1px solid var(--border-subtle)" }}>
        <div
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
            marginBottom: "4px",
          }}
        >
          PROJECT AUTHORITY
        </div>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary)" }}>
          Gitandem canonical history
        </div>
        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px" }}>
          Origin: {snapshot.project.repository ? snapshot.project.repository : "standalone"}
        </div>
        {snapshot.project.repository && onShowRepoAccess && (
          <button type="button" className="text-button" onClick={onShowRepoAccess} style={{ fontSize: "11px", marginTop: "6px", display: "block" }}>
            View Git credentials
          </button>
        )}
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px", lineHeight: "1.4" }}>
          Acceptance advances canonical Git; active forks remain isolated.
        </div>
      </div>
    </aside>
  );
}
