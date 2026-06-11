import { useEffect, useState } from "react";
import { getContinueWatching } from "../services/tvProgressService";
import type { ContinueWatchingItem } from "../types";

interface ContinueWatchingRowProps {
  onNavigate: (path: string) => void;
  variant?: "default" | "home";
  includeFollowedFallback?: boolean;
}

function formatEpisode(item: ContinueWatchingItem) {
  if (item.source === "followed") return "Tracked Show";
  if (!item.seasonNumber || !item.episodeNumber) return "Continue";
  return `Next: S${item.seasonNumber} E${item.episodeNumber}`;
}

function formatHomeEpisode(item: ContinueWatchingItem) {
  if (!item.seasonNumber || !item.episodeNumber) return "Continue";
  return `S${String(item.seasonNumber).padStart(2, "0")}E${String(item.episodeNumber).padStart(2, "0")}`;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ContinueWatchingRow({ onNavigate, variant = "default", includeFollowedFallback = false }: ContinueWatchingRowProps) {
  const [items, setItems] = useState<ContinueWatchingItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "hidden">("loading");

  useEffect(() => {
    let mounted = true;
    getContinueWatching({ includeFollowedFallback })
      .then((result) => {
        if (!mounted) return;
        const nextItems = result.items.slice(0, 6);
        setItems(nextItems);
        setStatus(nextItems.length > 0 ? "ready" : "hidden");
      })
      .catch(() => {
        if (mounted) setStatus("hidden");
      });
    return () => {
      mounted = false;
    };
  }, [includeFollowedFallback]);

  if (status !== "ready") return null;

  return (
    <section className={variant === "home" ? "continue-watching-section continue-watching-section-home" : "continue-watching-section"}>
      <div className="shelf-header">
        <h2>Continue Watching</h2>
        {variant === "home" ? <p>Pick up from the next episode.</p> : null}
      </div>
      <div className="continue-watching-row">
        {items.map((item) => (
          <article className={variant === "home" ? "continue-watching-card" : "continue-watching-card continue-watching-card-poster"} key={`${item.mediaType}-${item.tmdbId}`}>
            <button className="continue-watching-art reset-button" onClick={() => onNavigate(item.actionPath)} type="button">
              {item.posterUrl || item.backdropUrl ? <img alt="" src={variant === "home" ? item.backdropUrl || item.posterUrl : item.posterUrl || item.backdropUrl} /> : <span />}
            </button>
            <div className="continue-watching-copy">
              <span>{variant === "home" ? formatHomeEpisode(item) : formatEpisode(item)}{item.episodeTitle ? ` - ${item.episodeTitle}` : ""}</span>
              <h3>{item.title}</h3>
              {item.source === "followed" ? null : (
                <div className="tv-progress-meter" aria-label={`${item.progressPercent}% watched`}>
                  <span style={{ width: `${item.progressPercent}%` }} />
                </div>
              )}
              <small>
                {item.source === "followed"
                  ? "Followed for release alerts"
                  : item.lastWatchedAt
                    ? `Last watched ${formatDate(item.lastWatchedAt)}`
                    : "In progress"}
              </small>
              <button className="primary-button" onClick={() => onNavigate(item.actionPath)} type="button">
                {item.source === "followed" ? "Open Show" : "Continue"}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
