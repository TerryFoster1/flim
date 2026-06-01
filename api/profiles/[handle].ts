import { db, ensureUserProfilesTable, mapPublicUserProfile, normalizeHandle, sendJson, validateProfileHandle } from "../_db.js";

export default async function handler(request: any, response: any) {
  const handle = normalizeHandle(String(request.query.handle || ""));

  try {
    const sql = db();
    await ensureUserProfilesTable(sql);

    if (request.method === "GET") {
      const validationMessage = validateProfileHandle(handle);
      if (validationMessage) return sendJson(response, 404, { error: "Profile not found." });

      const rows = await sql`select * from user_profiles where handle = ${handle} limit 1`;
      if (!rows[0]) return sendJson(response, 404, { error: "Profile not found." });

      return sendJson(response, 200, mapPublicUserProfile(rows[0]));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Profile request failed." });
  }
}
