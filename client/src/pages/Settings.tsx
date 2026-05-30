import { InstallFlimPrompt } from "../components/InstallFlimPrompt";

export function Settings() {
  return (
    <section className="route-page">
      <div className="page-heading">
        <span className="eyebrow">Settings</span>
        <h1>Install Flim</h1>
        <p>Keep your movie collections one tap away.</p>
      </div>
      <InstallFlimPrompt mode="settings" />
    </section>
  );
}
