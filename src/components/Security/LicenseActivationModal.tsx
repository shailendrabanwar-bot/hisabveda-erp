import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Key, 
  Cpu, 
  Clock, 
  Sparkles, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Copy, 
  Check, 
  Building2, 
  X,
  Mail,
  Phone,
  Send,
  User,
  MessageCircle,
  PlayCircle,
  KeyRound
} from 'lucide-react';
import { AppData, LicenseInfo } from '../../types';
import { 
  getTrialStatus, 
  getOrGenerateMachineId,
  getHardwareBindingInfo,
  getDefaultLicenseInfo,
  activateLicenseOnMachine,
  normalizeActivationCode,
  syncServerClockFromApi,
  computeDataIntegrityHash,
  isDesktopAppRuntime
} from '../../utils/license';
import { resolveApiUrl } from '../../utils/apiBase';

interface LicenseActivationModalProps {
  data: AppData;
  onSaveLicense: (license: LicenseInfo) => void;
  onClose?: () => void;
  isHindi?: boolean;
  isForcedLock?: boolean; // true if trial expired and app is locked
  isDemoShareMode?: boolean;
  isCustomerView?: boolean;
  isSoftwareOwner?: boolean;
  initialKey?: string;
  initialOwnerName?: string;
}

export const LicenseActivationModal: React.FC<LicenseActivationModalProps> = ({
  data,
  onSaveLicense,
  onClose,
  isHindi = false,
  isForcedLock = false,
  isDemoShareMode = false,
  isCustomerView = false,
  isSoftwareOwner = false,
  initialKey = '',
  initialOwnerName = ''
}) => {
  const trialStatus = getTrialStatus(data.license, data);
  const hwInfo = getHardwareBindingInfo();
  const machineId = hwInfo.machineId || getOrGenerateMachineId();
  const isDesktop = isDesktopAppRuntime();

  const [activeTab, setActiveTab] = useState<'activate' | 'request'>('activate');
  const [inputKey, setInputKey] = useState(initialKey || data.license?.licenseKey || '');
  const [activationCode, setActivationCode] = useState('');
  const [ownerName, setOwnerName] = useState(initialOwnerName || data.license?.registeredOwner || data.company.name || '');
  const [ownerPin, setOwnerPin] = useState(data.license?.ownerPin || '');
  const [licenseMode, setLicenseMode] = useState<'SINGLE_USER' | 'MULTI_USER'>(data.license?.licenseMode || 'SINGLE_USER');
  const [maxSeats, setMaxSeats] = useState<number>(data.license?.maxSeats || (licenseMode === 'SINGLE_USER' ? 1 : 5));
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [copiedHwid, setCopiedHwid] = useState(false);

  // Customer "Request License Certificate on Email" form state
  const [reqFullName, setReqFullName] = useState('');
  const [reqEmail, setReqEmail] = useState('');
  const [reqMobile, setReqMobile] = useState('');
  const [reqPlan, setReqPlan] = useState<'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL'>('STANDARD_ANNUAL');
  const [requestStatus, setRequestStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const issuedList = data.license?.issuedLicenses || [];
  const integrityHash = computeDataIntegrityHash(data);
  const canStartFreeTrial =
    !trialStatus.isLicensed &&
    !trialStatus.isTrialExpired &&
    !trialStatus.clockTampered &&
    !trialStatus.machineMismatch &&
    !trialStatus.vaultTampered &&
    !isForcedLock;

  const whatsappMachineIdText = encodeURIComponent(
    `Hello HisabVeda Team, please issue my Signed License Certificate (HV-LIC-V3) & Unique Activation Code.\n\n${ownerName.trim() ? `Business / Company Name: ${ownerName.trim()}\n` : ''}Hardware Machine ID: ${machineId}`
  );
  const whatsappMachineIdHref = `https://wa.me/917489655303?text=${whatsappMachineIdText}`;

  const handleSendWhatsApp = () => {
    window.open(whatsappMachineIdHref, '_blank', 'noopener,noreferrer');
  };

  const handleCopyHwid = () => {
    navigator.clipboard.writeText(machineId);
    setCopiedHwid(true);
    setTimeout(() => setCopiedHwid(false), 2500);
  };

  const handleStartFreeTrial = () => {
    if (!data.license || !data.license.trialStartDate) {
      const freshTrial = getDefaultLicenseInfo();
      if (ownerName.trim()) {
        freshTrial.registeredOwner = ownerName.trim();
      }
      onSaveLicense(freshTrial);
    }
    if (onClose) {
      onClose();
    } else {
      setStatusMessage({
        type: 'success',
        text: isHindi
          ? `✅ 7-दिवसीय नि:शुल्क ट्रायल सक्रिय है (${trialStatus.daysRemaining} दिन शेष)।`
          : `✅ 7-Day Free Trial active (${trialStatus.daysRemaining} days remaining).`,
      });
    }
  };

  const handleRequestEmailLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    setRequestStatus(null);

    const cleanName = reqFullName.trim();
    const cleanEmail = reqEmail.trim().toLowerCase();
    const cleanMobile = reqMobile.trim();
    if (!cleanName || !cleanEmail || !cleanMobile) {
      setRequestStatus({
        type: 'error',
        text: isHindi
          ? 'कृपया नाम/व्यापार का नाम, ईमेल और मोबाइल नंबर दर्ज करें।'
          : 'Please enter Full Name / Business Name, Email Address, and Mobile Number.',
      });
      return;
    }

    const planLabel =
      reqPlan === 'TRIAL'
        ? 'Trial (7 Days)'
        : reqPlan === 'PRO_PERPETUAL'
          ? 'Lifetime (Perpetual License)'
          : 'Annual (1 Year Commercial)';
    const modeLabel =
      licenseMode === 'MULTI_USER'
        ? `Multi-User (${maxSeats} Seats)`
        : 'Single User (1 PC)';

    const subject = `HisabVeda ERP License Certificate Request - ${cleanName}`;
    const body = [
      'Hello HisabVeda Support Team,',
      '',
      'Please issue a Signed License Certificate (HV-LIC-V3) & Unique Activation Code for my system:',
      '',
      `Full Name / Business Name: ${cleanName}`,
      `Customer Email Address: ${cleanEmail}`,
      `Mobile Number: ${cleanMobile}`,
      `Plan Type: ${planLabel}`,
      `License Mode: ${modeLabel}`,
      `Hardware Machine ID: ${machineId}`,
      '',
      'Thank you.',
    ].join('\n');

    const mailtoHref = `mailto:support@hisabveda.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    let openedInDesktop = false;
    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.openExternalUrl) {
      openedInDesktop = await window.hisabvedaDesktop.openExternalUrl(mailtoHref).catch(() => false);
    }

    if (!openedInDesktop && typeof document !== 'undefined') {
      const mailLink = document.createElement('a');
      mailLink.href = mailtoHref;
      mailLink.style.display = 'none';
      document.body.appendChild(mailLink);
      mailLink.click();
      document.body.removeChild(mailLink);
    }

    setRequestStatus({
      type: 'success',
      text: isHindi
        ? `✅ आपका ईमेल ऐप support@hisabveda.com के साथ खुल गया है। कृपया ईमेल भेजें — सर्टिफिकेट प्राप्त होने पर Activate टैब में पेस्ट करें।`
        : `✅ Email draft prepared for support@hisabveda.com with your Machine ID (${machineId}). Send the email from your mail app to receive your license keys.`,
    });
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    const trimmedCert = inputKey.trim();
    const cleanedCode = normalizeActivationCode(activationCode);
    if (!trimmedCert || !cleanedCode) {
      setStatusMessage({
        type: 'error',
        text: isHindi
          ? 'कृपया HV-LIC-V3 लाइसेंस सर्टिफिकेट और 8-अक्षरीय Unique Activation Code (ACT-XXXX-XXXX) दोनों दर्ज करें।'
          : 'Please enter BOTH the Signed License Certificate (HV-LIC-V3) and the Unique Activation Code (ACT-XXXX-XXXX).',
      });
      return;
    }

    setIsActivating(true);
    try {
      const serverClockMs = await syncServerClockFromApi().catch(() => null);
      const effectiveNowMs = serverClockMs || Date.now();

      // Online cross-verification when API server is reachable
      if (typeof fetch === 'function') {
        try {
          const verifyRes = await fetch(resolveApiUrl('/api/license/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ certificate: trimmedCert, activationCode: cleanedCode, machineId }),
          });
          if (verifyRes.status >= 400 && verifyRes.status < 500) {
            const errJson = await verifyRes.json().catch(() => ({}));
            if (errJson?.error) {
              setStatusMessage({ type: 'error', text: errJson.error });
              return;
            }
          }
        } catch {
          // Offline desktop activation continues using local Ed25519 verification
        }
      }

      const activation = activateLicenseOnMachine({
        inputKey: trimmedCert,
        activationCode: cleanedCode,
        registeredOwner: ownerName || data.company.name,
        currentMachineId: machineId,
        ownerPin,
        licenseMode,
        maxSeats,
        existingLicense: data.license,
        issuedLicenses: issuedList,
        nowMs: effectiveNowMs,
      });

      if (activation.success && activation.license) {
        const updatedLicense = activation.license;

        if (typeof window !== 'undefined' && window.hisabvedaDesktop?.saveLicenseState) {
          await window.hisabvedaDesktop.saveLicenseState(updatedLicense).catch(() => false);
        }

        onSaveLicense(updatedLicense);
        const validitySummary =
          (updatedLicense.validityDays || 0) >= 9999
            ? (isHindi ? 'आजीवन (Lifetime)' : 'Lifetime Perpetual')
            : `${updatedLicense.validityDays} ${isHindi ? 'दिन (समाप्ति:' : 'Days (Expires:'} ${updatedLicense.expiryDate})`;
        setStatusMessage({
          type: 'success',
          text: isHindi
            ? `Ed25519 लाइसेंस इस PC (${machineId}) से लॉक होकर सक्रिय हो गया है · अवधि: ${validitySummary}`
            : `Ed25519 license verified & locked to PC (${machineId}) · Validity: ${validitySummary}`
        });

        if (onClose && !isForcedLock) {
          setTimeout(() => onClose(), 1800);
        }
      } else {
        setStatusMessage({
          type: 'error',
          text: activation.message
        });
      }
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl max-h-[92vh] text-slate-200 shadow-2xl relative flex flex-col overflow-hidden animate-fadeIn my-auto">
        
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950 shrink-0 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-2xl ${
              trialStatus.isLicensed 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : trialStatus.isTrialExpired 
                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                  : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}>
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2">
                <span>{isHindi ? 'सॉफ्टवेयर लाइसेंस एवं सुरक्षा केंद्र' : 'Software Licensing & Commercial Security Center'}</span>
                {trialStatus.isLicensed && (
                  <span className="text-[11px] text-emerald-300 font-mono font-bold">
                    · {trialStatus.daysRemaining >= 9000 ? 'PERPETUAL' : `${trialStatus.daysRemaining}D ACTIVE`}
                  </span>
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isHindi 
                  ? '7-दिवसीय नि:शुल्क ट्रायल प्रबंधन, हार्डवेयर मशीन बाइंडिंग और लाइसेंस सुरक्षा' 
                  : '7-Day Free Trial, Strict Hardware Machine Binding & AES-256 Vault Security'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isForcedLock && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-white text-xs font-bold px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition shadow shrink-0 flex items-center gap-1"
                title={isHindi ? 'बंद करें' : 'Close'}
              >
                <X className="w-4 h-4" />
                <span>{isHindi ? 'बंद करें' : 'Close'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {/* Prominent 7-Day Free Trial Onboarding Card (Shown when trial has not expired / not licensed) */}
            {canStartFreeTrial && (
              <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/40 bg-gradient-to-br from-emerald-950/60 via-slate-900 to-indigo-950/40 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                      <h3 className="text-sm sm:text-base font-extrabold text-white">
                        {isHindi ? '7-दिवसीय नि:शुल्क ट्रायल (बिना कुंजी के तुरंत शुरू करें)' : '7-Day Free Trial Onboarding'}
                      </h3>
                      <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 tabular-nums">
                        {isHindi
                          ? `${trialStatus.daysRemaining} दिन शेष`
                          : `${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'Day' : 'Days'} Remaining`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1">
                      {isHindi
                        ? `पूर्ण GST बिलिंग, लेजर और बैकअप सुविधा 7 दिन (अधिकतम ${trialStatus.maxTrialVouchers} वाउचर) तक नि:शुल्क चलाएं।`
                        : `Full GST billing, ledgers & backups included for ${trialStatus.maxTrialDays} days (${trialStatus.vouchersRemaining}/${trialStatus.maxTrialVouchers} free vouchers left).`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleStartFreeTrial}
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-xs sm:text-sm px-5 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition transform active:scale-95 flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                  >
                    <PlayCircle className="w-4 h-4 shrink-0" />
                    <span>{isHindi ? '7-दिन का फ्री ट्रायल शुरू करें (कुंजी आवश्यक नहीं)' : 'Start 7-Day Free Trial (No Key Required)'}</span>
                  </button>
                </div>

                {/* Clear 3-Step Customer Guide */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                  <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-extrabold text-emerald-400 uppercase tracking-wide">
                      {isHindi ? 'चरण 1 · फ्री ट्रायल चलाएं' : 'Step 1 · Start Free Trial'}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      {isHindi
                        ? 'ऊपर बटन दबाएं और बिना किसी लाइसेंस कुंजी के 7 दिनों तक पूरा ERP उपयोग करें।'
                        : 'Click above to explore invoicing, GST reports & accounting immediately with zero key required.'}
                    </p>
                  </div>
                  <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-extrabold text-indigo-400 uppercase tracking-wide">
                      {isHindi ? 'चरण 2 · Machine ID भेजें' : 'Step 2 · Send Machine ID'}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      {isHindi
                        ? 'नीचे "Send Machine ID on WhatsApp" या Email टैब से अपना हार्डवेयर ID साझा करें।'
                        : 'Click "Send Machine ID on WhatsApp" below or request via Email to get your dual-layer keys.'}
                    </p>
                  </div>
                  <div className="bg-slate-950/75 border border-slate-800 rounded-xl p-3">
                    <div className="text-[11px] font-extrabold text-amber-400 uppercase tracking-wide">
                      {isHindi ? 'चरण 3 · डुअल-लेयर एक्टिवेशन' : 'Step 3 · Dual-Layer Unlock'}
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      {isHindi
                        ? 'प्राप्त HV-LIC-V3 सर्टिफिकेट और Unique Activation Code (ACT-XXXX-XXXX) दर्ज कर लॉक खोलें।'
                        : 'Enter both your HV-LIC-V3 Certificate & single-use ACT-XXXX-XXXX Code below to unlock.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Trial / License Status Card */}
            <div className={`p-4 rounded-2xl border ${
              trialStatus.isLicensed 
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' 
                : trialStatus.isTrialExpired 
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200' 
                  : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
            } space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    {trialStatus.vaultTampered
                      ? (isHindi ? 'सिक्योरिटी वॉल्ट टैंपर पकड़ा गया — नया वैध लाइसेंस आवश्यक' : 'Security Vault Tampered — Re-Activation Required')
                      : trialStatus.clockTampered
                        ? (isHindi ? 'सिस्टम क्लॉक रिवर्सल पकड़ा गया (Clock Rollback Detected)' : 'System Clock Rollback Detected — Anti-Tamper Lock')
                        : trialStatus.machineMismatch
                          ? (isHindi ? 'अन्य PC का कॉपी डेटाबेस / लाइसेंस अस्वीकृत (Machine ID Mismatch)' : 'Machine ID Mismatch — Copied Database Blocked')
                          : trialStatus.lockReason === 'LICENSE_REVOKED'
                            ? (isHindi ? 'यह लाइसेंस सर्टिफिकेट एडमिन द्वारा रद्द किया गया है' : 'License Certificate Revoked by Administrator')
                            : trialStatus.lockReason === 'LICENSE_EXPIRED'
                              ? (isHindi ? 'सॉफ्टवेयर लाइसेंस की अवधि समाप्त हो गई है' : 'Software License Validity Expired')
                              : trialStatus.isLicensed 
                                ? (isHindi ? 'सक्रिय लाइसेंस: मशीन पर लॉक व चालू (Active)' : 'Active License: Hardware-Locked & Verified')
                                : trialStatus.lockReason === 'TRIAL_VOUCHERS_EXCEEDED'
                                  ? (isHindi ? `50 नि:शुल्क ट्रायल वाउचर सीमा पूर्ण (${trialStatus.vouchersUsed}/50)` : `50-Voucher Free Trial Limit Reached (${trialStatus.vouchersUsed}/50)`)
                                  : trialStatus.isTrialExpired 
                                    ? (isHindi ? '7-दिवसीय नि:शुल्क ट्रायल समाप्त हो गया है' : '7-Day Free Trial Expired')
                                    : (isHindi ? `ट्रायल चालू: ${trialStatus.daysRemaining} दिन और ${trialStatus.vouchersRemaining} वाउचर शेष` : `Trial Active: ${trialStatus.daysRemaining} Days & ${trialStatus.vouchersRemaining} Vouchers Left`)
                    }
                  </span>
                </div>

                <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 tabular-nums">
                  {trialStatus.isLicensed
                    ? `${data.license?.licenseType || 'PRO'} · ${trialStatus.daysRemaining >= 9000 ? 'Lifetime' : `${trialStatus.daysRemaining} Days Left`}`
                    : `Day ${Math.min(7, trialStatus.daysElapsed + 1)}/7 · ${trialStatus.vouchersUsed}/${trialStatus.maxTrialVouchers} Vouchers`}
                </span>
              </div>

              {trialStatus.isLicensed ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
                  <div className="bg-slate-950/70 border border-emerald-500/20 rounded-xl p-2.5">
                    <div className="text-[11px] text-slate-400">{isHindi ? 'सक्रिय तिथि' : 'Activated On'}</div>
                    <div className="font-mono font-bold text-white mt-0.5 tabular-nums">
                      {data.license?.activatedDate || (data.license?.activatedAtIso ? data.license.activatedAtIso.split('T')[0] : 'Today')}
                    </div>
                  </div>
                  <div className="bg-slate-950/70 border border-emerald-500/20 rounded-xl p-2.5">
                    <div className="text-[11px] text-slate-400">{isHindi ? 'समाप्ति तिथि' : 'Valid Until'}</div>
                    <div className="font-mono font-bold text-emerald-300 mt-0.5 tabular-nums">
                      {trialStatus.daysRemaining >= 9000 ? 'Lifetime (No Expiry)' : (data.license?.expiryDate || 'Active')}
                    </div>
                  </div>
                  <div className="bg-slate-950/70 border border-emerald-500/20 rounded-xl p-2.5">
                    <div className="text-[11px] text-slate-400">{isHindi ? 'शेष समय' : 'Countdown Remaining'}</div>
                    <div className="font-mono font-bold text-amber-300 mt-0.5 tabular-nums">
                      {trialStatus.daysRemaining >= 9000 ? 'Unlimited' : `${trialStatus.daysRemaining} Days (${trialStatus.hoursRemaining || 0}h)`}
                    </div>
                  </div>
                  <div className="bg-slate-950/70 border border-emerald-500/20 rounded-xl p-2.5">
                    <div className="text-[11px] text-slate-400">{isHindi ? 'बाउंड मशीन ID' : 'Locked Machine'}</div>
                    <div className="font-mono font-bold text-indigo-300 mt-0.5 truncate" title={trialStatus.boundMachineId || machineId}>
                      {trialStatus.boundMachineId || machineId}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                      <div className="flex justify-between text-[11px] font-semibold mb-1">
                        <span className="text-slate-400">{isHindi ? 'ट्रायल अवधि' : 'Trial Period'}</span>
                        <span className="font-mono tabular-nums text-slate-200">{Math.min(trialStatus.daysElapsed, 7)} / {trialStatus.maxTrialDays} Days</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${trialStatus.daysElapsed >= 7 ? 'bg-rose-500' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(100, (trialStatus.daysElapsed / trialStatus.maxTrialDays) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5">
                      <div className="flex justify-between text-[11px] font-semibold mb-1">
                        <span className="text-slate-400">{isHindi ? 'वाउचर / बिल सीमा' : 'Trial Voucher Limit'}</span>
                        <span className="font-mono tabular-nums text-slate-200">{trialStatus.vouchersUsed} / {trialStatus.maxTrialVouchers}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${trialStatus.vouchersUsed >= trialStatus.maxTrialVouchers ? 'bg-rose-500' : 'bg-emerald-400'}`}
                          style={{ width: `${Math.min(100, (trialStatus.vouchersUsed / trialStatus.maxTrialVouchers) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {trialStatus.vaultTampered
                      ? (isHindi
                          ? 'डिस्क पर मौजूद एन्क्रिप्टेड लाइसेंस वॉल्ट में अनधिकृत बदलाव पाया गया है। इस PC के Hardware Machine ID से बनी वैध लाइसेंस कुंजी पुनः दर्ज करें।'
                          : 'The encrypted disk license vault on this computer failed AES-256 authentication. Enter a valid License Key for your Machine ID to restore access.')
                      : trialStatus.clockTampered
                        ? (isHindi
                            ? 'विंडोज़ सिस्टम की तारीख पीछे बदली गई है। ट्रायल/लाइसेंस जारी रखने के लिए कृपया अपने कंप्यूटर की सही तारीख और समय सेट करें।'
                            : 'A backwards change in your Windows system date/time was detected. Restore your computer clock to current time to continue.')
                        : trialStatus.machineMismatch
                          ? (isHindi
                              ? `यह डेटाबेस दूसरे PC (${trialStatus.boundMachineId || 'OLD-PC'}) के लाइसेंस से जुड़ा है। वर्तमान PC (${trialStatus.currentMachineId || machineId}) पर चलाने के लिए इस मशीन की कुंजी दर्ज करें।`
                              : `Copied database mismatch: license is bound to ${trialStatus.boundMachineId || 'another PC'}, while this PC is ${trialStatus.currentMachineId || machineId}. Activate a key for this PC below.`)
                          : trialStatus.lockReason === 'LICENSE_EXPIRED'
                            ? (isHindi
                                ? 'आपके सक्रिय प्लान की समय सीमा समाप्त हो गई है। नवीनीकरण कुंजी दर्ज करके तुरंत अवधि बढ़ाएँ।'
                                : 'Your license validity period has ended. Enter a renewal License Key for this Hardware Machine ID to continue.')
                            : trialStatus.isTrialExpired
                              ? (isHindi
                                  ? 'आपका नि:शुल्क ट्रायल (7 दिन या 50 वाउचर) पूरा हो चुका है। सॉफ्टवेयर अनलॉक करने के लिए नीचे लाइसेंस कुंजी दर्ज करें।'
                                  : 'Your Free Trial limit (7 days or 50 vouchers) has been reached. Enter a machine-bound License Key below to unlock.')
                              : (isHindi
                                  ? 'ट्रायल में 7 दिन और 50 बिल/वाउचर तक की पूर्ण सुविधा शामिल है। कुंजी डालते ही वैधता तुरंत शुरू होकर इसी PC से लॉक हो जाएगी।'
                                  : 'Trial mode includes full access for up to 7 days and 50 vouchers. Activating a key locks it immediately to this Machine ID and starts the validity countdown.')
                    }
                  </p>
                </>
              )}
            </div>

        {/* Tabs: Activate License Key vs Request License Certificate on Email */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('activate')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'activate'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>{isHindi ? 'लाइसेंस कुंजी एक्टिवेट करें' : 'Activate License Key'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('request')}
            className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'request'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Mail className="w-4 h-4" />
            <span>{isHindi ? 'ईमेल पर लाइसेंस मंगवाएं' : 'Request License Certificate on Email'}</span>
          </button>
        </div>

        {/* Hardware Machine Binding (Anti-Copy Code Security) */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-indigo-400" />
              <span>{isHindi ? 'पीसी हार्डवेयर मशीन आईडी (Machine Fingerprint ID):' : 'Hardware Machine ID (Strict PC Lock):'}</span>
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleCopyHwid}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer font-semibold"
              >
                {copiedHwid ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedHwid ? (isHindi ? 'कॉपी हो गया' : 'Copied Machine ID') : (isHindi ? 'Machine ID कॉपी करें' : 'Copy Machine ID')}</span>
              </button>

              <button
                type="button"
                onClick={handleSendWhatsApp}
                className="text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer font-bold shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{isHindi ? 'WhatsApp पर Machine ID भेजें' : 'Send Machine ID on WhatsApp'}</span>
              </button>
            </div>
          </div>
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 font-mono text-indigo-300 text-sm font-extrabold tracking-wider flex flex-wrap items-center justify-between gap-2 select-all">
            <span>{machineId}</span>
            <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 font-sans tracking-normal">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
              <span>
                {hwInfo.isDesktopHardwareVerified
                  ? `Desktop Hardware Verified · ${hwInfo.hostname || 'PC'}${hwInfo.cpuCores ? ` · ${hwInfo.cpuCores} Cores` : ''}${hwInfo.hasSystemUuid ? ' · BIOS UUID Locked' : ''}`
                  : 'Browser Hardware Fingerprint Active'}
              </span>
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {isHindi
              ? '* लाइसेंस कुंजी सीधे आपके CPU / मदरबोर्ड UUID और मशीन ID से लॉक होती है। डेटाबेस फ़ोल्डर किसी दूसरे PC पर कॉपी करने पर सॉफ्टवेयर स्वतः लॉक हो जाएगा।'
              : '* License validity is encrypted on disk and tied permanently to your CPU, motherboard/BIOS UUID, and hostname. Copying the folder to another PC triggers immediate mismatch lock.'}
          </p>
        </div>

        {activeTab === 'activate' ? (
          <>
            {/* License Mode Selector: Single User vs Multi User */}
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
              <label className="block text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'लाइसेंस मोड चुनें (License Type):' : 'Select License User Mode:'}</span>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setLicenseMode('SINGLE_USER');
                    setMaxSeats(1);
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                    licenseMode === 'SINGLE_USER'
                      ? 'bg-indigo-950/60 border-indigo-500 text-indigo-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400 shrink-0 mt-0.5">
                    💻
                  </div>
                  <div>
                    <strong className="block text-xs font-bold text-white">
                      {isHindi ? 'सिंगल यूजर लाइसेंस' : 'Single User License'}
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {isHindi ? '1 PC / 1 यूजर के लिए वैधानिक एक्सेस' : 'Licensed for 1 PC / Standalone Desktop'}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLicenseMode('MULTI_USER');
                    if (maxSeats < 2) setMaxSeats(5);
                  }}
                  className={`p-3 rounded-xl border text-left transition flex items-start gap-3 ${
                    licenseMode === 'MULTI_USER'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400 shrink-0 mt-0.5">
                    🌐
                  </div>
                  <div>
                    <strong className="block text-xs font-bold text-white">
                      {isHindi ? 'मल्टी यूजर लाइसेंस (Multi-User)' : 'Multi-User License'}
                    </strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {isHindi ? 'LAN / क्लाउड मल्टी-कंप्यूटर नेटवर्क' : 'Multi-PC Network & User Accounts'}
                    </span>
                  </div>
                </button>
              </div>

              {licenseMode === 'MULTI_USER' && (
                <div className="flex items-center gap-3 pt-1">
                  <label className="text-xs text-slate-300 font-semibold">
                    {isHindi ? 'अनुमत कंप्यूटर/यूजर संख्या (Max Seats):' : 'Max Allowed PC Seats:'}
                  </label>
                  <input
                    type="number"
                    min={2}
                    max={50}
                    value={maxSeats}
                    onChange={(e) => setMaxSeats(parseInt(e.target.value) || 2)}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-xs text-amber-300 font-mono font-bold"
                  />
                </div>
              )}
            </div>

            {/* Status Message Notification */}
            {statusMessage && (
              <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                statusMessage.type === 'success' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* Link-activated Welcome Banner */}
            {initialKey && !statusMessage && (
              <div className="p-3.5 rounded-xl border border-indigo-500/40 bg-indigo-950/40 text-xs font-semibold flex items-center gap-2.5 text-indigo-200">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <div>
                  <span className="font-bold text-white block">
                    {isHindi ? 'लाइसेंस कुंजी लिंक से लोड हो गई है!' : 'License Key Loaded From Invitation Link!'}
                  </span>
                  <span className="text-[11px] text-indigo-300">
                    {isHindi 
                      ? `कुंजी: ${initialKey} — नीचे 'व्यावसायिक लाइसेंस एक्टिवेट करें' बटन पर क्लिक करके सॉफ्टवेयर अनलॉक करें।` 
                      : `Key: ${initialKey} — Click 'Activate Commercial License' below to start using full features.`}
                  </span>
                </div>
              </div>
            )}

            {/* Activation Form */}
            <form onSubmit={handleActivate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isHindi ? 'पंजीकृत कंपनी / स्वामी का नाम' : 'Registered Owner / Company Name'}</span>
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-indigo-500 outline-none"
                    placeholder="Enter Your Business / Company Name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isHindi ? 'मास्टर ओनर सुरक्षा पिन (वैकल्पिक)' : 'Master Owner Security PIN (Optional)'}</span>
                  </label>
                  <input
                    type="password"
                    maxLength={8}
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-indigo-500 outline-none font-mono"
                    placeholder={isHindi ? 'कस्टम पिन दर्ज करें' : 'Enter custom PIN'}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300 flex items-center gap-1">
                    <Key className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isHindi ? '1) Ed25519 हस्ताक्षरित लाइसेंस सर्टिफिकेट (HV-LIC-V3)' : '1) Signed License Certificate (HV-LIC-V3)'}</span>
                  </label>
                </div>

                <textarea
                  rows={2}
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value.trim())}
                  required
                  className="w-full bg-slate-950 border border-indigo-500/40 rounded-xl px-4 py-3 text-xs text-amber-300 font-mono font-bold tracking-wide focus:border-amber-400 outline-none resize-none"
                  placeholder="HV-LIC-V3.<signed-payload>.<ed25519-signature>"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-300 flex items-center gap-1">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isHindi ? '2) एक-बारगी यूनिक एक्टिवेशन कोड (Unique Activation Code)' : '2) Unique Single-Use Activation Code (ACT-XXXX-XXXX)'}</span>
                  </label>
                  <span className="text-[10px] text-emerald-400 font-semibold">
                    {isHindi ? 'मशीन ID व सर्टिफिकेट से क्रिप्टोग्राफ़िक बाइंड' : 'Single-Use · Machine-Bound'}
                  </span>
                </div>

                <input
                  type="text"
                  value={activationCode}
                  onChange={(e) => setActivationCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  required
                  maxLength={16}
                  className="w-full bg-slate-950 border border-emerald-500/40 rounded-xl px-4 py-2.5 text-sm text-emerald-300 font-mono font-extrabold tracking-widest uppercase focus:border-emerald-400 outline-none"
                  placeholder="ACT-XXXX-XXXX"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  {isHindi
                    ? '* प्रत्येक सर्टिफिकेट के साथ जारी 8-अक्षरीय कोड (ACT-XXXX-XXXX) केवल एक बार ही उपयोग किया जा सकता है।'
                    : '* Both the HV-LIC-V3 Certificate and matching ACT-XXXX-XXXX Code are required. Each code is consumed once and cannot be reused.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{isHindi ? 'लाइसेंस कुंजी के लिए सॉफ़्टवेयर प्रदाता से संपर्क करें या ईमेल से मंगवाएं' : 'Paste your HV-LIC-V3 certificate or request one via the Email tab'}</span>
                </span>

                <button
                  type="submit"
                  disabled={isActivating}
                  className="bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 disabled:opacity-60 text-slate-950 font-extrabold text-xs px-6 py-3 rounded-xl shadow-lg transition transform active:scale-95 flex items-center gap-2 ml-auto cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4 fill-current text-slate-950" />
                  <span>
                    {isActivating
                      ? (isHindi ? 'सत्यापित हो रहा है...' : 'Verifying Ed25519 Certificate...')
                      : (isHindi ? 'व्यावसायिक लाइसेंस एक्टिवेट करें' : 'Activate Commercial License')}
                  </span>
                </button>
              </div>
            </form>
          </>
        ) : (
          /* Customer "Request License Certificate on Email" Form */
          <form onSubmit={handleRequestEmailLicense} className="bg-slate-950 p-4 sm:p-5 rounded-2xl border border-emerald-500/30 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400" />
                <span>{isHindi ? 'अपने ईमेल पर लाइसेंस सर्टिफिकेट प्राप्त करें' : 'Request Signed License Certificate via Email'}</span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isHindi
                  ? 'अपना विवरण भरें — इस PC की Machine ID के लिए वैध HV-LIC-V3 सर्टिफिकेट सीधे आपके ईमेल पर भेजा जाएगा।'
                  : 'Fill in your business details below to request a signed HV-LIC-V3 certificate bound to this PC Machine ID.'}
              </p>
            </div>

            {requestStatus && (
              <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                requestStatus.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                {requestStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                <span>{requestStatus.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{isHindi ? 'पूरा नाम / व्यापार का नाम' : 'Full Name / Business Name'}</span>
                </label>
                <input
                  type="text"
                  required
                  value={reqFullName}
                  onChange={(e) => setReqFullName(e.target.value)}
                  placeholder={isHindi ? 'अपना नाम या कंपनी का नाम दर्ज करें' : 'Enter your name or company name'}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{isHindi ? 'ग्राहक ईमेल पता (Email)' : 'Customer Email Address'}</span>
                </label>
                <input
                  type="email"
                  required
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                  placeholder={isHindi ? 'अपना ईमेल पता दर्ज करें' : 'Enter your email address'}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-amber-400" />
                  <span>{isHindi ? 'मोबाइल नंबर (Mobile)' : 'Mobile Number'}</span>
                </label>
                <input
                  type="tel"
                  required
                  value={reqMobile}
                  onChange={(e) => setReqMobile(e.target.value)}
                  placeholder={isHindi ? 'अपना मोबाइल नंबर दर्ज करें' : 'Enter your mobile number'}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isHindi ? 'प्लान चुनें (Plan Type)' : 'Plan Type'}</span>
                </label>
                <select
                  value={reqPlan}
                  onChange={(e) => setReqPlan(e.target.value as 'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL')}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-semibold focus:border-emerald-500 outline-none cursor-pointer"
                >
                  <option value="TRIAL">{isHindi ? 'ट्रायल (7 Days Trial)' : 'Trial (7 Days)'}</option>
                  <option value="STANDARD_ANNUAL">{isHindi ? 'वार्षिक प्लान (Annual - 1 Year)' : 'Annual (1 Year Commercial)'}</option>
                  <option value="PRO_PERPETUAL">{isHindi ? 'आजीवन प्लान (Lifetime Perpetual)' : 'Lifetime (Perpetual License)'}</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isHindi ? 'हार्डवेयर मशीन आईडी (स्वतः लॉक)' : 'Hardware Machine ID (Auto-Filled Read-Only)'}</span>
              </label>
              <input
                type="text"
                readOnly
                value={machineId}
                className="w-full bg-slate-900/70 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 font-mono font-bold outline-none cursor-default select-all"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-slate-400">
                {isHindi ? 'ईमेल मिलने के बाद "Activate License Key" टैब में पेस्ट करें।' : 'Once emailed, paste the certificate in the "Activate License Key" tab.'}
              </span>

              <button
                type="submit"
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 ml-auto cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isHindi ? 'ईमेल पर लाइसेंस सर्टिफिकेट भेजें' : 'Send License Request via Email'}
                </span>
              </button>
            </div>
          </form>
        )}

        {/* Anti-Tamper Security Footer */}
        <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Data Integrity Token: <strong className="font-mono text-slate-400">{integrityHash}</strong></span>
          </div>

          <div className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isDesktop
                ? 'Desktop Disk Vault + Daily Auto-Backup + Clock Anti-Tamper Active'
                : 'Hardware-Locked Licensing & Clock Anti-Tamper Active'}
            </span>
          </div>
        </div>

        </div>

      </div>
    </div>
  );
};
