export type AppRoute =
  | "/"
  | "/discover"
  | "/playlists"
  | "/playlists/:id"
  | "/p/:slug"
  | "/s/:token"
  | "/movies/:tmdbId"
  | "/tv/:tmdbId"
  | "/public"
  | "/roulette"
  | "/upcoming"
  | "/profile"
  | "/profile/playlists"
  | "/profile/saved"
  | "/profile/watched"
  | "/followed-titles"
  | "/providers"
  | "/settings"
  | "/signin"
  | "/signup"
  | "/@handle"
  | "/privacy"
  | "/terms"
  | "/contact"
  | "/help"
  | "/about"
  | "/director-admin/login"
  | "/director-admin/dashboard"
  | "/director-admin/playlists"
  | "/director-admin/playlists/:id"
  | "/director-admin/analytics";

export type WatchStatus = "not_watched" | "watched";

export type MediaType = "movie" | "tv";

export interface RouteState {
  route: AppRoute;
  playlistId?: string;
  publicSlug?: string;
  sharedToken?: string;
  tmdbId?: string;
  handle?: string;
  adminPlaylistId?: string;
}

export interface RouteAwareProps {
  activeRoute: AppRoute;
  onNavigate: (path: string) => void;
}

export interface MovieSearchResult {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseDate?: string;
  releaseYear?: string;
  overview: string;
  posterPath?: string;
  posterUrl?: string;
  genreIds: number[];
}

export interface MovieDetails extends MovieSearchResult {
  releaseDate?: string;
  backdropUrl?: string;
  runtimeMinutes?: number;
  genres: string[];
  seasonCount?: number;
  episodeCount?: number;
  firstAirYear?: string;
  contentRating?: string;
  contentRatings?: ContentRating[];
  contentRatingVersion?: number;
  status?: string;
  popularity?: number;
  language?: string;
}

export interface ContentRating {
  countryCode: string;
  rating: string;
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
  seasonCount?: number;
  episodeCount?: number;
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
  mediaItemId?: string;
  mediaType?: MediaType;
  tmdbId: number;
  title: string;
  releaseYear?: string;
  overview: string;
  posterPath?: string;
  posterUrl?: string;
  genres: string[];
  runtimeMinutes?: number;
  seasonCount?: number;
  episodeCount?: number;
  sortOrder?: number;
  addedAt: string;
  watchStatus: WatchStatus;
  recommendationReason?: string;
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
  | "Paramount+"
  | string;

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
  logoUrl?: string;
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
  regionPrompt?: string;
}

export interface UserProfile {
  id?: string;
  userId?: string;
  displayName: string;
  handle: string;
  bio?: string;
  countryCode: string;
  region?: string;
  provinceState?: string;
  postalCode?: string;
  streamingRegion: string;
  preferredProviders: string[];
  showCountryPublicly?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  profile: UserProfile | null;
}

export type NotificationType =
  | "playlist_followed"
  | "title_released"
  | "release_date_changed"
  | "movie_released"
  | "title_status_changed"
  | "season_announced"
  | "season_release_changed"
  | "season_released"
  | "episode_available"
  | "episode_released"
  | "streaming_available"
  | "provider_changed"
  | "trailer_released";

export interface AppNotification {
  id: string;
  recipientUserId: string;
  actorUserId?: string;
  actorDisplayName: string;
  type: NotificationType;
  entityType: "playlist" | "title";
  entityId?: string;
  entityPath?: string;
  title: string;
  message: string;
  readAt?: string;
  createdAt: string;
}

export interface NotificationFeed {
  unreadCount: number;
  notifications: AppNotification[];
}

export type MovieNotificationSetting = "theaterRelease" | "streamingAvailability" | "trailerReleased";
export type TvNotificationSetting = "newSeasonAnnounced" | "seasonReleaseDate" | "newEpisodeAvailable" | "streamingAvailability";
export type TitleNotificationSettings = Partial<Record<MovieNotificationSetting | TvNotificationSetting, boolean>>;

