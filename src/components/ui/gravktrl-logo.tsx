import React from "react";

export interface GravKtrlLogoProps {
  size?: number | "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  animated?: boolean;
}

const SIZE_MAP: Record<string, number> = {
  sm: 28,
  md: 40,
  lg: 56,
  xl: 72,
};

export const GravKtrlLogo: React.FC<GravKtrlLogoProps> = ({
  size = "md",
  className = "",
  showText = false,
  animated = false,
}) => {
  const pixelSize = typeof size === "number" ? size : SIZE_MAP[size] || 40;

  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <div
        style={{ width: pixelSize, height: pixelSize }}
        className={`relative shrink-0 ${animated ? "transition-transform duration-300 hover:scale-105" : ""}`}
      >
        <svg
          viewBox="0 0 256 256"
          width="100%"
          height="100%"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="gkBgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#141C1A" />
              <stop offset="100%" stopColor="#090D0C" />
            </radialGradient>

            <linearGradient id="gkOrb1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#F7E7CE" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#A79277" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#102C26" stopOpacity="0.1" />
            </linearGradient>

            <linearGradient id="gkOrb2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#A79277" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#102C26" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#F7E7CE" stopOpacity="0.15" />
            </linearGradient>

            <linearGradient id="gkHexTop" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="#245E52" />
              <stop offset="100%" stopColor="#163F36" />
            </linearGradient>

            <linearGradient id="gkHexLeft" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#102C26" />
              <stop offset="100%" stopColor="#0A1C18" />
            </linearGradient>

            <linearGradient id="gkHexRight" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0E2721" />
              <stop offset="100%" stopColor="#071411" />
            </linearGradient>
          </defs>

          {/* Squircle Housing */}
          <rect width="256" height="256" rx="56" fill="url(#gkBgGrad)" />
          <rect width="254" height="254" x="1" y="1" rx="55" stroke="#202E2A" strokeWidth="2" />

          {/* Telemetry Orbital Arc 1 */}
          <ellipse
            cx="128"
            cy="128"
            rx="98"
            ry="52"
            stroke="url(#gkOrb1)"
            strokeWidth="2.2"
            strokeDasharray="14 6 4 6"
            transform="rotate(-25 128 128)"
            className={animated ? "animate-pulse" : ""}
          />

          {/* Telemetry Orbital Arc 2 */}
          <ellipse
            cx="128"
            cy="128"
            rx="92"
            ry="46"
            stroke="url(#gkOrb2)"
            strokeWidth="2"
            strokeDasharray="24 8 2 8"
            transform="rotate(35 128 128)"
          />

          {/* Orbital Beacon Nodes */}
          <circle cx="218" cy="86" r="3.5" fill="#F7E7CE" />
          <circle cx="38" cy="170" r="2.5" fill="#A79277" />

          {/* Isometric Gravity-Well Hex Core */}
          {/* Top Face */}
          <polygon
            points="128,74 174,101 128,128 82,101"
            fill="url(#gkHexTop)"
            stroke="#A79277"
            strokeWidth="1.2"
            strokeOpacity="0.4"
          />

          {/* Left Bottom Face */}
          <polygon
            points="82,101 128,128 128,182 82,155"
            fill="url(#gkHexLeft)"
            stroke="#102C26"
            strokeWidth="1.2"
          />

          {/* Right Bottom Face */}
          <polygon
            points="128,128 174,101 174,155 128,182"
            fill="url(#gkHexRight)"
            stroke="#102C26"
            strokeWidth="1.2"
          />

          {/* Inner Well Recess */}
          <polygon
            points="128,94 154,109 128,124 102,109"
            fill="#0A1A16"
            stroke="#245E52"
            strokeWidth="1"
          />

          {/* Command Chevron (>_) */}
          <path
            d="M116 114 L128 124 L116 134"
            stroke="#F7E7CE"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M134 134 L146 134"
            stroke="#A79277"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-champagne text-base sm:text-lg">
              GravKtrl
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-forest text-champagne/90 border border-forest-light">
              v0.1.0
            </span>
          </div>
          <span className="text-[10px] font-mono tracking-widest uppercase text-donkey">
            Antigravity Bridge
          </span>
        </div>
      )}
    </div>
  );
};

export default GravKtrlLogo;
