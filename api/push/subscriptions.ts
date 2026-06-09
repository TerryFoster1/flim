import { db, getCurrentUser, readBody, sendJson } from "../_db.js";
import { ensurePushTables, getVapidPublicKey, isPushConfigured, normalizePushPreferences } from "../_push.js";

function subscriptionKeys(subscription: any) {
  return {
    endpoint: String(subscription?.endpoint || ""),
    p256dh: String(subscription?.keys?.p256dh || ""),
    auth: String(subscription?.keys?.auth || ""),
  };
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensurePushTables(sql);
    const user = await getCurrentUser(sql, request);

    if (!user) return sendJson(response, 401, { error: "Sign in to manage push notifications." });

    if (request.method === "GET") {
      const rows = await sql`
        select count(*)::int as count
        from push_subscriptions
        where user_id = ${user.id}
          and enabled = true
      `;
      const preferences = await sql`
        select preferences
        from push_notification_preferences
        where user_id = ${user.id}
        limit 1
      `;

      return sendJson(response, 200, {
        configured: isPushConfigured(),
        publicKey: getVapidPublicKey(),
        enabled: Number(rows[0]?.count || 0) > 0,
        subscriptionCount: Number(rows[0]?.count || 0),
        preferences: normalizePushPreferences(preferences[0]?.preferences),
      });
    }

    if (request.method === "POST") {
      if (!isPushConfigured()) {
        return sendJson(response, 503, { error: "Push notifications are not configured yet." });
      }

      const body = await readBody(request);
      const keys = subscriptionKeys(body.subscription);
      if (!keys.endpoint || !keys.p256dh || !keys.auth) {
        return sendJson(response, 400, { error: "A valid push subscription is required." });
      }

      await sql`
        insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, enabled, updated_at)
        values (
          ${user.id},
          ${keys.endpoint},
          ${keys.p256dh},
          ${keys.auth},
          ${String(body.userAgent || request.headers["user-agent"] || "").slice(0, 500)},
          true,
          now()
        )
        on conflict (endpoint)
        do update set
          user_id = excluded.user_id,
          p256dh = excluded.p256dh,
          auth = excluded.auth,
          user_agent = excluded.user_agent,
          enabled = true,
          updated_at = now()
      `;

      return sendJson(response, 200, { ok: true, enabled: true });
    }

    if (request.method === "DELETE") {
      const body = await readBody(request);
      const endpoint = String(body.endpoint || "");
      if (!endpoint) return sendJson(response, 400, { error: "Choose a subscription to disable." });

      await sql`
        update push_subscriptions
        set enabled = false,
            updated_at = now()
        where user_id = ${user.id}
          and endpoint = ${endpoint}
      `;

      return sendJson(response, 200, { ok: true, enabled: false });
    }

    if (request.method === "PATCH") {
      const body = await readBody(request);
      const preferences = normalizePushPreferences(body.preferences);
      await sql`
        insert into push_notification_preferences (user_id, preferences, updated_at)
        values (${user.id}, ${JSON.stringify(preferences)}::jsonb, now())
        on conflict (user_id)
        do update set
          preferences = excluded.preferences,
          updated_at = now()
      `;
      return sendJson(response, 200, { ok: true, preferences });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("push_subscriptions_request_failed", error instanceof Error ? error.message : "Push subscription request failed.");
    return sendJson(response, 500, { error: "Unable to update push notifications. Please try again." });
  }
}
