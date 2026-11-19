// What each Sienna window may do, in one place:
//   - permissions (camera, mic, notifications, geolocation...): refused everywhere
//   - where a window may navigate, and popups (none)
//   - which pages may call the main process (ipc): only Sienna's own pages, in Sienna's own windows
//   - dev/test environment variables are ignored in packaged builds
const { app, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const YTM_PARTITION = 'persist:ytm';
const YTM_ORIGIN = 'https://music.youtube.com';

// ---- whose pages are Sienna's ------------------------------------------------------------------
const DIST = path.join(__dirname, '..', 'dist');
const DIST_URL = pathToFileURL(DIST).href + '/';
const APP_PAGES = new Set(['index.html', 'mini.html']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function parse(u) {
  try { return new URL(u); } catch { return null; }
}

function isPackaged() {
  return !!app?.isPackaged;
}

// Dev-only env var helper: ignored in packaged builds so a launcher/env cannot hijack the app.
function devEnv(name) {
  if (isPackaged()) return '';
  return process.env[name] || '';
}

// Loopback-only dev server URL, ignored in packaged builds.
function devServerUrl() {
  const raw = devEnv('SIENNA_DEV_URL');
  if (!raw) return null;
  const url = parse(raw);
  if (!url) return null;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) return null;
  return url;
}

// Is `u` one of Sienna's own pages (the built files, or a loopback dev server while developing)?
function isAppUrl(u) {
  const url = parse(u);
  if (!url) return false;
  const dev = devServerUrl();
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

// Optional extra SSO host allowlist (only used for a single sign-in window after explicit user confirmation).
function isHttpsHostAllowed(u, extraHosts) {
  if (isGoogleUrl(u)) return true;
  if (!extraHosts?.size) return false;
  const url = parse(u);
  if (!url || url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  for (const allowed of extraHosts) {
    if (host === allowed || host.endsWith(`.${allowed}`)) return true;
  }
  return false;
}

// Strictly validate external release URLs before shell.openExternal.
function isSafeReleaseUrl(u) {
  const url = parse(u);
  return !!url && url.protocol === 'https:' && url.hostname.toLowerCase() === 'github.com'
    && url.pathname.startsWith('/lajoonpark/Sienna');
}

// ---- permissions -----------------------------------------------------------------------------------
// No special permissions are granted to either the shop/mini windows or the hidden YouTube Music player.
// Without these handlers Electron grants every request by default.
const YTM_ALLOWED = new Set();

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
// `onBlocked(url)`: optional callback when a navigation is refused (e.g., corporate/school SSO prompt).
function lockNavigation(contents, allowed, onBlocked = null) {
  const guard = (e) => {
    const url = e.url;
    if (!allowed(url)) {
      e.preventDefault();
      console.warn('[sienna] blocked navigation to', String(url).slice(0, 200));
      onBlocked?.(url);
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
  devEnv, devServerUrl, isPackaged,
  isAppUrl, isGoogleUrl, isHttpsHostAllowed, isSafeReleaseUrl,
  lockSessions, lockAllContents, lockNavigation,
  makeTrusted, UntrustedSender,
};
