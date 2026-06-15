import webpush from "web-push";
import { ensureNotificationsTable, ensurePgCrypto } from "./_db.js";

type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const defaultPushPreferences = {
  movies: true,
  tvShows: true,
  streamingAvailability: true,
  trailers: true,
  releaseDates: true,
  releaseDelays: true,
  socialFollowers: true,
  playlistFollowers: true,
  playlistLikesSaves: true,
  weeklyChallenges: true,
  seasonalChallenges: true,
  triviaScoreBeaten: true,
  rewardUnlocked: true,
  accountUpdates: true,
};

let configured = false;

export function isPushConfigured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY?.trim() && process.env.VAPID_PRIVATE_KEY?.trim());
}

export function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || "";
}

function configureWebPush() {
  if (configured || !isPushConfigured()) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT?.trim() || "mailto:hello@flim.ca",
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  configured = true;
}

export async function ensurePushTables(sql: any) {
  await ensureNotificationsTable(sql);
  await ensurePgCrypto(sql);
  await sql`
    create table if not exists push_subscriptions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      endpoint text not null,
      p256dh text not null,
      auth text not null,
      user_agent text,
      enabled boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      last_success_at timestamptz,
      last_failure_at timestamptz
    )
  `;
  await sql`alter table push_subscriptions add column if not exists enabled boolean not null default true`;
  await sql`alter table push_subscriptions add column if not exists last_success_at timestamptz`;
  await sql`alter table push_subscriptions add column if not exists last_failure_at timestamptz`;
  await sql`create unique index if not exists push_subscriptions_endpoint_unique on push_subscriptions (endpoint)`;
  await sql`create index if not exists push_subscriptions_user_enabled_idx on push_subscriptions (user_id, enabled)`;

  await sql`
    create table if not exists push_notification_preferences (
      user_id uuid primary key references users(id) on delete cascade,
      preferences jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists notification_delivery_log (
      id uuid primary key default gen_random_uuid(),
      notification_id uuid not null references notifications(id) on delete cascade,
      release_event_id uuid,
      recipient_user_id uuid not null references users(id) on delete cascade,
      push_subscription_id uuid references push_subscriptions(id) on delete set null,
      delivery_channel text not null default 'web_push',
      delivery_status text not null default 'pending',
      error_message text,
      sent_at timestamptz,
      opened_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;
  await sql`alter table notification_delivery_log add column if not exists release_event_id uuid`;
  await sql`alter table notification_delivery_log add column if not exists delivery_channel text not null default 'web_push'`;
  await sql`alter table notification_delivery_log add column if not exists delivery_status text not null default 'pending'`;
  await sql`alter table notification_delivery_log add column if not exists opened_at timestamptz`;
  await sql`
    create unique index if not exists notification_delivery_push_unique
    on notification_delivery_log (notification_id, push_subscription_id, delivery_channel)
    where push_subscription_id is not null
  `;
  await sql`create index if not exists notification_delivery_recipient_idx on notification_delivery_log (recipient_user_id, created_at desc)`;
  await sql`create index if not exists notification_delivery_status_idx on notification_delivery_log (delivery_status, created_at desc)`;
}

export function normalizePushPreferences(value: unknown) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...defaultPushPreferences,
    movies: typeof source.movies === "boolean" ? source.movies : defaultPushPreferences.movies,
    tvShows: typeof source.tvShows === "boolean" ? source.tvShows : defaultPushPreferences.tvShows,
    streamingAvailability: typeof source.streamingAvailability === "boolean" ? source.streamingAvailability : defaultPushPreferences.streamingAvailability,
    trailers: typeof source.trailers === "boolean" ? source.trailers : defaultPushPreferences.trailers,
    releaseDates: typeof source.releaseDates === "boolean" ? source.releaseDates : defaultPushPreferences.releaseDates,
    releaseDelays: typeof source.releaseDelays === "boolean" ? source.releaseDelays : defaultPushPreferences.releaseDelays,
    socialFollowers: typeof source.socialFollowers === "boolean" ? source.socialFollowers : defaultPushPreferences.socialFollowers,
    playlistFollowers: typeof source.playlistFollowers === "boolean" ? source.playlistFollowers : defaultPushPreferences.playlistFollowers,
    playlistLikesSaves: typeof source.playlistLikesSaves === "boolean" ? source.playlistLikesSaves : defaultPushPreferences.playlistLikesSaves,
    weeklyChallenges: typeof source.weeklyChallenges === "boolean" ? source.weeklyChallenges : defaultPushPreferences.weeklyChallenges,
    seasonalChallenges: typeof source.seasonalChallenges === "boolean" ? source.seasonalChallenges : defaultPushPreferences.seasonalChallenges,
    triviaScoreBeaten: typeof source.triviaScoreBeaten === "boolean" ? source.triviaScoreBeaten : defaultPushPreferences.triviaScoreBeaten,
    rewardUnlocked: typeof source.rewardUnlocked === "boolean" ? source.rewardUnlocked : defaultPushPreferences.rewardUnlocked,
    accountUpdates: typeof source.accountUpdates === "boolean" ? source.accountUpdates : defaultPushPreferences.accountUpdates,
  };
}

function pushPreferencesAllow(notification: any) {
  const preferences = normalizePushPreferences(notification.push_preferences);
  if (notification.media_type === "tv" && !preferences.tvShows) return false;
  if (notification.media_type !== "tv" && !preferences.movies) return false;
  if ((notification.type === "streaming_available" || notification.type === "provider_changed") && !preferences.streamingAvailability) return false;
  if (notification.type === "trailer_released" && !preferences.trailers) return false;
  if ((notification.type === "release_date_changed" || notification.type === "season_release_changed") && !preferences.releaseDelays) return false;
  if (
    (
      notification.type === "movie_released" ||
      notification.type === "season_released" ||
      notification.type === "title_status_changed"
    ) &&
    !preferences.releaseDates
  ) {
    return false;
  }
  return true;
}

function notificationPath(row: any) {
  if (row.entity_type === "title" && row.tmdb_id) {
    return `/${row.media_type === "tv" ? "tv" : "movies"}/${row.tmdb_id}`;
  }
  if (row.entity_type === "playlist" && row.public_slug) return `/p/${row.public_slug}`;
  if (row.entity_type === "playlist" && row.entity_id) return `/playlists/${row.entity_id}`;
  return "/upcoming";
}

function publicUrl(path: string) {
  return new URL(path, process.env.PUBLIC_APP_URL?.trim() || "https://www.flim.ca").toString();
}

function pushPayload(notification: any, deliveryLogId: string) {
  return JSON.stringify({
    title: notification.title || "Flim",
    body: notification.message || "You have a new Flim alert.",
    url: publicUrl(notificationPath(notification)),
    notificationId: notification.id,
    deliveryLogId,
  });
}

export async function sendPushForNotification(sql: any, notificationId: string) {
  await ensurePushTables(sql);
  if (!isPushConfigured()) {
    return { configured: false, attempted: 0, sent: 0, failed: 0 };
  }

  configureWebPush();

  const notifications = await sql`
    select
      n.*,
      mi.media_type,
      mi.tmdb_id,
      p.public_slug,
      pnp.preferences as push_preferences
    from notifications n
    left join media_items mi on mi.id = n.entity_id and n.entity_type = 'title'
    left join playlists p on p.id = n.entity_id and n.entity_type = 'playlist'
    left join push_notification_preferences pnp on pnp.user_id = n.recipient_user_id
    where n.id = ${notificationId}
    limit 1
  `;
  const notification = notifications[0];
  if (!notification) return { configured: true, attempted: 0, sent: 0, failed: 0 };
  if (!pushPreferencesAllow(notification)) return { configured: true, attempted: 0, sent: 0, failed: 0 };

  const subscriptions = await sql`
    select id, user_id, endpoint, p256dh, auth
    from push_subscriptions
    where user_id = ${notification.recipient_user_id}
      and enabled = true
  ` as PushSubscriptionRow[];

  let attempted = 0;
  let sent = 0;
  let failed = 0;

  for (const subscription of subscriptions) {
    const logs = await sql`
      insert into notification_delivery_log (
        notification_id,
        release_event_id,
        recipient_user_id,
        push_subscription_id,
        delivery_channel,
        delivery_status
      )
      values (
        ${notification.id},
        ${notification.source_release_event_id || null},
        ${notification.recipient_user_id},
        ${subscription.id},
        'web_push',
        'pending'
      )
      on conflict (notification_id, push_subscription_id, delivery_channel)
      where push_subscription_id is not null
      do nothing
      returning id
    `;

    const deliveryLogId = logs[0]?.id;
    if (!deliveryLogId) continue;

    attempted += 1;
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        },
        pushPayload(notification, deliveryLogId),
        { TTL: 60 * 60 * 24 },
      );

      sent += 1;
      await sql`
        update notification_delivery_log
        set delivery_status = 'sent',
            sent_at = now(),
            updated_at = now()
        where id = ${deliveryLogId}
      `;
      await sql`
        update push_subscriptions
        set last_success_at = now(),
            updated_at = now()
        where id = ${subscription.id}
      `;
    } catch (error: any) {
      failed += 1;
      const statusCode = Number(error?.statusCode || 0);
      const errorMessage = error instanceof Error ? error.message : "Push delivery failed.";
      await sql`
        update notification_delivery_log
        set delivery_status = 'failed',
            error_message = ${errorMessage.slice(0, 500)},
            updated_at = now()
        where id = ${deliveryLogId}
      `;
      await sql`
        update push_subscriptions
        set enabled = case when ${statusCode} in (404, 410) then false else enabled end,
            last_failure_at = now(),
            updated_at = now()
        where id = ${subscription.id}
      `;
    }
  }

  return { configured: true, attempted, sent, failed };
}
