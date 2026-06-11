import { db, getCurrentUser, sendJson } from "./_db.js";
import { progressHubFeed } from "./_progressHub.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (!user?.id) return sendJson(response, 401, { error: "Sign in to view your progress." });
    return sendJson(response, 200, await progressHubFeed(sql, user.id));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Progress request failed." });
  }
}
