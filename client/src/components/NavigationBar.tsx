import { useEffect, useState } from "react";
import type { RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

interface NavigationBarProps extends RouteAwareProps {
  onLogout: () => void;
}

export function NavigationBar({ onNavigate, onLogout }: NavigationBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setIsInstalled(standalone);
  }, []);

  function navigate(path: string) {
    setIsMenuOpen(false);
    onNavigate(path);
  }

  function logout() {
    setIsMenuOpen(false);
    onLogout();
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
            <button onClick={() => navigate("/profile")} type="button">Profile</button>
            <button onClick={() => navigate("/settings")} type="button">Settings</button>
            <button onClick={() => navigate("/settings")} type="button">Connect Plex</button>
            {!isInstalled ? <button onClick={() => navigate("/settings")} type="button">Install Flim</button> : null}
            <button disabled type="button">Help</button>
            <button disabled type="button">About</button>
            <button className="logout-menu-item" onClick={logout} type="button">Logout</button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
