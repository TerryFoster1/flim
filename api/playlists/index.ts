import { createPublicSlug, createPublicSlugBase, db, ensureUserProfilesTable, getCurrentUser, mapPlaylist, sendJson, readBody } from "../_db.js";
import { ensureDirectorSeed } from "../_director.js";

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
    await sql`alter table playlists add column if not exists owner_user_id uuid references users(id) on delete set null`;
    const user = await getCurrentUser(sql, request);

    if (request.method === "GET") {
      await ensureDirectorSeed(sql).catch((error) => {
        console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
      });

      const playlists = await sql`
        select
          p.*,
          up.handle as creator_handle,
          up.display_name as creator_display_name,
          case when ${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid then true else false end as is_owner,
          coalesce(
            json_agg(pm order by pm.added_at desc) filter (where pm.id is not null),
            '[]'
          ) as movies
        from playlists p
        left join user_profiles up on up.user_id = p.owner_user_id::text
        left join playlist_movies pm on pm.playlist_id = p.id
        where p.visibility = 'public'
          or p.owner_user_id is null
          or (${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid)
        group by p.id, up.handle, up.display_name
        order by p.updated_at desc
      `;

      return sendJson(response, 200, playlists.map((playlist: any) => mapPlaylist(playlist, playlist.movies || [])));
    }

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to create playlists." });
      const body = await readBody(request);
      const name = (body.name || "Untitled playlist").trim();
      const publicSlug = await createUniquePublicSlug(sql, name);
      const [created] = await sql`
        insert into playlists (public_slug, name, description, visibility, owner_user_id)
        values (${publicSlug}, ${name}, ${body.description || ""}, ${body.visibility || "private"}, ${user.id})
        returning *
      `;

      return sendJson(response, 201, mapPlaylist({ ...created, is_owner: true }));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Playlist request failed." });
  }
}
