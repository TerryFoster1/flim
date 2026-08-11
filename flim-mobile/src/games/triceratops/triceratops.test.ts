import { describe, expect, it } from "vitest";
import { triceratopsGameConfig, TRICERATOPS_GAME_ID } from "./config";
import { createGameOverPayload, isTriceratopsGameMessage } from "./messages";
import { addDistanceScore, addScoreEvent, initialScoreState, resetCombo } from "./scoring";
import { canSpawnObstacle, resolveAttackTiming, shouldEndRun } from "./simulation";

describe("triceratops attack timing", () => {
  it("detects perfect horn-flip timing", () => {
    expect(resolveAttackTiming({ attackStartedAtMs: 1000, impactAtMs: 1160 })).toBe("perfect");
  });

  it("detects standard, early, late, and missed attacks", () => {
    expect(resolveAttackTiming({ attackStartedAtMs: 1000, impactAtMs: 1090 })).toBe("standard");
    expect(resolveAttackTiming({ attackStartedAtMs: 1000, impactAtMs: 1340 })).toBe("early");
    expect(resolveAttackTiming({ attackStartedAtMs: 1000, impactAtMs: 1040 })).toBe("late");
    expect(resolveAttackTiming({ attackStartedAtMs: null, impactAtMs: 1200 })).toBe("miss");
  });

  it("treats a recovered attack as early when impact arrives too late", () => {
    expect(resolveAttackTiming({ attackStartedAtMs: 1000, impactAtMs: 1600, nowMs: 1600 })).toBe("early");
  });
});

describe("triceratops scoring", () => {
  it("adds combo-scaled score events", () => {
    const first = addScoreEvent(initialScoreState, "standardVehicleFlip");
    const second = addScoreEvent(first, "perfectVehicleFlip");

    expect(first.score).toBeGreaterThan(triceratopsGameConfig.scoring.standardVehicleFlip);
    expect(second.score).toBeGreaterThan(first.score);
    expect(second.combo).toBeGreaterThan(first.combo);
    expect(second.maxCombo).toBe(second.combo);
  });

  it("adds distance score and resets combo", () => {
    const withDistance = addDistanceScore(initialScoreState, triceratopsGameConfig.scoring.distancePointEveryPx * 4);
    const combo = addScoreEvent(withDistance, "reelCollected");
    const reset = resetCombo(combo);

    expect(withDistance.score).toBe(4);
    expect(reset.combo).toBe(1);
    expect(reset.comboHits).toBe(0);
    expect(reset.maxCombo).toBeGreaterThanOrEqual(combo.maxCombo);
  });
});

describe("triceratops spawning and game over", () => {
  it("prevents impossible obstacle spacing", () => {
    expect(canSpawnObstacle(400, 600)).toBe(false);
    expect(canSpawnObstacle(400, 800)).toBe(true);
  });

  it("ends the run when a one-health player collides", () => {
    expect(shouldEndRun(1, true)).toBe(true);
    expect(shouldEndRun(2, true)).toBe(false);
    expect(shouldEndRun(1, false)).toBe(false);
  });
});

describe("triceratops game messages", () => {
  it("creates a complete game-over payload", () => {
    const payload = createGameOverPayload({
      score: 123.6,
      distance: 987.2,
      vehiclesFlipped: 4,
      perfectFlips: 2,
      pedestriansStomped: 3,
      sceneryDestroyed: 5,
      reelsCollected: 6,
      maxCombo: 2.25
    });

    expect(payload).toEqual({
      gameId: TRICERATOPS_GAME_ID,
      score: 124,
      distance: 987,
      vehiclesFlipped: 4,
      perfectFlips: 2,
      pedestriansStomped: 3,
      sceneryDestroyed: 5,
      reelsCollected: 6,
      maxCombo: 2.25
    });
  });

  it("guards message payloads", () => {
    expect(isTriceratopsGameMessage({ type: "GAME_READY", payload: {} })).toBe(true);
    expect(isTriceratopsGameMessage({ type: "GAME_READY" })).toBe(false);
    expect(isTriceratopsGameMessage("GAME_READY")).toBe(false);
  });
});
