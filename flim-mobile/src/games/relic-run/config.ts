export const RELIC_RUN_GAME_ID = "relic-run-lost-chapter";

export const relicRunConfig = {
  gameId: RELIC_RUN_GAME_ID,
  title: "Relic Run",
  subtitle: "The Lost Chapter",
  controls: {
    tapMaxMs: 170,
    holdMinMs: 220,
    swipeMinDy: 42,
    swipeMaxMs: 260,
    inputLockMs: 110
  },
  player: {
    gravity: 1700,
    jumpVelocity: -690,
    runX: 158,
    groundY: 410,
    health: 1
  },
  swing: {
    attachRangePx: 155,
    minReleaseMs: 260,
    perfectReleaseMinMs: 520,
    perfectReleaseMaxMs: 780,
    lateReleaseMs: 980
  },
  whip: {
    rangePx: 180,
    cooldownMs: 280
  },
  scoring: {
    distancePointEveryPx: 55,
    jump: 30,
    perfectJump: 90,
    swing: 80,
    perfectSwing: 180,
    whipHit: 75,
    beetle: 110,
    mummy: 130,
    relic: 150,
    filmReel: 90
  },
  powerUps: {
    directorCutMs: 6000,
    lostMapMs: 7000,
    doubleFeatureMs: 8000,
    magnetMs: 6500,
    guardianCharges: 1
  },
  generation: {
    minHazardSpacingPx: 295,
    minAnchorLeadPx: 250,
    maxDifficulty: 6
  }
} as const;

export type RelicRunConfig = typeof relicRunConfig;
