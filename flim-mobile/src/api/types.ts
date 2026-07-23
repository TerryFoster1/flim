export type MediaType = "movie" | "tv";

export interface CurrentUser {
  id: string;
  email?: string;
  handle?: string;
  displayName?: string;
  bio?: string;
  avatarId?: string;
  avatarSkinId?: string | null;
  ticketBalance?: number;
}

export interface MovieSearchResult {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  releaseDate?: string;
  releaseYear?: string;
  overview?: string;
  posterPath?: string;
  posterUrl?: string;
  genreIds?: number[];
}

export interface CastMember {
  tmdbId: number;
  name: string;
  character?: string;
  profileUrl?: string;
  order?: number;
}

export interface MediaVideoLink {
  id: string;
  name: string;
  site: string;
  key: string;
  type?: string;
  official?: boolean;
  url?: string;
}

export interface MovieDetails extends MovieSearchResult {
  backdropUrl?: string;
  runtimeMinutes?: number;
  genres?: string[];
  contentRating?: string;
  cast?: CastMember[];
  videos?: MediaVideoLink[];
}

export interface PlaylistMovie {
  tmdbId: number;
  mediaType: MediaType;
  title: string;
  posterUrl?: string;
  releaseYear?: string;
  watched?: boolean;
}

export interface Playlist {
  id: string;
  publicSlug: string;
  sharedSlug?: string;
  name: string;
  description?: string;
  visibility: "private" | "shared" | "public";
  movies?: PlaylistMovie[];
  movieCount?: number;
  isOwner?: boolean;
  isFollowing?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProviderAvailability {
  providerId?: string;
  providerName: string;
  logoPath?: string;
  type?: string;
}

export interface TriviaQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard" | "expert" | string;
}

export interface TriviaFeed {
  tmdbId: number;
  mediaType: MediaType;
  generationStatus?: "missing" | "queued" | "generating" | "ready" | "failed" | "insufficient_source";
  questions: TriviaQuestion[];
  notes?: string;
}

export interface ChallengePack {
  id: string;
  slug?: string;
  title?: string;
  name?: string;
  description?: string;
  questionCount?: number;
  artwork?: string;
  imageUrl?: string;
  badgeReward?: string;
  mode?: "trivia" | "quote" | "poster_guess" | "timeline" | "group" | string;
}

export type BacklotDiscoverySourceType = "arcade_mode" | "title_trivia" | "challenge_theme" | "collection_theme";

export type BacklotEventType = "launch" | "pause" | "resume" | "game_over" | "score" | "achievement";

export interface BacklotGame {
  id: string;
  title: string;
  description: string;
  route: string;
  difficulty: "easy" | "medium" | "hard" | "expert" | string;
  estimatedPlayTimeMinutes: number;
  genre: string;
  rewardId?: string;
  achievementSetId?: string;
}

export interface BacklotDiscovery {
  id?: string;
  gameId: string;
  gameTitle: string;
  sourceType: BacklotDiscoverySourceType;
  sourceId: string;
  sourceTitle: string;
  discoveredAt: string;
  unlockedAt?: string;
  firstPlayedAt?: string | null;
  totalPlayTimeMs?: number;
  syncStatus?: "synced" | "pending";
}

export interface BacklotState {
  userId?: string;
  unlockIds: string[];
  discoveries: BacklotDiscovery[];
  games: BacklotGame[];
  progress: {
    discoveredCount: number;
    secretsRemainingLabel: string;
  };
}

export interface BacklotDiscoveryRequest {
  gameId: string;
  sourceType: BacklotDiscoverySourceType;
  sourceId: string;
  sourceTitle?: string;
  clientDiscoveryId?: string;
}

export interface BacklotEventRequest {
  gameId: string;
  eventType: BacklotEventType;
  score?: number;
  playTimeMs?: number;
  achievementEvent?: string;
  clientEventId?: string;
}

export interface SearchResponse {
  results?: MovieSearchResult[];
  movies?: MovieSearchResult[];
  tv?: MovieSearchResult[];
}
