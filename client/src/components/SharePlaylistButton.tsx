import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { Playlist } from "../types";

interface SharePlaylistButtonProps {
  playlist: Playlist;
}

function getPublicOrigin() {
  if (window.location.hostname.endsWith("flim.ca")) return "https://www.flim.ca";
  return window.location.origin;
}

export function SharePlaylistButton({ playlist }: SharePlaylistButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => `${getPublicOrigin()}/p/${playlist.publicSlug}`, [playlist.publicSlug]);

  useEffect(() => {
    if (!isOpen) return;

    setCopied(false);
    setStatus("");
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");

    QRCode.toDataURL(url, {
      margin: 2,
      width: 280,
      color: {
        dark: "#08090d",
        light: "#ffffff",
      },
    })
      .then(setQrCodeUrl)
      .catch(() => setStatus("QR code could not be generated."));
  }, [isOpen, url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setStatus("Link Copied");
    } catch {
      setCopied(false);
      setStatus("Copy failed. The public URL is shown above.");
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: playlist.name,
        text: playlist.description || "Open this Flim playlist.",
        url,
      });
      setStatus("Share sheet opened");
    } catch {
      setStatus("Share cancelled. You can still copy the public link.");
    }
  }

  return (
    <>
      <button className="secondary-button" onClick={() => setIsOpen(true)} type="button">
        Share
      </button>
      {isOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Share playlist">
          <div className="share-panel">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Public Share</span>
                <h2>Share this playlist</h2>
              </div>
              <button className="ghost-button" onClick={() => setIsOpen(false)} type="button">
                Close
              </button>
            </div>
            <p className="helper-text">
              Anyone with this link can view the playlist. Auth and access controls will be added in a later phase.
            </p>
            <div className="share-link-card">
              <span>Playlist URL</span>
              <p>{url}</p>
            </div>
            <div className="share-actions primary-share-actions">
              <button className="primary-button copy-link-button" onClick={copyLink} type="button">
                {copied ? "Link Copied" : "Copy Link"}
              </button>
              {canNativeShare ? (
                <button className="secondary-button" onClick={nativeShare} type="button">
                  Share
                </button>
              ) : null}
            </div>
            <div className="qr-card">
              {qrCodeUrl ? <img alt={`QR code for ${playlist.name}`} src={qrCodeUrl} /> : <div className="qr-placeholder">Generating QR code...</div>}
            </div>
            <div className="share-actions secondary-share-actions">
              {qrCodeUrl ? (
                <a className="secondary-button qr-download" download={`${playlist.publicSlug}-qr.png`} href={qrCodeUrl}>
                  Download QR
                </a>
              ) : null}
            </div>
            {status ? <p className="success-message">{status}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
