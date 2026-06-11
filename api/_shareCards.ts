import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type ShareCardKind = "playlist" | "trailer" | "countdown" | "game" | "profile" | "title";

export interface ShareCardPoster {
  url?: string;
  label?: string;
}

export interface ShareCardData {
  kind: ShareCardKind;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  description?: string;
  cta?: string;
  urlLabel?: string;
  posterUrl?: string;
  backdropUrl?: string;
  avatarUrl?: string;
  posters?: ShareCardPoster[];
  badge?: string;
  statLine?: string;
}

export interface MetaData {
  title: string;
  description: string;
  url: string;
  image: string;
  type?: string;
}

export function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function escapeXml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function truncate(value = "", maxLength: number) {
  const clean = String(value || "").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trim()}...` : clean;
}

export function absoluteUrl(path: string, request?: any) {
  if (/^https?:\/\//i.test(path)) return path;
  const host = request?.headers?.host || "www.flim.ca";
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}${path.startsWith("/") ? path : `/${path}`}`;
}

function svgText(value: string, x: number, y: number, size: number, weight = 800, fill = "#ffffff") {
  return `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(value)}</text>`;
}

function posterTile(url: string | undefined, x: number, y: number, width: number, height: number, rotate = 0, id = "poster") {
  if (!url) {
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" />`;
  }

  const clipId = `${id}-${x}-${y}`.replace(/[^a-zA-Z0-9_-]/g, "");
  return `
    <g transform="rotate(${rotate} ${x + width / 2} ${y + height / 2})">
      <clipPath id="${clipId}">
        <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" />
      </clipPath>
      <image href="${escapeXml(url)}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clipId})" />
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="24" fill="none" stroke="rgba(255,255,255,0.2)" />
    </g>
  `;
}

function avatar(url: string | undefined, x: number, y: number) {
  if (!url) {
    return `<circle cx="${x + 72}" cy="${y + 72}" r="72" fill="#ffb84d" opacity="0.94" /><text x="${x + 72}" y="${y + 95}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="70" font-weight="900" fill="#110509">F</text>`;
  }
  return `
    <clipPath id="avatar-clip"><circle cx="${x + 72}" cy="${y + 72}" r="72" /></clipPath>
    <image href="${escapeXml(url)}" x="${x}" y="${y}" width="144" height="144" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip)" />
    <circle cx="${x + 72}" cy="${y + 72}" r="72" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="2" />
  `;
}

function background(data: ShareCardData) {
  const image = data.backdropUrl || data.posterUrl;
  return `
    <defs>
      <linearGradient id="flim-bg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stop-color="#16050c" />
        <stop offset="54%" stop-color="#07070d" />
        <stop offset="100%" stop-color="#1b0d0f" />
      </linearGradient>
      <radialGradient id="flim-warm" cx="14%" cy="14%" r="72%">
        <stop offset="0%" stop-color="#ffb84d" stop-opacity="0.32" />
        <stop offset="56%" stop-color="#ff4f6d" stop-opacity="0.12" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#flim-bg)" />
    ${image ? `<image href="${escapeXml(image)}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" opacity="0.24" />` : ""}
    <rect width="1200" height="630" fill="url(#flim-warm)" />
    <rect width="1200" height="630" fill="rgba(0,0,0,0.42)" />
    <circle cx="1060" cy="90" r="290" fill="#ff4f6d" opacity="0.10" />
    <circle cx="1030" cy="540" r="250" fill="#ffb84d" opacity="0.10" />
  `;
}

function brand() {
  return `
    <g transform="translate(76 66)">
      <rect x="0" y="0" width="72" height="72" rx="18" fill="#ffb84d" />
      <text x="36" y="48" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="42" font-weight="900" fill="#130508">F</text>
      <text x="92" y="49" font-family="Arial, Helvetica, sans-serif" font-size="40" font-weight="900" fill="#fff3db">Flim</text>
    </g>
  `;
}

