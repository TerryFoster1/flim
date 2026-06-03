import { useEffect, useState } from "react";
import { MovieGrid } from "../components/MovieGrid";
import { SharePlaylistButton } from "../components/SharePlaylistButton";
import { followPlaylist, getPublicPlaylistBySlug, unfollowPlaylist } from "../services/apiPlaylistStore";
import type { CurrentUser, Playlist } from "../types";

interface PublicPlaylistProps {
  publicSlug: string;
  onNavigate: (path: string) => void;
  currentUser: CurrentUser | null;
  onFollowChanged?: () => void | Promise<void>;
}

function formatFollowerCount(count = 0) {
  return `${count} ${count === 1 ? "follower" : "followers"}`;
}

function creatorLabel(playlist: Playlist) {
  const isDirectorPlaylist = playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
  if (isDirectorPlaylist) return "Curated by The Director";
  if (playlist.creatorHandle) return `Created by @${playlist.creatorHandle}`;
  if (playlist.creatorDisplayName) return `Created by ${playlist.creatorDisplayName}`;
  return "Created by Flim user";
}

export function PublicPlaylist({ publicSlug, onNavigate, currentUser, onFollowChanged }: PublicPlaylistProps) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");
  const [followStatus, setFollowStatus] = useState("");
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);

  useEffect(() => {
    let isActive = true;
    setStatus("loading");

    getPublicPlaylistBySlug(publicSlug)
      .then((result) => {
        if (!isActive) return;
        setPlaylist(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setPlaylist(null);
        setStatus("not_found");
      });

    return () => {
      isActive = false;
    };
  }, [publicSlug]);

  if (status === "loading") {
    return (
      <section className="route-page public-playlist-page">
        <div className="public-loading-card">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div>
            <span className="eyebrow">Shared Playlist</span>
            <h1>Loading the movie shelf...</h1>
          </div>
        </div>
      </section>
    );
  }

  if (status === "not_found" || !playlist) {
    return (
      <section className="route-page public-playlist-page">
        <div className="page-heading">
          <span className="eyebrow">Shared Playlist</span>
          <h1>Playlist not found</h1>
          <p>This public playlist may have been deleted or the link may be incorrect.</p>
        </div>
      </section>
    );
  }

  function openSharedRoulette() {
    window.dispatchEvent(new CustomEvent("flim:open-roulette", { detail: { playlists: [playlist] } }));
  }

  const isDirectorPlaylist = playlist.creatorHandle === "the-director" || playlist.creatorDisplayName === "The Director";
  const creatorText = creatorLabel(playlist);

  async function toggleFollow() {
    const currentPlaylist = playlist;
    if (!currentPlaylist) return;
    if (!currentUser) {
      onNavigate("/signin");
      return;
    }
    if (currentPlaylist.isOwner) return;

    setIsUpdatingFollow(true);
    setFollowStatus("");

    try {
      const result = currentPlaylist.isFollowing ? await unfollowPlaylist(currentPlaylist.id) : await followPlaylist(currentPlaylist.id);
      setPlaylist((current) =>
        current
          ? {
              ...current,
              followerCount: result.followerCount,
              isFollowing: result.isFollowing,
            }
          : current,
      );
      setFollowStatus(result.isFollowing ? "Playlist followed." : "Playlist unfollowed.");
      await onFollowChanged?.();
    } catch {
      setFollowStatus("Unable to update follow. Please try again.");
    } finally {
      setIsUpdatingFollow(false);
    }
  }

  return (
    <section className="route-page public-playlist-page">
      <div className="public-playlist-hero">
        <div className="public-hero-backdrop" aria-hidden="true">
          {playlist.movies.slice(0, 9).map((movie, index) =>
            movie.posterUrl ? <img alt="" key={`${movie.tmdbId}-${index}`} src={movie.posterUrl} /> : <span key={`${movie.tmdbId}-${index}`} />,
          )}
        </div>
        <div className="playlist-cover-xl public-cover-art" aria-label="Playlist cover">
          {playlist.movies.slice(0, 4).map((movie) =>
            movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <div key={movie.tmdbId} />,
          )}
          {playlist.movies.length === 0 ? (
            <>
              <div />
              <div />
              <div />
              <div />
            </>
          ) : null}
        </div>
        <div className="playlist-copy public-playlist-copy">
          <span className="eyebrow">Shared Flim playlist</span>
          <h1>{playlist.name}</h1>
          {playlist.description ? <p>{playlist.description}</p> : null}
          <div className="meta-row">
            <span>{playlist.movies.length} titles</span>
            <span>{formatFollowerCount(playlist.followerCount || 0)}</span>
          </div>
          <div className="meta-row public-creator-row">
            {isDirectorPlaylist ? (
              <button className="creator-handle-link" onClick={() => onNavigate("/@the-director")} type="button">
                {creatorText}
              </button>
            ) : playlist.creatorHandle ? (
              <button className="creator-handle-link" onClick={() => onNavigate(`/@${playlist.creatorHandle}`)} type="button">
                {creatorText}
              </button>
            ) : (
              <span>{creatorText}</span>
            )}
            <span>Shared via Flim</span>
          </div>
          <div className="button-row public-share-actions">
            {!playlist.isOwner ? (
              <button className={playlist.isFollowing ? "secondary-button" : "primary-button"} disabled={isUpdatingFollow} onClick={toggleFollow} type="button">
                {isUpdatingFollow ? "Saving..." : playlist.isFollowing ? "Following" : "Follow Playlist"}
              </button>
            ) : null}
            <SharePlaylistButton playlist={playlist} label="Share Playlist" />
          </div>
          {followStatus ? <p className={followStatus.startsWith("Unable") ? "error-message" : "success-message"}>{followStatus}</p> : null}
          <div className="button-row">
            <button className="secondary-button" onClick={openSharedRoulette} type="button">
              Now Playing
            </button>
            <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
              Create your own playlist
            </button>
          </div>
        </div>
      </div>
      <div className="public-playlist-intro">
        <div>
          <span className="eyebrow">Poster Wall</span>
          <h2>Browse the list</h2>
        </div>
        <p>Open any movie to see details, where-to-watch options, trailers, soundtracks, and media extensions.</p>
      </div>
      {playlist.movies.length > 0 ? (
        <MovieGrid
          movies={playlist.movies}
          onNavigate={onNavigate}
        />
      ) : (
        <div className="public-empty-movie-night">
          <div className="empty-poster-wall" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} />)}
          </div>
          <div>
            <span className="eyebrow">Movie shelf</span>
            <h2>This playlist is ready for its first poster.</h2>
            <p>The shared page will fill with movie artwork as soon as movies are added.</p>
          </div>
        </div>
      )}
    </section>
  );
}
