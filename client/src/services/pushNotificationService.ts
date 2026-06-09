import type { PushNotificationPreferences, PushSubscriptionStatus } from "../types";

function pushRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  return fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Unable to update push notifications.");
    return payload as T;
  });
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export function browserSupportsPush() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function getBrowserNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export function getPushSubscriptionStatus() {
  return pushRequest<PushSubscriptionStatus>("/api/push/subscriptions");
}

export function savePushNotificationPreferences(preferences: PushNotificationPreferences) {
  return pushRequest<{ ok: boolean; preferences: PushNotificationPreferences }>("/api/push/subscriptions", {
    method: "PATCH",
    body: JSON.stringify({ preferences }),
  });
}

export async function enablePushNotifications() {
  if (!browserSupportsPush()) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  const status = await getPushSubscriptionStatus();
  if (!status.configured || !status.publicKey) {
    throw new Error("Push notifications are not configured yet.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications were not enabled.");
  }

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ||
    await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(status.publicKey),
    });

  return pushRequest<{ ok: boolean; enabled: boolean }>("/api/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      userAgent: navigator.userAgent,
    }),
  });
}

export async function disablePushNotifications() {
  if (!browserSupportsPush()) {
    throw new Error("Push notifications are not supported on this browser.");
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { ok: true, enabled: false };

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe().catch(() => undefined);
  return pushRequest<{ ok: boolean; enabled: boolean }>("/api/push/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint }),
  });
}
