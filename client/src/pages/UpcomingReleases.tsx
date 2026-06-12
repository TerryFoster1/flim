import { useEffect, useMemo, useState } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { FollowTitleControl } from "../components/FollowTitleControl";
import { ShareAssetButton } from "../components/ShareAssetButton";
import { WhereToWatch } from "../components/WhereToWatch";
import { getUpcomingReleases, type UpcomingReleaseFilters } from "../services/upcomingReleaseService";
import type { MediaType, MovieDetails, MovieSearchResult, Playlist, UpcomingRelease, UpcomingReleaseEvent, UpcomingReleaseFeed } from "../types";

interface UpcomingReleasesProps {
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails | MovieSearchResult) => void | Promise<void>;
  onNavigate: (path: string) => void;
}

const mediaFilters: Array<{ label: string; value: MediaType | "both" }> = [
  { label: "Both", value: "both" },
  { label: "Movies", value: "movie" },
  { label: "TV", value: "tv" },
];

const windowFilters: Array<{ label: string; value: UpcomingReleaseFilters["window"] }> = [
  { label: "All", value: "all" },
  { label: "This Month", value: "month" },
  { label: "Next 3 Months", value: "quarter" },
  { label: "This Year", value: "year" },
];

const audienceFilters: Array<{ label: string; value: UpcomingReleaseFilters["audience"] }> = [
  { label: "All Releases", value: "all" },
  { label: "Following Only", value: "following" },
];

function formatDate(value?: string) {
  if (!value) return "Coming Soon";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Coming Soon";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function countdownCopy(value?: string, mediaType: MediaType = "movie") {
  if (!value) return "Coming Soon";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Coming Soon";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return "Available Now";
  if (days === 0) return mediaType === "tv" ? "Season Premieres Today" : "Releases Today";
  if (days === 1) return mediaType === "tv" ? "Season Premieres Tomorrow" : "Releases Tomorrow";
  return mediaType === "tv" ? `Season premieres in ${days} days` : `Releases in ${days} days`;
}

function titlePath(item: UpcomingRelease) {
  return `/${item.mediaType === "tv" ? "tv" : "movies"}/${item.tmdbId}`;
}

function toMovieDetails(item: UpcomingRelease): MovieDetails {
  return {
    tmdbId: item.tmdbId,
    mediaType: item.mediaType,
    title: item.title,
    releaseDate: item.releaseDate,
    releaseYear: item.releaseYear,
    overview: item.overview,
    posterUrl: item.posterUrl,
    backdropUrl: item.backdropUrl,
    genreIds: item.genreIds || [],
    genres: item.genres || [],
    seasonCount: item.seasonCount,
    episodeCount: item.episodeCount,
    firstAirYear: item.mediaType === "tv" ? item.releaseYear : undefined,
    status: item.status,
  };
}

function eventPath(item: UpcomingReleaseEvent) {
  return `/${item.mediaType === "tv" ? "tv" : "movies"}/${item.tmdbId}`;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    release_date_changed: "Date Changed",
    movie_released: "Released",
    trailer_released: "New Trailer",
    streaming_available: "Streaming Update",
    provider_changed: "Provider Update",
    season_announced: "Season Announced",
    season_release_changed: "Season Date Changed",
    season_released: "Season Released",
    episode_released: "Episode Released",
    title_status_changed: "Status Changed",
  };
  return labels[type] || "Release Update";
}

function releaseTypeLabel(item: UpcomingRelease) {
  if (item.mediaType === "tv") return item.seasonCount ? `Season ${item.seasonCount}` : "TV Season";
  return "Movie";
}

function eventReason(item: UpcomingRelease) {
  if (item.latestEventType) return `${eventLabel(item.latestEventType)}: ${item.latestEventBody || item.latestEventTitle || "Release Intelligence detected an update."}`;
  if (item.releaseContext) return item.releaseContext;
  return item.mediaType === "tv" ? "Tracked TV release date." : "Tracked movie release date.";
}

function UpcomingReleaseCard({ item, playlists, addToPlaylist, onNavigate }: {
  item: UpcomingRelease;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails | MovieSearchResult) => void | Promise<void>;
  onNavigate: (path: string) => void;
}) {
  const movie = toMovieDetails(item);
  const cardSlug = item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `${item.mediaType}-${item.tmdbId}`;
  return (
    <article className="upcoming-release-card">
      <button className="upcoming-poster-button" onClick={() => onNavigate(titlePath(item))} type="button">
        {item.posterUrl ? <img src={item.posterUrl} alt={`${item.title} poster`} /> : <div className="poster tone-gold" />}
      </button>
      <div className="upcoming-release-copy">
        <div className="card-meta">
          <span className="media-type-badge">{releaseTypeLabel(item)}</span>
          {item.isFollowing ? <span>Following</span> : null}
          {item.availabilityKnown ? <span>{item.providerNames?.slice(0, 2).join(", ") || "Streaming info saved"}</span> : null}
        </div>
        <button className="reset-button upcoming-title-button" onClick={() => onNavigate(titlePath(item))} type="button">
          <h3>{item.title}</h3>
        </button>
        <p>{item.overview}</p>
        <div className="upcoming-release-date">
          <strong>{formatDate(item.releaseDate)}</strong>
          <span>{countdownCopy(item.releaseDate, item.mediaType)}</span>
        </div>
        {item.mediaType === "tv" && item.seasonCount ? <small className="helper-text">Season {item.seasonCount}</small> : null}
        <p className="upcoming-event-note">{eventReason(item)}</p>
        <div className="upcoming-card-actions">
          <FollowTitleControl movie={movie} />
          <AddToPlaylistControl movie={movie} playlists={playlists} addToPlaylist={addToPlaylist} />
          <ShareAssetButton
            label="Share Countdown"
            title={`${item.title} release countdown`}
            text="Share a Flim release countdown card."
            url={`${titlePath(item)}?share=countdown`}
            cardUrl={`/api/og/title/${item.mediaType}/${item.tmdbId}?card=countdown`}
            downloadName={`${cardSlug}-countdown-card.png`}
          />
        </div>
        {item.availabilityKnown ? <WhereToWatch compact movie={movie} /> : <p className="watch-provider-empty">Streaming availability coming soon.</p>}
      </div>
    </article>
  );
}

