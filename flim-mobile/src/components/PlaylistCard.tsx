import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, radii, shadows, spacing } from "@/theme/theme";
import type { Playlist } from "@/api/types";

export function PlaylistCard({ playlist, onPress }: { playlist: Playlist; onPress: () => void }) {
  const posters = (playlist.movies || []).filter((movie) => movie.posterUrl).slice(0, 3);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.art}>
        {posters.length ? (
          posters.map((movie, index) => (
            <Image
              key={`${movie.mediaType}-${movie.tmdbId}`}
              source={{ uri: movie.posterUrl }}
              style={[styles.poster, { left: index * 16, zIndex: posters.length - index }]}
              contentFit="cover"
            />
          ))
        ) : (
          <View style={styles.icon}><Text style={styles.iconText}>{playlist.name.slice(0, 1).toUpperCase()}</Text></View>
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{playlist.name}</Text>
        {playlist.description ? <Text numberOfLines={2} style={styles.description}>{playlist.description}</Text> : null}
        <Text style={styles.meta}>{playlist.movieCount ?? playlist.movies?.length ?? 0} titles</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: spacing.md,
    minHeight: 112,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    ...shadows.panel
  },
  art: {
    width: 92,
    height: 78,
    justifyContent: "center"
  },
  poster: {
    position: "absolute",
    width: 48,
    height: 72,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.panel
  },
  icon: {
    width: 70,
    height: 70,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,193,111,0.16)",
    borderWidth: 1,
    borderColor: colors.borderStrong
  },
  iconText: {
    color: colors.gold,
    fontSize: 22,
    fontWeight: "900"
  },
  copy: {
    flex: 1,
    gap: 4
  },
  title: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 18
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  meta: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: "700"
  },
  pressed: {
    opacity: 0.82
  }
});
