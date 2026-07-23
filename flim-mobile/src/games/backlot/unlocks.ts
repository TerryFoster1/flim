import * as SecureStore from "expo-secure-store";
import { getBacklotUnlockIdsFromStorage, unlockBacklotGameInStorage } from "./unlocksCore";

export { BACKLOT_UNLOCK_STORAGE_KEY, hasBacklotUnlock, type BacklotUnlockStorage } from "./unlocksCore";

export function getBacklotUnlockIds(): Promise<string[]> {
  return getBacklotUnlockIdsFromStorage(SecureStore);
}

export function unlockBacklotGame(gameId: string): Promise<string[]> {
  return unlockBacklotGameInStorage(gameId, SecureStore);
}
