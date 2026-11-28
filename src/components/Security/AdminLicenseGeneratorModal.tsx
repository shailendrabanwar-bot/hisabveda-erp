import React, { useState, useEffect } from 'react';
import nacl from 'tweetnacl';
import {
  ShieldCheck,
  KeyRound,
  Lock,
  Unlock,
  Copy,
  Check,
  ClipboardPaste,
  MessageCircle,
  Sparkles,
  X,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Building2,
  CalendarClock,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  base64ToBytes,
  bytesToBase64,
  deriveActivationCode,
  getConfiguredPublicKeyB64,
  utf8ToBytes,
  validateLicenseKey,
} from '../../utils/license';

interface AdminLicenseGeneratorModalProps {
  isOpen: boolean;
  isHindi?: boolean;
  onClose: () => void;
}

type ValidityOption = '1Y' | '3Y' | 'LIFETIME';

interface GeneratedLicenseBundle {
  certificate: string;
  activationCode: string;
  licenseId: string;
  clientName: string;
  hwid: string;
  planLabel: string;
  expiryLabel: string;
  issuedAtIso: string;
}

const SESSION_PRIVATE_KEY_STORAGE = 'hv_super_admin_signing_key_session';

function toBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomHexBytes(byteCount: number): string {
  const buf = new Uint8Array(byteCount);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < buf.length; i++) {
    out += buf[i].toString(16).padStart(2, '0');
  }
  return out;
}

function parseEd25519PrivateKey(rawInput: string): nacl.SignKeyPair {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Please paste your Master LICENSE_PRIVATE_KEY.');
  }

  // Hex 64 (32-byte seed) or Hex 128 (64-byte secretKey)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      seed[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return nacl.sign.keyPair.fromSeed(seed);
  }
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    const secret = new Uint8Array(64);
    for (let i = 0; i < 64; i++) {
      secret[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return nacl.sign.keyPair.fromSecretKey(secret);
  }

  // Base64 / Base64Url 32-byte seed or 64-byte secretKey
  const bytes = base64ToBytes(trimmed);
  if (bytes.length === 32) {
    return nacl.sign.keyPair.fromSeed(bytes);
  }
  if (bytes.length === 64) {
    return nacl.sign.keyPair.fromSecretKey(bytes);
  }
  throw new Error(
    `Unsupported key length (${bytes.length} bytes). Paste your 32-byte seed or 64-byte Ed25519 LICENSE_PRIVATE_KEY.`
  );
}

