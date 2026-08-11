import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { flimImages } from "@/assets/flimAssets";
import { CompactSearch } from "@/components/CompactSearch";
import { FlimHero } from "@/components/FlimHero";
import { Header } from "@/components/Header";
import { PlaylistCard } from "@/components/PlaylistCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { spacing } from "@/theme/theme";

export default function PublicPlaylistsScreen() {
  const [query, setQuery] = useState("");
  const { data, loading, error, refresh } = useAsync(() => flimApi.getPublicPlaylists(), []);
  const filteredPlaylists = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return data || [];
    return (data || []).filter((playlist) => {
      const movieText = playlist.movies?.map((movie) => movie.title).join(" ") || "";
      return `${playlist.name} ${playlist.description || ""} ${movieText}`.toLowerCase().includes(normalizedQuery);
    });
  }, [data, query]);

  return (
    <Screen>
      <Header />
      <FlimHero
        compact
        image={flimImages.publicPlaylistsHero}
        title="Public Playlists"
        subtitle="Discover curated movie and TV collections."
      >
        <CompactSearch
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies, shows, actors, genres, or public playlists"
        />
      </FlimHero>
      {loading ? <LoadingHero label="Loading public playlists..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      <SectionHeader title={query.trim() ? `Results for ${query.trim()}` : "Recommended Playlists"} />
      {!loading && !error && !filteredPlaylists.length ? <EmptyState title="No public playlists found" /> : null}
      <View style={styles.list}>
        {filteredPlaylists.map((playlist) => (
          <PlaylistCard key={playlist.id || playlist.publicSlug} playlist={playlist} onPress={() => router.push(`/playlist/${playlist.id || playlist.publicSlug}`)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md
  }
});
