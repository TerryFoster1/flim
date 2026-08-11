import { useEffect, useRef, useState } from "react";
import { recordBacklotGameOver, recordBacklotLaunch } from "../../services/backlotService";
import { TRICERATOPS_GAME_ID, triceratopsGameConfig, type TriceratopsResult } from "./gameConfig";
import "./triceratops.css";

type TriceratopsBacklotGameProps = {
  onNavigate: (path: string) => void;
};

type PhaserModule = typeof import("phaser");

type SpawnedObject = Phaser.Physics.Arcade.Sprite & {
  vx: number;
  vy?: number;
  spin?: number;
  collected?: boolean;
  destroyed?: boolean;
  kind?: "car" | "hazard" | "scenery" | "reel" | "rampage" | "directorsCut";
};

export function TriceratopsBacklotGame({ onNavigate }: TriceratopsBacklotGameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const startedAtRef = useRef(Date.now());
  const gameOverSentRef = useRef(false);
  const [syncStatus, setSyncStatus] = useState("");
  const [lastScore, setLastScore] = useState(0);
  const [isCharging, setIsCharging] = useState(false);

  useEffect(() => {
    startedAtRef.current = Date.now();
    recordBacklotLaunch(TRICERATOPS_GAME_ID).catch(() => {
      setSyncStatus("Sign in on staging to save Backlot progress.");
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function bootGame() {
      const Phaser = (await import("phaser")).default as unknown as PhaserModule;
      if (!mounted || !hostRef.current) return;

      class BacklotRunnerScene extends Phaser.Scene {
        private gameState: "title" | "running" | "over" = "title";
        private score = 0;
        private distance = 0;
        private combo = 1;
        private comboHits = 0;
        private maxCombo = 1;
        private carsSmashed = 0;
        private reelsCollected = 0;
        private propsDestroyed = 0;
        private speed: number = triceratopsGameConfig.world.baseSpeed;
        private player!: Phaser.Physics.Arcade.Sprite;
        private bodyGlow!: Phaser.GameObjects.Arc;
        private ground!: Phaser.Physics.Arcade.StaticGroup;
        private cars!: Phaser.Physics.Arcade.Group;
        private hazards!: Phaser.Physics.Arcade.Group;
        private scenery!: Phaser.Physics.Arcade.Group;
        private reels!: Phaser.Physics.Arcade.Group;
        private powerUps!: Phaser.Physics.Arcade.Group;
        private city: Array<{ sprite: Phaser.GameObjects.Rectangle; speed: number }> = [];
        private billboard!: Phaser.GameObjects.Container;
        private scoreText!: Phaser.GameObjects.Text;
        private comboText!: Phaser.GameObjects.Text;
        private powerText!: Phaser.GameObjects.Text;
        private helpText!: Phaser.GameObjects.Text;
        private overlay?: Phaser.GameObjects.Container;
        private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
        private actionKey?: Phaser.Input.Keyboard.Key;
        private shiftKey?: Phaser.Input.Keyboard.Key;
        private chargeUntil = 0;
        private chargeReadyAt = 0;
        private lastReactScoreAt = 0;
        private powerUp: SpawnedObject["kind"] | null = null;
        private powerUpUntil = 0;
        private nextCarAt = 0;
        private nextHazardAt = 0;
        private nextSceneryAt = 0;
        private nextReelAt = 0;
        private nextPowerAt = 0;

        create() {
          this.createTextures();
          this.cameras.main.setBackgroundColor("#08070b");
          this.ground = this.physics.add.staticGroup();
          this.cars = this.physics.add.group({ allowGravity: false });
          this.hazards = this.physics.add.group({ allowGravity: false });
          this.scenery = this.physics.add.group({ allowGravity: false });
          this.reels = this.physics.add.group({ allowGravity: false });
          this.powerUps = this.physics.add.group({ allowGravity: false });

          this.createWorld();
          this.createPlayer();
          this.createHud();
          this.createPhysics();
          this.showTitle();

          this.cursors = this.input.keyboard?.createCursorKeys();
          this.actionKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S);
          this.shiftKey = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
          this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
            if (pointer.y > triceratopsGameConfig.world.height - 112) return;
            if (this.gameState === "title") this.startRun();
            else if (this.gameState === "over") this.scene.restart();
            else this.jump();
          });
          window.addEventListener("triceratops:charge", this.externalCharge);
          this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            window.removeEventListener("triceratops:charge", this.externalCharge);
          });
        }

        shutdown() {
          window.removeEventListener("triceratops:charge", this.externalCharge);
        }

        private externalCharge = () => this.charge();

        private createTextures() {
          const dino = this.add.graphics();
          dino.fillStyle(0x2ebf63, 1);
          dino.fillRoundedRect(10, 34, 96, 60, 24);
          dino.fillStyle(0x56dd76, 1);
          dino.fillRoundedRect(62, 6, 94, 58, 22);
          dino.fillStyle(0x1f8f45, 1);
          dino.fillTriangle(20, 40, 2, 66, 25, 78);
          dino.fillStyle(0xf8efd0, 1);
          dino.fillTriangle(136, 8, 174, 24, 136, 34);
          dino.fillTriangle(146, 34, 178, 44, 146, 55);
          dino.fillStyle(0x07100a, 1);
          dino.fillCircle(112, 24, 6);
          dino.fillStyle(0x1a7938, 1);
          dino.fillRoundedRect(28, 86, 18, 32, 7);
          dino.fillRoundedRect(84, 86, 18, 32, 7);
          dino.generateTexture("triceratops-player", 184, 128);
          dino.destroy();

          const car = this.add.graphics();
          car.fillStyle(0xff5a62, 1);
          car.fillRoundedRect(4, 28, 112, 38, 10);
          car.fillStyle(0xffa34d, 1);
          car.fillRoundedRect(28, 8, 58, 30, 8);
          car.fillStyle(0x07070a, 1);
          car.fillCircle(26, 68, 11);
          car.fillCircle(92, 68, 11);
          car.generateTexture("backlot-car", 124, 84);
          car.destroy();

          const barrier = this.add.graphics();
          barrier.fillStyle(0xf5c16f, 1);
          barrier.fillRoundedRect(8, 10, 72, 64, 8);
          barrier.fillStyle(0x15110e, 1);
          barrier.fillRect(16, 22, 56, 10);
          barrier.fillRect(16, 44, 56, 10);
          barrier.generateTexture("backlot-barrier", 88, 86);
          barrier.destroy();

          const prop = this.add.graphics();
          prop.fillStyle(0x2ac481, 1);
          prop.fillRoundedRect(14, 24, 34, 52, 8);
          prop.fillStyle(0xff9f48, 1);
          prop.fillRoundedRect(4, 10, 56, 16, 6);
          prop.generateTexture("backlot-prop", 68, 86);
          prop.destroy();

          const reel = this.add.graphics();
          reel.fillStyle(0xf5c16f, 1);
          reel.fillCircle(24, 24, 22);
          reel.fillStyle(0x08070b, 1);
          reel.fillCircle(24, 24, 5);
          for (let i = 0; i < 6; i += 1) {
            reel.fillCircle(24 + Math.cos(i) * 12, 24 + Math.sin(i) * 12, 3);
          }
          reel.generateTexture("gold-reel", 48, 48);
          reel.destroy();
        }

        private createWorld() {
          const { width, height, groundY } = triceratopsGameConfig.world;
          this.add.rectangle(0, 0, width, height, 0x090910).setOrigin(0);
          this.add.circle(780, 120, 180, 0xf5c16f, 0.08);
          this.add.circle(710, 170, 260, 0xff5a62, 0.035);

          for (let i = 0; i < 10; i += 1) {
            const building = this.add.rectangle(i * 118, groundY - 82, 94, 190 + (i % 4) * 26, i % 2 ? 0x141722 : 0x202331).setOrigin(0, 1);
            this.city.push({ sprite: building, speed: 26 + i * 2 });
            for (let j = 0; j < 3; j += 1) {
              this.add.rectangle(i * 118 + 18 + j * 23, groundY - 224, 8, 22, 0xf5c16f, 0.22);
            }
          }

          this.billboard = this.add.container(720, 114);
          this.billboard.add(this.add.rectangle(0, 0, 230, 76, 0x211319).setStrokeStyle(3, 0xf5c16f, 0.58));
          this.billboard.add(this.add.text(-92, -20, "BACKLOT", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#f5c16f", fontStyle: "bold" }));
          this.billboard.add(this.add.text(-88, 10, "BOULEVARD", { fontFamily: "system-ui, sans-serif", fontSize: "15px", color: "#fff7e8" }));

          this.add.rectangle(width / 2, groundY + 54, width, 148, 0x19151a).setDepth(1);
          this.add.rectangle(width / 2, groundY, width, 8, 0xf5c16f, 0.48).setDepth(1);
          const groundBody = this.add.rectangle(width / 2, groundY + 44, width, 90, 0x000000, 0);
          this.ground.add(groundBody);
        }

        private createPlayer() {
          const { playerX, groundY } = triceratopsGameConfig.world;
          this.player = this.physics.add.sprite(playerX, groundY - 72, "triceratops-player").setDepth(6);
          this.player.setSize(128, 76).setOffset(22, 36);
          this.player.setCollideWorldBounds(false);
          this.player.setGravityY(1180);
          this.bodyGlow = this.add.circle(playerX + 22, groundY - 82, 78, 0xf5c16f, 0).setDepth(5);
          this.tweens.add({ targets: this.player, scaleY: 0.96, duration: 130, yoyo: true, repeat: -1 });
        }

        private createHud() {
          const { width } = triceratopsGameConfig.world;
          this.scoreText = this.add.text(24, 20, "0", { fontFamily: "system-ui, sans-serif", fontSize: "30px", color: "#fff7e8", fontStyle: "bold" }).setDepth(20);
          this.comboText = this.add.text(26, 58, "x1.00 combo", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#f5c16f", fontStyle: "bold" }).setDepth(20);
          this.powerText = this.add.text(width - 24, 22, "", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#8fffd1", fontStyle: "bold" }).setOrigin(1, 0).setDepth(20);
          this.helpText = this.add.text(width / 2, 508, "Tap / Up to jump    Space / Charge to smash", { fontFamily: "system-ui, sans-serif", fontSize: "16px", color: "#fff7e8" }).setOrigin(0.5).setDepth(20);
        }

        private createPhysics() {
          this.physics.add.collider(this.player, this.ground);
          this.physics.add.overlap(this.player, this.cars, (_player, item) => this.hitCar(item as SpawnedObject));
          this.physics.add.overlap(this.player, this.hazards, (_player, item) => this.hitHazard(item as SpawnedObject));
          this.physics.add.overlap(this.player, this.scenery, (_player, item) => this.hitScenery(item as SpawnedObject));
          this.physics.add.overlap(this.player, this.reels, (_player, item) => this.collectReel(item as SpawnedObject));
          this.physics.add.overlap(this.player, this.powerUps, (_player, item) => this.collectPower(item as SpawnedObject));
        }

        private showTitle() {
          this.overlay = this.add.container(triceratopsGameConfig.world.width / 2, triceratopsGameConfig.world.height / 2).setDepth(30);
          this.overlay.add(this.add.rectangle(0, 0, 660, 326, 0x050407, 0.88).setStrokeStyle(3, 0xf5c16f, 0.72));
          this.overlay.add(this.add.text(0, -98, "TRICERATOPS!", { fontFamily: "Georgia, serif", fontSize: "58px", color: "#f5c16f", fontStyle: "bold" }).setOrigin(0.5));
          this.overlay.add(this.add.text(0, -36, "Terror on Backlot Boulevard", { fontFamily: "system-ui, sans-serif", fontSize: "22px", color: "#fff7e8" }).setOrigin(0.5));
          this.overlay.add(this.add.text(0, 32, "Jump hazards. Charge through cars. Collect golden reels.", { fontFamily: "system-ui, sans-serif", fontSize: "19px", color: "#cfc7bb", align: "center", wordWrap: { width: 520 } }).setOrigin(0.5));
          this.overlay.add(this.add.text(0, 106, "TAP TO START", { fontFamily: "system-ui, sans-serif", fontSize: "25px", color: "#07070a", backgroundColor: "#f5c16f", padding: { x: 24, y: 12 }, fontStyle: "bold" }).setOrigin(0.5));
        }

        private startRun() {
          this.overlay?.destroy();
          this.overlay = undefined;
          this.gameState = "running";
          this.score = 0;
          this.distance = 0;
          this.combo = 1;
          this.comboHits = 0;
          this.maxCombo = 1;
          this.carsSmashed = 0;
          this.reelsCollected = 0;
          this.propsDestroyed = 0;
          this.speed = triceratopsGameConfig.world.baseSpeed;
          this.nextCarAt = this.time.now + 650;
          this.nextHazardAt = this.time.now + 1350;
          this.nextSceneryAt = this.time.now + 820;
          this.nextReelAt = this.time.now + 1180;
          this.nextPowerAt = this.time.now + 7200;
          startedAtRef.current = Date.now();
          gameOverSentRef.current = false;
        }

        update(time: number, delta: number) {
          const dt = Math.min(delta, 34) / 1000;
          this.scrollBackdrop(dt);
          this.bodyGlow.setPosition(this.player.x + 22, this.player.y);
          this.bodyGlow.setAlpha(this.isChargeActive(time) ? 0.22 : 0);

          if (this.gameState !== "running") return;

          const upPressed = this.cursors?.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false;
          const spacePressed = this.cursors?.space ? Phaser.Input.Keyboard.JustDown(this.cursors.space) : false;
          const actionPressed = this.actionKey ? Phaser.Input.Keyboard.JustDown(this.actionKey) : false;
          const shiftPressed = this.shiftKey ? Phaser.Input.Keyboard.JustDown(this.shiftKey) : false;

          if (upPressed || spacePressed) this.jump();
          if (actionPressed || shiftPressed) this.charge();

          const slowMo = this.powerUp === "directorsCut" && time < this.powerUpUntil;
          const simDt = slowMo ? dt * triceratopsGameConfig.powerUps.directorsCutTimeScale : dt;
          this.distance += this.speed * simDt;
          this.speed = Math.min(triceratopsGameConfig.world.maxSpeed, triceratopsGameConfig.world.baseSpeed + Math.floor(this.distance / 1120) * 20);
          this.spawnObjects(time);
          this.updateMovingObjects(simDt);
          this.updateHud(time);
        }

        private scrollBackdrop(dt: number) {
          this.city.forEach((item) => {
            item.sprite.x -= item.speed * dt;
            if (item.sprite.x < -140) item.sprite.x = triceratopsGameConfig.world.width + 30;
          });
          this.billboard.x -= 22 * dt;
          if (this.billboard.x < -180) this.billboard.x = triceratopsGameConfig.world.width + 180;
        }

        private spawnObjects(time: number) {
          if (time > this.nextCarAt) {
            this.spawnObject("car");
            this.nextCarAt = time + Math.max(760, triceratopsGameConfig.spawn.carMs - this.distance / 10);
          }
          if (time > this.nextHazardAt) {
            this.spawnObject("hazard");
            this.nextHazardAt = time + triceratopsGameConfig.spawn.hazardMs + Phaser.Math.Between(-260, 420);
          }
          if (time > this.nextSceneryAt) {
            this.spawnObject("scenery");
            this.nextSceneryAt = time + triceratopsGameConfig.spawn.sceneryMs + Phaser.Math.Between(-160, 360);
          }
          if (time > this.nextReelAt) {
            this.spawnObject("reel");
            this.nextReelAt = time + triceratopsGameConfig.spawn.reelMs + Phaser.Math.Between(-220, 420);
          }
          if (time > this.nextPowerAt) {
            this.spawnObject(Phaser.Math.Between(0, 1) ? "rampage" : "directorsCut");
            this.nextPowerAt = time + Phaser.Math.Between(9000, 13200);
          }
        }

        private spawnObject(kind: SpawnedObject["kind"]) {
          const { width, groundY } = triceratopsGameConfig.world;
          let object: SpawnedObject;

          if (kind === "car") {
            object = this.cars.create(width + 84, groundY - 36, "backlot-car") as SpawnedObject;
            object.setSize(108, 54).setOffset(8, 22);
          } else if (kind === "hazard") {
            object = this.hazards.create(width + 70, groundY - 42, "backlot-barrier") as SpawnedObject;
            object.setSize(62, 66).setOffset(12, 10);
          } else if (kind === "scenery") {
            object = this.scenery.create(width + 54, groundY - 42, "backlot-prop") as SpawnedObject;
            object.setSize(46, 62).setOffset(10, 18);
          } else if (kind === "reel") {
            object = this.reels.create(width + 50, groundY - Phaser.Math.Between(108, 176), "gold-reel") as SpawnedObject;
            object.setCircle(22);
          } else {
            object = this.powerUps.create(width + 60, groundY - 132, "gold-reel") as SpawnedObject;
            object.setTint(kind === "rampage" ? 0xff6b74 : 0x7effca);
            object.setCircle(22);
          }

          object.kind = kind;
          object.vx = -this.speed * (kind === "scenery" ? 0.84 : kind === "hazard" ? 0.94 : 1);
          object.setDepth(kind === "reel" || kind === "rampage" || kind === "directorsCut" ? 4 : 3);
        }

        private updateMovingObjects(dt: number) {
          [this.cars, this.hazards, this.scenery, this.reels, this.powerUps].forEach((group) => {
            group.children.forEach((child: Phaser.GameObjects.GameObject) => {
              const item = child as SpawnedObject;
              item.x += item.vx * dt;
              if (item.kind === "reel" || item.kind === "rampage" || item.kind === "directorsCut") item.angle += 260 * dt;
              if (item.destroyed) {
                item.y += (item.vy || 0) * dt;
                item.vy = (item.vy || 0) + 900 * dt;
                item.angle += (item.spin || 260) * dt;
              }
              if (item.x < -180 || item.y > 620 || item.collected) item.destroy();
            });
          });
        }

        private jump() {
          if (this.gameState !== "running") return;
          if ((this.player.body as Phaser.Physics.Arcade.Body).blocked.down || this.player.y > triceratopsGameConfig.world.groundY - 92) {
            this.player.setVelocityY(-610);
          }
        }

        private charge() {
          if (this.gameState !== "running") return;
          if (this.time.now < this.chargeReadyAt) return;
          this.chargeUntil = this.time.now + triceratopsGameConfig.attack.activeMs;
          this.chargeReadyAt = this.time.now + triceratopsGameConfig.attack.cooldownMs;
          setIsCharging(true);
          this.time.delayedCall(triceratopsGameConfig.attack.activeMs, () => setIsCharging(false));
          this.tweens.killTweensOf(this.player);
          this.tweens.add({ targets: this.player, angle: 7, x: triceratopsGameConfig.world.playerX + 22, duration: 70, yoyo: true, ease: "Quad.easeOut", onComplete: () => this.player.setAngle(0) });
        }

        private isChargeActive(time: number) {
          return time <= this.chargeUntil || (this.powerUp === "rampage" && time <= this.powerUpUntil);
        }

        private hitCar(car: SpawnedObject) {
          if (car.destroyed) return;
          if (this.isChargeActive(this.time.now)) {
            car.destroyed = true;
            car.vx = -170;
            car.vy = -560;
            car.spin = 430;
            this.carsSmashed += 1;
            const perfect = this.time.now > this.chargeUntil - 240 && this.time.now < this.chargeUntil - 80;
            this.addComboScore(perfect ? "perfectCharge" : "carSmash");
            return;
          }
          this.endRun();
        }

        private hitHazard(hazard: SpawnedObject) {
          if (hazard.destroyed) return;
          const body = this.player.body as Phaser.Physics.Arcade.Body;
          if (body.velocity.y > 160 && this.player.y < hazard.y - 16) {
            hazard.destroyed = true;
            hazard.vy = -360;
            hazard.spin = 260;
            this.propsDestroyed += 1;
            this.addComboScore("hazardCleared");
            this.player.setVelocityY(-360);
            return;
          }
          if (this.isChargeActive(this.time.now)) {
            hazard.destroyed = true;
            hazard.vy = -300;
            hazard.spin = 300;
            this.propsDestroyed += 1;
            this.addComboScore("hazardCleared");
            return;
          }
          this.endRun();
        }

        private hitScenery(item: SpawnedObject) {
          if (item.destroyed) return;
          item.destroyed = true;
          item.vy = -250;
          item.spin = 210;
          this.propsDestroyed += 1;
          this.addComboScore("sceneryDestroyed");
        }

        private collectReel(reel: SpawnedObject) {
          if (reel.collected) return;
          reel.collected = true;
          this.reelsCollected += 1;
          this.addComboScore("reelCollected");
        }

        private collectPower(item: SpawnedObject) {
          if (item.collected) return;
          item.collected = true;
          this.powerUp = item.kind || null;
          this.powerUpUntil = this.time.now + (item.kind === "rampage" ? triceratopsGameConfig.powerUps.rampageDurationMs : triceratopsGameConfig.powerUps.directorsCutDurationMs);
          this.addComboScore("rampageBonus");
        }

        private addComboScore(event: keyof typeof triceratopsGameConfig.scoring) {
          const value = triceratopsGameConfig.scoring[event];
          if (typeof value !== "number") return;
          this.comboHits += 1;
          this.combo = Math.min(1 + this.comboHits * triceratopsGameConfig.scoring.comboStep, triceratopsGameConfig.scoring.maxMultiplier);
          this.maxCombo = Math.max(this.maxCombo, this.combo);
          this.score += Math.round(value * this.combo);
        }

        private updateHud(time: number) {
          this.score += Math.floor(this.speed / 48);
          if (time - this.lastReactScoreAt > 220) {
            this.lastReactScoreAt = time;
            setLastScore(Math.round(this.score));
          }
          this.scoreText.setText(Math.round(this.score).toLocaleString());
          this.comboText.setText(`x${this.combo.toFixed(2)} combo`);
          if (this.powerUp && time < this.powerUpUntil) this.powerText.setText(this.powerUp === "rampage" ? "RAMPAGE" : "DIRECTOR'S CUT");
          else {
            this.powerText.setText("");
            this.powerUp = null;
          }
        }

        private endRun() {
          if (this.gameState === "over") return;
          this.gameState = "over";
          const result = this.resultPayload();
          if (!gameOverSentRef.current) {
            gameOverSentRef.current = true;
            recordBacklotGameOver(TRICERATOPS_GAME_ID, result.score, result.playTimeMs).catch(() => {
              setSyncStatus("Session played locally. Sign in on staging to save scores.");
            });
          }
          this.overlay = this.add.container(triceratopsGameConfig.world.width / 2, triceratopsGameConfig.world.height / 2).setDepth(30);
          this.overlay.add(this.add.rectangle(0, 0, 650, 340, 0x050407, 0.91).setStrokeStyle(3, 0xff5b6e, 0.76));
          this.overlay.add(this.add.text(0, -100, "BACKLOT BUSTED", { fontFamily: "Georgia, serif", fontSize: "44px", color: "#ff9f48", fontStyle: "bold" }).setOrigin(0.5));
          this.overlay.add(this.add.text(0, -38, `Score ${result.score.toLocaleString()}`, { fontFamily: "system-ui, sans-serif", fontSize: "32px", color: "#fff7e8", fontStyle: "bold" }).setOrigin(0.5));
          this.overlay.add(this.add.text(0, 34, `Cars ${result.carsSmashed}   Reels ${result.reelsCollected}   Props ${result.propsDestroyed}\nMax Combo x${result.maxCombo.toFixed(2)}`, { fontFamily: "system-ui, sans-serif", fontSize: "17px", color: "#cfc7bb", align: "center" }).setOrigin(0.5));
          this.overlay.add(this.add.text(0, 112, "TAP TO RESTART", { fontFamily: "system-ui, sans-serif", fontSize: "24px", color: "#07070a", backgroundColor: "#f5c16f", padding: { x: 22, y: 11 }, fontStyle: "bold" }).setOrigin(0.5));
        }

        private resultPayload(): TriceratopsResult {
          return {
            score: Math.max(0, Math.round(this.score)),
            playTimeMs: Math.max(1000, Date.now() - startedAtRef.current),
            distance: Math.round(this.distance),
            carsSmashed: this.carsSmashed,
            reelsCollected: this.reelsCollected,
            propsDestroyed: this.propsDestroyed,
            maxCombo: Number(this.maxCombo.toFixed(2)),
          };
        }
      }

      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: hostRef.current,
        width: triceratopsGameConfig.world.width,
        height: triceratopsGameConfig.world.height,
        backgroundColor: "#08070b",
        physics: {
          default: "arcade",
          arcade: {
            gravity: { y: 0, x: 0 },
            debug: false,
          },
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: BacklotRunnerScene,
      });
      gameRef.current = game;
    }

    bootGame();

    return () => {
      mounted = false;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  function triggerCharge() {
    window.dispatchEvent(new CustomEvent("triceratops:charge"));
  }

  return (
    <section className="route-page backlot-game-page triceratops-game-page">
      <div className="triceratops-game-header">
        <button className="secondary-button compact" onClick={() => onNavigate("/games")} type="button">
          Back to Flim Arcade
        </button>
        <div>
          <p>Backlot Arcade</p>
          <h1>TRICERATOPS!</h1>
        </div>
        <strong>{lastScore.toLocaleString()} pts</strong>
      </div>
      <div className="triceratops-game-shell" aria-label="TRICERATOPS playable game">
        <div ref={hostRef} className="triceratops-game-canvas" />
        <div className="triceratops-touch-controls" aria-label="Touch controls">
          <button type="button" onPointerDown={triggerCharge} aria-label="Charge and smash">
            Charge
          </button>
        </div>
      </div>
      <p className="triceratops-game-help">
        Tap the canvas or press Up to jump. Press Space or Charge to smash. {isCharging ? "Charge active." : "Collect reels and survive the backlot."}
      </p>
      {syncStatus ? <p className="backlot-sync-note">{syncStatus}</p> : null}
    </section>
  );
}
