import React, { useState } from 'react';
import { 
  ShoppingBag, 
  FileText, 
  Plus, 
  Search, 
  Trash2, 
  CheckCircle2, 
  ArrowRight, 
  DollarSign, 
  Clock, 
  Calendar,
  Building2,
  PackageCheck,
  Edit3,
  Sparkles,
  Printer
} from 'lucide-react';
import { AppData, PurchaseInvoice, PurchaseOrder, PartyMaster, ItemMaster, InvoiceItem, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getRolePermissions, normalizeUserRole, RolePermissions } from '../../utils/rbac';
import { PurchaseBillModal } from './PurchaseBillModal';
import { PurchaseOrderModal } from './PurchaseOrderModal';
import { PurchasePrintModal } from './PurchasePrintModal';
import { PurchaseBillPDFImporter } from './PurchaseBillPDFImporter';

interface PurchaseModuleProps {
  data: AppData;
  isHindi: boolean;
  onSaveBill: (bill: PurchaseInvoice) => void;
  onDeleteBill: (id: string) => void;
  onSavePO: (po: PurchaseOrder) => void;
  onDeletePO: (id: string) => void;
  onAddParty?: (party: PartyMaster) => void;
  onAddItem?: (item: ItemMaster) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const PurchaseModule: React.FC<PurchaseModuleProps> = ({
  data,
  isHindi,
  onSaveBill,
  onDeleteBill,
  onSavePO,
  onDeletePO,
  onAddParty,
  onAddItem,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const [activeTab, setActiveTab] = useState<'BILLS' | 'ORDERS'>('BILLS');
  const [search, setSearch] = useState('');

  const [showBillModal, setShowBillModal] = useState(false);
  const [editingBill, setEditingBill] = useState<PurchaseInvoice | null>(null);
  const [printingBill, setPrintingBill] = useState<PurchaseInvoice | null>(null);

  const [showPOModal, setShowPOModal] = useState(false);
  const [editingPO, setEditingPO] = useState<PurchaseOrder | null>(null);

  const [showPdfImporter, setShowPdfImporter] = useState(false);
  const [prefilledBillData, setPrefilledBillData] = useState<{
    partyId: string;
    supplierInvoiceNo: string;
    date: string;
    dueDate: string;
    items: InvoiceItem[];
    notes: string;
    createdVendorName?: string;
    createdItemsCount?: number;
  } | null>(null);

  const [selectedPOForConversion, setSelectedPOForConversion] = useState<PurchaseOrder | null>(null);

  const [deletingBillId, setDeletingBillId] = useState<string | null>(null);
  const [deletingPOId, setDeletingPOId] = useState<string | null>(null);

  const bills = data.purchaseInvoices || [];
  const orders = data.purchaseOrders || [];

  const filteredBills = bills.filter(b => 
    b.billNumber.toLowerCase().includes(search.toLowerCase()) ||
    b.supplierInvoiceNo.toLowerCase().includes(search.toLowerCase()) ||
    b.partyName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredOrders = orders.filter(o => 
    o.poNumber.toLowerCase().includes(search.toLowerCase()) ||
    o.partyName.toLowerCase().includes(search.toLowerCase())
  );

  // Totals
  const totalPurchaseValue = bills.reduce((acc, b) => acc + b.grandTotal, 0);
  const totalPaid = bills.reduce((acc, b) => acc + b.amountPaid, 0);
  const totalPayable = totalPurchaseValue - totalPaid;

  const handleConvertPOToBill = (po: PurchaseOrder) => {
    setSelectedPOForConversion(po);
    setEditingBill(null);
    setShowBillModal(true);
  };

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-4 w-full md:overflow-hidden animate-fadeIn">
      {/* Top Banner */}
      <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hv-surface p-4 md:p-5 rounded-2xl border border-[var(--border-primary)] shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-500" />
            <span>{isHindi ? 'खरीद एवं परचेज ऑर्डर (Purchase Bills & PO)' : 'Purchase Bills & Purchase Orders'}</span>
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {isHindi 
              ? 'सप्लायर एवं विक्रेताओं के परचेज बिल, परचेज ऑर्डर तथा स्टॉक वृद्धि का प्रबंधन'
              : 'Manage vendor bills, purchase orders (PO), input tax credit (ITC) and stock inflow'}
          </p>
        </div>

        {perms.canCreateEditVouchers && (
          <div className="flex flex-wrap items-center gap-2">
            {onAddParty && onAddItem && (
              <button
                onClick={() => setShowPdfImporter(true)}
                className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white hv-keep-white font-bold text-xs px-3.5 py-2.5 rounded-xl shadow-lg shadow-amber-600/30 transition"
              >
                <Sparkles className="w-4 h-4 text-amber-100" />
                <span>{isHindi ? '📄 AI परचेज बिल PDF इंपोर्ट' : '📄 AI Import PDF Bill'}</span>
              </button>
            )}

            <button
              onClick={() => {
                setEditingPO(null);
                setPrefilledBillData(null);
                setShowPOModal(true);
              }}
              className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-bold text-xs px-3.5 py-2.5 rounded-xl transition shadow"
            >
              <FileText className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? '+ नया परचेज ऑर्डर (PO)' : '+ New Purchase Order'}</span>
            </button>

            <button
              onClick={() => {
                setEditingBill(null);
                setSelectedPOForConversion(null);
                setPrefilledBillData(null);
                setShowBillModal(true);
              }}
              className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-bold text-xs px-3.5 py-2.5 rounded-xl transition shadow"
            >
              <Plus className="w-4 h-4 text-amber-500" />
              <span>{isHindi ? '+ नया परचेज बिल दर्ज करें' : '+ Record Purchase Bill'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Metrics Bar */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="hv-surface p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between shadow">
          <div>
            <div className="text-xs font-semibold text-[var(--text-muted)]">{isHindi ? 'कुल खरीद मान (Total Purchases)' : 'Total Purchase Value'}</div>
            <div className="text-lg font-extrabold text-amber-500 font-mono tabular-nums mt-0.5">{formatCurrency(totalPurchaseValue, currency)}</div>
            <div className="text-xs text-[var(--text-muted)]">{bills.length} Purchase Bills Recorded</div>
          </div>
          <div className="p-3 hv-pill-amber rounded-xl border">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        <div className="hv-surface p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between shadow">
          <div>
            <div className="text-xs font-semibold text-[var(--text-muted)]">{isHindi ? 'सप्लायर भुगतान (Total Paid)' : 'Total Amount Paid'}</div>
            <div className="text-lg font-extrabold text-emerald-500 font-mono tabular-nums mt-0.5">{formatCurrency(totalPaid, currency)}</div>
            <div className="text-xs text-emerald-500 font-medium">Cleared Vendor Dues</div>
          </div>
          <div className="p-3 hv-pill-emerald rounded-xl border">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="hv-surface p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between shadow">
          <div>
            <div className="text-xs font-semibold text-[var(--text-muted)]">{isHindi ? 'शेष भुगतान (Outstanding Dues)' : 'Outstanding Payable Dues'}</div>
            <div className="text-lg font-extrabold text-rose-500 font-mono tabular-nums mt-0.5">{formatCurrency(totalPayable, currency)}</div>
            <div className="text-xs text-rose-500 font-medium">Payable to Suppliers</div>
          </div>
          <div className="p-3 hv-pill-rose rounded-xl border">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 hv-surface p-3 rounded-xl border border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('BILLS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'BILLS'
                ? 'bg-amber-600 text-white hv-keep-white shadow-lg shadow-amber-600/30'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>{isHindi ? 'परचेज बिल सूची (Purchase Bills)' : 'Purchase Bills / Invoices'} ({bills.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
              activeTab === 'ORDERS'
                ? 'bg-indigo-600 text-white hv-keep-white shadow-lg shadow-indigo-600/30'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>{isHindi ? 'परचेज ऑर्डर (Purchase Orders)' : 'Purchase Orders (PO)'} ({orders.length})</span>
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search supplier, bill no, PO..."
            className="w-full hv-input border border-[var(--border-subtle)] rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Tab 1: Purchase Bills */}
      {activeTab === 'BILLS' && (
        <div className="flex-1 min-h-0 flex flex-col hv-surface rounded-2xl border border-[var(--border-primary)] shadow-xl overflow-hidden">
          <div className="shrink-0 p-3.5 px-4 hv-elevated border-b border-[var(--border-primary)] flex items-center justify-between">
            <h3 className="font-bold text-xs text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-500" />
              <span>{isHindi ? 'दर्ज परचेज बिल सूची' : 'Vendor Purchase Bills & GST Invoices'}</span>
            </h3>
            <span className="text-xs font-semibold text-[var(--text-muted)]">{filteredBills.length} Bills Found</span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left border-collapse text-sm text-[var(--text-primary)]">
              <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold uppercase text-xs border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="p-3">Bill Ref #</th>
                  <th className="p-3">Supplier Invoice #</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Supplier / Vendor</th>
                  <th className="p-3">Items</th>
                  <th className="p-3 text-right">Tax Amt</th>
                  <th className="p-3 text-right">Total Amount</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[var(--text-muted)]">
                      <ShoppingBag className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-60" />
                      <p className="font-bold text-[var(--text-secondary)]">{isHindi ? 'कोई परचेज बिल नहीं मिला' : 'No Purchase Bills Found'}</p>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1">
                        {isHindi ? 'नया परचेज बिल दर्ज करने के लिए "+ Record Purchase Bill" पर क्लिक करें' : 'Click "+ Record Purchase Bill" to add vendor purchase invoice'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((b) => (
                    <tr key={b.id} className="hover:bg-[var(--hover-surface)] transition">
                      <td className="p-3 font-mono font-bold text-amber-500">{b.billNumber}</td>
                      <td className="p-3 font-mono text-[var(--text-primary)]">{b.supplierInvoiceNo}</td>
                      <td className="p-3 text-[var(--text-secondary)] whitespace-nowrap">{b.date}</td>
                      <td className="p-3">
                        <div className="font-bold text-[var(--text-primary)]">{b.partyName}</div>
                        <div className="text-xs font-mono text-[var(--text-muted)]">{b.partyGstin || 'Unregistered'}</div>
                      </td>
                      <td className="p-3 text-[var(--text-secondary)]">
                        {b.items.length} items ({b.items[0]?.itemName || ''}...)
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                        {formatCurrency(b.totalTax, currency)}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-amber-500">
                        {formatCurrency(b.grandTotal, currency)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          b.status === 'PAID' 
                            ? 'hv-pill-emerald'
                            : b.status === 'PARTIAL'
                            ? 'hv-pill-amber'
                            : 'hv-pill-rose'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        {perms.canExportData && (
                          <button
                            onClick={() => setPrintingBill(b)}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-indigo-500 border border-[var(--border-primary)] rounded-lg transition"
                            title={isHindi ? 'परचेज वाउचर प्रिंट करें' : 'Print Purchase Voucher'}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {perms.canCreateEditVouchers && (
                          <button
                            onClick={() => {
                              setEditingBill(b);
                              setSelectedPOForConversion(null);
                              setShowBillModal(true);
                            }}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-amber-500 border border-[var(--border-primary)] rounded-lg transition"
                            title="Edit Bill"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {perms.canDeleteRecords && (deletingBillId === b.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => {
                                onDeleteBill(b.id);
                                setDeletingBillId(null);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white font-bold text-[10px] rounded transition shadow"
                              title={isHindi ? 'पुष्टि करें - बिल हटाएँ' : 'Confirm Delete'}
                            >
                              {isHindi ? 'हटाएँ?' : 'Confirm?'}
                            </button>
                            <button
                              onClick={() => setDeletingBillId(null)}
                              className="px-1.5 py-1 bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] text-[10px] rounded"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingBillId(b.id)}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-rose-500/15 text-[var(--text-muted)] hover:text-rose-500 border border-[var(--border-primary)] rounded-lg transition"
                            title="Delete Bill"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Purchase Orders */}
      {activeTab === 'ORDERS' && (
        <div className="flex-1 min-h-0 flex flex-col hv-surface rounded-2xl border border-[var(--border-primary)] shadow-xl overflow-hidden">
          <div className="shrink-0 p-3.5 px-4 hv-elevated border-b border-[var(--border-primary)] flex items-center justify-between">
            <h3 className="font-bold text-xs text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? 'जारी किए गए परचेज ऑर्डर (PO)' : 'Issued Purchase Orders'}</span>
            </h3>
            <span className="text-xs font-semibold text-[var(--text-muted)]">{filteredOrders.length} POs Found</span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left border-collapse text-sm text-[var(--text-primary)]">
              <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold uppercase text-xs border-b border-[var(--border-subtle)]">
                <tr>
                  <th className="p-3">PO Number</th>
                  <th className="p-3">Issue Date</th>
                  <th className="p-3">Exp. Delivery</th>
                  <th className="p-3">Supplier / Vendor</th>
                  <th className="p-3">Items Count</th>
                  <th className="p-3 text-right">Total PO Value</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[var(--text-muted)]">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-[var(--text-muted)] opacity-60" />
                      <p className="font-bold text-[var(--text-secondary)]">{isHindi ? 'कोई परचेज ऑर्डर नहीं मिला' : 'No Purchase Orders Issued'}</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">
                        {isHindi ? 'नया परचेज ऑर्डर बनाने के लिए "+ New Purchase Order" पर क्लिक करें' : 'Click "+ New Purchase Order" to create PO'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => (
                    <tr key={o.id} className="hover:bg-[var(--hover-surface)] transition">
                      <td className="p-3 font-mono font-bold text-indigo-500">{o.poNumber}</td>
                      <td className="p-3 text-[var(--text-secondary)] whitespace-nowrap">{o.date}</td>
                      <td className="p-3 text-[var(--text-secondary)] whitespace-nowrap">{o.expectedDeliveryDate}</td>
                      <td className="p-3 font-bold text-[var(--text-primary)]">{o.partyName}</td>
                      <td className="p-3 text-[var(--text-secondary)]">{o.items.length} Items</td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-indigo-500">
                        {formatCurrency(o.grandTotal, currency)}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          o.status === 'APPROVED' 
                            ? 'hv-pill-emerald'
                            : o.status === 'FULFILLED'
                            ? 'hv-pill-indigo'
                            : o.status === 'CANCELLED'
                            ? 'hv-pill-rose'
                            : 'hv-pill-amber'
                        }`}>
                          {o.status}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-1">
                        {o.status !== 'FULFILLED' && perms.canCreateEditVouchers && (
                          <button
                            onClick={() => handleConvertPOToBill(o)}
                            className="p-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white hv-keep-white rounded-lg transition font-bold text-[10px] inline-flex items-center gap-1 shadow"
                            title="Convert PO to Purchase Bill"
                          >
                            <PackageCheck className="w-3.5 h-3.5" />
                            <span>{isHindi ? 'बिल में बदलें' : 'To Bill'}</span>
                          </button>
                        )}
                        {perms.canCreateEditVouchers && (
                          <button
                            onClick={() => {
                              setEditingPO(o);
                              setShowPOModal(true);
                            }}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-indigo-500 border border-[var(--border-primary)] rounded-lg transition"
                            title="Edit PO"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {perms.canDeleteRecords && (deletingPOId === o.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => {
                                onDeletePO(o.id);
                                setDeletingPOId(null);
                              }}
                              className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white font-bold text-[10px] rounded transition shadow"
                              title={isHindi ? 'पुष्टि करें - परचेज ऑर्डर हटाएँ' : 'Confirm Delete'}
                            >
                              {isHindi ? 'हटाएँ?' : 'Confirm?'}
                            </button>
                            <button
                              onClick={() => setDeletingPOId(null)}
                              className="px-1.5 py-1 bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)] text-[10px] rounded"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeletingPOId(o.id)}
                            className="p-1.5 bg-[var(--bg-elevated)] hover:bg-rose-500/15 text-[var(--text-muted)] hover:text-rose-500 border border-[var(--border-primary)] rounded-lg transition"
                            title="Delete PO"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PDF Importer Modal */}
      {showPdfImporter && onAddParty && onAddItem && (
        <PurchaseBillPDFImporter
          data={data}
          isHindi={isHindi}
          onAddParty={onAddParty}
          onAddItem={onAddItem}
          onClose={() => setShowPdfImporter(false)}
          onImportComplete={(imported) => {
            setShowPdfImporter(false);
            setPrefilledBillData(imported);
            setEditingBill(null);
            setSelectedPOForConversion(null);
            setShowBillModal(true);
          }}
        />
      )}

      {/* Bill Modal */}
      {showBillModal && (
        <PurchaseBillModal
          data={data}
          isHindi={isHindi}
          editingBill={editingBill}
          selectedPOForConversion={selectedPOForConversion}
          prefilledImportData={prefilledBillData}
          onAddParty={onAddParty}
          onAddItem={onAddItem}
          onSaveBill={(bill) => {
            onSaveBill(bill);
            setShowBillModal(false);
            setEditingBill(null);
            setSelectedPOForConversion(null);
            setPrefilledBillData(null);
          }}
          onClose={() => {
            setShowBillModal(false);
            setEditingBill(null);
            setSelectedPOForConversion(null);
            setPrefilledBillData(null);
          }}
        />
      )}

      {/* PO Modal */}
      {showPOModal && (
        <PurchaseOrderModal
          data={data}
          isHindi={isHindi}
          editingPO={editingPO}
          prefilledImportData={prefilledBillData}
          onAddParty={onAddParty}
          onAddItem={onAddItem}
          onSavePO={(po) => {
            onSavePO(po);
            setShowPOModal(false);
            setEditingPO(null);
            setPrefilledBillData(null);
          }}
          onClose={() => {
            setShowPOModal(false);
            setEditingPO(null);
            setPrefilledBillData(null);
          }}
        />
      )}

      {/* Print Purchase Voucher Modal */}
      {printingBill && (
        <PurchasePrintModal
          purchase={printingBill}
          data={data}
          isHindi={isHindi}
          onClose={() => setPrintingBill(null)}
        />
      )}
    </div>
  );
};
