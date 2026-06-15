import { checkRateLimit, db, ensurePlaylistFollowsTable, ensurePlaylistLikesTable, ensureUserFollowsTable, ensureUserProfilesTable, errorStatus, getCurrentUser, mapPlaylist, sendJson } from "../_db.js";
import { ensureDirectorSeed } from "../_director.js";
import {
  findCatalogSearchResults,
  getCatalogMediaItem,
  mapCatalogSearchResult,
  upsertMediaItems,
} from "../_mediaCatalog.js";
import { ensureProviderAvailabilityTables } from "../_providers.js";
import { ensureTmdbCacheTables, fetchTmdbPersonDetails, fetchTmdbPersonSearch, fetchTmdbSearch, normalizeMovieQuery } from "../_tmdb.js";

const SEARCH_CACHE_DAYS = 7;
const MAX_TITLE_RESULTS = 12;
const MAX_PLAYLIST_RESULTS = 12;
const MAX_PROFILE_RESULTS = 8;
const MAX_COLLECTION_RESULTS = 8;
const MAX_ACTOR_RESULTS = 8;
const MAX_HUB_RESULTS = 10;

const discoveryHubs = [
  { kind: "genre", key: "sci-fi", title: "Sci-Fi", description: "Space, futures, tech, and speculative stories.", terms: ["sci-fi", "sci fi", "science fiction", "space"] },
  { kind: "genre", key: "horror", title: "Horror", description: "Scary, supernatural, slashers, and creature features.", terms: ["horror", "scary", "slasher"] },
  { kind: "genre", key: "fantasy", title: "Fantasy", description: "Magic, quests, and mythic worlds.", terms: ["fantasy", "magic"] },
  { kind: "genre", key: "thriller", title: "Thriller", description: "Suspense, crime, and tense watches.", terms: ["thriller", "suspense"] },
  { kind: "genre", key: "comedy", title: "Comedy", description: "Funny movies, comfort watches, and sitcoms.", terms: ["comedy", "funny", "sitcom"] },
  { kind: "genre", key: "action", title: "Action", description: "Action, adventure, heroes, and spectacle.", terms: ["action", "adventure"] },
  { kind: "genre", key: "family", title: "Family", description: "Family movie nights and animated favorites.", terms: ["family", "kids", "animation"] },
  { kind: "genre", key: "drama", title: "Drama", description: "Character-driven movies and prestige TV.", terms: ["drama"] },
  { kind: "genre", key: "anime", title: "Anime", description: "Anime films, series, and Japanese animation gateways.", terms: ["anime", "japanese animation"] },
  { kind: "genre", key: "christmas", title: "Christmas Movies", description: "Holiday movies, cozy rewatches, and family seasonal picks.", terms: ["christmas", "holiday movies", "holiday"] },
  { kind: "genre", key: "time-travel", title: "Time Travel", description: "Time loops, alternate timelines, paradoxes, and future shocks.", terms: ["time travel", "time loop", "time machine"] },
  { kind: "genre", key: "tornado-movies", title: "Tornado Movies", description: "Storm chasers, disaster movies, and extreme weather spectacle.", terms: ["tornado", "twister", "storm chaser", "storm"] },
  { kind: "genre", key: "shark-movies", title: "Shark Movies", description: "Sharks, ocean survival, creature features, and summer scares.", terms: ["shark", "sharks", "creature feature"] },
  { kind: "genre", key: "a24-horror", title: "A24 Horror", description: "Elevated horror, dread, and modern cult favorites.", terms: ["a24 horror", "a24", "elevated horror"] },
  { kind: "decade", key: "1970s", title: "1970s", description: "Browse movies and TV from the 1970s.", terms: ["1970s", "70s", "seventies"] },
  { kind: "decade", key: "1980s", title: "1980s", description: "Browse movies and TV from the 1980s.", terms: ["1980s", "80s", "eighties"] },
  { kind: "decade", key: "1990s", title: "1990s", description: "Browse movies and TV from the 1990s.", terms: ["1990s", "90s", "nineties"] },
  { kind: "decade", key: "2000s", title: "2000s", description: "Browse movies and TV from the 2000s.", terms: ["2000s"] },
  { kind: "decade", key: "2010s", title: "2010s", description: "Browse movies and TV from the 2010s.", terms: ["2010s"] },
  { kind: "decade", key: "2020s", title: "2020s", description: "Browse movies and TV from the 2020s.", terms: ["2020s"] },
  { kind: "franchise", key: "star-wars", title: "Star Wars", description: "Explore the Star Wars franchise.", terms: ["star wars", "jedi", "skywalker"] },
  { kind: "franchise", key: "back-to-the-future", title: "Back to the Future", description: "Explore the Back to the Future franchise.", terms: ["back to the future", "marty mcfly", "time travel"] },
  { kind: "franchise", key: "jurassic-park", title: "Jurassic Park", description: "Explore Jurassic Park and Jurassic World.", terms: ["jurassic park", "jurassic world", "dinosaurs"] },
  { kind: "franchise", key: "marvel", title: "Marvel", description: "Explore Marvel and MCU titles.", terms: ["marvel", "mcu", "avengers", "superhero"] },
  { kind: "franchise", key: "lord-of-the-rings", title: "Lord of the Rings", description: "Explore Middle-earth stories.", terms: ["lord of the rings", "middle earth", "hobbit"] },
  { kind: "franchise", key: "mission-impossible", title: "Mission: Impossible", description: "Explore Mission: Impossible films.", terms: ["mission impossible", "tom cruise", "spy"] },
  { kind: "franchise", key: "harry-potter", title: "Harry Potter", description: "Explore Wizarding World titles.", terms: ["harry potter", "wizarding world", "hogwarts"] },
  { kind: "franchise", key: "pixar", title: "Pixar", description: "Explore Pixar collections and playlists.", terms: ["pixar", "toy story", "animation"] },
];

