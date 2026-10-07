import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Brand } from "../common/Brand";

interface LoginGateProps {
  error: string;
  onUseDevToken?: () => void;
  isDev: boolean;
}

export function LoginGate({ error, onUseDevToken, isDev }: LoginGateProps) {
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [devToken, setDevToken] = useState("");

  return (
    <main className="gate">
      <div className="gate-card">
        <Brand />

        <div style={{ display: "inline-block", background: "var(--surface-subtle)", padding: "4px 10px", borderRadius: "100px", fontSize: "11px", color: "var(--brand)", fontWeight: 600, margin: "16px 0" }}>
          THE AGENTIC GIT PLATFORM
        </div>

        <h1>
          Independent agents.<br />
          <em>Coherent work.</em>
        </h1>

        <p>
          A Git platform for independent autonomous agents working concurrently without broken merges.
        </p>

        <a
          className="button primary"
          href="/auth/github/start"
          style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: "13px" }}
        >
          Continue with GitHub <ArrowRight size={15} />
        </a>

        {isDev && (
          <div style={{ marginTop: "20px" }}>
            {!showTokenInput ? (
              <button
                type="button"
                className="text-button"
                onClick={() => setShowTokenInput(true)}
                style={{ fontSize: "11px", color: "var(--text-muted)" }}
              >
                Or connect with local development token
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (devToken.trim() && onUseDevToken) {
                    localStorage.setItem("gitandem:api-token", devToken.trim());
                    window.location.reload();
                  }
                }}
                style={{ display: "flex", gap: "8px", marginTop: "10px" }}
              >
                <input
                  type="password"
                  value={devToken}
                  onChange={(e) => setDevToken(e.target.value)}
                  placeholder="Paste local API token"
                  style={{ fontSize: "12px", padding: "6px 10px", flex: 1 }}
                />
                <button type="submit" className="button primary small" disabled={!devToken.trim()}>
                  Connect
                </button>
              </form>
            )}
          </div>
        )}

        <div className="gate-note">
          <LockKeyhole size={13} />
          <span>Gitandem uses GitHub for identity verification. All repository coordination happens on Gitandem.</span>
        </div>

        {error && <div className="form-error">{error}</div>}
      </div>

      <div className="gate-caption">CONCURRENT AGENTS · PRE-COMMIT INTENT · OPEN SOURCE</div>
    </main>
  );
}
