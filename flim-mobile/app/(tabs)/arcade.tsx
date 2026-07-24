import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { BacklotDiscovery, BacklotGame, BacklotState } from "@/api/types";
import { flimApi } from "@/api/flimApi";
import { resolveChallengeRoute, visibleArcadeModes } from "@/arcade/modeRoutes";
import { ChallengeCard } from "@/components/ChallengeCard";
import { Header } from "@/components/Header";
import { ScoreCard } from "@/components/ScoreCard";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import {
  backlotGamesById,
  isDinosaurChallenge,
  relicRunDiscoverySource,
  triceratopsDinosaurDiscoverySource
} from "@/games/backlot/registry";
import { discoverBacklotGame, getBacklotStateCache, reconcileBacklotState } from "@/games/backlot/unlocks";
import { useAsync } from "@/hooks/useAsync";
import { colors, spacing } from "@/theme/theme";

function emptyBacklotState(): BacklotState {
  return {
    unlockIds: [],
    discoveries: [],
    games: [],
    progress: {
      discoveredCount: 0,
      secretsRemainingLabel: "??"
    }
  };
}

function formatShortDate(value?: string | null) {
  if (!value) return "Not played yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not played yet";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatPlayTime(ms?: number) {
  const seconds = Math.max(0, Math.round((ms || 0) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function ArcadeScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const featured = data?.[0];
  const [backlotState, setBacklotState] = useState<BacklotState>(emptyBacklotState);
  const [discoveredGame, setDiscoveredGame] = useState<BacklotGame | null>(null);
  const [discoveryVisible, setDiscoveryVisible] = useState(false);
  const discoveryPulse = useRef(new Animated.Value(0)).current;
  const unlockedBacklotGames = useMemo(() => {
    return backlotState.games.filter((game) => backlotState.unlockIds.includes(game.id));
  }, [backlotState.games, backlotState.unlockIds]);

  useEffect(() => {
    let isMounted = true;

    getBacklotStateCache()
      .then((cachedState) => {
        if (isMounted) setBacklotState(cachedState);
      })
      .catch(() => undefined);

    reconcileBacklotState()
      .then((state) => {
        if (isMounted) setBacklotState(state);
      })
      .catch(() => undefined);

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

  async function handleDiscovery(source: typeof relicRunDiscoverySource | typeof triceratopsDinosaurDiscoverySource) {
    const result = await discoverBacklotGame(source);
    setBacklotState(result.state);
    const serverGame = result.state.games.find((game) => game.id === source.gameId);
    const fallbackGame = backlotGamesById.get(source.gameId);
    const game = serverGame || (fallbackGame ? {
      id: fallbackGame.gameId,
      title: fallbackGame.title,
      description: fallbackGame.description,
      route: fallbackGame.route,
      difficulty: fallbackGame.difficulty,
      estimatedPlayTimeMinutes: fallbackGame.estimatedPlayTimeMinutes,
      genre: fallbackGame.genre,
      rewardId: fallbackGame.rewardId,
      achievementSetId: fallbackGame.achievementSetId
    } : null);
    if (game) setDiscoveredGame(game);
    setDiscoveryVisible(true);
  }

  function launchDiscoveredGame() {
    if (!discoveredGame?.route) return setDiscoveryVisible(false);
    setDiscoveryVisible(false);
    router.push(discoveredGame.route as never);
  }

  function renderDiscoveryHotspot(onPress: () => void, label: string) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.discoveryHotspot, pressed && styles.discoveryHotspotPressed]}
        onPress={onPress}
      >
        <Ionicons name="sparkles-outline" size={18} color={colors.gold} />
      </Pressable>
    );
  }

  function renderHistoryRow(discovery: BacklotDiscovery) {
    return (
      <View key={`${discovery.gameId}-${discovery.discoveredAt}`} style={styles.historyRow}>
        <View style={styles.historyIcon}>
          <Ionicons name="ticket-outline" size={18} color={colors.gold} />
        </View>
        <View style={styles.historyCopy}>
          <Text style={styles.historyTitle}>{discovery.gameTitle}</Text>
          <Text style={styles.historyMeta}>
            {discovery.sourceTitle || "Backlot discovery"} - {formatShortDate(discovery.discoveredAt)}
          </Text>
          <Text style={styles.historyMeta}>
            First played: {formatShortDate(discovery.firstPlayedAt)} - Total play: {formatPlayTime(discovery.totalPlayTimeMs)}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <Screen>
      <Header title="Flim Arcade" subtitle="Movie trivia, group challenges, and game-night experiences." />
      {loading ? <LoadingHero label="Loading Flim Arcade..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {featured ? (
        <View style={styles.section}>
          <Text style={styles.heading}>Featured Challenge</Text>
          <ChallengeCard challenge={featured} onPress={() => router.push(resolveChallengeRoute(featured) as never)} />
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.heading}>Play Something</Text>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={visibleArcadeModes}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.modeRow}
          renderItem={({ item }) => {
            const card = (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                style={({ pressed }) => [styles.modeCard, pressed && styles.pressedCard]}
                onPress={() => router.push(item.route as never)}
              >
                <Ionicons name={item.icon as keyof typeof Ionicons.glyphMap} size={38} color={colors.gold} />
                <Text style={styles.modeTitle}>{item.title}</Text>
                <Text style={styles.modeSubtitle}>{item.subtitle}</Text>
                {item.id === "poster" ? renderDiscoveryHotspot(() => handleDiscovery(relicRunDiscoverySource), "Discover hidden Movie Reveal Backlot game") : null}
              </Pressable>
            );

            return card;
          }}
        />
      </View>
      {unlockedBacklotGames.length ? (
        <View style={styles.section}>
          <View style={styles.backlotHeader}>
            <View>
              <Text style={styles.heading}>Backlot Arcade</Text>
              <Text style={styles.backlotProgress}>
                Discovered: {backlotState.progress.discoveredCount} - Secrets Remaining: {backlotState.progress.secretsRemainingLabel}
              </Text>
            </View>
            <Ionicons name="film-outline" size={24} color={colors.gold} />
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={unlockedBacklotGames}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modeRow}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Launch ${item.title}`}
                style={({ pressed }) => [styles.backlotCard, pressed && styles.pressedCard]}
                onPress={() => router.push(item.route as never)}
              >
                <Ionicons name="ticket-outline" size={34} color={colors.gold} />
                <Text style={styles.modeTitle}>{item.title}</Text>
                <Text style={styles.modeSubtitle}>{item.description}</Text>
              </Pressable>
            )}
          />
          <View style={styles.historyPanel}>
            <Text style={styles.historyHeading}>Discovery History</Text>
            {backlotState.discoveries.slice(0, 4).map(renderHistoryRow)}
          </View>
        </View>
      ) : null}
      <View style={styles.section}>
        <Text style={styles.heading}>Challenges</Text>
        {!loading && !data?.length ? <EmptyState title="No playable challenges found" body="Only complete challenge packs will appear here." /> : null}
        <View style={styles.challengeList}>
          {data?.slice(0, 8).map((challenge) => (
            <View key={challenge.id || challenge.slug || challenge.title} style={styles.challengeWrap}>
              <ChallengeCard challenge={challenge} onPress={() => router.push(resolveChallengeRoute(challenge) as never)} />
              {isDinosaurChallenge(challenge) ? renderDiscoveryHotspot(() => handleDiscovery(triceratopsDinosaurDiscoverySource), "Discover hidden dinosaur Backlot game") : null}
            </View>
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
            <Text style={styles.discoveryTitle}>{discoveredGame?.title || "Backlot Arcade"}</Text>
            <Text style={styles.discoveryBody}>{discoveredGame?.title || "This game"} has been permanently added to Backlot Arcade.</Text>
            <Pressable accessibilityRole="button" style={styles.discoveryPrimary} onPress={launchDiscoveredGame}>
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
  backlotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  backlotProgress: {
    color: colors.muted,
    fontWeight: "700",
    marginTop: spacing.xs
  },
  backlotCard: {
    width: 188,
    minHeight: 158,
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
  challengeWrap: {
    position: "relative"
  },
  discoveryHotspot: {
    position: "absolute",
    right: spacing.sm,
    top: spacing.sm,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: "rgba(8,6,8,0.86)"
  },
  discoveryHotspotPressed: {
    transform: [{ scale: 0.95 }]
  },
  historyPanel: {
    gap: spacing.sm,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md
  },
  historyHeading: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  historyRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "flex-start"
  },
  historyIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,190,97,0.12)"
  },
  historyCopy: {
    flex: 1
  },
  historyTitle: {
    color: colors.text,
    fontWeight: "900"
  },
  historyMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
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
