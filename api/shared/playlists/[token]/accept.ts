import { acceptPlaylistInvite, db, getCurrentUser, sendJson } from "../../../_db.js";

export default async function handler(request: any, response: any) {
  const token = String(Array.isArray(request.query.token) ? request.query.token[0] : request.query.token || "");

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to accept this playlist invite." });
      const invite = await acceptPlaylistInvite(sql, token, user.id);
      if (!invite) return sendJson(response, 404, { error: "This playlist invite is expired or no longer available." });
      return sendJson(response, 200, { ok: true, playlistId: invite.playlist_id });
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("shared_playlist_accept_failed", {
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown playlist invite accept error",
    });
    return sendJson(response, 500, { error: "Unable to accept this invite. Please try again." });
  }
}
