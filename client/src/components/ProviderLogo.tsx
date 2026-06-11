import { providerLogoResolution } from "../data/providerAssets";
import { useState } from "react";
import type { WatchProvider } from "../types";

interface ProviderLogoProps {
  provider: Pick<WatchProvider, "id" | "name" | "logoUrl">;
}

export function ProviderLogo({ provider }: ProviderLogoProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const resolution = providerLogoResolution(provider);

  if (resolution.asset && !imageFailed) {
    return <img className="provider-logo provider-logo-image" src={resolution.asset.src} alt={provider.name} loading="lazy" onError={() => setImageFailed(true)} />;
  }

  if (resolution.usesExternalLogo && provider.logoUrl && !imageFailed) {
    return <img className="provider-logo provider-logo-image provider-logo-external" src={provider.logoUrl} alt={provider.name} loading="lazy" onError={() => setImageFailed(true)} />;
  }

  if (resolution.isKnown) {
    return <span className="provider-logo provider-logo-wordmark" aria-label={provider.name}>{provider.name}</span>;
  }

  return <span className={resolution.isKnown ? "provider-logo provider-logo-badge provider-logo-known-missing" : "provider-logo provider-logo-badge"} aria-label={provider.name}>{resolution.initials}</span>;
}
