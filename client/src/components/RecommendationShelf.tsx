import { useEffect, useState } from "react";
import { getRecommendations } from "../services/recommendationService";
import type { PlaylistMovie } from "../types";

interface RecommendationShelfProps {
  onNavigate: (path: string) => void;
  title?: string;
  mediaType?: "movie" | "tv";
  tmdbId?: number;
  limit?: number;
}

function detailPath(item: PlaylistMovie) {
  return `${item.mediaType === "tv" ? "/tv" : "/movies"}/${item.tmdbId}`;
}

export function RecommendationShelf({ onNavigate, title = "Recommended For You", mediaType, tmdbId, limit = 12 }: RecommendationShelfProps) {
  const [items, setItems] = useState<PlaylistMovie[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "hidden">("loading");
  const recommendationKey = mediaType && Number.isFinite(tmdbId) ? `${mediaType}-${tmdbId}` : "for-you";

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    getRecommendations({ mediaType, tmdbId })
      .then((result) => {
        if (!mounted) return;
        const explainable = result.recommendations.filter((item) => item.recommendationReason);
        setItems(explainable);
        setStatus(explainable.length > 0 ? "ready" : "hidden");
      })
      .catch(() => {
        if (mounted) setStatus("hidden");
      });
    return () => {
      mounted = false;
    };
  }, [recommendationKey, mediaType, tmdbId]);

  if (status !== "ready") return null;

  return (
    <section className="recommendation-shelf">
      <div className="shelf-header">
        <h2>{title}</h2>
      </div>
      <div className="recommendation-row">
        {items.slice(0, limit).map((item) => (
          <article className="recommendation-card" key={`${item.mediaType}-${item.tmdbId}`}>
            <button className="recommendation-poster reset-button" onClick={() => onNavigate(detailPath(item))} type="button">
              {item.posterUrl ? <img alt={`${item.title} poster`} src={item.posterUrl} /> : <span />}
            </button>
            <div className="recommendation-copy">
              <h3>{item.title}</h3>
              <p>{item.recommendationReason}</p>
              <button className="secondary-button compact" onClick={() => onNavigate(detailPath(item))} type="button">
                View
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
