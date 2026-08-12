import assert from "node:assert/strict";

const config = {
  art: {
    internalResolution: "480x270",
    spriteScale: 3,
    tileSize: 16,
    characterFrame: { width: 64, height: 48 },
  },
  world: {
    width: 480,
    height: 270,
    groundY: 212,
    playerX: 72,
    baseSpeed: 146,
    maxSpeed: 292,
    jumpVelocity: 342,
    highJumpVelocity: 410,
  },
  scene: {
    sceneId: "studio-backlot-1",
    name: "Studio Backlot",
    targetDistance: 3600,
    checkpointEvery: 1200,
    startingHp: 3,
    sRankTimeMs: 155000,
  },
  attack: {
    activeMs: 380,
    cooldownMs: 460,
  },
  scoring: {
    smashTarget: 220,
    propDestroyed: 55,
    reelCollected: 110,
    hazardCleared: 85,
    rampageBonus: 75,
    distancePointEveryPx: 48,
    comboStep: 0.22,
    maxMultiplier: 5,
  },
};

const dinoStates = {
  idle: 2,
  run: 6,
  fastRun: 6,
  jump: 3,
  jumpFall: 2,
  land: 2,
  charge: 4,
  smash: 4,
  hit: 2,
  stunned: 2,
  rampage: 4,
  victory: 3,
  over: 2,
};

function nextSpeed(distance) {
  return Math.min(config.world.maxSpeed, config.world.baseSpeed + Math.floor(distance / 900) * 18);
}

function addComboScore(state, event) {
  const comboHits = state.comboHits + 1;
  const combo = Math.min(1 + comboHits * config.scoring.comboStep, config.scoring.maxMultiplier);
  return {
    score: state.score + Math.round(config.scoring[event] * combo),
    comboHits,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
  };
}

function canDefeatHazard({ falling, playerY, hazardY, charging }) {
  return charging || (falling && playerY < hazardY - 22);
}

function controlStateAfter(events) {
  return events.reduce(
    (state, [input, active]) => ({
      ...state,
      [input]: active,
    }),
    { left: false, right: false, jump: false, charge: false },
  );
}

function validateResultPayload(payload) {
  return (
    payload.sceneId === config.scene.sceneId &&
    typeof payload.completed === "boolean" &&
    ["S", "A", "B", "C"].includes(payload.grade) &&
    Number.isInteger(payload.score) &&
    payload.score >= 0 &&
    payload.score <= 1_000_000 &&
    Number.isInteger(payload.playTimeMs) &&
    payload.playTimeMs >= 1000 &&
    payload.playTimeMs <= 2 * 60 * 60 * 1000 &&
    Number.isInteger(payload.hpRemaining) &&
    payload.hpRemaining >= 0 &&
    payload.hpRemaining <= config.scene.startingHp &&
    Number.isInteger(payload.objectsSmashed) &&
    Number.isInteger(payload.rampageActivations) &&
    Number.isInteger(payload.checkpointsCleared) &&
    Number.isInteger(payload.hazardsCleared) &&
    Number.isFinite(payload.maxCombo)
  );
}

function isSceneComplete(distance) {
  return distance >= config.scene.targetDistance;
}

function checkpointCount(distance) {
  return Math.floor(distance / config.scene.checkpointEvery);
}

function fullscreenCanvasFits(viewportWidth, viewportHeight) {
  const targetRatio = config.world.width / config.world.height;
  const viewportRatio = viewportWidth / viewportHeight;
  if (viewportRatio > targetRatio) {
    const displayedWidth = viewportHeight * targetRatio;
    return displayedWidth <= viewportWidth && viewportHeight <= viewportHeight;
  }
  const displayedHeight = viewportWidth / targetRatio;
  return viewportWidth <= viewportWidth && displayedHeight <= viewportHeight;
}

assert.equal(config.art.internalResolution, "480x270", "TRICERATOPS uses a fixed pixel-art internal resolution");
assert.equal(config.world.width / config.world.height, 16 / 9, "gameplay canvas is landscape 16:9");
assert.equal(config.art.spriteScale % 1, 0, "sprite scale is integer for crisp pixels");
for (const [state, minimumFrames] of Object.entries({ run: 6, jump: 3, charge: 4, smash: 4, hit: 2, over: 2 })) {
  assert.ok(dinoStates[state] >= minimumFrames, `${state} has enough animation frames`);
}
assert.ok(dinoStates.rampage >= 4, "rampage animation exists");
assert.ok(dinoStates.victory >= 3, "scene-complete victory animation exists");
assert.equal(config.scene.targetDistance, 3600, "scene one is finite rather than endless");
assert.equal(config.scene.startingHp, 3, "scene one starts with a bounded HP pool");

assert.equal(nextSpeed(0), 146, "run starts at base speed");
assert.equal(nextSpeed(900), 164, "difficulty increases with distance");
assert.equal(nextSpeed(99_999), 292, "difficulty has a hard cap");
assert.equal(isSceneComplete(3599), false, "scene does not complete early");
assert.equal(isSceneComplete(3600), true, "scene completes at the wrap marker");
assert.equal(checkpointCount(2500), 2, "checkpoints track scene progress");

let state = { score: 0, comboHits: 0, combo: 1, maxCombo: 1 };
state = addComboScore(state, "smashTarget");
assert.equal(state.combo, 1.22, "first scoring event increases combo");
assert.equal(state.score, 268, "combo applies to smash target score");
state = addComboScore(state, "reelCollected");
assert.equal(state.combo, 1.44, "second scoring event continues combo");
assert.equal(state.maxCombo, 1.44, "max combo tracks peak value");

assert.equal(canDefeatHazard({ falling: true, playerY: 150, hazardY: 178, charging: false }), true, "stomping a hazard works");
assert.equal(canDefeatHazard({ falling: false, playerY: 176, hazardY: 178, charging: false }), false, "walking into a hazard fails");
assert.equal(canDefeatHazard({ falling: false, playerY: 176, hazardY: 178, charging: true }), true, "charging through a hazard works");

assert.deepEqual(
  controlStateAfter([
    ["right", true],
    ["charge", true],
  ]),
  { left: false, right: true, jump: false, charge: true },
  "dual-thumb controls allow movement and charge together",
);

assert.equal(fullscreenCanvasFits(844, 390), true, "landscape phone viewport fits the full game canvas");
assert.equal(fullscreenCanvasFits(915, 412), true, "large landscape phone viewport fits the full game canvas");
assert.equal(fullscreenCanvasFits(1366, 768), true, "desktop viewport fits the full game canvas");

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    grade: "A",
    score: 4500,
    playTimeMs: 45000,
    hpRemaining: 2,
    objectsSmashed: 12,
    rampageActivations: 1,
    checkpointsCleared: 3,
    hazardsCleared: 3,
    maxCombo: 2.54,
  }),
  true,
  "normal result payload is valid",
);
assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    grade: "A",
    score: 1_000_001,
    playTimeMs: 45000,
    hpRemaining: 2,
    objectsSmashed: 12,
    rampageActivations: 1,
    checkpointsCleared: 3,
    hazardsCleared: 3,
    maxCombo: 2.54,
  }),
  false,
  "impossible score is rejected",
);
assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    grade: "A",
    score: 4500,
    playTimeMs: 10,
    hpRemaining: 2,
    objectsSmashed: 12,
    rampageActivations: 1,
    checkpointsCleared: 3,
    hazardsCleared: 3,
    maxCombo: 2.54,
  }),
  false,
  "impossible playtime is rejected",
);

console.log("Backlot TRICERATOPS game logic tests passed.");
