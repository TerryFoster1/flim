import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { colors } from "@/theme/theme";

function iconName(routeName: string) {
  switch (routeName) {
    case "playlists":
      return "albums";
    case "arcade":
      return "ticket";
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
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={iconName(route.name) as keyof typeof Ionicons.glyphMap} color={color} size={size} />
        )
      })}
    >
      <Tabs.Screen name="playlists" options={{ title: "My Playlists" }} />
      <Tabs.Screen name="arcade" options={{ title: "Arcade" }} />
      <Tabs.Screen name="public" options={{ title: "Public Playlists" }} />
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
    </Tabs>
  );
}
