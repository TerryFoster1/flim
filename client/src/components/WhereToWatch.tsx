import { useEffect, useMemo, useState } from "react";
import { ProviderLogo } from "./ProviderLogo";
import { getCurrentProfile } from "../services/profileService";
import { getProviderAvailabilityForTitle } from "../services/watchProviderService";
import type { MediaType, MovieAvailability, UserProfile } from "../types";

interface WhereToWatchProps {
  movie: {
    tmdbId: number;
    title: string;
    mediaType?: MediaType;
  };
  compact?: boolean;
}

export function WhereToWatch({ compact = false, movie }: WhereToWatchProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [availability, setAvailability] = useState<MovieAvailability | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const streamingRegion = profile?.streamingRegion || profile?.countryCode || "CA";
  const confirmedLinks = useMemo(() => (availability?.links || []).filter((link) => link.availabilityKnown && link.url), [availability]);
  const hasConfirmedLinks = confirmedLinks.length > 0;

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

  useEffect(() => {
    let isActive = true;
    setStatus("loading");
    getProviderAvailabilityForTitle(movie, streamingRegion)
      .then((result) => {
        if (!isActive) return;
        setAvailability(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setAvailability({
          tmdbId: movie.tmdbId,
          mediaType: movie.mediaType || "movie",
          title: movie.title,
          availabilityKnown: false,
          links: [],
          notes: "Streaming availability coming soon.",
        });
        setStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [movie, streamingRegion]);

  return (
    <section className={compact ? "watch-providers compact" : "watch-providers"} id={`where-to-watch-${movie.tmdbId}`} aria-label={`Where to watch ${movie.title}`}>
      <div className="watch-provider-heading">
        <div>
          <span className="eyebrow">Where to Watch</span>
          {!compact ? <h2>{hasConfirmedLinks ? "Available On" : "Where To Watch"}</h2> : null}
        </div>
        <span className="provider-status">Region: {streamingRegion}</span>
      </div>

      <p className="helper-text">
        {status === "loading" ? "Checking streaming availability..." : availability?.notes || "Streaming availability coming soon."}
      </p>

      {hasConfirmedLinks ? (
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
            <small>{link.linkType === "exact" ? "Open provider" : "Search provider"}</small>
          </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}
