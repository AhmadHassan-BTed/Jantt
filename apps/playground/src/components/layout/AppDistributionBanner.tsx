import React from "react";
import { Globe, Heart, MessageCircle, Smartphone, Star, X } from "lucide-react";
import { APP_DISTRIBUTION_LINKS } from "../../constants";

export interface AppDistributionBannerProps {
  /** True when running inside the installed Android TWA or standalone PWA app. */
  isAppContext: boolean;
  /** True on phone / compact viewports. */
  isMobile: boolean;
  onOpenAndroidTesting: () => void;
  onOpenWebAccess: () => void;
  onOpenRateApp: () => void;
  onDismiss: () => void;
}

/**
 * Context-aware release & community support bar:
 * - Browser: invites users to support Jantt's Android launch via early testing + direct feedback.
 * - Android App / Standalone: offers one-tap Web Version access, Rate App, and direct developer messaging.
 */
export const AppDistributionBanner: React.FC<AppDistributionBannerProps> = ({
  isAppContext,
  isMobile,
  onOpenAndroidTesting,
  onOpenWebAccess,
  onOpenRateApp,
  onDismiss
}) => {
  const whatsappHref = `${APP_DISTRIBUTION_LINKS.WHATSAPP_URL}?text=${encodeURIComponent(
    "Hi Ahmad, I'm using Jantt and wanted to share feedback or report an issue:"
  )}`;

  return (
    <aside
      className={`jantt-app-banner ${isAppContext ? "is-app-mode" : "is-web-mode"} ${isMobile ? "is-mobile" : "is-desktop"}`}
      aria-label="Jantt app release and open-source support"
    >
      <div className="jantt-app-banner-copy">
        <span className="jantt-app-banner-pill" aria-hidden="true">
          <Heart size={11} style={{ color: "#F43F5E" }} />
          <span>{isMobile ? "MIT Free" : "Free & Open Source"}</span>
        </span>
        {isAppContext ? (
          <span className="jantt-app-banner-text">
            {isMobile
              ? "Also available on laptop! Free & open-source: message me before a bad rating."
              : "Also available on laptop & desktop web (100% free & MIT open-source). Message me instead of a bad rating."}
          </span>
        ) : (
          <span className="jantt-app-banner-text">
            {isMobile
              ? "Support Jantt Android: join early testing (100% free)!"
              : "Support releasing the Jantt Android App: join early testing (100% free, open-source & freely maintained)."}
          </span>
        )}
      </div>

      <div className="jantt-app-banner-actions">
        {isAppContext ? (
          <>
            <button
              type="button"
              className="jantt-app-banner-btn is-primary"
              onClick={onOpenWebAccess}
              title="Open or share Jantt on your laptop or desktop browser"
            >
              <Globe size={12} aria-hidden="true" />
              <span>{isMobile ? "Laptop Web" : "Use on Laptop"}</span>
            </button>
            <button
              type="button"
              className="jantt-app-banner-btn is-secondary"
              onClick={onOpenRateApp}
            >
              <Star size={12} style={{ color: "#F59E0B" }} aria-hidden="true" />
              <span>{isMobile ? "Rate" : "Rate App"}</span>
            </button>
            {!isMobile && (
              <a
                className="jantt-app-banner-btn is-secondary"
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Free & open-source: message the developer directly on WhatsApp instead of leaving a bad rating"
              >
                <MessageCircle size={12} style={{ color: "#22C55E" }} aria-hidden="true" />
                <span>Message Me</span>
              </a>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="jantt-app-banner-btn is-primary"
              onClick={onOpenAndroidTesting}
            >
              <Smartphone size={12} aria-hidden="true" />
              <span>{isMobile ? "Get App" : "Join Early Testing"}</span>
            </button>
            {!isMobile && (
              <a
                className="jantt-app-banner-btn is-secondary"
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                title="Free & open-source: message the developer directly on WhatsApp instead of leaving a bad rating"
              >
                <MessageCircle size={12} style={{ color: "#22C55E" }} aria-hidden="true" />
                <span>Message Me</span>
              </a>
            )}
          </>
        )}

        <button
          type="button"
          className="jantt-app-banner-close"
          onClick={onDismiss}
          aria-label="Dismiss app banner"
          title="Dismiss banner"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
};
