import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { flimApi } from "@/api/flimApi";
import type { MediaType } from "@/api/types";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingHero } from "@/components/StateViews";
import { useAsync } from "@/hooks/useAsync";
import { getShuffledOptions } from "@/trivia/optionShuffle";
import { colors, radii, spacing } from "@/theme/theme";

export default function TitleTriviaScreen() {
  const { mediaType, tmdbId } = useLocalSearchParams<{ mediaType: MediaType; tmdbId: string }>();
  const [started, setStarted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [complete, setComplete] = useState(false);
  const { data, loading, error, refresh } = useAsync(() => flimApi.getTriviaPack(Number(tmdbId), mediaType, 25), [mediaType, tmdbId]);
  const questions = data?.questions || [];
  const current = questions[index];
  const options = useMemo(() => (current ? getShuffledOptions(current) : []), [current]);
  const statusCopy = useMemo(() => {
    if (data?.generationStatus === "queued" || data?.generationStatus === "generating") return "Building your trivia pack...";
    if (data?.generationStatus === "failed") return "Trivia pack not ready yet.";
    return "Title trivia";
  }, [data?.generationStatus]);

  function next() {
    const nextCorrect = correct + (selected === current?.answer ? 1 : 0);
    setCorrect(nextCorrect);
    setSelected(null);
    if (index >= questions.length - 1) {
      setComplete(true);
      return;
    }
    setIndex((value) => value + 1);
  }

  function resetRound() {
    setStarted(false);
    setSelected(null);
    setIndex(0);
    setCorrect(0);
    setComplete(false);
  }

  return (
    <Screen>
      <Header title="Title Trivia" subtitle={statusCopy} />
      {loading ? <LoadingHero label="Downloading trivia pack..." /> : null}
      {error ? <ErrorState message={error} onRetry={refresh} /> : null}
      {!loading && !questions.length ? (
        <EmptyState title="Building Trivia Pack" body="Creating movie-fan questions. This title will be ready shortly." />
      ) : null}
      {questions.length && !started ? (
        <View style={styles.startCard}>
          <Text style={styles.big}>{questions.length} questions</Text>
          <Text style={styles.copy}>Start when you are ready. The first question appears after you tap start.</Text>
          <PrimaryButton label="Start Trivia" onPress={() => setStarted(true)} />
        </View>
      ) : null}
      {started && current && !complete ? (
        <View style={styles.questionCard}>
          <Text style={styles.progress}>Question {index + 1} of {questions.length}</Text>
          <Text style={styles.question}>{current.question}</Text>
          <View style={styles.options}>
            {options.map((option) => (
              <Pressable
                key={option}
                onPress={() => setSelected(option)}
                style={[styles.option, selected === option && styles.selected]}
              >
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton
            label={index === questions.length - 1 ? "Finish" : "Next"}
            disabled={!selected}
            onPress={next}
          />
        </View>
      ) : null}
      {complete ? (
        <View style={styles.startCard}>
          <Text style={styles.big}>{correct}/{questions.length}</Text>
          <Text style={styles.copy}>Round complete. Your score is ready.</Text>
          <PrimaryButton label="Play Again" onPress={resetRound} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  startCard: {
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
  questionCard: {
    gap: spacing.md
  },
  progress: {
    color: colors.gold,
    fontWeight: "800"
  },
  question: {
    color: colors.text,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "900"
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
    fontWeight: "700"
  }
});
