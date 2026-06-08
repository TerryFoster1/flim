# Release Intelligence Foundation

## Status

V1 foundation implemented.

This phase detects changes and records durable events. It does not deliver push, email, SMS, or Plex alerts.

## Purpose

Release Intelligence compares an old normalized title state with a new normalized title state:

```text
old state -> new state -> notification_events
```

The result is an event ledger that future in-app, push, email, or SMS delivery can consume without rediscovering changes.

## Data Flow

```text
media_items
release_tracking
provider availability cache
manual/scheduled normalized snapshot
compare state
notification_events
future delivery fanout
```

External APIs should be used only by scheduled import/check jobs when cached data is stale. Detail pages should not repeatedly call TMDb or provider APIs just to decide whether something changed.

## Tables

### release_tracking

Stores the latest known normalized state for a title:

- `media_item_id`
- `media_type`
- `release_date`
- `status`
- `upcoming`
- `trailer_count`
- `provider_hash`
- `season_count`
- `episode_count`
- `season_data`
- `last_checked_at`
- `change_hash`
- `cached_at`
- `updated_at`

### notification_events

Stores immutable change events:

- `media_item_id`
- `media_type`
- `tmdb_id`
- `event_type`
- `title`
- `body`
- `change_hash`
- `old_state`
- `new_state`
- `event_date`
- `source`

Events are unique by:

```text
media_item_id + event_type + change_hash
```

This prevents repeated alerts for unchanged data.

## Event Types

Current detection supports:

- `release_date_changed`
- `title_status_changed`
- `movie_released`
- `trailer_released`
- `streaming_available`
- `season_announced`
- `season_release_changed`
- `season_released`
- `episode_released`
- `season_data_changed`

## API

`POST /api/release-intelligence`

Protected by normal signed-in user session.

The user must already follow the title. This prevents arbitrary public event generation.

Request:

```json
{
  "mediaType": "movie",
  "tmdbId": 601,
  "snapshot": {
    "releaseDate": "1982-06-11",
    "status": "Released",
    "trailerCount": 2,
    "providerHash": "confirmed-provider-state"
  }
}
```

Response includes:

- `generatedCount`
- `detectedCount`
- `duplicateCount`
- `events`
- `state`

`GET /api/release-intelligence`

Returns recent generated events for titles followed by the signed-in user.

## Background Job Recommendation

Start conservative:

- Upcoming followed movies: daily.
- Released followed movies: weekly provider/trailer refresh.
- Followed TV shows with future seasons: daily while upcoming, weekly otherwise.
- Provider availability: daily per region only when provider API credentials are configured.

Avoid broad catalog polling. Prioritize titles that at least one user follows.

## Deferred

- Push delivery.
- Email delivery.
- SMS.
- Plex library matching.
- Full TV episode tracking.
- Provider API polling jobs.
- Public upcoming-release SEO pages.
