import type { MediaType, TriviaQuestion } from "@/api/types";

export const movieTriviaPacks: Array<{
  id: string;
  title: string;
  subtitle: string;
  tmdbId: number;
  mediaType: MediaType;
  questionCount: number;
}> = [
  { id: "back-to-the-future", title: "Back to the Future", subtitle: "Time machines, timelines, and Hill Valley.", tmdbId: 105, mediaType: "movie", questionCount: 40 },
  { id: "jurassic-park", title: "Jurassic Park", subtitle: "Dinosaurs, chaos theory, and Isla Nublar.", tmdbId: 329, mediaType: "movie", questionCount: 40 },
  { id: "terminator-2", title: "Terminator 2: Judgment Day", subtitle: "Skynet, Sarah Connor, and the T-1000.", tmdbId: 280, mediaType: "movie", questionCount: 40 },
  { id: "the-office", title: "The Office", subtitle: "Dunder Mifflin quotes and awkward glory.", tmdbId: 2316, mediaType: "tv", questionCount: 30 }
];

export const quoteQuestions: TriviaQuestion[] = [
  {
    id: "quote-001",
    question: "\"Roads? Where we're going, we don't need roads.\"",
    options: ["Back to the Future", "Ghostbusters", "The Goonies", "Bill & Ted's Excellent Adventure"],
    answer: "Back to the Future",
    difficulty: "medium"
  },
  {
    id: "quote-002",
    question: "\"Life, uh, finds a way.\"",
    options: ["Jurassic Park", "Twister", "The Mummy", "Independence Day"],
    answer: "Jurassic Park",
    difficulty: "easy"
  },
  {
    id: "quote-003",
    question: "\"I'll be back.\"",
    options: ["The Terminator", "Predator", "RoboCop", "Total Recall"],
    answer: "The Terminator",
    difficulty: "easy"
  },
  {
    id: "quote-004",
    question: "\"May the Force be with you.\"",
    options: ["Star Wars", "Dune", "Star Trek", "Guardians of the Galaxy"],
    answer: "Star Wars",
    difficulty: "easy"
  },
  {
    id: "quote-005",
    question: "\"Why so serious?\"",
    options: ["The Dark Knight", "Joker", "Batman Begins", "Watchmen"],
    answer: "The Dark Knight",
    difficulty: "medium"
  }
];

export const challengeQuestions: TriviaQuestion[] = [
  {
    id: "challenge-001",
    question: "In Back to the Future, what speed must the DeLorean reach to travel through time?",
    options: ["88 mph", "55 mph", "99 mph", "121 mph"],
    answer: "88 mph",
    difficulty: "easy"
  },
  {
    id: "challenge-002",
    question: "In Jurassic Park, what kind of dinosaur stalks the children in the kitchen?",
    options: ["Velociraptors", "Dilophosaurus", "Tyrannosaurus rex", "Brachiosaurus"],
    answer: "Velociraptors",
    difficulty: "medium"
  },
  {
    id: "challenge-003",
    question: "In The Terminator, what is Sarah Connor's son's name?",
    options: ["John", "Kyle", "Miles", "Danny"],
    answer: "John",
    difficulty: "easy"
  },
  {
    id: "challenge-004",
    question: "In Raiders of the Lost Ark, what animal is Indiana Jones famously afraid of?",
    options: ["Snakes", "Spiders", "Rats", "Bats"],
    answer: "Snakes",
    difficulty: "easy"
  },
  {
    id: "challenge-005",
    question: "In Star Wars, what is the name of Han Solo's ship?",
    options: ["Millennium Falcon", "X-wing", "Tantive IV", "Slave I"],
    answer: "Millennium Falcon",
    difficulty: "easy"
  }
];

export const posterRevealRounds = [
  {
    id: "poster-back-to-the-future",
    title: "Back to the Future",
    year: "1985",
    imageUrl: "https://image.tmdb.org/t/p/w780/fNOH9f1aA7XRTzl1sAOx9iF553Q.jpg",
    options: ["Back to the Future", "The Goonies", "Ghostbusters", "WarGames"]
  },
  {
    id: "poster-jurassic-park",
    title: "Jurassic Park",
    year: "1993",
    imageUrl: "https://image.tmdb.org/t/p/w780/9i3plLl89DHMz7mahksDaAo7HIS.jpg",
    options: ["Jurassic Park", "The Lost World", "King Kong", "Congo"]
  },
  {
    id: "poster-terminator-2",
    title: "Terminator 2: Judgment Day",
    year: "1991",
    imageUrl: "https://image.tmdb.org/t/p/w780/5M0j0B18abtBI5gi2RhfjjurTqb.jpg",
    options: ["Terminator 2: Judgment Day", "RoboCop", "Total Recall", "Predator 2"]
  }
];
