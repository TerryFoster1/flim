export type AppRoute =
  | "/"
  | "/discover"
  | "/playlists"
  | "/playlists/:id"
  | "/p/:slug"
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
  publicSlug?: string;
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

export type WatchProviderName =
  | "Plex"
  | "Netflix"
  | "Prime Video"
  | "Disney+"
  | "Apple TV"
  | "Crave"
  | "YouTube"
  | "Tubi";

export type WatchProviderLinkType = "exact" | "search_fallback" | "connect_placeholder";

export interface WatchProvider {
  id: string;
  name: WatchProviderName;
  icon: string;
  searchUrlTemplate?: string;
  notes: string;
}

export interface WatchProviderLink {
  provider: WatchProvider;
  linkType: WatchProviderLinkType;
  url?: string;
  label: string;
  availabilityKnown: boolean;
}

export interface MovieAvailability {
  tmdbId: number;
  title: string;
  availabilityKnown: boolean;
  links: WatchProviderLink[];
  notes: string;
}

export interface PlexLibraryItem {
  id: string;
  tmdbId?: number;
  title: string;
  year?: string;
  plexRatingKey?: string;
  plexUrl?: string;
}

export interface PlexServer {
  id: string;
  name: string;
  connectionUrl?: string;
  owned?: boolean;
}

export interface PlexClient {
  id: string;
  name: string;
  product?: string;
  platform?: string;
  supportsRemotePlayback?: boolean;
}

export interface Playlist {
  id: string;
  publicSlug: string;
  name: string;
  description: string;
  visibility: "private" | "shared" | "public";
  movies: PlaylistMovie[];
  createdAt: string;
  updatedAt: string;
  clonedFromId?: string;
  saved?: boolean;
}
