import { checkRateLimit, db, errorStatus, getCurrentUser, readBody, sendJson } from "./_db.js";
import {
  cancelGroupRoom,
  createGroupRoom,
  getGroupRoom,
  joinGroupRoom,
  removeGroupRoomParticipant,
  startGroupRoom,
  submitGroupRoomAnswer,
  type GroupRoomMode,
} from "./_groupRooms.js";
import { cleanEnum, cleanInteger, cleanRoomCode, cleanText, optionalUuid, requireRecord, requireUuid, safeApiError } from "./_security.js";

export default async function handler(request: any, response: any) {
  if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const sql = db();
    const user = await getCurrentUser(sql, request);
    if (request.method === "GET") {
      const url = new URL(request.url || "/api/group-rooms", "http://localhost");
      const roomCode = cleanRoomCode(url.searchParams.get("roomCode"), "roomCode");
      const participantId = optionalUuid(url.searchParams.get("participantId") || "", "participantId");
      const result = await getGroupRoom(sql, roomCode, participantId);
      if (!result) return sendJson(response, 404, { error: "Group room not found." });
      return sendJson(response, 200, result);
    }

    const body = requireRecord(await readBody(request));
    const action = cleanEnum(body.action, ["create", "join", "start", "answer", "remove", "cancel"], { field: "Group room action", required: true });
    if (action === "create") {
      await checkRateLimit(sql, request, "group-room:create", user?.id, 30, 60 * 60);
      const eventId = requireUuid(body.eventId, "eventId");
      const mode = cleanEnum(body.mode, ["local", "online"], { field: "Room mode", fallback: "local" }) as GroupRoomMode;
      const timerSeconds = cleanInteger(body.timerSeconds, { field: "Timer seconds", min: 10, max: 60, fallback: undefined });
      const result = await createGroupRoom(sql, user?.id, eventId, mode, timerSeconds);
      if (!result) return sendJson(response, 404, { error: "Group room could not be created. Try again." });
      return sendJson(response, 200, result);
    }
    if (action === "join") {
      await checkRateLimit(sql, request, "group-room:join", user?.id, 120, 60 * 60);
      const roomCode = cleanRoomCode(body.roomCode, "roomCode");
      const displayName = cleanText(body.displayName || "Player", { field: "Display name", max: 32, required: true });
      const avatarId = body.avatarId ? cleanText(body.avatarId, { field: "Avatar", max: 64 }) : undefined;
      const result = await joinGroupRoom(sql, roomCode, user?.id, displayName, avatarId);
      if (!result) return sendJson(response, 404, { error: "Group room is no longer accepting players." });
      return sendJson(response, 200, result);
    }
    if (action === "start") {
      const roomCode = cleanRoomCode(body.roomCode, "roomCode");
      const hostToken = cleanText(body.hostToken, { field: "Host token", max: 160, required: true });
      const result = await startGroupRoom(sql, roomCode, hostToken);
      if (!result) return sendJson(response, 403, { error: "Only the host can start this room." });
      return sendJson(response, 200, result);
    }
    if (action === "answer") {
      await checkRateLimit(sql, request, "group-room:answer", user?.id, 600, 60 * 60);
      const roomCode = cleanRoomCode(body.roomCode, "roomCode");
      const participantId = requireUuid(body.participantId, "participantId");
      const answerBody = {
        ...body,
        questionId: cleanText(body.questionId, { field: "Question", max: 120, required: true }),
        selectedAnswer: cleanText(body.selectedAnswer, { field: "Answer", max: 240, required: true }),
      };
      const result = await submitGroupRoomAnswer(sql, roomCode, participantId, answerBody);
      if (!result) return sendJson(response, 404, { error: "Answer could not be saved for this round." });
      return sendJson(response, 200, result);
    }
    if (action === "remove") {
      const roomCode = cleanRoomCode(body.roomCode, "roomCode");
      const hostToken = cleanText(body.hostToken, { field: "Host token", max: 160, required: true });
      const participantId = requireUuid(body.participantId, "participantId");
      const result = await removeGroupRoomParticipant(sql, roomCode, hostToken, participantId);
      if (!result) return sendJson(response, 403, { error: "Player could not be removed." });
      return sendJson(response, 200, result);
    }
    if (action === "cancel") {
      const roomCode = cleanRoomCode(body.roomCode, "roomCode");
      const hostToken = cleanText(body.hostToken, { field: "Host token", max: 160, required: true });
      const result = await cancelGroupRoom(sql, roomCode, hostToken);
      if (!result) return sendJson(response, 403, { error: "Room could not be cancelled." });
      return sendJson(response, 200, result);
    }

  } catch (error) {
    return sendJson(response, errorStatus(error), { error: safeApiError(error, "Group room request failed.") });
  }
}
