import type { MediaType, TitleRatingSummary } from "../types";

async function ratingRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Title rating request failed.");
  }

  return response.json() as Promise<T>;
}

function ratingPath(mediaType: MediaType, tmdbId: number) {
  return `/api/title-ratings?mediaType=${mediaType}&tmdbId=${tmdbId}`;
}

export function getTitleRating(mediaType: MediaType, tmdbId: number) {
  return ratingRequest<TitleRatingSummary>(ratingPath(mediaType, tmdbId));
}

export function setTitleRating(mediaType: MediaType, tmdbId: number, rating: number) {
  return ratingRequest<TitleRatingSummary>(ratingPath(mediaType, tmdbId), {
    method: "PUT",
    body: JSON.stringify({ rating }),
  });
}

export function clearTitleRating(mediaType: MediaType, tmdbId: number) {
  return ratingRequest<TitleRatingSummary>(ratingPath(mediaType, tmdbId), {
    method: "DELETE",
  });
}
