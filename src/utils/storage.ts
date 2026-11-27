import { Account, AccountGroup, AppData, CompanyDetails, Currency, LicenseInfo } from '../types';
import { initialSampleData } from '../data/sampleData';
import { createDefaultMainGodown, ensureGodowns } from './inventoryBatches';
import {
  CLOCK_WATERMARK_STORAGE_KEY,
  getLastVerifiedServerTimeMs,
  getOrGenerateMachineId,
  parseAndVerifySignedLicense,
  readConsumedActivationsRegistry,
  readSealedLicenseCacheEnvelope,
  sealLicenseCacheEnvelope,
  writeConsumedActivationsRegistry,
} from './license';

export const OWNER_ADMIN_EMAIL = 'shailendrabanwar@gmail.com';

const BASE_STORAGE_KEY = 'apex_accounting_data_v2';
const BASE_STORAGE_MODE_KEY = 'sna_storage_mode';
const CONFIG_STORAGE_KEY = 'sna_app_configuration_v1';
const MACHINE_ID_STORAGE_KEY = 'sna_machine_fingerprint_v1';

export type StorageMode = 'cloud' | 'local';

let activeStorageUserId: string | null = null;
let desktopHydrated = false;
let desktopBeforeUnloadAttached = false;
let lastFlushedStorageKey: string | null = null;
let lastFlushedData: AppData | null = null;

export function isElectronDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.hisabvedaDesktop?.isDesktopApp);
}

/**
 * Synchronously hydrates Chromium localStorage from the permanent Electron userData JSON database
 * on boot so cache clears, app updates, or new installs preserve all company data, settings,
 * trial start dates, and activated licenses.
 */
export function hydrateLocalStorageFromDesktop(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  const bridge = window.hisabvedaDesktop;
  if (!bridge?.getBootstrapState) return;

  if (!desktopBeforeUnloadAttached) {
    desktopBeforeUnloadAttached = true;
    window.addEventListener('beforeunload', () => {
      try {
        if (lastFlushedStorageKey && lastFlushedData && bridge.flushSync) {
          let settings: any = null;
          try {
            const rawCfg = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (rawCfg) settings = JSON.parse(rawCfg);
          } catch {
            // ignore config read failure
          }
          bridge.flushSync({
            storageKey: lastFlushedStorageKey,
            data: lastFlushedData,
            settings,
          });
        }
      } catch {
        // ignore flush error on shutdown
      }
    });
  }

  if (desktopHydrated) return;
  desktopHydrated = true;

  try {
    const boot = bridge.getBootstrapState();
    if (!boot) return;

    if (boot.machineId) {
      localStorage.setItem(MACHINE_ID_STORAGE_KEY, boot.machineId);
    }

    const diskClockMs = Number(boot.clockState?.maxObservedTimeMs || boot.vault?.maxObservedTimeMs || 0);
    if (diskClockMs > 0) {
      const localClockMs = Number(localStorage.getItem(CLOCK_WATERMARK_STORAGE_KEY) || 0);
      if (diskClockMs > localClockMs) {
        localStorage.setItem(CLOCK_WATERMARK_STORAGE_KEY, String(diskClockMs));
      }
    }

    const authoritativeVaultLicense =
      boot.vault?.license?.isLicensed
        ? boot.vault.license
        : (boot.db?.license?.isLicensed ? boot.db.license : null);

    if (boot.db?.workspaces && typeof boot.db.workspaces === 'object') {
      const entries = Object.entries(boot.db.workspaces as Record<string, { data?: AppData; savedAtMs?: number }>);
      for (const [key, entry] of entries) {
        if (!entry || !entry.data) continue;
        const existingRaw = localStorage.getItem(key);
        if (!existingRaw) {
          const hydratedEntry = authoritativeVaultLicense && !entry.data.license?.isLicensed
            ? { ...entry.data, license: authoritativeVaultLicense }
            : entry.data;
          localStorage.setItem(key, JSON.stringify(hydratedEntry));
        } else if (authoritativeVaultLicense) {
          try {
            const parsedExisting = JSON.parse(existingRaw);
            if (parsedExisting && !parsedExisting.license?.isLicensed) {
              localStorage.setItem(key, JSON.stringify({
                ...parsedExisting,
                license: authoritativeVaultLicense,
              }));
            }
          } catch {
            // ignore malformed existing localStorage JSON
          }
        }
      }
    }

    if (
      authoritativeVaultLicense ||
      boot.vault?.trialActivated ||
      (Array.isArray(boot.vault?.consumedSerials) && boot.vault.consumedSerials.length > 0)
    ) {
      const liveHwid = boot.machineId || getOrGenerateMachineId();
      const sealedCheck = readSealedLicenseCacheEnvelope(liveHwid);
      const vaultConsumed = Array.isArray(boot.vault?.consumedSerials) ? boot.vault.consumedSerials : [];
      if (vaultConsumed.length > 0) {
        const currentConsumed = readConsumedActivationsRegistry(liveHwid);
        const mergedConsumedMap = new Map<string, {
          licenseId: string;
          nonceHash: string;
          activationCodeHash: string;
          hwid: string;
          consumedAtIso: string;
        }>();
        for (const entry of [...currentConsumed.entries, ...vaultConsumed]) {
          if (entry && entry.licenseId) {
            mergedConsumedMap.set(entry.licenseId, {
              licenseId: String(entry.licenseId),
              nonceHash: String(entry.nonceHash || ''),
              activationCodeHash: String(entry.activationCodeHash || ''),
              hwid: String(entry.hwid || liveHwid),
              consumedAtIso: String(entry.consumedAtIso || new Date().toISOString()),
            });
          }
        }
        const normalizedConsumed = Array.from(mergedConsumedMap.values());
        writeConsumedActivationsRegistry(normalizedConsumed, liveHwid);
        if (!sealedCheck.tampered && (!sealedCheck.envelope?.license?.isLicensed || normalizedConsumed.length > 0)) {
          sealLicenseCacheEnvelope(
            {
              maxObservedTimeMs: Math.max(Date.now(), diskClockMs, sealedCheck.envelope?.maxObservedTimeMs || 0),
              lastVerifiedServerTimeMs: Math.max(
                getLastVerifiedServerTimeMs(),
                sealedCheck.envelope?.lastVerifiedServerTimeMs || 0
              ),
              trialStartDate:
                boot.vault?.trialStartDate ||
                authoritativeVaultLicense?.trialStartDate ||
                sealedCheck.envelope?.trialStartDate ||
                new Date().toISOString(),
              trialActivated: Boolean(boot.vault?.trialActivated || authoritativeVaultLicense?.isLicensed),
              trialBusinessName: boot.vault?.trialBusinessName || authoritativeVaultLicense?.registeredOwner,
              trialMobile: boot.vault?.trialMobile || authoritativeVaultLicense?.trialMobile,
              license: authoritativeVaultLicense || sealedCheck.envelope?.license || null,
              consumedSerials: normalizedConsumed,
            },
            liveHwid
          );
        }
      } else if (
        !sealedCheck.tampered &&
        ((!sealedCheck.envelope?.license?.isLicensed && authoritativeVaultLicense) ||
          (boot.vault?.trialActivated && !sealedCheck.envelope?.trialActivated))
      ) {
        sealLicenseCacheEnvelope(
          {
            maxObservedTimeMs: Math.max(Date.now(), diskClockMs, sealedCheck.envelope?.maxObservedTimeMs || 0),
            lastVerifiedServerTimeMs: Math.max(
              getLastVerifiedServerTimeMs(),
              sealedCheck.envelope?.lastVerifiedServerTimeMs || 0
            ),
            trialStartDate:
              boot.vault?.trialStartDate ||
              authoritativeVaultLicense?.trialStartDate ||
              sealedCheck.envelope?.trialStartDate ||
              new Date().toISOString(),
            trialActivated: Boolean(boot.vault?.trialActivated || authoritativeVaultLicense?.isLicensed),
            trialBusinessName: boot.vault?.trialBusinessName || authoritativeVaultLicense?.registeredOwner,
            trialMobile: boot.vault?.trialMobile || authoritativeVaultLicense?.trialMobile,
            license: authoritativeVaultLicense || sealedCheck.envelope?.license || null,
            consumedSerials: sealedCheck.envelope?.consumedSerials || [],
          },
          liveHwid
        );
      }
    }

    if (boot.db?.settings?.data && !localStorage.getItem(CONFIG_STORAGE_KEY)) {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(boot.db.settings.data));
    }

    if (boot.db?.snapshots && typeof boot.db.snapshots === 'object') {
      for (const [snapKey, snapVal] of Object.entries(boot.db.snapshots)) {
        if (snapVal && !localStorage.getItem(snapKey)) {
          localStorage.setItem(snapKey, JSON.stringify(snapVal));
        }
      }
    }
  } catch (err) {
    console.warn('Desktop disk hydration failed:', err);
  }
}

