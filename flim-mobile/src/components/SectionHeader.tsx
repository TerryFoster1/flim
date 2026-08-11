import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/theme/theme";

interface SectionHeaderProps {
  title: string;
  action?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function SectionHeader({ title, action, actionLabel, onAction }: SectionHeaderProps) {
  const label = actionLabel || action;

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {label ? (
        <Pressable disabled={!onAction} onPress={onAction} hitSlop={10}>
          <Text style={styles.action}>{label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  title: {
    color: colors.goldSoft,
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 1.8,
    textTransform: "uppercase"
  },
  action: {
    color: colors.mutedStrong,
    fontWeight: "800"
  }
});
