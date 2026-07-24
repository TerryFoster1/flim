import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useSession } from "@/auth/SessionProvider";
import { colors, radii, spacing } from "@/theme/theme";

export default function LoginScreen() {
  const { signIn, loading, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    await signIn(email.trim(), password);
    router.replace("/playlists");
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header title="Welcome back" subtitle="Sign in to your Flim account." />
        <View style={styles.form}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor="rgba(255,247,232,0.5)"
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor="rgba(255,247,232,0.5)"
            secureTextEntry
            style={styles.input}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton label={loading ? "Signing in..." : "Sign In"} disabled={loading || !email || !password} onPress={submit} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16
  },
  error: {
    color: colors.danger,
    lineHeight: 20
  }
});
