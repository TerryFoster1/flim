import { db, getCurrentUser, sendJson } from "./_db.js";
import { seasonalChallengeFeed } from "./_seasonalChallenges.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    return sendJson(response, 200, await seasonalChallengeFeed(sql, user?.id));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Seasonal challenge request failed." });
  }
}
