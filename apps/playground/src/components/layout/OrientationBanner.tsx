import React, { useState } from "react";
import { RotateCw, X } from "lucide-react";

interface OrientationBannerProps {
  isMobile: boolean;
  isPortrait: boolean;
  activeView: string;
}

const STORAGE_KEY_DISMISSED = "jantt_dismiss_orientation_banner";

export const OrientationBanner: React.FC<OrientationBannerProps> = ({
  isMobile,
  isPortrait,
  activeView
}) => {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY_DISMISSED) === "true";
    } catch {
      return false;
    }
  });

  const shouldShow = isMobile && isPortrait && activeView === "gantt" && !isDismissed;

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(STORAGE_KEY_DISMISSED, "true");
    } catch {
      // Ignore
    }
  };

  if (!shouldShow) return null;

  return (
    <aside
      className="mobile-orientation-banner"
      role="status"
      aria-live="polite"
      aria-label="Screen orientation tip"
    >
      <div className="mobile-orientation-banner-content">
        <span className="mobile-orientation-icon-wrap" aria-hidden="true">
          <RotateCw size={14} className="rotate-hint-icon" />
        </span>
        <span className="mobile-orientation-text">
          Rotate phone to <strong>landscape</strong> for full timeline view
        </span>
      </div>
      <button
        type="button"
        className="mobile-orientation-close"
        onClick={handleDismiss}
        aria-label="Dismiss orientation banner"
      >
        <X size={13} />
      </button>
    </aside>
  );
};
