import { useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import type { PlaylistMovie } from "@/api/types";
import { flimImages } from "@/assets/flimAssets";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, shadows, spacing, typography } from "@/theme/theme";

export default function RouletteScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getMyPlaylists(), []);
  const [choice, setChoice] = useState<PlaylistMovie | null>(null);
  const reelRotation = useRef(new Animated.Value(0)).current;
  const titles = useMemo(() => (data || []).flatMap((playlist) => playlist.movies || []), [data]);

  function spin() {
    if (!titles.length) return;
    reelRotation.setValue(0);
    Animated.timing(reelRotation, {
      toValue: 1,
      duration: 760,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
    setChoice(titles[Math.floor(Math.random() * titles.length)]);
  }

  const reelSpin = reelRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "720deg"]
  });

  return (
    <Screen>
      <Header title="What Are We Watching Tonight?" subtitle="Let Flim pick from your saved titles." />
      {loading ? <LoadingHero label="Loading your collection..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && !titles.length ? <EmptyState title="No saved titles yet" body="Add titles to playlists, then come back for a movie-night pick." /> : null}
      {titles.length ? (
        <View style={styles.card}>
          <Animated.Image
            source={flimImages.iconMark}
            style={[styles.reelMark, { transform: [{ rotate: reelSpin }] }]}
            resizeMode="contain"
            accessibilityLabel="Flim film reel picker"
          />
          <Text style={styles.kicker}>Movie Night</Text>
          <Text style={styles.title}>{choice?.title || "Ready when you are."}</Text>
          {choice?.posterUrl ? <Image source={{ uri: choice.posterUrl }} style={styles.poster} contentFit="cover" /> : null}
          <View style={styles.actions}>
            <PrimaryButton label="SPIN" onPress={spin} style={styles.button} />
            {choice ? (
              <PrimaryButton
                label="View Title"
                variant="secondary"
                onPress={() => router.push(`/title/${choice.mediaType}/${choice.tmdbId}`)}
                style={styles.button}
              />
            ) : null}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    alignItems: "center",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelDeep,
    padding: spacing.lg,
    ...shadows.panel
  },
  reelMark: {
    width: 124,
    height: 124
  },
  kicker: {
    color: colors.gold,
    fontWeight: "900"
  },
  title: {
    color: colors.cream,
    fontFamily: typography.serif,
    fontSize: 34,
    lineHeight: 40,
    textAlign: "center",
    fontWeight: "700"
  },
  poster: {
    width: 168,
    height: 252,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  button: {
    flex: 1
  }
});
