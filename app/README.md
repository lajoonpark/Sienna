# Sienna app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

The opening shot: a narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Sienna shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. All scenery is procedural.

**Look:** painted, through a screen pass (`src/watercolour.js`): brush strokes pinned to the world's surfaces by default (`src/brushstrokes.js`), or a watercolour wash with hand wobble, colour bleed, wet edges and paper grain (Settings > Painting). Both have a ragged paper border. `?style=flat` shows the old flat toon look.

**Lettering:** buttons, record tags and the shop sign use one hand-lettered font, chosen in Settings > Lettering: Amatic SC (default, all hand-drawn capitals, so all-caps song names match), Kaushan Script, Sriracha or Caveat (`FONTS`/`FONT` in `src/style.js`, bundled via `@fontsource` in `src/fonts.js`, one weight each). `?font=kaushan` pins one for screenshots. A change applies live in both windows, with no reload: `FONT`/`fontReady` are live exports, CSS uses `var(--sienna-font)`, and everything painted into a canvas or texture (tags, rack signs, the shop sign, button plates, menu words, search bar, album-spread stickers) registers a repaint with `onLettering(owner, draw)` in `src/style.js`, which runs once the new face has loaded. New lettered paint must register too. Check: `npm run build && xvfb-run -a node scripts/mini-font-check.mjs out` (mini window, no reload) and `node scripts/tour-check.mjs out`.

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

- **Sign in** once with the SIGN IN button (or from the first-run tour's welcome note) (a Google window that shares the player's cookies, kept in
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
- **Mini player**: **⌃⌥K** anywhere opens the same suitcase at the cursor on a torn-paper card
  (`mini.html`, `electron/mini.cjs`); the lid flicks open on a physical hinge (`src/lid.js`). Esc,
  clicking away or ⌃⌥K again shuts it. The search shortcut works there too.
- **Volume**: on macOS the knob, scroll and ↑ ↓ set the Mac's own output volume (`electron/sysvolume.cjs`,
  osascript) and the player stays at 100%, so you can turn it up past where the Mac was. Elsewhere it
  is the player's volume.
- **Search**: **⌃⌥J** (Ctrl+Alt+J on Windows/Linux) opens a search bar (`src/search.js`). The bar is
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
- **Shortcuts**: search **⌃⌥J**, full app **⌃⌥L**, mini player **⌃⌥K** by default, changed in Settings >
  Shortcuts (click one, press the new keys, Esc cancels; Reset puts the defaults back). The main process
  owns them (`electron/shortcuts.cjs`, saved in userData `shortcuts.json`, so they are known before a page loads)
  and registers the full-app and mini ones as global shortcuts; search is matched in each window
  (`src/shortcuts.js`). While one is being recorded the global ones are let go, so pressing the current
  combination reaches the card. A combination already used by another of the three is refused, and so is a
  global one the system will not give (another app owns it). Check:
  `npm run build && xvfb-run -a node scripts/shortcuts-check.mjs out`.
- **Settings**: the SETTINGS word (top right) or **⌘,** (Ctrl+, elsewhere) opens a paper card
  (`src/settings-panel.js`, stored by `src/settings.js` in localStorage, shared with the mini window).
  *Painting* sets the look: Faint / Light / Medium / Heavy watercolour, or Brush strokes (default), which repaints the world with strokes pinned to its surfaces: a full coat pulled in one direction, each stroke kept to its own surface, so the paint looks laid on by one hand, moves with the world and stays still when the camera does, while only the ragged border keeps boiling (`src/brushstrokes.js`; check with `scripts/still-check.mjs`). Each stroke takes its colour from its whole patch of the picture and the wash under the strokes stays a little soft, so the paint does not shimmer while the camera moves (measure with `node scripts/flicker-check.mjs <out> [query]`: share of pixels flipping brighter/darker during the intro, plus a heat map). Faint is the
  old single pass; the others flatten shading into washes and let colour bleed (`LEVELS` in
  `src/watercolour.js`). `?wc=0..4` (or `SIENNA_QUERY="wc=2" npm run dev`) pins a level for screenshots.
  *Cover art* sets how strongly covers are painted (Off to Heavy, default Heavy). *Start of a song* plays
  when the arm lands (default) or at once. *Smoothness* caps the frame rate at 60 or 30 fps. *Lettering* picks the font
  (each choice is written in itself); it applies at once in both windows, without a reload (tags, signs and buttons repaint in place).
  *Frame rate* shows an fps readout. *Tour* > SHOW IT AGAIN starts the first-run tour from the door. The card lays rows in two columns when there is room.
