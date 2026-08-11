import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { flimImages } from "@/assets/flimAssets";
import { FlimHero } from "@/components/FlimHero";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { useSession } from "@/auth/SessionProvider";
import { colors, radii, shadows, spacing } from "@/theme/theme";

export default function LoginScreen() {
  const { signIn, loading, error } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function submit() {
    await signIn(email.trim(), password);
    router.replace("/playlists");
  }

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlimHero
          title="Welcome back"
          subtitle="Sign in to continue building your movie collections."
          image={flimImages.homeHero}
          compact
        >
          <Image source={flimImages.logo} style={styles.logo} contentFit="contain" />
        </FlimHero>
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
  logo: {
    width: 112,
    height: 48
  },
  form: {
    gap: spacing.md,
    margin: spacing.md,
    marginTop: -24,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    padding: spacing.lg,
    ...shadows.panel
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelDeep,
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 16
  },
  error: {
    color: colors.danger,
    lineHeight: 20
  }
});
