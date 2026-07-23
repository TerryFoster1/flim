import { Image, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/theme/theme";

export function Header({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} />
        <Text style={styles.brand}>Flim</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 8
  },
  brand: {
    color: colors.gold,
    fontSize: 30,
    fontWeight: "800",
    fontStyle: "italic"
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23
  }
});
