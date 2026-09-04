import React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface ToastProps {
  toastMessage: string | null;
  isToastError: boolean;
}

export const Toast: React.FC<ToastProps> = ({ toastMessage, isToastError }) => {
  if (!toastMessage) return null;

  return (
    <div
      className={`jantt-toast ${isToastError ? "toast-error" : "toast-success"}`}
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 16px",
        borderRadius: "8px",
        background: isToastError ? "#EF4444" : "#10B981",
        color: "#FFFFFF",
        fontWeight: 600,
        fontSize: "13px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
        animation: "jantt-slide-in-right 0.25s ease-out"
      }}
    >
      {isToastError ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
      <span>{toastMessage}</span>
    </div>
  );
};
