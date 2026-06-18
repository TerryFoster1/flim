export type TriviaPromptMediaType = "movie" | "tv";

export interface TriviaPromptInput {
  tmdbId: number;
  mediaType: TriviaPromptMediaType;
  title: string;
  year?: string | number | null;
  overview?: string | null;
  genres?: string[];
  cast?: string[];
  crew?: string[];
  runtime?: string | number | null;
  releaseDate?: string | null;
  firstAirDate?: string | null;
  spoilerMode?: boolean;
  questionCount?: number;
  candidateCount?: number;
}

function list(items: string[] | undefined, fallback = "Not supplied") {
  const values = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
  return values.length ? values.slice(0, 16).join(", ") : fallback;
}

export function buildTriviaPrompt(input: TriviaPromptInput) {
  const questionCount = Math.max(25, Math.min(100, Number(input.questionCount || 25)));
  const candidateCount = Math.max(questionCount, Number(input.candidateCount || questionCount + 5));
  const spoilerMode = Boolean(input.spoilerMode);

  return `You are Flim's senior movie and TV trivia writer.

Create premium fan trivia for this title.

Return strict JSON only. No markdown. No commentary.

JSON shape:
{
  "title": string,
  "mediaType": "movie" | "tv",
  "tmdbId": number,
  "spoilerMode": boolean,
  "questions": [
    {
      "question": string,
      "choices": string[],
      "correctAnswer": string,
      "difficulty": "easy" | "medium" | "hard",
      "category": string,
      "explanation": string,
      "spoiler": boolean
    }
  ]
}

Title metadata:
- Title: ${input.title}
- Media type: ${input.mediaType}
- TMDb ID: ${input.tmdbId}
- Year: ${input.year || "Unknown"}
- Release date / first air date: ${input.releaseDate || input.firstAirDate || "Unknown"}
- Runtime: ${input.runtime || "Unknown"}
- Genres: ${list(input.genres)}
- Cast: ${list(input.cast)}
- Crew: ${list(input.crew)}
- Overview: ${input.overview || "No overview supplied."}

Generation rules:
- Generate ${candidateCount} candidate questions so the server can keep the best ${questionCount}.
- Use approximately 10% easy, 55% medium, and 35% hard.
- The first 10 questions must include multiple categories and should lean medium/hard so the pack feels like a real movie-fan challenge immediately.
- Use varied categories such as story, characters, scenes, quotes, locations, production, lore, franchise, soundtrack, awards, continuity, or behind-the-scenes.
- Every question must have exactly four choices.
- Exactly one choice must match correctAnswer exactly.
- Wrong choices must be plausible and not silly.
- Include a concise explanation for every answer.
- Do not duplicate questions.
- Do not duplicate correct answers unless unavoidable.
- Avoid fake facts and obscure claims that are not broadly verifiable.
- Avoid lazy metadata questions.
- Avoid overusing release year, runtime, budget, director, or actor-character lookup questions.
- Avoid synopsis-comprehension questions such as "what kind of viewing experience" or "which description best matches the premise."
- Avoid questions that can be answered from the supplied overview alone.
- Avoid asking five questions in a row about the same character, scene, title beat, or category.
- Trivia must reward knowledge of the movie/show, not merely reading the overview.
- ${spoilerMode ? "Spoilers are allowed when they make the trivia better." : "Avoid spoilers. Set spoiler to false unless a minor spoiler is unavoidable."}
- If the title is part of a franchise, sequel series, reboot, or TV series, include the title/season context inside the question so it stands alone.

Return valid JSON only.`;
}