- **First-run tour** (`src/tour.js`): on a new install, once the intro reaches home, torn paper notes in the shop
  walk you through it, with brush-stroke words floating (bobbing) under each note instead of a settings card:
  *welcome* (SIGN IN or LOOK AROUND FIRST, with the small print as four price stickers slapped on one by one: FREE,
  makes no money; PRIVATE, no servers and keeps nothing about you; ADS?, without Premium YouTube Music plays its own
  and Sienna earns nothing from them; OPEN SOURCE, the code is at github.com/lajoonpark/Sienna), *paint* (brush strokes or a watercolour, applied live),
  *letters* (the lettering, applied live), *smooth*
  (60 or 30 fps), *record* (a small note at the top while you pick a record; the shop's keys work, it fades at a rack
  and moves on once a song plays), *player* (beside the suitcase: the knob is the Mac's own volume, scrubbing, keys),
  *keys* (each shortcut ticks when pressed; the global ones are reported by `keys:used` from `electron/shortcuts.cjs`;
  click one to change it, `shortcuts.record` in `src/shortcuts.js`) and *bye* (menu bar, ⌘,). SKIP TOUR or Esc ends it.
  Each note drops in with a bounce, its title falling letter by letter over a brush underline and its words inking
  in; a record with the step number slides out from behind it and spins, and a row of little records at the bottom
  shows the track you are on. Moving on flicks the note off to one side. Clicks, ticks, a first record and the
  goodbye burst into paint, confetti, music notes and records (`src/tourfx.js`: one canvas behind the notes that only
  draws while something is flying). Reduced motion and `?shot` keep it all still.
  While a centred note is up the shop's own keys are quiet. The step reached is saved in localStorage `sienna.tour`.
  Installs from before the tour (saved settings, or already signed in) do not get it on their own, nor does a plain
  browser or an automated run (`navigator.webdriver`), so the check scripts see the shop as before. `?tour=0` keeps it
  away, `?tour=new` runs it as a new install, `?tour=<step>` shows one step unsaved (`&guest` for the guest welcome):
  `SIENNA_QUERY="at=home&tour=keys" node scripts/shot.mjs out 3`. Check: `node scripts/tour-check.mjs [out]`.
- **Heat / battery**: the shop is drawn at that cap only while something moves (camera, input, flights,
  lid); once still it drops to 12 fps (30 while a record spins on screen), and stops while the window is
  hidden, minimised or covered (`src/pacer.js`; `node scripts/idle-check.mjs [rack]` checks it).
  **Still frames**: a frame is painted again only as far as it differs from the one before. `src/still.js`
  writes down everything a frame is made from (where each visible thing is, colours, textures, lights,
  camera) and compares it with the last frame's; the painter (`Still frames` in `src/watercolour.js`) then
  draws nothing if nothing changed, only four strips along the edges if just the ragged border boiled,
  only the suitcase's corner if just its record turned (the world's pixels under it are kept and put
  back), and the whole frame only when the world itself changed. So the shop's 3.8 million triangles,
  its shadows and the stroke passes are drawn while something in the shop moves and not otherwise. The
  screen keeps its picture between frames for this (`preserveDrawingBuffer` in `main.js`). The older
  watercolour looks boil all over, so they repaint the bleed and the final pass per boil step, but not the
  scene. A frame put together in parts is the same picture to the last bit as a whole repaint:
  `node scripts/cache-check.mjs` compares them and counts what was painted (`__siennaDebug.painter.stats`).
  Things that help the shop come to rest: the time of day is worked out every 5 s of the clock, not every
  frame (`src/timeofday.js`); the cursor tilt snaps the last 1/30 px; under a shut lid (case tucked away)
  the record and arm are not posed. Bricks, tiles and slats are instanced per 8 m square of ground
  (`src/kit.js`), so what is outside the view is not sent to the GPU while the camera does move (43%
  fewer of those triangles on average, for 15 more draw calls).
  The hidden YouTube Music window is throttled like a background tab (no painting, no video decoding,
  smallest video stream). While a Sienna window is on screen it is polled 4x a second while a song plays
  or loads and for 6 s after anything was asked of it, twice a second while it sits paused; every 3 s
  otherwise. The hidden mini window is sent the player's state only when something other than the
  position changes (and the newest just before it opens). The macOS volume is read (an `osascript` run)
  only while a window is on screen: every 3 s while Sienna has the keyboard, every 12 s while you are in
  another app, and at once when you come back.
- **Memory**: the sun's 4096 px shadow map (128 MB of video memory) is let go of while the sun is down
  (`src/timeofday.js`). A resting cover's canvas is shrunk to a pixel once the picture is on the GPU
  (`slim` in `src/racks/common.js`, about 50 MB for a full shop). The mini window makes no travelling
  washes (it has no camera to travel).
- **Covers**: playlist and mix covers are found in any of YouTube's thumbnail shapes; one that is
  missing or fails to load is painted as a collage of the playlist's first songs (`src/cover.js`).
  `SIENNA_DUMP=1` (unpackaged runs only) saves the API responses to the app's userData (`dumps/`, readable by
  you only, tracking/session identifiers stripped, newest 40 kept, none older than a day) and logs any item
  without art, for debugging. They still describe your library and listening: do not share them.
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

- **Security** (`electron/security.cjs`): every renderer is sandboxed (`app.enableSandbox()`). Permission
  requests are refused, except full screen and copy-to-clipboard for music.youtube.com. No window opens popups
  or `<webview>`s; the shop and mini window never leave their own page, the player and sign-in windows stay on
  Google's sites. The main process answers ipc only from Sienna's own pages in its own windows. Cover urls must
  point at Google's image hosts (checked on the parsed host: `cleanUrl` in `ytm-parse.cjs`, `src/arturl.js`),
  and the pages' Content Security Policy (`index.html`, `mini.html`) enforces the same; downloads are capped
  at 8 MB / 4096x4096 px with a 15 s timeout. The check scripts write to a fresh private temp folder unless
  given one (`scripts/safe.mjs`) and only pass `--no-sandbox` when run as root or with `SIENNA_NO_SANDBOX=1`.

```
npm test                                   # parser, suitcase (lid, knob, scrub, tonearm) tests
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app vs YouTube Music: shelves, hover, play, buttons
```

Not yet: playlists opening into their songs like albums (clicking one plays the whole thing
for now), media keys. Untested on a Mac: the mini player's focus/Dock behaviour and the real
global shortcuts.
