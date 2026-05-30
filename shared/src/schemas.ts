// Shared schema placeholders for future runtime validation.
// TODO: Choose a validation library and define request/response schemas before implementing endpoints.
// Keep these schemas aligned with `types.ts`, `docs/api-design.md`, and Phase 1A product direction.

export interface SchemaPlaceholder {
  name: string;
  purpose: string;
  implementationStatus: "placeholder_only";
}

export const schemaPlaceholders: SchemaPlaceholder[] = [
  { name: "UserSchema", purpose: "Validate future user profile payloads", implementationStatus: "placeholder_only" },
  { name: "MovieSchema", purpose: "Validate future poster-first movie payloads", implementationStatus: "placeholder_only" },
  { name: "GenreSchema", purpose: "Validate future genre payloads", implementationStatus: "placeholder_only" },
  { name: "ProviderSchema", purpose: "Validate future streaming provider payloads", implementationStatus: "placeholder_only" },
  { name: "PlaylistSchema", purpose: "Validate future playlist payloads", implementationStatus: "placeholder_only" },
  { name: "PlaylistMovieSchema", purpose: "Validate future playlist movie payloads", implementationStatus: "placeholder_only" },
  { name: "PlaylistFollowerSchema", purpose: "Validate future playlist follower payloads", implementationStatus: "placeholder_only" },
  { name: "PlaylistCollaboratorSchema", purpose: "Validate future collaborator payloads", implementationStatus: "placeholder_only" },
  { name: "MovieProviderSchema", purpose: "Validate future provider availability payloads", implementationStatus: "placeholder_only" },
  { name: "MovieLinkSchema", purpose: "Validate future movie provider link payloads", implementationStatus: "placeholder_only" },
  { name: "WatchHistorySchema", purpose: "Validate future watch history payloads", implementationStatus: "placeholder_only" },
  { name: "RecommendationSchema", purpose: "Validate future recommendation attribution payloads", implementationStatus: "placeholder_only" },
  { name: "RouletteHistorySchema", purpose: "Validate future roulette event payloads", implementationStatus: "placeholder_only" },
];
