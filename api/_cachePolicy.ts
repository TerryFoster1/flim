export type FlimCachePolicyKey =
  | "tmdb_search"
  | "tmdb_title"
  | "tmdb_person"
  | "provider_availability"
  | "provider_availability_empty"
  | "discovery_search";

export type FlimCacheEvent =
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "CACHE_STALE"
  | "EXTERNAL_FETCH"
  | "EXTERNAL_GENERATION"
  | "BACKGROUND_REFRESH";

type FlimCachePolicy = {
  databaseTtlDays?: number;
  maxAgeSeconds: number;
  sharedMaxAgeSeconds?: number;
  staleWhileRevalidateSeconds?: number;
  privacy?: "public" | "private";
  externalFanoutLimit?: number;
};

const policies: Record<FlimCachePolicyKey, FlimCachePolicy> = {
  tmdb_search: {
    databaseTtlDays: 7,
    maxAgeSeconds: 300,
    sharedMaxAgeSeconds: 3600,
    staleWhileRevalidateSeconds: 86400,
    privacy: "public",
    externalFanoutLimit: 2,
  },
  tmdb_title: {
    databaseTtlDays: 30,
    maxAgeSeconds: 60,
    staleWhileRevalidateSeconds: 300,
    privacy: "private",
  },
  tmdb_person: {
    databaseTtlDays: 30,
    maxAgeSeconds: 300,
    sharedMaxAgeSeconds: 3600,
    staleWhileRevalidateSeconds: 86400,
    privacy: "public",
  },
  provider_availability: {
    databaseTtlDays: 3,
    maxAgeSeconds: 300,
    sharedMaxAgeSeconds: 1800,
    staleWhileRevalidateSeconds: 86400,
    privacy: "public",
  },
  provider_availability_empty: {
    databaseTtlDays: 3,
    maxAgeSeconds: 120,
    sharedMaxAgeSeconds: 600,
    staleWhileRevalidateSeconds: 3600,
    privacy: "public",
  },
  discovery_search: {
    maxAgeSeconds: 60,
    sharedMaxAgeSeconds: 300,
    staleWhileRevalidateSeconds: 1800,
    privacy: "public",
  },
};

export function cachePolicy(key: FlimCachePolicyKey) {
  return policies[key];
}

export function cacheDays(key: FlimCachePolicyKey, fallback = 1) {
  return policies[key].databaseTtlDays ?? fallback;
}

export function cacheHeader(key: FlimCachePolicyKey) {
  const policy = policies[key];
  const parts = [`${policy.privacy || "public"}`, `max-age=${policy.maxAgeSeconds}`];
  if (policy.sharedMaxAgeSeconds) parts.push(`s-maxage=${policy.sharedMaxAgeSeconds}`);
  if (policy.staleWhileRevalidateSeconds) parts.push(`stale-while-revalidate=${policy.staleWhileRevalidateSeconds}`);
  return parts.join(", ");
}

export function limitExternalFanout<T>(key: FlimCachePolicyKey, values: T[]) {
  const limit = policies[key].externalFanoutLimit;
  return typeof limit === "number" ? values.slice(0, limit) : values;
}

export function sharedCacheKey(namespace: string, parts: Record<string, unknown>) {
  const stableEntries = Object.entries(parts)
    .filter(([key, value]) => value !== undefined && value !== null && !["platform", "client", "device", "caller"].includes(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return `${namespace}:${stableEntries.map(([key, value]) => `${key}=${String(value).trim().toLowerCase()}`).join("|")}`;
}

export const cacheEventLabels: FlimCacheEvent[] = [
  "CACHE_HIT",
  "CACHE_MISS",
  "CACHE_STALE",
  "EXTERNAL_FETCH",
  "EXTERNAL_GENERATION",
  "BACKGROUND_REFRESH",
];

export function diagnosticCaller(value: unknown) {
  const caller = String(Array.isArray(value) ? value[0] : value || "").trim().toLowerCase();
  if (caller === "web" || caller === "android" || caller === "ios") return caller;
  return "unknown";
}

export function logCacheEvent(event: FlimCacheEvent, details: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "production") return;
  console.info("flim_cache_event", {
    event,
    ...details,
  });
}
