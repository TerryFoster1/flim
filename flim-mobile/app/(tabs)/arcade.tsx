import { FlatList, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Header } from "@/components/Header";
import { ScoreCard } from "@/components/ScoreCard";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, spacing } from "@/theme/theme";

const modes = [
  { id: "trivia", title: "Movie Trivia", subtitle: "Browse title packs" },
  { id: "quote", title: "Quote Challenge", subtitle: "Match famous lines" },
  { id: "poster", title: "Movie Reveal", subtitle: "Guess from posters" },
  { id: "group", title: "Group Play", subtitle: "Movie night rooms" }
];

export default function ArcadeScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const featured = data?.[0];

  return (
    <Screen>
      <Header title="Flim Arcade" subtitle="Movie trivia, group challenges, and game-night experiences." />
      {loading ? <LoadingHero label="Loading Flim Arcade..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {featured ? (
        <View style={styles.section}>
          <Text style={styles.heading}>Featured Challenge</Text>
          <ChallengeCard challenge={featured} onPress={() => router.push("/home")} />
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.heading}>Play Something</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={modes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.modeRow}
          renderItem={({ item }) => (
            <View style={styles.modeCard}>
              <Text style={styles.modeIcon}>F</Text>
              <Text style={styles.modeTitle}>{item.title}</Text>
              <Text style={styles.modeSubtitle}>{item.subtitle}</Text>
            </View>
          )}
        />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Challenges</Text>
        {!loading && !data?.length ? <EmptyState title="No playable challenges found" body="Only complete challenge packs will appear here." /> : null}
        <View style={styles.challengeList}>
          {data?.slice(0, 8).map((challenge) => (
            <ChallengeCard key={challenge.id || challenge.slug || challenge.title} challenge={challenge} onPress={() => router.push("/home")} />
          ))}
        </View>
      </View>
      <View style={styles.progressRow}>
        <ScoreCard value="-" label="Tickets" />
        <ScoreCard value="-" label="Badges" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
    marginTop: spacing.lg
  },
  heading: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: "900"
  },
  modeRow: {
    gap: spacing.md,
    paddingRight: spacing.md
  },
  modeCard: {
    width: 138,
    minHeight: 154,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md
  },
  modeIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#160b02",
    backgroundColor: colors.gold,
    fontWeight: "900"
  },
  modeTitle: {
    color: colors.text,
    textAlign: "center",
    fontWeight: "900",
    fontSize: 15
  },
  modeSubtitle: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 12
  },
  challengeList: {
    gap: spacing.md
  },
  progressRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg
  }
});
