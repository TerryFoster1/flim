import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { posterRevealRounds } from "@/arcade/seededGames";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { colors, radii, spacing } from "@/theme/theme";

const TILE_COUNT = 20;

export default function PosterGuessScreen() {
  const [roundIndex, setRoundIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(1000);
  const [complete, setComplete] = useState(false);
  const round = posterRevealRounds[roundIndex % posterRevealRounds.length];
  const coveredTiles = useMemo(
    () => Array.from({ length: TILE_COUNT }, (_, index) => index).filter((tile) => !revealed.includes(tile)),
    [revealed]
  );

  function revealTile() {
    if (!coveredTiles.length || complete) return;
    const next = coveredTiles[(revealed.length * 7 + roundIndex) % coveredTiles.length];
    setRevealed((current) => [...current, next]);
    setScore((current) => Math.max(100, current - 50));
  }

  function guess() {
    if (!selected) return;
    if (selected === round.title) {
      setComplete(true);
      return;
    }
    setScore((current) => Math.max(100, current - 100));
    setSelected(null);
    revealTile();
  }

  function playAgain() {
    setRoundIndex((value) => value + 1);
    setStarted(false);
    setRevealed([]);
    setSelected(null);
    setScore(1000);
    setComplete(false);
  }

  return (
    <Screen>
      <Header title="Movie Reveal" subtitle="Reveal the poster. Guess the movie." />
      {!started ? (
        <View style={styles.card}>
          <Text style={styles.big}>Poster Guess</Text>
          <Text style={styles.copy}>Uncover tiles and guess the movie before the whole poster is revealed.</Text>
          <PrimaryButton label="Start Game" onPress={() => setStarted(true)} />
        </View>
      ) : null}
      {started ? (
        <View style={styles.card}>
          <View style={styles.scoreRow}>
            <Text style={styles.meta}>{round.year}</Text>
            <Text style={styles.meta}>{score} pts</Text>
          </View>
          <View style={styles.poster}>
            <Image source={{ uri: round.imageUrl }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
            {!complete
              ? Array.from({ length: TILE_COUNT }, (_, tile) => {
                  if (revealed.includes(tile)) return null;
                  return <View key={tile} style={[styles.tile, { left: `${(tile % 4) * 25}%`, top: `${Math.floor(tile / 4) * 20}%` }]} />;
                })
              : null}
          </View>
          {!complete ? (
            <>
              <PrimaryButton label="Reveal Tile" variant="secondary" onPress={revealTile} />
              <View style={styles.options}>
                {round.options.map((option) => (
                  <Pressable key={option} onPress={() => setSelected(option)} style={[styles.option, selected === option && styles.selected]}>
                    <Text style={styles.optionText}>{option}</Text>
                  </Pressable>
                ))}
              </View>
              <PrimaryButton label="Guess Movie" disabled={!selected} onPress={guess} />
            </>
          ) : (
            <View style={styles.result}>
              <Text style={styles.big}>{round.title}</Text>
              <Text style={styles.copy}>Correct. You earned {Math.max(10, Math.round(score / 20))} tickets.</Text>
              <PrimaryButton label="Play Again" onPress={playAgain} />
            </View>
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  big: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    lineHeight: 22
  },
  scoreRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  meta: {
    color: colors.gold,
    fontWeight: "900"
  },
  poster: {
    position: "relative",
    overflow: "hidden",
    height: 420,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background
  },
  tile: {
    position: "absolute",
    width: "25%",
    height: "20%",
    borderWidth: 0.5,
    borderColor: "rgba(245,193,111,0.22)",
    backgroundColor: "#111014"
  },
  options: {
    gap: spacing.sm
  },
  option: {
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panelSoft
  },
  selected: {
    borderColor: colors.gold,
    backgroundColor: "rgba(245,193,111,0.12)"
  },
  optionText: {
    color: colors.text,
    fontWeight: "800"
  },
  result: {
    gap: spacing.sm
  }
});
