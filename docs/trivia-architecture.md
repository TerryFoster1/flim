# Trivia Architecture

## Goal

Prepare Flim to support richer movie and TV exploration after the user decides what to watch.

## Planned Content

- Trivia.
- Fun facts.
- Awards.
- Behind-the-scenes notes.
- Production information.
- Interviews.
- Featurettes.

## Detail Page Placement

Trivia appears inside Media Extensions after Watch Providers.

## Data Model Placeholders

- `TriviaEntry`.

Trivia categories:

- `trivia`.
- `fun_fact`.
- `award`.
- `behind_the_scenes`.
- `production`.

## Future API Strategy

Potential future endpoints:

- `GET /api/media/:mediaType/:id/trivia`
- `GET /api/media/:mediaType/:id/awards`
- `GET /api/media/:mediaType/:id/production-notes`

## Boundaries

- Do not copy copyrighted long-form content.
- Do not scrape websites.
- Keep source attribution available once external trivia sources are introduced.
- Keep trivia optional so the movie page remains useful even without enrichment.