const curatedCollectionSearchSeeds = [
  { slug: "back-to-the-future", title: "Back to the Future Collection", category: "Time Travel", keywords: ["time travel", "sci-fi", "science fiction", "80s"] },
  { slug: "jurassic-park", title: "Jurassic Park Collection", category: "Adventure", keywords: ["dinosaurs", "adventure", "sci-fi", "science fiction"] },
  { slug: "mission-impossible", title: "Mission: Impossible Collection", category: "Action", keywords: ["action", "spy", "espionage", "tom cruise"] },
  { slug: "harry-potter", title: "Harry Potter Collection", category: "Fantasy", keywords: ["fantasy", "magic", "wizarding world"] },
  { slug: "lord-of-the-rings", title: "The Lord of the Rings Collection", category: "Fantasy", keywords: ["fantasy", "middle earth"] },
  { slug: "star-wars", title: "Star Wars Collection", category: "Sci-Fi", keywords: ["sci-fi", "sci fi", "science fiction", "space opera"] },
  { slug: "fast-and-furious", title: "Fast & Furious Collection", category: "Action", keywords: ["cars", "racing", "action"] },
  { slug: "avengers", title: "The Avengers Collection", category: "Marvel", keywords: ["marvel", "superhero", "mcu", "comic book"] },
  { slug: "captain-america", title: "Captain America Collection", category: "Marvel", keywords: ["marvel", "superhero", "mcu", "comic book"] },
  { slug: "toy-story", title: "Toy Story Collection", category: "Pixar", keywords: ["pixar", "animation", "family", "kids"] },
];

