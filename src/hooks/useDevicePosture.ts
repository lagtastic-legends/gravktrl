"use client";

import { useState, useEffect } from "react";

export type DevicePosture =
  | "cover-compact"   // < 360px (Galaxy Z Fold 8 outer screen, Razr cover)
  | "phone-slab"      // 360px - 599px portrait standard smartphone
  | "flip-flex"       // Galaxy Z Flip 8 / Moto Razr in 90° tabletop clamshell flex
  | "fold-dual"       // 600px - 1023px unfolded foldable (Galaxy Z Fold 8, iPhone Duo)
  | "desktop-mission"; // >= 1024px tablet / desktop landscape

interface UseDevicePostureReturn {
  posture: DevicePosture;
  isFolded: boolean;
  isDualScreen: boolean;
  hingeAngle: number | null;
  hingeWidthPx: number;
  manualOverride: DevicePosture | null;
  setManualOverride: (posture: DevicePosture | null) => void;
  width: number;
  height: number;
}

export function useDevicePosture(): UseDevicePostureReturn {
  const [manualOverride, setManualOverride] = useState<DevicePosture | null>(null);
  const [detectedPosture, setDetectedPosture] = useState<DevicePosture>("phone-slab");
  const [isFolded, setIsFolded] = useState<boolean>(false);
  const [isDualScreen, setIsDualScreen] = useState<boolean>(false);
  const [hingeAngle, setHingeAngle] = useState<number | null>(null);
  const [hingeWidthPx, setHingeWidthPx] = useState<number>(24);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const evaluatePosture = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setDimensions({ width: w, height: h });

      // 1. Check W3C Device Posture API (Chromium / Foldables)
      const nav = navigator as unknown as {
        devicePosture?: {
          type: "continuous" | "folded";
          angle?: number;
          addEventListener: (event: string, cb: () => void) => void;
          removeEventListener: (event: string, cb: () => void) => void;
        };
      };

      const w3cPosture = nav.devicePosture?.type;
      const angle = nav.devicePosture?.angle ?? null;
      setHingeAngle(angle);

      // 2. Check Visual Viewport Segments API (Dual Screen / Hinge devices)
      const vv = window.visualViewport as unknown as {
        segments?: Array<{ x: number; y: number; width: number; height: number }>;
      };
      const segments = vv?.segments;
      const hasDualSegments = Array.isArray(segments) && segments.length === 2;
      setIsDualScreen(hasDualSegments);

      if (hasDualSegments && segments[0] && segments[1]) {
        // Calculate physical hinge gap
        const gap = Math.abs(segments[1].x - (segments[0].x + segments[0].width));
        setHingeWidthPx(gap > 0 ? gap : 24);
      } else {
        setHingeWidthPx(24);
      }

      // 3. Media query checks for foldables
      const isDualH = window.matchMedia("(horizontal-viewport-segments: 2)").matches;
      const isDualV = window.matchMedia("(vertical-viewport-segments: 2)").matches;

      // 4. Determine Posture Category
      if (w3cPosture === "folded" || isDualV || (angle !== null && angle >= 60 && angle <= 125 && h > w)) {
        setIsFolded(true);
        setDetectedPosture("flip-flex");
        return;
      }

      if (hasDualSegments || isDualH || (w >= 600 && w < 1024)) {
        setIsFolded(false);
        setDetectedPosture("fold-dual");
        return;
      }

      if (w >= 1024) {
        setIsFolded(false);
        setDetectedPosture("desktop-mission");
        return;
      }

      if (w < 360) {
        setIsFolded(false);
        setDetectedPosture("cover-compact");
        return;
      }

      // Default standard mobile phone slab
      setIsFolded(false);
      setDetectedPosture("phone-slab");
    };

    evaluatePosture();

    window.addEventListener("resize", evaluatePosture);
    window.addEventListener("orientationchange", evaluatePosture);

    const nav = navigator as unknown as {
      devicePosture?: {
        addEventListener: (event: string, cb: () => void) => void;
        removeEventListener: (event: string, cb: () => void) => void;
      };
    };

    if (nav.devicePosture?.addEventListener) {
      nav.devicePosture.addEventListener("change", evaluatePosture);
    }

    return () => {
      window.removeEventListener("resize", evaluatePosture);
      window.removeEventListener("orientationchange", evaluatePosture);
      if (nav.devicePosture?.removeEventListener) {
        nav.devicePosture.removeEventListener("change", evaluatePosture);
      }
    };
  }, []);

  const activePosture = manualOverride || detectedPosture;

  return {
    posture: activePosture,
    isFolded,
    isDualScreen,
    hingeAngle,
    hingeWidthPx,
    manualOverride,
    setManualOverride,
    width: dimensions.width,
    height: dimensions.height,
  };
}
