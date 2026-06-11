import { db, sendJson } from "./_db.js";
import { hallOfFameFeed, normalizeHallOfFameWindow } from "./_hallOfFame.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const url = new URL(request.url || "/api/hall-of-fame", `https://${request.headers.host || "www.flim.ca"}`);
    const window = normalizeHallOfFameWindow(url.searchParams.get("window"));
    return sendJson(response, 200, await hallOfFameFeed(sql, window));
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Hall of Fame request failed." });
  }
}
