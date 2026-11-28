import React, { useState } from 'react';
import { X, Plus, Trash2, FileText, CheckCircle2, AlertCircle, Printer, Download } from 'lucide-react';
import { AppData, DebitCreditNote, InvoiceItem, NoteType } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { isDateLockedByBooksLock } from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange, isDateInFinancialYear, isOptionalGstinValid, normalizeDateISO } from '../../utils/fiscalYear';
import { resolveIsInterStateSupply } from '../../utils/gstAuditEngine';

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

interface DebitCreditNoteModalProps {
  data: AppData;
  isHindi: boolean;
  isOpen?: boolean;
  defaultType?: NoteType;
  onClose: () => void;
  onSave?: (note: DebitCreditNote) => void;
  onSaveNote?: (note: DebitCreditNote) => void;
}

export const DebitCreditNoteModal: React.FC<DebitCreditNoteModalProps> = ({
  data,
  isHindi,
  isOpen = true,
  defaultType = 'DEBIT_NOTE',
  onClose,
  onSave,
  onSaveNote
}) => {
  if (!isOpen) return null;

  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  const [type, setType] = useState<NoteType>(defaultType);
  const [noteNumber, setNoteNumber] = useState<string>(
    `${type === 'DEBIT_NOTE' ? 'DN' : 'CN'}-${fyRange.fyStartYear}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [date, setDate] = useState<string>(defaultActiveDate);
  const [partyId, setPartyId] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  const [partyGstin, setPartyGstin] = useState<string>('');
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState<string>('');
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [autoRoundOff, setAutoRoundOff] = useState<boolean>(() => Boolean(loadAppConfig().autoRoundOff));
  const [validationError, setValidationError] = useState<string | null>(null);

  const [items, setItems] = useState<InvoiceItem[]>([
    {
      id: 'item_1',
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
  ]);

  const reasonsList = isHindi
    ? ['सामग्री वापसी (Goods Returned)', 'दर अंतर (Rate Difference)', 'अतिरिक्त छूट (Discount Allowed)', 'क्षतिग्रस्त माल (Damaged Goods)', 'टैक्स सुधार (Tax Adjustment)']
    : ['Goods Returned', 'Rate Difference', 'Discount Allowed', 'Damaged Goods', 'Tax Adjustment'];

  // Handle party selection
  const handleSelectParty = (id: string) => {
    setPartyId(id);
    const found = data.parties.find(p => p.id === id);
    if (found) {
      setPartyName(found.name);
      setPartyGstin(found.gstin || '');
    }
  };

  // Switch type and generate new number
  const handleTypeChange = (newType: NoteType) => {
    setType(newType);
    setNoteNumber(`${newType === 'DEBIT_NOTE' ? 'DN' : 'CN'}-${fyRange.fyStartYear}-${Math.floor(1000 + Math.random() * 9000)}`);
  };

  // Add Item Line
  const handleAddItem = () => {
    setItems([
      ...items,
      {
        id: 'item_' + (items.length + 1) + '_' + Date.now(),
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
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleItemChange = (idx: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    const item = { ...updated[idx], [field]: value };

    // If master item selected
    if (field === 'itemId') {
      const master = data.items.find(i => i.id === value);
      if (master) {
        item.itemName = master.name;
        item.hsnSacCode = master.hsnSacCode || '9983';
        item.rate = master.salesPrice || master.purchasePrice || 0;
        item.taxRate = master.taxRate || 18;
        item.unit = master.unit || 'Pcs';
      }
    }

    const qty = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const discPct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
    const gross = qty * rate;
    const discAmt = gross * (discPct / 100);
    const lineTaxable = Math.max(0, gross - discAmt);
    const taxAmt = (lineTaxable * (Number(item.taxRate) || 0)) / 100;

    item.taxAmount = round2(taxAmt);
    item.totalAmount = round2(lineTaxable + taxAmt);

    updated[idx] = item;
    setItems(updated);
  };

  // Determine Inter-state vs Intra-state from Company & Party GSTIN state codes, stateCode, or state name
  const selectedPartyObj = data.parties.find(p => p.id === partyId);
  const isInterState = resolveIsInterStateSupply({
    companyGstin: data.company.gstin,
    companyState: data.company.state,
    companyStateCode: data.company.stateCode,
    partyGstin: partyGstin || selectedPartyObj?.gstin,
    partyState: selectedPartyObj?.state,
    partyStateCode: selectedPartyObj?.stateCode,
  });

  // Strict Double-Entry Totals (Rounded to 2 decimals with sub-rupee residual routed to Round Off)
  const subtotal = round2(items.reduce((sum, item) => sum + ((Number(item.quantity) || 0) * (Number(item.rate) || 0)), 0));
  const totalDiscount = round2(
    items.reduce((sum, item) => {
      const gross = (Number(item.quantity) || 0) * (Number(item.rate) || 0);
      const discPct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
      return sum + gross * (discPct / 100);
    }, 0)
  );
  const netTaxable = round2(Math.max(0, subtotal - totalDiscount));
  const totalTax = round2(items.reduce((sum, item) => sum + (Number(item.taxAmount) || 0), 0));
  const cgstAmount = isInterState ? 0 : round2(totalTax / 2);
  const sgstAmount = isInterState ? 0 : round2(totalTax - cgstAmount);
  const igstAmount = isInterState ? totalTax : 0;
  const exactTotal = round2(netTaxable + cgstAmount + sgstAmount + igstAmount);
  const grandTotal = autoRoundOff ? Math.round(exactTotal) : exactTotal;
  const roundOff = Math.round((grandTotal - exactTotal) * 10000) / 10000;

  // Verify strict zero-difference double entry before saving
  const noteDrTotal = type === 'DEBIT_NOTE'
    ? grandTotal + (roundOff < 0 ? Math.abs(roundOff) : 0)
    : netTaxable + cgstAmount + sgstAmount + igstAmount + (roundOff > 0 ? roundOff : 0);
  const noteCrTotal = type === 'DEBIT_NOTE'
    ? netTaxable + cgstAmount + sgstAmount + igstAmount + (roundOff > 0 ? roundOff : 0)
    : grandTotal + (roundOff < 0 ? Math.abs(roundOff) : 0);
  const doubleEntryDiff = Math.abs(noteDrTotal - noteCrTotal);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    const appConfig = loadAppConfig();

    if (!noteNumber.trim()) {
      setValidationError(isHindi ? 'कृपया नोट संख्या दर्ज करें।' : 'Note Number is required.');
      return;
    }
    const duplicateNote = (data.debitCreditNotes || []).some(
      n => n.noteNumber.trim().toLowerCase() === noteNumber.trim().toLowerCase()
    );
    if (duplicateNote) {
      setValidationError(isHindi ? `नोट संख्या "${noteNumber}" पहले से मौजूद है।` : `Duplicate Note Number "${noteNumber}" already exists.`);
      return;
    }
    if (!isDateInFinancialYear(date, fyRange.fyStart)) {
      setValidationError(
        isHindi
          ? `अमान्य तिथि (${date}): नोट दिनांक सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) के भीतर होना चाहिए।`
          : `Out-of-FY Date (${date}): Note date must fall within active ${fyRange.label} (${fyRange.displayRange}).`
      );
      return;
    }
    if (isDateLockedByBooksLock(date, appConfig.booksLockDate)) {
      setValidationError(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${appConfig.booksLockDate} या उससे पहले की तिथि में नोट दर्ज नहीं किया जा सकता।`
          : `Books Locked: Transactions on or before ${appConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }
    if (originalInvoiceDate) {
      const origIso = normalizeDateISO(originalInvoiceDate);
      const noteIso = normalizeDateISO(date);
      if (origIso && noteIso && origIso > noteIso) {
        setValidationError(
          isHindi
            ? `मूल इनवॉइस तिथि (${origIso}) नोट तिथि (${noteIso}) के बाद की नहीं हो सकती।`
            : `Original Invoice Date (${origIso}) cannot be later than Note Date (${noteIso}).`
        );
        return;
      }
    }
    if (!partyName.trim()) {
      setValidationError(isHindi ? 'कृपया पार्टी / ग्राहक का नाम चुनें या दर्ज करें!' : 'Please enter or select Party Name!');
      return;
    }
    const gstCheck = isOptionalGstinValid(partyGstin);
    if (!gstCheck.valid) {
      setValidationError(isHindi ? (gstCheck.errorHindi || 'पार्टी GSTIN अमान्य है।') : (gstCheck.error || 'Invalid Party GSTIN.'));
      return;
    }
    if (items.some(it => !it.itemName.trim() || Number(it.quantity) <= 0 || Number(it.rate) < 0 || Number(it.discountPercent) < 0 || Number(it.discountPercent) > 100)) {
      setValidationError(isHindi ? 'प्रत्येक आइटम की मात्रा (> 0), छूट (0-100%) और दर (>= 0) सही होनी चाहिए।' : 'Every item must have a description, Quantity > 0, Discount (0-100%), and Rate >= 0.');
      return;
    }
    if (appConfig.hsnMandatory && items.some(it => (it.hsnSacCode || '').trim().length < 4)) {
      setValidationError(isHindi ? 'सेटिंग्स में HSN/SAC अनिवार्य है — प्रत्येक आइटम में कम से कम 4 अंकों का HSN/SAC कोड भरें।' : 'HSN/SAC code (min 4 characters) is mandatory per Settings.');
      return;
    }
    if (grandTotal <= 0) {
      setValidationError(isHindi ? 'कृपया कम से कम एक मान्य आइटम प्रविष्टि दर्ज करें (कुल राशि > 0)!' : 'Grand Total must be greater than zero!');
      return;
    }
    if (doubleEntryDiff >= 0.001) {
      setValidationError(
        isHindi
          ? `डबल-एंट्री अंतर (₹${doubleEntryDiff.toFixed(4)}) का पता चला — कृपया राउंड ऑफ जांचें।`
          : `Unbalanced Double Entry detected (Diff: ${doubleEntryDiff.toFixed(4)}).`
      );
      return;
    }

    const newNote: DebitCreditNote = {
      id: 'dcn_' + Date.now(),
      noteNumber: noteNumber.trim(),
      type,
      date,
      partyId,
      partyName: partyName.trim(),
      partyGstin: partyGstin.trim(),
      originalInvoiceNo: originalInvoiceNo.trim(),
      originalInvoiceDate,
      reason,
      items,
      subtotal,
      totalDiscount,
      cgstAmount,
      sgstAmount,
      igstAmount,
      totalTax,
      roundOff,
      grandTotal,
      remarks
    };

    (onSave || onSaveNote)?.(newNote);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl w-full max-w-4xl shadow-2xl my-8 text-[var(--text-primary)] flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between hv-elevated rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${type === 'DEBIT_NOTE' ? 'hv-pill-rose' : 'hv-pill-emerald'}`}>
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)]">
                {type === 'DEBIT_NOTE' 
                  ? (isHindi ? 'डेबिट नोट बनाएं (Debit Note - Purchase Return)' : 'Create Debit Note (Purchase Return)')
                  : (isHindi ? 'क्रेडिट नोट बनाएं (Credit Note - Sales Return)' : 'Create Credit Note (Sales Return)')}
              </h3>
              <p className="text-sm text-[var(--text-muted)]">
                {isHindi ? 'जीएसटी अनुपालन एवं स्वचालित राउंड ऑफ लेज़र सहित डेबिट/क्रेडिट नोट दर्ज करें' : 'Record Debit/Credit note with full GST & zero-difference double-entry routing'}
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-sm tabular-nums">
          {validationError && (
            <div className="p-3 hv-pill-rose border rounded-xl text-sm font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {/* Note Type Switcher & Note No */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 hv-elevated p-4 rounded-xl border border-[var(--border-primary)]">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                {isHindi ? 'नोट प्रकार (Note Type):' : 'Note Type:'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleTypeChange('DEBIT_NOTE')}
                  className={`py-2 px-3 rounded-xl text-sm font-bold transition border ${
                    type === 'DEBIT_NOTE' 
                      ? 'bg-rose-600 text-white hv-keep-white border-rose-500 shadow' 
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                  }`}
                >
                  {isHindi ? 'डेबिट नोट' : 'Debit Note'}
                </button>
                <button
                  type="button"
                  onClick={() => handleTypeChange('CREDIT_NOTE')}
                  className={`py-2 px-3 rounded-xl text-sm font-bold transition border ${
                    type === 'CREDIT_NOTE' 
                      ? 'bg-emerald-600 text-white hv-keep-white border-emerald-500 shadow' 
                      : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                  }`}
                >
                  {isHindi ? 'क्रेडिट नोट' : 'Credit Note'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                {isHindi ? 'नोट संख्या (Note No):' : 'Note Number:'}
              </label>
              <input
                type="text"
                value={noteNumber}
                onChange={(e) => setNoteNumber(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm font-mono focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                {isHindi ? 'तारीख (Date):' : 'Date:'}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          </div>

          {/* Party Details & Original Invoice */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                {isHindi ? 'पार्टी / ग्राहक / विक्रेता नाम *' : 'Party / Customer / Vendor Name *'}
              </label>
              <select
                value={partyId}
                onChange={(e) => handleSelectParty(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500 mb-2"
              >
                <option value="">{isHindi ? '-- पार्टी मास्टर से चुनें --' : '-- Select from Party Master --'}</option>
                {data.parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type}) {p.gstin ? `- GST: ${p.gstin}` : ''}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={partyName}
                onChange={(e) => setPartyName(e.target.value)}
                placeholder={isHindi ? 'या नया पार्टी का नाम दर्ज करें...' : 'Or type party name...'}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                    {isHindi ? 'मूल इनवॉइस सं.:' : 'Orig. Invoice No:'}
                  </label>
                  <input
                    type="text"
                    value={originalInvoiceNo}
                    onChange={(e) => setOriginalInvoiceNo(e.target.value)}
                    placeholder="INV-2026-001"
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                    {isHindi ? 'मूल इनवॉइस तारीख:' : 'Orig. Invoice Date:'}
                  </label>
                  <input
                    type="date"
                    value={originalInvoiceDate}
                    onChange={(e) => setOriginalInvoiceDate(e.target.value)}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                  {isHindi ? 'कारण (Reason):' : 'Reason:'}
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500"
                >
                  <option value="">{isHindi ? '-- कारण चुनें --' : '-- Select Reason --'}</option>
                  {reasonsList.map((r, i) => (
                    <option key={i} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                {isHindi ? 'आइटम एवं विवरण (Items & Amounts)' : 'Items & Taxable Amounts'}
              </h4>
              <button
                type="button"
                onClick={handleAddItem}
                className="flex items-center gap-1 text-sm text-indigo-500 hover:opacity-80 font-bold"
              >
                <Plus className="w-4 h-4" />
                <span>{isHindi ? '+ नया आइटम जोड़ें' : '+ Add Item Line'}</span>
              </button>
            </div>

            <div className="overflow-auto max-h-[34vh] border border-[var(--border-primary)] rounded-xl">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold text-xs uppercase border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-2.5 min-w-[180px]">{isHindi ? 'आइटम नाम / विवरण' : 'Item Name / Description'}</th>
                    <th className="p-2.5 w-24">HSN/SAC</th>
                    <th className="p-2.5 w-20">{isHindi ? 'मात्रा' : 'Qty'}</th>
                    <th className="p-2.5 w-24">{isHindi ? 'दर (Rate)' : 'Rate'}</th>
                    <th className="p-2.5 w-20">{isHindi ? 'छूट %' : 'Disc %'}</th>
                    <th className="p-2.5 w-20">GST %</th>
                    <th className="p-2.5 w-28 text-right">{isHindi ? 'कुल' : 'Total'}</th>
                    <th className="p-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                  {items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-[var(--hover-surface)]">
                      <td className="p-2">
                        <select
                          value={item.itemId}
                          onChange={(e) => handleItemChange(idx, 'itemId', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm mb-1"
                        >
                          <option value="">{isHindi ? '-- मास्टर चुनें --' : '-- Select Item --'}</option>
                          {data.items.map((it) => (
                            <option key={it.id} value={it.id}>{it.name}</option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={item.itemName}
                          onChange={(e) => handleItemChange(idx, 'itemName', e.target.value)}
                          placeholder={isHindi ? 'विवरण लिखें...' : 'Item description...'}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={item.hsnSacCode}
                          onChange={(e) => handleItemChange(idx, 'hsnSacCode', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm font-mono"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.rate || ''}
                          placeholder="0"
                          onChange={(e) => handleItemChange(idx, 'rate', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm font-mono"
                          required
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={item.discountPercent || ''}
                          placeholder="0"
                          onChange={(e) => handleItemChange(idx, 'discountPercent', e.target.value)}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm font-mono"
                        />
                      </td>
                      <td className="p-2">
                        <select
                          value={item.taxRate}
                          onChange={(e) => handleItemChange(idx, 'taxRate', Number(e.target.value))}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-sm"
                        >
                          <option value={0}>0%</option>
                          <option value={5}>5%</option>
                          <option value={12}>12%</option>
                          <option value={18}>18%</option>
                          <option value={28}>28%</option>
                        </select>
                      </td>
                      <td className="p-2 font-mono text-sm font-bold text-[var(--text-primary)] text-right">
                        {formatCurrency(item.totalAmount, data.company.currency)}
                      </td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="text-[var(--text-muted)] hover:text-rose-500 p-1"
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

          {/* Remarks & Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pt-2">
            <div>
              <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-1">
                {isHindi ? 'टिप्पणी / नारेशन (Remarks):' : 'Remarks / Narration:'}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder={isHindi ? 'नोट का कारण या कोई विशेष टिपणी दर्ज करें...' : 'Enter reason or notes for this note...'}
                rows={3}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-2 text-sm tabular-nums">
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{isHindi ? 'सकल योग (Subtotal):' : 'Subtotal:'}</span>
                <span className="font-mono">{formatCurrency(subtotal, data.company.currency)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-500">
                  <span>{isHindi ? 'छूट (Discount):' : 'Discount:'}</span>
                  <span className="font-mono">-{formatCurrency(totalDiscount, data.company.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-[var(--text-secondary)] font-semibold">
                <span>{isHindi ? 'टैक्सेबल वैल्यू:' : 'Taxable Value:'}</span>
                <span className="font-mono">{formatCurrency(netTaxable, data.company.currency)}</span>
              </div>
              {isInterState ? (
                <div className="flex justify-between text-amber-500">
                  <span>IGST (Inter-state):</span>
                  <span className="font-mono">{formatCurrency(igstAmount, data.company.currency)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>CGST (Intra-state):</span>
                    <span className="font-mono">{formatCurrency(cgstAmount, data.company.currency)}</span>
                  </div>
                  <div className="flex justify-between text-[var(--text-muted)]">
                    <span>SGST (Intra-state):</span>
                    <span className="font-mono">{formatCurrency(sgstAmount, data.company.currency)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center text-[var(--text-muted)] pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoRoundOff}
                    onChange={(e) => setAutoRoundOff(e.target.checked)}
                    className="rounded border-[var(--border-subtle)] accent-indigo-500"
                  />
                  <span>{isHindi ? 'राउंड ऑफ (Round Off A/c):' : 'Auto Round Off (Round Off A/c):'}</span>
                </label>
                <span className="font-mono text-indigo-500">
                  {roundOff >= 0 ? '+' : ''}{roundOff.toFixed(2)}
                </span>
              </div>
              <div className="border-t border-[var(--border-primary)] pt-2 flex justify-between font-bold text-[var(--text-primary)] text-base">
                <span>{isHindi ? 'कुल राशि (Grand Total):' : 'Grand Total:'}</span>
                <span className={`font-mono ${type === 'DEBIT_NOTE' ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {formatCurrency(grandTotal, data.company.currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm font-semibold transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 rounded-xl font-bold text-sm text-white hv-keep-white shadow-lg flex items-center gap-1.5 transition ${
                type === 'DEBIT_NOTE' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {type === 'DEBIT_NOTE'
                  ? (isHindi ? 'डेबिट नोट सहेजें' : 'Save Debit Note')
                  : (isHindi ? 'क्रेडिट नोट सहेजें' : 'Save Credit Note')}
              </span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
