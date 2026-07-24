import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useSession } from "@/auth/SessionProvider";
import { flimImages } from "@/assets/flimAssets";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScoreCard } from "@/components/ScoreCard";
import { Screen } from "@/components/Screen";
import { SectionHeader } from "@/components/SectionHeader";
import { LoadingHero } from "@/components/StateViews";
import { colors, radii, shadows, spacing } from "@/theme/theme";

export default function ProfileScreen() {
  const { user, loading, logout } = useSession();
  const avatar = user?.avatarId === "nerd" ? flimImages.nerdAvatar : flimImages.classicAvatar;

  return (
    <Screen>
      <Header />
      {loading ? <LoadingHero label="Checking session..." /> : null}
      {!loading && !user ? <PrimaryButton label="Sign In" onPress={() => router.push("/(auth)/login")} /> : null}
      {user ? (
        <View style={styles.profile}>
          <View style={styles.identityCard}>
            <Image source={avatar} style={styles.avatar} contentFit="contain" />
            <View style={styles.identity}>
              <Text style={styles.name}>{user.displayName || user.handle || "Flim user"}</Text>
              {user.handle ? <Text style={styles.handle}>@{user.handle}</Text> : null}
              {user.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}
            </View>
          </View>
          <SectionHeader title="Your Progress" />
          <View style={styles.row}>
            <ScoreCard value={user.ticketBalance ?? 0} label="Tickets" />
            <ScoreCard value={user.avatarId || "Classic"} label="Current character" />
          </View>
          <PrimaryButton label="Logout" variant="secondary" onPress={logout} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: {
    gap: spacing.md
  },
  identityCard: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelDeep,
    padding: spacing.lg,
    ...shadows.panel
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: radii.lg,
    backgroundColor: "rgba(245,193,111,0.12)"
  },
  identity: {
    flex: 1,
    gap: 4
  },
  name: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900"
  },
  handle: {
    color: colors.gold,
    fontWeight: "800"
  },
  bio: {
    color: colors.muted,
    lineHeight: 20,
    marginTop: spacing.xs
  },
  row: {
    flexDirection: "row",
    gap: spacing.md
  }
});
