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
  const groupedLinks = useMemo(() => {
    const order = ["subscription", "free", "rent", "buy", "library", "unknown"];
    return order
      .map((accessType) => ({
        accessType,
        label: accessGroupLabel(accessType),
        links: confirmedLinks.filter((link) => (link.accessType || "unknown") === accessType),
      }))
      .filter((group) => group.links.length > 0);
  }, [confirmedLinks]);

  function accessLabel(value?: string) {
    if (value === "subscription") return "Subscription";
    if (value === "rent") return "Rent";
    if (value === "buy") return "Buy";
    if (value === "free") return "Free";
    if (value === "library") return "In Your Library";
    return "Watch";
  }

  function accessGroupLabel(value?: string) {
    if (value === "subscription") return "Available With Subscription";
    if (value === "rent") return "Rent";
    if (value === "buy") return "Buy";
    if (value === "free") return "Free";
    if (value === "library") return "In Your Library";
    return "Watch";
  }

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
          {!compact ? <h2>Where To Watch</h2> : null}
        </div>
        <span className="provider-status">{streamingRegion}</span>
      </div>

      <p className="helper-text">
        {status === "loading" ? "Checking streaming availability..." : hasConfirmedLinks ? "Available on confirmed providers in your region." : "Streaming availability coming soon."}
      </p>

      {hasConfirmedLinks ? (
        <div className="provider-groups">
          {groupedLinks.map((group) => (
            <div className="provider-group" key={group.accessType}>
              <h3>{group.label}</h3>
              <div className="provider-button-grid">
                {group.links.map((link) => (
                  <a
                    className="provider-watch-button"
                    href={link.url}
                    key={`${group.accessType}-${link.provider.id}`}
                    aria-label={`${link.provider.name}: ${link.linkType === "exact" ? accessLabel(link.accessType) : `Search ${accessLabel(link.accessType)}`}`}
                    rel="noreferrer"
                    target="_blank"
                    title={link.provider.name}
                  >
                    <span className="provider-round-icon" aria-hidden="true">
                      <ProviderLogo provider={link.provider} />
                    </span>
                    <strong>{link.provider.name}</strong>
                    <small>{link.linkType === "exact" ? accessLabel(link.accessType) : `Search ${accessLabel(link.accessType)}`}</small>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
