import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import type { Playlist } from "../types";

interface SharePlaylistButtonProps {
  playlist: Playlist;
  label?: string;
  iconOnly?: boolean;
  onMakePublic?: () => void | Promise<void>;
  onCreateSharedLink?: (playlistId: string) => Promise<{ sharedSlug: string; visibility: "shared" }>;
  openToken?: number;
}

function getPublicOrigin() {
  if (window.location.hostname.endsWith("flim.ca")) return "https://www.flim.ca";
  return window.location.origin;
}

function titleCountLabel(count: number) {
  return `${count} ${count === 1 ? "Title" : "Titles"}`;
}

export function SharePlaylistButton({ playlist, label = "Share", iconOnly = false, onMakePublic, onCreateSharedLink, openToken = 0 }: SharePlaylistButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [copied, setCopied] = useState(false);
  const [madePublic, setMadePublic] = useState(false);
  const [isMakingPublic, setIsMakingPublic] = useState(false);
  const [sharedSlug, setSharedSlug] = useState(playlist.sharedSlug || "");
  const [isCreatingSharedLink, setIsCreatingSharedLink] = useState(false);
  const isPublicShareable = playlist.visibility === "public" || madePublic;
  const publicUrl = useMemo(() => `${getPublicOrigin()}/p/${playlist.publicSlug}`, [playlist.publicSlug]);
  const sharedUrl = useMemo(() => (sharedSlug ? `${getPublicOrigin()}/s/${sharedSlug}` : ""), [sharedSlug]);
  const activeUrl = isPublicShareable ? publicUrl : sharedUrl;
  const activeLinkLabel = isPublicShareable ? "Public Link" : "Shared Link";
  const shareCardUrl = useMemo(() => `${getPublicOrigin()}/api/og/playlist/${encodeURIComponent(playlist.publicSlug)}`, [playlist.publicSlug]);

  useEffect(() => {
    setSharedSlug(playlist.sharedSlug || "");
  }, [playlist.sharedSlug]);

  useEffect(() => {
    if (!isOpen || isPublicShareable || sharedSlug || !onCreateSharedLink || isCreatingSharedLink) return;
    createSharedLink();
  }, [isOpen, isPublicShareable, sharedSlug, onCreateSharedLink, isCreatingSharedLink]);

  useEffect(() => {
    if (!isOpen) return;
    if (!activeUrl) {
      setQrCodeUrl("");
      setCanNativeShare(false);
      return;
    }

    setCopied(false);
    setStatus("");
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");

    QRCode.toDataURL(activeUrl, {
      margin: 2,
      width: 280,
      color: {
        dark: "#08090d",
        light: "#ffffff",
      },
    })
      .then(setQrCodeUrl)
      .catch(() => setStatus("QR code could not be generated."));
  }, [isOpen, activeUrl]);

  useEffect(() => {
    if (openToken > 0) setIsOpen(true);
  }, [openToken]);

  async function copyLink() {
    if (!activeUrl) return;
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setStatus("Link Copied");
    } catch {
      setCopied(false);
      setStatus("Copy failed. The share link is shown above.");
    }
  }

  async function nativeShare() {
    if (!activeUrl) return;
    if (!navigator.share) {
      await copyLink();
      return;
    }

    try {
      await navigator.share({
        title: playlist.name,
        text: playlist.description || "Open this Flim playlist.",
        url: activeUrl,
      });
      setStatus("Share sheet opened");
    } catch {
      setStatus("Share cancelled. You can still copy the public link.");
    }
  }

  function openShare() {
    setIsOpen(true);
  }

  async function makePublic() {
    if (!onMakePublic) return;
    setIsMakingPublic(true);
    setStatus("");
    try {
      await onMakePublic();
      setMadePublic(true);
      setStatus("Playlist is public. Share it with the link or QR code.");
    } catch {
      setStatus("Unable to make playlist public. Please try again.");
    } finally {
      setIsMakingPublic(false);
    }
  }

  async function createSharedLink() {
    if (sharedSlug) return;
    if (!onCreateSharedLink) {
      setStatus("Unable to create a shared link. Please try again.");
      return;
    }

    setIsCreatingSharedLink(true);
    setStatus("");
    try {
      const result = await onCreateSharedLink(playlist.id);
      setSharedSlug(result.sharedSlug);
      setStatus("Shared link ready.");
    } catch {
      setStatus("Unable to create a shared link. Please try again.");
    } finally {
      setIsCreatingSharedLink(false);
    }
  }

  return (
    <>
      <button className={iconOnly ? "share-icon-button" : "secondary-button"} aria-label={label} onClick={openShare} type="button">
        {iconOnly ? (
          <>
            <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
              <path d="M16 8.5 8.8 12 16 15.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
              <circle cx="18" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="2" />
              <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
              <circle cx="18" cy="16.5" r="2.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            <span className="sr-only">{label}</span>
          </>
        ) : label}
      </button>
      {isOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Share playlist">
          <div className="share-panel">
            <div className="modal-header">
              <div>
                <h2>Share Playlist</h2>
              </div>
              <button className="ghost-button" onClick={() => setIsOpen(false)} type="button">
                Close
              </button>
            </div>
            {!isPublicShareable ? (
              <>
                <section className="share-mode-section">
                  <h3>Share with people</h3>
                  <p className="helper-text">People with this private shared link can view, add, and remove titles. This does not make the playlist public.</p>
                  {!sharedUrl ? (
                    <div className="share-link-loading" aria-live="polite">
                      {isCreatingSharedLink ? "Preparing shared link and QR code..." : "Shared link will appear here."}
                    </div>
                  ) : (
                    <>
                      <div className="share-link-card">
                        <span>{activeLinkLabel}</span>
                        <p>{sharedUrl}</p>
                      </div>
                      <div className="share-actions primary-share-actions">
                        <button className="primary-button copy-link-button" onClick={copyLink} type="button">
                          {copied ? "Link Copied" : "Copy Link"}
                        </button>
                        {canNativeShare ? (
                          <button className="secondary-button share-primary-action" onClick={nativeShare} type="button">
                            Share
                          </button>
                        ) : null}
                      </div>
                      <div className="qr-card">
                        <div className="qr-card-heading">
                          <strong>{playlist.name}</strong>
                        </div>
                        {qrCodeUrl ? <img alt={`QR code for ${playlist.name}`} src={qrCodeUrl} /> : <div className="qr-placeholder">Generating QR code...</div>}
                      </div>
                    </>
                  )}
                </section>
                {onMakePublic ? (
                  <section className="share-mode-section">
                    <h3>Make Public</h3>
                    <p className="helper-text">Public playlists can be discovered and followed by anyone on Flim. Public visitors cannot edit titles.</p>
                    <button className="secondary-button share-primary-action" disabled={isMakingPublic} onClick={makePublic} type="button">
                      {isMakingPublic ? "Making Public..." : "Make Public"}
                    </button>
                  </section>
                ) : null}
                {status ? <p className={status.startsWith("Unable") ? "error-message" : "success-message"}>{status}</p> : null}
              </>
            ) : (
              <>
            <div className="share-card-preview" aria-label={`${playlist.name} social preview card`}>
              <img alt={`${playlist.name} Flim share card`} src={shareCardUrl} />
            </div>
            <div className="share-playlist-preview">
              <div className="share-cover-art" aria-hidden="true">
                {playlist.movies.slice(0, 4).map((movie) =>
                  movie.posterUrl ? <img alt="" key={movie.tmdbId} src={movie.posterUrl} /> : <span key={movie.tmdbId} />,
                )}
                {playlist.movies.length === 0 ? (
                  <>
                    <span />
                    <span />
                    <span />
                    <span />
                  </>
                ) : null}
              </div>
              <div>
                <h3>{playlist.name}</h3>
                <p>{titleCountLabel(playlist.movies.length)}</p>
              </div>
            </div>
            <div className="share-link-card">
              <span>{activeLinkLabel}</span>
              <p>{activeUrl}</p>
            </div>
            <div className="share-actions primary-share-actions">
              <button className="primary-button copy-link-button" onClick={copyLink} type="button">
                {copied ? "Link Copied" : "Copy Link"}
              </button>
              {canNativeShare ? (
                <button className="secondary-button share-primary-action" onClick={nativeShare} type="button">
                  Share
                </button>
              ) : null}
            </div>
            <div className="qr-card">
              <div className="qr-card-heading">
                <strong>{playlist.name}</strong>
              </div>
              {qrCodeUrl ? <img alt={`QR code for ${playlist.name}`} src={qrCodeUrl} /> : <div className="qr-placeholder">Generating QR code...</div>}
            </div>
            <div className="share-actions secondary-share-actions">
              <a className="secondary-button qr-download share-primary-action" download={`${playlist.publicSlug}-flim-share-card.png`} href={shareCardUrl}>
                Download Card
              </a>
              {qrCodeUrl ? (
                <a className="secondary-button qr-download share-primary-action" download={`${playlist.publicSlug}-qr.png`} href={qrCodeUrl}>
                  Download QR
                </a>
              ) : null}
            </div>
            {status ? <p className="success-message">{status}</p> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
