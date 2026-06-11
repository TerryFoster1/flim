import { useMemo, useState } from "react";

interface ShareAssetButtonProps {
  label: string;
  title: string;
  text: string;
  url: string;
  cardUrl: string;
  downloadName: string;
  className?: string;
}

function publicOrigin() {
  if (typeof window === "undefined") return "https://www.flim.ca";
  if (window.location.hostname.endsWith("flim.ca")) return "https://www.flim.ca";
  return window.location.origin;
}

function absoluteUrl(value: string) {
  if (/^https?:\/\//i.test(value)) return value;
  return `${publicOrigin()}${value.startsWith("/") ? value : `/${value}`}`;
}

export function ShareAssetButton({ label, title, text, url, cardUrl, downloadName, className = "secondary-button" }: ShareAssetButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const shareUrl = useMemo(() => absoluteUrl(url), [url]);
  const imageUrl = useMemo(() => absoluteUrl(cardUrl), [cardUrl]);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setStatus("Link copied.");
    } catch {
      setStatus("Copy failed. The share link is shown above.");
    }
  }

  async function nativeShare() {
    if (!canNativeShare) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({ title, text, url: shareUrl });
      setStatus("Share sheet opened.");
    } catch {
      setStatus("Share cancelled. You can still copy the link.");
    }
  }

  return (
    <>
      <button className={className} onClick={() => setIsOpen(true)} type="button">
        {label}
      </button>
      {isOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`Share ${title}`}>
          <div className="share-panel share-asset-panel">
            <div className="modal-header">
              <div>
                <h2>{label}</h2>
                <p className="helper-text">{text}</p>
              </div>
              <button className="ghost-button" onClick={() => setIsOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="share-card-preview">
              <img alt={`${title} share card`} src={imageUrl} />
            </div>
            <div className="share-link-card">
              <span>Share Link</span>
              <p>{shareUrl}</p>
            </div>
            <div className="share-actions primary-share-actions">
              <button className="primary-button copy-link-button" onClick={copyLink} type="button">
                Copy Link
              </button>
              {canNativeShare ? (
                <button className="secondary-button share-primary-action" onClick={nativeShare} type="button">
                  Native Share
                </button>
              ) : null}
            </div>
            <div className="share-actions secondary-share-actions">
              <a className="secondary-button qr-download share-primary-action" download={downloadName} href={imageUrl}>
                Download Card
              </a>
            </div>
            {status ? <p className={status.startsWith("Copy failed") ? "error-message" : "success-message"}>{status}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
