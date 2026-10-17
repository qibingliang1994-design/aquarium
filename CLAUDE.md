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
npm run lint      # ESLint (correctness rules only; eslint.config.js)
npm run typecheck # tsc -p jsconfig.json — only files with `// @ts-check` are checked
npm test          # Vitest, tests/**/*.test.js, Node environment
npx vitest run tests/care.test.js -t "离线"   # single file / single test by name
npm run check     # lint + typecheck + test + build
```

The project is developed and run locally only (no remote, no hosted CI). A git pre-commit hook in `.githooks/pre-commit` runs lint → typecheck → test; `npm install` enables it via the `prepare` script (`core.hooksPath=.githooks`). Skip once with `git commit --no-verify`.

- No formatter on purpose: the code uses a dense, shader-like style; don't mass-reformat files. ESLint enforces no unused vars, no empty `catch`, `prefer-const`, `eqeqeq` (smart).
- Type checking is opt-in per file (`// @ts-check` + JSDoc); `src/utils.js`, `src/systems/care.js`, the pure `src/scenes/*` data modules and `src/editor/history.js` are opted in. Opt more pure modules in as they're touched rather than enabling `checkJs` globally.
- Unit tests cover pure logic only (`utils`, `care`, `Feeder`, scene documents/store/presets, undo history). Browser globals are stubbed per test with `vi.stubGlobal` (`localStorage`, `addEventListener`); Three.js geometry/material construction works in Node, but anything needing WebGL, `document`/canvas (e.g. `fish/textures.js`, `caustics.js` texture generation) does not — keep such modules out of unit tests.

Visual and behavioral verification is done by running the app in a browser and using the `window.__aqDebug` hooks (see below). `requestAnimationFrame` does not fire in a hidden/background browser page, so the sim only advances while the page is visible (for headless checks, replacing `window.requestAnimationFrame` with a `setTimeout` shim at runtime keeps the loop going; this also trips the 6 s auto low-quality fallback).

`npm run serve` serves `index.html` and `src/` unbundled; bare `three` imports resolve through the `<script type="importmap">` in `index.html`, which points at the jsDelivr CDN (needs network). Vite ignores that importmap path and bundles the local `three` dependency. If you change the Three.js version, update both `package.json` and the importmap.

## Architecture

`index.html` contains only markup (an inline SVG icon sprite referenced via `<use href="#i-…">`, HUD, dock, settings popover, fish card, encyclopedia, help, scene picker, editor chrome, loading overlay) plus one module entry: `src/main.js`. Styles live in `src/ui/styles/` (`base.css` = design tokens + HUD/dock, `panels.css`, `encyclopedia.css`, `scenes.css`, `editor.css`) and are linked from `index.html`, so they work under both Vite and `_serve.cjs`. `main.js` is the composition root: it calls factory functions, wires DOM interaction, owns settings persistence and scene switching, and runs the render loop. Modules receive dependencies as explicit parameters rather than importing shared mutable state.

- `scene/setup.js` `createWorld()` — renderer, camera, OrbitControls, lights, post-processing composer/bloom.
- `scene/tank.js` — `TANK` dimensions (4.6×2.2×1.8, `waterY`), `sandHeight(x,z)` height field, `createTank(scene)` (glass panes, water, sand + substrate skirt, room floor, plus `setSandColors` / `setBackdrop` for themes and `setShell(id)`). The tank *shell* — frame, glass edges, lamp, cabinet — comes from `scene/tank-shells.js` (`classic` / `rimless` / `reef` / `zen`) and is swapped per scene; the interior volume is identical for every style, so fish bounds and item coordinates never change. `shell.lightMat` is the lamp's emissive surface (dimmed by day/night). Tank bounds are referenced by schools, feeder, camera presets, `ui/tank-input.js` and `PLACE_BOUNDS` in `scenes/item-meta.js` — resizing the tank requires updating all of them.
- `scene/daynight.js` `createDayNight()` — `k` lerps toward `target`; `apply(k)` drives every light, fog, water and caustic intensity from `DAY`/`NIGHT` tables; `setTheme(t)` swaps the day-side water/fog/glow colors. Auto cycle is 180 s.
- `systems/` — `effects.js` (bubbles, light rays, marine snow, ripples), `feeder.js` (`Feeder` pellets + bite crumbs; `consume()` returns whether the bite counted), `sound.js` (`SoundEngine`, all audio synthesized with WebAudio — no audio assets), `care.js` (`createCare(species, { key })`: tank-wide satiety/appetite and per-fish growth, persisted per scene in `localStorage['aquarium.care.<sceneId>']` with offline decay).
- `ui/fish-card.js` — fish picking (raycast; GLB hits walk up to the clone root for `userData.fishIndex`) and the info card (takes `getCare()` because care is per scene). `ui/settings-panel.js` — settings switches anchored above the dock button. `ui/tank-input.js` — canvas click/feed/glass-tap handling (skipped while the editor is active). `ui/photo-mode.js`, `ui/scene-picker.js` (the "我的水景" modal).
- `scene/setup.js` post chain: RenderPass → UnrealBloom → OutputPass → `scene/grading.js` (display-space grade + grain). **Any NaN/Inf pixel gets smeared by bloom into large black rectangles** — guard `Math.pow` on values that can be a hair below 0 (e.g. `t` from a translated `PlaneGeometry`) and shader math the same way. `__aqDebug.bloom(false)` is the quick check.
- `uniforms.js` `U` — global shader uniforms (`time`, `excite`) shared across materials; `main.js` advances them each frame.
- `scene/caustics.js` — `injectCaustics(mat, …)` patches materials via `onBeforeCompile`; `setCausticsEnabled` toggles globally. Procedural fish shading (`fish/body.js` `injectSwim`) and GLB fish shading (`fish/glb-style.js` `decorateFishMaterial`) use the same shader-injection pattern.

