import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = join(root, "client", "public", "backlot", "triceratops");
mkdirSync(outDir, { recursive: true });

// Generates the canonical TRICERATOPS PNG sprite sheet, object atlas, mock screenshot, and stage layers.
const palette = {
  ink: "#050407",
  outline: "#07110a",
  dino: "#52d875",
  dinoLight: "#91f2aa",
  dinoDark: "#1c6d3a",
  horn: "#fff3dc",
  gold: "#f5c16f",
  amber: "#ff8848",
  red: "#ff5a62",
  blue: "#91d8ff",
  pavement: "#191419",
  steel: "#46505a",
  wood: "#a96a30",
};

function svg(width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${body}</svg>`;
}

function r(x, y, w, h, fill, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" opacity="${opacity}"/>`;
}

function c(cx, cy, rx, ry, fill, opacity = 1) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" opacity="${opacity}"/>`;
}

function p(points, fill, opacity = 1) {
  return `<polygon points="${points}" fill="${fill}" opacity="${opacity}"/>`;
}

function dinoFrame(state, frame) {
  const jump = state === "jump";
  const smash = state === "smash";
  const hit = state === "hit";
  const ko = state === "knockout";
  const victory = state === "victory";
  const bob = state === "run" ? (frame % 2 === 0 ? 1 : -1) : 0;
  const legA = state === "run" ? ((frame % 3) - 1) * 2 : 0;
  const baseY = ko ? 44 : jump ? 32 : 38 + bob;
  const body = hit ? "#76efa0" : palette.dino;
  const headX = smash ? 44 + frame * 2 : 42;
  const headY = baseY - 19;
  if (ko) {
    return [
      c(29, 45, 20, 8, palette.outline),
      c(31, 42, 17, 8, palette.dinoDark),
      c(50, 35, 14, 10, palette.outline),
      c(51, 35, 12, 8, palette.dino),
      p("60,32 71,35 60,38", palette.horn),
      r(46, 32, 4, 4, palette.horn),
      r(53, 32, 4, 4, palette.horn),
      r(20, 48, 15, 4, "#223026"),
    ].join("");
  }
  const frontLeg = jump ? 44 : 40 + legA;
  const backLeg = jump ? 21 : 22 - legA;
  return [
    c(24, baseY - 7, 22, 13, palette.outline),
    c(27, baseY - 10, 20, 15, body),
    c(23, baseY - 13, 6, 4, palette.dinoLight),
    r(11, baseY - 7, 11, 7, palette.dinoDark),
    p(`8,${baseY - 8} 2,${baseY - 3} 11,${baseY}`, body),
    c(headX, headY, 15, 16, palette.outline),
    c(headX + 2, headY + 1, 13, 14, body),
    c(headX - 7, headY, 10, 17, palette.dinoDark),
    c(headX + 17, headY + 7, 11, 7, palette.outline),
    c(headX + 18, headY + 7, 9, 5, body),
    p(`${headX + 25},${headY + 4} ${headX + (smash ? 46 : 37)},${headY + 8} ${headX + 25},${headY + 10}`, palette.horn),
    p(`${headX + 7},${headY - 14} ${headX + 12},${headY - 1} ${headX + 3},${headY - 2}`, palette.horn),
    p(`${headX - 3},${headY - 11} ${headX + 2},${headY} ${headX - 7},${headY - 1}`, palette.horn),
    r(headX + 8, headY + 1, 3, 3, palette.ink),
    r(headX + 14, headY + 9, 7, 2, palette.ink),
    r(backLeg, baseY + 1, 8, jump ? 11 : 17, palette.outline),
    r(backLeg + 2, baseY + 2, 5, jump ? 9 : 15, body),
    r(frontLeg, baseY + 1, 8, jump ? 10 : 17, palette.outline),
    r(frontLeg + 2, baseY + 2, 5, jump ? 8 : 15, body),
    r(backLeg - 3, baseY + (jump ? 10 : 17), 14, 4, palette.dinoDark),
    r(frontLeg - 2, baseY + (jump ? 9 : 17), 14, 4, palette.dinoDark),
    smash ? r(headX + 42, headY + 5, 16 + frame * 2, 3, "#ffe8a9") + r(headX + 48, headY, 11, 2, palette.amber) : "",
    hit ? r(9, 7, 13, 4, palette.red) + r(25, 3, 8, 5, palette.red) + r(37, 8, 13, 4, palette.red) : "",
    victory ? r(61, 8 - frame, 5, 18, "#ffe8a9") + r(65, 5 - frame, 6, 6, palette.gold) : "",
  ].join("");
}

