import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useBacklotOrientation } from "../../backlot/orientation";
import { recordBacklotGameOver, recordBacklotLaunch } from "../../services/backlotService";
import {
  TRICERATOPS_GAME_ID,
  triceratopsGameConfig,
  type TriceratopsInput,
  type TriceratopsResult,
  type TriceratopsScriptEvent,
} from "./gameConfig";
import { createRetroAudioEngine, type RetroAudioEngine, type TriceratopsSfx } from "./retroAudio";
import "./triceratops.css";

type TriceratopsBacklotGameProps = {
  onNavigate: (path: string) => void;
};

type SceneMessage =
  | { type: "score"; score: number }
  | { type: "ready" }
  | { type: "pause"; paused: boolean }
  | { type: "sfx"; name: TriceratopsSfx }
  | { type: "scene-complete"; result: TriceratopsResult }
  | { type: "game-over"; result: TriceratopsResult };

type GameBridge = {
  setInput: (input: TriceratopsInput, active: boolean) => void;
  startRun: () => void;
  restartRun: () => void;
  pauseRun: () => void;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
  unlock?: () => void;
};

type DinoState = "idle" | "run" | "jump" | "smash" | "hit" | "over" | "victory";

type SceneObject = Phaser.Physics.Arcade.Sprite & {
  script: TriceratopsScriptEvent;
  handled?: boolean;
  destroyedState?: boolean;
};

const DINO_STATES: Record<DinoState, number> = {
  idle: 2,
  run: 6,
  jump: 3,
  smash: 4,
  hit: 2,
  over: 2,
  victory: 3,
};

const DINO_FRAME_MS: Record<DinoState, number> = {
  idle: 220,
  run: 84,
  jump: 125,
  smash: 64,
  hit: 150,
  over: 240,
  victory: 150,
};

const DINO_SHEET_KEY = "triceratops-dino-sheet";
const OBJECT_ATLAS_KEY = "triceratops-object-atlas";
const ASSET_BASE = "/backlot/triceratops";
const DINO_FRAME_BASE: Record<DinoState, number> = {
  idle: 0,
  run: 6,
  jump: 12,
  smash: 18,
  hit: 24,
  over: 30,
  victory: 36,
};

