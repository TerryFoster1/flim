import type { HallOfFameFeed, HallOfFameWindow } from "../types";

export async function getHallOfFame(window: HallOfFameWindow = "all_time") {
  const response = await fetch(`/api/hall-of-fame?window=${encodeURIComponent(window)}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Unable to load Hall of Fame.");
  }
  return response.json() as Promise<HallOfFameFeed>;
}
