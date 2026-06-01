# Database Design Placeholder

Target database: PostgreSQL.

No migrations, database connection, ORM setup, seeds, mock data, or implementation code are included in Phase 1A.

## Users

Purpose: represent future account/profile records.

Placeholder fields: id, displayName, handle, avatarUrl, createdAt, updatedAt.

## Movies

Purpose: represent saved movie records and future metadata references.

Placeholder fields: id, title, releaseYear, runtimeMinutes, description, posterUrl, externalIds, createdAt, updatedAt.

## TV Shows

Purpose: represent future TV series and mini-series metadata.

Placeholder fields: id, title, firstAirYear, lastAirYear, description, posterUrl, backdropUrl, externalIds, status, createdAt, updatedAt.

## TV Seasons

Purpose: represent seasons within a TV show.

Placeholder fields: id, tvShowId, seasonNumber, title, episodeCount, posterUrl, createdAt, updatedAt.

## TV Episodes

Purpose: represent episodes for series progress and watch tracking.

Placeholder fields: id, tvShowId, seasonId, seasonNumber, episodeNumber, title, overview, runtimeMinutes, airDate, stillUrl, createdAt, updatedAt.

## MediaItems

Purpose: future abstraction for playlists and roulette pools containing either movies or TV shows.

Placeholder fields: id, mediaType, movieId, tvShowId, title, year, posterUrl, externalIds, createdAt, updatedAt.

Media type values: movie, tv.

## Genres

Purpose: represent movie genres for browsing, roulette filters, and playlist context.

Placeholder fields: id, name, slug.

## Providers

Purpose: represent streaming, rental, purchase, or regional provider platforms.

Placeholder fields: id, name, slug, logoUrl, supportedCountries, createdAt, updatedAt.

Future examples: Netflix, Amazon Prime, Disney+, Apple TV, Crave, Paramount+, Hulu, Peacock, Tubi, YouTube Movies, and regional providers.

## ProviderRegions

Purpose: describe country/region-specific provider availability rules.

Placeholder fields: id, providerId, countryCode, regionName, supported, createdAt, updatedAt.

## Playlists

Purpose: represent named movie collections owned by users.

Placeholder fields: id, ownerId, title, description, visibility, collaborative, posterMovieIds, createdAt, updatedAt.

Visibility values: private, shared, public.

## PlaylistMovies

Purpose: join playlists to movies and preserve ordering, recommendation attribution, and watch context.

Placeholder fields: id, playlistId, movieId, addedByUserId, recommendedByUserId, sortOrder, note, watchStatus, createdAt, updatedAt.

## PlaylistFollowers

Purpose: represent users following or saving public/shared playlists.

Placeholder fields: id, playlistId, userId, createdAt.

## PlaylistCollaborators

Purpose: represent invited collaborators and future edit permissions.

Placeholder fields: id, playlistId, userId, role, invitedByUserId, acceptedAt, createdAt.

## MovieProviders

Purpose: represent a movie's availability on a provider in a specific country or region.

Placeholder fields: id, movieId, providerId, countryCode, accessType, availabilityStatus, lastCheckedAt.

Access types: subscription, rent, buy, free, library, unknown.

## MovieLinks

Purpose: represent future platform URLs or deep links for opening a movie on a provider.

Placeholder fields: id, movieId, providerId, countryCode, platformUrl, deepLinkUrl, accessType, createdAt.

## MediaProviders

Purpose: future general availability table for movies and TV shows.

Placeholder fields: id, mediaType, movieId, tvShowId, providerId, countryCode, accessType, availabilityStatus, source, lastCheckedAt.

## ProviderLinks

Purpose: future general link table for exact links, deep links, and search fallbacks.

Placeholder fields: id, mediaType, movieId, tvShowId, providerId, countryCode, exactUrl, deepLinkUrl, searchFallbackUrl, linkType, createdAt.

## PlexServers

Purpose: represent a connected Plex server after auth/security scope opens.

Placeholder fields: id, userId, name, machineIdentifier, connectionUri, lastSyncedAt, createdAt, updatedAt.

## PlexLibraries

Purpose: represent libraries on a connected Plex server.

Placeholder fields: id, plexServerId, title, mediaType, sectionKey, createdAt, updatedAt.

## PlexLibraryItems

Purpose: represent Plex media items matched to movies or TV shows.

Placeholder fields: id, plexLibraryId, mediaType, movieId, tvShowId, ratingKey, title, year, matchStatus, plexUrl, createdAt, updatedAt.

## PlexClients

Purpose: represent Plex player targets that may support remote playback.

Placeholder fields: id, userId, name, product, platform, clientIdentifier, supportsRemotePlayback, lastSeenAt.

## PlaybackTargets

Purpose: represent future playback/casting targets across Plex, Chromecast, Android TV, Google TV, or supported devices.

Placeholder fields: id, userId, targetType, providerId, displayName, capabilities, lastSeenAt, createdAt, updatedAt.

## WatchHistory

Purpose: represent completed watch events and watch status over time.

Placeholder fields: id, userId, movieId, playlistId, watchedAt, watchStatus, rating, note.

## EpisodeWatchHistory

Purpose: represent TV episode watch progress.

Placeholder fields: id, userId, tvShowId, seasonId, episodeId, watchedAt, watchStatus, progressSeconds, note.

## SeriesProgress

Purpose: store current episode, current season, and resume state for TV shows.

Placeholder fields: id, userId, tvShowId, currentSeasonNumber, currentEpisodeNumber, lastWatchedEpisodeId, lastWatchedAt, status, updatedAt.

## Recommendations

Purpose: represent future recommendation attribution, not a recommendation engine implementation.

Placeholder fields: id, movieId, playlistId, recommendedByUserId, recommendedToUserId, context, createdAt.

## RouletteHistory

Purpose: represent future Movie Night Roulette outcomes and Blind Spin history.

Placeholder fields: id, userId, selectedMovieId, selectedTvShowId, selectedEpisodeId, playlistId, mode, providerId, mediaType, playbackTargetId, filters, createdAt.

## Future Notes

- Define indexes after access patterns are validated.
- Define ownership and visibility constraints before implementing sharing.
- Keep external movie IDs optional until integrations are explicitly approved.
- Keep provider availability country-specific from the start of schema planning.
- Keep roulette filters serializable so web and future native clients can share the same contract.
