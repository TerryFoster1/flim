# Relic Run: The Lost Chapter

Relic Run is a hidden Flim mini-game prototype embedded in the native app with Phaser 3 inside the shared WebView game shell.

## Route

- `app/games/relic-run.tsx`
- Arcade entry: Hidden Game Lab -> Relic Run

## Controls

- Swipe up: jump
- Tap: quick whip strike
- Tap and hold: throw whip toward an overhead anchor
- Release while attached: swing and launch

## Gameplay

The player auto-runs through an original lost-cinema ruin setting. Procedural sections spawn gaps, swing gaps, pots, flying beetles, walking mummies, relics, film reels, and power-ups. The generator uses spacing and beatability checks in `src/games/relic-run/procedural.ts` to avoid known impossible layouts.

## Power-Ups

- Director's Cut: slows the run briefly
- Lost Map: highlights swing anchors briefly
- Double Feature: doubles score events briefly
- Magnet: pulls nearby relics and film reels
- Guardian Spirit: blocks one collision

## App Messages

The WebView posts:

- `GAME_READY`
- `GAME_STARTED`
- `GAME_PAUSED`
- `GAME_RESUMED`
- `SCORE_UPDATED`
- `GAME_OVER`

Payloads include score, distance, combo, perfect swings, perfect jumps, whip hits, defeated enemies, relics, and film reels.

## Scope

This is a production-quality Phase 1 hidden prototype: running, jumping, whip strikes, swing traversal, enemies, collectibles, scoring, game-over/restart, power-ups, local pixel-art primitives, and lifecycle cleanup. It intentionally avoids licensed characters, music, logos, or look-alike assets.

