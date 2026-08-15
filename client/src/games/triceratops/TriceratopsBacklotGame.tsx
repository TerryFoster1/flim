import { useEffect, useRef, useState, type PointerEvent } from "react";
import { getBacklotOrientationSnapshot, isBacklotLandscape, subscribeBacklotOrientationChanges, useBacklotOrientation } from "../../backlot/orientation";
import { recordBacklotGameOver, recordBacklotLaunch } from "../../services/backlotService";
import {
  TRICERATOPS_GAME_ID,
  TRICERATOPS_LEVEL_CONFIG_VERSION,
  triceratopsShowcaseTimeline,
  triceratopsGameConfig,
  type TriceratopsResult,
  type TriceratopsRequiredAction,
  type TriceratopsScriptEvent,
} from "./gameConfig";
import { createRetroAudioEngine, type RetroAudioEngine, type TriceratopsSfx } from "./retroAudio";
import "./triceratops.css";

type TriceratopsBacklotGameProps = {
  onNavigate: (path: string) => void;
};

type SceneMessage =
  | { type: "score"; score: number }
  | { type: "rampage"; rampage: RampageState }
  | { type: "level-debug"; snapshot: LevelDebugSnapshot }
  | { type: "ready" }
  | { type: "pause"; paused: boolean }
  | { type: "sfx"; name: TriceratopsSfx }
  | { type: "scene-complete"; result: TriceratopsResult }
  | { type: "game-over"; result: TriceratopsResult };

type GameBridge = {
  normalJump: () => void;
  highJump: () => void;
  startLongJump: () => void;
  endLongJump: () => void;
  hornSmash: () => void;
  startSlide: () => void;
  endSlide: () => void;
  activateRampage: () => boolean;
  startRun: () => void;
  restartRun: () => void;
  pauseRun: () => void;
  setPaused: (paused: boolean) => void;
  getActionState: () => string;
};

type RampageState = {
  meter: number;
  ready: boolean;
  active: boolean;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

type DinoState = "idle" | "run" | "normalJump" | "highJump" | "longJump" | "hornSmash" | "slide" | "hit" | "rampage" | "dead" | "victory";
type TouchZoneName = "left" | "right";
type TouchGestureLabel = "LEFT_SINGLE" | "LEFT_DOUBLE" | "LEFT_DOUBLE_HOLD" | "RIGHT_SINGLE" | "RIGHT_DOUBLE" | "RIGHT_DOUBLE_HOLD";
type TouchGesturePhase = "IDLE" | "FIRST_TAP" | "SECOND_TOUCH" | "SECOND_HOLD" | "RESOLVED";

type InputDebugSnapshot = {
  lastInput: TouchGestureLabel | "NONE";
  tapIntervalMs: number | null;
  holdDurationMs: number | null;
  playerAction: string;
  phase: TouchGesturePhase;
  zone: TouchZoneName | null;
};

type LevelDebugMode = false | "standard" | "showcase";

type LevelDebugSnapshot = {
  buildCommit: string;
  sceneId: string;
  levelConfigVersion: string;
  eventCount: number;
  currentEventType: string;
  worldX: number;
  playerY: number;
  groundY: number;
  hasPit: boolean;
  hasTram: boolean;
  hasDumpster: boolean;
  hasOneUp: boolean;
  hasFilmReel: boolean;
  hasBoss: boolean;
  playerBounds: { x: number; y: number; width: number; height: number } | null;
  spriteBounds: { x: number; y: number; width: number; height: number } | null;
};

type TouchZoneState = {
  phase: TouchGesturePhase;
  firstTapAt: number;
  secondTapAt: number;
  resolveTimer: number | null;
  holdTimer: number | null;
  pointerId: number | null;
  holdAction: "longJump" | "slide" | null;
  holdStartedAt: number;
};

type SceneObject = Phaser.Physics.Arcade.Sprite & {
  script: TriceratopsScriptEvent;
  handled?: boolean;
  destroyedState?: boolean;
};

type JumpAction = "normalJump" | "highJump" | "longJump";

const DINO_STATES: Record<DinoState, number> = {
  idle: 2,
  run: 6,
  normalJump: 3,
  highJump: 3,
  longJump: 3,
  hornSmash: 4,
  slide: 4,
  hit: 2,
  rampage: 4,
  dead: 2,
  victory: 3,
};

const DINO_FRAME_MS: Record<DinoState, number> = {
  idle: 220,
  run: 84,
  normalJump: 125,
  highJump: 108,
  longJump: 118,
  hornSmash: 64,
  slide: 76,
  hit: 150,
  rampage: 60,
  dead: 240,
  victory: 150,
};

const DINO_SHEET_KEY = "triceratops-dino-sheet";
const OBJECT_ATLAS_KEY = "triceratops-object-atlas";
const ASSET_BASE = "/backlot/triceratops";
const DINO_FRAME_BASE: Record<DinoState, number> = {
  idle: 0,
  run: 6,
  normalJump: 12,
  highJump: 12,
  longJump: 12,
  hornSmash: 18,
  slide: 18,
  hit: 24,
  rampage: 18,
  dead: 30,
  victory: 36,
};

const OBJECT_FRAME: Record<TriceratopsScriptEvent["kind"] | "impact_star" | "pixel_dust", number> = {
  jump_obstacle: 0,
  high_barrier: 4,
  long_gap: 5,
  pit: 5,
  overhead_beam: 6,
  striped_barrier: 4,
  tour_tram: 3,
  dumpster: 3,
  smash_camera: 1,
  smash_light: 2,
  smash_crate: 3,
  smash_wall: 4,
  hazard_cable: 5,
  hazard_light: 6,
  collectible: 7,
  film_reel: 7,
  one_up: 7,
  boss_trigger: 8,
  boss_fireball: 5,
  boss_tail_sweep: 4,
  boss_overhead: 6,
  boss_shockwave: 5,
  boss_weak_point: 8,
  finish: 8,
  impact_star: 9,
  pixel_dust: 10,
};

declare const __FLIM_GIT_COMMIT__: string | undefined;

const FLIM_BUILD_COMMIT = typeof __FLIM_GIT_COMMIT__ === "string" ? __FLIM_GIT_COMMIT__ : "local";
const TRICERATOPS_ART_VERSION = "2026-08-14-retro-v4-level-debug";
const TOUCH_DOUBLE_TAP_MS = 310;
const TOUCH_HOLD_AFTER_SECOND_TAP_MS = 210;

function assetUrl(fileName: string) {
  return `${ASSET_BASE}/${fileName}?v=${TRICERATOPS_ART_VERSION}`;
}

function canLogTriceratopsDiagnostics() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return import.meta.env.DEV || host === "localhost" || host === "127.0.0.1" || host === "staging.flim.ca" || host.endsWith(".vercel.app");
}

function isTriceratopsAssetTestMode() {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("triceratopsAssetTest");
}

function isTriceratopsInputDebugMode() {
  if (typeof window === "undefined") return false;
  return canLogTriceratopsDiagnostics() && new URLSearchParams(window.location.search).has("inputDebug");
}

function getTriceratopsLevelDebugMode(): LevelDebugMode {
  if (typeof window === "undefined" || !canLogTriceratopsDiagnostics()) return false;
  const mode = new URLSearchParams(window.location.search).get("levelDebug");
  if (mode === "showcase") return "showcase";
  if (mode === "1" || mode === "true" || mode === "standard") return "standard";
  return false;
}

function logTriceratopsDiagnostic(label: string, payload: Record<string, unknown>) {
  if (!canLogTriceratopsDiagnostics()) return;
  console.info(`[TRICERATOPS] ${label}`, payload);
}

