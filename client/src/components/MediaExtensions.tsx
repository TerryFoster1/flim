import { useState } from "react";
import { getMediaExtensions } from "../services/mediaExtensionService";
import { completeCompanionItem, getTitleTrivia, reportEasterEggHunt, reportTriviaQuestion } from "../services/triviaService";
import type { EasterEggHunt, MediaType, TriviaFeed, TriviaQuestion, TriviaReportReason } from "../types";

interface MediaExtensionsProps {
  media: {
    tmdbId: number;
    title: string;
    mediaType?: MediaType;
    posterUrl?: string;
    backdropUrl?: string;
  };
}

export function MediaExtensions({ media }: MediaExtensionsProps) {
  const extensions = getMediaExtensions(media);
  const soundtrackLink = extensions.soundtrack.soundtrack?.links[0];
  const trailerLink = extensions.videos[0];
  const trailerArtwork = trailerLink?.thumbnailUrl || media.backdropUrl || media.posterUrl;
  const [triviaFeed, setTriviaFeed] = useState<TriviaFeed | null>(null);
  const [triviaOpen, setTriviaOpen] = useState(false);
  const [triviaStatus, setTriviaStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [reportedQuestions, setReportedQuestions] = useState<Record<string, string>>({});
  const [completionStatus, setCompletionStatus] = useState<Record<string, string>>({});
  const [revealedHunts, setRevealedHunts] = useState<Record<string, boolean>>({});

  async function openTrivia() {
    setTriviaOpen((current) => !current);
    if (triviaFeed || triviaStatus === "loading") return;
    setTriviaStatus("loading");
    try {
      setTriviaFeed(await getTitleTrivia({ tmdbId: media.tmdbId, mediaType: media.mediaType }));
      setTriviaStatus("ready");
    } catch {
      setTriviaStatus("error");
    }
  }

  async function reportQuestion(question: TriviaQuestion, reason: TriviaReportReason) {
    setReportedQuestions((current) => ({ ...current, [question.id]: "Reporting..." }));
    try {
      await reportTriviaQuestion(question.id, reason);
      setReportedQuestions((current) => ({ ...current, [question.id]: "Reported. Thank you." }));
    } catch {
      setReportedQuestions((current) => ({ ...current, [question.id]: "Could not report right now." }));
    }
  }

  async function reportHunt(hunt: EasterEggHunt, reason: TriviaReportReason) {
    setReportedQuestions((current) => ({ ...current, [hunt.id]: "Reporting..." }));
    try {
      await reportEasterEggHunt(hunt.id, reason);
      setReportedQuestions((current) => ({ ...current, [hunt.id]: "Reported. Thank you." }));
    } catch {
      setReportedQuestions((current) => ({ ...current, [hunt.id]: "Could not report right now." }));
    }
  }

  async function completeItem(itemType: "trivia" | "easter_egg", itemId: string) {
    setCompletionStatus((current) => ({ ...current, [itemId]: "Saving..." }));
    try {
      const result = await completeCompanionItem(itemType, itemId);
      setTriviaFeed((current) => {
        if (!current) return current;
        return {
          ...current,
          questions: current.questions.map((question) => question.id === itemId ? { ...question, completed: true } : question),
          easterEggs: (current.easterEggs || []).map((hunt) => hunt.id === itemId ? { ...hunt, completed: true } : hunt),
          progress: result.progress,
          achievements: result.achievements,
          unlockedAchievements: result.unlockedAchievements,
        };
      });
      setCompletionStatus((current) => ({ ...current, [itemId]: result.unlockedAchievements.length > 0 ? `Unlocked: ${result.unlockedAchievements[0].name}` : "Completed." }));
    } catch (error) {
      setCompletionStatus((current) => ({ ...current, [itemId]: error instanceof Error && error.message.includes("Sign in") ? "Sign in to save progress." : "Could not save progress." }));
    }
  }

  return (
    <section className="media-extensions" aria-label={`Media extensions for ${media.title}`}>
      <div className="media-extension-heading">
        <h2>Keep exploring</h2>
      </div>

      <div className="media-extension-grid">
        <a
          className="media-extension-card media-extension-card-action trailer-card"
          href={trailerLink?.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Watch ${media.title} trailer on YouTube`}
        >
          <div className="extension-art trailer-art" aria-hidden="true">
            {trailerArtwork ? <img alt="" src={trailerArtwork} /> : <span />}
            <strong>Play</strong>
          </div>
          <div>
            <h3>Official Trailer</h3>
            <p>Open trailer results on YouTube.</p>
          </div>
        </a>

        <a
          className="media-extension-card media-extension-card-action soundtrack-card compact-extension-card"
          href={soundtrackLink?.url}
          rel="noreferrer"
          target="_blank"
          aria-label={`Listen to ${media.title} soundtrack on Spotify`}
        >
          <div className="compact-extension-copy">
            <h3>Listen to the soundtrack</h3>
            <span className="round-media-link spotify-link" aria-hidden="true">
              <img alt="" src="/provider-icons/spotify.png" />
            </span>
            <p>{soundtrackLink ? extensions.soundtrack.notes : "Soundtrack not available yet."}</p>
          </div>
        </a>

        <button className="media-extension-card media-extension-card-action trivia-card reset-button" onClick={openTrivia} type="button" aria-expanded={triviaOpen} aria-label={`Open trivia and facts for ${media.title}`}>
          <div className="extension-art trivia-art" aria-hidden="true">
            <span />
            <strong>?</strong>
          </div>
          <div>
            <h3>Trivia & Facts</h3>
            <p>{triviaStatus === "loading" ? "Loading cached trivia..." : "Source-grounded questions and facts."}</p>
          </div>
        </button>
      </div>

      {triviaOpen ? (
        <div className="trivia-panel">
          {triviaStatus === "loading" ? <p className="empty-state">Checking cached trivia...</p> : null}
          {triviaStatus === "error" ? <p className="empty-state">Trivia coming soon.</p> : null}
          {triviaFeed ? (
            <div className="companion-progress-card">
              <div>
                <strong>{triviaFeed.progress?.completionPercent || 0}% complete</strong>
                <span>{triviaFeed.progress?.triviaCompleted || 0}/{triviaFeed.progress?.triviaTotal || 0} trivia / {triviaFeed.progress?.easterEggsCompleted || 0}/{triviaFeed.progress?.easterEggsTotal || 0} hunts</span>
              </div>
              {triviaFeed.achievements?.filter((achievement) => achievement.unlockedAt).slice(0, 3).map((achievement) => (
                <span className="achievement-pill is-unlocked" key={achievement.id}>{achievement.name}</span>
              ))}
            </div>
          ) : null}
          {triviaFeed && triviaFeed.questions.length === 0 && (triviaFeed.easterEggs || []).length === 0 ? (
            <p className="empty-state">{triviaFeed.notes || "Trivia coming soon."}</p>
          ) : null}
          {triviaFeed?.unlockedAchievements && triviaFeed.unlockedAchievements.length > 0 ? (
            <div className="achievement-unlock-card">
              <strong>Achievement unlocked</strong>
              <span>{triviaFeed.unlockedAchievements[0].name}</span>
              <small>{triviaFeed.unlockedAchievements[0].points || 0} points</small>
            </div>
          ) : null}
          {triviaFeed?.questions.map((question) => {
            const selected = selectedAnswers[question.id];
            const answered = Boolean(selected);
            const correct = selected === question.answer;
            return (
              <article className="trivia-question-card" key={question.id}>
                <div className="trivia-question-heading">
                  <h3>{question.question}</h3>
                  <span>{question.difficulty}</span>
                </div>
                <div className="trivia-options">
                  {question.options.map((option) => (
                    <button
                      className={[
                        "trivia-option",
                        answered && option === question.answer ? "is-correct" : "",
                        answered && option === selected && !correct ? "is-incorrect" : "",
                        question.completed ? "is-completed" : "",
                      ].filter(Boolean).join(" ")}
                      disabled={answered}
                      key={option}
                      onClick={() => {
                        setSelectedAnswers((current) => ({ ...current, [question.id]: option }));
                        if (option === question.answer && !question.completed) void completeItem("trivia", question.id);
                      }}
                      type="button"
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {answered ? (
                  <p className={correct ? "trivia-feedback is-correct" : "trivia-feedback is-incorrect"}>
                    {correct ? "Correct." : `Answer: ${question.answer}.`} {question.explanation}
                  </p>
                ) : null}
                {question.completed || completionStatus[question.id] ? (
                  <p className="companion-completion-status">{completionStatus[question.id] || "Completed."}</p>
                ) : null}
                <div className="trivia-source-row">
                  <span>{question.sourceLabels[0] || "Known title metadata"}</span>
                  <select
                    aria-label="Report trivia question"
                    onChange={(event) => {
                      const reason = event.target.value as TriviaReportReason;
                      if (reason) void reportQuestion(question, reason);
                      event.currentTarget.value = "";
                    }}
                    value=""
                  >
                    <option value="">Report question</option>
                    <option value="wrong_answer">Wrong answer</option>
                    <option value="confusing">Confusing</option>
                    <option value="spoiler">Spoiler</option>
                    <option value="low_quality">Low quality</option>
                    <option value="inappropriate">Inappropriate</option>
                  </select>
                </div>
                {reportedQuestions[question.id] ? <p className="trivia-report-status">{reportedQuestions[question.id]}</p> : null}
              </article>
            );
          })}
          {(triviaFeed?.easterEggs || []).length > 0 ? (
            <div className="easter-egg-section">
              <div className="trivia-question-heading">
                <h3>Easter Egg Hunts</h3>
                <span>{triviaFeed?.progress?.easterEggsCompleted || 0}/{triviaFeed?.progress?.easterEggsTotal || 0}</span>
              </div>
              {(triviaFeed?.easterEggs || []).map((hunt) => {
                const revealed = revealedHunts[hunt.id];
                return (
                  <article className={hunt.completed ? "easter-egg-card is-completed" : "easter-egg-card"} key={hunt.id}>
                    <div className="trivia-question-heading">
                      <h3>{hunt.title}</h3>
                      <span>{hunt.difficulty}</span>
                    </div>
                    <p>{hunt.prompt}</p>
                    <p className="hunt-hint">Hint: {hunt.hint}</p>
                    {revealed ? <p className="trivia-feedback is-correct">Answer: {hunt.answer}</p> : null}
                    <div className="hunt-action-row">
                      <button className="secondary-button" onClick={() => setRevealedHunts((current) => ({ ...current, [hunt.id]: !current[hunt.id] }))} type="button">
                        {revealed ? "Hide Answer" : "Reveal Answer"}
                      </button>
                      <button className={hunt.completed ? "watched-toggle is-watched" : "watched-toggle"} disabled={hunt.completed} onClick={() => void completeItem("easter_egg", hunt.id)} type="button">
                        {hunt.completed ? "Found" : "Mark Found"}
                      </button>
                    </div>
                    {completionStatus[hunt.id] ? <p className="companion-completion-status">{completionStatus[hunt.id]}</p> : null}
                    <div className="trivia-source-row">
                      <span>{hunt.sourceLabels[0] || "Known title metadata"}</span>
                      <select
                        aria-label="Report Easter Egg Hunt"
                        onChange={(event) => {
                          const reason = event.target.value as TriviaReportReason;
                          if (reason) void reportHunt(hunt, reason);
                          event.currentTarget.value = "";
                        }}
                        value=""
                      >
                        <option value="">Report hunt</option>
                        <option value="wrong_answer">Wrong answer</option>
                        <option value="confusing">Confusing</option>
                        <option value="spoiler">Spoiler</option>
                        <option value="low_quality">Low quality</option>
                        <option value="inappropriate">Inappropriate</option>
                      </select>
                    </div>
                    {reportedQuestions[hunt.id] ? <p className="trivia-report-status">{reportedQuestions[hunt.id]}</p> : null}
                  </article>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
