import { useEffect, useMemo, useState } from "react";
import { FlimAvatar } from "../components/FlimAvatar";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { getDiscoveryHub } from "../services/discoveryBrowseService";
import type { DiscoveryBrowseResult, DiscoveryCollectionResult, DiscoveryHubLink, DiscoveryProfileResult, MovieSearchResult } from "../types";

interface DiscoveryHubProps {
  kind: DiscoveryBrowseResult["kind"];
  hubId: string;
  onNavigate: (path: string) => void;
}

function titlePath(title: MovieSearchResult) {
  return title.mediaType === "tv" ? `/tv/${title.tmdbId}` : `/movies/${title.tmdbId}`;
}

function titleCountLabel(collection: DiscoveryCollectionResult) {
  if (collection.titleCount > 0) return `${collection.titleCount} title${collection.titleCount === 1 ? "" : "s"}`;
  if (collection.movieCount > 0) return `${collection.movieCount} movie${collection.movieCount === 1 ? "" : "s"}`;
  return "Collection";
}

function sectionLabel(kind: DiscoveryBrowseResult["kind"]) {
  if (kind === "genre") return "Genre Hub";
  if (kind === "decade") return "Decade Hub";
  return "Franchise Hub";
}

function HubLinks({ title, hubs, onNavigate }: { title: string; hubs: DiscoveryHubLink[]; onNavigate: (path: string) => void }) {
  if (hubs.length === 0) return null;

  return (
    <section className="discovery-results-section">
      <div className="discovery-results-heading">
        <h2>{title}</h2>
      </div>
      <div className="discovery-browse-grid">
        {hubs.map((hub) => (
          <button className="discovery-browse-card" key={`${hub.kind}-${hub.key}`} onClick={() => onNavigate(hub.path || `/${hub.kind}/${hub.key}`)} type="button">
            <span>{sectionLabel(hub.kind)}</span>
            <strong>{hub.title}</strong>
            {hub.description ? <small>{hub.description}</small> : null}
          </button>
        ))}
      </div>
    </section>
  );
}

function TitleRow({ titles, emptyMessage, onNavigate }: { titles: MovieSearchResult[]; emptyMessage: string; onNavigate: (path: string) => void }) {
  if (titles.length === 0) return <p className="empty-state">{emptyMessage}</p>;

  return (
    <div className="discovery-title-row">
      {titles.map((title) => (
        <article className="discovery-title-card" key={`${title.mediaType}-${title.tmdbId}`}>
          <button className="reset-button" onClick={() => onNavigate(titlePath(title))} type="button">
            {title.posterUrl ? <img alt={`${title.title} poster`} src={title.posterUrl} /> : <span className="discovery-poster-placeholder" />}
            <strong>{title.title}</strong>
            <small>{title.releaseYear || "Year"} / {title.mediaType === "tv" ? "TV Show" : "Movie"}</small>
          </button>
        </article>
      ))}
    </div>
  );
}

function CollectionGrid({ collections, onNavigate }: { collections: DiscoveryCollectionResult[]; onNavigate: (path: string) => void }) {
  if (collections.length === 0) return <p className="empty-state">No matching collections yet.</p>;

  return (
    <div className="collection-discovery-row discovery-collection-results">
      {collections.map((collection) => (
        <button className="collection-discovery-card" key={collection.slug} onClick={() => onNavigate(`/collection/${collection.slug}`)} type="button">
          {collection.posterUrl ? <img alt={`${collection.title} poster`} src={collection.posterUrl} /> : <span className="actor-credit-placeholder" />}
          <strong>{collection.title}</strong>
          <small>{collection.category || "Flim collection"} / {titleCountLabel(collection)}</small>
        </button>
      ))}
    </div>
  );
}

function CuratorGrid({ profiles, onNavigate }: { profiles: DiscoveryProfileResult[]; onNavigate: (path: string) => void }) {
  if (profiles.length === 0) return <p className="empty-state">No matching curators yet.</p>;

  return (
    <div className="curator-result-grid">
      {profiles.map((profile) => (
        <button className="curator-result-card" key={profile.handle} onClick={() => onNavigate(`/@${profile.handle}`)} type="button">
          <FlimAvatar avatarKey={profile.avatarKey} label={profile.displayName} size="sm" />
          <strong>{profile.displayName}</strong>
          <small>@{profile.handle}</small>
          {profile.bio ? <p>{profile.bio}</p> : null}
          <span>
            {profile.playlistCount} playlist{profile.playlistCount === 1 ? "" : "s"} / {profile.followerCount || 0} follower{profile.followerCount === 1 ? "" : "s"}
          </span>
        </button>
      ))}
    </div>
  );
}

