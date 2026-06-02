# Neon Migration Runbook

This runbook brings Neon up to date with the current Flim app.

## Scope

The canonical SQL is:

```text
server/sql/neon-setup.sql
```

It includes:

- `playlists`
- `playlist_movies`
- `users`
- `user_sessions`
- `user_profiles`
- `tmdb_search_cache`
- `tmdb_movie_cache`
- `watch_providers`
- `title_availability`
- `provider_links`
- `provider_region`
- `provider_availability_cache`
- `recommendations`
- indexes for playlist ownership, public slugs, visibility, playlist item lookup, watched status, TMDb cache lookup, provider availability lookup, and profile handles

## Order Of Operations

1. Confirm production `DATABASE_URL` is configured in Vercel and remains server-side only.
2. Confirm production TMDb credentials use `TMDB_ACCESS_TOKEN` or `TMDB_API_KEY`.
3. Open the Neon SQL editor for the production branch.
4. Run the full contents of `server/sql/neon-setup.sql`.
5. Confirm the SQL completes without destructive drops.
6. Deploy the current app build.
7. Run the verification checks below.

## Important Migration Behavior

Existing playlist items default to:

```sql
media_type text not null default 'movie'
```

The migration adds these columns to `playlist_movies`:

```sql
media_type
runtime_minutes
season_count
episode_count
```

The old uniqueness rule on `(playlist_id, tmdb_id)` is replaced with:

```sql
(playlist_id, media_type, tmdb_id)
```

This allows a movie and TV show with the same TMDb numeric ID to coexist safely.

## Cache Migration

Search cache uses:

```sql
(media_type, normalized_query)
```

Movie detail cache uses:

```sql
(media_type, tmdb_id)
```

This prevents movie and TV lookups from overwriting each other.

## Provider Availability Migration

Where To Watch V1 uses:

```sql
watch_providers
title_availability
provider_links
provider_region
provider_availability_cache
```

Availability is region-aware from the start. The default V1 region is:

```text
CA
```

Provider data is cached by:

```sql
media_type + tmdb_id + region + provider_id + availability_type
```

This allows movies and TV shows to share TMDb numeric IDs safely while keeping provider results scoped to a region.

`provider_availability_cache` stores a short-lived record that a title and region were checked, including empty provider results, so Flim does not call the provider source repeatedly for the same unavailable title.

## Index Verification

Run:

```sql
select indexname
from pg_indexes
where tablename in (
  'playlists',
  'playlist_movies',
  'tmdb_search_cache',
  'tmdb_movie_cache',
  'watch_providers',
  'title_availability',
  'provider_links',
  'provider_region',
  'provider_availability_cache',
  'user_profiles'
)
order by tablename, indexname;
```

Expected index names include:

- `playlists_owner_user_id_idx`
- `playlists_public_slug_idx`
- `playlists_visibility_idx`
- `playlist_movies_playlist_id_idx`
- `playlist_movies_tmdb_id_idx`
- `playlist_movies_media_type_idx`
- `playlist_movies_watched_idx`
- `playlist_movies_playlist_media_tmdb_unique`
- `tmdb_search_cache_media_query_unique`
- `tmdb_search_cache_normalized_query_idx`
- `tmdb_search_cache_expires_at_idx`
- `tmdb_movie_cache_media_tmdb_unique`
- `tmdb_movie_cache_tmdb_id_idx`
- `tmdb_movie_cache_expires_at_idx`
- `watch_providers_name_unique`
- `title_availability_media_provider_region_unique`
- `title_availability_media_tmdb_region_idx`
- `title_availability_expires_at_idx`
- `provider_links_media_tmdb_region_idx`
- `provider_region_provider_region_unique`
- `provider_availability_cache_media_region_unique`
- `provider_availability_cache_expires_at_idx`
- `user_profiles_handle_unique`

## Column Verification

Run:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_name in (
  'playlist_movies',
  'tmdb_search_cache',
  'tmdb_movie_cache',
  'watch_providers',
  'title_availability',
  'provider_links',
  'provider_region',
  'provider_availability_cache'
)
order by table_name, ordinal_position;
```

Confirm:

- `users.updated_at`
- `user_profiles.province_state`
- `playlist_movies.media_type`
- `playlist_movies.runtime_minutes`
- `playlist_movies.season_count`
- `playlist_movies.episode_count`
- `tmdb_search_cache.media_type`
- `tmdb_movie_cache.media_type`
- `title_availability.media_type`
- `title_availability.region`
- `title_availability.provider_id`
- `title_availability.deep_link`
- `title_availability.search_fallback_url`
- `title_availability.cached_at`
- `provider_availability_cache.cached_at`

## App Verification

After deployment:

1. Search for a movie.
2. Search for a TV show.
3. Repeat the same TV search and confirm the response header is `X-Flim-Cache: HIT`.
4. Open a movie detail page.
5. Repeat the same movie detail request and confirm cache hit.
6. Open a TV detail page with `/api/movies/<tmdbId>?type=tv`.
7. Repeat the same TV detail request and confirm cache hit.
8. Create a playlist.
9. Add a movie.
10. Add a TV show.
11. Refresh and confirm both remain.
12. Confirm Now Playing can choose from both.
13. Open a movie detail page and confirm Where To Watch renders.
14. Open a TV detail page and confirm Where To Watch renders.
15. If `WATCHMODE_API_KEY` is not configured, confirm the page shows `Streaming availability coming soon.`
16. If `WATCHMODE_API_KEY` is configured, call `/api/providers/availability?mediaType=movie&tmdbId=601&title=E.T.%20the%20Extra-Terrestrial&region=CA` and confirm `X-Flim-Provider-Cache` returns `MISS` first, then `HIT` after a repeated request with returned links when available.

## Rollback Notes

This migration is additive except for replacing old cache and playlist uniqueness rules with media-type-aware indexes.

Do not roll back by dropping TV columns if production data has been written. If a rollback is required:

1. Deploy the previous app version.
2. Leave the added columns in place.
3. Leave `media_type` defaulting to `movie`.
4. Reassess unique indexes only if the previous app cannot write playlist items.

Keeping additive columns is safer than deleting user playlist data.
