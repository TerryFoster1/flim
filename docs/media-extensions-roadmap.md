# Media Extensions Roadmap

## Vision

Flim should become the place users go after deciding what to watch.

The movie or TV show detail page becomes a hub for related entertainment:

- Watch the movie or show.
- Listen to the soundtrack.
- Watch the trailer.
- Explore trivia and facts.
- Open the best available streaming destination.
- Launch Plex when available.

## Product Principle

Flim is the entertainment decision layer.

Flim sits above Netflix, Disney+, Prime Video, Crave, Plex, Spotify, YouTube, Apple Music, and future providers. It helps users decide what to watch, then opens the best destination.

## Movie Page Placement

Media Extensions should appear below:

1. Poster.
2. Description.
3. Genres.
4. Watch Providers.
5. Media Extensions.

## Phase 1: Foundation

Implemented as placeholders and search fallbacks:

- `MediaExtensions` UI section.
- Spotify soundtrack search fallback.
- YouTube trailer search fallback.
- Trivia and facts placeholder.
- Add To Roulette placeholder action.
- Type contracts for soundtracks, albums, artists, videos, and trivia.

No Spotify API, YouTube API, trivia API, database table, or backend integration is implemented in this phase.

## Phase 2: Integrations

Planned:

- Spotify soundtrack lookup.
- Spotify direct album links.
- YouTube official trailer lookup.
- Trailer thumbnails.
- Provider-verified metadata storage.

## Phase 3: Rich Movie Hub

Planned:

- Trivia and fun facts.
- Awards.
- Behind-the-scenes content.
- Production information.
- Interviews.
- Featurettes.
- TV show theme songs.
- Series and season trailers.

## UX Standard

Media extension cards should feel:

- Collectible.
- Visual.
- Movie-themed.
- Mobile-friendly.
- Icon-led.

Avoid boring text links.

## Success Criteria

Users can eventually choose a movie, watch it, listen to its soundtrack, watch its trailer, and explore related content without leaving Flim until they intentionally launch another service.
