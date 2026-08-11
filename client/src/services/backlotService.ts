export type BacklotLabGame = {
  id: string;
  title: string;
  description: string;
  route: string;
  difficulty: string;
  estimatedPlayTimeMinutes: number;
  genre: string;
  discovered: boolean;
  unlocked: boolean;
  discoveredAt: string | null;
  unlockedAt: string | null;
  lastSessionAt: string | null;
  personalBest: number;
  launchCount: number;
  totalPlayTimeMs: number;
};

export type BacklotLabState = {
  ok: boolean;
  environment: string;
  games: BacklotLabGame[];
};

async function backlotRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorPayload = payload as { error?: string };
    throw new Error(errorPayload.error || "Backlot Arcade is temporarily unavailable.");
  }
  return payload as T;
}

export function getBacklotTestLab() {
  return backlotRequest<BacklotLabState>("/api/backlot/test-lab");
}

export function simulateBacklotDiscovery(gameId: string) {
  return backlotRequest<BacklotLabState>("/api/backlot/test-lab/simulate-discovery", {
    method: "POST",
    body: JSON.stringify({
      gameId,
      clientDiscoveryId: `projection-booth-${gameId}`,
    }),
  });
}

export function resetBacklotDiscoveries() {
  return backlotRequest<BacklotLabState>("/api/backlot/test-lab/reset", {
    method: "POST",
  });
}

export function recordBacklotLaunch(gameId: string) {
  return backlotRequest<{ ok: boolean }>("/api/backlot/events", {
    method: "POST",
    body: JSON.stringify({
      gameId,
      eventType: "launch",
      clientEventId: `web-launch-${gameId}-${Date.now()}`,
    }),
  });
}

export function recordBacklotGameOver(gameId: string, score: number, playTimeMs: number) {
  return backlotRequest<{ ok: boolean }>("/api/backlot/events", {
    method: "POST",
    body: JSON.stringify({
      gameId,
      eventType: "game_over",
      score,
      playTimeMs,
      clientEventId: `web-game-over-${gameId}-${Date.now()}`,
    }),
  });
}

export function isProjectionBoothHostAllowed() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === "flim.ca" || host === "www.flim.ca") return false;
  return host === "localhost" || host === "127.0.0.1" || host === "staging.flim.ca" || host.endsWith(".vercel.app");
}
