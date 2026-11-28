import React, { useState } from 'react';
import { Lock, KeyRound, ShieldAlert, LogOut, ShieldCheck, Loader2, ArrowLeft } from 'lucide-react';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup
} from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { SnaLogo } from '../SnaLogo';

interface PinLockOverlayProps {
  storedPin: string;
  userEmail?: string;
  isHindi: boolean;
  onUnlock: () => void;
  onVerifiedResetPin: (newPin: string) => void;
  onLogout: () => void;
}

export const PinLockOverlay: React.FC<PinLockOverlayProps> = ({
  storedPin,
  userEmail,
  isHindi,
  onUnlock,
  onVerifiedResetPin,
  onLogout
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [accountPassword, setAccountPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [verifying, setVerifying] = useState(false);

  const currentUser = auth.currentUser;
  const hasPasswordProvider = Boolean(
    currentUser?.providerData?.some((p) => p.providerId === 'password')
  );
  const hasGoogleProvider = Boolean(
    currentUser?.providerData?.some((p) => p.providerId === 'google.com')
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (storedPin && pin === storedPin) {
      onUnlock();
    } else {
      setError(isHindi ? 'गलत PIN! कृपया पुनः प्रयास करें।' : 'Incorrect Security PIN! Please try again.');
      setPin('');
    }
  };

  const handleVerifiedPinReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!/^\d{4,6}$/.test(newPin.trim())) {
      setError(
        isHindi
          ? 'नया PIN 4 से 6 अंकों (Digits) का होना चाहिए।'
          : 'New PIN must be 4 to 6 numeric digits.'
      );
      return;
    }

    if (!currentUser) {
      setError(isHindi ? 'सक्रिय लॉगिन सत्र नहीं मिला। कृपया पुनः लॉगिन करें।' : 'No active Firebase session. Please log in again.');
      return;
    }

    setVerifying(true);
    try {
      if (hasPasswordProvider) {
        const emailToUse = currentUser.email || userEmail;
        if (!emailToUse || !accountPassword) {
          setError(isHindi ? 'सत्यापन के लिए अपना खाता पासवर्ड दर्ज करें।' : 'Enter your Firebase account password to verify identity.');
          setVerifying(false);
          return;
        }
        const credential = EmailAuthProvider.credential(emailToUse, accountPassword);
        await reauthenticateWithCredential(currentUser, credential);
      } else if (hasGoogleProvider) {
        const provider = new GoogleAuthProvider();
        await reauthenticateWithPopup(currentUser, provider);
      } else {
        setError(
          isHindi
            ? 'कृपया लॉगआउट करके अपने Email/Password से पुनः लॉगिन करें।'
            : 'Please log out and sign back in with your primary account to reset the PIN.'
        );
        setVerifying(false);
        return;
      }

      onVerifiedResetPin(newPin.trim());
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError(isHindi ? 'गलत खाता पासवर्ड! PIN रीसेट अस्वीकृत।' : 'Incorrect account password! PIN reset denied.');
      } else if (code === 'auth/popup-closed-by-user') {
        setError(isHindi ? 'Google सत्यापन पॉपअप बंद हो गया।' : 'Google verification popup was closed.');
      } else {
        setError(
          err?.message ||
            (isHindi ? 'पहचान सत्यापित नहीं हो सकी। कृपया पुनः प्रयास करें।' : 'Identity verification failed. Please try again.')
        );
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="hv-app-shell fixed inset-0 z-50 bg-[var(--bg-canvas)] flex items-center justify-center p-4">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl space-y-6 text-[var(--text-primary)] relative">
        <div className="flex flex-col items-center gap-3">
          <SnaLogo size="lg" variant="full" showText={false} />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full hv-pill-indigo border text-xs font-bold">
            {forgotMode ? <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> : <Lock className="w-3.5 h-3.5 text-amber-500" />}
            <span>{forgotMode ? 'Security Verification' : 'PIN Protection Active'}</span>
          </div>
        </div>

        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {forgotMode
              ? isHindi
                ? 'खाता सत्यापित कर PIN रीसेट करें'
                : 'Verify Account to Reset PIN'
              : isHindi
              ? 'सुरक्षा पिन दर्ज करें (PIN Lock)'
              : 'Accounting Software Locked'}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {forgotMode
              ? isHindi
                ? `${userEmail || currentUser?.email || 'खाते'} का पासवर्ड या Google लॉगिन दोबारा सत्यापित करें`
                : `Re-authenticate ${userEmail || currentUser?.email || 'your account'} before changing the PIN`
              : isHindi
              ? 'सॉफ़्टवेयर अनलॉक करने के लिए सुरक्षा PIN दर्ज करें'
              : 'Enter Security PIN to unlock application access'}
          </p>
        </div>

        {!forgotMode ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(null);
                }}
                placeholder="••••"
                className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] text-center font-mono text-2xl tracking-[0.5em] border border-[var(--border-subtle)] rounded-2xl py-3 focus:outline-none focus:border-indigo-500"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-xs text-rose-500 font-semibold flex items-center justify-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold py-3 rounded-2xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95 text-xs uppercase tracking-wider cursor-pointer"
            >
              {isHindi ? 'सॉफ़्टवेयर अनलॉक करें (Unlock)' : 'Unlock Software'}
            </button>

            <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setForgotMode(true);
                }}
                className="text-xs text-indigo-500 hover:underline font-semibold flex items-center justify-center gap-1 mx-auto transition cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>{isHindi ? 'पिन भूल गए? खाते से सत्यापित करें' : 'Forgot PIN? Verify Account'}</span>
              </button>

              <button
                type="button"
                onClick={onLogout}
                className="text-xs text-[var(--text-muted)] hover:text-rose-500 font-semibold flex items-center justify-center gap-1 mx-auto transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{isHindi ? 'लॉगआउट करके पुनः लॉगिन करें' : 'Sign Out & Re-Login'}</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleVerifiedPinReset} className="space-y-3 text-left">
            {hasPasswordProvider && (
              <div>
                <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                  {isHindi ? 'लॉगिन अकाउंट पासवर्ड' : 'Firebase Account Password'}
                </label>
                <input
                  type="password"
                  value={accountPassword}
                  onChange={(e) => {
                    setAccountPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="••••••••"
                  className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)] mb-1">
                {isHindi ? 'नया सुरक्षा PIN (4–6 अंक)' : 'New Security PIN (4–6 digits)'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={newPin}
                onChange={(e) => {
                  setNewPin(e.target.value.replace(/\D/g, ''));
                  setError(null);
                }}
                placeholder="4-6 digits"
                className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] font-mono text-center tracking-[0.35em] border border-[var(--border-subtle)] rounded-xl px-3 py-2.5 text-base focus:outline-none focus:border-indigo-500"
                required
              />
            </div>

            {error && (
              <p className="text-xs text-rose-500 font-semibold flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={verifying}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white hv-keep-white font-bold py-2.5 rounded-xl transition flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer"
            >
              {verifying && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {hasPasswordProvider
                  ? isHindi
                    ? 'पासवर्ड सत्यापित कर PIN बदलें'
                    : 'Verify Password & Reset PIN'
                  : isHindi
                  ? 'Google से सत्यापित कर PIN बदलें'
                  : 'Verify with Google & Reset PIN'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setForgotMode(false);
                setError(null);
                setAccountPassword('');
              }}
              className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] font-semibold flex items-center justify-center gap-1 py-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{isHindi ? 'वापस PIN स्क्रीन पर जाएं' : 'Back to PIN Lock'}</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
