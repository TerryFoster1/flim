import { db, ensurePlaylistCollaborationTables, getCurrentUser, getPlaylistPermission, mapPlaylistMovie, readBody, sendJson } from "../../../_db.js";
import { upsertMediaItem } from "../../../_mediaCatalog.js";
import { cleanEnum, cleanInteger, cleanText, cleanUrl, requireRecord, requireUuid, safeApiError } from "../../../_security.js";

async function ensurePlaylistMovieSchema(sql: any) {
  await sql`alter table playlist_movies add column if not exists media_type text not null default 'movie'`;
  await sql`alter table playlist_movies add column if not exists runtime_minutes integer`;
  await sql`alter table playlist_movies add column if not exists season_count integer`;
  await sql`alter table playlist_movies add column if not exists episode_count integer`;
  await sql`alter table playlist_movies add column if not exists sort_order integer`;
  await sql`
    do $$
    declare
      legacy_constraint record;
      legacy_index record;
    begin
      for legacy_constraint in
        select distinct c.conname
        from pg_constraint c
        left join pg_class i on i.oid = c.conindid
        where c.conrelid = 'playlist_movies'::regclass
          and (
            c.conname = 'playlist_movies_playlist_id_tmdb_id_key'
            or i.relname = 'playlist_movies_playlist_id_tmdb_id_key'
          )
      loop
        execute format('alter table playlist_movies drop constraint %I', legacy_constraint.conname);
      end loop;

      for legacy_index in
        select i.oid::regclass::text as index_name
        from pg_class i
        where i.relname = 'playlist_movies_playlist_id_tmdb_id_key'
          and i.relkind = 'i'
          and not exists (
            select 1
            from pg_constraint c
            where c.conindid = i.oid
          )
      loop
        execute format('drop index if exists %s', legacy_index.index_name);
      end loop;
    end $$;
  `;
  await sql`create unique index if not exists playlist_movies_playlist_media_tmdb_unique on playlist_movies (playlist_id, media_type, tmdb_id)`;
  await sql`create index if not exists playlist_movies_media_type_idx on playlist_movies (media_type)`;
  await sql`create index if not exists playlist_movies_watched_idx on playlist_movies (watched)`;
  await sql`create index if not exists playlist_movies_sort_order_idx on playlist_movies (playlist_id, sort_order)`;
}

export default async function handler(request: any, response: any) {
  let playlistId = "";

  try {
    playlistId = requireUuid(request.query.id, "playlistId");
    const sql = db();
    await ensurePlaylistMovieSchema(sql);
    await ensurePlaylistCollaborationTables(sql);
    const user = await getCurrentUser(sql, request);
    const permission = await getPlaylistPermission(sql, playlistId, user?.id);

    if (request.method === "GET") {
      if (!permission?.canRead) return sendJson(response, 404, { error: "Playlist not found." });
      const movies = await sql`
        select pm.*
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        where pm.playlist_id = ${playlistId}
        order by coalesce(pm.sort_order, 2147483647), pm.added_at desc
      `;

      return sendJson(response, 200, movies.map(mapPlaylistMovie));
    }

    if (request.method === "POST") {
      if (!user) return sendJson(response, 401, { error: "Sign in to add movies." });
      if (!permission?.canEditContent) return sendJson(response, 403, { error: "You do not have permission to add titles to this playlist." });
      const body = requireRecord(await readBody(request));
      const mediaType = cleanEnum(body.mediaType, ["movie", "tv"], { field: "Media type", fallback: "movie" });
      const tmdbId = cleanInteger(body.tmdbId, { field: "TMDb ID", min: 1, max: 2147483647, required: true });
      const title = cleanText(body.title, { field: "Title", max: 240, required: true });
      const releaseYear = cleanInteger(body.releaseYear || body.firstAirYear, { field: "Release year", min: 1870, max: 2200, fallback: null });
      const posterUrl = cleanUrl(body.posterUrl, { field: "Poster URL", max: 2048 }) || null;
      const backdropUrl = cleanUrl(body.backdropUrl, { field: "Backdrop URL", max: 2048 }) || null;
      const overview = cleanText(body.overview || "", { field: "Overview", max: 1200, allowNewlines: true }) || null;
      const runtimeMinutes = cleanInteger(body.runtimeMinutes, { field: "Runtime", min: 0, max: 10000, fallback: null });
      const seasonCount = cleanInteger(body.seasonCount, { field: "Season count", min: 0, max: 500, fallback: null });
      const episodeCount = cleanInteger(body.episodeCount, { field: "Episode count", min: 0, max: 5000, fallback: null });

      const mediaItem = await upsertMediaItem(sql, {
        mediaType,
        tmdbId,
        title,
        originalTitle: cleanText(body.originalTitle || "", { field: "Original title", max: 240 }) || undefined,
        overview: overview || undefined,
        releaseYear: releaseYear ? String(releaseYear) : undefined,
        firstAirYear: releaseYear ? String(releaseYear) : undefined,
        posterUrl: posterUrl || undefined,
        backdropUrl: backdropUrl || undefined,
        runtimeMinutes: runtimeMinutes || undefined,
        seasonCount: seasonCount || undefined,
        episodeCount: episodeCount || undefined,
      });
      const [movie] = await sql`
        insert into playlist_movies (playlist_id, media_item_id, media_type, tmdb_id, title, year, poster_url, overview, runtime_minutes, season_count, episode_count, watched)
        values (${playlistId}, ${mediaItem?.id || null}, ${mediaType}, ${tmdbId}, ${title}, ${releaseYear || null}, ${posterUrl}, ${overview}, ${runtimeMinutes}, ${seasonCount}, ${episodeCount}, false)
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
    console.error("playlist_movie_save_failed", {
      playlistId,
      method: request.method,
      message: error instanceof Error ? error.message : "Unknown playlist movie error",
    });
    return sendJson(response, (error as any)?.statusCode || 500, { error: safeApiError(error, "Unable to add movie. Please try again.") });
  }
}
