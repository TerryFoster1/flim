import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getCuratorDiscovery } from "../services/curatorService";
import type { CuratorDiscoveryFeed, CuratorDiscoveryProfile } from "../types";

interface CuratorsProps {
  onNavigate: (path: string) => void;
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatUpdatedAt(value?: string) {
  if (!value) return "";
  const updated = new Date(value).getTime();
  if (!Number.isFinite(updated)) return "";
  const days = Math.max(0, Math.round((Date.now() - updated) / 86400000));
  if (days === 0) return "Updated today";
  if (days === 1) return "Updated yesterday";
  if (days < 30) return `Updated ${days} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function CuratorCard({ curator, onNavigate }: { curator: CuratorDiscoveryProfile; onNavigate: (path: string) => void }) {
  const initial = (curator.displayName || curator.handle || "F").charAt(0).toUpperCase();
  const stats = curator.stats;
  const totalFollowers = stats.followerCount + stats.playlistFollowerCount;
  const latest = formatUpdatedAt(stats.latestPlaylistUpdatedAt);

  return (
    <article className="curator-discovery-card">
      <button className="curator-card-main reset-button" onClick={() => onNavigate(`/@${curator.handle}`)} type="button">
        {curator.heroImageUrl ? <img className="curator-card-hero" alt="" src={curator.heroImageUrl} /> : <div className="curator-card-hero curator-card-hero-fallback" aria-hidden="true" />}
        <span className="curator-card-avatar">
          {curator.profileImageUrl ? <img alt={`${curator.displayName} profile`} src={curator.profileImageUrl} /> : initial}
        </span>
        <span className="curator-card-copy">
          <strong>{curator.displayName || `@${curator.handle}`}</strong>
          <small>@{curator.handle}</small>
          {curator.bio ? <span>{curator.bio}</span> : null}
        </span>
      </button>
      {curator.trustBadges.length > 0 ? (
        <div className="curator-trust-badges" aria-label="Curator badges">
          {curator.trustBadges.map((badge) => <span key={badge}>{badge}</span>)}
        </div>
      ) : null}
      <div className="curator-stat-grid" aria-label="Curator trust signals">
        <span><strong>{compactNumber(stats.playlistCount)}</strong> Playlists</span>
        <span><strong>{compactNumber(stats.titleCount)}</strong> Titles</span>
        <span><strong>{compactNumber(totalFollowers)}</strong> Followers</span>
        <span><strong>{compactNumber(stats.playlistLikeCount)}</strong> Likes</span>
      </div>
      {curator.favoriteGenres.length > 0 ? (
        <div className="curator-genre-row">
          {curator.favoriteGenres.slice(0, 3).map((genre) => <span key={genre}>{genre}</span>)}
        </div>
      ) : null}
      {curator.featuredPlaylist ? (
        <button className="curator-featured-playlist reset-button" onClick={() => onNavigate(`/p/${curator.featuredPlaylist?.publicSlug}`)} type="button">
          <span>Featured Playlist</span>
          <strong>{curator.featuredPlaylist.name}</strong>
          <small>
            {curator.featuredPlaylist.movies.length} {curator.featuredPlaylist.movies.length === 1 ? "Title" : "Titles"}
            {" · "}
            {compactNumber(curator.featuredPlaylist.followerCount || 0)} Followers
            {" · "}
            {compactNumber(curator.featuredPlaylist.likeCount || 0)} Likes
          </small>
        </button>
      ) : null}
      <div className="curator-card-footer">
        {latest ? <small>{latest}</small> : <small>Public curator</small>}
        <button className="secondary-button" onClick={() => onNavigate(`/@${curator.handle}`)} type="button">
          View Profile
        </button>
      </div>
    </article>
  );
}

function CuratorShelf({ title, curators, onNavigate, emptyMessage }: { title: string; curators: CuratorDiscoveryProfile[]; onNavigate: (path: string) => void; emptyMessage?: string }) {
  if (curators.length === 0) {
    return emptyMessage ? (
      <section className="curator-discovery-shelf">
        <h2>{title}</h2>
        <p className="empty-state">{emptyMessage}</p>
      </section>
    ) : null;
  }

  return (
    <section className="curator-discovery-shelf">
      <h2>{title}</h2>
      <div className="curator-discovery-grid">
        {curators.map((curator) => <CuratorCard curator={curator} key={curator.handle} onNavigate={onNavigate} />)}
      </div>
    </section>
  );
}

export function Curators({ onNavigate }: CuratorsProps) {
  const [feed, setFeed] = useState<CuratorDiscoveryFeed | null>(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    setStatus("loading");
    getCuratorDiscovery(submittedQuery)
      .then((result) => {
        if (!isActive) return;
        setFeed(result);
        setStatus("ready");
        setMessage("");
      })
      .catch((error) => {
        if (!isActive) return;
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Curators are unavailable right now.");
      });

    return () => {
      isActive = false;
    };
  }, [submittedQuery]);

  const activeSections = useMemo(() => {
    if (!feed) return [];
    return [
      { title: "Top Curators", curators: feed.sections.topCurators },
      { title: "Trending Curators", curators: feed.sections.trendingCurators },
      { title: "Rising Curators", curators: feed.sections.risingCurators },
      { title: "Most Followed Curators", curators: feed.sections.mostFollowedCurators },
      { title: "Most Liked Curators", curators: feed.sections.mostLikedCurators },
      { title: "Recently Featured Curators", curators: feed.sections.recentlyFeaturedCurators },
    ];
  }, [feed]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
  }

  return (
    <section className="route-page curators-page">
      <div className="page-heading curators-heading">
        <div>
          <h1>Discover Curators</h1>
          <p>Find people whose playlists match your taste. Follow the taste, then discover the titles.</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("/discover")} type="button">
          Search Everything
        </button>
      </div>

      <form className="curator-search-form" onSubmit={submitSearch}>
        <input
          aria-label="Search curators"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Anime, Horror, Sci-Fi, Disaster Movies..."
          type="search"
          value={query}
        />
        <button className="primary-button" type="submit">Search</button>
      </form>

      <section className="curator-trust-summary">
        <span>Real playlist metrics only</span>
        <span>Followers, likes, titles, and public playlists</span>
        <span>No fake popularity</span>
      </section>

      {status === "loading" ? <p className="empty-state">Loading curators...</p> : null}
      {status === "error" ? <p className="error-message">{message}</p> : null}

      {feed && status === "ready" ? (
        submittedQuery ? (
          <CuratorShelf
            title={`Curators matching "${submittedQuery}"`}
            curators={feed.curators}
            onNavigate={onNavigate}
            emptyMessage="No curator matches yet. Try a broader genre or playlist theme."
          />
        ) : (
          <>
            {activeSections.map((section) => (
              <CuratorShelf key={section.title} title={section.title} curators={section.curators} onNavigate={onNavigate} />
            ))}
            {feed.genres.length > 0 ? (
              <section className="curator-discovery-shelf">
                <h2>Browse By Taste</h2>
                <div className="curator-genre-shelves">
                  {feed.genres.map((genre) => (
                    <div className="curator-genre-shelf" key={genre.name}>
                      <h3>{genre.name}</h3>
                      <div className="curator-discovery-grid">
                        {genre.curators.map((curator) => <CuratorCard curator={curator} key={`${genre.name}-${curator.handle}`} onNavigate={onNavigate} />)}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
}
