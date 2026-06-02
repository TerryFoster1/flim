import { useEffect, useMemo, useState } from "react";
import { ProviderLogo } from "./ProviderLogo";
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
  const confirmedLinks = availability.links.filter((link) => link.availabilityKnown && link.url);

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

      {confirmedLinks.length > 0 ? (
        <div className="provider-button-grid">
          {confirmedLinks.map((link) => (
          <a
            className="provider-watch-button"
            href={link.url}
            key={link.provider.id}
            rel="noreferrer"
            target="_blank"
          >
            <ProviderLogo provider={link.provider} />
            <small>Open provider</small>
          </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
