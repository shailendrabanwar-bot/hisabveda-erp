import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, Printer, Trash2, Edit, Eye, AlertTriangle, Settings2, X, Calendar, MessageCircle } from 'lucide-react';
import { AppData, SalesInvoice, PurchaseInvoice, Voucher, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getCurrentFinancialYearStart } from '../../utils/fiscalYear';
import { printAccountLedger, printAccountLedgerCustom, printPartyLedger } from '../../utils/printReport';
import {
  buildAccountOrPartyLedgerStatement,
  calculateAccountBalances,
  mergeAccountsWithBalancesMap
} from '../../utils/accounting';
import { buildWhatsAppLedgerReminderUrl } from '../../utils/enterpriseErpHelpers';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';

interface GeneralLedgerViewProps {
  data: AppData;
  masterData?: AppData;
  accountId: string;
  isHindi: boolean;
  onBack: () => void;
  onDeleteVoucher?: (vchId: string) => void;
  onDeleteInvoice?: (invId: string) => void;
  onDeletePurchaseInvoice?: (purId: string) => void;
  onDeleteDebitCreditNote?: (noteId: string) => void;
  onDeleteBatchVouchers?: (vchIds: string[]) => void;
  onDeleteBatchInvoices?: (invIds: string[]) => void;
  onDeleteBatchPurchaseInvoices?: (purIds: string[]) => void;
  onDeleteBatchDebitCreditNotes?: (noteIds: string[]) => void;
  onEditInvoice?: (inv: SalesInvoice) => void;
  onEditPurchaseBill?: (pur: PurchaseInvoice) => void;
  onEditVoucher?: (vch: Voucher) => void;
  onBulkReclassifyVouchers?: (voucherIds: string[], newCounterAccountId: string) => void;
  onPrintInvoice?: (inv: SalesInvoice) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const GeneralLedgerView: React.FC<GeneralLedgerViewProps> = ({
  data: activeFyData,
  masterData,
  accountId,
  isHindi,
  onBack,
  onDeleteVoucher,
  onDeleteInvoice,
  onDeletePurchaseInvoice,
  onDeleteDebitCreditNote,
  onDeleteBatchVouchers,
  onDeleteBatchInvoices,
  onDeleteBatchPurchaseInvoices,
  onDeleteBatchDebitCreditNotes,
  onEditInvoice,
  onEditPurchaseBill,
  onEditVoucher,
  onBulkReclassifyVouchers,
  onPrintInvoice,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const [currentAccountId, setCurrentAccountId] = useState<string>(accountId);
  useEffect(() => {
    setCurrentAccountId(accountId);
  }, [accountId]);

  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    type: 'VOUCHER' | 'SALES_INVOICE' | 'PURCHASE_BILL' | 'DEBIT_CREDIT_NOTE';
    id: string;
    voucherNo: string;
  } | null>(null);

  const [showReclassifyModal, setShowReclassifyModal] = useState<boolean>(false);
  const [targetReclassifyAccountId, setTargetReclassifyAccountId] = useState<string>('acc_suspense');

  // Display Toggles (User defaults: narration hidden by default)
  const [showNarration, setShowNarration] = useState<boolean>(false);
  const [showBankRef, setShowBankRef] = useState<boolean>(true);
  const [showOpposingLedger, setShowOpposingLedger] = useState<boolean>(true);

  // Date Range / Period Filter States
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('ALL');

  // Use complete multi-year masterData for All Years / 2022–Current / Custom Date Ranges,
  // and activeFyData (with carried-forward opening balances) when scoped to Active FY.
  const data = useMemo(
    () => (datePreset === 'THIS_FY' ? activeFyData : (masterData || activeFyData)),
    [datePreset, activeFyData, masterData]
  );

  // Print Modal & Options
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printOptNarration, setPrintOptNarration] = useState<boolean>(false);
  const [printOptBankRef, setPrintOptBankRef] = useState<boolean>(true);
  const [printOptOpposing, setPrintOptOpposing] = useState<boolean>(true);
  const [printOptRunningBal, setPrintOptRunningBal] = useState<boolean>(true);
  const [printFromDate, setPrintFromDate] = useState<string>('');
  const [printToDate, setPrintToDate] = useState<string>('');

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    const todayIso = today.toISOString().split('T')[0];
    const currYear = today.getFullYear();
    const currMonth = today.getMonth();

