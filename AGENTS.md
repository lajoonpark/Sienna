# Working on Sienna

The app is in `app/` (Electron + Three.js); `site/` is the landing page. `app/README.md` is the long
description of how everything works and which check covers what.

## Verify a change (run from `app/`)

```sh
npm test                 # unit tests (node --test test/*.test.cjs), about a second
npm run build            # vite build of the shop and the mini window into dist/
node scripts/<name>-check.mjs <out_dir>   # headless browser checks against the fake record store
```

Which check for what: `lists-check` (search, collection list, Up next, carousels), `sheets-check`
(Settings, Lyrics, tour notes, banners), `home-check` (now-playing tag, shelf words, fps ticket),
`search-check`, `spread-check` (album spread), `covers-check` (covers are let go of), `account-check`,
`tour-check`, `mini-suggest-check`, `mini-close-check`, `mini-leave-check`. Each takes 10 to 80 s.

- The checks start their own Vite server on a fixed port. If one fails at once with "Port … is already in
  use", pick another: `SIENNA_PORT=5331 node scripts/search-check.mjs out`.
- They choose the GPU through `glArgs()` in `scripts/safe.mjs` (Metal on a Mac, Vulkan elsewhere,
  `SIENNA_ANGLE` overrides). New scripts should use it rather than hard-coding a backend.
- Checks that launch the real app (`shortcuts-check`, `mini-font-check`, `e2e`, `mem-check`,
  `player-check`, …) open real windows and need `npm run build` first. Run them somewhere they do not take
  over the desktop.
- `electron/` is not bundled: changes there need the app restarted, not rebuilt. `src/` changes hot-reload
  into a running `npm run dev`.

## Things that are easy to break

- **The stroke fingerprint.** The shop's brush strokes are cached under a fingerprint of the scene
  (`strokeFingerprint` in `src/brushstrokes.js`), and `strokes/shop.bin.gz` ships a bake for it. Anything
  that changes what is in `scene` when `painter.bakeStrokesCached(...)` runs in `src/main.js` (new meshes,
  moved furniture, a different build order) changes it; then run `node scripts/bake-strokes.mjs` again.
- **Lettering.** Anything painted into a canvas or texture with the display font registers a repaint with
  `onLettering(owner, draw)` (`src/style.js`).
- **Windows made while quitting.** Nothing in the main process may create a `BrowserWindow` once
  `before-quit` has fired: the app cannot finish quitting while one is open.
- **What the main process remembers** of YouTube Music's answers (`electron/cache.cjs`) belongs to one
  account: clear it in `forgetAccount()` in `electron/ytm.cjs` if you add another cache.

## Conventions

- No lint or type-check step is configured; match the surrounding style (2 spaces, single quotes, comments
  that say why).
- Main-process modules are CommonJS (`electron/*.cjs`) and take what they need as arguments, so they can be
  unit tested against a pretend Electron (`test/main-process.test.cjs`).
- Logic that can live without the DOM or three goes in its own small module with a test
  (`src/racks/cover-cache.js`, `src/queue-pick.js`, `src/racks/play.js`).
