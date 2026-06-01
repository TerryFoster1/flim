# Neon Setup

Flim uses Neon PostgreSQL as the permanent playlist source of truth.

## Environment

`DATABASE_URL` must be configured only on the server/Vercel side.

Do not add `DATABASE_URL` to `client/.env.local`.
Do not create a `VITE_DATABASE_URL`.

## SQL Setup

Run this SQL against the Neon database configured by `DATABASE_URL`:

```text
server/sql/neon-setup.sql
```

It creates:

- `playlists`
- `playlist_movies`
- `tmdb_search_cache`
- `tmdb_movie_cache`

`playlists.public_slug` is the unique public identifier used for share URLs such as:

```text
https://www.flim.ca/p/example-playlist-slug
```

This is demo-stage shared data. Any playlist with a `public_slug` can be opened by direct link. Auth, user ownership, visibility enforcement, and authorization checks should be added later.

## API Surface

The browser calls server endpoints only:

- `GET /api/playlists`
- `POST /api/playlists`
- `GET /api/playlists/:id`
- `DELETE /api/playlists/:id`
- `GET /api/playlists/:id/movies`
- `POST /api/playlists/:id/movies`
- `DELETE /api/playlists/:id/movies/:movieId`
- `PATCH /api/playlists/:id/movies/:movieId/watched`
- `GET /api/public/playlists/:slug`
- `GET /api/public/playlists/:slug/movies`
- `GET /api/movies/search?q=movie-title`
- `GET /api/movies/:tmdbId`

## TMDb Cache Proxy

TMDb credentials should be configured only on the server/Vercel side:

- `TMDB_ACCESS_TOKEN` preferred
- `TMDB_API_KEY` fallback

Do not use `VITE_TMDB_ACCESS_TOKEN`, `VITE_TMDB_API_KEY`, or any `VITE_DATABASE_URL` for production movie search.

`GET /api/movies/search` normalizes queries by trimming and lowercasing them, returns an unexpired cache hit when available, and stores a fresh TMDb response for 7 days on a miss.

`GET /api/movies/:tmdbId` returns an unexpired movie-detail cache hit when available and stores a fresh TMDb response for 30 days on a miss.
