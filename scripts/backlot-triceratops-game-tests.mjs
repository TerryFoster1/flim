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

const requiredActions = ["normalJump", "highJump", "longJump", "smash", "slide", "collect", "finish"];
const obstacleKinds = ["high_barrier", "long_gap", "overhead_beam", "smash_wall", "collectible", "one_up", "finish"];

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
assert.match(gameConfigSource, /maxLives: 5/, "life cap supports rare 1-UPs");
assert.match(gameConfigSource, /respawnInvulnerabilityMs/, "checkpoint respawn has invulnerability");
assert.match(gameConfigSource, /highScoreStorageKey/, "local high score persistence is configured");
assert.match(gameConfigSource, /bypassesHazards: false/, "rampage does not bypass pits or overhead hazards");
assert.match(gameConfigSource, /normalJumpVelocity/, "normal jump has distinct tuning");
assert.match(gameConfigSource, /highJumpVelocity/, "high jump has distinct tuning");
assert.match(gameConfigSource, /longJumpVelocity/, "long jump has distinct tuning");
assert.match(gameConfigSource, /longJumpMs: 860/, "long jump has visibly longer airtime");
assert.match(gameConfigSource, /longJumpSpeedMultiplier: 1\.28/, "long jump has visibly longer horizontal reach");
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
assert.match(gameSource, /const TOUCH_HOLD_AFTER_SECOND_TAP_MS = 330/, "second-tap hold detection uses the phone QA threshold");
assert.match(gameSource, /type TouchGesturePhase/, "touch input uses an explicit gesture state machine");
assert.match(gameSource, /"FIRST_TAP" \| "SECOND_TOUCH" \| "SECOND_HOLD"/, "gesture phases distinguish taps from second-tap holds");
assert.match(gameSource, /clearTouchResolve\(zone\)/, "touch resolution timers are centrally cleared");
assert.match(gameSource, /scheduleTouchResolve\(zone\)/, "single taps resolve after the double-tap window");
assert.doesNotMatch(gameSource, /TOUCH_SINGLE_TAP_DELAY_MS/, "old delayed-single constant is removed");
assert.doesNotMatch(gameSource, /clearTouchSingle\(zone\)/, "old single-tap cancellation helper is removed");
assert.match(gameSource, /LEFT_DOUBLE_HOLD/, "input debugger names left double-hold gestures");
assert.match(gameSource, /RIGHT_DOUBLE_HOLD/, "input debugger names right double-hold gestures");
assert.match(gameSource, /isTriceratopsInputDebugMode/, "staging input debugger is gated behind query/debug environment");
assert.match(gameSource, /InputDebugSnapshot/, "staging input debugger keeps structured input state");
assert.match(gameSource, /LAST INPUT:/, "staging input debugger shows the last input");
assert.match(gameSource, /Tap interval:/, "staging input debugger shows tap interval");
assert.match(gameSource, /Hold duration:/, "staging input debugger shows hold duration");
assert.match(gameSource, /getActionState: \(\) => this\.currentDinoState/, "input debugger reads the current player action state");
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
assert.match(gameSource, /this\.player = .*\.setDepth\(12\)/, "dino renders above ground and foreground");
assert.match(gameSource, /this\.ground = .*\.setDepth\(3\)/, "ground stays behind the dino");
assert.match(gameSource, /this\.foregroundLayer = .*\.setDepth\(4\)/, "foreground no longer hides the dino");
assert.match(gameSource, /groundY \+ 41, width, 34, "stage-front"/, "foreground art is lowered below the dino legs");
assert.match(gameConfigSource, /groundColliderOffsetY: 4/, "ground collider is offset to visually align the dino feet");
assert.match(gameConfigSource, /groundColliderHeight: 32/, "ground collider has an explicit visible-footing height");
assert.match(gameSource, /playerBaselineY\(\)/, "player baseline is computed from sprite frame and physics body");
assert.match(gameSource, /this\.player\.setPosition\(triceratopsGameConfig\.world\.playerX, this\.playerBaselineY\(\)\)/, "respawns use the computed player baseline");
assert.match(gameSource, /jumpAirActionUsed/, "air jump upgrades are limited by explicit state");
assert.match(gameSource, /isGrounded\(body/, "movement and action checks use a shared grounded helper");
assert.match(gameSource, /item\.script\.requiredAction !== "smash"/, "smash checks only smash-required obstacles");
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
assert.doesNotMatch(gameSource, /startingHp|hpRemaining|calculateGrade|TriceratopsGrade|this\.hp|CUT!/, "HP, grades, and cut-copy are removed from gameplay renderer");
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
assert.match(cssSource, /triceratops-rampage-meter/, "rampage meter UI remains available");
assert.match(cssSource, /height: 100dvh/, "fullscreen game stage uses dynamic viewport height");
assert.match(cssSource, /max-height: 100dvh/, "fullscreen game stage cannot exceed the visual viewport");
assert.match(cssSource, /max-height: 360px/, "extra-short landscape phones receive compact start-screen typography");
assert.match(cssSource, /min\(8\.4vw, 17dvh\)/, "start title scales by both width and height");

assert.match(gameConfigSource, /slide-second-light/, "scene includes the second object in a slide sequence");
assert.match(gameConfigSource, /Stay low through both/, "scene teaches the two-object slide sequence");
assert.match(gameConfigSource, /Golden Film Frame/, "scene includes a special rare pickup");
assert.match(gameConfigSource, /rare pickup/, "scene telegraphs the special pickup");
assert.match(gameConfigSource, /combo-smash-wall/, "scene includes a smash-to-combo obstacle");
assert.match(gameConfigSource, /combo-long-gap/, "scene includes a long-jump combo followup");
assert.match(gameSource, /object\.setScale\(1\.55, 1\)/, "long gaps are visually wider than normal obstacles");
assert.match(gameSource, /body\?\.setSize\(90, 10\)/, "long gap physics matches its wider visual lane");

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
