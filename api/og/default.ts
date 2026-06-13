import { sendShareCard } from "../_shareCards.js";

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end("Method not allowed.");
    return;
  }

  return sendShareCard(response, {
    kind: "title",
    title: "Flim",
    subtitle: "Movie and TV discovery",
    eyebrow: "What are we watching tonight?",
    description: "Create, share, and discover movie and TV playlists.",
    cta: "Open Flim",
    urlLabel: "flim.ca",
    badge: "Watch, Track & Discover",
  });
}
