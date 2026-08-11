import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { colors, radii, spacing } from "@/theme/theme";
import type { ChallengePack } from "@/api/types";

export function ChallengeCard({ challenge, onPress }: { challenge: ChallengePack; onPress: () => void }) {
  const title = challenge.title || challenge.name || "Flim Challenge";
  const image = challenge.imageUrl || challenge.artwork;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {image ? <Image source={{ uri: image }} style={styles.image} contentFit="cover" /> : null}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        {challenge.description ? <Text numberOfLines={2} style={styles.description}>{challenge.description}</Text> : null}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{challenge.questionCount || 25} questions</Text>
          {challenge.badgeReward ? <Text style={styles.meta}>{challenge.badgeReward}</Text> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={22} color={colors.gold} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 132,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: radii.lg,
    overflow: "hidden"
  },
  image: {
    width: 124,
    height: 132
  },
  copy: {
    flex: 1,
    gap: spacing.xs,
    paddingVertical: spacing.md
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  description: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  meta: {
    color: colors.gold,
    fontWeight: "800",
    fontSize: 13
  },
  pressed: {
    opacity: 0.82
  }
});
