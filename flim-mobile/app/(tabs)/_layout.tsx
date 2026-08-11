import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import { flimImages } from "@/assets/flimAssets";
import { colors } from "@/theme/theme";

function iconName(routeName: string) {
  switch (routeName) {
    case "playlists":
      return "albums";
    case "arcade":
      return "ticket";
    case "home":
      return "search";
    case "profile":
      return "person-circle";
    case "public":
      return "people";
    default:
      return "ellipse";
  }
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          minHeight: 72,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: "rgba(5,4,7,0.96)",
          borderTopColor: colors.border
        },
        tabBarActiveTintColor: colors.gold,
        tabBarInactiveTintColor: colors.muted,
        tabBarIcon: ({ color, size }) => route.name === "arcade" ? (
          <View style={styles.ticketWrap}>
            <Image source={flimImages.arcadeTicket} style={styles.ticket} />
          </View>
        ) : (
          <Ionicons name={iconName(route.name) as keyof typeof Ionicons.glyphMap} color={color} size={size} />
        )
      })}
    >
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="playlists" options={{ title: "My Playlists" }} />
      <Tabs.Screen name="arcade" options={{ title: "Arcade" }} />
      <Tabs.Screen name="public" options={{ title: "Public Playlists" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  ticketWrap: {
    alignItems: "center",
    justifyContent: "center",
    width: 72,
    height: 46,
    marginTop: 4
  },
  ticket: {
    width: 70,
    height: 42,
    resizeMode: "contain"
  }
});
