import { useEffect, useRef, useState } from "react";
import type { CurrentUser, RouteAwareProps } from "../types";
import { BrandMark } from "./BrandMark";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notificationService";
import type { AppNotification, NotificationFeed } from "../types";

interface NavigationBarProps extends RouteAwareProps {
  currentUser: CurrentUser | null;
  onLogout: () => void;
}

export function NavigationBar({ currentUser, onNavigate, onLogout }: NavigationBarProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationFeed, setNotificationFeed] = useState<NotificationFeed>({ unreadCount: 0, notifications: [] });
  const [notificationStatus, setNotificationStatus] = useState("");
  const menuHistoryArmed = useRef(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone));
    setIsInstalled(standalone);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setNotificationFeed({ unreadCount: 0, notifications: [] });
      setIsNotificationsOpen(false);
      return;
    }

    refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 60000);
    return () => window.clearInterval(timer);
  }, [currentUser?.id]);

  useEffect(() => {
    const closeOnBack = () => {
      if (menuHistoryArmed.current) {
        menuHistoryArmed.current = false;
        setIsMenuOpen(false);
      }
    };
    window.addEventListener("popstate", closeOnBack);
    return () => window.removeEventListener("popstate", closeOnBack);
  }, []);

  async function refreshNotifications() {
    if (!currentUser) return;
    try {
      const feed = await getNotifications();
      setNotificationFeed(feed);
      setNotificationStatus("");
    } catch {
      setNotificationStatus("Notifications are unavailable right now.");
    }
  }

  function formatNotificationTime(createdAt: string) {
    const created = new Date(createdAt).getTime();
    if (!Number.isFinite(created)) return "";
    const minutes = Math.max(0, Math.round((Date.now() - created) / 60000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function navigate(path: string) {
    if (menuHistoryArmed.current && window.history.state?.flimMenu) {
      window.history.replaceState({ ...window.history.state, flimMenu: false }, "", window.location.href);
    }
    menuHistoryArmed.current = false;
    setIsMenuOpen(false);
    setIsNotificationsOpen(false);
    onNavigate(path);
  }

  function openMenu() {
    setIsNotificationsOpen(false);
    setIsMenuOpen(true);
    if (!window.history.state?.flimMenu) {
      window.history.pushState({ ...(window.history.state || {}), flimMenu: true }, "", window.location.href);
      menuHistoryArmed.current = true;
    }
  }

  function closeMenu() {
    if (menuHistoryArmed.current && window.history.state?.flimMenu) {
      window.history.back();
      return;
    }
    menuHistoryArmed.current = false;
    setIsMenuOpen(false);
  }

  function toggleMenu() {
    if (isMenuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function logout() {
    setIsMenuOpen(false);
    setIsNotificationsOpen(false);
    onLogout();
  }

  async function openNotification(notification: AppNotification) {
    setNotificationFeed((current) => ({
      unreadCount: notification.readAt ? current.unreadCount : Math.max(0, current.unreadCount - 1),
      notifications: current.notifications.map((item) =>
        item.id === notification.id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item,
      ),
    }));
    await markNotificationRead(notification.id).catch(() => undefined);
    navigate(notification.entityPath || "/playlists");
  }

  async function markAllRead() {
    setNotificationFeed((current) => ({
      unreadCount: 0,
      notifications: current.notifications.map((notification) => ({
        ...notification,
        readAt: notification.readAt || new Date().toISOString(),
      })),
    }));
    await markAllNotificationsRead().catch(() => undefined);
  }

  const unreadCount = notificationFeed.unreadCount;

  const notificationPanel = isNotificationsOpen ? (
    <>
      <button
        className="notification-sheet-backdrop"
        aria-label="Close notifications"
        onClick={() => setIsNotificationsOpen(false)}
        type="button"
      />
      <div className="notification-panel" role="dialog" aria-modal="false" aria-label="Notifications">
        <div className="notification-panel-header">
          <div>
            <h2>Activity</h2>
            <p>{unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}</p>
          </div>
          <div className="notification-panel-actions">
            {unreadCount > 0 ? <button onClick={markAllRead} type="button">Mark all read</button> : null}
            <button className="notification-close-button" aria-label="Close notifications" onClick={() => setIsNotificationsOpen(false)} type="button">Close</button>
          </div>
        </div>
        {notificationStatus ? <p className="notification-status">{notificationStatus}</p> : null}
        {notificationFeed.notifications.length === 0 ? (
          <div className="notification-empty">
            <strong>You're all caught up.</strong>
            <span>No recent activity.</span>
          </div>
        ) : (
          <div className="notification-list">
            {notificationFeed.notifications.map((notification) => (
              <button
                className={notification.readAt ? "notification-item" : "notification-item is-unread"}
                key={notification.id}
                onClick={() => openNotification(notification)}
                type="button"
              >
                <span>{notification.title || "Flim"}</span>
                <p>{notification.message}</p>
                <small>{formatNotificationTime(notification.createdAt)}</small>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  ) : null;

  return (
    <header className="topbar">
      <button className="top-brand reset-button" onClick={() => navigate("/")} type="button">
        <BrandMark />
      </button>
      <div className="header-menu">
        {currentUser ? (
          <div className="notification-menu">
            <button
              className="notification-bell-button"
              aria-expanded={isNotificationsOpen}
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              onClick={() => {
                setIsNotificationsOpen((current) => !current);
                setIsMenuOpen(false);
                if (!isNotificationsOpen) refreshNotifications();
              }}
              type="button"
            >
              <span aria-hidden="true">Bell</span>
              {unreadCount > 0 ? <strong>{unreadCount > 9 ? "9+" : unreadCount}</strong> : null}
            </button>
            {notificationPanel}
          </div>
        ) : null}
        <button
          className="hamburger-button"
          aria-expanded={isMenuOpen}
          aria-label={isMenuOpen ? "Close menu" : "Open menu"}
          onClick={toggleMenu}
          type="button"
        >
          <span />
          <span />
          <span />
        </button>
        {isMenuOpen ? (
          <>
            <button className="hamburger-backdrop" aria-label="Close menu" onClick={closeMenu} type="button" />
            <div className="hamburger-panel" role="dialog" aria-label="Navigation menu">
              <div className="hamburger-panel-header">
                <strong>Menu</strong>
                <button className="hamburger-close-button" aria-label="Close menu" onClick={closeMenu} type="button">X</button>
              </div>
              {currentUser ? (
                <>
                  <button onClick={() => navigate("/settings")} type="button">Profile & Settings</button>
                  {currentUser.profile?.handle ? <button onClick={() => navigate(`/@${currentUser.profile?.handle}`)} type="button">View Public Profile</button> : null}
                  <button onClick={() => navigate("/followed-titles")} type="button">My Followed Titles</button>
                  <button onClick={() => navigate("/upcoming")} type="button">Upcoming Releases</button>
                  <button onClick={() => navigate("/games")} type="button">Trivia & Games</button>
                </>
              ) : (
                <>
                  <button onClick={() => navigate("/signin")} type="button">Sign In</button>
                  <button onClick={() => navigate("/signup")} type="button">Create Account</button>
                  <button onClick={() => navigate("/upcoming")} type="button">Upcoming Releases</button>
                  <button onClick={() => navigate("/games")} type="button">Trivia & Games</button>
                </>
              )}
              {currentUser && !isInstalled ? <button onClick={() => navigate("/settings")} type="button">Install Flim</button> : null}
              <button onClick={() => navigate("/help")} type="button">Help</button>
              <button onClick={() => navigate("/about")} type="button">About</button>
              <button onClick={() => navigate("/privacy")} type="button">Privacy Policy</button>
              <button onClick={() => navigate("/terms")} type="button">Terms of Use</button>
              {currentUser ? <button className="logout-menu-item" onClick={logout} type="button">Logout</button> : null}
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
