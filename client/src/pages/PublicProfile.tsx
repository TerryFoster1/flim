import { useEffect, useState } from "react";
import { getPublicProfile } from "../services/profileService";
import type { PublicUserProfile } from "../types";

interface PublicProfileProps {
  handle: string;
  onNavigate: (path: string) => void;
}

export function PublicProfile({ handle, onNavigate }: PublicProfileProps) {
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "not_found">("loading");

  useEffect(() => {
    let isActive = true;
    setStatus("loading");

    getPublicProfile(handle)
      .then((result) => {
        if (!isActive) return;
        setProfile(result);
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
        </div>
      </div>
      <section className="settings-panel">
        <span className="eyebrow">Coming Next</span>
        <h2>Public playlists</h2>
        <p>
          This profile URL is ready for future creator pages. Public playlists, saved/shared lists, and creator stats
          will appear here without exposing private streaming region or postal code details.
        </p>
      </section>
    </section>
  );
}
