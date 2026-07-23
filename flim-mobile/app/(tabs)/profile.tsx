import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSession } from "@/auth/SessionProvider";
import { Avatar } from "@/components/Avatar";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScoreCard } from "@/components/ScoreCard";
import { Screen } from "@/components/Screen";
import { LoadingHero } from "@/components/StateViews";
import { colors, spacing } from "@/theme/theme";

export default function ProfileScreen() {
  const { user, loading, logout } = useSession();

  return (
    <Screen>
      <Header title="Profile" subtitle="Your Flim identity, rewards, and settings." />
      {loading ? <LoadingHero label="Checking session..." /> : null}
      {!loading && !user ? <PrimaryButton label="Sign In" onPress={() => router.push("/(auth)/login")} /> : null}
      {user ? (
        <View style={styles.profile}>
          <Avatar label={user.handle || user.displayName || "F"} />
          <View style={styles.identity}>
            <Text style={styles.name}>{user.displayName || user.handle || "Flim user"}</Text>
            {user.handle ? <Text style={styles.handle}>@{user.handle}</Text> : null}
          </View>
          <View style={styles.row}>
            <ScoreCard value={user.ticketBalance ?? 0} label="Tickets" />
            <ScoreCard value={user.avatarId || "Classic"} label="Avatar" />
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
  identity: {
    gap: 4
  },
  name: {
    color: colors.text,
    fontSize: 24,
    fontWeight: "900"
  },
  handle: {
    color: colors.gold,
    fontWeight: "800"
  },
  row: {
    flexDirection: "row",
    gap: spacing.md
  }
});
