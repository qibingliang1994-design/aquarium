# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A "healing" desktop aquarium toy built on Three.js (0.180.0) with plain ES modules and Vite — no UI framework, no TypeScript. Code comments and docs are in Chinese; keep that convention. `DESIGN.md` is the game design doc (roadmap, feature acceptance criteria, design red lines: no quests, no hard economy, no IAP). `ARCHITECTURE.md` is the running log of architectural decisions — append to its "已落地的进度" section when landing structural changes.

## Commands

```bash
npm run dev       # Vite dev server
npm run build     # production build → dist/ (base './', target es2022, fully offline)
npm run preview   # serve dist/
npm run serve     # node _serve.cjs → http://127.0.0.1:8791/, serves raw source with no-cache headers
```

There is no test runner, linter, or formatter configured. Verification is done by running the app in a browser and using the `window.__aqDebug` hooks (see below). `requestAnimationFrame` does not fire in a hidden/background browser page, so the sim only advances while the page is visible (for headless checks, replacing `window.requestAnimationFrame` with a `setTimeout` shim at runtime keeps the loop going; this also trips the 6 s auto low-quality fallback).

`npm run serve` serves `index.html` and `src/` unbundled; bare `three` imports resolve through the `<script type="importmap">` in `index.html`, which points at the jsDelivr CDN (needs network). Vite ignores that importmap path and bundles the local `three` dependency. If you change the Three.js version, update both `package.json` and the importmap.

## Architecture

`index.html` contains only markup (an inline SVG icon sprite referenced via `<use href="#i-…">`, HUD, dock, settings popover, fish card, encyclopedia, help, loading overlay) plus one module entry: `src/main.js`. Styles live in `src/ui/styles/` (`base.css` = design tokens + HUD/dock, `panels.css`, `encyclopedia.css`) and are linked from `index.html`, so they work under both Vite and `_serve.cjs`. `main.js` is the composition root: it calls factory functions, wires DOM interaction, owns settings persistence, and runs the render loop. Modules receive dependencies as explicit parameters rather than importing shared mutable state.

- `scene/setup.js` `createWorld()` — renderer, camera, OrbitControls, lights, post-processing composer/bloom.
- `scene/tank.js` — `TANK` dimensions (4.6×2.2×1.8, `waterY`), `sandHeight(x,z)` height field, `createTank(scene)` (glass high/low materials, water, sand, cabinet). Tank bounds are referenced by schools, feeder, camera presets and `feedPointFromScreen` in `main.js` — resizing the tank requires updating all of them.
- `entities/scenery.js` `createScenery()` — rocks, driftwood, plants, airstone; returns `obstacles` (used by Boids avoidance) and `AIR` (airstone position for bubbles).
- `systems/` — `effects.js` (bubbles, light rays, marine snow, ripples), `feeder.js` (`Feeder` pellets + bite crumbs; `consume()` returns whether the bite counted), `sound.js` (`SoundEngine`, all audio synthesized with WebAudio — no audio assets), `care.js` (`createCare()`: tank-wide satiety/appetite and per-fish growth, persisted in `localStorage['aquarium.care']` with offline decay).
- `ui/fish-card.js` — fish picking (raycast; GLB hits walk up to the clone root for `userData.fishIndex`) and the info card. `ui/settings-panel.js` — settings switches (synced from saved settings) anchored above the dock button.
- `scene/setup.js` post chain: RenderPass → UnrealBloom → OutputPass → `scene/grading.js` (display-space grade + grain). **Any NaN/Inf pixel gets smeared by bloom into large black rectangles** — guard `Math.pow` on values that can be a hair below 0 (e.g. `t` from a translated `PlaneGeometry`) and shader math the same way. `__aqDebug.bloom(false)` is the quick check.
- `uniforms.js` `U` — global shader uniforms (`time`, `excite`) shared across materials; `main.js` advances them each frame.
- `scene/caustics.js` — `injectCaustics(mat, …)` patches materials via `onBeforeCompile`; `setCausticsEnabled` toggles globally. Fish shading in `fish/body.js` (`injectSwim`, `injectTailSway`) uses the same shader-injection pattern.

### Fish pipeline (dual mode)

