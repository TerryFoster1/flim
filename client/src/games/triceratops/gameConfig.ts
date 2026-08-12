export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";

export type TriceratopsObstacleKind =
  | "jump_obstacle"
  | "smash_camera"
  | "smash_crate"
  | "smash_wall"
  | "collectible"
  | "hazard_cable"
  | "finish";

export type TriceratopsScriptEvent = {
  id: string;
  kind: TriceratopsObstacleKind;
  distance: number;
  label: string;
  tutorial?: string;
  points?: number;
};

export const triceratopsGameConfig = {
  gameId: TRICERATOPS_GAME_ID,
  title: "TRICERATOPS!",
  subtitle: "Smash the Studio Backlot",
  art: {
    internalResolution: "480x270",
    spriteScale: 3,
    tileSize: 16,
    characterFrame: { width: 72, height: 56 },
    palette: {
      ink: "#07070a",
      gold: "#f5c16f",
      cream: "#fff3dc",
      dino: "#4ed074",
      dinoDark: "#1f6f3c",
      warning: "#ff5a62",
      sky: "#141728",
      asphalt: "#1b171b",
    },
  },
  world: {
    width: 480,
    height: 270,
    groundY: 214,
    playerX: 74,
    baseSpeed: 86,
    gravity: 760,
    jumpVelocity: 334,
    coyoteMs: 150,
    inputBufferMs: 180,
    playerBody: { width: 34, height: 34, offsetX: 20, offsetY: 16 },
  },
  scene: {
    sceneId: "studio-backlot-1",
    name: "Studio Backlot",
    targetDistance: 4100,
    startingHp: 3,
    clearBonus: 1000,
  },
  attack: {
    activeMs: 330,
    cooldownMs: 380,
    hitboxWidth: 48,
    hitboxHeight: 34,
  },
  scoring: {
    smashTarget: 100,
    collectible: 250,
    sceneClear: 1000,
  },
  timeline: [
    {
      id: "tutorial-jump",
      kind: "jump_obstacle",
      distance: 560,
      label: "Foam curb",
      tutorial: "Tap the left side to JUMP",
    },
    {
      id: "tutorial-smash",
      kind: "smash_camera",
      distance: 1060,
      label: "Studio camera",
      tutorial: "Tap the right side to SMASH",
      points: 100,
    },
    {
      id: "jump-two",
      kind: "jump_obstacle",
      distance: 1520,
      label: "Cable ramp",
    },
    {
      id: "crate-one",
      kind: "smash_crate",
      distance: 1820,
      label: "Prop crate",
      points: 100,
    },
    {
      id: "golden-reel",
      kind: "collectible",
      distance: 2240,
      label: "Golden reel",
      points: 250,
    },
    {
      id: "first-hazard",
      kind: "hazard_cable",
      distance: 2820,
      label: "Sparking cable",
      tutorial: "Jump over live set hazards",
    },
    {
      id: "finale-wall",
      kind: "smash_wall",
      distance: 3500,
      label: "Breakaway wall",
      tutorial: "Smash the finale set",
      points: 100,
    },
    {
      id: "wrap-marker",
      kind: "finish",
      distance: 4040,
      label: "Wrap marker",
    },
  ] satisfies TriceratopsScriptEvent[],
} as const;

export type TriceratopsResult = {
  sceneId: string;
  completed: boolean;
  score: number;
  playTimeMs: number;
  distance: number;
  hpRemaining: number;
  objectsSmashed: number;
  hitsTaken: number;
  collectibles: number;
};

export type TriceratopsInput = "jump" | "smash";
