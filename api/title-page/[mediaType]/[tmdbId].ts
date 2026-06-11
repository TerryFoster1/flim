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

function shareVariant(request: any) {
  const url = new URL(request.url || "/", "https://www.flim.ca");
  const value = url.searchParams.get("share");
  if (value === "trailer" || value === "countdown" || value === "game") return value;
  return "title";
}

function titlePath(mediaType: "movie" | "tv", tmdbId: number, variant: string) {
  const base = mediaType === "tv" ? `/tv/${tmdbId}` : `/movies/${tmdbId}`;
  return variant === "title" ? base : `${base}?share=${encodeURIComponent(variant)}`;
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
  const variant = shareVariant(request);

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
    const labels: Record<string, string> = {
      title: `${title} | Flim`,
      trailer: `${title} Official Trailer | Flim`,
      countdown: `${title} Release Countdown | Flim`,
      game: `${title} Trivia & Games | Flim`,
    };
    const descriptions: Record<string, string> = {
      title: details?.overview || `Open ${title} on Flim.`,
      trailer: `Watch the trailer for ${title} and track it on Flim.`,
      countdown: `Track the release countdown for ${title} on Flim.`,
      game: `Play trivia and title challenges for ${title} on Flim.`,
    };
    const url = `https://www.flim.ca${titlePath(mediaType, tmdbId, variant)}`;
    const image = `https://www.flim.ca/api/og/title/${mediaType}/${tmdbId}?card=${encodeURIComponent(variant)}`;

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(injectMeta(indexHtml, {
      title: labels[variant],
      description: descriptions[variant],
      url,
      image,
    }));
  } catch (error) {
    console.error("title_page_meta_failed", error instanceof Error ? error.message : "Title page meta failed.");
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
  }
}
