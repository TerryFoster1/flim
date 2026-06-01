import { useEffect, useState } from "react";
import { PlaylistGrid } from "../components/PlaylistGrid";
import { getPublicProfile } from "../services/profileService";
import type { Playlist, PublicUserProfile } from "../types";

interface PublicProfileProps {
  handle: string;
  onNavigate: (path: string) => void;
}

export function PublicProfile({ handle, onNavigate }: PublicProfileProps) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [publicPlaylists, setPublicPlaylists] = useState<Playlist[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");

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

  if (status === "loading") {
    return (
      <section className="route-page public-profile-page">
        <div className="public-loading-card">
          <div className="profile-avatar-placeholder" aria-hidden="true">@</div>
          <div>
            <span className="eyebrow">Creator Profile</span>
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
          <span className="eyebrow">Creator Profile</span>
          <h1>Profile not found</h1>
          <p>This Flim creator profile may not exist yet.</p>
          <button className="primary-button" onClick={() => onNavigate("/settings")} type="button">
            Choose Your Username
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="route-page public-profile-page">
      <div className="public-profile-hero">
        <div className="profile-avatar-placeholder" aria-hidden="true">
          {profile.displayName.charAt(0) || profile.handle.charAt(0)}
        </div>
        <div>
          <span className="eyebrow">Flim Creator</span>
          <h1>{profile.displayName}</h1>
          <p>@{profile.handle}</p>
          {profile.bio ? <p>{profile.bio}</p> : null}
          {profile.countryCode ? <small>{profile.countryCode}</small> : null}
          <div className="public-profile-stats" aria-label="Creator stats">
            <span><strong>{profile.stats?.playlistCount || publicPlaylists.length}</strong> Playlists</span>
            <span><strong>{profile.stats?.movieCount || publicPlaylists.reduce((total, playlist) => total + playlist.movies.length, 0)}</strong> Titles</span>
            <span><strong>{profile.stats?.futureFollowerCount || 0}</strong> Followers soon</span>
          </div>
        </div>
      </div>
      <section className="settings-panel">
        <span className="eyebrow">Public Playlists</span>
        <h2>{profile.displayName}'s playlists</h2>
        {publicPlaylists.length > 0 ? (
          <PlaylistGrid onNavigate={onNavigate} playlists={publicPlaylists} />
        ) : (
          <p>Public playlists from this creator will appear here.</p>
        )}
      </section>
    </section>
  );
}
