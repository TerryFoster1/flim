import { useEffect, useState } from "react";

export type BacklotOrientationSnapshot = {
  width: number;
  height: number;
  orientationType?: string;
  orientationAngle?: number;
};

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

    function update() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setSnapshot(getBacklotOrientationSnapshot());
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.screen?.orientation?.addEventListener?.("change", update);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.screen?.orientation?.removeEventListener?.("change", update);
    };
  }, []);

  return {
    isLandscape: isBacklotLandscape(snapshot),
    isPortrait: !isBacklotLandscape(snapshot),
    snapshot,
  };
}
