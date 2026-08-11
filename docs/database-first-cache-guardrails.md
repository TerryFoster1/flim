# Flim Database-First Cache Guardrails

Flim should treat the database-backed catalogue/cache as the shared source of truth for web, Android, and future iOS clients. Clients should call Flim APIs, not third-party providers directly, for core title, provider, trivia, or Arcade data.

## Current Provider Inventory

- TMDb title/search/person/season data is fetched server-side through `api/_tmdb.ts` and cached in database tables such as `tmdb_search_cache`, `tmdb_movie_cache`, and season/person cache tables.
- Watch provider availability is fetched server-side through `api/_providers.ts` and cached in `provider_availability_cache` plus normalized title availability tables.
- Trivia generation is server-side through `api/trivia/[...trivia].ts`; completed packs are saved and reused instead of regenerated on every request.
- Mobile currently calls Flim APIs through `flim-mobile/src/api/flimApi.ts` and does not call TMDb/OpenAI directly for the core title/trivia flows.
- The web client calls Flim API routes for TMDb title/search data through `client/src/services/tmdbService.ts`; it does not expose TMDb or OpenAI keys to the browser.
- Web watch-provider links in `client/src/services/watchProviderService.ts` are user-facing destination/search links only. Availability lookup remains server-side through `/api/providers/availability`.

## Shared Cache Policy

The canonical cache policy lives in `api/_cachePolicy.ts`.

| Data | Database TTL | Response Cache | Notes |
| --- | ---: | --- | --- |
| TMDb search | 7 days | public, short browser, shared CDN, stale revalidate | Shared across web/mobile/iOS by normalized query and media type. |
| TMDb title details | 30 days | private short browser cache | Uses stale cached detail fallback if source refresh fails. |
| TMDb person data | 30 days | public shared cache | Search/person results should hydrate the local catalogue where useful. |
| Provider availability | 3 days | public shared cache | Empty/unknown availability gets shorter edge cache but still avoids hot loops. |
| Discovery search | existing DB-backed pieces | public short shared cache | Avoids repeated identical universal-search requests across clients. |

## Cost Guardrails Implemented

- Universal discovery search now caps alternate external TMDb fanout through `limitExternalFanout("tmdb_search", ...)`.
- Movie search, discovery search, and provider availability use centralized `Cache-Control` headers.
- Provider cache TTLs use the shared policy instead of hardcoded local constants.
- Shared cache-key helper ignores platform labels (`platform`, `client`, `device`, `caller`) so future Android/iOS additions do not fragment cache entries.
- Cache event labels are standardized as `CACHE_HIT`, `CACHE_MISS`, `CACHE_STALE`, `EXTERNAL_FETCH`, `EXTERNAL_GENERATION`, and `BACKGROUND_REFRESH`; caller metadata is diagnostic only and must not change cache identity.

## Cross-Client Proof Added

`scripts/shared-cache-architecture-tests.mjs` simulates web, Android, and future iOS-style callers against one database-first cache identity. It verifies:

- Web populates a title and Android reads the same title without a second TMDb call.
- Android populates a title and web reads the same title without a second TMDb call.
- Repeated title refreshes hit the stored record while the cache is valid.
- Web creates a trivia pack and Android reads the same stored question IDs without another generation call.
- Stored reusable questions rebuild an incomplete trivia pack before any generation call.
- Ten simultaneous uncached trivia requests join one in-flight generation job.
- Android provider availability populates a region-specific record and web reads the same region without a second provider lookup.
- Provider availability cache keys include region but exclude platform/device/caller.
- Person records are shared across callers without duplicate provider calls.

## Dataset Being Cultivated

The shared cache is not just a temporary response store. It should keep growing these reusable datasets:

- Title/media catalogue records, including TMDb IDs, media type, release metadata, poster/backdrop paths, genres, and normalized display summaries.
- People records and title-person credits for actors, directors, creators, and cast/crew search.
- Provider availability records by title, media type, and region.
- Trivia packs, reusable questions, generated question records, challenge packs, and completion/score records.
- Arcade challenge metadata, artwork, rewards, badge definitions, and leaderboard summaries.

Some legacy route caches still store opaque provider payloads for compatibility. New work should prefer normalized summary tables and only keep raw payloads where they are useful for refresh/debugging.

## Required Rules For Future Work

- Do not call TMDb, OpenAI, Watchmode, or similar providers from browser/mobile clients for core app data.
- Check the local catalogue/database cache first before external provider calls.
- Save useful provider responses to database cache tables before returning them to clients.
- Do not use `SELECT *` for large list/search responses; return only fields displayed by the UI.
- Paginate or cap public lists, search results, cast lists, recommendations, leaderboards, and Arcade metadata.
- Keep forced source refreshes behind explicit server-side guardrails.
- Avoid parallel alternate provider searches unless capped by `api/_cachePolicy.ts`.

## Remaining Opportunities

- Add database observability using `pg_stat_statements` or Neon query insights to rank actual transfer-heavy queries.
- Add response-size logging in staging for high-traffic routes (`/api/discovery/search`, `/api/movies`, `/api/providers/availability`, playlist detail endpoints).
- Add stale-while-revalidate background refresh for long-lived stable title/provider data.
- Normalize Arcade metadata into a compact summary endpoint for the landing page.
- Add a shared media-summary projection for playlist/title cards so list pages do not fetch detail payloads they do not render.
- Move all forced source-refresh paths behind explicit server-side rate limits and admin/test gates.
- Add live staging evidence from Neon query insights once account access is available; current guardrails are code-level and simulated architecture tests.