function dinoSheet() {
  const states = [
    ["idle", 2],
    ["run", 6],
    ["jump", 3],
    ["smash", 4],
    ["hit", 2],
    ["knockout", 2],
    ["victory", 3],
  ];
  let row = 0;
  const parts = [];
  for (const [state, frames] of states) {
    for (let frame = 0; frame < frames; frame += 1) {
      parts.push(`<g transform="translate(${frame * 80},${row * 64})">${dinoFrame(state, frame)}</g>`);
    }
    row += 1;
  }
  return svg(480, 448, parts.join(""));
}

function sceneMock() {
  return svg(960, 540, [
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11172b"/><stop offset=".55" stop-color="#231820"/><stop offset="1" stop-color="#07070a"/></linearGradient></defs>`,
    r(0, 0, 960, 540, "url(#sky)"),
    ...Array.from({ length: 44 }, (_, i) => c((i * 57) % 960, 48 + ((i * 31) % 126), 2, 2, i % 3 ? palette.gold : palette.blue, 0.8)),
    ...Array.from({ length: 12 }, (_, i) => r(i * 84, 210 - (i % 3) * 28, 58, 116 + (i % 3) * 28, "#211923")),
    ...Array.from({ length: 12 }, (_, i) => r(i * 84 + 10, 226 - (i % 3) * 28, 35, 7, palette.gold, 0.75)),
    r(0, 360, 960, 180, palette.pavement),
    ...Array.from({ length: 32 }, (_, i) => r(i * 34, 386 + (i % 2) * 12, 28, 3, "#3b3027")),
    `<g transform="translate(90,300) scale(2.2)">${dinoFrame("run", 2)}</g>`,
    `<g transform="translate(440,372) scale(2)">${propCamera()}</g>`,
    `<g transform="translate(650,382) scale(2)">${hazardCable()}</g>`,
    `<g transform="translate(780,322) scale(2.2)">${goldReel()}</g>`,
    r(18, 18, 250, 46, "rgba(5,4,7,.72)"),
    `<text x="34" y="49" fill="${palette.gold}" font-family="monospace" font-size="24" font-weight="900">SCORE 0000   HP HHH</text>`,
  ].join(""));
}

function propCamera() {
  return [
    r(2, 13, 28, 20, palette.ink),
    r(6, 9, 25, 18, palette.steel),
    r(31, 14, 11, 8, "#111318"),
    r(35, 16, 8, 4, palette.blue),
    r(11, 27, 5, 9, "#6a5242"),
    r(25, 27, 5, 9, "#6a5242"),
    r(10, 4, 14, 6, palette.gold),
  ].join("");
}

function propCrate() {
  return [
    r(2, 5, 34, 28, "#20140e"),
    r(6, 3, 29, 26, palette.wood),
    r(8, 7, 24, 4, palette.gold),
    r(10, 15, 19, 4, "#6a3e22"),
    r(6, 23, 29, 4, "#4a2b1a"),
  ].join("");
}

function breakawayWall() {
  return [
    r(4, 4, 42, 56, "#141018"),
    r(7, 2, 38, 54, "#5c5147"),
    ...Array.from({ length: 5 }, (_, i) => r(10, 9 + i * 10, 32, 2, "#221b1b")),
    ...Array.from({ length: 3 }, (_, i) => r(13 + i * 12, 7, 2, 45, "#221b1b")),
    r(13, 16, 22, 4, palette.gold),
  ].join("");
}

function hazardCable() {
  return [
    r(0, 12, 48, 6, palette.ink),
    r(5, 7, 34, 3, "#2b2f38"),
    r(26, 1, 4, 13, "#ffe8a9"),
    r(34, 4, 11, 5, palette.red),
    r(14, 0, 3, 9, palette.blue),
  ].join("");
}