const broadTitleSearchSeeds: Array<{
  triggers: string[];
  titles: Array<{ tmdbId: number; mediaType: "movie" | "tv"; title: string; releaseYear?: string; overview?: string }>;
}> = [
  {
    triggers: ["tom cruise"],
    titles: [
      { tmdbId: 744, mediaType: "movie", title: "Top Gun", releaseYear: "1986" },
      { tmdbId: 361743, mediaType: "movie", title: "Top Gun: Maverick", releaseYear: "2022" },
      { tmdbId: 954, mediaType: "movie", title: "Mission: Impossible", releaseYear: "1996" },
      { tmdbId: 380, mediaType: "movie", title: "Rain Man", releaseYear: "1988" },
      { tmdbId: 137113, mediaType: "movie", title: "Edge of Tomorrow", releaseYear: "2014" },
      { tmdbId: 180, mediaType: "movie", title: "Minority Report", releaseYear: "2002" },
      { tmdbId: 9390, mediaType: "movie", title: "Jerry Maguire", releaseYear: "1996" },
      { tmdbId: 1538, mediaType: "movie", title: "Collateral", releaseYear: "2004" },
      { tmdbId: 881, mediaType: "movie", title: "A Few Good Men", releaseYear: "1992" },
      { tmdbId: 2604, mediaType: "movie", title: "Born on the Fourth of July", releaseYear: "1989" },
    ],
  },
  {
    triggers: ["tornado", "twister", "storm chaser", "storm movies"],
    titles: [
      { tmdbId: 664, mediaType: "movie", title: "Twister", releaseYear: "1996" },
      { tmdbId: 718821, mediaType: "movie", title: "Twisters", releaseYear: "2024" },
      { tmdbId: 216282, mediaType: "movie", title: "Into the Storm", releaseYear: "2014" },
      { tmdbId: 435, mediaType: "movie", title: "The Day After Tomorrow", releaseYear: "2004" },
      { tmdbId: 33232, mediaType: "tv", title: "Storm Chasers", releaseYear: "2007" },
    ],
  },
  {
    triggers: ["movies like twister", "like twister", "twister"],
    titles: [
      { tmdbId: 718821, mediaType: "movie", title: "Twisters", releaseYear: "2024" },
      { tmdbId: 216282, mediaType: "movie", title: "Into the Storm", releaseYear: "2014" },
      { tmdbId: 435, mediaType: "movie", title: "The Day After Tomorrow", releaseYear: "2004" },
      { tmdbId: 9619, mediaType: "movie", title: "Dante's Peak", releaseYear: "1997" },
      { tmdbId: 10357, mediaType: "movie", title: "Volcano", releaseYear: "1997" },
    ],
  },
  {
    triggers: ["90s action", "nineties action", "1990s action"],
    titles: [
      { tmdbId: 280, mediaType: "movie", title: "Terminator 2: Judgment Day", releaseYear: "1991" },
      { tmdbId: 1637, mediaType: "movie", title: "Speed", releaseYear: "1994" },
      { tmdbId: 36955, mediaType: "movie", title: "True Lies", releaseYear: "1994" },
      { tmdbId: 603, mediaType: "movie", title: "The Matrix", releaseYear: "1999" },
      { tmdbId: 954, mediaType: "movie", title: "Mission: Impossible", releaseYear: "1996" },
      { tmdbId: 9802, mediaType: "movie", title: "The Rock", releaseYear: "1996" },
      { tmdbId: 754, mediaType: "movie", title: "Face/Off", releaseYear: "1997" },
      { tmdbId: 1572, mediaType: "movie", title: "Die Hard with a Vengeance", releaseYear: "1995" },
    ],
  },
  {
    triggers: ["christmas", "holiday movies", "holiday"],
    titles: [
      { tmdbId: 771, mediaType: "movie", title: "Home Alone", releaseYear: "1990" },
      { tmdbId: 10719, mediaType: "movie", title: "Elf", releaseYear: "2003" },
      { tmdbId: 1585, mediaType: "movie", title: "It's a Wonderful Life", releaseYear: "1946" },
      { tmdbId: 5825, mediaType: "movie", title: "National Lampoon's Christmas Vacation", releaseYear: "1989" },
      { tmdbId: 10437, mediaType: "movie", title: "The Muppet Christmas Carol", releaseYear: "1992" },
      { tmdbId: 850, mediaType: "movie", title: "A Christmas Story", releaseYear: "1983" },
      { tmdbId: 5255, mediaType: "movie", title: "The Polar Express", releaseYear: "2004" },
    ],
  },
  {
    triggers: ["a24 horror", "a24 scary", "elevated horror"],
    titles: [
      { tmdbId: 493922, mediaType: "movie", title: "Hereditary", releaseYear: "2018" },
      { tmdbId: 530385, mediaType: "movie", title: "Midsommar", releaseYear: "2019" },
      { tmdbId: 310131, mediaType: "movie", title: "The Witch", releaseYear: "2015" },
      { tmdbId: 1008042, mediaType: "movie", title: "Talk to Me", releaseYear: "2023" },
      { tmdbId: 760104, mediaType: "movie", title: "X", releaseYear: "2022" },
      { tmdbId: 949423, mediaType: "movie", title: "Pearl", releaseYear: "2022" },
      { tmdbId: 503919, mediaType: "movie", title: "The Lighthouse", releaseYear: "2019" },
      { tmdbId: 313922, mediaType: "movie", title: "Green Room", releaseYear: "2015" },
    ],
  },
  {
    triggers: ["time travel", "time loop", "time machine"],
    titles: [
      { tmdbId: 105, mediaType: "movie", title: "Back to the Future", releaseYear: "1985" },
      { tmdbId: 59967, mediaType: "movie", title: "Looper", releaseYear: "2012" },
      { tmdbId: 63, mediaType: "movie", title: "12 Monkeys", releaseYear: "1995" },
      { tmdbId: 137113, mediaType: "movie", title: "Edge of Tomorrow", releaseYear: "2014" },
      { tmdbId: 218, mediaType: "movie", title: "The Terminator", releaseYear: "1984" },
      { tmdbId: 122906, mediaType: "movie", title: "About Time", releaseYear: "2013" },
      { tmdbId: 14337, mediaType: "movie", title: "Primer", releaseYear: "2004" },
      { tmdbId: 45612, mediaType: "movie", title: "Source Code", releaseYear: "2011" },
    ],
  },
  {
    triggers: ["anime", "japanese animation"],
    titles: [
      { tmdbId: 129, mediaType: "movie", title: "Spirited Away", releaseYear: "2001" },
      { tmdbId: 149, mediaType: "movie", title: "Akira", releaseYear: "1988" },
      { tmdbId: 372058, mediaType: "movie", title: "Your Name.", releaseYear: "2016" },
      { tmdbId: 128, mediaType: "movie", title: "Princess Mononoke", releaseYear: "1997" },
      { tmdbId: 9323, mediaType: "movie", title: "Ghost in the Shell", releaseYear: "1995" },
      { tmdbId: 635302, mediaType: "movie", title: "Demon Slayer: Kimetsu no Yaiba - The Movie: Mugen Train", releaseYear: "2020" },
    ],
  },
  {
    triggers: ["shark", "sharks"],
    titles: [
      { tmdbId: 578, mediaType: "movie", title: "Jaws", releaseYear: "1975" },
      { tmdbId: 332567, mediaType: "movie", title: "The Shallows", releaseYear: "2016" },
      { tmdbId: 8914, mediaType: "movie", title: "Deep Blue Sea", releaseYear: "1999" },
      { tmdbId: 345940, mediaType: "movie", title: "The Meg", releaseYear: "2018" },
      { tmdbId: 83, mediaType: "movie", title: "Open Water", releaseYear: "2003" },
      { tmdbId: 403119, mediaType: "movie", title: "47 Meters Down", releaseYear: "2017" },
    ],
  },
  {
    triggers: ["blue people planet", "blue aliens planet", "blue people", "pandora planet"],
    titles: [
      { tmdbId: 19995, mediaType: "movie", title: "Avatar", releaseYear: "2009" },
      { tmdbId: 76600, mediaType: "movie", title: "Avatar: The Way of Water", releaseYear: "2022" },
    ],
  },
  {
    triggers: ["toys come alive", "toys are alive", "toy comes alive", "living toys"],
    titles: [
      { tmdbId: 862, mediaType: "movie", title: "Toy Story", releaseYear: "1995" },
      { tmdbId: 863, mediaType: "movie", title: "Toy Story 2", releaseYear: "1999" },
      { tmdbId: 10193, mediaType: "movie", title: "Toy Story 3", releaseYear: "2010" },
      { tmdbId: 301528, mediaType: "movie", title: "Toy Story 4", releaseYear: "2019" },
    ],
  },
  {
    triggers: ["tom cruise airplane", "tom cruise jet", "fighter pilot", "navy pilot"],
    titles: [
      { tmdbId: 744, mediaType: "movie", title: "Top Gun", releaseYear: "1986" },
      { tmdbId: 361743, mediaType: "movie", title: "Top Gun: Maverick", releaseYear: "2022" },
    ],
  },
  {
    triggers: ["korean revenge thriller", "korean revenge", "revenge thriller korean"],
    titles: [
      { tmdbId: 670, mediaType: "movie", title: "Oldboy", releaseYear: "2003" },
      { tmdbId: 49797, mediaType: "movie", title: "I Saw the Devil", releaseYear: "2010" },
      { tmdbId: 4550, mediaType: "movie", title: "Lady Vengeance", releaseYear: "2005" },
      { tmdbId: 51608, mediaType: "movie", title: "The Man from Nowhere", releaseYear: "2010" },
      { tmdbId: 290098, mediaType: "movie", title: "The Handmaiden", releaseYear: "2016" },
    ],
  },
];

