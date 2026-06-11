import type { ProgressHubFeed } from "../types";

export async function getProgressHub() {
  const response = await fetch("/api/progress", {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Progress request failed.");
  }

  return response.json() as Promise<ProgressHubFeed>;
}
