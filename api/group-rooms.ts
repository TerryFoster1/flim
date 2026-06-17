import { db, errorStatus, getCurrentUser, readBody, sendJson } from "./_db.js";
import {
  createGroupRoom,
  getGroupRoom,
  joinGroupRoom,
  startGroupRoom,
  submitGroupRoomAnswers,
  type GroupRoomMode,
} from "./_groupRooms.js";

export default async function handler(request: any, response: any) {
  if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (request.method === "GET") {
      const url = new URL(request.url || "/api/group-rooms", "http://localhost");
      const roomCode = String(url.searchParams.get("roomCode") || "").trim();
      if (!roomCode) return sendJson(response, 400, { error: "roomCode is required." });
      const result = await getGroupRoom(sql, roomCode);
      if (!result) return sendJson(response, 404, { error: "Group room not found." });
      return sendJson(response, 200, result);
    }

    const body = await readBody(request);
    const action = String(body.action || "");
    if (action === "create") {
      const eventId = typeof body.eventId === "string" ? body.eventId : "";
      if (!eventId) return sendJson(response, 400, { error: "eventId is required." });
      const mode: GroupRoomMode = body.mode === "online" ? "online" : "local";
      const result = await createGroupRoom(sql, user?.id, eventId, mode);
      if (!result) return sendJson(response, 404, { error: "Group room could not be created. Try again." });
      return sendJson(response, 200, result);
    }
    if (action === "join") {
      const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
      const displayName = typeof body.displayName === "string" ? body.displayName : "";
      const avatarId = typeof body.avatarId === "string" ? body.avatarId : undefined;
      if (!roomCode) return sendJson(response, 400, { error: "roomCode is required." });
      const result = await joinGroupRoom(sql, roomCode, user?.id, displayName, avatarId);
      if (!result) return sendJson(response, 404, { error: "Group room is no longer accepting players." });
      return sendJson(response, 200, result);
    }
    if (action === "start") {
      const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
      const hostToken = typeof body.hostToken === "string" ? body.hostToken : "";
      if (!roomCode || !hostToken) return sendJson(response, 400, { error: "Host access is required." });
      const result = await startGroupRoom(sql, roomCode, hostToken);
      if (!result) return sendJson(response, 403, { error: "Only the host can start this room." });
      return sendJson(response, 200, result);
    }
    if (action === "submit") {
      const roomCode = typeof body.roomCode === "string" ? body.roomCode : "";
      const participantId = typeof body.participantId === "string" ? body.participantId : "";
      if (!roomCode || !participantId) return sendJson(response, 400, { error: "Player room session is required." });
      const result = await submitGroupRoomAnswers(sql, roomCode, participantId, body);
      if (!result) return sendJson(response, 404, { error: "Group room score could not be saved." });
      return sendJson(response, 200, result);
    }

    return sendJson(response, 400, { error: "Unknown group room action." });
  } catch (error) {
    return sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : "Group room request failed." });
  }
}
