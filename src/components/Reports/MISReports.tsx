import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  FileSpreadsheet,
  Printer,
  Download,
  Search,
  Receipt,
  ShoppingBag,
  Calendar,
  Users,
  FileCheck2,
  Package,
  PieChart,
  ArrowRightLeft,
  CheckCircle2,
  Check,
  RotateCcw,
  Plus,
  AlertTriangle,
  Globe2
} from 'lucide-react';
import { Account, AppData, PurchaseInvoice, SalesInvoice, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import {
  calculateAccountBalances,
  calculatePartyOutstanding,
  calculateClosingStock,
  getEffectiveAccountCategory,
  getEffectiveOpeningStock,
  getItemClosingStockValue,
  isDirectExpenseLedger,
  isDirectRevenueLedger,
  mergeAccountsWithBalancesMap,
  resolveSalesInvoiceSettlement,
  resolvePurchaseBillSettlement
} from '../../utils/accounting';
import {
  ALL_FINANCIAL_YEARS,
  filterAppDataByFYRange,
  getAvailableFinancialYears,
  getCurrentFinancialYearStart,
  getFinancialYearRange
} from '../../utils/fiscalYear';
import { LedgerDrilldownModal } from '../Ledger/LedgerDrilldownModal';
import { FinancialDetailModal, FinancialDetailPayload, FinancialGroupLedgerRow } from '../Ledger/FinancialDetailModal';
import { printHtmlDocument } from '../../utils/printReport';

interface MISReportsProps {
  data: AppData;
  masterData?: AppData;
  activeFyLabel?: string;
  activePeriodStart?: string;
  activePeriodEnd?: string;
  isHindi: boolean;
  onOpenDebitCreditNoteModal?: () => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export type MISReportType =
  | 'SALES'
  | 'PURCHASE'
  | 'DAYBOOK'
  | 'OUTSTANDING'
  | 'GST'
  | 'STOCK'
  | 'PROFIT_LOSS'
  | 'DEBIT_CREDIT_NOTES';

function getDefaultPeriod(financialYearStart?: string): { start: string; end: string } {
  const fyStart = financialYearStart && /^\d{4}-\d{2}-\d{2}$/.test(financialYearStart)
    ? financialYearStart
    : `${new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1}-04-01`;
  const fyStartYear = parseInt(fyStart.slice(0, 4), 10) || new Date().getFullYear();
  const fyEnd = `${fyStartYear + 1}-03-31`;
  return { start: fyStart, end: fyEnd };
}

function isWithinPeriod(dateStr: string | undefined, start: string, end: string): boolean {
  if (!start && !end) return true;
  if (!dateStr) return false;
  const cleanDate = dateStr.slice(0, 10);
  if (start && cleanDate < start) return false;
  if (end && cleanDate > end) return false;
  return true;
}

export const MISReports: React.FC<MISReportsProps> = ({ data: activeFyData, masterData, activeFyLabel, activePeriodStart, activePeriodEnd, isHindi, onOpenDebitCreditNoteModal, activeUserRole = 'ADMIN', permissions }) => {
  const effectiveRole = normalizeUserRole(activeUserRole);
  const perms = permissions || getRolePermissions(effectiveRole);
  const fullSource = masterData || activeFyData;

  const availableFysAsc = useMemo(
    () =>
      getAvailableFinancialYears(fullSource)
        .filter((f) => f.fyStart !== ALL_FINANCIAL_YEARS)
        .slice()
        .sort((a, b) => a.fyStart.localeCompare(b.fyStart)),
    [fullSource]
  );

  const activeFyStartClean =
    activeFyData.company.financialYearStart && activeFyData.company.financialYearStart !== ALL_FINANCIAL_YEARS
      ? activeFyData.company.financialYearStart
      : getCurrentFinancialYearStart();

  const [fyScope, setFyScope] = useState<'ACTIVE_FY' | 'FY_RANGE'>('ACTIVE_FY');
  const [fromFyStart, setFromFyStart] = useState<string>(() => availableFysAsc[0]?.fyStart || activeFyStartClean);
  const [toFyStart, setToFyStart] = useState<string>(() => activeFyStartClean);

  useEffect(() => {
    setToFyStart(activeFyStartClean);
  }, [activeFyStartClean]);

  const fyRangeInfo = useMemo(() => {
    if (fyScope !== 'FY_RANGE') return null;
    return filterAppDataByFYRange(fullSource, fromFyStart, toFyStart);
  }, [fyScope, fullSource, fromFyStart, toFyStart]);

  const data = useMemo(() => {
    if (fyScope === 'FY_RANGE' && fyRangeInfo) return fyRangeInfo.filtered;
    return activeFyData;
  }, [fyScope, fyRangeInfo, activeFyData]);

  const defaultPeriod = useMemo(() => {
    if (fyScope === 'FY_RANGE' && fyRangeInfo) {
      return { start: fyRangeInfo.fromRange.fyStart, end: fyRangeInfo.toRange.fyEnd };
    }
    if (activePeriodStart && activePeriodEnd && /^\d{4}-\d{2}-\d{2}$/.test(activePeriodStart) && /^\d{4}-\d{2}-\d{2}$/.test(activePeriodEnd)) {
      return { start: activePeriodStart, end: activePeriodEnd };
    }
    return getDefaultPeriod(activeFyData.company.financialYearStart);
  }, [fyScope, fyRangeInfo, activePeriodStart, activePeriodEnd, activeFyData.company.financialYearStart]);

  const [activeReport, setActiveReport] = useState<MISReportType>('SALES');
  const [outstandingSubTab, setOutstandingSubTab] = useState<'PARTY_WISE' | 'BILL_WISE'>('PARTY_WISE');
  const periodStartInputRef = useRef<HTMLInputElement>(null);

  // Draft dates (what user edits in the inputs) vs Applied dates (applied on OK or preset click)
  const [draftStartDate, setDraftStartDate] = useState<string>(defaultPeriod.start);
  const [draftEndDate, setDraftEndDate] = useState<string>(defaultPeriod.end);
  const [startDate, setStartDate] = useState<string>(defaultPeriod.start);
  const [endDate, setEndDate] = useState<string>(defaultPeriod.end);
  const [periodAppliedNotice, setPeriodAppliedNotice] = useState<boolean>(false);

  useEffect(() => {
    setDraftStartDate(defaultPeriod.start);
    setDraftEndDate(defaultPeriod.end);
    setStartDate(defaultPeriod.start);
    setEndDate(defaultPeriod.end);
  }, [defaultPeriod.start, defaultPeriod.end]);

  // Alt+1..8 Report Switching & F2 Focus Period
  useEffect(() => {
    const misOrder: MISReportType[] = [
      'SALES', 'PURCHASE', 'DAYBOOK', 'OUTSTANDING', 'GST', 'STOCK', 'PROFIT_LOSS', 'DEBIT_CREDIT_NOTES'
    ];
    const handleSubTab = (ev: Event) => {
      const idx = (ev as CustomEvent<{ index: number }>).detail?.index;
      if (typeof idx === 'number' && idx >= 1 && idx <= misOrder.length) {
        setActiveReport(misOrder[idx - 1]);
      }
    };
    const handleOpenPeriod = () => {
      periodStartInputRef.current?.focus();
    };
    window.addEventListener('hisabveda:subtab', handleSubTab);
    window.addEventListener('hisabveda:open-period', handleOpenPeriod);
    return () => {
      window.removeEventListener('hisabveda:subtab', handleSubTab);
      window.removeEventListener('hisabveda:open-period', handleOpenPeriod);
    };
  }, []);

  const [search, setSearch] = useState<string>('');
  const [selectedLedgerTarget, setSelectedLedgerTarget] = useState<{ id?: string; name?: string; preferredKind?: 'ACCOUNT' | 'PARTY' } | null>(null);
  const [detailModalPayload, setDetailModalPayload] = useState<FinancialDetailPayload | null>(null);

  const company = data.company;
  const currency = company.currency;
  const cleanSearch = search.trim().toLowerCase();

  const hasPendingDateChanges = draftStartDate !== startDate || draftEndDate !== endDate;

  const triggerAppliedNotice = () => {
    setPeriodAppliedNotice(true);
    setTimeout(() => setPeriodAppliedNotice(false), 2200);
  };

  const handleApplyPeriod = () => {
    let s = draftStartDate;
    let e = draftEndDate;
    if (s && e && s > e) {
      [s, e] = [e, s];
      setDraftStartDate(s);
      setDraftEndDate(e);
    }
    setStartDate(s);
    setEndDate(e);
    triggerAppliedNotice();
  };

  const applyPresetPeriod = (preset: 'FULL_FY' | 'THIS_MONTH' | 'LAST_MONTH') => {
    const now = new Date();
    let s = '';
    let e = '';
    if (preset === 'FULL_FY') {
      setFyScope('ACTIVE_FY');
      const fyDef = getDefaultPeriod(activeFyData.company.financialYearStart);
      s = fyDef.start;
      e = fyDef.end;
    } else if (preset === 'THIS_MONTH') {
      const y = now.getFullYear();
      const m = now.getMonth();
      s = new Date(y, m, 1).toISOString().split('T')[0];
      e = new Date(y, m + 1, 0).toISOString().split('T')[0];
    } else if (preset === 'LAST_MONTH') {
      const y = now.getFullYear();
      const m = now.getMonth() - 1;
      s = new Date(y, m, 1).toISOString().split('T')[0];
      e = new Date(y, m + 1, 0).toISOString().split('T')[0];
    }
    setDraftStartDate(s);
    setDraftEndDate(e);
    setStartDate(s);
    setEndDate(e);
    triggerAppliedNotice();
  };

  const activeFyRangeBadge = fyScope === 'FY_RANGE' && fyRangeInfo
    ? fyRangeInfo.rangeLabel
    : (activeFyLabel ? `FY ${activeFyLabel}` : getFinancialYearRange(activeFyData.company.financialYearStart).label);

  const periodLabel = !startDate && !endDate
    ? activeFyRangeBadge
    : `${startDate || '...'} ${isHindi ? 'से' : 'to'} ${endDate || '...'}`;

  // Helper: Export to Excel / CSV
  const exportToExcel = (filename: string, headers: string[], rows: (string | number)[][]) => {
    let csvContent = '\uFEFF';
    csvContent += headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(',') + '\n';

    rows.forEach(row => {
      const line = row.map(val => {
        const str = String(val ?? '');
        return `"${str.replace(/"/g, '""')}"`;
      }).join(',');
      csvContent += line + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Helper: Print / Export PDF
  const handlePrintReport = (title: string, tableHtml: string, summaryHtml: string = '') => {
    const compName = company.name?.trim() || 'Hisabveda ERP Workspace';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title} - ${compName}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #1e293b; }
            .header { border-bottom: 2px solid #0284c7; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .company-title { font-size: 20px; font-weight: bold; color: #0f172a; margin: 0; }
            .company-sub { font-size: 11px; color: #64748b; margin-top: 4px; }
            .report-title { font-size: 16px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-top: 10px; }
            .meta { font-size: 11px; color: #475569; margin-top: 4px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th { background-color: #f1f5f9; color: #334155; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #cbd5e1; }
            td { padding: 8px; border: 1px solid #e2e8f0; }
            tr:nth-child(even) { background-color: #f8fafc; }
            tfoot td { background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #94a3b8; }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            .summary-box { background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-top: 20px; font-size: 12px; }
            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="company-title">${compName}</h1>
              <div class="company-sub">${company.address || ''} ${company.gstin ? `| GSTIN: ${company.gstin}` : ''} ${company.phone ? `| Phone: ${company.phone}` : ''}</div>
              <div class="report-title">${title}</div>
            </div>
            <div class="text-right">
              <div class="meta"><b>Period:</b> ${periodLabel}</div>
              <div class="meta"><b>Generated On:</b> ${new Date().toLocaleString()}</div>
            </div>
          </div>

          ${tableHtml}
          ${summaryHtml}

          <div class="footer">
            <span>Generated by Hisabveda ERP Software</span>
            <span>Authorized Signatory & Stamp</span>
          </div>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;

    printHtmlDocument(html);
  };

  // ============================================================================
  // FILTERED DATASETS (Respecting Applied Period + Search across ALL 8 reports)
  // ============================================================================
  const salesInvoices = useMemo(() => {
    return (data.invoices || [])
      .filter(inv => {
        const inDate = isWithinPeriod(inv.date, startDate, endDate);
        const inSearch = !cleanSearch ||
          inv.invoiceNumber.toLowerCase().includes(cleanSearch) ||
          (inv.partyName || '').toLowerCase().includes(cleanSearch) ||
          (inv.partyGstin || '').toLowerCase().includes(cleanSearch) ||
          (inv.invoiceType || '').toLowerCase().includes(cleanSearch);
        return inDate && inSearch;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data.invoices, startDate, endDate, cleanSearch]);

  const purchaseInvoices = useMemo(() => {
    return (data.purchaseInvoices || [])
      .filter(pur => {
        const inDate = isWithinPeriod(pur.date, startDate, endDate);
        const inSearch = !cleanSearch ||
          pur.billNumber.toLowerCase().includes(cleanSearch) ||
          (pur.supplierInvoiceNo || '').toLowerCase().includes(cleanSearch) ||
          (pur.partyName || '').toLowerCase().includes(cleanSearch) ||
          (pur.partyGstin || '').toLowerCase().includes(cleanSearch);
        return inDate && inSearch;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data.purchaseInvoices, startDate, endDate, cleanSearch]);

  const daybookVouchers = useMemo(() => {
    return (data.vouchers || [])
      .filter(vch => {
        const inDate = isWithinPeriod(vch.date, startDate, endDate);
        const entriesText = (vch.entries || []).map(e => e.accountName).join(' ').toLowerCase();
        const inSearch = !cleanSearch ||
          vch.voucherNumber.toLowerCase().includes(cleanSearch) ||
          vch.type.toLowerCase().includes(cleanSearch) ||
          (vch.narration || '').toLowerCase().includes(cleanSearch) ||
          (vch.partyName || '').toLowerCase().includes(cleanSearch) ||
          (vch.referenceNo || '').toLowerCase().includes(cleanSearch) ||
          entriesText.includes(cleanSearch);
        return inDate && inSearch;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data.vouchers, startDate, endDate, cleanSearch]);

  const daybookEntries = useMemo(() => {
    type DaybookRow = {
      id: string;
      docNumber: string;
      typeLabel: string;
      date: string;
      partyId?: string;
      partyName?: string;
      referenceNo?: string;
      narration: string;
      accountSummary: Array<{ side: 'Dr' | 'Cr'; name: string }>;
      amount: number;
      cashInflow: number;
      cashOutflow: number;
      voucherKind: 'VOUCHER' | 'SALES' | 'PURCHASE';
      record: any;
    };

    const rows: DaybookRow[] = [];

    for (const vch of daybookVouchers) {
      if ((vch as any).isOptional || (vch as any).isCancelled) continue;
      rows.push({
        id: `vch_${vch.id}`,
        docNumber: vch.voucherNumber,
        typeLabel: vch.type,
        date: vch.date,
        partyId: vch.partyId,
        partyName: vch.partyName,
        referenceNo: vch.referenceNo,
        narration: vch.narration || '-',
        accountSummary: (vch.entries || []).slice(0, 3).map(e => ({
          side: e.debit > 0 ? 'Dr' : 'Cr',
          name: e.accountName,
        })),
        amount: vch.totalAmount || 0,
        cashInflow: vch.type === 'RECEIPT' ? (vch.totalAmount || 0) : 0,
        cashOutflow: vch.type === 'PAYMENT' ? (vch.totalAmount || 0) : 0,
        voucherKind: 'VOUCHER',
        record: vch,
      });
    }

    for (const inv of salesInvoices) {
      if (inv.status === 'CANCELLED') continue;
      const settlement = resolveSalesInvoiceSettlement(data, inv);
      const settledCashBank = settlement.legs.reduce((s, l) => s + l.amount, 0);
      const summary: Array<{ side: 'Dr' | 'Cr'; name: string }> = [
        ...settlement.legs.map(l => ({ side: 'Dr' as const, name: `${l.account.name} (${l.modeLabel})` })),
        ...(settlement.debtorsAmount > 0.01 ? [{ side: 'Dr' as const, name: `${inv.partyName || 'Debtors'}` }] : []),
        { side: 'Cr' as const, name: 'Sales Account' },
      ];
      rows.push({
        id: `sal_${inv.id}`,
        docNumber: inv.invoiceNumber,
        typeLabel: inv.isPosSale ? 'POS_SALE' : 'SALES',
        date: inv.date,
        partyId: inv.partyId,
        partyName: inv.partyName,
        narration: `${inv.isPosSale ? 'POS Sale' : 'Sales Invoice'}${settledCashBank > 0 ? ` • Paid ${formatCurrency(settledCashBank, currency)}` : ' • Credit'}`,
        accountSummary: summary.slice(0, 3),
        amount: inv.grandTotal || 0,
        cashInflow: settledCashBank,
        cashOutflow: 0,
        voucherKind: 'SALES',
        record: inv,
      });
    }

    for (const pur of purchaseInvoices) {
      if (pur.status === 'CANCELLED') continue;
      const settlement = resolvePurchaseBillSettlement(data, pur);
      const settledCashBank = settlement.legs.reduce((s, l) => s + l.amount, 0);
      const summary: Array<{ side: 'Dr' | 'Cr'; name: string }> = [
        { side: 'Dr' as const, name: 'Purchase Account' },
        ...settlement.legs.map(l => ({ side: 'Cr' as const, name: `${l.account.name} (${l.modeLabel})` })),
        ...(settlement.creditorsAmount > 0.01 ? [{ side: 'Cr' as const, name: `${pur.partyName || 'Creditors'}` }] : []),
      ];
      rows.push({
        id: `pur_${pur.id}`,
        docNumber: pur.billNumber,
        typeLabel: 'PURCHASE',
        date: pur.date,
        partyId: pur.partyId,
        partyName: pur.partyName,
        referenceNo: pur.supplierInvoiceNo,
        narration: `Purchase Bill${settledCashBank > 0 ? ` • Paid ${formatCurrency(settledCashBank, currency)}` : ' • Credit'}`,
        accountSummary: summary.slice(0, 3),
        amount: pur.grandTotal || 0,
        cashInflow: 0,
        cashOutflow: settledCashBank,
        voucherKind: 'PURCHASE',
        record: pur,
      });
    }

    return rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [daybookVouchers, salesInvoices, purchaseInvoices, data, currency]);

  const debitCreditNotes = useMemo(() => {
    return (data.debitCreditNotes || [])
      .filter(dcn => {
        const inDate = isWithinPeriod(dcn.date, startDate, endDate);
        const inSearch = !cleanSearch ||
          dcn.noteNumber.toLowerCase().includes(cleanSearch) ||
          dcn.type.toLowerCase().includes(cleanSearch) ||
          (dcn.partyName || '').toLowerCase().includes(cleanSearch) ||
          (dcn.reason || '').toLowerCase().includes(cleanSearch) ||
          (dcn.originalInvoiceNo || '').toLowerCase().includes(cleanSearch);
        return inDate && inSearch;
      })
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data.debitCreditNotes, startDate, endDate, cleanSearch]);

  const filteredParties = useMemo(() => {
    return (data.parties || []).filter(p => {
      if (!cleanSearch) return true;
      return (
        p.name.toLowerCase().includes(cleanSearch) ||
        (p.code || '').toLowerCase().includes(cleanSearch) ||
        (p.gstin || '').toLowerCase().includes(cleanSearch) ||
        (p.phone || '').toLowerCase().includes(cleanSearch) ||
        p.type.toLowerCase().includes(cleanSearch)
      );
    });
  }, [data.parties, cleanSearch]);

  const pendingBills = useMemo(() => {
    const salesPending = (data.invoices || [])
      .filter(inv => inv.status !== 'CANCELLED' && (inv.grandTotal - (inv.amountPaid || 0)) > 0.01)
      .filter(inv => isWithinPeriod(inv.date, startDate, endDate))
      .filter(inv =>
        !cleanSearch ||
        inv.invoiceNumber.toLowerCase().includes(cleanSearch) ||
        (inv.partyName || '').toLowerCase().includes(cleanSearch)
      )
      .map(inv => ({
        id: `s_${inv.id}`,
        docNumber: inv.invoiceNumber,
        date: inv.date,
        partyId: inv.partyId,
        partyName: inv.partyName,
        kind: 'RECEIVABLE' as const,
        typeLabel: inv.invoiceType || 'SALES_INVOICE',
        grandTotal: inv.grandTotal,
        amountPaid: inv.amountPaid || 0,
        pending: inv.grandTotal - (inv.amountPaid || 0)
      }));

    const purchasePending = (data.purchaseInvoices || [])
      .filter(pur => pur.status !== 'CANCELLED' && (pur.grandTotal - (pur.amountPaid || 0)) > 0.01)
      .filter(pur => isWithinPeriod(pur.date, startDate, endDate))
      .filter(pur =>
        !cleanSearch ||
        pur.billNumber.toLowerCase().includes(cleanSearch) ||
        (pur.partyName || '').toLowerCase().includes(cleanSearch)
      )
      .map(pur => ({
        id: `p_${pur.id}`,
        docNumber: pur.billNumber,
        date: pur.date,
        partyId: pur.partyId,
        partyName: pur.partyName,
        kind: 'PAYABLE' as const,
        typeLabel: 'PURCHASE_BILL',
        grandTotal: pur.grandTotal,
        amountPaid: pur.amountPaid || 0,
        pending: pur.grandTotal - (pur.amountPaid || 0)
      }));

    return [...salesPending, ...purchasePending].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }, [data.invoices, data.purchaseInvoices, startDate, endDate, cleanSearch]);

  const filteredItems = useMemo(() => {
    return (data.items || []).filter(item => {
      if (!cleanSearch) return true;
      return (
        item.name.toLowerCase().includes(cleanSearch) ||
        (item.code || '').toLowerCase().includes(cleanSearch) ||
        (item.category || '').toLowerCase().includes(cleanSearch) ||
        (item.hsnSacCode || '').toLowerCase().includes(cleanSearch) ||
        (item.location || '').toLowerCase().includes(cleanSearch)
      );
    });
  }, [data.items, cleanSearch]);

  // ============================================================================
  // GST SUMMARY BREAKDOWN (Period + Debit/Credit Notes adjusted)
  // ============================================================================
  const gstStats = useMemo(() => {
    const activeSales = salesInvoices.filter(i => i.status !== 'CANCELLED');
    const activePurchases = purchaseInvoices.filter(p => p.status !== 'CANCELLED');
    const creditNotes = debitCreditNotes.filter(n => n.type === 'CREDIT_NOTE');
    const debitNotes = debitCreditNotes.filter(n => n.type === 'DEBIT_NOTE');

    const outCgst = activeSales.reduce((s, i) => s + (i.cgstAmount || 0), 0) - creditNotes.reduce((s, n) => s + (n.cgstAmount || 0), 0);
    const outSgst = activeSales.reduce((s, i) => s + (i.sgstAmount || 0), 0) - creditNotes.reduce((s, n) => s + (n.sgstAmount || 0), 0);
    const outIgst = activeSales.reduce((s, i) => s + (i.igstAmount || 0), 0) - creditNotes.reduce((s, n) => s + (n.igstAmount || 0), 0);
    const totalOutTax = outCgst + outSgst + outIgst;
    const totalOutTaxable = activeSales.reduce((s, i) => s + (i.subtotal - (i.totalDiscount || 0)), 0) - creditNotes.reduce((s, n) => s + n.subtotal, 0);

    const inCgst = activePurchases.reduce((s, p) => s + (p.cgstAmount || 0), 0) - debitNotes.reduce((s, n) => s + (n.cgstAmount || 0), 0);
    const inSgst = activePurchases.reduce((s, p) => s + (p.sgstAmount || 0), 0) - debitNotes.reduce((s, n) => s + (n.sgstAmount || 0), 0);
    const inIgst = activePurchases.reduce((s, p) => s + (p.igstAmount || 0), 0) - debitNotes.reduce((s, n) => s + (n.igstAmount || 0), 0);
    const totalInTax = inCgst + inSgst + inIgst;
    const totalInTaxable = activePurchases.reduce((s, p) => s + (p.subtotal - (p.totalDiscount || 0)), 0) - debitNotes.reduce((s, n) => s + n.subtotal, 0);

    const registerRows = [
      ...activeSales.map(inv => ({
        id: `gs_${inv.id}`,
        sourceKind: 'SALES' as const,
        sourceRecord: inv as SalesInvoice,
        docNo: inv.invoiceNumber,
        date: inv.date,
        supplyType: 'GSTR-1 OUTWARD',
        partyName: inv.partyName,
        gstin: inv.partyGstin || '-',
        taxable: inv.subtotal - (inv.totalDiscount || 0),
        cgst: inv.cgstAmount || 0,
        sgst: inv.sgstAmount || 0,
        igst: inv.igstAmount || 0,
        totalTax: inv.totalTax || 0,
        grandTotal: inv.grandTotal
      })),
      ...activePurchases.map(pur => ({
        id: `gp_${pur.id}`,
        sourceKind: 'PURCHASE' as const,
        sourceRecord: pur as PurchaseInvoice,
        docNo: pur.billNumber,
        date: pur.date,
        supplyType: 'GSTR-2/3B ITC INWARD',
        partyName: pur.partyName,
        gstin: pur.partyGstin || '-',
        taxable: pur.subtotal - (pur.totalDiscount || 0),
        cgst: pur.cgstAmount || 0,
        sgst: pur.sgstAmount || 0,
        igst: pur.igstAmount || 0,
        totalTax: pur.totalTax || 0,
        grandTotal: pur.grandTotal
      }))
    ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return {
      outCgst, outSgst, outIgst, totalOutTax, totalOutTaxable,
      inCgst, inSgst, inIgst, totalInTax, totalInTaxable,
      netCgst: outCgst - inCgst,
      netSgst: outSgst - inSgst,
      netIgst: outIgst - inIgst,
      netTaxPayable: Math.max(0, totalOutTax - totalInTax),
      itcCarryForward: Math.max(0, totalInTax - totalOutTax),
      registerRows
    };
  }, [salesInvoices, purchaseInvoices, debitCreditNotes]);

  // ============================================================================
  // PROFIT & LOSS SUMMARY (Period Invoices + Purchases + Extra Direct Ledgers + Vouchers + Stock)
  // ============================================================================
  const plStats = useMemo(() => {
    const activeSales = salesInvoices.filter(i => i.status !== 'CANCELLED');
    const activePurchases = purchaseInvoices.filter(p => p.status !== 'CANCELLED');
    const creditNotes = debitCreditNotes.filter(n => n.type === 'CREDIT_NOTE');
    const debitNotes = debitCreditNotes.filter(n => n.type === 'DEBIT_NOTE');

    const allMergedAccounts = mergeAccountsWithBalancesMap(data, calculateAccountBalances(data));
    const accountsById = new Map<string, Account>(allMergedAccounts.map(a => [a.id, a]));
    const fallbackSalesAcc: Account = accountsById.get('acc_sales') || {
      id: 'acc_sales',
      code: '4010',
      name: 'Sales Account - Goods',
      category: 'REVENUE',
      subCategory: 'Direct Revenue',
      openingBalance: 0,
      balanceType: 'CR',
    };
    const fallbackPurAcc: Account = accountsById.get('acc_cogs') || {
      id: 'acc_cogs',
      code: '5010',
      name: 'Purchase Account / COGS',
      category: 'EXPENSE',
      subCategory: 'Direct Expenses',
      openingBalance: 0,
      balanceType: 'DR',
    };

    const salesBreakdownMap = new Map<string, { account: Account; dr: number; cr: number }>();
    const directExpenseBreakdownMap = new Map<string, { account: Account; dr: number; cr: number }>();
    const expenseBreakdownMap = new Map<string, { account: Account; dr: number; cr: number }>();
    const otherIncomeBreakdownMap = new Map<string, { account: Account; dr: number; cr: number }>();

    const addToBucket = (
      targetMap: Map<string, { account: Account; dr: number; cr: number }>,
      acc: Account,
      dr: number,
      cr: number
    ) => {
      const cur = targetMap.get(acc.id) || { account: acc, dr: 0, cr: 0 };
      cur.dr += dr;
      cur.cr += cr;
      targetMap.set(acc.id, cur);
    };

    const routeExtraLines = (
      lines: Array<{ accountId: string; accountName?: string; debit?: number; credit?: number }> | undefined,
      defaultDebitExp = true
    ) => {
      if (!lines || lines.length === 0) return;
      for (const el of lines) {
        if (!el.accountId) continue;
        const dr = el.debit || 0;
        const cr = el.credit || 0;
        if (Math.abs(dr) < 0.001 && Math.abs(cr) < 0.001) continue;
        const acc = accountsById.get(el.accountId) || {
          id: el.accountId,
          code: '9998',
          name: el.accountName || el.accountId,
          category: defaultDebitExp ? 'EXPENSE' : 'REVENUE',
          subCategory: defaultDebitExp ? 'Direct Expenses' : 'Indirect Revenue',
          openingBalance: 0,
          balanceType: defaultDebitExp ? 'DR' : 'CR',
        };
        const effCat = getEffectiveAccountCategory(acc, data.accountGroups);
        if (effCat === 'REVENUE') {
          if (isDirectRevenueLedger(acc, data.accountGroups)) addToBucket(salesBreakdownMap, acc, dr, cr);
          else addToBucket(otherIncomeBreakdownMap, acc, dr, cr);
        } else if (effCat === 'EXPENSE') {
          if (isDirectExpenseLedger(acc, data.accountGroups)) addToBucket(directExpenseBreakdownMap, acc, dr, cr);
          else addToBucket(expenseBreakdownMap, acc, dr, cr);
        }
      }
    };

    for (const inv of activeSales) {
      const netBase = inv.subtotal - (inv.totalDiscount || 0);
      const targetAcc = (inv.primaryAccountId && accountsById.get(inv.primaryAccountId)) || fallbackSalesAcc;
      addToBucket(salesBreakdownMap, targetAcc, 0, netBase);
      if (inv.roundOff && Math.abs(inv.roundOff) > 0.001) {
        const roundAcc = accountsById.get('acc_round_off') || {
          id: 'acc_round_off',
          code: '5990',
          name: 'Round Off Account (राउंड ऑफ)',
          category: 'EXPENSE',
          subCategory: 'Indirect Expenses',
          openingBalance: 0,
          balanceType: 'DR',
        };
        addToBucket(expenseBreakdownMap, roundAcc, inv.roundOff < 0 ? Math.abs(inv.roundOff) : 0, inv.roundOff > 0 ? inv.roundOff : 0);
      }
      routeExtraLines(inv.extraLedgerLines, false);
    }

    for (const cn of creditNotes) {
      const targetAcc = (cn.primaryAccountId && accountsById.get(cn.primaryAccountId)) || fallbackSalesAcc;
      addToBucket(salesBreakdownMap, targetAcc, cn.subtotal || 0, 0);
      routeExtraLines(cn.extraLedgerLines, false);
    }

    for (const pur of activePurchases) {
      const netBase = pur.subtotal - (pur.totalDiscount || 0);
      const targetAcc = (pur.primaryAccountId && accountsById.get(pur.primaryAccountId)) || fallbackPurAcc;
      addToBucket(directExpenseBreakdownMap, targetAcc, netBase, 0);
      if (pur.roundOff && Math.abs(pur.roundOff) > 0.001) {
        const roundAcc = accountsById.get('acc_round_off') || {
          id: 'acc_round_off',
          code: '5990',
          name: 'Round Off Account (राउंड ऑफ)',
          category: 'EXPENSE',
          subCategory: 'Indirect Expenses',
          openingBalance: 0,
          balanceType: 'DR',
        };
        addToBucket(expenseBreakdownMap, roundAcc, pur.roundOff > 0 ? pur.roundOff : 0, pur.roundOff < 0 ? Math.abs(pur.roundOff) : 0);
      }
      routeExtraLines(pur.extraLedgerLines, true);
    }

    for (const dn of debitNotes) {
      const targetAcc = (dn.primaryAccountId && accountsById.get(dn.primaryAccountId)) || fallbackPurAcc;
      addToBucket(directExpenseBreakdownMap, targetAcc, 0, dn.subtotal || 0);
      routeExtraLines(dn.extraLedgerLines, true);
    }

    for (const vch of daybookVouchers) {
      for (const line of vch.entries || []) {
        const acc = accountsById.get(line.accountId);
        if (!acc) continue;
        const dr = line.debit || 0;
        const cr = line.credit || 0;
        if (Math.abs(dr - cr) < 0.001) continue;
        const effCat = getEffectiveAccountCategory(acc, data.accountGroups);
        if (effCat === 'EXPENSE') {
          if (isDirectExpenseLedger(acc, data.accountGroups)) addToBucket(directExpenseBreakdownMap, acc, dr, cr);
          else addToBucket(expenseBreakdownMap, acc, dr, cr);
        } else if (effCat === 'REVENUE') {
          if (isDirectRevenueLedger(acc, data.accountGroups)) addToBucket(salesBreakdownMap, acc, dr, cr);
          else addToBucket(otherIncomeBreakdownMap, acc, dr, cr);
        }
      }
    }

    const toItemList = (m: Map<string, { account: Account; dr: number; cr: number }>, creditPositive: boolean) =>
      Array.from(m.values())
        .map(({ account, dr, cr }) => {
          const amount = creditPositive ? cr - dr : dr - cr;
          const row: FinancialGroupLedgerRow = {
            account,
            openingDr: 0,
            openingCr: 0,
            periodDr: Math.round(dr * 100) / 100,
            periodCr: Math.round(cr * 100) / 100,
            closingDr: dr >= cr ? Math.round((dr - cr) * 100) / 100 : 0,
            closingCr: cr > dr ? Math.round((cr - dr) * 100) / 100 : 0,
            signedAmount: Math.round(amount * 100) / 100,
          };
          return { id: account.id, name: account.name, code: account.code, amount: Math.round(amount * 100) / 100, account, row };
        })
        .filter(x => Math.abs(x.amount) > 0.005)
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

    const salesItems = toItemList(salesBreakdownMap, true);
    const directExpenseItems = toItemList(directExpenseBreakdownMap, false);
    const expenseItems = toItemList(expenseBreakdownMap, false);
    const otherIncomeItems = toItemList(otherIncomeBreakdownMap, true);

    const grossSales = salesItems.reduce((s, x) => s + x.amount, 0);
    const totalPurchases = directExpenseItems.reduce((s, x) => s + x.amount, 0);
    const totalVoucherExpenses = expenseItems.reduce((s, e) => s + e.amount, 0);
    const totalOtherIncome = otherIncomeItems.reduce((s, i) => s + i.amount, 0);

    const openingStock = getEffectiveOpeningStock(data);
    const closingStock = calculateClosingStock(data);

    const cogsAdjusted = Math.max(0, totalPurchases + openingStock - closingStock);
    const grossProfit = (grossSales + closingStock) - (totalPurchases + openingStock);
    const netProfit = (grossProfit + totalOtherIncome) - totalVoucherExpenses;

    return {
      grossSales,
      totalPurchases,
      openingStock,
      closingStock,
      cogsAdjusted,
      grossProfit,
      salesItems,
      directExpenseItems,
      expenseItems,
      otherIncomeItems,
      totalVoucherExpenses,
      totalOtherIncome,
      netProfit
    };
  }, [salesInvoices, purchaseInvoices, debitCreditNotes, daybookVouchers, data]);

  // ============================================================================
  // EXCEL EXPORTS FOR ALL 8 REPORTS
  // ============================================================================
  const handleExportActiveExcel = () => {
    if (activeReport === 'SALES') {
      const headers = ['Invoice No', 'Date', 'Type', 'Party Name', 'GSTIN', 'Taxable Subtotal', 'CGST', 'SGST', 'IGST', 'Grand Total', 'Amount Paid', 'Status'];
      const rows = salesInvoices.map(inv => [
        inv.invoiceNumber, inv.date, inv.invoiceType, inv.partyName, inv.partyGstin || '',
        inv.subtotal, inv.cgstAmount, inv.sgstAmount, inv.igstAmount, inv.grandTotal, inv.amountPaid, inv.status
      ]);
      exportToExcel('Sales_Register_Report', headers, rows);
    } else if (activeReport === 'PURCHASE') {
      const headers = ['Bill No', 'Supplier Inv No', 'Date', 'Party Name', 'GSTIN', 'Subtotal', 'Tax Amount', 'Grand Total', 'Paid Amount', 'Status'];
      const rows = purchaseInvoices.map(pur => [
        pur.billNumber, pur.supplierInvoiceNo || '', pur.date, pur.partyName, pur.partyGstin || '',
        pur.subtotal, pur.totalTax, pur.grandTotal, pur.amountPaid, pur.status
      ]);
      exportToExcel('Purchase_Register_Report', headers, rows);
    } else if (activeReport === 'DAYBOOK') {
      const headers = ['Voucher / Doc No', 'Type', 'Date', 'Party / Reference', 'Ledgers', 'Narration', 'Amount'];
      const rows = daybookEntries.map(row => [
        row.docNumber, row.typeLabel, row.date, row.partyName || row.referenceNo || '',
        row.accountSummary.map(e => `${e.side} ${e.name}`).join(' | '),
        row.narration, row.amount
      ]);
      exportToExcel('Daybook_Report', headers, rows);
    } else if (activeReport === 'OUTSTANDING') {
      if (outstandingSubTab === 'PARTY_WISE') {
        const headers = ['Party Name', 'Type', 'GSTIN', 'Phone', 'Opening Balance', 'Total Invoiced', 'Total Paid', 'Current Outstanding', 'Balance Type'];
        const rows = filteredParties.map(p => {
          const out = calculatePartyOutstanding(p, data);
          return [
            p.name, p.type, p.gstin || '', p.phone || '',
            `${p.openingBalance} ${p.balanceType}`, out.totalInvoiced, out.totalPaid, out.netBalance, out.balanceType
          ];
        });
        exportToExcel('Party_Outstanding_Report', headers, rows);
      } else {
        const headers = ['Doc No', 'Date', 'Kind', 'Type', 'Party Name', 'Bill Amount', 'Paid', 'Pending Amount'];
        const rows = pendingBills.map(b => [
          b.docNumber, b.date, b.kind, b.typeLabel, b.partyName, b.grandTotal, b.amountPaid, b.pending
        ]);
        exportToExcel('Bill_Wise_Pending_Report', headers, rows);
      }
    } else if (activeReport === 'GST') {
      const headers = ['Doc No', 'Date', 'Return Section', 'Party Name', 'GSTIN', 'Taxable Value', 'CGST', 'SGST', 'IGST', 'Total Tax', 'Invoice Total'];
      const rows = gstStats.registerRows.map(r => [
        r.docNo, r.date, r.supplyType, r.partyName, r.gstin, r.taxable, r.cgst, r.sgst, r.igst, r.totalTax, r.grandTotal
      ]);
      exportToExcel('GST_Returns_Summary_Report', headers, rows);
    } else if (activeReport === 'STOCK') {
      const headers = ['Item Code', 'Item Name', 'Category', 'HSN/SAC', 'Current Stock', 'Unit', 'Purchase Rate', 'Sales Rate', 'Cost Valuation', 'Sales Valuation'];
      const rows = filteredItems.map(it => [
        it.code, it.name, it.category || 'General', it.hsnSacCode || '',
        it.currentStock, it.unit, it.purchasePrice, it.salesPrice,
        getItemClosingStockValue(it), it.currentStock * it.salesPrice
      ]);
      exportToExcel('Stock_Inventory_Valuation_Report', headers, rows);
    } else if (activeReport === 'PROFIT_LOSS') {
      const headers = ['Particulars', 'Category', 'Amount'];
      const rows: (string | number)[][] = [
        ['Total Sales & Direct Revenues (Net)', 'INCOME', plStats.grossSales],
        ...plStats.otherIncomeItems.map(i => [i.name, 'INDIRECT INCOME', i.amount]),
        ['Opening Stock', 'TRADING', plStats.openingStock],
        ['Total Direct Expenses & Purchases (Net)', 'COGS', plStats.totalPurchases],
        ['Closing Stock', 'TRADING', plStats.closingStock],
        ['Gross Profit / Loss', 'SUMMARY', plStats.grossProfit],
        ...plStats.expenseItems.map(e => [e.name, 'INDIRECT EXPENSE', e.amount]),
        ['Net Profit / Loss', 'SUMMARY', plStats.netProfit]
      ];
      exportToExcel('Profit_And_Loss_Summary', headers, rows);
    } else if (activeReport === 'DEBIT_CREDIT_NOTES') {
      const headers = ['Note No', 'Type', 'Date', 'Party Name', 'Orig Inv No', 'Reason', 'Subtotal', 'Tax', 'Grand Total'];
      const rows = debitCreditNotes.map(dcn => [
        dcn.noteNumber, dcn.type, dcn.date, dcn.partyName, dcn.originalInvoiceNo || '',
        dcn.reason, dcn.subtotal, dcn.totalTax, dcn.grandTotal
      ]);
      exportToExcel('Debit_Credit_Notes_Report', headers, rows);
    }
  };

  // ============================================================================
  // PRINT PDF DISPATCHER FOR ALL 8 REPORTS
  // ============================================================================
  const handlePrintActiveReport = () => {
    if (activeReport === 'SALES') {
      const tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Invoice No</th><th>Date</th><th>Party Name</th><th>GSTIN</th>
              <th class="text-right">Taxable</th><th class="text-right">Tax</th><th class="text-right">Grand Total</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${salesInvoices.map(inv => `
              <tr>
                <td><b>${inv.invoiceNumber}</b></td><td>${inv.date}</td><td>${inv.partyName}</td><td>${inv.partyGstin || '-'}</td>
                <td class="text-right font-mono">${formatCurrency(inv.subtotal, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(inv.totalTax, currency)}</td>
                <td class="text-right font-mono"><b>${formatCurrency(inv.grandTotal, currency)}</b></td>
                <td>${inv.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      const totalSales = salesInvoices.reduce((s, i) => s + i.grandTotal, 0);
      const totalTax = salesInvoices.reduce((s, i) => s + i.totalTax, 0);
      handlePrintReport(
        isHindi ? 'बिक्री रजिस्टर (Sales Register Report)' : 'Sales Register Report',
        tableHtml,
        `<div class="summary-box"><b>Total Invoices:</b> ${salesInvoices.length} | <b>Total Sales:</b> ${formatCurrency(totalSales, currency)} | <b>Output GST:</b> ${formatCurrency(totalTax, currency)}</div>`
      );
    } else if (activeReport === 'PURCHASE') {
      const tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Bill #</th><th>Supplier Inv</th><th>Date</th><th>Vendor Name</th>
              <th class="text-right">Taxable</th><th class="text-right">Input GST</th><th class="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            ${purchaseInvoices.map(p => `
              <tr>
                <td class="font-mono"><b>${p.billNumber}</b></td><td>${p.supplierInvoiceNo || '-'}</td><td>${p.date}</td><td>${p.partyName}</td>
                <td class="text-right font-mono">${formatCurrency(p.subtotal, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(p.totalTax, currency)}</td>
                <td class="text-right font-mono"><b>${formatCurrency(p.grandTotal, currency)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      const totPur = purchaseInvoices.reduce((s, p) => s + p.grandTotal, 0);
      handlePrintReport(
        isHindi ? 'खरीद रजिस्टर (Purchase Register Report)' : 'Purchase Register Report',
        tableHtml,
        `<div class="summary-box"><b>Total Purchases:</b> ${formatCurrency(totPur, currency)} (${purchaseInvoices.length} Bills)</div>`
      );
    } else if (activeReport === 'DAYBOOK') {
      const tableHtml = `
        <table>
          <thead>
            <tr>
              <th>Doc #</th><th>Type</th><th>Date</th><th>Party / Particulars</th><th>Narration</th><th class="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${daybookEntries.map(row => `
              <tr>
                <td class="font-mono"><b>${row.docNumber}</b></td><td><b>${row.typeLabel}</b></td><td>${row.date}</td>
                <td>${row.partyName || row.referenceNo || '-'}</td><td>${row.narration || '-'}</td>
                <td class="text-right font-mono"><b>${formatCurrency(row.amount, currency)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      const totDay = daybookEntries.reduce((s, v) => s + v.amount, 0);
      handlePrintReport(
        isHindi ? 'डे-बुक रजिस्टर (Daybook Register Report)' : 'Daybook Register Report',
        tableHtml,
        `<div class="summary-box"><b>Daybook Total:</b> ${formatCurrency(totDay, currency)} (${daybookEntries.length} Entries)</div>`
      );
    } else if (activeReport === 'OUTSTANDING') {
      const tableHtml = outstandingSubTab === 'PARTY_WISE'
        ? `<table>
            <thead>
              <tr><th>Party Name</th><th>Type</th><th>Phone</th><th class="text-right">Invoiced</th><th class="text-right">Paid/Recd</th><th class="text-right">Balance Due</th></tr>
            </thead>
            <tbody>
              ${filteredParties.map(p => {
                const out = calculatePartyOutstanding(p, data);
                return `<tr>
                  <td><b>${p.name}</b></td><td>${p.type}</td><td>${p.phone || '-'}</td>
                  <td class="text-right font-mono">${formatCurrency(out.totalInvoiced, currency)}</td>
                  <td class="text-right font-mono">${formatCurrency(out.totalPaid, currency)}</td>
                  <td class="text-right font-mono"><b>${formatCurrency(out.netBalance, currency)} ${out.balanceType}</b></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`
        : `<table>
            <thead>
              <tr><th>Doc #</th><th>Date</th><th>Party Name</th><th>Kind</th><th class="text-right">Bill Amt</th><th class="text-right">Paid</th><th class="text-right">Pending</th></tr>
            </thead>
            <tbody>
              ${pendingBills.map(b => `<tr>
                <td class="font-mono"><b>${b.docNumber}</b></td><td>${b.date}</td><td>${b.partyName}</td><td>${b.kind}</td>
                <td class="text-right font-mono">${formatCurrency(b.grandTotal, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(b.amountPaid, currency)}</td>
                <td class="text-right font-mono"><b>${formatCurrency(b.pending, currency)}</b></td>
              </tr>`).join('')}
            </tbody>
          </table>`;
      handlePrintReport(isHindi ? 'पार्टी बकाया रिपोर्ट (Party Outstanding Report)' : 'Party & Bill-Wise Outstanding Report', tableHtml, '');
    } else if (activeReport === 'GST') {
      const tableHtml = `
        <table>
          <thead>
            <tr><th>Doc #</th><th>Date</th><th>Section</th><th>Party</th><th>GSTIN</th><th class="text-right">Taxable</th><th class="text-right">CGST</th><th class="text-right">SGST</th><th class="text-right">IGST</th><th class="text-right">Total Tax</th></tr>
          </thead>
          <tbody>
            ${gstStats.registerRows.map(r => `
              <tr>
                <td class="font-mono"><b>${r.docNo}</b></td><td>${r.date}</td><td>${r.supplyType}</td><td>${r.partyName}</td><td>${r.gstin}</td>
                <td class="text-right font-mono">${formatCurrency(r.taxable, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(r.cgst, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(r.sgst, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(r.igst, currency)}</td>
                <td class="text-right font-mono"><b>${formatCurrency(r.totalTax, currency)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      handlePrintReport(
        isHindi ? 'जीएसटी विवरणी रिपोर्ट (GSTR-1 & 3B Summary)' : 'GST Returns Summary (GSTR-1 & GSTR-3B)',
        tableHtml,
        `<div class="summary-box"><b>Output GST:</b> ${formatCurrency(gstStats.totalOutTax, currency)} | <b>Input ITC:</b> ${formatCurrency(gstStats.totalInTax, currency)} | <b>Net Payable:</b> ${formatCurrency(gstStats.netTaxPayable, currency)}</div>`
      );
    } else if (activeReport === 'STOCK') {
      const tableHtml = `
        <table>
          <thead>
            <tr><th>Code</th><th>Item Name</th><th>Category</th><th class="text-right">Qty</th><th>Unit</th><th class="text-right">Cost Price</th><th class="text-right">Total Valuation</th></tr>
          </thead>
          <tbody>
            ${filteredItems.map(it => `
              <tr>
                <td class="font-mono">${it.code}</td><td><b>${it.name}</b></td><td>${it.category || 'General'}</td>
                <td class="text-right font-mono"><b>${it.currentStock}</b></td><td>${it.unit}</td>
                <td class="text-right font-mono">${formatCurrency(it.purchasePrice, currency)}</td>
                <td class="text-right font-mono"><b>${formatCurrency(getItemClosingStockValue(it), currency)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      const totStock = filteredItems.reduce((s, it) => s + getItemClosingStockValue(it), 0);
      handlePrintReport(
        isHindi ? 'स्टॉक इन्वेंटरी वैल्यूएशन रिपोर्ट' : 'Stock Inventory Valuation Report',
        tableHtml,
        `<div class="summary-box"><b>Total Stock Valuation:</b> ${formatCurrency(totStock, currency)} (${filteredItems.length} Items)</div>`
      );
    } else if (activeReport === 'PROFIT_LOSS') {
      const tableHtml = `
        <table>
          <thead><tr><th>Particulars</th><th>Group</th><th class="text-right">Amount</th></tr></thead>
          <tbody>
            <tr><td><b>Sales & Direct Revenues (Net)</b></td><td>Direct Income</td><td class="text-right font-mono">${formatCurrency(plStats.grossSales, currency)}</td></tr>
            <tr><td>Closing Stock Valuation</td><td>Trading Asset</td><td class="text-right font-mono">${formatCurrency(plStats.closingStock, currency)}</td></tr>
            <tr><td>Opening Stock</td><td>Trading Cost</td><td class="text-right font-mono">${formatCurrency(plStats.openingStock, currency)}</td></tr>
            <tr><td>Direct Expenses & Purchases (Net)</td><td>Direct Cost</td><td class="text-right font-mono">${formatCurrency(plStats.totalPurchases, currency)}</td></tr>
            <tr><td><b>Gross Profit / Loss</b></td><td>Trading Summary</td><td class="text-right font-mono"><b>${formatCurrency(plStats.grossProfit, currency)}</b></td></tr>
            ${plStats.otherIncomeItems.map(i => `<tr><td>${i.name}</td><td>Indirect Income</td><td class="text-right font-mono">${formatCurrency(i.amount, currency)}</td></tr>`).join('')}
            ${plStats.expenseItems.map(e => `<tr><td>${e.name}</td><td>Indirect Expense</td><td class="text-right font-mono">${formatCurrency(e.amount, currency)}</td></tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="2"><b>Net Operating Profit / Loss</b></td><td class="text-right font-mono"><b>${formatCurrency(plStats.netProfit, currency)}</b></td></tr>
          </tfoot>
        </table>`;
      handlePrintReport(isHindi ? 'लाभ-हानि खाता रिपोर्ट (Profit & Loss Statement)' : 'Profit & Loss Statement', tableHtml, '');
    } else if (activeReport === 'DEBIT_CREDIT_NOTES') {
      const tableHtml = `
        <table>
          <thead>
            <tr><th>Note #</th><th>Type</th><th>Date</th><th>Party Name</th><th>Reason</th><th class="text-right">Taxable</th><th class="text-right">Tax</th><th class="text-right">Grand Total</th></tr>
          </thead>
          <tbody>
            ${debitCreditNotes.map(n => `
              <tr>
                <td class="font-mono"><b>${n.noteNumber}</b></td><td>${n.type}</td><td>${n.date}</td><td>${n.partyName}</td><td>${n.reason}</td>
                <td class="text-right font-mono">${formatCurrency(n.subtotal, currency)}</td>
                <td class="text-right font-mono">${formatCurrency(n.totalTax, currency)}</td>
                <td class="text-right font-mono"><b>${formatCurrency(n.grandTotal, currency)}</b></td>
              </tr>
            `).join('')}
          </tbody>
        </table>`;
      const totNotes = debitCreditNotes.reduce((s, n) => s + n.grandTotal, 0);
      handlePrintReport(
        isHindi ? 'डेबिट एवं क्रेडिट नोट रजिस्टर' : 'Debit & Credit Notes Register',
        tableHtml,
        `<div class="summary-box"><b>Total Notes:</b> ${debitCreditNotes.length} | <b>Total Value:</b> ${formatCurrency(totNotes, currency)}</div>`
      );
    }
  };

  const reportTabs = [
    { id: 'SALES' as MISReportType, label: isHindi ? '1. बिक्री रजिस्टर (Sales)' : '1. Sales Register', icon: Receipt },
    { id: 'PURCHASE' as MISReportType, label: isHindi ? '2. खरीद रजिस्टर (Purchase)' : '2. Purchase Register', icon: ShoppingBag },
    { id: 'DAYBOOK' as MISReportType, label: isHindi ? '3. डे बुक (Day Book)' : '3. Day Book & Vouchers', icon: Calendar },
    { id: 'OUTSTANDING' as MISReportType, label: isHindi ? '4. पार्टी बकाया (Outstanding)' : '4. Party Outstanding Aging', icon: Users },
    { id: 'GST' as MISReportType, label: isHindi ? '5. जीएसटी रिपोर्ट (GSTR-1/3B)' : '5. GST Returns Summary', icon: FileCheck2 },
    { id: 'STOCK' as MISReportType, label: isHindi ? '6. स्टॉक स्थिति (Stock Valuation)' : '6. Stock & Inventory', icon: Package },
    { id: 'PROFIT_LOSS' as MISReportType, label: isHindi ? '7. लाभ-हानि खाता (P&L)' : '7. Profit & Loss Summary', icon: PieChart },
    { id: 'DEBIT_CREDIT_NOTES' as MISReportType, label: isHindi ? '8. डेबिट व क्रेडिट नोट' : '8. Debit & Credit Notes', icon: ArrowRightLeft }
  ];

  // Quick KPIs for top strips
  const salesTotalTaxable = salesInvoices.reduce((s, i) => s + i.subtotal, 0);
  const salesTotalTax = salesInvoices.reduce((s, i) => s + i.totalTax, 0);
  const salesGrandTotal = salesInvoices.reduce((s, i) => s + i.grandTotal, 0);
  const salesPaidTotal = salesInvoices.reduce((s, i) => s + (i.amountPaid || 0), 0);

  const purTotalTaxable = purchaseInvoices.reduce((s, p) => s + p.subtotal, 0);
  const purTotalTax = purchaseInvoices.reduce((s, p) => s + p.totalTax, 0);
  const purGrandTotal = purchaseInvoices.reduce((s, p) => s + p.grandTotal, 0);
  const purPaidTotal = purchaseInvoices.reduce((s, p) => s + (p.amountPaid || 0), 0);

  const daybookTotalAmt = daybookEntries.reduce((s, v) => s + (v.amount || 0), 0);
  const daybookReceipts = daybookEntries.reduce((s, v) => s + v.cashInflow, 0);
  const daybookPayments = daybookEntries.reduce((s, v) => s + v.cashOutflow, 0);

  const partySummaries = filteredParties.map(p => ({ party: p, out: calculatePartyOutstanding(p, data) }));
  const totalReceivableDR = partySummaries
    .filter(x => x.out.balanceType === 'DR')
    .reduce((s, x) => s + x.out.netBalance, 0);
  const totalPayableCR = partySummaries
    .filter(x => x.out.balanceType === 'CR')
    .reduce((s, x) => s + x.out.netBalance, 0);

  const stockTotalUnits = filteredItems.reduce((s, it) => s + (it.currentStock || 0), 0);
  const stockCostValue = filteredItems.reduce((s, it) => s + getItemClosingStockValue(it), 0);
  const stockSalesValue = filteredItems.reduce((s, it) => s + ((it.currentStock || 0) * (it.salesPrice || 0)), 0);
  const lowStockCount = filteredItems.filter(it => (it.currentStock || 0) <= (it.minStockLevel || 0)).length;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto text-[var(--text-primary)]">
      {/* Header Banner + Global Period Search with OK Button */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 hv-surface p-5 rounded-2xl border border-[var(--border-primary)] shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-emerald-600 to-indigo-600 rounded-2xl text-white hv-keep-white shadow-lg shadow-emerald-500/20 shrink-0">
            <FileSpreadsheet className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold flex flex-wrap items-center gap-2 text-[var(--text-primary)]">
              <span>{isHindi ? 'एमआईएस रिपोर्ट एवं एक्सपोर्ट सेंटर (MIS Reports)' : 'MIS Reports & Export Hub'}</span>
              <span className="text-[11px] font-mono hv-pill-emerald border px-2.5 py-0.5 rounded-full">
                {periodLabel}
              </span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {isHindi
                ? 'तारीख की अवधि चुनकर OK दबाएँ व सभी 8 रिपोर्ट्स का पूरा विवरण Excel / PDF में प्राप्त करें'
                : 'Select date period, click OK to apply, and inspect full breakdowns or export Excel / PDF'}
            </p>
          </div>
        </div>

        {/* Global Date Period Filter + Custom FY-to-FY Selector + Explicit OK Button */}
        <div className="flex flex-col gap-2 w-full xl:w-auto">
          <div className="flex flex-wrap items-center gap-2 hv-elevated p-2.5 rounded-xl border border-[var(--border-subtle)] text-xs">
            <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className="text-[var(--text-secondary)] font-semibold">{isHindi ? 'अवधि (F2):' : 'Period (F2):'}</span>
            <input
              ref={periodStartInputRef}
              type="date"
              value={draftStartDate}
              onChange={(e) => setDraftStartDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyPeriod(); }}
              className="hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
              aria-label="Period Start Date"
            />
            <span className="text-[var(--text-muted)] font-bold">-</span>
            <input
              type="date"
              value={draftEndDate}
              onChange={(e) => setDraftEndDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleApplyPeriod(); }}
              className="hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
              aria-label="Period End Date"
            />
            <button
              type="button"
              onClick={handleApplyPeriod}
              className={`flex items-center gap-1 px-4 py-1.5 rounded-lg font-extrabold text-xs transition cursor-pointer shadow-md ${
                hasPendingDateChanges
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 ring-2 ring-amber-400/50 animate-pulse'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white shadow-emerald-600/20'
              }`}
              title={isHindi ? 'चुनी गई अवधि लागू करें' : 'Apply selected date period'}
            >
              <Check className="w-3.5 h-3.5" />
              <span>OK</span>
            </button>
            {(fyScope === 'FY_RANGE' || startDate !== defaultPeriod.start || endDate !== defaultPeriod.end) && (
              <button
                type="button"
                onClick={() => applyPresetPeriod('FULL_FY')}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)] text-[11px] font-semibold transition cursor-pointer"
                title={isHindi ? 'सक्रिय वित्तीय वर्ष पर वापस जाएँ' : 'Reset to Active Financial Year'}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isHindi ? 'रीसेट FY' : 'Reset FY'}</span>
              </button>
            )}
          </div>

          {/* Quick Period Presets + Custom FY-to-FY Selector */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => applyPresetPeriod('FULL_FY')}
                className={`px-2.5 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                  fyScope === 'ACTIVE_FY' && startDate === defaultPeriod.start && endDate === defaultPeriod.end
                    ? 'bg-indigo-600 text-white hv-keep-white border-indigo-400'
                    : 'hv-elevated hover:bg-[var(--hover-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {isHindi ? `सक्रिय वर्ष (${getFinancialYearRange(activeFyData.company.financialYearStart).label})` : `Active FY (${getFinancialYearRange(activeFyData.company.financialYearStart).label})`}
              </button>
              <button
                type="button"
                onClick={() => applyPresetPeriod('THIS_MONTH')}
                className="px-2.5 py-1 rounded-lg hv-elevated hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold transition cursor-pointer"
              >
                {isHindi ? 'इस माह' : 'This Month'}
              </button>
              <button
                type="button"
                onClick={() => applyPresetPeriod('LAST_MONTH')}
                className="px-2.5 py-1 rounded-lg hv-elevated hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold transition cursor-pointer"
              >
                {isHindi ? 'पिछला माह' : 'Last Month'}
              </button>
              <button
                type="button"
                onClick={() => setFyScope(prev => prev === 'FY_RANGE' ? 'ACTIVE_FY' : 'FY_RANGE')}
                className={`px-2.5 py-1 rounded-lg border font-bold transition flex items-center gap-1 cursor-pointer ${
                  fyScope === 'FY_RANGE'
                    ? 'bg-emerald-600 text-white hv-keep-white border-emerald-400 shadow'
                    : 'hv-pill-emerald hover:opacity-90'
                }`}
              >
                <Globe2 className="w-3 h-3" />
                <span>{isHindi ? 'किस FY से किस FY तक (Custom FY)' : 'From FY → To FY'}</span>
              </button>
            </div>

            {periodAppliedNotice && (
              <span className="inline-flex items-center gap-1 text-emerald-500 font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {isHindi ? 'अवधि लागू हो गई!' : 'Period Applied!'}
              </span>
            )}
          </div>

          {fyScope === 'FY_RANGE' && (
            <div className="flex flex-wrap items-center gap-2 hv-pill-emerald border px-3 py-2 rounded-xl text-xs">
              <span className="font-bold">{isHindi ? 'किस वित्तीय वर्ष से:' : 'From FY:'}</span>
              <select
                value={fromFyStart}
                onChange={(e) => setFromFyStart(e.target.value)}
                className="hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1 font-mono text-xs font-bold cursor-pointer"
              >
                {availableFysAsc.map((fy) => (
                  <option key={fy.fyStart} value={fy.fyStart}>{fy.label} ({fy.count})</option>
                ))}
              </select>
              <span className="font-bold">{isHindi ? 'किस वित्तीय वर्ष तक:' : 'To FY:'}</span>
              <select
                value={toFyStart}
                onChange={(e) => setToFyStart(e.target.value)}
                className="hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1 font-mono text-xs font-bold cursor-pointer"
              >
                {availableFysAsc.map((fy) => (
                  <option key={fy.fyStart} value={fy.fyStart}>{fy.label} ({fy.count})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Reports Nav Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {reportTabs.map((tab, idx) => {
          const Icon = tab.icon;
          const isActive = activeReport === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              title={`Alt + ${idx + 1}`}
              onClick={() => setActiveReport(tab.id)}
              className={`p-3 rounded-xl border text-xs font-bold text-left transition flex flex-col justify-between gap-2 cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-b from-indigo-600 to-indigo-700 text-white hv-keep-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                  : 'hv-surface border-[var(--border-primary)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <Icon className={`w-4 h-4 ${isActive ? 'text-amber-300' : 'text-indigo-500'}`} />
                <span className={`text-[10px] font-mono ${isActive ? 'text-indigo-100' : 'text-[var(--text-muted)]'}`}>Alt+{idx + 1}</span>
              </div>
              <span className="line-clamp-2 leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Active Report View Panel */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-4 shadow-xl">
        {/* Top Control Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-[var(--border-primary)] pb-4">
          <div className="flex items-center gap-2 w-full sm:w-96">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleApplyPeriod(); }}
                placeholder={isHindi ? 'नाम, बिल नं, GSTIN या विवरण खोजें...' : 'Search party, doc no, GSTIN, item...'}
                className="w-full hv-input text-xs rounded-xl pl-9 pr-3 py-2 border border-[var(--border-subtle)] focus:outline-none focus:border-indigo-500"
              />
            </div>
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="px-2.5 py-2 rounded-xl hv-elevated hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] text-xs font-semibold border border-[var(--border-subtle)] cursor-pointer"
              >
                {isHindi ? 'साफ़' : 'Clear'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
            {activeReport === 'DEBIT_CREDIT_NOTES' && onOpenDebitCreditNoteModal && perms.canCreateEditVouchers && (
              <button
                type="button"
                onClick={onOpenDebitCreditNoteModal}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isHindi ? 'नया नोट बनाएं' : 'New Note'}</span>
              </button>
            )}
            {perms.canExportData && (
              <>
                <button
                  type="button"
                  onClick={handleExportActiveExcel}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold text-xs px-3.5 py-2 rounded-xl shadow transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isHindi ? 'Excel (CSV) एक्सपोर्ट' : 'Export to Excel'}</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintActiveReport}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-3.5 py-2 rounded-xl shadow transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isHindi ? 'प्रिंट / PDF बनाएं' : 'Print / Export PDF'}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* 1. SALES REGISTER REPORT */}
        {activeReport === 'SALES' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल बिक्री बिल' : 'Total Invoices'}</p>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] mt-0.5">{salesInvoices.length}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कर योग्य राशि (Taxable)' : 'Taxable Value'}</p>
                <p className="text-lg font-extrabold font-mono text-indigo-500 mt-0.5">{formatCurrency(salesTotalTaxable, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल जीएसटी कर' : 'Total Output GST'}</p>
                <p className="text-lg font-extrabold font-mono text-emerald-500 mt-0.5">{formatCurrency(salesTotalTax, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल बिक्री (Grand Total)' : 'Gross Sales Total'}</p>
                <p className="text-lg font-extrabold font-mono text-amber-500 mt-0.5">{formatCurrency(salesGrandTotal, currency)}</p>
              </div>
            </div>

            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? 'बिक्री इनवॉइस रजिस्टर (Sales Register Summary)' : 'Sales Invoices Register'}</span>
            </h3>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3">{isHindi ? 'इनवॉइस सं.' : 'Invoice No'}</th>
                    <th className="p-3">{isHindi ? 'तारीख' : 'Date'}</th>
                    <th className="p-3">{isHindi ? 'ग्राहक नाम' : 'Customer Name'}</th>
                    <th className="p-3">GSTIN</th>
                    <th className="p-3 text-right">{isHindi ? 'कर योग्य मान' : 'Taxable Amt'}</th>
                    <th className="p-3 text-right">{isHindi ? 'जीएसटी कर' : 'GST Tax'}</th>
                    <th className="p-3 text-right">{isHindi ? 'कुल राशि' : 'Grand Total'}</th>
                    <th className="p-3 text-right">{isHindi ? 'प्राप्त' : 'Paid'}</th>
                    <th className="p-3 text-center">{isHindi ? 'स्थिति' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  {salesInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-[var(--text-muted)] font-sans">
                        {isHindi ? 'चुनी गई अवधि में कोई बिक्री रिकॉर्ड उपलब्ध नहीं है। ऊपर "All Time" या सही तारीख चुनकर OK दबाएँ।' : 'No sales records found for this period. Try clicking "All Time" or update period and click OK.'}
                      </td>
                    </tr>
                  ) : (
                    salesInvoices.map((inv) => (
                      <tr
                        key={inv.id}
                        onClick={() => setDetailModalPayload({
                          kind: 'TRANSACTION_DETAIL',
                          title: `${isHindi ? 'बिक्री इनवॉइस विवरण' : 'Sales Invoice Detail'} — ${inv.invoiceNumber}`,
                          voucherKind: 'SALES',
                          record: inv
                        })}
                        className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                        title={isHindi ? 'पूरा इनवॉइस विवरण देखें' : 'Click to inspect invoice breakdown'}
                      >
                        <td className="p-3 font-bold text-indigo-500 underline decoration-indigo-500/40">{inv.invoiceNumber}</td>
                        <td className="p-3 text-[var(--text-secondary)]">{inv.date}</td>
                        <td className="p-3 font-sans text-[var(--text-primary)]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLedgerTarget({ id: inv.partyId, name: inv.partyName });
                            }}
                            className="text-indigo-500 hover:opacity-80 font-bold hover:underline text-left cursor-pointer"
                            title={isHindi ? 'खाता बही (Ledger) देखें' : 'Click to View Ledger Statement'}
                          >
                            {inv.partyName}
                          </button>
                        </td>
                        <td className="p-3 text-[var(--text-muted)]">{inv.partyGstin || '-'}</td>
                        <td className="p-3 text-right">{formatCurrency(inv.subtotal, currency)}</td>
                        <td className="p-3 text-right text-emerald-500">{formatCurrency(inv.totalTax, currency)}</td>
                        <td className="p-3 text-right font-bold text-amber-500">{formatCurrency(inv.grandTotal, currency)}</td>
                        <td className="p-3 text-right text-[var(--text-secondary)]">{formatCurrency(inv.amountPaid || 0, currency)}</td>
                        <td className="p-3 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            inv.status === 'PAID'
                              ? 'hv-pill-emerald'
                              : inv.status === 'PARTIAL'
                                ? 'hv-pill-amber'
                                : 'hv-pill-rose'
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {salesInvoices.length > 0 && (
                  <tfoot className="hv-elevated font-mono font-bold border-t border-[var(--border-primary)] text-[var(--text-primary)]">
                    <tr>
                      <td colSpan={4} className="p-3 font-sans">{isHindi ? 'कुल योग (Total)' : 'Total'}</td>
                      <td className="p-3 text-right">{formatCurrency(salesTotalTaxable, currency)}</td>
                      <td className="p-3 text-right text-emerald-500">{formatCurrency(salesTotalTax, currency)}</td>
                      <td className="p-3 text-right text-amber-500">{formatCurrency(salesGrandTotal, currency)}</td>
                      <td className="p-3 text-right">{formatCurrency(salesPaidTotal, currency)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* 2. PURCHASE REGISTER REPORT */}
        {activeReport === 'PURCHASE' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल खरीद बिल' : 'Total Purchase Bills'}</p>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] mt-0.5">{purchaseInvoices.length}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कर योग्य खरीद' : 'Taxable Purchases'}</p>
                <p className="text-lg font-extrabold font-mono text-indigo-500 mt-0.5">{formatCurrency(purTotalTaxable, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'इनपुट जीएसटी (ITC)' : 'Total Input GST'}</p>
                <p className="text-lg font-extrabold font-mono text-rose-500 mt-0.5">{formatCurrency(purTotalTax, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल खरीद राशि' : 'Gross Purchase Total'}</p>
                <p className="text-lg font-extrabold font-mono text-amber-500 mt-0.5">{formatCurrency(purGrandTotal, currency)}</p>
              </div>
            </div>

            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-rose-500" />
              <span>{isHindi ? 'खरीद इनवॉइस रजिस्टर (Purchase Register Summary)' : 'Purchase Bills Register'}</span>
            </h3>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3">{isHindi ? 'बिल सं.' : 'Bill No'}</th>
                    <th className="p-3">{isHindi ? 'विक्रेता इनवॉइस सं.' : 'Supplier Inv No'}</th>
                    <th className="p-3">{isHindi ? 'तारीख' : 'Date'}</th>
                    <th className="p-3">{isHindi ? 'विक्रेता नाम' : 'Vendor Name'}</th>
                    <th className="p-3 text-right">{isHindi ? 'सबटोटल' : 'Subtotal'}</th>
                    <th className="p-3 text-right">{isHindi ? 'इनपुट जीएसटी' : 'Input GST'}</th>
                    <th className="p-3 text-right">{isHindi ? 'कुल राशि' : 'Grand Total'}</th>
                    <th className="p-3 text-right">{isHindi ? 'भुगतान' : 'Paid'}</th>
                    <th className="p-3 text-center">{isHindi ? 'स्थिति' : 'Status'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  {purchaseInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-[var(--text-muted)] font-sans">
                        {isHindi ? 'चुनी गई अवधि में कोई खरीद रिकॉर्ड उपलब्ध नहीं है।' : 'No purchase records found for selected period.'}
                      </td>
                    </tr>
                  ) : (
                    purchaseInvoices.map((pur) => (
                      <tr
                        key={pur.id}
                        onClick={() => setDetailModalPayload({
                          kind: 'TRANSACTION_DETAIL',
                          title: `${isHindi ? 'खरीद बिल विवरण' : 'Purchase Bill Detail'} — ${pur.billNumber}`,
                          voucherKind: 'PURCHASE',
                          record: pur
                        })}
                        className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                        title={isHindi ? 'पूरा बिल विवरण देखें' : 'Click to inspect purchase breakdown'}
                      >
                        <td className="p-3 font-bold text-indigo-500 underline decoration-indigo-500/40">{pur.billNumber}</td>
                        <td className="p-3 text-[var(--text-secondary)]">{pur.supplierInvoiceNo || '-'}</td>
                        <td className="p-3 text-[var(--text-secondary)]">{pur.date}</td>
                        <td className="p-3 font-sans text-[var(--text-primary)]">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLedgerTarget({ id: pur.partyId, name: pur.partyName });
                            }}
                            className="text-amber-500 hover:opacity-80 font-bold hover:underline text-left cursor-pointer"
                            title={isHindi ? 'खाता बही (Ledger) देखें' : 'Click to View Ledger Statement'}
                          >
                            {pur.partyName}
                          </button>
                        </td>
                        <td className="p-3 text-right">{formatCurrency(pur.subtotal, currency)}</td>
                        <td className="p-3 text-right text-rose-500">{formatCurrency(pur.totalTax, currency)}</td>
                        <td className="p-3 text-right font-bold text-amber-500">{formatCurrency(pur.grandTotal, currency)}</td>
                        <td className="p-3 text-right text-[var(--text-secondary)]">{formatCurrency(pur.amountPaid || 0, currency)}</td>
                        <td className="p-3 text-center font-sans">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            pur.status === 'PAID'
                              ? 'hv-pill-emerald'
                              : pur.status === 'PARTIAL'
                                ? 'hv-pill-amber'
                                : 'hv-pill-rose'
                          }`}>
                            {pur.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {purchaseInvoices.length > 0 && (
                  <tfoot className="hv-elevated font-mono font-bold border-t border-[var(--border-primary)] text-[var(--text-primary)]">
                    <tr>
                      <td colSpan={4} className="p-3 font-sans">{isHindi ? 'कुल योग (Total)' : 'Total'}</td>
                      <td className="p-3 text-right">{formatCurrency(purTotalTaxable, currency)}</td>
                      <td className="p-3 text-right text-rose-500">{formatCurrency(purTotalTax, currency)}</td>
                      <td className="p-3 text-right text-amber-500">{formatCurrency(purGrandTotal, currency)}</td>
                      <td className="p-3 text-right">{formatCurrency(purPaidTotal, currency)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* 3. DAYBOOK REPORT */}
        {activeReport === 'DAYBOOK' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल प्रविष्टियाँ' : 'Total Transactions'}</p>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] mt-0.5">{daybookEntries.length}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'नकद / बैंक आवक (Inflow)' : 'Cash/Bank Inflow (Receipts)'}</p>
                <p className="text-lg font-extrabold font-mono text-emerald-500 mt-0.5">{formatCurrency(daybookReceipts, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'नकद / बैंक जावक (Outflow)' : 'Cash/Bank Outflow (Payments)'}</p>
                <p className="text-lg font-extrabold font-mono text-rose-500 mt-0.5">{formatCurrency(daybookPayments, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल डे-बुक वॉल्यूम' : 'Total Daybook Volume'}</p>
                <p className="text-lg font-extrabold font-mono text-amber-500 mt-0.5">{formatCurrency(daybookTotalAmt, currency)}</p>
              </div>
            </div>

            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? 'दैनिक रोखड़ एवं बैंक बही (Day Book)' : 'Day Book & Cash/Bank Transaction Log'}</span>
            </h3>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3">{isHindi ? 'दस्तावेज़ सं.' : 'Doc / Voucher No'}</th>
                    <th className="p-3">{isHindi ? 'प्रकार' : 'Type'}</th>
                    <th className="p-3">{isHindi ? 'तारीख' : 'Date'}</th>
                    <th className="p-3">{isHindi ? 'पार्टी / संदर्भ' : 'Party / Ref'}</th>
                    <th className="p-3">{isHindi ? 'प्रभावित खाते (Dr/Cr)' : 'Accounts (Dr/Cr)'}</th>
                    <th className="p-3">{isHindi ? 'विवरण (Narration)' : 'Narration'}</th>
                    <th className="p-3 text-right">{isHindi ? 'राशि' : 'Amount'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  {daybookEntries.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-[var(--text-muted)] font-sans">
                        {isHindi ? 'चुनी गई अवधि में कोई प्रविष्टि नहीं है।' : 'No transactions logged for selected dates.'}
                      </td>
                    </tr>
                  ) : (
                    daybookEntries.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setDetailModalPayload({
                          kind: 'TRANSACTION_DETAIL',
                          title: `${isHindi ? 'लेन-देन विवरण' : 'Transaction Breakdown'} — ${row.docNumber}`,
                          voucherKind: row.voucherKind,
                          record: row.record
                        })}
                        className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                        title={isHindi ? 'पूरा विवरण देखें' : 'Click to inspect transaction entries'}
                      >
                        <td className="p-3 font-bold text-indigo-500 underline decoration-indigo-500/40">{row.docNumber}</td>
                        <td className="p-3 font-sans">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold hv-pill-slate border">
                            {row.typeLabel}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--text-secondary)]">{row.date}</td>
                        <td className="p-3 font-sans text-[var(--text-primary)]">
                          {row.partyName ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedLedgerTarget({ id: row.partyId, name: row.partyName });
                              }}
                              className="text-indigo-500 hover:opacity-80 font-bold hover:underline text-left cursor-pointer"
                              title={isHindi ? 'खाता बही (Ledger) देखें' : 'Click to View Ledger Statement'}
                            >
                              {row.partyName}
                            </button>
                          ) : (
                            <span>{row.referenceNo || '-'}</span>
                          )}
                        </td>
                        <td className="p-3 font-sans text-[11px] text-[var(--text-secondary)] max-w-xs">
                          {row.accountSummary.map((e, idx) => (
                            <div key={idx} className="truncate">
                              <span className={e.side === 'Dr' ? 'text-emerald-500 font-bold' : 'text-amber-500 font-bold'}>
                                {e.side}
                              </span>{' '}
                              {e.name}
                            </div>
                          ))}
                        </td>
                        <td className="p-3 font-sans text-[var(--text-muted)] max-w-xs truncate">{row.narration || '-'}</td>
                        <td className="p-3 text-right font-bold text-emerald-500">{formatCurrency(row.amount, currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {daybookEntries.length > 0 && (
                  <tfoot className="hv-elevated font-mono font-bold border-t border-[var(--border-primary)] text-[var(--text-primary)]">
                    <tr>
                      <td colSpan={6} className="p-3 font-sans">{isHindi ? 'कुल डे-बुक राशि (Total)' : 'Total Daybook Amount'}</td>
                      <td className="p-3 text-right text-emerald-500">{formatCurrency(daybookTotalAmt, currency)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* 4. OUTSTANDING AGING & BILL-WISE BREAKDOWN */}
        {activeReport === 'OUTSTANDING' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल पार्टियाँ' : 'Parties Matched'}</p>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] mt-0.5">{filteredParties.length}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'लेने योग्य (Total Receivable DR)' : 'Total Receivable (DR)'}</p>
                <p className="text-lg font-extrabold font-mono text-amber-500 mt-0.5">{formatCurrency(totalReceivableDR, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'देने योग्य (Total Payable CR)' : 'Total Payable (CR)'}</p>
                <p className="text-lg font-extrabold font-mono text-rose-500 mt-0.5">{formatCurrency(totalPayableCR, currency)}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'अवधि में लंबित बिल' : 'Pending Bills (Period)'}</p>
                <p className="text-lg font-extrabold font-mono text-indigo-500 mt-0.5">{pendingBills.length}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hv-elevated p-3 rounded-xl border border-[var(--border-subtle)]">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-500" />
                <span>{isHindi ? 'पार्टी एवं बिल-वार बकाया रिपोर्ट (Customer & Vendor Outstanding)' : 'Customer & Vendor Outstanding Details'}</span>
              </h3>

              <div className="flex items-center gap-1 hv-surface p-1 rounded-lg border border-[var(--border-primary)] text-xs">
                <button
                  type="button"
                  onClick={() => setOutstandingSubTab('PARTY_WISE')}
                  className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                    outstandingSubTab === 'PARTY_WISE'
                      ? 'bg-indigo-600 text-white hv-keep-white shadow'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isHindi ? 'पार्टी/ग्राहक सारांश (Party Wise)' : 'Party Wise Summary'}
                </button>
                <button
                  type="button"
                  onClick={() => setOutstandingSubTab('BILL_WISE')}
                  className={`px-3 py-1.5 rounded-md font-bold transition cursor-pointer ${
                    outstandingSubTab === 'BILL_WISE'
                      ? 'bg-indigo-600 text-white hv-keep-white shadow'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isHindi ? 'बिल/वाउचर वार विवरण (Bill Wise)' : 'Bill-wise Pending'}
                </button>
              </div>
            </div>

            {outstandingSubTab === 'PARTY_WISE' ? (
              <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="p-3">{isHindi ? 'पार्टी नाम' : 'Party Name'}</th>
                      <th className="p-3">{isHindi ? 'प्रकार' : 'Type'}</th>
                      <th className="p-3">GSTIN</th>
                      <th className="p-3">{isHindi ? 'फोन' : 'Phone'}</th>
                      <th className="p-3 text-right">{isHindi ? 'आरंभिक शेष' : 'Opening Bal'}</th>
                      <th className="p-3 text-right">{isHindi ? 'कुल बिलिंग' : 'Total Billed'}</th>
                      <th className="p-3 text-right">{isHindi ? 'प्राप्त/भुगतान' : 'Paid / Recd'}</th>
                      <th className="p-3 text-right">{isHindi ? 'वर्तमान बकाया' : 'Outstanding Bal'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                    {partySummaries.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-[var(--text-muted)] font-sans">
                          {isHindi ? 'कोई पार्टी बकाया रिकॉर्ड उपलब्ध नहीं है।' : 'No party outstanding records found.'}
                        </td>
                      </tr>
                    ) : (
                      partySummaries.map(({ party, out }) => (
                        <tr
                          key={party.id}
                          onClick={() => setSelectedLedgerTarget({ id: party.id, name: party.name })}
                          className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                          title={isHindi ? 'पार्टी खाता बही (Ledger) खोलें' : 'Click to open party ledger'}
                        >
                          <td className="p-3 font-bold font-sans text-[var(--text-primary)]">
                            <button
                              type="button"
                              onClick={() => setSelectedLedgerTarget({ id: party.id, name: party.name })}
                              className="text-indigo-500 hover:opacity-80 font-extrabold hover:underline text-left flex items-center gap-1.5 cursor-pointer"
                              title={isHindi ? 'खाता बही (Ledger) देखें' : 'Click to View Detailed Ledger Statement'}
                            >
                              <span>{party.name}</span>
                            </button>
                            {party.gstCategory && (
                              <span className="text-[9px] font-semibold hv-pill-slate border px-1.5 py-0.5 rounded font-mono block w-fit mt-0.5">
                                {party.gstCategory}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-sans">
                            <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                              party.type === 'CUSTOMER' ? 'hv-pill-emerald' : 'hv-pill-rose'
                            }`}>
                              {party.type}
                            </span>
                          </td>
                          <td className="p-3 text-[var(--text-muted)]">{party.gstin || '-'}</td>
                          <td className="p-3 text-[var(--text-secondary)] font-sans">{party.phone || '-'}</td>
                          <td className="p-3 text-right">{formatCurrency(party.openingBalance, currency)} ({party.balanceType})</td>
                          <td className="p-3 text-right text-indigo-500">{formatCurrency(out.totalInvoiced, currency)}</td>
                          <td className="p-3 text-right text-emerald-500">{formatCurrency(out.totalPaid, currency)}</td>
                          <td className={`p-3 text-right font-bold font-mono text-sm ${
                            out.balanceType === 'DR' ? 'text-amber-500' : 'text-rose-500'
                          }`}>
                            {formatCurrency(out.netBalance, currency)} <span className="text-[10px] font-bold">({out.balanceType})</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="p-3">{isHindi ? 'बिल नं.' : 'Bill / Invoice #'}</th>
                      <th className="p-3">{isHindi ? 'तिथि' : 'Date'}</th>
                      <th className="p-3">{isHindi ? 'पार्टी नाम' : 'Party Name'}</th>
                      <th className="p-3">{isHindi ? 'प्रकार' : 'Category'}</th>
                      <th className="p-3 text-right">{isHindi ? 'कुल राशि' : 'Bill Amount'}</th>
                      <th className="p-3 text-right">{isHindi ? 'भुगतान/प्राप्त' : 'Paid'}</th>
                      <th className="p-3 text-right">{isHindi ? 'लंबित बकाया' : 'Pending Amount'}</th>
                      <th className="p-3 text-center">{isHindi ? 'आयु (दिन)' : 'Aging'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                    {pendingBills.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-[var(--text-muted)] font-sans">
                          {isHindi ? 'चुनी गई अवधि में कोई लंबित या बकाया बिल नहीं है।' : 'No pending or unpaid bills found for selected period.'}
                        </td>
                      </tr>
                    ) : (
                      pendingBills.map((bill) => {
                        const invDate = new Date(bill.date);
                        const daysOld = Math.max(0, Math.floor((new Date().getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24)));
                        let agingBadgeClass = 'hv-pill-emerald';
                        if (daysOld > 90) agingBadgeClass = 'hv-pill-rose';
                        else if (daysOld > 60) agingBadgeClass = 'hv-pill-amber';
                        else if (daysOld > 30) agingBadgeClass = 'hv-pill-sky';

                        return (
                          <tr
                            key={bill.id}
                            onClick={() => {
                              if (bill.kind === 'RECEIVABLE') {
                                const rec = (data.invoices || []).find(i => `s_${i.id}` === bill.id);
                                if (rec) {
                                  setDetailModalPayload({
                                    kind: 'TRANSACTION_DETAIL',
                                    title: `${isHindi ? 'बकाया इनवॉइस विवरण' : 'Pending Invoice'} — ${rec.invoiceNumber}`,
                                    voucherKind: 'SALES',
                                    record: rec
                                  });
                                }
                              } else {
                                const rec = (data.purchaseInvoices || []).find(p => `p_${p.id}` === bill.id);
                                if (rec) {
                                  setDetailModalPayload({
                                    kind: 'TRANSACTION_DETAIL',
                                    title: `${isHindi ? 'बकाया खरीद बिल विवरण' : 'Pending Purchase Bill'} — ${rec.billNumber}`,
                                    voucherKind: 'PURCHASE',
                                    record: rec
                                  });
                                }
                              }
                            }}
                            className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                            title={isHindi ? 'बिल का पूरा विवरण देखें' : 'Click to view bill breakdown'}
                          >
                            <td className="p-3 font-bold text-indigo-500 underline decoration-indigo-500/40">{bill.docNumber}</td>
                            <td className="p-3 text-[var(--text-secondary)]">{bill.date}</td>
                            <td className="p-3 font-bold font-sans text-[var(--text-primary)]">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLedgerTarget({ id: bill.partyId, name: bill.partyName });
                                }}
                                className="text-indigo-500 hover:underline text-left cursor-pointer"
                              >
                                {bill.partyName}
                              </button>
                            </td>
                            <td className="p-3 font-sans">
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                                bill.kind === 'RECEIVABLE' ? 'hv-pill-emerald' : 'hv-pill-rose'
                              }`}>
                                {bill.kind}
                              </span>
                            </td>
                            <td className="p-3 text-right text-[var(--text-secondary)]">{formatCurrency(bill.grandTotal, currency)}</td>
                            <td className="p-3 text-right text-emerald-500">{formatCurrency(bill.amountPaid, currency)}</td>
                            <td className="p-3 text-right font-bold text-amber-500">{formatCurrency(bill.pending, currency)}</td>
                            <td className="p-3 text-center font-sans">
                              <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${agingBadgeClass}`}>
                                {daysOld} days
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* 5. GST RETURN SUMMARY (Full CGST/SGST/IGST Split + Transaction Table) */}
        {activeReport === 'GST' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? 'जीएसटी विवरणी समरी (GSTR-1 & GSTR-3B Tax Liability)' : 'GST Returns Summary (GSTR-1 & GSTR-3B)'}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 rounded-xl hv-elevated border border-[var(--border-subtle)] space-y-2">
                <p className="font-sans text-[var(--text-muted)] font-semibold">{isHindi ? '1. आउटवर्ड सप्लाई टैक्स (Output GST)' : 'Outward Sales GST (GSTR-1)'}</p>
                <p className="text-lg font-bold text-emerald-500">{formatCurrency(gstStats.totalOutTax, currency)}</p>
                <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] pt-2">
                  <span>CGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.outCgst, currency)}</b></span>
                  <span>SGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.outSgst, currency)}</b></span>
                  <span>IGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.outIgst, currency)}</b></span>
                </div>
              </div>

              <div className="p-4 rounded-xl hv-elevated border border-[var(--border-subtle)] space-y-2">
                <p className="font-sans text-[var(--text-muted)] font-semibold">{isHindi ? '2. इनपुट टैक्स क्रेडिट (Eligible ITC)' : 'Inward Purchase ITC (GSTR-2B)'}</p>
                <p className="text-lg font-bold text-rose-500">{formatCurrency(gstStats.totalInTax, currency)}</p>
                <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] pt-2">
                  <span>CGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.inCgst, currency)}</b></span>
                  <span>SGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.inSgst, currency)}</b></span>
                  <span>IGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.inIgst, currency)}</b></span>
                </div>
              </div>

              <div className="p-4 rounded-xl hv-elevated border border-[var(--border-subtle)] space-y-2">
                <p className="font-sans text-[var(--text-muted)] font-semibold">
                  {gstStats.netTaxPayable > 0
                    ? (isHindi ? '3. शुद्ध देय जीएसटी (Net Payable)' : 'Net GST Cash Payable')
                    : (isHindi ? '3. शेष ITC क्रेडिट (ITC Carryforward)' : 'Net ITC Credit Balance')}
                </p>
                <p className="text-lg font-bold text-amber-500">
                  {formatCurrency(gstStats.netTaxPayable > 0 ? gstStats.netTaxPayable : gstStats.itcCarryForward, currency)}
                </p>
                <div className="text-[11px] text-[var(--text-muted)] flex flex-wrap gap-x-3 gap-y-1 border-t border-[var(--border-subtle)] pt-2">
                  <span>Net CGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.netCgst, currency)}</b></span>
                  <span>Net SGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.netSgst, currency)}</b></span>
                  <span>Net IGST: <b className="text-[var(--text-primary)]">{formatCurrency(gstStats.netIgst, currency)}</b></span>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3">{isHindi ? 'बिल / इनवॉइस सं.' : 'Doc No'}</th>
                    <th className="p-3">{isHindi ? 'तारीख' : 'Date'}</th>
                    <th className="p-3">{isHindi ? 'सेक्शन' : 'GST Section'}</th>
                    <th className="p-3">{isHindi ? 'पार्टी नाम' : 'Party Name'}</th>
                    <th className="p-3">GSTIN</th>
                    <th className="p-3 text-right">{isHindi ? 'कर योग्य' : 'Taxable'}</th>
                    <th className="p-3 text-right">CGST</th>
                    <th className="p-3 text-right">SGST</th>
                    <th className="p-3 text-right">IGST</th>
                    <th className="p-3 text-right">{isHindi ? 'कुल टैक्स' : 'Total Tax'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  {gstStats.registerRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-6 text-center text-[var(--text-muted)] font-sans">
                        {isHindi ? 'चुनी गई अवधि में कोई GST ट्रांज़ैक्शन उपलब्ध नहीं है।' : 'No GST transactions found for selected period.'}
                      </td>
                    </tr>
                  ) : (
                    gstStats.registerRows.map((row) => (
                      <tr
                        key={row.id}
                        onClick={() => setDetailModalPayload({
                          kind: 'TRANSACTION_DETAIL',
                          title: `${row.supplyType} — ${row.docNo}`,
                          voucherKind: row.sourceKind,
                          record: row.sourceRecord
                        })}
                        className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                        title={isHindi ? 'टैक्स व आइटम विवरण देखें' : 'Click to inspect GST invoice details'}
                      >
                        <td className="p-3 font-bold text-indigo-500 underline decoration-indigo-500/40">{row.docNo}</td>
                        <td className="p-3 text-[var(--text-secondary)]">{row.date}</td>
                        <td className="p-3 font-sans">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            row.supplyType.includes('OUTWARD') ? 'hv-pill-emerald' : 'hv-pill-sky'
                          }`}>
                            {row.supplyType}
                          </span>
                        </td>
                        <td className="p-3 font-sans font-bold text-[var(--text-primary)]">{row.partyName}</td>
                        <td className="p-3 text-[var(--text-muted)]">{row.gstin}</td>
                        <td className="p-3 text-right">{formatCurrency(row.taxable, currency)}</td>
                        <td className="p-3 text-right">{formatCurrency(row.cgst, currency)}</td>
                        <td className="p-3 text-right">{formatCurrency(row.sgst, currency)}</td>
                        <td className="p-3 text-right">{formatCurrency(row.igst, currency)}</td>
                        <td className="p-3 text-right font-bold text-amber-500">{formatCurrency(row.totalTax, currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. STOCK & INVENTORY VALUATION */}
        {activeReport === 'STOCK' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल आइटम (SKUs)' : 'Total Items'}</p>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] mt-0.5">{filteredItems.length}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल स्टॉक यूनिट्स' : 'Total Units in Hand'}</p>
                <p className="text-lg font-extrabold font-mono text-indigo-500 mt-0.5">{stockTotalUnits}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailModalPayload({
                  kind: 'STOCK_VALUATION',
                  stockType: 'CLOSING',
                  title: isHindi ? 'अंतिम स्टॉक आइटम विवरण (Closing Stock)' : 'Closing Stock Valuation Breakdown',
                  subtitle: periodLabel,
                  accInventoryOpening: plStats.openingStock
                })}
                className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)] hover:border-emerald-500/50 text-left transition cursor-pointer"
                title={isHindi ? 'सभी आइटम का विस्तृत मूल्यांकन देखें' : 'Click to view item-wise stock valuation'}
              >
                <p className="text-[var(--text-muted)] underline decoration-[var(--border-subtle)]">{isHindi ? 'क्रय स्टॉक वैल्यू (Cost)' : 'Stock Cost Value'}</p>
                <p className="text-lg font-extrabold font-mono text-emerald-500 mt-0.5">{formatCurrency(stockCostValue, currency)}</p>
              </button>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'अनुमानित बिक्री मूल्य' : 'Potential Sales Value'}</p>
                <p className="text-lg font-extrabold font-mono text-amber-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{formatCurrency(stockSalesValue, currency)}</span>
                  {lowStockCount > 0 && (
                    <span className="text-[10px] font-sans hv-pill-rose border px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {lowStockCount} Low
                    </span>
                  )}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? 'इन्वेंट्री एवं स्टॉक मूल्यांकन (Stock Inventory Valuation)' : 'Stock Valuation & Physical Inventory'}</span>
            </h3>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3">{isHindi ? 'आइटम कोड' : 'Code'}</th>
                    <th className="p-3">{isHindi ? 'आइटम नाम व श्रेणी' : 'Item Name & Category'}</th>
                    <th className="p-3">HSN/SAC</th>
                    <th className="p-3 text-right">{isHindi ? 'मौजूदा स्टॉक' : 'Stock Qty'}</th>
                    <th className="p-3 text-right">{isHindi ? 'क्रय मूल्य' : 'Purchase Rate'}</th>
                    <th className="p-3 text-right">{isHindi ? 'बिक्री मूल्य' : 'Sales Rate'}</th>
                    <th className="p-3 text-right">{isHindi ? 'स्टॉक वैल्यू' : 'Cost Value'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-[var(--text-muted)] font-sans">
                        {isHindi ? 'कोई स्टॉक आइटम उपलब्ध नहीं है।' : 'No inventory items found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => {
                      const isLow = (item.currentStock || 0) <= (item.minStockLevel || 0);
                      const itemVal = getItemClosingStockValue(item);
                      return (
                        <tr
                          key={item.id}
                          onClick={() => setDetailModalPayload({
                            kind: 'STOCK_VALUATION',
                            stockType: 'CLOSING',
                            title: isHindi ? `स्टॉक मूल्यांकन — ${item.name}` : `Stock Valuation — ${item.name}`,
                            subtitle: periodLabel,
                            accInventoryOpening: plStats.openingStock
                          })}
                          className="hover:bg-[var(--hover-surface)] cursor-pointer transition-colors"
                          title={isHindi ? 'विस्तृत स्टॉक वैल्यूएशन देखें' : 'Click to inspect stock valuation breakdown'}
                        >
                          <td className="p-3 text-[var(--text-muted)] font-bold">{item.code}</td>
                          <td className="p-3 font-sans">
                            <div className="font-bold text-[var(--text-primary)] underline decoration-[var(--border-subtle)]">{item.name}</div>
                            <div className="text-[10px] text-[var(--text-muted)]">{item.category || 'General'}{item.location ? ` • ${item.location}` : ''}</div>
                          </td>
                          <td className="p-3 text-[var(--text-muted)]">{item.hsnSacCode || '-'}</td>
                          <td className="p-3 text-right font-bold">
                            <span className={isLow ? 'text-rose-500' : 'text-indigo-500'}>
                              {item.currentStock} {item.unit}
                            </span>
                            {isLow && (
                              <span className="ml-1.5 text-[9px] font-sans hv-pill-rose border px-1.5 py-0.5 rounded">LOW</span>
                            )}
                          </td>
                          <td className="p-3 text-right">{formatCurrency(item.purchasePrice, currency)}</td>
                          <td className="p-3 text-right">{formatCurrency(item.salesPrice, currency)}</td>
                          <td className="p-3 text-right font-bold text-emerald-500">
                            {formatCurrency(itemVal, currency)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                {filteredItems.length > 0 && (
                  <tfoot className="hv-elevated font-mono font-bold border-t border-[var(--border-primary)] text-[var(--text-primary)]">
                    <tr>
                      <td colSpan={3} className="p-3 font-sans">{isHindi ? 'कुल स्टॉक मूल्य (Total Valuation)' : 'Total Stock Valuation'}</td>
                      <td className="p-3 text-right text-indigo-500">{stockTotalUnits}</td>
                      <td colSpan={2} />
                      <td className="p-3 text-right text-emerald-500">{formatCurrency(stockCostValue, currency)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}

        {/* 7. PROFIT & LOSS SUMMARY (Full Trading + Indirect Expense Ledger Breakdown) */}
        {activeReport === 'PROFIT_LOSS' && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? 'लाभ-हानि खाता एवं वित्तीय सारांश (P&L Statement)' : 'Profit & Loss Statement Summary'}</span>
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs font-mono">
              {/* Trading & Gross Profit Account */}
              <div className="p-5 rounded-2xl hv-elevated border border-[var(--border-subtle)] space-y-2">
                <p className="font-sans text-xs font-extrabold uppercase tracking-wider text-indigo-500 border-b border-[var(--border-subtle)] pb-2 flex items-center justify-between">
                  <span>{isHindi ? 'ट्रेडिंग व सकल लाभ (Trading Summary)' : 'Trading & Gross Profit'}</span>
                  <span className="text-[10px] font-normal text-[var(--text-muted)]">{isHindi ? 'विवरण हेतु पंक्ति पर क्लिक करें' : 'Click any row for details'}</span>
                </p>

                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'GROUP_LEDGERS',
                    title: isHindi ? 'कुल बिक्री एवं प्रत्यक्ष आय (Sales & Direct Revenues)' : 'Sales & Direct Revenues Breakdown',
                    subtitle: periodLabel,
                    metricLabel: isHindi ? 'शुद्ध बिक्री योग' : 'Net Sales Total',
                    metricValue: plStats.grossSales,
                    accounts: plStats.salesItems.map(x => x.row)
                  })}
                  className="w-full flex justify-between text-[var(--text-secondary)] py-1.5 px-2 rounded-lg hover:bg-[var(--hover-surface)] border-b border-[var(--border-subtle)] cursor-pointer text-left transition"
                >
                  <span className="font-sans font-semibold underline decoration-[var(--border-subtle)]">{isHindi ? 'कुल बिक्री एवं प्रत्यक्ष आय (Net Sales)' : 'Sales & Direct Revenues (Net)'}</span>
                  <span className="text-emerald-500 font-bold">{formatCurrency(plStats.grossSales, currency)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'STOCK_VALUATION',
                    stockType: 'CLOSING',
                    title: isHindi ? 'अंतिम स्टॉक विवरण (Closing Stock)' : 'Closing Stock Valuation Breakdown',
                    subtitle: periodLabel,
                    accInventoryOpening: plStats.openingStock
                  })}
                  className="w-full flex justify-between text-[var(--text-secondary)] py-1.5 px-2 rounded-lg hover:bg-[var(--hover-surface)] border-b border-[var(--border-subtle)] cursor-pointer text-left transition"
                >
                  <span className="font-sans font-semibold underline decoration-[var(--border-subtle)]">{isHindi ? 'अंतिम स्टॉक (Closing Stock)' : 'Closing Stock Valuation'}</span>
                  <span className="text-sky-500 font-bold">{formatCurrency(plStats.closingStock, currency)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'STOCK_VALUATION',
                    stockType: 'OPENING',
                    title: isHindi ? 'प्रारंभिक स्टॉक विवरण (Opening Stock)' : 'Opening Stock Valuation Breakdown',
                    subtitle: periodLabel,
                    accInventoryOpening: plStats.openingStock
                  })}
                  className="w-full flex justify-between text-[var(--text-secondary)] py-1.5 px-2 rounded-lg hover:bg-[var(--hover-surface)] border-b border-[var(--border-subtle)] cursor-pointer text-left transition"
                >
                  <span className="font-sans font-semibold underline decoration-[var(--border-subtle)]">{isHindi ? 'प्रारंभिक स्टॉक (Opening Stock)' : 'Opening Stock'}</span>
                  <span className="text-rose-500 font-bold">{formatCurrency(plStats.openingStock, currency)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'GROUP_LEDGERS',
                    title: isHindi ? 'प्रत्यक्ष व्यय व खरीद (Direct Expenses & Purchases)' : 'Direct Expenses & Purchases Breakdown',
                    subtitle: periodLabel,
                    metricLabel: isHindi ? 'कुल प्रत्यक्ष व्यय व खरीद' : 'Net Direct Cost',
                    metricValue: plStats.totalPurchases,
                    accounts: plStats.directExpenseItems.map(x => x.row)
                  })}
                  className="w-full flex justify-between text-[var(--text-secondary)] py-1.5 px-2 rounded-lg hover:bg-[var(--hover-surface)] border-b border-[var(--border-subtle)] cursor-pointer text-left transition"
                >
                  <span className="font-sans font-semibold underline decoration-[var(--border-subtle)]">{isHindi ? 'कुल प्रत्यक्ष व्यय व खरीद (Net)' : 'Direct Expenses & Purchases (Net)'}</span>
                  <span className="text-rose-500 font-bold">{formatCurrency(plStats.totalPurchases, currency)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'GROUP_LEDGERS',
                    title: isHindi ? 'ट्रेडिंग खाता पूर्ण विवरण (Gross Profit Calculation)' : 'Trading Account Complete Ledgers',
                    subtitle: periodLabel,
                    formulaHint: `(Sales ${formatCurrency(plStats.grossSales, currency)} + Closing Stock ${formatCurrency(plStats.closingStock, currency)}) − (Opening Stock ${formatCurrency(plStats.openingStock, currency)} + Direct Purchases & Expenses ${formatCurrency(plStats.totalPurchases, currency)})`,
                    metricLabel: isHindi ? 'सकल लाभ / हानि' : 'Gross Profit / Loss',
                    metricValue: plStats.grossProfit,
                    accounts: [...plStats.salesItems.map(x => x.row), ...plStats.directExpenseItems.map(x => x.row)]
                  })}
                  className="w-full flex justify-between pt-2 px-2 py-1.5 rounded-lg hover:bg-[var(--hover-surface)] text-sm font-bold cursor-pointer text-left transition"
                >
                  <span className="font-sans text-[var(--text-primary)] underline decoration-[var(--border-subtle)]">{isHindi ? 'सकल लाभ (Gross Profit / Loss):' : 'Gross Profit / Loss:'}</span>
                  <span className={plStats.grossProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                    {formatCurrency(plStats.grossProfit, currency)}
                  </span>
                </button>
              </div>

              {/* Indirect Incomes, Voucher Expenses & Net Profit */}
              <div className="p-5 rounded-2xl hv-elevated border border-[var(--border-subtle)] space-y-2.5">
                <p className="font-sans text-xs font-extrabold uppercase tracking-wider text-amber-500 border-b border-[var(--border-subtle)] pb-2">
                  {isHindi ? 'अप्रत्यक्ष खर्च, आय व शुद्ध लाभ (Expenses & Net P&L)' : 'Indirect Expenses, Other Income & Net Profit'}
                </p>

                {plStats.otherIncomeItems.length > 0 && (
                  <div className="space-y-1 border-b border-[var(--border-subtle)] pb-2">
                    <div className="font-sans text-[11px] font-bold text-emerald-500">{isHindi ? 'अन्य आय (Indirect Income):' : 'Other Income:'}</div>
                    {plStats.otherIncomeItems.map((inc) => (
                      <button
                        type="button"
                        key={inc.id}
                        onClick={() => setSelectedLedgerTarget({ id: inc.id, name: inc.name, preferredKind: 'ACCOUNT' })}
                        className="w-full flex justify-between text-[var(--text-secondary)] text-xs py-1 px-2 rounded hover:bg-[var(--hover-surface)] cursor-pointer text-left transition"
                      >
                        <span className="font-sans hover:underline">{inc.name}</span>
                        <span className="text-emerald-500 font-semibold">{formatCurrency(inc.amount, currency)}</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-1">
                  <div className="font-sans text-[11px] font-bold text-rose-500">
                    {isHindi ? 'अप्रत्यक्ष एवं परिचालन खर्च (Indirect Expenses):' : 'Operating & Indirect Expenses:'}
                  </div>
                  {plStats.expenseItems.length === 0 ? (
                    <p className="font-sans text-xs text-[var(--text-muted)]">
                      {isHindi ? 'चुनी गई अवधि में कोई वाउचर खर्च दर्ज नहीं है।' : 'No indirect expense vouchers recorded in selected period.'}
                    </p>
                  ) : (
                    plStats.expenseItems.map((exp) => (
                      <button
                        type="button"
                        key={exp.id}
                        onClick={() => setSelectedLedgerTarget({ id: exp.id, name: exp.name, preferredKind: 'ACCOUNT' })}
                        className="w-full flex justify-between text-[var(--text-secondary)] py-1 px-2 rounded hover:bg-[var(--hover-surface)] border-b border-[var(--border-subtle)] cursor-pointer text-left transition"
                        title={isHindi ? 'लेजर स्टेटमेंट खोलें' : 'Click to open ledger'}
                      >
                        <span className="font-sans hover:underline">{exp.name}</span>
                        <span className="text-rose-500 font-semibold">{formatCurrency(exp.amount, currency)}</span>
                      </button>
                    ))
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'GROUP_LEDGERS',
                    title: isHindi ? 'कुल अप्रत्यक्ष खर्च (Indirect Expenses Breakdown)' : 'Total Indirect Expenses Breakdown',
                    subtitle: periodLabel,
                    metricLabel: isHindi ? 'कुल अप्रत्यक्ष खर्च' : 'Total Indirect Expenses',
                    metricValue: plStats.totalVoucherExpenses,
                    accounts: plStats.expenseItems.map(x => x.row)
                  })}
                  className="w-full flex justify-between text-[var(--text-secondary)] pt-2 px-2 py-1 rounded hover:bg-[var(--hover-surface)] border-t border-[var(--border-subtle)] cursor-pointer text-left transition"
                >
                  <span className="font-sans font-bold underline decoration-[var(--border-subtle)]">{isHindi ? 'कुल अप्रत्यक्ष खर्च:' : 'Total Indirect Expenses:'}</span>
                  <span className="text-rose-500 font-bold">{formatCurrency(plStats.totalVoucherExpenses, currency)}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setDetailModalPayload({
                    kind: 'GROUP_LEDGERS',
                    title: isHindi ? 'शुद्ध लाभ / हानि गणना (Net Profit Breakdown)' : 'Net Profit / Loss Breakdown',
                    subtitle: periodLabel,
                    formulaHint: `Gross Profit (${formatCurrency(plStats.grossProfit, currency)}) + Other Income (${formatCurrency(plStats.totalOtherIncome, currency)}) − Indirect Expenses (${formatCurrency(plStats.totalVoucherExpenses, currency)})`,
                    metricLabel: isHindi ? 'शुद्ध लाभ / हानि' : 'Net Profit / Loss',
                    metricValue: plStats.netProfit,
                    accounts: [
                      ...plStats.salesItems.map(x => x.row),
                      ...plStats.directExpenseItems.map(x => x.row),
                      ...plStats.otherIncomeItems.map(x => x.row),
                      ...plStats.expenseItems.map(x => x.row),
                    ]
                  })}
                  className="w-full flex justify-between py-2 px-2 rounded-lg hover:bg-[var(--hover-surface)] border-t-2 border-[var(--border-primary)] text-sm font-extrabold cursor-pointer text-left transition"
                >
                  <span className="font-sans text-[var(--text-primary)] underline decoration-[var(--border-subtle)]">{isHindi ? 'शुद्ध लाभ / हानि (Net Profit / Loss):' : 'Net Profit / Loss:'}</span>
                  <span className={plStats.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}>
                    {formatCurrency(plStats.netProfit, currency)}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 8. DEBIT & CREDIT NOTES REPORT */}
        {activeReport === 'DEBIT_CREDIT_NOTES' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल नोट्स' : 'Total Notes'}</p>
                <p className="text-lg font-extrabold font-mono text-[var(--text-primary)] mt-0.5">{debitCreditNotes.length}</p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'डेबिट नोट्स (Purchase Return)' : 'Debit Notes Total'}</p>
                <p className="text-lg font-extrabold font-mono text-rose-500 mt-0.5">
                  {formatCurrency(debitCreditNotes.filter(n => n.type === 'DEBIT_NOTE').reduce((s, n) => s + n.grandTotal, 0), currency)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'क्रेडिट नोट्स (Sales Return)' : 'Credit Notes Total'}</p>
                <p className="text-lg font-extrabold font-mono text-emerald-500 mt-0.5">
                  {formatCurrency(debitCreditNotes.filter(n => n.type === 'CREDIT_NOTE').reduce((s, n) => s + n.grandTotal, 0), currency)}
                </p>
              </div>
              <div className="p-3.5 rounded-xl hv-elevated border border-[var(--border-subtle)]">
                <p className="text-[var(--text-muted)]">{isHindi ? 'कुल टैक्स समायोजन' : 'Total Tax Adjusted'}</p>
                <p className="text-lg font-extrabold font-mono text-amber-500 mt-0.5">
                  {formatCurrency(debitCreditNotes.reduce((s, n) => s + n.totalTax, 0), currency)}
                </p>
              </div>
            </div>

            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-500" />
              <span>{isHindi ? 'डेबिट व क्रेडिट नोट रजिस्टर (Debit & Credit Notes Log)' : 'Debit & Credit Notes Register'}</span>
            </h3>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="hv-elevated text-[var(--text-secondary)] font-semibold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3">{isHindi ? 'नोट सं.' : 'Note No'}</th>
                    <th className="p-3">{isHindi ? 'प्रकार' : 'Type'}</th>
                    <th className="p-3">{isHindi ? 'तारीख' : 'Date'}</th>
                    <th className="p-3">{isHindi ? 'पार्टी नाम' : 'Party Name'}</th>
                    <th className="p-3">{isHindi ? 'कारण' : 'Reason'}</th>
                    <th className="p-3 text-right">{isHindi ? 'सबटोटल' : 'Subtotal'}</th>
                    <th className="p-3 text-right">{isHindi ? 'टैक्स' : 'Tax'}</th>
                    <th className="p-3 text-right">{isHindi ? 'कुल राशि' : 'Grand Total'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  {debitCreditNotes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[var(--text-muted)] font-sans">
                        {isHindi ? 'चुनी गई अवधि में कोई डेबिट/क्रेडिट नोट रिकॉर्ड उपलब्ध नहीं है।' : 'No debit or credit notes found for selected period.'}
                      </td>
                    </tr>
                  ) : (
                    debitCreditNotes.map((dcn) => (
                      <tr key={dcn.id} className="hover:bg-[var(--hover-surface)]">
                        <td className="p-3 font-bold text-indigo-500">{dcn.noteNumber}</td>
                        <td className="p-3 font-sans">
                          <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${
                            dcn.type === 'DEBIT_NOTE' ? 'hv-pill-rose' : 'hv-pill-emerald'
                          }`}>
                            {dcn.type}
                          </span>
                        </td>
                        <td className="p-3 text-[var(--text-secondary)]">{dcn.date}</td>
                        <td className="p-3 font-sans font-bold text-[var(--text-primary)]">
                          <button
                            type="button"
                            onClick={() => setSelectedLedgerTarget({ id: dcn.partyId, name: dcn.partyName, preferredKind: 'PARTY' })}
                            className="text-indigo-500 hover:opacity-80 font-bold hover:underline text-left cursor-pointer"
                            title={isHindi ? 'खाता बही (Ledger) देखें' : 'Click to View Detailed Ledger Statement'}
                          >
                            {dcn.partyName}
                          </button>
                        </td>
                        <td className="p-3 font-sans text-[var(--text-muted)]">{dcn.reason}</td>
                        <td className="p-3 text-right">{formatCurrency(dcn.subtotal, currency)}</td>
                        <td className="p-3 text-right text-emerald-500">{formatCurrency(dcn.totalTax, currency)}</td>
                        <td className="p-3 text-right font-bold text-amber-500">{formatCurrency(dcn.grandTotal, currency)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Financial Group / Stock / Transaction Drilldown Modal */}
      {detailModalPayload && (
        <FinancialDetailModal
          data={data}
          isHindi={isHindi}
          payload={detailModalPayload}
          onClose={() => setDetailModalPayload(null)}
          onInspectAccountOrParty={(id, name, preferredKind) => {
            setDetailModalPayload(null);
            setSelectedLedgerTarget({ id, name, preferredKind });
          }}
        />
      )}

      {/* Ledger Drilldown Modal */}
      {selectedLedgerTarget && (
        <LedgerDrilldownModal
          data={data}
          isHindi={isHindi}
          partyOrAccountId={selectedLedgerTarget.id}
          targetName={selectedLedgerTarget.name}
          preferredKind={selectedLedgerTarget.preferredKind}
          onClose={() => setSelectedLedgerTarget(null)}
        />
      )}
    </div>
  );
};
