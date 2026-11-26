import { AppData, DebitCreditNote, PurchaseInvoice, SalesInvoice, Voucher } from '../types';
import {
  calculateAccountBalances,
  getAutoRoundOffAdjustment,
  getEffectiveAccountCategory,
  isDirectExpenseLedger,
  isDirectRevenueLedger,
  isFixedAssetLedger,
  mergeAccountsWithBalancesMap,
  resolveVoucherLineAccountId
} from './accounting';
import {
  getFinancialYearRange,
  getFinancialYearStartForDate,
  normalizeDateISO
} from './fiscalYear';

export type ReportGranularity = 'SUMMARY' | 'DAILY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface PeriodTransactionItem {
  id: string;
  date: string;
  refNo: string;
  kind: 'SALES' | 'PURCHASE' | 'VOUCHER' | 'NOTE';
  subType: string;
  partyOrParticulars: string;
  amount: number;
  taxableValue: number;
  gstAmount: number;
}

export interface PeriodicReportRow {
  key: string;
  label: string;
  subLabel: string;
  fromDate: string;
  toDate: string;
  // Trading & P&L metrics
  salesRevenue: number;
  directExpenses: number;
  grossProfit: number;
  indirectIncome: number;
  indirectExpenses: number;
  netProfit: number;
  // Transaction & TB Movement metrics
  periodDebit: number;
  periodCredit: number;
  txCount: number;
  invoiceCount: number;
  purchaseCount: number;
  voucherCount: number;
  noteCount: number;
  // Cumulative Balance Sheet snapshot at end of bucket
  fixedAssets: number;
  currentAssets: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquityWithProfit: number;
  // GST summary
  outputGst: number;
  inputGst: number;
  // Drilldown items
  items: PeriodTransactionItem[];
}

export interface YearWiseAccountColumn {
  fyStart: string;
  label: string;
  shortLabel: string;
  balancesMap: ReturnType<typeof calculateAccountBalances>;
}

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getBucketMeta(
  isoDate: string,
  granularity: Exclude<ReportGranularity, 'SUMMARY'>
): { key: string; label: string; subLabel: string; fromDate: string; toDate: string } {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const y = Number(yStr) || 2026;
  const m = Number(mStr) || 4; // 1..12

  if (granularity === 'DAILY') {
    const dt = new Date(`${isoDate}T00:00:00`);
    const label = !isNaN(dt.getTime())
      ? `${dStr} ${MONTH_NAMES_EN[m - 1]} ${y}`
      : isoDate;
    const weekday = !isNaN(dt.getTime())
      ? dt.toLocaleDateString('en-IN', { weekday: 'short' })
      : '';
    return {
      key: isoDate,
      label,
      subLabel: weekday,
      fromDate: isoDate,
      toDate: isoDate
    };
  }

  if (granularity === 'MONTHLY') {
    const lastDay = new Date(y, m, 0).getDate();
    return {
      key: `${y}-${mStr}`,
      label: `${MONTH_NAMES_EN[m - 1] || mStr} ${y}`,
      subLabel: `01–${String(lastDay).padStart(2, '0')} ${MONTH_NAMES_EN[m - 1] || ''}`,
      fromDate: `${y}-${mStr}-01`,
      toDate: `${y}-${mStr}-${String(lastDay).padStart(2, '0')}`
    };
  }

  if (granularity === 'QUARTERLY') {
    const fyStart = getFinancialYearStartForDate(isoDate) || `${y}-04-01`;
    const fyYear = Number(fyStart.split('-')[0]) || y;
    const fyShort = `${fyYear}-${String(fyYear + 1).slice(-2)}`;
    if (m >= 4 && m <= 6) {
      return {
        key: `${fyYear}-Q1`,
        label: `Q1 FY ${fyShort}`,
        subLabel: `Apr – Jun ${fyYear}`,
        fromDate: `${fyYear}-04-01`,
        toDate: `${fyYear}-06-30`
      };
    }
    if (m >= 7 && m <= 9) {
      return {
        key: `${fyYear}-Q2`,
        label: `Q2 FY ${fyShort}`,
        subLabel: `Jul – Sep ${fyYear}`,
        fromDate: `${fyYear}-07-01`,
        toDate: `${fyYear}-09-30`
      };
    }
    if (m >= 10 && m <= 12) {
      return {
        key: `${fyYear}-Q3`,
        label: `Q3 FY ${fyShort}`,
        subLabel: `Oct – Dec ${fyYear}`,
        fromDate: `${fyYear}-10-01`,
        toDate: `${fyYear}-12-31`
      };
    }
    return {
      key: `${fyYear}-Q4`,
      label: `Q4 FY ${fyShort}`,
      subLabel: `Jan – Mar ${fyYear + 1}`,
      fromDate: `${fyYear + 1}-01-01`,
      toDate: `${fyYear + 1}-03-31`
    };
  }

  // YEARLY (Indian Financial Year)
  const fyStart = getFinancialYearStartForDate(isoDate) || `${y}-04-01`;
  const fyRange = getFinancialYearRange(fyStart);
  return {
    key: fyStart,
    label: fyRange.label,
    subLabel: fyRange.displayRange,
    fromDate: fyRange.fyStart,
    toDate: fyRange.fyEnd
  };
}

