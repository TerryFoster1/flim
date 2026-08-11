import { triceratopsGameConfig } from "./config";
import { PHASER_SOURCE } from "./phaserSource";

export function createTriceratopsHtml() {
  const configJson = JSON.stringify(triceratopsGameConfig);

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
        repeating-linear-gradient(0deg, rgba(255,255,255,0.04), rgba(255,255,255,0.04) 1px, transparent 1px, transparent 4px),
        radial-gradient(circle at center, transparent 0 42%, rgba(0,0,0,0.42) 75%);
      mix-blend-mode: screen;
      opacity: 0.35;
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
  const GROUND_Y = 424;
  const DINO_X = 150;

  function post(type, payload = {}) {
    const message = JSON.stringify({ type, payload });
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(message);
    }
  }

  class BacklotRunner extends Phaser.Scene {
    constructor() {
      super("BacklotRunner");
      this.gameState = "title";
      this.score = 0;
      this.distance = 0;
      this.combo = 1;
      this.comboHits = 0;
      this.maxCombo = 1;
      this.vehiclesFlipped = 0;
      this.perfectFlips = 0;
      this.pedestriansStomped = 0;
      this.sceneryDestroyed = 0;
      this.reelsCollected = 0;
      this.health = FLIM_CONFIG.player.health;
      this.attackStartedAt = -9999;
      this.attackCoolingUntil = 0;
      this.speed = 250;
      this.lastScorePost = 0;
      this.powerUp = null;
      this.powerUpUntil = 0;
    }

    create() {
      post("GAME_READY", { gameId: FLIM_CONFIG.gameId });
      this.cameras.main.setBackgroundColor("#0b0a10");
      this.city = [];
      this.cars = [];
      this.flippedCars = [];
      this.pedestrians = [];
      this.scenery = [];
      this.reels = [];
      this.powerUps = [];
      this.createWorld();
      this.createDino();
      this.createHud();
      this.showTitle();
      this.input.on("pointerdown", () => this.handleTap());
      window.FLIM_GAME_COMMAND = (command) => {
        if (command === "PAUSE") this.scene.pause();
        if (command === "RESUME") this.scene.resume();
      };
    }

    createWorld() {
      this.sky = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x11121d).setOrigin(0);
      this.spotlight = this.add.circle(780, 130, 175, 0xf5c16f, 0.08);
      for (let i = 0; i < 9; i += 1) {
        const building = this.add.rectangle(i * 142, 160 + (i % 3) * 18, 120, 250 + (i % 4) * 24, i % 2 ? 0x171925 : 0x202230).setOrigin(0, 1);
        building.depth = 0;
        this.city.push({ sprite: building, speed: 35 + i * 3 });
        for (let w = 0; w < 4; w += 1) {
          this.add.rectangle(i * 142 + 22 + w * 23, 190 + (i % 3) * 18, 8, 22, 0xf5c16f, 0.2).setOrigin(0);
        }
      }
      this.add.rectangle(GAME_WIDTH / 2, GROUND_Y + 48, GAME_WIDTH, 140, 0x19151a).setDepth(1);
      this.add.rectangle(GAME_WIDTH / 2, GROUND_Y, GAME_WIDTH, 8, 0xf5c16f, 0.4).setDepth(1);
      this.billboard = this.add.container(690, 105);
      this.billboard.add(this.add.rectangle(0, 0, 210, 72, 0x25141a).setStrokeStyle(3, 0xf5c16f, 0.5));
      this.billboard.add(this.add.text(-86, -20, "BACKLOT", { fontFamily: "monospace", fontSize: "20px", color: "#f5c16f", fontStyle: "bold" }));
      this.billboard.add(this.add.text(-78, 10, "BOULEVARD", { fontFamily: "monospace", fontSize: "14px", color: "#fff7e8" }));
      this.billboard.depth = 0;
    }

    createDino() {
      this.dino = this.add.container(DINO_X, GROUND_Y - 68).setDepth(5);
      this.dinoBody = this.add.rectangle(0, 28, 78, 72, 0x42c85f).setStrokeStyle(4, 0x102512);
      this.dinoHead = this.add.rectangle(24, -22, 88, 58, 0x55da72).setStrokeStyle(4, 0x102512);
      this.hornTop = this.add.triangle(66, -45, 0, 16, 44, 4, 4, 44, 0xf7f1c8).setStrokeStyle(2, 0x102512);
      this.hornLow = this.add.triangle(72, -18, 0, 12, 40, 0, 4, 34, 0xf7f1c8).setStrokeStyle(2, 0x102512);
      const eye = this.add.rectangle(38, -34, 8, 12, 0x050407);
      const frill = this.add.rectangle(-26, -21, 28, 70, 0x2aa746).setStrokeStyle(3, 0x102512);
      const legA = this.add.rectangle(-22, 77, 16, 34, 0x319e48).setStrokeStyle(2, 0x102512);
      const legB = this.add.rectangle(24, 77, 16, 34, 0x319e48).setStrokeStyle(2, 0x102512);
      this.dino.add([frill, this.dinoBody, this.dinoHead, this.hornTop, this.hornLow, eye, legA, legB]);
      this.tweens.add({ targets: [legA, legB], y: "+=5", duration: 120, yoyo: true, repeat: -1 });
    }

    createHud() {
      this.scoreText = this.add.text(24, 22, "0", { fontFamily: "monospace", fontSize: "28px", color: "#fff7e8", fontStyle: "bold" }).setDepth(10);
      this.comboText = this.add.text(24, 58, "x1.00", { fontFamily: "monospace", fontSize: "16px", color: "#f5c16f", fontStyle: "bold" }).setDepth(10);
      this.powerText = this.add.text(GAME_WIDTH - 26, 24, "", { fontFamily: "monospace", fontSize: "16px", color: "#8fffd1", fontStyle: "bold" }).setOrigin(1, 0).setDepth(10);
    }

    showTitle() {
      this.overlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(20);
      const bg = this.add.rectangle(0, 0, 620, 320, 0x050407, 0.86).setStrokeStyle(3, 0xf5c16f, 0.7);
      const title = this.add.text(0, -88, FLIM_CONFIG.title, { fontFamily: "monospace", fontSize: "58px", color: "#f5c16f", fontStyle: "bold" }).setOrigin(0.5);
      const sub = this.add.text(0, -34, FLIM_CONFIG.subtitle, { fontFamily: "monospace", fontSize: "22px", color: "#fff7e8" }).setOrigin(0.5);
      const hint = this.add.text(0, 36, "Tap to horn-flip cars. Collect reels. Cause cinematic chaos.", { fontFamily: "monospace", fontSize: "18px", color: "#b8b1a8", align: "center", wordWrap: { width: 500 } }).setOrigin(0.5);
      const start = this.add.text(0, 104, "TAP TO START", { fontFamily: "monospace", fontSize: "26px", color: "#050407", backgroundColor: "#f5c16f", padding: { x: 24, y: 12 }, fontStyle: "bold" }).setOrigin(0.5);
      this.overlay.add([bg, title, sub, hint, start]);
    }

    startRun() {
      this.overlay?.destroy();
      this.gameState = "running";
      this.score = 0;
      this.distance = 0;
      this.combo = 1;
      this.comboHits = 0;
      this.maxCombo = 1;
      this.vehiclesFlipped = 0;
      this.perfectFlips = 0;
      this.pedestriansStomped = 0;
      this.sceneryDestroyed = 0;
      this.reelsCollected = 0;
      this.health = FLIM_CONFIG.player.health;
      this.speed = 250;
      this.nextCarAt = this.time.now + 900;
      this.nextPedestrianAt = this.time.now + 800;
      this.nextSceneryAt = this.time.now + 700;
      this.nextReelAt = this.time.now + 1400;
      this.nextPowerAt = this.time.now + 6500;
      post("GAME_STARTED", { gameId: FLIM_CONFIG.gameId });
    }

    handleTap() {
      if (this.gameState === "title") {
        this.startRun();
        return;
      }
      if (this.gameState === "over") {
        this.scene.restart();
        return;
      }
      if (this.gameState !== "running") return;
      if (this.time.now < this.attackCoolingUntil) return;
      this.attackStartedAt = this.time.now;
      this.attackCoolingUntil = this.time.now + FLIM_CONFIG.attack.recoveryMs;
      this.tweens.killTweensOf(this.dino);
      this.tweens.add({ targets: this.dino, angle: 8, y: GROUND_Y - 58, duration: 70, yoyo: true, ease: "Quad.easeOut" });
    }

    update(time, delta) {
      const dt = Math.min(delta, 34) / 1000;
      this.scrollWorld(dt);
      if (this.gameState !== "running") return;
      const slowMo = this.powerUp === "directorsCut" && time < this.powerUpUntil;
      const simDt = slowMo ? dt * FLIM_CONFIG.powerUps.directorsCutTimeScale : dt;
      this.distance += this.speed * simDt;
      this.speed = Math.min(470, 250 + Math.floor(this.distance / 1200) * 18);
      this.spawnObjects(time);
      this.updateObjects(simDt, time);
      this.updateHud(time);
    }

    scrollWorld(dt) {
      this.city.forEach((item) => {
        item.sprite.x -= item.speed * dt;
        if (item.sprite.x < -150) item.sprite.x = GAME_WIDTH + 20;
      });
      this.billboard.x -= 20 * dt;
      if (this.billboard.x < -160) this.billboard.x = GAME_WIDTH + 160;
    }

    spawnObjects(time) {
      if (time > this.nextCarAt) {
        this.spawnCar();
        this.nextCarAt = time + Math.max(FLIM_CONFIG.spawn.minCarIntervalMs, FLIM_CONFIG.spawn.baseCarIntervalMs - this.distance / 10);
      }
      if (time > this.nextPedestrianAt) {
        this.spawnPedestrian();
        this.nextPedestrianAt = time + FLIM_CONFIG.spawn.pedestrianIntervalMs + Phaser.Math.Between(-260, 300);
      }
      if (time > this.nextSceneryAt) {
        this.spawnScenery();
        this.nextSceneryAt = time + FLIM_CONFIG.spawn.sceneryIntervalMs + Phaser.Math.Between(-120, 420);
      }
      if (time > this.nextReelAt) {
        this.spawnReel();
        this.nextReelAt = time + FLIM_CONFIG.spawn.reelIntervalMs + Phaser.Math.Between(-200, 500);
      }
      if (time > this.nextPowerAt) {
        this.spawnPowerUp();
        this.nextPowerAt = time + Phaser.Math.Between(9000, 13000);
      }
    }

    spawnCar() {
      const car = this.add.container(GAME_WIDTH + 80, GROUND_Y - 30).setDepth(4);
      car.add(this.add.rectangle(0, 4, 96, 34, 0xff5b6e).setStrokeStyle(4, 0x230507));
      car.add(this.add.rectangle(-16, -16, 48, 24, 0xff9f48).setStrokeStyle(3, 0x230507));
      car.add(this.add.circle(-30, 24, 10, 0x050407));
      car.add(this.add.circle(34, 24, 10, 0x050407));
      car.vx = -this.speed;
      car.vy = 0;
      car.flipped = false;
      this.cars.push(car);
    }

    spawnPedestrian() {
      const ped = this.add.container(GAME_WIDTH + 40, GROUND_Y - 28).setDepth(3);
      ped.add(this.add.rectangle(0, -12, 14, 24, 0xf5c16f));
      ped.add(this.add.circle(0, -30, 9, 0xffd4a3));
      ped.vx = -this.speed * 0.72;
      this.pedestrians.push(ped);
    }

    spawnScenery() {
      const colors = [0x5c6670, 0x2ac481, 0xf5c16f, 0xff5b6e];
      const item = this.add.container(GAME_WIDTH + 40, GROUND_Y - 26).setDepth(2);
      item.add(this.add.rectangle(0, 0, 28, 48, colors[Phaser.Math.Between(0, colors.length - 1)]).setStrokeStyle(3, 0x0b0a10));
      item.add(this.add.rectangle(0, -34, 38, 10, 0xff9f48));
      item.vx = -this.speed * 0.85;
      this.scenery.push(item);
    }

    spawnReel() {
      const reel = this.add.container(GAME_WIDTH + 50, GROUND_Y - Phaser.Math.Between(92, 155)).setDepth(3);
      reel.add(this.add.circle(0, 0, 16, 0xf5c16f).setStrokeStyle(3, 0x33200c));
      reel.add(this.add.circle(0, 0, 4, 0x050407));
      for (let i = 0; i < 6; i += 1) {
        reel.add(this.add.circle(Math.cos(i) * 9, Math.sin(i) * 9, 2, 0x050407));
      }
      reel.vx = -this.speed;
      this.reels.push(reel);
    }

    spawnPowerUp() {
      const kind = Phaser.Math.Between(0, 1) ? "rampage" : "directorsCut";
      const item = this.add.container(GAME_WIDTH + 60, GROUND_Y - 125).setDepth(3);
      item.kind = kind;
      item.add(this.add.rectangle(0, 0, 44, 34, kind === "rampage" ? 0xff5b6e : 0x2ac481).setStrokeStyle(3, 0xf5c16f));
      item.add(this.add.text(0, -9, kind === "rampage" ? "R" : "DC", { fontFamily: "monospace", fontSize: "15px", color: "#050407", fontStyle: "bold" }).setOrigin(0.5));
      item.vx = -this.speed;
      this.powerUps.push(item);
    }

    updateObjects(dt, time) {
      this.cars.forEach((car) => {
        car.x += car.vx * dt;
        car.y += car.vy * dt;
        if (car.flipped) {
          car.vy += 980 * dt;
          car.angle += car.spin * dt;
          if (car.y > GROUND_Y - 22) {
            car.y = GROUND_Y - 22;
            car.vy *= -0.22;
            car.spin *= 0.7;
          }
          return;
        }

        if (this.powerUp === "rampage" && time < this.powerUpUntil && car.x < DINO_X + 95) {
          this.flipCar(car, true, true);
          return;
        }

        if (car.x < DINO_X + 108 && car.x > DINO_X + 18) {
          const hit = this.resolveCurrentAttack(time);
          if (hit === "perfect" || hit === "standard") {
            this.flipCar(car, hit === "perfect");
          } else if (hit === "late" || hit === "miss") {
            this.endRun();
          }
        }
      });

      this.flippedCars.forEach((car) => {
        this.scenery.forEach((target) => {
          if (!target.destroyed && Phaser.Math.Distance.Between(car.x, car.y, target.x, target.y) < 55) {
            target.destroyed = true;
            target.setAngle(Phaser.Math.Between(-45, 45));
            target.vx = -this.speed * 1.3;
            this.addComboScore("sceneryDestroyed");
            this.sceneryDestroyed += 1;
          }
        });

        this.pedestrians.forEach((target) => {
          if (!target.destroyed && Phaser.Math.Distance.Between(car.x, car.y, target.x, target.y) < 55) {
            target.destroyed = true;
            target.setAngle(Phaser.Math.Between(-45, 45));
            target.vx = -this.speed * 1.3;
            this.addComboScore("pedestrianStomp");
            this.pedestriansStomped += 1;
          }
        });
      });

      this.pedestrians.forEach((ped) => {
        ped.x += ped.vx * dt;
        if (!ped.destroyed && ped.x < DINO_X + 38 && ped.x > DINO_X - 30) {
          ped.destroyed = true;
          ped.y -= 26;
          ped.angle = -35;
          this.pedestriansStomped += 1;
          this.addComboScore("pedestrianStomp");
        }
      });

      this.scenery.forEach((item) => {
        item.x += item.vx * dt;
        if (!item.destroyed && item.x < DINO_X + 38 && item.x > DINO_X - 20) {
          item.destroyed = true;
          item.angle = 28;
          this.sceneryDestroyed += 1;
          this.addComboScore("sceneryDestroyed");
        }
      });

      this.reels.forEach((reel) => {
        reel.x += reel.vx * dt;
        reel.angle += 240 * dt;
        if (!reel.collected && Phaser.Math.Distance.Between(reel.x, reel.y, DINO_X + 20, GROUND_Y - 82) < 65) {
          reel.collected = true;
          reel.visible = false;
          this.reelsCollected += 1;
          this.addComboScore("reelCollected");
        }
      });

      this.powerUps.forEach((item) => {
        item.x += item.vx * dt;
        if (!item.collected && Phaser.Math.Distance.Between(item.x, item.y, DINO_X + 20, GROUND_Y - 82) < 70) {
          item.collected = true;
          item.visible = false;
          this.powerUp = item.kind;
          this.powerUpUntil = time + (item.kind === "rampage" ? FLIM_CONFIG.powerUps.rampageDurationMs : FLIM_CONFIG.powerUps.directorsCutDurationMs);
          this.addComboScore("rampageBonus");
        }
      });

      this.cars = this.cars.filter((item) => item.x > -180);
      this.flippedCars = this.flippedCars.filter((item) => item.x > -180);
      this.pedestrians = this.pedestrians.filter((item) => item.x > -90);
      this.scenery = this.scenery.filter((item) => item.x > -90);
      this.reels = this.reels.filter((item) => item.x > -90 && !item.collected);
      this.powerUps = this.powerUps.filter((item) => item.x > -90 && !item.collected);
    }

    resolveCurrentAttack(time) {
      const attackAge = time - this.attackStartedAt;
      if (attackAge > FLIM_CONFIG.attack.recoveryMs) return "miss";
      if (attackAge < FLIM_CONFIG.attack.earliestHitMs) return "late";
      if (attackAge > FLIM_CONFIG.attack.latestHitMs) return "early";
      if (attackAge >= FLIM_CONFIG.attack.perfectStartMs && attackAge <= FLIM_CONFIG.attack.perfectEndMs) return "perfect";
      return "standard";
    }

    flipCar(car, perfect, rampage = false) {
      car.flipped = true;
      car.vx = perfect ? -190 : -145;
      car.vy = perfect ? -680 : -500;
      car.spin = perfect ? 520 : 340;
      this.flippedCars.push(car);
      this.vehiclesFlipped += 1;
      if (perfect) this.perfectFlips += 1;
      this.addComboScore(perfect ? "perfectVehicleFlip" : "standardVehicleFlip");
      if (rampage) this.addComboScore("rampageBonus");
    }

    addComboScore(event) {
      const values = FLIM_CONFIG.scoring;
      this.comboHits += 1;
      this.combo = Math.min(1 + this.comboHits * values.comboStep, values.maxMultiplier);
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += Math.round(values[event] * this.combo);
    }

    updateHud(time) {
      this.score += Math.floor(this.speed / 45);
      this.scoreText.setText(String(Math.round(this.score)));
      this.comboText.setText("x" + this.combo.toFixed(2));
      if (this.powerUp && time < this.powerUpUntil) {
        this.powerText.setText(this.powerUp === "rampage" ? "RAMPAGE" : "DIRECTOR'S CUT");
      } else {
        this.powerText.setText("");
        this.powerUp = null;
      }
      if (time - this.lastScorePost > 500) {
        this.lastScorePost = time;
        post("SCORE_UPDATED", this.finalPayload());
      }
    }

    finalPayload() {
      return {
        gameId: FLIM_CONFIG.gameId,
        score: Math.round(this.score),
        distance: Math.round(this.distance),
        vehiclesFlipped: this.vehiclesFlipped,
        perfectFlips: this.perfectFlips,
        pedestriansStomped: this.pedestriansStomped,
        sceneryDestroyed: this.sceneryDestroyed,
        reelsCollected: this.reelsCollected,
        maxCombo: Number(this.maxCombo.toFixed(2))
      };
    }

    endRun() {
      if (this.gameState === "over") return;
      this.gameState = "over";
      post("GAME_OVER", this.finalPayload());
      this.overlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2).setDepth(20);
      const bg = this.add.rectangle(0, 0, 620, 330, 0x050407, 0.9).setStrokeStyle(3, 0xff5b6e, 0.7);
      const title = this.add.text(0, -98, "BACKLOT BUSTED", { fontFamily: "monospace", fontSize: "42px", color: "#ff9f48", fontStyle: "bold" }).setOrigin(0.5);
      const score = this.add.text(0, -38, "Score " + Math.round(this.score), { fontFamily: "monospace", fontSize: "32px", color: "#fff7e8", fontStyle: "bold" }).setOrigin(0.5);
      const stats = this.add.text(0, 22, "Cars " + this.vehiclesFlipped + "   Perfect " + this.perfectFlips + "   Reels " + this.reelsCollected + "\\nMax Combo x" + this.maxCombo.toFixed(2), { fontFamily: "monospace", fontSize: "17px", color: "#b8b1a8", align: "center" }).setOrigin(0.5);
      const restart = this.add.text(0, 104, "TAP TO RESTART", { fontFamily: "monospace", fontSize: "24px", color: "#050407", backgroundColor: "#f5c16f", padding: { x: 22, y: 11 }, fontStyle: "bold" }).setOrigin(0.5);
      this.overlay.add([bg, title, score, stats, restart]);
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game",
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#050407",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: BacklotRunner
  });

  window.addEventListener("beforeunload", () => game.destroy(true));
})();
</script>
</body>
</html>`;
}
