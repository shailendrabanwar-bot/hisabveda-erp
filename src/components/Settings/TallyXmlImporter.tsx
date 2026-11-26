import React, { useState, useRef, useMemo } from 'react';
import {
  FileCode2,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  Users,
  Package,
  Receipt,
  ShoppingBag,
  BookOpen,
  FileText,
  Sparkles,
  Trash2,
  Calendar,
  RotateCcw,
  X,
  GitMerge,
} from 'lucide-react';
import { AppData } from '../../types';
import {
  countTallyImportedRecords,
  decodeTallyXmlBuffer,
  generateSampleTallyXml,
  parseTallyXmlString,
  TallyImportCommitPayload,
  TallyImportOptions,
  TallyLastImportBatch,
  TallyParsedResult,
} from '../../utils/tallyXmlImporter';
import { getFinancialYearRange, getFinancialYearStartForDate } from '../../utils/fiscalYear';
import { findDuplicateLedgersAndParties } from '../../utils/ledgerDeduplicator';
import { getItemClosingStockValue } from '../../utils/accounting';
import { PreImportSnapshot } from '../../utils/storage';

interface TallyXmlImporterProps {
  data: AppData;
  isHindi: boolean;
  onImportTallyData: (payload: TallyImportCommitPayload) => void;
  lastTallyImportBatch?: TallyLastImportBatch | null;
  onUndoLastTallyImport?: () => void;
  onRemoveAllTallyData?: () => void;
  preImportSnapshot?: PreImportSnapshot | null;
  onRestorePreImportSnapshot?: () => void;
  onMergeDuplicateLedgers?: (selectedClusterIds?: string[], balanceStrategy?: 'KEEP_PRIMARY_OR_NONZERO' | 'SUM') => void;
}

type PreviewTab = 'SUMMARY' | 'PARTIES_ACCOUNTS' | 'ITEMS' | 'INVOICES' | 'VOUCHERS';

