import type { PublicUserProfile, UserProfile } from "../types";

let currentProfilePromise: Promise<UserProfile> | null = null;

async function profileRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Profile request failed.");
  }

  return response.json() as Promise<T>;
}

export function getCurrentProfile() {
  currentProfilePromise ??= profileRequest<UserProfile>("/api/profiles/me");
  return currentProfilePromise;
}

export function saveCurrentProfile(profile: UserProfile) {
  currentProfilePromise = profileRequest<UserProfile>("/api/profiles/me", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
  return currentProfilePromise;
}

export function getPublicProfile(handle: string) {
  return profileRequest<PublicUserProfile>(`/api/profiles/${encodeURIComponent(handle)}`);
}
