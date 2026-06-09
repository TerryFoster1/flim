import { useEffect, useState } from "react";
import {
  browserSupportsPush,
  disablePushNotifications,
  enablePushNotifications,
  getBrowserNotificationPermission,
  getPushSubscriptionStatus,
  savePushNotificationPreferences,
} from "../services/pushNotificationService";
import type { PushNotificationPreferences, PushSubscriptionStatus } from "../types";

const categoryOptions: Array<{ key: keyof PushNotificationPreferences; label: string }> = [
  { key: "movies", label: "Movies" },
  { key: "tvShows", label: "TV Shows" },
  { key: "streamingAvailability", label: "Streaming Availability" },
  { key: "trailers", label: "Trailers" },
  { key: "releaseDates", label: "Release Dates" },
];

export function PushNotificationSettings() {
  const [status, setStatus] = useState<PushSubscriptionStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const permission = getBrowserNotificationPermission();
  const supported = browserSupportsPush();

  function refresh() {
    setState("loading");
    getPushSubscriptionStatus()
      .then((result) => {
        setStatus(result);
        setState("ready");
      })
      .catch((error) => {
        setState("error");
        setMessage(error instanceof Error ? error.message : "Unable to load notification settings.");
      });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function enable() {
    setState("saving");
    setMessage("");
    try {
      await enablePushNotifications();
      setMessage("Push notifications enabled.");
      refresh();
    } catch (error) {
      setState("ready");
      setMessage(error instanceof Error ? error.message : "Unable to enable push notifications.");
    }
  }

  async function disable() {
    setState("saving");
    setMessage("");
    try {
      await disablePushNotifications();
      setMessage("Push notifications disabled.");
      refresh();
    } catch (error) {
      setState("ready");
      setMessage(error instanceof Error ? error.message : "Unable to disable push notifications.");
    }
  }

  async function toggleCategory(key: keyof PushNotificationPreferences) {
    if (!status) return;
    const preferences = { ...status.preferences, [key]: !status.preferences[key] };
    setStatus({ ...status, preferences });
    setMessage("");
    try {
      const result = await savePushNotificationPreferences(preferences);
      setStatus((current) => current ? { ...current, preferences: result.preferences } : current);
      setMessage("Notification categories saved.");
    } catch (error) {
      refresh();
      setMessage(error instanceof Error ? error.message : "Unable to save notification categories.");
    }
  }

  return (
    <section className="settings-panel push-settings-panel">
      <div className="settings-panel-heading">
        <h2>Notification Settings</h2>
      </div>
      <div className="push-settings-copy">
        <h3>Release alerts</h3>
        <p>Get notified when followed titles have release date, trailer, season, or streaming availability updates.</p>
      </div>
      {!supported ? <p className="helper-text">This browser does not support Web Push notifications.</p> : null}
      {supported && status && !status.configured ? (
        <p className="helper-text">Push delivery needs VAPID keys before notifications can be enabled.</p>
      ) : null}
      {supported && permission === "denied" ? (
        <p className="error-message">Notifications are blocked in this browser. Enable them in browser settings to receive Flim alerts.</p>
      ) : null}
      <div className="button-row">
        {status?.enabled ? (
          <button className="secondary-button" disabled={state === "saving"} onClick={disable} type="button">
            {state === "saving" ? "Saving..." : "Disable Push Notifications"}
          </button>
        ) : (
          <button
            className="primary-button"
            disabled={!supported || !status?.configured || permission === "denied" || state === "saving" || state === "loading"}
            onClick={enable}
            type="button"
          >
            {state === "saving" ? "Enabling..." : "Enable Push Notifications"}
          </button>
        )}
      </div>
      {status ? (
        <div className="push-category-grid" aria-label="Push notification categories">
          {categoryOptions.map((option) => (
            <label className="follow-title-option" key={option.key}>
              <input
                checked={Boolean(status.preferences[option.key])}
                disabled={state === "saving"}
                onChange={() => toggleCategory(option.key)}
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
      {status?.enabled ? <p className="success-message">Push notifications are enabled on this device.</p> : null}
      {message ? <p className={state === "error" || message.includes("not") || message.includes("blocked") ? "error-message" : "success-message"}>{message}</p> : null}
    </section>
  );
}
