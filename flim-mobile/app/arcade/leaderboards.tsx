import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { resolveChallengeRoute } from "@/arcade/modeRoutes";
import { flimApi } from "@/api/flimApi";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, spacing } from "@/theme/theme";

export default function LeaderboardsScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const challenges = useMemo(() => (data || []).slice(0, 12), [data]);

  return (
    <Screen>
      <Header title="Leaderboards" subtitle="Choose a challenge to see standings." />
      {loading ? <LoadingHero label="Loading leaderboards..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && !challenges.length ? <EmptyState title="No leaderboards yet" body="Challenge standings will appear after playable challenges have scores." /> : null}
      <View style={styles.list}>
        {challenges.map((challenge) => (
          <Pressable key={challenge.id} onPress={() => router.push(resolveChallengeRoute(challenge))} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <Text style={styles.title}>{challenge.title || challenge.name || "Challenge"}</Text>
            <Text style={styles.copy}>{challenge.questionCount || 25} questions</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md
  },
  card: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  title: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted
  },
  pressed: {
    opacity: 0.82
  }
});
