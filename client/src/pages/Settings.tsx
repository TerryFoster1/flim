import { useEffect, useMemo, useState, type FormEvent } from "react";
import { InstallFlimPrompt } from "../components/InstallFlimPrompt";
import { ProviderLogo } from "../components/ProviderLogo";
import { PushNotificationSettings } from "../components/PushNotificationSettings";
import { getCurrentProfile, saveCurrentProfile } from "../services/profileService";
import { watchProviders } from "../services/watchProviderService";
import type { CurrentUser, UserProfile } from "../types";

const emptyProfile: UserProfile = {
  displayName: "",
  handle: "",
  bio: "",
  profileImageUrl: "",
  heroImageUrl: "",
  favoriteMovie: "",
  favoriteGenre: "",
  favoriteDirector: "",
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
}

export function Settings({ currentUser, onNavigate }: SettingsProps) {
  const [profile, setProfile] = useState<UserProfile>(emptyProfile);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  const vanityUrl = useMemo(() => (profile.handle ? `https://www.flim.ca/@${profile.handle}` : "Choose a username to create your Flim URL."), [profile.handle]);
  const streamingProviders = useMemo(() => watchProviders.filter((provider) => provider.id !== "plex"), []);

  useEffect(() => {
    let isActive = true;

    getCurrentProfile()
      .then((result) => {
        if (!isActive) return;
        setProfile({ ...emptyProfile, ...result });
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

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const saved = await saveCurrentProfile(profile);
      setProfile({ ...emptyProfile, ...saved });
      setStatus("saved");
      setMessage("Profile and streaming region saved.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not save profile right now.");
    }
  }

  function saveRegionOnly() {
    const form = document.querySelector<HTMLFormElement>(".settings-profile-form");
    form?.requestSubmit();
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
        <h1>Profile and streaming region</h1>
        <p>Choose your Flim URL and set where you watch so provider results can become more accurate.</p>
      </div>

      <section className="region-onboarding-card">
        <div>
          <h2>Make Where to Watch trustworthy</h2>
          <p>
            Streaming availability changes by country. Set your region so Flim does not tell you a movie is available
            somewhere you cannot actually watch it.
          </p>
          <small>Flim uses your region to show more accurate streaming availability. We do not need your full address.</small>
        </div>
        <div className="button-row">
          <button className="primary-button" onClick={saveRegionOnly} type="button">
            Save Region
          </button>
          <button className="secondary-button" onClick={() => setMessage("You can set your streaming region later.")} type="button">
            Skip for now
          </button>
        </div>
      </section>

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
          <label>
            Profile Picture URL
            <input
              autoComplete="url"
              value={profile.profileImageUrl || ""}
              onChange={(event) => updateProfile("profileImageUrl", event.target.value)}
              placeholder="https://..."
              type="url"
            />
          </label>
          <label>
            Hero Image URL
            <input
              autoComplete="url"
              value={profile.heroImageUrl || ""}
              onChange={(event) => updateProfile("heroImageUrl", event.target.value)}
              placeholder="https://..."
              type="url"
            />
          </label>
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
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading">
            <h2>Location for availability</h2>
          </div>
          <label>
            Country
            <select value={profile.countryCode} onChange={(event) => updateProfile("countryCode", event.target.value)}>
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
            Primary Streaming Region
            <input
              value={profile.streamingRegion}
              onChange={(event) => updateProfile("streamingRegion", event.target.value)}
              placeholder="Canada"
            />
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
        </section>

        <section className="settings-panel">
          <div className="settings-panel-heading">
            <h2>Your watch services</h2>
          </div>
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
        </section>

        <section className="settings-integration-card">
          <div className="settings-integration-copy">
            <h2>Connect Plex</h2>
            <p>
              Link your Plex library so Flim can know what you already own and prioritize Plex when choosing what to watch.
            </p>
          </div>
          <div className="settings-integration-actions">
            <ProviderLogo provider={watchProviders.find((provider) => provider.id === "plex") || { id: "plex", name: "Plex" }} />
            <button className="secondary-button" disabled type="button">
              Coming Soon
            </button>
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
