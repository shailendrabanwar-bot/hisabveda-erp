import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APP_CONFIG,
  applyErpFeaturePreset,
  isNavTabEnabled,
  resolveWindowsInstallerUrl,
} from './appConfig';
import { MANUAL_TOPICS, filterManualTopics } from './userManualData';

test('DEFAULT_APP_CONFIG enables all ERP tabs and modules', () => {
  const tabs = [
    'dashboard',
    'pos',
    'invoices',
    'purchases',
    'vouchers',
    'reconciliation',
    'payroll',
    'tax',
    'ledger',
    'statements',
    'mis-reports',
    'budgeting',
    'audit',
    'items',
    'parties',
    'utilities',
    'settings',
  ];

  for (const tab of tabs) {
    assert.equal(isNavTabEnabled(tab, DEFAULT_APP_CONFIG), true, `Expected ${tab} to be enabled`);
  }
});

test('ACCOUNTS_ONLY preset hides Inventory and Barcode POS while preserving core accounting tabs', () => {
  const accountsOnly = applyErpFeaturePreset(DEFAULT_APP_CONFIG, 'ACCOUNTS_ONLY');

  assert.equal(accountsOnly.accountingWithoutInventory, true);
  assert.equal(isNavTabEnabled('items', accountsOnly), false);
  assert.equal(isNavTabEnabled('pos', accountsOnly), false);

  for (const coreTab of ['dashboard', 'invoices', 'purchases', 'vouchers', 'ledger', 'statements', 'tax', 'parties']) {
    assert.equal(isNavTabEnabled(coreTab, accountsOnly), true, `Expected ${coreTab} to stay enabled`);
  }
});

test('accountingWithoutInventory overrides enableBarcodePos even if enableBarcodePos is true', () => {
  const config = {
    ...DEFAULT_APP_CONFIG,
    accountingWithoutInventory: true,
    enableBarcodePos: true,
  };

  assert.equal(isNavTabEnabled('items', config), false);
  assert.equal(isNavTabEnabled('pos', config), false);
});

test('disabling enableBarcodePos hides pos tab while keeping Inventory items enabled', () => {
  const config = {
    ...DEFAULT_APP_CONFIG,
    accountingWithoutInventory: false,
    enableBarcodePos: false,
  };

  assert.equal(isNavTabEnabled('pos', config), false);
  assert.equal(isNavTabEnabled('items', config), true);
});

test('POS_RETAIL and FULL_ERP presets re-enable Inventory and Barcode POS', () => {
  const accountsOnly = applyErpFeaturePreset(DEFAULT_APP_CONFIG, 'ACCOUNTS_ONLY');
  const posRetail = applyErpFeaturePreset(accountsOnly, 'POS_RETAIL');

  assert.equal(posRetail.accountingWithoutInventory, false);
  assert.equal(posRetail.enableBarcodePos, true);
  assert.equal(posRetail.posAutoPromptNewBarcode, true);
  assert.equal(isNavTabEnabled('pos', posRetail), true);
  assert.equal(isNavTabEnabled('items', posRetail), true);

  const fullErp = applyErpFeaturePreset(
    { ...accountsOnly, enablePayroll: false, enableBudgeting: false, enableAuditLog: false },
    'FULL_ERP'
  );
  assert.equal(fullErp.accountingWithoutInventory, false);
  assert.equal(isNavTabEnabled('payroll', fullErp), true);
  assert.equal(isNavTabEnabled('budgeting', fullErp), true);
  assert.equal(isNavTabEnabled('audit', fullErp), true);
});

test('individual module flags toggle their exact navigation tabs', () => {
  const config = {
    ...DEFAULT_APP_CONFIG,
    enablePurchases: false,
    enableBankReconciliation: false,
    enableTaxCompliance: false,
    enablePayroll: false,
    enableBudgeting: false,
    enableAuditLog: false,
  };

  assert.equal(isNavTabEnabled('purchases', config), false);
  assert.equal(isNavTabEnabled('reconciliation', config), false);
  assert.equal(isNavTabEnabled('tax', config), false);
  assert.equal(isNavTabEnabled('payroll', config), false);
  assert.equal(isNavTabEnabled('budgeting', config), false);
  assert.equal(isNavTabEnabled('audit', config), false);
  assert.equal(isNavTabEnabled('dashboard', config), true);
  assert.equal(isNavTabEnabled('invoices', config), true);
});

test('resolveWindowsInstallerUrl handles Google Drive share links, GitHub Releases, and blocks unsafe URLs', () => {
  assert.equal(resolveWindowsInstallerUrl(''), '');
  assert.equal(resolveWindowsInstallerUrl('javascript:alert(1)'), '');

  const driveView = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing';
  assert.equal(
    resolveWindowsInstallerUrl(driveView),
    'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz'
  );

  const driveOpen = 'https://drive.google.com/open?id=XYZ_12345';
  assert.equal(
    resolveWindowsInstallerUrl(driveOpen),
    'https://drive.google.com/uc?export=download&id=XYZ_12345'
  );

  const githubExe = 'https://github.com/owner/hisabveda/releases/download/v2.0.0/Hisabveda-ERP-Setup.exe';
  assert.equal(resolveWindowsInstallerUrl(githubExe), githubExe);
});

test('filterManualTopics filters embedded User Manual accurately by query and category', () => {
  assert.ok(MANUAL_TOPICS.length >= 8);

  const xmlHits = filterManualTopics(MANUAL_TOPICS, 'PARTYGSTIN optional');
  assert.ok(xmlHits.some((t) => t.id === 'tally-xml-import'));

  const drillHits = filterManualTopics(MANUAL_TOPICS, 'drill-down escape', 'financial-reports');
  assert.equal(drillHits.length, 1);
  assert.equal(drillHits[0].id, 'financial-drilldown');

  const licenseHits = filterManualTopics(MANUAL_TOPICS, '365 Hardware');
  assert.ok(licenseHits.some((t) => t.id === 'desktop-exe-licensing'));
});

