import { TRICERATOPS_GAME_ID } from "./config";

export type TriceratopsGameMessageType =
  | "GAME_READY"
  | "GAME_STARTED"
  | "SCORE_UPDATED"
  | "GAME_OVER"
  | "GAME_COMPLETED"
  | "PAUSE_REQUESTED"
  | "EXIT_REQUESTED";

export interface TriceratopsRunStats {
  gameId: typeof TRICERATOPS_GAME_ID;
  score: number;
  distance: number;
  vehiclesFlipped: number;
  perfectFlips: number;
  pedestriansStomped: number;
  sceneryDestroyed: number;
  reelsCollected: number;
  maxCombo: number;
}

export interface TriceratopsGameMessage<TPayload = Record<string, never>> {
  type: TriceratopsGameMessageType;
  payload: TPayload;
}

export function createGameOverPayload(stats: Omit<TriceratopsRunStats, "gameId">): TriceratopsRunStats {
  return {
    gameId: TRICERATOPS_GAME_ID,
    score: Math.max(0, Math.round(stats.score)),
    distance: Math.max(0, Math.round(stats.distance)),
    vehiclesFlipped: Math.max(0, Math.round(stats.vehiclesFlipped)),
    perfectFlips: Math.max(0, Math.round(stats.perfectFlips)),
    pedestriansStomped: Math.max(0, Math.round(stats.pedestriansStomped)),
    sceneryDestroyed: Math.max(0, Math.round(stats.sceneryDestroyed)),
    reelsCollected: Math.max(0, Math.round(stats.reelsCollected)),
    maxCombo: Math.max(1, Number(stats.maxCombo.toFixed(2)))
  };
}

export function isTriceratopsGameMessage(value: unknown): value is TriceratopsGameMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as Partial<TriceratopsGameMessage>;
  return typeof maybeMessage.type === "string" && typeof maybeMessage.payload === "object";
}
