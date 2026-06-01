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
- `recommendations`
- indexes for playlist ownership, public slugs, visibility, playlist item lookup, watched status, TMDb cache lookup, and profile handles

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
- `user_profiles_handle_unique`

## Column Verification

Run:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_name in ('playlist_movies', 'tmdb_search_cache', 'tmdb_movie_cache')
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

## Rollback Notes

This migration is additive except for replacing old cache and playlist uniqueness rules with media-type-aware indexes.

Do not roll back by dropping TV columns if production data has been written. If a rollback is required:

1. Deploy the previous app version.
2. Leave the added columns in place.
3. Leave `media_type` defaulting to `movie`.
4. Reassess unique indexes only if the previous app cannot write playlist items.

Keeping additive columns is safer than deleting user playlist data.
