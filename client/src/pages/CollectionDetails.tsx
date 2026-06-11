import { useEffect, useMemo, useState } from "react";
import { getCollection } from "../services/collectionService";
import type { CollectionChallenge, MediaCollection, MediaCollectionItem } from "../types";

interface CollectionDetailsProps {
  collectionId: string;
  onNavigate: (path: string) => void;
}

function titlePath(item: MediaCollectionItem) {
  return item.mediaType === "tv" ? `/tv/${item.tmdbId}` : `/movies/${item.tmdbId}`;
}

function statusLabel(status: string) {
  if (status === "completed") return "Collection Complete";
  if (status === "in_progress") return "In Progress";
  return "Not Started";
}

function ratingLabel(value: number) {
  if (value >= 3) return "Loved";
  if (value === 2) return "Really liked";
  if (value === 1) return "Liked";
  return "Not rated";
}

function challengeStatusLabel(challenge: CollectionChallenge) {
  if (challenge.status === "completed") return "Badge unlocked";
  if (challenge.status === "in_progress") return `${challenge.completedRequirements} of ${challenge.totalRequirements} requirements`;
  return `${challenge.points} points`;
}

export function CollectionDetailsPage({ collectionId, onNavigate }: CollectionDetailsProps) {
  const [collection, setCollection] = useState<MediaCollection | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setMessage("");

    getCollection(collectionId)
      .then((result) => {
        if (!mounted) return;
        setCollection(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
        setMessage("Collection details are unavailable right now.");
      });

    return () => {
      mounted = false;
    };
  }, [collectionId]);

  const timeline = useMemo(() => (collection?.items || []).filter((item) => item.releaseYear), [collection]);

  if (status === "loading") {
    return <section className="route-page collection-detail-page"><p className="empty-state">Loading collection...</p></section>;
  }

  if (!collection) {
    return <section className="route-page collection-detail-page"><p className="error-message">{message || "Collection unavailable."}</p></section>;
  }

  const progress = collection.progress;
  const challenges = collection.challenges || [];

  return (
    <section className="route-page collection-detail-page">
      <section className="collection-detail-hero" style={{ backgroundImage: collection.backdropUrl ? `linear-gradient(90deg, rgba(5,5,8,.92), rgba(5,5,8,.54)), url(${collection.backdropUrl})` : undefined }}>
        {collection.posterUrl ? <img className="collection-detail-poster" alt={`${collection.title} poster`} src={collection.posterUrl} /> : <div className="collection-detail-poster collection-poster-placeholder" />}
        <div className="collection-detail-copy">
          <span className={`collection-status-pill is-${progress.status}`}>{statusLabel(progress.status)}</span>
          <h1>{collection.title}</h1>
          <p>{collection.overview || "A curated franchise collection from Flim."}</p>
          <div className="collection-stat-row">
            <span>{progress.movieCount} Movie{progress.movieCount === 1 ? "" : "s"}</span>
            {progress.tvCount ? <span>{progress.tvCount} TV</span> : null}
            <span>{progress.watchedCount} / {progress.totalCount} watched</span>
            <span>{progress.completionPercent}% complete</span>
          </div>
          <div className="collection-progress-track" aria-label={`${progress.completionPercent}% complete`}>
            <span style={{ width: `${progress.completionPercent}%` }} />
          </div>
        </div>
      </section>

      {timeline.length > 0 ? (
        <section className="collection-timeline" aria-label="Release timeline">
          {timeline.map((item) => (
            <button className={item.watchStatus === "watched" ? "timeline-node is-watched" : "timeline-node"} key={`${item.mediaType}-${item.tmdbId}`} onClick={() => onNavigate(titlePath(item))} type="button">
              <span>{item.releaseYear}</span>
              <strong>{item.title}</strong>
            </button>
          ))}
        </section>
      ) : null}

      {challenges.length > 0 ? (
        <section className="collection-challenge-section" aria-label="Collection challenges">
          <div className="actor-section-heading">
            <h2>Available Challenges</h2>
            <span>{challenges.length}</span>
          </div>
          <div className="collection-challenge-grid">
            {challenges.map((challenge) => (
              <article className={`collection-challenge-card is-${challenge.status}`} key={challenge.id}>
                <div className="challenge-card-topline">
                  <span className="challenge-badge-mark">{challenge.badge}</span>
                  <span>{challenge.difficulty}</span>
                </div>
                <h3>{challenge.name}</h3>
                <p>{challenge.description}</p>
                <div className="challenge-progress-track" aria-label={`${challenge.completionPercent}% complete`}>
                  <span style={{ width: `${challenge.completionPercent}%` }} />
                </div>
                <div className="challenge-card-meta">
                  <strong>{challenge.completionPercent}%</strong>
                  <span>{challengeStatusLabel(challenge)}</span>
                </div>
                <div className="challenge-requirement-row">
                  {challenge.requirements.slice(0, 3).map((requirement) => (
                    <span className={requirement.completed ? "is-complete" : ""} key={`${challenge.id}-${requirement.type}-${requirement.label}`}>
                      {requirement.completed ? "Done" : `${Math.min(requirement.progress, requirement.target)}/${requirement.target}`} {requirement.label}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="collection-title-section">
        <div className="actor-section-heading">
          <h2>Collection Titles</h2>
          <span>{collection.items.length}</span>
        </div>
        <div className="collection-title-grid">
          {collection.items.map((item) => (
            <article className={item.watchStatus === "watched" ? "collection-title-card is-watched" : "collection-title-card"} key={`${item.mediaType}-${item.tmdbId}`}>
              <button className="reset-button" onClick={() => onNavigate(titlePath(item))} type="button">
                {item.posterUrl ? <img alt={`${item.title} poster`} src={item.posterUrl} /> : <span className="actor-credit-placeholder" />}
                <strong>{item.title}</strong>
                <small>{item.releaseYear || "Year"} / {item.mediaType === "tv" ? "TV Show" : "Movie"}</small>
                <div className="collection-title-signals">
                  <span>{item.watchStatus === "watched" ? "Watched" : "Not watched"}</span>
                  <span>{ratingLabel(item.userRating)}</span>
                  <span>{item.triviaTotal ? `${item.triviaCompleted}/${item.triviaTotal} trivia` : "Trivia pending"}</span>
                </div>
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
