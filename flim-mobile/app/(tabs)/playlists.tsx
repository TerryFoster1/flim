import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import { useSession } from "@/auth/SessionProvider";
import { Header } from "@/components/Header";
import { PlaylistCard } from "@/components/PlaylistCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, spacing } from "@/theme/theme";

export default function MyPlaylistsScreen() {
  const { user, loading: sessionLoading } = useSession();
  const { data, loading, error, refresh } = useAsync(() => (user ? flimApi.getMyPlaylists() : Promise.resolve([])), [user?.id]);

  return (
    <Screen>
      <Header title="My Playlists" subtitle="Organize, discover, and revisit your collections." />
      {!user && !sessionLoading ? (
        <PrimaryButton label="Sign In" onPress={() => router.push("/(auth)/login")} />
      ) : null}
      {sessionLoading || loading ? <LoadingHero label="Loading your playlists..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && user && !data?.length ? <EmptyState title="No playlists yet" body="Create playlists on Flim web now; native creation is ready to wire into the same API." /> : null}
      <View style={styles.list}>
        {data?.map((playlist) => (
          <PlaylistCard key={playlist.id} playlist={playlist} onPress={() => router.push(`/playlist/${playlist.id}`)} />
        ))}
      </View>
      <Text style={styles.tool}>Director's Choice will live here as a compact playlist decision tool.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
    marginTop: spacing.md
  },
  tool: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: spacing.lg
  }
});