hydrateLocalStorageFromDesktop();

/**
 * Resolves the authoritative commercial/trial LicenseInfo by cross-checking Electron's
 * AES-256 encrypted vault, hisabveda-db.json, the hardware-bound localStorage sealed envelope,
 * and an optional candidate license (e.g. from localStorage or cloud sync).
 * Prevents an active Ed25519 HV-LIC-V3 certificate from ever being overwritten by an unlicensed snapshot.
 */
export function resolveAuthoritativeLicense(candidateLicense?: LicenseInfo | null): LicenseInfo {
  const nowIso = new Date().toISOString();
  const liveMachineId = getOrGenerateMachineId();
  const boot = typeof window !== 'undefined' ? window.hisabvedaDesktop?.getBootstrapState?.() : null;
  const sealedCheck = readSealedLicenseCacheEnvelope(liveMachineId);

  const candidates: Array<{ source: 'vault' | 'db' | 'sealed' | 'candidate'; lic?: LicenseInfo | null }> = [
    { source: 'vault', lic: boot?.vault?.license },
    { source: 'db', lic: boot?.db?.license },
    { source: 'sealed', lic: !sealedCheck.tampered ? sealedCheck.envelope?.license : null },
    { source: 'candidate', lic: candidateLicense },
  ];

  let bestVerified: LicenseInfo | null = null;
  let fallbackLicensedMismatchOrExpired: LicenseInfo | null = null;
  let candidateTampered = false;

  for (const item of candidates) {
    const lic = item.lic;
    if (!lic || !lic.isLicensed || !lic.licenseKey) continue;
    const sigCheck = parseAndVerifySignedLicense(lic.licenseKey, liveMachineId, Date.now(), {
      skipMachineCheck: true,
      skipExpiryCheck: true,
    });
    if (!sigCheck.isValid || !sigCheck.payload) {
      if (item.source === 'candidate') {
        candidateTampered = true;
      }
      continue;
    }

    const signedHwid = sigCheck.payload.hwid.trim().toUpperCase();
    const machineMatches = signedHwid === 'ANY_HARDWARE_ID' || signedHwid === liveMachineId;
    const notExpired = sigCheck.payload.expiresAtMs > Date.now();
    if (machineMatches && notExpired) {
      bestVerified = lic;
      break;
    }
    if (!fallbackLicensedMismatchOrExpired) {
      fallbackLicensedMismatchOrExpired = lic;
    }
  }

  const chosenLicensed = bestVerified || fallbackLicensedMismatchOrExpired;

  const resolvedTrialActivated = Boolean(
    chosenLicensed ||
    boot?.vault?.trialActivated ||
    (!sealedCheck.tampered && sealedCheck.envelope?.trialActivated) ||
    candidateLicense?.trialActivated
  );

  const candidateStarts = [
    chosenLicensed?.trialStartDate,
    candidateLicense?.trialActivated ? candidateLicense.trialStartDate : undefined,
    !sealedCheck.tampered && sealedCheck.envelope?.trialActivated ? sealedCheck.envelope.trialStartDate : undefined,
    boot?.vault?.trialActivated ? boot.vault.trialStartDate : undefined,
  ]
    .filter(Boolean)
    .map((s) => Date.parse(String(s)))
    .filter((ms) => Number.isFinite(ms) && ms > 0);
  const earliestTrialStart = candidateStarts.length > 0
    ? new Date(Math.min(...candidateStarts)).toISOString()
    : (candidateLicense?.trialStartDate || nowIso);

  const resolvedBusinessName =
    chosenLicensed?.registeredOwner ||
    candidateLicense?.registeredOwner ||
    (!sealedCheck.tampered ? sealedCheck.envelope?.trialBusinessName : undefined) ||
    boot?.vault?.trialBusinessName ||
    '';

  const resolvedTrialMobile =
    candidateLicense?.trialMobile ||
    (!sealedCheck.tampered ? sealedCheck.envelope?.trialMobile : undefined) ||
    boot?.vault?.trialMobile ||
    '';

  const vaultTampered = Boolean(
    !bestVerified && (boot?.vault?.vaultTampered || sealedCheck.tampered || candidateTampered)
  );

  if (!sealedCheck.exists && !sealedCheck.tampered && typeof window !== 'undefined' && typeof localStorage !== 'undefined' && resolvedTrialActivated) {
    sealLicenseCacheEnvelope(
      {
        maxObservedTimeMs: Date.now(),
        lastVerifiedServerTimeMs: getLastVerifiedServerTimeMs(),
        trialStartDate: earliestTrialStart,
        trialActivated: true,
        ...(resolvedBusinessName ? { trialBusinessName: resolvedBusinessName } : {}),
        ...(resolvedTrialMobile ? { trialMobile: resolvedTrialMobile } : {}),
        license: chosenLicensed || null,
      },
      liveMachineId
    );
  }

  if (chosenLicensed) {
    return {
      ...chosenLicensed,
      trialActivated: true,
      trialStartDate: earliestTrialStart,
      machineId: chosenLicensed.machineId || boot?.machineId || liveMachineId,
      vaultTampered,
    };
  }

  return {
    trialStartDate: earliestTrialStart,
    trialActivated: resolvedTrialActivated,
    ...(resolvedTrialMobile ? { trialMobile: resolvedTrialMobile } : {}),
    isLicensed: false,
    licenseKey: candidateLicense?.licenseKey || '',
    registeredOwner: resolvedBusinessName,
    machineId: boot?.machineId || liveMachineId,
    licenseType: candidateLicense?.licenseType || 'TRIAL',
    lastKnownTimestamp: candidateLicense?.lastKnownTimestamp || nowIso,
    clockTamperDetected: Boolean(candidateLicense?.clockTamperDetected),
    ...(candidateLicense?.issuedLicenses ? { issuedLicenses: candidateLicense.issuedLicenses } : {}),
    ...(vaultTampered ? { vaultTampered: true } : {}),
  };
}

