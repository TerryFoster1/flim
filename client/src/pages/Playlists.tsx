import { useState, type FormEvent } from "react";
import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  onCreatePlaylist: (input: Pick<Playlist, "name" | "description" | "visibility">) => Promise<Playlist>;
  notice?: string;
  onDelete?: (playlistId: string) => void | Promise<void>;
}

export function Playlists({ onNavigate, playlists, onCreatePlaylist, notice, onDelete }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      const created = await onCreatePlaylist({ name, description, visibility });
      setName("");
      setDescription("");
      setVisibility("private");
      onNavigate(`/playlists/${created.id}`);
    } catch {
      setError("Could not create playlist. Check Neon setup.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageShell eyebrow="My Playlists" title="Movie collections">
      {notice ? <p className="success-message">{notice}</p> : null}
      {error ? <p className="error-message">{error}</p> : null}
      <form className="playlist-form" onSubmit={submit}>
        <label>
          <span>Playlist name</span>
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
        <button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "Creating..." : "Create Playlist"}</button>
      </form>
      <PlaylistGrid onDelete={onDelete} onNavigate={onNavigate} playlists={playlists} />
    </PageShell>
  );
}
