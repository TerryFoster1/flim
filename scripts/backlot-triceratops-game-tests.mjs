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
  run: 6,
  jump: 3,
  charge: 4,
  smash: 4,
  hit: 2,
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
    Number.isInteger(payload.score) &&
    payload.score >= 0 &&
    payload.score <= 1_000_000 &&
    Number.isInteger(payload.playTimeMs) &&
    payload.playTimeMs >= 1000 &&
    payload.playTimeMs <= 2 * 60 * 60 * 1000 &&
    Number.isInteger(payload.objectsSmashed) &&
    Number.isInteger(payload.hazardsCleared) &&
    Number.isFinite(payload.maxCombo)
  );
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
assert.deepEqual(dinoStates, { run: 6, jump: 3, charge: 4, smash: 4, hit: 2, over: 2 }, "all required dinosaur animation states exist");

assert.equal(nextSpeed(0), 146, "run starts at base speed");
assert.equal(nextSpeed(900), 164, "difficulty increases with distance");
assert.equal(nextSpeed(99_999), 292, "difficulty has a hard cap");

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
    score: 4500,
    playTimeMs: 45000,
    objectsSmashed: 12,
    hazardsCleared: 3,
    maxCombo: 2.54,
  }),
  true,
  "normal result payload is valid",
);
assert.equal(
  validateResultPayload({
    score: 1_000_001,
    playTimeMs: 45000,
    objectsSmashed: 12,
    hazardsCleared: 3,
    maxCombo: 2.54,
  }),
  false,
  "impossible score is rejected",
);
assert.equal(
  validateResultPayload({
    score: 4500,
    playTimeMs: 10,
    objectsSmashed: 12,
    hazardsCleared: 3,
    maxCombo: 2.54,
  }),
  false,
  "impossible playtime is rejected",
);

console.log("Backlot TRICERATOPS game logic tests passed.");
