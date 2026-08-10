import { createPlaylistInvite, db, ensurePlaylistCollaborationTables, getCurrentUser, sendJson } from "../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();
    await ensurePlaylistCollaborationTables(sql);
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

      const nextVisibility = playlist[0].visibility === "public" ? "public" : "shared";
      if (playlist[0].visibility === "private") {
        await sql`
          update playlists
          set visibility = 'shared', updated_at = now()
          where id = ${playlistId}
            and owner_user_id = ${user.id}
        `;
      }

      const invite = await createPlaylistInvite(sql, playlistId, user.id, "editor");
      return sendJson(response, 200, {
        ok: true,
        sharedSlug: invite.token,
        visibility: nextVisibility,
        expiresAt: invite.expiresAt,
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
