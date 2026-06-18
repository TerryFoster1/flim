import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ShareAssetButton } from "../components/ShareAssetButton";
import {
  getSeasonalChallengeDetail,
  joinSeasonalChallenge,
  submitSeasonalChallengeAttempt,
} from "../services/seasonalChallengeService";
import { createGroupRoom } from "../services/groupRoomService";
import type { SeasonalChallengeDetail, SeasonalChallengeQuestion, SeasonalChallengeScore } from "../types";

interface ChallengeDetailsProps {
  slug: string;
  onNavigate: (path: string) => void;
}

type ChallengePlayState = "setup" | "countdown" | "playing" | "summary";

const CHALLENGE_SECONDS_PER_QUESTION = 20;

function dateRange(startDate: string, endDate: string) {
  const formatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(`${startDate}T12:00:00`))} - ${formatter.format(new Date(`${endDate}T12:00:00`))}`;
}

function challengeTypeLabel(type?: string) {
  if (type === "weekly") return "Weekly Challenge";
  if (type === "monthly") return "Monthly Challenge";
  if (type === "special_event") return "Special Event";
  return "Seasonal Challenge";
}

function scoreTrivia(questions: SeasonalChallengeQuestion[], answers: Record<string, string>) {
  const correctCount = questions.reduce((count, question) => count + (answers[question.id] === question.answer ? 1 : 0), 0);
  return {
    correctCount,
    totalCount: questions.length,
    score: correctCount * 100,
  };
}

function challengeResultState(correctCount: number, totalCount: number) {
  if (totalCount > 0 && correctCount === totalCount) return "perfect";
  const percent = totalCount > 0 ? correctCount / totalCount : 0;
  if (percent >= 0.75) return "strong";
  if (percent >= 0.45) return "complete";
  return "low";
}

function challengeResultHeadline(correctCount: number, totalCount: number) {
  const state = challengeResultState(correctCount, totalCount);
  if (state === "perfect") return "Perfect Score!";
  if (state === "strong") return "Movie Buff";
  if (state === "complete") return "Challenge Complete";
  return "Try again?";
}

function StandingRow({ score }: { score: SeasonalChallengeScore }) {
  return (
    <li>
      <span>{score.rank ? `#${score.rank}` : "Score"}</span>
      <strong>{score.displayName || score.handle || "Flim player"}</strong>
      <em>{score.score} pts</em>
    </li>
  );
}