function goldReel() {
  return [
    c(13, 13, 11, 11, "#7a451a"),
    c(14, 12, 10, 10, palette.gold),
    r(10, 7, 4, 4, palette.ink),
    r(17, 7, 4, 4, palette.ink),
    r(10, 15, 4, 4, palette.ink),
    r(17, 15, 4, 4, palette.ink),
  ].join("");
}

function wrapMarker() {
  return [
    r(15, 2, 5, 54, palette.gold),
    r(20, 4, 17, 20, palette.horn),
    r(20, 8, 17, 4, palette.red),
    r(20, 17, 17, 4, palette.ink),
  ].join("");
}

function objectAtlas() {
  const cells = [
    [r(1, 11, 38, 14, "#111318") + r(4, 5, 32, 14, palette.gold) + r(8, 9, 10, 6, palette.amber) + r(23, 9, 9, 6, palette.amber)],
    [propCamera()],
    [propCrate()],
    [breakawayWall()],
    [hazardCable()],
    [goldReel()],
    [wrapMarker()],
    [r(8, 0, 5, 24, "#ffe8a9") + r(0, 8, 24, 5, "#ffe8a9") + r(5, 5, 14, 14, palette.amber)],
    [r(2, 2, 8, 8, "#d8b07a")],
  ];
  return svg(432, 64, cells.map(([content], i) => `<g transform="translate(${i * 48 + 4},2)">${content}</g>`).join(""));
}

function backgroundFar() {
  return svg(960, 540, [
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#11172b"/><stop offset=".55" stop-color="#211720"/><stop offset="1" stop-color="#07070a"/></linearGradient></defs>`,
    r(0, 0, 960, 540, "url(#sky)"),
    ...Array.from({ length: 52 }, (_, i) => c((i * 61) % 960, 46 + ((i * 37) % 150), 2, 2, i % 3 ? palette.gold : palette.blue, 0.82)),
    r(0, 270, 960, 48, "#1a1622"),
    ...Array.from({ length: 16 }, (_, i) => r(i * 62, 190 + (i % 3) * 22, 42, 125, "#231c24")),
    ...Array.from({ length: 16 }, (_, i) => r(i * 62 + 7, 210 + (i % 3) * 22, 25, 5, palette.gold, 0.72)),
  ].join(""));
}

function backgroundMid() {
  return svg(480, 176, [
    r(0, 55, 480, 121, "#22181e"),
    ...Array.from({ length: 10 }, (_, i) => {
      const x = i * 48;
      return [
        r(x + 2, 20, 36, 108, "#2e2528"),
        r(x + 6, 32, 24, 6, palette.gold),
        r(x + 8, 56, 8, 40, palette.ink),
        r(x + 22, 56, 8, 40, palette.ink),
        r(x + 36, 70, 8, 50, "#382922"),
      ].join("");
    }),
  ].join(""));
}

function foregroundTiles() {
  return svg(320, 116, [
    r(0, 0, 320, 116, palette.pavement),
    r(0, 0, 320, 8, "#3b3027"),
    ...Array.from({ length: 20 }, (_, i) => r(i * 16, 18, 10, 2, "#4b4038")).join(""),
    ...Array.from({ length: 16 }, (_, i) => r(i * 24 + 4, 62, 26, 3, "#2b2425")).join(""),
    ...Array.from({ length: 20 }, (_, i) => r(i * 16 + 11, 26, 2, 58, "#241d20")).join(""),
  ].join(""));
}

const files = [
  ["triceratops-dino-sheet.png", dinoSheet()],
  ["triceratops-object-atlas.png", objectAtlas()],
  ["triceratops-scene1-mock.png", sceneMock()],
  ["triceratops-bg-far.png", backgroundFar()],
  ["triceratops-bg-mid.png", backgroundMid()],
  ["triceratops-foreground-tiles.png", foregroundTiles()],
];

for (const [name, source] of files) {
  await sharp(Buffer.from(source)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(join(outDir, name));
}

console.log(`Generated ${files.length} TRICERATOPS asset files in ${outDir}`);
