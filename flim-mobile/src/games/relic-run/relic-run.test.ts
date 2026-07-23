import { describe, expect, it } from "vitest";
import { canEnterAction, resolveGesture } from "./gestures";
import { createRelicRunPayload, isGameMessage } from "./messages";
import { canPlaceSection, calculateDifficulty, isSectionBeatable } from "./procedural";
import { addRelicRunDistance, addRelicRunScoreEvent, breakRelicRunCombo, initialRelicRunScoreState } from "./scoring";

describe("relic run gesture detection", () => {
  it("differentiates tap, hold, swipe up, release, and ignored input", () => {
    expect(resolveGesture({ startedAtMs: 100, endedAtMs: 190, startY: 300, endY: 302 })).toBe("tap");
    expect(resolveGesture({ startedAtMs: 100, endedAtMs: 390, startY: 300, endY: 302 })).toBe("hold");
    expect(resolveGesture({ startedAtMs: 100, endedAtMs: 220, startY: 340, endY: 260 })).toBe("swipeUp");
    expect(resolveGesture({ startedAtMs: 100, endedAtMs: 190, startY: 300, endY: 300, wasHolding: true })).toBe("release");
    expect(resolveGesture({ startedAtMs: 100, endedAtMs: 190, startY: 300, endY: 300, lastInputAtMs: 60 })).toBe("ignored");
  });

  it("prevents invalid simultaneous action transitions", () => {
    expect(canEnterAction("jumping", "whipping")).toBe(true);
    expect(canEnterAction("swinging", "whipping")).toBe(false);
    expect(canEnterAction("whipping", "swinging")).toBe(false);
    expect(canEnterAction("running", "throwingWhip")).toBe(true);
  });
});

describe("relic run scoring", () => {
  it("adds distance and combo-scaled score events", () => {
    const withDistance = addRelicRunDistance(initialRelicRunScoreState, 220);
    const withRelic = addRelicRunScoreEvent(withDistance, "relic");
    const withPerfectSwing = addRelicRunScoreEvent(withRelic, "perfectSwing");

    expect(withDistance.score).toBeGreaterThan(0);
    expect(withPerfectSwing.score).toBeGreaterThan(withRelic.score);
    expect(withPerfectSwing.perfectSwings).toBe(1);
    expect(withPerfectSwing.relics).toBe(1);
  });

  it("breaks combo without erasing collected stats", () => {
    const scored = addRelicRunScoreEvent(addRelicRunScoreEvent(initialRelicRunScoreState, "beetle"), "mummy");
    const broken = breakRelicRunCombo(scored);

    expect(broken.combo).toBe(1);
    expect(broken.comboHits).toBe(0);
    expect(broken.beetlesDefeated).toBe(1);
    expect(broken.mummiesDefeated).toBe(1);
  });
});

describe("relic run procedural safety", () => {
  it("increases difficulty smoothly", () => {
    expect(calculateDifficulty(0)).toBe(1);
    expect(calculateDifficulty(4500)).toBe(4);
    expect(calculateDifficulty(99999)).toBe(6);
  });

  it("rejects impossible spacing and bad swing anchors", () => {
    const previous = { type: "gap" as const, x: 500, width: 120 };

    expect(canPlaceSection(previous, { type: "mummy", x: 700, width: 80 })).toBe(false);
    expect(canPlaceSection(previous, { type: "mummy", x: 950, width: 80 })).toBe(true);
    expect(canPlaceSection(null, { type: "swingGap", x: 1000, width: 420, anchorX: 1100, anchorY: 180 })).toBe(false);
    expect(canPlaceSection(null, { type: "swingGap", x: 1000, width: 420, anchorX: 1280, anchorY: 180 })).toBe(true);
  });

  it("marks only beatable sections as valid", () => {
    expect(isSectionBeatable({ type: "gap", x: 100, width: 240 })).toBe(true);
    expect(isSectionBeatable({ type: "gap", x: 100, width: 390 })).toBe(false);
    expect(isSectionBeatable({ type: "swingGap", x: 100, width: 410, anchorX: 380, anchorY: 190 })).toBe(true);
    expect(isSectionBeatable({ type: "swingGap", x: 100, width: 410, anchorX: 120, anchorY: 300 })).toBe(false);
  });
});

describe("relic run messages", () => {
  it("creates a complete game-over payload", () => {
    expect(
      createRelicRunPayload({
        score: 1234.4,
        distance: 987.8,
        combo: 3,
        perfectSwings: 2,
        perfectJumps: 1,
        whipHits: 5,
        beetlesDefeated: 3,
        mummiesDefeated: 2,
        relics: 7,
        filmReels: 9
      })
    ).toMatchObject({
      gameId: "relic-run-lost-chapter",
      score: 1234,
      distance: 988,
      enemiesDefeated: 5
    });
  });

  it("guards game messages", () => {
    expect(isGameMessage({ type: "GAME_READY", payload: {} })).toBe(true);
    expect(isGameMessage({ type: "GAME_READY" })).toBe(false);
    expect(isGameMessage("GAME_READY")).toBe(false);
  });
});
