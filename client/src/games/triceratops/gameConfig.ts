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
  category: "jump" | "smash" | "collect" | "finish";
  distance: number;
  label: string;
  chainId?: string;
  chainStep?: number;
  chainBonus?: number;
  finale?: boolean;
  tutorial?: string;
  points?: number;
};

export type TriceratopsGrade = "D" | "C" | "B" | "A" | "S";

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
    baseSpeed: 104,
    gravity: 720,
    jumpVelocity: 390,
    coyoteMs: 240,
    inputBufferMs: 440,
    playerBody: { width: 30, height: 30, offsetX: 23, offsetY: 20 },
    spawnLeadDistance: 420,
    minimumReactionDistance: 420,
  },
  scene: {
    sceneId: "studio-backlot-1",
    name: "Studio Backlot",
    targetDistance: 6400,
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
    smashSmall: 100,
    smashMedium: 250,
    smashMajor: 500,
    collectible: 300,
    chainBase: 125,
    chainStepMultiplier: 0.24,
    sceneClear: 1000,
    noHitBonus: 600,
    finaleBonus: 1200,
  },
  rampage: {
    max: 100,
    perSmash: 22,
    perCollectible: 14,
    chainBonus: 8,
    durationMs: 9000,
    speedMultiplier: 1.18,
    scoreMultiplier: 1.5,
  },
  grades: {
    s: 7200,
    a: 5600,
    b: 4100,
    c: 2600,
  },
  timeline: [
    {
      id: "tutorial-jump",
      kind: "jump_obstacle",
      category: "jump",
      distance: 900,
      label: "Foam curb",
      tutorial: "Tap the left side to JUMP",
    },
    {
      id: "tutorial-smash",
      kind: "smash_camera",
      category: "smash",
      distance: 1320,
      label: "Studio camera",
      tutorial: "Tap the right side to SMASH",
      points: 100,
    },
    {
      id: "film-frame-one",
      kind: "collectible",
      category: "collect",
      distance: 1680,
      label: "Film frame",
      points: 300,
    },
    {
      id: "jump-two",
      kind: "jump_obstacle",
      category: "jump",
      distance: 2100,
      label: "Cable ramp",
    },
    {
      id: "crate-one",
      kind: "smash_crate",
      category: "smash",
      distance: 2480,
      label: "Prop crate",
      chainId: "craft-service-chaos",
      chainStep: 1,
      points: 100,
    },
    {
      id: "craft-service-camera",
      kind: "smash_camera",
      category: "smash",
      distance: 2600,
      label: "Craft-service camera",
      chainId: "craft-service-chaos",
      chainStep: 2,
      chainBonus: 125,
      points: 250,
    },
    {
      id: "craft-service-light",
      kind: "smash_light",
      category: "smash",
      distance: 2740,
      label: "Hot studio light",
      chainId: "craft-service-chaos",
      chainStep: 3,
      chainBonus: 175,
      tutorial: "Chain props for bigger scores",
      points: 250,
    },
    {
      id: "first-hazard",
      kind: "hazard_cable",
      category: "jump",
      distance: 3060,
      label: "Sparking cable",
      tutorial: "Jump over red hazards",
    },
    {
      id: "breakaway-flat",
      kind: "smash_wall",
      category: "smash",
      distance: 3360,
      label: "Breakaway city flat",
      chainId: "city-set-collapse",
      chainStep: 1,
      points: 500,
    },
    {
      id: "city-set-crate",
      kind: "smash_crate",
      category: "smash",
      distance: 3500,
      label: "Prop crate stack",
      chainId: "city-set-collapse",
      chainStep: 2,
      chainBonus: 150,
      points: 250,
    },
    {
      id: "city-set-camera",
      kind: "smash_camera",
      category: "smash",
      distance: 3650,
      label: "Rolling camera",
      chainId: "city-set-collapse",
      chainStep: 3,
      chainBonus: 200,
      points: 250,
    },
    {
      id: "film-frame-two",
      kind: "collectible",
      category: "collect",
      distance: 3890,
      label: "Film frame",
      points: 300,
    },
    {
      id: "jump-three",
      kind: "jump_obstacle",
      category: "jump",
      distance: 4200,
      label: "Foam curb",
    },
    {
      id: "final-hazard",
      kind: "hazard_light",
      category: "jump",
      distance: 4580,
      label: "Falling studio light",
      tutorial: "Watch the overhead rig",
    },
    {
      id: "film-frame-three",
      kind: "collectible",
      category: "collect",
      distance: 4860,
      label: "Film frame",
      points: 300,
    },
    {
      id: "rampage-wall",
      kind: "smash_wall",
      category: "smash",
      distance: 5160,
      label: "Western street flat",
      chainId: "western-lot-rampage",
      chainStep: 1,
      tutorial: "Rampage meter fills from destruction",
      points: 500,
    },
    {
      id: "rampage-crate",
      kind: "smash_crate",
      category: "smash",
      distance: 5310,
      label: "Stunt prop crate",
      chainId: "western-lot-rampage",
      chainStep: 2,
      chainBonus: 175,
      points: 250,
    },
    {
      id: "rampage-camera",
      kind: "smash_camera",
      category: "smash",
      distance: 5480,
      label: "Panicked camera",
      chainId: "western-lot-rampage",
      chainStep: 3,
      chainBonus: 200,
      points: 250,
    },
    {
      id: "finale-wall",
      kind: "smash_wall",
      category: "smash",
      distance: 5950,
      label: "Finale breakaway wall",
      chainId: "finale-collapse",
      chainStep: 1,
      finale: true,
      tutorial: "Smash the finale set",
      points: 500,
    },
    {
      id: "finale-light",
      kind: "smash_light",
      category: "smash",
      distance: 6100,
      label: "Finale light rig",
      chainId: "finale-collapse",
      chainStep: 2,
      finale: true,
      chainBonus: 250,
      points: 500,
    },
    {
      id: "wrap-marker",
      kind: "finish",
      category: "finish",
      distance: 6350,
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
  chainsTriggered: number;
  bestChain: number;
  rampageActivations: number;
  finaleDestroyed: boolean;
  grade: TriceratopsGrade;
};

export type TriceratopsInput = "jump" | "smash";
