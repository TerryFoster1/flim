import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ContinueWatchingRow } from "../components/ContinueWatchingRow";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { RecommendationShelf } from "../components/RecommendationShelf";
import { landingPosterSeeds } from "../data/landingPosterSeeds";
import type { CurrentUser, Playlist } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  rewindPlaylists: Playlist[];
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  currentUser: CurrentUser | null;
  notice?: string;
  initialView?: PlaylistView;
}

type PlaylistView = "my" | "public";

function isTemporaryVerificationPlaylist(playlist: Playlist) {
  const name = playlist.name.toLowerCase();
  return (
    name.includes("codex vercel curl add test") ||
    name.includes("temporary production verification") ||
    name.includes("production verification playlist")
  );
}

function isDirectorPlaylist(playlist: Playlist) {
  return playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
}

function rankPublicPlaylist(playlist: Playlist) {
  if (playlist.isFollowing) return 0;
  if (isDirectorPlaylist(playlist)) return 1;
  return 2;
}

function scorePlaylistSearch(playlist: Playlist, normalizedQuery: string) {
  const name = playlist.name.toLowerCase();
  const description = playlist.description.toLowerCase();
  const creatorDisplayName = (playlist.creatorDisplayName || "").toLowerCase();
  const creatorHandle = (playlist.creatorHandle || "").toLowerCase();
  const matchingTitle = playlist.movies.some((movie) =>
    [movie.title, movie.releaseYear || "", ...movie.genres].some((value) => value.toLowerCase().includes(normalizedQuery)),
  );
  if (name === normalizedQuery) return 0;
  if (name.startsWith(normalizedQuery)) return 1;
  if (name.includes(normalizedQuery)) return 2;
  if (description.includes(normalizedQuery)) return 3;
  if (creatorDisplayName.includes(normalizedQuery) || creatorHandle.includes(normalizedQuery)) return 4;
  if (matchingTitle) return 5;
  return 6;
}

