import { PageShell } from "../components/PageShell";

export function Help() {
  return (
    <PageShell eyebrow="Help" title="Help" description="Quick answers for the core Flim flows.">
      <div className="legal-page">
        <section>
          <h2>Create a playlist</h2>
          <p>Open My Playlists, choose Create Playlist, then add movie or TV titles from the playlist page.</p>
        </section>
        <section>
          <h2>Share a playlist</h2>
          <p>Use Share Playlist to copy the public link, open the native share sheet, or show a QR code.</p>
        </section>
        <section>
          <h2>Follow public playlists</h2>
          <p>Open a public playlist and choose Follow Playlist. Followed playlists appear higher in Public Playlists and are available to Now Playing.</p>
        </section>
        <section>
          <h2>Need help?</h2>
          <p>Use the Contact page to send a note about account access, playlist sharing, or a broken link.</p>
          <div className="legal-link-row">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Use</a>
            <a href="/contact">Contact</a>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
