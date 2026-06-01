import { PageShell } from "../components/PageShell";

export function TermsOfUse() {
  return (
    <PageShell eyebrow="Terms" title="Terms of Use" description="Plain-language rules for using Flim.">
      <div className="legal-page">
        <section>
          <h2>Acceptable Use</h2>
          <p>Use Flim to create, organize, and share movie playlists. Do not use the service to harass others, abuse public sharing, or interfere with the platform.</p>
        </section>
        <section>
          <h2>Content Ownership</h2>
          <p>You own the playlist names, descriptions, and organization choices you create. Movie metadata, posters, and third-party provider information remain owned by their respective rights holders.</p>
        </section>
        <section>
          <h2>User-Generated Playlists</h2>
          <p>If you make a playlist public or share its link, other people may view it. Future account controls will provide clearer ownership and visibility management.</p>
        </section>
        <section>
          <h2>Service Availability</h2>
          <p>Flim is an evolving product. Features may change, improve, pause, or disappear while the platform develops.</p>
        </section>
        <section>
          <h2>Third-Party Integrations</h2>
          <p>TMDb, Plex, streaming providers, Spotify, YouTube, and other integrations are separate services. Flim helps you decide what to watch and where to open it; it does not control those services.</p>
        </section>
        <section>
          <h2>Account Responsibilities</h2>
          <p>When accounts are available, you are responsible for keeping your sign-in details safe and for activity under your account.</p>
        </section>
        <section>
          <h2>Limitation Of Liability</h2>
          <p>Flim is provided as-is. We work hard to keep it useful, but we cannot guarantee uninterrupted availability, perfect metadata, or every provider link working on every device.</p>
        </section>
      </div>
    </PageShell>
  );
}
