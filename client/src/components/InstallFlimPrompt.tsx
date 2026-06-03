import { useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallFlimPromptProps {
  mode?: "floating" | "settings";
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isMobileLike() {
  return window.matchMedia("(max-width: 760px)").matches || /android|iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallFlimPrompt({ mode = "floating" }: InstallFlimPromptProps) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");
  const ios = useMemo(isIos, []);
  const mobile = useMemo(isMobileLike, []);

  useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setMessage("Flim is installed.");
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) {
      setMessage(ios ? "Use Share, then Add to Home Screen." : "Install is available when your browser offers it.");
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);
    setMessage(choice.outcome === "accepted" ? "Flim is installing." : "Install dismissed.");
  }

  if (installed && mode === "floating") return null;
  if (dismissed && mode === "floating") return null;
  if (!mobile && !installEvent && mode === "floating") return null;

  return (
    <aside className={`install-card ${mode === "settings" ? "settings-install-card" : "floating-install-card"}`} aria-label="Install Flim">
      <div className="install-card-brand">
        <img alt="" src="/brand/flim-icon-192.png" />
        <div>
          <h2>{ios && !installEvent ? "Add Flim to your Home Screen" : "Install Flim"}</h2>
        </div>
      </div>
      {ios && !installEvent ? (
        <ol className="ios-install-steps">
          <li>Tap Share.</li>
          <li>Tap Add to Home Screen.</li>
        </ol>
      ) : (
        <p>Get one-tap access to your movie playlists.</p>
      )}
      <div className="button-row">
        {!ios || installEvent ? (
          <button className="primary-button" onClick={install} type="button">
            Install Flim
          </button>
        ) : null}
        {mode === "floating" ? (
          <button className="secondary-button" onClick={() => setDismissed(true)} type="button">
            Not Now
          </button>
        ) : null}
      </div>
      {message ? <p className="helper-text">{message}</p> : null}
    </aside>
  );
}
