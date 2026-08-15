export const TRICERATOPS_GAME_ID = "triceratops-backlot-runner";
export const TRICERATOPS_LEVEL_CONFIG_VERSION = "2026-08-14-level-integration-v2";
export const TRICERATOPS_GROUND_Y = 214;

export type TriceratopsObstacleKind =
  | "jump_obstacle"
  | "high_barrier"
  | "long_gap"
  | "pit"
  | "overhead_beam"
  | "striped_barrier"
  | "tour_tram"
  | "dumpster"
  | "smash_camera"
  | "smash_light"
  | "smash_crate"
  | "smash_wall"
  | "collectible"
  | "film_reel"
  | "one_up"
  | "hazard_cable"
  | "hazard_light"
  | "boss_trigger"
  | "boss_fireball"
  | "boss_tail_sweep"
  | "boss_overhead"
  | "boss_shockwave"
  | "boss_weak_point"
  | "finish";

export type TriceratopsRequiredAction =
  | "normalJump"
  | "highJump"
  | "longJump"
  | "smash"
  | "jumpOrSmash"
  | "stomp"
  | "bossRearRam"
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
  platform?: boolean;
  moving?: "slow" | "fast";
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
    groundY: TRICERATOPS_GROUND_Y,
    playerX: 74,
    baseSpeed: 104,
    gravity: 720,
    normalJumpVelocity: 372,
    highJumpVelocity: 438,
    longJumpVelocity: 414,
    longJumpMs: 980,
    longJumpSpeedMultiplier: 1.46,
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
    levelConfigVersion: TRICERATOPS_LEVEL_CONFIG_VERSION,
    name: "Studio Backlot",
    targetDistance: 9300,
    startingLives: 3,
    maxLives: 5,
    clearBonus: 1000,
    safeStartSeconds: 4.5,
    respawnInvulnerabilityMs: 1450,
    highScoreStorageKey: "flim:backlot:triceratops:studio-backlot-1:high-score",
    checkpoints: [0, 1850, 3650, 5550, 7350, 8420],
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
  boss: {
    id: "boss-mega-rex-prop",
    name: "Mega Rex Prop",
    arenaDistance: 8460,
    health: 4,
    weakPointWindowMs: 1650,
    attackIntervalMs: 1320,
    clearBonus: 2200,
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
      tutorial: "Double tap right: slide",
      points: 180,
      telegraph: "low clearance",
      lane: "overhead",
    },
    {
      id: "first-striped-barrier",
      kind: "striped_barrier",
      category: "smash",
      requiredAction: "jumpOrSmash",
      distance: 2810,
      label: "Striped studio barrier",
      tutorial: "Jump it or smash through it",
      points: 180,
      telegraph: "jump or smash",
    },
    {
      id: "tutorial-long-jump",
      kind: "pit",
      category: "longJump",
      requiredAction: "longJump",
      distance: 3190,
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
      distance: 3600,
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
      distance: 3730,
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
      distance: 3880,
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
      distance: 4260,
      label: "Sparking cable",
      tutorial: "Jump over red hazards",
    },
    {
      id: "dumpster-step-one",
      kind: "dumpster",
      category: "normalJump",
      requiredAction: "normalJump",
      distance: 4620,
      label: "Craft-service dumpster",
      tutorial: "Jump onto set pieces",
      points: 120,
      platform: true,
    },
    {
      id: "dumpster-film-reel",
      kind: "film_reel",
      category: "collect",
      requiredAction: "collect",
      distance: 4700,
      label: "Film reel",
      points: 350,
      lane: "air",
      telegraph: "collect",
    },
    {
      id: "slide-camera-boom",
      kind: "overhead_beam",
      category: "slide",
      requiredAction: "slide",
      distance: 4940,
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
      distance: 5070,
      label: "Second low boom",
      tutorial: "Stay low through both",
      points: 180,
      telegraph: "two duck hazards",
      lane: "overhead",
    },
    {
      id: "tour-tram-platform",
      kind: "tour_tram",
      category: "normalJump",
      requiredAction: "normalJump",
      distance: 5320,
      label: "Moving tour tram",
      tutorial: "Land on the moving tram",
      points: 180,
      platform: true,
      moving: "slow",
    },
    {
      id: "tram-film-reel",
      kind: "film_reel",
      category: "collect",
      requiredAction: "collect",
      distance: 5440,
      label: "Film reel",
      points: 350,
      lane: "air",
    },
    {
      id: "one-up-high",
      kind: "one_up",
      category: "collect",
      requiredAction: "highJump",
      distance: 5600,
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
      distance: 5960,
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
      distance: 6110,
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
      distance: 6270,
      label: "Rolling camera",
      chainId: "city-set-collapse",
      chainStep: 3,
      chainBonus: 200,
      points: 250,
    },
    {
      id: "film-frame-two",
      kind: "film_reel",
      category: "collect",
      requiredAction: "collect",
      distance: 6650,
      label: "Golden Film Frame",
      tutorial: "Risk route: high jump for gold",
      points: 900,
      telegraph: "rare pickup",
      lane: "air",
    },
    {
      id: "rampage-striped-wall",
      kind: "striped_barrier",
      category: "smash",
      requiredAction: "jumpOrSmash",
      distance: 6910,
      label: "Security barrier",
      chainId: "rampage-run",
      chainStep: 1,
      tutorial: "Build Rampage, then double tap right",
      points: 250,
    },
    {
      id: "rampage-breakaway-flat",
      kind: "smash_wall",
      category: "smash",
      requiredAction: "smash",
      distance: 7050,
      label: "Breakaway wall",
      chainId: "rampage-run",
      chainStep: 2,
      chainBonus: 175,
      points: 500,
    },
    {
      id: "rampage-prop-car",
      kind: "tour_tram",
      category: "smash",
      requiredAction: "jumpOrSmash",
      distance: 7210,
      label: "Rolling studio tram",
      chainId: "rampage-run",
      chainStep: 3,
      chainBonus: 200,
      points: 500,
      moving: "fast",
    },
    {
      id: "jump-slide-combo",
      kind: "jump_obstacle",
      category: "normalJump",
      requiredAction: "normalJump",
      distance: 7480,
      label: "Foam curb",
      tutorial: "Read the set: jump, then duck",
    },
    {
      id: "combo-smash-wall",
      kind: "smash_wall",
      category: "smash",
      requiredAction: "smash",
      distance: 7580,
      label: "Breakaway side wall",
      chainId: "verb-combo",
      chainStep: 1,
      tutorial: "Jump, smash, then go long",
      points: 500,
    },
    {
      id: "combo-long-gap",
      kind: "pit",
      category: "longJump",
      requiredAction: "longJump",
      distance: 7790,
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
      distance: 8030,
      label: "Low lighting truss",
      points: 180,
      lane: "overhead",
    },
    {
      id: "final-hazard",
      kind: "hazard_light",
      category: "highJump",
      requiredAction: "highJump",
      distance: 8280,
      label: "Falling studio light",
      tutorial: "Tall danger needs a high jump",
      points: 180,
    },
    {
      id: "boss-trigger",
      kind: "boss_trigger",
      category: "avoid",
      requiredAction: "avoid",
      distance: 8460,
      label: "Boss arena gate",
      tutorial: "Boss fight! Dodge attacks, smash the rear mark",
      telegraph: "boss",
    },
    {
      id: "boss-wrap-marker",
      kind: "finish",
      category: "finish",
      requiredAction: "finish",
      distance: 9200,
      label: "Wrap marker",
    },
  ] satisfies TriceratopsScriptEvent[],
} as const;

