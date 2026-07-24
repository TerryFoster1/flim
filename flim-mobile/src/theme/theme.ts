import { Platform } from "react-native";

export const colors = {
  background: "#050407",
  backgroundLift: "#0b090b",
  panel: "#111014",
  panelDeep: "rgba(9, 10, 14, 0.92)",
  panelSoft: "rgba(255,255,255,0.06)",
  border: "rgba(245, 193, 111, 0.22)",
  borderStrong: "rgba(245, 193, 111, 0.45)",
  text: "#fff7e8",
  cream: "#fff1d1",
  muted: "#b8b1a8",
  mutedStrong: "#d1c7b9",
  gold: "#f5c16f",
  goldSoft: "#ffd995",
  goldDeep: "#b77a2c",
  coral: "#ff5b6e",
  green: "#2ac481",
  danger: "#ff6b6b"
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32
};

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 28,
  pill: 999
};

export const typography = {
  serif: Platform.select({ ios: "Georgia", android: "serif", default: "serif" }),
  heroSize: 52,
  titleSize: 34,
  sectionSize: 22
};

export const shadows = {
  panel: {
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  goldGlow: {
    shadowColor: "#f5c16f",
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7
  }
};
