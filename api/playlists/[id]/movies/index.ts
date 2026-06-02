import { db, ensurePlaylistMediaColumns, getCurrentUser, mapPlaylistMovie, readBody, sendJson } from "../../../_db.js";

export default async function handler(request: any, response: any) {
  const playlistId = request.query.id as string;

  try {
    const sql = db();
    await ensurePlaylistMediaColumns(sql);
    const user = await getCurrentUser(sql, request);

    if (request.method === "GET") {
      const movies = await sql`
        select pm.*
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        where pm.playlist_id = ${playlistId}
          and (
            p.visibility = 'public'
            or (${user?.id || null}::uuid is not null and p.owner_user_id = ${user?.id || null}::uuid)
          )
        order by added_at desc
      `;

      return sendJson(response, 200, movies.map(mapPlaylistMovie));
    }

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to add movies." });
      const ownsPlaylist = await sql`select id from playlists where id = ${playlistId} and owner_user_id = ${user.id} limit 1`;
      if (!ownsPlaylist[0]) return sendJson(response, 403, { error: "Only the playlist owner can add movies." });
      const body = await readBody(request);
      const mediaType = body.mediaType === "tv" ? "tv" : "movie";
      const tmdbId = Number(body.tmdbId);
      const title = String(body.title || "").trim();

      if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !title) {
        return sendJson(response, 400, { error: "Choose a valid movie or TV show before adding it." });
      }

      const [movie] = await sql`
        insert into playlist_movies (playlist_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, watched)
        values (${playlistId}, ${mediaType}, ${tmdbId}, ${title}, ${body.releaseYear || body.firstAirYear || null}, ${body.posterUrl || null}, ${body.overview || null}, ${body.runtimeMinutes || null}, ${body.seasonCount || null}, ${body.episodeCount || null}, false)
        on conflict (playlist_id, media_type, tmdb_id)
        do update set
          title = excluded.title,
          year = excluded.year,
          poster_url = excluded.poster_url,
          overview = excluded.overview,
          runtime_minutes = excluded.runtime_minutes,
          season_count = excluded.season_count,
          episode_count = excluded.episode_count
        returning *
      `;

      return sendJson(response, 201, mapPlaylistMovie(movie));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("playlist_movie_save_failed", {
      playlistId,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown playlist movie error",
    });
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Playlist movie request failed." });
  }
}
