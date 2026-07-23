import { StyleSheet, Text, View } from "react-native";
import { colors, radii } from "@/theme/theme";

export function Avatar({ label = "F" }: { label?: string }) {
  return (
    <View style={styles.avatar}>
      <Text style={styles.text}>{label.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,193,111,0.16)",
    borderWidth: 1,
    borderColor: colors.borderStrong
  },
  text: {
    color: colors.gold,
    fontWeight: "900"
  }
});
