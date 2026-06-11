export type AppRoute =
  | "/"
  | "/discover"
  | "/playlists"
  | "/playlists/:id"
  | "/p/:slug"
  | "/s/:token"
  | "/movies/:tmdbId"
  | "/tv/:tmdbId"
  | "/actor/:id"
  | "/collection/:id"
  | "/challenges"
  | "/hall-of-fame"
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
  actorId?: string;
  collectionId?: string;
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
  seasons?: TvSeason[];
  firstAirYear?: string;
  contentRating?: string;
  contentRatings?: ContentRating[];
  contentRatingVersion?: number;
  status?: string;
  popularity?: number;
  language?: string;
  cast?: CastMember[];
}

export interface CastMember {
  tmdbId: number;
  name: string;
  character?: string;
  profileUrl?: string;
  order?: number;
  knownForDepartment?: string;
}

export interface ActorCredit {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseYear?: string;
  posterUrl?: string;
  character?: string;
  popularity?: number;
}

export interface ActorSummary {
  tmdbId: number;
  name: string;
  profileUrl?: string;
  knownForDepartment?: string;
  knownFor?: string[];
  popularity?: number;
}

export interface ActorDetails extends ActorSummary {
  biography?: string;
  birthDate?: string;
  birthYear?: string;
  placeOfBirth?: string;
  movieCredits: ActorCredit[];
  tvCredits: ActorCredit[];
  featuredPlaylists: Playlist[];
  relatedActors: ActorSummary[];
}

export type CollectionStatus = "not_started" | "in_progress" | "completed";

export interface MediaCollectionItem {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseYear?: string;
  releaseDate?: string;
  overview?: string;
  posterUrl?: string;
  watchStatus: WatchStatus;
  userRating: number;
  triviaCompleted: number;
  triviaTotal: number;
}

export interface MediaCollectionProgress {
  totalCount: number;
  movieCount: number;
  tvCount: number;
  watchedCount: number;
  remainingCount: number;
  completionPercent: number;
  status: CollectionStatus;
}

export type CollectionChallengeStatus = "not_started" | "in_progress" | "completed";

export interface CollectionChallengeRequirement {
  type: "collection_completed" | "titles_watched" | "trivia_completed" | "easter_eggs_completed" | "achievement_unlocked";
  label: string;
  target: number;
  progress: number;
  completed: boolean;
}

export interface CollectionChallenge {
  id: string;
  collectionSlug: string;
  name: string;
  description: string;
  badge: string;
  points: number;
  difficulty: "easy" | "medium" | "hard" | "expert";
  category: string;
  requirements: CollectionChallengeRequirement[];
  completedRequirements: number;
  totalRequirements: number;
  completionPercent: number;
  status: CollectionChallengeStatus;
  earnedAt?: string;
}

export interface CollectionChallengeBadge {
  id: string;
  name: string;
  description: string;
  badge: string;
  points: number;
  difficulty?: string;
  category?: string;
  completionPercent?: number;
  earnedAt?: string;
}

export interface SeasonalChallengeRequirement {
  type: "movies_watched" | "tv_episodes_watched" | "collection_progress" | "trivia_completed" | "easter_eggs_completed" | "challenge_completed";
  label: string;
  target: number;
  progress: number;
  completed: boolean;
  genre?: string;
  collectionSlug?: string;
  challengeId?: string;
}

export interface SeasonalChallengeEvent {
  id: string;
  slug: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  badge: string;
  banner?: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  requirements: SeasonalChallengeRequirement[];
  points: number;
  status: "draft" | "published" | "archived";
  dateStatus: "upcoming" | "active" | "ended";
  userStatus: "not_started" | "in_progress" | "completed";
  completedRequirements: number;
  totalRequirements: number;
  completionPercent: number;
  daysRemaining: number;
  earnedAt?: string;
}

export interface SeasonalChallengeFeed {
  events: SeasonalChallengeEvent[];
  sections: {
    active: SeasonalChallengeEvent[];
    endingSoon: SeasonalChallengeEvent[];
    upcoming: SeasonalChallengeEvent[];
    recentlyCompleted: SeasonalChallengeEvent[];
    featured: SeasonalChallengeEvent | null;
  };
}

