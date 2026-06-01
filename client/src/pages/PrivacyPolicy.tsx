import { PageShell } from "../components/PageShell";

export function PrivacyPolicy() {
  return (
    <PageShell eyebrow="Privacy" title="Privacy Policy" description="How Flim handles information as the platform grows.">
      <div className="legal-page">
        <section>
          <h2>Information We Collect</h2>
          <p>Flim stores the playlists, movie entries, watched status, and sharing links you create so the app can keep your movie collections available across devices.</p>
        </section>
        <section>
          <h2>Account Information</h2>
          <p>Account features are still developing. When accounts are enabled, Flim will collect the basic information needed to sign in, protect your playlists, and connect your activity to your profile.</p>
        </section>
        <section>
          <h2>Playlists And Sharing</h2>
          <p>Public playlist links can be opened by anyone who has the URL. Private and shared permissions will become stricter as authentication and ownership controls are added.</p>
        </section>
        <section>
          <h2>Usage Analytics And Cookies</h2>
          <p>Flim may use privacy-conscious analytics and essential cookies later to understand product health, remember sessions, and improve discovery. We do not need analytics to sell your playlists.</p>
        </section>
        <section>
          <h2>Third-Party Services</h2>
          <p>Flim uses TMDb for movie metadata and may integrate with Plex and streaming providers. Those services have their own privacy practices when you open or connect them.</p>
        </section>
        <section>
          <h2>TMDb Attribution</h2>
          <p>Movie metadata and posters may be provided by TMDb. Flim is not endorsed or certified by TMDb.</p>
        </section>
        <section>
          <h2>Plex Integration</h2>
          <p>Future Plex features will ask permission before connecting a library. Flim should never ask for or store Plex passwords directly.</p>
        </section>
        <section>
          <h2>Your Rights</h2>
          <p>You can request access, correction, or deletion of information associated with you once account ownership is available.</p>
        </section>
        <section>
          <h2>Contact</h2>
          <p>Use the Contact page for privacy questions or data requests.</p>
        </section>
      </div>
    </PageShell>
  );
}
