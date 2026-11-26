import { Account, AppData, BankStatementLine, CompanyDetails, ItemMaster, PartyMaster } from '../types';
import { calculateAccountBalances, calculatePartyOutstanding, getEffectiveAccountCategory, getEffectiveOpeningStock, getItemClosingStockValue, isBankLedger } from './accounting';
import { validateGSTIN } from './gstin';

export const ALL_FINANCIAL_YEARS = 'ALL';
export const CUSTOM_FY_RANGE_PREFIX = 'RANGE:';
export const CUSTOM_DATE_RANGE_PREFIX = 'DATES:';

export interface FinancialYearRange {
  fyStart: string;     // YYYY-04-01 (or exact period start date) or 'ALL'
  fyEnd: string;       // YYYY-03-31 (or exact period end date) or today's date
  fyStartYear: number;
  fyEndYear: number;
  label: string;       // e.g., "FY 2026-27", "FY 2024-25 → FY 2026-27"
  shortLabel: string;  // e.g., "2026-27", "2024-25 → 2026-27"
  displayRange: string; // e.g., "01 Apr 2026 – 31 Mar 2027"
  isCustomPeriod?: boolean;
  periodToken?: string;
}

export interface AvailableFinancialYear {
  fyStart: string;
  fyEnd: string;
  label: string;
  shortLabel: string;
  count: number;
  isCurrent: boolean;
  isAllYears?: boolean;
}

/**
 * Normalizes various date strings (YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, YYYY/MM/DD) to YYYY-MM-DD
 */
export function normalizeDateISO(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = String(dateStr).trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const ymdSlash = clean.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/);
  if (ymdSlash) {
    return `${ymdSlash[1]}-${ymdSlash[2].padStart(2, '0')}-${ymdSlash[3].padStart(2, '0')}`;
  }

  const dmy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  }

  return '';
}

/**
 * Parses a canonical custom FY-to-FY token (`RANGE:2024-04-01:2026-04-01`).
 */
