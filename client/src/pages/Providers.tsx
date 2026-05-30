import { PageShell } from "../components/PageShell";
import { ProviderLogo } from "../components/ProviderLogo";
import { placeholderProviders } from "../data/placeholders";

export function Providers() {
  return (
    <PageShell eyebrow="Providers" title="Streaming provider directory" description="Visual placeholder only. No links, logos, availability, or integrations.">
      <div className="provider-grid">
        {placeholderProviders.map((provider) => (
          <article key={provider.id}>
            <ProviderLogo provider={provider} />
            <strong>{provider.name}</strong>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
