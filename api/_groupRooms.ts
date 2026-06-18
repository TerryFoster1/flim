import { randomBytes } from "node:crypto";
import { awardTickets } from "./_arcadeEconomy.js";
import { ensurePgCrypto } from "./_db.js";
import { challengeQuestions, ensureSeasonalChallengeTables } from "./_seasonalChallenges.js";

export type GroupRoomStatus = "lobby" | "countdown" | "active" | "completed" | "expired";
export type GroupRoomMode = "local" | "online";
type GroupRoomPhase = "lobby" | "countdown" | "question" | "reveal" | "leaderboard" | "completed";

const defaultTimerSeconds = 20;
const defaultCountdownSeconds = 3;
const defaultRevealSeconds = 4;
const defaultLeaderboardSeconds = 5;

async function safe(query: Promise<any>) {
  try {
    return await query;
  } catch {
    return null;
  }
}

function roomCode() {
  return randomBytes(4).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
}

function hostToken() {
  return randomBytes(18).toString("base64url");
}

function sanitizeTimer(value: unknown) {
  const seconds = Number(value);
  return [10, 20, 30, 60].includes(seconds) ? seconds : defaultTimerSeconds;
}

function statusForClient(status: string): GroupRoomStatus {
  if (status === "waiting") return "lobby";
  if (["lobby", "countdown", "active", "completed", "expired"].includes(status)) return status as GroupRoomStatus;
  return "expired";
}

function phaseForStatus(status: string, phase: string): GroupRoomPhase {
  if (status === "waiting" || status === "lobby") return "lobby";
  if (status === "countdown") return "countdown";
  if (status === "completed" || status === "expired") return "completed";
  if (["question", "reveal", "leaderboard"].includes(phase)) return phase as GroupRoomPhase;
  return "question";
}

function addSeconds(date: Date, seconds: number) {
  return new Date(date.getTime() + seconds * 1000);
}

function elapsedSeconds(startedAt: string | Date | null | undefined, now = new Date()) {
  if (!startedAt) return 0;
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, (now.getTime() - started) / 1000);
}

function publicQuestion(question: any, index: number, room: any) {
  const currentIndex = Number(room.current_question_index || 0);
  const status = statusForClient(room.status);
  const phase = phaseForStatus(room.status, room.phase);
  const answerVisible = status === "completed"
    || index < currentIndex
    || (index === currentIndex && ["reveal", "leaderboard"].includes(phase));
  return {
    ...question,
    answer: answerVisible ? question.answer : "",
    explanation: answerVisible ? question.explanation : "",
  };
}

