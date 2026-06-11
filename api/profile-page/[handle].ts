import { db, ensureUserFollowsTable, ensureUserProfilesTable } from "../_db.js";
import { getBuiltIndexHtml, injectMeta } from "../_shareCards.js";

function profileHandle(request: any) {
  const value = request.query.handle;
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const indexHtml = await getBuiltIndexHtml(request);

  try {
    const handle = profileHandle(request).replace(/^@/, "").toLowerCase();
    const sql = db();
    await ensureUserProfilesTable(sql);
    await ensureUserFollowsTable(sql);

    const rows = await sql`
      select
        up.*,
        (
          select count(*)::int
          from user_follows uf
          where uf.followed_user_id = up.user_id::uuid
        ) as follower_count,
        (
          select count(*)::int
          from playlists p
          where p.owner_user_id::text = up.user_id
            and p.visibility = 'public'
        ) as playlist_count
      from user_profiles up
      where up.handle = ${handle}
      limit 1
    `;

    if (!rows[0]) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(indexHtml);
      return;
    }

    const profile = rows[0];
    const displayName = profile.display_name || `@${profile.handle}`;
    const description = profile.bio || `${displayName} curates ${profile.playlist_count || 0} public ${(profile.playlist_count || 0) === 1 ? "playlist" : "playlists"} on Flim.`;
    const url = `https://www.flim.ca/@${profile.handle}`;
    const image = `https://www.flim.ca/api/og/profile/${encodeURIComponent(profile.handle)}`;

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(injectMeta(indexHtml, {
      title: `${displayName} | Flim Curator`,
      description,
      url,
      image,
    }));
  } catch (error) {
    console.error("profile_page_meta_failed", error instanceof Error ? error.message : "Profile page meta failed.");
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
  }
}
