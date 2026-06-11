import { db, ensureFollowTitleTables, getCurrentUser, sendJson } from "./_db.js";
import { ensureTvProgressTables } from "./_tvProgress.js";

function mapContinueWatching(row: any) {
  const seasonNumber = row.current_season_number || row.next_season_number || undefined;
  const episodeNumber = row.current_episode_number || row.next_episode_number || undefined;
  return {
    mediaType: "tv",
    tmdbId: Number(row.tmdb_show_id),
    title: row.title,
    posterUrl: row.poster_url || undefined,
    backdropUrl: row.backdrop_url || undefined,
    seasonNumber,
    episodeNumber,
    episodeTitle: row.episode_title || undefined,
    progressPercent: Number(row.progress_percent || 0),
    lastWatchedAt: row.last_watched_at || row.updated_at,
    actionPath: `/tv/${row.tmdb_show_id}${seasonNumber && episodeNumber ? `?s=${seasonNumber}&e=${episodeNumber}` : ""}`,
    source: "progress",
  };
}

function mapFollowedShow(row: any) {
  return {
    mediaType: "tv",
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    posterUrl: row.poster_url || undefined,
    backdropUrl: row.backdrop_url || undefined,
    progressPercent: 0,
    lastWatchedAt: row.updated_at || row.created_at,
    actionPath: `/tv/${row.tmdb_id}`,
    source: "followed",
  };
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureTvProgressTables(sql);
    const user = await getCurrentUser(sql, request);
    if (!user) return sendJson(response, 401, { error: "Sign in to view Continue Watching." });
    const includeFollowed = String(request.query?.includeFollowed || "") === "true";

    const rows = await sql`
      select
        sp.*,
        mi.title,
        mi.poster_url,
        mi.backdrop_url,
        ep.title as episode_title,
        ep.season_number as next_season_number,
        ep.episode_number as next_episode_number
      from user_show_progress sp
      inner join media_items mi on mi.id = sp.media_item_id
      left join tv_episode_catalog ep
        on ep.tmdb_show_id = sp.tmdb_show_id
        and ep.season_number = sp.current_season_number
        and ep.episode_number = sp.current_episode_number
      where sp.user_id = ${user.id}
        and sp.status = 'watching'
      order by sp.last_watched_at desc nulls last, sp.updated_at desc
      limit 6
    `;

    if (rows.length > 0 || !includeFollowed) {
      return sendJson(response, 200, { items: rows.map(mapContinueWatching) });
    }

    await ensureFollowTitleTables(sql);
    const followedRows = await sql`
      select
        ft.created_at,
        ft.updated_at,
        mi.media_type,
        mi.tmdb_id,
        mi.title,
        mi.poster_url,
        mi.backdrop_url
      from followed_titles ft
      inner join media_items mi on mi.id = ft.media_item_id
      where ft.user_id = ${user.id}
        and ft.media_type = 'tv'
      order by ft.updated_at desc, ft.created_at desc
      limit 6
    `;

    return sendJson(response, 200, { items: followedRows.map(mapFollowedShow) });
  } catch (error) {
    console.error("continue_watching_failed", error instanceof Error ? error.message : "Continue Watching request failed.");
    return sendJson(response, 500, { error: "Unable to load Continue Watching. Please try again." });
  }
}
