import { useEffect, useState } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { ShareAssetButton } from "../components/ShareAssetButton";
import { followProfile, getPublicProfile, unfollowProfile } from "../services/profileService";
import type { Playlist, PublicUserProfile } from "../types";

interface PublicProfileProps {
  handle: string;
  onNavigate: (path: string) => void;
}

export function PublicProfile({ handle, onNavigate }: PublicProfileProps) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");
  const [followStatus, setFollowStatus] = useState<"idle" | "saving">("idle");
  const [followMessage, setFollowMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    setStatus("loading");

    getPublicProfile(handle)
      .then((result) => {
        if (!isActive) return;
        setProfile(result);
        setPublicPlaylists(result.publicPlaylists || []);
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setProfile(null);
        setStatus("not_found");
      });

    return () => {
      isActive = false;
    };
  }, [handle]);

  async function toggleFollow() {
    if (!profile || profile.isOwnProfile || followStatus === "saving") return;
    setFollowStatus("saving");
    setFollowMessage("");

    try {
      const result = profile.isFollowing ? await unfollowProfile(profile.handle) : await followProfile(profile.handle);
      setProfile((current) => current
        ? {
          ...current,
          isFollowing: result.isFollowing,
          stats: {
            playlistCount: current.stats?.playlistCount || publicPlaylists.length,
            movieCount: current.stats?.movieCount || 0,
            followerCount: result.followerCount,
            followingCount: current.stats?.followingCount || result.followingCount,
            latestPlaylistUpdatedAt: current.stats?.latestPlaylistUpdatedAt,
          },
        }
        : current);
    } catch (error) {
      setFollowMessage(error instanceof Error ? error.message : "Could not update follow right now.");
    } finally {
      setFollowStatus("idle");
    }
  }

  if (status === "loading") {
    return (
      <section className="route-page public-profile-page">
        <div className="public-loading-card">
          <div className="profile-avatar-placeholder" aria-hidden="true">@</div>
          <div>
            <h1>Loading profile...</h1>
          </div>
        </div>
      </section>
    );
  }

  if (status === "not_found" || !profile) {
    return (
      <section className="route-page public-profile-page">
        <div className="page-heading">
          <h1>Profile not found</h1>
          <p>This Flim creator profile may not exist yet.</p>
          <button className="primary-button" onClick={() => onNavigate("/settings")} type="button">
            Choose Your Username
          </button>
        </div>
      </section>
    );
  }

  const playlistCount = profile.stats?.playlistCount || publicPlaylists.length;
  const followerCount = profile.stats?.followerCount || 0;
  const recentlyUpdated = [...publicPlaylists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const mostFollowed = [...publicPlaylists].sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0));
  const selectedFeatured = (profile.featuredPlaylistIds || [])
    .map((id) => publicPlaylists.find((playlist) => playlist.id === id))
    .filter(Boolean) as Playlist[];
  const featuredPlaylists = (selectedFeatured.length > 0 ? selectedFeatured : mostFollowed).slice(0, 3);
  const useSinglePlaylistSection = publicPlaylists.length < 5;
  const featuredIds = new Set(featuredPlaylists.map((playlist) => playlist.id));
  const recentlyUpdatedUnique = recentlyUpdated.filter((playlist) => !featuredIds.has(playlist.id)).slice(0, 6);
  const usedIds = new Set([...featuredIds, ...recentlyUpdatedUnique.map((playlist) => playlist.id)]);
  const mostFollowedUnique = mostFollowed.filter((playlist) => !usedIds.has(playlist.id)).slice(0, 6);
  const joinedAt = profile.joinedAt
    ? new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" }).format(new Date(profile.joinedAt))
    : "";
  const avatarInitial = (profile.displayName || profile.handle).charAt(0).toUpperCase();

  return (
    <section className="route-page public-profile-page">
      <div className="public-profile-hero enhanced-profile-hero">
        {profile.heroImageUrl ? <img className="profile-hero-image" alt="" src={profile.heroImageUrl} /> : <div className="profile-hero-gradient" aria-hidden="true" />}
        <div className="public-profile-header">
          {profile.profileImageUrl ? (
            <img className="profile-avatar-image" alt={`${profile.displayName} profile`} src={profile.profileImageUrl} />
          ) : (
            <div className="profile-avatar-placeholder" aria-hidden="true">{avatarInitial}</div>
          )}
          <div className="public-profile-copy">
            <h1>{profile.displayName || `@${profile.handle}`}</h1>
            <p>@{profile.handle}</p>
            {profile.bio ? <p>{profile.bio}</p> : null}
            <div className="public-profile-meta">
              {joinedAt ? <span>Joined {joinedAt}</span> : null}
              {profile.countryCode ? <span>{profile.countryCode}</span> : null}
              {profile.favoriteGenre ? <span>{profile.favoriteGenre}</span> : null}
            </div>
            <div className="public-profile-stats" aria-label="Creator stats">
              <span><strong>{followerCount}</strong> {followerCount === 1 ? "Follower" : "Followers"}</span>
              <span><strong>{playlistCount}</strong> Public {playlistCount === 1 ? "Playlist" : "Playlists"}</span>
            </div>
            <div className="public-profile-actions">
              {profile.isOwnProfile ? (
                <button className="primary-button" onClick={() => onNavigate("/settings")} type="button">Edit Profile</button>
              ) : (
                <button className={profile.isFollowing ? "secondary-button follow-creator-button following" : "primary-button follow-creator-button"} onClick={toggleFollow} disabled={followStatus === "saving"} type="button">
                  {followStatus === "saving" ? "Saving..." : profile.isFollowing ? "Following" : "Follow Curator"}
                </button>
              )}
              <ShareAssetButton
                label="Share Profile"
                title={profile.displayName || `@${profile.handle}`}
                text="Share this curator profile on Flim."
                url={`/@${profile.handle}`}
                cardUrl={`/api/og/profile/${encodeURIComponent(profile.handle)}`}
                downloadName={`${profile.handle}-flim-profile-card.svg`}
              />
            </div>
            {followMessage ? <p className="error-message">{followMessage}</p> : null}
          </div>
        </div>
      </div>

      {profile.favoriteMovie || profile.favoriteDirector ? (
        <section className="profile-favorites-row" aria-label="Creator favorites">
          {profile.favoriteMovie ? <span><strong>Favorite Movie</strong>{profile.favoriteMovie}</span> : null}
          {profile.favoriteDirector ? <span><strong>Favorite Director</strong>{profile.favoriteDirector}</span> : null}
        </section>
      ) : null}

      {useSinglePlaylistSection ? (
        <section className="settings-panel">
          <h2>Playlists</h2>
          {publicPlaylists.length > 0 ? (
            <PlaylistGrid hideLikes onNavigate={onNavigate} playlists={publicPlaylists} />
          ) : (
            <p>Public playlists from this creator will appear here.</p>
          )}
        </section>
      ) : featuredPlaylists.length > 0 ? (
        <section className="settings-panel">
          <h2>Featured Playlists</h2>
          <PlaylistGrid hideLikes onNavigate={onNavigate} playlists={featuredPlaylists} />
        </section>
      ) : null}

      {!useSinglePlaylistSection && recentlyUpdatedUnique.length > 0 ? (
        <section className="settings-panel">
          <h2>Recently Updated</h2>
          <PlaylistGrid hideLikes onNavigate={onNavigate} playlists={recentlyUpdatedUnique} />
        </section>
      ) : null}

      {!useSinglePlaylistSection && mostFollowedUnique.length > 0 ? (
        <section className="settings-panel">
          <h2>Most Followed</h2>
          <PlaylistGrid hideLikes onNavigate={onNavigate} playlists={mostFollowedUnique} />
        </section>
      ) : null}
    </section>
  );
}
