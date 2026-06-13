import { db } from "../_db.js";
import { getBuiltIndexHtml, injectMeta } from "../_shareCards.js";

function slugFromRequest(request: any) {
  const value = Array.isArray(request.query.slug) ? request.query.slug[0] : request.query.slug;
  return String(value || "").trim();
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  const indexHtml = await getBuiltIndexHtml(request);
  const slug = slugFromRequest(request);
  if (!slug) {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
    return;
  }

  try {
    const sql = db();
    const rows = await sql`
      select
        mc.*,
        (
          select count(*)::int
          from media_collection_items mci
          where mci.collection_id = mc.id
        ) as title_count
      from media_collections mc
      where mc.slug = ${slug}
      limit 1
    `;
    const collection = rows[0];
    if (!collection) {
      response.statusCode = 200;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(indexHtml);
      return;
    }

    const title = `${collection.title} | Flim`;
    const count = Number(collection.title_count || 0);
    const description = `${count} ${count === 1 ? "title" : "titles"} | ${collection.category || "Collection"} | Discover on Flim`;
    const url = `https://www.flim.ca/collection/${slug}`;
    const image = `https://www.flim.ca/api/og/collection/${encodeURIComponent(slug)}`;

    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(injectMeta(indexHtml, { title, description, url, image }));
  } catch (error) {
    console.error("collection_page_meta_failed", error instanceof Error ? error.message : "Collection page meta failed.");
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(indexHtml);
  }
}
