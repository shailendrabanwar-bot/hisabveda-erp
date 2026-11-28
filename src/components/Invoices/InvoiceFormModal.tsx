import React, { useState } from 'react';
import { X, Plus, Trash2, Calculator, Receipt, UserPlus, Building2, Calendar, Truck, ChevronDown, ChevronUp, PackagePlus, AlertCircle, Warehouse } from 'lucide-react';
import { AppData, SalesInvoice, InvoiceItem, PartyMaster, ItemMaster, InvoiceType, InvoiceStatus } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  generateNextNumber,
  calculatePartyOutstanding,
  isDateLockedByBooksLock,
  getCashLedgers,
  getBankLedgers,
  isBankPaymentMode
} from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { INDIAN_STATE_CODES } from '../../utils/gstin';
import { getFinancialYearRange, isDateInFinancialYear, isOptionalGstinValid } from '../../utils/fiscalYear';
import {
  ensureGodowns,
  resolveDefaultGodownId,
  getSortedItemBatchesFefo,
  getItemStockInGodown,
  getExpiryStatus,
} from '../../utils/inventoryBatches';
import { QuickAddPartyModal } from '../Common/QuickAddPartyModal';
import { QuickAddStockItemModal } from '../Common/QuickAddStockItemModal';
import { SearchableItemSelect } from '../Common/SearchableItemSelect';
import { SearchablePartySelect } from '../Common/SearchablePartySelect';
import { resolveCompanyTaxProfile } from '../../utils/companyProfile';
import { resolveIsInterStateSupply } from '../../utils/gstAuditEngine';
import {
  PriceTier,
  computeDueDateFromCreditDays,
  evaluatePartyCreditAndOverdue,
  evaluateCartNegativeStock,
  getItemPriceForTier,
  resolveNegativeStockPolicy,
} from '../../utils/erpSmartHelpers';

interface InvoiceFormModalProps {
  data: AppData;
  isHindi: boolean;
  onSaveInvoice: (inv: SalesInvoice) => void;
  onClose: () => void;
  editingInvoice?: SalesInvoice | null;
  onAddParty?: (party: PartyMaster) => void;
  onAddItem?: (item: ItemMaster) => void;
}

