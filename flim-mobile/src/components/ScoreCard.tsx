import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/theme/theme";

export function ScoreCard({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 94,
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  value: {
    color: colors.text,
    fontSize: 26,
    fontWeight: "900"
  },
  label: {
    color: colors.muted,
    fontSize: 13
  }
});
