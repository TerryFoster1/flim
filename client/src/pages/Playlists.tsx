import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
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
    () => playlists.filter((playlist) => playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director"),
    [playlists],
  );
  const sourcePlaylists = useMemo(() => {
    return view === "public"
      ? playlists.filter((playlist) => playlist.visibility === "public" && !playlist.isSystem && playlist.creatorHandle !== "the-director" && playlist.creatorDisplayName !== "The Director")
      : playlists.filter((playlist) => playlist.isOwner);
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
    return sourcePlaylists.filter((playlist) =>
      [playlist.name, playlist.description, playlist.visibility, ...playlist.movies.map((movie) => movie.title)].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
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

  function browsePublicPlaylists() {
    onNavigate("/public");
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
          <span className="eyebrow">{view === "public" ? "Shared shelves" : "Your shelves"}</span>
          <h1>{view === "public" ? "Public Playlists" : "My Playlists"}</h1>
        </div>
        <label className="collection-search playlist-title-search">
          <span>Search playlists</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder={view === "public" ? "Search public playlists..." : "Search playlists..."} type="search" value={query} />
        </label>
      </div>

      <div className="playlist-page-actions">
        {view === "my" ? (
          <button className="primary-button" onClick={requestCreatePlaylist} type="button">
            {!currentUser ? "Create Account" : showCreate ? "Close" : "Create Playlist"}
          </button>
        ) : (
          <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
            My Playlists
          </button>
        )}
        <button className="secondary-button" onClick={view === "public" ? () => onNavigate("/playlists") : browsePublicPlaylists} type="button">
          {view === "public" ? "Browse My Playlists" : "Browse Public Playlists"}
        </button>
      </div>

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

      {visiblePagePlaylists.length > 0 ? (
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
            <span className="eyebrow">{query ? "No matching playlists" : view === "public" ? "Public shelf" : "Your shelf"}</span>
            <h2>{query ? "Try another search." : view === "public" ? "Public playlists will appear here." : "Create Your First Playlist"}</h2>
            {view === "my" && !query ? (
              <button className="primary-button" onClick={requestCreatePlaylist} type="button">
                {currentUser ? "Create Playlist" : "Create Account"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {directorPlaylists.length > 0 ? (
        <section className="director-cut-section director-cut-secondary" aria-label="Director's Cut">
          <div className="director-cut-header">
            <div>
              <span className="eyebrow">Director's Cut</span>
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
              <span className="eyebrow">Personal shelf</span>
              <h2>Rewind</h2>
            </div>
          </div>
          <PlaylistGrid onNavigate={onNavigate} playlists={rewindPlaylists} />
        </section>
      ) : null}
    </section>
  );
}
