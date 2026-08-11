import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "@/theme/theme";

export function ProviderLogo({ name }: { name: string }) {
  return (
    <View style={styles.logo}>
      <Text style={styles.text}>{name.slice(0, 2).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    width: 42,
    height: 42,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel
  },
  text: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: "900"
  }
});
