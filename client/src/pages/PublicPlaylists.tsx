import { PageShell } from "../components/PageShell";
import { PlaylistGrid } from "../components/PlaylistGrid";
import type { Playlist } from "../types";

interface PublicPlaylistsProps {
  onNavigate: (path: string) => void;
  playlists: Playlist[];
  clonePlaylist: (playlistId: string) => void;
}

export function PublicPlaylists({ onNavigate, playlists, clonePlaylist }: PublicPlaylistsProps) {
  const publicPlaylists = playlists.filter((playlist) => playlist.visibility === "public");

  return (
    <PageShell eyebrow="Public" title="Community movie playlists" description="Local MVP preview of public playlists. Real sharing comes later.">
      <PlaylistGrid onNavigate={onNavigate} playlists={publicPlaylists} />
      {publicPlaylists.length > 0 ? (
        <div className="button-row">
          {publicPlaylists.slice(0, 3).map((playlist) => (
            <button className="secondary-button" key={playlist.id} onClick={() => clonePlaylist(playlist.id)} type="button">
              Clone Playlist
            </button>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
