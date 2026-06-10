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
  "amazon": "prime",
  "amazon prime": "prime",
  "amazon prime video": "prime",
  "amazon video": "prime",
  "apple": "apple",
  "appletv": "apple",
  "apple tv channel": "apple",
  "apple tv channels": "apple",
  "apple tv": "apple",
  "apple tv plus": "apple",
  "apple tv+": "apple",
  "crave": "crave",
  "crave via amazon prime": "crave",
  "disney": "disney",
  "disney plus": "disney",
  "disney+": "disney",
  "disneyplus": "disney",
  "google play": "google_tv",
  "google play movies and tv": "google_tv",
  "google play movies": "google_tv",
  "google play movies tv": "google_tv",
  "google tv": "google_tv",
  "hbo max": "max",
  "hulu": "hulu",
  "max": "max",
  "netflix": "netflix",
  "paramount": "paramount",
  "paramount network": "paramount",
  "paramount plus": "paramount",
  "paramount plus apple tv channel": "paramount",
  "paramount plus premium": "paramount",
  "paramount plus showtime": "paramount",
  "paramountplus": "paramount",
  "paramount+ amazon channel": "paramount",
  "paramount+ apple tv channel": "paramount",
  "paramount+ roku premium channel": "paramount",
  "paramount+": "paramount",
  "plex": "plex",
  "prime": "prime",
  "prime video": "prime",
  "prime video with ads": "prime",
  "spotify": "spotify",
  "tubi": "tubi",
  "tubi tv": "tubi",
  "youtube": "youtube",
  "youtube movies and tv": "youtube",
  "youtube movies": "youtube",
  "youtube premium": "youtube",
};

const knownProviderNames = new Set([
  "amazon",
  "amazon prime",
  "amazon prime video",
  "amazon video",
  "apple",
  "appletv",
  "apple tv channel",
  "apple tv channels",
  "apple tv",
  "apple tv plus",
  "apple tv+",
  "crave",
  "crave via amazon prime",
  "disney",
  "disney plus",
  "disney+",
  "disneyplus",
  "google play",
  "google play movies and tv",
  "google play movies",
  "google play movies tv",
  "google tv",
  "hbo max",
  "hulu",
  "max",
  "netflix",
  "paramount",
  "paramount network",
  "paramount plus",
  "paramount plus apple tv channel",
  "paramount plus premium",
  "paramount plus showtime",
  "paramountplus",
  "paramount+ amazon channel",
  "paramount+ apple tv channel",
  "paramount+ roku premium channel",
  "paramount+",
  "plex",
  "prime",
  "prime video",
  "prime video with ads",
  "spotify",
  "tubi",
  "tubi tv",
  "youtube",
  "youtube movies and tv",
  "youtube movies",
  "youtube premium",
]);

function normalizeProviderCandidate(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compactProviderKey(value: string) {
  return value.replace(/\s+/g, "_");
}

export function providerIconKey(provider: { id?: string; name?: string }) {
  const candidates = [provider.id, provider.name]
    .filter(Boolean)
    .map(normalizeProviderCandidate);

  for (const candidate of candidates) {
    const alias = providerAliases[candidate];
    if (alias) return alias;
    const compact = compactProviderKey(candidate);
    if (providerAssets[compact] || knownProviderNames.has(candidate)) return compact;
  }

  return undefined;
}

export function isKnownProvider(provider: { id?: string; name?: string }) {
  const candidates = [provider.id, provider.name]
    .filter(Boolean)
    .map(normalizeProviderCandidate);

  return candidates.some((candidate) => {
    const key = providerAliases[candidate] || compactProviderKey(candidate);
    return knownProviderNames.has(candidate) || Boolean(providerAliases[candidate]) || Boolean(providerAssets[key]);
  });
}

function providerInitials(name?: string) {
  const clean = String(name || "?").replace(/\+/g, " plus ").trim();
  const words = clean.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

export function providerLogoResolution(provider: { id?: string; name?: string; logoUrl?: string }) {
  const key = providerIconKey(provider);
  const asset = key ? providerAssets[key] : undefined;
  const known = isKnownProvider(provider);

  return {
    providerName: provider.name || provider.id || "Unknown provider",
    resolvedKey: key || "",
    expectedAssetPath: asset?.src || (key ? `/provider-icons/${key}.png` : ""),
    asset,
    assetExists: Boolean(asset),
    isKnown: known,
    usesExternalLogo: Boolean(provider.logoUrl && !known && !asset),
    fellBack: !asset,
    initials: providerInitials(provider.name || provider.id),
  };
}
