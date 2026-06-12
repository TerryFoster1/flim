export interface ProviderAsset {
  src: string;
}

export const providerAssets: Record<string, ProviderAsset> = {
  apple: { src: "/provider-icons/apple-tv.png" },
  cineplex: { src: "/provider-icons/cineplex.png" },
  cbc_gem: { src: "/provider-icons/cbc-gem.png" },
  crave: { src: "/provider-icons/crave.png" },
  criterion: { src: "/provider-icons/criterion.png" },
  disney: { src: "/provider-icons/disney-plus.png" },
  google_tv: { src: "/provider-icons/google-tv.png" },
  hoopla: { src: "/provider-icons/hoopla.png" },
  hulu: { src: "/provider-icons/hulu.png" },
  max: { src: "/provider-icons/max.png" },
  netflix: { src: "/provider-icons/netflix.png" },
  paramount: { src: "/provider-icons/paramount-plus.png" },
  plex: { src: "/provider-icons/plex.png" },
  prime: { src: "/provider-icons/prime-video.png" },
  shudder: { src: "/provider-icons/shudder.png" },
  spotify: { src: "/provider-icons/spotify.png" },
  tubi: { src: "/provider-icons/tubi.png" },
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
  "cineplex": "cineplex",
  "cineplex store": "cineplex",
  "cbc gem": "cbc_gem",
  "cbcgem": "cbc_gem",
  "crave": "crave",
  "cravetv": "crave",
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
  "google tv movies": "google_tv",
  "hbo max": "max",
  "hoopla": "hoopla",
  "hoopla digital": "hoopla",
  "hulu": "hulu",
  "max": "max",
  "netflix": "netflix",
  "paramount": "paramount",
  "paramount network": "paramount",
  "paramount plus": "paramount",
  "paramount plus premium": "paramount",
  "paramount plus showtime": "paramount",
  "paramountplus": "paramount",
  "paramount+ amazon channel": "paramount",
  "paramount+ apple tv channel": "paramount",
  "paramount+ roku premium channel": "paramount",
  "paramount plus amazon channel": "paramount",
  "paramount plus apple tv channel": "paramount",
  "paramount plus roku premium channel": "paramount",
  "paramount+": "paramount",
  "plex": "plex",
  "prime": "prime",
  "prime video": "prime",
  "prime video with ads": "prime",
  "shudder": "shudder",
  "shudder amazon channel": "shudder",
  "shudder apple tv channel": "shudder",
  "shudder shudder": "shudder",
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
  "cineplex",
  "cineplex store",
  "cbc gem",
  "cbcgem",
  "crave",
  "cravetv",
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
  "google tv movies",
  "hbo max",
  "hoopla",
  "hoopla digital",
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
  "paramount plus amazon channel",
  "paramount plus apple tv channel",
  "paramount plus roku premium channel",
  "paramount+",
  "plex",
  "prime",
  "prime video",
  "prime video with ads",
  "shudder",
  "shudder amazon channel",
  "shudder apple tv channel",
  "shudder shudder",
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
  const usesExternalLogo = Boolean(provider.logoUrl && !asset);

  return {
    providerName: provider.name || provider.id || "Unknown provider",
    resolvedKey: key || "",
    expectedAssetPath: asset?.src || (key ? `/provider-icons/${key}.png` : ""),
    asset,
    assetExists: Boolean(asset),
    isKnown: known,
    usesExternalLogo,
    fellBack: !asset && !usesExternalLogo,
    initials: providerInitials(provider.name || provider.id),
  };
}
