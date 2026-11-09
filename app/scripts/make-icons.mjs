// Renders the icons from their SVG sources in icons/ (GPU Chromium, transparent background):
//   icons/app-icon.svg -> electron/icon.png (1024, Dock icon / window icon)
//   icons/menubar.svg  -> electron/trayTemplate.png (22) + trayTemplate@2x.png (44)
// The "Template" suffix makes macOS tint the menu bar icon for light/dark menu bars.
// Run after editing an SVG: node scripts/make-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const here = (p) => new URL(p, import.meta.url);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=vulkan', '--ignore-gpu-blocklist'] });

async function render(svgFile, size, scale, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: scale });
  const svg = readFileSync(here(svgFile), 'utf8').replace(/<svg /, `<svg style="display:block;width:${size}px;height:${size}px" `);
  await page.setContent(`<body style="margin:0;background:transparent">${svg}</body>`);
  await page.screenshot({ path: here(out).pathname, omitBackground: true });
  await page.close();
}

await render('../icons/app-icon.svg', 1024, 1, '../electron/icon.png');
await render('../icons/menubar.svg', 22, 1, '../electron/trayTemplate.png');
await render('../icons/menubar.svg', 22, 2, '../electron/trayTemplate@2x.png');
await browser.close();
console.log('icons written to electron/');
