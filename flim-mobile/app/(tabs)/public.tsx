import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { Header } from "@/components/Header";
import { PlaylistCard } from "@/components/PlaylistCard";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { spacing } from "@/theme/theme";

export default function PublicPlaylistsScreen() {
  const { data, loading, error, refresh } = useAsync(() => flimApi.getPublicPlaylists(), []);

  return (
    <Screen>
      <Header title="Public Playlists" subtitle="Discover curated movie and TV collections." />
      {loading ? <LoadingHero label="Loading public playlists..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && !error && !data?.length ? <EmptyState title="No public playlists found" /> : null}
      <View style={styles.list}>
        {data?.map((playlist) => (
          <PlaylistCard key={playlist.id || playlist.publicSlug} playlist={playlist} onPress={() => router.push(`/playlist/${playlist.id || playlist.publicSlug}`)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    marginTop: spacing.md
  }
});
