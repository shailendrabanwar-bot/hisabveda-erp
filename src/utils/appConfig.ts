export interface AppConfiguration {
  // General & Accounting
  negativeCashWarning: boolean;
  negativeStockWarning: boolean;
  negativeStockMode: 'ALLOW' | 'WARN' | 'BLOCK';
  billByBillTracking: boolean;
  autoRoundOff: boolean;
  showCreditLimitWarning: boolean;
  creditLimitAmount: number;
  dualEntryMode: boolean; // Dr/Cr vs Single Entry

  // Voucher & Data Entry Fast Track
  quickDateSkip: boolean;
  enterToTab: boolean;
  soundEffects: boolean;
  autoPrintInvoice: boolean;
  defaultVoucherType: 'invoice' | 'receipt' | 'payment' | 'journal' | 'contra';

  // Inventory & Stock
  maintainBatches: boolean;
  maintainFreeQty: boolean;
  itemDiscountColumn: boolean;
  hsnMandatory: boolean;
  defaultUnit: string;

  // Invoicing, GST & Universal Print Configuration
  ewayBillThreshold: number;
  showBankQrCode: boolean;
  showAuthorizedSignatory: boolean;
  invoiceCopies: number;
  defaultPaperSize: 'A4' | 'A5' | 'Thermal-3inch' | 'Thermal-58mm';
  invoicePrefix: string;
  printOrientation: 'portrait' | 'landscape';
  printMargins: 'compact' | 'standard' | 'wide';
  printFontScale: 'compact' | 'standard' | 'large';
  showCompanyLogoOnPrint: boolean;
  showTermsOnPrint: boolean;
  showHsnTaxBreakdown: boolean;
  showPreparedByCheckedBy: boolean;
  printCopyLabel: 'ORIGINAL' | 'DUPLICATE' | 'TRIPLICATE' | 'OFFICE' | 'NONE';
  printWatermarkText: string;
  invoicePrintTheme: 'GST_STANDARD' | 'MODERN';

  // Financial Statements & Reports
  defaultFinancialReportMode: 'condensed' | 'detailed';
  showZeroBalanceLedgers: boolean;

  // TDS & Statutory Tax Configuration (आयकर टीडीएस एवं वैधानिक नियम)
  enableTds: boolean;
  enableTcs: boolean;
  companyTanNumber: string;
  tdsDeductorType: 'Company' | 'Individual_HUF' | 'Firm';
  autoTdsThresholdWarning: boolean;
  tdsHigherRateNoPan: boolean; // Sec 206AA: 20% if no PAN
  roundOffTdsToRupee: boolean; // Sec 288B: Round to nearest whole Rupee
  defaultTdsSection: '194C' | '194J' | '194I_Rent' | '194H' | '194Q';
  autoCreateTdsVoucher: boolean;

  // Special Enterprise Features & Security (असाधारण सुविधाएं)
  enableWhatsAppInvoice: boolean;
  whatsAppSenderName: string;
  enableThermalPosPrinter: boolean;
  thermalPaperWidth: '58mm' | '80mm';
  mcaAuditTrailMandatory: boolean; // MCA 2023 Audit Trail compliance
  booksLockDate: string; // Freeze transactions prior to date
  barcodeAutoIncrementQty: boolean; // Increment qty automatically on repeated scan
  bankMatchToleranceDays: number; // Cheque clearance tolerance days (± 1 to 5)

  // Software Modules & Feature Visibility Switches (मॉड्यूल और फीचर्स ऑन/ऑफ)
  accountingWithoutInventory: boolean; // Accounts-Only Mode: hide Inventory & Barcode POS, service/ledger billing only
  enableBarcodePos: boolean;
  enablePurchases: boolean;
  enableBankReconciliation: boolean;
  enableTaxCompliance: boolean;
  enablePayroll: boolean;
  enableBudgeting: boolean;
  enableAuditLog: boolean;
  posAutoPromptNewBarcode: boolean; // Open Quick Item + Stock dialog automatically when an unknown barcode is scanned in POS

  // Windows Desktop (.exe) Installer Distribution
  windowsExeDownloadUrl: string; // Google Drive, GitHub Releases, or direct HTTPS URL to .exe installer
  windowsExeVersion: string;
}

