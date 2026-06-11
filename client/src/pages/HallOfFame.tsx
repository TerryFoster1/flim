import { useEffect, useMemo, useState } from "react";
import { getHallOfFame } from "../services/hallOfFameService";
import type { HallOfFameCategory, HallOfFameEntry, HallOfFameFeed, HallOfFameWindow } from "../types";

const windows: Array<{ id: HallOfFameWindow; label: string }> = [
  { id: "all_time", label: "All Time" },
  { id: "year", label: "This Year" },
  { id: "month", label: "This Month" },
  { id: "week", label: "This Week" },
];

function formatScore(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "F";
}

function LeaderboardEntryCard({ entry, unit, onNavigate }: { entry: HallOfFameEntry; unit: string; onNavigate: (path: string) => void }) {
  return (
    <button className={`hall-entry-card rank-${entry.rank}`} onClick={() => entry.handle && onNavigate(`/@${entry.handle}`)} type="button">
      <span className="hall-rank">#{entry.rank}</span>
      {entry.profileImageUrl ? (
        <img className="hall-avatar" alt={`${entry.displayName} profile`} src={entry.profileImageUrl} />
      ) : (
        <span className="hall-avatar hall-avatar-fallback" aria-hidden="true">{initials(entry.displayName)}</span>
      )}
      <span className="hall-entry-copy">
        <strong>{entry.displayName}</strong>
        {entry.handle ? <small>@{entry.handle}</small> : <small>Flim curator</small>}
        {entry.topBadge ? <em>{entry.topBadge.name}</em> : <em>{entry.badgeCount} badges</em>}
      </span>
      <span className="hall-score">
        <strong>{formatScore(entry.score)}</strong>
        <small>{unit}</small>
      </span>
    </button>
  );
}

function SpotlightPodium({ entries, unit, onNavigate }: { entries: HallOfFameEntry[]; unit: string; onNavigate: (path: string) => void }) {
  if (entries.length === 0) return null;
  return (
    <div className="hall-podium" aria-label="Top ranked users">
      {entries.slice(0, 3).map((entry) => (
        <button className={`hall-podium-card rank-${entry.rank}`} key={entry.userId} onClick={() => entry.handle && onNavigate(`/@${entry.handle}`)} type="button">
          <span>#{entry.rank}</span>
          {entry.profileImageUrl ? <img alt="" src={entry.profileImageUrl} /> : <strong>{initials(entry.displayName)}</strong>}
          <h3>{entry.displayName}</h3>
          <p>{formatScore(entry.score)} {unit}</p>
          {entry.topBadge ? <small>{entry.topBadge.name}</small> : null}
        </button>
      ))}
    </div>
  );
}

export function HallOfFame({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [window, setWindow] = useState<HallOfFameWindow>("all_time");
  const [feed, setFeed] = useState<HallOfFameFeed | null>(null);
  const [activeCategory, setActiveCategory] = useState("achievement_points");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    getHallOfFame(window)
      .then((result) => {
        if (!active) return;
        setFeed(result);
        if (!result.leaderboards[activeCategory]) {
          setActiveCategory(result.categories[0]?.id || "achievement_points");
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [window]);

  const groupedCategories = useMemo(() => {
    const categories = feed?.categories || [];
    return {
      prestige: categories.filter((category) => category.group === "prestige"),
      watching: categories.filter((category) => category.group === "watching"),
      curators: categories.filter((category) => category.group === "curators"),
    };
  }, [feed]);
  const activeLeaderboard = feed?.leaderboards[activeCategory];
  const entries = activeLeaderboard?.entries || [];

  return (
    <section className="route-page hall-of-fame-page">
      <div className="hall-hero">
        <div>
          <span className="hall-kicker">Hall of Fame</span>
          <h1>Top Flim Fans</h1>
          <p>Achievements, collections, challenges, trivia, watch progress, and public playlists now feed into one prestige hub.</p>
        </div>
        <button className="secondary-button" onClick={() => onNavigate("/challenges")} type="button">
          Find Challenges
        </button>
      </div>

      <div className="hall-window-tabs" role="tablist" aria-label="Hall of Fame time window">
        {windows.map((item) => (
          <button className={window === item.id ? "is-active" : ""} key={item.id} onClick={() => setWindow(item.id)} type="button">
            {item.label}
          </button>
        ))}
      </div>

      <div className="hall-category-groups">
        {Object.entries(groupedCategories).map(([group, categories]) => categories.length > 0 ? (
          <section className="hall-category-group" key={group}>
            <h2>{group === "prestige" ? "Prestige" : group === "watching" ? "Watching" : "Curators"}</h2>
            <div className="hall-category-chips">
              {(categories as HallOfFameCategory[]).map((category) => (
                <button className={activeCategory === category.id ? "is-active" : ""} key={category.id} onClick={() => setActiveCategory(category.id)} type="button">
                  {category.title}
                </button>
              ))}
            </div>
          </section>
        ) : null)}
      </div>

      {status === "loading" ? <p className="empty-state">Loading Hall of Fame...</p> : null}
      {status === "error" ? <p className="error-message">Hall of Fame is unavailable right now.</p> : null}

      {status === "ready" && activeLeaderboard ? (
        <section className="hall-board">
          <div className="hall-board-heading">
            <div>
              <h2>{activeLeaderboard.title}</h2>
              <p>{activeLeaderboard.description}</p>
            </div>
            <small>{window === "all_time" ? "All-time rankings" : `Window starts ${feed?.windowStart ? new Date(feed.windowStart).toLocaleDateString() : ""}`}</small>
          </div>
          <SpotlightPodium entries={entries} unit={activeLeaderboard.unit} onNavigate={onNavigate} />
          <div className="hall-entry-list">
            {entries.length > 0 ? entries.map((entry) => (
              <LeaderboardEntryCard entry={entry} key={entry.userId} unit={activeLeaderboard.unit} onNavigate={onNavigate} />
            )) : <p className="empty-state">No ranked users for this board yet.</p>}
          </div>
        </section>
      ) : null}
    </section>
  );
}
