import { placeholderProviders } from "../data/placeholders";
import { ProviderLogo } from "./ProviderLogo";

export function ProviderRow() {
  return (
    <div className="provider-row">
      {placeholderProviders.slice(0, 5).map((provider) => (
        <div className="provider-row-item" key={provider.id}>
          <ProviderLogo provider={provider} />
          <span>Provider Name</span>
        </div>
      ))}
    </div>
  );
}
