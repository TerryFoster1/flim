function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizedOption(value: unknown) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function stableShuffleOptions(options: unknown[], seed: string, answer?: unknown) {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const option of options) {
    const value = normalizedOption(option);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(value);
  }

  const normalizedAnswer = normalizedOption(answer);
  if (normalizedAnswer && !seen.has(normalizedAnswer.toLowerCase())) {
    cleaned.push(normalizedAnswer);
  }

  return cleaned
    .map((option, index) => ({
      option,
      rank: hashString(`${seed}:${index}:${option.toLowerCase()}`),
    }))
    .sort((left, right) => left.rank - right.rank)
    .map((entry) => entry.option);
}
