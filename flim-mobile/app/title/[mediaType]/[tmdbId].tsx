import { useEffect, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { flimApi } from "@/api/flimApi";
import type { MediaType, Playlist } from "@/api/types";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, spacing } from "@/theme/theme";

export default function TitleDetailsScreen() {
  const { mediaType, tmdbId } = useLocalSearchParams<{ mediaType: MediaType; tmdbId: string }>();
  const id = Number(tmdbId);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const { data, loading, error, refresh } = useAsync(() => flimApi.getMovieDetails(id, mediaType), [id, mediaType]);

  useEffect(() => {
    if (data) void flimApi.enqueueTrivia(data.tmdbId, data.mediaType, data.title).catch(() => undefined);
  }, [data?.tmdbId, data?.mediaType]);

  async function openPlaylistPicker() {
    setModalOpen(true);
    try {
      setPlaylists(await flimApi.getMyPlaylists());
    } catch {
      setPlaylists([]);
    }
  }

  async function addToPlaylist(playlist: Playlist) {
    if (!data) return;
    await flimApi.addTitleToPlaylist(playlist.id, data);
    setModalOpen(false);
    Alert.alert("Added", `${data.title} was added to ${playlist.name}.`);
  }

  async function createAndAdd() {
    if (!data || !newPlaylistName.trim()) return;
    const playlist = await flimApi.createPlaylist(newPlaylistName.trim());
    await flimApi.addTitleToPlaylist(playlist.id, data);
    setNewPlaylistName("");
    setModalOpen(false);
    Alert.alert("Added", `${data.title} was added to ${playlist.name}.`);
  }

  if (loading) return <Screen><LoadingHero label="Loading title details..." /></Screen>;
  if (error || !data) return <Screen><ErrorState message={error || "Title not found."} onRetry={refresh} /></Screen>;

  return (
    <Screen>
      {data.backdropUrl ? <Image source={{ uri: data.backdropUrl }} style={styles.hero} contentFit="cover" /> : null}
      <Text style={styles.title}>{data.title}</Text>
      <View style={styles.metaRow}>
        {data.releaseYear ? <Text style={styles.chip}>{data.releaseYear}</Text> : null}
        {data.runtimeMinutes ? <Text style={styles.chip}>{data.runtimeMinutes} min</Text> : null}
        {data.contentRating ? <Text style={styles.chip}>{data.contentRating}</Text> : null}
      </View>
      {data.overview ? <Text style={styles.overview}>{data.overview}</Text> : null}
      <View style={styles.actions}>
        <PrimaryButton label="Add To Playlist" onPress={openPlaylistPicker} />
        <PrimaryButton label="Play Trivia" variant="secondary" onPress={() => router.push(`/trivia/${data.mediaType}/${data.tmdbId}`)} />
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Cast</Text>
        {data.cast?.slice(0, 8).map((member) => (
          <Text key={`${member.tmdbId}-${member.character}`} style={styles.cast}>{member.name}{member.character ? ` as ${member.character}` : ""}</Text>
        ))}
      </View>
      <Modal visible={modalOpen} transparent animationType="slide" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add to Playlist</Text>
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              ListEmptyComponent={<EmptyState title="No playlists loaded" body="Create a new playlist below." />}
              renderItem={({ item }) => (
                <Pressable onPress={() => addToPlaylist(item)} style={styles.playlistRow}>
                  <Text style={styles.playlistName}>{item.name}</Text>
                  <Text style={styles.playlistMeta}>{item.movieCount ?? item.movies?.length ?? 0} titles</Text>
                </Pressable>
              )}
            />
            <TextInput
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              placeholder="Create new playlist"
              placeholderTextColor="rgba(255,247,232,0.5)"
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <PrimaryButton label="Cancel" variant="secondary" onPress={() => setModalOpen(false)} style={styles.modalButton} />
              <PrimaryButton label="Create & Add" onPress={createAndAdd} disabled={!newPlaylistName.trim()} style={styles.modalButton} />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    width: "100%",
    height: 220,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    marginTop: spacing.lg
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md
  },
  chip: {
    color: colors.text,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.panelSoft
  },
  overview: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginTop: spacing.lg
  },
  actions: {
    gap: spacing.md,
    marginTop: spacing.lg
  },
  section: {
    gap: spacing.sm,
    marginTop: spacing.xl
  },
  heading: {
    color: colors.gold,
    fontWeight: "900",
    fontSize: 20
  },
  cast: {
    color: colors.muted,
    lineHeight: 21
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)"
  },
  modal: {
    maxHeight: "82%",
    gap: spacing.md,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    padding: spacing.lg
  },
  modalTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  playlistRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)"
  },
  playlistName: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 16
  },
  playlistMeta: {
    color: colors.muted,
    marginTop: 4
  },
  input: {
    minHeight: 52,
    color: colors.text,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  modalButton: {
    flex: 1
  }
});