- `entities/fish/species.js` `SPECIES` — data-driven species definitions: count, size (`L`, `H`), body profiles, fin params, Boids weights, speed, swim band (`band` = y range), `paint()` coloring for the procedural body, and optional behavior flags (`bottomRest`, `territory`, `hunts`, `turn`). Adding behavior should follow this pattern: a species field that `School` checks.
- `entities/fish/species-models.js` `loadSpeciesModels()` — loads each species' GLB (Quaternius CC0, in `public/fish-models/species/`), restyles it, recenters and normalizes it to the species length `L`. Failed loads resolve `null`. The file path lives in its `FILES` map keyed by species id (the `glb` field in `SPECIES` is not what the loader reads).
- `fish/glb-style.js` — the look of GLB fish. `prepareFishModel(root, id)` runs once per template: creased smooth normals (geometry is scaled up first — Quaternius meshes are ~0.02 units and `toCreasedNormals` hashes at 0.01), and per-species `PALETTES` (keyed by GLB material-name regex) converting the source metalness-0.4 flat colors into wet non-metallic `MeshPhysicalMaterial` skin, with optional belly→back gradient / neon glow stored in `material.userData`. `decorateFishMaterial(mat, { causticK, sway })` is applied to each per-fish material clone (`Material.clone()` does not copy `onBeforeCompile`) and composes gradient, caustics, the shared rim light `fishRim`, and tail sway (only for GLBs with no swim clip, i.e. the koi). The encyclopedia previews use the same two functions. New species need a `PALETTES` entry or they render with the GLB's raw colors.
- `entities/fish/school.js` `School` — one per species. **GLB mode**: `SkeletonUtils.clone` per fish into `this.fishes[]`, an `AnimationMixer` playing `Swimming_Normal` (timeScale scales with speed/excitement), with `userData.fishIndex` for picking. **Procedural fallback**: a single `InstancedMesh` built from `fish/body.js` + `fish/textures.js`, with picking via `instanceId`. Both modes share `pos[]`/`vel[]` arrays and the same Boids update; any new per-fish feature must handle both modes (see `pickFish` in `main.js`).
- `ui/encyclopedia.js` — `SPECIES_META` (display name, latin, zone, size, behavior, diet) keyed by species id, plus encyclopedia preview rendering (side-view GLB, falling back to procedural fish).

Adding a species = GLB in `public/fish-models/species/` (+ README row) + entry in `FILES` + entry in `SPECIES` + entry in `SPECIES_META` + palette in `fish/glb-style.js` + accent color (`--sp`) in `panels.css` / `encyclopedia.css`.

### Main loop & state

- The per-frame `ctx` passed to `School.update(dt, ctx)` carries `obstacles`, `pellets`, `feeder`, `excite`, `time`, all `schools` (for cross-species separation), and the core-loop modulators `appetite` (from care), `fear` (glass-tap, decays over 2 s), `sleep` (night, cancelled by excite/fear) and the `onEat(school, i)` callback. `School` never imports game state; new tank-wide behavior should be added as another `ctx` field.
- GLB fish blend three actions per fish (`swim` / `fast` / `bite`) by setting effective weights every frame — don't use `crossFadeTo`/`fadeIn`, which would fight that.
- Double-click detection is in the canvas `pointerup` handler: the first click always acts immediately (feed or pick); only a second click within 300 ms / 30 px becomes a glass tap.
- Day/night: `nightK` lerps toward `nightTarget`; `applyNight(k)` drives every light, fog, water and caustic intensity from `DAY`/`NIGHT` tables. Auto cycle is 180 s.
- Settings persist in `localStorage['aquarium.settings']` (sound, cycle, night, rays, bubbles, snow, caustics).
- Auto quality: after 6 s, if average FPS < 30, pixel ratio drops to 1, glass switches to `glassLow`, and bloom is disabled.
- Photo mode: `H` hides UI, `H` again saves a high-DPI PNG, `Esc` exits.

### Debug hooks

`window.__aqReady` becomes true after the first rendered frame. `window.__aqDebug` exposes test helpers: `time`, `pelletCount`, `excite`, `night`, `modelStatus`, `pickAt(x,y)`, `tpFish`, `posOf`, `velOf`, `restState`, `restP`, `snapTo`, `projectFish`, `hide`, plus core-loop hooks `satiety`, `setSatiety(v)`, `appetite`, `fear`, `sleep`, `feed()`, `tapGlass(x,y)`, `growthOf(si,ii)`, and rendering hooks `bloom(on)`, `scene()`. Indices are `(schoolIndex, fishIndex)` in `SPECIES` order. Extend this object when adding behavior that needs automated verification.
