// Shared package barrel placeholder.
// Future client and server code should import shared interfaces and schema placeholders from here.

export type {
  Genre,
  Movie,
  MovieLink,
  MovieProvider,
  Playlist,
  PlaylistCollaborator,
  PlaylistFollower,
  PlaylistItem,
  PlaylistVisibility,
  Provider,
  ProviderAccessType,
  Recommendation,
  RouletteFilterPlan,
  RouletteHistory,
  RouletteMode,
  ShareLink,
  User,
  WatchHistory,
  WatchStatus,
} from "./types";
export type { SchemaPlaceholder } from "./schemas";
export { schemaPlaceholders } from "./schemas";
