import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Header } from "@/components/Header";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Screen } from "@/components/Screen";
import { getShuffledOptions } from "@/trivia/optionShuffle";
import type { TriviaQuestion } from "@/api/types";
import { colors, radii, spacing } from "@/theme/theme";

export function SeededChoiceGame({ title, subtitle, questions }: { title: string; subtitle: string; questions: TriviaQuestion[] }) {
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [complete, setComplete] = useState(false);
  const current = questions[index];
  const options = useMemo(() => (current ? getShuffledOptions(current) : []), [current]);

  function next() {
    const wasCorrect = selected === current.answer;
    const nextCorrect = correct + (wasCorrect ? 1 : 0);
    setCorrect(nextCorrect);
    setSelected(null);
    if (index >= questions.length - 1) {
      setComplete(true);
      return;
    }
    setIndex((value) => value + 1);
  }

  function reset() {
    setStarted(false);
    setIndex(0);
    setSelected(null);
    setCorrect(0);
    setComplete(false);
  }

  return (
    <Screen>
      <Header title={title} subtitle={subtitle} />
      {!started ? (
        <View style={styles.card}>
          <Text style={styles.big}>{questions.length} questions</Text>
          <Text style={styles.copy}>Start when everyone is ready. Answers stay hidden until the end.</Text>
          <PrimaryButton label="Start Game" onPress={() => setStarted(true)} />
        </View>
      ) : null}
      {started && current && !complete ? (
        <View style={styles.card}>
          <Text style={styles.progress}>Question {index + 1} of {questions.length}</Text>
          <Text style={styles.question}>{current.question}</Text>
          <View style={styles.options}>
            {options.map((option) => (
              <Pressable key={option} onPress={() => setSelected(option)} style={[styles.option, selected === option && styles.selected]}>
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            ))}
          </View>
          <PrimaryButton label={index === questions.length - 1 ? "Finish" : "Next"} disabled={!selected} onPress={next} />
        </View>
      ) : null}
      {complete ? (
        <View style={styles.card}>
          <Text style={styles.big}>{correct}/{questions.length}</Text>
          <Text style={styles.copy}>Round complete. Your score is ready.</Text>
          <PrimaryButton label="Play Again" onPress={reset} />
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
    fontSize: 30,
    fontWeight: "900"
  },
  copy: {
    color: colors.muted,
    lineHeight: 22
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
