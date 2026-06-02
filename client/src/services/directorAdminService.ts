import type { MovieSearchResult, Playlist, PlaylistMovie } from "../types";

export interface DirectorProfile {
  id: string;
  display_name: string;
  bio: string;
  tagline: string;
  quote: string;
  updated_at?: string;
}

export interface DirectorAnalytics {
  totalPlaylists: number;
  totalPublicPlaylists: number;
  totalMovies: number;
  publicPlaylistViews: number | null;
  shares: number | null;
  qrOpens: number | null;
  nowPlayingUses: number | null;
}

async function directorRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/director-admin${path}`, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Director admin request failed.");
  }

  return response.json() as Promise<T>;
}

export function getDirectorAdminSession() {
  return directorRequest<{ authenticated: boolean }>("/session");
}

export function loginDirectorAdmin(username: string, password: string) {
  return directorRequest<{ authenticated: boolean }>("/session", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logoutDirectorAdmin() {
  return directorRequest<{ ok: boolean }>("/logout", {
    method: "POST",
  });
}

export function getDirectorAnalytics() {
  return directorRequest<DirectorAnalytics>("/analytics");
}

export function getDirectorProfile() {
  return directorRequest<DirectorProfile>("/profile");
}

export function updateDirectorProfile(input: Pick<DirectorProfile, "display_name" | "bio" | "tagline" | "quote">) {
  return directorRequest<DirectorProfile>("/profile", {
    method: "PATCH",
    body: JSON.stringify({
      displayName: input.display_name,
      bio: input.bio,
      tagline: input.tagline,
      quote: input.quote,
    }),
  });
}

export function getDirectorPlaylists() {
  return directorRequest<Playlist[]>("/playlists");
}

export function createDirectorPlaylist(input: Pick<Playlist, "name" | "description" | "visibility">) {
  return directorRequest<Playlist>("/playlists", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getDirectorPlaylist(playlistId: string) {
  return directorRequest<Playlist>(`/playlists/${playlistId}`);
}

export function updateDirectorPlaylist(playlistId: string, input: Pick<Playlist, "name" | "description" | "visibility"> & { regenerateSlug?: boolean }) {
  return directorRequest<Playlist>(`/playlists/${playlistId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteDirectorPlaylist(playlistId: string) {
  return directorRequest<{ ok: boolean }>(`/playlists/${playlistId}`, {
    method: "DELETE",
  });
}

export function addMovieToDirectorPlaylist(playlistId: string, movie: MovieSearchResult) {
  return directorRequest<PlaylistMovie>(`/playlists/${playlistId}/movies`, {
    method: "POST",
    body: JSON.stringify(movie),
  });
}

export function removeMovieFromDirectorPlaylist(playlistId: string, movieId: string) {
  return directorRequest<{ ok: boolean }>(`/playlists/${playlistId}/movies/${movieId}`, {
    method: "DELETE",
  });
}

export function reorderDirectorPlaylistMovies(playlistId: string, movieIds: string[]) {
  return directorRequest<{ ok: boolean }>(`/playlists/${playlistId}/movies/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ movieIds }),
  });
}
