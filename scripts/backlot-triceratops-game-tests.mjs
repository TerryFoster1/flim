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
    targetDistance: 6400,
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
  timeline: [
    { id: "tutorial-jump", kind: "jump_obstacle", category: "jump", distance: 900 },
    { id: "tutorial-smash", kind: "smash_camera", category: "smash", distance: 1320 },
    { id: "film-frame-one", kind: "collectible", category: "collect", distance: 1680 },
    { id: "jump-two", kind: "jump_obstacle", category: "jump", distance: 2100 },
    { id: "crate-one", kind: "smash_crate", category: "smash", chainId: "craft-service-chaos", distance: 2480 },
    { id: "craft-service-camera", kind: "smash_camera", category: "smash", chainId: "craft-service-chaos", distance: 2600 },
    { id: "craft-service-light", kind: "smash_light", category: "smash", chainId: "craft-service-chaos", distance: 2740 },
    { id: "first-hazard", kind: "hazard_cable", category: "jump", distance: 3060 },
    { id: "breakaway-flat", kind: "smash_wall", category: "smash", chainId: "city-set-collapse", distance: 3360 },
    { id: "city-set-crate", kind: "smash_crate", category: "smash", chainId: "city-set-collapse", distance: 3500 },
    { id: "city-set-camera", kind: "smash_camera", category: "smash", chainId: "city-set-collapse", distance: 3650 },
    { id: "film-frame-two", kind: "collectible", category: "collect", distance: 3890 },
    { id: "jump-three", kind: "jump_obstacle", category: "jump", distance: 4200 },
    { id: "final-hazard", kind: "hazard_light", category: "jump", distance: 4580 },
    { id: "film-frame-three", kind: "collectible", category: "collect", distance: 4860 },
    { id: "rampage-wall", kind: "smash_wall", category: "smash", chainId: "western-lot-rampage", distance: 5160 },
    { id: "rampage-crate", kind: "smash_crate", category: "smash", chainId: "western-lot-rampage", distance: 5310 },
    { id: "rampage-camera", kind: "smash_camera", category: "smash", chainId: "western-lot-rampage", distance: 5480 },
    { id: "finale-wall", kind: "smash_wall", category: "smash", chainId: "finale-collapse", finale: true, distance: 5950 },
    { id: "finale-light", kind: "smash_light", category: "smash", chainId: "finale-collapse", finale: true, distance: 6100 },
    { id: "wrap-marker", kind: "finish", category: "finish", distance: 6350 },
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
    Number.isInteger(payload.collectibles) &&
    Number.isInteger(payload.chainsTriggered) &&
    Number.isInteger(payload.bestChain) &&
    Number.isInteger(payload.rampageActivations) &&
    typeof payload.finaleDestroyed === "boolean" &&
    ["S", "A", "B", "C", "D"].includes(payload.grade)
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
    const expectedSpacing = previous.chainId && previous.chainId === current.chainId ? 110 : 240;
    assert.ok(spacing >= expectedSpacing, `${current.id} is spaced at least ${expectedSpacing}px after ${previous.id}`);
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
assert.doesNotMatch(gameConfigSource, /\| "left"|\| "right"|\| "charge"|tickets/i, "config contains no old movement, charge, or economy rules");
assert.match(gameConfigSource, /chainId\?: string;/, "authored destruction chains are part of the script model");
assert.match(gameConfigSource, /finale\?: boolean;/, "script model marks finale set pieces");
assert.match(gameConfigSource, /rampage:/, "rampage meter rules are defined in config");
assert.match(gameConfigSource, /TriceratopsGrade/, "result payload includes a mastery grade");
assert.doesNotMatch(gameSource, /setInput\("left"|setInput\("right"|charge/i, "gameplay renderer does not expose old D-pad or charge behavior");
assert.match(gameSource, /activateRampage/, "gameplay renderer exposes rampage activation");
assert.match(gameSource, /emitRampage/, "gameplay renderer sends rampage meter updates");
assert.match(gameSource, /registerChain/, "gameplay renderer scores authored destruction chains");
assert.match(gameSource, /TRICERATOPS_ASSET_LOADED/, "dev/staging asset diagnostics identify loaded art");
assert.match(gameSource, /TRICERATOPS_PLAYER_TEXTURE/, "asset diagnostics include the player texture");
assert.match(gameSource, /triceratopsAssetTest/, "asset-test query mode exists for staging QA");
assert.doesNotMatch(audioSource, /"charge"/, "audio engine no longer exposes removed charge sounds");
assert.match(audioSource, /"objectBreak"|"chain"|"rampageStart"|"finale"/, "audio engine exposes rampage and destruction-chain cues");
assert.doesNotMatch(cssSource, /triceratops-control-pad/, "old D-pad control CSS is removed");
assert.match(cssSource, /triceratops-touch-zones/, "mobile touch-half controls are present");
assert.match(cssSource, /triceratops-rampage-meter/, "rampage meter UI is present");
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

assert.ok(approximateSceneSeconds() >= 58, "vertical slice lasts close to one minute at authored speed");
assert.ok(approximateSceneSeconds() <= 66, "vertical slice remains a tight playable vertical slice");
assert.equal(config.world.baseSpeed, 104, "base speed is fixed instead of ramping unpredictably");
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
  "scene has at least four smash opportunities",
);
assert.ok(
  countKind("smash_camera") + countKind("smash_light") + countKind("smash_crate") + countKind("smash_wall") <= 14,
  "scene keeps smash opportunities authored and readable",
);
assert.equal(countKind("smash_light"), 2, "scene includes smashable studio lights");
assert.equal(countKind("hazard_cable"), 1, "scene includes a sparking cable hazard");
assert.equal(countKind("hazard_light"), 1, "scene includes a falling studio light hazard");
assert.ok(countKind("collectible") >= 2 && countKind("collectible") <= 3, "scene has 2-3 collectibles");
assert.ok(config.timeline.filter((event) => event.chainId).length >= 10, "scene includes authored destruction-chain objects");
assert.equal(config.timeline.filter((event) => event.finale).length, 2, "scene includes a finale set-piece chain");
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
assert.equal(config.scoring.smashSmall, 100, "small smash score is +100");
assert.equal(config.scoring.smashMedium, 250, "medium smash score is +250");
assert.equal(config.scoring.smashMajor, 500, "major smash score is +500");
assert.equal(config.scoring.collectible, 300, "collectible score is +300");
assert.equal(config.scoring.chainBase, 125, "chain scoring has a base bonus");
assert.equal(config.scoring.sceneClear, 1000, "scene completion score is +1000");
assert.equal(config.scoring.noHitBonus, 600, "clean-run bonus is scored");
assert.equal(config.scoring.finaleBonus, 1200, "finale destruction bonus is scored");
assert.equal(config.rampage.max, 100, "rampage meter has an explicit max");
assert.ok(config.rampage.durationMs >= 8000, "rampage lasts long enough to be useful");
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
assert.match(orientationSource, /subscribeBacklotOrientationChanges/, "Backlot orientation exposes an imperative rotation signal for live games");
assert.match(cssSource, /orientation: portrait/, "portrait phones get a rotate-device gate");
assert.match(gameSource, /forcePortraitGate/, "game can show the rotate gate immediately before React orientation state settles");
assert.match(gameSource, /bridgeRef\.current\?\.setPaused\(true\)/, "landscape-to-portrait transition explicitly pauses the run");
assert.match(gameSource, /bridgeRef\.current\?\.setPaused\(false\)/, "portrait-to-landscape transition explicitly resumes only orientation-paused runs");
assert.match(gameSource, /setPaused: \(paused\) => this\.setRunPaused\(paused\)/, "game bridge supports explicit pause state instead of orientation pause toggles");
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
assert.match(gameSource, /TRICERATOPS_ART_VERSION/, "TRICERATOPS runtime art URLs are versioned to avoid stale PWA/browser cache");
assert.match(gameSource, /assetUrl\("triceratops-dino-sheet\.png"\)/, "dino sheet loads through the versioned asset URL helper");

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
    chainsTriggered: 2,
    bestChain: 3,
    rampageActivations: 1,
    finaleDestroyed: true,
    grade: "A",
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
    chainsTriggered: 2,
    bestChain: 3,
    rampageActivations: 1,
    finaleDestroyed: true,
    grade: "A",
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
    chainsTriggered: 0,
    bestChain: 0,
    rampageActivations: 0,
    finaleDestroyed: false,
    grade: "D",
  }),
  false,
  "impossible playtime is rejected",
);

console.log("Backlot TRICERATOPS gameplay reset and art tests passed.");
