import { db, getCurrentUser, readBody, sendJson } from "./_db.js";
import {
  joinSeasonalChallenge,
  seasonalChallengeDetail,
  seasonalChallengeFeed,
  seasonalChallengeHistory,
  submitSeasonalChallengeAttempt,
} from "./_seasonalChallenges.js";

export default async function handler(request: any, response: any) {
  if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (request.method === "POST") {
      if (!user?.id) return sendJson(response, 401, { error: "Sign in to join seasonal challenges." });
      const body = await readBody(request);
      const action = String(body.action || "join");
      const eventId = typeof body.eventId === "string" ? body.eventId : "";
      if (!eventId) return sendJson(response, 400, { error: "eventId is required." });
      if (action === "submit") {
        const result = await submitSeasonalChallengeAttempt(sql, user.id, eventId, body);
        if (!result) return sendJson(response, 404, { error: "Active seasonal challenge not found." });
        return sendJson(response, 200, result);
      }
      const event = await joinSeasonalChallenge(sql, user.id, eventId);
      if (!event) return sendJson(response, 404, { error: "Seasonal challenge not found." });
      return sendJson(response, 200, { event });
    }
    const url = new URL(request.url || "/api/seasonal-challenges", "http://localhost");
    const slug = url.searchParams.get("slug");
    if (slug) {
      const detail = await seasonalChallengeDetail(sql, slug, user?.id);
      if (!detail) return sendJson(response, 404, { error: "Seasonal challenge not found." });
      return sendJson(response, 200, detail);
    }
    if (url.searchParams.get("history") === "1") {
      if (!user?.id) return sendJson(response, 401, { error: "Sign in to view challenge history." });
      return sendJson(response, 200, { history: await seasonalChallengeHistory(sql, user.id) });
    }
    return sendJson(response, 200, await seasonalChallengeFeed(sql, user?.id));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Seasonal challenge request failed." });
  }
}
