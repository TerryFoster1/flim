const baseUrl = (process.argv[2] || "https://www.flim.ca").replace(/\/$/, "");

const movieIds = [
  105, 9693, 435, 11, 603, 27205, 157336, 155, 680, 550,
  13, 120, 121, 122, 1891, 1892, 1893, 264660, 24428, 299536,
  299534, 19995, 597, 671, 278,
];

const tvIds = [
  2316, 1396, 1399, 66732, 60574, 76479, 82856, 95479, 94997, 100088,
  1429, 1418, 456, 1668, 4607, 19885, 60625, 46260, 88329, 615,
  1402, 1398, 71712, 93405, 764,
];

async function readJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function itemPath(item) {
  const mediaType = item.mediaType || item.media_type || "movie";
  return `/${mediaType === "tv" ? "tv" : "movies"}/${item.tmdbId}`;
}

async function checkDetails(mediaType, tmdbId, label, refreshMode) {
  const query = new URLSearchParams({ type: mediaType });
  if (refreshMode) {
    query.set("refreshMode", refreshMode);
    query.set("_ts", String(Date.now()));
  }
  const startedAt = Date.now();
  const { response, payload } = await readJson(`/api/movies/${tmdbId}?${query.toString()}`);
  const ok =
    response.ok &&
    Number(payload?.tmdbId) === Number(tmdbId) &&
    (payload?.mediaType || mediaType) === mediaType &&
    typeof payload?.title === "string" &&
    payload.title.trim().length > 0;

  return {
    label,
    route: `/${mediaType === "tv" ? "tv" : "movies"}/${tmdbId}`,
    mode: refreshMode || "default",
    status: response.status,
    ok,
    title: payload?.title,
    error: payload?.error,
    cache: response.headers.get("x-flim-cache"),
    catalog: response.headers.get("x-flim-catalog"),
    ms: Date.now() - startedAt,
  };
}

async function collectSourceCases() {
  const cases = [];

  const search = await readJson("/api/movies/search?q=sitcom&type=both");
  for (const item of (search.payload || []).slice(0, 6)) {
    cases.push({ label: "search:sitcom", mediaType: item.mediaType || "movie", tmdbId: item.tmdbId });
  }

  const publicPlaylist = await readJson("/api/public/playlists/directors-best-sci-fi-movies");
  for (const item of (publicPlaylist.payload?.movies || []).slice(0, 6)) {
    cases.push({ label: "public-playlist:directors-best-sci-fi", mediaType: item.mediaType || "movie", tmdbId: item.tmdbId });
  }

  const recommendations = await readJson("/api/recommendations?mediaType=movie&tmdbId=105");
  for (const item of (recommendations.payload?.recommendations || []).slice(0, 6)) {
    cases.push({ label: "recommendations:bttf", mediaType: item.mediaType || "movie", tmdbId: item.tmdbId });
  }

  const discovery = await readJson("/api/discovery/search?q=horror");
  for (const item of (discovery.payload?.titles || []).slice(0, 6)) {
    cases.push({ label: "discovery:horror", mediaType: item.mediaType || "movie", tmdbId: item.tmdbId });
  }

  cases.push({ label: "direct:children-of-men", mediaType: "movie", tmdbId: 9693 });
  cases.push({ label: "direct:day-after-tomorrow", mediaType: "movie", tmdbId: 435 });
  cases.push({ label: "direct:office", mediaType: "tv", tmdbId: 2316 });

  return cases;
}

async function checkPageRoute(path) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`);
  return {
    route: path,
    status: response.status,
    ok: response.ok,
    ms: Date.now() - startedAt,
  };
}

const details = [];
for (const id of movieIds) details.push(await checkDetails("movie", id, "movie-coverage"));
for (const id of tvIds) details.push(await checkDetails("tv", id, "tv-coverage"));

const sourceCases = await collectSourceCases();
const sourceResults = [];
for (const item of sourceCases) sourceResults.push(await checkDetails(item.mediaType, item.tmdbId, item.label));

const refreshResults = [];
for (const item of sourceCases.slice(0, 10)) {
  refreshResults.push(await checkDetails(item.mediaType, item.tmdbId, item.label, "cache-first"));
}

const pageRoutes = await Promise.all([
  checkPageRoute("/movies/9693"),
  checkPageRoute("/movies/435"),
  checkPageRoute("/tv/2316"),
  checkPageRoute(itemPath({ mediaType: sourceCases[0]?.mediaType, tmdbId: sourceCases[0]?.tmdbId })),
]);

const failures = [...details, ...sourceResults, ...refreshResults, ...pageRoutes].filter((result) => !result.ok);
const summary = {
  baseUrl,
  coverage: {
    detailApi: { total: details.length, passed: details.length - details.filter((result) => !result.ok).length },
    sourcePaths: { total: sourceResults.length, passed: sourceResults.length - sourceResults.filter((result) => !result.ok).length },
    refreshMode: { total: refreshResults.length, passed: refreshResults.length - refreshResults.filter((result) => !result.ok).length },
    pageRoutes: { total: pageRoutes.length, passed: pageRoutes.length - pageRoutes.filter((result) => !result.ok).length },
  },
  failures,
  samples: {
    details: details.slice(0, 8),
    sourceResults: sourceResults.slice(0, 8),
    refreshResults,
    pageRoutes,
  },
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0) process.exit(1);
