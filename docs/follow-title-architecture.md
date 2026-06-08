# Follow Title Architecture

## Status

V1 implemented.

Current V1 scope:

- Users can follow movies and TV shows from title detail pages.
- Follow state persists and can be viewed on `My Followed Titles`.
- Notification preferences are stored for followed titles.
- Release tracking foundation is stored from the internal `media_items` catalog.
- In-app notification types are prepared for release/provider/trailer events.
- Release Intelligence V1 records change events in `notification_events`; see `release-intelligence-foundation.md`.

Still deferred:

- Push notifications.
- Email notifications.
- SMS.
- Plex auth and Plex library matching.
- TV episode progress tracking.
- Automated external polling jobs.

## Product Goal

Follow Title keeps users returning to Flim.

The user should not need to remember to check release dates, streaming availability, trailers, soundtracks, future seasons, or Plex availability.

The product concept is:

```text
I follow a title.
Flim tells me when something worth knowing happens.
```

Use the product name:

```text
Follow Title
```

Do not lead with generic labels like Notifications or Release Alerts.

## Followable Media

Users should eventually be able to follow:

- Movies.
- TV shows.
- Upcoming releases.
- Future seasons.

Examples:

- Dune Messiah.
- Stranger Things.
- Fallout.
- The Last of Us.
- The Walking Dead.

## Detail Page Entry Point

Movie detail page:

```text
[ Add To Playlist ] [ Follow ]
```

TV show detail page:

```text
[ Add To Playlist ] [ Follow ]
```

The Follow button should be secondary to playlist creation but visually easy to find.

## Follow Options

When a user follows a movie, the sheet should support:

- Theater release.
- Streaming availability.
- New trailer.
- Soundtrack release.
- Plex availability.

When a user follows a TV show, the sheet should also support:

- New season announced.
- Season release date.
- New episode available.

Defaults should be sensible and minimal. Do not overwhelm users with every possible alert turned on forever.

## Theater Alerts

Support:

- Release date announced.
- Coming in 30 days.
- Coming in 7 days.
- Releases today.

Example:

```text
Dune Messiah releases in theaters Friday.
```

## Streaming Alerts

Notify when a followed title becomes available on confirmed providers:

- Netflix.
- Prime Video.
- Disney+.
- Crave.
- Apple TV.
- Tubi.
- YouTube.
- Paramount+.
- Plex.

Rules:

- Do not scrape.
- Do not claim availability unless confirmed for the user's region.
- Prefer the existing provider cache tables and region-aware provider strategy.

Example:

```text
The Walking Dead is now available on Netflix.
```

## TV Alerts

Support:

- New season announced.
- Season premiere this week.
- New episode available.
- Future season release date changes.

Examples:

```text
Fallout Season 2 was announced.
The Last of Us Season 3 premieres next week.
```

## Delivery Phases

Phase 1:

- In-app notifications.

Phase 2:

- Push notifications.

Phase 3:

- Email.

Phase 4:

- SMS, optional and only after product/business validation.

Do not begin with SMS.

## Database Model

V1 uses these tables:

### followed_titles

Purpose: one row per user-followed movie or TV show.

Fields:

- `id`
- `user_id`
- `media_item_id`
- `media_type`
- `notification_settings`
- `created_at`
- `updated_at`

Unique key:

```text
user_id + media_item_id
```

### notification_preferences

Purpose: per-user and per-title alert preferences.

Fields:

- `id`
- `user_id`
- `followed_title_id`
- `media_item_id`
- `preferences`
- `created_at`
- `updated_at`

Example alert types:

- `theater_release`
- `streaming_availability`
- `new_trailer`
- `soundtrack_release`
- `plex_availability`
- `new_season_announced`
- `season_release_date`
- `new_episode_available`

### notification_events

Purpose: immutable records of alert-worthy events Flim detected.

Suggested fields:

- `id`
- `media_type`
- `tmdb_id`
- `event_type`
- `title`
- `body`
- `region`
- `provider_id`
- `event_date`
- `source`
- `source_payload`
- `created_at`

Implemented event types currently include:

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

### release_tracking

Purpose: cached release timeline data for followed titles.

Fields:

- `id`
- `media_item_id`
- `media_type`
- `release_date`
- `status`
- `upcoming`
- `season_data`
- `cached_at`
- `updated_at`

### streaming_availability_tracking

Purpose: snapshot provider availability changes for followed titles.

Suggested fields:

- `id`
- `media_type`
- `tmdb_id`
- `region`
- `provider_id`
- `availability_type`
- `deep_link`
- `first_seen_at`
- `last_seen_at`
- `source`
- `cached_at`

## Cache Strategy

Follow Title must use Flim's cache-first architecture:

```text
Check followed title records
Check release/provider/trailer cache
Call external source only when stale or missing
Normalize
Store
Compare changes
Create notification event
Deliver through enabled channels
```

External sources should be import sources, not repeated runtime dependencies.

Do not store copyrighted poster files locally. Store remote poster URLs and metadata only.

## My Followed Titles Page

Future page:

```text
My Followed Titles
Movies
TV Shows
Upcoming Releases
Streaming Soon
```

This page should feel like a personal watch radar, not an inbox or admin notification center.

## In-App Notification UX

In-app delivery should be the first release.

Possible surfaces:

- Header menu badge.
- Followed Titles page.
- Small notification drawer.
- Title detail page activity.

Copy should be entertainment-first:

- `Releases Today`
- `Streaming Soon`
- `New Trailer`
- `New Season`
- `In Your Plex Library`

Avoid technical copy such as cache, job, webhook, provider lookup, or API sync.

## Retention Goal

Flim evolves from:

```text
Movie playlist app
```

to:

```text
Entertainment tracking platform
```

Users return because Flim remembers the movies and shows they care about.
