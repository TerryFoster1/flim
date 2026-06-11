# Trivia, Games, and Challenges Architecture

This document defines the safe foundation for future trivia, game, and movie challenge work in Flim.

## Product Scope

Trivia and challenge experiences belong in two places:

- Title detail pages, where a title-specific card can live near the current trivia and extras area.
- The Trivia & Games hub at `/games`, where users can discover future challenges.
- Title-specific game pages at `/games/title/:mediaType/:tmdbId`, launched from title details.

These experiences must not appear on the homepage unless a later product decision explicitly changes that rule.

## Feature Flag

Trivia and games are disabled by default:

- `ENABLE_TRIVIA_GAMES=false` protects future server/API behavior.
- `VITE_ENABLE_TRIVIA_GAMES=false` hides client navigation by default.

The `/games` route is safe to load manually and presents a coming-soon hub. It does not publish fake or active challenges.

The `/games/title/:mediaType/:tmdbId` route loads the title metadata and presents a dedicated mini-app surface for that title. When the flag is off, it shows a title-aware coming-soon state. When the flag is on, it can show available game cards and recommendations without adding anything to the homepage.

## Challenge Types

The generic `challenges` model supports future:

- Title trivia
- Playlist trivia
- Genre challenges
- Director's Cut challenges
- Seasonal challenges
- Community challenges
- Sponsored challenges

## Title Game Types

The title games page is prepared for:

- Classic Trivia
- Poster Guess
- Quote Challenge
- Scene Challenge
- Timeline Challenge
- Character Match
- Soundtrack Challenge
- Speed Round

## Target Types

Challenge targets are constrained to:

- `media_item`
- `playlist`
- `genre`
- `director_collection`
- `global`
- `franchise`

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
- `games`: reusable game definitions such as Classic Trivia, Poster Guess, or Speed Round.
- `game_instances`: target-specific game instances for a media item, playlist, genre, franchise, director collection, or global context.
- `game_attempts`: user or session attempts with score and completion metadata.
- `game_scores`: public high-score rows. High scores are always public.
- `game_badges`: badge metadata for future profile display.

## High Scores

High scores are always public and should only be shown from real `game_scores` records. If no score exists, the UI should say `No high score yet` or `Be the first to set a high score`.

## Profile Integration Prep

Profiles may later show:

- Badges earned
- Games played
- High scores
- Challenge wins
- Favorite game categories

High scores are public. Other game activity can become user-controlled later.

## Launch Blockers

Before visible launch:

- Turn on the feature flag deliberately.
- Add admin or editorial tooling for publishing.
- Add moderation/reporting workflows for questions.
- Add anti-abuse rules for attempts and leaderboards.
- Add real challenge content; do not publish placeholder challenges as if they are live.
