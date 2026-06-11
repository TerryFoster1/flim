import { useState } from "react";
import { getMediaExtensions } from "../services/mediaExtensionService";
import { completeCompanionItem, getTitleTrivia, reportEasterEggHunt, reportTriviaQuestion, updateEasterEggHunt } from "../services/triviaService";
import type { EasterEggHunt, MediaType, TriviaFeed, TriviaQuestion, TriviaReportReason } from "../types";

interface MediaExtensionsProps {
  media: {
    tmdbId: number;
    title: string;
    mediaType?: MediaType;
    posterUrl?: string;
    backdropUrl?: string;
  };
  onNavigate?: (path: string) => void;
}

export function MediaExtensions({ media, onNavigate }: MediaExtensionsProps) {
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
  const [huntAnswers, setHuntAnswers] = useState<Record<string, string>>({});
  const [activeCompanionMode, setActiveCompanionMode] = useState<"trivia" | "hunts">("trivia");

  function openTriviaGames() {
    const mediaType = media.mediaType || "movie";
    const returnTo = `${window.location.pathname}${window.location.search}`;
    const path = `/games/title/${mediaType}/${media.tmdbId}?returnTo=${encodeURIComponent(returnTo)}`;
    if (onNavigate) {
      onNavigate(path);
      return;
    }
    window.location.assign(path);
  }

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
          achievements: current.achievements,
          unlockedAchievements: [],
        };
      });
      setCompletionStatus((current) => ({ ...current, [itemId]: "Completed." }));
    } catch (error) {
      setCompletionStatus((current) => ({ ...current, [itemId]: error instanceof Error && error.message.includes("Sign in") ? "Sign in to save progress." : "Could not save progress." }));
    }
  }

  async function updateHunt(hunt: EasterEggHunt, action: "start" | "hint" | "answer" | "complete") {
    setCompletionStatus((current) => ({ ...current, [hunt.id]: action === "answer" ? "Checking answer..." : "Saving..." }));
    if (action === "hint") setRevealedHunts((current) => ({ ...current, [hunt.id]: true }));
    try {
      const result = await updateEasterEggHunt({ huntId: hunt.id, action, answer: huntAnswers[hunt.id] || "" });
      setTriviaFeed((current) => current ? {
        ...current,
        questions: result.questions,
        easterEggs: result.easterEggs,
        progress: result.progress,
        achievements: current.achievements,
        unlockedAchievements: [],
      } : current);
      if (action === "answer") {
        setCompletionStatus((current) => ({ ...current, [hunt.id]: result.isCorrect ? "Correct. Hunt completed." : "Not quite. Try again or mark found after watching." }));
      } else {
        setCompletionStatus((current) => ({ ...current, [hunt.id]: action === "complete" ? "Completed." : "Saved." }));
      }
    } catch (error) {
      setCompletionStatus((current) => ({ ...current, [hunt.id]: error instanceof Error && error.message.includes("Sign in") ? "Sign in to save hunt progress." : "Could not save progress." }));
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

        <button className="media-extension-card media-extension-card-action trivia-card reset-button" onClick={openTriviaGames} type="button" aria-label={`Open Trivia and Games for ${media.title}`}>
          <div className="extension-art trivia-art" aria-hidden="true">
            <span />
            <strong>?</strong>
          </div>
          <div>
            <h3>Trivia & Games</h3>
            <p>Open title trivia, challenges, and future game modes.</p>
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
            </div>
          ) : null}
          {triviaFeed && triviaFeed.questions.length === 0 && (triviaFeed.easterEggs || []).length === 0 ? (
            <p className="empty-state">{triviaFeed.notes || "Trivia coming soon."}</p>
          ) : null}
          {triviaFeed ? (
            <div className="companion-mode-tabs" role="tablist" aria-label="Trivia and Easter Egg Hunts">
              <button className={activeCompanionMode === "trivia" ? "is-active" : ""} onClick={() => setActiveCompanionMode("trivia")} type="button">
                Trivia
              </button>
              <button className={activeCompanionMode === "hunts" ? "is-active" : ""} onClick={() => setActiveCompanionMode("hunts")} type="button">
                Easter Egg Hunts
              </button>
            </div>
          ) : null}
          {activeCompanionMode === "trivia" ? triviaFeed?.questions.map((question) => {
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
          }) : null}
          {activeCompanionMode === "hunts" && triviaFeed && (triviaFeed.easterEggs || []).length === 0 ? (
            <p className="empty-state">No Easter Egg Hunts yet for this title.</p>
          ) : null}
          {activeCompanionMode === "hunts" && (triviaFeed?.easterEggs || []).length > 0 ? (
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
                    {hunt.spoilerLevel !== "none" ? <p className="hunt-spoiler-note">Spoiler level: {hunt.spoilerLevel}</p> : null}
                    <p>{hunt.prompt}</p>
                    {hunt.userStatus === "not_started" ? (
                      <button className="secondary-button" onClick={() => void updateHunt(hunt, "start")} type="button">Start Hunt</button>
                    ) : null}
                    {revealed || hunt.hintUsed ? <p className="hunt-hint">Hint: {hunt.hint}</p> : null}
                    {hunt.completed || revealed ? (
                      <p className="trivia-feedback is-correct">Answer: {hunt.answer}. {hunt.explanation}</p>
                    ) : null}
                    {!hunt.completed ? (
                      <div className="hunt-answer-row">
                        <input
                          aria-label={`Answer for ${hunt.title}`}
                          onChange={(event) => setHuntAnswers((current) => ({ ...current, [hunt.id]: event.target.value }))}
                          placeholder="Type what you found"
                          value={huntAnswers[hunt.id] || hunt.submittedAnswer || ""}
                        />
                        <button className="primary-button" onClick={() => void updateHunt(hunt, "answer")} type="button">Submit</button>
                      </div>
                    ) : null}
                    <div className="hunt-action-row">
                      <button className="secondary-button" onClick={() => void updateHunt(hunt, "hint")} type="button">
                        {revealed || hunt.hintUsed ? "Hint Shown" : "Reveal Hint"}
                      </button>
                      <button className={hunt.completed ? "watched-toggle is-watched" : "watched-toggle"} disabled={hunt.completed} onClick={() => void updateHunt(hunt, "complete")} type="button">
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
