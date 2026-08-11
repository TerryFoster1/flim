import { StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, radii, spacing } from "@/theme/theme";

interface CompactSearchProps {
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
}

export function CompactSearch({ value, placeholder, onChangeText, onSubmit }: CompactSearchProps) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="search" size={19} color={colors.gold} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor="rgba(255,247,232,0.55)"
        returnKeyType="search"
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: radii.md,
    minHeight: 54,
    paddingHorizontal: spacing.md
  },
  input: {
    color: colors.text,
    flex: 1,
    fontSize: 16
  }
});
