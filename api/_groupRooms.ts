import { randomBytes } from "node:crypto";
import { ensurePgCrypto } from "./_db.js";
import { challengeQuestions, ensureSeasonalChallengeTables } from "./_seasonalChallenges.js";

export type GroupRoomStatus = "waiting" | "active" | "completed" | "expired";
export type GroupRoomMode = "local" | "online";

const roundQuestionCount = 25;

async function safe(query: Promise<any>) {
  try {
    return await query;
  } catch {
    return null;
  }
}

function safeObject(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function roomCode() {
  return randomBytes(4).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
}

function hostToken() {
  return randomBytes(18).toString("base64url");
}

export async function ensureGroupRoomTables(sql: any) {
  await ensureSeasonalChallengeTables(sql);
  await ensurePgCrypto(sql);
  await safe(sql`
    create table if not exists group_trivia_rooms (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references seasonal_challenge_events(id) on delete cascade,
      host_user_id uuid references users(id) on delete set null,
      room_code text not null unique,
      host_token text not null,
      status text not null default 'waiting' check (status in ('waiting', 'active', 'completed', 'expired')),
      mode text not null default 'local' check (mode in ('local', 'online')),
      question_ids jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz,
      expires_at timestamptz not null default (now() + interval '24 hours'),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`alter table group_trivia_rooms add column if not exists host_token text not null default ''`);
  await safe(sql`alter table group_trivia_rooms add column if not exists question_ids jsonb not null default '[]'::jsonb`);
  await safe(sql`create unique index if not exists group_trivia_rooms_room_code_unique on group_trivia_rooms (room_code)`);
  await safe(sql`create index if not exists group_trivia_rooms_status_expires_idx on group_trivia_rooms (status, expires_at)`);

  await safe(sql`
    create table if not exists group_trivia_participants (
      id uuid primary key default gen_random_uuid(),
      room_id uuid not null references group_trivia_rooms(id) on delete cascade,
      user_id uuid references users(id) on delete set null,
      display_name text not null,
      avatar_id text,
      joined_at timestamptz not null default now(),
      score integer not null default 0,
      correct_count integer not null default 0,
      answered_count integer not null default 0,
      completed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create index if not exists group_trivia_participants_room_score_idx on group_trivia_participants (room_id, score desc, completed_at asc nulls last)`);
  await safe(sql`create unique index if not exists group_trivia_participants_room_user_unique on group_trivia_participants (room_id, user_id) where user_id is not null`);

  await safe(sql`
    create table if not exists group_trivia_answers (
      id uuid primary key default gen_random_uuid(),
      room_id uuid not null references group_trivia_rooms(id) on delete cascade,
      participant_id uuid not null references group_trivia_participants(id) on delete cascade,
      question_id text not null,
      selected_answer text not null default '',
      is_correct boolean not null default false,
      answer_time_ms integer not null default 0,
      created_at timestamptz not null default now()
    )
  `);
  await safe(sql`create unique index if not exists group_trivia_answers_participant_question_unique on group_trivia_answers (participant_id, question_id)`);
  await safe(sql`create index if not exists group_trivia_answers_room_participant_idx on group_trivia_answers (room_id, participant_id)`);
}

async function activeEventById(sql: any, eventId: string) {
  const [event] = await sql`
    select *
    from seasonal_challenge_events
    where id = ${eventId}
      and status = 'published'
      and is_active = true
      and (now() at time zone 'America/Toronto')::date between start_date and end_date
    limit 1
  `;
  return event || null;
}

async function eventForRoom(sql: any, room: any) {
  const [event] = await sql`
    select *
    from seasonal_challenge_events
    where id = ${room.event_id}
    limit 1
  `;
  return event || null;
}

async function questionsForRoom(sql: any, room: any, event: any) {
  const allQuestions = await challengeQuestions(sql, event);
  const ids = Array.isArray(room.question_ids)
    ? room.question_ids.map(String)
    : typeof room.question_ids === "string"
      ? JSON.parse(room.question_ids || "[]").map(String)
      : [];
  const selected = ids.length ? allQuestions.filter((question: any) => ids.includes(String(question.id))) : allQuestions.slice(0, roundQuestionCount);
  const byId = new Map(selected.map((question: any) => [String(question.id), question]));
  return ids.length ? ids.map((id: string) => byId.get(id)).filter(Boolean) : selected;
}

async function mapRoom(sql: any, room: any) {
  const [participants, event] = await Promise.all([
    sql`
      select id, user_id, display_name, avatar_id, joined_at, score, correct_count, answered_count, completed_at
      from group_trivia_participants
      where room_id = ${room.id}
      order by score desc, completed_at asc nulls last, joined_at asc
    `.catch(() => []),
    eventForRoom(sql, room),
  ]);
  const questions = event ? await questionsForRoom(sql, room, event) : [];
  const completedParticipants = participants.filter((participant: any) => participant.completed_at);
  const winnerScore = completedParticipants.length ? Math.max(...completedParticipants.map((participant: any) => Number(participant.score || 0))) : null;
  const expiresAt = new Date(room.expires_at).getTime();
  const status = room.status !== "completed" && Number.isFinite(expiresAt) && expiresAt < Date.now() ? "expired" : room.status;
  return {
    room: {
      id: room.id,
      roomCode: room.room_code,
      status,
      mode: room.mode,
      eventId: room.event_id,
      challengeName: event?.name || "Group Trivia",
      challengeSlug: event?.slug || "",
      questionCount: questions.length,
      createdAt: room.created_at,
      startedAt: room.started_at || undefined,
      completedAt: room.completed_at || undefined,
      expiresAt: room.expires_at,
    },
    questions,
    participants: participants.map((participant: any) => ({
      id: participant.id,
      userId: participant.user_id || undefined,
      displayName: participant.display_name || "Player",
      avatarId: participant.avatar_id || undefined,
      joinedAt: participant.joined_at,
      score: Number(participant.score || 0),
      correctCount: Number(participant.correct_count || 0),
      answeredCount: Number(participant.answered_count || 0),
      completedAt: participant.completed_at || undefined,
      isWinner: winnerScore !== null && participant.completed_at && Number(participant.score || 0) === winnerScore,
    })),
  };
}

export async function createGroupRoom(sql: any, userId: string | undefined, eventId: string, mode: GroupRoomMode) {
  await ensureGroupRoomTables(sql);
  const event = await activeEventById(sql, eventId);
  if (!event) return null;
  const questions = (await challengeQuestions(sql, event)).slice(0, roundQuestionCount);
  if (questions.length === 0) throw new Error("This challenge is not ready for group play yet.");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = roomCode();
    const token = hostToken();
    const rows = await sql`
      insert into group_trivia_rooms (
        event_id,
        host_user_id,
        room_code,
        host_token,
        mode,
        question_ids,
        expires_at
      )
      values (
        ${eventId},
        ${userId || null},
        ${code},
        ${token},
        ${mode === "online" ? "online" : "local"},
        ${JSON.stringify(questions.map((question: any) => question.id))}::jsonb,
        now() + interval '24 hours'
      )
      on conflict (room_code) do nothing
      returning *
    `;
    if (rows[0]) return { ...(await mapRoom(sql, rows[0])), hostToken: token };
  }
  throw new Error("Group room could not be created. Try again.");
}

export async function getGroupRoom(sql: any, roomCodeValue: string) {
  await ensureGroupRoomTables(sql);
  const [room] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
    limit 1
  `;
  return room ? mapRoom(sql, room) : null;
}

export async function joinGroupRoom(sql: any, roomCodeValue: string, userId: string | undefined, displayName: string, avatarId?: string) {
  await ensureGroupRoomTables(sql);
  const [room] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
      and status = 'waiting'
      and expires_at > now()
    limit 1
  `;
  if (!room) return null;
  let name = displayName.trim().slice(0, 32);
  let avatar = avatarId?.trim().slice(0, 64) || null;
  if (userId && (!name || !avatar)) {
    const [profile] = await sql`
      select display_name, handle, avatar_key
      from user_profiles
      where user_id = ${userId}
      limit 1
    `.catch(() => []);
    name ||= profile?.display_name || profile?.handle || "";
    avatar ||= profile?.avatar_key || null;
  }
  name ||= `Player ${Math.floor(Math.random() * 900 + 100)}`;

  const rows = userId ? await sql`
    insert into group_trivia_participants (room_id, user_id, display_name, avatar_id)
    values (${room.id}, ${userId}, ${name}, ${avatar})
    on conflict (room_id, user_id) where user_id is not null do update set
      display_name = excluded.display_name,
      avatar_id = coalesce(excluded.avatar_id, group_trivia_participants.avatar_id),
      updated_at = now()
    returning *
  ` : await sql`
    insert into group_trivia_participants (room_id, user_id, display_name, avatar_id)
    values (${room.id}, null, ${name}, ${avatar})
    returning *
  `;
  return { ...(await mapRoom(sql, room)), participant: rows[0] ? { id: rows[0].id, displayName: rows[0].display_name, avatarId: rows[0].avatar_id || undefined } : null };
}

export async function startGroupRoom(sql: any, roomCodeValue: string, token: string) {
  await ensureGroupRoomTables(sql);
  const rows = await sql`
    update group_trivia_rooms
    set status = 'active',
        started_at = coalesce(started_at, now()),
        expires_at = now() + interval '7 days',
        updated_at = now()
    where room_code = ${roomCodeValue.toUpperCase()}
      and host_token = ${token}
      and status = 'waiting'
      and expires_at > now()
    returning *
  `;
  return rows[0] ? mapRoom(sql, rows[0]) : null;
}

export async function submitGroupRoomAnswers(sql: any, roomCodeValue: string, participantId: string, body: any) {
  await ensureGroupRoomTables(sql);
  const [room] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
      and status = 'active'
      and expires_at > now()
    limit 1
  `;
  if (!room) return null;
  const [participant] = await sql`
    select *
    from group_trivia_participants
    where id = ${participantId}
      and room_id = ${room.id}
    limit 1
  `;
  if (!participant) return null;

  const event = await eventForRoom(sql, room);
  if (!event) return null;
  const questions = await questionsForRoom(sql, room, event);
  const answers = safeObject(body.answers);
  const answerTimes = body.answerTimes && typeof body.answerTimes === "object" && !Array.isArray(body.answerTimes)
    ? body.answerTimes as Record<string, unknown>
    : {};

  let correctCount = 0;
  let answeredCount = 0;
  for (const question of questions) {
    const selected = answers[String(question.id)] || "";
    const isCorrect = Boolean(selected && selected === question.answer);
    const answerTimeMs = Math.max(0, Math.min(60000, Number(answerTimes[String(question.id)] || 0)));
    if (selected) answeredCount += 1;
    if (isCorrect) correctCount += 1;
    await sql`
      insert into group_trivia_answers (
        room_id,
        participant_id,
        question_id,
        selected_answer,
        is_correct,
        answer_time_ms
      )
      values (
        ${room.id},
        ${participantId},
        ${String(question.id)},
        ${selected},
        ${isCorrect},
        ${answerTimeMs}
      )
      on conflict (participant_id, question_id) do update set
        selected_answer = excluded.selected_answer,
        is_correct = excluded.is_correct,
        answer_time_ms = excluded.answer_time_ms,
        created_at = now()
    `;
  }

  const score = correctCount * 100;
  await sql`
    update group_trivia_participants
    set score = ${score},
        correct_count = ${correctCount},
        answered_count = ${answeredCount},
        completed_at = now(),
        updated_at = now()
    where id = ${participantId}
  `;
  await sql`
    update group_trivia_rooms
    set status = case
          when exists (
            select 1 from group_trivia_participants
            where room_id = ${room.id}
              and completed_at is null
          ) then status
          else 'completed'
        end,
        completed_at = case
          when exists (
            select 1 from group_trivia_participants
            where room_id = ${room.id}
              and completed_at is null
          ) then completed_at
          else coalesce(completed_at, now())
        end,
        updated_at = now()
    where id = ${room.id}
  `;

  return getGroupRoom(sql, roomCodeValue);
}
