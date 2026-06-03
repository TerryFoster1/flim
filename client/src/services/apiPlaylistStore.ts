import type { MovieDetails, MovieSearchResult, Playlist, PlaylistMovie, WatchStatus } from "../types";

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Flim API request failed.");
  }

  return response.json() as Promise<T>;
}

export function getPlaylists() {
  return apiRequest<Playlist[]>("/api/playlists");
}

export function getPlaylistById(playlistId: string) {
  return apiRequest<Playlist>(`/api/playlists/${playlistId}`);
}

export function getMoviesForPlaylist(playlistId: string) {
  return apiRequest<PlaylistMovie[]>(`/api/playlist-movies?id=${playlistId}`);
}

export function getPublicPlaylistBySlug(publicSlug: string) {
  return apiRequest<Playlist>(`/api/public/playlists/${publicSlug}`);
}

export function followPlaylist(playlistId: string) {
  return apiRequest<{ ok: boolean; followerCount: number; isFollowing: boolean; isOwner?: boolean }>(`/api/playlists/${playlistId}/follow`, {
    method: "POST",
  });
}

export function unfollowPlaylist(playlistId: string) {
  return apiRequest<{ ok: boolean; followerCount: number; isFollowing: boolean; isOwner?: boolean }>(`/api/playlists/${playlistId}/follow`, {
    method: "DELETE",
  });
}

export function createPlaylist(input: Pick<Playlist, "name" | "description" | "visibility">) {
  return apiRequest<Playlist>("/api/playlists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deletePlaylist(playlistId: string) {
  return apiRequest<{ ok: boolean }>(`/api/playlists/${playlistId}`, {
    method: "DELETE",
  });
}

export function updatePlaylist(playlistId: string, input: Pick<Playlist, "name" | "description" | "visibility">) {
  return apiRequest<Playlist>(`/api/playlists/${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function addMovieToPlaylist(playlistId: string, movie: MovieSearchResult | MovieDetails) {
  return apiRequest<PlaylistMovie>(`/api/playlist-movies?id=${playlistId}`, {
    method: "POST",
    body: JSON.stringify(movie),
  });
}

export function removeMovieFromPlaylist(playlistId: string, tmdbId: number, mediaType = "movie") {
  return apiRequest<{ ok: boolean }>(`/api/playlists/${playlistId}/movies/${tmdbId}?type=${mediaType}`, {
    method: "DELETE",
  });
}

export function toggleWatchedStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus, mediaType = "movie") {
  return apiRequest<{ ok: boolean }>(`/api/playlists/${playlistId}/movies/${tmdbId}/watched?type=${mediaType}`, {
    method: "PATCH",
    body: JSON.stringify({ watchStatus }),
  });
}

export function reorderPlaylistMovies(playlistId: string, movieIds: string[]) {
  return apiRequest<{ ok: boolean }>(`/api/playlists/${playlistId}/movies/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ movieIds }),
  });
}
