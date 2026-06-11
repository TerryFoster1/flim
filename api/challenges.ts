import { db, getCurrentUser, sendJson } from "./_db.js";
import { challengeFeed } from "./_challenges.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    return sendJson(response, 200, await challengeFeed(sql, user?.id));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Challenge request failed." });
  }
}
