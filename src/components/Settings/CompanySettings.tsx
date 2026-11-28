import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Building2, 
  Landmark, 
  QrCode, 
  Save, 
  CheckCircle2, 
  Package, 
  Download, 
  UploadCloud, 
  FileSpreadsheet, 
  FolderArchive, 
  Check, 
  Loader2, 
  Calendar, 
  Image, 
  Upload, 
  Trash2, 
  ShieldCheck, 
  KeyRound,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  Plus,
  ArrowRightLeft,
  ToggleRight,
  SlidersHorizontal,
  PenTool,
  Clock,
  Cpu,
  Copy,
  MessageCircle
} from 'lucide-react';
import JSZip from 'jszip';
import {
  AppData,
  CompanyDetails,
  CompanyGstRegistrationType,
  Currency,
  ItemMaster,
  NumberFormatMode,
  PartyMaster,
  UserRole,
} from '../../types';
import { exportBackupJSON, formatCurrency, PreImportSnapshot } from '../../utils/storage';
import { INDIAN_STATE_CODES } from '../../utils/gstin';
import { loadAppConfig } from '../../utils/appConfig';
import {
  COUNTRY_PRESETS,
  CURRENCY_OPTIONS,
  resolveCompanyTaxProfile,
} from '../../utils/companyProfile';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import {
  getHardwareBindingInfo,
  getOrGenerateMachineId,
  getTrialStatus,
} from '../../utils/license';
import { BulkImportUtility } from './BulkImportUtility';
import { TallyXmlImporter } from './TallyXmlImporter';
import { TallyImportCommitPayload, TallyLastImportBatch } from '../../utils/tallyXmlImporter';
import { UniversalSoftwareImporter } from './UniversalSoftwareImporter';
import { ExternalImportCommitPayload, ExternalLastImportBatch } from '../../utils/multiSoftwareImporter';
import {
  downloadWindowsDesktopShortcutZip,
  downloadWindowsExeBuilderZip,
  downloadAndroidApkBuilderZip,
  buildWindowsDesktopShortcutBat,
  buildWindowsExeBuilderBat,
  buildDesktopLauncherBat,
  buildElectronMainCjs,
  resolvePublicAppUrl,
} from '../../utils/desktopShortcut';

