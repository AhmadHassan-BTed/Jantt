import React from "react";

export interface JanttLogoProps {
  size?: number;
  className?: string;
  showWordmark?: boolean;
  style?: React.CSSProperties;
}

/**
 * Jantt Symbolic Minimal Icon:
 * Seamlessly integrates JSON syntax ({ ... }) with Gantt timeline schedule bars (▬ ▬ ◆).
 */
export const JanttIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 32,
  className = "",
  style = {}
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`jantt-logo-svg ${className}`}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label="Jantt Logo"
    >
      <defs>
        <linearGradient id="jantt-badge-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--jantt-surface-solid, #10192A)" />
          <stop offset="100%" stopColor="var(--jantt-surface, #0A0F1D)" />
        </linearGradient>
        <linearGradient id="jantt-accent-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--jantt-accent, #38BDF8)" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id="jantt-bar1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--jantt-accent, #38BDF8)" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
        <linearGradient id="jantt-bar2" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#818CF8" />
        </linearGradient>
        <linearGradient id="jantt-bar3" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>

      <rect
        x="0.75"
        y="0.75"
        width="30.5"
        height="30.5"
        rx="8.5"
        fill="url(#jantt-badge-bg)"
        stroke="var(--jantt-border-strong, rgba(56, 189, 248, 0.28))"
        strokeWidth="1.2"
      />

      {/* JSON Left Curly Brace: { */}
      <path
        d="M 8.5 7.5 C 6.5 7.5 5.5 9 5.5 11.5 C 5.5 13.5 4.5 15 3.2 16 C 4.5 17 5.5 18.5 5.5 20.5 C 5.5 23 6.5 24.5 8.5 24.5"
        stroke="url(#jantt-accent-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Gantt Bar 1 */}
      <rect x="9.5" y="8.5" width="8" height="3" rx="1.5" fill="url(#jantt-bar1)" />

      {/* Dependency Connector */}
      <path
        d="M 17.5 10 L 19 10 L 19 14.5 L 20 14.5"
        stroke="var(--jantt-text-muted, #94A3B8)"
        strokeWidth="0.9"
        strokeOpacity="0.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Gantt Bar 2 */}
      <rect x="13.5" y="14" width="9" height="3" rx="1.5" fill="url(#jantt-bar2)" />

      {/* Gantt Bar 3 */}
      <rect x="9.5" y="19.5" width="6.5" height="3" rx="1.5" fill="url(#jantt-bar3)" />

      {/* Milestone Diamond */}
      <rect x="19.2" y="19.5" width="3" height="3" rx="0.6" transform="rotate(45 20.7 21)" fill="#F59E0B" />

      {/* JSON Right Curly Brace: } */}
      <path
        d="M 23.5 7.5 C 25.5 7.5 26.5 9 26.5 11.5 C 26.5 13.5 27.5 15 28.8 16 C 27.5 17 26.5 18.5 26.5 20.5 C 26.5 23 25.5 24.5 23.5 24.5"
        stroke="url(#jantt-accent-grad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
};

/**
 * Full Jantt Logo with Icon + Typography
 */
export const JanttLogo: React.FC<JanttLogoProps> = ({
  size = 32,
  className = "",
  showWordmark = true,
  style = {}
}) => {
  return (
    <div
      className={`jantt-brand-logo ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        fontFamily: "'Space Grotesk', -apple-system, sans-serif",
        userSelect: "none",
        cursor: "pointer",
        ...style
      }}
    >
      <JanttIcon size={size} />
      {showWordmark && (
        <span
          style={{
            fontSize: `${Math.round(size * 0.6)}px`,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: "var(--jantt-text, #FFFFFF)",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center"
          }}
        >
          <span style={{ color: "var(--jantt-accent, #38BDF8)" }}>J</span>antt
        </span>
      )}
    </div>
  );
};
