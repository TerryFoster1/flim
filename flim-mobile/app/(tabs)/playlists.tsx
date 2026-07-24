import { Pressable, StyleSheet, Text, View } from "react-native";
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
      {user ? (
        <View style={styles.actionRow}>
          <PrimaryButton label="Create Playlist" onPress={() => router.push("/playlist/create")} style={styles.actionButton} />
          <Pressable accessibilityRole="button" style={styles.secondaryAction} onPress={() => router.push("/arcade")}>
            <Text style={styles.secondaryActionText}>Director's Choice</Text>
          </Pressable>
        </View>
      ) : null}
      {!loading && user && !data?.length ? <EmptyState title="No playlists yet" body="Create your first collection, then add titles from Flim." /> : null}
      <View style={styles.list}>
        {data?.map((playlist) => (
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
    marginBottom: spacing.md
  },
  actionButton: {
    flex: 1
  },
  secondaryAction: {
    flex: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
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
    gap: spacing.md,
    marginTop: spacing.md
  }
});
