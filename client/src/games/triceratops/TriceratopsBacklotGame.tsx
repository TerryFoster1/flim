import { useEffect, useMemo, useRef, useState } from "react";
import { recordBacklotGameOver, recordBacklotLaunch } from "../../services/backlotService";
import {
  TRICERATOPS_GAME_ID,
  triceratopsGameConfig,
  type TriceratopsInput,
  type TriceratopsResult,
} from "./gameConfig";
import { createRetroAudioEngine, type RetroAudioEngine, type TriceratopsSfx } from "./retroAudio";
import "./triceratops.css";

type TriceratopsBacklotGameProps = {
  onNavigate: (path: string) => void;
};

type PhaserModule = typeof import("phaser");

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

type SpawnKind = "smash" | "hazard" | "prop" | "reel" | "rampage" | "spotlight";

type SpawnedObject = Phaser.Physics.Arcade.Sprite & {
  vx: number;
  vy?: number;
  spin?: number;
  kind: SpawnKind;
  handled?: boolean;
};

const LANDSCAPE_QUERY = "(orientation: landscape)";
const DINO_STATES = {
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
} as const;

const DINO_FRAME_MS: Record<keyof typeof DINO_STATES, number> = {
  idle: 220,
  run: 82,
  fastRun: 58,
  jump: 130,
  jumpFall: 110,
  land: 88,
  charge: 68,
  smash: 62,
  hit: 150,
  stunned: 160,
  rampage: 52,
  victory: 150,
  over: 240,
};

function dinoTexture(state: keyof typeof DINO_STATES, frame = 0) {
  return `dino-${state}-${frame % DINO_STATES[state]}`;
}

function isLikelyPhonePortrait() {
  if (typeof window === "undefined") return false;
  const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return coarsePointer && window.innerHeight > window.innerWidth;
}

function supportsFullscreen(element: HTMLElement | null) {
  return Boolean(element?.requestFullscreen);
}

