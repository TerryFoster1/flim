import { useEffect, useMemo, useState } from "react";
import { clearTitleRating, getTitleRating, setTitleRating } from "../services/titleRatingService";
import type { MediaType, TitleRatingSummary } from "../types";

interface TitleRatingControlProps {
  mediaType: MediaType;
  tmdbId: number;
}

function aggregateCopy(summary: TitleRatingSummary | null) {
  if (!summary || summary.ratingCount === 0) return "No ratings yet";
  const average = summary.averageRating.toFixed(1).replace(/\.0$/, "");
  return `${average}/3 average from ${summary.ratingCount} ${summary.ratingCount === 1 ? "rating" : "ratings"}`;
}

export function TitleRatingControl({ mediaType, tmdbId }: TitleRatingControlProps) {
  const [summary, setSummary] = useState<TitleRatingSummary | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const userRating = summary?.userRating || 0;
  const stars = useMemo(() => [1, 2, 3], []);

  useEffect(() => {
    let isActive = true;
    setStatus("loading");
    setMessage("");
    getTitleRating(mediaType, tmdbId)
      .then((result) => {
        if (!isActive) return;
        setSummary(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setStatus("error");
        setMessage("Ratings unavailable.");
      });

    return () => {
      isActive = false;
    };
  }, [mediaType, tmdbId]);

  async function updateRating(nextRating: number) {
    setStatus("saving");
    setMessage("");
    try {
      const result = nextRating === userRating ? await clearTitleRating(mediaType, tmdbId) : await setTitleRating(mediaType, tmdbId, nextRating);
      setSummary(result);
      setStatus("ready");
      setMessage(nextRating === userRating ? "Rating cleared." : "Rating saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Sign in to rate titles.");
    }
  }

  return (
    <section className="title-rating-panel" aria-label="Title rating">
      <div className="title-rating-copy">
        <h2>Rate This Title</h2>
        <p>{aggregateCopy(summary)}</p>
      </div>
      <div className="title-rating-actions" role="group" aria-label="Choose a rating">
        {stars.map((rating) => (
          <button
            aria-pressed={userRating >= rating}
            className={userRating >= rating ? "rating-star is-active" : "rating-star"}
            disabled={status === "saving"}
            key={rating}
            onClick={() => updateRating(rating)}
            title={`${rating} ${rating === 1 ? "star" : "stars"}`}
            type="button"
          >
            ★
          </button>
        ))}
        {userRating > 0 ? (
          <button className="rating-clear-button" disabled={status === "saving"} onClick={() => updateRating(userRating)} type="button">
            Clear
          </button>
        ) : null}
      </div>
      {message ? <small className={message.includes("saved") || message.includes("cleared") ? "success-text" : "error-text"}>{message}</small> : null}
    </section>
  );
}
