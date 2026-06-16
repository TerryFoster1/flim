# Flim Trivia System

Flim trivia is cache-first. When a user opens trivia for a title, the API checks stored trivia before asking OpenAI to generate anything.

## Runtime Flow

1. The frontend calls `/api/trivia` with `tmdbId`, `mediaType`, and optional metadata.
2. The API normalizes the request and checks cached `title_trivia` rows for the current prompt version.
3. If enough cached questions exist, the API returns them immediately.
4. If the cache is missing and `forceRefresh` is not false, the API loads title metadata, builds the prompt from `src/prompts/triviaPrompt.ts`, and calls OpenAI.
5. The response must be strict JSON.
6. The server validates, deduplicates, and quality-filters the questions.
7. The accepted pack is saved to `trivia_sets`, `trivia_questions`, and mirrored into `title_trivia` for the existing playable UI.
8. Future requests reuse the saved rows instead of regenerating.

## Runtime Prompt

The prompt builder lives at:

- `src/prompts/triviaPrompt.ts`

Agent-level writing guidance lives at:

- `agents/trivia-specialist.md`

## Tables

Existing playable cache:

- `title_trivia`
- `trivia_generation_jobs`
- `user_trivia_progress`

Normalized generation cache:

- `trivia_sets`
- `trivia_questions`

`trivia_sets` is unique by:

- `tmdb_id`
- `media_type`
- `spoiler_mode`
- `question_count`
- `prompt_version`

`trivia_questions` stores the generated question text, choices, correct answer, difficulty, category, explanation, spoiler flag, and source metadata.

## Cache Behavior

The normal path never regenerates if a ready pack exists for the same title/settings/prompt version. The API only generates when the cache is missing or when `forceRefresh=true` is supplied by an internal/admin path.

## Force Refresh

`forceRefresh=true` bypasses the cache check for generation, but it is not exposed in the public UI. Use it only for admin regeneration or repair workflows. Existing approved rows are not deleted automatically; a new prompt version is preferred for broad quality upgrades.

## Quality Tuning

The server rejects malformed packs, duplicate questions, wrong choice counts, missing explanations, impossible correct answers, and packs with too many metadata-style questions. To adjust standards later, update:

- `src/prompts/triviaPrompt.ts`
- the validation helpers in `api/trivia/[...trivia].ts`

## Individual Trivia vs Challenge Trivia

Individual title trivia targets 25 playable questions and is used on title games pages.

Challenge trivia should request larger packs, typically 50-100 questions, and should keep a stable question order for fair competition.

