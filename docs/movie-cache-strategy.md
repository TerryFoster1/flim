# Flim Movie Cache Strategy

Flim uses TMDb as a discovery and import source, not as the long-term source that the browser calls repeatedly.

The product goal is that Flim gradually builds its own internal movie and TV metadata layer in Neon while continuing to respect TMDb attribution and licensing. Flim stores metadata and remote poster URLs only. It must not download, store, or redistribute copyrighted poster files locally.

## Canonical Flow

Every movie or TV lookup should follow this order:

1. Check Flim's database/cache first.
2. Return cached Flim results when available and unexpired.
3. Call TMDb only when no usable cached record exists.
4. Normalize TMDb payloads into Flim-shaped media records.
5. Store normalized metadata and remote poster URLs in Neon.
6. Prefer Flim database records for future searches and playlist additions.

This rule applies to:

- Title search.
- Person search results.
- Genre and decade discovery.
- Similar movie and similar TV results.
- Playlist movie or TV additions.
- Future recommendation and discovery shelves.

## Current Implementation

The current production implementation has server-side TMDb proxy endpoints:

- `GET /api/movies/search?q=&type=movie|tv|both`
- `GET /api/movies/:tmdbId?type=movie|tv`

The browser calls these Flim API routes, not TMDb directly.

The current Neon catalog and cache tables are:

- `media_items`
- `people`
- `media_people`
- `tmdb_search_cache`
- `tmdb_movie_cache`

Search now checks `media_items` first by title/original title and media type. If no catalog records match, search checks `tmdb_search_cache`. Search cache entries are normalized by lowercased, trimmed query and media type and expire after 7 days.

Movie and TV details check `media_items` first when the catalog row is detail-ready. If the catalog row is missing or still sparse from playlist backfill, details fall through to `tmdb_movie_cache` and then TMDb. Detail cache entries are keyed by `media_type + tmdb_id` and expire after 30 days.

The API returns `X-Flim-Catalog` and `X-Flim-Cache` headers so catalog/cache behavior can be tested without exposing credentials.

## Internal Media Records

Flim has a normalized internal media catalog foundation:

- `media_items`
- `people`
- `media_people`

Current `media_items` fields:

- `id`
- `media_type`
- `tmdb_id`
- `title`
- `original_title`
- `overview`
- `release_date`
- `year`
- `poster_url`
- `backdrop_url`
- `runtime`
- `rating`
- `status`
- `popularity`
- `genres`
- `language`
- `provider_last_checked`
- `source_payload`
- `created_at`
- `updated_at`

Use a unique key on:

`media_type + tmdb_id`

Playlist additions upsert `media_items` first, then attach the item to `playlist_movies.media_item_id` while preserving the legacy denormalized playlist columns for backward compatibility.

## Current Search Order

```text
media_items
tmdb_search_cache
TMDb
normalize
store in media_items
store in tmdb_search_cache
```

## Current Detail Order

```text
media_items
tmdb_movie_cache
TMDb
normalize
update media_items
store in tmdb_movie_cache
```

Playlist rows, Director's Cut seed rows, search results, cached search results, and detail responses all upsert into `media_items`.

## Source Rules

Allowed:

- TMDb API calls from server-side API routes.
- Neon storage of metadata returned by TMDb.
- Neon storage of remote TMDb image URLs.
- Cache expiry and refresh logic.
- TMDb attribution in appropriate product/legal surfaces.

Not allowed:

- Browser-side TMDb secrets.
- `VITE_TMDB_ACCESS_TOKEN` or `VITE_TMDB_API_KEY` as the long-term production path.
- Repeated TMDb calls when a valid Flim cache record exists.
- Website scraping.
- Downloading or storing copyrighted poster files locally.
- Presenting provider availability as confirmed unless the data source confirms it for the user's region.

## Where To Watch V1 Cache

Provider availability follows the same cache-first rule:

1. Check `title_availability` in Neon by `media_type + tmdb_id + region`.
2. Return cached provider links if available and unexpired.
3. Call a configured provider source only on cache miss.
4. Normalize provider name, provider ID, region, access type, deep link, and search fallback URL.
5. Store normalized rows in Neon.
6. Future movie and TV detail pages prefer Flim's cached provider rows.

The current recommended V1 source is Watchmode behind server-only `WATCHMODE_API_KEY`. `provider_availability` is a compatibility view over `title_availability` for future reporting and admin use. If no provider source is configured, Flim must not show provider logos as available and should display `Streaming availability coming soon.`

See `where-to-watch-v1.md` for the provider source recommendation, schema, UI rules, and Plex preparation notes.

## Discovery Expansion

Future discovery endpoints should use cache-first logic before calling TMDb:

- Person search: cache the person query and normalized person results.
- Person filmography: cache by TMDb person ID and media type.
- Genre and decade discovery: cache query parameters and result sets.
- Similar media: cache by `media_type + tmdb_id`.
- Recommendation shelves: prefer existing `media_items`; import only missing candidates.

Each new endpoint should include:

- A normalized cache key.
- Media type when relevant.
- Expiry rules.
- A way to verify cache hits.
- Server-only TMDb credentials.

## Verification Checklist

Before shipping any movie-data feature:

- First request returns `X-Flim-Cache: MISS` when cache is empty.
- Repeated request returns `X-Flim-Cache: HIT`.
- No TMDb credential is exposed in the browser bundle.
- No `DATABASE_URL` is exposed in the browser bundle.
- Poster fields are remote URLs, not local copied files.
- Movie and TV IDs do not collide because all keys include `media_type`.
- Playlist additions persist from Flim data after import.

## Environment Variables

Preferred server-side env var:

- `TMDB_ACCESS_TOKEN`

Fallback server-side env var:

- `TMDB_API_KEY`

Temporary compatibility only:

- Existing serverless code can read `VITE_TMDB_ACCESS_TOKEN` server-side for continuity, but this should be migrated to `TMDB_ACCESS_TOKEN` and then removed.
