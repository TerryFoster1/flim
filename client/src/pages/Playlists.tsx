import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  notice?: string;
  onDelete?: (playlistId: string) => void | Promise<void>;
  initialView?: CollectionView;
}

type CollectionView = "my" | "public";

export function Playlists({ onNavigate, playlists, onCreatePlaylist, notice, onDelete, initialView = "my" }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<CollectionView>(initialView);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const visiblePlaylists = useMemo(() => {
    const source = view === "public" ? playlists.filter((playlist) => playlist.visibility === "public") : playlists;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return source;
    return source.filter((playlist) =>
      [playlist.name, playlist.description, playlist.visibility].some((value) => value.toLowerCase().includes(normalizedQuery)),
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
      setError("Could not create collection. Check Neon setup.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="route-page collections-page">
      <div className="collections-hero">
        <div>
          <span className="eyebrow">Flim Collections</span>
          <h1>Movie collections, ready to browse.</h1>
        </div>
        <button className="primary-button" onClick={() => setShowCreate((current) => !current)} type="button">
          {showCreate ? "Close" : "Create Collection"}
        </button>
      </div>

      <div className="collections-command-bar">
        <label className="collection-search">
          <span>Search collections</span>
          <input onChange={(event) => setQuery(event.target.value)} placeholder="Search collections..." type="search" value={query} />
        </label>
        <div className="collection-toggle" aria-label="Collection type">
          <button className={view === "my" ? "is-active" : ""} onClick={() => setView("my")} type="button">
            My Collections
          </button>
          <button className={view === "public" ? "is-active" : ""} onClick={() => setView("public")} type="button">
            Public Collections
          </button>
        </div>
      </div>

      {notice ? <p className="success-message">{notice}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}

      {showCreate ? (
        <form className="collection-create-panel" onSubmit={submit}>
          <label>
            <span>Collection name</span>
            <input onChange={(event) => setName(event.target.value)} placeholder="Movie night" required value={name} />
          </label>
          <label>
            <span>Description</span>
            <textarea onChange={(event) => setDescription(event.target.value)} placeholder="A few words for the collection" value={description} />
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
            {isSaving ? "Creating..." : "Create Collection"}
          </button>
        </form>
      ) : null}

      {visiblePlaylists.length > 0 ? (
        <PlaylistGrid onDelete={view === "my" ? onDelete : undefined} onNavigate={onNavigate} playlists={visiblePlaylists} />
      ) : (
        <div className="collection-empty-cinematic">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div>
            <span className="eyebrow">{query ? "No matching collections" : view === "public" ? "Public shelf" : "Your shelf"}</span>
            <h2>{query ? "Try another search." : view === "public" ? "Public collections will appear here." : "Create Your First Collection"}</h2>
            {view === "my" && !query ? (
              <button className="primary-button" onClick={() => setShowCreate(true)} type="button">
                Create Collection
              </button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