const OBJECT_FRAME: Record<TriceratopsScriptEvent["kind"] | "impact_star" | "pixel_dust", number> = {
  jump_obstacle: 0,
  smash_camera: 1,
  smash_light: 2,
  smash_crate: 3,
  smash_wall: 4,
  hazard_cable: 5,
  hazard_light: 6,
  collectible: 7,
  finish: 8,
  impact_star: 9,
  pixel_dust: 10,
};

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
  const { isPortrait, isLandscape, snapshot: orientationSnapshot } = useBacklotOrientation();
  const [phase, setPhase] = useState<"start" | "intro" | "running" | "complete" | "over">("start");
  const [syncStatus, setSyncStatus] = useState("");
  const [lastScore, setLastScore] = useState(0);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [lastResult, setLastResult] = useState<TriceratopsResult | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

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

  useEffect(() => {
    if (isPortrait && phase === "intro") {
      clearCountdownTimers();
      setCountdown(null);
      setPhase("start");
    }
    if (isPortrait && phase === "running" && !paused) {
      pausedByOrientationRef.current = true;
      bridgeRef.current?.pauseRun();
    }
    if (isLandscape && phase === "running" && paused && pausedByOrientationRef.current) {
      pausedByOrientationRef.current = false;
      bridgeRef.current?.pauseRun();
      refreshPhaserScale();
    }
    if (isLandscape && phase !== "running") {
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
        private smashHitbox!: Phaser.GameObjects.Rectangle;
        private farLayer!: Phaser.GameObjects.TileSprite;
        private midLayer!: Phaser.GameObjects.TileSprite;
        private foregroundLayer!: Phaser.GameObjects.TileSprite;
        private hudText!: Phaser.GameObjects.Text;
        private hpText!: Phaser.GameObjects.Text;
        private hintText!: Phaser.GameObjects.Text;
        private progressBar!: Phaser.GameObjects.Rectangle;
        private wrapLine!: Phaser.GameObjects.Rectangle;
        private spawnedIds = new Set<string>();
        private distance = 0;
        private score = 0;
        private hp = triceratopsGameConfig.scene.startingHp;
        private hitsTaken = 0;
        private objectsSmashed = 0;
        private collectibles = 0;
        private state: "ready" | "running" | "paused" | "complete" | "over" = "ready";
        private currentDinoState: DinoState = "idle";
        private runStartedAt = 0;
        private lastGroundedAt = 0;
        private jumpBufferedUntil = 0;
        private smashUntil = 0;
        private smashReadyAt = 0;
        private invulnerableUntil = 0;
        private keys!: {
          space: Phaser.Input.Keyboard.Key;
          up: Phaser.Input.Keyboard.Key;
          w: Phaser.Input.Keyboard.Key;
          x: Phaser.Input.Keyboard.Key;
          k: Phaser.Input.Keyboard.Key;
          enter: Phaser.Input.Keyboard.Key;
          p: Phaser.Input.Keyboard.Key;
        };

        constructor() {
          super("StudioBacklotScene");
        }

        preload() {
          this.load.spritesheet(DINO_SHEET_KEY, `${ASSET_BASE}/triceratops-dino-sheet.png`, {
            frameWidth: 80,
            frameHeight: 64,
          });
          this.load.spritesheet(OBJECT_ATLAS_KEY, `${ASSET_BASE}/triceratops-object-atlas.png`, {
            frameWidth: 48,
            frameHeight: 64,
          });
          this.load.image("stage-far", `${ASSET_BASE}/triceratops-bg-far.png`);
          this.load.image("stage-mid", `${ASSET_BASE}/triceratops-bg-mid.png`);
          this.load.image("stage-front", `${ASSET_BASE}/triceratops-foreground-tiles.png`);
        }

        create() {
          this.physics.world.setBounds(0, 0, triceratopsGameConfig.world.width, triceratopsGameConfig.world.height);
          this.physics.world.gravity.y = triceratopsGameConfig.world.gravity;
          this.createWorld();
          this.createPlayer();
          this.createHud();
          this.createInput();
          this.physics.world.pause();

          this.events.on("resume", () => this.emitPause(false));
          this.events.on("pause", () => this.emitPause(true));

          bridgeRef.current = {
            setInput: (input, active) => {
              if (!active) return;
              if (input === "jump") this.requestJump();
              if (input === "smash") this.requestSmash();
            },
            startRun: () => this.startRun(),
            restartRun: () => this.resetRun(),
            pauseRun: () => this.togglePause(),
          };

          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "ready" } }));
        }

        update(time: number, delta: number) {
          if (this.state !== "running") {
            this.updateDinoAnimation(time);
            return;
          }

          const dt = delta / 1000;
          this.distance += triceratopsGameConfig.world.baseSpeed * dt;
          this.spawnScriptedEvents();
          this.updateMovement(time, dt);
          this.updateObjects(dt);
          this.updateDinoAnimation(time);
          this.updateHud();

          if (this.distance >= triceratopsGameConfig.scene.targetDistance) {
            this.sceneComplete();
          }
        }

        private createWorld() {
          const { width, height, groundY } = triceratopsGameConfig.world;
          this.add.image(width / 2, height / 2, "stage-far").setDepth(0);
          this.farLayer = this.add.tileSprite(width / 2, 116, width, 96, "stage-mid").setDepth(1).setAlpha(0.76);
          this.midLayer = this.add.tileSprite(width / 2, groundY - 12, width, 88, "stage-mid").setDepth(2);
          this.foregroundLayer = this.add.tileSprite(width / 2, groundY + 25, width, 58, "stage-front").setDepth(8).setAlpha(0.92);
          this.ground = this.add.rectangle(width / 2, groundY + 20, width, 32, 0x000000, 0);
          this.physics.add.existing(this.ground, true);
          this.objects = this.physics.add.group({ allowGravity: false });
          this.wrapLine = this.add.rectangle(width - 52, groundY - 28, 2, 84, 0xf5c16f, 0.18).setDepth(4);
        }

        private createPlayer() {
          const { playerX, groundY, playerBody } = triceratopsGameConfig.world;
          this.player = this.physics.add.sprite(playerX, groundY - 28, DINO_SHEET_KEY, DINO_FRAME_BASE.idle).setDepth(7);
          this.player.setCollideWorldBounds(true);
          this.player.setGravityY(triceratopsGameConfig.world.gravity);
          this.player.body?.setSize(playerBody.width, playerBody.height);
          this.player.body?.setOffset(playerBody.offsetX, playerBody.offsetY);
          this.physics.add.collider(this.player, this.ground);
          this.physics.add.overlap(this.player, this.objects, (_player, item) => this.handleOverlap(item as SceneObject));
          this.smashHitbox = this.add.rectangle(playerX + 46, groundY - 30, triceratopsGameConfig.attack.hitboxWidth, triceratopsGameConfig.attack.hitboxHeight, 0xffe8a9, 0);
          this.smashHitbox.setDepth(9);
        }

        private createHud() {
          this.hudText = this.add.text(14, 12, "", {
            color: "#fff3dc",
            fontFamily: "monospace",
            fontSize: "12px",
            fontStyle: "bold",
          }).setDepth(20).setShadow(2, 2, "#07070a", 0, true, true);
          this.hpText = this.add.text(356, 12, "", {
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
            enter: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER) as Phaser.Input.Keyboard.Key,
            p: keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.P) as Phaser.Input.Keyboard.Key,
          };
          keyboard?.on("keydown-SPACE", () => this.requestJump());
          keyboard?.on("keydown-UP", () => this.requestJump());
          keyboard?.on("keydown-W", () => this.requestJump());
          keyboard?.on("keydown-X", () => this.requestSmash());
          keyboard?.on("keydown-K", () => this.requestSmash());
          keyboard?.on("keydown-ENTER", () => this.requestSmash());
          keyboard?.on("keydown-P", () => this.togglePause());
          keyboard?.on("keydown-ESC", () => this.togglePause());
        }

        private startRun() {
          this.resetRun();
          this.state = "running";
          this.physics.world.resume();
          this.runStartedAt = this.time.now;
          this.lastGroundedAt = this.time.now;
          this.hintText.setText("Tap the left side to JUMP");
          this.emitSfx("start");
        }

        private resetRun() {
          this.spawnedIds.clear();
          this.distance = 0;
          this.score = 0;
          this.hp = triceratopsGameConfig.scene.startingHp;
          this.hitsTaken = 0;
          this.objectsSmashed = 0;
          this.collectibles = 0;
          this.state = "ready";
          this.currentDinoState = "idle";
          this.jumpBufferedUntil = 0;
          this.smashUntil = 0;
          this.smashReadyAt = 0;
          this.invulnerableUntil = 0;
          this.objects.clear(true, true);
          this.player.setPosition(triceratopsGameConfig.world.playerX, triceratopsGameConfig.world.groundY - 28);
          this.player.setVelocity(0, 0);
          this.physics.world.pause();
          this.player.setTexture(DINO_SHEET_KEY, DINO_FRAME_BASE.idle);
          this.player.clearTint();
          this.updateHud();
        }

        private requestJump() {
          if (this.state !== "running") return;
          this.jumpBufferedUntil = this.time.now + triceratopsGameConfig.world.inputBufferMs;
          this.tryJump();
        }

        private requestSmash() {
          if (this.state !== "running") return;
          const now = this.time.now;
          if (now < this.smashReadyAt) return;
          this.smashUntil = now + triceratopsGameConfig.attack.activeMs;
          this.smashReadyAt = now + triceratopsGameConfig.attack.cooldownMs;
          this.currentDinoState = "smash";
          this.emitSfx("smash");
          this.smashHitbox.setPosition(this.player.x + 66, this.player.y + 5).setAlpha(0.18);
          this.checkSmashCollisions();
        }

        private tryJump() {
          const now = this.time.now;
          if (this.jumpBufferedUntil < now) return;
          const grounded = this.player.body?.blocked.down || this.player.body?.touching.down;
          if (!grounded && now - this.lastGroundedAt > triceratopsGameConfig.world.coyoteMs) return;
          this.player.setVelocityY(-triceratopsGameConfig.world.jumpVelocity);
          this.jumpBufferedUntil = 0;
          this.currentDinoState = "jump";
          this.emitSfx("jump");
        }

        private updateMovement(time: number, dt: number) {
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          const grounded = body.blocked.down || body.touching.down;
          if (grounded) {
            this.lastGroundedAt = time;
            this.tryJump();
          }
          this.player.x = triceratopsGameConfig.world.playerX;
          this.farLayer.tilePositionX += triceratopsGameConfig.world.baseSpeed * 0.1 * dt;
          this.midLayer.tilePositionX += triceratopsGameConfig.world.baseSpeed * 0.32 * dt;
          this.foregroundLayer.tilePositionX += triceratopsGameConfig.world.baseSpeed * 0.9 * dt;
          this.wrapLine.x = 110 + clamp(this.distance / triceratopsGameConfig.scene.targetDistance, 0, 1) * 260;
          if (time <= this.smashUntil) {
            this.smashHitbox.setPosition(this.player.x + 66, this.player.y + 5).setAlpha(0.18);
            this.checkSmashCollisions();
          } else {
            this.smashHitbox.setAlpha(0);
          }
        }

        private spawnScriptedEvents() {
          const spawnLead = triceratopsGameConfig.world.spawnLeadDistance;
          triceratopsGameConfig.timeline.forEach((script) => {
            if (this.spawnedIds.has(script.id)) return;
            if (this.distance < script.distance - spawnLead) return;
            this.spawnedIds.add(script.id);
            this.spawnScript(script);
          });
        }

        private spawnScript(script: TriceratopsScriptEvent) {
          const { width, groundY } = triceratopsGameConfig.world;
          const frame = OBJECT_FRAME[script.kind];
          let y = groundY - 10;
          if (script.kind === "smash_camera") {
            y = groundY - 18;
          } else if (script.kind === "smash_light") {
            y = groundY - 38;
          } else if (script.kind === "smash_crate") {
            y = groundY - 15;
          } else if (script.kind === "smash_wall") {
            y = groundY - 27;
          } else if (script.kind === "collectible") {
            y = groundY - 70;
          } else if (script.kind === "hazard_cable") {
            y = groundY - 9;
          } else if (script.kind === "hazard_light") {
            y = groundY - 62;
          } else if (script.kind === "finish") {
            y = groundY - 27;
          }
          const object = this.objects.create(width + 60, y, OBJECT_ATLAS_KEY, frame) as SceneObject;
          object.script = script;
          object.setDepth(script.kind === "collectible" ? 6 : 5);
          object.setImmovable(true);
          const body = object.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setAllowGravity(false);
          if (script.kind === "jump_obstacle") body?.setSize(30, 13).setOffset(8, 12);
          if (script.kind === "smash_camera") body?.setSize(34, 25).setOffset(7, 10);
          if (script.kind === "smash_light") body?.setSize(28, 44).setOffset(10, 11);
          if (script.kind === "smash_crate") body?.setSize(30, 25).setOffset(8, 10);
          if (script.kind === "smash_wall") body?.setSize(34, 46).setOffset(7, 8);
          if (script.kind === "hazard_cable") body?.setSize(38, 10).setOffset(5, 15);
          if (script.kind === "hazard_light") body?.setSize(30, 42).setOffset(9, 13);
          if (script.kind === "collectible") body?.setSize(20, 20).setOffset(7, 8);
          if (script.kind === "finish") body?.setSize(12, 52).setOffset(18, 6);
          if (script.tutorial) this.showHint(script.tutorial, 2600);
        }

        private updateObjects(dt: number) {
          const speed = triceratopsGameConfig.world.baseSpeed * dt;
          this.objects.getChildren().forEach((child) => {
            const object = child as SceneObject;
            object.x -= speed;
            if (object.script.kind === "collectible") object.angle += 220 * dt;
            if (object.x < -80) object.destroy();
          });
        }

        private handleOverlap(item: SceneObject) {
          if (this.state !== "running" || item.handled) return;
          if (item.script.kind === "collectible") {
            item.handled = true;
            this.collectibles += 1;
            this.addScore(triceratopsGameConfig.scoring.collectible);
            this.popScore(item.x, item.y - 16, "+250");
            this.emitSfx("collect");
            item.destroy();
            return;
          }
          if (item.script.kind === "finish") {
            this.sceneComplete();
            return;
          }
          if (
            item.script.kind === "smash_camera" ||
            item.script.kind === "smash_light" ||
            item.script.kind === "smash_crate" ||
            item.script.kind === "smash_wall"
          ) {
            if (this.time.now <= this.smashUntil) {
              this.smashObject(item);
            } else {
              this.bumpBreakable(item);
            }
            return;
          }
          this.takeDamage(
            item,
            item.script.kind === "hazard_cable"
              ? "Jump over live set hazards"
              : item.script.kind === "hazard_light"
                ? "Watch the overhead rig"
                : "Jump early and land wide",
          );
        }

        private checkSmashCollisions() {
          const hitbox = this.smashHitbox.getBounds();
          this.objects.getChildren().forEach((child) => {
            const item = child as SceneObject;
            if (item.handled) return;
            if (!["smash_camera", "smash_light", "smash_crate", "smash_wall"].includes(item.script.kind)) return;
            if (Phaser.Geom.Intersects.RectangleToRectangle(hitbox, item.getBounds())) this.smashObject(item);
          });
        }

        private smashObject(item: SceneObject) {
          if (item.handled) return;
          item.handled = true;
          this.objectsSmashed += 1;
          this.addScore(triceratopsGameConfig.scoring.smashTarget);
          item.setTint(0xffe8a9);
          item.setVelocity(0, -60);
          item.setAngularVelocity(420);
          const body = item.body as Phaser.Physics.Arcade.Body | undefined;
          body?.setEnable(false);
          this.cameras.main.shake(105, 0.006);
          this.cameras.main.flash(70, 255, 226, 168, false);
          this.popScore(item.x, item.y - 22, "+100");
          this.emitSfx("smash");
          this.spawnImpact(item.x + 8, item.y - 8);
          this.time.delayedCall(160, () => item.destroy());
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

        private takeDamage(item: SceneObject, hint: string) {
          const now = this.time.now;
          if (now < this.invulnerableUntil) return;
          item.handled = true;
          const cost = item.script.kind === "jump_obstacle" ? 0 : 1;
          this.hp -= cost;
          this.hitsTaken += 1;
          this.invulnerableUntil = now + 950;
          this.currentDinoState = "hit";
          this.player.setTint(0xff6978);
          this.cameras.main.shake(cost ? 140 : 70, cost ? 0.008 : 0.004);
          this.showHint(hint, 1800);
          this.emitSfx("damage");
          if (!cost) this.popScore(item.x, item.y - 22, "SAFE");
          this.time.delayedCall(210, () => {
            if (this.state === "running") this.player.clearTint();
          });
          item.destroy();
          this.updateHud();
          if (this.hp <= 0) {
            this.time.delayedCall(220, () => this.gameOver());
          }
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
          this.hudText.setText(`SCORE ${this.score.toLocaleString()}  SMASHED ${this.objectsSmashed}`);
          this.hpText.setText(`HP ${"H".repeat(Math.max(0, this.hp)).padEnd(triceratopsGameConfig.scene.startingHp, "-")}`);
          this.progressBar.width = 260 * clamp(this.distance / triceratopsGameConfig.scene.targetDistance, 0, 1);
        }

        private sceneComplete() {
          if (this.state === "complete" || this.state === "over") return;
          this.state = "complete";
          this.physics.world.pause();
          this.currentDinoState = "victory";
          this.addScore(triceratopsGameConfig.scoring.sceneClear);
          this.emitSfx("wrap");
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "scene-complete", result: this.resultPayload(true) } }));
        }

        private gameOver() {
          if (this.state === "over" || this.state === "complete") return;
          this.state = "over";
          this.physics.world.pause();
          this.currentDinoState = "over";
          this.player.clearTint();
          this.emitSfx("cut");
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "game-over", result: this.resultPayload(false) } }));
        }

        private resultPayload(completed: boolean): TriceratopsResult {
          return {
            sceneId: triceratopsGameConfig.scene.sceneId,
            completed,
            score: Math.max(0, Math.round(this.score)),
            playTimeMs: Math.max(1000, Math.round(this.time.now - this.runStartedAt)),
            distance: Math.round(this.distance),
            hpRemaining: Math.max(0, this.hp),
            objectsSmashed: this.objectsSmashed,
            hitsTaken: this.hitsTaken,
            collectibles: this.collectibles,
          };
        }

        private updateDinoAnimation(time: number) {
          const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
          if (!this.player || !body) return;
          let state = this.currentDinoState;
          if (this.state === "running") {
            if (time <= this.smashUntil) state = "smash";
            else if (body.velocity.y < -20 || body.velocity.y > 20) state = "jump";
            else if (state !== "hit") state = "run";
          }
          const frames = DINO_STATES[state];
          const frame = Math.floor(time / DINO_FRAME_MS[state]) % frames;
          this.player.setTexture(DINO_SHEET_KEY, DINO_FRAME_BASE[state] + frame);
          if (state === "hit" && time > this.invulnerableUntil - 620) this.currentDinoState = "run";
        }

        private togglePause() {
          if (this.state !== "running" && this.state !== "paused") return;
          if (this.state === "paused") {
            this.state = "running";
            this.scene.resume();
            this.emitPause(false);
          } else {
            this.state = "paused";
            this.scene.pause();
            this.emitPause(true);
          }
        }

        private emitPause(paused: boolean) {
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "pause", paused } }));
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
        setSyncStatus("Session played locally. Sign in on staging to save scores.");
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

  function setControl(input: TriceratopsInput) {
    bridgeRef.current?.setInput(input, true);
  }

  function handleTouchZone(event: PointerEvent<HTMLButtonElement>, input: TriceratopsInput) {
    event.preventDefault();
    setControl(input);
  }

  const resultTitle = phase === "complete" ? "THAT'S A WRAP!" : "CUT!";

  return (
    <section
      ref={shellRef}
      className={`triceratops-fullscreen ${phase === "running" || phase === "intro" ? "is-running" : ""} ${paused ? "is-paused" : ""}`}
    >
      <div className="triceratops-stage" aria-label="TRICERATOPS playable game">
        <div ref={hostRef} className="triceratops-game-canvas" />

        {isPortrait ? (
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

        {!isPortrait && phase === "start" ? (
          <div className="triceratops-start-screen">
            <button className="triceratops-exit" onClick={exitGame} type="button">
              Exit
            </button>
            <p className="triceratops-kicker">Backlot Arcade</p>
            <h1>TRICERATOPS!</h1>
            <h2>Smash the Studio Backlot</h2>
            <p>Auto-run through a movie studio. Jump with the left side. Smash with the right side.</p>
            <div className="triceratops-control-copy">
              <span>Mobile: left half jumps, right half smashes.</span>
              <span>Desktop: Space or Up jumps. X smashes. P pauses.</span>
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
              <span>5 HP</span>
              <span>Goal: reach the wrap marker</span>
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
            {paused ? (
              <div className="triceratops-pause-menu" role="dialog" aria-modal="true" aria-label="TRICERATOPS pause menu">
                <p className="triceratops-kicker">Paused</p>
                <h2>Hold for Picture</h2>
                <div className="triceratops-end-actions">
                  <button className="triceratops-play-button" onClick={() => bridgeRef.current?.pauseRun()} type="button">
                    Resume
                  </button>
                  <button className="triceratops-sound-button" onClick={toggleAudio} type="button">
                    {audioMuted ? "Sound Off" : "Sound On"}
                  </button>
                  <button className="secondary-button compact" onClick={restartGame} type="button">
                    Restart
                  </button>
                  <button className="secondary-button compact" onClick={exitGame} type="button">
                    Exit
                  </button>
                </div>
              </div>
            ) : null}
            <div className="triceratops-touch-zones" aria-label="TRICERATOPS touch controls">
              <button
                type="button"
                className="triceratops-touch-zone is-jump"
                aria-label="Jump"
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => handleTouchZone(event, "jump")}
              >
                <span>Jump</span>
              </button>
              <button
                type="button"
                className="triceratops-touch-zone is-smash"
                aria-label="Smash"
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={(event) => handleTouchZone(event, "smash")}
              >
                <span>Smash</span>
              </button>
            </div>
          </>
        ) : null}

        {(phase === "over" || phase === "complete") && lastResult ? (
          <div className="triceratops-game-over">
            <p className="triceratops-kicker">{phase === "complete" ? "Scene Complete" : "Backlot Busted"}</p>
            <h1>{resultTitle}</h1>
            <div className="triceratops-result-grid">
              <span>
                <strong>{lastResult.score.toLocaleString()}</strong>
                Score
              </span>
              <span>
                <strong>{lastResult.hpRemaining}</strong>
                HP left
              </span>
              <span>
                <strong>{lastResult.objectsSmashed}</strong>
                Smashed
              </span>
              <span>
                <strong>{lastResult.hitsTaken}</strong>
                Hits taken
              </span>
              <span>
                <strong>{lastResult.collectibles}</strong>
                Frames
              </span>
              <span>
                <strong>{Math.round(lastResult.playTimeMs / 1000)}s</strong>
                Time
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
          </div>
        ) : null}

        {phase !== "running" ? <strong className="triceratops-score-readout">{lastScore.toLocaleString()} pts</strong> : null}
      </div>
      {syncStatus ? <p className="backlot-sync-note">{syncStatus}</p> : null}
    </section>
  );
}
