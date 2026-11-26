import { BankStatementLine, Voucher } from '../types';

export type BankPeriodGranularity = 'ALL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface BankPeriodBucket {
  key: string;
  label: string;
  fromDate: string;
  toDate: string;
  stmtCredit: number;
  stmtDebit: number;
  stmtNetFlow: number;
  stmtCount: number;
  stmtReconciledCount: number;
  stmtPendingCount: number;
  bookReceipts: number;
  bookPayments: number;
  bookNetFlow: number;
  bookCount: number;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeBankIsoDate(rawDate?: string): string | null {
  if (!rawDate) return null;
  const trimmed = String(rawDate).trim();
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    let y = Number(dmyMatch[3]);
    if (y < 100) y += 2000;
    if (y >= 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
}

function formatShortDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return `${pad2(d)} ${SHORT_MONTHS[(m - 1) % 12]} ${y}`;
}

export function getBankPeriodInfo(
  rawDate: string | undefined,
  granularity: BankPeriodGranularity
): { key: string; label: string; fromDate: string; toDate: string } | null {
  if (granularity === 'ALL') return null;
  const iso = normalizeBankIsoDate(rawDate);
  if (!iso) return null;

  const [y, m, d] = iso.split('-').map(Number);

  if (granularity === 'DAILY') {
    return {
      key: iso,
      label: formatShortDate(iso),
      fromDate: iso,
      toDate: iso,
    };
  }

  if (granularity === 'WEEKLY') {
    const utcDate = new Date(Date.UTC(y, m - 1, d));
    const dayOfWeek = utcDate.getUTCDay(); // 0=Sun .. 6=Sat
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(utcDate);
    monday.setUTCDate(utcDate.getUTCDate() + diffToMonday);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);

    const mondayIso = `${monday.getUTCFullYear()}-${pad2(monday.getUTCMonth() + 1)}-${pad2(monday.getUTCDate())}`;
    const sundayIso = `${sunday.getUTCFullYear()}-${pad2(sunday.getUTCMonth() + 1)}-${pad2(sunday.getUTCDate())}`;
    return {
      key: `W_${mondayIso}`,
      label: `${pad2(monday.getUTCDate())} ${SHORT_MONTHS[monday.getUTCMonth()]} – ${pad2(sunday.getUTCDate())} ${SHORT_MONTHS[sunday.getUTCMonth()]} ${sunday.getUTCFullYear()}`,
      fromDate: mondayIso,
      toDate: sundayIso,
    };
  }

  if (granularity === 'MONTHLY') {
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      key: `${y}-${pad2(m)}`,
      label: `${FULL_MONTHS[(m - 1) % 12]} ${y}`,
      fromDate: `${y}-${pad2(m)}-01`,
      toDate: `${y}-${pad2(m)}-${pad2(lastDay)}`,
    };
  }

  // QUARTERLY (Indian FY: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar)
  const qNum = m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 && m <= 12 ? 3 : 4;
  const fyStartYear = m >= 4 ? y : y - 1;
  const fyShortNext = pad2((fyStartYear + 1) % 100);
  const qRanges: Record<number, { start: string; end: string; months: string }> = {
    1: { start: `${fyStartYear}-04-01`, end: `${fyStartYear}-06-30`, months: 'Apr–Jun' },
    2: { start: `${fyStartYear}-07-01`, end: `${fyStartYear}-09-30`, months: 'Jul–Sep' },
    3: { start: `${fyStartYear}-10-01`, end: `${fyStartYear}-12-31`, months: 'Oct–Dec' },
    4: { start: `${fyStartYear + 1}-01-01`, end: `${fyStartYear + 1}-03-31`, months: 'Jan–Mar' },
  };
  const info = qRanges[qNum];
  return {
    key: `FY${fyStartYear}_Q${qNum}`,
    label: `Q${qNum} (${info.months}) FY ${fyStartYear}-${fyShortNext}`,
    fromDate: info.start,
    toDate: info.end,
  };
}

export function buildBankPeriodicSummary(
  statementLines: BankStatementLine[],
  bankBookVouchers: Voucher[],
  selectedBankId: string | undefined,
  granularity: BankPeriodGranularity
): BankPeriodBucket[] {
  if (granularity === 'ALL') return [];

  const map = new Map<string, BankPeriodBucket>();

  const getOrCreate = (info: { key: string; label: string; fromDate: string; toDate: string }): BankPeriodBucket => {
    let bucket = map.get(info.key);
    if (!bucket) {
      bucket = {
        key: info.key,
        label: info.label,
        fromDate: info.fromDate,
        toDate: info.toDate,
        stmtCredit: 0,
        stmtDebit: 0,
        stmtNetFlow: 0,
        stmtCount: 0,
        stmtReconciledCount: 0,
        stmtPendingCount: 0,
        bookReceipts: 0,
        bookPayments: 0,
        bookNetFlow: 0,
        bookCount: 0,
      };
      map.set(info.key, bucket);
    }
    return bucket;
  };

  for (const line of statementLines) {
    const info = getBankPeriodInfo(line.date, granularity);
    if (!info) continue;
    const b = getOrCreate(info);
    const amt = Number(line.amount) || 0;
    if (line.type === 'CREDIT') b.stmtCredit += amt;
    else b.stmtDebit += amt;
    b.stmtNetFlow = b.stmtCredit - b.stmtDebit;
    b.stmtCount += 1;
    if (line.reconciled || line.isReconciled) b.stmtReconciledCount += 1;
    else b.stmtPendingCount += 1;
  }

  for (const v of bankBookVouchers) {
    const info = getBankPeriodInfo(v.date, granularity);
    if (!info) continue;
    const b = getOrCreate(info);
    let receiptAmt = 0;
    let paymentAmt = 0;
    if (selectedBankId) {
      for (const e of v.entries || []) {
        if (e.accountId === selectedBankId) {
          receiptAmt += Number(e.debit) || 0;
          paymentAmt += Number(e.credit) || 0;
        }
      }
    } else if (v.type === 'RECEIPT') {
      receiptAmt = Number(v.totalAmount) || 0;
    } else if (v.type === 'PAYMENT') {
      paymentAmt = Number(v.totalAmount) || 0;
    }
    b.bookReceipts += receiptAmt;
    b.bookPayments += paymentAmt;
    b.bookNetFlow = b.bookReceipts - b.bookPayments;
    b.bookCount += 1;
  }

  return Array.from(map.values())
    .map((b) => ({
      ...b,
      stmtCredit: Math.round(b.stmtCredit * 100) / 100,
      stmtDebit: Math.round(b.stmtDebit * 100) / 100,
      stmtNetFlow: Math.round(b.stmtNetFlow * 100) / 100,
      bookReceipts: Math.round(b.bookReceipts * 100) / 100,
      bookPayments: Math.round(b.bookPayments * 100) / 100,
      bookNetFlow: Math.round(b.bookNetFlow * 100) / 100,
    }))
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate));
}
