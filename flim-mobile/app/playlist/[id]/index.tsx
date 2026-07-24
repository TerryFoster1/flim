import { FlatList, ImageBackground, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { flimImages } from "@/assets/flimAssets";
import { Header } from "@/components/Header";
import { PosterCard } from "@/components/PosterCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, shadows, spacing, typography } from "@/theme/theme";

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useAsync(() => flimApi.getPlaylist(String(id)), [id]);
  const movies = data?.movies || [];
  const heroPoster = movies.find((movie) => movie.posterUrl)?.posterUrl;

  return (
    <Screen padded={false}>
      <Header />
      <ImageBackground source={heroPoster ? { uri: heroPoster } : flimImages.myPlaylistsHero} style={styles.hero} resizeMode="cover">
        <View style={styles.scrim} />
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{data?.name || "Playlist"}</Text>
          {data?.description ? <Text style={styles.subtitle}>{data.description}</Text> : null}
          <Text style={styles.count}>{movies.length} titles</Text>
        </View>
      </ImageBackground>
      <View style={styles.content}>
        {loading ? <LoadingHero label="Loading playlist..." /> : null}
        {error ? <ErrorState message={error} onRetry={refresh} /> : null}
        {!loading && !movies.length ? <EmptyState title="No titles shown" body="This playlist has no visible titles for this session." /> : null}
        {movies.length ? (
          <>
            <SectionHeader title="Titles" />
            <FlatList
              data={movies}
              numColumns={2}
              scrollEnabled={false}
              keyExtractor={(item) => `${item.mediaType}-${item.tmdbId}`}
              columnWrapperStyle={styles.gridRow}
              contentContainerStyle={styles.grid}
              renderItem={({ item }) => (
                <PosterCard
                  title={{ ...item, overview: "", genreIds: [] }}
                  onPress={() => router.push(`/title/${item.mediaType}/${item.tmdbId}`)}
                />
              )}
            />
          </>
        ) : null}
        <Pressable style={({ pressed }) => [styles.backCard, pressed && styles.pressed]} onPress={() => router.back()}>
          <Text style={styles.backText}>Back to playlists</Text>
          <Image source={flimImages.arcadeTicket} style={styles.ticket} contentFit="contain" />
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 390,
    justifyContent: "flex-end",
    backgroundColor: colors.panel
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.58)"
  },
  heroCopy: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: 120
  },
  title: {
    color: colors.cream,
    fontFamily: typography.serif,
    fontSize: 42,
    lineHeight: 47,
    fontWeight: "700"
  },
  subtitle: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23
  },
  count: {
    color: colors.gold,
    fontWeight: "900"
  },
  content: {
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: 136
  },
  grid: {
    gap: spacing.lg
  },
  gridRow: {
    gap: spacing.lg
  },
  backCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md,
    ...shadows.panel
  },
  backText: {
    color: colors.text,
    fontWeight: "900"
  },
  ticket: {
    width: 80,
    height: 42
  },
  pressed: {
    opacity: 0.82
  }
});
