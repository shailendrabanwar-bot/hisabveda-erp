import React, { useState } from 'react';
import { 
  X, 
  KeyRound, 
  Lock, 
  Unlock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  ShieldCheck, 
  AlertTriangle, 
  RotateCcw, 
  Save, 
  Sparkles,
  Shield
} from 'lucide-react';
import { AppData, UserProfile, UserRole } from '../../types';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';

interface MasterPinPasswordModalProps {
  data: AppData;
  isHindi: boolean;
  activeUser?: UserProfile | null;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  onUpdateSecurityPinAndPass: (newPin: string, pinRequired: boolean, newAdminPass?: string) => void;
  onClose: () => void;
}

export const MasterPinPasswordModal: React.FC<MasterPinPasswordModalProps> = ({
  data,
  isHindi,
  activeUser,
  activeUserRole,
  permissions,
  onUpdateSecurityPinAndPass,
  onClose
}) => {
  const rbac = permissions || getRolePermissions(normalizeUserRole(activeUserRole || activeUser?.role || 'ADMIN'));
  const currentSavedPin = data.securityPin || '';

  // PIN Form State
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [pinRequired, setPinRequired] = useState(data.pinRequired);

  // Status feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [confirmDefaultReset, setConfirmDefaultReset] = useState(false);

  // Quick preset PIN helper
  const handleSetPresetPin = (preset: string) => {
    setNewPin(preset);
    setConfirmPin(preset);
    setErrorMessage(null);
  };

  const handleGenerateRandomPin = () => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    const randomPin = (100000 + (arr[0] % 900000)).toString();
    setNewPin(randomPin);
    setConfirmPin(randomPin);
    setShowPin(true);
    setErrorMessage(null);
  };

  const handleSavePin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rbac.canManageUsersAndPin) return;
    setErrorMessage(null);
    setSuccessMessage(null);

    // Strictly verify existing configured PIN with zero hardcoded bypasses
    if (currentSavedPin && currentPinInput.trim() !== currentSavedPin) {
      setErrorMessage(
        isHindi 
          ? 'वर्तमान मास्टर पिन (Current PIN) अमान्य है!' 
          : 'Current Security PIN does not match!'
      );
      return;
    }

    if (newPin.trim().length < 4 || newPin.trim().length > 6) {
      setErrorMessage(
        isHindi 
          ? 'नया मास्टर पिन 4 से 6 अंकों का होना चाहिए।' 
          : 'New Master PIN must be between 4 and 6 digits.'
      );
      return;
    }

    if (!/^\d+$/.test(newPin.trim())) {
      setErrorMessage(
        isHindi 
          ? 'मास्टर पिन में केवल अंक (0-9) होने चाहिए।' 
          : 'Security PIN must contain digits only (0-9).'
      );
      return;
    }

    if (newPin !== confirmPin) {
      setErrorMessage(
        isHindi 
          ? 'नया पिन और पुष्टि पिन (Confirm PIN) मेल नहीं खाते!' 
          : 'New PIN and Confirm PIN do not match!'
      );
      return;
    }

    // Success: save
    onUpdateSecurityPinAndPass(newPin.trim(), pinRequired);
    setSuccessMessage(
      isHindi 
        ? `✅ मास्टर पिन सफलतापूर्वक बदल गया है! नया पिन: ${newPin.trim()}` 
        : `✅ Master Security PIN updated successfully! New PIN: ${newPin.trim()}`
    );
    setCurrentPinInput('');
    setNewPin('');
    setConfirmPin('');
  };

  const handleResetToDefault = () => {
    if (!rbac.canManageUsersAndPin) return;
    setConfirmDefaultReset(true);
  };

  const confirmResetToDefaultNow = () => {
    if (!rbac.canManageUsersAndPin) return;
    onUpdateSecurityPinAndPass('', false);
    setPinRequired(false);
    setConfirmDefaultReset(false);
    setSuccessMessage(
      isHindi
        ? '✅ मास्टर पिन लॉक साफ़ कर दिया गया है! नया कस्टम PIN सेट करें।'
        : '✅ Master PIN cleared! Please configure a new custom PIN below.'
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-slate-100 flex flex-col">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950/40 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {isHindi ? 'मास्टर सिक्योरिटी पिन बदलें' : 'Change Master Security PIN'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isHindi ? 'सॉफ़्टवेयर एक्सेस एवं स्क्रीन लॉक सुरक्षा पिन सेटिंग्स' : 'Manage application startup screen lock PIN security'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Security Overview Banner */}
        <div className="p-4 bg-slate-800/60 border-b border-slate-700/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg border ${pinRequired ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
              {pinRequired ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </div>
            <div>
              <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                <span>{isHindi ? 'वर्तमान मास्टर पिन स्थिति:' : 'Master PIN Lock:'}</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${pinRequired ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-700 text-slate-300'}`}>
                  {pinRequired ? (isHindi ? 'सक्रिय (LOCKED)' : 'ENABLED') : (isHindi ? 'अक्षम (OFF)' : 'DISABLED')}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                {isHindi ? 'लागू पिन: ' : 'Active PIN: '}
                <span className="text-amber-400 font-bold tracking-widest">
                  {showPin ? currentSavedPin : '••••'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="ml-2 text-[10px] text-slate-400 hover:text-amber-300 underline inline-flex items-center gap-0.5 cursor-pointer"
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
                onClick={handleResetToDefault}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 border border-slate-700 px-2.5 py-1 rounded-lg flex items-center gap-1 transition cursor-pointer"
                title={isHindi ? 'मास्टर पिन हटाएं' : 'Clear Master PIN'}
              >
                <RotateCcw className="w-3 h-3" />
                <span>{isHindi ? 'पिन हटाएं' : 'Clear PIN'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {!rbac.canManageUsersAndPin ? (
            <div className="p-5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs space-y-3 text-center">
              <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
              <p className="font-bold">
                {isHindi
                  ? 'अनुमति अस्वीकृत: केवल Administrator ही मास्टर सिक्योरिटी पिन बदल सकते हैं।'
                  : 'Access Denied: Only Administrators are permitted to modify Master Security PIN.'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-bold cursor-pointer"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          ) : (
            <>
          {confirmDefaultReset && (
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-500/50 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {isHindi
                  ? 'क्या आप वाकई वर्तमान मास्टर पिन हटाना चाहते हैं?'
                  : 'Clear the current Master PIN lock?'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDefaultReset(false)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                >
                  {isHindi ? 'नहीं' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={confirmResetToDefaultNow}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold cursor-pointer"
                >
                  {isHindi ? 'हाँ, रीसेट करें' : 'Confirm Reset'}
                </button>
              </div>
            </div>
          )}

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* MASTER PIN CHANGE */}
          <form onSubmit={handleSavePin} className="space-y-4">
              <div className="bg-slate-800/50 p-3.5 rounded-xl border border-slate-700/70 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="pinLockToggle" className="text-xs font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      id="pinLockToggle"
                      checked={pinRequired}
                      onChange={(e) => setPinRequired(e.target.checked)}
                      className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
                    />
                    <span>{isHindi ? 'सॉफ्टवेयर शुरू होने पर मास्टर पिन लॉक सक्रिय रखें' : 'Require Master PIN Lock when opening the software'}</span>
                  </label>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${pinRequired ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-700 text-slate-400'}`}>
                    {pinRequired ? (isHindi ? 'सुरक्षा सक्रिय' : 'Protected') : (isHindi ? 'असुरक्षित' : 'Unlocked')}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 pl-6">
                  {isHindi 
                    ? 'यदि सक्षम है, तो सॉफ़्टवेयर खोलने पर यह सुरक्षा PIN दर्ज करना आवश्यक होगा।' 
                    : 'When enabled, users must enter this PIN code every time the application is opened.'}
                </p>
              </div>

              {/* Form Fields */}
              <div className="space-y-3">
                {currentSavedPin && (
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        {isHindi ? 'वर्तमान मास्टर पिन (Current PIN) *' : 'Current Master PIN *'}
                      </label>
                    </div>
                    <input
                      type={showPin ? 'text' : 'password'}
                      maxLength={6}
                      value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value)}
                      placeholder={isHindi ? 'वर्तमान पिन दर्ज करें' : 'Enter current PIN'}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono tracking-widest text-sm focus:border-amber-500 focus:outline-none"
                      required
                    />
                  </div>
                )}

                {/* New PIN & Confirm PIN */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'नया 4-6 अंकों का पिन *' : 'New Master PIN (4-6 digits) *'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        maxLength={6}
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="••••"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono tracking-widest text-sm focus:border-amber-500 focus:outline-none text-center"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'नए पिन की पुष्टि करें (Confirm) *' : 'Confirm New PIN *'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPin ? 'text' : 'password'}
                        maxLength={6}
                        value={confirmPin}
                        onChange={(e) => setConfirmPin(e.target.value)}
                        placeholder="••••"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono tracking-widest text-sm focus:border-amber-500 focus:outline-none text-center"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800/40 p-2.5 rounded-xl border border-slate-700/50 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 font-medium">
                    {isHindi ? 'सुरक्षित 6-अंकीय रैंडम PIN जनरेटर:' : 'Secure CSPRNG 6-Digit PIN Generator:'}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={handleGenerateRandomPin}
                      className="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-bold rounded border border-amber-500/40 flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-2.5 h-2.5" />
                      <span>{isHindi ? 'सुरक्षित रैंडम पिन बनाएं' : 'Generate Strong Random PIN'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-extrabold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isHindi ? 'नया मास्टर पिन सहेजें' : 'Save Master PIN'}</span>
                </button>
              </div>
            </form>

          {/* Security Standards Footer Info */}
          <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400">
            <span className="flex items-center gap-1">
              <Shield className="w-3 h-3 text-emerald-400" />
              <span>{isHindi ? '256-बिट लोकल एन्क्रिप्टेड स्टोरेज' : 'AES-256 Local Encrypted Storage'}</span>
            </span>
            <span>{isHindi ? 'सॉफ़्टवेयर बैकअप में सुरक्षित' : 'Backed up in JSON DB'}</span>
          </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
