# Sienna app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

The opening shot: a narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Sienna shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. All scenery is procedural.

**Look:** painted, through a screen pass (`src/watercolour.js`): brush strokes pinned to the world's surfaces by default (`src/brushstrokes.js`), or a watercolour wash with hand wobble, colour bleed, wet edges and paper grain (Settings > Painting). Both have a ragged paper border. `?style=flat` shows the old flat toon look.

**Lettering:** buttons, record tags and the shop sign use one handwritten cursive, Dancing Script Bold (`FONT` in `src/style.js`, bundled via `@fontsource/dancing-script`). Only the 700 weight is shipped.

**Name:** the app was called Cadence until 2026-11-08. On first launch, `electron/main.cjs` moves the old `cadence-app` data folder (YouTube Music sign-in, settings) to `sienna-app`, and `src/settings.js` carries over the old `cadence.settings` key. Env vars are `SIENNA_*` (were `CADENCE_*`).

**Everything is real geometry**, with no brick textures. `src/kit.js` collects thousands of bricks, flagstones, roof tiles and shutter slats into a few instanced meshes. `src/masonry.js` lays brick walls course by course around openings, builds arches with voussoirs, barrel vaults, stucco with patches of exposed brick, and paving. `src/details.js` has windows, louvred shutters, doors, balconies, lanterns, eaves and pots. `src/props.js` has street life, and `src/interior.js` has shop furniture.

**The shop** (`src/shop.js`) is a row of brick vaults going back, one per category zone (`ZONES`): the big hall with crate-digging tables and a U-shaped gallery with a spiral stair, the listening lounge, the stacks, the plant room under a skylight, and an open courtyard with a lemon tree.

**Time of day** follows the viewer's clock (`src/timeofday.js`): sky, sun, shadows and fog blend through night, blue hour, sunset, golden hour and day. Lamps are always there and switch on one by one at dusk with a short flicker (`src/env.js`). Windows light up through the evening.

```
npm install
npm run dev                 # vite dev server + opens the Electron window; menu bar icon has "Open Sienna"
npm run web                 # just vite on http://127.0.0.1:5173 (open in a browser)
npm run build && npm run electron
SIENNA_DEV_URL=http://127.0.0.1:5173 npm run electron   # electron against the dev server
node scripts/shot.mjs out_dir 0 3.6 5 8.5   # headless screenshots at given seconds
SIENNA_QUERY=hour=21 node scripts/shot.mjs out_dir 0 8.5          # at 9 pm
SIENNA_QUERY='cam=-4.4,4.65,-3.3,2,3.2,-9.5' node scripts/shot.mjs out_dir 9   # pinned camera (x,y,z,target)
```

URL options: `?hour=20.5` freezes the clock, `?speed=600` runs it faster, `?cam=x,y,z,tx,ty,tz` pins the camera, and `?style=flat` shows the old look.

## Music (YouTube Music)

A hidden `music.youtube.com` window plays the audio (`electron/ytm.cjs`). YouTube Music itself does
the queue, radio, ads, history and likes; Sienna drives it through a small script injected into the
page (`electron/ytm-page.js`) and reads your home shelves from the same internal API the page uses
(`electron/ytm-parse.cjs`, unit tested against a real response in `test/fixtures/home.json`). The
shop talks to it only through `window.sienna` (`electron/preload.cjs`).

- **Sign in** once with the SIGN IN button (a Google window that shares the player's cookies, kept in
  the `persist:ytm` partition). Without signing in it works as a guest, with ads and generic shelves.
- **Home**: the intro (street, door, walk in) ends at a home spot just inside the shop. Click or
  press any key to skip it. Your YouTube Music shelves ("Quick picks", "Listen again"...) are the
  brush-stroke words down both sides of the screen (`src/menu.js`); click one and the camera walks
  there (`src/nav.js`: along the aisle, through the arches, over the gallery railing). **Tab** /
  **Shift+Tab** go to the next / previous section, **Esc** or HOME goes back. At a section the words
  step back to the edges until the cursor comes near them.
- **Sections** (`src/stations.js`): eight spots in the shop, each with its own kind of rack
  (`src/racks/`): crate table in the hall, cube shelf under the gallery, records leaning on a plinth
  upstairs, a stepped easel on the counter, picture ledges in the lounge, a library shelf with a
  ladder in the stacks, a spinner rack in the plant room, a market stall in the courtyard. Shelves
  YouTube always sends have a fixed spot (Quick picks next to home, Listen again on the cube shelf,
  Forgotten favourites upstairs); the others fill the free spots. Hover a record and it comes out
  toward you with a paper name tag; click it and its vinyl pops out and flies into the suitcase.
  On the crate table (Quick picks) the record under the cursor comes up with a neighbour each side,
  fanned like a hand of cards, so each is a big target. At any rack, resting the cursor on a record
  turns the camera part of the way toward it (`updateFocus` in `main.js`). Records are picked by where
  they rest, so a lifted record never blocks its neighbours; if the cursor is on none of those, the
  lifted record takes the click, so you click the song, not the rack behind it.
  However a rack lifts, swings or zooms a record, it never leaves the cursor: after each rack poses the
  hovered record, `keepUnderCursor` in `src/racks/common.js` slides it across the view just enough to
  keep the cursor 15% inside its edges, at every moment of the animation, so you can press it without
  moving (check with `SIENNA_GL=vulkan node scripts/cursor-check.mjs [out] [stations] [n]`). It keeps
  the record under where the cursor was when the hover began, not the live cursor, so a lifted record
  never follows the cursor about (`hoverAnchor`); the cursor tilt of the camera also holds while a
  record is up, since turning the camera would slide the record across the rack.
  The plant-room spinner also turns by hand: scroll sideways (trackpad swipe), or press on the stand and
  drag it round; let go with a flick and it keeps spinning, slowing down (`wheel` / `grab` / `dragTo` /
  `release` in `src/racks/spinner.js`, wired in `main.js`). A press that drags is not a click, and
  records don't lift while it turns. Check: `node scripts/spin-check.mjs [out]`.
  At the courtyard stall, hovering a crate makes all its records float up in front of you, spread
  out so every cover shows; the one under the cursor grows and comes forward with its tag.
