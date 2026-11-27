import React, { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Github,
  Globe,
  Heart,
  MessageCircle,
  Share2,
  Smartphone,
  Star,
  Users
} from "lucide-react";
import { APP_DISTRIBUTION_LINKS } from "../../constants";
import { Modal, ModalHeader } from "./ModalHost";

export const JANTT_RATE_THRESHOLD = 4.8;

export interface AndroidTestingModalProps {
  show: boolean;
  onClose: () => void;
  googleGroupUrl?: string;
  playTestingUrl?: string;
  whatsappUrl?: string;
  githubIssuesUrl?: string;
}

/**
 * Browser early-testing opt-in modal: invites web users to support releasing the Jantt Android app
 * in 2 quick steps and asks them to message the maintainer instead of leaving bad ratings.
 */
export const AndroidTestingModal: React.FC<AndroidTestingModalProps> = ({
  show,
  onClose,
  googleGroupUrl = APP_DISTRIBUTION_LINKS.ANDROID_TESTER_GROUP_URL,
  playTestingUrl = APP_DISTRIBUTION_LINKS.ANDROID_PLAY_TESTING_URL,
  whatsappUrl = APP_DISTRIBUTION_LINKS.WHATSAPP_URL,
  githubIssuesUrl = APP_DISTRIBUTION_LINKS.GITHUB_ISSUES_URL
}) => {
  if (!show) return null;

  const waSupportHref = `${whatsappUrl}?text=${encodeURIComponent(
    "Hi Ahmad, I'm testing Jantt (free & open-source) and wanted to share feedback or a suggestion:"
  )}`;

  return (
    <Modal onClose={onClose} maxWidth={500}>
      <ModalHeader
        icon={<Smartphone size={18} />}
        title="Jantt Android App (Early Testing)"
        subtitle="100% free, MIT open-source, and independently maintained."
      />

      <div className="prompt-modal-body jantt-promo-modal-body">
        <div className="jantt-promo-hero">
          <div className="jantt-promo-hero-title">
            <Heart size={15} aria-hidden="true" />
            <span>Help release Jantt on Google Play</span>
          </div>
          <p className="jantt-promo-hero-copy">
            Jantt is completely free, open-source (MIT), and built without ads, trackers, or paywalls.
            Google Play requires a small group of early testers before public launch, so you can support
            releasing the app in 2 quick steps.
          </p>
        </div>

        <div className="jantt-promo-step-card">
          <div className="jantt-promo-step-head">
            <span className="jantt-promo-step-num" aria-hidden="true">1</span>
            <div className="jantt-promo-step-copy">
              <strong className="jantt-promo-step-title">Join the Early Testers Group</strong>
              <span className="jantt-promo-step-sub">Tap &ldquo;Join group&rdquo; on Google Groups</span>
            </div>
          </div>
          <a
            className="btn-nav btn-nav-primary jantt-promo-full-btn"
            href={googleGroupUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Users size={14} aria-hidden="true" />
            <span>Step 1 · Join Google Group</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>

        <div className="jantt-promo-step-card">
          <div className="jantt-promo-step-head">
            <span className="jantt-promo-step-num is-step-two" aria-hidden="true">2</span>
            <div className="jantt-promo-step-copy">
              <strong className="jantt-promo-step-title">Opt In &amp; Download from Play Store</strong>
              <span className="jantt-promo-step-sub">Tap &ldquo;Become a tester&rdquo; and install Jantt on Android</span>
            </div>
          </div>
          <a
            className="btn-nav jantt-promo-full-btn"
            href={playTestingUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Smartphone size={14} aria-hidden="true" />
            <span>Step 2 · Opt-In &amp; Download App</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>

        <div className="jantt-promo-support-box">
          <div className="jantt-promo-support-copy">
            <strong>Found a bug or missing a feature?</strong> Since Jantt is free, open-source, and
            freely maintained, please message me directly instead of leaving a bad Play Store rating,
            and I&apos;ll fix it or add your request for free.
          </div>
          <div className="jantt-promo-support-actions">
            <a
              className="btn-nav jantt-promo-wa-btn"
              href={waSupportHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={14} aria-hidden="true" />
              <span>Message Me on WhatsApp</span>
            </a>
            <a
              className="btn-nav jantt-promo-gh-btn"
              href={githubIssuesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github size={14} aria-hidden="true" />
              <span>GitHub Issues</span>
            </a>
          </div>
        </div>
      </div>

      <div className="prompt-modal-footer jantt-promo-footer">
        <span className="jantt-promo-footnote">
          Use the same Google account as your phone&apos;s Play Store for both steps.
        </span>
        <button type="button" className="btn-nav jantt-promo-dismiss-btn" onClick={onClose}>
          Maybe Later
        </button>
      </div>
    </Modal>
  );
};

export interface WebAccessModalProps {
  show: boolean;
  onClose: () => void;
  webUrl?: string;
  whatsappUrl?: string;
  githubIssuesUrl?: string;
}

/**
 * App / TWA modal for opening, copying, or sharing Jantt's Web Version on a laptop or desktop.
 */
export const WebAccessModal: React.FC<WebAccessModalProps> = ({
  show,
  onClose,
  webUrl = APP_DISTRIBUTION_LINKS.WEB_APP_URL,
  whatsappUrl = APP_DISTRIBUTION_LINKS.WHATSAPP_URL,
  githubIssuesUrl = APP_DISTRIBUTION_LINKS.GITHUB_ISSUES_URL
}) => {
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);

  if (!show) return null;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(webUrl);
      }
      setCopied(true);
      setShareNote("Link copied! Paste it in your laptop browser.");
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setShareNote("Copy the link above to open Jantt on your laptop.");
    }
  };

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Jantt - Free & Open-Source Gantt Planner",
          text: "Open Jantt on your laptop or desktop browser:",
          url: webUrl
        });
        setShareNote("Link shared.");
        return;
      } catch {
        // User cancelled or share failed; fall back to copy.
      }
    }
    await handleCopy();
  };

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <ModalHeader
        icon={<Globe size={18} />}
        title="Use Jantt Web on Laptop"
        subtitle="Open the full desktop workspace in any browser (100% free & open-source)."
      />

      <div className="prompt-modal-body jantt-promo-modal-body">
        <div className="jantt-promo-url-box">
          <code>{webUrl}</code>
        </div>

        <div className="jantt-promo-web-actions">
          <button type="button" className="btn-nav btn-nav-primary jantt-promo-full-btn" onClick={handleCopy}>
            {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copied ? "Copied!" : "Copy Web Link"}</span>
          </button>
          <button type="button" className="btn-nav jantt-promo-full-btn" onClick={handleShare}>
            <Share2 size={14} aria-hidden="true" />
            <span>Share Link</span>
          </button>
        </div>

        <a
          className="btn-nav jantt-promo-full-btn"
          href={webUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <ExternalLink size={14} aria-hidden="true" />
          <span>Open Web Version</span>
        </a>

        {shareNote && (
          <p className="jantt-promo-status-note" role="status">
            {shareNote}
          </p>
        )}

        <div className="jantt-promo-support-box">
          <div className="jantt-promo-support-copy">
            Jantt is free, MIT open-source, and freely maintained. Need help or a feature? Message me
            directly instead of leaving a bad rating.
          </div>
          <div className="jantt-promo-support-actions">
            <a className="btn-nav jantt-promo-wa-btn" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <MessageCircle size={14} aria-hidden="true" />
              <span>WhatsApp</span>
            </a>
            <a className="btn-nav jantt-promo-gh-btn" href={githubIssuesUrl} target="_blank" rel="noopener noreferrer">
              <Github size={14} aria-hidden="true" />
              <span>GitHub Issues</span>
            </a>
          </div>
        </div>
      </div>

      <div className="prompt-modal-footer">
        <button type="button" className="btn-nav" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
};

