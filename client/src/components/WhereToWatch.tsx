import { useEffect, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
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
  const ticketLinks = useMemo(() => availability?.ticketLinks || [], [availability]);
  const hasTicketLinks = ticketLinks.length > 0;
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
  const fallbackPreviewProviders = useMemo(
    () => [
      { id: "netflix", name: "Netflix" },
      { id: "disney_plus", name: "Disney+" },
      { id: "prime_video", name: "Prime Video" },
      { id: "apple_tv_plus", name: "Apple TV+" },
      { id: "crave", name: "Crave" },
    ],
    [],
  );
  const previewProviders = useMemo(() => {
    const links = preferredLinks.length ? preferredLinks : confirmedLinks;
    const providers = links.map((link) => link.provider);
    return (providers.length ? providers : fallbackPreviewProviders).slice(0, 5);
  }, [confirmedLinks, fallbackPreviewProviders, preferredLinks]);

  function formatReleaseDate(value?: string) {
    if (!value) return "";
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
  }

  function releaseDateLine() {
    const formatted = formatReleaseDate(movie.releaseDate);
    if (!formatted) return "Release Date TBA";
    return `${(movie.mediaType || "movie") === "tv" ? "Expected" : "Coming"} ${formatted}`;
  }

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
    if (hasConfirmedLinks && preferredProviders.size > 0) return "Tap to see all streaming options.";
    if (hasConfirmedLinks) return "Available to stream, rent or buy.";
    if (hasTicketLinks) return "Tickets are available from a confirmed ticket provider.";
    if (releaseState === "theaters") return "In theaters now. Follow this title for ticket and streaming updates.";
    if (releaseState === "upcoming") return `${(movie.mediaType || "movie") === "tv" ? "Coming to streaming" : "Coming to theaters"} - ${releaseDateLine()}.`;
    return "Notify me when available.";
  }

  function helperMessage() {
    if (status === "loading") return "Checking confirmed providers and ticket availability.";
    if (hasTicketLinks) return "Find tickets from confirmed ticket providers.";
    if (releaseState === "upcoming") return `${(movie.mediaType || "movie") === "tv" ? "Coming to streaming" : "Coming to theaters"} - ${releaseDateLine()}.`;
    if (releaseState === "theaters") return "In theaters now. Follow this title to get streaming availability updates.";
    if (hasConfirmedLinks && preferredProviders.size > 0 && preferredLinks.length === 0) return "Available to stream, rent or buy from other services.";
    if (hasConfirmedLinks) return availability?.notes || statusMessage();
    return "Notify me when available.";
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
    if (availability) return () => {
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
  }, [availability, movie, streamingRegion]);

  function toggleExpanded() {
    setExpanded((current) => !current);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, select, textarea")) return;
    event.preventDefault();
    toggleExpanded();
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (target?.closest("a, button, input, select, textarea")) return;
    toggleExpanded();
  }

  return (
    <section
      className={`${compact ? "watch-providers compact" : "watch-providers"} ${expanded ? "is-open" : "is-collapsed"}`}
      id={`where-to-watch-${movie.tmdbId}`}
      aria-label={`Where to watch ${movie.title}`}
      aria-expanded={expanded}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="watch-provider-heading">
        <div>
          {!compact ? <h2>Where To Watch</h2> : null}
          <p>{expanded ? statusMessage() : "Tap to see where you can watch."}</p>
        </div>
        <div className="watch-provider-summary">
          {previewProviders.length > 0 ? (
            <div className="provider-preview-icons" aria-label="Watch provider preview">
              {previewProviders.map((provider) => (
                <span className="provider-preview-icon" key={provider.id}>
                  <ProviderLogo provider={provider} />
                </span>
              ))}
            </div>
          ) : null}
          <span className="provider-status">Region: {streamingRegion}</span>
          <button
            className="projector-watch-button"
            onClick={toggleExpanded}
            type="button"
            aria-label="Where To Watch"
            aria-expanded={expanded}
          >
            <span className="projector-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <div className="watch-provider-details" aria-hidden={!expanded}>
      {expanded ? <p className="helper-text">{helperMessage()}</p> : null}

      {expanded && hasConfirmedLinks ? (
        <div className="provider-groups">
          <h3 className="provider-action-heading">Click to Watch Now</h3>
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
      {expanded && hasTicketLinks ? (
        <div className="provider-empty-action">
          <h3>{releaseState === "upcoming" ? "Buy Advance Tickets" : "Find tickets"}</h3>
          <p>Tickets are available from confirmed providers in {streamingRegion}.</p>
          <div className="button-row">
            {ticketLinks.map((link) => (
              <a className="primary-button compact" href={link.url} key={link.id} rel="noreferrer" target="_blank">
                {link.providerName || "Find tickets"}
              </a>
            ))}
          </div>
        </div>
      ) : null}
      {expanded && !hasTicketLinks ? (
        <div className="provider-empty-action">
          <h3>
            {hasConfirmedLinks && preferredProviders.size > 0 && preferredLinks.length === 0
              ? "Available on other services"
              : releaseState === "upcoming"
                ? (movie.mediaType || "movie") === "tv" ? "Coming to streaming" : "Coming to theaters"
                : releaseState === "theaters"
                  ? "In theaters now"
                : "Notify me when available"}
          </h3>
          <p>
            {hasConfirmedLinks && preferredProviders.size > 0 && preferredLinks.length === 0
              ? "This title is available elsewhere. Follow it to get updates when availability changes."
              : releaseState === "upcoming"
                ? `${releaseDateLine()}. Follow this title for release and streaming availability updates.`
                : releaseState === "theaters"
                  ? "Follow this title to get streaming availability updates."
                : "Follow this title to get release and streaming availability updates."}
          </p>
          <button className="primary-button compact" onClick={notifyWhenAvailable} type="button">Notify me when available</button>
          {notifyStatus ? <small>{notifyStatus}</small> : null}
        </div>
      ) : null}
      </div>
    </section>
  );
}
