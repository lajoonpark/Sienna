// Which cover pictures the renderer may load, and how big they may be. Cover urls come from YouTube
// Music (shelves, search, the player's now-playing state), so only Google's image hosts over https are
// fetched; data: images are the collages painted here (src/cover.js). The page's Content Security Policy
// (index.html, mini.html) enforces the same hosts for every image and fetch.
const HOSTS = ['googleusercontent.com', 'ggpht.com', 'ytimg.com'];

export const ART_MAX_BYTES = 8 * 1024 * 1024;   // a 544 px cover is tens of KB
export const ART_MAX_PIXELS = 4096 * 4096;
export const ART_TIMEOUT_MS = 15000;

// `u` if it may be loaded, else null.
export function safeArtUrl(u) {
  if (typeof u !== 'string' || !u) return null;
  if (u.startsWith('data:image/')) return u;
  if (u.length > 4096) return null;
  let url;
  try { url = new URL(u); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  return HOSTS.some((h) => host.endsWith(`.${h}`)) ? u : null;
}

// Is a decoded picture small enough to draw?
export const artSizeOk = (w, h) => w > 0 && h > 0 && w * h <= ART_MAX_PIXELS;
