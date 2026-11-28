# Sienna app

A 3D vinyl shop for YouTube Music (free, open source). Electron + Three.js.

The opening shot: a narrow Tuscan alley of brick and stucco houses, an arch over the street, a little piazza, and the Sienna shop. The door swings open on its own, the camera walks into the shop, and the view tilts with the cursor. The tilt is a critically damped spring (`src/camera-tilt.js`, `tilt.step` in `main.js`): it keeps its speed capped on wide sweeps, bends rather than yanks when the cursor reverses, and steps on the frame's clock so it feels the same at 30 and 60 fps. All scenery is procedural.

**Look:** painted in oil, through a screen pass (`src/watercolour.js`, `src/oilpaint.js`): opaque dabs on the brush strokes' places (`src/brushstrokes.js` places them, pinned to the world's surfaces), each with its object's own paint, lit live, with impasto ridges, over an under-coat of smaller dabs so no canvas is left bare; full bleed, no border. Oil paint is the only look: the watercolour (Faint / Light / Medium / Heavy) and Brush strokes looks and the Settings > Look > Painting choice were removed when oil-paint was merged into dev (Lajoon, 2026-11-13). The mini window's suitcase card matches (`CARD_OIL` in `src/watercolour.js`): full-bleed oil-dabbed suitcase and canvas backdrop with linen weave and no wash. `?wc=0` shows the plain unpainted render (for the check scripts); `?style=flat` shows the old flat toon look.

**Lettering & UI tokens:** display text (titles, buttons, record tags, shelf words and the shop sign) uses one hand-lettered font, chosen in Settings > Look > Lettering: Amatic SC (default, all hand-drawn capitals, so all-caps song names match), Kaushan Script, Sriracha or Caveat (`FONTS`/`FONT` in `src/style.js`, bundled via `@fontsource` in `src/fonts.js`, one weight each). Small text (hints, meta, times, lyrics, Settings copy, tour body and fine print) uses the bundled book serif Alegreya (`--sienna-serif`, with lining tabular figures for times). `?font=kaushan` pins a lettering for screenshots. A lettering change applies live in both windows, with no reload: `FONT`/`fontReady` are live exports, CSS uses `var(--sienna-font)`, and everything painted into a canvas or texture (tags, rack signs, the shop sign, button plates, menu words, search bar, album-spread stickers) registers a repaint with `onLettering(owner, draw)` in `src/style.js`, which runs once the new face has loaded. New lettered paint must register too. The shared 2D UI kit lives in `src/ui/`: `tokens.js` (palette, including the kraft and board-edge browns of the crate cards and the night of the carousel; 6-step type scale, 4 px spacing scale, 3 tilts, 2 elevations, 3 durations/easings with centralized reduced motion, focus ring and z-index scale, injected onto `:root` via `injectTokens()` and exported as JS constants for canvas painters), `paper.js` (`paperSurface()`: every card is flat board with a rag-fibre grain tile, its cut edge along the bottom and a soft shadow), `crate.js` (die-cut divider tabs on a card's top edge, `renderHints()` for the one line of keys with keycaps, `signboard()` for headings on a painted indigo plate, and `cardMotion()`, which tips a card up like a record flipped forward in a crate, tips it back to leave and eases its height as its contents change), `veil.js` (the dimmed shop behind a menu, left thin in a pool of lamplight on the suitcase, `setLamp()`; the mini window keeps it inside its painted card with `--veil-*`), `brush.js` (`brushStroke()` and `brushButton()`, with an optional icon and spinner, and a shared LRU plate cache), `inputs.js` (`inkButton()`, `segmented()` tabs/radios with roving tabindex, drawn as a record-player switch whose painted key slides to the choice or as divider tabs, and `stamp()` icon tools with card tooltips), `icons.js` (18 hand-drawn SVGs in one stroke style, plus `kindIcon(kind)` which maps a list row's kind to a glyph: `video`→song, `single`/`ep`→album, `episode`→podcast), `sheet.js` (`createSheet()` modal card on the veil that flips like the other cards, Esc, focus trap, and `overlayOpen()`/`onOverlay()`), `list.js` (`createList()` with ruled rows set like a printed track list (`lines`) or cached oil-dab slips, a terracotta cursor mark, indigo now-playing mark, kind icons (`showKind: 'mixed'` only when kinds differ), keyboard cursor, 40-row batching, and notes), `cover-carousel.js` (the record wheel, below) and `banner.js` (`createBanner()` for offline, error, and restock notices). `smooth-scroll.js` gives every scrollable surface its heavy smooth wheel glide: `smoothWheel(scroller)` turns wheel deltas into an exponential ease (`followScroll`/`scrollStep`, rate 14/s, line/page units resolved) instead of a jump, drops scroll-snap while it glides and hands control straight back to a pointer press, a key or focus, and to any programmatic scroll (`stopScroll`, called before `scrollIntoView` reveals and on close); reduced motion keeps native scrolling. Unit-tested in `test/smooth-scroll.test.cjs`. Preview the full kit in `ui-lab.html` (`?font=`, `?sheet=1`, `?compare`). Checks: `node scripts/contrast-check.mjs` (verifies every token text/background pair under 24 px reaches >= 4.5:1), `node scripts/ui-lab-check.mjs [out_dir]` (verifies every kit part, ARIA/focus/keyboard behaviour, caching, and 2 s idle stillness), `node scripts/ui-matrix.mjs <out_dir> [surface-filter]` (captures every app and lab surface across all 4 letterings and 2 window sizes as labelled contact sheets), `npm run build && xvfb-run -a node scripts/mini-font-check.mjs out` (mini window, no reload) and `node scripts/tour-check.mjs out`.

**Name:** the app was called Cadence until 2026-11-08. On first launch, `electron/main.cjs` moves the old `cadence-app` data folder (YouTube Music sign-in, settings) to `sienna-app`, and `src/settings.js` carries over the old `cadence.settings` key. Env vars are `SIENNA_*` (were `CADENCE_*`).

**Everything is real geometry**, with no brick textures. `src/kit.js` collects thousands of bricks, flagstones, roof tiles and shutter slats into a few instanced meshes. `src/masonry.js` lays brick walls course by course around openings, builds arches with voussoirs, barrel vaults, stucco with patches of exposed brick, and paving. `src/details.js` has windows, louvred shutters, doors, balconies, lanterns, eaves, pots and plants (bush, geranium, lemon, monstera, fern, snake plant; rail planters, ivy up posts, bougainvillea over arches) and `chain()`, the brass link chains the hanging plants hang from. `src/props.js` has street life, and `src/interior.js` has shop furniture.

