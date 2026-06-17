import type {
  SeasonalChallengeAttemptResult,
  SeasonalChallengeDetail,
  SeasonalChallengeEvent,
  SeasonalChallengeFeed,
  SeasonalChallengeHistoryItem,
} from "../types";

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
