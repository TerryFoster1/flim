export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";

export type TriceratopsObstacleKind =
  | "jump_obstacle"
  | "high_barrier"
  | "long_gap"
  | "overhead_beam"
  | "smash_camera"
  | "smash_light"
  | "smash_crate"
  | "smash_wall"
  | "collectible"
  | "one_up"
  | "hazard_cable"
  | "hazard_light"
  | "finish";

export type TriceratopsRequiredAction =
  | "normalJump"
  | "highJump"
  | "longJump"
  | "smash"
  | "slide"
  | "collect"
  | "avoid"
  | "finish";

export type TriceratopsScriptEvent = {
  id: string;
  kind: TriceratopsObstacleKind;
  category: "normalJump" | "highJump" | "longJump" | "smash" | "slide" | "collect" | "avoid" | "finish";
  requiredAction: TriceratopsRequiredAction;
  distance: number;
  label: string;
  chainId?: string;
  chainStep?: number;
  chainBonus?: number;
  finale?: boolean;
  tutorial?: string;
  points?: number;
  telegraph?: string;
  lane?: "ground" | "air" | "overhead";
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
    baseSpeed: 104,
    gravity: 720,
    normalJumpVelocity: 372,
    highJumpVelocity: 456,
    longJumpVelocity: 398,
    longJumpMs: 860,
    longJumpSpeedMultiplier: 1.28,
    slideMs: 620,
    coyoteMs: 240,
    inputBufferMs: 420,
    groundColliderOffsetY: 4,
    groundColliderHeight: 32,
    playerBody: { width: 30, height: 30, offsetX: 23, offsetY: 20 },
    slideBody: { width: 34, height: 18, offsetX: 22, offsetY: 33 },
    spawnLeadDistance: 430,
    minimumReactionDistance: 430,
  },
  scene: {
    sceneId: "studio-backlot-1",
    name: "Studio Backlot",
    targetDistance: 7600,
    startingLives: 3,
    maxLives: 5,
    clearBonus: 1000,
    safeStartSeconds: 4.5,
    respawnInvulnerabilityMs: 1450,
    highScoreStorageKey: "flim:backlot:triceratops:studio-backlot-1:high-score",
    checkpoints: [0, 1850, 3600, 5400],
  },
  attack: {
    activeMs: 260,
    cooldownMs: 190,
    hitboxWidth: 74,
    hitboxHeight: 34,
    perfectWindow: { min: 18, max: 54 },
  },
  scoring: {
    normalJump: 90,
    highJump: 180,
    longJump: 240,
    slide: 180,
    smashSmall: 100,
    smashMedium: 250,
    smashMajor: 500,
    collectible: 300,
    oneUp: 750,
    lifeBonus: 300,
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
    bypassesHazards: false,
  },
  timeline: [
    {
      id: "tutorial-normal-jump",
      kind: "jump_obstacle",
      category: "normalJump",
      requiredAction: "normalJump",
      distance: 900,
      label: "Foam curb",
      tutorial: "Tap left: jump",
      telegraph: "low prop",
    },
    {
      id: "tutorial-smash",
      kind: "smash_camera",
      category: "smash",
      requiredAction: "smash",
      distance: 1320,
      label: "Studio camera",
      tutorial: "Tap right: horn smash",
      points: 100,
      telegraph: "breakable prop",
    },
    {
      id: "tutorial-high-jump",
      kind: "high_barrier",
      category: "highJump",
      requiredAction: "highJump",
      distance: 1730,
      label: "Tall apple box stack",
      tutorial: "Double tap left: high jump",
      points: 180,
      telegraph: "tall barrier",
    },
    {
      id: "film-frame-one",
      kind: "collectible",
      category: "collect",
      requiredAction: "collect",
      distance: 2140,
      label: "Film frame",
      points: 300,
      telegraph: "collect",
    },
    {
      id: "tutorial-slide",
      kind: "overhead_beam",
      category: "slide",
      requiredAction: "slide",
      distance: 2530,
      label: "Boom mic sweep",
      tutorial: "Double tap and hold right: slide",
      points: 180,
      telegraph: "low clearance",
      lane: "overhead",
    },
    {
      id: "tutorial-long-jump",
      kind: "long_gap",
      category: "longJump",
      requiredAction: "longJump",
      distance: 2960,
      label: "Missing backlot road",
      tutorial: "Double tap and hold left: long jump",
      points: 240,
      telegraph: "wide gap",
    },
    {
      id: "crate-one",
      kind: "smash_crate",
      category: "smash",
      requiredAction: "smash",
      distance: 3360,
      label: "Prop crate",
      chainId: "craft-service-chaos",
      chainStep: 1,
      points: 100,
    },
    {
      id: "craft-service-camera",
      kind: "smash_camera",
      category: "smash",
      requiredAction: "smash",
      distance: 3490,
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
      requiredAction: "smash",
      distance: 3640,
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
      category: "normalJump",
      requiredAction: "normalJump",
      distance: 4010,
      label: "Sparking cable",
      tutorial: "Jump over red hazards",
    },
    {
      id: "slide-camera-boom",
      kind: "overhead_beam",
      category: "slide",
      requiredAction: "slide",
      distance: 4380,
      label: "Swinging camera boom",
      points: 180,
      telegraph: "duck",
      lane: "overhead",
    },
    {
      id: "slide-second-light",
      kind: "overhead_beam",
      category: "slide",
      requiredAction: "slide",
      distance: 4510,
      label: "Second low boom",
      tutorial: "Stay low through both",
      points: 180,
      telegraph: "two duck hazards",
      lane: "overhead",
    },
    {
      id: "one-up-high",
      kind: "one_up",
      category: "collect",
      requiredAction: "highJump",
      distance: 4770,
      label: "1-UP reel",
      tutorial: "Rare 1-UPs reward precise jumps",
      points: 750,
      telegraph: "bonus high",
      lane: "air",
    },
    {
      id: "breakaway-flat",
      kind: "smash_wall",
      category: "smash",
      requiredAction: "smash",
      distance: 5160,
      label: "Breakaway city flat",
      chainId: "city-set-collapse",
      chainStep: 1,
      points: 500,
    },
    {
      id: "city-set-crate",
      kind: "smash_crate",
      category: "smash",
      requiredAction: "smash",
      distance: 5310,
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
      requiredAction: "smash",
      distance: 5470,
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
      requiredAction: "collect",
      distance: 5840,
      label: "Golden Film Frame",
      tutorial: "Risk route: high jump for gold",
      points: 900,
      telegraph: "rare pickup",
      lane: "air",
    },
    {
      id: "jump-slide-combo",
      kind: "jump_obstacle",
      category: "normalJump",
      requiredAction: "normalJump",
      distance: 6170,
      label: "Foam curb",
      tutorial: "Read the set: jump, then duck",
    },
    {
      id: "combo-smash-wall",
      kind: "smash_wall",
      category: "smash",
      requiredAction: "smash",
      distance: 6260,
      label: "Breakaway side wall",
      chainId: "verb-combo",
      chainStep: 1,
      tutorial: "Jump, smash, then go long",
      points: 500,
    },
    {
      id: "combo-long-gap",
      kind: "long_gap",
      category: "longJump",
      requiredAction: "longJump",
      distance: 6460,
      label: "Collapsed set bridge",
      chainId: "verb-combo",
      chainStep: 2,
      chainBonus: 150,
      points: 260,
      telegraph: "wide gap",
    },
    {
      id: "combo-overhead",
      kind: "overhead_beam",
      category: "slide",
      requiredAction: "slide",
      distance: 6690,
      label: "Low lighting truss",
      points: 180,
      lane: "overhead",
    },
    {
      id: "final-hazard",
      kind: "hazard_light",
      category: "highJump",
      requiredAction: "highJump",
      distance: 6920,
      label: "Falling studio light",
      tutorial: "Tall danger needs a high jump",
      points: 180,
    },
    {
      id: "finale-wall",
      kind: "smash_wall",
      category: "smash",
      requiredAction: "smash",
      distance: 7220,
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
      requiredAction: "smash",
      distance: 7380,
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
      requiredAction: "finish",
      distance: 7560,
      label: "Wrap marker",
    },
  ] satisfies TriceratopsScriptEvent[],
} as const;

export type TriceratopsResult = {
  sceneId: string;
  completed: boolean;
  score: number;
  highScore: number;
  newHighScore: boolean;
  playTimeMs: number;
  distance: number;
  livesRemaining: number;
  objectsSmashed: number;
  hitsTaken: number;
  collectibles: number;
  oneUpsCollected: number;
  chainsTriggered: number;
  bestChain: number;
  rampageActivations: number;
  finaleDestroyed: boolean;
};

export type TriceratopsInput = "normalJump" | "highJump" | "longJump" | "hornSmash" | "slide" | "rampage";
