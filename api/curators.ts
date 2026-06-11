import { db, getCurrentUser, sendJson } from "./_db.js";
import { getCuratorDiscovery } from "./_curators.js";
import { ensureDirectorSeed } from "./_director.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    await ensureDirectorSeed(sql).catch((error) => {
      console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
    });
    const user = await getCurrentUser(sql, request);
    const query = String(Array.isArray(request.query.q) ? request.query.q[0] : request.query.q || "");
    const feed = await getCuratorDiscovery(sql, user?.id || null, query);
    return sendJson(response, 200, feed);
  } catch (error) {
    console.error("curator_discovery_failed", error instanceof Error ? error.message : "Curator discovery failed.");
    return sendJson(response, 500, { error: "Curator discovery failed. Please try again." });
  }
}
