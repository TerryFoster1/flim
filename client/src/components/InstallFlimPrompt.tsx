import { useEffect, useMemo, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallFlimPromptProps {
  mode?: "floating" | "settings";
  alwaysShow?: boolean;
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

const installDismissedKey = "flim:install-dismissed-at";
const installDismissedMs = 1000 * 60 * 60 * 24 * 14;

function wasDismissedRecently() {
  try {
    const dismissedAt = Number(window.localStorage.getItem(installDismissedKey) || 0);
    return dismissedAt > 0 && Date.now() - dismissedAt < installDismissedMs;
  } catch {
    return false;
  }
}

function rememberDismissal() {
  try {
    window.localStorage.setItem(installDismissedKey, String(Date.now()));
  } catch {
    // Dismissal persistence is best effort only.
  }
}

export function InstallFlimPrompt({ alwaysShow = false, mode = "floating" }: InstallFlimPromptProps) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(() => wasDismissedRecently());
  const [installed, setInstalled] = useState(false);
  const [message, setMessage] = useState("");
  const ios = useMemo(isIos, []);
  const mobile = useMemo(isMobileLike, []);
  const showPersistentInstallHelp = mode === "settings" || alwaysShow;
  const installAvailable = Boolean(installEvent) && !installed;

  useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    }

    function onInstalled() {
      setInstalled(true);
      setMessage("Flim is installed.");
      rememberDismissal();
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
    if (choice.outcome === "dismissed") {
      rememberDismissal();
      setDismissed(true);
    }
  }

  if (installed && !showPersistentInstallHelp) return null;
  if (dismissed && !showPersistentInstallHelp) return null;
  if (!installEvent && !ios && !showPersistentInstallHelp) return null;
  if (!mobile && !installEvent && mode === "floating") return null;

  const title = installed ? "Flim is installed" : installAvailable ? "Install Flim" : "How to Install Flim";

  return (
    <aside className={`install-card ${mode === "settings" ? "settings-install-card" : "floating-install-card"}`} aria-label="Install Flim">
      <div className="install-card-brand">
        <img alt="" src="/brand/flim-icon-192.png" />
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      {installed ? (
        <p>Flim is already installed on this device.</p>
      ) : !installAvailable ? (
        <ol className="ios-install-steps">
          {ios ? (
            <>
              <li>Tap Share.</li>
              <li>Tap Add to Home Screen.</li>
            </>
          ) : (
            <>
              <li>On Android Chrome, open the browser menu.</li>
              <li>Tap Install app or Add to Home screen.</li>
              <li>On desktop Chrome or Edge, use the browser install option when it appears.</li>
            </>
          )}
        </ol>
      ) : (
        <p>Get one-tap access to your movie playlists.</p>
      )}
      <div className="button-row">
        {installAvailable ? (
          <button className="primary-button" onClick={install} type="button">
            Install Flim
          </button>
        ) : null}
        {mode === "floating" ? (
          <button className="secondary-button" onClick={() => {
            rememberDismissal();
            setDismissed(true);
          }} type="button">
            Not Now
          </button>
        ) : null}
      </div>
      {message ? <p className="helper-text">{message}</p> : null}
    </aside>
  );
}
