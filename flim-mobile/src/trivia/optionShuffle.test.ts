import { describe, expect, it } from "vitest";
import { getShuffledOptions } from "./optionShuffle";
import type { TriviaQuestion } from "@/api/types";

const question: TriviaQuestion = {
  id: "sample-question",
  question: "Which movie uses a DeLorean as a time machine?",
  options: ["Back to the Future", "The Goonies", "Ghostbusters", "WarGames"],
  answer: "Back to the Future"
};

describe("getShuffledOptions", () => {
  it("keeps every option while changing only display order", () => {
    const shuffled = getShuffledOptions(question);
    expect([...shuffled].sort()).toEqual([...question.options].sort());
    expect(shuffled).toContain(question.answer);
  });

  it("is deterministic for the same question", () => {
    expect(getShuffledOptions(question)).toEqual(getShuffledOptions(question));
  });
});
