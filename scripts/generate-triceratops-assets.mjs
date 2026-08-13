import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const outDir = join(root, "client", "public", "backlot", "triceratops");
const sourceDir = join(root, "client", "src", "games", "triceratops", "art-source");
mkdirSync(outDir, { recursive: true });

const characterSource = join(sourceDir, "triceratops-character-source.png");
const propSource = join(sourceDir, "studio-props-source.png");
const backlotSource = join(sourceDir, "studio-backlot-source.png");

const frameWidth = 80;
const frameHeight = 64;
const objectFrameWidth = 48;
const objectFrameHeight = 64;

// Source art is authored as raster pixel-art sheets. This script only normalizes
// the art into the fixed Phaser sprite-sheet contract used by the game.
const dinoFrames = [
  // idle
  { x: 7, y: 16, w: 211, h: 159 },
  { x: 217, y: 16, w: 222, h: 159 },
  // run
  { x: 8, y: 197, w: 192, h: 146 },
  { x: 202, y: 197, w: 194, h: 146 },
  { x: 401, y: 199, w: 191, h: 144 },
  { x: 592, y: 198, w: 197, h: 145 },
  { x: 789, y: 201, w: 193, h: 142 },
  { x: 989, y: 206, w: 164, h: 137 },
  // jump
  { x: 7, y: 424, w: 203, h: 137 },
  { x: 255, y: 357, w: 191, h: 154 },
  { x: 452, y: 444, w: 214, h: 118 },
  // smash
  { x: 8, y: 601, w: 231, h: 123 },
  { x: 243, y: 587, w: 244, h: 148 },
  { x: 489, y: 587, w: 245, h: 148 },
  { x: 737, y: 605, w: 204, h: 123 },
  // hit
  { x: 25, y: 745, w: 197, h: 192 },
  { x: 218, y: 793, w: 194, h: 144 },
  // knockout
  { x: 7, y: 977, w: 225, h: 112 },
  { x: 241, y: 1000, w: 257, h: 83 },
  // victory
  { x: 8, y: 1149, w: 216, h: 170 },
  { x: 266, y: 1116, w: 168, h: 211 },
  { x: 452, y: 1108, w: 204, h: 225 },
];

const dinoFrameRows = [
  [0, 1],
  [2, 3, 4, 5, 6, 7],
  [8, 9, 10],
  [11, 12, 13, 14],
  [15, 16],
  [17, 18],
  [19, 20, 21],
];

const propFrames = [
  { x: 0, y: 231, w: 264, h: 181 }, // foam curb
  { x: 268, y: 118, w: 196, h: 327 }, // camera
  { x: 1650, y: 193, w: 250, h: 336 }, // studio light / rig
  { x: 550, y: 278, w: 242, h: 218 }, // crate
  { x: 793, y: 169, w: 310, h: 366 }, // wall
  { x: 1118, y: 368, w: 286, h: 166 }, // cable
  { x: 1650, y: 193, w: 250, h: 336 }, // falling studio light
  { x: 1407, y: 237, w: 279, h: 289 }, // film frame
  { x: 1650, y: 193, w: 250, h: 336 }, // wrap marker
  { x: 1904, y: 293, w: 190, h: 167 }, // impact star
  { x: 2076, y: 296, w: 96, h: 183 }, // dust
];

function transparent(width, height) {
  return {
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  };
}

async function containExtract(source, crop, width, height, inset = 2) {
  const region = { left: crop.x, top: crop.y, width: crop.w, height: crop.h };
  return sharp(source)
    .extract(region)
    .resize(width - inset * 2, height - inset * 2, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.nearest,
    })
    .extend({
      top: inset,
      bottom: inset,
      left: inset,
      right: inset,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function dinoSheet() {
  const composites = [];
  for (let row = 0; row < dinoFrameRows.length; row += 1) {
    const frameIds = dinoFrameRows[row];
    for (let col = 0; col < frameIds.length; col += 1) {
      const input = await containExtract(characterSource, dinoFrames[frameIds[col]], frameWidth, frameHeight, 1);
      composites.push({ input, left: col * frameWidth, top: row * frameHeight });
    }
  }
  await sharp(transparent(frameWidth * 6, frameHeight * 7))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(outDir, "triceratops-dino-sheet.png"));
}

async function objectAtlas() {
  const composites = [];
  for (let i = 0; i < propFrames.length; i += 1) {
    const input = await containExtract(propSource, propFrames[i], objectFrameWidth, objectFrameHeight, i === 7 || i === 9 ? 0 : 2);
    composites.push({ input, left: i * objectFrameWidth, top: 0 });
  }
  await sharp(transparent(objectFrameWidth * propFrames.length, objectFrameHeight))
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(outDir, "triceratops-object-atlas.png"));
}

