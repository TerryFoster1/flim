import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`cache guardrail failed: ${message}`);
    process.exitCode = 1;
  }
}

const policy = read("api/_cachePolicy.ts");
const discovery = read("api/discovery/search.ts");
const movies = read("api/movies/[...movie].ts");
const providers = read("api/_providers.ts");
const availability = read("api/providers/availability.ts");
const docs = read("docs/database-first-cache-guardrails.md");
const packageJson = read("package.json");

assert(policy.includes('"tmdb_search"'), "tmdb_search policy is missing");
assert(policy.includes('"provider_availability"'), "provider availability policy is missing");
assert(policy.includes("externalFanoutLimit: 2"), "TMDb external search fanout cap changed or missing");
assert(policy.includes("platform") && policy.includes("client") && policy.includes("device"), "shared cache key must ignore platform-specific labels");
for (const label of ["CACHE_HIT", "CACHE_MISS", "CACHE_STALE", "EXTERNAL_FETCH", "EXTERNAL_GENERATION", "BACKGROUND_REFRESH"]) {
  assert(policy.includes(label), `${label} observability label is missing`);
}
assert(policy.includes("diagnosticCaller"), "caller/platform must remain diagnostic-only metadata");

assert(discovery.includes("limitExternalFanout(\"tmdb_search\""), "discovery alternate searches must use the fanout guardrail");
assert(discovery.includes("cacheHeader(\"discovery_search\")"), "discovery route must use shared response cache policy");
assert(movies.includes("cacheDays(\"tmdb_search\")"), "movie search TTL must come from shared policy");
assert(movies.includes("cacheHeader(\"tmdb_title\")"), "movie details cache header must come from shared policy");
assert(providers.includes("cacheDays(\"provider_availability\")"), "provider DB TTL must come from shared policy");
assert(availability.includes("cacheHeader(\"provider_availability\")"), "provider availability route must use shared cache header");

assert(docs.includes("Do not call TMDb, OpenAI, Watchmode"), "database-first guardrail docs are missing provider-call rule");
assert(docs.includes("web, Android, and future iOS"), "shared cache documentation must cover all clients");
assert(docs.includes("caller metadata is diagnostic only"), "docs must state caller metadata cannot fragment cache keys");
assert(packageJson.includes("\"test:shared-cache\""), "shared cache architecture test script is missing");

if (!process.exitCode) {
  console.log("cache guardrail checks passed");
}
