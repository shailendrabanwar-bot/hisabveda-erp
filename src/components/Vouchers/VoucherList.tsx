import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  ArrowRightLeft, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Trash2, 
  FileText, 
  CheckCircle2,
  Printer,
  Edit2,
  RefreshCw,
  Calendar,
  X,
  AlertTriangle
} from 'lucide-react';
import { AppData, Voucher, VoucherType, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { isCashOrBankLedger } from '../../utils/accounting';
import { getRolePermissions, normalizeUserRole, RolePermissions } from '../../utils/rbac';
import { VoucherPrintModal } from './VoucherPrintModal';

interface VoucherListProps {
  data: AppData;
  isHindi: boolean;
  onOpenQuickModal: (type: 'journal' | 'payment' | 'receipt' | 'contra', editingVoucher?: Voucher) => void;
  onDeleteVoucher: (id: string) => void;
  onDeleteBatchVouchers?: (ids: string[]) => void;
  onBulkReclassifyVouchers?: (voucherIds: string[], newCounterAccountId: string) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const VoucherList: React.FC<VoucherListProps> = ({
  data,
  isHindi,
  onOpenQuickModal,
  onDeleteVoucher,
  onDeleteBatchVouchers,
  onBulkReclassifyVouchers,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const [filterType, setFilterType] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [printingVoucher, setPrintingVoucher] = useState<Voucher | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Date Range & Period Selection State
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string>('ALL');

  // Multi-select and bulk delete state
  const [selectedVoucherIds, setSelectedVoucherIds] = useState<string[]>([]);
  const [showBulkConfirm, setShowBulkConfirm] = useState<boolean>(false);
  const [showReclassifyModal, setShowReclassifyModal] = useState<boolean>(false);
  const [targetReclassifyAccountId, setTargetReclassifyAccountId] = useState<string>('acc_suspense');

  const handlePresetChange = (preset: string) => {
    setDatePreset(preset);
    const today = new Date();
    const currYear = today.getFullYear();
    const currMonth = today.getMonth();

    if (preset === 'ALL') {
      setFromDate('');
      setToDate('');
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
      const fyStartYear = currMonth >= 3 ? currYear : currYear - 1;
      const firstDay = `${fyStartYear}-04-01`;
      const lastDay = `${fyStartYear + 1}-03-31`;
      setFromDate(firstDay);
      setToDate(lastDay);
    }
  };

  const filtered = data.vouchers.filter((vch) => {
    const matchesType = filterType === 'ALL' || vch.type === filterType;
    const matchesFromDate = !fromDate || vch.date >= fromDate;
    const matchesToDate = !toDate || vch.date <= toDate;
    const matchesSearch = 
      vch.voucherNumber.toLowerCase().includes(search.toLowerCase()) ||
      vch.narration.toLowerCase().includes(search.toLowerCase()) ||
      (vch.referenceNo && vch.referenceNo.toLowerCase().includes(search.toLowerCase())) ||
      (vch.partyName && vch.partyName.toLowerCase().includes(search.toLowerCase()));
    return matchesType && matchesFromDate && matchesToDate && matchesSearch;
  });

  const allSelected = filtered.length > 0 && selectedVoucherIds.length === filtered.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedVoucherIds([]);
    } else {
      setSelectedVoucherIds(filtered.map(v => v.id));
    }
  };

  const toggleSelectVoucher = (id: string) => {
    setSelectedVoucherIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleExecuteBulkDelete = () => {
    if (selectedVoucherIds.length === 0) return;

    if (onDeleteBatchVouchers) {
      onDeleteBatchVouchers(selectedVoucherIds);
    } else {
      selectedVoucherIds.forEach(id => {
        onDeleteVoucher(id);
      });
    }

    setSelectedVoucherIds([]);
    setShowBulkConfirm(false);
  };

  const handleExecuteBulkReclassify = () => {
    if (!selectedVoucherIds.length || !targetReclassifyAccountId || !onBulkReclassifyVouchers) return;
    onBulkReclassifyVouchers(selectedVoucherIds, targetReclassifyAccountId);
    setShowReclassifyModal(false);
    setSelectedVoucherIds([]);
  };

  // Keyboard shortcut listener for Delete & Enter keys
  React.useEffect(() => {
    if (!perms.canDeleteRecords) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (selectedVoucherIds.length > 0) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault();
          setShowBulkConfirm(true);
        } else if (e.key === 'Enter' && !showBulkConfirm) {
          e.preventDefault();
          setShowBulkConfirm(true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedVoucherIds, showBulkConfirm, perms.canDeleteRecords]);

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-3.5 w-full md:overflow-hidden">
      {/* Top Banner */}
      <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
            <span>{isHindi ? 'वाउचर प्रबंधन (Journal, Payment, Receipt, Contra)' : 'Voucher Management & Bookkeeping'}</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isHindi 
              ? 'डबल-एंट्री जर्नल, भुगतान, रसीद एवं कॉण्ट्रा वाउचर दर्ज, संपादित व प्रिंट करें'
              : 'Record, edit, and print journal, payment, receipt, and contra vouchers'}
          </p>
        </div>

        {perms.canCreateEditVouchers && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onOpenQuickModal('journal')}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>{isHindi ? '+ जर्नल वाउचर' : '+ Journal'}</span>
            </button>
            <button
              onClick={() => onOpenQuickModal('payment')}
              className="flex items-center gap-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition"
            >
              <ArrowDownLeft className="w-4 h-4" />
              <span>{isHindi ? '+ पेमेंट' : '+ Payment'}</span>
            </button>
            <button
              onClick={() => onOpenQuickModal('receipt')}
              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>{isHindi ? '+ रसीद' : '+ Receipt'}</span>
            </button>
            <button
              onClick={() => onOpenQuickModal('contra')}
              className="flex items-center gap-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs px-3.5 py-2.5 rounded-xl shadow transition"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isHindi ? '+ कॉण्ट्रा वाउचर' : '+ Contra'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Date Range & Period Selection Toolbar */}
      <div className="shrink-0 bg-slate-900 border border-slate-800 p-3 rounded-2xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-200">
          <Calendar className="w-4 h-4 text-indigo-400 shrink-0" />
          <span>{isHindi ? 'अवधि / तिथि चयन (Date & Period Selection):' : 'Select Period & Date Range:'}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-sm">
          {/* Quick Preset Selector */}
          <select
            value={datePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="bg-slate-950 text-indigo-300 font-bold px-3 py-1.5 rounded-xl border border-slate-700 outline-none focus:border-indigo-500 cursor-pointer text-sm"
          >
            <option value="ALL">{isHindi ? 'सभी समय (All Period)' : 'All Time'}</option>
            <option value="THIS_MONTH">{isHindi ? 'इस महीने (This Month)' : 'This Month'}</option>
            <option value="LAST_MONTH">{isHindi ? 'पिछले महीने (Last Month)' : 'Last Month'}</option>
            <option value="THIS_FY">{isHindi ? 'चालू वित्तीय वर्ष (Current Financial Year)' : 'Current Financial Year'}</option>
            <option value="CUSTOM">{isHindi ? 'कस्टम सीमा (Custom Range)' : 'Custom Range'}</option>
          </select>

          {/* From Date Input */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <span className="text-[11px] font-bold text-slate-400">{isHindi ? 'से:' : 'From:'}</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="bg-transparent text-slate-100 font-mono text-xs outline-none cursor-pointer"
            />
          </div>

          {/* To Date Input */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-xl border border-slate-700">
            <span className="text-[11px] font-bold text-slate-400">{isHindi ? 'तक:' : 'To:'}</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setDatePreset('CUSTOM');
              }}
              className="bg-transparent text-slate-100 font-mono text-xs outline-none cursor-pointer"
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
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 font-bold transition flex items-center gap-1"
              title={isHindi ? 'तिथि फ़िल्टर हटाएं' : 'Clear Date Filter'}
            >
              <X className="w-3.5 h-3.5" />
              <span>{isHindi ? 'रीसेट' : 'Clear'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter controls */}
      <div className="shrink-0 flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isHindi ? 'वाउचर सं., नारेशन या पार्टी खोजें...' : 'Search Voucher #, Narration, Ref...'}
            className="w-full bg-slate-800 text-slate-100 placeholder-slate-400 text-sm rounded-xl pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-300 font-semibold shrink-0">{isHindi ? 'प्रकार:' : 'Voucher Type:'}</span>
          {['ALL', 'JOURNAL', 'PAYMENT', 'RECEIPT', 'CONTRA'].map((tp) => (
            <button
              key={tp}
              onClick={() => setFilterType(tp)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition shrink-0 ${
                filterType === tp
                  ? 'bg-indigo-600 text-white shadow'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tp}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-Delete Action Bar */}
      {selectedVoucherIds.length > 0 && (perms.canDeleteRecords || perms.canBulkReclassify) && (
        <div className="shrink-0 flex items-center justify-between bg-rose-950/60 border border-rose-500/40 p-3.5 rounded-2xl text-sm animate-fade-in shadow-xl">
          <div className="flex items-center gap-2.5 text-rose-300 font-bold">
            <Trash2 className="w-5 h-5 text-rose-400 shrink-0" />
            <span>
              {isHindi 
                ? `${selectedVoucherIds.length} वाउचर चुने गए` 
                : `${selectedVoucherIds.length} vouchers selected`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold border border-slate-700 transition"
            >
              {allSelected ? (isHindi ? 'सब अन-सेलेक्ट करें' : 'Deselect All') : (isHindi ? 'सभी चुनें' : 'Select All')}
            </button>
            {onBulkReclassifyVouchers && perms.canBulkReclassify && (
              <button
                type="button"
                onClick={() => setShowReclassifyModal(true)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition"
              >
                <Edit2 className="w-4 h-4" />
                <span>{isHindi ? `लेज़र ट्रांसफर (${selectedVoucherIds.length})` : `Reclassify Ledger (${selectedVoucherIds.length})`}</span>
              </button>
            )}
            {perms.canDeleteRecords && (
              <button
                type="button"
                onClick={() => setShowBulkConfirm(true)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold rounded-xl flex items-center gap-1.5 shadow-lg shadow-rose-600/30 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isHindi ? `चयनित ${selectedVoucherIds.length} वाउचर हटाएँ` : `Delete Selected (${selectedVoucherIds.length})`}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Vouchers Table */}
      <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left text-sm text-slate-200">
            <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300 text-xs uppercase font-bold tracking-wider border-b border-slate-700">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-0 w-4 h-4 cursor-pointer"
                    title={isHindi ? 'सभी चुनें / अन-सेलेक्ट करें' : 'Select All / Deselect All'}
                  />
                </th>
                <th className="p-3">Voucher #</th>
                <th className="p-3">Type</th>
                <th className="p-3">Date</th>
                <th className="p-3">Ref / UTR</th>
                <th className="p-3">Party Name</th>
                <th className="p-3 text-right">Total Amount</th>
                <th className="p-3">Narration / Particulars</th>
                <th className="p-3 text-center">Reconciled</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    {isHindi ? 'कोई वाउचर प्रविष्टि नहीं मिली।' : 'No voucher entries found matching filter.'}
                  </td>
                </tr>
              ) : (
                filtered.map((vch) => {
                  const isSelected = selectedVoucherIds.includes(vch.id);
                  const hasJournalCashBankViolation =
                    vch.type === 'JOURNAL' &&
                    (vch.entries || []).some(e =>
                      isCashOrBankLedger(data.accounts.find(a => a.id === e.accountId))
                    );
                  return (
                    <tr key={vch.id} className={`transition ${isSelected ? 'bg-indigo-950/40' : 'hover:bg-slate-800/40'}`}>
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectVoucher(vch.id)}
                          className="rounded bg-slate-950 border-slate-700 text-indigo-500 focus:ring-0 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-bold text-indigo-300">{vch.voucherNumber}</td>
                      <td className="p-3">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-2.5 py-1 rounded-md text-xs font-bold border ${
                            vch.type === 'JOURNAL' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                            vch.type === 'PAYMENT' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                            vch.type === 'CONTRA' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                            'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {vch.type}
                          </span>
                          {hasJournalCashBankViolation && (
                            <span
                              title={isHindi ? 'जर्नल वाउचर में कैश/बैंक खाता नियम विरुद्ध है — कृपया संपादित करें' : 'Accounting Rule Warning: Cash/Bank in Journal Voucher'}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40 text-xs font-bold"
                            >
                              <AlertTriangle className="w-3 h-3" />
                              <span>{isHindi ? 'नियम सुधारें' : 'Rule Fix Needed'}</span>
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-slate-300 whitespace-nowrap">{vch.date}</td>
                      <td className="p-3 font-mono text-slate-300 text-xs">{vch.referenceNo || '-'}</td>
                      <td className="p-3 font-semibold text-slate-100">{vch.partyName || '-'}</td>
                      <td className="p-3 text-right font-bold text-slate-100 font-mono tabular-nums">
                        {formatCurrency(vch.totalAmount, currency)}
                      </td>
                      <td className="p-3 max-w-[220px] truncate text-slate-300 italic">
                        {vch.narration}
                      </td>
                      <td className="p-3 text-center">
                        {vch.isReconciled ? (
                          <span className="text-emerald-400 font-semibold text-xs flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Pending</span>
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {perms.canExportData && (
                            <button
                              onClick={() => setPrintingVoucher(vch)}
                              className="p-1.5 bg-slate-800 hover:bg-indigo-950/50 text-slate-300 hover:text-indigo-400 rounded-lg transition"
                              title={isHindi ? 'वाउचर प्रिंट करें' : 'Print Voucher'}
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {perms.canCreateEditVouchers && (
                            <button
                              onClick={() => onOpenQuickModal(vch.type.toLowerCase() as any, vch)}
                              className="p-1.5 bg-slate-800 hover:bg-amber-950/50 text-slate-300 hover:text-amber-400 rounded-lg transition"
                              title={isHindi ? 'वाउचर संपादित करें' : 'Edit Voucher'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {perms.canDeleteRecords && (deletingId === vch.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  onDeleteVoucher(vch.id);
                                  setDeletingId(null);
                                }}
                                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-slate-950 font-bold text-[10px] rounded transition shadow"
                                title={isHindi ? 'पुष्टि करें - वाउचर हटाएँ' : 'Confirm Delete'}
                              >
                                {isHindi ? 'हटाएँ?' : 'Confirm?'}
                              </button>
                              <button
                                onClick={() => setDeletingId(null)}
                                className="px-1.5 py-1 bg-slate-800 text-slate-400 hover:text-white text-[10px] rounded"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingId(vch.id)}
                              className="p-1.5 bg-slate-800 hover:bg-rose-950/50 text-slate-400 hover:text-rose-400 rounded-lg transition"
                              title={isHindi ? 'हटाएँ' : 'Delete Voucher'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ))}
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

      {/* Bulk Delete Modal for Vouchers */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  {isHindi ? 'मल्टीपल वाउचर हटाएँ' : 'Confirm Bulk Voucher Deletion'}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {selectedVoucherIds.length} {isHindi ? 'वाउचर चुने गए' : 'vouchers selected'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {isHindi
                ? `क्या आप वाकई इन ${selectedVoucherIds.length} चुने गए वाउचर्स को डिलीट करना चाहते हैं? खाता प्रविष्टियों एवं लेजर बैलेंस से ये वाउचर स्थायी रूप से हट जाएंगे।`
                : `Are you sure you want to permanently delete all ${selectedVoucherIds.length} selected vouchers? This action cannot be undone.`}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowBulkConfirm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-extrabold transition shadow-lg shadow-rose-600/30 flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isHindi ? `सभी ${selectedVoucherIds.length} डिलीट करें (Enter)` : `Delete All ${selectedVoucherIds.length} (Enter)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reclassify Counter Ledger Modal */}
      {showReclassifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-indigo-400">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Edit2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  {isHindi ? 'वाउचर काउंटर लेज़र ट्रांसफर' : 'Bulk Reclassify Voucher Counter Ledger'}
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {isHindi ? `चुने गए ${selectedVoucherIds.length} वाउचर्स का लेज़र बदलें` : `Reclassify counter-ledger for ${selectedVoucherIds.length} selected vouchers`}
                </p>
              </div>
            </div>

            <div className="space-y-3 bg-slate-800/60 p-4 rounded-xl border border-slate-700">
              <label className="block text-xs font-bold text-slate-300">
                {isHindi ? 'नया काउंटर लेज़र चुनें (Target Ledger Account):' : 'Select Target Counter Ledger Account:'}
              </label>
              <select
                value={targetReclassifyAccountId}
                onChange={(e) => setTargetReclassifyAccountId(e.target.value)}
                className="w-full bg-slate-900 text-slate-100 font-bold text-xs p-3 rounded-xl border border-slate-700 outline-none focus:border-indigo-500"
              >
                {data.accounts.filter(acc => !acc.isGroup && !isCashOrBankLedger(acc)).map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name} ({acc.category})
                  </option>
                ))}
              </select>

              <p className="text-[11px] text-slate-400 leading-relaxed pt-1">
                {isHindi 
                  ? `💡 चुने गए ${selectedVoucherIds.length} वाउचर्स का विरोधी लेज़र (Counter Ledger) बदलकर इस नए चुने गए खाते में ट्रांसफर कर दिया जाएगा।`
                  : `💡 Reallocates the counter leg of all ${selectedVoucherIds.length} selected vouchers to the target ledger selected above.`}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReclassifyModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-semibold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkReclassify}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-extrabold transition shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <Edit2 className="w-4 h-4" />
                <span>{isHindi ? `सभी ${selectedVoucherIds.length} वाउचर्स ट्रांसफर करें` : `Apply Reclassification (${selectedVoucherIds.length})`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printingVoucher && (
        <VoucherPrintModal
          voucher={printingVoucher}
          data={data}
          isHindi={isHindi}
          onClose={() => setPrintingVoucher(null)}
        />
      )}
    </div>
  );
};
