import { useEffect, useMemo, useState } from "react";
import { followTitle, getFollowedTitleStatus, unfollowTitle } from "../services/followedTitleService";
import type { FollowedTitle, MovieDetails, TitleNotificationSettings } from "../types";

type TitleNotificationKey = keyof TitleNotificationSettings;

interface FollowTitleControlProps {
  movie: MovieDetails;
}

const movieOptions = [
  { key: "theaterRelease", label: "Theater Release" },
  { key: "streamingAvailability", label: "Streaming Availability" },
  { key: "trailerReleased", label: "Trailer Released" },
] as const;

const tvOptions = [
  { key: "newSeasonAnnounced", label: "New Season Announced" },
  { key: "seasonReleaseDate", label: "Season Release Date" },
  { key: "newEpisodeAvailable", label: "New Episode Available" },
  { key: "streamingAvailability", label: "Streaming Availability" },
] as const;

function defaultSettings(mediaType: MovieDetails["mediaType"]): TitleNotificationSettings {
  if (mediaType === "tv") {
    return {
      newSeasonAnnounced: true,
      seasonReleaseDate: true,
      newEpisodeAvailable: false,
      streamingAvailability: true,
    };
  }

  return {
    theaterRelease: true,
    streamingAvailability: true,
    trailerReleased: true,
  };
}

export function FollowTitleControl({ movie }: FollowTitleControlProps) {
  const [followedTitle, setFollowedTitle] = useState<FollowedTitle | null>(null);
  const [settings, setSettings] = useState<TitleNotificationSettings>(() => defaultSettings(movie.mediaType));
  const [isSaving, setIsSaving] = useState(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState(false);
  const [message, setMessage] = useState("");
  const options = useMemo(() => (movie.mediaType === "tv" ? tvOptions : movieOptions), [movie.mediaType]);

  useEffect(() => {
    let mounted = true;
    setMessage("");
    getFollowedTitleStatus(movie.mediaType, movie.tmdbId)
      .then((result) => {
        if (!mounted) return;
        setFollowedTitle(result.followedTitle);
        setSettings(result.followedTitle?.notificationSettings || defaultSettings(movie.mediaType));
      })
      .catch(() => {
        if (mounted) {
          setFollowedTitle(null);
          setSettings(defaultSettings(movie.mediaType));
        }
      });

    return () => {
      mounted = false;
    };
  }, [movie.mediaType, movie.tmdbId]);

  async function saveFollow(openPreferences = true) {
    setIsSaving(true);
    setMessage("");
    try {
      const result = await followTitle(movie, settings);
      setFollowedTitle(result.followedTitle);
      setSettings(result.followedTitle?.notificationSettings || settings);
      setMessage("Following title.");
      if (openPreferences) setIsPreferencesOpen(true);
    } catch (error) {
      setMessage(error instanceof Error && error.message.includes("Sign in") ? "Sign in to follow titles." : "Unable to follow title. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function savePreferences() {
    await saveFollow(false);
    setMessage("Notification preferences saved.");
  }

  async function removeFollow() {
    setIsSaving(true);
    setMessage("");
    try {
      await unfollowTitle(movie.mediaType, movie.tmdbId);
      setFollowedTitle(null);
      setSettings(defaultSettings(movie.mediaType));
      setIsPreferencesOpen(false);
      setMessage("Title unfollowed.");
    } catch {
      setMessage("Unable to unfollow title. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  function toggleSetting(key: TitleNotificationKey) {
    setSettings((current) => ({ ...current, [key]: !current[key] }));
  }

  return (
    <div className="follow-title-control">
      <button
        className={followedTitle ? "follow-title-button is-following" : "follow-title-button"}
        disabled={isSaving}
        onClick={() => (followedTitle ? setIsPreferencesOpen(true) : saveFollow(true))}
        type="button"
      >
        {isSaving ? "Saving..." : followedTitle ? "Following ✓" : "Follow Title"}
      </button>
      {message ? <small className={message.startsWith("Unable") || message.startsWith("Sign in") ? "error-text" : "success-text"}>{message}</small> : null}
      {isPreferencesOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Follow Title preferences">
          <div className="follow-title-modal">
            <div className="modal-header">
              <div>
                <h2>Notify me about</h2>
                <p>{movie.title}</p>
              </div>
              <button className="ghost-button" onClick={() => setIsPreferencesOpen(false)} type="button">Close</button>
            </div>
            <div className="follow-title-options">
              {options.map((option) => (
                <label className="follow-title-option" key={option.key}>
                  <input checked={Boolean(settings[option.key])} onChange={() => toggleSetting(option.key)} type="checkbox" />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <div className="follow-title-actions">
              {followedTitle ? (
                <button className="secondary-button" disabled={isSaving} onClick={removeFollow} type="button">
                  Unfollow
                </button>
              ) : null}
              <button className="primary-button" disabled={isSaving} onClick={savePreferences} type="button">
                {isSaving ? "Saving..." : "Save Preferences"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
