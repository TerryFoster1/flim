import { relicRunConfig } from "./config";
import { PHASER_SOURCE } from "../triceratops/phaserSource";

export function createRelicRunHtml() {
  const configJson = JSON.stringify(relicRunConfig);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
  <style>
    html, body, #game { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #050407; touch-action: none; }
    body::after {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        repeating-linear-gradient(0deg, rgba(255,255,255,0.045), rgba(255,255,255,0.045) 1px, transparent 1px, transparent 4px),
        radial-gradient(circle at center, transparent 0 44%, rgba(0,0,0,0.45) 76%);
      opacity: 0.38;
      z-index: 3;
    }
    canvas { display: block; image-rendering: pixelated; }
  </style>
</head>
<body>
<div id="game"></div>
<script>${PHASER_SOURCE}</script>
<script>
(() => {
  const FLIM_CONFIG = ${configJson};
  const GAME_WIDTH = 960;
  const GAME_HEIGHT = 540;
  const GROUND_Y = FLIM_CONFIG.player.groundY;
  const HERO_X = FLIM_CONFIG.player.runX;

  function post(type, payload = {}) {
    const message = JSON.stringify({ type, payload });
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(message);
    }
  }

  let audioContext = null;
  function playTone(frequency, duration = 0.08, volume = 0.045) {
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_error) {
      // WebView audio can be unavailable until a user gesture; gameplay continues silently.
    }
  }

  class RelicRunScene extends Phaser.Scene {
    constructor() {
      super("RelicRunScene");
      this.state = "title";
      this.score = 0;
      this.distance = 0;
      this.combo = 1;
      this.comboHits = 0;
      this.perfectSwings = 0;
      this.perfectJumps = 0;
      this.whipHits = 0;
      this.beetlesDefeated = 0;
      this.mummiesDefeated = 0;
      this.relics = 0;
      this.filmReels = 0;
      this.speed = 265;
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.isSwinging = false;
      this.holdStartedAt = 0;
      this.holdingWhip = false;
      this.lastInputAt = -999;
      this.lastScorePost = 0;
      this.guardianCharges = 0;
      this.powerUntil = 0;
      this.powerName = "";
      this.mapRevealUntil = 0;
    }

    create() {
      post("GAME_READY", { gameId: FLIM_CONFIG.gameId });
      this.cameras.main.setBackgroundColor("#09070a");
      this.groups = {
        hazards: [],
        enemies: [],
        anchors: [],
        collectibles: [],
        particles: [],
        platforms: []
      };
      this.createWorld();
      this.createHero();
      this.createHud();
      this.showTitle();
      this.input.on("pointerdown", this.onPointerDown, this);
      this.input.on("pointerup", this.onPointerUp, this);
      window.FLIM_GAME_COMMAND = (command) => {
        if (command === "PAUSE") {
          post("GAME_PAUSED", this.createPayload());
          this.scene.pause();
        }
        if (command === "RESUME") {
          post("GAME_RESUMED", this.createPayload());
          this.scene.resume();
        }
      };
      window.addEventListener("beforeunload", () => {
        window.FLIM_GAME_COMMAND = null;
      });
    }

    createWorld() {
      this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x0a0710).setOrigin(0);
      this.add.rectangle(0, 0, GAME_WIDTH, 190, 0x171022, 0.8).setOrigin(0);
      this.moon = this.add.circle(780, 92, 46, 0xf5c16f, 0.16).setDepth(0);
      this.backLayer = [];
      for (let i = 0; i < 9; i += 1) {
        const temple = this.add.container(i * 148, GROUND_Y - 90 - (i % 3) * 20).setDepth(0);
        temple.add(this.add.rectangle(0, 40, 104, 155 + (i % 2) * 34, i % 2 ? 0x211629 : 0x2c1d25).setOrigin(0.5, 1));
        temple.add(this.add.rectangle(0, -55, 112, 12, 0x7b5529, 0.8));
        temple.add(this.add.triangle(-22, -64, 0, 24, 24, 24, 12, 0, 0x4a2e1c));
        this.backLayer.push({ sprite: temple, speed: 36 + i * 2 });
      }
      this.ground = this.add.container(0, GROUND_Y).setDepth(2);
      for (let i = 0; i < 18; i += 1) {
        const block = this.add.rectangle(i * 64, 20 + (i % 2) * 3, 66, 44, 0x322318).setStrokeStyle(2, 0x72502b, 0.8).setOrigin(0);
        this.ground.add(block);
      }
      this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 3, GAME_WIDTH, 6, 0xf5c16f, 0.36).setDepth(3);
    }

    createHero() {
      this.hero = this.add.container(HERO_X, GROUND_Y - 78).setDepth(8);
      this.heroBody = this.add.rectangle(0, 20, 38, 58, 0xa66a33).setStrokeStyle(3, 0x1c120b);
      this.heroJacket = this.add.rectangle(0, 18, 45, 43, 0x5b3820).setStrokeStyle(2, 0x1c120b);
      this.heroHead = this.add.rectangle(0, -28, 36, 34, 0xc58b52).setStrokeStyle(3, 0x1c120b);
      this.heroHair = this.add.rectangle(2, -48, 38, 12, 0x23150d);
      this.heroScarf = this.add.rectangle(1, -5, 44, 9, 0xf5c16f);
      this.heroLegA = this.add.rectangle(-10, 61, 12, 34, 0x2a2019);
      this.heroLegB = this.add.rectangle(12, 61, 12, 34, 0x2a2019);
      this.whipLine = this.add.rectangle(46, -14, 92, 4, 0xd3994d).setOrigin(0, 0.5).setVisible(false);
      this.hero.add([this.heroBody, this.heroJacket, this.heroHead, this.heroHair, this.heroScarf, this.heroLegA, this.heroLegB, this.whipLine]);
    }

    createHud() {
      const font = { fontFamily: "monospace", fontSize: "18px", color: "#fff7e8", fontStyle: "bold" };
      this.scoreText = this.add.text(22, 18, "Score 0", font).setDepth(20);
      this.distanceText = this.add.text(22, 43, "0m", font).setDepth(20);
      this.comboText = this.add.text(GAME_WIDTH - 148, 18, "Combo x1", { ...font, color: "#f5c16f" }).setDepth(20);
      this.powerText = this.add.text(GAME_WIDTH / 2, 18, "", { ...font, color: "#8df2ff" }).setOrigin(0.5, 0).setDepth(20);
    }

    showTitle() {
      this.state = "title";
      this.titleCard = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(30);
      this.titleCard.add(this.add.rectangle(0, 0, 600, 330, 0x070508, 0.9).setStrokeStyle(4, 0xf5c16f, 0.55));
      this.titleCard.add(this.add.text(0, -112, FLIM_CONFIG.title, { fontFamily: "monospace", fontSize: "54px", color: "#f5c16f", fontStyle: "bold" }).setOrigin(0.5));
      this.titleCard.add(this.add.text(0, -58, FLIM_CONFIG.subtitle, { fontFamily: "monospace", fontSize: "22px", color: "#fff7e8" }).setOrigin(0.5));
      this.titleCard.add(this.add.text(0, 2, "Swipe up to jump. Tap to whip. Hold to swing.", { fontFamily: "monospace", fontSize: "18px", color: "#c9bda9", align: "center" }).setOrigin(0.5));
      this.titleCard.add(this.add.text(0, 82, "TAP TO START", { fontFamily: "monospace", fontSize: "24px", color: "#050407", fontStyle: "bold", backgroundColor: "#f5c16f", padding: { x: 18, y: 12 } }).setOrigin(0.5));
    }

    startGame() {
      this.state = "running";
      this.score = 0;
      this.distance = 0;
      this.combo = 1;
      this.comboHits = 0;
      this.perfectSwings = 0;
      this.perfectJumps = 0;
      this.whipHits = 0;
      this.beetlesDefeated = 0;
      this.mummiesDefeated = 0;
      this.relics = 0;
      this.filmReels = 0;
      this.speed = 265;
      this.verticalVelocity = 0;
      this.isGrounded = true;
      this.isSwinging = false;
      this.guardianCharges = 0;
      this.powerName = "";
      this.powerUntil = 0;
      this.mapRevealUntil = 0;
      this.nextSpawnX = GAME_WIDTH + 120;
      if (this.titleCard) this.titleCard.destroy();
      this.clearObjects();
      this.hero.y = GROUND_Y - 78;
      post("GAME_STARTED", this.createPayload());
      playTone(330, 0.06);
      this.time.delayedCall(90, () => playTone(440, 0.06));
      this.time.delayedCall(180, () => playTone(660, 0.08));
    }

    clearObjects() {
      Object.values(this.groups).forEach((group) => group.forEach((item) => item.sprite.destroy()));
      Object.keys(this.groups).forEach((key) => { this.groups[key] = []; });
    }

    onPointerDown(pointer) {
      if (this.state === "title" || this.state === "over") {
        this.startGame();
        return;
      }
      if (this.state !== "running") return;
      this.pointerStart = { x: pointer.x, y: pointer.y, time: this.time.now };
      this.holdTimer = this.time.delayedCall(FLIM_CONFIG.controls.holdMinMs, () => {
        if (this.state === "running" && !this.isSwinging && this.pointerStart) {
          this.beginWhipThrow();
        }
      });
    }

    onPointerUp(pointer) {
      if (this.state !== "running" || !this.pointerStart) return;
      if (this.holdTimer) this.holdTimer.remove(false);
      const duration = this.time.now - this.pointerStart.time;
      const dy = pointer.y - this.pointerStart.y;
      const locked = this.time.now - this.lastInputAt < FLIM_CONFIG.controls.inputLockMs;
      if (!locked && this.isSwinging) {
        this.releaseSwing(duration);
      } else if (!locked && dy < -FLIM_CONFIG.controls.swipeMinDy && duration <= FLIM_CONFIG.controls.swipeMaxMs) {
        this.jump();
      } else if (!locked && !this.holdingWhip && duration <= FLIM_CONFIG.controls.tapMaxMs) {
        this.whipStrike();
      } else if (!locked && this.holdingWhip) {
        this.releaseSwing(duration);
      }
      this.holdingWhip = false;
      this.pointerStart = null;
      this.lastInputAt = this.time.now;
    }

    jump() {
      if (!this.isGrounded) return;
      this.isGrounded = false;
      this.verticalVelocity = FLIM_CONFIG.player.jumpVelocity;
      this.addScore("jump");
      this.flashText("Jump!", HERO_X, this.hero.y - 76, "#fff7e8");
      playTone(520, 0.05);
    }

    beginWhipThrow() {
      this.holdingWhip = true;
      this.holdStartedAt = this.time.now;
      this.whipLine.setVisible(true);
      const anchor = this.groups.anchors.find((item) => item.sprite.x > HERO_X + 80 && item.sprite.x < HERO_X + FLIM_CONFIG.swing.attachRangePx);
      if (anchor) {
        this.isSwinging = true;
        this.swingAnchor = anchor;
        this.verticalVelocity = 0;
        this.flashText("Attached!", HERO_X + 70, this.hero.y - 90, "#8df2ff");
        playTone(740, 0.05);
      } else {
        this.flashText("No anchor", HERO_X + 70, this.hero.y - 90, "#c9bda9");
        playTone(180, 0.06, 0.03);
      }
    }

    releaseSwing(duration) {
      if (!this.isSwinging) {
        this.whipLine.setVisible(false);
        return;
      }
      const heldMs = this.time.now - this.holdStartedAt;
      const perfect = heldMs >= FLIM_CONFIG.swing.perfectReleaseMinMs && heldMs <= FLIM_CONFIG.swing.perfectReleaseMaxMs;
      this.isSwinging = false;
      this.whipLine.setVisible(false);
      this.verticalVelocity = perfect ? -540 : heldMs > FLIM_CONFIG.swing.lateReleaseMs ? -250 : -380;
      this.hero.y = Math.min(this.hero.y, GROUND_Y - 120);
      this.addScore(perfect ? "perfectSwing" : "swing");
      this.flashText(perfect ? "Perfect Swing!" : "Swing!", HERO_X + 60, this.hero.y - 80, perfect ? "#f5c16f" : "#fff7e8");
      playTone(perfect ? 880 : 620, 0.08);
    }

    whipStrike() {
      this.whipLine.setVisible(true);
      this.time.delayedCall(120, () => this.whipLine.setVisible(false));
      const candidates = [...this.groups.enemies, ...this.groups.hazards, ...this.groups.collectibles]
        .filter((item) => item.sprite.x > HERO_X && item.sprite.x < HERO_X + FLIM_CONFIG.whip.rangePx)
        .sort((a, b) => a.sprite.x - b.sprite.x);
      const target = candidates[0];
      if (!target) {
        this.flashText("Whip!", HERO_X + 70, this.hero.y - 76, "#c9bda9");
        playTone(300, 0.035);
        return;
      }
      this.whipHits += 1;
      if (target.kind === "beetle") this.beetlesDefeated += 1;
      if (target.kind === "mummy") this.mummiesDefeated += 1;
      this.addScore(target.kind === "beetle" ? "beetle" : target.kind === "mummy" ? "mummy" : "whipHit");
      this.pixelBurst(target.sprite.x, target.sprite.y, target.kind === "beetle" ? 0x6ee7b7 : 0xd8c2a1);
      target.sprite.destroy();
      target.dead = true;
      this.flashText("Hit!", HERO_X + 100, this.hero.y - 86, "#f5c16f");
      playTone(980, 0.06);
    }

    addScore(event) {
      const base = FLIM_CONFIG.scoring[event] || 0;
      this.comboHits += 1;
      this.combo = Math.min(8, 1 + Math.floor(this.comboHits / 4));
      this.score += Math.round(base * this.combo * (this.powerName === "Double Feature" ? 2 : 1));
      if (event === "perfectJump") this.perfectJumps += 1;
      if (event === "relic") this.relics += 1;
      if (event === "filmReel") this.filmReels += 1;
    }

    update(_time, delta) {
      if (this.state !== "running") return;
      const dt = delta / 1000;
      this.speed = Math.min(540, this.speed + dt * 7);
      this.distance += this.speed * dt;
      this.score += Math.floor((this.speed * dt) / FLIM_CONFIG.scoring.distancePointEveryPx);
      this.updateHero(dt);
      this.scrollWorld(dt);
      this.spawnSections();
      this.handleCollisions();
      this.cleanupDeadObjects();
      this.updateHud();
      if (this.time.now - this.lastScorePost > 500) {
        this.lastScorePost = this.time.now;
        post("SCORE_UPDATED", this.createPayload());
      }
    }

    updateHero(dt) {
      if (this.isSwinging && this.swingAnchor && !this.swingAnchor.dead) {
        const phase = Math.sin(this.time.now / 180);
        this.hero.x = HERO_X + phase * 18;
        this.hero.y = Math.min(GROUND_Y - 124, this.swingAnchor.sprite.y + 92 + Math.abs(phase) * 42);
        this.whipLine.width = Math.max(30, this.swingAnchor.sprite.x - this.hero.x);
        this.whipLine.rotation = -0.48 + phase * 0.2;
        return;
      }
      this.hero.x = HERO_X;
      this.whipLine.rotation = 0;
      if (!this.isGrounded) {
        this.verticalVelocity += FLIM_CONFIG.player.gravity * dt;
        this.hero.y += this.verticalVelocity * dt;
        if (this.hero.y >= GROUND_Y - 78) {
          const landingVelocity = this.verticalVelocity;
          this.hero.y = GROUND_Y - 78;
          this.verticalVelocity = 0;
          this.isGrounded = true;
          if (landingVelocity > 690) {
            this.addScore("perfectJump");
            this.flashText("Perfect Landing", HERO_X, this.hero.y - 92, "#f5c16f");
          }
        }
      }
      this.heroLegA.y = 61 + Math.sin(this.time.now / 70) * 4;
      this.heroLegB.y = 61 - Math.sin(this.time.now / 70) * 4;
    }

    scrollWorld(dt) {
      this.backLayer.forEach((item) => {
        item.sprite.x -= item.speed * dt;
        if (item.sprite.x < -120) item.sprite.x += GAME_WIDTH + 260;
      });
      Object.values(this.groups).forEach((group) => {
        group.forEach((item) => {
          item.sprite.x -= (item.parallax || this.speed) * dt;
          if (item.spin) item.sprite.rotation += item.spin * dt;
        });
      });
      this.ground.x = (this.ground.x - this.speed * dt) % 64;
    }

    spawnSections() {
      if (!this.nextSpawnX) this.nextSpawnX = GAME_WIDTH + 120;
      while (this.nextSpawnX < GAME_WIDTH + 260) {
        const difficulty = Math.min(6, 1 + Math.floor(this.distance / 1500));
        const roll = Phaser.Math.Between(0, 100);
        if (roll < 16 + difficulty * 2) this.spawnGap(this.nextSpawnX, difficulty);
        else if (roll < 32) this.spawnAnchorGap(this.nextSpawnX);
        else if (roll < 55) this.spawnEnemy(this.nextSpawnX, roll % 2 ? "beetle" : "mummy");
        else if (roll < 72) this.spawnObstacle(this.nextSpawnX);
        else this.spawnCollectibles(this.nextSpawnX);
        this.nextSpawnX += Phaser.Math.Between(300, 470);
      }
    }

    spawnGap(x, difficulty) {
      const width = Math.min(275, 140 + difficulty * 18);
      const gap = this.add.rectangle(x, GROUND_Y + 23, width, 52, 0x050407).setDepth(4);
      this.groups.hazards.push({ sprite: gap, kind: "gap", width });
    }

    spawnAnchorGap(x) {
      const gap = this.add.rectangle(x + 110, GROUND_Y + 23, 340, 52, 0x050407).setDepth(4);
      const anchor = this.add.container(x + 270, 150).setDepth(7);
      anchor.add(this.add.rectangle(0, -52, 7, 104, 0x71502a));
      anchor.add(this.add.rectangle(0, 0, 34, 18, 0xf5c16f).setStrokeStyle(2, 0x1c120b));
      this.groups.hazards.push({ sprite: gap, kind: "gap", width: 340 });
      this.groups.anchors.push({ sprite: anchor, kind: "anchor" });
    }

    spawnEnemy(x, kind) {
      if (kind === "beetle") {
        const beetle = this.add.container(x, GROUND_Y - Phaser.Math.Between(126, 178)).setDepth(6);
        beetle.add(this.add.rectangle(0, 0, 38, 24, 0x1f6b4d).setStrokeStyle(2, 0x092117));
        beetle.add(this.add.rectangle(-22, -4, 16, 6, 0x75e4b6));
        beetle.add(this.add.rectangle(22, -4, 16, 6, 0x75e4b6));
        this.groups.enemies.push({ sprite: beetle, kind: "beetle" });
      } else {
        const mummy = this.add.container(x, GROUND_Y - 46).setDepth(6);
        mummy.add(this.add.rectangle(0, 0, 38, 78, 0xcdbb9d).setStrokeStyle(2, 0x332820));
        mummy.add(this.add.rectangle(-6, -18, 24, 6, 0xefe2c6));
        mummy.add(this.add.rectangle(8, 2, 26, 6, 0xefe2c6));
        mummy.add(this.add.rectangle(6, -30, 5, 7, 0x09070a));
        this.groups.enemies.push({ sprite: mummy, kind: "mummy" });
      }
    }

    spawnObstacle(x) {
      const pot = this.add.container(x, GROUND_Y - 24).setDepth(5);
      pot.add(this.add.rectangle(0, 10, 36, 38, 0x8f5528).setStrokeStyle(2, 0x28160c));
      pot.add(this.add.rectangle(0, -8, 44, 10, 0xd3944d));
      this.groups.hazards.push({ sprite: pot, kind: "pot" });
    }

    spawnCollectibles(x) {
      for (let i = 0; i < 4; i += 1) {
        const kind = i === 3 && Phaser.Math.Between(0, 1) ? "filmReel" : "relic";
        const item = this.add.container(x + i * 46, GROUND_Y - Phaser.Math.Between(84, 145)).setDepth(5);
        if (kind === "filmReel") {
          item.add(this.add.circle(0, 0, 15, 0xe8e2d7).setStrokeStyle(3, 0x1b1b1f));
          item.add(this.add.circle(-5, -4, 3, 0x050407));
          item.add(this.add.circle(6, -2, 3, 0x050407));
          item.add(this.add.circle(0, 7, 3, 0x050407));
        } else {
          item.add(this.add.diamond(0, 0, 24, 24, 0xf5c16f).setStrokeStyle(2, 0x3f2a12));
        }
        this.groups.collectibles.push({ sprite: item, kind, spin: kind === "filmReel" ? 3 : 1.2 });
      }
      if (Phaser.Math.Between(0, 100) < 22) {
        this.spawnPowerUp(x + 238);
      }
    }

    spawnPowerUp(x) {
      const names = ["Director's Cut", "Lost Map", "Double Feature", "Magnet", "Guardian Spirit"];
      const powerName = names[Phaser.Math.Between(0, names.length - 1)];
      const item = this.add.container(x, GROUND_Y - Phaser.Math.Between(110, 168)).setDepth(6);
      const colors = {
        "Director's Cut": 0xff5b6e,
        "Lost Map": 0xd7b56d,
        "Double Feature": 0x8df2ff,
        Magnet: 0xe8e2d7,
        "Guardian Spirit": 0x9fe6a0
      };
      item.add(this.add.rectangle(0, 0, 34, 34, colors[powerName], 0.92).setStrokeStyle(3, 0x050407));
      item.add(this.add.rectangle(0, 0, 18, 8, 0x050407, 0.55));
      item.add(this.add.text(0, -3, powerName.slice(0, 1), { fontFamily: "monospace", fontSize: "18px", color: "#050407", fontStyle: "bold" }).setOrigin(0.5));
      this.groups.collectibles.push({ sprite: item, kind: "powerUp", powerName, spin: 2.4 });
    }

    handleCollisions() {
      const heroBounds = new Phaser.Geom.Rectangle(HERO_X - 24, this.hero.y - 54, 64, 116);
      if (this.powerName === "Magnet" && this.powerUntil > this.time.now) {
        this.groups.collectibles.forEach((item) => {
          if (!item.dead && item.kind !== "powerUp" && Math.abs(item.sprite.x - HERO_X) < 190) {
            item.sprite.x += (HERO_X - item.sprite.x) * 0.08;
            item.sprite.y += (this.hero.y - 38 - item.sprite.y) * 0.08;
          }
        });
      }
      this.groups.collectibles.forEach((item) => {
        if (!item.dead && Phaser.Geom.Rectangle.Overlaps(heroBounds, item.sprite.getBounds())) {
          item.dead = true;
          item.sprite.destroy();
          if (item.kind === "powerUp") {
            this.activatePowerUp(item.powerName);
          } else {
            this.addScore(item.kind === "filmReel" ? "filmReel" : "relic");
            playTone(item.kind === "filmReel" ? 780 : 690, 0.055);
          }
          this.pixelBurst(HERO_X + 10, this.hero.y - 50, item.kind === "filmReel" ? 0xe8e2d7 : 0xf5c16f);
        }
      });
      [...this.groups.enemies, ...this.groups.hazards].forEach((item) => {
        if (item.dead) return;
        if (Phaser.Geom.Rectangle.Overlaps(heroBounds, item.sprite.getBounds())) {
          if (item.kind === "gap" && this.hero.y < GROUND_Y - 88) return;
          if (this.guardianCharges > 0) {
            this.guardianCharges -= 1;
            item.dead = true;
            item.sprite.destroy();
            this.flashText("Guardian saved you", HERO_X + 90, this.hero.y - 88, "#8df2ff");
            playTone(1040, 0.08);
            return;
          }
          this.endGame();
        }
      });
    }

    activatePowerUp(powerName) {
      this.powerName = powerName;
      const now = this.time.now;
      if (powerName === "Director's Cut") {
        this.powerUntil = now + FLIM_CONFIG.powerUps.directorCutMs;
        this.speed = Math.max(220, this.speed - 45);
      } else if (powerName === "Lost Map") {
        this.powerUntil = now + FLIM_CONFIG.powerUps.lostMapMs;
        this.mapRevealUntil = this.powerUntil;
      } else if (powerName === "Double Feature") {
        this.powerUntil = now + FLIM_CONFIG.powerUps.doubleFeatureMs;
      } else if (powerName === "Magnet") {
        this.powerUntil = now + FLIM_CONFIG.powerUps.magnetMs;
      } else {
        this.powerUntil = now + 3500;
        this.guardianCharges += FLIM_CONFIG.powerUps.guardianCharges;
      }
      this.addScore("filmReel");
      this.flashText(powerName, HERO_X + 84, this.hero.y - 104, "#8df2ff");
      playTone(1180, 0.1);
    }

    endGame() {
      this.state = "over";
      post("GAME_OVER", this.createPayload());
      playTone(160, 0.18, 0.05);
      this.gameOverCard = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(40);
      this.gameOverCard.add(this.add.rectangle(0, 0, 580, 310, 0x070508, 0.92).setStrokeStyle(4, 0xf5c16f, 0.55));
      this.gameOverCard.add(this.add.text(0, -104, "RUN COMPLETE", { fontFamily: "monospace", fontSize: "38px", color: "#f5c16f", fontStyle: "bold" }).setOrigin(0.5));
      this.gameOverCard.add(this.add.text(0, -46, "Score " + Math.round(this.score), { fontFamily: "monospace", fontSize: "28px", color: "#fff7e8", fontStyle: "bold" }).setOrigin(0.5));
      this.gameOverCard.add(this.add.text(0, 0, Math.round(this.distance / 10) + "m  |  Relics " + this.relics + "  |  Reels " + this.filmReels, { fontFamily: "monospace", fontSize: "18px", color: "#c9bda9" }).setOrigin(0.5));
      this.gameOverCard.add(this.add.text(0, 76, "TAP TO RUN AGAIN", { fontFamily: "monospace", fontSize: "22px", color: "#050407", fontStyle: "bold", backgroundColor: "#f5c16f", padding: { x: 16, y: 10 } }).setOrigin(0.5));
    }

    cleanupDeadObjects() {
      Object.keys(this.groups).forEach((key) => {
        this.groups[key] = this.groups[key].filter((item) => !item.dead && item.sprite.x > -240);
      });
    }

    updateHud() {
      this.scoreText.setText("Score " + Math.round(this.score));
      this.distanceText.setText(Math.round(this.distance / 10) + "m");
      this.comboText.setText("Combo x" + this.combo);
      if (this.powerUntil <= this.time.now && this.powerName) {
        this.powerName = "";
      }
      this.powerText.setText(this.powerUntil > this.time.now ? this.powerName : "");
      const mapActive = this.mapRevealUntil > this.time.now;
      this.groups.anchors.forEach((item) => item.sprite.setAlpha(mapActive ? 1 : 0.82));
    }

    createPayload() {
      return {
        gameId: FLIM_CONFIG.gameId,
        score: Math.round(this.score),
        distance: Math.round(this.distance),
        combo: Math.max(1, this.combo),
        perfectSwings: this.perfectSwings,
        perfectJumps: this.perfectJumps,
        whipHits: this.whipHits,
        beetlesDefeated: this.beetlesDefeated,
        mummiesDefeated: this.mummiesDefeated,
        enemiesDefeated: this.beetlesDefeated + this.mummiesDefeated,
        relics: this.relics,
        filmReels: this.filmReels
      };
    }

    pixelBurst(x, y, color) {
      for (let i = 0; i < 9; i += 1) {
        const p = this.add.rectangle(x, y, 6, 6, color).setDepth(15);
        this.groups.particles.push({ sprite: p, kind: "particle", parallax: Phaser.Math.Between(120, 360), spin: Phaser.Math.FloatBetween(-4, 4) });
        this.tweens.add({ targets: p, x: x + Phaser.Math.Between(-50, 50), y: y + Phaser.Math.Between(-40, 40), alpha: 0, duration: 360, onComplete: () => { p.destroy(); } });
      }
    }

    flashText(text, x, y, color) {
      const label = this.add.text(x, y, text, { fontFamily: "monospace", fontSize: "18px", color, fontStyle: "bold" }).setOrigin(0.5).setDepth(22);
      this.tweens.add({ targets: label, y: y - 32, alpha: 0, duration: 620, onComplete: () => label.destroy() });
    }
  }

  new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#050407",
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [RelicRunScene],
    pixelArt: true,
    audio: { disableWebAudio: false }
  });
})();
</script>
</body>
</html>`;
}
