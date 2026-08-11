import { db, errorStatus, getCurrentUser, readBody, sendJson } from "./_db.js";
import { cleanEnum, requireRecord, requireUuid, safeApiError } from "./_security.js";
import {
  joinSeasonalChallenge,
  seasonalChallengeDetail,
  seasonalChallengeFeed,
  seasonalChallengePublicFeed,
  seasonalChallengeHistory,
  submitSeasonalChallengeAttempt,
} from "./_seasonalChallenges.js";

export default async function handler(request: any, response: any) {
  if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const url = new URL(request.url || "/api/seasonal-challenges", "http://localhost");
    const slug = url.searchParams.get("slug");

    if (request.method === "GET" && !slug && url.searchParams.get("history") !== "1") {
      const feed = await seasonalChallengePublicFeed(sql);
      return sendJson(response, 200, feed, {
        "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600",
      });
    }

    const user = await getCurrentUser(sql, request);
    if (request.method === "POST") {
      if (!user?.id) return sendJson(response, 401, { error: "Sign in to join seasonal challenges." });
      const body = requireRecord(await readBody(request));
      const action = cleanEnum(body.action || "join", ["join", "submit"], { field: "action", fallback: "join" });
      const eventId = requireUuid(body.eventId, "eventId");
      if (action === "submit") {
        const result = await submitSeasonalChallengeAttempt(sql, user.id, eventId, body);
        if (!result) return sendJson(response, 404, { error: "Active seasonal challenge not found." });
        return sendJson(response, 200, result);
      }
      const event = await joinSeasonalChallenge(sql, user.id, eventId);
      if (!event) return sendJson(response, 404, { error: "Seasonal challenge not found." });
      return sendJson(response, 200, { event });
    }
    if (slug) {
      const detail = await seasonalChallengeDetail(sql, slug, user?.id);
      if (!detail) return sendJson(response, 404, { error: "Seasonal challenge not found." });
      return sendJson(response, 200, detail);
    }
    if (url.searchParams.get("history") === "1") {
      if (!user?.id) return sendJson(response, 401, { error: "Sign in to view challenge history." });
      return sendJson(response, 200, { history: await seasonalChallengeHistory(sql, user.id) });
    }
    const feed = await seasonalChallengeFeed(sql, user?.id);
    return sendJson(
      response,
      200,
      feed,
      user?.id ? undefined : { "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=3600" },
    );
  } catch (error) {
    const status = errorStatus(error);
    return sendJson(response, status, { error: safeApiError(error, "Seasonal challenge request failed.") });
  }
}