interface CompanySettingsProps {
  data: AppData;
  isHindi: boolean;
  onUpdateCompany: (company: CompanyDetails) => void;
  onBulkImportItems: (items: ItemMaster[], mode: 'merge' | 'append') => void;
  onBulkImportParties: (parties: PartyMaster[], mode: 'merge' | 'append') => void;
  onUpdateSecurityPinAndPass?: (newPin: string, pinRequired: boolean, newAdminPass?: string) => void;
  onOpenSecurityModal?: () => void;
  onLoadSampleDemoData?: () => void;
  onResetToCleanWorkspace?: () => void;
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
  onSwitchCompany?: (company: CompanyDetails) => void;
  onCreateNewCompany?: (newCompany: CompanyDetails) => void;
  onDeleteCompany?: (companyId: string) => void;
  onResetSoleCompany?: () => void;
  onOpenCompanyManagerModal?: () => void;
  onOpenFeaturesModal?: () => void;
  onOpenLicenseModal?: () => void;
  onOpenSoftwareUpdateModal?: () => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const CompanySettings: React.FC<CompanySettingsProps> = ({
  data,
  isHindi,
  onUpdateCompany,
  onBulkImportItems,
  onBulkImportParties,
  onUpdateSecurityPinAndPass,
  onOpenSecurityModal,
  onLoadSampleDemoData,
  onResetToCleanWorkspace,
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
  onSwitchCompany,
  onCreateNewCompany,
  onDeleteCompany,
  onResetSoleCompany,
  onOpenCompanyManagerModal,
  onOpenFeaturesModal,
  onOpenLicenseModal,
  onOpenSoftwareUpdateModal,
  activeUserRole = 'ADMIN',
  permissions
}) => {
  const rbac = permissions || getRolePermissions(normalizeUserRole(activeUserRole));
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'license' | 'import' | 'downloads'>('profile');
  const [copiedMachineId, setCopiedMachineId] = useState(false);
  const [importSubMode, setImportSubMode] = useState<'TALLY_XML' | 'OTHER_SOFTWARE' | 'CSV'>('TALLY_XML');
  const [form, setForm] = useState<CompanyDetails>(data.company);
  const [saved, setSaved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [isZipping, setIsZipping] = useState(false);
  const [zipSuccess, setZipSuccess] = useState(false);
  const [isDownloadingTool, setIsDownloadingTool] = useState(false);
  const [downloadFeedback, setDownloadFeedback] = useState<{
    title: string;
    detail: string;
    tone: 'emerald' | 'sky' | 'amber';
  } | null>(null);
  const [confirmLoadDemo, setConfirmLoadDemo] = useState(false);
  const [confirmDeleteCompanyId, setConfirmDeleteCompanyId] = useState<string | null>(null);
  const [showQuickCreateCompany, setShowQuickCreateCompany] = useState(false);
  const [newCmpName, setNewCmpName] = useState('');
  const [newCmpCountry, setNewCmpCountry] = useState('India');
  const [newCmpCurrency, setNewCmpCurrency] = useState<Currency>('INR');
  const [newCmpNumberFormat, setNewCmpNumberFormat] = useState<NumberFormatMode>('INDIAN');
  const [newCmpGstEnabled, setNewCmpGstEnabled] = useState(true);
  const [newCmpRegType, setNewCmpRegType] = useState<CompanyGstRegistrationType>('REGULAR');
  const [newCmpGstin, setNewCmpGstin] = useState('');
  const [newCmpStateCode, setNewCmpStateCode] = useState('');
  const [newCmpStateText, setNewCmpStateText] = useState('');
  const [newCmpFyStart, setNewCmpFyStart] = useState('2026-04-01');

  const companiesList: CompanyDetails[] =
    data.companiesList && data.companiesList.length > 0
      ? data.companiesList
      : [{ ...data.company, id: data.company.id || 'cmp_1' }];

  const normalizeCompanyForm = (cmp: CompanyDetails): CompanyDetails => {
    const p = resolveCompanyTaxProfile(cmp);
    const cfg = loadAppConfig();
    return {
      ...cmp,
      country: p.country,
      currency: p.currency,
      numberFormat: p.numberFormat,
      gstEnabled: p.gstEnabled,
      gstRegistrationType: p.gstRegistrationType,
      compositionTaxRate: p.compositionTaxRate,
      cessEnabled: p.cessEnabled,
      ewayBillEnabled: p.ewayBillEnabled,
      tdsTcsEnabled: p.tdsTcsEnabled,
      batchGodownEnabled: p.batchGodownEnabled,
      negativeStockMode: cmp.negativeStockMode || cfg.negativeStockMode || 'WARN',
    };
  };

  useEffect(() => {
    setForm(normalizeCompanyForm(data.company));
  }, [data.company]);

  // Security & Master PIN State
  const [securityPinInput, setSecurityPinInput] = useState(data.securityPin || '');
  const [confirmPinInput, setConfirmPinInput] = useState(data.securityPin || '');
  const [pinEnabled, setPinEnabled] = useState(data.pinRequired);
  const [showPin, setShowPin] = useState(false);
  const [securityStatusMsg, setSecurityStatusMsg] = useState<string | null>(null);
  const [securityErrorMsg, setSecurityErrorMsg] = useState<string | null>(null);

  const trialStatus = getTrialStatus(data.license, data);
  const hwInfo = getHardwareBindingInfo();
  const machineId = hwInfo.machineId || getOrGenerateMachineId();
  const whatsappLicenseHref = `https://wa.me/917489655303?text=${encodeURIComponent(
    `Hello HisabVeda Team, please issue my Signed License Certificate (HV-LIC-V3) & Unique Activation Code.\n\nHardware Machine ID: ${machineId}`
  )}`;

  const handleChange = (field: keyof CompanyDetails, val: any) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!rbac.canEditCompanySettings) return;
    setLogoError(null);
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setLogoError(isHindi ? 'लोगो फ़ाइल का आकार 2MB से कम होना चाहिए!' : 'Logo file size must be under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleChange('logoUrl', reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!rbac.canEditCompanySettings) return;
    setLogoError(null);
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        setLogoError(isHindi ? 'हस्ताक्षर फ़ाइल 1MB से कम होनी चाहिए!' : 'Signature image size must be under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          handleChange('signatureUrl', reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rbac.canEditCompanySettings) return;
    onUpdateCompany(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Generate and Download All Setup Files in One ZIP Folder
  const handleDownloadAllInOneZip = async () => {
    setIsZipping(true);
    setZipSuccess(false);

    try {
      const zip = new JSZip();
      const setupFolder = zip.folder("HisabVeda_ERP_Setup_Package");

      // 1. README Setup Instructions
      const targetAppUrl = resolvePublicAppUrl();
      const readmeText = `================================================================================
           HISABVEDA ERP SOFTWARE v2.0 - COMPLETE SETUP & INSTALLATION PACKAGE
================================================================================

This ZIP folder contains all required setup scripts, desktop shortcut creator
with the official HisabVeda icon, templates, and database masters.

FOLDER CONTENTS:
----------------
1. README_SETUP_GUIDE.txt                   - Setup instructions & system specs.
2. Install_HisabVeda_Desktop_Shortcut.bat - 1-Click Windows Desktop Icon Installer.
3. HisabVeda.ico                            - Official HisabVeda ERP Windows Icon.
4. Build_Hisabveda_Windows_EXE.bat          - Batch script to build offline Windows .EXE installer.
5. Launch_Hisabveda_Desktop_App.bat         - 1-Click launcher script to run application window.
6. Hisabveda_ERP_Setup_Bundle.json          - Full configuration bundle.
7. Hisabveda_Database_Backup.json           - Complete JSON database backup.
8. Hisabveda_Items_Import_Template.csv      - Sample CSV template for bulk inventory items.
9. Hisabveda_Parties_Import_Template.csv    - Sample CSV template for bulk party masters.
10. electron_main.cjs                       - Electron main process script.
================================================================================
`;
      setupFolder?.file("README_SETUP_GUIDE.txt", readmeText);

      // Include official .ico logo if reachable
      try {
        const icoResp = await fetch('/hv-icon.ico', { cache: 'no-store' });
        if (icoResp.ok) {
          setupFolder?.file("HisabVeda.ico", new Uint8Array(await icoResp.arrayBuffer()));
        }
      } catch {
        // Ignore if icon fetch fails offline
      }

      // 2. Desktop Shortcut Installer + Windows EXE Builder + Launcher
      setupFolder?.file("Install_HisabVeda_Desktop_Shortcut.bat", buildWindowsDesktopShortcutBat(targetAppUrl));
      setupFolder?.file("Build_Hisabveda_Windows_EXE.bat", buildWindowsExeBuilderBat());
      setupFolder?.file("Launch_Hisabveda_Desktop_App.bat", buildDesktopLauncherBat(targetAppUrl));

      // 4. Setup Bundle JSON
      const setupBundle = {
        softwareName: "Hisabveda ERP Software",
        version: "2.0.0",
        releaseDate: new Date().toISOString(),
        company: data.company,
        accountsMaster: data.accounts,
        itemsMaster: data.items,
        partiesMaster: data.parties,
        budgetsMaster: data.budgets,
        initialInvoices: data.invoices,
        initialVouchers: data.vouchers
      };
      setupFolder?.file("Hisabveda_ERP_Setup_Bundle.json", JSON.stringify(setupBundle, null, 2));

      // 5. Full Database Backup JSON (Safeguarded: always reset to 7-day trial for setup distributions)
      const sanitizedBackup = {
        ...data,
        license: {
          ...data.license,
          isLicensed: false,
          licenseType: 'TRIAL',
          trialStartDate: new Date().toISOString(),
          licenseKey: ''
        }
      };
      setupFolder?.file("Hisabveda_Database_Backup.json", JSON.stringify(sanitizedBackup, null, 2));

      // 6. CSV Items Template
      const itemsCsv = `code,name,description,hsnSacCode,unit,purchasePrice,salesPrice,taxRate,currentStock,minStockLevel,category\nITM-101,Office Laptop i7,16GB RAM 512GB SSD,8471,Pcs,45000,58000,18,12,3,Electronics\nITM-102,Ergonomic Executive Chair,High Back Mesh Chair,9401,Pcs,4200,6500,18,25,5,Furniture\nITM-103,Wireless Optical Mouse,2.4GHz High Precision,8471,Pcs,350,650,18,50,10,Accessories`;
      setupFolder?.file("Hisabveda_Items_Import_Template.csv", itemsCsv);

      // 7. CSV Parties Template
      const partiesCsv = `code,name,type,gstin,pan,email,phone,address,state,stateCode,creditLimit,openingBalance,balanceType\nCUST-101,Apex Global Solutions,CUSTOMER,07AAAAA0000A1Z5,AAAAA0000A,info@apexglobal.com,9876543210,123 Corporate Tower,Delhi,07,500000,15000,DR\nVEND-201,Supreme Tech Suppliers,VENDOR,27BBBBB1111B2Z3,BBBBB1111B,sales@supremetech.com,9123456789,45 Industrial Estate,Maharashtra,27,1000000,0,CR`;
      setupFolder?.file("Hisabveda_Parties_Import_Template.csv", partiesCsv);

      // 8. Electron Main CJS
      setupFolder?.file("electron_main.cjs", buildElectronMainCjs(targetAppUrl));

      // Generate Zip Content
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Hisabveda_ERP_Setup_Package_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setZipSuccess(true);
      setTimeout(() => setZipSuccess(false), 5000);
    } catch (err) {
      console.error("Failed to generate ZIP", err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto text-slate-200 text-xs">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-indigo-400" />
            <span>{isHindi ? 'सिस्टम सेटिंग्स एवं मास्टर इंपोर्ट' : 'System Settings & Data Management'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isHindi 
              ? 'कंपनी प्रोफ़ाइल, बल्क CSV इंपोर्ट, बैंक विवरण एवं बैकअप प्रबंधन'
              : 'Customize company profile, bulk CSV master import, remittance details, and backups'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onOpenFeaturesModal && rbac.canEditCompanySettings && (
            <button
              type="button"
              onClick={onOpenFeaturesModal}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs transition cursor-pointer shadow"
            >
              <ToggleRight className="w-4 h-4 text-cyan-400" />
              <span>{isHindi ? '⚡ फीचर्स ऑन/ऑफ (POS / Accounts Only)' : '⚡ Enable / Disable Features (POS, Accounts-Only)'}</span>
            </button>
          )}
          {saved && (
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {isHindi ? 'सेटिंग्स सेव हो गईं!' : 'Settings Saved!'}
            </span>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'profile'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>{isHindi ? 'कंपनी एवं बैंक प्रोफ़ाइल' : 'Company & Bank Profile'}</span>
        </button>

        {rbac.canImportData && (
          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'import'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <UploadCloud className="w-4 h-4 text-emerald-400" />
            <span>{isHindi ? 'XML व अन्य सॉफ़्टवेयर डेटा इम्पोर्ट' : 'ERP XML, Other Software & Excel Import'}</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('license')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
            activeTab === 'license'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{isHindi ? 'सॉफ़्टवेयर लाइसेंस' : 'Software License'}</span>
          {!trialStatus.isLicensed && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
              activeTab === 'license' ? 'bg-white/20 text-white' : 'bg-amber-500/20 text-amber-300'
            }`}>
              {trialStatus.isTrialExpired ? (isHindi ? 'समाप्त' : 'Expired') : `${trialStatus.daysRemaining}d`}
            </span>
          )}
        </button>

        {rbac.canManageUsersAndPin && (
          <>
            <button
              onClick={() => setActiveTab('security')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'security'
                  ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-extrabold shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span>{isHindi ? '🔑 मास्टर पिन व सुरक्षा' : '🔑 Master PIN & Security'}</span>
            </button>

            <button
              onClick={() => setActiveTab('downloads')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeTab === 'downloads'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Download className="w-4 h-4 text-amber-400" />
              <span>{isHindi ? 'डाउनलोड सेंटर' : 'Setup & Downloads'}</span>
            </button>
          </>
        )}
      </div>

      {/* Tab 1: Company & Bank Profile */}
      {(activeTab === 'profile' || (!rbac.canManageUsersAndPin && (activeTab === 'security' || activeTab === 'downloads')) || (!rbac.canImportData && activeTab === 'import')) && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {!rbac.canEditCompanySettings && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {isHindi
                  ? 'केवल एडमिन या मैनेजर ही कंपनी प्रोफ़ाइल, GST विवरण या बैंक सेटिंग्स बदल सकते हैं (केवल देखने मोड)।'
                  : 'Read-only view: Only Administrator or Manager roles can edit Company Profile, GST, or Bank settings.'}
              </span>
            </div>
          )}

          {/* Multi-Company List, Quick Create, Switch & Delete Manager */}
          {rbac.canManageCompanies && (onCreateNewCompany || onSwitchCompany || onDeleteCompany) && (
            <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-indigo-400" />
                    <span>
                      {isHindi
                        ? `मल्टी-कंपनी प्रबंधन (${companiesList.length} ${companiesList.length === 1 ? 'कंपनी' : 'कंपनियाँ'})`
                        : `Multi-Company Management (${companiesList.length})`}
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {isHindi
                      ? 'एक से अधिक कंपनियाँ बनाएं, कंपनी स्विच करें, या अतिरिक्त कंपनी को यहाँ से डिलीट करें।'
                      : 'Create additional blank companies, switch active company, or delete unused companies cleanly.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {onCreateNewCompany && (
                    <button
                      type="button"
                      onClick={() => setShowQuickCreateCompany(v => !v)}
                      className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isHindi ? '+ नई खाली कंपनी बनाएं' : '+ New Blank Company'}</span>
                    </button>
                  )}
                  {onOpenCompanyManagerModal && (
                    <button
                      type="button"
                      onClick={onOpenCompanyManagerModal}
                      className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs px-3 py-2 rounded-xl transition cursor-pointer"
                    >
                      <span>{isHindi ? 'पूर्ण कंपनी मैनेजर' : 'Full Manager'}</span>
                    </button>
                  )}
                </div>
              </div>

              {showQuickCreateCompany && onCreateNewCompany && (
                <div className="bg-slate-950 border border-amber-500/30 rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-amber-300">
                    {isHindi
                      ? 'नई खाली कंपनी जोड़ें (GST, Non-GST, Composition या International)'
                      : 'Create New Clean Company (GST, Non-GST, Composition, or International)'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={newCmpName}
                      onChange={(e) => setNewCmpName(e.target.value)}
                      placeholder={isHindi ? 'नई कंपनी का नाम *' : 'New Company Name *'}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
                    />
                    <select
                      value={newCmpCountry}
                      onChange={(e) => {
                        const c = e.target.value;
                        setNewCmpCountry(c);
                        const preset = COUNTRY_PRESETS.find((p) => p.country === c);
                        if (preset) {
                          setNewCmpCurrency(preset.currency);
                          setNewCmpNumberFormat(preset.numberFormat);
                          setNewCmpGstEnabled(preset.defaultGstEnabled);
                          setNewCmpRegType(preset.defaultGstType);
                        }
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
                    >
                      {COUNTRY_PRESETS.map((p) => (
                        <option key={p.country} value={p.country}>{p.country}</option>
                      ))}
                    </select>
                    <select
                      value={newCmpCurrency}
                      onChange={(e) => setNewCmpCurrency(e.target.value as Currency)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold"
                    >
                      {CURRENCY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                      ))}
                    </select>
                    <select
                      value={newCmpRegType}
                      onChange={(e) => {
                        const reg = e.target.value as CompanyGstRegistrationType;
                        setNewCmpRegType(reg);
                        setNewCmpGstEnabled(reg !== 'UNREGISTERED');
                      }}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-semibold"
                    >
                      <option value="UNREGISTERED">Non-GST / Unregistered</option>
                      <option value="REGULAR">GST Regular</option>
                      <option value="COMPOSITION">GST Composition</option>
                      <option value="SEZ_EXPORT">SEZ / Export</option>
                    </select>
                    <input
                      type="text"
                      value={newCmpGstin}
                      onChange={(e) => setNewCmpGstin(e.target.value.toUpperCase())}
                      placeholder={newCmpGstEnabled ? 'GSTIN (Optional)' : 'Tax ID (Optional)'}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-indigo-300 uppercase"
                    />
                    {newCmpCountry.toLowerCase() === 'india' ? (
                      <select
                        value={newCmpStateCode}
                        onChange={(e) => setNewCmpStateCode(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      >
                        <option value="">{isHindi ? '-- राज्य (वैकल्पिक) --' : '-- State (Optional) --'}</option>
                        {Object.entries(INDIAN_STATE_CODES).map(([code, stName]) => (
                          <option key={code} value={code}>
                            {code} - {stName}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={newCmpStateText}
                        onChange={(e) => setNewCmpStateText(e.target.value)}
                        placeholder="State / Emirate / Region (Optional)"
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      />
                    )}
                    <select
                      value={newCmpNumberFormat}
                      onChange={(e) => setNewCmpNumberFormat(e.target.value as NumberFormatMode)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    >
                      <option value="INDIAN">Lakhs / Crores (en-IN)</option>
                      <option value="INTERNATIONAL">Millions (en-US)</option>
                    </select>
                    <input
                      type="date"
                      value={newCmpFyStart}
                      onChange={(e) => setNewCmpFyStart(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickCreateCompany(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      {isHindi ? 'रद्द करें' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      disabled={!newCmpName.trim()}
                      onClick={() => {
                        if (!newCmpName.trim()) return;
                        const isInd = newCmpCountry.toLowerCase() === 'india';
                        const stName = isInd
                          ? newCmpStateCode
                            ? INDIAN_STATE_CODES[newCmpStateCode] || ''
                            : ''
                          : newCmpStateText.trim();
                        const newCmp: CompanyDetails = {
                          id: 'cmp_' + Date.now(),
                          name: newCmpName.trim(),
                          tagline: '',
                          country: newCmpCountry,
                          currency: newCmpCurrency,
                          numberFormat: newCmpNumberFormat,
                          gstEnabled: newCmpGstEnabled,
                          gstRegistrationType: newCmpGstEnabled ? newCmpRegType : 'UNREGISTERED',
                          compositionTaxRate: 1,
                          cessEnabled: false,
                          ewayBillEnabled: isInd && newCmpGstEnabled,
                          tdsTcsEnabled: isInd,
                          batchGodownEnabled: false,
                          gstin: newCmpGstin.trim(),
                          pan: newCmpGstin.trim().length >= 12 ? newCmpGstin.trim().slice(2, 12) : '',
                          email: '',
                          phone: '',
                          address: '',
                          state: stName,
                          stateCode: isInd ? newCmpStateCode : '',
                          bankName: '',
                          accountNumber: '',
                          ifscCode: '',
                          branch: '',
                          upiId: '',
                          terms: '',
                          financialYearStart: newCmpFyStart || '2026-04-01',
                          booksBeginningFrom: newCmpFyStart || '2026-04-01',
                        };
                        onCreateNewCompany(newCmp);
                        setNewCmpName('');
                        setNewCmpGstin('');
                        setNewCmpStateCode('');
                        setNewCmpStateText('');
                        setShowQuickCreateCompany(false);
                      }}
                      className={`px-4 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                        newCmpName.trim()
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isHindi ? 'कंपनी बनाएं व सक्रिय करें' : 'Create & Activate'}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {companiesList.map((cmp) => {
                  const cmpKey = cmp.id || cmp.name;
                  const isActive =
                    (cmp.id && data.company.id && cmp.id === data.company.id) ||
                    (!cmp.id && cmp.name === data.company.name);
                  const isConfirmingDel = confirmDeleteCompanyId === cmpKey;

                  return (
                    <div
                      key={cmpKey}
                      className={`p-3.5 rounded-xl border space-y-2 ${
                        isActive
                          ? 'bg-indigo-950/50 border-indigo-500/50'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">
                              {cmp.name || (isHindi ? 'नाम रहित कंपनी' : 'Unnamed Company')}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold">
                                {isHindi ? 'सक्रिय (Active)' : 'Active'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono flex flex-wrap gap-3 mt-0.5">
                            <span>GSTIN: {cmp.gstin || 'N/A'}</span>
                            <span>State: {cmp.state || 'N/A'}</span>
                            <span>FY: {cmp.financialYearStart || '2026-04-01'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {!isActive && onSwitchCompany && (
                            <button
                              type="button"
                              onClick={() => onSwitchCompany(cmp)}
                              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] px-3 py-1.5 rounded-lg cursor-pointer transition"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5" />
                              <span>{isHindi ? 'स्विच करें' : 'Switch'}</span>
                            </button>
                          )}

                          {(onDeleteCompany || onResetSoleCompany) && !isConfirmingDel && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCompanyId(cmpKey)}
                              className="flex items-center gap-1.5 bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 font-bold text-[11px] px-3 py-1.5 rounded-lg cursor-pointer transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>
                                {companiesList.length > 1
                                  ? (isHindi ? 'कंपनी डिलीट करें' : 'Delete Company')
                                  : (isHindi ? 'कंपनी डिलीट / साफ़ करें' : 'Delete / Clear Company')}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>

                      {isConfirmingDel && (onDeleteCompany || onResetSoleCompany) && (
                        <div className="bg-rose-950/60 border border-rose-500/40 rounded-lg p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                          <span className="text-rose-200">
                            {companiesList.length > 1
                              ? isHindi
                                ? `क्या आप "${cmp.name}" और इसका पूरा डेटा हटाना चाहते हैं?`
                                : `Permanently delete "${cmp.name}" and its entire accounting store?`
                              : isHindi
                              ? `यह एकमात्र कंपनी "${cmp.name}" है। डिलीट करने पर इसके सभी बिल/वाउचर/पार्टी हट जाएँगे और साफ़ नई कंपनी तैयार होगी।`
                              : `This is your only company "${cmp.name}". Deleting it clears all transactions/masters and resets to a fresh empty company.`}
                          </span>
                          <div className="flex items-center gap-2 justify-end shrink-0">
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteCompanyId(null)}
                              className="px-2.5 py-1 rounded border border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
                            >
                              {isHindi ? 'रद्द करें' : 'Cancel'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmDeleteCompanyId(null);
                                if (companiesList.length > 1 && onDeleteCompany) {
                                  onDeleteCompany(cmpKey);
                                } else if (onResetSoleCompany) {
                                  onResetSoleCompany();
                                }
                              }}
                              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer"
                            >
                              {isHindi ? 'हाँ, डिलीट करें' : 'Confirm Delete'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Financial Year & Books Starting Date Settings */}
          <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-slate-900 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-3">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2 border-b border-amber-500/20 pb-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              <span>{isHindi ? 'वित्तीय वर्ष एवं खाता प्रारंभ तिथि (Financial Year & Books Start)' : 'Financial Year & Books Beginning From Date'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  {isHindi ? 'वित्तीय वर्ष प्रारंभ तिथि (FY Start) *' : 'Financial Year Start Date *'}
                </label>
                <input
                  type="date"
                  value={form.financialYearStart || '2026-04-01'}
                  onChange={(e) => handleChange('financialYearStart', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">e.g. 2026-04-01 (1st April 2026)</p>
              </div>

              <div>
                <label className="block text-slate-200 font-semibold mb-1">
                  {isHindi ? 'खाते प्रारंभ तिथि (Books Beginning From) *' : 'Books Beginning From Date *'}
                </label>
                <input
                  type="date"
                  value={form.booksBeginningFrom || '2026-04-01'}
                  onChange={(e) => handleChange('booksBeginningFrom', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-1">e.g. 2026-04-01 (Date transactions commence)</p>
              </div>
            </div>
          </div>

          {/* Country, Currency, Tax Registration & Statutory Feature Switches */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <span>
                  {isHindi
                    ? 'देश, मुद्रा, GST प्रकार एवं वैधानिक विकल्प (Country, Currency & Statutory Switches)'
                    : 'Country, Currency, Tax Registration & Statutory Switches'}
                </span>
              </h3>
              <span className="text-xs font-mono text-emerald-300 tabular-nums">
                {formatCurrency(1234567.5, form.currency || 'INR', form.numberFormat || 'INDIAN')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'देश (Country)' : 'Country'}
                </label>
                <select
                  value={form.country || 'India'}
                  onChange={(e) => {
                    const nextCountry = e.target.value;
                    const preset = COUNTRY_PRESETS.find((p) => p.country === nextCountry);
                    setForm((prev) => ({
                      ...prev,
                      country: nextCountry,
                      ...(preset
                        ? {
                            currency: preset.currency,
                            numberFormat: preset.numberFormat,
                          }
                        : {}),
                    }));
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-semibold outline-none"
                >
                  {COUNTRY_PRESETS.map((p) => (
                    <option key={p.country} value={p.country}>{p.country}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'मुद्रा (Currency)' : 'Currency'}
                </label>
                <select
                  value={form.currency || 'INR'}
                  onChange={(e) => handleChange('currency', e.target.value as Currency)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-amber-300 font-bold outline-none"
                >
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'नंबर फॉर्मेट (Number Format)' : 'Number Formatting'}
                </label>
                <select
                  value={form.numberFormat || 'INDIAN'}
                  onChange={(e) => handleChange('numberFormat', e.target.value as NumberFormatMode)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-semibold outline-none"
                >
                  <option value="INDIAN">Indian Lakhs / Crores (12,34,567.50)</option>
                  <option value="INTERNATIONAL">International Millions (1,234,567.50)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'GST सक्षम करें (Enable GST)' : 'Enable GST'}
                </label>
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        gstEnabled: true,
                        gstRegistrationType:
                          prev.gstRegistrationType === 'UNREGISTERED' || !prev.gstRegistrationType
                            ? 'REGULAR'
                            : prev.gstRegistrationType,
                      }))
                    }
                    className={`py-2 rounded-lg font-bold transition cursor-pointer ${
                      form.gstEnabled !== false ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isHindi ? 'हाँ (Yes)' : 'Yes (On)'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        gstEnabled: false,
                        gstRegistrationType: 'UNREGISTERED',
                        cessEnabled: false,
                        ewayBillEnabled: false,
                      }))
                    }
                    className={`py-2 rounded-lg font-bold transition cursor-pointer ${
                      form.gstEnabled === false ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {isHindi ? 'नहीं (Non-GST)' : 'No (Non-GST)'}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'पंजीकरण प्रकार (Registration Type)' : 'Registration Type'}
                </label>
                <select
                  value={form.gstRegistrationType || 'REGULAR'}
                  onChange={(e) => {
                    const reg = e.target.value as CompanyGstRegistrationType;
                    setForm((prev) => ({
                      ...prev,
                      gstRegistrationType: reg,
                      gstEnabled: reg !== 'UNREGISTERED',
                      ...(reg === 'UNREGISTERED' || reg === 'COMPOSITION' ? { cessEnabled: false } : {}),
                      ...(reg === 'UNREGISTERED' ? { ewayBillEnabled: false } : {}),
                    }));
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-semibold outline-none"
                >
                  <option value="UNREGISTERED">Unregistered / Non-GST</option>
                  <option value="REGULAR">Regular (Tax Invoice)</option>
                  <option value="COMPOSITION">Composition Dealer (Bill of Supply)</option>
                  <option value="SEZ_EXPORT">SEZ / Export</option>
                </select>
              </div>

              {form.gstEnabled !== false && form.gstRegistrationType === 'COMPOSITION' && (
                <div>
                  <label className="block text-amber-300 font-semibold mb-1">
                    {isHindi ? 'कंपोज़िशन टैक्स दर (%)' : 'Composition Turnover Tax Rate (%)'}
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={form.compositionTaxRate ?? 1}
                    onChange={(e) => handleChange('compositionTaxRate', parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-800 border border-amber-500/40 rounded-xl p-2.5 text-amber-300 font-mono font-bold outline-none"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {[
                {
                  key: 'cessEnabled' as const,
                  checked: Boolean(form.cessEnabled),
                  disabled: form.gstEnabled === false || form.gstRegistrationType === 'COMPOSITION',
                  title: isHindi ? 'सेस्स सक्षम करें (Enable Cess)' : 'Enable Cess',
                  desc: isHindi ? 'इनवॉइस, खरीद और आइटम में Cess कॉलम दिखाएं' : 'Show Cess columns on Invoices, Purchases & Items',
                },
                {
                  key: 'ewayBillEnabled' as const,
                  checked: Boolean(form.ewayBillEnabled),
                  disabled: form.gstEnabled === false,
                  title: isHindi ? 'ई-वे बिल (Enable E-Way Bill)' : 'Enable E-Way Bill',
                  desc: isHindi ? 'ई-वे बिल फ़ील्ड व चेतावनी दिखाएं' : 'Show E-Way Bill actions & transport details',
                },
                {
                  key: 'tdsTcsEnabled' as const,
                  checked: Boolean(form.tdsTcsEnabled),
                  disabled: false,
                  title: isHindi ? 'TDS / TCS सक्षम करें' : 'Enable TDS / TCS',
                  desc: isHindi ? 'TDS / TCS कटौती व कर रिपोर्ट दिखाएं' : 'Enable TDS / TCS deductions & compliance',
                },
                {
                  key: 'batchGodownEnabled' as const,
                  checked: Boolean(form.batchGodownEnabled),
                  disabled: false,
                  title: isHindi ? 'बैच / एक्सपायरी व गोदाम' : 'Batch/Expiry & Multi-Godown',
                  desc: isHindi ? 'इनवॉइस व स्टॉक में बैच व गोदाम चुनें' : 'Show Batch/Expiry & Multi-Godown inventory fields',
                },
              ].map((sw) => (
                <label
                  key={sw.key}
                  className={`flex items-start justify-between gap-2.5 p-3 rounded-xl border transition ${
                    sw.disabled
                      ? 'bg-slate-950/40 border-slate-800/60 opacity-50 cursor-not-allowed'
                      : sw.checked
                      ? 'bg-indigo-950/40 border-indigo-500/40 cursor-pointer'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700 cursor-pointer'
                  }`}
                >
                  <div>
                    <div className="font-bold text-slate-100 text-xs">{sw.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{sw.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={sw.checked}
                    disabled={sw.disabled}
                    onChange={(e) => handleChange(sw.key, e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-indigo-500 rounded shrink-0 cursor-pointer"
                  />
                </label>
              ))}
            </div>

            {/* Negative Stock Control Mode */}
            <div className="pt-2 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-100 text-xs">
                  {isHindi ? 'नेगेटिव स्टॉक नियंत्रण (Negative Stock Billing Policy)' : 'Negative Stock Billing Policy'}
                </div>
                <div className="text-[11px] text-slate-400">
                  {isHindi
                    ? 'बिलिंग या POS पर कम/शून्य स्टॉक होने पर अनुमति, चेतावनी या सख्त रोक चुनें'
                    : 'Choose whether Sales & POS allow, warn, or strictly block out-of-stock billing'}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                {(
                  [
                    { id: 'ALLOW', label: isHindi ? 'अनुमति (Allow)' : 'Allow' },
                    { id: 'WARN', label: isHindi ? 'चेतावनी (Warn)' : 'Warn' },
                    { id: 'BLOCK', label: isHindi ? 'रोकें (Block)' : 'Block' },
                  ] as const
                ).map((opt) => {
                  const currentMode = form.negativeStockMode || 'WARN';
                  const active = currentMode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleChange('negativeStockMode', opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        active
                          ? opt.id === 'BLOCK'
                            ? 'bg-rose-600 text-white'
                            : opt.id === 'WARN'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Company Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Building2 className="w-4 h-4 text-indigo-400" />
              <span>{isHindi ? 'कंपनी व्यावसायिक विवरण, लोगो एवं हस्ताक्षर' : 'Company Registration, Logo & Signature'}</span>
            </h3>

            {/* Company Logo & Digital Signature Attach Options */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Image className="w-4 h-4 text-indigo-400" />
                    <span>{isHindi ? 'कंपनी लोगो (Company Logo)' : 'Company Logo'}</span>
                  </label>
                  {form.logoUrl && rbac.canEditCompanySettings && (
                    <button
                      type="button"
                      onClick={() => handleChange('logoUrl', '')}
                      className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'हटाएं' : 'Remove'}</span>
                    </button>
                  )}
                </div>

                {logoError && (
                  <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{logoError}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {form.logoUrl ? (
                    <div className="w-32 h-18 bg-white rounded-xl border border-slate-700 p-2 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
                      <img src={form.logoUrl} alt="Company Logo" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-32 h-18 bg-slate-900/90 rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 text-[11px] shrink-0">
                      <Image className="w-5 h-5 mb-1 text-slate-600" />
                      <span>No Logo</span>
                    </div>
                  )}

                  <div className="flex-1 space-y-2 w-full">
                    {rbac.canEditCompanySettings && (
                      <label className="inline-flex cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs items-center gap-1.5 transition shadow-sm">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'लोगो अपलोड करें' : 'Upload Logo (PNG/JPG)'}</span>
                        <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleLogoUpload} className="hidden" />
                      </label>
                    )}
                    <p className="text-[11px] text-slate-400">
                      {isHindi
                        ? 'सभी प्रिंटेड बिल, रसीद और लेजर पर दिखाई देगा।'
                        : 'Renders automatically on Invoices, Receipts, and Statements.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-amber-400" />
                    <span>{isHindi ? 'डिजिटल हस्ताक्षर (Authorized Signature)' : 'Digital Signature & Signatory'}</span>
                  </label>
                  {form.signatureUrl && rbac.canEditCompanySettings && (
                    <button
                      type="button"
                      onClick={() => handleChange('signatureUrl', '')}
                      className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'हटाएं' : 'Remove'}</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {form.signatureUrl ? (
                    <div className="w-32 h-18 bg-white rounded-xl border border-slate-700 p-2 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
                      <img src={form.signatureUrl} alt="Authorized Signature" className="max-h-full max-w-full object-contain" />
                    </div>
                  ) : (
                    <div className="w-32 h-18 bg-slate-900/90 rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-slate-500 text-[11px] shrink-0">
                      <PenTool className="w-5 h-5 mb-1 text-slate-600" />
                      <span>No Signature</span>
                    </div>
                  )}

                  <div className="flex-1 space-y-2 w-full">
                    {rbac.canEditCompanySettings && (
                      <label className="inline-flex cursor-pointer bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold px-3.5 py-2 rounded-xl text-xs items-center gap-1.5 transition">
                        <Upload className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isHindi ? 'हस्ताक्षर अपलोड करें' : 'Upload Signature'}</span>
                        <input type="file" accept="image/png, image/jpeg, image/webp" onChange={handleSignatureUpload} className="hidden" />
                      </label>
                    )}
                    <input
                      type="text"
                      value={form.authorizedSignatory || ''}
                      onChange={(e) => handleChange('authorizedSignatory', e.target.value)}
                      placeholder={isHindi ? 'अधिकृत हस्ताक्षरकर्ता नाम (e.g. Director)' : 'Signatory Name (e.g. Proprietor / Director)'}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Company / Firm Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-slate-100 font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Tagline / Business Nature</label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {form.gstEnabled === false
                    ? (isHindi ? 'Tax ID / रजिस्ट्रेशन नं. (वैकल्पिक)' : 'Tax ID / Business Reg. No. (Optional)')
                    : (isHindi ? 'GSTIN नंबर (वैकल्पिक)' : 'GSTIN Number (Optional)')}
                </label>
                <input
                  type="text"
                  value={form.gstin}
                  onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
                  placeholder={form.gstEnabled === false ? 'Optional for Non-GST business' : 'Enter 15-digit GSTIN (if applicable)'}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 font-mono font-bold text-indigo-300 uppercase"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">PAN / Tax ID Number</label>
                <input
                  type="text"
                  value={form.pan}
                  onChange={(e) => handleChange('pan', e.target.value.toUpperCase())}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 font-mono text-slate-100 uppercase"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {(form.country || 'India').toLowerCase() === 'india'
                    ? (isHindi ? 'राज्य एवं राज्य कोड (State & Code)' : 'State & State Code (Optional for Non-GST)')
                    : (isHindi ? 'राज्य / प्रांत / क्षेत्र (State / Region)' : 'State / Province / Emirate')}
                </label>
                {(form.country || 'India').toLowerCase() === 'india' ? (
                  <select
                    value={form.stateCode || ''}
                    onChange={(e) => {
                      const code = e.target.value;
                      const stName = code ? INDIAN_STATE_CODES[code] || '' : '';
                      setForm((prev) => ({ ...prev, stateCode: code, state: stName }));
                    }}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white font-semibold outline-none focus:border-indigo-500"
                  >
                    <option value="">{isHindi ? '-- राज्य चुनें (वैकल्पिक) --' : '-- Select State (Optional) --'}</option>
                    {Object.entries(INDIAN_STATE_CODES).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.state || ''}
                    onChange={(e) => handleChange('state', e.target.value)}
                    placeholder="e.g. Dubai, London, California"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-white"
                  />
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email & Phone</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-xl p-2.5"
                  />
                  <input
                    type="text"
                    value={form.phone}
                    onChange={(e) => handleChange('phone', e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-xl p-2.5"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Registered Office Address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5"
              />
            </div>
          </div>

          {/* Bank & Payment Details */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
              <Landmark className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'बैंक खाता विवरण (Remittance Bank & UPI Details)' : 'Bank Remittance Details For Invoices'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Bank Name</label>
                <input
                  type="text"
                  value={form.bankName}
                  onChange={(e) => handleChange('bankName', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Account Number</label>
                <input
                  type="text"
                  value={form.accountNumber}
                  onChange={(e) => handleChange('accountNumber', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">IFSC Code</label>
                <input
                  type="text"
                  value={form.ifscCode}
                  onChange={(e) => handleChange('ifscCode', e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">UPI ID for Quick Payment QR</label>
                <input
                  type="text"
                  value={form.upiId}
                  onChange={(e) => handleChange('upiId', e.target.value)}
                  placeholder="company@upi"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 font-mono text-emerald-400"
                />
              </div>
            </div>
          </div>

          {/* Terms */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
            <label className="block text-slate-300 font-semibold">Standard Invoice Terms & Conditions</label>
            <textarea
              value={form.terms}
              onChange={(e) => handleChange('terms', e.target.value)}
              rows={4}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-slate-200"
            />
          </div>

          {rbac.canEditCompanySettings && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-6 py-3 rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{isHindi ? 'कंपनी सेटिंग्स सेव करें' : 'Save Company Profile'}</span>
              </button>
            </div>
          )}

          {/* Practice & Demo Data Sandbox Section */}
          {rbac.canResetWorkspace && (onLoadSampleDemoData || onResetToCleanWorkspace) && (
            <div className="bg-gradient-to-r from-indigo-950/50 via-slate-900 to-emerald-950/40 border border-indigo-500/30 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span>
                      {isHindi
                        ? 'प्रैक्टिस व ट्रेनिंग मोड (Load Sample Demo Data)'
                        : 'Practice & Training Mode (Sample Demo Data)'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    {isHindi
                      ? 'यदि आप पहली बार सॉफ़्टवेयर चला रहे हैं और प्रैक्टिस करना चाहते हैं, तो सैंपल इनवॉइस, वाउचर, पार्टी व स्टॉक आइटम लोड करें। बाद में कभी भी एक क्लिक में वापस साफ़ कार्यक्षेत्र पा सकते हैं।'
                      : 'Want to explore features before entering your real business accounts? Load realistic sample invoices, GST vouchers, parties, and stock items to practice, then reset back to a clean workspace anytime.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  {onLoadSampleDemoData && !confirmLoadDemo && (
                    <button
                      type="button"
                      onClick={() => setConfirmLoadDemo(true)}
                      className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isHindi ? 'सैंपल डेमो डेटा लोड करें' : 'Load Sample Demo Data'}</span>
                    </button>
                  )}

                  {onResetToCleanWorkspace && (
                    <button
                      type="button"
                      onClick={onResetToCleanWorkspace}
                      className="flex items-center gap-2 bg-slate-800 hover:bg-rose-950/60 hover:border-rose-500/40 text-slate-200 hover:text-rose-300 border border-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'साफ़ खाली डेटा पर रीसेट करें' : 'Reset to Clean Workspace'}</span>
                    </button>
                  )}
                </div>
              </div>

              {onLoadSampleDemoData && confirmLoadDemo && (
                <div className="bg-amber-950/50 border border-amber-500/40 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 text-amber-200 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>
                      {isHindi
                        ? 'क्या आप सैंपल डेमो डेटा लोड करना चाहते हैं? इससे वर्तमान डमी/मौजूदा डेटा की जगह प्रैक्टिस डेटा आ जाएगा।'
                        : 'Load sample demo dataset now? This will replace your current workspace records with sample practice data.'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => setConfirmLoadDemo(false)}
                      className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      {isHindi ? 'रद्द करें' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmLoadDemo(false);
                        onLoadSampleDemoData();
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold cursor-pointer"
                    >
                      {isHindi ? 'हाँ, सैंपल डेटा लोड करें' : 'Yes, Load Sample Data'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      )}

      {/* Tab 2: Accounting XML, Other Software & Excel/CSV Data Import */}
      {activeTab === 'import' && rbac.canImportData && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 border border-slate-800 p-2 rounded-2xl">
            <button
              type="button"
              onClick={() => setImportSubMode('TALLY_XML')}
              className={`flex-1 min-w-[180px] px-4 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                importSubMode === 'TALLY_XML'
                  ? 'bg-amber-500 text-slate-950 shadow-lg'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isHindi ? '⚡ Accounting ERP XML इम्पोर्टर' : '⚡ Accounting ERP XML Importer'}
            </button>
            <button
              type="button"
              onClick={() => setImportSubMode('OTHER_SOFTWARE')}
              className={`flex-1 min-w-[200px] px-4 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                importSubMode === 'OTHER_SOFTWARE'
                  ? 'bg-indigo-600 text-white shadow-lg'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isHindi ? '🌐 अन्य सॉफ़्टवेयर / Excel (Busy, Vyapar, Marg, Zoho)' : '🌐 Other Software & Excel (Busy, Vyapar, Marg, Zoho)'}
            </button>
            <button
              type="button"
              onClick={() => setImportSubMode('CSV')}
              className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition cursor-pointer ${
                importSubMode === 'CSV'
                  ? 'bg-emerald-600 text-white shadow-lg'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              {isHindi ? '📄 त्वरित CSV इम्पोर्ट' : '📄 Quick CSV Import'}
            </button>
          </div>

          {importSubMode === 'TALLY_XML' && onImportTallyData && (
            <TallyXmlImporter
              data={data}
              isHindi={isHindi}
              onImportTallyData={onImportTallyData}
              lastTallyImportBatch={lastTallyImportBatch}
              onUndoLastTallyImport={onUndoLastTallyImport}
              onRemoveAllTallyData={onRemoveAllTallyData}
              preImportSnapshot={preImportSnapshot}
              onRestorePreImportSnapshot={onRestorePreImportSnapshot}
              onMergeDuplicateLedgers={onMergeDuplicateLedgers}
            />
          )}

          {importSubMode === 'OTHER_SOFTWARE' && onImportExternalData && (
            <UniversalSoftwareImporter
              data={data}
              isHindi={isHindi}
              onImportExternalData={onImportExternalData}
              lastExternalImportBatch={lastExternalImportBatch}
              onUndoLastExternalImport={onUndoLastExternalImport}
              onRemoveAllExternalData={onRemoveAllExternalData}
              preImportSnapshot={preImportSnapshot}
              onRestorePreImportSnapshot={onRestorePreImportSnapshot}
            />
          )}

          {importSubMode === 'CSV' && (
            <BulkImportUtility
              isHindi={isHindi}
              onImportItems={onBulkImportItems}
              onImportParties={onBulkImportParties}
              existingItemCodes={data.items.map(i => i.code)}
              existingPartyCodes={data.parties.map(p => p.code)}
            />
          )}
        </div>
      )}

      {/* Tab 3: Setup Files & Downloads */}
      {activeTab === 'downloads' && rbac.canManageUsersAndPin && (
        <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 border border-amber-500/30 rounded-2xl p-5 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-amber-500/20 pb-3 gap-3">
            <div>
              <h3 className="font-bold text-sm text-amber-200 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'सॉफ़्टवेयर सेटअप फ़ाइलें एवं डाउनलोड सेंटर' : 'Software Setup Files & Download Center'}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isHindi ? 'Hisabveda ERP Software के सभी सेटअप, मास्टर डेटाबेस एवं सोर्स फ़ाइलें डाउनलोड करें' : 'Download all setup configuration bundles, default database schemas, and source code packages'}
              </p>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-full font-bold shrink-0 self-start sm:self-center">
              Hisabveda ERP v2.0
            </span>
          </div>

          {/* ALL IN ONE ZIP DOWNLOAD BANNER */}
          <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border-2 border-emerald-500/40 p-5 rounded-2xl shadow-xl space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shrink-0">
                  <FolderArchive className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-emerald-200 flex items-center gap-2">
                    <span>{isHindi ? 'सभी सेटअप फ़ाइलें 1-फ़ोल्डर ZIP में डाउनलोड करें' : 'Download All Setup Files in One ZIP Folder'}</span>
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                      .ZIP Archive
                    </span>
                  </h4>
                  <p className="text-xs text-slate-300 mt-1">
                    {isHindi 
                      ? 'एक ही क्लिक में सभी सेटअप स्क्रिप्ट (.bat), CSV टेम्पलेट्स, JSON कॉन्फ़िगरेशन बंडल और गाइड प्राप्त करें।' 
                      : 'Includes README instructions, Build_EXE.bat, Launch_App.bat, Setup Config JSON, Backup JSON, and CSV Templates in a single folder.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleDownloadAllInOneZip}
                disabled={isZipping}
                className={`flex items-center gap-2 font-extrabold text-xs px-6 py-3.5 rounded-xl shadow-xl transition transform active:scale-95 shrink-0 justify-center ${
                  zipSuccess 
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950'
                }`}
              >
                {isZipping ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                    <span>{isHindi ? 'ज़िप फ़ोल्डर बन रहा है...' : 'Compressing ZIP Package...'}</span>
                  </>
                ) : zipSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-slate-950" />
                    <span>{isHindi ? 'ZIP डाउनलोड हो गया!' : 'ZIP Download Complete!'}</span>
                  </>
                ) : (
                  <>
                    <FolderArchive className="w-4 h-4 text-slate-950" />
                    <span>{isHindi ? '1-क्लिक में ZIP डाउनलोड करें' : 'Download Complete Setup ZIP'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {downloadFeedback && (
            <div
              className={`p-4 rounded-2xl border text-xs space-y-1 animate-fadeIn ${
                downloadFeedback.tone === 'emerald'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : downloadFeedback.tone === 'sky'
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
              }`}
            >
              <p className="font-extrabold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{downloadFeedback.title}</span>
              </p>
              <p className="text-[11px] opacity-95 leading-relaxed">{downloadFeedback.detail}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 1-Click Windows Desktop App Shortcut with Official Logo */}
            <button
              type="button"
              disabled={isDownloadingTool}
              onClick={async () => {
                setIsDownloadingTool(true);
                try {
                  const res = await downloadWindowsDesktopShortcutZip();
                  setDownloadFeedback({
                    tone: 'sky',
                    title: isHindi
                      ? `✅ ${res.fileName} डाउनलोड हो गया!`
                      : `✅ Downloaded ${res.fileName}`,
                    detail: isHindi
                      ? 'डाउनलोड हुई ZIP को Extract करें और "Install_HisabVeda_Desktop_Shortcut.bat" पर डबल-क्लिक करें। तुरंत आपके Windows Desktop पर ऑफ़िशियल HisabVeda लोगो वाला ऐप आइकन बन जाएगा (Node.js की ज़रूरत नहीं)!'
                      : 'Extract the ZIP and double-click "Install_HisabVeda_Desktop_Shortcut.bat" to place the official HisabVeda logo app icon directly on your Windows Desktop (no Node.js needed).',
                  });
                } finally {
                  setIsDownloadingTool(false);
                }
              }}
              className="flex items-center justify-between bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-slate-950 font-bold p-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-xs">
                    {isHindi
                      ? 'डेस्कटॉप लोगो शॉर्टकट इंस्टॉलर'
                      : 'Desktop App Shortcut (with Logo)'}
                  </p>
                  <p className="text-[10px] opacity-80 font-normal">HisabVeda_Desktop_App_Shortcut.zip</p>
                </div>
              </div>
              <span className="text-[10px] bg-slate-950/40 text-sky-950 px-2 py-1 rounded font-mono font-bold">ICON</span>
            </button>

            {/* Windows EXE Builder Script Package (.ZIP) */}
            <button
              type="button"
              disabled={isDownloadingTool}
              onClick={async () => {
                setIsDownloadingTool(true);
                try {
                  const res = await downloadWindowsExeBuilderZip();
                  setDownloadFeedback({
                    tone: 'emerald',
                    title: isHindi
                      ? `✅ ${res.fileName} डाउनलोड हो गया!`
                      : `✅ Downloaded ${res.fileName}`,
                    detail: isHindi
                      ? 'ऑफलाइन .EXE बनाने के लिए: पहले AI Studio Settings ➔ Download ZIP से पूरा प्रोजेक्ट डाउनलोड करें, फिर इस ZIP की फ़ाइलें उस मुख्य फ़ोल्डर (जहाँ package.json है) में डालकर "Build_Hisabveda_Windows_EXE.bat" चलाएँ। तुरंत डेस्कटॉप आइकन के लिए ऊपर वाला नीला बटन ("Desktop App Shortcut") उपयोग करें!'
                      : 'For an offline .EXE installer: extract the full project source ZIP (with package.json), copy these files into that root folder, and run Build_Hisabveda_Windows_EXE.bat. Want the Desktop icon right now without compiling? Use the blue Desktop App Shortcut button!',
                  });
                } finally {
                  setIsDownloadingTool(false);
                }
              }}
              className="flex items-center justify-between bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-slate-950 font-bold p-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-xs">{isHindi ? 'Windows EXE बिल्डर पैकेज' : 'Build Windows EXE Installer'}</p>
                  <p className="text-[10px] opacity-80 font-normal">HisabVeda_Windows_EXE_Builder.zip</p>
                </div>
              </div>
              <span className="text-[10px] bg-slate-950/40 text-emerald-950 px-2 py-1 rounded font-mono font-bold">.EXE</span>
            </button>

            {/* Android APK Builder Script Button */}
            <button
              type="button"
              disabled={isDownloadingTool}
              onClick={async () => {
                setIsDownloadingTool(true);
                try {
                  const res = await downloadAndroidApkBuilderZip();
                  setDownloadFeedback({
                    tone: 'amber',
                    title: isHindi
                      ? `✅ ${res.fileName} डाउनलोड हो गया!`
                      : `✅ Downloaded ${res.fileName}`,
                    detail: isHindi
                      ? 'इस ZIP को पूरे प्रोजेक्ट सोर्स फ़ोल्डर (package.json सहित) में Extract करके Build_Hisabveda_Android_APK.bat चलाएँ।'
                      : 'Extract into your full project root folder (containing package.json) and run Build_Hisabveda_Android_APK.bat.',
                  });
                } finally {
                  setIsDownloadingTool(false);
                }
              }}
              className="flex items-center justify-between bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-slate-950 font-bold p-3.5 rounded-xl shadow transition cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-xs">{isHindi ? 'Android APK बिल्डर टूल' : 'Build Android APK Package'}</p>
                  <p className="text-[10px] opacity-80 font-normal">HisabVeda_Android_APK_Builder.zip</p>
                </div>
              </div>
              <span className="text-[10px] bg-slate-950/40 text-teal-950 px-2 py-1 rounded font-mono font-bold">.APK</span>
            </button>

            <button
              onClick={() => {
                const setupBundle = {
                  softwareName: "Hisabveda ERP Software",
                  version: "2.0.0",
                  releaseDate: new Date().toISOString(),
                  company: data.company,
                  accountsMaster: data.accounts,
                  itemsMaster: data.items,
                  partiesMaster: data.parties,
                  budgetsMaster: data.budgets,
                  initialInvoices: data.invoices,
                  initialVouchers: data.vouchers
                };
                const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(setupBundle, null, 2));
                const a = document.createElement('a');
                a.setAttribute("href", jsonStr);
                a.setAttribute("download", `Hisabveda_ERP_Setup_Bundle_${new Date().toISOString().split('T')[0]}.json`);
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
              className="flex items-center justify-between bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold p-3.5 rounded-xl shadow transition"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-xs">{isHindi ? 'संपूर्ण सेटअप बंडल फ़ाइल' : 'Full Setup Config Bundle'}</p>
                  <p className="text-[10px] opacity-80 font-normal">Hisabveda_ERP_Setup_Bundle.json</p>
                </div>
              </div>
              <span className="text-[10px] bg-slate-950/40 text-amber-950 px-2 py-1 rounded font-mono font-bold">.JSON</span>
            </button>

            <button
              onClick={() => exportBackupJSON(data)}
              className="flex items-center justify-between bg-indigo-600 hover:bg-indigo-500 text-white font-bold p-3.5 rounded-xl shadow transition"
            >
              <div className="flex items-center gap-2.5">
                <Download className="w-4 h-4" />
                <div className="text-left">
                  <p className="text-xs">{isHindi ? 'मास्टर डेटाबेस सेटअप' : 'Master Database Backup'}</p>
                  <p className="text-[10px] text-indigo-200 font-normal">Hisabveda_Database_Backup.json</p>
                </div>
              </div>
              <span className="text-[10px] bg-indigo-950/50 text-indigo-200 px-2 py-1 rounded font-mono font-bold">.JSON</span>
            </button>
          </div>

          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl space-y-1.5 text-xs">
            <p className="font-bold text-slate-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'सॉफ़्टवेयर सोर्स कोड (ZIP File) कैसे डाउनलोड करें:' : 'How to Download Full Application Source Code (.ZIP):'}</span>
            </p>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              {isHindi 
                ? 'एप्लीकेशन की सभी React, TypeScript और Vite सोर्स फ़ाइलों को डाउनलोड करने के लिए ऊपर दाईं ओर दिए गए AI Studio के **Settings / Export** मेनू पर जाएँ और **Download ZIP** पर क्लिक करें।' 
                : 'To download the full source code archive containing all React, TypeScript, Tailwind, and Vite files, navigate to the **Settings / Code Export** option in the AI Studio top toolbar and click **Export Code / Download ZIP**.'}
            </p>
          </div>
        </div>
      )}

      {/* Tab: Software License & 7-Day Free Trial */}
      {activeTab === 'license' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${
                trialStatus.isLicensed
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                  : trialStatus.isTrialExpired
                    ? 'bg-rose-500/15 border-rose-500/40 text-rose-400'
                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              }`}>
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  {isHindi ? 'सॉफ़्टवेयर लाइसेंस और 7-दिवसीय ट्रायल' : 'Software License & Commercial Activation'}
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isHindi
                    ? 'हार्डवेयर-लॉक्ड Ed25519 सर्टिफिकेट (HV-LIC-V3) एवं सिंगल-यूज़ एक्टिवेशन कोड प्रबंधन'
                    : 'Manage your 7-Day Free Trial, Hardware Machine ID, and dual-layer Ed25519 commercial license.'}
                </p>
              </div>
            </div>

            {onOpenLicenseModal && (
              <button
                type="button"
                onClick={onOpenLicenseModal}
                className={`px-4 py-2.5 rounded-xl font-extrabold text-xs flex items-center gap-2 transition shadow-lg cursor-pointer ${
                  trialStatus.isLicensed
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-slate-950'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>
                  {trialStatus.isLicensed
                    ? (isHindi ? 'लाइसेंस विवरण / नवीनीकरण देखें' : 'View / Upgrade Commercial License')
                    : trialStatus.isTrialExpired
                      ? (isHindi ? 'ट्रायल समाप्त — लाइसेंस एक्टिवेट करें' : 'Free Trial Expired — Activate License')
                      : (isHindi
                          ? `फ्री ट्रायल: ${trialStatus.daysRemaining} दिन शेष — लाइसेंस एक्टिवेट करें`
                          : `Free Trial: ${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'Day' : 'Days'} Left — Activate License`)}
                </span>
              </button>
            )}
          </div>

          <div className={`p-4 rounded-xl border space-y-2 ${
            trialStatus.isLicensed
              ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
              : trialStatus.isTrialExpired
                ? 'bg-rose-950/35 border-rose-500/40 text-rose-200'
                : 'bg-amber-950/25 border-amber-500/35 text-amber-200'
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-xs flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>
                  {trialStatus.isLicensed
                    ? `${isHindi ? 'सक्रिय कमर्शियल लाइसेंस' : 'Active Commercial License'} (${data.license?.licenseType || 'PRO'})`
                    : trialStatus.isTrialExpired
                      ? (isHindi ? '7-दिवसीय नि:शुल्क ट्रायल समाप्त हो गया है' : '7-Day Free Trial Expired — Activation Required')
                      : (isHindi
                          ? `नि:शुल्क ट्रायल सक्रिय: ${trialStatus.daysRemaining} दिन और ${trialStatus.vouchersRemaining}/${trialStatus.maxTrialVouchers} वाउचर शेष`
                          : `Free Trial Active: ${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'Day' : 'Days'} Left · ${trialStatus.vouchersRemaining}/${trialStatus.maxTrialVouchers} Vouchers Left`)}
                </span>
              </span>
              <span className="font-mono text-[11px] bg-slate-950/70 px-2.5 py-1 rounded-lg border border-slate-800">
                {trialStatus.isLicensed
                  ? (trialStatus.daysRemaining >= 9000 ? 'Lifetime Perpetual' : `Valid Until ${data.license?.expiryDate || 'Active'}`)
                  : `Day ${Math.min(7, trialStatus.daysElapsed + 1)} of ${trialStatus.maxTrialDays}`}
              </span>
            </div>
            {trialStatus.isLicensed && data.license?.registeredOwner && (
              <p className="text-[11px] text-emerald-300/90">
                {isHindi ? 'पंजीकृत स्वामी:' : 'Registered Owner:'} <strong>{data.license.registeredOwner}</strong>
              </p>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-indigo-400" />
                <span>{isHindi ? 'आपका हार्डवेयर मशीन आईडी (Machine ID):' : 'Hardware Machine ID:'}</span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(machineId);
                    setCopiedMachineId(true);
                    setTimeout(() => setCopiedMachineId(false), 2200);
                  }}
                  className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold cursor-pointer"
                >
                  {copiedMachineId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedMachineId ? (isHindi ? 'कॉपी हो गया' : 'Copied Machine ID') : (isHindi ? 'Machine ID कॉपी करें' : 'Copy Machine ID')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => window.open(whatsappLicenseHref, '_blank', 'noopener,noreferrer')}
                  className="text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-bold cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'WhatsApp पर Machine ID भेजें' : 'Send Machine ID on WhatsApp'}</span>
                </button>
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg px-3.5 py-2.5 font-mono text-xs font-extrabold text-indigo-300 select-all">
              {machineId}
            </div>
          </div>

          {/* Software Updates & GitHub Releases */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {isHindi ? 'सॉफ्टवेयर अपडेट (electron-updater)' : 'Software Auto-Updates & GitHub Releases'}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {isHindi ? `वर्तमान संस्करण: ${data.softwareVersion || 'v2.4.2'}` : `Current App Version: ${data.softwareVersion || 'v2.4.2'}`}
                  </p>
                </div>
              </div>
              {onOpenSoftwareUpdateModal && (
                <button
                  type="button"
                  onClick={onOpenSoftwareUpdateModal}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'अपडेट जांचें / केंद्र खोलें' : 'Check for Updates'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Security & Master PIN Management */}
      {activeTab === 'security' && rbac.canManageUsersAndPin && (
        <div className="space-y-6">
          {/* Status Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl border ${pinEnabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    {isHindi ? 'मास्टर सिक्योरिटी पिन प्रबंधन (Master Security PIN)' : 'Master Security PIN & Screen Lock'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isHindi ? 'सॉफ्टवेयर स्क्रीन लॉक सुरक्षा पिन सेट या परिवर्तित करें' : 'Configure 4-6 digit startup screen lock PIN security'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onOpenLicenseModal && (
                  <button
                    type="button"
                    onClick={onOpenLicenseModal}
                    className="bg-emerald-600/25 hover:bg-emerald-600 text-emerald-200 hover:text-white border border-emerald-500/40 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <KeyRound className="w-4 h-4 text-emerald-400" />
                    <span>{isHindi ? 'सॉफ़्टवेयर लाइसेंस' : 'Software License'}</span>
                  </button>
                )}

                {onOpenSecurityModal && (
                  <button
                    type="button"
                    onClick={onOpenSecurityModal}
                    className="bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    <span>{isHindi ? 'पूर्ण बैकअप व सुरक्षा केंद्र' : 'Backup & Security Center'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Notifications */}
            {securityStatusMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{securityStatusMsg}</span>
              </div>
            )}

            {securityErrorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{securityErrorMsg}</span>
              </div>
            )}

            {/* PIN Settings Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSecurityErrorMsg(null);
                setSecurityStatusMsg(null);

                if (pinEnabled && (securityPinInput.trim() || data.securityPin || '').length < 4) {
                  setSecurityErrorMsg(isHindi ? 'मास्टर पिन कम से कम 4 अंकों का होना चाहिए।' : 'Master PIN must be at least 4 digits.');
                  return;
                }

                if (securityPinInput !== confirmPinInput) {
                  setSecurityErrorMsg(isHindi ? 'नया पिन और पुष्टि पिन मेल नहीं खाते!' : 'New PIN and Confirm PIN do not match!');
                  return;
                }

                const targetPin = securityPinInput.trim() || data.securityPin || '';
                if (pinEnabled && targetPin.length < 4) {
                  setSecurityErrorMsg(isHindi ? 'कृपया कम से कम 4 अंकों का कस्टम पिन दर्ज करें।' : 'Please enter a custom Master PIN of 4-6 digits.');
                  return;
                }
                if (onUpdateSecurityPinAndPass) {
                  onUpdateSecurityPinAndPass(targetPin, pinEnabled);
                }

                setSecurityStatusMsg(
                  isHindi 
                    ? '✅ मास्टर पिन और सुरक्षा सेटिंग्स सफलतापूर्वक सहेजी गईं!' 
                    : '✅ Master Security PIN and security settings updated successfully!'
                );
              }}
              className="space-y-4"
            >
              {/* Toggle PIN Protection */}
              <div className="flex items-center justify-between p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                <label htmlFor="compPinCheck" className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    id="compPinCheck"
                    checked={pinEnabled}
                    onChange={(e) => setPinEnabled(e.target.checked)}
                    className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                  />
                  <span>{isHindi ? 'सॉफ़्टवेयर शुरू होते समय मास्टर पिन लॉक अनिवार्य करें' : 'Require Master PIN Lock upon starting the application'}</span>
                </label>

                <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded border ${
                  pinEnabled ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {pinEnabled ? (isHindi ? 'सुरक्षा चालू (ACTIVE)' : 'ENABLED') : (isHindi ? 'सुरक्षा बंद (OFF)' : 'DISABLED')}
                </span>
              </div>

              {/* PIN Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      {isHindi ? 'नया मास्टर पिन (4-6 अंक) *' : 'New Master PIN (4-6 digits) *'}
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showPin ? (isHindi ? 'छिपाएं' : 'Hide') : (isHindi ? 'पिन देखें' : 'Show')}
                    </button>
                  </div>
                  <input
                    type={showPin ? 'text' : 'password'}
                    maxLength={6}
                    value={securityPinInput}
                    onChange={(e) => setSecurityPinInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-mono tracking-widest text-center text-sm focus:border-amber-500 focus:outline-none"
                    required={pinEnabled && !data.securityPin}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {isHindi ? 'नए पिन की पुष्टि करें (Confirm PIN) *' : 'Confirm New PIN *'}
                  </label>
                  <input
                    type={showPin ? 'text' : 'password'}
                    maxLength={6}
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value)}
                    placeholder="••••••"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-mono tracking-widest text-center text-sm focus:border-amber-500 focus:outline-none"
                    required={pinEnabled && !data.securityPin}
                  />
                </div>
              </div>

              {/* CSPRNG Random PIN Generator */}
              <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-medium">
                  {isHindi ? 'सुरक्षित पिन जनरेटर (6-अंक):' : 'Secure 6-Digit PIN Generator:'}
                </span>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const arr = new Uint32Array(1);
                      crypto.getRandomValues(arr);
                      const rand = (100000 + (arr[0] % 900000)).toString();
                      setSecurityPinInput(rand);
                      setConfirmPinInput(rand);
                      setShowPin(true);
                    }}
                    className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold rounded-lg border border-amber-500/40 flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{isHindi ? 'सुरक्षित रैंडम पिन बनाएं' : 'Generate Strong Random PIN'}</span>
                  </button>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSecurityPinInput('');
                    setConfirmPinInput('');
                    setPinEnabled(false);
                    if (onUpdateSecurityPinAndPass) {
                      onUpdateSecurityPinAndPass('', false);
                    }
                    setSecurityStatusMsg(isHindi ? '✅ मास्टर पिन लॉक हटा दिया गया! नया कस्टम PIN सेट करें।' : '✅ Master PIN cleared! Set a new custom PIN to re-enable lock.');
                  }}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 px-3 py-2 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'मास्टर पिन लॉक हटाएं' : 'Clear & Disable PIN'}</span>
                </button>

                <button
                  type="submit"
                  className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isHindi ? 'मास्टर पिन व सुरक्षा सेटिंग्स सहेजें' : 'Save Master PIN & Security'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
