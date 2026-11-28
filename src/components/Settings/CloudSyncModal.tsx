import React, { useState, useEffect } from 'react';
import {
  X,
  Cloud,
  RefreshCw,
  CheckCircle2,
  Monitor,
  Laptop,
  Smartphone,
  ArrowUpCircle,
  ArrowDownCircle,
  Sparkles,
  Users,
  HardDrive,
  AlertTriangle,
  Database,
  Mail
} from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import {
  auth,
  isFirestoreQuotaPaused,
  resumeFirestoreFromQuota,
  FIREBASE_QUOTA_UPGRADE_URL,
} from '../../lib/firebase';
import { AppData } from '../../types';
import {
  pushAppDataToCloud,
  pullLatestFromCloud,
  getCloudSyncDiagnostics,
  CloudSyncStatus
} from '../../utils/cloudSync';
import {
  getStorageMode,
  setStorageMode,
  getActiveStorageUserId,
  StorageMode
} from '../../utils/storage';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHindi: boolean;
  data: AppData;
  onDataUpdated: (newData: AppData) => void;
  syncStatus: CloudSyncStatus;
  lastSyncTime?: string;
  onVerificationRefreshed?: () => Promise<boolean> | void;
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  isHindi,
  data,
  onDataUpdated,
  syncStatus,
  lastSyncTime,
  onVerificationRefreshed
}) => {
  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isSendingVerification, setIsSendingVerification] = useState(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [storageMode, setModeState] = useState<StorageMode>(() => getStorageMode(getActiveStorageUserId()));
  const [emailVerified, setEmailVerified] = useState<boolean>(() => Boolean(auth.currentUser?.emailVerified));

  useEffect(() => {
    if (isOpen) {
      setModeState(getStorageMode(getActiveStorageUserId()));
      setEmailVerified(Boolean(auth.currentUser?.emailVerified));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const diagnostics = getCloudSyncDiagnostics(data);
  const shardPercent = Math.min(100, Math.round((diagnostics.largestShardKB / 1000) * 100));

  const handleToggleStorageMode = (mode: StorageMode) => {
    const uid = getActiveStorageUserId();
    setStorageMode(mode, uid);
    setModeState(mode);
    setFeedbackMsg(
      mode === 'local'
        ? (isHindi
            ? '✓ "पर्सनल डिवाइस मोड" चालू हो गया है — अब आपका सारा डेटा केवल इसी डिवाइस में सुरक्षित रहेगा (क्लाउड सिंक बंद)।'
            : '✓ Switched to Personal Device Only Mode — all business data stays 100% local on this device.')
        : (isHindi
            ? '✓ "क्लाउड लाइव सिंक" चालू हो गया है — आपका डेटा अब आपके सभी लॉग-इन डिवाइस पर सुरक्षित सिंक होगा।'
            : '✓ Switched to Cloud Live Sync — data now syncs securely across your authorized devices.')
    );
    setTimeout(() => setFeedbackMsg(null), 5000);
  };

  const handleResendVerification = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    setIsSendingVerification(true);
    try {
      await sendEmailVerification(fbUser);
      setFeedbackMsg(
        isHindi
          ? `✓ सत्यापन ईमेल "${fbUser.email}" पर भेज दिया गया है। लिंक पर क्लिक करने के बाद "Verify & Sync" दबाएँ।`
          : `✓ Verification email sent to "${fbUser.email}". Click the link in your inbox, then click "Check Verification".`
      );
    } catch (err: any) {
      setFeedbackMsg(
        err?.message || (isHindi ? 'सत्यापन ईमेल भेजने में त्रुटि हुई।' : 'Could not send verification email.')
      );
    } finally {
      setIsSendingVerification(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleCheckVerification = async () => {
    const fbUser = auth.currentUser;
    if (!fbUser) return;
    setIsCheckingVerification(true);
    try {
      await fbUser.reload();
      await fbUser.getIdToken(true);
      const verified = Boolean(auth.currentUser?.emailVerified);
      setEmailVerified(verified);
      if (verified) {
        if (onVerificationRefreshed) {
          await onVerificationRefreshed();
        }
        setFeedbackMsg(
          isHindi
            ? '✓ ईमेल सत्यापित हो गया! क्लाउड लाइव सिंक अब सक्रिय है।'
            : '✓ Email verified! Cloud Live Sync is now active.'
        );
      } else {
        setFeedbackMsg(
          isHindi
            ? '⚠️ ईमेल अभी तक सत्यापित नहीं हुआ है। कृपया इनबॉक्स/स्पैम में दिए लिंक पर क्लिक करें।'
            : '⚠️ Email is still unverified. Please click the verification link sent to your inbox/spam folder.'
        );
      }
    } finally {
      setIsCheckingVerification(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleManualPush = async () => {
    if (storageMode === 'local') {
      setFeedbackMsg(
        isHindi
          ? '⚠️ आप अभी "पर्सनल डिवाइस मोड" में हैं। क्लाउड अपलोड के लिए ऊपर "Cloud Live Sync" चुनें।'
          : '⚠️ You are in Personal Device Only Mode. Select "Cloud Live Sync" above to upload.'
      );
      setTimeout(() => setFeedbackMsg(null), 4000);
      return;
    }

    if (auth.currentUser && !auth.currentUser.emailVerified) {
      setFeedbackMsg(
        isHindi
          ? '⚠️ क्लाउड अपलोड के लिए पहले अपना ईमेल सत्यापित (Verify Email) करें।'
          : '⚠️ Please verify your email address before uploading to Cloud Sync.'
      );
      setTimeout(() => setFeedbackMsg(null), 4500);
      return;
    }

    setIsPushing(true);
    setFeedbackMsg(null);
    try {
      if (isFirestoreQuotaPaused()) {
        await resumeFirestoreFromQuota();
      }
      const ok = await pushAppDataToCloud(data);
      if (ok) {
        setFeedbackMsg(isHindi
          ? `✓ वर्तमान डेटा (${diagnostics.shardCount} Shards / ${diagnostics.totalDatasetKB} KB) क्लाउड पर सफलतापूर्वक अपलोड हो गया!`
          : `✓ Dataset (${diagnostics.shardCount} sub-collection shards / ${diagnostics.totalDatasetKB} KB) pushed to Cloud!`);
      } else if (isFirestoreQuotaPaused()) {
        setFeedbackMsg(
          isHindi
            ? '⚠️ दैनिक मुफ्त Firestore राइट सीमा पूरी हो चुकी है। कोटा कल रीसेट होगा; तब तक सभी प्रविष्टियाँ आपके डिवाइस पर सुरक्षित सेव हैं।'
            : '⚠️ Daily free-tier Firestore write quota exceeded. Quota resets tomorrow; all entries remain safely saved locally.'
        );
      } else {
        setFeedbackMsg(isHindi ? 'चेतावनी: क्लाउड सिंक में त्रुटि हुई।' : 'Notice: Cloud sync push failed.');
      }
    } finally {
      setIsPushing(false);
      setTimeout(() => setFeedbackMsg(null), 5500);
    }
  };

  const handleManualPull = async () => {
    if (auth.currentUser && !auth.currentUser.emailVerified) {
      setFeedbackMsg(
        isHindi
          ? '⚠️ क्लाउड सिंक से डेटा लाने के लिए पहले अपना ईमेल सत्यापित करें।'
          : '⚠️ Please verify your email address before syncing from Cloud.'
      );
      setTimeout(() => setFeedbackMsg(null), 4500);
      return;
    }
    setIsPulling(true);
    setFeedbackMsg(null);
    try {
      const latest = await pullLatestFromCloud(data.company.id);
      if (latest) {
        onDataUpdated(latest);
        setFeedbackMsg(isHindi
          ? '✓ नवीनतम क्लाउड डेटा सफलतापूर्वक डाउनलोड व सिंक हो गया!'
          : '✓ Fresh data successfully pulled from Cloud!');
      } else {
        setFeedbackMsg(isHindi ? 'क्लाउड पर कोई नया डेटा उपलब्ध नहीं है।' : 'No new cloud record found.');
      }
    } finally {
      setIsPulling(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fadeIn overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-auto text-[var(--text-primary)]">

        {/* Header */}
        <div className="bg-[var(--bg-elevated)] px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${storageMode === 'local' ? 'hv-pill-amber' : 'hv-pill-emerald'}`}>
              {storageMode === 'local' ? <HardDrive className="w-5 h-5" /> : <Cloud className="w-5 h-5 animate-pulse" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm md:text-base text-[var(--text-primary)]">
                  {isHindi ? '💾 डेटा स्टोरेज एवं क्लाउड सिंक नियंत्रण' : '💾 Data Storage & Cloud Sync Control'}
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                  storageMode === 'local' ? 'hv-pill-amber' : 'hv-pill-emerald'
                }`}>
                  {storageMode === 'local' ? (isHindi ? 'लोकल डिवाइस मोड' : '100% On-Device') : 'Multi-Tenant Cloud'}
                </span>
              </div>
              {isFirestoreQuotaPaused() && (
                <div className="mt-2 p-2.5 rounded-xl hv-pill-amber border text-[11px] leading-relaxed">
                  {isHindi
                    ? 'दैनिक मुफ्त Firestore राइट कोटा पूरा हो गया है (कल स्वतः रीसेट होगा)। आपका पूरा डेटा लोकल डिवाइस पर सुरक्षित है।'
                    : 'Daily free-tier Firestore write quota reached (resets tomorrow). Your books continue saving safely on this device.'}{' '}
                  <a
                    href={FIREBASE_QUOTA_UPGRADE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-bold"
                  >
                    Firebase Console
                  </a>
                </div>
              )}
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi
                  ? 'चुनें कि आपका डेटा केवल पर्सनल डिवाइस में रहे या क्लाउड पर लाइव सिंक हो'
                  : 'Choose between 100% Local On-Device Storage or Real-Time Cloud Sync'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Message */}
        {feedbackMsg && (
          <div className="bg-indigo-600 text-white hv-keep-white px-4 py-2.5 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        )}

        {/* Content */}
        <div className="p-5 md:p-6 space-y-5 text-xs">

          {auth.currentUser && !emailVerified && (
            <div className="p-3.5 rounded-xl hv-pill-amber border space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Mail className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">
                    {isHindi ? 'क्लाउड सिंक के लिए ईमेल सत्यापन आवश्यक है' : 'Email Verification Required for Cloud Sync'}
                  </p>
                  <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    {isHindi
                      ? `आपका खाता (${auth.currentUser.email}) अभी लोकल डिवाइस मोड में सुरक्षित रूप से काम कर रहा है। क्लाउड सिंक चालू करने के लिए अपने ईमेल पर भेजे गए सत्यापन लिंक पर क्लिक करें।`
                      : `Your account (${auth.currentUser.email}) is running safely in Local Device Mode. Verify your email address to enable multi-device Firestore Cloud Sync.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isSendingVerification}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                >
                  {isSendingVerification
                    ? (isHindi ? 'भेजा जा रहा है...' : 'Sending...')
                    : (isHindi ? 'सत्यापन ईमेल भेजें' : 'Resend Verification Email')}
                </button>
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isCheckingVerification}
                  className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold text-[11px] border border-[var(--border-subtle)] transition cursor-pointer disabled:opacity-50"
                >
                  {isCheckingVerification
                    ? (isHindi ? 'जाँच हो रही है...' : 'Checking...')
                    : (isHindi ? 'सत्यापन जाँचें व सिंक करें' : 'Check Verification')}
                </button>
              </div>
            </div>
          )}

          {/* Storage Mode Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-500" />
              <span>{isHindi ? 'डेटा स्टोरेज मोड चुनें (Storage Mode):' : 'Select Data Storage Preference:'}</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleToggleStorageMode('cloud')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  storageMode === 'cloud'
                    ? 'hv-pill-emerald shadow-md'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)]'
                }`}
              >
                <Cloud className={`w-5 h-5 shrink-0 mt-0.5 ${storageMode === 'cloud' ? 'text-emerald-500' : 'text-[var(--text-muted)]'}`} />
                <div>
                  <div className="font-bold text-xs flex items-center gap-1.5 text-[var(--text-primary)]">
                    <span>{isHindi ? 'क्लाउड लाइव सिंक' : 'Cloud Live Sync'}</span>
                    {storageMode === 'cloud' && <span className="text-[9px] bg-emerald-600 text-white hv-keep-white px-1.5 py-0.2 rounded font-black">ACTIVE</span>}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-snug">
                    {isHindi
                      ? '2+ कंप्यूटर व मोबाइल पर लाइव सिंक (केवल आपके लॉगिन UID में लॉक्ड)'
                      : 'Multi-device sync locked strictly to your authenticated UID.'}
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleToggleStorageMode('local')}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer flex items-start gap-3 ${
                  storageMode === 'local'
                    ? 'hv-pill-amber shadow-md'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)]'
                }`}
              >
                <HardDrive className={`w-5 h-5 shrink-0 mt-0.5 ${storageMode === 'local' ? 'text-amber-500' : 'text-[var(--text-muted)]'}`} />
                <div>
                  <div className="font-bold text-xs flex items-center gap-1.5 text-[var(--text-primary)]">
                    <span>{isHindi ? 'पर्सनल डिवाइस मोड' : 'Personal Device Only'}</span>
                    {storageMode === 'local' && <span className="text-[9px] bg-amber-400 text-slate-950 px-1.5 py-0.2 rounded font-black">ACTIVE</span>}
                  </div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-0.5 leading-snug">
                    {isHindi
                      ? '100% ऑफ़लाइन व प्राइवेट — कोई भी खाता डेटा क्लाउड पर नहीं जाएगा।'
                      : '100% offline & private — zero accounting records sent to cloud.'}
                  </p>
                </div>
              </button>
            </div>
          </div>

          {/* Status & Payload Health Box */}
          <div className="bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                {storageMode === 'local' ? (
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                ) : (
                  <>
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 -ml-4" />
                  </>
                )}
                <span>{isHindi ? 'सिंक एवं स्टोरेज स्थिति:' : 'Sync & Storage Status:'}</span>
              </div>
              <span className={`px-2.5 py-1 rounded-lg font-mono font-bold border ${
                storageMode === 'local'
                  ? 'hv-pill-amber'
                  : syncStatus === 'error'
                    ? 'hv-pill-rose'
                    : 'hv-pill-emerald'
              }`}>
                {storageMode === 'local'
                  ? 'LOCAL DEVICE ONLY'
                  : syncStatus === 'connected'
                    ? 'LIVE CONNECTED'
                    : syncStatus === 'error'
                      ? 'SYNC ERROR'
                      : 'SYNCING'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-primary)] text-[11px]">
              <div>
                <span className="text-[var(--text-muted)] block">{isHindi ? 'सक्रिय कंपनी:' : 'Active Company:'}</span>
                <span className="font-bold text-[var(--text-primary)]">{data.company.name}</span>
              </div>
              <div>
                <span className="text-[var(--text-muted)] block">{isHindi ? 'अंतिम सिंक समय:' : 'Last Synced At:'}</span>
                <span className="font-mono text-amber-500 font-bold">
                  {storageMode === 'local' ? (isHindi ? 'डिवाइस पर सुरक्षित' : 'Saved on device') : (lastSyncTime || 'Just now')}
                </span>
              </div>
            </div>

            {/* Sub-Collection Sharded Storage Health */}
            <div className="pt-2 border-t border-[var(--border-primary)] space-y-2">
              <div className="flex items-center justify-between text-[11px] flex-wrap gap-1">
                <span className="text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 rounded hv-pill-emerald font-mono text-[10px] border">
                    SHARDED v2
                  </span>
                  <span>
                    {isHindi
                      ? `सब-कलेक्शन शार्ड्स (${diagnostics.shardCount} Shards)`
                      : `Sub-Collection Shards (${diagnostics.shardCount} Shards)`}
                  </span>
                </span>
                <span className="font-mono font-bold text-emerald-500 tabular-nums">
                  {isHindi ? 'अधिकतम शार्ड:' : 'Max Shard:'} {diagnostics.largestShardKB} KB / 1,000 KB ({shardPercent}%)
                </span>
              </div>
              <div className="w-full h-2 hv-progress-track rounded-full overflow-hidden border border-[var(--border-subtle)]">
                <div
                  className={`h-full transition-all duration-300 ${
                    shardPercent > 75 ? 'bg-rose-500' : shardPercent > 45 ? 'bg-amber-400' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.max(4, shardPercent)}%` }}
                />
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1 text-[10px]">
                <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5">
                  <span className="text-[var(--text-muted)] block">{isHindi ? 'रूट हेडर' : 'Root Header'}</span>
                  <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">{diagnostics.rootHeaderKB} KB</span>
                </div>
                <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5">
                  <span className="text-[var(--text-muted)] block">{isHindi ? 'सक्रिय शार्ड्स' : 'Active Shards'}</span>
                  <span className="font-mono font-bold text-indigo-500 tabular-nums">{diagnostics.shardCount}</span>
                </div>
                <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5">
                  <span className="text-[var(--text-muted)] block">{isHindi ? 'कुल डेटासेट' : 'Total Dataset'}</span>
                  <span className="font-mono font-bold text-emerald-500 tabular-nums">{diagnostics.totalDatasetKB} KB</span>
                </div>
              </div>
              {shardPercent > 80 && (
                <div className="flex items-center gap-1.5 text-[10px] text-amber-500 font-semibold pt-0.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {isHindi
                      ? 'एक शार्ड बड़ा है; अगली सिंक में डेटा स्वतः नए सब-कलेक्शन शार्ड्स में बंट जाएगा।'
                      : 'A single shard is large; auto-splitting keeps every Firestore document under 1 MB.'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Multi-System Illustration */}
          <div className="bg-[var(--bg-elevated)] p-4 rounded-xl border border-[var(--border-primary)] space-y-3">
            <div className="font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? 'दो या अधिक कंप्यूटरों पर एक साथ कैसे चलाएं?' : 'How to Run on 2+ Systems Simultaneously:'}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-center">
              <div className="bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-primary)] flex flex-col items-center gap-1.5">
                <Monitor className="w-6 h-6 text-indigo-500" />
                <span className="font-bold text-[var(--text-primary)]">कंप्यूटर 1 (Counter 1)</span>
                <span className="text-[10px] text-[var(--text-muted)]">बिलिंग व इनवॉइसिंग</span>
              </div>
              <div className="bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-primary)] flex flex-col items-center gap-1.5">
                <Laptop className="w-6 h-6 text-emerald-500" />
                <span className="font-bold text-[var(--text-primary)]">कंप्यूटर 2 (Counter 2)</span>
                <span className="text-[10px] text-[var(--text-muted)]">पेमेंट व लेजर रिपोर्ट</span>
              </div>
              <div className="bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-primary)] flex flex-col items-center gap-1.5">
                <Smartphone className="w-6 h-6 text-amber-500" />
                <span className="font-bold text-[var(--text-primary)]">मोबाइल / लैपटॉप</span>
                <span className="text-[10px] text-[var(--text-muted)]">रियल-टाइम लाइव व्यू</span>
              </div>
            </div>

            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed pt-1">
              {isHindi
                ? '🔒 हर ग्राहक का डेटा उसके अपने Firebase UID (cmp_<uid>) में पूरी तरह अलग व सुरक्षित रहता है — कोई भी अन्य ग्राहक आपका डेटा कभी नहीं देख सकता।'
                : '🔒 Every customer tenant is strictly isolated at database level by verified Auth UID (cmp_<uid>).'}
            </p>
          </div>

          {/* Free Tier Guarantee */}
          <div className="p-3 hv-pill-emerald rounded-xl border flex items-center gap-3">
            <Sparkles className="w-5 h-5 shrink-0" />
            <div className="text-[11px]">
              <strong>Google Spark Free Tier:</strong> 50,000 Reads / 20,000 Writes प्रतिदिन मुफ़्त, और "Personal Device Only" मोड पूरी तरह 0 सर्वर लोड पर चलता है।
            </div>
          </div>

          {/* Manual Force Sync Actions */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleManualPush}
              disabled={isPushing}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold transition shadow disabled:opacity-50 cursor-pointer"
            >
              {isPushing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="w-4 h-4" />
              )}
              <span>{isHindi ? 'क्लाउड पर अपलोड करें' : 'Upload to Cloud'}</span>
            </button>

            <button
              type="button"
              onClick={handleManualPull}
              disabled={isPulling}
              className="flex items-center justify-center gap-2 p-2.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold transition border border-[var(--border-subtle)] disabled:opacity-50 cursor-pointer"
            >
              {isPulling ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowDownCircle className="w-4 h-4 text-emerald-500" />
              )}
              <span>{isHindi ? 'क्लाउड से रिफ्रेश करें' : 'Fetch from Cloud'}</span>
            </button>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-[var(--bg-elevated)] px-5 py-3 border-t border-[var(--border-primary)] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl transition cursor-pointer"
          >
            {isHindi ? 'बंद करें' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
