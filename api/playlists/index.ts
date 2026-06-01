import { createPublicSlug, createPublicSlugBase, db, demoUserId, ensureUserProfilesTable, mapPlaylist, sendJson, readBody } from "../_db.js";

async function createUniquePublicSlug(sql: any, name: string) {
  const base = createPublicSlugBase(name);
  const candidates = [base, ...Array.from({ length: 5 }, () => createPublicSlug(name))];

  for (const candidate of candidates) {
    const existing = await sql`select id from playlists where public_slug = ${candidate} limit 1`;
    if (!existing[0]) return candidate;
  }

  return createPublicSlug(name);
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureUserProfilesTable(sql);

    if (request.method === "GET") {
      const playlists = await sql`
        select
          p.*,
          up.handle as creator_handle,
          up.display_name as creator_display_name,
          coalesce(
            json_agg(pm order by pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join user_profiles up on up.user_id = ${demoUserId}
        left join playlist_movies pm on pm.playlist_id = p.id
        group by p.id, up.handle, up.display_name
        order by p.updated_at desc
      `;

      return sendJson(response, 200, playlists.map((playlist: any) => mapPlaylist(playlist, playlist.movies || [])));
    }

    if (request.method === "POST") {
      const body = await readBody(request);
      const name = (body.name || "Untitled playlist").trim();
      const publicSlug = await createUniquePublicSlug(sql, name);
      const [created] = await sql`
        insert into playlists (public_slug, name, description, visibility)
        values (${publicSlug}, ${name}, ${body.description || ""}, ${body.visibility || "private"})
        returning *
      `;

      return sendJson(response, 201, mapPlaylist(created));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Playlist request failed." });
  }
}
