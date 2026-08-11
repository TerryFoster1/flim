import assert from "node:assert/strict";

const config = {
  baseSpeed: 260,
  maxSpeed: 525,
  comboStep: 0.22,
  maxMultiplier: 5,
  scores: {
    carSmash: 220,
    perfectCharge: 460,
    sceneryDestroyed: 55,
    reelCollected: 110,
    hazardCleared: 85,
    rampageBonus: 75,
  },
};

function nextSpeed(distance) {
  return Math.min(config.maxSpeed, config.baseSpeed + Math.floor(distance / 1120) * 20);
}

function addComboScore(state, event) {
  const comboHits = state.comboHits + 1;
  const combo = Math.min(1 + comboHits * config.comboStep, config.maxMultiplier);
  return {
    score: state.score + Math.round(config.scores[event] * combo),
    comboHits,
    combo,
    maxCombo: Math.max(state.maxCombo, combo),
  };
}

function canDefeatHazard({ falling, playerY, hazardY, charging }) {
  return charging || (falling && playerY < hazardY - 16);
}

function validateResultPayload(payload) {
  return (
    Number.isInteger(payload.score) &&
    payload.score >= 0 &&
    payload.score <= 1_000_000 &&
    Number.isInteger(payload.playTimeMs) &&
    payload.playTimeMs >= 1000 &&
    payload.playTimeMs <= 2 * 60 * 60 * 1000
  );
}

assert.equal(nextSpeed(0), 260, "run starts at base speed");
assert.equal(nextSpeed(1120), 280, "difficulty increases with distance");
assert.equal(nextSpeed(99_999), 525, "difficulty has a hard cap");

let state = { score: 0, comboHits: 0, combo: 1, maxCombo: 1 };
state = addComboScore(state, "carSmash");
assert.equal(state.combo, 1.22, "first scoring event increases combo");
assert.equal(state.score, 268, "combo applies to car score");
state = addComboScore(state, "perfectCharge");
assert.equal(state.combo, 1.44, "second scoring event continues combo");
assert.equal(state.maxCombo, 1.44, "max combo tracks peak value");

assert.equal(canDefeatHazard({ falling: true, playerY: 320, hazardY: 360, charging: false }), true, "stomping a hazard works");
assert.equal(canDefeatHazard({ falling: false, playerY: 350, hazardY: 360, charging: false }), false, "walking into a hazard fails");
assert.equal(canDefeatHazard({ falling: false, playerY: 350, hazardY: 360, charging: true }), true, "charging through a hazard works");

assert.equal(validateResultPayload({ score: 4500, playTimeMs: 45000 }), true, "normal result payload is valid");
assert.equal(validateResultPayload({ score: 1_000_001, playTimeMs: 45000 }), false, "impossible score is rejected");
assert.equal(validateResultPayload({ score: 4500, playTimeMs: 10 }), false, "impossible playtime is rejected");

console.log("Backlot TRICERATOPS game logic tests passed.");
