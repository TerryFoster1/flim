export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";

export const triceratopsGameConfig = {
  gameId: TRICERATOPS_GAME_ID,
  title: "TRICERATOPS!",
  subtitle: "Rampage the Backlot",
  art: {
    internalResolution: "480x270",
    spriteScale: 3,
    tileSize: 16,
    characterFrame: { width: 64, height: 48 },
    palette: {
      ink: "#07070a",
      gold: "#f5c16f",
      cream: "#fff3dc",
      dino: "#47c66c",
      dinoDark: "#1f6f3c",
      warning: "#ff5a62",
      sky: "#141728",
      asphalt: "#1b171b",
    },
  },
  world: {
    width: 480,
    height: 270,
    groundY: 212,
    playerX: 72,
    baseSpeed: 146,
    maxSpeed: 292,
    gravity: 720,
    jumpVelocity: 342,
  },
  attack: {
    activeMs: 380,
    cooldownMs: 460,
  },
  spawn: {
    smashMs: 1450,
    hazardMs: 1900,
    propMs: 900,
    reelMs: 1320,
    powerMs: 9200,
  },
  scoring: {
    smashTarget: 220,
    carSmash: 220,
    perfectCharge: 460,
    propDestroyed: 55,
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
  objectsSmashed: number;
  carsSmashed: number;
  reelsCollected: number;
  propsDestroyed: number;
  hazardsCleared: number;
  maxCombo: number;
};

export type TriceratopsInput = "left" | "right" | "jump" | "charge";
