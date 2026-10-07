import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface DialogProps {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Dialog({ title, subtitle, onClose, children }: DialogProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <section ref={dialogRef} className="modal">
        <div className="modal-head">
          <div>
            <h2 id="dialog-title">{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            type="button"
            className="button quiet small"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ padding: "4px" }}
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
