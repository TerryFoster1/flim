import { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { flimApi } from "@/api/flimApi";
import type { MediaType, MediaVideoLink, Playlist } from "@/api/types";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { colors, radii, shadows, spacing, typography } from "@/theme/theme";

function classifyVideos(videos?: MediaVideoLink[]) {
  const officialTrailer = videos?.find((video) => video.official && video.type?.toLowerCase() === "trailer")
    || videos?.find((video) => video.type?.toLowerCase() === "trailer")
    || null;
  const extras = (videos || []).filter((video) => {
    if (officialTrailer && video.id === officialTrailer.id) return false;
    const label = `${video.name} ${video.type || ""}`.toLowerCase();
    return label.includes("recap") || label.includes("behind") || label.includes("interview") || label.includes("featurette");
  });
  return { officialTrailer, extras: extras.slice(0, 4) };
}

export default function TitleDetailsScreen() {
  const { mediaType, tmdbId } = useLocalSearchParams<{ mediaType: MediaType; tmdbId: string }>();
  const id = Number(tmdbId);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const { data, loading, error, refresh } = useAsync(() => flimApi.getMovieDetails(id, mediaType), [id, mediaType]);
  const { officialTrailer, extras } = useMemo(() => classifyVideos(data?.videos), [data?.videos]);

  useEffect(() => {
    if (data) void flimApi.enqueueTrivia(data.tmdbId, data.mediaType, data.title).catch(() => undefined);
  }, [data?.tmdbId, data?.mediaType, data?.title]);

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
    <Screen padded={false}>
      <View style={styles.heroWrap}>
        {data.backdropUrl ? <Image source={{ uri: data.backdropUrl }} style={styles.heroImage} contentFit="cover" /> : null}
        <View style={styles.heroScrim} />
        <View style={styles.heroCopy}>
          <Text style={styles.title}>{data.title}</Text>
          <View style={styles.metaRow}>
            {data.releaseYear ? <Text style={styles.chip}>{data.releaseYear}</Text> : null}
            {data.runtimeMinutes ? <Text style={styles.chip}>{data.runtimeMinutes} min</Text> : null}
            {data.contentRating ? <Text style={styles.chip}>{data.contentRating}</Text> : null}
          </View>
        </View>
      </View>
      <View style={styles.content}>
        {data.overview ? <Text style={styles.overview}>{data.overview}</Text> : null}
        {data.genres?.length ? (
          <View style={styles.metaRow}>
            {data.genres.slice(0, 4).map((genre) => <Text key={genre} style={styles.chip}>{genre}</Text>)}
          </View>
        ) : null}
        <View style={styles.actions}>
          <PrimaryButton label="Add To Playlist" onPress={openPlaylistPicker} style={styles.actionButton} />
          <PrimaryButton label="Play Trivia" variant="secondary" onPress={() => router.push(`/trivia/${data.mediaType}/${data.tmdbId}`)} style={styles.actionButton} />
        </View>

        <View style={styles.module}>
          <SectionHeader title="Where To Watch" />
          <View style={styles.providerCard}>
            <Text style={styles.providerText}>Availability opens from Flim title data when providers are available for your region.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Where To Watch" style={styles.projectorButton}>
              <Ionicons name="videocam-outline" size={26} color={colors.gold} />
            </Pressable>
          </View>
        </View>

        <View style={styles.module}>
          <SectionHeader title="Cast" actionLabel={data.cast?.length ? String(data.cast.length) : undefined} />
          {data.cast?.slice(0, 8).map((member) => (
            <View key={`${member.tmdbId}-${member.character}`} style={styles.castRow}>
              {member.profileUrl ? <Image source={{ uri: member.profileUrl }} style={styles.castImage} contentFit="cover" /> : <View style={styles.castFallback}><Text style={styles.castInitial}>{member.name.slice(0, 1)}</Text></View>}
              <View style={styles.castCopy}>
                <Text style={styles.castName}>{member.name}</Text>
                {member.character ? <Text style={styles.castRole}>{member.character}</Text> : null}
              </View>
            </View>
          ))}
        </View>

        {(officialTrailer || extras.length) ? (
          <View style={styles.module}>
            <SectionHeader title="Trailers & Extras" />
            {officialTrailer ? (
              <View style={styles.videoCard}>
                <Text style={styles.videoType}>Official Trailer</Text>
                <Text style={styles.videoTitle}>{officialTrailer.name}</Text>
              </View>
            ) : null}
            {extras.map((video) => (
              <View key={video.id} style={styles.videoCard}>
                <Text style={styles.videoType}>{video.type || "Extra"}</Text>
                <Text style={styles.videoTitle}>{video.name}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.module}>
          <SectionHeader title="Flim Arcade" />
          <Pressable style={({ pressed }) => [styles.triviaCard, pressed && styles.pressed]} onPress={() => router.push(`/trivia/${data.mediaType}/${data.tmdbId}`)}>
            <View>
              <Text style={styles.triviaTitle}>{data.title} Trivia</Text>
              <Text style={styles.triviaMeta}>Play the title pack</Text>
            </View>
            <Ionicons name="chevron-forward" size={23} color={colors.gold} />
          </Pressable>
        </View>
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
  heroWrap: {
    minHeight: 430,
    justifyContent: "flex-end",
    backgroundColor: colors.panel
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.48)"
  },
  heroCopy: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingTop: 120
  },
  title: {
    color: colors.cream,
    fontFamily: typography.serif,
    fontSize: 44,
    lineHeight: 49,
    fontWeight: "700"
  },
  content: {
    gap: spacing.lg,
    padding: spacing.md,
    paddingBottom: 136
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
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
    lineHeight: 24
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm
  },
  actionButton: {
    flex: 1
  },
  module: {
    gap: spacing.md
  },
  providerCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md
  },
  providerText: {
    flex: 1,
    color: colors.mutedStrong,
    lineHeight: 21
  },
  projectorButton: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(245,193,111,0.12)"
  },
  castRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    paddingBottom: spacing.sm
  },
  castImage: {
    width: 54,
    height: 54,
    borderRadius: radii.md
  },
  castFallback: {
    width: 54,
    height: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.panelSoft
  },
  castInitial: {
    color: colors.gold,
    fontWeight: "900"
  },
  castCopy: {
    flex: 1
  },
  castName: {
    color: colors.text,
    fontWeight: "900",
    fontSize: 16
  },
  castRole: {
    color: colors.muted,
    marginTop: 3
  },
  videoCard: {
    gap: spacing.xs,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.md
  },
  videoType: {
    color: colors.gold,
    fontWeight: "900"
  },
  videoTitle: {
    color: colors.text,
    fontWeight: "800",
    lineHeight: 20
  },
  triviaCard: {
    minHeight: 96,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panelDeep,
    padding: spacing.md,
    ...shadows.panel
  },
  triviaTitle: {
    color: colors.cream,
    fontWeight: "900",
    fontSize: 20
  },
  triviaMeta: {
    color: colors.muted,
    marginTop: 5
  },
  pressed: {
    opacity: 0.82
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
