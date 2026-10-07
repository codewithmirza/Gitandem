import { GitBranch, ChevronDown, Search, Terminal, RotateCw, LockKeyhole, Users, Bot, Plus } from "lucide-react";
import { Brand } from "../common/Brand";
import { StatusChip } from "../common/StatusChip";
import type { User, ProjectSnapshot } from "../../types";

interface ProjectBarProps {
  snapshot: ProjectSnapshot;
  user: User | null;
  actorMode: "human" | "agent";
  onActorModeChange: (mode: "human" | "agent") => void;
  onConnectAgent: () => void;
  onRefresh: () => void;
  onLogout: () => void;
  onSwitchProject: () => void;
  onCreateProject?: () => void;
  busy: boolean;
  isDev: boolean;
}

export function ProjectBar({
  snapshot,
  user,
  actorMode,
  onActorModeChange,
  onConnectAgent,
  onRefresh,
  onLogout,
  onSwitchProject,
  onCreateProject,
  busy,
  isDev,
}: ProjectBarProps) {
  return (
    <header
      style={{
        height: "56px",
        background: "var(--surface-panel)",
        borderBottom: "1px solid var(--border-muted)",
        display: "flex",
        alignItems: "center",
        padding: "0 24px",
        gap: "20px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <Brand />

      <button
        type="button"
        onClick={onSwitchProject}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "transparent",
          border: "none",
          padding: "4px 8px",
          borderRadius: "6px",
          cursor: "pointer",
        }}
        title="Switch active project"
      >
        <GitBranch size={16} color="var(--text-secondary)" />
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--text-primary)" }}>
          {snapshot.project.name}
        </span>
        <ChevronDown size={14} color="var(--text-secondary)" />
      </button>

      {onCreateProject && (
        <button
          type="button"
          className="button quiet small"
          onClick={onCreateProject}
          title="Create or import new repository"
          style={{ padding: "4px 8px", fontSize: "11px", gap: "4px" }}
        >
          <Plus size={13} /> New
        </button>
      )}

      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "11px",
          color: "var(--text-secondary)",
          whiteSpace: "nowrap",
        }}
      >
        main {snapshot.project.repository ? snapshot.project.repository.split("/").pop()?.slice(0, 7) || "head" : "local"} · Plan r{snapshot.project.revision}
      </span>

      <StatusChip status="current" label="Current" />

      {/* Global Search Bar */}
      <div
        style={{
          flex: 1,
          maxWidth: "400px",
          height: "32px",
          background: "var(--surface-canvas)",
          borderRadius: "8px",
          border: "1px solid var(--border-muted)",
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          gap: "8px",
        }}
      >
        <Search size={14} color="var(--text-muted)" />
        <span style={{ fontSize: "12px", color: "var(--text-muted)", flex: 1 }}>
          Search tasks, proposals, checkpoints
        </span>
        <kbd
          style={{
            fontSize: "10px",
            fontFamily: "var(--font-mono)",
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "4px",
            padding: "2px 5px",
            color: "var(--text-secondary)",
          }}
        >
          ⌘ K
        </kbd>
      </div>

      {/* Mode Switcher */}
      <div
        style={{
          display: "flex",
          background: "var(--surface-canvas)",
          border: "1px solid var(--border-muted)",
          borderRadius: "8px",
          padding: "2px",
        }}
      >
        <button
          type="button"
          onClick={() => onActorModeChange("human")}
          className={`button small ${actorMode === "human" ? "primary" : "quiet"}`}
          style={{ padding: "3px 10px", fontSize: "11px", borderRadius: "6px" }}
        >
          <Users size={12} /> Cockpit
        </button>
        <button
          type="button"
          onClick={() => onActorModeChange("agent")}
          className={`button small ${actorMode === "agent" ? "primary" : "quiet"}`}
          style={{ padding: "3px 10px", fontSize: "11px", borderRadius: "6px" }}
        >
          <Bot size={12} /> Agent Protocol
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto" }}>
        <button
          type="button"
          className="button outline small"
          disabled={busy}
          onClick={onConnectAgent}
          title="Connect an autonomous agent (Claude Code, Cursor, Codex, Hermes)"
        >
          <Terminal size={13} /> Connect Agent (MCP)
        </button>

        <button
          type="button"
          className="button quiet small"
          onClick={onRefresh}
          title="Refresh project state"
          style={{ padding: "6px" }}
        >
          <RotateCw size={14} />
        </button>

        {isDev && !user ? (
          <div
            style={{
              width: "28px",
              height: "28px",
              borderRadius: "50%",
              background: "var(--surface-subtle)",
              display: "grid",
              placeItems: "center",
              color: "var(--brand)",
              fontSize: "11px",
              fontWeight: 600,
            }}
            title="Local Development Mode"
          >
            <LockKeyhole size={14} />
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: "var(--surface-subtle)",
                display: "grid",
                placeItems: "center",
                color: "var(--brand)",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
              }}
              title={`Signed in as ${user?.login}`}
            >
              {user?.login.slice(0, 2) || "MC"}
            </div>
            <button
              type="button"
              className="text-button"
              onClick={onLogout}
              disabled={busy}
              style={{ fontSize: "11px" }}
            >
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