### Fish pipeline (dual mode)

- `entities/fish/species.js` `SPECIES` — data-driven species definitions: count, size (`L`, `H`), body profiles, fin params, Boids weights, speed, swim band (`band` = y range), `paint()` coloring for the procedural body, and optional behavior flags (`bottomRest`, `territory`, `hunts`, `turn`). Adding behavior should follow this pattern: a species field that `School` checks.
- `entities/fish/species-models.js` `loadSpeciesModels()` — loads each species' GLB (Quaternius CC0, in `public/fish-models/species/`), restyles it, recenters and normalizes it to the species length `L`. Failed loads resolve `null`. The file path lives in its `FILES` map keyed by species id (the `glb` field in `SPECIES` is not what the loader reads).
- `fish/glb-style.js` — the look of GLB fish. `prepareFishModel(root, id)` runs once per template: creased smooth normals (geometry is scaled up first — Quaternius meshes are ~0.02 units and `toCreasedNormals` hashes at 0.01), and per-species `PALETTES` (keyed by GLB material-name regex) converting the source metalness-0.4 flat colors into wet non-metallic `MeshPhysicalMaterial` skin, with optional belly→back gradient / neon glow stored in `material.userData`. `decorateFishMaterial(mat, { causticK, sway })` is applied to each per-fish material clone (`Material.clone()` does not copy `onBeforeCompile`) and composes gradient, caustics, the shared rim light `fishRim`, and tail sway (only for GLBs with no swim clip, i.e. the koi). The encyclopedia previews use the same two functions. New species need a `PALETTES` entry or they render with the GLB's raw colors.
- `entities/fish/school.js` `School` — one per species. **GLB mode**: `SkeletonUtils.clone` per fish into `this.fishes[]`, an `AnimationMixer` playing `Swimming_Normal` (timeScale scales with speed/excitement), with `userData.fishIndex` for picking. **Procedural fallback**: a single `InstancedMesh` built from `fish/body.js` + `fish/textures.js`, with picking via `instanceId`. Both modes share `pos[]`/`vel[]` arrays and the same Boids update; any new per-fish feature must handle both modes (see `pickFish` in `main.js`).
- `ui/encyclopedia.js` — `SPECIES_META` (display name, latin, zone, size, behavior, diet) keyed by species id, plus encyclopedia preview rendering (side-view GLB, falling back to procedural fish).

Adding a species = GLB in `public/fish-models/species/` (+ README row) + entry in `FILES` + entry in `SPECIES` + entry in `SPECIES_META` + palette in `fish/glb-style.js` + `FISH_IDS` / `FISH_MAX` in `scenes/scene-doc.js` (same order as `SPECIES`; a unit test checks this) + accent color (`--sp`) in `panels.css` / `encyclopedia.css` / `editor.css`. A species' `count` in `SPECIES` is only a default — the live count comes from the scene document.

### Scenes & editor

