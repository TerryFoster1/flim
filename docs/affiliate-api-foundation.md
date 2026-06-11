# Affiliate Infrastructure and API Foundation

This document captures the architecture for future affiliate revenue and future public APIs. Nothing here launches public APIs, developer accounts, billing, or affiliate codes.

## Provider Link Layer

Where To Watch provider buttons should route through Flim first:

```text
Provider logo
-> /api/provider-link/:providerId/:tmdbId
-> provider destination
```

The redirect layer can later append affiliate IDs, track click analytics, change destinations, run provider ranking experiments, and enforce provider-specific rules without changing client UI code.

Current behavior:

- The client receives confirmed provider availability from `/api/providers/availability`.
- Provider buttons use `/api/provider-link/:providerId/:tmdbId` with `mediaType`, `region`, `linkType`, and `title` query parameters.
- The provider-link route resolves the cached `provider_links` destination.
- If no cached destination exists, the route uses a conservative search fallback for known providers.
- The route records a `provider_clicks` row, then redirects.
- No affiliate IDs are injected yet.

## Tables

- `provider_clicks`: click analytics for provider outbound redirects.
- `provider_partner_links`: future partner/affiliate destination overrides.
- `affiliate_mappings`: future provider-specific affiliate parameters or mapping rules.

All tables are idempotently added in `server/sql/neon-setup.sql`. Runtime provider table setup also creates them when provider availability routes initialize.

## API Versioning

Current `/api` routes are internal app routes.

Future public API routes should use `/api/v1` and have explicit contracts, permission models, rate limits, and public identifiers.

## Public Identifiers

Future public API payloads should use stable public IDs instead of raw internal IDs:

- `playlist_<slug-or-token>`
- `user_<public-handle-or-token>`
- `title_<mediaType>_<tmdbId>`
- `release_event_<uuid>`
- `provider_availability_<uuid>`

## Permission Model

Future public APIs should reuse Flim's existing access concepts:

- Private resources are owner-only.
- Shared resources are link-scoped and limited to documented shared actions.
- Public resources are readable by everyone, but owner-managed.
- Followers and viewers get read/subscription behavior, not mutation rights.

## Not Implemented Yet

- Affiliate partnerships
- Affiliate code injection
- Public API keys
- Developer portal
- API billing
- Public data export products
