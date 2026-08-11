import type { BacklotDiscovery, BacklotDiscoveryRequest, BacklotState } from "../../api/types";
import { backlotGamesById } from "./registry";

export const BACKLOT_UNLOCK_STORAGE_KEY = "flim.backlot.unlockedGames.v1";
export const BACKLOT_STATE_CACHE_KEY = "flim.backlot.state.v1";
export const BACKLOT_OFFLINE_QUEUE_KEY = "flim.backlot.offlineQueue.v1";

export interface BacklotUnlockStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync?(key: string): Promise<void>;
}

export interface BacklotOfflineDiscovery extends BacklotDiscoveryRequest {
  clientDiscoveryId: string;
  queuedAt: string;
}

export function normalizeUnlockIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)));
}

function emptyState(): BacklotState {
  return {
    unlockIds: [],
    discoveries: [],
    games: [],
    progress: {
      discoveredCount: 0,
      secretsRemainingLabel: "??"
    }
  };
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function sanitizeBacklotState(value: unknown): BacklotState {
  if (!value || typeof value !== "object") return emptyState();
  const maybeState = value as Partial<BacklotState>;
  const unlockIds = normalizeUnlockIds(maybeState.unlockIds);
  const discoveries = Array.isArray(maybeState.discoveries) ? maybeState.discoveries.filter((item): item is BacklotDiscovery => {
    return !!item && typeof item === "object" && typeof item.gameId === "string" && typeof item.gameTitle === "string";
  }) : [];
  const games = Array.isArray(maybeState.games) ? maybeState.games.filter((item) => !!item && typeof item.id === "string") : [];
  return {
    userId: typeof maybeState.userId === "string" ? maybeState.userId : undefined,
    unlockIds,
    discoveries,
    games,
    progress: {
      discoveredCount: Number(maybeState.progress?.discoveredCount ?? discoveries.length),
      secretsRemainingLabel: String(maybeState.progress?.secretsRemainingLabel || "??")
    }
  };
}

export async function getBacklotUnlockIdsFromStorage(storage: BacklotUnlockStorage): Promise<string[]> {
  const state = await readBacklotStateCacheFromStorage(storage);
  if (state.unlockIds.length) return state.unlockIds;
  return normalizeUnlockIds(safeJsonParse(await storage.getItemAsync(BACKLOT_UNLOCK_STORAGE_KEY), []));
}

export async function unlockBacklotGameInStorage(gameId: string, storage: BacklotUnlockStorage): Promise<string[]> {
  const unlockIds = await getBacklotUnlockIdsFromStorage(storage);
  const nextUnlockIds = normalizeUnlockIds([...unlockIds, gameId]);
  await storage.setItemAsync(BACKLOT_UNLOCK_STORAGE_KEY, JSON.stringify(nextUnlockIds));
  return nextUnlockIds;
}

export function hasBacklotUnlock(unlockIds: string[], gameId: string): boolean {
  return unlockIds.includes(gameId);
}

export async function readBacklotStateCacheFromStorage(storage: BacklotUnlockStorage): Promise<BacklotState> {
  return sanitizeBacklotState(safeJsonParse(await storage.getItemAsync(BACKLOT_STATE_CACHE_KEY), emptyState()));
}

export async function writeBacklotStateCacheToStorage(state: BacklotState, storage: BacklotUnlockStorage) {
  const cleanState = sanitizeBacklotState(state);
  await storage.setItemAsync(BACKLOT_STATE_CACHE_KEY, JSON.stringify(cleanState));
  await storage.setItemAsync(BACKLOT_UNLOCK_STORAGE_KEY, JSON.stringify(cleanState.unlockIds));
  return cleanState;
}

export async function readBacklotOfflineQueueFromStorage(storage: BacklotUnlockStorage): Promise<BacklotOfflineDiscovery[]> {
  const queue = safeJsonParse<BacklotOfflineDiscovery[]>(await storage.getItemAsync(BACKLOT_OFFLINE_QUEUE_KEY), []);
  return Array.isArray(queue)
    ? queue.filter((item) => !!item && typeof item.gameId === "string" && typeof item.clientDiscoveryId === "string")
    : [];
}

export async function writeBacklotOfflineQueueToStorage(queue: BacklotOfflineDiscovery[], storage: BacklotUnlockStorage) {
  await storage.setItemAsync(BACKLOT_OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function clearBacklotOfflineQueueInStorage(storage: BacklotUnlockStorage) {
  if (storage.deleteItemAsync) {
    await storage.deleteItemAsync(BACKLOT_OFFLINE_QUEUE_KEY);
    return;
  }
  await storage.setItemAsync(BACKLOT_OFFLINE_QUEUE_KEY, JSON.stringify([]));
}

export async function queueBacklotDiscoveryInStorage(discovery: BacklotOfflineDiscovery, storage: BacklotUnlockStorage) {
  const queue = await readBacklotOfflineQueueFromStorage(storage);
  const exists = queue.some((item) => {
    return item.clientDiscoveryId === discovery.clientDiscoveryId || (
      item.gameId === discovery.gameId &&
      item.sourceType === discovery.sourceType &&
      item.sourceId === discovery.sourceId
    );
  });
  const nextQueue = exists ? queue : [...queue, discovery];
  await writeBacklotOfflineQueueToStorage(nextQueue, storage);
  return nextQueue;
}

export function appendPendingDiscoveryToState(state: BacklotState, discovery: BacklotOfflineDiscovery): BacklotState {
  const game = backlotGamesById.get(discovery.gameId);
  const title = game?.title || "Backlot Game";
  const discoveredAt = discovery.queuedAt;
  const unlockIds = normalizeUnlockIds([...state.unlockIds, discovery.gameId]);
  const discoveries: BacklotDiscovery[] = state.discoveries.some((item) => item.gameId === discovery.gameId)
    ? state.discoveries
    : [
        {
          gameId: discovery.gameId,
          gameTitle: title,
          sourceType: discovery.sourceType,
          sourceId: discovery.sourceId,
          sourceTitle: discovery.sourceTitle || "",
          discoveredAt,
          unlockedAt: discoveredAt,
          firstPlayedAt: null,
          totalPlayTimeMs: 0,
          syncStatus: "pending" as const
        },
        ...state.discoveries
      ];
  const games = state.games.some((item) => item.id === discovery.gameId) || !game
    ? state.games
    : [
        ...state.games,
        {
          id: game.gameId,
          title: game.title,
          description: game.description,
          route: game.route,
          difficulty: game.difficulty,
          estimatedPlayTimeMinutes: game.estimatedPlayTimeMinutes,
          genre: game.genre,
          rewardId: game.rewardId,
          achievementSetId: game.achievementSetId
        }
      ];
  return {
    ...state,
    unlockIds,
    discoveries,
    games,
    progress: {
      discoveredCount: discoveries.length,
      secretsRemainingLabel: "??"
    }
  };
}
