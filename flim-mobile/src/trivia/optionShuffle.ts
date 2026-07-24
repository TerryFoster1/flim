import type { TriviaQuestion } from "@/api/types";

function hashText(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getShuffledOptions(question: TriviaQuestion) {
  const options = [...question.options];
  let seed = hashText(`${question.id}:${question.question}:${question.answer}`);
  for (let index = options.length - 1; index > 0; index -= 1) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822519) >>> 0;
    const swapIndex = seed % (index + 1);
    [options[index], options[swapIndex]] = [options[swapIndex], options[index]];
  }
  return options;
}