function scoreForAnswer(isCorrect: boolean, elapsedMs: number, timerSeconds: number, streakBefore: number) {
  if (!isCorrect) return 0;
  const maxMs = timerSeconds * 1000;
  const remainingRatio = Math.max(0, Math.min(1, (maxMs - elapsedMs) / maxMs));
  const speedScore = Math.round(500 + remainingRatio * 500);
  const streakBonus = Math.min(150, Math.max(0, streakBefore) * 25);
  return speedScore + streakBonus;
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
      status text not null default 'lobby',
      mode text not null default 'local',
      question_ids jsonb not null default '[]'::jsonb,
      current_question_index integer not null default 0,
      phase text not null default 'lobby',
      phase_started_at timestamptz,
      timer_seconds integer not null default 20,
      countdown_seconds integer not null default 3,
      reveal_seconds integer not null default 4,
      leaderboard_seconds integer not null default 5,
      created_at timestamptz not null default now(),
      started_at timestamptz,
      completed_at timestamptz,
      expires_at timestamptz not null default (now() + interval '24 hours'),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`alter table group_trivia_rooms drop constraint if exists group_trivia_rooms_status_check`);
  await safe(sql`alter table group_trivia_rooms drop constraint if exists group_trivia_rooms_mode_check`);
  await safe(sql`alter table group_trivia_rooms drop constraint if exists group_trivia_rooms_phase_check`);
  await safe(sql`alter table group_trivia_rooms add column if not exists host_token text not null default ''`);
  await safe(sql`alter table group_trivia_rooms add column if not exists question_ids jsonb not null default '[]'::jsonb`);
  await safe(sql`alter table group_trivia_rooms add column if not exists current_question_index integer not null default 0`);
  await safe(sql`alter table group_trivia_rooms add column if not exists phase text not null default 'lobby'`);
  await safe(sql`alter table group_trivia_rooms add column if not exists phase_started_at timestamptz`);
  await safe(sql`alter table group_trivia_rooms add column if not exists timer_seconds integer not null default 20`);
  await safe(sql`alter table group_trivia_rooms add column if not exists countdown_seconds integer not null default 3`);
  await safe(sql`alter table group_trivia_rooms add column if not exists reveal_seconds integer not null default 4`);
  await safe(sql`alter table group_trivia_rooms add column if not exists leaderboard_seconds integer not null default 5`);
  await safe(sql`update group_trivia_rooms set status = 'lobby', phase = 'lobby' where status = 'waiting'`);
  await safe(sql`alter table group_trivia_rooms add constraint group_trivia_rooms_status_check check (status in ('waiting', 'lobby', 'countdown', 'active', 'completed', 'expired'))`);
  await safe(sql`alter table group_trivia_rooms add constraint group_trivia_rooms_mode_check check (mode in ('local', 'online'))`);
  await safe(sql`alter table group_trivia_rooms add constraint group_trivia_rooms_phase_check check (phase in ('lobby', 'countdown', 'question', 'reveal', 'leaderboard', 'completed'))`);
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
      incorrect_count integer not null default 0,
      answered_count integer not null default 0,
      average_answer_time_ms integer not null default 0,
      longest_correct_streak integer not null default 0,
      completed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`alter table group_trivia_participants add column if not exists incorrect_count integer not null default 0`);
  await safe(sql`alter table group_trivia_participants add column if not exists average_answer_time_ms integer not null default 0`);
  await safe(sql`alter table group_trivia_participants add column if not exists longest_correct_streak integer not null default 0`);
  await safe(sql`create index if not exists group_trivia_participants_room_score_idx on group_trivia_participants (room_id, score desc, correct_count desc, average_answer_time_ms asc, joined_at asc)`);
  await safe(sql`create unique index if not exists group_trivia_participants_room_user_unique on group_trivia_participants (room_id, user_id) where user_id is not null`);

  await safe(sql`
    create table if not exists group_trivia_answers (
      id uuid primary key default gen_random_uuid(),
      room_id uuid not null references group_trivia_rooms(id) on delete cascade,
      participant_id uuid not null references group_trivia_participants(id) on delete cascade,
      question_id text not null,
      question_index integer not null default 0,
      selected_answer text not null default '',
      is_correct boolean not null default false,
      score integer not null default 0,
      answer_time_ms integer not null default 0,
      created_at timestamptz not null default now()
    )
  `);
  await safe(sql`alter table group_trivia_answers add column if not exists question_index integer not null default 0`);
  await safe(sql`alter table group_trivia_answers add column if not exists score integer not null default 0`);
  await safe(sql`create unique index if not exists group_trivia_answers_participant_question_unique on group_trivia_answers (participant_id, question_id)`);
  await safe(sql`create index if not exists group_trivia_answers_room_question_idx on group_trivia_answers (room_id, question_index)`);
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
  const selected = ids.length ? allQuestions.filter((question: any) => ids.includes(String(question.id))) : allQuestions;
  const byId = new Map(selected.map((question: any) => [String(question.id), question]));
  return ids.length ? ids.map((id: string) => byId.get(id)).filter(Boolean) : selected;
}