export function DiscoveryHub({ kind, hubId, onNavigate }: DiscoveryHubProps) {
  const [hub, setHub] = useState<DiscoveryBrowseResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    setStatus("loading");
    setMessage("");
    setHub(null);

    getDiscoveryHub(kind, hubId)
      .then((result) => {
        if (!mounted) return;
        setHub(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!mounted) return;
        setStatus("error");
        setMessage("This discovery hub is unavailable right now.");
      });

    return () => {
      mounted = false;
    };
  }, [kind, hubId]);

  const movieTitles = useMemo(() => (hub?.titles || []).filter((title) => title.mediaType !== "tv"), [hub]);
  const tvTitles = useMemo(() => (hub?.titles || []).filter((title) => title.mediaType === "tv"), [hub]);

  if (status === "loading") {
    return (
      <section className="route-page discover-page">
        <section className="discover-hero discovery-hub-hero">
          <p className="empty-state">Loading discovery hub...</p>
        </section>
      </section>
    );
  }

  if (!hub) {
    return (
      <section className="route-page discover-page">
        <p className="error-message">{message || "Discovery hub unavailable."}</p>
        <button className="secondary-button" onClick={() => onNavigate("/discover")} type="button">Back to Discover</button>
      </section>
    );
  }

  return (
    <section className="route-page discover-page discovery-hub-page">
      <section className="discover-hero discovery-hub-hero">
        <div>
          <span className="discovery-hub-kicker">{sectionLabel(hub.kind)}</span>
          <h1>{hub.title}</h1>
          <p>{hub.description}</p>
          <div className="discovery-hub-actions">
            <button className="secondary-button" onClick={() => onNavigate("/discover")} type="button">Back to Discover</button>
            <button className="secondary-button" onClick={() => onNavigate("/public")} type="button">Public Playlists</button>
          </div>
        </div>
      </section>

      {message ? <p className="error-message">{message}</p> : null}

      <div className="discovery-results-stack">
        <section className="discovery-results-section">
          <div className="discovery-results-heading">
            <h2>Featured Playlists</h2>
            <span>{hub.playlists.length} found</span>
          </div>
          <PlaylistGrid playlists={hub.playlists} onNavigate={onNavigate} emptyMessage="No matching public playlists yet." />
        </section>

        <section className="discovery-results-section">
          <div className="discovery-results-heading">
            <h2>Collections</h2>
            <span>{hub.collections.length} found</span>
          </div>
          <CollectionGrid collections={hub.collections} onNavigate={onNavigate} />
        </section>

        <section className="discovery-results-section">
          <div className="discovery-results-heading">
            <h2>Curators</h2>
            <span>{hub.profiles.length} found</span>
          </div>
          <CuratorGrid profiles={hub.profiles} onNavigate={onNavigate} />
        </section>

        <section className="discovery-results-section">
          <div className="discovery-results-heading">
            <h2>Movies</h2>
            <span>{movieTitles.length} found</span>
          </div>
          <TitleRow titles={movieTitles} emptyMessage="No matching movies yet." onNavigate={onNavigate} />
        </section>

        <section className="discovery-results-section">
          <div className="discovery-results-heading">
            <h2>TV Shows</h2>
            <span>{tvTitles.length} found</span>
          </div>
          <TitleRow titles={tvTitles} emptyMessage="No matching TV shows yet." onNavigate={onNavigate} />
        </section>

        <HubLinks title="Browse Genres" hubs={hub.relatedHubs.genres} onNavigate={onNavigate} />
        <HubLinks title="Browse Decades" hubs={hub.relatedHubs.decades} onNavigate={onNavigate} />
        <HubLinks title="Browse Franchises" hubs={hub.relatedHubs.franchises} onNavigate={onNavigate} />
      </div>
    </section>
  );
}