export interface MediaCollection {
  id: string;
  tmdbId: number;
  slug: string;
  title: string;
  overview: string;
  posterUrl?: string;
  backdropUrl?: string;
  category?: string;
  items: MediaCollectionItem[];
  progress: MediaCollectionProgress;
  challenges?: CollectionChallenge[];
}

export interface MediaCollectionFeed {
  collections: MediaCollection[];
  challenges?: CollectionChallenge[];
  sections: {
    popular: MediaCollection[];
    inProgress: MediaCollection[];
    completed: MediaCollection[];
    recentlyReleased: MediaCollection[];
  };
  challengeSections?: {
    popular: CollectionChallenge[];
    inProgress: CollectionChallenge[];
    completed: CollectionChallenge[];
    newChallenges: CollectionChallenge[];
  };
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
  airDate?: string;
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

export type EpisodeProgressStatus = "not_started" | "watching" | "watched";
export type ShowProgressStatus = "not_started" | "watching" | "completed";

export interface TvEpisodeProgress extends TvEpisode {
  status: EpisodeProgressStatus;
  progressPercent: number;
  lastWatchedAt?: string;
  completedAt?: string;
  released: boolean;
}

export interface TvSeasonProgress {
  seasonNumber: number;
  title: string;
  episodeCount: number;
  releasedEpisodeCount: number;
  watchedEpisodeCount: number;
  status: ShowProgressStatus;
  progressPercent: number;
  episodes: TvEpisodeProgress[];
}

export interface TvShowProgressSummary {
  tmdbShowId: number;
  title: string;
  posterUrl?: string;
  status: ShowProgressStatus;
  progressPercent: number;
  watchedEpisodeCount: number;
  releasedEpisodeCount: number;
  nextEpisode?: TvEpisodeProgress;
  lastWatchedAt?: string;
  completedAt?: string;
}

export interface TvShowProgress {
  show: TvShowProgressSummary;
  seasons: TvSeasonProgress[];
}

export interface ContinueWatchingItem {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterUrl?: string;
  backdropUrl?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
  progressPercent: number;
  lastWatchedAt?: string;
  actionPath: string;
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
  profileImageUrl?: string;
  heroImageUrl?: string;
  favoriteMovie?: string;
  favoriteGenre?: string;
  favoriteDirector?: string;
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
  | "trailer_released"
  | "seasonal_challenge_started"
  | "seasonal_challenge_ending"
  | "seasonal_challenge_completed"
  | "seasonal_badge_unlocked";

export interface AppNotification {
  id: string;
  recipientUserId: string;
  actorUserId?: string;
  actorDisplayName: string;
  type: NotificationType;
  entityType: "playlist" | "title" | "seasonal_challenge";
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

export interface PushNotificationPreferences {
  movies: boolean;
  tvShows: boolean;
  streamingAvailability: boolean;
  trailers: boolean;
  releaseDates: boolean;
}

export interface PushSubscriptionStatus {
  configured: boolean;
  publicKey: string;
  enabled: boolean;
  subscriptionCount: number;
  preferences: PushNotificationPreferences;
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
  profileImageUrl?: string;
  heroImageUrl?: string;
  favoriteMovie?: string;
  favoriteGenre?: string;
  favoriteDirector?: string;
  joinedAt?: string;
  isOwnProfile?: boolean;
  isFollowing?: boolean;
  countryCode?: string;
  stats?: {
    playlistCount: number;
    movieCount: number;
    followerCount: number;
    followingCount: number;
  };
  achievements?: {
    achievementCount: number;
    totalPoints: number;
    featuredBadges: CompanionAchievement[];
    recentUnlocks: CompanionAchievement[];
  };
  challenges?: {
    challengeCount: number;
    challengePoints: number;
    featuredBadges: CollectionChallengeBadge[];
    recentUnlocks: CollectionChallengeBadge[];
  };
  seasonalChallenges?: {
    seasonalBadgeCount: number;
    seasonalPoints: number;
    featuredBadges: CollectionChallengeBadge[];
    recentUnlocks: CollectionChallengeBadge[];
  };
  hallOfFame?: {
    appearanceCount: number;
    bestRank?: number | null;
    bestCategory?: string;
    positions: Array<{
      categoryId: string;
      title: string;
      rank: number;
      score: number;
      unit: string;
    }>;
  };
  publicPlaylists?: Playlist[];
}

export type HallOfFameWindow = "all_time" | "year" | "month" | "week";

export interface HallOfFameCategory {
  id: string;
  title: string;
  description: string;
  unit: string;
  group: "prestige" | "watching" | "curators";
}

export interface HallOfFameEntry {
  userId: string;
  rank: number;
  score: number;
  secondaryScore: number;
  displayName: string;
  handle: string;
  profileImageUrl?: string;
  achievementPoints: number;
  badgeCount: number;
  topBadge?: {
    id: string;
    name: string;
    description: string;
    rarity: string;
    points: number;
  };
}

export interface HallOfFameLeaderboard extends HallOfFameCategory {
  entries: HallOfFameEntry[];
}

export interface HallOfFameFeed {
  window: HallOfFameWindow;
  windowStart?: string | null;
  generatedAt: string;
  categories: HallOfFameCategory[];
  leaderboards: Record<string, HallOfFameLeaderboard>;
}

export interface DiscoveryProfileResult {
  displayName: string;
  handle: string;
  bio?: string;
  playlistCount: number;
  titleCount: number;
  followerCount?: number;
  profileImageUrl?: string;
}

export interface DiscoverySearchResults {
  query: string;
  titles: MovieSearchResult[];
  playlists: Playlist[];
  profiles: DiscoveryProfileResult[];
  actors: ActorSummary[];
  titleSource: "empty" | "catalog" | "catalog_cache" | "cache" | "catalog_tmdb" | "tmdb";
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

export type TriviaReportReason = "wrong_answer" | "confusing" | "spoiler" | "low_quality" | "inappropriate";

export interface TriviaQuestion {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  question: string;
  answer: string;
  options: string[];
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  spoilerLevel: "none" | "minor" | "major";
  sourceUrls: string[];
  sourceLabels: string[];
  confidence: number;
  status: string;
  reportCount: number;
  completed?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface EasterEggHunt {
  id: string;
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  prompt: string;
  hint: string;
  answer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  spoilerLevel: "none" | "minor" | "major";
  sourceUrls: string[];
  sourceLabels: string[];
  confidence: number;
  status: string;
  reportCount: number;
  userStatus: "not_started" | "started" | "hint_used" | "answered" | "completed";
  submittedAnswer?: string;
  isCorrect?: boolean;
  hintUsed?: boolean;
  startedAt?: string;
  completedAt?: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanionAchievement {
  id: string;
  name: string;
  description: string;
  badgeIcon: string;
  category: string;
  rarity?: string;
  tier?: string;
  points?: number;
  goalCount?: number;
  progressCount?: number;
  completionPercentage?: number;
  unlockedAt?: string;
}

export interface CompanionProgress {
  triviaCompleted: number;
  triviaTotal: number;
  easterEggsCompleted: number;
  easterEggsTotal: number;
  completionPercent: number;
}

export interface TriviaFeed {
  tmdbId: number;
  mediaType: MediaType;
  availabilityKnown: boolean;
  source: "cache" | "tmdb_metadata" | "none";
  questions: TriviaQuestion[];
  easterEggs?: EasterEggHunt[];
  progress?: CompanionProgress;
  achievements?: CompanionAchievement[];
  unlockedAchievements?: CompanionAchievement[];
  authenticated?: boolean;
  notes: string;
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

export interface TitleRatingSummary {
  mediaType: MediaType;
  tmdbId: number;
  userRating: number;
  ratingCount: number;
  averageRating: number;
  likedCount: number;
  lovedCount: number;
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
  isLiked?: boolean;
  likeCount?: number;
  createdAt: string;
  updatedAt: string;
  clonedFromId?: string;
  saved?: boolean;
  isSystem?: boolean;
  systemType?: "most_watched" | "recommended" | "plex_library";
}
