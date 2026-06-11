# Ticket Affiliates, TV Release Alerts, and Native Playlist Ads

This is an architecture-only foundation. It does not show ads, create ticket links, inject affiliate codes, or add push/email/SMS behavior.

## Release Alert Gap Audit

### Movie Theater Release Alerts

Status: partially implemented.

Implemented:

- `followed_titles` stores followed movies and TV shows.
- `notification_preferences` supports movie theater-release preferences.
- `release_tracking` stores release date, status, upcoming state, and change hashes.
- `release_events` supports `release_date_changed`, `movie_released`, and `title_status_changed`.
- `release_event_notifications` and notification fanout create in-app notifications for followers.
- `/api/cron/release-check` runs scheduled checks for followed titles.

Gaps:

- Theater-release source quality depends on imported TMDb/catalog release data.
- No ticket availability source exists yet.
- No city/theater-aware availability exists yet.

### Advance Ticket Availability

Status: not implemented; blocked by missing data source and partner links.

Prepared architecture:

- `ticket_providers`
- `title_ticket_availability`
- `ticket_affiliate_links`
- `ticket_clicks`

Rules:

- Do not show ticket CTAs until a real provider confirms availability.
- Do not create fake Fandango, Atom, Cineplex, Landmark, or local theater links.
- Future ticket clicks should route through Flim so affiliate IDs and analytics remain server-controlled.

### Streaming Release Alerts

Status: partially implemented.

Implemented:

- Where To Watch caches confirmed availability in `title_availability`.
- `release_tracking.provider_hash` stores the normalized provider state hash.
- Release Intelligence emits `streaming_available` and `provider_changed`.
- Notification fanout maps those events to `streamingAvailability` preferences.

Gaps:

- Provider refresh depends on configured provider API credentials and cache freshness.
- No provider-specific release-date prediction exists.

### TV Season Release Alerts

Status: partially implemented.

Implemented:

- TV titles can be followed.
- `release_tracking` stores `season_count`, `episode_count`, and `season_data`.
- Release Intelligence emits `season_announced`, `season_release_changed`, `season_released`, and `season_data_changed`.
- Notification fanout respects TV season preferences.

Prepared architecture:

- `season_release_tracking`

Gaps:

- Season-level release tracking is not yet wired to a scheduled season-detail importer.
- Season release state is currently snapshot/count based.

### TV Episode Release Alerts

Status: partially implemented.

Implemented:

- TV episode catalog/progress tables exist for watch tracking.
- Release Intelligence emits `episode_released` when episode counts increase.
- Notification fanout maps `episode_released` to `newEpisodeAvailable`.

Prepared architecture:

- `episode_release_tracking`

Gaps:

- Episode-level release checks are not yet wired to a scheduled episode importer.
- Next episode dates require season-detail refreshes from a trusted source.

## Ticket Affiliate Foundation

Future flow:

```text
media_items
release_tracking
title_ticket_availability
ticket_affiliate_links
Flim ticket redirect service
ticket_clicks
provider destination
```

Tables:

- `ticket_providers`: provider metadata and region status.
- `title_ticket_availability`: per-title availability by region, city, and theater.
- `ticket_affiliate_links`: future affiliate destinations, inactive by default.
- `ticket_clicks`: click analytics.

Supported future providers:

- Fandango
- Atom Tickets
- Cineplex
- Landmark Cinemas
- Local theater providers

No providers are active by default.

## TV Season and Episode Alert Foundation

Future flow:

```text
tv_season_catalog / tv_episode_catalog
season_release_tracking / episode_release_tracking
release_events
notification fanout
in-app notifications
future push/email/SMS
```

The new tracking tables support:

- season announced
- season release date changed
- season released
- episode released
- episode count changed
- next episode date

The current release intelligence engine remains the event generator. Future work should feed it more precise season/episode snapshots instead of building a second alert system.

## Native Playlist Ad Architecture

Native ads should be poster-style, clearly labeled, sparse, and relevant.

Feature flag:

```text
ENABLE_NATIVE_ADS=false
```

Ads must not appear unless the flag is enabled and placement code is intentionally added later.

Tables:

- `ad_campaigns`
- `ad_creatives`
- `ad_targeting_rules`
- `ad_placements`
- `ad_impressions`
- `ad_clicks`

Prepared placement types:

- `playlist_card`
- `public_playlist_card`
- `director_cut_card`
- `upcoming_release_card`
- `where_to_watch_card`
- `notification_sponsor`

Rules:

- Always label ads as `Sponsored`.
- Do not show ads too frequently.
- Do not blend ads so deeply that users mistake them for playlist titles.
- Do not launch ad UI without review.

## Analytics Foundation

Prepared analytics events:

- provider affiliate click via `provider_clicks`
- ticket affiliate click via `ticket_clicks`
- native ad impression via `ad_impressions`
- native ad click via `ad_clicks`

No dashboard is implemented yet.

## Remaining Blockers

- Real ticket availability provider or partner API.
- Affiliate agreements and allowed link formats.
- City/theater preference model.
- Season/episode importer scheduling.
- Ad creative review and placement policy.
- Admin tools for campaign management.
- Legal/privacy review for ad analytics.
