export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";

export type TriceratopsObstacleKind =
  | "jump_obstacle"
  | "smash_camera"
  | "smash_light"
  | "smash_crate"
  | "smash_wall"
  | "collectible"
  | "hazard_cable"
  | "hazard_light"
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
    characterFrame: { width: 80, height: 64 },
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
    jumpVelocity: 374,
    coyoteMs: 230,
    inputBufferMs: 420,
    playerBody: { width: 30, height: 30, offsetX: 23, offsetY: 20 },
    spawnLeadDistance: 420,
    minimumReactionDistance: 420,
  },
  scene: {
    sceneId: "studio-backlot-1",
    name: "Studio Backlot",
    targetDistance: 5050,
    startingHp: 5,
    clearBonus: 1000,
    safeStartSeconds: 4.5,
  },
  attack: {
    activeMs: 900,
    cooldownMs: 160,
    hitboxWidth: 150,
    hitboxHeight: 52,
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
      distance: 820,
      label: "Foam curb",
      tutorial: "Tap the left side to JUMP",
    },
    {
      id: "tutorial-smash",
      kind: "smash_camera",
      distance: 1320,
      label: "Studio camera",
      tutorial: "Tap the right side to SMASH",
      points: 100,
    },
    {
      id: "film-frame-one",
      kind: "collectible",
      distance: 1680,
      label: "Film frame",
      points: 250,
    },
    {
      id: "jump-two",
      kind: "jump_obstacle",
      distance: 2100,
      label: "Cable ramp",
    },
    {
      id: "crate-one",
      kind: "smash_crate",
      distance: 2480,
      label: "Prop crate",
      points: 100,
    },
    {
      id: "first-hazard",
      kind: "hazard_cable",
      distance: 2940,
      label: "Sparking cable",
      tutorial: "Jump over live set hazards",
    },
    {
      id: "light-rig-one",
      kind: "smash_light",
      distance: 3180,
      label: "Studio light",
      tutorial: "Smash loose set lights",
      points: 100,
    },
    {
      id: "breakaway-flat",
      kind: "smash_wall",
      distance: 3520,
      label: "Breakaway flat",
      tutorial: "Smash the breakaway set",
      points: 100,
    },
    {
      id: "film-frame-two",
      kind: "collectible",
      distance: 3800,
      label: "Film frame",
      points: 250,
    },
    {
      id: "jump-three",
      kind: "jump_obstacle",
      distance: 4080,
      label: "Foam curb",
    },
    {
      id: "camera-two",
      kind: "smash_camera",
      distance: 4380,
      label: "Studio camera",
      points: 100,
    },
    {
      id: "final-hazard",
      kind: "hazard_light",
      distance: 4660,
      label: "Falling studio light",
      tutorial: "Duck past falling studio lights",
    },
    {
      id: "finale-wall",
      kind: "smash_wall",
      distance: 4920,
      label: "Breakaway wall",
      tutorial: "Smash the finale set",
      points: 100,
    },
    {
      id: "wrap-marker",
      kind: "finish",
      distance: 5020,
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
