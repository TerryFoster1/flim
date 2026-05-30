/* Visual prototype navigation only. No APIs, persistence, search, roulette logic, or real movie data. */
const routeFallbacks = new Set(["/playlists/new", "/playlists/demo"]);
const tones = ["tone-red", "tone-blue", "tone-green", "tone-gold"];

function posterCard(index) {
  const tone = tones[index % tones.length];
  return `
    <article class="poster-card" tabindex="0" aria-label="Movie Title placeholder">
      <div class="poster ${tone}"></div>
      <div class="card-title">Movie Title</div>
      <div class="card-meta"><span>${1980 + index}</span><span>${90 + index * 4} min</span><span>Genre</span></div>
      <div class="provider-dots" aria-label="Provider icon placeholders"><span></span><span></span><span></span></div>
      <span class="status-pill">Watch status</span>
    </article>
  `;
}

function shelfMarkup(title) {
  return `
    <section class="shelf" aria-label="${title}">
      <div class="shelf-header"><div class="shelf-title">${title}</div><span class="eyebrow">Poster shelf</span></div>
      <div class="poster-row">${Array.from({ length: 8 }, (_, index) => posterCard(index)).join("")}</div>
    </section>
  `;
}

function hydratePlaceholders() {
  document.querySelectorAll("[data-shelf]").forEach((node) => {
    node.outerHTML = shelfMarkup(node.getAttribute("data-shelf") || "Poster Shelf");
  });
  document.querySelectorAll("[data-grid]").forEach((node) => {
    node.innerHTML = Array.from({ length: 12 }, (_, index) => posterCard(index)).join("");
  });
}

function normalizeRoute(hash) {
  const route = (hash || "#/").replace("#", "") || "/";
  if (routeFallbacks.has(route)) return "/playlists/:id";
  return route;
}

function showRoute() {
  const route = normalizeRoute(window.location.hash);
  const page = document.querySelector(`[data-page="${route}"]`) || document.querySelector('[data-page="/"]');
  document.querySelectorAll("[data-page]").forEach((node) => node.classList.remove("is-active"));
  page.classList.add("is-active");
  document.querySelectorAll("[data-route]").forEach((link) => {
    const linkRoute = link.getAttribute("data-route");
    link.classList.toggle("is-active", linkRoute === route || (route === "/playlists/:id" && linkRoute === "/playlists/:id"));
  });
  window.scrollTo({ top: 0, behavior: "instant" });
}

hydratePlaceholders();
window.addEventListener("hashchange", showRoute);
showRoute();
