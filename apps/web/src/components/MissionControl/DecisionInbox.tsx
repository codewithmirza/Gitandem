import { GitCompare, CheckCircle2 } from "lucide-react";
import { StatusChip } from "../common/StatusChip";
import type { WorkIntent } from "../../types";

interface DecisionInboxProps {
  intents: WorkIntent[];
  onOpenDecisionLens: (intent: WorkIntent) => void;
  onReviewCandidate: (intent: WorkIntent) => void;
  connectedAgents: Array<{ name: string; lastSeen: string }>;
}

export function DecisionInbox({
  intents,
  onOpenDecisionLens,
  onReviewCandidate,
  connectedAgents,
}: DecisionInboxProps) {
  const blockingIntents = intents.filter(
    (i) => i.status === "needs_resolution" || i.status === "needs_alignment"
  );
  const readyIntents = intents.filter(
    (i) => i.status === "submitted" || i.status === "ready_for_review"
  );

  return (
    <div
      style={{
        width: "344px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
          Decision Inbox
        </span>
        <StatusChip
          status={blockingIntents.length > 0 ? "needs_resolution" : "accepted"}
          label={blockingIntents.length > 0 ? `${blockingIntents.length} required` : "All aligned"}
        />
      </div>

      <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "-6px" }}>
        Ordered by blocking impact
      </div>

      {/* Blocking Decision Card */}
      {blockingIntents.length > 0 ? (
        blockingIntents.map((intent) => (
          <div
            key={intent.id}
            style={{
              background: "var(--surface-panel)",
              border: "1px solid var(--border-muted)",
              borderRadius: "10px",
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <GitCompare size={15} color="var(--brand)" />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                Resolve intent collision
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: "1.5" }}>
              {intent.issues[0]?.message || `${intent.agent}'s proposal conflicts with current project constraints.`}
            </p>

            <div style={{ fontSize: "11px", fontFamily: "var(--font-mono)", color: "var(--text-muted)" }}>
              Intent {intent.id.slice(0, 7)} · {intent.agent}
            </div>

            <button
              type="button"
              className="button primary"
              onClick={() => onOpenDecisionLens(intent)}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Open Decision Lens
            </button>
          </div>
        ))
      ) : (
        <div
          style={{
            padding: "14px",
            background: "var(--surface-panel)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            fontSize: "12px",
            color: "var(--text-secondary)",
            textAlign: "center",
          }}
        >
          No blocking decisions. Swarm is aligned.
        </div>
      )}

      {/* Ready for Review Card */}
      {readyIntents.length > 0 && (
        <div
          style={{
            background: "var(--surface-panel)",
            border: "1px solid var(--border-muted)",
            borderRadius: "10px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
              Ready for review
            </span>
            <StatusChip status="ready" label="Ready" />
          </div>

          <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
            {readyIntents[0]?.outcome}
          </div>

          <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Tests verified in container · base matches canonical
          </div>

          <button
            type="button"
            className="button outline"
            onClick={() => onReviewCandidate(readyIntents[0]!)}
            style={{ width: "100%", justifyContent: "center" }}
          >
            Review 4D candidate
          </button>
        </div>
      )}

      {/* Agent Connections Heartbeats */}
      <div
        style={{
          background: "var(--surface-panel)",
          border: "1px solid var(--border-muted)",
          borderRadius: "10px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
          Connected Agents
        </span>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {connectedAgents.length === 0 ? (
            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              No agent heartbeats recorded yet.
            </div>
          ) : connectedAgents.map((agent) => (
            <div
              key={agent.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <CheckCircle2 size={13} color="var(--status-accepted)" />
                <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{agent.name}</span>
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "var(--text-muted)",
                }}
              >
                {agent.lastSeen}
              </span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "4px" }}>
          Last explicit heartbeat. Not an estimate of agent reasoning.
        </div>
      </div>
    </div>
  );
}
