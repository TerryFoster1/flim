export interface RoulettePlaylistPreferences {
  excludedPlaylistIds: string[];
  updatedAt?: string | null;
}

async function roulettePreferencesRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Roulette preferences request failed.");
  }

  return response.json() as Promise<T>;
}

export function getRoulettePlaylistPreferences() {
  return roulettePreferencesRequest<RoulettePlaylistPreferences & { rouletteExcludedPlaylistIds?: string[] }>("/api/profiles/me")
    .then((result) => ({
      excludedPlaylistIds: result.rouletteExcludedPlaylistIds || result.excludedPlaylistIds || [],
      updatedAt: result.updatedAt,
    }));
}

export function saveRoulettePlaylistPreferences(excludedPlaylistIds: string[]) {
  return roulettePreferencesRequest<RoulettePlaylistPreferences>("/api/profiles/me", {
    method: "PATCH",
    body: JSON.stringify({ excludedPlaylistIds }),
  });
}
