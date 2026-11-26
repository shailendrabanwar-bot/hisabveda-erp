import React, { useState } from 'react';
import { Download, Upload, Database, RefreshCw, FileSpreadsheet, ShieldCheck, CheckCircle2, AlertTriangle, FileText, HardDrive, ArrowDownToLine, ArrowUpFromLine, Film } from 'lucide-react';
import { AppData, ItemMaster, PartyMaster, UserRole } from '../../types';
import { exportBackupJSON, PreImportSnapshot } from '../../utils/storage';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import { VideoMediaUploader } from '../Media/VideoMediaUploader';
import { TallyXmlImporter } from '../Settings/TallyXmlImporter';
import { TallyImportCommitPayload, TallyLastImportBatch } from '../../utils/tallyXmlImporter';
import { UniversalSoftwareImporter } from '../Settings/UniversalSoftwareImporter';
import { ExternalImportCommitPayload, ExternalLastImportBatch } from '../../utils/multiSoftwareImporter';

interface UtilitiesModuleProps {
  data: AppData;
  isHindi: boolean;
  onRestoreData: (restoredData: AppData) => void;
  onResetSampleData: () => void;
  onBulkImportItems?: (items: ItemMaster[]) => void;
  onBulkImportParties?: (parties: PartyMaster[]) => void;
  onUpdateData?: (updater: (prev: AppData) => AppData) => void;
  onImportTallyData?: (payload: TallyImportCommitPayload) => void;
  lastTallyImportBatch?: TallyLastImportBatch | null;
  onUndoLastTallyImport?: () => void;
  onRemoveAllTallyData?: () => void;
  onMergeDuplicateLedgers?: (selectedClusterIds?: string[], balanceStrategy?: 'KEEP_PRIMARY_OR_NONZERO' | 'SUM') => void;
  onImportExternalData?: (payload: ExternalImportCommitPayload) => void;
  lastExternalImportBatch?: ExternalLastImportBatch | null;
  onUndoLastExternalImport?: () => void;
  onRemoveAllExternalData?: () => void;
  preImportSnapshot?: PreImportSnapshot | null;
  onRestorePreImportSnapshot?: () => void;
  isCustomerView?: boolean;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const UtilitiesModule: React.FC<UtilitiesModuleProps> = ({
  data,
  isHindi,
  onRestoreData,
  onResetSampleData,
  onBulkImportItems,
  onBulkImportParties,
  onUpdateData,
  onImportTallyData,
  lastTallyImportBatch,
  onUndoLastTallyImport,
  onRemoveAllTallyData,
  onMergeDuplicateLedgers,
  onImportExternalData,
  lastExternalImportBatch,
  onUndoLastExternalImport,
  onRemoveAllExternalData,
  preImportSnapshot,
  onRestorePreImportSnapshot,
  isCustomerView = false,
  activeUserRole = 'ADMIN',
  permissions
}) => {
  const effectiveRole = normalizeUserRole(activeUserRole);
  const perms = permissions || getRolePermissions(effectiveRole);
  const canExportBackup = perms.canUseAdminBackup || perms.canExportData;
  const canRestoreOrReset = perms.canResetWorkspace && perms.canUseAdminBackup;

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<AppData | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [restoreSuccess, setRestoreSuccess] = useState<boolean>(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<boolean>(false);
  const [showResetSampleConfirm, setShowResetSampleConfirm] = useState<boolean>(false);

  // File Upload Reader for System JSON Backup
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    setRestoreSuccess(false);

    if (!file) return;
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonText = event.target?.result as string;
        const parsed = JSON.parse(jsonText);

        if (parsed && parsed.company && Array.isArray(parsed.invoices) && Array.isArray(parsed.vouchers)) {
          setParsedBackupData(parsed as AppData);
        } else {
          setFileError(
            isHindi
              ? 'अमान्य बैकअप फ़ाइल! कृपया वैध HisabVeda ERP backup JSON फ़ाइल चुनें।'
              : 'Invalid backup file structure! Please select a valid HisabVeda ERP JSON backup file.'
          );
          setParsedBackupData(null);
        }
      } catch (err) {
        setFileError(
          isHindi
            ? 'JSON फ़ाइल पढ़ने में असमर्थ। फ़ाइल का फॉर्मेट जांचें।'
            : 'Failed to parse JSON file. Please check file format.'
        );
        setParsedBackupData(null);
      }
    };
    reader.readAsText(file);
  };

  const handleRequestRestore = () => {
    if (!parsedBackupData || !canRestoreOrReset) return;
    setShowRestoreConfirm(true);
  };

  const handleConfirmRestore = () => {
    if (!parsedBackupData || !canRestoreOrReset) return;
    onRestoreData(parsedBackupData);
    setRestoreSuccess(true);
    setSelectedFile(null);
    setParsedBackupData(null);
    setShowRestoreConfirm(false);
  };

  // CSV Export Utils
  const exportPartiesCSV = () => {
    let csv = "Name,Type,GSTIN,Phone,Email,Address,State,Pincode,OpeningBalance\n";
    data.parties.forEach(p => {
      csv += `"${p.name}","${p.type}","${p.gstin || ''}","${p.phone || ''}","${p.email || ''}","${p.address || ''}","${p.state || ''}","${p.pincode || ''}",${p.openingBalance || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Parties_Master_Backup_${data.company.name.replace(/\s+/g, '_')}.csv`;
    a.click();
  };

  const exportItemsCSV = () => {
    let csv = "Code,Name,Category,HSN_SAC,Unit,PurchasePrice,SalesPrice,TaxRate,CurrentStock\n";
    data.items.forEach(i => {
      csv += `"${i.code}","${i.name}","${i.category || ''}","${i.hsnSacCode || ''}","${i.unit || 'Pcs'}",${i.purchasePrice || 0},${i.salesPrice || 0},${i.taxRate || 18},${i.currentStock || 0}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Items_Master_Backup_${data.company.name.replace(/\s+/g, '_')}.csv`;
    a.click();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto text-slate-200">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2.5">
            <Database className="w-6 h-6 text-indigo-400" />
            <span>{isHindi ? 'डेटा उपयोगिताएँ, बैकअप एवं रिस्टोर केंद्र' : 'Utilities & Full System Backup/Restore'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isHindi
              ? 'बैकअप लें, बैकअप फ़ाइल से संपूर्ण डेटा रिस्टोर करें, CSV डेटा इम्पोर्ट/एक्सपोर्ट करें।'
              : 'Take instant system JSON backups, restore complete accounting databases, import/export CSV masters.'}
          </p>
        </div>

        {canExportBackup && (
          <button
            onClick={() => exportBackupJSON(data)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95 shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>{isHindi ? '1-क्लिक बैकअप फ़ाइल डाउनलोड करें (JSON)' : 'Download Full Backup (JSON)'}</span>
          </button>
        )}
      </div>

      {restoreSuccess && (
        <div className="bg-emerald-950/50 border border-emerald-500/40 rounded-2xl p-4 text-xs text-emerald-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{isHindi ? 'डेटा सफलतापूर्वक बैकअप से रिस्टोर कर दिया गया है!' : 'System backup restored successfully!'}</span>
          </div>
          <button
            type="button"
            onClick={() => setRestoreSuccess(false)}
            className="text-emerald-300 hover:text-white font-bold px-2 py-1 rounded-lg bg-emerald-900/40"
          >
            {isHindi ? 'बंद करें' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* Grid Section: Backup & Restore */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Section 1: Take Backup (Export) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                <span>{isHindi ? '1. संपूर्ण सिस्टम डेटाबेस बैकअप डाउनलोड करें' : '1. Export System JSON Backup'}</span>
              </h3>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                JSON DB
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              {isHindi
                ? 'यह फ़ंक्शन आपकी कंपनी के सभी इनवॉइस, वाउचर, ग्राहक मास्टर्स, आइटम मास्टर्स और सेटिंग्स को एक ही `.json` बैकअप फ़ाइल में डाउनलोड करता है। इस फ़ाइल को पेनड्राइव या गूगल ड्राइव में सुरक्षित रखें।'
                : 'This exports all company invoices, vouchers, party accounts, inventory items, and audit logs into a standalone `.json` file for offline safety and device transfer.'}
            </p>

            <div className="mt-4 p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs font-mono space-y-1.5 text-slate-300">
              <p className="text-indigo-300 font-bold">📊 {isHindi ? 'वर्तमान बैकअप स्नैपशॉट विवरण:' : 'Current Backup Snapshot Summary:'}</p>
              <p>• {isHindi ? 'कंपनी का नाम:' : 'Company Name:'} <strong className="text-white">{data.company.name}</strong></p>
              <p>• {isHindi ? 'कुल इनवॉइस:' : 'Total Sales Invoices:'} <strong className="text-emerald-400">{data.invoices.length}</strong></p>
              <p>• {isHindi ? 'कुल वाउचर एंट्रीज़:' : 'Total Vouchers:'} <strong className="text-cyan-400">{data.vouchers.length}</strong></p>
              <p>• {isHindi ? 'रजिस्टर्ड पार्टीज़:' : 'Master Parties:'} <strong className="text-amber-400">{data.parties.length}</strong></p>
              <p>• {isHindi ? 'स्टॉक आइटम्स:' : 'Stock Items:'} <strong className="text-purple-400">{data.items.length}</strong></p>
            </div>
          </div>

          {canExportBackup && (
            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={() => exportBackupJSON(data)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-3 rounded-xl shadow-lg transition"
              >
                <Download className="w-4 h-4" />
                <span>{isHindi ? 'JSON बैकअप फ़ाइल सहेजें (.JSON)' : 'Download Backup File (.JSON)'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Section 2: Restore / Import Backup */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <ArrowUpFromLine className="w-5 h-5 text-indigo-400" />
                <span>{isHindi ? '2. पुराना बैकअप रिस्टोर / इंपोर्ट करें (Restore Data)' : '2. Restore System Data from Backup'}</span>
              </h3>
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                JSON Import
              </span>
            </div>

            <p className="text-xs text-slate-400 mt-3 leading-relaxed">
              {isHindi
                ? 'यदि आपने पहले बैकअप लिया था, तो उस `.json` फ़ाइल को यहाँ अपलोड करके अपना पूरा एकाउंटिंग डेटा और इनवॉइस वापस प्राप्त करें।'
                : 'Upload a previously saved `.json` backup file to restore all your invoices, vouchers, party master accounts, and configuration.'}
            </p>

            {canRestoreOrReset ? (
              <>
                {/* File Dropzone */}
                <div className="mt-4 border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/60 rounded-xl p-4 text-center transition">
                  <Upload className="w-8 h-8 text-indigo-400 mx-auto mb-2" />
                  <label className="cursor-pointer font-bold text-xs text-indigo-300 hover:text-indigo-200 block">
                    <span>{isHindi ? 'यहाँ क्लिक करके JSON बैकअप फ़ाइल चुनें' : 'Click to Select Backup JSON File'}</span>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[11px] text-slate-500 block mt-1">(.json format only)</span>
                </div>

                {/* Error Message */}
                {fileError && (
                  <div className="mt-3 bg-rose-950/40 border border-rose-800/60 rounded-xl p-3 text-xs text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{fileError}</span>
                  </div>
                )}

                {/* Preview of Parsed Data */}
                {parsedBackupData && (
                  <div className="mt-3 bg-indigo-950/40 border border-indigo-500/40 rounded-xl p-3 text-xs space-y-1.5 text-indigo-200">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>{isHindi ? 'वैध बैकअप फ़ाइल पाई गई!' : 'Valid Backup File Ready to Restore!'}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-indigo-500/20 font-mono">
                      <span>Company: <strong>{parsedBackupData.company.name}</strong></span>
                      <span>Invoices: <strong>{parsedBackupData.invoices?.length || 0}</strong></span>
                      <span>Vouchers: <strong>{parsedBackupData.vouchers?.length || 0}</strong></span>
                      <span>Parties: <strong>{parsedBackupData.parties?.length || 0}</strong></span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="mt-4 bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                <span>{isHindi ? 'डेटा रिस्टोर करने की अनुमति केवल ADMIN भूमिका को है।' : 'Only ADMIN role can restore system backup archives.'}</span>
              </div>
            )}
          </div>

          {canRestoreOrReset && (
            <div className="pt-4 border-t border-slate-800">
              <button
                onClick={handleRequestRestore}
                disabled={!parsedBackupData}
                className={`w-full flex items-center justify-center gap-2 text-xs font-extrabold py-3 rounded-xl transition shadow-lg ${
                  parsedBackupData
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isHindi ? 'अभी बैकअप डेटा रिस्टोर करें (Confirm Restore)' : 'Confirm & Restore Data Now'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Accounting ERP XML Data Importer */}
      {onImportTallyData && perms.canImportData && (
        <TallyXmlImporter
          data={data}
          isHindi={isHindi}
          onImportTallyData={onImportTallyData}
          lastTallyImportBatch={lastTallyImportBatch}
          onUndoLastTallyImport={perms.canDeleteRecords ? onUndoLastTallyImport : undefined}
          onRemoveAllTallyData={perms.canDeleteRecords ? onRemoveAllTallyData : undefined}
          preImportSnapshot={preImportSnapshot}
          onRestorePreImportSnapshot={perms.canDeleteRecords ? onRestorePreImportSnapshot : undefined}
          onMergeDuplicateLedgers={perms.canBulkReclassify ? onMergeDuplicateLedgers : undefined}
        />
      )}

      {/* Universal Multi-Software & Excel/CSV Importer */}
      {onImportExternalData && perms.canImportData && (
        <UniversalSoftwareImporter
          data={data}
          isHindi={isHindi}
          onImportExternalData={onImportExternalData}
          lastExternalImportBatch={lastExternalImportBatch}
          onUndoLastExternalImport={perms.canDeleteRecords ? onUndoLastExternalImport : undefined}
          onRemoveAllExternalData={perms.canDeleteRecords ? onRemoveAllExternalData : undefined}
          preImportSnapshot={preImportSnapshot}
          onRestorePreImportSnapshot={perms.canDeleteRecords ? onRestorePreImportSnapshot : undefined}
        />
      )}

      {!perms.canImportData && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-xs text-slate-400 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{isHindi ? 'ERP XML एवं बाहरी डेटा इम्पोर्ट केवल Admin/Manager/Accountant द्वारा किया जा सकता है।' : 'ERP XML and external software imports require Admin, Manager, or Accountant role.'}</span>
        </div>
      )}

      {/* Section 3: Master Data CSV Import & Export Utilities */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-xl">
        <h3 className="text-base font-bold text-slate-100 flex items-center gap-2 border-b border-slate-800 pb-3">
          <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
          <span>{isHindi ? '3. एक्सेल / CSV मास्टर्स एक्सपोर्ट एवं एक्सेल बैकअप' : '3. CSV Excel Masters Export & Quick Utilities'}</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          {/* Parties CSV Export */}
          {perms.canExportData && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'पार्टी मास्टर्स CSV' : 'Parties Directory CSV'}</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                {isHindi ? 'सभी ग्राहकों और विक्रेताओं की सूची CSV एक्सेल फ़ाइल में एक्सपोर्ट करें।' : 'Export all customers and vendor directories into Excel CSV.'}
              </p>
              <button
                onClick={exportPartiesCSV}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>{isHindi ? 'पार्टी CSV डाउनलोड करें' : 'Export Parties CSV'}</span>
              </button>
            </div>
          )}

          {/* Items CSV Export */}
          {perms.canExportData && (
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span>{isHindi ? 'सामग्री / स्टॉक मास्टर्स CSV' : 'Stock Items CSV'}</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                {isHindi ? 'आइटम कोड, HSN/SAC, दर और स्टॉक मात्रा की CSV डाउनलोड करें।' : 'Export inventory catalogue, rates, HSN codes into Excel CSV.'}
              </p>
              <button
                onClick={exportItemsCSV}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-purple-400" />
                <span>{isHindi ? 'आइटम CSV डाउनलोड करें' : 'Export Items CSV'}</span>
              </button>
            </div>
          )}

          {/* Reset / Sample Data Utility */}
          {canRestoreOrReset && (
            <div className="bg-rose-950/20 p-4 rounded-xl border border-rose-800/40 space-y-3">
              <h4 className="font-bold text-rose-300 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-rose-400" />
                <span>{isHindi ? 'सैंपल डेटा रीसेट (Reset)' : 'Reset Sample Data'}</span>
              </h4>
              <p className="text-slate-400 text-[11px]">
                {isHindi ? 'डेमो या टेस्टिंग के लिए डिफ़ॉल्ट सैंपल इनवॉइस लोड करें।' : 'Reset system back to default sample ledger database.'}
              </p>
              <button
                onClick={() => setShowResetSampleConfirm(true)}
                className="w-full bg-rose-900/40 hover:bg-rose-800/60 text-rose-200 border border-rose-700/60 font-semibold py-2 rounded-lg transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-rose-300" />
                <span>{isHindi ? 'सैंपल डेटा रीसेट करें' : 'Reset to Sample Data'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Video & Media Upload Center */}
      {onUpdateData && !isCustomerView && perms.canEditCompanySettings && (
        <div className="pt-4 border-t border-slate-800">
          <VideoMediaUploader
            data={data}
            onUpdateData={onUpdateData}
            isHindi={isHindi}
          />
        </div>
      )}

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && parsedBackupData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-white">
                  {isHindi ? 'बैकअप रिस्टोर की पुष्टि करें' : 'Confirm System Backup Restore'}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? `वर्तमान डेटा रिप्लेस हो जाएगा और कंपनी "${parsedBackupData.company.name}" का बैकअप लोड हो जाएगा।`
                    : `Existing workspace state will be overwritten by the backup for "${parsedBackupData.company.name}".`}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowRestoreConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-extrabold text-white"
              >
                {isHindi ? 'हाँ, रिस्टोर करें' : 'Yes, Restore Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Sample Data Confirmation Modal */}
      {showResetSampleConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-700/60 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-extrabold text-white">
                  {isHindi ? 'सैंपल डेटा रीसेट की पुष्टि करें' : 'Confirm Reset to Sample Data'}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? 'यह कार्रवाई वर्तमान डेटा को हटाकर डिफ़ॉल्ट सैंपल डेटासेट लोड कर देगी।'
                    : 'This will replace current records with the default sample dataset.'}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowResetSampleConfirm(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetSampleConfirm(false);
                  onResetSampleData();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-extrabold text-white"
              >
                {isHindi ? 'हाँ, रीसेट करें' : 'Yes, Reset Sample'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
