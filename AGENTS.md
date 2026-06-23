# Flim AGENTS.md

Read this file before making product, design, architecture, or copy decisions for Flim. Also read the global Terry Foster knowledge file when available:

`C:\Users\kathr\Documents\Claude CoWork Files\Projects\Shared\Terry-Foster-Global-AGENTS.md`

## Existing Agent Notes

When working on trivia features, always read:

- `agents/trivia-specialist.md`
- `docs/trivia-system.md`

## Product Vision

Flim is the highest-priority project in Terry Foster's portfolio. It is positioned as Spotify for Movies and TV: a playlist-first entertainment discovery product where users collect, curate, resume, and share watchable movie and TV experiences.

Flim helps users answer: what should I watch next, what mood am I in, what list am I building, and what can I keep coming back to?

## Core Positioning

Flim is NOT:

- IMDb
- Rotten Tomatoes
- Letterboxd
- A social feed

The primary object is playlists. Titles, ratings, providers, trivia, games, avatars, and social features should support playlist discovery and engagement rather than replacing it.

## Target Audience

- Movie and TV fans who enjoy curating and revisiting lists.
- Users overwhelmed by streaming choice who want taste-led discovery.
- Friend groups, couples, and communities that share watchlists by mood, theme, actor, season, or occasion.
- Mobile-first users who expect fast browsing, low friction, and visually rich cards.

## Unique Value Proposition

Flim turns entertainment discovery into curated playlists with playful retention systems. Instead of dumping users into a database or review feed, Flim makes movies and TV feel collectible, browsable, and personal.

## Competitive Positioning

- Against IMDb: Flim prioritizes curation and action, not encyclopedic reference.
- Against Rotten Tomatoes: Flim prioritizes personal discovery, not critic consensus.
- Against Letterboxd: Flim prioritizes playlists and watch momentum, not review culture.
- Against streaming apps: Flim is provider-agnostic and organizes taste across services.

## Current Roadmap

- Playlist creation, editing, detail, and discovery flows.
- Continue Watching system for resuming previously engaged titles or playlists.
- Trivia system tied to films, shows, playlists, and user engagement.
- Arcade system for lightweight entertainment and retention.
- Avatar and skin system for identity, customization, and progression.
- Rewards and ticket economy to motivate actions without creating pay-to-win friction.
- Public playlist discovery with browsable, shareable curated lists.
- Watch provider integrations so users know where content is available.
- Notification architecture for reminders, playlist updates, rewards, and social actions.
- Future Plex integration for personal library and watch-state awareness.
- Social features that support playlists, not a generic feed.

## Technical Architecture

Known stack from the repository:

- Monorepo with `client`, `server`, and `shared` workspaces.
- React, TypeScript, and Vite on the client side.
- Node server workspace for backend behavior.
- Shared types and utilities should live in `shared` when they represent cross-boundary contracts.
- Web push support exists via `web-push` dependency.
- Asset tooling includes `sharp` and `opentype.js`.

Architecture guidance:

- Keep playlist data models central and stable.
- Separate title metadata from playlist membership, user progress, rewards, and social interactions.
- Treat notifications as an explicit architecture area with opt-in, permission state, scheduling, and delivery logging.
- Keep provider availability data cacheable and replaceable because watch availability changes over time.
- Avoid leaking AI implementation details into product copy.

## Design Standards

- Mobile first, touch friendly, high contrast, visually rich.
- Use media art and playlist covers as first-class product surfaces.
- Keep cards scannable and action-oriented.
- Minimize clicks from discovery to save, play/provider, trivia, or continue watching.
- Avoid corporate dashboard layouts.
- Avoid feed-first composition that makes playlists secondary.
- Make avatar, rewards, arcade, and trivia feel integrated with entertainment discovery rather than bolted on.

## Monetization Model

Likely monetization paths:

- Freemium playlists and discovery.
- Premium customization for avatars, skins, and advanced playlist features.
- Ticket economy for rewards, unlocks, arcade entries, or cosmetic progression.
- Affiliate or partner revenue from watch provider routing where appropriate.
- Future paid social or creator features for public playlist discovery.

Do not introduce monetization that blocks the core playlist value too early.

## Known Priorities

- Preserve playlist-first product strategy.
- Make the app feel fast and useful on mobile.
- Ship real flows over placeholder features.
- Ensure Continue Watching, trivia, arcade, rewards, avatars, and social loops reinforce retention.
- Keep public playlist discovery high quality and easy to browse.
- Build notification foundations thoughtfully before sending broad notifications.

## Known Issues

- Provider integrations may require current external data and should be verified when implemented.
- Notification UX must handle permissions, opt-out, and failure states.
- Arcade and reward systems can distract from the product if they become the primary experience.
- Plex integration is future-facing and should not be exposed as working until real integration exists.

## Future Expansion Opportunities

- Plex library and watch-state integration.
- Shared collaborative playlists.
- Public playlist pages for SEO and sharing.
- Creator profiles centered on playlists.
- Seasonal events, trivia challenges, and reward campaigns.
- Deeper provider routing and availability alerts.
- Personal taste graph built from playlists, saves, completions, and skips.

## Do Not Regress

- The primary object is playlists.
- Do not turn Flim into IMDb, Rotten Tomatoes, Letterboxd, or a generic social feed.
- Do not expose features that do not work.
- Do not use user-facing AI branding unless Terry explicitly asks for it.
- Keep mobile UX first, not a desktop-first adaptation.
- Preserve existing trivia specialist guidance when touching trivia.

## Architecture Decisions

Future agents should append major technical decisions here using dated bullets. Include the decision, reason, and expected user or engineering impact.

- 2026-06-16: Established playlist-first institutional memory for future Flim sessions. Playlist remains the core domain object; adjacent systems should support playlist discovery and retention.

## Session Learnings

Future agents may append important project decisions, confirmed facts, and product learnings here. Use dated bullets. Keep this section factual and concise.

- 2026-06-16: Terry identified Flim as the highest-priority project and wants future agents to treat it as Spotify for Movies and TV with playlist-first discovery.