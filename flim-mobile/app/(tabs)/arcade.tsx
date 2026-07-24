import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { BacklotDiscovery, BacklotGame, BacklotState, ChallengePack } from "@/api/types";
import { flimApi } from "@/api/flimApi";
import { arcadeModeRoutes, resolveChallengeRoute, visibleArcadeModes } from "@/arcade/modeRoutes";
import { arcadeCollectionImages, arcadeModeIcons, flimImages } from "@/assets/flimAssets";
import { CompactSearch } from "@/components/CompactSearch";
import { FlimHero } from "@/components/FlimHero";
import { Header } from "@/components/Header";
import { ScoreCard } from "@/components/ScoreCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { ErrorState } from "@/components/StateViews";
import {
  backlotGamesById,
  isDinosaurChallenge,
  relicRunDiscoverySource,
  triceratopsDinosaurDiscoverySource
} from "@/games/backlot/registry";
import { discoverBacklotGame, getBacklotStateCache, reconcileBacklotState } from "@/games/backlot/unlocks";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, shadows, spacing, typography } from "@/theme/theme";

const fallbackFeatured: ChallengePack = {
  id: "time-travel-challenge",
  slug: "time-travel-challenge",
  title: "Time Travel Challenge",
  description: "A 100-question movie challenge about paradoxes, loops, alternate timelines, and clock-bending adventures.",
  questionCount: 100,
  badgeReward: "Time Traveler",
  mode: "trivia"
};

const collections = [
  { id: "time-travel", title: "Time Travel", count: "18 challenges", route: "/arcade/challenge/time-travel-challenge" },
  { id: "sci-fi", title: "Sci-Fi", count: "24 challenges", route: "/arcade/challenge/out-of-this-world" },
  { id: "adventure", title: "Adventure", count: "22 challenges", route: "/arcade/challenge/adventure-pack" },
  { id: "animation", title: "Animation", count: "20 challenges", route: "/arcade/challenge/disney-animation" },
  { id: "horror", title: "Horror", count: "16 challenges", route: "/arcade/challenge/horror-icons" },
  { id: "action", title: "Action", count: "19 challenges", route: "/arcade/challenge/action-heroes" },
  { id: "zombie", title: "Zombie", count: "12 challenges", route: "/arcade/challenge/zombie-collection" },
  { id: "apocalypse", title: "Apocalypse", count: "14 challenges", route: "/arcade/challenge/apocalypse-collection" },
  { id: "alien", title: "Alien", count: "15 challenges", route: "/arcade/challenge/alien-collection" },
  { id: "tom-cruise", title: "Tom Cruise", count: "15 challenges", route: "/arcade/challenge/tom-cruise-collection" }
];

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

function featuredImageFor(challenge?: ChallengePack) {
  const text = `${challenge?.title || challenge?.name || ""} ${challenge?.slug || ""}`.toLowerCase();
  if (text.includes("space") || text.includes("world") || text.includes("sci")) return arcadeCollectionImages["sci-fi"];
  if (text.includes("adventure")) return arcadeCollectionImages.adventure;
  if (text.includes("disney") || text.includes("animation")) return arcadeCollectionImages.animation;
  if (text.includes("horror")) return arcadeCollectionImages.horror;
  if (text.includes("alien")) return arcadeCollectionImages.alien;
  return arcadeCollectionImages["time-travel"];
}

