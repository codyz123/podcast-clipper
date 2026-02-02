import React from "react";
import { cn } from "../../lib/utils";

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const confirmButtonClass = {
    danger: "bg-[hsl(var(--error))] hover:bg-[hsl(var(--error)/0.9)]",
    warning: "bg-amber-500 hover:bg-amber-600",
    default: "bg-[hsl(var(--cyan))] hover:bg-[hsl(var(--cyan)/0.9)]",
  }[variant];

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* Dialog */}
      <div
        className={cn(
          "fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
          "w-full max-w-md rounded-xl",
          "bg-[hsl(var(--surface))]",
          "border border-[hsl(var(--border-subtle))]",
          "shadow-xl shadow-black/30",
          "p-6"
        )}
      >
        <h2 className="text-lg font-semibold text-[hsl(var(--text))]">{title}</h2>
        <p className="mt-2 text-sm text-[hsl(var(--text-muted))]">{description}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium",
              "bg-[hsl(var(--surface))] text-[hsl(var(--text))]",
              "border border-[hsl(var(--border-subtle))]",
              "hover:bg-[hsl(var(--surface-hover))]",
              "disabled:opacity-50"
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-medium text-white",
              confirmButtonClass,
              "disabled:opacity-50"
            )}
          >
            {isLoading ? "..." : confirmText}
          </button>
        </div>
      </div>
    </>
  );
};
