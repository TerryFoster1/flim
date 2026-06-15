import type { CompanionAchievement, CompanionProgress, EasterEggHunt, MediaType, TicketAward, TriviaFeed, TriviaQuestion, TriviaReportReason } from "../types";

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
  const response = await fetch(`/api/trivia?${params.toString()}`, { cache: "no-store" });
  return parseJson<TriviaFeed>(response);
}

export function enqueueTitleTrivia(input: { mediaType?: MediaType; tmdbId: number; source: "search" | "details" | "playlist_add" | "follow" | "trivia_page" }) {
  const mediaType = input.mediaType || "movie";
  if (!Number.isFinite(input.tmdbId)) return;
  fetch("/api/trivia/interest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mediaType, tmdbId: input.tmdbId, source: input.source }),
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

export async function reportTriviaQuestion(triviaId: string, reason: TriviaReportReason) {
  const response = await fetch("/api/trivia/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ triviaId, reason }),
  });
  return parseJson<{ ok: boolean; reportCount: number; status: string }>(response);
}

export async function reportEasterEggHunt(easterEggId: string, reason: TriviaReportReason) {
  const response = await fetch("/api/trivia/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ easterEggId, reason }),
  });
  return parseJson<{ ok: boolean; reportCount: number; status: string }>(response);
}

export async function completeCompanionItem(itemType: "trivia" | "easter_egg", itemId: string) {
  const response = await fetch("/api/trivia/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemType, itemId }),
  });
  return parseJson<{
    ok: boolean;
    itemType: "trivia" | "easter_egg";
    itemId: string;
    progress: CompanionProgress;
    achievements: CompanionAchievement[];
    unlockedAchievements: CompanionAchievement[];
    ticketAward?: TicketAward | null;
  }>(response);
}

export async function updateEasterEggHunt(input: { huntId: string; action: "start" | "hint" | "answer" | "complete"; answer?: string }) {
  const response = await fetch("/api/trivia/hunt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{
    ok: boolean;
    huntId: string;
    action: "start" | "hint" | "answer" | "complete";
    isCorrect: boolean | null;
    progress: CompanionProgress;
    achievements: CompanionAchievement[];
    unlockedAchievements: CompanionAchievement[];
    ticketAward?: TicketAward | null;
    easterEggs: EasterEggHunt[];
    questions: TriviaQuestion[];
  }>(response);
}
