export interface ProviderAsset {
  label: string;
  className: string;
}

export const providerAssets: Record<string, ProviderAsset> = {
  netflix: { label: "Netflix", className: "provider-logo-netflix" },
  prime: { label: "prime video", className: "provider-logo-prime" },
  disney: { label: "Disney+", className: "provider-logo-disney" },
  apple: { label: "Apple TV", className: "provider-logo-apple" },
  crave: { label: "CRAVE", className: "provider-logo-crave" },
  youtube: { label: "YouTube", className: "provider-logo-youtube" },
  tubi: { label: "tubi", className: "provider-logo-tubi" },
  paramount: { label: "Paramount+", className: "provider-logo-paramount" },
  plex: { label: "PLEX", className: "provider-logo-plex" },
};
