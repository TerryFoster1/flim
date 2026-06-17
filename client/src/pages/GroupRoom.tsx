import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { getGroupRoom, joinGroupRoom, startGroupRoom, submitGroupRoomAnswers } from "../services/groupRoomService";
import type { GroupRoomState, SeasonalChallengeQuestion } from "../types";

interface GroupRoomProps {
  roomCode: string;
  onNavigate: (path: string) => void;
}

type RoomPlayState = "lobby" | "ready" | "countdown" | "playing" | "summary" | "submitted";

const secondsPerQuestion = 20;

function scoreQuestions(questions: SeasonalChallengeQuestion[], answers: Record<string, string>) {
  const correctCount = questions.reduce((count, question) => count + (answers[question.id] === question.answer ? 1 : 0), 0);
  return {
    correctCount,
    score: correctCount * 100,
    totalCount: questions.length,
  };
}

function participantStorageKey(roomCode: string) {
  return `flim-group-participant-${roomCode}`;
}

function hostStorageKey(roomCode: string) {
  return `flim-group-host-${roomCode}`;
}

export function GroupRoom({ roomCode, onNavigate }: GroupRoomProps) {
  const normalizedCode = roomCode.toUpperCase();
  const [roomState, setRoomState] = useState<GroupRoomState | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [participantId, setParticipantId] = useState(() => window.localStorage.getItem(participantStorageKey(normalizedCode)) || "");
  const [hostToken, setHostToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const queryToken = params.get("hostToken") || "";
    const savedToken = window.localStorage.getItem(hostStorageKey(normalizedCode)) || "";
    return queryToken || savedToken;
  });
  const [qrCode, setQrCode] = useState("");
  const [playState, setPlayState] = useState<RoomPlayState>("lobby");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answerTimes, setAnswerTimes] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const [secondsRemaining, setSecondsRemaining] = useState(secondsPerQuestion);
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const shareUrl = `${window.location.origin}/group/${normalizedCode}`;
  const currentParticipant = roomState?.participants.find((participant) => participant.id === participantId);
  const isHost = Boolean(hostToken);
  const questions = roomState?.questions || [];
  const currentQuestion = questions[currentIndex];
  const score = useMemo(() => scoreQuestions(questions, answers), [answers, questions]);
  const progressPercent = questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0;

  async function refreshRoom(options: { quiet?: boolean } = {}) {
    try {
      const result = await getGroupRoom(normalizedCode);
      setRoomState(result);
      setStatus("ready");
      if (result.room.status === "active" && playState === "lobby" && participantId) setPlayState("ready");
      if ((result.room.status === "completed" || result.room.status === "expired") && playState !== "submitted") setPlayState("submitted");
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
    const timer = window.setInterval(() => refreshRoom({ quiet: true }), 3000);
    return () => window.clearInterval(timer);
  }, [status, normalizedCode, participantId, playState]);

  useEffect(() => {
    if (playState !== "countdown") return undefined;
    if (countdown <= 0) {
      setPlayState("playing");
      setSecondsRemaining(secondsPerQuestion);
      setQuestionStartedAt(Date.now());
      setCountdown(3);
      return undefined;
    }
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, playState]);

  useEffect(() => {
    if (playState !== "playing") return undefined;
    const timer = window.setTimeout(() => {
      if (secondsRemaining <= 1) {
        recordAnswer("");
        return;
      }
      setSecondsRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [playState, secondsRemaining, currentIndex]);

  async function handleJoin() {
    setMessage("");
    try {
      const result = await joinGroupRoom({ roomCode: normalizedCode, displayName });
      if (result.participant?.id) {
        window.localStorage.setItem(participantStorageKey(normalizedCode), result.participant.id);
        setParticipantId(result.participant.id);
      }
      setRoomState(result);
      setPlayState(result.room.status === "active" ? "ready" : "lobby");
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
      setPlayState(participantId ? "ready" : "lobby");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start this room.");
    }
  }

  async function copyShareLink() {
    await navigator.clipboard?.writeText(shareUrl).catch(() => undefined);
    setMessage("Group link copied.");
  }

  function beginLocalRound() {
    setAnswers({});
    setAnswerTimes({});
    setCurrentIndex(0);
    setSecondsRemaining(secondsPerQuestion);
    setCountdown(3);
    setMessage("");
    setPlayState("countdown");
  }

  function moveToNextQuestion() {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((index) => index + 1);
      setSecondsRemaining(secondsPerQuestion);
      setQuestionStartedAt(Date.now());
      return;
    }
    setPlayState("summary");
  }

  function recordAnswer(option: string) {
    if (!currentQuestion || playState !== "playing") return;
    const elapsed = questionStartedAt ? Date.now() - questionStartedAt : 0;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: option }));
    setAnswerTimes((current) => ({ ...current, [currentQuestion.id]: elapsed }));
    window.setTimeout(moveToNextQuestion, option ? 250 : 0);
  }

  async function submitRoomScore() {
    if (!participantId) return;
    setSubmitting(true);
    setMessage("");
    try {
      const result = await submitGroupRoomAnswers({ roomCode: normalizedCode, participantId, answers, answerTimes });
      setRoomState(result);
      setPlayState("submitted");
      setMessage("Score saved to the room scoreboard.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your group score.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <section className="route-page group-room-page"><p className="empty-state">Loading group room...</p></section>;
  }

  if (status === "error" || !roomState) {
    return (
      <section className="route-page group-room-page">
        <p className="error-message">{message || "Group room is unavailable."}</p>
        <button className="secondary-button" onClick={() => onNavigate("/challenges")} type="button">Back to Challenges</button>
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
          <span>Friends & Family Room</span>
          <h1>{roomState.room.challengeName}</h1>
          <p>Room {roomState.room.roomCode} · {roomState.room.questionCount} questions · {roomState.room.status}</p>
        </div>
        <div className="group-room-share-card">
          {qrCode ? <img alt="Group room QR code" src={qrCode} /> : null}
          <button className="secondary-button compact" onClick={copyShareLink} type="button">Copy Link</button>
        </div>
      </header>

      {message ? <p className="challenge-action-status">{message}</p> : null}

      <div className="group-room-layout">
        <section className="title-games-section group-room-play-panel">
          {roomState.room.status === "waiting" ? (
            <>
              <div className="actor-section-heading">
                <h2>Waiting Room</h2>
                <span>{roomState.participants.length} joined</span>
              </div>
              {!participantId ? (
                <div className="group-join-card">
                  <label>
                    Display name
                    <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Movie Night Player" />
                  </label>
                  <button className="primary-button" onClick={handleJoin} type="button">Join Room</button>
                </div>
              ) : (
                <p className="empty-state">You are in. The host can start when everyone is ready.</p>
              )}
              {isHost ? (
                <button className="primary-button" disabled={roomState.participants.length === 0} onClick={handleStartRoom} type="button">
                  Start Game
                </button>
              ) : null}
            </>
          ) : null}

          {roomState.room.status === "active" && !participantId ? (
            <div className="group-join-card">
              <h2>Join this round</h2>
              <label>
                Display name
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Movie Night Player" />
              </label>
              <button className="primary-button" onClick={handleJoin} type="button">Join Room</button>
            </div>
          ) : null}

          {roomState.room.status === "active" && participantId ? (
            <>
              {playState === "ready" || playState === "lobby" ? (
                <div className="trivia-start-card">
                  <span>Room is live</span>
                  <h3>Start Your Round</h3>
                  <p>Everyone gets the same questions. Each question has 20 seconds, then the room scoreboard decides the winner.</p>
                  <button className="primary-button" onClick={beginLocalRound} type="button">Start Round</button>
                </div>
              ) : null}
              {playState === "countdown" ? (
                <div className="trivia-start-card">
                  <span>Starting in</span>
                  <strong>{countdown > 0 ? countdown : "Go"}</strong>
                </div>
              ) : null}
              {playState === "playing" && currentQuestion ? (
                <>
                  <div className="trivia-score-strip">
                    <strong>Question {currentIndex + 1} of {questions.length}</strong>
                    <span>{secondsRemaining}s left</span>
                  </div>
                  <div className="trivia-progress-track" aria-label={`Question ${currentIndex + 1} of ${questions.length}`}>
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                  <article className="classic-trivia-question is-active">
                    <div className="trivia-question-kicker">
                      <span>Group Round</span>
                      <small>{secondsRemaining}s</small>
                    </div>
                    <h3>{currentQuestion.question}</h3>
                    <div className="classic-trivia-options">
                      {currentQuestion.options.map((option) => (
                        <button key={option} onClick={() => recordAnswer(option)} type="button">
                          {option}
                        </button>
                      ))}
                    </div>
                  </article>
                </>
              ) : null}
              {playState === "summary" ? (
                <div className="trivia-round-summary">
                  <span>Round complete</span>
                  <h2>{score.score} points</h2>
                  <p>{score.correctCount}/{score.totalCount} correct. Save it to the room scoreboard.</p>
                  <button className="primary-button" disabled={submitting} onClick={submitRoomScore} type="button">
                    {submitting ? "Saving..." : "Save To Scoreboard"}
                  </button>
                </div>
              ) : null}
              {playState === "submitted" ? (
                <div className="trivia-completion-card is-strong">
                  <div>
                    <span>Scoreboard Updated</span>
                    <h3>{currentParticipant?.isWinner ? "Trivia King" : "Score Saved"}</h3>
                    <p>{currentParticipant ? `${currentParticipant.score} points · ${currentParticipant.correctCount}/${questions.length} correct` : "Your score has been saved."}</p>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <aside className="challenge-standings-panel">
          <section>
            <h2>Players</h2>
            {roomState.participants.length ? (
              <ol className="challenge-standing-list group-player-list">
                {roomState.participants.map((participant, index) => (
                  <li className={participant.isWinner ? "is-winner" : ""} key={participant.id}>
                    <span>{participant.completedAt ? `#${index + 1}` : "Ready"}</span>
                    <strong>{participant.displayName}</strong>
                    <em>{participant.completedAt ? `${participant.score} pts` : "Waiting"}</em>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-state">No players yet. Share the QR code or link.</p>}
          </section>
          <section>
            <h2>Room Scoreboard</h2>
            {roomState.participants.some((participant) => participant.completedAt) ? (
              <ol className="challenge-standing-list">
                {roomState.participants.filter((participant) => participant.completedAt).map((participant, index) => (
                  <li className={participant.isWinner ? "is-winner" : ""} key={`score-${participant.id}`}>
                    <span>{participant.isWinner ? "Winner" : `#${index + 1}`}</span>
                    <strong>{participant.displayName}</strong>
                    <em>{participant.correctCount}/{questions.length}</em>
                  </li>
                ))}
              </ol>
            ) : <p className="empty-state">Scores appear as players finish.</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
