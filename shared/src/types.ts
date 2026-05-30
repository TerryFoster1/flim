// Shared TypeScript interfaces for Flim Phase 1A.
// These are contract placeholders only and should evolve with API design before production use.
// No persistence, validation, or business behavior is implemented here.

export type WatchStatus = "want_to_watch" | "watching" | "watched" | "skipped" | "rewatch";
export type PlaylistVisibility = "private" | "shared" | "public";
export type ProviderAccessType = "subscription" | "rent" | "buy" | "free" | "library" | "unknown";
export type RouletteMode = "standard" | "random_movie" | "family_night" | "date_night" | "blind_spin";

export interface User {
  id: string;
  displayName: string;
  handle?: string;
  avatarUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Genre {
  id: string;
  name: string;
  slug?: string;
}

export interface Provider {
  id: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  supportedCountries?: string[];
}

export interface Movie {
  id: string;
  title: string;
  releaseYear?: number;
  runtimeMinutes?: number;
  description?: string;
  posterUrl?: string;
  genreIds?: string[];
  externalIds?: {
    imdb?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface MovieProvider {
  id: string;
  movieId: string;
  providerId: string;
  countryCode: string;
  accessType?: ProviderAccessType;
  availabilityStatus?: "available" | "unavailable" | "unknown";
  lastCheckedAt?: string;
}

export interface MovieLink {
  id: string;
  movieId: string;
  providerId?: string;
  countryCode?: string;
  platformUrl?: string;
  deepLinkUrl?: string;
  accessType?: ProviderAccessType;
  createdAt?: string;
}

export interface Playlist {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  visibility: PlaylistVisibility;
  collaborative: boolean;
  posterMovieIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PlaylistItem {
  id: string;
  playlistId: string;
  movieId: string;
  addedByUserId: string;
  recommendedByUserId?: string;
  sortOrder?: number;
  watchStatus?: WatchStatus;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PlaylistFollower {
  id: string;
  playlistId: string;
  userId: string;
  createdAt?: string;
}

export interface PlaylistCollaborator {
  id: string;
  playlistId: string;
  userId: string;
  role?: "viewer" | "editor" | "owner";
  invitedByUserId?: string;
  acceptedAt?: string;
  createdAt?: string;
}

export interface ShareLink {
  id: string;
  playlistId: string;
  createdByUserId: string;
  accessLevel: "view" | "comment" | "edit";
  expiresAt?: string;
  createdAt?: string;
}

export interface WatchHistory {
  id: string;
  userId: string;
  movieId: string;
  playlistId?: string;
  watchedAt?: string;
  watchStatus?: WatchStatus;
}

export interface Recommendation {
  id: string;
  movieId: string;
  playlistId?: string;
  recommendedByUserId?: string;
  recommendedToUserId?: string;
  context?: "playlist" | "friend" | "roulette" | "future_engine";
  createdAt?: string;
}

export interface RouletteHistory {
  id: string;
  userId?: string;
  selectedMovieId?: string;
  playlistId?: string;
  mode: RouletteMode;
  providerId?: string;
  filters?: RouletteFilterPlan;
  createdAt?: string;
}

export interface RouletteFilterPlan {
  genreIds?: string[];
  providerIds?: string[];
  playlistIds?: string[];
  runtimeMinutesMax?: number;
  releaseYearMin?: number;
  releaseYearMax?: number;
  includeWatched?: boolean;
}
