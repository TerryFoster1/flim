import { useState } from "react";
import { getMediaExtensions } from "../services/mediaExtensionService";
import { getTitleTrivia, reportTriviaQuestion } from "../services/triviaService";
import type { MediaType, TriviaFeed, TriviaQuestion, TriviaReportReason } from "../types";

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
          {triviaFeed && triviaFeed.questions.length === 0 ? (
            <p className="empty-state">{triviaFeed.notes || "Trivia coming soon."}</p>
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
                      ].filter(Boolean).join(" ")}
                      disabled={answered}
                      key={option}
                      onClick={() => setSelectedAnswers((current) => ({ ...current, [question.id]: option }))}
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
        </div>
      ) : null}
    </section>
  );
}
