import { db, ensurePlaylistMediaColumns, ensurePlaylistSharingColumns, mapPlaylistMovie, readBody, sendJson } from "../../../_db.js";
import { upsertMediaItem } from "../../../_mediaCatalog.js";

export default async function handler(request: any, response: any) {
  const token = String(Array.isArray(request.query.token) ? request.query.token[0] : request.query.token || "");

  try {
    const sql = db();
    await ensurePlaylistMediaColumns(sql);
    await ensurePlaylistSharingColumns(sql);

    if (request.method === "POST") {
      const playlists = await sql`
        select id
        from playlists
        where shared_slug = ${token}
          and visibility = 'shared'
        limit 1
      `;

      if (!playlists[0]) return sendJson(response, 404, { error: "Shared playlist not found." });

      const body = await readBody(request);
      const mediaType = body.mediaType === "tv" ? "tv" : "movie";
      const tmdbId = Number(body.tmdbId);
      const title = String(body.title || "").trim();

      if (!Number.isFinite(tmdbId) || tmdbId <= 0 || !title) {
        return sendJson(response, 400, { error: "Choose a valid movie or TV show before adding it." });
      }

      const mediaItem = await upsertMediaItem(sql, { ...body, mediaType, tmdbId, title });
      const [movie] = await sql`
        insert into playlist_movies (playlist_id, media_item_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, watched)
        values (${playlists[0].id}, ${mediaItem?.id || null}, ${mediaType}, ${tmdbId}, ${title}, ${body.releaseYear || body.firstAirYear || null}, ${body.posterUrl || null}, ${body.overview || null}, ${body.runtimeMinutes || null}, ${body.seasonCount || null}, ${body.episodeCount || null}, false)
        on conflict (playlist_id, media_type, tmdb_id)
        do update set
          media_item_id = coalesce(excluded.media_item_id, playlist_movies.media_item_id),
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
    console.error("shared_playlist_movie_save_failed", {
      token,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown shared playlist movie error",
    });
    return sendJson(response, 500, { error: "Unable to add title. Please try again." });
  }
}