export interface RateAppModalProps {
  show: boolean;
  onClose: () => void;
  playStoreUrl?: string;
  whatsappUrl?: string;
  githubIssuesUrl?: string;
}

/**
 * Interactive 5-star rating modal (> 4.8 -> Google Play Store; <= 4.8 -> WhatsApp / GitHub Issues).
 */
export const RateAppModal: React.FC<RateAppModalProps> = ({
  show,
  onClose,
  playStoreUrl = APP_DISTRIBUTION_LINKS.ANDROID_PLAY_STORE_URL,
  whatsappUrl = APP_DISTRIBUTION_LINKS.WHATSAPP_URL,
  githubIssuesUrl = APP_DISTRIBUTION_LINKS.GITHUB_ISSUES_URL
}) => {
  const [score, setScore] = useState<number | null>(null);

  if (!show) return null;

  const isHighScore = score !== null && score > JANTT_RATE_THRESHOLD;
  const isLowScore = score !== null && score <= JANTT_RATE_THRESHOLD;
  const waFeedbackUrl = `${whatsappUrl}?text=${encodeURIComponent(
    `Hi Ahmad, I rated Jantt ${score?.toFixed(1) ?? ""}/5 and wanted to tell you what can be improved:`
  )}`;

  return (
    <Modal onClose={onClose} maxWidth={460}>
      <ModalHeader
        icon={<Star size={18} />}
        title="Support Jantt"
        subtitle="Free, MIT open-source, and built independently with love."
      />

      <div className="prompt-modal-body jantt-promo-modal-body">
        <div className="jantt-rate-card">
          <div className="jantt-rate-heading">How is Jantt working for you?</div>
          <div className="jantt-rate-stars" role="group" aria-label="Rate Jantt out of 5 stars">
            {[1, 2, 3, 4, 5].map((star) => {
              const lit = score !== null && star <= Math.round(score);
              return (
                <button
                  key={star}
                  type="button"
                  className={`jantt-rate-star-btn ${lit ? "is-lit" : ""}`}
                  aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                  aria-pressed={lit}
                  onClick={() => setScore(star)}
                >
                  <Star size={20} fill={lit ? "currentColor" : "none"} aria-hidden="true" />
                </button>
              );
            })}
          </div>

          <div className="jantt-rate-slider-row">
            <label htmlFor="jantt-rate-slider" className="sr-only">
              Rating out of 5
            </label>
            <input
              id="jantt-rate-slider"
              type="range"
              min="1.0"
              max="5.0"
              step="0.1"
              value={score ?? 5.0}
              onChange={(e) => setScore(parseFloat(e.target.value))}
            />
            <span className="jantt-rate-score-pill">
              {score === null ? "Tap ★" : `${score.toFixed(1)} / 5`}
            </span>
          </div>

          {isHighScore && (
            <div className="jantt-rate-branch is-high" role="status">
              <p>
                Thank you so much! Leaving a quick 5-star review on Google Play helps this free
                open-source project reach more people.
              </p>
              <a
                className="btn-nav btn-nav-primary jantt-promo-full-btn"
                href={playStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Star size={14} aria-hidden="true" />
                <span>Rate on Google Play</span>
                <ExternalLink size={12} aria-hidden="true" />
              </a>
            </div>
          )}

          {isLowScore && (
            <div className="jantt-rate-branch is-low" role="status">
              <p>
                Jantt is free, open-source, and freely maintained. Please message me directly instead
                of leaving a bad rating: tell me what went wrong and I&apos;ll fix it for free!
              </p>
              <div className="jantt-promo-support-actions">
                <a
                  className="btn-nav jantt-promo-wa-btn"
                  href={waFeedbackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={14} aria-hidden="true" />
                  <span>Tell Me on WhatsApp</span>
                </a>
                <a
                  className="btn-nav jantt-promo-gh-btn"
                  href={githubIssuesUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github size={14} aria-hidden="true" />
                  <span>GitHub Issue</span>
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="prompt-modal-footer">
        <button type="button" className="btn-nav" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
};
