import { Check } from "lucide-react";
import { Dialog } from "./Dialog";
import type { WorkspaceAccess } from "../../types";

interface WorkspaceAccessDialogProps {
  access: WorkspaceAccess;
  onClose: () => void;
}

export function WorkspaceAccessDialog({ access, onClose }: WorkspaceAccessDialogProps) {
  return (
    <Dialog
      title="Work is authorized"
      subtitle="The proposing agent can now run commands inside an isolated Linux container connected to this task repository."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="field">
          <label>ISOLATED TASK REPOSITORY · {access.defaultBranch}</label>
          <input readOnly value={access.remote} />
          <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Based on commit {access.baseCommit.slice(0, 12)} · intent {access.workId.slice(0, 8)}
          </span>
        </div>

        <div className="dialog-footnote">
          Git credentials stay in Gitandem and are revoked after each command. The agent works in this task fork through MCP.
        </div>

        <div className="dialog-actions">
          <button type="button" className="button primary" onClick={onClose}>
            Done <Check size={14} />
          </button>
        </div>
      </div>
    </Dialog>
  );
}