    if (preset === 'ALL') {
      setFromDate('');
      setToDate('');
    } else if (preset === 'ALL_TO_CURRENT') {
      setFromDate('');
      setToDate(todayIso);
    } else if (preset === 'THIS_MONTH') {
      const firstDay = new Date(currYear, currMonth, 1).toISOString().split('T')[0];
      const lastDay = new Date(currYear, currMonth + 1, 0).toISOString().split('T')[0];
      setFromDate(firstDay);
      setToDate(lastDay);
    } else if (preset === 'LAST_MONTH') {
      const firstDay = new Date(currYear, currMonth - 1, 1).toISOString().split('T')[0];
      const lastDay = new Date(currYear, currMonth, 0).toISOString().split('T')[0];
      setFromDate(firstDay);
      setToDate(lastDay);
    } else if (preset === 'THIS_FY') {
      const fyStart = activeFyData.company.financialYearStart && activeFyData.company.financialYearStart !== 'ALL'
        ? activeFyData.company.financialYearStart
        : getCurrentFinancialYearStart();
      const fyStartYear = Number(fyStart.split('-')[0]) || (currMonth >= 3 ? currYear : currYear - 1);
      setFromDate(`${fyStartYear}-04-01`);
      setToDate(`${fyStartYear + 1}-03-31`);
    }
  };

  const handleOpenPrintModal = () => {
    setPrintFromDate(fromDate);
    setPrintToDate(toDate);
    setShowPrintModal(true);
  };

  const currency = data.company.currency;

  const balancesMap = useMemo(() => calculateAccountBalances(data), [data]);
  const allAccounts = useMemo(() => mergeAccountsWithBalancesMap(data, balancesMap), [data, balancesMap]);

  const statement = useMemo(
    () =>
      buildAccountOrPartyLedgerStatement(data, {
        partyOrAccountId: currentAccountId,
        startDate: fromDate || undefined,
        endDate: toDate || undefined
      }),
    [data, currentAccountId, fromDate, toDate]
  );

  const party = statement.party;
  const account = statement.account;
  const periodOpeningBal = statement.openingForPeriod;
  const rows = statement.rows;
  const [whatsappPhone, setWhatsappPhone] = useState<string>(party?.phone || '');
  useEffect(() => {
    setWhatsappPhone(party?.phone || '');
  }, [party?.id, party?.phone]);

  // Multi-select & Bulk delete state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState<boolean>(false);

  const allSelected = rows.length > 0 && selectedIds.length === rows.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map(r => r.id));
    }
  };

  const toggleSelectRow = (rowId: string) => {
    setSelectedIds(prev =>
      prev.includes(rowId) ? prev.filter(id => id !== rowId) : [...prev, rowId]
    );
  };

  const handleExecuteBulkDelete = () => {
    if (selectedIds.length === 0) return;

    // Collect all selected rows
    const selectedRows = rows.filter(r => selectedIds.includes(r.id));
    
    // Group sourceIds by sourceType
    const voucherIds = new Set<string>();
    const invoiceIds = new Set<string>();
    const purchaseIds = new Set<string>();
    const noteIds = new Set<string>();

    selectedRows.forEach(r => {
      if (r.sourceType === 'VOUCHER') voucherIds.add(r.sourceId);
      else if (r.sourceType === 'SALES_INVOICE') invoiceIds.add(r.sourceId);
      else if (r.sourceType === 'PURCHASE_BILL') purchaseIds.add(r.sourceId);
      else if (r.sourceType === 'DEBIT_CREDIT_NOTE') noteIds.add(r.sourceId);
    });

    if (voucherIds.size > 0) {
      if (onDeleteBatchVouchers) onDeleteBatchVouchers(Array.from(voucherIds));
      else if (onDeleteVoucher) voucherIds.forEach(id => onDeleteVoucher(id));
    }
    if (invoiceIds.size > 0) {
      if (onDeleteBatchInvoices) onDeleteBatchInvoices(Array.from(invoiceIds));
      else if (onDeleteInvoice) invoiceIds.forEach(id => onDeleteInvoice(id));
    }
    if (purchaseIds.size > 0) {
      if (onDeleteBatchPurchaseInvoices) onDeleteBatchPurchaseInvoices(Array.from(purchaseIds));
      else if (onDeletePurchaseInvoice) purchaseIds.forEach(id => onDeletePurchaseInvoice(id));
    }
    if (noteIds.size > 0) {
      if (onDeleteBatchDebitCreditNotes) onDeleteBatchDebitCreditNotes(Array.from(noteIds));
      else if (onDeleteDebitCreditNote) noteIds.forEach(id => onDeleteDebitCreditNote(id));
    }

    setSelectedIds([]);
    setShowBulkConfirm(false);
  };

  const handleExecuteBulkReclassify = () => {
    if (!selectedIds.length || !targetReclassifyAccountId || !onBulkReclassifyVouchers) return;
    const selectedVoucherIds = rows
      .filter(r => selectedIds.includes(r.id) && r.sourceType === 'VOUCHER')
      .map(r => r.sourceId);

    if (selectedVoucherIds.length > 0) {
      onBulkReclassifyVouchers(selectedVoucherIds, targetReclassifyAccountId);
    }
    setShowReclassifyModal(false);
    setSelectedIds([]);
  };

  // Keyboard shortcut support: Delete key or Enter key triggers bulk delete modal
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept keypresses inside input fields or textareas
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (selectedIds.length > 0 && perms.canDeleteRecords) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          setShowBulkConfirm(true);
        } else if (e.key === 'Enter' && !showBulkConfirm && !deleteConfirm) {
          e.preventDefault();
          setShowBulkConfirm(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, showBulkConfirm, deleteConfirm, perms.canDeleteRecords]);

  const handleDeleteEntry = () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;

    if (type === 'VOUCHER' && onDeleteVoucher) {
      onDeleteVoucher(id);
    } else if (type === 'SALES_INVOICE' && onDeleteInvoice) {
      onDeleteInvoice(id);
    } else if (type === 'PURCHASE_BILL' && onDeletePurchaseInvoice) {
      onDeletePurchaseInvoice(id);
    } else if (type === 'DEBIT_CREDIT_NOTE' && onDeleteDebitCreditNote) {
      onDeleteDebitCreditNote(id);
    }

    setDeleteConfirm(null);
  };

  const handlePrintTrigger = () => {
    const printOpts = {
      showNarration: printOptNarration,
      showBankRef: printOptBankRef,
      showOpposingLedger: printOptOpposing,
      showRunningBalance: printOptRunningBal,
      fromDate: printFromDate || undefined,
      toDate: printToDate || undefined
    };

    if (party) {
      printPartyLedger(party, data, isHindi, printOpts);
    } else if (account) {
      printAccountLedgerCustom(account, data, isHindi, printOpts);
    }
    setShowPrintModal(false);
  };

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-3.5 w-full md:overflow-hidden">
      {/* Top Header */}
      <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between hv-surface p-4 rounded-2xl border border-[var(--border-primary)] shadow-lg gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            onClick={onBack}
            className="p-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl transition shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="space-y-1 w-full">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-[var(--text-primary)]">{party ? party.name : account?.name}</h2>
              <span className="font-mono text-xs hv-pill-indigo px-2 py-0.5 rounded border font-semibold">
                Code: {party ? party.code : account?.code}
              </span>
              {party && (
                <span className="text-xs font-semibold hv-pill-emerald px-2 py-0.5 rounded border">
                  Party ({party.type})
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {party ? `GSTIN: ${party.gstin || 'Unregistered'} | State: ${party.state || 'N/A'}` : `Category: ${account?.category} (${account?.subCategory})`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          {/* Account & Party Selector Dropdown */}
          <div className="flex items-center gap-2 hv-elevated p-1.5 rounded-xl border border-[var(--border-subtle)]">
            <span className="text-[11px] font-bold text-[var(--text-muted)] pl-1 whitespace-nowrap">
              {isHindi ? 'खाता बदलें:' : 'Select Ledger:'}
            </span>
            <select
              value={currentAccountId}
              onChange={(e) => setCurrentAccountId(e.target.value)}
              className="hv-input font-bold text-xs px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] outline-none focus:border-indigo-500 max-w-[240px] truncate"
            >
              <optgroup label="General Accounts & Ledgers">
                {allAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.code}) - {acc.category}
                  </option>
                ))}
              </optgroup>
              {data.parties.some(p => p.type === 'CUSTOMER' || p.type === 'BOTH') && (
                <optgroup label="Customer Parties (Sundry Debtors)">
                  {data.parties.filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH').map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) - Customer
                    </option>
                  ))}
                </optgroup>
              )}
              {data.parties.some(p => p.type === 'VENDOR' || p.type === 'BOTH') && (
                <optgroup label="Vendor Parties (Sundry Creditors)">
                  {data.parties.filter(p => p.type === 'VENDOR' || p.type === 'BOTH').map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.code}) - Vendor
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {party && (
            <div className="flex items-center hv-input border border-emerald-500/50 rounded-xl overflow-hidden shrink-0">
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder={isHindi ? 'WhatsApp नं.' : 'Party Phone'}
                className="w-28 bg-transparent text-[var(--text-primary)] text-xs px-2.5 py-2 outline-none font-mono placeholder:font-sans placeholder:text-[var(--text-placeholder)]"
              />
              <a
                href={buildWhatsAppLedgerReminderUrl({
                  partyName: party.name,
                  partyPhone: whatsappPhone,
                  company: data.company,
                  closingBalance: statement.closingBalance,
                  closingType: statement.closingType,
                  totalDebit: statement.totalDebit,
                  totalCredit: statement.totalCredit,
                  periodLabel: fromDate || toDate ? `${fromDate || 'Start'} to ${toDate || 'Today'}` : undefined,
                  isHindi,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white hv-keep-white font-bold text-xs px-3 py-2 transition whitespace-nowrap"
                title={isHindi ? 'WhatsApp पर लेजर बकाया रिमाइंडर भेजें' : 'Send Ledger Reminder on WhatsApp'}
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isHindi ? 'WhatsApp रिमाइंडर' : 'Send on WhatsApp'}</span>
              </a>
            </div>
          )}

          {perms.canExportData && (
            <button
              onClick={handleOpenPrintModal}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow-lg shadow-indigo-600/30 whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4" />
              <span>{isHindi ? 'प्रिंट / PDF ऑप्शन' : 'Print / Export'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Date Range / Period Selection Toolbar */}
      <div className="shrink-0 hv-surface border border-[var(--border-primary)] p-3 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2 text-sm font-bold text-[var(--text-secondary)]">
          <Calendar className="w-4 h-4 text-indigo-500 shrink-0" />
          <span>{isHindi ? 'अवधि / तिथि चयन (Date & Period Selection):' : 'Select Period & Date Range:'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          {/* Quick 1-Click All Years to Current Button */}
          <button
            type="button"
            onClick={() => handlePresetChange('ALL_TO_CURRENT')}
            className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
              datePreset === 'ALL_TO_CURRENT' || datePreset === 'ALL'
                ? 'hv-pill-emerald'
                : 'bg-[var(--bg-input)] hover:bg-[var(--hover-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
            }`}
            title={isHindi ? 'शुरू से आज तक का पूरा कस्टमर/अकाउंट लेज़र एक क्लिक में देखें' : 'View full cumulative ledger up to Today'}
          >
            {isHindi ? '📅 सभी वर्ष – आज तक (संपूर्ण)' : '📅 All Years – Current Date'}
          </button>

          {/* Quick Preset Selector */}
          <select
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="hv-input font-bold px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="ALL">{isHindi ? 'सभी समय / सभी वर्ष (All Time)' : 'All Years (Complete History)'}</option>
            <option value="ALL_TO_CURRENT">{isHindi ? 'प्रारंभ से आज तक (Up to Current Date)' : 'All Years – Current Date'}</option>
            <option value="THIS_FY">{isHindi ? 'सक्रिय वित्तीय वर्ष (Active FY)' : 'Active Financial Year Only'}</option>
            <option value="THIS_MONTH">{isHindi ? 'इस महीने (This Month)' : 'This Month'}</option>
            <option value="LAST_MONTH">{isHindi ? 'पिछले महीने (Last Month)' : 'Last Month'}</option>
            <option value="CUSTOM">{isHindi ? 'कस्टम सीमा (Custom Range)' : 'Custom Date Range'}</option>
          </select>

          {/* From Date Input */}
          <div className="flex items-center gap-1.5 hv-input px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)]">
            <span className="text-[11px] font-bold text-[var(--text-muted)]">{isHindi ? 'से:' : 'From:'}</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="bg-transparent text-[var(--text-primary)] font-mono text-xs outline-none cursor-pointer"
            />
          </div>

          {/* To Date Input */}
          <div className="flex items-center gap-1.5 hv-input px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)]">
            <span className="text-[11px] font-bold text-[var(--text-muted)]">{isHindi ? 'तक:' : 'To:'}</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="bg-transparent text-[var(--text-primary)] font-mono text-xs outline-none cursor-pointer"
            />
          </div>

          {/* Reset / Clear Button */}
          {(fromDate || toDate) && (
            <button
              onClick={() => {
                setFromDate('');
                setToDate('');
                setDatePreset('ALL');
              }}
              className="px-2.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] rounded-xl border border-[var(--border-subtle)] font-bold transition flex items-center gap-1"
              title={isHindi ? 'तिथि फ़िल्टर हटाएं' : 'Clear Date Filter'}
            >
              <X className="w-3.5 h-3.5" />
              <span>{isHindi ? 'रीसेट' : 'Clear'}</span>
            </button>
          )}
        </div>
      </div>

      {/* View Display Toggles Toolbar */}
      <div className="shrink-0 hv-surface border border-[var(--border-primary)] p-3 rounded-xl flex items-center justify-between text-xs gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[var(--text-secondary)] font-bold">
          <Settings2 className="w-4 h-4 text-indigo-500" />
          <span>{isHindi ? 'व्यू सेटिंग्स (Display Toggles):' : 'Ledger View Options:'}</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium select-none">
            <input
              type="checkbox"
              checked={showOpposingLedger}
              onChange={(e) => setShowOpposingLedger(e.target.checked)}
              className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span>{isHindi ? 'विरोधी लेजर (Debited/Credited Ledger)' : 'Opposing Counter Ledger'}</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium select-none">
            <input
              type="checkbox"
              checked={showBankRef}
              onChange={(e) => setShowBankRef(e.target.checked)}
              className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span>{isHindi ? 'बैंक रिफ. / UTR सं.' : 'Bank Ref / UTR No.'}</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium select-none">
            <input
              type="checkbox"
              checked={showNarration}
              onChange={(e) => setShowNarration(e.target.checked)}
              className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 focus:ring-0 w-3.5 h-3.5 cursor-pointer"
            />
            <span>{isHindi ? 'नैरेशन दिखाएँ (Show Narration)' : 'Show Narration'}</span>
          </label>
        </div>
      </div>

      {/* Opening Balance & Summary Bar */}
      <div className="shrink-0 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="hv-surface p-3.5 rounded-xl border border-[var(--border-primary)] flex justify-between items-center text-sm text-[var(--text-secondary)]">
          <span>{fromDate ? (isHindi ? 'अवधि प्रारंभिक शेष (Period Opening):' : 'Period Opening Balance:') : (isHindi ? 'प्रारंभिक शेष (Opening Balance):' : 'Opening Ledger Balance:')}</span>
          <span className="font-mono tabular-nums font-bold text-indigo-500">
            {formatCurrency(Math.abs(periodOpeningBal), currency)} ({periodOpeningBal >= 0 ? 'DR' : 'CR'})
          </span>
        </div>
        <div className="hv-surface p-3.5 rounded-xl border border-[var(--border-primary)] flex justify-between items-center text-sm text-[var(--text-secondary)]">
          <span>{isHindi ? 'कुल नामे (Total Debit):' : 'Total Period Debit:'}</span>
          <span className="font-mono tabular-nums font-bold text-emerald-500">
            {formatCurrency(rows.reduce((sum, r) => sum + r.debit, 0), currency)}
          </span>
        </div>
        <div className="hv-surface p-3.5 rounded-xl border border-[var(--border-primary)] flex justify-between items-center text-sm text-[var(--text-secondary)]">
          <span>{isHindi ? 'कुल जमा (Total Credit):' : 'Total Period Credit:'}</span>
          <span className="font-mono tabular-nums font-bold text-rose-500">
            {formatCurrency(rows.reduce((sum, r) => sum + r.credit, 0), currency)}
          </span>
        </div>
      </div>

      {/* Multi-Delete Selected Toolbar */}
      {selectedIds.length > 0 && (perms.canDeleteRecords || perms.canBulkReclassify) && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 hv-pill-rose border p-3.5 rounded-2xl text-sm animate-fade-in shadow-xl">
          <div className="flex items-center gap-2.5 font-bold">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>
              {isHindi 
                ? `${selectedIds.length} लेज़र प्रविष्टियाँ चुनी गईं` 
                : `${selectedIds.length} entries selected`}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] rounded-xl font-semibold border border-[var(--border-subtle)] transition"
            >
              {allSelected ? (isHindi ? 'सब अन-सेलेक्ट करें' : 'Deselect All') : (isHindi ? 'सभी चुनें' : 'Select All')}
            </button>
            {perms.canBulkReclassify && onBulkReclassifyVouchers && (
              <button
                type="button"
                onClick={() => setShowReclassifyModal(true)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition"
              >
                <Edit className="w-4 h-4" />
                <span>{isHindi ? `काउंटर लेज़र बदलें (${selectedIds.length})` : `Reclassify Ledger (${selectedIds.length})`}</span>
              </button>
            )}
            {perms.canDeleteRecords && (
              <button
                type="button"
                onClick={() => setShowBulkConfirm(true)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isHindi ? `चयनित ${selectedIds.length} प्रविष्टियाँ हटाएँ` : `Delete Selected (${selectedIds.length})`}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="flex-1 min-h-0 flex flex-col hv-surface border border-[var(--border-primary)] rounded-2xl shadow-xl overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left text-sm text-[var(--text-secondary)]">
            <thead className="sticky top-0 z-10 hv-elevated text-[var(--text-secondary)] font-bold text-xs uppercase tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                {(perms.canDeleteRecords || perms.canBulkReclassify) && (
                  <th className="p-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 focus:ring-0 w-4 h-4 cursor-pointer"
                      title={isHindi ? 'सभी चुनें / अन-सेलेक्ट करें' : 'Select All / Deselect All'}
                    />
                  </th>
                )}
                <th className="p-3">Date</th>
                <th className="p-3">Voucher #</th>
                <th className="p-3">Type</th>
                <th className="p-3">Particulars & Opposing Ledger</th>
                <th className="p-3 text-right">Debit (नामे)</th>
                <th className="p-3 text-right">Credit (जमा)</th>
                <th className="p-3 text-right">Running Balance</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={(perms.canDeleteRecords || perms.canBulkReclassify) ? 9 : 8} className="p-8 text-center text-[var(--text-muted)]">
                    {isHindi ? 'इस खाते में कोई ट्रांजैक्शन नहीं है।' : 'No transactions posted to this ledger account yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const isSelected = selectedIds.includes(r.id);
                  return (
                    <tr key={r.id} className={`transition ${isSelected ? 'bg-indigo-500/15' : 'hover:bg-[var(--hover-surface)]'}`}>
                      {(perms.canDeleteRecords || perms.canBulkReclassify) && (
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(r.id)}
                            className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 focus:ring-0 w-4 h-4 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="p-3 text-[var(--text-secondary)] font-mono whitespace-nowrap">{r.date}</td>
                      <td className="p-3 font-bold text-indigo-500 font-mono whitespace-nowrap">{r.voucherNo}</td>
                      <td className="p-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-xs font-bold hv-pill-slate border">
                          {r.voucherType}
                        </span>
                      </td>
                      <td className="p-3 font-medium text-[var(--text-primary)]">
                        {showOpposingLedger && (
                          <div className="font-bold text-indigo-500 text-sm flex items-center gap-1">
                            <span className="text-[var(--text-muted)]">↳</span>
                            <span>{r.opposingLedger}</span>
                          </div>
                        )}
                        <div className="text-[var(--text-secondary)] text-sm mt-0.5">{r.particulars}</div>
                        {showBankRef && r.bankRef && (
                          <div className="text-xs font-mono mt-0.5 hv-pill-cyan px-1.5 py-0.5 rounded border inline-block">
                            Ref/UTR: {r.bankRef}
                          </div>
                        )}
                        {showNarration && r.narration && (
                          <div className="text-xs text-[var(--text-muted)] italic mt-0.5 border-l-2 border-indigo-500/40 pl-1.5">
                            Note: {r.narration}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-emerald-500 font-semibold whitespace-nowrap">
                        {r.debit > 0 ? formatCurrency(r.debit, currency) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-rose-500 font-semibold whitespace-nowrap">
                        {r.credit > 0 ? formatCurrency(r.credit, currency) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {formatCurrency(r.runningBalance, currency)} ({r.runningType})
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Print / View */}
                          {r.sourceType === 'SALES_INVOICE' && onPrintInvoice && perms.canExportData && (
                            <button
                              onClick={() => onPrintInvoice(r.rawObj)}
                              title={isHindi ? 'देखें / प्रिंट करें' : 'View / Print'}
                              className="p-1.5 hv-pill-blue border hover:bg-blue-600 hover:text-white rounded-lg transition"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Edit */}
                          {r.sourceType === 'SALES_INVOICE' && onEditInvoice && perms.canCreateEditTransactions && (
                            <button
                              onClick={() => onEditInvoice(r.rawObj)}
                              title={isHindi ? 'संशोधन करें' : 'Edit Invoice'}
                              className="p-1.5 hv-pill-amber border hover:bg-amber-600 hover:text-white rounded-lg transition"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {r.sourceType === 'PURCHASE_BILL' && onEditPurchaseBill && perms.canCreateEditVouchers && (
                            <button
                              onClick={() => onEditPurchaseBill(r.rawObj)}
                              title={isHindi ? 'संशोधन करें' : 'Edit Purchase Bill'}
                              className="p-1.5 hv-pill-amber border hover:bg-amber-600 hover:text-white rounded-lg transition"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {r.sourceType === 'VOUCHER' && onEditVoucher && perms.canCreateEditVouchers && (
                            <button
                              onClick={() => onEditVoucher(r.rawObj)}
                              title={isHindi ? 'वाउचर संपादित करें' : 'Edit Voucher'}
                              className="p-1.5 hv-pill-amber border hover:bg-amber-600 hover:text-white rounded-lg transition"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Delete Button */}
                          {perms.canDeleteRecords && (
                            <button
                              onClick={() => setDeleteConfirm({
                                show: true,
                                type: r.sourceType,
                                id: r.sourceId,
                                voucherNo: r.voucherNo
                              })}
                              title={isHindi ? 'एंट्री डिलीट करें' : 'Delete Entry'}
                              className="p-1.5 hv-pill-rose border hover:bg-rose-600 hover:text-white rounded-lg transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl hv-pill-rose border flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">
                  {isHindi ? 'मल्टीपल प्रविष्टियाँ डिलीट करें' : 'Confirm Bulk Entry Deletion'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  {isHindi ? `चयनित ${selectedIds.length} आइटम` : `${selectedIds.length} items selected`}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isHindi
                ? `क्या आप वाकई चुनी गई ${selectedIds.length} लेज़र/बैंक प्रविष्टियों को एक साथ हटाना चाहते हैं? यह क्रिया स्थायी है और लेज़र बैलेंस रिमूव हो जाएगा।`
                : `Are you sure you want to permanently delete all ${selectedIds.length} selected transactions? This action will remove associated postings and adjust account balances.`}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkConfirm(false)}
                className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white rounded-xl text-xs font-extrabold transition shadow-lg shadow-rose-600/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isHindi ? `सभी ${selectedIds.length} डिलीट करें (Enter)` : `Delete All ${selectedIds.length} (Enter)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && deleteConfirm.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-500">
              <div className="w-10 h-10 rounded-xl hv-pill-rose border flex items-center justify-center shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">
                  {isHindi ? 'एंट्री डिलीट करने की पुष्टि' : 'Confirm Entry Deletion'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  Ref: {deleteConfirm.voucherNo}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isHindi
                ? `क्या आप वाकई ${deleteConfirm.voucherNo} की यह प्रविष्टि हटाना चाहते हैं? यह क्रिया स्थायी है और लेज़र बैलेंस अपडेट हो जाएगा।`
                : `Are you sure you want to permanently delete transaction ${deleteConfirm.voucherNo}? This action cannot be undone and will revert all associated postings.`}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                onClick={handleDeleteEntry}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white rounded-xl text-xs font-bold transition shadow-lg shadow-rose-600/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isHindi ? 'डिलीट करें' : 'Delete Entry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reclassify Counter Ledger Modal */}
      {showReclassifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-indigo-500">
              <div className="w-10 h-10 rounded-xl hv-pill-indigo border flex items-center justify-center shrink-0">
                <Edit className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">
                  {isHindi ? 'काउंटर लेज़र बल्क री-क्लासिफाई / ट्रांसफर' : 'Bulk Reclassify Counter Ledger'}
                </h3>
                <p className="text-xs text-[var(--text-muted)] font-mono">
                  {isHindi ? `चुने गए ${selectedIds.length} प्रविष्टियों का काउंटर लेज़र बदलें` : `Change counter-ledger for ${selectedIds.length} selected entries`}
                </p>
              </div>
            </div>

            <div className="space-y-3 hv-elevated p-4 rounded-xl border border-[var(--border-primary)]">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">
                {isHindi ? 'नया काउंटर लेज़र चुनें (Target Ledger Account):' : 'Select Target Counter Ledger Account:'}
              </label>
              <select
                value={targetReclassifyAccountId}
                onChange={(e) => setTargetReclassifyAccountId(e.target.value)}
                className="w-full hv-input font-bold text-xs p-3 rounded-xl border border-[var(--border-subtle)] outline-none focus:border-indigo-500"
              >
                {data.accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.category})
                  </option>
                ))}
              </select>

              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pt-1">
                {isHindi 
                  ? `💡 यह कार्रवाई चुने गए सभी वाउचर्स का काउंटर लेज़र (जैसे Suspense Account से बदलकर Supreme Suppliers या Rent Expense) तुरंत अपडेट कर देगी।`
                  : `💡 This will immediately reallocate the counter leg of all selected vouchers from current/suspense account to the target ledger chosen above.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReclassifyModal(false)}
                className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkReclassify}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white rounded-xl text-xs font-extrabold transition shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <Edit className="w-4 h-4" />
                <span>{isHindi ? `सभी ${selectedIds.length} प्रविष्टियाँ स्थानांतरित करें` : `Apply Reclassification (${selectedIds.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Customization Modal */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Printer className="w-5 h-5 text-indigo-500" />
                <span>{isHindi ? 'प्रिंट एवं रिपोर्ट ऑप्शंस' : 'Ledger Print & Export Options'}</span>
              </h3>
              <button
                onClick={() => setShowPrintModal(false)}
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-surface)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              {isHindi ? 'चुने गए खाते की लेजर रिपोर्ट में कौन सी जानकारी शामिल करना चाहते हैं?' : 'Select features to include in the generated print statement:'}
            </p>

            <div className="space-y-3 hv-elevated p-4 rounded-xl border border-[var(--border-primary)] text-xs">
              <div className="pb-2 border-b border-[var(--border-primary)] space-y-2">
                <span className="font-semibold text-indigo-500 block">{isHindi ? 'रिपोर्ट तिथि सीमा (Print Period Range):' : 'Report Date Period Range:'}</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold block mb-1">{isHindi ? 'से (From Date):' : 'From Date:'}</label>
                    <input
                      type="date"
                      value={printFromDate}
                      onChange={(e) => setPrintFromDate(e.target.value)}
                      className="w-full hv-input font-mono text-xs p-2 rounded-lg border border-[var(--border-subtle)] outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text-muted)] font-semibold block mb-1">{isHindi ? 'तक (To Date):' : 'To Date:'}</label>
                    <input
                      type="date"
                      value={printToDate}
                      onChange={(e) => setPrintToDate(e.target.value)}
                      className="w-full hv-input font-mono text-xs p-2 rounded-lg border border-[var(--border-subtle)] outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--hover-surface)]">
                <span className="font-semibold text-[var(--text-secondary)]">{isHindi ? 'विरोधी लेज़र (Counter Dr/Cr Account)' : 'Opposing Ledger Account'}</span>
                <input
                  type="checkbox"
                  checked={printOptOpposing}
                  onChange={(e) => setPrintOptOpposing(e.target.checked)}
                  className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--hover-surface)]">
                <span className="font-semibold text-[var(--text-secondary)]">{isHindi ? 'बैंक रिफरेंस / UTR सं.' : 'Bank Ref / UTR No.'}</span>
                <input
                  type="checkbox"
                  checked={printOptBankRef}
                  onChange={(e) => setPrintOptBankRef(e.target.checked)}
                  className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--hover-surface)]">
                <span className="font-semibold text-[var(--text-secondary)]">{isHindi ? 'नैरेशन (Narration Notes)' : 'Transaction Narration Notes'}</span>
                <input
                  type="checkbox"
                  checked={printOptNarration}
                  onChange={(e) => setPrintOptNarration(e.target.checked)}
                  className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer p-2 rounded hover:bg-[var(--hover-surface)]">
                <span className="font-semibold text-[var(--text-secondary)]">{isHindi ? 'रनिंग बैलेंस कॉलम (Running Balance)' : 'Running Balance Column'}</span>
                <input
                  type="checkbox"
                  checked={printOptRunningBal}
                  onChange={(e) => setPrintOptRunningBal(e.target.checked)}
                  className="rounded bg-[var(--bg-input)] border-[var(--border-subtle)] text-indigo-500 w-4 h-4 cursor-pointer"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowPrintModal(false)}
                className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-bold rounded-xl text-xs transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                onClick={handlePrintTrigger}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>{isHindi ? 'प्रिंट तैयार करें' : 'Generate Printout'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
