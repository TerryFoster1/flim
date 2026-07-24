import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSession } from "@/auth/SessionProvider";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radii, spacing } from "@/theme/theme";

export default function RewardsScreen() {
  const { user } = useSession();

  return (
    <Screen>
      <Header title="Rewards" subtitle="Tickets, badges, and Arcade progress." />
      {!user ? (
        <View style={styles.card}>
          <Text style={styles.title}>Sign in to track rewards</Text>
          <Text style={styles.copy}>Your tickets and badges stay with your Flim profile.</Text>
          <PrimaryButton label="Sign In" onPress={() => router.push("/(auth)/login")} />
        </View>
      ) : (
        <View style={styles.grid}>
          <Pressable style={styles.card}>
            <Ionicons name="ticket-outline" size={36} color={colors.gold} />
            <Text style={styles.value}>{user.ticketBalance || 0}</Text>
            <Text style={styles.copy}>Tickets</Text>
          </Pressable>
          <Pressable style={styles.card}>
            <Ionicons name="trophy-outline" size={36} color={colors.gold} />
            <Text style={styles.value}>0</Text>
            <Text style={styles.copy}>Badges</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: spacing.md
  },
  card: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: "900"
  },
  value: {
    color: colors.text,
    fontSize: 34,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    lineHeight: 22
  }
});
