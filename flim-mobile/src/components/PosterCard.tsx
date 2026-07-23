import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, radii, shadows, spacing } from "@/theme/theme";
import type { MovieSearchResult } from "@/api/types";

interface PosterCardProps {
  title: MovieSearchResult;
  onPress: () => void;
}

export function PosterCard({ title, onPress }: PosterCardProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {title.posterUrl ? (
        <Image source={{ uri: title.posterUrl }} style={styles.poster} contentFit="cover" />
      ) : (
        <View style={[styles.poster, styles.posterFallback]}>
          <Text style={styles.fallbackText}>Flim</Text>
        </View>
      )}
      <Text numberOfLines={2} style={styles.title}>{title.title}</Text>
      <Text style={styles.meta}>{title.releaseYear || title.mediaType.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 132,
    gap: spacing.xs,
    ...shadows.panel
  },
  poster: {
    width: 132,
    height: 198,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border
  },
  posterFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.panel
  },
  fallbackText: {
    color: colors.gold,
    fontWeight: "900"
  },
  title: {
    color: colors.text,
    fontWeight: "800",
    fontSize: 14
  },
  meta: {
    color: colors.muted,
    fontSize: 12
  },
  pressed: {
    opacity: 0.82
  }
});
