import { ensureCollectionChallengeTables } from "./_challenges.js";
import { awardTickets } from "./_arcadeEconomy.js";
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
    difficulty: "easy",
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
  return {
    slug,
    title,
    tmdbId,
    mediaType,
    category,
    difficulty,
    question,
    answer,
    options: [answer, ...wrong].slice(0, 4),
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
].forEach(([quote, title, tmdbId, wrong]) => {
  evergreenChallengeQuestions.push(
    q(
      "movie-quote-challenge",
      String(title),
      Number(tmdbId),
      "quote",
      "easy",
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

async function mapEvent(sql: any, row: any, userId?: string) {
  const requirements = normalizeRequirements(row.requirements);
  const targetMedia = normalizeTargetMedia(row.target_media);
  const mappedRequirements = [];
  for (const requirement of requirements) {
    const progress = await progressForRequirement(sql, userId, requirement);
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
  const [participation] = await sql`
    select
      count(distinct coalesce(usc.user_id, sca.user_id))::int as participant_count,
      coalesce(max(sca.score), 0)::int as top_score
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id
    left join seasonal_challenge_attempts sca on sca.event_id = sce.id
    where sce.id = ${row.id}
  `.catch(() => [{ participant_count: 0, top_score: 0 }]);
  const [personal] = userId ? await sql`
    select coalesce(max(score), 0)::int as personal_best
    from seasonal_challenge_attempts
    where event_id = ${row.id}
      and user_id = ${userId}
  `.catch(() => [{ personal_best: 0 }]) : [{ personal_best: 0 }];
  const playableQuestionCount = (await challengeQuestions(sql, row)).length;

  if (userId && userStatus !== "not_started") {
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
  await ensureSeasonalChallengeTables(sql);
  const activeWindow = await syncArcadeChallengeWindows(sql);
  const rows = await sql`
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
  for (const row of rows) events.push(await mapEvent(sql, row, userId));
  const publicPlayableEvents = events.filter((event) => Number(event.playableQuestionCount || 0) >= 50 || event.userStatus === "completed");
  const active = publicPlayableEvents.filter((event) => event.dateStatus === "active");
  const upcoming = publicPlayableEvents.filter((event) => event.dateStatus === "upcoming").slice(0, 12);
  const recentlyCompleted = publicPlayableEvents.filter((event) => event.dateStatus === "ended" || event.userStatus === "completed").slice(0, 12);
  return {
    events: publicPlayableEvents,
    sections: {
      active,
      endingSoon: active.filter((event) => event.daysRemaining <= 14),
      upcoming,
      recentlyCompleted,
      featured: active.find((event) => event.challengeWeekId === activeWindow?.challenge_week_id) || active.find((event) => event.isWeeklyFeatured) || active.find((event) => event.isFeatured && Number(event.playableQuestionCount || 0) >= 100) || active[0] || upcoming.find((event) => event.isFeatured) || upcoming[0] || null,
    },
  };
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
    options,
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
    if (questions.length >= limitCount) return questions;
  }

  const configuredTargets = normalizeTargetMedia(event.target_media);
  const targets = configuredTargets.length ? configuredTargets : fallbackChallengeTargets[event.season_key || "general"] || [];
  if (targets.length === 0) return questions;
  const targetRows = targets.map((target) => ({ media_type: target.mediaType, tmdb_id: target.tmdbId }));
  const remainingCount = Math.max(0, limitCount - questions.length);
  if (remainingCount === 0) return questions;
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
  return questions;
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
