import { Pressable, StyleSheet, Text, View } from "react-native";
import { ImageBackground } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { resolveChallengeRoute } from "@/arcade/modeRoutes";
import { flimImages } from "@/assets/flimAssets";
import { Header } from "@/components/Header";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, shadows, spacing, typography } from "@/theme/theme";

export default function GroupPlayScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const challenges = (data || []).filter((challenge) => (challenge.questionCount || 0) >= 20).slice(0, 8);

  return (
    <Screen padded={false}>
      <Header />
      <ImageBackground source={flimImages.arcadeHero} style={styles.hero} imageStyle={styles.heroImage}>
        <View style={styles.scrim} />
        <View style={styles.heroCopy}>
          <Text style={styles.title}>Group Play</Text>
          <Text style={styles.subtitle}>Choose a challenge, invite friends, and start movie night from the room screen.</Text>
        </View>
      </ImageBackground>
      <View style={styles.content}>
        <SectionHeader title="Choose A Group Challenge" />
        {loading ? <LoadingHero label="Loading group challenges..." /> : null}
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !challenges.length ? <EmptyState title="No group challenges ready" body="Playable group challenges will appear here when staging has challenge data." /> : null}
        <View style={styles.list}>
          {challenges.map((challenge) => (
            <Pressable
              key={challenge.id}
              accessibilityRole="button"
              onPress={() => router.push(resolveChallengeRoute(challenge) as never)}
              style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            >
              <View>
                <Text style={styles.cardTitle}>{challenge.title || challenge.name || "Arcade Challenge"}</Text>
                <Text numberOfLines={2} style={styles.cardCopy}>{challenge.description || "Play the same movie challenge with friends."}</Text>
                <Text style={styles.meta}>{challenge.questionCount || 25} questions</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={colors.gold} />
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 360,
    justifyContent: "flex-end"
  },
  heroImage: {
    opacity: 0.75
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)"
  },
  heroCopy: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: 120
  },
  title: {
    color: colors.cream,
    fontFamily: typography.serif,
    fontSize: 46,
    lineHeight: 50,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.text,
    fontSize: 17,
    lineHeight: 25
  },
  content: {
    gap: spacing.md,
    padding: spacing.md,
    paddingBottom: 136
  },
  list: {
    gap: spacing.md
  },
  card: {
    minHeight: 116,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    ...shadows.panel
  },
  cardTitle: {
    color: colors.cream,
    fontSize: 21,
    fontWeight: "900"
  },
  cardCopy: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: 5
  },
  meta: {
    color: colors.gold,
    fontWeight: "900",
    marginTop: 8
  },
  pressed: {
    opacity: 0.82
  }
});
