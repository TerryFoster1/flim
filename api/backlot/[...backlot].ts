import { db, errorStatus, readBody, sendJson } from "../_db.js";
import { discoverBacklotGame, getBacklotState, recordBacklotEvent } from "../_backlot.js";

function routeSegment(request: any) {
  const pathname = new URL(request.url || "", "https://www.flim.ca").pathname;
  if (pathname === "/api/backlot") return "";
  const prefix = "/api/backlot/";
  return pathname.startsWith(prefix) ? pathname.slice(prefix.length).split("?")[0] : "";
}

export default async function handler(request: any, response: any) {
  const sql = db();
  const segment = routeSegment(request);

  try {
    if (!segment && request.method === "GET") {
      const state = await getBacklotState(sql, request);
      if (!state) return sendJson(response, 401, { error: "Sign in to sync Backlot Arcade." });
      return sendJson(response, 200, state);
    }

    if (segment === "discover" && request.method === "POST") {
      const result = await discoverBacklotGame(sql, request, await readBody(request));
      return sendJson(response, result.status, result.body);
    }

    if (segment === "events" && request.method === "POST") {
      const result = await recordBacklotEvent(sql, request, await readBody(request));
      return sendJson(response, result.status, result.body);
    }

    return sendJson(response, 404, { error: "Backlot route not found." });
  } catch (error) {
    const status = errorStatus(error);
    const message = status >= 500 ? "Backlot Arcade is temporarily unavailable." : error instanceof Error ? error.message : "Backlot request failed.";
    return sendJson(response, status, { error: message });
  }
}
