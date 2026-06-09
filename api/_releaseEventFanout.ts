import { sendPushForNotification } from "./_push.js";

const supportedReleaseNotificationTypes = new Set([
  "release_date_changed",
  "movie_released",
  "trailer_released",
  "streaming_available",
  "provider_changed",
  "season_announced",
  "season_release_changed",
  "season_released",
  "episode_released",
  "title_status_changed",
]);

function preferenceKeyForEvent(eventType: string, mediaType: "movie" | "tv") {
  if (eventType === "streaming_available" || eventType === "provider_changed") return "streamingAvailability";
  if (eventType === "trailer_released") return "trailerReleased";
  if (eventType === "season_announced") return "newSeasonAnnounced";
  if (eventType === "episode_released") return "newEpisodeAvailable";
  if (eventType === "season_release_changed" || eventType === "season_released") return "seasonReleaseDate";
  if (eventType === "release_date_changed" || eventType === "movie_released" || eventType === "title_status_changed") {
    return mediaType === "tv" ? "seasonReleaseDate" : "theaterRelease";
  }
  return "";
}

function preferencesObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function preferenceAllows(eventType: string, mediaType: "movie" | "tv", preferences: unknown) {
  const key = preferenceKeyForEvent(eventType, mediaType);
  if (!key) return false;
  const settings = preferencesObject(preferences);
  return typeof settings[key] === "boolean" ? Boolean(settings[key]) : true;
}

export function isSupportedReleaseNotificationType(eventType: string) {
  return supportedReleaseNotificationTypes.has(eventType);
}

export async function fanoutReleaseEvents(sql: any, releaseEvents: any[]) {
  let notificationCount = 0;
  let pushAttempted = 0;
  let pushSent = 0;
  let pushFailed = 0;

  for (const event of releaseEvents) {
    const eventType = String(event.event_type || "");
    const mediaType = event.media_type === "tv" ? "tv" : "movie";
    if (!isSupportedReleaseNotificationType(eventType)) continue;

    const followers = await sql`
      select
        ft.user_id,
        coalesce(np.preferences, ft.notification_settings, '{}'::jsonb) as preferences
      from followed_titles ft
      left join notification_preferences np on np.followed_title_id = ft.id
      where ft.media_item_id = ${event.media_item_id}
    `;

    for (const follower of followers) {
      if (!preferenceAllows(eventType, mediaType, follower.preferences)) continue;

      const rows = await sql`
        with existing as (
          select 1
          from release_event_notifications
          where release_event_id = ${event.id}
            and recipient_user_id = ${follower.user_id}
          limit 1
        ),
        inserted_notification as (
          insert into notifications (
            recipient_user_id,
            actor_user_id,
            type,
            entity_type,
            entity_id,
            source_release_event_id,
            title,
            message
          )
          select
            ${follower.user_id},
            null,
            ${eventType},
            'title',
            ${event.media_item_id},
            ${event.id},
            ${event.title},
            ${event.body}
          where not exists (select 1 from existing)
          on conflict (recipient_user_id, source_release_event_id) where source_release_event_id is not null do nothing
          returning id
        ),
        inserted_fanout as (
          insert into release_event_notifications (
            release_event_id,
            notification_id,
            recipient_user_id
          )
          select
            ${event.id},
            id,
            ${follower.user_id}
          from inserted_notification
          on conflict (release_event_id, recipient_user_id) do nothing
          returning id
        )
        select notification_id
        from inserted_fanout
      `;

      notificationCount += rows.length;

      for (const row of rows) {
        const pushResult = await sendPushForNotification(sql, row.notification_id).catch((error) => {
          console.error("push_delivery_failed", error instanceof Error ? error.message : "Push delivery failed.");
          return { configured: false, attempted: 0, sent: 0, failed: 0 };
        });
        pushAttempted += pushResult.attempted;
        pushSent += pushResult.sent;
        pushFailed += pushResult.failed;
      }
    }
  }

  return { notificationCount, pushAttempted, pushSent, pushFailed };
}
