import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { movieTriviaPacks } from "@/arcade/seededGames";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { colors, radii, spacing } from "@/theme/theme";

export default function MovieTriviaPacksScreen() {
  return (
    <Screen>
      <Header title="Movie Trivia" subtitle="Choose a title pack to play." />
      <View style={styles.list}>
        {movieTriviaPacks.map((pack) => (
          <Pressable
            key={pack.id}
            accessibilityRole="button"
            onPress={() => router.push(`/trivia/${pack.mediaType}/${pack.tmdbId}`)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <Text style={styles.title}>{pack.title}</Text>
            <Text style={styles.subtitle}>{pack.subtitle}</Text>
            <Text style={styles.meta}>{pack.questionCount} questions</Text>
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
    fontSize: 22,
    fontWeight: "900"
  },
  subtitle: {
    color: colors.muted,
    lineHeight: 21
  },
  meta: {
    color: colors.gold,
    fontWeight: "900"
  },
  pressed: {
    opacity: 0.82
  }
});
