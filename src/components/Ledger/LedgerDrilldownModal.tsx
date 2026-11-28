import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Printer,
  Download,
  Filter,
  FileText,
  Calendar,
  List,
  ChevronRight,
  Pencil,
  ArrowLeft,
  Eye,
} from 'lucide-react';
import {
  AppData,
  DebitCreditNote,
  PurchaseInvoice,
  SalesInvoice,
  Voucher,
} from '../../types';
import { formatCurrency } from '../../utils/storage';
import { printHtmlDocument } from '../../utils/printReport';
import {
  buildAccountOrPartyLedgerStatement,
  buildMonthlyLedgerSummary,
  LedgerStatementRow,
} from '../../utils/accounting';
import { FinancialDetailModal } from './FinancialDetailModal';

interface LedgerDrilldownModalProps {
  data: AppData;
  isHindi: boolean;
  partyOrAccountId?: string;
  targetName?: string;
  preferredKind?: 'ACCOUNT' | 'PARTY';
  reportTitle?: string;
  isEditModalOpen?: boolean;
  onClose: () => void;
  onEditInvoice?: (inv: SalesInvoice) => void;
  onEditPurchaseBill?: (pur: PurchaseInvoice) => void;
  onEditVoucher?: (vch: Voucher) => void;
}

export const LedgerDrilldownModal: React.FC<LedgerDrilldownModalProps> = ({
  data,
  isHindi,
  partyOrAccountId,
  targetName,
  preferredKind,
  reportTitle,
  isEditModalOpen = false,
  onClose,
  onEditInvoice,
  onEditPurchaseBill,
  onEditVoucher,
}) => {
  const currency = data.company.currency;
  const company = data.company;

  const resolvedFy =
    company.financialYearStart && company.financialYearStart !== 'ALL'
      ? company.financialYearStart
      : '2026-04-01';
  const currentFyYear = Number(resolvedFy.split('-')[0]) || 2026;
  const currentFYStart = `${currentFyYear}-04-01`;
  const currentFYEnd = `${currentFyYear + 1}-03-31`;
  const prevFYStart = `${currentFyYear - 1}-04-01`;
  const prevFYEnd = `${currentFyYear}-03-31`;

  const [viewMode, setViewMode] = useState<'VOUCHERS' | 'MONTHLY'>('MONTHLY');
  const [fyFilter, setFyFilter] = useState<'CURRENT' | 'PREVIOUS' | 'ALL'>(
    'ALL'
  );
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [selectedMonthLabel, setSelectedMonthLabel] = useState<string>('');
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [selectedTxRow, setSelectedTxRow] = useState<LedgerStatementRow | null>(
    null
  );

  const handleFyChange = (val: 'CURRENT' | 'PREVIOUS' | 'ALL') => {
    setFyFilter(val);
    if (val === 'CURRENT') {
      setStartDate(currentFYStart);
      setEndDate(currentFYEnd);
    } else if (val === 'PREVIOUS') {
      setStartDate(prevFYStart);
      setEndDate(prevFYEnd);
    } else {
      setStartDate('');
      setEndDate('');
    }
  };

  const statement = useMemo(
    () =>
      buildAccountOrPartyLedgerStatement(data, {
        partyOrAccountId,
        targetName,
        preferredKind,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    [data, partyOrAccountId, targetName, preferredKind, startDate, endDate]
  );

  const monthlySummary = useMemo(() => {
    const fyStartOverride =
      fyFilter === 'CURRENT'
        ? currentFYStart
        : fyFilter === 'PREVIOUS'
        ? prevFYStart
        : startDate || undefined;
    return buildMonthlyLedgerSummary(
      data,
      { partyOrAccountId, targetName, preferredKind },
      fyStartOverride
    );
  }, [
    data,
    partyOrAccountId,
    targetName,
    preferredKind,
    fyFilter,
    currentFYStart,
    prevFYStart,
    startDate,
  ]);

  const ledgerTitle = statement.title;
  const ledgerGstin = statement.gstin;
  const ledgerState = statement.categoryLabel;
  const openingForPeriod = statement.openingForPeriod;
  const totalDebit = statement.totalDebit;
  const totalCredit = statement.totalCredit;
  const closingBalance = statement.closingBalance;
  const closingType = statement.closingType;
  const calculatedRows = statement.rows;

  const stepBackOneLevel = () => {
    if (viewMode === 'VOUCHERS') {
      setViewMode('MONTHLY');
      setStartDate('');
      setEndDate('');
      setSelectedMonthLabel('');
      setSelectedIndex(0);
    } else {
      onClose();
    }
  };

  // Keyboard navigation: Esc steps back 1 level (TX_DETAIL -> VOUCHERS -> MONTHLY -> Close), Enter opens row
  useEffect(() => {
    if (selectedTxRow || isEditModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        stepBackOneLevel();
        return;
      }

      if (isInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => prev + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        if (viewMode === 'MONTHLY' && monthlySummary.months.length > 0) {
          const m =
            monthlySummary.months[
              Math.min(selectedIndex, monthlySummary.months.length - 1)
            ];
          if (m) {
            e.preventDefault();
            handleOpenMonth(m.startDate, m.endDate, m.label);
          }
        } else if (viewMode === 'VOUCHERS' && calculatedRows.length > 0) {
          const row =
            calculatedRows[Math.min(selectedIndex, calculatedRows.length - 1)];
          if (row && row.rawObj) {
            e.preventDefault();
            handleRowInspect(row);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  const handleOpenMonth = (mStart: string, mEnd: string, label?: string) => {
    setStartDate(mStart);
    setEndDate(mEnd);
    setSelectedMonthLabel(label || `${mStart} → ${mEnd}`);
    setSelectedIndex(0);
    setViewMode('VOUCHERS');
  };

  const handleRowInspect = (row: LedgerStatementRow) => {
    if (!row.rawObj) return;
    if (row.sourceType === 'SALES_INVOICE' && onEditInvoice) {
      const liveInv =
        (data.invoices || []).find((i) => i.id === row.rawObj?.id) ||
        (row.rawObj as SalesInvoice);
      onEditInvoice(liveInv);
      return;
    }
    if (row.sourceType === 'PURCHASE_BILL' && onEditPurchaseBill) {
      const livePur =
        (data.purchaseInvoices || []).find((p) => p.id === row.rawObj?.id) ||
        (row.rawObj as PurchaseInvoice);
      onEditPurchaseBill(livePur);
      return;
    }
    if (row.sourceType === 'VOUCHER' && onEditVoucher) {
      const liveVch =
        (data.vouchers || []).find((v) => v.id === row.rawObj?.id) ||
        (row.rawObj as Voucher);
      onEditVoucher(liveVch);
      return;
    }
    setSelectedTxRow(row);
  };

  const handleExportCSV = () => {
    let csv =
      '\uFEFFDate,Voucher No,Voucher Type,Particulars,Debit (₹),Credit (₹),Running Balance\n';
    csv += `,,,"Opening Balance",,,${Math.abs(openingForPeriod)} ${
      openingForPeriod >= 0 ? 'DR' : 'CR'
    }\n`;

    calculatedRows.forEach((row) => {
      csv += `"${row.date}","${row.voucherNo}","${row.voucherType}","${row.particulars.replace(
        /"/g,
        '""'
      )}",${row.debit},${row.credit},"${row.runningBalance} ${row.runningType}"\n`;
    });

    csv += `,,,"Total Transactions",${totalDebit},${totalCredit},\n`;
    csv += `,,,"Closing Balance",,,${closingBalance} ${closingType}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ledger_${ledgerTitle.replace(/[^a-z0-9]/gi, '_')}_${
      startDate || 'ALL'
    }_to_${endDate || 'PRESENT'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    let rowsHtml = `
      <tr>
        <td style="font-weight:bold;">${startDate || 'Opening'}</td>
        <td>-</td>
        <td style="font-weight:bold;">Opening Balance</td>
        <td style="font-weight:bold;">B/F Balance</td>
        <td class="text-right">${
          openingForPeriod >= 0 ? formatCurrency(openingForPeriod, currency) : '-'
        }</td>
        <td class="text-right">${
          openingForPeriod < 0
            ? formatCurrency(Math.abs(openingForPeriod), currency)
            : '-'
        }</td>
        <td class="text-right font-mono" style="font-weight:bold;">${formatCurrency(
          Math.abs(openingForPeriod),
          currency
        )} ${openingForPeriod >= 0 ? 'Dr' : 'Cr'}</td>
      </tr>
    `;

    calculatedRows.forEach((row) => {
      rowsHtml += `
        <tr>
          <td>${row.date}</td>
          <td style="font-family: monospace; font-weight: bold;">${row.voucherNo}</td>
          <td>${row.voucherType}</td>
          <td>${row.particulars}</td>
          <td class="text-right">${
            row.debit > 0 ? formatCurrency(row.debit, currency) : '-'
          }</td>
          <td class="text-right">${
            row.credit > 0 ? formatCurrency(row.credit, currency) : '-'
          }</td>
          <td class="text-right font-mono">${formatCurrency(
            row.runningBalance,
            currency
          )} ${row.runningType === 'DR' ? 'Dr' : 'Cr'}</td>
        </tr>
      `;
    });

    rowsHtml += `
      <tr style="font-weight: bold; background: #f8fafc;">
        <td colspan="4">TOTAL PERIOD TRANSACTIONS</td>
        <td class="text-right">${formatCurrency(totalDebit, currency)}</td>
        <td class="text-right">${formatCurrency(totalCredit, currency)}</td>
        <td class="text-right font-mono">${formatCurrency(
          closingBalance,
          currency
        )} ${closingType === 'DR' ? 'Dr' : 'Cr'}</td>
      </tr>
    `;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Ledger Statement - ${ledgerTitle}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #0f172a; font-size: 11px; }
            .header { border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 15px; display: flex; justify-content: space-between; }
            .company { font-size: 18px; font-weight: bold; }
            .title { font-size: 14px; color: #2563eb; font-weight: bold; margin-top: 5px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #f1f5f9; padding: 6px; border: 1px solid #cbd5e1; text-align: left; }
            td { padding: 6px; border: 1px solid #e2e8f0; }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="company">${company.name}</div>
              <div>${company.address} | GSTIN: ${company.gstin}</div>
              <div class="title">ACCOUNT LEDGER STATEMENT: ${ledgerTitle} ${
      ledgerGstin ? `(GSTIN: ${ledgerGstin})` : ''
    }</div>
            </div>
            <div class="text-right">
              <div><b>Period:</b> ${startDate || 'Beginning'} to ${
      endDate || 'Present'
    }</div>
              <div><b>Generated:</b> ${new Date().toLocaleString()}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Voucher No</th>
                <th>Voucher Type</th>
                <th>Particulars</th>
                <th class="text-right">Debit (${currency})</th>
                <th class="text-right">Credit (${currency})</th>
                <th class="text-right">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `;

    printHtmlDocument(html);
  };

  const selectedTxPayload = useMemo(() => {
    if (!selectedTxRow || !selectedTxRow.rawObj) return null;
    if (selectedTxRow.sourceType === 'SALES_INVOICE') {
      return {
        kind: 'TRANSACTION_DETAIL' as const,
        title: `Sales Invoice #${selectedTxRow.voucherNo}`,
        voucherKind: 'SALES' as const,
        record: selectedTxRow.rawObj as SalesInvoice,
      };
    }
    if (selectedTxRow.sourceType === 'PURCHASE_BILL') {
      return {
        kind: 'TRANSACTION_DETAIL' as const,
        title: `Purchase Bill #${selectedTxRow.voucherNo}`,
        voucherKind: 'PURCHASE' as const,
        record: selectedTxRow.rawObj as PurchaseInvoice,
      };
    }
    if (selectedTxRow.sourceType === 'DEBIT_CREDIT_NOTE') {
      const note = selectedTxRow.rawObj as DebitCreditNote;
      return {
        kind: 'TRANSACTION_DETAIL' as const,
        title: `${
          note.type === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'
        } #${selectedTxRow.voucherNo}`,
        voucherKind:
          note.type === 'CREDIT_NOTE'
            ? ('CREDIT_NOTE' as const)
            : ('DEBIT_NOTE' as const),
        record: note,
      };
    }
    return {
      kind: 'TRANSACTION_DETAIL' as const,
      title: `${selectedTxRow.voucherType} #${selectedTxRow.voucherNo}`,
      voucherKind: 'VOUCHER' as const,
      record: selectedTxRow.rawObj as Voucher,
    };
  }, [selectedTxRow]);

  return (
    <>
      <div
        className={`${
          isEditModalOpen ? 'hidden' : 'fixed'
        } inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn`}
      >
        <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
          {/* Header */}
          <div className="hv-elevated px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={stepBackOneLevel}
                className="p-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] transition cursor-pointer shrink-0"
                title={
                  viewMode === 'VOUCHERS'
                    ? isHindi
                      ? 'मासिक सारांश पर वापस जाएँ (Esc)'
                      : 'Back to Monthly Summary (Esc)'
                    : isHindi
                    ? 'रिपोर्ट पर वापस जाएँ (Esc)'
                    : 'Back to Report (Esc)'
                }
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="p-2.5 hv-pill-indigo border rounded-xl shrink-0">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-base text-[var(--text-primary)] truncate">
                    {ledgerTitle}
                  </h3>
                  {ledgerGstin && (
                    <span className="font-mono text-[11px] text-amber-500 font-semibold">
                      GSTIN: {ledgerGstin}
                    </span>
                  )}
                  {ledgerState && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      • {ledgerState}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                  {viewMode === 'MONTHLY'
                    ? isHindi
                      ? 'स्तर 2: मासिक सारांश (अप्रैल–मार्च) • माह पर क्लिक करके वाउचर देखें'
                      : 'Level 2: Monthly Summary (Apr–Mar) • Click any month for exact voucher list'
                    : isHindi
                    ? 'स्तर 3: वाउचर रजिस्टर • वाउचर पर क्लिक करके सीधे एडिट मोडल खोलें'
                    : 'Level 3: Voucher Register • Click any voucher row to open edit modal'}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Clickable Breadcrumb Bar */}
          <div className="px-5 py-2 hv-surface border-b border-[var(--border-primary)] flex items-center flex-wrap gap-1.5 text-[11px] shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer underline-offset-2 hover:underline font-medium"
            >
              {reportTitle || (isHindi ? 'वित्तीय रिपोर्ट' : 'Financial Report')}
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
            <button
              type="button"
              disabled={viewMode === 'MONTHLY'}
              onClick={() => {
                setViewMode('MONTHLY');
                setStartDate('');
                setEndDate('');
                setSelectedMonthLabel('');
                setSelectedIndex(0);
              }}
              className={`truncate max-w-[240px] ${
                viewMode === 'MONTHLY'
                  ? 'text-indigo-500 font-bold cursor-default'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer underline-offset-2 hover:underline'
              }`}
            >
              {ledgerTitle} (Apr–Mar)
            </button>
            {viewMode === 'VOUCHERS' && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                <span className="text-indigo-500 font-bold truncate max-w-[220px]">
                  {selectedMonthLabel ||
                    (startDate && endDate
                      ? `${startDate} → ${endDate}`
                      : isHindi
                      ? 'सभी वाउचर'
                      : 'All Vouchers')}
                </span>
              </>
            )}
            <span className="ml-auto text-[10px] text-[var(--text-muted)] font-mono hidden sm:inline">
              ↑↓ Move • Enter: Open • Esc: Step Back ({viewMode === 'VOUCHERS' ? 'Monthly Summary' : 'Close'})
            </span>
          </div>

          {/* Toolbar & View Mode + FY Selector */}
          <div className="hv-elevated p-3.5 px-5 border-b border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-[var(--bg-input)] p-0.5 rounded-xl border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('MONTHLY');
                    setStartDate('');
                    setEndDate('');
                    setSelectedMonthLabel('');
                    setSelectedIndex(0);
                  }}
                  className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    viewMode === 'MONTHLY'
                      ? 'bg-indigo-600 text-white hv-keep-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'मासिक सारांश' : 'Monthly Summary'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedIndex(0);
                    setViewMode('VOUCHERS');
                  }}
                  className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                    viewMode === 'VOUCHERS'
                      ? 'bg-indigo-600 text-white hv-keep-white'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <List className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'वाउचर रजिस्टर' : 'Voucher Register'}</span>
                </button>
              </div>

              <span className="text-[var(--text-muted)] font-bold flex items-center gap-1 ml-1">
                <Filter className="w-3.5 h-3.5 text-indigo-500" />
              </span>
              <button
                onClick={() => handleFyChange('CURRENT')}
                className={`px-2.5 py-1.5 rounded-xl font-bold transition border cursor-pointer ${
                  fyFilter === 'CURRENT'
                    ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                {isHindi ? 'वर्तमान FY' : 'Current FY'}
              </button>

              <button
                onClick={() => handleFyChange('PREVIOUS')}
                className={`px-2.5 py-1.5 rounded-xl font-bold transition border cursor-pointer ${
                  fyFilter === 'PREVIOUS'
                    ? 'bg-amber-600 text-white hv-keep-white border-amber-500'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                {isHindi ? 'पिछला FY' : 'Previous FY'}
              </button>

              <button
                onClick={() => handleFyChange('ALL')}
                className={`px-2.5 py-1.5 rounded-xl font-bold transition border cursor-pointer ${
                  fyFilter === 'ALL'
                    ? 'bg-emerald-600 text-white hv-keep-white border-emerald-500'
                    : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                {isHindi ? 'सभी वर्ष' : 'All Years'}
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setFyFilter('ALL');
                  setViewMode('VOUCHERS');
                }}
                className="hv-input border border-[var(--border-subtle)] rounded-xl px-2.5 py-1 font-mono text-xs outline-none focus:border-indigo-500"
              />
              <span className="text-[var(--text-muted)]">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setFyFilter('ALL');
                  setViewMode('VOUCHERS');
                }}
                className="hv-input border border-[var(--border-subtle)] rounded-xl px-2.5 py-1 font-mono text-xs outline-none focus:border-indigo-500"
              />

              <button
                onClick={handlePrint}
                className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold rounded-xl border border-[var(--border-subtle)] transition flex items-center gap-1.5 cursor-pointer"
                title="Print Ledger Statement"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-500" />
                <span>Print</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="px-3 py-1.5 hv-pill-emerald border hover:brightness-95 font-bold rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Balance Summary Cards */}
          <div className="hv-surface p-3 px-5 border-b border-[var(--border-primary)] grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs shrink-0 font-mono tabular-nums">
            <div className="hv-elevated p-2.5 rounded-xl border border-[var(--border-primary)]">
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-sans font-semibold">
                Opening Balance
              </div>
              <div className="text-sm font-bold text-amber-500 mt-0.5">
                {formatCurrency(Math.abs(openingForPeriod), currency)}{' '}
                {openingForPeriod >= 0 ? 'Dr' : 'Cr'}
              </div>
            </div>

            <div className="hv-elevated p-2.5 rounded-xl border border-[var(--border-primary)]">
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-sans font-semibold">
                Period Total Debit (Dr)
              </div>
              <div className="text-sm font-bold text-sky-500 mt-0.5">
                {formatCurrency(totalDebit, currency)}
              </div>
            </div>

            <div className="hv-elevated p-2.5 rounded-xl border border-[var(--border-primary)]">
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-sans font-semibold">
                Period Total Credit (Cr)
              </div>
              <div className="text-sm font-bold text-emerald-500 mt-0.5">
                {formatCurrency(totalCredit, currency)}
              </div>
            </div>

            <div className="hv-elevated p-2.5 rounded-xl border border-[var(--border-primary)]">
              <div className="text-[10px] text-[var(--text-muted)] uppercase font-sans font-semibold">
                Closing Balance
              </div>
              <div className="text-sm font-extrabold text-indigo-500 mt-0.5">
                {formatCurrency(closingBalance, currency)}{' '}
                {closingType === 'DR' ? 'Dr' : 'Cr'}
              </div>
            </div>
          </div>

          {/* Body: Monthly Summary OR Voucher Register */}
          <div className="p-4 overflow-y-auto flex-1">
            {viewMode === 'MONTHLY' ? (
              <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="hv-elevated text-[var(--text-muted)] uppercase font-semibold text-[11px] sticky top-0 border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="p-3">
                        Month ({monthlySummary.fyLabel})
                      </th>
                      <th className="p-3 text-center">Vouchers</th>
                      <th className="p-3 text-right">Debit ({currency})</th>
                      <th className="p-3 text-right">Credit ({currency})</th>
                      <th className="p-3 text-right">Closing Balance</th>
                      <th className="p-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                    <tr className="hv-elevated text-[var(--text-muted)] italic">
                      <td className="p-3 font-bold">
                        Opening Balance Brought Forward
                      </td>
                      <td className="p-3 text-center">-</td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        {monthlySummary.statement.openingForPeriod >= 0
                          ? formatCurrency(
                              monthlySummary.statement.openingForPeriod,
                              currency
                            )
                          : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums">
                        {monthlySummary.statement.openingForPeriod < 0
                          ? formatCurrency(
                              Math.abs(
                                monthlySummary.statement.openingForPeriod
                              ),
                              currency
                            )
                          : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-amber-500">
                        {formatCurrency(
                          Math.abs(monthlySummary.statement.openingForPeriod),
                          currency
                        )}{' '}
                        {monthlySummary.statement.openingForPeriod >= 0
                          ? 'Dr'
                          : 'Cr'}
                      </td>
                      <td></td>
                    </tr>

                    {monthlySummary.months.map((m, idx) => {
                      const isSelected = idx === selectedIndex;
                      return (
                        <tr
                          key={m.monthKey}
                          onClick={() => handleOpenMonth(m.startDate, m.endDate, m.label)}
                          className={`cursor-pointer transition group ${
                            isSelected ? 'bg-indigo-500/15' : 'hover:bg-[var(--hover-surface)]'
                          }`}
                        >
                          <td className="p-3 font-bold text-[var(--text-primary)] group-hover:text-indigo-500">
                            {m.label}
                          </td>
                          <td className="p-3 text-center font-mono tabular-nums text-[var(--text-muted)]">
                            {m.txCount > 0 ? m.txCount : '—'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-sky-500 font-bold">
                            {m.debit > 0.005
                              ? formatCurrency(m.debit, currency)
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-emerald-500 font-bold">
                            {m.credit > 0.005
                              ? formatCurrency(m.credit, currency)
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-bold text-[var(--text-primary)]">
                            {m.closingBalance > 0.005
                              ? `${formatCurrency(m.closingBalance, currency)} ${
                                  m.closingType === 'DR' ? 'Dr' : 'Cr'
                                }`
                              : '₹0.00'}
                          </td>
                          <td className="p-3 text-right text-[var(--text-muted)] group-hover:text-indigo-500">
                            <ChevronRight className="w-4 h-4 inline" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="hv-elevated text-[var(--text-muted)] uppercase font-semibold text-[11px] sticky top-0 border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="p-3 w-28">Date</th>
                      <th className="p-3 w-28">Voucher No</th>
                      <th className="p-3 w-32">Type</th>
                      <th className="p-3 min-w-[200px]">Particulars</th>
                      <th className="p-3 w-28 text-right">
                        Debit ({currency})
                      </th>
                      <th className="p-3 w-28 text-right">
                        Credit ({currency})
                      </th>
                      <th className="p-3 w-32 text-right">Running Balance</th>
                      <th className="p-3 w-16 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)] hv-surface font-sans">
                    {/* Opening row */}
                    <tr className="hv-elevated text-[var(--text-muted)] font-semibold italic">
                      <td className="p-2.5 font-mono">
                        {startDate || 'Opening'}
                      </td>
                      <td className="p-2.5 font-mono">-</td>
                      <td className="p-2.5">Opening</td>
                      <td className="p-2.5">Opening Balance Brought Forward</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">
                        {openingForPeriod >= 0
                          ? formatCurrency(openingForPeriod, currency)
                          : '-'}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums">
                        {openingForPeriod < 0
                          ? formatCurrency(Math.abs(openingForPeriod), currency)
                          : '-'}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-amber-500">
                        {formatCurrency(Math.abs(openingForPeriod), currency)}{' '}
                        {openingForPeriod >= 0 ? 'Dr' : 'Cr'}
                      </td>
                      <td></td>
                    </tr>

                    {calculatedRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="p-8 text-center text-[var(--text-muted)]"
                        >
                          {isHindi
                            ? 'चयनित अवधि में कोई लेनदेन नहीं पाया गया'
                            : 'No ledger transactions recorded in selected financial year / period'}
                        </td>
                      </tr>
                    ) : (
                      calculatedRows.map((row, idx) => {
                        const isSelected = idx === selectedIndex;
                        const isEditable =
                          (row.sourceType === 'SALES_INVOICE' && Boolean(onEditInvoice)) ||
                          (row.sourceType === 'PURCHASE_BILL' && Boolean(onEditPurchaseBill)) ||
                          (row.sourceType === 'VOUCHER' && Boolean(onEditVoucher));
                        return (
                          <tr
                            key={row.id}
                            onClick={() => handleRowInspect(row)}
                            className={`cursor-pointer transition group ${
                              isSelected ? 'bg-indigo-500/15' : 'hover:bg-[var(--hover-surface)]'
                            }`}
                          >
                            <td className="p-2.5 font-mono tabular-nums text-[var(--text-secondary)]">
                              {row.date}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-indigo-500 group-hover:underline">
                              {row.voucherNo}
                            </td>
                            <td className="p-2.5 text-[var(--text-secondary)]">
                              {row.voucherType}
                            </td>
                            <td className="p-2.5 text-[var(--text-primary)]">
                              {row.particulars}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums font-bold text-sky-500">
                              {row.debit > 0
                                ? formatCurrency(row.debit, currency)
                                : '-'}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums font-bold text-emerald-500">
                              {row.credit > 0
                                ? formatCurrency(row.credit, currency)
                                : '-'}
                            </td>
                            <td className="p-2.5 text-right font-mono tabular-nums font-bold text-[var(--text-primary)]">
                              {formatCurrency(row.runningBalance, currency)}{' '}
                              <span
                                className={
                                  row.runningType === 'DR'
                                    ? 'text-amber-500'
                                    : 'text-emerald-500'
                                }
                              >
                                {row.runningType === 'DR' ? 'Dr' : 'Cr'}
                              </span>
                            </td>
                            <td className="p-2.5 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1">
                                {row.rawObj && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTxRow(row);
                                    }}
                                    className="p-1 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] cursor-pointer"
                                    title={isHindi ? 'विवरण देखें' : 'Inspect Breakdown'}
                                  >
                                    <Eye className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {isEditable && (
                                  <span
                                    className="p-1 rounded-lg hv-pill-indigo border group-hover:bg-indigo-600 group-hover:text-white transition"
                                    title={isHindi ? 'संपादित करें' : 'Open Edit Modal'}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
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

          {/* Footer Actions */}
          <div className="hv-elevated p-4 border-t border-[var(--border-primary)] flex items-center justify-between shrink-0 text-xs">
            <div className="text-[var(--text-muted)] flex items-center gap-2 font-mono tabular-nums">
              <span>Closing Position:</span>
              <span className="text-[var(--text-primary)] font-bold bg-[var(--bg-surface)] px-2.5 py-1 rounded-lg border border-[var(--border-subtle)]">
                {formatCurrency(closingBalance, currency)}{' '}
                {closingType === 'DR' ? 'Dr' : 'Cr'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {viewMode === 'VOUCHERS' && (
                <button
                  type="button"
                  onClick={stepBackOneLevel}
                  className="px-4 py-2 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold rounded-xl transition cursor-pointer"
                >
                  {isHindi ? '← मासिक सारांश (Esc)' : '← Monthly Summary (Esc)'}
                </button>
              )}
              <button
                onClick={onClose}
                className="px-5 py-2 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold rounded-xl transition cursor-pointer"
              >
                {isHindi ? 'बंद करें' : 'Close Statement'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Layer 4 Transaction Breakdown + Direct Edit Modal */}
      {selectedTxPayload && (
        <FinancialDetailModal
          data={data}
          isHindi={isHindi}
          payload={selectedTxPayload}
          reportTitle={`${ledgerTitle} › ${selectedMonthLabel || 'Vouchers'}`}
          isEditModalOpen={isEditModalOpen}
          onClose={() => setSelectedTxRow(null)}
          onEditInvoice={onEditInvoice}
          onEditPurchaseBill={onEditPurchaseBill}
          onEditVoucher={onEditVoucher}
        />
      )}
    </>
  );
};