- **The suitcase** (`src/suitcase/`): the player, bottom left. A watercolour leather case with a
  record player: the record spins with the cover on its label, the tonearm creeps in as the song
  plays, the knob is volume (drag it or scroll; scrolling down is quieter), the buttons are back / play / skip / like, and
  dragging the record scrubs. A paper tag beside it shows the song with a seekable progress line.
- **Mini player**: **⌃⌥Space** anywhere opens the same suitcase at the cursor on a torn-paper card
  (`mini.html`, `electron/mini.cjs`); the lid flicks open on a physical hinge (`src/lid.js`). Esc,
  clicking away or ⌃⌥Space again shuts it. ⌥⌘S searches there too.
- **Volume**: on macOS the knob, scroll and ↑ ↓ set the Mac's own output volume (`electron/sysvolume.cjs`,
  osascript) and the player stays at 100%, so you can turn it up past where the Mac was. Elsewhere it
  is the player's volume.
- **Search**: **⌥⌘S** (Ctrl+Alt+S on Windows/Linux) opens a search bar (`src/search.js`). The bar is
  slapped on bristle by bristle, throwing droplets, and flicked off the right-hand end when it closes
  (`src/searchpaint.js`; the same in the shop and the mini window, no animation under the system's reduce-motion setting). Songs are
  brushed in row by row, zigzagging, with the shop's brush (`src/brushpaint.js`), arrows + Enter or a click plays one. A song from search has no sleeve, so a
  little painted record machine pops up by the suitcase, whirs, spits the record out of its top onto
  the platter and pops away (`src/suitcase/machine.js`; `?machine=1.2` freezes it for screenshots).
- **Settings**: the SETTINGS word (top right) or **⌘,** (Ctrl+, elsewhere) opens a paper card
  (`src/settings-panel.js`, stored by `src/settings.js` in localStorage, shared with the mini window).
  *Painting* sets the look: Faint / Light / Medium / Heavy watercolour, or Brush strokes (default), which repaints the world with strokes pinned to its surfaces: a full coat pulled in one direction, each stroke kept to its own surface, so the paint looks laid on by one hand, moves with the world and stays still when the camera does, while only the ragged border keeps boiling (`src/brushstrokes.js`; check with `scripts/still-check.mjs`). Faint is the
  old single pass; the others flatten shading into washes and let colour bleed (`LEVELS` in
  `src/watercolour.js`). `?wc=0..4` (or `SIENNA_QUERY="wc=2" npm run dev`) pins a level for screenshots.
  *Cover art* sets how strongly covers are painted (Off to Heavy, default Heavy). *Start of a song* plays
  when the arm lands (default) or at once. *Smoothness* caps the frame rate at 60 or 30 fps. *Frame rate*
  shows an fps readout.
- **Heat / battery**: the shop is drawn at that cap only while something moves (camera, input, flights,
  lid); once still it drops to 12 fps (30 while a record spins on screen), and stops while the window is
  hidden, minimised or covered (`src/pacer.js`; `node scripts/idle-check.mjs [rack]` checks it). The
  hidden YouTube Music window is throttled like a background tab (no painting, no video decoding, smallest
  video stream) and is polled 4x a second only while a Sienna window is on screen, every 3 s otherwise;
  the macOS volume is read only while a window is on screen.
- **Covers**: playlist and mix covers are found in any of YouTube's thumbnail shapes; one that is
  missing or fails to load is painted as a collage of the playlist's first songs (`src/cover.js`).
  `SIENNA_DUMP=1` saves the raw API responses to the app's userData (`dumps/`) and logs any item
  without art, for debugging.
- **Keys**: Space play/pause, ← → back/skip, ↑ ↓ or scroll for volume (a sideways scroll is never volume), L like.
- Covers and tags are drawn sharp: they write alpha 0 into the scene buffer (`crisp()` / `keepSharp()` in
  `materials.js`, also the SIENNA sign) and the watercolour pass leaves those pixels alone. The covers
  themselves are repainted once when they load (`src/coverpaint.js`: a first wash, then real brush strokes on the
  shop's diagonal with colours read from the cover, finer marks where it has detail, paper grain and an unpainted
  margin), so real album art sits in the painting. The racks and the suitcase paint them in a worker
  (`src/coverworker.js`, `src/coverpaint.worker.js`), since strokes take 40-100 ms a cover. Settings > Cover art sets the strength.
- In a plain browser (`npm run web`, screenshots) `src/music.js` fakes a record store with painted
  covers, so the shop can be worked on without Electron or an account.
- Dev pages for screenshots: `lab.html?station=N` (one rack), `player-lab.html` (the suitcase in the shop),
  `mini.html`, `search-lab.html`, `cover-lab.html` (covers before / after painting). Shop URL options: `?at=home|N` start there, `?hover=N`, `?fly=from,to,p`,
  `?search=lemon`, `?shelves=8` (fake store: fill every station).

```
npm test                                   # parser, suitcase (lid, knob, scrub, tonearm) tests
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app vs YouTube Music: shelves, hover, play, buttons
```

Not yet: playlists/albums opening as a rack of their own songs (clicking one plays the whole thing
for now), media keys. Untested on a Mac: the mini player's focus/Dock behaviour and the real
global shortcut.
