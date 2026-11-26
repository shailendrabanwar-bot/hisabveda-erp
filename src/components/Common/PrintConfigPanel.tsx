import React, { useState } from 'react';
import { Sliders, Save, Check, RotateCcw } from 'lucide-react';
import { AppConfiguration, DEFAULT_APP_CONFIG, saveAppConfig } from '../../utils/appConfig';

export type PrintDocumentKind = 'invoice' | 'purchase' | 'voucher' | 'salary' | 'financial' | 'brs' | 'eway';

interface PrintConfigPanelProps {
  config: AppConfiguration;
  onChange: (next: AppConfiguration) => void;
  isHindi: boolean;
  docKind: PrintDocumentKind;
  allowThermal?: boolean;
}

export const PrintConfigPanel: React.FC<PrintConfigPanelProps> = ({
  config,
  onChange,
  isHindi,
  docKind,
  allowThermal = false
}) => {
  const [savedNotice, setSavedNotice] = useState(false);

  const updateField = <K extends keyof AppConfiguration>(key: K, val: AppConfiguration[K]) => {
    const updated = { ...config, [key]: val };
    onChange(updated);
  };

  const handleSaveAsDefault = () => {
    saveAppConfig(config);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2200);
  };

  const handleResetDefaults = () => {
    const resetCfg: AppConfiguration = {
      ...config,
      defaultPaperSize: DEFAULT_APP_CONFIG.defaultPaperSize,
      printOrientation: DEFAULT_APP_CONFIG.printOrientation,
      printMargins: DEFAULT_APP_CONFIG.printMargins,
      printFontScale: DEFAULT_APP_CONFIG.printFontScale,
      showCompanyLogoOnPrint: DEFAULT_APP_CONFIG.showCompanyLogoOnPrint,
      showBankQrCode: DEFAULT_APP_CONFIG.showBankQrCode,
      showAuthorizedSignatory: DEFAULT_APP_CONFIG.showAuthorizedSignatory,
      showTermsOnPrint: DEFAULT_APP_CONFIG.showTermsOnPrint,
      showHsnTaxBreakdown: DEFAULT_APP_CONFIG.showHsnTaxBreakdown,
      showPreparedByCheckedBy: DEFAULT_APP_CONFIG.showPreparedByCheckedBy,
      printCopyLabel: DEFAULT_APP_CONFIG.printCopyLabel,
      printWatermarkText: DEFAULT_APP_CONFIG.printWatermarkText,
      invoicePrintTheme: DEFAULT_APP_CONFIG.invoicePrintTheme,
    };
    onChange(resetCfg);
    saveAppConfig(resetCfg);
  };

  return (
    <div className="bg-slate-950 border-b border-slate-800 px-4 py-3 text-xs text-slate-200 shrink-0 no-print">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-bold text-slate-100">
            {isHindi ? 'प्रिंट कॉन्फ़िगरेशन (Print Configuration)' : 'Print Configuration & Page Setup'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 font-semibold transition cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>{isHindi ? 'रीसेट' : 'Reset'}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAsDefault}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition cursor-pointer ${
              savedNotice
                ? 'bg-emerald-600 text-white'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {savedNotice ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            <span>
              {savedNotice
                ? isHindi
                  ? 'डिफ़ॉल्ट सहेजा गया'
                  : 'Saved as Default'
                : isHindi
                ? 'सभी प्रिंट के लिए डिफ़ॉल्ट सहेजें'
                : 'Save as Default'}
            </span>
          </button>
        </div>
      </div>

      {/* Primary Layout Selectors */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 mb-2.5">
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {isHindi ? 'पेपर साइज़ (Paper Size)' : 'Paper Size'}
          </label>
          <select
            value={config.defaultPaperSize}
            onChange={(e) => updateField('defaultPaperSize', e.target.value as AppConfiguration['defaultPaperSize'])}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-semibold focus:border-indigo-500 outline-none"
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="A5">A5 (148 × 210 mm)</option>
            {allowThermal && <option value="Thermal-3inch">Thermal POS (80mm)</option>}
            {allowThermal && <option value="Thermal-58mm">Thermal POS (58mm)</option>}
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {isHindi ? 'ओरिएंटेशन (Orientation)' : 'Orientation'}
          </label>
          <select
            value={config.printOrientation}
            onChange={(e) => updateField('printOrientation', e.target.value as 'portrait' | 'landscape')}
            disabled={config.defaultPaperSize.startsWith('Thermal')}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-semibold focus:border-indigo-500 outline-none disabled:opacity-50"
          >
            <option value="portrait">{isHindi ? 'पोर्ट्रेट (Portrait)' : 'Portrait'}</option>
            <option value="landscape">{isHindi ? 'लैंडस्केप (Landscape)' : 'Landscape'}</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {isHindi ? 'मार्जिन (Page Margin)' : 'Page Margins'}
          </label>
          <select
            value={config.printMargins}
            onChange={(e) => updateField('printMargins', e.target.value as 'compact' | 'standard' | 'wide')}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-semibold focus:border-indigo-500 outline-none"
          >
            <option value="compact">{isHindi ? 'कम (Narrow 6mm)' : 'Compact / Narrow'}</option>
            <option value="standard">{isHindi ? 'सामान्य (Standard 10mm)' : 'Standard'}</option>
            <option value="wide">{isHindi ? 'अधिक (Wide 16mm)' : 'Wide'}</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1">
            {isHindi ? 'फ़ॉन्ट आकार (Font Size)' : 'Font Scale'}
          </label>
          <select
            value={config.printFontScale}
            onChange={(e) => updateField('printFontScale', e.target.value as 'compact' | 'standard' | 'large')}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-semibold focus:border-indigo-500 outline-none"
          >
            <option value="compact">{isHindi ? 'छोटा (Compact)' : 'Compact (92%)'}</option>
            <option value="standard">{isHindi ? 'मानक (Standard)' : 'Standard (100%)'}</option>
            <option value="large">{isHindi ? 'बड़ा (Large)' : 'Large (110%)'}</option>
          </select>
        </div>

        {(docKind === 'invoice' || docKind === 'purchase' || docKind === 'voucher') && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              {isHindi ? 'कॉपी लेबल (Copy Label)' : 'Copy Label'}
            </label>
            <select
              value={config.printCopyLabel}
              onChange={(e) => updateField('printCopyLabel', e.target.value as AppConfiguration['printCopyLabel'])}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-semibold focus:border-indigo-500 outline-none"
            >
              <option value="ORIGINAL">ORIGINAL FOR RECIPIENT</option>
              <option value="DUPLICATE">DUPLICATE FOR TRANSPORTER</option>
              <option value="TRIPLICATE">TRIPLICATE FOR SUPPLIER</option>
              <option value="OFFICE">OFFICE / AUDIT COPY</option>
              <option value="NONE">{isHindi ? 'कोई नहीं (None)' : 'None (Hide)'}</option>
            </select>
          </div>
        )}

        {docKind === 'invoice' && (
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              {isHindi ? 'इनवॉइस थीम (Layout)' : 'Invoice Print Theme'}
            </label>
            <select
              value={config.invoicePrintTheme || 'GST_STANDARD'}
              onChange={(e) => updateField('invoicePrintTheme', e.target.value as 'GST_STANDARD' | 'MODERN')}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100 font-semibold focus:border-indigo-500 outline-none"
            >
              <option value="GST_STANDARD">{isHindi ? 'A4 GST स्टैंडर्ड' : 'GST Standard (Classic)'}</option>
              <option value="MODERN">{isHindi ? 'आधुनिक थीम (Modern)' : 'Modern Accent Theme'}</option>
            </select>
          </div>
        )}
      </div>

      {/* Section Visibility Toggles */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-[11px]">
        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.showCompanyLogoOnPrint}
            onChange={(e) => updateField('showCompanyLogoOnPrint', e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
          />
          <span>{isHindi ? 'कंपनी लोगो' : 'Company Logo'}</span>
        </label>

        {docKind === 'invoice' && (
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.showBankQrCode}
              onChange={(e) => updateField('showBankQrCode', e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
            />
            <span>{isHindi ? 'बैंक व UPI QR कोड' : 'Bank & UPI QR'}</span>
          </label>
        )}

        {(docKind === 'invoice' || docKind === 'purchase') && (
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.showHsnTaxBreakdown}
              onChange={(e) => updateField('showHsnTaxBreakdown', e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
            />
            <span>{isHindi ? 'HSN व GST दर कॉलम' : 'HSN & GST Columns'}</span>
          </label>
        )}

        {docKind === 'invoice' && (
          <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={config.showTermsOnPrint}
              onChange={(e) => updateField('showTermsOnPrint', e.target.checked)}
              className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
            />
            <span>{isHindi ? 'नियम व शर्तें' : 'Terms & Conditions'}</span>
          </label>
        )}

        <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={config.showAuthorizedSignatory}
            onChange={(e) => updateField('showAuthorizedSignatory', e.target.checked)}
            className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
          />
          <span>{isHindi ? 'अधिकृत हस्ताक्षर' : 'Authorized Signatory'}</span>
        </label>
      </div>
    </div>
  );
};

export function getPaperPaddingClass(margins: AppConfiguration['printMargins']): string {
  if (margins === 'compact') return 'p-3 sm:p-4';
  if (margins === 'wide') return 'p-8 sm:p-11';
  return 'p-6 md:p-8';
}

export function getPaperWidthClass(
  paperSize: AppConfiguration['defaultPaperSize'],
  orientation: AppConfiguration['printOrientation']
): string {
  if (paperSize === 'Thermal-3inch') return 'hv-paper-thermal-80';
  if (paperSize === 'Thermal-58mm') return 'hv-paper-thermal-58';
  if (paperSize === 'A5') return 'hv-paper-a5';
  if (orientation === 'landscape') return 'max-w-full';
  return '';
}

export function getPrintCopyBadgeText(copyLabel: AppConfiguration['printCopyLabel']): string | null {
  switch (copyLabel) {
    case 'ORIGINAL':
      return 'ORIGINAL FOR RECIPIENT';
    case 'DUPLICATE':
      return 'DUPLICATE FOR TRANSPORTER';
    case 'TRIPLICATE':
      return 'TRIPLICATE FOR SUPPLIER';
    case 'OFFICE':
      return 'OFFICE / AUDIT COPY';
    default:
      return null;
  }
}
