#!/usr/bin/env node
/**
 * Build hardening script for desktop distribution:
 *  - Obfuscates first-party app JS bundle assets (`index-*.js`) in `dist/assets/`
 *  - Skips third-party `vendor-*` / worker ESM chunks so React, Firebase, XLSX, PDF.js, and Recharts
 *    never suffer control-flow mangling or startup slowdown inside Electron ASAR.
 */

import fs from 'node:fs';
import path from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const root = process.cwd();
const assetsDir = path.join(root, 'dist', 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('[obfuscate-build] Missing dist/assets directory. Run npm run build first.');
  process.exit(1);
}

const files = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
let obfuscatedCount = 0;

for (const file of files) {
  // Only obfuscate first-party app entry/feature bundles; never mutate vendor/worker ESM chunks
  if (
    file.startsWith('vendor-') ||
    file.startsWith('pdf.worker') ||
    file.startsWith('purify') ||
    file.startsWith('index.es')
  ) {
    continue;
  }

  const fullPath = path.join(assetsDir, file);
  const code = fs.readFileSync(fullPath, 'utf8');
  if (code.length < 256 || code.length > 10_000_000) continue;

  const result = JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.45,
    splitStrings: false,
    unicodeEscapeSequence: false,
  });

  fs.writeFileSync(fullPath, result.getObfuscatedCode(), 'utf8');
  obfuscatedCount++;
}

console.log(`[obfuscate-build] Hardened ${obfuscatedCount} first-party app JS bundle file(s) inside dist/assets.`);
