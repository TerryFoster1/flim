import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from "react";
import { InstallFlimPrompt } from "../components/InstallFlimPrompt";
import { FlimAvatar } from "../components/FlimAvatar";
import { ProviderLogo } from "../components/ProviderLogo";
import { PushNotificationSettings } from "../components/PushNotificationSettings";
import { avatarSkins, defaultAvatarKey, flimAvatars, getFlimAvatar } from "../avatarCatalog";
import { getCurrentProfile, saveCurrentProfile } from "../services/profileService";
import { normalizeStreamingRegion, supportedStreamingRegions, watchProviders } from "../services/watchProviderService";
import type { CurrentUser, Playlist, UserProfile } from "../types";

const emptyProfile: UserProfile = {
  displayName: "",
  handle: "",
  bio: "",
  avatarKey: defaultAvatarKey,
  avatarCustomization: {},
  profileImageUrl: "",
  heroImageUrl: "",
  favoriteMovie: "",
  favoriteGenre: "",
  favoriteDirector: "",
  featuredPlaylistIds: [],
  countryCode: "",
  region: "",
  provinceState: "",
  postalCode: "",
  streamingRegion: "",
  preferredProviders: [],
  showCountryPublicly: false,
};

const countries = [
  { code: "", label: "Select country" },
  { code: "CA", label: "Canada" },
  { code: "US", label: "United States" },
  { code: "GB", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
];

function cleanHandle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

interface SettingsProps {
  currentUser: CurrentUser | null;
  onNavigate: (path: string) => void;
  playlists?: Playlist[];
}

export function Settings({ currentUser, onNavigate, playlists = [] }: SettingsProps) {
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const vanityUrl = useMemo(() => (profile.handle ? `https://www.flim.ca/@${profile.handle}` : "Choose a username to create your Flim URL."), [profile.handle]);
  const streamingProviders = useMemo(() => watchProviders.filter((provider) => provider.id !== "plex"), []);
  const publicOwnedPlaylists = useMemo(() => playlists.filter((playlist) => playlist.isOwner && playlist.visibility === "public" && !playlist.isSystem), [playlists]);
  const selectedAvatar = useMemo(() => getFlimAvatar(profile.avatarKey), [profile.avatarKey]);

  useEffect(() => {
    let isActive = true;

    getCurrentProfile()
      .then((result) => {
        if (!isActive) return;
        setProfile({ ...emptyProfile, ...result, streamingRegion: normalizeStreamingRegion(result.streamingRegion || result.countryCode || "CA") });
        setStatus("ready");
      })
      .catch(() => {
        if (!isActive) return;
        setStatus("ready");
        setMessage("Profile settings are available once the database profile table is set up.");
      });

    return () => {
      isActive = false;
    };
  }, []);

  function updateProfile<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function toggleProvider(providerId: string) {
    setProfile((current) => {
      const preferredProviders = current.preferredProviders.includes(providerId)
        ? current.preferredProviders.filter((id) => id !== providerId)
        : [...current.preferredProviders, providerId];

      return { ...current, preferredProviders };
    });
  }

  function toggleFeaturedPlaylist(playlistId: string) {
    setProfile((current) => {
      const selected = current.featuredPlaylistIds || [];
      const featuredPlaylistIds = selected.includes(playlistId)
        ? selected.filter((id) => id !== playlistId)
        : [...selected, playlistId].slice(0, 3);

      return { ...current, featuredPlaylistIds };
    });
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const saved = await saveCurrentProfile(profile);
      setProfile({ ...emptyProfile, ...saved, streamingRegion: normalizeStreamingRegion(saved.streamingRegion || saved.countryCode || "CA") });
      setStatus("saved");
      setMessage("Profile and streaming region saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save profile right now.");
    }
  }

  if (!currentUser) {
    return (
      <section className="route-page settings-page">
        <div className="page-heading">
          <h1>Profile and streaming region</h1>
          <p>Sign in to save your Flim URL and streaming region.</p>
        </div>
        <section className="auth-card">
          <h2>Make your playlists yours.</h2>
          <p>Your username, region, and preferred services belong to your account.</p>
          <div className="button-row">
            <button className="primary-button" onClick={() => onNavigate("/signin")} type="button">Sign In</button>
            <button className="secondary-button" onClick={() => onNavigate("/signup")} type="button">Create Account</button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="route-page settings-page">
      <div className="page-heading">
        <h1>Profile and streaming services</h1>
        <p>Choose your Flim URL, region, and subscriptions so Where To Watch can prioritize what you already have.</p>
      </div>

      <form className="settings-profile-form" onSubmit={saveProfile}>
        <section className="settings-panel">
          <div className="settings-panel-heading">
            <h2>Creator identity</h2>
          </div>
          <label>
            Display Name
            <input
              autoComplete="name"
              value={profile.displayName}
              onChange={(event) => updateProfile("displayName", event.target.value)}
              placeholder="Terry"
            />
          </label>
          <label>
            Username / Vanity URL
            <div className="handle-input-row">
              <span>flim.ca/@</span>
              <input
                autoCapitalize="none"
                autoComplete="username"
                value={profile.handle}
                onChange={(event) => updateProfile("handle", cleanHandle(event.target.value))}
                placeholder="terry"
                required
              />
            </div>
            <small>{vanityUrl}</small>
          </label>
          <label>
            Bio
            <textarea
              value={profile.bio || ""}
              onChange={(event) => updateProfile("bio", event.target.value)}
              placeholder="Movie lists, family picks, and weekend watch ideas."
            />
          </label>
            <div className="avatar-picker">
            <div>
              <h3>Choose your avatar</h3>
              <p>Your avatar is your Flim identity.</p>
            </div>
            <div className="avatar-current-preview">
              <FlimAvatar avatarKey={selectedAvatar.id} label={selectedAvatar.name} size="lg" />
              <div>
                <strong>{selectedAvatar.name}</strong>
                <span>{selectedAvatar.theme}</span>
              </div>
            </div>
            <div className="avatar-picker-grid">
              {flimAvatars.map((avatar) => {
                const selected = selectedAvatar.id === avatar.id;
                return (
                  <button
                    className={selected ? "avatar-option is-selected" : "avatar-option"}
                    key={avatar.key}
                    onClick={() => updateProfile("avatarKey", avatar.key)}
                    type="button"
                  >
                    <FlimAvatar avatarKey={avatar.key} label={avatar.name} size="md" />
                    <strong>{avatar.name}</strong>
                    <span>{avatar.theme}</span>
                  </button>
                );
              })}
            </div>
            <div className="avatar-skin-preview" aria-label="Avatar skins">
              <div>
                <h3>Skins</h3>
                <p>Play trivia, challenges, and events to unlock exclusive Film Critter skins.</p>
              </div>
              <div className="avatar-skin-grid" aria-label="Locked Film Critter skins">
                {avatarSkins.map((skin) => {
                  const skinStyle = {
                    "--skin-face-width": skin.facePlacement.width,
                    "--skin-face-top": skin.facePlacement.top,
                    "--skin-face-left": skin.facePlacement.left,
                  } as CSSProperties;

                  return (
                    <span className={`avatar-skin-chip avatar-skin-${skin.rarity} is-locked`} key={skin.id} title={`${skin.name} skin locked`}>
                      <span className="avatar-skin-art" style={skinStyle} aria-hidden="true">
                        <img className="avatar-skin-base-face" src={selectedAvatar.imagePath} alt="" loading="lazy" decoding="async" />
                        <img className="avatar-skin-costume" src={skin.imagePath} alt="" loading="lazy" decoding="async" />
                        <span className="avatar-skin-lock" />
                      </span>
                      <strong>{skin.name}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="profile-favorites-form">
            <label>
              Favorite Movie
              <input
                value={profile.favoriteMovie || ""}
                onChange={(event) => updateProfile("favoriteMovie", event.target.value)}
                placeholder="Back to the Future"
              />
            </label>
            <label>
              Favorite Genre
              <input
                value={profile.favoriteGenre || ""}
                onChange={(event) => updateProfile("favoriteGenre", event.target.value)}
                placeholder="Sci-Fi"
              />
            </label>
            <label>
              Favorite Director
              <input
                value={profile.favoriteDirector || ""}
                onChange={(event) => updateProfile("favoriteDirector", event.target.value)}
                placeholder="Steven Spielberg"
              />
            </label>
          </div>
          {publicOwnedPlaylists.length > 0 ? (
            <div className="featured-playlist-picker">
              <h3>Featured playlists</h3>
              <p>Choose up to three public playlists to highlight on your curator profile.</p>
              <div className="featured-playlist-options">
                {publicOwnedPlaylists.map((playlist) => {
                  const selected = Boolean(profile.featuredPlaylistIds?.includes(playlist.id));
                  return (
                    <button
                      className={selected ? "featured-playlist-option is-selected" : "featured-playlist-option"}
                      key={playlist.id}
                      onClick={() => toggleFeaturedPlaylist(playlist.id)}
                      type="button"
                    >
                      <strong>{playlist.name}</strong>
                      <span>{selected ? "Featured" : "Feature"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>

        <section className="settings-panel where-you-watch-panel">
          <div className="settings-panel-heading">
            <h2>Where You Watch</h2>
            <p>Region, services, and library connections live together here.</p>
          </div>
          <label>
            Country
            <select
              value={profile.countryCode}
              onChange={(event) => {
                updateProfile("countryCode", event.target.value);
                if (!profile.streamingRegion) updateProfile("streamingRegion", normalizeStreamingRegion(event.target.value));
              }}
            >
              {countries.map((country) => (
                <option key={country.code || "empty"} value={country.code}>
                  {country.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Province / State
            <input
              value={profile.region || ""}
              onChange={(event) => {
                updateProfile("region", event.target.value);
                updateProfile("provinceState", event.target.value);
              }}
              placeholder="Ontario"
            />
          </label>
          <label>
            Postal / ZIP Code optional
            <input
              autoComplete="postal-code"
              value={profile.postalCode || ""}
              onChange={(event) => updateProfile("postalCode", event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            Where To Watch Region
            <select
              value={normalizeStreamingRegion(profile.streamingRegion || profile.countryCode || "CA")}
              onChange={(event) => updateProfile("streamingRegion", event.target.value)}
            >
              {supportedStreamingRegions.map((region) => (
                <option key={region.code} value={region.code}>{region.label}</option>
              ))}
            </select>
          </label>
          <p className="privacy-note">Your province/state, postal code, streaming region, and preferred services stay private. Public profiles can show country only if you opt in.</p>
          <label className="checkbox-row">
            <input
              checked={Boolean(profile.showCountryPublicly)}
              onChange={(event) => updateProfile("showCountryPublicly", event.target.checked)}
              type="checkbox"
            />
            Show my country on my public profile
          </label>

          <div className="settings-subsection">
            <h3>Streaming services</h3>
          <div className="provider-preference-grid">
            {streamingProviders.map((provider) => (
              <button
                className={profile.preferredProviders.includes(provider.id) ? "provider-preference selected" : "provider-preference"}
                key={provider.id}
                onClick={() => toggleProvider(provider.id)}
                aria-label={provider.name}
                type="button"
              >
                <ProviderLogo provider={provider} />
              </button>
            ))}
          </div>
          <p className="helper-text">Choose the services you use most so Flim can personalize watch options as availability improves.</p>

          </div>

          <div className="settings-integration-card">
            <div className="settings-integration-copy">
            <h3>Plex connection</h3>
            <p>
              Plex library linking is not connected yet. Flim will only show this as available after real authentication exists.
            </p>
          </div>
          <div className="settings-integration-actions">
            <ProviderLogo provider={watchProviders.find((provider) => provider.id === "plex") || { id: "plex", name: "Plex" }} />
            <button className="secondary-button" disabled type="button">
              Coming Soon
            </button>
          </div>
          </div>
        </section>

        <PushNotificationSettings />

        <InstallFlimPrompt mode="settings" />

        {message ? <p className={status === "error" ? "error-message" : "success-message"}>{message}</p> : null}
        <button className="primary-button save-settings-button" disabled={status === "loading" || status === "saving"} type="submit">
          {status === "saving" ? "Saving..." : "Save Profile"}
        </button>
      </form>
    </section>
  );
}
