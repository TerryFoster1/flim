import { db, ensureTitleRatingsTable, getCurrentUser, readBody, sendJson } from "./_db.js";

function mediaTypeFromQuery(value: unknown) {
  return value === "tv" ? "tv" : "movie";
}

function tmdbIdFromQuery(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const tmdbId = Number(raw);
  return Number.isFinite(tmdbId) && tmdbId > 0 ? Math.trunc(tmdbId) : null;
}

async function readAggregate(sql: any, mediaType: string, tmdbId: number, userId?: string) {
  const [aggregate] = await sql`
    select
      count(*)::int as rating_count,
      coalesce(avg(rating), 0)::float as average_rating,
      count(*) filter (where rating >= 1)::int as liked_count,
      count(*) filter (where rating = 3)::int as loved_count
    from title_ratings
    where media_type = ${mediaType}
      and tmdb_id = ${tmdbId}
  `;
  const [userRating] = userId
    ? await sql`
        select rating
        from title_ratings
        where user_id = ${userId}
          and media_type = ${mediaType}
          and tmdb_id = ${tmdbId}
        limit 1
      `
    : [];

  return {
    mediaType,
    tmdbId,
    userRating: Number(userRating?.rating || 0),
    ratingCount: Number(aggregate?.rating_count || 0),
    averageRating: Number(aggregate?.average_rating || 0),
    likedCount: Number(aggregate?.liked_count || 0),
    lovedCount: Number(aggregate?.loved_count || 0),
  };
}

export default async function handler(request: any, response: any) {
  try {
    const sql = db();
    await ensureTitleRatingsTable(sql);
    const mediaType = mediaTypeFromQuery(request.query.mediaType || request.query.type);
    const tmdbId = tmdbIdFromQuery(request.query.tmdbId);
    if (!tmdbId) return sendJson(response, 400, { error: "A valid title ID is required." });

    const user = await getCurrentUser(sql, request);

    if (request.method === "GET") {
      return sendJson(response, 200, await readAggregate(sql, mediaType, tmdbId, user?.id));
    }

    if (!user) return sendJson(response, 401, { error: "Sign in to rate titles." });

    if (request.method === "PUT") {
      const body = await readBody(request);
      const rating = Math.trunc(Number(body.rating));
      if (rating < 1 || rating > 3) return sendJson(response, 400, { error: "Rating must be 1, 2, or 3 stars." });

      await sql`
        insert into title_ratings (user_id, media_type, tmdb_id, rating)
        values (${user.id}, ${mediaType}, ${tmdbId}, ${rating})
        on conflict (user_id, media_type, tmdb_id)
        do update set
          rating = excluded.rating,
          updated_at = now()
      `;
      return sendJson(response, 200, await readAggregate(sql, mediaType, tmdbId, user.id));
    }

    if (request.method === "DELETE") {
      await sql`
        delete from title_ratings
        where user_id = ${user.id}
          and media_type = ${mediaType}
          and tmdb_id = ${tmdbId}
      `;
      return sendJson(response, 200, await readAggregate(sql, mediaType, tmdbId, user.id));
    }

    return sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("title_rating_failed", error instanceof Error ? error.message : "Title rating failed.");
    return sendJson(response, 500, { error: "Unable to update title rating right now." });
  }
}
