import { ensureCollectionChallengeTables } from "./_challenges.js";
import { awardTickets } from "./_arcadeEconomy.js";
import { stableShuffleOptions } from "./_answerOptions.js";
import { ensureNotificationsTable, ensureTriviaTables } from "./_db.js";

type SeasonalStatus = "upcoming" | "active" | "ended";
type ChallengeType = "weekly" | "monthly" | "seasonal" | "special_event";

interface SeasonalRequirement {
  type: "movies_watched" | "tv_episodes_watched" | "collection_progress" | "trivia_completed" | "easter_eggs_completed" | "challenge_completed";
  label: string;
  target: number;
  genre?: string;
  collectionSlug?: string;
  challengeId?: string;
}

function currentChallengeWeekId(date = new Date()) {
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = weekStart.getUTCDay();
  weekStart.setUTCDate(weekStart.getUTCDate() - day);
  return weekStart.toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FEATURED_CHALLENGE_EPOCH = Date.UTC(2026, 0, 5);
const PUBLIC_SEASONAL_FEED_CACHE_MS = 15 * 60_000;
let seasonalChallengeEnsurePromise: Promise<void> | null = null;
let seasonalChallengeEnsureComplete = false;
let publicSeasonalFeedCache: { expiresAt: number; value: any } | null = null;

function challengeCadenceDays(eligiblePackCount: number) {
  const configured = String(process.env.FLIM_ARCADE_CHALLENGE_CADENCE || "").trim().toLowerCase();
  if (configured === "weekly") return 7;
  if (configured === "biweekly" || configured === "bi-weekly") return 14;
  return eligiblePackCount >= 52 ? 7 : 14;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function scheduledWindowStatus(startAt: Date, endAt: Date, now = new Date()) {
  if (now < startAt) return "upcoming";
  if (now >= endAt) return "completed";
  return "active";
}

const defaultEvents = [
  {
    slug: "halloween-horror-2026",
    seasonKey: "halloween",
    name: "Halloween Horror Challenge",
    description: "Watch horror picks, answer trivia, and hunt for spooky details before Halloween ends.",
    startDate: "2026-09-15",
    endDate: "2026-10-31",
    badge: "Halloween Horror Hunter 2026",
    banner: "horror",
    challengeType: "seasonal",
    isFeatured: false,
    questionCount: 10,
    difficulty: "medium",
    points: 100,
    requirements: [
      { type: "movies_watched", label: "Watch 5 horror movies", target: 5, genre: "Horror" },
      { type: "trivia_completed", label: "Complete 10 horror trivia questions", target: 10, genre: "Horror" },
      { type: "easter_eggs_completed", label: "Find 3 horror Easter Eggs", target: 3, genre: "Horror" },
    ],
  },
  {
    slug: "christmas-movie-2026",
    seasonKey: "christmas",
    name: "Christmas Movie Challenge",
    description: "Build a holiday movie streak and earn a seasonal badge.",
    startDate: "2026-11-15",
    endDate: "2026-12-31",
    badge: "Christmas Movie Marathoner 2026",
    banner: "holiday",
    challengeType: "seasonal",
    isFeatured: false,
    questionCount: 10,
    difficulty: "easy",
    points: 80,
    requirements: [
      { type: "movies_watched", label: "Watch 5 Christmas or family movies", target: 5, genre: "Family" },
      { type: "trivia_completed", label: "Complete 5 holiday trivia questions", target: 5 },
    ],
  },
  {
    slug: "summer-blockbuster-2026",
    seasonKey: "summer_blockbusters",
    name: "Summer Blockbuster Challenge",
    description: "Finish action, adventure, and franchise movie goals during blockbuster season.",
    startDate: "2026-05-15",
    endDate: "2026-08-31",
    badge: "Summer Blockbuster Champion 2026",
    banner: "blockbuster",
    challengeType: "seasonal",
    isFeatured: true,
    questionCount: 75,
    difficulty: "medium",
    points: 250,
    requirements: [
      { type: "movies_watched", label: "Watch 8 action or adventure movies", target: 8, genre: "Action" },
      { type: "challenge_completed", label: "Complete 1 collection challenge", target: 1 },
    ],
  },
  {
    slug: "out-of-this-world",
    seasonKey: "space_movies",
    name: "Out of This World",
    description: "A 100-question space movie gauntlet covering sci-fi classics, alien encounters, cosmic survival, and galaxy-sized adventures.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Space Cadet",
    banner: "space",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 100,
    difficulty: "hard",
    points: 300,
    requirements: [
      { type: "trivia_completed", label: "Complete the Out of This World challenge", target: 100, genre: "Sci-Fi" },
    ],
  },
  {
    slug: "time-travel-challenge",
    seasonKey: "time_travel",
    name: "Time Travel Challenge",
    description: "A 100-question movie challenge about paradoxes, loops, alternate timelines, and clock-bending adventures.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Time Traveler",
    banner: "time travel",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 100,
    difficulty: "hard",
    points: 300,
    requirements: [
      { type: "trivia_completed", label: "Complete the Time Travel Challenge", target: 100, genre: "Sci-Fi" },
    ],
  },
  {
    slug: "adventure-pack",
    seasonKey: "adventure",
    name: "Adventure Pack",
    description: "A 100-question expedition through treasure hunts, lost worlds, cursed artifacts, pirates, quests, and big-screen adventure.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Explorer",
    banner: "adventure",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 100,
    difficulty: "medium",
    points: 300,
    requirements: [
      { type: "trivia_completed", label: "Complete the Adventure Pack", target: 100, genre: "Adventure" },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    seasonKey: "disney_animation",
    name: "Ultimate Disney Animation Challenge",
    description: "A big-screen animation challenge covering princesses, villains, sidekicks, songs, quests, and Disney classics.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Animation Royalty",
    banner: "disney animation",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 50,
    difficulty: "medium",
    points: 250,
    requirements: [
      { type: "trivia_completed", label: "Complete the Ultimate Disney Animation Challenge", target: 50, genre: "Animation" },
    ],
  },
  {
    slug: "ultimate-simpsons-challenge",
    seasonKey: "simpsons",
    name: "Ultimate Simpsons Challenge",
    description: "Springfield trivia for fans of the family, the town, the running jokes, the movie, and the classic characters.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Springfield Legend",
    banner: "simpsons",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 50,
    difficulty: "medium",
    points: 250,
    requirements: [
      { type: "trivia_completed", label: "Complete the Ultimate Simpsons Challenge", target: 50 },
    ],
  },
  {
    slug: "christmas-collection",
    seasonKey: "christmas_movies",
    name: "Christmas Collection",
    description: "A 100-question holiday movie challenge covering Christmas classics, family chaos, festive romances, Santa stories, snowbound adventures, and seasonal mischief.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Holiday Movie Legend",
    banner: "christmas",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 100,
    difficulty: "medium",
    points: 300,
    requirements: [
      { type: "trivia_completed", label: "Complete the Christmas Collection", target: 100 },
    ],
  },
  {
    slug: "summer-collection",
    seasonKey: "summer_movies",
    name: "Summer Collection",
    description: "A 100-question summer movie challenge covering beach towns, sharks, baseball diamonds, road trips, camps, vacations, and warm-weather movie memories.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Summer Movie Legend",
    banner: "summer",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 100,
    difficulty: "medium",
    points: 300,
    requirements: [
      { type: "trivia_completed", label: "Complete the Summer Collection", target: 100 },
    ],
  },
  {
    slug: "movie-quote-challenge",
    seasonKey: "movie_quotes",
    name: "Movie Quote Challenge",
    description: "Match the famous line to the movie in this fast, fan-friendly quote round.",
    startDate: "2026-01-01",
    endDate: "2035-12-31",
    badge: "Quote Master",
    banner: "movie quotes",
    challengeType: "special_event",
    isFeatured: true,
    questionCount: 50,
    difficulty: "medium",
    points: 250,
    requirements: [
      { type: "trivia_completed", label: "Complete the Movie Quote Challenge", target: 50 },
    ],
  },
  {
    slug: "oscar-challenge-2026",
    seasonKey: "oscars",
    name: "Oscar Challenge",
    description: "Watch award-season films and complete companion trivia.",
    startDate: "2026-01-15",
    endDate: "2026-03-31",
    badge: "Oscar Expert 2026",
    banner: "awards",
    challengeType: "special_event",
    isFeatured: false,
    questionCount: 10,
    difficulty: "medium",
    points: 90,
    requirements: [
      { type: "movies_watched", label: "Watch 6 drama movies", target: 6, genre: "Drama" },
      { type: "trivia_completed", label: "Complete 10 trivia questions", target: 10 },
    ],
  },
];

const challengeCatalogueBacklog = [
  ["jurassic-ultimate-challenge", "Jurassic Ultimate Challenge", "Dinosaurs, scientists, islands, parks, rescues, and franchise survival moments.", "Raptor Trainer", "jurassic", "hard", "Jurassic"],
  ["office-quote-challenge", "Office Quote Challenge", "A quote-first challenge for Dunder Mifflin fans and workplace comedy regulars.", "Regional Manager", "office", "medium", "Comedy"],
  ["wizard-school-challenge", "Wizard School Challenge", "Spells, houses, magical objects, teachers, creatures, and school-year adventures.", "Wizard Graduate", "wizard school", "medium", "Fantasy"],
  ["superhero-showdown", "Superhero Showdown", "Secret identities, origin stories, team-ups, villains, gadgets, and heroic choices.", "Cape Collector", "superhero", "medium", "Action"],
  ["animated-classics-challenge", "Animated Classics Challenge", "Hand-drawn favorites, modern animation, sidekicks, songs, families, and villains.", "Animation Royalty", "animation", "medium", "Animation"],
  ["eighties-movie-challenge", "80s Movie Challenge", "Teen classics, action icons, creature features, fantasy quests, and neon-era favorites.", "80s Rewinder", "80s", "medium", "Movies"],
  ["nineties-blockbusters", "90s Blockbusters", "Disaster films, action sequels, creature hits, romances, animation, and VHS-era giants.", "90s Headliner", "90s", "medium", "Movies"],
  ["two-thousands-comfort-movies", "2000s Comfort Movies", "Cozy rewatches, comedies, fantasy sagas, romances, and crowd-pleasing favorites.", "Comfort Rewatcher", "2000s", "easy", "Movies"],
  ["horror-icons-challenge", "Horror Icons Challenge", "Classic monsters, modern nightmares, haunted houses, final girls, and genre legends.", "Midnight Screamer", "horror", "hard", "Horror"],
  ["slasher-survival-challenge", "Slasher Survival Challenge", "Masks, survivors, rules, weapons, sequels, and the choices that keep characters alive.", "Final Girl", "slasher", "hard", "Horror"],
  ["sci-fi-legends-challenge", "Sci-Fi Legends Challenge", "Robots, aliens, futures, space travel, dystopias, and landmark science fiction.", "Sci-Fi Legend", "sci-fi", "hard", "Sci-Fi"],
  ["fantasy-quest-challenge", "Fantasy Quest Challenge", "Chosen ones, enchanted objects, kingdoms, monsters, prophecies, and epic journeys.", "Quest Keeper", "fantasy", "medium", "Fantasy"],
  ["natural-disaster-challenge", "Natural Disaster Challenge", "Tornadoes, earthquakes, tsunamis, volcanoes, storms, meteors, survival crews, and end-of-the-world rescue missions.", "Storm Survivor", "natural-disaster", "medium", "Disaster"],
  ["comedy-challenge", "Comedy Challenge", "Big laughs, iconic bits, oddball heroes, chaotic road trips, workplace disasters, buddy comedies, and cult favorite punchlines.", "Comedy Legend", "comedy", "medium", "Comedy"],
  ["anime-challenge", "Anime Challenge", "Studio classics, shonen battles, fantasy worlds, cyberpunk cities, quiet coming-of-age stories, and landmark anime films.", "Anime Archivist", "anime", "medium", "Anime"],
  ["rom-com-challenge", "Rom-Com Challenge", "Meet-cutes, fake dating, grand gestures, best friends, breakups, and happy endings.", "Meet Cute Master", "rom-com", "easy", "Romance"],
  ["action-heroes-challenge", "Action Heroes Challenge", "One-liners, chases, rescues, revenge missions, stunts, and impossible odds.", "Action Hero", "action", "medium", "Action"],
  ["movie-villains-challenge", "Movie Villains Challenge", "Memorable schemes, lairs, henchmen, motives, final showdowns, and iconic bad guys.", "Villain Wrangler", "villains", "medium", "Movies"],
  ["disney-pixar-challenge", "Disney/Pixar Challenge", "Toys, monsters, emotions, families, journeys, friendships, and animated tearjerkers.", "Story Spark", "pixar", "medium", "Animation"],
  ["star-wars-timeline-challenge", "Star Wars Timeline Challenge", "Planets, Jedi, Sith, ships, battles, family reveals, and galaxy-spanning chronology.", "Holocron Keeper", "star wars", "hard", "Sci-Fi"],
  ["marvel-universe-challenge", "Marvel Universe Challenge", "Heroes, stones, teams, villains, multiverse turns, and cinematic universe lore.", "True Believer", "marvel", "hard", "Superhero"],
  ["dc-heroes-challenge", "DC Heroes Challenge", "Gotham, Metropolis, heroes, rogues, origins, teams, and comic-book movie moments.", "Justice League Recruit", "dc", "medium", "Superhero"],
  ["lord-of-the-rings-challenge", "Lord of the Rings Challenge", "Rings, realms, fellowships, battles, creatures, prophecies, and Middle-earth lore.", "Ring Bearer", "middle earth", "hard", "Fantasy"],
  ["harry-potter-challenge", "Harry Potter Challenge", "Hogwarts, spells, houses, horcruxes, professors, creatures, and wizarding world lore.", "Wizard Graduate", "harry potter", "hard", "Fantasy"],
  ["mission-impossible-challenge", "Mission: Impossible Challenge", "Masks, missions, betrayals, stunts, gadgets, and Ethan Hunt's impossible choices.", "IMF Agent", "mission impossible", "medium", "Action"],
  ["james-bond-challenge", "James Bond Challenge", "Agents, villains, gadgets, cars, missions, allies, lairs, and spy-film traditions.", "Double-O Agent", "james bond", "medium", "Action"],
  ["tom-hanks-collection", "Tom Hanks Collection", "Beloved dramas, comedies, survival stories, animated favorites, and everyman heroes.", "America's Co-Star", "tom hanks", "medium", "Actor"],
  ["keanu-reeves-collection", "Keanu Reeves Collection", "Chosen ones, assassins, surfers, time travelers, hackers, and kind-hearted icons.", "Whoa Master", "keanu reeves", "medium", "Actor"],
  ["jim-carrey-collection", "Jim Carrey Collection", "Rubber-faced comedy, heartfelt turns, comic chaos, masks, detectives, and oddball heroes.", "Comedy Dynamo", "jim carrey", "easy", "Actor"],
  ["zombie-collection", "Zombie Collection", "Outbreaks, survival crews, malls, fast zombies, slow zombies, and apocalypse rules.", "Undead Survivor", "zombie", "medium", "Horror"],
  ["heist-crew-challenge", "Heist Crew Challenge", "Crews, cons, vaults, double-crosses, getaways, plans, and cinematic thieves.", "Mastermind", "heist", "medium", "Crime"],
].map(([slug, name, description, badge, banner, difficulty, genre]) => ({
  slug,
  seasonKey: String(slug).replace(/-/g, "_"),
  name,
  description,
  startDate: "2026-01-01",
  endDate: "2035-12-31",
  badge,
  banner,
  challengeType: "special_event",
  isFeatured: false,
  questionCount: 100,
  difficulty,
  points: 300,
  requirements: [
    { type: "trivia_completed", label: `Complete ${name}`, target: 100, genre },
  ],
}));

const fallbackChallengeTargets: Record<string, Array<{ mediaType: "movie" | "tv"; tmdbId: number }>> = {
  summer_blockbusters: [
    { mediaType: "movie", tmdbId: 11 },
    { mediaType: "movie", tmdbId: 105 },
    { mediaType: "movie", tmdbId: 329 },
    { mediaType: "movie", tmdbId: 85 },
    { mediaType: "movie", tmdbId: 603 },
  ],
  halloween: [
    { mediaType: "movie", tmdbId: 694 },
    { mediaType: "movie", tmdbId: 348 },
    { mediaType: "movie", tmdbId: 1091 },
    { mediaType: "movie", tmdbId: 138843 },
  ],
  christmas: [
    { mediaType: "movie", tmdbId: 771 },
    { mediaType: "movie", tmdbId: 772 },
    { mediaType: "movie", tmdbId: 1585 },
  ],
  oscars: [
    { mediaType: "movie", tmdbId: 13 },
    { mediaType: "movie", tmdbId: 238 },
    { mediaType: "movie", tmdbId: 11216 },
  ],
};

type EvergreenDifficulty = "easy" | "medium" | "hard" | "expert";

interface EvergreenQuestionSeed {
  slug: string;
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  category: string;
  difficulty: EvergreenDifficulty;
  question: string;
  answer: string;
  options: string[];
  explanation: string;
}

function q(
  slug: string,
  title: string,
  tmdbId: number,
  category: string,
  difficulty: EvergreenDifficulty,
  question: string,
  answer: string,
  wrong: string[],
  explanation = "",
): EvergreenQuestionSeed {
  return qFor(slug, title, tmdbId, "movie", category, difficulty, question, answer, wrong, explanation);
}

function qFor(
  slug: string,
  title: string,
  tmdbId: number,
  mediaType: "movie" | "tv",
  category: string,
  difficulty: EvergreenDifficulty,
  question: string,
  answer: string,
  wrong: string[],
  explanation = "",
): EvergreenQuestionSeed {
  const options = stableShuffleOptions([answer, ...wrong].slice(0, 4), `${slug}:${title}:${question}`, answer);
  return {
    slug,
    title,
    tmdbId,
    mediaType,
    category,
    difficulty,
    question,
    answer,
    options,
    explanation: explanation || `${title} is part of this evergreen challenge pack.`,
  };
}

const evergreenChallengeQuestions: EvergreenQuestionSeed[] = [
  q("out-of-this-world", "Star Wars", 11, "story", "easy", "In Star Wars, what desert planet is Luke Skywalker raised on?", "Tatooine", ["Hoth", "Naboo", "Coruscant"], "Luke begins the original film living with his aunt and uncle on Tatooine."),
  q("out-of-this-world", "Star Wars", 11, "characters", "easy", "In Star Wars, who pilots the Millennium Falcon alongside Chewbacca?", "Han Solo", ["Luke Skywalker", "Wedge Antilles", "Lando Calrissian"], "Han Solo is introduced as the Falcon's captain."),
  q("out-of-this-world", "Star Wars", 11, "lore", "medium", "In Star Wars, what weapon destroys Alderaan?", "The Death Star", ["A Star Destroyer", "The Executor", "A TIE Bomber"], "The Empire demonstrates the Death Star's power on Alderaan."),
  q("out-of-this-world", "Star Wars", 11, "scene", "medium", "In Star Wars, what vulnerability is targeted during the final trench run?", "An exhaust port", ["A shield generator", "A docking bay", "A command bridge"], "The Rebel plan depends on hitting a small thermal exhaust port."),
  q("out-of-this-world", "Star Wars", 11, "characters", "easy", "In Star Wars, who tells Luke to use the Force during the Death Star attack?", "Obi-Wan Kenobi", ["Yoda", "Leia Organa", "Darth Vader"], "Luke hears Obi-Wan's voice guiding him."),
  q("out-of-this-world", "Star Wars", 11, "object", "easy", "In Star Wars, what message is hidden inside R2-D2?", "Princess Leia's plea for help", ["A bounty notice", "A Rebel payroll list", "A Jedi census"], "Leia records a message asking Obi-Wan for help."),
  q("out-of-this-world", "Star Wars", 11, "villain", "medium", "In Star Wars, who commands the Death Star?", "Grand Moff Tarkin", ["Admiral Ackbar", "General Veers", "Bail Organa"], "Tarkin oversees the battle station."),
  q("out-of-this-world", "Star Wars", 11, "setting", "medium", "In Star Wars, where does Luke first meet Han Solo?", "Mos Eisley Cantina", ["Yavin 4", "Cloud City", "Jabba's Palace"], "Obi-Wan and Luke find Han in Mos Eisley."),
  q("out-of-this-world", "Star Wars", 11, "story", "hard", "In Star Wars, what call sign does Luke use during the Death Star assault?", "Red Five", ["Gold Leader", "Blue One", "Rogue Two"], "Luke flies as Red Five in the Rebel attack."),
  q("out-of-this-world", "Star Wars", 11, "characters", "hard", "In Star Wars, who saves Luke by knocking Darth Vader's fighter off course?", "Han Solo", ["Biggs Darklighter", "Wedge Antilles", "C-3PO"], "Han returns in the Falcon at the crucial moment."),

  q("out-of-this-world", "Alien", 348, "setting", "easy", "In Alien, what is the name of the commercial towing ship?", "Nostromo", ["Sulaco", "Discovery One", "Endurance"], "The Nostromo crew investigates the distress signal."),
  q("out-of-this-world", "Alien", 348, "creature", "easy", "In Alien, what emerges from Kane during dinner?", "A chestburster", ["A facehugger", "A queen", "An android"], "The chestburster scene is one of Alien's defining moments."),
  q("out-of-this-world", "Alien", 348, "characters", "medium", "In Alien, which crew member is revealed to be an android?", "Ash", ["Dallas", "Parker", "Lambert"], "Ash secretly protects the company's interest in the alien."),
  q("out-of-this-world", "Alien", 348, "story", "medium", "In Alien, what does the company consider the alien specimen?", "Priority one", ["A navigational hazard", "A rescue target", "A fuel source"], "The company's order values the organism over the crew."),
  q("out-of-this-world", "Alien", 348, "setting", "easy", "In Alien, where does the crew first encounter the alien eggs?", "An alien derelict ship", ["A mining colony", "A prison planet", "A military lab"], "The eggs are found inside a strange derelict vessel."),
  q("out-of-this-world", "Alien", 348, "characters", "easy", "In Alien, who is the final surviving crew member?", "Ellen Ripley", ["Lambert", "Dallas", "Parker"], "Ripley escapes aboard the shuttle Narcissus."),
  q("out-of-this-world", "Alien", 348, "creature", "medium", "In Alien, what attaches itself to Kane's face?", "A facehugger", ["A chestburster", "A queen alien", "A synthetic parasite"], "The facehugger implants the embryo."),
  q("out-of-this-world", "Alien", 348, "object", "medium", "In Alien, what is the ship's computer commonly called?", "Mother", ["Father", "Bishop", "MU/TH/UR"], "The crew refers to the computer as Mother."),
  q("out-of-this-world", "Alien", 348, "theme", "hard", "In Alien, which character insists on letting Kane back aboard despite quarantine concerns?", "Ash", ["Ripley", "Parker", "Brett"], "Ash overrides Ripley's quarantine objection."),
  q("out-of-this-world", "Alien", 348, "scene", "hard", "In Alien, where does Ripley find Jones the cat near the end?", "In a carrier", ["In an air duct", "In the reactor room", "In the medical bay"], "Ripley retrieves Jones before escaping."),

  q("out-of-this-world", "Aliens", 679, "setting", "easy", "In Aliens, what colony has gone silent?", "Hadley's Hope", ["LV-426 Station", "Acheron City", "Gateway Colony"], "The Marines are sent to investigate Hadley's Hope."),
  q("out-of-this-world", "Aliens", 679, "characters", "easy", "In Aliens, what is the young survivor's nickname?", "Newt", ["Bishop", "Ripley", "Vasquez"], "Rebecca Jorden is known as Newt."),
  q("out-of-this-world", "Aliens", 679, "creature", "medium", "In Aliens, what larger alien does Ripley battle in the finale?", "The Queen", ["The Runner", "The Crusher", "The Praetorian"], "Ripley fights the Queen using a power loader."),
  q("out-of-this-world", "Aliens", 679, "quote", "easy", "In Aliens, who famously says, 'Game over, man'?", "Hudson", ["Hicks", "Bishop", "Gorman"], "Hudson panics after the Marines are stranded."),
  q("out-of-this-world", "Aliens", 679, "object", "medium", "In Aliens, what machine does Ripley use against the Queen?", "A power loader", ["A dropship", "A pulse rifle", "A sentry gun"], "Ripley steps into a power loader for the fight."),
  q("out-of-this-world", "Aliens", 679, "characters", "medium", "In Aliens, which synthetic helps the survivors?", "Bishop", ["Ash", "David", "Walter"], "Bishop is the mission's android."),
  q("out-of-this-world", "Aliens", 679, "story", "hard", "In Aliens, who tries to smuggle alien embryos back for company research?", "Burke", ["Hicks", "Apone", "Frost"], "Burke's corporate agenda endangers the group."),
  q("out-of-this-world", "Aliens", 679, "setting", "hard", "In Aliens, what threatens to explode after damage to the colony complex?", "The atmosphere processor", ["The medical bay", "The hangar doors", "The cryo chamber"], "The atmosphere processor meltdown sets the final deadline."),
  q("out-of-this-world", "Aliens", 679, "characters", "easy", "In Aliens, which Marine is known for her toughness and heavy weapon confidence?", "Vasquez", ["Ferro", "Dietrich", "Spunkmeyer"], "Vasquez is one of the squad's standout Marines."),
  q("out-of-this-world", "Aliens", 679, "relationship", "medium", "In Aliens, Ripley's bond with Newt most strongly echoes what role?", "A protective mother", ["A corporate rival", "A drill instructor", "A courtroom witness"], "The film frames Ripley as Newt's protector."),

  q("out-of-this-world", "The Martian", 286217, "story", "easy", "In The Martian, which astronaut is stranded on Mars?", "Mark Watney", ["Rick Martinez", "Teddy Sanders", "Mitch Henderson"], "Watney is left behind after the crew believes he died."),
  q("out-of-this-world", "The Martian", 286217, "survival", "easy", "In The Martian, what food does Mark Watney famously grow?", "Potatoes", ["Corn", "Tomatoes", "Soybeans"], "Watney uses botany and crew supplies to grow potatoes."),
  q("out-of-this-world", "The Martian", 286217, "profession", "medium", "In The Martian, what is Mark Watney's scientific specialty?", "Botany", ["Geology", "Astrophysics", "Meteorology"], "Watney's botany skills are essential to survival."),
  q("out-of-this-world", "The Martian", 286217, "object", "medium", "In The Martian, what old probe helps NASA communicate with Watney?", "Pathfinder", ["Voyager", "Cassini", "Hubble"], "Watney digs up Pathfinder to re-establish contact."),
  q("out-of-this-world", "The Martian", 286217, "setting", "easy", "In The Martian, what planet is the main survival story set on?", "Mars", ["Venus", "Europa", "Titan"], "Watney survives alone on Mars."),
  q("out-of-this-world", "The Martian", 286217, "story", "hard", "In The Martian, what mission originally leaves Watney behind?", "Ares III", ["Ares I", "Hermes IV", "Odyssey II"], "Watney is part of the Ares III crew."),
  q("out-of-this-world", "The Martian", 286217, "characters", "medium", "In The Martian, who commands the Hermes crew?", "Melissa Lewis", ["Beth Johanssen", "Annie Montrose", "Mindy Park"], "Commander Lewis leads the mission crew."),
  q("out-of-this-world", "The Martian", 286217, "science", "medium", "In The Martian, why is Watney's water-making plan dangerous?", "It involves hydrogen combustion", ["It freezes instantly", "It attracts dust storms", "It disables the rover"], "Watney creates water through a risky chemical process."),
  q("out-of-this-world", "The Martian", 286217, "story", "hard", "In The Martian, what vehicle must Watney reach for rescue?", "The Ares IV MAV", ["The Hermes lander", "The Pathfinder rover", "The Sojourner probe"], "He travels to the Ares IV MAV launch site."),
  q("out-of-this-world", "The Martian", 286217, "tone", "easy", "In The Martian, what helps Watney stay psychologically grounded?", "Humor and problem-solving", ["A villain's threats", "Telepathic messages", "A mystery creature"], "The film emphasizes resilience, humor, and practical problem-solving."),

  q("out-of-this-world", "Interstellar", 157336, "story", "easy", "In Interstellar, what crop is still widely farmed on Earth?", "Corn", ["Rice", "Wheat", "Potatoes"], "Cooper's family farm grows corn."),
  q("out-of-this-world", "Interstellar", 157336, "characters", "easy", "In Interstellar, what is Cooper's daughter's name?", "Murph", ["Brand", "Lois", "Case"], "Murph is central to the film's emotional story."),
  q("out-of-this-world", "Interstellar", 157336, "concept", "medium", "In Interstellar, what near Saturn enables travel to another galaxy?", "A wormhole", ["A black box", "A Dyson sphere", "A stargate built by NASA"], "The wormhole is discovered near Saturn."),
  q("out-of-this-world", "Interstellar", 157336, "science", "medium", "In Interstellar, what is the name of the massive black hole?", "Gargantua", ["Endurance", "Lazarus", "Mann"], "Gargantua creates extreme gravity effects."),
  q("out-of-this-world", "Interstellar", 157336, "scene", "hard", "In Interstellar, why is Miller's planet so costly to visit?", "Time passes much faster there", ["It has no atmosphere", "It is covered in fire", "It is outside the galaxy"], "Gravity near Gargantua creates severe time dilation."),
  q("out-of-this-world", "Interstellar", 157336, "ship", "medium", "In Interstellar, what is the main spacecraft called?", "Endurance", ["Hermes", "Nostromo", "Discovery One"], "The Endurance carries the crew through the wormhole."),
  q("out-of-this-world", "Interstellar", 157336, "characters", "hard", "In Interstellar, which stranded scientist lies about his planet's viability?", "Dr. Mann", ["Dr. Brand", "Doyle", "Romilly"], "Dr. Mann falsifies data to be rescued."),
  q("out-of-this-world", "Interstellar", 157336, "object", "easy", "In Interstellar, what item links Cooper and Murph across time?", "A watch", ["A compass", "A baseball", "A wedding ring"], "The watch becomes part of the gravity-message solution."),
  q("out-of-this-world", "Interstellar", 157336, "robot", "medium", "In Interstellar, which rectangular robot assists the crew?", "TARS", ["HAL", "Bishop", "KITT"], "TARS is one of the film's memorable robot companions."),
  q("out-of-this-world", "Interstellar", 157336, "theme", "hard", "In Interstellar, what force does Brand argue can transcend dimensions?", "Love", ["Sound", "Radiation", "Magnetism"], "Brand's speech connects love to the film's emotional logic."),

  q("out-of-this-world", "Arrival", 329865, "language", "easy", "In Arrival, what is Louise Banks' profession?", "Linguist", ["Astronaut", "Pilot", "Biologist"], "Louise is recruited because of her language expertise."),
  q("out-of-this-world", "Arrival", 329865, "creature", "medium", "In Arrival, what are the aliens commonly called?", "Heptapods", ["Xenomorphs", "Na'vi", "Ewoks"], "The seven-limbed visitors are called heptapods."),
  q("out-of-this-world", "Arrival", 329865, "language", "medium", "In Arrival, what shape are the alien written symbols?", "Circular logograms", ["Straight binary lines", "Triangular runes", "Glowing numbers"], "The heptapods communicate through circular ink-like symbols."),
  q("out-of-this-world", "Arrival", 329865, "story", "hard", "In Arrival, what changes as Louise learns the alien language?", "Her perception of time", ["Her physical age", "Her voice", "Her nationality"], "The language reshapes how Louise experiences time."),
  q("out-of-this-world", "Arrival", 329865, "setting", "easy", "In Arrival, where do the alien craft hover?", "Above locations around Earth", ["Inside the Moon", "Under the ocean only", "Inside a city dome"], "Multiple ships appear across the world."),
  q("out-of-this-world", "Arrival", 329865, "characters", "medium", "In Arrival, who works with Louise as a physicist?", "Ian Donnelly", ["Colonel Weber", "Agent Halpern", "General Shang"], "Ian partners with Louise on the translation effort."),
  q("out-of-this-world", "Arrival", 329865, "theme", "hard", "In Arrival, what is the aliens' gift to humanity?", "Their language", ["A weapon", "A star map", "A cure-all machine"], "The language allows a different relationship with time."),
  q("out-of-this-world", "Arrival", 329865, "conflict", "medium", "In Arrival, what threatens global cooperation?", "Fear and military escalation", ["A meteor impact", "A solar flare", "A robot uprising"], "Countries react with suspicion and panic."),
  q("out-of-this-world", "Arrival", 329865, "object", "easy", "In Arrival, what protective gear do Louise and Ian wear inside the craft?", "Hazmat-style suits", ["Space armor", "Diving gear", "Medieval masks"], "They enter the alien vessel in protective suits."),
  q("out-of-this-world", "Arrival", 329865, "ending", "hard", "In Arrival, Louise's visions are revealed to be what?", "Memories of the future", ["Dreams from childhood", "A simulation", "A recording from Ian"], "The film reframes the visions as future memories."),

  q("out-of-this-world", "Dune", 438631, "setting", "easy", "In Dune, what desert planet is central to the story?", "Arrakis", ["Caladan", "Giedi Prime", "Kaitain"], "Arrakis is the source of spice."),
  q("out-of-this-world", "Dune", 438631, "resource", "easy", "In Dune, what valuable substance is harvested on Arrakis?", "Spice", ["Kyber", "Vibranium", "Dilithium"], "Melange, or spice, drives the politics of Arrakis."),
  q("out-of-this-world", "Dune", 438631, "creature", "easy", "In Dune, what giant creatures inhabit the desert?", "Sandworms", ["Rancors", "Xenomorphs", "Kaiju"], "Sandworms are one of Arrakis' defining dangers."),
  q("out-of-this-world", "Dune", 438631, "characters", "medium", "In Dune, what noble house does Paul Atreides belong to?", "House Atreides", ["House Harkonnen", "House Corrino", "House Fenring"], "Paul is heir to House Atreides."),
  q("out-of-this-world", "Dune", 438631, "culture", "medium", "In Dune, what are the desert people of Arrakis called?", "Fremen", ["Sardaukar", "Bene Gesserit", "Mentats"], "The Fremen know how to survive in the deep desert."),
  q("out-of-this-world", "Dune", 438631, "object", "hard", "In Dune, what suit helps conserve body moisture in the desert?", "Stillsuit", ["Cryosuit", "Flight suit", "Pressure armor"], "Stillsuits recycle moisture for survival."),
  q("out-of-this-world", "Dune", 438631, "villain", "medium", "In Dune, which rival house attacks the Atreides?", "House Harkonnen", ["House Vernius", "House Moritani", "House Richese"], "The Harkonnens reclaim Arrakis through betrayal and force."),
  q("out-of-this-world", "Dune", 438631, "power", "hard", "In Dune, what Bene Gesserit ability can compel obedience?", "The Voice", ["The Force", "The Quickening", "The Calling"], "The Voice is a trained method of command."),
  q("out-of-this-world", "Dune", 438631, "story", "medium", "In Dune, why is Arrakis politically important?", "It is the only source of spice", ["It has Earth's last ocean", "It controls time travel", "It is the emperor's birthplace"], "Spice is essential to the empire."),
  q("out-of-this-world", "Dune", 438631, "scene", "hard", "In Dune, what test does the Reverend Mother give Paul?", "The gom jabbar test", ["The spice trial", "The water duel", "The worm ride"], "The gom jabbar tests Paul's control under pain."),

  q("out-of-this-world", "Guardians of the Galaxy", 118340, "team", "easy", "In Guardians of the Galaxy, what is Groot's signature phrase?", "I am Groot", ["We are Venom", "This is the way", "To infinity"], "Groot communicates through variations of the phrase."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "object", "easy", "In Guardians of the Galaxy, what music item is important to Peter Quill?", "A mixtape", ["A vinyl jukebox", "A laser harp", "A radio helmet"], "Quill's Awesome Mix connects him to his mother."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "characters", "medium", "In Guardians of the Galaxy, what nickname does Peter Quill prefer?", "Star-Lord", ["Nova Prime", "Rocket Man", "Space Ace"], "Quill repeatedly tries to make Star-Lord stick."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "team", "medium", "In Guardians of the Galaxy, what kind of creature is Rocket?", "A genetically modified raccoon", ["A wolf", "A fox", "A possum"], "Rocket is often mistaken for other animals."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "villain", "medium", "In Guardians of the Galaxy, who is the main Kree villain?", "Ronan the Accuser", ["Thanos", "Ego", "Yondu"], "Ronan pursues the Orb and attacks Xandar."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "object", "hard", "In Guardians of the Galaxy, what powerful item is inside the Orb?", "An Infinity Stone", ["A Kyber crystal", "A Mother Box", "A Horcrux"], "The Orb contains the Power Stone."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "setting", "easy", "In Guardians of the Galaxy, what prison do the heroes escape from?", "The Kyln", ["Knowhere", "Xandar", "The Raft"], "The team forms during and after the Kyln escape."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "characters", "hard", "In Guardians of the Galaxy, who leads the Ravagers?", "Yondu", ["Drax", "Korath", "Rhomann Dey"], "Yondu raised Peter Quill among the Ravagers."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "scene", "medium", "In Guardians of the Galaxy, what dance move distracts Ronan?", "A dance-off", ["A moonwalk duel", "A tap routine", "A waltz"], "Quill buys time with an absurd dance-off."),
  q("out-of-this-world", "Guardians of the Galaxy", 118340, "relationship", "easy", "In Guardians of the Galaxy, who says 'We are Groot'?", "Groot", ["Rocket", "Gamora", "Drax"], "Groot sacrifices himself to protect the team."),

  q("out-of-this-world", "Apollo 13", 568, "story", "easy", "In Apollo 13, which mission suffers a major in-flight emergency?", "Apollo 13", ["Apollo 11", "Apollo 8", "Gemini 4"], "The film dramatizes the Apollo 13 crisis."),
  q("out-of-this-world", "Apollo 13", 568, "quote", "easy", "In Apollo 13, what phrase reports the mission's emergency?", "Houston, we have a problem", ["Mayday from Mars", "The eagle has fallen", "Failure is optional"], "The line became the film's most famous quote."),
  q("out-of-this-world", "Apollo 13", 568, "characters", "medium", "In Apollo 13, which astronaut is played by Tom Hanks?", "Jim Lovell", ["Jack Swigert", "Fred Haise", "Ken Mattingly"], "Hanks portrays mission commander Jim Lovell."),
  q("out-of-this-world", "Apollo 13", 568, "problem", "medium", "In Apollo 13, what explodes and endangers the mission?", "An oxygen tank", ["A heat shield", "A lunar rover", "A parachute"], "The oxygen tank explosion forces the crew to abandon the Moon landing."),
  q("out-of-this-world", "Apollo 13", 568, "goal", "easy", "In Apollo 13, what becomes the mission's new objective?", "Get the crew home alive", ["Land on Mars", "Repair Hubble", "Build a new capsule"], "The mission shifts from landing to survival."),
  q("out-of-this-world", "Apollo 13", 568, "object", "hard", "In Apollo 13, what must engineers adapt to fix carbon dioxide levels?", "A square filter for a round opening", ["A broken joystick", "A torn spacesuit", "A missing window"], "The ground team builds a makeshift adapter."),
  q("out-of-this-world", "Apollo 13", 568, "characters", "medium", "In Apollo 13, who is grounded before launch because of measles exposure?", "Ken Mattingly", ["Jim Lovell", "Fred Haise", "Jack Swigert"], "Mattingly helps solve problems from the ground."),
  q("out-of-this-world", "Apollo 13", 568, "scene", "hard", "In Apollo 13, what maneuver uses the Moon's gravity to help return home?", "A free-return trajectory", ["A slingshot around Mars", "A solar sail burn", "A docking spin"], "The crew loops around the Moon to head back to Earth."),
  q("out-of-this-world", "Apollo 13", 568, "theme", "medium", "In Apollo 13, what does mission control repeatedly emphasize?", "Solving one problem at a time", ["Ignoring the crew", "Winning a race", "Keeping secrets from NASA"], "The film focuses on disciplined teamwork under pressure."),
  q("out-of-this-world", "Apollo 13", 568, "setting", "easy", "In Apollo 13, where is mission control located?", "Houston", ["Cape Canaveral", "Pasadena", "Washington"], "NASA's mission control is in Houston."),

  q("out-of-this-world", "2001: A Space Odyssey", 62, "computer", "easy", "In 2001: A Space Odyssey, what is the name of the ship's computer?", "HAL 9000", ["TARS", "Mother", "Skynet"], "HAL controls many Discovery One systems."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "object", "medium", "In 2001: A Space Odyssey, what mysterious object appears throughout human history?", "A black monolith", ["A blue cube", "A silver ring", "A golden idol"], "The monolith is tied to leaps in evolution and discovery."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "ship", "medium", "In 2001: A Space Odyssey, what spacecraft travels to Jupiter?", "Discovery One", ["Nostromo", "Endurance", "Hermes"], "Discovery One carries Bowman, Poole, and HAL."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "quote", "easy", "In 2001: A Space Odyssey, what does HAL say when refusing Dave's command?", "I'm sorry, Dave. I'm afraid I can't do that.", ["Use the Force, Dave.", "Game over, Dave.", "There is no spoon, Dave."], "HAL's refusal is one of cinema's famous computer lines."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "scene", "hard", "In 2001: A Space Odyssey, what song does HAL sing as he is deactivated?", "Daisy Bell", ["Blue Danube", "Space Oddity", "Moon River"], "HAL sings Daisy Bell while his functions shut down."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "character", "medium", "In 2001: A Space Odyssey, which astronaut survives the HAL crisis?", "Dave Bowman", ["Frank Poole", "Heywood Floyd", "Victor Kaminski"], "Bowman disconnects HAL and continues the journey."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "opening", "hard", "In 2001: A Space Odyssey, what is the opening prehistoric segment called?", "The Dawn of Man", ["The Jupiter Mission", "Beyond Infinity", "The Moon Watcher"], "The film's opening chapter depicts early humans."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "setting", "medium", "In 2001: A Space Odyssey, where is a monolith found buried near a crater?", "The Moon", ["Mars", "Europa", "Titan"], "A lunar monolith sends a signal toward Jupiter."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "theme", "hard", "In 2001: A Space Odyssey, what transformation closes the film?", "The Star Child", ["The Iron Giant", "The Space Cowboy", "The Sandworm"], "Bowman's journey culminates in the Star Child image."),
  q("out-of-this-world", "2001: A Space Odyssey", 62, "music", "easy", "In 2001: A Space Odyssey, which classical piece famously accompanies spaceflight?", "The Blue Danube", ["Ride of the Valkyries", "O Fortuna", "Bolero"], "The Blue Danube plays over elegant space movement."),
];

evergreenChallengeQuestions.push(
  q("summer-blockbuster-2026", "Jurassic Park", 329, "creature", "easy", "In Jurassic Park, what kind of dinosaur is the park's first major breakout threat?", "T. rex", ["Triceratops", "Stegosaurus", "Brachiosaurus"], "The T. rex escape is one of the definitive blockbuster set pieces."),
  q("summer-blockbuster-2026", "Jurassic Park", 329, "science", "medium", "In Jurassic Park, what is used to fill gaps in dinosaur DNA?", "Frog DNA", ["Bird DNA", "Fish DNA", "Human DNA"], "Frog DNA helps explain the dinosaurs' unexpected breeding."),
  q("summer-blockbuster-2026", "Jurassic Park", 329, "characters", "easy", "In Jurassic Park, which mathematician warns that the park will fail?", "Ian Malcolm", ["Alan Grant", "John Hammond", "Dennis Nedry"], "Malcolm argues from chaos theory."),
  q("summer-blockbuster-2026", "Jurassic Park", 329, "scene", "medium", "In Jurassic Park, what object ripples before the T. rex appears?", "A cup of water", ["A rearview mirror", "A flashlight", "A walkie-talkie"], "The rippling water announces the dinosaur's footsteps."),
  q("summer-blockbuster-2026", "Jurassic Park", 329, "villain", "hard", "In Jurassic Park, who shuts down park systems to steal embryos?", "Dennis Nedry", ["Ray Arnold", "Robert Muldoon", "Donald Gennaro"], "Nedry's sabotage lets the dinosaurs loose."),

  q("summer-blockbuster-2026", "Jaws", 578, "creature", "easy", "In Jaws, what animal terrorizes Amity Island?", "A great white shark", ["An orca", "A giant squid", "A crocodile"], "The shark attacks turn the beach town into a crisis."),
  q("summer-blockbuster-2026", "Jaws", 578, "characters", "easy", "In Jaws, who is Amity's police chief?", "Martin Brody", ["Quint", "Hooper", "Mayor Vaughn"], "Brody pushes to close the beaches."),
  q("summer-blockbuster-2026", "Jaws", 578, "quote", "medium", "In Jaws, what does Brody tell Quint after seeing the shark?", "You're gonna need a bigger boat", ["Smile, you son of a...", "We're all gonna die", "The beach is closed forever"], "The line became a blockbuster staple."),
  q("summer-blockbuster-2026", "Jaws", 578, "setting", "medium", "In Jaws, what holiday weekend raises the stakes for the town?", "Fourth of July", ["Labor Day", "Memorial Day", "Halloween"], "The mayor wants beaches open for tourist season."),
  q("summer-blockbuster-2026", "Jaws", 578, "character", "hard", "In Jaws, which character tells the USS Indianapolis story?", "Quint", ["Hooper", "Brody", "Mayor Vaughn"], "Quint's monologue reveals his trauma and hatred of sharks."),

  q("summer-blockbuster-2026", "Raiders of the Lost Ark", 85, "character", "easy", "In Raiders of the Lost Ark, what animal does Indiana Jones famously fear?", "Snakes", ["Spiders", "Rats", "Bats"], "Indy's fear becomes a major gag in the Well of Souls."),
  q("summer-blockbuster-2026", "Raiders of the Lost Ark", 85, "object", "easy", "In Raiders of the Lost Ark, what biblical artifact is Indiana Jones searching for?", "The Ark of the Covenant", ["The Holy Grail", "The Sankara Stones", "The Crystal Skull"], "The Ark is the film's central artifact."),
  q("summer-blockbuster-2026", "Raiders of the Lost Ark", 85, "opening", "medium", "In Raiders of the Lost Ark, what replaces the golden idol in the opening temple?", "A bag of sand", ["A stone skull", "A whip", "A compass"], "Indy tries to match the idol's weight."),
  q("summer-blockbuster-2026", "Raiders of the Lost Ark", 85, "character", "medium", "In Raiders of the Lost Ark, who is Indy's former romantic partner?", "Marion Ravenwood", ["Elsa Schneider", "Willie Scott", "Irina Spalko"], "Marion is drawn back into Indy's adventure."),
  q("summer-blockbuster-2026", "Raiders of the Lost Ark", 85, "scene", "hard", "In Raiders of the Lost Ark, how does Indy handle the swordsman in Cairo?", "He shoots him", ["He duels with a whip", "He runs away", "He throws the idol"], "The abrupt gag became one of the movie's most famous moments."),

  q("summer-blockbuster-2026", "Mission: Impossible - Fallout", 353081, "stunt", "easy", "In Mission: Impossible - Fallout, what aircraft stunt is heavily featured?", "A helicopter chase", ["A submarine race", "A spacewalk", "A hot-air balloon duel"], "The helicopter sequence anchors the finale."),
  q("summer-blockbuster-2026", "Mission: Impossible - Fallout", 353081, "character", "easy", "In Mission: Impossible - Fallout, who leads the IMF team?", "Ethan Hunt", ["August Walker", "Benji Dunn", "Solomon Lane"], "Ethan Hunt is the series protagonist."),
  q("summer-blockbuster-2026", "Mission: Impossible - Fallout", 353081, "villain", "medium", "In Mission: Impossible - Fallout, which captured villain returns?", "Solomon Lane", ["Owen Davian", "Kurt Hendricks", "Max"], "Lane's return ties Fallout to Rogue Nation."),
  q("summer-blockbuster-2026", "Mission: Impossible - Fallout", 353081, "object", "medium", "In Mission: Impossible - Fallout, what dangerous material drives the plot?", "Plutonium cores", ["A cursed idol", "Alien DNA", "A gold shipment"], "The stolen plutonium creates the nuclear threat."),
  q("summer-blockbuster-2026", "Mission: Impossible - Fallout", 353081, "scene", "hard", "In Mission: Impossible - Fallout, where does Ethan chase Walker across rooftops?", "London", ["Paris", "Berlin", "Rome"], "The London chase includes Cruise's famous ankle-breaking jump."),

  q("summer-blockbuster-2026", "Top Gun: Maverick", 361743, "character", "easy", "In Top Gun: Maverick, what is Pete Mitchell's call sign?", "Maverick", ["Iceman", "Rooster", "Hangman"], "Maverick returns as instructor and pilot."),
  q("summer-blockbuster-2026", "Top Gun: Maverick", 361743, "relationship", "medium", "In Top Gun: Maverick, Rooster is the son of which original Top Gun character?", "Goose", ["Iceman", "Viper", "Slider"], "Rooster carries the emotional legacy of Goose."),
  q("summer-blockbuster-2026", "Top Gun: Maverick", 361743, "mission", "medium", "In Top Gun: Maverick, what kind of target must the pilots destroy?", "An underground uranium facility", ["A submarine base", "A satellite station", "A city bridge"], "The mission requires a dangerous canyon approach."),
  q("summer-blockbuster-2026", "Top Gun: Maverick", 361743, "scene", "hard", "In Top Gun: Maverick, what older aircraft do Maverick and Rooster steal?", "An F-14", ["An F-16", "A MiG-29", "A B-2"], "The F-14 connects the finale to the original film."),
  q("summer-blockbuster-2026", "Top Gun: Maverick", 361743, "theme", "easy", "In Top Gun: Maverick, what does Maverick have to learn to trust?", "His team", ["A robot pilot", "A treasure map", "A weather machine"], "The film builds toward trust between Maverick and the younger pilots."),

  q("summer-blockbuster-2026", "The Dark Knight", 155, "villain", "easy", "In The Dark Knight, who is Batman's main adversary?", "The Joker", ["Bane", "Scarecrow", "Ra's al Ghul"], "The Joker pushes Gotham into chaos."),
  q("summer-blockbuster-2026", "The Dark Knight", 155, "object", "medium", "In The Dark Knight, what does Harvey Dent become known as?", "Two-Face", ["The Riddler", "Black Mask", "Hush"], "Dent's injury and grief transform him into Two-Face."),
  q("summer-blockbuster-2026", "The Dark Knight", 155, "scene", "medium", "In The Dark Knight, what vehicle ejects from the damaged Batmobile?", "The Batpod", ["The Tumbler Bike", "The Batwing", "The Batboat"], "Batman escapes on the Batpod."),
  q("summer-blockbuster-2026", "The Dark Knight", 155, "theme", "hard", "In The Dark Knight, what moral test does the Joker create with two ferries?", "Each ferry can destroy the other", ["Both must race to shore", "One hides Batman", "One carries a bomb robot"], "The ferry sequence tests Gotham's citizens and prisoners."),
  q("summer-blockbuster-2026", "The Dark Knight", 155, "character", "easy", "In The Dark Knight, who is Gotham's district attorney?", "Harvey Dent", ["Jim Gordon", "Lucius Fox", "Alfred Pennyworth"], "Dent is Gotham's public face against crime."),

  q("summer-blockbuster-2026", "Avatar", 19995, "setting", "easy", "In Avatar, what moon is the story set on?", "Pandora", ["Arrakis", "Endor", "Titan"], "Pandora is home to the Na'vi."),
  q("summer-blockbuster-2026", "Avatar", 19995, "people", "easy", "In Avatar, what are Pandora's native people called?", "Na'vi", ["Fremen", "Ewoks", "Kree"], "The Na'vi defend their home from exploitation."),
  q("summer-blockbuster-2026", "Avatar", 19995, "resource", "medium", "In Avatar, what resource motivates the human mining operation?", "Unobtanium", ["Spice", "Vibranium", "Dilithium"], "The humans target a valuable mineral deposit."),
  q("summer-blockbuster-2026", "Avatar", 19995, "character", "medium", "In Avatar, what is Jake Sully's military background?", "Marine", ["Navy pilot", "Air Force general", "Police detective"], "Jake is a former Marine."),
  q("summer-blockbuster-2026", "Avatar", 19995, "creature", "hard", "In Avatar, what flying creature does Jake bond with?", "Ikran", ["Thanator", "Direhorse", "Hammerhead titanothere"], "Bonding with an ikran is part of Jake's Na'vi journey."),

  q("summer-blockbuster-2026", "The Avengers", 24428, "team", "easy", "In The Avengers, which team comes together to defend New York?", "The Avengers", ["The Guardians", "The X-Men", "The Fantastic Four"], "The film unites Marvel's core heroes."),
  q("summer-blockbuster-2026", "The Avengers", 24428, "villain", "easy", "In The Avengers, who leads the invasion of Earth?", "Loki", ["Ultron", "Thanos", "Red Skull"], "Loki brings the Chitauri to New York."),
  q("summer-blockbuster-2026", "The Avengers", 24428, "object", "medium", "In The Avengers, what glowing artifact opens the portal?", "The Tesseract", ["The Orb", "The Eye of Agamotto", "The Casket"], "The Tesseract powers the portal."),
  q("summer-blockbuster-2026", "The Avengers", 24428, "scene", "medium", "In The Avengers, what does Hulk do to Loki after Loki declares himself a god?", "Smashes him repeatedly", ["Shakes his hand", "Throws him into space", "Turns invisible"], "Hulk's quick takedown is a famous gag."),
  q("summer-blockbuster-2026", "The Avengers", 24428, "setting", "hard", "In The Avengers, where is Loki first held aboard the helicarrier?", "A glass containment cell", ["A submarine vault", "A cave", "A courtroom"], "The cell is designed for dangerous prisoners."),

  q("summer-blockbuster-2026", "Pirates of the Caribbean: The Curse of the Black Pearl", 22, "character", "easy", "In The Curse of the Black Pearl, who captains the Black Pearl at the start?", "Barbossa", ["Jack Sparrow", "Will Turner", "Norrington"], "Barbossa commands the cursed crew."),
  q("summer-blockbuster-2026", "Pirates of the Caribbean: The Curse of the Black Pearl", 22, "character", "easy", "In The Curse of the Black Pearl, what is Jack Sparrow trying to reclaim?", "The Black Pearl", ["A royal crown", "A treasure map", "A navy ship"], "Jack wants his ship back."),
  q("summer-blockbuster-2026", "Pirates of the Caribbean: The Curse of the Black Pearl", 22, "curse", "medium", "In The Curse of the Black Pearl, what reveals the pirates' skeletal forms?", "Moonlight", ["Sunlight", "Fresh water", "Firelight"], "The cursed pirates become skeletal in moonlight."),
  q("summer-blockbuster-2026", "Pirates of the Caribbean: The Curse of the Black Pearl", 22, "object", "medium", "In The Curse of the Black Pearl, what medallion does Elizabeth possess?", "Aztec gold", ["A compass coin", "A royal seal", "A pearl charm"], "The medallion is part of the cursed treasure."),
  q("summer-blockbuster-2026", "Pirates of the Caribbean: The Curse of the Black Pearl", 22, "character", "hard", "In The Curse of the Black Pearl, what trade is Will Turner trained in?", "Blacksmithing", ["Cartography", "Sailing", "Medicine"], "Will works as a blacksmith in Port Royal."),

  q("summer-blockbuster-2026", "Spider-Man", 557, "origin", "easy", "In Spider-Man, what bites Peter Parker?", "A genetically altered spider", ["A bat", "A scorpion", "A radioactive lizard"], "The spider bite gives Peter his powers."),
  q("summer-blockbuster-2026", "Spider-Man", 557, "lesson", "easy", "In Spider-Man, what lesson does Uncle Ben teach Peter?", "With great power comes great responsibility", ["Never tell me the odds", "Family is everything", "Fear is the mind-killer"], "The line defines Peter's hero code."),
  q("summer-blockbuster-2026", "Spider-Man", 557, "villain", "medium", "In Spider-Man, who becomes the Green Goblin?", "Norman Osborn", ["Harry Osborn", "Eddie Brock", "Otto Octavius"], "Norman's experiment turns him into the Goblin."),
  q("summer-blockbuster-2026", "Spider-Man", 557, "job", "medium", "In Spider-Man, where does Peter sell photos of Spider-Man?", "The Daily Bugle", ["The Daily Planet", "The New York Star", "The Globe"], "J. Jonah Jameson buys Peter's photos."),
  q("summer-blockbuster-2026", "Spider-Man", 557, "scene", "hard", "In Spider-Man, what upside-down moment became iconic?", "Spider-Man kisses Mary Jane", ["Peter catches a train", "Goblin removes his mask", "Aunt May flies"], "The rain kiss is one of the film's most famous images."),

  q("summer-blockbuster-2026", "Independence Day", 602, "event", "easy", "In Independence Day, what global threat attacks Earth?", "Alien invaders", ["Dinosaurs", "A giant shark", "A rogue asteroid"], "Massive alien ships arrive over major cities."),
  q("summer-blockbuster-2026", "Independence Day", 602, "character", "easy", "In Independence Day, who pilots a fighter jet against the aliens?", "Steven Hiller", ["David Levinson", "President Whitmore", "Julius Levinson"], "Hiller is the Marine pilot played by Will Smith."),
  q("summer-blockbuster-2026", "Independence Day", 602, "plan", "medium", "In Independence Day, what does David Levinson upload to the alien mothership?", "A computer virus", ["A map", "A music file", "A weather report"], "The virus disables alien shields."),
  q("summer-blockbuster-2026", "Independence Day", 602, "speech", "medium", "In Independence Day, who gives the rousing July 4th speech?", "President Whitmore", ["Steven Hiller", "General Grey", "David Levinson"], "The president rallies the pilots before the final attack."),
  q("summer-blockbuster-2026", "Independence Day", 602, "scene", "hard", "In Independence Day, who sacrifices himself by flying into the alien weapon?", "Russell Casse", ["Jimmy Wilder", "Miguel Casse", "Marty Gilbert"], "Russell's sacrifice destroys the alien ship."),

  q("summer-blockbuster-2026", "The Matrix", 603, "choice", "easy", "In The Matrix, which pill does Neo take to learn the truth?", "Red pill", ["Blue pill", "Green pill", "White pill"], "The red pill shows Neo the real world."),
  q("summer-blockbuster-2026", "The Matrix", 603, "character", "easy", "In The Matrix, who mentors Neo?", "Morpheus", ["Agent Smith", "Cypher", "Tank"], "Morpheus believes Neo may be the One."),
  q("summer-blockbuster-2026", "The Matrix", 603, "concept", "medium", "In The Matrix, what is the Matrix?", "A simulated reality", ["A city", "A spaceship", "A martial arts school"], "Humans unknowingly live inside the simulation."),
  q("summer-blockbuster-2026", "The Matrix", 603, "villain", "medium", "In The Matrix, who is the main agent pursuing Neo?", "Agent Smith", ["Agent Brown", "The Architect", "The Merovingian"], "Smith is the film's central program antagonist."),
  q("summer-blockbuster-2026", "The Matrix", 603, "scene", "hard", "In The Matrix, what visual effect became famous during Neo's bullet dodge?", "Bullet time", ["Time slicing", "Light folding", "Gravity lock"], "Bullet time became a signature action effect."),

  q("summer-blockbuster-2026", "Back to the Future", 105, "object", "easy", "In Back to the Future, what car becomes a time machine?", "DeLorean", ["Ferrari", "Volkswagen Beetle", "Pontiac Firebird"], "Doc Brown builds the time machine from a DeLorean."),
  q("summer-blockbuster-2026", "Back to the Future", 105, "date", "medium", "In Back to the Future, what year does Marty accidentally travel to?", "1955", ["1965", "1975", "1985"], "Marty lands in 1955 and meets his parents as teenagers."),
  q("summer-blockbuster-2026", "Back to the Future", 105, "character", "easy", "In Back to the Future, who invents the time machine?", "Doc Brown", ["George McFly", "Biff Tannen", "Mr. Strickland"], "Doc's invention sends Marty into the past."),
  q("summer-blockbuster-2026", "Back to the Future", 105, "scene", "medium", "In Back to the Future, what natural event powers the return trip?", "Lightning strike", ["Solar eclipse", "Earthquake", "Tornado"], "Lightning hits the clock tower at the right moment."),
  q("summer-blockbuster-2026", "Back to the Future", 105, "villain", "hard", "In Back to the Future, who bullies George McFly?", "Biff Tannen", ["Needles", "Goldie Wilson", "Marvin Berry"], "Biff is George's tormentor in 1955."),

  q("summer-blockbuster-2026", "E.T. the Extra-Terrestrial", 601, "creature", "easy", "In E.T., what kind of being is E.T.?", "An alien", ["A robot", "A ghost", "A dinosaur"], "E.T. is stranded on Earth."),
  q("summer-blockbuster-2026", "E.T. the Extra-Terrestrial", 601, "friendship", "easy", "In E.T., which boy befriends E.T.?", "Elliott", ["Michael", "Tyler", "Henry"], "Elliott hides and protects E.T."),
  q("summer-blockbuster-2026", "E.T. the Extra-Terrestrial", 601, "quote", "medium", "In E.T., what does E.T. want to do?", "Phone home", ["Go fishing", "Build a robot", "Find treasure"], "E.T.'s desire to contact home drives the story."),
  q("summer-blockbuster-2026", "E.T. the Extra-Terrestrial", 601, "object", "medium", "In E.T., what candy helps lure E.T.?", "Reese's Pieces", ["M&Ms", "Skittles", "Gummy bears"], "The candy trail is a famous product-placement moment."),
  q("summer-blockbuster-2026", "E.T. the Extra-Terrestrial", 601, "scene", "hard", "In E.T., what vehicle flies across the moon?", "A bicycle", ["A skateboard", "A scooter", "A motorcycle"], "The flying bike silhouette became iconic."),

  q("summer-blockbuster-2026", "Superman", 1924, "hero", "easy", "In Superman, what is Clark Kent's heroic identity?", "Superman", ["Batman", "Flash", "Green Lantern"], "Clark Kent becomes Superman."),
  q("summer-blockbuster-2026", "Superman", 1924, "origin", "easy", "In Superman, what planet is Superman from?", "Krypton", ["Mars", "Asgard", "Pandora"], "Krypton is Superman's homeworld."),
  q("summer-blockbuster-2026", "Superman", 1924, "weakness", "medium", "In Superman, what substance weakens Superman?", "Kryptonite", ["Vibranium", "Adamantium", "Uranium"], "Kryptonite is Superman's classic weakness."),
  q("summer-blockbuster-2026", "Superman", 1924, "job", "medium", "In Superman, where does Clark Kent work as a reporter?", "Daily Planet", ["Daily Bugle", "Gotham Gazette", "Metropolis Times"], "Clark works at the Daily Planet."),
  q("summer-blockbuster-2026", "Superman", 1924, "villain", "hard", "In Superman, which criminal mastermind threatens Metropolis?", "Lex Luthor", ["General Zod", "Brainiac", "Darkseid"], "Lex Luthor is Superman's signature human nemesis."),

  q("summer-blockbuster-2026", "Men in Black", 607, "agency", "easy", "In Men in Black, what secret organization monitors aliens on Earth?", "Men in Black", ["S.H.I.E.L.D.", "IMF", "Ghostbusters"], "The agency manages alien activity in secret."),
  q("summer-blockbuster-2026", "Men in Black", 607, "object", "medium", "In Men in Black, what device erases memories?", "Neuralyzer", ["Noisy Cricket", "Proton pack", "Omni-tool"], "Agents use the neuralyzer after alien incidents."),
  q("summer-blockbuster-2026", "Men in Black", 607, "character", "easy", "In Men in Black, what letter name does James Edwards receive?", "Agent J", ["Agent K", "Agent Z", "Agent X"], "James becomes Agent J after joining MIB."),
  q("summer-blockbuster-2026", "Men in Black", 607, "weapon", "medium", "In Men in Black, what tiny gun is Agent J given?", "Noisy Cricket", ["Little Thunder", "Mini Blaster", "Pocket Rocket"], "The Noisy Cricket has huge recoil."),
  q("summer-blockbuster-2026", "Men in Black", 607, "creature", "hard", "In Men in Black, what alien hides inside a human farmer's body?", "A Bug", ["A Predator", "A Martian", "A Xenomorph"], "The Bug wears Edgar's body as a disguise."),

  q("summer-blockbuster-2026", "Twister", 664, "weather", "easy", "In Twister, what natural disaster do the characters chase?", "Tornadoes", ["Earthquakes", "Hurricanes", "Volcanoes"], "The film follows storm chasers."),
  q("summer-blockbuster-2026", "Twister", 664, "device", "medium", "In Twister, what instrument pack is designed to release sensors into a tornado?", "Dorothy", ["HAL", "Pathfinder", "Mother"], "Dorothy is based on real tornado research concepts."),
  q("summer-blockbuster-2026", "Twister", 664, "characters", "easy", "In Twister, who leads the storm-chasing team with Bill?", "Jo Harding", ["Melissa Reeves", "Aunt Meg", "Dr. Brand"], "Jo is obsessed with understanding tornadoes."),
  q("summer-blockbuster-2026", "Twister", 664, "rival", "medium", "In Twister, which rival storm chaser has corporate backing?", "Jonas Miller", ["Dusty", "Rabbit", "Beltzer"], "Jonas copies Dorothy's concept with a flashier team."),
  q("summer-blockbuster-2026", "Twister", 664, "scene", "hard", "In Twister, what flies through the air during a memorable roadside sequence?", "A cow", ["A shark", "A piano", "A dinosaur"], "The flying cow became one of Twister's most quoted images."),
);

interface EvergreenPackSeed {
  slug: string;
  title: string;
  tmdbId: number;
  mediaType?: "movie" | "tv";
  facts: Array<{
    category: string;
    difficulty: EvergreenDifficulty;
    question: string;
    answer: string;
    wrong: string[];
    explanation: string;
  }>;
}

function addEvergreenPackQuestions(seeds: EvergreenPackSeed[]) {
  for (const seed of seeds) {
    for (const fact of seed.facts) {
      evergreenChallengeQuestions.push(
        qFor(seed.slug, seed.title, seed.tmdbId, seed.mediaType || "movie", fact.category, fact.difficulty, fact.question, fact.answer, fact.wrong, fact.explanation),
      );
    }
  }
}

addEvergreenPackQuestions([
  {
    slug: "time-travel-challenge",
    title: "Back to the Future",
    tmdbId: 105,
    facts: [
      { category: "vehicle", difficulty: "easy", question: "In Back to the Future, what car does Doc Brown turn into a time machine?", answer: "A DeLorean", wrong: ["A Ferrari", "A Volkswagen Beetle", "A Ford Mustang"], explanation: "The DeLorean is fitted with Doc's time-travel hardware." },
      { category: "story", difficulty: "medium", question: "In Back to the Future, what must Marty make sure happens between George and Lorraine?", answer: "They fall in love", wrong: ["They leave Hill Valley", "They join a band", "They buy the DeLorean"], explanation: "Marty risks erasing himself unless his parents get together." },
      { category: "setting", difficulty: "medium", question: "In Back to the Future, where does lightning need to strike for Marty to return home?", answer: "The clock tower", wrong: ["The high school gym", "Doc's garage", "Twin Pines Mall"], explanation: "Doc uses the clock tower lightning strike to power the DeLorean." },
      { category: "villain", difficulty: "easy", question: "In Back to the Future, who bullies George McFly in 1955?", answer: "Biff Tannen", wrong: ["Mr. Strickland", "Goldie Wilson", "Marvin Berry"], explanation: "Biff is George's tormentor in both timelines." },
      { category: "music", difficulty: "hard", question: "In Back to the Future, what song does Marty perform at the Enchantment Under the Sea dance?", answer: "Johnny B. Goode", wrong: ["Earth Angel", "Power of Love", "Blue Suede Shoes"], explanation: "Marty's performance gets a little ahead of 1955's musical taste." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Back to the Future Part II",
    tmdbId: 165,
    facts: [
      { category: "object", difficulty: "easy", question: "In Back to the Future Part II, what book does old Biff steal to change history?", answer: "A sports almanac", wrong: ["A spellbook", "A police file", "A stock ledger"], explanation: "The almanac lets Biff profit from future sports results." },
      { category: "timeline", difficulty: "medium", question: "In Back to the Future Part II, what creates the dark alternate 1985?", answer: "Biff using future sports results", wrong: ["Doc losing the DeLorean", "Marty missing the dance", "A lightning storm hitting early"], explanation: "Old Biff gives young Biff the almanac and changes the timeline." },
      { category: "setting", difficulty: "easy", question: "In Back to the Future Part II, what future year do Marty and Doc visit?", answer: "2015", wrong: ["2005", "2025", "2035"], explanation: "The film's future segment is set in 2015." },
      { category: "object", difficulty: "medium", question: "In Back to the Future Part II, what futuristic board does Marty ride?", answer: "A hoverboard", wrong: ["A jet scooter", "A magnetic bike", "A rocket sled"], explanation: "The hoverboard chase is one of the sequel's signature scenes." },
      { category: "story", difficulty: "hard", question: "In Back to the Future Part II, where must Marty recover the almanac in 1955?", answer: "At the school dance", wrong: ["At Twin Pines Mall", "At the courthouse roof", "At Doc's mansion"], explanation: "Marty returns to the night of the first film to fix the timeline." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "The Terminator",
    tmdbId: 218,
    facts: [
      { category: "mission", difficulty: "easy", question: "In The Terminator, why is the Terminator sent back to 1984?", answer: "To kill Sarah Connor", wrong: ["To protect John Connor", "To steal Cyberdyne files", "To rescue Kyle Reese"], explanation: "Skynet tries to prevent John Connor from being born." },
      { category: "protector", difficulty: "easy", question: "In The Terminator, who is sent back to protect Sarah Connor?", answer: "Kyle Reese", wrong: ["Miles Dyson", "John Connor", "T-1000"], explanation: "Kyle is sent by the human resistance." },
      { category: "future", difficulty: "medium", question: "In The Terminator, what future computer system creates the machines?", answer: "Skynet", wrong: ["WOPR", "Mother", "VIKI"], explanation: "Skynet becomes self-aware and starts the war against humanity." },
      { category: "scene", difficulty: "medium", question: "In The Terminator, where does Sarah first encounter Kyle during the chase?", answer: "Tech Noir", wrong: ["The police station", "A factory", "A motel"], explanation: "Kyle reveals himself in the nightclub Tech Noir." },
      { category: "ending", difficulty: "hard", question: "In The Terminator, how does Sarah finally destroy the Terminator?", answer: "She crushes it in a hydraulic press", wrong: ["She freezes it", "She shoots it with a rocket", "She traps it in molten steel"], explanation: "Sarah uses the factory press to end the attack." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Terminator 2: Judgment Day",
    tmdbId: 280,
    facts: [
      { category: "mission", difficulty: "easy", question: "In Terminator 2: Judgment Day, what is the T-800 sent back to do?", answer: "Protect John Connor", wrong: ["Kill Sarah Connor", "Build Skynet", "Replace Miles Dyson"], explanation: "The reprogrammed T-800 protects young John." },
      { category: "villain", difficulty: "easy", question: "In Terminator 2: Judgment Day, what liquid-metal model hunts John?", answer: "T-1000", wrong: ["T-800", "T-X", "Rev-9"], explanation: "The T-1000 can mimic people and reshape itself." },
      { category: "location", difficulty: "medium", question: "In Terminator 2: Judgment Day, where is Sarah Connor held at the beginning?", answer: "Pescadero State Hospital", wrong: ["Cyberdyne Systems", "Skynet Prison", "Norris Labs"], explanation: "Sarah is institutionalized because of her warnings." },
      { category: "story", difficulty: "medium", question: "In Terminator 2: Judgment Day, whose research is key to Skynet's creation?", answer: "Miles Dyson", wrong: ["Peter Silberman", "Danny Dyson", "Enrique Salceda"], explanation: "Dyson's Cyberdyne work leads toward Judgment Day." },
      { category: "ending", difficulty: "hard", question: "In Terminator 2: Judgment Day, where is the T-1000 destroyed?", answer: "In molten steel", wrong: ["In a hydraulic press", "Inside a police car", "Under a freeway"], explanation: "The steel mill finale destroys the T-1000." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Looper",
    tmdbId: 59967,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Looper, what do loopers do for future criminals?", answer: "Kill targets sent back in time", wrong: ["Repair time machines", "Guard a prison", "Erase memories"], explanation: "Victims are sent to the past where loopers execute them." },
      { category: "story", difficulty: "medium", question: "In Looper, what does it mean when a looper closes his loop?", answer: "He kills his future self", wrong: ["He destroys the city", "He joins the mob", "He forgets his past"], explanation: "Closing the loop gives the looper a payout but seals his fate." },
      { category: "character", difficulty: "medium", question: "In Looper, what is young Joe's older self trying to prevent?", answer: "The rise of the Rainmaker", wrong: ["A bank robbery", "A space launch", "A zombie outbreak"], explanation: "Old Joe hunts the child who may become the Rainmaker." },
      { category: "power", difficulty: "hard", question: "In Looper, what ability does Cid possess?", answer: "Powerful telekinesis", wrong: ["Mind reading", "Invisibility", "Time freezing"], explanation: "Cid's TK power makes him frighteningly dangerous." },
      { category: "ending", difficulty: "hard", question: "In Looper, how does young Joe break the cycle?", answer: "He kills himself", wrong: ["He steals a time machine", "He sends Cid away", "He traps Old Joe in the future"], explanation: "Young Joe sacrifices himself to stop Old Joe's violence." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "12 Monkeys",
    tmdbId: 63,
    facts: [
      { category: "mission", difficulty: "easy", question: "In 12 Monkeys, why is James Cole sent into the past?", answer: "To gather information about a deadly virus", wrong: ["To win a war", "To rescue his brother", "To steal a cure"], explanation: "Cole is sent back to investigate the plague's origin." },
      { category: "group", difficulty: "medium", question: "In 12 Monkeys, what group does Cole believe is connected to the outbreak?", answer: "The Army of the Twelve Monkeys", wrong: ["The Time Variance Authority", "The Resistance", "The Lazarus Group"], explanation: "The group appears to be a key clue in the mystery." },
      { category: "character", difficulty: "medium", question: "In 12 Monkeys, which eccentric character is linked to the animal-rights group?", answer: "Jeffrey Goines", wrong: ["Jose", "Dr. Peters", "Leland Goines"], explanation: "Jeffrey's behavior misdirects Cole's investigation." },
      { category: "setting", difficulty: "hard", question: "In 12 Monkeys, where does the recurring childhood memory take place?", answer: "An airport", wrong: ["A subway tunnel", "A zoo", "A hospital ward"], explanation: "The airport scene becomes central to the time loop." },
      { category: "theme", difficulty: "hard", question: "In 12 Monkeys, what does Cole struggle to distinguish during his mission?", answer: "Memory, madness, and reality", wrong: ["Dreams and cloning", "Robots and humans", "Magic and science"], explanation: "The film keeps Cole's perception unstable." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Edge of Tomorrow",
    tmdbId: 137113,
    facts: [
      { category: "loop", difficulty: "easy", question: "In Edge of Tomorrow, what happens to Cage every time he dies?", answer: "He wakes up at the start of the same day", wrong: ["He changes bodies", "He becomes invisible", "He loses a year"], explanation: "Cage is trapped in a combat time loop." },
      { category: "character", difficulty: "easy", question: "In Edge of Tomorrow, what nickname is Rita Vrataski known by?", answer: "Full Metal Bitch", wrong: ["Angel of Verdun", "Iron Lady", "Omega Queen"], explanation: "Rita earned the nickname after her battlefield victory." },
      { category: "enemy", difficulty: "medium", question: "In Edge of Tomorrow, what alien force is humanity fighting?", answer: "Mimics", wrong: ["Xenomorphs", "Tripods", "Kaiju"], explanation: "The Mimics can manipulate the war through time-loop power." },
      { category: "story", difficulty: "medium", question: "In Edge of Tomorrow, why does Rita understand Cage's looping experience?", answer: "She once had the same power", wrong: ["She built the loop", "She is from the future", "She reads his mind"], explanation: "Rita lost the looping ability after a blood transfusion." },
      { category: "location", difficulty: "hard", question: "In Edge of Tomorrow, where do Cage and Rita seek the Omega?", answer: "The Louvre", wrong: ["The Eiffel Tower", "Buckingham Palace", "The Pentagon"], explanation: "The final assault targets the Omega beneath the Louvre." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Groundhog Day",
    tmdbId: 137,
    facts: [
      { category: "loop", difficulty: "easy", question: "In Groundhog Day, what day does Phil Connors keep repeating?", answer: "Groundhog Day", wrong: ["Christmas Eve", "New Year's Day", "Thanksgiving"], explanation: "Phil relives February 2 again and again." },
      { category: "setting", difficulty: "easy", question: "In Groundhog Day, what town traps Phil in the time loop?", answer: "Punxsutawney", wrong: ["Bedford Falls", "Hill Valley", "Kingston Falls"], explanation: "Phil travels to Punxsutawney for the Groundhog Day broadcast." },
      { category: "job", difficulty: "medium", question: "In Groundhog Day, what is Phil Connors' job?", answer: "TV weatherman", wrong: ["Radio host", "Newspaper editor", "Mayor"], explanation: "Phil covers the annual groundhog ceremony." },
      { category: "character", difficulty: "medium", question: "In Groundhog Day, who gradually becomes Phil's emotional anchor?", answer: "Rita", wrong: ["Nancy", "Debbie", "Mrs. Lancaster"], explanation: "Phil's connection with Rita helps him change." },
      { category: "growth", difficulty: "hard", question: "In Groundhog Day, what finally changes Phil's repeated day?", answer: "He becomes genuinely selfless", wrong: ["He breaks the clock", "He leaves town early", "He catches the groundhog"], explanation: "The loop ends after Phil grows into a better person." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Bill & Ted's Excellent Adventure",
    tmdbId: 1648,
    facts: [
      { category: "object", difficulty: "easy", question: "In Bill & Ted's Excellent Adventure, what do Bill and Ted use to travel through time?", answer: "A phone booth", wrong: ["A DeLorean", "A hot tub", "A police box"], explanation: "Rufus gives them access to a time-traveling phone booth." },
      { category: "goal", difficulty: "easy", question: "In Bill & Ted's Excellent Adventure, why do Bill and Ted collect historical figures?", answer: "For their history presentation", wrong: ["To win a battle", "To rob a museum", "To start a band tour"], explanation: "They need to pass history to keep their future intact." },
      { category: "character", difficulty: "medium", question: "In Bill & Ted's Excellent Adventure, who guides Bill and Ted from the future?", answer: "Rufus", wrong: ["Socrates", "De Nomolos", "Station"], explanation: "Rufus helps them understand their importance." },
      { category: "history", difficulty: "medium", question: "In Bill & Ted's Excellent Adventure, which military leader goes wild at a water park?", answer: "Napoleon", wrong: ["Genghis Khan", "Billy the Kid", "Caesar"], explanation: "Napoleon's modern adventures include the water park." },
      { category: "catchphrase", difficulty: "hard", question: "In Bill & Ted's Excellent Adventure, what advice sums up the duo's philosophy?", answer: "Be excellent to each other", wrong: ["Never cross the streams", "No fate but what we make", "There can be only one"], explanation: "The phrase becomes the film's good-natured credo." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Primer",
    tmdbId: 14337,
    facts: [
      { category: "device", difficulty: "medium", question: "In Primer, what do Abe and Aaron accidentally create?", answer: "A time machine", wrong: ["A teleportation gate", "A fusion reactor", "A cloning pod"], explanation: "Their garage experiment produces a box that enables time travel." },
      { category: "method", difficulty: "hard", question: "In Primer, how does the time machine's travel window work?", answer: "Users travel back to when the box was turned on", wrong: ["Users jump to any date", "Users freeze everyone else", "Users swap universes"], explanation: "The box creates a bounded loop tied to its activation time." },
      { category: "story", difficulty: "hard", question: "In Primer, why do the timelines become difficult to track?", answer: "Multiple versions and secret loops overlap", wrong: ["The world resets every day", "Aliens alter memories", "The machine erases all evidence"], explanation: "The characters create competing loops and doubles." },
      { category: "setting", difficulty: "medium", question: "In Primer, where do the inventors begin their project?", answer: "A garage", wrong: ["A university lab", "A military base", "A spaceship"], explanation: "The film's low-key setting emphasizes garage invention." },
      { category: "theme", difficulty: "hard", question: "In Primer, what mainly damages Abe and Aaron's partnership?", answer: "Distrust over hidden time loops", wrong: ["A public trial", "A romantic rivalry", "A monster attack"], explanation: "Their secrecy and manipulation fracture the partnership." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Source Code",
    tmdbId: 45612,
    facts: [
      { category: "mission", difficulty: "easy", question: "In Source Code, what disaster is Colter Stevens repeatedly investigating?", answer: "A train bombing", wrong: ["A plane hijacking", "A bridge collapse", "A bank explosion"], explanation: "Colter relives minutes before a commuter train explodes." },
      { category: "system", difficulty: "medium", question: "In Source Code, how much time does Colter relive during each attempt?", answer: "Eight minutes", wrong: ["One hour", "Twenty minutes", "One day"], explanation: "The Source Code simulation gives him eight-minute windows." },
      { category: "goal", difficulty: "medium", question: "In Source Code, what must Colter identify before another attack happens?", answer: "The bomber", wrong: ["A hidden treasure", "A missing astronaut", "A corrupt judge"], explanation: "The mission is to prevent a second attack." },
      { category: "character", difficulty: "hard", question: "In Source Code, whose body does Colter experience on the train?", answer: "Sean Fentress", wrong: ["Derek Frost", "Goodwin", "Rutledge"], explanation: "Colter sees himself as Sean inside the Source Code." },
      { category: "emotion", difficulty: "hard", question: "In Source Code, what personal truth is Colter forced to confront?", answer: "He is being kept alive after a fatal injury", wrong: ["He caused the bombing", "He is a robot", "He is from the future"], explanation: "The program depends on Colter's remaining consciousness." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "About Time",
    tmdbId: 122906,
    facts: [
      { category: "power", difficulty: "easy", question: "In About Time, what ability do the men in Tim's family have?", answer: "They can travel through time within their own lives", wrong: ["They can stop aging", "They can read minds", "They can predict lottery numbers"], explanation: "Tim learns he can revisit moments from his own past." },
      { category: "relationship", difficulty: "easy", question: "In About Time, who becomes Tim's romantic partner?", answer: "Mary", wrong: ["Charlotte", "Kit Kat", "Joanna"], explanation: "Tim and Mary's relationship drives much of the story." },
      { category: "rule", difficulty: "medium", question: "In About Time, what limitation makes changing the past emotionally risky after having children?", answer: "It can change which child is born", wrong: ["It destroys the house", "It erases all memories", "It stops time forever"], explanation: "Small changes can alter conception and rewrite Tim's children." },
      { category: "family", difficulty: "medium", question: "In About Time, who teaches Tim about the family ability?", answer: "His father", wrong: ["His uncle", "His mother", "His sister"], explanation: "Tim's father explains the family's time-travel secret." },
      { category: "theme", difficulty: "hard", question: "In About Time, what does Tim ultimately learn to value without changing it?", answer: "Ordinary daily life", wrong: ["Fame", "A perfect job title", "Winning every argument"], explanation: "The film uses time travel to celebrate everyday moments." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "X-Men: Days of Future Past",
    tmdbId: 127585,
    facts: [
      { category: "mission", difficulty: "easy", question: "In X-Men: Days of Future Past, whose consciousness is sent into the past?", answer: "Wolverine", wrong: ["Professor X", "Mystique", "Magneto"], explanation: "Wolverine's mind is sent back because he can survive the strain." },
      { category: "threat", difficulty: "medium", question: "In X-Men: Days of Future Past, what machines dominate the dark future?", answer: "Sentinels", wrong: ["Ultrons", "Terminators", "Jaegers"], explanation: "Sentinels hunt mutants and humans who may carry mutant genes." },
      { category: "story", difficulty: "medium", question: "In X-Men: Days of Future Past, whose assassination must be prevented?", answer: "Bolivar Trask", wrong: ["William Stryker", "Senator Kelly", "Sebastian Shaw"], explanation: "Mystique's killing of Trask accelerates the Sentinel program." },
      { category: "scene", difficulty: "hard", question: "In X-Men: Days of Future Past, which mutant's speed is showcased during the Pentagon escape?", answer: "Quicksilver", wrong: ["Nightcrawler", "Beast", "Havok"], explanation: "Quicksilver's slow-motion rescue became a standout sequence." },
      { category: "timeline", difficulty: "hard", question: "In X-Men: Days of Future Past, what is the main result of changing 1973?", answer: "A new timeline replaces the doomed future", wrong: ["Mutants lose all powers", "Earth leaves the solar system", "The school is destroyed"], explanation: "The mission rewrites the franchise timeline." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Avengers: Endgame",
    tmdbId: 299534,
    facts: [
      { category: "plan", difficulty: "easy", question: "In Avengers: Endgame, what is the Avengers' time-travel plan called?", answer: "The Time Heist", wrong: ["The Infinity Job", "Project Pegasus", "Operation Chronos"], explanation: "The team travels to earlier moments to gather the Stones." },
      { category: "object", difficulty: "medium", question: "In Avengers: Endgame, what particles make the time travel possible?", answer: "Pym particles", wrong: ["Gamma particles", "Vibranium particles", "Quantum dust"], explanation: "Pym particles allow travel through the Quantum Realm." },
      { category: "location", difficulty: "medium", question: "In Avengers: Endgame, which earlier Avengers battle do Tony, Steve, Scott, and Bruce revisit?", answer: "The Battle of New York", wrong: ["The Battle of Sokovia", "The airport fight", "The Wakanda battle"], explanation: "The team returns to 2012 New York." },
      { category: "sacrifice", difficulty: "hard", question: "In Avengers: Endgame, who sacrifices herself on Vormir?", answer: "Black Widow", wrong: ["Nebula", "Gamora", "Scarlet Witch"], explanation: "Natasha gives her life for the Soul Stone." },
      { category: "ending", difficulty: "hard", question: "In Avengers: Endgame, what does Steve Rogers do after returning the Stones?", answer: "He stays in the past with Peggy", wrong: ["He joins the Guardians", "He becomes Sorcerer Supreme", "He destroys the shield"], explanation: "Steve returns as an old man after living a life with Peggy." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Interstellar",
    tmdbId: 157336,
    facts: [
      { category: "science", difficulty: "medium", question: "In Interstellar, why does Miller's planet cause huge time loss?", answer: "It is close to Gargantua's gravity", wrong: ["It spins backward", "It has no sun", "It is a simulation"], explanation: "Extreme gravity near the black hole slows time relative to Earth." },
      { category: "object", difficulty: "easy", question: "In Interstellar, what object carries Cooper's message to Murph?", answer: "A watch", wrong: ["A compass", "A baseball glove", "A radio"], explanation: "Cooper manipulates the watch hand from the tesseract." },
      { category: "ship", difficulty: "easy", question: "In Interstellar, what is the main spacecraft called?", answer: "Endurance", wrong: ["Hermes", "Nostromo", "Discovery"], explanation: "The Endurance carries the crew through the wormhole." },
      { category: "character", difficulty: "hard", question: "In Interstellar, which scientist falsifies data about his planet?", answer: "Dr. Mann", wrong: ["Dr. Brand", "Romilly", "Doyle"], explanation: "Mann lies so someone will rescue him." },
      { category: "ending", difficulty: "hard", question: "In Interstellar, where does Cooper perceive Murph's bedroom across time?", answer: "Inside the tesseract", wrong: ["On Miller's planet", "Inside a cryo pod", "At NASA headquarters"], explanation: "The tesseract lets Cooper communicate through gravity." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Tenet",
    tmdbId: 577922,
    facts: [
      { category: "concept", difficulty: "medium", question: "In Tenet, what happens to inverted objects?", answer: "They move backward through time", wrong: ["They become invisible", "They split into clones", "They teleport"], explanation: "Inversion reverses an object's entropy." },
      { category: "phrase", difficulty: "easy", question: "In Tenet, what word is both the title and an operational password?", answer: "Tenet", wrong: ["Sator", "Opera", "Rotas"], explanation: "The word opens doors into the film's secret operation." },
      { category: "scene", difficulty: "hard", question: "In Tenet, where does a major heist sequence involve crashing a plane?", answer: "A freeport", wrong: ["A train station", "A museum", "A submarine base"], explanation: "The freeport sequence uses a plane crash as cover." },
      { category: "villain", difficulty: "medium", question: "In Tenet, who is the arms dealer tied to the algorithm?", answer: "Andrei Sator", wrong: ["Neil", "Priya", "Fay"], explanation: "Sator is the film's central antagonist." },
      { category: "object", difficulty: "hard", question: "In Tenet, what dangerous device are the characters trying to keep from being assembled?", answer: "The Algorithm", wrong: ["The Tesseract", "The Source Code", "The Flux Capacitor"], explanation: "The Algorithm could invert the world." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "The Adam Project",
    tmdbId: 696806,
    facts: [
      { category: "premise", difficulty: "easy", question: "In The Adam Project, who does adult Adam team up with?", answer: "His younger self", wrong: ["His future son", "His clone", "His teacher"], explanation: "Adult Adam meets his younger self after crash-landing in the past." },
      { category: "family", difficulty: "medium", question: "In The Adam Project, whose research is central to time travel?", answer: "Adam's father", wrong: ["Adam's mother", "Maya's brother", "Laura's captain"], explanation: "Louis Reed's work makes time travel possible." },
      { category: "object", difficulty: "medium", question: "In The Adam Project, what kind of weapon does Adam use in combat?", answer: "A magnetic staff", wrong: ["A whip", "A proton pack", "A lightsaber"], explanation: "Adam's staff is one of the film's signature gadgets." },
      { category: "villain", difficulty: "hard", question: "In The Adam Project, who exploits time travel for power?", answer: "Maya Sorian", wrong: ["Laura", "Louis Reed", "Ray Dollarhyde"], explanation: "Sorian uses future knowledge to control the technology." },
      { category: "theme", difficulty: "medium", question: "In The Adam Project, what relationship does Adam have to repair emotionally?", answer: "His relationship with his parents and younger self", wrong: ["A rivalry with aliens", "A feud with a pirate crew", "A courtroom case"], explanation: "The film blends time travel with family reconciliation." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Donnie Darko",
    tmdbId: 141,
    facts: [
      { category: "figure", difficulty: "easy", question: "In Donnie Darko, what is the name of the rabbit-suited figure Donnie sees?", answer: "Frank", wrong: ["Harvey", "Eddie", "Bunny"], explanation: "Frank becomes one of the film's most recognizable images." },
      { category: "event", difficulty: "medium", question: "In Donnie Darko, what object crashes into Donnie's bedroom?", answer: "A jet engine", wrong: ["A meteor", "A car", "A satellite dish"], explanation: "The jet engine incident launches the film's mystery." },
      { category: "concept", difficulty: "hard", question: "In Donnie Darko, what book helps explain the film's time-travel mythology?", answer: "The Philosophy of Time Travel", wrong: ["A Brief History of Time", "The Time Machine", "The Tangent Bible"], explanation: "Roberta Sparrow's book gives clues to the tangent universe." },
      { category: "character", difficulty: "medium", question: "In Donnie Darko, what nickname is Roberta Sparrow known by?", answer: "Grandma Death", wrong: ["Mother Time", "Rabbit Lady", "Aunt Doom"], explanation: "The neighborhood calls her Grandma Death." },
      { category: "ending", difficulty: "hard", question: "In Donnie Darko, what does Donnie's final choice prevent?", answer: "The deaths caused by the tangent timeline", wrong: ["A bank robbery", "A school fire only", "An alien invasion"], explanation: "Donnie accepts his fate to collapse the tangent timeline." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Hot Tub Time Machine",
    tmdbId: 23048,
    facts: [
      { category: "device", difficulty: "easy", question: "In Hot Tub Time Machine, what sends the friends into the past?", answer: "A hot tub", wrong: ["A ski lift", "A phone booth", "A jukebox"], explanation: "The malfunctioning hot tub becomes the time machine." },
      { category: "setting", difficulty: "medium", question: "In Hot Tub Time Machine, what decade do the friends revisit?", answer: "The 1980s", wrong: ["The 1960s", "The 1970s", "The 1990s"], explanation: "They are thrown back into their younger 1980s lives." },
      { category: "story", difficulty: "medium", question: "In Hot Tub Time Machine, what do the friends worry will happen if they change events?", answer: "They will alter their futures", wrong: ["They will turn into robots", "They will lose their voices", "They will freeze the mountain"], explanation: "The comedy plays with the fear of changing the timeline." },
      { category: "running gag", difficulty: "hard", question: "In Hot Tub Time Machine, what injury is repeatedly foreshadowed for a bellhop?", answer: "Losing an arm", wrong: ["Losing an eye", "Breaking a leg", "Losing a tooth"], explanation: "The film repeatedly teases how the bellhop loses his arm." },
      { category: "tone", difficulty: "easy", question: "In Hot Tub Time Machine, what is the film's main approach to time travel?", answer: "Raunchy comedy", wrong: ["Silent drama", "Courtroom mystery", "Historical documentary"], explanation: "The movie treats time travel as a broad comedy setup." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "adventure-pack",
    title: "Raiders of the Lost Ark",
    tmdbId: 85,
    facts: [
      { category: "artifact", difficulty: "easy", question: "In Raiders of the Lost Ark, what artifact is Indiana Jones searching for?", answer: "The Ark of the Covenant", wrong: ["The Holy Grail", "The Sankara Stones", "The Crystal Skull"], explanation: "The Ark is the adventure's central prize." },
      { category: "fear", difficulty: "easy", question: "In Raiders of the Lost Ark, what animal does Indiana Jones famously fear?", answer: "Snakes", wrong: ["Spiders", "Rats", "Bats"], explanation: "The Well of Souls makes Indy's fear impossible to ignore." },
      { category: "opening", difficulty: "medium", question: "In Raiders of the Lost Ark, what does Indy swap for the golden idol?", answer: "A bag of sand", wrong: ["A stone skull", "A whip", "A compass"], explanation: "The swap triggers the temple trap." },
      { category: "character", difficulty: "medium", question: "In Raiders of the Lost Ark, who owns the Nepal bar where Indy finds the headpiece?", answer: "Marion Ravenwood", wrong: ["Elsa Schneider", "Willie Scott", "Irina Spalko"], explanation: "Marion keeps the artifact after her father's death." },
      { category: "scene", difficulty: "hard", question: "In Raiders of the Lost Ark, how does Indy deal with the Cairo swordsman?", answer: "He shoots him", wrong: ["He duels him", "He traps him", "He uses the idol"], explanation: "The quick gag became one of the series' most famous moments." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Indiana Jones and the Last Crusade",
    tmdbId: 89,
    facts: [
      { category: "artifact", difficulty: "easy", question: "In Indiana Jones and the Last Crusade, what artifact is Indy seeking?", answer: "The Holy Grail", wrong: ["The Ark of the Covenant", "Excalibur", "The Spear of Destiny"], explanation: "The Grail quest drives the third Indiana Jones film." },
      { category: "family", difficulty: "easy", question: "In Indiana Jones and the Last Crusade, who joins Indy on the adventure?", answer: "His father", wrong: ["His son", "His sister", "His uncle"], explanation: "Henry Jones Sr. is central to the story." },
      { category: "test", difficulty: "medium", question: "In Indiana Jones and the Last Crusade, what must Indy spell during one Grail trial?", answer: "Jehovah", wrong: ["Grail", "Henry", "Nazis"], explanation: "The lettered floor punishes the wrong spelling." },
      { category: "choice", difficulty: "hard", question: "In Indiana Jones and the Last Crusade, why does the villain die after choosing a cup?", answer: "He chooses the wrong grail", wrong: ["He drinks poison intentionally", "He falls into lava", "He is bitten by snakes"], explanation: "The false grail rapidly ages him to death." },
      { category: "relationship", difficulty: "medium", question: "In Indiana Jones and the Last Crusade, what does Henry Sr. call Indiana?", answer: "Junior", wrong: ["Professor", "Dr. Jones", "Kid"], explanation: "The nickname annoys Indy and reveals family dynamics." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Mummy",
    tmdbId: 564,
    facts: [
      { category: "setting", difficulty: "easy", question: "In The Mummy, what lost city are the characters searching for?", answer: "Hamunaptra", wrong: ["Agrabah", "El Dorado", "Atlantis"], explanation: "Hamunaptra is the City of the Dead." },
      { category: "villain", difficulty: "easy", question: "In The Mummy, what ancient priest is awakened?", answer: "Imhotep", wrong: ["Seti", "Ardeth Bay", "Anck-su-namun"], explanation: "Imhotep returns after being cursed alive." },
      { category: "object", difficulty: "medium", question: "In The Mummy, what book can bring the dead back to life?", answer: "The Book of the Dead", wrong: ["The Book of Amun-Ra", "The Necronomicon", "The Sun Scroll"], explanation: "Reading from the book awakens Imhotep." },
      { category: "character", difficulty: "medium", question: "In The Mummy, what is Evelyn's scholarly passion?", answer: "Egyptology and ancient texts", wrong: ["Dinosaur fossils", "Pirate maps", "Greek theater"], explanation: "Evelyn's knowledge helps drive the adventure." },
      { category: "creature", difficulty: "hard", question: "In The Mummy, what swarming insects attack the explorers?", answer: "Scarab beetles", wrong: ["Locusts", "Fire ants", "Wasps"], explanation: "The scarabs are one of the film's most memorable dangers." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "National Treasure",
    tmdbId: 2059,
    facts: [
      { category: "object", difficulty: "easy", question: "In National Treasure, what document does Ben Gates steal to protect it?", answer: "The Declaration of Independence", wrong: ["The Constitution", "The Bill of Rights", "The Magna Carta"], explanation: "Ben steals it before Ian can." },
      { category: "clue", difficulty: "medium", question: "In National Treasure, where is a hidden clue found on the Declaration?", answer: "On the back", wrong: ["Inside the frame only", "In a watermark", "In the signature ink"], explanation: "The back of the Declaration contains a key clue." },
      { category: "family", difficulty: "easy", question: "In National Treasure, what family has long chased the treasure?", answer: "The Gates family", wrong: ["The Riley family", "The Sadusky family", "The Templar family"], explanation: "The Gates family legacy drives Ben." },
      { category: "ally", difficulty: "medium", question: "In National Treasure, who is Ben's tech-savvy friend?", answer: "Riley Poole", wrong: ["Ian Howe", "Patrick Gates", "Agent Sadusky"], explanation: "Riley helps with hacking, planning, and comic relief." },
      { category: "location", difficulty: "hard", question: "In National Treasure, which historic bell is connected to the glasses clue?", answer: "The Liberty Bell", wrong: ["Big Ben", "The Old North Church bell", "The Bell of Independence Hall"], explanation: "The clue leads Ben through Philadelphia history." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Pirates of the Caribbean: The Curse of the Black Pearl",
    tmdbId: 22,
    facts: [
      { category: "ship", difficulty: "easy", question: "In The Curse of the Black Pearl, what ship does Jack Sparrow want back?", answer: "The Black Pearl", wrong: ["The Interceptor", "The Dauntless", "The Flying Dutchman"], explanation: "Jack's goal is to reclaim his ship." },
      { category: "curse", difficulty: "medium", question: "In The Curse of the Black Pearl, what reveals the pirates' skeletal forms?", answer: "Moonlight", wrong: ["Sunlight", "Rain", "Candlelight"], explanation: "The curse is visible under moonlight." },
      { category: "object", difficulty: "medium", question: "In The Curse of the Black Pearl, what item does Elizabeth possess?", answer: "An Aztec gold medallion", wrong: ["A cursed compass", "A royal ring", "A pearl necklace"], explanation: "The medallion is part of the cursed treasure." },
      { category: "villain", difficulty: "easy", question: "In The Curse of the Black Pearl, who captains the Black Pearl at the start?", answer: "Barbossa", wrong: ["Jack Sparrow", "Will Turner", "Norrington"], explanation: "Barbossa leads the cursed crew." },
      { category: "character", difficulty: "hard", question: "In The Curse of the Black Pearl, what trade is Will Turner trained in?", answer: "Blacksmithing", wrong: ["Sailing", "Medicine", "Cartography"], explanation: "Will works as a blacksmith in Port Royal." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Jumanji",
    tmdbId: 8844,
    facts: [
      { category: "object", difficulty: "easy", question: "In Jumanji, what object unleashes the jungle dangers?", answer: "A board game", wrong: ["A video game", "A treasure chest", "A magic mirror"], explanation: "The board game brings hazards into the real world." },
      { category: "character", difficulty: "easy", question: "In Jumanji, who is trapped inside the game for years?", answer: "Alan Parrish", wrong: ["Peter Shepherd", "Carl Bentley", "Van Pelt"], explanation: "Alan is released when the game is played again." },
      { category: "villain", difficulty: "medium", question: "In Jumanji, what hunter pursues Alan?", answer: "Van Pelt", wrong: ["Mola Ram", "Captain Hook", "Imhotep"], explanation: "Van Pelt emerges from the game as a relentless hunter." },
      { category: "rule", difficulty: "medium", question: "In Jumanji, how can the chaos be stopped?", answer: "Finish the game", wrong: ["Burn the board", "Leave town", "Trap Van Pelt"], explanation: "The players must complete Jumanji." },
      { category: "creature", difficulty: "hard", question: "In Jumanji, what large animal stampede runs through the house and town?", answer: "Rhinos and other jungle animals", wrong: ["Dinosaurs only", "Horses", "Polar bears"], explanation: "The stampede is one of the film's biggest set pieces." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Jurassic Park",
    tmdbId: 329,
    facts: [
      { category: "science", difficulty: "easy", question: "In Jurassic Park, what is used to fill gaps in dinosaur DNA?", answer: "Frog DNA", wrong: ["Human DNA", "Fish DNA", "Bird DNA"], explanation: "Frog DNA helps explain the park's unexpected breeding problem." },
      { category: "character", difficulty: "easy", question: "In Jurassic Park, which mathematician warns that the park will fail?", answer: "Ian Malcolm", wrong: ["Alan Grant", "John Hammond", "Dennis Nedry"], explanation: "Malcolm's chaos theory warnings prove correct." },
      { category: "scene", difficulty: "medium", question: "In Jurassic Park, what object ripples before the T. rex appears?", answer: "A cup of water", wrong: ["A flashlight", "A rearview mirror", "A walkie-talkie"], explanation: "The rippling water signals the T. rex footsteps." },
      { category: "villain", difficulty: "medium", question: "In Jurassic Park, who shuts down the park systems to steal embryos?", answer: "Dennis Nedry", wrong: ["Ray Arnold", "Robert Muldoon", "Donald Gennaro"], explanation: "Nedry's sabotage unleashes disaster." },
      { category: "creature", difficulty: "hard", question: "In Jurassic Park, what dinosaurs stalk the children in the kitchen?", answer: "Velociraptors", wrong: ["Dilophosaurs", "Compsognathus", "Pteranodons"], explanation: "The kitchen raptor scene is one of the film's most tense moments." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Romancing the Stone",
    tmdbId: 9326,
    facts: [
      { category: "object", difficulty: "medium", question: "In Romancing the Stone, what valuable item is at the center of the adventure?", answer: "A large emerald", wrong: ["A cursed idol", "A golden skull", "A pirate coin"], explanation: "The gemstone is the treasure everyone wants." },
      { category: "character", difficulty: "easy", question: "In Romancing the Stone, what kind of writer is Joan Wilder?", answer: "Romance novelist", wrong: ["Travel journalist", "Archaeologist", "Lawyer"], explanation: "Joan's adventure mirrors the stories she writes." },
      { category: "setting", difficulty: "medium", question: "In Romancing the Stone, where does Joan's adventure take her?", answer: "Colombia", wrong: ["Egypt", "India", "Peru"], explanation: "Joan travels to Colombia after her sister is kidnapped." },
      { category: "ally", difficulty: "medium", question: "In Romancing the Stone, who becomes Joan's rugged guide?", answer: "Jack Colton", wrong: ["Ralph", "Ira", "Zolo"], explanation: "Jack helps Joan survive the jungle." },
      { category: "tone", difficulty: "hard", question: "In Romancing the Stone, what genre mix defines the film?", answer: "Adventure, comedy, and romance", wrong: ["Courtroom drama and horror", "Silent western", "War documentary"], explanation: "The film blends treasure adventure with romantic comedy." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Goonies",
    tmdbId: 9340,
    facts: [
      { category: "treasure", difficulty: "easy", question: "In The Goonies, whose treasure map launches the adventure?", answer: "One-Eyed Willy's", wrong: ["Blackbeard's", "Captain Kidd's", "Long John Silver's"], explanation: "The kids follow a map tied to One-Eyed Willy." },
      { category: "group", difficulty: "easy", question: "In The Goonies, what do the kids call themselves?", answer: "The Goonies", wrong: ["The Lost Boys", "The Explorers", "The Fratellis"], explanation: "The group name comes from their neighborhood, the Goon Docks." },
      { category: "villain", difficulty: "medium", question: "In The Goonies, what criminal family chases the kids?", answer: "The Fratellis", wrong: ["The Tannens", "The Wet Bandits", "The Russos"], explanation: "The Fratellis pursue the kids through the tunnels." },
      { category: "character", difficulty: "medium", question: "In The Goonies, which character befriends Sloth?", answer: "Chunk", wrong: ["Mikey", "Data", "Mouth"], explanation: "Chunk and Sloth form one of the film's sweetest bonds." },
      { category: "location", difficulty: "hard", question: "In The Goonies, what pirate ship do the kids discover underground?", answer: "The Inferno", wrong: ["The Black Pearl", "The Revenge", "The Hispaniola"], explanation: "The Inferno holds One-Eyed Willy's treasure." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Princess Bride",
    tmdbId: 2493,
    facts: [
      { category: "identity", difficulty: "easy", question: "In The Princess Bride, what masked identity does Westley take on?", answer: "The Dread Pirate Roberts", wrong: ["The Man in Blackbeard", "The Six-Fingered Man", "Prince Humperdinck"], explanation: "Westley returns under the Dread Pirate Roberts name." },
      { category: "quote", difficulty: "easy", question: "In The Princess Bride, what word does Vizzini keep saying?", answer: "Inconceivable", wrong: ["Assemble", "Unbelievable", "Impossible"], explanation: "Vizzini's repeated word becomes a running gag." },
      { category: "revenge", difficulty: "medium", question: "In The Princess Bride, who is Inigo Montoya seeking revenge against?", answer: "The six-fingered man", wrong: ["Vizzini", "Fezzik", "The Albino"], explanation: "Inigo's father was killed by Count Rugen." },
      { category: "location", difficulty: "medium", question: "In The Princess Bride, what dangerous area do Westley and Buttercup cross?", answer: "The Fire Swamp", wrong: ["The Mines of Moria", "The Bog of Doom", "The Dead Marshes"], explanation: "The Fire Swamp includes flame spurts, lightning sand, and ROUSes." },
      { category: "creature", difficulty: "hard", question: "In The Princess Bride, what does ROUS stand for?", answer: "Rodents of Unusual Size", wrong: ["Rats of Underworld Swamps", "Royal Order of Unseen Soldiers", "Riders of Upper Storm"], explanation: "The ROUS attack is one of the Fire Swamp hazards." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Lord of the Rings: The Fellowship of the Ring",
    tmdbId: 120,
    facts: [
      { category: "object", difficulty: "easy", question: "In The Fellowship of the Ring, what must Frodo carry to Mordor?", answer: "The One Ring", wrong: ["The Arkenstone", "The Elder Wand", "The Horn of Gondor"], explanation: "The Ring must be destroyed in Mount Doom." },
      { category: "group", difficulty: "easy", question: "In The Fellowship of the Ring, what group forms to protect the Ring-bearer?", answer: "The Fellowship", wrong: ["The Rohirrim", "The White Council", "The Rangers"], explanation: "The Fellowship includes hobbits, men, a dwarf, an elf, and a wizard." },
      { category: "location", difficulty: "medium", question: "In The Fellowship of the Ring, where is the Council of Elrond held?", answer: "Rivendell", wrong: ["Lothlorien", "Minas Tirith", "Isengard"], explanation: "The Council decides the fate of the Ring." },
      { category: "creature", difficulty: "medium", question: "In The Fellowship of the Ring, what creature does Gandalf battle in Moria?", answer: "A Balrog", wrong: ["A dragon", "A troll only", "A Nazgul"], explanation: "Gandalf confronts the Balrog on the bridge." },
      { category: "ending", difficulty: "hard", question: "In The Fellowship of the Ring, who dies defending Merry and Pippin?", answer: "Boromir", wrong: ["Aragorn", "Legolas", "Gimli"], explanation: "Boromir is redeemed while protecting the hobbits." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "King Kong",
    tmdbId: 254,
    facts: [
      { category: "creature", difficulty: "easy", question: "In King Kong, what giant creature is taken from Skull Island?", answer: "A giant ape", wrong: ["A dinosaur", "A sea monster", "A dragon"], explanation: "Kong is captured and brought to New York." },
      { category: "setting", difficulty: "easy", question: "In King Kong, what island is Kong discovered on?", answer: "Skull Island", wrong: ["Monster Island", "Isla Nublar", "Treasure Island"], explanation: "Skull Island is Kong's dangerous home." },
      { category: "character", difficulty: "medium", question: "In King Kong, who becomes emotionally connected to Kong?", answer: "Ann Darrow", wrong: ["Marion Ravenwood", "Evelyn Carnahan", "Sarah Harding"], explanation: "Ann's bond with Kong gives the spectacle emotional weight." },
      { category: "location", difficulty: "medium", question: "In King Kong, what New York landmark does Kong climb?", answer: "The Empire State Building", wrong: ["The Chrysler Building", "The Statue of Liberty", "Madison Square Garden"], explanation: "The skyscraper finale is iconic." },
      { category: "theme", difficulty: "hard", question: "In King Kong, what human flaw helps doom Kong?", answer: "Exploitation for spectacle", wrong: ["A search for immortality", "A curse from pirates", "A feud between wizards"], explanation: "Kong is turned into a showpiece and destroyed by human ambition." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Mask of Zorro",
    tmdbId: 9342,
    facts: [
      { category: "identity", difficulty: "easy", question: "In The Mask of Zorro, what masked hero identity is passed on?", answer: "Zorro", wrong: ["El Mariachi", "The Phantom", "The Shadow"], explanation: "The older Zorro trains a successor." },
      { category: "mentor", difficulty: "medium", question: "In The Mask of Zorro, who trains Alejandro to become the new Zorro?", answer: "Don Diego de la Vega", wrong: ["Captain Love", "Don Rafael", "Three-Fingered Jack"], explanation: "Don Diego prepares Alejandro for revenge and justice." },
      { category: "villain", difficulty: "medium", question: "In The Mask of Zorro, who is Don Diego's old enemy?", answer: "Don Rafael Montero", wrong: ["Captain Hook", "Barbossa", "Imhotep"], explanation: "Montero stole Diego's life and family." },
      { category: "weapon", difficulty: "easy", question: "In The Mask of Zorro, what weapon is Zorro most associated with?", answer: "A sword", wrong: ["A hammer", "A bow", "A laser pistol"], explanation: "Swordplay defines the Zorro adventure style." },
      { category: "relationship", difficulty: "hard", question: "In The Mask of Zorro, who is Elena revealed to be?", answer: "Don Diego's daughter", wrong: ["Alejandro's sister", "Montero's niece", "A royal spy"], explanation: "Elena's identity ties the revenge story to family restoration." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Uncharted",
    tmdbId: 335787,
    facts: [
      { category: "character", difficulty: "easy", question: "In Uncharted, what treasure hunter does Nathan Drake team up with?", answer: "Victor Sullivan", wrong: ["Indiana Jones", "Ben Gates", "Jack Colton"], explanation: "Sully recruits Nate into the treasure hunt." },
      { category: "treasure", difficulty: "medium", question: "In Uncharted, whose lost fortune are Nate and Sully chasing?", answer: "Magellan's expedition", wrong: ["One-Eyed Willy's treasure", "Blackbeard's chest", "The Ark of the Covenant"], explanation: "The treasure is tied to Ferdinand Magellan's voyage." },
      { category: "scene", difficulty: "medium", question: "In Uncharted, what cargo-plane set piece echoes the video games?", answer: "Nate falling through airborne cargo", wrong: ["A submarine chase", "A dinosaur stampede", "A train on the moon"], explanation: "The airborne cargo sequence is a major action scene." },
      { category: "motivation", difficulty: "hard", question: "In Uncharted, what personal mystery motivates Nate?", answer: "Finding clues about his brother Sam", wrong: ["Clearing his father's name", "Rescuing his daughter", "Breaking a family curse"], explanation: "Sam's disappearance motivates Nate beyond the treasure." },
      { category: "object", difficulty: "easy", question: "In Uncharted, what kind of clues help unlock the hunt?", answer: "Ancient crosses and keys", wrong: ["Dinosaur eggs", "Magic rings", "Crystal skulls only"], explanation: "The treasure hunt depends on paired artifacts and symbols." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Adventures of Tintin",
    tmdbId: 17578,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Adventures of Tintin, what is Tintin's dog named?", answer: "Snowy", wrong: ["Snoopy", "Toto", "Max"], explanation: "Snowy accompanies Tintin through the adventure." },
      { category: "object", difficulty: "medium", question: "In The Adventures of Tintin, what model ship contains an important clue?", answer: "The Unicorn", wrong: ["The Black Pearl", "The Inferno", "The Hispaniola"], explanation: "The model ship begins the treasure mystery." },
      { category: "ally", difficulty: "easy", question: "In The Adventures of Tintin, which sea captain becomes Tintin's ally?", answer: "Captain Haddock", wrong: ["Captain Hook", "Captain Nemo", "Captain Barbossa"], explanation: "Haddock's family history is tied to the treasure." },
      { category: "villain", difficulty: "medium", question: "In The Adventures of Tintin, who hunts the Unicorn clues?", answer: "Sakharine", wrong: ["Red Rackham", "Rastapopoulos", "Mola Ram"], explanation: "Sakharine seeks the secret hidden in the models." },
      { category: "set piece", difficulty: "hard", question: "In The Adventures of Tintin, what city chase turns into an elaborate downhill action sequence?", answer: "Bagghar", wrong: ["Paris", "London", "Marrakesh"], explanation: "The Bagghar chase is a major animated set piece." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Hook",
    tmdbId: 879,
    facts: [
      { category: "identity", difficulty: "easy", question: "In Hook, who has Peter Banning forgotten he used to be?", answer: "Peter Pan", wrong: ["Captain Hook", "Tinker Bell", "Smee"], explanation: "Peter must rediscover his identity as Pan." },
      { category: "villain", difficulty: "easy", question: "In Hook, who kidnaps Peter's children?", answer: "Captain Hook", wrong: ["Rufio", "Smee", "The Crocodile"], explanation: "Hook forces Peter to return to Neverland." },
      { category: "group", difficulty: "medium", question: "In Hook, who must Peter win back as their leader?", answer: "The Lost Boys", wrong: ["The Goonies", "The Fellowship", "The Pirates"], explanation: "The Lost Boys test whether Peter is still Pan." },
      { category: "character", difficulty: "medium", question: "In Hook, who leads the Lost Boys before Peter returns?", answer: "Rufio", wrong: ["Tootles", "Smee", "Jack"], explanation: "Rufio challenges Peter's claim to leadership." },
      { category: "theme", difficulty: "hard", question: "In Hook, what helps Peter fly again?", answer: "A happy thought", wrong: ["Pixie dust alone", "A magic sword", "A pirate map"], explanation: "Peter's happy thought reconnects him with his lost childhood." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The NeverEnding Story",
    tmdbId: 34584,
    facts: [
      { category: "world", difficulty: "easy", question: "In The NeverEnding Story, what fantasy realm is threatened?", answer: "Fantasia", wrong: ["Narnia", "Middle-earth", "Oz"], explanation: "Fantasia is disappearing because of the Nothing." },
      { category: "threat", difficulty: "medium", question: "In The NeverEnding Story, what force is destroying Fantasia?", answer: "The Nothing", wrong: ["The Shadow", "The Dark One", "The Void King"], explanation: "The Nothing consumes the fantasy world." },
      { category: "hero", difficulty: "easy", question: "In The NeverEnding Story, who is the young warrior sent on the quest?", answer: "Atreyu", wrong: ["Bastian", "Falkor", "Gmork"], explanation: "Atreyu journeys to save the Childlike Empress." },
      { category: "creature", difficulty: "medium", question: "In The NeverEnding Story, what kind of creature is Falkor?", answer: "A luckdragon", wrong: ["A griffin", "A unicorn", "A sandworm"], explanation: "Falkor helps Atreyu survive the quest." },
      { category: "ending", difficulty: "hard", question: "In The NeverEnding Story, what must Bastian give the Childlike Empress?", answer: "A new name", wrong: ["A magic sword", "A golden crown", "A secret map"], explanation: "Bastian's naming of the Empress helps restore Fantasia." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "time-travel-challenge",
    title: "The Time Machine",
    tmdbId: 2135,
    facts: [
      { category: "device", difficulty: "easy", question: "In The Time Machine, what invention lets the traveler visit distant eras?", answer: "A time machine", wrong: ["A stargate", "A submarine", "A dream recorder"], explanation: "The machine carries the traveler far into Earth's future." },
      { category: "future", difficulty: "medium", question: "In The Time Machine, what surface people does the traveler encounter in the far future?", answer: "Eloi", wrong: ["Morlocks", "Fremen", "Na'vi"], explanation: "The Eloi live above ground in the future world." },
      { category: "threat", difficulty: "medium", question: "In The Time Machine, what underground species preys on the Eloi?", answer: "Morlocks", wrong: ["Mimics", "Sentinels", "Heptapods"], explanation: "The Morlocks represent the darker side of the future society." },
      { category: "theme", difficulty: "hard", question: "In The Time Machine, what social idea is explored through the Eloi and Morlocks?", answer: "Class division taken to an extreme", wrong: ["A superhero civil war", "Pirate law", "Robot romance"], explanation: "The future species reflect separated social classes." },
      { category: "journey", difficulty: "hard", question: "In The Time Machine, what makes the adventure more than a simple rescue story?", answer: "It explores humanity's possible future", wrong: ["It stays in one room", "It ignores time travel", "It is only a courtroom case"], explanation: "The time journey becomes a warning about civilization." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Palm Springs",
    tmdbId: 587792,
    facts: [
      { category: "loop", difficulty: "easy", question: "In Palm Springs, what kind of event are Nyles and Sarah trapped repeating?", answer: "A wedding day", wrong: ["A school exam", "A bank robbery", "A space launch"], explanation: "The time loop repeats the same wedding day in Palm Springs." },
      { category: "character", difficulty: "medium", question: "In Palm Springs, who is already stuck in the loop before Sarah joins him?", answer: "Nyles", wrong: ["Roy", "Abe", "Howard"], explanation: "Nyles has been looping long enough to stop caring about consequences." },
      { category: "threat", difficulty: "medium", question: "In Palm Springs, who keeps hunting Nyles during the loop?", answer: "Roy", wrong: ["Abe", "Trevor", "Ted"], explanation: "Roy is dragged into the loop and takes revenge on Nyles." },
      { category: "solution", difficulty: "hard", question: "In Palm Springs, what scientific idea does Sarah pursue to escape the loop?", answer: "Blowing up the cave during the time reset", wrong: ["Freezing the wedding cake", "Hypnotizing Nyles", "Stealing a plane"], explanation: "Sarah studies the loop and tests an explosive escape plan." },
      { category: "theme", difficulty: "hard", question: "In Palm Springs, what changes the loop from pure comedy into a relationship story?", answer: "Sarah choosing accountability and connection", wrong: ["A treasure map", "A superhero team", "A pirate curse"], explanation: "The film uses the loop to explore growth and commitment." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Predestination",
    tmdbId: 206487,
    facts: [
      { category: "job", difficulty: "easy", question: "In Predestination, what kind of agent travels through time?", answer: "A temporal agent", wrong: ["A dream detective", "A pirate captain", "A museum guard"], explanation: "The agent works to prevent crimes through time travel." },
      { category: "target", difficulty: "medium", question: "In Predestination, who is the elusive bomber the agent pursues?", answer: "The Fizzle Bomber", wrong: ["The Rainmaker", "The Zodiac", "The Joker"], explanation: "The Fizzle Bomber is the mission's central target." },
      { category: "structure", difficulty: "hard", question: "In Predestination, what makes the story's identity twist so unusual?", answer: "Multiple key identities are tied to the same person", wrong: ["Everyone is a robot", "The story has no time travel", "The villain is a dinosaur"], explanation: "The film is built around a closed-loop identity paradox." },
      { category: "setting", difficulty: "medium", question: "In Predestination, where does the agent hear the life story that drives the plot?", answer: "A bar", wrong: ["A spaceship", "A school gym", "A pirate ship"], explanation: "The bar conversation frames much of the film." },
      { category: "theme", difficulty: "hard", question: "In Predestination, what paradox is most central to the story?", answer: "A self-creating causal loop", wrong: ["A simple treasure hunt", "A multiverse tournament", "A haunted house"], explanation: "The plot depends on causes and identities looping back on themselves." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "The Butterfly Effect",
    tmdbId: 1954,
    facts: [
      { category: "power", difficulty: "easy", question: "In The Butterfly Effect, how does Evan revisit moments from his past?", answer: "By reading his journals", wrong: ["By entering a phone booth", "By using a DeLorean", "By drinking a potion"], explanation: "Evan's journals trigger trips into his own past." },
      { category: "consequence", difficulty: "medium", question: "In The Butterfly Effect, what happens when Evan changes past events?", answer: "His present changes in unexpected ways", wrong: ["Nothing changes", "Only the weather changes", "He becomes invisible"], explanation: "Small changes create large and often tragic consequences." },
      { category: "relationship", difficulty: "medium", question: "In The Butterfly Effect, who is central to Evan's attempts to fix the past?", answer: "Kayleigh", wrong: ["Rita", "Mary", "Sarah Connor"], explanation: "Evan repeatedly tries to improve Kayleigh's life." },
      { category: "theme", difficulty: "hard", question: "In The Butterfly Effect, what idea gives the movie its title?", answer: "Small actions can create huge consequences", wrong: ["Butterflies can time travel", "Dreams predict insects", "A superhero controls weather"], explanation: "The title references chaos theory's butterfly effect." },
      { category: "tone", difficulty: "hard", question: "In The Butterfly Effect, how is time travel mainly treated?", answer: "As a source of trauma and unintended consequences", wrong: ["As a carefree vacation", "As a sports competition", "As a musical fantasy"], explanation: "Each fix tends to damage another part of Evan's life." },
    ],
  },
  {
    slug: "time-travel-challenge",
    title: "Time After Time",
    tmdbId: 24750,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Time After Time, which famous author uses a time machine?", answer: "H. G. Wells", wrong: ["Jules Verne", "Mary Shelley", "Arthur Conan Doyle"], explanation: "The film imagines Wells pursuing a killer into the future." },
      { category: "villain", difficulty: "medium", question: "In Time After Time, which infamous killer escapes into the future?", answer: "Jack the Ripper", wrong: ["The Zodiac Killer", "Sweeney Todd", "Professor Moriarty"], explanation: "Jack the Ripper uses Wells' machine to flee Victorian London." },
      { category: "setting", difficulty: "medium", question: "In Time After Time, what modern city does Wells arrive in?", answer: "San Francisco", wrong: ["New York", "London", "Chicago"], explanation: "The future setting contrasts with Wells' Victorian ideals." },
      { category: "theme", difficulty: "hard", question: "In Time After Time, what surprises Wells about the future?", answer: "It is more violent than he expected", wrong: ["It has no technology", "It is ruled by pirates", "It has no cities"], explanation: "The future challenges Wells' utopian expectations." },
      { category: "genre", difficulty: "hard", question: "In Time After Time, what genre blend defines the film?", answer: "Time-travel thriller and romance", wrong: ["Animated musical", "Silent western", "Sports documentary"], explanation: "The film mixes pursuit, time travel, and romantic connection." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "adventure-pack",
    title: "Lara Croft: Tomb Raider",
    tmdbId: 1995,
    facts: [
      { category: "hero", difficulty: "easy", question: "In Lara Croft: Tomb Raider, what is Lara Croft best known as?", answer: "An adventurer and tomb raider", wrong: ["A weather reporter", "A pirate queen", "A space pilot"], explanation: "Lara explores tombs and hunts ancient artifacts." },
      { category: "object", difficulty: "medium", question: "In Lara Croft: Tomb Raider, what ancient object is tied to planetary alignment?", answer: "The Triangle of Light", wrong: ["The Ark of the Covenant", "The Holy Grail", "The One Ring"], explanation: "The artifact can control time when assembled." },
      { category: "home", difficulty: "easy", question: "In Lara Croft: Tomb Raider, where does Lara train and store her gear?", answer: "Croft Manor", wrong: ["Wayne Manor", "Rivendell", "The Black Pearl"], explanation: "Croft Manor is Lara's base of operations." },
      { category: "villain", difficulty: "hard", question: "In Lara Croft: Tomb Raider, what secret society is after the artifact?", answer: "The Illuminati", wrong: ["The Fratellis", "The IMF", "The Lost Boys"], explanation: "The Illuminati want the Triangle's power." },
      { category: "style", difficulty: "medium", question: "In Lara Croft: Tomb Raider, what defines Lara's adventure style?", answer: "Acrobatics, gadgets, and artifact hunting", wrong: ["Courtroom speeches", "Cooking contests", "Submarine diplomacy"], explanation: "The film adapts the action-adventure style of the games." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Journey to the Center of the Earth",
    tmdbId: 88751,
    facts: [
      { category: "destination", difficulty: "easy", question: "In Journey to the Center of the Earth, where does the expedition travel?", answer: "Beneath Earth's surface", wrong: ["To Mars", "Across the ocean only", "Into cyberspace"], explanation: "The adventure is built around a hidden world underground." },
      { category: "source", difficulty: "medium", question: "In Journey to the Center of the Earth, what classic author inspires the adventure?", answer: "Jules Verne", wrong: ["H. G. Wells", "Mary Shelley", "Bram Stoker"], explanation: "The story draws from Verne's adventure novel." },
      { category: "creature", difficulty: "medium", question: "In Journey to the Center of the Earth, what prehistoric creatures add danger underground?", answer: "Dinosaurs", wrong: ["Xenomorphs", "Dragons only", "Werewolves"], explanation: "The hidden world contains prehistoric threats." },
      { category: "setting", difficulty: "hard", question: "In Journey to the Center of the Earth, what kind of landscape makes the underground world feel fantastical?", answer: "A vast subterranean environment", wrong: ["A normal office", "A single courtroom", "A city bus"], explanation: "The underground world is treated as an enormous lost realm." },
      { category: "tone", difficulty: "easy", question: "In Journey to the Center of the Earth, what kind of adventure is emphasized?", answer: "Family-friendly exploration", wrong: ["Political satire", "Crime noir", "Medical drama"], explanation: "The film is designed as a broad exploration adventure." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "Sahara",
    tmdbId: 7364,
    facts: [
      { category: "hero", difficulty: "easy", question: "In Sahara, who leads the treasure-hunting adventure?", answer: "Dirk Pitt", wrong: ["Indiana Jones", "Ben Gates", "Allan Quatermain"], explanation: "Dirk Pitt is the film's adventurous lead." },
      { category: "mystery", difficulty: "medium", question: "In Sahara, what historical object is Dirk searching for?", answer: "A lost Civil War ironclad", wrong: ["The Holy Grail", "A pirate crown", "A moon rock"], explanation: "The mystery involves a Confederate ironclad rumored to be in Africa." },
      { category: "setting", difficulty: "easy", question: "In Sahara, what desert region gives the adventure its title?", answer: "The Sahara", wrong: ["The Gobi", "The Mojave", "The Kalahari only"], explanation: "The adventure unfolds across desert terrain." },
      { category: "ally", difficulty: "medium", question: "In Sahara, who is Dirk Pitt's close friend and partner?", answer: "Al Giordino", wrong: ["Riley Poole", "Short Round", "Sallah"], explanation: "Al joins Dirk through the film's action and comedy beats." },
      { category: "threat", difficulty: "hard", question: "In Sahara, what broader crisis intersects with the treasure hunt?", answer: "A toxic contamination threat", wrong: ["A dinosaur outbreak", "A wizard war", "A vampire plague"], explanation: "The adventure connects treasure hunting with environmental danger." },
    ],
  },
  {
    slug: "adventure-pack",
    title: "The Treasure of the Sierra Madre",
    tmdbId: 3090,
    facts: [
      { category: "goal", difficulty: "easy", question: "In The Treasure of the Sierra Madre, what are the prospectors searching for?", answer: "Gold", wrong: ["Diamonds", "Oil", "A pirate map"], explanation: "The hunt for gold drives the story." },
      { category: "theme", difficulty: "medium", question: "In The Treasure of the Sierra Madre, what emotion corrodes the prospectors' partnership?", answer: "Greed", wrong: ["Stage fright", "Homesickness", "Romantic jealousy only"], explanation: "Greed and suspicion destroy trust." },
      { category: "character", difficulty: "medium", question: "In The Treasure of the Sierra Madre, which character becomes increasingly paranoid?", answer: "Fred C. Dobbs", wrong: ["Howard", "Curtin", "Gold Hat"], explanation: "Dobbs' paranoia is central to the tragedy." },
      { category: "quote", difficulty: "hard", question: "In The Treasure of the Sierra Madre, what line about badges became famous?", answer: "We don't need no stinking badges", wrong: ["Here's looking at you", "Rosebud", "I'll be back"], explanation: "The bandit line became one of classic cinema's most quoted moments." },
      { category: "ending", difficulty: "hard", question: "In The Treasure of the Sierra Madre, what happens to much of the gold dust?", answer: "It is blown away by the wind", wrong: ["It is locked in a museum", "It becomes a crown", "It sinks with a ship"], explanation: "The ending underlines the futility of the characters' greed." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Snow White and the Seven Dwarfs",
    tmdbId: 408,
    facts: [
      { category: "characters", difficulty: "easy", question: "In Snow White and the Seven Dwarfs, what object does the Evil Queen use to disguise herself?", answer: "A magic potion", wrong: ["A glass slipper", "A spinning wheel", "A cursed mirror"], explanation: "The Queen drinks a potion to become the old peddler woman." },
      { category: "object", difficulty: "easy", question: "In Snow White and the Seven Dwarfs, what poisoned fruit does Snow White eat?", answer: "An apple", wrong: ["A pear", "A plum", "A peach"], explanation: "The poisoned apple sends Snow White into an enchanted sleep." },
      { category: "group", difficulty: "medium", question: "In Snow White and the Seven Dwarfs, where does Snow White find shelter?", answer: "The dwarfs' cottage", wrong: ["A royal tower", "A village inn", "A ship"], explanation: "Snow White stays in the cottage after fleeing into the forest." },
      { category: "villain", difficulty: "medium", question: "In Snow White and the Seven Dwarfs, what does the Queen ask the mirror?", answer: "Who is the fairest of them all?", wrong: ["Where is the lost crown?", "Who stole the apple?", "When will winter end?"], explanation: "The mirror's answer fuels the Queen's jealousy." },
      { category: "ending", difficulty: "hard", question: "In Snow White and the Seven Dwarfs, what awakens Snow White?", answer: "Love's first kiss", wrong: ["A magic lamp", "A fairy wand", "The mirror breaking"], explanation: "The prince's kiss breaks the spell." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Cinderella",
    tmdbId: 11224,
    facts: [
      { category: "object", difficulty: "easy", question: "In Cinderella, what shoe is used to identify Cinderella?", answer: "A glass slipper", wrong: ["A golden boot", "A ruby shoe", "A silver sandal"], explanation: "The glass slipper is the clue the prince uses to find her." },
      { category: "magic", difficulty: "easy", question: "In Cinderella, who transforms Cinderella's clothes for the ball?", answer: "The Fairy Godmother", wrong: ["Lady Tremaine", "Anastasia", "Jaq"], explanation: "The Fairy Godmother gives Cinderella her gown and coach." },
      { category: "deadline", difficulty: "medium", question: "In Cinderella, when does the magic wear off?", answer: "Midnight", wrong: ["Sunrise", "Noon", "Dawn"], explanation: "Cinderella must leave the ball before midnight." },
      { category: "animals", difficulty: "medium", question: "In Cinderella, which mice help Cinderella?", answer: "Jaq and Gus", wrong: ["Timon and Pumbaa", "Chip and Dale", "Bernard and Bianca"], explanation: "Jaq and Gus are among Cinderella's loyal mouse friends." },
      { category: "villain", difficulty: "hard", question: "In Cinderella, who locks Cinderella in her room before the slipper fitting?", answer: "Lady Tremaine", wrong: ["The Duke", "Lucifer", "The King"], explanation: "Lady Tremaine tries to stop Cinderella from proving her identity." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "The Little Mermaid",
    tmdbId: 10144,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Little Mermaid, what is Ariel fascinated by?", answer: "The human world", wrong: ["Pirate treasure only", "The underworld", "A magic carpet"], explanation: "Ariel collects human objects and dreams about life above the sea." },
      { category: "villain", difficulty: "easy", question: "In The Little Mermaid, who gives Ariel legs in exchange for her voice?", answer: "Ursula", wrong: ["Maleficent", "Mother Gothel", "Yzma"], explanation: "Ursula makes the dangerous bargain with Ariel." },
      { category: "object", difficulty: "medium", question: "In The Little Mermaid, what does Ariel call a fork?", answer: "A dinglehopper", wrong: ["A snarfblatt", "A thingamabob", "A whosawhatsit"], explanation: "Scuttle incorrectly identifies the fork for Ariel." },
      { category: "relationship", difficulty: "medium", question: "In The Little Mermaid, who is Ariel's father?", answer: "King Triton", wrong: ["Prince Eric", "Sebastian", "Flounder"], explanation: "King Triton rules Atlantica and worries about Ariel." },
      { category: "ending", difficulty: "hard", question: "In The Little Mermaid, what must Ariel receive before sunset on the third day?", answer: "True love's kiss", wrong: ["A golden trident", "A new shell", "A royal crown"], explanation: "The kiss is part of Ursula's bargain." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Beauty and the Beast",
    tmdbId: 10020,
    facts: [
      { category: "object", difficulty: "easy", question: "In Beauty and the Beast, what enchanted object marks the Beast's deadline?", answer: "A rose", wrong: ["A mirror", "A clock", "A book"], explanation: "The rose petals fall as time runs out." },
      { category: "character", difficulty: "easy", question: "In Beauty and the Beast, what does Belle love to do?", answer: "Read books", wrong: ["Race horses", "Build ships", "Paint crowns"], explanation: "Belle is known for her love of books and imagination." },
      { category: "villain", difficulty: "medium", question: "In Beauty and the Beast, who leads the village attack on the castle?", answer: "Gaston", wrong: ["Maurice", "Lumiere", "Cogsworth"], explanation: "Gaston turns the village against the Beast." },
      { category: "magic", difficulty: "medium", question: "In Beauty and the Beast, what happens to the castle servants?", answer: "They become enchanted objects", wrong: ["They turn invisible", "They become dragons", "They leave the castle"], explanation: "The curse transforms them into household objects." },
      { category: "theme", difficulty: "hard", question: "In Beauty and the Beast, what breaks the curse?", answer: "The Beast learning to love and be loved", wrong: ["Gaston winning a duel", "Belle burning the rose", "Maurice fixing a clock"], explanation: "The curse ends when love is returned before the rose dies." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Aladdin",
    tmdbId: 812,
    facts: [
      { category: "object", difficulty: "easy", question: "In Aladdin, what magical object does Aladdin find?", answer: "A lamp", wrong: ["A mirror", "A wand", "A crown"], explanation: "The lamp contains the Genie." },
      { category: "character", difficulty: "easy", question: "In Aladdin, who lives inside the magic lamp?", answer: "The Genie", wrong: ["Jafar", "Abu", "Iago"], explanation: "The Genie grants wishes to the lamp's master." },
      { category: "villain", difficulty: "medium", question: "In Aladdin, who wants the lamp for himself?", answer: "Jafar", wrong: ["The Sultan", "Razoul", "Cassim"], explanation: "Jafar seeks the lamp to gain power." },
      { category: "disguise", difficulty: "medium", question: "In Aladdin, what royal identity does Aladdin pretend to have?", answer: "Prince Ali", wrong: ["King Agrabah", "Lord Jafar", "Captain Abu"], explanation: "Aladdin uses a wish to appear as Prince Ali." },
      { category: "ending", difficulty: "hard", question: "In Aladdin, what does Aladdin use his final wish for?", answer: "Freeing the Genie", wrong: ["Becoming sultan", "A bigger palace", "Destroying Agrabah"], explanation: "Aladdin keeps his promise and frees the Genie." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "The Lion King",
    tmdbId: 8587,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Lion King, who is Simba's father?", answer: "Mufasa", wrong: ["Scar", "Timon", "Rafiki"], explanation: "Mufasa teaches Simba about the Pride Lands." },
      { category: "villain", difficulty: "easy", question: "In The Lion King, who plots against Mufasa and Simba?", answer: "Scar", wrong: ["Zazu", "Pumbaa", "Nala"], explanation: "Scar wants to take the throne." },
      { category: "phrase", difficulty: "medium", question: "In The Lion King, what phrase do Timon and Pumbaa teach Simba?", answer: "Hakuna Matata", wrong: ["Circle of Life", "Be Prepared", "Can You Feel It"], explanation: "The phrase means no worries." },
      { category: "location", difficulty: "medium", question: "In The Lion King, where is Simba presented as a cub?", answer: "Pride Rock", wrong: ["Elephant Graveyard", "The Oasis", "Agrabah"], explanation: "Rafiki presents Simba from Pride Rock." },
      { category: "story", difficulty: "hard", question: "In The Lion King, what convinces Simba to return home?", answer: "He accepts his responsibility as king", wrong: ["He finds a magic lamp", "He wins a race", "He becomes a pirate"], explanation: "Simba stops running from his past and returns to challenge Scar." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Mulan",
    tmdbId: 10674,
    facts: [
      { category: "story", difficulty: "easy", question: "In Mulan, why does Mulan join the army?", answer: "To protect her father", wrong: ["To find treasure", "To become emperor", "To win a singing contest"], explanation: "Mulan takes her father's place because he is injured." },
      { category: "sidekick", difficulty: "easy", question: "In Mulan, what dragon helps Mulan?", answer: "Mushu", wrong: ["Cri-Kee", "Khan", "Shan Yu"], explanation: "Mushu becomes Mulan's comic guardian." },
      { category: "villain", difficulty: "medium", question: "In Mulan, who leads the invading army?", answer: "Shan Yu", wrong: ["Li Shang", "Chi-Fu", "Yao"], explanation: "Shan Yu leads the Hun invasion." },
      { category: "battle", difficulty: "medium", question: "In Mulan, how does Mulan stop the mountain attack?", answer: "She triggers an avalanche", wrong: ["She summons a dragon army", "She builds a wall", "She floods the palace"], explanation: "Mulan uses a cannon to cause the avalanche." },
      { category: "identity", difficulty: "hard", question: "In Mulan, what name does Mulan use while disguised as a soldier?", answer: "Ping", wrong: ["Ling", "Shang", "Fa Zhou"], explanation: "Mulan serves under the name Ping." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Lilo & Stitch",
    tmdbId: 11544,
    facts: [
      { category: "character", difficulty: "easy", question: "In Lilo & Stitch, what experiment number is Stitch?", answer: "626", wrong: ["101", "404", "747"], explanation: "Stitch is Experiment 626." },
      { category: "setting", difficulty: "easy", question: "In Lilo & Stitch, where does Lilo live?", answer: "Hawaii", wrong: ["Florida", "Paris", "Australia"], explanation: "The film is set in Hawaii." },
      { category: "family", difficulty: "medium", question: "In Lilo & Stitch, who is Lilo's older sister and guardian?", answer: "Nani", wrong: ["Jumba", "Pleakley", "Mertle"], explanation: "Nani is trying to keep their family together." },
      { category: "theme", difficulty: "medium", question: "In Lilo & Stitch, what does ohana mean?", answer: "Family", wrong: ["Magic", "Ocean", "Music"], explanation: "The film's central idea is that family means nobody gets left behind." },
      { category: "alien", difficulty: "hard", question: "In Lilo & Stitch, who created Stitch?", answer: "Jumba", wrong: ["Pleakley", "Cobra Bubbles", "Gantu"], explanation: "Jumba is the scientist behind Experiment 626." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Frozen",
    tmdbId: 109445,
    facts: [
      { category: "power", difficulty: "easy", question: "In Frozen, what power does Elsa have?", answer: "Ice and snow magic", wrong: ["Fire magic", "Time travel", "Talking to animals"], explanation: "Elsa can create ice and snow." },
      { category: "family", difficulty: "easy", question: "In Frozen, who is Elsa's sister?", answer: "Anna", wrong: ["Rapunzel", "Moana", "Belle"], explanation: "Anna spends the story trying to reconnect with Elsa." },
      { category: "sidekick", difficulty: "medium", question: "In Frozen, what kind of creature is Olaf?", answer: "A snowman", wrong: ["A reindeer", "A troll", "A dragon"], explanation: "Olaf is a living snowman created by Elsa's magic." },
      { category: "twist", difficulty: "medium", question: "In Frozen, who is revealed as a villain late in the story?", answer: "Hans", wrong: ["Kristoff", "Sven", "Oaken"], explanation: "Hans uses Anna's trust for power." },
      { category: "ending", difficulty: "hard", question: "In Frozen, what act saves Anna?", answer: "An act of true love from Anna herself", wrong: ["A kiss from Hans", "A spell from Olaf", "A royal decree"], explanation: "Anna sacrifices herself for Elsa, breaking the curse." },
    ],
  },
  {
    slug: "ultimate-disney-animation-challenge",
    title: "Moana",
    tmdbId: 277834,
    facts: [
      { category: "quest", difficulty: "easy", question: "In Moana, what must Moana return?", answer: "The heart of Te Fiti", wrong: ["A glass slipper", "A magic lamp", "A golden fleece"], explanation: "Moana's voyage is centered on restoring the heart." },
      { category: "character", difficulty: "easy", question: "In Moana, who is the demigod Moana seeks?", answer: "Maui", wrong: ["Tamatoa", "Hei Hei", "Tui"], explanation: "Moana needs Maui's help to restore the heart." },
      { category: "animal", difficulty: "medium", question: "In Moana, what animal is Hei Hei?", answer: "A rooster", wrong: ["A pig", "A crab", "A turtle"], explanation: "Hei Hei accidentally joins Moana's voyage." },
      { category: "villain", difficulty: "medium", question: "In Moana, what giant crab loves shiny objects?", answer: "Tamatoa", wrong: ["Te Ka", "Pua", "Chief Tui"], explanation: "Tamatoa hoards shiny treasures in Lalotai." },
      { category: "reveal", difficulty: "hard", question: "In Moana, who is Te Ka revealed to truly be?", answer: "Te Fiti without her heart", wrong: ["Maui's sister", "A sea monster only", "A cursed island chief"], explanation: "Restoring the heart transforms Te Ka back into Te Fiti." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "ultimate-simpsons-challenge",
    title: "The Simpsons",
    tmdbId: 456,
    mediaType: "tv",
    facts: [
      { category: "family", difficulty: "easy", question: "In The Simpsons, what is the family's last name?", answer: "Simpson", wrong: ["Flanders", "Burns", "Wiggum"], explanation: "The show follows Homer, Marge, Bart, Lisa, and Maggie Simpson." },
      { category: "setting", difficulty: "easy", question: "In The Simpsons, what town does the family live in?", answer: "Springfield", wrong: ["Shelbyville", "Quahog", "South Park"], explanation: "Springfield is the show's central setting." },
      { category: "job", difficulty: "medium", question: "In The Simpsons, where does Homer work?", answer: "The nuclear power plant", wrong: ["The Kwik-E-Mart", "The school", "The courthouse"], explanation: "Homer works at the Springfield Nuclear Power Plant." },
      { category: "catchphrase", difficulty: "easy", question: "In The Simpsons, what is Homer's famous frustrated exclamation?", answer: "D'oh!", wrong: ["Ay caramba!", "Excellent", "Okily dokily"], explanation: "D'oh is Homer's signature reaction." },
      { category: "neighbor", difficulty: "medium", question: "In The Simpsons, who is the Simpsons' very friendly neighbor?", answer: "Ned Flanders", wrong: ["Moe Szyslak", "Barney Gumble", "Chief Wiggum"], explanation: "Ned is Homer's cheerful next-door neighbor." },
      { category: "school", difficulty: "easy", question: "In The Simpsons, who is Bart's principal?", answer: "Principal Skinner", wrong: ["Mr. Burns", "Waylon Smithers", "Kent Brockman"], explanation: "Skinner runs Springfield Elementary." },
      { category: "teacher", difficulty: "medium", question: "In The Simpsons, who teaches Bart's class for many seasons?", answer: "Edna Krabappel", wrong: ["Agnes Skinner", "Helen Lovejoy", "Luann Van Houten"], explanation: "Mrs. Krabappel is Bart's teacher." },
      { category: "music", difficulty: "easy", question: "In The Simpsons, what instrument does Lisa play?", answer: "Saxophone", wrong: ["Trombone", "Drums", "Violin"], explanation: "Lisa is strongly associated with her saxophone." },
      { category: "baby", difficulty: "easy", question: "In The Simpsons, what does Maggie usually have in her mouth?", answer: "A pacifier", wrong: ["A whistle", "A lollipop", "A pencil"], explanation: "Maggie's pacifier is one of her defining traits." },
      { category: "business", difficulty: "medium", question: "In The Simpsons, who owns the Kwik-E-Mart?", answer: "Apu Nahasapeemapetilon", wrong: ["Moe Szyslak", "Cletus Spuckler", "Krusty"], explanation: "Apu is the longtime Kwik-E-Mart clerk and owner." },
      { category: "bar", difficulty: "easy", question: "In The Simpsons, who owns Moe's Tavern?", answer: "Moe Szyslak", wrong: ["Barney Gumble", "Lenny Leonard", "Carl Carlson"], explanation: "Moe runs the bar where Homer often drinks." },
      { category: "boss", difficulty: "easy", question: "In The Simpsons, who is Homer's boss?", answer: "Mr. Burns", wrong: ["Smithers", "Krusty", "Mayor Quimby"], explanation: "Mr. Burns owns the nuclear plant." },
      { category: "assistant", difficulty: "medium", question: "In The Simpsons, who is Mr. Burns' devoted assistant?", answer: "Waylon Smithers", wrong: ["Lenny", "Carl", "Gil"], explanation: "Smithers is fiercely loyal to Burns." },
      { category: "comedy", difficulty: "medium", question: "In The Simpsons, what clown hosts a children's TV show?", answer: "Krusty the Clown", wrong: ["Sideshow Bob", "Troy McClure", "Rainier Wolfcastle"], explanation: "Krusty is Bart and Lisa's favorite TV clown." },
      { category: "villain", difficulty: "medium", question: "In The Simpsons, who repeatedly tries to get revenge on Bart?", answer: "Sideshow Bob", wrong: ["Milhouse", "Ralph", "Nelson"], explanation: "Sideshow Bob becomes Bart's recurring enemy." },
      { category: "friend", difficulty: "easy", question: "In The Simpsons, who is Bart's best friend?", answer: "Milhouse Van Houten", wrong: ["Nelson Muntz", "Ralph Wiggum", "Martin Prince"], explanation: "Milhouse is Bart's loyal friend." },
      { category: "bully", difficulty: "easy", question: "In The Simpsons, who is known for saying 'Ha-ha'?", answer: "Nelson Muntz", wrong: ["Ralph Wiggum", "Martin Prince", "Todd Flanders"], explanation: "Nelson's laugh is one of his trademarks." },
      { category: "police", difficulty: "medium", question: "In The Simpsons, who is Springfield's police chief?", answer: "Chief Wiggum", wrong: ["Eddie", "Lou", "Mayor Quimby"], explanation: "Chief Wiggum leads Springfield's police." },
      { category: "news", difficulty: "medium", question: "In The Simpsons, who anchors Springfield's local news?", answer: "Kent Brockman", wrong: ["Troy McClure", "Lionel Hutz", "Gil Gunderson"], explanation: "Kent Brockman is the town's TV news anchor." },
      { category: "mayor", difficulty: "medium", question: "In The Simpsons, who is Springfield's mayor?", answer: "Mayor Quimby", wrong: ["Mr. Burns", "Principal Skinner", "Reverend Lovejoy"], explanation: "Quimby is Springfield's frequently scandal-prone mayor." },
      { category: "religion", difficulty: "medium", question: "In The Simpsons, who is Springfield's reverend?", answer: "Reverend Lovejoy", wrong: ["Ned Flanders", "Groundskeeper Willie", "Dr. Hibbert"], explanation: "Lovejoy leads the town's church." },
      { category: "doctor", difficulty: "easy", question: "In The Simpsons, who is Springfield's family doctor?", answer: "Dr. Hibbert", wrong: ["Dr. Nick", "Professor Frink", "Dr. Marvin Monroe"], explanation: "Dr. Hibbert often treats Springfield residents." },
      { category: "science", difficulty: "medium", question: "In The Simpsons, who is Springfield's eccentric scientist?", answer: "Professor Frink", wrong: ["Disco Stu", "Hans Moleman", "Kirk Van Houten"], explanation: "Professor Frink is known for strange inventions." },
      { category: "groundskeeper", difficulty: "easy", question: "In The Simpsons, who is the Scottish groundskeeper at Springfield Elementary?", answer: "Groundskeeper Willie", wrong: ["Barney Gumble", "Cletus Spuckler", "Otto Mann"], explanation: "Willie works at the school and has a strong Scottish identity." },
      { category: "driver", difficulty: "easy", question: "In The Simpsons, who drives the school bus?", answer: "Otto Mann", wrong: ["Snake", "Comic Book Guy", "Duffman"], explanation: "Otto is Springfield Elementary's bus driver." },
      { category: "shop", difficulty: "medium", question: "In The Simpsons, who runs The Android's Dungeon comic shop?", answer: "Comic Book Guy", wrong: ["Krusty", "Apu", "Gil"], explanation: "Comic Book Guy owns the comic book store." },
      { category: "catchphrase", difficulty: "easy", question: "In The Simpsons, which character says 'Ay caramba'?", answer: "Bart Simpson", wrong: ["Homer Simpson", "Lisa Simpson", "Maggie Simpson"], explanation: "Ay caramba is one of Bart's catchphrases." },
      { category: "catchphrase", difficulty: "medium", question: "In The Simpsons, which character says 'Excellent' while steepling his fingers?", answer: "Mr. Burns", wrong: ["Smithers", "Sideshow Bob", "Principal Skinner"], explanation: "Burns says it when scheming or pleased." },
      { category: "catchphrase", difficulty: "medium", question: "In The Simpsons, who says 'Okily dokily'?", answer: "Ned Flanders", wrong: ["Homer Simpson", "Moe Szyslak", "Chief Wiggum"], explanation: "Flanders' cheerful language is part of his character." },
      { category: "food", difficulty: "easy", question: "In The Simpsons, what food is Homer especially obsessed with?", answer: "Donuts", wrong: ["Sushi", "Salad", "Tacos only"], explanation: "Donuts are a recurring Homer obsession." },
      { category: "pet", difficulty: "easy", question: "In The Simpsons, what is the family's dog named?", answer: "Santa's Little Helper", wrong: ["Snowball II", "Laddie", "Blinky"], explanation: "Santa's Little Helper joins the family in the first full episode." },
      { category: "pet", difficulty: "medium", question: "In The Simpsons, what is the Simpson family's cat commonly called?", answer: "Snowball II", wrong: ["Scratchy", "Jub-Jub", "Plopper"], explanation: "Snowball II is the family's familiar cat name." },
      { category: "movie", difficulty: "easy", question: "In The Simpsons Movie, what animal does Homer adopt?", answer: "A pig", wrong: ["A goat", "A raccoon", "A horse"], explanation: "Homer adopts the pig that becomes known as Spider-Pig." },
      { category: "movie", difficulty: "medium", question: "In The Simpsons Movie, what is placed over Springfield?", answer: "A giant dome", wrong: ["A force field from aliens", "A mountain", "A glass castle"], explanation: "The dome traps Springfield after the pollution crisis." },
      { category: "movie", difficulty: "medium", question: "In The Simpsons Movie, what lake becomes dangerously polluted?", answer: "Lake Springfield", wrong: ["Lake Shelbyville", "Crystal Lake", "Walden Pond"], explanation: "Homer's silo of waste pushes the lake crisis over the edge." },
      { category: "movie", difficulty: "hard", question: "In The Simpsons Movie, what agency responds to Springfield's pollution crisis?", answer: "The EPA", wrong: ["NASA", "The FBI only", "The DMV"], explanation: "The Environmental Protection Agency takes drastic action." },
      { category: "movie", difficulty: "hard", question: "In The Simpsons Movie, what name is given to Homer's pig gag?", answer: "Spider-Pig", wrong: ["Bat-Pig", "Super-Ham", "Pork Knight"], explanation: "Spider-Pig became one of the movie's breakout jokes." },
      { category: "family", difficulty: "medium", question: "In The Simpsons, what is Marge's distinctive hair color?", answer: "Blue", wrong: ["Green", "Red", "Purple"], explanation: "Marge's tall blue hair is instantly recognizable." },
      { category: "family", difficulty: "hard", question: "In The Simpsons, what is Marge's maiden name?", answer: "Bouvier", wrong: ["Wiggum", "Van Houten", "Lovejoy"], explanation: "Marge is part of the Bouvier family." },
      { category: "sisters", difficulty: "medium", question: "In The Simpsons, what are Marge's twin sisters named?", answer: "Patty and Selma", wrong: ["Sherri and Terri", "Maude and Helen", "Agnes and Edna"], explanation: "Patty and Selma often criticize Homer." },
      { category: "sisters", difficulty: "hard", question: "In The Simpsons, where do Patty and Selma work?", answer: "The DMV", wrong: ["The Kwik-E-Mart", "Moe's Tavern", "Springfield Elementary"], explanation: "They work at the Department of Motor Vehicles." },
      { category: "students", difficulty: "easy", question: "In The Simpsons, who is Chief Wiggum's son?", answer: "Ralph Wiggum", wrong: ["Milhouse", "Nelson", "Martin"], explanation: "Ralph is one of Springfield Elementary's most memorable students." },
      { category: "students", difficulty: "medium", question: "In The Simpsons, who is the brainy student often compared with Bart?", answer: "Martin Prince", wrong: ["Dolph", "Kearney", "Jimbo"], explanation: "Martin is academically gifted and often teased." },
      { category: "friends", difficulty: "medium", question: "In The Simpsons, who are Homer's close friends at the power plant?", answer: "Lenny and Carl", wrong: ["Eddie and Lou", "Patty and Selma", "Rod and Todd"], explanation: "Lenny and Carl often appear with Homer at work and Moe's." },
      { category: "bar", difficulty: "hard", question: "In The Simpsons, who is Homer's heavy-drinking bar friend?", answer: "Barney Gumble", wrong: ["Duffman", "Snake", "Disco Stu"], explanation: "Barney is one of Moe's Tavern's regulars." },
      { category: "criminal", difficulty: "hard", question: "In The Simpsons, what recurring criminal is often just called Snake?", answer: "Snake Jailbird", wrong: ["Fat Tony", "Louie", "Johnny Tightlips"], explanation: "Snake Jailbird is Springfield's recurring petty criminal." },
      { category: "mob", difficulty: "hard", question: "In The Simpsons, who is Springfield's mob boss?", answer: "Fat Tony", wrong: ["Sideshow Mel", "Lionel Hutz", "Hank Scorpio"], explanation: "Fat Tony leads Springfield's organized crime jokes." },
      { category: "work", difficulty: "hard", question: "In The Simpsons, who is Homer's safety inspector co-worker with glasses?", answer: "Carl Carlson", wrong: ["Gil Gunderson", "Kirk Van Houten", "Herman Hermann"], explanation: "Carl works at the plant and is often paired with Lenny." },
      { category: "restaurant", difficulty: "hard", question: "In The Simpsons, what seafood restaurant is tied to Captain McCallister?", answer: "The Frying Dutchman", wrong: ["Krusty Burger", "The Gilded Truffle", "Luigi's"], explanation: "The Sea Captain runs The Frying Dutchman." },
      { category: "show", difficulty: "medium", question: "In The Simpsons, what violent cartoon do Bart and Lisa watch?", answer: "Itchy & Scratchy", wrong: ["Worker & Parasite", "Poochie & Friends", "Krustyland"], explanation: "Itchy & Scratchy parodies slapstick cartoon violence." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "fantasy-quest-challenge",
    title: "The Lord of the Rings: The Fellowship of the Ring",
    tmdbId: 120,
    facts: [
      { category: "object", difficulty: "easy", question: "In The Fellowship of the Ring, what object must Frodo carry out of the Shire?", answer: "The One Ring", wrong: ["The Arkenstone", "A Palantir", "Glamdring"], explanation: "Frodo inherits the One Ring from Bilbo and becomes its bearer." },
      { category: "location", difficulty: "medium", question: "In The Fellowship of the Ring, where is the Council of Elrond held?", answer: "Rivendell", wrong: ["Lothlorien", "Minas Tirith", "Edoras"], explanation: "The council gathers in Rivendell to decide the Ring's fate." },
      { category: "creature", difficulty: "medium", question: "In The Fellowship of the Ring, what monster attacks the Fellowship in Moria before Gandalf falls?", answer: "A Balrog", wrong: ["A Nazgul", "Shelob", "A Mumakil"], explanation: "Gandalf confronts the Balrog on the Bridge of Khazad-dum." },
      { category: "character", difficulty: "hard", question: "In The Fellowship of the Ring, who tries to take the Ring from Frodo at Amon Hen?", answer: "Boromir", wrong: ["Aragorn", "Legolas", "Gimli"], explanation: "Boromir is tempted by the Ring and later dies defending Merry and Pippin." },
      { category: "lore", difficulty: "expert", question: "In The Fellowship of the Ring, what Elvish name is Aragorn also known by?", answer: "Strider", wrong: ["Mithrandir", "Elessar only", "Isildur"], explanation: "Aragorn is introduced to the hobbits as Strider at Bree." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Lord of the Rings: The Two Towers",
    tmdbId: 121,
    facts: [
      { category: "location", difficulty: "easy", question: "In The Two Towers, what fortress does Rohan defend against Saruman's army?", answer: "Helm's Deep", wrong: ["Minas Morgul", "Weathertop", "Dol Guldur"], explanation: "The Battle of Helm's Deep is the film's major siege." },
      { category: "character", difficulty: "medium", question: "In The Two Towers, who is the corrupted adviser whispering to King Theoden?", answer: "Grima Wormtongue", wrong: ["Denethor", "Faramir", "Haldir"], explanation: "Grima serves Saruman and weakens Theoden's rule." },
      { category: "creature", difficulty: "medium", question: "In The Two Towers, what tree-like beings march on Isengard?", answer: "Ents", wrong: ["Eagles", "Wargs", "Trolls"], explanation: "Treebeard and the Ents attack Isengard after seeing Saruman's destruction." },
      { category: "story", difficulty: "hard", question: "In The Two Towers, who guides Frodo and Sam toward Mordor?", answer: "Gollum", wrong: ["Faramir", "Eomer", "Elrond"], explanation: "Gollum leads the hobbits while struggling with his divided self." },
      { category: "battle", difficulty: "expert", question: "In The Two Towers, who arrives with the Rohirrim at dawn to turn the tide at Helm's Deep?", answer: "Gandalf", wrong: ["Arwen", "Denethor", "Galadriel"], explanation: "Gandalf returns with reinforcements as sunlight breaks over the battlefield." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Lord of the Rings: The Return of the King",
    tmdbId: 122,
    facts: [
      { category: "location", difficulty: "easy", question: "In The Return of the King, what city is besieged by Sauron's forces?", answer: "Minas Tirith", wrong: ["Rivendell", "Dale", "Bree"], explanation: "Minas Tirith becomes the central battlefield in Gondor." },
      { category: "character", difficulty: "medium", question: "In The Return of the King, who lights the beacons to call Rohan for aid?", answer: "Pippin", wrong: ["Merry", "Frodo", "Faramir"], explanation: "Pippin climbs to light the first beacon after Denethor refuses to call for help." },
      { category: "creature", difficulty: "medium", question: "In The Return of the King, what giant spider attacks Frodo near Mordor?", answer: "Shelob", wrong: ["Ungoliant", "A Balrog", "A Fell Beast"], explanation: "Gollum leads Frodo into Shelob's lair." },
      { category: "ending", difficulty: "hard", question: "In The Return of the King, who ultimately causes the Ring to fall into Mount Doom?", answer: "Gollum", wrong: ["Sam", "Aragorn", "Gandalf"], explanation: "Gollum bites off Frodo's finger and falls with the Ring." },
      { category: "lore", difficulty: "expert", question: "In The Return of the King, what army does Aragorn summon through his royal claim?", answer: "The Army of the Dead", wrong: ["The Ents", "The Eagles", "The Rangers of Ithilien"], explanation: "Aragorn commands the oathbreakers to fulfill their ancient pledge." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Harry Potter and the Sorcerer's Stone",
    tmdbId: 671,
    facts: [
      { category: "school", difficulty: "easy", question: "In Harry Potter and the Sorcerer's Stone, what school does Harry attend?", answer: "Hogwarts", wrong: ["Beauxbatons", "Durmstrang", "Ilvermorny"], explanation: "Harry discovers he is a wizard and attends Hogwarts." },
      { category: "object", difficulty: "medium", question: "In Harry Potter and the Sorcerer's Stone, what object can produce the Elixir of Life?", answer: "The Sorcerer's Stone", wrong: ["The Elder Wand", "A Horcrux", "The Time-Turner"], explanation: "The Stone is hidden at Hogwarts and sought by Voldemort." },
      { category: "sport", difficulty: "medium", question: "In Harry Potter and the Sorcerer's Stone, what position does Harry play in Quidditch?", answer: "Seeker", wrong: ["Keeper", "Beater", "Chaser"], explanation: "Harry becomes Gryffindor's youngest Seeker in a century." },
      { category: "creature", difficulty: "hard", question: "In Harry Potter and the Sorcerer's Stone, what is the three-headed dog guarding the trapdoor named?", answer: "Fluffy", wrong: ["Fang", "Norbert", "Aragog"], explanation: "Fluffy guards the entrance to the Stone's protections." },
      { category: "test", difficulty: "expert", question: "In Harry Potter and the Sorcerer's Stone, which professor's logic puzzle protects the Stone?", answer: "Professor Snape", wrong: ["Professor McGonagall", "Professor Flitwick", "Professor Sprout"], explanation: "Snape's potion riddle is one of the final defenses." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Harry Potter and the Prisoner of Azkaban",
    tmdbId: 673,
    facts: [
      { category: "creature", difficulty: "easy", question: "In Prisoner of Azkaban, what kind of creature is Buckbeak?", answer: "A hippogriff", wrong: ["A dragon", "A phoenix", "A basilisk"], explanation: "Hagrid introduces Buckbeak during Care of Magical Creatures." },
      { category: "object", difficulty: "medium", question: "In Prisoner of Azkaban, what magical device lets Hermione attend multiple classes?", answer: "A Time-Turner", wrong: ["A Deluminator", "A Sneakoscope", "A Remembrall"], explanation: "Hermione uses the Time-Turner for her overloaded schedule." },
      { category: "reveal", difficulty: "medium", question: "In Prisoner of Azkaban, who is revealed to be Harry's godfather?", answer: "Sirius Black", wrong: ["Remus Lupin", "Peter Pettigrew", "Severus Snape"], explanation: "Sirius was James Potter's close friend and Harry's godfather." },
      { category: "monster", difficulty: "hard", question: "In Prisoner of Azkaban, what creature is Remus Lupin?", answer: "A werewolf", wrong: ["A vampire", "An Animagus dog", "A Dementor"], explanation: "Lupin transforms under the full moon." },
      { category: "spell", difficulty: "expert", question: "In Prisoner of Azkaban, what charm repels Dementors?", answer: "Expecto Patronum", wrong: ["Expelliarmus", "Protego", "Lumos Maxima"], explanation: "Harry learns the Patronus Charm from Lupin." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Chronicles of Narnia: The Lion, the Witch and the Wardrobe",
    tmdbId: 411,
    facts: [
      { category: "portal", difficulty: "easy", question: "In The Lion, the Witch and the Wardrobe, what object first leads Lucy into Narnia?", answer: "A wardrobe", wrong: ["A mirror", "A painting", "A train door"], explanation: "Lucy enters Narnia through a wardrobe in the professor's house." },
      { category: "villain", difficulty: "easy", question: "In The Lion, the Witch and the Wardrobe, who keeps Narnia trapped in winter?", answer: "The White Witch", wrong: ["The Lady of the Lake", "Maleficent", "The Snow Queen"], explanation: "Jadis rules Narnia and prevents Christmas from coming." },
      { category: "character", difficulty: "medium", question: "In The Lion, the Witch and the Wardrobe, what great lion leads Narnia's resistance?", answer: "Aslan", wrong: ["Reepicheep", "Tumnus", "Maugrim"], explanation: "Aslan returns to challenge the White Witch." },
      { category: "betrayal", difficulty: "medium", question: "In The Lion, the Witch and the Wardrobe, which Pevensie sibling is tempted by Turkish delight?", answer: "Edmund", wrong: ["Peter", "Susan", "Lucy"], explanation: "The Witch uses Turkish delight to manipulate Edmund." },
      { category: "battle", difficulty: "hard", question: "In The Lion, the Witch and the Wardrobe, who becomes High King of Narnia?", answer: "Peter", wrong: ["Edmund", "Caspian", "Professor Kirke"], explanation: "Peter is crowned High King after the Witch is defeated." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Princess Bride",
    tmdbId: 2493,
    facts: [
      { category: "romance", difficulty: "easy", question: "In The Princess Bride, what phrase does Westley use to tell Buttercup he loves her?", answer: "As you wish", wrong: ["To the pain", "Have fun storming the castle", "Inconceivable"], explanation: "Westley's repeated phrase is his way of saying he loves Buttercup." },
      { category: "identity", difficulty: "medium", question: "In The Princess Bride, what pirate identity does Westley assume?", answer: "The Dread Pirate Roberts", wrong: ["Captain Blood", "The Black Fox", "The Six-Fingered Man"], explanation: "Westley takes on the Dread Pirate Roberts mantle." },
      { category: "revenge", difficulty: "medium", question: "In The Princess Bride, who is Inigo Montoya seeking revenge against?", answer: "The six-fingered man", wrong: ["Prince Humperdinck", "Vizzini", "Count Rugen's twin"], explanation: "Inigo's father was killed by the six-fingered man." },
      { category: "creature", difficulty: "hard", question: "In The Princess Bride, what creatures attack in the Fire Swamp?", answer: "ROUSes", wrong: ["Screaming eels", "Giant bats", "Bog trolls"], explanation: "Rodents of Unusual Size live in the Fire Swamp." },
      { category: "scene", difficulty: "expert", question: "In The Princess Bride, what poison is used in Vizzini's battle of wits?", answer: "Iocane powder", wrong: ["Nightshade", "Mandrake", "Hemlock"], explanation: "Westley survives because he has built up an immunity to iocane powder." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Wizard of Oz",
    tmdbId: 630,
    facts: [
      { category: "quest", difficulty: "easy", question: "In The Wizard of Oz, what city is Dorothy trying to reach?", answer: "The Emerald City", wrong: ["Munchkinland", "Ozma's Palace", "The Ruby City"], explanation: "Dorothy follows the Yellow Brick Road to the Emerald City." },
      { category: "object", difficulty: "easy", question: "In The Wizard of Oz, what magical shoes does Dorothy wear?", answer: "Ruby slippers", wrong: ["Glass slippers", "Silver boots", "Golden sandals"], explanation: "The ruby slippers become the key to getting home." },
      { category: "friend", difficulty: "medium", question: "In The Wizard of Oz, which companion wants courage?", answer: "The Cowardly Lion", wrong: ["The Scarecrow", "The Tin Man", "Toto"], explanation: "The Lion joins Dorothy hoping the Wizard can give him courage." },
      { category: "villain", difficulty: "medium", question: "In The Wizard of Oz, who sends flying monkeys after Dorothy?", answer: "The Wicked Witch of the West", wrong: ["Glinda", "The Wizard", "The Wicked Witch of the East"], explanation: "The Witch uses the monkeys to capture Dorothy and her friends." },
      { category: "ending", difficulty: "hard", question: "In The Wizard of Oz, what phrase does Dorothy repeat to return home?", answer: "There's no place like home", wrong: ["Follow the Yellow Brick Road", "Over the rainbow", "Pay no attention"], explanation: "Dorothy clicks her heels and repeats the phrase." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Pan's Labyrinth",
    tmdbId: 1417,
    facts: [
      { category: "setting", difficulty: "medium", question: "In Pan's Labyrinth, what historical conflict surrounds Ofelia's fantasy world?", answer: "Post-Civil War Spain", wrong: ["World War I France", "Victorian England", "Ancient Greece"], explanation: "The story is set in Spain after the Spanish Civil War." },
      { category: "creature", difficulty: "medium", question: "In Pan's Labyrinth, what creature gives Ofelia tasks?", answer: "The Faun", wrong: ["The Pale Man", "A centaur", "A dragon"], explanation: "The Faun claims Ofelia may be a lost princess." },
      { category: "monster", difficulty: "hard", question: "In Pan's Labyrinth, what monster has eyes in its hands?", answer: "The Pale Man", wrong: ["The Toad", "The Mandrake", "The Captain"], explanation: "The Pale Man is one of the film's most memorable fantasy horrors." },
      { category: "object", difficulty: "hard", question: "In Pan's Labyrinth, what magical root is placed under Ofelia's mother's bed?", answer: "A mandrake root", wrong: ["A golden apple", "A unicorn horn", "A silver acorn"], explanation: "The mandrake is meant to help Carmen's pregnancy." },
      { category: "villain", difficulty: "expert", question: "In Pan's Labyrinth, what is Captain Vidal obsessed with preserving?", answer: "His legacy through his son", wrong: ["A magical kingdom", "A rebel alliance", "A lost treasure"], explanation: "Vidal is fixated on lineage, control, and his unborn son." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Stardust",
    tmdbId: 2270,
    facts: [
      { category: "quest", difficulty: "easy", question: "In Stardust, what does Tristan cross the wall to find?", answer: "A fallen star", wrong: ["A dragon egg", "A magic ring", "A lost crown"], explanation: "Tristan promises to retrieve the star for Victoria." },
      { category: "character", difficulty: "medium", question: "In Stardust, what is the fallen star's name when she becomes human?", answer: "Yvaine", wrong: ["Una", "Lamia", "Victoria"], explanation: "The star is revealed as a woman named Yvaine." },
      { category: "villain", difficulty: "medium", question: "In Stardust, what do the witches want from Yvaine?", answer: "Her heart", wrong: ["Her crown", "Her wings", "Her voice"], explanation: "The witches seek the star's heart to regain youth and power." },
      { category: "ship", difficulty: "hard", question: "In Stardust, what kind of vessel does Captain Shakespeare command?", answer: "A flying pirate ship", wrong: ["A submarine", "A dragon boat", "A ghost train"], explanation: "Captain Shakespeare's ship harvests lightning in the sky." },
      { category: "reveal", difficulty: "expert", question: "In Stardust, who is Tristan's mother?", answer: "Una", wrong: ["Lamia", "Victoria", "The witch queen"], explanation: "Una is enslaved in Stormhold and is Tristan's mother." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Labyrinth",
    tmdbId: 13597,
    facts: [
      { category: "quest", difficulty: "easy", question: "In Labyrinth, who must Sarah rescue from the Goblin King?", answer: "Her baby brother Toby", wrong: ["Her father", "Her dog Merlin", "Her friend Hoggle"], explanation: "Sarah wishes Toby away and then must rescue him." },
      { category: "villain", difficulty: "easy", question: "In Labyrinth, who is the Goblin King?", answer: "Jareth", wrong: ["Hoggle", "Ludo", "Didymus"], explanation: "Jareth rules the goblins and controls the labyrinth." },
      { category: "friend", difficulty: "medium", question: "In Labyrinth, what gentle giant becomes one of Sarah's allies?", answer: "Ludo", wrong: ["Sir Didymus", "Ambrosius", "Firey"], explanation: "Ludo helps Sarah throughout the maze." },
      { category: "line", difficulty: "hard", question: "In Labyrinth, what phrase does Sarah need to remember to defeat Jareth?", answer: "You have no power over me", wrong: ["There is no place like home", "As you wish", "I believe in fairies"], explanation: "Sarah breaks Jareth's hold by speaking the truth." },
      { category: "scene", difficulty: "expert", question: "In Labyrinth, what room creates impossible staircases around Sarah and Toby?", answer: "The Escher-like final room", wrong: ["The Bog of Eternal Stench", "The Oubliette", "The ballroom"], explanation: "The finale uses impossible stair imagery inspired by M. C. Escher." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The NeverEnding Story",
    tmdbId: 34584,
    facts: [
      { category: "world", difficulty: "easy", question: "In The NeverEnding Story, what fantasy world is threatened by the Nothing?", answer: "Fantasia", wrong: ["Narnia", "Oz", "Stormhold"], explanation: "Fantasia is being erased by the Nothing." },
      { category: "hero", difficulty: "medium", question: "In The NeverEnding Story, who is sent to save Fantasia?", answer: "Atreyu", wrong: ["Bastian", "Falkor", "Cairon"], explanation: "Atreyu is chosen for the quest to save the Childlike Empress." },
      { category: "creature", difficulty: "medium", question: "In The NeverEnding Story, what kind of creature is Falkor?", answer: "A luckdragon", wrong: ["A griffin", "A wyvern", "A sphinx"], explanation: "Falkor is a white luckdragon who helps Atreyu." },
      { category: "scene", difficulty: "hard", question: "In The NeverEnding Story, what happens to Artax in the Swamps of Sadness?", answer: "He sinks into the swamp", wrong: ["He becomes a dragon", "He joins Gmork", "He turns to stone"], explanation: "Artax is overcome by despair in one of the film's saddest scenes." },
      { category: "ending", difficulty: "expert", question: "In The NeverEnding Story, what does Bastian give the Childlike Empress?", answer: "A new name", wrong: ["A magic sword", "A moonstone", "A book of spells"], explanation: "Bastian must name the Empress to restore Fantasia." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Dark Crystal",
    tmdbId: 11639,
    facts: [
      { category: "hero", difficulty: "medium", question: "In The Dark Crystal, what species is Jen?", answer: "Gelfling", wrong: ["Skeksis", "Mystic", "Podling"], explanation: "Jen is a Gelfling raised by the Mystics." },
      { category: "quest", difficulty: "medium", question: "In The Dark Crystal, what must Jen restore?", answer: "The missing shard of the Crystal", wrong: ["A golden crown", "A dragon scale", "The Book of Thra"], explanation: "Jen's quest is to heal the Crystal by replacing its shard." },
      { category: "villain", difficulty: "hard", question: "In The Dark Crystal, what cruel beings rule from the castle?", answer: "The Skeksis", wrong: ["The Mystics", "The Garthim only", "The Podlings"], explanation: "The Skeksis are the decaying rulers tied to the damaged Crystal." },
      { category: "friend", difficulty: "hard", question: "In The Dark Crystal, what is Kira's winged companion named?", answer: "Fizzgig", wrong: ["Aughra", "Chamberlain", "Landstrider"], explanation: "Fizzgig is Kira's small, loud companion." },
      { category: "lore", difficulty: "expert", question: "In The Dark Crystal, what happens when the Crystal is healed?", answer: "The Skeksis and Mystics reunite", wrong: ["Jen becomes a Skeksis", "Thra freezes", "The Garthim become kings"], explanation: "The divided beings merge back into the urSkeks." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Willow",
    tmdbId: 847,
    facts: [
      { category: "hero", difficulty: "easy", question: "In Willow, what is Willow Ufgood's dream profession?", answer: "A sorcerer", wrong: ["A knight", "A king", "A pirate"], explanation: "Willow wants to become a great sorcerer." },
      { category: "child", difficulty: "medium", question: "In Willow, what baby is Willow tasked with protecting?", answer: "Elora Danan", wrong: ["Sorsha", "Cherlindrea", "Raziel"], explanation: "Elora Danan is prophesied to bring down Queen Bavmorda." },
      { category: "villain", difficulty: "medium", question: "In Willow, who is the evil queen hunting Elora?", answer: "Queen Bavmorda", wrong: ["Queen Jadis", "Maleficent", "Mab"], explanation: "Bavmorda tries to destroy the child of prophecy." },
      { category: "ally", difficulty: "hard", question: "In Willow, what swordsman becomes Willow's reluctant ally?", answer: "Madmartigan", wrong: ["Burglekutt", "Airk", "Kael"], explanation: "Madmartigan joins the quest after first being found in a cage." },
      { category: "magic", difficulty: "expert", question: "In Willow, what animal form is the sorceress Raziel trapped in when Willow finds her?", answer: "A possum", wrong: ["A goat", "A crow", "A fox"], explanation: "Raziel has been transformed and needs Willow's help." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Spirited Away",
    tmdbId: 129,
    facts: [
      { category: "hero", difficulty: "easy", question: "In Spirited Away, what is Chihiro renamed while working at the bathhouse?", answer: "Sen", wrong: ["Lin", "Yubaba", "Boh"], explanation: "Yubaba takes part of Chihiro's name, leaving her as Sen." },
      { category: "setting", difficulty: "medium", question: "In Spirited Away, where does Chihiro work to save her parents?", answer: "A spirit bathhouse", wrong: ["A dragon palace", "A flying castle", "A witch school"], explanation: "The bathhouse serves spirits and is run by Yubaba." },
      { category: "creature", difficulty: "medium", question: "In Spirited Away, what happens to Chihiro's parents after they eat spirit food?", answer: "They turn into pigs", wrong: ["They fall asleep", "They become birds", "They vanish"], explanation: "Their greed traps them in pig form." },
      { category: "character", difficulty: "hard", question: "In Spirited Away, what is Haku's true identity connected to?", answer: "The Kohaku River", wrong: ["The moon", "A mountain shrine", "A lost train"], explanation: "Haku remembers he is the spirit of the Kohaku River." },
      { category: "spirit", difficulty: "expert", question: "In Spirited Away, what polluted guest is revealed to be a river spirit?", answer: "The Stink Spirit", wrong: ["No-Face", "Kamaji", "Boh"], explanation: "The bathhouse workers clean him and discover his true nature." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Howl's Moving Castle",
    tmdbId: 4935,
    facts: [
      { category: "curse", difficulty: "easy", question: "In Howl's Moving Castle, what curse is placed on Sophie?", answer: "She becomes an old woman", wrong: ["She turns invisible", "She loses her voice", "She becomes a cat"], explanation: "The Witch of the Waste transforms Sophie into an elderly woman." },
      { category: "setting", difficulty: "medium", question: "In Howl's Moving Castle, what kind of home does Howl live in?", answer: "A walking magical castle", wrong: ["A glass tower", "A cloud palace", "A submarine"], explanation: "Howl's castle moves across the landscape on mechanical legs." },
      { category: "spirit", difficulty: "medium", question: "In Howl's Moving Castle, what fire demon powers the castle?", answer: "Calcifer", wrong: ["Markl", "Turnip Head", "Heen"], explanation: "Calcifer is bound to Howl and fuels the castle." },
      { category: "magic", difficulty: "hard", question: "In Howl's Moving Castle, what is hidden inside Calcifer's bond with Howl?", answer: "Howl's heart", wrong: ["Sophie's name", "A war spell", "A royal crown"], explanation: "Howl gave his heart to Calcifer as part of their pact." },
      { category: "war", difficulty: "expert", question: "In Howl's Moving Castle, what larger conflict shapes much of the story?", answer: "A destructive war between kingdoms", wrong: ["A pirate rebellion", "A tournament", "A dragon migration"], explanation: "The war drives Howl's transformations and the film's urgency." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Shrek",
    tmdbId: 808,
    facts: [
      { category: "hero", difficulty: "easy", question: "In Shrek, what kind of creature is Shrek?", answer: "An ogre", wrong: ["A troll", "A giant", "A goblin"], explanation: "Shrek is an ogre who values solitude in his swamp." },
      { category: "quest", difficulty: "medium", question: "In Shrek, who sends Shrek to rescue Princess Fiona?", answer: "Lord Farquaad", wrong: ["The Fairy Godmother", "Prince Charming", "King Harold"], explanation: "Farquaad wants Fiona as his bride and uses Shrek to reach her." },
      { category: "companion", difficulty: "easy", question: "In Shrek, what talkative animal travels with Shrek?", answer: "Donkey", wrong: ["Puss in Boots", "Dragon", "Gingy"], explanation: "Donkey becomes Shrek's persistent companion." },
      { category: "curse", difficulty: "hard", question: "In Shrek, what happens to Fiona every night?", answer: "She turns into an ogre", wrong: ["She becomes invisible", "She falls asleep", "She breathes fire"], explanation: "Fiona's curse changes her form after sunset." },
      { category: "ending", difficulty: "medium", question: "In Shrek, who ends up with the Dragon?", answer: "Donkey", wrong: ["Shrek", "Farquaad", "Gingy"], explanation: "Donkey and Dragon form one of the film's surprise romances." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Hobbit: An Unexpected Journey",
    tmdbId: 49051,
    facts: [
      { category: "hero", difficulty: "easy", question: "In An Unexpected Journey, what hobbit is recruited for the dwarves' quest?", answer: "Bilbo Baggins", wrong: ["Frodo Baggins", "Samwise Gamgee", "Meriadoc Brandybuck"], explanation: "Gandalf recruits Bilbo as the company's burglar." },
      { category: "quest", difficulty: "medium", question: "In An Unexpected Journey, what homeland do Thorin and the dwarves hope to reclaim?", answer: "Erebor", wrong: ["Moria", "Minas Tirith", "Rivendell"], explanation: "The Lonely Mountain and its treasure were taken by Smaug." },
      { category: "object", difficulty: "medium", question: "In An Unexpected Journey, what object does Bilbo find in Gollum's cave?", answer: "The One Ring", wrong: ["The Arkenstone", "Sting", "A Palantir"], explanation: "Bilbo discovers the Ring after escaping goblins." },
      { category: "riddle", difficulty: "hard", question: "In An Unexpected Journey, what game does Bilbo play with Gollum?", answer: "A riddle game", wrong: ["A chess match", "A knife duel", "A song contest"], explanation: "Bilbo's survival depends on winning a game of riddles." },
      { category: "dragon", difficulty: "expert", question: "In An Unexpected Journey, what dragon drove the dwarves from the Lonely Mountain?", answer: "Smaug", wrong: ["Ancalagon", "Drogon", "Scatha"], explanation: "Smaug's attack on Erebor begins the dwarves' exile." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Fantastic Beasts and Where to Find Them",
    tmdbId: 259316,
    facts: [
      { category: "hero", difficulty: "easy", question: "In Fantastic Beasts and Where to Find Them, who carries a suitcase full of magical creatures?", answer: "Newt Scamander", wrong: ["Albus Dumbledore", "Jacob Kowalski", "Percival Graves"], explanation: "Newt arrives in New York with his enchanted case." },
      { category: "creature", difficulty: "medium", question: "In Fantastic Beasts and Where to Find Them, what small creature steals shiny objects?", answer: "A Niffler", wrong: ["A Bowtruckle", "A Demiguise", "A Thunderbird"], explanation: "The Niffler causes chaos by chasing valuables." },
      { category: "friend", difficulty: "medium", question: "In Fantastic Beasts and Where to Find Them, what No-Maj baker becomes Newt's friend?", answer: "Jacob Kowalski", wrong: ["Credence Barebone", "Henry Shaw", "Langdon Shaw"], explanation: "Jacob is swept into Newt's magical creature adventure." },
      { category: "threat", difficulty: "hard", question: "In Fantastic Beasts and Where to Find Them, what dark magical force is tied to Credence?", answer: "An Obscurus", wrong: ["A Horcrux", "A Dementor", "A Patronus"], explanation: "Credence's repressed magic manifests as an Obscurus." },
      { category: "reveal", difficulty: "expert", question: "In Fantastic Beasts and Where to Find Them, who is Percival Graves revealed to truly be?", answer: "Gellert Grindelwald", wrong: ["Voldemort", "Albus Dumbledore", "Aberforth Dumbledore"], explanation: "Graves is exposed as Grindelwald in disguise." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Maleficent",
    tmdbId: 102651,
    facts: [
      { category: "character", difficulty: "easy", question: "In Maleficent, what fairy tale princess is central to the story?", answer: "Aurora", wrong: ["Cinderella", "Belle", "Rapunzel"], explanation: "The film retells Sleeping Beauty from Maleficent's perspective." },
      { category: "curse", difficulty: "medium", question: "In Maleficent, what curse does Maleficent place on Aurora?", answer: "She will fall into a deathlike sleep", wrong: ["She will turn into a dragon", "She will lose her voice", "She will never leave the castle"], explanation: "The curse echoes the Sleeping Beauty legend." },
      { category: "betrayal", difficulty: "hard", question: "In Maleficent, who betrays Maleficent and takes her wings?", answer: "Stefan", wrong: ["Diaval", "Phillip", "King Henry"], explanation: "Stefan's betrayal transforms Maleficent's life." },
      { category: "ally", difficulty: "medium", question: "In Maleficent, what bird-like companion serves Maleficent?", answer: "Diaval", wrong: ["Archimedes", "Fawkes", "Iago"], explanation: "Diaval is transformed by Maleficent and becomes her loyal ally." },
      { category: "twist", difficulty: "expert", question: "In Maleficent, what form of love breaks Aurora's curse?", answer: "Maleficent's maternal love", wrong: ["A prince's kiss only", "A fairy spell", "Stefan's apology"], explanation: "The film reframes true love through Maleficent and Aurora's bond." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Pirates of the Caribbean: The Curse of the Black Pearl",
    tmdbId: 22,
    facts: [
      { category: "curse", difficulty: "easy", question: "In The Curse of the Black Pearl, what curse afflicts Barbossa's crew?", answer: "They become undead in moonlight", wrong: ["They cannot speak", "They turn into fish", "They lose their shadows"], explanation: "The Aztec curse reveals their skeletal forms under moonlight." },
      { category: "object", difficulty: "medium", question: "In The Curse of the Black Pearl, what stolen item is needed to break the curse?", answer: "An Aztec gold medallion", wrong: ["A compass", "A trident", "A mermaid tear"], explanation: "All the cursed gold must be returned with blood repaid." },
      { category: "character", difficulty: "medium", question: "In The Curse of the Black Pearl, who is captain of the Black Pearl when the film begins?", answer: "Hector Barbossa", wrong: ["Jack Sparrow", "Will Turner", "Norrington"], explanation: "Barbossa has taken the Pearl from Jack." },
      { category: "hero", difficulty: "hard", question: "In The Curse of the Black Pearl, what is Will Turner's trade?", answer: "Blacksmith", wrong: ["Sailor", "Cartographer", "Royal guard"], explanation: "Will works as a blacksmith in Port Royal." },
      { category: "lore", difficulty: "expert", question: "In The Curse of the Black Pearl, whose blood can help break the curse because of his pirate lineage?", answer: "Will Turner", wrong: ["James Norrington", "Governor Swann", "Gibbs"], explanation: "Will is Bootstrap Bill Turner's son." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Golden Compass",
    tmdbId: 2268,
    facts: [
      { category: "world", difficulty: "easy", question: "In The Golden Compass, what animal companions reflect people's souls?", answer: "Daemons", wrong: ["Familiars", "Patronuses", "Golems"], explanation: "Daemons are external souls in Lyra's world." },
      { category: "object", difficulty: "medium", question: "In The Golden Compass, what truth-reading device does Lyra carry?", answer: "An alethiometer", wrong: ["A Palantir", "A compass of desire", "A time-turner"], explanation: "The alethiometer helps Lyra read hidden truths." },
      { category: "character", difficulty: "medium", question: "In The Golden Compass, what is the name of the armored bear who helps Lyra?", answer: "Iorek Byrnison", wrong: ["Ragnar Sturlusson", "Farder Coram", "Lee Scoresby"], explanation: "Iorek is an exiled panserbjorne warrior." },
      { category: "villain", difficulty: "hard", question: "In The Golden Compass, who leads the child-separating experiments?", answer: "Mrs. Coulter", wrong: ["Serafina Pekkala", "Ma Costa", "Lyra's guardian"], explanation: "Mrs. Coulter is tied to the General Oblation Board." },
      { category: "lore", difficulty: "expert", question: "In The Golden Compass, what mysterious substance is central to adult fears and experiments?", answer: "Dust", wrong: ["Aether", "Stardust", "Dragon glass"], explanation: "Dust drives the story's conflict and theology." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Last Unicorn",
    tmdbId: 10150,
    facts: [
      { category: "hero", difficulty: "medium", question: "In The Last Unicorn, what does the unicorn believe she may be?", answer: "The last of her kind", wrong: ["A cursed princess", "A dragon in disguise", "A forest spirit only"], explanation: "The unicorn leaves her forest to search for others." },
      { category: "villain", difficulty: "medium", question: "In The Last Unicorn, what creature has driven the unicorns away?", answer: "The Red Bull", wrong: ["The Jabberwock", "A griffin", "A basilisk"], explanation: "The Red Bull forces unicorns into the sea." },
      { category: "magic", difficulty: "hard", question: "In The Last Unicorn, what name does the unicorn receive after being transformed into a woman?", answer: "Lady Amalthea", wrong: ["Molly Grue", "Lir", "Mommy Fortuna"], explanation: "Schmendrick transforms her to protect her from the Red Bull." },
      { category: "ally", difficulty: "hard", question: "In The Last Unicorn, what magician travels with the unicorn?", answer: "Schmendrick", wrong: ["Merlin", "Gandalf", "Ged"], explanation: "Schmendrick is a struggling magician who helps her quest." },
      { category: "ending", difficulty: "expert", question: "In The Last Unicorn, who loves Lady Amalthea and helps her face the Red Bull?", answer: "Prince Lir", wrong: ["King Haggard", "Captain Cully", "Rukh"], explanation: "Lir's love becomes part of the unicorn's bittersweet journey." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "Dragonslayer",
    tmdbId: 848,
    facts: [
      { category: "monster", difficulty: "medium", question: "In Dragonslayer, what dragon terrorizes the kingdom?", answer: "Vermithrax Pejorative", wrong: ["Smaug", "Saphira", "Drogon"], explanation: "Vermithrax is the ancient dragon at the center of the film." },
      { category: "hero", difficulty: "medium", question: "In Dragonslayer, what is Galen's role at the start of the story?", answer: "A sorcerer's apprentice", wrong: ["A prince", "A blacksmith", "A knight commander"], explanation: "Galen is apprentice to the wizard Ulrich." },
      { category: "sacrifice", difficulty: "hard", question: "In Dragonslayer, how are victims chosen for the dragon?", answer: "By lottery", wrong: ["By trial combat", "By royal decree only", "By prophecy"], explanation: "The kingdom sacrifices young women selected by lottery." },
      { category: "identity", difficulty: "expert", question: "In Dragonslayer, what does Valerian disguise herself as to avoid the lottery?", answer: "A boy", wrong: ["A nun", "A witch", "A servant"], explanation: "Valerian's disguise protects her from being selected." },
      { category: "magic", difficulty: "expert", question: "In Dragonslayer, whose planned sacrifice helps destroy the dragon?", answer: "Ulrich's", wrong: ["Galen's", "The princess's", "Valerian's"], explanation: "Ulrich's magic and sacrifice are key to defeating Vermithrax." },
    ],
  },
  {
    slug: "fantasy-quest-challenge",
    title: "The Green Knight",
    tmdbId: 559907,
    facts: [
      { category: "hero", difficulty: "medium", question: "In The Green Knight, what Arthurian knight accepts the Green Knight's challenge?", answer: "Gawain", wrong: ["Lancelot", "Percival", "Galahad"], explanation: "Gawain steps forward in King Arthur's court." },
      { category: "challenge", difficulty: "medium", question: "In The Green Knight, what exchange does the Green Knight demand after one year?", answer: "The same blow returned", wrong: ["A stolen crown", "A dragon's tooth", "A wedding vow"], explanation: "Gawain must receive the same strike he gave." },
      { category: "object", difficulty: "hard", question: "In The Green Knight, what protective item does Gawain wear near the end?", answer: "A green girdle", wrong: ["A silver crown", "A magic ring", "A golden cloak"], explanation: "The girdle represents Gawain's fear and desire to survive." },
      { category: "legend", difficulty: "expert", question: "In The Green Knight, the story adapts a legend from which cycle?", answer: "Arthurian legend", wrong: ["Greek myth", "Norse saga", "Egyptian myth"], explanation: "The film is based on Sir Gawain and the Green Knight." },
      { category: "theme", difficulty: "expert", question: "In The Green Knight, what does Gawain's journey most directly test?", answer: "His honor and courage", wrong: ["His musical talent", "His claim to a throne", "His ability to cast spells"], explanation: "The quest challenges whether Gawain can live and die honorably." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "natural-disaster-challenge",
    title: "Twister",
    tmdbId: 664,
    facts: [
      { category: "weather", difficulty: "easy", question: "In Twister, what natural disaster do Jo and Bill chase?", answer: "Tornadoes", wrong: ["Earthquakes", "Volcanoes", "Tsunamis"], explanation: "The film follows storm chasers trying to study tornadoes up close." },
      { category: "technology", difficulty: "medium", question: "In Twister, what is the name of the tornado research device Jo's team tries to deploy?", answer: "Dorothy", wrong: ["Alice", "Toto", "Ruby"], explanation: "Dorothy is filled with sensors meant to fly into a tornado." },
      { category: "rival", difficulty: "medium", question: "In Twister, which rival storm chaser copies the Dorothy idea with corporate backing?", answer: "Jonas Miller", wrong: ["Rabbit", "Dusty", "Beltzer"], explanation: "Jonas builds a flashier version of the same sensor concept." },
      { category: "character", difficulty: "hard", question: "In Twister, what childhood trauma drives Jo's obsession with tornadoes?", answer: "Her father died in a tornado", wrong: ["Her town sank in a flood", "Her brother vanished in a storm", "Her school was hit by lightning"], explanation: "Jo saw her father killed by a powerful tornado when she was young." },
      { category: "scene", difficulty: "expert", question: "In Twister, where do Jo and Bill anchor themselves during the final tornado?", answer: "Inside a pump house", wrong: ["Under a bridge", "In a storm cellar", "Inside a truck trailer"], explanation: "They strap themselves to pipes as the tornado passes over them." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Twisters",
    tmdbId: 718821,
    facts: [
      { category: "weather", difficulty: "easy", question: "In Twisters, what kind of extreme weather is central to the story?", answer: "Tornado outbreaks", wrong: ["Solar flares", "Volcanic eruptions", "Avalanches"], explanation: "The sequel follows chasers during dangerous tornado activity." },
      { category: "character", difficulty: "medium", question: "In Twisters, what kind of work is Kate associated with before being pulled back into storm chasing?", answer: "Weather research", wrong: ["Deep-sea rescue", "Seismology", "Firefighting"], explanation: "Kate's background is tied to tornado science and prediction." },
      { category: "team", difficulty: "medium", question: "In Twisters, what kind of public personality is Tyler Owens?", answer: "A storm-chasing showman", wrong: ["A city mayor", "A mining engineer", "A helicopter pilot only"], explanation: "Tyler brings a more performative storm-chasing style." },
      { category: "mission", difficulty: "hard", question: "In Twisters, what is the broader goal behind chasing dangerous storms?", answer: "Improving tornado understanding and safety", wrong: ["Finding buried treasure", "Proving aliens control weather", "Escaping a criminal gang"], explanation: "The chases are built around studying and surviving tornado systems." },
      { category: "setting", difficulty: "hard", question: "In Twisters, which region is most associated with the tornado action?", answer: "Oklahoma", wrong: ["Alaska", "Florida Keys", "New York City"], explanation: "The film returns to tornado alley territory." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Day After Tomorrow",
    tmdbId: 435,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In The Day After Tomorrow, what global disaster rapidly changes the climate?", answer: "A sudden ice age", wrong: ["A meteor strike", "A worldwide earthquake", "A volcanic winter only"], explanation: "Climate shifts trigger extreme weather and deep freeze conditions." },
      { category: "location", difficulty: "medium", question: "In The Day After Tomorrow, where is Sam trapped during the freeze?", answer: "New York City", wrong: ["Los Angeles", "Chicago", "Miami"], explanation: "Sam shelters in the New York Public Library." },
      { category: "character", difficulty: "medium", question: "In The Day After Tomorrow, what is Jack Hall's profession?", answer: "Paleoclimatologist", wrong: ["Volcanologist", "Astronaut", "Structural engineer"], explanation: "Jack studies past climate patterns and warns about abrupt change." },
      { category: "survival", difficulty: "hard", question: "In The Day After Tomorrow, what do the library survivors burn to stay warm?", answer: "Books", wrong: ["Movie posters", "Furniture only", "Money"], explanation: "They burn books in the fireplace as temperatures plunge." },
      { category: "weather", difficulty: "expert", question: "In The Day After Tomorrow, what ocean-current concern helps trigger the catastrophe?", answer: "Disruption of the North Atlantic current", wrong: ["A Pacific typhoon loop", "A desert monsoon shift", "A solar tide surge"], explanation: "The film links melting ice and ocean circulation collapse to extreme cooling." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "San Andreas",
    tmdbId: 254128,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In San Andreas, what natural disaster devastates California?", answer: "Earthquakes", wrong: ["Tornadoes", "Volcanoes", "Wildfires only"], explanation: "Massive quakes along the fault drive the action." },
      { category: "character", difficulty: "medium", question: "In San Andreas, what is Ray Gaines' rescue profession?", answer: "Helicopter rescue pilot", wrong: ["Seismologist", "Paramedic only", "Coast Guard captain"], explanation: "Ray uses his rescue skills to reach his family." },
      { category: "location", difficulty: "medium", question: "In San Andreas, which city faces a major tsunami after the earthquakes?", answer: "San Francisco", wrong: ["Las Vegas", "Denver", "Phoenix"], explanation: "The tsunami sequence hits San Francisco Bay." },
      { category: "family", difficulty: "hard", question: "In San Andreas, who is Ray trying to rescue through much of the film?", answer: "His daughter Blake", wrong: ["His brother", "His father", "His co-pilot"], explanation: "Ray and Emma race to find Blake after the quakes." },
      { category: "science", difficulty: "expert", question: "In San Andreas, what does Lawrence Hayes study to warn about the disaster?", answer: "Seismology", wrong: ["Meteorology", "Oceanography only", "Volcanology"], explanation: "Hayes is a seismologist tracking quake patterns." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Dante's Peak",
    tmdbId: 9619,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In Dante's Peak, what natural disaster threatens the town?", answer: "A volcanic eruption", wrong: ["A tsunami", "A meteor shower", "A hurricane"], explanation: "The town sits near a volcano that becomes active." },
      { category: "character", difficulty: "medium", question: "In Dante's Peak, what kind of scientist is Harry Dalton?", answer: "Volcanologist", wrong: ["Seismologist only", "Marine biologist", "Astronomer"], explanation: "Harry studies volcanoes and warns about the mountain." },
      { category: "hazard", difficulty: "medium", question: "In Dante's Peak, what happens to the lake because of volcanic activity?", answer: "It becomes dangerously acidic", wrong: ["It freezes solid", "It turns into oil", "It disappears instantly"], explanation: "The acidic lake becomes deadly during the escape." },
      { category: "vehicle", difficulty: "hard", question: "In Dante's Peak, what kind of vehicle helps cross the acidic lake?", answer: "A boat", wrong: ["A snowmobile", "A train", "A glider"], explanation: "The group attempts to escape by boat despite the acid damage." },
      { category: "setting", difficulty: "expert", question: "In Dante's Peak, what is Rachel Wando's role in the town?", answer: "Mayor", wrong: ["Sheriff", "Doctor", "School principal"], explanation: "Rachel is the town's mayor and becomes central to the evacuation." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Volcano",
    tmdbId: 10357,
    facts: [
      { category: "location", difficulty: "easy", question: "In Volcano, what city is threatened by an unexpected eruption?", answer: "Los Angeles", wrong: ["Seattle", "Boston", "Dallas"], explanation: "Lava erupts through Los Angeles infrastructure." },
      { category: "disaster", difficulty: "medium", question: "In Volcano, where does lava begin emerging in the city?", answer: "The La Brea Tar Pits area", wrong: ["The Hollywood sign", "Dodger Stadium", "LAX runway"], explanation: "The eruption is tied to the tar pits and underground activity." },
      { category: "response", difficulty: "medium", question: "In Volcano, what public official leads much of the emergency response?", answer: "Mike Roark", wrong: ["Harry Dalton", "Jack Hall", "Ray Gaines"], explanation: "Roark is an emergency management leader in Los Angeles." },
      { category: "strategy", difficulty: "hard", question: "In Volcano, what do responders try to use to redirect lava?", answer: "Concrete barriers and controlled demolition", wrong: ["Ice blocks only", "A giant fan", "Magnetic fields"], explanation: "The city improvises barriers and blasts to channel lava." },
      { category: "subway", difficulty: "expert", question: "In Volcano, what transportation system becomes a major danger zone?", answer: "The subway", wrong: ["The airport tram", "A ferry line", "A ski lift"], explanation: "Underground tunnels put passengers and rescuers at risk." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Deep Impact",
    tmdbId: 8656,
    facts: [
      { category: "threat", difficulty: "easy", question: "In Deep Impact, what cosmic threat is headed toward Earth?", answer: "A comet", wrong: ["A rogue planet", "A solar flare", "A black hole"], explanation: "A comet on collision course drives the disaster plot." },
      { category: "mission", difficulty: "medium", question: "In Deep Impact, what is the mission sent to destroy or deflect the comet called?", answer: "Messiah", wrong: ["Freedom", "Icarus", "Ares"], explanation: "The Messiah crew attempts to stop the comet." },
      { category: "character", difficulty: "medium", question: "In Deep Impact, what young astronomer helps discover the comet?", answer: "Leo Biederman", wrong: ["Elijah Price", "David Levinson", "Jim Lovell"], explanation: "Leo's discovery helps reveal the threat." },
      { category: "survival", difficulty: "hard", question: "In Deep Impact, what kind of shelters are prepared for some survivors?", answer: "Underground caves", wrong: ["Space stations", "Submarines", "Floating cities"], explanation: "A limited number of people are selected for underground survival." },
      { category: "impact", difficulty: "expert", question: "In Deep Impact, what disaster follows the smaller comet fragment's ocean impact?", answer: "A massive tsunami", wrong: ["A global sandstorm", "A lava flood", "A magnetic blackout"], explanation: "The ocean strike creates a devastating wave." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Armageddon",
    tmdbId: 95,
    facts: [
      { category: "threat", difficulty: "easy", question: "In Armageddon, what is on a collision course with Earth?", answer: "An asteroid", wrong: ["A comet tail", "A moon", "A solar storm"], explanation: "A giant asteroid threatens extinction." },
      { category: "team", difficulty: "medium", question: "In Armageddon, what type of workers are recruited to save Earth?", answer: "Oil drillers", wrong: ["Deep-sea divers", "Volcanologists", "Mountain climbers"], explanation: "NASA needs drilling expertise to plant a nuclear device." },
      { category: "character", difficulty: "medium", question: "In Armageddon, who leads the drilling team?", answer: "Harry Stamper", wrong: ["A.J. Frost", "Dan Truman", "Rockhound"], explanation: "Harry is the veteran driller at the center of the mission." },
      { category: "mission", difficulty: "hard", question: "In Armageddon, what must the team do on the asteroid?", answer: "Drill a hole for a nuclear bomb", wrong: ["Build a shield", "Tow it with cables", "Mine its core for fuel"], explanation: "The plan is to split the asteroid before it hits Earth." },
      { category: "ending", difficulty: "expert", question: "In Armageddon, who stays behind to detonate the bomb manually?", answer: "Harry", wrong: ["A.J.", "Rockhound", "Chick"], explanation: "Harry sacrifices himself so the mission can succeed." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "2012",
    tmdbId: 14161,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In 2012, what scale of disaster threatens civilization?", answer: "Global crust and climate catastrophe", wrong: ["A single tornado", "A city blackout", "A shark attack"], explanation: "The film imagines worldwide geological collapse." },
      { category: "character", difficulty: "medium", question: "In 2012, what is Jackson Curtis trying to save?", answer: "His family", wrong: ["A museum", "A comet sample", "A submarine crew"], explanation: "Jackson races through disasters to keep his family alive." },
      { category: "escape", difficulty: "medium", question: "In 2012, what enormous vessels are built as survival arks?", answer: "Ships in China", wrong: ["Spacecraft on Mars", "Underground trains", "Floating balloons"], explanation: "Secret arks are built to preserve selected survivors." },
      { category: "scene", difficulty: "hard", question: "In 2012, what city is famously destroyed as Jackson escapes by plane?", answer: "Los Angeles", wrong: ["Toronto", "Paris", "Sydney"], explanation: "Los Angeles collapses around the escaping characters." },
      { category: "science", difficulty: "expert", question: "In 2012, what particle-related event helps trigger the catastrophe?", answer: "Solar neutrinos heating Earth's core", wrong: ["Moon fragments cooling the oceans", "Cosmic dust freezing the poles", "Magnetic rain"], explanation: "The film's fictional science centers on neutrinos affecting the core." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Impossible",
    tmdbId: 80278,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In The Impossible, what real natural disaster strikes the family?", answer: "The 2004 Indian Ocean tsunami", wrong: ["Hurricane Katrina", "The San Francisco earthquake", "A volcanic eruption"], explanation: "The film dramatizes a family's experience during the 2004 tsunami." },
      { category: "setting", difficulty: "medium", question: "In The Impossible, where is the family vacationing when the tsunami hits?", answer: "Thailand", wrong: ["Japan", "Hawaii", "Indonesia only"], explanation: "They are staying at a resort in Thailand." },
      { category: "family", difficulty: "medium", question: "In The Impossible, who is Maria separated from after the wave?", answer: "Most of her family except Lucas", wrong: ["Only her husband", "Only her youngest child", "No one"], explanation: "Maria and Lucas survive together while searching for the others." },
      { category: "survival", difficulty: "hard", question: "In The Impossible, what injury makes Maria's survival especially urgent?", answer: "A severe leg wound", wrong: ["Blindness", "A broken neck", "Poisoning"], explanation: "Maria's wound becomes a major medical emergency." },
      { category: "tone", difficulty: "expert", question: "In The Impossible, what is the central emotional goal after the tsunami?", answer: "Reuniting the separated family", wrong: ["Finding buried treasure", "Stopping a second wave scientifically", "Escaping a villain"], explanation: "The film focuses on survival, rescue, and family reunion." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Perfect Storm",
    tmdbId: 2133,
    facts: [
      { category: "weather", difficulty: "easy", question: "In The Perfect Storm, what kind of natural disaster threatens the fishing boat?", answer: "A massive storm at sea", wrong: ["A volcanic eruption", "A tornado swarm inland", "A desert sandstorm"], explanation: "The Andrea Gail is caught in a historic ocean storm." },
      { category: "boat", difficulty: "medium", question: "In The Perfect Storm, what is the name of the fishing vessel at the center of the story?", answer: "Andrea Gail", wrong: ["Jenny", "Orca", "Poseidon"], explanation: "The Andrea Gail becomes trapped in the storm." },
      { category: "job", difficulty: "medium", question: "In The Perfect Storm, what are the main characters fishing for?", answer: "Swordfish", wrong: ["Crab", "Tuna only", "Lobster"], explanation: "The crew is on a swordfishing trip." },
      { category: "captain", difficulty: "hard", question: "In The Perfect Storm, who captains the Andrea Gail?", answer: "Billy Tyne", wrong: ["Bobby Shatford", "Dale Murphy", "John Spillane"], explanation: "Billy Tyne leads the crew into dangerous waters." },
      { category: "setting", difficulty: "expert", question: "In The Perfect Storm, what Massachusetts fishing town is the crew associated with?", answer: "Gloucester", wrong: ["Salem", "Provincetown", "New Bedford only"], explanation: "Gloucester is central to the crew's home life and departure." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Poseidon",
    tmdbId: 503,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In Poseidon, what overturns the cruise ship?", answer: "A rogue wave", wrong: ["A volcano", "A tornado", "An earthquake only"], explanation: "A huge wave capsizes the ship on New Year's Eve." },
      { category: "setting", difficulty: "medium", question: "In Poseidon, when does the disaster strike the passengers?", answer: "During a New Year's celebration", wrong: ["During a wedding", "At sunrise breakfast", "During a rescue drill"], explanation: "The ship is celebrating New Year's when the wave hits." },
      { category: "survival", difficulty: "medium", question: "In Poseidon, what direction must survivors move after the ship capsizes?", answer: "Up through the overturned ship", wrong: ["Down to the ballroom", "Straight to the engine room only", "Into the casino vault"], explanation: "Because the ship is upside down, escape means moving toward the hull." },
      { category: "hazard", difficulty: "hard", question: "In Poseidon, what makes the ship's layout especially dangerous after the wave?", answer: "Everything is upside down and flooding", wrong: ["The ship becomes invisible", "The ocean freezes", "The engines launch it into the air"], explanation: "The inverted ship traps survivors in collapsing, flooded spaces." },
      { category: "genre", difficulty: "expert", question: "In Poseidon, the story is a remake of what classic disaster premise?", answer: "The Poseidon Adventure", wrong: ["Airport", "Earthquake", "The Towering Inferno"], explanation: "Poseidon updates the capsized-liner disaster story." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Into the Storm",
    tmdbId: 216282,
    facts: [
      { category: "weather", difficulty: "easy", question: "In Into the Storm, what disaster strikes the town of Silverton?", answer: "Tornadoes", wrong: ["A tsunami", "A volcano", "A meteor shower"], explanation: "The film centers on a tornado outbreak." },
      { category: "format", difficulty: "medium", question: "In Into the Storm, what style is used for much of the footage?", answer: "Found footage and storm-chaser cameras", wrong: ["Silent-film reels", "Animated flashbacks", "Security-camera only"], explanation: "The movie uses cameras carried by characters and crews." },
      { category: "vehicle", difficulty: "medium", question: "In Into the Storm, what armored vehicle is built to film tornadoes?", answer: "Titus", wrong: ["Dorothy", "The Ark", "Messiah"], explanation: "Titus is designed to anchor down and record tornadoes." },
      { category: "setting", difficulty: "hard", question: "In Into the Storm, what school event is disrupted by the tornado outbreak?", answer: "Graduation", wrong: ["Prom", "Homecoming", "A football final"], explanation: "The storm hits during graduation-day events." },
      { category: "scene", difficulty: "expert", question: "In Into the Storm, what happens when a massive fire tornado appears?", answer: "Flames are pulled into the vortex", wrong: ["The tornado freezes instantly", "It becomes a waterspout", "It turns into hail"], explanation: "The film uses a dramatic fire-tornado set piece." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Greenland",
    tmdbId: 524047,
    facts: [
      { category: "threat", difficulty: "easy", question: "In Greenland, what disaster threatens Earth?", answer: "Fragments from a comet", wrong: ["A supervolcano", "A solar eclipse", "A tornado outbreak"], explanation: "Comet fragments create an extinction-level threat." },
      { category: "family", difficulty: "medium", question: "In Greenland, who is John Garrity trying to protect?", answer: "His wife and son", wrong: ["His research team", "His brother only", "A school bus"], explanation: "The story follows the Garrity family trying to reach safety." },
      { category: "destination", difficulty: "medium", question: "In Greenland, what kind of place are selected survivors trying to reach?", answer: "An underground bunker", wrong: ["A moon base", "A cruise ship", "A mountain temple"], explanation: "Government bunkers offer a chance to survive impact." },
      { category: "conflict", difficulty: "hard", question: "In Greenland, what medical issue complicates the family's selection status?", answer: "The son's diabetes", wrong: ["John's broken arm", "Allison's blindness", "A contagious virus"], explanation: "Nathan's insulin needs become a major obstacle." },
      { category: "scale", difficulty: "expert", question: "In Greenland, the biggest fragment is known by what name?", answer: "Clarke", wrong: ["Wormwood", "Icarus", "Lucifer"], explanation: "Clarke is the comet fragment tied to the extinction event." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Wave",
    tmdbId: 336882,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In The Wave, what natural disaster threatens the Norwegian town?", answer: "A tsunami from a mountain collapse", wrong: ["A wildfire", "A volcanic ash cloud", "A desert storm"], explanation: "A rockslide into the fjord creates a deadly wave." },
      { category: "profession", difficulty: "medium", question: "In The Wave, what is Kristian's scientific specialty?", answer: "Geology", wrong: ["Astronomy", "Meteorology", "Marine biology only"], explanation: "Kristian monitors mountain instability near the fjord." },
      { category: "warning", difficulty: "medium", question: "In The Wave, how much warning time do residents have after the collapse?", answer: "About ten minutes", wrong: ["Two days", "One hour", "Thirty seconds only"], explanation: "The wave reaches the town very quickly after the landslide." },
      { category: "location", difficulty: "hard", question: "In The Wave, what scenic Norwegian area is central to the disaster?", answer: "Geirangerfjord", wrong: ["Oslo harbor", "The Arctic Circle ice shelf", "Bergen airport"], explanation: "The film uses the fjord's real landslide risk as its premise." },
      { category: "family", difficulty: "expert", question: "In The Wave, what personal stakes drive Kristian during the evacuation?", answer: "Saving his family", wrong: ["Protecting a museum", "Recovering gold", "Winning an election"], explanation: "Kristian races to get his family out before the wave hits." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Quake",
    tmdbId: 416194,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In The Quake, what natural disaster threatens Oslo?", answer: "An earthquake", wrong: ["A tsunami", "A hurricane", "A volcano"], explanation: "The sequel shifts from wave disaster to earthquake risk." },
      { category: "character", difficulty: "medium", question: "In The Quake, which geologist returns from The Wave?", answer: "Kristian Eikjord", wrong: ["Jack Hall", "Harry Dalton", "Ray Gaines"], explanation: "Kristian again warns about a looming disaster." },
      { category: "setting", difficulty: "medium", question: "In The Quake, what city faces the main catastrophe?", answer: "Oslo", wrong: ["Bergen", "Stockholm", "Copenhagen"], explanation: "The film imagines a major quake in Norway's capital." },
      { category: "threat", difficulty: "hard", question: "In The Quake, what makes the disaster hard for authorities to accept?", answer: "The warning signs seem uncertain until it is too late", wrong: ["No one knows what earthquakes are", "The city is already evacuated", "The quake happens on another planet"], explanation: "The story builds on disputed evidence and ignored warnings." },
      { category: "survival", difficulty: "expert", question: "In The Quake, what kind of urban structure becomes part of the rescue danger?", answer: "A high-rise building", wrong: ["A submarine", "A ski lodge", "A volcano crater"], explanation: "The quake creates a tense skyscraper survival sequence." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Core",
    tmdbId: 9341,
    facts: [
      { category: "threat", difficulty: "easy", question: "In The Core, what has stopped working properly inside Earth?", answer: "The planet's core", wrong: ["The moon's orbit", "The ocean tides", "The ozone layer only"], explanation: "The core's stalled rotation threatens Earth's magnetic field." },
      { category: "mission", difficulty: "medium", question: "In The Core, where does the team travel to restart Earth's core?", answer: "Deep inside the Earth", wrong: ["The sun", "Mars", "The ocean floor only"], explanation: "The mission drills into the planet to reach the core." },
      { category: "vehicle", difficulty: "medium", question: "In The Core, what special material is the mission craft made from?", answer: "Unobtanium", wrong: ["Vibranium", "Adamantium", "Mithril"], explanation: "The fictional material can withstand extreme underground conditions." },
      { category: "danger", difficulty: "hard", question: "In The Core, what global protection begins failing because of the core problem?", answer: "Earth's magnetic field", wrong: ["Gravity", "The water cycle", "The clouds"], explanation: "The weakening magnetic field exposes the planet to deadly radiation effects." },
      { category: "science", difficulty: "expert", question: "In The Core, what kind of expert is Josh Keyes?", answer: "A geophysicist", wrong: ["A volcanologist only", "A storm chaser", "A marine archaeologist"], explanation: "Keyes is recruited because of his geophysical expertise." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Geostorm",
    tmdbId: 274855,
    facts: [
      { category: "technology", difficulty: "easy", question: "In Geostorm, what system is designed to control extreme weather?", answer: "A satellite weather-control network", wrong: ["A magic compass", "A volcano plug", "A fleet of submarines"], explanation: "The Dutch Boy satellite system is meant to regulate climate disasters." },
      { category: "threat", difficulty: "medium", question: "In Geostorm, what happens when the weather-control system is sabotaged?", answer: "It creates catastrophic weather events", wrong: ["It stops gravity", "It turns oceans to glass", "It summons aliens"], explanation: "The system begins causing disasters instead of preventing them." },
      { category: "character", difficulty: "medium", question: "In Geostorm, who helped design the satellite system?", answer: "Jake Lawson", wrong: ["Jack Hall", "Harry Stamper", "Mark Watney"], explanation: "Jake is brought back to fix the malfunctioning system." },
      { category: "countdown", difficulty: "hard", question: "In Geostorm, what is the feared worldwide chain reaction called?", answer: "A geostorm", wrong: ["The Big Freeze", "The Corefall", "A skyquake"], explanation: "A geostorm would make multiple disasters cascade globally." },
      { category: "setting", difficulty: "expert", question: "In Geostorm, where must Jake go to repair the system?", answer: "The space station", wrong: ["The Mariana Trench", "Mount Everest", "Area 51"], explanation: "The weather-control network is managed from orbit." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Earthquake",
    tmdbId: 11123,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In Earthquake, what disaster strikes Los Angeles?", answer: "A major earthquake", wrong: ["A meteor shower", "A hurricane", "A volcanic eruption"], explanation: "The film is one of the classic 1970s disaster movies." },
      { category: "city", difficulty: "medium", question: "In Earthquake, which city is the primary setting?", answer: "Los Angeles", wrong: ["San Francisco", "Seattle", "Houston"], explanation: "The quake devastates Los Angeles." },
      { category: "structure", difficulty: "medium", question: "In Earthquake, what kind of urban infrastructure becomes especially dangerous after the quake?", answer: "Damaged buildings and utilities", wrong: ["A space elevator", "A frozen river", "A desert mine only"], explanation: "The disaster creates collapses, fires, and trapped survivors." },
      { category: "era", difficulty: "hard", question: "In Earthquake, what disaster-film tradition does it belong to?", answer: "1970s ensemble disaster cinema", wrong: ["Silent-era fantasy", "Found-footage horror", "Mockumentary comedy"], explanation: "It follows multiple characters through a large-scale catastrophe." },
      { category: "effects", difficulty: "expert", question: "In Earthquake, what theatrical sound process was famously promoted with the film?", answer: "Sensurround", wrong: ["Cinerama only", "Smell-O-Vision", "Bullet Time"], explanation: "Sensurround was used to make theaters rumble during quake scenes." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Towering Inferno",
    tmdbId: 5919,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In The Towering Inferno, what disaster traps people in a skyscraper?", answer: "A high-rise fire", wrong: ["An earthquake only", "A flood", "A tornado"], explanation: "A fire spreads through a newly opened skyscraper." },
      { category: "setting", difficulty: "medium", question: "In The Towering Inferno, what event is happening when the fire breaks out?", answer: "The building's dedication party", wrong: ["A school graduation", "A secret auction", "A court trial"], explanation: "Guests are celebrating the tower's opening." },
      { category: "rescue", difficulty: "medium", question: "In The Towering Inferno, what profession is central to the rescue effort?", answer: "Firefighters", wrong: ["Storm chasers", "Astronauts", "Volcanologists"], explanation: "Firefighters lead the attempt to save trapped guests." },
      { category: "cause", difficulty: "hard", question: "In The Towering Inferno, what helps cause the disaster?", answer: "Faulty wiring and cost-cutting", wrong: ["A meteor strike", "A volcanic vent", "A rogue wave"], explanation: "Unsafe construction decisions contribute to the fire." },
      { category: "genre", difficulty: "expert", question: "In The Towering Inferno, what kind of disaster film structure is used?", answer: "Large ensemble survival drama", wrong: ["Single-room mystery", "Animated fairy tale", "Sports documentary"], explanation: "The movie follows many characters trapped by one escalating disaster." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "Crawl",
    tmdbId: 511987,
    facts: [
      { category: "weather", difficulty: "easy", question: "In Crawl, what natural disaster traps Haley and her father?", answer: "A hurricane", wrong: ["A blizzard", "A volcanic eruption", "A meteor shower"], explanation: "The hurricane floods the area and creates the survival situation." },
      { category: "creature", difficulty: "easy", question: "In Crawl, what animals stalk the flooded house?", answer: "Alligators", wrong: ["Sharks", "Wolves", "Bears"], explanation: "Floodwaters bring alligators into the crawl space." },
      { category: "setting", difficulty: "medium", question: "In Crawl, where are Haley and her father trapped for much of the film?", answer: "A crawl space under a house", wrong: ["A shopping mall", "A lighthouse", "A subway tunnel"], explanation: "The house's crawl space becomes a flooding trap." },
      { category: "character", difficulty: "hard", question: "In Crawl, what athletic background helps Haley survive?", answer: "Competitive swimming", wrong: ["Boxing", "Rock climbing", "Archery"], explanation: "Haley's swimming skill is crucial in the flooded environment." },
      { category: "survival", difficulty: "expert", question: "In Crawl, what combination makes the disaster especially dangerous?", answer: "Rising floodwater and predators", wrong: ["Lava and snow", "Earthquakes and robots", "Drought and sandworms"], explanation: "The film combines hurricane flooding with alligator attacks." },
    ],
  },
  {
    slug: "natural-disaster-challenge",
    title: "The Poseidon Adventure",
    tmdbId: 551,
    facts: [
      { category: "disaster", difficulty: "easy", question: "In The Poseidon Adventure, what capsizes the ocean liner?", answer: "A huge wave", wrong: ["A volcano", "A bomb", "A tornado"], explanation: "The classic disaster film follows survivors after a wave overturns the ship." },
      { category: "setting", difficulty: "medium", question: "In The Poseidon Adventure, what holiday celebration is underway when disaster strikes?", answer: "New Year's Eve", wrong: ["Christmas morning", "Halloween night", "Thanksgiving dinner"], explanation: "The ship is celebrating New Year's Eve when the wave hits." },
      { category: "leader", difficulty: "medium", question: "In The Poseidon Adventure, who urges survivors to climb upward through the overturned ship?", answer: "Reverend Scott", wrong: ["Captain Harrison", "Mr. Rogo", "Acres"], explanation: "Reverend Scott leads a group toward the hull." },
      { category: "hazard", difficulty: "hard", question: "In The Poseidon Adventure, why is moving upward the best chance of escape?", answer: "The ship is upside down", wrong: ["The elevators still work", "The roof is underwater first", "The engine room has lifeboats"], explanation: "The capsized ship reverses the normal layout." },
      { category: "legacy", difficulty: "expert", question: "In The Poseidon Adventure, what made it a model for later disaster films?", answer: "An ensemble cast trapped in escalating danger", wrong: ["A superhero origin story", "A time-loop plot", "A musical competition"], explanation: "Its ensemble survival structure influenced disaster cinema." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "comedy-challenge",
    title: "Airplane!",
    tmdbId: 813,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Airplane!, what kind of trip turns into a disaster-comedy crisis?", answer: "A commercial airline flight", wrong: ["A cruise ship voyage", "A train robbery", "A space mission"], explanation: "Most of the film unfolds aboard a troubled passenger flight." },
      { category: "character", difficulty: "medium", question: "In Airplane!, what is Ted Striker afraid to do after his wartime trauma?", answer: "Fly", wrong: ["Cook", "Sing", "Drive"], explanation: "Ted's fear of flying is central to his comic comeback." },
      { category: "quote", difficulty: "medium", question: "In Airplane!, what line follows 'I am serious'?", answer: "And don't call me Shirley", wrong: ["And stop the plane", "And check the cockpit", "And pour the coffee"], explanation: "Leslie Nielsen's deadpan delivery made the line iconic." },
      { category: "food", difficulty: "hard", question: "In Airplane!, what causes many passengers and crew members to become ill?", answer: "The fish dinner", wrong: ["The coffee", "A gas leak", "The peanuts"], explanation: "The fish meal triggers the in-flight medical emergency." },
      { category: "parody", difficulty: "expert", question: "In Airplane!, the film primarily parodies what kind of 1970s movie?", answer: "Airport disaster dramas", wrong: ["Martial arts revenge films", "Teen beach musicals", "Western shootouts"], explanation: "Airplane! spoofs the Airport-style disaster movie formula." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "The Hangover",
    tmdbId: 18785,
    facts: [
      { category: "setting", difficulty: "easy", question: "In The Hangover, what city does the bachelor party visit?", answer: "Las Vegas", wrong: ["Miami", "New Orleans", "Atlantic City"], explanation: "The missing-night chaos begins in Las Vegas." },
      { category: "mystery", difficulty: "medium", question: "In The Hangover, who is missing after the group wakes up?", answer: "Doug", wrong: ["Alan", "Phil", "Stu"], explanation: "The group must find groom-to-be Doug before the wedding." },
      { category: "animal", difficulty: "medium", question: "In The Hangover, what unexpected animal is found in the hotel room?", answer: "A tiger", wrong: ["A horse", "A goat", "A snake"], explanation: "The tiger belongs to Mike Tyson and becomes part of the mystery." },
      { category: "character", difficulty: "hard", question: "In The Hangover, which character wakes up missing a tooth?", answer: "Stu", wrong: ["Phil", "Doug", "Alan"], explanation: "Stu's missing tooth is one of the clues from the lost night." },
      { category: "object", difficulty: "expert", question: "In The Hangover, where does the group eventually find Doug?", answer: "On the hotel roof", wrong: ["In a chapel", "At the police station", "Inside a casino vault"], explanation: "Doug has been stranded on the roof after the group's blackout." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Bridesmaids",
    tmdbId: 55721,
    facts: [
      { category: "friendship", difficulty: "easy", question: "In Bridesmaids, whose wedding is Annie asked to be part of?", answer: "Lillian's", wrong: ["Helen's", "Megan's", "Rita's"], explanation: "Annie is Lillian's longtime best friend and maid of honor." },
      { category: "rivalry", difficulty: "medium", question: "In Bridesmaids, who becomes Annie's polished rival in the bridal party?", answer: "Helen", wrong: ["Megan", "Becca", "Rita"], explanation: "Helen's wealth and control create tension with Annie." },
      { category: "scene", difficulty: "medium", question: "In Bridesmaids, what kind of shop does the group visit before a notorious illness scene?", answer: "A bridal shop", wrong: ["A bakery", "A toy store", "A furniture store"], explanation: "The dress fitting devolves into one of the film's signature set pieces." },
      { category: "job", difficulty: "hard", question: "In Bridesmaids, what business did Annie lose before the events of the movie?", answer: "A bakery", wrong: ["A florist shop", "A salon", "A record store"], explanation: "Annie's failed bakery reflects her larger personal crisis." },
      { category: "romance", difficulty: "expert", question: "In Bridesmaids, what is Officer Rhodes especially encouraging Annie to make again?", answer: "Cupcakes", wrong: ["Wedding dresses", "Jewelry", "Perfume"], explanation: "Rhodes supports Annie's return to baking." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Superbad",
    tmdbId: 8363,
    facts: [
      { category: "friendship", difficulty: "easy", question: "In Superbad, what are Seth and Evan trying to bring to a party?", answer: "Alcohol", wrong: ["A band", "A stolen car", "A movie projector"], explanation: "Their attempt to get alcohol drives the night." },
      { category: "alias", difficulty: "medium", question: "In Superbad, what fake ID name does Fogell use?", answer: "McLovin", wrong: ["Dr. Funke", "Ron Mexico", "Max Power"], explanation: "The single-name ID becomes one of the movie's signature jokes." },
      { category: "police", difficulty: "medium", question: "In Superbad, which two police officers spend the night with Fogell?", answer: "Slater and Michaels", wrong: ["Riggs and Murtaugh", "Jake and Elwood", "Schmidt and Jenko"], explanation: "The officers turn Fogell's night into a strange ride-along." },
      { category: "theme", difficulty: "hard", question: "In Superbad, what upcoming life change pressures Seth and Evan's friendship?", answer: "They are going to different colleges", wrong: ["They are joining the army", "They are moving countries", "They are starting a band"], explanation: "The film's emotional core is their anxiety about separating." },
      { category: "scene", difficulty: "expert", question: "In Superbad, what unusual drawings from Seth's childhood become a recurring reveal?", answer: "Obscene notebook drawings", wrong: ["Treasure maps", "Alien sketches", "Fake IDs"], explanation: "Seth's childhood notebook becomes an embarrassing flashback gag." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Anchorman: The Legend of Ron Burgundy",
    tmdbId: 8699,
    facts: [
      { category: "job", difficulty: "easy", question: "In Anchorman, what is Ron Burgundy's profession?", answer: "News anchor", wrong: ["Weather pilot", "Sports agent", "Radio DJ only"], explanation: "Ron anchors the Channel 4 news team." },
      { category: "setting", difficulty: "medium", question: "In Anchorman, what city is Ron Burgundy's news station based in?", answer: "San Diego", wrong: ["Los Angeles", "Phoenix", "Denver"], explanation: "Ron repeatedly celebrates San Diego." },
      { category: "character", difficulty: "medium", question: "In Anchorman, who becomes Ron's major professional rival and love interest?", answer: "Veronica Corningstone", wrong: ["Chani Lastnamé", "Linda Richman", "Elaine Benes"], explanation: "Veronica challenges Ron's status at the station." },
      { category: "scene", difficulty: "hard", question: "In Anchorman, what kind of absurd confrontation breaks out between rival news teams?", answer: "A street fight", wrong: ["A spelling bee", "A dance contest", "A courtroom trial"], explanation: "Multiple news teams arrive for an over-the-top brawl." },
      { category: "quote", difficulty: "expert", question: "In Anchorman, what does Ron love so much he famously says he loves it?", answer: "Lamp", wrong: ["Desk", "Microphone", "Saxophone"], explanation: "Brick's 'I love lamp' line is a classic non sequitur." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Dumb and Dumber",
    tmdbId: 8467,
    facts: [
      { category: "duo", difficulty: "easy", question: "In Dumb and Dumber, what are the first names of the two main friends?", answer: "Lloyd and Harry", wrong: ["Wayne and Garth", "Jake and Elwood", "Bill and Ted"], explanation: "Lloyd Christmas and Harry Dunne are the central duo." },
      { category: "quest", difficulty: "medium", question: "In Dumb and Dumber, what item does Lloyd try to return to Mary?", answer: "A briefcase", wrong: ["A necklace", "A passport", "A dog carrier"], explanation: "The briefcase contains ransom money, though Lloyd does not know that." },
      { category: "destination", difficulty: "medium", question: "In Dumb and Dumber, where do Lloyd and Harry travel to find Mary?", answer: "Aspen", wrong: ["Las Vegas", "Seattle", "Miami"], explanation: "Their road trip heads to Aspen, Colorado." },
      { category: "vehicle", difficulty: "hard", question: "In Dumb and Dumber, what is distinctive about Harry's van?", answer: "It is styled like a dog", wrong: ["It is invisible", "It is a hearse", "It has wings"], explanation: "The shaggy dog van is tied to Harry's grooming business." },
      { category: "scene", difficulty: "expert", question: "In Dumb and Dumber, what formalwear color combination do Lloyd and Harry wear to the charity event?", answer: "Orange and blue", wrong: ["Black and white", "Red and green", "Purple and gold"], explanation: "Their loud tuxedos are one of the movie's most memorable visual jokes." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Groundhog Day",
    tmdbId: 137,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Groundhog Day, what day does Phil Connors keep reliving?", answer: "Groundhog Day", wrong: ["Christmas Eve", "New Year's Day", "Halloween"], explanation: "Phil wakes up repeatedly on February 2." },
      { category: "job", difficulty: "medium", question: "In Groundhog Day, what is Phil Connors' job?", answer: "TV weatherman", wrong: ["Radio psychiatrist", "News photographer", "Hotel manager"], explanation: "Phil covers the annual Groundhog Day event." },
      { category: "location", difficulty: "medium", question: "In Groundhog Day, what town is Phil trapped in?", answer: "Punxsutawney", wrong: ["Scranton", "Bedford Falls", "Derry"], explanation: "The Groundhog Day ceremony takes place in Punxsutawney." },
      { category: "character", difficulty: "hard", question: "In Groundhog Day, who is Phil's producer and romantic interest?", answer: "Rita", wrong: ["Nancy", "Doris", "Debbie"], explanation: "Rita becomes central to Phil's emotional growth." },
      { category: "growth", difficulty: "expert", question: "In Groundhog Day, what finally helps Phil move beyond the loop?", answer: "Becoming genuinely compassionate", wrong: ["Winning the lottery", "Leaving town by force", "Destroying the clock"], explanation: "Phil changes by learning empathy, skill, and care for others." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Ghostbusters",
    tmdbId: 620,
    facts: [
      { category: "team", difficulty: "easy", question: "In Ghostbusters, what do the main characters start as a business?", answer: "A paranormal removal service", wrong: ["A pizza shop", "A security company", "A radio station"], explanation: "They become professional ghost catchers in New York." },
      { category: "vehicle", difficulty: "medium", question: "In Ghostbusters, what is the team's converted ambulance called?", answer: "Ecto-1", wrong: ["KITT", "The Mystery Machine", "Interceptor"], explanation: "Ecto-1 is the Ghostbusters' signature vehicle." },
      { category: "villain", difficulty: "medium", question: "In Ghostbusters, what ancient entity threatens New York?", answer: "Gozer", wrong: ["Zuul only", "Vigo", "Slimer"], explanation: "Gozer manifests through the rooftop portal." },
      { category: "mascot", difficulty: "hard", question: "In Ghostbusters, what giant figure appears during the finale?", answer: "Stay Puft Marshmallow Man", wrong: ["A giant hot dog", "A cereal mascot", "A toy robot"], explanation: "Ray accidentally chooses the form of the destructor." },
      { category: "rule", difficulty: "expert", question: "In Ghostbusters, what equipment warning does Egon give the team?", answer: "Do not cross the streams", wrong: ["Never open a trap", "Do not look at Slimer", "Never answer the phone"], explanation: "Crossing proton streams is described as extremely dangerous." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "The Big Lebowski",
    tmdbId: 115,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Big Lebowski, what nickname does Jeffrey Lebowski prefer?", answer: "The Dude", wrong: ["The Boss", "The Kingpin", "The Stranger"], explanation: "Jeffrey Lebowski is known almost entirely as The Dude." },
      { category: "object", difficulty: "medium", question: "In The Big Lebowski, what household item is The Dude upset about losing?", answer: "His rug", wrong: ["His couch", "His lamp", "His bowling ball"], explanation: "The rug 'really tied the room together.'" },
      { category: "hobby", difficulty: "medium", question: "In The Big Lebowski, what sport is central to The Dude's social life?", answer: "Bowling", wrong: ["Golf", "Pool", "Darts"], explanation: "The bowling alley is the film's main hangout." },
      { category: "friend", difficulty: "hard", question: "In The Big Lebowski, which friend is a volatile Vietnam veteran?", answer: "Walter", wrong: ["Donny", "Brandt", "Knox"], explanation: "Walter constantly escalates situations." },
      { category: "drink", difficulty: "expert", question: "In The Big Lebowski, what cocktail is most associated with The Dude?", answer: "White Russian", wrong: ["Martini", "Margarita", "Old Fashioned"], explanation: "The Dude drinks White Russians throughout the film." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Monty Python and the Holy Grail",
    tmdbId: 762,
    facts: [
      { category: "quest", difficulty: "easy", question: "In Monty Python and the Holy Grail, what is King Arthur seeking?", answer: "The Holy Grail", wrong: ["Excalibur", "A dragon egg", "A lost crown"], explanation: "The quest parodies Arthurian legend." },
      { category: "sound", difficulty: "medium", question: "In Holy Grail, what replaces actual horses for the knights?", answer: "Coconut shells", wrong: ["Tin cans", "Drums", "Whistles"], explanation: "The clopping coconut gag became one of the film's most famous jokes." },
      { category: "creature", difficulty: "medium", question: "In Holy Grail, what deceptively cute creature guards the cave?", answer: "The Killer Rabbit", wrong: ["The Black Beast", "A three-headed giant", "A talking goat"], explanation: "The rabbit brutally attacks the knights." },
      { category: "weapon", difficulty: "hard", question: "In Holy Grail, what holy weapon is used against the Killer Rabbit?", answer: "The Holy Hand Grenade", wrong: ["Excalibur", "The Sword of Truth", "The Lance of Light"], explanation: "The Holy Hand Grenade of Antioch defeats the rabbit." },
      { category: "challenge", difficulty: "expert", question: "In Holy Grail, what must travelers answer at the Bridge of Death?", answer: "Three questions", wrong: ["A riddle song", "A tax form", "A chess puzzle"], explanation: "The bridgekeeper asks three questions before allowing passage." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "The 40 Year Old Virgin",
    tmdbId: 6957,
    facts: [
      { category: "character", difficulty: "easy", question: "In The 40 Year Old Virgin, what is the main character's first name?", answer: "Andy", wrong: ["Cal", "David", "Jay"], explanation: "Andy Stitzer is the shy central character." },
      { category: "job", difficulty: "medium", question: "In The 40 Year Old Virgin, where does Andy work?", answer: "An electronics store", wrong: ["A movie theater", "A hospital", "A law office"], explanation: "Andy works at SmartTech with his friends." },
      { category: "hobby", difficulty: "medium", question: "In The 40 Year Old Virgin, what does Andy collect?", answer: "Action figures", wrong: ["Vinyl records", "Baseball cards", "Rare coins"], explanation: "His collectible figures reflect his sheltered lifestyle." },
      { category: "romance", difficulty: "hard", question: "In The 40 Year Old Virgin, who becomes Andy's main romantic interest?", answer: "Trish", wrong: ["Beth", "Nicky", "Paula"], explanation: "Andy builds a real relationship with Trish." },
      { category: "scene", difficulty: "expert", question: "In The 40 Year Old Virgin, what painful grooming scene becomes a major set piece?", answer: "Chest waxing", wrong: ["A bad haircut", "A tattoo removal", "A dental cleaning"], explanation: "The chest-waxing scene is one of the film's most famous improvised moments." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Mean Girls",
    tmdbId: 10625,
    facts: [
      { category: "school", difficulty: "easy", question: "In Mean Girls, what clique does Cady infiltrate?", answer: "The Plastics", wrong: ["The Mathletes", "The Burnouts", "The Drama Club"], explanation: "The Plastics are the school's popular clique." },
      { category: "character", difficulty: "medium", question: "In Mean Girls, who is the leader of The Plastics?", answer: "Regina George", wrong: ["Gretchen Wieners", "Karen Smith", "Janis Ian"], explanation: "Regina controls the group's social power." },
      { category: "object", difficulty: "medium", question: "In Mean Girls, what book is filled with cruel gossip and insults?", answer: "The Burn Book", wrong: ["The Slam Book", "The Pink Bible", "The Drama File"], explanation: "The Burn Book causes chaos when its contents spread." },
      { category: "date", difficulty: "hard", question: "In Mean Girls, what date is celebrated by fans because of a line from the movie?", answer: "October 3rd", wrong: ["April 25th", "February 14th", "December 1st"], explanation: "Aaron asks Cady what day it is on October 3rd." },
      { category: "competition", difficulty: "expert", question: "In Mean Girls, what academic team does Cady rejoin near the end?", answer: "The Mathletes", wrong: ["The Debate Team", "The Science Olympiad", "The Chess Club"], explanation: "Cady reconnects with the Mathletes during the competition." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Ferris Bueller's Day Off",
    tmdbId: 9377,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Ferris Bueller's Day Off, what does Ferris pretend to be so he can skip school?", answer: "Sick", wrong: ["Grounded", "Lost", "In another country"], explanation: "Ferris fakes illness to spend the day in Chicago." },
      { category: "city", difficulty: "medium", question: "In Ferris Bueller's Day Off, what city do Ferris and his friends explore?", answer: "Chicago", wrong: ["Detroit", "New York", "Boston"], explanation: "The day off includes iconic Chicago locations." },
      { category: "friend", difficulty: "medium", question: "In Ferris Bueller's Day Off, who is Ferris's anxious best friend?", answer: "Cameron", wrong: ["Sloane", "Rooney", "Jeanie"], explanation: "Cameron struggles with fear and his father's expectations." },
      { category: "vehicle", difficulty: "hard", question: "In Ferris Bueller's Day Off, what prized car does Cameron's father own?", answer: "A Ferrari", wrong: ["A Corvette", "A Porsche", "A Mustang"], explanation: "The Ferrari becomes central to Cameron's emotional breaking point." },
      { category: "scene", difficulty: "expert", question: "In Ferris Bueller's Day Off, what parade song does Ferris lip-sync?", answer: "Twist and Shout", wrong: ["Johnny B. Goode", "Danke Schoen only", "Shout"], explanation: "Ferris performs Twist and Shout during the parade sequence." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Office Space",
    tmdbId: 1542,
    facts: [
      { category: "workplace", difficulty: "easy", question: "In Office Space, what type of workplace is being mocked?", answer: "Corporate office cubicle culture", wrong: ["A pirate ship", "A medieval court", "A space station"], explanation: "The film satirizes bland corporate tech work." },
      { category: "character", difficulty: "medium", question: "In Office Space, who repeatedly asks about TPS reports?", answer: "Lumbergh", wrong: ["Milton", "Peter", "Samir"], explanation: "Lumbergh's TPS report reminders are a running joke." },
      { category: "object", difficulty: "medium", question: "In Office Space, what office machine is famously destroyed?", answer: "A printer", wrong: ["A fax machine", "A coffee maker", "A vending machine"], explanation: "The printer-smashing scene became iconic." },
      { category: "scheme", difficulty: "hard", question: "In Office Space, what financial scheme do Peter and his coworkers attempt?", answer: "Skimming fractions of cents", wrong: ["Counterfeiting cash", "Insider trading", "Stealing a payroll truck"], explanation: "Their plan echoes a small-rounding computer scam." },
      { category: "character", difficulty: "expert", question: "In Office Space, what item is Milton especially protective of?", answer: "His red stapler", wrong: ["His coffee mug", "His chair", "His calculator"], explanation: "Milton's stapler obsession is one of the film's lasting details." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Shaun of the Dead",
    tmdbId: 747,
    facts: [
      { category: "genre", difficulty: "easy", question: "In Shaun of the Dead, what horror subgenre is being blended with comedy?", answer: "Zombie movies", wrong: ["Vampire romance", "Werewolf mystery", "Ghost possession"], explanation: "The film is a romantic comedy set during a zombie outbreak." },
      { category: "character", difficulty: "medium", question: "In Shaun of the Dead, who is Shaun's best friend and roommate?", answer: "Ed", wrong: ["David", "Pete", "Philip"], explanation: "Ed's immaturity complicates Shaun's survival plans." },
      { category: "location", difficulty: "medium", question: "In Shaun of the Dead, where does Shaun plan to take everyone for safety?", answer: "The Winchester", wrong: ["The mall", "The police station", "A church"], explanation: "Shaun thinks the pub is the safest place to wait out the crisis." },
      { category: "object", difficulty: "hard", question: "In Shaun of the Dead, what records are thrown as weapons during an attack?", answer: "Vinyl records", wrong: ["DVD cases", "Books", "Dinner plates"], explanation: "Shaun and Ed argue over which records are disposable." },
      { category: "relationship", difficulty: "expert", question: "In Shaun of the Dead, what is Shaun trying to repair before and during the outbreak?", answer: "His relationship with Liz", wrong: ["His job as a doctor", "His band contract", "His political campaign"], explanation: "The apocalypse forces Shaun to grow up for Liz and his loved ones." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Borat",
    tmdbId: 496,
    facts: [
      { category: "format", difficulty: "easy", question: "In Borat, what style does the film use for many encounters?", answer: "Mockumentary interactions", wrong: ["Silent animation", "Found-footage horror", "Courtroom reenactment"], explanation: "The film uses staged character comedy mixed with real interactions." },
      { category: "character", difficulty: "medium", question: "In Borat, what country does Borat claim to be from?", answer: "Kazakhstan", wrong: ["Romania", "Bulgaria", "Latvia"], explanation: "Borat is presented as a fictional Kazakh journalist." },
      { category: "quest", difficulty: "medium", question: "In Borat, who becomes the celebrity obsession that redirects Borat's trip?", answer: "Pamela Anderson", wrong: ["Madonna", "Julia Roberts", "Britney Spears"], explanation: "Borat becomes fixated on Pamela Anderson after watching Baywatch." },
      { category: "companion", difficulty: "hard", question: "In Borat, who travels with Borat as his producer?", answer: "Azamat", wrong: ["Nursultan", "Ken Davitian", "Luenell"], explanation: "Azamat accompanies Borat across America." },
      { category: "satire", difficulty: "expert", question: "In Borat, much of the comedy exposes what through Borat's interviews?", answer: "Prejudice and social awkwardness", wrong: ["Cooking techniques", "Sports strategy", "Magic tricks"], explanation: "The character provokes revealing reactions from people he meets." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "This Is Spinal Tap",
    tmdbId: 11031,
    facts: [
      { category: "format", difficulty: "easy", question: "In This Is Spinal Tap, what fictional band is followed by the documentary crew?", answer: "Spinal Tap", wrong: ["The Rutles", "Steel Dragon", "Stillwater"], explanation: "The film presents itself as a documentary about the band Spinal Tap." },
      { category: "genre", difficulty: "medium", question: "In This Is Spinal Tap, what music scene is being parodied?", answer: "Rock and heavy metal bands", wrong: ["Opera companies", "Jazz quartets", "Country line dancing"], explanation: "The movie satirizes rock touring, ego, and excess." },
      { category: "quote", difficulty: "medium", question: "In This Is Spinal Tap, what number do Nigel's amplifiers go up to?", answer: "11", wrong: ["10", "12", "100"], explanation: "The 'goes to 11' gag became a comedy classic." },
      { category: "stage", difficulty: "hard", question: "In This Is Spinal Tap, what Stonehenge problem ruins a stage set?", answer: "The model is tiny", wrong: ["It catches fire", "It is made of ice", "It is too heavy to move"], explanation: "A measurement mistake creates a miniature Stonehenge." },
      { category: "drummer", difficulty: "expert", question: "In This Is Spinal Tap, what running joke surrounds the band's drummers?", answer: "They die in bizarre ways", wrong: ["They all become managers", "They refuse to tour", "They only play jazz"], explanation: "The band's drummer history is filled with absurd deaths." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Napoleon Dynamite",
    tmdbId: 8193,
    facts: [
      { category: "character", difficulty: "easy", question: "In Napoleon Dynamite, who is Napoleon's best friend at school?", answer: "Pedro", wrong: ["Kip", "Rex", "Don"], explanation: "Napoleon helps Pedro run for class president." },
      { category: "campaign", difficulty: "medium", question: "In Napoleon Dynamite, what office does Pedro run for?", answer: "Class president", wrong: ["Mayor", "Team captain", "Student treasurer"], explanation: "Pedro's campaign leads to the famous dance scene." },
      { category: "family", difficulty: "medium", question: "In Napoleon Dynamite, what is Napoleon's brother named?", answer: "Kip", wrong: ["Rico", "Randy", "Lyle"], explanation: "Kip spends much of the film online and later meets LaFawnduh." },
      { category: "scene", difficulty: "hard", question: "In Napoleon Dynamite, what does Napoleon perform to help Pedro's campaign?", answer: "A dance routine", wrong: ["A magic act", "A guitar solo", "A wrestling match"], explanation: "Napoleon's dance helps Pedro win over the school." },
      { category: "uncle", difficulty: "expert", question: "In Napoleon Dynamite, what past dream is Uncle Rico obsessed with?", answer: "His high school football glory", wrong: ["A chess championship", "A rodeo title", "A cooking contest"], explanation: "Uncle Rico keeps fixating on what might have happened in 1982." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Zoolander",
    tmdbId: 9398,
    facts: [
      { category: "job", difficulty: "easy", question: "In Zoolander, what is Derek Zoolander famous for?", answer: "Male modeling", wrong: ["Cooking", "Race car driving", "News anchoring"], explanation: "Derek is an absurdly self-serious fashion model." },
      { category: "look", difficulty: "medium", question: "In Zoolander, what is Derek's signature facial expression called?", answer: "Blue Steel", wrong: ["Magnum Opus", "Tiger Eyes", "Velvet Thunder"], explanation: "Blue Steel is one of Derek's famous modeling looks." },
      { category: "rival", difficulty: "medium", question: "In Zoolander, who is Derek's younger modeling rival?", answer: "Hansel", wrong: ["Mugatu", "Maury", "Rufus"], explanation: "Hansel's rising fame threatens Derek's status." },
      { category: "villain", difficulty: "hard", question: "In Zoolander, who brainwashes Derek as part of a fashion-world plot?", answer: "Mugatu", wrong: ["Billy Zane", "Maury Ballstein", "J.P. Prewitt"], explanation: "Mugatu uses Derek in an assassination scheme." },
      { category: "stunt", difficulty: "expert", question: "In Zoolander, what ridiculous limitation does Derek struggle with physically?", answer: "He cannot turn left well", wrong: ["He cannot blink", "He cannot sit down", "He cannot hear music"], explanation: "Derek's inability to turn left becomes a runway problem." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Elf",
    tmdbId: 10719,
    facts: [
      { category: "character", difficulty: "easy", question: "In Elf, what is the name of the human raised by elves?", answer: "Buddy", wrong: ["Walter", "Miles", "Jovie"], explanation: "Buddy grows up at the North Pole believing he is an elf." },
      { category: "city", difficulty: "medium", question: "In Elf, what city does Buddy travel to in search of his father?", answer: "New York City", wrong: ["Chicago", "Boston", "Los Angeles"], explanation: "Buddy leaves the North Pole for New York." },
      { category: "father", difficulty: "medium", question: "In Elf, what is Buddy's father's name?", answer: "Walter Hobbs", wrong: ["Miles Finch", "Papa Elf", "Leon"], explanation: "Walter is a children's book publisher and Buddy's biological father." },
      { category: "food", difficulty: "hard", question: "In Elf, what does Buddy add to spaghetti?", answer: "Candy and syrup", wrong: ["Hot sauce", "Pickles", "Coffee grounds"], explanation: "Buddy's elf diet centers on sugar." },
      { category: "ending", difficulty: "expert", question: "In Elf, what helps power Santa's sleigh in Central Park?", answer: "Christmas spirit", wrong: ["A jet engine", "A magic battery", "A police escort"], explanation: "Singing restores enough Christmas spirit for the sleigh to fly." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "The Naked Gun: From the Files of Police Squad!",
    tmdbId: 37136,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Naked Gun, what is the name of the bumbling detective?", answer: "Frank Drebin", wrong: ["Clouseau", "Ace Ventura", "Maxwell Smart"], explanation: "Frank Drebin is the deadpan detective at the center of the chaos." },
      { category: "genre", difficulty: "medium", question: "In The Naked Gun, what genre is mainly being spoofed?", answer: "Police procedurals", wrong: ["Space opera", "Medieval fantasy", "Silent melodrama"], explanation: "The movie parodies crime shows and detective thrillers." },
      { category: "event", difficulty: "medium", question: "In The Naked Gun, what major public event becomes part of the climax?", answer: "A baseball game", wrong: ["A spelling bee", "A wedding", "A boxing match"], explanation: "The baseball sequence is one of the film's biggest set pieces." },
      { category: "target", difficulty: "hard", question: "In The Naked Gun, who is targeted in the assassination plot?", answer: "Queen Elizabeth II", wrong: ["The President", "The Pope", "The Mayor"], explanation: "Frank must stop a plot against the Queen during her visit." },
      { category: "style", difficulty: "expert", question: "In The Naked Gun, what comedy style defines many of the jokes?", answer: "Deadpan absurdity", wrong: ["Improvised stand-up only", "Musical parody only", "Silent mime"], explanation: "The film constantly treats ridiculous events with total seriousness." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Wayne's World",
    tmdbId: 8872,
    facts: [
      { category: "format", difficulty: "easy", question: "In Wayne's World, what do Wayne and Garth host?", answer: "A public-access TV show", wrong: ["A cooking podcast", "A courtroom show", "A sports league"], explanation: "Wayne's World begins as their basement public-access program." },
      { category: "friend", difficulty: "medium", question: "In Wayne's World, who is Wayne's best friend and co-host?", answer: "Garth", wrong: ["Cassandra", "Benjamin", "Stacy"], explanation: "Garth helps host Wayne's World." },
      { category: "music", difficulty: "medium", question: "In Wayne's World, what Queen song is famously performed in the car?", answer: "Bohemian Rhapsody", wrong: ["We Will Rock You", "Another One Bites the Dust", "Don't Stop Me Now"], explanation: "The headbanging car scene revived the song for a new audience." },
      { category: "romance", difficulty: "hard", question: "In Wayne's World, what is Cassandra's profession?", answer: "Rock singer", wrong: ["News anchor", "Mechanic", "Lawyer"], explanation: "Cassandra fronts the band Crucial Taunt." },
      { category: "villain", difficulty: "expert", question: "In Wayne's World, who tries to exploit the show commercially?", answer: "Benjamin", wrong: ["Noah Vanderhoff", "Russell Finley", "Officer Koharski"], explanation: "Benjamin wants to package Wayne's World for sponsors." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Happy Gilmore",
    tmdbId: 9614,
    facts: [
      { category: "sport", difficulty: "easy", question: "In Happy Gilmore, what sport does Happy unexpectedly become good at?", answer: "Golf", wrong: ["Tennis", "Baseball", "Bowling"], explanation: "Happy's hockey-style swing gives him enormous golf distance." },
      { category: "motivation", difficulty: "medium", question: "In Happy Gilmore, why does Happy need prize money?", answer: "To save his grandmother's house", wrong: ["To buy a hockey team", "To open a restaurant", "To pay for college"], explanation: "Happy enters golf tournaments to help his grandmother." },
      { category: "rival", difficulty: "medium", question: "In Happy Gilmore, who is Happy's arrogant golf rival?", answer: "Shooter McGavin", wrong: ["Chubbs Peterson", "Otto", "Doug Thompson"], explanation: "Shooter sees Happy as a threat to his status." },
      { category: "mentor", difficulty: "hard", question: "In Happy Gilmore, who teaches Happy to improve his putting?", answer: "Chubbs Peterson", wrong: ["Shooter", "Bob Barker", "Otto"], explanation: "Chubbs helps Happy become more than a long-drive novelty." },
      { category: "scene", difficulty: "expert", question: "In Happy Gilmore, which TV host gets into a fistfight with Happy?", answer: "Bob Barker", wrong: ["Alex Trebek", "Regis Philbin", "Johnny Carson"], explanation: "The pro-am fight with Bob Barker is one of the movie's signature scenes." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Step Brothers",
    tmdbId: 12133,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Step Brothers, what relationship do Brennan and Dale gain when their parents marry?", answer: "They become stepbrothers", wrong: ["They become coworkers", "They become cousins", "They become rivals on a team"], explanation: "The comedy begins when two adult sons are forced into the same household." },
      { category: "object", difficulty: "medium", question: "In Step Brothers, what musical item is Dale especially protective of?", answer: "His drum set", wrong: ["His guitar", "His keyboard", "His trumpet"], explanation: "The drum set becomes part of a major fight." },
      { category: "project", difficulty: "medium", question: "In Step Brothers, what business idea do Brennan and Dale pitch?", answer: "Prestige Worldwide", wrong: ["Catalina Foods", "Dragon Karate", "Boats and Bros"], explanation: "Prestige Worldwide is their wildly unserious entertainment company." },
      { category: "event", difficulty: "hard", question: "In Step Brothers, what mixer becomes important near the end?", answer: "The Catalina Wine Mixer", wrong: ["The Napa Yacht Ball", "The Aspen Golf Classic", "The Miami Boat Show"], explanation: "The Catalina Wine Mixer becomes the setting for their musical comeback." },
      { category: "performance", difficulty: "expert", question: "In Step Brothers, what song does Brennan perform at the Catalina Wine Mixer?", answer: "Por Ti Volare", wrong: ["Bohemian Rhapsody", "Sweet Caroline", "Time to Say Goodbye only"], explanation: "His performance helps win over the event." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "Tropic Thunder",
    tmdbId: 7446,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Tropic Thunder, what kind of movie are the actors trying to make?", answer: "A Vietnam War movie", wrong: ["A pirate movie", "A space opera", "A courtroom drama"], explanation: "The film satirizes the making of a war epic." },
      { category: "actor", difficulty: "medium", question: "In Tropic Thunder, which character is an intense method actor?", answer: "Kirk Lazarus", wrong: ["Tugg Speedman", "Jeff Portnoy", "Kevin Sandusky"], explanation: "Kirk Lazarus takes method acting to absurd extremes." },
      { category: "character", difficulty: "medium", question: "In Tropic Thunder, what fading action star leads the cast?", answer: "Tugg Speedman", wrong: ["Les Grossman", "Cody Underwood", "Rick Peck"], explanation: "Tugg is trying to revive his career with a serious war film." },
      { category: "producer", difficulty: "hard", question: "In Tropic Thunder, who is the aggressive studio executive overseeing the production?", answer: "Les Grossman", wrong: ["Alpa Chino", "Damien Cockburn", "Four Leaf Tayback"], explanation: "Les Grossman is the profane executive behind the movie." },
      { category: "satire", difficulty: "expert", question: "In Tropic Thunder, much of the comedy targets what Hollywood habit?", answer: "Actors chasing prestige and authenticity", wrong: ["Silent-film editing", "Cooking competitions", "Theme-park operations"], explanation: "The film skewers actor vanity, awards bait, and production chaos." },
    ],
  },
  {
    slug: "comedy-challenge",
    title: "What We Do in the Shadows",
    tmdbId: 246741,
    facts: [
      { category: "format", difficulty: "easy", question: "In What We Do in the Shadows, what style is used to follow the vampires?", answer: "Mockumentary", wrong: ["Silent film", "Animated anthology", "Courtroom drama"], explanation: "The film presents vampire housemates as documentary subjects." },
      { category: "creatures", difficulty: "medium", question: "In What We Do in the Shadows, what supernatural beings are the main roommates?", answer: "Vampires", wrong: ["Witches", "Ghost hunters", "Werewolves only"], explanation: "The comedy follows vampires sharing a flat." },
      { category: "setting", difficulty: "medium", question: "In What We Do in the Shadows, what country is the vampire flat in?", answer: "New Zealand", wrong: ["Canada", "Ireland", "Romania"], explanation: "The film is set in Wellington, New Zealand." },
      { category: "conflict", difficulty: "hard", question: "In What We Do in the Shadows, what ordinary roommate issue becomes funny because they are vampires?", answer: "House chores", wrong: ["Space travel", "Jury duty", "Running a farm"], explanation: "The movie contrasts supernatural immortality with mundane flatmate problems." },
      { category: "group", difficulty: "expert", question: "In What We Do in the Shadows, what rival supernatural group has a recurring feud with the vampires?", answer: "Werewolves", wrong: ["Mermaids", "Angels", "Mummies"], explanation: "The werewolves have tense but comic encounters with the vampires." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "anime-challenge",
    title: "Spirited Away",
    tmdbId: 129,
    facts: [
      { category: "story", difficulty: "easy", question: "In Spirited Away, what happens to Chihiro's parents after they eat food in the spirit world?", answer: "They turn into pigs", wrong: ["They fall asleep", "They become birds", "They vanish into smoke"], explanation: "Their transformation traps Chihiro in the spirit world." },
      { category: "character", difficulty: "medium", question: "In Spirited Away, what name does Yubaba give Chihiro when she starts working at the bathhouse?", answer: "Sen", wrong: ["Rin", "Boh", "Zeniba"], explanation: "Yubaba steals part of Chihiro's name and calls her Sen." },
      { category: "spirit", difficulty: "medium", question: "In Spirited Away, what creature is Haku revealed to be connected to?", answer: "A river spirit", wrong: ["A forest wolf", "A fire demon", "A moon rabbit"], explanation: "Haku is the spirit of the Kohaku River." },
      { category: "scene", difficulty: "hard", question: "In Spirited Away, what does the polluted river spirit leave behind after Chihiro helps clean him?", answer: "A medicine-like dumpling", wrong: ["A gold mask", "A train ticket", "A glass slipper"], explanation: "The river spirit rewards Chihiro with a powerful herbal cake." },
      { category: "location", difficulty: "expert", question: "In Spirited Away, what kind of workplace must Chihiro survive in the spirit world?", answer: "A bathhouse for spirits", wrong: ["A castle school", "A floating casino", "A dragon market"], explanation: "The bathhouse is the central setting where spirits come to be cleansed." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Akira",
    tmdbId: 149,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Akira, what city is the story primarily set in?", answer: "Neo-Tokyo", wrong: ["New Port City", "Satellite Tokyo", "Mega Osaka"], explanation: "The film's cyberpunk future unfolds in Neo-Tokyo." },
      { category: "character", difficulty: "medium", question: "In Akira, which biker gains dangerous psychic powers?", answer: "Tetsuo", wrong: ["Kaneda", "Kei", "Yamagata"], explanation: "Tetsuo's powers spiral beyond his control." },
      { category: "object", difficulty: "medium", question: "In Akira, what iconic vehicle is strongly associated with Kaneda?", answer: "His red motorcycle", wrong: ["A yellow taxi", "A military helicopter", "A bullet train"], explanation: "Kaneda's red bike is one of anime cinema's most recognizable images." },
      { category: "power", difficulty: "hard", question: "In Akira, what kind of abilities drive the government's fear of Tetsuo?", answer: "Psychic abilities", wrong: ["Time travel", "Shape-shifting", "Invisibility"], explanation: "The film centers on catastrophic psychic power." },
      { category: "lore", difficulty: "expert", question: "In Akira, what earlier psychic figure gives the film its title?", answer: "Akira", wrong: ["Joker", "Colonel Shikishima", "Ryu"], explanation: "Akira is the powerful child whose legacy haunts the story." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Ghost in the Shell",
    tmdbId: 9323,
    facts: [
      { category: "character", difficulty: "easy", question: "In Ghost in the Shell, what is Major Motoko Kusanagi?", answer: "A cyborg security officer", wrong: ["A ghost hunter", "A royal assassin", "A space pilot"], explanation: "The Major works for Public Security Section 9." },
      { category: "team", difficulty: "medium", question: "In Ghost in the Shell, what government unit does the Major serve?", answer: "Public Security Section 9", wrong: ["NERV", "The Survey Corps", "The Red Ribbon Army"], explanation: "Section 9 investigates cybercrime and political threats." },
      { category: "villain", difficulty: "medium", question: "In Ghost in the Shell, what mysterious hacker becomes central to the investigation?", answer: "The Puppet Master", wrong: ["Laughing Man", "Vicious", "Father"], explanation: "The Puppet Master challenges the boundary between program and personhood." },
      { category: "theme", difficulty: "hard", question: "In Ghost in the Shell, what question does the Major repeatedly wrestle with?", answer: "What makes someone truly human", wrong: ["How to escape a time loop", "Which kingdom she should rule", "Why dragons disappeared"], explanation: "The film explores identity, memory, bodies, and consciousness." },
      { category: "technology", difficulty: "expert", question: "In Ghost in the Shell, what does the word 'ghost' refer to in its cybernetic world?", answer: "A person's consciousness or soul", wrong: ["A hologram weapon", "A police rank", "A hidden city"], explanation: "The ghost is the human essence inside artificial bodies and networks." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Princess Mononoke",
    tmdbId: 128,
    facts: [
      { category: "character", difficulty: "easy", question: "In Princess Mononoke, what curse sends Ashitaka away from his village?", answer: "A demon boar's curse", wrong: ["A witch's sleep spell", "A dragon bite", "A sea spirit's song"], explanation: "Ashitaka is wounded by a corrupted boar god." },
      { category: "location", difficulty: "medium", question: "In Princess Mononoke, what industrial settlement is led by Lady Eboshi?", answer: "Iron Town", wrong: ["Bathhouse Valley", "Laputa", "Neo-Tokyo"], explanation: "Iron Town produces iron while clashing with the forest." },
      { category: "character", difficulty: "medium", question: "In Princess Mononoke, who raised San?", answer: "Wolf gods", wrong: ["Boar warriors", "Forest sprites", "Monks"], explanation: "San was raised by Moro and the wolves." },
      { category: "spirit", difficulty: "hard", question: "In Princess Mononoke, what powerful forest being becomes the target of hunters?", answer: "The Forest Spirit", wrong: ["No-Face", "Calcifer", "Totoro"], explanation: "The Forest Spirit's head is sought for its supernatural power." },
      { category: "theme", difficulty: "expert", question: "In Princess Mononoke, what conflict drives the story?", answer: "Industry and survival versus the living forest", wrong: ["A school tournament", "A space rebellion", "A cooking contest"], explanation: "The film refuses easy villains and frames both sides as fighting to live." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "My Neighbor Totoro",
    tmdbId: 8392,
    facts: [
      { category: "family", difficulty: "easy", question: "In My Neighbor Totoro, what are the names of the two sisters who move to the countryside?", answer: "Satsuki and Mei", wrong: ["Chihiro and Lin", "Anna and Marnie", "Kiki and Ursula"], explanation: "Satsuki and Mei discover the spirits near their new home." },
      { category: "creature", difficulty: "medium", question: "In My Neighbor Totoro, what giant forest spirit do the sisters befriend?", answer: "Totoro", wrong: ["No-Face", "Jiji", "Ponyo"], explanation: "Totoro becomes the film's beloved forest guardian." },
      { category: "vehicle", difficulty: "medium", question: "In My Neighbor Totoro, what magical vehicle helps search for Mei?", answer: "The Catbus", wrong: ["A flying broom", "A dragon train", "A talking boat"], explanation: "The Catbus carries Satsuki across the countryside." },
      { category: "story", difficulty: "hard", question: "In My Neighbor Totoro, why are the girls worried about their mother?", answer: "She is ill in the hospital", wrong: ["She is lost at sea", "She has been cursed", "She joined a circus"], explanation: "Their mother's illness creates the emotional backdrop of the story." },
      { category: "scene", difficulty: "expert", question: "In My Neighbor Totoro, what do Totoro and the girls magically help grow overnight?", answer: "A huge tree from planted seeds", wrong: ["A castle", "A rice field maze", "A sunflower dragon"], explanation: "The seed-growing scene captures the film's dreamlike magic." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Your Name.",
    tmdbId: 372058,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Your Name., what strange connection do Taki and Mitsuha experience?", answer: "They swap bodies", wrong: ["They share one shadow", "They trade voices forever", "They become invisible"], explanation: "Their body-swapping links two lives across distance and time." },
      { category: "setting", difficulty: "medium", question: "In Your Name., what rural town is Mitsuha from?", answer: "Itomori", wrong: ["Inaba", "Kokiri", "Hinamizawa"], explanation: "Mitsuha lives in Itomori before the comet disaster." },
      { category: "object", difficulty: "medium", question: "In Your Name., what braided object helps symbolize Mitsuha and Taki's connection?", answer: "A red cord", wrong: ["A silver ring", "A blue umbrella", "A paper crane"], explanation: "The cord represents bonds crossing time and memory." },
      { category: "disaster", difficulty: "hard", question: "In Your Name., what threatens Mitsuha's town?", answer: "A comet fragment", wrong: ["A tidal wave", "A volcanic eruption", "A robot attack"], explanation: "The comet disaster reshapes the story's timeline." },
      { category: "memory", difficulty: "expert", question: "In Your Name., what do Taki and Mitsuha begin to lose after their connection fades?", answer: "Their memories of each other", wrong: ["Their voices", "Their reflections", "Their homes"], explanation: "Forgetting each other makes their search more urgent and bittersweet." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Weathering with You",
    tmdbId: 568160,
    facts: [
      { category: "power", difficulty: "easy", question: "In Weathering with You, what special ability does Hina have?", answer: "She can make the sun appear", wrong: ["She can stop time", "She can speak to machines", "She can summon dragons"], explanation: "Hina is known as a sunshine girl." },
      { category: "setting", difficulty: "medium", question: "In Weathering with You, what city is trapped under extreme rain?", answer: "Tokyo", wrong: ["Kyoto", "Osaka", "Sapporo"], explanation: "Tokyo's endless rain shapes the story's mood and stakes." },
      { category: "character", difficulty: "medium", question: "In Weathering with You, who is the runaway boy who meets Hina?", answer: "Hodaka", wrong: ["Taki", "Sosuke", "Kenji"], explanation: "Hodaka leaves home and starts working in Tokyo." },
      { category: "job", difficulty: "hard", question: "In Weathering with You, what unusual service do Hodaka and Hina start offering?", answer: "Bringing sunshine for events", wrong: ["Finding lost cats only", "Repairing umbrellas", "Reading dreams"], explanation: "They sell moments of clear weather to people who need them." },
      { category: "choice", difficulty: "expert", question: "In Weathering with You, what does Hodaka choose over restoring Tokyo's weather?", answer: "Saving Hina", wrong: ["Becoming mayor", "Leaving Japan", "Keeping a magic jewel"], explanation: "The ending centers on love, consequence, and living with a changed world." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "A Silent Voice",
    tmdbId: 378064,
    facts: [
      { category: "character", difficulty: "easy", question: "In A Silent Voice, which girl is bullied because she is deaf?", answer: "Shoko Nishimiya", wrong: ["Mitsuha Miyamizu", "Sophie Hatter", "Umi Matsuzaki"], explanation: "Shoko's treatment at school drives the story's guilt and reconciliation." },
      { category: "character", difficulty: "medium", question: "In A Silent Voice, which former bully tries to make amends years later?", answer: "Shoya Ishida", wrong: ["Tombo", "Haku", "Seita"], explanation: "Shoya seeks forgiveness and connection after hurting Shoko." },
      { category: "communication", difficulty: "medium", question: "In A Silent Voice, what method is important for Shoya reconnecting with Shoko?", answer: "Sign language", wrong: ["Telepathy", "Morse code", "A magic diary"], explanation: "Learning sign language is part of Shoya's effort to truly communicate." },
      { category: "theme", difficulty: "hard", question: "In A Silent Voice, what visual symbol shows Shoya's isolation from others?", answer: "X marks over faces", wrong: ["Falling feathers", "Red strings", "Broken clocks"], explanation: "The X marks represent people Shoya feels unable to face." },
      { category: "story", difficulty: "expert", question: "In A Silent Voice, what emotional subject does the film confront directly?", answer: "Bullying, guilt, and suicidal despair", wrong: ["Royal succession", "Alien invasion", "Time travel rules"], explanation: "The film treats the long-term damage of bullying with unusual seriousness." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Perfect Blue",
    tmdbId: 10494,
    facts: [
      { category: "character", difficulty: "easy", question: "In Perfect Blue, what career is Mima leaving at the start of the story?", answer: "Pop idol", wrong: ["Detective", "Figure skater", "News anchor"], explanation: "Mima leaves her idol group to become an actress." },
      { category: "genre", difficulty: "medium", question: "In Perfect Blue, what kind of story does Mima become trapped in?", answer: "A psychological thriller", wrong: ["A sports comedy", "A medieval fantasy", "A space opera"], explanation: "The film blurs performance, obsession, identity, and fear." },
      { category: "identity", difficulty: "medium", question: "In Perfect Blue, what false online presence intensifies Mima's paranoia?", answer: "A diary pretending to be written by her", wrong: ["A weather blog", "A cooking channel", "A robot manifesto"], explanation: "The site mimics Mima's inner life in disturbing detail." },
      { category: "work", difficulty: "hard", question: "In Perfect Blue, what new profession does Mima pursue after leaving music?", answer: "Acting", wrong: ["Medicine", "Fashion design", "Law"], explanation: "Her move into acting angers fans who want the old idol image." },
      { category: "theme", difficulty: "expert", question: "In Perfect Blue, what boundary keeps collapsing around Mima?", answer: "Reality and performance", wrong: ["Land and sea", "Past and future", "Humans and animals"], explanation: "The film's dread comes from Mima losing certainty about what is real." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Paprika",
    tmdbId: 4977,
    facts: [
      { category: "technology", difficulty: "easy", question: "In Paprika, what device lets therapists enter dreams?", answer: "The DC Mini", wrong: ["The Eva Unit", "The Bebop Drive", "The Tesseract"], explanation: "The DC Mini is a dream-access device." },
      { category: "character", difficulty: "medium", question: "In Paprika, what is Paprika's relationship to Dr. Atsuko Chiba?", answer: "Paprika is her dream-world alter ego", wrong: ["Her sister", "Her robot assistant", "Her childhood rival"], explanation: "Paprika is Chiba's freer persona inside dreams." },
      { category: "threat", difficulty: "medium", question: "In Paprika, what danger spreads when the dream device is stolen?", answer: "Dreams invade waking reality", wrong: ["The moon falls", "Animals stop speaking", "Time freezes"], explanation: "The film turns dream logic into a reality-breaking threat." },
      { category: "image", difficulty: "hard", question: "In Paprika, what recurring spectacle marches through the dream chaos?", answer: "A surreal parade", wrong: ["A courtroom trial", "A robot tournament", "A pirate fleet"], explanation: "The parade is one of the film's signature dream images." },
      { category: "theme", difficulty: "expert", question: "In Paprika, what does the story explore through dreams?", answer: "Desire, identity, and the unconscious", wrong: ["Tax law", "Baseball strategy", "Royal etiquette"], explanation: "The dream world exposes hidden fears and wants." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Grave of the Fireflies",
    tmdbId: 12477,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Grave of the Fireflies, what wartime country is the story set in?", answer: "Japan", wrong: ["France", "Canada", "Brazil"], explanation: "The film follows civilians in Japan near the end of World War II." },
      { category: "siblings", difficulty: "medium", question: "In Grave of the Fireflies, what are the names of the central siblings?", answer: "Seita and Setsuko", wrong: ["Satsuki and Mei", "Taki and Mitsuha", "Pazu and Sheeta"], explanation: "Seita tries to care for his younger sister Setsuko." },
      { category: "object", difficulty: "medium", question: "In Grave of the Fireflies, what candy tin becomes closely associated with Setsuko?", answer: "Sakuma drops", wrong: ["Chocolate coins", "Rice crackers", "Melon bread"], explanation: "The candy tin becomes one of the film's most heartbreaking objects." },
      { category: "location", difficulty: "hard", question: "In Grave of the Fireflies, where do Seita and Setsuko eventually try to live on their own?", answer: "An abandoned bomb shelter", wrong: ["A castle attic", "A circus tent", "A mountain temple"], explanation: "They shelter alone after leaving their aunt's home." },
      { category: "theme", difficulty: "expert", question: "In Grave of the Fireflies, what human cost does the story focus on?", answer: "Children surviving war and neglect", wrong: ["A superhero origin", "A cooking rivalry", "A space rebellion"], explanation: "The film is a devastating civilian view of war's consequences." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Castle in the Sky",
    tmdbId: 10515,
    facts: [
      { category: "object", difficulty: "easy", question: "In Castle in the Sky, what mysterious item protects Sheeta when she falls?", answer: "A crystal pendant", wrong: ["A magic broom", "A golden compass", "A dragon scale"], explanation: "The pendant connects Sheeta to Laputa." },
      { category: "location", difficulty: "medium", question: "In Castle in the Sky, what is Laputa?", answer: "A legendary floating city", wrong: ["A desert fortress", "A sea monster", "A hidden bathhouse"], explanation: "The search for Laputa drives the adventure." },
      { category: "character", difficulty: "medium", question: "In Castle in the Sky, who is the boy who helps Sheeta?", answer: "Pazu", wrong: ["Sosuke", "Haku", "Ashitaka"], explanation: "Pazu dreams of proving Laputa exists." },
      { category: "antagonist", difficulty: "hard", question: "In Castle in the Sky, who seeks Laputa's power for himself?", answer: "Muska", wrong: ["Porco", "Jiro", "Kanta"], explanation: "Muska wants to control Laputa's ancient weapons." },
      { category: "robots", difficulty: "expert", question: "In Castle in the Sky, what ancient guardians still live on Laputa?", answer: "Robots", wrong: ["Totoro spirits", "Sea ponies", "Paper cranes"], explanation: "Laputa's robots show both the city's danger and tenderness." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Nausicaa of the Valley of the Wind",
    tmdbId: 81,
    facts: [
      { category: "character", difficulty: "easy", question: "In Nausicaa of the Valley of the Wind, who is the princess of the Valley of the Wind?", answer: "Nausicaa", wrong: ["Kiki", "San", "Sophie"], explanation: "Nausicaa is the compassionate heroine of the story." },
      { category: "world", difficulty: "medium", question: "In Nausicaa of the Valley of the Wind, what toxic wilderness threatens human kingdoms?", answer: "The Sea of Decay", wrong: ["The Red Forest", "The Dead Marshes", "The Black Lagoon"], explanation: "The toxic jungle is central to the film's ecological conflict." },
      { category: "creature", difficulty: "medium", question: "In Nausicaa of the Valley of the Wind, what giant insects does Nausicaa try to understand and protect?", answer: "Ohmu", wrong: ["Kodama", "Mimics", "Hollows"], explanation: "Nausicaa sees the Ohmu as part of a wounded ecosystem." },
      { category: "vehicle", difficulty: "hard", question: "In Nausicaa of the Valley of the Wind, what does Nausicaa famously ride through the air?", answer: "A glider", wrong: ["A broom", "A dragon", "A hoverboard"], explanation: "Her windriding glider is one of the film's signature images." },
      { category: "theme", difficulty: "expert", question: "In Nausicaa of the Valley of the Wind, what is Nausicaa trying to prevent between humans and nature?", answer: "A cycle of violence and destruction", wrong: ["A singing contest", "A time paradox", "A sports rivalry"], explanation: "The film argues for compassion in a poisoned world." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Howl's Moving Castle",
    tmdbId: 4935,
    facts: [
      { category: "curse", difficulty: "easy", question: "In Howl's Moving Castle, what curse is placed on Sophie?", answer: "She is turned into an old woman", wrong: ["She becomes a cat", "She loses her shadow", "She cannot speak"], explanation: "The curse changes Sophie's body and self-image." },
      { category: "character", difficulty: "medium", question: "In Howl's Moving Castle, what is Calcifer?", answer: "A fire demon", wrong: ["A scarecrow prince", "A river spirit", "A clockwork bird"], explanation: "Calcifer powers Howl's magical castle." },
      { category: "object", difficulty: "medium", question: "In Howl's Moving Castle, what magical home carries Howl and his companions?", answer: "A walking castle", wrong: ["A flying bathhouse", "A submarine tower", "A crystal train"], explanation: "The castle moves on mechanical legs." },
      { category: "identity", difficulty: "hard", question: "In Howl's Moving Castle, what does Howl fear losing as the war and magic consume him?", answer: "His humanity", wrong: ["His crown", "His cooking skills", "His memory of school"], explanation: "Howl's birdlike transformations threaten to overtake him." },
      { category: "relationship", difficulty: "expert", question: "In Howl's Moving Castle, what bond helps Sophie change Howl's fate?", answer: "Her love and courage", wrong: ["A legal contract", "A royal army", "A hidden treasure map"], explanation: "Sophie's compassion breaks through curses and fear." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Kiki's Delivery Service",
    tmdbId: 16859,
    facts: [
      { category: "character", difficulty: "easy", question: "In Kiki's Delivery Service, what is Kiki training to become?", answer: "A witch", wrong: ["A princess", "A pilot", "A detective"], explanation: "Kiki leaves home for her witch training year." },
      { category: "animal", difficulty: "medium", question: "In Kiki's Delivery Service, what is the name of Kiki's black cat?", answer: "Jiji", wrong: ["Totoro", "Luna", "Muta"], explanation: "Jiji is Kiki's companion and confidant." },
      { category: "job", difficulty: "medium", question: "In Kiki's Delivery Service, what business does Kiki start using her broom?", answer: "A delivery service", wrong: ["A bakery school", "A weather station", "A taxi company"], explanation: "Flying deliveries become Kiki's way to support herself." },
      { category: "friend", difficulty: "hard", question: "In Kiki's Delivery Service, what flying machine fascinates Tombo?", answer: "A human-powered aircraft", wrong: ["A rocket ship", "A submarine", "A war tank"], explanation: "Tombo loves aviation and dreams of flying." },
      { category: "theme", difficulty: "expert", question: "In Kiki's Delivery Service, what personal struggle does Kiki face when her magic weakens?", answer: "Losing confidence in herself", wrong: ["Forgetting a royal password", "Being trapped in a time loop", "Turning into stone"], explanation: "The story treats burnout and self-doubt with tenderness." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Ponyo",
    tmdbId: 12429,
    facts: [
      { category: "character", difficulty: "easy", question: "In Ponyo, what kind of magical creature is Ponyo before becoming a girl?", answer: "A fish", wrong: ["A dragon", "A fox", "A bird"], explanation: "Ponyo begins as a fish-like sea child." },
      { category: "friend", difficulty: "medium", question: "In Ponyo, what boy befriends Ponyo?", answer: "Sosuke", wrong: ["Pazu", "Tombo", "Seita"], explanation: "Sosuke cares for Ponyo after finding her by the sea." },
      { category: "magic", difficulty: "medium", question: "In Ponyo, what natural force becomes wildly unbalanced after Ponyo uses magic?", answer: "The ocean", wrong: ["The desert", "The moon's color", "The forest leaves"], explanation: "Ponyo's transformation causes the sea to rise and surge." },
      { category: "family", difficulty: "hard", question: "In Ponyo, who is Ponyo's powerful sea-goddess mother?", answer: "Granmamare", wrong: ["Yubaba", "Moro", "Ursula"], explanation: "Granmamare is Ponyo's mother and a vast ocean presence." },
      { category: "theme", difficulty: "expert", question: "In Ponyo, what proves important for Ponyo's future as a human?", answer: "Sosuke accepting her as she is", wrong: ["Winning a race", "Finding a crown", "Breaking a mirror"], explanation: "The story turns on love, trust, and acceptance." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Wolf Children",
    tmdbId: 110420,
    facts: [
      { category: "family", difficulty: "easy", question: "In Wolf Children, what are Hana's children able to become?", answer: "Wolves", wrong: ["Dragons", "Robots", "Ghosts"], explanation: "Yuki and Ame inherit wolf nature from their father." },
      { category: "parent", difficulty: "medium", question: "In Wolf Children, what challenge does Hana face after her partner dies?", answer: "Raising two wolf children alone", wrong: ["Running a kingdom", "Training astronauts", "Solving a murder"], explanation: "Hana must protect her children and help them choose their paths." },
      { category: "setting", difficulty: "medium", question: "In Wolf Children, where does Hana move to give the children more freedom?", answer: "The countryside", wrong: ["A space station", "A desert city", "A royal palace"], explanation: "The rural move gives Yuki and Ame room to grow." },
      { category: "choice", difficulty: "hard", question: "In Wolf Children, which child is increasingly drawn to life in the wild?", answer: "Ame", wrong: ["Yuki", "Hana", "Sohei"], explanation: "Ame's path leads him toward the mountain and wolf life." },
      { category: "theme", difficulty: "expert", question: "In Wolf Children, what question shapes Yuki and Ame's coming-of-age?", answer: "Whether to live as humans or wolves", wrong: ["Which sport to play", "Which planet to visit", "Which treasure to steal"], explanation: "The film treats identity as a tender family choice." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Redline",
    tmdbId: 71883,
    facts: [
      { category: "sport", difficulty: "easy", question: "In Redline, what kind of competition is at the center of the film?", answer: "A high-speed race", wrong: ["A cooking battle", "A singing contest", "A chess tournament"], explanation: "Redline is built around an extreme intergalactic race." },
      { category: "character", difficulty: "medium", question: "In Redline, who is the pompadoured racer at the story's center?", answer: "JP", wrong: ["Spike", "Kaneda", "Tetsuo"], explanation: "JP is the reckless driver chasing racing glory." },
      { category: "vehicle", difficulty: "medium", question: "In Redline, what does JP drive?", answer: "A heavily modified race car", wrong: ["A broom", "A dragon", "A submarine"], explanation: "The film celebrates hand-drawn racing machinery." },
      { category: "style", difficulty: "hard", question: "In Redline, what visual quality is the film especially famous for?", answer: "Explosive hand-drawn animation", wrong: ["Live-action puppetry", "Black-and-white still photos", "Stop-motion clay"], explanation: "Its production is known for dense, energetic hand-drawn action." },
      { category: "stakes", difficulty: "expert", question: "In Redline, why is the race especially dangerous?", answer: "It is held on a hostile militarized planet", wrong: ["It happens underwater only", "It has no drivers", "It is judged by ghosts"], explanation: "The planet Roboworld adds military danger to the race." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Dragon Ball Super: Broly",
    tmdbId: 503314,
    facts: [
      { category: "character", difficulty: "easy", question: "In Dragon Ball Super: Broly, which Saiyan warrior becomes the central opponent?", answer: "Broly", wrong: ["Cell", "Buu", "Raditz"], explanation: "The film reintroduces Broly into Dragon Ball Super continuity." },
      { category: "rivals", difficulty: "medium", question: "In Dragon Ball Super: Broly, which two heroes fight Broly?", answer: "Goku and Vegeta", wrong: ["Gohan and Piccolo", "Krillin and Yamcha", "Trunks and Goten"], explanation: "Goku and Vegeta take on Broly as his power escalates." },
      { category: "fusion", difficulty: "medium", question: "In Dragon Ball Super: Broly, what fused warrior appears during the battle?", answer: "Gogeta", wrong: ["Vegito", "Gotenks", "Kefla"], explanation: "Goku and Vegeta use the Fusion Dance to become Gogeta." },
      { category: "villain", difficulty: "hard", question: "In Dragon Ball Super: Broly, who manipulates Broly and his father for revenge?", answer: "Frieza", wrong: ["Beerus", "Hit", "Jiren"], explanation: "Frieza exploits Broly's power for his own goals." },
      { category: "lore", difficulty: "expert", question: "In Dragon Ball Super: Broly, what destroyed the Saiyan homeworld in the backstory?", answer: "Frieza's attack", wrong: ["A comet", "Majin Buu", "A time machine"], explanation: "The film revisits Planet Vegeta's destruction by Frieza." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Demon Slayer: Kimetsu no Yaiba - The Movie: Mugen Train",
    tmdbId: 635302,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Demon Slayer: Mugen Train, where does the main mission take place?", answer: "On a train", wrong: ["In a castle", "On a spaceship", "Inside a school"], explanation: "Tanjiro's group boards the Mugen Train to investigate disappearances." },
      { category: "hero", difficulty: "medium", question: "In Demon Slayer: Mugen Train, which Flame Hashira joins Tanjiro's group?", answer: "Kyojuro Rengoku", wrong: ["Giyu Tomioka", "Tengen Uzui", "Shinobu Kocho"], explanation: "Rengoku becomes the film's emotional center." },
      { category: "villain", difficulty: "medium", question: "In Demon Slayer: Mugen Train, what dream-manipulating demon attacks the passengers?", answer: "Enmu", wrong: ["Akaza", "Rui", "Gyutaro"], explanation: "Enmu traps victims in dreams while the train becomes a battlefield." },
      { category: "family", difficulty: "hard", question: "In Demon Slayer: Mugen Train, whose memory appears in Tanjiro's dream?", answer: "His family", wrong: ["The Hashira council", "A royal court", "A future city"], explanation: "Tanjiro's dream tempts him with his lost family." },
      { category: "battle", difficulty: "expert", question: "In Demon Slayer: Mugen Train, which Upper Rank demon arrives after Enmu is defeated?", answer: "Akaza", wrong: ["Doma", "Kokushibo", "Muzan"], explanation: "Akaza's arrival leads to the film's climactic duel." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Jujutsu Kaisen 0",
    tmdbId: 810693,
    facts: [
      { category: "character", difficulty: "easy", question: "In Jujutsu Kaisen 0, who is the student haunted by Rika?", answer: "Yuta Okkotsu", wrong: ["Yuji Itadori", "Megumi Fushiguro", "Toge Inumaki"], explanation: "Yuta is cursed by the powerful spirit of Rika." },
      { category: "school", difficulty: "medium", question: "In Jujutsu Kaisen 0, where does Yuta train to control his curse?", answer: "Tokyo Jujutsu High", wrong: ["UA High", "Cross Academy", "Ninja Academy"], explanation: "Gojo brings Yuta to Jujutsu High." },
      { category: "curse", difficulty: "medium", question: "In Jujutsu Kaisen 0, what is Rika often called because of her power?", answer: "Queen of Curses", wrong: ["Moon Princess", "Iron Angel", "Demon Fox"], explanation: "Rika is one of the most dangerous cursed spirits." },
      { category: "villain", difficulty: "hard", question: "In Jujutsu Kaisen 0, who seeks to use Rika's power for his own plan?", answer: "Suguru Geto", wrong: ["Mahito", "Sukuna", "Nanami"], explanation: "Geto targets Yuta and Rika during the Night Parade." },
      { category: "theme", difficulty: "expert", question: "In Jujutsu Kaisen 0, what emotion is tied to Yuta's curse and growth?", answer: "Love twisted into a curse", wrong: ["Greed for treasure", "Fear of flying", "Jealousy over sports"], explanation: "The film frames love itself as the most powerful curse." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "The Boy and the Heron",
    tmdbId: 508883,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Boy and the Heron, who is the boy at the center of the story?", answer: "Mahito", wrong: ["Ponyo", "Pazu", "Ashitaka"], explanation: "Mahito enters a strange world while grieving his mother." },
      { category: "creature", difficulty: "medium", question: "In The Boy and the Heron, what bird-like figure lures Mahito toward the tower?", answer: "A grey heron", wrong: ["A black cat", "A white wolf", "A golden eagle"], explanation: "The heron is both guide and trickster." },
      { category: "location", difficulty: "medium", question: "In The Boy and the Heron, what mysterious structure connects Mahito to another world?", answer: "A tower", wrong: ["A bathhouse", "A spaceship", "A subway tunnel"], explanation: "The tower becomes the gateway into the film's dreamlike realm." },
      { category: "emotion", difficulty: "hard", question: "In The Boy and the Heron, what loss shapes Mahito's journey?", answer: "The death of his mother", wrong: ["The loss of a dragon", "A missing crown", "A stolen motorcycle"], explanation: "Mahito's grief drives his choices in the other world." },
      { category: "theme", difficulty: "expert", question: "In The Boy and the Heron, what larger question does Mahito face in the fantasy world?", answer: "Whether to inherit or reject a flawed world", wrong: ["Which sport to play", "How to win a dance contest", "Where to hide a treasure"], explanation: "The story becomes a meditation on grief, creation, and responsibility." },
    ],
  },
  {
    slug: "anime-challenge",
    title: "Suzume",
    tmdbId: 916224,
    facts: [
      { category: "character", difficulty: "easy", question: "In Suzume, who is the teenage girl drawn into closing supernatural doors?", answer: "Suzume", wrong: ["Mima", "Sophie", "Kiki"], explanation: "Suzume travels across Japan to stop disasters." },
      { category: "object", difficulty: "medium", question: "In Suzume, what unusual object does Souta become trapped as?", answer: "A chair", wrong: ["A lantern", "A teapot", "A bicycle"], explanation: "Souta's chair form adds comedy and urgency to the journey." },
      { category: "threat", difficulty: "medium", question: "In Suzume, what escapes through open doors and causes disasters?", answer: "A giant worm-like force", wrong: ["A vampire army", "A robot swarm", "A dragon egg"], explanation: "The worm must be sealed before earthquakes strike." },
      { category: "journey", difficulty: "hard", question: "In Suzume, what must Suzume and Souta do across different locations?", answer: "Close doors to prevent disasters", wrong: ["Collect magic rings", "Win cooking contests", "Solve museum thefts"], explanation: "Each door connects trauma, memory, and looming catastrophe." },
      { category: "theme", difficulty: "expert", question: "In Suzume, what national trauma echoes through the story?", answer: "Earthquake and disaster memory", wrong: ["A royal coronation", "A baseball scandal", "A space race"], explanation: "The film uses fantasy to process disaster, loss, and recovery." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "zombie-collection",
    title: "Night of the Living Dead",
    tmdbId: 10331,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Night of the Living Dead, where do the survivors barricade themselves?", answer: "A rural farmhouse", wrong: ["A shopping mall", "A hospital", "A police station"], explanation: "The farmhouse becomes the central siege location." },
      { category: "character", difficulty: "medium", question: "In Night of the Living Dead, who emerges as the practical leader inside the house?", answer: "Ben", wrong: ["Harry", "Johnny", "Tom"], explanation: "Ben organizes defenses while the others argue." },
      { category: "opening", difficulty: "medium", question: "In Night of the Living Dead, what place are Barbra and Johnny visiting when the first attacker appears?", answer: "A cemetery", wrong: ["A church", "A diner", "A drive-in"], explanation: "The cemetery attack begins the nightmare." },
      { category: "conflict", difficulty: "hard", question: "In Night of the Living Dead, what major disagreement divides Ben and Harry?", answer: "Whether to stay upstairs or hide in the cellar", wrong: ["Whether to call the army", "Whether to use fire", "Whether to leave at sunrise"], explanation: "Their fight over strategy undercuts survival." },
      { category: "ending", difficulty: "expert", question: "In Night of the Living Dead, what happens to Ben after surviving the night?", answer: "He is shot by a posse", wrong: ["He escapes in a truck", "He becomes a scientist", "He boards a helicopter"], explanation: "The bleak ending makes the film unforgettable." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Dawn of the Dead",
    tmdbId: 923,
    facts: [
      { category: "location", difficulty: "easy", question: "In Dawn of the Dead, what large public location do the survivors turn into a refuge?", answer: "A shopping mall", wrong: ["An airport", "A school", "A football stadium"], explanation: "The mall is both shelter and satire." },
      { category: "group", difficulty: "medium", question: "In Dawn of the Dead, which profession do Roger and Peter share?", answer: "SWAT officers", wrong: ["Doctors", "TV reporters", "Truck drivers"], explanation: "They escape the city after a chaotic raid." },
      { category: "symbol", difficulty: "medium", question: "In Dawn of the Dead, why do zombies keep returning to the mall?", answer: "It was important to them in life", wrong: ["They smell money", "They follow music", "They are trained guards"], explanation: "The film links zombies to consumer habits." },
      { category: "threat", difficulty: "hard", question: "In Dawn of the Dead, what human group eventually invades the mall?", answer: "A biker gang", wrong: ["Soldiers", "Cultists", "Pirates"], explanation: "The bikers break the fragile safety of the mall." },
      { category: "tone", difficulty: "expert", question: "In Dawn of the Dead, what social behavior is the mall setting famously satirizing?", answer: "Consumerism", wrong: ["Election campaigns", "Space exploration", "Courtroom drama"], explanation: "The undead shuffle through a temple of shopping." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Day of the Dead",
    tmdbId: 8408,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Day of the Dead, where are the remaining humans based?", answer: "An underground military bunker", wrong: ["A suburban mall", "A desert motel", "A cruise ship"], explanation: "The bunker traps scientists and soldiers together." },
      { category: "experiment", difficulty: "medium", question: "In Day of the Dead, what does Dr. Logan try to prove about zombies?", answer: "They can be conditioned or trained", wrong: ["They can speak fluently", "They hate sunlight", "They remember passwords"], explanation: "His experiments center on Bub." },
      { category: "zombie", difficulty: "medium", question: "In Day of the Dead, what is the name of the unusually responsive zombie?", answer: "Bub", wrong: ["Flyboy", "Rhodes", "Miguel"], explanation: "Bub becomes the film's most memorable undead figure." },
      { category: "villain", difficulty: "hard", question: "In Day of the Dead, which officer becomes dangerously authoritarian?", answer: "Captain Rhodes", wrong: ["John", "Fisher", "McDermott"], explanation: "Rhodes terrorizes the bunker community." },
      { category: "theme", difficulty: "expert", question: "In Day of the Dead, what conflict drives much of the story?", answer: "Science versus military control", wrong: ["Sports versus business", "Magic versus technology", "Royalty versus rebels"], explanation: "The bunker collapses under competing priorities." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "The Return of the Living Dead",
    tmdbId: 10925,
    facts: [
      { category: "cause", difficulty: "easy", question: "In The Return of the Living Dead, what chemical helps start the outbreak?", answer: "Trioxin", wrong: ["T-Virus", "Rage", "Solanum"], explanation: "The leaking military canister releases Trioxin gas." },
      { category: "trait", difficulty: "medium", question: "In The Return of the Living Dead, what do the zombies famously crave?", answer: "Brains", wrong: ["Sunlight", "Candy", "Water"], explanation: "The film popularized the brain-eating zombie catchphrase." },
      { category: "location", difficulty: "medium", question: "In The Return of the Living Dead, what workplace is tied to the first accident?", answer: "A medical supply warehouse", wrong: ["A shopping mall", "A radio station", "A high school"], explanation: "The warehouse stores the dangerous canisters." },
      { category: "tone", difficulty: "hard", question: "In The Return of the Living Dead, what kind of tone sets it apart from many zombie films?", answer: "Punk horror-comedy", wrong: ["Silent melodrama", "Courtroom thriller", "Western romance"], explanation: "The movie mixes gore, punk style, and black comedy." },
      { category: "rule", difficulty: "expert", question: "In The Return of the Living Dead, what happens when the characters try to destroy zombie remains by burning them?", answer: "The smoke spreads the contamination", wrong: ["The outbreak ends", "The zombies become human", "The rain stops"], explanation: "The attempted solution makes things worse." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "28 Days Later",
    tmdbId: 170,
    facts: [
      { category: "opening", difficulty: "easy", question: "In 28 Days Later, where does Jim wake up after the outbreak?", answer: "A hospital", wrong: ["A church", "A train station", "A military base"], explanation: "Jim awakens from a coma in an empty London hospital." },
      { category: "virus", difficulty: "medium", question: "In 28 Days Later, what is the infection commonly called?", answer: "Rage", wrong: ["Trioxin", "The Wildfire Virus", "The Simian Flu"], explanation: "The infected are driven by rage rather than traditional undead hunger." },
      { category: "city", difficulty: "medium", question: "In 28 Days Later, which city appears eerily deserted after Jim wakes up?", answer: "London", wrong: ["Manchester", "Paris", "New York"], explanation: "The empty London imagery is central to the film." },
      { category: "broadcast", difficulty: "hard", question: "In 28 Days Later, what promise draws the survivors toward the soldiers?", answer: "The answer to infection", wrong: ["A cure in Scotland", "A plane to America", "A hidden island"], explanation: "The military broadcast suggests safety and answers." },
      { category: "threat", difficulty: "expert", question: "In 28 Days Later, what becomes as dangerous as the infected?", answer: "The surviving soldiers", wrong: ["A tidal wave", "A rival hospital", "A swarm of insects"], explanation: "Human exploitation becomes the final horror." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Shaun of the Dead",
    tmdbId: 747,
    facts: [
      { category: "plan", difficulty: "easy", question: "In Shaun of the Dead, what pub becomes the group's chosen refuge?", answer: "The Winchester", wrong: ["The Crown", "The Red Lion", "The Slaughtered Lamb"], explanation: "Shaun's familiar pub becomes the survival destination." },
      { category: "friend", difficulty: "medium", question: "In Shaun of the Dead, who is Shaun's loyal best friend?", answer: "Ed", wrong: ["Pete", "David", "Philip"], explanation: "Ed follows Shaun through the outbreak with chaotic loyalty." },
      { category: "weapon", difficulty: "medium", question: "In Shaun of the Dead, what records do Shaun and Ed throw at zombies?", answer: "Vinyl records", wrong: ["DVD cases", "Beer mats", "Board games"], explanation: "They argue over which records are worth sacrificing." },
      { category: "family", difficulty: "hard", question: "In Shaun of the Dead, what is Shaun's relationship with Philip?", answer: "Philip is his stepfather", wrong: ["Philip is his brother", "Philip is his boss", "Philip is his landlord"], explanation: "Shaun's feelings toward Philip shift during the crisis." },
      { category: "genre", difficulty: "expert", question: "In Shaun of the Dead, what phrase did the filmmakers use for its genre blend?", answer: "Rom-zom-com", wrong: ["Spaghetti zombie", "Mall opera", "Ghost western"], explanation: "The film blends romantic comedy with zombie horror." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Dawn of the Dead",
    tmdbId: 924,
    facts: [
      { category: "opening", difficulty: "easy", question: "In the 2004 Dawn of the Dead, who is the nurse protagonist?", answer: "Ana", wrong: ["Fran", "Alice", "Selena"], explanation: "Ana survives the outbreak's first morning." },
      { category: "location", difficulty: "medium", question: "In the 2004 Dawn of the Dead, where do survivors gather?", answer: "A shopping mall", wrong: ["A prison", "A farmhouse", "A hospital"], explanation: "The remake keeps the mall refuge concept." },
      { category: "zombies", difficulty: "medium", question: "In the 2004 Dawn of the Dead, what makes the zombies especially terrifying compared with Romero's originals?", answer: "They run fast", wrong: ["They fly", "They talk", "They use guns"], explanation: "The remake popularized fast, aggressive zombies for a new audience." },
      { category: "communication", difficulty: "hard", question: "In the 2004 Dawn of the Dead, how do survivors communicate with Andy across the parking lot?", answer: "Written signs", wrong: ["Carrier pigeons", "Morse code lights", "Walkie-talkies"], explanation: "They hold signs between rooftops." },
      { category: "escape", difficulty: "expert", question: "In the 2004 Dawn of the Dead, what vehicle project is used for the escape attempt?", answer: "Armored shuttle buses", wrong: ["A hot-air balloon", "A subway train", "A helicopter"], explanation: "The buses are reinforced to push through the horde." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Zombieland",
    tmdbId: 19908,
    facts: [
      { category: "rules", difficulty: "easy", question: "In Zombieland, what survival habit is Columbus famous for?", answer: "Following rules", wrong: ["Collecting swords", "Training dogs", "Building robots"], explanation: "His numbered rules help him stay alive." },
      { category: "snack", difficulty: "medium", question: "In Zombieland, what snack does Tallahassee obsessively search for?", answer: "Twinkies", wrong: ["Oreos", "Pop-Tarts", "Donuts"], explanation: "The Twinkie quest becomes a running joke." },
      { category: "names", difficulty: "medium", question: "In Zombieland, why do the survivors use city names?", answer: "To avoid emotional attachment", wrong: ["To remember directions", "To hide from police", "To rank their skills"], explanation: "Names like Columbus and Tallahassee keep distance between them." },
      { category: "cameo", difficulty: "hard", question: "In Zombieland, which actor plays a memorable fictionalized version of himself?", answer: "Bill Murray", wrong: ["Tom Hanks", "Bruce Campbell", "Chevy Chase"], explanation: "The Bill Murray sequence is one of the film's signature scenes." },
      { category: "destination", difficulty: "expert", question: "In Zombieland, what amusement park becomes the climactic location?", answer: "Pacific Playland", wrong: ["Wally World", "Funland", "Santa Monica Pier"], explanation: "The sisters head there hoping for a zombie-free refuge." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Train to Busan",
    tmdbId: 396535,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Train to Busan, where does most of the outbreak survival unfold?", answer: "On a train", wrong: ["In a mall", "On a plane", "In a bunker"], explanation: "The confined train makes every car dangerous." },
      { category: "destination", difficulty: "medium", question: "In Train to Busan, what city is the train heading toward?", answer: "Busan", wrong: ["Seoul", "Daegu", "Incheon"], explanation: "Busan is believed to be safer." },
      { category: "family", difficulty: "medium", question: "In Train to Busan, who is Seok-woo trying to protect?", answer: "His daughter", wrong: ["His brother", "His teacher", "His boss"], explanation: "The father-daughter relationship drives the story." },
      { category: "character", difficulty: "hard", question: "In Train to Busan, which tough passenger becomes one of the film's standout protectors?", answer: "Sang-hwa", wrong: ["Yon-suk", "Jong-gil", "Min Yong-guk"], explanation: "Sang-hwa fights through the train with memorable bravery." },
      { category: "theme", difficulty: "expert", question: "In Train to Busan, what moral contrast is central to the survivors' conflict?", answer: "Self-sacrifice versus selfishness", wrong: ["Fame versus privacy", "Magic versus science", "Wealth versus poverty only"], explanation: "The film repeatedly contrasts communal care with cowardly self-preservation." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "World War Z",
    tmdbId: 72190,
    facts: [
      { category: "job", difficulty: "easy", question: "In World War Z, what is Gerry Lane's former occupation?", answer: "UN investigator", wrong: ["Astronaut", "Museum curator", "Baseball coach"], explanation: "His UN background pulls him into the global crisis." },
      { category: "scale", difficulty: "medium", question: "In World War Z, what distinguishes the outbreak's threat?", answer: "It spreads globally", wrong: ["It stays in one town", "It only happens underwater", "It affects machines"], explanation: "The film treats the zombie outbreak as a worldwide emergency." },
      { category: "wall", difficulty: "medium", question: "In World War Z, what event causes a massive breach in Jerusalem?", answer: "Zombies climb over the wall", wrong: ["An earthquake opens it", "A plane crashes through it", "A dam breaks"], explanation: "The horde piles upward like an insect swarm." },
      { category: "clue", difficulty: "hard", question: "In World War Z, what does Gerry notice the infected avoid?", answer: "People who are seriously ill", wrong: ["People wearing red", "Children only", "People carrying food"], explanation: "This observation leads to the camouflage strategy." },
      { category: "solution", difficulty: "expert", question: "In World War Z, what risky strategy is used to hide from the infected?", answer: "Injecting a curable pathogen", wrong: ["Wearing garlic", "Holding breath forever", "Playing music"], explanation: "A disease makes healthy people seem unsuitable to the infected." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "REC",
    tmdbId: 8329,
    facts: [
      { category: "format", difficulty: "easy", question: "In REC, what filming style is used to tell the story?", answer: "Found footage", wrong: ["Stop-motion animation", "Silent film", "Musical numbers"], explanation: "The camera crew's footage is the movie's point of view." },
      { category: "location", difficulty: "medium", question: "In REC, where are the residents trapped?", answer: "An apartment building", wrong: ["A cruise ship", "A mall", "A school bus"], explanation: "Authorities seal the building after the infection appears." },
      { category: "protagonist", difficulty: "medium", question: "In REC, what is Ángela's job?", answer: "Television reporter", wrong: ["Firefighter", "Doctor", "Police detective"], explanation: "She is filming a night with firefighters." },
      { category: "containment", difficulty: "hard", question: "In REC, what do authorities do once the outbreak begins?", answer: "Quarantine the building", wrong: ["Invite reporters inside", "Evacuate everyone immediately", "Turn off gravity"], explanation: "The trapped residents are sealed inside." },
      { category: "finale", difficulty: "expert", question: "In REC, where does the film's terrifying final sequence take place?", answer: "The penthouse", wrong: ["The basement pool", "The roof garden", "The elevator shaft"], explanation: "The upstairs apartment reveals the outbreak's darkest secret." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "The Girl with All the Gifts",
    tmdbId: 375366,
    facts: [
      { category: "character", difficulty: "easy", question: "In The Girl with All the Gifts, who is the unusually intelligent infected child?", answer: "Melanie", wrong: ["Selena", "Ana", "Alice"], explanation: "Melanie can think and feel despite being infected." },
      { category: "school", difficulty: "medium", question: "In The Girl with All the Gifts, where are the children first kept and studied?", answer: "A military base", wrong: ["A shopping mall", "A church", "A train station"], explanation: "The children are restrained and educated under military control." },
      { category: "term", difficulty: "medium", question: "In The Girl with All the Gifts, what are the infected commonly called?", answer: "Hungries", wrong: ["Runners", "Clickers", "Walkers"], explanation: "The term 'hungries' describes the infected." },
      { category: "scientist", difficulty: "hard", question: "In The Girl with All the Gifts, what does Dr. Caldwell want from the children?", answer: "A cure or vaccine", wrong: ["A treasure map", "A spaceship code", "A royal title"], explanation: "Her research treats them as potential medical resources." },
      { category: "ending", difficulty: "expert", question: "In The Girl with All the Gifts, what future does Melanie ultimately help create?", answer: "A world for the second-generation infected children", wrong: ["A return to the old society unchanged", "A city underwater", "A zombie-free moon colony"], explanation: "The ending imagines a new dominant form of humanity." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Army of the Dead",
    tmdbId: 503736,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Army of the Dead, what city has been walled off after the zombie outbreak?", answer: "Las Vegas", wrong: ["Miami", "Chicago", "Seattle"], explanation: "The undead occupy quarantined Las Vegas." },
      { category: "mission", difficulty: "medium", question: "In Army of the Dead, what is the crew hired to retrieve?", answer: "Money from a casino vault", wrong: ["A vaccine", "A lost child only", "A nuclear codebook"], explanation: "The heist takes place inside zombie-infested Vegas." },
      { category: "zombies", difficulty: "medium", question: "In Army of the Dead, what makes the Alpha zombies different?", answer: "They are organized and intelligent", wrong: ["They are invisible", "They only swim", "They cannot move"], explanation: "The Alphas have hierarchy and strategy." },
      { category: "leader", difficulty: "hard", question: "In Army of the Dead, what is the name of the Alpha zombie king?", answer: "Zeus", wrong: ["Bub", "Big Daddy", "Patient Zero"], explanation: "Zeus rules the Alpha zombies." },
      { category: "pressure", difficulty: "expert", question: "In Army of the Dead, what deadline makes the heist more dangerous?", answer: "A planned nuclear strike", wrong: ["A solar eclipse", "A hurricane only", "A court hearing"], explanation: "The government plans to destroy Las Vegas." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "I Am Legend",
    tmdbId: 6479,
    facts: [
      { category: "setting", difficulty: "easy", question: "In I Am Legend, where does Robert Neville survive mostly alone?", answer: "New York City", wrong: ["Los Angeles", "London", "Tokyo"], explanation: "The empty city is one of the film's defining images." },
      { category: "companion", difficulty: "medium", question: "In I Am Legend, what is the name of Neville's dog?", answer: "Sam", wrong: ["Max", "Buddy", "Gizmo"], explanation: "Sam is his loyal companion." },
      { category: "profession", difficulty: "medium", question: "In I Am Legend, what is Neville trying to develop?", answer: "A cure", wrong: ["A movie script", "A new sport", "A rocket"], explanation: "His basement lab is devoted to reversing the infection." },
      { category: "danger", difficulty: "hard", question: "In I Am Legend, what are the infected commonly called?", answer: "Darkseekers", wrong: ["Hungries", "Runners", "Biters"], explanation: "They hide from sunlight and hunt at night." },
      { category: "routine", difficulty: "expert", question: "In I Am Legend, what daily broadcast does Neville send?", answer: "A radio message asking survivors to meet him", wrong: ["A comedy podcast", "A weather report", "A sports recap"], explanation: "He broadcasts his location and hope for other survivors." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Resident Evil",
    tmdbId: 1576,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Resident Evil, what underground facility is central to the outbreak?", answer: "The Hive", wrong: ["The Ark", "The Grid", "The Vault"], explanation: "The Hive is Umbrella's secret lab complex." },
      { category: "corporation", difficulty: "medium", question: "In Resident Evil, which company is tied to the outbreak?", answer: "Umbrella Corporation", wrong: ["Weyland-Yutani", "Cyberdyne", "InGen"], explanation: "Umbrella's experiments unleash the disaster." },
      { category: "virus", difficulty: "medium", question: "In Resident Evil, what virus causes the outbreak?", answer: "T-virus", wrong: ["Rage", "Trioxin", "Wildfire"], explanation: "The T-virus reanimates the dead and mutates life." },
      { category: "ai", difficulty: "hard", question: "In Resident Evil, what is the name of the facility's artificial intelligence?", answer: "The Red Queen", wrong: ["Mother", "Skynet", "HAL"], explanation: "The Red Queen locks down the Hive." },
      { category: "character", difficulty: "expert", question: "In Resident Evil, who wakes up with memory loss and becomes the franchise's action lead?", answer: "Alice", wrong: ["Jill", "Claire", "Ada"], explanation: "Alice begins the film disoriented in the mansion." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Planet Terror",
    tmdbId: 1991,
    facts: [
      { category: "tone", difficulty: "easy", question: "In Planet Terror, what grindhouse style does the film embrace?", answer: "Exploitation zombie action", wrong: ["Animated fairy tale", "Silent romance", "Courtroom drama"], explanation: "The movie is designed as a grimy throwback." },
      { category: "character", difficulty: "medium", question: "In Planet Terror, what is Cherry Darling's distinctive replacement weapon?", answer: "A machine-gun leg", wrong: ["A chainsaw arm", "A sword cane", "A rocket backpack"], explanation: "Cherry's weaponized leg is the film's signature image." },
      { category: "cause", difficulty: "medium", question: "In Planet Terror, what substance is linked to the outbreak?", answer: "A biochemical gas", wrong: ["Magic snow", "Radioactive candy", "Alien perfume"], explanation: "The gas mutates people into infected attackers." },
      { category: "setting", difficulty: "hard", question: "In Planet Terror, what kind of place becomes one of the chaotic survivor hubs?", answer: "A hospital", wrong: ["A ski lodge", "A courthouse", "A library"], explanation: "The hospital sequences lean into body horror and panic." },
      { category: "style", difficulty: "expert", question: "In Planet Terror, what deliberate film-damage gag interrupts the story?", answer: "A missing reel", wrong: ["A live weather alert", "A cartoon short", "A silent intermission"], explanation: "The fake missing reel is part of its grindhouse presentation." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Dead Snow",
    tmdbId: 14451,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Dead Snow, what snowy location frames the vacation horror?", answer: "A remote cabin", wrong: ["A beach resort", "A city subway", "A desert motel"], explanation: "Friends gather at a mountain cabin." },
      { category: "zombies", difficulty: "medium", question: "In Dead Snow, what kind of zombies attack the group?", answer: "Nazi zombies", wrong: ["Pirate zombies", "Robot zombies", "Cowboy zombies"], explanation: "The undead soldiers are the film's outrageous hook." },
      { category: "object", difficulty: "medium", question: "In Dead Snow, what discovery helps draw the undead threat?", answer: "Stolen treasure", wrong: ["A magic ring", "A talking doll", "A lost dog"], explanation: "The gold connects the cabin visitors to the zombies' rage." },
      { category: "tone", difficulty: "hard", question: "In Dead Snow, what tone does the film mix with gore?", answer: "Dark slapstick comedy", wrong: ["Political documentary", "Courtroom realism", "Quiet romance"], explanation: "The film is bloody but absurdly comic." },
      { category: "survival", difficulty: "expert", question: "In Dead Snow, what classic zombie-film knowledge do the characters openly reference?", answer: "Rules learned from horror movies", wrong: ["Space navigation", "Medieval etiquette", "Opera lyrics"], explanation: "The characters know the genre they are trapped in." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Warm Bodies",
    tmdbId: 82654,
    facts: [
      { category: "protagonist", difficulty: "easy", question: "In Warm Bodies, what is the zombie protagonist called?", answer: "R", wrong: ["Z", "M", "Nick"], explanation: "R narrates the story from a zombie perspective." },
      { category: "romance", difficulty: "medium", question: "In Warm Bodies, who does R become attached to?", answer: "Julie", wrong: ["Teresa", "Selena", "Ana"], explanation: "His connection with Julie begins changing him." },
      { category: "memory", difficulty: "medium", question: "In Warm Bodies, what does R experience after eating a person's brain?", answer: "Their memories", wrong: ["Their singing voice", "Their bank account", "Their handwriting"], explanation: "The memory flashes are central to his emotional awakening." },
      { category: "threat", difficulty: "hard", question: "In Warm Bodies, what are the skeletal, more far-gone zombies called?", answer: "Boneys", wrong: ["Hungries", "Alphas", "Clickers"], explanation: "Boneys represent the point beyond recovery." },
      { category: "theme", difficulty: "expert", question: "In Warm Bodies, what begins to reverse the zombie condition?", answer: "Human connection and feeling", wrong: ["Sunlight alone", "Money", "A military chip"], explanation: "The film turns zombie horror into a romantic recovery story." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "Pontypool",
    tmdbId: 23963,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Pontypool, where does much of the film take place?", answer: "A radio station", wrong: ["A mall", "A farmhouse", "A spaceship"], explanation: "The outbreak is heard more than seen from the station." },
      { category: "cause", difficulty: "medium", question: "In Pontypool, what unusual thing spreads the infection?", answer: "Language", wrong: ["Rain", "Bugs", "Television static"], explanation: "Certain words become carriers of infection." },
      { category: "protagonist", difficulty: "medium", question: "In Pontypool, what is Grant Mazzy's job?", answer: "Radio host", wrong: ["Paramedic", "Mayor", "Train conductor"], explanation: "Mazzy is on air as reports become terrifying." },
      { category: "strategy", difficulty: "hard", question: "In Pontypool, what kind of solution do characters explore against the infection?", answer: "Changing the meaning of words", wrong: ["Freezing the town", "Building a wall", "Turning off lights"], explanation: "The linguistic infection requires a linguistic response." },
      { category: "style", difficulty: "expert", question: "In Pontypool, why is the film unusually tense despite limited onscreen action?", answer: "Much of the horror arrives through reports and sound", wrong: ["It is entirely silent", "It uses only dance", "It has no dialogue"], explanation: "Radio reports force viewers to imagine the chaos." },
    ],
  },
  {
    slug: "zombie-collection",
    title: "One Cut of the Dead",
    tmdbId: 513434,
    facts: [
      { category: "premise", difficulty: "easy", question: "In One Cut of the Dead, what kind of production is being filmed?", answer: "A zombie movie", wrong: ["A cooking show", "A courtroom drama", "A space documentary"], explanation: "The film begins as a chaotic zombie shoot." },
      { category: "style", difficulty: "medium", question: "In One Cut of the Dead, what ambitious technique defines the opening section?", answer: "A long single take", wrong: ["Stop-motion puppets", "Black-and-white animation", "Split-screen only"], explanation: "The opening appears to unfold in one continuous shot." },
      { category: "twist", difficulty: "medium", question: "In One Cut of the Dead, what does the film later reveal about the opening chaos?", answer: "It was part of a behind-the-scenes live production", wrong: ["It was a dream", "It happened on Mars", "It was a video game"], explanation: "Later sections reframe the opening with comic precision." },
      { category: "tone", difficulty: "hard", question: "In One Cut of the Dead, what genre blend makes the film beloved?", answer: "Zombie comedy and filmmaking farce", wrong: ["Western tragedy", "Spy noir", "Silent fantasy"], explanation: "The movie is as much about low-budget filmmaking as zombies." },
      { category: "theme", difficulty: "expert", question: "In One Cut of the Dead, what does the crew's struggle ultimately celebrate?", answer: "Creative problem-solving under pressure", wrong: ["Luxury filmmaking", "Courtroom strategy", "Royal protocol"], explanation: "The ending turns production disasters into triumph." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "christmas-collection",
    title: "Home Alone",
    tmdbId: 771,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Home Alone, who is accidentally left behind when his family flies to Paris?", answer: "Kevin McCallister", wrong: ["Buzz McCallister", "Fuller McCallister", "Peter McCallister"], explanation: "Kevin wakes up to find the house empty after the family rushes to the airport." },
      { category: "villains", difficulty: "medium", question: "In Home Alone, what nickname do Harry and Marv use for their burglary duo?", answer: "The Wet Bandits", wrong: ["The Sticky Bandits", "The Snow Burglars", "The Toy Thieves"], explanation: "Harry and Marv flood homes after robbing them, earning the Wet Bandits name." },
      { category: "setting", difficulty: "medium", question: "In Home Alone, where is the McCallister family traveling for Christmas?", answer: "Paris", wrong: ["London", "Rome", "New York"], explanation: "The extended family flies to Paris for the holiday." },
      { category: "scene", difficulty: "hard", question: "In Home Alone, what fake gangster movie does Kevin use to scare visitors?", answer: "Angels with Filthy Souls", wrong: ["Little Caesar", "Scarface", "The Public Enemy"], explanation: "Kevin plays the fictional movie to make people think an adult is home." },
      { category: "climax", difficulty: "expert", question: "In Home Alone, who rescues Kevin from Harry and Marv near the end?", answer: "Old Man Marley", wrong: ["Buzz", "Uncle Frank", "Santa"], explanation: "Marley knocks out the burglars and saves Kevin." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Elf",
    tmdbId: 10719,
    facts: [
      { category: "character", difficulty: "easy", question: "In Elf, what is the name of the human raised by Santa's elves?", answer: "Buddy", wrong: ["Walter", "Miles", "Michael"], explanation: "Buddy grows up at the North Pole believing he is an elf." },
      { category: "location", difficulty: "medium", question: "In Elf, where does Buddy travel to find his biological father?", answer: "New York City", wrong: ["Chicago", "Boston", "Philadelphia"], explanation: "Buddy heads to Manhattan to find Walter Hobbs." },
      { category: "family", difficulty: "medium", question: "In Elf, who is Buddy's biological father?", answer: "Walter Hobbs", wrong: ["Papa Elf", "Miles Finch", "Morris"], explanation: "Walter is a children's book executive and Buddy's father." },
      { category: "quote", difficulty: "hard", question: "In Elf, what does Buddy say is his favorite?", answer: "Smiling", wrong: ["Singing", "Syrup", "Snowballs"], explanation: "Buddy calls smiling his favorite during his department store job." },
      { category: "ending", difficulty: "expert", question: "In Elf, what helps power Santa's sleigh in Central Park?", answer: "Christmas spirit", wrong: ["A jet engine", "A magic battery", "A police escort"], explanation: "Singing restores enough Christmas spirit for Santa's sleigh." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "A Christmas Story",
    tmdbId: 850,
    facts: [
      { category: "wish", difficulty: "easy", question: "In A Christmas Story, what Christmas gift does Ralphie desperately want?", answer: "A Red Ryder BB gun", wrong: ["A train set", "A bicycle", "A catcher mitt"], explanation: "Ralphie's holiday obsession is the Red Ryder air rifle." },
      { category: "warning", difficulty: "medium", question: "In A Christmas Story, what warning does Ralphie hear about the BB gun?", answer: "You'll shoot your eye out", wrong: ["You'll break the window", "You'll scare the dog", "You'll ruin dinner"], explanation: "Nearly every adult repeats the eye warning." },
      { category: "object", difficulty: "medium", question: "In A Christmas Story, what odd prize does Ralphie's father win?", answer: "A leg lamp", wrong: ["A singing fish", "A crystal turkey", "A gold radio"], explanation: "The glowing leg lamp becomes the Old Man's prized possession." },
      { category: "scene", difficulty: "hard", question: "In A Christmas Story, what happens when Flick accepts the flagpole dare?", answer: "His tongue gets stuck", wrong: ["He falls asleep", "He wins a race", "He loses his glasses"], explanation: "Flick's tongue freezes to the pole." },
      { category: "family", difficulty: "expert", question: "In A Christmas Story, what ruins the Parker family's turkey dinner?", answer: "The neighbor's dogs eat it", wrong: ["The oven breaks", "Ralphie drops it", "The lamp catches fire"], explanation: "The Bumpus hounds destroy the turkey, sending the family to a Chinese restaurant." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "National Lampoon's Christmas Vacation",
    tmdbId: 5825,
    facts: [
      { category: "goal", difficulty: "easy", question: "In Christmas Vacation, what does Clark Griswold want to create for his family?", answer: "A perfect family Christmas", wrong: ["A beach vacation", "A haunted house", "A ski race"], explanation: "Clark's expectations drive the holiday chaos." },
      { category: "lights", difficulty: "medium", question: "In Christmas Vacation, what part of the house does Clark cover with lights?", answer: "The entire exterior", wrong: ["Only the mailbox", "The garage floor", "The basement"], explanation: "Clark installs a massive holiday light display." },
      { category: "relative", difficulty: "medium", question: "In Christmas Vacation, which unexpected relative arrives in an RV?", answer: "Cousin Eddie", wrong: ["Uncle Lewis", "Todd", "Art"], explanation: "Cousin Eddie parks his RV outside the Griswold home." },
      { category: "bonus", difficulty: "hard", question: "In Christmas Vacation, what does Clark expect to use his work bonus for?", answer: "A swimming pool", wrong: ["A new car", "A trip to Hawaii", "A boat"], explanation: "Clark has already planned a pool before receiving the bonus." },
      { category: "gift", difficulty: "expert", question: "In Christmas Vacation, what does Clark receive instead of the bonus he expected?", answer: "A Jelly of the Month Club membership", wrong: ["A turkey", "A sweater", "A movie camera"], explanation: "The disappointing gift triggers Clark's meltdown." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "The Muppet Christmas Carol",
    tmdbId: 10437,
    facts: [
      { category: "role", difficulty: "easy", question: "In The Muppet Christmas Carol, which classic character does Michael Caine play?", answer: "Ebenezer Scrooge", wrong: ["Bob Cratchit", "Jacob Marley", "Fred"], explanation: "Caine plays Scrooge straight opposite the Muppets." },
      { category: "narrator", difficulty: "medium", question: "In The Muppet Christmas Carol, which Muppet helps narrate as Charles Dickens?", answer: "Gonzo", wrong: ["Kermit", "Fozzie", "Rizzo"], explanation: "Gonzo plays Charles Dickens and narrates the story." },
      { category: "family", difficulty: "medium", question: "In The Muppet Christmas Carol, which Muppet plays Bob Cratchit?", answer: "Kermit the Frog", wrong: ["Fozzie Bear", "Sam Eagle", "Scooter"], explanation: "Kermit plays Scrooge's clerk Bob Cratchit." },
      { category: "ghost", difficulty: "hard", question: "In The Muppet Christmas Carol, which spirit shows Scrooge his lonely childhood?", answer: "Ghost of Christmas Past", wrong: ["Ghost of Christmas Present", "Ghost of Christmas Yet to Come", "Jacob Marley"], explanation: "Christmas Past guides Scrooge through his memories." },
      { category: "theme", difficulty: "expert", question: "In The Muppet Christmas Carol, what lesson must Scrooge learn?", answer: "Generosity and compassion", wrong: ["How to win a race", "How to hide treasure", "How to become mayor"], explanation: "The story transforms Scrooge by confronting his selfishness." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "It's a Wonderful Life",
    tmdbId: 1585,
    facts: [
      { category: "character", difficulty: "easy", question: "In It's a Wonderful Life, who is shown what the world would be like without him?", answer: "George Bailey", wrong: ["Clarence", "Mr. Potter", "Harry Bailey"], explanation: "George sees how much his life has mattered." },
      { category: "town", difficulty: "medium", question: "In It's a Wonderful Life, what is George Bailey's hometown?", answer: "Bedford Falls", wrong: ["Pottersville", "Mayberry", "River City"], explanation: "George's life is rooted in Bedford Falls." },
      { category: "angel", difficulty: "medium", question: "In It's a Wonderful Life, what is the name of the angel helping George?", answer: "Clarence", wrong: ["Gabriel", "Henry", "Joseph"], explanation: "Clarence hopes to earn his wings by helping George." },
      { category: "alternate", difficulty: "hard", question: "In It's a Wonderful Life, what is Bedford Falls called in the world where George was never born?", answer: "Pottersville", wrong: ["Baileyville", "Snow Falls", "New Bedford"], explanation: "The town becomes Pottersville under Potter's influence." },
      { category: "symbol", difficulty: "expert", question: "In It's a Wonderful Life, what does a ringing bell signify?", answer: "An angel gets wings", wrong: ["A loan is paid", "A train arrives", "A storm ends"], explanation: "Zuzu says that every time a bell rings, an angel gets wings." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "The Polar Express",
    tmdbId: 5255,
    facts: [
      { category: "vehicle", difficulty: "easy", question: "In The Polar Express, what takes children to the North Pole?", answer: "A train", wrong: ["A sleigh", "A bus", "A submarine"], explanation: "The magical train arrives outside the boy's home." },
      { category: "destination", difficulty: "medium", question: "In The Polar Express, where is the train headed?", answer: "The North Pole", wrong: ["Whoville", "New York", "Narnia"], explanation: "The passengers travel to see Santa's departure." },
      { category: "object", difficulty: "medium", question: "In The Polar Express, what gift does the boy receive from Santa?", answer: "A sleigh bell", wrong: ["A toy train", "A golden ticket", "A red scarf"], explanation: "The bell becomes a symbol of belief." },
      { category: "belief", difficulty: "hard", question: "In The Polar Express, who can hear the sleigh bell at the end?", answer: "Those who believe", wrong: ["Only elves", "Only adults", "Only conductors"], explanation: "The bell rings only for those who still believe." },
      { category: "character", difficulty: "expert", question: "In The Polar Express, who punches the children's tickets and guides the train?", answer: "The Conductor", wrong: ["The Hobo", "Santa", "Billy"], explanation: "The Conductor manages the magical journey." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "The Nightmare Before Christmas",
    tmdbId: 9479,
    facts: [
      { category: "setting", difficulty: "easy", question: "In The Nightmare Before Christmas, what holiday town is Jack Skellington from?", answer: "Halloween Town", wrong: ["Christmas Town", "Easter Town", "Thanksgiving Town"], explanation: "Jack is the Pumpkin King of Halloween Town." },
      { category: "discovery", difficulty: "medium", question: "In The Nightmare Before Christmas, what holiday world fascinates Jack?", answer: "Christmas Town", wrong: ["Valentine Town", "Birthday Town", "New Year Town"], explanation: "Jack becomes obsessed after discovering Christmas Town." },
      { category: "identity", difficulty: "medium", question: "In The Nightmare Before Christmas, what title does Jack hold in Halloween Town?", answer: "The Pumpkin King", wrong: ["The Candy King", "The Snow King", "The Toymaker"], explanation: "Jack is Halloween Town's celebrity leader." },
      { category: "villain", difficulty: "hard", question: "In The Nightmare Before Christmas, who captures Santa Claus?", answer: "Oogie Boogie", wrong: ["Lock", "Shock", "Barrel", "Dr. Finkelstein"], explanation: "Oogie Boogie holds Santa hostage." },
      { category: "character", difficulty: "expert", question: "In The Nightmare Before Christmas, who warns Jack that his Christmas plan may go wrong?", answer: "Sally", wrong: ["Zero", "Mayor", "Santa"], explanation: "Sally senses disaster before Jack does." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Miracle on 34th Street",
    tmdbId: 11881,
    facts: [
      { category: "character", difficulty: "easy", question: "In Miracle on 34th Street, who claims to be the real Santa Claus?", answer: "Kris Kringle", wrong: ["Fred Gailey", "Mr. Macy", "Alfred"], explanation: "Kris insists he is Santa." },
      { category: "store", difficulty: "medium", question: "In Miracle on 34th Street, which department store hires Kris as Santa?", answer: "Macy's", wrong: ["Gimbels", "Bloomingdale's", "Saks"], explanation: "Kris becomes Macy's Santa after the parade." },
      { category: "trial", difficulty: "medium", question: "In Miracle on 34th Street, what legal question becomes central?", answer: "Whether Kris is Santa Claus", wrong: ["Who owns Macy's", "Who stole a toy", "Whether Susan can sing"], explanation: "The courtroom must consider Kris's identity." },
      { category: "evidence", difficulty: "hard", question: "In Miracle on 34th Street, what institution helps prove Kris's identity in court?", answer: "The U.S. Post Office", wrong: ["The police academy", "The mayor's office", "The zoo"], explanation: "Bags of letters addressed to Santa are delivered to Kris." },
      { category: "child", difficulty: "expert", question: "In Miracle on 34th Street, what does Susan learn to believe in?", answer: "Faith and imagination", wrong: ["Treasure maps", "Baseball curses", "Time travel"], explanation: "Susan's skepticism softens through Kris." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Die Hard",
    tmdbId: 562,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Die Hard, where is John McClane during the Christmas party attack?", answer: "Nakatomi Plaza", wrong: ["Fox Plaza Mall", "Gruber Tower", "Yippee Hotel"], explanation: "McClane is visiting Nakatomi Plaza for a holiday party." },
      { category: "villain", difficulty: "medium", question: "In Die Hard, who leads the criminals at Nakatomi Plaza?", answer: "Hans Gruber", wrong: ["Karl Vreski", "Simon Gruber", "Theo"], explanation: "Hans Gruber orchestrates the heist." },
      { category: "hero", difficulty: "medium", question: "In Die Hard, what is John McClane's profession?", answer: "Police officer", wrong: ["Firefighter", "FBI agent", "Paramedic"], explanation: "McClane is an NYPD detective." },
      { category: "holiday", difficulty: "hard", question: "In Die Hard, what event brings the employees together at Nakatomi Plaza?", answer: "A Christmas party", wrong: ["A New Year's gala", "A retirement dinner", "A product launch"], explanation: "The takeover happens during a Christmas party." },
      { category: "quote", difficulty: "expert", question: "In Die Hard, what phrase does McClane famously use over the radio?", answer: "Yippee-ki-yay", wrong: ["I'll be back", "Say hello to my little friend", "I feel the need"], explanation: "The phrase becomes McClane's signature taunt." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Love Actually",
    tmdbId: 508,
    facts: [
      { category: "structure", difficulty: "easy", question: "In Love Actually, what kind of stories does the film weave together?", answer: "Interconnected love stories", wrong: ["A single courtroom case", "A spy mission", "A haunted house"], explanation: "The film follows multiple relationships around Christmas." },
      { category: "holiday", difficulty: "medium", question: "In Love Actually, what holiday season frames the film?", answer: "Christmas", wrong: ["Halloween", "Easter", "Valentine's Day"], explanation: "The stories unfold in the weeks leading to Christmas." },
      { category: "character", difficulty: "medium", question: "In Love Actually, what public office does Hugh Grant's character hold?", answer: "Prime Minister", wrong: ["Mayor", "King", "Ambassador"], explanation: "He plays the British Prime Minister." },
      { category: "scene", difficulty: "hard", question: "In Love Actually, how does Mark silently confess his feelings to Juliet?", answer: "With cue cards", wrong: ["With a radio song", "With fireworks", "With a newspaper ad"], explanation: "The cue-card scene is one of the film's most remembered moments." },
      { category: "music", difficulty: "expert", question: "In Love Actually, what aging rock star releases a Christmas novelty version of his song?", answer: "Billy Mack", wrong: ["Daniel", "Jamie", "Colin"], explanation: "Billy Mack chases a Christmas number one." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "The Holiday",
    tmdbId: 1581,
    facts: [
      { category: "premise", difficulty: "easy", question: "In The Holiday, what do Amanda and Iris swap for Christmas?", answer: "Homes", wrong: ["Cars", "Jobs", "Pets"], explanation: "The women exchange homes to escape heartbreak." },
      { category: "locations", difficulty: "medium", question: "In The Holiday, which two places are central to the swap?", answer: "Los Angeles and England", wrong: ["Paris and Rome", "New York and Toronto", "Chicago and Dublin"], explanation: "Amanda leaves L.A. for Iris's English cottage." },
      { category: "character", difficulty: "medium", question: "In The Holiday, who does Iris befriend in Los Angeles?", answer: "Arthur Abbott", wrong: ["Miles", "Graham", "Ethan"], explanation: "Arthur becomes an important friend and mentor." },
      { category: "romance", difficulty: "hard", question: "In The Holiday, who is Graham related to?", answer: "Iris", wrong: ["Amanda", "Arthur", "Miles"], explanation: "Graham is Iris's brother." },
      { category: "theme", difficulty: "expert", question: "In The Holiday, what emotional reset drives both lead characters?", answer: "Recovering from heartbreak", wrong: ["Solving a murder", "Winning an election", "Finding buried treasure"], explanation: "Both women use the holiday to rebuild their confidence." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "The Santa Clause",
    tmdbId: 11395,
    facts: [
      { category: "premise", difficulty: "easy", question: "In The Santa Clause, who accidentally becomes Santa?", answer: "Scott Calvin", wrong: ["Charlie Calvin", "Bernard", "Neil"], explanation: "Scott puts on the suit after Santa falls from the roof." },
      { category: "rule", difficulty: "medium", question: "In The Santa Clause, what causes Scott to assume Santa's role?", answer: "Putting on Santa's suit", wrong: ["Eating a cookie", "Signing a contract", "Riding a reindeer"], explanation: "The card explains the clause tied to wearing the suit." },
      { category: "son", difficulty: "medium", question: "In The Santa Clause, what is the name of Scott's son?", answer: "Charlie", wrong: ["Buddy", "Kevin", "Ralphie"], explanation: "Charlie witnesses the start of Scott's transformation." },
      { category: "transformation", difficulty: "hard", question: "In The Santa Clause, what physical change happens to Scott over time?", answer: "He grows a white beard and gains weight", wrong: ["He turns green", "He becomes invisible", "He shrinks"], explanation: "Scott gradually transforms into Santa." },
      { category: "elf", difficulty: "expert", question: "In The Santa Clause, who is the head elf guiding Scott?", answer: "Bernard", wrong: ["Curtis", "Patch", "Hermey"], explanation: "Bernard explains the North Pole rules to Scott." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "How the Grinch Stole Christmas",
    tmdbId: 8871,
    facts: [
      { category: "character", difficulty: "easy", question: "In How the Grinch Stole Christmas, who hates Christmas in Whoville?", answer: "The Grinch", wrong: ["Max", "Mayor May Who", "Lou Lou Who"], explanation: "The Grinch lives above Whoville and resents Christmas." },
      { category: "location", difficulty: "medium", question: "In How the Grinch Stole Christmas, where does the Grinch live?", answer: "Mount Crumpit", wrong: ["Candy Cane Lane", "The North Pole", "Bedford Falls"], explanation: "The Grinch lives in a cave on Mount Crumpit." },
      { category: "dog", difficulty: "medium", question: "In How the Grinch Stole Christmas, what is the name of the Grinch's dog?", answer: "Max", wrong: ["Zero", "Buddy", "Snoopy"], explanation: "Max reluctantly helps with the Christmas theft." },
      { category: "plan", difficulty: "hard", question: "In How the Grinch Stole Christmas, what does the Grinch steal from Whoville?", answer: "Christmas presents and decorations", wrong: ["All the snow", "The town clock", "Every house"], explanation: "He thinks stealing the trappings will stop Christmas." },
      { category: "lesson", difficulty: "expert", question: "In How the Grinch Stole Christmas, what does the Grinch learn about Christmas?", answer: "It means more than presents", wrong: ["It is only about contests", "It belongs to Santa alone", "It cannot happen without snow"], explanation: "The Whos celebrate even after the theft." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Klaus",
    tmdbId: 508965,
    facts: [
      { category: "character", difficulty: "easy", question: "In Klaus, who is the reluctant postman sent to Smeerensburg?", answer: "Jesper", wrong: ["Klaus", "Alva", "Mogens"], explanation: "Jesper must establish a working postal service." },
      { category: "location", difficulty: "medium", question: "In Klaus, what town is trapped in a feud?", answer: "Smeerensburg", wrong: ["Whoville", "Bedford Falls", "Arendelle"], explanation: "The town's rival families hate one another." },
      { category: "legend", difficulty: "medium", question: "In Klaus, who makes toys in the woods?", answer: "Klaus", wrong: ["Jesper", "Mogens", "Pumpkin King"], explanation: "Klaus is a lonely woodsman and toy maker." },
      { category: "change", difficulty: "hard", question: "In Klaus, what begins to soften the town's feud?", answer: "Children receiving toys through the mail", wrong: ["A gold rush", "A royal decree", "A snowstorm election"], explanation: "Gift delivery starts changing the children and their parents." },
      { category: "theme", difficulty: "expert", question: "In Klaus, what idea does the story repeat about kindness?", answer: "A true selfless act always sparks another", wrong: ["Every gift needs a receipt", "Snow solves every problem", "Letters should be banned"], explanation: "The film builds Santa's legend from acts of kindness." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Arthur Christmas",
    tmdbId: 51052,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Arthur Christmas, whose mission is to deliver one missed present?", answer: "Arthur", wrong: ["Steve", "Grandsanta", "Bryony"], explanation: "Arthur cannot accept that one child was missed." },
      { category: "family", difficulty: "medium", question: "In Arthur Christmas, who is Arthur's high-tech older brother?", answer: "Steve", wrong: ["Peter", "Charlie", "Walter"], explanation: "Steve runs the North Pole operation with military precision." },
      { category: "transport", difficulty: "medium", question: "In Arthur Christmas, what old vehicle does Grandsanta use?", answer: "The old sleigh", wrong: ["A rocket", "A submarine", "A motorcycle"], explanation: "Grandsanta brings back the traditional sleigh." },
      { category: "gift", difficulty: "hard", question: "In Arthur Christmas, what kind of present must reach Gwen?", answer: "A bicycle", wrong: ["A teddy bear", "A snow globe", "A train set"], explanation: "Gwen's missed bicycle drives the rescue mission." },
      { category: "theme", difficulty: "expert", question: "In Arthur Christmas, what does Arthur prove about Christmas delivery?", answer: "Every child matters", wrong: ["Only speed matters", "Technology should replace kindness", "Gifts are optional"], explanation: "Arthur's heart matters more than efficiency." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Scrooged",
    tmdbId: 9647,
    facts: [
      { category: "character", difficulty: "easy", question: "In Scrooged, what is Frank Cross's job?", answer: "Television executive", wrong: ["Banker", "Toymaker", "Detective"], explanation: "Frank runs a TV network staging a live Christmas Carol broadcast." },
      { category: "source", difficulty: "medium", question: "In Scrooged, what classic story is modernized?", answer: "A Christmas Carol", wrong: ["The Nutcracker", "The Gift of the Magi", "The Snow Queen"], explanation: "Frank is a modern Scrooge figure." },
      { category: "ghost", difficulty: "medium", question: "In Scrooged, who visits Frank to warn him before the spirits arrive?", answer: "Lew Hayward", wrong: ["Bob Cratchit", "Jacob Marley", "Kris Kringle"], explanation: "Lew is Frank's dead former boss and Marley equivalent." },
      { category: "broadcast", difficulty: "hard", question: "In Scrooged, what live production is Frank's network preparing?", answer: "A Christmas Carol", wrong: ["It's a Wonderful Life", "The Wizard of Oz", "Hamlet"], explanation: "The live broadcast mirrors Frank's supernatural lesson." },
      { category: "ending", difficulty: "expert", question: "In Scrooged, what does Frank do on live television after his transformation?", answer: "Confesses and urges people to care", wrong: ["Fires everyone", "Cancels Christmas", "Announces a merger"], explanation: "Frank's redemption erupts during the broadcast." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Gremlins",
    tmdbId: 927,
    facts: [
      { category: "gift", difficulty: "easy", question: "In Gremlins, what creature is given as a Christmas present?", answer: "A Mogwai", wrong: ["A dragon", "A robot dog", "A snowman"], explanation: "Gizmo is bought as a holiday gift." },
      { category: "name", difficulty: "medium", question: "In Gremlins, what is the friendly Mogwai's name?", answer: "Gizmo", wrong: ["Stripe", "Billy", "Barney"], explanation: "Gizmo is the gentle original Mogwai." },
      { category: "rule", difficulty: "medium", question: "In Gremlins, what happens if a Mogwai gets wet?", answer: "It multiplies", wrong: ["It vanishes", "It sings", "It freezes"], explanation: "Water causes new Mogwai to pop off its body." },
      { category: "food", difficulty: "hard", question: "In Gremlins, what rule turns Mogwai into dangerous gremlins?", answer: "Do not feed them after midnight", wrong: ["Do not let them hear music", "Do not take them outside", "Do not give them toys"], explanation: "Eating after midnight triggers the monstrous transformation." },
      { category: "leader", difficulty: "expert", question: "In Gremlins, what is the name of the main troublemaking gremlin?", answer: "Stripe", wrong: ["Spike", "Scratch", "Smog"], explanation: "Stripe leads the destructive gremlins." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "Bad Santa",
    tmdbId: 10147,
    facts: [
      { category: "premise", difficulty: "easy", question: "In Bad Santa, what job does Willie use as a cover for robberies?", answer: "Mall Santa", wrong: ["Toy designer", "Security guard", "Store manager"], explanation: "Willie poses as Santa to rob stores." },
      { category: "partner", difficulty: "medium", question: "In Bad Santa, who is Willie's criminal partner?", answer: "Marcus", wrong: ["Thurman", "Bob", "Gin"], explanation: "Marcus works with Willie on the holiday scam." },
      { category: "target", difficulty: "medium", question: "In Bad Santa, what do Willie and Marcus rob after Christmas Eve shifts?", answer: "Department stores", wrong: ["Banks", "Museums", "Airports"], explanation: "Their seasonal cover gives them access." },
      { category: "child", difficulty: "hard", question: "In Bad Santa, what lonely boy forms an attachment to Willie?", answer: "Thurman", wrong: ["Kevin", "Ralphie", "Charlie"], explanation: "Thurman's innocence gradually affects Willie." },
      { category: "tone", difficulty: "expert", question: "In Bad Santa, what kind of Christmas movie formula does the film invert?", answer: "The heartwarming Santa redemption story", wrong: ["The royal wedding musical", "The sports championship", "The space opera"], explanation: "The film uses abrasive comedy to twist holiday sentiment." },
    ],
  },
  {
    slug: "christmas-collection",
    title: "White Christmas",
    tmdbId: 13368,
    facts: [
      { category: "song", difficulty: "easy", question: "In White Christmas, what Irving Berlin song is central to the film?", answer: "White Christmas", wrong: ["Silver Bells", "Jingle Bell Rock", "Have Yourself a Merry Little Christmas"], explanation: "The title song anchors the musical." },
      { category: "performers", difficulty: "medium", question: "In White Christmas, what are Bob and Phil's professions?", answer: "Song-and-dance performers", wrong: ["Detectives", "Toymakers", "Pilots"], explanation: "The pair become successful entertainers after the war." },
      { category: "setting", difficulty: "medium", question: "In White Christmas, where do the performers go to help their former general?", answer: "A Vermont inn", wrong: ["A New York theater", "A California beach", "A Chicago hotel"], explanation: "The inn needs snow and guests." },
      { category: "problem", difficulty: "hard", question: "In White Christmas, what weather issue threatens the inn's holiday business?", answer: "No snow", wrong: ["Too much rain", "A heat wave", "A tornado"], explanation: "A snowless Vermont hurts the inn's bookings." },
      { category: "finale", difficulty: "expert", question: "In White Christmas, what finally arrives for the closing number?", answer: "Snow", wrong: ["A parade", "A circus", "A train"], explanation: "The snow completes the holiday fantasy." },
    ],
  },
]);

addEvergreenPackQuestions([
  {
    slug: "summer-collection",
    title: "Jaws",
    tmdbId: 578,
    facts: [
      { category: "threat", difficulty: "easy", question: "In Jaws, what animal terrorizes Amity Island during beach season?", answer: "A great white shark", wrong: ["A giant squid", "A crocodile", "A killer whale"], explanation: "Amity's summer beaches are threatened by a great white shark." },
      { category: "location", difficulty: "medium", question: "In Jaws, what fictional island depends on keeping its summer beaches open?", answer: "Amity Island", wrong: ["Martha's Vineyard", "Cabot Cove", "Isla Nublar"], explanation: "Amity Island relies on beach tourism." },
      { category: "character", difficulty: "medium", question: "In Jaws, who is the police chief trying to protect Amity?", answer: "Martin Brody", wrong: ["Matt Hooper", "Quint", "Ben Gardner"], explanation: "Chief Brody pushes for public safety." },
      { category: "holiday", difficulty: "hard", question: "In Jaws, what summer holiday increases pressure to reopen the beaches?", answer: "The Fourth of July", wrong: ["Memorial Day", "Labor Day", "Canada Day"], explanation: "The July 4 crowds make the danger worse." },
      { category: "quote", difficulty: "expert", question: "In Jaws, what does Brody tell Quint after first seeing the shark up close?", answer: "You're gonna need a bigger boat", wrong: ["Close the beaches forever", "We're not alone out here", "The tide is turning"], explanation: "The line follows Brody's first close look at the shark." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Top Gun",
    tmdbId: 744,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Top Gun, what elite training school does Maverick attend?", answer: "TOPGUN", wrong: ["NASA", "West Point", "Quantico"], explanation: "Maverick trains at the Navy Fighter Weapons School." },
      { category: "character", difficulty: "medium", question: "In Top Gun, what is Maverick's real first name?", answer: "Pete", wrong: ["Nick", "Tom", "Bradley"], explanation: "Pete Mitchell is known by his call sign Maverick." },
      { category: "relationship", difficulty: "medium", question: "In Top Gun, who is Maverick's radar intercept officer and best friend?", answer: "Goose", wrong: ["Iceman", "Slider", "Viper"], explanation: "Goose flies with Maverick." },
      { category: "scene", difficulty: "hard", question: "In Top Gun, what beach sport scene became one of the film's signature summer images?", answer: "Volleyball", wrong: ["Surfing", "Baseball", "Water polo"], explanation: "The beach volleyball scene is one of the film's iconic sunlit moments." },
      { category: "conflict", difficulty: "expert", question: "In Top Gun, what does Maverick struggle with after Goose dies?", answer: "Losing confidence in combat flying", wrong: ["Fear of water", "Fear of heights", "Fear of submarines"], explanation: "Grief makes Maverick hesitate in the air." },
    ],
  },
  {
    slug: "summer-collection",
    title: "The Goonies",
    tmdbId: 9340,
    facts: [
      { category: "quest", difficulty: "easy", question: "In The Goonies, what are the kids searching for to save their homes?", answer: "Pirate treasure", wrong: ["A lost dog", "A magic ring", "A baseball trophy"], explanation: "The treasure of One-Eyed Willy could save the Goon Docks." },
      { category: "group", difficulty: "medium", question: "In The Goonies, what name do Mikey and his friends use for their group?", answer: "The Goonies", wrong: ["The Lost Boys", "The Sandlot Kids", "The Outsiders"], explanation: "Their name comes from the Goon Docks." },
      { category: "villains", difficulty: "medium", question: "In The Goonies, what criminal family chases the kids?", answer: "The Fratellis", wrong: ["The Corleones", "The Tenenbaums", "The Addamses"], explanation: "The Fratellis pursue the kids through the caves." },
      { category: "location", difficulty: "hard", question: "In The Goonies, what coastal neighborhood are the kids trying to save?", answer: "The Goon Docks", wrong: ["Amity Point", "Castle Rock", "Santa Carla"], explanation: "The Goon Docks are threatened by development." },
      { category: "character", difficulty: "expert", question: "In The Goonies, which Fratelli brother befriends Chunk?", answer: "Sloth", wrong: ["Jake", "Francis", "Troy"], explanation: "Chunk and Sloth become an unlikely heroic pair." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Dirty Dancing",
    tmdbId: 88,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Dirty Dancing, where does Baby spend the summer with her family?", answer: "Kellerman's resort", wrong: ["Camp Walden", "Amity Island", "Rydell High"], explanation: "The romance unfolds at Kellerman's." },
      { category: "character", difficulty: "medium", question: "In Dirty Dancing, who teaches Baby to dance?", answer: "Johnny Castle", wrong: ["Robbie Gould", "Neil Kellerman", "Max Kellerman"], explanation: "Johnny becomes Baby's dance partner." },
      { category: "scene", difficulty: "medium", question: "In Dirty Dancing, what dance move becomes the big finale moment?", answer: "The lift", wrong: ["The moonwalk", "The tango dip", "The robot"], explanation: "Baby finally completes the lift." },
      { category: "quote", difficulty: "hard", question: "In Dirty Dancing, what famous line does Johnny say before the final dance?", answer: "Nobody puts Baby in a corner", wrong: ["You're gonna need a bigger boat", "Life moves pretty fast", "I feel the need"], explanation: "Johnny refuses to let Baby be sidelined." },
      { category: "theme", difficulty: "expert", question: "In Dirty Dancing, what does Baby's summer arc center on?", answer: "Independence and standing up for herself", wrong: ["Winning a surf contest", "Solving a murder", "Joining the Navy"], explanation: "Baby's summer changes how she sees class, love, and her own choices." },
    ],
  },
  {
    slug: "summer-collection",
    title: "The Sandlot",
    tmdbId: 11528,
    facts: [
      { category: "sport", difficulty: "easy", question: "In The Sandlot, what sport do the kids spend the summer playing?", answer: "Baseball", wrong: ["Soccer", "Hockey", "Basketball"], explanation: "The film is built around summer baseball." },
      { category: "character", difficulty: "medium", question: "In The Sandlot, what nickname is given to Benny Rodriguez?", answer: "The Jet", wrong: ["Smalls", "Squints", "Ham"], explanation: "Benny is known as Benny the Jet." },
      { category: "object", difficulty: "medium", question: "In The Sandlot, what priceless item does Smalls hit over the fence?", answer: "A Babe Ruth-signed baseball", wrong: ["A gold watch", "A championship ring", "A signed bat"], explanation: "The boys try to rescue the signed ball." },
      { category: "creature", difficulty: "hard", question: "In The Sandlot, what do the kids call the dog beyond the fence?", answer: "The Beast", wrong: ["Cujo", "Hercules", "Champ"], explanation: "The dog is feared as The Beast." },
      { category: "quote", difficulty: "expert", question: "In The Sandlot, what phrase does Ham yell at Smalls?", answer: "You're killing me, Smalls", wrong: ["You're outta here, Smalls", "Run home, Smalls", "Swing away, Smalls"], explanation: "The line became the film's most quoted insult of affection." },
    ],
  },
  {
    slug: "summer-collection",
    title: "National Lampoon's Vacation",
    tmdbId: 11153,
    facts: [
      { category: "goal", difficulty: "easy", question: "In National Lampoon's Vacation, where is the Griswold family trying to go?", answer: "Walley World", wrong: ["Disneyland Paris", "Jurassic Park", "Camp Crystal Lake"], explanation: "Clark turns the trip into a quest for Walley World." },
      { category: "character", difficulty: "medium", question: "In National Lampoon's Vacation, who is the determined father leading the trip?", answer: "Clark Griswold", wrong: ["Cousin Eddie", "Rusty Griswold", "Roy Walley"], explanation: "Clark's stubborn optimism drives the chaos." },
      { category: "vehicle", difficulty: "medium", question: "In National Lampoon's Vacation, what kind of family trip frames the movie?", answer: "A cross-country road trip", wrong: ["A cruise", "A ski weekend", "A space flight"], explanation: "The family drives across America." },
      { category: "scene", difficulty: "hard", question: "In National Lampoon's Vacation, what discovery awaits at Walley World?", answer: "The park is closed", wrong: ["The park has moved", "The tickets are fake", "The rides are underwater"], explanation: "Clark snaps after learning the destination is closed." },
      { category: "tone", difficulty: "expert", question: "In National Lampoon's Vacation, what summer ritual does the film satirize?", answer: "The perfect family vacation", wrong: ["Graduation exams", "Royal weddings", "Space exploration"], explanation: "The comedy turns vacation expectations into disasters." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Stand by Me",
    tmdbId: 235,
    facts: [
      { category: "journey", difficulty: "easy", question: "In Stand by Me, what do four boys set out to find during summer?", answer: "A missing boy's body", wrong: ["A buried spaceship", "A stolen trophy", "A hidden beach"], explanation: "Their search becomes a coming-of-age journey." },
      { category: "source", difficulty: "medium", question: "In Stand by Me, which Stephen King novella inspired the film?", answer: "The Body", wrong: ["It", "The Mist", "Rita Hayworth and Shawshank Redemption"], explanation: "The film adapts King's novella The Body." },
      { category: "character", difficulty: "medium", question: "In Stand by Me, who narrates the story as an adult writer?", answer: "Gordie Lachance", wrong: ["Chris Chambers", "Teddy Duchamp", "Vern Tessio"], explanation: "Adult Gordie looks back on the trip." },
      { category: "scene", difficulty: "hard", question: "In Stand by Me, what danger do the boys face on the train bridge?", answer: "An oncoming train", wrong: ["A flash flood", "A bear", "A collapsing tunnel"], explanation: "The train bridge sequence is a major suspense scene." },
      { category: "theme", difficulty: "expert", question: "In Stand by Me, what does the summer journey explore?", answer: "Friendship and the end of childhood", wrong: ["Winning a baseball league", "A spy mission", "A theme park rivalry"], explanation: "The story is about memory, loss, and growing up." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Point Break",
    tmdbId: 1089,
    facts: [
      { category: "sport", difficulty: "easy", question: "In Point Break, what beach sport is central to Bodhi's world?", answer: "Surfing", wrong: ["Skateboarding", "Snowboarding", "Water polo"], explanation: "Utah is drawn into surf culture." },
      { category: "character", difficulty: "medium", question: "In Point Break, what is Johnny Utah's job?", answer: "FBI agent", wrong: ["Lifeguard", "Pro surfer", "Bank manager"], explanation: "Utah goes undercover to investigate robberies." },
      { category: "criminals", difficulty: "medium", question: "In Point Break, what masks do the bank robbers wear?", answer: "Ex-presidents", wrong: ["Movie monsters", "Baseball players", "Astronauts"], explanation: "The robbers are nicknamed the Ex-Presidents." },
      { category: "villain", difficulty: "hard", question: "In Point Break, who leads the surfer crew tied to the robberies?", answer: "Bodhi", wrong: ["Roach", "Pappas", "Warchild"], explanation: "Bodhi is the charismatic thrill seeker." },
      { category: "theme", difficulty: "expert", question: "In Point Break, what philosophy does Bodhi chase?", answer: "Ultimate freedom and adrenaline", wrong: ["A quiet law firm", "A cooking prize", "A museum job"], explanation: "Bodhi treats danger as spiritual pursuit." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Mamma Mia!",
    tmdbId: 11631,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Mamma Mia!, where is Sophie's wedding set?", answer: "A Greek island", wrong: ["A ski lodge", "A New York hotel", "A spaceship"], explanation: "The island setting gives the musical its summer feeling." },
      { category: "music", difficulty: "medium", question: "In Mamma Mia!, the songs come from which pop group?", answer: "ABBA", wrong: ["Fleetwood Mac", "Queen", "The Beatles"], explanation: "The musical is built around ABBA songs." },
      { category: "plot", difficulty: "medium", question: "In Mamma Mia!, why does Sophie invite three men to her wedding?", answer: "She thinks one may be her father", wrong: ["They are rival chefs", "They own the hotel", "They are detectives"], explanation: "Sophie's search for her father drives the farce." },
      { category: "character", difficulty: "hard", question: "In Mamma Mia!, who is Sophie's mother and hotel owner?", answer: "Donna", wrong: ["Rosie", "Tanya", "Ruby"], explanation: "Donna runs the villa." },
      { category: "scene", difficulty: "expert", question: "In Mamma Mia!, what event brings the characters together?", answer: "Sophie's wedding", wrong: ["A film festival", "A treasure hunt", "A surfing contest"], explanation: "The wedding weekend creates the reunion." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Independence Day",
    tmdbId: 602,
    facts: [
      { category: "holiday", difficulty: "easy", question: "In Independence Day, which U.S. holiday frames humanity's counterattack?", answer: "The Fourth of July", wrong: ["Thanksgiving", "Halloween", "New Year's Eve"], explanation: "The film builds toward a July 4 counterstrike." },
      { category: "threat", difficulty: "medium", question: "In Independence Day, what attacks major cities around the world?", answer: "Alien ships", wrong: ["Volcanoes", "Robot dinosaurs", "Ghost armies"], explanation: "Massive alien craft position themselves above cities." },
      { category: "character", difficulty: "medium", question: "In Independence Day, who is the fighter pilot played by Will Smith?", answer: "Steven Hiller", wrong: ["David Levinson", "Thomas Whitmore", "Russell Casse"], explanation: "Captain Hiller becomes one of the heroes." },
      { category: "plan", difficulty: "hard", question: "In Independence Day, what helps bring down the alien shields?", answer: "A computer virus", wrong: ["A tidal wave", "A magic spell", "A submarine torpedo"], explanation: "David Levinson's virus weakens the defenses." },
      { category: "speech", difficulty: "expert", question: "In Independence Day, who delivers the famous speech before the final battle?", answer: "President Whitmore", wrong: ["General Grey", "Julius Levinson", "Captain Hiller"], explanation: "Whitmore reframes July 4 as a global independence day." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Do the Right Thing",
    tmdbId: 925,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Do the Right Thing, what kind of day intensifies tensions?", answer: "A very hot summer day", wrong: ["A snowstorm", "A rainy funeral", "A hurricane night"], explanation: "The heat becomes part of the pressure cooker." },
      { category: "location", difficulty: "medium", question: "In Do the Right Thing, what Brooklyn neighborhood is the story set in?", answer: "Bed-Stuy", wrong: ["Coney Island", "Harlem", "SoHo"], explanation: "The film unfolds in Bedford-Stuyvesant." },
      { category: "character", difficulty: "medium", question: "In Do the Right Thing, who delivers pizzas for Sal's Famous Pizzeria?", answer: "Mookie", wrong: ["Radio Raheem", "Buggin Out", "Da Mayor"], explanation: "Mookie works for Sal." },
      { category: "object", difficulty: "hard", question: "In Do the Right Thing, what item is Radio Raheem known for carrying?", answer: "A boombox", wrong: ["A baseball bat", "A camera", "A trumpet"], explanation: "His boombox blasts Public Enemy." },
      { category: "conflict", difficulty: "expert", question: "In Do the Right Thing, what wall inside Sal's becomes a flashpoint?", answer: "The Wall of Fame", wrong: ["The menu board", "The delivery map", "The jukebox wall"], explanation: "Buggin Out challenges whose pictures are displayed." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Dazed and Confused",
    tmdbId: 9571,
    facts: [
      { category: "time", difficulty: "easy", question: "In Dazed and Confused, when does the story take place?", answer: "The last day of school", wrong: ["Christmas Eve", "Prom night", "Graduation morning"], explanation: "The movie follows students as summer begins." },
      { category: "setting", difficulty: "medium", question: "In Dazed and Confused, what decade is the film set in?", answer: "The 1970s", wrong: ["The 1950s", "The 1990s", "The 2010s"], explanation: "It is set in 1976." },
      { category: "character", difficulty: "medium", question: "In Dazed and Confused, which older character keeps hanging around students?", answer: "Wooderson", wrong: ["Slater", "Pink", "Mitch"], explanation: "Wooderson is the older partygoer." },
      { category: "quote", difficulty: "hard", question: "In Dazed and Confused, what phrase is Wooderson famous for repeating?", answer: "Alright, alright, alright", wrong: ["Party on, dudes", "Stay golden", "Game over, man"], explanation: "The line became inseparable from the character." },
      { category: "theme", difficulty: "expert", question: "In Dazed and Confused, what does Pink resist committing to?", answer: "A football team pledge", wrong: ["A record contract", "A college scholarship", "A police academy form"], explanation: "Pink questions whether to sign the coach's pledge." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Grease",
    tmdbId: 621,
    facts: [
      { category: "season", difficulty: "easy", question: "In Grease, what summer event sets up Danny and Sandy's reunion?", answer: "A summer romance", wrong: ["A ski trip", "A court case", "A treasure hunt"], explanation: "Their summer fling becomes complicated when school starts." },
      { category: "school", difficulty: "medium", question: "In Grease, what high school do Danny and Sandy attend?", answer: "Rydell High", wrong: ["Bayside High", "Shermer High", "East High"], explanation: "Rydell is the central school setting." },
      { category: "group", difficulty: "medium", question: "In Grease, what group does Danny belong to?", answer: "The T-Birds", wrong: ["The Sharks", "The Outsiders", "The Wildcats"], explanation: "Danny is part of the T-Birds." },
      { category: "song", difficulty: "hard", question: "In Grease, which song retells Danny and Sandy's summer from two perspectives?", answer: "Summer Nights", wrong: ["Greased Lightnin'", "Hopelessly Devoted to You", "Beauty School Dropout"], explanation: "The song contrasts Danny's and Sandy's memories." },
      { category: "scene", difficulty: "expert", question: "In Grease, what car becomes the focus of the T-Birds' big makeover number?", answer: "Greased Lightning", wrong: ["Herbie", "The DeLorean", "The Ecto-1"], explanation: "The car fantasy drives the musical sequence." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Wet Hot American Summer",
    tmdbId: 584,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Wet Hot American Summer, where does the movie take place?", answer: "A summer camp", wrong: ["A beach hotel", "A ski resort", "A college dorm"], explanation: "Camp Firewood is the central setting." },
      { category: "time", difficulty: "medium", question: "In Wet Hot American Summer, what specific camp moment does the story cover?", answer: "The last day of camp", wrong: ["The first snow day", "Parents' weekend only", "A ten-year reunion"], explanation: "The movie compresses camp chaos into one final day." },
      { category: "tone", difficulty: "medium", question: "In Wet Hot American Summer, what comedy style defines the film?", answer: "Absurd parody", wrong: ["Silent slapstick only", "Courtroom satire", "Musical documentary"], explanation: "It exaggerates summer camp movie conventions." },
      { category: "object", difficulty: "hard", question: "In Wet Hot American Summer, what falling object creates an absurd threat?", answer: "A piece of Skylab", wrong: ["A pirate ship", "A meteor dinosaur", "A water tower"], explanation: "The Skylab gag heightens the parody stakes." },
      { category: "character", difficulty: "expert", question: "In Wet Hot American Summer, who is the camp director trying to manage chaos?", answer: "Beth", wrong: ["Lindsay", "Katie", "Susie"], explanation: "Beth tries to keep Camp Firewood together." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Blue Crush",
    tmdbId: 9260,
    facts: [
      { category: "sport", difficulty: "easy", question: "In Blue Crush, what sport is Anne Marie trying to master?", answer: "Surfing", wrong: ["Diving", "Skateboarding", "Beach volleyball"], explanation: "Anne Marie trains for a major surf competition." },
      { category: "setting", difficulty: "medium", question: "In Blue Crush, where is the surfing story set?", answer: "Hawaii", wrong: ["California", "Australia", "Florida"], explanation: "The North Shore setting defines the film." },
      { category: "goal", difficulty: "medium", question: "In Blue Crush, what contest is Anne Marie preparing for?", answer: "The Pipeline Masters", wrong: ["The X Games", "The Olympics", "The America's Cup"], explanation: "She wants to prove herself at Pipeline." },
      { category: "fear", difficulty: "hard", question: "In Blue Crush, what past event haunts Anne Marie in the water?", answer: "A near-drowning wipeout", wrong: ["A shark bite", "A boat crash", "A broken board theft"], explanation: "Her earlier accident creates a mental block." },
      { category: "theme", difficulty: "expert", question: "In Blue Crush, what does Anne Marie's arc test beyond athletic skill?", answer: "Confidence after trauma", wrong: ["A courtroom defense", "A treasure map", "A cooking rivalry"], explanation: "The competition forces her to face fear." },
    ],
  },
  {
    slug: "summer-collection",
    title: "The Way Way Back",
    tmdbId: 147773,
    facts: [
      { category: "setting", difficulty: "easy", question: "In The Way Way Back, where does Duncan find unexpected confidence?", answer: "At a water park", wrong: ["At a boxing gym", "In a courtroom", "On a spaceship"], explanation: "Water Wizz becomes Duncan's refuge." },
      { category: "character", difficulty: "medium", question: "In The Way Way Back, who becomes Duncan's mentor at the water park?", answer: "Owen", wrong: ["Trent", "Kip", "Peter"], explanation: "Owen gives Duncan work, humor, and encouragement." },
      { category: "family", difficulty: "medium", question: "In The Way Way Back, whose boyfriend makes Duncan's vacation uncomfortable?", answer: "His mother's boyfriend", wrong: ["His sister's boyfriend", "His teacher's boyfriend", "His aunt's boyfriend"], explanation: "Trent's behavior pushes Duncan away." },
      { category: "symbol", difficulty: "hard", question: "In The Way Way Back, what car seat gives the movie its title?", answer: "The rear-facing station wagon seat", wrong: ["A lifeguard chair", "A roller coaster seat", "A boat bench"], explanation: "Duncan begins isolated in the way-back seat." },
      { category: "theme", difficulty: "expert", question: "In The Way Way Back, what does Duncan gain over the summer?", answer: "Self-worth and a place where he belongs", wrong: ["A hidden inheritance", "A police badge", "A surf championship"], explanation: "The water park community helps him grow." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Adventureland",
    tmdbId: 19913,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Adventureland, where does James work during the summer?", answer: "An amusement park", wrong: ["A ski resort", "A newspaper office", "A haunted hotel"], explanation: "James takes a summer job at Adventureland." },
      { category: "time", difficulty: "medium", question: "In Adventureland, what decade is the story set in?", answer: "The 1980s", wrong: ["The 1960s", "The 2000s", "The 1940s"], explanation: "The film is set in 1987." },
      { category: "character", difficulty: "medium", question: "In Adventureland, who does James fall for while working at the park?", answer: "Em", wrong: ["Lisa P.", "Sue", "Frigo"], explanation: "James and Em's relationship forms the emotional core." },
      { category: "job", difficulty: "hard", question: "In Adventureland, why does James take the park job instead of traveling?", answer: "His family can no longer afford his plans", wrong: ["He wins the job in a contest", "He is hiding from police", "He inherits the park"], explanation: "Money problems derail his intended summer trip." },
      { category: "tone", difficulty: "expert", question: "In Adventureland, what kind of summer story does the film tell?", answer: "A bittersweet coming-of-age romance", wrong: ["A superhero origin", "A disaster thriller", "A courtroom mystery"], explanation: "The comedy is melancholy, romantic, and transitional." },
    ],
  },
  {
    slug: "summer-collection",
    title: "Weekend at Bernie's",
    tmdbId: 8491,
    facts: [
      { category: "setting", difficulty: "easy", question: "In Weekend at Bernie's, where do Larry and Richard spend the weekend?", answer: "Bernie's beach house", wrong: ["A ski chalet", "A desert casino", "A museum"], explanation: "The beach house weekend becomes a farce." },
      { category: "premise", difficulty: "medium", question: "In Weekend at Bernie's, what do the two employees pretend about Bernie?", answer: "That he is still alive", wrong: ["That he is a spy", "That he won the lottery", "That he is their father"], explanation: "They maintain the illusion that Bernie is alive." },
      { category: "characters", difficulty: "medium", question: "In Weekend at Bernie's, what are Larry and Richard before the chaos begins?", answer: "Insurance company employees", wrong: ["Lifeguards", "Police detectives", "Rock musicians"], explanation: "Their discovery of fraud gets them invited to Bernie's house." },
      { category: "villain", difficulty: "hard", question: "In Weekend at Bernie's, why is Bernie targeted?", answer: "He is involved in criminal fraud", wrong: ["He stole a surfboard", "He lost a treasure map", "He sank a yacht"], explanation: "Bernie's own dealings catch up with him." },
      { category: "tone", difficulty: "expert", question: "In Weekend at Bernie's, what makes the beach weekend comedy absurd?", answer: "People keep mistaking a dead man for a party guest", wrong: ["Everyone turns invisible", "The beach freezes over", "A shark learns to talk"], explanation: "The farce depends on Bernie being misread as alive." },
    ],
  },
  {
    slug: "summer-collection",
    title: "The Parent Trap",
    tmdbId: 9820,
    facts: [
      { category: "premise", difficulty: "easy", question: "In The Parent Trap, what do Hallie and Annie discover at summer camp?", answer: "They are twin sisters", wrong: ["They are cousins", "They are spies", "They are time travelers"], explanation: "The twins learn they were separated." },
      { category: "setting", difficulty: "medium", question: "In The Parent Trap, what summer location brings the twins together?", answer: "Camp Walden", wrong: ["Camp Crystal Lake", "Kellerman's", "Adventureland"], explanation: "Camp Walden is where the switch begins." },
      { category: "plan", difficulty: "medium", question: "In The Parent Trap, what do the twins decide to do after camp?", answer: "Switch places", wrong: ["Run a hotel", "Join a baseball team", "Open a restaurant"], explanation: "Each twin goes home with the other parent." },
      { category: "goal", difficulty: "hard", question: "In The Parent Trap, why do Hallie and Annie switch places?", answer: "To reunite their parents", wrong: ["To win a dance contest", "To escape a villain", "To find buried treasure"], explanation: "They want their divorced parents to meet again." },
      { category: "character", difficulty: "expert", question: "In The Parent Trap, who is the publicist engaged to Nick?", answer: "Meredith Blake", wrong: ["Elizabeth James", "Chessy", "Marva Kulp"], explanation: "Meredith becomes an obstacle to the family reunion." },
    ],
  },
  {
    slug: "summer-collection",
    title: "The Great Outdoors",
    tmdbId: 2617,
    facts: [
      { category: "setting", difficulty: "easy", question: "In The Great Outdoors, where does the family vacation take place?", answer: "A lakeside cabin", wrong: ["A desert motel", "A cruise ship", "A city penthouse"], explanation: "The cabin vacation becomes family chaos." },
      { category: "character", difficulty: "medium", question: "In The Great Outdoors, who plays Chet Ripley?", answer: "John Candy", wrong: ["Dan Aykroyd", "Chevy Chase", "Bill Murray"], explanation: "John Candy anchors the vacation comedy." },
      { category: "family", difficulty: "medium", question: "In The Great Outdoors, whose arrival disrupts Chet's peaceful vacation?", answer: "His brother-in-law Roman", wrong: ["His old coach", "His boss", "His dentist"], explanation: "Roman brings conflict to the trip." },
      { category: "scene", difficulty: "hard", question: "In The Great Outdoors, what legendary animal is tied to Chet's childhood story?", answer: "A bald-headed bear", wrong: ["A white shark", "A mountain lion", "A giant raccoon"], explanation: "The bear story returns in the climax." },
      { category: "food", difficulty: "expert", question: "In The Great Outdoors, what enormous restaurant challenge does Chet attempt?", answer: "Eating the Old 96er steak", wrong: ["Finishing a giant pizza", "Eating 100 hot dogs", "Drinking a milkshake tower"], explanation: "The Old 96er is a massive steak challenge." },
    ],
  },
]);

[
  ["Here's looking at you, kid.", "Casablanca", 289, ["Gone with the Wind", "Citizen Kane", "The Maltese Falcon"]],
  ["May the Force be with you.", "Star Wars", 11, ["Star Trek", "Dune", "The Matrix"]],
  ["I'll be back.", "The Terminator", 218, ["Predator", "RoboCop", "Commando"]],
  ["You're gonna need a bigger boat.", "Jaws", 578, ["The Poseidon Adventure", "Deep Blue Sea", "Twister"]],
  ["There's no place like home.", "The Wizard of Oz", 630, ["Mary Poppins", "Cinderella", "Annie"]],
  ["I see dead people.", "The Sixth Sense", 745, ["The Others", "Signs", "The Ring"]],
  ["You can't handle the truth!", "A Few Good Men", 881, ["The Firm", "The Verdict", "Philadelphia"]],
  ["Life is like a box of chocolates.", "Forrest Gump", 13, ["Big", "Cast Away", "The Green Mile"]],
  ["Why so serious?", "The Dark Knight", 155, ["Batman Begins", "Joker", "Watchmen"]],
  ["To infinity and beyond!", "Toy Story", 862, ["Finding Nemo", "Monsters, Inc.", "Cars"]],
  ["Nobody puts Baby in a corner.", "Dirty Dancing", 88, ["Footloose", "Flashdance", "Grease"]],
  ["I'm king of the world!", "Titanic", 597, ["Avatar", "Pearl Harbor", "The Abyss"]],
  ["Say hello to my little friend!", "Scarface", 111, ["Goodfellas", "Casino", "Heat"]],
  ["Show me the money!", "Jerry Maguire", 9390, ["Almost Famous", "Moneyball", "The Firm"]],
  ["You had me at hello.", "Jerry Maguire", 9390, ["Pretty Woman", "Notting Hill", "Sleepless in Seattle"]],
  ["I'm walking here!", "Midnight Cowboy", 3116, ["Taxi Driver", "The French Connection", "Serpico"]],
  ["E.T. phone home.", "E.T. the Extra-Terrestrial", 601, ["Close Encounters", "Cocoon", "The Goonies"]],
  ["Roads? Where we're going...", "Back to the Future", 105, ["Bill & Ted's Excellent Adventure", "The Time Machine", "Looper"]],
  ["Hasta la vista, baby.", "Terminator 2: Judgment Day", 280, ["True Lies", "The Terminator", "Total Recall"]],
  ["I'm the Dude.", "The Big Lebowski", 115, ["Fargo", "Office Space", "Kingpin"]],
  ["This is Sparta!", "300", 1271, ["Gladiator", "Troy", "Immortals"]],
  ["They may take our lives...", "Braveheart", 197, ["Gladiator", "Kingdom of Heaven", "Robin Hood"]],
  ["As you wish.", "The Princess Bride", 2493, ["Stardust", "Willow", "Labyrinth"]],
  ["Inconceivable!", "The Princess Bride", 2493, ["The Goonies", "Hook", "The NeverEnding Story"]],
  ["Carpe diem.", "Dead Poets Society", 207, ["Good Will Hunting", "School Ties", "Finding Forrester"]],
  ["Wax on, wax off.", "The Karate Kid", 1885, ["Rocky", "Bloodsport", "The Last Dragon"]],
  ["You're killing me, Smalls.", "The Sandlot", 11528, ["The Mighty Ducks", "Rookie of the Year", "Little Big League"]],
  ["Just keep swimming.", "Finding Nemo", 12, ["Moana", "Shark Tale", "The Little Mermaid"]],
  ["Houston, we have a problem.", "Apollo 13", 568, ["Gravity", "Interstellar", "The Right Stuff"]],
  ["I feel the need...", "Top Gun", 744, ["Days of Thunder", "Iron Eagle", "Pearl Harbor"]],
  ["Greed, for lack of a better word...", "Wall Street", 10673, ["The Wolf of Wall Street", "Margin Call", "Boiler Room"]],
  ["Keep your friends close...", "The Godfather Part II", 240, ["Scarface", "Goodfellas", "Casino"]],
  ["I'm gonna make him an offer...", "The Godfather", 238, ["The Untouchables", "Heat", "Once Upon a Time in America"]],
  ["Rosebud.", "Citizen Kane", 15, ["Casablanca", "Sunset Boulevard", "The Third Man"]],
  ["We rob banks.", "Bonnie and Clyde", 475, ["The Sting", "Badlands", "Dog Day Afternoon"]],
  ["The first rule of Fight Club...", "Fight Club", 550, ["Se7en", "American Psycho", "Memento"]],
  ["I drink your milkshake!", "There Will Be Blood", 7345, ["No Country for Old Men", "Gangs of New York", "The Master"]],
  ["Are you not entertained?", "Gladiator", 98, ["Troy", "300", "Braveheart"]],
  ["I'm having an old friend for dinner.", "The Silence of the Lambs", 274, ["Hannibal", "Seven", "Red Dragon"]],
  ["Yippee-ki-yay...", "Die Hard", 562, ["Lethal Weapon", "Speed", "Commando"]],
  ["I am serious. And don't call me Shirley.", "Airplane!", 813, ["The Naked Gun", "Top Secret!", "Hot Shots!"]],
  ["Bueller? Bueller?", "Ferris Bueller's Day Off", 9377, ["The Breakfast Club", "Sixteen Candles", "Weird Science"]],
  ["It's alive!", "Frankenstein", 3035, ["Dracula", "The Wolf Man", "Bride of Frankenstein"]],
  ["They're here.", "Poltergeist", 609, ["The Exorcist", "The Omen", "Carrie"]],
  ["I volunteer as tribute!", "The Hunger Games", 70160, ["Divergent", "Maze Runner", "Twilight"]],
  ["I am Groot.", "Guardians of the Galaxy", 118340, ["The Avengers", "Thor", "Avatar"]],
  ["There is no spoon.", "The Matrix", 603, ["Inception", "Dark City", "Equilibrium"]],
  ["Get away from her, you...", "Aliens", 679, ["Alien", "Predator", "The Thing"]],
  ["We came, we saw...", "Ghostbusters", 620, ["Beetlejuice", "Gremlins", "Men in Black"]],
  ["That'll do, pig.", "Babe", 9598, ["Charlotte's Web", "Chicken Run", "Free Willy"]],
].forEach(([quote, title, tmdbId, wrong], index) => {
  evergreenChallengeQuestions.push(
    q(
      "movie-quote-challenge",
      String(title),
      Number(tmdbId),
      "quote",
      index % 3 === 0 ? "hard" : "medium",
      `Which movie features the quote, "${quote}"?`,
      String(title),
      wrong as string[],
      `${title} includes this memorable movie line.`,
    ),
  );
});

function safeJson(value: unknown) {
  return JSON.stringify(value || []);
}

function dateOnly(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value || "");
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : raw.slice(0, 10);
}

function challengeHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededSortValue(seed: string, value: string) {
  return challengeHash(`${seed}:${value}`);
}

function challengeDifficultyRank(value: unknown) {
  const difficulty = String(value || "").toLowerCase();
  if (difficulty === "expert") return 0;
  if (difficulty === "hard") return 1;
  if (difficulty === "medium") return 2;
  return 3;
}

function mixChallengeQuestions(questions: any[], event: any, limitCount: number) {
  const seed = String(event.active_challenge_week_id || event.slug || event.id || "challenge");
  const grouped = new Map<string, any[]>();
  for (const question of questions) {
    const key = `${question.mediaType || question.media_type || "movie"}:${question.tmdbId || question.tmdb_id || question.title || question.question}`;
    grouped.set(key, [...(grouped.get(key) || []), question]);
  }

  const buckets = Array.from(grouped.entries())
    .map(([key, bucket]) => ({
      key,
      bucket: [...bucket].sort((left, right) => {
        const difficultyDelta = challengeDifficultyRank(left.difficulty) - challengeDifficultyRank(right.difficulty);
        if (difficultyDelta !== 0) return difficultyDelta;
        return seededSortValue(seed, String(left.id || left.question)) - seededSortValue(seed, String(right.id || right.question));
      }),
      sort: seededSortValue(seed, key),
    }))
    .sort((left, right) => left.sort - right.sort);

  const mixed: any[] = [];
  while (mixed.length < limitCount && buckets.some((bucket) => bucket.bucket.length > 0)) {
    for (const bucket of buckets) {
      const next = bucket.bucket.shift();
      if (next) mixed.push(next);
      if (mixed.length >= limitCount) break;
    }
  }

  return mixed;
}

function todayStatus(startDate: unknown, endDate: unknown): SeasonalStatus {
  const now = new Date();
  const start = new Date(`${dateOnly(startDate)}T00:00:00Z`);
  const end = new Date(`${dateOnly(endDate)}T23:59:59Z`);
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "active";
}

function daysRemaining(endDate: unknown) {
  const end = new Date(`${dateOnly(endDate)}T23:59:59Z`).getTime();
  const diff = end - Date.now();
  return Math.max(0, Math.ceil(diff / 86400000));
}

function normalizeRequirements(value: unknown): SeasonalRequirement[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value as SeasonalRequirement[] : [];
}

function normalizeTargetMedia(value: unknown): Array<{ mediaType: "movie" | "tv"; tmdbId: number }> {
  if (!value) return [];
  const raw = typeof value === "string" ? (() => {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  })() : value;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): { mediaType: "movie" | "tv"; tmdbId: number } => ({
      mediaType: item?.mediaType === "tv" || item?.media_type === "tv" ? "tv" : "movie",
      tmdbId: Number(item?.tmdbId || item?.tmdb_id || item?.id || 0),
    }))
    .filter((item) => Number.isFinite(item.tmdbId) && item.tmdbId > 0)
    .slice(0, 24);
}

function normalizeChallengeType(value: unknown): ChallengeType {
  const raw = String(value || "").trim().toLowerCase();
  return ["weekly", "monthly", "seasonal", "special_event"].includes(raw) ? raw as ChallengeType : "seasonal";
}

function safeObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeGenre(value?: string) {
  return String(value || "").trim().toLowerCase();
}

async function safeCount(query: Promise<any[]>) {
  try {
    const rows = await query;
    return Number(rows[0]?.count || 0);
  } catch {
    return 0;
  }
}

async function safe(statement: Promise<unknown>) {
  try {
    await statement;
  } catch {
    // Non-critical maintenance queries should not block the Arcade feed.
  }
}

export async function ensureSeasonalChallengeTables(sql: any) {
  await ensureCollectionChallengeTables(sql);
  await ensureNotificationsTable(sql);
  const safe = async (statement: Promise<unknown>) => {
    try {
      await statement;
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as any)?.message || "");
      if (
        message.includes("pg_type_typname_nsp_index") ||
        message.includes("pg_class_relname_nsp_index") ||
        message.includes("duplicate key value violates unique constraint") ||
        message.includes("already exists")
      ) {
        return;
      }
      throw error;
    }
  };

  await safe(sql`
    create table if not exists seasonal_challenge_events (
      id uuid primary key default gen_random_uuid(),
      slug text not null unique,
      name text not null,
      description text not null default '',
      start_date date not null,
      end_date date not null,
      badge text not null,
      banner text,
      season_key text not null default 'general',
      challenge_type text not null default 'seasonal',
      is_featured boolean not null default false,
      hero_image_url text,
      question_count integer not null default 10,
      target_media jsonb not null default '[]'::jsonb,
      reward_metadata jsonb not null default '{}'::jsonb,
      is_active boolean not null default true,
      difficulty text not null default 'medium',
      requirements jsonb not null default '[]'::jsonb,
      points integer not null default 0,
      status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`alter table seasonal_challenge_events add column if not exists season_key text not null default 'general'`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists challenge_type text not null default 'seasonal'`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists is_featured boolean not null default false`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists hero_image_url text`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists question_count integer not null default 10`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists target_media jsonb not null default '[]'::jsonb`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists reward_metadata jsonb not null default '{}'::jsonb`);
  await safe(sql`alter table seasonal_challenge_events add column if not exists is_active boolean not null default true`);
  await safe(sql`create index if not exists seasonal_challenge_events_status_dates_idx on seasonal_challenge_events (status, start_date, end_date)`);
  await safe(sql`create index if not exists seasonal_challenge_events_active_window_idx on seasonal_challenge_events (is_active, status, start_date, end_date)`);
  await safe(sql`create index if not exists seasonal_challenge_events_slug_idx on seasonal_challenge_events (slug)`);
  await safe(sql`create index if not exists seasonal_challenge_events_type_window_idx on seasonal_challenge_events (challenge_type, status, start_date, end_date)`);

  await safe(sql`
    create table if not exists evergreen_challenge_questions (
      id uuid primary key default gen_random_uuid(),
      event_slug text not null,
      question_order integer not null default 0,
      tmdb_id integer not null,
      media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
      title text not null,
      category text not null default 'story',
      difficulty text not null default 'medium',
      question text not null,
      answer text not null,
      options jsonb not null default '[]'::jsonb,
      explanation text not null default '',
      source_label text not null default 'Flim evergreen challenge pack',
      status text not null default 'ready' check (status in ('ready', 'hidden')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create unique index if not exists evergreen_challenge_questions_slug_question_unique on evergreen_challenge_questions (event_slug, question)`);
  await safe(sql`create index if not exists evergreen_challenge_questions_slug_order_idx on evergreen_challenge_questions (event_slug, question_order)`);

  await safe(sql`
    create table if not exists user_seasonal_challenges (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references users(id) on delete cascade,
      event_id uuid not null references seasonal_challenge_events(id) on delete cascade,
      status text not null default 'in_progress' check (status in ('started', 'in_progress', 'completed')),
      completed_requirements integer not null default 0,
      total_requirements integer not null default 0,
      completion_percentage integer not null default 0,
      points_awarded integer not null default 0,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create unique index if not exists user_seasonal_challenges_user_event_unique on user_seasonal_challenges (user_id, event_id)`);
  await safe(sql`create index if not exists user_seasonal_challenges_user_status_idx on user_seasonal_challenges (user_id, status, updated_at desc)`);
  await safe(sql`
    create table if not exists seasonal_challenge_attempts (
      id uuid primary key default gen_random_uuid(),
      event_id uuid not null references seasonal_challenge_events(id) on delete cascade,
      user_id uuid not null references users(id) on delete cascade,
      score integer not null default 0,
      correct_count integer not null default 0,
      total_count integer not null default 0,
      question_ids jsonb not null default '[]'::jsonb,
      answers jsonb not null default '{}'::jsonb,
      completed_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    )
  `);
  await safe(sql`create index if not exists seasonal_challenge_attempts_event_score_idx on seasonal_challenge_attempts (event_id, score desc, completed_at asc)`);
  await safe(sql`create index if not exists seasonal_challenge_attempts_user_event_idx on seasonal_challenge_attempts (user_id, event_id, completed_at desc)`);
  await safe(sql`create index if not exists seasonal_challenge_attempts_completed_idx on seasonal_challenge_attempts (completed_at desc)`);
  await safe(sql`alter table seasonal_challenge_attempts add column if not exists incorrect_count integer not null default 0`);
  await safe(sql`alter table seasonal_challenge_attempts add column if not exists skipped_count integer not null default 0`);
  await safe(sql`alter table seasonal_challenge_attempts add column if not exists total_time_ms integer not null default 0`);
  await safe(sql`alter table seasonal_challenge_attempts add column if not exists average_answer_time_ms integer not null default 0`);
  await safe(sql`alter table seasonal_challenge_attempts add column if not exists longest_correct_streak integer not null default 0`);
  await safe(sql`alter table seasonal_challenge_attempts add column if not exists challenge_week_id text not null default ''`);
  await safe(sql`
    create index if not exists seasonal_challenge_attempts_rank_idx
    on seasonal_challenge_attempts (event_id, score desc, total_time_ms asc, longest_correct_streak desc, skipped_count asc, completed_at asc)
  `);
  await safe(sql`
    create table if not exists arcade_challenge_windows (
      id uuid primary key default gen_random_uuid(),
      challenge_week_id text not null unique,
      challenge_pack_id uuid not null references seasonal_challenge_events(id) on delete cascade,
      start_at timestamptz not null,
      end_at timestamptz not null,
      status text not null default 'upcoming' check (status in ('upcoming', 'active', 'completed')),
      winners_finalized boolean not null default false,
      finalized_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await safe(sql`create index if not exists arcade_challenge_windows_dates_idx on arcade_challenge_windows (start_at, end_at, status)`);
  await safe(sql`create index if not exists arcade_challenge_windows_pack_idx on arcade_challenge_windows (challenge_pack_id, start_at desc)`);
  await safe(sql`drop index if exists arcade_challenge_windows_one_active_idx`);
  await safe(sql`
    create unique index if not exists notifications_seasonal_challenge_unique
    on notifications (recipient_user_id, type, entity_type, entity_id)
    where entity_type = 'seasonal_challenge'
  `);

  for (const event of [...defaultEvents, ...challengeCatalogueBacklog]) {
    await sql`
      insert into seasonal_challenge_events (
        slug,
        name,
        description,
        start_date,
        end_date,
        badge,
        banner,
        season_key,
        challenge_type,
        is_featured,
        question_count,
        is_active,
        difficulty,
        requirements,
        points,
        status,
        updated_at
      )
      values (
        ${event.slug},
        ${event.name},
        ${event.description},
        ${event.startDate},
        ${event.endDate},
        ${event.badge},
        ${event.banner},
        ${event.seasonKey},
        ${event.challengeType},
        ${event.isFeatured},
        ${event.questionCount},
        true,
        ${event.difficulty},
        ${safeJson(event.requirements)}::jsonb,
        ${event.points},
        'published',
        now()
      )
      on conflict (slug) do nothing
    `;
  }

  await sql`
    update seasonal_challenge_events
    set
      season_key = case slug
        when 'halloween-horror-2026' then case when season_key = 'general' then 'halloween' else season_key end
        when 'christmas-movie-2026' then case when season_key = 'general' then 'christmas' else season_key end
        when 'summer-blockbuster-2026' then case when season_key = 'general' then 'summer_blockbusters' else season_key end
        when 'out-of-this-world' then 'space_movies'
        when 'time-travel-challenge' then 'time_travel'
        when 'adventure-pack' then 'adventure'
        when 'ultimate-disney-animation-challenge' then 'disney_animation'
        when 'ultimate-simpsons-challenge' then 'simpsons'
        when 'movie-quote-challenge' then 'movie_quotes'
        when 'oscar-challenge-2026' then case when season_key = 'general' then 'oscars' else season_key end
        else season_key
      end,
      challenge_type = case slug
        when 'oscar-challenge-2026' then 'special_event'
        when 'out-of-this-world' then 'special_event'
        when 'time-travel-challenge' then 'special_event'
        when 'adventure-pack' then 'special_event'
        when 'ultimate-disney-animation-challenge' then 'special_event'
        when 'ultimate-simpsons-challenge' then 'special_event'
        when 'movie-quote-challenge' then 'special_event'
        else coalesce(nullif(challenge_type, ''), 'seasonal')
      end,
      is_featured = case slug
        when 'summer-blockbuster-2026' then true
        when 'out-of-this-world' then true
        when 'time-travel-challenge' then true
        when 'adventure-pack' then true
        when 'ultimate-disney-animation-challenge' then true
        when 'ultimate-simpsons-challenge' then true
        when 'movie-quote-challenge' then true
        else is_featured
      end,
      question_count = case slug
        when 'summer-blockbuster-2026' then greatest(question_count, 75)
        when 'out-of-this-world' then greatest(question_count, 100)
        when 'time-travel-challenge' then greatest(question_count, 100)
        when 'adventure-pack' then greatest(question_count, 100)
        when 'ultimate-disney-animation-challenge' then greatest(question_count, 50)
        when 'ultimate-simpsons-challenge' then greatest(question_count, 50)
        when 'movie-quote-challenge' then greatest(question_count, 50)
        else case when question_count < 1 then 10 else question_count end
      end,
      points = case slug
        when 'summer-blockbuster-2026' then greatest(points, 250)
        when 'out-of-this-world' then greatest(points, 300)
        when 'time-travel-challenge' then greatest(points, 300)
        when 'adventure-pack' then greatest(points, 300)
        when 'ultimate-disney-animation-challenge' then greatest(points, 250)
        when 'ultimate-simpsons-challenge' then greatest(points, 250)
        when 'movie-quote-challenge' then greatest(points, 250)
        else points
      end,
      start_date = case slug
        when 'halloween-horror-2026' then case when start_date = date '2026-10-01' then date '2026-09-15' else start_date end
        when 'christmas-movie-2026' then case when start_date = date '2026-12-01' then date '2026-11-15' else start_date end
        when 'summer-blockbuster-2026' then case when start_date = date '2026-06-01' then date '2026-05-15' else start_date end
        when 'out-of-this-world' then date '2026-01-01'
        when 'time-travel-challenge' then date '2026-01-01'
        when 'adventure-pack' then date '2026-01-01'
        when 'ultimate-disney-animation-challenge' then date '2026-01-01'
        when 'ultimate-simpsons-challenge' then date '2026-01-01'
        when 'movie-quote-challenge' then date '2026-01-01'
        else start_date
      end,
      end_date = case slug
        when 'out-of-this-world' then date '2035-12-31'
        when 'time-travel-challenge' then date '2035-12-31'
        when 'adventure-pack' then date '2035-12-31'
        when 'ultimate-disney-animation-challenge' then date '2035-12-31'
        when 'ultimate-simpsons-challenge' then date '2035-12-31'
        when 'movie-quote-challenge' then date '2035-12-31'
        else end_date
      end,
      updated_at = now()
    where slug in (
      'halloween-horror-2026',
      'christmas-movie-2026',
      'summer-blockbuster-2026',
      'out-of-this-world',
      'time-travel-challenge',
      'adventure-pack',
      'ultimate-disney-animation-challenge',
      'ultimate-simpsons-challenge',
      'movie-quote-challenge',
      'oscar-challenge-2026'
    )
  `;

  for (const [index, question] of evergreenChallengeQuestions.entries()) {
    await sql`
      insert into evergreen_challenge_questions (
        event_slug,
        question_order,
        tmdb_id,
        media_type,
        title,
        category,
        difficulty,
        question,
        answer,
        options,
        explanation,
        status,
        updated_at
      )
      values (
        ${question.slug},
        ${index + 1},
        ${question.tmdbId},
        ${question.mediaType},
        ${question.title},
        ${question.category},
        ${question.difficulty},
        ${question.question},
        ${question.answer},
        ${safeJson(question.options)}::jsonb,
        ${question.explanation},
        'ready',
        now()
      )
      on conflict (event_slug, question) do update set
        question_order = excluded.question_order,
        tmdb_id = excluded.tmdb_id,
        media_type = excluded.media_type,
        title = excluded.title,
        category = excluded.category,
        difficulty = excluded.difficulty,
        answer = excluded.answer,
        options = excluded.options,
        explanation = excluded.explanation,
        status = 'ready',
        updated_at = now()
    `;
  }
  await syncArcadeChallengeWindows(sql);
}

async function ensureSeasonalChallengeTablesCached(sql: any) {
  if (seasonalChallengeEnsureComplete) return;
  if (!seasonalChallengeEnsurePromise) {
    seasonalChallengeEnsurePromise = ensureSeasonalChallengeTables(sql)
      .then(() => {
        seasonalChallengeEnsureComplete = true;
      })
      .finally(() => {
        seasonalChallengeEnsurePromise = null;
      });
  }
  await seasonalChallengeEnsurePromise;
}

async function syncArcadeChallengeWindows(sql: any) {
  await safe(sql`
    update arcade_challenge_windows
    set
      status = case
        when now() < start_at then 'upcoming'
        when now() >= end_at then 'completed'
        else 'active'
      end,
      winners_finalized = case when now() >= end_at then true else winners_finalized end,
      finalized_at = case when now() >= end_at and finalized_at is null then now() else finalized_at end,
      updated_at = now()
  `);

  const eligiblePacks = await sql`
    select
      sce.id,
      sce.slug,
      sce.name,
      sce.is_featured,
      count(ecq.id)::int as playable_question_count
    from seasonal_challenge_events sce
    inner join evergreen_challenge_questions ecq on ecq.event_slug = sce.slug and ecq.status = 'ready'
    where sce.status = 'published'
      and sce.is_active = true
      and sce.challenge_type in ('weekly', 'special_event', 'seasonal')
    group by sce.id
    having count(ecq.id) >= 100
    order by sce.is_featured desc, sce.slug asc
  `.catch(() => []);

  if (!eligiblePacks.length) return null;

  const cadenceDays = challengeCadenceDays(eligiblePacks.length);
  const cadenceMs = cadenceDays * DAY_MS;
  const now = new Date();
  const currentPeriod = Math.floor((now.getTime() - FEATURED_CHALLENGE_EPOCH) / cadenceMs);
  const prefix = cadenceDays === 7 ? "weekly" : "biweekly";

  for (let offset = -2; offset <= 54; offset += 1) {
    const period = currentPeriod + offset;
    const startAt = new Date(FEATURED_CHALLENGE_EPOCH + period * cadenceMs);
    const endAt = new Date(startAt.getTime() + cadenceMs);
    const pack = eligiblePacks[((period % eligiblePacks.length) + eligiblePacks.length) % eligiblePacks.length];
    const status = scheduledWindowStatus(startAt, endAt, now);
    const finalized = status === "completed";
    const challengeWeekId = `${prefix}-${isoDate(startAt)}`;

    await sql`
      insert into arcade_challenge_windows (
        challenge_week_id,
        challenge_pack_id,
        start_at,
        end_at,
        status,
        winners_finalized,
        finalized_at,
        updated_at
      )
      values (
        ${challengeWeekId},
        ${pack.id},
        ${startAt.toISOString()},
        ${endAt.toISOString()},
        ${status},
        ${finalized},
        case when ${finalized} then now() else null end,
        now()
      )
      on conflict (challenge_week_id) do update set
        challenge_pack_id = excluded.challenge_pack_id,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        status = excluded.status,
        winners_finalized = case
          when arcade_challenge_windows.winners_finalized then true
          else excluded.winners_finalized
        end,
        finalized_at = case
          when arcade_challenge_windows.finalized_at is not null then arcade_challenge_windows.finalized_at
          else excluded.finalized_at
        end,
        updated_at = now()
    `;
  }

  await safe(sql`
    update arcade_challenge_windows stale
    set
      status = case
        when now() < stale.start_at then 'upcoming'
        when now() >= stale.end_at then 'completed'
        else 'upcoming'
      end,
      updated_at = now()
    where stale.status = 'active'
      and stale.id not in (
        select id
        from arcade_challenge_windows
        where now() >= start_at and now() < end_at
        order by start_at asc
        limit 1
      )
  `);

  const [activeWindow] = await sql`
    select
      acw.*,
      sce.slug,
      sce.name
    from arcade_challenge_windows acw
    inner join seasonal_challenge_events sce on sce.id = acw.challenge_pack_id
    where acw.status = 'active'
      and now() >= acw.start_at
      and now() < acw.end_at
    order by acw.start_at asc
    limit 1
  `.catch(() => []);

  return activeWindow || null;
}

async function progressForRequirement(sql: any, userId: string | undefined, requirement: SeasonalRequirement) {
  if (!userId) return 0;
  const genre = normalizeGenre(requirement.genre);

  if (requirement.type === "movies_watched") {
    if (genre) {
      return safeCount(sql`
        select count(distinct pm.tmdb_id)::int as count
        from playlist_movies pm
        inner join playlists p on p.id = pm.playlist_id
        left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
        where p.owner_user_id = ${userId}
          and coalesce(pm.media_type, 'movie') = 'movie'
          and pm.watched = true
          and (
            lower(coalesce(mi.genres::text, '')) like ${`%${genre}%`}
            or lower(coalesce(pm.title, '')) like ${`%${genre}%`}
          )
      `);
    }
    return safeCount(sql`
      select count(distinct pm.tmdb_id)::int as count
      from playlist_movies pm
      inner join playlists p on p.id = pm.playlist_id
      where p.owner_user_id = ${userId}
        and coalesce(pm.media_type, 'movie') = 'movie'
        and pm.watched = true
    `);
  }

  if (requirement.type === "tv_episodes_watched") {
    return safeCount(sql`select count(*)::int as count from user_episode_progress where user_id = ${userId} and status = 'watched'`);
  }

  if (requirement.type === "collection_progress" && requirement.collectionSlug) {
    const rows = await sql`
      select ucp.completion_percent
      from user_collection_progress ucp
      inner join media_collections mc on mc.id = ucp.collection_id
      where ucp.user_id = ${userId}
        and mc.slug = ${requirement.collectionSlug}
      limit 1
    `;
    return Number(rows[0]?.completion_percent || 0);
  }

  if (requirement.type === "challenge_completed") {
    if (requirement.challengeId) {
      return safeCount(sql`
        select count(*)::int as count
        from user_collection_challenges
        where user_id = ${userId}
          and challenge_id = ${requirement.challengeId}
          and completed_at is not null
      `);
    }
    return safeCount(sql`
      select count(*)::int as count
      from user_collection_challenges
      where user_id = ${userId}
        and completed_at is not null
    `);
  }

  if (requirement.type === "trivia_completed") {
    if (genre) {
      return safeCount(sql`
        select count(*)::int as count
        from user_trivia_progress utp
        left join media_items mi on mi.media_type = utp.media_type and mi.tmdb_id = utp.tmdb_id
        where utp.user_id = ${userId}
          and lower(coalesce(mi.genres::text, '')) like ${`%${genre}%`}
      `);
    }
    return safeCount(sql`select count(*)::int as count from user_trivia_progress where user_id = ${userId}`);
  }

  if (requirement.type === "easter_eggs_completed") {
    if (genre) {
      return safeCount(sql`
        select count(*)::int as count
        from user_easter_egg_progress uep
        left join media_items mi on mi.media_type = uep.media_type and mi.tmdb_id = uep.tmdb_id
        where uep.user_id = ${userId}
          and uep.status = 'completed'
          and lower(coalesce(mi.genres::text, '')) like ${`%${genre}%`}
      `);
    }
    return safeCount(sql`select count(*)::int as count from user_easter_egg_progress where user_id = ${userId} and status = 'completed'`);
  }

  return 0;
}

type MapEventOptions = {
  includeStats?: boolean;
  includeUserProgress?: boolean;
  persistProgress?: boolean;
  allowQuestionFallback?: boolean;
};

async function mapEvent(sql: any, row: any, userId?: string, options: MapEventOptions = {}) {
  const includeStats = options.includeStats !== false;
  const includeUserProgress = options.includeUserProgress !== false;
  const persistProgress = options.persistProgress !== false;
  const allowQuestionFallback = options.allowQuestionFallback !== false;
  const requirements = normalizeRequirements(row.requirements);
  const targetMedia = normalizeTargetMedia(row.target_media);
  const mappedRequirements = [];
  for (const requirement of requirements) {
    const progress = includeUserProgress ? await progressForRequirement(sql, userId, requirement) : 0;
    mappedRequirements.push({
      ...requirement,
      target: Number(requirement.target || 1),
      progress,
      completed: progress >= Number(requirement.target || 1),
    });
  }
  const completedRequirements = mappedRequirements.filter((requirement) => requirement.completed).length;
  const totalRequirements = mappedRequirements.length;
  const completionPercent = totalRequirements > 0 ? Math.round((completedRequirements / totalRequirements) * 100) : 0;
  const dateStatus = todayStatus(row.start_date, row.end_date);
  const storedUserStatus = row.user_challenge_status || null;
  const userStatus = completionPercent >= 100 ? "completed" : completionPercent > 0 ? "in_progress" : storedUserStatus || "not_started";
  const remainingDays = dateStatus === "active" ? daysRemaining(row.end_date) : 0;
  const [participation] = includeStats ? await sql`
    select
      count(distinct coalesce(usc.user_id, sca.user_id))::int as participant_count,
      coalesce(max(sca.score), 0)::int as top_score
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id
    left join seasonal_challenge_attempts sca on sca.event_id = sce.id
    where sce.id = ${row.id}
  `.catch(() => [{ participant_count: 0, top_score: 0 }]) : [{ participant_count: row.participant_count || 0, top_score: row.top_score || 0 }];
  const [personal] = includeStats && userId ? await sql`
    select coalesce(max(score), 0)::int as personal_best
    from seasonal_challenge_attempts
    where event_id = ${row.id}
      and user_id = ${userId}
  `.catch(() => [{ personal_best: 0 }]) : [{ personal_best: 0 }];
  const rowQuestionCount = Number(row.playable_question_count ?? NaN);
  const playableQuestionCount = Number.isFinite(rowQuestionCount)
    ? rowQuestionCount
    : allowQuestionFallback ? (await challengeQuestions(sql, row)).length : Number(row.question_count || 0);

  if (persistProgress && userId && userStatus !== "not_started") {
    await sql`
      insert into user_seasonal_challenges (
        user_id,
        event_id,
        status,
        completed_requirements,
        total_requirements,
        completion_percentage,
        points_awarded,
        completed_at,
        updated_at
      )
      values (
        ${userId},
        ${row.id},
        ${userStatus === "completed" ? "completed" : "in_progress"},
        ${completedRequirements},
        ${totalRequirements},
        ${completionPercent},
        case when ${userStatus === "completed"} then ${Number(row.points || 0)} else 0 end,
        case when ${userStatus === "completed"} then now() else null end,
        now()
      )
      on conflict (user_id, event_id) do update set
        status = excluded.status,
        completed_requirements = excluded.completed_requirements,
        total_requirements = excluded.total_requirements,
        completion_percentage = excluded.completion_percentage,
        points_awarded = case
          when user_seasonal_challenges.completed_at is not null then user_seasonal_challenges.points_awarded
          when excluded.status = 'completed' then excluded.points_awarded
          else user_seasonal_challenges.points_awarded
        end,
        completed_at = case
          when user_seasonal_challenges.completed_at is not null then user_seasonal_challenges.completed_at
          when excluded.status = 'completed' then now()
          else null
        end,
        updated_at = now()
    `;

    if (userStatus === "completed") {
      await awardTickets(sql, {
        userId,
        ruleKey: normalizeChallengeType(row.challenge_type) === "weekly" ? "weekly_challenge_completed" : "seasonal_challenge_completed",
        sourceType: "seasonal_challenge",
        sourceId: row.id,
        metadata: {
          slug: row.slug,
          challengeType: normalizeChallengeType(row.challenge_type),
          points: Number(row.points || 0),
          badge: row.badge,
        },
      });
      await sql`
        insert into notifications (recipient_user_id, type, entity_type, entity_id, title, message)
        values (
          ${userId},
          'seasonal_challenge_completed',
          'seasonal_challenge',
          ${row.id},
          'Seasonal badge unlocked',
          ${`You completed ${row.name} and earned ${row.badge}.`}
        )
        on conflict do nothing
      `;
    }

    if (userStatus === "in_progress" && dateStatus === "active" && remainingDays <= 7) {
      await sql`
        insert into notifications (recipient_user_id, type, entity_type, entity_id, title, message)
        values (
          ${userId},
          'seasonal_challenge_ending',
          'seasonal_challenge',
          ${row.id},
          'Seasonal challenge ending soon',
          ${`${row.name} ends in ${remainingDays === 1 ? "1 day" : `${remainingDays} days`}.`}
        )
        on conflict do nothing
      `;
    }
  }

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    badge: row.badge,
    banner: row.banner || "",
    seasonKey: row.season_key || "general",
    challengeType: normalizeChallengeType(row.challenge_type),
    isFeatured: Boolean(row.active_challenge_week_id) || row.is_featured === true,
    isWeeklyFeatured: Boolean(row.active_challenge_week_id),
    challengeWeekId: row.active_challenge_week_id || undefined,
    windowStartAt: row.active_window_start_at || undefined,
    windowEndAt: row.active_window_end_at || undefined,
    winnersFinalized: row.winners_finalized === true,
    heroImageUrl: row.hero_image_url || "",
    questionCount: Number(row.question_count || 10),
    playableQuestionCount,
    targetMedia,
    rewardMetadata: safeObject(row.reward_metadata),
    isActive: row.is_active !== false,
    difficulty: row.difficulty || "medium",
    requirements: mappedRequirements,
    points: Number(row.points || 0),
    status: row.status,
    dateStatus,
    userStatus,
    completedRequirements,
    totalRequirements,
    completionPercent,
    daysRemaining: remainingDays,
    earnedAt: row.completed_at || undefined,
    participantCount: Number(participation?.participant_count || 0),
    topScore: Number(participation?.top_score || 0),
    personalBest: Number(personal?.personal_best || 0),
  };
}

export async function seasonalChallengeFeed(sql: any, userId?: string) {
  await ensureSeasonalChallengeTablesCached(sql);
  if (!userId && publicSeasonalFeedCache && publicSeasonalFeedCache.expiresAt > Date.now()) {
    return publicSeasonalFeedCache.value;
  }
  const activeWindow = await syncArcadeChallengeWindows(sql);
  const rows = await sql`
    select
      sce.*,
      usc.completed_at,
      usc.status as user_challenge_status,
      case when acw.id is not null then acw.challenge_week_id else null end as active_challenge_week_id,
      acw.start_at as active_window_start_at,
      acw.end_at as active_window_end_at,
      coalesce(acw.winners_finalized, false) as winners_finalized,
      coalesce(ecq_counts.playable_question_count, 0)::int as playable_question_count,
      coalesce(attempt_counts.participant_count, 0)::int as participant_count,
      coalesce(attempt_counts.top_score, 0)::int as top_score
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id and usc.user_id = ${userId || null}::uuid
    left join arcade_challenge_windows acw on acw.challenge_pack_id = sce.id and acw.status = 'active'
    left join (
      select event_slug, count(*)::int as playable_question_count
      from evergreen_challenge_questions
      where status = 'ready'
      group by event_slug
    ) ecq_counts on ecq_counts.event_slug = sce.slug
    left join (
      select event_id, count(distinct user_id)::int as participant_count, coalesce(max(score), 0)::int as top_score
      from seasonal_challenge_attempts
      group by event_id
    ) attempt_counts on attempt_counts.event_id = sce.id
    where sce.status = 'published'
      and sce.is_active = true
      and sce.end_date >= ((now() at time zone 'America/Toronto')::date - interval '180 days')
    order by
      case
        when (now() at time zone 'America/Toronto')::date between sce.start_date and sce.end_date then 0
        when sce.start_date > (now() at time zone 'America/Toronto')::date then 1
        else 2
      end,
      sce.is_featured desc,
      sce.start_date asc,
      sce.points desc
  `;
  const events = [];
  for (const row of rows) {
    events.push(await mapEvent(sql, row, userId, {
      includeStats: false,
      includeUserProgress: false,
      persistProgress: false,
      allowQuestionFallback: false,
    }));
  }
  const publicPlayableEvents = events.filter((event) => Number(event.playableQuestionCount || 0) >= 50 || event.userStatus === "completed");
  const active = publicPlayableEvents.filter((event) => event.dateStatus === "active");
  const upcoming = publicPlayableEvents.filter((event) => event.dateStatus === "upcoming").slice(0, 12);
  const recentlyCompleted = publicPlayableEvents.filter((event) => event.dateStatus === "ended" || event.userStatus === "completed").slice(0, 12);
  const feed = {
    events: publicPlayableEvents,
    sections: {
      active,
      endingSoon: active.filter((event) => event.daysRemaining <= 14),
      upcoming,
      recentlyCompleted,
      featured: active.find((event) => event.challengeWeekId === activeWindow?.challenge_week_id) || active.find((event) => event.isWeeklyFeatured) || active.find((event) => event.isFeatured && Number(event.playableQuestionCount || 0) >= 100) || active[0] || upcoming.find((event) => event.isFeatured) || upcoming[0] || null,
    },
  };
  if (!userId) {
    publicSeasonalFeedCache = {
      value: feed,
      expiresAt: Date.now() + PUBLIC_SEASONAL_FEED_CACHE_MS,
    };
  }
  return feed;
}

export async function seasonalChallengePublicFeed(sql: any) {
  if (publicSeasonalFeedCache && publicSeasonalFeedCache.expiresAt > Date.now()) {
    return publicSeasonalFeedCache.value;
  }

  const [activeWindow] = await sql`
    select challenge_week_id, challenge_pack_id
    from arcade_challenge_windows
    where status = 'active'
      and now() >= start_at
      and now() < end_at
    order by start_at desc
    limit 1
  `.catch(() => [null]);

  const rows = await sql`
    select
      sce.*,
      null::timestamp as completed_at,
      null::text as user_challenge_status,
      case when ${activeWindow?.challenge_pack_id || null}::uuid = sce.id then ${activeWindow?.challenge_week_id || null} else null end as active_challenge_week_id,
      null::timestamp as active_window_start_at,
      null::timestamp as active_window_end_at,
      false as winners_finalized,
      coalesce(ecq_counts.playable_question_count, 0)::int as playable_question_count,
      coalesce(attempt_counts.participant_count, 0)::int as participant_count,
      coalesce(attempt_counts.top_score, 0)::int as top_score
    from seasonal_challenge_events sce
    left join (
      select event_slug, count(*)::int as playable_question_count
      from evergreen_challenge_questions
      where status = 'ready'
      group by event_slug
    ) ecq_counts on ecq_counts.event_slug = sce.slug
    left join (
      select event_id, count(distinct user_id)::int as participant_count, coalesce(max(score), 0)::int as top_score
      from seasonal_challenge_attempts
      group by event_id
    ) attempt_counts on attempt_counts.event_id = sce.id
    where sce.status = 'published'
      and sce.is_active = true
      and sce.end_date >= ((now() at time zone 'America/Toronto')::date - interval '180 days')
    order by
      case
        when (now() at time zone 'America/Toronto')::date between sce.start_date and sce.end_date then 0
        when sce.start_date > (now() at time zone 'America/Toronto')::date then 1
        else 2
      end,
      case when ${activeWindow?.challenge_pack_id || null}::uuid = sce.id then 0 else 1 end,
      sce.is_featured desc,
      sce.start_date asc,
      sce.points desc
  `.catch(() => []);

  const events = [];
  for (const row of rows) {
    events.push(await mapEvent(sql, row, undefined, {
      includeStats: false,
      includeUserProgress: false,
      persistProgress: false,
      allowQuestionFallback: false,
    }));
  }

  const publicPlayableEvents = events.filter((event) => Number(event.playableQuestionCount || 0) >= 50);
  const active = publicPlayableEvents.filter((event) => event.dateStatus === "active");
  const upcoming = publicPlayableEvents.filter((event) => event.dateStatus === "upcoming").slice(0, 12);
  const recentlyCompleted = publicPlayableEvents.filter((event) => event.dateStatus === "ended").slice(0, 12);
  const feed = {
    events: publicPlayableEvents,
    sections: {
      active,
      endingSoon: active.filter((event) => event.daysRemaining <= 14),
      upcoming,
      recentlyCompleted,
      featured: active.find((event) => event.challengeWeekId === activeWindow?.challenge_week_id) || active.find((event) => event.isFeatured && Number(event.playableQuestionCount || 0) >= 100) || active[0] || upcoming.find((event) => event.isFeatured) || upcoming[0] || null,
    },
  };

  publicSeasonalFeedCache = {
    value: feed,
    expiresAt: Date.now() + PUBLIC_SEASONAL_FEED_CACHE_MS,
  };

  return feed;
}

export async function joinSeasonalChallenge(sql: any, userId: string, eventId: string) {
  await ensureSeasonalChallengeTables(sql);
  const [event] = await sql`
    select *
    from seasonal_challenge_events
    where id = ${eventId}
      and status = 'published'
      and is_active = true
      and (now() at time zone 'America/Toronto')::date between start_date and end_date
    limit 1
  `;
  if (!event) return null;

  await sql`
    insert into user_seasonal_challenges (
      user_id,
      event_id,
      status,
      completed_requirements,
      total_requirements,
      completion_percentage,
      points_awarded,
      updated_at
    )
    values (
      ${userId},
      ${eventId},
      'in_progress',
      0,
      ${normalizeRequirements(event.requirements).length},
      0,
      0,
      now()
    )
    on conflict (user_id, event_id) do update set
      status = case
        when user_seasonal_challenges.status = 'completed' then user_seasonal_challenges.status
        else 'in_progress'
      end,
      updated_at = now()
  `;

  await sql`
    insert into notifications (recipient_user_id, type, entity_type, entity_id, title, message)
    values (
      ${userId},
      'seasonal_challenge_started',
      'seasonal_challenge',
      ${eventId},
      'Seasonal challenge started',
      ${`You joined ${event.name}.`}
    )
    on conflict do nothing
  `;

  return mapEvent(sql, event, userId);
}

function mapChallengeQuestion(row: any) {
  const options = Array.isArray(row.options) ? row.options : typeof row.options === "string" ? (() => {
    try {
      const parsed = JSON.parse(row.options);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })() : [];
  return {
    id: row.id,
    tmdbId: Number(row.tmdb_id),
    mediaType: row.media_type === "tv" ? "tv" : "movie",
    question: row.question,
    answer: row.answer,
    options: stableShuffleOptions(options, String(row.id || row.question || ""), row.answer),
    explanation: row.explanation || "",
    difficulty: row.difficulty || "easy",
    spoilerLevel: row.spoiler_level || "none",
  };
}

export async function challengeQuestions(sql: any, event: any) {
  await ensureTriviaTables(sql);
  const limitCount = Math.max(1, Math.min(100, Number(event.question_count || 10)));
  const evergreenRows = await sql`
    select
      id,
      tmdb_id,
      media_type,
      question,
      answer,
      options,
      explanation,
      difficulty,
      'none' as spoiler_level,
      0.95 as confidence,
      created_at
    from evergreen_challenge_questions
    where event_slug = ${event.slug}
      and status = 'ready'
    order by question_order asc, created_at asc
    limit ${limitCount}
  `.catch(() => []);
  const seen = new Set<string>();
  const questions = [];
  for (const row of evergreenRows) {
    const key = String(row.question || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    questions.push(mapChallengeQuestion(row));
    if (questions.length >= limitCount) return mixChallengeQuestions(questions, event, limitCount);
  }

  const configuredTargets = normalizeTargetMedia(event.target_media);
  const targets = configuredTargets.length ? configuredTargets : fallbackChallengeTargets[event.season_key || "general"] || [];
  if (targets.length === 0) return mixChallengeQuestions(questions, event, limitCount);
  const targetRows = targets.map((target) => ({ media_type: target.mediaType, tmdb_id: target.tmdbId }));
  const remainingCount = Math.max(0, limitCount - questions.length);
  if (remainingCount === 0) return mixChallengeQuestions(questions, event, limitCount);
  const rows = await sql`
    select tt.id, tt.tmdb_id, tt.media_type, tt.question, tt.answer, tt.options, tt.explanation, tt.difficulty, tt.spoiler_level, tt.confidence, tt.created_at
    from title_trivia tt
    where tt.status in ('approved', 'auto_generated')
      and tt.report_count < 3
      and exists (
        select 1
        from jsonb_to_recordset(${JSON.stringify(targetRows)}::jsonb) as target(media_type text, tmdb_id integer)
        where target.media_type = tt.media_type
          and target.tmdb_id = tt.tmdb_id
      )
    order by tt.confidence desc, tt.created_at desc
    limit ${remainingCount}
  `.catch(() => []);
  for (const row of rows) {
    const key = String(row.question || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    questions.push(mapChallengeQuestion(row));
    if (questions.length >= limitCount) break;
  }
  return mixChallengeQuestions(questions, event, limitCount);
}

async function challengeStandings(sql: any, eventId: string, userId?: string, challengeWeekId?: string) {
  const weekFilter = challengeWeekId ? String(challengeWeekId).slice(0, 64) : null;
  const topScores = await sql`
    select
      ranked.id,
      ranked.user_id,
      ranked.score,
      ranked.correct_count,
      ranked.total_count,
      ranked.incorrect_count,
      ranked.skipped_count,
      ranked.total_time_ms,
      ranked.average_answer_time_ms,
      ranked.longest_correct_streak,
      ranked.challenge_week_id,
      ranked.completed_at,
      ranked.rank,
      coalesce(nullif(up.display_name, ''), up.handle, split_part(u.email, '@', 1), 'Flim player') as display_name,
      coalesce(up.handle, split_part(u.email, '@', 1), 'player') as handle
    from (
      select
        sca.*,
        row_number() over (
          order by sca.score desc, sca.total_time_ms asc, sca.longest_correct_streak desc, sca.skipped_count asc, sca.completed_at asc
        ) as rank
      from seasonal_challenge_attempts sca
      where sca.event_id = ${eventId}
        and (${weekFilter}::text is null or sca.challenge_week_id = ${weekFilter})
    ) ranked
    left join users u on u.id = ranked.user_id
    left join user_profiles up on up.user_id = ranked.user_id
    order by ranked.rank asc
    limit 10
  `.catch(() => []);
  const recentParticipants = await sql`
    select
      sca.id,
      sca.user_id,
      sca.score,
      sca.correct_count,
      sca.total_count,
      sca.incorrect_count,
      sca.skipped_count,
      sca.total_time_ms,
      sca.average_answer_time_ms,
      sca.longest_correct_streak,
      sca.challenge_week_id,
      sca.completed_at,
      coalesce(nullif(up.display_name, ''), up.handle, split_part(u.email, '@', 1), 'Flim player') as display_name,
      coalesce(up.handle, split_part(u.email, '@', 1), 'player') as handle
    from seasonal_challenge_attempts sca
    left join users u on u.id = sca.user_id
    left join user_profiles up on up.user_id = sca.user_id
    where sca.event_id = ${eventId}
      and (${weekFilter}::text is null or sca.challenge_week_id = ${weekFilter})
    order by sca.completed_at desc
    limit 10
  `.catch(() => []);
  const [personalBest] = userId ? await sql`
    select *
    from (
      select
        sca.*,
        row_number() over (
          order by sca.score desc, sca.total_time_ms asc, sca.longest_correct_streak desc, sca.skipped_count asc, sca.completed_at asc
        ) as rank
      from seasonal_challenge_attempts sca
      where sca.event_id = ${eventId}
        and (${weekFilter}::text is null or sca.challenge_week_id = ${weekFilter})
    ) ranked
    where ranked.user_id = ${userId}
    order by ranked.rank asc
    limit 1
  `.catch(() => []) : [];
  const mapScore = (row: any, index?: number) => ({
    id: row.id,
    rank: Number(row.rank || 0) || (typeof index === "number" ? index + 1 : undefined),
    score: Number(row.score || 0),
    correctCount: Number(row.correct_count || 0),
    totalCount: Number(row.total_count || 0),
    incorrectCount: Number(row.incorrect_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    totalTimeMs: Number(row.total_time_ms || 0),
    averageAnswerTimeMs: Number(row.average_answer_time_ms || 0),
    longestCorrectStreak: Number(row.longest_correct_streak || 0),
    challengeWeekId: row.challenge_week_id || "",
    completedAt: row.completed_at,
    displayName: row.display_name || "Flim player",
    handle: row.handle ? String(row.handle).replace(/^@/, "") : "player",
  });
  return {
    topScores: topScores.map(mapScore),
    recentParticipants: recentParticipants.map(mapScore),
    personalBest: personalBest ? mapScore(personalBest) : null,
  };
}

export async function seasonalChallengeDetail(sql: any, slug: string, userId?: string) {
  await ensureSeasonalChallengeTables(sql);
  const [row] = await sql`
    select
      sce.*,
      usc.completed_at,
      usc.status as user_challenge_status,
      case when acw.id is not null then acw.challenge_week_id else null end as active_challenge_week_id,
      acw.start_at as active_window_start_at,
      acw.end_at as active_window_end_at,
      coalesce(acw.winners_finalized, false) as winners_finalized
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id and usc.user_id = ${userId || null}::uuid
    left join arcade_challenge_windows acw on acw.challenge_pack_id = sce.id and acw.status = 'active'
    where sce.slug = ${slug}
      and sce.status = 'published'
      and sce.is_active = true
    limit 1
  `;
  if (!row) return null;
  const [event, questions, standings] = await Promise.all([
    mapEvent(sql, row, userId),
    challengeQuestions(sql, row),
    challengeStandings(sql, row.id, userId, row.active_challenge_week_id || undefined),
  ]);
  return {
    event,
    questions,
    standings,
    shareUrl: `/challenges/${row.slug}`,
    shareCardUrl: `/api/og/seasonal-challenge/${row.slug}`,
  };
}

export async function submitSeasonalChallengeAttempt(sql: any, userId: string, eventId: string, body: any) {
  await ensureSeasonalChallengeTables(sql);
  const [event] = await sql`
    select *
    from seasonal_challenge_events
    where id = ${eventId}
      and status = 'published'
      and is_active = true
      and (now() at time zone 'America/Toronto')::date between start_date and end_date
    limit 1
  `;
  if (!event) return null;
  const questions = await challengeQuestions(sql, event);
  const answers = safeObject(body.answers);
  const answerTimesMs = safeObject(body.answerTimesMs || body.answerTimes);
  const skippedQuestionIdSet = new Set(Array.isArray(body.skippedQuestionIds) ? body.skippedQuestionIds.map(String) : []);
  const submittedQuestionIds = Array.isArray(body.questionIds) ? body.questionIds.map(String) : questions.map((question: any) => question.id);
  const playableQuestions = questions.filter((question: any) => submittedQuestionIds.includes(question.id));
  const totalCount = playableQuestions.length;
  let correctCount = 0;
  let skippedCount = 0;
  let longestCorrectStreak = 0;
  let currentCorrectStreak = 0;
  for (const question of playableQuestions) {
    const selectedAnswer = typeof answers[question.id] === "string" ? answers[question.id] : "";
    const skipped = skippedQuestionIdSet.has(question.id) || !selectedAnswer;
    if (skipped) {
      skippedCount += 1;
      currentCorrectStreak = 0;
      continue;
    }
    if (selectedAnswer === question.answer) {
      correctCount += 1;
      currentCorrectStreak += 1;
      longestCorrectStreak = Math.max(longestCorrectStreak, currentCorrectStreak);
    } else {
      currentCorrectStreak = 0;
    }
  }
  const incorrectCount = Math.max(0, totalCount - correctCount - skippedCount);
  const score = correctCount * 100;
  const timedValues = playableQuestions
    .map((question: any) => Number(answerTimesMs[question.id] || 0))
    .filter((value: number) => Number.isFinite(value) && value > 0);
  const totalTimeMs = Math.max(0, Math.round(Number(body.totalTimeMs || body.total_time_ms || timedValues.reduce((sum: number, value: number) => sum + value, 0)) || 0));
  const answeredCount = Math.max(1, totalCount - skippedCount);
  const averageAnswerTimeMs = totalTimeMs ? Math.round(totalTimeMs / answeredCount) : 0;
  const [activeWindow] = await sql`
    select challenge_week_id
    from arcade_challenge_windows
    where challenge_pack_id = ${eventId}
      and status = 'active'
      and now() >= start_at
      and now() < end_at
    order by start_at asc
    limit 1
  `.catch(() => []);
  const challengeWeekId = String(body.challengeWeekId || body.challenge_week_id || activeWindow?.challenge_week_id || currentChallengeWeekId()).slice(0, 64);
  const [attempt] = await sql`
    insert into seasonal_challenge_attempts (
      event_id,
      user_id,
      score,
      correct_count,
      total_count,
      incorrect_count,
      skipped_count,
      total_time_ms,
      average_answer_time_ms,
      longest_correct_streak,
      challenge_week_id,
      question_ids,
      answers,
      completed_at
    )
    values (
      ${eventId},
      ${userId},
      ${score},
      ${correctCount},
      ${totalCount},
      ${incorrectCount},
      ${skippedCount},
      ${totalTimeMs},
      ${averageAnswerTimeMs},
      ${longestCorrectStreak},
      ${challengeWeekId},
      ${JSON.stringify(playableQuestions.map((question: any) => question.id))}::jsonb,
      ${JSON.stringify(answers)}::jsonb,
      now()
    )
    returning *
  `;

  await sql`
    insert into user_seasonal_challenges (
      user_id,
      event_id,
      status,
      completed_requirements,
      total_requirements,
      completion_percentage,
      points_awarded,
      updated_at
    )
    values (
      ${userId},
      ${eventId},
      'in_progress',
      0,
      ${normalizeRequirements(event.requirements).length},
      0,
      0,
      now()
    )
    on conflict (user_id, event_id) do update set
      status = case when user_seasonal_challenges.status = 'completed' then 'completed' else 'in_progress' end,
      updated_at = now()
  `;

  return {
    attempt: {
      id: attempt.id,
      score,
      correctCount,
      totalCount,
      incorrectCount,
      skippedCount,
      totalTimeMs,
      averageAnswerTimeMs,
      longestCorrectStreak,
      challengeWeekId,
      completedAt: attempt.completed_at,
      shareCardUrl: `/api/og/seasonal-challenge/${event.slug}?score=${score}`,
    },
    standings: await challengeStandings(sql, eventId, userId, challengeWeekId),
  };
}

export async function seasonalChallengeHistory(sql: any, userId: string) {
  await ensureSeasonalChallengeTables(sql);
  const rows = await sql`
    with ranked as (
      select
        sca.*,
        sce.slug,
        sce.name,
        sce.badge,
        sce.banner,
        sce.challenge_type,
        row_number() over (
          partition by sca.event_id
          order by sca.score desc, sca.total_time_ms asc, sca.longest_correct_streak desc, sca.skipped_count asc, sca.completed_at asc
        ) as rank
      from seasonal_challenge_attempts sca
      inner join seasonal_challenge_events sce on sce.id = sca.event_id
    )
    select
      id,
      score,
      correct_count,
      total_count,
      incorrect_count,
      skipped_count,
      total_time_ms,
      average_answer_time_ms,
      longest_correct_streak,
      challenge_week_id,
      completed_at,
      slug,
      name,
      badge,
      banner,
      challenge_type,
      rank
    from ranked
    where user_id = ${userId}
    order by completed_at desc
    limit 24
  `;
  return rows.map((row: any) => ({
    id: row.id,
    challengeSlug: row.slug,
    challengeName: row.name,
    badge: row.badge,
    banner: row.banner || "",
    challengeType: normalizeChallengeType(row.challenge_type),
    score: Number(row.score || 0),
    correctCount: Number(row.correct_count || 0),
    totalCount: Number(row.total_count || 0),
    incorrectCount: Number(row.incorrect_count || 0),
    skippedCount: Number(row.skipped_count || 0),
    totalTimeMs: Number(row.total_time_ms || 0),
    averageAnswerTimeMs: Number(row.average_answer_time_ms || 0),
    longestCorrectStreak: Number(row.longest_correct_streak || 0),
    challengeWeekId: row.challenge_week_id || "",
    rank: Number(row.rank || 0) || undefined,
    completedAt: row.completed_at,
    shareUrl: `/challenges/${row.slug}`,
    shareCardUrl: `/api/og/seasonal-challenge/${row.slug}?score=${Number(row.score || 0)}`,
  }));
}

export async function seasonalChallengeSummaryForUser(sql: any, userId: string) {
  await ensureSeasonalChallengeTables(sql);
  const [summary] = await sql`
    select
      count(*) filter (where usc.completed_at is not null)::int as seasonal_badge_count,
      coalesce(sum(points_awarded) filter (where usc.completed_at is not null), 0)::int as seasonal_points
    from user_seasonal_challenges usc
    where usc.user_id = ${userId}
  `;
  const badges = await sql`
    select
      sce.id,
      sce.slug,
      sce.name,
      sce.description,
      sce.badge,
      sce.points,
      sce.difficulty,
      sce.banner,
      usc.completion_percentage,
      usc.completed_at
    from user_seasonal_challenges usc
    inner join seasonal_challenge_events sce on sce.id = usc.event_id
    where usc.user_id = ${userId}
      and usc.completed_at is not null
    order by usc.completed_at desc
    limit 6
  `;
  return {
    seasonalBadgeCount: Number(summary?.seasonal_badge_count || 0),
    seasonalPoints: Number(summary?.seasonal_points || 0),
    featuredBadges: badges.slice(0, 3).map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      badge: row.badge,
      points: Number(row.points || 0),
      difficulty: row.difficulty,
      banner: row.banner || "",
      completionPercent: Number(row.completion_percentage || 100),
      earnedAt: row.completed_at,
    })),
    recentUnlocks: badges.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      badge: row.badge,
      points: Number(row.points || 0),
      difficulty: row.difficulty,
      banner: row.banner || "",
      completionPercent: Number(row.completion_percentage || 100),
      earnedAt: row.completed_at,
    })),
  };
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "seasonal-challenge";
}

export function cleanSeasonalChallengeInput(body: any) {
  const name = String(body.name || "").trim().slice(0, 120);
  const rawIsActive = body.isActive ?? body.is_active ?? true;
  const rawIsFeatured = body.isFeatured ?? body.is_featured ?? false;
  return {
    slug: slugify(String(body.slug || name)),
    name,
    description: String(body.description || "").trim().slice(0, 600),
    startDate: String(body.startDate || body.start_date || "").slice(0, 10),
    endDate: String(body.endDate || body.end_date || "").slice(0, 10),
    seasonKey: String(body.seasonKey || body.season_key || "general").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 80) || "general",
    challengeType: normalizeChallengeType(body.challengeType || body.challenge_type),
    isFeatured: rawIsFeatured === true || rawIsFeatured === "true" || rawIsFeatured === "on" || rawIsFeatured === "1" || rawIsFeatured === 1,
    heroImageUrl: String(body.heroImageUrl || body.hero_image_url || "").trim().slice(0, 600),
    questionCount: Math.max(1, Math.min(100, Number(body.questionCount || body.question_count || 10))),
    targetMedia: normalizeTargetMedia(body.targetMedia || body.target_media),
    rewardMetadata: safeObject(body.rewardMetadata || body.reward_metadata),
    isActive: rawIsActive === true || rawIsActive === "true" || rawIsActive === "on" || rawIsActive === "1" || rawIsActive === 1,
    badge: String(body.badge || `${name} Badge`).trim().slice(0, 120),
    banner: String(body.banner || "").trim().slice(0, 120),
    difficulty: ["easy", "medium", "hard", "expert"].includes(body.difficulty) ? body.difficulty : "medium",
    requirements: normalizeRequirements(body.requirements).slice(0, 8),
    points: Math.max(0, Math.min(1000, Number(body.points || 0))),
    status: ["draft", "published", "archived"].includes(body.status) ? body.status : "draft",
  };
}
