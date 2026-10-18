import React from "react";

interface GravKtrlLogoProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  withGlow?: boolean;
}

export const GravKtrlLogo: React.FC<GravKtrlLogoProps> = ({
  size = "md",
  className = "",
  withGlow = true,
}) => {
  const sizeMap = {
    xs: "w-5 h-5",
    sm: "w-7 h-7",
    md: "w-10 h-10",
    lg: "w-16 h-16",
    xl: "w-24 h-24",
  };

  const dimension = sizeMap[size];

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${dimension} ${className}`}
    >
      {withGlow && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 opacity-40 blur-md -z-10 animate-pulse" />
      )}
      <svg
        viewBox="0 0 512 512"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full drop-shadow-md select-none"
      >
        <defs>
          <linearGradient id="gk-bg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#030712" />
            <stop offset="50%" stopColor="#080d1a" />
            <stop offset="100%" stopColor="#02040a" />
          </linearGradient>

          <linearGradient id="gk-hex" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="50%" stopColor="#db2777" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>

          <linearGradient id="gk-orbit" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.95" />
            <stop offset="50%" stopColor="#db2777" stopOpacity="1" />
            <stop offset="100%" stopColor="#9333ea" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="gk-arrow" x1="50%" y1="100%" x2="50%" y2="0%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="50%" stopColor="#ec4899" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
        </defs>

        {/* Outer Hexagon */}
        <polygon
          points="256,24 456,139 456,373 256,488 56,373 56,139"
          fill="url(#gk-bg)"
          stroke="url(#gk-hex)"
          strokeWidth="12"
          strokeLinejoin="round"
        />

        {/* Internal geometry */}
        <polygon
          points="256,54 426,152 426,360 256,458 86,360 86,152"
          fill="none"
          stroke="#1e293b"
          strokeWidth="3"
          strokeDasharray="8 8"
          opacity="0.35"
        />

        {/* Tilted Orbital Ring */}
        <ellipse
          cx="256"
          cy="256"
          rx="170"
          ry="64"
          fill="none"
          stroke="url(#gk-orbit)"
          strokeWidth="10"
          strokeLinecap="round"
          transform="rotate(-28 256 256)"
        />

        {/* Terminal Brackets { } */}
        <path
          d="M 160 190 Q 140 190 140 220 L 140 240 Q 140 256 125 256 Q 140 256 140 272 L 140 292 Q 140 322 160 322"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M 352 190 Q 372 190 372 220 L 372 240 Q 372 256 387 256 Q 372 256 372 272 L 372 292 Q 372 322 352 322"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Levitating Upward Antigravity Arrow */}
        <path
          d="M 256 120 L 324 235 L 285 235 L 285 330 L 227 330 L 227 235 L 188 235 Z"
          fill="url(#gk-arrow)"
        />

        {/* Particle Accent Dots */}
        <circle cx="106" cy="336" r="8" fill="#06b6d4" />
        <circle cx="406" cy="176" r="8" fill="#db2777" />
        <circle cx="256" cy="120" r="5" fill="#ffffff" />
      </svg>
    </div>
  );
};
