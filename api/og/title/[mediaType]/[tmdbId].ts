import { db, ensureFollowTitleTables } from "../../../_db.js";
import { ensureMediaCatalogTables, getCatalogMediaItem, mapCatalogDetails } from "../../../_mediaCatalog.js";
import { fallbackShareCard, sendShareCard, type ShareCardKind } from "../../../_shareCards.js";

function mediaTypeFromRequest(request: any) {
  const value = Array.isArray(request.query.mediaType) ? request.query.mediaType[0] : request.query.mediaType;
  return value === "tv" ? "tv" : "movie";
}

function tmdbIdFromRequest(request: any) {
  const value = Array.isArray(request.query.tmdbId) ? request.query.tmdbId[0] : request.query.tmdbId;
  return Number(value);
}

function cardKindFromRequest(request: any): ShareCardKind {
  const value = Array.isArray(request.query.card) ? request.query.card[0] : request.query.card;
  if (value === "trailer" || value === "countdown" || value === "game") return value;
  return "title";
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function countdownBadge(value?: string, mediaType: "movie" | "tv" = "movie") {
  if (!value) return mediaType === "tv" ? "Season Date TBA" : "Release Date TBA";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return mediaType === "tv" ? "Season Date TBA" : "Release Date TBA";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "Available Now";
  if (days === 0) return mediaType === "tv" ? "Premieres Today" : "Releases Today";
  if (days === 1) return mediaType === "tv" ? "Premieres Tomorrow" : "Releases Tomorrow";
  return mediaType === "tv" ? `${days} Days Until Premiere` : `${days} Days Until Release`;
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const mediaType = mediaTypeFromRequest(request);
  const tmdbId = tmdbIdFromRequest(request);
  const card = cardKindFromRequest(request);

  if (!Number.isFinite(tmdbId)) return sendShareCard(response, fallbackShareCard(card));

  try {
    const sql = db();
    await ensureMediaCatalogTables(sql);
    await ensureFollowTitleTables(sql);
    const catalogItem = await getCatalogMediaItem(sql, tmdbId, mediaType);
    const details = catalogItem ? mapCatalogDetails(catalogItem) : null;

    const trackingRows = catalogItem ? await sql`
      select release_date, status, season_count, episode_count
      from release_tracking
      where media_item_id = ${catalogItem.id}
      limit 1
    ` : [];
    const releaseDate = trackingRows[0]?.release_date || catalogItem?.release_date;
    const releaseText = formatDate(releaseDate);
    const title = details?.title || (mediaType === "tv" ? "TV Show" : "Movie");

    const data = {
      kind: card,
      title,
      subtitle: card === "trailer"
        ? "Official Trailer"
        : card === "game"
          ? "Trivia & Games"
          : card === "title"
            ? "Watch, Track & Discover"
            : releaseText || (mediaType === "tv" ? "TV Release" : "Movie Release"),
      eyebrow: card === "trailer"
        ? "Watch Trailer"
        : card === "game"
          ? "Movie Challenge"
          : mediaType === "tv" ? "Tracked TV Release" : "Tracked Movie Release",
      description: card === "game"
        ? "Play title trivia and challenges on Flim."
        : card === "trailer"
          ? "Watch the trailer and track this title on Flim."
          : details?.overview || "Track this release on Flim.",
      cta: card === "game" ? "Play on Flim" : card === "trailer" ? "Watch Trailer" : "Open on Flim",
      urlLabel: card === "game" ? `flim.ca/games/title/${mediaType}/${tmdbId}` : `flim.ca/${mediaType === "tv" ? "tv" : "movies"}/${tmdbId}`,
      posterUrl: details?.posterUrl || catalogItem?.poster_url,
      backdropUrl: catalogItem?.backdrop_url,
      badge: card === "countdown" || card === "title" ? countdownBadge(releaseDate, mediaType) : undefined,
      statLine: card === "countdown" || card === "title"
        ? releaseText || "Release date coming soon"
        : card === "game"
          ? "No high score yet"
          : releaseText || "Official trailer",
    };

    return sendShareCard(response, data);
  } catch (error) {
    console.error("title_og_failed", error instanceof Error ? error.message : "Title OG failed.");
    return sendShareCard(response, fallbackShareCard(card));
  }
}
