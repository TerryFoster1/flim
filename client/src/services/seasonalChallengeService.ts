import type {
  SeasonalChallengeAttemptResult,
  SeasonalChallengeDetail,
  SeasonalChallengeEvent,
  SeasonalChallengeFeed,
  SeasonalChallengeHistoryItem,
} from "../types";

const SEASONAL_FEED_CACHE_MS = 60_000;
let seasonalFeedCache: { value: SeasonalChallengeFeed; expiresAt: number } | null = null;
let seasonalFeedPromise: Promise<SeasonalChallengeFeed> | null = null;

async function seasonalRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const startedAt = performance.now();
  console.info("[arcade:request:start]", { path, method: options.method || "GET" });
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  const payloadText = await response.text();
  const durationMs = Math.round(performance.now() - startedAt);
  console.info("[arcade:request:end]", {
    path,
    method: options.method || "GET",
    status: response.status,
    responseSize: payloadText.length,
    durationMs,
  });

  let payload: unknown = {};
  try {
    payload = payloadText ? JSON.parse(payloadText) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const errorPayload = payload && typeof payload === "object" ? payload as { error?: string } : {};
    throw new Error(errorPayload.error || "Seasonal challenge request failed.");
  }

  return payload as T;
}

export function getSeasonalChallenges() {
  const now = Date.now();
  if (seasonalFeedCache && seasonalFeedCache.expiresAt > now) {
    console.info("[arcade:request:cache-hit]", { path: "/api/seasonal-challenges" });
    return Promise.resolve(seasonalFeedCache.value);
  }
  if (seasonalFeedPromise) return seasonalFeedPromise;
  seasonalFeedPromise = seasonalRequest<SeasonalChallengeFeed>("/api/seasonal-challenges")
    .then((feed) => {
      seasonalFeedCache = { value: feed, expiresAt: Date.now() + SEASONAL_FEED_CACHE_MS };
      return feed;
    })
    .finally(() => {
      seasonalFeedPromise = null;
    });
  return seasonalFeedPromise;
}

export function joinSeasonalChallenge(eventId: string) {
  return seasonalRequest<{ event: SeasonalChallengeEvent }>("/api/seasonal-challenges", {
    method: "POST",
    body: JSON.stringify({ action: "join", eventId }),
  }).then((result) => result.event);
}

export function getSeasonalChallengeDetail(slug: string) {
  return seasonalRequest<SeasonalChallengeDetail>(`/api/seasonal-challenges?slug=${encodeURIComponent(slug)}`);
}

export function submitSeasonalChallengeAttempt(input: {
  eventId: string;
  questionIds: string[];
  answers: Record<string, string>;
  answerTimesMs?: Record<string, number>;
  skippedQuestionIds?: string[];
  totalTimeMs?: number;
  challengeWeekId?: string;
}) {
  return seasonalRequest<SeasonalChallengeAttemptResult>("/api/seasonal-challenges", {
    method: "POST",
    body: JSON.stringify({ action: "submit", ...input }),
  });
}

export function getSeasonalChallengeHistory() {
  return seasonalRequest<{ history: SeasonalChallengeHistoryItem[] }>("/api/seasonal-challenges?history=1").then((result) => result.history);
}
