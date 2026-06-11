interface TriviaGamesProps {
  onNavigate: (path: string) => void;
}

const futureSurfaces = [
  "Title trivia",
  "Playlist trivia",
  "Genre challenges",
  "Director's Cut challenges",
  "Seasonal challenges",
  "Sponsored challenges",
];

export function TriviaGames({ onNavigate }: TriviaGamesProps) {
  return (
    <section className="route-page trivia-games-page">
      <div className="detail-copy">
        <h1>Trivia & Games</h1>
        <p>
          Movie trivia, title challenges, and playlist games will live here once the feature flag is enabled.
        </p>
      </div>

      <div className="media-extension-card">
        <h3>Coming Soon</h3>
        <p>
          This page is reserved for Flim's future game and challenge experiences. Nothing here is promoted on the
          homepage, and no public challenges are launched by this route.
        </p>
        <div className="challenge-requirement-row" aria-label="Prepared game types">
          {futureSurfaces.map((surface) => (
            <span key={surface}>{surface}</span>
          ))}
        </div>
        <button className="secondary-button" onClick={() => onNavigate("/playlists")} type="button">
          Back to Playlists
        </button>
      </div>
    </section>
  );
}
