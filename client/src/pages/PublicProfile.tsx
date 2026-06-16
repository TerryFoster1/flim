import { useEffect, useState } from "react";
import { FlimAvatar } from "../components/FlimAvatar";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { ShareAssetButton } from "../components/ShareAssetButton";
import { followProfile, getPublicProfile, unfollowProfile } from "../services/profileService";
import type { Playlist, PublicUserProfile } from "../types";

interface PublicProfileProps {
  handle: string;
  onNavigate: (path: string) => void;
}

function bannerPosters(profile: PublicUserProfile, playlists: Playlist[]) {
  const preferredIds = new Set(profile.featuredPlaylistIds || []);
  const preferred = playlists.filter((playlist) => preferredIds.has(playlist.id));
  const sourcePlaylists = (preferred.length ? preferred : playlists).slice(0, 4);
  const posters = sourcePlaylists.flatMap((playlist) => playlist.movies || [])
    .map((movie) => movie.posterUrl)
    .filter(Boolean) as string[];
  return [...new Set(posters)].slice(0, 6);
}

function formatProfileNumber(value?: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatProfileDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function scoreLabel(item: { score?: number; correctCount?: number; totalCount?: number }) {
  if (typeof item.correctCount === "number" && typeof item.totalCount === "number" && item.totalCount > 0) {
    return `${item.correctCount}/${item.totalCount}`;
  }
  if (typeof item.score === "number") return `${formatProfileNumber(item.score)} pts`;
  return "Completed";
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
          <FlimAvatar avatarKey="director" label="Loading curator profile" size="lg" />
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
  const posters = bannerPosters(profile, publicPlaylists);
  const tasteLabel = profile.favoriteGenre ? `${profile.favoriteGenre} Curator` : "Movie Curator";
  const gameStats = profile.triviaAndChallenges;
  const legacyChallengeCount = (profile.challenges?.challengeCount || 0) + (profile.seasonalChallenges?.seasonalBadgeCount || 0);
  const challengesCompleted = gameStats?.publicChallengesCompleted ?? legacyChallengeCount;
  const friendChallengesCompleted = gameStats?.friendChallengesCompleted || 0;
  const titleTriviaCompleted = gameStats?.titleTriviaCompleted || 0;
  const perfectScores = gameStats?.perfectScores || 0;
  const badgeCount = (profile.achievements?.achievementCount || 0) +
    (profile.challenges?.featuredBadges?.length || 0) +
    (profile.seasonalChallenges?.featuredBadges?.length || 0);
  const badgeRows = [
    ...(profile.achievements?.featuredBadges || []).map((badge) => ({
      id: badge.id,
      name: badge.name,
      detail: badge.description,
      mark: badge.badgeIcon || "star",
      earnedAt: badge.unlockedAt,
    })),
    ...(profile.challenges?.featuredBadges || []).map((badge) => ({
      id: badge.id,
      name: badge.name,
      detail: badge.description,
      mark: badge.badge || "star",
      earnedAt: badge.earnedAt,
    })),
    ...(profile.seasonalChallenges?.featuredBadges || []).map((badge) => ({
      id: badge.id,
      name: badge.name,
      detail: badge.description,
      mark: badge.badge || "star",
      earnedAt: badge.earnedAt,
    })),
  ].slice(0, 6);

  return (
    <section className="route-page public-profile-page">
      <div className="public-profile-hero enhanced-profile-hero">
        <div className={posters.length > 0 ? "profile-taste-banner has-posters" : "profile-taste-banner"} aria-label={`${tasteLabel} banner`}>
          <div className="profile-taste-banner-copy">
            <span>{tasteLabel}</span>
            <strong>{profile.favoriteMovie || featuredPlaylists[0]?.name || "Curated on Flim"}</strong>
          </div>
          <div className="profile-poster-collage" aria-hidden="true">
            {posters.length > 0 ? posters.map((poster, index) => (
              <img alt="" key={`${poster}-${index}`} src={poster} />
            )) : (
              <>
                <span />
                <span />
                <span />
                <span />
              </>
            )}
          </div>
        </div>
        <div className="public-profile-header">
          <FlimAvatar avatarKey={profile.avatarKey} label={profile.displayName || profile.handle} size="lg" />
          <div className="public-profile-copy">
            <h1>{profile.displayName || `@${profile.handle}`}</h1>
            <p>@{profile.handle}</p>
            {profile.bio ? <p>{profile.bio}</p> : null}
            {profile.profileStatus ? <p className="profile-status-line">{profile.profileStatus}</p> : null}
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
                downloadName={`${profile.handle}-flim-profile-card.png`}
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

      <details className="settings-panel public-profile-games-panel">
        <summary>
          <span>
            <strong>Trivia & Challenges</strong>
            <small>Completed games, public challenges, and badges</small>
          </span>
          <span className="profile-games-summary-count">{formatProfileNumber(titleTriviaCompleted + challengesCompleted + friendChallengesCompleted)} completed</span>
        </summary>

        <div className="profile-games-summary-grid" aria-label="Trivia and challenge summary">
          <span><strong>{formatProfileNumber(challengesCompleted)}</strong>Public challenges</span>
          <span><strong>{formatProfileNumber(titleTriviaCompleted)}</strong>Title trivia completed</span>
          <span><strong>{formatProfileNumber(friendChallengesCompleted)}</strong>Friends & family</span>
          <span><strong>{formatProfileNumber(perfectScores)}</strong>Perfect scores</span>
          {typeof gameStats?.totalTicketsEarned === "number" ? <span><strong>{formatProfileNumber(gameStats.totalTicketsEarned)}</strong>Tickets earned</span> : null}
          <span><strong>{formatProfileNumber(badgeCount)}</strong>Badges earned</span>
        </div>

        <div className="profile-games-detail-grid">
          <section>
            <h3>Title Trivia Completed</h3>
            {gameStats?.recentTitleTrivia?.length ? (
              <div className="profile-games-list">
                {gameStats.recentTitleTrivia.slice(0, 5).map((item) => (
                  <button key={`${item.mediaType}-${item.tmdbId}-${item.completedAt || ""}`} onClick={() => onNavigate(item.path)} type="button">
                    <span>
                      <strong>{item.title}</strong>
                      <small>Title Trivia{formatProfileDate(item.completedAt) ? ` • ${formatProfileDate(item.completedAt)}` : ""}</small>
                    </span>
                    <em>{scoreLabel(item)}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state">No title trivia completed yet.</p>
            )}
          </section>

          <section>
            <h3>Public Challenges Completed</h3>
            {gameStats?.recentPublicChallenges?.length ? (
              <div className="profile-games-list">
                {gameStats.recentPublicChallenges.slice(0, 5).map((item) => (
                  <button key={`${item.id}-${item.completedAt || ""}`} onClick={() => onNavigate(item.path)} type="button">
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.type}{formatProfileDate(item.completedAt) ? ` • ${formatProfileDate(item.completedAt)}` : ""}</small>
                    </span>
                    <em>{typeof item.score === "number" ? `${formatProfileNumber(item.score)} pts` : "Completed"}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state">No public challenges completed yet.</p>
            )}
          </section>

          <section>
            <h3>Friends & Family</h3>
            {gameStats?.recentFriendChallenges?.length ? (
              <div className="profile-games-list">
                {gameStats.recentFriendChallenges.slice(0, 5).map((item) => (
                  <button key={`${item.id}-${item.completedAt || ""}`} onClick={() => onNavigate(item.path)} type="button">
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.result ? `${item.result.toUpperCase()}${formatProfileDate(item.completedAt) ? ` • ${formatProfileDate(item.completedAt)}` : ""}` : "Friend Challenge"}</small>
                    </span>
                    <em>{typeof item.score === "number" ? `${formatProfileNumber(item.score)} pts` : "Played"}</em>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty-state">No friend challenge results yet.</p>
            )}
          </section>

          <section>
            <h3>Badges</h3>
            {badgeRows.length ? (
              <div className="profile-badge-list">
                {badgeRows.map((badge) => (
                  <article key={`${badge.id}-${badge.earnedAt || ""}`}>
                    <span>{badge.mark}</span>
                    <div>
                      <strong>{badge.name}</strong>
                      {badge.detail ? <small>{badge.detail}</small> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="empty-state">No badges earned yet.</p>
            )}
          </section>
        </div>
      </details>

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
