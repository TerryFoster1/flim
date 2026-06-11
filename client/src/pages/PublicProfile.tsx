import { useEffect, useState } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
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
            movieCount: current.stats?.movieCount || publicPlaylists.reduce((total, playlist) => total + playlist.movies.length, 0),
            followerCount: result.followerCount,
            followingCount: result.followingCount,
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
  const titleCount = profile.stats?.movieCount || publicPlaylists.reduce((total, playlist) => total + playlist.movies.length, 0);
  const followerCount = profile.stats?.followerCount || 0;
  const followingCount = profile.stats?.followingCount || 0;
  const achievementCount = profile.achievements?.achievementCount || 0;
  const totalAchievementPoints = profile.achievements?.totalPoints || 0;
  const featuredBadges = profile.achievements?.featuredBadges || [];
  const challengeCount = profile.challenges?.challengeCount || 0;
  const challengePoints = profile.challenges?.challengePoints || 0;
  const challengeBadges = profile.challenges?.featuredBadges || [];
  const recentlyUpdated = [...publicPlaylists].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const mostFollowed = [...publicPlaylists].sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0));
  const featuredPlaylists = mostFollowed.slice(0, 3);
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
              <span><strong>{followingCount}</strong> Following</span>
              <span><strong>{playlistCount}</strong> Public {playlistCount === 1 ? "Playlist" : "Playlists"}</span>
              <span><strong>{titleCount}</strong> {titleCount === 1 ? "Title" : "Titles"}</span>
              <span><strong>{achievementCount}</strong> {achievementCount === 1 ? "Badge" : "Badges"}</span>
              <span><strong>{totalAchievementPoints}</strong> Points</span>
              <span><strong>{challengeCount}</strong> {challengeCount === 1 ? "Challenge" : "Challenges"}</span>
              <span><strong>{challengePoints}</strong> Challenge Points</span>
            </div>
            <div className="public-profile-actions">
              {profile.isOwnProfile ? (
                <button className="primary-button" onClick={() => onNavigate("/settings")} type="button">Edit Profile</button>
              ) : (
                <button className={profile.isFollowing ? "secondary-button follow-creator-button following" : "primary-button follow-creator-button"} onClick={toggleFollow} disabled={followStatus === "saving"} type="button">
                  {followStatus === "saving" ? "Saving..." : profile.isFollowing ? "Following ✓" : "Follow"}
                </button>
              )}
              <button className="secondary-button" onClick={() => navigator.clipboard?.writeText(`https://www.flim.ca/@${profile.handle}`)} type="button">
                Share Profile
              </button>
            </div>
            {followMessage ? <p className="error-message">{followMessage}</p> : null}
            {featuredBadges.length > 0 ? (
              <div className="profile-badge-row" aria-label="Featured badges">
                {featuredBadges.map((badge) => (
                  <span className={`profile-badge profile-badge-${badge.rarity || "common"}`} key={badge.id} title={badge.description}>
                    <strong>{badge.name}</strong>
                    <small>{badge.points || 0} pts</small>
                  </span>
                ))}
              </div>
            ) : null}
            {challengeBadges.length > 0 ? (
              <div className="profile-badge-row" aria-label="Featured challenge badges">
                {challengeBadges.map((badge) => (
                  <span className="profile-badge profile-badge-epic" key={badge.id} title={badge.description}>
                    <strong>{badge.name}</strong>
                    <small>{badge.points || 0} challenge pts</small>
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {profile.favoriteMovie || profile.favoriteDirector ? (
        <section className="profile-favorites-row" aria-label="Creator favorites">
          {profile.favoriteMovie ? <span><strong>Favorite Movie</strong>{profile.favoriteMovie}</span> : null}
          {profile.favoriteDirector ? <span><strong>Favorite Director</strong>{profile.favoriteDirector}</span> : null}
        </section>
      ) : null}

      {featuredPlaylists.length > 0 ? (
        <section className="settings-panel">
          <h2>Featured Playlists</h2>
          <PlaylistGrid onNavigate={onNavigate} playlists={featuredPlaylists} />
        </section>
      ) : null}

      <section className="settings-panel">
        <h2>Recently Updated</h2>
        {recentlyUpdated.length > 0 ? (
          <PlaylistGrid onNavigate={onNavigate} playlists={recentlyUpdated} />
        ) : (
          <p>Public playlists from this creator will appear here.</p>
        )}
      </section>

      {mostFollowed.length > 0 ? (
        <section className="settings-panel">
          <h2>Most Followed</h2>
          <PlaylistGrid onNavigate={onNavigate} playlists={mostFollowed} />
        </section>
      ) : null}

      <section className="settings-panel">
        <h2>All Public Playlists</h2>
        {publicPlaylists.length > 0 ? (
          <PlaylistGrid onNavigate={onNavigate} playlists={publicPlaylists} />
        ) : (
          <p>Public playlists from this creator will appear here.</p>
        )}
      </section>
    </section>
  );
}