async function refreshParticipantStats(sql: any, roomId: string, participantId: string) {
  const rows = await sql`
    select is_correct, score, answer_time_ms
    from group_trivia_answers
    where room_id = ${roomId}
      and participant_id = ${participantId}
    order by question_index asc
  `;
  let correctCount = 0;
  let incorrectCount = 0;
  let score = 0;
  let longestCorrectStreak = 0;
  let currentStreak = 0;
  let totalAnswerTime = 0;
  for (const row of rows) {
    score += Number(row.score || 0);
    totalAnswerTime += Number(row.answer_time_ms || 0);
    if (row.is_correct) {
      correctCount += 1;
      currentStreak += 1;
      longestCorrectStreak = Math.max(longestCorrectStreak, currentStreak);
    } else {
      incorrectCount += 1;
      currentStreak = 0;
    }
  }
  const answeredCount = rows.length;
  const averageAnswerTimeMs = answeredCount ? Math.round(totalAnswerTime / answeredCount) : 0;
  await sql`
    update group_trivia_participants
    set score = ${score},
        correct_count = ${correctCount},
        incorrect_count = ${incorrectCount},
        answered_count = ${answeredCount},
        average_answer_time_ms = ${averageAnswerTimeMs},
        longest_correct_streak = ${longestCorrectStreak},
        updated_at = now()
    where id = ${participantId}
  `;
}

async function completeRoomIfNeeded(sql: any, room: any, questions: any[]) {
  const participants = await sql`
    select id, user_id, score, correct_count
    from group_trivia_participants
    where room_id = ${room.id}
  `.catch(() => []);

  for (const participant of participants) {
    await sql`
      update group_trivia_participants
      set completed_at = coalesce(completed_at, now()),
          updated_at = now()
      where id = ${participant.id}
    `;
    if (participant.user_id) {
      await awardTickets(sql, {
        userId: participant.user_id,
        ruleKey: "weekly_challenge_completed",
        sourceType: "group_trivia_room",
        sourceId: `${room.id}:${participant.id}`,
        metadata: {
          roomId: room.id,
          score: Number(participant.score || 0),
          correctCount: Number(participant.correct_count || 0),
          totalCount: questions.length,
        },
      }).catch(() => null);
    }
  }

  await sql`
    update group_trivia_rooms
    set status = 'completed',
        phase = 'completed',
        completed_at = coalesce(completed_at, now()),
        updated_at = now()
    where id = ${room.id}
  `;
}

async function advanceRoomClock(sql: any, inputRoom: any, questions: any[]) {
  let room = inputRoom;
  const expiresAt = new Date(room.expires_at).getTime();
  if (room.status !== "completed" && Number.isFinite(expiresAt) && expiresAt < Date.now()) {
    const rows = await sql`
      update group_trivia_rooms
      set status = 'expired',
          phase = 'completed',
          updated_at = now()
      where id = ${room.id}
      returning *
    `;
    return rows[0] || room;
  }

  for (let guard = 0; guard < 12; guard += 1) {
    const status = statusForClient(room.status);
    const phase = phaseForStatus(room.status, room.phase);
    const phaseStartedAt = room.phase_started_at || room.started_at || room.created_at;
    const started = new Date(phaseStartedAt);
    if (status === "countdown" && elapsedSeconds(phaseStartedAt) >= Number(room.countdown_seconds || defaultCountdownSeconds)) {
      const rows = await sql`
        update group_trivia_rooms
        set status = 'active',
            phase = 'question',
            current_question_index = 0,
            phase_started_at = ${addSeconds(started, Number(room.countdown_seconds || defaultCountdownSeconds)).toISOString()},
            updated_at = now()
        where id = ${room.id}
        returning *
      `;
      room = rows[0] || room;
      continue;
    }
    if (status === "active" && phase === "question" && elapsedSeconds(phaseStartedAt) >= Number(room.timer_seconds || defaultTimerSeconds)) {
      const rows = await sql`
        update group_trivia_rooms
        set phase = 'reveal',
            phase_started_at = ${addSeconds(started, Number(room.timer_seconds || defaultTimerSeconds)).toISOString()},
            updated_at = now()
        where id = ${room.id}
        returning *
      `;
      room = rows[0] || room;
      continue;
    }
    if (status === "active" && phase === "reveal" && elapsedSeconds(phaseStartedAt) >= Number(room.reveal_seconds || defaultRevealSeconds)) {
      const rows = await sql`
        update group_trivia_rooms
        set phase = 'leaderboard',
            phase_started_at = ${addSeconds(started, Number(room.reveal_seconds || defaultRevealSeconds)).toISOString()},
            updated_at = now()
        where id = ${room.id}
        returning *
      `;
      room = rows[0] || room;
      continue;
    }
    if (status === "active" && phase === "leaderboard" && elapsedSeconds(phaseStartedAt) >= Number(room.leaderboard_seconds || defaultLeaderboardSeconds)) {
      const currentIndex = Number(room.current_question_index || 0);
      if (currentIndex < questions.length - 1) {
        const rows = await sql`
          update group_trivia_rooms
          set current_question_index = current_question_index + 1,
              phase = 'question',
              phase_started_at = ${addSeconds(started, Number(room.leaderboard_seconds || defaultLeaderboardSeconds)).toISOString()},
              updated_at = now()
          where id = ${room.id}
          returning *
        `;
        room = rows[0] || room;
        continue;
      }
      await completeRoomIfNeeded(sql, room, questions);
      const rows = await sql`select * from group_trivia_rooms where id = ${room.id} limit 1`;
      room = rows[0] || room;
    }
    break;
  }
  return room;
}

