import React, { useState } from 'react';
import { ShoppingBag, Plus, Trash2, X, Calculator, ArrowRight, FileCheck, CheckCircle2, UserPlus, PackagePlus, Sparkles, FileText, AlertCircle, Warehouse } from 'lucide-react';
import { AppData, PurchaseInvoice, InvoiceItem, PartyMaster, ItemMaster, PurchaseOrder } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  generateNextNumber,
  isDateLockedByBooksLock,
  getCashLedgers,
  getBankLedgers,
  isBankPaymentMode
} from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange, isDateInFinancialYear, isOptionalGstinValid } from '../../utils/fiscalYear';
import { ensureGodowns, resolveDefaultGodownId } from '../../utils/inventoryBatches';
import { QuickAddPartyModal } from '../Common/QuickAddPartyModal';
import { QuickAddStockItemModal } from '../Common/QuickAddStockItemModal';
import { SearchableItemSelect } from '../Common/SearchableItemSelect';
import { SearchablePartySelect } from '../Common/SearchablePartySelect';
import { PurchaseBillPDFImporter } from './PurchaseBillPDFImporter';
import { resolveCompanyTaxProfile, getCurrencySymbol } from '../../utils/companyProfile';
import { resolveIsInterStateSupply } from '../../utils/gstAuditEngine';

interface PurchaseBillModalProps {
  data: AppData;
  isHindi: boolean;
  editingBill?: PurchaseInvoice | null;
  selectedPOForConversion?: PurchaseOrder | null;
  prefilledImportData?: {
    partyId: string;
    supplierInvoiceNo: string;
    date: string;
    dueDate: string;
    items: InvoiceItem[];
    roundOff?: number;
    notes: string;
    createdVendorName?: string;
    createdItemsCount?: number;
    newParty?: PartyMaster;
    newItems?: ItemMaster[];
  } | null;
  onSaveBill: (bill: PurchaseInvoice) => void;
  onClose: () => void;
  onAddParty?: (party: PartyMaster) => void;
  onAddItem?: (item: ItemMaster) => void;
}

