import React, { useState } from 'react';
import {
  Building2,
  Plus,
  CheckCircle2,
  X,
  Calendar,
  Landmark,
  ArrowRightLeft,
  ShieldCheck,
  Trash2,
  Repeat,
  Globe,
  SlidersHorizontal,
  Upload,
  PenTool,
  Image as ImageIcon,
} from 'lucide-react';
import {
  CompanyDetails,
  CompanyGstRegistrationType,
  Currency,
  NumberFormatMode,
  AppData,
  UserRole,
} from '../../types';
import { INDIAN_STATE_CODES } from '../../utils/gstin';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import {
  COUNTRY_PRESETS,
  CURRENCY_OPTIONS,
  resolveCompanyTaxProfile,
} from '../../utils/companyProfile';
import { formatCurrency } from '../../utils/storage';

interface CompanyManagerModalProps {
  data: AppData;
  isHindi: boolean;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  onSwitchCompany: (company: CompanyDetails) => void;
  onCreateNewCompany: (newCompany: CompanyDetails) => void;
  onDeleteCompany?: (companyId: string) => void;
  onResetSoleCompany?: () => void;
  onShiftFinancialYear?: (newFYStart: string) => void;
  onClose: () => void;
}

export const CompanyManagerModal: React.FC<CompanyManagerModalProps> = ({
  data,
  isHindi,
  activeUserRole = 'ADMIN',
  permissions,
  onSwitchCompany,
  onCreateNewCompany,
  onDeleteCompany,
  onResetSoleCompany,
  onShiftFinancialYear,
  onClose,
}) => {
  const rbac = permissions || getRolePermissions(normalizeUserRole(activeUserRole));
  const [activeTab, setActiveTab] = useState<'LIST' | 'CREATE' | 'SHIFT_FY'>('LIST');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Next FY default calculation (e.g. 2027-04-01)
  const currentFYYear = Number((data.company.financialYearStart || '2026-04-01').split('-')[0]) || 2026;
  const nextFYStartDefault = `${currentFYYear + 1}-04-01`;
  const [shiftFyStart, setShiftFyStart] = useState(nextFYStartDefault);

  // Existing Companies List or Default
  const currentCompanies: CompanyDetails[] =
    data.companiesList && data.companiesList.length > 0
      ? data.companiesList
      : [{ ...data.company, id: data.company.id || 'cmp_1' }];

  // New Company Form State
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [country, setCountry] = useState('India');
  const [currency, setCurrency] = useState<Currency>('INR');
  const [numberFormat, setNumberFormat] = useState<NumberFormatMode>('INDIAN');

  // Statutory & Feature Toggles
  const [gstEnabled, setGstEnabled] = useState<boolean>(true);
  const [gstRegistrationType, setGstRegistrationType] = useState<CompanyGstRegistrationType>('REGULAR');
  const [compositionTaxRate, setCompositionTaxRate] = useState<number>(1);
  const [cessEnabled, setCessEnabled] = useState<boolean>(false);
  const [ewayBillEnabled, setEwayBillEnabled] = useState<boolean>(true);
  const [tdsTcsEnabled, setTdsTcsEnabled] = useState<boolean>(true);
  const [batchGodownEnabled, setBatchGodownEnabled] = useState<boolean>(false);

  const [financialYearStart, setFinancialYearStart] = useState('2026-04-01');
  const [booksBeginningFrom, setBooksBeginningFrom] = useState('2026-04-01');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [state, setState] = useState('');
  const [stateCode, setStateCode] = useState('');

  // Bank & UPI
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [branch, setBranch] = useState('');
  const [upiId, setUpiId] = useState('');

  // Branding: Logo & Signature
  const [logoUrl, setLogoUrl] = useState('');
  const [signatureUrl, setSignatureUrl] = useState('');
  const [authorizedSignatory, setAuthorizedSignatory] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isIndia = country.trim().toLowerCase() === 'india';

  const handleCountryChange = (nextCountry: string) => {
    setCountry(nextCountry);
    const preset = COUNTRY_PRESETS.find((p) => p.country === nextCountry);
    if (preset) {
      setCurrency(preset.currency);
      setNumberFormat(preset.numberFormat);
      setGstEnabled(preset.defaultGstEnabled);
      setGstRegistrationType(preset.defaultGstType);
      const indiaSelected = nextCountry.toLowerCase() === 'india';
      setEwayBillEnabled(indiaSelected && preset.defaultGstEnabled);
      setTdsTcsEnabled(indiaSelected);
      if (!indiaSelected) {
        setState('');
        setStateCode('');
        setCessEnabled(false);
      }
    }
  };

  const handleToggleGst = (enabled: boolean) => {
    setGstEnabled(enabled);
    if (!enabled) {
      setGstRegistrationType('UNREGISTERED');
      setCessEnabled(false);
      setEwayBillEnabled(false);
    } else {
      setGstRegistrationType((prev) => (prev === 'UNREGISTERED' ? 'REGULAR' : prev));
      if (isIndia) setEwayBillEnabled(true);
    }
  };

  const handleRegTypeChange = (nextType: CompanyGstRegistrationType) => {
    setGstRegistrationType(nextType);
    if (nextType === 'UNREGISTERED') {
      setGstEnabled(false);
      setCessEnabled(false);
      setEwayBillEnabled(false);
    } else {
      setGstEnabled(true);
      if (nextType === 'COMPOSITION') {
        setCessEnabled(false);
      }
    }
  };

  const handleImageFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (val: string) => void,
    maxMb = 2
  ) => {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) {
      setUploadError(
        isHindi
          ? `फ़ाइल का आकार ${maxMb}MB से कम होना चाहिए।`
          : `Image file size must be under ${maxMb}MB.`
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setter(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const resetForm = () => {
    setName('');
    setTagline('');
    setCountry('India');
    setCurrency('INR');
    setNumberFormat('INDIAN');
    setGstEnabled(true);
    setGstRegistrationType('REGULAR');
    setCompositionTaxRate(1);
    setCessEnabled(false);
    setEwayBillEnabled(true);
    setTdsTcsEnabled(true);
    setBatchGodownEnabled(false);
    setFinancialYearStart('2026-04-01');
    setBooksBeginningFrom('2026-04-01');
    setGstin('');
    setPan('');
    setEmail('');
    setPhone('');
    setAddress('');
    setState('');
    setStateCode('');
    setBankName('');
    setAccountNumber('');
    setIfscCode('');
    setBranch('');
    setUpiId('');
    setLogoUrl('');
    setSignatureUrl('');
    setAuthorizedSignatory('');
    setUploadError(null);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rbac.canManageCompanies) return;
    if (!name.trim() || !financialYearStart || !booksBeginningFrom) return;

    const cleanGstin = gstin.trim().toUpperCase();
    const effectivePan =
      pan.trim().toUpperCase() ||
      (cleanGstin.length >= 12 ? cleanGstin.slice(2, 12) : '');
    const effectiveRegType: CompanyGstRegistrationType = gstEnabled
      ? gstRegistrationType
      : 'UNREGISTERED';

    const newCmp: CompanyDetails = {
      id: 'cmp_' + Date.now(),
      name: name.trim(),
      tagline: tagline.trim(),
      country,
      currency,
      numberFormat,
      gstEnabled,
      gstRegistrationType: effectiveRegType,
      compositionTaxRate: effectiveRegType === 'COMPOSITION' ? Number(compositionTaxRate) || 1 : 1,
      cessEnabled: gstEnabled && (effectiveRegType === 'REGULAR' || effectiveRegType === 'SEZ_EXPORT') ? cessEnabled : false,
      ewayBillEnabled: gstEnabled ? ewayBillEnabled : false,
      tdsTcsEnabled,
      batchGodownEnabled,
      gstin: cleanGstin,
      pan: effectivePan,
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      state: state.trim(),
      stateCode: isIndia ? stateCode : '',
      bankName: bankName.trim(),
      accountNumber: accountNumber.trim(),
      ifscCode: ifscCode.trim().toUpperCase(),
      branch: branch.trim(),
      upiId: upiId.trim(),
      logoUrl: logoUrl || undefined,
      signatureUrl: signatureUrl || undefined,
      authorizedSignatory: authorizedSignatory.trim() || undefined,
      terms: 'Thank you for your business.',
      financialYearStart,
      booksBeginningFrom,
    };

    onCreateNewCompany(newCmp);
    resetForm();
    onClose();
  };

  const renderToggleRow = (
    checked: boolean,
    onChange: (next: boolean) => void,
    title: string,
    desc: string,
    disabled = false
  ) => (
    <label
      className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition ${
        disabled
          ? 'bg-slate-950/40 border-slate-800/60 opacity-50 cursor-not-allowed'
          : checked
          ? 'bg-indigo-950/40 border-indigo-500/40 cursor-pointer'
          : 'bg-slate-950 border-slate-800 hover:border-slate-700 cursor-pointer'
      }`}
    >
      <div className="min-w-0">
        <div className="font-bold text-slate-100 text-xs">{title}</div>
        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{desc}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 accent-indigo-500 rounded shrink-0 cursor-pointer"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto p-5 md:p-6 text-slate-200 space-y-5 shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {isHindi ? 'कंपनी एवं वित्तीय वर्ष प्रबंधन (Multi-Company & FY)' : 'Company & Financial Year Management'}
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'GST Regular, Composition, Non-GST या International कंपनियाँ अलग-अलग मुद्रा व नियमों के साथ बनाएं'
                  : 'Create GST Regular, Composition, Non-GST, or International companies with custom currency & features'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className={`grid ${rbac.canManageCompanies ? 'grid-cols-3' : 'grid-cols-1'} bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold`}>
          <button
            type="button"
            onClick={() => setActiveTab('LIST')}
            className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
              activeTab === 'LIST'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span>{isHindi ? 'कंपनियाँ' : 'Companies'} ({currentCompanies.length})</span>
          </button>

          {rbac.canManageCompanies && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('CREATE')}
                className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'CREATE'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{isHindi ? 'नई कंपनी बनाएं' : 'Create Company'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('SHIFT_FY')}
                className={`py-2.5 rounded-xl transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  activeTab === 'SHIFT_FY'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Repeat className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                <span>{isHindi ? 'नया वित्तीय वर्ष (Shift FY)' : 'Shift FY / Carry Forward'}</span>
              </button>
            </>
          )}
        </div>

        {/* TAB 1: Existing Companies */}
        {activeTab === 'LIST' && (
          <div className="space-y-3">
            <div className="text-xs text-slate-400">
              {isHindi
                ? 'जिस कंपनी में कार्य करना चाहते हैं, उसे चुनें या पुरानी कंपनी हटाएं:'
                : 'Select active company profile to work on or delete unused old profiles:'}
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {currentCompanies.map((cmp) => {
                const cmpKey = cmp.id || cmp.name;
                const cmpProfile = resolveCompanyTaxProfile(cmp);
                const isActive =
                  (cmp.id && data.company.id && cmp.id === data.company.id) ||
                  (!cmp.id && cmp.name === data.company.name);
                const isConfirming = confirmDeleteId === cmpKey;
                return (
                  <div
                    key={cmpKey}
                    className={`p-4 rounded-xl border transition space-y-3 ${
                      isActive
                        ? 'bg-indigo-950/60 border-indigo-500/60 shadow-lg shadow-indigo-600/10'
                        : 'bg-slate-800/60 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-white text-sm">
                            {cmp.name || (isHindi ? 'नाम रहित कंपनी' : 'Unnamed Company')}
                          </h4>
                          {isActive && (
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Active</span>
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-amber-300 font-semibold">
                            {cmpProfile.country} • {cmpProfile.currency} •{' '}
                            {cmpProfile.isNonGst
                              ? 'Non-GST'
                              : cmpProfile.isComposition
                              ? `Composition (${cmpProfile.compositionTaxRate}%)`
                              : cmpProfile.gstRegistrationType === 'SEZ_EXPORT'
                              ? 'SEZ / Export'
                              : 'GST Regular'}
                          </span>
                        </div>

                        <div className="text-xs text-slate-400 flex flex-wrap gap-x-4 gap-y-1 font-mono">
                          <span>Tax ID / GSTIN: <span className="text-slate-200">{cmp.gstin || 'Unregistered / Optional'}</span></span>
                          <span>State / Region: <span className="text-slate-200">{cmp.state || 'N/A'}</span></span>
                        </div>

                        <div className="text-[11px] text-amber-300/90 font-mono flex items-center gap-3 pt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-amber-400" />
                            FY Start: <strong className="text-white">{cmp.financialYearStart || '2026-04-01'}</strong>
                          </span>
                          <span className="flex items-center gap-1">
                            Books Start: <strong className="text-white">{cmp.booksBeginningFrom || '2026-04-01'}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSwitchCompany(cmp);
                              onClose();
                            }}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shadow cursor-pointer whitespace-nowrap"
                          >
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>{isHindi ? 'स्विच करें' : 'Switch Active'}</span>
                          </button>
                        )}

                        {rbac.canManageCompanies && (onDeleteCompany || onResetSoleCompany) && !isConfirming && (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(cmpKey)}
                            className="px-3 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 rounded-xl transition text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                            title={isHindi ? 'कंपनी डिलीट करें' : 'Delete Company Profile'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>
                              {currentCompanies.length > 1
                                ? (isHindi ? 'कंपनी डिलीट' : 'Delete')
                                : (isHindi ? 'डिलीट / साफ़ करें' : 'Delete / Clear')}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>

                    {rbac.canManageCompanies && isConfirming && (onDeleteCompany || onResetSoleCompany) && (
                      <div className="bg-rose-950/60 border border-rose-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <span className="text-rose-200">
                          {currentCompanies.length > 1
                            ? isHindi
                              ? `क्या आप "${cmp.name}" और इसका सारा डेटा स्थायी रूप से हटाना चाहते हैं?`
                              : `Permanently delete "${cmp.name}" and its company data?`
                            : isHindi
                            ? `यह एकमात्र सक्रिय कंपनी "${cmp.name}" है। डिलीट करने पर इसके सभी बिल/वाउचर/पार्टी हट जाएँगे और एक साफ़ खाली कंपनी बन जाएगी। जारी रखें?`
                            : `This is your only company "${cmp.name}". Deleting it wipes all bills, vouchers & parties and resets to a fresh empty company. Proceed?`}
                        </span>
                        <div className="flex items-center gap-2 shrink-0 justify-end">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-3 py-1 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-semibold cursor-pointer"
                          >
                            {isHindi ? 'रद्द करें' : 'Cancel'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmDeleteId(null);
                              if (currentCompanies.length > 1 && onDeleteCompany) {
                                onDeleteCompany(cmpKey);
                              } else if (onResetSoleCompany) {
                                onResetSoleCompany();
                                onClose();
                              }
                            }}
                            className="px-3.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-extrabold cursor-pointer"
                          >
                            {currentCompanies.length > 1
                              ? (isHindi ? 'हाँ, कंपनी डिलीट करें' : 'Yes, Delete Company')
                              : (isHindi ? 'हाँ, डिलीट व साफ़ करें' : 'Yes, Delete & Clear')}
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

        {/* TAB 2: Create New Company */}
        {activeTab === 'CREATE' && rbac.canManageCompanies && (
          <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs animate-fadeIn">
            {/* 1. Country, Currency & Number Formatting */}
            <div className="p-4 bg-indigo-950/30 border border-indigo-500/30 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-indigo-300 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <Globe className="w-4 h-4 text-indigo-400" />
                  <span>
                    {isHindi
                      ? 'देश, मुद्रा एवं संख्या प्रारूप (Country, Currency & Formatting)'
                      : 'Country, Currency & Number Format'}
                  </span>
                </h4>
                <span className="font-mono text-xs text-emerald-300 tabular-nums">
                  {isHindi ? 'प्रीव्यू: ' : 'Preview: '}
                  <strong>{formatCurrency(1234567.5, currency, numberFormat)}</strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    {isHindi ? 'देश (Country)' : 'Country'}
                  </label>
                  <select
                    value={country}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-semibold focus:border-indigo-500 outline-none"
                  >
                    {COUNTRY_PRESETS.map((p) => (
                      <option key={p.country} value={p.country}>
                        {p.country}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    {isHindi ? 'मुद्रा (Currency)' : 'Currency'}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-amber-300 font-bold focus:border-indigo-500 outline-none"
                  >
                    {CURRENCY_OPTIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    {isHindi ? 'नंबर फॉर्मेट (Number System)' : 'Number Format System'}
                  </label>
                  <select
                    value={numberFormat}
                    onChange={(e) => setNumberFormat(e.target.value as NumberFormatMode)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-semibold focus:border-indigo-500 outline-none"
                  >
                    <option value="INDIAN">Indian Lakhs / Crores (12,34,567.50)</option>
                    <option value="INTERNATIONAL">International Millions (1,234,567.50)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Tax Registration Type & Statutory Toggles */}
            <div className="p-4 bg-slate-950/90 border border-slate-800 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="font-bold text-slate-200 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                  <span>
                    {isHindi
                      ? 'GST पंजीकरण प्रकार एवं वैधानिक विकल्प (Statutory & Feature Toggles)'
                      : 'Tax Registration Type & Feature Switches'}
                  </span>
                </h4>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'जीएसटी सक्षम करें (Enable GST)' : 'Enable GST'}
                  </label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => handleToggleGst(true)}
                      className={`py-2 rounded-lg font-bold transition cursor-pointer ${
                        gstEnabled ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isHindi ? 'हाँ (Yes)' : 'Yes (GST On)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleGst(false)}
                      className={`py-2 rounded-lg font-bold transition cursor-pointer ${
                        !gstEnabled ? 'bg-amber-600 text-slate-950' : 'text-slate-400 hover:text-white'
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
                    value={gstRegistrationType}
                    onChange={(e) => handleRegTypeChange(e.target.value as CompanyGstRegistrationType)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-semibold focus:border-indigo-500 outline-none"
                  >
                    <option value="UNREGISTERED">Unregistered / Non-GST</option>
                    <option value="REGULAR">Regular (Tax Invoice)</option>
                    <option value="COMPOSITION">Composition Dealer (Bill of Supply)</option>
                    <option value="SEZ_EXPORT">SEZ / Export</option>
                  </select>
                </div>

                {gstEnabled && gstRegistrationType === 'COMPOSITION' ? (
                  <div>
                    <label className="block text-amber-300 font-semibold mb-1">
                      {isHindi ? 'कंपोज़िशन टैक्स दर (%)' : 'Composition Turnover Tax Rate (%)'}
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={compositionTaxRate}
                      onChange={(e) => setCompositionTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-amber-300 font-mono font-bold focus:border-amber-400 outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {gstEnabled
                        ? (isHindi ? 'GSTIN / Tax ID (वैकल्पिक)' : 'GSTIN / Tax ID (Optional)')
                        : (isHindi ? 'Tax ID (आवश्यक नहीं)' : 'Tax ID (Not Required)')}
                    </label>
                    <input
                      type="text"
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value.toUpperCase())}
                      placeholder={gstEnabled ? 'e.g. 07AAAAA0000A1Z5' : 'Leave blank for Non-GST'}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 font-mono text-slate-200 uppercase"
                    />
                  </div>
                )}
              </div>

              {gstEnabled && gstRegistrationType === 'COMPOSITION' && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'कंपोज़िशन GSTIN (वैकल्पिक)' : 'Composition GSTIN (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 07AAAAA0000A1Z5"
                    className="w-full sm:w-1/2 bg-slate-900 border border-slate-700 rounded-xl p-2.5 font-mono text-slate-200 uppercase"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
                {renderToggleRow(
                  cessEnabled,
                  setCessEnabled,
                  isHindi ? 'सेस्स सक्षम करें (Enable Cess)' : 'Enable Cess',
                  isHindi ? 'बिल, खरीद व आइटम में Cess कॉलम दिखाएं' : 'Show Cess columns on Invoices, Purchases & Items',
                  !gstEnabled || gstRegistrationType === 'COMPOSITION'
                )}
                {renderToggleRow(
                  ewayBillEnabled,
                  setEwayBillEnabled,
                  isHindi ? 'ई-वे बिल (E-Way Bill)' : 'Enable E-Way Bill',
                  isHindi ? 'ई-वे बिल फ़ील्ड्स व जनरेटर सक्षम करें' : 'Show E-Way Bill prompts & transport fields',
                  !gstEnabled
                )}
                {renderToggleRow(
                  tdsTcsEnabled,
                  setTdsTcsEnabled,
                  isHindi ? 'TDS / TCS सक्षम करें' : 'Enable TDS / TCS',
                  isHindi ? 'स्रोत कर कटौती एवं संग्रहण कार्यप्रवाह' : 'Withholding tax tracking in vouchers & compliance'
                )}
                {renderToggleRow(
                  batchGodownEnabled,
                  setBatchGodownEnabled,
                  isHindi ? 'बैच / एक्सपायरी व गोदाम' : 'Enable Batch & Multi-Godown',
                  isHindi ? 'FEFO बैच, एक्सपायरी और मल्टी-गोदाम स्टॉक' : 'Track Batch/Expiry dates & Multi-Godown stock'
                )}
              </div>
            </div>

            {/* 3. Financial Year & Books Start Dates */}
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-3">
              <h4 className="font-bold text-amber-300 flex items-center gap-2 text-xs uppercase tracking-wider">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>
                  {isHindi
                    ? 'वित्तीय वर्ष एवं खाता प्रारंभ तिथि (FY & Books Beginning)'
                    : 'Financial Year & Books Beginning Dates'}
                </span>
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    {isHindi ? 'वित्तीय वर्ष प्रारंभ तिथि (FY From) *' : 'Financial Year From *'}
                  </label>
                  <input
                    type="date"
                    value={financialYearStart}
                    onChange={(e) => setFinancialYearStart(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-200 font-semibold mb-1">
                    {isHindi ? 'खाते प्रारंभ तिथि (Books Beginning From) *' : 'Books Beginning From *'}
                  </label>
                  <input
                    type="date"
                    value={booksBeginningFrom}
                    onChange={(e) => setBooksBeginningFrom(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold"
                    required
                  />
                </div>
              </div>
            </div>

            {/* 4. Basic Company Profile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'कंपनी / व्यापार का नाम (Company Name) *' : 'Company / Business Name *'}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Global Traders / Sharma General Store"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Business Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. Wholesale & Retail Distribution"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isIndia
                    ? isHindi
                      ? 'राज्य एवं राज्य कोड (वैकल्पिक यदि Non-GST)'
                      : `State & State Code ${gstEnabled ? '(Recommended for GST)' : '(Optional)'}`
                    : isHindi
                    ? 'राज्य / प्रांत / अमीरात (State / Emirate - Optional)'
                    : 'State / Province / Emirate (Optional)'}
                </label>
                {isIndia ? (
                  <select
                    value={stateCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const stName = code ? INDIAN_STATE_CODES[code] || '' : '';
                      setStateCode(code);
                      setState(stName);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-semibold outline-none focus:border-indigo-500"
                  >
                    <option value="">{isHindi ? '-- राज्य चुनें (वैकल्पिक) --' : '-- Select State (Optional) --'}</option>
                    {Object.entries(INDIAN_STATE_CODES).map(([code, stName]) => (
                      <option key={code} value={code}>
                        {code} - {stName}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="e.g. Dubai, California, London"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isIndia ? 'PAN Number (Optional)' : 'Tax / Company Reg. No. (Optional)'}
                </label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder={isIndia ? 'e.g. AAAAA0000A' : 'Registration / License Ref'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-slate-200 uppercase"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Email & Phone</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="info@company.com"
                    className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Registered Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Complete business street address..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
            </div>

            {/* 5. Default Bank / UPI & Branding (Logo + Digital Signature) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-emerald-300 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <Landmark className="w-4 h-4 text-emerald-400" />
                  <span>{isHindi ? 'बैंक एवं UPI विवरण (वैकल्पिक)' : 'Default Bank & UPI Details (Optional)'}</span>
                </h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Bank Name"
                    className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                  />
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Account Number"
                    className="bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-white"
                  />
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder={isIndia ? 'IFSC Code' : 'SWIFT / IBAN / Routing'}
                    className="bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-white uppercase"
                  />
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder="Branch"
                    className="bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                  />
                </div>
                {currency === 'INR' && (
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="UPI ID (e.g. business@upi)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 font-mono text-emerald-300"
                  />
                )}
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <h4 className="font-bold text-indigo-300 flex items-center gap-2 text-xs uppercase tracking-wider">
                  <ImageIcon className="w-4 h-4 text-indigo-400" />
                  <span>{isHindi ? 'लोगो एवं डिजिटल हस्ताक्षर (Branding & Signature)' : 'Logo & Authorized Signature (Optional)'}</span>
                </h4>

                {uploadError && (
                  <div className="text-rose-300 bg-rose-950/60 border border-rose-500/40 rounded-lg px-2.5 py-1.5 text-[11px]">
                    {uploadError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      {isHindi ? 'कंपनी लोगो (Logo)' : 'Company Logo'}
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center gap-1.5 text-[11px]">
                        <Upload className="w-3.5 h-3.5" />
                        <span>{logoUrl ? 'Change Logo' : 'Upload Logo'}</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={(e) => handleImageFileUpload(e, setLogoUrl, 2)}
                          className="hidden"
                        />
                      </label>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="text-rose-400 hover:text-rose-300 text-[11px] font-bold"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {logoUrl && (
                      <img src={logoUrl} alt="Logo Preview" className="h-10 rounded bg-white p-1 object-contain border border-slate-700" />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold text-slate-300">
                      {isHindi ? 'हस्ताक्षर छवि (Signature)' : 'Digital Signature Image'}
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-bold rounded-lg flex items-center gap-1.5 text-[11px]">
                        <PenTool className="w-3.5 h-3.5 text-amber-400" />
                        <span>{signatureUrl ? 'Change Sign' : 'Upload Sign'}</span>
                        <input
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={(e) => handleImageFileUpload(e, setSignatureUrl, 1)}
                          className="hidden"
                        />
                      </label>
                      {signatureUrl && (
                        <button
                          type="button"
                          onClick={() => setSignatureUrl('')}
                          className="text-rose-400 hover:text-rose-300 text-[11px] font-bold"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                    {signatureUrl && (
                      <img src={signatureUrl} alt="Signature Preview" className="h-10 rounded bg-white p-1 object-contain border border-slate-700" />
                    )}
                  </div>
                </div>

                <input
                  type="text"
                  value={authorizedSignatory}
                  onChange={(e) => setAuthorizedSignatory(e.target.value)}
                  placeholder={isHindi ? 'अधिकृत हस्ताक्षरकर्ता का नाम (e.g. Proprietor / Director)' : 'Authorized Signatory Name (e.g. Proprietor / Director)'}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2 text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('LIST')}
                className="px-4 py-2.5 bg-slate-800 text-slate-200 rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 flex items-center gap-2 transition cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isHindi ? 'नई कंपनी बनाएं एवं स्विच करें' : 'Create Company & Start Accounting'}</span>
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: Shift Financial Year (Carry Forward Balances) */}
        {activeTab === 'SHIFT_FY' && rbac.canManageCompanies && (
          <div className="space-y-4 text-xs animate-fadeIn">
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl space-y-3">
              <h4 className="font-bold text-emerald-300 flex items-center gap-2 text-sm">
                <Repeat className="w-5 h-5 text-emerald-400" />
                <span>
                  {isHindi
                    ? 'नया वित्तीय वर्ष रोल-ओवर एवं ओपनिंग बैलेंस कैरी-फॉरवर्ड'
                    : 'Shift Financial Year & Carry Forward Closing Balances'}
                </span>
              </h4>

              <p className="text-slate-300 leading-relaxed">
                {isHindi
                  ? 'वर्तमान कंपनी के सभी खाता बही (Parties, Sundry Debtors/Creditors, Accounts) एवं स्टॉक आइटम्स को नए वित्तीय वर्ष में स्वचालित रूप से ट्रांसफर किया जाएगा। वर्तमान वर्ष का अंतिम शेष (Closing Balance) नए वर्ष का प्रारंभिक शेष (Opening Balance) बन जाएगा। पुरानी कंपनी डेटा सुरक्षित रहेगी और आप कभी भी पिछले वर्ष के लेजर देख व प्रिंट कर सकते हैं।'
                  : 'All Parties, Ledgers, Accounts, and Stock Items will be carried forward. Current closing balances will automatically become opening balances for the new year. Your previous financial year data remains fully preserved and accessible anytime.'}
              </p>

              <div className="pt-2">
                <label className="block text-slate-200 font-bold mb-1.5">
                  {isHindi ? 'नया वित्तीय वर्ष प्रारंभ तिथि (New FY Start Date) *' : 'New Financial Year Start Date *'}
                </label>
                <input
                  type="date"
                  value={shiftFyStart}
                  onChange={(e) => setShiftFyStart(e.target.value)}
                  className="w-full sm:w-64 bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold text-sm focus:border-emerald-500"
                  required
                />
              </div>

              <div className="bg-slate-950/60 p-3 rounded-lg border border-slate-800 space-y-1 text-slate-300 text-[11px] font-mono">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'स्वचालित क्लोजिंग → ओपनिंग बैलेंस ट्रांसफर' : 'Automatic Closing → Opening Balance Carry Forward'}</span>
                </div>
                <div className="flex items-center gap-2 text-indigo-300">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'पुराना वित्तीय वर्ष डेटा सुरक्षित रहेगा' : 'Previous Year Company Data Retained & Retrievable'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('LIST')}
                className="px-4 py-2.5 bg-slate-800 text-slate-200 rounded-xl transition cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onShiftFinancialYear) {
                    onShiftFinancialYear(shiftFyStart);
                    onClose();
                  }
                }}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 transition cursor-pointer"
              >
                <Repeat className="w-4 h-4" />
                <span>{isHindi ? 'ओपनिंग बैलेंस कैरी-फॉरवर्ड करें एवं नया FY शुरू करें' : 'Carry Forward Balances & Shift FY'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
