import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams } from "expo-router";
import { challengeQuestions } from "@/arcade/seededGames";
import { SeededChoiceGame } from "@/arcade/SeededChoiceGame";
import { flimApi } from "@/api/flimApi";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, spacing } from "@/theme/theme";

export default function ChallengeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [started, setStarted] = useState(false);
  const { data, loading, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const challenge = useMemo(() => {
    const key = String(id || "").toLowerCase();
    return (data || []).find((item) => [item.id, item.slug, item.title, item.name].some((value) => String(value || "").toLowerCase() === key));
  }, [data, id]);

  if (started && challenge) {
    return (
      <SeededChoiceGame
        title={challenge.title || challenge.name || "Challenge"}
        subtitle="Arcade challenge round"
        questions={challengeQuestions}
      />
    );
  }

  return (
    <Screen>
      <Header title="Challenge" subtitle="Arcade competition" />
      {loading ? <LoadingHero label="Loading challenge..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && !challenge ? <EmptyState title="Challenge not found" body="Choose another playable challenge from Flim Arcade." /> : null}
      {challenge ? (
        <Pressable style={styles.card}>
          {challenge.artwork || challenge.imageUrl ? (
            <Image source={{ uri: challenge.artwork || challenge.imageUrl }} style={styles.image} contentFit="cover" />
          ) : null}
          <View style={styles.body}>
            <Text style={styles.title}>{challenge.title || challenge.name}</Text>
            <Text style={styles.copy}>{challenge.description || "Play a themed Flim Arcade challenge."}</Text>
            <Text style={styles.meta}>{challenge.questionCount || challengeQuestions.length} questions</Text>
            <PrimaryButton label="Start Challenge" onPress={() => setStarted(true)} />
          </View>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: "hidden",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  image: {
    height: 190,
    width: "100%"
  },
  body: {
    gap: spacing.sm,
    padding: spacing.lg
  },
  title: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    lineHeight: 22
  },
  meta: {
    color: colors.gold,
    fontWeight: "900"
  }
});
