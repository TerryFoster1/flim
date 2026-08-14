import { useEffect, useState } from "react";

export type BacklotOrientationSnapshot = {
  width: number;
  height: number;
  orientationType?: string;
  orientationAngle?: number;
};

export const BACKLOT_ORIENTATION_SETTLE_DELAYS_MS = [120, 320, 640] as const;

export function getBacklotOrientationSnapshot(win: Window = window): BacklotOrientationSnapshot {
  const visualViewport = win.visualViewport;
  const width = Math.round(visualViewport?.width || win.innerWidth || 0);
  const height = Math.round(visualViewport?.height || win.innerHeight || 0);
  const screenOrientation = win.screen?.orientation;

  return {
    width,
    height,
    orientationType: screenOrientation?.type,
    orientationAngle: screenOrientation?.angle,
  };
}

export function isBacklotLandscape(snapshot: BacklotOrientationSnapshot) {
  if (snapshot.width > 0 && snapshot.height > 0 && snapshot.width !== snapshot.height) {
    return snapshot.width > snapshot.height;
  }

  if (snapshot.orientationType?.includes("landscape")) return true;
  if (snapshot.orientationType?.includes("portrait")) return false;

  return true;
}

export function useBacklotOrientation() {
  const [snapshot, setSnapshot] = useState<BacklotOrientationSnapshot>(() => {
    if (typeof window === "undefined") {
      return { width: 0, height: 0 };
    }
    return getBacklotOrientationSnapshot();
  });

  useEffect(() => {
    let frame = 0;
    const timers: number[] = [];

    function update() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setSnapshot(getBacklotOrientationSnapshot());
      });
    }

    function updateWithSettlePasses() {
      update();
      BACKLOT_ORIENTATION_SETTLE_DELAYS_MS.forEach((delay) => {
        timers.push(window.setTimeout(update, delay));
      });
    }

    update();
    window.addEventListener("resize", updateWithSettlePasses);
    window.addEventListener("orientationchange", updateWithSettlePasses);
    window.visualViewport?.addEventListener("resize", updateWithSettlePasses);
    window.screen?.orientation?.addEventListener?.("change", updateWithSettlePasses);

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", updateWithSettlePasses);
      window.removeEventListener("orientationchange", updateWithSettlePasses);
      window.visualViewport?.removeEventListener("resize", updateWithSettlePasses);
      window.screen?.orientation?.removeEventListener?.("change", updateWithSettlePasses);
    };
  }, []);

  return {
    isLandscape: isBacklotLandscape(snapshot),
    isPortrait: !isBacklotLandscape(snapshot),
    snapshot,
  };
}