export const InvoiceFormModal: React.FC<InvoiceFormModalProps> = ({
  data,
  isHindi,
  onSaveInvoice,
  onClose,
  editingInvoice,
  onAddParty,
  onAddItem
}) => {
  const currency = data.company.currency;
  const taxProfile = resolveCompanyTaxProfile(data.company);
  const forceZeroTaxByCompany = !taxProfile.shouldChargeGstOnSales;
  const companyState = data.company.state;
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  const nextInvNo = editingInvoice ? editingInvoice.invoiceNumber : generateNextNumber('INV', data.invoices);

  const customerParties = data.parties.filter(p => p.type !== 'VENDOR');
  const initialPartyId = editingInvoice ? editingInvoice.partyId : '';

  const [invoiceNumber, setInvoiceNumber] = useState(nextInvNo);
  const [date, setDate] = useState(editingInvoice ? editingInvoice.date : defaultActiveDate);
  const [dueDate, setDueDate] = useState(() => {
    if (editingInvoice) return editingInvoice.dueDate;
    const d = new Date(defaultActiveDate);
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [invoiceType, setInvoiceType] = useState<InvoiceType>(
    editingInvoice ? (editingInvoice.invoiceType || 'TAX_INVOICE') : (forceZeroTaxByCompany ? 'RETAIL_BILL' : 'TAX_INVOICE')
  );
  const godowns = ensureGodowns(data.godowns);
  const [godownId, setGodownId] = useState<string>(() => editingInvoice?.godownId || resolveDefaultGodownId(godowns));
  const [partyId, setPartyId] = useState(initialPartyId);
  const [notes, setNotes] = useState(editingInvoice ? (editingInvoice.notes || '') : '');
  const [amountPaid, setAmountPaid] = useState(editingInvoice ? editingInvoice.amountPaid : 0);
  const [showAdvanceOnInvoice, setShowAdvanceOnInvoice] = useState<boolean>(() =>
    editingInvoice ? Boolean(editingInvoice.showAdvanceOnInvoice ?? ((editingInvoice.amountPaid || 0) > 0)) : false
  );
  const [advanceNote, setAdvanceNote] = useState<string>(() => editingInvoice?.advanceNote || '');
  const [advanceToggleManual, setAdvanceToggleManual] = useState<boolean>(false);
  const [status, setStatus] = useState<InvoiceStatus>(editingInvoice ? editingInvoice.status : 'UNPAID');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmNegativeStock, setConfirmNegativeStock] = useState(false);
  const [confirmCreditOverride, setConfirmCreditOverride] = useState(false);
  const [priceTier, setPriceTier] = useState<PriceTier>('RETAIL');
  const [dueDateManuallyEdited, setDueDateManuallyEdited] = useState<boolean>(Boolean(editingInvoice));

  const appConfig = loadAppConfig();
  const negativeStockPolicy = resolveNegativeStockPolicy(data.company, appConfig);
  const accountsOnly = Boolean(appConfig.accountingWithoutInventory);
  const batchGodownActive = taxProfile.batchGodownEnabled || Boolean(appConfig.maintainBatches);
  const showCessCol = taxProfile.isRegularGst && taxProfile.cessEnabled && !forceZeroTaxByCompany && invoiceType !== 'NIL_RATED' && invoiceType !== 'EXEMPT';
  const cashLedgers = getCashLedgers(data);
  const bankLedgers = getBankLedgers(data);

  const [paymentMode, setPaymentMode] = useState<string>(() => {
    if (editingInvoice?.paymentMode) return editingInvoice.paymentMode;
    if ((editingInvoice?.amountPaid || 0) > 0) {
      return isBankPaymentMode(editingInvoice?.advanceNote) ? 'BANK_TRANSFER' : 'CASH';
    }
    return 'CREDIT';
  });
  const [paymentAccountId, setPaymentAccountId] = useState<string>(() => {
    if (editingInvoice?.paymentAccountId) return editingInvoice.paymentAccountId;
    const initMode = editingInvoice?.paymentMode || ((editingInvoice?.amountPaid || 0) > 0 ? (isBankPaymentMode(editingInvoice?.advanceNote) ? 'BANK_TRANSFER' : 'CASH') : 'CREDIT');
    if (initMode === 'CREDIT') return '';
    if (isBankPaymentMode(initMode)) return bankLedgers[0]?.id || 'acc_bank';
    return cashLedgers[0]?.id || 'acc_cash';
  });

  const selectedParty = partyId ? data.parties.find(p => p.id === partyId) : undefined;
  const selectedGodown = godowns.find(g => g.id === godownId) || godowns[0];

  // Shipping & Dispatch / Consignee Details State
  const [sameAsBilling, setSameAsBilling] = useState(() => {
    if (editingInvoice && editingInvoice.shippingName) {
      return editingInvoice.shippingName === editingInvoice.partyName;
    }
    return true;
  });
  const [shippingName, setShippingName] = useState(editingInvoice?.shippingName || selectedParty?.name || '');
  const [shippingGstin, setShippingGstin] = useState(editingInvoice?.shippingGstin || selectedParty?.gstin || '');
  const [shippingAddress, setShippingAddress] = useState(editingInvoice?.shippingAddress || selectedParty?.address || '');
  const [shippingState, setShippingState] = useState(editingInvoice?.shippingState || selectedParty?.state || '');

  const handlePartySelect = (newId: string) => {
    setPartyId(newId);
    setConfirmCreditOverride(false);
    const p = data.parties.find(x => x.id === newId);
    if (p) {
      if (!dueDateManuallyEdited) {
        setDueDate(computeDueDateFromCreditDays(date, p.creditDays, 15));
      }
      if (sameAsBilling) {
        setShippingName(p.name);
        setShippingGstin(p.gstin || '');
        setShippingAddress(p.address || '');
        setShippingState(p.state || '');
      }
    }
  };
  const [deliveryNoteNo, setDeliveryNoteNo] = useState(editingInvoice?.deliveryNoteNo || '');
  const [deliveryNoteDate, setDeliveryNoteDate] = useState(editingInvoice?.deliveryNoteDate || '');
  const [orderReferenceNo, setOrderReferenceNo] = useState(editingInvoice?.orderReferenceNo || '');
  const [orderDate, setOrderDate] = useState(editingInvoice?.orderDate || '');
  const [shippedVia, setShippedVia] = useState(editingInvoice?.shippedVia || '');
  const [termsOfDelivery, setTermsOfDelivery] = useState(editingInvoice?.termsOfDelivery || '');
  const [showShippingDetails, setShowShippingDetails] = useState(!!(editingInvoice && (editingInvoice.shippingAddress || editingInvoice.deliveryNoteNo)));

  // Quick Add Modal States
  const [showQuickPartyModal, setShowQuickPartyModal] = useState(false);
  const [showQuickItemModal, setShowQuickItemModal] = useState(false);

  const handleQuickPartySaved = (newParty: PartyMaster) => {
    if (onAddParty) {
      onAddParty(newParty);
    }
    setPartyId(newParty.id);
    setConfirmCreditOverride(false);
    if (!dueDateManuallyEdited) {
      setDueDate(computeDueDateFromCreditDays(date, newParty.creditDays, 15));
    }
    if (sameAsBilling) {
      setShippingName(newParty.name);
      setShippingGstin(newParty.gstin || '');
      setShippingAddress(newParty.address || '');
      setShippingState(newParty.state || '');
    }
  };

  const handleQuickItemSaved = (newItem: ItemMaster) => {
    if (onAddItem) {
      onAddItem(newItem);
    }
    const rate = getItemPriceForTier(newItem, priceTier);
    const tRate = forceZeroTaxByCompany ? 0 : (newItem.taxRate || newItem.gstRate || 0);
    const cRate = showCessCol ? (newItem.cessRate || 0) : 0;
    const lineSubtotal = 1 * rate;
    const tax = (lineSubtotal * tRate) / 100;
    const cess = (lineSubtotal * cRate) / 100;
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
      taxAmount: tax,
      cessPercent: cRate,
      cessAmount: cess,
      totalAmount: lineSubtotal + tax + cess
    };
    setItems(prev => [...prev, itemToAdd]);
  };

  // Line items state
  const [items, setItems] = useState<InvoiceItem[]>(() => {
    if (editingInvoice && editingInvoice.items && editingInvoice.items.length > 0) {
      return editingInvoice.items;
    }
    return [
      {
        id: 'item_line_1',
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


  // Determine inter-state using Company & Party GSTIN state codes, Place of Supply, and normalized state names
  const isInterState = selectedParty
    ? resolveIsInterStateSupply({
        companyGstin: data.company.gstin,
        companyState,
        companyStateCode: data.company.stateCode,
        partyGstin: selectedParty.gstin,
        partyState: selectedParty.state,
        partyStateCode: selectedParty.stateCode,
        placeOfSupply: editingInvoice?.placeOfSupply,
      })
    : false;

  const handlePriceTierChange = (nextTier: PriceTier) => {
    setPriceTier(nextTier);
    setItems(prev => prev.map(line => {
      if (!line.itemId) return line;
      const master = data.items.find(i => i.id === line.itemId);
      if (!master) return line;
      const matchedBatch = line.batchId
        ? (data.itemBatches || []).find(b => b.id === line.batchId)
        : undefined;
      const nextRate = getItemPriceForTier(master, nextTier, matchedBatch);
      const qty = Number(line.quantity) || 0;
      const disc = Number(line.discountPercent) || 0;
      const taxRate = forceZeroTaxByCompany ? 0 : (Number(line.taxRate) || 0);
      const cessPercent = showCessCol ? (Number(line.cessPercent) || 0) : 0;
      const sub = qty * nextRate * (1 - disc / 100);
      const taxAmount = (sub * taxRate) / 100;
      const cessAmount = (sub * cessPercent) / 100;
      return {
        ...line,
        rate: nextRate,
        taxAmount,
        cessAmount,
        totalAmount: sub + taxAmount + cessAmount,
      };
    }));
  };

  const handleItemSelect = (lineId: string, itemId: string) => {
    const master = data.items.find(i => i.id === itemId);
    if (!master) return;

    const fefoBatches = getSortedItemBatchesFefo(data.itemBatches || [], master.id, godownId, { includeExpired: false });
    const firstBatch = fefoBatches[0];

    setItems(prev => prev.map(line => {
      if (line.id !== lineId) return line;
      const qty = line.quantity;
      const rate = getItemPriceForTier(master, priceTier, firstBatch);
      const taxRate = forceZeroTaxByCompany ? 0 : (master.taxRate || 0);
      const cessPercent = showCessCol ? (master.cessRate || 0) : 0;
      const sub = qty * rate * (1 - line.discountPercent / 100);
      const taxAmount = (sub * taxRate) / 100;
      const cessAmount = (sub * cessPercent) / 100;
      const totalAmount = sub + taxAmount + cessAmount;

      return {
        ...line,
        itemId: master.id,
        itemName: master.name,
        hsnSacCode: master.hsnSacCode,
        unit: master.unit,
        rate,
        taxRate,
        taxAmount,
        cessPercent,
        cessAmount,
        totalAmount,
        godownId,
        batchId: firstBatch?.id,
        batchNumber: firstBatch?.batchNumber,
        expiryDate: firstBatch?.expiryDate,
        mrp: firstBatch?.mrp ?? master.mrp,
        barcode: firstBatch?.barcode ?? master.barcode,
      };
    }));
  };

  const handleBatchSelect = (lineId: string, batchId: string) => {
    const batch = (data.itemBatches || []).find(b => b.id === batchId);
    setItems(prev => prev.map(line => {
      if (line.id !== lineId) return line;
      if (!batch) {
        return { ...line, batchId: undefined, batchNumber: undefined, expiryDate: undefined };
      }
      const rate = batch.salesRate || line.rate;
      const qty = Number(line.quantity) || 0;
      const disc = Number(line.discountPercent) || 0;
      const taxRate = Number(line.taxRate) || 0;
      const sub = qty * rate * (1 - disc / 100);
      const taxAmount = (sub * taxRate) / 100;
      return {
        ...line,
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        expiryDate: batch.expiryDate,
        mrp: batch.mrp ?? line.mrp,
        barcode: batch.barcode ?? line.barcode,
        rate,
        taxAmount,
        totalAmount: sub + taxAmount,
      };
    }));
  };

  const handleLineChange = (lineId: string, field: keyof InvoiceItem, value: any) => {
    setItems(prev => prev.map(line => {
      if (line.id !== lineId) return line;

      const updated = { ...line, [field]: value };

      const qty = Number(updated.quantity) || 0;
      const rate = Number(updated.rate) || 0;
      const disc = Number(updated.discountPercent) || 0;
      const taxRate = forceZeroTaxByCompany ? 0 : (Number(updated.taxRate) || 0);
      const cessPercent = showCessCol ? (Number(updated.cessPercent) || 0) : 0;

      const sub = qty * rate * (1 - disc / 100);
      const taxAmount = (sub * taxRate) / 100;
      const cessAmount = (sub * cessPercent) / 100;
      const totalAmount = sub + taxAmount + cessAmount;

      return {
        ...updated,
        taxRate,
        taxAmount,
        cessPercent,
        cessAmount,
        totalAmount
      };
    }));
  };

  const handleAddLine = () => {
    const newLine: InvoiceItem = {
      id: 'line_' + Date.now() + Math.random().toString(36).substring(2, 5),
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
    setItems(prev => [...prev, newLine]);
  };

  const handleRemoveLine = (lineId: string) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter(i => i.id !== lineId));
  };

  // Calculations (respect Non-GST, Composition, Nil Rated / Exempt 0% GST, Cess & Auto Round-Off)
  const isZeroTaxInvoice = forceZeroTaxByCompany || invoiceType === 'NIL_RATED' || invoiceType === 'EXEMPT';
  const subtotal = Math.round(items.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.rate)), 0) * 100) / 100;
  const totalDiscount = Math.round(items.reduce((acc, curr) => acc + (Number(curr.quantity) * Number(curr.rate) * (Number(curr.discountPercent) / 100)), 0) * 100) / 100;
  const totalTax = isZeroTaxInvoice
    ? 0
    : Math.round(items.reduce((acc, curr) => acc + (Number(curr.taxAmount) || 0), 0) * 100) / 100;
  const cessAmount = (isZeroTaxInvoice || !showCessCol)
    ? 0
    : Math.round(items.reduce((acc, curr) => acc + (Number(curr.cessAmount) || 0), 0) * 100) / 100;

  const cgstAmount = isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
  const sgstAmount = isInterState ? 0 : Math.round((totalTax - cgstAmount) * 100) / 100;
  const igstAmount = isInterState ? totalTax : 0;

  const rawTotal = Math.round(((subtotal - totalDiscount) + cgstAmount + sgstAmount + igstAmount + cessAmount) * 100) / 100;
  const grandTotal = appConfig.autoRoundOff
    ? Math.round(rawTotal)
    : rawTotal;
  const roundOff = Math.round((grandTotal - rawTotal) * 100) / 100;

  // Negative Stock Check (skipped cleanly in Accounting-Without-Inventory mode)
  const negativeStockWarnings = accountsOnly
    ? []
    : evaluateCartNegativeStock(items, data.items, godowns, godownId, editingInvoice);

  // Party Credit Limit & Overdue Bills Check
  const partyCreditEval = selectedParty
    ? evaluatePartyCreditAndOverdue(
        selectedParty,
        data,
        date,
        Math.max(0, grandTotal - (amountPaid || 0)),
        editingInvoice?.id,
        appConfig.showCreditLimitWarning ? appConfig.creditLimitAmount : 0
      )
    : null;
  const hasCreditAlert = Boolean(partyCreditEval && partyCreditEval.creditLimitExceeded);
  const hasOverdueAlert = Boolean(partyCreditEval && partyCreditEval.overdueInvoices.length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedParty) {
      setValidationError(isHindi ? 'कृपया ग्राहक पार्टी चुनें।' : 'Please select a customer party.');
      return;
    }
    if (!invoiceNumber.trim()) {
      setValidationError(isHindi ? 'इनवॉइस नंबर आवश्यक है।' : 'Invoice Number is required.');
      return;
    }
    const isDuplicate = data.invoices.some(
      i => i.id !== editingInvoice?.id && i.invoiceNumber.trim().toLowerCase() === invoiceNumber.trim().toLowerCase()
    );
    if (isDuplicate) {
      setValidationError(isHindi ? `इनवॉइस नंबर "${invoiceNumber}" पहले से मौजूद है।` : `Invoice Number "${invoiceNumber}" already exists.`);
      return;
    }
    if (!isDateInFinancialYear(date, fyRange.fyStart)) {
      setValidationError(
        isHindi
          ? `अमान्य इनवॉइस तिथि (${date}): सेल इनवॉइस सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) के भीतर होना चाहिए।`
          : `Out-of-FY Invoice Date (${date}): Sales Invoice must fall within active ${fyRange.label} (${fyRange.displayRange}).`
      );
      return;
    }
    if (isDateLockedByBooksLock(date, appConfig.booksLockDate)) {
      setValidationError(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${appConfig.booksLockDate} या उससे पहले की तिथि में इनवॉइस दर्ज/संपादित नहीं किया जा सकता।`
          : `Books Locked: Invoices dated on or before ${appConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }
    if (dueDate && dueDate < date) {
      setValidationError(isHindi ? 'नियत तिथि (Due Date) इनवॉइस तिथि से पहले की नहीं हो सकती।' : 'Payment Due Date cannot be earlier than Invoice Date.');
      return;
    }
    const partyGstinCheck = isOptionalGstinValid(selectedParty.gstin);
    if (!partyGstinCheck.valid) {
      setValidationError(isHindi ? (partyGstinCheck.errorHindi || 'ग्राहक GSTIN अमान्य है।') : (partyGstinCheck.error || 'Customer GSTIN is invalid.'));
      return;
    }
    if (!sameAsBilling) {
      const shipGstinCheck = isOptionalGstinValid(shippingGstin);
      if (!shipGstinCheck.valid) {
        setValidationError(isHindi ? (shipGstinCheck.errorHindi || 'शिपिंग GSTIN अमान्य है।') : (shipGstinCheck.error || 'Invalid Shipping GSTIN.'));
        return;
      }
    }
    if (items.length === 0 || items.some(it => !it.itemName.trim() || Number(it.quantity) <= 0 || Number(it.rate) < 0 || Number(it.discountPercent) < 0 || Number(it.discountPercent) > 100)) {
      setValidationError(isHindi ? 'सभी आइटम का नाम, मात्रा (> 0), दर (>= 0) और छूट (0-100%) सही होनी चाहिए।' : 'Every line item must have valid name, Quantity > 0, Rate >= 0, and Discount 0–100%.');
      return;
    }
    if (taxProfile.gstEnabled && !isZeroTaxInvoice && appConfig.hsnMandatory && items.some(it => (it.hsnSacCode || '').trim().length < 4)) {
      setValidationError(isHindi ? 'सेटिंग्स में HSN/SAC अनिवार्य है — प्रत्येक आइटम में कम से कम 4 अंकों का HSN/SAC कोड भरें।' : 'HSN/SAC code (min 4 digits) is mandatory per Settings.');
      return;
    }
    if (negativeStockPolicy === 'BLOCK' && negativeStockWarnings.length > 0) {
      const w = negativeStockWarnings[0];
      setValidationError(
        isHindi
          ? `स्टॉक अवरुद्ध (Blocked): "${w.name}" का केवल ${w.available} ${w.unit} उपलब्ध है (मांग: ${w.reqQty})। कम स्टॉक बिलिंग बंद (BLOCK) सेट है।`
          : `Stock Blocked: "${w.name}" only has ${w.available} ${w.unit} in stock (requested ${w.reqQty}). Negative stock billing is blocked.`
      );
      return;
    }
    if (negativeStockPolicy === 'WARN' && negativeStockWarnings.length > 0 && !confirmNegativeStock) {
      const w = negativeStockWarnings[0];
      setValidationError(
        isHindi
          ? `कम स्टॉक चेतावनी: "${w.name}" का स्टॉक केवल ${w.available} ${w.unit} उपलब्ध है (मांग: ${w.reqQty})। जारी रखने के लिए नीचे पुष्टि चेकबॉक्स चुनें।`
          : `Negative Stock Warning: "${w.name}" only has ${w.available} ${w.unit} in stock (requested ${w.reqQty}). Check the confirmation box below to proceed.`
      );
      return;
    }
    if ((hasCreditAlert || hasOverdueAlert) && !confirmCreditOverride) {
      if (hasCreditAlert && partyCreditEval) {
        setValidationError(
          isHindi
            ? `क्रेडिट सीमा चेतावनी: इस बिल के बाद ${selectedParty.name} का बकाया (${formatCurrency(partyCreditEval.projectedBalance, currency)}) क्रेडिट सीमा (${formatCurrency(partyCreditEval.creditLimit, currency)}) से अधिक हो जाएगा। पुष्टि चेकबॉक्स चुनें।`
            : `Credit Limit Exceeded: ${selectedParty.name} projected balance (${formatCurrency(partyCreditEval.projectedBalance, currency)}) exceeds limit (${formatCurrency(partyCreditEval.creditLimit, currency)}). Check override box below.`
        );
      } else if (hasOverdueAlert && partyCreditEval) {
        setValidationError(
          isHindi
            ? `बकाया अलर्ट: ${selectedParty.name} के ${partyCreditEval.overdueInvoices.length} बिल (${formatCurrency(partyCreditEval.totalOverdueAmount, currency)}) नियत तिथि से अधिक बकाया हैं। जारी रखने के लिए नीचे पुष्टि चेकबॉक्स चुनें।`
            : `Overdue Bills Alert: ${selectedParty.name} has ${partyCreditEval.overdueInvoices.length} overdue bill(s) totaling ${formatCurrency(partyCreditEval.totalOverdueAmount, currency)}. Check approval box below.`
        );
      }
      return;
    }
    if (grandTotal <= 0) {
      setValidationError(isHindi ? 'इनवॉइस की कुल देय राशि ₹0 से अधिक होनी चाहिए।' : 'Grand Total must be greater than zero.');
      return;
    }
    if (amountPaid < 0 || amountPaid > grandTotal) {
      setValidationError(isHindi ? 'प्राप्त राशि 0 से कम या कुल देय राशि से अधिक नहीं हो सकती।' : 'Advance received cannot be negative or exceed Grand Total.');
      return;
    }

    const baseSanitized = isZeroTaxInvoice
      ? items.map(it => {
          const lineSub = (Number(it.quantity) || 0) * (Number(it.rate) || 0) * (1 - (Number(it.discountPercent) || 0) / 100);
          return { ...it, godownId: it.godownId || godownId, taxRate: 0, taxAmount: 0, cessPercent: 0, cessAmount: 0, totalAmount: Math.round(lineSub * 100) / 100 };
        })
      : items.map(it => ({
          ...it,
          godownId: it.godownId || godownId,
          cessPercent: showCessCol ? (Number(it.cessPercent) || 0) : 0,
          cessAmount: showCessCol ? (Number(it.cessAmount) || 0) : 0,
        }));

    const finalPaymentMode = amountPaid > 0
      ? (paymentMode && paymentMode !== 'CREDIT' ? paymentMode : 'CASH')
      : 'CREDIT';
    const finalPaymentAccountId = amountPaid > 0
      ? (paymentAccountId || (isBankPaymentMode(finalPaymentMode) ? (bankLedgers[0]?.id || 'acc_bank') : (cashLedgers[0]?.id || 'acc_cash')))
      : undefined;

    const newInvoice: SalesInvoice = {
      id: editingInvoice ? editingInvoice.id : 'inv_' + Date.now(),
      invoiceNumber: invoiceNumber.trim(),
      date,
      dueDate,
      invoiceType,
      godownId,
      godownName: selectedGodown?.name || 'Main Godown',
      partyId: selectedParty.id,
      partyName: selectedParty.name,
      partyGstin: selectedParty.gstin || 'URP',
      partyGstCategory: selectedParty.gstCategory || ((!selectedParty.gstin || selectedParty.gstin === 'URP') ? 'UNREGISTERED' : 'REGULAR'),
      partyAddress: selectedParty.address,
      partyState: selectedParty.state,
      placeOfSupply: selectedParty.state,
      isInterState,
      items: baseSanitized,
      subtotal,
      totalDiscount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessAmount,
      totalTax,
      roundOff,
      registrationTypeAtSupply: taxProfile.gstRegistrationType,
      grandTotal,
      amountPaid,
      paymentMode: finalPaymentMode,
      paymentAccountId: finalPaymentAccountId,
      paymentBreakdown: undefined,
      showAdvanceOnInvoice,
      advanceNote: advanceNote.trim() || undefined,
      status: amountPaid >= grandTotal ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : status,
      notes,
      isRecurring: false,
      frequency: 'NONE',
      // Shipping & Dispatch details
      shippingName: sameAsBilling ? selectedParty.name : (shippingName || selectedParty.name),
      shippingGstin: sameAsBilling ? selectedParty.gstin : (shippingGstin || selectedParty.gstin),
      shippingAddress: sameAsBilling ? selectedParty.address : (shippingAddress || selectedParty.address),
      shippingState: sameAsBilling ? selectedParty.state : (shippingState || selectedParty.state),
      deliveryNoteNo,
      deliveryNoteDate,
      orderReferenceNo,
      orderDate,
      shippedVia,
      termsOfDelivery
    };

    onSaveInvoice(newInvoice);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-[var(--text-primary)]">
        {/* Top Bar */}
        <div className="p-4 hv-elevated border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {editingInvoice
                ? (isHindi ? 'सेल इनवॉइस अपडेट करें (Edit Invoice)' : `Edit Sales Invoice #${editingInvoice.invoiceNumber}`)
                : (isHindi ? 'नया जीएसटी सेल इनवॉइस बनाएँ' : 'Create New Sales Invoice')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] rounded-lg hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 text-xs">
          {validationError && (
            <div className="p-3 hv-pill-rose border rounded-xl font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="opacity-80 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Section 1: Customer & Basic Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 hv-elevated p-4 rounded-xl border border-[var(--border-primary)]">
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-[var(--text-secondary)] font-semibold">
                  {isHindi ? 'ग्राहक / पार्टी चुनें' : 'Select Customer Party *'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowQuickPartyModal(true)}
                  className="text-[11px] hv-pill-indigo border font-bold flex items-center gap-1 px-2 py-0.5 rounded-lg transition"
                  title={isHindi ? 'नया ग्राहक त्वरित जोड़ें' : '+ Add New Customer Party'}
                >
                  <UserPlus className="w-3 h-3" />
                  <span>{isHindi ? '+ नया ग्राहक (Party)' : '+ Quick Party'}</span>
                </button>
              </div>
              <SearchablePartySelect
                parties={customerParties}
                selectedPartyId={partyId}
                onSelectParty={handlePartySelect}
                isHindi={isHindi}
                onAddNewParty={() => setShowQuickPartyModal(true)}
                placeholder={isHindi ? '🔍 ग्राहक खोजें या चुनें...' : '🔍 Search or select customer party...'}
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'इनवॉइस नंबर' : 'Invoice Number'}
              </label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-indigo-500 focus:outline-none font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'बिल / इनवॉइस प्रकार' : 'Document / Invoice Type'}
              </label>
              <select
                value={invoiceType}
                onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-indigo-500 focus:outline-none"
              >
                {!forceZeroTaxByCompany && <option value="TAX_INVOICE">Tax Invoice (B2B/B2C)</option>}
                <option value="RETAIL_BILL">{forceZeroTaxByCompany ? 'Bill of Supply / Retail Invoice' : 'Retail Bill of Supply'}</option>
                <option value="PROFORMA">Proforma Invoice</option>
                {!forceZeroTaxByCompany && <option value="EXPORT">Export / SEZ Invoice</option>}
                {!forceZeroTaxByCompany && <option value="NIL_RATED">Nil Rated Supply (0% GST)</option>}
                {!forceZeroTaxByCompany && <option value="EXEMPT">Exempt Supply (0% GST)</option>}
              </select>
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'इनवॉइस तिथि' : 'Invoice Date'}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  const nextDate = e.target.value;
                  setDate(nextDate);
                  if (!dueDateManuallyEdited && nextDate) {
                    setDueDate(computeDueDateFromCreditDays(nextDate, selectedParty?.creditDays, 15));
                  }
                }}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[var(--text-secondary)] font-semibold">
                  {isHindi ? 'भुगतान नियत तिथि' : 'Payment Due Date'}
                </label>
                {selectedParty?.creditDays !== undefined && selectedParty.creditDays > 0 && (
                  <span className="text-[10px] font-bold hv-pill-indigo border px-1.5 py-0.5 rounded">
                    {selectedParty.creditDays}d terms
                  </span>
                )}
              </div>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => {
                  setDueDateManuallyEdited(true);
                  setDueDate(e.target.value);
                }}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-indigo-500 focus:outline-none"
              />
            </div>

            {accountsOnly ? (
              <div className="flex flex-col justify-end">
                <div className="p-2.5 rounded-xl text-xs font-bold flex items-center justify-between border hv-pill-amber">
                  <span>{isHindi ? 'मोड:' : 'Mode:'}</span>
                  <span>{isHindi ? 'केवल अकाउंटिंग (No Stock)' : 'Accounts-Only (No Stock)'}</span>
                </div>
              </div>
            ) : (batchGodownActive || godowns.length > 1) ? (
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'स्रोत गोदाम (Dispatch Godown)' : 'Source Godown *'}
                </label>
                <select
                  value={godownId}
                  onChange={(e) => setGodownId(e.target.value)}
                  className="w-full hv-input text-cyan-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-cyan-500 focus:outline-none"
                >
                  {godowns.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="md:col-span-2 flex flex-col justify-end">
              {forceZeroTaxByCompany ? (
                <div className="p-2 rounded-xl text-xs font-semibold flex items-center justify-between border hv-pill-amber">
                  <span>{taxProfile.isComposition ? 'Composition Dealer Mode:' : 'Non-GST / Unregistered Mode:'}</span>
                  <span>
                    {taxProfile.isComposition
                      ? 'Bill of Supply (0% Tax Collected from Buyer)'
                      : 'Bill of Supply (No GST Columns)'}
                  </span>
                </div>
              ) : (
                <div className={`p-2 rounded-xl text-xs font-semibold flex items-center justify-between border ${
                  isInterState ? 'hv-pill-amber' : 'hv-pill-emerald'
                }`}>
                  <span>Tax Class:</span>
                  <span>{isInterState ? 'IGST (Inter-state)' : 'CGST + SGST (Intra-state)'}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Customer Credit Limit & Overdue Bills Alert Banner */}
          {selectedParty && partyCreditEval && (hasCreditAlert || hasOverdueAlert) && (
            <div className="hv-pill-amber border rounded-xl px-4 py-3 text-xs space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    {isHindi
                      ? `${selectedParty.name} — क्रेडिट एवं बकाया चेतावनी`
                      : `${selectedParty.name} — Credit Limit & Overdue Alert`}
                  </span>
                </span>
                <span className="font-mono text-[11px]">
                  {isHindi ? 'वर्तमान बकाया:' : 'Current Outstanding:'}{' '}
                  <strong>{formatCurrency(partyCreditEval.outstandingBalance, currency)}</strong>
                  {partyCreditEval.creditLimit > 0 && ` / Limit: ${formatCurrency(partyCreditEval.creditLimit, currency)}`}
                </span>
              </div>

              {hasCreditAlert && (
                <p className="text-rose-500 font-semibold">
                  {isHindi
                    ? `• इस इनवॉइस के बाद अनुमानित बकाया ${formatCurrency(partyCreditEval.projectedBalance, currency)} सीमा से ${formatCurrency(partyCreditEval.excessAmount, currency)} अधिक हो जाएगा।`
                    : `• Projected balance (${formatCurrency(partyCreditEval.projectedBalance, currency)}) exceeds credit limit by ${formatCurrency(partyCreditEval.excessAmount, currency)}.`}
                </p>
              )}

              {hasOverdueAlert && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold">
                    {isHindi
                      ? `• ${partyCreditEval.overdueInvoices.length} बकाया बिल (Overdue ${formatCurrency(partyCreditEval.totalOverdueAmount, currency)}):`
                      : `• ${partyCreditEval.overdueInvoices.length} Overdue Bill(s) (${formatCurrency(partyCreditEval.totalOverdueAmount, currency)}):`}
                  </span>
                  {partyCreditEval.overdueInvoices.slice(0, 3).map(ov => (
                    <span
                      key={ov.id}
                      className="font-mono text-[10px] hv-pill-rose border px-2 py-0.5 rounded"
                    >
                      {ov.invoiceNumber} ({ov.daysOverdue}d • {formatCurrency(ov.balanceDue, currency)})
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 1.5: Shipping / Consignee & Dispatch Details (GST Compliance Format) */}
          <div className="hv-elevated rounded-xl border border-[var(--border-primary)] overflow-hidden">
            <button
              type="button"
              onClick={() => setShowShippingDetails(!showShippingDetails)}
              className="w-full px-4 py-3 flex items-center justify-between text-left font-bold text-[var(--text-primary)] hover:bg-[var(--hover-surface)] transition"
            >
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-cyan-500" />
                <span>{isHindi ? '🚚 शिपिंग एवं डिलीवरी विवरण (Consignee / Shipping & Dispatch Details)' : '🚚 Shipping, Consignee & Dispatch Details'}</span>
                {(!sameAsBilling || deliveryNoteNo) && (
                  <span className="hv-pill-cyan border text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {isHindi ? 'कस्टम शिपिंग लागू' : 'Custom Shipping Set'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
                <span>{showShippingDetails ? (isHindi ? 'छिपाएं' : 'Hide') : (isHindi ? 'देखें / संपादित करें' : 'Expand')}</span>
                {showShippingDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>

            {showShippingDetails && (
              <div className="p-4 border-t border-[var(--border-primary)] space-y-4 hv-surface text-xs">
                <div className="flex items-center justify-between hv-elevated p-2.5 rounded-xl border border-[var(--border-primary)]">
                  <span className="font-semibold text-[var(--text-secondary)]">
                    {isHindi ? 'क्या शिपिंग पता बिलिंग पते के समान है?' : 'Same as Billed To (Customer Details)?'}
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-500">
                    <input
                      type="checkbox"
                      checked={sameAsBilling}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSameAsBilling(checked);
                        if (checked && selectedParty) {
                          setShippingName(selectedParty.name);
                          setShippingGstin(selectedParty.gstin);
                          setShippingAddress(selectedParty.address);
                          setShippingState(selectedParty.state);
                        }
                      }}
                      className="w-4 h-4 rounded border-[var(--border-subtle)] text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>{isHindi ? 'हाँ, बिलिंग पता ही शिपिंग पता है' : 'Yes, same as Billed To'}</span>
                  </label>
                </div>

                {!sameAsBilling && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 hv-elevated rounded-xl border border-[var(--border-subtle)]">
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                        {isHindi ? 'प्राप्तकर्ता / शिपिंग नाम (Consignee Name)' : 'Consignee / Ship-To Name'}
                      </label>
                      <input
                        type="text"
                        value={shippingName}
                        onChange={(e) => setShippingName(e.target.value)}
                        placeholder="e.g. Regional Branch / Warehouse Site"
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                        {isHindi ? 'शिपिंग GSTIN' : 'Consignee GSTIN'}
                      </label>
                      <input
                        type="text"
                        value={shippingGstin}
                        onChange={(e) => setShippingGstin(e.target.value.toUpperCase())}
                        placeholder="15-digit GSTIN"
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                        {isHindi ? 'शिपिंग का पूरा पता (Shipping Delivery Address)' : 'Full Delivery / Shipping Address'}
                      </label>
                      <input
                        type="text"
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                        placeholder="Godown No. 4, Industrial Area Phase II..."
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                        {isHindi ? 'शिपिंग राज्य (State)' : 'Shipping State'}
                      </label>
                      <select
                        value={shippingState ? (Object.entries(INDIAN_STATE_CODES).find(([_, name]) => name.toLowerCase() === shippingState.toLowerCase())?.[0] || '') : ''}
                        onChange={(e) => {
                          const code = e.target.value;
                          setShippingState(code ? (INDIAN_STATE_CODES[code] || '') : '');
                        }}
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-indigo-500 outline-none"
                      >
                        <option value="">{isHindi ? '-- राज्य चुनें --' : '-- Select State --'}</option>
                        {Object.entries(INDIAN_STATE_CODES).map(([code, stName]) => (
                          <option key={code} value={code}>
                            {code} - {stName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Dispatch & Transport Logistics Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'डिलीवरी नोट / चालान नंबर' : 'Delivery Note / Challan No.'}
                    </label>
                    <input
                      type="text"
                      value={deliveryNoteNo}
                      onChange={(e) => setDeliveryNoteNo(e.target.value)}
                      placeholder="e.g. DN/2026/089"
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'डिलीवरी चालान दिनांक' : 'Delivery Note Date'}
                    </label>
                    <input
                      type="date"
                      value={deliveryNoteDate}
                      onChange={(e) => setDeliveryNoteDate(e.target.value)}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'बायर्स ऑर्डर नंबर' : 'Buyers Order Reference No.'}
                    </label>
                    <input
                      type="text"
                      value={orderReferenceNo}
                      onChange={(e) => setOrderReferenceNo(e.target.value)}
                      placeholder="e.g. PO-88921"
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'ऑर्डर दिनांक' : 'Order Date'}
                    </label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'ट्रांसपोर्टर / वाहन नंबर' : 'Shipped Via / Vehicle No / LR'}
                    </label>
                    <input
                      type="text"
                      value={shippedVia}
                      onChange={(e) => setShippedVia(e.target.value)}
                      placeholder="e.g. MP04-AB-1234 (VRL Logistics)"
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'डिलिवरी की शर्तें' : 'Terms of Delivery'}
                    </label>
                    <input
                      type="text"
                      value={termsOfDelivery}
                      onChange={(e) => setTermsOfDelivery(e.target.value)}
                      placeholder="e.g. FOR Destination / Freight Prepaid"
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Items Table */}
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between items-center gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-sm font-bold text-[var(--text-primary)]">
                  {isHindi ? 'सामग्री एवं सेवा विवरण (Line Items)' : 'Invoice Line Items'}
                </h4>
                {!accountsOnly && (
                  <div className="inline-flex items-center hv-elevated border border-[var(--border-subtle)] rounded-lg p-0.5 text-[11px] font-bold">
                    <span className="px-2 text-[var(--text-muted)] hidden sm:inline">
                      {isHindi ? 'मूल्य स्तर:' : 'Price Tier:'}
                    </span>
                    {(
                      [
                        { id: 'RETAIL', label: isHindi ? 'रिटेल' : 'Retail' },
                        { id: 'WHOLESALE', label: isHindi ? 'होलसेल' : 'Wholesale' },
                        { id: 'MRP', label: 'MRP' },
                      ] as const
                    ).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handlePriceTierChange(t.id)}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          priceTier === t.id
                            ? 'bg-indigo-600 text-white hv-keep-white shadow-sm'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!accountsOnly && (
                  <button
                    type="button"
                    onClick={() => setShowQuickItemModal(true)}
                    className="flex items-center gap-1 hv-pill-emerald border text-xs px-2.5 py-1.5 rounded-xl transition font-bold"
                    title={isHindi ? 'नया स्टॉक आइटम जोड़ें' : 'Create New Stock Item Master'}
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>{isHindi ? '+ नया स्टॉक (Item)' : '+ Quick Stock Item'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1 hv-pill-indigo border text-xs px-3 py-1.5 rounded-xl transition font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{accountsOnly ? (isHindi ? 'नई लाइन जोड़ें' : '+ Add Particular Row') : (isHindi ? 'नया आइटम जोड़ें' : '+ Add Item Line')}</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-xs text-[var(--text-primary)]">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] uppercase font-semibold text-[11px] border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-2.5 min-w-[180px]">{accountsOnly ? (isHindi ? 'सेवा / विवरण (Particulars)' : 'Service / Particulars') : 'Item / Product'}</th>
                    {!forceZeroTaxByCompany && <th className="p-2.5 w-24">HSN/SAC</th>}
                    <th className="p-2.5 w-20">Qty</th>
                    <th className="p-2.5 w-28">Rate ({currency})</th>
                    <th className="p-2.5 w-20">Disc %</th>
                    {!forceZeroTaxByCompany && (
                      <>
                        <th className="p-2.5 w-20">GST %</th>
                        {showCessCol && <th className="p-2.5 w-20">Cess %</th>}
                        <th className="p-2.5 w-28 text-right">Tax ({currency})</th>
                      </>
                    )}
                    <th className="p-2.5 w-32 text-right">Total ({currency})</th>
                    <th className="p-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                  {items.map((line) => (
                    <tr key={line.id} className="hover:bg-[var(--hover-surface)]">
                      <td className="p-2 min-w-[230px] space-y-1.5">
                        {accountsOnly ? (
                          <input
                            type="text"
                            value={line.itemName}
                            onChange={(e) => handleLineChange(line.id, 'itemName', e.target.value)}
                            placeholder={isHindi ? 'सेवा / शुल्क का विवरण लिखें...' : 'Enter service / billing description...'}
                            className="w-full hv-input border border-[var(--border-subtle)] rounded-lg px-2.5 py-2 text-xs font-medium focus:border-indigo-500 focus:outline-none"
                          />
                        ) : (
                          <>
                            <SearchableItemSelect
                              items={data.items}
                              selectedItemId={line.itemId}
                              selectedItemName={line.itemName}
                              onSelectItem={(master) => handleItemSelect(line.id, master.id)}
                              currency={currency}
                              priceType="sales"
                              priceTier={priceTier}
                              isHindi={isHindi}
                              onAddNewItem={() => setShowQuickItemModal(true)}
                            />
                            {(batchGodownActive || (data.itemBatches || []).length > 0) && (() => {
                              const itemBatches = getSortedItemBatchesFefo(data.itemBatches || [], line.itemId, godownId, { includeExpired: true });
                              if (itemBatches.length === 0) return null;
                              const expInfo = line.expiryDate ? getExpiryStatus(line.expiryDate) : null;
                              return (
                                <div className="flex items-center gap-1.5">
                                  <select
                                    value={line.batchId || ''}
                                    onChange={(e) => handleBatchSelect(line.id, e.target.value)}
                                    className="flex-1 hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[11px] text-indigo-500 font-mono"
                                  >
                                    <option value="">{isHindi ? 'कोई बैच नहीं (Auto)' : 'Select Batch (FEFO)'}</option>
                                    {itemBatches.map(b => {
                                      const bexp = getExpiryStatus(b.expiryDate);
                                      return (
                                        <option key={b.id} value={b.id} disabled={bexp.bucket === 'EXPIRED'}>
                                          {b.batchNumber} • Qty:{b.availableQty}{b.expiryDate ? ` • Exp:${b.expiryDate}` : ''}{bexp.bucket === 'EXPIRED' ? ' (EXPIRED)' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {expInfo && expInfo.bucket === 'EXPIRED' && (
                                    <span className="text-[10px] font-bold text-rose-500">EXPIRED</span>
                                  )}
                                </div>
                              );
                            })()}
                          </>
                        )}
                      </td>
                      {!forceZeroTaxByCompany && (
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.hsnSacCode}
                            onChange={(e) => handleLineChange(line.id, 'hsnSacCode', e.target.value)}
                            className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-mono"
                          />
                        </td>
                      )}
                      <td className="p-2">
                        <input
                          type="number"
                          min="1"
                          value={line.quantity}
                          onChange={(e) => handleLineChange(line.id, 'quantity', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-center"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          value={line.rate || ''}
                          placeholder="0"
                          onChange={(e) => handleLineChange(line.id, 'rate', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-mono text-right"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={line.discountPercent || ''}
                          placeholder="0"
                          onChange={(e) => handleLineChange(line.id, 'discountPercent', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-center"
                        />
                      </td>
                      {!forceZeroTaxByCompany && (
                        <>
                          <td className="p-2">
                            <select
                              value={line.taxRate}
                              onChange={(e) => handleLineChange(line.id, 'taxRate', e.target.value)}
                              className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-center"
                            >
                              <option value="0">0%</option>
                              <option value="5">5%</option>
                              <option value="12">12%</option>
                              <option value="18">18%</option>
                              <option value="28">28%</option>
                            </select>
                          </td>
                          {showCessCol && (
                            <td className="p-2">
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                value={line.cessPercent || ''}
                                placeholder="0"
                                onChange={(e) => handleLineChange(line.id, 'cessPercent', e.target.value)}
                                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs text-amber-500 font-mono text-center"
                              />
                            </td>
                          )}
                          <td className="p-2 text-right font-mono text-[var(--text-secondary)]">
                            {formatCurrency((Number(line.taxAmount) || 0) + (showCessCol ? Number(line.cessAmount) || 0 : 0), currency)}
                          </td>
                        </>
                      )}
                      <td className="p-2 text-right font-mono font-bold text-indigo-500">
                        {formatCurrency(line.totalAmount, currency)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(line.id)}
                          className="p-1 text-[var(--text-muted)] hover:text-rose-500 transition"
                          disabled={items.length <= 1}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 hv-elevated p-4 rounded-xl border border-[var(--border-primary)]">
            <div className="space-y-3">
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'विशेष टिप्पणी / नोट' : 'Invoice Notes / Terms'}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isHindi ? 'भुगतान शर्तें या अतिरिक्त टिप्पणियाँ...' : 'Payment terms, order references...'}
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 focus:border-indigo-500 focus:outline-none h-20"
                />
              </div>

              <div className="space-y-3 hv-elevated p-3 rounded-xl border border-[var(--border-subtle)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
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
                          if (!advanceToggleManual) setShowAdvanceOnInvoice(false);
                        } else if (nextMode === 'CASH') {
                          const existingCash = cashLedgers.find(a => a.id === paymentAccountId);
                          setPaymentAccountId(existingCash?.id || cashLedgers[0]?.id || 'acc_cash');
                          if (amountPaid === 0 && grandTotal > 0) {
                            setAmountPaid(grandTotal);
                            if (!advanceToggleManual) setShowAdvanceOnInvoice(true);
                          }
                        } else {
                          const existingBank = bankLedgers.find(a => a.id === paymentAccountId);
                          setPaymentAccountId(existingBank?.id || bankLedgers[0]?.id || 'acc_bank');
                          if (amountPaid === 0 && grandTotal > 0) {
                            setAmountPaid(grandTotal);
                            if (!advanceToggleManual) setShowAdvanceOnInvoice(true);
                          }
                        }
                      }}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-indigo-500 outline-none"
                    >
                      <option value="CREDIT">{isHindi ? 'उधार / क्रेडिट (Sundry Debtors)' : 'Credit / Unpaid (Debtors)'}</option>
                      <option value="CASH">{isHindi ? 'नकद (Cash)' : 'Cash'}</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">{isHindi ? 'कार्ड (Card)' : 'Card'}</option>
                      <option value="BANK_TRANSFER">{isHindi ? 'बैंक ट्रांसफर (NEFT/RTGS/IMPS)' : 'Bank Transfer (NEFT/IMPS)'}</option>
                      <option value="CHEQUE">{isHindi ? 'चेक (Cheque)' : 'Cheque'}</option>
                    </select>
                  </div>

                  {(paymentMode !== 'CREDIT' || amountPaid > 0) && (
                    <div>
                      <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                        {isHindi ? 'खाते में जमा (Deposit Ledger)' : 'Deposit Into (Cash / Bank)'}
                      </label>
                      <select
                        value={paymentAccountId}
                        onChange={(e) => setPaymentAccountId(e.target.value)}
                        className="w-full hv-input text-emerald-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-emerald-500 outline-none"
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
                    <label className="block text-[var(--text-secondary)] font-semibold">
                      {isHindi ? 'प्राप्त अग्रिम / जमा भुगतान (Advance / Amount Paid)' : 'Advance / Amount Paid Now'}
                    </label>
                    {grandTotal > 0 && amountPaid < grandTotal && (
                      <button
                        type="button"
                        onClick={() => {
                          setAmountPaid(grandTotal);
                          if (paymentMode === 'CREDIT') {
                            setPaymentMode('CASH');
                            setPaymentAccountId(cashLedgers[0]?.id || 'acc_cash');
                          }
                          if (!advanceToggleManual) setShowAdvanceOnInvoice(true);
                        }}
                        className="text-[11px] font-bold hv-pill-emerald border px-2 py-0.5 rounded-lg"
                      >
                        {isHindi ? 'पूरा भुगतान (Full Paid)' : 'Mark Full Paid'}
                      </button>
                    )}
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountPaid || ''}
                    placeholder="0.00"
                    onChange={(e) => {
                      const val = Math.max(0, Number(e.target.value) || 0);
                      setAmountPaid(val);
                      if (val > 0 && paymentMode === 'CREDIT') {
                        setPaymentMode('CASH');
                        setPaymentAccountId(cashLedgers[0]?.id || 'acc_cash');
                      }
                      if (!advanceToggleManual) {
                        setShowAdvanceOnInvoice(val > 0);
                      }
                    }}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono font-bold text-emerald-500"
                  />
                </div>

                {(amountPaid > 0 || showAdvanceOnInvoice) && (
                  <div>
                    <label className="block text-[var(--text-muted)] font-semibold mb-1">
                      {isHindi ? 'एडवांस भुगतान माध्यम / संदर्भ (वैकल्पिक)' : 'Payment Reference Note (Optional)'}
                    </label>
                    <input
                      type="text"
                      value={advanceNote}
                      onChange={(e) => setAdvanceNote(e.target.value)}
                      placeholder={isHindi ? 'उदा. UPI / नकद / बैंक रिफ. #1234' : 'e.g. Paid via UPI / Cash / Bank Ref #1234'}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2"
                    />
                  </div>
                )}

                <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-xl hv-pill-indigo border transition">
                  <input
                    type="checkbox"
                    checked={showAdvanceOnInvoice}
                    onChange={(e) => {
                      setAdvanceToggleManual(true);
                      setShowAdvanceOnInvoice(e.target.checked);
                    }}
                    className="w-4 h-4 mt-0.5 rounded border-[var(--border-subtle)] accent-indigo-500 shrink-0"
                  />
                  <div>
                    <span className="block font-bold">
                      {isHindi
                        ? 'प्रिंटेड इनवॉइस पर एडवांस व वास्तविक शेष/भुगतान राशि दिखाएं (वैकल्पिक)'
                        : 'Show Advance & Actual Net Payable on Printed Invoice (Optional)'}
                    </span>
                    <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isHindi
                        ? 'चालू होने पर बिल में कुल राशि में से प्राप्त एडवांस घटाकर वास्तविक देय राशि अलग से दिखेगी।'
                        : 'When enabled, the printed invoice displays Less Advance/Paid and Actual Balance Payable separately.'}
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="space-y-2 text-xs text-[var(--text-secondary)] hv-elevated p-3 rounded-xl border border-[var(--border-subtle)]">
              <div className="flex justify-between">
                <span>Subtotal (सकल राशि):</span>
                <span className="font-mono font-semibold text-[var(--text-primary)]">{formatCurrency(subtotal, currency)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-500">
                  <span>Total Discount:</span>
                  <span className="font-mono font-semibold">-{formatCurrency(totalDiscount, currency)}</span>
                </div>
              )}
              {!forceZeroTaxByCompany && (
                !isInterState ? (
                  <>
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>CGST (Intra-state):</span>
                      <span className="font-mono font-semibold">{formatCurrency(cgstAmount, currency)}</span>
                    </div>
                    <div className="flex justify-between text-[var(--text-muted)]">
                      <span>SGST (Intra-state):</span>
                      <span className="font-mono font-semibold">{formatCurrency(sgstAmount, currency)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>IGST (Inter-state):</span>
                    <span className="font-mono font-semibold">{formatCurrency(igstAmount, currency)}</span>
                  </div>
                )
              )}
              {(showCessCol || cessAmount > 0) && (
                <div className="flex justify-between text-amber-500">
                  <span>Cess Total:</span>
                  <span className="font-mono font-semibold">{formatCurrency(cessAmount, currency)}</span>
                </div>
              )}
              {Math.abs(roundOff) > 0.001 && (
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>{isHindi ? 'राउंड ऑफ (Round Off):' : 'Round Off:'}</span>
                  <span className="font-mono font-semibold">{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-[var(--text-primary)] pt-2 border-t border-[var(--border-subtle)]">
                <span>Grand Total (कुल बिल राशि):</span>
                <span className="font-mono text-indigo-500 text-base">{formatCurrency(grandTotal, currency)}</span>
              </div>
              {(showAdvanceOnInvoice || amountPaid > 0) && (
                <>
                  <div className="flex justify-between text-emerald-500 pt-1">
                    <span>{isHindi ? 'घटाया गया एडवांस / प्राप्त राशि:' : 'Less: Advance / Amount Paid:'}</span>
                    <span className="font-mono font-bold">-{formatCurrency(amountPaid, currency)}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black pt-2 border-t border-[var(--border-subtle)] text-amber-500">
                    <span>{isHindi ? 'वास्तविक शेष देय राशि (Actual Balance):' : 'Actual Net Balance Payable:'}</span>
                    <span className="font-mono text-base">
                      {formatCurrency(Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100), currency)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Accounting Control Warnings (Negative Stock BLOCK/WARN & Credit/Overdue Limit) */}
          {((negativeStockPolicy !== 'ALLOW' && negativeStockWarnings.length > 0) || hasCreditAlert || hasOverdueAlert) && (
            <div className="space-y-2">
              {negativeStockPolicy === 'BLOCK' && negativeStockWarnings.length > 0 && (
                <div className="hv-pill-rose border rounded-xl p-3 text-xs font-semibold">
                  <strong className="font-bold">{isHindi ? 'स्टॉक अवरुद्ध (Stock Blocked): ' : 'Insufficient Stock (Billing Blocked): '}</strong>
                  {negativeStockWarnings.map(w => `${w.name} (${isHindi ? 'उपलब्ध' : 'Avail'}: ${w.available} ${w.unit}, ${isHindi ? 'मांग' : 'Req'}: ${w.reqQty})`).join(', ')}.{' '}
                  {isHindi ? 'जारी रखने से पहले मात्रा कम करें या स्टॉक जोड़ें।' : 'Reduce quantity or add stock before saving.'}
                </div>
              )}

              {((negativeStockPolicy === 'WARN' && negativeStockWarnings.length > 0) || hasCreditAlert || hasOverdueAlert) && (
                <div className="space-y-2 hv-pill-amber border rounded-xl p-3 text-xs">
                  {negativeStockPolicy === 'WARN' && negativeStockWarnings.length > 0 && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmNegativeStock}
                        onChange={(e) => setConfirmNegativeStock(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0"
                      />
                      <span>
                        <strong className="font-bold">{isHindi ? 'कम स्टॉक चेतावनी: ' : 'Negative Stock Warning: '}</strong>
                        {negativeStockWarnings.map(w => `${w.name} (${isHindi ? 'उपलब्ध' : 'Avail'}: ${w.available} ${w.unit}, ${isHindi ? 'मांग' : 'Req'}: ${w.reqQty})`).join(', ')} —{' '}
                        {isHindi ? 'मैं शून्य/नेगेटिव स्टॉक बिलिंग की पुष्टि करता हूँ।' : 'Confirm proceeding with insufficient stock.'}
                      </span>
                    </label>
                  )}
                  {(hasCreditAlert || hasOverdueAlert) && partyCreditEval && (
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmCreditOverride}
                        onChange={(e) => setConfirmCreditOverride(e.target.checked)}
                        className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0"
                      />
                      <span>
                        <strong className="font-bold">
                          {hasCreditAlert
                            ? (isHindi ? 'क्रेडिट सीमा पार चेतावनी: ' : 'Credit Limit Warning: ')
                            : (isHindi ? 'बकाया बिल चेतावनी: ' : 'Overdue Bills Warning: ')}
                        </strong>
                        {hasCreditAlert && (
                          isHindi
                            ? `${selectedParty?.name} का अनुमानित बकाया ${formatCurrency(partyCreditEval.projectedBalance, currency)} सीमा ${formatCurrency(partyCreditEval.creditLimit, currency)} से अधिक है`
                            : `${selectedParty?.name}'s projected receivable (${formatCurrency(partyCreditEval.projectedBalance, currency)}) exceeds credit limit (${formatCurrency(partyCreditEval.creditLimit, currency)})`
                        )}
                        {hasCreditAlert && hasOverdueAlert ? ' • ' : ''}
                        {hasOverdueAlert && (
                          isHindi
                            ? `${partyCreditEval.overdueInvoices.length} बिल (${formatCurrency(partyCreditEval.totalOverdueAmount, currency)}) ओवरड्यू हैं`
                            : `${partyCreditEval.overdueInvoices.length} overdue invoice(s) (${formatCurrency(partyCreditEval.totalOverdueAmount, currency)}) pending`
                        )}
                        {' — '}
                        {isHindi ? 'मैं स्वीकृति देता हूँ।' : 'Approve override & proceed.'}
                      </span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Form Submit Footer */}
          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={negativeStockPolicy === 'BLOCK' && negativeStockWarnings.length > 0}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-45 disabled:cursor-not-allowed text-white hv-keep-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition"
            >
              {isHindi ? 'इनवॉइस सेव एवं जारी करें' : 'Save & Issue Invoice'}
            </button>
          </div>
        </form>

        {/* Quick Add Party Nested Modal */}
        {showQuickPartyModal && (
          <QuickAddPartyModal
            isHindi={isHindi}
            initialType="CUSTOMER"
            onSave={handleQuickPartySaved}
            onClose={() => setShowQuickPartyModal(false)}
          />
        )}

        {/* Quick Add Stock Item Nested Modal */}
        {showQuickItemModal && (
          <QuickAddStockItemModal
            isHindi={isHindi}
            currency={currency}
            gstEnabled={!forceZeroTaxByCompany}
            cessEnabled={showCessCol}
            onSave={handleQuickItemSaved}
            onClose={() => setShowQuickItemModal(false)}
          />
        )}
      </div>
    </div>
  );
};