export const DEFAULT_WINDOWS_INSTALLER_URL =
  'https://github.com/shailendrabanwar-bot/hisabveda-erp/releases/latest';

function getEnvWindowsInstallerUrl(): string {
  if (typeof import.meta === 'undefined') return '';
  const env = (import.meta as any).env;
  const raw = env?.VITE_WINDOWS_INSTALLER_URL || env?.VITE_WINDOWS_EXE_URL || '';
  return String(raw).trim();
}

export const DEFAULT_APP_CONFIG: AppConfiguration = {
  negativeCashWarning: true,
  negativeStockWarning: true,
  negativeStockMode: 'WARN',
  billByBillTracking: true,
  autoRoundOff: true,
  showCreditLimitWarning: true,
  creditLimitAmount: 500000,
  dualEntryMode: true,

  quickDateSkip: false,
  enterToTab: true,
  soundEffects: true,
  autoPrintInvoice: false,
  defaultVoucherType: 'invoice',

  maintainBatches: false,
  maintainFreeQty: false,
  itemDiscountColumn: true,
  hsnMandatory: false,
  defaultUnit: 'PCS',

  ewayBillThreshold: 50000,
  showBankQrCode: true,
  showAuthorizedSignatory: true,
  invoiceCopies: 1,
  defaultPaperSize: 'A4',
  invoicePrefix: 'INV/2026-27/',
  printOrientation: 'portrait',
  printMargins: 'standard',
  printFontScale: 'standard',
  showCompanyLogoOnPrint: true,
  showTermsOnPrint: true,
  showHsnTaxBreakdown: true,
  showPreparedByCheckedBy: true,
  printCopyLabel: 'ORIGINAL',
  printWatermarkText: '',
  invoicePrintTheme: 'GST_STANDARD',

  defaultFinancialReportMode: 'condensed',
  showZeroBalanceLedgers: false,

  // TDS Defaults
  enableTds: true,
  enableTcs: false,
  companyTanNumber: 'DELB12345F',
  tdsDeductorType: 'Company',
  autoTdsThresholdWarning: true,
  tdsHigherRateNoPan: true,
  roundOffTdsToRupee: true,
  defaultTdsSection: '194C',
  autoCreateTdsVoucher: true,

  // Special Enterprise Defaults
  enableWhatsAppInvoice: true,
  whatsAppSenderName: 'Hisab Veda ERP',
  enableThermalPosPrinter: false,
  thermalPaperWidth: '80mm',
  mcaAuditTrailMandatory: true,
  booksLockDate: '',
  barcodeAutoIncrementQty: true,
  bankMatchToleranceDays: 3,

  // Modules & Feature Visibility Defaults (All core ERP modules enabled by default)
  accountingWithoutInventory: false,
  enableBarcodePos: true,
  enablePurchases: true,
  enableBankReconciliation: true,
  enableTaxCompliance: true,
  enablePayroll: true,
  enableBudgeting: true,
  enableAuditLog: true,
  posAutoPromptNewBarcode: true,

  windowsExeDownloadUrl: getEnvWindowsInstallerUrl(),
  windowsExeVersion: '2.0.0',
};

const CONFIG_STORAGE_KEY = 'sna_app_configuration_v1';

export function loadAppConfig(): AppConfiguration {
  if (typeof window === 'undefined') return DEFAULT_APP_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_CONFIG;
    const parsed = JSON.parse(raw);
    const merged: AppConfiguration = { ...DEFAULT_APP_CONFIG, ...parsed };
    if (!parsed.negativeStockMode) {
      merged.negativeStockMode = merged.negativeStockWarning === false ? 'ALLOW' : 'WARN';
    } else {
      merged.negativeStockWarning = merged.negativeStockMode !== 'ALLOW';
    }
    return merged;
  } catch (e) {
    console.error('Failed to parse app config:', e);
    return DEFAULT_APP_CONFIG;
  }
}

