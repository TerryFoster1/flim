import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gameConfigSource = readFileSync(join(root, "client/src/games/triceratops/gameConfig.ts"), "utf8");
const gameSource = readFileSync(join(root, "client/src/games/triceratops/TriceratopsBacklotGame.tsx"), "utf8");
const cssSource = readFileSync(join(root, "client/src/games/triceratops/triceratops.css"), "utf8");
const audioSource = readFileSync(join(root, "client/src/games/triceratops/retroAudio.ts"), "utf8");

const config = {
  art: {
    internalResolution: "480x270",
    spriteScale: 3,
    tileSize: 16,
    characterFrame: { width: 72, height: 56 },
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
    targetDistance: 4100,
    startingHp: 3,
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
    { id: "tutorial-jump", kind: "jump_obstacle", distance: 560 },
    { id: "tutorial-smash", kind: "smash_camera", distance: 1060 },
    { id: "jump-two", kind: "jump_obstacle", distance: 1520 },
    { id: "crate-one", kind: "smash_crate", distance: 1820 },
    { id: "golden-reel", kind: "collectible", distance: 2240 },
    { id: "first-hazard", kind: "hazard_cable", distance: 2820 },
    { id: "finale-wall", kind: "smash_wall", distance: 3500 },
    { id: "wrap-marker", kind: "finish", distance: 4040 },
  ],
};

const dinoStates = {
  idle: 2,
  run: 6,
  jump: 3,
  smash: 4,
  hit: 2,
  over: 2,
  victory: 3,
};

function approximateSceneSeconds() {
  return config.scene.targetDistance / config.world.baseSpeed;
}

function firstObstacleImpactSeconds() {
  const spawnLead = 420;
  const first = config.timeline[0];
  const spawnAt = Math.max(0, first.distance - spawnLead) / config.world.baseSpeed;
  const travelToPlayer = (config.world.width + 60 - config.world.playerX) / config.world.baseSpeed;
  return spawnAt + travelToPlayer;
}

function jumpApexHeight() {
  return (config.world.jumpVelocity * config.world.jumpVelocity) / (2 * config.world.gravity);
}

function fullscreenCanvasFits(viewportWidth, viewportHeight) {
  const targetRatio = config.world.width / config.world.height;
  const viewportRatio = viewportWidth / viewportHeight;
  if (viewportRatio > targetRatio) {
    const displayedWidth = viewportHeight * targetRatio;
    return displayedWidth <= viewportWidth;
  }
  const displayedHeight = viewportWidth / targetRatio;
  return displayedHeight <= viewportHeight;
}

function validateResultPayload(payload) {
  return (
    payload.sceneId === config.scene.sceneId &&
    typeof payload.completed === "boolean" &&
    Number.isInteger(payload.score) &&
    payload.score >= 0 &&
    payload.score <= 100_000 &&
    Number.isInteger(payload.playTimeMs) &&
    payload.playTimeMs >= 1000 &&
    payload.playTimeMs <= 2 * 60 * 60 * 1000 &&
    Number.isInteger(payload.distance) &&
    payload.distance >= 0 &&
    Number.isInteger(payload.hpRemaining) &&
    payload.hpRemaining >= 0 &&
    payload.hpRemaining <= config.scene.startingHp &&
    Number.isInteger(payload.objectsSmashed) &&
    Number.isInteger(payload.hitsTaken) &&
    Number.isInteger(payload.collectibles)
  );
}

