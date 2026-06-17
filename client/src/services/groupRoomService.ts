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

export function getGroupRoom(roomCode: string, participantId?: string) {
  const search = new URLSearchParams({ roomCode });
  if (participantId) search.set("participantId", participantId);
  return groupRoomRequest<GroupRoomState>(`/api/group-rooms?${search.toString()}`);
}

export function createGroupRoom(input: { eventId: string; mode?: GroupRoomMode; timerSeconds?: number }) {
  return groupRoomRequest<CreatedGroupRoom>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "create", eventId: input.eventId, mode: input.mode || "local", timerSeconds: input.timerSeconds }),
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

export function submitGroupRoomAnswer(input: {
  roomCode: string;
  participantId: string;
  selectedAnswer: string;
}) {
  return groupRoomRequest<GroupRoomState>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "answer", ...input }),
  });
}

export function removeGroupRoomParticipant(input: { roomCode: string; hostToken: string; participantId: string }) {
  return groupRoomRequest<GroupRoomState>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "remove", ...input }),
  });
}

export function cancelGroupRoom(input: { roomCode: string; hostToken: string }) {
  return groupRoomRequest<GroupRoomState>("/api/group-rooms", {
    method: "POST",
    body: JSON.stringify({ action: "cancel", ...input }),
  });
}
