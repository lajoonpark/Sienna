# Sienna

A free, open-source YouTube Music app where your music lives in a hand-painted 3D record shop.

You walk down a Tuscan alley and into the shop, where your YouTube Music shelves are racks of
records. Pick one up and its vinyl flies out of the sleeve and lands on a little suitcase record
player. The sky outside follows your real clock, and the lanterns come on one by one at dusk.

Sienna is an unofficial app, not affiliated with YouTube or Google. It relies on YouTube Music's
web page and internal API, so a change on their side can break it.

## What it does

- **A first-run tour.** The first time you open Sienna, paper notes in the shop show you around: sign in
  (or look around as a guest), pick how it is painted and lettered, play a first record, meet the player
  and try the shortcuts. Skip it any time; Settings > Tour shows it again. Its welcome note says it
  plainly: Sienna is free and open source, makes no money and keeps nothing about you, and the ads you
  hear without YouTube Premium come from YouTube Music, not Sienna.
- **The shop.** Eight sections, each with its own kind of rack, from a crate table in the hall to a
  spinner rack in the plant room and a market stall in the courtyard. Your shelves ("Quick picks",
  "Listen again"...) are brush-stroke words down the sides of the screen; click one and the camera
  walks there.
- **Records.** Hover a record and it comes out toward you with a paper name tag. Click it to play.
- **Albums.** Click an album and its songs come out of the sleeve as records, fanned out in front of
  you with their track numbers, plus a red record that plays the whole album. Pick a song and the
  album plays on from there.
- **The suitcase player.** A record player in a leather case, bottom left. The record spins with the
  cover on its label and the tonearm creeps in as the song plays. Turn the knob for volume, or drag
  the record to scrub. By default the song starts when the needle lands.
- **Mini player.** Press **⌃⌥K** anywhere to open the suitcase at your cursor, without opening
  the shop.
- **Search.** Press **⌃⌥J** to find a song. It has no sleeve, so the bottom of the suitcase slides
  out like a drawer and the record lifts out of it onto the platter. Shut the mini player early and the song starts
  at once.
- **A painted look.** The world is repainted with brush strokes pinned to its surfaces, and album
  covers are painted to match. Settings can switch to a softer watercolour wash or turn cover
  painting off.
- **Runs cool.** It only draws at full speed while something is moving. Once the shop is still it is
  not drawn again at all: only the turning record's corner and the paper border are repainted. It
  stops drawing while its window is hidden. Left in the menu bar it lets go of the mini player's window
  after five minutes unused (the next ⌃⌥K loads it again).

## Controls

| Key | Action |
| --- | --- |
| `⌃⌥K` (`Ctrl+Alt+K` on Windows/Linux) | Open or close the mini player, from any app |
| `⌃⌥L` (`Ctrl+Alt+L`) | Bring up the full app, from any app |
| `⌃⌥J` (`Ctrl+Alt+J`) | Search, in the shop or the mini player |
| `Space` | Play / pause |
| `←` `→` | Back / skip |
| `↑` `↓` or scroll | Volume |
| Scroll sideways, or drag | Turn the spinner rack (plant room), or the page of an album's songs |
| `L` | Like |

The first three can be changed in Settings > Shortcuts.
| `Tab` / `Shift+Tab` | Next / previous section |
| `Esc` | Put an album's records back, else back to the home spot, or close the mini player |
| `⌘,` (`Ctrl+,` on Windows/Linux) | Settings |

Click or press any key to skip the intro.

On macOS the volume controls set the Mac's own output volume. Elsewhere they set the player's volume.

## Run it

There are no packaged releases yet, so Sienna runs from source. You need Node.js 22.12 or newer.

```sh
cd app
npm install
npm run dev
```

After a `git pull`, `npm run dev` installs any new packages by itself before it starts.

The first time, use the sign-in button to log in to your Google account. Without signing in, it
works as a guest, with ads and generic shelves.

On Linux, Electron keeps Chromium's sandbox on, which needs either unprivileged user namespaces
(most distributions) or its setuid sandbox helper. If it stops with a sandbox error, set the helper up
once after each `npm install`:

```sh
sudo chown root:root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Please don't run it with `--no-sandbox`: that turns off a protection for the YouTube pages it loads.

macOS is the main target. Automated tests also run on Linux. Windows is untested.

## How it works

Sienna is an Electron app with a Three.js scene. All the scenery is built in code.

A hidden `music.youtube.com` window does the actual playing, so YouTube Music itself handles the
queue, radio, ads, history and likes. Sienna drives that page with a small injected script and
reads your shelves and search results from the same internal API the page uses.

```
app/                 the app
  electron/          main process, hidden YouTube Music window, mini window
  src/               the shop, racks, suitcase, painting, search, settings
  scripts/           dev launcher, screenshot tool, end-to-end and behaviour checks
  test/              unit tests
Sources/, Tests/,    the first prototype: a macOS suitcase remote for Kaset, written in Swift.
  Package.swift,     Shelved and not part of the app.
  scripts/build.sh
```

[`app/README.md`](app/README.md) has the details: each feature and its source file, URL options for
pinning the camera or time of day, and the dev pages.

## Develop

Run these from `app/`:

```sh
npm test                                   # unit tests: parser and suitcase
npm run web                                # the shop in a browser, with a fake record store
npm run build && npm run electron          # run the production build
npm run build && xvfb-run -a npm run e2e -- out_dir   # real app against YouTube Music (Linux)
node scripts/tour-check.mjs                # walk the first-run tour like a new user (fake store)
```

## Not done yet

- Packaged downloads
- Playlists opening into their own songs like albums do (clicking one plays all of it for now)
- Media keys

## License

[MIT](LICENSE)
