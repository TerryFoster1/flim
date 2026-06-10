export interface ProviderAsset {
  label: string;
  className: string;
}

export const providerAssets: Record<string, ProviderAsset> = {
  netflix: { label: "N", className: "provider-logo-netflix" },
  prime: { label: "prime", className: "provider-logo-prime" },
  disney: { label: "D+", className: "provider-logo-disney" },
  apple: { label: "tv", className: "provider-logo-apple" },
  hulu: { label: "hulu", className: "provider-logo-hulu" },
  max: { label: "max", className: "provider-logo-max" },
  crave: { label: "C", className: "provider-logo-crave" },
  youtube: { label: "YT", className: "provider-logo-youtube" },
  tubi: { label: "tubi", className: "provider-logo-tubi" },
  paramount: { label: "P+", className: "provider-logo-paramount" },
  plex: { label: ">", className: "provider-logo-plex" },
  google_tv: { label: "GTV", className: "provider-logo-google-tv" },
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
  "paramount plus": "paramount",
  "paramount+": "paramount",
  "plex": "plex",
  "prime video": "prime",
  "tubi": "tubi",
  "youtube": "youtube",
  "youtube movies": "youtube",
};

export function providerIconKey(provider: { id?: string; name?: string }) {
  const candidates = [provider.id, provider.name]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase().replace(/\+/g, " plus").replace(/[^a-z0-9]+/g, " ").trim());

  for (const candidate of candidates) {
    const compact = candidate.replace(/\s+/g, "_");
    if (providerAssets[compact]) return compact;
    if (providerAliases[candidate]) return providerAliases[candidate];
  }

  return undefined;
}