const naturalLanguageSearchProfiles = [
  {
    triggers: ["tv show about neighbors who are aliens", "show about neighbors who are aliens", "neighbors who are aliens", "alien neighbors", "aliens next door"],
    titleQueries: ["The Neighbors"],
    terms: ["the neighbors", "alien neighbors", "alien sitcom", "neighbors aliens", "sitcom"],
  },
  {
    triggers: ["movie with tornado chasers", "tornado chasers", "storm chasers movie", "storm chasing movie"],
    titleQueries: ["Twister", "Twisters", "Into the Storm"],
    terms: ["tornado", "twister", "storm chaser", "storm chasing", "disaster"],
  },
  {
    triggers: ["tom cruise airplane movie", "tom cruise jet movie", "tom cruise fighter pilot", "tom cruise pilot"],
    titleQueries: ["Top Gun", "Top Gun: Maverick"],
    terms: ["tom cruise", "top gun", "fighter pilot", "airplane", "jet"],
  },
  {
    triggers: ["blue people planet movie", "blue people planet", "blue aliens planet movie", "movie with blue people"],
    titleQueries: ["Avatar", "Avatar: The Way of Water"],
    terms: ["avatar", "pandora", "blue aliens", "sci-fi", "science fiction"],
  },
  {
    triggers: ["movie where toys come alive", "toys come alive", "movie about toys coming alive", "living toys movie"],
    titleQueries: ["Toy Story"],
    terms: ["toy story", "toys come alive", "pixar", "animation", "family"],
  },
  {
    triggers: ["korean revenge thriller", "korean revenge movie", "korean revenge movies"],
    titleQueries: ["Oldboy", "I Saw the Devil", "Lady Vengeance"],
    terms: ["korean revenge thriller", "revenge thriller", "korean thriller", "oldboy"],
  },
  {
    triggers: ["shark movie", "shark movies", "movie about sharks"],
    titleQueries: ["Jaws", "The Shallows", "Deep Blue Sea"],
    terms: ["shark", "sharks", "creature feature", "jaws"],
  },
];

function firstQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeRegion(value: unknown) {
  return String(value || "").trim().toUpperCase() || "CA";
}

