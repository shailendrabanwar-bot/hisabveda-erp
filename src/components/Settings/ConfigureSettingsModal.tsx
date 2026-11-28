import React, { useEffect, useState } from 'react';
import { 
  Sliders, 
  X, 
  Save, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Package, 
  Printer, 
  Keyboard, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Scale, 
  ShieldCheck, 
  Sparkles,
  QrCode,
  Coins,
  Building,
  Calculator,
  Landmark,
  Lock,
  MessageCircle,
  Barcode,
  Calendar,
  Receipt,
  ToggleRight,
  ScanBarcode,
  ShoppingBag,
  Users,
  PiggyBank,
  FileCheck2,
  Layers
} from 'lucide-react';
import {
  AppConfiguration,
  DEFAULT_APP_CONFIG,
  ErpFeaturePreset,
  applyErpFeaturePreset,
  loadAppConfig,
  saveAppConfig,
  playAudioBeep
} from '../../utils/appConfig';

export type ConfigureSection = 'features' | 'general' | 'voucher' | 'inventory' | 'gst' | 'tds' | 'special' | 'reports';

interface ConfigureSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHindi: boolean;
  initialSection?: ConfigureSection;
  onConfigSaved?: (config: AppConfiguration) => void;
}

export const ConfigureSettingsModal: React.FC<ConfigureSettingsModalProps> = ({
  isOpen,
  onClose,
  isHindi,
  initialSection,
  onConfigSaved
}) => {
  const [config, setConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [activeSection, setActiveSection] = useState<ConfigureSection>(initialSection || 'features');
  const [savedToast, setSavedToast] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setConfig(loadAppConfig());
      if (initialSection) {
        setActiveSection(initialSection);
      }
    }
  }, [isOpen, initialSection]);

  if (!isOpen) return null;

  const handleToggle = (key: keyof AppConfiguration) => {
    setConfig(prev => {
      const nextVal = !prev[key];
      if (prev.soundEffects) {
        playAudioBeep('click');
      }
      return { ...prev, [key]: nextVal };
    });
  };

  const handleApplyPreset = (preset: ErpFeaturePreset) => {
    setConfig(prev => {
      const next = applyErpFeaturePreset(prev, preset);
      if (prev.soundEffects) playAudioBeep('click');
      return next;
    });
  };

  const handleUpdate = <K extends keyof AppConfiguration>(key: K, value: AppConfiguration[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveAppConfig(config);
    if (config.soundEffects) {
      playAudioBeep('success');
    }
    setSavedToast(true);
    if (onConfigSaved) onConfigSaved(config);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 900);
  };

  const handleReset = () => {
    setConfig(DEFAULT_APP_CONFIG);
    saveAppConfig(DEFAULT_APP_CONFIG);
    if (DEFAULT_APP_CONFIG.soundEffects) {
      playAudioBeep('warning');
    }
    setSavedToast(true);
    if (onConfigSaved) onConfigSaved(DEFAULT_APP_CONFIG);
    setTimeout(() => setSavedToast(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto text-[var(--text-primary)]">
        
        {/* Header */}
        <div className="hv-elevated px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 hv-pill-amber border rounded-xl">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-sm md:text-base text-[var(--text-primary)] tracking-tight">
                  {isHindi ? '⚙️ F12: मास्टर कॉन्फ़िगरेशन एवं वरीयता केंद्र' : '⚙️ F12: Master Configuration & Advanced Preferences'}
                </h3>
                <span className="text-[10px] font-mono hv-pill-amber border px-1.5 py-0.5 rounded font-bold">
                  F12 Quick Key
                </span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi 
                  ? 'अकाउंटिंग, बिलिंग, इन्वेंट्री, वाउचर और वित्तीय रिपोर्ट की सभी असाधारण सेटिंग्स' 
                  : 'Enterprise control over Accounting rules, Fast-track Vouchers, Inventory, Tax, and Reporting'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hv-surface border border-[var(--border-primary)] hover:bg-[var(--hover-surface)] rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Saved Toast Notification */}
        {savedToast && (
          <div className="bg-emerald-600 text-white hv-keep-white px-4 py-2 text-xs font-bold flex items-center gap-2 animate-fadeIn shrink-0">
            <CheckCircle2 className="w-4 h-4" />
            <span>{isHindi ? '✓ कॉन्फ़िगरेशन सेटिंग्स सफलतापूर्वक सुरक्षित कर ली गई हैं!' : '✓ Master Configuration Settings Successfully Saved!'}</span>
          </div>
        )}

        {/* Section Navigation Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto hv-elevated border-b border-[var(--border-primary)] px-4 py-2 shrink-0 text-xs">
          <button
            type="button"
            onClick={() => setActiveSection('features')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'features' 
                ? 'bg-cyan-600 text-white hv-keep-white shadow' 
                : 'hv-pill-cyan border'
            }`}
          >
            <ToggleRight className="w-3.5 h-3.5" />
            <span>{isHindi ? '0. फीचर्स ऑन/ऑफ (Modules)' : '0. Features & Modules'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('general')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'general' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>{isHindi ? '1. सामान्य अकाउंटिंग' : '1. General'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('voucher')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'voucher' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{isHindi ? '2. फास्ट वाउचर' : '2. Fast Voucher'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('inventory')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'inventory' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>{isHindi ? '3. इन्वेंट्री व बारकोड' : '3. Inventory & Stock'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('gst')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'gst' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isHindi ? '4. इनवॉइस व ई-वे' : '4. Invoicing & e-Way'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('tds')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'tds' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <Landmark className="w-3.5 h-3.5 text-amber-500" />
            <span>{isHindi ? '5. टीडीएस एवं वैधानिक टैक्स' : '5. TDS & Statutory'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('special')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'special' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>{isHindi ? '6. स्पेशल टूल्स व MCA सुरक्षा' : '6. Special ERP Tools'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSection('reports')}
            className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition whitespace-nowrap cursor-pointer ${
              activeSection === 'reports' 
                ? 'bg-indigo-600 text-white hv-keep-white shadow' 
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isHindi ? '7. वित्तीय रिपोर्ट प्रारूप' : '7. Reports Format'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6 flex-1 text-xs">

          {/* SECTION 0: SOFTWARE MODULES & FEATURES ENABLE / DISABLE */}
          {activeSection === 'features' && (
            <div className="space-y-5">
              <div className="border-b border-[var(--border-primary)] pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                    <ToggleRight className="w-4 h-4 text-cyan-500" />
                    <span>
                      {isHindi
                        ? 'सॉफ्टवेयर मॉड्यूल और फीचर्स नियंत्रण (Enable / Disable Modules)'
                        : 'Software Modules & Feature Control Center (Enable / Disable)'}
                    </span>
                  </h4>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {isHindi
                      ? 'अपनी आवश्यकता के अनुसार Barcode POS, बिना इन्वेंटरी के अकाउंटिंग (Accounts Only), पेरोल, बजट आदि को ऑन या ऑफ करें।'
                      : 'Tailor the ERP workspace by turning Barcode POS, Accounting Without Inventory (Accounts-Only), Payroll, and other modules ON or OFF.'}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-lg font-bold text-[11px] border shrink-0 ${
                  config.accountingWithoutInventory
                    ? 'hv-pill-amber'
                    : 'hv-pill-emerald'
                }`}>
                  {config.accountingWithoutInventory
                    ? (isHindi ? 'मोड: केवल अकाउंटिंग (No Inventory)' : 'Mode: Accounts Only (No Inventory)')
                    : (isHindi ? 'मोड: पूर्ण ERP (Accounts + Inventory)' : 'Mode: Full ERP (Accounts + Inventory)')}
                </span>
              </div>

              {/* Quick 1-Click ERP Mode Presets */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleApplyPreset('FULL_ERP')}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    !config.accountingWithoutInventory && config.enableBarcodePos && config.enablePayroll
                      ? 'hv-pill-indigo shadow-md'
                      : 'hv-elevated border-[var(--border-primary)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-500" />
                      <span>{isHindi ? 'पूर्ण ERP मोड' : 'Full Business ERP'}</span>
                    </span>
                    {!config.accountingWithoutInventory && config.enableBarcodePos && config.enablePayroll && (
                      <span className="text-[10px] font-bold hv-pill-indigo border px-1.5 py-0.5 rounded">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi
                      ? 'अकाउंटिंग + इन्वेंटरी + बारकोड POS + GST + पेरोल सभी फीचर्स चालू।'
                      : 'All features ON: Accounting, Stock Inventory, Barcode POS, GST & Payroll.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('ACCOUNTS_ONLY')}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    config.accountingWithoutInventory
                      ? 'hv-pill-amber shadow-md'
                      : 'hv-elevated border-[var(--border-primary)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-amber-500" />
                      <span>{isHindi ? 'केवल अकाउंटिंग (No Inventory)' : 'Accounts Only (No Inventory)'}</span>
                    </span>
                    {config.accountingWithoutInventory && (
                      <span className="text-[10px] font-bold hv-pill-amber border px-1.5 py-0.5 rounded">ACTIVE</span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi
                      ? 'सेवा व्यवसाय / CA के लिए: बिना स्टॉक/POS के शुद्ध खाता बही, सर्विस बिल व P&L।'
                      : 'For Service/Consultancy/CA: hides Stock & POS; service/particular billing only.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleApplyPreset('POS_RETAIL')}
                  className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                    !config.accountingWithoutInventory && config.enableBarcodePos && config.posAutoPromptNewBarcode
                      ? 'hv-pill-cyan shadow-md'
                      : 'hv-elevated border-[var(--border-primary)] hover:border-[var(--border-subtle)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-extrabold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ScanBarcode className="w-4 h-4 text-cyan-500" />
                      <span>{isHindi ? 'रिटेल बारकोड POS रेडी' : 'Retail Barcode POS Ready'}</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi
                      ? 'फास्ट काउंटर POS + अनजान बारकोड स्कैन पर नया आइटम व स्टॉक तुरंत जोड़ें।'
                      : 'Counter POS ON + auto-popup to register & add stock for new scanned barcodes.'}
                  </p>
                </button>
              </div>

              {/* Primary Mode Switch: Accounting Without Inventory */}
              <div className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition ${
                config.accountingWithoutInventory
                  ? 'hv-pill-amber'
                  : 'hv-elevated border-[var(--border-primary)] hover:border-[var(--border-subtle)]'
              }`}>
                <div className="space-y-1">
                  <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-2 flex-wrap">
                    <Calculator className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {isHindi
                        ? 'बिना इन्वेंटरी के अकाउंटिंग मोड (Accounting Without Inventory / Accounts Only)'
                        : 'Accounting Without Inventory (Accounts-Only Mode)'}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                      config.accountingWithoutInventory ? 'bg-amber-500 text-slate-950 border-amber-600' : 'hv-pill-slate'
                    }`}>
                      {config.accountingWithoutInventory ? 'ENABLED' : 'DISABLED'}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi
                      ? 'चालू करने पर इन्वेंटरी स्टॉक और बारकोड POS मेनू छुप जाएंगे, तथा इनवॉइस/परचेज में सीधे सेवा या विवरण (Particulars) दर्ज होंगे — बिना स्टॉक कटौती के।'
                      : 'When enabled, hides Inventory & Barcode POS menus and switches Sales/Purchase entry to direct particulars/service descriptions without stock movement.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle('accountingWithoutInventory')}
                  aria-label="Toggle Accounting Without Inventory"
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    config.accountingWithoutInventory ? 'bg-amber-500' : 'hv-progress-track'
                  }`}
                >
                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    config.accountingWithoutInventory ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </button>
              </div>

              {/* Individual Module Feature Switches */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* 1. Barcode POS Billing Menu */}
                <div className={`hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 transition ${
                  config.accountingWithoutInventory ? 'opacity-60' : 'hover:border-cyan-500/40'
                }`}>
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ScanBarcode className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span>{isHindi ? 'बारकोड POS बिलिंग मेनू' : 'Barcode POS Billing Menu'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {config.accountingWithoutInventory
                        ? (isHindi ? 'Accounts-Only मोड चालू होने के कारण स्वतः बंद है।' : 'Automatically hidden while Accounts-Only mode is active.')
                        : (isHindi ? 'साइडबार व हेडर में तेज़ बारकोड काउंटर POS टर्मिनल दिखाएं/छुपाएं।' : 'Show/hide High-Speed Barcode Counter POS terminal across navigation.')}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={config.accountingWithoutInventory}
                    onClick={() => handleToggle('enableBarcodePos')}
                    aria-label="Toggle Barcode POS Billing Menu"
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.accountingWithoutInventory ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${!config.accountingWithoutInventory && config.enableBarcodePos ? 'bg-cyan-600' : 'hv-progress-track'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      !config.accountingWithoutInventory && config.enableBarcodePos ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 2. Auto-Popup Scan-to-Add Unknown Barcode */}
                <div className={`hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 transition ${
                  config.accountingWithoutInventory || !config.enableBarcodePos ? 'opacity-60' : 'hover:border-cyan-500/40'
                }`}>
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'POS: नए बारकोड स्कैन पर तुरंत आइटम/स्टॉक जोड़ें' : 'POS: Scan Unknown Barcode to Add Item & Stock'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi
                        ? 'बिलिंग के दौरान नया बारकोड स्कैन होने पर नाम, HSN, विवरण व स्टॉक जोड़ने का पॉप-अप स्वतः खोलें।'
                        : 'Auto-open quick item & stock registration (Name, HSN, Description, Qty) when an unknown barcode is scanned.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={config.accountingWithoutInventory || !config.enableBarcodePos}
                    onClick={() => handleToggle('posAutoPromptNewBarcode')}
                    aria-label="Toggle POS Auto-Prompt New Barcode"
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.accountingWithoutInventory || !config.enableBarcodePos ? 'cursor-not-allowed' : 'cursor-pointer'
                    } ${config.posAutoPromptNewBarcode ? 'bg-emerald-600' : 'hv-progress-track'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.posAutoPromptNewBarcode ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 3. Purchases & Purchase Orders */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ShoppingBag className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'खरीद एवं परचेज ऑर्डर (Purchases & PO)' : 'Purchases & Purchase Orders'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'विक्रेता परचेज बिल, PO और इनपुट टैक्स क्रेडिट मॉड्यूल चालू/बंद करें।' : 'Enable or hide Vendor Purchase Bills and PO module.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enablePurchases')}
                    aria-label="Toggle Purchases Module"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enablePurchases ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enablePurchases ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 4. Bank Reconciliation */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-teal-500 shrink-0" />
                      <span>{isHindi ? 'बैंक समाधान (Bank Reconciliation)' : 'Bank Reconciliation'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'बैंक स्टेटमेंट मिलान व ऑटो-वाउचर मिलान मेनू ऑन/ऑफ करें।' : 'Enable or hide Bank Statement Matching & Auto-Reconciliation.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableBankReconciliation')}
                    aria-label="Toggle Bank Reconciliation Module"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableBankReconciliation ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableBankReconciliation ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 5. Tax & GST Compliance */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'GST एवं टैक्स अनुपालन (GSTR-1/3B)' : 'Tax & GST Compliance'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'GSTR-1, GSTR-3B, 2A/2B मिलान व टैक्स रिटर्न मॉड्यूल।' : 'Enable or hide GSTR-1, GSTR-3B, and statutory GST returns.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableTaxCompliance')}
                    aria-label="Toggle Tax & GST Compliance Module"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableTaxCompliance ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableTaxCompliance ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 6. Payroll & Salary Slips */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-purple-500 shrink-0" />
                      <span>{isHindi ? 'पेरोल एवं वेतन पर्ची (Payroll)' : 'Payroll & Salary Slips'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'कर्मचारी वेतन, PF/ESI व सैलरी स्लिप मॉड्यूल चालू/बंद करें।' : 'Enable or hide Employee Payroll & Salary Slips management.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enablePayroll')}
                    aria-label="Toggle Payroll Module"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enablePayroll ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enablePayroll ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 7. Budgeting & Expense Control */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <PiggyBank className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'बजट एवं खर्च नियंत्रण (Budgeting)' : 'Budgeting & Expense Limits'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'मासिक व वार्षिक बजट सीमा अलर्ट मॉड्यूल ऑन/ऑफ करें।' : 'Enable or hide Department Budgets & Expense Variance tracking.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableBudgeting')}
                    aria-label="Toggle Budgeting Module"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableBudgeting ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableBudgeting ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 8. Audit Log & History */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'ऑडिट लॉग एवं इतिहास (Audit Log)' : 'Audit Log & History'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'साइडबार से ऑडिट लॉग व्यू मेनू दिखाएं या छुपाएं (MCA लॉग पीछे सक्रिय रहेगा)।' : 'Show or hide Audit Log tab in sidebar (MCA audit recording continues safely).'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableAuditLog')}
                    aria-label="Toggle Audit Log Module"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableAuditLog ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableAuditLog ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              <div className="hv-pill-indigo border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px]">
                  {isHindi
                    ? '💡 टिप: बदलाव तुरंत लागू करने के लिए नीचे "सेटिंग्स सुरक्षित करें (Save F12)" पर क्लिक करें।'
                    : '💡 Tip: Click "Save Configuration (F12)" below to immediately update the sidebar, billing forms, and shortcuts.'}
                </span>
                <button
                  type="button"
                  onClick={handleSave}
                  className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-[11px] transition shrink-0 cursor-pointer"
                >
                  {isHindi ? '✓ अभी लागू करें (Apply Live)' : '✓ Apply Live Now'}
                </button>
              </div>
            </div>
          )}
          
          {/* SECTION 1: GENERAL ACCOUNTING */}
          {activeSection === 'general' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">
                  {isHindi ? 'खाता बही एवं अकाउंटिंग नियंत्रण नियम' : 'General Accounting & Ledger Governance Rules'}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi ? 'व्यापार के वित्तीय नियमों और चेतावनियों को अपनी आवश्यकतानुसार नियंत्रित करें।' : 'Configure warning triggers, round-off automation and party credit tracking.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Negative Cash Warning */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'नेगेटिव कैश बैलेंस चेतावनी (Negative Cash Warning)' : 'Warn on Negative Cash Balance'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'रोकड़ (Cash) शून्य से नीचे जाने पर वाउचर बनाते समय तुरंत चेतावनी दें।' 
                        : 'Alert immediately if cash balance falls below zero during payment or invoice.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('negativeCashWarning')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.negativeCashWarning ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.negativeCashWarning ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 2. Negative Stock Policy (Allow / Warn / Block) */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{isHindi ? 'नेगेटिव स्टॉक नियंत्रण (Allow / Warn / Block)' : 'Negative Stock Policy on Billing'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'स्टॉक कम होने पर अनुमति दें, चेतावनी दिखाएं या बिल पूरी तरह रोकें (Allow / Warn / Block)।' 
                        : 'Allow out-of-stock billing, prompt warning, or strictly block Sales & POS checkout.'}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-1 hv-surface p-1 rounded-xl border border-[var(--border-subtle)] shrink-0">
                    {(
                      [
                        { id: 'ALLOW', label: isHindi ? 'अनुमति' : 'Allow' },
                        { id: 'WARN', label: isHindi ? 'चेतावनी' : 'Warn' },
                        { id: 'BLOCK', label: isHindi ? 'रोकें' : 'Block' },
                      ] as const
                    ).map((opt) => {
                      const activeMode = config.negativeStockMode || (config.negativeStockWarning ? 'WARN' : 'ALLOW');
                      const isSel = activeMode === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              negativeStockMode: opt.id,
                              negativeStockWarning: opt.id !== 'ALLOW',
                            }))
                          }
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                            isSel
                              ? opt.id === 'BLOCK'
                                ? 'bg-rose-600 text-white hv-keep-white'
                                : opt.id === 'WARN'
                                ? 'bg-amber-500 text-slate-950'
                                : 'bg-emerald-600 text-white hv-keep-white'
                              : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Auto Round Off */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>{isHindi ? 'स्वचालित राउंड ऑफ (Auto Round-Off to ₹1)' : 'Auto Round-Off Invoices'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'बिल की कुल राशि को स्वतः निकटतम रुपये में राउंड ऑफ करें (उदा. ₹524.40 ➔ ₹524.00)।' 
                        : 'Automatically round grand total to nearest integer rupee with Round Off ledger.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('autoRoundOff')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.autoRoundOff ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.autoRoundOff ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 4. Bill-by-Bill Tracking */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'बिल-वाइज़ संदर्भ ट्रैकिंग (Bill-by-Bill Details)' : 'Maintain Bill-by-Bill Details'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'पेमेंट और रसीद वाउचर में इनवॉइस नंबर के अनुसार बकाया मिलान सक्षम करें।' 
                        : 'Track party debits and credits against specific invoice reference numbers.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('billByBillTracking')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.billByBillTracking ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.billByBillTracking ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 5. Customer Credit Limit Check */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span>{isHindi ? 'पार्टी क्रेडिट सीमा चेतावनी (Credit Limit Enforcement)' : 'Credit Limit Check on Customer Billing'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'यदि किसी ग्राहक का बकाया बिल उसकी क्रेडिट लिमिट से अधिक हो जाए तो चेतावनी दें।' 
                        : 'Prompt a high-priority warning when customer outstanding balance exceeds authorized credit limit.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <input
                      type="number"
                      value={config.creditLimitAmount}
                      onChange={(e) => handleUpdate('creditLimitAmount', Number(e.target.value) || 0)}
                      className="w-28 hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-right font-mono text-xs font-bold"
                      placeholder="₹500000"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggle('showCreditLimitWarning')}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        config.showCreditLimitWarning ? 'bg-emerald-600' : 'hv-progress-track'
                      }`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        config.showCreditLimitWarning ? 'translate-x-5' : 'translate-x-0'
                      }`} />
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* SECTION 2: FAST VOUCHER ENTRY */}
          {activeSection === 'voucher' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">
                  {isHindi ? 'तीव्र डेटा प्रविष्टि एवं कीबोर्ड शॉर्टकट वरीयताएं' : 'Fast Voucher Entry & Keyboard Velocity Preferences'}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi ? 'अकाउंटेंट के लिए बिना माउस छुए तेज गति से इनवॉइस और वाउचर दर्ज करने की सुविधा।' : 'Optimized for high-speed accountant keystrokes and rapid entry workflows.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Enter Key as Tab */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Keyboard className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>{isHindi ? 'Enter की को Tab की तरह इस्तेमाल करें' : 'Press Enter as Tab in Forms'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'फॉर्म में एंटर दबाते ही सीधे अगले इनपुट बॉक्स पर पहुंचें।' 
                        : 'Navigate immediately to next input field on pressing Enter key (rapid keyboard entry).'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enterToTab')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enterToTab ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enterToTab ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 2. Skip Date Field */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'तारीख फ़ील्ड छोड़ें (Skip Date - आज की तारीख लें)' : 'Skip Date Field (Auto Today)'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'वाउचर बनाते समय कर्सर सीधे पार्टी या लेजर नाम पर जाएगा, तारीख खुद आज की रहेगी।' 
                        : 'Focus cursor directly on Ledger selection, skipping date for ultra-fast creation.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('quickDateSkip')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.quickDateSkip ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.quickDateSkip ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 3. Audio Beep Feedback */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      {config.soundEffects ? <Volume2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <VolumeX className="w-4 h-4 text-[var(--text-muted)] shrink-0" />}
                      <span>{isHindi ? 'वाउचर सुरक्षित होने पर ऑडियो बीप' : 'Audio Beep Confirmation on Save'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'इनवॉइस या पेमेंट सेव होने पर ध्वनि संकेत (Audio Beep) बजेगा।' 
                        : 'Auditory feedback confirming successful posting and voucher storage.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('soundEffects')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.soundEffects ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.soundEffects ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 4. Auto Print Invoice immediately */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Printer className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span>{isHindi ? 'सेव करते ही तुरंत प्रिंट डायलॉग खोलें' : 'Auto-Open Print Preview After Save'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'बिल सुरक्षित होते ही बिना किसी अतिरिक्त क्लिक के तुरंत प्रिंट विंडो खुल जाएगी।' 
                        : 'Instantly launch thermal or A4 print modal right after invoice is created.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('autoPrintInvoice')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.autoPrintInvoice ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.autoPrintInvoice ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* SECTION 3: INVENTORY & STOCK */}
          {activeSection === 'inventory' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">
                  {isHindi ? 'इन्वेंट्री, सामग्री लेजर एवं स्टॉक सेटिंग्स' : 'Inventory Management & Item Ledger Preferences'}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi ? 'बैच नंबर, एक्सपायरी, छूट कॉलम एवं मानक मापक इकाइयों का प्रबंधन।' : 'Configure item discount columns, batch/lot tracking and scheme quantities.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Item Discount Column */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'प्रत्येक आइटम पर अलग छूट कॉलम (Item Discount %)' : 'Separate Item Discount % Column'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'इनवॉइस में हर उत्पाद के लिए अलग से डिस्काउंट (%) दर्ज करने का कॉलम दिखाएं।' 
                        : 'Display dedicated Trade Discount percentage column per item row in bills.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('itemDiscountColumn')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.itemDiscountColumn ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.itemDiscountColumn ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 2. Free Scheme Qty */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Package className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'वास्तविक बनाम बिल मात्रा (Free Qty Scheme)' : 'Actual vs Billed Quantity (Free Qty)'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'व्यापारिक स्कीम जैसे 10+1 फ्री (BOGO) के लिए दोहरी मात्रा कॉलम सक्षम करें।' 
                        : 'Enable dual quantity columns for dispatch vs billing quantity (Free Samples).'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('maintainFreeQty')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.maintainFreeQty ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.maintainFreeQty ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 3. Batch and Expiry Date Tracking */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
                      <span>{isHindi ? 'बैच नंबर व एक्सपायरी तिथि (Batch & Expiry)' : 'Batch No. & Expiry Date Management'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'फार्मा, किराना व खाद्य पदार्थों के लिए बैच नंबर व एक्सपायरी ट्रैकिंग।' 
                        : 'Maintain Batch Numbers and Expiry tracking for pharmaceutical or FMCG trades.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('maintainBatches')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.maintainBatches ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.maintainBatches ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 4. Default Unit */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'डिफ़ॉल्ट मापक इकाई (Default Unit)' : 'Default Item Unit'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'नया स्टॉक जोड़ते समय स्वतः चुनी जाने वाली यूनिट।' : 'Default UOM pre-selected during quick item creation.'}
                    </p>
                  </div>
                  <select
                    value={config.defaultUnit}
                    onChange={(e) => handleUpdate('defaultUnit', e.target.value)}
                    className="hv-input font-bold border border-[var(--border-subtle)] rounded-lg p-2 text-xs"
                  >
                    <option value="PCS">PCS (नग / पीस)</option>
                    <option value="KGS">KGS (किलोग्राम)</option>
                    <option value="BOX">BOX (पेटी / बॉक्स)</option>
                    <option value="MTR">MTR (मीटर)</option>
                    <option value="NOS">NOS (संख्या)</option>
                  </select>
                </div>

              </div>
            </div>
          )}

          {/* SECTION 4: INVOICING, PRINT & E-WAY */}
          {activeSection === 'gst' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <h4 className="font-bold text-sm text-[var(--text-primary)]">
                  {isHindi ? 'यूनिवर्सल प्रिंट कॉन्फ़िगरेशन, इनवॉइस डिज़ाइन एवं ई-वे बिल' : 'Universal Print Configuration, Invoicing Layout & e-Way Limit'}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi ? 'सभी इनवॉइस, वाउचर, सैलरी स्लिप व रिपोर्ट के लिए कागज़, मार्जिन, फ़ॉन्ट, लोगो, QR कोड व हस्ताक्षर सेट करें।' : 'Configure default paper size, orientation, margins, copy label, logo, QR and signatory for all prints & PDFs.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Default Paper Size */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Printer className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'डिफ़ॉल्ट प्रिंट पेपर साइज़ (Paper Size)' : 'Default Print Paper Size'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'A4 फुल शीट, A5 हाफ शीट या थर्मल POS प्रिंटर (80mm/58mm)।' : 'Standard A4 sheet, A5 half page or Thermal POS slip.'}
                    </p>
                  </div>
                  <select
                    value={config.defaultPaperSize}
                    onChange={(e) => handleUpdate('defaultPaperSize', e.target.value as any)}
                    className="hv-input font-bold border border-[var(--border-subtle)] rounded-lg p-2 text-xs"
                  >
                    <option value="A4">A4 Full Sheet (210 × 297 mm)</option>
                    <option value="A5">A5 Half Sheet (148 × 210 mm)</option>
                    <option value="Thermal-3inch">Thermal POS (80mm / 3 inch)</option>
                    <option value="Thermal-58mm">Thermal POS (58mm / 2 inch)</option>
                  </select>
                </div>

                {/* 1b. Print Orientation */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'प्रिंट पेज दिशा (Page Orientation)' : 'Default Page Orientation'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'इनवॉइस, वाउचर व रिपोर्ट के लिए Portrait या Landscape चुनें।' : 'Choose Portrait (vertical) or Landscape (horizontal) sheet layout.'}
                    </p>
                  </div>
                  <select
                    value={config.printOrientation}
                    onChange={(e) => handleUpdate('printOrientation', e.target.value as any)}
                    className="hv-input font-bold border border-[var(--border-subtle)] rounded-lg p-2 text-xs"
                  >
                    <option value="portrait">Portrait (सीधा पेज)</option>
                    <option value="landscape">Landscape (चौड़ा पेज)</option>
                  </select>
                </div>

                {/* 1c. Print Margins */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'प्रिंट पेज मार्जिन (Page Margins)' : 'Print Margins'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'प्रिंट व PDF के चारों ओर की खाली जगह नियंत्रित करें।' : 'Control outer whitespace padding on printed sheets & PDFs.'}
                    </p>
                  </div>
                  <select
                    value={config.printMargins}
                    onChange={(e) => handleUpdate('printMargins', e.target.value as any)}
                    className="hv-input font-bold border border-[var(--border-subtle)] rounded-lg p-2 text-xs"
                  >
                    <option value="compact">Compact / Narrow (6mm)</option>
                    <option value="standard">Standard (10mm)</option>
                    <option value="wide">Wide (16mm)</option>
                  </select>
                </div>

                {/* 1d. Print Font Scale & Copy Label */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'प्रिंट फ़ॉन्ट व कॉपी लेबल (Scale & Copy)' : 'Font Scale & Copy Label'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'प्रिंट अक्षर का आकार व Original/Duplicate लेबल सेट करें।' : 'Configure print text density and Original/Duplicate stamp.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <select
                      value={config.printFontScale}
                      onChange={(e) => handleUpdate('printFontScale', e.target.value as any)}
                      className="hv-input font-bold border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                    >
                      <option value="compact">Font: Compact (92%)</option>
                      <option value="standard">Font: Standard (100%)</option>
                      <option value="large">Font: Large (108%)</option>
                    </select>
                    <select
                      value={config.printCopyLabel}
                      onChange={(e) => handleUpdate('printCopyLabel', e.target.value as any)}
                      className="hv-input font-bold border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                    >
                      <option value="ORIGINAL">ORIGINAL FOR RECIPIENT</option>
                      <option value="DUPLICATE">DUPLICATE FOR TRANSPORTER</option>
                      <option value="TRIPLICATE">TRIPLICATE FOR SUPPLIER</option>
                      <option value="OFFICE">OFFICE / AUDIT COPY</option>
                      <option value="NONE">Hide Copy Label</option>
                    </select>
                  </div>
                </div>

                {/* 1e. Show Company Logo on Print */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'प्रिंट पर कंपनी लोगो दिखाएं' : 'Show Company Logo on Prints'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'बिल, वाउचर, सैलरी स्लिप व रिपोर्ट पर कंपनी लोगो छापें।' : 'Include company brand logo across all printed documents and PDFs.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('showCompanyLogoOnPrint')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.showCompanyLogoOnPrint ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.showCompanyLogoOnPrint ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 1f. Show HSN & Terms on Print */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'HSN / GST कॉलम एवं नियम-शर्तें दिखाएं' : 'Show HSN/GST Columns & Terms'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'इनवॉइस में HSN, Tax % और नीचे Terms & Conditions दिखाएं।' : 'Include HSN/SAC, tax breakdown columns and invoice terms block.'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                      <span>HSN/Tax</span>
                      <input
                        type="checkbox"
                        checked={config.showHsnTaxBreakdown}
                        onChange={() => handleToggle('showHsnTaxBreakdown')}
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[var(--text-primary)] cursor-pointer">
                      <span>Terms</span>
                      <input
                        type="checkbox"
                        checked={config.showTermsOnPrint}
                        onChange={() => handleToggle('showTermsOnPrint')}
                        className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                      />
                    </label>
                  </div>
                </div>

                {/* 2. Bank UPI QR Code on Bill */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <QrCode className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'बिल पर बैंक UPI QR कोड छापें' : 'Print Dynamic UPI / Bank QR Code'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'ग्राहक द्वारा मोबाइल से तुरंत स्कैन करके भुगतान करने हेतु बिल पर क्यूआर कोड।' 
                        : 'Print instant scan-and-pay UPI QR code with exact invoice payable amount.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('showBankQrCode')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.showBankQrCode ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.showBankQrCode ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 3. Authorized Signatory Line */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-cyan-500 shrink-0" />
                      <span>{isHindi ? 'अधिकृत हस्ताक्षरकर्ता एवं मुहर' : 'Print Authorized Signatory & Digital Stamp'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'इनवॉइस, वाउचर व रिपोर्ट के अंत में कानूनी हस्ताक्षर बॉक्स दिखाएं।' 
                        : 'Include legal signature endorsement block across all printed reports & bills.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('showAuthorizedSignatory')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.showAuthorizedSignatory ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.showAuthorizedSignatory ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 4. e-Way Bill Threshold */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'ई-वे बिल ऑटो-प्रॉम्प्ट सीमा (e-Way Bill Limit)' : 'e-Way Bill Auto Threshold (GST Law)'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'जीएसटी नियम अनुसार इस राशि से अधिक के बिल पर ई-वे बिल बनेगा।' : 'Statutory e-Way generation trigger amount (standard: ₹50,000).'}
                    </p>
                  </div>
                  <input
                    type="number"
                    value={config.ewayBillThreshold}
                    onChange={(e) => handleUpdate('ewayBillThreshold', Number(e.target.value) || 50000)}
                    className="w-28 hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-right font-mono text-xs font-bold"
                  />
                </div>

              </div>
            </div>
          )}

          {/* SECTION 5: TDS & STATUTORY TAX CONFIGURATION */}
          {activeSection === 'tds' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-amber-500 flex items-center gap-1.5">
                      <Landmark className="w-4 h-4 text-amber-500" />
                      <span>{isHindi ? 'आयकर टीडीएस एवं वैधानिक कर सेटिंग्स (TDS / TCS Compliance)' : 'Income Tax TDS & Statutory Rules (TDS / TCS Compliance)'}</span>
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isHindi 
                        ? 'खरीद, सप्लायर बिलों, ठेकेदारों (194C), पेशेवर फीस (194J), किराए (194I) एवं टीसीएस पर स्वचालित कर कटौती व नियम।' 
                        : 'Configure Tax Deducted at Source (TDS Sections 194C, 194J, 194I, 194H, 194Q) & TCS rules.'}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono hv-pill-amber border px-2 py-0.5 rounded-lg font-bold">
                    IT Act 1961
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Enable TDS Module */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'टीडीएस (TDS) कटौती एवं वैधानिक बहीखाता सक्रिय करें' : 'Enable TDS Statutory Accounting & Deductions'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'सप्लायर वाउचर व खर्च एंट्री करते समय टीडीएस काटने व टीडीएस लेजर में स्वतः पोस्ट करने की सुविधा।' 
                        : 'Enables automatic TDS deduction during purchase bills and expense voucher postings.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableTds')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableTds ? 'bg-amber-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableTds ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 2. Company TAN Number */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'कंपनी टैन नंबर (TAN Number)' : 'Company TAN Number (10-Digit)'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'आयकर विभाग द्वारा आवंटित टैक्स डिडक्शन अकाउंट नंबर।' : 'Tax Deduction and Collection Account Number (e.g. DELB12345F).'}
                    </p>
                  </div>
                  <input
                    type="text"
                    maxLength={10}
                    value={config.companyTanNumber}
                    onChange={(e) => handleUpdate('companyTanNumber', e.target.value.toUpperCase())}
                    placeholder="DELB12345F"
                    className="w-32 hv-input border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-center font-mono text-xs text-amber-500 font-bold uppercase tracking-wider"
                  />
                </div>

                {/* 3. Deductor Type */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'कटौतीकर्ता की श्रेणी (Deductor Type)' : 'Deductor Entity Category'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'धारा 194C अनुसार कंपनी (2%) व व्यक्ति/फर्म (1%) दर।' : 'Statutory classification for 194C rate determination.'}
                    </p>
                  </div>
                  <select
                    value={config.tdsDeductorType}
                    onChange={(e) => handleUpdate('tdsDeductorType', e.target.value as any)}
                    className="hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <option value="Company">🏢 Company / कॉर्पोरेट</option>
                    <option value="Individual_HUF">👤 Individual / HUF</option>
                    <option value="Firm">👥 Partnership Firm</option>
                  </select>
                </div>

                {/* 4. Threshold Limit Auto-Check */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'वार्षिक टीडीएस थ्रेशोल्ड सीमा पार चेतावनी' : 'Statutory Threshold Limits Alert'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? '194C (₹30K एकल/₹1L कुल), 194J (₹30K), 194I किराया (₹2.4L) सीमा पार होने पर स्वतः चेतावनी।' 
                        : 'Alerts when vendor payment exceeds statutory exemption limit.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('autoTdsThresholdWarning')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.autoTdsThresholdWarning ? 'bg-amber-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.autoTdsThresholdWarning ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 5. Section 206AA - 20% TDS if No PAN */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'पैन (PAN) न होने पर 20% उच्च टीडीएस (Sec 206AA)' : 'Higher TDS @ 20% if No PAN (Sec 206AA)'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'यदि वेंडर का पैन नंबर उपलब्ध नहीं है, तो कानूनन 20% की उच्च दर से टीडीएस काटें।' 
                        : 'Statutory mandate to apply 20% withholding rate when PAN is not furnished.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('tdsHigherRateNoPan')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.tdsHigherRateNoPan ? 'bg-amber-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.tdsHigherRateNoPan ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 6. Section 288B - Round to nearest rupee */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'टीडीएस राशि निकटतम ₹1 में पूर्णांकित (Sec 288B)' : 'Round TDS to Nearest Rupee (Sec 288B)'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'दशमलव के पैसे हटाकर टीडीएस को पूर्ण रुपये में राउंड ऑफ करें।' : 'Rounds withholding tax to nearest whole integer as per IT rules.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('roundOffTdsToRupee')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.roundOffTdsToRupee ? 'bg-amber-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.roundOffTdsToRupee ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 7. Auto Create TDS Payable Journal Voucher */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'ऑटो टीडीएस देयता वाउचर (Auto TDS Payable A/c)' : 'Auto TDS Payable Journal Voucher'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'बिल सेव होते ही "TDS Payable A/c" के क्रेडिट में स्वतः वाउचर पोस्ट करें।' : 'Automatically generates matching credit voucher for TDS liability.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('autoCreateTdsVoucher')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.autoCreateTdsVoucher ? 'bg-amber-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.autoCreateTdsVoucher ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 8. Enable TCS on Sales over 50 Lakhs */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{isHindi ? 'धारा 206C(1H) - ₹50 लाख से अधिक बिक्री पर टीसीएस (TCS) लागू करें' : 'TCS on Sales exceeding ₹50 Lakhs (Sec 206C(1H))'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'किसी वित्तीय वर्ष में ग्राहक को कुल बिक्री ₹50 लाख पार होने पर 0.1% टीसीएस संग्रह।' 
                        : 'Collects 0.1% TCS on receipt from buyers exceeding ₹50 Lakhs aggregate turnover threshold.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableTcs')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableTcs ? 'bg-amber-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableTcs ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* SECTION 6: SPECIAL ENTERPRISE FEATURES & MCA SECURITY */}
          {activeSection === 'special' && (
            <div className="space-y-4 animate-fadeIn">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-emerald-500 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                      <span>{isHindi ? 'विशेष एंटरप्राइज ऑटोमेशन व MCA सुरक्षा नियम' : 'Exclusive Enterprise Automation & MCA Governance'}</span>
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isHindi 
                        ? 'व्हाट्सएप क्लाउड बिलिंग, थर्मल POS रसीद, MCA 2023 ऑडिट ट्रेल, बुक्स लॉक एवं बैंक ऑटो-मैचिंग सुविधाएं।' 
                        : 'Cutting-edge WhatsApp billing, Thermal POS slip mode, MCA audit locks, period freezing, and barcode automation.'}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono hv-pill-emerald border px-2 py-0.5 rounded-lg font-bold">
                    PRO Suite
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. WhatsApp Cloud Invoicing Auto-Dispatcher */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{isHindi ? 'व्हाट्सएप (WhatsApp) पर 1-क्लिक इनवॉइस व भुगतान लिंक भेजें' : 'WhatsApp Instant Cloud Invoice & Payment Dispatcher'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'बिल सेव करते ही ग्राहक के व्हाट्सएप पर सीधे पीडीएफ बिल व यूपीआई भुगतान का संदेश तैयार करने की सुविधा।' 
                        : 'Generates direct WhatsApp shareable dispatch payload with bill total and instant payment link.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableWhatsAppInvoice')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableWhatsAppInvoice ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableWhatsAppInvoice ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 2. WhatsApp Sender Signature */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'व्हाट्सएप संदेश प्रेषक नाम (Sender Signature)' : 'WhatsApp Dispatch Signature'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'व्हाट्सएप मैसेज के अंत में दिखाई देने वाला व्यावसायिक नाम।' : 'Closing brand signature appended to invoice dispatch messages.'}
                    </p>
                  </div>
                  <input
                    type="text"
                    value={config.whatsAppSenderName}
                    onChange={(e) => handleUpdate('whatsAppSenderName', e.target.value)}
                    placeholder="Hisab Veda ERP"
                    className="w-36 hv-input border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-emerald-500 font-bold"
                  />
                </div>

                {/* 3. Thermal POS Printer Mode */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isHindi ? 'थर्मल POS रोल रसीद प्रिंटर मोड (Retail Roll)' : 'Thermal POS Roll Printer Support'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'काउंटर बिक्री हेतु A4 की जगह 58mm/80mm रोल पर त्वरित रसीद प्रिंटिंग।' : 'Enables compact thermal slip receipts formatted for retail cash counters.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('enableThermalPosPrinter')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.enableThermalPosPrinter ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.enableThermalPosPrinter ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 4. Thermal Paper Width */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs">
                      {isHindi ? 'थर्मल पेपर चौड़ाई (Roll Width)' : 'Thermal Receipt Width'}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? '2-इंच (58mm) या 3-इंच (80mm) POS प्रिंटर साइज।' : 'Select 58mm (2-inch standard) or 80mm (3-inch wide).'}
                    </p>
                  </div>
                  <select
                    value={config.thermalPaperWidth}
                    onChange={(e) => handleUpdate('thermalPaperWidth', e.target.value as any)}
                    className="hv-input border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-bold cursor-pointer"
                  >
                    <option value="80mm">3-इंच (80mm Wide Roll)</option>
                    <option value="58mm">2-इंच (58mm Compact Roll)</option>
                  </select>
                </div>

                {/* 5. MCA 2023 Audit Trail Lock */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isHindi ? 'MCA 2023 अपरिवर्तनीय ऑडिट ट्रेल (Audit Lock)' : 'MCA 2023 Mandatory Audit Trail Lock'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'कंपनी मामलों के मंत्रालय (MCA) अनुसार किसी भी वाउचर के संपादन का इतिहास कभी न मिटने वाला रिकॉर्ड।' : 'Complies with Indian Companies Act requirement for unalterable audit trail logging.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('mcaAuditTrailMandatory')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.mcaAuditTrailMandatory ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.mcaAuditTrailMandatory ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 6. Period Books Lock Date */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Lock className="w-4 h-4 text-rose-400 shrink-0" />
                      <span>{isHindi ? 'लेखा पुस्तकें फ्रीज / लॉक तिथि' : 'Freeze & Lock Books Prior To Date'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'इस तिथि से पहले के किसी भी वाउचर में बदलाव या नई एंट्री पर पूर्ण रोक।' : 'Disallows editing, creation, or deletion of transactions before this freeze date.'}
                    </p>
                  </div>
                  <input
                    type="date"
                    value={config.booksLockDate}
                    onChange={(e) => handleUpdate('booksLockDate', e.target.value)}
                    className="hv-input border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs text-rose-400 font-bold cursor-pointer"
                  />
                </div>

                {/* 7. Barcode Auto-Increment Quantity */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Barcode className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isHindi ? 'बारकोड दोबारा स्कैन पर मात्रा +1 स्वतः बढ़ाएं' : 'Barcode Auto-Increment Quantity (+1)'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'एक ही उत्पाद को दोबारा स्कैन करने पर बिना रुके मात्रा में 1 जोड़ें।' : 'Repeated scans of the same item automatically increments quantity without popups.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('barcodeAutoIncrementQty')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.barcodeAutoIncrementQty ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.barcodeAutoIncrementQty ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

                {/* 8. Bank Reconciliation Clearance Tolerance */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isHindi ? 'बैंक चेक क्लीयरेंस विंडो (Tolerance)' : 'Bank Clearance Date Tolerance'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi ? 'बैंक स्टेटमेंट में चेक पास होने की तिथि में ± दिनों की छूट।' : 'Smart AI matching tolerance for cheque deposit vs clearance delay.'}
                    </p>
                  </div>
                  <select
                    value={config.bankMatchToleranceDays}
                    onChange={(e) => handleUpdate('bankMatchToleranceDays', Number(e.target.value) || 3)}
                    className="hv-input border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs text-emerald-400 font-bold cursor-pointer"
                  >
                    <option value={1}>± 1 दिन (Strict 24h)</option>
                    <option value={2}>± 2 दिन</option>
                    <option value={3}>± 3 दिन (Standard 72h)</option>
                    <option value={5}>± 5 दिन (Lenient 5-Day)</option>
                  </select>
                </div>

              </div>
            </div>
          )}

          {/* SECTION 7: FINANCIAL REPORTS VIEW FORMAT */}
          {activeSection === 'reports' && (
            <div className="space-y-4">
              <div className="border-b border-[var(--border-primary)] pb-2">
                <h4 className="font-bold text-sm text-amber-400">
                  {isHindi ? 'वित्तीय रिपोर्ट प्रारूप (Detailed All-Ledgers vs Condensed View)' : 'Financial Reports View Preferences (Condensed vs Detailed)'}
                </h4>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi 
                    ? 'बैलेंस शीट, लाभ-हानि व ट्रायल बैलेंस को संक्षिप्त (ग्रुप-वाइज़) या विस्तृत (सभी लेजर सहित) रूप में देखने का डिफ़ॉल्ट विकल्प।' 
                    : 'Set default viewing mode for Balance Sheet, Profit & Loss and Trial Balance across the system.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* 1. Default Report View Mode: Condensed vs Detailed */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-center justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>{isHindi ? 'डिफ़ॉल्ट वित्तीय रिपोर्ट दृश्य (Default Report Mode)' : 'Default Financial Statement View'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'Condensed: मुख्य ग्रुपों का सारांश | Detailed: सभी सब-लेजर खातों की पूरी सूची व व्यक्तिगत शेष।' 
                        : 'Condensed shows clean group heads; Detailed explodes every individual sub-ledger account.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 p-1 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl">
                    <button
                      type="button"
                      onClick={() => handleUpdate('defaultFinancialReportMode', 'condensed')}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                        config.defaultFinancialReportMode === 'condensed'
                          ? 'bg-indigo-600 text-white hv-keep-white shadow'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
                      }`}
                    >
                      {isHindi ? 'संक्षिप्त (Condensed)' : 'Condensed'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate('defaultFinancialReportMode', 'detailed')}
                      className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                        config.defaultFinancialReportMode === 'detailed'
                          ? 'bg-indigo-600 text-white hv-keep-white shadow'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)]'
                      }`}
                    >
                      {isHindi ? 'विस्तृत (Detailed All Ledgers)' : 'Detailed (All Ledgers)'}
                    </button>
                  </div>
                </div>

                {/* 2. Show Zero Balance Ledgers */}
                <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex items-start justify-between gap-3 hover:border-[var(--border-subtle)] transition md:col-span-2">
                  <div className="space-y-1">
                    <div className="font-bold text-[var(--text-primary)] text-xs flex items-center gap-1.5">
                      <Scale className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{isHindi ? 'शून्य बैलेंस वाले लेजर भी रिपोर्ट में दिखाएं' : 'Include Zero-Balance Accounts in Reports'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {isHindi 
                        ? 'जिन खातों में वर्तमान में शून्य (₹0.00) शेष है उन्हें भी ट्रायल बैलेंस व विवरण में शामिल करें।' 
                        : 'Display accounts with nil balance in full audit listings.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggle('showZeroBalanceLedgers')}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      config.showZeroBalanceLedgers ? 'bg-emerald-600' : 'hv-progress-track'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      config.showZeroBalanceLedgers ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="hv-elevated px-5 py-3.5 border-t border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-rose-400 font-semibold px-3 py-1.5 rounded-xl border border-[var(--border-subtle)] hover:border-rose-500/40 transition cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isHindi ? 'डिफ़ॉल्ट सेटिंग्स रीसेट करें' : 'Reset Factory Defaults'}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl transition cursor-pointer"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 px-5 py-2 text-xs font-extrabold text-white hv-keep-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg transition cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{isHindi ? 'सेटिंग्स सुरक्षित करें (Save F12)' : 'Save Configuration (F12)'}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
