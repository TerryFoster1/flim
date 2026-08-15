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
const swSource = readFileSync(join(root, "client/public/sw.js"), "utf8");
const viteConfigSource = readFileSync(join(root, "client/vite.config.ts"), "utf8");

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

const requiredActions = ["normalJump", "highJump", "longJump", "smash", "jumpOrSmash", "slide", "collect", "finish"];
const obstacleKinds = [
  "high_barrier",
  "long_gap",
  "pit",
  "overhead_beam",
  "striped_barrier",
  "tour_tram",
  "dumpster",
  "smash_wall",
  "collectible",
  "film_reel",
  "one_up",
  "boss_trigger",
  "boss_fireball",
  "boss_tail_sweep",
  "boss_overhead",
  "boss_shockwave",
  "boss_weak_point",
  "finish",
];

function countRequiredAction(action) {
  const escaped = action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...gameConfigSource.matchAll(new RegExp(`requiredAction: "${escaped}"`, "g"))].length;
}

function validateResultPayload(payload) {
  return (
    payload.sceneId === "studio-backlot-1" &&
    typeof payload.completed === "boolean" &&
    Number.isInteger(payload.score) &&
    payload.score >= 0 &&
    payload.score <= 100_000 &&
    Number.isInteger(payload.highScore) &&
    payload.highScore >= payload.score &&
    typeof payload.newHighScore === "boolean" &&
    Number.isInteger(payload.playTimeMs) &&
    payload.playTimeMs >= 1000 &&
    payload.playTimeMs <= 2 * 60 * 60 * 1000 &&
    Number.isInteger(payload.distance) &&
    payload.distance >= 0 &&
    Number.isInteger(payload.livesRemaining) &&
    payload.livesRemaining >= 0 &&
    payload.livesRemaining <= 5 &&
    Number.isInteger(payload.objectsSmashed) &&
    Number.isInteger(payload.hitsTaken) &&
    Number.isInteger(payload.collectibles) &&
    Number.isInteger(payload.oneUpsCollected) &&
    Number.isInteger(payload.chainsTriggered) &&
    Number.isInteger(payload.bestChain) &&
    Number.isInteger(payload.rampageActivations) &&
    typeof payload.finaleDestroyed === "boolean" &&
    !("grade" in payload) &&
    !("hpRemaining" in payload)
  );
}