async function mapRoom(sql: any, roomInput: any, viewerParticipantId?: string) {
  const event = await eventForRoom(sql, roomInput);
  const rawQuestions = event ? await questionsForRoom(sql, roomInput, event) : [];
  const room = await advanceRoomClock(sql, roomInput, rawQuestions);
  const [participants, answers] = await Promise.all([
    sql`
      select id, user_id, display_name, avatar_id, joined_at, score, correct_count, incorrect_count, answered_count,
        average_answer_time_ms, longest_correct_streak, completed_at
      from group_trivia_participants
      where room_id = ${room.id}
      order by score desc, correct_count desc, average_answer_time_ms asc, joined_at asc
    `.catch(() => []),
    sql`
      select participant_id, question_index, question_id, selected_answer, is_correct, score, answer_time_ms, created_at
      from group_trivia_answers
      where room_id = ${room.id}
      order by created_at asc
    `.catch(() => []),
  ]);

  const completedParticipants = participants.filter((participant: any) => participant.completed_at);
  const winnerScore = completedParticipants.length ? Math.max(...completedParticipants.map((participant: any) => Number(participant.score || 0))) : null;
  const currentQuestionIndex = Math.min(Math.max(0, Number(room.current_question_index || 0)), Math.max(0, rawQuestions.length - 1));
  const currentQuestionId = rawQuestions[currentQuestionIndex] ? String(rawQuestions[currentQuestionIndex].id) : "";
  const viewerAnswer = viewerParticipantId
    ? answers.find((answer: any) => String(answer.participant_id) === String(viewerParticipantId) && String(answer.question_id) === currentQuestionId)
    : null;
  const phase = phaseForStatus(room.status, room.phase);
  const status = statusForClient(room.status);
  const questionAnswers = answers.filter((answer: any) => Number(answer.question_index || 0) === currentQuestionIndex);

  return {
    room: {
      id: room.id,
      roomCode: room.room_code,
      status,
      phase,
      mode: room.mode,
      eventId: room.event_id,
      challengeName: event?.name || "Group Trivia",
      challengeSlug: event?.slug || "",
      questionCount: rawQuestions.length,
      currentQuestionIndex,
      phaseStartedAt: room.phase_started_at || undefined,
      timerSeconds: Number(room.timer_seconds || defaultTimerSeconds),
      countdownSeconds: Number(room.countdown_seconds || defaultCountdownSeconds),
      revealSeconds: Number(room.reveal_seconds || defaultRevealSeconds),
      leaderboardSeconds: Number(room.leaderboard_seconds || defaultLeaderboardSeconds),
      serverNow: new Date().toISOString(),
      createdAt: room.created_at,
      startedAt: room.started_at || undefined,
      completedAt: room.completed_at || undefined,
      expiresAt: room.expires_at,
    },
    questions: rawQuestions.map((question: any, index: number) => publicQuestion(question, index, room)),
    currentQuestionAnswer: viewerAnswer ? {
      selectedAnswer: viewerAnswer.selected_answer,
      isCorrect: Boolean(viewerAnswer.is_correct),
      score: Number(viewerAnswer.score || 0),
      answerTimeMs: Number(viewerAnswer.answer_time_ms || 0),
    } : null,
    currentQuestionAnsweredCount: questionAnswers.length,
    participants: participants.map((participant: any) => ({
      id: participant.id,
      userId: participant.user_id || undefined,
      displayName: participant.display_name || "Player",
      avatarId: participant.avatar_id || undefined,
      joinedAt: participant.joined_at,
      score: Number(participant.score || 0),
      correctCount: Number(participant.correct_count || 0),
      incorrectCount: Number(participant.incorrect_count || 0),
      answeredCount: Number(participant.answered_count || 0),
      averageAnswerTimeMs: Number(participant.average_answer_time_ms || 0),
      longestCorrectStreak: Number(participant.longest_correct_streak || 0),
      completedAt: participant.completed_at || undefined,
      isWinner: winnerScore !== null && participant.completed_at && Number(participant.score || 0) === winnerScore,
    })),
  };
}

