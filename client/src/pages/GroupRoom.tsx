import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { baseAvatars, getFlimAvatar } from "../avatarCatalog";
import { FilmCritterComposite } from "../components/FilmCritterComposite";
import {
  cancelGroupRoom,
  getGroupRoom,
  joinGroupRoom,
  removeGroupRoomParticipant,
  startGroupRoom,
  submitGroupRoomAnswer,
} from "../services/groupRoomService";
import type { GroupRoomParticipant, GroupRoomState } from "../types";

interface GroupRoomProps {
  roomCode: string;
  onNavigate: (path: string) => void;
}

function participantStorageKey(roomCode: string) {
  return `flim-group-participant-${roomCode}`;
}

function hostStorageKey(roomCode: string) {
  return `flim-group-host-${roomCode}`;
}

function phaseSecondsRemaining(roomState: GroupRoomState | null, syncedAt = Date.now()) {
  if (!roomState?.room.phaseStartedAt) return 0;
  const started = new Date(roomState.room.phaseStartedAt).getTime();
  const serverNow = new Date(roomState.room.serverNow).getTime();
  const syncedServerNow = Number.isFinite(serverNow) ? serverNow + Math.max(0, Date.now() - syncedAt) : Date.now();
  const elapsed = Number.isFinite(started) ? Math.max(0, (syncedServerNow - started) / 1000) : 0;
  const duration = roomState.room.phase === "countdown"
    ? roomState.room.countdownSeconds
    : roomState.room.phase === "question"
      ? roomState.room.timerSeconds
      : roomState.room.phase === "reveal"
        ? roomState.room.revealSeconds
        : roomState.room.phase === "leaderboard"
          ? roomState.room.leaderboardSeconds
          : 0;
  return Math.max(0, Math.ceil(duration - elapsed));
}

function roomStatusCopy(roomState: GroupRoomState) {
  if (roomState.room.status === "lobby") return "Lobby";
  if (roomState.room.status === "countdown") return "Starting";
  if (roomState.room.status === "active" && roomState.room.phase === "question") return "Question live";
  if (roomState.room.status === "active" && roomState.room.phase === "reveal") return "Answer reveal";
  if (roomState.room.status === "active" && roomState.room.phase === "leaderboard") return "Leaderboard";
  if (roomState.room.status === "completed") return "Final results";
  return "Room closed";
}

function sortedParticipants(participants: GroupRoomParticipant[]) {
  return [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    return (a.averageAnswerTimeMs || 0) - (b.averageAnswerTimeMs || 0);
  });
}

function avatarForParticipant(participant: GroupRoomParticipant) {
  return getFlimAvatar(participant.avatarId || "classic");
}

