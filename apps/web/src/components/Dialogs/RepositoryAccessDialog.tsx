import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog } from "./Dialog";
import type { RepositoryAccess } from "../../types";

interface RepositoryAccessDialogProps {
  access: RepositoryAccess;
  onClose: () => void;
}

export function RepositoryAccessDialog({ access, onClose }: RepositoryAccessDialogProps) {
  const [copied, setCopied] = useState(false);

  const remoteCommand = `git remote add gitandem ${access.remote}\ngit -c http.extraHeader="Authorization: Bearer ${access.token}" fetch gitandem`;

  const handleCopy = () => {
    void navigator.clipboard.writeText(remoteCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      title="Read the project repository"
      subtitle="This short-lived token can fetch the repository. Git writes go through an approved Gitandem work result."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="field">
          <label>GIT REMOTE</label>
          <input readOnly value={access.remote} />
          {access.importedFrom && (
            <span style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Imported from {access.importedFrom}
            </span>
          )}
        </div>

        <div className="field">
          <label>TEMPORARY READ TOKEN (EXPIRES IN 15 MINUTES)</label>
          <input readOnly value={access.token} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              FETCH FROM LOCAL TERMINAL
            </span>
            <button type="button" className="text-button" onClick={handleCopy}>
              {copied ? "Copied commands!" : "Copy commands"}
            </button>
          </div>
          <pre>
            <code>{remoteCommand}</code>
          </pre>
        </div>

        <div className="dialog-footnote">
          This credential only reads the canonical repository. Agents push to isolated task repositories; accepted results are fast-forwarded through Gitandem.
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