- A scene is a JSON document `{ id, name, presetId?, theme, tank, fish:{speciesId:count}, items:[{ id, type, x, z, rot, s, seed }] }`. Everything loaded from storage goes through `sanitizeDoc` in `scenes/scene-doc.js` (clamps, caps, unknown types dropped). `scenes/item-meta.js` (labels, groups, footprint radius, scale range), `themes.js`, `tank-styles.js` (shell labels + lamp color/intensity/height; `resolveTank` fills in `tank` for old saves) and `presets.js` (classic / reef / pond, each with its own tank) are pure data.
- `scenes/scene-store.js` — `localStorage['aquarium.scenes'] = { version, activeId, scenes }`, thumbnails in `aquarium.thumbs`; seeds presets on first run and migrates the legacy `aquarium.care` save to the classic scene.
- Items are built deterministically from `seed` (`makeRng` in `utils.js`) by `scenes/catalog.js` → `scenes/items/{decor,plants,corals}.js`, using the geometry generators in `items/natural-geo.js` (fractured rocks with strata, tapered bark tubes) and `items/leaf-shapes.js` (curved leaves combined into rosettes / ribbons / stem plants / carpet clumps; plant templates are cached per type in 3 variants). `injectSurfaceDetail` in `items/common.js` adds world-space 3D-noise normal detail and must be applied *after* `injectCaustics` (it reads the `vWPos` varying). Builders return `{ object, obstacles }` in item-local space (origin = sand surface). Materials are cached per type in `items/common.js` and never disposed; geometries are per item. Adding an item type = builder + `BUILDERS` entry + `ITEM_META` entry.
- `scenes/scene-runtime.js` `apply(doc, { fresh })` diffs the doc into the scene: moving/rotating/scaling only updates the item's root transform, changing `type`/`seed` rebuilds it. It mutates the shared `obstacles` and `schools` arrays **in place** (other modules hold those references), rebuilds a `School` only when its count changes, recreates `care` per scene, and sets `air` to the first airstone (bubbles hide when there is none).
- `editor/scene-editor.js` edits a working copy of the doc. Every discrete change goes through `commit(mutate)` (snapshot → mutate → `runtime.apply`); continuous drags/sliders use `runtime.moveItem` and push one undo snapshot when they end. Its `pointerdown` listener is registered in the capture phase so it can disable OrbitControls before they start dragging. Save writes to the store and captures a thumbnail from a fixed front camera; cancel re-applies the stored doc.

### Main loop & state

- The per-frame `ctx` passed to `School.update(dt, ctx)` carries `obstacles`, `pellets`, `feeder`, `excite`, `time`, all `schools` (for cross-species separation), and the core-loop modulators `appetite` (from care), `fear` (glass-tap, decays over 2 s), `sleep` (night, cancelled by excite/fear) and the `onEat(school, i)` callback. `School` never imports game state; new tank-wide behavior should be added as another `ctx` field.
- GLB fish blend three actions per fish (`swim` / `fast` / `bite`) by setting effective weights every frame — don't use `crossFadeTo`/`fadeIn`, which would fight that.
- Double-click detection is in the canvas `pointerup` handler (`ui/tank-input.js`): the first click always acts immediately (feed or pick); only a second click within 300 ms / 30 px becomes a glass tap.
- Settings persist in `localStorage['aquarium.settings']` (sound, cycle, night, rays, bubbles, snow, caustics).
- Auto quality: after 6 s, if average FPS < 30, pixel ratio drops to 1, glass switches to `glassLow`, and bloom is disabled.
- Photo mode: `H` hides UI, `H` again saves a high-DPI PNG, `Esc` exits.

### Debug hooks

`window.__aqReady` becomes true after the first rendered frame. `window.__aqDebug` (defined in `src/debug.js`) exposes test helpers: `time`, `pelletCount`, `excite`, `night`, `modelStatus`, `pickAt(x,y)`, `tpFish`, `posOf`, `velOf`, `restState`, `restP`, `snapTo`, `projectFish`, `hide`, plus core-loop hooks `satiety`, `setSatiety(v)`, `appetite`, `fear`, `sleep`, `feed()`, `tapGlass(x,y)`, `growthOf(si,ii)`, rendering hooks `bloom(on)`, `scene()`, `look(pos,tgt)` (place the camera), and scene hooks `schoolIds()`, `sceneId()`, `scenes()`, `switchScene(id)`, `itemCount()`, `obstacleCount()`, `air()`, `projectItem(id)`, `editor()` (its `.debug` drives add/select/rotate/undo…). Indices are `(schoolIndex, fishIndex)` where `schoolIndex` counts only the species present in the current scene, in `SPECIES` order — check `schoolIds()` first. Extend this object when adding behavior that needs automated verification.
