import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SessionProvider } from "@/auth/SessionProvider";
import { colors } from "@/theme/theme";

export default function RootLayout() {
  return (
    <SessionProvider>
      <StatusBar style="light" backgroundColor={colors.background} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background }
        }}
      />
    </SessionProvider>
  );
}
