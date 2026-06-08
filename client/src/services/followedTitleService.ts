import type { FollowedTitle, MediaType, MovieDetails, TitleNotificationSettings } from "../types";

async function followedTitleRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
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
    throw new Error(payload.error || "Follow Title request failed.");
  }

  return response.json() as Promise<T>;
}

export function getFollowedTitles() {
  return followedTitleRequest<{ followedTitles: FollowedTitle[] }>("/api/followed-titles");
}

export function getFollowedTitleStatus(mediaType: MediaType, tmdbId: number) {
  return followedTitleRequest<{ isFollowing: boolean; followedTitle: FollowedTitle | null }>(
    `/api/followed-titles?mediaType=${mediaType}&tmdbId=${tmdbId}`,
  );
}

export function followTitle(movie: MovieDetails, notificationSettings: TitleNotificationSettings) {
  return followedTitleRequest<{ ok: boolean; isFollowing: boolean; followedTitle: FollowedTitle | null }>("/api/followed-titles", {
    method: "POST",
    body: JSON.stringify({
      action: "follow",
      ...movie,
      mediaType: movie.mediaType || "movie",
      notificationSettings,
    }),
  });
}

export function updateTitleNotifications(mediaType: MediaType, tmdbId: number, notificationSettings: TitleNotificationSettings) {
  return followedTitleRequest<{ ok: boolean; isFollowing: boolean; followedTitle: FollowedTitle | null }>("/api/followed-titles", {
    method: "POST",
    body: JSON.stringify({
      action: "follow",
      mediaType,
      tmdbId,
      notificationSettings,
    }),
  });
}

export function unfollowTitle(mediaType: MediaType, tmdbId: number) {
  return followedTitleRequest<{ ok: boolean; isFollowing: boolean }>("/api/followed-titles", {
    method: "POST",
    body: JSON.stringify({ action: "unfollow", mediaType, tmdbId }),
  });
}
