export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";

export const triceratopsGameConfig = {
  gameId: TRICERATOPS_GAME_ID,
  title: "TRICERATOPS!",
  subtitle: "Terror on Backlot Boulevard",
  attack: {
    activeMs: 360,
    earliestHitMs: 70,
    latestHitMs: 285,
    perfectStartMs: 125,
    perfectEndMs: 190,
    recoveryMs: 420
  },
  spawn: {
    minObstacleGapPx: 360,
    baseCarIntervalMs: 1450,
    minCarIntervalMs: 760,
    sceneryIntervalMs: 900,
    reelIntervalMs: 1600,
    pedestrianIntervalMs: 1250
  },
  scoring: {
    standardVehicleFlip: 200,
    perfectVehicleFlip: 450,
    pedestrianStomp: 25,
    sceneryDestroyed: 50,
    reelCollected: 100,
    vehicleCollision: 150,
    distancePointEveryPx: 45,
    rampageBonus: 75,
    comboStep: 0.25,
    maxMultiplier: 5
  },
  powerUps: {
    rampageDurationMs: 5200,
    directorsCutDurationMs: 4200,
    directorsCutTimeScale: 0.55
  },
  player: {
    health: 1
  }
} as const;

export type TriceratopsGameConfig = typeof triceratopsGameConfig;
