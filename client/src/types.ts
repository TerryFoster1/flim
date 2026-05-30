export type AppRoute =
  | "/"
  | "/discover"
  | "/playlists"
  | "/playlists/:id"
  | "/movies/:tmdbId"
  | "/public"
  | "/roulette"
  | "/profile"
  | "/profile/playlists"
  | "/profile/saved"
  | "/profile/watched"
  | "/providers"
  | "/settings";

export type WatchStatus = "not_watched" | "watched";

export interface RouteState {
  route: AppRoute;
  playlistId?: string;
  tmdbId?: string;
}

export interface RouteAwareProps {
  activeRoute: AppRoute;
  onNavigate: (path: string) => void;
}

export interface MovieSearchResult {
  tmdbId: number;
  title: string;
  releaseYear?: string;
  overview: string;
  posterPath?: string;
  posterUrl?: string;
  genreIds: number[];
}

export interface MovieDetails extends MovieSearchResult {
  runtimeMinutes?: number;
  genres: string[];
}

export interface PlaylistMovie {
  id?: string;
  playlistId?: string;
  tmdbId: number;
  title: string;
  releaseYear?: string;
  overview: string;
  posterPath?: string;
  posterUrl?: string;
  genres: string[];
  addedAt: string;
  watchStatus: WatchStatus;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  visibility: "private" | "shared" | "public";
  movies: PlaylistMovie[];
  createdAt: string;
  updatedAt: string;
  clonedFromId?: string;
  saved?: boolean;
}
