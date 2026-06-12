import type { TicketFeed } from "../types";

async function parseTicketResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Ticket request failed.");
  }
  return payload as T;
}

export async function getTicketFeed(limit = 12) {
  const params = new URLSearchParams({ limit: String(limit) });
  const response = await fetch(`/api/tickets?${params.toString()}`, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return parseTicketResponse<TicketFeed>(response);
}
