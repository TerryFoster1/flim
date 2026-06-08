import { providerAssets } from "../data/providerAssets";
import type { WatchProvider } from "../types";

interface ProviderLogoProps {
  provider: Pick<WatchProvider, "id" | "name" | "logoUrl">;
}

export function ProviderLogo({ provider }: ProviderLogoProps) {
  if (provider.logoUrl) {
    return <img className="provider-logo provider-logo-img" src={provider.logoUrl} alt={`${provider.name} logo`} loading="lazy" />;
  }

  const asset = providerAssets[provider.id];
  const label = asset?.label || provider.name;
  const className = asset?.className || "provider-logo-generic";

  return (
    <svg className={`provider-logo ${className}`} aria-label={provider.name} role="img" viewBox="0 0 180 54">
      <rect className="provider-logo-bg" x="1" y="1" width="178" height="52" rx="14" />
      <text className="provider-logo-text" x="90" y="34" textAnchor="middle">
        {label}
      </text>
    </svg>
  );
}
