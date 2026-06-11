import { db, ensureFollowTitleTables } from "../../_db.js";
import { ensureMediaCatalogTables, getCatalogMediaItem, mapCatalogDetails } from "../../_mediaCatalog.js";
import { getBuiltIndexHtml, injectMeta } from "../../_shareCards.js";

function mediaTypeFromRequest(request: any) {
  const value = Array.isArray(request.query.mediaType) ? request.query.mediaType[0] : request.query.mediaType;
  return value === "tv" ? "tv" : "movie";
}

function tmdbIdFromRequest(request: any) {
  const value = Array.isArray(request.query.tmdbId) ? request.query.tmdbId[0] : request.query.tmdbId;
  return Number(value);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const indexHtml = await getBuiltIndexHtml(request);
  const mediaType = mediaTypeFromRequest(request);
  const tmdbId = tmdbIdFromRequest(request);

  if (!Number.isFinite(tmdbId)) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
    return;
  }

  try {
    const sql = db();
    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    const catalogItem = await getCatalogMediaItem(sql, tmdbId, mediaType);
    const details = catalogItem ? mapCatalogDetails(catalogItem) : null;
    const title = details?.title || (mediaType === "tv" ? "TV Show" : "Movie");
    const url = `https://www.flim.ca/games/title/${mediaType}/${tmdbId}`;
    const image = `https://www.flim.ca/api/og/title/${mediaType}/${tmdbId}?card=game`;

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(injectMeta(indexHtml, {
      title: `${title} Trivia & Games | Flim`,
      description: `Play trivia and title challenges for ${title} on Flim.`,
      url,
      image,
    }));
  } catch (error) {
    console.error("games_title_page_meta_failed", error instanceof Error ? error.message : "Games title page meta failed.");
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
  }
}
