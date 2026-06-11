export interface SeasonalThemeConfig {
  id: string;
  name: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  priority: number;
  themeClass: string;
  bannerText: string;
  accentAssets: string[];
  activeChallengeId?: string;
}

export interface SeasonalThemeOverride {
  mode: "auto" | "disabled" | "force" | "preview";
  themeId?: string;
  priority?: number;
}

export type ActiveSeasonalTheme = SeasonalThemeConfig & {
  isPreview?: boolean;
};

export const seasonalThemeConfigs: SeasonalThemeConfig[] = [
  {
    id: "summer_blockbusters",
    name: "Summer Blockbusters",
    startMonth: 6,
    startDay: 1,
    endMonth: 8,
    endDay: 31,
    priority: 30,
    themeClass: "seasonal-theme-summer",
    bannerText: "Summer Blockbuster Challenge is live.",
    accentAssets: ["sunset-glow", "ticket-stub"],
    activeChallengeId: "summer-blockbuster-2026",
  },
  {
    id: "spooky_season",
    name: "Spooky Season",
    startMonth: 9,
    startDay: 15,
    endMonth: 9,
    endDay: 30,
    priority: 35,
    themeClass: "seasonal-theme-spooky",
    bannerText: "Spooky Season is warming up.",
    accentAssets: ["shadow-vignette", "orange-glow"],
    activeChallengeId: "halloween-horror-2026",
  },
  {
    id: "halloween",
    name: "Halloween",
    startMonth: 10,
    startDay: 1,
    endMonth: 10,
    endDay: 31,
    priority: 60,
    themeClass: "seasonal-theme-halloween",
    bannerText: "Halloween Horror Challenge is live.",
    accentAssets: ["shadow-vignette", "ember-glow"],
    activeChallengeId: "halloween-horror-2026",
  },
  {
    id: "holidays",
    name: "Holidays",
    startMonth: 12,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    priority: 55,
    themeClass: "seasonal-theme-holidays",
    bannerText: "Holiday movie season is here.",
    accentAssets: ["warm-lights", "soft-snow"],
    activeChallengeId: "christmas-movie-2026",
  },
  {
    id: "new_year",
    name: "New Year",
    startMonth: 1,
    startDay: 1,
    endMonth: 1,
    endDay: 7,
    priority: 45,
    themeClass: "seasonal-theme-new-year",
    bannerText: "Start the year with a fresh watchlist.",
    accentAssets: ["gold-spark", "midnight-glow"],
  },
  {
    id: "valentines",
    name: "Valentine's Day",
    startMonth: 2,
    startDay: 7,
    endMonth: 2,
    endDay: 14,
    priority: 40,
    themeClass: "seasonal-theme-valentines",
    bannerText: "Date-night picks are in season.",
    accentAssets: ["rose-glow", "soft-spotlight"],
  },
  {
    id: "oscars",
    name: "Oscar Season",
    startMonth: 2,
    startDay: 1,
    endMonth: 3,
    endDay: 15,
    priority: 38,
    themeClass: "seasonal-theme-oscars",
    bannerText: "Oscar season picks are ready.",
    accentAssets: ["award-gold", "stage-light"],
    activeChallengeId: "oscar-challenge-2026",
  },
  {
    id: "sci_fi_summer",
    name: "Sci-Fi Summer",
    startMonth: 7,
    startDay: 1,
    endMonth: 7,
    endDay: 31,
    priority: 42,
    themeClass: "seasonal-theme-sci-fi",
    bannerText: "Sci-Fi Summer is in orbit.",
    accentAssets: ["cool-neon", "starfield"],
  },
  {
    id: "back_to_school",
    name: "Back to School",
    startMonth: 8,
    startDay: 15,
    endMonth: 9,
    endDay: 10,
    priority: 25,
    themeClass: "seasonal-theme-back-to-school",
    bannerText: "Back-to-school comfort picks are ready.",
    accentAssets: ["campus-warmth", "notebook-gold"],
  },
];

export const seasonalThemeOverrideStorageKey = "flim-seasonal-theme-override";

function dayNumber(year: number, month: number, day: number) {
  return new Date(year, month - 1, day).getTime();
}

export function isThemeActiveOnDate(theme: SeasonalThemeConfig, date: Date) {
  const year = date.getFullYear();
  const current = new Date(year, date.getMonth(), date.getDate()).getTime();
  const start = dayNumber(year, theme.startMonth, theme.startDay);
  const end = dayNumber(year, theme.endMonth, theme.endDay);

  if (start <= end) return current >= start && current <= end;

  return current >= start || current <= end;
}

export function parseSeasonalThemeOverride(raw?: string | null): SeasonalThemeOverride | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SeasonalThemeOverride>;
    if (parsed.mode === "disabled") return { mode: "disabled" };
    if ((parsed.mode === "force" || parsed.mode === "preview") && parsed.themeId) {
      return {
        mode: parsed.mode,
        themeId: parsed.themeId,
        priority: typeof parsed.priority === "number" ? parsed.priority : undefined,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveSeasonalTheme(date = new Date(), override?: SeasonalThemeOverride | null): ActiveSeasonalTheme | null {
  if (override?.mode === "disabled") return null;

  if ((override?.mode === "force" || override?.mode === "preview") && override.themeId) {
    const forced = seasonalThemeConfigs.find((theme) => theme.id === override.themeId);
    if (forced) {
      return {
        ...forced,
        priority: override.priority ?? forced.priority,
        isPreview: override.mode === "preview",
      };
    }
  }

  return seasonalThemeConfigs
    .filter((theme) => isThemeActiveOnDate(theme, date))
    .sort((a, b) => b.priority - a.priority)[0] || null;
}

export function getSeasonalThemeOverrideFromRuntime(): SeasonalThemeOverride | null {
  if (typeof window === "undefined") return null;

  const params = new URLSearchParams(window.location.search);
  const previewTheme = params.get("theme") || params.get("seasonalTheme");
  if (previewTheme === "default" || previewTheme === "off") return { mode: "disabled" };
  if (previewTheme) return { mode: "preview", themeId: previewTheme };

  return parseSeasonalThemeOverride(window.localStorage.getItem(seasonalThemeOverrideStorageKey));
}

export function getActiveSeasonalTheme(date = new Date()) {
  return resolveSeasonalTheme(date, getSeasonalThemeOverrideFromRuntime());
}