export interface FollowedTitle {
  id: string;
  mediaItemId: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  overview?: string;
  posterUrl?: string;
  releaseDate?: string;
  releaseYear?: string;
  status?: string;
  upcoming: boolean;
  seasonData?: Record<string, unknown>;
  notificationSettings: TitleNotificationSettings;
  createdAt: string;
  updatedAt: string;
}

export interface UpcomingRelease {
  mediaItemId: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  overview: string;
  posterUrl?: string;
  backdropUrl?: string;
  releaseDate?: string;
  releaseYear?: string;
  status?: string;
  seasonCount?: number;
  episodeCount?: number;
  genres: string[];
  genreIds: number[];
  isFollowing: boolean;
  latestEventType?: string;
  latestEventAt?: string;
  latestEventTitle?: string;
  latestEventBody?: string;
  availabilityKnown: boolean;
}

export interface UpcomingReleaseEvent {
  eventType: string;
  createdAt: string;
  mediaType: MediaType;
  tmdbId: number;
  eventTitle?: string;
  body?: string;
  title: string;
  posterUrl?: string;
}

export interface UpcomingReleaseFeed {
  items: UpcomingRelease[];
  sections: {
    upcomingMovies: UpcomingRelease[];
    upcomingTv: UpcomingRelease[];
    releasingThisMonth: UpcomingRelease[];
    recentlyAnnounced: UpcomingReleaseEvent[];
    recentlyDelayed: UpcomingReleaseEvent[];
  };
  filters: {
    mediaType: MediaType | "both";
    window: "month" | "quarter" | "year" | "all";
  };
  generatedAt: string;
}

export interface PublicUserProfile {
  displayName: string;
  handle: string;
  bio?: string;
  countryCode?: string;
  stats?: {
    playlistCount: number;
    movieCount: number;
    futureFollowerCount: number;
  };
  publicPlaylists?: Playlist[];
}

export interface Artist {
  id?: string;
  name: string;
}

export interface AlbumLink {
  provider: "spotify" | "apple_music" | "youtube_music" | "unknown";
  url: string;
  linkType: "exact" | "search_fallback";
  label: string;
}

export interface SpotifyAlbum {
  id?: string;
  name: string;
  artworkUrl?: string;
  artists: Artist[];
  spotifyUrl?: string;
}

export interface Soundtrack {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  query: string;
  album?: SpotifyAlbum;
  links: AlbumLink[];
}

export interface SoundtrackAvailability {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  availabilityKnown: boolean;
  soundtrack?: Soundtrack;
  notes: string;
}

export type VideoContentType = "official_trailer" | "teaser_trailer" | "behind_the_scenes" | "interview" | "featurette";

export interface MediaVideoLink {
  provider: "youtube";
  contentType: VideoContentType;
  url: string;
  linkType: "exact" | "search_fallback";
  label: string;
  thumbnailUrl?: string;
}

export interface TriviaEntry {
  id?: string;
  mediaType: MediaType;
  tmdbId: number;
  category: "trivia" | "fun_fact" | "award" | "behind_the_scenes" | "production";
  title: string;
  body?: string;
  sourceUrl?: string;
}

export interface MediaExtensions {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  soundtrack: SoundtrackAvailability;
  videos: MediaVideoLink[];
  trivia: TriviaEntry[];
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
  sharedSlug?: string;
  name: string;
  description: string;
  visibility: "private" | "shared" | "public";
  movies: PlaylistMovie[];
  creatorHandle?: string;
  creatorDisplayName?: string;
  ownerUserId?: string;
  isOwner?: boolean;
  canAddTitles?: boolean;
  canRemoveTitles?: boolean;
  canReorderTitles?: boolean;
  canEditPlaylist?: boolean;
  accessMode?: "owner" | "private" | "shared" | "public";
  isFollowing?: boolean;
  followerCount?: number;
  createdAt: string;
  updatedAt: string;
  clonedFromId?: string;
  saved?: boolean;
  isSystem?: boolean;
  systemType?: "most_watched" | "recommended" | "plex_library";
}
