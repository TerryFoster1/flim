# YouTube Integration Strategy

## Goal

Support trailers and related video discovery from movie and TV detail pages.

## Planned Content Types

- Official Trailer.
- Teaser Trailer.
- Behind The Scenes.
- Interviews.
- Featurettes.
- Season Trailers.
- Series Trailers.

## Planned User Experience

Movie page card:

- Watch Trailer.
- Trailer thumbnail.
- Open In YouTube.

Fallback state:

- Open YouTube search.

## Search Behavior

Preferred:

- Open the official trailer directly.

Fallback:

- Open YouTube search.

Search query examples:

- `{Movie Title} official trailer`
- `{TV Show Title} official trailer series`
- `{TV Show Title} season {seasonNumber} trailer`

## Data Model Placeholders

- `MediaVideoLink`.
- `VideoContentType`.

## Future API Strategy

Potential future endpoints:

- `GET /api/media/:mediaType/:id/videos`
- `GET /api/media/:mediaType/:id/trailers`
- `POST /api/media/:mediaType/:id/videos/:videoId/confirm`

## Boundaries

- Do not scrape YouTube.
- Do not hardcode API keys.
- Do not claim an official trailer unless confirmed.
- Use search fallback links until direct video lookup is implemented.
