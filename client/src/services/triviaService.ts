import type { MediaType, TriviaFeed, TriviaReportReason } from "../types";

async function parseJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Trivia request failed.");
  }
  return payload as T;
}

export async function getTitleTrivia(input: { mediaType?: MediaType; tmdbId: number }) {
  const mediaType = input.mediaType || "movie";
  const params = new URLSearchParams({
    mediaType,
    tmdbId: String(input.tmdbId),
  });
  const response = await fetch(`/api/trivia?${params.toString()}`);
  return parseJson<TriviaFeed>(response);
}

export async function reportTriviaQuestion(triviaId: string, reason: TriviaReportReason) {
  const response = await fetch("/api/trivia/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ triviaId, reason }),
  });
  return parseJson<{ ok: boolean; reportCount: number; status: string }>(response);
}
