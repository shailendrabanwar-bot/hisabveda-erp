import React, { useState, useRef, useMemo } from 'react';
import {
  Globe2,
  UploadCloud,
  Download,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RotateCcw,
  FileSpreadsheet,
  Users,
  Package,
  Layers,
  Receipt,
  ShoppingBag,
  BookOpen,
  SlidersHorizontal,
  X,
  Calendar,
} from 'lucide-react';
import { AppData } from '../../types';
import {
  autoSuggestColumnMapping,
  buildExternalImportPreview,
  countExternalImportedRecords,
  downloadExternalSampleTemplateXlsx,
  ENTITY_FIELD_DEFS,
  ExternalImportCommitPayload,
  ExternalImportEntityType,
  ExternalLastImportBatch,
  ExternalParsedResult,
  ExternalSoftwarePreset,
  ExternalWorkbookData,
  parseExternalSpreadsheetBuffer,
  SOFTWARE_PRESETS,
} from '../../utils/multiSoftwareImporter';
import { PreImportSnapshot } from '../../utils/storage';

interface UniversalSoftwareImporterProps {
  data: AppData;
  isHindi: boolean;
  onImportExternalData: (payload: ExternalImportCommitPayload) => void;
  lastExternalImportBatch?: ExternalLastImportBatch | null;
  onUndoLastExternalImport?: () => void;
  onRemoveAllExternalData?: () => void;
  preImportSnapshot?: PreImportSnapshot | null;
  onRestorePreImportSnapshot?: () => void;
}

const ENTITY_OPTIONS: Array<{
  id: ExternalImportEntityType;
  labelEn: string;
  labelHi: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'PARTIES', labelEn: 'Parties (Customers/Vendors)', labelHi: 'पार्टी (ग्राहक / विक्रेता)', icon: Users },
  { id: 'ITEMS', labelEn: 'Stock Items & Inventory', labelHi: 'स्टॉक आइटम्स व रेट', icon: Package },
  { id: 'ACCOUNTS', labelEn: 'Ledgers / Accounts', labelHi: 'अकाउंट लेज़र खाते', icon: Layers },
  { id: 'SALES', labelEn: 'Sales Invoices / Bills', labelHi: 'सेल्स इनवॉइस / बिल', icon: Receipt },
  { id: 'PURCHASES', labelEn: 'Purchase Bills / Inward', labelHi: 'परचेज बिल / खरीद', icon: ShoppingBag },
  { id: 'VOUCHERS', labelEn: 'Vouchers & Expenses', labelHi: 'वाउचर व खर्च एंट्री', icon: BookOpen },
];