export function isOwnerEmail(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === OWNER_ADMIN_EMAIL);
}

export function setActiveStorageUserId(userId: string | null): void {
  activeStorageUserId = userId ? userId.trim() : null;
}

export function getActiveStorageUserId(): string | null {
  return activeStorageUserId;
}

export function getStorageKey(userId?: string | null): string {
  const uid = (userId ?? activeStorageUserId)?.trim();
  return uid ? `${BASE_STORAGE_KEY}_${uid}` : BASE_STORAGE_KEY;
}

export function getStorageMode(userId?: string | null): StorageMode {
  try {
    const uid = (userId ?? activeStorageUserId)?.trim() || 'default';
    const val = localStorage.getItem(`${BASE_STORAGE_MODE_KEY}_${uid}`);
    return val === 'local' ? 'local' : 'cloud';
  } catch {
    return 'cloud';
  }
}

export function setStorageMode(mode: StorageMode, userId?: string | null): void {
  try {
    const uid = (userId ?? activeStorageUserId)?.trim() || 'default';
    localStorage.setItem(`${BASE_STORAGE_MODE_KEY}_${uid}`, mode);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sna_storage_mode_changed', { detail: { mode, userId: uid } }));
    }
  } catch (err) {
    console.error('Failed to persist storage mode:', err);
  }
}

export function createDefaultAccountGroups(): AccountGroup[] {
  return (initialSampleData.accountGroups || []).map(grp => ({ ...grp }));
}

