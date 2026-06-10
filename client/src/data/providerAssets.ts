export interface ProviderAsset {
  src: string;
}

export const providerAssets: Record<string, ProviderAsset> = {
  apple: { src: "/provider-icons/apple-tv.png" },
  hulu: { src: "/provider-icons/hulu.png" },
  max: { src: "/provider-icons/max.png" },
  netflix: { src: "/provider-icons/netflix.png" },
  plex: { src: "/provider-icons/plex.png" },
  prime: { src: "/provider-icons/prime-video.png" },
  spotify: { src: "/provider-icons/spotify.png" },
  youtube: { src: "/provider-icons/youtube.png" },
};

const providerAliases: Record<string, string> = {
  "amazon prime video": "prime",
  "apple tv": "apple",
  "apple tv plus": "apple",
  "apple tv+": "apple",
  "crave": "crave",
  "disney plus": "disney",
  "disney+": "disney",
  "google play movies": "google_tv",
  "google tv": "google_tv",
  "hbo max": "max",
  "hulu": "hulu",
  "max": "max",
  "netflix": "netflix",
  "plex": "plex",
  "prime video": "prime",
  "spotify": "spotify",
  "tubi": "tubi",
  "youtube": "youtube",
  "youtube movies": "youtube",
};

const knownProviderNames = new Set([
  "amazon prime video",
  "apple tv",
  "apple tv plus",
  "apple tv+",
  "crave",
  "disney plus",
  "disney+",
  "google play movies",
  "google tv",
  "hbo max",
  "hulu",
  "max",
  "netflix",
  "paramount plus",
  "paramount+",
  "plex",
  "prime video",
  "spotify",
  "tubi",
  "youtube",
  "youtube movies",
]);

export function providerIconKey(provider: { id?: string; name?: string }) {
  const candidates = [provider.id, provider.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/\+/g, " plus").replace(/[^a-z0-9]+/g, " ").trim());

  for (const candidate of candidates) {
    const compact = candidate.replace(/\s+/g, "_");
    if (providerAssets[compact]) return compact;
    const alias = providerAliases[candidate];
    if (alias && providerAssets[alias]) return alias;
  }

  return undefined;
}

export function isKnownProvider(provider: { id?: string; name?: string }) {
  const candidates = [provider.id, provider.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/\+/g, " plus").replace(/[^a-z0-9]+/g, " ").trim());

  return candidates.some((candidate) => knownProviderNames.has(candidate) || Boolean(providerAliases[candidate]));
}
