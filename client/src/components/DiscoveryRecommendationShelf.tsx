import { useEffect, useState } from "react";
import { FlimAvatar } from "./FlimAvatar";
import { getRecommendations, type RecommendedCurator, type RecommendedPlaylist } from "../services/recommendationService";
import { PlaylistGrid } from "./PlaylistGrid";

interface DiscoveryRecommendationShelfProps {
  onNavigate: (path: string) => void;
  includeCurators?: boolean;
  fallbackPlaylists?: RecommendedPlaylist[];
}

const INITIAL_VISIBLE = 6;
const LOAD_MORE_COUNT = 6;

function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function CuratorRecommendationCard({ curator, onNavigate }: { curator: RecommendedCurator; onNavigate: (path: string) => void }) {
  return (
    <article className="curator-recommendation-card">
      <button className="curator-recommendation-main reset-button" onClick={() => onNavigate(`/@${curator.handle}`)} type="button">
        <FlimAvatar avatarKey={curator.avatarKey} label={curator.displayName || curator.handle} size="sm" />
        <strong>{curator.displayName || `@${curator.handle}`}</strong>
        <small>@{curator.handle}</small>
      </button>
      {curator.recommendationReason ? <p>{curator.recommendationReason}</p> : null}
      <div className="curator-recommendation-stats">
        <span>{compactNumber(curator.stats.playlistCount)} Playlists</span>
        <span>{compactNumber(curator.stats.playlistFollowerCount + curator.stats.followerCount)} Followers</span>
      </div>
    </article>
  );
}

export function DiscoveryRecommendationShelf({ onNavigate, includeCurators = true, fallbackPlaylists = [] }: DiscoveryRecommendationShelfProps) {
  const [playlists, setPlaylists] = useState<RecommendedPlaylist[]>(fallbackPlaylists);
  const [curators, setCurators] = useState<RecommendedCurator[]>([]);
  const [visiblePlaylists, setVisiblePlaylists] = useState(INITIAL_VISIBLE);
  const [visibleCurators, setVisibleCurators] = useState(INITIAL_VISIBLE);
  const [status, setStatus] = useState<"loading" | "ready" | "hidden">(fallbackPlaylists.length ? "ready" : "loading");

  useEffect(() => {
    let mounted = true;
    setPlaylists(fallbackPlaylists);
    setCurators([]);
    setVisiblePlaylists(INITIAL_VISIBLE);
    setVisibleCurators(INITIAL_VISIBLE);
    setStatus(fallbackPlaylists.length ? "ready" : "loading");
    getRecommendations()
      .then((result) => {
        if (!mounted) return;
        const nextPlaylists = (result.playlistRecommendations || []).length ? result.playlistRecommendations || [] : fallbackPlaylists;
        const nextCurators = includeCurators ? result.curatorRecommendations || [] : [];
        setPlaylists(nextPlaylists);
        setCurators(nextCurators);
        setVisiblePlaylists(INITIAL_VISIBLE);
        setVisibleCurators(INITIAL_VISIBLE);
        setStatus(nextPlaylists.length || nextCurators.length ? "ready" : "hidden");
      })
      .catch(() => {
        if (mounted) setStatus(fallbackPlaylists.length ? "ready" : "hidden");
      });

    return () => {
      mounted = false;
    };
  }, [fallbackPlaylists, includeCurators]);

  if (status !== "ready") return null;

  const visiblePlaylistItems = playlists.slice(0, visiblePlaylists);
  const visibleCuratorItems = curators.slice(0, visibleCurators);

  return (
    <section className="discovery-recommendations" aria-label="Recommended discovery">
      {visiblePlaylistItems.length > 0 ? (
        <div className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Recommended Playlists</h2>
          </div>
          <PlaylistGrid onNavigate={onNavigate} playlists={visiblePlaylistItems} emptyMessage="No recommended playlists yet." />
          {playlists.length > visiblePlaylists ? (
            <div className="load-more-row">
              <button className="secondary-button" onClick={() => setVisiblePlaylists((count) => count + LOAD_MORE_COUNT)} type="button">
                Load More Playlists
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {includeCurators && visibleCuratorItems.length > 0 ? (
        <div className="discovery-section">
          <div className="discovery-section-heading">
            <h2>Recommended Curators</h2>
          </div>
          <div className="curator-recommendation-grid">
            {visibleCuratorItems.map((curator) => (
              <CuratorRecommendationCard curator={curator} key={curator.handle} onNavigate={onNavigate} />
            ))}
          </div>
          {curators.length > visibleCurators ? (
            <div className="load-more-row">
              <button className="secondary-button" onClick={() => setVisibleCurators((count) => count + LOAD_MORE_COUNT)} type="button">
                Load More Curators
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
