import { relicRunConfig } from "./config";

export type RelicRunGesture = "tap" | "hold" | "swipeUp" | "release" | "ignored";

export interface GestureSample {
  startedAtMs: number;
  endedAtMs: number;
  startY: number;
  endY: number;
  lastInputAtMs?: number;
  wasHolding?: boolean;
}

export function resolveGesture(sample: GestureSample, config = relicRunConfig.controls): RelicRunGesture {
  const durationMs = sample.endedAtMs - sample.startedAtMs;
  const deltaY = sample.endY - sample.startY;
  const sinceLastInput = sample.lastInputAtMs == null ? Number.POSITIVE_INFINITY : sample.startedAtMs - sample.lastInputAtMs;

  if (durationMs < 0 || sinceLastInput < config.inputLockMs) {
    return "ignored";
  }

  if (sample.wasHolding) {
    return "release";
  }

  if (deltaY <= -config.swipeMinDy && durationMs <= config.swipeMaxMs) {
    return "swipeUp";
  }

  if (durationMs >= config.holdMinMs) {
    return "hold";
  }

  if (durationMs <= config.tapMaxMs) {
    return "tap";
  }

  return "ignored";
}

export type PlayerActionState = "running" | "jumping" | "whipping" | "throwingWhip" | "swinging";

export function canEnterAction(current: PlayerActionState, next: PlayerActionState) {
  if (current === "swinging") {
    return next === "running" || next === "jumping";
  }

  if (current === "jumping") {
    return next === "whipping" || next === "swinging" || next === "running";
  }

  if (current === "whipping" || current === "throwingWhip") {
    return next === "running";
  }

  return true;
}