export const triceratopsShowcaseTimeline = [
  {
    id: "showcase-striped-barrier",
    kind: "striped_barrier",
    category: "smash",
    requiredAction: "jumpOrSmash",
    distance: 550,
    label: "Striped studio barrier",
    tutorial: "SHOWCASE 1/9: striped barrier",
    points: 180,
  },
  {
    id: "showcase-dumpster",
    kind: "dumpster",
    category: "normalJump",
    requiredAction: "normalJump",
    distance: 720,
    label: "Craft-service dumpster",
    tutorial: "SHOWCASE 2/9: dumpster platform",
    points: 120,
    platform: true,
  },
  {
    id: "showcase-film-reel",
    kind: "film_reel",
    category: "collect",
    requiredAction: "collect",
    distance: 890,
    label: "Film Reel",
    tutorial: "SHOWCASE 3/9: Film Reel",
    points: 350,
    lane: "air",
    telegraph: "collect",
  },
  {
    id: "showcase-one-up",
    kind: "one_up",
    category: "collect",
    requiredAction: "collect",
    distance: 1060,
    label: "1-UP",
    tutorial: "SHOWCASE 4/9: 1-UP",
    points: 750,
    telegraph: "rare pickup",
    lane: "air",
  },
  {
    id: "showcase-tour-tram",
    kind: "tour_tram",
    category: "normalJump",
    requiredAction: "normalJump",
    distance: 1240,
    label: "Moving tour tram",
    tutorial: "SHOWCASE 5/9: tour tram platform",
    points: 180,
    platform: true,
    moving: "slow",
  },
  {
    id: "showcase-pit",
    kind: "pit",
    category: "longJump",
    requiredAction: "longJump",
    distance: 1440,
    label: "Pit",
    tutorial: "SHOWCASE 6/9: pit",
    points: 240,
    telegraph: "wide gap",
  },
  {
    id: "showcase-overhead-slide-hazard",
    kind: "overhead_beam",
    category: "slide",
    requiredAction: "slide",
    distance: 1640,
    label: "Overhead slide hazard",
    tutorial: "SHOWCASE 7/9: overhead slide hazard",
    points: 180,
    lane: "overhead",
  },
  {
    id: "showcase-breakable-wall",
    kind: "smash_wall",
    category: "smash",
    requiredAction: "smash",
    distance: 1840,
    label: "Breakable wall",
    tutorial: "SHOWCASE 8/9: breakable wall",
    points: 500,
  },
  {
    id: "showcase-boss-trigger",
    kind: "boss_trigger",
    category: "avoid",
    requiredAction: "avoid",
    distance: 2060,
    label: "Boss trigger",
    tutorial: "SHOWCASE 9/9: boss trigger",
    telegraph: "boss",
  },
] satisfies TriceratopsScriptEvent[];

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
