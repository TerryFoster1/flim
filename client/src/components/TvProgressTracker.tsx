import { useEffect, useMemo, useState } from "react";
import {
  getTvProgress,
  markSeasonProgress,
  markShowProgress,
  startShowProgress,
  updateEpisodeProgress,
} from "../services/tvProgressService";
import type { EpisodeProgressStatus, MovieDetails, TvSeasonProgress, TvShowProgress } from "../types";

interface TvProgressTrackerProps {
  show: MovieDetails;
}

function formatEpisodeLabel(seasonNumber?: number, episodeNumber?: number) {
  if (!seasonNumber || !episodeNumber) return "";
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status: string) {
  if (status === "completed") return "Completed";
  if (status === "watching") return "In Progress";
  return "Not Started";
}

function recomputeSeason(season: TvSeasonProgress): TvSeasonProgress {
  const released = season.episodes.filter((episode) => episode.released);
  const watched = released.filter((episode) => episode.status === "watched").length;
  const active = released.filter((episode) => episode.status === "watched" || episode.status === "watching").length;
  const progressPercent = released.length > 0 ? Math.round((watched / released.length) * 100) : 0;
  const status = released.length > 0 && watched >= released.length ? "completed" : active > 0 ? "watching" : "not_started";
  return {
    ...season,
    releasedEpisodeCount: released.length,
    watchedEpisodeCount: watched,
    progressPercent,
    status,
  };
}

function recomputeShow(progress: TvShowProgress): TvShowProgress {
  const seasons = progress.seasons.map(recomputeSeason);
  const releasedEpisodes = seasons.flatMap((season) => season.episodes.filter((episode) => episode.released));
  const watchedEpisodeCount = releasedEpisodes.filter((episode) => episode.status === "watched").length;
  const activeEpisodeCount = releasedEpisodes.filter((episode) => episode.status === "watched" || episode.status === "watching").length;
  const releasedEpisodeCount = releasedEpisodes.length;
  const progressPercent = releasedEpisodeCount > 0 ? Math.round((watchedEpisodeCount / releasedEpisodeCount) * 100) : 0;
  const nextEpisode = releasedEpisodes.find((episode) => episode.status !== "watched");
  const status = releasedEpisodeCount > 0 && watchedEpisodeCount >= releasedEpisodeCount ? "completed" : activeEpisodeCount > 0 ? "watching" : "not_started";
  return {
    ...progress,
    seasons,
    show: {
      ...progress.show,
      status,
      progressPercent,
      watchedEpisodeCount,
      releasedEpisodeCount,
      nextEpisode,
      lastWatchedAt: activeEpisodeCount > 0 ? new Date().toISOString() : progress.show.lastWatchedAt,
    },
  };
}

function optimisticEpisode(progress: TvShowProgress, seasonNumber: number, episodeNumber: number, nextStatus: EpisodeProgressStatus) {
  return recomputeShow({
    ...progress,
    seasons: progress.seasons.map((season) => {
      if (season.seasonNumber !== seasonNumber) return season;
      return {
        ...season,
        episodes: season.episodes.map((episode) =>
          episode.episodeNumber === episodeNumber
            ? {
                ...episode,
                status: nextStatus,
                progressPercent: nextStatus === "watched" ? 100 : nextStatus === "watching" ? 50 : 0,
                lastWatchedAt: nextStatus === "not_started" ? episode.lastWatchedAt : new Date().toISOString(),
              }
            : episode,
        ),
      };
    }),
  });
}

function optimisticSeason(progress: TvShowProgress, seasonNumber: number, watched: boolean) {
  return recomputeShow({
    ...progress,
    seasons: progress.seasons.map((season) => {
      if (season.seasonNumber !== seasonNumber) return season;
      return {
        ...season,
        episodes: season.episodes.map((episode) =>
          episode.released
            ? {
                ...episode,
                status: watched ? "watched" : "not_started",
                progressPercent: watched ? 100 : 0,
                lastWatchedAt: watched ? new Date().toISOString() : episode.lastWatchedAt,
              }
            : episode,
        ),
      };
    }),
  });
}

function optimisticShow(progress: TvShowProgress, watched: boolean) {
  return recomputeShow({
    ...progress,
    seasons: progress.seasons.map((season) => ({
      ...season,
      episodes: season.episodes.map((episode) =>
        episode.released
          ? {
              ...episode,
              status: watched ? "watched" : "not_started",
              progressPercent: watched ? 100 : 0,
              lastWatchedAt: watched ? new Date().toISOString() : episode.lastWatchedAt,
            }
          : episode,
      ),
    })),
  });
}

