import { useState } from "react";
import { Check } from "lucide-react";
import { Dialog } from "./Dialog";
import type { AgentAccess } from "../../types";

interface AgentAccessDialogProps {
  access: AgentAccess;
  onClose: () => void;
}

export function AgentAccessDialog({ access, onClose }: AgentAccessDialogProps) {
  const [copied, setCopied] = useState(false);

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        gitandem: {
          url: `${window.location.origin}${access.endpoint}`,
          headers: {
            Authorization: `Bearer ${access.token}`,
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = () => {
    void navigator.clipboard.writeText(mcpConfig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      title="Connect autonomous agents"
      subtitle="Agents propose work, inspect intent, and run in isolated workspaces via MCP."
      onClose={onClose}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div className="field">
          <label>MCP SERVER ENDPOINT</label>
          <input readOnly value={`${window.location.origin}${access.endpoint}`} />
        </div>

        <div className="field">
          <label>AGENT AUTH TOKEN (REVOCABLE)</label>
          <input readOnly value={access.token} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
              CLAUDE CODE / CURSOR / CODEX / HERMES CONFIG
            </span>
            <button type="button" className="text-button" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy JSON"}
            </button>
          </div>
          <pre>
            <code>{mcpConfig}</code>
          </pre>
        </div>

        <div className="dialog-footnote">
          Independent agents connect via this endpoint. They read the shared plan and register intent before receiving workspace access.
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