**The shop** (`src/shop.js`) winds back from the street over four floor levels, one room per category zone (`ZONES`): the big hall with crate-digging tables and a U-shaped gallery (+3 m) with a spiral stair; three steps down to the sunken lounge (-0.6 m) with a big arched window onto the garden; through an arch on its right into the stacks, a two-storey library vault running sideways with a walkway across its far end (built in its own frame, `stacksFrame()`); up a stone stair to the glasshouse (+1.2 m), an iron-and-glass lean-to; out onto a terrace and down its steps into the garden courtyard, open to the sky, which wraps round behind the lounge (so you see it through the lounge window long before you get there). From the stacks, the glasshouse, the terrace and the garden the street is never visible, nor the hall from the stacks, glasshouse and terrace, so `src/main.js` does not draw them there (`streetHidden`, `hallHidden` in `src/shop.js`, never true inside the hall box `inHall`, e.g. at the counter at x 4.0; the hall is its own group, `root.userData.hall`, with its lamps' lights kept outside it so the light count never changes). Plants are everywhere: hanging pothos, ferns and string-of-pearls on brass chains (`hangingPlant()` in `src/interior.js`) in every room, planters on the gallery rail, bougainvillea over the courtyard arches.

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

### UI revamp phases

The shared tokens and serif small text (phase 1), then the UI kit and `ui-lab.html` (phase 2),
are now used by these surfaces merged into `dev`:

| Phase | Surfaces | Implementation and focused check (run from `app/`) |
| --- | --- | --- |
| [3 — player and home](https://github.com/lajoonpark/Sienna/pull/3) | Shop/mini now-playing tag, shelf plates, Restock/Settings words and FPS ticket | `src/controls.js`, `src/menu.js`, `src/main.js`; `node scripts/home-check.mjs <out_dir>` |
| [4 — lists](https://github.com/lajoonpark/Sienna/pull/4) | Search, collection songs and Up next | `src/ui/list.js`, `src/list-bar.js`, `src/search.js`, `src/collection-list.js`, `src/liner.js`; `node scripts/lists-check.mjs <out_dir>` |
| [5 — sheets](https://github.com/lajoonpark/Sienna/pull/5) | Settings, Lyrics, tour notes, status banners and WebGL fallback | `src/ui/sheet.js`, `src/ui/scroll-cue.js`, `src/settings-panel.js`, `src/liner.js`, `src/tour.js`, `src/main.js`; `node scripts/sheets-check.mjs <out_dir>` |

### Crate cards (menus)

Lajoon asked for the menus to be redone (2026-11-27): the torn-paper sheets, the "roll down" (which
looked nothing like paper), the painted search bar and covers that only grew in felt unfinished and
inconsistent. Every menu is now one of two things from the record shop:

- **A crate card** (Search, collection songs, the Up next list, Settings, Lyrics, and the tour notes,
  banners and now-playing tag): rigid sleeve card (`ui/paper.js`) that tips up like a record flipped
  forward in a crate and tips back to leave (`cardMotion` in `ui/crate.js`, or the matching CSS in
  `ui/sheet.js`). Rigid, so it moves believably in CSS; nothing bends or rolls. Where a card has
  sections they are die-cut divider tabs on its top edge (search filters, Settings pages); a field
  filter inside a collection is a switch. One header, one close stamp, and one line of keys
  (keycaps) under the card, on the dimmed shop. Track titles and Settings copy are Alegreya; the
  chosen lettering is for signs, tabs, headings and big captions.
- **Loose records** (the Up next carousel and the mini player's Listen again): no card at all, the
  sleeves float on the dimmed shop under a painted sign, with the lamp on the suitcase.

Behind every menu `ui/veil.js` takes the lights down; `main.js`/`mini.js` keep its pool of light
on the suitcase's drawer (`onOverlay` → `setLamp(drawerScreenPos())`). The mini window sets
`--list-top`, `--list-bottom` and `--veil-*` in `mini.html` so menus stay inside its painted card.

Search, collection songs and the Up next list use `ui/list.js` in `lines` mode: ruled rows (62 px)
on the card, a `--sienna-paper-lo` wash and terracotta bar on the cursor row, indigo for the playing
song, and a kind mark (`icons.js` via `kindIcon(item.kind)`, `role="img"` named after the kind) only
when a list mixes kinds (`showKind: 'mixed'`). Search keeps its debounce, cache, stale-answer guard
and pending Enter. Collection lists filter locally and append 40 songs at a time; Play picks the
first filtered song and Shuffle uses the filtered pool. `collection.open(collection, songsOrPromise)`
remains supported; a loader function returning a promise enables genuine Retry. While Up next is
open, arrows and Enter belong to the queue, never the shop; normal shop/mini Space and Tab ownership
is unchanged.

### The record carousel

Settings > Look > **Cover carousel** (`coverCarousel` in `src/settings.js`, on by default) uses
`createCoverCarousel` (`src/ui/cover-carousel.js`): Up next is a horizontal wheel centred on the
playing song (a **Now playing** button re-centres it; arrows, scroll, drag and Enter all work, and
Tab stays inside), the search card gains a `cs-result-strip` of the top five results above its rows
(a modifier chord, the first of Alt, Shift, Alt+Shift or Ctrl+Shift not taken by the configured
shortcuts, + ↑ hands it the keyboard; ←→ choose, Enter plays, ↓ returns to the list), and in the
mini window an empty search shows **Listen again** as a vertical wheel under a card of just the tabs
and search line (`coverSuggestions`, `suggest`, `drawer` in `src/mini.js`; the shop search takes no
suggestions). Each sleeve is real 3D (front and back faces, cut edges, a spine) with its vinyl poking
out, and the wheel leans a few degrees with the cursor (`createCoverTilt` on the stage only, so
lettering never skews; off under reduced motion). The caption gives the title, artist and place
("3 of 14") under the centred sleeve.

**The deal.** Opening the full wheels slides the suitcase's drawer out (`tray.openHold`, no 3D
disc stack) and `enter({ origin })` deals the sleeves out of it: each starts lying in the drawer at
a record's size (`tray.screenSpan` gives the drawer's place and a record's width on screen), arcs
up, grows as it nears its slot and swells a touch as it lands; farthest first, the centred (playing)
sleeve last, then its vinyl slides out and the caption inks in. Closing sends them back
(`leave({ origin })`, the centred one first) before the drawer shuts and the now-playing tag
returns. Any key, wheel or press skips to the end (`settle()`), and reduced motion skips both.
Picking a cover that is not centred first spins the wheel to it and only then plays it. A centred
pick slides the disc out of its sleeve (`extractDisc`), the other sleeves fade, and the record flies
from where it sat on screen onto the platter through the 3D scene (`receiveFromScreen` in
`src/suitcase/flight.js`; Esc, Enter or a click skips the flight and seats it at once —
`listenForCoverPickSkip` in `src/ui/cover-pick-input.js`, `finishScreenPick`). **List** keeps the
ruled rows and the drawer's 3D stack. The setting flips live in open menus and restores the wheel's
focus when Settings closes.

`node scripts/lists-check.mjs <out_dir>` checks all three real components against an isolated fake
store: tabs, key lines, focus/ARIA/keys, notes and retries, 612-song batching/filtering/actions, live
queue state, bounded painting, no native control titles and two seconds with no kit/shared-bar
callbacks. It also drives the carousels (floating queue and Listen again wheels, drawer opening,
keyboard, wheel, drag, now-playing jump, reduced motion, queueIndex and the live list fallback), the
search result strip, the card flip (including changes of mind halfway) and the pick flight's skips.
`node scripts/search-anim-check.mjs <out_dir>` checks the motion on a real GPU: the card flips at
60 fps with typing live from the first frame, and in the mini player the sleeves start in the drawer
at record size, the centred one lands last, a key skips the deal and closing sends them back before
the drawer shuts. `search-check` and `mini-suggest-check` retain their interaction and prefetch
coverage.

### Settings, Lyrics and notes

Settings and Lyrics use `createSheet()`: labelled modal cards on the veil that flip like the other
cards, with a close stamp, Escape, focus trap and return to the opener. Only the topmost sheet
handles Tab and Escape; opening Settings over Lyrics or a tour note leaves the underlying surface
open. Tab-focused controls scroll into view clear of the bottom fade. Settings' pages are divider
tabs on its top edge (`aria-current="page"`; the arrow keys move between them, and it opens with the
open page's tab focused), each setting is a row with its switch or buttons on the right, and the
shortcuts are keycaps you click to record. About groups version, manual updates and diagnostics.
Lyrics shows the song's title with its artist (and album) under it and reading-size Alegreya, with
loading, empty and retryable error states, live track changes and Queue exclusion. Both keep caption
ownership.

`src/ui/scroll-cue.js::createScrollCue(scroller, { parent })` fades the bottom of a scroller while
more content remains, clearing at the last row; it observes changes rather than polling. Tour notes
are cards with their tape and effects, serif body text, a brush Sign in and ink choices/navigation,
including Back. Notes clamp to the viewport; overflowing notes remain scrollable.
Offline/error/restock notices use `createBanner()`; the WebGL fallback uses the same card and
typography.

`node scripts/sheets-check.mjs <out_dir>` exercises real components with an isolated fake store:
dialog ARIA, close/focus/keyboard ownership, tabs/pages, persistent radios and one lettering repaint,
account confirmation/cancel/error recovery, two-size scrolling and last-row reachability, all Lyrics
states/live updates/exclusion, every tour note's viewport bounds and single welcome Sign in,
banner roles/actions, fallback tokens, caption tucking, cached reopening and two seconds with no kit
callbacks. It never authenticates. Existing `account-check`, `tour-check` and `shortcuts-check`
retain their integration coverage; browser checks accept `SIENNA_ANGLE=swiftshader` on Linux.

On macOS, run the browser checks directly, for example `node scripts/sheets-check.mjs <out_dir>`.
Every check picks its GPU through `glArgs()` in `scripts/safe.mjs`: Metal on a Mac, Vulkan elsewhere,
`SIENNA_ANGLE` to override (asking a Mac for Vulkan gets SwiftShader, where checks that time an animation
fail though nothing is wrong). `SIENNA_PORT` moves a check's dev server when its port is taken. The checks
that launch the real app (`shortcuts-check`, `mini-font-check`, `e2e`, `mem-check`, ...) open real windows.
For the Electron shortcut check, use `npm run build && node scripts/shortcuts-check.mjs <out_dir>`
without Linux's `xvfb-run`. Account, sheets, tour, home and shortcut checks use Cmd+, for Settings on
macOS (Ctrl+, elsewhere); shortcut labels are Control + Option on macOS and Ctrl + Alt elsewhere.
These checks default to Metal on macOS and SwiftShader elsewhere; `SIENNA_ANGLE` overrides that.
`node scripts/search-anim-check.mjs <out_dir>` instead defaults to Metal on macOS and Vulkan
elsewhere, and requires a real GPU (it rejects SwiftShader and llvmpipe).

A hidden `music.youtube.com` window plays the audio (`electron/ytm.cjs`). YouTube Music itself does
the queue, radio, ads, history and likes; Sienna drives it through a small script injected into the
page (`electron/ytm-page.js`) and reads your home shelves from the same internal API the page uses
(`electron/ytm-parse.cjs`, unit tested against a real response in `test/fixtures/home.json`). The
shop talks to it only through `window.sienna` (`electron/preload.cjs`).

- **Sign in** once with the SIGN IN button (or from the first-run tour's welcome note, or Settings > Account) (a Google window that shares the player's cookies, kept in
  the `persist:ytm` partition). Without signing in it works as a guest, with ads and generic shelves.
- **Settings > Account** shows who is signed in (name, handle, avatar from YouTube Music's own
  `account/account_menu`), lists the other Google accounts in the player (`account/accounts_list`, YouTube
  Music's "Switch account" list) to switch to, *Use another account* (Google's AddSession page in the sign-in
  window), and *Sign out* (asks first; clears the whole `persist:ytm` partition and reloads the player as a
  guest). A switch follows YouTube's own sign-in link for that account, which stays in the main process
  (`electron/ytm.cjs`). Any change of account (in, out or switched, noticed by the page's `DATASYNC_ID`) sends
  `ytm:account`, and the shop and mini window reload their shelves (`music.onAccount`). The fake store has two
  pretend accounts (`?guest` starts signed out). Parsers: `parseAccount`/`parseAccounts` in
  `electron/ytm-parse.cjs` (`test/account-parse.test.cjs`). Real switching is untested on the server (no Google
  account there). Check: `node scripts/account-check.mjs out`. What the main process remembers of YouTube
  Music's answers (`electron/cache.cjs`: a playlist's songs and covers for 10 minutes, lyrics, capped) is one
  account's, so it is forgotten whenever the account changes; a failed request is never kept, and failed
  lyrics are passed on so the Lyrics card can offer Retry.
- **When the player is in trouble** (offline, YouTube Music not answering, the hidden page crashed) it says so
  on `ytm:status`, retries by itself with a growing wait (also when it keeps crashing) and says it is well
  again only once a page has really loaded. The shop shows the notice with Retry, and asks for the status
  once when it starts, so a shop opened after the trouble began is told too.
- **Home**: the intro is a 10 s shot (`src/nav.js` SHOT = where the camera goes, PACE = how fast):
  low behind the fruit stall, rising under the arch, a slow beat under the Sienna sign while the doors
  open, then through them to a home spot just inside the shop. Painted cinema bars (`setBars` in
  `src/watercolour.js`) frame it and slide away on arrival. Intro-only lighting (`src/introlight.js`,
  on top of the real time of day): a cool street grade turning warm through the door, a vignette, warm
  light spilling from the opening doors, hazy sun beams in the piazza while the sun is up (the doorway glow and
  the beams are sheets the camera walks through, so each dims away over its last 3 m, `NEAR_FADE`), and after
  dark the lamps wake one by one as the camera nears them (`lampWake` in `src/env.js`). Click or press
  any key to skip it. Your YouTube Music shelves ("Quick picks", "Listen again"...) are the
  brush-stroke words down both sides of the screen (`src/menu.js`); click one and the camera walks
  there (`src/nav.js`: along the winding aisle, `SPINE_ORDER`: down the lounge steps, sideways through the stacks, up the glasshouse stair, over the terrace and down into the garden; over the gallery railing). On a long trip (over `FAR_TRIP` 11 m) the camera looks where it is going and turns to the new section over the last fifth. One over `JUMP_TRIP` 20 m (home to the glasshouse or the garden, 27-43 m) is not flown all the way: the camera walks the first 3.5 m, broad oil strokes in the shop's colours are pulled across the 3D picture left to right (under the suitcase and the words; `paintWipe` in `src/oilpaint.js`, `nav.wipe` 0..2 fed to `painter.setWipe`), the camera cuts while they cover it, and they are dragged off the right-hand edge, breaking into bristle tracks, as it walks the last 4.5 m in: 2.55 s in all, the camera never seen faster than a hall trip (`JUMP` in `src/nav.js`). A trip cut short by another click lets its paint back off, or finish coming off. `node scripts/wipe-check.mjs out_dir [to] [from]` flies one on a virtual clock and fails if a cut shows or the paint jumps (`INTERRUPT=frame,station` to cut it short). `node scripts/route-check.mjs [out_dir]` casts rays along every flight and fails if one goes through anything, or if a step inside the hall would hide the hall or the street (frames along each with out_dir). **Tab** /
  **Shift+Tab** go to the next / previous section, **Esc** or HOME goes back. At a section the words
  step back to the edges until the cursor comes near them.
- **Sections** (`src/stations.js`): eight spots in the shop, each with its own kind of rack
  (`src/racks/`): crate table in the hall, cube shelf under the gallery, records leaning on a plinth
  upstairs, a stepped easel on the counter, picture ledges on the lounge's record wall, a library shelf with a
  ladder in the stacks, a spinner rack in the glasshouse, a market stall in the garden (its camera looks back
  across the garden to the lounge window). Shelves
  YouTube always sends have a fixed spot (Quick picks next to home, Listen again on the cube shelf,
  Forgotten favourites upstairs); the others fill the free spots. Hover a record and it comes out
  toward you with a paper name tag; click it and its vinyl pops out and flies into the suitcase.
  On the crate table (Quick picks) the record under the cursor comes up with a neighbour each side,
  fanned like a hand of cards, so each is a big target. At any rack, resting the cursor on a record
  turns the camera part of the way toward it (`updateFocus` in `main.js`, with the hover lock in
  `src/racks/hover.js`: `lockHover` freezes the hovered record to the cursor's spot and `focusHover`
  picks the record under it). The lock shares the rack's lift pick each frame and releases the moment
  the pointer leaves the window or moves off the record, so a sleeve always settles back into its
  slot. Records are picked by where
  they rest, so a lifted record never blocks its neighbours; if the cursor is on none of those, the
  lifted record takes the click, so you click the song, not the rack behind it.
  However a rack lifts, swings or zooms a record, it never leaves the cursor: after each rack poses the
  hovered record, `keepUnderCursor` in `src/racks/common.js` slides it across the view just enough to
  keep the cursor 15% inside its edges, at every moment of the animation, so you can press it without
  moving (check with `SIENNA_GL=vulkan node scripts/cursor-check.mjs [out] [stations] [n]`). It keeps
  the record under where the cursor was when the hover began, not the live cursor, so a lifted record
  never follows the cursor about (`hoverAnchor`), and the camera frames the lifted cover around that
  same anchor alone (`hoverPanBounds` in `src/racks/hover.js`), so drifting the cursor off the record
  hands the hover to the one below instead of panning after it; the cursor tilt of the camera also
  holds while a
  record is up, since turning the camera would slide the record across the rack. Once the camera has
  come to rest framing a lifted record it latches there (`framed`, `framedAtRest` in
  `src/racks/hover.js`; `restPx`/`restZoom`/`restSwing` in `main.js`'s FOCUS), so nothing the record
  does later — the cursor moving on it, the side words — sends the camera off again until the next
  record. Side words a held record still overlaps (`menu.update`'s `hold`) go inert at once, so a
  press on the record can never land on a button; once the record is framed (`aside`) the words it
  still covers slide off to their edge and fade until it goes down.
  The plant-room spinner also turns by hand: scroll sideways (trackpad swipe), or press on the stand and
  drag it round; let go with a flick and it keeps spinning, slowing down (`wheel` / `grab` / `dragTo` /
  `release` in `src/racks/spinner.js`, wired in `main.js`). A press that drags is not a click, and
  records don't lift while it turns. Check: `node scripts/spin-check.mjs [out]`.
  A spinner record lifted from a side face comes forward along your line of sight until it is wholly
  in front of the tower, shrinking just as much, so it looks the same size in the same spot but never
  cuts into the tower's corner (`CLEAR` in `spinner.js`). Check:
  `node scripts/spinner-clip-check.mjs [out] [tower angles]` (`SHOTS=1` saves every settled hover).
  The tower's paint turns with it: its brush strokes and oil dabs are placed in the tower's own frame
  (`userData.strokeTurn` on the turning group = the box it fills; tagged `TURN_TAG` in `aCol.w`; drawn through
  `turnM`, `STROKE_FRAME` in `src/brushstrokes.js`), and the oil under-coat lays its grid in that frame wherever a
  pixel lies in the box. When its rack is baked, the tower is turned a quarter at a time (for the bake only) so
  every side gets strokes from nearly square on (`TURN_FACING`; ~+60 ms on that bake, RX 550). One turning thing at
  a time. Check: `node scripts/spin-paint-check.mjs [out] [turns] [dpr]` (bare share on the tower per angle, and how
  well the paint's pattern follows it: correlation ~0.6 at 0.35 rad; ~0.05 when the dabs were pinned to the world).
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
- **The suitcase** (`src/suitcase/`): the player, bottom left. An oil-painted leather case on woven canvas with a
  record player: the record spins with the cover on its label, the tonearm creeps in as the song
  plays, the knob is volume (drag it or scroll; scrolling down is quieter), the buttons are back / play / skip / like, and
  dragging the record scrubs. A genuine hit on the tucked strip holds it awake while the pointer stays still, even as
  the case rises out from under it; moving away or onto an overlay releases it.
  A shared card tag beside it shows the song with a seekable progress slider
  (`createCaption` in `src/controls.js`, also used in the mini window), with Mute, Shuffle, Repeat, Queue and Lyrics stamps.
  With the slider focused the arrows seek 5 s, Page Up / Down 30 s, Home and End go to the ends (and do not skip songs).
  Its Sign in brush plate hides with the tag while search, collections, Settings, Lyrics, Queue or the tour is open,
  so the tour welcome never duplicates Sign in. Pointer-clicked controls release keyboard focus back to the shop.
  `node scripts/home-check.mjs <out_dir>` checks the shop/mini captions, stamp state and painted tooltips,
  200 paint-free position ticks, overlay tucking/restoration, one Sign in during the tour welcome,
  shelf fitting and lettering repaints, shop keyboard ownership, one FPS paper paint during 2 s of text updates,
  and zero kit rAF/timer callbacks for 2 s with the pointer still (the shop render pacer is excluded).
  Long names never run off it: the title steps down from 26 to 20 px, then wraps onto a second line (cut with … only past that), and the
  artist · album line (in the serif) steps from 16 to 14 px before it is cut; the full text is in the hover tooltip.
  It gets only a light touch of the paint (canvas weave, glazed darks) and
  no wobble or wash inside, since its own textures are already painted with oil dabs: washed, it went blurry and its
  sharp button icons slid off their caps. `?overwash=0..1` gives it that share of the shop's wash back
  (its own wash pass then runs in its box again, ~1 ms).
- **Home chrome**: shelf words and Home share kit brush plates, with fitted multi-line labels and `aria-current` on the active shelf.
  The top-right Restock and Settings controls are ink words with icons; Restock spins while busy and reports Done! on success.
  The FPS readout is a fixed 160 px serif paper ticket at bottom right, clear of Home and the shelves.
  `home-check` also checks Restock success/failure, captures all four letterings at 1280×720 and 1024×640,
  and checks the inset utilities and FPS ticket stay clear of the frame and shelf words.
- **Mini player**: **⌃⌥K** anywhere opens the same suitcase at the cursor on a full-bleed oil-dabbed canvas card
  (`mini.html`, `electron/mini.cjs`); the lid flicks open on a physical hinge (`src/lid.js`). Esc,
  clicking away or ⌃⌥K again shuts it, and so does moving the cursor out of it once the cursor has been over it
  (Settings > Playback > Mini player, on by default; `miniAutoClose` in `src/settings.js`, checked by
  `node scripts/mini-leave-check.mjs`). The search shortcut works there too.
  The hidden window is let go of after five minutes unused and made again when wanted (and when the shop
  window closes), but never once Sienna is quitting: a window made then kept it running, with no player,
  until that window was let go of. A page that never answers the close is put away after 4 s.
  Its lounge lamp follows the time-of-day brightness ramps without warm-up flicker (`steady: true`
  in `src/mini.js`); the shop lamps keep their flicker. From `app/`, run
  `node scripts/mini-light-check.mjs <out_dir>` to compare 24 paused painted mini frames at 08:53
  over the wall glow and check the lamp policy. It writes screenshots and `metrics.json`;
  `SIENNA_ANGLE` overrides the renderer (Metal on macOS, SwiftShader elsewhere by default).
- **Volume**: on macOS the knob, scroll and ↑ ↓ set the Mac's own output volume (`electron/sysvolume.cjs`,
  osascript) and the player stays at 100%, so you can turn it up past where the Mac was. Elsewhere it
  is the player's volume.
- **Search**: **⌃⌥J** (Ctrl+Alt+J on Windows/Linux) tips up the search card (`src/search.js`): its
  filters are the card's divider tabs, and the keyboard is live from the first frame. Songs are
  ruled rows on the card, arrows + Enter or a click plays one; with Cover carousel on, the top five
  results also sit above the rows as a strip of sleeves (chord + ↑ browses it) and, in the mini
  window, an empty search deals its Listen again shelf out of the suitcase drawer into a vertical
  3D wheel under the card. A song from search has no sleeve, so
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
  A side rail picks a page: *Account*, *Look* (Cover art, Lettering, Cover carousel), *Playback* (Start of a song),
  *Performance* (Smoothness, Sharpness, Auto cool-down, Frame rate), *Shortcuts*, *Tour*. ↑/↓ or Tab move through the rail; it opens on
  Account the first time, then where you left it. `?settings=<page>` opens a page for screenshots.
  **Oil paint**, the shop's only look (D from the optimisation plan, after blendi's oil-paint demo on patch.gg, MIT;
  merged into dev 2026-11-13, when the watercolour and Brush strokes looks and the Painting setting were removed),
  (`src/oilpaint.js`) draws the brush strokes' places as thick opaque dabs: each stroke records its object's paint
  when it is placed (`aCol` in `src/brushstrokes.js`: the world drawn once under an even white sky of strength pi,
  once with no light, so glows and crisp covers are told apart), and the dab's vertex shader lights that paint
  with the shop's own lights the way the toon materials do (sky, sun with one shadow-map look, the lamps that are
  on, fog), so the colour is decisive and never swims with the picture, and time of day still reaches it. The
  brush sheet holds a height and its slope; light from the canvas's upper left rakes across the ridges
  (`?impasto=`). Each dab fits the one thing under it: strokes are placed with an id picture (every mesh its own
  number, every piece of an instanced mesh marked `userData.strokeEach`, the racks' filler spines) and stop where
  the object or its paint changes (`PAINT_STEP`, so a row of spines or a striped box is never one surface); a dab
  is never fatter or longer than the room its face leaves there (`aShape.zw`); and at each pixel it is cut where
  the scene leaves its plane, to about a centimetre (measured square to the plane, so it cannot wrap round a corner
  or float over a gap). It also stops where the scene draws something it does not know about (a lit window, glass:
  the colour there disagrees). Strokes on station furniture remember which piece they are on (`ownStrokes` = k,
  `aCol.w` += 10k) and go when a rack replaces it: before, they floated on the new rack. Spines thinner than a
  pixel of the bake (320 x 200) get no dab and show as drawn. Records (`userData.noStrokes` on a rack's Sleeve) get no strokes in any look, since they
  move (a rack revealed mid-session used to pin strokes to its records). Coat and medium layers only (the `TOUCH` layer is skipped by default; `?oillayers=3` or `1,1,1` keeps it), about half the coat's strokes
  (they are wider): `?oillayers=1,1,0`, `?oilkeep=0.55,0.7,1`, `?oilshape=2.2,1.0` (width, length), `?oilmax=`,
  `?oilscale=1` (dab px per CSS px), `?dabwidth=`, `?dabprepass=0` (draws the under-coat first instead of dabs-first with Early-Z under-coat culling). The placed dabs are capped in size on screen (`MAX_SIZE`), so
  they leave about half the canvas bare, and none are placed on mortar lines, thin edges or rails; an **under-coat**
  fills it (`UNDER`, `?under=0.035` dab size as a share of the screen's height, `?under=0` off; `depthDown` reconstructs world position and normals from the depth buffer and a frustum ray without calling `worldAt` 9x per pixel). By default placed dabs render first into a float target (reading scene depth + sqrt colour cached by a prepass) and `depthDown` Early-Z culls covered/sky tiles so only bare gaps shade the under-coat; the under-coat is still worked out per pixel where gaps remain: the pixel's world position and facing come from the scene's
  depth, and dabs are laid on a grid on the plane of the axis that surface faces most (two grids half a cell apart,
  only the 2 x 2 cells nearest looked at), cells a power of two in metres that halve and double dab by dab with
  distance; each dab is one colour (the scene round where its middle lies: 4 pixels, each weighed by how surely it
  is the same surface, eased toward the pixel's own colour where none is; a single pixel and a yes/no made whole
  dabs jump colour as the camera moved) with the brush sheet's ridges, and a pixel no dab reaches takes the
  nearest dab's colour. Things that move (records, their
  discs: `unpinned()` in `src/materials.js`, alpha 0.99 in the scene buffer) get no under-coat, as it is pinned to
  the world. **Glass gets no dab at all** (Lajoon, 2026-11-12: dabs made it look worse): window glass, the shop
  door's panes and fanlight, the display windows and lantern panes are flagged with `glass()` in `src/materials.js`
  (alpha `GLASS_ALPHA` 0.993 in the scene buffer; a see-through pane keeps its colour blending and only sets the
  alpha it leaves, so the flag holds over the room behind), and the last pass shows those pixels as drawn, with what
  is seen through them. New glass should use `glass()`; the pendants' bulbs are glass too, and each shade has a
  warm lining under it (the hall's green shades, lit from that close, glowed lime and got greenish dabs round the
  light). **The decor record sleeves** (shelf spines, crates, face-out sleeves in `src/interior.js`) are their own
  kit part, `kit.sleeve` (`src/kit.js`): no strokes are placed on them (`userData.noStrokes`) and they are flagged
  with `ownColour()` (alpha `OWN_ALPHA` 0.997), so the under-coat keeps each pixel's own colour (ridges only) and
  placed dabs stop at them. A dab is wider than a 1-2 cm spine, so it took a neighbour's colour and swapped as the
  camera moved (Lajoon, 2026-11-13: they flickered). Shelf spines also sit a few mm in or out of line, since flush
  fronts of leaning neighbours overlapped in one plane and z-fought. **Thin rods** (`rod()` in `src/details.js` with
  radius up to `THIN_ROD` 3.6 cm: gallery top rails and balusters, lamp cords, wires) go to `kit.wire`,
  flagged `ownColour()` the same way, as do the hanging plants' chain links (`kit.link`) (they keep their strokes for the other looks). They are thinner than a dab and
  often than Oil paint's downsampled depth, so dabs from the wall behind were laid over them and only part of each
  rod showed, that part sliding as the camera moved (Lajoon, 2026-11-13). Glows (halos, washes, the intro's beams: `GLOW_BLENDING`)
  add their light but leave the scene's alpha alone, so a glow cannot wipe out the glass, record or crisp flag under
  it. Filling each stroke's patch with more placed dabs instead (`?oilsub=4,3`, `?oilstep=`, `?oilrow=`)
  doubled the frame (each spot lies under ~20 strokes placed from views at other distances) and still left the
  edges bare. Dabs are depth tested against the scene (its depth brought down to the paint target, a few cm
  nearer: `?oilbias=`), so the GPU skips their hidden parts. Check coverage with `node scripts/oil-cover-check.mjs
  [out] [stations] [dpr] [query]`: the share of the paintable picture no dab reaches, a magenta map of it, the frame
  time, and the overdraw (`VARIANTS='[{"count":1}]'`). **Every dab stays on its own surface**: a placed dab is cut where the
  scene under it lies off its plane (`?oiltol=`) or is drawn in another colour (`?oilagreecol=`, tight: 0.12-0.22
  in sqrt rgb), and an under-coat dab borrows colour only from the scene point near its middle (3D distance,
  `?undertol=`) whose colour is near the pixel's own (`?undercol=`). Looser tolerances, which grew with distance and
  only measured off the plane, let wall paint run onto the green sign board 8 cm in front of it, frames, shutters
  and sun/shade edges (Lajoon, 2026-11-13). Find what still crosses with `node scripts/oil-bleed-check.mjs [out]
  [views] [dpr] [query]` (views `t<s>` = the intro in shot mode, `home` or station numbers; `CROP=x,y,w,h` saves a
  close-up as drawn | painted): the share of the painted picture whose paint matches a neighbouring surface better
  than its own, for all paint, placed dabs alone and under-coat alone, the biggest patches, a magenta map. At
  Sharpness light over the intro t1-8, home and stations 0-7: 4.1% -> 0.8% (street 6-10% -> 1-2%); what is left is
  mostly glows the dabs do not carry and patches under the cinema bars. No wash, bleed or border passes; the last pass lays the dabs
  over the scene, crisp things, glass and the suitcase as drawn, a faint canvas weave. RX 550 @2x (1440x900 Balanced, `hour=14`):
  home 48.9 -> 31.2 ms, station 0 -> 25.4 ms, station 3 -> 27.9 ms, station 6 -> 25.2 ms (Light: home 24.9 ms, 0/3/6 19-20.6 ms;
  bare canvas at home 52% -> 0%; pigment blotches use a 64^3 3D texture, `?blotch=math` keeps the 3D sin-hash math; sun shadows use 1-tap hardware PCF and a 16-bit depth map, `?pcf=5` and `?shadow32=1` keep the 5-tap Vogel filter and 32-bit depth; hi-dpi / Light scenes use 2x MSAA, `?msaa=N` pins the sample count). The scene pass is
  still drawn whole. The strokes the dabs sit on are pinned to the world's surfaces, so the paint moves with the world and stays still when the camera does (`src/brushstrokes.js`; check with `scripts/still-check.mjs`). To check that the paint does not shimmer while the camera moves, measure with `node scripts/flicker-check.mjs <out> [query]`: share of pixels flipping brighter/darker during the intro, plus a heat map; `SHOTS=120,121 MARK=1` saves those frames with the flipped pixels in magenta; `hotPct` = pixels
flipping in over a tenth of the frames). That count also takes in textured edges sliding past; to find what
*jumps* as the camera moves, `node scripts/pop-check.mjs <out> [query] [times]` draws each moment twice a sliver
of time apart (`DT`, default 1/300 s; `DT=0 NUDGE=0.0002` leans the camera a hair instead, for still views like
`at=3`) with the cursor's lean pinned, and marks in magenta what changed: z-fighting, dabs popping, colours picked
from another pixel. `?wc=0` (or `SIENNA_QUERY="wc=0" npm run dev`) turns the paint off for screenshots and
  geometry checks.
  *Cover art* sets how strongly covers are painted (Off to Heavy, default Heavy). *Cover carousel*
  (default Carousel) opens Up next as a horizontal wheel of huge covers floating on the dimmed shop,
  dealt out of the suitcase drawer, opens the mini window's empty search on a vertical Listen again
  wheel the same way — real 3D sleeves with their vinyls poking out, leaning with the cursor — and
  shows the top five search results as a smaller strip to spin through; List keeps ruled rows
  everywhere. *Start of a song* plays
  when the arm lands (default) or at once. *Smoothness* caps the frame rate at 60 or 30 fps. *Sharpness* sets how
  many pixels the shop is drawn with (`src/quality.js`): Full (every Retina pixel), Balanced (default: 3/4 of the screen's
  pixel ratio, never below 1, so 56% of Full's pixels on a Retina screen and the same as Full on a plain one) or Light
  (half, never below 0.75); the window scales the picture up, and the paint hides most of the difference. `?sharp=full|balanced|light`
  pins it. *Auto cool-down* (on by default) draws lighter for as long as needed: when macOS reports the Mac is warm
  (`electron/power.cjs`, thermal state fair: one step lighter; serious or critical: Light and at most 30 fps) or when
  frames take far longer than the cap allows while things move (one step lighter after 4 s; back up after 45 s of easy
  frames, twice as long each time it had to drop again within a minute). It never goes sharper than the setting.
  `SIENNA_THERMAL=serious npm run dev` or `?thermal=serious` pretends a warm Mac; test runs (`navigator.webdriver`) leave
  it off unless `?cool=1`. The fps ticket shows frames per second and the worst frame time. *Lettering* picks the font
  (each choice is written in itself); it applies at once in both windows, without a reload (tags, signs and buttons repaint in place).
  *Frame rate* shows an fps readout. *Tour* > SHOW IT AGAIN starts the first-run tour from the door.
- **First-run tour** (`src/tour.js`): on a new install, once the intro reaches home, card notes in the shop
  walk you through it, with brush-stroke words floating (bobbing) under each note instead of a settings card:
  *welcome* (SIGN IN or LOOK AROUND FIRST, with the small print as four price stickers slapped on one by one: FREE,
  makes no money; PRIVATE, no servers and keeps nothing about you; ADS?, without Premium YouTube Music plays its own
  and Sienna earns nothing from them; OPEN SOURCE, the code is at github.com/lajoonpark/Sienna), *letters* (the lettering, applied live; the *paint* step went with the other looks), *smooth*
  (60 or 30 fps), *record* (a small note at the top while you pick a record; the shop's keys work, it fades at a rack
  and moves on once a song plays), *player* (beside the suitcase: the knob is the Mac's own volume, scrubbing, keys),
  *keys* (each shortcut ticks when pressed; the global ones are reported by `keys:used` from `electron/shortcuts.cjs`;
  click one to change it, `shortcuts.record` in `src/shortcuts.js`) and *bye* (menu bar, ⌘,). SKIP TOUR or Esc ends it.
  Each note drops in with a bounce, its title falling letter by letter over a brush underline and its words inking
  in; a record with the step number slides out from behind it and spins, and a row of little records at the bottom
  shows the track you are on. Moving on flicks the note off to one side. Clicks, ticks, a first record and the
  goodbye burst into paint, confetti, music notes and records (`src/tourfx.js`: one canvas behind the notes that only
  draws while something is flying). Once the tour has faded away its animations pause too (`.tr.gone`),
  so a hidden note stops waking the page every frame. Reduced motion and `?shot` keep it all still.
  The notes lean toward the cursor (about 9°): `src/cursortilt.js` eases the cursor on its own rAF loop, which runs
  only while a note is catching up, so it keeps turning while the camera's tilt holds still for a record at a rack.
  The menu cards do not lean, so their lettering never skews. Check: `node scripts/tilt-check.mjs [out]`.
  While a centred note is up the shop's own keys are quiet. The step reached is saved in localStorage `sienna.tour`.
  Installs from before the tour (saved settings, or already signed in) do not get it on their own, nor does a plain
  browser or an automated run (`navigator.webdriver`), so the check scripts see the shop as before. `?tour=0` keeps it
  away, `?tour=new` runs it as a new install, `?tour=<step>` shows one step unsaved (`&guest` for the guest welcome):
  `SIENNA_QUERY="at=home&tour=keys" node scripts/shot.mjs out 3`. Check: `node scripts/tour-check.mjs [out]`.
- **Heat / battery**: the shop is drawn at that cap only while something moves (camera, input, flights,
  lid); once still it drops to 12 fps (30 while a record spins on screen). 4 s later, if nothing on screen animates
  on its own (no record turning on the suitcase), it goes into deep idle: it only looks twice a second whether
  anything changed (a cover arriving) and the ragged border stops boiling, so nothing is drawn at
  all; input, or a change it finds, brings the full rate back at once. The sun's 5 s creep paints the one
  frame it makes and leaves the two-looks-a-second pace alone (waking for each kept a still shop at 16
  looks a second). It stops while the window is hidden,
  minimised or covered (`src/pacer.js`; `node scripts/idle-check.mjs [rack]` prints B busy / i idle / d deep and what
  was painted; `?deep=0` turns deep idle off, e.g. for `cache-check.mjs`).
  **Lamps**: of the shop's 8 point lights only 5 are on at a time, the ones that light the view most (their falloff
  at points straight ahead, with their reach in view), so every lit pixel loops over 5 lights, not 8
  (`src/lightslots.js`; the count stays fixed so no shader compiles again; `?allLights` turns them all on to compare,
  `?lights=N` sets the count). At night the stations look the same as with all 8; at home and the first table a little
  faint light from the far end goes. A lamp never switches at once: one dropping out of the 5 dims over `FADE_S`
  (0.9 s) before its slot goes to the next, which brightens over the same; a lamp holding a slot scores 1.25x so
  close pairs do not keep trading.
  **Bricks**: rounded pieces (bricks, blocks, flagstones: 108-300 triangles each) in an 8 m square more than 5 m from
  the camera are drawn as plain boxes (12), sharing the same instances (`updateLod` in `src/kit.js`): about a quarter
  fewer triangles at home. (Round 2's far twins for leaves, beads, pots and sleeves were reverted: 0.8 ms for a
  visible change to the far foliage and decor spines.)
  **Start**: the brush strokes placed from the shop's 31 views (`68k / 76k` strokes in coat + medium, buffers sized dynamically to fit) are kept in IndexedDB under a
  fingerprint of the scene, views and stroke settings (`src/strokecache.js`, `strokeFingerprint` in
  `src/brushstrokes.js`); the next start reads them back. Late shelf/rack arrivals run an async PBO stroke refill (`bakeAsync` / `runFillJob`, 1 step per frame) queued after the intro (`hitch-check.mjs`).
  Any change to the street, shop or stroke settings bakes again. `?strokecache=0` skips it.
  **Branch `other-optimizations`** (Lajoon's experiments, 2026-11-12; each has a URL switch to compare):
  - *Stage-set walls* (C5): bricks and flagstones are flat cards, just the face you see, in the same places and
    colours (`CARD_WALLS` in `src/kit.js`; they cast no shadow, the mortar backing does). Triangles at home 2.2M ->
    0.8M. `?walls=3d` brings the 3D pieces back, `?walls=bricks` cards only the bricks.
  - *Fewer, bigger strokes far away* (OP-C): a stroke's smallest on-screen size grows with distance (`farGrow`,
    `FAR_GROW` in `src/brushstrokes.js`, `?fargrow=near,far,k`). (The old Brush strokes look was also laid at 3/4 of
    the CSS-pixel size, `BRUSH_SCALE`; that went with the look.)
  - *Sharp only where you look* (C4): around the eased cursor (`fovea`, reach 0.45 of the height, `?fovea=0` off)
    the final pass does its full wet pooling and colour edges and the detail strokes (CORRECT, TOUCH) show; toward
    the corners it reads fewer taps and only the coat paints (there the coat no longer steps aside for detail, or
    busy walls were left bare). `?foveaAt=x,y` pins where you look for screenshots (uv, y up; `0.12,0.15` = the
    suitcase). Small gain (~2.5 ms at home): that pass is limited
    by its noise maths, not its reads.
  - *Strokes baked at build time* (C1): `node scripts/bake-strokes.mjs` writes `strokes/shop.bin.gz` (packed by
    `src/strokepack.js`, ~8.7 MB gzipped / ~12.7 MB raw after dropping the unrendered `TOUCH` layer and trimming buffers), which the stroke cache (`src/strokecache.js`) uses when nothing is kept yet and
    its fingerprint matches (the app reads it through the main process, `strokes:shipped`; a browser fetches it),
    so a first start also skips placing them (`firstFrameEnd ~1.9 s`). Run it again after
    changing the street, the shop or the stroke settings; until then the app places them itself as before.
    It is baked as the app starts (no `?shot`): station furniture stands where racks will go and gets strokes
    first. Those furniture strokes have places of their own (`ownStrokes` in `src/shop.js`, drawn with alpha 1 + k in
    the bake), so when a rack replaces the furniture the wall behind it still gets its coat; before, the wall
    above the cubby rack was left with gaps. `?shot` builds racks before the bake, so shots with
    `?strokecache=0` never showed this; shots that read the shipped strokes do.
    Painting the shop into textures ahead of time is not possible as the shop is built (no texture coordinates,
    tens of thousands of instanced pieces), so the paint passes still run live.
  - *Player diet* (C2, the safe part): the hidden YouTube Music page loads no pictures or fonts
    (`electron/ytm.cjs`, `SIENNA_PLAYER_DIET=0` off): -13 MB and a little CPU while playing
    (`npm run build && xvfb-run -a node scripts/player-check.mjs`: the player process's memory, CPU and fetches).
    Playing without that page (~320 MB) is not built: see the note in the root README.
  Together on the RX 550 at Balanced (1440x900 Retina): home 62 -> 50 ms, crate table 49 -> 41, station 3 53 -> 47.
  **Measuring**: `node scripts/frame-bench.mjs [at=home,0] [dpr=2] [query]` paints whole frames back to back on the GPU
  and gives ms per frame, the JS cost of a still frame and of the scene's render call, draw calls and triangles;
  `VARIANTS='[{},{"noPoint":true},{"noBricks":true},{"noOverlay":true}]'` switches parts off to see their share.
  On the server's RX 550 at 1440x900 Retina, Balanced (`hour=14`): home 31.2 ms (48.9 ms before round 2), station 0 25.4 ms, station 3 27.9 ms, station 6 25.2 ms; Light home 24.9 ms; Full home 40.6 ms. `__siennaDebug.profile()` times each step (`renderer.setRenderTarget(null)` synced before `gl.readPixels`, so steps do not add up to a whole frame; `save` and `overlay` are the suitcase's).
  **Still frames**: a frame is painted again only as far as it differs from the one before. `src/still.js`
  skips the scene walk altogether while the camera moved (`camBuf`), deduplicates materials per frame (`seenMat`), and compares what remains in batched typed buffers (`~0.47 ms` settled, `~2.15 ms` JS / `5.52 ms` GPU-synced listening frame with scissored overlay draw and MSAA resolve into `capBox`). The painter (`Still frames` in `src/watercolour.js`) then
  draws nothing if nothing changed, only four strips along the edges if just the ragged border boiled,
  only the suitcase's corner if just its record turned (the world's pixels under it are kept and put
  back), and the whole frame only when the world itself changed. So the shop's 3.8 million triangles,
  its shadows and the stroke passes are drawn while something in the shop moves and not otherwise. The
  screen keeps its picture between frames for this (`preserveDrawingBuffer` in `main.js`). Oil paint has no
  border (and `CARD_OIL` freezes the mini card's boil), so a still shop draws only the record's corner, and a
  still mini card skips re-rendering the 3D scene. A frame put together in parts is the same picture to the last bit as a whole repaint:
  `node scripts/cache-check.mjs` compares them and counts what was painted (`__siennaDebug.painter.stats`).
  Things that help the shop come to rest: the time of day is worked out every 5 s of the clock, not every
  frame (`src/timeofday.js`); the cursor tilt lands on an exact rest once it is within a hair of its target and slow (`src/camera-tilt.js`); under a shut lid (case tucked away)
  the record and arm are not posed. Bricks, tiles and slats are instanced per 8 m square of ground
  (`src/kit.js`), so what is outside the view is not sent to the GPU while the camera does move (43%
  fewer of those triangles on average, for 15 more draw calls).
  The hidden YouTube Music window is throttled like a background tab (no painting, no video decoding,
  smallest video stream). While a Sienna window is on screen it is polled 4x a second while a song plays
  or loads and for 6 s after anything was asked of it, twice a second while it sits paused; every 3 s
  otherwise. The hidden mini window is sent the player's state only when something other than the
  position changes (and the newest just before it opens). The macOS volume is read (an `osascript` run)
  only while a window is on screen and Sienna has the keyboard: every 5 s, and at once when you come back
  from another app. Volume changes sent to the player itself (the knob and scrolling send dozens a second) are
  merged: while one is on its way only the newest waits.
- **Memory**: `npm run build && xvfb-run -a node scripts/mem-check.mjs [out]` gives memory and CPU per process
  (`SIENNA_DPR=2` pretends a Retina screen; it prints PSS beside the resident size on Linux, and `SIENNA_ANGLE=swiftshader` picks the renderer where there is no Vulkan). The shadow map's unread colour layer is freed once made (`dropShadowColour` in `src/main.js`, 16 MB; `?shadowColour=1` keeps it, e.g. where a driver will not draw without one). A still shop is looked at twice a second, the sun's 5 s creep included, and the hidden tour's animations are paused. The sun's 4096 px shadow map (128 MB of video memory) is let go of while the sun is down
  (`src/timeofday.js`). A resting cover's canvas is shrunk to a pixel once the picture is on the GPU
  (`slim` in `src/racks/common.js`, about 50 MB for a full shop). Covers that have left the racks (a restock,
  a search, a queue that moved on) are let go of every five minutes: the ones no sleeve shows, no material in
  the scene shows and nobody asked for in the last two minutes (`trimCovers` in `src/racks/common.js`, the
  rule in `src/racks/cover-cache.js`); before, a shop left open kept every cover it had ever shown, a third of
  a megabyte each. One still shown after all paints itself back. Check: `node scripts/covers-check.mjs [out]`. The mini window makes no travelling
  washes (it has no camera to travel).
- **Covers**: playlist and mix covers are found in any of YouTube's thumbnail shapes; one that is
  missing or fails to load is painted as a collage of the playlist's first songs (`src/cover.js`).
  `SIENNA_DUMP=1` (unpackaged runs only) saves the API responses to the app's userData (`dumps/`, readable by
  you only, tracking/session identifiers stripped, newest 40 kept, none older than a day) and logs any item
  without art, for debugging. They still describe your library and listening: do not share them.
- **Keys**: Space play/pause, ← → back/skip, ↑ ↓ or scroll for volume (a sideways scroll is never volume), L like.
- Covers and tags are drawn sharp: they write alpha 0 into the scene buffer (`crisp()` / `keepSharp()` in
  `materials.js`, also the SIENNA sign) and the post pass leaves those pixels alone. The covers
  themselves are repainted once when they load (`src/coverpaint.js`: an opaque impasto under-coat, then
  three contrast-gated layers of thick oil dabs on the shop's diagonal with colours read from the cover,
  upper-left raking light on impasto ridges lifted off a floor that grows as the paint darkens
  (`darkLift`, so near-black covers still show their brushwork), second-colour bristle streaks, and linen canvas weave, full bleed
  with no paper margin), so real album art sits in the painting. The racks and the suitcase paint them in a worker
  (`src/coverworker.js`, `src/coverpaint.worker.js`), since dabs take a few tens of ms a cover. Settings > Look > Cover art sets the strength.
- In a plain browser (`npm run web`, screenshots) `src/music.js` fakes a record store with painted
  covers, so the shop can be worked on without Electron or an account.
- Dev pages for screenshots: `ui-lab.html` (`?font=`, `?sheet=1`, `?compare` — full 2D UI kit), `lab.html?station=N` (one rack), `player-lab.html` (the suitcase in the shop),
  `mini.html`, `search-lab.html`, `cover-lab.html` (covers before / after painting). Shop URL options: `?at=home|N` start there, `?hover=N`, `?fly=from,to,p`,
  `?search=lemon`, `?shelves=8` (fake store: fill every station), `?albums=1` (fake store: an albums shelf).

- **Security** (`electron/security.cjs`): every renderer is sandboxed (`app.enableSandbox()`). Permission
  requests are refused everywhere, the hidden player's included. No window opens popups
  or `<webview>`s; the shop and mini window never leave their own page, the player and sign-in windows stay on
  Google's sites. The main process answers ipc only from Sienna's own pages in its own windows. Cover urls must
  point at Google's image hosts (checked on the parsed host: `cleanUrl` in `ytm-parse.cjs`, `src/arturl.js`),
  and the pages' Content Security Policy (`index.html`, `mini.html`) enforces the same; downloads are capped
  at 8 MB / 4096x4096 px with a 15 s timeout. The check scripts write to a fresh private temp folder unless
  given one (`scripts/safe.mjs`) and only pass `--no-sandbox` when run as root or with `SIENNA_NO_SANDBOX=1`.

```
npm test                                   # parser, security, caches, main-process windows and shortcuts, suitcase, racks
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app vs YouTube Music: shelves, hover, play, buttons
```

Untested on a Mac: the mini player's focus/Dock behaviour and the real global shortcuts.
