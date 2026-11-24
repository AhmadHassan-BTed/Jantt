import React from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { ToastItem } from "../../hooks/useToast";

interface ToastProps {
  /** Queue from `useToast().toasts`. */
  toasts?: ToastItem[];
  onDismiss?: (id: number) => void;
  /** @deprecated Single-message API, used only when `toasts` is not provided. */
  toastMessage?: string | null;
  /** @deprecated Single-message API, used only when `toasts` is not provided. */
  isToastError?: boolean;
}

/**
 * Notification stack. The live region is always mounted so screen readers announce new
 * messages: successes politely (role=status), errors immediately (role=alert).
 */
export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss, toastMessage, isToastError = false }) => {
  const items: ToastItem[] =
    toasts ?? (toastMessage ? [{ id: 0, message: toastMessage, isError: isToastError }] : []);

  return (
    <div className="jantt-toast-region" role="region" aria-label="Notifications">
      {items.map((toast) => (
        <div
          key={toast.id}
          className={`jantt-toast ${toast.isError ? "toast-error" : "toast-success"}`}
          role={toast.isError ? "alert" : "status"}
          aria-live={toast.isError ? "assertive" : "polite"}
        >
          {toast.isError ? (
            <AlertTriangle size={16} aria-hidden="true" />
          ) : (
            <CheckCircle2 size={16} aria-hidden="true" />
          )}
          <span className="jantt-toast-message">{toast.message}</span>
          {onDismiss && (
            <button
              type="button"
              className="jantt-toast-close"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};
