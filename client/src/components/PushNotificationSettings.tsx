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

const categoryGroups: Array<{
  title: string;
  options: Array<{ key: keyof PushNotificationPreferences; label: string }>;
}> = [
  {
    title: "Social",
    options: [
      { key: "socialFollowers", label: "Someone follows me" },
      { key: "playlistFollowers", label: "Someone follows one of my playlists" },
      { key: "playlistLikesSaves", label: "Someone likes or saves one of my playlists" },
    ],
  },
  {
    title: "Release Tracking",
    options: [
      { key: "releaseDates", label: "A tracked title is released or gets delayed" },
      { key: "trailers", label: "A tracked title gets a new trailer" },
      { key: "streamingAvailability", label: "A tracked title becomes available to stream, rent, or buy" },
    ],
  },
  {
    title: "Challenges",
    options: [
      { key: "weeklyChallenges", label: "New weekly challenge" },
      { key: "seasonalChallenges", label: "New seasonal challenge" },
      { key: "triviaScoreBeaten", label: "Someone beats my trivia score" },
      { key: "rewardUnlocked", label: "I unlock a reward" },
    ],
  },
  {
    title: "System",
    options: [
      { key: "accountUpdates", label: "Important account updates only" },
    ],
  },
];

export function PushNotificationSettings() {
  const [status, setStatus] = useState<PushSubscriptionStatus | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(["Social", "Release Tracking"]));
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

  function toggleSection(title: string) {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  }

  return (
    <section className="settings-panel push-settings-panel">
      <div className="settings-panel-heading">
        <h2>Notification settings</h2>
      </div>
      <p className="notification-settings-note">Choose which Flim alerts you want. Push delivery is used only when notifications are enabled on this device.</p>
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
        <div className="notification-preference-list" aria-label="Notification preference categories">
          {categoryGroups.map((group) => {
            const isExpanded = expandedSections.has(group.title);
            const selectedCount = group.options.filter((option) => Boolean(status.preferences[option.key])).length;
            return (
              <section className="notification-preference-group" key={group.title}>
                <button
                  aria-expanded={isExpanded}
                  className="notification-preference-header"
                  onClick={() => toggleSection(group.title)}
                  type="button"
                >
                  <span>{group.title}</span>
                  <small>{selectedCount}/{group.options.length}</small>
                  <strong aria-hidden="true">{isExpanded ? "-" : "+"}</strong>
                </button>
                {isExpanded ? (
                  <div className="notification-preference-options">
                    {group.options.map((option) => (
                      <label className="notification-preference-row" key={`${group.title}-${option.key}`}>
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
              </section>
            );
          })}
        </div>
      ) : null}
      {status?.enabled ? <p className="success-message">Push notifications are enabled on this device.</p> : null}
      {message ? <p className={state === "error" || message.includes("not") || message.includes("blocked") ? "error-message" : "success-message"}>{message}</p> : null}
    </section>
  );
}
