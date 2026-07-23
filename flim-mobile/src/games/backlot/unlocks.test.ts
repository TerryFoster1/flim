import { describe, expect, it } from "vitest";
import {
  BACKLOT_UNLOCK_STORAGE_KEY,
  getBacklotUnlockIdsFromStorage,
  hasBacklotUnlock,
  unlockBacklotGameInStorage,
  type BacklotUnlockStorage
} from "./unlocksCore";

function createMemoryStorage(initialValue: string | null = null): BacklotUnlockStorage & { value: string | null } {
  return {
    value: initialValue,
    async getItemAsync() {
      return this.value;
    },
    async setItemAsync(_key: string, value: string) {
      this.value = value;
    }
  };
}

describe("Backlot unlock persistence", () => {
  it("stores a newly discovered hidden game once", async () => {
    const storage = createMemoryStorage();

    await unlockBacklotGameInStorage("relic-run-lost-chapter", storage);
    const unlockIds = await unlockBacklotGameInStorage("relic-run-lost-chapter", storage);

    expect(unlockIds).toEqual(["relic-run-lost-chapter"]);
    expect(storage.value).toBe(JSON.stringify(["relic-run-lost-chapter"]));
  });

  it("ignores corrupt stored data instead of blocking Arcade load", async () => {
    const storage = createMemoryStorage("not json");

    await expect(getBacklotUnlockIdsFromStorage(storage)).resolves.toEqual([]);
  });

  it("checks an unlocked game id", () => {
    expect(hasBacklotUnlock(["relic-run-lost-chapter"], "relic-run-lost-chapter")).toBe(true);
    expect(hasBacklotUnlock([], "relic-run-lost-chapter")).toBe(false);
  });

  it("uses the versioned Backlot key", () => {
    expect(BACKLOT_UNLOCK_STORAGE_KEY).toBe("flim.backlot.unlockedGames.v1");
  });
});
