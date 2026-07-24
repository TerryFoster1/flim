export const arcadeModeRoutes = {
  trivia: "/arcade/trivia",
  quote: "/arcade/quotes",
  poster: "/arcade/poster-guess",
  leaderboards: "/arcade/leaderboards",
  rewards: "/arcade/rewards"
} as const;

export const visibleArcadeModes = [
  { id: "trivia", title: "Movie Trivia", subtitle: "Browse title packs", route: arcadeModeRoutes.trivia, icon: "film-outline" },
  { id: "quote", title: "Quote Challenge", subtitle: "Match famous lines", route: arcadeModeRoutes.quote, icon: "chatbubble-ellipses-outline" },
  { id: "poster", title: "Movie Reveal", subtitle: "Guess from posters", route: arcadeModeRoutes.poster, icon: "images-outline" },
  { id: "leaderboards", title: "Leaderboards", subtitle: "See standings", route: arcadeModeRoutes.leaderboards, icon: "trophy-outline" },
  { id: "rewards", title: "Rewards", subtitle: "Tickets and badges", route: arcadeModeRoutes.rewards, icon: "ticket-outline" }
] as const;

export function resolveChallengeRoute(challenge: { id?: string; slug?: string }) {
  return `/arcade/challenge/${encodeURIComponent(challenge.slug || challenge.id || "featured")}`;
}
