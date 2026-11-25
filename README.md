# Sienna

A free, open-source YouTube Music app where your music lives in a hand-painted 3D record shop.

You walk down a Tuscan alley and into the shop, where your YouTube Music shelves are racks of
records. Pick one up and its vinyl flies out of the sleeve and lands on a little suitcase record
player. The sky outside follows your real clock, and the lanterns come on one by one at dusk.

Sienna is an unofficial app, not affiliated with YouTube or Google. It relies on YouTube Music's
web page and internal API, so a change on their side can break it.

## Install

> [!IMPORTANT]
> **Unsigned open-source builds:** Sienna is a free, open-source project maintained without a paid
> Apple Developer account or a paid Microsoft code-signing certificate. Prebuilt releases are
> **not code-signed or notarized**. Every line of code and the GitHub Actions release workflow
> (`.github/workflows/release.yml`) are public so you can inspect them or build from source.

### macOS via Homebrew (recommended)

```sh
brew tap lajoonpark/sienna https://github.com/lajoonpark/Sienna
brew install --cask sienna
```

Because Sienna is unsigned, macOS Gatekeeper normally quarantines downloaded apps. The Homebrew
Cask (`Casks/sienna.rb`) **automatically clears the quarantine flag** on install by running:

```sh
xattr -dr com.apple.quarantine /Applications/Sienna.app
```

### Manual downloads (GitHub Releases)

