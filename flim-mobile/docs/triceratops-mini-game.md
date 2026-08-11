# Triceratops Hidden Game Prototype

This prototype is a self-contained internal Flim mobile game. It does not open `flim.ca`, a remote game URL, or any external browser.

## Architecture

- Route: `/games/triceratops`
- Native wrapper: `src/screens/EmbeddedGameScreen.tsx`
- Game files: `src/games/triceratops`
- Runtime: Phaser 3 bundled into the app as local source
- Transport: `window.ReactNativeWebView.postMessage`

The wrapper owns availability and navigation. The game is not the authority for unlocks, rewards, personal bests, or Easter egg state.

## Current Prototype Scope

- Retro title screen
- Original green triceratops runner
- Tap-to-horn-flip attack
- One car type
- Standard and perfect flip timing
- Early, late, and missed timing behavior
- Pedestrians, destructible scenery, and film reel collectibles
- Rampage and Director's Cut power-ups
- Score, combo, distance, and game-over payloads
- Restart and native exit controls

## App Messages

- `GAME_READY`
- `GAME_STARTED`
- `SCORE_UPDATED`
- `GAME_OVER`
- `GAME_COMPLETED`
- `PAUSE_REQUESTED`
- `EXIT_REQUESTED`

`GAME_OVER` includes score, distance, vehicles flipped, perfect flips, pedestrians stomped, scenery destroyed, reels collected, and max combo.

## Local Testing

```bash
npm run test
npm run typecheck
npx expo export --platform android --output-dir .expo-export-test
```

Device behavior that still needs physical verification:

- iOS WebView rendering
- Android WebView rendering
- repeated open, play, exit, reopen cycles
- app background and foreground pause/resume
