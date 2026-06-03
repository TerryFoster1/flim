# Where To Watch V1

Where To Watch must only show providers when Flim has confirmed availability for the title and region. Provider APIs are import sources, not dependencies for every detail-page view.

## Recommended Provider Source

V1 recommendation: Watchmode.

Why:

- It has a practical title-sources API shape for movie and TV provider availability.
- It supports region-scoped lookups, including Canada.
- It can be used behind a server-only `WATCHMODE_API_KEY`.
- It is simpler to integrate for an early product than a partner-only JustWatch relationship.

Alternatives:

- JustWatch Partner API: likely the strongest catalog and provider-brand source, but access is commercial/partner-gated and should be pursued once Flim is ready for partnership conversations.
- Streaming Availability API: practical as a fallback option if pricing or coverage is better for Flim, but it should feed the same cache tables and normalization layer.

Do not scrape provider websites.

## Cache Flow

```text
media_items
title_availability / provider_availability_cache
External provider API
Normalize
Store
Reuse
```

The browser calls only:

```text
GET /api/providers/availability?mediaType=movie|tv&tmdbId=&title=&region=CA
```

The endpoint:

1. Resolves the title from `media_items` by `media_type + tmdb_id`.
2. Checks `title_availability` by `media_type + tmdb_id + region`.
3. Returns unexpired cached provider links when present.
4. Checks `provider_availability_cache` so empty confirmed checks are not repeated.
5. Calls Watchmode only when `WATCHMODE_API_KEY` exists, no fresh cache exists, and Flim has a title to query.
6. Normalizes provider IDs, names, region, access type, deep links, and search fallbacks.
7. Stores rows for future reuse and updates `media_items.provider_last_checked`.

Default V1 region: `CA`.

## Schema

- `watch_providers`: canonical provider IDs, names, logos, icon keys, and source.
- `title_availability`: confirmed title availability by media type, TMDb ID, region, provider, and access type.
- `provider_availability`: compatibility view over `title_availability`.
- `provider_links`: provider deep links or search fallbacks for a title and region.
- `provider_region`: provider region support.
- `provider_availability_cache`: cache marker for completed provider checks, including empty results.

## UI Rules

If confirmed availability exists:

- Show `Available On`.
- Render provider logo buttons.
- Open exact provider title links when present.
- Fall back to provider search URLs only for confirmed provider rows without exact links.

If availability is unknown or no provider source is configured:

- Show `Streaming availability coming soon.`
- Do not show provider logos as if the title is available.
- Do not show developer language.

## Plex

Plex is prepared as a provider with provider ID `plex` and `library` access type.

Future confirmed states:

- `In Your Library`
- `Watch On Plex`
- `Connect Plex`

Do not implement Plex auth or claim Plex availability until a connected library confirms the title.
