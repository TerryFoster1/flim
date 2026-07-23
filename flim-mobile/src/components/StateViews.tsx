import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@/theme/theme";

export function LoadingHero({ label = "Loading Flim..." }: { label?: string }) {
  return (
    <View style={styles.panel}>
      <ActivityIndicator color={colors.gold} />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.text}>{body}</Text> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Something went sideways.</Text>
      <Text style={styles.text}>{message}</Text>
      {onRetry ? <Text onPress={onRetry} style={styles.retry}>Try again</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  title: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18
  },
  text: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 21
  },
  retry: {
    color: colors.gold,
    fontWeight: "800",
    marginTop: spacing.xs
  }
});
