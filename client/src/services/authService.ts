import type { CurrentUser } from "../types";

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Authentication request failed.");
  }

  return response.json() as Promise<T>;
}

export function getSession() {
  return authRequest<{ user: CurrentUser | null }>("/api/profiles/auth/session");
}

export function signUp(email: string, password: string) {
  return authRequest<{ user: CurrentUser }>("/api/profiles/auth/signup", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function signIn(email: string, password: string) {
  return authRequest<{ user: CurrentUser }>("/api/profiles/auth/signin", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  return authRequest<{ ok: boolean }>("/api/profiles/auth/logout", {
    method: "POST",
  });
}
