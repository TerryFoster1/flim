# Flim

Flim is a movie playlist platform: Spotify playlists for movies.

It is not a review platform, streaming platform, IMDb clone, or Letterboxd clone. The product foundation is poster-first playlist creation, sharing, saving, cloning, streaming-link planning, and movie roulette.

This repository is intentionally scaffold-only. It defines architecture, route plans, shared interfaces, schema placeholders, UI component placeholders, and documentation without implementing authentication, payments, notifications, streaming integrations, movie database integrations, recommendation engines, AI features, social feeds, backend services, database connections, external APIs, email systems, mock data, or business logic.

## Intended Structure

- `client/` - React, TypeScript, and Vite frontend scaffold.
- `server/` - Node and Express API scaffold.
- `shared/` - Shared TypeScript interfaces, API contracts, and schema placeholders.
- `docs/` - Product, API, database, roadmap, roulette, streaming, sharing, and social planning.
- `scripts/` - Placeholder automation and developer workflow scripts.

## Canonical Domain

The canonical public domain planned for Flim is `https://flim.ca`.

Deployment is not configured yet. DNS, hosting, redirects, production builds, and provider integrations remain future work. Placeholder deployment notes live in `docs/deployment-notes.md`.

## Phase 1A Scope

- Reposition Flim around movie playlists, poster browsing, social sharing, streaming-link planning, and roulette.
- Add placeholder routes and components only.
- Add planning entities for providers, genres, playlist followers, collaborators, recommendations, and roulette history.
- Keep everything inert until an implementation phase is explicitly opened.

## Phase 1C Local React Shell

The client is now a local React/Vite app shell. Phase 2A adds TMDb-powered movie search and movie details plus browser `localStorage` playlists. It still does not include authentication, payments, notifications, analytics, hosted databases, social feeds, comments, AI recommendations, scraping, or streaming-provider deep links.

Run locally from the client folder:

```bash
cd client
npm install
npm run dev
```

Then open the local URL printed by Vite.

## Environment

Create `client/.env.local` for local TMDb search:

```bash
VITE_TMDB_API_KEY=
```

Do not commit real API keys.

If the key is missing, the app still loads and shows a helpful search message instead of crashing.

## Local Storage MVP

Phase 2A stores user-created playlists, saved movies, and watched status in browser `localStorage`.

Future backend replacement points:

- `client/src/services/tmdbService.ts`
- `client/src/services/localPlaylistStore.ts`

Streaming provider availability and deep links remain planned for Phase 2B.
