import React from "react";
import { AlertTriangle } from "lucide-react";

export const EmptyChartState: React.FC = () => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        minHeight: "350px",
        gap: "12px",
        color: "var(--jantt-text-muted)"
      }}
    >
      <AlertTriangle size={36} color="#F43F5E" />
      <h3 style={{ color: "var(--jantt-text)" }}>Cannot render chart</h3>
      <p style={{ fontSize: "13px", maxWidth: "400px", textAlign: "center" }}>
        Please resolve the schema diagnostic errors in the left panel to display the interactive chart.
      </p>
    </div>
  );
};
