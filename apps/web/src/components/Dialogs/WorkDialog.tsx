import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Dialog } from "./Dialog";
import type { WorkIntent } from "../../types";

interface WorkDialogProps {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: Omit<WorkIntent, "id" | "status" | "issues" | "planRevision" | "createdAt">) => void;
}

export function WorkDialog({ busy, onClose, onSubmit }: WorkDialogProps) {
  const [agent, setAgent] = useState("");
  const [outcome, setOutcome] = useState("");
  const [scope, setScope] = useState("");
  const [assumptions, setAssumptions] = useState("");
  const [interfaces, setInterfaces] = useState("");
  const [designChoices] = useState("");
  const [dependencies] = useState("");
  const [acceptance, setAcceptance] = useState("");

  const lines = (text: string) =>
    text
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

  const parsePairs = (text: string) =>
    lines(text)
      .map((line) => {
        const at = line.indexOf(":");
        return at < 0 ? { name: line, value: "" } : { name: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
      })
      .filter((item) => item.name && item.value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      agent: agent.trim() || "Agent",
      outcome: outcome.trim(),
      scope: lines(scope),
      assumptions: lines(assumptions),
      interfaces: parsePairs(interfaces).map(({ name, value }) => ({ name, proposal: value })),
      designChoices: parsePairs(designChoices).map(({ name, value }) => ({ name, proposal: value })),
      dependencies: lines(dependencies),
      acceptance: lines(acceptance),
    });
  };

  return (
    <Dialog
      title="Propose a work intent"
      subtitle="Declare intended changes, assumptions, and scope before any code is generated."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="dialog-form">
        <div className="field">
          <label>CONTRIBUTOR OR AGENT NAME</label>
          <input
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            placeholder="e.g. Claude Code or Developer"
          />
        </div>

        <div className="field">
          <label>INTENDED OUTCOME</label>
          <textarea
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="What should be true when this work is complete?"
            rows={2}
            required
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div className="field">
            <label>SCOPE (ONE PER LINE)</label>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="src/billing/webhook.ts"
              rows={3}
              required
            />
          </div>

          <div className="field">
            <label>ACCEPTANCE EVIDENCE (ONE PER LINE)</label>
            <textarea
              value={acceptance}
              onChange={(e) => setAcceptance(e.target.value)}
              placeholder="vitest test/webhook.test.ts passes"
              rows={3}
              required
            />
          </div>
        </div>

        <div className="field">
          <label>ASSUMPTIONS (ONE PER LINE)</label>
          <textarea
            value={assumptions}
            onChange={(e) => setAssumptions(e.target.value)}
            placeholder="Shared Redis cache available"
            rows={2}
          />
        </div>

        <div className="field">
          <label>INTERFACES (NAME: PROPOSAL)</label>
          <textarea
            value={interfaces}
            onChange={(e) => setInterfaces(e.target.value)}
            placeholder="POST /webhook: { signature, payload }"
            rows={2}
          />
        </div>

        <div className="dialog-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy || !outcome.trim()}>
            {busy ? "Registering…" : "Register intent"} <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
