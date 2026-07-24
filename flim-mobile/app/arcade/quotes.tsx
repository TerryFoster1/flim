import { SeededChoiceGame } from "@/arcade/SeededChoiceGame";
import { quoteQuestions } from "@/arcade/seededGames";

export default function QuoteChallengeScreen() {
  return <SeededChoiceGame title="Quote Challenge" subtitle="Match the famous line to the movie." questions={quoteQuestions} />;
}
