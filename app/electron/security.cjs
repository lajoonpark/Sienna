// What each Sienna window may do, in one place:
//   - permissions (camera, mic, notifications, geolocation...): refused, except the few YouTube Music needs
//   - where a window may navigate, and popups (none)
//   - which pages may call the main process (ipc): only Sienna's own pages, in Sienna's own windows
const { app, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const YTM_PARTITION = 'persist:ytm';
const YTM_ORIGIN = 'https://music.youtube.com';

// ---- whose pages are Sienna's ------------------------------------------------------------------
const DIST = path.join(__dirname, '..', 'dist');
const DIST_URL = pathToFileURL(DIST).href + '/';
const APP_PAGES = new Set(['index.html', 'mini.html']);

function parse(u) {
  try { return new URL(u); } catch { return null; }
}

// Is `u` one of Sienna's own pages (the built files, or the dev server while developing)?
function isAppUrl(u) {
  const url = parse(u);
  if (!url) return false;
  const dev = process.env.SIENNA_DEV_URL && parse(process.env.SIENNA_DEV_URL);
  if (dev) return url.origin === dev.origin && (url.protocol === 'http:' || url.protocol === 'https:');
  if (url.protocol !== 'file:') return false;
  const bare = `${url.origin === 'null' ? 'file://' : url.origin}${url.pathname}`;
  return bare.startsWith(DIST_URL) && APP_PAGES.has(bare.slice(DIST_URL.length));
}

// Google's own sites: where the player and the sign-in window may go (consent, sign-in, YouTube Music).
const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)*(?:youtube\.com|google\.com|google\.[a-z]{2,3}|google\.co\.[a-z]{2}|google\.com\.[a-z]{2}|gstatic\.com)$/;
function isGoogleUrl(u) {
  const url = parse(u);
  return !!url && url.protocol === 'https:' && !url.username && !url.password && GOOGLE_HOST.test(url.hostname.toLowerCase());
}

// ---- permissions -----------------------------------------------------------------------------------
// The player (music.youtube.com) may go full screen and copy a share link; nothing else is granted, to it
// or to any other page. Without these handlers Electron grants every request.
const YTM_ALLOWED = new Set(['fullscreen', 'clipboard-sanitized-write']);

function originOf(u) {
  return parse(u)?.origin ?? null;
}

function lockPermissions(ses, allow) {
  ses.setPermissionRequestHandler((_wc, permission, cb, details) => {
    cb(!!allow(permission, originOf(details?.requestingUrl)));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => !!allow(permission, originOf(requestingOrigin)));
  ses.setDevicePermissionHandler(() => false);   // USB / HID / serial
  ses.setDisplayMediaRequestHandler((_req, cb) => cb({}));   // screen capture: refused
}

function lockSessions() {
  lockPermissions(session.defaultSession, () => false);   // the shop and the mini window need none
  lockPermissions(session.fromPartition(YTM_PARTITION), (permission, origin) => origin === YTM_ORIGIN && YTM_ALLOWED.has(permission));
}

// ---- navigation and popups -------------------------------------------------------------------------
// Every window: no popups, no <webview>. Each window then says where it may navigate (lockNavigation).
function lockAllContents() {
  app.on('web-contents-created', (_e, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-attach-webview', (e) => e.preventDefault());
  });
}

// `allowed(url)`: may this window's page go there? Checked on navigation and on redirects.
function lockNavigation(contents, allowed) {
  const guard = (e) => {
    const url = e.url;
    if (!allowed(url)) {
      e.preventDefault();
      console.warn('[sienna] blocked navigation to', String(url).slice(0, 200));
    }
  };
  contents.on('will-navigate', guard);
  contents.on('will-redirect', (e) => { if (e.isMainFrame) guard(e); });
}

// ---- ipc ---------------------------------------------------------------------------------------------
// An ipc message counts only if it comes from the top frame of one of `windows()` (webContents), showing
// one of Sienna's own pages.
function makeTrusted(windows) {
  return function trusted(e) {
    const frame = e.senderFrame;
    if (!frame || frame.parent) return false;
    if (!windows().some((wc) => wc && !wc.isDestroyed() && wc === e.sender)) return false;
    return isAppUrl(frame.url);
  };
}

class UntrustedSender extends Error {
  constructor() { super('ipc from an untrusted page'); }
}

module.exports = {
  YTM_PARTITION, YTM_ORIGIN,
  isAppUrl, isGoogleUrl,
  lockSessions, lockAllContents, lockNavigation,
  makeTrusted, UntrustedSender,
};
