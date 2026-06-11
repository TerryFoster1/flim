# Trivia, Games, and Challenges Architecture

This document defines the safe foundation for future trivia, game, and movie challenge work in Flim.

## Product Scope

Trivia and challenge experiences belong in two places:

- Title detail pages, where a title-specific card can live near the current trivia and extras area.
- The Trivia & Games hub at `/games`, where users can discover future challenges.

These experiences must not appear on the homepage unless a later product decision explicitly changes that rule.

## Feature Flag

Trivia and games are disabled by default:

- `ENABLE_TRIVIA_GAMES=false` protects future server/API behavior.
- `VITE_ENABLE_TRIVIA_GAMES=false` hides client navigation by default.

The `/games` route is safe to load manually and presents a coming-soon hub. It does not publish fake or active challenges.

## Challenge Types

The generic `challenges` model supports future:

- Title trivia
- Playlist trivia
- Genre challenges
- Director's Cut challenges
- Seasonal challenges
- Community challenges
- Sponsored challenges

## Target Types

Challenge targets are constrained to:

- `media_item`
- `playlist`
- `genre`
- `director_collection`
- `global`

## Promotion Placements

Challenge promotion placements are constrained to:

- `title_detail_card`
- `games_hub_hero`
- `playlist_detail_card`
- `director_cut_card`

Homepage placement is intentionally absent.

## Tables

- `challenges`: public challenge definition and scheduling metadata.
- `challenge_targets`: links challenges to titles, playlists, genres, editorial collections, or global contexts.
- `challenge_questions`: trivia/question content with difficulty, spoiler level, source URLs, and moderation status.
- `challenge_attempts`: user or session attempts, completion counts, score, and status.
- `challenge_leaderboards`: future ranking rows by challenge and time window.
- `challenge_promotions`: controlled placement records for future surfacing.

## Launch Blockers

Before visible launch:

- Turn on the feature flag deliberately.
- Add admin or editorial tooling for publishing.
- Add moderation/reporting workflows for questions.
- Add anti-abuse rules for attempts and leaderboards.
- Add real challenge content; do not publish placeholder challenges as if they are live.
