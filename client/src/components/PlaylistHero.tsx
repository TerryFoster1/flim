import { placeholderPlaylists } from "../data/placeholders";
import { ClonePlaylistButton } from "./ClonePlaylistButton";
import { FollowPlaylistButton } from "./FollowPlaylistButton";
import { SavePlaylistButton } from "./SavePlaylistButton";
import { SharePlaylistButton } from "./SharePlaylistButton";

export function PlaylistHero() {
  const playlist = placeholderPlaylists[0];

  return (
    <div className="playlist-hero">
      <div className="playlist-cover-xl" aria-label="Playlist cover poster placeholders">
        <div />
        <div />
        <div />
        <div />
      </div>
      <div className="playlist-copy">
        <span className="eyebrow">Public playlist</span>
        <h1>{playlist.title}</h1>
        <p>{playlist.description}</p>
        <div className="meta-row">
          <span>Creator: {playlist.creator}</span>
          <span>{playlist.movieCount}</span>
          <span>{playlist.followers}</span>
        </div>
        <div className="button-row">
          <FollowPlaylistButton />
          <SavePlaylistButton />
          <ClonePlaylistButton />
          <SharePlaylistButton />
        </div>
      </div>
    </div>
  );
}
