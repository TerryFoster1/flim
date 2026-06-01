import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  notice?: string;
  initialView?: PlaylistView;
}

type PlaylistView = "my" | "public";

const fallbackHeroPosters = [
  "https://image.tmdb.org/t/p/w500/9gk7adHYeDvHkCSEqAvQNLV5Uge.jpg",
  "https://image.tmdb.org/t/p/w500/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
  "https://image.tmdb.org/t/p/w500/6FfCtAuVAW8XJjZ7eWeLibRLWTw.jpg",
  "https://image.tmdb.org/t/p/w500/8UlWHLMpgZm9bx6QYh0NFoq67TZ.jpg",
  "https://image.tmdb.org/t/p/w500/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg",
  "https://image.tmdb.org/t/p/w500/5KCVkau1HEl7ZzfPsKAPM0sMiKc.jpg",
];

function getPlaylistHeroPosters(playlists: Playlist[]) {
  const savedPosters = playlists.flatMap((playlist) => playlist.movies).map((movie) => movie.posterUrl).filter(Boolean) as string[];
  return [...savedPosters, ...fallbackHeroPosters].slice(0, 8);
}

export function Playlists({ onNavigate, playlists, onCreatePlaylist, notice, initialView = "my" }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<PlaylistView>(initialView);
  const [showCreate, setShowCreate] = useState(false);
  const heroPosters = getPlaylistHeroPosters(playlists);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const visiblePlaylists = useMemo(() => {
    const source = view === "public" ? playlists.filter((playlist) => playlist.visibility === "public") : playlists;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return source;
    return source.filter((playlist) =>
      [playlist.name, playlist.description, playlist.visibility, ...playlist.movies.map((movie) => movie.title)].some((value) =>
        value.toLowerCase().includes(normalizedQuery),
      ),
    );
  }, [playlists, query, view]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
      setError("Could not create playlist. Check Neon setup.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="route-page collections-page">
      <section className="collections-cinematic-hero" aria-label="Flim movie playlists">
        <div className="collections-poster-wall" aria-hidden="true">
          {heroPosters.map((posterUrl, index) => (
            <img alt="" key={`${posterUrl}-${index}`} src={posterUrl} />
          ))}
        </div>
        <div className="collections-hero-content">
          <h1>What are we watching tonight?</h1>
          <div className="button-row">
            <button className="primary-button" onClick={() => setShowCreate((current) => !current)} type="button">
              {showCreate ? "Close" : "Create Playlist"}
            </button>
            <button className="secondary-button" onClick={() => window.dispatchEvent(new CustomEvent("flim:open-roulette"))} type="button">
              Spin Roulette
            </button>
          </div>
        </div>
      </section>

      <div className="collections-command-bar">
        <label className="collection-search">
          <span>Playlists</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search playlists..." type="search" value={query} />
        </label>
        <div className="collection-toggle" aria-label="Playlist type">
          <button className={view === "my" ? "is-active" : ""} onClick={() => setView("my")} type="button">
            My Playlists
          </button>
          <button className={view === "public" ? "is-active" : ""} onClick={() => setView("public")} type="button">
            Public Playlists
          </button>
        </div>
      </div>

      {notice ? <p className="success-message">{notice}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      {showCreate ? (
        <form className="collection-create-panel" onSubmit={submit}>
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

      {visiblePlaylists.length > 0 ? (
        <PlaylistGrid onNavigate={onNavigate} playlists={visiblePlaylists} />
      ) : (
        <div className="collection-empty-cinematic">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div>
            <span className="eyebrow">{query ? "No matching playlists" : view === "public" ? "Public shelf" : "Your shelf"}</span>
            <h2>{query ? "Try another search." : view === "public" ? "Public playlists will appear here." : "Create Your First Playlist"}</h2>
            {view === "my" && !query ? (
              <button className="primary-button" onClick={() => setShowCreate(true)} type="button">
                Create Playlist
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