export function TriceratopsBacklotGame({ onNavigate }: TriceratopsBacklotGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const bridgeRef = useRef<GameBridge | null>(null);
  const audioRef = useRef<RetroAudioEngine | null>(null);
  const countdownTimersRef = useRef<number[]>([]);
  const startedAtRef = useRef(Date.now());
  const gameOverSentRef = useRef(false);
  const [phase, setPhase] = useState<"start" | "intro" | "running" | "complete" | "over">("start");
  const [syncStatus, setSyncStatus] = useState("");
  const [lastScore, setLastScore] = useState(0);
  const [isPortrait, setIsPortrait] = useState(isLikelyPhonePortrait);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [lastResult, setLastResult] = useState<TriceratopsResult | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [audioMuted, setAudioMuted] = useState(false);

  const controlHint = useMemo(
    () => ({
      mobile: "Left pad moves. A jumps; double-tap for a high jump. Hold B to charge.",
      desktop: "Arrows or WASD move. Space jumps; double-tap for high jump. Shift charges. P pauses.",
    }),
    [],
  );

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
    const updateOrientation = () => setIsPortrait(isLikelyPhonePortrait());
    const query = window.matchMedia?.(LANDSCAPE_QUERY);
    updateOrientation();
    query?.addEventListener?.("change", updateOrientation);
    window.addEventListener("resize", updateOrientation);
    return () => {
      query?.removeEventListener?.("change", updateOrientation);
      window.removeEventListener("resize", updateOrientation);
    };
  }, []);

  useEffect(() => {
    setFullscreenAvailable(supportsFullscreen(shellRef.current));
  }, []);

  useEffect(() => {
    startedAtRef.current = Date.now();
    recordBacklotLaunch(TRICERATOPS_GAME_ID).catch(() => {
      setSyncStatus("Sign in on staging to save Backlot progress.");
    });
  }, []);

  useEffect(() => {
    let mounted = true;
    let activeGame: Phaser.Game | null = null;

    async function bootGame() {
      const Phaser = (await import("phaser")).default as unknown as PhaserModule;
      if (!mounted || !hostRef.current || gameRef.current) return;

      class BacklotRampageScene extends Phaser.Scene {
        private state: "boot" | "running" | "paused" | "complete" | "over" = "boot";
        private inputState: Record<TriceratopsInput, boolean> = {
          left: false,
          right: false,
          jump: false,
          charge: false,
        };
        private score = 0;
        private distance = 0;
        private combo = 1;
        private comboHits = 0;
        private longestCombo = 1;
        private objectsSmashed = 0;
        private reelsCollected = 0;
        private hazardsCleared = 0;
        private hp = triceratopsGameConfig.scene.startingHp;
        private checkpointDistance = 0;
        private rampageActivations = 0;
        private invulnerableUntil = 0;
        private sceneStartedAt = 0;
        private lastJumpTapAt = 0;
        private wasAirborne = false;
        private runSpeed: number = triceratopsGameConfig.world.baseSpeed;
        private player!: Phaser.Physics.Arcade.Sprite;
        private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
        private ground!: Phaser.Physics.Arcade.StaticGroup;
        private smashables!: Phaser.Physics.Arcade.Group;
        private hazards!: Phaser.Physics.Arcade.Group;
        private props!: Phaser.Physics.Arcade.Group;
        private reels!: Phaser.Physics.Arcade.Group;
        private powerUps!: Phaser.Physics.Arcade.Group;
        private backLayer: Phaser.GameObjects.TileSprite[] = [];
        private midLayer: Phaser.GameObjects.TileSprite[] = [];
        private scoreText!: Phaser.GameObjects.Text;
        private comboText!: Phaser.GameObjects.Text;
        private hpText!: Phaser.GameObjects.Text;
        private progressText!: Phaser.GameObjects.Text;
        private rampageText!: Phaser.GameObjects.Text;
        private pauseText!: Phaser.GameObjects.Text;
        private jumpLocked = false;
        private chargeUntil = 0;
        private chargeReadyAt = 0;
        private rampageUntil = 0;
        private nextSmashAt = 0;
        private nextHazardAt = 0;
        private nextPropAt = 0;
        private nextReelAt = 0;
        private nextPowerAt = 0;
        private lastScoreNotifyAt = 0;
        private currentDinoState: keyof typeof DINO_STATES = "run";
        private currentDinoFrame = 0;
        private keyboardChargeLocked = false;
        private keys?: {
          left: Phaser.Input.Keyboard.Key;
          right: Phaser.Input.Keyboard.Key;
          up: Phaser.Input.Keyboard.Key;
          down: Phaser.Input.Keyboard.Key;
          a: Phaser.Input.Keyboard.Key;
          d: Phaser.Input.Keyboard.Key;
          w: Phaser.Input.Keyboard.Key;
          s: Phaser.Input.Keyboard.Key;
          space: Phaser.Input.Keyboard.Key;
          shift: Phaser.Input.Keyboard.Key;
        };

        create() {
          this.createTextureAtlas();
          this.createWorld();
          this.createPlayer();
          this.createHud();
          this.createCollisions();
          this.bindKeyboard();
          bridgeRef.current = {
            setInput: (input, active) => {
              this.inputState[input] = active;
              if (input === "jump" && active) this.jump();
              if (input === "charge" && active) this.charge();
            },
            startRun: () => this.startRun(),
            restartRun: () => this.restartRun(),
            pauseRun: () => this.togglePause(),
          };
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "ready" } }));
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            bridgeRef.current = null;
          });
        }

        update(time: number, delta: number) {
          const dt = Math.min(delta, 34) / 1000;
          this.scrollWorld(dt);
          this.animatePlayer(time);
          if (this.state !== "running") return;

          this.applyKeyboardInput();
          this.applyMovement(dt);
          this.updateDifficulty();
          this.spawnLoop(time);
          this.moveObjects(dt);
          this.updateHud(time);
          this.cleanupObjects();
        }

        private createTextureAtlas() {
          Object.entries(DINO_STATES).forEach(([state, frames]) => {
            for (let frame = 0; frame < frames; frame += 1) this.createTriceratopsFrame(`${state}-${frame}`, state as keyof typeof DINO_STATES, frame);
          });
          this.createBacklotSprites();
        }

        private makeTextureNearest(key: string) {
          this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }

        private createTriceratopsFrame(key: string, state: keyof typeof DINO_STATES, frame: number) {
          const g = this.add.graphics();
          const scale = 2;
          const px = (x: number, y: number, w: number, h: number, color: number) => {
            g.fillStyle(color, 1);
            g.fillRect(x * scale, y * scale, w * scale, h * scale);
          };
          const fast = state === "fastRun" || state === "rampage";
          const bob =
            state === "run" || state === "fastRun" || state === "rampage"
              ? frame % 2
              : state === "jump"
                ? -4
                : state === "jumpFall"
                  ? -2
                  : state === "charge" || state === "smash"
                    ? 1
                    : state === "victory"
                      ? -1 - (frame % 2)
                      : 0;
          const lean =
            state === "charge" || state === "smash" || fast
              ? 3
              : state === "jumpFall"
                ? -1
                : state === "hit" || state === "stunned" || state === "over"
                  ? -2
                  : 0;
          const main =
            state === "hit" || state === "stunned"
              ? 0xff6969
              : state === "rampage"
                ? 0xffd85f
                : state === "charge" || state === "smash"
                  ? 0xf4b14e
                  : state === "victory"
                    ? 0x7be879
                    : 0x49c86b;
          const dark = state === "hit" || state === "stunned" || state === "over" ? 0x7f2430 : fast ? 0x815414 : 0x1c6f3d;
          px(5 + lean, 25 + bob, 24, 6, dark);
          px(11 + lean, 18 + bob, 30, 12, main);
          px(27 + lean, 11 + bob, 25, 11, main);
          px(45 + lean, 8 + bob, 14, 4, 0xf6e6bd);
          px(48 + lean, 18 + bob, 14, 4, 0xf6e6bd);
          px(31 + lean, 8 + bob, 6, 7, 0xf3d39b);
          px(40 + lean, 8 + bob, 9, 7, 0xf3d39b);
          px(41 + lean, 14 + bob, 2, 2, 0x05070a);
          px(16 + lean, 14 + bob, 4, 4, 0x76e08d);
          px(20 + lean, 15 + bob, 4, 3, 0x76e08d);
          const legA = frame % 2 === 0 || state === "jump" || state === "jumpFall" ? 0 : fast ? 4 : 3;
          const legB = frame % 2 === 0 || state === "jump" || state === "jumpFall" ? (fast ? 4 : 3) : 0;
          px(15 + lean, 30 + bob, 5, 10 - Math.min(legA, 2), dark);
          px(28 + lean, 30 + bob, 5, 10 - Math.min(legB, 2), dark);
          px(12 + lean, 38 + bob - legA, 9, 3, 0x102618);
          px(26 + lean, 38 + bob - legB, 9, 3, 0x102618);
          if (state === "charge" || state === "smash" || state === "rampage") {
            px(52 + lean, 12 + bob, 8, 2, 0xfff0bc);
            px(53 + lean, 22 + bob, 8, 2, 0xfff0bc);
          }
          if (state === "smash") {
            px(55, 6 + frame, 3, 3, 0xfff0bc);
            px(58, 28 - frame, 2, 2, 0xff595f);
          }
          if (state === "over") {
            px(38, 13 + bob, 5, 2, 0x05070a);
          }
          if (state === "victory") {
            px(19 + frame, 8 + bob, 3, 3, 0xfff0bc);
            px(23 + frame, 6 + bob, 2, 2, 0xfff0bc);
          }
          g.generateTexture(`dino-${key}`, 128, 96);
          this.makeTextureNearest(`dino-${key}`);
          g.destroy();
        }

        private createBacklotSprites() {
          const pixelTexture = (key: string, width: number, height: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
            const g = this.add.graphics();
            draw(g);
            g.generateTexture(key, width, height);
            this.makeTextureNearest(key);
            g.destroy();
          };

          pixelTexture("breakaway-car", 72, 44, (g) => {
            g.fillStyle(0x07070a, 1).fillRect(0, 0, 72, 44);
            g.fillStyle(0x20314a, 1).fillRect(8, 18, 54, 16);
            g.fillStyle(0xff5a62, 1).fillRect(22, 8, 28, 13);
            g.fillStyle(0xf5c16f, 1).fillRect(28, 12, 7, 5).fillRect(39, 12, 7, 5);
            g.fillStyle(0x020204, 1).fillRect(14, 32, 10, 10).fillRect(49, 32, 10, 10);
            g.fillStyle(0xf5c16f, 1).fillRect(6, 24, 4, 4).fillRect(60, 24, 4, 4);
          });
          pixelTexture("danger-barrier", 48, 50, (g) => {
            g.fillStyle(0x000000, 0).fillRect(0, 0, 48, 50);
            g.fillStyle(0x2b2630, 1).fillRect(8, 8, 32, 34);
            g.fillStyle(0xff5a62, 1).fillRect(12, 32, 24, 5).fillRect(18, 14, 12, 5);
            g.fillStyle(0xf5c16f, 1).fillRect(14, 20, 20, 4).fillRect(14, 27, 20, 4);
            g.fillStyle(0x07070a, 1).fillRect(9, 42, 6, 8).fillRect(33, 42, 6, 8);
          });
          pixelTexture("breakaway-prop", 42, 50, (g) => {
            g.fillStyle(0x000000, 0).fillRect(0, 0, 42, 50);
            g.fillStyle(0x7d5431, 1).fillRect(12, 18, 20, 28);
            g.fillStyle(0xf5c16f, 1).fillRect(8, 12, 28, 7).fillRect(15, 7, 14, 5);
            g.fillStyle(0x18100c, 1).fillRect(17, 23, 3, 3).fillRect(25, 23, 3, 3);
            g.fillStyle(0xff5a62, 1).fillRect(13, 35, 18, 3);
          });
          pixelTexture("bonus-reel", 30, 30, (g) => {
            g.fillStyle(0x000000, 0).fillRect(0, 0, 30, 30);
            g.fillStyle(0xf5c16f, 1).fillRect(7, 2, 16, 3).fillRect(4, 5, 22, 20).fillRect(7, 25, 16, 3);
            g.fillStyle(0x07070a, 1).fillRect(9, 8, 4, 4).fillRect(18, 8, 4, 4).fillRect(9, 17, 4, 4).fillRect(18, 17, 4, 4).fillRect(14, 14, 3, 3);
          });
          pixelTexture("impact-spark", 6, 6, (g) => {
            g.fillStyle(0xf5c16f, 1).fillRect(2, 0, 2, 6).fillRect(0, 2, 6, 2);
          });
          pixelTexture("backlot-sky", 480, 270, (g) => {
            g.fillStyle(0x08070b, 1).fillRect(0, 0, 480, 270);
            g.fillStyle(0x141728, 1).fillRect(0, 0, 480, 180);
            g.fillStyle(0x2a1720, 1).fillRect(0, 92, 480, 88);
            g.fillStyle(0xf5c16f, 1).fillRect(344, 28, 46, 4).fillRect(354, 36, 38, 3);
            g.fillStyle(0x342322, 1).fillRect(0, 180, 480, 90);
          });
          pixelTexture("studio-skyline", 480, 180, (g) => {
            g.fillStyle(0x000000, 0).fillRect(0, 0, 480, 180);
            for (let i = 0; i < 10; i += 1) {
              const x = i * 52;
              const h = 70 + (i % 4) * 14;
              g.fillStyle(i % 2 ? 0x121521 : 0x1c202f, 1).fillRect(x, 180 - h, 38, h);
              g.fillStyle(0xf5c16f, 0.45).fillRect(x + 8, 180 - h + 18, 4, 7).fillRect(x + 22, 180 - h + 36, 4, 7);
            }
          });
          pixelTexture("backlot-street", 480, 58, (g) => {
            g.fillStyle(0x171318, 1).fillRect(0, 0, 480, 58);
            g.fillStyle(0x3a2b27, 1).fillRect(0, 0, 480, 5);
            g.fillStyle(0xf5c16f, 0.72).fillRect(0, 7, 480, 2);
            g.fillStyle(0xffffff, 0.18);
            for (let i = 0; i < 12; i += 1) g.fillRect(i * 45, 32, 20, 2);
          });
        }

        private createWorld() {
          const { width, height, groundY } = triceratopsGameConfig.world;
          this.add.image(width / 2, height / 2, "backlot-sky").setDisplaySize(width, height).setDepth(0);
          this.backLayer.push(this.add.tileSprite(width / 2, groundY - 168, width, 360, "studio-skyline").setDepth(1));
          this.add.rectangle(width / 2, groundY - 48, width, 122, 0x291a13, 0.35).setDepth(2);
          for (let i = 0; i < 9; i += 1) {
            const sign = this.add.container(88 + i * 76, groundY - 132 + (i % 3) * 8).setDepth(2);
            sign.add(this.add.rectangle(0, 0, 58, 34, 0x241820, 0.9).setStrokeStyle(1, 0xf5c16f, 0.42));
            sign.add(
              this.add.text(-22, -8, i % 2 ? "SET" : "PROP", {
                fontFamily: "system-ui, sans-serif",
                fontSize: "8px",
                color: "#f5c16f",
                fontStyle: "bold",
              }),
            );
          }
          this.midLayer.push(this.add.tileSprite(width / 2, groundY + 58, width, 118, "backlot-street").setDepth(3));
          this.ground = this.physics.add.staticGroup();
          this.ground.add(this.add.rectangle(width / 2, groundY + 54, width, 96, 0x000000, 0));
          this.smashables = this.physics.add.group({ allowGravity: false });
          this.hazards = this.physics.add.group({ allowGravity: false });
          this.props = this.physics.add.group({ allowGravity: false });
          this.reels = this.physics.add.group({ allowGravity: false });
          this.powerUps = this.physics.add.group({ allowGravity: false });
        }

        private createPlayer() {
          const { playerX, groundY } = triceratopsGameConfig.world;
          this.player = this.physics.add.sprite(playerX, groundY - 68, dinoTexture("run")).setDepth(8);
          this.player.setSize(70, 38).setOffset(20, 46);
          this.player.setGravityY(triceratopsGameConfig.world.gravity);
          this.player.setCollideWorldBounds(true);
          this.dust = this.add.particles(0, 0, "impact-spark", {
            lifespan: 260,
            speed: { min: 90, max: 220 },
            scale: { start: 0.55, end: 0 },
            alpha: { start: 0.42, end: 0 },
            quantity: 0,
            tint: 0xf5c16f,
          }).setDepth(7);
        }

        private createHud() {
          const { width } = triceratopsGameConfig.world;
          this.scoreText = this.add.text(28, 22, "0", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "30px",
            color: "#fff7e8",
            fontStyle: "900",
          }).setDepth(30);
          this.comboText = this.add.text(30, 58, "Combo x1.00", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            color: "#f5c16f",
            fontStyle: "900",
          }).setDepth(30);
          this.hpText = this.add.text(30, 78, "HP 3", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "13px",
            color: "#91ffd5",
            fontStyle: "900",
          }).setDepth(30);
          this.progressText = this.add.text(width / 2, 22, "Scene 1: Studio Backlot", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "13px",
            color: "#fff0cf",
            fontStyle: "900",
          }).setOrigin(0.5, 0).setDepth(30);
          this.rampageText = this.add.text(width - 28, 24, "", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "18px",
            color: "#8fffd1",
            fontStyle: "900",
          }).setOrigin(1, 0).setDepth(30);
          this.pauseText = this.add.text(width - 28, 58, "Pause", {
            fontFamily: "system-ui, sans-serif",
            fontSize: "14px",
            color: "#fff0cf",
          }).setOrigin(1, 0).setDepth(30);
        }

        private createCollisions() {
          this.physics.add.collider(this.player, this.ground);
          this.physics.add.overlap(this.player, this.smashables, (_p, object) => this.hitSmashable(object as SpawnedObject));
          this.physics.add.overlap(this.player, this.hazards, (_p, object) => this.hitHazard(object as SpawnedObject));
          this.physics.add.overlap(this.player, this.props, (_p, object) => this.hitProp(object as SpawnedObject));
          this.physics.add.overlap(this.player, this.reels, (_p, object) => this.collectReel(object as SpawnedObject));
          this.physics.add.overlap(this.player, this.powerUps, (_p, object) => this.collectPower(object as SpawnedObject));
        }

        private bindKeyboard() {
          const keyboard = this.input.keyboard;
          if (!keyboard) return;
          this.keys = {
            left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
            a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
            d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
            w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
            s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
            space: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
            shift: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
          };
          this.input.keyboard?.on("keydown-ESC", () => this.togglePause());
          this.input.keyboard?.on("keydown-P", () => this.togglePause());
        }

        private startRun() {
          if (this.state === "running") return;
          this.state = "running";
          this.sceneStartedAt = Date.now();
          this.score = 0;
          this.distance = 0;
          this.combo = 1;
          this.comboHits = 0;
          this.longestCombo = 1;
          this.objectsSmashed = 0;
          this.reelsCollected = 0;
          this.hazardsCleared = 0;
          this.hp = triceratopsGameConfig.scene.startingHp;
          this.checkpointDistance = 0;
          this.rampageActivations = 0;
          this.invulnerableUntil = 0;
          this.rampageUntil = 0;
          this.chargeUntil = 0;
          this.wasAirborne = false;
          this.runSpeed = triceratopsGameConfig.world.baseSpeed;
          this.nextSmashAt = this.time.now + 580;
          this.nextHazardAt = this.time.now + 1300;
          this.nextPropAt = this.time.now + 840;
          this.nextReelAt = this.time.now + 1000;
          this.nextPowerAt = this.time.now + 7600;
          this.clearGroups();
          this.currentDinoState = "run";
          this.currentDinoFrame = 0;
          this.player.setTexture(dinoTexture("run")).setPosition(triceratopsGameConfig.world.playerX, triceratopsGameConfig.world.groundY - 68);
          this.player.setAngle(0).setVelocity(0, 0).setAlpha(1);
          this.emitSfx("start");
        }

        private restartRun() {
          this.startRun();
        }

        private togglePause() {
          if (this.state === "running") {
            this.state = "paused";
            this.pauseText.setText("Paused");
            window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "pause", paused: true } }));
          } else if (this.state === "paused") {
            this.state = "running";
            this.pauseText.setText("Pause");
            window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "pause", paused: false } }));
          }
        }

        private clearGroups() {
          [this.smashables, this.hazards, this.props, this.reels, this.powerUps].forEach((group) => group.clear(true, true));
        }

        private scrollWorld(dt: number) {
          const scroll = this.state === "running" ? this.runSpeed * dt : triceratopsGameConfig.world.baseSpeed * 0.25 * dt;
          this.backLayer.forEach((layer) => {
            layer.tilePositionX += scroll * 0.16;
          });
          this.midLayer.forEach((layer) => {
            layer.tilePositionX += scroll * 0.78;
          });
        }

        private applyKeyboardInput() {
          if (!this.keys) return;
          this.inputState.left = this.keys.left.isDown || this.keys.a.isDown;
          this.inputState.right = this.keys.right.isDown || this.keys.d.isDown;

          const jumpDown =
            this.keys.space.isDown ||
            this.keys.up.isDown ||
            this.keys.w.isDown;
          if (jumpDown && !this.jumpLocked) {
            this.jump();
            this.jumpLocked = true;
          }
          if (!jumpDown) this.jumpLocked = false;

          const chargeDown = this.keys.shift.isDown || this.keys.s.isDown || this.keys.down.isDown;
          if (chargeDown && !this.keyboardChargeLocked) {
            this.charge();
          }
          this.keyboardChargeLocked = chargeDown;
        }

        private applyMovement(dt: number) {
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          const targetX = triceratopsGameConfig.world.playerX + (this.inputState.right ? 32 : 0) - (this.inputState.left ? 26 : 0);
          this.player.x += (targetX - this.player.x) * Math.min(1, dt * 12);
          const grounded = body.blocked.down || this.player.y >= triceratopsGameConfig.world.groundY - 70;
          const airborne = !grounded;
          if (grounded && this.wasAirborne) this.emitSfx("land");
          this.wasAirborne = airborne;
          if (grounded && this.state === "running") {
            this.dust.emitParticleAt(this.player.x - 42, triceratopsGameConfig.world.groundY - 10, 1);
          }
        }

        private updateDifficulty() {
          this.distance += this.runSpeed / triceratopsGameConfig.scoring.distancePointEveryPx;
          if (this.distance >= this.checkpointDistance + triceratopsGameConfig.scene.checkpointEvery) {
            this.checkpointDistance += triceratopsGameConfig.scene.checkpointEvery;
            this.showScorePopup(240, 100, "Checkpoint");
            this.emitSfx("combo");
          }
          if (this.distance >= triceratopsGameConfig.scene.targetDistance) {
            this.sceneComplete();
            return;
          }
          this.runSpeed = Math.min(
            triceratopsGameConfig.world.maxSpeed,
            triceratopsGameConfig.world.baseSpeed + Math.floor(this.distance / 900) * 18,
          );
          this.score += Math.max(1, Math.floor(this.runSpeed / 68));
        }

        private spawnLoop(time: number) {
          if (time >= this.nextSmashAt) {
            this.spawnObject("smash");
            this.nextSmashAt = time + Math.max(760, triceratopsGameConfig.spawn.smashMs - this.distance / 9);
          }
          if (time >= this.nextHazardAt) {
            this.spawnObject("hazard");
            this.nextHazardAt = time + triceratopsGameConfig.spawn.hazardMs + this.randomBetween(-240, 380);
          }
          if (time >= this.nextPropAt) {
            this.spawnObject("prop");
            this.nextPropAt = time + triceratopsGameConfig.spawn.propMs + this.randomBetween(-180, 310);
          }
          if (time >= this.nextReelAt) {
            this.spawnObject("reel");
            this.nextReelAt = time + triceratopsGameConfig.spawn.reelMs + this.randomBetween(-260, 420);
          }
          if (time >= this.nextPowerAt) {
            this.spawnObject(this.randomBetween(0, 1) ? "rampage" : "spotlight");
            this.nextPowerAt = time + this.randomBetween(9200, 14200);
          }
        }

        private spawnObject(kind: SpawnKind) {
          const { width, groundY } = triceratopsGameConfig.world;
          let object: SpawnedObject;
          if (kind === "smash") {
            object = this.smashables.create(width + 80, groundY - 24, "breakaway-car") as SpawnedObject;
            object.setSize(58, 24).setOffset(7, 18);
          } else if (kind === "hazard") {
            object = this.hazards.create(width + 72, groundY - 27, "danger-barrier") as SpawnedObject;
            object.setSize(30, 34).setOffset(9, 9);
          } else if (kind === "prop") {
            object = this.props.create(width + 64, groundY - 26, "breakaway-prop") as SpawnedObject;
            object.setSize(22, 28).setOffset(10, 18);
          } else if (kind === "reel") {
            object = this.reels.create(width + 72, groundY - this.randomBetween(58, 108), "bonus-reel") as SpawnedObject;
            object.setCircle(12).setOffset(3, 3);
          } else {
            object = this.powerUps.create(width + 72, groundY - 96, "bonus-reel") as SpawnedObject;
            object.setTint(kind === "rampage" ? 0xff6475 : 0x91ffd5);
            object.setCircle(12).setOffset(3, 3);
          }
          object.kind = kind;
          object.vx = -this.runSpeed * (kind === "prop" ? 0.84 : kind === "hazard" ? 0.96 : 1);
          object.setDepth(kind === "reel" || kind === "rampage" || kind === "spotlight" ? 7 : 6);
        }

        private moveObjects(dt: number) {
          [this.smashables, this.hazards, this.props, this.reels, this.powerUps].forEach((group) => {
            group.getChildren().forEach((child) => {
              const item = child as SpawnedObject;
              item.x += item.vx * dt;
              if (item.kind === "reel" || item.kind === "rampage" || item.kind === "spotlight") item.angle += 240 * dt;
              if (item.handled) {
                item.y += (item.vy || 0) * dt;
                item.vy = (item.vy || 0) + 980 * dt;
                item.angle += (item.spin || 320) * dt;
              }
            });
          });
        }

        private cleanupObjects() {
          [this.smashables, this.hazards, this.props, this.reels, this.powerUps].forEach((group) => {
            group.getChildren().forEach((child) => {
              const item = child as SpawnedObject;
              if (item.x < -120 || item.y > 340) item.destroy();
            });
          });
        }

        private jump() {
          if (this.state !== "running") return;
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          if (body.blocked.down || this.player.y >= triceratopsGameConfig.world.groundY - 70) {
            const now = this.time.now;
            const highJump = now - this.lastJumpTapAt < 280;
            this.lastJumpTapAt = now;
            this.player.setVelocityY(highJump ? -triceratopsGameConfig.world.highJumpVelocity : -triceratopsGameConfig.world.jumpVelocity);
            this.currentDinoState = "jump";
            this.currentDinoFrame = 0;
            this.player.setTexture(dinoTexture("jump"));
            this.emitSfx("jump");
          }
        }

        private charge() {
          if (this.state !== "running") return;
          const now = this.time.now;
          if (now < this.chargeReadyAt) return;
          this.chargeUntil = now + triceratopsGameConfig.attack.activeMs;
          this.chargeReadyAt = now + triceratopsGameConfig.attack.cooldownMs;
          this.currentDinoState = "charge";
          this.currentDinoFrame = 0;
          this.player.setTexture(dinoTexture("charge"));
          this.cameras.main.shake(85, 0.004);
          this.emitSfx("charge");
          this.time.delayedCall(triceratopsGameConfig.attack.activeMs, () => {
            if (this.state === "running") this.currentDinoState = "run";
          });
        }

        private isChargeActive() {
          const now = this.time.now;
          return now <= this.chargeUntil || now <= this.rampageUntil;
        }

        private hitSmashable(item: SpawnedObject) {
          if (item.handled) return;
          if (!this.isChargeActive()) {
            this.takeDamage(item, "Charge through breakaway sets");
            return;
          }
          this.smashObject(item, "smashable", triceratopsGameConfig.scoring.smashTarget);
        }

        private hitHazard(item: SpawnedObject) {
          if (item.handled) return;
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          const stomped = body.velocity.y > 170 && this.player.y < item.y - 22;
          if (this.isChargeActive() || stomped) {
            this.hazardsCleared += 1;
            if (stomped) this.player.setVelocityY(-360);
            this.smashObject(item, "hazard", triceratopsGameConfig.scoring.hazardCleared);
            return;
          }
          this.takeDamage(item, "Jump, stomp, or charge hazards");
        }

        private hitProp(item: SpawnedObject) {
          if (item.handled) return;
          this.smashObject(item, "prop", triceratopsGameConfig.scoring.propDestroyed);
        }

        private collectReel(item: SpawnedObject) {
          if (item.handled) return;
          item.handled = true;
          this.reelsCollected += 1;
          this.addScore(triceratopsGameConfig.scoring.reelCollected);
          this.emitSfx("collect");
          this.showScorePopup(item.x, item.y - 26, "+REEL");
          item.destroy();
        }

        private collectPower(item: SpawnedObject) {
          if (item.handled) return;
          item.handled = true;
          this.rampageUntil = this.time.now + triceratopsGameConfig.powerUps.rampageDurationMs;
          this.rampageActivations += 1;
          this.addScore(triceratopsGameConfig.scoring.rampageBonus);
          this.emitSfx("rampage");
          this.showScorePopup(item.x, item.y - 34, "RAMPAGE");
          item.destroy();
        }

        private smashObject(item: SpawnedObject, label: "smashable" | "hazard" | "prop", points: number) {
          item.handled = true;
          item.vx = -150;
          item.vy = -this.randomBetween(330, 560);
          item.spin = this.randomBetween(240, 520);
          item.setTint(label === "hazard" ? 0xffd27d : 0xff6978);
          this.currentDinoState = "smash";
          this.currentDinoFrame = 0;
          this.objectsSmashed += 1;
          this.cameras.main.shake(label === "smashable" ? 120 : 70, label === "smashable" ? 0.009 : 0.004);
          this.dust.emitParticleAt(item.x, item.y, label === "smashable" ? 18 : 8);
          this.addScore(points);
          this.emitSfx(label === "prop" ? "combo" : "smash");
          this.showScorePopup(item.x, item.y - 42, `+${Math.round(points * this.combo)}`);
          this.time.delayedCall(220, () => {
            if (this.state === "running" && this.time.now > this.chargeUntil) this.currentDinoState = "run";
          });
        }

        private addScore(points: number) {
          this.comboHits += 1;
          this.combo = Math.min(1 + this.comboHits * triceratopsGameConfig.scoring.comboStep, triceratopsGameConfig.scoring.maxMultiplier);
          this.longestCombo = Math.max(this.longestCombo, this.combo);
          this.score += Math.round(points * this.combo);
          if (this.comboHits > 0 && this.comboHits % 8 === 0) this.emitSfx("combo");
        }

        private showScorePopup(x: number, y: number, value: string) {
          const text = this.add.text(x, y, value, {
            fontFamily: "system-ui, sans-serif",
            fontSize: "20px",
            color: "#ffe6a8",
            fontStyle: "900",
          }).setOrigin(0.5).setDepth(20);
          this.tweens.add({ targets: text, y: y - 44, alpha: 0, duration: 620, ease: "Quad.easeOut", onComplete: () => text.destroy() });
        }

        private emitSfx(name: TriceratopsSfx) {
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "sfx", name } }));
        }

        private takeDamage(item: SpawnedObject, hint: string) {
          if (item.handled || this.time.now < this.invulnerableUntil || this.state !== "running") return;
          item.handled = true;
          item.vx = -110;
          item.vy = -360;
          item.spin = 420;
          item.setTint(0xff5a62);
          this.hp -= 1;
          this.combo = 1;
          this.comboHits = 0;
          this.invulnerableUntil = this.time.now + 1600;
          this.chargeUntil = 0;
          this.currentDinoState = "hit";
          this.currentDinoFrame = 0;
          this.player.setTexture(dinoTexture("hit")).setVelocityY(-240).setAlpha(0.62);
          this.dust.emitParticleAt(this.player.x, this.player.y + 18, 18);
          this.cameras.main.shake(180, 0.011);
          this.emitSfx("damage");
          this.showScorePopup(this.player.x + 60, this.player.y - 34, hint);
          if (this.hp <= 0) {
            this.time.delayedCall(220, () => this.gameOver());
            return;
          }
          this.time.delayedCall(450, () => {
            if (this.state === "running") {
              this.currentDinoState = "stunned";
              this.runSpeed = Math.max(triceratopsGameConfig.world.baseSpeed, this.runSpeed - 28);
            }
          });
          this.time.delayedCall(1600, () => {
            if (this.state === "running") {
              this.player.setAlpha(1);
              this.currentDinoState = "run";
            }
          });
        }

        private updateHud(time: number) {
          this.scoreText.setText(Math.round(this.score).toLocaleString());
          this.comboText.setText(`Combo x${this.combo.toFixed(2)}`);
          this.hpText.setText(`HP ${Math.max(0, this.hp)}`);
          const progress = Math.min(100, Math.round((this.distance / triceratopsGameConfig.scene.targetDistance) * 100));
          this.progressText.setText(`Scene 1 ${progress}%`);
          this.rampageText.setText(time < this.rampageUntil ? "RAMPAGE" : "");
          if (time - this.lastScoreNotifyAt > 180) {
            this.lastScoreNotifyAt = time;
            window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "score", score: Math.round(this.score) } }));
          }
        }

        private sceneComplete() {
          if (this.state === "complete") return;
          this.state = "complete";
          this.clearGroups();
          this.currentDinoState = "victory";
          this.currentDinoFrame = 0;
          this.player.setTexture(dinoTexture("victory")).setVelocity(0, 0).setAlpha(1).setAngle(0);
          this.score += 1200 + this.hp * 350 + Math.round(this.combo * 220);
          this.emitSfx("wrap");
          this.cameras.main.flash(280, 245, 193, 111, false);
          this.cameras.main.shake(220, 0.006);
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "scene-complete", result: this.resultPayload(true) } }));
        }

        private gameOver() {
          if (this.state === "over") return;
          this.state = "over";
          this.clearGroups();
          this.currentDinoState = "over";
          this.currentDinoFrame = 0;
          this.player.setTexture(dinoTexture("over")).setVelocity(0, -160).setAngle(-8).setAlpha(1);
          this.cameras.main.shake(220, 0.012);
          this.emitSfx("cut");
          window.dispatchEvent(new CustomEvent<SceneMessage>("triceratops:scene", { detail: { type: "game-over", result: this.resultPayload(false) } }));
        }

        private animatePlayer(time: number) {
          if (!this.player) return;
          const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
          const airborne = Boolean(body && !body.blocked.down && this.player.y < triceratopsGameConfig.world.groundY - 68);
          let state = this.currentDinoState;
          if (this.state === "complete") state = "victory";
          else if (this.state === "over") state = "over";
          else if (this.state === "running") {
            if (this.time.now < this.invulnerableUntil && (state === "hit" || state === "stunned")) state = state === "hit" ? "hit" : "stunned";
            else if (this.time.now <= this.rampageUntil) state = state === "smash" ? "smash" : "rampage";
            else if (this.time.now <= this.chargeUntil) state = state === "smash" ? "smash" : "charge";
            else if (airborne) state = body && body.velocity.y > 0 ? "jumpFall" : "jump";
            else if (state !== "smash" && state !== "land") state = this.runSpeed > triceratopsGameConfig.world.baseSpeed + 54 ? "fastRun" : "run";
          } else if (this.state === "boot") {
            state = "idle";
          }
          const frameMs = DINO_FRAME_MS[state];
          const frame = Math.floor(time / frameMs) % DINO_STATES[state];
          if (state !== this.currentDinoState || frame !== this.currentDinoFrame) {
            this.currentDinoState = state;
            this.currentDinoFrame = frame;
            this.player.setTexture(dinoTexture(state, frame));
          }
        }

        private resultPayload(completed: boolean): TriceratopsResult {
          const playTimeMs = Math.max(1000, Date.now() - startedAtRef.current);
          return {
            sceneId: triceratopsGameConfig.scene.sceneId,
            completed,
            grade: this.gradeFor(completed, playTimeMs),
            score: Math.max(0, Math.round(this.score)),
            playTimeMs,
            distance: Math.round(this.distance),
            hpRemaining: Math.max(0, this.hp),
            objectsSmashed: this.objectsSmashed,
            carsSmashed: this.objectsSmashed,
            reelsCollected: this.reelsCollected,
            propsDestroyed: this.objectsSmashed,
            hazardsCleared: this.hazardsCleared,
            rampageActivations: this.rampageActivations,
            checkpointsCleared: Math.floor(this.checkpointDistance / triceratopsGameConfig.scene.checkpointEvery),
            maxCombo: Number(this.longestCombo.toFixed(2)),
          };
        }

        private gradeFor(completed: boolean, playTimeMs: number): TriceratopsResult["grade"] {
          if (!completed) return "C";
          if (this.hp >= 2 && playTimeMs <= triceratopsGameConfig.scene.sRankTimeMs && this.longestCombo >= 3.4) return "S";
          if (this.hp >= 1 && this.longestCombo >= 2.4) return "A";
          return "B";
        }

        private randomBetween(min: number, max: number) {
          return Phaser.Math.Between(min, max);
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: triceratopsGameConfig.world.width,
        height: triceratopsGameConfig.world.height,
        backgroundColor: "#07070a",
        pixelArt: true,
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
        },
        physics: {
          default: "arcade",
          arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
          },
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: BacklotRampageScene,
      });
      activeGame = game;
      gameRef.current = game;
    }

    function handleSceneEvent(event: Event) {
      const detail = (event as CustomEvent<SceneMessage>).detail;
      if (detail.type === "score") setLastScore(detail.score);
      if (detail.type === "sfx") audioRef.current?.playSfx(detail.name);
      if (detail.type === "pause") setPaused(detail.paused);
      if (detail.type === "scene-complete") {
        audioRef.current?.stopMusic();
        setPaused(false);
        setPhase("complete");
        recordResult(detail.result);
      }
      if (detail.type === "game-over") {
        audioRef.current?.stopMusic();
        setPaused(false);
        setPhase("over");
        recordResult(detail.result);
      }
    }

    window.addEventListener("triceratops:scene", handleSceneEvent);
    bootGame();

    return () => {
      mounted = false;
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
    if (isPortrait) return;
    clearCountdownTimers();
    startedAtRef.current = Date.now();
    gameOverSentRef.current = false;
    setLastResult(null);
    setLastScore(0);
    setSyncStatus("");
    setPaused(false);
    setPhase("intro");
    await requestFullscreen();
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
    onNavigate("/games");
  }

  function setControl(input: TriceratopsInput, active: boolean) {
    bridgeRef.current?.setInput(input, active);
  }

  const resultTitle = phase === "complete" ? "THAT'S A WRAP!" : "CUT!";

  return (
    <section ref={shellRef} className={`triceratops-fullscreen ${phase === "running" || phase === "intro" ? "is-running" : ""} ${paused ? "is-paused" : ""}`}>
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
            <h2>Rampage the Backlot</h2>
            <p>Jump hazards, smash breakaway sets, collect golden reels, and keep your combo alive.</p>
            <div className="triceratops-control-copy">
              <span>{controlHint.mobile}</span>
              <span>{controlHint.desktop}</span>
            </div>
            <div className="triceratops-start-actions">
              <button className="triceratops-play-button" onClick={startGame} type="button">
                Start Scene
              </button>
              <button className="triceratops-sound-button" onClick={toggleAudio} type="button">
                {audioMuted ? "Sound Off" : "Sound On"}
              </button>
            </div>
            <div className="triceratops-secondary-actions" aria-label="Scene information">
              <span>Scene 1: Studio Backlot</span>
              <span>Goal: reach the wrap marker</span>
              <span>Grade: speed, health, combo</span>
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
            <div className="triceratops-control-pad triceratops-control-pad-left" aria-label="Movement controls">
              <button
                type="button"
                aria-label="Move left"
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={() => setControl("left", true)}
                onPointerUp={() => setControl("left", false)}
                onPointerCancel={() => setControl("left", false)}
                onPointerLeave={() => setControl("left", false)}
              >
                Left
              </button>
              <button
                type="button"
                aria-label="Move right"
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={() => setControl("right", true)}
                onPointerUp={() => setControl("right", false)}
                onPointerCancel={() => setControl("right", false)}
                onPointerLeave={() => setControl("right", false)}
              >
                Right
              </button>
            </div>
            <div className="triceratops-control-pad triceratops-control-pad-right" aria-label="Action controls">
              <button
                type="button"
                aria-label="Jump"
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={() => setControl("jump", true)}
                onPointerUp={() => setControl("jump", false)}
                onPointerCancel={() => setControl("jump", false)}
                onPointerLeave={() => setControl("jump", false)}
              >
                A
              </button>
              <button
                type="button"
                aria-label="Charge and smash"
                onContextMenu={(event) => event.preventDefault()}
                onPointerDown={() => setControl("charge", true)}
                onPointerUp={() => setControl("charge", false)}
                onPointerCancel={() => setControl("charge", false)}
                onPointerLeave={() => setControl("charge", false)}
              >
                B
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
                <strong>{lastResult.grade}</strong>
                Grade
              </span>
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
                <strong>{lastResult.reelsCollected}</strong>
                Reels
              </span>
              <span>
                <strong>x{lastResult.maxCombo.toFixed(2)}</strong>
                Best combo
              </span>
              <span>
                <strong>{lastResult.distance}</strong>
                Distance
              </span>
              <span>
                <strong>{lastResult.checkpointsCleared}</strong>
                Checkpoints
              </span>
            </div>
            <div className="triceratops-end-actions">
              <button className="triceratops-play-button" onClick={restartGame} type="button">
                Play Again
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
