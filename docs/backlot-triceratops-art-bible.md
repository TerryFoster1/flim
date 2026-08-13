# TRICERATOPS! Real Art Asset Pass

## Scope

This pass replaces the old programmer-art asset pipeline for `TRICERATOPS!` with authored raster PNG assets. Phaser should load sprite sheets, atlases, and stage layers. It should not draw finished dinosaurs, props, hazards, or environments at runtime.

## Procedural Art Audit

| Area | Previous behavior | Decision | Notes |
| --- | --- | --- | --- |
| `scripts/generate-triceratops-assets.mjs` | Inline SVG rectangles, ellipses, polygons, and shape-generated art | Replace | The script now normalizes authored PNG source art into the Phaser asset contract. |
| `TriceratopsBacklotGame.createTextures` | Dead runtime canvas generator for dinosaur states, stage art, props, hazards, collectible, dust | Remove | The active game path loads PNG assets in `preload()`. The dead fallback was deleted to prevent future regressions. |
| Phaser particles and score popups | Runtime visual effects | Keep for effect | Dust bursts, impact popups, flashes, and UI feedback may remain procedural because they are effects, not finished game artwork. |
| Invisible physics rectangles | Runtime collision helpers | Keep | Ground and hitbox rectangles are invisible gameplay helpers. |
| HUD text, progress line, countdown text | Runtime UI | Keep | UI text remains rendered live for score, health, countdown, and result state. |
| CSS layout and touch zones | Responsive shell and controls | Keep | These are interface controls rather than art assets. |

## Art Bible

| Contract | Value |
| --- | --- |
| Internal game resolution | `480 x 270` |
| Presentation | Landscape, integer-scaled where possible |
| Pixel rendering | Nearest-neighbor / crisp pixel edges |
| Tile size | `16px` |
| Player frame | `80 x 64` |
| Player scale | `3x` |
| Object atlas frame | `48 x 64` |
| Source style | Polished retro arcade / early-1990s 16-bit |
| Palette direction | Deep navy-black backlot, warm studio gold, cinematic amber lights, readable green dinosaur |
| Outline strategy | Dark ink outlines with warm highlights and shaded forms |
| Perspective | Side-scrolling studio backlot with layered horizontal parallax |
| Lighting | Night shoot, stage lamps, amber practicals, moonlit city background |

## Asset Sources

| Source | Purpose |
| --- | --- |
| `client/src/games/triceratops/art-source/triceratops-character-source.png` | Authored Triceratops animation source sheet |
| `client/src/games/triceratops/art-source/studio-props-source.png` | Authored prop, hazard, collectible, finish, and effect source sheet |
| `client/src/games/triceratops/art-source/studio-backlot-source.png` | Authored studio backlot environment source |

## Exported Game Assets

| Export | Dimensions | Use |
| --- | --- | --- |
| `client/public/backlot/triceratops/triceratops-dino-sheet.png` | `480 x 448` | `80 x 64` frames for idle, run, jump, smash, hit, knockout, victory |
| `client/public/backlot/triceratops/triceratops-object-atlas.png` | `528 x 64` | `48 x 64` frames for curb, camera, studio light, crate, wall, cable, falling light, film frame, wrap marker, impact star, dust |
| `client/public/backlot/triceratops/triceratops-bg-far.png` | `960 x 540` | Far parallax layer |
| `client/public/backlot/triceratops/triceratops-bg-mid.png` | `480 x 176` | Mid parallax layer |
| `client/public/backlot/triceratops/triceratops-foreground-tiles.png` | `320 x 116` | Foreground / ground tile layer |
| `client/public/backlot/triceratops/triceratops-scene1-mock.png` | `960 x 540` | Integrated gameplay mock frame |

## Animation Contract

| State | Frames | Sheet row |
| --- | --- | --- |
| Idle | 2 | 0 |
| Run | 6 | 1 |
| Jump | 3 | 2 |
| Smash | 4 | 3 |
| Hit | 2 | 4 |
| Knockout | 2 | 5 |
| Victory | 3 | 6 |

## Stage 1: Studio Backlot

Stage 1 uses a layered night studio environment:

- Far background: studio skyline, night sky, soundstages, cranes.
- Mid background: backlot facades and set structures.
- Gameplay layer: pixel-art ground tiles, props, hazards, destructibles.
- Foreground: darker platform/front-stage material.

Future environments should preserve the same pixel density and frame contracts:

- Downtown Movie Set
- Western Lot
- Sci-Fi Soundstage
- Monster Movie Set

## Gameplay Objects

| Object | Atlas frame | Behavior |
| --- | --- | --- |
| Foam curb | 0 | Jump obstacle |
| Studio camera | 1 | Smash target |
| Studio light | 2 | Smash target |
| Prop crate | 3 | Smash target |
| Breakaway wall | 4 | Smash target |
| Sparking cable | 5 | Hazard |
| Falling studio light | 6 | Hazard |
| Film frame | 7 | Collectible |
| Wrap marker | 8 | Finish marker |
| Impact star | 9 | Smash effect |
| Pixel dust | 10 | Movement / impact effect |

## Performance Notes

- Assets are local static PNGs under `/backlot/triceratops`.
- Export dimensions stay small enough for fast mobile web loading.
- Phaser loads one dinosaur sheet, one object atlas, and three stage layers.
- Runtime canvas generation of finished artwork is not allowed for this game.
