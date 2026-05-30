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
