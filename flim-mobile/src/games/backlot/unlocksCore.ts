export const BACKLOT_UNLOCK_STORAGE_KEY = "flim.backlot.unlockedGames.v1";

export interface BacklotUnlockStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
}

function normalizeUnlockIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)));
}

export async function getBacklotUnlockIdsFromStorage(storage: BacklotUnlockStorage): Promise<string[]> {
  const storedValue = await storage.getItemAsync(BACKLOT_UNLOCK_STORAGE_KEY);

  if (!storedValue) {
    return [];
  }

  try {
    return normalizeUnlockIds(JSON.parse(storedValue));
  } catch {
    return [];
  }
}

export async function unlockBacklotGameInStorage(gameId: string, storage: BacklotUnlockStorage): Promise<string[]> {
  const unlockIds = await getBacklotUnlockIdsFromStorage(storage);

  if (!unlockIds.includes(gameId)) {
    unlockIds.push(gameId);
  }

  await storage.setItemAsync(BACKLOT_UNLOCK_STORAGE_KEY, JSON.stringify(unlockIds));
  return unlockIds;
}

export function hasBacklotUnlock(unlockIds: string[], gameId: string): boolean {
  return unlockIds.includes(gameId);
}
