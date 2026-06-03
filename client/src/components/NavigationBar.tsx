import { useEffect, useState } from "react";
import type { CurrentUser, RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";

interface NavigationBarProps extends RouteAwareProps {
  currentUser: CurrentUser | null;
  onLogout: () => void;
}

export function NavigationBar({ currentUser, onNavigate, onLogout }: NavigationBarProps) {
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
            {currentUser ? (
              <>
                <button onClick={() => navigate(currentUser.profile?.handle ? `/@${currentUser.profile.handle}` : "/profile")} type="button">Profile</button>
                <button onClick={() => navigate("/settings")} type="button">Settings</button>
                <button onClick={() => navigate("/settings")} type="button">Connect Plex</button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("/signin")} type="button">Sign In</button>
                <button onClick={() => navigate("/signup")} type="button">Create Account</button>
              </>
            )}
            {currentUser && !isInstalled ? <button onClick={() => navigate("/settings")} type="button">Install Flim</button> : null}
            <button onClick={() => navigate("/help")} type="button">Help</button>
            <button onClick={() => navigate("/about")} type="button">About</button>
            {currentUser ? <button className="logout-menu-item" onClick={logout} type="button">Logout</button> : null}
          </div>
        ) : null}
      </div>
    </header>
  );
}
