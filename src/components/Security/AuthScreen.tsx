import React, { useState } from 'react';
import {
  Mail,
  Key,
  LogIn,
  UserPlus,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  User,
  X,
  Send,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db, isFirestoreQuotaError, pauseFirestoreForQuota } from '../../lib/firebase';
import { UserProfile, UserRole } from '../../types';
import { SnaLogo } from '../SnaLogo';
import { ALL_USER_ROLES, ROLE_METADATA } from '../../utils/rbac';

interface AuthScreenProps {
  isHindi: boolean;
  onLoginSuccess: (user: UserProfile) => void;
  registeredUsers: UserProfile[];
  onRegisterUser: (user: UserProfile) => void;
  masterPin?: string | null;
  onResetPassword?: (userEmail: string, newPass: string) => void;
  onBackToWebsite?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isHindi,
  onLoginSuccess,
  onRegisterUser,
  onBackToWebsite
}) => {
  const [activeTab, setActiveTab] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [providerDisabledNotice, setProviderDisabledNotice] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupRole, setSignupRole] = useState<UserRole>('ADMIN');

  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setProviderDisabledNotice(false);
    setIsGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const fbUser = userCredential.user;

      let userData: any = null;
      let userExists = false;
      try {
        const userDocRef = doc(db, 'users', fbUser.uid);
        const userDoc = await getDoc(userDocRef);
        userExists = userDoc.exists();
        userData = userExists ? userDoc.data() : null;
      } catch (profileErr) {
        if (isFirestoreQuotaError(profileErr)) {
          void pauseFirestoreForQuota();
        }
      }

      const loggedInUser: UserProfile = {
        id: fbUser.uid,
        name: (userData?.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'Admin User').slice(0, 120),
        role: (userData?.role as UserRole) || 'ADMIN',
        email: (fbUser.email || '').slice(0, 200),
        companyId: userData?.companyId || `cmp_${fbUser.uid}`,
        pin: String(userData?.pin || '').slice(0, 10)
      };

      if (fbUser.emailVerified && !userExists) {
        try {
          await setDoc(doc(db, 'users', fbUser.uid), loggedInUser);
        } catch (writeErr) {
          if (isFirestoreQuotaError(writeErr)) {
            void pauseFirestoreForQuota();
          }
        }
        onRegisterUser(loggedInUser);
      }

      onLoginSuccess(loggedInUser);
    } catch (err: any) {
      console.error('Google Sign-In Error:', err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setErrorMsg(isHindi ? 'Google लॉगिन विंडो बंद कर दी गई। कृपया पुनः प्रयास करें।' : 'Google Sign-In popup was closed. Please try again.');
      } else if (err?.code === 'auth/operation-not-allowed') {
        setErrorMsg(
          isHindi
            ? 'Google साइन-इन अभी Firebase Console में सक्षम नहीं है। कृपया Authentication > Sign-in method में Google चालू करें।'
            : 'Google Sign-In is not enabled in Firebase Console. Enable it in Authentication > Sign-in method.'
        );
      } else {
        setErrorMsg(err?.message || (isHindi ? 'Google लॉगिन असफल रहा।' : 'Google Sign-In failed.'));
      }
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setProviderDisabledNotice(false);

    if (!email.trim() || !password) {
      setErrorMsg(isHindi ? 'Email और Password दोनों दर्ज करें।' : 'Please enter both Email and Password.');
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const fbUser = userCredential.user;

      let userData: any = null;
      let userExists = false;
      try {
        const userDocRef = doc(db, 'users', fbUser.uid);
        const userDoc = await getDoc(userDocRef);
        userExists = userDoc.exists();
        userData = userExists ? userDoc.data() : null;
      } catch (profileErr) {
        if (isFirestoreQuotaError(profileErr)) {
          void pauseFirestoreForQuota();
        }
      }

      const loggedInUser: UserProfile = {
        id: fbUser.uid,
        name: (userData?.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'Admin User').slice(0, 120),
        role: (userData?.role as UserRole) || 'ADMIN',
        email: (fbUser.email || email.trim()).slice(0, 200),
        companyId: userData?.companyId || `cmp_${fbUser.uid}`,
        pin: String(userData?.pin || '').slice(0, 10)
      };

      if (fbUser.emailVerified && !userExists) {
        try {
          await setDoc(doc(db, 'users', fbUser.uid), loggedInUser);
        } catch (writeErr) {
          if (isFirestoreQuotaError(writeErr)) {
            void pauseFirestoreForQuota();
          }
        }
        onRegisterUser(loggedInUser);
      }

      onLoginSuccess(loggedInUser);
    } catch (err: any) {
      console.error('Login Error:', err);
      if (err?.code === 'auth/operation-not-allowed') {
        setProviderDisabledNotice(true);
        setErrorMsg(
          isHindi
            ? 'Firebase में Email/Password साइन-इन अभी चालू नहीं है (auth/operation-not-allowed)। तुरंत लॉगिन करने के लिए ऊपर दिए "Continue with Google" बटन पर क्लिक करें, या Firebase Console में Email/Password चालू करें।'
            : 'Email/Password sign-in is disabled in Firebase Console (auth/operation-not-allowed). Click "Continue with Google" above to sign in immediately, or enable Email/Password in Firebase Console.'
        );
      } else if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        setErrorMsg(
          isHindi
            ? 'गलत ईमेल या पासवर्ड! यदि आपका पासवर्ड याद नहीं है या नया अकाउंट है, तो "Continue with Google" चुनें या पासवर्ड रीसेट करें।'
            : 'Invalid Email or Password. Use "Forgot Password?" to reset, or click "Continue with Google" / Sign Up.'
        );
      } else {
        setErrorMsg(err?.message || (isHindi ? 'लॉगिन असफल रहा। कृपया पुनः प्रयास करें।' : 'Sign-in failed. Please try again.'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setProviderDisabledNotice(false);

    if (!signupName.trim() || !signupEmail.trim() || signupPassword.length < 6) {
      setErrorMsg(
        isHindi
          ? 'नाम, ईमेल और कम से कम 6 अक्षरों का पासवर्ड दर्ज करें।'
          : 'Please enter Name, Email, and a Password of at least 6 characters.'
      );
      return;
    }

    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, signupEmail.trim(), signupPassword);
      const fbUser = userCredential.user;
      const uniqueCompanyId = `cmp_${fbUser.uid}`;

      const newUser: UserProfile = {
        id: fbUser.uid,
        name: signupName.trim().slice(0, 120),
        role: signupRole,
        email: signupEmail.trim().slice(0, 200),
        companyId: uniqueCompanyId,
        pin: ''
      };

      if (fbUser.emailVerified) {
        try {
          await setDoc(doc(db, 'users', fbUser.uid), newUser);
        } catch (writeErr) {
          if (isFirestoreQuotaError(writeErr)) {
            void pauseFirestoreForQuota();
          }
        }
      } else {
        await sendEmailVerification(fbUser).catch(() => {});
      }

      onRegisterUser(newUser);
      onLoginSuccess(newUser);
    } catch (err: any) {
      console.error('Signup Error:', err);
      if (err?.code === 'auth/operation-not-allowed') {
        setProviderDisabledNotice(true);
        setErrorMsg(
          isHindi
            ? 'Firebase में Email/Password साइन-अप अभी चालू नहीं है (auth/operation-not-allowed)। आप "Continue with Google" से सीधे नया खाता बना सकते हैं।'
            : 'Email/Password sign-up is disabled in Firebase Console (auth/operation-not-allowed). Use "Continue with Google" to register immediately, or enable Email/Password in Firebase Console.'
        );
      } else if (err?.code === 'auth/email-already-in-use') {
        setErrorMsg(isHindi ? 'यह ईमेल पहले से पंजीकृत है। कृपया लॉगिन करें।' : 'This email is already registered. Please sign in.');
      } else {
        setErrorMsg(err?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmailReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      setErrorMsg(isHindi ? 'कृपया मान्य ईमेल आईडी दर्ज करें।' : 'Please enter a valid email address.');
      return;
    }

    setIsSendingEmail(true);
    setErrorMsg('');
    setProviderDisabledNotice(false);
    try {
      await sendPasswordResetEmail(auth, resetEmail.trim());
      setSuccessMsg(
        isHindi
          ? `पासवर्ड रीसेट लिंक "${resetEmail}" पर भेज दिया गया है। अपना इनबॉक्स/स्पैम फोल्डर चेक करें।`
          : `Password reset link sent to "${resetEmail}". Please check your Inbox or Spam folder.`
      );
      setShowForgot(false);
    } catch (err: any) {
      if (err?.code === 'auth/operation-not-allowed') {
        setProviderDisabledNotice(true);
        setErrorMsg(
          isHindi
            ? 'Firebase Console में Email/Password प्रदाता बंद होने के कारण रीसेट ईमेल नहीं भेजा जा सका। कृपया "Continue with Google" से लॉगिन करें या Firebase Console में Email/Password सक्षम करें।'
            : 'Password reset email requires Email/Password sign-in to be enabled in Firebase Console. Use "Continue with Google" or enable Email/Password in Firebase Console.'
        );
        setShowForgot(false);
      } else {
        setErrorMsg(
          isHindi
            ? 'ईमेल भेजने में समस्या आई। सुनिश्चित करें कि यह ईमेल पंजीकृत है या "Continue with Google" आज़माएँ।'
            : 'Failed to send reset email. Verify this email is registered with Email/Password or sign in with Google.'
        );
      }
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-100 font-sans relative overflow-x-hidden overflow-y-auto">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-600/20 rounded-full blur-3xl pointer-events-none"></div>

      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 relative z-10 backdrop-blur-xl my-4">
        {onBackToWebsite && (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={onBackToWebsite}
              className="text-xs font-semibold text-indigo-300 hover:text-indigo-200 hover:underline transition cursor-pointer"
            >
              ← {isHindi ? 'hisabveda.com वेबसाइट पर वापस जाएं' : 'Back to hisabveda.com'}
            </button>
          </div>
        )}
        <div className="text-center space-y-2.5">
          <div className="flex justify-center mb-1">
            <SnaLogo size="xl" variant="full" showText={false} />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">HisabVeda ERP</h1>
          <p className="text-xs text-slate-400">
            {isHindi ? 'सुरक्षित मल्टी-यूजर क्लाउड अकाउंटिंग पोर्टल' : 'Secure Multi-Tenant Cloud Accounting Portal'}
          </p>
        </div>

        {/* One-Click Google Sign-In (Works directly with Firebase Auth) */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isLoading}
          className="w-full bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-900 font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2.5 transition text-sm cursor-pointer border border-slate-200"
        >
          {isGoogleLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              <span>{isHindi ? 'Google से जुड़ रहा है...' : 'Connecting with Google...'}</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>{isHindi ? 'Google से तुरंत लॉगिन करें (Gmail)' : 'Continue with Google'}</span>
            </>
          )}
        </button>

        <div className="relative flex items-center py-0.5">
          <div className="flex-grow border-t border-slate-800"></div>
          <span className="flex-shrink mx-3 text-[11px] font-semibold uppercase text-slate-500">
            {isHindi ? 'या ईमेल से लॉगिन करें' : 'or with email & password'}
          </span>
          <div className="flex-grow border-t border-slate-800"></div>
        </div>

        <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold">
          <button
            type="button"
            onClick={() => { setActiveTab('LOGIN'); setErrorMsg(''); setSuccessMsg(''); setProviderDisabledNotice(false); }}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'LOGIN' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>{isHindi ? 'लॉगिन करें' : 'Sign In'}</span>
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('SIGNUP'); setErrorMsg(''); setSuccessMsg(''); setProviderDisabledNotice(false); }}
            className={`py-2 rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'SIGNUP' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isHindi ? 'नया खाता बनाएँ' : 'Sign Up'}</span>
          </button>
        </div>

        {errorMsg && (
          <div className="bg-rose-500/20 border border-rose-500/40 text-rose-200 p-3 rounded-xl text-xs font-semibold space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
            {providerDisabledNotice && (
              <div className="text-[11px] bg-slate-950/70 border border-slate-800 rounded-lg p-2.5 text-slate-300 space-y-1">
                <p className="font-bold text-amber-300">
                  {isHindi ? 'Email/Password कैसे चालू करें:' : 'How to enable Email/Password:'}
                </p>
                <p>
                  Firebase Console → Authentication → Sign-in method → Email/Password → Enable
                </p>
              </div>
            )}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 p-3 rounded-xl text-xs font-semibold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {activeTab === 'LOGIN' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isHindi ? 'ईमेल आईडी *' : 'Email Address *'}</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isHindi ? 'पासवर्ड *' : 'Password *'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-slate-400 hover:text-slate-200 text-[11px] flex items-center gap-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  <span>{showPassword ? (isHindi ? 'छुपाएं' : 'Hide') : (isHindi ? 'दिखाएं' : 'Show')}</span>
                </button>
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:border-indigo-500 focus:outline-none"
                required
              />
              <div className="flex justify-between items-center mt-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setResetEmail(email || '');
                    setShowForgot(true);
                  }}
                  className="text-amber-400 hover:text-amber-300 font-bold underline transition flex items-center gap-1 cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'पासवर्ड भूल गए? (Reset)' : 'Forgot Password?'}</span>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition text-sm cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isHindi ? 'लॉगिन हो रहा है...' : 'Signing in...'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>{isHindi ? 'लॉग इन करें' : 'Sign In'}</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* SIGNUP FORM */}
        {activeTab === 'SIGNUP' && (
          <form onSubmit={handleSignupSubmit} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>{isHindi ? 'पूरा नाम *' : 'Full Name *'}</span>
              </label>
              <input
                type="text"
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="e.g. Ramesh Kumar"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-amber-400" />
                <span>{isHindi ? 'ईमेल आईडी *' : 'Email Address *'}</span>
              </label>
              <input
                type="email"
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                placeholder="name@company.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-amber-400" />
                <span>{isHindi ? 'पासवर्ड (कम से कम 6 अक्षर) *' : 'Password (min 6 chars) *'}</span>
              </label>
              <input
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono focus:border-amber-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? 'यूजर भूमिका (User Role) *' : 'Account Privilege Role *'}
              </label>
              <select
                value={signupRole}
                onChange={(e) => setSignupRole(e.target.value as UserRole)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium focus:border-amber-500 focus:outline-none"
              >
                {ALL_USER_ROLES.map((roleOpt) => {
                  const meta = ROLE_METADATA[roleOpt];
                  return (
                    <option key={roleOpt} value={roleOpt}>
                      {isHindi ? meta.labelHi : meta.labelEn}
                    </option>
                  );
                })}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                {isHindi ? ROLE_METADATA[signupRole].summaryHi : ROLE_METADATA[signupRole].summaryEn}
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading || isGoogleLoading}
              className="w-full bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-amber-600/30 flex items-center justify-center gap-2 transition text-sm cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>{isHindi ? 'खाता बनाया जा रहा है...' : 'Creating Account...'}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>{isHindi ? 'खाता बनाएँ एवं लॉगिन करें' : 'Register & Sign In'}</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4 text-slate-100 relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-white">
                <KeyRound className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'पासवर्ड रीसेट लिंक भेजें' : 'Send Password Reset Link'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowForgot(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 text-xs cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendEmailReset} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'पंजीकृत ईमेल आईडी दर्ज करें:' : 'Registered Email Address:'}
                </label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-medium focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow"
                >
                  {isSendingEmail ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{isHindi ? 'भेजा जा रहा है...' : 'Sending...'}</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'रीसेट लिंक भेजें' : 'Send Reset Link'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
