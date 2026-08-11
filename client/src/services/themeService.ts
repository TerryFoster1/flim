import type { ThemePreference } from "../types";

export const themePreferenceStorageKey = "flim-theme-preference";

const allowedThemePreferences = new Set<ThemePreference>(["dark", "light", "system"]);

export function normalizeThemePreference(value: unknown): ThemePreference {
  return typeof value === "string" && allowedThemePreferences.has(value as ThemePreference)
    ? (value as ThemePreference)
    : "dark";
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  return normalizeThemePreference(window.localStorage.getItem(themePreferenceStorageKey));
}

export function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function resolveThemePreference(preference: ThemePreference): "dark" | "light" {
  return preference === "system" ? getSystemTheme() : preference;
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === "undefined") return;
  const normalizedPreference = normalizeThemePreference(preference);
  const resolvedTheme = resolveThemePreference(normalizedPreference);
  const root = document.documentElement;

  root.dataset.themePreference = normalizedPreference;
  root.dataset.theme = resolvedTheme;
  root.style.colorScheme = resolvedTheme;
}

export function storeThemePreference(preference: ThemePreference) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(themePreferenceStorageKey, normalizeThemePreference(preference));
}
