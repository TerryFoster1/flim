import { PageShell } from "../components/PageShell";

export function Settings() {
  return (
    <PageShell eyebrow="Settings" title="Settings shell" description="Placeholder-only planning surface for future preferences.">
      <div className="section-grid two-col">
        <article className="feature-panel">
          <span className="eyebrow">Future preferences</span>
          <h2>User Name</h2>
          <p>No account, notification, provider, or payment settings are implemented.</p>
        </article>
        <article className="feature-panel">
          <span className="eyebrow">Visual only</span>
          <h2>Provider Name</h2>
          <p>This shell exists to evaluate layout and navigation only.</p>
        </article>
      </div>
    </PageShell>
  );
}