export async function createGroupRoom(sql: any, userId: string | undefined, eventId: string, mode: GroupRoomMode, timerSeconds?: number) {
  await ensureGroupRoomTables(sql);
  const event = await activeEventById(sql, eventId);
  if (!event) return null;
  const questions = await challengeQuestions(sql, event);
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
        status,
        phase,
        mode,
        question_ids,
        timer_seconds,
        expires_at
      )
      values (
        ${eventId},
        ${userId || null},
        ${code},
        ${token},
        'lobby',
        'lobby',
        ${mode === "online" ? "online" : "local"},
        ${JSON.stringify(questions.map((question: any) => question.id))}::jsonb,
        ${sanitizeTimer(timerSeconds)},
        now() + interval '24 hours'
      )
      on conflict (room_code) do nothing
      returning *
    `;
    if (rows[0]) return { ...(await mapRoom(sql, rows[0])), hostToken: token };
  }
  throw new Error("Group room could not be created. Try again.");
}

export async function getGroupRoom(sql: any, roomCodeValue: string, viewerParticipantId?: string) {
  await ensureGroupRoomTables(sql);
  const [room] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
    limit 1
  `;
  return room ? mapRoom(sql, room, viewerParticipantId) : null;
}

export async function joinGroupRoom(sql: any, roomCodeValue: string, userId: string | undefined, displayName: string, avatarId?: string) {
  await ensureGroupRoomTables(sql);
  const [room] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
      and status in ('waiting', 'lobby')
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
  const participant = rows[0] ? { id: rows[0].id, displayName: rows[0].display_name, avatarId: rows[0].avatar_id || undefined } : null;
  return { ...(await mapRoom(sql, room, participant?.id)), participant };
}

export async function startGroupRoom(sql: any, roomCodeValue: string, token: string) {
  await ensureGroupRoomTables(sql);
  const rows = await sql`
    update group_trivia_rooms
    set status = 'countdown',
        phase = 'countdown',
        started_at = coalesce(started_at, now()),
        phase_started_at = now(),
        current_question_index = 0,
        expires_at = now() + interval '7 days',
        updated_at = now()
    where room_code = ${roomCodeValue.toUpperCase()}
      and host_token = ${token}
      and status in ('waiting', 'lobby')
      and expires_at > now()
      and exists (
        select 1 from group_trivia_participants
        where room_id = group_trivia_rooms.id
      )
    returning *
  `;
  return rows[0] ? mapRoom(sql, rows[0]) : null;
}

