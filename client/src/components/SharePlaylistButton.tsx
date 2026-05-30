import { useState } from "react";

interface SharePlaylistButtonProps {
  playlistId: string;
}

export function SharePlaylistButton({ playlistId }: SharePlaylistButtonProps) {
  const [shareUrl, setShareUrl] = useState("");
  const url = `${window.location.origin}/playlists/${playlistId}`;

  async function share() {
    try {
      await navigator.clipboard.writeText(url);
      setShareUrl("Playlist link copied.");
    } catch {
      setShareUrl(url);
    }
  }

  return (
    <span className="share-control">
      <button onClick={share} type="button">Share Playlist</button>
      {shareUrl ? <small>{shareUrl}</small> : null}
    </span>
  );
}