export function TvProgressTracker({ show }: TvProgressTrackerProps) {
  const [progress, setProgress] = useState<TvShowProgress | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error" | "signed-out">("loading");
  const [message, setMessage] = useState("");
  const requestedSeason = useMemo(() => Number(new URLSearchParams(window.location.search).get("s")), []);
  const requestedEpisode = useMemo(() => Number(new URLSearchParams(window.location.search).get("e")), []);
  const [openSeason, setOpenSeason] = useState<number | null>(Number.isFinite(requestedSeason) && requestedSeason > 0 ? requestedSeason : null);
  const targetEpisodeId = Number.isFinite(requestedSeason) && requestedSeason > 0 && Number.isFinite(requestedEpisode) && requestedEpisode > 0
    ? `episode-${requestedSeason}-${requestedEpisode}`
    : "";

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    getTvProgress(show.tmdbId)
      .then((result) => {
        if (!mounted) return;
        setProgress(result);
        setStatus("ready");
        setOpenSeason((current) => current || null);
      })
      .catch((error) => {
        if (!mounted) return;
        setStatus(error instanceof Error && error.message.includes("Sign in") ? "signed-out" : "error");
        setMessage(error instanceof Error ? error.message : "Unable to load TV progress.");
      });
    return () => {
      mounted = false;
    };
  }, [show.tmdbId]);

  useEffect(() => {
    if (status !== "ready" || !targetEpisodeId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(targetEpisodeId)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [status, targetEpisodeId]);

  async function mutate(action: () => Promise<TvShowProgress>, optimistic?: TvShowProgress, successMessage?: string) {
    const previous = progress;
    if (optimistic) setProgress(optimistic);
    setStatus("saving");
    setMessage("");
    try {
      setProgress(await action());
      setStatus("ready");
      setMessage(successMessage || "");
    } catch (error) {
      if (previous) setProgress(previous);
      setStatus(error instanceof Error && error.message.includes("Sign in") ? "signed-out" : "error");
      setMessage(error instanceof Error ? error.message : "Unable to update progress.");
    }
  }

  function setEpisode(seasonNumber: number, episodeNumber: number, nextStatus: EpisodeProgressStatus) {
    mutate(
      () => updateEpisodeProgress(show.tmdbId, seasonNumber, episodeNumber, nextStatus),
      progress ? optimisticEpisode(progress, seasonNumber, episodeNumber, nextStatus) : undefined,
      nextStatus === "watched" ? "Episode marked watched." : nextStatus === "watching" ? "Episode queued to continue." : "Episode marked unwatched.",
    );
  }

  function setSeason(seasonNumber: number, watched: boolean) {
    const season = progress?.seasons.find((item) => item.seasonNumber === seasonNumber);
    const label = season?.title || `Season ${seasonNumber}`;
    const confirmed = window.confirm(`Mark ${label} ${watched ? "watched" : "unwatched"}?`);
    if (!confirmed) return;
    mutate(
      () => markSeasonProgress(show.tmdbId, seasonNumber, watched),
      progress ? optimisticSeason(progress, seasonNumber, watched) : undefined,
      watched ? `${label} marked watched.` : `${label} marked unwatched.`,
    );
  }

  function setShow(watched: boolean) {
    const confirmed = window.confirm(`${watched ? "Mark the entire series watched" : "Mark the entire series unwatched"}?`);
    if (!confirmed) return;
    mutate(
      () => markShowProgress(show.tmdbId, watched),
      progress ? optimisticShow(progress, watched) : undefined,
      watched ? "Entire series marked watched." : "Entire series marked unwatched.",
    );
  }

  if (status === "signed-out") {
    return (
      <section className="tv-progress-panel">
        <h2>Track This Show</h2>
        <p>Sign in to track episodes, seasons, and Continue Watching.</p>
      </section>
    );
  }

  if (status === "loading") {
    return <section className="tv-progress-panel"><p className="empty-state">Loading TV progress...</p></section>;
  }

  if (!progress) {
    return <section className="tv-progress-panel"><p className="error-message">{message || "TV progress is unavailable right now."}</p></section>;
  }

  const nextEpisode = progress.show.nextEpisode;
  const progressLabel = `${progress.show.watchedEpisodeCount}/${progress.show.releasedEpisodeCount} released episodes`;

  return (
    <section className="tv-progress-panel">
      <div className="tv-progress-header">
        <div>
          <h2>Continue Watching</h2>
          <p>{progressLabel} watched - {statusLabel(progress.show.status)}</p>
        </div>
        <div className="tv-progress-meter" aria-label={`${progress.show.progressPercent}% watched`}>
          <span style={{ width: `${progress.show.progressPercent}%` }} />
        </div>
      </div>

      <div className="next-episode-card">
        {nextEpisode ? (
          <>
            <div>
              <strong>{formatEpisodeLabel(nextEpisode.seasonNumber, nextEpisode.episodeNumber)} {nextEpisode.title}</strong>
              <p>{nextEpisode.airDate ? `Aired ${formatDate(nextEpisode.airDate)}` : "Next unwatched episode"}</p>
            </div>
            <button className="primary-button" disabled={status === "saving"} onClick={() => setEpisode(nextEpisode.seasonNumber, nextEpisode.episodeNumber, "watching")} type="button">
              Continue
            </button>
          </>
        ) : (
          <>
            <div>
              <strong>{progress.show.status === "completed" ? "Show complete" : "No released episodes yet"}</strong>
              <p>{progress.show.status === "completed" ? "Every released episode is marked watched." : "Flim will track progress once episodes are available."}</p>
            </div>
            {progress.show.status !== "completed" ? (
              <button className="primary-button" disabled={status === "saving"} onClick={() => mutate(() => startShowProgress(show.tmdbId), undefined, "Show started.")} type="button">
                Start Show
              </button>
            ) : null}
          </>
        )}
      </div>

      <div className="button-row">
        <button className="secondary-button" disabled={status === "saving"} onClick={() => setShow(true)} type="button">
          Mark Entire Series Watched
        </button>
        <button className="ghost-button" disabled={status === "saving"} onClick={() => setShow(false)} type="button">
          Mark Series Unwatched
        </button>
      </div>

      {message ? <p className={status === "error" ? "error-message" : "success-message"}>{message}</p> : null}

      <div className="season-progress-list">
        {progress.seasons.map((season) => (
          <article className="season-progress-card" key={season.seasonNumber}>
            <button className="season-progress-toggle" onClick={() => setOpenSeason((current) => current === season.seasonNumber ? null : season.seasonNumber)} type="button">
              <span>
                <strong>{season.title || `Season ${season.seasonNumber}`}</strong>
                <small>{season.watchedEpisodeCount}/{season.releasedEpisodeCount} released episodes watched - {statusLabel(season.status)}</small>
              </span>
              <span>{season.progressPercent}%</span>
            </button>
            <div className="season-progress-meter" aria-label={`${season.progressPercent}% watched`}>
              <span style={{ width: `${season.progressPercent}%` }} />
            </div>
            {openSeason === season.seasonNumber ? (
              <div className="episode-progress-list">
                <div className="button-row">
                  <button className="secondary-button" disabled={status === "saving"} onClick={() => setSeason(season.seasonNumber, true)} type="button">
                    Mark Season Watched
                  </button>
                  <button className="ghost-button" disabled={status === "saving"} onClick={() => setSeason(season.seasonNumber, false)} type="button">
                    Mark Season Unwatched
                  </button>
                </div>
                {season.episodes.map((episode) => {
                  const watched = episode.status === "watched";
                  const isTargetEpisode = targetEpisodeId === `episode-${episode.seasonNumber}-${episode.episodeNumber}`;
                  const rowClassName = [
                    "episode-progress-row",
                    watched ? "is-watched" : "",
                    isTargetEpisode ? "is-target" : "",
                  ].filter(Boolean).join(" ");
                  return (
                    <div className={rowClassName} id={`episode-${episode.seasonNumber}-${episode.episodeNumber}`} key={`${episode.seasonNumber}-${episode.episodeNumber}`}>
                      <div>
                        <strong>{formatEpisodeLabel(episode.seasonNumber, episode.episodeNumber)} {episode.title}</strong>
                        <small>{episode.airDate ? formatDate(episode.airDate) : "Air date unknown"}{episode.released ? "" : " - Upcoming"}</small>
                      </div>
                      <button
                        className={watched ? "secondary-button" : "primary-button"}
                        disabled={status === "saving" || !episode.released}
                        onClick={() => setEpisode(episode.seasonNumber, episode.episodeNumber, watched ? "not_started" : "watched")}
                        type="button"
                      >
                        {watched ? "Mark Episode Unwatched" : "Mark Episode Watched"}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