export async function removeGroupRoomParticipant(sql: any, roomCodeValue: string, token: string, participantId: string) {
  await ensureGroupRoomTables(sql);
  const [room] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
      and host_token = ${token}
      and status in ('waiting', 'lobby')
      and expires_at > now()
    limit 1
  `;
  if (!room) return null;
  await sql`
    delete from group_trivia_participants
    where room_id = ${room.id}
      and id = ${participantId}
  `;
  return getGroupRoom(sql, roomCodeValue);
}

export async function cancelGroupRoom(sql: any, roomCodeValue: string, token: string) {
  await ensureGroupRoomTables(sql);
  const rows = await sql`
    update group_trivia_rooms
    set status = 'expired',
        phase = 'completed',
        updated_at = now()
    where room_code = ${roomCodeValue.toUpperCase()}
      and host_token = ${token}
      and status in ('waiting', 'lobby', 'countdown')
    returning *
  `;
  return rows[0] ? mapRoom(sql, rows[0]) : null;
}

export async function submitGroupRoomAnswer(sql: any, roomCodeValue: string, participantId: string, body: any) {
  await ensureGroupRoomTables(sql);
  const [storedRoom] = await sql`
    select *
    from group_trivia_rooms
    where room_code = ${roomCodeValue.toUpperCase()}
      and status in ('countdown', 'active')
      and expires_at > now()
    limit 1
  `;
  if (!storedRoom) return null;
  const event = await eventForRoom(sql, storedRoom);
  if (!event) return null;
  const questions = await questionsForRoom(sql, storedRoom, event);
  const room = await advanceRoomClock(sql, storedRoom, questions);
  if (statusForClient(room.status) !== "active" || phaseForStatus(room.status, room.phase) !== "question") return null;

  const [participant] = await sql`
    select *
    from group_trivia_participants
    where id = ${participantId}
      and room_id = ${room.id}
    limit 1
  `;
  if (!participant) return null;

  const currentIndex = Number(room.current_question_index || 0);
  const question = questions[currentIndex];
  if (!question) return null;
  const selected = typeof body.selectedAnswer === "string" ? body.selectedAnswer : "";
  if (!question.options.includes(selected)) return null;

  const existing = await sql`
    select id
    from group_trivia_answers
    where participant_id = ${participantId}
      and question_id = ${String(question.id)}
    limit 1
  `;
  if (existing[0]) return mapRoom(sql, room, participantId);

  const answerTimeMs = Math.max(0, Math.min(Number(room.timer_seconds || defaultTimerSeconds) * 1000, Math.round(elapsedSeconds(room.phase_started_at) * 1000)));
  const previousCorrect = await sql`
    select is_correct
    from group_trivia_answers
    where room_id = ${room.id}
      and participant_id = ${participantId}
      and question_index < ${currentIndex}
    order by question_index desc
  `;
  let streakBefore = 0;
  for (const answer of previousCorrect) {
    if (!answer.is_correct) break;
    streakBefore += 1;
  }
  const isCorrect = selected === question.answer;
  const answerScore = scoreForAnswer(isCorrect, answerTimeMs, Number(room.timer_seconds || defaultTimerSeconds), streakBefore);
  await sql`
    insert into group_trivia_answers (
      room_id,
      participant_id,
      question_id,
      question_index,
      selected_answer,
      is_correct,
      score,
      answer_time_ms
    )
    values (
      ${room.id},
      ${participantId},
      ${String(question.id)},
      ${currentIndex},
      ${selected},
      ${isCorrect},
      ${answerScore},
      ${answerTimeMs}
    )
    on conflict (participant_id, question_id) do nothing
  `;
  await refreshParticipantStats(sql, room.id, participantId);

  const [counts] = await sql`
    select
      (select count(*)::int from group_trivia_participants where room_id = ${room.id}) as player_count,
      (select count(*)::int from group_trivia_answers where room_id = ${room.id} and question_index = ${currentIndex}) as answer_count
  `;
  if (Number(counts?.player_count || 0) > 0 && Number(counts?.answer_count || 0) >= Number(counts?.player_count || 0)) {
    await sql`
      update group_trivia_rooms
      set phase = 'reveal',
          phase_started_at = now(),
          updated_at = now()
      where id = ${room.id}
        and phase = 'question'
    `;
  }

  return getGroupRoom(sql, roomCodeValue, participantId);
}
