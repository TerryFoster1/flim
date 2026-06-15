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
      { key: "releaseDates", label: "A tracked title is released" },
      { key: "releaseDelays", label: "A tracked title gets delayed" },
      { key: "trailers", label: "A tracked title gets a new trailer" },
      { key: "streamingAvailability", label: "A tracked title becomes available to stream" },
    ],
  },
  {
    title: "Challenges & Rewards",
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
  const [savingKey, setSavingKey] = useState<keyof PushNotificationPreferences | null>(null);
  const [message, setMessage] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => new Set(categoryGroups.map((group) => group.title)));
  const permission = getBrowserNotificationPermission();
  const supported = browserSupportsPush();

  function refresh() {
    setState("loading");
    getPushSubscriptionStatus()
      .then((result) => {
        setStatus(result);
        setSavingKey(null);
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
    if (!status || savingKey) return;
    const previousPreferences = { ...status.preferences };
    const preferences = { ...previousPreferences, [key]: !Boolean(previousPreferences[key]) };
    setStatus((current) => current ? { ...current, preferences } : current);
    setSavingKey(key);
    setState("saving");
    setMessage("");
    try {
      const result = await savePushNotificationPreferences(preferences);
      setStatus((current) => current ? { ...current, preferences: result.preferences } : current);
      setMessage("Notification settings saved.");
      setState("ready");
    } catch (error) {
      setStatus((current) => current ? { ...current, preferences: previousPreferences } : current);
      setState("ready");
      setMessage(error instanceof Error ? error.message : "Unable to save notification categories.");
    } finally {
      setSavingKey(null);
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
      <p className="notification-settings-note">Choose which Flim alerts you want. These preferences are saved to your account; push delivery is used only when enabled on this device.</p>
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
                    {group.options.map((option) => {
                      const selected = Boolean(status.preferences[option.key]);
                      const isSavingThis = savingKey === option.key;
                      return (
                        <button
                          aria-pressed={selected}
                          className={selected ? "notification-preference-row is-on" : "notification-preference-row"}
                          disabled={Boolean(savingKey)}
                          key={`${group.title}-${option.key}`}
                          onClick={() => toggleCategory(option.key)}
                          type="button"
                        >
                          <span className="notification-switch" aria-hidden="true">
                            <span />
                          </span>
                          <span>{option.label}</span>
                          {isSavingThis ? <small>Saving</small> : null}
                        </button>
                      );
                    })}
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
