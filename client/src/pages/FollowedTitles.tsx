import { useEffect, useMemo, useState } from "react";
import { getFollowedTitles } from "../services/followedTitleService";
import type { FollowedTitle } from "../types";

interface FollowedTitlesProps {
  onNavigate: (path: string) => void;
}

function formatRelease(title: FollowedTitle) {
  if (title.releaseDate) {
    const date = new Date(title.releaseDate);
    if (Number.isFinite(date.getTime())) {
      return `Releases: ${date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
  }
  if (title.releaseYear) return `Expected: ${title.releaseYear}`;
  if (title.status) return title.status;
  return "Coming Soon";
}

function titlePath(title: FollowedTitle) {
  return `/${title.mediaType === "tv" ? "tv" : "movies"}/${title.tmdbId}`;
}

function FollowedTitleCard({ title, onNavigate }: { title: FollowedTitle; onNavigate: (path: string) => void }) {
  return (
    <button className="followed-title-card" onClick={() => onNavigate(titlePath(title))} type="button">
      {title.posterUrl ? <img src={title.posterUrl} alt={`${title.title} poster`} /> : <div className="poster tone-blue" />}
      <span>{title.mediaType === "tv" ? "TV Show" : "Movie"}</span>
      <strong>{title.title}</strong>
      <small>{formatRelease(title)}</small>
    </button>
  );
}

export function FollowedTitles({ onNavigate }: FollowedTitlesProps) {
  const [titles, setTitles] = useState<FollowedTitle[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    getFollowedTitles()
      .then((result) => {
        if (!mounted) return;
        setTitles(result.followedTitles);
        setStatus("ready");
      })
      .catch(() => {
        if (mounted) setStatus("error");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const upcomingMovies = useMemo(() => titles.filter((title) => title.mediaType === "movie" && title.upcoming), [titles]);
  const upcomingTv = useMemo(() => titles.filter((title) => title.mediaType === "tv" && title.upcoming), [titles]);

  return (
    <section className="route-page followed-titles-page">
      <div className="playlist-shelf-heading">
        <div>
          <h1>My Followed Titles</h1>
          <p>Movies and shows Flim is remembering for you.</p>
        </div>
      </div>
      {status === "loading" ? <p className="empty-state">Loading followed titles...</p> : null}
      {status === "error" ? <p className="error-message">Sign in to view followed titles.</p> : null}
      {status === "ready" && titles.length === 0 ? (
        <div className="empty-playlists-panel">
          <div>
            <h2>No followed titles yet</h2>
            <p>Open a movie or TV show and choose Follow Title to build your watch radar.</p>
          </div>
        </div>
      ) : null}
      {upcomingMovies.length > 0 ? (
        <section className="followed-title-section">
          <h2>Upcoming Movies</h2>
          <div className="followed-title-grid">
            {upcomingMovies.map((title) => <FollowedTitleCard key={title.id} title={title} onNavigate={onNavigate} />)}
          </div>
        </section>
      ) : null}
      {upcomingTv.length > 0 ? (
        <section className="followed-title-section">
          <h2>Upcoming TV Seasons</h2>
          <div className="followed-title-grid">
            {upcomingTv.map((title) => <FollowedTitleCard key={title.id} title={title} onNavigate={onNavigate} />)}
          </div>
        </section>
      ) : null}
      {titles.length > 0 ? (
        <section className="followed-title-section">
          <h2>Following</h2>
          <div className="followed-title-grid">
            {titles.map((title) => <FollowedTitleCard key={title.id} title={title} onNavigate={onNavigate} />)}
          </div>
        </section>
      ) : null}
    </section>
  );
}
