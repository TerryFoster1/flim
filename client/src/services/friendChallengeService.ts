import type { FriendChallengeAttemptResult, FriendChallengeHistoryAttempt, FriendTriviaChallenge, MediaType } from "../types";

async function challengeRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Challenge request failed.");
  }
  return payload as T;
}

export function createFriendChallenge(input: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  questionIds: string[];
  answers: Record<string, string>;
}) {
  return challengeRequest<{ challenge: FriendTriviaChallenge; result: { score: number; correctCount: number; totalCount: number } }>("/api/friend-challenges", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getFriendChallenge(token: string) {
  return challengeRequest<{ challenge: FriendTriviaChallenge }>(`/api/friend-challenges/${encodeURIComponent(token)}`);
}

export function submitFriendChallengeAttempt(token: string, input: { answers: Record<string, string>; playerName?: string }) {
  return challengeRequest<FriendChallengeAttemptResult>(`/api/friend-challenges/${encodeURIComponent(token)}/attempt`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getFriendChallengeHistory() {
  return challengeRequest<{ created: FriendTriviaChallenge[]; attempts: FriendChallengeHistoryAttempt[] }>("/api/friend-challenges/history");
}
