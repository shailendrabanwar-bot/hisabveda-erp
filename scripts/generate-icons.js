import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const sourceLogo = path.resolve('public/assets/aistudio/HISAB_VEDA_ERP_accounting_logo_58b6a0fc.png');
const outDir = path.resolve('public');

if (!fs.existsSync(sourceLogo)) {
  console.error('Official logo not found at:', sourceLogo);
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// Primary clean-named PWA & Desktop icons (prevents stale browser/Android WebAPK icon caching)
execSync(`convert "${sourceLogo}" -background white -alpha remove -alpha off -resize 192x192 "${path.join(outDir, 'hv-app-192.png')}"`);
execSync(`convert "${sourceLogo}" -background white -alpha remove -alpha off -resize 512x512 "${path.join(outDir, 'hv-app-512.png')}"`);
execSync(`convert "${sourceLogo}" -background white -alpha remove -alpha off -resize 380x380 -gravity center -extent 512x512 "${path.join(outDir, 'hv-app-maskable-512.png')}"`);
execSync(`convert "${sourceLogo}" -background white -alpha remove -alpha off -resize 156x156 -gravity center -extent 180x180 "${path.join(outDir, 'hv-apple-touch-180.png')}"`);
execSync(`convert "${sourceLogo}" -background transparent -define icon:auto-resize=256,64,48,32,16 "${path.join(outDir, 'hv-icon.ico')}"`);

// Mirror onto legacy filenames so any older bookmarks/references also receive the official logo
fs.copyFileSync(path.join(outDir, 'hv-app-192.png'), path.join(outDir, 'pwa-192x192.png'));
fs.copyFileSync(path.join(outDir, 'hv-app-512.png'), path.join(outDir, 'pwa-512x512.png'));
fs.copyFileSync(path.join(outDir, 'hv-app-maskable-512.png'), path.join(outDir, 'pwa-maskable-512x512.png'));
fs.copyFileSync(path.join(outDir, 'hv-apple-touch-180.png'), path.join(outDir, 'apple-touch-icon.png'));
fs.copyFileSync(path.join(outDir, 'hv-icon.ico'), path.join(outDir, 'favicon.ico'));
fs.copyFileSync(path.join(outDir, 'hv-icon.ico'), path.join(outDir, 'icon.ico'));

// Replace legacy circle-and-dot icon.svg with an SVG wrapping the official logo raster
const png192Base64 = fs.readFileSync(path.join(outDir, 'hv-app-192.png')).toString('base64');
const cleanSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="96" fill="#ffffff" />
  <image href="data:image/png;base64,${png192Base64}" x="24" y="24" width="464" height="464" preserveAspectRatio="xMidYMid meet" />
</svg>
`;
fs.writeFileSync(path.join(outDir, 'icon.svg'), cleanSvg, 'utf8');

console.log('Successfully generated fresh HisabVeda mobile PWA & desktop icons in /public');
