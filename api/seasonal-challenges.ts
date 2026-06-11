import { db, getCurrentUser, readBody, sendJson } from "./_db.js";
import { joinSeasonalChallenge, seasonalChallengeFeed } from "./_seasonalChallenges.js";

export default async function handler(request: any, response: any) {
  if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (request.method === "POST") {
      if (!user?.id) return sendJson(response, 401, { error: "Sign in to join seasonal challenges." });
      const body = await readBody(request);
      const eventId = typeof body.eventId === "string" ? body.eventId : "";
      if (!eventId) return sendJson(response, 400, { error: "eventId is required." });
      const event = await joinSeasonalChallenge(sql, user.id, eventId);
      if (!event) return sendJson(response, 404, { error: "Seasonal challenge not found." });
      return sendJson(response, 200, { event });
    }
    return sendJson(response, 200, await seasonalChallengeFeed(sql, user?.id));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Seasonal challenge request failed." });
  }
}