export const UniversalSoftwareImporter: React.FC<UniversalSoftwareImporterProps> = ({
  data,
  isHindi,
  onImportExternalData,
  lastExternalImportBatch,
  onUndoLastExternalImport,
  onRemoveAllExternalData,
  preImportSnapshot,
  onRestorePreImportSnapshot,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [software, setSoftware] = useState<ExternalSoftwarePreset>('AUTO');
  const [entityType, setEntityType] = useState<ExternalImportEntityType>('PARTIES');
  const [workbook, setWorkbook] = useState<ExternalWorkbookData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);
  const [parseError, setParseError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showColumnMapper, setShowColumnMapper] = useState<boolean>(true);
  const [confirmUndoLast, setConfirmUndoLast] = useState<boolean>(false);
  const [confirmRemoveAll, setConfirmRemoveAll] = useState<boolean>(false);
  const [confirmRestoreSnapshot, setConfirmRestoreSnapshot] = useState<boolean>(false);

  const existingExtCounts = useMemo(() => countExternalImportedRecords(data), [data]);

  const activeSheetData = useMemo(() => {
    if (!workbook || !selectedSheet) return null;
    return workbook.sheets[selectedSheet] || null;
  }, [workbook, selectedSheet]);

  const handleEntityTypeChange = (nextType: ExternalImportEntityType) => {
    setEntityType(nextType);
    setSuccessMsg(null);
    if (activeSheetData) {
      setMapping(autoSuggestColumnMapping(activeSheetData.headers, nextType));
    }
  };

  const handleSheetChange = (sheetName: string) => {
    setSelectedSheet(sheetName);
    if (workbook && workbook.sheets[sheetName]) {
      setMapping(autoSuggestColumnMapping(workbook.sheets[sheetName].headers, entityType));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const result = evt.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          setParseError(isHindi ? 'फ़ाइल पढ़ने में त्रुटि।' : 'Unable to read uploaded file buffer.');
          return;
        }
        const parsedWb = parseExternalSpreadsheetBuffer(result, file.name);
        const firstSheet = parsedWb.sheetNames[0];
        setWorkbook(parsedWb);
        setSelectedSheet(firstSheet);
        setMapping(autoSuggestColumnMapping(parsedWb.sheets[firstSheet].headers, entityType));
      } catch (err: any) {
        setWorkbook(null);
        setSelectedSheet('');
        setParseError(err?.message || (isHindi ? 'अमान्य Excel/CSV फ़ाइल।' : 'Invalid Excel/CSV/JSON file.'));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleClearFile = () => {
    setWorkbook(null);
    setSelectedSheet('');
    setMapping({});
    setParseError(null);
    setSuccessMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewResult: ExternalParsedResult | null = useMemo(() => {
    if (!activeSheetData) return null;
    return buildExternalImportPreview(
      activeSheetData.rows,
      mapping,
      entityType,
      data,
      skipDuplicates,
      software
    );
  }, [activeSheetData, mapping, entityType, data, skipDuplicates, software]);

  const totalPrepared = useMemo(() => {
    if (!previewResult) return 0;
    return (
      previewResult.parties.length +
      previewResult.items.length +
      previewResult.accounts.length +
      previewResult.invoices.length +
      previewResult.purchaseInvoices.length +
      previewResult.vouchers.length
    );
  }, [previewResult]);

  const itemUpdatesCount = previewResult?.itemStockUpdates?.length || 0;

  const handleConfirmImport = () => {
    if (!previewResult || !workbook || (totalPrepared === 0 && itemUpdatesCount === 0)) return;

    onImportExternalData({
      software,
      entityType,
      fileName: workbook.fileName,
      parties: previewResult.parties,
      items: previewResult.items,
      accounts: previewResult.accounts,
      invoices: previewResult.invoices,
      purchaseInvoices: previewResult.purchaseInvoices,
      vouchers: previewResult.vouchers,
      ...(previewResult.itemStockUpdates?.length
        ? { itemStockUpdates: previewResult.itemStockUpdates }
        : {}),
      minDate: previewResult.minDate,
      maxDate: previewResult.maxDate,
    });

    setSuccessMsg(
      isHindi
        ? `🎉 ${SOFTWARE_PRESETS.find((s) => s.id === software)?.name || 'External'} डेटा (${totalPrepared} रिकॉर्ड) सफलतापूर्वक इम्पोर्ट हो गया!`
        : `🎉 Imported ${totalPrepared} record(s) from ${SOFTWARE_PRESETS.find((s) => s.id === software)?.name || 'External file'} successfully!`
    );
    handleClearFile();
  };

  const lastBatchTotal = lastExternalImportBatch
    ? lastExternalImportBatch.accountIds.length +
      lastExternalImportBatch.partyIds.length +
      lastExternalImportBatch.itemIds.length +
      lastExternalImportBatch.invoiceIds.length +
      lastExternalImportBatch.purchaseIds.length +
      lastExternalImportBatch.voucherIds.length
    : 0;

  const activeFields = ENTITY_FIELD_DEFS[entityType];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
            <Globe2 className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-extrabold text-base text-white flex flex-wrap items-center gap-2">
              <span>
                {isHindi
                  ? 'अन्य अकाउंटिंग सॉफ़्टवेयर व Excel/CSV डेटा इम्पोर्टर'
                  : 'Universal Multi-Software & Excel/CSV Importer'}
              </span>
              <span className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded">
                Vyapar • Busy • Marg • Zoho • QuickBooks
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {isHindi
                ? 'Vyapar, Busy, Marg ERP, Zoho Books, QuickBooks या किसी भी Excel (.xlsx) / CSV / JSON से पार्टी, आइटम, लेज़र, सेल्स बिल, परचेज बिल और वाउचर 1-क्लिक में इम्पोर्ट करें।'
                : 'Migrate Parties, Items, Accounts, Sales Invoices, Purchase Bills & Vouchers exported from Vyapar, Busy, Marg ERP, Zoho Books, QuickBooks, or any custom Excel/CSV/JSON.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => downloadExternalSampleTemplateXlsx(entityType)}
          className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-bold px-3.5 py-2.5 rounded-xl transition cursor-pointer shrink-0 self-start lg:self-center"
        >
          <Download className="w-4 h-4" />
          <span>
            {isHindi
              ? `${entityType} सैंपल Excel टेम्पलेट`
              : `Download ${entityType} Excel Template`}
          </span>
        </button>
      </div>

      {/* Undo / Remove External Imported Records */}
      {(lastBatchTotal > 0 || existingExtCounts.total > 0 || Boolean(preImportSnapshot && onRestorePreImportSnapshot)) && (
        <div className="bg-rose-950/25 border border-rose-500/30 rounded-2xl p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-xs font-extrabold text-rose-200 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-400" />
                <span>
                  {isHindi
                    ? 'गलत Excel / अन्य सॉफ़्टवेयर इम्पोर्ट हटाएँ या स्नैपशॉट रीस्टोर करें'
                    : 'Undo External Import or Restore Pre-Import Snapshot'}
                </span>
              </p>
              <p className="text-[11px] text-slate-300">
                {existingExtCounts.total > 0
                  ? (isHindi
                      ? `अन्य सॉफ़्टवेयर/Excel से आए कुल ${existingExtCounts.total} रिकॉर्ड इस कंपनी में मौजूद हैं।`
                      : `Found ${existingExtCounts.total} external-imported record(s) in this company (${existingExtCounts.parties} Parties, ${existingExtCounts.items} Items, ${existingExtCounts.accounts} Ledgers, ${existingExtCounts.invoices} Sales, ${existingExtCounts.purchases} Purchases, ${existingExtCounts.vouchers} Vouchers).`)
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
                    setConfirmRemoveAll(false);
                    setConfirmUndoLast(false);
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

              {onUndoLastExternalImport && lastBatchTotal > 0 && !confirmUndoLast && (
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
                    {isHindi ? `पिछला बैच हटाएँ (${lastBatchTotal})` : `Undo Last Import (${lastBatchTotal})`}
                  </span>
                </button>
              )}

              {onRemoveAllExternalData && existingExtCounts.total > 0 && !confirmRemoveAll && (
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
                    {isHindi ? `सभी इम्पोर्ट डेटा हटाएँ (${existingExtCounts.total})` : `Remove All Imported (${existingExtCounts.total})`}
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
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
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

          {confirmUndoLast && onUndoLastExternalImport && lastExternalImportBatch && (
            <div className="bg-amber-950/60 border border-amber-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-amber-200">
                {isHindi
                  ? `फ़ाइल "${lastExternalImportBatch.fileName}" से आए ${lastBatchTotal} रिकॉर्ड हटाएँ?`
                  : `Remove all ${lastBatchTotal} records imported from "${lastExternalImportBatch.fileName}"?`}
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmUndoLast(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmUndoLast(false);
                    onUndoLastExternalImport();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold cursor-pointer"
                >
                  {isHindi ? 'हाँ, हटाएँ' : 'Yes, Undo'}
                </button>
              </div>
            </div>
          )}

          {confirmRemoveAll && onRemoveAllExternalData && (
            <div className="bg-rose-950/70 border border-rose-500/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <span className="text-rose-200">
                {isHindi
                  ? `क्या आप Excel/अन्य सॉफ़्टवेयर से इम्पोर्ट किए गए सभी ${existingExtCounts.total} रिकॉर्ड हटाना चाहते हैं?`
                  : `Delete all ${existingExtCounts.total} records imported from external software/Excel?`}
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmRemoveAll(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmRemoveAll(false);
                    onRemoveAllExternalData();
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer"
                >
                  {isHindi ? 'हाँ, सभी हटाएँ' : 'Yes, Remove All'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Banner */}
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start justify-between gap-3 text-emerald-300 text-xs font-semibold">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMsg(null)}
            className="p-1 hover:bg-emerald-500/20 rounded-lg text-emerald-300 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Step 1 & Step 2: Source Software + Data Entity Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <label className="block text-xs font-extrabold text-indigo-300 uppercase tracking-wide">
            {isHindi ? '1. स्रोत सॉफ़्टवेयर चुनें (Source Software)' : '1. Select Source Software'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {SOFTWARE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSoftware(preset.id)}
                className={`text-left p-2.5 rounded-xl border text-xs transition cursor-pointer ${
                  software === preset.id
                    ? 'bg-indigo-600/25 border-indigo-400 text-white font-bold shadow'
                    : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="truncate">{preset.name}</div>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            {isHindi
              ? SOFTWARE_PRESETS.find((s) => s.id === software)?.taglineHi
              : SOFTWARE_PRESETS.find((s) => s.id === software)?.taglineEn}
          </p>
        </div>

        <div className="lg:col-span-7 bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-3">
          <label className="block text-xs font-extrabold text-emerald-300 uppercase tracking-wide">
            {isHindi ? '2. क्या इम्पोर्ट करना है? (Select Data Type)' : '2. Select What Data You Are Importing'}
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {ENTITY_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = entityType === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleEntityTypeChange(opt.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left text-xs transition cursor-pointer ${
                    active
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-bold'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span className="leading-tight">{isHindi ? opt.labelHi : opt.labelEn}</span>
                </button>
              );
            })}
          </div>

          <label className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 cursor-pointer text-[11px] text-slate-300 font-semibold">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => setSkipDuplicates(e.target.checked)}
              className="accent-emerald-500 rounded cursor-pointer"
            />
            <span>
              {isHindi
                ? 'पहले से मौजूद नाम / बिल नंबर वाले डुप्लीकेट रिकॉर्ड स्वतः छोड़ें (Skip Duplicates)'
                : 'Auto-skip duplicate Names / Invoice Numbers already present in company'}
            </span>
          </label>
        </div>
      </div>

      {/* Step 3: File Dropzone */}
      <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/70 bg-slate-950/60 rounded-2xl p-6 text-center transition">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.json"
          onChange={handleFileUpload}
          id="universal-software-upload-input"
          className="hidden"
        />
        <label
          htmlFor="universal-software-upload-input"
          className="cursor-pointer flex flex-col items-center justify-center space-y-2"
        >
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <UploadCloud className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-slate-100">
            {workbook ? (
              <span className="text-indigo-300 inline-flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4" />
                {workbook.fileName}
              </span>
            ) : isHindi ? (
              'Excel (.xlsx, .xls), CSV (.csv) या JSON (.json) फ़ाइल अपलोड करने के लिए क्लिक करें'
            ) : (
              'Click to upload Excel (.xlsx, .xls), CSV (.csv), or JSON (.json) export file'
            )}
          </p>
          <p className="text-[11px] text-slate-500">
            {isHindi
              ? 'Vyapar / Busy / Marg / Zoho Books से एक्सपोर्ट की गई रिपोर्ट सीधे अपलोड करें — शीर्षक पंक्ति स्वतः पहचानी जाएगी'
              : 'Supports multi-sheet Excel workbooks & exports with banner headers automatically'}
          </p>
        </label>

        {workbook && (
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {workbook.sheetNames.length > 1 && (
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-[11px]">
                <span className="text-slate-400">{isHindi ? 'शीट चुनें:' : 'Sheet:'}</span>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="bg-transparent text-amber-300 font-bold outline-none"
                >
                  {workbook.sheetNames.map((s) => (
                    <option key={s} value={s} className="bg-slate-900">
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <label
              htmlFor="universal-software-upload-input"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-bold cursor-pointer transition"
            >
              {isHindi ? 'दूसरी फ़ाइल चुनें' : 'Change File'}
            </label>

            <button
              type="button"
              onClick={handleClearFile}
              className="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isHindi ? 'गलत फ़ाइल हटाएँ' : 'Remove Wrong File'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Parse Error */}
      {parseError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-rose-300 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">{isHindi ? 'फ़ाइल पढ़ने में त्रुटि' : 'File Read Error'}</p>
              <p className="text-rose-200/80 mt-0.5">{parseError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClearFile}
            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer shrink-0"
          >
            {isHindi ? 'हटाएँ' : 'Remove File'}
          </button>
        </div>
      )}

      {/* Column Mapping + Preview + Import */}
      {activeSheetData && previewResult && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          {/* Interactive Column Mapping */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold text-amber-300 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>
                  {isHindi
                    ? `कॉलम मैपिंग जाँचें (${activeSheetData.rows.length} पंक्तियाँ मिलीं)`
                    : `Column Mapping (${activeSheetData.rows.length} rows detected)`}
                </span>
              </h4>
              <button
                type="button"
                onClick={() => setShowColumnMapper((v) => !v)}
                className="text-[11px] text-indigo-300 hover:underline font-bold cursor-pointer"
              >
                {showColumnMapper
                  ? isHindi ? 'कॉलम मैपिंग छुपाएँ' : 'Hide Mapper'
                  : isHindi ? 'कॉलम बदलें' : 'Edit Columns'}
              </button>
            </div>

            {showColumnMapper && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                {activeFields.map((field) => (
                  <div key={field.key} className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-[11px] space-y-1">
                    <label className="block font-semibold text-slate-300 truncate">
                      {isHindi ? field.labelHi : field.labelEn}
                      {field.required && <span className="text-rose-400 ml-1">*</span>}
                    </label>
                    <select
                      value={mapping[field.key] || ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value }))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-slate-100 font-mono text-[11px]"
                    >
                      <option value="">{isHindi ? '-- अनदेखा करें / ऑटो --' : '-- Ignore / Auto --'}</option>
                      {activeSheetData.headers.map((hdr) => (
                        <option key={hdr} value={hdr}>
                          {hdr}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FY / Date Notice */}
          {previewResult.minDate && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2 text-xs text-amber-200 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {isHindi
                  ? `इस फ़ाइल में ${previewResult.minDate} से ${previewResult.maxDate} तक के ट्रांज़ैक्शन हैं।`
                  : `File spans transactions from ${previewResult.minDate} to ${previewResult.maxDate}.`}
              </span>
            </div>
          )}

          {/* Warnings */}
          {previewResult.warnings.length > 0 && (
            <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-3 text-[11px] text-amber-300 space-y-1 max-h-24 overflow-y-auto">
              {previewResult.warnings.slice(0, 10).map((w, i) => (
                <div key={i}>• {w}</div>
              ))}
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl p-3.5">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="text-emerald-300 font-extrabold tabular-nums">
                {totalPrepared} {isHindi ? 'इम्पोर्ट के लिए तैयार' : 'ready to import'}
              </span>
              {previewResult.skippedDuplicates > 0 && (
                <span className="text-slate-400 text-[11px] tabular-nums">
                  ({previewResult.skippedDuplicates} {isHindi ? 'डुप्लीकेट स्किप' : 'duplicates skipped'})
                </span>
              )}
              {(entityType === 'SALES' || entityType === 'PURCHASES' || entityType === 'VOUCHERS') &&
                (previewResult.parties.length > 0 || previewResult.items.length > 0 || previewResult.accounts.length > 0) && (
                  <span className="text-[11px] text-indigo-300">
                    +{previewResult.parties.length} Party, +{previewResult.items.length} Item, +{previewResult.accounts.length} Ledger
                  </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleClearFile}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-xs font-bold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isHindi ? 'फ़ाइल हटाएँ' : 'Cancel / Remove'}</span>
              </button>
              <button
                type="button"
                disabled={totalPrepared === 0 && itemUpdatesCount === 0}
                onClick={handleConfirmImport}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-extrabold transition shadow-lg ${
                  totalPrepared > 0 || itemUpdatesCount > 0
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer active:scale-95'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isHindi
                    ? `HisabVeda में इम्पोर्ट करें (${totalPrepared})`
                    : `Confirm & Import (${totalPrepared})`}
                </span>
              </button>
            </div>
          </div>

          {/* Preview Table */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-64">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                  <th className="p-2.5">#</th>
                  <th className="p-2.5">Type</th>
                  <th className="p-2.5">Primary Name / No.</th>
                  <th className="p-2.5">Secondary / GSTIN / Date</th>
                  <th className="p-2.5 text-right">Amount / Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-[11px]">
                {entityType === 'PARTIES' &&
                  previewResult.parties.slice(0, 50).map((p, i) => (
                    <tr key={p.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">{p.type}</span></td>
                      <td className="p-2.5 font-semibold text-white">{p.name}</td>
                      <td className="p-2.5 font-mono text-indigo-300">{p.gstin || p.phone || '-'}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">₹{p.openingBalance.toLocaleString('en-IN')} {p.balanceType}</td>
                    </tr>
                  ))}
                {entityType === 'ITEMS' &&
                  previewResult.items.slice(0, 50).map((it, i) => {
                    const stockVal = Math.round((Number(it.currentStock) || 0) * (Number(it.purchasePrice) || 0) * 100) / 100;
                    return (
                      <tr key={it.id} className="hover:bg-slate-900/60">
                        <td className="p-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                        <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 font-bold">ITEM</span></td>
                        <td className="p-2.5 font-semibold text-white">{it.name}</td>
                        <td className="p-2.5 font-mono text-slate-300">
                          HSN {it.hsnSacCode} • {it.taxRate}% GST • Qty: {it.currentStock} • Value: ₹{stockVal.toLocaleString('en-IN')}
                        </td>
                        <td className="p-2.5 text-right font-mono tabular-nums">₹{it.salesPrice.toLocaleString('en-IN')}</td>
                      </tr>
                    );
                  })}
                {entityType === 'ACCOUNTS' &&
                  previewResult.accounts.slice(0, 50).map((a, i) => (
                    <tr key={a.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 font-bold">{a.category}</span></td>
                      <td className="p-2.5 font-semibold text-white">{a.name}</td>
                      <td className="p-2.5 text-slate-400">{a.mainGroup || a.subCategory}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums">₹{a.openingBalance.toLocaleString('en-IN')} {a.balanceType}</td>
                    </tr>
                  ))}
                {entityType === 'SALES' &&
                  previewResult.invoices.slice(0, 50).map((inv, i) => (
                    <tr key={inv.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold">SALES</span></td>
                      <td className="p-2.5 font-semibold text-white">{inv.invoiceNumber} — {inv.partyName}</td>
                      <td className="p-2.5 font-mono tabular-nums text-slate-300">
                        {inv.date} • Tax ₹{inv.totalTax.toLocaleString('en-IN')}
                        {inv.totalDiscount > 0 ? ` • Disc -₹${inv.totalDiscount.toLocaleString('en-IN')}` : ''}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-white">₹{inv.grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                {entityType === 'PURCHASES' &&
                  previewResult.purchaseInvoices.slice(0, 50).map((p, i) => (
                    <tr key={p.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">PURCHASE</span></td>
                      <td className="p-2.5 font-semibold text-white">{p.supplierInvoiceNo} — {p.partyName}</td>
                      <td className="p-2.5 font-mono tabular-nums text-slate-300">
                        {p.date} • Tax ₹{p.totalTax.toLocaleString('en-IN')}
                        {p.totalDiscount && p.totalDiscount > 0 ? ` • Disc -₹${p.totalDiscount.toLocaleString('en-IN')}` : ''}
                      </td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-white">₹{p.grandTotal.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                {entityType === 'VOUCHERS' &&
                  previewResult.vouchers.slice(0, 50).map((v, i) => (
                    <tr key={v.id} className="hover:bg-slate-900/60">
                      <td className="p-2.5 text-slate-500 tabular-nums">{i + 1}</td>
                      <td className="p-2.5"><span className="px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 font-bold">{v.type}</span></td>
                      <td className="p-2.5 font-semibold text-white">{v.voucherNumber}</td>
                      <td className="p-2.5 text-slate-300 truncate max-w-xs">{v.date} • {v.entries.map((e) => e.accountName).join(' ↔ ')}</td>
                      <td className="p-2.5 text-right font-mono tabular-nums font-bold text-white">₹{v.totalAmount.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
