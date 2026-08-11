import { RELIC_RUN_GAME_ID } from "./config";

export type RelicRunGameMessageType =
  | "GAME_READY"
  | "GAME_STARTED"
  | "GAME_PAUSED"
  | "GAME_RESUMED"
  | "SCORE_UPDATED"
  | "GAME_OVER"
  | "GAME_COMPLETED"
  | "EXIT_REQUESTED";

export interface RelicRunStats {
  gameId: typeof RELIC_RUN_GAME_ID;
  score: number;
  distance: number;
  combo: number;
  perfectSwings: number;
  perfectJumps: number;
  whipHits: number;
  beetlesDefeated: number;
  mummiesDefeated: number;
  enemiesDefeated: number;
  relics: number;
  filmReels: number;
}

export interface RelicRunGameMessage<TPayload = Record<string, never>> {
  type: RelicRunGameMessageType;
  payload: TPayload;
}

export function createRelicRunPayload(stats: Omit<RelicRunStats, "gameId" | "enemiesDefeated"> & { enemiesDefeated?: number }): RelicRunStats {
  const beetlesDefeated = Math.max(0, Math.round(stats.beetlesDefeated));
  const mummiesDefeated = Math.max(0, Math.round(stats.mummiesDefeated));

  return {
    gameId: RELIC_RUN_GAME_ID,
    score: Math.max(0, Math.round(stats.score)),
    distance: Math.max(0, Math.round(stats.distance)),
    combo: Math.max(1, Math.round(stats.combo)),
    perfectSwings: Math.max(0, Math.round(stats.perfectSwings)),
    perfectJumps: Math.max(0, Math.round(stats.perfectJumps)),
    whipHits: Math.max(0, Math.round(stats.whipHits)),
    beetlesDefeated,
    mummiesDefeated,
    enemiesDefeated: Math.max(0, Math.round(stats.enemiesDefeated ?? beetlesDefeated + mummiesDefeated)),
    relics: Math.max(0, Math.round(stats.relics)),
    filmReels: Math.max(0, Math.round(stats.filmReels))
  };
}

export function isGameMessage(value: unknown): value is { type: string; payload: Record<string, unknown> } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const maybeMessage = value as { type?: unknown; payload?: unknown };
  return typeof maybeMessage.type === "string" && !!maybeMessage.payload && typeof maybeMessage.payload === "object";
}
