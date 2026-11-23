"use client";

import { useState, useEffect, useCallback } from "react";

export type DevicePosture = "slab" | "flip-tabletop" | "fold-expanded" | "dual-screen";

export interface PostureState {
  posture: DevicePosture;
  effectivePosture: DevicePosture;
  manualOverride: DevicePosture | null;
  setManualOverride: (posture: DevicePosture | null) => void;
  width: number;
  height: number;
  isFoldable: boolean;
}

export function usePosture(): PostureState {
  const [manualOverride, setManualOverride] = useState<DevicePosture | null>(null);
  const [dimensions, setDimensions] = useState({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  });

  const updateDimensions = useCallback(() => {
    if (typeof window !== "undefined") {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("resize", updateDimensions);
    window.addEventListener("orientationchange", updateDimensions);

    // Initial read
    updateDimensions();

    return () => {
      window.removeEventListener("resize", updateDimensions);
      window.removeEventListener("orientationchange", updateDimensions);
    };
  }, [updateDimensions]);

  // Viewport geometry auto-detection
  const { width, height } = dimensions;
  const aspectRatio = width / (height || 1);

  let detectedPosture: DevicePosture = "slab";

  // Check for CSS screen-spanning / dual-screen hints if available
  const isDualScreenQuery =
    typeof window !== "undefined" &&
    (window.matchMedia("(screen-spanning: single-fold-vertical)").matches ||
      window.matchMedia("(screen-spanning: single-fold-horizontal)").matches ||
      window.matchMedia("(spanning: single-fold-vertical)").matches);

  if (isDualScreenQuery) {
    detectedPosture = "dual-screen";
  } else if (width >= 820) {
    // Large tablet / dual-pane landscape
    detectedPosture = "fold-expanded";
  } else if (width >= 640) {
    // Foldable expanded canvas (Samsung Fold / Pixel Fold unfolded)
    // Check if aspect ratio is close to square or clamshell
    if (aspectRatio >= 0.85 && aspectRatio <= 1.25) {
      detectedPosture = "flip-tabletop";
    } else {
      detectedPosture = "fold-expanded";
    }
  } else {
    // Compact phone width (< 640px)
    // Check if half-folded clamshell (height is short or near 1:1 ratio)
    if (aspectRatio >= 0.85 && aspectRatio <= 1.2 && height < 700) {
      detectedPosture = "flip-tabletop";
    } else {
      detectedPosture = "slab";
    }
  }

  const effectivePosture = manualOverride || detectedPosture;

  return {
    posture: detectedPosture,
    effectivePosture,
    manualOverride,
    setManualOverride,
    width,
    height,
    isFoldable: detectedPosture !== "slab",
  };
}
