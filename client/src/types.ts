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

export type MediaType = "movie" | "tv";

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
  mediaType?: MediaType;
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

export interface TvSeriesDetails {
  tmdbId: number;
  mediaType: "tv";
  title: string;
  firstAirYear?: string;
  lastAirYear?: string;
  overview: string;
  posterPath?: string;
  posterUrl?: string;
  genres: string[];
  seasons?: TvSeason[];
}

export interface TvSeason {
  tmdbId?: number;
  seasonNumber: number;
  title?: string;
  episodeCount?: number;
  posterUrl?: string;
}

export interface TvEpisode {
  tmdbId?: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  overview?: string;
  runtimeMinutes?: number;
  airDate?: string;
  stillUrl?: string;
  watchStatus?: WatchStatus;
}

export interface SeriesProgress {
  tvShowTmdbId: number;
  currentSeasonNumber?: number;
  currentEpisodeNumber?: number;
  lastWatchedAt?: string;
  watchStatus: WatchStatus;
}

export interface PlaylistMovie {
  id?: string;
  playlistId?: string;
  mediaType?: MediaType;
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
  | "Tubi"
  | "Paramount+";

export type WatchProviderLinkType = "exact" | "search_fallback" | "connect_placeholder";

export type ProviderAccessType = "subscription" | "rent" | "buy" | "free" | "library" | "unknown";

export interface ProviderRegion {
  providerId: string;
  countryCode: string;
  regionName?: string;
  supported: boolean;
}

export interface WatchProvider {
  id: string;
  name: WatchProviderName;
  icon: string;
  searchUrlTemplate?: string;
  regions?: ProviderRegion[];
  capabilities?: ProviderCapabilities;
  notes: string;
}

export interface WatchProviderLink {
  provider: WatchProvider;
  linkType: WatchProviderLinkType;
  url?: string;
  deepLinkUrl?: string;
  accessType?: ProviderAccessType;
  label: string;
  availabilityKnown: boolean;
}

export interface ProviderDeepLink {
  providerId: string;
  mediaType: MediaType;
  tmdbId: number;
  url: string;
  platform?: "web" | "ios" | "android" | "tv";
}

export interface ProviderSearchFallback {
  providerId: string;
  mediaType?: MediaType;
  template: string;
  notes: string;
}

export interface ProviderCapabilities {
  opensWeb: boolean;
  opensMobileApp?: boolean;
  supportsCasting?: boolean;
  supportsRemotePlayback?: boolean;
  exactLinksRequireAvailabilityData?: boolean;
  notes?: string;
}

export interface MovieAvailability {
  tmdbId: number;
  mediaType?: MediaType;
  title: string;
  availabilityKnown: boolean;
  links: WatchProviderLink[];
  notes: string;
}

export interface MovieProviderFilter {
  providerIds: string[];
  countryCode?: string;
  accessTypes?: ProviderAccessType[];
  requireKnownAvailability?: boolean;
}

export interface PlexLibraryItem {
  id: string;
  mediaType?: MediaType;
  tmdbId?: number;
  title: string;
  year?: string;
  plexRatingKey?: string;
  plexUrl?: string;
}

export interface PlexLibrary {
  id: string;
  serverId: string;
  title: string;
  mediaType?: MediaType;
  sectionKey?: string;
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

export interface PlexPlayer extends PlexClient {
  state?: "available" | "playing" | "paused" | "offline" | "unknown";
}

export interface PlexSession {
  id: string;
  clientId: string;
  mediaType: MediaType;
  tmdbId?: number;
  startedAt?: string;
  state: "playing" | "paused" | "stopped" | "unknown";
}

export type PlaybackTargetType = "plex" | "chromecast" | "android_tv" | "google_tv" | "smart_tv" | "provider_app" | "unknown";

export interface ConnectedDevice {
  id: string;
  displayName: string;
  targetType: PlaybackTargetType;
  providerId?: string;
  capabilities?: ProviderCapabilities;
}

export interface TVTarget extends ConnectedDevice {
  targetType: "smart_tv" | "android_tv" | "google_tv";
}

export interface CastingTarget extends ConnectedDevice {
  targetType: "chromecast";
}

export interface PlaybackTarget extends ConnectedDevice {
  available: boolean;
}

export interface RemotePlaybackTarget extends PlaybackTarget {
  supportsQueueing?: boolean;
  supportsDirectPlay?: boolean;
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
