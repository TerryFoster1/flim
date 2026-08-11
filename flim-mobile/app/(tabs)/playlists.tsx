import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { flimImages } from "@/assets/flimAssets";
import { useSession } from "@/auth/SessionProvider";
import { CompactSearch } from "@/components/CompactSearch";
import { FlimHero } from "@/components/FlimHero";
import { Header } from "@/components/Header";
import { PlaylistCard } from "@/components/PlaylistCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, spacing } from "@/theme/theme";

export default function MyPlaylistsScreen() {
  const { user, loading: sessionLoading } = useSession();
  const [query, setQuery] = useState("");
  const { data, loading, error, refresh } = useAsync(() => (user ? flimApi.getMyPlaylists() : Promise.resolve([])), [user?.id]);
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
        image={flimImages.myPlaylistsHero}
        title="My Playlists"
        subtitle="Organize, discover, and revisit your collections."
      >
        <CompactSearch
          value={query}
          onChangeText={setQuery}
          placeholder="Search movies, shows, actors, genres, or playlists"
        />
      </FlimHero>

      {!user && !sessionLoading ? (
        <PrimaryButton label="Sign In" onPress={() => router.push("/(auth)/login")} />
      ) : null}
      {sessionLoading || loading ? <LoadingHero label="Loading your playlists..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {user ? (
        <View style={styles.actionRow}>
          <PrimaryButton label="Create Playlist" onPress={() => router.push("/playlist/create")} style={styles.actionButton} />
          <Pressable accessibilityRole="button" style={styles.secondaryAction} onPress={() => router.push("/roulette" as never)}>
            <Text style={styles.secondaryActionText}>Director's Choice</Text>
          </Pressable>
        </View>
      ) : null}
      <SectionHeader title={query.trim() ? `Results for ${query.trim()}` : "Your Playlists"} />
      {!loading && user && !filteredPlaylists.length ? (
        <EmptyState title="No playlists found" body="Try another search, or create a new collection." />
      ) : null}
      <View style={styles.list}>
        {filteredPlaylists.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} onPress={() => router.push(`/playlist/${playlist.id}`)} />
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  actionButton: {
    flex: 1
  },
  secondaryAction: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(245,193,111,0.12)"
  },
  secondaryActionText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "800"
  },
  list: {
    gap: spacing.md
  }
});