export const AdminLicenseGeneratorModal: React.FC<AdminLicenseGeneratorModalProps> = ({
  isOpen,
  isHindi = false,
  onClose,
}) => {
  // Never run inside Desktop Electron runtime
  const isElectronRuntime =
    typeof window !== 'undefined' && Boolean((window as any).electronAPI);

  const expectedPublicKeyB64 = getConfiguredPublicKeyB64();

  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [rememberInSession, setRememberInSession] = useState(true);
  const [unlockedKeyPair, setUnlockedKeyPair] = useState<nacl.SignKeyPair | null>(null);
  const [unlockError, setUnlockError] = useState('');

  // License generation form state
  const [hwidInput, setHwidInput] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [validityOption, setValidityOption] = useState<ValidityOption>('1Y');
  const [formError, setFormError] = useState('');

  // Generated result + copy feedback
  const [generated, setGenerated] = useState<GeneratedLicenseBundle | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<'cert' | 'code' | 'msg' | null>(null);

  // Restore session-scoped key ONLY from sessionStorage if valid against hardcoded public key
  useEffect(() => {
    if (!isOpen || isElectronRuntime) return;
    try {
      const savedSessionKey = sessionStorage.getItem(SESSION_PRIVATE_KEY_STORAGE);
      if (savedSessionKey) {
        const kp = parseEd25519PrivateKey(savedSessionKey);
        if (bytesToBase64(kp.publicKey) === expectedPublicKeyB64) {
          setUnlockedKeyPair(kp);
          setPrivateKeyInput(savedSessionKey);
          setUnlockError('');
        } else {
          sessionStorage.removeItem(SESSION_PRIVATE_KEY_STORAGE);
        }
      }
    } catch {
      try {
        sessionStorage.removeItem(SESSION_PRIVATE_KEY_STORAGE);
      } catch {
        // ignore storage errors
      }
    }
  }, [isOpen, isElectronRuntime, expectedPublicKeyB64]);

  if (!isOpen || isElectronRuntime) return null;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError('');
    try {
      const kp = parseEd25519PrivateKey(privateKeyInput);
      const derivedPublicB64 = bytesToBase64(kp.publicKey);
      if (derivedPublicB64 !== expectedPublicKeyB64) {
        setUnlockError(
          isHindi
            ? 'प्राइवेट कुंजी इस ऐप की LICENSE_PUBLIC_KEY से मेल नहीं खाती। कृपया सही Master LICENSE_PRIVATE_KEY दर्ज करें।'
            : 'This private key does not match the configured LICENSE_PUBLIC_KEY in this build.'
        );
        return;
      }

      if (rememberInSession) {
        try {
          sessionStorage.setItem(SESSION_PRIVATE_KEY_STORAGE, privateKeyInput.trim());
        } catch {
          // ignore sessionStorage quota errors
        }
      } else {
        try {
          sessionStorage.removeItem(SESSION_PRIVATE_KEY_STORAGE);
        } catch {
          // ignore
        }
      }
      setUnlockedKeyPair(kp);
    } catch (err: any) {
      setUnlockError(err?.message || 'Invalid LICENSE_PRIVATE_KEY format.');
    }
  };

  const handleLockGenerator = () => {
    setUnlockedKeyPair(null);
    setPrivateKeyInput('');
    setGenerated(null);
    setUnlockError('');
    try {
      sessionStorage.removeItem(SESSION_PRIVATE_KEY_STORAGE);
    } catch {
      // ignore
    }
  };

  const handlePasteHwid = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setHwidInput(text.trim().toUpperCase());
        setFormError('');
      }
    } catch {
      setFormError('Clipboard read blocked by browser. Paste Machine ID manually with Ctrl+V.');
    }
  };

  const handleGenerateLicense = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!unlockedKeyPair) {
      setFormError('Generator is locked. Unlock with Master LICENSE_PRIVATE_KEY first.');
      return;
    }

    const cleanHwid = hwidInput.trim().toUpperCase();
    const cleanOwner = ownerName.trim();
    if (!cleanHwid || !cleanHwid.startsWith('HV-HWID-') || cleanHwid.length < 16) {
      setFormError(
        isHindi
          ? 'कृपया ग्राहक का मान्य Hardware Machine ID (HV-HWID-...) दर्ज करें।'
          : 'Please enter a valid Customer Hardware Machine ID (HV-HWID-...).'
      );
      return;
    }
    if (!cleanOwner) {
      setFormError(
        isHindi
          ? 'कृपया पंजीकृत स्वामी / कंपनी का नाम दर्ज करें।'
          : 'Please enter the Registered Owner / Company Name.'
      );
      return;
    }

    const planConfig =
      validityOption === '1Y'
        ? { plan: 'STANDARD_ANNUAL' as const, validityDays: 365, planLabel: '1 Year Commercial (365 Days)' }
        : validityOption === '3Y'
          ? { plan: 'STANDARD_ANNUAL' as const, validityDays: 1095, planLabel: '3 Years Multi-Year (1095 Days)' }
          : { plan: 'PRO_PERPETUAL' as const, validityDays: 9999, planLabel: 'Lifetime Perpetual License' };

    const nowMs = Date.now();
    const expiresAtMs =
      planConfig.validityDays >= 9999
        ? Date.UTC(2099, 11, 31, 23, 59, 59, 999)
        : nowMs + planConfig.validityDays * 86400000;

    const licenseId = `lic_${randomHexBytes(8)}`;
    const nonce = randomHexBytes(12);

    const payload = {
      v: 3,
      app: 'HISABVEDA_ERP',
      licenseId,
      clientName: cleanOwner,
      gstinOrReg: 'UNREGISTERED',
      hwid: cleanHwid,
      plan: planConfig.plan,
      mode: 'SINGLE_USER',
      maxSeats: 1,
      issuedAtMs: nowMs,
      expiresAtMs,
      serverTimeMs: nowMs,
      nonce,
    };

    const payloadB64Url = toBase64Url(utf8ToBytes(JSON.stringify(payload)));
    const unsignedToken = `HV-LIC-V3.${payloadB64Url}`;
    const sigBytes = nacl.sign.detached(utf8ToBytes(unsignedToken), unlockedKeyPair.secretKey);
    const certificate = `${unsignedToken}.${toBase64Url(sigBytes)}`;
    const activationCode = deriveActivationCode(certificate, cleanHwid);

    // Self-verify strictly against client validator before presenting
    const verifyCheck = validateLicenseKey(
      certificate,
      cleanOwner,
      cleanHwid,
      undefined,
      nowMs,
      {
        activationCode,
        requireActivationCode: true,
      }
    );
    if (!verifyCheck.isValid) {
      setFormError(
        `Self-verification failed: ${verifyCheck.message || 'Invalid signature'}. Check that your LICENSE_PRIVATE_KEY matches this build.`
      );
      return;
    }

    setGenerated({
      certificate,
      activationCode,
      licenseId,
      clientName: cleanOwner,
      hwid: cleanHwid,
      planLabel: planConfig.planLabel,
      expiryLabel:
        planConfig.validityDays >= 9999
          ? 'Lifetime (31 Dec 2099)'
          : new Date(expiresAtMs).toISOString().split('T')[0],
      issuedAtIso: new Date(nowMs).toISOString(),
    });
  };

  const buildCustomerDeliveryMessage = (item: GeneratedLicenseBundle) =>
    [
      `🎉 *HisabVeda ERP Commercial License Activated*`,
      ``,
      `*Business / Owner:* ${item.clientName}`,
      `*Plan:* ${item.planLabel}`,
      `*Valid Until:* ${item.expiryLabel}`,
      `*Machine ID:* ${item.hwid}`,
      ``,
      `1️⃣ *Signed License Certificate:*`,
      `${item.certificate}`,
      ``,
      `2️⃣ *Unique Single-Use Activation Code:*`,
      `${item.activationCode}`,
      ``,
      `📌 *How to Activate in 30 Seconds:*`,
      `1. Open HisabVeda ERP -> Click *Activate License*`,
      `2. Enter Business Name: *${item.clientName}*`,
      `3. Paste *Signed License Certificate* AND *Activation Code*, then click *Activate*.`,
    ].join('\n');

  const handleCopy = async (text: string, target: 'cert' | 'code' | 'msg') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget((prev) => (prev === target ? null : prev)), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const sanitizedWhatsAppDigits = whatsappNumber.replace(/\D/g, '');
  const whatsAppHref = generated
    ? `https://wa.me/${sanitizedWhatsAppDigits}?text=${encodeURIComponent(
        buildCustomerDeliveryMessage(generated)
      )}`
    : '#';

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl w-full max-w-2xl my-auto shadow-2xl overflow-hidden text-[var(--text-primary)]">
        {/* Header */}
        <div className="bg-[var(--bg-elevated)] px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl hv-pill-indigo border flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <span>Super Admin License Generator</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full hv-pill-emerald border">
                  Web Admin Only
                </span>
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                Ed25519 Offline-Verified Dual-Layer Licensing (HV-LIC-V3 + ACT-XXXX-XXXX)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unlockedKeyPair && (
              <button
                type="button"
                onClick={handleLockGenerator}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hv-pill-rose border text-xs font-bold transition cursor-pointer"
                title="Clear private key from memory & sessionStorage"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Lock Key</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition cursor-pointer"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {!unlockedKeyPair ? (
            /* STEP 1: STRICT PRIVATE KEY UNLOCK GATE */
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="hv-pill-amber border rounded-2xl p-4 text-xs space-y-1.5">
                <div className="font-bold flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  <span>Master Signing Key Required (Zero Keys Stored in Code)</span>
                </div>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Paste your existing Ed25519 <code className="font-mono font-bold">LICENSE_PRIVATE_KEY</code> that matches this app&apos;s verified Public Key (<code className="font-mono text-[11px] break-all">{expectedPublicKeyB64}</code>).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5">
                  Master LICENSE_PRIVATE_KEY (Base64 / Hex)
                </label>
                <div className="relative">
                  <input
                    type={showPrivateKey ? 'text' : 'password'}
                    value={privateKeyInput}
                    onChange={(e) => {
                      setPrivateKeyInput(e.target.value);
                      setUnlockError('');
                    }}
                    placeholder="Paste your 64-byte or 32-byte Ed25519 Private Key..."
                    className="w-full hv-input border rounded-xl px-3.5 py-2.5 pr-10 text-xs font-mono outline-none focus:border-indigo-500"
                    autoComplete="off"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPrivateKey((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 cursor-pointer"
                    title={showPrivateKey ? 'Hide key' : 'Show key'}
                  >
                    {showPrivateKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberInSession}
                  onChange={(e) => setRememberInSession(e.target.checked)}
                  className="rounded border-[var(--border-subtle)] text-indigo-500"
                />
                <span>Remember in <code className="font-mono text-indigo-500 font-bold">sessionStorage</code> only until this browser tab closes</span>
              </label>

              {unlockError && (
                <div className="flex items-start gap-2 hv-pill-rose border rounded-xl p-3 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{unlockError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-extrabold py-2.5 px-4 rounded-xl text-sm shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Unlock className="w-4 h-4" />
                <span>Verify Key &amp; Unlock License Generator</span>
              </button>
            </form>
          ) : (
            /* STEP 2: UNLOCKED LICENSE GENERATION FORM */
            <div className="space-y-5">
              <div className="flex items-center justify-between hv-pill-emerald border rounded-xl px-3.5 py-2 text-xs">
                <span className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Signing Key Verified Against Public Key</span>
                </span>
                <span className="font-mono text-[10px] hidden sm:inline">
                  {expectedPublicKeyB64.slice(0, 14)}...
                </span>
              </div>

              <form onSubmit={handleGenerateLicense} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Customer Hardware Machine ID (HV-HWID-...)</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={hwidInput}
                      onChange={(e) => {
                        setHwidInput(e.target.value.toUpperCase());
                        setFormError('');
                      }}
                      placeholder="HV-HWID-..."
                      className="flex-1 hv-input border focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs font-mono outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={handlePasteHwid}
                      className="flex items-center gap-1.5 px-3 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold text-[var(--text-primary)] transition cursor-pointer shrink-0"
                    >
                      <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Paste</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-500" />
                      <span>Registered Owner / Company Name</span>
                    </label>
                    <input
                      type="text"
                      value={ownerName}
                      onChange={(e) => {
                        setOwnerName(e.target.value);
                        setFormError('');
                      }}
                      placeholder="e.g., Sharma Traders Pvt Ltd"
                      className="w-full hv-input border focus:border-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[var(--text-secondary)] mb-1.5 flex items-center gap-1.5">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Customer WhatsApp Number (Optional)</span>
                    </label>
                    <input
                      type="text"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                      placeholder="e.g., 919876543210"
                      className="w-full hv-input border focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-xs font-mono outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[var(--text-secondary)] mb-2 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-500" />
                    <span>Plan Validity</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(
                      [
                        { id: '1Y', title: '1 Year', sub: '365 Days' },
                        { id: '3Y', title: '3 Years', sub: '1095 Days' },
                        { id: 'LIFETIME', title: 'Lifetime', sub: 'Perpetual' },
                      ] as const
                    ).map((opt) => {
                      const selected = validityOption === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border text-xs cursor-pointer transition ${
                            selected
                              ? 'hv-pill-indigo font-bold shadow-sm'
                              : 'bg-[var(--bg-elevated)] border-[var(--border-primary)] text-[var(--text-secondary)] hover:border-[var(--border-subtle)]'
                          }`}
                        >
                          <input
                            type="radio"
                            name="hv-admin-plan-validity"
                            checked={selected}
                            onChange={() => setValidityOption(opt.id)}
                            className="text-indigo-500"
                          />
                          <div>
                            <div className="leading-tight text-[var(--text-primary)]">{opt.title}</div>
                            <div className="text-[10px] text-[var(--text-muted)] font-normal">{opt.sub}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {formError && (
                  <div className="flex items-start gap-2 hv-pill-rose border rounded-xl p-3 text-xs">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white hv-keep-white font-extrabold py-3 px-4 rounded-xl text-sm shadow-lg shadow-indigo-600/30 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Signed Certificate &amp; Activation Code</span>
                </button>
              </form>

              {generated && (
                <div className="bg-[var(--bg-elevated)] border border-emerald-500/40 rounded-2xl p-4 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-2.5">
                    <div>
                      <div className="text-xs font-extrabold text-emerald-500 flex items-center gap-1.5">
                        <KeyRound className="w-4 h-4" />
                        <span>License Issued for {generated.clientName}</span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {generated.planLabel} · Serial: <span className="font-mono">{generated.licenseId}</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded hv-pill-emerald border">
                      Valid Until: {generated.expiryLabel}
                    </span>
                  </div>

                  {/* Certificate Box */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                        1. Signed License Certificate (HV-LIC-V3)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(generated.certificate, 'cert')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg hv-pill-indigo border text-[11px] font-bold transition cursor-pointer"
                      >
                        {copiedTarget === 'cert' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedTarget === 'cert' ? 'Copied' : 'Copy Certificate'}</span>
                      </button>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-xl p-2.5 text-[11px] font-mono text-[var(--text-primary)] break-all max-h-24 overflow-y-auto select-all">
                      {generated.certificate}
                    </div>
                  </div>

                  {/* Activation Code Box */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-[var(--text-secondary)]">
                        2. Unique Single-Use Activation Code (ACT-XXXX-XXXX)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(generated.activationCode, 'code')}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg hv-pill-emerald border text-[11px] font-bold transition cursor-pointer"
                      >
                        {copiedTarget === 'code' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedTarget === 'code' ? 'Copied' : 'Copy Code'}</span>
                      </button>
                    </div>
                    <div className="bg-[var(--bg-surface)] border border-emerald-500/40 rounded-xl px-3.5 py-2.5 text-base font-mono font-extrabold tracking-widest text-emerald-500 select-all">
                      {generated.activationCode}
                    </div>
                  </div>

                  {/* Action Delivery Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => handleCopy(buildCustomerDeliveryMessage(generated), 'msg')}
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-extrabold transition cursor-pointer"
                    >
                      {copiedTarget === 'msg' ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-indigo-500" />}
                      <span>{copiedTarget === 'msg' ? 'Message Copied!' : 'Copy Formatted Message'}</span>
                    </button>

                    <a
                      href={whatsAppHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-extrabold shadow-lg shadow-emerald-600/25 transition"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>Send Directly on WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
