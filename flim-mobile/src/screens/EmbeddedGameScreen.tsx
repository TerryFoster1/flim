import { ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { AppState, AppStateStatus, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewMessageEvent } from "react-native-webview";
import { router } from "expo-router";
import { colors, spacing } from "@/theme/theme";
import { isTriceratopsGameMessage, TriceratopsRunStats } from "@/games/triceratops/messages";

interface EmbeddedGameScreenProps {
  html: string;
  title: string;
}

const NativeWebView = WebView as unknown as ComponentType<Record<string, unknown>>;

export function EmbeddedGameScreen({ html, title }: EmbeddedGameScreenProps) {
  const webViewRef = useRef<{ injectJavaScript: (script: string) => void } | null>(null);
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const [latestScore, setLatestScore] = useState<TriceratopsRunStats | null>(null);
  const source = useMemo(() => ({ html }), [html]);

  useEffect(() => {
    const sendCommand = (command: "PAUSE" | "RESUME") => {
      webViewRef.current?.injectJavaScript(`window.FLIM_GAME_COMMAND && window.FLIM_GAME_COMMAND("${command}"); true;`);
    };

    const handleAppStateChange = (state: AppStateStatus) => {
      sendCommand(state === "active" ? "RESUME" : "PAUSE");
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sendCommand("PAUSE");
      subscription.remove();
    };
  }, []);

  function handleMessage(event: WebViewMessageEvent) {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as unknown;
      if (!isTriceratopsGameMessage(parsed)) {
        return;
      }

      if (parsed.type === "GAME_READY") {
        setReady(true);
      }

      if (parsed.type === "SCORE_UPDATED" || parsed.type === "GAME_OVER" || parsed.type === "GAME_COMPLETED") {
        setLatestScore(parsed.payload as unknown as TriceratopsRunStats);
      }

      if (parsed.type === "EXIT_REQUESTED" || parsed.type === "PAUSE_REQUESTED") {
        router.back();
      }
    } catch {
      // Ignore malformed game messages. The game remains sandboxed in the WebView.
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.sm) }]}>
        <View>
          <Text style={styles.kicker}>Hidden Game Lab</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Exit game" onPress={() => router.back()} style={styles.exitButton}>
          <Text style={styles.exitLabel}>Exit</Text>
        </Pressable>
      </View>
      <View style={styles.gameFrame}>
        <NativeWebView
          ref={webViewRef}
          originWhitelist={["*"]}
          source={source}
          onMessage={handleMessage}
          javaScriptEnabled
          domStorageEnabled={false}
          bounces={false}
          scrollEnabled={false}
          allowsBackForwardNavigationGestures={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          mediaPlaybackRequiresUserAction
          style={styles.webView}
        />
        {!ready ? (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <Text style={styles.loadingTitle}>Loading game...</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerStat}>Score {latestScore?.score ?? 0}</Text>
        <Text style={styles.footerStat}>Cars {latestScore?.vehiclesFlipped ?? 0}</Text>
        <Text style={styles.footerStat}>Combo x{latestScore?.maxCombo ?? 1}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  kicker: {
    color: colors.gold,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "900"
  },
  exitButton: {
    minHeight: 42,
    minWidth: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: "rgba(245,193,111,0.12)"
  },
  exitLabel: {
    color: colors.text,
    fontWeight: "900"
  },
  gameFrame: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden"
  },
  webView: {
    flex: 1,
    backgroundColor: "#000"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  },
  loadingTitle: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: "900"
  },
  footer: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: "rgba(5,4,7,0.98)"
  },
  footerStat: {
    color: colors.text,
    fontWeight: "800"
  }
});