export function parseFYRangeToken(input?: string): { fromFYStart: string; toFYStart: string } | null {
  if (!input) return null;
  const match = input.trim().match(/^RANGE:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const fromYear = parseInt(match[1].slice(0, 4), 10);
  const toYear = parseInt(match[2].slice(0, 4), 10);
  if (isNaN(fromYear) || isNaN(toYear)) return null;
  const a = `${Math.min(fromYear, toYear)}-04-01`;
  const b = `${Math.max(fromYear, toYear)}-04-01`;
  return { fromFYStart: a, toFYStart: b };
}

/**
 * Builds a normalized single-FY or `RANGE:fromFY:toFY` token.
 */
export function buildFYRangeToken(fromFYInput: string, toFYInput: string): string {
  const fromNorm = normalizeFYStartDate(fromFYInput);
  const toNorm = normalizeFYStartDate(toFYInput);
  const safeFrom = fromNorm === ALL_FINANCIAL_YEARS || parseFYRangeToken(fromNorm) || parseDateRangeToken(fromNorm)
    ? getCurrentFinancialYearStart()
    : fromNorm;
  const safeTo = toNorm === ALL_FINANCIAL_YEARS || parseFYRangeToken(toNorm) || parseDateRangeToken(toNorm)
    ? safeFrom
    : toNorm;
  const [a, b] = safeFrom <= safeTo ? [safeFrom, safeTo] : [safeTo, safeFrom];
  return a === b ? a : `${CUSTOM_FY_RANGE_PREFIX}${a}:${b}`;
}

/**
 * Parses a canonical custom Date-to-Date period token (`DATES:2025-04-01:2026-03-31`).
 */
export function parseDateRangeToken(input?: string): { fromDate: string; toDate: string } | null {
  if (!input) return null;
  const match = input.trim().match(/^DATES:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;
  const [a, b] = match[1] <= match[2] ? [match[1], match[2]] : [match[2], match[1]];
  return { fromDate: a, toDate: b };
}

/**
 * Builds a normalized `DATES:YYYY-MM-DD:YYYY-MM-DD` custom date period token.
 */
export function buildDateRangeToken(fromDateInput: string, toDateInput: string): string {
  const f = normalizeDateISO(fromDateInput) || getCurrentFinancialYearStart();
  const t = normalizeDateISO(toDateInput) || f;
  const [a, b] = f <= t ? [f, t] : [t, f];
  return `${CUSTOM_DATE_RANGE_PREFIX}${a}:${b}`;
}

export function isCustomPeriodToken(input?: string): boolean {
  return Boolean(parseFYRangeToken(input) || parseDateRangeToken(input));
}

/**
 * Returns Indian Financial Year start date (YYYY-04-01) for a reference date.
 * Apr–Dec -> YYYY-04-01; Jan–Mar -> (YYYY-1)-04-01.
 */
export function getCurrentFinancialYearStart(refDate: Date = new Date()): string {
  const year = refDate.getFullYear();
  const month = refDate.getMonth(); // 0-indexed; April is 3
  const fyStartYear = month >= 3 ? year : year - 1;
  return `${fyStartYear}-04-01`;
}

/**
 * Normalizes any FY start input ('2026-04-01', '01-04-2026', '2026', 'ALL', 'RANGE:...', 'DATES:...')
 */
export function normalizeFYStartDate(fyInput?: string): string {
  if (!fyInput) return getCurrentFinancialYearStart();
  const clean = fyInput.trim();
  if (clean.toUpperCase() === ALL_FINANCIAL_YEARS) return ALL_FINANCIAL_YEARS;
  const fyRangeParsed = parseFYRangeToken(clean);
  if (fyRangeParsed) {
    return fyRangeParsed.fromFYStart === fyRangeParsed.toFYStart
      ? fyRangeParsed.fromFYStart
      : `${CUSTOM_FY_RANGE_PREFIX}${fyRangeParsed.fromFYStart}:${fyRangeParsed.toFYStart}`;
  }
  const dateRangeParsed = parseDateRangeToken(clean);
  if (dateRangeParsed) {
    return `${CUSTOM_DATE_RANGE_PREFIX}${dateRangeParsed.fromDate}:${dateRangeParsed.toDate}`;
  }
  if (/^\d{4}$/.test(clean)) {
    return `${clean}-04-01`;
  }
  const iso = normalizeDateISO(clean);
  if (iso) {
    const year = parseInt(iso.slice(0, 4), 10);
    const month = parseInt(iso.slice(5, 7), 10);
    if (!isNaN(year) && !isNaN(month)) {
      const fyStartYear = month >= 4 ? year : year - 1;
      return `${fyStartYear}-04-01`;
    }
  }
  return getCurrentFinancialYearStart();
}

/**
 * Given a FY start date (or 'ALL', 'RANGE:...', 'DATES:...', or arbitrary date inside an FY), returns full FY metadata.
 */
export function getFinancialYearRange(fyStartInput?: string): FinancialYearRange {
  const fyStart = normalizeFYStartDate(fyStartInput);
  if (fyStart === ALL_FINANCIAL_YEARS) {
    const todayIso = new Date().toISOString().split('T')[0];
    const currentYear = parseInt(getCurrentFinancialYearStart().slice(0, 4), 10) || new Date().getFullYear();
    return {
      fyStart: ALL_FINANCIAL_YEARS,
      fyEnd: todayIso,
      fyStartYear: 2022,
      fyEndYear: currentYear + 1,
      label: 'All Years (To Current)',
      shortLabel: 'All Years',
      displayRange: `All Years – Today (${todayIso})`
    };
  }

  const parsedFyRange = parseFYRangeToken(fyStart);
  if (parsedFyRange) {
    const fromR = getFinancialYearRange(parsedFyRange.fromFYStart);
    const toR = getFinancialYearRange(parsedFyRange.toFYStart);
    return {
      fyStart: fromR.fyStart,
      fyEnd: toR.fyEnd,
      fyStartYear: fromR.fyStartYear,
      fyEndYear: toR.fyEndYear,
      label: fromR.fyStart === toR.fyStart ? fromR.label : `${fromR.label} → ${toR.label}`,
      shortLabel: fromR.fyStart === toR.fyStart ? fromR.shortLabel : `${fromR.shortLabel} → ${toR.shortLabel}`,
      displayRange: `01 Apr ${fromR.fyStartYear} – 31 Mar ${toR.fyEndYear}`,
      isCustomPeriod: true,
      periodToken: fyStart
    };
  }

  const parsedDateRange = parseDateRangeToken(fyStart);
  if (parsedDateRange) {
    const startYr = parseInt(parsedDateRange.fromDate.slice(0, 4), 10) || new Date().getFullYear();
    const endYr = parseInt(parsedDateRange.toDate.slice(0, 4), 10) || startYr;
    return {
      fyStart: parsedDateRange.fromDate,
      fyEnd: parsedDateRange.toDate,
      fyStartYear: startYr,
      fyEndYear: endYr,
      label: `${parsedDateRange.fromDate} → ${parsedDateRange.toDate}`,
      shortLabel: `${parsedDateRange.fromDate} → ${parsedDateRange.toDate}`,
      displayRange: `${parsedDateRange.fromDate} – ${parsedDateRange.toDate}`,
      isCustomPeriod: true,
      periodToken: fyStart
    };
  }

  const fyStartYear = parseInt(fyStart.slice(0, 4), 10) || new Date().getFullYear();
  const fyEndYear = fyStartYear + 1;
  const fyEnd = `${fyEndYear}-03-31`;
  const shortLabel = `${fyStartYear}-${String(fyEndYear).slice(-2)}`;
  return {
    fyStart,
    fyEnd,
    fyStartYear,
    fyEndYear,
    label: `FY ${shortLabel}`,
    shortLabel,
    displayRange: `01 Apr ${fyStartYear} – 31 Mar ${fyEndYear}`
  };
}

/**
 * Returns the FY start ('YYYY-04-01') that a specific transaction date belongs to.
 */
export function getFinancialYearStartForDate(dateStr?: string): string | null {
  const iso = normalizeDateISO(dateStr);
  if (!iso) return null;
  const year = parseInt(iso.slice(0, 4), 10);
  const month = parseInt(iso.slice(5, 7), 10);
  if (isNaN(year) || isNaN(month) || year < 1990 || year > 2100) return null;
  const fyStartYear = month >= 4 ? year : year - 1;
  return `${fyStartYear}-04-01`;
}

/**
 * Checks whether a date belongs to the given Financial Year [fyStart .. fyEnd], or any valid date when 'ALL'.
 */
export function isDateInFinancialYear(dateStr?: string, fyStartInput?: string): boolean {
  const iso = normalizeDateISO(dateStr);
  if (!iso) return false;
  if (normalizeFYStartDate(fyStartInput) === ALL_FINANCIAL_YEARS) return true;
  const { fyStart, fyEnd } = getFinancialYearRange(fyStartInput);
  return iso >= fyStart && iso <= fyEnd;
}

/**
 * Resolves a canonical ISO date string for a Payroll record.
 */
function resolvePayrollDateISO(payroll: { paymentDate?: string; payrollMonth?: string }): string {
  if (payroll.paymentDate) {
    return normalizeDateISO(payroll.paymentDate);
  }
  if (payroll.payrollMonth) {
    const ymMatch = payroll.payrollMonth.match(/^(\d{4})-(\d{2})$/);
    if (ymMatch) {
      return `${ymMatch[1]}-${ymMatch[2]}-15`;
    }
    const parsed = new Date(`${payroll.payrollMonth} 15`);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  }
  return '';
}

/**
 * Checks whether a Payroll record belongs to the given Financial Year.
 */
export function isPayrollInFinancialYear(
  payroll: { paymentDate?: string; payrollMonth?: string },
  fyStartInput?: string
): boolean {
  if (normalizeFYStartDate(fyStartInput) === ALL_FINANCIAL_YEARS) return true;
  const d = resolvePayrollDateISO(payroll);
  return d ? isDateInFinancialYear(d, fyStartInput) : false;
}

/**
 * Scans all transactional data in master AppData to return available Financial Years (newest first)
 * always including FY 2022-23 through Next FY, plus per-year record counts.
 */
export function getAvailableFinancialYears(data: AppData): AvailableFinancialYear[] {
  const currentFY = getCurrentFinancialYearStart();
  const currentYear = parseInt(currentFY.slice(0, 4), 10);
  const counts = new Map<string, number>();

  // Always seed from at least FY 2022-23 through currentYear + 1
  const minSeedYear = Math.min(2022, currentYear - 4);
  for (let yr = minSeedYear; yr <= currentYear + 1; yr++) {
    counts.set(`${yr}-04-01`, 0);
  }

  if (data.company?.financialYearStart) {
    counts.set(normalizeFYStartDate(data.company.financialYearStart), 0);
  }
  if (data.company?.booksBeginningFrom) {
    const bFy = getFinancialYearStartForDate(data.company.booksBeginningFrom);
    if (bFy) counts.set(bFy, 0);
  }

  const bumpDate = (dateStr?: string) => {
    const fy = getFinancialYearStartForDate(dateStr);
    if (fy) counts.set(fy, (counts.get(fy) || 0) + 1);
  };

  (data.invoices || []).forEach(i => bumpDate(i.date));
  (data.purchaseInvoices || []).forEach(p => bumpDate(p.date));
  (data.purchaseOrders || []).forEach(po => bumpDate(po.date));
  (data.vouchers || []).forEach(v => bumpDate(v.date));
  (data.debitCreditNotes || []).forEach(n => bumpDate(n.date));
  (data.bankStatements || []).forEach(s => bumpDate(s.date));
  (data.stockAdjustments || []).forEach(a => bumpDate(a.date));
  (data.payrolls || []).forEach(p => {
    const pd = resolvePayrollDateISO(p);
    if (pd) bumpDate(pd);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([fyStart, count]) => {
      const range = getFinancialYearRange(fyStart);
      return {
        fyStart: range.fyStart,
        fyEnd: range.fyEnd,
        label: range.label,
        shortLabel: range.shortLabel,
        count,
        isCurrent: range.fyStart === currentFY
      };
    });
}

/**
 * Helper to compute net item stock quantity delta per item ID/Name over a list of transactions.
 * Matches exact ERP stock mutation semantics: Sales = -qty, Purchase = +qty, CreditNote = +qty, DebitNote = -qty, StockAdj = +difference.
 */
function accumulateItemStockDeltas(
  invoices: AppData['invoices'],
  purchases: AppData['purchaseInvoices'],
  notes: AppData['debitCreditNotes'],
  adjustments: AppData['stockAdjustments'],
  items: ItemMaster[]
): Map<string, number> {
  const deltaByItemId = new Map<string, number>();
  const idByNameLower = new Map<string, string>();
  items.forEach(it => {
    idByNameLower.set(it.name.trim().toLowerCase(), it.id);
  });

  const addDelta = (itemId: string | undefined, itemName: string | undefined, delta: number) => {
    if (!delta) return;
    let resolvedId = itemId;
    if (!resolvedId || !items.some(i => i.id === resolvedId)) {
      resolvedId = itemName ? idByNameLower.get(itemName.trim().toLowerCase()) : undefined;
    }
    if (resolvedId) {
      deltaByItemId.set(resolvedId, (deltaByItemId.get(resolvedId) || 0) + delta);
    }
  };

  (invoices || []).forEach(inv => {
    if (inv.status === 'CANCELLED') return;
    (inv.items || []).forEach(line => {
      addDelta(line.itemId, line.itemName, -(Number(line.quantity) || 0));
    });
  });

  (purchases || []).forEach(pur => {
    if (pur.status === 'CANCELLED') return;
    (pur.items || []).forEach(line => {
      addDelta(line.itemId, line.itemName, Number(line.quantity) || 0);
    });
  });

  (notes || []).forEach(note => {
    (note.items || []).forEach(line => {
      const qty = Number(line.quantity) || 0;
      if (!qty) return;
      // Credit Note (Sales Return) adds stock back; Debit Note (Purchase Return) deducts stock
      addDelta(line.itemId, line.itemName, note.type === 'CREDIT_NOTE' ? qty : -qty);
    });
  });

  (adjustments || []).forEach(adj => {
    addDelta(adj.itemId, adj.itemName, Number(adj.difference) || 0);
  });

  return deltaByItemId;
}

/**
 * Filters master AppData to any custom [fromDate .. toDate] range (inclusive).
 * Automatically carries forward Closing Balances (Balance Sheet Ledgers, Party Outstanding,
 * Opening/Closing Stock Valuation, and Prior-Period Retained Earnings Net Profit/Loss)
 * from transactions strictly prior to `fromDate` so seamless multi-year accounting (e.g. 2022–26 + 2026–27)
 * reconciles with ₹0.00 variance even if the later year was imported without Opening Balances.
 */
export function filterAppDataByDateRange(
  masterData: AppData,
  fromDate?: string,
  toDate?: string
): AppData {
  const normFrom = normalizeDateISO(fromDate);
  const normTo = normalizeDateISO(toDate);

  // Full unfiltered multi-year cumulative mode
  if (!normFrom && !normTo) {
    return masterData;
  }

  const isBeforeFrom = (dateStr?: string) => {
    if (!normFrom) return false;
    const d = normalizeDateISO(dateStr);
    return Boolean(d && d < normFrom);
  };
  const isAfterTo = (dateStr?: string) => {
    if (!normTo) return false;
    const d = normalizeDateISO(dateStr);
    return Boolean(d && d > normTo);
  };
  const isInRange = (dateStr?: string) => {
    const d = normalizeDateISO(dateStr);
    if (!d) return false;
    if (normFrom && d < normFrom) return false;
    if (normTo && d > normTo) return false;
    return true;
  };

  const allInvoices = masterData.invoices || [];
  const allPurchases = masterData.purchaseInvoices || [];
  const allPOs = masterData.purchaseOrders || [];
  const allVouchers = masterData.vouchers || [];
  const allNotes = masterData.debitCreditNotes || [];
  const allStatements = masterData.bankStatements || [];
  const allAdjustments = masterData.stockAdjustments || [];
  const allPayrolls = masterData.payrolls || [];
  const allItems = masterData.items || [];
  const allTransfers = masterData.stockTransfers || [];

  const priorInvoices = allInvoices.filter(i => isBeforeFrom(i.date));
  const priorPurchases = allPurchases.filter(p => isBeforeFrom(p.date));
  const priorVouchers = allVouchers.filter(v => isBeforeFrom(v.date));
  const priorNotes = allNotes.filter(n => isBeforeFrom(n.date));
  const priorAdjustments = allAdjustments.filter(a => isBeforeFrom(a.date));

  const inRangeInvoices = allInvoices.filter(i => isInRange(i.date));
  const inRangePurchases = allPurchases.filter(p => isInRange(p.date));
  const inRangePOs = allPOs.filter(po => isInRange(po.date));
  const inRangeVouchers = allVouchers.filter(v => isInRange(v.date));
  const inRangeNotes = allNotes.filter(n => isInRange(n.date));
  const inRangeStatements = allStatements.filter(s => isInRange(s.date));
  const inRangeAdjustments = allAdjustments.filter(a => isInRange(a.date));
  const inRangeTransfers = allTransfers.filter(t => isInRange(t.date));
  const inRangePayrolls = allPayrolls.filter(p => {
    const pd = resolvePayrollDateISO(p);
    return pd ? isInRange(pd) : false;
  });

  const afterInvoices = allInvoices.filter(i => isAfterTo(i.date));
  const afterPurchases = allPurchases.filter(p => isAfterTo(p.date));
  const afterNotes = allNotes.filter(n => isAfterTo(n.date));
  const afterAdjustments = allAdjustments.filter(a => isAfterTo(a.date));

  // Reconstruct period Closing Stock (at normTo) and Opening Stock (at normFrom) from master items
  const deltaAfter = accumulateItemStockDeltas(afterInvoices, afterPurchases, afterNotes, afterAdjustments, allItems);
  const deltaInRange = accumulateItemStockDeltas(inRangeInvoices, inRangePurchases, inRangeNotes, inRangeAdjustments, allItems);

  const periodItems: ItemMaster[] = allItems.map(it => {
    const latestStock = Number(it.currentStock || 0);
    const afterChange = deltaAfter.get(it.id) || 0;
    const rangeChange = deltaInRange.get(it.id) || 0;
    const stockAtEnd = Math.round((latestStock - afterChange) * 1000) / 1000;
    const stockAtStart = Math.round((stockAtEnd - rangeChange) * 1000) / 1000;
    const rateUnchanged =
      it.importedPurchasePrice === undefined ||
      Math.abs((Number(it.purchasePrice) || 0) - it.importedPurchasePrice) < 0.001;
    const hasExactClosingVal =
      it.closingStockValue !== undefined &&
      it.importedClosingQty !== undefined &&
      Math.abs(latestStock - it.importedClosingQty) < 0.001 &&
      rateUnchanged;
    let closingValForPeriod: number | undefined;
    if (hasExactClosingVal) {
      if (Math.abs(afterChange) < 0.001) {
        closingValForPeriod = it.closingStockValue;
      } else if (Math.abs(latestStock) > 0.0001) {
        closingValForPeriod = Math.round((it.closingStockValue! * (stockAtEnd / latestStock)) * 100) / 100;
      }
    }
    return {
      ...it,
      openingStock: stockAtStart,
      currentStock: stockAtEnd,
      ...(closingValForPeriod !== undefined
        ? { closingStockValue: closingValForPeriod, importedClosingQty: stockAtEnd }
        : {})
    };
  });

  const hasPriorTransactions =
    priorInvoices.length > 0 ||
    priorPurchases.length > 0 ||
    priorVouchers.length > 0 ||
    priorNotes.length > 0 ||
    priorAdjustments.length > 0;

  let periodAccounts: Account[] = masterData.accounts || [];
  let periodParties: PartyMaster[] = masterData.parties || [];

  if (hasPriorTransactions) {
    const priorData: AppData = {
      ...masterData,
      invoices: priorInvoices,
      purchaseInvoices: priorPurchases,
      vouchers: priorVouchers,
      debitCreditNotes: priorNotes,
      stockAdjustments: priorAdjustments
    };

    const priorBalancesMap = calculateAccountBalances(priorData);

    // Valuation of Closing Stock at (fromDate - 1), which becomes Opening Stock at fromDate
    const masterItemById = new Map(allItems.map(it => [it.id, it]));
    const computedStartStockVal = Math.round(
      periodItems.reduce((total, it) => {
        const qty = Number(it.openingStock || 0);
        const orig = masterItemById.get(it.id);
        if (orig && orig.openingStockValue !== undefined && Math.abs(qty - Number(orig.openingStock || 0)) < 0.001) {
          return total + orig.openingStockValue;
        }
        if (orig && Math.abs(qty - Number(orig.currentStock || 0)) < 0.001) {
          return total + getItemClosingStockValue(orig);
        }
        const price = it.purchasePrice || it.salesPrice || 0;
        return total + qty * price;
      }, 0) * 100
    ) / 100;

    const baseOpeningStockSigned = getEffectiveOpeningStock(masterData);

    const priorInvBal = priorBalancesMap.get('acc_inventory');
    const priorInvLedgerVal = priorInvBal
      ? priorInvBal.balanceType === 'DR'
        ? priorInvBal.netBalance
        : 0
      : 0;

    const effectiveOpeningStockAtStart =
      allItems.length > 0 && (computedStartStockVal > 0 || priorInvLedgerVal === 0)
        ? computedStartStockVal
        : priorInvLedgerVal;

    // Prior-Period Net Profit / (Loss) = (Prior Revenue + Prior Closing Stock) - (Prior Expense + Base Opening Stock)
    let priorRevenue = 0;
    let priorExpense = 0;
    for (const bal of priorBalancesMap.values()) {
      if (!bal || bal.account.id === 'acc_diff_opening_bal') continue;
      const effCat = getEffectiveAccountCategory(bal.account, masterData.accountGroups);
      if (effCat === 'REVENUE') {
        priorRevenue += bal.balanceType === 'CR' ? bal.netBalance : -bal.netBalance;
      } else if (effCat === 'EXPENSE') {
        priorExpense += bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance;
      }
    }

    const priorNetProfit = Math.round(
      ((priorRevenue + effectiveOpeningStockAtStart) - (priorExpense + baseOpeningStockSigned)) * 100
    ) / 100;

    // Carry forward Balance Sheet ledgers & reset P&L ledgers cleanly
    const seenAccIds = new Set<string>();
    const nextAccounts: Account[] = (masterData.accounts || []).map(acc => {
      seenAccIds.add(acc.id);
      if (acc.id === 'acc_inventory') {
        return {
          ...acc,
          openingBalance: Math.round(effectiveOpeningStockAtStart * 100) / 100,
          balanceType: 'DR'
        };
      }
      const effCat = getEffectiveAccountCategory(acc, masterData.accountGroups);
      if (effCat === 'ASSET' || effCat === 'LIABILITY' || effCat === 'EQUITY') {
        const priorBal = priorBalancesMap.get(acc.id);
        if (priorBal) {
          return {
            ...acc,
            openingBalance: Math.round(priorBal.netBalance * 100) / 100,
            balanceType: priorBal.balanceType
          };
        }
        return { ...acc };
      }
      // Revenue & Expense ledgers start at 0 in the new period
      return {
        ...acc,
        openingBalance: 0
      };
    });

    // Include any dynamic system Balance Sheet accounts generated during prior period (excluding opening diff helper)
    for (const [accId, bal] of priorBalancesMap.entries()) {
      if (accId === 'acc_diff_opening_bal' || seenAccIds.has(accId)) continue;
      const cat = getEffectiveAccountCategory(bal.account, masterData.accountGroups);
      if (cat === 'ASSET' || cat === 'LIABILITY' || cat === 'EQUITY') {
        seenAccIds.add(accId);
        nextAccounts.push({
          ...bal.account,
          openingBalance: accId === 'acc_inventory' ? Math.round(effectiveOpeningStockAtStart * 100) / 100 : Math.round(bal.netBalance * 100) / 100,
          balanceType: accId === 'acc_inventory' ? 'DR' : bal.balanceType
        });
      }
    }

    // Transfer Accumulated Prior-Period Net Profit / (Loss) into Reserves & Surplus / Retained Earnings
    if (Math.abs(priorNetProfit) > 0.005) {
      const existingRetainedIdx = nextAccounts.findIndex(
        a =>
          a.id === 'acc_retained_profit' ||
          a.id === 'acc_reserves' ||
          (a.category === 'EQUITY' &&
            (a.name.toLowerCase().includes('retained') ||
              a.name.toLowerCase().includes('profit & loss') ||
              a.name.toLowerCase().includes('profit and loss') ||
              a.name.toLowerCase().includes('reserves & surplus')))
      );

      if (existingRetainedIdx >= 0) {
        const target = nextAccounts[existingRetainedIdx];
        const curSigned = target.balanceType === 'CR' ? -(target.openingBalance || 0) : (target.openingBalance || 0);
        // Profit is CR (-), Loss is DR (+)
        const updatedSigned = Math.round((curSigned - priorNetProfit) * 100) / 100;
        nextAccounts[existingRetainedIdx] = {
          ...target,
          openingBalance: Math.round(Math.abs(updatedSigned) * 100) / 100,
          balanceType: updatedSigned <= 0 ? 'CR' : 'DR'
        };
      } else {
        nextAccounts.push({
          id: 'acc_retained_profit',
          code: '3025',
          name: 'Retained Earnings / Prior Period P&L (B/F)',
          category: 'EQUITY',
          subCategory: 'Reserve & Surplus',
          mainGroup: 'Reserves & Surplus',
          openingBalance: Math.round(Math.abs(priorNetProfit) * 100) / 100,
          balanceType: priorNetProfit >= 0 ? 'CR' : 'DR',
          isSystem: true
        });
      }
    }

    // Carry forward Party Receivable / Payable opening balances strictly as of (fromDate - 1)
    periodParties = (masterData.parties || []).map(p => {
      const out = calculatePartyOutstanding(p, priorData);
      const rounded = Math.round(out.netBalance * 100) / 100;
      return {
        ...p,
        openingBalance: rounded,
        balanceType: out.balanceType,
        openingBalanceType: out.balanceType
      };
    });

    periodAccounts = nextAccounts;
  }

  return {
    ...masterData,
    accounts: periodAccounts,
    parties: periodParties,
    items: periodItems,
    invoices: inRangeInvoices,
    purchaseInvoices: inRangePurchases,
    purchaseOrders: inRangePOs,
    vouchers: inRangeVouchers,
    debitCreditNotes: inRangeNotes,
    bankStatements: inRangeStatements,
    stockAdjustments: inRangeAdjustments,
    stockTransfers: inRangeTransfers,
    payrolls: inRangePayrolls
  };
}

/**
 * Returns a strict Financial-Year-isolated view of AppData with automatic closing-to-opening balance
 * carry-forward from prior years (so 2022-23 through 2026-27 link seamlessly), or unfiltered All-Years
 * cumulative view when activeFYStart === 'ALL'.
 */
export function filterAppDataByFinancialYear(data: AppData, activeFYStart?: string): AppData {
  const norm = normalizeFYStartDate(activeFYStart || data.company?.financialYearStart);
  if (norm === ALL_FINANCIAL_YEARS) {
    return data;
  }
  const range = getFinancialYearRange(norm);
  const filtered = filterAppDataByDateRange(data, range.fyStart, range.fyEnd);
  return {
    ...filtered,
    company: {
      ...filtered.company,
      financialYearStart: getFinancialYearStartForDate(range.fyStart) || range.fyStart
    }
  };
}

export interface FYRangeFilterResult {
  filtered: AppData;
  fromRange: FinancialYearRange;
  toRange: FinancialYearRange;
  rangeLabel: string;
  displayRange: string;
}

/**
 * Filters master AppData across a multi-year custom FY-to-FY span (e.g., FY 2024-25 to FY 2026-27),
 * automatically sorting swapped FY inputs and carrying forward cumulative opening balances
 * strictly as of (fromRange.fyStart - 1 day).
 */
export function filterAppDataByFYRange(
  masterData: AppData,
  fromFYStartInput?: string,
  toFYStartInput?: string
): FYRangeFilterResult {
  let normFrom = normalizeFYStartDate(fromFYStartInput || masterData.company?.financialYearStart);
  let normTo = normalizeFYStartDate(toFYStartInput || normFrom);

  if (normFrom === ALL_FINANCIAL_YEARS) normFrom = getCurrentFinancialYearStart();
  if (normTo === ALL_FINANCIAL_YEARS) normTo = getCurrentFinancialYearStart();

  if (normFrom > normTo) {
    [normFrom, normTo] = [normTo, normFrom];
  }

  const fromRange = getFinancialYearRange(normFrom);
  const toRange = getFinancialYearRange(normTo);
  const filteredRaw = filterAppDataByDateRange(masterData, fromRange.fyStart, toRange.fyEnd);

  const rangeLabel =
    fromRange.fyStart === toRange.fyStart
      ? fromRange.label
      : `${fromRange.label} → ${toRange.label}`;

  const displayRange =
    fromRange.fyStart === toRange.fyStart
      ? fromRange.displayRange
      : `01 Apr ${fromRange.fyStartYear} – 31 Mar ${toRange.fyEndYear}`;

  return {
    filtered: {
      ...filteredRaw,
      company: {
        ...filteredRaw.company,
        financialYearStart: fromRange.fyStart
      }
    },
    fromRange,
    toRange,
    rangeLabel,
    displayRange
  };
}

/**
 * Returns true ONLY for actual Bank Account ledgers (strictly excludes Cash in Hand / Petty Cash).
 */
export function isStrictBankLedger(acc: Account): boolean {
  return isBankLedger(acc);
}

export interface BankStatementIdentityResult {
  valid: boolean;
  reason?: string;
  reasonHindi?: string;
  detectedAccountNos: string[];
  detectedBankBrand?: string;
  detectedIfsc?: string;
  detectedHolderLine?: string;
}

const KNOWN_BANK_BRANDS: Array<{ key: string; label: string; regex: RegExp; ifscPrefix: string }> = [
  { key: 'HDFC', label: 'HDFC Bank', regex: /\bHDFC\s*BANK\b|\bHDFC\b/i, ifscPrefix: 'HDFC' },
  { key: 'SBI', label: 'State Bank of India (SBI)', regex: /\bSTATE\s*BANK\s*OF\s*INDIA\b|\bSBI\b/i, ifscPrefix: 'SBIN' },
  { key: 'ICICI', label: 'ICICI Bank', regex: /\bICICI\s*BANK\b|\bICICI\b/i, ifscPrefix: 'ICIC' },
  { key: 'AXIS', label: 'Axis Bank', regex: /\bAXIS\s*BANK\b/i, ifscPrefix: 'UTIB' },
  { key: 'KOTAK', label: 'Kotak Mahindra Bank', regex: /\bKOTAK\s*MAHINDRA\b|\bKOTAK\s*BANK\b/i, ifscPrefix: 'KKBK' },
  { key: 'BOB', label: 'Bank of Baroda', regex: /\bBANK\s*OF\s*BARODA\b/i, ifscPrefix: 'BARB' },
  { key: 'PNB', label: 'Punjab National Bank (PNB)', regex: /\bPUNJAB\s*NATIONAL\s*BANK\b|\bPNB\b/i, ifscPrefix: 'PUNB' },
  { key: 'CANARA', label: 'Canara Bank', regex: /\bCANARA\s*BANK\b/i, ifscPrefix: 'CNRB' },
  { key: 'UNION', label: 'Union Bank of India', regex: /\bUNION\s*BANK\b/i, ifscPrefix: 'UBIN' },
  { key: 'INDUSIND', label: 'IndusInd Bank', regex: /\bINDUSIND\b/i, ifscPrefix: 'INDB' },
  { key: 'YES', label: 'Yes Bank', regex: /\bYES\s*BANK\b/i, ifscPrefix: 'YESB' },
  { key: 'IDFC', label: 'IDFC First Bank', regex: /\bIDFC\s*FIRST\b|\bIDFC\s*BANK\b/i, ifscPrefix: 'IDFB' },
  { key: 'BANDHAN', label: 'Bandhan Bank', regex: /\bBANDHAN\s*BANK\b/i, ifscPrefix: 'BDBL' },
  { key: 'FEDERAL', label: 'Federal Bank', regex: /\bFEDERAL\s*BANK\b/i, ifscPrefix: 'FDRL' }
];

function normalizeAccDigits(val?: string): string {
  return (val || '').replace(/[^0-9]/g, '');
}

/**
 * Verifies that an uploaded Bank Statement actually belongs to the company & selected Bank Ledger.
 * Blocks statements from unrelated account numbers, unrelated bank brands, or third-party account holders.
 */
export function validateBankStatementIdentity(
  statementHeaderText: string,
  company: CompanyDetails,
  selectedBankLedger: Account | undefined,
  allAccounts: Account[]
): BankStatementIdentityResult {
  const bankLedgers = allAccounts.filter(isStrictBankLedger);
  if (bankLedgers.length === 0 || !selectedBankLedger || !isStrictBankLedger(selectedBankLedger)) {
    return {
      valid: false,
      reason: 'No valid Bank Ledger is selected or configured in your Chart of Accounts. Please create your company bank ledger first.',
      reasonHindi: 'आपकी कंपनी के Chart of Accounts में कोई वैध बैंक लेजर (Bank Ledger) नहीं मिला या चुना नहीं गया है। कृपया पहले अपनी कंपनी का बैंक खाता लेजर बनाएं।',
      detectedAccountNos: []
    };
  }

  const headerSlice = (statementHeaderText || '').slice(0, 5000);
  const detectedAccountNos: string[] = [];

  // 1. Extract explicit Account Number(s) from statement metadata
  const accPatterns = [
    /(?:account\s*(?:no|number|#|id)|a\/c\s*(?:no|number|#)|acct\s*(?:no|number|#)|खाता\s*(?:सं|संख्या|नंबर))\s*[:.\-#]?\s*([X*0-9\-\s]{4,24})/gi,
    /\b(?:XXXXXXXX|XXXX|[*]{4,12})(\d{4,6})\b/gi
  ];

  for (const pat of accPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pat.exec(headerSlice)) !== null) {
      const rawCandidate = (m[1] || m[0] || '').trim();
      // Ignore dates or plain short numbers < 4 digits
      if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(rawCandidate)) continue;
      const digits = normalizeAccDigits(rawCandidate);
      if (digits.length >= 4 && !detectedAccountNos.includes(digits)) {
        detectedAccountNos.push(digits);
      }
    }
  }

  // 2. Detect Bank Brand from header
  const headerTop = headerSlice.slice(0, 2500);
  const detectedBrandObj = KNOWN_BANK_BRANDS.find(b => b.regex.test(headerTop));
  const ledgerBankBrandObj = KNOWN_BANK_BRANDS.find(b => b.regex.test(`${selectedBankLedger.name} ${company.bankName || ''}`));

  // 3. Detect IFSC code
  const ifscMatch = headerSlice.match(/\b([A-Z]{4}0[A-Z0-9]{6})\b/);
  const detectedIfsc = ifscMatch ? ifscMatch[1].toUpperCase() : undefined;

  // Expected Account Numbers for this selected ledger (and company primary bank if same bank)
  const expectedAccCandidates: string[] = [];
  const ledgerDigits = normalizeAccDigits(selectedBankLedger.accountNumber);
  if (ledgerDigits.length >= 4) expectedAccCandidates.push(ledgerDigits);

  const companyAccDigits = normalizeAccDigits(company.accountNumber);
  const ledgerMatchesCompanyBank =
    !company.bankName ||
    !ledgerBankBrandObj ||
    ledgerBankBrandObj.regex.test(company.bankName) ||
    selectedBankLedger.name.toLowerCase().includes(company.bankName.toLowerCase().trim());

  if (companyAccDigits.length >= 4 && ledgerMatchesCompanyBank) {
    expectedAccCandidates.push(companyAccDigits);
  }

  // Check A: Bank Brand Mismatch (e.g., Statement is SBI, Ledger is HDFC Bank)
  if (detectedBrandObj && ledgerBankBrandObj && detectedBrandObj.key !== ledgerBankBrandObj.key) {
    return {
      valid: false,
      detectedAccountNos,
      detectedBankBrand: detectedBrandObj.label,
      detectedIfsc,
      reason: `Bank mismatch: Selected ledger is "${selectedBankLedger.name}" (${ledgerBankBrandObj.label}), but uploaded statement belongs to ${detectedBrandObj.label}.`,
      reasonHindi: `बैंक मिलान विफल: आपने लेजर "${selectedBankLedger.name}" (${ledgerBankBrandObj.label}) चुना है, लेकिन अपलोड किया गया स्टेटमेंट ${detectedBrandObj.label} का है। कृपया सही बैंक लेजर चुनें या कंपनी का ही स्टेटमेंट अपलोड करें।`
    };
  }

  // Check B: IFSC Mismatch (against company IFSC when using primary bank, or against detected ledger bank brand)
  if (detectedIfsc) {
    if (ledgerBankBrandObj && !detectedIfsc.startsWith(ledgerBankBrandObj.ifscPrefix)) {
      return {
        valid: false,
        detectedAccountNos,
        detectedBankBrand: detectedBrandObj?.label,
        detectedIfsc,
        reason: `IFSC mismatch: Statement IFSC "${detectedIfsc}" does not belong to ${ledgerBankBrandObj.label}.`,
        reasonHindi: `IFSC कोड मिलान विफल: स्टेटमेंट में दर्ज IFSC "${detectedIfsc}" चुने गए बैंक "${selectedBankLedger.name}" से मेल नहीं खाता।`
      };
    }
    if (company.ifscCode && company.ifscCode.trim().length === 11 && ledgerMatchesCompanyBank && !ledgerDigits) {
      if (detectedIfsc !== company.ifscCode.trim().toUpperCase()) {
        return {
          valid: false,
          detectedAccountNos,
          detectedBankBrand: detectedBrandObj?.label,
          detectedIfsc,
          reason: `IFSC mismatch: Statement IFSC "${detectedIfsc}" does not match company IFSC "${company.ifscCode.toUpperCase()}".`,
          reasonHindi: `IFSC मिलान विफल: स्टेटमेंट का IFSC (${detectedIfsc}) आपकी कंपनी के IFSC (${company.ifscCode.toUpperCase()}) से अलग है।`
        };
      }
    }
  }

  // Check C: Account Number Mismatch
  if (expectedAccCandidates.length > 0 && detectedAccountNos.length > 0) {
    const anyAccMatched = expectedAccCandidates.some(exp => {
      const expLast4 = exp.slice(-4);
      return detectedAccountNos.some(det => {
        const detLast4 = det.slice(-4);
        return det === exp || (expLast4.length === 4 && detLast4 === expLast4);
      });
    });

    if (!anyAccMatched) {
      const shownDet = detectedAccountNos[0].length > 4 ? `****${detectedAccountNos[0].slice(-4)}` : detectedAccountNos[0];
      const shownExp = expectedAccCandidates[0].length > 4 ? `****${expectedAccCandidates[0].slice(-4)}` : expectedAccCandidates[0];
      return {
        valid: false,
        detectedAccountNos,
        detectedBankBrand: detectedBrandObj?.label,
        detectedIfsc,
        reason: `Account Number mismatch: Statement belongs to A/c ${shownDet}, whereas your selected company ledger "${selectedBankLedger.name}" is linked to A/c ${shownExp}.`,
        reasonHindi: `खाता संख्या (A/c No.) मेल नहीं खाई: अपलोड स्टेटमेंट खाता संख्या ${shownDet} का है, जबकि आपकी कंपनी के लेजर "${selectedBankLedger.name}" में खाता संख्या ${shownExp} दर्ज है। किसी अन्य व्यक्ति/कंपनी का स्टेटमेंट अपलोड नहीं किया जा सकता।`
      };
    }
  }

  // Check D: Explicit Account Holder Name vs Company Name Check
  const holderMatch = headerSlice.match(
    /(?:account\s*holder\s*name|customer\s*name|holder\s*name|account\s*name|a\/c\s*holder|name\s*of\s*customer)\s*[:.\-]\s*([^\n\r|]{3,70})/i
  );
  const detectedHolderLine = holderMatch ? holderMatch[1].trim() : undefined;

  if (detectedHolderLine && company.name && company.name.trim().length >= 3) {
    const cleanCompany = company.name.replace(/\(FY\s*\d{4}-\d{2}\)/gi, '').trim().toLowerCase();
    const cleanHolder = detectedHolderLine.toLowerCase();
    // Ignore generic labels like "Savings Account" or "Current Account"
    const isGenericLabel = /^(current|savings|saving|overdraft|od|cc|cash credit)\b/i.test(cleanHolder);
    if (!isGenericLabel) {
      const stopWords = new Set(['pvt', 'ltd', 'private', 'limited', 'llp', 'and', 'the', 'm/s', 'ms', 'co', 'company', 'traders', 'enterprises', 'india', 'mr', 'mrs', 'shri', 'smt']);
      const compWords = cleanCompany.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stopWords.has(w));
      const holderWords = cleanHolder.split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !stopWords.has(w));
      if (compWords.length > 0 && holderWords.length > 0) {
        const hasOverlap = compWords.some(cw => holderWords.some(hw => hw.includes(cw) || cw.includes(hw)));
        if (!hasOverlap) {
          return {
            valid: false,
            detectedAccountNos,
            detectedBankBrand: detectedBrandObj?.label,
            detectedIfsc,
            detectedHolderLine,
            reason: `Account Holder mismatch: Statement holder is "${detectedHolderLine}", which does not match your company "${company.name}".`,
            reasonHindi: `खाताधारक का नाम मेल नहीं खाया: स्टेटमेंट में खाताधारक "${detectedHolderLine}" दर्ज है, जो आपकी कंपनी "${company.name}" से संबंधित नहीं है। केवल कंपनी से संबंधित बैंक स्टेटमेंट ही मान्य है।`
          };
        }
      }
    }
  }

  return {
    valid: true,
    detectedAccountNos,
    detectedBankBrand: detectedBrandObj?.label,
    detectedIfsc,
    detectedHolderLine
  };
}

