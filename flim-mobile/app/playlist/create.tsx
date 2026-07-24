import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { flimApi } from "@/api/flimApi";
import type { Playlist } from "@/api/types";
import { useSession } from "@/auth/SessionProvider";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radii, spacing } from "@/theme/theme";

const visibilityOptions: Array<{ value: Playlist["visibility"]; label: string }> = [
  { value: "private", label: "Private" },
  { value: "shared", label: "Shared" },
  { value: "public", label: "Public" }
];

export default function CreatePlaylistScreen() {
  const { user, loading: sessionLoading } = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Playlist["visibility"]>("private");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Playlist name is required.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const playlist = await flimApi.createPlaylist(trimmedName, description.trim(), visibility);
      router.replace(`/playlist/${playlist.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playlist could not be created. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header title="Create Playlist" subtitle="Start a new Flim collection." />
        {!sessionLoading && !user ? (
          <View style={styles.panel}>
            <Text style={styles.copy}>Sign in to create playlists.</Text>
            <PrimaryButton label="Sign In" onPress={() => router.push("/(auth)/login")} />
          </View>
        ) : (
          <View style={styles.form}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Playlist name"
              placeholderTextColor="rgba(255,247,232,0.5)"
              style={styles.input}
            />
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description"
              placeholderTextColor="rgba(255,247,232,0.5)"
              multiline
              style={[styles.input, styles.textArea]}
            />
            <View style={styles.visibilityRow}>
              {visibilityOptions.map((option) => (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setVisibility(option.value)}
                  style={[styles.visibilityButton, visibility === option.value && styles.visibilityActive]}
                >
                  <Text style={[styles.visibilityText, visibility === option.value && styles.visibilityActiveText]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={styles.actionRow}>
              <PrimaryButton label="Cancel" variant="secondary" disabled={submitting} onPress={() => router.back()} style={styles.action} />
              <PrimaryButton label={submitting ? "Creating..." : "Create"} disabled={submitting} onPress={submit} style={styles.action} />
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.md
  },
  panel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  copy: {
    color: colors.muted,
    lineHeight: 22
  },
  input: {
    minHeight: 54,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 16
  },
  textArea: {
    minHeight: 96,
    textAlignVertical: "top"
  },
  visibilityRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  visibilityButton: {
    flex: 1,
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  visibilityActive: {
    borderColor: colors.gold,
    backgroundColor: "rgba(245,193,111,0.14)"
  },
  visibilityText: {
    color: colors.muted,
    fontWeight: "800"
  },
  visibilityActiveText: {
    color: colors.text
  },
  error: {
    color: colors.danger,
    lineHeight: 20
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  action: {
    flex: 1
  }
});
