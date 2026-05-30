# Supabase Demo Setup

Flim now uses Supabase as the playlist source of truth. This is demo-stage shared data with no auth or user ownership yet.

## Environment Variables

Add these locally in `client/.env.local` and in Vercel:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Movie search still requires one TMDb credential:

```bash
VITE_TMDB_ACCESS_TOKEN=
```

## SQL Setup

Run `docs/supabase-demo-setup.sql` in the Supabase SQL editor.

The SQL creates:

- `playlists`
- `playlist_movies`

It also enables RLS with permissive anonymous demo policies. Replace those policies with user-owned `auth.uid()` policies when authentication is added.
