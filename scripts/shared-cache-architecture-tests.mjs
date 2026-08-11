import assert from "node:assert/strict";

const PLATFORM_KEYS = new Set(["platform", "client", "device", "caller"]);

function sharedCacheKey(namespace, parts) {
  const stableEntries = Object.entries(parts)
    .filter(([key, value]) => value !== undefined && value !== null && !PLATFORM_KEYS.has(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return `${namespace}:${stableEntries.map(([key, value]) => `${key}=${String(value).trim().toLowerCase()}`).join("|")}`;
}

class SharedFlimCache {
  constructor() {
    this.titles = new Map();
    this.people = new Map();
    this.availability = new Map();
    this.triviaPacks = new Map();
    this.reusableQuestions = new Map();
    this.inFlightTrivia = new Map();
    this.externalCalls = {
      tmdbTitle: 0,
      tmdbPerson: 0,
      providerAvailability: 0,
      triviaGeneration: 0,
    };
  }

  async getTitle({ tmdbId, mediaType = "movie", caller = "web" }) {
    const key = sharedCacheKey("movie", { tmdbId, mediaType, caller });
    if (this.titles.has(key)) return { ...this.titles.get(key), cache: "hit", caller };

    this.externalCalls.tmdbTitle += 1;
    const record = { id: key, tmdbId, mediaType, title: `Title ${tmdbId}` };
    this.titles.set(key, record);
    return { ...record, cache: "miss", caller };
  }

  async getPerson({ tmdbId, caller = "web" }) {
    const key = sharedCacheKey("person", { tmdbId, caller });
    if (this.people.has(key)) return { ...this.people.get(key), cache: "hit", caller };

    this.externalCalls.tmdbPerson += 1;
    const record = { id: key, tmdbId, name: `Person ${tmdbId}` };
    this.people.set(key, record);
    return { ...record, cache: "miss", caller };
  }

  async getProviderAvailability({ tmdbId, mediaType = "movie", region = "CA", caller = "android" }) {
    const key = sharedCacheKey("availability", { tmdbId, mediaType, region, caller });
    if (this.availability.has(key)) return { ...this.availability.get(key), cache: "hit", caller };

    this.externalCalls.providerAvailability += 1;
    const record = { id: key, tmdbId, mediaType, region, providers: ["Example+"] };
    this.availability.set(key, record);
    return { ...record, cache: "miss", caller };
  }

  seedReusableQuestions(titleKey, count) {
    this.reusableQuestions.set(titleKey, Array.from({ length: count }, (_, index) => ({
      id: `${titleKey}:question:${index + 1}`,
      question: `Question ${index + 1}`,
    })));
  }

  async getTriviaPack({ tmdbId, mediaType = "movie", questionCount = 25, caller = "web" }) {
    const key = sharedCacheKey("trivia", { tmdbId, mediaType, questionCount, caller });
    if (this.triviaPacks.has(key)) return { ...this.triviaPacks.get(key), cache: "hit", caller };

    const reusable = this.reusableQuestions.get(key) || [];
    if (reusable.length >= questionCount) {
      const pack = { id: `${key}:pack`, questionIds: reusable.slice(0, questionCount).map((question) => question.id) };
      this.triviaPacks.set(key, pack);
      return { ...pack, cache: "built_from_reusable_questions", caller };
    }

    if (!this.inFlightTrivia.has(key)) {
      this.inFlightTrivia.set(key, (async () => {
        this.externalCalls.triviaGeneration += 1;
        const questions = Array.from({ length: questionCount }, (_, index) => ({
          id: `${key}:generated:${index + 1}`,
          question: `Generated question ${index + 1}`,
        }));
        this.reusableQuestions.set(key, questions);
        const pack = { id: `${key}:pack`, questionIds: questions.map((question) => question.id) };
        this.triviaPacks.set(key, pack);
        return pack;
      })().finally(() => this.inFlightTrivia.delete(key)));
    }

    const pack = await this.inFlightTrivia.get(key);
    return { ...pack, cache: "generated_or_joined", caller };
  }
}

async function run() {
  const cache = new SharedFlimCache();

  assert.equal(
    sharedCacheKey("movie", { tmdbId: 123, mediaType: "movie", caller: "web" }),
    sharedCacheKey("movie", { tmdbId: 123, mediaType: "movie", caller: "android", platform: "android", device: "pixel" }),
    "platform labels must not fragment title cache identity",
  );
  assert.notEqual(
    sharedCacheKey("availability", { tmdbId: 123, mediaType: "movie", region: "CA", caller: "android" }),
    sharedCacheKey("availability", { tmdbId: 123, mediaType: "movie", region: "US", caller: "web" }),
    "region must remain part of provider availability identity",
  );

  const webTitle = await cache.getTitle({ tmdbId: 105, caller: "web" });
  const androidTitle = await cache.getTitle({ tmdbId: 105, caller: "android" });
  assert.equal(webTitle.id, androidTitle.id, "web-populated title should be shared with Android");
  assert.equal(cache.externalCalls.tmdbTitle, 1, "Android title read should not call TMDb after web populated cache");

  const androidFirst = await cache.getTitle({ tmdbId: 550, caller: "android" });
  const webSecond = await cache.getTitle({ tmdbId: 550, caller: "web" });
  assert.equal(androidFirst.id, webSecond.id, "Android-populated title should be shared with web");
  assert.equal(cache.externalCalls.tmdbTitle, 2, "web title read should not call TMDb after Android populated cache");

  const firstRefresh = await cache.getTitle({ tmdbId: 550, caller: "web" });
  const secondRefresh = await cache.getTitle({ tmdbId: 550, caller: "web" });
  assert.equal(firstRefresh.cache, "hit", "repeated title refresh should hit cache");
  assert.equal(secondRefresh.cache, "hit", "second repeated title refresh should hit cache");
  assert.equal(cache.externalCalls.tmdbTitle, 2, "repeated refreshes should not call TMDb while cache is valid");

  const webTrivia = await cache.getTriviaPack({ tmdbId: 105, questionCount: 25, caller: "web" });
  const androidTrivia = await cache.getTriviaPack({ tmdbId: 105, questionCount: 25, caller: "android" });
  assert.deepEqual(webTrivia.questionIds, androidTrivia.questionIds, "trivia packs should share stored question IDs across clients");
  assert.equal(cache.externalCalls.triviaGeneration, 1, "Android trivia read should not generate after web populated pack");

  const reusableKey = sharedCacheKey("trivia", { tmdbId: 999, mediaType: "movie", questionCount: 25 });
  cache.seedReusableQuestions(reusableKey, 25);
  const reusablePack = await cache.getTriviaPack({ tmdbId: 999, questionCount: 25, caller: "web" });
  assert.equal(reusablePack.cache, "built_from_reusable_questions", "incomplete pack should be rebuilt from reusable stored questions first");
  assert.equal(cache.externalCalls.triviaGeneration, 1, "reusable stored questions should not trigger trivia generation");

  const concurrent = await Promise.all(
    Array.from({ length: 10 }, () => cache.getTriviaPack({ tmdbId: 777, questionCount: 25, caller: "android" })),
  );
  assert.equal(new Set(concurrent.map((pack) => pack.id)).size, 1, "concurrent trivia requests should join one pack");
  assert.equal(cache.externalCalls.triviaGeneration, 2, "ten concurrent uncached title requests should create one generation job");

  const androidAvailability = await cache.getProviderAvailability({ tmdbId: 105, region: "CA", caller: "android" });
  const webAvailability = await cache.getProviderAvailability({ tmdbId: 105, region: "CA", caller: "web" });
  assert.equal(androidAvailability.id, webAvailability.id, "provider availability should be shared across clients for the same region");
  assert.equal(cache.externalCalls.providerAvailability, 1, "web availability should not call provider after Android populated CA cache");

  await cache.getProviderAvailability({ tmdbId: 105, region: "US", caller: "web" });
  assert.equal(cache.externalCalls.providerAvailability, 2, "different region should be allowed to fetch different availability");

  const webPerson = await cache.getPerson({ tmdbId: 31, caller: "web" });
  const androidPerson = await cache.getPerson({ tmdbId: 31, caller: "android" });
  assert.equal(webPerson.id, androidPerson.id, "person records should be shared across clients");
  assert.equal(cache.externalCalls.tmdbPerson, 1, "Android person read should not call provider after web populated person cache");

  console.log("shared cache architecture checks passed");
  console.log(JSON.stringify(cache.externalCalls, null, 2));
}

run().catch((error) => {
  console.error("shared cache architecture checks failed");
  console.error(error);
  process.exitCode = 1;
});
