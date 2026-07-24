import { describe, expect, it } from "vitest";
import { resolveChallengeRoute, visibleArcadeModes } from "./modeRoutes";

describe("Arcade routes", () => {
  it("routes every visible mode to its own Arcade screen", () => {
    expect(visibleArcadeModes.length).toBeGreaterThan(0);
    visibleArcadeModes.forEach((mode) => {
      expect(mode.route).toMatch(/^\/arcade\//);
      expect(mode.route).not.toBe("/home");
    });
  });

  it("uses challenge slug before id for challenge links", () => {
    expect(resolveChallengeRoute({ id: "abc", slug: "time-travel" })).toBe("/arcade/challenge/time-travel");
    expect(resolveChallengeRoute({ id: "abc" })).toBe("/arcade/challenge/abc");
  });
});
