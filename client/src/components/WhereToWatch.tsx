import { useEffect, useMemo, useState } from "react";
import { ProviderLogo } from "./ProviderLogo";
import { getCurrentProfile } from "../services/profileService";
import { followTitle } from "../services/followedTitleService";
import { getProviderAvailabilityForTitle, normalizeStreamingRegion, streamingRegionLabel } from "../services/watchProviderService";
import type { MediaType, MovieAvailability, MovieDetails, UserProfile } from "../types";

interface WhereToWatchProps {
  movie: {
    tmdbId: number;
    title: string;
    mediaType?: MediaType;
    releaseDate?: string;
    releaseYear?: string;
    overview?: string;
    posterUrl?: string;
    posterPath?: string;
    genreIds?: number[];
  };
  compact?: boolean;
}

export function WhereToWatch({ compact = false, movie }: WhereToWatchProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [availability, setAvailability] = useState<MovieAvailability | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [expanded, setExpanded] = useState(false);
  const [notifyStatus, setNotifyStatus] = useState("");
  const streamingRegion = normalizeStreamingRegion(profile?.streamingRegion || profile?.countryCode || "CA");
  const regionName = streamingRegionLabel(streamingRegion);
  const preferredProviders = useMemo(() => new Set(profile?.preferredProviders || []), [profile?.preferredProviders]);
  const confirmedLinks = useMemo(() => (availability?.links || []).filter((link) => link.availabilityKnown && link.url), [availability]);
  const hasConfirmedLinks = confirmedLinks.length > 0;
  const preferredLinks = useMemo(
    () => confirmedLinks.filter((link) => preferredProviders.has(link.provider.id)),
    [confirmedLinks, preferredProviders],
  );
  const groupedLinks = useMemo(() => {
    const preferredIds = new Set(preferredLinks.map((link) => `${link.provider.id}-${link.accessType || "unknown"}`));
    const otherLinks = confirmedLinks.filter((link) => !preferredIds.has(`${link.provider.id}-${link.accessType || "unknown"}`));
    const order = ["subscription", "free", "rent", "buy", "library", "unknown"];
    const groups = preferredLinks.length > 0 ? [{
      accessType: "preferred",
      label: "On your services",
      links: preferredLinks,
    }] : [];

    return [
      ...groups,
      ...order.map((accessType) => ({
        accessType,
        label: accessGroupLabel(accessType),
        links: otherLinks.filter((link) => (link.accessType || "unknown") === accessType),
      })),
    ]
      .filter((group) => group.links.length > 0);
  }, [confirmedLinks, preferredLinks]);
  const releaseState = useMemo(() => getReleaseState(movie.releaseDate, movie.mediaType || "movie"), [movie.releaseDate, movie.mediaType]);
  const previewLinks = (preferredLinks.length ? preferredLinks : confirmedLinks).slice(0, 3);

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

  function getReleaseState(releaseDate?: string, mediaType: MediaType = "movie") {
    if (!releaseDate) return "unknown";
    const releaseTime = new Date(`${releaseDate}T12:00:00`).getTime();
    if (!Number.isFinite(releaseTime)) return "unknown";
    const now = Date.now();
    const days = Math.round((releaseTime - now) / 86400000);
    if (days > 0) return "upcoming";
    if (mediaType === "movie" && days >= -60) return "theaters";
    return "released";
  }

  function statusMessage() {
    if (status === "loading") return "Checking availability...";
    if (hasConfirmedLinks && preferredLinks.length > 0) return `Available on ${preferredLinks.length === 1 ? "one of your services" : "your services"}.`;
    if (hasConfirmedLinks && preferredProviders.size > 0) return "Not on your services. Other options are available.";
    if (hasConfirmedLinks) return "Available on confirmed providers in your region.";
    if (releaseState === "theaters") return "In theaters now.";
    if (releaseState === "upcoming") return "Coming soon.";
    return "No streaming availability found in your region yet.";
  }

  function notificationSettings() {
    if ((movie.mediaType || "movie") === "tv") {
      return {
        streamingAvailability: true,
        seasonReleaseDate: true,
        newSeasonAnnounced: true,
        providerChanged: true,
      };
    }
    return {
      streamingAvailability: true,
      theaterRelease: true,
      rentalAvailability: true,
      purchaseAvailability: true,
      providerChanged: true,
    };
  }

  async function notifyWhenAvailable() {
    setNotifyStatus("Saving alert...");
    try {
      await followTitle({
        tmdbId: movie.tmdbId,
        mediaType: movie.mediaType || "movie",
        title: movie.title,
        releaseDate: movie.releaseDate,
        releaseYear: movie.releaseYear,
        overview: movie.overview || "",
        posterUrl: movie.posterUrl,
        posterPath: movie.posterPath,
        genreIds: movie.genreIds || [],
        genres: [],
      } as MovieDetails, notificationSettings());
      setNotifyStatus("You will be notified when availability changes.");
    } catch (error) {
      setNotifyStatus(error instanceof Error && error.message.toLowerCase().includes("sign") ? "Sign in to get availability alerts." : "Could not save alert right now.");
    }
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
    setAvailability(null);
    setStatus("idle");
    setNotifyStatus("");
  }, [movie.tmdbId, movie.mediaType, streamingRegion]);

  useEffect(() => {
    let isActive = true;
    if (!expanded || availability) return () => {
      isActive = false;
    };
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
          notes: "No streaming availability found in your region yet.",
        });
        setStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [availability, expanded, movie, streamingRegion]);

  return (
    <section className={`${compact ? "watch-providers compact" : "watch-providers"} ${expanded ? "is-open" : "is-collapsed"}`} id={`where-to-watch-${movie.tmdbId}`} aria-label={`Where to watch ${movie.title}`}>
      <div className="watch-provider-heading">
        <div>
          {!compact ? <h2>Where To Watch</h2> : null}
          <p>{expanded ? statusMessage() : `Availability in ${regionName}`}</p>
        </div>
        <div className="watch-provider-summary">
          {previewLinks.length > 0 ? (
            <div className="provider-preview-icons" aria-label="Top watch providers">
              {previewLinks.map((link) => (
                <span className="provider-preview-icon" key={`${link.provider.id}-${link.accessType || "watch"}`}>
                  <ProviderLogo provider={link.provider} />
                </span>
              ))}
            </div>
          ) : null}
          <span className="provider-status">Region: {streamingRegion}</span>
          <button className="secondary-button compact" onClick={() => setExpanded((current) => !current)} type="button">
            {expanded ? "Hide" : "Where to Watch"}
          </button>
        </div>
      </div>

      {expanded ? <p className="helper-text">{availability?.notes || statusMessage()}</p> : null}

      {expanded && hasConfirmedLinks ? (
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
      {expanded && releaseState === "theaters" ? (
        <div className="provider-empty-action">
          <h3>In Theaters</h3>
          <p>Ticket links are not available yet for this title.</p>
          <button className="secondary-button compact" disabled type="button">Find Tickets</button>
        </div>
      ) : null}
      {expanded ? (
        <div className="provider-empty-action">
          <h3>{releaseState === "upcoming" ? "Coming Soon" : "Notify Me"}</h3>
          <p>{releaseState === "upcoming" ? "Track this title and get availability alerts when provider data changes." : "Get notified when streaming, rental, purchase, ticket, or provider availability changes."}</p>
          <button className="primary-button compact" onClick={notifyWhenAvailable} type="button">Notify me when available</button>
          {notifyStatus ? <small>{notifyStatus}</small> : null}
        </div>
      ) : null}
    </section>
  );
}