async function stageLayers() {
  await sharp(backlotSource)
    .resize(960, 540, { fit: "cover", kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(outDir, "triceratops-bg-far.png"));

  await sharp(backlotSource)
    .extract({ left: 0, top: 350, width: 1672, height: 360 })
    .resize(480, 176, { fit: "cover", kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(outDir, "triceratops-bg-mid.png"));

  await sharp(backlotSource)
    .extract({ left: 0, top: 760, width: 1672, height: 181 })
    .resize(320, 116, { fit: "cover", kernel: sharp.kernel.nearest })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(outDir, "triceratops-foreground-tiles.png"));
}

async function sceneMock() {
  const dino = await containExtract(characterSource, dinoFrames[5], 220, 150, 0);
  const camera = await containExtract(propSource, propFrames[1], 120, 120, 0);
  const cable = await containExtract(propSource, propFrames[5], 110, 68, 0);
  const light = await containExtract(propSource, propFrames[6], 92, 112, 0);
  const filmFrame = await containExtract(propSource, propFrames[7], 92, 92, 0);
  const base = await sharp(backlotSource).resize(960, 540, { fit: "cover", kernel: sharp.kernel.nearest }).modulate({ brightness: 0.86 }).toBuffer();
  await sharp(base)
    .composite([
      { input: dino, left: 100, top: 300 },
      { input: camera, left: 448, top: 356 },
      { input: cable, left: 640, top: 395 },
      { input: light, left: 710, top: 305 },
      { input: filmFrame, left: 790, top: 315 },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(join(outDir, "triceratops-scene1-mock.png"));
}

async function validationFrames() {
  const validationDir = join(outDir, "validation");
  mkdirSync(validationDir, { recursive: true });
  const base = await sharp(backlotSource).resize(960, 540, { fit: "cover", kernel: sharp.kernel.nearest }).modulate({ brightness: 0.86 }).toBuffer();
  const scenarios = [
    {
      file: "triceratops-validation-running.png",
      dinoFrame: dinoFrames[4],
      dinoBox: [210, 150],
      props: [
        [propFrames[1], 116, 116, 548, 356],
        [propFrames[7], 76, 76, 755, 318],
      ],
    },
    {
      file: "triceratops-validation-jump.png",
      dinoFrame: dinoFrames[9],
      dinoBox: [210, 150],
      props: [
        [propFrames[0], 96, 60, 360, 410],
        [propFrames[5], 120, 70, 620, 398],
      ],
    },
    {
      file: "triceratops-validation-smash.png",
      dinoFrame: dinoFrames[13],
      dinoBox: [230, 160],
      props: [
        [propFrames[3], 112, 112, 520, 360],
        [propFrames[9], 88, 88, 585, 326],
      ],
    },
    {
      file: "triceratops-validation-destruction.png",
      dinoFrame: dinoFrames[14],
      dinoBox: [218, 150],
      props: [
        [propFrames[4], 130, 150, 540, 310],
        [propFrames[9], 96, 96, 635, 315],
        [propFrames[10], 120, 96, 612, 382],
      ],
    },
    {
      file: "triceratops-validation-hazard.png",
      dinoFrame: dinoFrames[16],
      dinoBox: [210, 150],
      props: [
        [propFrames[5], 146, 86, 585, 394],
        [propFrames[6], 96, 126, 690, 305],
        [propFrames[9], 72, 72, 650, 358],
      ],
    },
    {
      file: "triceratops-validation-finale.png",
      dinoFrame: dinoFrames[19],
      dinoBox: [220, 170],
      props: [
        [propFrames[8], 118, 158, 675, 300],
        [propFrames[7], 80, 80, 805, 320],
      ],
    },
    {
      file: "triceratops-validation-wrap.png",
      dinoFrame: dinoFrames[21],
      dinoBox: [220, 178],
      props: [
        [propFrames[8], 128, 172, 660, 290],
        [propFrames[9], 80, 80, 782, 315],
      ],
    },
  ];

  for (const scenario of scenarios) {
    const composites = [];
    for (const [crop, width, height, left, top] of scenario.props) {
      composites.push({ input: await containExtract(propSource, crop, width, height, 0), left, top });
    }
    composites.unshift({
      input: await containExtract(characterSource, scenario.dinoFrame, scenario.dinoBox[0], scenario.dinoBox[1], 0),
      left: 96,
      top: 318,
    });
    await sharp(base)
      .composite(composites)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(join(validationDir, scenario.file));
  }
}

await dinoSheet();
await objectAtlas();
await stageLayers();
await sceneMock();
await validationFrames();

console.log(`Generated real-art TRICERATOPS sprite sheet, object atlas, mock frame, validation frames, and stage layers in ${outDir}`);
