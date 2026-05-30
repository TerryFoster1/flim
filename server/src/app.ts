// Express app composition placeholder.
// TODO: Compose API routers here once actual request handling is allowed.
// Keep this layer API-first so web and future native clients can share the same contract.
// Phase 1A architecture note: the backend plan supports poster-first playlists, streaming provider links, social sharing, and roulette without implementing them yet.

export interface ServerAppPlaceholder {
  purpose: "Future Express app composition root";
  modules: string[];
}

export const serverAppPlaceholder: ServerAppPlaceholder = {
  purpose: "Future Express app composition root",
  modules: ["movies", "playlists", "users", "sharing", "recommendations", "providers", "roulette", "social"],
};