export function GroupRoom({ roomCode, onNavigate }: GroupRoomProps) {
  const normalizedCode = roomCode.toUpperCase();
  const [roomState, setRoomState] = useState<GroupRoomState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarId, setAvatarId] = useState("classic");
  const [participantId, setParticipantId] = useState(() => window.localStorage.getItem(participantStorageKey(normalizedCode)) || "");
  const [hostToken, setHostToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("hostToken") || "";
    const savedToken = window.localStorage.getItem(hostStorageKey(normalizedCode)) || "";
    return queryToken || savedToken;
  });
  const [qrCode, setQrCode] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [answering, setAnswering] = useState(false);
  const [roomSyncedAt, setRoomSyncedAt] = useState(Date.now());

  const shareUrl = `${window.location.origin}/group/${normalizedCode}`;
  const isHost = Boolean(hostToken);
  const currentIndex = roomState?.room.currentQuestionIndex || 0;
  const currentQuestion = roomState?.questions[currentIndex];
  const currentParticipant = roomState?.participants.find((participant) => participant.id === participantId);
  const rankedParticipants = useMemo(() => sortedParticipants(roomState?.participants || []), [roomState?.participants]);
  const selectedAnswer = roomState?.currentQuestionAnswer?.selectedAnswer || "";
  const hasAnsweredCurrentQuestion = Boolean(selectedAnswer);
  const timerPercent = roomState?.room.phase === "question" && roomState.room.timerSeconds
    ? Math.max(0, Math.min(100, (secondsRemaining / roomState.room.timerSeconds) * 100))
    : 0;

  async function refreshRoom(options: { quiet?: boolean } = {}) {
    try {
      const result = await getGroupRoom(normalizedCode, participantId);
      setRoomState(result);
      setStatus("ready");
      const syncedAt = Date.now();
      setRoomSyncedAt(syncedAt);
      setSecondsRemaining(phaseSecondsRemaining(result, syncedAt));
      if (!options.quiet) setMessage("");
    } catch {
      setStatus("error");
      if (!options.quiet) setMessage("Group room could not be loaded.");
    }
  }

  useEffect(() => {
    refreshRoom();
    QRCode.toDataURL(shareUrl, { margin: 1, width: 240, color: { dark: "#101014", light: "#ffffff" } })
      .then(setQrCode)
      .catch(() => setQrCode(""));
  }, [normalizedCode]);

  useEffect(() => {
    if (status !== "ready") return undefined;
    const isOpenRoom = roomState?.room.status === "lobby" || roomState?.room.status === "countdown" || roomState?.room.status === "active";
    const timer = window.setInterval(() => refreshRoom({ quiet: true }), isOpenRoom ? 350 : 1200);
    return () => window.clearInterval(timer);
  }, [status, normalizedCode, participantId, roomState?.room.phase]);

  useEffect(() => {
    const timer = window.setInterval(() => setSecondsRemaining(phaseSecondsRemaining(roomState, roomSyncedAt)), 250);
    return () => window.clearInterval(timer);
  }, [roomState?.room.phaseStartedAt, roomState?.room.phase, roomState?.room.currentQuestionIndex, roomSyncedAt]);

  async function handleJoin() {
    setMessage("");
    try {
      const result = await joinGroupRoom({ roomCode: normalizedCode, displayName, avatarId });
      if (result.participant?.id) {
        window.localStorage.setItem(participantStorageKey(normalizedCode), result.participant.id);
        setParticipantId(result.participant.id);
      }
      setRoomState(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not join this group room.");
    }
  }

  async function handleStartRoom() {
    if (!hostToken) return;
    setMessage("");
    try {
      const result = await startGroupRoom({ roomCode: normalizedCode, hostToken });
      setRoomState(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start this room.");
    }
  }

  async function handleRemovePlayer(id: string) {
    if (!hostToken) return;
    try {
      const result = await removeGroupRoomParticipant({ roomCode: normalizedCode, hostToken, participantId: id });
      setRoomState(result);
    } catch {
      setMessage("Player could not be removed.");
    }
  }

  async function handleCancelRoom() {
    if (!hostToken) return;
    try {
      const result = await cancelGroupRoom({ roomCode: normalizedCode, hostToken });
      setRoomState(result);
      setMessage("Room closed.");
    } catch {
      setMessage("Room could not be closed.");
    }
  }

  async function submitAnswer(option: string) {
    if (!participantId || !currentQuestion || hasAnsweredCurrentQuestion || answering) return;
    setAnswering(true);
    try {
      const result = await submitGroupRoomAnswer({ roomCode: normalizedCode, participantId, selectedAnswer: option });
      setRoomState(result);
    } catch {
      setMessage("Answer could not be saved.");
    } finally {
      setAnswering(false);
    }
  }

  async function copyShareLink() {
    await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
    setMessage("Group link copied.");
  }

  if (status === "loading") {
    return <section className="route-page group-room-page"><p className="empty-state">Loading group room...</p></section>;
  }

  if (status === "error" || !roomState) {
    return (
      <section className="route-page group-room-page">
        <p className="error-message">{message || "Group room is unavailable."}</p>
        <button className="secondary-button" onClick={() => onNavigate("/games")} type="button">Back to Flim Arcade</button>
      </section>
    );
  }

  return (
    <section className="route-page group-room-page">
      <button className="secondary-button compact" onClick={() => onNavigate(`/challenges/${roomState.room.challengeSlug}`)} type="button">
        Back to Challenge
      </button>

      <header className="group-room-hero">
        <div>
          <h1>{roomState.room.challengeName}</h1>
          <p>Room {roomState.room.roomCode} · {roomState.room.questionCount} questions · {roomStatusCopy(roomState)}</p>
        </div>
        <div className="group-room-share-card">
          {qrCode ? <img alt="Group room QR code" src={qrCode} /> : null}
          <strong>{roomState.room.roomCode}</strong>
          <button className="secondary-button compact" onClick={copyShareLink} type="button">Copy Link</button>
        </div>
      </header>

      {message ? <p className="challenge-action-status">{message}</p> : null}

      <div className="group-room-layout">
        <section className="title-games-section group-room-play-panel">
          {roomState.room.status === "lobby" ? (
            <div className="group-lobby-panel">
              <div className="actor-section-heading">
                <h2>Movie Night Lobby</h2>
                <span>{roomState.participants.length} joined</span>
              </div>
              {!participantId ? (
                <div className="group-join-card">
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Movie Night Player" />
                  </label>
                  <div className="group-avatar-picker" aria-label="Choose your player avatar">
                    {baseAvatars.slice(0, 12).map((avatar) => (
                      <button
                        className={avatar.id === avatarId ? "is-selected" : ""}
                        key={avatar.id}
                        onClick={() => setAvatarId(avatar.id)}
                        type="button"
                        aria-label={avatar.name}
                      >
                        <FilmCritterComposite avatar={avatar} />
                      </button>
                    ))}
                  </div>
                  <button className="primary-button" onClick={handleJoin} type="button">Join Room</button>
                </div>
              ) : (
                <p className="empty-state">You are in. Everyone will receive the same questions when the host starts.</p>
              )}
              {isHost ? (
                <div className="group-host-actions">
                  <button className="primary-button" disabled={roomState.participants.length === 0} onClick={handleStartRoom} type="button">
                    Start Game
                  </button>
                  <button className="secondary-button compact" onClick={handleCancelRoom} type="button">Cancel Room</button>
                </div>
              ) : (
                <p className="empty-state">Waiting for host...</p>
              )}
            </div>
          ) : null}

          {roomState.room.status === "countdown" ? (
            <div className="group-countdown-panel">
              <span>Starting in</span>
              <strong>{secondsRemaining > 0 ? secondsRemaining : "Go"}</strong>
              <p>Get ready. The first question appears for everyone at the same time.</p>
            </div>
          ) : null}

          {roomState.room.status === "active" && roomState.room.phase === "question" && currentQuestion ? (
            <div className="group-live-question">
              <div className="trivia-score-strip">
                <strong>Question {currentIndex + 1} of {roomState.room.questionCount}</strong>
                <span>{secondsRemaining}s</span>
              </div>
              <div className="trivia-progress-track" aria-label={`${secondsRemaining} seconds remaining`}>
                <span style={{ width: `${timerPercent}%` }} />
              </div>
              <article className="classic-trivia-question is-active">
                <div className="trivia-question-kicker">
                  <span>Live Room</span>
                  <small>{roomState.currentQuestionAnsweredCount || 0}/{roomState.participants.length} answered</small>
                </div>
                <h3>{currentQuestion.question}</h3>
                <div className="classic-trivia-options">
                  {currentQuestion.options.map((option) => (
                    <button
                      className={selectedAnswer === option ? "is-selected" : ""}
                      disabled={hasAnsweredCurrentQuestion || answering || !participantId}
                      key={option}
                      onClick={() => submitAnswer(option)}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </article>
              {hasAnsweredCurrentQuestion ? <p className="empty-state">Answer locked. Waiting for the reveal.</p> : null}
              {!participantId ? <p className="empty-state">Join before the next round to answer.</p> : null}
            </div>
          ) : null}

          {roomState.room.status === "active" && roomState.room.phase === "reveal" && currentQuestion ? (
            <div className="group-reveal-panel">
              <span>Correct Answer</span>
              <h2>{currentQuestion.answer}</h2>
              {currentQuestion.explanation ? <p>{currentQuestion.explanation}</p> : null}
              {roomState.currentQuestionAnswer ? (
                <strong>{roomState.currentQuestionAnswer.isCorrect ? `+${roomState.currentQuestionAnswer.score} points` : "No points this round"}</strong>
              ) : null}
            </div>
          ) : null}

          {roomState.room.status === "active" && roomState.room.phase === "leaderboard" ? (
            <div className="group-leaderboard-panel">
              <span>Leaderboard</span>
              <h2>After Question {currentIndex + 1}</h2>
              <ol className="challenge-standing-list group-player-list">
                {rankedParticipants.map((participant, index) => (
                  <li key={`live-${participant.id}`}>
                    <span>#{index + 1}</span>
                    <strong>{participant.displayName}</strong>
                    <em>{participant.score} pts</em>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          {roomState.room.status === "completed" ? (
            <div className="group-final-panel">
              <div className="trivia-completion-burst" aria-hidden="true">
                <span /><span /><span />
              </div>
              <span>Final Results</span>
              <h2>{rankedParticipants[0]?.displayName || "Movie Night"} wins!</h2>
              <p>{rankedParticipants[0] ? `${rankedParticipants[0].score} points · ${rankedParticipants[0].correctCount}/${roomState.room.questionCount} correct` : "Thanks for playing."}</p>
              <button className="secondary-button compact" onClick={() => onNavigate("/games")} type="button">Back to Flim Arcade</button>
            </div>
          ) : null}

          {roomState.room.status === "expired" ? (
            <div className="group-final-panel">
              <span>Room Closed</span>
              <h2>This room is no longer active.</h2>
              <button className="secondary-button compact" onClick={() => onNavigate("/games")} type="button">Back to Flim Arcade</button>
            </div>
          ) : null}
        </section>

        <aside className="challenge-standings-panel">
          <section>
            <h2>Players</h2>
            {roomState.participants.length ? (
              <ol className="challenge-standing-list group-player-list">
                {roomState.participants.map((participant) => (
                  <li className={participant.isWinner ? "is-winner" : ""} key={participant.id}>
                    <span className="group-player-avatar"><FilmCritterComposite avatar={avatarForParticipant(participant)} /></span>
                    <strong>{participant.displayName}</strong>
                    <em>{participant.score ? `${participant.score} pts` : "Ready"}</em>
                    {isHost && roomState.room.status === "lobby" ? (
                      <button aria-label={`Remove ${participant.displayName}`} onClick={() => handleRemovePlayer(participant.id)} type="button">Remove</button>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : <p className="empty-state">No players yet. Share the QR code or link.</p>}
          </section>
          <section>
            <h2>Scoreboard</h2>
            {rankedParticipants.length ? (
              <ol className="challenge-standing-list">
                {rankedParticipants.slice(0, 10).map((participant, index) => (
                  <li className={participant.isWinner ? "is-winner" : ""} key={`score-${participant.id}`}>
                    <span>{participant.isWinner ? "Winner" : `#${index + 1}`}</span>
                    <strong>{participant.displayName}</strong>
                    <em>{participant.score} pts</em>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-state">Scores appear after the first question.</p>}
          </section>
          {roomState.room.status === "completed" ? (
            <section>
              <h2>Stats</h2>
              <div className="group-stat-grid">
                <span>{rankedParticipants[0]?.correctCount || 0}<small>Winner correct</small></span>
                <span>{rankedParticipants[0]?.longestCorrectStreak || 0}<small>Best streak</small></span>
                <span>{rankedParticipants[0]?.averageAnswerTimeMs ? `${Math.round((rankedParticipants[0].averageAnswerTimeMs || 0) / 1000)}s` : "0s"}<small>Avg answer</small></span>
              </div>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
