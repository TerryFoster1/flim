import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const gameConfigSource = readFileSync(join(root, "client/src/games/triceratops/gameConfig.ts"), "utf8");
const gameSource = readFileSync(join(root, "client/src/games/triceratops/TriceratopsBacklotGame.tsx"), "utf8");
const cssSource = readFileSync(join(root, "client/src/games/triceratops/triceratops.css"), "utf8");
const audioSource = readFileSync(join(root, "client/src/games/triceratops/retroAudio.ts"), "utf8");
const orientationSource = readFileSync(join(root, "client/src/backlot/orientation.ts"), "utf8");
const manifestSource = readFileSync(join(root, "client/public/manifest.json"), "utf8");

const generatorPath = join(root, "scripts/generate-triceratops-assets.mjs");
const assetDir = join(root, "client/public/backlot/triceratops");
const generatedAssets = [
  "triceratops-dino-sheet.png",
  "triceratops-object-atlas.png",
  "triceratops-scene1-mock.png",
  "triceratops-bg-far.png",
  "triceratops-bg-mid.png",
  "triceratops-foreground-tiles.png",
];

const config = {
  art: {
    internalResolution: "480x270",
    spriteScale: 3,
    tileSize: 16,
    characterFrame: { width: 80, height: 64 },
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
    targetDistance: 5050,
    startingHp: 5,
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
    { id: "tutorial-jump", kind: "jump_obstacle", distance: 820 },
    { id: "tutorial-smash", kind: "smash_camera", distance: 1320 },
    { id: "film-frame-one", kind: "collectible", distance: 1680 },
    { id: "jump-two", kind: "jump_obstacle", distance: 2100 },
    { id: "crate-one", kind: "smash_crate", distance: 2480 },
    { id: "first-hazard", kind: "hazard_cable", distance: 2940 },
    { id: "light-rig-one", kind: "smash_light", distance: 3180 },
    { id: "breakaway-flat", kind: "smash_wall", distance: 3520 },
    { id: "film-frame-two", kind: "collectible", distance: 3800 },
    { id: "jump-three", kind: "jump_obstacle", distance: 4080 },
    { id: "camera-two", kind: "smash_camera", distance: 4380 },
    { id: "final-hazard", kind: "hazard_light", distance: 4660 },
    { id: "finale-wall", kind: "smash_wall", distance: 4920 },
    { id: "wrap-marker", kind: "finish", distance: 5020 },
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
  const first = config.timeline[0];
  const spawnAt = Math.max(0, first.distance - config.world.spawnLeadDistance) / config.world.baseSpeed;
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

function countKind(kind) {
  return config.timeline.filter((event) => event.kind === kind).length;
}

function assertTimelineSpacing() {
  const activeEvents = config.timeline.filter((event) => event.kind !== "finish");
  for (let i = 1; i < activeEvents.length; i += 1) {
    const previous = activeEvents[i - 1];
    const current = activeEvents[i];
    const spacing = current.distance - previous.distance;
    assert.ok(spacing >= 240, `${current.id} is spaced at least 240px after ${previous.id}`);
  }
}

for (const asset of generatedAssets) {
  const assetPath = join(assetDir, asset);
  assert.equal(existsSync(assetPath), true, `${asset} exists`);
  assert.ok(statSync(assetPath).size > 400, `${asset} is a real generated image asset`);
}
assert.match(readFileSync(generatorPath, "utf8"), /sprite sheet/i, "asset generator documents sprite-sheet output");
assert.match(gameSource, /this\.load\.spritesheet\(DINO_SHEET_KEY/, "TRICERATOPS loads the dino sprite sheet");
assert.match(gameSource, /this\.load\.spritesheet\(OBJECT_ATLAS_KEY/, "TRICERATOPS loads the object atlas");
assert.doesNotMatch(gameSource, /this\.createTextures\(Phaser\)/, "runtime generated canvas textures are not the active art path");
assert.match(gameSource, /pixelArt: true/, "Phaser uses crisp pixel rendering");
assert.match(gameSource, /roundPixels: true/, "Phaser rounds pixels for stable retro art");

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
assert.deepEqual(config.art.characterFrame, { width: 80, height: 64 }, "sprite frame dimensions match the generated sheet");
for (const [state, minimumFrames] of Object.entries({ run: 6, jump: 3, smash: 4, hit: 2, over: 2 })) {
  assert.ok(dinoStates[state] >= minimumFrames, `${state} has enough animation frames`);
}
assert.ok(dinoStates.victory >= 3, "scene-complete victory animation exists");

assert.match(gameSource, /this\.physics\.world\.pause\(\)/, "physics world pauses during countdown and end states");
assert.match(gameSource, /this\.physics\.world\.resume\(\)/, "physics world resumes only when ACTION starts");
assert.match(gameSource, /this\.state !== "running" \|\| item\.handled/, "overlap handling ignores countdown and non-running states");
assert.ok(config.scene.safeStartSeconds >= 4 && config.scene.safeStartSeconds <= 5, "safe start window is 3-5 seconds");
assert.ok(firstObstacleImpactSeconds() >= config.scene.safeStartSeconds + 4, "first obstacle lands after a readable safe-start zone");

assert.ok(approximateSceneSeconds() >= 55, "vertical slice lasts close to one minute at authored speed");
assert.ok(approximateSceneSeconds() <= 60, "vertical slice lasts no more than 60 seconds at authored speed");
assert.equal(config.world.baseSpeed, 86, "base speed is fixed instead of ramping unpredictably");
assert.equal(config.world.spawnLeadDistance, 420, "spawn lead distance is explicit and testable");
assert.equal(config.world.minimumReactionDistance, 420, "minimum reaction distance is explicit and testable");
assert.ok(config.timeline[0].kind === "jump_obstacle", "first obstacle teaches jump");
assert.ok(jumpApexHeight() > 80, "jump arc is high enough to clear the first prop comfortably");
assert.ok(config.world.coyoteMs >= 160, "coyote time is forgiving");
assert.ok(config.world.inputBufferMs >= 200, "input buffering is forgiving");
assert.ok(config.world.playerBody.width <= 30 && config.world.playerBody.height <= 30, "player collision body is forgiving");
assert.ok(config.attack.activeMs >= 800, "smash timing window is forgiving");
assert.ok(config.attack.cooldownMs <= 240, "smash recovery is quick enough for mobile taps");
assert.ok(config.attack.hitboxWidth >= 140, "smash hitbox reaches readable breakaway props");

assert.equal(countKind("jump_obstacle"), 3, "scene has about three easy jump events");
assert.ok(
  countKind("smash_camera") + countKind("smash_light") + countKind("smash_crate") + countKind("smash_wall") >= 4,
  "scene has 4-6 smash opportunities",
);
assert.ok(
  countKind("smash_camera") + countKind("smash_light") + countKind("smash_crate") + countKind("smash_wall") <= 6,
  "scene does not flood smash opportunities",
);
assert.equal(countKind("smash_light"), 1, "scene includes a smashable studio light");
assert.equal(countKind("hazard_cable"), 1, "scene includes a sparking cable hazard");
assert.equal(countKind("hazard_light"), 1, "scene includes a falling studio light hazard");
assert.ok(countKind("collectible") >= 2 && countKind("collectible") <= 3, "scene has 2-3 collectibles");
assert.equal(countKind("finish"), 1, "scene has one finish event");
assert.equal(config.timeline.at(-1).kind, "finish", "timeline ends with a finish marker");
assertTimelineSpacing();

assert.equal(config.scene.startingHp, 5, "scene starts with 5 HP for a forgiving first vertical slice");
assert.match(gameSource, /this\.hp -= cost;/, "obstacle mistakes use an explicit HP cost instead of instantly ending the game");
assert.match(gameSource, /this\.hp <= 0/, "game over only happens after HP is depleted");
assert.match(gameSource, /bumpBreakable\(item\)/, "missed smash props are opportunities, not mandatory damage gates");
assert.doesNotMatch(gameSource, /takeDamage\(item, "Smash breakaway props"\)/, "breakaway props no longer punish missed smashes with HP loss");
assert.match(gameSource, /item\.script\.kind === "jump_obstacle" \? 0 : 1/, "jump-obstacle bumps teach timing without ending Scene 1 early");
assert.match(gameSource, /setLastScore\(detail\.result\.score\)/, "end screens display the authoritative result score");
assert.equal(config.scoring.smashTarget, 100, "smash target score is +100");
assert.equal(config.scoring.collectible, 250, "collectible score is +250");
assert.equal(config.scoring.sceneClear, 1000, "scene completion score is +1000");
assert.doesNotMatch(gameSource, /recordBacklotGameOver\(TRICERATOPS_GAME_ID, .*tickets/i, "game does not award tickets in the vertical slice");

assert.match(gameSource, /THAT'S A WRAP!/, "success screen uses the requested wrap copy");
assert.match(gameSource, /CUT!/, "game over screen uses the requested cut copy");
assert.match(gameSource, /Play Again/, "success screen offers Play Again");
assert.match(gameSource, /Exit to Backlot/, "end screen can exit to Backlot");
assert.match(gameSource, /spawnedIds\.clear\(\)/, "restart clears authored spawn state");
assert.match(gameSource, /objects\.clear\(true, true\)/, "restart clears old objects");

assert.equal(fullscreenCanvasFits(568, 320), true, "small landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(800, 360), true, "800x360 landscape viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(844, 390), true, "modern landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(915, 412), true, "915x412 landscape viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(932, 430), true, "large landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(1366, 768), true, "desktop viewport fits the game canvas");
assert.match(orientationSource, /width > snapshot\.height/, "Backlot orientation detection is viewport-dimension first");
assert.match(orientationSource, /visualViewport\?\.addEventListener\(\"resize\"/, "Backlot orientation listens to visual viewport resize");
assert.match(orientationSource, /orientationchange/, "Backlot orientation listens to physical orientation changes");
assert.match(orientationSource, /screen\?\.orientation\?\.addEventListener\?\.\(\"change\"/, "Backlot orientation listens to screen orientation as a supplement");
assert.match(orientationSource, /BACKLOT_ORIENTATION_SETTLE_DELAYS_MS/, "Backlot orientation rechecks settled mobile viewport dimensions after rotation");
assert.match(orientationSource, /setTimeout\(update, delay\)/, "Backlot orientation schedules delayed settle passes after orientation events");
assert.match(cssSource, /orientation: portrait/, "portrait phones get a rotate-device gate");
assert.match(gameSource, /bridgeRef\.current\?\.pauseRun\(\)/, "game pauses when the orientation gate returns during play");
assert.match(gameSource, /pausedByOrientationRef\.current = true/, "orientation-caused pauses are tracked separately from user pauses");
assert.match(gameSource, /isLandscape && phase === "running" && paused && pausedByOrientationRef\.current/, "portrait-to-landscape transition resumes an orientation-paused run");
assert.match(gameSource, /refreshPhaserScale\(\)/, "TRICERATOPS has a shared Phaser resize refresh helper");
assert.match(gameSource, /gameRef\.current\?\.scale\.resize/, "Phaser scale is refreshed after orientation changes");
assert.match(gameSource, /gameRef\.current\?\.scale\.refresh/, "Phaser scale manager refreshes after orientation changes");
assert.match(gameSource, /requestAnimationFrame\(refresh\)/, "Phaser resize runs after the browser applies landscape layout");
assert.match(gameSource, /setTimeout\(refresh, 180\)/, "Phaser resize runs a delayed pass for mobile browser toolbar settling");
assert.match(gameSource, /orientation\.lock\("landscape"\)/, "landscape lock is attempted only as a best-effort enhancement");
assert.match(gameSource, /setPhase\("start"\)/, "intro countdown returns to start if portrait gate appears");
assert.equal(JSON.parse(manifestSource).orientation, "any", "web PWA manifest does not globally force portrait");
assert.match(gameSource, /activeGame\?\.destroy\(true\)/, "Phaser instance is destroyed during React cleanup");

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    score: 2200,
    playTimeMs: 58_000,
    distance: 5050,
    hpRemaining: 2,
    objectsSmashed: 5,
    hitsTaken: 1,
    collectibles: 2,
  }),
  true,
  "normal result payload is valid",
);
assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    score: 1_000_001,
    playTimeMs: 58_000,
    distance: 5050,
    hpRemaining: 2,
    objectsSmashed: 5,
    hitsTaken: 1,
    collectibles: 2,
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

console.log("Backlot TRICERATOPS gameplay reset and art tests passed.");
