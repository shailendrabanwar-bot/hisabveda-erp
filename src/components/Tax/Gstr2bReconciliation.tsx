import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  Info,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppData, GstPortalData, GstrPortalPurchaseEntry } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  Gstr2ReconcileMode,
  parseGstr2PortalJson,
  parseGstr2PortalSpreadsheet,
  reconcileGstr2Entries,
  resolveTransactionGstDetails,
} from '../../utils/gstAuditEngine';

interface Gstr2bReconciliationProps {
  data: AppData;
  isHindi: boolean;
  onUpdateGstPortalData?: (updater: (prev: GstPortalData) => GstPortalData) => void;
}

export const Gstr2bReconciliation: React.FC<Gstr2bReconciliationProps> = ({
  data,
  isHindi,
  onUpdateGstPortalData,
}) => {
  const currency = data.company.currency;
  const gstr2aInputRef = useRef<HTMLInputElement | null>(null);
  const gstr2bInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Gstr2ReconcileMode>('2B_VS_BOOKS');
  const [filterType, setFilterType] = useState<
    'ALL' | 'MATCHED' | 'DISCREPANCY' | 'EXCESS_IN_BOOKS' | 'MISSING_IN_BOOKS' | 'IN_2A_ONLY'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusNotice, setStatusNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);

  const [manualForm, setManualForm] = useState({
    source: 'GSTR2B' as 'GSTR2A' | 'GSTR2B',
    vendorGstin: '',
    vendorName: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    taxableValue: '',
    igst: '',
    cgst: '',
    sgst: '',
  });

  const gstr2aEntries = data.gstPortalData?.gstr2aEntries || [];
  const gstr2bEntries = data.gstPortalData?.gstr2bEntries || [];

  const { rows, summary, vendorFollowUps } = useMemo(
    () =>
      reconcileGstr2Entries(
        data.purchaseInvoices || [],
        gstr2aEntries,
        gstr2bEntries,
        mode,
        data.parties
      ),
    [data.purchaseInvoices, gstr2aEntries, gstr2bEntries, mode, data.parties]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filterType === 'MATCHED' && row.status !== 'EXACT_MATCH' && row.status !== 'TYPO_OR_DATE_DIFF') {
        return false;
      }
      if (filterType === 'DISCREPANCY' && row.status !== 'AMOUNT_TAX_DIFF') {
        return false;
      }
      if (filterType === 'EXCESS_IN_BOOKS' && row.status !== 'MISSING_IN_PORTAL') {
        return false;
      }
      if (filterType === 'MISSING_IN_BOOKS' && row.status !== 'MISSING_IN_BOOKS') {
        return false;
      }
      if (filterType === 'IN_2A_ONLY' && row.status !== 'IN_2A_ONLY_NOT_2B') {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          row.vendorName.toLowerCase().includes(q) ||
          row.vendorGstin.toLowerCase().includes(q) ||
          row.invoiceNumber.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rows, filterType, searchQuery]);

  const savePortalEntries = (source: 'GSTR2A' | 'GSTR2B', incoming: GstrPortalPurchaseEntry[], replace = false) => {
    if (!onUpdateGstPortalData) return;
    onUpdateGstPortalData((prev) => {
      const existing = source === 'GSTR2A' ? prev.gstr2aEntries || [] : prev.gstr2bEntries || [];
      const mergedMap = new Map<string, GstrPortalPurchaseEntry>();
      if (!replace) {
        existing.forEach((e) => {
          const k = `${e.vendorGstin}_${e.invoiceNumber}`.toUpperCase();
          mergedMap.set(k, e);
        });
      }
      incoming.forEach((e) => {
        const k = `${e.vendorGstin}_${e.invoiceNumber}`.toUpperCase();
        mergedMap.set(k, e);
      });
      const updatedList = Array.from(mergedMap.values());
      return {
        ...prev,
        ...(source === 'GSTR2A' ? { gstr2aEntries: updatedList } : { gstr2bEntries: updatedList }),
        lastImportedAt: new Date().toISOString(),
      };
    });
  };

  const handlePortalFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    source: 'GSTR2A' | 'GSTR2B'
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const ext = file.name.toLowerCase();
      if (ext.endsWith('.json')) {
        const text = await file.text();
        const res = parseGstr2PortalJson(text, source);
        if (res.entries.length === 0) {
          setStatusNotice({
            type: 'error',
            text: res.warnings[0] || `No entries found in ${file.name}.`,
          });
          return;
        }
        savePortalEntries(source, res.entries, false);
        setMode(source === 'GSTR2A' ? '2A_VS_BOOKS' : '2B_VS_BOOKS');
        setStatusNotice({
          type: 'success',
          text: isHindi
            ? `${source} से ${res.entries.length} पोर्टल इनवॉइस सफलतापूर्वक आयात व सेव किए गए।`
            : `Imported and saved ${res.entries.length} ${source} portal invoice(s) from ${file.name}.`,
        });
      } else if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
        const buf = await file.arrayBuffer();
        const res = parseGstr2PortalSpreadsheet(buf, source);
        if (res.entries.length === 0) {
          setStatusNotice({
            type: 'error',
            text: res.warnings[0] || `Could not parse B2B sheet in ${file.name}.`,
          });
          return;
        }
        savePortalEntries(source, res.entries, false);
        setMode(source === 'GSTR2A' ? '2A_VS_BOOKS' : '2B_VS_BOOKS');
        setStatusNotice({
          type: 'success',
          text: isHindi
            ? `${source} Excel/CSV से ${res.entries.length} बिल सफलतापूर्वक लोड हुए।`
            : `Loaded ${res.entries.length} ${source} portal entries from ${file.name}.`,
        });
      } else {
        setStatusNotice({
          type: 'error',
          text: isHindi
            ? 'कृपया GST पोर्टल की .json, .xlsx, या .csv फ़ाइल ही अपलोड करें।'
            : 'Please upload an official GST Portal .json, .xlsx, .xls, or .csv file.',
        });
      }
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        text: `Import failed: ${err?.message || 'Unknown error'}`,
      });
    }
  };

  const handleLoadPracticeSampleFromBooks = () => {
    const purchases = (data.purchaseInvoices || []).filter((p) => p.status !== 'CANCELLED');
    if (purchases.length === 0) {
      // Seed standalone illustrative sample entries when books are empty
      const sample2b: GstrPortalPurchaseEntry[] = [
        {
          id: 'sample_2b_1',
          source: 'GSTR2B',
          returnPeriod: '2026-07',
          vendorGstin: '27AABCS1429B1ZS',
          vendorName: 'Shree Ganesh Steel Traders',
          invoiceNumber: 'GST/26-27/104',
          invoiceDate: '2026-07-12',
          invoiceType: 'Regular',
          taxableValue: 50000,
          igst: 9000,
          cgst: 0,
          sgst: 0,
          totalTax: 9000,
          itcEligibility: 'ELIGIBLE',
          gstr1FilingStatus: 'Filed',
          gstr1FilingDate: '2026-08-10',
        },
      ];
      savePortalEntries('GSTR2B', sample2b, true);
      setStatusNotice({
        type: 'info',
        text: isHindi
          ? 'सैंपल परीक्षण डेटा लोड किया गया। वास्तविक मिलान के लिए पोर्टल JSON/Excel अपलोड करें।'
          : 'Sample preview record loaded. Upload your real GST Portal JSON/Excel anytime.',
      });
      return;
    }

    // Mirror first 80% of book purchases into 2B and all minus last into 2A so user can inspect real mismatch behavior
    const sample2a: GstrPortalPurchaseEntry[] = purchases.map((p) => {
      const resolvedGstin =
        resolveTransactionGstDetails(p, data.parties, data.company?.state).gstin ||
        '23AABCP1122K1Z5';
      return {
        id: `sample_2a_${p.id}`,
        source: 'GSTR2A',
        returnPeriod: p.date.slice(0, 7),
        vendorGstin: resolvedGstin,
        vendorName: p.partyName,
        invoiceNumber: p.supplierInvoiceNo || p.billNumber,
        invoiceDate: p.date,
        invoiceType: 'Regular',
        taxableValue: p.subtotal,
        igst: p.igstAmount,
        cgst: p.cgstAmount,
        sgst: p.sgstAmount,
        totalTax: p.totalTax,
        itcEligibility: 'ELIGIBLE',
        gstr1FilingStatus: 'Filed',
      };
    });
    const cutoff = Math.max(1, purchases.length - 1);
    const sample2b: GstrPortalPurchaseEntry[] = purchases.slice(0, cutoff).map((p) => {
      const resolvedGstin =
        resolveTransactionGstDetails(p, data.parties, data.company?.state).gstin ||
        '23AABCP1122K1Z5';
      return {
        id: `sample_2b_${p.id}`,
        source: 'GSTR2B',
        returnPeriod: p.date.slice(0, 7),
        vendorGstin: resolvedGstin,
        vendorName: p.partyName,
        invoiceNumber: p.supplierInvoiceNo || p.billNumber,
        invoiceDate: p.date,
        invoiceType: 'Regular',
        taxableValue: p.subtotal,
        igst: p.igstAmount,
        cgst: p.cgstAmount,
        sgst: p.sgstAmount,
        totalTax: p.totalTax,
        itcEligibility: 'ELIGIBLE',
        gstr1FilingStatus: 'Filed',
      };
    });
    if (onUpdateGstPortalData) {
      onUpdateGstPortalData((prev) => ({
        ...prev,
        gstr2aEntries: sample2a,
        gstr2bEntries: sample2b,
        lastImportedAt: new Date().toISOString(),
      }));
    }
    setMode('THREE_WAY');
    setStatusNotice({
      type: 'info',
      text: isHindi
        ? 'डेमो सिमुलेशन लोड किया गया (1 बिल जानबूझकर 2B से गायब दिखाया गया है ताकि आप Excess Books चेक देख सकें)।'
        : 'Preview simulation loaded with 1 missing bill in GSTR-2B to demonstrate Excess-in-Books ITC alerts.',
    });
  };

  const handleClearSource = (source: 'GSTR2A' | 'GSTR2B') => {
    if (!onUpdateGstPortalData) return;
    onUpdateGstPortalData((prev) => ({
      ...prev,
      ...(source === 'GSTR2A' ? { gstr2aEntries: [] } : { gstr2bEntries: [] }),
    }));
    setStatusNotice({
      type: 'info',
      text: isHindi ? `${source} पोर्टल डेटा साफ किया गया।` : `Cleared stored ${source} portal entries.`,
    });
  };

  const handleAddManualEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.invoiceNumber.trim() || !manualForm.vendorName.trim()) return;
    const taxable = Number(manualForm.taxableValue) || 0;
    const igst = Number(manualForm.igst) || 0;
    const cgst = Number(manualForm.cgst) || 0;
    const sgst = Number(manualForm.sgst) || 0;
    const entry: GstrPortalPurchaseEntry = {
      id: `man_${Date.now()}`,
      source: manualForm.source,
      returnPeriod: manualForm.invoiceDate.slice(0, 7),
      vendorGstin: manualForm.vendorGstin.trim().toUpperCase(),
      vendorName: manualForm.vendorName.trim(),
      invoiceNumber: manualForm.invoiceNumber.trim(),
      invoiceDate: manualForm.invoiceDate,
      invoiceType: 'Regular',
      taxableValue: taxable,
      igst,
      cgst,
      sgst,
      totalTax: Number((igst + cgst + sgst).toFixed(2)),
      itcEligibility: 'ELIGIBLE',
      gstr1FilingStatus: 'Filed',
    };
    savePortalEntries(manualForm.source, [entry], false);
    setShowManualModal(false);
    setManualForm({
      source: manualForm.source,
      vendorGstin: '',
      vendorName: '',
      invoiceNumber: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      taxableValue: '',
      igst: '',
      cgst: '',
      sgst: '',
    });
    setStatusNotice({
      type: 'success',
      text: isHindi ? `${entry.source} में बिल #${entry.invoiceNumber} जोड़ा गया।` : `Added #${entry.invoiceNumber} to ${entry.source}.`,
    });
  };

  const handleExportExcel = () => {
    const sheetRows = rows.map((r) => ({
      Status: r.status,
      Vendor_Name: r.vendorName,
      Vendor_GSTIN: r.vendorGstin,
      Invoice_No: r.invoiceNumber,
      Invoice_Date: r.invoiceDate,
      Books_Taxable: r.purchaseInvoice?.subtotal ?? 0,
      Books_Tax: r.purchaseInvoice?.totalTax ?? 0,
      GSTR2B_Taxable: r.gstr2b?.taxableValue ?? 0,
      GSTR2B_Tax: r.gstr2b?.totalTax ?? 0,
      GSTR2A_Taxable: r.gstr2a?.taxableValue ?? 0,
      GSTR2A_Tax: r.gstr2a?.totalTax ?? 0,
      Tax_Variance_Portal_Minus_Books: r.taxDiff,
      Audit_Notes: r.reasons.join('; '),
    }));

    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(sheetRows);
    XLSX.utils.book_append_sheet(wb, ws1, '2A_2B_Reconciliation');

    if (vendorFollowUps.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(
        vendorFollowUps.map((v) => ({
          Vendor_Name: v.vendorName,
          Vendor_GSTIN: v.vendorGstin,
          Missing_Bill_Count: v.missingCount,
          At_Risk_ITC: Number(v.atRiskItc.toFixed(2)),
          Taxable_Amount: Number(v.taxableTotal.toFixed(2)),
          Missing_Bill_Numbers: v.billNumbers.join(', '),
        }))
      );
      XLSX.utils.book_append_sheet(wb, ws2, 'Vendor_FollowUp');
    }

    XLSX.writeFile(wb, `GSTR_2A_2B_Reconciliation_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const copyVendorReminder = (v: typeof vendorFollowUps[0]) => {
    const msg = `Dear ${v.vendorName},\n\nDuring our GST Portal (GSTR-2A/2B) audit for ${data.company.name || 'our company'} (GSTIN: ${data.company.gstin || 'N/A'}), the following ${v.missingCount} purchase invoice(s) are NOT reflecting on the GST Portal:\nBills: ${v.billNumbers.join(', ')}\nBlocked ITC Amount: ₹${v.atRiskItc.toFixed(2)}\n\nPlease upload these invoices in your GSTR-1 / IFF at the earliest so our Input Tax Credit is not blocked under Sec 16(2)(aa).\nThank you.`;
    navigator.clipboard?.writeText(msg).catch(() => {});
    setStatusNotice({
      type: 'success',
      text: isHindi
        ? `${v.vendorName} के लिए रिमाइंडर संदेश कॉपी हो गया (WhatsApp/Email पर पेस्ट करें)।`
        : `Copied GST Non-Filer reminder for ${v.vendorName} to clipboard.`,
    });
  };

  const hasAnyPortalData = gstr2aEntries.length > 0 || gstr2bEntries.length > 0;

  return (
    <div className="space-y-5">
      {/* Hidden File Inputs */}
      <input
        ref={gstr2bInputRef}
        type="file"
        accept=".json,.xlsx,.xls,.csv"
        onChange={(e) => handlePortalFileUpload(e, 'GSTR2B')}
        className="hidden"
      />
      <input
        ref={gstr2aInputRef}
        type="file"
        accept=".json,.xlsx,.xls,.csv"
        onChange={(e) => handlePortalFileUpload(e, 'GSTR2A')}
        className="hidden"
      />

      {/* Top Action & Upload Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
              <span>{isHindi ? 'जीएसटी पोर्टल मिलान केंद्र' : 'GST Portal ITC Matcher'}</span>
              <span aria-hidden="true">·</span>
              <span>{isHindi ? 'GSTR-2A एवं GSTR-2B (3-Way)' : 'GSTR-2A & GSTR-2B 3-Way Engine'}</span>
            </div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2.5">
              <ArrowRightLeft className="w-6 h-6 text-emerald-400 shrink-0" />
              <span>
                {isHindi
                  ? 'GSTR-2A एवं GSTR-2B बनाम परचेज रजिस्टर मिलान'
                  : 'GSTR-2A & GSTR-2B Portal vs Purchase Register Matching'}
              </span>
            </h2>
            <p className="text-slate-400 text-xs max-w-3xl">
              {isHindi
                ? 'GST पोर्टल से डाउनलोड की गई GSTR-2A या GSTR-2B (JSON / Excel / CSV) फ़ाइल अपलोड करें। सॉफ्टवेयर तुरंत पकड़ेगा कि कौन से परचेज बिल पोर्टल पर कम हैं और कितना ITC जोखिम में है।'
                : 'Upload genuine GSTR-2A or GSTR-2B JSON/Excel files from gst.gov.in. Instantly catches excess purchase bills in books missing on the portal (Sec 16(2)(aa) ITC risk), tax variances, and unclaimed portal credits.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => gstr2bInputRef.current?.click()}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>{isHindi ? 'GSTR-2B (JSON/Excel)' : 'Upload GSTR-2B'}</span>
            </button>

            <button
              type="button"
              onClick={() => gstr2aInputRef.current?.click()}
              className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>{isHindi ? 'GSTR-2A (JSON/Excel)' : 'Upload GSTR-2A'}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowManualModal(true)}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>{isHindi ? '+ बिल जोड़ें' : 'Add Entry'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={rows.length === 0}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 border border-slate-700 text-slate-200 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'Excel डाउनलोड' : 'Export Excel'}</span>
            </button>
          </div>
        </div>

        {/* Comparison Mode Switcher + Loaded Counts */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl w-fit">
            {[
              { id: '2B_VS_BOOKS', en: 'GSTR-2B vs Books', hi: 'GSTR-2B बनाम बुक्स' },
              { id: '2A_VS_BOOKS', en: 'GSTR-2A vs Books', hi: 'GSTR-2A बनाम बुक्स' },
              { id: 'THREE_WAY', en: '3-Way (2A + 2B + Books)', hi: '3-Way (2A + 2B + बुक्स)' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id as Gstr2ReconcileMode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${
                  mode === m.id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                {isHindi ? m.hi : m.en}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
            <span>
              Books Bills: <strong className="text-white tabular-nums">{summary.booksCount}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              2B Portal: <strong className="text-emerald-400 tabular-nums">{summary.portal2bCount}</strong>
              {gstr2bEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleClearSource('GSTR2B')}
                  className="ml-1.5 text-rose-400 hover:text-rose-300 underline font-sans text-[11px] cursor-pointer"
                  title="Clear GSTR-2B entries"
                >
                  Clear
                </button>
              )}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              2A Portal: <strong className="text-indigo-400 tabular-nums">{summary.portal2aCount}</strong>
              {gstr2aEntries.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleClearSource('GSTR2A')}
                  className="ml-1.5 text-rose-400 hover:text-rose-300 underline font-sans text-[11px] cursor-pointer"
                  title="Clear GSTR-2A entries"
                >
                  Clear
                </button>
              )}
            </span>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl">
            <div className="text-[11px] text-slate-400 font-medium">
              {isHindi ? 'बुक्स परचेज ITC (Books)' : 'Books Purchase ITC'}
            </div>
            <div className="text-lg font-bold text-white font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.booksTotalTax, currency)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{summary.booksCount} bills</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl">
            <div className="text-[11px] text-slate-400 font-medium">
              {isHindi ? 'GSTR-2B पात्र ITC' : 'GSTR-2B Portal ITC'}
            </div>
            <div className="text-lg font-bold text-emerald-400 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.portal2bTax, currency)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{summary.portal2bCount} bills</div>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl">
            <div className="text-[11px] text-slate-400 font-medium">
              {isHindi ? 'GSTR-2A ऑटो ड्राफ्टेड' : 'GSTR-2A Portal ITC'}
            </div>
            <div className="text-lg font-bold text-indigo-400 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.portal2aTax, currency)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">{summary.portal2aCount} bills</div>
          </div>

          <div className="bg-slate-950 border border-rose-500/40 p-3.5 rounded-xl">
            <div className="text-[11px] text-rose-300 font-semibold">
              {isHindi ? 'बुक्स में ज्यादा (पोर्टल पर गायब)' : 'Excess in Books (ITC Risk)'}
            </div>
            <div className="text-lg font-bold text-rose-400 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.excessInBooksTax, currency)}
            </div>
            <div className="text-[11px] text-rose-300/70 mt-0.5 tabular-nums">
              {summary.excessInBooksCount} {isHindi ? 'बिल पोर्टल पर नहीं' : 'bills missing on portal'}
            </div>
          </div>

          <div className="bg-slate-950 border border-amber-500/30 p-3.5 rounded-xl">
            <div className="text-[11px] text-amber-300 font-semibold">
              {isHindi ? 'पोर्टल पर मिला (बुक्स में नहीं)' : 'Unclaimed on Portal'}
            </div>
            <div className="text-lg font-bold text-amber-400 font-mono tabular-nums mt-0.5">
              {formatCurrency(summary.missingInBooksTax, currency)}
            </div>
            <div className="text-[11px] text-amber-300/70 mt-0.5 tabular-nums">
              {summary.missingInBooksCount} {isHindi ? 'बिल एंट्री बाकी' : 'bills missing in books'}
            </div>
          </div>
        </div>
      </div>

      {/* Status Notice Toast */}
      {statusNotice && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-3 ${
            statusNotice.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-200'
              : statusNotice.type === 'error'
              ? 'bg-rose-950/70 border-rose-500/40 text-rose-200'
              : 'bg-slate-900 border-indigo-500/40 text-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusNotice.type === 'error' ? <AlertCircle className="w-4 h-4 shrink-0" /> : <CheckCircle2 className="w-4 h-4 shrink-0" />}
            <span>{statusNotice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-slate-400 hover:text-white px-2 py-0.5 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Empty Portal Guidance Card */}
      {!hasAnyPortalData && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-6 text-center space-y-4">
          <div className="max-w-xl mx-auto space-y-2">
            <Info className="w-8 h-8 text-amber-400 mx-auto" />
            <h3 className="text-base font-bold text-white">
              {isHindi
                ? 'अभी कोई GSTR-2A / GSTR-2B पोर्टल फ़ाइल अपलोड नहीं की गई है'
                : 'No GST Portal 2A or 2B Data Imported Yet'}
            </h3>
            <p className="text-xs text-slate-400">
              {isHindi
                ? 'www.gst.gov.in से अपना GSTR-2B या GSTR-2A (JSON या Excel) डाउनलोड करें और ऊपर दिए गए अपलोड बटन से चुनें। यदि आप तुरंत डेमो देखना चाहते हैं तो नीचे दिए बटन से परीक्षण डेटा लोड कर सकते हैं।'
                : 'Download GSTR-2B or GSTR-2A (JSON / Excel) from gst.gov.in and upload it above to begin real reconciliation against your Purchase Register. Or load a quick practice simulation below.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => gstr2bInputRef.current?.click()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>{isHindi ? 'GSTR-2B फ़ाइल चुनें' : 'Select GSTR-2B JSON/Excel'}</span>
            </button>
            <button
              type="button"
              onClick={() => gstr2aInputRef.current?.click()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" />
              <span>{isHindi ? 'GSTR-2A फ़ाइल चुनें' : 'Select GSTR-2A JSON/Excel'}</span>
            </button>
            <button
              type="button"
              onClick={handleLoadPracticeSampleFromBooks}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-xs font-bold rounded-xl cursor-pointer"
            >
              {isHindi ? 'टेस्ट सिमुलेशन चलाएं' : 'Load Test Simulation'}
            </button>
          </div>
        </div>
      )}

      {/* Filter & Search Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
          {[
            { id: 'ALL', label: `All (${rows.length})`, activeCls: 'bg-slate-700 text-white' },
            { id: 'MATCHED', label: isHindi ? 'सटीक मिलान' : 'Matched', activeCls: 'bg-emerald-600 text-white' },
            { id: 'DISCREPANCY', label: isHindi ? `राशि अंतर (${summary.varianceCount})` : `Tax Variance (${summary.varianceCount})`, activeCls: 'bg-amber-600 text-white' },
            { id: 'EXCESS_IN_BOOKS', label: isHindi ? `बुक्स में ज्यादा (${summary.excessInBooksCount})` : `Excess Books / Not in Portal (${summary.excessInBooksCount})`, activeCls: 'bg-rose-600 text-white' },
            { id: 'MISSING_IN_BOOKS', label: isHindi ? `पोर्टल पर अतिरिक्त (${summary.missingInBooksCount})` : `Missing in Books (${summary.missingInBooksCount})`, activeCls: 'bg-indigo-600 text-white' },
            { id: 'IN_2A_ONLY', label: isHindi ? `केवल 2A में (${summary.in2aOnlyCount})` : `2A Only Not 2B (${summary.in2aOnlyCount})`, activeCls: 'bg-amber-700 text-white' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilterType(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap shrink-0 cursor-pointer ${
                filterType === tab.id ? tab.activeCls : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isHindi ? 'विक्रेता, GSTIN या बिल नंबर खोजें...' : 'Search Vendor, GSTIN or Bill No...'}
            className="w-full bg-slate-950 border border-slate-800 text-white text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5">{isHindi ? 'स्थिति' : 'Match Status'}</th>
                <th className="p-3.5">{isHindi ? 'विक्रेता एवं GSTIN' : 'Vendor & GSTIN'}</th>
                <th className="p-3.5">{isHindi ? 'बिल नं / दिनांक' : 'Invoice No & Date'}</th>
                <th className="p-3.5 text-right">{isHindi ? 'बुक्स (Books Tax)' : 'Books Tax'}</th>
                <th className="p-3.5 text-right">{isHindi ? 'GSTR-2B पोर्टल' : 'GSTR-2B Tax'}</th>
                {mode !== '2B_VS_BOOKS' && (
                  <th className="p-3.5 text-right">{isHindi ? 'GSTR-2A पोर्टल' : 'GSTR-2A Tax'}</th>
                )}
                <th className="p-3.5 text-right">{isHindi ? 'अंतर (Diff)' : 'Tax Diff'}</th>
                <th className="p-3.5">{isHindi ? 'ऑडिट टिप्पणी' : 'Audit Reason'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={mode !== '2B_VS_BOOKS' ? 8 : 7} className="p-8 text-center text-slate-500 text-xs">
                    {isHindi
                      ? 'इस फ़िल्टर के अंतर्गत कोई रिकॉर्ड नहीं मिला।'
                      : 'No reconciliation records match the active filter.'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => {
                  const statusCfg: Record<
                    typeof r.status,
                    { label: string; cls: string }
                  > = {
                    EXACT_MATCH: { label: 'Exact Match', cls: 'text-emerald-400' },
                    TYPO_OR_DATE_DIFF: { label: 'Fuzzy Match', cls: 'text-indigo-300' },
                    AMOUNT_TAX_DIFF: { label: 'Tax Mismatch', cls: 'text-amber-400' },
                    IN_2A_ONLY_NOT_2B: { label: 'In 2A Only', cls: 'text-amber-300' },
                    MISSING_IN_PORTAL: { label: 'Missing in Portal', cls: 'text-rose-400' },
                    MISSING_IN_BOOKS: { label: 'Missing in Books', cls: 'text-indigo-400' },
                  };
                  const st = statusCfg[r.status];
                  return (
                    <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3.5 whitespace-nowrap">
                        <span className={`font-bold flex items-center gap-1.5 ${st.cls}`}>
                          {r.status === 'EXACT_MATCH' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          ) : r.status === 'MISSING_IN_PORTAL' ? (
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{st.label}</span>
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-semibold text-white">{r.vendorName}</div>
                        <div className="text-[11px] font-mono text-slate-400">{r.vendorGstin || 'No GSTIN'}</div>
                      </td>
                      <td className="p-3.5 whitespace-nowrap font-mono">
                        <div className="font-bold text-slate-100">{r.invoiceNumber}</div>
                        <div className="text-[11px] text-slate-400">{r.invoiceDate || '-'}</div>
                      </td>
                      <td className="p-3.5 text-right font-mono tabular-nums text-white">
                        {r.purchaseInvoice ? formatCurrency(r.purchaseInvoice.totalTax, currency) : '-'}
                      </td>
                      <td className="p-3.5 text-right font-mono tabular-nums text-emerald-400">
                        {r.gstr2b ? formatCurrency(r.gstr2b.totalTax, currency) : '-'}
                      </td>
                      {mode !== '2B_VS_BOOKS' && (
                        <td className="p-3.5 text-right font-mono tabular-nums text-indigo-300">
                          {r.gstr2a ? formatCurrency(r.gstr2a.totalTax, currency) : '-'}
                        </td>
                      )}
                      <td
                        className={`p-3.5 text-right font-mono tabular-nums font-bold ${
                          Math.abs(r.taxDiff) <= 2
                            ? 'text-slate-400'
                            : r.taxDiff < 0
                            ? 'text-rose-400'
                            : 'text-amber-300'
                        }`}
                      >
                        {r.taxDiff === 0 ? '₹0.00' : formatCurrency(r.taxDiff, currency)}
                      </td>
                      <td className="p-3.5 text-[11px] text-slate-400 max-w-xs">{r.reasons.join(' · ')}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Non-Filer Follow-up Tool */}
      {vendorFollowUps.length > 0 && hasAnyPortalData && (
        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-rose-300 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                <span>
                  {isHindi
                    ? 'विक्रेता अनुपालन फॉलो-अप (जिनके बिल पोर्टल पर कम हैं)'
                    : 'Vendor GSTR-1 Non-Filer Follow-Up Center (Excess Purchase Bills in Books)'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isHindi
                  ? 'इन विक्रेताओं को 1-क्लिक रिमाइंडर भेजकर उनके GSTR-1 में आपके बिल अपलोड करवाएं ताकि ITC सुरक्षित रहे।'
                  : 'Copy pre-drafted reconciliation notices for suppliers whose bills appear in your Purchase Register but are missing from GST Portal.'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold text-rose-400">
              Total At-Risk ITC: {formatCurrency(summary.excessInBooksTax, currency)}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vendorFollowUps.map((v) => (
              <div
                key={v.vendorGstin}
                className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-start justify-between gap-3"
              >
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-white">{v.vendorName}</div>
                  <div className="text-[11px] font-mono text-slate-400">
                    GSTIN: {v.vendorGstin} · {v.missingCount} bill(s) missing
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Bills: <span className="font-mono text-amber-300">{v.billNumbers.join(', ')}</span>
                  </div>
                  <div className="text-xs font-bold text-rose-400 font-mono tabular-nums">
                    Blocked ITC Risk: {formatCurrency(v.atRiskItc, currency)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyVendorReminder(v)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'रिमाइंडर कॉपी' : 'Copy Notice'}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual Portal Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAddManualEntry}
            className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white">
                {isHindi ? 'मैन्युअल पोर्टल (2A/2B) प्रविष्टि जोड़ें' : 'Add Manual Portal Entry (2A / 2B)'}
              </h3>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Portal Source</label>
                <select
                  value={manualForm.source}
                  onChange={(e) => setManualForm({ ...manualForm, source: e.target.value as 'GSTR2A' | 'GSTR2B' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="GSTR2B">GSTR-2B</option>
                  <option value="GSTR2A">GSTR-2A</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Invoice Date</label>
                <input
                  type="date"
                  value={manualForm.invoiceDate}
                  onChange={(e) => setManualForm({ ...manualForm, invoiceDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-slate-400 mb-1">Vendor Name *</label>
                <input
                  type="text"
                  required
                  value={manualForm.vendorName}
                  onChange={(e) => setManualForm({ ...manualForm, vendorName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                  placeholder="e.g. Bharat Traders"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Vendor GSTIN</label>
                <input
                  type="text"
                  maxLength={15}
                  value={manualForm.vendorGstin}
                  onChange={(e) => setManualForm({ ...manualForm, vendorGstin: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono uppercase"
                  placeholder="23AAAAA0000A1Z5"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Invoice Number *</label>
                <input
                  type="text"
                  required
                  value={manualForm.invoiceNumber}
                  onChange={(e) => setManualForm({ ...manualForm, invoiceNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                  placeholder="INV/2026/01"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Taxable Value</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualForm.taxableValue}
                  onChange={(e) => setManualForm({ ...manualForm, taxableValue: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">IGST</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualForm.igst}
                  onChange={(e) => setManualForm({ ...manualForm, igst: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">CGST</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualForm.cgst}
                  onChange={(e) => setManualForm({ ...manualForm, cgst: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">SGST</label>
                <input
                  type="number"
                  step="0.01"
                  value={manualForm.sgst}
                  onChange={(e) => setManualForm({ ...manualForm, sgst: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                {isHindi ? 'सेव करें' : 'Save Entry'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
