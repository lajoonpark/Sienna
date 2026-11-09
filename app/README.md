# Sienna app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

The opening shot: a narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Sienna shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. All scenery is procedural.

**Look:** painted, through a screen pass (`src/watercolour.js`): brush strokes pinned to the world's surfaces by default (`src/brushstrokes.js`), or a watercolour wash with hand wobble, colour bleed, wet edges and paper grain (Settings > Painting). Both have a ragged paper border. `?style=flat` shows the old flat toon look.

**Lettering:** buttons, record tags and the shop sign use one hand-lettered font, chosen in Settings > Lettering: Amatic SC (default, all hand-drawn capitals, so all-caps song names match), Kaushan Script, Sriracha or Caveat (`FONTS`/`FONT` in `src/style.js`, bundled via `@fontsource` in `src/fonts.js`, one weight each). `?font=kaushan` pins one for screenshots. A change reloads both windows; the mini window is reloaded by the main process (`mini:reload` in `electron/mini.cjs`, as its page cannot navigate itself) and opens its lid again if it was on screen. Check: `npm run build && xvfb-run -a node scripts/mini-font-check.mjs out`.

**Name:** the app was called Cadence until 2026-11-08. On first launch, `electron/main.cjs` moves the old `cadence-app` data folder (YouTube Music sign-in, settings) to `sienna-app`, and `src/settings.js` carries over the old `cadence.settings` key. Env vars are `SIENNA_*` (were `CADENCE_*`).

**Everything is real geometry**, with no brick textures. `src/kit.js` collects thousands of bricks, flagstones, roof tiles and shutter slats into a few instanced meshes. `src/masonry.js` lays brick walls course by course around openings, builds arches with voussoirs, barrel vaults, stucco with patches of exposed brick, and paving. `src/details.js` has windows, louvred shutters, doors, balconies, lanterns, eaves and pots. `src/props.js` has street life, and `src/interior.js` has shop furniture.

**The shop** (`src/shop.js`) is a row of brick vaults going back, one per category zone (`ZONES`): the big hall with crate-digging tables and a U-shaped gallery with a spiral stair, the listening lounge, the stacks, the plant room under a skylight, and an open courtyard with a lemon tree.

**Time of day** follows the viewer's clock (`src/timeofday.js`): sky, sun, shadows and fog blend through night, blue hour, sunset, golden hour and day. Lamps are always there and switch on one by one at dusk with a short flicker (`src/env.js`). Windows light up through the evening.

```
npm install
npm run dev                 # vite dev server + opens the Electron window; menu bar icon has "Open Sienna"
npm run web                 # just vite on http://127.0.0.1:5173 (open in a browser)
                            # dev and web first run scripts/deps.mjs: npm install if a pull added packages
npm run build && npm run electron
SIENNA_DEV_URL=http://127.0.0.1:5173 npm run electron   # electron against the dev server
node scripts/shot.mjs out_dir 0 4 6.5 10   # headless screenshots at given seconds (intro reaches home at 10)
SIENNA_QUERY=hour=21 node scripts/shot.mjs out_dir 0 10           # at 9 pm
SIENNA_QUERY='cam=-4.4,4.65,-3.3,2,3.2,-9.5' node scripts/shot.mjs out_dir 9   # pinned camera (x,y,z,target)
node scripts/make-icons.mjs  # re-render the icons after editing icons/*.svg
```

**Icons** are drawn as SVG in `icons/`: `app-icon.svg` (a cream sleeve with a painted lemon branch, record sliding out, on painted sienna; macOS grid, 824 px body in 1024) and `menubar.svg` (record peeking out of a sleeve). `scripts/make-icons.mjs` renders them to `electron/icon.png` (set as the Dock icon on macOS and the window icon elsewhere) and `electron/trayTemplate.png` / `@2x` (black on transparent; macOS tints it for light and dark menu bars). There is no packaged build yet, so there is no `.icns`; a packager can take `icon.png`.

URL options: `?hour=20.5` freezes the clock, `?speed=600` runs it faster, `?cam=x,y,z,tx,ty,tz` pins the camera, and `?style=flat` shows the old look.

## Music (YouTube Music)

A hidden `music.youtube.com` window plays the audio (`electron/ytm.cjs`). YouTube Music itself does
the queue, radio, ads, history and likes; Sienna drives it through a small script injected into the
page (`electron/ytm-page.js`) and reads your home shelves from the same internal API the page uses
(`electron/ytm-parse.cjs`, unit tested against a real response in `test/fixtures/home.json`). The
shop talks to it only through `window.sienna` (`electron/preload.cjs`).

- **Sign in** once with the SIGN IN button (a Google window that shares the player's cookies, kept in
  the `persist:ytm` partition). Without signing in it works as a guest, with ads and generic shelves.
