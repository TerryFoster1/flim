import type { ReactNode } from "react";
import type { ImageSourcePropType } from "react-native";
import { ImageBackground, StyleSheet, Text, View } from "react-native";
import { colors, radii, shadows, spacing, typography } from "@/theme/theme";

interface FlimHeroProps {
  image: ImageSourcePropType;
  title: string;
  subtitle: string;
  children?: ReactNode;
  compact?: boolean;
}

export function FlimHero({ image, title, subtitle, children, compact = false }: FlimHeroProps) {
  return (
    <ImageBackground source={image} resizeMode="cover" imageStyle={styles.image} style={[styles.hero, compact && styles.heroCompact]}>
      <View style={styles.scrim} />
      <View style={styles.copy}>
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {children ? <View style={styles.children}>{children}</View> : null}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: 386,
    justifyContent: "flex-end",
    overflow: "hidden",
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    marginTop: spacing.sm,
    ...shadows.panel
  },
  heroCompact: {
    minHeight: 292
  },
  image: {
    borderRadius: radii.xl
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.34)"
  },
  copy: {
    gap: spacing.sm,
    padding: spacing.lg,
    paddingTop: 76,
    backgroundColor: "rgba(0,0,0,0.26)"
  },
  title: {
    color: colors.cream,
    fontFamily: typography.serif,
    fontSize: typography.heroSize,
    fontWeight: "700",
    lineHeight: 56,
    letterSpacing: 0
  },
  titleCompact: {
    fontSize: typography.titleSize,
    lineHeight: 39,
    fontFamily: undefined,
    fontWeight: "900"
  },
  subtitle: {
    maxWidth: 330,
    color: "rgba(255,255,255,0.9)",
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "600"
  },
  children: {
    marginTop: spacing.sm
  }
});
