import { describe, expect, it } from "vitest";
import {
  BACKLOT_OFFLINE_QUEUE_KEY,
  BACKLOT_STATE_CACHE_KEY,
  BACKLOT_UNLOCK_STORAGE_KEY,
  appendPendingDiscoveryToState,
  clearBacklotOfflineQueueInStorage,
  getBacklotUnlockIdsFromStorage,
  hasBacklotUnlock,
  queueBacklotDiscoveryInStorage,
  readBacklotOfflineQueueFromStorage,
  readBacklotStateCacheFromStorage,
  sanitizeBacklotState,
  unlockBacklotGameInStorage,
  writeBacklotStateCacheToStorage,
  type BacklotOfflineDiscovery,
  type BacklotUnlockStorage
} from "./unlocksCore";
import { isAllowedBacklotDiscovery, relicRunDiscoverySource, triceratopsDinosaurDiscoverySource } from "./registry";

type Store = BacklotUnlockStorage & { values: Record<string, string | null> };

function createMemoryStorage(initialValues: Record<string, string | null> = {}): Store {
  return {
    values: initialValues,
    async getItemAsync(key: string) {
      return this.values[key] ?? null;
    },
    async setItemAsync(key: string, value: string) {
      this.values[key] = value;
    },
    async deleteItemAsync(key: string) {
      delete this.values[key];
    }
  };
}

function offlineDiscovery(overrides: Partial<BacklotOfflineDiscovery> = {}): BacklotOfflineDiscovery {
  return {
    ...relicRunDiscoverySource,
    clientDiscoveryId: "client-1",
    queuedAt: "2026-07-23T12:00:00.000Z",
    ...overrides
  };
}

describe("Backlot unlock persistence", () => {
  it("stores a newly discovered hidden game once for legacy local compatibility", async () => {
    const storage = createMemoryStorage();

    await unlockBacklotGameInStorage("relic-run-lost-chapter", storage);
    const unlockIds = await unlockBacklotGameInStorage("relic-run-lost-chapter", storage);

    expect(unlockIds).toEqual(["relic-run-lost-chapter"]);
    expect(storage.values[BACKLOT_UNLOCK_STORAGE_KEY]).toBe(JSON.stringify(["relic-run-lost-chapter"]));
  });

  it("ignores corrupt stored data instead of blocking Arcade load", async () => {
    const storage = createMemoryStorage({ [BACKLOT_STATE_CACHE_KEY]: "not json", [BACKLOT_UNLOCK_STORAGE_KEY]: "not json" });

    await expect(readBacklotStateCacheFromStorage(storage)).resolves.toMatchObject({ unlockIds: [], discoveries: [] });
    await expect(getBacklotUnlockIdsFromStorage(storage)).resolves.toEqual([]);
  });

  it("checks an unlocked game id", () => {
    expect(hasBacklotUnlock(["relic-run-lost-chapter"], "relic-run-lost-chapter")).toBe(true);
    expect(hasBacklotUnlock([], "relic-run-lost-chapter")).toBe(false);
  });

  it("uses versioned Backlot cache keys", () => {
    expect(BACKLOT_UNLOCK_STORAGE_KEY).toBe("flim.backlot.unlockedGames.v1");
    expect(BACKLOT_STATE_CACHE_KEY).toBe("flim.backlot.state.v1");
    expect(BACKLOT_OFFLINE_QUEUE_KEY).toBe("flim.backlot.offlineQueue.v1");
  });

  it("dedupes queued offline discoveries by game and source", async () => {
    const storage = createMemoryStorage();

    await queueBacklotDiscoveryInStorage(offlineDiscovery(), storage);
    const queue = await queueBacklotDiscoveryInStorage(offlineDiscovery({ clientDiscoveryId: "client-2" }), storage);

    expect(queue).toHaveLength(1);
    expect(await readBacklotOfflineQueueFromStorage(storage)).toHaveLength(1);
  });

  it("clears the offline queue after a successful reconciliation", async () => {
    const storage = createMemoryStorage();
    await queueBacklotDiscoveryInStorage(offlineDiscovery(), storage);

    await clearBacklotOfflineQueueInStorage(storage);

    expect(await readBacklotOfflineQueueFromStorage(storage)).toEqual([]);
  });

  it("keeps remote multi-device state as the normalized source of truth", async () => {
    const storage = createMemoryStorage();
    const state = sanitizeBacklotState({
      userId: "user-1",
      unlockIds: ["relic-run-lost-chapter", "relic-run-lost-chapter", "triceratops-backlot-runner"],
      discoveries: [
        { gameId: "relic-run-lost-chapter", gameTitle: "Relic Run", sourceType: "arcade_mode", sourceId: "poster-guess", sourceTitle: "Movie Reveal", discoveredAt: "2026-07-23T12:00:00Z" },
        { gameId: "triceratops-backlot-runner", gameTitle: "TRICERATOPS!", sourceType: "challenge_theme", sourceId: "dinosaur-theme", sourceTitle: "Dinosaur Movie Challenge", discoveredAt: "2026-07-23T13:00:00Z" }
      ],
      games: [],
      progress: { discoveredCount: 2, secretsRemainingLabel: "??" }
    });

    await writeBacklotStateCacheToStorage(state, storage);

    expect(await getBacklotUnlockIdsFromStorage(storage)).toEqual(["relic-run-lost-chapter", "triceratops-backlot-runner"]);
  });

  it("adds optimistic pending discovery state while offline", () => {
    const nextState = appendPendingDiscoveryToState(
      { unlockIds: [], discoveries: [], games: [], progress: { discoveredCount: 0, secretsRemainingLabel: "??" } },
      offlineDiscovery()
    );

    expect(nextState.unlockIds).toEqual(["relic-run-lost-chapter"]);
    expect(nextState.discoveries[0]).toMatchObject({ gameTitle: "Relic Run", syncStatus: "pending" });
    expect(nextState.progress.discoveredCount).toBe(1);
  });

  it("documents the server-validated discovery surfaces used by the app", () => {
    expect(isAllowedBacklotDiscovery(relicRunDiscoverySource)).toBe(true);
    expect(isAllowedBacklotDiscovery(triceratopsDinosaurDiscoverySource)).toBe(true);
    expect(isAllowedBacklotDiscovery({ gameId: "relic-run-lost-chapter", sourceType: "arcade_mode", sourceId: "global-arcade" })).toBe(false);
  });
});
