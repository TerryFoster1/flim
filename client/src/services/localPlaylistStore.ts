import type { MovieDetails, MovieSearchResult, Playlist, PlaylistMovie, WatchStatus } from "../types";

const STORAGE_KEY = "flim.playlists.v1";

function now() {
  return new Date().toISOString();
}

function makeId() {
  return `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toPlaylistMovie(movie: MovieSearchResult | MovieDetails): PlaylistMovie {
  return {
    tmdbId: movie.tmdbId,
    title: movie.title,
    releaseYear: movie.releaseYear,
    overview: movie.overview,
    posterPath: movie.posterPath,
    posterUrl: movie.posterUrl,
    genres: "genres" in movie ? movie.genres : [],
    addedAt: now(),
    watchStatus: "not_watched",
  };
}

export function loadPlaylists(): Playlist[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Playlist[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePlaylists(playlists: Playlist[]) {
  // Future backend replacement point: this is the only write path for user playlist state.
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
}

export function createPlaylist(input: Pick<Playlist, "name" | "description" | "visibility">, playlists: Playlist[]) {
  const created: Playlist = {
    id: makeId(),
    name: input.name.trim() || "Playlist Name",
    description: input.description.trim(),
    visibility: input.visibility,
    movies: [],
    createdAt: now(),
    updatedAt: now(),
  };

  return [created, ...playlists];
}

export function addMovieToPlaylist(playlists: Playlist[], playlistId: string, movie: MovieSearchResult | MovieDetails) {
  return playlists.map((playlist) => {
    if (playlist.id !== playlistId) return playlist;
    if (playlist.movies.some((item) => item.tmdbId === movie.tmdbId)) return playlist;
    return {
      ...playlist,
      movies: [toPlaylistMovie(movie), ...playlist.movies],
      updatedAt: now(),
    };
  });
}

export function removeMovieFromPlaylist(playlists: Playlist[], playlistId: string, tmdbId: number) {
  return playlists.map((playlist) =>
    playlist.id === playlistId
      ? { ...playlist, movies: playlist.movies.filter((movie) => movie.tmdbId !== tmdbId), updatedAt: now() }
      : playlist,
  );
}

export function setMovieWatchStatus(playlists: Playlist[], playlistId: string, tmdbId: number, watchStatus: WatchStatus) {
  return playlists.map((playlist) =>
    playlist.id === playlistId
      ? {
          ...playlist,
          movies: playlist.movies.map((movie) => (movie.tmdbId === tmdbId ? { ...movie, watchStatus } : movie)),
          updatedAt: now(),
        }
      : playlist,
  );
}

export function clonePlaylist(playlists: Playlist[], playlistId: string) {
  const source = playlists.find((playlist) => playlist.id === playlistId);
  if (!source) return playlists;

  const clone: Playlist = {
    ...source,
    id: makeId(),
    name: `${source.name} Copy`,
    clonedFromId: source.id,
    createdAt: now(),
    updatedAt: now(),
  };

  return [clone, ...playlists];
}