function fullscreenCanvasFits(viewportWidth, viewportHeight) {
  const targetRatio = 480 / 270;
  const viewportRatio = viewportWidth / viewportHeight;
  if (viewportRatio > targetRatio) {
    const displayedWidth = viewportHeight * targetRatio;
    return displayedWidth <= viewportWidth;
  }
  const displayedHeight = viewportWidth / targetRatio;
  return displayedHeight <= viewportHeight;
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

assert.match(
  gameConfigSource,
  /export type TriceratopsInput = "normalJump" \| "highJump" \| "longJump" \| "hornSmash" \| "slide" \| "rampage";/,
  "controls use the explicit jump/smash/slide/rampage input model",
);
assert.match(gameConfigSource, /export type TriceratopsRequiredAction/, "obstacles declare the correct player decision");
for (const action of requiredActions) {
  assert.ok(countRequiredAction(action) > 0, `timeline includes required action ${action}`);
}
for (const kind of obstacleKinds) {
  assert.match(gameConfigSource, new RegExp(`"${kind}"`), `timeline/config includes ${kind}`);
}
assert.match(gameConfigSource, /startingLives: 3/, "scene starts with 3 old-school lives");
assert.match(gameConfigSource, /TRICERATOPS_LEVEL_CONFIG_VERSION/, "scene has a level config version for live verification");
assert.match(gameConfigSource, /TRICERATOPS_GROUND_Y/, "scene has a canonical ground Y");
assert.match(gameConfigSource, /triceratopsShowcaseTimeline/, "scene has a deterministic showcase debug timeline");
const normalQaOrder = [
  "first-striped-barrier",
  "first-film-reel",
  "early-dumpster-platform",
  "dumpster-film-reel",
  "one-up-high",
  "first-visible-pit",
  "tour-tram-platform",
  "breakaway-wall",
  "overhead-slide-hazard",
  "long-jump-training-pit",
  "rampage-barrier-one",
  "rampage-camera-two",
  "rampage-crate-three",
  "rampage-light-four",
  "rampage-wall-five",
];
let previousNormalIndex = -1;
for (const id of normalQaOrder) {
  const index = gameConfigSource.indexOf(`id: "${id}"`);
  assert.ok(index > previousNormalIndex, `normal scene 1 QA lane includes ${id} in the first traversal sequence`);
  previousNormalIndex = index;
}
const showcaseOrder = [
  "showcase-striped-barrier",
  "showcase-dumpster",
  "showcase-film-reel",
  "showcase-one-up",
  "showcase-tour-tram",
  "showcase-pit",
  "showcase-overhead-slide-hazard",
  "showcase-breakable-wall",
  "showcase-boss-trigger",
];
let previousShowcaseIndex = -1;
for (const id of showcaseOrder) {
  const index = gameConfigSource.indexOf(`id: "${id}"`);
  assert.ok(index > previousShowcaseIndex, `showcase debug timeline includes ${id} in the required order`);
  previousShowcaseIndex = index;
}
assert.match(gameConfigSource, /maxLives: 5/, "life cap supports rare 1-UPs");
assert.match(gameConfigSource, /respawnInvulnerabilityMs/, "checkpoint respawn has invulnerability");
assert.match(gameConfigSource, /highScoreStorageKey/, "local high score persistence is configured");
assert.match(gameConfigSource, /bypassesHazards: false/, "rampage does not bypass pits or overhead hazards");
assert.match(gameConfigSource, /normalJumpVelocity/, "normal jump has distinct tuning");
assert.match(gameConfigSource, /highJumpVelocity/, "high jump has distinct tuning");
assert.match(gameConfigSource, /longJumpVelocity/, "long jump has distinct tuning");
assert.match(gameConfigSource, /longJumpMs: 640/, "long jump has capped but visibly longer airtime");
assert.match(gameConfigSource, /longJumpSpeedMultiplier: 1\.58/, "long jump has visibly longer horizontal reach");
assert.match(gameConfigSource, /slideMs/, "slide has a defined duration");
assert.match(gameConfigSource, /attack:[\s\S]*activeMs: 260/, "horn smash has a short timing window");
assert.match(gameConfigSource, /hitboxWidth: 74/, "horn hitbox is intentionally short");
assert.doesNotMatch(gameConfigSource, /startingHp|TriceratopsGrade|grades:/, "HP and grade config is removed");

assert.match(gameSource, /normalJump: \(\) => this\.requestJump\("normalJump"\)/, "bridge exposes normal jump");
assert.match(gameSource, /highJump: \(\) => this\.requestJump\("highJump"\)/, "bridge exposes high jump");
assert.match(gameSource, /startLongJump: \(\) => this\.startLongJump\(\)/, "bridge exposes held long jump");
assert.match(gameSource, /hornSmash: \(\) => this\.requestSmash\(\)/, "bridge exposes horn smash");
assert.match(gameSource, /startSlide: \(\) => this\.startSlide\(\)/, "bridge exposes slide start");
assert.match(gameSource, /endSlide: \(\) => this\.endSlide\(\)/, "bridge exposes slide release");
assert.match(gameSource, /handleTouchZoneDown\(event, "left"\)/, "left invisible zone handles jump taps");
assert.match(gameSource, /handleTouchZoneDown\(event, "right"\)/, "right invisible zone handles smash/slide taps");
assert.match(gameSource, /const TOUCH_DOUBLE_TAP_MS = 310/, "double tap detection uses the phone QA window");
assert.match(gameSource, /const TOUCH_HOLD_AFTER_SECOND_TAP_MS = 210/, "second-tap hold detection keeps long-jump upgrade responsive");
assert.match(gameSource, /type TouchGesturePhase/, "touch input uses an explicit gesture state machine");
assert.match(gameSource, /"FIRST_TAP" \| "SECOND_TOUCH" \| "SECOND_HOLD"/, "gesture phases distinguish taps from second-tap holds");
assert.match(gameSource, /clearTouchResolve\(zone\)/, "touch resolution timers are centrally cleared");
assert.match(gameSource, /scheduleTouchResolve\(zone\)/, "single taps resolve after the double-tap window");
assert.doesNotMatch(gameSource, /TOUCH_SINGLE_TAP_DELAY_MS/, "old delayed-single constant is removed");
assert.doesNotMatch(gameSource, /clearTouchSingle\(zone\)/, "old single-tap cancellation helper is removed");
for (const inputLabel of [
  "LEFT_JUMP",
  "LEFT_SECOND_TAP",
  "LEFT_SECOND_HOLD",
  "HIGH_JUMP",
  "LONG_JUMP",
  "RIGHT_SMASH",
  "RIGHT_DOUBLE",
  "SLIDE",
  "RAMPAGE_ACTIVATE",
]) {
  assert.match(gameSource, new RegExp(inputLabel), `input debugger names ${inputLabel}`);
}
assert.doesNotMatch(gameSource, /LEFT_DOUBLE_HOLD|RIGHT_DOUBLE_HOLD|LEFT_SINGLE|RIGHT_SINGLE/, "input debugger no longer emits old gesture names");
assert.match(gameSource, /isTriceratopsInputDebugMode/, "staging input debugger is gated behind query/debug environment");
assert.match(gameSource, /InputDebugSnapshot/, "staging input debugger keeps structured input state");
assert.match(gameSource, /LAST INPUT:/, "staging input debugger shows the last input");
assert.match(gameSource, /first \$\{firstTouchAtMs/, "staging input debugger shows the first touch timestamp");
assert.match(gameSource, /interval \$\{tapIntervalMs/, "staging input debugger shows second-touch interval");
assert.match(gameSource, /Hold duration:/, "staging input debugger shows hold duration");
assert.match(gameSource, /getActionState: \(\) => this\.currentDinoState/, "input debugger reads the current player action state");
assert.doesNotMatch(gameSource, /holdAction === "slide"/, "right double-tap slide is timed and no longer cancelled on pointer-up");
assert.doesNotMatch(gameSource, /onLostPointerCapture/, "lost pointer capture no longer cancels valid phone taps");
assert.match(gameSource, /navigator\.vibrate/, "mobile unlock/action haptics are wired");
assert.match(gameSource, /keydown-SPACE/, "desktop Space triggers normal jump");
assert.match(gameSource, /keydown-UP/, "desktop Up triggers high jump");
assert.match(gameSource, /keydown-W/, "desktop W triggers high jump");
assert.match(gameSource, /keydown-SHIFT/, "desktop Shift triggers long jump");
assert.match(gameSource, /keydown-X/, "desktop X triggers smash");
assert.match(gameSource, /keydown-K/, "desktop K triggers smash");
assert.match(gameSource, /keydown-ENTER/, "desktop Enter triggers smash");
assert.match(gameSource, /keydown-DOWN/, "desktop Down triggers slide");
assert.match(gameSource, /keydown-S/, "desktop S triggers slide");
assert.match(gameSource, /keydown-P/, "desktop P pauses");
assert.match(gameSource, /latestCheckpoint/, "checkpoint lookup exists");
assert.match(gameSource, /respawnAtCheckpoint/, "life loss respawns at checkpoint");
assert.match(gameSource, /collectOneUp/, "1-UP collection is implemented");
assert.match(gameSource, /this\.lives -= 1/, "mistakes remove lives");
assert.match(gameSource, /this\.lives <= 0/, "game over waits for zero lives");
assert.match(gameSource, /invulnerableUntil/, "post-hit invulnerability exists");
assert.match(gameSource, /this\.player = .*\.setOrigin\(0\.5, 1\)\.setDepth\(12\)/, "dino renders above ground and is anchored by its feet");
assert.match(gameSource, /setDepth\(2\)/, "ground stays behind the dino");
assert.match(gameSource, /this\.foregroundLayer = this\.add[\s\S]*?\.setDepth\(3\)/, "foreground no longer hides the dino");
assert.match(gameSource, /groundY \+ groundLayerHeight \/ 2, width, groundLayerHeight, "stage-front"/, "foreground art uses one coherent ground layer");
assert.doesNotMatch(gameSource, /stage-mid|midLayer/, "runtime no longer loads or renders the old translucent midground duplicate");
assert.doesNotMatch(gameSource, /tilePositionX/, "background layers no longer parallax-scroll into duplicate seams");
assert.match(gameConfigSource, /groundColliderOffsetY: 0/, "ground collider uses the canonical ground baseline");
assert.match(gameConfigSource, /groundColliderHeight: 32/, "ground collider has an explicit visible-footing height");
assert.match(gameSource, /return triceratopsGameConfig\.world\.groundY/, "player baseline uses the canonical ground Y");
assert.match(gameSource, /this\.player\.setPosition\(triceratopsGameConfig\.world\.playerX, this\.playerBaselineY\(\)\)/, "respawns use the computed player baseline");
assert.match(gameSource, /jumpAirActionUsed/, "air jump upgrades are limited by explicit state");
assert.match(gameSource, /isGrounded\(body/, "movement and action checks use a shared grounded helper");
assert.match(gameSource, /\["smash", "jumpOrSmash", "bossRearRam"\]\.includes/, "smash checks all smash-compatible obstacles");
assert.match(gameSource, /actionClearsObstacle/, "collision resolution uses required action");
assert.match(gameSource, /action === "slide"/, "slide gates overhead obstacles");
assert.match(gameSource, /action === "longJump"/, "long jump gates wide gaps");
assert.match(gameSource, /THAT'S A WRAP!/, "success screen uses wrap copy");
assert.match(gameSource, /GAME OVER/, "failure screen uses simple arcade game-over copy");
assert.match(gameSource, /NEW HIGH SCORE!/, "new high score callout exists");
assert.match(gameSource, /Score\s*<\/span>/, "result screen labels score");
assert.match(gameSource, /High Score\s*<\/span>/, "result screen labels high score");
assert.match(gameSource, /Score not synced - sign in to save your high score\./, "signed-out/local score notice is concise and non-blocking");
assert.match(gameSource, /setLastScore\(detail\.result\.score\)/, "end screens display authoritative result score");
assert.doesNotMatch(gameSource, /setInput\("left"|setInput\("right"|charge/i, "old D-pad and charge behavior is removed");
assert.doesNotMatch(gameSource, /startingHp|hpRemaining|calculateGrade|TriceratopsGrade|this\.hp/, "HP and grades are removed from gameplay renderer");
const resultUiSource = gameSource.match(/<div className="triceratops-game-over">[\s\S]*?\{phase !== "running"/)?.[0] ?? "";
for (const forbiddenLabel of ["Grade", "HP", "Hits Taken", "Smashed", "Frames", "Best Chain", "Rampages", "Finale", "Time"]) {
  assert.doesNotMatch(resultUiSource, new RegExp(forbiddenLabel), `${forbiddenLabel} is not visible in the player-facing result UI`);
}

assert.doesNotMatch(cssSource, /triceratops-control-pad/, "old D-pad control CSS is removed");
assert.match(cssSource, /triceratops-touch-zones/, "mobile invisible half-screen controls are present");
assert.match(cssSource, /triceratops-touch-zone\.is-left:active/, "left touch zone has subtle feedback only while pressed");
assert.match(cssSource, /triceratops-touch-zone\.is-right:active/, "right touch zone has subtle feedback only while pressed");
assert.doesNotMatch(cssSource, /is-jump|is-smash|triceratops-touch-zone span/, "visible jump/smash touch labels are removed");
assert.match(cssSource, /triceratops-result-grid\.is-simple/, "result screen has two-card score/high-score layout");
assert.match(cssSource, /triceratops-new-high/, "new high score styling exists");
assert.match(cssSource, /\.backlot-sync-note[\s\S]*position: relative/, "local score notice participates in result layout");
assert.match(cssSource, /\.backlot-sync-note[\s\S]*pointer-events: none/, "local score notice cannot trap replay/exit taps");
assert.match(cssSource, /triceratops-input-debug/, "staging input debug overlay is styled");
assert.match(gameSource, /getTriceratopsLevelDebugMode/, "level debug mode is gated behind staging-safe query parameters");
assert.match(gameSource, /type LevelDebugSnapshot/, "level debug overlay emits structured scene data");
assert.match(gameSource, /type: "level-debug"/, "level debug uses the scene event bridge");
assert.match(gameSource, /this\.levelTimeline/, "live scene uses the selected normal or showcase level timeline");
assert.match(gameSource, /this\.currentEventType = script\.kind/, "level debug tracks the current spawned event type");
assert.match(gameSource, /checkPitFall/, "pits use real world-geometry fall detection");
assert.match(gameSource, /item\.script\.kind === "pit"\) return/, "pit overlaps are deferred to the fall detector");
assert.match(gameSource, /this\.groundCollider\.active = false/, "pits interrupt the ground collider instead of riding on full-width ground");
assert.match(gameSource, /this\.fallingInPit = true/, "pit state tracks an actual fall before life loss");
assert.match(gameSource, /hasPit/, "level debug reports pit visibility");
assert.match(gameSource, /hasTram/, "level debug reports tram visibility");
assert.match(gameSource, /hasDumpster/, "level debug reports dumpster visibility");
assert.match(gameSource, /hasOneUp/, "level debug reports 1-UP visibility");
assert.match(gameSource, /hasFilmReel/, "level debug reports Film Reel visibility");
assert.match(gameSource, /hasBreakableWall/, "level debug reports breakable wall visibility");
assert.match(gameSource, /hasSlideHazard/, "level debug reports slide hazard visibility");
assert.match(gameSource, /hasBoss/, "level debug reports boss visibility");
assert.match(gameSource, /TRICERATOPS BUILD COMMIT/, "level debug panel renders the served build commit");
assert.match(cssSource, /triceratops-level-debug/, "staging level debug overlay is styled");
assert.match(swSource, /flim-shell-v9-triceratops-traversal-reset/, "service worker cache version is bumped for the Triceratops integration");
assert.match(swSource, /\/backlot\/triceratops\//, "service worker bypasses cached Triceratops assets");
assert.match(swSource, /cache: "no-store"/, "service worker fetches Triceratops assets without stale cache reuse");
assert.match(viteConfigSource, /__FLIM_GIT_COMMIT__/, "Vite exposes build commit to the game debug overlay");
assert.match(viteConfigSource, /VERCEL_GIT_COMMIT_SHA/, "Vite prefers the Vercel commit for staging verification");
assert.match(cssSource, /triceratops-rampage-meter/, "rampage meter UI remains available");
assert.doesNotMatch(gameSource, /triceratops-rampage-button/, "rampage no longer uses a separate UI button");
assert.match(cssSource, /height: 100dvh/, "fullscreen game stage uses dynamic viewport height");
assert.match(cssSource, /max-height: 100dvh/, "fullscreen game stage cannot exceed the visual viewport");
assert.match(cssSource, /max-height: 360px/, "extra-short landscape phones receive compact start-screen typography");
assert.match(cssSource, /min\(8\.4vw, 17dvh\)/, "start title scales by both width and height");

assert.match(gameConfigSource, /overhead-slide-hazard/, "scene includes an obvious overhead slide hazard");
assert.match(gameConfigSource, /Double tap right to slide/, "scene teaches the double-right slide sequence");
assert.match(gameConfigSource, /Golden Film Frame/, "scene includes a special rare pickup");
assert.match(gameConfigSource, /rare pickup/, "scene telegraphs the special pickup");
assert.match(gameConfigSource, /combo-smash-wall/, "scene includes a smash-to-combo obstacle");
assert.match(gameConfigSource, /combo-long-gap/, "scene includes a long-jump combo followup");
assert.match(gameConfigSource, /boss:[\s\S]*Mega Rex Prop/, "scene includes a boss fight configuration");
assert.match(gameConfigSource, /first-striped-barrier/, "scene includes jump-or-smash striped barriers");
assert.match(gameConfigSource, /tour-tram-platform/, "scene includes moving tour tram platforming");
assert.match(gameConfigSource, /one-up-high/, "scene includes a reachable 1-UP pickup");
assert.match(gameSource, /this\.platforms = this\.physics\.add\.group/, "platform physics group is created");
assert.match(gameSource, /this\.physics\.add\.collider\(this\.player, this\.platforms\)/, "player can land on moving platforms");
assert.match(gameSource, /startBossFight/, "boss arena starts from the authored trigger");
assert.match(gameSource, /spawnBossPattern/, "boss fight has authored attack patterns");
assert.match(gameSource, /damageBoss/, "boss weak point can be damaged");
assert.match(gameSource, /requiredAction: "bossRearRam"/, "boss weak point uses rear-ram smash input");
assert.match(gameSource, /Rampage ready! Double tap right/, "rampage readiness is tied to double-right input");
assert.match(gameSource, /const rampageStarted = bridgeRef\.current\?\.activateRampage/, "right double tap attempts rampage before slide");
assert.match(gameConfigSource, /boss:[\s\S]*arenaDistance: 9200/, "boss is moved later than the phone QA traversal lane");
assert.match(gameSource, /object\.setScale\(isLongJumpPit \? 2\.45 : 1\.45, 1\.08\)/, "long-jump pits are visually wider than normal gaps");
assert.match(gameSource, /body\?\.setSize\(isLongJumpPit \? 128 : 74, 12\)/, "long-jump pit physics matches its wider visual lane");

assert.doesNotMatch(audioSource, /"charge"/, "audio engine no longer exposes removed charge sounds");
assert.match(audioSource, /"objectBreak"|"chain"|"rampageStart"|"finale"/, "audio engine exposes rampage and destruction-chain cues");

assert.equal(fullscreenCanvasFits(568, 320), true, "small landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(800, 320), true, "extra-short QA landscape viewport 800x320 fits the game canvas");
assert.equal(fullscreenCanvasFits(844, 340), true, "extra-short QA landscape viewport 844x340 fits the game canvas");
assert.equal(fullscreenCanvasFits(800, 360), true, "QA landscape viewport 800x360 fits the game canvas");
assert.equal(fullscreenCanvasFits(844, 390), true, "modern landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(915, 412), true, "QA landscape viewport 915x412 fits the game canvas");
assert.equal(fullscreenCanvasFits(932, 430), true, "large landscape phone viewport fits the game canvas");
assert.equal(fullscreenCanvasFits(1366, 768), true, "desktop viewport fits the game canvas");
assert.match(orientationSource, /width > snapshot\.height/, "Backlot orientation detection is viewport-dimension first");
assert.match(orientationSource, /visualViewport\?\.addEventListener\("resize"/, "Backlot orientation listens to visual viewport resize");
assert.match(orientationSource, /orientationchange/, "Backlot orientation listens to physical orientation changes");
assert.match(orientationSource, /BACKLOT_ORIENTATION_SETTLE_DELAYS_MS/, "Backlot orientation rechecks settled mobile viewport dimensions after rotation");
assert.match(cssSource, /orientation: portrait/, "portrait phones get a rotate-device gate");
assert.match(gameSource, /forcePortraitGate/, "game can show the rotate gate immediately before React orientation state settles");
assert.match(gameSource, /bridgeRef\.current\?\.setPaused\(true\)/, "landscape-to-portrait transition explicitly pauses the run");
assert.match(gameSource, /bridgeRef\.current\?\.setPaused\(false\)/, "portrait-to-landscape transition explicitly resumes orientation-paused runs");
assert.match(gameSource, /refreshPhaserScale\(\)/, "TRICERATOPS has a shared Phaser resize refresh helper");
assert.match(gameSource, /gameRef\.current\?\.scale\.resize/, "Phaser scale is refreshed after orientation changes");
assert.match(gameSource, /requestAnimationFrame\(refresh\)/, "Phaser resize runs after the browser applies landscape layout");
assert.equal(JSON.parse(manifestSource).orientation, "any", "web PWA manifest does not globally force portrait");
assert.match(gameSource, /activeGame\?\.destroy\(true\)/, "Phaser instance is destroyed during React cleanup");
assert.match(gameSource, /TRICERATOPS_ART_VERSION/, "TRICERATOPS runtime art URLs are versioned to avoid stale PWA/browser cache");

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    score: 2200,
    highScore: 2200,
    newHighScore: true,
    playTimeMs: 58_000,
    distance: 5050,
    livesRemaining: 2,
    objectsSmashed: 5,
    hitsTaken: 1,
    collectibles: 2,
    oneUpsCollected: 1,
    chainsTriggered: 2,
    bestChain: 3,
    rampageActivations: 1,
    finaleDestroyed: true,
  }),
  true,
  "normal result payload is valid",
);

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: true,
    score: 2200,
    highScore: 2100,
    newHighScore: false,
    playTimeMs: 58_000,
    distance: 5050,
    livesRemaining: 2,
    objectsSmashed: 5,
    hitsTaken: 1,
    collectibles: 2,
    oneUpsCollected: 0,
    chainsTriggered: 2,
    bestChain: 3,
    rampageActivations: 1,
    finaleDestroyed: true,
  }),
  false,
  "high score cannot be lower than score in the result contract",
);

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: false,
    score: 500,
    highScore: 900,
    newHighScore: false,
    playTimeMs: 10,
    distance: 900,
    livesRemaining: 0,
    objectsSmashed: 1,
    hitsTaken: 3,
    collectibles: 0,
    oneUpsCollected: 0,
    chainsTriggered: 0,
    bestChain: 0,
    rampageActivations: 0,
    finaleDestroyed: false,
  }),
  false,
  "impossible playtime is rejected",
);

assert.equal(
  validateResultPayload({
    sceneId: "studio-backlot-1",
    completed: false,
    score: 500,
    highScore: 900,
    newHighScore: false,
    playTimeMs: 20_000,
    distance: 900,
    hpRemaining: 0,
    livesRemaining: 0,
    objectsSmashed: 1,
    hitsTaken: 3,
    collectibles: 0,
    oneUpsCollected: 0,
    chainsTriggered: 0,
    bestChain: 0,
    rampageActivations: 0,
    finaleDestroyed: false,
    grade: "D",
  }),
  false,
  "legacy HP and grade fields are rejected",
);

console.log("Backlot TRICERATOPS input, lives, and scoring tests passed.");
