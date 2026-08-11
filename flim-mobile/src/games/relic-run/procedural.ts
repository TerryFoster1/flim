import { relicRunConfig } from "./config";

export type RelicRunSectionType = "gap" | "smallObstacle" | "beetle" | "mummy" | "swingGap" | "collectibles";

export interface RelicRunSection {
  type: RelicRunSectionType;
  x: number;
  width: number;
  anchorX?: number;
  anchorY?: number;
}

export function calculateDifficulty(distancePx: number) {
  return Math.min(relicRunConfig.generation.maxDifficulty, 1 + Math.floor(Math.max(0, distancePx) / 1500));
}

export function canPlaceSection(previous: RelicRunSection | null, next: RelicRunSection) {
  if (next.type === "swingGap") {
    const hasReachableAnchor = typeof next.anchorX === "number" && next.anchorX - next.x >= relicRunConfig.generation.minAnchorLeadPx;
    if (!hasReachableAnchor) {
      return false;
    }
  }

  if (!previous) {
    return true;
  }

  const previousEnd = previous.x + previous.width;
  if (next.x - previousEnd < relicRunConfig.generation.minHazardSpacingPx) {
    return false;
  }

  return true;
}

export function isSectionBeatable(section: RelicRunSection) {
  if (section.width > 360 && section.type !== "swingGap") {
    return false;
  }

  if (section.type === "swingGap") {
    return !!section.anchorX && !!section.anchorY && section.anchorY < 250 && section.anchorX > section.x;
  }

  return section.width <= 280;
}
