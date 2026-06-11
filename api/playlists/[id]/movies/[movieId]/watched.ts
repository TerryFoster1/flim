import { db, getCurrentUser, readBody, sendJson } from "../../../../_db.js";
import { evaluateAchievements } from "../../../../_achievements.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;
  const movieId = Number(request.query.movieId);
  const mediaType = request.query.type === "tv" ? "tv" : "movie";

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);

    if (request.method === "PATCH") {
      if (!user) return sendJson(response, 401, { error: "Sign in to update watched status." });
      const body = await readBody(request);
      const watched = body.watchStatus ? body.watchStatus === "watched" : Boolean(body.watched);

      await sql`
        update playlist_movies pm
        set watched = ${watched}
        from playlists p
        where p.id = pm.playlist_id
          and pm.playlist_id = ${playlistId}
          and pm.tmdb_id = ${movieId}
          and pm.media_type = ${mediaType}
          and p.owner_user_id = ${user.id}
      `;

      const unlockedAchievements = await evaluateAchievements(sql, user.id);
      return sendJson(response, 200, { ok: true, unlockedAchievements });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Watched status request failed." });
  }
}
