import { useEffect, useMemo, useState } from "react";
import { BrandMark } from "../components/BrandMark";
import { getFriendChallenge, submitFriendChallengeAttempt } from "../services/friendChallengeService";
import type { FriendChallengeAttemptResult, FriendTriviaChallenge } from "../types";

interface FriendChallengeProps {
  token: string;
  onNavigate: (path: string) => void;
}

function resultLabel(result?: FriendChallengeAttemptResult) {
  if (!result) return "";
  if (result.result === "won") return "You won";
  if (result.result === "tie") return "It's a tie";
  return "You lost";
}

export function FriendChallenge({ token, onNavigate }: FriendChallengeProps) {
  const [challenge, setChallenge] = useState<FriendTriviaChallenge | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState<FriendChallengeAttemptResult | null>(null);
  const allAnswered = useMemo(
    () => Boolean(challenge?.questions.length) && challenge!.questions.every((question) => answers[question.id]),
    [answers, challenge],
  );

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setError("");
    setResult(null);
    setAnswers({});
    getFriendChallenge(token)
      .then((payload) => {
        if (!mounted) return;
        setChallenge(payload.challenge);
        setStatus("ready");
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Challenge unavailable.");
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  async function submitAttempt() {
    if (!challenge || !allAnswered) return;
    setError("");
    try {
      setResult(await submitFriendChallengeAttempt(token, { answers }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your score.");
    }
  }

  return (
    <section className="route-page friend-challenge-page">
      <header className="title-games-header">
        <button className="title-games-brand reset-button" onClick={() => onNavigate("/")} type="button">
          <BrandMark />
          <span>Flim</span>
        </button>
        <button className="title-games-close" onClick={() => onNavigate("/games")} type="button" aria-label="Close challenge">
          X
        </button>
      </header>

      {status === "loading" ? <p className="empty-state">Loading challenge...</p> : null}
      {status === "error" ? (
        <div className="media-extension-card">
          <h1>Challenge unavailable</h1>
          <p>{error || "This challenge could not be loaded."}</p>
          <button className="primary-button" onClick={() => onNavigate("/games")} type="button">Flim Arcade</button>
        </div>
      ) : null}

      {challenge ? (
        <>
          <section className="friend-challenge-hero">
            <span>Friend Challenge</span>
            <h1>Think you know {challenge.title}?</h1>
            <p>{challenge.challengerName} scored {challenge.score}. Can you beat it?</p>
            <div className="challenge-card-meta">
              <span>{challenge.correctCount} / {challenge.totalCount} correct</span>
              <span>{challenge.attempts} attempts</span>
              <span>{challenge.bestFriendScore > 0 ? `Best friend score: ${challenge.bestFriendScore}` : "No friend scores yet"}</span>
            </div>
          </section>

          <section className="title-games-section classic-trivia-play">
            {challenge.questions.map((question, index) => {
              const answerForQuestion = result?.questions.find((item) => item.id === question.id)?.answer;
              const explanation = result?.questions.find((item) => item.id === question.id)?.explanation;
              return (
                <article className="classic-trivia-question" key={question.id}>
                  <span>Question {index + 1}</span>
                  <h3>{question.question}</h3>
                  <div className="classic-trivia-options">
                    {question.options.map((option) => {
                      const selected = answers[question.id] === option;
                      const isCorrect = result && option === answerForQuestion;
                      const isWrong = result && selected && option !== answerForQuestion;
                      return (
                        <button
                          className={`${selected ? "is-selected" : ""} ${isCorrect ? "is-correct" : ""} ${isWrong ? "is-wrong" : ""}`}
                          disabled={Boolean(result)}
                          key={option}
                          onClick={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                          type="button"
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {result && explanation ? <p>{explanation}</p> : null}
                </article>
              );
            })}

            {result ? (
              <div className="friend-challenge-result">
                <span>{resultLabel(result)}</span>
                <h2>{result.score} points</h2>
                <p>
                  Challenge score: {result.challengeScore}. Difference: {result.difference > 0 ? "+" : ""}{result.difference}.
                </p>
              </div>
            ) : (
              <button className="primary-button" disabled={!allAnswered} onClick={submitAttempt} type="button">
                Submit Score
              </button>
            )}
            {error ? <p className="error-message">{error}</p> : null}
          </section>
        </>
      ) : null}
    </section>
  );
}
