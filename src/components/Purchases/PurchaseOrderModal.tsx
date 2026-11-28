import React, { useState } from 'react';
import { FileText, Plus, Trash2, X, Calculator, CheckCircle2, Sparkles } from 'lucide-react';
import { AppData, PurchaseOrder, InvoiceItem, PartyMaster, ItemMaster } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { generateNextNumber } from '../../utils/accounting';
import { SearchableItemSelect } from '../Common/SearchableItemSelect';
import { PurchaseBillPDFImporter } from './PurchaseBillPDFImporter';

interface PurchaseOrderModalProps {
  data: AppData;
  isHindi: boolean;
  editingPO?: PurchaseOrder | null;
  prefilledImportData?: {
    partyId: string;
    supplierInvoiceNo: string;
    date: string;
    dueDate: string;
    items: InvoiceItem[];
    notes: string;
    createdVendorName?: string;
    createdItemsCount?: number;
  } | null;
  onSavePO: (po: PurchaseOrder) => void;
  onClose: () => void;
  onAddParty?: (party: PartyMaster) => void;
  onAddItem?: (item: ItemMaster) => void;
}

export const PurchaseOrderModal: React.FC<PurchaseOrderModalProps> = ({
  data,
  isHindi,
  editingPO,
  prefilledImportData,
  onSavePO,
  onClose,
  onAddParty,
  onAddItem
}) => {
  const currency = data.company.currency;
  const vendors = data.parties.filter(p => p.type === 'VENDOR' || p.type === 'BOTH');

  const defaultPONo = editingPO 
    ? editingPO.poNumber 
    : generateNextNumber('PO', data.purchaseOrders || []);

  const [poNumber, setPoNumber] = useState(defaultPONo);
  const [date, setDate] = useState(editingPO ? editingPO.date : (prefilledImportData?.date || new Date().toISOString().split('T')[0]));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState(() => {
    if (editingPO) return editingPO.expectedDeliveryDate;
    if (prefilledImportData?.dueDate) return prefilledImportData.dueDate;
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });

  const defaultPartyId = editingPO
    ? editingPO.partyId
    : (prefilledImportData?.partyId || '');

  const [partyId, setPartyId] = useState(defaultPartyId);
  const [status, setStatus] = useState<'PENDING' | 'APPROVED' | 'FULFILLED' | 'CANCELLED'>(
    editingPO ? editingPO.status : 'PENDING'
  );
  const [notes, setNotes] = useState(editingPO ? (editingPO.notes || '') : (prefilledImportData?.notes || ''));

  const [showPdfImporter, setShowPdfImporter] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(() => {
    if (prefilledImportData?.createdVendorName || (prefilledImportData?.createdItemsCount && prefilledImportData.createdItemsCount > 0)) {
      return `✨ AI Auto-Created: Vendor '${prefilledImportData.createdVendorName || 'New Vendor'}' & ${prefilledImportData.createdItemsCount || 0} Stock Items!`;
    }
    return null;
  });

  const selectedParty = data.parties.find(p => p.id === partyId);

  // Line Items
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (editingPO && editingPO.items && editingPO.items.length > 0) {
      return editingPO.items;
    }
    if (prefilledImportData && prefilledImportData.items && prefilledImportData.items.length > 0) {
      return prefilledImportData.items;
    }
    return [
      {
        id: 'po_item_1',
        itemId: '',
        itemName: '',
        hsnSacCode: '',
        quantity: 1,
        unit: '',
        rate: 0,
        discountPercent: 0,
        taxRate: 0,
        taxAmount: 0,
        totalAmount: 0
      }
    ];
  });

  const updateItemRow = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[index] };

    if (field === 'itemId') {
      const master = data.items.find(i => i.id === value);
      if (master) {
        item.itemId = master.id;
        item.itemName = master.name;
        item.hsnSacCode = master.hsnSacCode;
        item.unit = master.unit;
        item.rate = master.purchasePrice || master.salesPrice || 100;
        item.taxRate = master.taxRate || 18;
      }
    } else {
      (item as any)[field] = value;
    }

    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const disc = Number(item.discountPercent) || 0;
    const taxRate = Number(item.taxRate) || 0;

    const gross = qty * rate;
    const netBase = gross - (gross * (disc / 100));
    const tax = netBase * (taxRate / 100);

    item.taxAmount = tax;
    item.totalAmount = netBase + tax;

    updated[index] = item;
    setItems(updated);
  };

  const addItemRow = () => {
    const newItem: InvoiceItem = {
      id: 'po_item_' + Date.now(),
      itemId: '',
      itemName: '',
      hsnSacCode: '',
      quantity: 1,
      unit: '',
      rate: 0,
      discountPercent: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0
    };
    setItems([...items, newItem]);
  };

  const removeItemRow = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((acc, i) => {
    const qty = Number(i.quantity) || 0;
    const rate = Number(i.rate) || 0;
    const disc = Number(i.discountPercent) || 0;
    const gross = qty * rate;
    return acc + (gross - (gross * (disc / 100)));
  }, 0);

  const totalTax = items.reduce((acc, i) => acc + (Number(i.taxAmount) || 0), 0);
  const grandTotal = subtotal + totalTax;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partyId || items.length === 0) return;

    const newPO: PurchaseOrder = {
      id: editingPO ? editingPO.id : 'po_' + Date.now(),
      poNumber,
      date,
      expectedDeliveryDate,
      partyId,
      partyName: selectedParty ? selectedParty.name : 'Vendor',
      partyGstin: selectedParty?.gstin || '',
      partyState: selectedParty?.state || '',
      items,
      subtotal,
      totalTax,
      grandTotal,
      status,
      notes
    };

    onSavePO(newPO);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fadeIn">
      <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-4xl p-5 md:p-6 text-[var(--text-primary)] space-y-5 shadow-2xl my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 hv-pill-indigo border rounded-xl">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)]">
                {editingPO 
                  ? (isHindi ? `परचेज ऑर्डर अपडेट करें (${editingPO.poNumber})` : `Edit Purchase Order #${editingPO.poNumber}`)
                  : (isHindi ? 'नया परचेज ऑर्डर जारी करें (Issue Purchase Order)' : 'Create New Purchase Order')}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {isHindi ? 'विक्रेता को सामग्री/सामान का औपचारिक आदेश भेजें' : 'Issue official Purchase Order to suppliers before material delivery'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onAddParty && onAddItem && (
              <button
                type="button"
                onClick={() => setShowPdfImporter(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white hv-keep-white font-bold text-xs px-3 py-2 rounded-xl shadow transition"
              >
                <Sparkles className="w-4 h-4 text-indigo-100" />
                <span>{isHindi ? '📄 PDF से PO बनाएं (AI)' : '📄 Import PDF for PO'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-xl hover:bg-[var(--hover-surface)] transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {importNotice && (
          <div className="p-3 hv-pill-emerald border rounded-xl text-xs font-bold flex items-center justify-between shadow animate-fadeIn">
            <span>{importNotice}</span>
            <button
              type="button"
              onClick={() => setImportNotice(null)}
              className="p-1 hover:opacity-80 rounded-lg"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {showPdfImporter && onAddParty && onAddItem && (
          <PurchaseBillPDFImporter
            data={data}
            isHindi={isHindi}
            onAddParty={onAddParty}
            onAddItem={onAddItem}
            onClose={() => setShowPdfImporter(false)}
            onImportComplete={(imported) => {
              setShowPdfImporter(false);
              setPartyId(imported.partyId);
              setDate(imported.date);
              setExpectedDeliveryDate(imported.dueDate);
              if (imported.items && imported.items.length > 0) {
                setItems(imported.items);
              }
              if (imported.notes) {
                setNotes(imported.notes);
              }
              if (imported.createdVendorName || (imported.createdItemsCount && imported.createdItemsCount > 0)) {
                setImportNotice(`✨ AI Auto-Created: Vendor '${imported.createdVendorName || 'Vendor'}' & ${imported.createdItemsCount || 0} Stock Items!`);
              }
            }}
          />
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 hv-elevated p-4 rounded-xl border border-[var(--border-primary)]">
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">PO Number *</label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 font-mono text-indigo-500 font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">PO Issue Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5"
                required
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">Expected Delivery Date</label>
              <input
                type="date"
                value={expectedDeliveryDate}
                onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 font-semibold"
              >
                <option value="PENDING">PENDING (लंबित)</option>
                <option value="APPROVED">APPROVED (स्वीकृत)</option>
                <option value="FULFILLED">FULFILLED (प्राप्त / पूरा हुआ)</option>
                <option value="CANCELLED">CANCELLED (रद्द)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] font-semibold mb-1">Select Vendor / Supplier *</label>
            <select
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 font-semibold"
              required
            >
              <option value="">-- Choose Vendor --</option>
              {vendors.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.gstin ? `GSTIN: ${v.gstin}` : 'Unregistered'}) - {v.state}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-[var(--text-primary)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-indigo-500" />
                <span>PO Items & Quantities</span>
              </h4>

              <button
                type="button"
                onClick={addItemRow}
                className="flex items-center gap-1.5 text-xs font-bold hv-pill-indigo border px-3 py-1.5 rounded-xl transition hover:opacity-90"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Add Line Item</span>
              </button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border-primary)]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold uppercase text-[10px] border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="p-3">Item Name</th>
                    <th className="p-3 w-20">Qty</th>
                    <th className="p-3 w-28">Est. Rate ({currency})</th>
                    <th className="p-3 w-20">Tax %</th>
                    <th className="p-3 w-32 text-right">Total ({currency})</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] bg-[var(--bg-surface)]">
                  {items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-2 min-w-[220px]">
                        <SearchableItemSelect
                          items={data.items}
                          selectedItemId={item.itemId}
                          selectedItemName={item.itemName}
                          onSelectItem={(selectedMaster) => {
                            updateItemRow(idx, 'itemId', selectedMaster.id);
                          }}
                          currency={currency}
                          priceType="purchase"
                          isHindi={isHindi}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItemRow(idx, 'quantity', Number(e.target.value))}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-center font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={item.rate || ''}
                          placeholder="0"
                          onChange={(e) => updateItemRow(idx, 'rate', Number(e.target.value))}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-right text-indigo-500 font-mono font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={item.taxRate}
                          onChange={(e) => updateItemRow(idx, 'taxRate', Number(e.target.value))}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-center"
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-bold text-indigo-500">
                        {formatCurrency(item.totalAmount, currency)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="p-1 text-[var(--text-muted)] hover:text-rose-500 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 hv-elevated p-4 rounded-xl border border-[var(--border-primary)]">
            <div className="w-full sm:w-1/2">
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">PO Notes / Special Delivery Instructions</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Deliver to Warehouse B..."
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2"
              />
            </div>

            <div className="text-right font-mono space-y-1">
              <div className="text-xs text-[var(--text-muted)]">Subtotal: {formatCurrency(subtotal, currency)}</div>
              <div className="text-xs text-[var(--text-muted)]">Tax: {formatCurrency(totalTax, currency)}</div>
              <div className="text-base font-bold text-indigo-500">Total PO Value: {formatCurrency(grandTotal, currency)}</div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isHindi ? 'परचेज ऑर्डर सेव करें' : 'Save Purchase Order'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
