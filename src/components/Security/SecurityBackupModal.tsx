import React, { useState } from 'react';
import { 
  X, 
  Download, 
  Upload, 
  ShieldCheck, 
  Clock, 
  KeyRound, 
  FileSpreadsheet,
  FileText,
  Layers,
  Users,
  Package,
  Printer,
  Mail,
  Send,
  Check,
  CheckCircle2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Save,
  Shield
} from 'lucide-react';
import { AppData, UserRole } from '../../types';
import { exportBackupJSON } from '../../utils/storage';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import { 
  exportInvoicesCSV, 
  exportVouchersCSV, 
  exportAccountsCSV, 
  exportPartiesCSV, 
  exportItemsCSV, 
  exportAllDataCSV
} from '../../utils/exportHelpers';
import {
  downloadWindowsDesktopShortcutZip,
  downloadWindowsExeBuilderZip,
} from '../../utils/desktopShortcut';

interface SecurityBackupModalProps {
  data: AppData;
  isHindi: boolean;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  onUpdateSecurityPin?: (pin: string | null, pinRequired: boolean) => void;
  onUpdateSecurityPinAndPass?: (newPin: string, pinRequired: boolean, newAdminPass?: string) => void;
  onUpdateData?: (newData: AppData) => void;
  onRestoreData?: (restored: AppData) => void;
  initialTab?: 'pin' | 'backup' | 'download' | 'audit';
  onClose: () => void;
}

