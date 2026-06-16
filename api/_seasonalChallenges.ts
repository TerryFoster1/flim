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
  return {
    slug,
    title,
    tmdbId,
    mediaType: "movie",
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
  await safe(sql`
    create unique index if not exists notifications_seasonal_challenge_unique
    on notifications (recipient_user_id, type, entity_type, entity_id)
    where entity_type = 'seasonal_challenge'
  `);

  for (const event of defaultEvents) {
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
        when 'oscar-challenge-2026' then case when season_key = 'general' then 'oscars' else season_key end
        else season_key
      end,
      challenge_type = case slug
        when 'oscar-challenge-2026' then 'special_event'
        when 'out-of-this-world' then 'special_event'
        else coalesce(nullif(challenge_type, ''), 'seasonal')
      end,
      is_featured = case slug
        when 'summer-blockbuster-2026' then true
        when 'out-of-this-world' then true
        else is_featured
      end,
      question_count = case slug
        when 'summer-blockbuster-2026' then greatest(question_count, 75)
        when 'out-of-this-world' then greatest(question_count, 100)
        else case when question_count < 1 then 10 else question_count end
      end,
      points = case slug
        when 'summer-blockbuster-2026' then greatest(points, 250)
        when 'out-of-this-world' then greatest(points, 300)
        else points
      end,
      start_date = case slug
        when 'halloween-horror-2026' then case when start_date = date '2026-10-01' then date '2026-09-15' else start_date end
        when 'christmas-movie-2026' then case when start_date = date '2026-12-01' then date '2026-11-15' else start_date end
        when 'summer-blockbuster-2026' then case when start_date = date '2026-06-01' then date '2026-05-15' else start_date end
        when 'out-of-this-world' then date '2026-01-01'
        else start_date
      end,
      end_date = case slug
        when 'out-of-this-world' then date '2035-12-31'
        else end_date
      end,
      updated_at = now()
    where slug in (
      'halloween-horror-2026',
      'christmas-movie-2026',
      'summer-blockbuster-2026',
      'out-of-this-world',
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
    isFeatured: row.is_featured === true,
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
  const rows = await sql`
    select
      sce.*,
      usc.completed_at,
      usc.status as user_challenge_status
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id and usc.user_id = ${userId || null}::uuid
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
      featured: active.find((event) => event.isFeatured) || active[0] || upcoming.find((event) => event.isFeatured) || upcoming[0] || null,
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

async function challengeQuestions(sql: any, event: any) {
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

async function challengeStandings(sql: any, eventId: string, userId?: string) {
  const topScores = await sql`
    select
      sca.id,
      sca.user_id,
      sca.score,
      sca.correct_count,
      sca.total_count,
      sca.completed_at,
      coalesce(nullif(up.display_name, ''), up.handle, split_part(u.email, '@', 1), 'Flim player') as display_name,
      coalesce(up.handle, split_part(u.email, '@', 1), 'player') as handle
    from seasonal_challenge_attempts sca
    left join users u on u.id = sca.user_id
    left join user_profiles up on up.user_id = sca.user_id
    where sca.event_id = ${eventId}
    order by sca.score desc, sca.completed_at asc
    limit 10
  `.catch(() => []);
  const recentParticipants = await sql`
    select
      sca.id,
      sca.user_id,
      sca.score,
      sca.correct_count,
      sca.total_count,
      sca.completed_at,
      coalesce(nullif(up.display_name, ''), up.handle, split_part(u.email, '@', 1), 'Flim player') as display_name,
      coalesce(up.handle, split_part(u.email, '@', 1), 'player') as handle
    from seasonal_challenge_attempts sca
    left join users u on u.id = sca.user_id
    left join user_profiles up on up.user_id = sca.user_id
    where sca.event_id = ${eventId}
    order by sca.completed_at desc
    limit 10
  `.catch(() => []);
  const [personalBest] = userId ? await sql`
    select id, score, correct_count, total_count, completed_at
    from seasonal_challenge_attempts
    where event_id = ${eventId}
      and user_id = ${userId}
    order by score desc, completed_at asc
    limit 1
  `.catch(() => []) : [];
  const mapScore = (row: any, index?: number) => ({
    id: row.id,
    rank: typeof index === "number" ? index + 1 : undefined,
    score: Number(row.score || 0),
    correctCount: Number(row.correct_count || 0),
    totalCount: Number(row.total_count || 0),
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
      usc.status as user_challenge_status
    from seasonal_challenge_events sce
    left join user_seasonal_challenges usc on usc.event_id = sce.id and usc.user_id = ${userId || null}::uuid
    where sce.slug = ${slug}
      and sce.status = 'published'
      and sce.is_active = true
    limit 1
  `;
  if (!row) return null;
  const [event, questions, standings] = await Promise.all([
    mapEvent(sql, row, userId),
    challengeQuestions(sql, row),
    challengeStandings(sql, row.id, userId),
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
  const submittedQuestionIds = Array.isArray(body.questionIds) ? body.questionIds.map(String) : questions.map((question: any) => question.id);
  const playableQuestions = questions.filter((question: any) => submittedQuestionIds.includes(question.id));
  const totalCount = playableQuestions.length;
  const correctCount = playableQuestions.reduce((count: number, question: any) => count + (answers[question.id] === question.answer ? 1 : 0), 0);
  const score = correctCount * 100;
  const [attempt] = await sql`
    insert into seasonal_challenge_attempts (
      event_id,
      user_id,
      score,
      correct_count,
      total_count,
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
      completedAt: attempt.completed_at,
      shareCardUrl: `/api/og/seasonal-challenge/${event.slug}?score=${score}`,
    },
    standings: await challengeStandings(sql, eventId, userId),
  };
}

export async function seasonalChallengeHistory(sql: any, userId: string) {
  await ensureSeasonalChallengeTables(sql);
  const rows = await sql`
    select
      sca.id,
      sca.score,
      sca.correct_count,
      sca.total_count,
      sca.completed_at,
      sce.slug,
      sce.name,
      sce.badge,
      sce.banner,
      sce.challenge_type
    from seasonal_challenge_attempts sca
    inner join seasonal_challenge_events sce on sce.id = sca.event_id
    where sca.user_id = ${userId}
    order by sca.completed_at desc
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
