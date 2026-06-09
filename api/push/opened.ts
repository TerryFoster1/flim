import { db, readBody, sendJson } from "../_db.js";
import { ensurePushTables } from "../_push.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const body = await readBody(request);
    const deliveryLogId = String(body.deliveryLogId || "");
    if (!/^[0-9a-fA-F-]{36}$/.test(deliveryLogId)) {
      return sendJson(response, 400, { error: "A valid delivery record is required." });
    }

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
    return sendJson(response, 500, { error: "Unable to mark push notification opened." });
  }
}