function supportsFullscreen(element: HTMLElement | null) {
  return Boolean(element?.requestFullscreen);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function TriceratopsBacklotGame({ onNavigate }: TriceratopsBacklotGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  const audioRef = useRef<RetroAudioEngine | null>(null);
  const countdownTimersRef = useRef<number[]>([]);
  const gameOverSentRef = useRef(false);
  const pausedByOrientationRef = useRef(false);
  const phaseRef = useRef<"start" | "intro" | "running" | "complete" | "over">("start");
  const pausedRef = useRef(false);
  const touchZonesRef = useRef<Record<TouchZoneName, TouchZoneState>>({
    left: { phase: "IDLE", firstTapAt: 0, secondTapAt: 0, resolveTimer: null, holdTimer: null, pointerId: null, holdAction: null, holdStartedAt: 0 },
    right: { phase: "IDLE", firstTapAt: 0, secondTapAt: 0, resolveTimer: null, holdTimer: null, pointerId: null, holdAction: null, holdStartedAt: 0 },
  });
  const { isPortrait, isLandscape, snapshot: orientationSnapshot } = useBacklotOrientation();
  const levelDebugMode = getTriceratopsLevelDebugMode();
  const [phase, setPhase] = useState<"start" | "intro" | "running" | "complete" | "over">("start");
  const [syncStatus, setSyncStatus] = useState("");
  const [lastScore, setLastScore] = useState(0);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [lastResult, setLastResult] = useState<TriceratopsResult | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [forcePortraitGate, setForcePortraitGate] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);
  const [rampage, setRampage] = useState<RampageState>({ meter: 0, ready: false, active: false });
  const [levelDebugSnapshot, setLevelDebugSnapshot] = useState<LevelDebugSnapshot | null>(null);
  const [inputDebugEvents, setInputDebugEvents] = useState<string[]>([]);
  const [inputDebugSnapshot, setInputDebugSnapshot] = useState<InputDebugSnapshot>({
    lastInput: "NONE",
    tapIntervalMs: null,
    holdDurationMs: null,
    playerAction: "start",
    phase: "IDLE",
    zone: null,
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const engine = createRetroAudioEngine();
    audioRef.current = engine;
    setAudioMuted(engine.isMuted());
    return () => {
      countdownTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      countdownTimersRef.current = [];
      engine.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    document.body.classList.add("triceratops-lock-scroll");
    return () => {
      document.body.classList.remove("triceratops-lock-scroll");
    };
  }, []);

  useEffect(() => {
    setFullscreenAvailable(supportsFullscreen(shellRef.current));
  }, []);

  function refreshPhaserScale() {
    const refresh = () => {
      gameRef.current?.scale.resize(triceratopsGameConfig.world.width, triceratopsGameConfig.world.height);
      gameRef.current?.scale.refresh();
      window.dispatchEvent(new Event("resize"));
    };

    refresh();
    window.requestAnimationFrame(refresh);
    window.setTimeout(refresh, 180);
  }

  useEffect(() => {
    refreshPhaserScale();
  }, [orientationSnapshot.width, orientationSnapshot.height]);

  function pauseForOrientationGate() {
    const activePhase = phaseRef.current;
    if (activePhase === "intro") {
      clearCountdownTimers();
      setCountdown(null);
      setPhase("start");
    }
    if (activePhase === "running" && !pausedRef.current) {
      pausedByOrientationRef.current = true;
      bridgeRef.current?.setPaused(true);
    }
  }

  function resumeAfterOrientationGate() {
    setForcePortraitGate(false);
    if (phaseRef.current === "running" && pausedRef.current && pausedByOrientationRef.current) {
      pausedByOrientationRef.current = false;
      bridgeRef.current?.setPaused(false);
      refreshPhaserScale();
    }
    if (phaseRef.current !== "running") {
      pausedByOrientationRef.current = false;
    }
  }

  useEffect(() => {
    const unsubscribe = subscribeBacklotOrientationChanges(() => {
      const nextSnapshot = getBacklotOrientationSnapshot();
      if (isBacklotLandscape(nextSnapshot)) {
        resumeAfterOrientationGate();
        return;
      }
      setForcePortraitGate(true);
      pauseForOrientationGate();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isPortrait) {
      setForcePortraitGate(true);
      pauseForOrientationGate();
      return;
    }
    if (isLandscape && phase === "running" && paused && pausedByOrientationRef.current) {
      resumeAfterOrientationGate();
    }
    if (isLandscape && phase !== "running") {
      setForcePortraitGate(false);
      pausedByOrientationRef.current = false;
    }
  }, [isPortrait, isLandscape, paused, phase, orientationSnapshot.width, orientationSnapshot.height]);

  useEffect(() => {
    let activeGame: Phaser.Game | null = null;
    let isMounted = true;

    const handleSceneEvent = (event: Event) => {
      const detail = (event as CustomEvent<SceneMessage>).detail;
      if (!detail) return;
      if (detail.type === "ready") return;
      if (detail.type === "score") {
        setLastScore(detail.score);
        return;
      }
      if (detail.type === "rampage") {
        setRampage(detail.rampage);
        return;
      }
      if (detail.type === "level-debug") {
        setLevelDebugSnapshot(detail.snapshot);
        return;
      }
      if (detail.type === "pause") {
        setPaused(detail.paused);
        return;
      }
      if (detail.type === "sfx") {
        audioRef.current?.playSfx(detail.name);
        return;
      }
      if (detail.type === "scene-complete") {
        setPhase("complete");
        setLastScore(detail.result.score);
        recordResult(detail.result);
        return;
      }
      if (detail.type === "game-over") {
        setPhase("over");
        setLastScore(detail.result.score);
        recordResult(detail.result);
      }
    };

    window.addEventListener("triceratops:scene", handleSceneEvent);

    void import("phaser").then((Phaser) => {
      if (!isMounted || !hostRef.current) return;

      class StudioBacklotScene extends Phaser.Scene {
        private player!: Phaser.Physics.Arcade.Sprite;
        private ground!: Phaser.GameObjects.Rectangle;
        private objects!: Phaser.Physics.Arcade.Group;
        private platforms!: Phaser.Physics.Arcade.Group;
        private smashHitbox!: Phaser.GameObjects.Rectangle;
        private bossSprite: Phaser.GameObjects.Sprite | null = null;
        private bossHealth: number = triceratopsGameConfig.boss.health;
        private bossActive = false;
        private bossDefeated = false;
        private bossNextAttackAt = 0;
        private bossWeakPointActive = false;
        private bossHealthText: Phaser.GameObjects.Text | null = null;
        private farLayer!: Phaser.GameObjects.TileSprite;
        private midLayer!: Phaser.GameObjects.TileSprite;
        private foregroundLayer!: Phaser.GameObjects.TileSprite;
        private levelDebugGraphics: Phaser.GameObjects.Graphics | null = null;
        private hudText!: Phaser.GameObjects.Text;
        private livesText!: Phaser.GameObjects.Text;
        private hintText!: Phaser.GameObjects.Text;
        private progressBar!: Phaser.GameObjects.Rectangle;
        private wrapLine!: Phaser.GameObjects.Rectangle;
        private spawnedIds = new Set<string>();
        private distance = 0;
        private score = 0;
        private highScore = 0;
        private newHighScore = false;
        private lives = triceratopsGameConfig.scene.startingLives;
        private hitsTaken = 0;
        private objectsSmashed = 0;
        private collectibles = 0;
        private oneUpsCollected = 0;
        private state: "ready" | "running" | "paused" | "complete" | "over" = "ready";
        private currentDinoState: DinoState = "idle";
        private runStartedAt = 0;
        private lastGroundedAt = 0;
        private jumpAirActionUsed = false;
        private jumpBufferedUntil = 0;
        private jumpBufferedAction: JumpAction = "normalJump";
        private longJumpUntil = 0;
        private smashUntil = 0;
        private smashReadyAt = 0;
        private slideUntil = 0;
        private isSliding = false;
        private invulnerableUntil = 0;
        private activeChainId: string | null = null;
        private activeChainCount = 0;
        private chainExpiresAt = 0;
        private chainsTriggered = 0;
        private bestChain = 0;
        private rampageMeter = 0;
        private rampageUntil = 0;
        private rampageReadyAnnounced = false;
        private rampageActivations = 0;
        private finaleDestroyed = false;
        private currentEventType = "none";
        private lastLevelDebugAt = 0;
        private readonly levelTimeline =
          levelDebugMode === "showcase" ? triceratopsShowcaseTimeline : triceratopsGameConfig.timeline;
        private keys!: {
          space: Phaser.Input.Keyboard.Key;
          up: Phaser.Input.Keyboard.Key;
          w: Phaser.Input.Keyboard.Key;
          x: Phaser.Input.Keyboard.Key;
          k: Phaser.Input.Keyboard.Key;
          down: Phaser.Input.Keyboard.Key;
          s: Phaser.Input.Keyboard.Key;
          shift: Phaser.Input.Keyboard.Key;
          enter: Phaser.Input.Keyboard.Key;
          p: Phaser.Input.Keyboard.Key;
        };

        constructor() {
          super("StudioBacklotScene");
        }

        preload() {
          this.load.spritesheet(DINO_SHEET_KEY, assetUrl("triceratops-dino-sheet.png"), {
            frameWidth: 80,
            frameHeight: 64,
          });
          this.load.spritesheet(OBJECT_ATLAS_KEY, assetUrl("triceratops-object-atlas.png"), {
            frameWidth: 48,
            frameHeight: 64,
          });
          this.load.image("stage-far", assetUrl("triceratops-bg-far.png"));
          this.load.image("stage-mid", assetUrl("triceratops-bg-mid.png"));
          this.load.image("stage-front", assetUrl("triceratops-foreground-tiles.png"));
        }

        create() {
          this.physics.world.setBounds(0, 0, triceratopsGameConfig.world.width, triceratopsGameConfig.world.height);
          this.physics.world.gravity.y = triceratopsGameConfig.world.gravity;
          this.createWorld();
          this.createPlayer();
          this.createHud();
          this.createInput();
          this.logLoadedAssets();
          this.createAssetTestPanel();
          this.createLevelDebugGraphics();
          this.emitLevelDebug(0, true);
          this.physics.world.pause();

          this.events.on("resume", () => this.emitPause(false));
          this.events.on("pause", () => this.emitPause(true));

          bridgeRef.current = {
            normalJump: () => this.requestJump("normalJump"),
            highJump: () => this.requestJump("highJump"),
            startLongJump: () => this.startLongJump(),
            endLongJump: () => this.endLongJump(),
            hornSmash: () => this.requestSmash(),
            startSlide: () => this.startSlide(),
            endSlide: () => this.endSlide(),
            activateRampage: () => this.activateRampage(),
            startRun: () => this.startRun(),
            restartRun: () => this.resetRun(),
            pauseRun: () => this.togglePause(),
            setPaused: (paused) => this.setRunPaused(paused),
            getActionState: () => this.currentDinoState,
          };

          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "ready" } }));
        }

        update(time: number, delta: number) {
          if (this.state !== "running") {
            this.updateDinoAnimation(time);
            return;
          }

          const dt = delta / 1000;
          const speed = this.currentSpeed();
          if (!this.bossActive) this.distance += speed * dt;
          this.spawnScriptedEvents();
          this.updateMovement(time, dt, speed);
          this.updateObjects(dt, speed);
          this.updatePlatforms(dt, speed);
          this.checkPitFall();
          this.updateBossFight(time);
          this.updateRampage(time);
          this.updateDinoAnimation(time);
          this.updateHud();
          this.emitLevelDebug(time);

          if (this.distance >= triceratopsGameConfig.scene.targetDistance && this.bossDefeated) {
            this.sceneComplete();
          }
        }

        private createWorld() {
          const { width, height, groundY, groundColliderOffsetY, groundColliderHeight } = triceratopsGameConfig.world;
          this.farLayer = this.add.tileSprite(width / 2, height / 2, width, height, "stage-far").setDepth(0);
          this.midLayer = this.add.tileSprite(width / 2, height / 2, width, height, "stage-mid").setDepth(2).setAlpha(0.32);
          this.foregroundLayer = this.add.tileSprite(width / 2, groundY + 20, width, 44, "stage-front").setDepth(4).setAlpha(0.92);
          this.add.rectangle(width / 2, groundY + 3, width, 4, 0xf5c16f, 0.18).setDepth(5);
          this.add.text(246, groundY - 92, "DO NOT FEED THE DINOSAUR", {
            color: "#ffe8a9",
            fontFamily: "monospace",
            fontSize: "8px",
            fontStyle: "bold",
          }).setDepth(3).setOrigin(0.5).setAlpha(0.42);
          this.ground = this.add.rectangle(width / 2, groundY + groundColliderOffsetY + groundColliderHeight / 2, width, groundColliderHeight, 0x000000, 0).setDepth(3);
          this.physics.add.existing(this.ground, true);
          this.objects = this.physics.add.group({ allowGravity: false });
          this.platforms = this.physics.add.group({ allowGravity: false, immovable: true });
          this.wrapLine = this.add.rectangle(width - 52, groundY - 28, 2, 84, 0xf5c16f, 0.18).setDepth(6);
        }

        private createPlayer() {
          const { playerX, playerBody } = triceratopsGameConfig.world;
          this.player = this.physics.add.sprite(playerX, this.playerBaselineY(), DINO_SHEET_KEY, DINO_FRAME_BASE.idle).setDepth(12);
          this.player.setCollideWorldBounds(true);
          this.player.setGravityY(triceratopsGameConfig.world.gravity);
          this.player.body?.setSize(playerBody.width, playerBody.height);
          this.player.body?.setOffset(playerBody.offsetX, playerBody.offsetY);
          this.physics.add.collider(this.player, this.ground);
          this.physics.add.collider(this.player, this.platforms);
          this.physics.add.overlap(this.player, this.objects, (_player, item) => this.handleOverlap(item as SceneObject));
          this.smashHitbox = this.add.rectangle(playerX + 44, this.playerBaselineY() - 2, triceratopsGameConfig.attack.hitboxWidth, triceratopsGameConfig.attack.hitboxHeight, 0xffe8a9, 0);
          this.smashHitbox.setDepth(13);
        }

        private playerBaselineY() {
          const { groundY, groundColliderOffsetY, playerBody } = triceratopsGameConfig.world;
          const frameHeight = triceratopsGameConfig.art.characterFrame.height;
          return groundY + groundColliderOffsetY + frameHeight / 2 - playerBody.offsetY - playerBody.height;
        }

        private createHud() {
          this.hudText = this.add.text(14, 12, "", {
            color: "#fff3dc",
            fontFamily: "monospace",
            fontSize: "12px",
            fontStyle: "bold",
          }).setDepth(20).setShadow(2, 2, "#07070a", 0, true, true);
          this.livesText = this.add.text(318, 12, "", {
            color: "#f5c16f",
            fontFamily: "monospace",
            fontSize: "12px",
            fontStyle: "bold",
          }).setDepth(20).setShadow(2, 2, "#07070a", 0, true, true);
          this.hintText = this.add.text(240, 44, "Get ready...", {
            color: "#ffe8a9",
            fontFamily: "monospace",
            fontSize: "13px",
            fontStyle: "bold",
            align: "center",
          }).setDepth(20).setOrigin(0.5, 0).setShadow(2, 2, "#07070a", 0, true, true);
          this.add.rectangle(240, 258, 260, 5, 0x07070a, 0.72).setDepth(20);
          this.progressBar = this.add.rectangle(110, 258, 1, 5, 0xf5c16f, 0.92).setOrigin(0, 0.5).setDepth(21);
          this.updateHud();
        }

        private createInput() {
          const keyboard = this.input.keyboard;
          this.keys = {
            space: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE) as Phaser.Input.Keyboard.Key,
            up: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.UP) as Phaser.Input.Keyboard.Key,
            w: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W) as Phaser.Input.Keyboard.Key,
            x: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.X) as Phaser.Input.Keyboard.Key,
            k: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.K) as Phaser.Input.Keyboard.Key,
            down: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN) as Phaser.Input.Keyboard.Key,
            s: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S) as Phaser.Input.Keyboard.Key,
            shift: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT) as Phaser.Input.Keyboard.Key,
            enter: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER) as Phaser.Input.Keyboard.Key,
            p: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P) as Phaser.Input.Keyboard.Key,
          };
          keyboard?.on("keydown-SPACE", () => this.requestJump("normalJump"));
          keyboard?.on("keydown-UP", () => this.requestJump("highJump"));
          keyboard?.on("keydown-W", () => this.requestJump("highJump"));
          keyboard?.on("keydown-SHIFT", () => this.startLongJump());
          keyboard?.on("keydown-X", () => this.requestSmash());
          keyboard?.on("keydown-K", () => this.requestSmash());
          keyboard?.on("keydown-ENTER", () => this.requestSmash());
          keyboard?.on("keydown-DOWN", () => this.startSlide());
          keyboard?.on("keydown-S", () => this.startSlide());
          keyboard?.on("keyup-SHIFT", () => this.endLongJump());
          keyboard?.on("keyup-DOWN", () => this.endSlide());
          keyboard?.on("keyup-S", () => this.endSlide());
          keyboard?.on("keydown-P", () => this.togglePause());
          keyboard?.on("keydown-ESC", () => this.togglePause());
        }

        private logLoadedAssets() {
          [
            { key: DINO_SHEET_KEY, url: assetUrl("triceratops-dino-sheet.png"), label: "TRICERATOPS_PLAYER_TEXTURE" },
            { key: OBJECT_ATLAS_KEY, url: assetUrl("triceratops-object-atlas.png"), label: "TRICERATOPS_OBJECT_TEXTURE" },
            { key: "stage-far", url: assetUrl("triceratops-bg-far.png"), label: "TRICERATOPS_BACKGROUND_TEXTURE" },
            { key: "stage-mid", url: assetUrl("triceratops-bg-mid.png"), label: "TRICERATOPS_MIDGROUND_TEXTURE" },
            { key: "stage-front", url: assetUrl("triceratops-foreground-tiles.png"), label: "TRICERATOPS_FOREGROUND_TEXTURE" },
          ].forEach((asset) => {
            const texture = this.textures.get(asset.key);
            const source = texture?.source?.[0];
            logTriceratopsDiagnostic("TRICERATOPS_ASSET_LOADED", {
              label: asset.label,
              key: asset.key,
              url: asset.url,
              width: source?.width ?? 0,
              height: source?.height ?? 0,
              artVersion: TRICERATOPS_ART_VERSION,
            });
          });
        }

        private createAssetTestPanel() {
          if (!isTriceratopsAssetTestMode()) return;
          this.add.rectangle(12, 178, 206, 76, 0x07070a, 0.82).setOrigin(0, 0).setDepth(50);
          this.add.text(20, 186, `TRICERATOPS ASSET TEST\n${TRICERATOPS_ART_VERSION}\nDino sheet + atlas loaded`, {
            color: "#ffe8a9",
            fontFamily: "monospace",
            fontSize: "8px",
            fontStyle: "bold",
          }).setDepth(51);
          this.add.image(158, 222, DINO_SHEET_KEY, DINO_FRAME_BASE.run).setDepth(51).setScale(0.9);
          this.add.image(196, 224, OBJECT_ATLAS_KEY, OBJECT_FRAME.smash_camera).setDepth(51);
          logTriceratopsDiagnostic("TRICERATOPS_ASSET_TEST_SCREEN", {
            artVersion: TRICERATOPS_ART_VERSION,
            route: window.location.pathname,
          });
        }

        private startRun() {
          this.resetRun();
          this.state = "running";
          this.physics.world.resume();
          this.runStartedAt = this.time.now;
          this.lastGroundedAt = this.time.now;
          this.hintText.setText("Left tap jumps. Right tap smashes.");
          this.emitSfx("start");
        }

        private resetRun() {
          this.spawnedIds.clear();
          this.distance = 0;
          this.score = 0;
          this.highScore = this.loadHighScore();
          this.newHighScore = false;
          this.lives = triceratopsGameConfig.scene.startingLives;
          this.hitsTaken = 0;
          this.objectsSmashed = 0;
          this.collectibles = 0;
          this.oneUpsCollected = 0;
          this.activeChainId = null;
          this.activeChainCount = 0;
          this.chainExpiresAt = 0;
          this.chainsTriggered = 0;
          this.bestChain = 0;
          this.rampageMeter = 0;
          this.rampageUntil = 0;
          this.rampageReadyAnnounced = false;
          this.rampageActivations = 0;
          this.finaleDestroyed = false;
          this.bossActive = false;
          this.bossDefeated = false;
          this.bossHealth = triceratopsGameConfig.boss.health;
          this.bossNextAttackAt = 0;
          this.bossWeakPointActive = false;
          this.bossSprite?.destroy();
          this.bossSprite = null;
          this.bossHealthText?.destroy();
          this.bossHealthText = null;
          this.state = "ready";
          this.currentDinoState = "idle";
          this.jumpBufferedUntil = 0;
          this.jumpBufferedAction = "normalJump";
          this.jumpAirActionUsed = false;
          this.longJumpUntil = 0;
          this.smashUntil = 0;
          this.smashReadyAt = 0;
          this.slideUntil = 0;
          this.isSliding = false;
          this.invulnerableUntil = 0;
          this.objects.clear(true, true);
          this.platforms.clear(true, true);
          this.player.setPosition(triceratopsGameConfig.world.playerX, this.playerBaselineY());
          this.player.setVelocity(0, 0);
          this.physics.world.pause();
          this.player.setTexture(DINO_SHEET_KEY, DINO_FRAME_BASE.idle);
          this.player.clearTint();
          this.setStandingBody();
          this.updateHud();
          this.emitRampage();
        }

        private requestJump(action: JumpAction) {
          if (this.state !== "running") return;
          if (this.isSliding) return;
          this.jumpBufferedAction = action;
          this.jumpBufferedUntil = this.time.now + triceratopsGameConfig.world.inputBufferMs;
          this.tryJump();
        }

        private startLongJump() {
          if (this.state !== "running") return;
          if (this.isSliding) return;
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          const grounded = this.isGrounded(body);
          if (!grounded && !this.jumpAirActionUsed && (this.currentDinoState === "normalJump" || this.currentDinoState === "highJump")) {
            this.jumpAirActionUsed = true;
            this.longJumpUntil = this.time.now + triceratopsGameConfig.world.longJumpMs;
            this.currentDinoState = "longJump";
            this.player.setVelocityY(Math.min(body?.velocity.y ?? 0, -triceratopsGameConfig.world.longJumpVelocity * 0.72));
            this.emitSfx("jump");
            return;
          }
          this.requestJump("longJump");
        }

        private endLongJump() {
          if (this.state !== "running") return;
          if (this.time.now > this.longJumpUntil - 240) return;
          this.longJumpUntil = Math.max(this.time.now + 140, this.longJumpUntil - 220);
        }

        private requestSmash() {
          if (this.state !== "running") return;
          if (this.isSliding) return;
          const now = this.time.now;
          if (now < this.smashReadyAt) return;
          this.smashUntil = now + triceratopsGameConfig.attack.activeMs;
          this.smashReadyAt = now + triceratopsGameConfig.attack.cooldownMs;
          this.currentDinoState = "hornSmash";
          this.emitSfx("smash");
          this.smashHitbox.setPosition(this.player.x + 48, this.player.y + 8).setAlpha(0.18);
          this.checkSmashCollisions();
        }

        private startSlide() {
          if (this.state !== "running") return;
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          const grounded = this.isGrounded(body);
          if (!grounded) return;
          this.isSliding = true;
          this.slideUntil = this.time.now + triceratopsGameConfig.world.slideMs;
          this.currentDinoState = "slide";
          this.setSlideBody();
          this.emitSfx("smash");
        }

        private endSlide() {
          if (!this.isSliding) return;
          this.isSliding = false;
          this.slideUntil = 0;
          this.currentDinoState = "run";
          this.setStandingBody();
        }

        private tryJump() {
          const now = this.time.now;
          if (this.jumpBufferedUntil < now) return;
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          const grounded = this.isGrounded(body);
          const withinCoyote = now - this.lastGroundedAt <= triceratopsGameConfig.world.coyoteMs;
          if (!grounded && this.jumpBufferedAction === "highJump" && !this.jumpAirActionUsed && this.currentDinoState === "normalJump") {
            this.player.setVelocityY(-triceratopsGameConfig.world.highJumpVelocity);
            this.jumpAirActionUsed = true;
            this.jumpBufferedUntil = 0;
            this.currentDinoState = "highJump";
            this.emitSfx("jump");
            return;
          }
          if (!grounded && !withinCoyote) return;
          const velocity =
            this.jumpBufferedAction === "highJump"
              ? triceratopsGameConfig.world.highJumpVelocity
              : this.jumpBufferedAction === "longJump"
                ? triceratopsGameConfig.world.longJumpVelocity
                : triceratopsGameConfig.world.normalJumpVelocity;
          this.player.setVelocityY(-velocity);
          this.jumpBufferedUntil = 0;
          this.currentDinoState = this.jumpBufferedAction;
          this.jumpAirActionUsed = false;
          if (this.jumpBufferedAction === "longJump") this.longJumpUntil = now + triceratopsGameConfig.world.longJumpMs;
          this.emitSfx("jump");
        }

        private updateMovement(time: number, dt: number, speed: number) {
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          const grounded = this.isGrounded(body);
          if (this.isSliding && time > this.slideUntil) this.endSlide();
          if (grounded) {
            this.lastGroundedAt = time;
            this.jumpAirActionUsed = false;
            if (!this.isSliding && body.height !== triceratopsGameConfig.world.playerBody.height) this.setStandingBody();
            this.tryJump();
          }
          this.player.x = triceratopsGameConfig.world.playerX;
          this.farLayer.tilePositionX += speed * 0.06 * dt;
          this.midLayer.tilePositionX += speed * 0.36 * dt;
          this.foregroundLayer.tilePositionX += speed * 0.94 * dt;
          this.wrapLine.x = 110 + clamp(this.distance / triceratopsGameConfig.scene.targetDistance, 0, 1) * 260;
          if (time <= this.smashUntil) {
            this.smashHitbox.setPosition(this.player.x + 48, this.player.y + 8).setAlpha(0.18);
            this.checkSmashCollisions();
          } else {
            this.smashHitbox.setAlpha(0);
          }
        }

        private isGrounded(body?: Phaser.Physics.Arcade.Body) {
          return Boolean(body?.blocked.down || body?.touching.down);
        }

        private setStandingBody() {
          const { playerBody } = triceratopsGameConfig.world;
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setSize(playerBody.width, playerBody.height).setOffset(playerBody.offsetX, playerBody.offsetY);
        }

        private setSlideBody() {
          const { slideBody } = triceratopsGameConfig.world;
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setSize(slideBody.width, slideBody.height).setOffset(slideBody.offsetX, slideBody.offsetY);
        }

        private spawnScriptedEvents() {
          const spawnLead = triceratopsGameConfig.world.spawnLeadDistance;
          this.levelTimeline.forEach((script) => {
            if (this.spawnedIds.has(script.id)) return;
            if (this.distance < script.distance - spawnLead) return;
            this.spawnedIds.add(script.id);
            this.spawnScript(script);
          });
        }

        private spawnScript(script: TriceratopsScriptEvent) {
          this.currentEventType = script.kind;
          const { width, groundY } = triceratopsGameConfig.world;
          const frame = OBJECT_FRAME[script.kind];
          let y = groundY - 10;
          if (script.kind === "smash_camera") y = groundY - 18;
          if (script.kind === "smash_light") y = groundY - 38;
          if (script.kind === "smash_crate") y = groundY - 15;
          if (script.kind === "smash_wall") y = groundY - 27;
          if (script.kind === "striped_barrier") y = groundY - 25;
          if (script.kind === "tour_tram") y = groundY - (script.platform ? 34 : 24);
          if (script.kind === "dumpster") y = groundY - 26;
          if (script.kind === "collectible" || script.kind === "film_reel") y = script.telegraph === "rare pickup" ? groundY - 118 : groundY - 70;
          if (script.kind === "one_up") y = groundY - 92;
          if (script.kind === "hazard_cable") y = groundY - 9;
          if (script.kind === "hazard_light") y = groundY - 62;
          if (script.kind === "high_barrier") y = groundY - 30;
          if (script.kind === "long_gap" || script.kind === "pit") y = groundY - 5;
          if (script.kind === "overhead_beam") y = groundY - 58;
          if (script.kind === "boss_trigger") y = groundY - 35;
          if (script.kind === "boss_fireball") y = groundY - 48;
          if (script.kind === "boss_tail_sweep" || script.kind === "boss_shockwave") y = groundY - 14;
          if (script.kind === "boss_overhead") y = groundY - 58;
          if (script.kind === "boss_weak_point") y = groundY - 34;
          if (script.kind === "finish") y = groundY - 27;
          const group = script.platform ? this.platforms : this.objects;
          const object = group.create(width + 60, y, OBJECT_ATLAS_KEY, frame) as SceneObject;
          object.script = script;
          object.setDepth(script.kind === "collectible" || script.kind === "film_reel" || script.kind === "one_up" ? 9 : script.kind === "overhead_beam" || script.kind === "boss_overhead" ? 11 : 5);
          object.setImmovable(true);
          if (script.requiredAction === "normalJump" || script.requiredAction === "highJump" || script.requiredAction === "longJump") object.setTint(0xff6978);
          if (script.requiredAction === "slide") object.setTint(0x91d8ff);
          if (script.requiredAction === "smash" || script.requiredAction === "jumpOrSmash" || script.requiredAction === "bossRearRam") object.setTint(script.finale ? 0xffe8a9 : 0xf5c16f);
          if (script.requiredAction === "collect") object.setTint(0x9fffd2);
          if (script.finale) object.setScale(1.1);
          if (script.telegraph === "rare pickup") object.setTint(0xffe8a9).setScale(1.18);
          if (script.kind === "long_gap" || script.kind === "pit") object.setScale(1.7, 1);
          if (script.kind === "tour_tram") object.setScale(script.platform ? 1.75 : 1.35, 0.82);
          if (script.kind === "dumpster") object.setScale(1.25, 0.78);
          if (script.kind === "striped_barrier") object.setScale(0.95, 0.85);
          if (script.kind === "boss_trigger") object.setAlpha(0.18).setScale(0.5, 1);
          if (script.kind === "boss_fireball") object.setTint(0xff7744).setScale(0.8);
          if (script.kind === "boss_tail_sweep" || script.kind === "boss_shockwave") object.setTint(0xff6978).setScale(1.45, 0.56);
          if (script.kind === "boss_weak_point") object.setTint(0xffe8a9).setScale(1.05);
          const body = object.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setAllowGravity(false);
          if (script.kind === "jump_obstacle") body?.setSize(30, 13).setOffset(8, 12);
          if (script.kind === "high_barrier") body?.setSize(34, 42).setOffset(7, 12);
          if (script.kind === "long_gap" || script.kind === "pit") body?.setSize(90, 10).setOffset(0, 38);
          if (script.kind === "overhead_beam") body?.setSize(54, 22).setOffset(0, 8);
          if (script.kind === "striped_barrier") body?.setSize(34, 32).setOffset(7, 18);
          if (script.kind === "tour_tram") body?.setSize(script.platform ? 70 : 54, 24).setOffset(0, script.platform ? 28 : 26);
          if (script.kind === "dumpster") body?.setSize(52, 24).setOffset(0, 28);
          if (script.kind === "smash_camera") body?.setSize(34, 25).setOffset(7, 10);
          if (script.kind === "smash_light") body?.setSize(28, 44).setOffset(10, 11);
          if (script.kind === "smash_crate") body?.setSize(30, 25).setOffset(8, 10);
          if (script.kind === "smash_wall") body?.setSize(34, 46).setOffset(7, 8);
          if (script.kind === "hazard_cable") body?.setSize(38, 10).setOffset(5, 15);
          if (script.kind === "hazard_light") body?.setSize(30, 42).setOffset(9, 13);
          if (script.kind === "collectible" || script.kind === "film_reel") body?.setSize(20, 20).setOffset(7, 8);
          if (script.kind === "one_up") body?.setSize(20, 20).setOffset(7, 8);
          if (script.kind === "boss_trigger") body?.setSize(18, 58).setOffset(15, 3);
          if (script.kind === "boss_fireball") body?.setSize(28, 22).setOffset(9, 18);
          if (script.kind === "boss_tail_sweep" || script.kind === "boss_shockwave") body?.setSize(62, 18).setOffset(0, 30);
          if (script.kind === "boss_overhead") body?.setSize(54, 22).setOffset(0, 8);
          if (script.kind === "boss_weak_point") body?.setSize(32, 38).setOffset(8, 12);
          if (script.kind === "finish") body?.setSize(12, 52).setOffset(18, 6);
          if (script.tutorial) this.showHint(script.tutorial, 2600);
        }

        private updateObjects(dt: number, speed: number) {
          const travel = speed * dt;
          this.objects.getChildren().forEach((child) => {
            const object = child as SceneObject;
            object.x -= travel;
            if (object.script.kind === "collectible" || object.script.kind === "film_reel" || object.script.kind === "one_up") object.angle += 220 * dt;
            if (object.x < -80) object.destroy();
          });
        }

        private updatePlatforms(dt: number, speed: number) {
          const travel = speed * dt;
          this.platforms.getChildren().forEach((child) => {
            const platform = child as SceneObject;
            const movingBoost = platform.script.moving === "fast" ? 26 : platform.script.moving === "slow" ? 12 : 0;
            platform.x -= travel + movingBoost * dt;
            if (platform.script.moving) platform.y += Math.sin((this.time.now + platform.x * 8) / 360) * 0.18;
            if (platform.x < -100) platform.destroy();
          });
        }

        private checkPitFall() {
          if (this.state !== "running") return;
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          if (!body || !this.isGrounded(body)) return;
          const playerFeetX = body.center.x;
          const pit = this.objects.getChildren().find((child) => {
            const item = child as SceneObject;
            if (item.handled || item.script.kind !== "pit") return false;
            const bounds = item.getBounds();
            return playerFeetX >= bounds.left + 8 && playerFeetX <= bounds.right - 8;
          }) as SceneObject | undefined;
          if (pit) this.loseLife(pit, "Hold the second left tap to clear pits");
        }

        private isRampageActive() {
          return this.rampageUntil > this.time.now;
        }

        private currentSpeed() {
          const longJumpMultiplier = this.time.now <= this.longJumpUntil ? triceratopsGameConfig.world.longJumpSpeedMultiplier : 1;
          return triceratopsGameConfig.world.baseSpeed * longJumpMultiplier * (this.isRampageActive() ? triceratopsGameConfig.rampage.speedMultiplier : 1);
        }

        private addRampage(amount: number) {
          if (this.isRampageActive()) return;
          const previous = this.rampageMeter;
          this.rampageMeter = clamp(this.rampageMeter + amount, 0, triceratopsGameConfig.rampage.max);
          if (previous < triceratopsGameConfig.rampage.max && this.rampageMeter >= triceratopsGameConfig.rampage.max && !this.rampageReadyAnnounced) {
            this.rampageReadyAnnounced = true;
            this.showHint("Rampage ready! Double tap right", 1800);
            this.emitSfx("rampageReady");
          }
          this.emitRampage();
        }

        private activateRampage() {
          if (this.state !== "running") return false;
          if (this.isRampageActive() || this.rampageMeter < triceratopsGameConfig.rampage.max) return false;
          this.rampageMeter = triceratopsGameConfig.rampage.max;
          this.rampageUntil = this.time.now + triceratopsGameConfig.rampage.durationMs;
          this.rampageReadyAnnounced = false;
          this.rampageActivations += 1;
          this.cameras.main.flash(120, 255, 232, 169, false);
          this.showHint("RAMPAGE! Actions hit harder!", 1800);
          this.emitSfx("rampageStart");
          this.emitRampage();
          return true;
        }

        private updateRampage(time: number) {
          if (!this.rampageUntil) return;
          const remainingMs = Math.max(0, this.rampageUntil - time);
          this.rampageMeter = (remainingMs / triceratopsGameConfig.rampage.durationMs) * triceratopsGameConfig.rampage.max;
          if (remainingMs <= 0) {
            this.rampageUntil = 0;
            this.rampageMeter = 0;
            this.emitSfx("rampageEnd");
          }
          this.emitRampage();
        }

        private emitRampage() {
          window.dispatchEvent(
            new CustomEvent<SceneMessage>("triceratops:scene", {
              detail: {
                type: "rampage",
                rampage: {
                  meter: clamp(this.rampageMeter, 0, triceratopsGameConfig.rampage.max),
                  ready: this.rampageMeter >= triceratopsGameConfig.rampage.max,
                  active: this.isRampageActive(),
                },
              },
            }),
          );
        }

        private handleOverlap(item: SceneObject) {
          if (this.state !== "running" || item.handled) return;
          if (item.script.kind === "boss_trigger") {
            this.startBossFight();
            item.destroy();
            return;
          }
          if (item.script.kind === "collectible" || item.script.kind === "film_reel") return this.collectSceneItem(item);
          if (item.script.kind === "one_up") return this.collectOneUp(item);
          if (item.script.kind === "finish") {
            if (this.bossDefeated) this.sceneComplete();
            return;
          }
          if (item.script.requiredAction === "smash" || item.script.requiredAction === "jumpOrSmash" || item.script.requiredAction === "bossRearRam") {
            if (this.isRampageActive() && item.script.kind !== "boss_weak_point") this.smashObject(item);
            else if (this.time.now <= this.smashUntil) this.smashObject(item);
            else this.bumpBreakable(item);
            return;
          }
          if (this.actionClearsObstacle(item)) return this.completeActionObstacle(item);
          this.loseLife(item, this.actionHint(item.script.requiredAction));
        }

        private checkSmashCollisions() {
          const hitbox = this.smashHitbox.getBounds();
          this.objects.getChildren().forEach((child) => {
            const item = child as SceneObject;
            if (item.handled) return;
            if (!["smash", "jumpOrSmash", "bossRearRam"].includes(item.script.requiredAction)) return;
            if (Phaser.Geom.Intersects.RectangleToRectangle(hitbox, item.getBounds())) this.smashObject(item);
          });
        }

        private actionClearsObstacle(item: SceneObject) {
          const action = item.script.requiredAction;
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          const airborne = !this.isGrounded(body);
          const clearance = triceratopsGameConfig.world.groundY - this.player.y;
          if (action === "normalJump") return airborne || clearance > 18;
          if (action === "highJump") return airborne && (this.currentDinoState === "highJump" || clearance > 48);
          if (action === "longJump") return airborne && this.time.now <= this.longJumpUntil;
          if (action === "jumpOrSmash") return this.time.now <= this.smashUntil || airborne || clearance > 18 || this.isRampageActive();
          if (action === "stomp") return airborne && body.velocity.y > 40;
          if (action === "slide") return this.isSliding;
          if (action === "avoid") return false;
          return false;
        }

        private completeActionObstacle(item: SceneObject) {
          if (item.handled) return;
          item.handled = true;
          const action = item.script.requiredAction;
          const points =
            action === "highJump"
              ? triceratopsGameConfig.scoring.highJump
              : action === "longJump"
                ? triceratopsGameConfig.scoring.longJump
                : action === "jumpOrSmash"
                  ? triceratopsGameConfig.scoring.smashSmall
                  : action === "stomp"
                    ? triceratopsGameConfig.scoring.smashMedium
                : action === "slide"
                  ? triceratopsGameConfig.scoring.slide
                  : triceratopsGameConfig.scoring.normalJump;
          this.addScore(item.script.points ?? points);
          this.popScore(item.x, item.y - 18, `+${item.script.points ?? points}`);
          this.emitSfx(action === "slide" ? "smash" : "jump");
          item.destroy();
        }

        private collectSceneItem(item: SceneObject) {
          if (item.handled) return;
          item.handled = true;
          this.collectibles += 1;
          const points = item.script.points ?? triceratopsGameConfig.scoring.collectible;
          this.addScore(points);
          this.addRampage(triceratopsGameConfig.rampage.perCollectible);
          this.popScore(item.x, item.y - 16, `+${points}`);
          this.emitSfx("collect");
          item.destroy();
        }

        private collectOneUp(item: SceneObject) {
          if (item.handled) return;
          item.handled = true;
          this.oneUpsCollected += 1;
          if (this.lives < triceratopsGameConfig.scene.maxLives) this.lives += 1;
          const points = item.script.points ?? triceratopsGameConfig.scoring.oneUp;
          this.addScore(points);
          this.popScore(item.x, item.y - 16, "1-UP");
          this.emitSfx("collect");
          item.destroy();
          this.updateHud();
        }

        private actionHint(action: TriceratopsRequiredAction) {
          if (action === "highJump") return "Double tap left for high jumps";
          if (action === "longJump") return "Hold the second left tap for long jumps";
          if (action === "jumpOrSmash") return "Jump or tap right to smash striped barriers";
          if (action === "bossRearRam") return "Smash the glowing rear mark";
          if (action === "stomp") return "Land on top for a stomp";
          if (action === "slide") return "Double tap right to slide";
          if (action === "smash") return "Tap right before the prop reaches you";
          if (action === "normalJump") return "Tap left to jump cleanly";
          return "Read the set and pick the right move";
        }

        private smashObject(item: SceneObject) {
          if (item.handled) return;
          item.handled = true;
          this.objectsSmashed += 1;
          const chainCount = this.registerChain(item.script);
          const chainBonus = item.script.chainBonus ?? (chainCount > 1 ? triceratopsGameConfig.scoring.chainBase : 0);
          const basePoints = item.script.points ?? this.defaultSmashPoints(item.script.kind);
          const chainMultiplier = 1 + Math.max(0, chainCount - 1) * triceratopsGameConfig.scoring.chainStepMultiplier;
          const rampageMultiplier = this.isRampageActive() ? triceratopsGameConfig.rampage.scoreMultiplier : 1;
          const points = Math.round((basePoints + chainBonus) * chainMultiplier * rampageMultiplier);
          if (item.script.finale) this.finaleDestroyed = true;
          if (item.script.kind === "boss_weak_point") this.damageBoss(item);
          this.addScore(points);
          this.addRampage(triceratopsGameConfig.rampage.perSmash + (chainCount > 1 ? triceratopsGameConfig.rampage.chainBonus : 0));
          item.setTint(0xffe8a9);
          item.setVelocity(0, -60);
          item.setAngularVelocity(420);
          const body = item.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setEnable(false);
          this.cameras.main.shake(105, 0.006);
          this.cameras.main.flash(70, 255, 226, 168, false);
          this.popScore(item.x, item.y - 22, chainCount > 1 ? `CHAIN x${chainCount} +${points}` : `+${points}`);
          this.emitSfx(item.script.finale ? "finale" : chainCount > 1 ? "chain" : "objectBreak");
          this.spawnImpact(item.x + 8, item.y - 8);
          this.triggerNearbyChain(item);
          this.time.delayedCall(160, () => item.destroy());
        }

        private defaultSmashPoints(kind: TriceratopsScriptEvent["kind"]) {
          if (kind === "smash_wall") return triceratopsGameConfig.scoring.smashMajor;
          if (kind === "striped_barrier" || kind === "tour_tram" || kind === "dumpster" || kind === "boss_weak_point") return triceratopsGameConfig.scoring.smashMajor;
          if (kind === "smash_camera" || kind === "smash_light" || kind === "smash_crate") return triceratopsGameConfig.scoring.smashMedium;
          return triceratopsGameConfig.scoring.smashSmall;
        }

        private registerChain(script: TriceratopsScriptEvent) {
          const now = this.time.now;
          if (!script.chainId) {
            this.activeChainId = null;
            this.activeChainCount = 1;
            this.chainExpiresAt = 0;
            return 1;
          }
          if (this.activeChainId !== script.chainId || now > this.chainExpiresAt) {
            this.activeChainId = script.chainId;
            this.activeChainCount = 0;
            this.chainsTriggered += 1;
          }
          this.activeChainCount += 1;
          this.bestChain = Math.max(this.bestChain, this.activeChainCount);
          this.chainExpiresAt = now + 1500;
          return this.activeChainCount;
        }

        private triggerNearbyChain(source: SceneObject) {
          if (!source.script.chainId) return;
          this.time.delayedCall(90, () => {
            this.objects.getChildren().forEach((child) => {
              const item = child as SceneObject;
              if (item.handled || item === source) return;
              if (item.script.chainId !== source.script.chainId) return;
              if (Math.abs(item.x - source.x) > 168) return;
              this.smashObject(item);
            });
          });
        }

        private bumpBreakable(item: SceneObject) {
          if (item.handled) return;
          item.handled = true;
          item.setTint(0x9aa0ad);
          item.setVelocity(-18, -24);
          item.setAngularVelocity(180);
          const body = item.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setEnable(false);
          this.cameras.main.shake(55, 0.003);
          this.popScore(item.x, item.y - 22, "MISS");
          this.showHint("Smash props for points", 1200);
          this.time.delayedCall(120, () => item.destroy());
        }

        private loseLife(item: SceneObject, hint: string) {
          const now = this.time.now;
          if (now < this.invulnerableUntil) return;
          item.handled = true;
          this.lives -= 1;
          this.hitsTaken += 1;
          this.invulnerableUntil = now + triceratopsGameConfig.scene.respawnInvulnerabilityMs;
          this.currentDinoState = "hit";
          this.player.setTint(0xff6978);
          this.cameras.main.shake(140, 0.008);
          this.showHint(hint, 1800);
          this.emitSfx("damage");
          this.time.delayedCall(210, () => {
            if (this.state === "running") this.player.clearTint();
          });
          item.destroy();
          this.updateHud();
          if (this.lives <= 0) {
            this.time.delayedCall(220, () => this.gameOver());
          } else {
            this.time.delayedCall(360, () => this.respawnAtCheckpoint());
          }
        }

        private latestCheckpoint() {
          return triceratopsGameConfig.scene.checkpoints.reduce((best, checkpoint) => (checkpoint <= this.distance ? checkpoint : best), 0);
        }

        private respawnAtCheckpoint() {
          if (this.state !== "running") return;
          const checkpoint = this.latestCheckpoint();
          this.distance = checkpoint;
          this.spawnedIds.clear();
          this.levelTimeline.forEach((script) => {
            if (script.distance < checkpoint - 120) this.spawnedIds.add(script.id);
          });
          this.objects.clear(true, true);
          this.platforms.clear(true, true);
          this.clearBossState();
          this.player.setPosition(triceratopsGameConfig.world.playerX, this.playerBaselineY());
          this.player.setVelocity(0, 0);
          this.player.clearTint();
          this.setStandingBody();
          this.isSliding = false;
          this.slideUntil = 0;
          this.longJumpUntil = 0;
          this.smashUntil = 0;
          this.jumpBufferedUntil = 0;
          this.jumpAirActionUsed = false;
          this.currentDinoState = "run";
          this.showHint("Back to checkpoint", 1100);
          this.cameras.main.flash(100, 255, 232, 169, false);
          if (checkpoint >= triceratopsGameConfig.boss.arenaDistance - 80) {
            this.time.delayedCall(240, () => {
              if (this.state === "running") this.startBossFight();
            });
          }
        }

        private clearBossState() {
          this.bossActive = false;
          this.bossHealth = triceratopsGameConfig.boss.health;
          this.bossNextAttackAt = 0;
          this.bossWeakPointActive = false;
          this.bossSprite?.destroy();
          this.bossSprite = null;
          this.bossHealthText?.destroy();
          this.bossHealthText = null;
        }

        private startBossFight() {
          if (this.bossActive || this.bossDefeated) return;
          this.objects.clear(true, true);
          this.platforms.clear(true, true);
          this.distance = triceratopsGameConfig.boss.arenaDistance;
          this.bossActive = true;
          this.bossHealth = triceratopsGameConfig.boss.health;
          this.bossNextAttackAt = this.time.now + 850;
          this.bossWeakPointActive = false;
          this.wrapLine.setAlpha(0.34);
          this.bossSprite = this.add
            .sprite(triceratopsGameConfig.world.width - 74, triceratopsGameConfig.world.groundY - 48, OBJECT_ATLAS_KEY, OBJECT_FRAME.smash_wall)
            .setDepth(10)
            .setScale(2.15)
            .setTint(0x6f5cff);
          this.bossHealthText = this.add
            .text(triceratopsGameConfig.world.width - 156, 34, "", {
              color: "#ffe8a9",
              fontFamily: "monospace",
              fontSize: "10px",
              fontStyle: "bold",
            })
            .setDepth(22)
            .setShadow(2, 2, "#07070a", 0, true, true);
          this.updateBossHud();
          this.showHint("Mega Rex Prop! Dodge, then rear ram.", 2200);
          this.emitSfx("rampageReady");
        }

        private updateBossFight(time: number) {
          if (!this.bossActive || this.bossDefeated) return;
          if (this.bossSprite) {
            this.bossSprite.y = triceratopsGameConfig.world.groundY - 48 + Math.sin(time / 220) * 3;
            this.bossSprite.angle = Math.sin(time / 360) * 2;
          }
          if (time < this.bossNextAttackAt) return;
          this.spawnBossPattern(time);
          this.bossNextAttackAt = time + triceratopsGameConfig.boss.attackIntervalMs;
        }

        private spawnBossPattern(time: number) {
          const attackIndex = Math.floor(time / triceratopsGameConfig.boss.attackIntervalMs) % 4;
          const attack =
            attackIndex === 0
              ? { kind: "boss_fireball" as const, requiredAction: "normalJump" as const, label: "Pyro fireball", telegraph: "jump" }
              : attackIndex === 1
                ? { kind: "boss_overhead" as const, requiredAction: "slide" as const, label: "Falling rig", telegraph: "slide" }
                : attackIndex === 2
                  ? { kind: "boss_tail_sweep" as const, requiredAction: "highJump" as const, label: "Tail sweep", telegraph: "high jump" }
                  : { kind: "boss_shockwave" as const, requiredAction: "normalJump" as const, label: "Ground shockwave", telegraph: "jump" };
          this.spawnScript({
            id: `boss-attack-${Math.round(time)}`,
            kind: attack.kind,
            category: attack.requiredAction === "slide" ? "slide" : attack.requiredAction === "highJump" ? "highJump" : "normalJump",
            requiredAction: attack.requiredAction,
            distance: this.distance,
            label: attack.label,
            points: attack.requiredAction === "highJump" ? triceratopsGameConfig.scoring.highJump : triceratopsGameConfig.scoring.normalJump,
            telegraph: attack.telegraph,
          });
          if (attackIndex === 3 || this.bossHealth <= 2) this.spawnBossWeakPoint(time);
        }

        private spawnBossWeakPoint(time: number) {
          if (this.bossWeakPointActive || this.bossDefeated) return;
          this.bossWeakPointActive = true;
          this.spawnScript({
            id: `boss-weak-point-${Math.round(time)}`,
            kind: "boss_weak_point",
            category: "smash",
            requiredAction: "bossRearRam",
            distance: this.distance,
            label: "Glowing rear weak point",
            points: 600,
            telegraph: "rear ram",
          });
          this.showHint("Weak point! Smash the rear mark!", 1200);
          this.time.delayedCall(triceratopsGameConfig.boss.weakPointWindowMs, () => {
            this.bossWeakPointActive = false;
          });
        }

        private damageBoss(item: SceneObject) {
          if (!this.bossActive || this.bossDefeated) return;
          this.bossWeakPointActive = false;
          this.bossHealth = Math.max(0, this.bossHealth - 1);
          this.updateBossHud();
          this.cameras.main.shake(150, 0.009);
          this.bossSprite?.setTint(0xffe8a9);
          this.time.delayedCall(120, () => {
            if (this.bossSprite && this.bossActive) this.bossSprite.setTint(0x6f5cff);
          });
          if (this.bossHealth > 0) {
            this.showHint(`${triceratopsGameConfig.boss.name} reels! ${this.bossHealth} hits left.`, 1400);
            return;
          }
          this.bossDefeated = true;
          this.bossActive = false;
          this.finaleDestroyed = true;
          this.addScore(triceratopsGameConfig.boss.clearBonus);
          this.popScore(item.x, item.y - 36, `BOSS +${triceratopsGameConfig.boss.clearBonus}`);
          this.showHint("CUT! Mega Rex collapses!", 1600);
          this.emitSfx("finale");
          this.spawnImpact(this.bossSprite?.x ?? item.x, this.bossSprite?.y ?? item.y);
          this.bossSprite?.setTint(0xff6978);
          this.tweens.add({
            targets: this.bossSprite ?? undefined,
            y: triceratopsGameConfig.world.groundY + 24,
            angle: 18,
            alpha: 0,
            duration: 720,
            ease: "Quad.easeIn",
            onComplete: () => {
              this.clearBossState();
              this.distance = triceratopsGameConfig.scene.targetDistance;
              this.sceneComplete();
            },
          });
        }

        private updateBossHud() {
          if (!this.bossHealthText) return;
          this.bossHealthText.setText(`MEGA REX ${"I".repeat(Math.max(0, this.bossHealth))}`);
        }

        private spawnImpact(x: number, y: number) {
          for (let i = 0; i < 8; i += 1) {
            const star = this.add.image(x, y, OBJECT_ATLAS_KEY, i % 2 ? OBJECT_FRAME.impact_star : OBJECT_FRAME.pixel_dust).setDepth(12);
            star.setScale(i % 2 ? 0.42 : 1);
            this.tweens.add({
              targets: star,
              x: x + this.randomBetween(-22, 28),
              y: y + this.randomBetween(-24, 12),
              alpha: 0,
              duration: 360,
              ease: "Quad.easeOut",
              onComplete: () => star.destroy(),
            });
          }
        }

        private popScore(x: number, y: number, label: string) {
          const text = this.add.text(x, y, label, {
            color: "#ffe8a9",
            fontFamily: "monospace",
            fontSize: "12px",
            fontStyle: "bold",
          }).setDepth(15).setOrigin(0.5);
          this.tweens.add({
            targets: text,
            y: y - 24,
            alpha: 0,
            duration: 720,
            ease: "Quad.easeOut",
            onComplete: () => text.destroy(),
          });
        }

        private addScore(points: number) {
          this.score += points;
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "score", score: this.score } }));
        }

        private showHint(message: string, ms: number) {
          this.hintText.setText(message);
          this.time.delayedCall(ms, () => {
            if (this.state === "running" && this.hintText.text === message) this.hintText.setText("");
          });
        }

        private updateHud() {
          this.hudText.setText(`SCORE ${this.score.toLocaleString()}  HIGH ${this.highScore.toLocaleString()}`);
          this.livesText.setText(`LIVES ${"I".repeat(Math.max(0, this.lives)).padEnd(triceratopsGameConfig.scene.startingLives, "-")}`);
          this.progressBar.width = 260 * clamp(this.distance / triceratopsGameConfig.scene.targetDistance, 0, 1);
        }

        private sceneComplete() {
          if (this.state === "complete" || this.state === "over") return;
          this.state = "complete";
          this.physics.world.pause();
          this.currentDinoState = "victory";
          this.addScore(triceratopsGameConfig.scoring.sceneClear);
          if (this.hitsTaken === 0) this.addScore(triceratopsGameConfig.scoring.noHitBonus);
          if (this.finaleDestroyed) this.addScore(triceratopsGameConfig.scoring.finaleBonus);
          if (this.lives > 0) this.addScore(this.lives * triceratopsGameConfig.scoring.lifeBonus);
          this.updateHighScore();
          this.emitSfx("wrap");
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "scene-complete", result: this.resultPayload(true) } }));
        }

        private gameOver() {
          if (this.state === "over" || this.state === "complete") return;
          this.state = "over";
          this.physics.world.pause();
          this.currentDinoState = "dead";
          this.player.clearTint();
          this.updateHighScore();
          this.emitSfx("cut");
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "game-over", result: this.resultPayload(false) } }));
        }

        private resultPayload(completed: boolean): TriceratopsResult {
          return {
            sceneId: triceratopsGameConfig.scene.sceneId,
            completed,
            score: Math.max(0, Math.round(this.score)),
            highScore: this.highScore,
            newHighScore: this.newHighScore,
            playTimeMs: Math.max(1000, Math.round(this.time.now - this.runStartedAt)),
            distance: Math.round(this.distance),
            livesRemaining: Math.max(0, this.lives),
            objectsSmashed: this.objectsSmashed,
            hitsTaken: this.hitsTaken,
            collectibles: this.collectibles,
            oneUpsCollected: this.oneUpsCollected,
            chainsTriggered: this.chainsTriggered,
            bestChain: this.bestChain,
            rampageActivations: this.rampageActivations,
            finaleDestroyed: this.finaleDestroyed,
          };
        }

        private loadHighScore() {
          const stored = Number(window.localStorage.getItem(triceratopsGameConfig.scene.highScoreStorageKey) ?? 0);
          return Number.isFinite(stored) ? Math.max(0, stored) : 0;
        }

        private updateHighScore() {
          const nextScore = Math.max(0, Math.round(this.score));
          if (nextScore <= this.highScore) return;
          this.highScore = nextScore;
          this.newHighScore = true;
          window.localStorage.setItem(triceratopsGameConfig.scene.highScoreStorageKey, String(nextScore));
        }

        private updateDinoAnimation(time: number) {
          const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
          if (!this.player || !body) return;
          let state = this.currentDinoState;
          if (this.state === "running") {
            if (this.isSliding) state = "slide";
            else if (time <= this.smashUntil) state = "hornSmash";
            else if (this.isRampageActive() && (body.blocked.down || body.touching.down)) state = "rampage";
            else if (body.velocity.y < -20 || body.velocity.y > 20) state = ["normalJump", "highJump", "longJump"].includes(this.currentDinoState) ? this.currentDinoState : "normalJump";
            else if (state !== "hit") state = "run";
          }
          const frames = DINO_STATES[state];
          const frame = Math.floor(time / DINO_FRAME_MS[state]) % frames;
          this.player.setTexture(DINO_SHEET_KEY, DINO_FRAME_BASE[state] + frame);
          if (state === "hit" && time > this.invulnerableUntil - 620) this.currentDinoState = "run";
        }

        private togglePause() {
          this.setRunPaused(this.state !== "paused");
        }

        private setRunPaused(paused: boolean) {
          if (this.state !== "running" && this.state !== "paused") return;
          if (!paused && this.state === "paused") {
            this.state = "running";
            this.scene.resume();
            this.emitPause(false);
          } else if (paused && this.state === "running") {
            this.state = "paused";
            this.scene.pause();
            this.emitPause(true);
          }
        }

        private emitPause(paused: boolean) {
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "pause", paused } }));
        }

        private createLevelDebugGraphics() {
          if (!levelDebugMode) return;
          this.levelDebugGraphics = this.add.graphics().setDepth(60);
          this.drawLevelDebugLines();
        }

        private drawLevelDebugLines() {
          if (!this.levelDebugGraphics) return;
          const { width, groundY } = triceratopsGameConfig.world;
          this.levelDebugGraphics.clear();
          this.levelDebugGraphics.lineStyle(2, 0x9fffd2, 0.86).lineBetween(0, groundY, width, groundY);
          this.levelDebugGraphics.lineStyle(1, 0xff6978, 0.7);
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          if (body) this.levelDebugGraphics.strokeRect(body.x, body.y, body.width, body.height);
          this.levelDebugGraphics.lineStyle(1, 0xf5c16f, 0.72);
          this.objects.getChildren().forEach((child) => {
            const object = child as SceneObject;
            const bounds = object.getBounds();
            this.levelDebugGraphics?.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
          });
          this.platforms.getChildren().forEach((child) => {
            const platform = child as SceneObject;
            const bounds = platform.getBounds();
            this.levelDebugGraphics?.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
          });
        }

        private emitLevelDebug(time = 0, force = false) {
          if (!levelDebugMode) return;
          if (!force && time - this.lastLevelDebugAt < 180) return;
          this.lastLevelDebugAt = time;
          this.drawLevelDebugLines();
          const objects = this.objects.getChildren().map((child) => (child as SceneObject).script.kind);
          const platforms = this.platforms.getChildren().map((child) => (child as SceneObject).script.kind);
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          const spriteBounds = this.player.getBounds();
          const snapshot: LevelDebugSnapshot = {
            buildCommit: FLIM_BUILD_COMMIT,
            sceneId: triceratopsGameConfig.scene.sceneId,
            levelConfigVersion: TRICERATOPS_LEVEL_CONFIG_VERSION,
            eventCount: this.levelTimeline.length,
            currentEventType: this.currentEventType,
            worldX: Math.round(this.distance),
            playerY: Math.round(this.player.y),
            groundY: triceratopsGameConfig.world.groundY,
            hasPit: objects.includes("pit"),
            hasTram: objects.includes("tour_tram") || platforms.includes("tour_tram"),
            hasDumpster: objects.includes("dumpster") || platforms.includes("dumpster"),
            hasOneUp: objects.includes("one_up"),
            hasFilmReel: objects.includes("film_reel"),
            hasBoss: objects.includes("boss_trigger") || Boolean(this.bossActive || this.bossSprite),
            playerBounds: body ? { x: Math.round(body.x), y: Math.round(body.y), width: Math.round(body.width), height: Math.round(body.height) } : null,
            spriteBounds: {
              x: Math.round(spriteBounds.x),
              y: Math.round(spriteBounds.y),
              width: Math.round(spriteBounds.width),
              height: Math.round(spriteBounds.height),
            },
          };
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "level-debug", snapshot } }));
        }

        private emitSfx(name: TriceratopsSfx) {
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "sfx", name } }));
        }

        private randomBetween(min: number, max: number) {
          return Phaser.Math.Between(min, max);
        }
      }

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: triceratopsGameConfig.world.width,
        height: triceratopsGameConfig.world.height,
        backgroundColor: "#07070a",
        pixelArt: true,
        roundPixels: true,
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          width: triceratopsGameConfig.world.width,
          height: triceratopsGameConfig.world.height,
        },
        physics: {
          default: "arcade",
          arcade: {
            debug: false,
            gravity: { x: 0, y: triceratopsGameConfig.world.gravity },
          },
        },
        scene: StudioBacklotScene,
      };

      activeGame = new Phaser.Game(config);
      gameRef.current = activeGame;
      recordBacklotLaunch(TRICERATOPS_GAME_ID).catch(() => undefined);
    });

    return () => {
      isMounted = false;
      window.removeEventListener("triceratops:scene", handleSceneEvent);
      bridgeRef.current = null;
      activeGame?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  async function requestFullscreen() {
    const shell = shellRef.current;
    if (!shell?.requestFullscreen || document.fullscreenElement) return;
    try {
      await shell.requestFullscreen();
    } catch {
      setFullscreenAvailable(false);
    }
  }

  async function requestLandscapeLock() {
    const orientation = window.screen?.orientation as LockableScreenOrientation | undefined;
    if (!orientation?.lock) return;
    try {
      await orientation.lock("landscape");
    } catch {
      // Orientation lock is only an enhancement; physical rotation remains the source of truth.
    }
  }

  function clearCountdownTimers() {
    countdownTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    countdownTimersRef.current = [];
  }

  function recordResult(result: TriceratopsResult) {
    setLastResult(result);
    if (!gameOverSentRef.current) {
      gameOverSentRef.current = true;
      recordBacklotGameOver(TRICERATOPS_GAME_ID, result.score, result.playTimeMs).catch(() => {
        setSyncStatus("Score not synced - sign in to save your high score.");
      });
    }
  }

  function toggleAudio() {
    const engine = audioRef.current;
    if (!engine) return;
    const nextMuted = !engine.isMuted();
    engine.setMuted(nextMuted);
    setAudioMuted(nextMuted);
    if (!nextMuted && phase === "running") void engine.startMusic();
  }

  async function startGame() {
    if (!isLandscape) return;
    clearCountdownTimers();
    gameOverSentRef.current = false;
    setLastResult(null);
    setLastScore(0);
    setRampage({ meter: 0, ready: false, active: false });
    setSyncStatus("");
    setPaused(false);
    setPhase("intro");
    await requestFullscreen();
    await requestLandscapeLock();
    void audioRef.current?.startMusic();
    [
      ["Scene 1", 0],
      ["Studio Backlot", 520],
      ["3", 1180],
      ["2", 1840],
      ["1", 2500],
      ["ACTION!", 3160],
    ].forEach(([label, delay]) => {
      const timer = window.setTimeout(() => setCountdown(String(label)), Number(delay));
      countdownTimersRef.current.push(timer);
    });
    const startTimer = window.setTimeout(() => {
      setCountdown(null);
      setPhase("running");
      bridgeRef.current?.startRun();
    }, 3820);
    countdownTimersRef.current.push(startTimer);
  }

  function restartGame() {
    bridgeRef.current?.restartRun();
    void startGame();
  }

  function exitGame() {
    clearCountdownTimers();
    audioRef.current?.stopMusic();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    }
    (window.screen?.orientation as LockableScreenOrientation | undefined)?.unlock?.();
    onNavigate("/games");
  }

  function vibrate(pattern: number | number[]) {
    window.navigator.vibrate?.(pattern);
  }

  function clearTouchHold(zone: TouchZoneName) {
    const touchZone = touchZonesRef.current[zone];
    if (touchZone.holdTimer !== null) {
      window.clearTimeout(touchZone.holdTimer);
      touchZone.holdTimer = null;
    }
  }

  function clearTouchResolve(zone: TouchZoneName) {
    const touchZone = touchZonesRef.current[zone];
    if (touchZone.resolveTimer !== null) {
      window.clearTimeout(touchZone.resolveTimer);
      touchZone.resolveTimer = null;
    }
  }

  function emitInputDebug(label: TouchGestureLabel, zone: TouchZoneName, startedAt: number, now = window.performance.now(), holdStartedAt = 0) {
    if (!isTriceratopsInputDebugMode()) return;
    const tapIntervalMs = startedAt > 0 ? Math.max(0, Math.round(now - startedAt)) : null;
    const holdDurationMs = holdStartedAt > 0 ? Math.max(0, Math.round(now - holdStartedAt)) : null;
    const phase = touchZonesRef.current[zone].phase;
    const playerAction = bridgeRef.current?.getActionState?.() ?? phaseRef.current;
    const line = `LAST INPUT: ${label} | tap ${tapIntervalMs ?? "-"}ms | hold ${holdDurationMs ?? "-"}ms | action ${playerAction} | phase ${phase}`;
    setInputDebugSnapshot({
      lastInput: label,
      tapIntervalMs,
      holdDurationMs,
      playerAction,
      phase,
      zone,
    });
    setInputDebugEvents((current) => [line, ...current].slice(0, 5));
    console.info(`[TRICERATOPS_INPUT] ${line}`);
  }

  function resetTouchZone(zone: TouchZoneName) {
    const touchZone = touchZonesRef.current[zone];
    clearTouchHold(zone);
    clearTouchResolve(zone);
    touchZone.pointerId = null;
    touchZone.holdAction = null;
    touchZone.phase = "IDLE";
    touchZone.firstTapAt = 0;
    touchZone.secondTapAt = 0;
    touchZone.holdStartedAt = 0;
  }

  function scheduleTouchResolve(zone: TouchZoneName) {
    const touchZone = touchZonesRef.current[zone];
    clearTouchResolve(zone);
    touchZone.resolveTimer = window.setTimeout(() => {
      touchZone.resolveTimer = null;
      if (touchZone.phase === "FIRST_TAP" || touchZone.phase === "RESOLVED") resetTouchZone(zone);
    }, TOUCH_DOUBLE_TAP_MS + 40);
  }

  function handleTouchZoneDown(event: PointerEvent<HTMLButtonElement>, zone: TouchZoneName) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const now = window.performance.now();
    const touchZone = touchZonesRef.current[zone];

    if (touchZone.phase === "SECOND_HOLD") return;

    const isSecondTouch = touchZone.phase === "FIRST_TAP" && touchZone.firstTapAt > 0 && now - touchZone.firstTapAt <= TOUCH_DOUBLE_TAP_MS;
    clearTouchHold(zone);
    touchZone.pointerId = event.pointerId;

    if (!isSecondTouch) {
      resetTouchZone(zone);
      touchZone.phase = "FIRST_TAP";
      touchZone.firstTapAt = now;
      touchZone.pointerId = event.pointerId;
      touchZone.holdAction = null;
      if (zone === "left") {
        bridgeRef.current?.normalJump();
        emitInputDebug("LEFT_SINGLE", zone, now, now);
        vibrate(8);
      } else {
        bridgeRef.current?.hornSmash();
        emitInputDebug("RIGHT_SINGLE", zone, now, now);
        vibrate(10);
      }
      scheduleTouchResolve(zone);
      return;
    }

    clearTouchResolve(zone);
    touchZone.phase = "SECOND_TOUCH";
    touchZone.secondTapAt = now;
    touchZone.holdStartedAt = 0;

    if (zone === "left") {
      touchZone.holdAction = "longJump";
      bridgeRef.current?.highJump();
      emitInputDebug("LEFT_DOUBLE", zone, touchZone.firstTapAt, now);
      vibrate(12);
      touchZone.holdTimer = window.setTimeout(() => {
        touchZone.holdTimer = null;
        touchZone.phase = "SECOND_HOLD";
        touchZone.holdStartedAt = window.performance.now();
        bridgeRef.current?.startLongJump();
        emitInputDebug("LEFT_DOUBLE_HOLD", zone, touchZone.firstTapAt, touchZone.holdStartedAt, touchZone.secondTapAt);
        vibrate(18);
      }, TOUCH_HOLD_AFTER_SECOND_TAP_MS);
      return;
    }

    const rampageStarted = bridgeRef.current?.activateRampage() ?? false;
    touchZone.phase = "SECOND_HOLD";
    touchZone.holdAction = "slide";
    touchZone.holdStartedAt = now;
    if (rampageStarted) {
      emitInputDebug("RIGHT_DOUBLE", zone, touchZone.firstTapAt, now);
      vibrate([18, 28, 22]);
      touchZone.phase = "RESOLVED";
      resetTouchZone(zone);
      return;
    }
    bridgeRef.current?.startSlide();
    emitInputDebug("RIGHT_DOUBLE", zone, touchZone.firstTapAt, now);
    vibrate(18);
  }

  function handleTouchZoneUp(event: PointerEvent<HTMLButtonElement>, zone: TouchZoneName) {
    event.preventDefault();
    const touchZone = touchZonesRef.current[zone];
    clearTouchHold(zone);

    if (touchZone.phase === "SECOND_HOLD") {
      const now = window.performance.now();
      if (touchZone.holdAction === "longJump") bridgeRef.current?.endLongJump();
      if (touchZone.holdAction === "slide") bridgeRef.current?.endSlide();
      emitInputDebug(touchZone.holdAction === "slide" ? "RIGHT_DOUBLE_HOLD" : "LEFT_DOUBLE_HOLD", zone, touchZone.firstTapAt, now, touchZone.holdStartedAt);
      touchZone.phase = "RESOLVED";
      resetTouchZone(zone);
    } else if (touchZone.phase === "SECOND_TOUCH") {
      touchZone.phase = "RESOLVED";
      resetTouchZone(zone);
    }

    touchZone.pointerId = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleTouchZoneCancel(event: PointerEvent<HTMLButtonElement>, zone: TouchZoneName) {
    event.preventDefault();
    const touchZone = touchZonesRef.current[zone];
    if (touchZone.phase === "SECOND_HOLD" && touchZone.holdAction === "longJump") bridgeRef.current?.endLongJump();
    if (touchZone.phase === "SECOND_HOLD" && touchZone.holdAction === "slide") bridgeRef.current?.endSlide();
    resetTouchZone(zone);
  }

  const resultTitle = phase === "complete" ? "THAT'S A WRAP!" : "GAME OVER";

  return (
    <section
      ref={shellRef}
      className={`triceratops-fullscreen ${phase === "running" || phase === "intro" ? "is-running" : ""} ${paused ? "is-paused" : ""}`}
    >
      <div className="triceratops-stage" aria-label="TRICERATOPS playable game">
        <div ref={hostRef} className="triceratops-game-canvas" />

        {isPortrait || forcePortraitGate ? (
          <div className="triceratops-orientation-gate" role="status" aria-live="polite">
            <div className="phone-rotate-icon" aria-hidden="true">
              <span />
            </div>
            <h1>Rotate Your Device</h1>
            <p>TRICERATOPS is built for landscape play. Turn your phone sideways to enter the Backlot.</p>
            <button className="secondary-button compact" onClick={exitGame} type="button">
              Back to Flim Arcade
            </button>
          </div>
        ) : null}

        {!isPortrait && !forcePortraitGate && phase === "start" ? (
          <div className="triceratops-start-screen">
            <button className="triceratops-exit" onClick={exitGame} type="button">
              Exit
            </button>
            <p className="triceratops-kicker">Backlot Arcade</p>
            <h1>TRICERATOPS!</h1>
            <h2>Smash the Studio Backlot</h2>
            <p>Rampage through the movie studio. Smash props, chain set pieces, grab film frames, and survive the finale.</p>
            <div className="triceratops-control-copy">
              <span>Mobile: left tap jumps, double-tap high jumps, hold the second tap long jumps.</span>
              <span>Mobile: right tap smashes, double-tap slides. Full meter double-tap triggers Rampage.</span>
              <span>Desktop: Space jumps. Up/W high jumps. Shift long jumps. X/K smashes. Down/S slides. P pauses.</span>
            </div>
            <div className="triceratops-start-actions">
              <button className="triceratops-play-button" onClick={startGame} type="button">
                Start Game
              </button>
              <button className="triceratops-sound-button" onClick={toggleAudio} type="button">
                {audioMuted ? "Sound Off" : "Sound On"}
              </button>
            </div>
            <div className="triceratops-secondary-actions" aria-label="Scene information">
              <span>Scene 1: Studio Backlot</span>
              <span>3 Lives</span>
              <span>Goal: smash the finale set</span>
            </div>
            {fullscreenAvailable ? <small>Fullscreen starts when supported by your browser.</small> : null}
          </div>
        ) : null}

        {phase === "intro" && countdown ? (
          <div className="triceratops-countdown" role="status" aria-live="assertive">
            <span>{countdown}</span>
          </div>
        ) : null}

        {phase === "running" ? (
          <>
            <button className="triceratops-pause" onClick={() => bridgeRef.current?.pauseRun()} type="button">
              {paused ? "Resume" : "Pause"}
            </button>
            <div className={`triceratops-rampage-meter ${rampage.active ? "is-active" : ""}`} aria-label={`Rampage meter ${Math.round(rampage.meter)} percent`}>
              <span className="triceratops-rampage-fill" style={{ width: `${clamp(rampage.meter, 0, 100)}%` }} />
              <strong>{rampage.active ? "Rampage" : "Rampage Meter"}</strong>
            </div>
            {paused ? (
              <div className="triceratops-pause-menu" role="dialog" aria-modal="true" aria-label="TRICERATOPS pause menu">
                <h2>PAUSED</h2>
                <div className="triceratops-end-actions">
                  <button className="triceratops-play-button" onClick={() => bridgeRef.current?.pauseRun()} type="button">
                    RESUME
                  </button>
                  <button className="triceratops-sound-button" onClick={toggleAudio} type="button">
                    {audioMuted ? "Sound Off" : "Sound On"}
                  </button>
                  <button className="secondary-button compact" onClick={restartGame} type="button">
                    RESTART
                  </button>
                  <button className="secondary-button compact" onClick={exitGame} type="button">
                    EXIT TO BACKLOT
                  </button>
                </div>
              </div>
            ) : null}
            <div className="triceratops-touch-zones" aria-hidden="true">
              <button
                type="button"
                className="triceratops-touch-zone is-left"
                tabIndex={-1}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => handleTouchZoneDown(event, "left")}
                onPointerUp={(event) => handleTouchZoneUp(event, "left")}
                onPointerCancel={(event) => handleTouchZoneCancel(event, "left")}
              />
              <button
                type="button"
                className="triceratops-touch-zone is-right"
                tabIndex={-1}
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => handleTouchZoneDown(event, "right")}
                onPointerUp={(event) => handleTouchZoneUp(event, "right")}
                onPointerCancel={(event) => handleTouchZoneCancel(event, "right")}
              />
            </div>
          </>
        ) : null}

        {(phase === "over" || phase === "complete") && lastResult ? (
          <div className="triceratops-game-over">
            <p className="triceratops-kicker">{phase === "complete" ? "Scene Complete" : "Backlot Busted"}</p>
            <h1>{resultTitle}</h1>
            {lastResult.newHighScore ? <p className="triceratops-new-high">NEW HIGH SCORE!</p> : null}
            <div className="triceratops-result-grid is-simple">
              <span>
                <strong>{lastResult.score.toLocaleString()}</strong>
                Score
              </span>
              <span>
                <strong>{lastResult.highScore.toLocaleString()}</strong>
                High Score
              </span>
            </div>
            <div className="triceratops-end-actions">
              <button className="triceratops-play-button" onClick={restartGame} type="button">
                {phase === "complete" ? "Play Again" : "Try Again"}
              </button>
              <button className="secondary-button compact" onClick={exitGame} type="button">
                Exit to Backlot
              </button>
            </div>
            {syncStatus ? <p className="backlot-sync-note">{syncStatus}</p> : null}
          </div>
        ) : null}

        {phase !== "running" ? <strong className="triceratops-score-readout">{lastScore.toLocaleString()} pts</strong> : null}
        {isTriceratopsInputDebugMode() ? (
          <aside className="triceratops-input-debug" aria-label="TRICERATOPS input debug">
            <strong>Input Debug</strong>
            <span>LAST INPUT: {inputDebugSnapshot.lastInput}</span>
            <span>Tap interval: {inputDebugSnapshot.tapIntervalMs ?? "-"}ms</span>
            <span>Hold duration: {inputDebugSnapshot.holdDurationMs ?? "-"}ms</span>
            <span>Action: {inputDebugSnapshot.playerAction}</span>
            <span>Phase: {inputDebugSnapshot.phase}</span>
            <span>Zone: {inputDebugSnapshot.zone ?? "-"}</span>
            {inputDebugEvents.map((line, index) => (
              <span key={`${line}-${index}`}>{line}</span>
            ))}
          </aside>
        ) : null}
        {levelDebugSnapshot ? (
          <aside className="triceratops-level-debug" aria-label="TRICERATOPS level debug">
            <strong>TRICERATOPS LEVEL DEBUG</strong>
            <span>TRICERATOPS BUILD COMMIT: {levelDebugSnapshot.buildCommit}</span>
            <span>SCENE ID: {levelDebugSnapshot.sceneId}</span>
            <span>LEVEL CONFIG VERSION: {levelDebugSnapshot.levelConfigVersion}</span>
            <span>EVENT COUNT: {levelDebugSnapshot.eventCount}</span>
            <span>CURRENT EVENT TYPE: {levelDebugSnapshot.currentEventType}</span>
            <span>CURRENT WORLD X: {levelDebugSnapshot.worldX}</span>
            <span>PLAYER Y: {levelDebugSnapshot.playerY}</span>
            <span>GROUND Y: {levelDebugSnapshot.groundY}</span>
            <span>PIT: {levelDebugSnapshot.hasPit ? "yes" : "no"}</span>
            <span>TRAM: {levelDebugSnapshot.hasTram ? "yes" : "no"}</span>
            <span>DUMPSTER: {levelDebugSnapshot.hasDumpster ? "yes" : "no"}</span>
            <span>1UP: {levelDebugSnapshot.hasOneUp ? "yes" : "no"}</span>
            <span>FILM REEL: {levelDebugSnapshot.hasFilmReel ? "yes" : "no"}</span>
            <span>BOSS: {levelDebugSnapshot.hasBoss ? "yes" : "no"}</span>
            {levelDebugSnapshot.playerBounds ? (
              <span>
                PLAYER BODY: {levelDebugSnapshot.playerBounds.x},{levelDebugSnapshot.playerBounds.y}{" "}
                {levelDebugSnapshot.playerBounds.width}x{levelDebugSnapshot.playerBounds.height}
              </span>
            ) : null}
            {levelDebugSnapshot.spriteBounds ? (
              <span>
                SPRITE BOUNDS: {levelDebugSnapshot.spriteBounds.x},{levelDebugSnapshot.spriteBounds.y}{" "}
                {levelDebugSnapshot.spriteBounds.width}x{levelDebugSnapshot.spriteBounds.height}
              </span>
            ) : null}
            {levelDebugMode === "showcase" ? (
              <span>SHOWCASE ORDER: barrier / dumpster / Film Reel / 1-UP / tram / pit / slide / wall / boss</span>
            ) : null}
          </aside>
        ) : null}
      </div>
    </section>
  );
}