export function saveAppConfig(config: AppConfiguration): void {
  if (typeof window === 'undefined') return;
  try {
    const normalizedMode: AppConfiguration['negativeStockMode'] =
      config.negativeStockMode || (config.negativeStockWarning === false ? 'ALLOW' : 'WARN');
    const normalized: AppConfiguration = {
      ...config,
      negativeStockMode: normalizedMode,
      negativeStockWarning: normalizedMode !== 'ALLOW',
    };
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    if (window.hisabvedaDesktop?.saveSettings) {
      window.hisabvedaDesktop.saveSettings(normalized).catch((err) => {
        console.warn('Desktop settings mirror failed:', err);
      });
    }
    window.dispatchEvent(new CustomEvent('sna_config_updated', { detail: normalized }));
  } catch (e) {
    console.error('Failed to save app config:', e);
  }
}

/**
 * Resolves a configured Windows Desktop (.exe) installer URL (supporting direct HTTPS links,
 * GitHub Releases asset links, and standard Google Drive share links -> direct download URL).
 */
export function resolveWindowsInstallerUrl(rawUrl?: string): string {
  const envFallback = getEnvWindowsInstallerUrl();
  const trimmed = (rawUrl || envFallback || '').trim();
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    // Automatically convert Google Drive /file/d/<ID>/view or /open?id=<ID> to direct download URL
    if (parsed.hostname.includes('drive.google.com')) {
      const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
      const fileId = fileMatch?.[1] || parsed.searchParams.get('id');
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      }
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Pure module visibility check used by Sidebar, Header, Shortcuts, and App router.
 * - Accounting Without Inventory ("Accounts Only"): hides Inventory (`items`) & Barcode POS (`pos`).
 * - Individual module toggles hide their corresponding tabs even when Inventory is active.
 */
export function isNavTabEnabled(tab: string, config: AppConfiguration): boolean {
  if (config.accountingWithoutInventory) {
    if (tab === 'items' || tab === 'pos') return false;
  }
  switch (tab) {
    case 'pos':
      return Boolean(config.enableBarcodePos);
    case 'purchases':
      return Boolean(config.enablePurchases);
    case 'reconciliation':
      return Boolean(config.enableBankReconciliation);
    case 'tax':
      return Boolean(config.enableTaxCompliance);
    case 'payroll':
      return Boolean(config.enablePayroll);
    case 'budgeting':
      return Boolean(config.enableBudgeting);
    case 'audit':
      return Boolean(config.enableAuditLog);
    default:
      return true;
  }
}

export type ErpFeaturePreset = 'FULL_ERP' | 'ACCOUNTS_ONLY' | 'POS_RETAIL';

export function applyErpFeaturePreset(
  current: AppConfiguration,
  preset: ErpFeaturePreset
): AppConfiguration {
  if (preset === 'ACCOUNTS_ONLY') {
    return {
      ...current,
      accountingWithoutInventory: true,
      enableBarcodePos: false,
      enablePurchases: true,
      enableBankReconciliation: true,
      enableTaxCompliance: true,
      enablePayroll: true,
      enableBudgeting: true,
      enableAuditLog: true,
    };
  }
  if (preset === 'POS_RETAIL') {
    return {
      ...current,
      accountingWithoutInventory: false,
      enableBarcodePos: true,
      posAutoPromptNewBarcode: true,
      barcodeAutoIncrementQty: true,
      enablePurchases: true,
      enableBankReconciliation: true,
      enableTaxCompliance: true,
    };
  }
  // FULL_ERP
  return {
    ...current,
    accountingWithoutInventory: false,
    enableBarcodePos: true,
    enablePurchases: true,
    enableBankReconciliation: true,
    enableTaxCompliance: true,
    enablePayroll: true,
    enableBudgeting: true,
    enableAuditLog: true,
    posAutoPromptNewBarcode: true,
  };
}

export function playAudioBeep(type: 'success' | 'warning' | 'click' = 'success'): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } else if (type === 'warning') {
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      osc.frequency.setValueAtTime(240, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    } else {
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    }
  } catch (e) {
    // Audio context may be blocked by browser policy prior to user interaction
  }
}
