import type { PlaceholderProvider } from "../data/placeholders";

interface ProviderLogoProps {
  provider: PlaceholderProvider;
}

export function ProviderLogo({ provider }: ProviderLogoProps) {
  return <div className={`provider-logo tone-${provider.tone}`} aria-hidden="true">{provider.name.slice(0, 1)}</div>;
}