/**
 * Checks if a BankStatementLine duplicates an already imported line.
 */
export function isDuplicateStatementLine(
  candidate: Pick<BankStatementLine, 'date' | 'type' | 'amount' | 'description' | 'referenceNo'>,
  existing: BankStatementLine[]
): boolean {
  const cDate = normalizeDateISO(candidate.date);
  const cRef = (candidate.referenceNo || '').trim().toLowerCase();
  const cDesc = (candidate.description || '').trim().toLowerCase().slice(0, 40);

  return (existing || []).some(ex => {
    if (normalizeDateISO(ex.date) !== cDate) return false;
    if (ex.type !== candidate.type) return false;
    if (Math.abs((ex.amount || 0) - (candidate.amount || 0)) > 0.01) return false;
    const exRef = (ex.referenceNo || '').trim().toLowerCase();
    if (cRef && exRef && cRef === exRef) return true;
    const exDesc = (ex.description || '').trim().toLowerCase().slice(0, 40);
    return cDesc.length >= 6 && cDesc === exDesc;
  });
}

/**
 * Validates optional GSTIN (allows empty or 'URP' for unregistered parties).
 */
export function isOptionalGstinValid(gstin?: string): { valid: boolean; error?: string; errorHindi?: string } {
  const clean = (gstin || '').trim().toUpperCase();
  if (!clean || clean === 'URP' || clean === 'UNREGISTERED') return { valid: true };
  const res = validateGSTIN(clean);
  return { valid: res.isValid, error: res.error, errorHindi: res.errorHindi };
}