function cta(data: ShareCardData) {
  const ctaText = data.cta || "Open on Flim";
  return `
    <g transform="translate(76 520)">
      <rect x="0" y="0" width="300" height="58" rx="29" fill="#ffb84d" />
      <text x="150" y="38" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="900" fill="#130508">${escapeXml(ctaText)}</text>
      ${data.urlLabel ? `<text x="328" y="38" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#d9d1c7">${escapeXml(data.urlLabel)}</text>` : ""}
    </g>
  `;
}

export function renderShareCard(data: ShareCardData) {
  const title = truncate(data.title || "Flim", 42);
  const subtitle = truncate(data.subtitle || "", 64);
  const description = truncate(data.description || "", 92);
  const posters = (data.posters || []).slice(0, 4);
  const primaryPoster = data.posterUrl || posters[0]?.url;

  const artwork = data.kind === "profile"
    ? `
      ${avatar(data.avatarUrl, 808, 92)}
      ${posterTile(posters[0]?.url, 720, 294, 120, 180, -4, "profile0")}
      ${posterTile(posters[1]?.url, 850, 282, 120, 180, 3, "profile1")}
      ${posterTile(posters[2]?.url, 980, 294, 120, 180, -2, "profile2")}
    `
    : data.kind === "playlist"
      ? `
        ${posterTile(posters[0]?.url, 700, 88, 160, 238, -5, "p0")}
        ${posterTile(posters[1]?.url, 870, 62, 160, 238, 6, "p1")}
        ${posterTile(posters[2]?.url, 780, 324, 160, 238, 4, "p2")}
        ${posterTile(posters[3]?.url, 960, 294, 160, 238, -4, "p3")}
      `
      : posterTile(primaryPoster, 805, 96, 250, 374, 3, "single");

  const gameAccent = data.kind === "game" ? `<text x="805" y="510" font-family="Arial, Helvetica, sans-serif" font-size="86" font-weight="900" fill="#ffb84d" opacity="0.92">?</text>` : "";
  const playAccent = data.kind === "trailer" ? `<circle cx="930" cy="284" r="58" fill="#ff4f6d" opacity="0.94" /><polygon points="912,250 912,318 972,284" fill="#fff8eb" />` : "";
  const badge = data.badge ? `<rect x="76" y="164" width="${Math.min(520, 32 + data.badge.length * 15)}" height="42" rx="21" fill="rgba(255,184,77,0.18)" stroke="rgba(255,184,77,0.42)" /><text x="96" y="192" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="900" fill="#ffd28d">${escapeXml(truncate(data.badge, 34))}</text>` : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  ${background(data)}
  ${artwork}
  ${playAccent}
  ${gameAccent}
  <rect x="0" y="0" width="1200" height="630" fill="rgba(0,0,0,0.08)" />
  ${brand()}
  ${badge}
  <g transform="translate(76 254)">
    ${data.eyebrow ? svgText(truncate(data.eyebrow, 40), 0, -50, 24, 900, "#ffcf8a") : ""}
    ${svgText(title, 0, 0, 70, 900, "#ffffff")}
    ${subtitle ? svgText(subtitle, 0, 58, 31, 800, "#ffd79b") : ""}
    ${data.statLine ? svgText(truncate(data.statLine, 68), 0, 114, 28, 800, "#f6e8d9") : ""}
    ${description ? `<text x="0" y="${data.statLine ? 164 : 122}" font-family="Arial, Helvetica, sans-serif" font-size="25" fill="#d9d1c7">${escapeXml(description)}</text>` : ""}
  </g>
  ${cta(data)}
</svg>`;
}

export function fallbackShareCard(kind: ShareCardKind = "title") {
  return renderShareCard({
    kind,
    title: "Flim",
    subtitle: "Movie and TV discovery",
    description: "Create, share, and discover movie and TV playlists.",
    cta: "Open Flim",
    urlLabel: "flim.ca",
  });
}

export function sendSvg(response: any, svg: string) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  response.end(svg);
}

export async function getBuiltIndexHtml(request: any) {
  const host = request.headers?.host;
  if (host) {
    try {
      const protocol = host.includes("localhost") ? "http" : "https";
      const result = await fetch(`${protocol}://${host}/index.html`);
      if (result.ok) return result.text();
    } catch {
      // Local file lookup below handles serverless and local build contexts.
    }
  }

  const candidates = [
    join(process.cwd(), "client", "dist", "index.html"),
    join(process.cwd(), "dist", "index.html"),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return readFileSync(found, "utf8");

  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Flim</title></head><body><div id="root"></div></body></html>`;
}

export function injectMeta(indexHtml: string, meta: MetaData) {
  const replacement = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="${escapeHtml(meta.type || "website")}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />`,
  ].join("\n    ");

  const cleaned = indexHtml
    .replace(/<title>.*?<\/title>/s, "")
    .replace(/\s*<meta name="description"[^>]*>\s*/g, "\n")
    .replace(/\s*<meta property="og:[^"]+"[^>]*>\s*/g, "\n")
    .replace(/\s*<meta name="twitter:[^"]+"[^>]*>\s*/g, "\n");

  return cleaned.replace("</head>", `    ${replacement}\n  </head>`);
}
