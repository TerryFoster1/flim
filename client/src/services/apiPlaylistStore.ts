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

export async function clonePlaylist(playlistId: string) {
  const source = await getPlaylistById(playlistId);
  const clone = await createPlaylist({
    name: `${source.name} Copy`,
    description: source.description,
    visibility: "private",
  });

  for (const movie of source.movies) {
    await addMovieToPlaylist(clone.id, {
      tmdbId: movie.tmdbId,
      mediaType: movie.mediaType || "movie",
      title: movie.title,
      releaseYear: movie.releaseYear,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      posterPath: movie.posterPath,
      runtimeMinutes: movie.runtimeMinutes,
      seasonCount: movie.seasonCount,
      episodeCount: movie.episodeCount,
      genreIds: [],
      genres: movie.genres || [],
    });
  }

  return getPlaylistById(clone.id);
}