- **Home**: the intro is a 10 s shot (`src/nav.js` SHOT = where the camera goes, PACE = how fast):
  low behind the fruit stall, rising under the arch, a slow beat under the Sienna sign while the doors
  open, then through them to a home spot just inside the shop. Painted cinema bars (`setBars` in
  `src/watercolour.js`) frame it and slide away on arrival. Intro-only lighting (`src/introlight.js`,
  on top of the real time of day): a cool street grade turning warm through the door, a vignette, warm
  light spilling from the opening doors, hazy sun beams in the piazza while the sun is up, and after
  dark the lamps wake one by one as the camera nears them (`lampWake` in `src/env.js`). Click or press
  any key to skip it. Your YouTube Music shelves ("Quick picks", "Listen again"...) are the
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
  A spinner record lifted from a side face comes forward along your line of sight until it is wholly
  in front of the tower, shrinking just as much, so it looks the same size in the same spot but never
  cuts into the tower's corner (`CLEAR` in `spinner.js`). Check:
  `node scripts/spinner-clip-check.mjs [out] [tower angles]` (`SHOTS=1` saves every settled hover).
  At the courtyard stall, hovering a crate makes all its records float up in front of you, spread
  out so every cover shows; the one under the cursor grows and comes forward with its tag.
- **Albums** (`src/spread.js`, any rack): pressing an album's record fans its songs out of the sleeve
  as bare vinyls in an arc in front of the camera (one or two rows), each with the album cover on its
  label and its track number on a paper sticker, plus a red play-all record first. The one under the
  cursor grows toward you along its sightline (so it stays under the cursor), spins up and shows a
  tag (title, track, length). Pressing a song flies it to the suitcase and plays it inside the album's
  playlist, so the album carries on from there; play-all plays the album from track 1. 15 songs a
  page: a sideways scroll or the paper arrows turn it. Esc, a click on empty space or leaving the
  rack sends them back into the sleeve. Songs come from `albumSongs` in `electron/ytm.cjs` (the
  album playlist's `next` queue minus the music-video `counterpart` of each track, browse `VL<id>` as fallback, cached), fetched as soon as an album
  is hovered. No songs: it plays the whole album as before. Playlists and mixes still just play.
  Fake store: `?albums=1` adds an albums shelf (counter easel, station 3). Screenshots:
  `?at=3&hover=0&albums=1&open=2&spreadhover=4` (`spreadpage=1`, `spreadt=0.4` freezes the flight
  out). Checks: `node scripts/spread-check.mjs [out]` (real mouse, fake store),
  `xvfb-run -a node scripts/album-live-check.mjs [out]` (song lists from YouTube Music, as guest).
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
  brushed in row by row, zigzagging, with the shop's brush (`src/brushpaint.js`), arrows + Enter or a click plays one. A song from search has no sleeve, so
  the bottom of the case slides out like a drawer, the record lifts out of it, tips towards you and
  flies onto the platter, and the drawer slides home (`src/suitcase/tray.js`, in the shop and the mini
  window; the shop's case rises a little meanwhile so the drawer stays in the picture). `?tray=0.6`
  freezes it for screenshots (shop: `SIENNA_QUERY="tray=0.6" node scripts/shot.mjs out 8`; mini:
  `SIENNA_PAGE=mini.html SIENNA_VIEWPORT=540x620 SIENNA_QUERY="tray=0.6" node scripts/shot.mjs out 2`).
  Shutting the mini window before the record is down puts it straight on and starts the song as soon
  as it has loaded (nothing is drawn while the window is hidden, so the arm would never land). Check:
  `node scripts/mini-close-check.mjs`.
- **Settings**: the SETTINGS word (top right) or **⌘,** (Ctrl+, elsewhere) opens a paper card
  (`src/settings-panel.js`, stored by `src/settings.js` in localStorage, shared with the mini window).
  *Painting* sets the look: Faint / Light / Medium / Heavy watercolour, or Brush strokes (default), which repaints the world with strokes pinned to its surfaces: a full coat pulled in one direction, each stroke kept to its own surface, so the paint looks laid on by one hand, moves with the world and stays still when the camera does, while only the ragged border keeps boiling (`src/brushstrokes.js`; check with `scripts/still-check.mjs`). Each stroke takes its colour from its whole patch of the picture and the wash under the strokes stays a little soft, so the paint does not shimmer while the camera moves (measure with `node scripts/flicker-check.mjs <out> [query]`: share of pixels flipping brighter/darker during the intro, plus a heat map). Faint is the
  old single pass; the others flatten shading into washes and let colour bleed (`LEVELS` in
  `src/watercolour.js`). `?wc=0..4` (or `SIENNA_QUERY="wc=2" npm run dev`) pins a level for screenshots.
  *Cover art* sets how strongly covers are painted (Off to Heavy, default Heavy). *Start of a song* plays
  when the arm lands (default) or at once. *Smoothness* caps the frame rate at 60 or 30 fps. *Lettering* picks the font
  (each choice is written in itself); the shop reloads to repaint tags, sign and buttons (to home, card open), the mini window reloads too.
  *Frame rate* shows an fps readout. The card lays rows in two columns when there is room.
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
  `?search=lemon`, `?shelves=8` (fake store: fill every station), `?albums=1` (fake store: an albums shelf).

```
npm test                                   # parser, suitcase (lid, knob, scrub, tonearm) tests
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app vs YouTube Music: shelves, hover, play, buttons
```

Not yet: playlists opening into their songs like albums (clicking one plays the whole thing
for now), media keys. Untested on a Mac: the mini player's focus/Dock behaviour and the real
global shortcut.
