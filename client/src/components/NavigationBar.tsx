import { useState } from "react";
import type { RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

export function NavigationBar({ onNavigate }: RouteAwareProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  function navigate(path: string) {
    setIsMenuOpen(false);
    onNavigate(path);
  }

  return (
    <header className="topbar">
      <button className="top-brand reset-button" onClick={() => navigate("/")} type="button">
        <BrandMark />
      </button>
      <div className="header-menu">
        <button
          className="hamburger-button"
          aria-expanded={isMenuOpen}
          aria-label="Open menu"
          onClick={() => setIsMenuOpen((current) => !current)}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        {isMenuOpen ? (
          <div className="hamburger-panel">
            <button onClick={() => navigate("/settings")} type="button">Settings</button>
            <button onClick={() => navigate("/settings")} type="button">Install Flim</button>
            <button disabled type="button">Help</button>
            <button disabled type="button">About</button>
            <button onClick={() => navigate("/settings")} type="button">Connect Plex</button>
            <button disabled type="button">Future Integrations</button>
            <button disabled type="button">Account</button>
            <button disabled type="button">Logout</button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
