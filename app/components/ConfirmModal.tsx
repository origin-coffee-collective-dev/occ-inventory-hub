import { useEffect, useRef } from "react";
import { colors } from "~/lib/tokens";

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmStyle?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

/**
 * Reusable confirmation modal for destructive or important actions.
 *
 * Use this for:
 * - Delete operations
 * - Token refreshes
 * - Data updates that can't be undone
 * - Any action that modifies external state
 */
export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  confirmStyle = "primary",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLoading) {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, isLoading, onCancel]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const confirmButtonColor = confirmStyle === "danger" ? colors.error.default : colors.primary.default;
  const confirmButtonHoverColor = confirmStyle === "danger" ? colors.error.hover : colors.primary.hover;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) {
          onCancel();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !isLoading) {
          onCancel();
        }
      }}
    >
      <div
        ref={modalRef}
        style={{
          backgroundColor: colors.background.card,
          borderRadius: "8px",
          padding: "1.5rem",
          maxWidth: "400px",
          width: "90%",
          boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1), 0 10px 20px rgba(0, 0, 0, 0.1)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <h2
          id="modal-title"
          style={{
            margin: "0 0 0.75rem",
            fontSize: "1.125rem",
            fontWeight: 600,
          }}
        >
          {title}
        </h2>

        <p style={{ margin: "0 0 1.5rem", color: colors.text.muted, lineHeight: 1.5 }}>
          {message}
        </p>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: colors.background.card,
              color: colors.primary.hover,
              border: `1px solid ${colors.border.strong}`,
              borderRadius: "4px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
              opacity: isLoading ? 0.5 : 1,
            }}
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: isLoading ? colors.interactive.disabled : confirmButtonColor,
              color: colors.text.inverse,
              border: "none",
              borderRadius: "4px",
              cursor: isLoading ? "not-allowed" : "pointer",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = confirmButtonHoverColor;
              }
            }}
            onMouseOut={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = confirmButtonColor;
              }
            }}
            onFocus={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = confirmButtonHoverColor;
              }
            }}
            onBlur={(e) => {
              if (!isLoading) {
                e.currentTarget.style.backgroundColor = confirmButtonColor;
              }
            }}
          >
            {isLoading ? "Processing..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
