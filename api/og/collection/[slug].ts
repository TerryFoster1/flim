import { db } from "../../_db.js";
import { fallbackShareCard, sendShareCard, type ShareCardData } from "../../_shareCards.js";

function slugFromRequest(request: any) {
  const value = Array.isArray(request.query.slug) ? request.query.slug[0] : request.query.slug;
  return String(value || "").trim();
}

function collectionCardData(collection: any, items: any[], slug: string): ShareCardData {
  const titleCount = items.length;
  return {
    kind: "collection",
    title: collection.title || "Flim Collection",
    subtitle: collection.category || "Collection",
    description: collection.overview || "Explore this collection on Flim.",
    cta: "Open Collection",
    urlLabel: `flim.ca/collection/${slug}`,
    posterUrl: collection.poster_url || undefined,
    backdropUrl: collection.backdrop_url || undefined,
    posters: items.slice(0, 4).map((item) => ({ url: item.poster_url || undefined, label: item.title })),
    statLine: `${titleCount} ${titleCount === 1 ? "Title" : "Titles"} | Flim Collection`,
  };
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const slug = slugFromRequest(request);
  if (!slug) return sendShareCard(response, fallbackShareCard("collection"));

  try {
    const sql = db();
    const rows = await sql`
      select *
      from media_collections
      where slug = ${slug}
      limit 1
    `;
    if (!rows[0]) return sendShareCard(response, fallbackShareCard("collection"));

    const items = await sql`
      select title, poster_url
      from media_collection_items
      where collection_id = ${rows[0].id}
      order by coalesce(sort_order, 2147483647), release_date nulls last, title
      limit 8
    `;

    return sendShareCard(response, collectionCardData(rows[0], items, slug));
  } catch (error) {
    console.error("collection_og_failed", error instanceof Error ? error.message : "Collection OG failed.");
    return sendShareCard(response, fallbackShareCard("collection"));
  }
}
