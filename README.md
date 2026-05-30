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

The client is now a local React/Vite visual shell. It is still placeholder-only and does not connect to any APIs, databases, authentication, payments, notifications, analytics, movie catalogs, streaming providers, or external services.

Run locally from the client folder:

```bash
cd client
npm install
npm run dev
```

Then open the local URL printed by Vite.

The React shell uses hash-style local navigation and centralized placeholder UI data in `client/src/data/placeholders.ts`.