export default function ArcadeScreen() {
  const { data, error, refresh } = useAsync(() => flimApi.getChallenges(), []);
  const featured = data?.find((challenge) => (challenge.questionCount || 0) >= 75) || data?.[0] || fallbackFeatured;
  const [query, setQuery] = useState("");
  const [backlotState, setBacklotState] = useState<BacklotState>(emptyBacklotState);
  const [discoveredGame, setDiscoveredGame] = useState<BacklotGame | null>(null);
  const [discoveryVisible, setDiscoveryVisible] = useState(false);
  const discoveryPulse = useRef(new Animated.Value(0)).current;
  const unlockedBacklotGames = useMemo(() => {
    return backlotState.games.filter((game) => backlotState.unlockIds.includes(game.id));
  }, [backlotState.games, backlotState.unlockIds]);

  useEffect(() => {
    let isMounted = true;
    getBacklotStateCache().then((cachedState) => {
      if (isMounted) setBacklotState(cachedState);
    }).catch(() => undefined);
    reconcileBacklotState().then((state) => {
      if (isMounted) setBacklotState(state);
    }).catch(() => undefined);
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
      <Pressable accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.discoveryHotspot, pressed && styles.discoveryHotspotPressed]} onPress={onPress}>
        <Ionicons name="sparkles-outline" size={16} color={colors.gold} />
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

  const featuredTitle = featured.title || featured.name || "This Week's Challenge";

  return (
    <Screen padded={false}>
      <Header />
      <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
        <View style={styles.padded}>
          <FlimHero
            image={flimImages.arcadeHero}
            title="Flim Arcade"
            subtitle="Movie trivia, group challenges, and game-night experiences."
          >
            <CompactSearch
              value={query}
              onChangeText={setQuery}
              onSubmit={() => undefined}
              placeholder="Search Flim Arcade"
            />
          </FlimHero>
        </View>

        {error ? <View style={styles.padded}><ErrorState message={error} onRetry={refresh} /></View> : null}

        <View style={styles.band}>
          <SectionHeader title="This Week's Challenge" actionLabel="View all" onAction={() => router.push("/arcade/leaderboards")} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open ${featuredTitle}`}
            onPress={() => router.push(resolveChallengeRoute(featured) as never)}
            style={({ pressed }) => [styles.featuredCard, pressed && styles.pressedCard]}
          >
            <Image source={featuredImageFor(featured)} style={styles.featuredImage} contentFit="cover" />
            <View style={styles.featuredCopy}>
              <Text style={styles.featuredTitle}>{featuredTitle}</Text>
              <View style={styles.metaLine}>
                <Ionicons name="help-circle-outline" size={16} color={colors.gold} />
                <Text style={styles.metaText}>{featured.questionCount || 100} Questions</Text>
              </View>
              <View style={styles.metaLine}>
                <Ionicons name="time-outline" size={16} color={colors.gold} />
                <Text style={styles.metaText}>Ends this week</Text>
              </View>
              <View style={styles.metaLine}>
                <Ionicons name="ticket-outline" size={16} color={colors.gold} />
                <Text style={styles.metaText}>Win up to 500 tickets</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={25} color={colors.goldSoft} />
          </Pressable>
        </View>

        <View style={styles.fullWidthSection}>
          <SectionHeader title="Play Something" />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={visibleArcadeModes}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modeRow}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                style={({ pressed }) => [styles.modeCard, pressed && styles.pressedCard]}
                onPress={() => router.push(item.route as never)}
              >
                <View style={styles.modeIconWrap}>
                  <Image source={arcadeModeIcons[item.iconKey]} style={styles.modeIcon} contentFit="contain" />
                </View>
                <Text style={styles.modeTitle}>{item.title}</Text>
                <Text style={styles.modeSubtitle}>{item.subtitle}</Text>
                {item.id === "poster" ? renderDiscoveryHotspot(() => handleDiscovery(relicRunDiscoverySource), "Discover hidden Movie Reveal Backlot game") : null}
              </Pressable>
            )}
          />
        </View>

        <View style={styles.fullWidthSection}>
          <SectionHeader title="Explore Collections" actionLabel="View all" onAction={() => router.push(arcadeModeRoutes.trivia as never)} />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={collections}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.collectionRow}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                style={({ pressed }) => [styles.collectionCard, pressed && styles.pressedCard]}
                onPress={() => router.push(item.route as never)}
              >
                <Image source={arcadeCollectionImages[item.id]} style={styles.collectionImage} contentFit="cover" />
                <View style={styles.collectionScrim} />
                <View style={styles.collectionCopy}>
                  <Text style={styles.collectionTitle}>{item.title}</Text>
                  <Text style={styles.collectionCount}>{item.count}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>

        <View style={styles.padded}>
          <View style={styles.progressPanel}>
            <SectionHeader title="Your Progress" />
            <View style={styles.progressRow}>
              <ScoreCard value="0" label="Total tickets" />
              <ScoreCard value="0" label="Trophies & badges" />
            </View>
          </View>
        </View>

        {unlockedBacklotGames.length ? (
          <View style={styles.padded}>
            <View style={styles.backlotPanel}>
              <View style={styles.backlotHeader}>
                <View>
                  <Text style={styles.backlotTitle}>Backlot Arcade</Text>
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
          </View>
        ) : null}

        {data?.some(isDinosaurChallenge) ? (
          <Pressable style={styles.hiddenDino} onPress={() => handleDiscovery(triceratopsDinosaurDiscoverySource)}>
            <Text style={styles.hiddenDinoText}>.</Text>
          </Pressable>
        ) : null}
      </ScrollView>

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
            <Ionicons name="sparkles" size={34} color={colors.gold} />
            <Text style={styles.discoveryTitle}>You found something hidden...</Text>
            <Text style={styles.discoveryBody}>
              {discoveredGame?.title || "A Backlot Arcade game"} has been added to your Backlot Arcade.
            </Text>
            <Pressable accessibilityRole="button" style={styles.discoveryLaunch} onPress={launchDiscoveredGame}>
              <Text style={styles.discoveryLaunchText}>Launch now</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.discoveryDismiss} onPress={() => setDiscoveryVisible(false)}>
              <Text style={styles.discoveryDismissText}>Keep browsing</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingBottom: 132,
    gap: spacing.lg
  },
  padded: {
    paddingHorizontal: spacing.md
  },
  band: {
    marginHorizontal: spacing.md,
    gap: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: "rgba(9, 13, 18, 0.92)",
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    ...shadows.panel
  },
  fullWidthSection: {
    gap: spacing.md,
    paddingLeft: spacing.md
  },
  featuredCard: {
    minHeight: 178,
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "hidden",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(255,255,255,0.055)"
  },
  featuredImage: {
    width: 132,
    minHeight: 178
  },
  featuredCopy: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.md
  },
  featuredTitle: {
    color: colors.cream,
    fontFamily: typography.serif,
    fontSize: 27,
    lineHeight: 31,
    fontWeight: "700"
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  metaText: {
    color: colors.mutedStrong,
    fontWeight: "700",
    fontSize: 13
  },
  modeRow: {
    gap: spacing.md,
    paddingRight: spacing.md
  },
  modeCard: {
    width: 148,
    minHeight: 170,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.06)"
  },
  modeIconWrap: {
    width: 96,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs
  },
  modeIcon: {
    width: 96,
    height: 72
  },
  modeTitle: {
    color: colors.text,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900"
  },
  modeSubtitle: {
    color: colors.muted,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18
  },
  collectionRow: {
    gap: spacing.md,
    paddingRight: spacing.md
  },
  collectionCard: {
    width: 150,
    height: 174,
    overflow: "hidden",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  collectionImage: {
    width: "100%",
    height: "100%"
  },
  collectionScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.24)"
  },
  collectionCopy: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md
  },
  collectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "900"
  },
  collectionCount: {
    color: colors.mutedStrong,
    marginTop: 3,
    fontWeight: "700"
  },
  progressPanel: {
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelDeep,
    padding: spacing.md
  },
  progressRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  backlotPanel: {
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelDeep,
    padding: spacing.md
  },
  backlotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  backlotTitle: {
    color: colors.text,
    fontSize: 21,
    fontWeight: "900"
  },
  backlotProgress: {
    color: colors.muted,
    marginTop: 4
  },
  backlotCard: {
    width: 184,
    minHeight: 154,
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  historyPanel: {
    gap: spacing.sm
  },
  historyHeading: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 16
  },
  historyRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)"
  },
  historyIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: "rgba(245,193,111,0.13)"
  },
  historyCopy: {
    flex: 1
  },
  historyTitle: {
    color: colors.text,
    fontWeight: "800"
  },
  historyMeta: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17
  },
  discoveryHotspot: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(0,0,0,0.46)"
  },
  discoveryHotspotPressed: {
    opacity: 0.75
  },
  hiddenDino: {
    height: 1,
    opacity: 0.01
  },
  hiddenDinoText: {
    color: colors.background
  },
  discoveryBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: "rgba(0,0,0,0.74)"
  },
  discoveryCard: {
    width: "100%",
    maxWidth: 390,
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel,
    padding: spacing.xl,
    ...shadows.goldGlow
  },
  discoveryTitle: {
    color: colors.cream,
    textAlign: "center",
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900"
  },
  discoveryBody: {
    color: colors.mutedStrong,
    textAlign: "center",
    lineHeight: 22
  },
  discoveryLaunch: {
    minHeight: 50,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.gold
  },
  discoveryLaunchText: {
    color: "#160b02",
    fontWeight: "900"
  },
  discoveryDismiss: {
    paddingVertical: spacing.sm
  },
  discoveryDismissText: {
    color: colors.mutedStrong,
    fontWeight: "800"
  },
  pressedCard: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }]
  }
});
