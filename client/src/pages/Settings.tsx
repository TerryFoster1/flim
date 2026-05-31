import { InstallFlimPrompt } from "../components/InstallFlimPrompt";

export function Settings() {
  return (
    <section className="route-page">
      <div className="page-heading">
        <span className="eyebrow">Settings</span>
        <h1>Flim setup</h1>
        <p>Install Flim and prepare future watch integrations without storing provider passwords.</p>
      </div>
      <InstallFlimPrompt mode="settings" />
      <section className="settings-integration-card">
        <span className="eyebrow">Plex Library</span>
        <h2>Plex foundation</h2>
        <p>
          Plex will be Flim's first serious library and remote-control target. Account connection, library import,
          movie matching, and player control are placeholders for a later authenticated phase.
        </p>
        <div className="button-row">
          <button className="secondary-button" disabled type="button">
            Connect Plex
          </button>
          <button className="secondary-button" disabled type="button">
            Import Plex Library
          </button>
          <button className="secondary-button" disabled type="button">
            Send to Plex Player
          </button>
        </div>
      </section>
    </section>
  );
}
