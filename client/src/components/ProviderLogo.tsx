import { providerAssets, providerIconKey } from "../data/providerAssets";
import type { WatchProvider } from "../types";

interface ProviderLogoProps {
  provider: Pick<WatchProvider, "id" | "name" | "logoUrl">;
}

export function ProviderLogo({ provider }: ProviderLogoProps) {
  const assetKey = providerIconKey(provider);
  const asset = assetKey ? providerAssets[assetKey] : undefined;

  if (asset) {
    return <img className="provider-logo provider-logo-image" src={asset.src} alt={provider.name} loading="lazy" />;
  }

  if (provider.logoUrl) {
    return <img className="provider-logo provider-logo-image provider-logo-external" src={provider.logoUrl} alt={provider.name} loading="lazy" />;
  }

  return <span className="provider-logo provider-logo-wordmark" aria-label={provider.name}>{provider.name}</span>;
}
