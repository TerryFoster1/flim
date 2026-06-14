import { useEffect, useState } from "react";
import { AddToPlaylistControl } from "../components/AddToPlaylistControl";
import { WhereToWatch } from "../components/WhereToWatch";
import { followTitle, unfollowTitle } from "../services/followedTitleService";
import { getUpcomingReleases, type UpcomingReleaseFilters } from "../services/upcomingReleaseService";
import type { MediaType, MovieDetails, MovieSearchResult, Playlist, TitleNotificationSettings, UpcomingRelease, UpcomingReleaseEvent, UpcomingReleaseFeed } from "../types";

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
  { label: "Following", value: "following" },
  { label: "All Releases", value: "all" },
];

const INITIAL_SECTION_COUNT = 10;

function parseReleaseDate(value?: string) {
  if (!value) return null;
  const normalized = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] || value;
  const date = new Date(`${normalized.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return null;
  return date;
}

function formatDate(value?: string) {
  const date = parseReleaseDate(value);
  if (!date) return "Release Date TBA";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function releaseTimingState(value?: string, mediaType: MediaType = "movie") {
  const date = parseReleaseDate(value);
  if (!date) return { label: "Release Date", dateText: "Release Date TBA", countdown: "Notify me when a date is announced", state: "tba" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  const days = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: "Release Date", dateText: "Now Available", countdown: formatDate(value), state: "released" };
  if (days === 0) return { label: "Release Date", dateText: mediaType === "tv" ? "Season Premieres Today" : "Releases Today", countdown: formatDate(value), state: "today" };
  if (days === 1) return { label: "Release Date", dateText: mediaType === "tv" ? "Season Premieres Tomorrow" : "Releases Tomorrow", countdown: formatDate(value), state: "soon" };
  return {
    label: "Release Date",
    dateText: `Coming ${formatDate(value)}`,
    countdown: mediaType === "tv" ? `Season premieres in ${days} days` : `Releases in ${days} days`,
    state: "future",
  };
}

function formatEventDate(value?: string) {
  const date = parseReleaseDate(value);
  if (!date) return "Release Date TBA";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function compactDateValue(value: unknown) {
  if (!value) return "";
  if (typeof value === "string") return formatEventDate(value.replace(/^"|"$/g, ""));
  if (typeof value === "object" && value) {
    const maybeValue = (value as { value?: unknown; date?: unknown; releaseDate?: unknown }).value ||
      (value as { date?: unknown }).date ||
      (value as { releaseDate?: unknown }).releaseDate;
    return compactDateValue(maybeValue);
  }
  return String(value);
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

function defaultNotificationSettings(mediaType: MediaType): TitleNotificationSettings {
  if (mediaType === "tv") {
    return {
      newSeasonAnnounced: true,
      seasonReleaseDate: true,
      newEpisodeAvailable: false,
      streamingAvailability: true,
    };
  }

  return {
    theaterRelease: true,
    streamingAvailability: true,
    trailerReleased: true,
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

function eventReason(item: UpcomingRelease) {
  if (item.latestEventType) return `${eventLabel(item.latestEventType)}: ${item.latestEventBody || item.latestEventTitle || "Release Intelligence detected an update."}`;
  if (item.releaseContext) return item.releaseContext;
  return item.mediaType === "tv" ? "Tracked TV release date." : "Tracked movie release date.";
}

function updateFollowState(feed: UpcomingReleaseFeed, mediaType: MediaType, tmdbId: number, isFollowing: boolean): UpcomingReleaseFeed {
  const updateItem = (item: UpcomingRelease) => (
    item.mediaType === mediaType && item.tmdbId === tmdbId ? { ...item, isFollowing } : item
  );
  const items = feed.items.map(updateItem);
  return {
    ...feed,
    items,
    sections: {
      ...feed.sections,
      following: items.filter((item) => item.isFollowing),
      comingSoon: (feed.sections.comingSoon || []).map(updateItem),
      upcomingMovies: feed.sections.upcomingMovies.map(updateItem),
      upcomingTv: feed.sections.upcomingTv.map(updateItem),
      releasingThisMonth: feed.sections.releasingThisMonth.map(updateItem),
      streamingSoon: feed.sections.streamingSoon.map(updateItem),
    },
  };
}

function UpcomingFollowButton({ item, movie, onChange }: {
  item: UpcomingRelease;
  movie: MovieDetails;
  onChange: (mediaType: MediaType, tmdbId: number, isFollowing: boolean) => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function toggleFollow() {
    setIsSaving(true);
    setMessage("");
    try {
      if (item.isFollowing) {
        await unfollowTitle(item.mediaType, item.tmdbId);
        onChange(item.mediaType, item.tmdbId, false);
        setMessage("Unfollowed.");
      } else {
        await followTitle(movie, defaultNotificationSettings(item.mediaType));
        onChange(item.mediaType, item.tmdbId, true);
        setMessage("Following.");
      }
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("Sign in") ? "Sign in to follow titles." : "Unable to update follow.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="upcoming-follow-action">
      <button className={item.isFollowing ? "follow-title-button is-following" : "follow-title-button"} disabled={isSaving} onClick={toggleFollow} type="button">
        {isSaving ? "Saving..." : item.isFollowing ? "Following" : item.releaseDate ? "Track Release" : "Notify Me"}
      </button>
      {message ? <small className={message.startsWith("Unable") || message.startsWith("Sign in") ? "error-text" : "success-text"}>{message}</small> : null}
    </div>
  );
}

function UpcomingReleaseCard({ item, playlists, addToPlaylist, onNavigate, onFollowChange }: {
  item: UpcomingRelease;
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails | MovieSearchResult) => void | Promise<void>;
  onNavigate: (path: string) => void;
  onFollowChange: (mediaType: MediaType, tmdbId: number, isFollowing: boolean) => void;
}) {
  const movie = toMovieDetails(item);
  const timing = releaseTimingState(item.releaseDate, item.mediaType);
  return (
    <article className="upcoming-release-card">
      <button className="upcoming-poster-button" onClick={() => onNavigate(titlePath(item))} type="button">
        {item.posterUrl ? <img src={item.posterUrl} alt={`${item.title} poster`} /> : <div className="poster tone-gold" />}
      </button>
      <div className="upcoming-release-copy">
        <div className="card-meta">
          {item.isFollowing ? <span>Following</span> : null}
          {item.availabilityKnown ? <span>{item.providerNames?.slice(0, 2).join(", ") || "Streaming info saved"}</span> : null}
        </div>
        <button className="reset-button upcoming-title-button" onClick={() => onNavigate(titlePath(item))} type="button">
          <h3>{item.title}</h3>
        </button>
        <div className={`upcoming-release-date is-${timing.state}`}>
          <small>{timing.label}</small>
          <strong>{timing.dateText}</strong>
          <span>{timing.countdown}</span>
          {item.region ? <em>{item.region}</em> : null}
        </div>
        <p>{item.overview}</p>
        {item.mediaType === "tv" && item.seasonCount ? <small className="helper-text">Season {item.seasonCount}</small> : null}
        <p className="upcoming-event-note">{eventReason(item)}</p>
        <div className="upcoming-card-actions">
          <UpcomingFollowButton item={item} movie={movie} onChange={onFollowChange} />
          <AddToPlaylistControl movie={movie} playlists={playlists} addToPlaylist={addToPlaylist} />
        </div>
        {item.availabilityKnown ? <WhereToWatch compact movie={movie} /> : <p className="watch-provider-empty">Notify me when available.</p>}
      </div>
    </article>
  );
}

function ReleaseEventSection({ title, events, onNavigate }: {
  title: string;
  events: UpcomingReleaseEvent[];
  onNavigate: (path: string) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_SECTION_COUNT);
  if (events.length === 0) return null;
  const visibleEvents = events.slice(0, visibleCount);
  return (
    <section className="upcoming-section">
      <div className="shelf-header">
        <h2>{title}</h2>
        <span className="card-meta">{events.length} Updates</span>
      </div>
      <div className="upcoming-event-grid">
        {visibleEvents.map((event) => (
          <button className="upcoming-event-card" key={`${event.eventType}-${event.mediaType}-${event.tmdbId}-${event.createdAt}`} onClick={() => onNavigate(eventPath(event))} type="button">
            {event.posterUrl ? <img src={event.posterUrl} alt={`${event.title} poster`} /> : null}
            <span>{eventLabel(event.eventType)}</span>
            <strong>{event.title}</strong>
            {event.eventType === "release_date_changed" || event.eventType === "season_release_changed" ? (
              <span className="release-date-change">
                <small>{compactDateValue(event.oldValue) || "Previous date"}</small>
                <b>to</b>
                <small>{compactDateValue(event.newValue) || "New date pending"}</small>
              </span>
            ) : null}
            {event.eventType === "trailer_released" ? <em>Watch Trailer</em> : null}
            <small>{event.body || event.context || event.eventTitle || formatEventDate(event.createdAt)}</small>
          </button>
        ))}
      </div>
      {events.length > visibleCount ? (
        <div className="load-more-row">
          <button className="secondary-button" onClick={() => setVisibleCount((current) => current + INITIAL_SECTION_COUNT)} type="button">
            Load More
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ReleaseSection({ title, items, playlists, addToPlaylist, onNavigate, onFollowChange }: {
  title: string;
  items: UpcomingRelease[];
  playlists: Playlist[];
  addToPlaylist: (playlistId: string, movie: MovieDetails | MovieSearchResult) => void | Promise<void>;
  onNavigate: (path: string) => void;
  onFollowChange: (mediaType: MediaType, tmdbId: number, isFollowing: boolean) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_SECTION_COUNT);
  if (items.length === 0) return null;
  const visibleItems = items.slice(0, visibleCount);
  return (
    <section className="upcoming-section">
      <div className="shelf-header">
        <h2>{title}</h2>
        <span className="card-meta">{items.length} Titles</span>
      </div>
      <div className="upcoming-release-grid">
        {visibleItems.map((item) => (
          <UpcomingReleaseCard
            key={`${item.mediaType}-${item.tmdbId}`}
            item={item}
            playlists={playlists}
            addToPlaylist={addToPlaylist}
            onNavigate={onNavigate}
            onFollowChange={onFollowChange}
          />
        ))}
      </div>
      {items.length > visibleCount ? (
        <div className="load-more-row">
          <button className="secondary-button" onClick={() => setVisibleCount((current) => current + INITIAL_SECTION_COUNT)} type="button">
            Load More
          </button>
        </div>
      ) : null}
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
    getUpcomingReleases({ type: mediaType, window: windowFilter, audience, sectionLimit: INITIAL_SECTION_COUNT })
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
  const followingItems = feed?.sections.following || [];
  const isFollowingViewEmpty = status === "ready" && audience === "following" && followingItems.length === 0;
  const onFollowChange = (changedMediaType: MediaType, changedTmdbId: number, isFollowing: boolean) => {
    setFeed((current) => current ? updateFollowState(current, changedMediaType, changedTmdbId, isFollowing) : current);
  };

  return (
    <section className="route-page upcoming-page">
      <div className="upcoming-hero">
        <div>
          <h1>Upcoming Releases</h1>
          <p>Track the release dates, delays, trailers, and streaming updates for titles you care about.</p>
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

      {status === "loading" ? <p className="empty-state">Loading your release radar...</p> : null}
      {status === "error" ? <p className="error-message">Unable to load upcoming releases. Please try again.</p> : null}
      {isFollowingViewEmpty ? (
        <div className="empty-playlists-panel">
          <div>
            <h2>Start Tracking Titles</h2>
            <p>Follow upcoming movies and returning shows to make this your personal release radar. Popular releases are one tap away.</p>
          </div>
          <button className="primary-button" onClick={() => setAudience("all")} type="button">Browse Popular Releases</button>
        </div>
      ) : null}
      {status === "ready" && audience === "all" && items.length === 0 ? (
        <div className="empty-playlists-panel">
          <div>
            <h2>No upcoming releases yet</h2>
            <p>Flim will show upcoming movies, TV seasons, trailers, and streaming updates once release intelligence is available.</p>
          </div>
        </div>
      ) : null}

      {audience === "following" ? (
        <ReleaseSection title="Following" items={followingItems} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} onFollowChange={onFollowChange} />
      ) : null}
      <ReleaseSection title="Coming Soon" items={feed?.sections.comingSoon || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} onFollowChange={onFollowChange} />
      <ReleaseSection title="Releasing This Month" items={feed?.sections.releasingThisMonth || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} onFollowChange={onFollowChange} />
      <ReleaseSection title="Upcoming Movies" items={feed?.sections.upcomingMovies || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} onFollowChange={onFollowChange} />
      <ReleaseSection title="Upcoming TV Seasons" items={feed?.sections.upcomingTv || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} onFollowChange={onFollowChange} />
      <ReleaseEventSection title="Recently Announced" events={feed?.sections.recentlyAnnounced || []} onNavigate={onNavigate} />
      <ReleaseEventSection title="Recently Delayed" events={feed?.sections.recentlyDelayed || []} onNavigate={onNavigate} />
      <ReleaseEventSection title="New Trailers" events={feed?.sections.newTrailers || []} onNavigate={onNavigate} />
      <ReleaseSection title="Streaming Soon" items={feed?.sections.streamingSoon || []} playlists={playlists} addToPlaylist={addToPlaylist} onNavigate={onNavigate} onFollowChange={onFollowChange} />
    </section>
  );
}
