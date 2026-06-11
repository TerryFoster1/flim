import { evaluateAchievements, getAchievementSummary, readAchievementState } from "../_achievements.js";
import { db, getCurrentUser, sendJson } from "../_db.js";

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (!user) return sendJson(response, 401, { error: "Sign in to view achievements." });

    if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

    const unlockedAchievements = await evaluateAchievements(sql, user.id);
    const achievementState = await readAchievementState(sql, user.id);
    const summary = await getAchievementSummary(sql, user.id);

    return sendJson(response, 200, {
      summary,
      achievements: achievementState.achievements,
      unlockedAchievements,
    });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Achievement request failed." });
  }
}
