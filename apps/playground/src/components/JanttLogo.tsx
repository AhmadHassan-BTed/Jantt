import React from "react";

export type JanttLogoVariant = "gradient" | "duotone" | "monochrome" | "outline" | "solid";

export interface JanttIconProps {
  size?: number;
  variant?: JanttLogoVariant;
  color?: string;
  secondaryColor?: string;
  className?: string;
  style?: React.CSSProperties;
}

export interface JanttLogoProps extends JanttIconProps {
  showWordmark?: boolean;
}

/**
 * Jantt Symbolic Minimal Icon:
 * Seamlessly integrates JSON syntax ({ ... }) with Gantt timeline schedule bars (▬ ▬ ◆).
 * Supports 5 colorway variants: gradient, duotone, monochrome, outline, solid.
 */
export const JanttIcon: React.FC<JanttIconProps> = ({
  size = 32,
  variant = "gradient",
  color,
  secondaryColor,
  className = "",
  style = {}
}) => {
  const isOutline = variant === "outline";
  const isMono = variant === "monochrome";
  const isDuo = variant === "duotone";
  const isSolid = variant === "solid";

  const primaryColor = color || (isMono ? "currentColor" : "var(--jantt-accent, #38BDF8)");
  const subColor = secondaryColor || (isDuo ? "var(--jantt-text-muted, #94A3B8)" : isMono ? "currentColor" : "#3B82F6");
  const connectorColor = isMono ? "currentColor" : isDuo ? subColor : "var(--jantt-text-muted, #94A3B8)";

  const badgeBg = isOutline
    ? "transparent"
    : isSolid
    ? "var(--jantt-accent, #38BDF8)"
    : "url(#jantt-badge-bg)";

  const badgeBorder = isOutline
    ? "transparent"
    : isSolid
    ? "none"
    : isMono
    ? "currentColor"
    : "var(--jantt-border-strong, rgba(56, 189, 248, 0.28))";

  const braceStroke = isSolid
    ? "#FFFFFF"
    : isMono
    ? "currentColor"
    : isDuo
    ? subColor
    : "url(#jantt-accent-grad)";

  const bar1Fill = isSolid
    ? "rgba(255, 255, 255, 0.95)"
    : isMono
    ? "currentColor"
    : isDuo
    ? primaryColor
    : "url(#jantt-bar1)";

  const bar2Fill = isSolid
    ? "rgba(255, 255, 255, 0.85)"
    : isMono
    ? "currentColor"
    : isDuo
    ? primaryColor
    : "url(#jantt-bar2)";

  const bar3Fill = isSolid
    ? "rgba(255, 255, 255, 0.75)"
    : isMono
    ? "currentColor"
    : isDuo
    ? subColor
    : "url(#jantt-bar3)";

  const milestoneFill = isSolid
    ? "#FFFFFF"
    : isMono
    ? "currentColor"
    : isDuo
    ? primaryColor
    : "#F59E0B";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`jantt-logo-svg jantt-logo-${variant} ${className}`}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, ...style }}
      aria-label="Jantt Logo"
    >
      {!isMono && !isSolid && (
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
      )}

      {/* Container squircle background (unless outline) */}
      {!isOutline && (
        <rect
          x="0.75"
          y="0.75"
          width="30.5"
          height="30.5"
          rx="8.5"
          fill={badgeBg}
          stroke={badgeBorder}
          strokeWidth={isMono ? 1.4 : 1.2}
          strokeOpacity={isMono ? 0.4 : 1}
        />
      )}

      {/* JSON Left Curly Brace: { */}
      <path
        d="M 8.5 7.5 C 6.5 7.5 5.5 9 5.5 11.5 C 5.5 13.5 4.5 15 3.2 16 C 4.5 17 5.5 18.5 5.5 20.5 C 5.5 23 6.5 24.5 8.5 24.5"
        stroke={braceStroke}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Gantt Bar 1: Top Task */}
      <rect x="9.5" y="8.5" width="8" height="3" rx="1.5" fill={bar1Fill} />

      {/* Dependency Connector Step */}
      <path
        d="M 17.5 10 L 19 10 L 19 14.5 L 20 14.5"
        stroke={connectorColor}
        strokeWidth="0.9"
        strokeOpacity={isMono ? 0.6 : 0.7}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Gantt Bar 2: Middle Task */}
      <rect x="13.5" y="14" width="9" height="3" rx="1.5" fill={bar2Fill} />

      {/* Gantt Bar 3: Bottom Task */}
      <rect x="9.5" y="19.5" width="6.5" height="3" rx="1.5" fill={bar3Fill} />

      {/* Milestone Diamond */}
      <rect
        x="19.2"
        y="19.5"
        width="3"
        height="3"
        rx="0.6"
        transform="rotate(45 20.7 21)"
        fill={milestoneFill}
      />

      {/* JSON Right Curly Brace: } */}
      <path
        d="M 23.5 7.5 C 25.5 7.5 26.5 9 26.5 11.5 C 26.5 13.5 27.5 15 28.8 16 C 27.5 17 26.5 18.5 26.5 20.5 C 26.5 23 25.5 24.5 23.5 24.5"
        stroke={braceStroke}
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
  variant = "gradient",
  color,
  secondaryColor,
  className = "",
  showWordmark = true,
  style = {}
}) => {
  const isMono = variant === "monochrome";
  const primaryColor = color || (isMono ? "currentColor" : "var(--jantt-accent, #38BDF8)");
  const textColor = isMono ? "currentColor" : "var(--jantt-text, #FFFFFF)";

  return (
    <div
      className={`jantt-brand-logo jantt-brand-${variant} ${className}`}
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
      <JanttIcon
        size={size}
        variant={variant}
        color={color}
        secondaryColor={secondaryColor}
      />
      {showWordmark && (
        <span
          style={{
            fontSize: `${Math.round(size * 0.6)}px`,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            color: textColor,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center"
          }}
        >
          <span style={{ color: primaryColor }}>J</span>antt
        </span>
      )}
    </div>
  );
};

export default JanttLogo;