export function createDefaultChartOfAccounts(): Account[] {
  return [
    // ASSETS (Cash, Bank, Receivables, Stock, Input GST, Fixed & Current Assets)
    { id: 'acc_cash', code: '1010', name: 'Cash in Hand', category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_bank', code: '1020', name: 'Bank Account', category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_debtors', code: '1100', name: 'Sundry Debtors (Receivables)', category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Sundry Debtors', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_inventory', code: '1200', name: 'Stock in Hand / Inventory', category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_itc_cgst', code: '1310', name: 'Input Tax Credit - CGST', category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_itc_sgst', code: '1320', name: 'Input Tax Credit - SGST', category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_itc_igst', code: '1330', name: 'Input Tax Credit - IGST', category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_security_deposit', code: '1410', name: 'Security Deposit (Rent / Utility)', category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_advance_staff', code: '1420', name: 'Staff Advance & Loans Given', category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_prepaid_exp', code: '1430', name: 'Prepaid Expenses', category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_furniture', code: '1510', name: 'Furniture & Fixtures', category: 'ASSET', subCategory: 'Fixed Assets', mainGroup: 'Fixed Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_computer_it', code: '1520', name: 'Computers, Printers & IT Equipment', category: 'ASSET', subCategory: 'Fixed Assets', mainGroup: 'Fixed Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_machinery', code: '1530', name: 'Plant, Machinery & Tools', category: 'ASSET', subCategory: 'Fixed Assets', mainGroup: 'Fixed Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_vehicle', code: '1540', name: 'Motor Vehicles', category: 'ASSET', subCategory: 'Fixed Assets', mainGroup: 'Fixed Assets', openingBalance: 0, balanceType: 'DR', isSystem: false },

    // LIABILITIES (Payables, Output GST, Statutory, Loans & Accruals)
    { id: 'acc_creditors', code: '2010', name: 'Sundry Creditors (Payables)', category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Sundry Creditors', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_gst_cgst', code: '2110', name: 'Output GST Payable - CGST', category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_gst_sgst', code: '2120', name: 'Output GST Payable - SGST', category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_gst_igst', code: '2130', name: 'Output GST Payable - IGST', category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_tds_payable', code: '2200', name: 'TDS Payable', category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_epf_payable', code: '2210', name: 'EPF / PF Statutory Payable', category: 'LIABILITY', subCategory: 'Statutory Liabilities', mainGroup: 'Statutory & Payroll Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_esi_payable', code: '2220', name: 'ESIC Statutory Payable', category: 'LIABILITY', subCategory: 'Statutory Liabilities', mainGroup: 'Statutory & Payroll Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_tds_salary_payable', code: '2230', name: 'TDS Payable on Salary', category: 'LIABILITY', subCategory: 'Statutory Liabilities', mainGroup: 'Statutory & Payroll Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_pt_payable', code: '2240', name: 'Professional Tax / PT Payable', category: 'LIABILITY', subCategory: 'Statutory Liabilities', mainGroup: 'Statutory & Payroll Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_net_salary_payable', code: '2250', name: 'Net Salary Payable A/c', category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Statutory & Payroll Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_outstanding_exp', code: '2310', name: 'Outstanding Expenses Payable', category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Current Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: false },
    { id: 'acc_advance_cust', code: '2320', name: 'Advance from Customers', category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Current Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: false },
    { id: 'acc_unsecured_loan', code: '2410', name: 'Loans & Borrowings', category: 'LIABILITY', subCategory: 'Loans & Liabilities', mainGroup: 'Loans & Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: false },

    // EQUITY
    { id: 'acc_capital', code: '3010', name: 'Owner Capital Account', category: 'EQUITY', subCategory: 'Capital', mainGroup: 'Capital Account', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_retained', code: '3020', name: 'Retained Earnings', category: 'EQUITY', subCategory: 'Reserve & Surplus', mainGroup: 'Reserves & Surplus', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_drawings', code: '3030', name: 'Owner Drawings / Personal Withdrawal', category: 'EQUITY', subCategory: 'Capital', mainGroup: 'Capital Account', openingBalance: 0, balanceType: 'DR', isSystem: false },

    // REVENUE (Direct & Indirect Incomes)
    { id: 'acc_sales', code: '4010', name: 'Sales Account', category: 'REVENUE', subCategory: 'Direct Revenue', mainGroup: 'Direct Incomes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_services', code: '4020', name: 'Service Income', category: 'REVENUE', subCategory: 'Direct Revenue', mainGroup: 'Direct Incomes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_other_inc', code: '4100', name: 'Discount & Interest Received', category: 'REVENUE', subCategory: 'Indirect Revenue', mainGroup: 'Indirect Incomes', openingBalance: 0, balanceType: 'CR', isSystem: true },
    { id: 'acc_commission_rec', code: '4110', name: 'Commission & Brokerage Received', category: 'REVENUE', subCategory: 'Indirect Revenue', mainGroup: 'Indirect Incomes', openingBalance: 0, balanceType: 'CR', isSystem: false },
    { id: 'acc_freight_rec', code: '4120', name: 'Freight & Packing Charges Recovered', category: 'REVENUE', subCategory: 'Indirect Revenue', mainGroup: 'Indirect Incomes', openingBalance: 0, balanceType: 'CR', isSystem: false },
    { id: 'acc_misc_income', code: '4130', name: 'Miscellaneous & Scrap Income', category: 'REVENUE', subCategory: 'Indirect Revenue', mainGroup: 'Indirect Incomes', openingBalance: 0, balanceType: 'CR', isSystem: false },

    // DIRECT EXPENSES (Trading A/c / Cost of Goods & Production Costs)
    { id: 'acc_cogs', code: '5010', name: 'Purchase Account (COGS)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_freight_inward', code: '5020', name: 'Freight & Cartage Inward (आवक भाड़ा)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_carriage_inward', code: '5021', name: 'Carriage Inward', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_loading_unloading', code: '5022', name: 'Loading, Unloading & Hamali (हम्माली)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_packing_material', code: '5023', name: 'Packing Material & Consumables', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_direct_wages', code: '5024', name: 'Direct Wages & Labour Charges (मजदूरी)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_factory_power', code: '5025', name: 'Factory Power, Fuel & Gas', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_factory_rent', code: '5026', name: 'Factory / Godown Rent (Direct)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_custom_clearing', code: '5027', name: 'Custom Duty, Octroi & Clearing Charges', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_job_work', code: '5028', name: 'Job Work & Sub-Contract Charges', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_machinery_maint', code: '5029', name: 'Machinery & Plant Repairs (Direct)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_raw_material', code: '5030', name: 'Raw Material & Stores Consumed', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_transport_inward', code: '5031', name: 'Transport & Coolie Charges (Inward)', category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },

    // INDIRECT EXPENSES — Employee & Payroll
    { id: 'acc_salary', code: '5110', name: 'Salaries & Wages', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_salary_basic', code: '5111', name: 'Basic Salary Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_hra', code: '5112', name: 'House Rent Allowance (HRA)', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_conveyance', code: '5113', name: 'Conveyance & Transport Allowance', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_special_allowance', code: '5114', name: 'Special & Other Allowances', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_overtime', code: '5115', name: 'Overtime Pay Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_staff_welfare', code: '5116', name: 'Staff Welfare, Tea & Refreshment Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_bonus_incentive', code: '5117', name: 'Staff Bonus & Incentive Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Employee Benefits & Salary Expense', openingBalance: 0, balanceType: 'DR', isSystem: false },

    // INDIRECT EXPENSES — Office, Admin, Selling, Finance & Compliance
    { id: 'acc_rent', code: '5120', name: 'Office / Shop Rent Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_electric', code: '5130', name: 'Electricity & Water Utility Bills', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_bank_chg', code: '5140', name: 'Bank Charges & Payment Gateway Fees', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: true },
    { id: 'acc_software', code: '5150', name: 'Software, Cloud & IT Subscriptions', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_telephone_net', code: '5155', name: 'Telephone, Mobile & Internet Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_printing_stationery', code: '5160', name: 'Printing & Stationery Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_postage_courier', code: '5165', name: 'Postage & Courier Charges', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_office_exp', code: '5170', name: 'Office & General Misc. Expenses', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_repairs_maint', code: '5175', name: 'Repairs & Maintenance (Office/Shop)', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_housekeeping', code: '5180', name: 'Housekeeping, Cleaning & Security Charges', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_travelling_exp', code: '5185', name: 'Travelling & Conveyance Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_fuel_petrol', code: '5190', name: 'Petrol, Diesel & Generator Fuel Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_vehicle_maint', code: '5195', name: 'Vehicle Repair & Maintenance', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_freight_outward', code: '5200', name: 'Freight & Delivery Outward (बिक्री भाड़ा)', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_advertisement', code: '5210', name: 'Advertisement, Marketing & Promotion', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_sales_commission', code: '5215', name: 'Sales Commission & Brokerage Paid', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_discount_allowed', code: '5220', name: 'Discount Allowed to Customers', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_bad_debts', code: '5225', name: 'Bad Debts Written Off', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_audit_legal', code: '5230', name: 'Audit, Legal & Professional / CA Fees', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_insurance', code: '5235', name: 'Business, Stock & Vehicle Insurance', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_interest_paid', code: '5240', name: 'Interest Paid on Loan & Overdraft', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_depreciation', code: '5245', name: 'Depreciation Expense (मूल्यह्रास)', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_rates_taxes', code: '5250', name: 'Rates, Municipal Taxes & Licence Fees', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_late_fee_penalty', code: '5255', name: 'GST Late Fee, Interest & Penalty', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_donation_charity', code: '5260', name: 'Donation, Puja & Charity Expense', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: false },
    { id: 'acc_round_off', code: '5990', name: 'Round Off Account', category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', openingBalance: 0, balanceType: 'DR', isSystem: true },

    // SUSPENSE
    { id: 'acc_suspense', code: '9999', name: 'Suspense Account', category: 'LIABILITY', subCategory: 'Suspense', mainGroup: 'Current Liabilities', openingBalance: 0, balanceType: 'CR', isSystem: true }
  ];
}

/**
 * Safely merges standard Direct/Indirect Expense & core accounting ledgers into existing workspaces once
 * without altering existing opening balances, custom names, or custom ledgers.
 */
export function mergeStandardChartOfAccounts(appData: AppData): AppData {
  const existingGroups = Array.isArray(appData.accountGroups) ? [...appData.accountGroups] : [];
  const defaultGroups = createDefaultAccountGroups();
  for (const grp of defaultGroups) {
    if (!existingGroups.some(g => g.id === grp.id || g.name.toLowerCase().trim() === grp.name.toLowerCase().trim())) {
      existingGroups.push(grp);
    }
  }

  const existingAccounts = Array.isArray(appData.accounts) ? [...appData.accounts] : [];
  if (appData.standardLedgersSeeded) {
    return {
      ...appData,
      accountGroups: existingGroups,
    };
  }

  const standardLedgers = createDefaultChartOfAccounts();
  const usedCodes = new Set(existingAccounts.map(a => (a.code || '').trim()));

  for (const std of standardLedgers) {
    const alreadyExists = existingAccounts.some(
      a => a.id === std.id || a.name.toLowerCase().trim() === std.name.toLowerCase().trim()
    );
    if (!alreadyExists) {
      let code = std.code;
      while (usedCodes.has(code)) {
        code = String((parseInt(code, 10) || 5500) + 1);
      }
      usedCodes.add(code);
      existingAccounts.push({ ...std, code });
    }
  }

  return {
    ...appData,
    accountGroups: existingGroups,
    accounts: existingAccounts,
    standardLedgersSeeded: true,
  };
}

export function createBlankCompanyDetails(companyId?: string, companyName?: string, email?: string): CompanyDetails {
  return {
    ...(companyId ? { id: companyId } : {}),
    name: companyName || '',
    tagline: '',
    gstin: '',
    pan: '',
    email: email || '',
    phone: '',
    address: '',
    state: '',
    stateCode: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    branch: '',
    upiId: '',
    terms: '',
    currency: 'INR',
    financialYearStart: '2026-04-01',
    booksBeginningFrom: '2026-04-01'
  };
}

export function createSampleDemoData(companyId?: string, existingLicense?: LicenseInfo): AppData {
  const cloned: AppData = JSON.parse(JSON.stringify(initialSampleData));
  return mergeStandardChartOfAccounts({
    ...cloned,
    company: {
      ...cloned.company,
      ...(companyId ? { id: companyId } : {}),
    },
    license: resolveAuthoritativeLicense(
      existingLicense
        ? { ...existingLicense }
        : {
            ...cloned.license,
            trialStartDate: new Date().toISOString(),
            machineId: getOrGenerateMachineId(),
            isLicensed: false,
            licenseType: 'TRIAL'
          }
    ),
    auditLogs: cloned.auditLogs || [],
    auditTrail: cloned.auditLogs || [],
    godowns: ensureGodowns(cloned.godowns),
    itemBatches: cloned.itemBatches || [],
    stockTransfers: cloned.stockTransfers || [],
  });
}

export function createFreshAppData(
  companyId?: string,
  companyName?: string,
  userEmail?: string | null,
  options?: { forceBlank?: boolean }
): AppData {
  // Software owner gets full demonstration dataset on initial first-time setup,
  // unless an explicit Reset to Clean Workspace (forceBlank: true) was requested.
  if (!options?.forceBlank && isOwnerEmail(userEmail)) {
    const ownerData = createSampleDemoData(companyId);
    return {
      ...ownerData,
      company: {
        ...ownerData.company,
        ...(companyId ? { id: companyId } : {}),
        ...(companyName ? { name: companyName } : {}),
      }
    };
  }

  const nowIso = new Date().toISOString();
  const initLog = {
    id: 'log_init_' + Date.now(),
    timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }),
    action: options?.forceBlank ? 'Workspace Reset to Clean Empty State' : 'Workspace Initialized',
    details: 'Initialized 100% clean accounting workspace with standard Chart of Accounts (0 balances, 0 invoices, 0 parties, 0 items).',
    user: 'System'
  };

  const blankCompany = createBlankCompanyDetails(companyId || 'cmp_1', companyName || 'My Business', userEmail || '');

  return {
    company: blankCompany,
    companiesList: [blankCompany],
    companiesStores: {},
    accountGroups: createDefaultAccountGroups(),
    accounts: createDefaultChartOfAccounts(),
    items: [],
    parties: [],
    invoices: [],
    purchaseOrders: [],
    purchaseInvoices: [],
    vouchers: [],
    debitCreditNotes: [],
    stockAdjustments: [],
    godowns: [createDefaultMainGodown()],
    itemBatches: [],
    stockTransfers: [],
    bankStatements: [],
    budgets: [],
    employees: [],
    payrolls: [],
    auditLogs: [initLog],
    auditTrail: [initLog],
    securityPin: null,
    pinRequired: false,
    license: resolveAuthoritativeLicense({
      trialStartDate: nowIso,
      isLicensed: false,
      licenseKey: '',
      registeredOwner: companyName || '',
      machineId: getOrGenerateMachineId(),
      licenseType: 'TRIAL',
      lastKnownTimestamp: nowIso,
      clockTamperDetected: false,
    }),
    standardLedgersSeeded: true,
    gstPortalData: {
      gstr2aEntries: [],
      gstr2bEntries: [],
      filedReturns: [],
      gstr9Adjustments: {}
    }
  };
}

export function clearUserLocalData(userId?: string | null): void {
  try {
    localStorage.removeItem(getStorageKey(userId));
  } catch (err) {
    console.error('Failed to clear user local data:', err);
  }
}

export function loadAppData(userId?: string | null, userEmail?: string | null): AppData {
  try {
    hydrateLocalStorageFromDesktop();
    const baseline = createFreshAppData(userId ? `cmp_${userId}` : undefined, undefined, userEmail);
    const storageKey = getStorageKey(userId);
    let raw = localStorage.getItem(storageKey);

    // Fallback check against Electron disk DB if localStorage entry was absent
    const boot = typeof window !== 'undefined' ? window.hisabvedaDesktop?.getBootstrapState?.() : null;
    if (!raw && boot?.db?.workspaces?.[storageKey]?.data) {
      raw = JSON.stringify(boot.db.workspaces[storageKey].data);
      localStorage.setItem(storageKey, raw);
    }

    if (!raw) {
      baseline.license = resolveAuthoritativeLicense(baseline.license);
      if (userId) {
        saveAppData(baseline, userId);
      }
      return baseline;
    }

    const parsed = JSON.parse(raw);
    const logs = Array.isArray(parsed.auditTrail)
      ? parsed.auditTrail
      : Array.isArray(parsed.auditLogs)
        ? parsed.auditLogs
        : baseline.auditLogs;

    const rawVouchers = Array.isArray(parsed.vouchers) ? parsed.vouchers : baseline.vouchers;
    const sanitizedVouchers = rawVouchers.map((vch: any) => {
      if (!vch.entries || vch.entries.length < 2) return vch;

      let nextVch = vch;

      // Migrate legacy sample vouchers vch_03 / vch_07 (bank payments mistakenly tagged as JOURNAL)
      if ((nextVch.id === 'vch_03' || nextVch.id === 'vch_07') && nextVch.type === 'JOURNAL') {
        nextVch = {
          ...nextVch,
          type: 'PAYMENT',
          paymentMode: nextVch.paymentMode || 'BANK_TRANSFER',
          bankAccountId: nextVch.bankAccountId || 'acc_hdfc',
          voucherNumber: nextVch.id === 'vch_03' && nextVch.voucherNumber === 'JRN/2026/001'
            ? 'PAY/2026/005'
            : (nextVch.id === 'vch_07' && nextVch.voucherNumber === 'JRN/2026/002' ? 'PAY/2026/006' : nextVch.voucherNumber)
        };
      }

      // Repair legacy PAYMENT/RECEIPT entries where partyId (pty_*) was written as accountId instead of Sundry Creditors/Debtors
      if (nextVch.type === 'RECEIPT' || nextVch.type === 'PAYMENT') {
        const hasPartyIdEntry = nextVch.entries.some((e: any) => typeof e.accountId === 'string' && e.accountId.startsWith('pty_'));
        if (hasPartyIdEntry) {
          nextVch = {
            ...nextVch,
            entries: nextVch.entries.map((e: any) => {
              if (typeof e.accountId === 'string' && e.accountId.startsWith('pty_')) {
                const isReceipt = nextVch.type === 'RECEIPT';
                return {
                  ...e,
                  accountId: isReceipt ? 'acc_debtors' : 'acc_creditors',
                  accountName: isReceipt ? 'Sundry Debtors (Receivables)' : 'Sundry Creditors (Payables)',
                  accountCode: isReceipt ? '1100' : '2010'
                };
              }
              return e;
            })
          };
        }
      }

      if (nextVch.type === 'RECEIPT') {
        const drEntry = nextVch.entries.find((e: any) => (e.debit || 0) > 0);
        const crEntry = nextVch.entries.find((e: any) => (e.credit || 0) > 0);
        if (
          drEntry && crEntry &&
          (drEntry.accountId === crEntry.accountId || (drEntry.accountName && crEntry.accountName && drEntry.accountName.toLowerCase() === crEntry.accountName.toLowerCase()))
        ) {
          return {
            ...nextVch,
            entries: nextVch.entries.map((e: any) => {
              if (e === crEntry) {
                return {
                  ...e,
                  accountId: 'acc_debtors',
                  accountName: 'Sundry Debtors (Receivables)',
                  accountCode: '1100'
                };
              }
              return e;
            })
          };
        }
      } else if (nextVch.type === 'PAYMENT') {
        const drEntry = nextVch.entries.find((e: any) => (e.debit || 0) > 0);
        const crEntry = nextVch.entries.find((e: any) => (e.credit || 0) > 0);
        if (
          drEntry && crEntry &&
          (drEntry.accountId === crEntry.accountId || (drEntry.accountName && crEntry.accountName && drEntry.accountName.toLowerCase() === crEntry.accountName.toLowerCase()))
        ) {
          return {
            ...nextVch,
            entries: nextVch.entries.map((e: any) => {
              if (e === drEntry) {
                return {
                  ...e,
                  accountId: 'acc_creditors',
                  accountName: 'Sundry Creditors (Payables)',
                  accountCode: '2010'
                };
              }
              return e;
            })
          };
        }
      }
      return nextVch;
    });

    const rawInvoices = Array.isArray(parsed.invoices) ? parsed.invoices : baseline.invoices;
    const sanitizedInvoices = rawInvoices.map((inv: any) => ({
      ...inv,
      isRecurring: false,
      frequency: 'NONE'
    }));

    const merged = mergeStandardChartOfAccounts({
      ...baseline,
      ...parsed,
      company: {
        ...baseline.company,
        ...(parsed.company || {}),
        ...(userId ? { id: `cmp_${userId}` } : {}),
      },
      accountGroups: Array.isArray(parsed.accountGroups) ? parsed.accountGroups : baseline.accountGroups,
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : baseline.accounts,
      items: Array.isArray(parsed.items) ? parsed.items : baseline.items,
      parties: Array.isArray(parsed.parties) ? parsed.parties : baseline.parties,
      invoices: sanitizedInvoices,
      purchaseOrders: Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : baseline.purchaseOrders,
      purchaseInvoices: Array.isArray(parsed.purchaseInvoices) ? parsed.purchaseInvoices : baseline.purchaseInvoices,
      vouchers: sanitizedVouchers,
      debitCreditNotes: Array.isArray(parsed.debitCreditNotes) ? parsed.debitCreditNotes : baseline.debitCreditNotes,
      stockAdjustments: Array.isArray(parsed.stockAdjustments) ? parsed.stockAdjustments : baseline.stockAdjustments,
      godowns: ensureGodowns(Array.isArray(parsed.godowns) ? parsed.godowns : baseline.godowns),
      itemBatches: Array.isArray(parsed.itemBatches) ? parsed.itemBatches : (baseline.itemBatches || []),
      stockTransfers: Array.isArray(parsed.stockTransfers) ? parsed.stockTransfers : (baseline.stockTransfers || []),
      bankStatements: Array.isArray(parsed.bankStatements) ? parsed.bankStatements : baseline.bankStatements,
      budgets: Array.isArray(parsed.budgets) ? parsed.budgets : baseline.budgets,
      employees: Array.isArray(parsed.employees) ? parsed.employees : baseline.employees,
      payrolls: Array.isArray(parsed.payrolls) ? parsed.payrolls : baseline.payrolls,
      license: resolveAuthoritativeLicense(parsed.license),
      auditLogs: logs,
      auditTrail: logs,
      standardLedgersSeeded: Boolean(parsed.standardLedgersSeeded),
      gstPortalData: parsed.gstPortalData || baseline.gstPortalData,
    });
    return merged;
  } catch (err) {
    console.error('Failed to load accounting data from localStorage:', err);
    return createFreshAppData(userId ? `cmp_${userId}` : undefined, undefined, userEmail);
  }
}

export function saveAppData(
  data: AppData,
  userId?: string | null,
  options?: { suppressCloudEvent?: boolean }
): void {
  try {
    const storageKey = getStorageKey(userId);
    const nowIso = new Date().toISOString();
    const safeLicense = data.license?.isLicensed
      ? data.license
      : resolveAuthoritativeLicense(data.license);
    const stampedData: AppData = safeLicense
      ? {
          ...data,
          license: {
            ...safeLicense,
            lastKnownTimestamp: nowIso,
          },
        }
      : data;

    localStorage.setItem(storageKey, JSON.stringify(stampedData));
    if (stampedData.license && !stampedData.license.vaultTampered) {
      const liveHwid = getOrGenerateMachineId();
      const existingEnv = readSealedLicenseCacheEnvelope(liveHwid);
      if (!existingEnv.tampered) {
        const nowMs = Date.now();
        sealLicenseCacheEnvelope(
          {
            maxObservedTimeMs: Math.max(nowMs, existingEnv.envelope?.maxObservedTimeMs || 0),
            lastVerifiedServerTimeMs: Math.max(
              getLastVerifiedServerTimeMs(),
              existingEnv.envelope?.lastVerifiedServerTimeMs || 0
            ),
            trialStartDate:
              existingEnv.envelope?.trialStartDate || stampedData.license.trialStartDate || nowIso,
            license: stampedData.license,
          },
          liveHwid
        );
      }
    }
    lastFlushedStorageKey = storageKey;
    lastFlushedData = stampedData;

    if (typeof window !== 'undefined') {
      if (window.hisabvedaDesktop?.saveWorkspace) {
        window.hisabvedaDesktop.saveWorkspace(storageKey, stampedData).catch((err) => {
          console.warn('Desktop workspace disk mirror failed:', err);
        });
      }
      if (!options?.suppressCloudEvent) {
        window.dispatchEvent(new CustomEvent('sna_data_saved', {
          detail: stampedData
        }));
      }
    }
  } catch (err) {
    console.error('Failed to save accounting data to localStorage:', err);
  }
}

export function logAuditAction(data: AppData, action: string, details: string, user = 'Admin'): AppData {
  const newLog = {
    id: 'log_' + Date.now(),
    timestamp: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }),
    action,
    details,
    user
  };
  const existingLogs = data.auditTrail || data.auditLogs || [];
  const updatedLogs = [newLog, ...existingLogs].slice(0, 200);
  const updated = { ...data, auditLogs: updatedLogs, auditTrail: updatedLogs };
  saveAppData(updated);
  return updated;
}

let activeNumberFormat: 'INDIAN' | 'INTERNATIONAL' | null = null;

export function setActiveNumberFormat(format?: 'INDIAN' | 'INTERNATIONAL' | null) {
  activeNumberFormat = format || null;
}

export function getActiveNumberFormat(): 'INDIAN' | 'INTERNATIONAL' | null {
  return activeNumberFormat;
}

export function formatCurrency(
  amount: number,
  currency: Currency = 'INR',
  numberFormat?: 'INDIAN' | 'INTERNATIONAL'
): string {
  const val = Number(amount) || 0;
  const resolvedFormat: 'INDIAN' | 'INTERNATIONAL' =
    numberFormat || activeNumberFormat || (currency === 'INR' ? 'INDIAN' : 'INTERNATIONAL');
  const locale = resolvedFormat === 'INDIAN' ? 'en-IN' : 'en-US';

  if (currency === 'AED') {
    const formattedNum = new Intl.NumberFormat(locale, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    }).format(Math.abs(val));
    return `${val < 0 ? '-' : ''}د.إ ${formattedNum}`;
  }

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency || 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(val);
}

export function exportBackupJSON(data: AppData) {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
  const downloadAnchor = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `Accounting_Software_Backup_${dateStr}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export interface PreImportSnapshot {
  id: string;
  label: string;
  software: string;
  createdAt: string;
  data: AppData;
}

function getPreImportSnapshotKey(userId?: string | null): string {
  const uid = userId !== undefined ? userId : activeStorageUserId;
  return `${getStorageKey(uid)}_pre_import_snapshot`;
}

export function savePreImportSnapshot(
  data: AppData,
  label: string,
  software = 'ERP XML',
  userId?: string | null
): PreImportSnapshot | null {
  try {
    const snapshot: PreImportSnapshot = {
      id: `snap_${Date.now()}`,
      label,
      software,
      createdAt: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(data)) as AppData,
    };
    const snapKey = getPreImportSnapshotKey(userId);
    localStorage.setItem(snapKey, JSON.stringify(snapshot));
    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.saveSnapshot) {
      window.hisabvedaDesktop.saveSnapshot(snapKey, snapshot).catch(() => {});
    }
    return snapshot;
  } catch (err) {
    console.warn('Could not save pre-import snapshot (storage limit):', err);
    return null;
  }
}

export function loadPreImportSnapshot(userId?: string | null): PreImportSnapshot | null {
  try {
    const raw = localStorage.getItem(getPreImportSnapshotKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PreImportSnapshot;
    if (!parsed || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPreImportSnapshot(userId?: string | null): void {
  try {
    const snapKey = getPreImportSnapshotKey(userId);
    localStorage.removeItem(snapKey);
    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.saveSnapshot) {
      window.hisabvedaDesktop.saveSnapshot(snapKey, null).catch(() => {});
    }
  } catch {
    // ignore
  }
}
