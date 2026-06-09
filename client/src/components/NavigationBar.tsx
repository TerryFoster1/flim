import { useEffect, useState } from "react";
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
    setIsMenuOpen(false);
    setIsNotificationsOpen(false);
    onNavigate(path);
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
            {isNotificationsOpen ? (
              <div className="notification-panel">
                <div className="notification-panel-header">
                  <div>
                    <h2>Activity</h2>
                  </div>
                  {unreadCount > 0 ? <button onClick={markAllRead} type="button">Mark all read</button> : null}
                </div>
                {notificationStatus ? <p className="notification-status">{notificationStatus}</p> : null}
                {notificationFeed.notifications.length === 0 ? (
                  <p className="notification-empty">No notifications yet.</p>
                ) : (
                  <div className="notification-list">
                    {notificationFeed.notifications.map((notification) => (
                      <button
                        className={notification.readAt ? "notification-item" : "notification-item is-unread"}
                        key={notification.id}
                        onClick={() => openNotification(notification)}
                        type="button"
                      >
                        <span>{notification.message}</span>
                        <small>{formatNotificationTime(notification.createdAt)}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
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
                <button onClick={() => navigate("/followed-titles")} type="button">My Followed Titles</button>
                <button onClick={() => navigate("/upcoming")} type="button">Upcoming Releases</button>
                <button onClick={() => navigate("/settings")} type="button">Settings</button>
                <button onClick={() => navigate("/settings")} type="button">Connect Plex</button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("/signin")} type="button">Sign In</button>
                <button onClick={() => navigate("/signup")} type="button">Create Account</button>
                <button onClick={() => navigate("/upcoming")} type="button">Upcoming Releases</button>
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
