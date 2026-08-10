import { db, readBody, sendJson } from "../_db.js";
import { ensurePushTables } from "../_push.js";
import { requireRecord, requireUuid, safeApiError } from "../_security.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const body = requireRecord(await readBody(request));
    const deliveryLogId = requireUuid(body.deliveryLogId, "deliveryLogId");

    const sql = db();
    await ensurePushTables(sql);
    await sql`
      update notification_delivery_log
      set delivery_status = case when delivery_status = 'sent' then 'opened' else delivery_status end,
          opened_at = coalesce(opened_at, now()),
          updated_at = now()
      where id = ${deliveryLogId}
    `;

    return sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error("push_opened_request_failed", error instanceof Error ? error.message : "Push opened request failed.");
    return sendJson(response, 500, { error: safeApiError(error, "Unable to mark push notification opened.") });
  }
}
