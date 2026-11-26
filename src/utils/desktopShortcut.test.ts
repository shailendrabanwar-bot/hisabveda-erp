import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeToCRLF,
  resolvePublicAppUrl,
  buildWindowsDesktopShortcutBat,
  buildWindowsExeBuilderBat,
  buildAndroidApkBuilderBat,
  buildElectronMainCjs,
} from './desktopShortcut.ts';

test('resolvePublicAppUrl rewrites ais-dev- preview host to ais-pre- and strips trailing slash', () => {
  const resolved = resolvePublicAppUrl('https://ais-dev-demo123.asia-east1.run.app/');
  assert.equal(resolved, 'https://ais-pre-demo123.asia-east1.run.app');
});

test('buildWindowsDesktopShortcutBat creates Desktop & Start Menu shortcuts with HisabVeda.ico and CRLF line endings', () => {
  const bat = buildWindowsDesktopShortcutBat('https://hisabveda.in');
  assert.ok(bat.includes('\r\n'));
  assert.ok(!/(?<!\r)\n/.test(bat), 'batch script must only contain CRLF line endings');
  assert.ok(bat.includes('HisabVeda.ico'));
  assert.ok(bat.includes('HisabVeda ERP.lnk'));
  assert.ok(bat.includes('IconLocation'));
  assert.ok(bat.includes('https://hisabveda.in'));
});

test('buildWindowsExeBuilderBat uses CRLF and includes HisabVeda icon & electron build steps', () => {
  const bat = buildWindowsExeBuilderBat();
  assert.ok(!/(?<!\r)\n/.test(bat));
  assert.ok(bat.includes('npx electron-builder --win nsis'));
  assert.ok(bat.includes('HisabVeda.ico'));
  assert.ok(bat.includes('package.json'));
});

test('buildAndroidApkBuilderBat uses CRLF and initializes Capacitor project', () => {
  const bat = buildAndroidApkBuilderBat();
  assert.ok(!/(?<!\r)\n/.test(bat));
  assert.ok(bat.includes('com.hisabveda.erp'));
  assert.ok(bat.includes('npx cap sync android'));
});

test('buildElectronMainCjs configures HisabVeda window title and icon', () => {
  const mainJs = buildElectronMainCjs('https://hisabveda.in');
  assert.ok(mainJs.includes('hv-icon.ico'));
  assert.ok(mainJs.includes('https://hisabveda.in'));
  assert.equal(normalizeToCRLF('a\nb\r\nc'), 'a\r\nb\r\nc');
});
