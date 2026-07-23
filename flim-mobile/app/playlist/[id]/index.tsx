import { FlatList, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { Header } from "@/components/Header";
import { PosterCard } from "@/components/PosterCard";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, spacing } from "@/theme/theme";

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, refresh } = useAsync(() => flimApi.getPlaylist(String(id)), [id]);
  const movies = data?.movies || [];

  return (
    <Screen>
      <Header title={data?.name || "Playlist"} subtitle={data?.description || "Saved titles"} />
      {loading ? <LoadingHero label="Loading playlist..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && !movies.length ? <EmptyState title="No titles shown" body="This playlist has no visible titles for this session." /> : null}
      <Text style={styles.count}>{movies.length} titles</Text>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  count: {
    color: colors.gold,
    fontWeight: "800",
    marginBottom: spacing.md
  },
  grid: {
    gap: spacing.lg
  },
  gridRow: {
    gap: spacing.lg
  }
});
