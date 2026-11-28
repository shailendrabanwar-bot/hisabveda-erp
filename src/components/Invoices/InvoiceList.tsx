import React, { useState } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Receipt,
  Download,
  Repeat,
  Edit3,
  Truck,
  ScanBarcode
} from 'lucide-react';
import { AppData, SalesInvoice, InvoiceStatus, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getCashLedgers, getBankLedgers } from '../../utils/accounting';
import { getRolePermissions, normalizeUserRole, RolePermissions } from '../../utils/rbac';
import { resolveCompanyTaxProfile } from '../../utils/companyProfile';

interface InvoiceListProps {
  data: AppData;
  isHindi: boolean;
  onOpenCreateModal: () => void;
  onOpenBarcodePos?: () => void;
  onPrintInvoice: (inv: SalesInvoice) => void;
  onDeleteInvoice: (invId: string) => void;
  onRecordPayment: (invId: string, amount: number, paymentMode: string, paymentAccountId?: string) => void;
  onEditInvoice?: (inv: SalesInvoice) => void;
  onOpenEWayBillModal?: (selectedInvoiceIds?: string[]) => void;
  initialSearchQuery?: string;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const InvoiceList: React.FC<InvoiceListProps> = ({
  data,
  isHindi,
  onOpenCreateModal,
  onOpenBarcodePos,
  onPrintInvoice,
  onDeleteInvoice,
  onRecordPayment,
  onEditInvoice,
  onOpenEWayBillModal,
  initialSearchQuery = '',
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const taxProfile = resolveCompanyTaxProfile(data.company);
  const ewayBillActive = taxProfile.gstEnabled && taxProfile.ewayBillEnabled;
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>(initialSearchQuery);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  React.useEffect(() => {
    if (initialSearchQuery) {
      setSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const cashLedgers = getCashLedgers(data);
  const bankLedgers = getBankLedgers(data);
  const [recordPayModal, setRecordPayModal] = useState<SalesInvoice | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMode, setPayMode] = useState<string>('CASH');
  const [payAccountId, setPayAccountId] = useState<string>(() => cashLedgers[0]?.id || 'acc_cash');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = data.invoices.filter((inv) => {
    let matchesStatus = true;
    if (filterStatus !== 'ALL') {
      matchesStatus = inv.status === filterStatus;
    }

    const matchesSearch = 
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.partyName.toLowerCase().includes(search.toLowerCase()) ||
      (inv.partyGstin && inv.partyGstin.toLowerCase().includes(search.toLowerCase()));

    return matchesStatus && matchesSearch;
  });

  const handlePaySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recordPayModal) return;
    onRecordPayment(recordPayModal.id, payAmount, payMode, payAccountId);
    setRecordPayModal(null);
  };

  const toggleSelectInvoice = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(i => i.id));
    }
  };

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-4 w-full md:overflow-hidden">
      {/* Header & Controls */}
      <div className="shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hv-surface p-4 md:p-5 rounded-2xl border border-[var(--border-primary)] shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-500" />
            <span>{isHindi ? 'बिक्री एवं इनवॉइस प्रबंधन' : 'Sales & Invoices Management'}</span>
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {isHindi 
              ? 'जीएसटी अनुपालन इनवॉइस जारी करें, प्रिंट लें, ई-वे बिल बनाएं और भुगतान ट्रैक करें'
              : 'Issue GST-compliant invoices, track customer payments, generate e-Way bills, and download PDFs'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenBarcodePos && perms.canCreateEditTransactions && (
            <button
              onClick={onOpenBarcodePos}
              className="flex items-center gap-1.5 hv-pill-cyan border font-bold text-xs px-4 py-2.5 rounded-xl shadow transition transform active:scale-95 cursor-pointer"
              title={isHindi ? 'तेज़ बारकोड काउंटर POS खोलें' : 'Launch High-Speed Barcode POS Counter'}
            >
              <ScanBarcode className="w-4 h-4" />
              <span>{isHindi ? 'बारकोड POS बिलिंग' : 'Barcode POS Counter'}</span>
            </button>
          )}

          {onOpenEWayBillModal && perms.canCreateEditTransactions && ewayBillActive && (
            <button
              onClick={() => onOpenEWayBillModal(selectedIds.length > 0 ? selectedIds : undefined)}
              className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white hv-keep-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg transition transform active:scale-95 cursor-pointer"
              title={isHindi ? 'आधिकारिक NIC ई-वे बिल बल्क JSON जनरेटर टूल' : 'Official NIC GST e-Way Bill Bulk JSON Generator Tool'}
            >
              <Truck className="w-4 h-4" />
              <span>{isHindi ? 'e-Way Bill JSON टूल' : 'e-Way Bill JSON Tool'}</span>
              {selectedIds.length > 0 && (
                <span className="bg-slate-950 text-amber-300 font-mono text-[10px] px-1.5 py-0.2 rounded-full font-bold ml-1">
                  {selectedIds.length}
                </span>
              )}
            </button>
          )}

          {perms.canCreateEditTransactions && (
            <button
              onClick={onOpenCreateModal}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>{isHindi ? 'नया सेल इनवॉइस बनाएँ' : '+ Create Sales Invoice'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="shrink-0 flex flex-col md:flex-row items-center justify-between gap-3 hv-surface p-3 rounded-xl border border-[var(--border-primary)]">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isHindi ? 'इनवॉइस नंबर या ग्राहक का नाम खोजें...' : 'Search Invoice # or Customer...'}
            className="w-full hv-input text-sm rounded-xl pl-9 pr-3 py-2 border border-[var(--border-subtle)] focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
          <Filter className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
          <span className="text-xs text-[var(--text-secondary)] font-semibold shrink-0">{isHindi ? 'स्थिति चुनें:' : 'Status:'}</span>
          {['ALL', 'PAID', 'UNPAID', 'PARTIAL'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition shrink-0 flex items-center gap-1 ${
                filterStatus === st
                  ? 'bg-indigo-600 text-white hv-keep-white shadow'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)]'
              }`}
            >
              <span>{st}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Floating / Sticky Batch Action Bar when items selected */}
      {selectedIds.length > 0 && (
        <div className="shrink-0 hv-pill-amber p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xl animate-fadeIn">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-bold text-[var(--text-primary)] text-sm">
              {isHindi ? `${selectedIds.length} इनवॉइस चयनित हैं` : `${selectedIds.length} invoice(s) selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {onOpenEWayBillModal && perms.canCreateEditTransactions && ewayBillActive && (
              <button
                onClick={() => onOpenEWayBillModal(selectedIds)}
                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-3.5 py-1.5 rounded-lg shadow transition flex items-center gap-1.5 cursor-pointer"
              >
                <Truck className="w-3.5 h-3.5" />
                <span>{isHindi ? 'चयनित का e-Way Bill JSON बनाएं' : 'Generate e-Way Bill JSON (Batch)'}</span>
              </button>
            )}
            <button
              onClick={() => setSelectedIds([])}
              className="bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] text-xs px-2.5 py-1.5 rounded-lg transition"
            >
              {isHindi ? 'चयन हटाएं' : 'Clear Selection'}
            </button>
          </div>
        </div>
      )}

      {/* Invoices Data Table */}
      <div className="flex-1 min-h-0 flex flex-col hv-surface border border-[var(--border-primary)] rounded-2xl shadow-xl overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs uppercase font-bold tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === filtered.length}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    title={isHindi ? 'सभी चुनें' : 'Select All'}
                  />
                </th>
                <th className="p-3">Invoice #</th>
                <th className="p-3">Customer Party</th>
                <th className="p-3">GSTIN</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">{isHindi ? 'छूट (Discount)' : 'Discount'}</th>
                <th className="p-3 text-right">Grand Total</th>
                <th className="p-3 text-right">Paid</th>
                <th className="p-3 text-right">Balance Due</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-[var(--text-muted)]">
                    {isHindi ? 'कोई इनवॉइस नहीं मिला।' : 'No invoices found matching criteria.'}
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => {
                  const due = inv.grandTotal - inv.amountPaid;
                  const isSelected = selectedIds.includes(inv.id);
                  const isMandatoryEwb = inv.grandTotal >= 50000;
                  const lineDiscSum = (inv.items || []).reduce(
                    (s, it) =>
                      s +
                      (Number(it.quantity) || 0) *
                        (Number(it.rate) || 0) *
                        ((Number(it.discountPercent) || 0) / 100),
                    0
                  );
                  const invDiscount =
                    Number(inv.totalDiscount) > 0
                      ? Number(inv.totalDiscount)
                      : Math.round(lineDiscSum * 100) / 100;
                  return (
                    <tr 
                      key={inv.id} 
                      className={`hover:bg-[var(--hover-surface)] transition ${isSelected ? 'hv-pill-indigo' : ''}`}
                    >
                      <td className="p-3 w-10 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectInvoice(inv.id)}
                          className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                        />
                      </td>
                      <td className="p-3 font-bold text-indigo-500">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{inv.invoiceNumber}</span>
                            {inv.isRecurring && (
                              <span 
                                className="inline-flex items-center gap-1 hv-pill-amber border px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                title={`Recurring (${inv.frequency}) - Next auto-run: ${inv.nextRecurringDate}`}
                              >
                                <Repeat className="w-3 h-3" />
                                <span>{inv.frequency}</span>
                              </span>
                            )}
                            {inv.recurringParentId && (
                              <span 
                                className="inline-flex items-center gap-1 hv-pill-indigo border px-1.5 py-0.5 rounded text-[10px] font-semibold"
                                title="Auto-generated from scheduled recurring template"
                              >
                                Auto
                              </span>
                            )}
                          </div>
                          {/* e-Way Bill Statutory Rule 138 Badge */}
                          {ewayBillActive && (inv.ewayBillNumber ? (
                            <div className="flex items-center gap-1 text-[10px] font-mono hv-pill-emerald border px-1.5 py-0.5 rounded w-fit">
                              <Truck className="w-2.5 h-2.5" />
                              <span>EWB: {inv.ewayBillNumber}</span>
                            </div>
                          ) : isMandatoryEwb ? (
                            <div 
                              className={`flex items-center gap-1 text-[10px] font-semibold hv-pill-amber border px-1.5 py-0.5 rounded w-fit ${perms.canCreateEditTransactions ? 'cursor-pointer transition' : ''}`}
                              title={isHindi ? 'नियम 138: ₹50,000 से अधिक - ई-वे बिल अनिवार्य है' : 'Rule 138: Consignment > ₹50,000 - e-Way Bill Mandatory'}
                              onClick={() => { if (perms.canCreateEditTransactions) onOpenEWayBillModal?.([inv.id]); }}
                            >
                              <Truck className="w-2.5 h-2.5" />
                              <span>{isHindi ? 'ई-वे बिल आवश्यक (>₹50k)' : 'EWB Mandatory (>₹50k)'}</span>
                            </div>
                          ) : null)}
                        </div>
                      </td>
                      <td className="p-3 font-semibold text-[var(--text-primary)]">{inv.partyName}</td>
                      <td className="p-3 font-mono text-[var(--text-secondary)] text-xs">{inv.partyGstin || (taxProfile.gstEnabled ? 'URP' : '-')}</td>
                      <td className="p-3 text-[var(--text-secondary)] whitespace-nowrap">{inv.date}</td>
                      <td className="p-3 text-right font-mono tabular-nums text-emerald-500">
                        {invDiscount > 0 ? `-${formatCurrency(invDiscount, currency)}` : '-'}
                      </td>
                      <td className="p-3 text-right font-bold text-[var(--text-primary)] font-mono tabular-nums">
                        {formatCurrency(inv.grandTotal, currency)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-emerald-500">
                        {formatCurrency(inv.amountPaid, currency)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-amber-500 font-semibold">
                        {formatCurrency(due, currency)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                          inv.status === 'PAID' ? 'hv-pill-emerald' :
                          inv.status === 'UNPAID' ? 'hv-pill-rose' :
                          'hv-pill-amber'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1.5">
                        {due > 0 && perms.canCreateEditTransactions && (
                          <button
                            onClick={() => {
                              setRecordPayModal(inv);
                              setPayAmount(due);
                              setPayMode('CASH');
                              setPayAccountId(cashLedgers[0]?.id || 'acc_cash');
                            }}
                            className="px-2 py-1 hv-pill-emerald border rounded-lg text-[11px] font-semibold transition"
                            title={isHindi ? 'भुगतान दर्ज करें' : 'Record Receipt'}
                          >
                            + Pay
                          </button>
                        )}
                        {onOpenEWayBillModal && perms.canCreateEditTransactions && ewayBillActive && (
                          <button
                            onClick={() => onOpenEWayBillModal([inv.id])}
                            className={`p-1.5 rounded-lg transition border ${
                              inv.ewayBillNumber
                                ? 'hv-pill-emerald'
                                : isMandatoryEwb
                                ? 'hv-pill-amber'
                                : 'bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border-[var(--border-primary)]'
                            }`}
                            title={
                              inv.ewayBillNumber
                                ? (isHindi ? `ई-वे बिल जेनरेट हो चुका है: ${inv.ewayBillNumber}` : `e-Way Bill already generated: ${inv.ewayBillNumber}`)
                                : (isHindi ? 'इस इनवॉइस का NIC ई-वे बिल JSON बनाएं' : 'Generate NIC e-Way Bill JSON for this invoice')
                            }
                          >
                            <Truck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {perms.canExportData && (
                          <button
                            onClick={() => onPrintInvoice(inv)}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-indigo-500 border border-[var(--border-primary)] rounded-lg transition"
                            title={isHindi ? 'प्रिंट इनवॉइस' : 'Print Tax Invoice'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onEditInvoice && perms.canCreateEditTransactions && (
                          <button
                            onClick={() => onEditInvoice(inv)}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-amber-500 border border-[var(--border-primary)] rounded-lg transition"
                            title={isHindi ? 'इनवॉइस में संशोधन करें' : 'Edit Invoice Data'}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {perms.canDeleteRecords && (deletingId === inv.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                onDeleteInvoice(inv.id);
                                setDeletingId(null);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white font-bold text-[10px] rounded transition shadow"
                              title={isHindi ? 'पुष्टि करें - इनवॉइस हटाएँ' : 'Confirm Delete'}
                            >
                              {isHindi ? 'हटाएँ?' : 'Confirm?'}
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-1.5 py-1 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)] text-[10px] rounded"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingId(inv.id)}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-muted)] hover:text-rose-500 border border-[var(--border-primary)] rounded-lg transition"
                            title={isHindi ? 'हटाएँ' : 'Delete Invoice'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Recording Modal */}
      {recordPayModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-md p-5 text-[var(--text-primary)] space-y-4">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-500" />
              <span>{isHindi ? 'ग्राहक से रसीद दर्ज करें' : 'Record Receipt Payment'}</span>
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Invoice: <strong>{recordPayModal.invoiceNumber}</strong> ({recordPayModal.partyName})
            </p>

            <form onSubmit={handlePaySubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                    {isHindi ? 'भुगतान माध्यम' : 'Payment Mode'}
                  </label>
                  <select
                    value={payMode}
                    onChange={(e) => {
                      const nextMode = e.target.value;
                      setPayMode(nextMode);
                      if (nextMode === 'CASH') {
                        setPayAccountId(cashLedgers[0]?.id || 'acc_cash');
                      } else {
                        setPayAccountId(bankLedgers[0]?.id || 'acc_bank');
                      }
                    }}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold"
                  >
                    <option value="CASH">{isHindi ? 'नकद (Cash)' : 'Cash'}</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">{isHindi ? 'कार्ड (Card)' : 'Card'}</option>
                    <option value="BANK_TRANSFER">{isHindi ? 'बैंक ट्रांसफर' : 'Bank Transfer'}</option>
                    <option value="CHEQUE">{isHindi ? 'चेक (Cheque)' : 'Cheque'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                    {isHindi ? 'खाते में जमा' : 'Deposit Account'}
                  </label>
                  <select
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full hv-input text-emerald-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold"
                  >
                    {(payMode === 'CASH'
                      ? (cashLedgers.length > 0 ? cashLedgers : [{ id: 'acc_cash', name: 'Cash in Hand', code: '1010' } as any])
                      : (bankLedgers.length > 0 ? bankLedgers : [{ id: 'acc_bank', name: 'Bank Account', code: '1020' } as any])
                    ).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'प्राप्त राशि (Amount Received)' : 'Amount Received'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  max={recordPayModal.grandTotal - recordPayModal.amountPaid}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono font-bold text-emerald-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRecordPayModal(null)}
                  className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold rounded-xl"
                >
                  {isHindi ? 'रसीद सेव करें' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
