import { triceratopsGameConfig } from "./config";

export type AttackTimingOutcome = "early" | "standard" | "perfect" | "late" | "miss";

interface ResolveAttackTimingInput {
  attackStartedAtMs: number | null;
  impactAtMs: number;
  nowMs?: number;
}

export function resolveAttackTiming({
  attackStartedAtMs,
  impactAtMs,
  nowMs = impactAtMs
}: ResolveAttackTimingInput): AttackTimingOutcome {
  if (attackStartedAtMs === null) {
    return "miss";
  }

  const attackAge = nowMs - attackStartedAtMs;
  if (attackAge > triceratopsGameConfig.attack.recoveryMs) {
    return "early";
  }

  const msBeforeImpact = impactAtMs - attackStartedAtMs;
  if (msBeforeImpact < triceratopsGameConfig.attack.earliestHitMs) {
    return "late";
  }

  if (msBeforeImpact > triceratopsGameConfig.attack.latestHitMs) {
    return "early";
  }

  if (
    msBeforeImpact >= triceratopsGameConfig.attack.perfectStartMs &&
    msBeforeImpact <= triceratopsGameConfig.attack.perfectEndMs
  ) {
    return "perfect";
  }

  return "standard";
}

export function canSpawnObstacle(lastObstacleX: number, nextObstacleX: number, minGap = triceratopsGameConfig.spawn.minObstacleGapPx) {
  return nextObstacleX - lastObstacleX >= minGap;
}

export function nextDifficultySpeed(baseSpeed: number, distance: number) {
  return Math.min(baseSpeed + Math.floor(distance / 1800) * 18, baseSpeed + 220);
}

export function shouldEndRun(health: number, collision: boolean) {
  return collision && health <= 1;
}
