import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { createPlaylistItem } from "../services/localPlaylistStore";
import type { Playlist } from "../types";

interface PlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  setPlaylists: Dispatch<SetStateAction<Playlist[]>>;
  notice?: string;
  onDelete?: (playlistId: string) => void;
}

export function Playlists({ onNavigate, playlists, setPlaylists, notice, onDelete }: PlaylistsProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = createPlaylistItem({ name, description, visibility });
    setPlaylists((current) => [created, ...current]);
    setName("");
    setDescription("");
    setVisibility("private");
    onNavigate(`/playlists/${created.id}`);
  }

  return (
    <PageShell eyebrow="Playlists" title="Your movie shelves" description="Create local playlists, then add movies from search or movie details.">
      {notice ? <p className="success-message">{notice}</p> : null}
      <form className="playlist-form" onSubmit={submit}>
        <label>
          <span>Playlist name</span>
          <input onChange={(event) => setName(event.target.value)} placeholder="Playlist Name" required value={name} />
        </label>
        <label>
          <span>Description</span>
          <textarea onChange={(event) => setDescription(event.target.value)} placeholder="Playlist description" value={description} />
        </label>
        <label>
          <span>Visibility placeholder</span>
          <select onChange={(event) => setVisibility(event.target.value as Playlist["visibility"])} value={visibility}>
            <option value="private">private</option>
            <option value="shared">shared</option>
            <option value="public">public</option>
          </select>
        </label>
        <button className="primary-button" type="submit">Create Playlist</button>
      </form>
      <PlaylistGrid onDelete={onDelete} onNavigate={onNavigate} playlists={playlists} />
    </PageShell>
  );
}
