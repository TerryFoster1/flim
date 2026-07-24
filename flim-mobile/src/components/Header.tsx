import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "@/auth/SessionProvider";
import { flimImages } from "@/assets/flimAssets";
import { colors, spacing } from "@/theme/theme";

export function Header({ title, subtitle }: { title?: string; subtitle?: string }) {
  const { user } = useSession();

  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go to My Playlists" style={styles.brandButton} onPress={() => router.push("/playlists")}>
          <Image source={flimImages.logo} style={styles.logo} />
        </Pressable>
        {user ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Open Profile" style={styles.profileButton} onPress={() => router.push("/profile")}>
            <Text style={styles.profileInitial}>{(user.handle || user.displayName || user.email || "F").slice(0, 1).toUpperCase()}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel="Sign In" style={styles.profileButton} onPress={() => router.push("/(auth)/login")}>
            <Ionicons name="person-outline" size={20} color={colors.gold} />
          </Pressable>
        )}
      </View>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  brandButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm
  },
  logo: {
    width: 136,
    height: 46,
    resizeMode: "contain"
  },
  profileButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  profileInitial: {
    color: colors.gold,
    fontSize: 16,
    fontWeight: "900"
  },
  title: {
    color: colors.text,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "800"
  },
  subtitle: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 23
  }
});
