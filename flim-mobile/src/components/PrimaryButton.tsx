import { Pressable, StyleSheet, Text, ViewStyle } from "react-native";
import { colors, radii, spacing } from "@/theme/theme";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  style?: ViewStyle;
}

export function PrimaryButton({ label, onPress, disabled, variant = "primary", style }: PrimaryButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "secondary" && styles.secondary,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style
      ]}
    >
      <Text style={[styles.label, variant === "secondary" && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.gold
  },
  secondary: {
    backgroundColor: "rgba(42,196,129,0.15)",
    borderWidth: 1,
    borderColor: "rgba(42,196,129,0.45)"
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    transform: [{ scale: 0.98 }]
  },
  label: {
    color: "#160b02",
    fontWeight: "800",
    fontSize: 16
  },
  secondaryLabel: {
    color: colors.text
  }
});