function byFollowerCount(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => {
    const followerDelta = (b.followerCount || 0) - (a.followerCount || 0);
    if (followerDelta !== 0) return followerDelta;
    const likeDelta = (b.likeCount || 0) - (a.likeCount || 0);
    if (likeDelta !== 0) return likeDelta;
    const titleDelta = b.movies.length - a.movies.length;
    if (titleDelta !== 0) return titleDelta;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

function byUpdated(playlists: Playlist[]) {
  return [...playlists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

function DiscoveryShelf({ title, playlists, onNavigate, emptyMessage }: { title: string; playlists: Playlist[]; onNavigate: (path: string) => void; emptyMessage?: string }) {
  if (playlists.length === 0) return null;
  return (
    <section className="discovery-section">
      <div className="discovery-section-heading">
        <h2>{title}</h2>
      </div>
      <PlaylistGrid onNavigate={onNavigate} playlists={playlists.slice(0, 8)} emptyMessage={emptyMessage || "Public playlists will appear here."} />
    </section>
  );
}

function PublicDiscovery({
  onNavigate,
  playlists,
  query,
  searchResults,
  visibleCount,
  onLoadMore,
}: {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  query: string;
  searchResults: Playlist[];
  visibleCount: number;
  onLoadMore: () => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const followedPlaylists = playlists.filter((playlist) => playlist.isFollowing);
  const flimPicks = playlists.filter(isDirectorPlaylist);
  const userPlaylists = playlists.filter((playlist) => !isDirectorPlaylist(playlist));
  const publicPlaylistResults = byFollowerCount(userPlaylists);
  const playlistSearchResults = searchResults;
  const visibleSearchResults = playlistSearchResults.slice(0, visibleCount);
  const hasMoreSearchResults = playlistSearchResults.length > visibleCount;

  if (normalizedQuery) {
    return (
      <div className="discovery-grid">
        <DiscoveryShelf title="Public Playlists" playlists={visibleSearchResults} onNavigate={onNavigate} emptyMessage="No matching playlists yet." />
        {hasMoreSearchResults ? (
          <div className="load-more-row">
            <button className="secondary-button" onClick={onLoadMore} type="button">
              Load More
            </button>
          </div>
        ) : null}
        {playlistSearchResults.length === 0 ? (
          <p className="empty-state">No playlist matches yet. Try a title, genre, or playlist name.</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="discovery-grid">
      <DiscoveryShelf title="Followed Playlists" playlists={followedPlaylists} onNavigate={onNavigate} />
      <DiscoveryShelf title="Director's Cut" playlists={flimPicks} onNavigate={onNavigate} />
      <DiscoveryShelf title="Public Playlists" playlists={publicPlaylistResults} onNavigate={onNavigate} />
      {playlists.length === 0 ? (
        <p className="empty-state">Public playlists will appear here.</p>
      ) : null}
    </div>
  );
}

export function Playlists({ onNavigate, playlists, rewindPlaylists, onCreatePlaylist, currentUser, notice, initialView = "my" }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PlaylistView>(initialView);
  const [showCreate, setShowCreate] = useState(false);
  const [visibleCount, setVisibleCount] = useState(7);
  const directorPlaylists = useMemo(
    () => playlists.filter(isDirectorPlaylist),
    [playlists],
  );
  const sourcePlaylists = useMemo(() => {
    if (view !== "public") return playlists.filter((playlist) => playlist.isOwner);

    return playlists
      .filter((playlist) => playlist.visibility === "public" && !playlist.isSystem && !isTemporaryVerificationPlaylist(playlist))
      .sort((a, b) => {
        const rankDelta = rankPublicPlaylist(a) - rankPublicPlaylist(b);
        if (rankDelta !== 0) return rankDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [playlists, view]);

  useEffect(() => {
    setView(initialView);
    setVisibleCount(7);
    setQuery("");
  }, [initialView]);

  useEffect(() => {
    setVisibleCount(7);
  }, [query, view]);

  useEffect(() => {
    if (!currentUser) {
      setShowCreate(false);
    }
  }, [currentUser]);

  const visiblePlaylists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return sourcePlaylists;
    return sourcePlaylists
      .filter((playlist) =>
        [
          playlist.name,
          playlist.description,
          playlist.visibility,
          playlist.creatorDisplayName || "",
          playlist.creatorHandle || "",
          ...playlist.movies.map((movie) => movie.title),
        ].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
      .sort((a, b) => {
        const scoreDelta = scorePlaylistSearch(a, normalizedQuery) - scorePlaylistSearch(b, normalizedQuery);
        if (scoreDelta !== 0) return scoreDelta;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [query, sourcePlaylists]);

  const visiblePagePlaylists = visiblePlaylists.slice(0, visibleCount);
  const hasMorePlaylists = visiblePlaylists.length > visibleCount;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!currentUser) {
      onNavigate("/signin");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const created = await onCreatePlaylist({ name, description, visibility });
      setName("");
      setDescription("");
      setVisibility("private");
      setShowCreate(false);
      onNavigate(`/playlists/${created.id}`);
    } catch {
      setError("Could not create playlist right now. Please try again shortly.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestCreatePlaylist() {
    if (!currentUser) {
      onNavigate("/signup");
      return;
    }
    setShowCreate((current) => !current);
  }

  return (
    <section className="route-page collections-page">
      {notice ? <p className="success-message">{notice}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      <div className="playlist-shelf-heading playlist-shelf-heading-with-search">
        <div>
          <h1>{view === "public" ? "Public Playlists" : "My Playlists"}</h1>
        </div>
        <label className="collection-search playlist-title-search">
          <span>Search playlists</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder={view === "public" ? "Search to explore public playlists..." : "Search my playlists..."} type="search" value={query} />
        </label>
      </div>

      {view === "my" ? (
        <div className="playlist-page-actions">
          <button className="primary-button" onClick={requestCreatePlaylist} type="button">
            {!currentUser ? "Create Account" : showCreate ? "Close" : "Create Playlist"}
          </button>
        </div>
      ) : null}

      {view === "my" && currentUser ? <ContinueWatchingRow onNavigate={onNavigate} /> : null}
      {view === "my" && currentUser ? <RecommendationShelf onNavigate={onNavigate} /> : null}

      {showCreate ? (
        <form className="collection-create-panel" onSubmit={submit}>
          {!currentUser ? <p className="helper-text">Sign in to create playlists that belong to you.</p> : null}
          <label>
            <span>Playlist name</span>
            <input onChange={(event) => setName(event.target.value)} placeholder="Movie night" required value={name} />
          </label>
          <label>
            <span>Description</span>
            <textarea onChange={(event) => setDescription(event.target.value)} placeholder="A few words for the playlist" value={description} />
          </label>
          <label>
            <span>Visibility</span>
            <select onChange={(event) => setVisibility(event.target.value as Playlist["visibility"])} value={visibility}>
              <option value="private">private</option>
              <option value="shared">shared</option>
              <option value="public">public</option>
            </select>
          </label>
          <button className="primary-button" disabled={isSaving} type="submit">
            {isSaving ? "Creating..." : "Create Playlist"}
          </button>
        </form>
      ) : null}

      {view === "public" ? (
        <PublicDiscovery
          onNavigate={onNavigate}
          playlists={sourcePlaylists}
          query={query}
          searchResults={visiblePlaylists}
          visibleCount={visibleCount}
          onLoadMore={() => setVisibleCount((count) => count + 7)}
        />
      ) : visiblePagePlaylists.length > 0 ? (
        <>
          <PlaylistGrid onNavigate={onNavigate} playlists={visiblePagePlaylists} />
          {hasMorePlaylists ? (
            <div className="load-more-row">
              <button className="secondary-button" onClick={() => setVisibleCount((count) => count + 7)} type="button">
                Load More
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="collection-empty-cinematic">
          <div className="empty-poster-wall" aria-hidden="true">
            {landingPosterSeeds.slice(0, 6).map((poster) => (
              <img
                alt=""
                className="empty-poster-art"
                decoding="async"
                key={`${poster.mediaType}-${poster.title}`}
                loading="lazy"
                src={poster.posterUrl}
              />
            ))}
          </div>
          <div>
            <h2>{query ? "Try another search." : "Create Your First Playlist"}</h2>
            {view === "my" && !query ? (
              <button className="primary-button" onClick={requestCreatePlaylist} type="button">
                {currentUser ? "Create Playlist" : "Create Account"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {view === "my" && directorPlaylists.length > 0 ? (
        <section className="director-cut-section director-cut-secondary" aria-label="Director's Cut">
          <div className="director-cut-header">
            <div>
              <h2>Curated by The Director</h2>
            </div>
            <button className="secondary-button" onClick={() => onNavigate("/@the-director")} type="button">
              Meet The Director
            </button>
          </div>
          <PlaylistGrid onNavigate={onNavigate} playlists={directorPlaylists.slice(0, 6)} />
        </section>
      ) : null}

      {view === "my" && rewindPlaylists.length > 0 ? (
        <section className="rewind-section">
          <div className="playlist-shelf-heading">
            <div>
              <h2>Rewind</h2>
            </div>
          </div>
          <PlaylistGrid onNavigate={onNavigate} playlists={rewindPlaylists} />
        </section>
      ) : null}
    </section>
  );
}
