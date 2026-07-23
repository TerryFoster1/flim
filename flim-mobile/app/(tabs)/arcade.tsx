import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Header } from "@/components/Header";
import { ScoreCard } from "@/components/ScoreCard";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { backlotGameCatalog } from "@/games/backlot/registry";
import { getBacklotUnlockIds, unlockBacklotGame } from "@/games/backlot/unlocks";
import { RELIC_RUN_GAME_ID } from "@/games/relic-run/config";
import { useAsync } from "@/hooks/useAsync";
import { colors, spacing } from "@/theme/theme";

const modes = [
  { id: "trivia", title: "Movie Trivia", subtitle: "Browse title packs" },
  { id: "quote", title: "Quote Challenge", subtitle: "Match famous lines" },
  { id: "poster", title: "Movie Reveal", subtitle: "Guess from posters" },
  { id: "group", title: "Group Play", subtitle: "Movie night rooms" },
  { id: "triceratops", title: "Hidden Game Lab", subtitle: "TRICERATOPS!" }
];

export default function ArcadeScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const featured = data?.[0];
  const [unlockIds, setUnlockIds] = useState<string[]>([]);
  const [discoveryVisible, setDiscoveryVisible] = useState(false);
  const discoveryPulse = useRef(new Animated.Value(0)).current;
  const unlockedBacklotGames = useMemo(() => backlotGameCatalog.filter((game) => unlockIds.includes(game.gameId)), [unlockIds]);

  useEffect(() => {
    let isMounted = true;

    getBacklotUnlockIds()
      .then((storedUnlocks) => {
        if (isMounted) {
          setUnlockIds(storedUnlocks);
        }
      })
      .catch(() => {
        if (isMounted) {
          setUnlockIds([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!discoveryVisible) {
      discoveryPulse.stopAnimation();
      discoveryPulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(discoveryPulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(discoveryPulse, { toValue: 0, duration: 900, useNativeDriver: true })
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [discoveryPulse, discoveryVisible]);

  const handleEasterEggPress = async () => {
    const nextUnlockIds = await unlockBacklotGame(RELIC_RUN_GAME_ID);
    setUnlockIds(nextUnlockIds);
    setDiscoveryVisible(true);
  };

  const launchRelicRun = () => {
    setDiscoveryVisible(false);
    router.push("/games/relic-run");
  };

  return (
    <Screen>
      <Header title="Flim Arcade" subtitle="Movie trivia, group challenges, and game-night experiences." />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reveal hidden Backlot Arcade game"
        style={({ pressed }) => [styles.easterEgg, pressed && styles.easterEggPressed]}
        onPress={handleEasterEggPress}
      >
        <Ionicons name="film-outline" size={18} color={colors.gold} />
      </Pressable>
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
          renderItem={({ item }) => {
            const cardContent = (
              <>
                <Text style={styles.modeIcon}>F</Text>
                <Text style={styles.modeTitle}>{item.title}</Text>
                <Text style={styles.modeSubtitle}>{item.subtitle}</Text>
              </>
            );

            if (item.id === "triceratops") {
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.subtitle} hidden game prototype`}
                  style={({ pressed }) => [styles.modeCard, pressed && styles.pressedCard]}
                  onPress={() => router.push("/games/triceratops")}
                >
                  {cardContent}
                </Pressable>
              );
            }

            return <View style={styles.modeCard}>{cardContent}</View>;
          }}
        />
      </View>
      {unlockedBacklotGames.length ? (
        <View style={styles.section}>
          <Text style={styles.heading}>Backlot Arcade</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={unlockedBacklotGames}
            keyExtractor={(item) => item.gameId}
            contentContainerStyle={styles.modeRow}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Launch ${item.title}`}
                style={({ pressed }) => [styles.backlotCard, pressed && styles.pressedCard]}
                onPress={() => router.push(item.route)}
              >
                <Ionicons name="ticket-outline" size={34} color={colors.gold} />
                <Text style={styles.modeTitle}>{item.title}</Text>
                <Text style={styles.modeSubtitle}>{item.subtitle}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}
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
      <Modal transparent visible={discoveryVisible} animationType="fade" onRequestClose={() => setDiscoveryVisible(false)}>
        <View style={styles.discoveryBackdrop}>
          <Animated.View
            style={[
              styles.discoveryCard,
              {
                transform: [
                  {
                    scale: discoveryPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.03]
                    })
                  }
                ]
              }
            ]}
          >
            <View style={styles.discoveryIcon}>
              <Ionicons name="sparkles-outline" size={36} color={colors.gold} />
            </View>
            <Text style={styles.discoveryKicker}>You found something hidden...</Text>
            <Text style={styles.discoveryTitle}>Relic Run</Text>
            <Text style={styles.discoveryBody}>Relic Run has been added to Backlot Arcade.</Text>
            <Pressable accessibilityRole="button" style={styles.discoveryPrimary} onPress={launchRelicRun}>
              <Text style={styles.discoveryPrimaryText}>Launch now</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.discoverySecondary} onPress={() => setDiscoveryVisible(false)}>
              <Text style={styles.discoverySecondaryText}>Back to Arcade</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
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
  easterEgg: {
    alignSelf: "flex-end",
    marginTop: -spacing.sm,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    alignItems: "center",
    justifyContent: "center"
  },
  easterEggPressed: {
    transform: [{ scale: 0.96 }]
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
  backlotCard: {
    width: 172,
    minHeight: 142,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: colors.panelSoft,
    padding: spacing.md
  },
  pressedCard: {
    transform: [{ scale: 0.98 }]
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
  },
  discoveryBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.78)",
    padding: spacing.xl
  },
  discoveryCard: {
    width: "100%",
    maxWidth: 380,
    alignItems: "center",
    borderRadius: 28,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "#18100d",
    padding: spacing.xl,
    gap: spacing.md
  },
  discoveryIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,190,97,0.14)"
  },
  discoveryKicker: {
    color: colors.gold,
    fontSize: 14,
    fontWeight: "900",
    textAlign: "center"
  },
  discoveryTitle: {
    color: colors.text,
    fontSize: 32,
    fontWeight: "900",
    textAlign: "center"
  },
  discoveryBody: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center"
  },
  discoveryPrimary: {
    width: "100%",
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: colors.gold,
    marginTop: spacing.sm
  },
  discoveryPrimaryText: {
    color: "#160b02",
    fontWeight: "900",
    fontSize: 16
  },
  discoverySecondary: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  discoverySecondaryText: {
    color: colors.text,
    fontWeight: "800"
  }
});
