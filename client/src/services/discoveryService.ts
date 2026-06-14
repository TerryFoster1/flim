import type { ActorSummary, DiscoveryCollectionResult, DiscoveryHubLink, DiscoveryProfileResult, DiscoverySearchResults, MovieSearchResult, Playlist } from "../types";

interface DiscoverySearchOptions {
  availableOnMyServices?: boolean;
  providers?: string[];
  region?: string;
  signal?: AbortSignal;
}

export async function searchDiscovery(query: string, options: DiscoverySearchOptions = {}) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return {
      query: "",
      titles: [],
      playlists: [],
      profiles: [],
      collections: [],
      hubs: [],
      actors: [],
      titleSource: "empty",
    } satisfies DiscoverySearchResults;
  }

  const params = new URLSearchParams({ q: cleanQuery });
  if (options.availableOnMyServices) params.set("availableOnMyServices", "true");
  if (options.region) params.set("region", options.region);
  if (options.providers?.length) params.set("providers", options.providers.join(","));

  const response = await fetch(`/api/discovery/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Discovery search failed.");
  }

  const payload = await response.json() as DiscoverySearchResults;
  return {
    ...payload,
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    hubs: Array.isArray(payload.hubs) ? payload.hubs : [],
    actors: Array.isArray(payload.actors) ? payload.actors : [],
  };
}

export type SearchSuggestionType = "playlist" | "collection" | "person" | "title" | "hub" | "query";

export interface SearchSuggestion {
  id: string;
  type: SearchSuggestionType;
  label: string;
  meta?: string;
  reason?: string;
  path?: string;
  query?: string;
  confidence?: number;
}

const correctionCandidates = [
  "Leviticus",
  "Jurassic",
  "Jurassic Park",
  "Jurassic World",
  "The Terminator",
  "Terminator 2: Judgment Day",
  "Back to the Future",
  "Tom Cruise",
  "Tornado movies",
  "Twister",
  "Christmas movies",
  "Time travel movies",
  "Anime",
  "A24 horror",
  "Shark movies",
];

function normalizeSuggestionText(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "").trim();
}

export function searchLabelMatchesQuery(query: string, label: string) {
  const normalizedQuery = normalizeSuggestionText(query);
  const normalizedLabel = normalizeSuggestionText(label);
  if (!normalizedQuery || !normalizedLabel) return false;
  return normalizedLabel === normalizedQuery || normalizedLabel.startsWith(normalizedQuery) || normalizedLabel.includes(normalizedQuery);
}

function editDistance(a: string, b: string) {
  const left = normalizeSuggestionText(a);
  const right = normalizeSuggestionText(b);
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost,
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }

  return previous[right.length];
}

export function getDidYouMeanSuggestion(query: string, payload?: DiscoverySearchResults | null): SearchSuggestion | null {
  const cleanQuery = query.trim();
  if (cleanQuery.length < 4) return null;
  const normalizedQuery = normalizeSuggestionText(cleanQuery);
  if (!normalizedQuery) return null;

  const dynamicCandidates = [
    ...(payload?.titles || []).map((item) => item.title),
    ...(payload?.actors || []).map((item) => item.name),
    ...(payload?.playlists || []).map((item) => item.name),
    ...(payload?.collections || []).map((item) => item.title),
    ...(payload?.hubs || []).map((item) => item.title),
  ];
  const allCandidates = Array.from(new Set([...dynamicCandidates, ...correctionCandidates]));

  const best = allCandidates
    .map((candidate) => {
      const normalizedCandidate = normalizeSuggestionText(candidate);
      const distance = editDistance(normalizedQuery, normalizedCandidate);
      const ratio = distance / Math.max(normalizedCandidate.length, normalizedQuery.length, 1);
      return { candidate, distance, ratio };
    })
    .filter((item) => normalizeSuggestionText(item.candidate) !== normalizedQuery)
    .sort((a, b) => a.ratio - b.ratio || a.distance - b.distance)[0];

  if (!best) return null;
  if (normalizeSuggestionText(best.candidate).startsWith(normalizedQuery)) return null;
  const allowedDistance = normalizedQuery.length <= 8 ? 3 : 4;
  const isPrefixTypo = normalizeSuggestionText(best.candidate).startsWith(normalizedQuery.slice(0, Math.max(3, normalizedQuery.length - 2)));
  if (best.distance > allowedDistance && best.ratio > 0.34 && !isPrefixTypo) return null;

  return {
    id: `did-you-mean-${normalizeSuggestionText(best.candidate)}`,
    type: "query",
    label: best.candidate,
    meta: "Did you mean",
    reason: `Search for ${best.candidate}`,
    query: best.candidate,
    confidence: Math.max(0, 1 - best.ratio),
  };
}

export function buildLocalSearchSuggestions(query: string, limit = 5): SearchSuggestion[] {
  const cleanQuery = query.trim();
  const normalizedQuery = normalizeSuggestionText(cleanQuery);
  if (normalizedQuery.length < 2) return [];

  return correctionCandidates
    .map((candidate) => {
      const normalizedCandidate = normalizeSuggestionText(candidate);
      const distance = editDistance(normalizedQuery, normalizedCandidate);
      const ratio = distance / Math.max(normalizedCandidate.length, normalizedQuery.length, 1);
      const isPrefix = normalizedCandidate.startsWith(normalizedQuery);
      const isContained = normalizedCandidate.includes(normalizedQuery);
      const isFuzzy = normalizedQuery.length >= 4 && distance <= (normalizedQuery.length <= 8 ? 3 : 4) && ratio <= 0.42;
      return { candidate, distance, isContained, isFuzzy, isPrefix, ratio };
    })
    .filter((item) => item.isPrefix || item.isContained || item.isFuzzy)
    .sort((a, b) => {
      if (a.isPrefix !== b.isPrefix) return a.isPrefix ? -1 : 1;
      if (a.isContained !== b.isContained) return a.isContained ? -1 : 1;
      return a.ratio - b.ratio || a.distance - b.distance || a.candidate.localeCompare(b.candidate);
    })
    .slice(0, limit)
    .map((item) => ({
      id: `${item.isFuzzy ? "did-you-mean" : "local-query"}-${normalizeSuggestionText(item.candidate)}`,
      type: "query",
      label: item.candidate,
      meta: item.isFuzzy ? "Did you mean" : "Suggestion",
      reason: `Search for ${item.candidate}`,
      query: item.candidate,
      confidence: Math.max(0, 1 - item.ratio),
    }));
}

function titlePath(title: MovieSearchResult) {
  return title.mediaType === "tv" ? `/tv/${title.tmdbId}` : `/movies/${title.tmdbId}`;
}

function titleSuggestion(title: MovieSearchResult): SearchSuggestion {
  return {
    id: `title-${title.mediaType || "movie"}-${title.tmdbId}`,
    type: "title",
    label: title.title,
    meta: [title.releaseYear, title.mediaType === "tv" ? "TV" : "Movie"].filter(Boolean).join(" / "),
    reason: title.overview,
    path: titlePath(title),
  };
}

function playlistSuggestion(playlist: Playlist): SearchSuggestion {
  return {
    id: `playlist-${playlist.id}`,
    type: "playlist",
    label: playlist.name,
    meta: [playlist.movies?.length ? `${playlist.movies.length} titles` : "", playlist.creatorDisplayName ? `by ${playlist.creatorDisplayName}` : ""].filter(Boolean).join(" / "),
    reason: playlist.description,
    path: `/playlists/${playlist.id}`,
  };
}

function collectionSuggestion(collection: DiscoveryCollectionResult): SearchSuggestion {
  return {
    id: `collection-${collection.slug}`,
    type: "collection",
    label: collection.title,
    meta: [collection.category || "Collection", collection.titleCount ? `${collection.titleCount} titles` : ""].filter(Boolean).join(" / "),
    reason: collection.overview,
    path: `/collection/${collection.slug}`,
  };
}

function personSuggestion(actor: ActorSummary): SearchSuggestion {
  return {
    id: `person-${actor.tmdbId}`,
    type: "person",
    label: actor.name,
    meta: actor.knownForDepartment || "Person",
    reason: actor.knownFor?.join(", "),
    path: `/person/${actor.tmdbId}`,
  };
}

function profileSuggestion(profile: DiscoveryProfileResult): SearchSuggestion {
  return {
    id: `profile-${profile.handle}`,
    type: "person",
    label: profile.displayName,
    meta: `@${profile.handle}`,
    reason: profile.bio,
    path: `/@${profile.handle}`,
  };
}

function hubSuggestion(hub: DiscoveryHubLink): SearchSuggestion {
  return {
    id: `hub-${hub.kind}-${hub.key}`,
    type: "hub",
    label: hub.title,
    meta: hub.kind === "genre" ? "Genre" : hub.kind === "decade" ? "Decade" : "Franchise",
    reason: hub.description,
    path: hub.path,
  };
}

function scoreSuggestion(query: string, suggestion: SearchSuggestion) {
  const normalizedQuery = normalizeSuggestionText(query);
  const normalizedLabel = normalizeSuggestionText(suggestion.label);
  if (suggestion.type === "query") return -10;
  const typeRank: Record<SearchSuggestionType, number> = {
    playlist: 0,
    collection: 1,
    person: 2,
    title: 3,
    hub: 4,
    query: 5,
  };
  const matchRank = normalizedLabel === normalizedQuery
    ? -20
    : normalizedLabel.startsWith(normalizedQuery)
      ? -12
      : normalizedLabel.includes(normalizedQuery)
        ? -6
        : 0;
  return matchRank + typeRank[suggestion.type];
}

export function buildSearchSuggestions(query: string, payload: DiscoverySearchResults | null, limit = 8) {
  if (!payload) return [];
  const seen = new Set<string>();
  const suggestions = [
    ...(payload.playlists || []).slice(0, 4).map(playlistSuggestion),
    ...(payload.collections || []).slice(0, 3).map(collectionSuggestion),
    ...(payload.actors || []).slice(0, 4).map(personSuggestion),
    ...(payload.profiles || []).slice(0, 3).map(profileSuggestion),
    ...(payload.titles || []).slice(0, 6).map(titleSuggestion),
    ...(payload.hubs || []).slice(0, 3).map(hubSuggestion),
  ];
  const didYouMean = getDidYouMeanSuggestion(query, payload);
  if (didYouMean) suggestions.unshift(didYouMean);

  return suggestions
    .filter((suggestion) => {
      if (seen.has(suggestion.id)) return false;
      seen.add(suggestion.id);
      return true;
    })
    .sort((a, b) => scoreSuggestion(query, a) - scoreSuggestion(query, b))
    .slice(0, limit);
}