export const PurchaseBillModal: React.FC<PurchaseBillModalProps> = ({
  data,
  isHindi,
  editingBill,
  selectedPOForConversion,
  prefilledImportData,
  onSaveBill,
  onClose,
  onAddParty,
  onAddItem
}) => {
  const currency = data.company.currency;
  const currencySymbol = getCurrencySymbol(currency);
  const taxProfile = resolveCompanyTaxProfile(data.company);
  const gstActive = taxProfile.gstEnabled;
  const showCess = taxProfile.isRegularGst && taxProfile.cessEnabled;
  const companyState = data.company.state;
  const vendors = data.parties.filter(p => p.type === 'VENDOR' || p.type === 'BOTH');
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  const defaultBillNo = editingBill 
    ? editingBill.billNumber 
    : generateNextNumber('PB', data.purchaseInvoices || []);

  const [billNumber, setBillNumber] = useState(defaultBillNo);
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState(
    editingBill ? editingBill.supplierInvoiceNo : (prefilledImportData?.supplierInvoiceNo || (selectedPOForConversion ? `INV-PO-${selectedPOForConversion.poNumber}` : ''))
  );
  const [date, setDate] = useState(editingBill ? editingBill.date : (prefilledImportData?.date || defaultActiveDate));
  const [dueDate, setDueDate] = useState(() => {
    if (editingBill) return editingBill.dueDate;
    if (prefilledImportData?.dueDate) return prefilledImportData.dueDate;
    const base = new Date(defaultActiveDate);
    base.setDate(base.getDate() + 30);
    return base.toISOString().split('T')[0];
  });
  const [validationError, setValidationError] = useState<string | null>(null);

  const defaultPartyId = editingBill
    ? editingBill.partyId
    : (prefilledImportData?.partyId || (selectedPOForConversion ? selectedPOForConversion.partyId : ''));

  const appConfig = loadAppConfig();
  const accountsOnly = Boolean(appConfig.accountingWithoutInventory);
  const batchGodownActive = taxProfile.batchGodownEnabled || Boolean(appConfig.maintainBatches);
  const cashLedgers = getCashLedgers(data);
  const bankLedgers = getBankLedgers(data);
  const godowns = ensureGodowns(data.godowns);
  const [godownId, setGodownId] = useState<string>(() => editingBill?.godownId || resolveDefaultGodownId(godowns));
  const selectedGodown = godowns.find(g => g.id === godownId) || godowns[0];
  const [partyId, setPartyId] = useState(defaultPartyId);
  const [notes, setNotes] = useState(editingBill ? (editingBill.notes || '') : (prefilledImportData?.notes || ''));
  const [roundOff, setRoundOff] = useState<number>(editingBill ? (editingBill.roundOff || 0) : (prefilledImportData?.roundOff || 0));
  const [amountPaid, setAmountPaid] = useState(editingBill ? editingBill.amountPaid : 0);
  const [status, setStatus] = useState<'PAID' | 'PARTIAL' | 'UNPAID'>(editingBill ? editingBill.status : 'UNPAID');
  const [paymentMode, setPaymentMode] = useState<string>(() => {
    if (editingBill?.paymentMode) return editingBill.paymentMode;
    if ((editingBill?.amountPaid || 0) > 0 || editingBill?.status === 'PAID') return 'CASH';
    return 'CREDIT';
  });
  const [paymentAccountId, setPaymentAccountId] = useState<string>(() => {
    if (editingBill?.paymentAccountId) return editingBill.paymentAccountId;
    const initMode = editingBill?.paymentMode || (((editingBill?.amountPaid || 0) > 0 || editingBill?.status === 'PAID') ? 'CASH' : 'CREDIT');
    if (initMode === 'CREDIT') return '';
    return isBankPaymentMode(initMode) ? (bankLedgers[0]?.id || 'acc_bank') : (cashLedgers[0]?.id || 'acc_cash');
  });

  const [showPdfImporter, setShowPdfImporter] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(() => {
    if (prefilledImportData?.createdVendorName || (prefilledImportData?.createdItemsCount && prefilledImportData.createdItemsCount > 0)) {
      return `✨ AI Auto-Created: Vendor '${prefilledImportData.createdVendorName || 'New Vendor'}' & ${prefilledImportData.createdItemsCount || 0} Stock Items!`;
    }
    return null;
  });

  // Quick Add Modal States
  const [showQuickPartyModal, setShowQuickPartyModal] = useState(false);
  const [showQuickItemModal, setShowQuickItemModal] = useState(false);

  const handleQuickPartySaved = (newParty: PartyMaster) => {
    if (onAddParty) {
      onAddParty(newParty);
    }
    setPartyId(newParty.id);
  };

  const handleQuickItemSaved = (newItem: ItemMaster) => {
    if (onAddItem) {
      onAddItem(newItem);
    }
    const rate = newItem.purchasePrice || newItem.salesPrice || newItem.sellingPrice || 0;
    const tRate = gstActive ? (newItem.taxRate ?? newItem.gstRate ?? 0) : 0;
    const cRate = showCess ? (Number(newItem.cessRate) || 0) : 0;
    const lineSubtotal = 1 * rate;
    const tax = (lineSubtotal * tRate) / 100;
    const cessAmt = (lineSubtotal * cRate) / 100;
    const itemToAdd: InvoiceItem = {
      id: 'item_line_' + Date.now(),
      itemId: newItem.id,
      itemName: newItem.name,
      hsnSacCode: newItem.hsnSacCode || '',
      quantity: 1,
      unit: newItem.unit || 'PCS',
      rate: rate,
      discountPercent: 0,
      taxRate: tRate,
      taxAmount: Math.round(tax * 100) / 100,
      cessPercent: cRate > 0 ? cRate : undefined,
      cessAmount: cessAmt > 0 ? Math.round(cessAmt * 100) / 100 : undefined,
      totalAmount: Math.round((lineSubtotal + tax + cessAmt) * 100) / 100
    };
    setItems(prev => [...prev, itemToAdd]);
  };

  const selectedParty = data.parties.find(p => p.id === partyId);

  // Initial Line Items
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (editingBill && editingBill.items && editingBill.items.length > 0) {
      return editingBill.items;
    }
    if (prefilledImportData && prefilledImportData.items && prefilledImportData.items.length > 0) {
      return prefilledImportData.items;
    }
    if (selectedPOForConversion && selectedPOForConversion.items && selectedPOForConversion.items.length > 0) {
      return selectedPOForConversion.items;
    }
    return [
      {
        id: 'pb_item_1',
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

  const isInterState = selectedParty
    ? resolveIsInterStateSupply({
        companyGstin: data.company.gstin,
        companyState,
        companyStateCode: data.company.stateCode,
        partyGstin: selectedParty.gstin,
        partyState: selectedParty.state,
        partyStateCode: selectedParty.stateCode,
      })
    : false;

  // Item Calculations
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
        item.taxRate = gstActive ? (master.taxRate ?? master.gstRate ?? 0) : 0;
        item.cessPercent = showCess ? (Number(master.cessRate) || 0) : 0;
      }
    } else if (field === 'itemName') {
      item.itemName = value;
      const matchingMaster = data.items.find(i => i.name.trim().toLowerCase() === String(value).trim().toLowerCase());
      if (matchingMaster) {
        item.itemId = matchingMaster.id;
        if (matchingMaster.hsnSacCode && !item.hsnSacCode) item.hsnSacCode = matchingMaster.hsnSacCode;
        if (matchingMaster.unit && !item.unit) item.unit = matchingMaster.unit;
      } else {
        // Generate a new unique itemId for this new stock item
        item.itemId = 'itm_custom_' + Date.now() + '_' + index;
      }
    } else {
      (item as any)[field] = value;
    }

    // Recalculate row
    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const disc = Number(item.discountPercent) || 0;
    const taxRate = gstActive ? (Number(item.taxRate) || 0) : 0;
    const cessPct = showCess ? (Number(item.cessPercent) || 0) : 0;

    const gross = qty * rate;
    const netBase = gross - (gross * (disc / 100));
    const tax = netBase * (taxRate / 100);
    const cessAmt = netBase * (cessPct / 100);

    item.taxRate = taxRate;
    item.taxAmount = Math.round(tax * 100) / 100;
    item.cessAmount = cessPct > 0 ? Math.round(cessAmt * 100) / 100 : undefined;
    item.totalAmount = Math.round((netBase + tax + cessAmt) * 100) / 100;

    updated[index] = item;
    setItems(updated);
  };

  const addItemRow = () => {
    const newIdx = items.length + 1;
    const newItem: InvoiceItem = {
      id: 'pb_item_' + Date.now() + '_' + newIdx,
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

  // Grand Totals (strict 2-decimal double entry balance)
  const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const grossSubtotal = round2(items.reduce((acc, i) => acc + ((Number(i.quantity) || 0) * (Number(i.rate) || 0)), 0));
  const totalDiscount = round2(items.reduce((acc, i) => {
    const gross = (Number(i.quantity) || 0) * (Number(i.rate) || 0);
    return acc + (gross * ((Number(i.discountPercent) || 0) / 100));
  }, 0));
  const subtotal = round2(grossSubtotal - totalDiscount);

  const totalTax = gstActive ? round2(items.reduce((acc, i) => acc + (Number(i.taxAmount) || 0), 0)) : 0;
  const totalCess = showCess ? round2(items.reduce((acc, i) => acc + (Number(i.cessAmount) || 0), 0)) : 0;
  const cgstAmount = !gstActive || isInterState ? 0 : round2(totalTax / 2);
  const sgstAmount = !gstActive || isInterState ? 0 : round2(totalTax - cgstAmount);
  const igstAmount = !gstActive || !isInterState ? 0 : totalTax;
  const baseTotal = round2(subtotal + cgstAmount + sgstAmount + igstAmount + totalCess);
  const grandTotal = Math.max(0, round2(baseTotal + (Number(roundOff) || 0)));
  const exactRoundOff = Math.round((grandTotal - baseTotal) * 100) / 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const appConfig = loadAppConfig();

    if (!partyId || !selectedParty) {
      setValidationError(isHindi ? 'कृपया विक्रेता / सप्लायर चुनें।' : 'Please select a Vendor / Supplier.');
      return;
    }
    const vendorGstinCheck = isOptionalGstinValid(selectedParty.gstin);
    if (!vendorGstinCheck.valid) {
      setValidationError(isHindi ? (vendorGstinCheck.errorHindi || 'विक्रेता GSTIN अमान्य है।') : (vendorGstinCheck.error || 'Vendor GSTIN is invalid.'));
      return;
    }
    if (!billNumber.trim() || !supplierInvoiceNo.trim()) {
      setValidationError(isHindi ? 'सिस्टम रेफ नं. और सप्लायर बिल नंबर दोनों आवश्यक हैं।' : 'System Purchase Ref # and Supplier Invoice # are required.');
      return;
    }
    if (!isDateInFinancialYear(date, fyRange.fyStart)) {
      setValidationError(
        isHindi
          ? `अमान्य परचेज तिथि (${date}): बिल दिनांक सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) के भीतर होना चाहिए।`
          : `Out-of-FY Purchase Date (${date}): Bill date must fall within active ${fyRange.label} (${fyRange.displayRange}).`
      );
      return;
    }
    if (isDateLockedByBooksLock(date, appConfig.booksLockDate)) {
      setValidationError(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${appConfig.booksLockDate} या उससे पहले की तिथि में परचेज बिल दर्ज/संपादित नहीं किया जा सकता।`
          : `Books Locked: Bills dated on or before ${appConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }
    if (dueDate && dueDate < date) {
      setValidationError(isHindi ? 'भुगतान देय तिथि (Due Date) खरीद तिथि से पहले की नहीं हो सकती।' : 'Payment Due Date cannot be earlier than Purchase Date.');
      return;
    }
    if (items.length === 0 || items.some(it => !it.itemName.trim() || Number(it.quantity) <= 0 || Number(it.rate) < 0 || Number(it.taxRate) < 0 || Number(it.discountPercent) < 0 || Number(it.discountPercent) > 100)) {
      setValidationError(isHindi ? 'सभी आइटम का नाम, मात्रा (> 0), दर (>= 0) और टैक्स (>= 0%) सही होने चाहिए।' : 'Every line item must have valid name, Quantity > 0, Rate >= 0, and Tax Rate >= 0.');
      return;
    }
    if (gstActive && appConfig.hsnMandatory && items.some(it => (it.hsnSacCode || '').trim().length < 4)) {
      setValidationError(isHindi ? 'सेटिंग्स में HSN/SAC अनिवार्य है — प्रत्येक आइटम में कम से कम 4 अंकों का HSN/SAC कोड भरें।' : 'HSN/SAC code (min 4 characters) is mandatory per Settings.');
      return;
    }
    if (grandTotal <= 0) {
      setValidationError(isHindi ? `बिल की कुल राशि ${currencySymbol}0 से अधिक होनी चाहिए।` : 'Grand Total must be greater than zero.');
      return;
    }
    if (amountPaid < 0 || amountPaid > grandTotal) {
      setValidationError(isHindi ? 'अदा की गई राशि 0 से कम या कुल बिल से अधिक नहीं हो सकती।' : 'Amount Paid cannot be negative or exceed Grand Total.');
      return;
    }
    const duplicateVendorBill = (data.purchaseInvoices || []).some(
      b =>
        b.id !== editingBill?.id &&
        b.partyId === partyId &&
        b.supplierInvoiceNo.trim().toLowerCase() === supplierInvoiceNo.trim().toLowerCase()
    );
    if (duplicateVendorBill) {
      setValidationError(
        isHindi
          ? `डुप्लीकेट बिल: सप्लायर बिल "${supplierInvoiceNo}" इस विक्रेता के लिए पहले से मौजूद है।`
          : `Duplicate Bill: Supplier Invoice "${supplierInvoiceNo}" already exists for this vendor.`
      );
      return;
    }

    let computedStatus = status;
    if (amountPaid >= grandTotal && grandTotal > 0) {
      computedStatus = 'PAID';
    } else if (amountPaid > 0 && amountPaid < grandTotal) {
      computedStatus = 'PARTIAL';
    } else if (amountPaid === 0) {
      computedStatus = 'UNPAID';
    }

    const sanitizedItems = items.map(it => ({
      ...it,
      taxRate: gstActive ? (Number(it.taxRate) || 0) : 0,
      taxAmount: gstActive ? (Number(it.taxAmount) || 0) : 0,
      cessPercent: showCess ? it.cessPercent : undefined,
      cessAmount: showCess ? it.cessAmount : undefined,
      godownId: it.godownId || godownId,
    }));

    const finalPaymentMode = amountPaid > 0
      ? (paymentMode && paymentMode !== 'CREDIT' ? paymentMode : 'CASH')
      : 'CREDIT';
    const finalPaymentAccountId = amountPaid > 0
      ? (paymentAccountId || (isBankPaymentMode(finalPaymentMode) ? (bankLedgers[0]?.id || 'acc_bank') : (cashLedgers[0]?.id || 'acc_cash')))
      : undefined;

    const newBill: PurchaseInvoice = {
      id: editingBill ? editingBill.id : 'pb_' + Date.now(),
      billNumber,
      supplierInvoiceNo: supplierInvoiceNo || `SUP-${billNumber}`,
      date,
      dueDate,
      godownId,
      godownName: selectedGodown?.name || 'Main Godown',
      partyId,
      partyName: selectedParty ? selectedParty.name : 'Vendor',
      partyGstin: selectedParty?.gstin || '',
      partyState: selectedParty?.state || companyState,
      isInterState: gstActive ? isInterState : false,
      items: sanitizedItems,
      subtotal: grossSubtotal,
      totalDiscount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessAmount: totalCess,
      totalTax,
      roundOff: exactRoundOff,
      grandTotal,
      amountPaid,
      paymentMode: finalPaymentMode,
      paymentAccountId: finalPaymentAccountId,
      status: computedStatus,
      poReferenceNo: selectedPOForConversion ? selectedPOForConversion.poNumber : editingBill?.poReferenceNo,
      notes
    };

    onSaveBill(newBill);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl p-5 md:p-6 text-slate-200 space-y-5 shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-600/20 text-amber-400 border border-amber-500/30 rounded-xl">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {editingBill 
                  ? (isHindi ? `परचेज बिल अपडेट करें (${editingBill.billNumber})` : `Edit Purchase Bill #${editingBill.billNumber}`)
                  : (isHindi ? 'नया परचेज बिल / खरीद प्रविष्टि दर्ज करें' : 'Record New Purchase Invoice / Bill')}
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi ? 'विक्रेता (Vendor) से प्राप्त बिल, जीएसटी इनपुट टैक्स एवं स्टॉक इन्वेंटरी वृद्धि' : 'Log vendor bills, claim GST Input Tax Credit (ITC), and auto-update stock'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onAddParty && onAddItem && (
              <button
                type="button"
                onClick={() => setShowPdfImporter(true)}
                className="flex items-center gap-1.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold text-xs px-3 py-2 rounded-xl shadow transition"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>{isHindi ? '📄 PDF इंपोर्ट (AI Auto-Create)' : '📄 Import PDF Bill'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {importNotice && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs font-bold text-emerald-300 flex items-center justify-between shadow animate-fadeIn">
            <span>{importNotice}</span>
            <button
              type="button"
              onClick={() => setImportNotice(null)}
              className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-400"
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
              setSupplierInvoiceNo(imported.supplierInvoiceNo);
              setDate(imported.date);
              setDueDate(imported.dueDate);
              if (imported.items && imported.items.length > 0) {
                setItems(imported.items);
              }
              if (imported.roundOff !== undefined) {
                setRoundOff(imported.roundOff);
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

        <form onSubmit={handleSubmit} className="space-y-5 text-xs">
          {validationError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/50 rounded-xl text-rose-200 font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="text-rose-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Top Invoice Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700/60">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">System Purchase Ref #</label>
              <input
                type="text"
                value={billNumber}
                onChange={(e) => setBillNumber(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 font-mono text-amber-400 font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Supplier Bill / Invoice # *</label>
              <input
                type="text"
                value={supplierInvoiceNo}
                onChange={(e) => setSupplierInvoiceNo(e.target.value)}
                placeholder="e.g. SUPP-2026-99"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 font-mono text-white font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Purchase Date *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Payment Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white"
              />
            </div>
          </div>

          {/* Party Selection, Destination Godown & Tax Type */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
            <div className="md:col-span-2">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-slate-300 font-semibold">Select Vendor / Supplier *</label>
                <button
                  type="button"
                  onClick={() => setShowQuickPartyModal(true)}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-500/30 px-2 py-0.5 rounded-lg transition"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>{isHindi ? '+ नया सप्लायर' : '+ Quick Vendor'}</span>
                </button>
              </div>
              <SearchablePartySelect
                parties={vendors}
                selectedPartyId={partyId}
                onSelectParty={(id) => setPartyId(id)}
                isHindi={isHindi}
                onAddNewParty={() => setShowQuickPartyModal(true)}
                placeholder={isHindi ? '🔍 सप्लायर / वेंडर चुनें या खोजें...' : '🔍 Search or select vendor / supplier...'}
              />
            </div>

            {accountsOnly ? (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'बिलिंग मोड' : 'Accounting Mode'}
                </label>
                <div className="bg-amber-500/10 p-2.5 border border-amber-500/35 rounded-xl text-xs font-bold text-amber-300 text-center">
                  {isHindi ? 'केवल अकाउंटिंग (No Stock)' : 'Accounts Only (No Stock)'}
                </div>
              </div>
            ) : (batchGodownActive || godowns.length > 1) ? (
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'आवक गोदाम (Dest Godown)' : 'Receive into Godown'}
                </label>
                <select
                  value={godownId}
                  onChange={(e) => setGodownId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-cyan-300 font-semibold focus:border-cyan-500 focus:outline-none"
                >
                  {godowns.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Tax Applicability</label>
              <div className="bg-slate-900 p-2.5 border border-slate-700 rounded-xl flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium truncate">
                  {!gstActive ? 'Non-GST / Tax-Free' : (isInterState ? 'IGST' : 'CGST + SGST')}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${!gstActive ? 'bg-slate-800 text-slate-300' : (isInterState ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300')}`}>
                  {!gstActive ? 'EXEMPT' : (isInterState ? 'IGST' : 'INTRA')}
                </span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-white uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-amber-400" />
                <span>{accountsOnly ? (isHindi ? `सेवा व खर्च विवरण (${items.length})` : `Expense & Service Particulars (${items.length})`) : `Line Items & Purchase Costing (${items.length})`}</span>
              </h4>

              <div className="flex items-center gap-2">
                {!accountsOnly && (
                  <button
                    type="button"
                    onClick={() => setShowQuickItemModal(true)}
                    className="flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1.5 rounded-xl transition"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isHindi ? '+ नया स्टॉक (Item)' : '+ Quick Stock Item'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={addItemRow}
                  className="flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-xl transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{accountsOnly ? (isHindi ? '+ नई लाइन जोड़ें' : '+ Add Particular Row') : (isHindi ? '+ नया आइटम जोड़ें' : '+ Add Item Line')}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">{accountsOnly ? (isHindi ? 'सेवा / खर्च विवरण (Particulars)' : 'Expense / Service Particulars') : 'Item Master'}</th>
                    {gstActive && <th className="p-3 w-20">HSN/SAC</th>}
                    {!accountsOnly && (batchGodownActive || items.some(i => i.batchNumber || i.expiryDate)) && (
                      <th className="p-3 min-w-[190px]">{isHindi ? 'बैच / एक्सपायरी / MRP' : 'Batch / Expiry / MRP'}</th>
                    )}
                    <th className="p-3 w-20">Qty</th>
                    <th className="p-3 w-28">Purchase Rate ({currency})</th>
                    {gstActive && <th className="p-3 w-20">Tax %</th>}
                    {showCess && <th className="p-3 w-20 text-amber-300">Cess %</th>}
                    {gstActive && <th className="p-3 w-28">Tax Amt</th>}
                    <th className="p-3 w-32 text-right">Total ({currency})</th>
                    <th className="p-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                  {items.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td className="p-2 min-w-[200px]">
                        {accountsOnly ? (
                          <input
                            type="text"
                            value={item.itemName}
                            onChange={(e) => updateItemRow(idx, 'itemName', e.target.value)}
                            placeholder={isHindi ? 'खर्च / सेवा का विवरण लिखें...' : 'Enter expense / service description...'}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white font-medium focus:border-amber-500 focus:outline-none"
                          />
                        ) : (
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
                            onAddNewItem={() => setShowQuickItemModal(true)}
                          />
                        )}
                      </td>
                      {gstActive && (
                        <td className="p-2">
                          <input
                            type="text"
                            value={item.hsnSacCode}
                            onChange={(e) => updateItemRow(idx, 'hsnSacCode', e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-slate-300 font-mono"
                          />
                        </td>
                      )}
                      {!accountsOnly && (batchGodownActive || items.some(i => i.batchNumber || i.expiryDate)) && (
                        <td className="p-2">
                          <div className="grid grid-cols-3 gap-1">
                            <input
                              type="text"
                              value={item.batchNumber || ''}
                              onChange={(e) => updateItemRow(idx, 'batchNumber', e.target.value)}
                              placeholder="Batch #"
                              className="bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[11px] text-indigo-300 font-mono"
                              title="Batch / Lot Number"
                            />
                            <input
                              type="date"
                              value={item.expiryDate || ''}
                              onChange={(e) => updateItemRow(idx, 'expiryDate', e.target.value)}
                              className="bg-slate-900 border border-slate-700 rounded-lg px-1 py-1.5 text-[10px] text-rose-300 font-mono"
                              title="Expiry Date"
                            />
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.mrp ?? ''}
                              onChange={(e) => updateItemRow(idx, 'mrp', e.target.value === '' ? undefined : Number(e.target.value))}
                              placeholder="MRP"
                              className="bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 text-[11px] text-cyan-300 font-mono text-right"
                              title="MRP"
                            />
                          </div>
                        </td>
                      )}
                      <td className="p-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItemRow(idx, 'quantity', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-white font-bold"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          value={item.rate || ''}
                          placeholder="0"
                          onChange={(e) => updateItemRow(idx, 'rate', Number(e.target.value))}
                          className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-right text-amber-300 font-mono font-bold"
                        />
                      </td>
                      {gstActive && (
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            value={item.taxRate}
                            onChange={(e) => updateItemRow(idx, 'taxRate', Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-slate-300"
                          />
                        </td>
                      )}
                      {showCess && (
                        <td className="p-2">
                          <input
                            type="number"
                            min={0}
                            step="0.5"
                            value={item.cessPercent ?? ''}
                            placeholder="0"
                            onChange={(e) => updateItemRow(idx, 'cessPercent', Number(e.target.value) || 0)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-amber-300 font-mono"
                          />
                        </td>
                      )}
                      {gstActive && (
                        <td className="p-2 text-slate-300 font-mono text-right">
                          {formatCurrency(item.taxAmount, currency)}
                        </td>
                      )}
                      <td className="p-2 text-right font-mono font-bold text-emerald-400">
                        {formatCurrency(item.totalAmount, currency)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItemRow(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition"
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

          {/* Payment & Grand Total Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="space-y-3 bg-slate-800/40 p-4 rounded-xl border border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'भुगतान माध्यम (Payment Mode)' : 'Payment Mode'}
                  </label>
                  <select
                    value={paymentMode}
                    onChange={(e) => {
                      const nextMode = e.target.value;
                      setPaymentMode(nextMode);
                      if (nextMode === 'CREDIT') {
                        setPaymentAccountId('');
                        setAmountPaid(0);
                      } else if (nextMode === 'CASH') {
                        const existingCash = cashLedgers.find(a => a.id === paymentAccountId);
                        setPaymentAccountId(existingCash?.id || cashLedgers[0]?.id || 'acc_cash');
                        if (amountPaid === 0 && grandTotal > 0) setAmountPaid(grandTotal);
                      } else {
                        const existingBank = bankLedgers.find(a => a.id === paymentAccountId);
                        setPaymentAccountId(existingBank?.id || bankLedgers[0]?.id || 'acc_bank');
                        if (amountPaid === 0 && grandTotal > 0) setAmountPaid(grandTotal);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-semibold"
                  >
                    <option value="CREDIT">{isHindi ? 'उधार / क्रेडिट (Sundry Creditors)' : 'Credit / Unpaid (Creditors)'}</option>
                    <option value="CASH">{isHindi ? 'नकद (Cash)' : 'Cash'}</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">{isHindi ? 'कार्ड (Card)' : 'Card'}</option>
                    <option value="BANK_TRANSFER">{isHindi ? 'बैंक ट्रांसफर (NEFT/RTGS)' : 'Bank Transfer (NEFT/IMPS)'}</option>
                    <option value="CHEQUE">{isHindi ? 'चेक (Cheque)' : 'Cheque'}</option>
                  </select>
                </div>

                {(paymentMode !== 'CREDIT' || amountPaid > 0) && (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isHindi ? 'भुगतान खाता (Paid From Ledger)' : 'Paid From (Cash / Bank)'}
                    </label>
                    <select
                      value={paymentAccountId}
                      onChange={(e) => setPaymentAccountId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-amber-300 font-semibold"
                    >
                      {(paymentMode === 'CASH'
                        ? (cashLedgers.length > 0 ? cashLedgers : [{ id: 'acc_cash', name: 'Cash in Hand', code: '1010' } as any])
                        : (bankLedgers.length > 0 ? bankLedgers : [{ id: 'acc_bank', name: 'Bank Account', code: '1020' } as any])
                      ).map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.code})
                        </option>
                      ))}
                      {cashLedgers.length > 0 && bankLedgers.length > 0 && (
                        <optgroup label={isHindi ? 'अन्य नकद / बैंक खाते' : 'All Cash & Bank Ledgers'}>
                          {[...cashLedgers, ...bankLedgers].map(acc => (
                            <option key={`all_${acc.id}`} value={acc.id}>
                              {acc.name} ({acc.code})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-300 font-semibold">Amount Paid to Vendor ({currency})</label>
                  {grandTotal > 0 && amountPaid < grandTotal && (
                    <button
                      type="button"
                      onClick={() => {
                        setAmountPaid(grandTotal);
                        if (paymentMode === 'CREDIT') {
                          setPaymentMode('CASH');
                          setPaymentAccountId(cashLedgers[0]?.id || 'acc_cash');
                        }
                      }}
                      className="text-[11px] font-bold text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-lg"
                    >
                      {isHindi ? 'पूर्ण भुगतान (Full Paid)' : 'Mark Full Paid'}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amountPaid || ''}
                  onChange={(e) => {
                    const val = Math.max(0, Number(e.target.value) || 0);
                    setAmountPaid(val);
                    if (val > 0 && paymentMode === 'CREDIT') {
                      setPaymentMode('CASH');
                      setPaymentAccountId(cashLedgers[0]?.id || 'acc_cash');
                    }
                  }}
                  placeholder="0.00"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Purchase Notes / Remarks</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional terms or goods receiving notes..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2 text-slate-200"
                />
              </div>
            </div>

            {/* Total Summary Breakdown */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal (Net Cost):</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>

              {gstActive && (
                isInterState ? (
                  <div className="flex justify-between text-slate-400">
                    <span>IGST:</span>
                    <span>{formatCurrency(igstAmount, currency)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>CGST:</span>
                      <span>{formatCurrency(cgstAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>SGST:</span>
                      <span>{formatCurrency(sgstAmount, currency)}</span>
                    </div>
                  </>
                )
              )}

              {(showCess || totalCess > 0) && (
                <div className="flex justify-between text-amber-300">
                  <span>Cess Total:</span>
                  <span>{formatCurrency(totalCess, currency)}</span>
                </div>
              )}

              {/* Round Off Line */}
              <div className="flex items-center justify-between text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span>Round Off:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const rounded = Math.round(baseTotal);
                      const diff = Math.round((rounded - baseTotal) * 100) / 100;
                      setRoundOff(diff);
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-sans"
                  >
                    (Auto)
                  </button>
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">{currencySymbol}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={roundOff}
                    onChange={(e) => setRoundOff(parseFloat(e.target.value) || 0)}
                    className="w-20 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded px-1.5 py-0.5 text-right text-xs font-mono text-indigo-300"
                  />
                </div>
              </div>

              <div className="border-t border-slate-800 pt-2 flex justify-between text-base font-bold text-amber-400">
                <span>Grand Total:</span>
                <span>{formatCurrency(grandTotal, currency)}</span>
              </div>

              <div className="flex justify-between text-xs text-rose-400 pt-1">
                <span>Balance Payable:</span>
                <span>{formatCurrency(Math.max(0, grandTotal - amountPaid), currency)}</span>
              </div>
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 flex items-center gap-2 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isHindi ? 'परचेज बिल सेव करें' : 'Save Purchase Bill'}</span>
            </button>
          </div>
        </form>

        {/* Quick Add Party Nested Modal */}
        {showQuickPartyModal && (
          <QuickAddPartyModal
            isHindi={isHindi}
            initialType="VENDOR"
            onSave={handleQuickPartySaved}
            onClose={() => setShowQuickPartyModal(false)}
          />
        )}

        {/* Quick Add Stock Item Nested Modal */}
        {showQuickItemModal && (
          <QuickAddStockItemModal
            isHindi={isHindi}
            currency={currency}
            gstEnabled={gstActive}
            cessEnabled={showCess}
            onSave={handleQuickItemSaved}
            onClose={() => setShowQuickItemModal(false)}
          />
        )}
      </div>
    </div>
  );
};
