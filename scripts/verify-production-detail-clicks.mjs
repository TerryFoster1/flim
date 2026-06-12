import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const baseUrl = process.env.FLIM_BASE_URL || "https://www.flim.ca";
const limit = Number(process.env.FLIM_VERIFY_LIMIT || 20);
const chromePath = process.env.CHROME_PATH || [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find((candidate) => existsSync(candidate));
const playwrightPackage = [
  process.env.PLAYWRIGHT_CORE_PACKAGE,
  path.join(process.cwd(), "node_modules", "playwright-core", "package.json"),
  path.join(os.tmpdir(), "flim-playwright-core", "node_modules", "playwright-core", "package.json"),
].filter(Boolean).find((candidate) => existsSync(candidate));

if (!chromePath) {
  throw new Error("Chrome or Edge was not found. Set CHROME_PATH to run production UI verification.");
}
if (!playwrightPackage) {
  throw new Error("playwright-core was not found. Install with: npm.cmd install playwright-core --prefix %TEMP%\\flim-playwright-core");
}

const require = createRequire(playwrightPackage);
const { chromium } = require("playwright-core");

const movieQueries = [
  "Back to the Future",
  "Star Wars",
  "Indiana Jones",
  "Jurassic Park",
  "Mission Impossible",
  "Children of Men",
  "The Day After Tomorrow",
  "Interstellar",
  "Dune",
  "The Matrix",
  "Alien",
  "Blade Runner",
  "The Lord of the Rings",
  "Harry Potter",
  "Toy Story",
  "The Avengers",
  "The Dark Knight",
  "Top Gun",
  "Ghostbusters",
  "Mad Max",
];

const tvQueries = [
  "The Office",
  "Silo",
  "Fallout",
  "The Last of Us",
  "Severance",
  "Stranger Things",
  "Friends",
  "Frasier",
  "The Bear",
  "Parks and Recreation",
  "Brooklyn Nine-Nine",
  "The Simpsons",
  "Breaking Bad",
  "The Sopranos",
  "The X-Files",
  "Lost",
  "Game of Thrones",
  "The Expanse",
  "Foundation",
  "For All Mankind",
  "The Mandalorian",
  "Wednesday",
  "House",
  "Doctor Who",
  "Sherlock",
  "Black Mirror",
  "The Boys",
  "Westworld",
  "Yellowstone",
  "Succession",
  "Better Call Saul",
  "Ted Lasso",
  "The Crown",
  "The Witcher",
  "Dark",
  "Arcane",
  "Loki",
  "Andor",
];

async function waitForDetail(page, expectedType, source) {
  try {
    await page.waitForFunction(
      ({ expectedType: type }) => {
        const body = document.body?.innerText || "";
        const path = location.pathname;
        const h1 = document.querySelector("h1")?.textContent?.trim() || "";
        const fallback = /Details are taking longer than expected\.|Details unavailable\./i.test(body);
        const slowPending = /Details are taking longer than expected\. Still loading/i.test(body);
        const expectedRoute = type === "tv" ? path.startsWith("/tv/") : path.startsWith("/movies/");
        return expectedRoute && h1 && !/details/i.test(h1) && !fallback && !slowPending;
      },
      { expectedType },
      { timeout: 65000 },
    );
  } catch {
    // Fall through to the structured result below.
  }

  return page.evaluate(({ expectedType: type, sourceLabel }) => {
    const body = document.body?.innerText || "";
    const path = location.pathname;
    const h1 = document.querySelector("h1")?.textContent?.trim() || "";
    const fallback = /Details are taking longer than expected\.|Details unavailable\./i.test(body);
    const slowPending = /Details are taking longer than expected\. Still loading/i.test(body);
    const expectedRoute = type === "tv" ? path.startsWith("/tv/") : path.startsWith("/movies/");
    const castCount = document.querySelectorAll(".cast-member-card").length;
    const ok = Boolean(expectedRoute && h1 && !/details/i.test(h1) && !fallback && !slowPending);
    return {
      ok,
      source: sourceLabel,
      expectedType: type,
      url: location.href,
      h1,
      fallback,
      slowPending,
      castCount,
      body: ok ? undefined : body.slice(0, 1600),
    };
  }, { expectedType, sourceLabel: source });
}

async function runDiscoverySearchClick(page, query, mediaType) {
  await page.goto(`${baseUrl}/discover`, { waitUntil: "domcontentloaded" });
  await page.locator(".discover-search-form input[type='search']").waitFor({ timeout: 30000 });
  await page.locator(".discover-search-form input[type='search']").fill(query);
  await page.locator(".discover-search-form button[type='submit']").click();
  const heading = mediaType === "tv" ? "TV Shows" : "Movies";
  const section = page.locator(".discovery-results-section").filter({ has: page.locator("h2", { hasText: heading }) });
  try {
    await section.locator(".discovery-title-card button").first().waitFor({ timeout: 45000 });
  } catch {
    return { skipped: true, ok: false, source: `discovery:${query}`, expectedType: mediaType, reason: `No ${heading} result`, url: page.url() };
  }
  await section.locator(".discovery-title-card button").first().click();
  return waitForDetail(page, mediaType, `discovery:${query}`);
}

async function collectPlaylistUrls(page) {
  await page.goto(`${baseUrl}/public`, { waitUntil: "domcontentloaded" });
  await page.locator(".playlist-card-button").first().waitFor({ timeout: 45000 });
  const count = Math.min(await page.locator(".playlist-card-button").count(), 12);
  const urls = [];
  for (let index = 0; index < count; index += 1) {
    await page.goto(`${baseUrl}/public`, { waitUntil: "domcontentloaded" });
    await page.locator(".playlist-card-button").nth(index).click();
    await page.waitForFunction(() => /\/p\/|\/playlists\//.test(location.pathname), undefined, { timeout: 20000 }).catch(() => undefined);
    if (/\/p\/|\/playlists\//.test(new URL(page.url()).pathname)) urls.push(page.url());
  }
  return [...new Set(urls)];
}

async function runPlaylistMovieClicks(page, playlistUrls) {
  const results = [];
  const seen = new Set();
  for (const playlistUrl of playlistUrls) {
    if (results.length >= limit) break;
    await page.goto(playlistUrl, { waitUntil: "domcontentloaded" });
    await page.locator(".poster-card-button").first().waitFor({ timeout: 30000 }).catch(() => undefined);
    const count = Math.min(await page.locator(".poster-card-button").count(), 12);
    for (let index = 0; index < count; index += 1) {
      if (results.length >= limit) break;
      await page.goto(playlistUrl, { waitUntil: "domcontentloaded" });
      await page.locator(".poster-card-button").nth(index).waitFor({ timeout: 30000 });
      await page.locator(".poster-card-button").nth(index).click();
      const result = await waitForDetail(page, "movie", `playlist:${playlistUrl}#${index}`);
      if (!seen.has(result.url)) {
        seen.add(result.url);
        results.push(result);
      }
    }
  }
  return results;
}

function assertResults(label, results, expectedCount) {
  const failures = results.filter((result) => !result.ok);
  const missingCast = results.filter((result) => result.ok && result.castCount === 0);
  if (results.length < expectedCount) {
    throw new Error(`${label} completed ${results.length}/${expectedCount} clicks.`);
  }
  if (failures.length) {
    throw new Error(`${label} had ${failures.length} failed clicks: ${JSON.stringify(failures.slice(0, 3), null, 2)}`);
  }
  if (missingCast.length) {
    throw new Error(`${label} had ${missingCast.length} pages with no cast cards: ${JSON.stringify(missingCast.slice(0, 3), null, 2)}`);
  }
}

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  deviceScaleFactor: 3,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});
const events = [];
page.on("console", (message) => {
  const text = message.text();
  if (/title_details|tmdb_client|details unavailable|failed|error/i.test(text)) {
    events.push({ type: message.type(), text });
  }
});
page.on("response", (response) => {
  if (response.url().includes("/api/movies/")) {
    events.push({ type: "response", url: response.url(), status: response.status() });
  }
});

try {
  const movieSearch = [];
  for (const query of movieQueries) {
    if (movieSearch.length >= limit) break;
    console.log(`movie-search ${movieSearch.length + 1}/${limit}: ${query}`);
    const result = await runDiscoverySearchClick(page, query, "movie");
    if (!result.skipped) movieSearch.push(result);
  }

  const tvSearch = [];
  for (const query of tvQueries) {
    if (tvSearch.length >= limit) break;
    console.log(`tv-search ${tvSearch.length + 1}/${limit}: ${query}`);
    const result = await runDiscoverySearchClick(page, query, "tv");
    if (!result.skipped) tvSearch.push(result);
    else console.log(`skipped ${query}: ${result.reason}`);
  }

  console.log("collecting public playlist URLs");
  const playlistUrls = await collectPlaylistUrls(page);
  const playlistMovieClicks = await runPlaylistMovieClicks(page, playlistUrls);

  assertResults("Movie discovery search", movieSearch, limit);
  assertResults("TV discovery search", tvSearch, limit);
  assertResults("Playlist movie clicks", playlistMovieClicks, limit);

  console.log(JSON.stringify({
    ok: true,
    baseUrl,
    viewport: "390x844 mobile",
    counts: {
      movieSearch: movieSearch.length,
      tvSearch: tvSearch.length,
      playlistMovieClicks: playlistMovieClicks.length,
    },
    samples: {
      movieSearch: movieSearch.slice(0, 5).map(({ h1, url, castCount }) => ({ h1, url, castCount })),
      tvSearch: tvSearch.slice(0, 5).map(({ h1, url, castCount }) => ({ h1, url, castCount })),
      playlistMovieClicks: playlistMovieClicks.slice(0, 5).map(({ h1, url, castCount }) => ({ h1, url, castCount })),
    },
    events: events.slice(-80),
  }, null, 2));
} finally {
  await browser.close();
}