/**
 * Builds an O(N) chronological Daily / Monthly / Quarterly / Yearly breakdown
 * across Trading & P&L, Trial Balance movements, GST, and Cumulative Balance Sheet snapshots.
 */
export function buildPeriodicFinancialBreakdown(
  data: AppData,
  granularity: Exclude<ReportGranularity, 'SUMMARY'>
): PeriodicReportRow[] {
  const allMergedAccounts = mergeAccountsWithBalancesMap(data, calculateAccountBalances(data));
  const accountById = new Map(allMergedAccounts.map(a => [a.id, a]));
  const partyById = new Map((data.parties || []).map(p => [p.id, p]));

  interface BucketAccumulator {
    key: string;
    label: string;
    subLabel: string;
    fromDate: string;
    toDate: string;
    salesRevenue: number;
    directExpenses: number;
    indirectIncome: number;
    indirectExpenses: number;
    periodDebit: number;
    periodCredit: number;
    invoiceCount: number;
    purchaseCount: number;
    voucherCount: number;
    noteCount: number;
    outputGst: number;
    inputGst: number;
    accountDrDelta: Map<string, number>;
    accountCrDelta: Map<string, number>;
    items: PeriodTransactionItem[];
  }

  const buckets = new Map<string, BucketAccumulator>();

  const ensureBucket = (rawDate: string): BucketAccumulator | null => {
    const iso = normalizeDateISO(rawDate);
    if (!iso) return null;
    const meta = getBucketMeta(iso, granularity);
    let b = buckets.get(meta.key);
    if (!b) {
      b = {
        ...meta,
        salesRevenue: 0,
        directExpenses: 0,
        indirectIncome: 0,
        indirectExpenses: 0,
        periodDebit: 0,
        periodCredit: 0,
        invoiceCount: 0,
        purchaseCount: 0,
        voucherCount: 0,
        noteCount: 0,
        outputGst: 0,
        inputGst: 0,
        accountDrDelta: new Map(),
        accountCrDelta: new Map(),
        items: []
      };
      buckets.set(meta.key, b);
    }
    return b;
  };

  const addAccountDelta = (b: BucketAccumulator, accId: string, dr: number, cr: number) => {
    if (dr > 0) b.accountDrDelta.set(accId, (b.accountDrDelta.get(accId) || 0) + dr);
    if (cr > 0) b.accountCrDelta.set(accId, (b.accountCrDelta.get(accId) || 0) + cr);
    b.periodDebit += dr;
    b.periodCredit += cr;
  };

  const applyExtraLedgerImpact = (
    b: BucketAccumulator,
    extraLines: { accountId: string; debit: number; credit: number }[] | undefined
  ) => {
    if (!extraLines || extraLines.length === 0) return;
    for (const el of extraLines) {
      if (!el.accountId) continue;
      const dr = el.debit || 0;
      const cr = el.credit || 0;
      addAccountDelta(b, el.accountId, dr, cr);
      const acc = accountById.get(el.accountId);
      if (acc) {
        const effCat = getEffectiveAccountCategory(acc, data.accountGroups);
        if (effCat === 'REVENUE') {
          const netRev = cr - dr;
          if (isDirectRevenueLedger(acc, data.accountGroups)) b.salesRevenue += netRev;
          else b.indirectIncome += netRev;
        } else if (effCat === 'EXPENSE') {
          const netExp = dr - cr;
          if (isDirectExpenseLedger(acc, data.accountGroups)) b.directExpenses += netExp;
          else b.indirectExpenses += netExp;
        }
      }
    }
  };

  // 1. Sales Invoices
  for (const inv of data.invoices || []) {
    if (inv.status === 'CANCELLED') continue;
    const b = ensureBucket(inv.date);
    if (!b) continue;
    const taxable = (inv.subtotal || 0) - (inv.totalDiscount || 0);
    const gst = (inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0);
    b.salesRevenue += taxable;
    b.outputGst += gst;
    b.invoiceCount += 1;

    addAccountDelta(b, 'acc_debtors', inv.grandTotal || 0, 0);
    addAccountDelta(b, inv.primaryAccountId || 'acc_sales', 0, taxable);
    if ((inv.cgstAmount || 0) > 0) addAccountDelta(b, 'acc_gst_cgst', 0, inv.cgstAmount);
    if ((inv.sgstAmount || 0) > 0) addAccountDelta(b, 'acc_gst_sgst', 0, inv.sgstAmount);
    if ((inv.igstAmount || 0) > 0) addAccountDelta(b, 'acc_gst_igst', 0, inv.igstAmount);
    if (inv.roundOff && Math.abs(inv.roundOff) > 0.0001) {
      if (inv.roundOff > 0) {
        b.indirectIncome += inv.roundOff;
        addAccountDelta(b, 'acc_round_off', 0, inv.roundOff);
      } else {
        b.indirectExpenses += Math.abs(inv.roundOff);
        addAccountDelta(b, 'acc_round_off', Math.abs(inv.roundOff), 0);
      }
    }
    applyExtraLedgerImpact(b, inv.extraLedgerLines);
    const invDr = (inv.grandTotal || 0)
      + (inv.roundOff && inv.roundOff < -0.0001 ? Math.abs(inv.roundOff) : 0)
      + (inv.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.debit || 0) : 0), 0);
    const invCr = taxable + gst
      + (inv.roundOff && inv.roundOff > 0.0001 ? inv.roundOff : 0)
      + (inv.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.credit || 0) : 0), 0);
    const invAutoRo = getAutoRoundOffAdjustment(invDr, invCr);
    if (invAutoRo) {
      if (invAutoRo.credit > 0) b.indirectIncome += invAutoRo.credit;
      else b.indirectExpenses += invAutoRo.debit;
      addAccountDelta(b, 'acc_round_off', invAutoRo.debit, invAutoRo.credit);
    }

    b.items.push({
      id: inv.id,
      date: normalizeDateISO(inv.date) || inv.date,
      refNo: inv.invoiceNumber,
      kind: 'SALES',
      subType: inv.invoiceType || 'Sales',
      partyOrParticulars: inv.partyName || 'Customer',
      amount: inv.grandTotal || 0,
      taxableValue: taxable,
      gstAmount: gst
    });
  }

  // 2. Purchase Invoices
  for (const pur of data.purchaseInvoices || []) {
    if (pur.status === 'CANCELLED') continue;
    const b = ensureBucket(pur.date);
    if (!b) continue;
    const taxable = (pur.subtotal || 0) - (pur.totalDiscount || 0);
    const gst = (pur.cgstAmount || 0) + (pur.sgstAmount || 0) + (pur.igstAmount || 0);
    b.directExpenses += taxable;
    b.inputGst += gst;
    b.purchaseCount += 1;

    addAccountDelta(b, pur.primaryAccountId || 'acc_cogs', taxable, 0);
    if ((pur.cgstAmount || 0) > 0) addAccountDelta(b, 'acc_itc_cgst', pur.cgstAmount, 0);
    if ((pur.sgstAmount || 0) > 0) addAccountDelta(b, 'acc_itc_sgst', pur.sgstAmount, 0);
    if ((pur.igstAmount || 0) > 0) addAccountDelta(b, 'acc_itc_igst', pur.igstAmount, 0);
    if (pur.roundOff && Math.abs(pur.roundOff) > 0.0001) {
      if (pur.roundOff > 0) {
        b.indirectExpenses += pur.roundOff;
        addAccountDelta(b, 'acc_round_off', pur.roundOff, 0);
      } else {
        b.indirectIncome += Math.abs(pur.roundOff);
        addAccountDelta(b, 'acc_round_off', 0, Math.abs(pur.roundOff));
      }
    }
    applyExtraLedgerImpact(b, pur.extraLedgerLines);
    addAccountDelta(b, 'acc_creditors', 0, pur.grandTotal || 0);
    const purDr = taxable + gst
      + (pur.roundOff && pur.roundOff > 0.0001 ? pur.roundOff : 0)
      + (pur.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.debit || 0) : 0), 0);
    const purCr = (pur.grandTotal || 0)
      + (pur.roundOff && pur.roundOff < -0.0001 ? Math.abs(pur.roundOff) : 0)
      + (pur.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.credit || 0) : 0), 0);
    const purAutoRo = getAutoRoundOffAdjustment(purDr, purCr);
    if (purAutoRo) {
      if (purAutoRo.debit > 0) b.indirectExpenses += purAutoRo.debit;
      else b.indirectIncome += purAutoRo.credit;
      addAccountDelta(b, 'acc_round_off', purAutoRo.debit, purAutoRo.credit);
    }

    b.items.push({
      id: pur.id,
      date: normalizeDateISO(pur.date) || pur.date,
      refNo: pur.supplierInvoiceNo || pur.billNumber,
      kind: 'PURCHASE',
      subType: 'Purchase Bill',
      partyOrParticulars: pur.partyName || 'Supplier',
      amount: pur.grandTotal || 0,
      taxableValue: taxable,
      gstAmount: gst
    });
  }

  // 3. Debit & Credit Notes
  for (const note of data.debitCreditNotes || []) {
    const b = ensureBucket(note.date);
    if (!b) continue;
    const taxable = (note.subtotal || 0) - (note.totalDiscount || 0);
    const gst = (note.cgstAmount || 0) + (note.sgstAmount || 0) + (note.igstAmount || 0);
    b.noteCount += 1;
    let noteDr = 0;
    let noteCr = 0;

    if (note.type === 'DEBIT_NOTE') {
      b.directExpenses -= taxable;
      b.inputGst -= gst;
      addAccountDelta(b, 'acc_creditors', note.grandTotal || 0, 0);
      noteDr += note.grandTotal || 0;
      addAccountDelta(b, note.primaryAccountId || 'acc_cogs', 0, taxable);
      noteCr += taxable + gst;
      if ((note.cgstAmount || 0) > 0) addAccountDelta(b, 'acc_itc_cgst', 0, note.cgstAmount);
      if ((note.sgstAmount || 0) > 0) addAccountDelta(b, 'acc_itc_sgst', 0, note.sgstAmount);
      if ((note.igstAmount || 0) > 0) addAccountDelta(b, 'acc_itc_igst', 0, note.igstAmount);
      if (note.roundOff && Math.abs(note.roundOff) > 0.0001) {
        if (note.roundOff > 0) {
          b.indirectIncome += note.roundOff;
          addAccountDelta(b, 'acc_round_off', 0, note.roundOff);
          noteCr += note.roundOff;
        } else {
          b.indirectExpenses += Math.abs(note.roundOff);
          addAccountDelta(b, 'acc_round_off', Math.abs(note.roundOff), 0);
          noteDr += Math.abs(note.roundOff);
        }
      }
    } else {
      b.salesRevenue -= taxable;
      b.outputGst -= gst;
      addAccountDelta(b, note.primaryAccountId || 'acc_sales', taxable, 0);
      noteDr += taxable + gst;
      if ((note.cgstAmount || 0) > 0) addAccountDelta(b, 'acc_gst_cgst', note.cgstAmount, 0);
      if ((note.sgstAmount || 0) > 0) addAccountDelta(b, 'acc_gst_sgst', note.sgstAmount, 0);
      if ((note.igstAmount || 0) > 0) addAccountDelta(b, 'acc_gst_igst', note.igstAmount, 0);
      addAccountDelta(b, 'acc_debtors', 0, note.grandTotal || 0);
      noteCr += note.grandTotal || 0;
      if (note.roundOff && Math.abs(note.roundOff) > 0.0001) {
        if (note.roundOff > 0) {
          b.indirectExpenses += note.roundOff;
          addAccountDelta(b, 'acc_round_off', note.roundOff, 0);
          noteDr += note.roundOff;
        } else {
          b.indirectIncome += Math.abs(note.roundOff);
          addAccountDelta(b, 'acc_round_off', 0, Math.abs(note.roundOff));
          noteCr += Math.abs(note.roundOff);
        }
      }
    }
    applyExtraLedgerImpact(b, note.extraLedgerLines);
    for (const el of note.extraLedgerLines || []) {
      if (!el.accountId) continue;
      noteDr += el.debit || 0;
      noteCr += el.credit || 0;
    }
    const noteAutoRo = getAutoRoundOffAdjustment(noteDr, noteCr);
    if (noteAutoRo) {
      if (noteAutoRo.debit > 0) b.indirectExpenses += noteAutoRo.debit;
      else b.indirectIncome += noteAutoRo.credit;
      addAccountDelta(b, 'acc_round_off', noteAutoRo.debit, noteAutoRo.credit);
    }

    b.items.push({
      id: note.id,
      date: normalizeDateISO(note.date) || note.date,
      refNo: note.noteNumber,
      kind: 'NOTE',
      subType: note.type === 'DEBIT_NOTE' ? 'Debit Note' : 'Credit Note',
      partyOrParticulars: note.partyName || 'Party',
      amount: note.grandTotal || 0,
      taxableValue: taxable,
      gstAmount: gst
    });
  }

  // 4. Vouchers (Journal, Payment, Receipt, Contra)
  for (const vch of data.vouchers || []) {
    if ((vch as any).isOptional || (vch as any).isCancelled) continue;
    const b = ensureBucket(vch.date);
    if (!b) continue;
    b.voucherCount += 1;
    let vchDr = 0;
    let vchCr = 0;

    for (const line of vch.entries || []) {
      if (!line.accountId) continue;
      const targetAccId = resolveVoucherLineAccountId(line.accountId, vch.type, accountById, partyById);
      const acc = accountById.get(targetAccId);

      const dr = line.debit || 0;
      const cr = line.credit || 0;
      vchDr += dr;
      vchCr += cr;
      addAccountDelta(b, targetAccId, dr, cr);

      if (acc) {
        const effCat = getEffectiveAccountCategory(acc, data.accountGroups);
        if (effCat === 'REVENUE') {
          const netRev = cr - dr;
          if (isDirectRevenueLedger(acc, data.accountGroups)) b.salesRevenue += netRev;
          else b.indirectIncome += netRev;
        } else if (effCat === 'EXPENSE') {
          const netExp = dr - cr;
          if (isDirectExpenseLedger(acc, data.accountGroups)) b.directExpenses += netExp;
          else b.indirectExpenses += netExp;
        }
      }
    }
    if (vch.type !== 'CONTRA') {
      const vchAutoRo = getAutoRoundOffAdjustment(vchDr, vchCr);
      if (vchAutoRo) {
        if (vchAutoRo.debit > 0) b.indirectExpenses += vchAutoRo.debit;
        else b.indirectIncome += vchAutoRo.credit;
        addAccountDelta(b, 'acc_round_off', vchAutoRo.debit, vchAutoRo.credit);
      }
    }

    b.items.push({
      id: vch.id,
      date: normalizeDateISO(vch.date) || vch.date,
      refNo: vch.voucherNumber,
      kind: 'VOUCHER',
      subType: vch.type,
      partyOrParticulars: vch.partyName || vch.narration || `${vch.type} Entry`,
      amount: vch.totalAmount || 0,
      taxableValue: vch.totalAmount || 0,
      gstAmount: 0
    });
  }

  // Sort buckets chronologically
  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));

  // Initialize cumulative account Dr/Cr running balances from opening balances
  const runningAccountNetDr = new Map<string, number>();
  for (const acc of allMergedAccounts) {
    const signed = acc.balanceType === 'DR' ? (acc.openingBalance || 0) : -(acc.openingBalance || 0);
    runningAccountNetDr.set(acc.id, signed);
  }

  // Compute cumulative Balance Sheet snapshots per bucket in O(buckets * accounts)
  const rows: PeriodicReportRow[] = [];
  let cumulativeNetProfit = 0;

  for (const b of sortedBuckets) {
    for (const [accId, dr] of b.accountDrDelta.entries()) {
      runningAccountNetDr.set(accId, (runningAccountNetDr.get(accId) || 0) + dr);
    }
    for (const [accId, cr] of b.accountCrDelta.entries()) {
      runningAccountNetDr.set(accId, (runningAccountNetDr.get(accId) || 0) - cr);
    }

    const grossProfit = Math.round((b.salesRevenue - b.directExpenses) * 100) / 100;
    const netProfit = Math.round((grossProfit + b.indirectIncome - b.indirectExpenses) * 100) / 100;
    cumulativeNetProfit += netProfit;

    let fixedAssets = 0;
    let currentAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;

    for (const acc of allMergedAccounts) {
      const signedDr = runningAccountNetDr.get(acc.id) || 0;
      const effCat = getEffectiveAccountCategory(acc, data.accountGroups);
      if (effCat === 'ASSET') {
        if (isFixedAssetLedger(acc, data.accountGroups)) {
          fixedAssets += signedDr;
        } else {
          currentAssets += signedDr;
        }
      } else if (effCat === 'LIABILITY') {
        totalLiabilities += -signedDr;
      } else if (effCat === 'EQUITY') {
        totalEquity += -signedDr;
      }
    }

    b.items.sort((x, y) => x.date.localeCompare(y.date));

    rows.push({
      key: b.key,
      label: b.label,
      subLabel: b.subLabel,
      fromDate: b.fromDate,
      toDate: b.toDate,
      salesRevenue: Math.round(b.salesRevenue * 100) / 100,
      directExpenses: Math.round(b.directExpenses * 100) / 100,
      grossProfit,
      indirectIncome: Math.round(b.indirectIncome * 100) / 100,
      indirectExpenses: Math.round(b.indirectExpenses * 100) / 100,
      netProfit,
      periodDebit: Math.round(b.periodDebit * 100) / 100,
      periodCredit: Math.round(b.periodCredit * 100) / 100,
      txCount: b.invoiceCount + b.purchaseCount + b.voucherCount + b.noteCount,
      invoiceCount: b.invoiceCount,
      purchaseCount: b.purchaseCount,
      voucherCount: b.voucherCount,
      noteCount: b.noteCount,
      fixedAssets: Math.round(fixedAssets * 100) / 100,
      currentAssets: Math.round(currentAssets * 100) / 100,
      totalAssets: Math.round((fixedAssets + currentAssets) * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      totalEquityWithProfit: Math.round((totalEquity + cumulativeNetProfit) * 100) / 100,
      outputGst: Math.round(b.outputGst * 100) / 100,
      inputGst: Math.round(b.inputGst * 100) / 100,
      items: b.items
    });
  }

  return rows;
}
