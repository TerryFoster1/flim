import * as SecureStore from "expo-secure-store";
import { flimApi } from "@/api/flimApi";
import type { BacklotDiscoveryRequest, BacklotEventRequest, BacklotState } from "@/api/types";
import {
  appendPendingDiscoveryToState,
  clearBacklotOfflineQueueInStorage,
  getBacklotUnlockIdsFromStorage,
  queueBacklotDiscoveryInStorage,
  readBacklotOfflineQueueFromStorage,
  readBacklotStateCacheFromStorage,
  writeBacklotOfflineQueueToStorage,
  writeBacklotStateCacheToStorage
} from "./unlocksCore";

export {
  BACKLOT_OFFLINE_QUEUE_KEY,
  BACKLOT_STATE_CACHE_KEY,
  BACKLOT_UNLOCK_STORAGE_KEY,
  hasBacklotUnlock,
  type BacklotOfflineDiscovery,
  type BacklotUnlockStorage
} from "./unlocksCore";

function makeClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getBacklotUnlockIds(): Promise<string[]> {
  return getBacklotUnlockIdsFromStorage(SecureStore);
}

export async function getBacklotStateCache() {
  return readBacklotStateCacheFromStorage(SecureStore);
}

export async function reconcileBacklotState(): Promise<BacklotState> {
  const cachedState = await readBacklotStateCacheFromStorage(SecureStore);
  const queue = await readBacklotOfflineQueueFromStorage(SecureStore);

  try {
    let serverState = await flimApi.getBacklotState();
    const remainingQueue = [];

    for (const discovery of queue) {
      try {
        const result = await flimApi.discoverBacklotGame(discovery);
        serverState = result.state;
      } catch {
        remainingQueue.push(discovery);
      }
    }

    if (remainingQueue.length) {
      await writeBacklotOfflineQueueToStorage(remainingQueue, SecureStore);
    } else {
      await clearBacklotOfflineQueueInStorage(SecureStore);
    }

    return writeBacklotStateCacheToStorage(serverState, SecureStore);
  } catch {
    return cachedState;
  }
}

export async function discoverBacklotGame(discovery: BacklotDiscoveryRequest): Promise<{ state: BacklotState; created: boolean; pending: boolean }> {
  const clientDiscoveryId = discovery.clientDiscoveryId || makeClientId("backlot-discovery");
  const queuedAt = new Date().toISOString();
  const request = { ...discovery, clientDiscoveryId };

  try {
    const result = await flimApi.discoverBacklotGame(request);
    await writeBacklotStateCacheToStorage(result.state, SecureStore);
    return { state: result.state, created: result.created, pending: false };
  } catch {
    const offlineDiscovery = { ...request, clientDiscoveryId, queuedAt };
    await queueBacklotDiscoveryInStorage(offlineDiscovery, SecureStore);
    const cachedState = await readBacklotStateCacheFromStorage(SecureStore);
    const optimisticState = appendPendingDiscoveryToState(cachedState, offlineDiscovery);
    await writeBacklotStateCacheToStorage(optimisticState, SecureStore);
    return { state: optimisticState, created: true, pending: true };
  }
}

export async function recordBacklotGameEvent(event: BacklotEventRequest) {
  try {
    return await flimApi.recordBacklotEvent({
      ...event,
      clientEventId: event.clientEventId || makeClientId("backlot-event")
    });
  } catch {
    return null;
  }
}