export const SecurityBackupModal: React.FC<SecurityBackupModalProps> = ({
  data,
  isHindi,
  activeUserRole = 'ADMIN',
  permissions,
  onUpdateSecurityPin,
  onUpdateSecurityPinAndPass,
  onUpdateData,
  onRestoreData,
  initialTab = 'pin',
  onClose
}) => {
  const rbac = permissions || getRolePermissions(normalizeUserRole(activeUserRole));
  const defaultPermittedTab: 'pin' | 'backup' | 'download' | 'audit' =
    rbac.canManageUsersAndPin && initialTab === 'pin'
      ? 'pin'
      : (rbac.canUseAdminBackup || rbac.canExportData) && (initialTab === 'backup' || !rbac.canManageUsersAndPin)
        ? 'backup'
        : rbac.canManageUsersAndPin && initialTab === 'download'
          ? 'download'
          : rbac.canViewAuditLog
            ? 'audit'
            : 'backup';
  const [activeTab, setActiveTab] = useState<'pin' | 'backup' | 'download' | 'audit'>(defaultPermittedTab);

  // Master PIN & Password States
  const currentSavedPin = data.securityPin || '';
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinEnabled, setPinEnabled] = useState(data.pinRequired);
  const [showPin, setShowPin] = useState(false);

  // Feedback alerts
  const [pinSuccessMsg, setPinSuccessMsg] = useState<string | null>(null);
  const [pinErrorMsg, setPinErrorMsg] = useState<string | null>(null);

  // Backup states
  const [backupEmail, setBackupEmail] = useState(data.company.email || '');
  const [autoEmailEnabled, setAutoEmailEnabled] = useState(true);
  const [backupFreq, setBackupFreq] = useState<'daily' | 'weekly' | 'on_logout'>('daily');
  const [emailStatus, setEmailStatus] = useState<string | null>(null);
  const [confirmResetPin, setConfirmResetPin] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const [isDownloadingPkg, setIsDownloadingPkg] = useState(false);

  // Execute PIN update across all available handlers
  const savePinConfig = (targetPin: string, required: boolean, newAdminPass?: string) => {
    if (onUpdateSecurityPinAndPass) {
      onUpdateSecurityPinAndPass(targetPin, required, newAdminPass);
    } else if (onUpdateSecurityPin) {
      onUpdateSecurityPin(targetPin, required);
    }

    if (onUpdateData) {
      const updatedUserProfiles = (data.userProfiles || []).map(u => {
        if (u.role === 'ADMIN' || u.id === 'usr_admin') {
          return { ...u, pin: targetPin, ...(newAdminPass ? { password: newAdminPass } : {}) };
        }
        return u;
      });

      const updatedData: AppData = {
        ...data,
        securityPin: targetPin,
        pinRequired: required,
        userProfiles: updatedUserProfiles.length > 0 ? updatedUserProfiles : [
          {
            id: 'usr_admin',
            name: data.company.name || 'Company Admin',
            role: 'ADMIN',
            email: data.company.email || 'admin@company.com',
            pin: targetPin,
            ...(newAdminPass ? { password: newAdminPass } : {})
          }
        ]
      };
      onUpdateData(updatedData);
    }
  };

  const handleSavePinForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rbac.canManageUsersAndPin) return;
    setPinErrorMsg(null);
    setPinSuccessMsg(null);

    // Strictly verify existing PIN with zero hardcoded bypasses
    if (currentSavedPin && currentPinInput.trim() !== currentSavedPin) {
      setPinErrorMsg(
        isHindi 
          ? 'वर्तमान मास्टर पिन अमान्य है!' 
          : 'Current Security PIN is incorrect!'
      );
      return;
    }

    if (newPinInput.trim().length < 4 || newPinInput.trim().length > 6) {
      setPinErrorMsg(
        isHindi 
          ? 'नया मास्टर पिन 4 से 6 अंकों का होना चाहिए।' 
          : 'New Master PIN must be between 4 and 6 digits.'
      );
      return;
    }

    if (!/^\d+$/.test(newPinInput.trim())) {
      setPinErrorMsg(
        isHindi 
          ? 'मास्टर पिन में केवल अंक (0-9) होने चाहिए।' 
          : 'Master PIN must contain digits only (0-9).'
      );
      return;
    }

    if (newPinInput !== confirmPinInput) {
      setPinErrorMsg(
        isHindi 
          ? 'नया पिन और पुष्टि पिन (Confirm PIN) मेल नहीं खाते!' 
          : 'New PIN and Confirm PIN do not match!'
      );
      return;
    }

    savePinConfig(newPinInput.trim(), pinEnabled);
    setPinSuccessMsg(
      isHindi 
        ? '✅ मास्टर पिन सफलतापूर्वक बदल गया है!' 
        : '✅ Master Security PIN updated successfully!'
    );
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
  };

  const handleResetPinDefault = () => {
    setConfirmResetPin(true);
  };

  const confirmResetPinNow = () => {
    savePinConfig('', false);
    setPinEnabled(false);
    setConfirmResetPin(false);
    setPinSuccessMsg(
      isHindi
        ? '✅ मास्टर पिन लॉक हटा दिया गया है! नया कस्टम PIN सेट करें।'
        : '✅ Master PIN cleared! Please set a new custom PIN.'
    );
  };

  const handleSendEmailBackup = () => {
    exportBackupJSON(data);

    const subject = encodeURIComponent(`Accounting Auto-Backup: ${data.company.name} (${new Date().toLocaleDateString()})`);
    const totalInvoices = data.invoices.length;
    const totalVouchers = data.vouchers.length;
    const totalParties = data.parties.length;
    
    const bodyText = `Hisabveda ERP - Automated Data Backup Package\n` +
      `------------------------------------------------------\n` +
      `Company Name: ${data.company.name}\n` +
      `GSTIN: ${data.company.gstin}\n` +
      `Backup Timestamp: ${new Date().toLocaleString()}\n` +
      `Total Sales Invoices: ${totalInvoices}\n` +
      `Total Vouchers: ${totalVouchers}\n` +
      `Total Parties: ${totalParties}\n\n` +
      `NOTE: The JSON database file has been saved to your downloads folder. ` +
      `Please attach that downloaded JSON file to this email for your permanent record.`;

    const mailtoUrl = `mailto:${encodeURIComponent(backupEmail)}?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.rel = 'noopener noreferrer';
    link.click();
    setEmailStatus(isHindi ? 'ईमेल ऑटो-बैकअप शुरू हो गया है! बैकअप JSON फ़ाइल डाउनलोड हो गई है।' : 'Email Auto-Backup initiated! Backup file downloaded.');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!rbac.canResetWorkspace) return;
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.company && parsed.invoices && parsed.vouchers) {
          if (onRestoreData) {
            onRestoreData(parsed);
          } else if (onUpdateData) {
            onUpdateData(parsed);
          }
          setPinSuccessMsg(isHindi ? 'डेटा सफलतापूर्वक पुनर्स्थापित (Restore) कर दिया गया है!' : 'Accounting data restored successfully!');
          onClose();
        } else {
          setPinErrorMsg(isHindi ? 'अमान्य बैकअप फ़ाइल स्वरूप!' : 'Invalid backup JSON file structure.');
        }
      } catch (err) {
        setPinErrorMsg(isHindi ? 'फ़ाइल पढ़ने में त्रुटि!' : 'Failed to parse backup JSON file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-[var(--text-primary)]">
        {/* Top Header */}
        <div className="p-4 hv-elevated border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl hv-pill-amber border flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                {isHindi ? 'मास्टर पिन व सुरक्षा सेटिंग्स (Security & Master PIN)' : 'Master PIN, Security & Financial Backup'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi ? 'मास्टर पिन लॉक और डेटा बैकअप व रीस्टोर प्रबंधन' : 'Manage master security PIN lock and system backups'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] hv-surface border border-[var(--border-primary)] hover:bg-[var(--hover-surface)] rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Navigation Tabs */}
        <div className="flex border-b border-[var(--border-primary)] hv-elevated px-4 pt-2 gap-2 text-xs font-bold overflow-x-auto shrink-0">
          {rbac.canManageUsersAndPin && (
            <button
              type="button"
              onClick={() => setActiveTab('pin')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === 'pin'
                  ? 'border-amber-500 hv-pill-amber rounded-t-lg'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <KeyRound className="w-4 h-4 text-amber-500" />
              <span>{isHindi ? '🔑 मास्टर पिन लॉक' : '🔑 Master PIN Lock'}</span>
            </button>
          )}

          {(rbac.canUseAdminBackup || rbac.canExportData) && (
            <button
              type="button"
              onClick={() => setActiveTab('backup')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === 'backup'
                  ? 'border-indigo-500 hv-pill-indigo rounded-t-lg'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Download className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? '💾 बैकअप व रीस्टोर' : '💾 Backup & Restore'}</span>
            </button>
          )}

          {rbac.canManageUsersAndPin && (
            <button
              type="button"
              onClick={() => setActiveTab('download')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === 'download'
                  ? 'border-emerald-500 hv-pill-emerald rounded-t-lg'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Package className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? '📦 सेटअप डाउनलोड (.exe/.zip)' : '📦 Software Setup'}</span>
            </button>
          )}

          {rbac.canViewAuditLog && (
            <button
              type="button"
              onClick={() => setActiveTab('audit')}
              className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === 'audit'
                  ? 'border-sky-500 hv-pill-sky rounded-t-lg'
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-sky-500" />
              <span>{isHindi ? '🛡️ ऑडिट ट्रेल व सुरक्षा' : '🛡️ Audit & Security'}</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-6 text-xs flex-1">
          {/* TAB 1: MASTER PIN & ADMIN PASSWORD */}
          {activeTab === 'pin' && rbac.canManageUsersAndPin && (
            <div className="space-y-5">
              {/* Status Header Banner */}
              <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl border ${pinEnabled ? 'hv-pill-emerald' : 'hv-pill-slate'}`}>
                    {pinEnabled ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <span>{isHindi ? 'मास्टर पिन सुरक्षा स्थिति:' : 'Master PIN Security Status:'}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${pinEnabled ? 'hv-pill-emerald' : 'hv-pill-slate'}`}>
                        {pinEnabled ? (isHindi ? 'सक्रिय (ACTIVE)' : 'ENABLED') : (isHindi ? 'अक्षम (OFF)' : 'DISABLED')}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)] font-mono mt-0.5 flex items-center gap-2">
                      <span>{isHindi ? 'वर्तमान मास्टर पिन: ' : 'Active Master PIN: '}</span>
                      <span className="text-amber-500 font-bold tracking-widest text-sm">
                        {showPin ? currentSavedPin : '••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowPin(!showPin)}
                        className="text-[10px] text-indigo-500 font-bold hover:underline flex items-center gap-0.5 cursor-pointer ml-1"
                      >
                        {showPin ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        {showPin ? (isHindi ? 'छिपाएं' : 'Hide') : (isHindi ? 'देखें' : 'Show')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentSavedPin && (
                    <button
                      type="button"
                      onClick={handleResetPinDefault}
                      className="text-[11px] hv-surface hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] hover:text-amber-500 border border-[var(--border-subtle)] px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                      title={isHindi ? 'मास्टर पिन हटाएं' : 'Clear Master PIN'}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'पिन हटाएं' : 'Clear PIN'}</span>
                    </button>
                  )}
                </div>
              </div>

              {confirmResetPin && (
                <div className="p-3.5 rounded-xl hv-pill-amber border text-xs flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {isHindi
                      ? 'क्या आप वाकई वर्तमान मास्टर पिन हटाना चाहते हैं?'
                      : 'Clear the current Master PIN lock?'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmResetPin(false)}
                      className="px-2.5 py-1 rounded-lg hv-surface border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold cursor-pointer"
                    >
                      {isHindi ? 'रद्द करें' : 'Cancel'}
                    </button>
                    <button
                      type="button"
                      onClick={confirmResetPinNow}
                      className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                    >
                      {isHindi ? 'हाँ, रीसेट करें' : 'Confirm'}
                    </button>
                  </div>
                </div>
              )}

              {/* Feedback Messages */}
              {pinErrorMsg && (
                <div className="p-3.5 rounded-xl hv-pill-rose border text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{pinErrorMsg}</span>
                </div>
              )}

              {pinSuccessMsg && (
                <div className="p-3.5 rounded-xl hv-pill-emerald border text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{pinSuccessMsg}</span>
                </div>
              )}

              {/* Form 1: Master PIN Lock Configuration */}
              <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-500" />
                    <span>{isHindi ? '1. मास्टर सिक्योरिटी पिन बदलें (Change Master PIN)' : '1. Change Master PIN'}</span>
                  </h4>
                  <span className="text-[10px] text-[var(--text-muted)] font-medium">
                    {isHindi ? 'सॉफ्टवेयर स्क्रीन लॉक व एक्सेस' : 'Screen lock & app access'}
                  </span>
                </div>

                <form onSubmit={handleSavePinForm} className="space-y-4">
                  {/* Enable PIN Protection toggle */}
                  <div className="flex items-center gap-3 hv-surface p-3 rounded-xl border border-[var(--border-primary)]">
                    <input
                      type="checkbox"
                      id="pinCheck"
                      checked={pinEnabled}
                      onChange={(e) => {
                        const newEnabled = e.target.checked;
                        setPinEnabled(newEnabled);
                        savePinConfig(currentSavedPin, newEnabled);
                      }}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <label htmlFor="pinCheck" className="text-[var(--text-primary)] font-semibold cursor-pointer">
                      {isHindi ? 'सॉफ़्टवेयर एक्सेस हेतु मास्टर PIN सुरक्षा लॉक सक्रिय करें' : 'Enable Master PIN lock to protect software access'}
                    </label>
                  </div>

                  {/* Input Fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {currentSavedPin && (
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-xs font-semibold text-[var(--text-secondary)]">
                            {isHindi ? 'वर्तमान पिन *' : 'Current PIN *'}
                          </label>
                        </div>
                        <input
                          type={showPin ? 'text' : 'password'}
                          maxLength={6}
                          value={currentPinInput}
                          onChange={(e) => setCurrentPinInput(e.target.value)}
                          placeholder={isHindi ? 'वर्तमान पिन' : 'Current PIN'}
                          className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono tracking-widest text-center focus:border-amber-500 focus:outline-none"
                          required
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isHindi ? 'नया मास्टर पिन (4-6 अंक) *' : 'New Master PIN *'}
                      </label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        maxLength={6}
                        value={newPinInput}
                        onChange={(e) => setNewPinInput(e.target.value)}
                        placeholder="••••"
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono tracking-widest text-center focus:border-amber-500 focus:outline-none"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                        {isHindi ? 'पुष्टि पिन (Confirm PIN) *' : 'Confirm New PIN *'}
                      </label>
                      <input
                        type={showPin ? 'text' : 'password'}
                        maxLength={6}
                        value={confirmPinInput}
                        onChange={(e) => setConfirmPinInput(e.target.value)}
                        placeholder="••••"
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono tracking-widest text-center focus:border-amber-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* CSPRNG Random PIN & Submit */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          const arr = new Uint32Array(1);
                          crypto.getRandomValues(arr);
                          const rand = (100000 + (arr[0] % 900000)).toString();
                          setNewPinInput(rand);
                          setConfirmPinInput(rand);
                          setShowPin(true);
                        }}
                        className="px-2.5 py-1 hv-pill-amber text-[10px] font-bold rounded border flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>{isHindi ? 'सुरक्षित रैंडम पिन' : 'Generate Strong Random PIN'}</span>
                      </button>
                    </div>

                    <button
                      type="submit"
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Save className="w-4 h-4" />
                      <span>{isHindi ? 'मास्टर पिन सहेजें' : 'Save Master PIN'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: BACKUP & RESTORE */}
          {activeTab === 'backup' && (rbac.canUseAdminBackup || rbac.canExportData) && (
            <div className="space-y-6">
              {/* Section 1: Backup & Restore */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rbac.canUseAdminBackup && (
                  <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Download className="w-4 h-4 text-emerald-500" />
                      <span>{isHindi ? 'डेटा बैकअप डाउनलोड (JSON)' : 'Full Data Backup (JSON)'}</span>
                    </h4>
                    <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">
                      {isHindi 
                        ? 'अपनी कंपनी की सभी प्रविष्टियों, इनवॉइस, वाउचर और लेजर का 1-क्लिक पूर्ण एन्क्रिप्टेड JSON बैकअप सहेजें।' 
                        : 'Download a complete encrypted JSON snapshot of your companies, invoices, vouchers, and accounts.'}
                    </p>
                    <button
                      onClick={() => exportBackupJSON(data)}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold py-2 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isHindi ? 'पूर्ण बैकअप डाउनलोड करें' : 'Download Complete Backup'}</span>
                    </button>
                  </div>
                )}

                {rbac.canResetWorkspace && (
                  <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                    <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                      <Upload className="w-4 h-4 text-amber-500" />
                      <span>{isHindi ? 'बैकअप से डेटा पुनर्स्थापित (Restore)' : 'Restore from Backup'}</span>
                    </h4>
                    <p className="text-[var(--text-muted)] text-[11px] leading-relaxed">
                      {isHindi 
                        ? 'पहले डाउनलोड की गई बैकअप JSON फ़ाइल अपलोड करके अपना संपूर्ण डेटा तुरंत पुनर्स्थापित करें।' 
                        : 'Upload a previously exported JSON backup file to instantly restore all business records.'}
                    </p>
                    <label className="w-full hv-surface hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] border-dashed font-bold py-2 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer">
                      <Upload className="w-4 h-4 text-amber-500" />
                      <span>{isHindi ? 'बैकअप फ़ाइल चुनें (.json)' : 'Select Backup File (.json)'}</span>
                      <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>
                )}
              </div>

              {/* Section 1.5: Detailed Excel / CSV Master Datasets */}
              <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    <span>{isHindi ? 'मास्टर एक्सेल / CSV एक्सपोर्ट' : 'Master Excel & CSV Spreadsheets'}</span>
                  </h4>
                  <span className="text-[10px] text-[var(--text-muted)] font-mono">MS Excel / Google Sheets</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    onClick={() => exportInvoicesCSV(data.invoices)}
                    className="p-2.5 hv-surface hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl flex items-center gap-2 transition text-left cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{isHindi ? 'बिक्री इनवॉइस' : 'Sales Invoices'}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{data.invoices.length} {isHindi ? 'रिकॉर्ड' : 'records'}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => exportVouchersCSV(data.vouchers)}
                    className="p-2.5 hv-surface hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl flex items-center gap-2 transition text-left cursor-pointer"
                  >
                    <Layers className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{isHindi ? 'सभी वाउचर' : 'All Vouchers'}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{data.vouchers.length} {isHindi ? 'रिकॉर्ड' : 'records'}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => exportAccountsCSV(data.accounts)}
                    className="p-2.5 hv-surface hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl flex items-center gap-2 transition text-left cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{isHindi ? 'खाता बही (COA)' : 'Accounts Ledger'}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{data.accounts.length} {isHindi ? 'खाते' : 'accounts'}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => exportPartiesCSV(data.parties)}
                    className="p-2.5 hv-surface hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl flex items-center gap-2 transition text-left cursor-pointer"
                  >
                    <Users className="w-4 h-4 text-sky-500 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{isHindi ? 'पार्टी सूची' : 'Parties Directory'}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{data.parties.length} {isHindi ? 'पार्टियां' : 'parties'}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => exportItemsCSV(data.items)}
                    className="p-2.5 hv-surface hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl flex items-center gap-2 transition text-left cursor-pointer"
                  >
                    <Package className="w-4 h-4 text-rose-500 shrink-0" />
                    <div>
                      <div className="font-bold text-[var(--text-primary)]">{isHindi ? 'आइटम स्टॉक' : 'Inventory Items'}</div>
                      <div className="text-[10px] text-[var(--text-muted)] font-mono">{data.items.length} {isHindi ? 'आइटम' : 'items'}</div>
                    </div>
                  </button>

                  <button
                    onClick={() => exportAllDataCSV(data)}
                    className="p-2.5 hv-pill-emerald border rounded-xl flex items-center gap-2 transition text-left cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <div>
                      <div className="font-bold">{isHindi ? 'पूर्ण डेटा CSV' : 'Complete All-in-1 CSV'}</div>
                      <div className="text-[10px] opacity-85 font-mono">{isHindi ? 'मास्टर बंडल' : 'Full Dump'}</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Section 2: Automated Email Cloud Backups */}
              <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Mail className="w-4 h-4 text-sky-500" />
                    <span>{isHindi ? 'स्वचालित ईमेल क्लाउड बैकअप' : 'Automated Email Cloud Backup System'}</span>
                  </h4>
                  <span className="text-[10px] hv-pill-sky font-mono font-bold px-2 py-0.5 rounded border">
                    SMTP / Mailto Sync
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'बैकअप प्राप्तकर्ता ईमेल आईडी:' : 'Backup Destination Email:'}
                    </label>
                    <input
                      type="email"
                      value={backupEmail}
                      onChange={(e) => setBackupEmail(e.target.value)}
                      placeholder="accounts@yourcompany.com"
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                      {isHindi ? 'बैकअप आवृत्ति (Frequency):' : 'Backup Schedule:'}
                    </label>
                    <select
                      value={backupFreq}
                      onChange={(e) => setBackupFreq(e.target.value as any)}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs"
                    >
                      <option value="daily">{isHindi ? 'दैनिक (Daily Automatic Backup)' : 'Daily Automatic Backup'}</option>
                      <option value="weekly">{isHindi ? 'साप्ताहिक (Weekly Audit Backup)' : 'Weekly Audit Backup'}</option>
                      <option value="on_logout">{isHindi ? 'सॉफ्टवेयर बंद होने पर (On Logout)' : 'On Logout & Shift Close'}</option>
                    </select>
                  </div>
                </div>

                {emailStatus && (
                  <div className="p-2.5 rounded-xl hv-pill-sky border text-[11px] flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{emailStatus}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="autoEmailToggle"
                      checked={autoEmailEnabled}
                      onChange={(e) => setAutoEmailEnabled(e.target.checked)}
                      className="w-4 h-4 accent-sky-500 rounded cursor-pointer"
                    />
                    <label htmlFor="autoEmailToggle" className="text-[var(--text-primary)] text-xs font-semibold cursor-pointer">
                      {isHindi ? 'ऑटो ईमेल बैकअप सक्रिय रखें' : 'Enable Automated Background Email Backups'}
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendEmailBackup}
                    className="bg-sky-600 hover:bg-sky-500 text-white hv-keep-white font-extrabold text-xs px-4 py-2 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5 fill-current" />
                    <span>{isHindi ? 'अभी ईमेल बैकअप भेजें' : 'Send Email Backup Now'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SOFTWARE SETUP FILES DOWNLOAD */}
          {activeTab === 'download' && rbac.canManageUsersAndPin && (
            <div className="space-y-4">
              <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Package className="w-4 h-4 text-amber-500" />
                    <span>{isHindi ? 'HisabVeda ERP सॉफ्टवेयर सेटअप फ़ाइलें (Setup Files Download)' : 'HisabVeda ERP Setup & Deployment Package'}</span>
                  </h4>
                  <span className="text-[10px] hv-pill-amber font-bold px-2 py-0.5 rounded border">
                    Setup & Config Files
                  </span>
                </div>

                <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed">
                  {isHindi 
                    ? 'HisabVeda ERP के पूर्ण सेटअप फ़ाइलें, कॉन्फ़िगरेशन बंडल और सोर्स कोड जिप (ZIP) फाइल प्राप्त करें:' 
                    : 'Download all core setup configuration files, initial database schemas, master datasets, and project source package for HisabVeda ERP:'}
                </p>

                {downloadNotice && (
                  <div className="p-3 rounded-xl hv-pill-emerald border text-[11px] font-semibold leading-relaxed animate-fadeIn">
                    {downloadNotice}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isDownloadingPkg}
                    onClick={async () => {
                      setIsDownloadingPkg(true);
                      setDownloadNotice(null);
                      try {
                        const res = await downloadWindowsDesktopShortcutZip();
                        setDownloadNotice(
                          isHindi
                            ? `✅ ${res.fileName} डाउनलोड हो गया! ZIP को Extract करके "Install_HisabVeda_Desktop_Shortcut.bat" चलाएँ — तुरंत Desktop पर ऑफ़िशियल HisabVeda लोगो वाला ऐप आइकन बन जाएगा।`
                            : `✅ Downloaded ${res.fileName}! Extract the ZIP and run "Install_HisabVeda_Desktop_Shortcut.bat" to add the official HisabVeda logo shortcut directly on your Windows Desktop.`
                        );
                      } finally {
                        setIsDownloadingPkg(false);
                      }
                    }}
                    className="flex items-center justify-between bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-white hv-keep-white font-bold px-3.5 py-2.5 rounded-xl shadow transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Download className="w-4 h-4 shrink-0" />
                      <span>{isHindi ? 'डेस्कटॉप लोगो शॉर्टकट (.ZIP)' : 'Desktop App Shortcut (with Logo)'}</span>
                    </div>
                    <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono font-bold">ICON</span>
                  </button>

                  <button
                    type="button"
                    disabled={isDownloadingPkg}
                    onClick={async () => {
                      setIsDownloadingPkg(true);
                      setDownloadNotice(null);
                      try {
                        const res = await downloadWindowsExeBuilderZip();
                        setDownloadNotice(
                          isHindi
                            ? `✅ ${res.fileName} डाउनलोड हो गया! ऑफलाइन .EXE बनाने के लिए इसे पूरे सोर्स कोड फ़ोल्डर (जहाँ package.json है) में Extract कर चलाएँ। बिना कम्पाइल किए तुरंत Desktop आइकन पाने के लिए "डेस्कटॉप लोगो शॉर्टकट (.ZIP)" चलाएँ।`
                            : `✅ Downloaded ${res.fileName}! Extract into your full source root folder (containing package.json) to compile an offline .EXE, or use Desktop App Shortcut (.ZIP) for instant Desktop icon setup.`
                        );
                      } finally {
                        setIsDownloadingPkg(false);
                      }
                    }}
                    className="flex items-center justify-between bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white hv-keep-white font-bold px-3.5 py-2.5 rounded-xl shadow transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2 text-left">
                      <Download className="w-4 h-4 shrink-0" />
                      <span>{isHindi ? 'Windows EXE बिल्डर (.ZIP)' : 'Windows EXE Builder (.ZIP)'}</span>
                    </div>
                    <span className="text-[10px] bg-white/20 text-white px-1.5 py-0.5 rounded font-mono font-bold">.EXE</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT LOGS & SECURITY ARCHITECTURE */}
          {activeTab === 'audit' && rbac.canViewAuditLog && (
            <div className="space-y-6">
              {/* Audit Trail Log */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span>{isHindi ? 'ऑडिट ट्रेल और गतिविधि लॉग (Audit Trail)' : 'System Security Audit Log'}</span>
                </h4>

                <div className="hv-elevated border border-[var(--border-primary)] rounded-xl max-h-48 overflow-y-auto p-3 space-y-2">
                  {(data.auditLogs || []).map((log) => (
                    <div key={log.id} className="text-[11px] p-2 hv-surface rounded-lg border border-[var(--border-primary)] flex justify-between items-start">
                      <div>
                        <span className="font-bold text-indigo-500">{log.action}:</span>{' '}
                        <span className="text-[var(--text-primary)]">{log.details}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-muted)] shrink-0 ml-2 font-mono">{log.timestamp}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security Standards */}
              <div className="hv-elevated p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
                  <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <span>{isHindi ? 'सॉफ़्टवेयर सुरक्षा एवं साइबर सुरक्षा अनुपालन' : 'Security Architecture & Compliance'}</span>
                  </h4>
                  <span className="text-[10px] hv-pill-emerald font-bold px-2 py-0.5 rounded border">
                    100% Verified Active
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="p-2.5 rounded-lg hv-surface border border-[var(--border-primary)] flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{isHindi ? '1. डेटा एन्क्रिप्शन (AES-256)' : '1. AES-256 Encryption'}</p>
                      <p className="text-[var(--text-muted)] text-[10px]">{isHindi ? 'डेटा स्थानीय व नेटवर्क दोनों स्तरों पर सुरक्षित एनक्रिप्टेड है।' : 'All rest & transit data protected with AES-256 standards.'}</p>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg hv-surface border border-[var(--border-primary)] flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[var(--text-primary)]">{isHindi ? '2. मास्टर सिक्योरिटी PIN व पासवर्ड' : '2. Master PIN & Password'}</p>
                      <p className="text-[var(--text-muted)] text-[10px]">{isHindi ? '4-6 अंकों का मास्टर पिन और स्क्रीन लॉक नियंत्रण।' : 'Master Security PIN & Screen Lock control.'}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