export function ChallengeDetails({ slug, onNavigate }: ChallengeDetailsProps) {
  const [detail, setDetail] = useState<SeasonalChallengeDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [playState, setPlayState] = useState<ChallengePlayState>("setup");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [startCountdown, setStartCountdown] = useState(3);
  const [secondsRemaining, setSecondsRemaining] = useState(CHALLENGE_SECONDS_PER_QUESTION);
  const [groupUrl, setGroupUrl] = useState("");
  const [groupQrCode, setGroupQrCode] = useState("");
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [resultCardUrl, setResultCardUrl] = useState("");
  const [answerTimesMs, setAnswerTimesMs] = useState<Record<string, number>>({});
  const [skippedQuestionIds, setSkippedQuestionIds] = useState<Set<string>>(() => new Set());
  const [questionStartedAt, setQuestionStartedAt] = useState(0);
  const [roundStartedAt, setRoundStartedAt] = useState(0);
  const [completionTimeMs, setCompletionTimeMs] = useState(0);
  const playQuestions = useMemo(() => detail?.questions || [], [detail?.questions]);
  const score = useMemo(() => scoreTrivia(playQuestions, answers), [playQuestions, answers]);
  const currentQuestion = playQuestions[currentIndex];
  const answeredCount = playQuestions.filter((question) => answers[question.id]).length;
  const progressPercent = playQuestions.length ? ((currentIndex + 1) / playQuestions.length) * 100 : 0;

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setAnswers({});
    setPlayState("setup");
    setCurrentIndex(0);
    setStartCountdown(3);
    setSecondsRemaining(CHALLENGE_SECONDS_PER_QUESTION);
    setGroupUrl("");
    setGroupQrCode("");
    setCompleted(false);
    setActionMessage("");
    setResultCardUrl("");
    setAnswerTimesMs({});
    setSkippedQuestionIds(new Set());
    setQuestionStartedAt(0);
    setRoundStartedAt(0);
    setCompletionTimeMs(0);
    getSeasonalChallengeDetail(slug)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (playState !== "countdown") return undefined;
    if (startCountdown <= 0) {
      setPlayState("playing");
      setSecondsRemaining(CHALLENGE_SECONDS_PER_QUESTION);
      setStartCountdown(3);
      const now = Date.now();
      setRoundStartedAt(now);
      setQuestionStartedAt(now);
      return undefined;
    }
    const timer = window.setTimeout(() => setStartCountdown((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [playState, startCountdown]);

  useEffect(() => {
    if (playState !== "playing" || completed) return undefined;
    const timer = window.setTimeout(() => {
      if (secondsRemaining <= 1) {
        if (currentQuestion && !answers[currentQuestion.id]) {
          setSkippedQuestionIds((current) => new Set(current).add(currentQuestion.id));
        }
        moveToNextQuestion();
        return;
      }
      setSecondsRemaining((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [answers, completed, currentQuestion, playState, secondsRemaining, currentIndex]);

  useEffect(() => {
    if (playState === "playing" && currentQuestion) {
      setQuestionStartedAt(Date.now());
    }
  }, [currentIndex, currentQuestion, playState]);

  async function handleJoin() {
    if (!detail) return;
    setActionMessage("");
    try {
      const event = await joinSeasonalChallenge(detail.event.id);
      setDetail({ ...detail, event });
      setActionMessage("Challenge started.");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unable to start challenge.");
    }
  }

  function startChallengeRound() {
    setAnswers({});
    setCompleted(false);
    setResultCardUrl("");
    setAnswerTimesMs({});
    setSkippedQuestionIds(new Set());
    setQuestionStartedAt(0);
    setRoundStartedAt(0);
    setCompletionTimeMs(0);
    setCurrentIndex(0);
    setSecondsRemaining(CHALLENGE_SECONDS_PER_QUESTION);
    setStartCountdown(3);
    setActionMessage("");
    setPlayState("countdown");
  }

  function moveToNextQuestion() {
    if (currentIndex < playQuestions.length - 1) {
      setCurrentIndex((index) => index + 1);
      setSecondsRemaining(CHALLENGE_SECONDS_PER_QUESTION);
      return;
    }
    setPlayState("summary");
    setCompletionTimeMs(roundStartedAt ? Date.now() - roundStartedAt : 0);
    setSecondsRemaining(CHALLENGE_SECONDS_PER_QUESTION);
  }

  function answerCurrentQuestion(option: string) {
    if (!currentQuestion || playState !== "playing" || completed) return;
    const elapsed = questionStartedAt ? Math.min(CHALLENGE_SECONDS_PER_QUESTION * 1000, Math.max(0, Date.now() - questionStartedAt)) : 0;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: option }));
    setAnswerTimesMs((current) => ({ ...current, [currentQuestion.id]: elapsed }));
    setSkippedQuestionIds((current) => {
      if (!current.has(currentQuestion.id)) return current;
      const next = new Set(current);
      next.delete(currentQuestion.id);
      return next;
    });
    window.setTimeout(moveToNextQuestion, 350);
  }

  async function handleGroupPlay() {
    if (!detail) return;
    try {
      const result = await createGroupRoom({ eventId: detail.event.id, mode: "local" });
      const url = `${window.location.origin}/group/${result.room.roomCode}`;
      window.localStorage.setItem(`flim-group-host-${result.room.roomCode}`, result.hostToken);
      setGroupUrl(url);
      setActionMessage("Group room created.");
      QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: "#101014", light: "#ffffff" } })
        .then(setGroupQrCode)
        .catch(() => setGroupQrCode(""));
      onNavigate(`/group/${result.room.roomCode}?host=1`);
    } catch {
      setGroupQrCode("");
      setActionMessage("Group room could not be created. Try again.");
    }
  }

  async function copyGroupLink() {
    if (!groupUrl) return;
    await navigator.clipboard?.writeText(groupUrl).catch(() => undefined);
    setActionMessage("Group link copied.");
  }

  async function handleSubmit() {
    if (!detail || !playQuestions.length) return;
    setSubmitting(true);
    setActionMessage("");
    try {
      const result = await submitSeasonalChallengeAttempt({
        eventId: detail.event.id,
        questionIds: playQuestions.map((question) => question.id),
        answers,
        answerTimesMs,
        skippedQuestionIds: Array.from(skippedQuestionIds),
        totalTimeMs: completionTimeMs || (roundStartedAt ? Date.now() - roundStartedAt : 0),
      });
      setCompleted(true);
      setResultCardUrl(`/api/og/seasonal-challenge/${detail.event.slug}?score=${result.attempt.score}&correct=${result.attempt.correctCount}&total=${result.attempt.totalCount}&reward=${detail.event.points}&state=${challengeResultState(result.attempt.correctCount, result.attempt.totalCount)}`);
      setDetail({ ...detail, standings: result.standings });
      setActionMessage(`Score saved: ${result.attempt.score} points.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unable to save challenge score.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <section className="route-page challenge-detail-page"><p className="empty-state">Loading challenge...</p></section>;
  }

  if (status === "error" || !detail) {
    return (
      <section className="route-page challenge-detail-page">
        <p className="error-message">This challenge is unavailable right now.</p>
        <button className="secondary-button" onClick={() => onNavigate("/challenges")} type="button">Back to Challenges</button>
      </section>
    );
  }

  const { event, questions, standings } = detail;
  const canPlay = event.dateStatus === "active" && playQuestions.length > 0;

  return (
    <section className="route-page challenge-detail-page">
      <button className="secondary-button compact" onClick={() => onNavigate("/challenges")} type="button">
        Back to Challenges
      </button>

      <header className={`challenge-landing-hero theme-${event.banner || event.seasonKey || "general"}`}>
        <div className="challenge-landing-copy">
          <h1>{event.name}</h1>
          <p>{event.description}</p>
          <div className="challenge-landing-stats">
            <strong>{dateRange(event.startDate, event.endDate)}</strong>
            <span>{event.participantCount || 0} participants</span>
            <span>{event.topScore ? `Top score ${event.topScore}` : "No high score yet"}</span>
            <span>{event.points} points</span>
          </div>
          <div className="share-inline-row">
            {event.userStatus === "not_started" && event.dateStatus === "active" ? (
              <button className="primary-button" onClick={handleJoin} type="button">Join Challenge</button>
            ) : (
              <span className="challenge-action-status">{event.dateStatus === "active" ? "Challenge joined" : event.dateStatus === "upcoming" ? "Coming soon" : "Challenge ended"}</span>
            )}
            {event.dateStatus === "active" ? (
              <button className="secondary-button compact" onClick={handleGroupPlay} type="button">Play as Group</button>
            ) : null}
            <ShareAssetButton
              className="secondary-button compact"
              label="Share Challenge"
              title={event.name}
              text={event.description}
              url={detail.shareUrl}
              cardUrl={detail.shareCardUrl}
              downloadName={`${event.slug}-challenge-card.png`}
            />
          </div>
          {actionMessage ? <small>{actionMessage}</small> : null}
          {groupUrl ? (
            <div className="group-challenge-share">
              <div>
                <strong>Group challenge link</strong>
                <p>Players can open this link or scan the QR code to join this challenge and submit to the scoreboard.</p>
                <button className="secondary-button compact" onClick={copyGroupLink} type="button">Copy Group Link</button>
              </div>
              {groupQrCode ? <img alt="Group challenge QR code" src={groupQrCode} /> : null}
            </div>
          ) : null}
        </div>
      </header>

      <div className="challenge-detail-layout">
        <section className="title-games-section classic-trivia-play">
          <div className="actor-section-heading">
            <h2>Play Challenge</h2>
            <span>{questions.length ? `${questions.length} questions` : "Trivia preparing"}</span>
          </div>
          {!canPlay ? (
            <p className="empty-state">
              {event.dateStatus === "upcoming"
                ? "This challenge has not started yet."
                : event.dateStatus === "ended"
                  ? "This challenge has ended."
                  : "This challenge pack is still being prepared."}
            </p>
          ) : (
            <>
              <div className="trivia-score-strip">
                <strong>{completed ? `${score.score} points` : playState === "playing" ? `Question ${currentIndex + 1} of ${playQuestions.length}` : "Challenge Round"}</strong>
                <span>{completed ? `${score.correctCount}/${score.totalCount} correct` : playState === "playing" ? `${secondsRemaining}s left` : `${answeredCount}/${playQuestions.length} answered`}</span>
              </div>
              {!completed && playState === "setup" ? (
                <div className="trivia-start-card">
                  <span>{playQuestions.length} question round</span>
                  <h3>Start Challenge</h3>
                  <p>After the countdown, each question has 20 seconds. Miss the clock and that question scores zero.</p>
                  <button className="primary-button" onClick={startChallengeRound} type="button">Start Challenge</button>
                </div>
              ) : null}
              {!completed && playState === "countdown" ? (
                <div className="trivia-start-card">
                  <span>Starting in</span>
                  <strong>{startCountdown > 0 ? startCountdown : "Go"}</strong>
                </div>
              ) : null}
              {!completed && playState === "playing" && currentQuestion ? (
                <>
                  <div className="trivia-progress-track" aria-label={`Question ${currentIndex + 1} of ${playQuestions.length}`}>
                    <span style={{ width: `${progressPercent}%` }} />
                  </div>
                  <article className="classic-trivia-question is-active" key={currentQuestion.id}>
                    <div className="trivia-question-kicker">
                      <span>Question {currentIndex + 1} of {playQuestions.length}</span>
                      <small>{secondsRemaining}s</small>
                    </div>
                    <h3>{currentQuestion.question}</h3>
                    <div className="classic-trivia-options">
                      {currentQuestion.options.map((option) => (
                        <button
                          className={answers[currentQuestion.id] === option ? "is-selected" : ""}
                          key={option}
                          onClick={() => answerCurrentQuestion(option)}
                          type="button"
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </article>
                </>
              ) : null}
              {!completed && playState === "summary" ? (
                <div className="trivia-round-summary">
                  <span>Round complete</span>
                  <h2>Save your score?</h2>
                  <p>{score.correctCount}/{score.totalCount} correct. Unanswered questions count as zero.</p>
                  <div className="share-inline-row">
                    <button className="secondary-button" onClick={startChallengeRound} type="button">Play Again</button>
                    <button className="primary-button" disabled={submitting} onClick={handleSubmit} type="button">
                      {submitting ? "Saving Score..." : "Save Score"}
                    </button>
                  </div>
                </div>
              ) : resultCardUrl ? (
                <div className={`trivia-completion-card is-${challengeResultState(score.correctCount, score.totalCount)}`}>
                  <div className="trivia-completion-burst" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="trivia-completion-hero-row">
                    <img alt="" src="/avatars/base/star.png" />
                    <div>
                      <span>{challengeTypeLabel(event.challengeType)} Complete</span>
                      <h3>{challengeResultHeadline(score.correctCount, score.totalCount)}</h3>
                      <p>{score.correctCount}/{score.totalCount} correct - {score.score} points - +{event.points} challenge points</p>
                    </div>
                  </div>
                  <div className="share-inline-row trivia-result-actions">
                    <ShareAssetButton
                      className="primary-button compact"
                      label="Share Result"
                      title={`${event.name} Result`}
                      text={`I scored ${score.score} in ${event.name}. Can you beat me?`}
                      url={detail.shareUrl}
                      cardUrl={resultCardUrl}
                      downloadName={`${event.slug}-${score.score}-result-card.png`}
                    />
                    <button className="secondary-button compact" onClick={() => onNavigate("/challenges")} type="button">Back to Challenges</button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </section>

        <aside className="challenge-standings-panel">
          <section>
            <h2>Standings</h2>
            {standings.topScores.length ? (
              <ol className="challenge-standing-list">
                {standings.topScores.map((item) => <StandingRow key={item.id} score={item} />)}
              </ol>
            ) : <p className="empty-state">No scores yet. Be the first to set one.</p>}
          </section>
          <section>
            <h2>Recent Participants</h2>
            {standings.recentParticipants.length ? (
              <ol className="challenge-standing-list">
                {standings.recentParticipants.slice(0, 5).map((item) => <StandingRow key={item.id} score={item} />)}
              </ol>
            ) : <p className="empty-state">No recent attempts yet.</p>}
          </section>
          {standings.personalBest ? (
            <section className="personal-best-card">
              <span>Personal Best</span>
              <strong>{standings.personalBest.score} points</strong>
              <small>{standings.personalBest.correctCount}/{standings.personalBest.totalCount} correct</small>
            </section>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