function ReleaseEventSection({ title, events, onNavigate }: {
  title: string;
  events: UpcomingReleaseEvent[];
  onNavigate: (path: string) => void;
}) {
  if (events.length === 0) return null;
  return (
    <section className="upcoming-section">
      <div className="shelf-header">
        <h2>{title}</h2>
        <span className="card-meta">{events.length} Updates</span>
      </div>
      <div className="upcoming-event-grid">
        {events.map((event) => (
          <button className="upcoming-event-card" key={`${event.eventType}-${event.mediaType}-${event.tmdbId}-${event.createdAt}`} onClick={() => onNavigate(eventPath(event))} type="button">
            {event.posterUrl ? <img src={event.posterUrl} alt={`${event.title} poster`} /> : null}
            <span>{eventLabel(event.eventType)}</span>
            <strong>{event.title}</strong>
            <small>{event.body || event.context || event.eventTitle || formatDate(event.createdAt)}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function ReleaseSection({ title, items, playlists, addToPlaylist, onNavigate }: {
  title: string;
  items: UpcomingRelease[];
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails | MovieSearchResult) => void | Promise<void>;
  onNavigate: (path: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="upcoming-section">
      <div className="shelf-header">
        <h2>{title}</h2>
        <span className="card-meta">{items.length} Titles</span>
      </div>
      <div className="upcoming-release-grid">
        {items.map((item) => (
          <UpcomingReleaseCard
            key={`${item.mediaType}-${item.tmdbId}`}
            item={item}
            playlists={playlists}
            addToPlaylist={addToPlaylist}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </section>
  );
}

export function UpcomingReleases({ playlists, addToPlaylist, onNavigate }: UpcomingReleasesProps) {
  const [feed, setFeed] = useState<UpcomingReleaseFeed | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mediaType, setMediaType] = useState<MediaType | "both">("both");
  const [windowFilter, setWindowFilter] = useState<UpcomingReleaseFilters["window"]>("all");
  const [audience, setAudience] = useState<UpcomingReleaseFilters["audience"]>("all");

  useEffect(() => {
    document.title = "Upcoming Releases | Flim";
  }, []);

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    getUpcomingReleases({ type: mediaType, window: windowFilter, audience })
      .then((result) => {
        if (!mounted) return;
        setFeed(result);
        setStatus("ready");
      })
      .catch(() => {
        if (mounted) setStatus("error");
      });
    return () => {
      mounted = false;
    };
  }, [mediaType, windowFilter, audience]);

  const items = feed?.items || [];
  const comingSoon = useMemo(() => items.slice(0, 12), [items]);

  return (
    <section className="route-page upcoming-page">
      <div className="upcoming-hero">
        <div>
          <h1>Upcoming Releases</h1>
          <p>Movies and TV seasons Flim is tracking from saved release intelligence.</p>
        </div>
        <div className="upcoming-filter-panel" aria-label="Upcoming release filters">
          <div className="segmented-control">
            {audienceFilters.map((filter) => (
              <button className={audience === filter.value ? "is-active" : ""} key={filter.value} onClick={() => setAudience(filter.value)} type="button">
                {filter.label}
              </button>
            ))}
          </div>
          <div className="segmented-control">
            {mediaFilters.map((filter) => (
              <button className={mediaType === filter.value ? "is-active" : ""} key={filter.value} onClick={() => setMediaType(filter.value)} type="button">
                {filter.label}
              </button>
            ))}
          </div>
          <div className="segmented-control">
            {windowFilters.map((filter) => (
              <button className={windowFilter === filter.value ? "is-active" : ""} key={filter.value} onClick={() => setWindowFilter(filter.value)} type="button">
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {status === "loading" ? <p className="empty-state">Loading upcoming releases...</p> : null}
      {status === "error" ? <p className="error-message">Unable to load upcoming releases. Please try again.</p> : null}
      {status === "ready" && items.length === 0 ? (
        <div className="empty-playlists-panel">
          <div>
            <h2>No upcoming releases yet</h2>
            <p>Follow upcoming movies and shows so Flim can build your release radar.</p>
          </div>
        </div>
      ) : null}

      <ReleaseSection title="Releasing This Month" items={feed?.sections.releasingThisMonth || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} />
      <ReleaseSection title="Upcoming Movies" items={feed?.sections.upcomingMovies || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} />
      <ReleaseSection title="Upcoming TV Seasons" items={feed?.sections.upcomingTv || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} />
      <ReleaseSection title="Streaming Soon" items={feed?.sections.streamingSoon || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} />
      <ReleaseEventSection title="Recently Announced" events={feed?.sections.recentlyAnnounced || []} onNavigate={onNavigate} />
      <ReleaseEventSection title="Recently Delayed" events={feed?.sections.recentlyDelayed || []} onNavigate={onNavigate} />
      <ReleaseSection title="Coming Soon" items={comingSoon} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} />
    </section>
  );
}
