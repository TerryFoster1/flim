import { isKnownProvider, providerAssets, providerIconKey } from "../data/providerAssets";
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

  if (isKnownProvider(provider)) {
    return (
      <svg className="provider-logo provider-logo-generic provider-logo-known" aria-label={provider.name} role="img" viewBox="0 0 64 64">
        <circle className="provider-logo-bg" cx="32" cy="32" r="31" />
        <path className="provider-logo-mark" d="M24 18v28l22-14z" />
      </svg>
    );
  }

  const label = provider.name.split(/\s+/).map((word) => word[0]).join("").slice(0, 3).toUpperCase();

  return (
    <svg className="provider-logo provider-logo-generic" aria-label={provider.name} role="img" viewBox="0 0 64 64">
      <circle className="provider-logo-bg" cx="32" cy="32" r="31" />
      <text className="provider-logo-text" x="32" y="33" textAnchor="middle">
        {label}
      </text>
    </svg>
  );
}