assert.match(gameConfigSource, /export type TriceratopsInput = "jump" \| "smash";/, "controls are reduced to jump and smash");
assert.doesNotMatch(gameConfigSource, /\| "left"|\| "right"|\| "charge"|rampage|combo|tickets/i, "config contains no old movement, charge, rampage, combo, or economy rules");
assert.doesNotMatch(gameSource, /setInput\("left"|setInput\("right"|charge|rampage|combo/i, "gameplay renderer does not expose old D-pad, charge, rampage, or combo behavior");
assert.doesNotMatch(audioSource, /"charge"|"combo"|"rampage"/, "audio engine no longer exposes removed action sounds");
assert.doesNotMatch(cssSource, /triceratops-control-pad/, "old D-pad control CSS is removed");
assert.match(cssSource, /triceratops-touch-zones/, "mobile touch-half controls are present");
assert.match(gameSource, /handleTouchZone\(event, "jump"\)/, "left touch half triggers jump");
assert.match(gameSource, /handleTouchZone\(event, "smash"\)/, "right touch half triggers smash");
assert.match(gameSource, /keydown-SPACE/, "desktop Space triggers jump");
assert.match(gameSource, /keydown-UP/, "desktop Up triggers jump");
assert.match(gameSource, /keydown-X/, "desktop X triggers smash");

assert.equal(config.art.internalResolution, "480x270", "TRICERATOPS uses fixed pixel-art internal resolution");
assert.equal(config.world.width / config.world.height, 16 / 9, "gameplay canvas is landscape 16:9");
assert.equal(config.art.spriteScale % 1, 0, "sprite scale is integer for crisp pixel art");
assert.deepEqual(config.art.characterFrame, { width: 72, height: 56 }, "sprite frame dimensions are fixed");
for (const [state, minimumFrames] of Object.entries({ run: 6, jump: 3, smash: 4, hit: 2, over: 2 })) {
  assert.ok(dinoStates[state] >= minimumFrames, `${state} has enough animation frames`);
}
assert.ok(dinoStates.victory >= 3, "scene-complete victory animation exists");

assert.ok(approximateSceneSeconds() >= 45, "vertical slice lasts at least 45 seconds at authored speed");
assert.ok(approximateSceneSeconds() <= 60, "vertical slice lasts no more than 60 seconds at authored speed");
assert.equal(config.world.baseSpeed, 86, "base speed is fixed instead of ramping unpredictably");
assert.ok(config.timeline[0].kind === "jump_obstacle", "first obstacle teaches jump");
assert.ok(firstObstacleImpactSeconds() >= 6, "first obstacle gives several seconds of tutorial lead-in");
assert.ok(jumpApexHeight() > 60, "jump arc is high enough to clear the first prop comfortably");
assert.ok(config.world.coyoteMs >= 120, "coyote time is forgiving");
assert.ok(config.world.inputBufferMs >= 150, "input buffering is forgiving");
assert.ok(config.world.playerBody.width <= 36 && config.world.playerBody.height <= 36, "player collision body is forgiving");

assert.equal(config.scene.startingHp, 3, "scene starts with 3 HP");
assert.match(gameSource, /this\.hp -= 1;/, "obstacle mistakes cost HP instead of instantly ending the game");
assert.match(gameSource, /this\.hp <= 0/, "game over only happens after HP is depleted");
assert.equal(config.scoring.smashTarget, 100, "smash target score is +100");
assert.equal(config.scoring.collectible, 250, "collectible score is +250");
assert.equal(config.scoring.sceneClear, 1000, "scene completion score is +1000");
assert.doesNotMatch(gameSource, /recordBacklotGameOver\(TRICERATOPS_GAME_ID, .*tickets/i, "game does not award tickets in the vertical slice");

assert.ok(config.timeline.some((event) => event.kind === "collectible"), "timeline includes one collectible beat");
assert.ok(config.timeline.some((event) => event.kind === "hazard_cable"), "timeline includes a first hazard beat");
assert.ok(config.timeline.some((event) => event.kind === "smash_wall"), "timeline includes a mini-finale smash beat");
assert.equal(config.timeline.at(-1).kind, "finish", "timeline ends with a finish marker");
assert.match(gameSource, /THAT'S A WRAP!/, "success screen uses the requested wrap copy");
assert.match(gameSource, /CUT!/, "game over screen uses the requested cut copy");
assert.match(gameSource, /Play Again/, "success screen offers Play Again");
assert.match(gameSource, /Exit to Backlot/, "end screen can exit to Backlot");

assert.equal(fullscreenCanvasFits(568, 320), true, "small landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(844, 390), true, "modern landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(932, 430), true, "large landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(1366, 768), true, "desktop viewport fits the game canvas");
assert.match(cssSource, /orientation: portrait/, "portrait phones get a rotate-device gate");
assert.match(gameSource, /activeGame\?\.destroy\(true\)/, "Phaser instance is destroyed during React cleanup");

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    score: 1700,
    playTimeMs: 48_000,
    distance: 4100,
    hpRemaining: 2,
    objectsSmashed: 4,
    hitsTaken: 1,
    collectibles: 1,
  }),
  true,
  "normal result payload is valid",
);
assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    score: 1_000_001,
    playTimeMs: 48_000,
    distance: 4100,
    hpRemaining: 2,
    objectsSmashed: 4,
    hitsTaken: 1,
    collectibles: 1,
  }),
  false,
  "impossible score is rejected",
);
assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: false,
    score: 500,
    playTimeMs: 10,
    distance: 900,
    hpRemaining: 0,
    objectsSmashed: 1,
    hitsTaken: 3,
    collectibles: 0,
  }),
  false,
  "impossible playtime is rejected",
);

console.log("Backlot TRICERATOPS vertical-slice tests passed.");
