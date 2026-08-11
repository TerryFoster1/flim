export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";

export const triceratopsGameConfig = {
  gameId: TRICERATOPS_GAME_ID,
  title: "TRICERATOPS!",
  subtitle: "Terror on Backlot Boulevard",
  world: {
    width: 960,
    height: 540,
    groundY: 424,
    playerX: 158,
    baseSpeed: 260,
    maxSpeed: 525,
  },
  attack: {
    activeMs: 360,
    cooldownMs: 430,
  },
  spawn: {
    carMs: 1450,
    hazardMs: 1900,
    sceneryMs: 900,
    reelMs: 1320,
    powerMs: 9200,
  },
  scoring: {
    carSmash: 220,
    perfectCharge: 460,
    sceneryDestroyed: 55,
    reelCollected: 110,
    hazardCleared: 85,
    rampageBonus: 75,
    distancePointEveryPx: 48,
    comboStep: 0.22,
    maxMultiplier: 5,
  },
  powerUps: {
    rampageDurationMs: 5200,
    directorsCutDurationMs: 4200,
    directorsCutTimeScale: 0.58,
  },
} as const;

export type TriceratopsResult = {
  score: number;
  playTimeMs: number;
  distance: number;
  carsSmashed: number;
  reelsCollected: number;
  propsDestroyed: number;
  maxCombo: number;
};

