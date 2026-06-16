import { useEffect, useMemo, useState } from "react";
import { ShareAssetButton } from "../components/ShareAssetButton";
import {
  getSeasonalChallengeDetail,
  joinSeasonalChallenge,
  submitSeasonalChallengeAttempt,
} from "../services/seasonalChallengeService";
import type { SeasonalChallengeDetail, SeasonalChallengeQuestion, SeasonalChallengeScore } from "../types";

interface ChallengeDetailsProps {
  slug: string;
  onNavigate: (path: string) => void;
}

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
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [resultCardUrl, setResultCardUrl] = useState("");
  const score = useMemo(() => scoreTrivia(detail?.questions || [], answers), [detail?.questions, answers]);
  const allAnswered = Boolean(detail?.questions.length) && detail!.questions.every((question) => answers[question.id]);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setAnswers({});
    setCompleted(false);
    setActionMessage("");
    setResultCardUrl("");
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

  async function handleSubmit() {
    if (!detail || !allAnswered) return;
    setSubmitting(true);
    setActionMessage("");
    try {
      const result = await submitSeasonalChallengeAttempt({
        eventId: detail.event.id,
        questionIds: detail.questions.map((question) => question.id),
        answers,
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
  const canPlay = event.dateStatus === "active" && questions.length > 0;

  return (
    <section className="route-page challenge-detail-page">
      <button className="secondary-button compact" onClick={() => onNavigate("/challenges")} type="button">
        Back to Challenges
      </button>

      <header className={`challenge-landing-hero theme-${event.banner || event.seasonKey || "general"}`}>
        <div className="challenge-landing-copy">
          <span>{challengeTypeLabel(event.challengeType)}</span>
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
                <strong>{completed ? `${score.score} points` : "Challenge Pack"}</strong>
                <span>{completed ? `${score.correctCount}/${score.totalCount} correct` : "Answer the same challenge pack as other players."}</span>
              </div>
              <div className="classic-trivia-list">
                {questions.map((question, index) => (
                  <article className="classic-trivia-question" key={question.id}>
                    <span>Question {index + 1}</span>
                    <h3>{question.question}</h3>
                    <div className="classic-trivia-options">
                      {question.options.map((option) => {
                        const selected = answers[question.id] === option;
                        const isCorrect = completed && option === question.answer;
                        const isWrong = completed && selected && option !== question.answer;
                        return (
                          <button
                            className={`${selected ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}`}
                            disabled={completed}
                            key={option}
                            onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                            type="button"
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    {completed ? <p>{question.explanation}</p> : null}
                  </article>
                ))}
              </div>
              {!completed ? (
                <button className="primary-button" disabled={!allAnswered || submitting} onClick={handleSubmit} type="button">
                  {submitting ? "Saving Score..." : "Finish Challenge"}
                </button>
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
