import { db, ensureSharedPlaylistSlug, getCurrentUser, sendJson } from "../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to share playlists." });

      const playlist = await sql`
        select id, public_slug, shared_slug, visibility
        from playlists
        where id = ${playlistId}
          and owner_user_id = ${user.id}
        limit 1
      `;

      if (!playlist[0]) return sendJson(response, 403, { error: "Only the playlist owner can share this playlist." });

      const sharedSlug = await ensureSharedPlaylistSlug(sql, playlistId);
      return sendJson(response, 200, {
        ok: true,
        sharedSlug,
        visibility: "shared",
      });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("playlist_share_failed", {
      playlistId,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown share error",
    });
    return sendJson(response, 500, { error: "Unable to create shared link. Please try again." });
  }
}