Download the latest release from [GitHub Releases](https://github.com/lajoonpark/Sienna/releases):

- **macOS (`.dmg` or `.zip`, Apple Silicon & Intel):** Drag `Sienna.app` to `/Applications`. Because
  the build is unsigned, remove the quarantine attribute before opening it:
  ```sh
  xattr -dr com.apple.quarantine /Applications/Sienna.app
  ```
- **Windows (`.exe` installer or portable):** Windows SmartScreen will warn that the app is unsigned.
  Click **More info → Run anyway** to launch.
- **Linux (`.AppImage` or `.deb`):** Make the AppImage executable (`chmod +x Sienna-*.AppImage`) or
  install the `.deb` package.

### Run from source

You need Node.js 22.12 or newer.

```sh
cd app
npm install
npm run dev
```

After a `git pull`, `npm run dev` installs any new packages by itself before it starts.

The first time, use the sign-in button to log in to your Google account (if your work or school
account redirects to an external SSO provider, Sienna asks for your confirmation before allowing
that host for the sign-in session). Without signing in, it works as a guest, with ads and generic
shelves.

On Linux, Electron keeps Chromium's sandbox on, which needs either unprivileged user namespaces
(most distributions) or its setuid sandbox helper. If it stops with a sandbox error, set the helper
up once after each `npm install`:

```sh
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Please don't run it with `--no-sandbox`: that turns off a protection for the YouTube pages it loads.

## What it does

- **A first-run tour.** The first time you open Sienna, paper notes in the shop show you around: sign in
  (or look around as a guest), pick how it is lettered, play a first record, meet the player
  and try the shortcuts. Skip it any time; Settings > Tour shows it again. Its welcome note says it
  plainly: Sienna is free and open source, makes no money and keeps nothing about you, and the ads you
  hear without YouTube Premium come from YouTube Music, not Sienna.
- **The shop — Home & Your Library.** Eight sections, each with its own kind of rack, from a crate
  table in the hall to a spinner rack in the glasshouse and a market stall in the garden, through a
  shop that winds back over four floor levels. Switch between **Home shelves** and **Your Library**
  (Liked songs, Your playlists, Saved albums, Your artists) or hit **Restock** anytime from the top
  right. Works cleanly with non-English YouTube Music accounts too.
- **Records, Albums & Playlists.** Hover a record and it comes out toward you with a paper name tag.
  Click a song to play. Click an **album or playlist** and its songs fan out of the sleeve as bare
  vinyls in front of you with their track numbers (and each track's cover on playlists), plus a red
  record that plays the whole thing. Pick any song and playback continues from there.
- **The suitcase player.** A record player in a leather case, bottom left. The record spins with the
  cover on its label and the tonearm creeps in as the song plays. Turn the knob for volume, or drag
  the record to scrub. Its torn-paper tag shows elapsed/total time, **Mute**, **Shuffle**, **Repeat**,
  **Up Next Queue**, and a **folded liner-note Lyrics sheet**.
  The shop and mini player share a paper now-playing tag with a seekable progress line and stamped
  controls with painted tooltips. The tag steps aside while a list, sheet or tour note is open.
- **Mini player & System Tray.** Press **⌃⌥K** anywhere to open the suitcase at your cursor, without
  opening the shop. It also closes when the cursor leaves it, once the cursor has been over it —
  a card that opens beside the cursor stays put until the cursor comes in and leaves again
  (Settings > Playback > Mini player, on by default). Closing the shop window frees GPU memory
  while Sienna stays in the menu bar /
  system tray (macOS, Windows, and Linux) with now-playing info and playback controls.
- **Hardware media keys.** Play/Pause, Next, Previous, and Stop keys on keyboards and headphones work
  globally.
- **Richer Search.** Press **⌃⌥J** to search **Songs**, **Albums**, **Playlists**, or **Artists**
  (`Tab` switches tabs). Songs slide out of the suitcase drawer; albums and playlists fan open into
  records; artists open into their top songs and releases. The top five results also sit above the
  list as a strip of painted covers — the chord it names (⌥/⇧, whichever is free of your
  shortcuts) + ↑ hands it the keyboard, `←` `→` choose, `Enter` plays and `↓` goes back to the
  list. In the mini player an empty search instead opens your **Listen again** shelf as a vertical
  wheel of huge covers filling the window to spin through.
- **Shared paper lists.** Search, collection songs and Up next each sit on one paper sheet with
  ruled rows. Up next can instead spin as a horizontal wheel of painted covers filling the window,
  centred on the playing song with the paper behind it curved round to the cylinder and the title
  and artist lettered beneath the centred cover — Settings > Look > **Cover carousel** (on by
  default) switches it and the search cover
  strip between **Carousel** and the ruled **Paper list**. terracotta marks the keyboard cursor and indigo marks the playing song, and a small
  hand-drawn kind icon on a paper dab at the end of each row tells songs, albums, playlists, artists
  and podcasts apart. Collections
  filter as you type; **Play** starts the first filtered song and **Shuffle** uses the filtered
  pool. Up next pins the playing song first. Loading, empty and error notes stay in the list,
  with Retry on fetch errors.
- **Paper sheets & notes.** Settings and Lyrics open as folding paper dialogs with a Close stamp,
  keyboard focus kept inside and returned to the opener on close. Settings has a page rail and
  painted choice chips; long pages show a scroll hint. Lyrics and tour body text use a book serif
  for reading, while titles keep your chosen hand lettering. Lyrics offers Retry if loading fails.
  Every scrollable surface — lists, sheets, Settings and tour notes — eases wheel scrolling with a
  heavy smooth glide rather than a jump, picking the keyboard, the pointer or a program scroll back
  up the moment one takes over (off under reduced motion).
- **Privacy-first extras.** Settings lets macOS users choose between **Mac system volume** and
  **Sienna only**, toggle **Start at login**, opt in to **Discord Rich Presence** (off by default,
  local Discord IPC only), manually **Check for updates** on GitHub Releases (never phones home in
  the background), and copy **sanitized Diagnostics** for bug reports.
- **A painted look & runs cool.** The world is painted in thick, opaque dabs of oil paint pinned to
  its surfaces and lit live by the shop's lights. Once the shop is still it stops redrawing the room,
  scales sharpness automatically when the computer warms up, and ships pre-baked brush strokes for
  fast starts.

## Controls

| Key | Action |
| --- | --- |
| `⌃⌥K` (`Ctrl+Alt+K` on Windows/Linux) | Open or close the mini player, from any app |
| `⌃⌥L` (`Ctrl+Alt+L`) | Bring up the full app — or close it while it's focused — from any app |
| `⌃⌥J` (`Ctrl+Alt+J`) | Search (Songs / Albums / Playlists / Artists; `Tab` switches filter) |
| `Space` / Media Play-Pause | Play / pause |
| `←` `→` / Media Prev-Next | Back / skip |
| `↑` `↓` or scroll | Volume |
| `M` | Mute / unmute |
| Scroll sideways, or drag | Turn the spinner rack (glasshouse), or turn pages of an album/playlist |
| `L` | Like |
| `Tab` / `Shift+Tab` | Next / previous section |
| `Esc` | Close open sheet/spread, return home, or close the mini player |
| Chord shown under the search cover strip + `↑` | Browse the top-five result covers (`←` `→` choose, `Enter` play, `↓` back to the list) |
| `⌘,` (`Ctrl+,` on Windows/Linux) | Settings |

The first three shortcuts can be changed in **Settings → Shortcuts**. Click or press any key to skip the intro.

## How it works

Sienna is an Electron app with a Three.js scene. All the scenery is built in code.

A hidden, sandboxed `music.youtube.com` window in an isolated `persist:ytm` session does the actual
playing, so YouTube Music itself handles the queue, radio, ads, history, and likes. Sienna drives
that page through a small injected script and reads shelves, library, search, queue, and lyrics from
the same internal API the page uses. If the network drops or the hidden player crashes, Sienna
recovers automatically and surfaces a paper retry banner.

```
app/                        the Electron + Three.js app
  electron/                 main process, sandboxed YTM player, mini player, shortcuts, updater, Discord IPC
  src/                      the shop, racks, suitcase, painting, search, liner notes, settings
  build/                    macOS entitlements for Electron packaging
  scripts/                  dev launcher, screenshot tool, end-to-end and behaviour checks
  test/                     unit tests
site/                       the landing page at sienna.lajoonpark.com (Vite + Three.js, no Electron)
Casks/sienna.rb             Homebrew Cask (auto-clears macOS quarantine via xattr)
.github/workflows/          automated unsigned release builds (macOS, Linux, Windows)
archive/swift-prototype/    shelved early Swift macOS prototype (not part of the app)
```

[`app/README.md`](app/README.md) has the shared UI kit, revamp phases, rendering, performance,
and dev-flag details.

The landing page in `site/` is a Vite + Three.js page painted the way the app is: it
carries ports of the app's oil-dab painter (`site/src/paint/`: brush dabs, the cover painter, the
suitcase textures, run in a worker), its torn paper and brush-plate words (`site/src/ui/`), and its
suitcase player (`site/src/suitcase/`). Scrolling down the page, 24 painted records drift about
(brush and scatter them with the cursor), lift away for a pinned section that walks down the app's
actual Tuscan alley into the shop (`site/src/alley/`, lit by the visitor's clock). The preview builds
the main hall and the view through the lounge window, but skips the rooms the camera never sees.
It uses the app's oil-paint renderer and caches dabs placed along the scroll path in the browser.
The records then slip one by one into their painted sleeves in a
crate-table rack you can hover through like the app's, send the picked record flying onto the
suitcase player (its buttons, knob and record work), and finally slide out of their sleeves into a
ring. `site/src/collide.js` keeps records, sleeves and the case from ever passing through each
other. `?hour=20.5` freezes the clock. Run it with `cd site && npm install && npm run dev`, and
test it with `npm test`.

## Develop & Package

Run these from `app/`:

```sh
npm test                                   # unit tests: security, parser, updater, discord IPC, suitcase
npm run web                                # the shop in a browser, with a fake record store
npm run build && npm run electron          # run the production build
npm run dist:mac                           # build unsigned macOS arm64 + x64 (.dmg + .zip)
npm run dist:linux                         # build Linux AppImage + .deb
npm run dist:win                           # build unsigned Windows NSIS + portable
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app against YouTube Music (Linux)
```

## License

[MIT](LICENSE)
