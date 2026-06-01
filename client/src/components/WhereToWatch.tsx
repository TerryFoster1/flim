import { useEffect, useMemo, useState } from "react";
import { getCurrentProfile } from "../services/profileService";
import { getProviderLinksForMovie } from "../services/watchProviderService";
import type { UserProfile } from "../types";

interface WhereToWatchProps {
  movie: {
    tmdbId: number;
    title: string;
  };
  compact?: boolean;
}

export function WhereToWatch({ compact = false, movie }: WhereToWatchProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const streamingRegion = profile?.streamingRegion || profile?.countryCode || "";
  const availability = useMemo(() => getProviderLinksForMovie(movie, streamingRegion), [movie, streamingRegion]);
  const plexLink = availability.links.find((link) => link.provider.id === "plex");
  const streamingLinks = availability.links.filter((link) => link.provider.id !== "plex");

  useEffect(() => {
    let isActive = true;
    getCurrentProfile()
      .then((result) => {
        if (isActive) setProfile(result);
      })
      .catch(() => {
        if (isActive) setProfile(null);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <section className={compact ? "watch-providers compact" : "watch-providers"} id={`where-to-watch-${movie.tmdbId}`} aria-label={`Where to watch ${movie.title}`}>
      <div className="watch-provider-heading">
        <div>
          <span className="eyebrow">Where to Watch</span>
          {!compact ? <h2>Open on provider</h2> : null}
        </div>
        <span className="provider-status">{streamingRegion ? `Region: ${streamingRegion}` : "Region not set"}</span>
      </div>

      <p className="helper-text">{availability.notes}</p>
      {!streamingRegion ? (
        <a className="region-settings-link" href="/settings">
          Set streaming region
        </a>
      ) : null}

      {plexLink ? (
        <div className="plex-provider-card">
          <div>
            <strong>Watch on Plex</strong>
            <p>Plex library connection and player control are planned. No Plex credentials are requested or stored yet.</p>
          </div>
          {plexLink.url ? (
            <a className="secondary-button" href={plexLink.url} rel="noreferrer" target="_blank">
              {plexLink.label}
            </a>
          ) : (
            <button className="secondary-button" disabled type="button">
              Connect Plex Library
            </button>
          )}
        </div>
      ) : null}

      <div className="provider-button-grid">
        {streamingLinks.map((link) => (
          <a
            className="provider-watch-button"
            href={link.url}
            key={link.provider.id}
            rel="noreferrer"
            target="_blank"
            title={link.provider.notes}
          >
            <span className="provider-icon">{link.provider.icon}</span>
            <span>{link.provider.name}</span>
            <small>{streamingRegion ? "Search provider" : "Set region first"}</small>
          </a>
        ))}
      </div>
    </section>
  );
}
