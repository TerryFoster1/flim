# Database Design Placeholder

Target database: PostgreSQL.

No migrations, database connection, ORM setup, seeds, mock data, or implementation code are included in Phase 1A.

## Users

Purpose: represent future account/profile records.

Placeholder fields: id, displayName, handle, avatarUrl, createdAt, updatedAt.

## Movies

Purpose: represent saved movie records and future metadata references.

Placeholder fields: id, title, releaseYear, runtimeMinutes, description, posterUrl, externalIds, createdAt, updatedAt.

## Genres

Purpose: represent movie genres for browsing, roulette filters, and playlist context.

Placeholder fields: id, name, slug.

## Providers

Purpose: represent streaming, rental, purchase, or regional provider platforms.

Placeholder fields: id, name, slug, logoUrl, supportedCountries, createdAt, updatedAt.

Future examples: Netflix, Amazon Prime, Disney+, Apple TV, Crave, Paramount+, Hulu, Peacock, Tubi, YouTube Movies, and regional providers.

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

## WatchHistory

Purpose: represent completed watch events and watch status over time.

Placeholder fields: id, userId, movieId, playlistId, watchedAt, watchStatus, rating, note.

## Recommendations

Purpose: represent future recommendation attribution, not a recommendation engine implementation.

Placeholder fields: id, movieId, playlistId, recommendedByUserId, recommendedToUserId, context, createdAt.

## RouletteHistory

Purpose: represent future Movie Roulette outcomes and Blind Spin history.

Placeholder fields: id, userId, selectedMovieId, playlistId, mode, providerId, filters, createdAt.

## Future Notes

- Define indexes after access patterns are validated.
- Define ownership and visibility constraints before implementing sharing.
- Keep external movie IDs optional until integrations are explicitly approved.
- Keep provider availability country-specific from the start of schema planning.
- Keep roulette filters serializable so web and future native clients can share the same contract.
