import type { CreatedGroupRoom, GroupRoomMode, GroupRoomState, JoinedGroupRoom } from "../types";

async function groupRoomRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Group room request failed.");
  }

  return response.json() as Promise<T>;
}

export function getGroupRoom(roomCode: string) {
  return groupRoomRequest<GroupRoomState>(`/api/group-rooms?roomCode=${encodeURIComponent(roomCode)}`);
}

export function createGroupRoom(input: { eventId: string; mode?: GroupRoomMode }) {
  return groupRoomRequest<CreatedGroupRoom>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "create", eventId: input.eventId, mode: input.mode || "local" }),
  });
}

export function joinGroupRoom(input: { roomCode: string; displayName: string; avatarId?: string }) {
  return groupRoomRequest<JoinedGroupRoom>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "join", ...input }),
  });
}

export function startGroupRoom(input: { roomCode: string; hostToken: string }) {
  return groupRoomRequest<GroupRoomState>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "start", ...input }),
  });
}

export function submitGroupRoomAnswers(input: {
  roomCode: string;
  participantId: string;
  answers: Record<string, string>;
  answerTimes?: Record<string, number>;
}) {
  return groupRoomRequest<GroupRoomState>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "submit", ...input }),
  });
}
