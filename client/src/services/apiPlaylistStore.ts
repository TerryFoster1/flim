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
  return apiRequest<PlaylistMovie[]>(`/api/playlists/${playlistId}/movies`);
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

export function addMovieToPlaylist(playlistId: string, movie: MovieSearchResult | MovieDetails) {
  return apiRequest<PlaylistMovie>(`/api/playlists/${playlistId}/movies`, {
    method: "POST",
    body: JSON.stringify(movie),
  });
}

export function removeMovieFromPlaylist(playlistId: string, tmdbId: number) {
  return apiRequest<{ ok: boolean }>(`/api/playlists/${playlistId}/movies/${tmdbId}`, {
    method: "DELETE",
  });
}

export function toggleWatchedStatus(playlistId: string, tmdbId: number, watchStatus: WatchStatus) {
  return apiRequest<{ ok: boolean }>(`/api/playlists/${playlistId}/movies/${tmdbId}/watched`, {
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
      title: movie.title,
      releaseYear: movie.releaseYear,
      overview: movie.overview,
      posterUrl: movie.posterUrl,
      posterPath: movie.posterPath,
      genreIds: [],
    });
  }

  return getPlaylistById(clone.id);
}
