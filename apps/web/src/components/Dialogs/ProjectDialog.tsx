import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Dialog } from "./Dialog";

interface ProjectDialogProps {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    id: string;
    name: string;
    goal: string;
    constraints: string[];
    repositoryMode: "create" | "import";
    sourceUrl?: string;
    sourceBranch?: string;
  }) => void;
}

export function ProjectDialog({ busy, onClose, onSubmit }: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceBranch, setSourceBranch] = useState("");
  const [constraints, setConstraints] = useState("");
  const [mode, setMode] = useState<"create" | "import">("create");

  const slug = (val: string) =>
    val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 63);

  const lines = (text: string) =>
    text
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      id: slug(name),
      name: name.trim(),
      goal: goal.trim(),
      constraints: lines(constraints),
      repositoryMode: mode,
      sourceUrl: mode === "import" ? sourceUrl.trim() : undefined,
      sourceBranch: mode === "import" ? sourceBranch.trim() || undefined : undefined,
    });
  };

  return (
    <Dialog
      title="Create or import a repository"
      subtitle="Establish the repository home and starting constraints before agents begin work."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="dialog-form">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button
            type="button"
            className={`button ${mode === "create" ? "primary" : "outline"}`}
            onClick={() => setMode("create")}
            style={{ justifyContent: "center" }}
          >
            New Artifacts repository
          </button>
          <button
            type="button"
            className={`button ${mode === "import" ? "primary" : "outline"}`}
            onClick={() => setMode("import")}
            style={{ justifyContent: "center" }}
          >
            Import Git remote
          </button>
        </div>

        <div className="field">
          <label>REPOSITORY NAME</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. billing-service"
            required
          />
        </div>

        <div className="field">
          <label>WHAT ARE WE BUILDING?</label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe the desired system behavior..."
            rows={2}
            required
          />
        </div>

        {mode === "import" && (
          <>
            <div className="field">
              <label>PUBLIC HTTPS GIT REMOTE</label>
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://github.com/owner/repository.git"
                required
              />
            </div>
            <div className="field">
              <label>BRANCH (OPTIONAL)</label>
              <input
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                placeholder="Defaults to source default branch"
              />
            </div>
          </>
        )}

        <div className="field">
          <label>STARTING CONSTRAINTS (ONE PER LINE)</label>
          <textarea
            value={constraints}
            onChange={(e) => setConstraints(e.target.value)}
            placeholder="Keep public API backwards compatible"
            rows={2}
          />
        </div>

        <div className="dialog-actions">
          <button type="button" className="button outline" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={busy || !slug(name) || !goal.trim() || (mode === "import" && !sourceUrl.trim())}
          >
            {busy ? "Provisioning…" : "Create repository"} <ArrowRight size={14} />
          </button>
        </div>
      </form>
    </Dialog>
  );
}
