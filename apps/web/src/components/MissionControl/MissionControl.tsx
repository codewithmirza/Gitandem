import { useState } from "react";
import { OperationalIndex, type OperationalFilter } from "./OperationalIndex";
import { ExecutionLanes } from "./ExecutionLanes";
import { DecisionInbox } from "./DecisionInbox";
import type { ProjectSnapshot, WorkIntent } from "../../types";

interface MissionControlProps {
  snapshot: ProjectSnapshot;
  onSelectIntent: (intent: WorkIntent) => void;
  onOpenDecisionLens: (intent: WorkIntent) => void;
  onReviewCandidate: (intent: WorkIntent) => void;
  onProposeWork: () => void;
  connectedAgents: Array<{ name: string; lastSeen: string }>;
}

export function MissionControl({
  snapshot,
  onSelectIntent,
  onOpenDecisionLens,
  onReviewCandidate,
  onProposeWork,
  connectedAgents,
}: MissionControlProps) {
  const [filter, setFilter] = useState<OperationalFilter>("all");

  const filteredIntents = snapshot.work.filter((intent) => {
    if (filter === "all") return true;
    if (filter === "attention") {
      return intent.status === "needs_resolution" || intent.status === "needs_alignment";
    }
    if (filter === "running") {
      return intent.status === "in_progress" || intent.status === "authorized";
    }
    if (filter === "ready") {
      return intent.status === "submitted" || intent.status === "ready_for_review";
    }
    if (filter === "completed") {
      return intent.status === "accepted";
    }
    return true;
  });

  const activeCount = snapshot.work.filter((i) =>
    ["needs_resolution", "ready_for_review", "authorized", "in_progress", "submitted", "needs_alignment"].includes(i.status)
  ).length;

  const decisionCount = snapshot.work.filter(
    (i) => i.status === "needs_resolution" || i.status === "needs_alignment"
  ).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "20px", width: "100%" }}>
      {/* Page Heading */}
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
            Plan r{snapshot.project.revision} · {activeCount} active · {decisionCount} decision{decisionCount !== 1 ? "s" : ""} needed
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Accepted history is canonical; active agent forks remain isolated until verified.
          </p>
        </div>

        <div>
          <button type="button" className="button outline" onClick={onProposeWork}>
            Propose work
          </button>
        </div>
      </div>

      {/* 3-Column Operational Layout */}
      <div style={{ display: "flex", gap: "24px", alignItems: "flex-start", width: "100%" }}>
        <OperationalIndex
          intents={snapshot.work}
          activeFilter={filter}
          onSelectFilter={setFilter}
          connectionsCount={connectedAgents.length}
        />

        <ExecutionLanes
          intents={filteredIntents}
          grants={snapshot.grants}
          onSelectIntent={onSelectIntent}
          onOpenDecisionLens={onOpenDecisionLens}
        />

        <DecisionInbox
          intents={snapshot.work}
          onOpenDecisionLens={onOpenDecisionLens}
          onReviewCandidate={onReviewCandidate}
          connectedAgents={connectedAgents}
        />
      </div>
    </div>
  );
}