export const TallyXmlImporter: React.FC<TallyXmlImporterProps> = ({
  data,
  isHindi,
  onImportTallyData,
  lastTallyImportBatch,
  onUndoLastTallyImport,
  onRemoveAllTallyData,
  preImportSnapshot,
  onRestorePreImportSnapshot,
  onMergeDuplicateLedgers,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rawXmlText, setRawXmlText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<PreviewTab>('SUMMARY');
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const [confirmUndoLast, setConfirmUndoLast] = useState<boolean>(false);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState<boolean>(false);
  const [confirmRestoreSnapshot, setConfirmRestoreSnapshot] = useState<boolean>(false);

  const [options, setOptions] = useState<TallyImportOptions>({
    skipDuplicates: true,
    updateCompanyInfo: true,
    includeAccounts: true,
    includeParties: true,
    includeItems: true,
    includeSales: true,
    includePurchases: true,
    includeVouchers: true,
    includeNotes: true,
  });

  const tallyImportedCounts = useMemo(() => countTallyImportedRecords(data), [data]);
  const dupAudit = useMemo(() => findDuplicateLedgersAndParties(data), [data]);

  const parsedResult: TallyParsedResult | null = useMemo(() => {
    if (!rawXmlText.trim()) return null;
    return parseTallyXmlString(rawXmlText, data, options);
  }, [rawXmlText, data, options]);

  const totalToImport = useMemo(() => {
    if (!parsedResult || !parsedResult.success) return 0;
    return (
      parsedResult.accounts.length +
      parsedResult.parties.length +
      parsedResult.items.length +
      parsedResult.invoices.length +
      parsedResult.purchaseInvoices.length +
      parsedResult.vouchers.length +
      parsedResult.debitCreditNotes.length
    );
  }, [parsedResult]);

  const detectedFyHint = useMemo(() => {
    if (!parsedResult?.stats.minDate) return null;
    const minFy = getFinancialYearRange(getFinancialYearStartForDate(parsedResult.stats.minDate));
    const maxFy = parsedResult.stats.maxDate
      ? getFinancialYearRange(getFinancialYearStartForDate(parsedResult.stats.maxDate))
      : minFy;
    return minFy.label === maxFy.label ? minFy.label : `${minFy.label} – ${maxFy.label}`;
  }, [parsedResult]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setImportSuccessMsg(null);
    setPreviewTab('SUMMARY');

    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result;
      if (result instanceof ArrayBuffer) {
        setRawXmlText(decodeTallyXmlBuffer(result));
      } else if (typeof result === 'string') {
        setRawXmlText(result);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadSampleXml = () => {
    const xml = generateSampleTallyXml();
    const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ERP_Sample_Masters_DayBook.xml';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleLoadSampleInPreview = () => {
    setFileName('ERP_Sample_Masters_DayBook.xml (Sample Preview)');
    setImportSuccessMsg(null);
    setPreviewTab('SUMMARY');
    setRawXmlText(generateSampleTallyXml());
  };

  const handleClear = () => {
    setRawXmlText('');
    setFileName('');
    setImportSuccessMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasCompanyUpdate = Boolean(
    options.updateCompanyInfo &&
      parsedResult?.companyInfo &&
      Object.keys(parsedResult.companyInfo).length > 0
  );

  const totalUpdatesCount =
    (parsedResult?.accountOpeningUpdates?.length || 0) +
    (parsedResult?.itemStockUpdates?.length || 0) +
    (parsedResult?.partyUpdates?.length || 0);

  const previewInventoryValue = useMemo(() => {
    if (!parsedResult) return 0;
    return parsedResult.items.reduce(
      (sum, it) => sum + getItemClosingStockValue(it),
      0
    );
  }, [parsedResult]);

  const previewOpeningStockValue = useMemo(() => {
    if (!parsedResult) return 0;
    const accInvUpd = (parsedResult.accountOpeningUpdates || []).find((u) => u.id === 'acc_inventory');
    if (accInvUpd && accInvUpd.openingBalance > 0) return accInvUpd.openingBalance;
    return parsedResult.items.reduce(
      (sum, it) => sum + (Number(it.openingStockValue) || (Number(it.openingStock) || 0) * (Number(it.purchasePrice) || 0)),
      0
    );
  }, [parsedResult]);

  const previewSalesDiscount = useMemo(() => {
    if (!parsedResult) return 0;
    return parsedResult.invoices.reduce(
      (sum, inv) => sum + (Number(inv.totalDiscount) || 0),
      0
    );
  }, [parsedResult]);

  const handleConfirmImport = () => {
    if (
      !parsedResult ||
      !parsedResult.success ||
      (totalToImport === 0 && !hasCompanyUpdate && totalUpdatesCount === 0)
    )
      return;

    onImportTallyData({
      fileName: fileName || 'Accounting_XML_Import.xml',
      ...(options.updateCompanyInfo && parsedResult.companyInfo
        ? { companyInfo: parsedResult.companyInfo }
        : {}),
      ...(parsedResult.accountGroups?.length ? { accountGroups: parsedResult.accountGroups } : {}),
      accounts: parsedResult.accounts,
      parties: parsedResult.parties,
      items: parsedResult.items,
      invoices: parsedResult.invoices,
      purchaseInvoices: parsedResult.purchaseInvoices,
      vouchers: parsedResult.vouchers,
      debitCreditNotes: parsedResult.debitCreditNotes,
      ...(parsedResult.accountOpeningUpdates?.length
        ? { accountOpeningUpdates: parsedResult.accountOpeningUpdates }
        : {}),
      ...(parsedResult.itemStockUpdates?.length
        ? { itemStockUpdates: parsedResult.itemStockUpdates }
        : {}),
      ...(parsedResult.partyUpdates?.length
        ? { partyUpdates: parsedResult.partyUpdates }
        : {}),
      minDate: parsedResult.stats.minDate,
      maxDate: parsedResult.stats.maxDate,
    });

    setImportSuccessMsg(
      isHindi
        ? `🎉 Accounting XML डेटा सफलतापूर्वक इम्पोर्ट हो गया! (${parsedResult.parties.length} पार्टी, ${parsedResult.accounts.length} लेज़र, ${parsedResult.items.length} स्टॉक आइटम, ${parsedResult.invoices.length} सेल्स बिल, ${parsedResult.purchaseInvoices.length} परचेज बिल, ${parsedResult.vouchers.length} वाउचर)`
        : `🎉 Accounting XML imported successfully! (${parsedResult.parties.length} Parties, ${parsedResult.accounts.length} Ledgers, ${parsedResult.items.length} Items, ${parsedResult.invoices.length} Sales, ${parsedResult.purchaseInvoices.length} Purchases, ${parsedResult.vouchers.length} Vouchers)`
    );
    setRawXmlText('');
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const lastBatchTotal = lastTallyImportBatch
    ? lastTallyImportBatch.accountIds.length +
      lastTallyImportBatch.partyIds.length +
      lastTallyImportBatch.itemIds.length +
      lastTallyImportBatch.invoiceIds.length +
      lastTallyImportBatch.purchaseIds.length +
      lastTallyImportBatch.voucherIds.length +
      lastTallyImportBatch.noteIds.length
    : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <FileCode2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-white flex flex-wrap items-center gap-2">
              <span>
                {isHindi
                  ? 'Accounting ERP XML डेटा इम्पोर्टर'
                  : 'Accounting ERP XML Data Importer'}
              </span>
              <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                ERP XML Migration Ready
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isHindi
                ? 'अकाउंटिंग सॉफ़्टवेयर से एक्सपोर्ट की गई XML फ़ाइल (Masters + Day Book) से लेज़र, पार्टी GSTIN, स्टॉक आइटम, सेल्स/परचेज बिल और वाउचर 1-क्लिक में इम्पोर्ट करें।'
                : 'One-click migration of Ledgers, Parties (with GSTIN & Opening Balance), Stock Items, Sales/Purchase Bills & Vouchers directly from Accounting XML exports.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowGuide((v) => !v)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
            <span>{isHindi ? 'XML कैसे एक्सपोर्ट करें?' : 'How to Export XML'}</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleDownloadSampleXml}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isHindi ? 'सैंपल XML डाउनलोड' : 'Sample XML'}</span>
          </button>

          <button
            type="button"
            onClick={handleLoadSampleInPreview}
            className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold px-3 py-2 rounded-xl transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isHindi ? 'सैंपल प्रीव्यू टेस्ट करें' : 'Test Sample Import'}</span>
          </button>
        </div>
      </div>

      {/* Smart Duplicate Ledger Check Banner */}
      {onMergeDuplicateLedgers && dupAudit.totalDuplicateRecords > 0 && (
        <div className="bg-amber-950/35 border border-amber-500/40 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-extrabold text-amber-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {isHindi
                  ? `स्मार्ट डुप्लीकेट जाँच: ${dupAudit.totalDuplicateRecords} डुप्लीकेट लेज़र/पार्टी मिलीं!`
                  : `Smart Duplicate Inspector: ${dupAudit.totalDuplicateRecords} duplicate ledger/party entries detected!`}
              </span>
            </p>
            <p className="text-[11px] text-slate-300">
              {isHindi
                ? 'मल्टी-ईयर (2022–2027) XML इम्पोर्ट में एक जैसे नाम वाले लेज़र/पार्टियाँ मर्ज करके सभी बिल और वाउचर स्वतः जोड़ें।'
                : 'Merge matching ledger & party names across multi-year XML imports and auto-link all their vouchers and invoices seamlessly.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onMergeDuplicateLedgers(undefined, 'KEEP_PRIMARY_OR_NONZERO')}
            className="shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold px-4 py-2 rounded-xl shadow transition cursor-pointer"
          >
            <GitMerge className="w-4 h-4" />
            <span>{isHindi ? 'ऑटो-जाँच व मर्ज करें' : 'Auto-Check & Fix Duplicates'}</span>
          </button>
        </div>
      )}

      {/* Existing Imported XML Data Removal / Pre-Import Snapshot Undo Panel */}
      {(lastBatchTotal > 0 || tallyImportedCounts.total > 0 || Boolean(preImportSnapshot && onRestorePreImportSnapshot)) && (
        <div className="bg-rose-950/25 border border-rose-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-extrabold text-rose-200 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>
                  {isHindi
                    ? 'गलत XML इम्पोर्ट हटाएं / स्नैपशॉट रीस्टोर करें (Undo or Restore Snapshot)'
                    : 'Rollback XML Import or Restore Pre-Import Snapshot'}
                </span>
              </p>
              <p className="text-[11px] text-slate-300">
                {tallyImportedCounts.total > 0
                  ? (isHindi
                      ? `वर्तमान कंपनी में Accounting XML से आए कुल ${tallyImportedCounts.total} रिकॉर्ड मौजूद हैं (${tallyImportedCounts.parties} पार्टी, ${tallyImportedCounts.accounts} लेज़र, ${tallyImportedCounts.items} आइटम, ${tallyImportedCounts.invoices} सेल्स, ${tallyImportedCounts.purchases} परचेज, ${tallyImportedCounts.vouchers} वाउचर)।`
                      : `Found ${tallyImportedCounts.total} XML-imported record(s) in this company (${tallyImportedCounts.parties} Parties, ${tallyImportedCounts.accounts} Ledgers, ${tallyImportedCounts.items} Items, ${tallyImportedCounts.invoices} Sales, ${tallyImportedCounts.purchases} Purchases, ${tallyImportedCounts.vouchers} Vouchers).`)
                  : (isHindi
                      ? `इम्पोर्ट से पहले का पूरा बैकअप स्नैपशॉट उपलब्ध है: ${preImportSnapshot?.label || 'Pre-Import Snapshot'}`
                      : `Full pre-import restore point ready: ${preImportSnapshot?.label || 'Pre-Import Snapshot'}`)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {onRestorePreImportSnapshot && preImportSnapshot && !confirmRestoreSnapshot && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmUndoLast(false);
                    setConfirmRemoveAll(false);
                    setConfirmRestoreSnapshot(true);
                  }}
                  className="flex items-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/35 border border-indigo-400/50 text-indigo-200 text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isHindi ? 'इम्पोर्ट-पूर्व स्नैपशॉट रीस्टोर (1-क्लिक)' : 'Restore Pre-Import Snapshot'}
                  </span>
                </button>
              )}

              {onUndoLastTallyImport && lastBatchTotal > 0 && !confirmUndoLast && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemoveAll(false);
                    setConfirmRestoreSnapshot(false);
                    setConfirmUndoLast(true);
                  }}
                  className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold px-3.5 py-2 rounded-xl transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>
                    {isHindi
                      ? `पिछला इम्पोर्ट हटाएं (${lastBatchTotal})`
                      : `Undo Last Import (${lastBatchTotal})`}
                  </span>
                </button>
              )}

              {onRemoveAllTallyData && tallyImportedCounts.total > 0 && !confirmRemoveAll && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmUndoLast(false);
                    setConfirmRestoreSnapshot(false);
                    setConfirmRemoveAll(true);
                  }}
                  className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold px-3.5 py-2 rounded-xl shadow transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {isHindi
                      ? `सभी XML डेटा हटाएं (${tallyImportedCounts.total})`
                      : `Remove All Imported XML (${tallyImportedCounts.total})`}
                  </span>
                </button>
              )}
            </div>
          </div>

          {confirmRestoreSnapshot && onRestorePreImportSnapshot && preImportSnapshot && (
            <div className="bg-indigo-950/60 border border-indigo-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-indigo-200">
                {isHindi
                  ? `इम्पोर्ट से पहले की स्थिति (${preImportSnapshot.label} • ${new Date(preImportSnapshot.createdAt).toLocaleString()}) पर वापस लौटें?`
                  : `Restore exact workspace state from before import (${preImportSnapshot.label} • ${new Date(preImportSnapshot.createdAt).toLocaleString()})?`}
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRestoreSnapshot(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRestoreSnapshot(false);
                    onRestorePreImportSnapshot();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold cursor-pointer"
                >
                  {isHindi ? 'हाँ, स्नैपशॉट रीस्टोर करें' : 'Yes, Restore Snapshot'}
                </button>
              </div>
            </div>
          )}

          {confirmUndoLast && onUndoLastTallyImport && lastTallyImportBatch && (
            <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-amber-200">
                {isHindi
                  ? `फ़ाइल "${lastTallyImportBatch.fileName}" से इम्पोर्ट हुए ${lastBatchTotal} रिकॉर्ड तुरंत हटाए जाएँ?`
                  : `Remove all ${lastBatchTotal} records imported from "${lastTallyImportBatch.fileName}"?`}
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmUndoLast(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmUndoLast(false);
                    onUndoLastTallyImport();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold cursor-pointer"
                >
                  {isHindi ? 'हाँ, पिछला इम्पोर्ट हटाएं' : 'Yes, Undo Import'}
                </button>
              </div>
            </div>
          )}

          {confirmRemoveAll && onRemoveAllTallyData && (
            <div className="bg-rose-950/70 border border-rose-500/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-rose-200">
                {isHindi
                  ? `सावधान: Accounting XML से इम्पोर्ट किए गए सभी ${tallyImportedCounts.total} रिकॉर्ड इस कंपनी से हट जाएँगे (आपके हाथ से बनाए गए बिल सुरक्षित रहेंगे)। जारी रखें?`
                  : `Remove all ${tallyImportedCounts.total} XML-imported records from this company (your manual entries stay untouched)?`}
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveAll(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemoveAll(false);
                    onRemoveAllTallyData();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer"
                >
                  {isHindi ? 'हाँ, सभी XML डेटा हटाएं' : 'Yes, Delete All Imported XML'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step-by-step ERP XML Export Guide */}
      {showGuide && (
        <div className="bg-slate-950/80 border border-sky-500/30 rounded-xl p-4 text-xs space-y-2">
          <p className="font-bold text-sky-300">
            {isHindi
              ? 'अपने पिछले अकाउंटिंग सॉफ़्टवेयर से XML फ़ाइल एक्सपोर्ट करने के आसान चरण:'
              : 'Quick Steps to Export XML from Your Legacy Accounting ERP:'}
          </p>
          <ol className="list-decimal pl-5 space-y-1.5 text-slate-300">
            <li>
              <strong>{isHindi ? 'मास्टर्स (लेज़र व स्टॉक) के लिए:' : 'For Masters (Ledgers, Parties & Stock Items):'}</strong>{' '}
              {isHindi
                ? 'Gateway Menu → Display More Reports → List of Accounts → Alt+E (Export) दबाएँ → Configure में File Format = XML (Data Interchange) चुनें और Send करें।'
                : 'Gateway Menu → Display More Reports → List of Accounts → Press Alt+E (Export) → Configure File Format: XML (Data Interchange) → Send.'}
            </li>
            <li>
              <strong>{isHindi ? 'सभी वाउचर और बिल (Day Book) के लिए:' : 'For All Transactions (Day Book):'}</strong>{' '}
              {isHindi
                ? 'Gateway Menu → Display More Reports → Day Book → Alt+F2 से पूरी तारीख (जैसे 01-04-2025 से 31-03-2026) चुनें → Alt+E (Export) → XML फॉर्मेट में सेव करें।'
                : 'Gateway Menu → Display More Reports → Day Book → Press Alt+F2 to set full FY period → Press Alt+E (Export) → Choose XML format & save.'}
            </li>
            <li>
              <strong>{isHindi ? 'यहाँ अपलोड करें:' : 'Upload Here:'}</strong>{' '}
              {isHindi
                ? 'पहले List of Accounts.xml और फिर DayBook.xml अपलोड करें। डुप्लीकेट प्रविष्टियाँ स्वतः स्किप हो जाएँगी।'
                : 'Upload Masters XML first, then DayBook XML. Duplicate ledgers/vouchers are automatically skipped safely.'}
            </li>
          </ol>
        </div>
      )}

      {/* Success Banner */}
      {importSuccessMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start justify-between gap-3 text-emerald-300 text-xs font-semibold">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{importSuccessMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportSuccessMsg(null)}
            className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* File Dropzone + Options */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7">
          <div className="border-2 border-dashed border-slate-700 hover:border-amber-500/70 bg-slate-950/60 rounded-2xl p-6 text-center transition h-full flex flex-col items-center justify-center relative">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={handleFileChange}
              id="tally-xml-upload-input"
              className="hidden"
            />
            <label
              htmlFor="tally-xml-upload-input"
              className="cursor-pointer flex flex-col items-center justify-center space-y-2.5 w-full"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-100">
                  {fileName ? (
                    <span className="text-amber-300 inline-flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      {fileName}
                    </span>
                  ) : (
                    <span>
                      {isHindi
                        ? 'Accounting ERP XML फ़ाइल (.xml) चुनने के लिए यहाँ क्लिक करें'
                        : 'Click to upload Accounting ERP XML file (.xml)'}
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-slate-500">
                  {isHindi
                    ? 'UTF-8 और UTF-16LE दोनों XML फॉर्मेट स्वतः समर्थित हैं (Masters & DayBook)'
                    : 'Supports both UTF-8 & UTF-16LE Accounting XML exports (Masters & DayBook)'}
                </p>
              </div>
            </label>
            {fileName && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <label
                  htmlFor="tally-xml-upload-input"
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer transition"
                >
                  {isHindi ? 'दूसरी XML फ़ाइल चुनें' : 'Change XML File'}
                </label>
                <button
                  type="button"
                  onClick={handleClear}
                  className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'गलत फ़ाइल हटाएँ' : 'Remove XML File'}</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Import Options & Toggles */}
        <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
          <p className="font-bold text-slate-200 border-b border-slate-800 pb-2">
            {isHindi ? 'इम्पोर्ट सेटिंग्स व श्रेणियाँ (Import Filters)' : 'Import Filters & Deduplication'}
          </p>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {[
              { key: 'includeParties', labelHi: 'पार्टी (Customer/Vendor)', labelEn: 'Parties & GSTIN' },
              { key: 'includeAccounts', labelHi: 'अकाउंट लेज़र', labelEn: 'Ledger Accounts' },
              { key: 'includeItems', labelHi: 'स्टॉक आइटम्स', labelEn: 'Stock Items' },
              { key: 'includeSales', labelHi: 'सेल्स इनवॉइस', labelEn: 'Sales Invoices' },
              { key: 'includePurchases', labelHi: 'परचेज बिल', labelEn: 'Purchase Bills' },
              { key: 'includeVouchers', labelHi: 'पेमेंट/रसीद/कॉन्ट्रा/जर्नल', labelEn: 'Vouchers' },
              { key: 'includeNotes', labelHi: 'डेबिट/क्रेडिट नोट', labelEn: 'Debit/Credit Notes' },
              { key: 'updateCompanyInfo', labelHi: 'कंपनी प्रोफ़ाइल अपडेट', labelEn: 'Company Profile' },
            ].map((item) => {
              const k = item.key as keyof TallyImportOptions;
              return (
                <label
                  key={item.key}
                  className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 cursor-pointer hover:border-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(options[k])}
                    onChange={(e) => setOptions((prev) => ({ ...prev, [k]: e.target.checked }))}
                    className="accent-amber-500 rounded cursor-pointer"
                  />
                  <span className="text-slate-300 truncate">{isHindi ? item.labelHi : item.labelEn}</span>
                </label>
              );
            })}
          </div>

          <label className="flex items-center gap-2 bg-indigo-950/40 border border-indigo-500/30 rounded-xl px-3 py-2 cursor-pointer text-[11px] text-indigo-200 font-semibold">
            <input
              type="checkbox"
              checked={options.skipDuplicates}
              onChange={(e) => setOptions((prev) => ({ ...prev, skipDuplicates: e.target.checked }))}
              className="accent-indigo-500 rounded cursor-pointer"
            />
            <span>
              {isHindi
                ? 'मौजूदा नाम / बिल नंबर के डुप्लीकेट स्वतः स्किप करें (सुरक्षित)'
                : 'Auto-skip duplicates matching existing Name / Invoice / Voucher No.'}
            </span>
          </label>
        </div>
      </div>

      {/* Parsing Error */}
      {parsedResult && !parsedResult.success && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-300 text-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{isHindi ? 'XML फ़ाइल पढ़ने में त्रुटि' : 'XML Parse Error'}</p>
              <p className="text-rose-200/80 mt-0.5">{parsedResult.error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="shrink-0 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-2 rounded-xl cursor-pointer transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isHindi ? 'गलत फ़ाइल हटाएँ' : 'Remove Wrong File'}</span>
          </button>
        </div>
      )}

      {/* Parsed Results Preview */}
      {parsedResult && parsedResult.success && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              {
                label: isHindi ? 'पार्टी मास्टर्स' : 'Parties',
                count: parsedResult.parties.length,
                dup: parsedResult.stats.duplicateParties,
                icon: Users,
                color: 'text-emerald-400',
              },
              {
                label: isHindi ? 'लेज़र खाते' : 'Accounts',
                count: parsedResult.accounts.length,
                dup: parsedResult.stats.duplicateAccounts,
                icon: Layers,
                color: 'text-indigo-400',
              },
              {
                label: isHindi ? 'स्टॉक आइटम्स' : 'Stock Items',
                count: parsedResult.items.length,
                dup: parsedResult.stats.duplicateItems,
                icon: Package,
                color: 'text-purple-400',
              },
              {
                label: isHindi ? 'सेल्स बिल' : 'Sales Bills',
                count: parsedResult.invoices.length,
                dup: parsedResult.stats.duplicateInvoices,
                icon: Receipt,
                color: 'text-sky-400',
              },
              {
                label: isHindi ? 'परचेज बिल' : 'Purchase Bills',
                count: parsedResult.purchaseInvoices.length,
                dup: parsedResult.stats.duplicatePurchases,
                icon: ShoppingBag,
                color: 'text-amber-400',
              },
              {
                label: isHindi ? 'वाउचर व नोट्स' : 'Vouchers / Notes',
                count: parsedResult.vouchers.length + parsedResult.debitCreditNotes.length,
                dup: parsedResult.stats.duplicateVouchers + parsedResult.stats.duplicateNotes,
                icon: BookOpen,
                color: 'text-teal-400',
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-1"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{card.label}</span>
                    <Icon className={`w-3.5 h-3.5 ${card.color}`} />
                  </div>
                  <p className="text-xl font-extrabold text-white tabular-nums">{card.count}</p>
                  {card.dup > 0 && (
                    <p className="text-[10px] text-slate-500 tabular-nums">
                      {card.dup} {isHindi ? 'डुप्लीकेट स्किप' : 'duplicates skipped'}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* FY Notice + Multi-Year Auto Carry-Forward Assurance */}
          {detectedFyHint && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-200">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {isHindi
                    ? `इस XML में ${parsedResult.stats.minDate} से ${parsedResult.stats.maxDate} (${detectedFyHint}) तक के ट्रांज़ैक्शन हैं।`
                    : `XML contains transactions from ${parsedResult.stats.minDate} to ${parsedResult.stats.maxDate} (${detectedFyHint}).`}
                </span>
              </div>
              <span className="text-[11px] text-emerald-300 font-semibold">
                {isHindi
                  ? '✓ यदि इस XML में Opening Balance नहीं भी है, तो पिछले वर्षों (2022–26) का क्लोज़िंग बैलेंस स्वतः कैरी फॉरवर्ड हो जाएगा।'
                  : '✓ Multi-Year Carry-Forward Ready: Prior FY closing balances automatically carry forward if this XML has no Opening Balances.'}
              </span>
            </div>
          )}

          {parsedResult.warnings.length > 0 && (
            <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 space-y-1 max-h-28 overflow-y-auto">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span>
                  {isHindi ? 'पार्सिंग नोट्स / चेतावनियाँ:' : 'Import Warnings / Mapping Notes:'} ({parsedResult.warnings.length})
                </span>
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-slate-300">
                {parsedResult.warnings.slice(0, 12).map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Navigation Tabs & Confirm / Discard Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'SUMMARY', label: isHindi ? 'सारांश' : 'Summary' },
                {
                  id: 'PARTIES_ACCOUNTS',
                  label: `${isHindi ? 'पार्टी व लेज़र' : 'Parties & Ledgers'} (${parsedResult.parties.length + parsedResult.accounts.length})`,
                },
                { id: 'ITEMS', label: `${isHindi ? 'स्टॉक आइटम्स' : 'Items'} (${parsedResult.items.length})` },
                {
                  id: 'INVOICES',
                  label: `${isHindi ? 'सेल्स व परचेज' : 'Sales & Purchase'} (${parsedResult.invoices.length + parsedResult.purchaseInvoices.length})`,
                },
                {
                  id: 'VOUCHERS',
                  label: `${isHindi ? 'वाउचर व नोट्स' : 'Vouchers & Notes'} (${parsedResult.vouchers.length + parsedResult.debitCreditNotes.length})`,
                },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setPreviewTab(t.id as PreviewTab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    previewTab === t.id
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-xs font-bold cursor-pointer transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isHindi ? 'फ़ाइल हटाएं (Cancel)' : 'Remove / Cancel'}</span>
              </button>

              <button
                type="button"
                disabled={totalToImport === 0 && !hasCompanyUpdate && totalUpdatesCount === 0}
                onClick={handleConfirmImport}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-extrabold transition shadow-lg ${
                  totalToImport > 0 || hasCompanyUpdate || totalUpdatesCount > 0
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isHindi
                    ? `HisabVeda में इम्पोर्ट करें (${totalToImport} रिकॉर्ड)`
                    : `Confirm & Import (${totalToImport} Records)`}
                </span>
              </button>
            </div>
          </div>

          {/* Detailed Preview Tables */}
          {previewTab === 'SUMMARY' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="font-bold text-white mb-1.5">
                  {isHindi ? 'XML फ़ाइल संरचना विवरण' : 'XML Structure Breakdown'}
                </p>
                <ul className="space-y-1 text-[11px] font-mono">
                  <li>Groups Found: <strong className="text-slate-100">{parsedResult.stats.rawGroups}</strong></li>
                  <li>Ledgers Found: <strong className="text-slate-100">{parsedResult.stats.rawLedgers}</strong></li>
                  <li>Stock Items Found: <strong className="text-slate-100">{parsedResult.stats.rawStockItems}</strong></li>
                  <li>Vouchers Found: <strong className="text-slate-100">{parsedResult.stats.rawVouchers}</strong></li>
                  <li>Cancelled / Optional Skipped: <strong className="text-amber-400">{parsedResult.stats.skippedCancelledOrOptional}</strong></li>
                  {previewOpeningStockValue > 0 && (
                    <li>
                      Opening Stock Value:{' '}
                      <strong className="text-sky-300 tabular-nums">
                        ₹{previewOpeningStockValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </li>
                  )}
                  {previewInventoryValue > 0 && (
                    <li>
                      Closing Stock Value:{' '}
                      <strong className="text-emerald-300 tabular-nums">
                        ₹{previewInventoryValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </li>
                  )}
                  {previewSalesDiscount > 0 && (
                    <li>
                      Customer Discounts:{' '}
                      <strong className="text-emerald-300 tabular-nums">
                        ₹{Math.round(previewSalesDiscount).toLocaleString('en-IN')}
                      </strong>
                    </li>
                  )}
                  {totalUpdatesCount > 0 && (
                    <li>
                      Existing Stock/Ledger Updates:{' '}
                      <strong className="text-sky-300 tabular-nums">{totalUpdatesCount}</strong>
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <p className="font-bold text-white mb-1.5 flex items-center justify-between gap-2">
                  <span>{isHindi ? 'कंपनी पहचान (XML Header)' : 'Detected Company Profile'}</span>
                  {parsedResult.companyInfo && Object.keys(parsedResult.companyInfo).length > 0 && (
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      options.updateCompanyInfo
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}>
                      {options.updateCompanyInfo
                        ? (isHindi ? 'प्रोफ़ाइल ऑटो-अपडेट चालू' : 'Will Auto-Update Company')
                        : (isHindi ? 'अपडेट बंद' : 'Update Off')}
                    </span>
                  )}
                </p>
                {parsedResult.companyInfo && Object.keys(parsedResult.companyInfo).length > 0 ? (
                  <ul className="space-y-1 text-[11px]">
                    <li>Name: <strong className="text-emerald-300">{parsedResult.companyInfo.name || data.company.name}</strong></li>
                    <li>GSTIN: <strong className="font-mono text-indigo-300">{parsedResult.companyInfo.gstin || 'Not in XML'}</strong></li>
                    <li>PAN: <strong className="font-mono text-amber-300">{parsedResult.companyInfo.pan || 'Not in XML'}</strong></li>
                    <li>State: <strong>{parsedResult.companyInfo.state || 'N/A'}{parsedResult.companyInfo.stateCode ? ` (${parsedResult.companyInfo.stateCode})` : ''}</strong></li>
                    {parsedResult.companyInfo.phone && (
                      <li>Phone: <strong className="font-mono">{parsedResult.companyInfo.phone}</strong></li>
                    )}
                    {parsedResult.companyInfo.email && (
                      <li>Email: <strong className="font-mono">{parsedResult.companyInfo.email}</strong></li>
                    )}
                    {parsedResult.companyInfo.address && (
                      <li>Address: <strong className="text-slate-200">{parsedResult.companyInfo.address}</strong></li>
                    )}
                  </ul>
                ) : (
                  <p className="text-[11px] text-slate-500">
                    {isHindi
                      ? 'इस XML फ़ाइल में <COMPANY> या <SVCURRENTCOMPANY> विवरण नहीं मिला (केवल Master/DayBook बिना कंपनी टैग) — सभी डेटा सक्रिय कंपनी में सुरक्षित इम्पोर्ट होगा।'
                      : 'No <COMPANY> / <SVCURRENTCOMPANY> metadata found in this XML — all records will import cleanly into your active company.'}
                  </p>
                )}
              </div>
            </div>
          )}

          {previewTab === 'PARTIES_ACCOUNTS' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                    <th className="p-2.5">Kind</th>
                    <th className="p-2.5">Name</th>
                    <th className="p-2.5">Group / Type</th>
                    <th className="p-2.5">GSTIN</th>
                    <th className="p-2.5 text-right">Opening Bal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {parsedResult.parties.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">
                          PARTY
                        </span>
                      </td>
                      <td className="p-2.5 font-semibold text-white">{p.name}</td>
                      <td className="p-2.5 text-slate-300">{p.type}</td>
                      <td className="p-2.5 font-mono text-indigo-300">{p.gstin || '-'}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-slate-200">
                        ₹{p.openingBalance.toLocaleString('en-IN')} {p.balanceType}
                      </td>
                    </tr>
                  ))}
                  {parsedResult.accounts.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-bold">
                          LEDGER
                        </span>
                      </td>
                      <td className="p-2.5 font-semibold text-white">{a.name}</td>
                      <td className="p-2.5 text-slate-300">
                        {a.category} / {a.mainGroup || a.subCategory}
                      </td>
                      <td className="p-2.5 font-mono text-slate-500">{a.code}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-slate-200">
                        ₹{a.openingBalance.toLocaleString('en-IN')} {a.balanceType}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previewTab === 'ITEMS' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                    <th className="p-2.5">Item Name</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">HSN</th>
                    <th className="p-2.5">Unit</th>
                    <th className="p-2.5 text-right">GST %</th>
                    <th className="p-2.5 text-right">Stock Qty</th>
                    <th className="p-2.5 text-right">Cost Rate</th>
                    <th className="p-2.5 text-right">Stock Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {parsedResult.items.map((it) => {
                    const stockVal = Math.round(getItemClosingStockValue(it) * 100) / 100;
                    return (
                      <tr key={it.id} className="hover:bg-slate-900/60">
                        <td className="p-2.5 font-semibold text-white">{it.name}</td>
                        <td className="p-2.5 text-slate-400">{it.category}</td>
                        <td className="p-2.5 font-mono text-indigo-300">{it.hsnSacCode}</td>
                        <td className="p-2.5">{it.unit}</td>
                        <td className="p-2.5 text-right font-mono tabular-nums">{it.taxRate}%</td>
                        <td className="p-2.5 text-right font-mono tabular-nums text-emerald-300">{it.currentStock}</td>
                        <td className="p-2.5 text-right font-mono tabular-nums">₹{it.purchasePrice.toLocaleString('en-IN')}</td>
                        <td className="p-2.5 text-right font-mono tabular-nums font-semibold text-amber-300">
                          ₹{stockVal.toLocaleString('en-IN')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {previewTab === 'INVOICES' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Invoice / Bill No</th>
                    <th className="p-2.5">Party</th>
                    <th className="p-2.5 text-right">Taxable</th>
                    <th className="p-2.5 text-right">Discount</th>
                    <th className="p-2.5 text-right">GST Tax</th>
                    <th className="p-2.5 text-right">Grand Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {parsedResult.invoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold">SALES</span>
                      </td>
                      <td className="p-2.5 font-mono tabular-nums">{inv.date}</td>
                      <td className="p-2.5 font-mono text-white font-bold">{inv.invoiceNumber}</td>
                      <td className="p-2.5 text-slate-200">{inv.partyName}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">₹{inv.subtotal.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-emerald-400">
                        {inv.totalDiscount > 0 ? `-₹${inv.totalDiscount.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-amber-300">₹{inv.totalTax.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-emerald-300">₹{inv.grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                  {parsedResult.purchaseInvoices.map((pur) => (
                    <tr key={pur.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">PURCHASE</span>
                      </td>
                      <td className="p-2.5 font-mono tabular-nums">{pur.date}</td>
                      <td className="p-2.5 font-mono text-white font-bold">{pur.supplierInvoiceNo}</td>
                      <td className="p-2.5 text-slate-200">{pur.partyName}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">₹{pur.subtotal.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-emerald-400">
                        {pur.totalDiscount && pur.totalDiscount > 0 ? `-₹${pur.totalDiscount.toLocaleString('en-IN')}` : '-'}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums text-amber-300">₹{pur.totalTax.toLocaleString('en-IN')}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-emerald-300">₹{pur.grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {previewTab === 'VOUCHERS' && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">Voucher No</th>
                    <th className="p-2.5">Ledgers / Particulars</th>
                    <th className="p-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {parsedResult.vouchers.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 font-bold">{v.type}</span>
                      </td>
                      <td className="p-2.5 font-mono tabular-nums">{v.date}</td>
                      <td className="p-2.5 font-mono text-white font-bold">{v.voucherNumber}</td>
                      <td className="p-2.5 text-slate-300 truncate max-w-xs">
                        {v.entries.map((e) => `${e.accountName} (${e.debit > 0 ? 'Dr' : 'Cr'})`).join(' ↔ ')}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-white">
                        ₹{v.totalAmount.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                  {parsedResult.debitCreditNotes.map((n) => (
                    <tr key={n.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-bold">{n.type}</span>
                      </td>
                      <td className="p-2.5 font-mono tabular-nums">{n.date}</td>
                      <td className="p-2.5 font-mono text-white font-bold">{n.noteNumber}</td>
                      <td className="p-2.5 text-slate-300">{n.partyName}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-white">
                        ₹{n.grandTotal.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
