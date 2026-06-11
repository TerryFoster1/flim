import type { SeasonalChallengeEvent, SeasonalChallengeFeed } from "../types";

async function seasonalRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Seasonal challenge request failed.");
  }

  return response.json() as Promise<T>;
}

export function getSeasonalChallenges() {
  return seasonalRequest<SeasonalChallengeFeed>("/api/seasonal-challenges");
}

export function joinSeasonalChallenge(eventId: string) {
  return seasonalRequest<{ event: SeasonalChallengeEvent }>("/api/seasonal-challenges", {
    method: "POST",
    body: JSON.stringify({ eventId }),
  }).then((result) => result.event);
}
