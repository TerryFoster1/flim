interface TapToSpinPosterProps {
  empty?: boolean;
}

interface VintageCountdownProps {
  value: number;
}

export function FilmReelIcon() {
  return (
    <svg className="film-reel-action-svg" viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <linearGradient id="filmReelActionGradient" x1="10" y1="8" x2="70" y2="72">
          <stop stopColor="#ff4f6d" />
          <stop offset="0.55" stopColor="#ffb84d" />
          <stop offset="1" stopColor="#ffe760" />
        </linearGradient>
      </defs>
      <circle cx="38" cy="38" r="29" fill="url(#filmReelActionGradient)" />
      <circle cx="38" cy="38" r="12" fill="#08090d" opacity=".9" />
      <circle cx="38" cy="16" r="6" fill="#08090d" />
      <circle cx="60" cy="38" r="6" fill="#08090d" />
      <circle cx="38" cy="60" r="6" fill="#08090d" />
      <circle cx="16" cy="38" r="6" fill="#08090d" />
      <circle cx="38" cy="38" r="4" fill="#fff7df" />
      <path d="M55 58 C63 62 70 61 76 55 L76 72 C65 77 54 75 46 68 Z" fill="#08090d" opacity=".88" />
      <rect x="59" y="60" width="5" height="5" rx="1.2" fill="#ffb84d" />
      <rect x="67" y="60" width="5" height="5" rx="1.2" fill="#ffe760" />
      <rect x="61" y="68" width="5" height="5" rx="1.2" fill="#ff7a45" />
    </svg>
  );
}

export function TapToSpinPoster({ empty = false }: TapToSpinPosterProps) {
  return (
    <svg className="tap-to-spin-poster-svg" viewBox="0 0 360 540" aria-hidden="true">
      <defs>
        <radialGradient id="tapPosterGlow" cx="50%" cy="28%" r="70%">
          <stop stopColor="#ffe760" stopOpacity=".48" />
          <stop offset=".44" stopColor="#ffb84d" stopOpacity=".18" />
          <stop offset="1" stopColor="#08090d" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tapPosterGradient" x1="40" y1="36" x2="318" y2="500">
          <stop stopColor="#2a0d13" />
          <stop offset=".5" stopColor="#090a0f" />
          <stop offset="1" stopColor="#26100c" />
        </linearGradient>
      </defs>
      <rect width="360" height="540" rx="30" fill="url(#tapPosterGradient)" />
      <rect x="24" y="24" width="312" height="492" rx="22" fill="none" stroke="#ffb84d" strokeOpacity=".38" strokeWidth="2" />
      <circle cx="180" cy="200" r="150" fill="url(#tapPosterGlow)" />
      <g transform="translate(124 116)">
        <circle cx="56" cy="56" r="50" fill="url(#filmReelActionGradient)" />
        <circle cx="56" cy="56" r="21" fill="#08090d" opacity=".9" />
        <circle cx="56" cy="19" r="9" fill="#08090d" />
        <circle cx="93" cy="56" r="9" fill="#08090d" />
        <circle cx="56" cy="93" r="9" fill="#08090d" />
        <circle cx="19" cy="56" r="9" fill="#08090d" />
      </g>
      <text x="180" y="306" textAnchor="middle" fill="#ffcf77" fontSize="24" fontWeight="900" letterSpacing="4">NOW PLAYING</text>
      <text x="180" y="365" textAnchor="middle" fill="#fff7df" fontSize={empty ? "34" : "42"} fontWeight="950">{empty ? "NO MOVIES" : "TAP TO SPIN"}</text>
      <text x="180" y="408" textAnchor="middle" fill="#ffe7b8" fontSize="20" fontWeight="800">{empty ? "LOADED" : "MOVIE NIGHT ROULETTE"}</text>
      <path d="M70 456 H290" stroke="#ffb84d" strokeOpacity=".42" strokeWidth="2" />
    </svg>
  );
}

export function VintageCountdown({ value }: VintageCountdownProps) {
  return (
    <svg className="vintage-countdown-svg" viewBox="0 0 360 540" aria-hidden="true">
      <rect width="360" height="540" rx="26" fill="#09090c" opacity=".9" />
      <circle cx="180" cy="270" r="128" fill="none" stroke="#fff1c4" strokeOpacity=".24" strokeWidth="3" />
      <circle cx="180" cy="270" r="86" fill="none" stroke="#fff1c4" strokeOpacity=".18" strokeWidth="2" />
      <path d="M180 62 V478 M42 270 H318" stroke="#fff1c4" strokeOpacity=".18" strokeWidth="2" />
      <text x="180" y="326" textAnchor="middle" fill="#fff1c4" fontSize="172" fontWeight="900" fontFamily="Georgia, serif">{value}</text>
    </svg>
  );
}
