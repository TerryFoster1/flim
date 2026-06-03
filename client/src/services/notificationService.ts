import type { NotificationFeed } from "../types";

async function notificationRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Notification request failed.");
  }

  return response.json() as Promise<T>;
}

export function getNotifications() {
  return notificationRequest<NotificationFeed>("/api/notifications");
}

export function markNotificationRead(notificationId: string) {
  return notificationRequest<{ ok: boolean; unreadCount: number }>("/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ notificationId }),
  });
}

export function markAllNotificationsRead() {
  return notificationRequest<{ ok: boolean; unreadCount: number }>("/api/notifications", {
    method: "PATCH",
    body: JSON.stringify({ markAllRead: true }),
  });
}
