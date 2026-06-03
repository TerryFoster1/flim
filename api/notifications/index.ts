import { db, ensureNotificationsTable, ensureUserProfilesTable, getCurrentUser, readBody, sendJson } from "../_db.js";

function mapNotification(row: any) {
  const actorName = row.actor_display_name || row.actor_handle || row.actor_email_name || "Someone";

  return {
    id: row.id,
    recipientUserId: row.recipient_user_id,
    actorUserId: row.actor_user_id || undefined,
    actorDisplayName: actorName,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id || undefined,
    entityPath: row.entity_type === "playlist" && row.entity_id ? `/playlists/${row.entity_id}` : undefined,
    title: row.title,
    message: row.message,
    readAt: row.read_at || undefined,
    createdAt: row.created_at,
  };
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensureNotificationsTable(sql);
    const user = await getCurrentUser(sql, request);

    if (!user) return sendJson(response, 401, { error: "Sign in to view notifications." });

    if (request.method === "GET") {
      const notifications = await sql`
        select
          n.*,
          nullif(actor_profile.display_name, '') as actor_display_name,
          nullif(actor_profile.handle, '') as actor_handle,
          nullif(initcap(trim(regexp_replace(split_part(actor.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '') as actor_email_name
        from notifications n
        left join user_profiles actor_profile on actor_profile.user_id = n.actor_user_id::text
        left join users actor on actor.id = n.actor_user_id
        where n.recipient_user_id = ${user.id}
        order by n.created_at desc
        limit 30
      `;
      const unread = await sql`
        select count(*)::int as count
        from notifications
        where recipient_user_id = ${user.id}
          and read_at is null
      `;

      return sendJson(response, 200, {
        unreadCount: Number(unread[0]?.count || 0),
        notifications: notifications.map(mapNotification),
      });
    }

    if (request.method === "PATCH") {
      const body = await readBody(request);

      if (body.markAllRead) {
        await sql`
          update notifications
          set read_at = coalesce(read_at, now())
          where recipient_user_id = ${user.id}
            and read_at is null
        `;
      } else {
        const notificationId = String(body.notificationId || "");
        if (!notificationId) return sendJson(response, 400, { error: "Choose a notification to update." });

        await sql`
          update notifications
          set read_at = coalesce(read_at, now())
          where id = ${notificationId}
            and recipient_user_id = ${user.id}
        `;
      }

      const unread = await sql`
        select count(*)::int as count
        from notifications
        where recipient_user_id = ${user.id}
          and read_at is null
      `;

      return sendJson(response, 200, { ok: true, unreadCount: Number(unread[0]?.count || 0) });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("notifications_request_failed", error instanceof Error ? error.message : "Notification request failed.");
    return sendJson(response, 500, { error: "Unable to load notifications. Please try again." });
  }
}
