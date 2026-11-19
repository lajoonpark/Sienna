// The sections of the shop. Each YouTube Music home/library shelf gets one station: a spot in the
// shop with its own kind of record rack and a place for the camera to stand while you browse it.
// Matches localized shelf names AND falls back to item composition (albums, playlists, mixes, songs)
// so non-English YouTube Music accounts still get natural rack assignments.
import * as THREE from 'three';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const H = Math.PI / 2;

export const STATIONS = [
  { id: 'table', style: 'trough', room: 'hall', pos: v(0, 0, -5.6), rotY: 0,
    cam: { pos: v(0, 1.82, -4.48), target: v(0, 0.98, -5.72) },
    prefer: /quick picks|빠른 선곡|クイックピック|selección rápida|sélection rapide|schnellauswahl|scelte rapide|escolhas rápidas|liked songs|좋아요 표시한 음악/i },
  { id: 'cubby', style: 'cubby', room: 'hall', pos: v(5.2, 0, -6.4), rotY: -H,
    cam: { pos: v(3.4, 1.55, -6.4), target: v(5.2, 1.1, -6.4) },
    prefer: /listen again|다시 듣기|もう一度聴く|volver a escuchar|réécouter|nochmal anhören|riascolta|ouvir de novo/i },
  { id: 'gallery', style: 'floorlean', room: 'gallery', pos: v(-5.2, 3.03, -6.0), rotY: H,
    cam: { pos: v(-3.8, 4.35, -6.0), target: v(-5.2, 3.4, -6.0) },
    prefer: /forgotten|잊고 있던|懐かし|olvidados|oubliés|vergessene|dimenticati|esquecidos/i },
  { id: 'counter', style: 'easel', room: 'hall', pos: v(4.0, 1.08, -8.85), rotY: 0,
    cam: { pos: v(4.0, 1.75, -7.3), target: v(4.0, 1.35, -8.85) },
    prefer: /album|release|앨범|발매|アルバム|新譜|álbum|lanzamiento|sortie|veröffentlichung/i,
    preferKind: 'album' },
  { id: 'lounge', style: 'wall', room: 'lounge', pos: v(-3.22, -0.6, -13.4), rotY: H,
    cam: { pos: v(-0.5, 1.05, -13.4), target: v(-3.2, 1.0, -13.4) },
    prefer: /mix|믹스|ミックス|mezcla|mélange/i,
    preferKind: 'mix' },
  { id: 'stacks', style: 'tall', room: 'stacks', pos: v(6.1, -0.6, -11.25), rotY: Math.PI,
    cam: { pos: v(6.1, 1.05, -14.25), target: v(6.1, 1.0, -11.3) },
    prefer: /library|playlist|재생목록|플레이리스트|ライブラリ|プレイリスト|biblioteca|liste/i,
    preferKind: 'playlist' },
  { id: 'plants', style: 'spinner', room: 'plants', pos: v(9.5, 1.2, -20.9), rotY: 0,
    cam: { pos: v(9.5, 2.95, -18.45), target: v(9.5, 2.28, -20.9) },
    prefer: /similar|recommended|because|비슷한|추천|おすすめ|関連|similares|recommandé|ähnlich|artist|아티스트|アーティスト/i },
  { id: 'courtyard', style: 'crates', room: 'courtyard', pos: v(3.6, 0, -26.4), rotY: Math.PI - 0.35,
    cam: { pos: v(4.12, 1.70, -28.13), target: v(3.57, 0.92, -26.31) }, prefer: null },
  { id: 'libPlaylists', style: 'wall', room: 'library', pos: v(6.52, -0.6, -6.8), rotY: H,
    cam: { pos: v(9.2, 1.05, -6.8), target: v(6.52, 1.0, -6.8) },
    librarySlot: 'playlists', prefer: /^your playlists$/i },
  { id: 'libAlbums', style: 'cubby', room: 'library', pos: v(12.4, -0.6, -6.8), rotY: -H,
    cam: { pos: v(10.6, 0.95, -6.8), target: v(12.4, 0.5, -6.8) },
    librarySlot: 'albums', prefer: /^saved albums$/i },
];

export const HOME = { pos: v(0, 1.75, -2.2), target: v(0, 1.6, -12) };

// Infer dominant item kind for locale-independent station matching when title didn't match.
function dominantKind(shelf) {
  const items = shelf?.items ?? [];
  if (!items.length) return null;
  const counts = { album: 0, playlist: 0, mix: 0, song: 0 };
  for (const it of items) {
    const pid = it.play?.playlistId || '';
    if (it.kind === 'album') counts.album++;
    else if (/^RD/.test(pid) && !/^RDCLAK/.test(pid)) counts.mix++;
    else if (it.kind === 'playlist') counts.playlist++;
    else if (it.kind === 'song') counts.song++;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= items.length * 0.5 ? top[0] : null;
}

// shelves -> [{ station, index, shelf }] in station order (only stations that got a shelf).
// Library shelves (tagged with librarySlot) always populate their dedicated racks in the vaulted Library Room;
// Home shelves populate the 8 main shop stations and never spill into or get displaced by the Library Room.
export function assignShelves(shelves) {
  const taken = new Map(); // station index -> shelf
  const homeShelves = [];
  for (const shelf of shelves) {
    if (shelf.librarySlot) {
      const i = STATIONS.findIndex((s, k) => !taken.has(k) && s.librarySlot === shelf.librarySlot);
      if (i >= 0) taken.set(i, shelf);
    } else {
      homeShelves.push(shelf);
    }
  }
  const isHomeSlot = (s, k) => !taken.has(k) && !s.librarySlot;
  const rest = [];
  // Pass 1: title preference match (EN + localized)
  for (const shelf of homeShelves) {
    const i = STATIONS.findIndex((s, k) => isHomeSlot(s, k) && s.prefer?.test(shelf.title));
    if (i >= 0) taken.set(i, shelf);
    else rest.push(shelf);
  }
  // Pass 2: structural match by dominant item kind (albums -> counter easel, playlists -> stacks, mixes -> lounge)
  const leftover = [];
  for (const shelf of rest) {
    const kind = dominantKind(shelf);
    const i = kind ? STATIONS.findIndex((s, k) => isHomeSlot(s, k) && s.preferKind === kind) : -1;
    if (i >= 0) taken.set(i, shelf);
    else leftover.push(shelf);
  }
  // Pass 3: fill remaining free main-shop stations in order
  STATIONS.forEach((s, k) => { if (isHomeSlot(s, k) && leftover.length) taken.set(k, leftover.shift()); });
  return STATIONS.map((station, k) => ({ station, index: k, shelf: taken.get(k) })).filter((a) => a.shelf);
}