function preferredProvidersFromQuery(value: unknown) {
  return firstQueryValue(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeSearchText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchingNaturalLanguageProfiles(query: string) {
  const normalized = normalizeSearchText(query);
  return naturalLanguageSearchProfiles.filter((profile) => profile.triggers.some((trigger) => {
    const normalizedTrigger = normalizeSearchText(trigger);
    return normalized.includes(normalizedTrigger) || (normalized.length >= 8 && normalizedTrigger.includes(normalized));
  }));
}

function naturalLanguageTerms(query: string) {
  return matchingNaturalLanguageProfiles(query).flatMap((profile) => [...profile.titleQueries, ...profile.terms]);
}

function alternateTitleSearchQueries(query: string) {
  const normalizedQuery = normalizeSearchText(query);
  const alternates = naturalLanguageTerms(query)
    .filter((term) => normalizeSearchText(term) && normalizeSearchText(term) !== normalizedQuery);
  return Array.from(new Set(alternates)).slice(0, 4);
}

function expandedSearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  const stripped = normalized
    .replace(/\b(movies?|films?|tv|shows?|series|watch|best|top|like|similar to|about)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = new Set([normalized, stripped].filter(Boolean));
  naturalLanguageTerms(query).forEach((term) => terms.add(normalizeSearchText(term) || term));
  if (normalized.includes("sci fi") || normalized.includes("scifi")) {
    terms.add("sci-fi");
    terms.add("science fiction");
  }
  if (normalized.includes("science fiction")) {
    terms.add("sci-fi");
    terms.add("sci fi");
  }
  if (normalized.includes("christmas")) {
    terms.add("holiday");
  }
  if (normalized.includes("zombie")) {
    terms.add("zombies");
    terms.add("undead");
    terms.add("apocalypse");
  }
  if (normalized.includes("disaster")) {
    terms.add("apocalypse");
    terms.add("end of the world");
  }
  if (normalized.includes("tornado") || normalized.includes("twister")) {
    terms.add("tornado");
    terms.add("twister");
    terms.add("storm");
    terms.add("disaster");
  }
  if (normalized.includes("shark")) {
    terms.add("shark");
    terms.add("sharks");
    terms.add("creature feature");
  }
  if (normalized.includes("a24") && normalized.includes("horror")) {
    terms.add("a24");
    terms.add("a24 horror");
    terms.add("horror");
    terms.add("elevated horror");
  }
  if (normalized.includes("time travel")) {
    terms.add("time travel");
    terms.add("time loop");
    terms.add("time machine");
  }
  if (normalized.includes("90s") || normalized.includes("1990s") || normalized.includes("nineties")) {
    terms.add("1990s");
    terms.add("90s");
    terms.add("nineties");
  }
  if (normalized.includes("anime")) {
    terms.add("japanese animation");
  }
  if (normalized.includes("oscar")) {
    terms.add("award");
    terms.add("best picture");
  }
  return [...terms].filter(Boolean);
}

function searchPatterns(query: string) {
  return expandedSearchTerms(query).map((term) => `%${term}%`);
}

function collectionSearchTerms(query: string) {
  const normalized = normalizeSearchText(query);
  const stripped = normalized
    .replace(/\b(movies?|films?|tv|shows?|series|watch|best|top|like|similar to|about)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = new Set([normalized, stripped].filter(Boolean));
  naturalLanguageTerms(query).forEach((term) => terms.add(normalizeSearchText(term) || term));
  if (normalized.includes("sci fi") || normalized.includes("scifi")) {
    terms.add("sci-fi");
    terms.add("science fiction");
  }
  if (normalized.includes("science fiction")) {
    terms.add("sci-fi");
    terms.add("sci fi");
  }
  if (normalized.includes("marvel")) terms.add("mcu");
  if (normalized.includes("christmas")) terms.add("holiday");
  if (normalized.includes("anime")) terms.add("japanese animation");
  if (normalized.includes("time travel")) {
    terms.add("time travel");
    terms.add("time loop");
  }
  if (normalized.includes("tornado") || normalized.includes("twister")) {
    terms.add("tornado");
    terms.add("twister");
  }
  if (normalized.includes("shark")) {
    terms.add("shark");
    terms.add("sharks");
  }
  if (normalized.includes("a24") && normalized.includes("horror")) {
    terms.add("a24");
    terms.add("a24 horror");
  }
  return [...terms].filter(Boolean);
}

function matchingTitleSeeds(query: string) {
  const terms = expandedSearchTerms(query);
  const normalized = normalizeSearchText(query);
  const seen = new Set<string>();
  const matches: Array<{ tmdbId: number; mediaType: "movie" | "tv"; title: string; releaseYear?: string; overview?: string }> = [];

  for (const seed of broadTitleSearchSeeds) {
    const hit = seed.triggers.some((trigger) => {
      const normalizedTrigger = normalizeSearchText(trigger);
      return normalized.includes(normalizedTrigger) || terms.some((term) => term.includes(normalizedTrigger) || normalizedTrigger.includes(term));
    });
    if (!hit) continue;
    for (const title of seed.titles) {
      const key = `${title.mediaType}:${title.tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(title);
    }
  }

  return matches.slice(0, 12);
}

function searchHubs(query: string) {
  const terms = expandedSearchTerms(query);
  return discoveryHubs
    .filter((hub) => {
      const haystack = normalizeSearchText([hub.title, hub.description, ...hub.terms].join(" "));
      return terms.some((term) => haystack.includes(term));
    })
    .map((hub) => {
      const hubText = normalizeSearchText([hub.title, hub.key, ...hub.terms].join(" "));
      const rank = terms.some((term) => normalizeSearchText(hub.title) === term || normalizeSearchText(hub.key) === term)
        ? 0
        : terms.some((term) => hubText.includes(term))
          ? 1
          : 2;
      return { hub, rank };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_HUB_RESULTS)
    .map(({ hub }) => hub)
    .map((hub) => ({
      kind: hub.kind,
      key: hub.key,
      title: hub.title,
      description: hub.description,
      path: `/${hub.kind}/${hub.key}`,
    }));
}

function mergeTitleResults(primary: any[], secondary: any[]) {
  const seen = new Set<string>();
  const merged: any[] = [];

  for (const item of [...primary, ...secondary]) {
    const key = `${item.mediaType || "movie"}-${item.tmdbId}`;
    if (!item.tmdbId || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= MAX_TITLE_RESULTS) break;
  }

  return merged;
}

async function searchTitles(sql: any, query: string) {
  const normalizedQuery = normalizeMovieQuery(query);
  const catalogResults = (await findCatalogSearchResults(sql, query, "both")).map(mapCatalogSearchResult);
  if (catalogResults.length >= 6) {
    return {
      items: catalogResults.slice(0, MAX_TITLE_RESULTS),
      source: "catalog",
    };
  }

  const cached = await sql`
    select response_json
    from tmdb_search_cache
    where normalized_query = ${normalizedQuery}
      and media_type = 'both'
      and expires_at > now()
    order by created_at desc
    limit 1
  `;

  if (cached[0]) {
    const cachedItems = cached[0].response_json || [];
    await upsertMediaItems(sql, cachedItems);
    return {
      items: mergeTitleResults(catalogResults, cachedItems),
      source: catalogResults.length ? "catalog_cache" : "cache",
    };
  }

  try {
    const freshItems = await fetchTmdbSearch(query, "both");
    await upsertMediaItems(sql, freshItems);
    await sql`
      insert into tmdb_search_cache (query, normalized_query, media_type, response_json, expires_at)
      values (${query}, ${normalizedQuery}, 'both', ${JSON.stringify(freshItems)}::jsonb, now() + (${SEARCH_CACHE_DAYS} * interval '1 day'))
      on conflict (media_type, normalized_query)
      do update set
        query = excluded.query,
        response_json = excluded.response_json,
        created_at = now(),
        expires_at = excluded.expires_at
    `;

    return {
      items: mergeTitleResults(catalogResults, freshItems),
      source: catalogResults.length ? "catalog_tmdb" : "tmdb",
    };
  } catch (error) {
    console.error("discovery_title_search_fallback", error instanceof Error ? error.message : "Title search import failed.");
    return {
      items: catalogResults.slice(0, MAX_TITLE_RESULTS),
      source: "catalog",
    };
  }
}

async function searchBroadSeedTitles(sql: any, query: string) {
  const seeds = matchingTitleSeeds(query);
  if (seeds.length === 0) return [];

  const items = await Promise.all(
    seeds.map(async (seed) => {
      const cached = await getCatalogMediaItem(sql, seed.tmdbId, seed.mediaType).catch(() => null);
      if (cached) return mapCatalogSearchResult(cached);
      return {
        tmdbId: seed.tmdbId,
        mediaType: seed.mediaType,
        title: seed.title,
        releaseYear: seed.releaseYear,
        overview: seed.overview || "Discover this title on Flim.",
        genreIds: [],
      };
    }),
  );
  return items.filter(Boolean);
}

async function titleResultsForPerson(sql: any, actors: any[], query: string) {
  const normalized = normalizeSearchText(query);
  const actor = actors.find((item) => normalizeSearchText(item.name || "") === normalized);
  if (!actor?.tmdbId) return [];

  try {
    const details = await fetchTmdbPersonDetails(Number(actor.tmdbId));
    const credits = [...(details.movieCredits || []), ...(details.tvCredits || [])]
      .sort((a: any, b: any) => Number(b.popularity || 0) - Number(a.popularity || 0))
      .slice(0, 10)
      .map((credit: any) => ({
        tmdbId: credit.tmdbId,
        mediaType: credit.mediaType || "movie",
        title: credit.title,
        releaseYear: credit.releaseYear,
        overview: "",
        posterUrl: credit.posterUrl,
        genreIds: [],
        popularity: credit.popularity,
      }));
    if (credits.length > 0) await upsertMediaItems(sql, credits);
    return credits;
  } catch (error) {
    console.error("discovery_person_credit_titles_failed", error instanceof Error ? error.message : "Person credit search failed.");
    return [];
  }
}

async function searchPublicPlaylists(sql: any, query: string, userId?: string) {
  const patterns = searchPatterns(query);
  const rows = await sql`
    select
      p.*,
      up.handle as creator_handle,
      coalesce(
        nullif(up.display_name, ''),
        nullif(initcap(trim(regexp_replace(split_part(u.email, '@', 1), '[^a-zA-Z0-9]+', ' ', 'g'))), '')
      ) as creator_display_name,
      false as is_owner,
      false as expose_shared_slug,
      (
        select count(*)::int
        from playlist_follows pf
        where pf.playlist_id = p.id
      ) as follower_count,
      (
        select count(*)::int
        from playlist_likes pl
        where pl.playlist_id = p.id
      ) as like_count,
      exists (
        select 1
        from playlist_follows my_pf
        where my_pf.playlist_id = p.id
          and ${userId || null}::uuid is not null
          and my_pf.follower_user_id = ${userId || null}::uuid
      ) as is_following,
      exists (
        select 1
        from playlist_likes my_pl
        where my_pl.playlist_id = p.id
          and ${userId || null}::uuid is not null
          and my_pl.user_id = ${userId || null}::uuid
      ) as is_liked,
      coalesce(
        json_agg(pm order by coalesce(pm.sort_order, 2147483647), pm.added_at desc) filter (where pm.id is not null),
        '[]'
      ) as movies,
      case
        when lower(p.name) = lower(${query}) then 0
        when lower(p.name) like lower(${`${query}%`}) then 1
        when lower(p.name) like any(${patterns}) then 2
        when lower(coalesce(p.description, '')) like any(${patterns}) then 3
        when lower(coalesce(up.display_name, '')) like any(${patterns}) then 4
        when lower(coalesce(up.handle, '')) like any(${patterns}) then 5
        else 6
      end as search_rank
    from playlists p
    left join user_profiles up on up.user_id = p.owner_user_id::text
    left join users u on u.id = p.owner_user_id
    left join playlist_movies pm on pm.playlist_id = p.id
    left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
    where p.visibility = 'public'
      and not (
        lower(p.name) like '%codex vercel curl add test%'
        or lower(p.name) like '%temporary production verification%'
        or lower(p.name) like '%production verification playlist%'
      )
      and (
        lower(p.name) like any(${patterns})
        or lower(coalesce(p.description, '')) like any(${patterns})
        or lower(coalesce(up.display_name, '')) like any(${patterns})
        or lower(coalesce(up.handle, '')) like any(${patterns})
        or exists (
          select 1
          from playlist_movies pm_match
          left join media_items mi_match on mi_match.media_type = coalesce(pm_match.media_type, 'movie') and mi_match.tmdb_id = pm_match.tmdb_id
          where pm_match.playlist_id = p.id
            and (
              lower(pm_match.title) like any(${patterns})
              or lower(coalesce(pm_match.overview, '')) like any(${patterns})
              or lower(coalesce(mi_match.title, '')) like any(${patterns})
              or lower(coalesce(mi_match.overview, '')) like any(${patterns})
              or lower(coalesce(mi_match.genres::text, '')) like any(${patterns})
            )
        )
      )
    group by p.id, up.handle, up.display_name, u.email
    order by search_rank asc, like_count desc, follower_count desc, p.updated_at desc
    limit ${MAX_PLAYLIST_RESULTS}
  `;

  return rows.map((playlist: any) => mapPlaylist(playlist, playlist.movies || []));
}

async function searchProfiles(sql: any, query: string) {
  const patterns = searchPatterns(query);
  const rows = await sql`
    select
      up.display_name,
      up.handle,
      up.bio,
      up.avatar_key,
      up.avatar_customization,
      up.profile_image_url,
      up.created_at,
      count(distinct p.id)::int as playlist_count,
      count(pm.id)::int as title_count,
      (
        select count(*)::int
        from user_follows uf
        where uf.followed_user_id::text = up.user_id
      ) as follower_count,
      (
        select count(*)::int
        from playlist_follows pf
        join playlists followed_playlist on followed_playlist.id = pf.playlist_id
        where followed_playlist.owner_user_id::text = up.user_id
          and followed_playlist.visibility = 'public'
      ) as playlist_follower_count,
      (
        select count(*)::int
        from playlist_likes pl
        join playlists liked_playlist on liked_playlist.id = pl.playlist_id
        where liked_playlist.owner_user_id::text = up.user_id
          and liked_playlist.visibility = 'public'
      ) as playlist_like_count
    from user_profiles up
    left join playlists p on p.owner_user_id::text = up.user_id and p.visibility = 'public'
    left join playlist_movies pm on pm.playlist_id = p.id
    left join media_items mi on mi.media_type = coalesce(pm.media_type, 'movie') and mi.tmdb_id = pm.tmdb_id
    where up.handle <> ''
      and (
        lower(up.handle) like any(${patterns})
        or lower(up.display_name) like any(${patterns})
        or lower(coalesce(up.bio, '')) like any(${patterns})
        or lower(coalesce(p.name, '')) like any(${patterns})
        or lower(coalesce(p.description, '')) like any(${patterns})
        or lower(coalesce(pm.title, '')) like any(${patterns})
        or lower(coalesce(mi.genres::text, '')) like any(${patterns})
      )
    group by up.id
    order by
      case
        when lower(up.handle) = lower(${query}) then 0
        when lower(up.display_name) = lower(${query}) then 1
        when lower(up.handle) like lower(${`${query}%`}) then 2
        when lower(up.display_name) like lower(${`${query}%`}) then 3
        else 4
      end,
      count(distinct p.id) desc,
      (
        select count(*)::int
        from user_follows uf
        where uf.followed_user_id::text = up.user_id
      ) desc,
      up.updated_at desc
    limit ${MAX_PROFILE_RESULTS}
  `;

  return rows.map((row: any) => ({
    displayName: row.display_name || row.handle,
    handle: row.handle,
    bio: row.bio || "",
    avatarKey: row.avatar_key || "director",
    avatarCustomization: row.avatar_customization && typeof row.avatar_customization === "object" ? row.avatar_customization : {},
    profileImageUrl: row.profile_image_url || "",
    playlistCount: Number(row.playlist_count || 0),
    titleCount: Number(row.title_count || 0),
    followerCount: Number(row.follower_count || 0),
    playlistFollowerCount: Number(row.playlist_follower_count || 0),
    playlistLikeCount: Number(row.playlist_like_count || 0),
  }));
}

async function searchCollections(sql: any, query: string) {
  const terms = collectionSearchTerms(query);
  const patterns = terms.map((term) => `%${term}%`);
  const rows = await safeRows(sql`
    select
      mc.slug,
      mc.title,
      mc.overview,
      mc.poster_url,
      mc.backdrop_url,
      mc.category,
      count(mci.id)::int as title_count,
      count(mci.id) filter (where mci.media_type = 'movie')::int as movie_count,
      count(mci.id) filter (where mci.media_type = 'tv')::int as tv_count,
      max(mci.release_date) as latest_release_date,
      case
        when lower(mc.title) = lower(${query}) then 0
        when lower(mc.title) like lower(${`${query}%`}) then 1
        when lower(mc.title) like any(${patterns}) then 2
        when lower(coalesce(mc.category, '')) like any(${patterns}) then 3
        else 4
      end as search_rank
    from media_collections mc
    left join media_collection_items mci on mci.collection_id = mc.id
    where
      lower(mc.title) like any(${patterns})
      or lower(coalesce(mc.overview, '')) like any(${patterns})
      or lower(coalesce(mc.category, '')) like any(${patterns})
      or exists (
        select 1
        from media_collection_items item_match
        where item_match.collection_id = mc.id
          and (
            lower(item_match.title) like any(${patterns})
            or lower(coalesce(item_match.overview, '')) like any(${patterns})
          )
      )
    group by mc.id
    order by search_rank asc, title_count desc, mc.updated_at desc
    limit ${MAX_COLLECTION_RESULTS}
  `);
  const bySlug = new Map<string, any>();
  for (const row of rows) {
    bySlug.set(String(row.slug), {
      slug: row.slug,
      title: row.title,
      overview: row.overview || "",
      posterUrl: row.poster_url || "",
      backdropUrl: row.backdrop_url || "",
      category: row.category || "",
      titleCount: Number(row.title_count || 0),
      movieCount: Number(row.movie_count || 0),
      tvCount: Number(row.tv_count || 0),
      latestReleaseDate: row.latest_release_date || undefined,
    });
  }

  for (const seed of curatedCollectionSearchSeeds) {
    const searchable = [seed.title, seed.category, ...seed.keywords].join(" ").toLowerCase();
    if (!terms.some((term) => searchable.includes(term)) || bySlug.has(seed.slug)) continue;
    bySlug.set(seed.slug, {
      slug: seed.slug,
      title: seed.title,
      overview: "",
      posterUrl: "",
      backdropUrl: "",
      category: seed.category,
      titleCount: 0,
      movieCount: 0,
      tvCount: 0,
    });
  }

  return [...bySlug.values()].slice(0, MAX_COLLECTION_RESULTS);
}

async function safeRows(query: Promise<any[]>) {
  try {
    return await query;
  } catch (error) {
    const message = error instanceof Error ? error.message : String((error as any)?.message || "");
    if (message.includes("does not exist") || message.includes("relation") || message.includes("column")) return [];
    throw error;
  }
}

async function searchActors(sql: any, query: string) {
  const rows = await sql`
    select tmdb_id, name, profile_url, known_for_department, popularity, source_payload
    from people
    where tmdb_id is not null
      and name ilike ${`%${query}%`}
    order by
      case
        when lower(name) = lower(${query}) then 0
        when lower(name) like lower(${`${query}%`}) then 1
        else 2
      end,
      popularity desc nulls last,
      updated_at desc
    limit ${MAX_ACTOR_RESULTS}
  `;
  const catalogActors = rows.map((row: any) => ({
    tmdbId: row.tmdb_id,
    name: row.name,
    profileUrl: row.profile_url || undefined,
    knownForDepartment: row.known_for_department || undefined,
    knownFor: Array.isArray(row.source_payload?.knownFor) ? row.source_payload.knownFor : [],
    popularity: Number(row.popularity || 0),
  }));

  try {
    const freshActors = await fetchTmdbPersonSearch(query);
    const seen = new Set<string>();
    return [...catalogActors, ...freshActors]
      .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))
      .filter((actor) => {
        const key = String(actor.tmdbId);
        const nameKey = normalizeSearchText(actor.name || "");
        if (!actor.tmdbId || seen.has(key) || seen.has(`name:${nameKey}`)) return false;
        seen.add(key);
        if (nameKey) seen.add(`name:${nameKey}`);
        return true;
      })
      .slice(0, MAX_ACTOR_RESULTS);
  } catch (error) {
    console.error("discovery_actor_search_fallback", error instanceof Error ? error.message : "Actor search failed.");
    return catalogActors.slice(0, MAX_ACTOR_RESULTS);
  }
}

async function prioritizeTitlesByAvailability(sql: any, titles: any[], region: string, providerIds: string[]) {
  if (!titles.length || providerIds.length === 0) {
    return { titles, matches: {}, prioritized: false };
  }

  await ensureProviderAvailabilityTables(sql);
  const wantedKeys = new Set(titles.map((title) => `${title.mediaType || "movie"}-${title.tmdbId}`));
  const rows = await sql`
    select
      media_type,
      tmdb_id,
      array_agg(distinct provider_name order by provider_name) as provider_names
    from title_availability
    where region = ${region}
      and expires_at > now()
      and provider_id = any(${providerIds})
    group by media_type, tmdb_id
  `;
  const matches: Record<string, string[]> = {};
  for (const row of rows) {
    const key = `${row.media_type || "movie"}-${row.tmdb_id}`;
    if (wantedKeys.has(key)) {
      matches[key] = Array.isArray(row.provider_names) ? row.provider_names.filter(Boolean) : [];
    }
  }

  return {
    titles: [...titles].sort((a, b) => Number(Boolean(matches[`${b.mediaType || "movie"}-${b.tmdbId}`])) - Number(Boolean(matches[`${a.mediaType || "movie"}-${a.tmdbId}`]))),
    matches,
    prioritized: true,
  };
}

export default async function handler(request: any, response: any) {
  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  try {
    const query = firstQueryValue(request.query.q).trim();
    const availableOnMyServices = firstQueryValue(request.query.availableOnMyServices) === "true";
    const availabilityRegion = normalizeRegion(request.query.region);
    const preferredProviders = preferredProvidersFromQuery(request.query.providers);
    if (!query) {
      return sendJson(response, 200, {
        query,
        titles: [],
        playlists: [],
        profiles: [],
        collections: [],
        hubs: [],
        actors: [],
        titleSource: "empty",
      });
    }

    const sql = db();
    await checkRateLimit(sql, request, "discovery:search", undefined, 60, 60);
    await ensureUserProfilesTable(sql);
    await ensurePlaylistFollowsTable(sql);
    await ensurePlaylistLikesTable(sql);
    await ensureUserFollowsTable(sql);
    await ensureTmdbCacheTables(sql);
    await ensureDirectorSeed(sql).catch((error) => {
      console.error("director_seed_failed", error instanceof Error ? error.message : "Director seed failed");
    });

    const user = await getCurrentUser(sql, request);
    const alternateQueries = alternateTitleSearchQueries(query);
    const [titleResults, alternateTitleResults, seedTitles, playlists, profiles, collections, actors] = await Promise.all([
      searchTitles(sql, query),
      Promise.all(alternateQueries.map((alternateQuery) => searchTitles(sql, alternateQuery))),
      searchBroadSeedTitles(sql, query),
      searchPublicPlaylists(sql, query, user?.id),
      searchProfiles(sql, query),
      searchCollections(sql, query),
      searchActors(sql, query),
    ]);
    const personTitles = actors.length > 0 && seedTitles.length === 0 ? await titleResultsForPerson(sql, actors, query) : [];
    const expandedTitleItems = mergeTitleResults(titleResults.items, alternateTitleResults.flatMap((result) => result.items || []));
    const mergedTitles = mergeTitleResults(seedTitles, mergeTitleResults(personTitles, expandedTitleItems));
    const hubs = searchHubs(query);
    const availability = availableOnMyServices
      ? await prioritizeTitlesByAvailability(sql, mergedTitles, availabilityRegion, preferredProviders).catch((error) => {
        console.error("discovery_availability_prioritization_failed", error instanceof Error ? error.message : "Availability prioritization failed.");
        return { titles: mergedTitles, matches: {}, prioritized: false };
      })
      : { titles: mergedTitles, matches: {}, prioritized: false };

    response.setHeader("X-Flim-Discovery-Titles", titleResults.source);
    return sendJson(response, 200, {
      query,
      titles: availability.titles,
      playlists,
      profiles,
      collections,
      hubs,
      actors,
      availabilityMatches: availability.matches,
      availabilityPrioritized: availability.prioritized,
      titleSource: titleResults.source,
    });
  } catch (error) {
    console.error("discovery_search_failed", error instanceof Error ? error.message : "Discovery search failed.");
    return sendJson(response, errorStatus(error), { error: error instanceof Error ? error.message : "Discovery search failed. Please try again." });
  }
}
