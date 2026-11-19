// Privacy-first update check: makes ZERO network requests automatically.
// Only runs when the user explicitly clicks "Check for updates" in Settings > About.
const { app, net, shell } = require('electron');
const { isSafeReleaseUrl } = require('./security.cjs');

const REPO = 'lajoonpark/Sienna';
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const RELEASES_URL = `https://github.com/${REPO}/releases`;

function parseSemver(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v ?? '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] || '' };
}

// Returns > 0 if `a` is newer than `b`, < 0 if older, 0 if equal.
function compareVersions(a, b) {
  const pa = parseSemver(a), pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (const k of ['major', 'minor', 'patch']) {
    if (pa[k] !== pb[k]) return pa[k] - pb[k];
  }
  if (pa.pre === pb.pre) return 0;
  if (!pa.pre) return 1;  // 1.0.0 > 1.0.0-beta.1
  if (!pb.pre) return -1;
  return pa.pre.localeCompare(pb.pre);
}

async function checkForUpdates() {
  const current = app.getVersion();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await net.fetch(LATEST_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Sienna/${current}` },
      signal: ctrl.signal,
    });
    if (res.status === 404) {
      return { ok: true, current, latest: null, hasUpdate: false, url: RELEASES_URL, note: 'No releases published yet.' };
    }
    if (!res.ok) return { ok: false, current, error: `GitHub returned HTTP ${res.status}` };
    const data = await res.json();
    const latest = String(data?.tag_name || data?.name || '').replace(/^v/, '').trim();
    const url = isSafeReleaseUrl(data?.html_url) ? data.html_url : RELEASES_URL;
    const hasUpdate = !!latest && compareVersions(latest, current) > 0;
    return {
      ok: true,
      current,
      latest: latest || null,
      hasUpdate,
      url,
      name: typeof data?.name === 'string' ? data.name.slice(0, 120) : null,
    };
  } catch (e) {
    return { ok: false, current, error: e?.name === 'AbortError' ? 'Timed out reaching GitHub.' : 'Could not reach GitHub.' };
  } finally {
    clearTimeout(timer);
  }
}

async function openReleaseUrl(url) {
  const target = isSafeReleaseUrl(url) ? url : RELEASES_URL;
  await shell.openExternal(target);
  return true;
}

module.exports = { checkForUpdates, openReleaseUrl, compareVersions, parseSemver, RELEASES_URL };
