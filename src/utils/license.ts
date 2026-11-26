import nacl from 'tweetnacl';
import { AppData, IssuedLicenseRecord, LicenseInfo } from '../types';
import { resolveApiUrl } from './apiBase';

const MACHINE_ID_STORAGE_KEY = 'sna_machine_fingerprint_v1';
export const CLOCK_WATERMARK_STORAGE_KEY = 'hv_clock_watermark_v1';
export const LICENSE_ENVELOPE_STORAGE_KEY = 'hv_secure_license_envelope_v1';
export const MAX_TRIAL_DAYS = 7;
export const MAX_TRIAL_VOUCHERS = 50;
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance for minor NTP drift

/**
 * 32-byte Ed25519 Public Key ONLY (safe for browser & Electron distribution).
 * Matching Private Key is stored strictly offline or in server `process.env.LICENSE_PRIVATE_KEY`.
 */
export const DEFAULT_VENDOR_ED25519_PUBLIC_KEY_B64 = 'Z8Ht8Q8s/qmsxfm4KLeB+y/wh8Y0sWj+OAljax0FzlY=';

export function getConfiguredPublicKeyB64(override?: string): string {
  if (override && override.trim()) return override.trim();
  try {
    const viteKey = (import.meta as any)?.env?.VITE_LICENSE_PUBLIC_KEY;
    if (typeof viteKey === 'string' && viteKey.trim()) return viteKey.trim();
  } catch {
    // ignore non-Vite runtime
  }
  if (typeof process !== 'undefined' && process.env?.VITE_LICENSE_PUBLIC_KEY) {
    return process.env.VITE_LICENSE_PUBLIC_KEY.trim();
  }
  return DEFAULT_VENDOR_ED25519_PUBLIC_KEY_B64;
}

// ---------------------------------------------------------------------------
// UTF-8, Base64Url, Pure-TS RFC 6234 SHA-256 & RFC 2104 HMAC-SHA256
// ---------------------------------------------------------------------------

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function utf8ToBytes(str: string): Uint8Array {
  return textEncoder.encode(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return textDecoder.decode(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, '+').replace(/_/g, '/').trim();
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(padded, 'base64'));
  }
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256BytesSync(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x80;

  const dv = new DataView(padded.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  dv.setUint32(paddedLen - 8, hi, false);
  dv.setUint32(paddedLen - 4, lo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, h0, false);
  outDv.setUint32(4, h1, false);
  outDv.setUint32(8, h2, false);
  outDv.setUint32(12, h3, false);
  outDv.setUint32(16, h4, false);
  outDv.setUint32(20, h5, false);
  outDv.setUint32(24, h6, false);
  outDv.setUint32(28, h7, false);
  return out;
}

export function sha256HexSync(input: string): string {
  const digest = sha256BytesSync(utf8ToBytes(input));
  let hex = '';
  for (let i = 0; i < digest.length; i++) {
    hex += digest[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

export function hmacSha256HexSync(keyStr: string, messageStr: string): string {
  const blockSize = 64;
  let keyBytes = utf8ToBytes(keyStr);
  if (keyBytes.length > blockSize) {
    keyBytes = sha256BytesSync(keyBytes);
  }
  const paddedKey = new Uint8Array(blockSize);
  paddedKey.set(keyBytes);

  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = paddedKey[i] ^ 0x5c;
    iKeyPad[i] = paddedKey[i] ^ 0x36;
  }

  const msgBytes = utf8ToBytes(messageStr);
  const innerInput = new Uint8Array(blockSize + msgBytes.length);
  innerInput.set(iKeyPad);
  innerInput.set(msgBytes, blockSize);
  const innerHash = sha256BytesSync(innerInput);

  const outerInput = new Uint8Array(blockSize + 32);
  outerInput.set(oKeyPad);
  outerInput.set(innerHash, blockSize);
  const outerHash = sha256BytesSync(outerInput);

  let hex = '';
  for (let i = 0; i < outerHash.length; i++) {
    hex += outerHash[i].toString(16).padStart(2, '0');
  }
  return hex.toUpperCase();
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Storage Helpers & Sealed License Cache Envelope
// ---------------------------------------------------------------------------

function safeReadLocalStorage(key: string): string | null {
  try {
    const ls = typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : (globalThis as any)?.localStorage;
    if (!ls || typeof ls.getItem !== 'function') return null;
    return ls.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string): void {
  try {
    const ls = typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : (globalThis as any)?.localStorage;
    if (!ls || typeof ls.setItem !== 'function') return;
    ls.setItem(key, value);
  } catch {
    // ignore storage write failures
  }
}

export function isDesktopAppRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.hisabvedaDesktop?.isDesktopApp || window.snaNativeAPI?.isDesktopApp);
}

export function getOrGenerateMachineId(): string {
  try {
    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.getMachineId) {
      const desktopId = window.hisabvedaDesktop.getMachineId();
      if (desktopId && typeof desktopId === 'string' && desktopId.trim()) {
        const normalized = desktopId.trim().toUpperCase();
        safeWriteLocalStorage(MACHINE_ID_STORAGE_KEY, normalized);
        return normalized;
      }
    }

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      const nodeSeed = [
        'HISABVEDA-NODE-HWID-V3',
        typeof process !== 'undefined' ? `${process.platform}|${process.arch}|${process.cwd()}` : 'NODE',
      ].join('|');
      return `HV-HWID-${sha256HexSync(nodeSeed)}`;
    }

    // Recompute deterministic browser trait SHA-256 rather than blindly trusting editable localStorage
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const seed = [
      'HISABVEDA-BROWSER-HWID-V3',
      navigator.userAgent || 'UA',
      `${window.screen?.width || 1366}x${window.screen?.height || 768}x${window.screen?.colorDepth || 24}`,
      String(navigator.hardwareConcurrency || 4),
      navigator.language || 'en-IN',
      tz,
    ].join('|');

    const machineId = `HV-HWID-${sha256HexSync(seed)}`;
    safeWriteLocalStorage(MACHINE_ID_STORAGE_KEY, machineId);
    return machineId;
  } catch {
    return `HV-HWID-${sha256HexSync('HISABVEDA-FALLBACK-TRAIT-V3')}`;
  }
}

export interface HardwareBindingInfo {
  machineId: string;
  isDesktopHardwareVerified: boolean;
  hostname?: string;
  platform?: string;
  arch?: string;
  cpuModel?: string;
  cpuCores?: number;
  hasSystemUuid?: boolean;
  hasMachineGuid?: boolean;
  hasDiskSerial?: boolean;
}

export function getHardwareBindingInfo(): HardwareBindingInfo {
  const machineId = getOrGenerateMachineId();
  try {
    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.getHardwareSummary) {
      const summary = window.hisabvedaDesktop.getHardwareSummary();
      if (summary) {
        return {
          machineId: (summary.machineId || machineId).trim().toUpperCase(),
          isDesktopHardwareVerified: true,
          hostname: summary.hostname,
          platform: summary.platform,
          arch: summary.arch,
          cpuModel: summary.cpuModel,
          cpuCores: summary.cpuCores,
          hasSystemUuid: summary.hasSystemUuid,
          hasMachineGuid: summary.hasMachineGuid,
          hasDiskSerial: (summary as any).hasDiskSerial,
        };
      }
    }
  } catch {
    // fallback below
  }
  return {
    machineId,
    isDesktopHardwareVerified: isDesktopAppRuntime(),
  };
}

export interface SealedLicenseEnvelope {
  v: 1;
  machineId: string;
  maxObservedTimeMs: number;
  lastVerifiedServerTimeMs: number;
  trialStartDate: string;
  license: LicenseInfo | null;
}

function computeEnvelopeMac(machineId: string, bodyJson: string): string {
  return hmacSha256HexSync(`HV_ENVELOPE_MAC_V1:${machineId.trim().toUpperCase()}`, bodyJson);
}

export function sealLicenseCacheEnvelope(
  envelope: Omit<SealedLicenseEnvelope, 'v' | 'machineId'>,
  machineId: string = getOrGenerateMachineId()
): string {
  const normId = machineId.trim().toUpperCase();
  const payload: SealedLicenseEnvelope = {
    v: 1,
    machineId: normId,
    maxObservedTimeMs: Math.max(0, Number(envelope.maxObservedTimeMs || 0)),
    lastVerifiedServerTimeMs: Math.max(0, Number(envelope.lastVerifiedServerTimeMs || 0)),
    trialStartDate: envelope.trialStartDate || new Date().toISOString(),
    license: envelope.license || null,
  };
  const bodyJson = JSON.stringify(payload);
  const hmac = computeEnvelopeMac(normId, bodyJson);
  const serialized = JSON.stringify({ payload, hmac });
  safeWriteLocalStorage(LICENSE_ENVELOPE_STORAGE_KEY, serialized);
  return serialized;
}

export function readSealedLicenseCacheEnvelope(
  machineId: string = getOrGenerateMachineId()
): { exists: boolean; tampered: boolean; envelope: SealedLicenseEnvelope | null } {
  const raw = safeReadLocalStorage(LICENSE_ENVELOPE_STORAGE_KEY);
  if (!raw) {
    return { exists: false, tampered: false, envelope: null };
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.payload || typeof parsed.hmac !== 'string') {
      return { exists: true, tampered: true, envelope: null };
    }
    const normId = machineId.trim().toUpperCase();
    const expectedHmac = computeEnvelopeMac(normId, JSON.stringify(parsed.payload));
    if (!constantTimeHexEqual(parsed.hmac.toUpperCase(), expectedHmac)) {
      return { exists: true, tampered: true, envelope: null };
    }
    return { exists: true, tampered: false, envelope: parsed.payload as SealedLicenseEnvelope };
  } catch {
    return { exists: true, tampered: true, envelope: null };
  }
}

// ---------------------------------------------------------------------------
// Monotonic Clock & Server Time Attestation
// ---------------------------------------------------------------------------

let lastVerifiedServerTimeCacheMs = 0;

export function getLastVerifiedServerTimeMs(): number {
  const env = readSealedLicenseCacheEnvelope();
  return Math.max(lastVerifiedServerTimeCacheMs, env.envelope?.lastVerifiedServerTimeMs || 0);
}

export async function syncServerClockFromApi(apiBaseUrl = ''): Promise<number | null> {
  if (typeof fetch !== 'function') return null;
  try {
    const endpoint = apiBaseUrl ? `${apiBaseUrl.replace(/\/+$/, '')}/api/license/time` : resolveApiUrl('/api/license/time');
    const res = await fetch(endpoint, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const serverTimeMs = Number(json?.serverTimeMs || 0);
    if (!Number.isFinite(serverTimeMs) || serverTimeMs <= 0) return null;

    // Verify server Ed25519 signature on time payload if publicKeyB64 & signature provided
    if (json.signature && json.publicKeyB64 && json.nonce) {
      const msg = utf8ToBytes(`HV-TIME-V1.${serverTimeMs}.${json.nonce}`);
      const sig = base64ToBytes(String(json.signature));
      const pub = base64ToBytes(String(json.publicKeyB64));
      if (pub.length !== nacl.sign.publicKeyLength || sig.length !== nacl.sign.signatureLength) {
        return null;
      }
      if (!nacl.sign.detached.verify(msg, sig, pub)) {
        return null;
      }
    }

    lastVerifiedServerTimeCacheMs = Math.max(lastVerifiedServerTimeCacheMs, serverTimeMs);
    const machineId = getOrGenerateMachineId();
    const current = readSealedLicenseCacheEnvelope(machineId);
    sealLicenseCacheEnvelope(
      {
        maxObservedTimeMs: Math.max(current.envelope?.maxObservedTimeMs || 0, serverTimeMs),
        lastVerifiedServerTimeMs: lastVerifiedServerTimeCacheMs,
        trialStartDate: current.envelope?.trialStartDate || new Date(serverTimeMs).toISOString(),
        license: current.envelope?.license || null,
      },
      machineId
    );
    return serverTimeMs;
  } catch {
    return null;
  }
}

export interface ClockIntegrityResult {
  clockTampered: boolean;
  highWaterMs: number;
  effectiveNowMs: number;
}

export function checkAndAdvanceClockWatermark(
  license?: LicenseInfo,
  nowMs: number = Date.now()
): ClockIntegrityResult {
  const machineId = getOrGenerateMachineId();
  const envelopeRes = readSealedLicenseCacheEnvelope(machineId);
  const envHighWater = envelopeRes.envelope?.maxObservedTimeMs || 0;
  const envServerTime = envelopeRes.envelope?.lastVerifiedServerTimeMs || 0;

  let storedWatermark = 0;
  const rawWatermark = safeReadLocalStorage(CLOCK_WATERMARK_STORAGE_KEY);
  if (rawWatermark) {
    const parsed = Number(rawWatermark);
    if (Number.isFinite(parsed) && parsed > 0) {
      storedWatermark = parsed;
    }
  }

  let desktopClockTampered = false;
  let desktopMaxMs = 0;
  if (typeof window !== 'undefined' && window.hisabvedaDesktop?.checkClockSync) {
    try {
      const desktopRes = window.hisabvedaDesktop.checkClockSync(nowMs);
      if (desktopRes) {
        desktopClockTampered = Boolean(desktopRes.clockTampered);
        desktopMaxMs = Number(desktopRes.maxObservedTimeMs || 0);
      }
    } catch {
      // ignore desktop bridge error
    }
  }

  const licenseLastKnownMs = license?.lastKnownTimestamp ? Date.parse(license.lastKnownTimestamp) : 0;
  const trialStartMs = license?.trialStartDate ? Date.parse(license.trialStartDate) : 0;
  const activatedMs = (license?.activatedAtIso || license?.activatedDate)
    ? Date.parse(license.activatedAtIso || license.activatedDate || '')
    : 0;

  const previousHighWater = Math.max(
    storedWatermark,
    envHighWater,
    envServerTime,
    lastVerifiedServerTimeCacheMs,
    desktopMaxMs,
    Number.isFinite(licenseLastKnownMs) ? licenseLastKnownMs : 0,
    Number.isFinite(activatedMs) ? activatedMs : 0
  );

  const rolledBackFromWatermark =
    previousHighWater > 0 && nowMs + CLOCK_SKEW_TOLERANCE_MS < previousHighWater;
  const rolledBackBeforeTrial =
    Number.isFinite(trialStartMs) && trialStartMs > 0 && nowMs + CLOCK_SKEW_TOLERANCE_MS < trialStartMs;

  if (desktopClockTampered || rolledBackFromWatermark || rolledBackBeforeTrial) {
    const preservedHighWater = Math.max(
      previousHighWater,
      Number.isFinite(trialStartMs) ? trialStartMs : 0
    );
    if (preservedHighWater > 0) {
      safeWriteLocalStorage(CLOCK_WATERMARK_STORAGE_KEY, String(preservedHighWater));
    }
    return {
      clockTampered: true,
      highWaterMs: preservedHighWater,
      effectiveNowMs: Math.max(nowMs, preservedHighWater),
    };
  }

  const nextHighWater = Math.max(previousHighWater, nowMs);
  safeWriteLocalStorage(CLOCK_WATERMARK_STORAGE_KEY, String(nextHighWater));
  return {
    clockTampered: false,
    highWaterMs: nextHighWater,
    effectiveNowMs: nowMs,
  };
}

// ---------------------------------------------------------------------------
// Ed25519 Signed License Certificate Parsing & Verification (Public Key Only)
// ---------------------------------------------------------------------------

export interface SignedLicensePayloadV3 {
  v: 3;
  app: 'HISABVEDA_ERP';
  licenseId: string;
  clientName: string;
  gstinOrReg?: string;
  hwid: string;
  plan: 'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL' | 'ENTERPRISE';
  mode: 'SINGLE_USER' | 'MULTI_USER';
  maxSeats: number;
  issuedAtMs: number;
  expiresAtMs: number;
  serverTimeMs?: number;
  nonce?: string;
}

export interface VerifySignedCertificateResult {
  isValid: boolean;
  reason?: 'MALFORMED' | 'INVALID_SIGNATURE' | 'MACHINE_MISMATCH' | 'EXPIRED';
  error?: string;
  payload?: SignedLicensePayloadV3;
}

export function parseAndVerifySignedLicense(
  licString: string,
  expectedMachineId?: string,
  nowMs: number = Date.now(),
  options?: {
    publicKeyB64?: string;
    skipMachineCheck?: boolean;
    skipExpiryCheck?: boolean;
  }
): VerifySignedCertificateResult {
  try {
    const trimmed = (licString || '').trim();
    if (!trimmed.startsWith('HV-LIC-V3.')) {
      return {
        isValid: false,
        reason: 'MALFORMED',
        error: 'Invalid or legacy license format. Only Ed25519-signed HV-LIC-V3 certificates are accepted.',
      };
    }

    const parts = trimmed.split('.');
    if (parts.length !== 3) {
      return { isValid: false, reason: 'MALFORMED', error: 'Malformed HV-LIC-V3 certificate structure.' };
    }

    const unsignedToken = `${parts[0]}.${parts[1]}`;
    const sigBytes = base64ToBytes(parts[2]);
    const pubKeyBytes = base64ToBytes(getConfiguredPublicKeyB64(options?.publicKeyB64));

    if (
      sigBytes.length !== nacl.sign.signatureLength ||
      pubKeyBytes.length !== nacl.sign.publicKeyLength
    ) {
      return {
        isValid: false,
        reason: 'INVALID_SIGNATURE',
        error: 'Invalid Ed25519 signature or public key length.',
      };
    }

    const sigOk = nacl.sign.detached.verify(utf8ToBytes(unsignedToken), sigBytes, pubKeyBytes);
    if (!sigOk) {
      return {
        isValid: false,
        reason: 'INVALID_SIGNATURE',
        error: 'Ed25519 cryptographic signature verification failed (tampered or forged certificate).',
      };
    }

    const decodedJson = bytesToUtf8(base64ToBytes(parts[1]));
    const payload = JSON.parse(decodedJson) as SignedLicensePayloadV3;

    if (
      !payload ||
      payload.v !== 3 ||
      payload.app !== 'HISABVEDA_ERP' ||
      !payload.clientName ||
      !payload.hwid ||
      !Number.isFinite(payload.expiresAtMs)
    ) {
      return { isValid: false, reason: 'MALFORMED', error: 'Signed license payload is missing required claims.' };
    }

    const payloadHwid = String(payload.hwid).trim().toUpperCase();
    const targetHwid = expectedMachineId ? expectedMachineId.trim().toUpperCase() : '';
    if (!options?.skipMachineCheck && targetHwid && payloadHwid !== 'ANY_HARDWARE_ID' && payloadHwid !== targetHwid) {
      return {
        isValid: false,
        reason: 'MACHINE_MISMATCH',
        error: `Machine ID mismatch: Certificate is locked to ${payloadHwid} (this PC is ${targetHwid}).`,
        payload,
      };
    }

    if (!options?.skipExpiryCheck && payload.expiresAtMs < nowMs) {
      return {
        isValid: false,
        reason: 'EXPIRED',
        error: 'Signed license certificate has expired.',
        payload,
      };
    }

    return { isValid: true, payload };
  } catch {
    return {
      isValid: false,
      reason: 'MALFORMED',
      error: 'Failed to decode Ed25519 license certificate.',
    };
  }
}

export function parseAndVerifyEncryptedLicenseString(
  licString: string,
  expectedMachineId?: string,
  nowMs: number = Date.now(),
  publicKeyB64?: string
): { isValid: boolean; data?: SignedLicensePayloadV3; error?: string } {
  const res = parseAndVerifySignedLicense(licString, expectedMachineId, nowMs, { publicKeyB64 });
  return {
    isValid: res.isValid,
    data: res.payload,
    error: res.error,
  };
}

// ---------------------------------------------------------------------------
// Trial Status, License Validation & Activation
// ---------------------------------------------------------------------------

export function getDefaultLicenseInfo(): LicenseInfo {
  const nowIso = new Date().toISOString();
  return {
    trialStartDate: nowIso,
    isLicensed: false,
    licenseKey: '',
    registeredOwner: '',
    machineId: getOrGenerateMachineId(),
    licenseType: 'TRIAL',
    lastKnownTimestamp: nowIso,
    clockTamperDetected: false,
  };
}

export type TrialLockReason =
  | 'NONE'
  | 'TRIAL_DAYS_EXPIRED'
  | 'TRIAL_VOUCHERS_EXCEEDED'
  | 'LICENSE_EXPIRED'
  | 'LICENSE_REVOKED'
  | 'CLOCK_TAMPERED'
  | 'MACHINE_MISMATCH'
  | 'VAULT_TAMPERED';

export interface TrialStatus {
  isLicensed: boolean;
  daysElapsed: number;
  daysRemaining: number;
  hoursRemaining?: number;
  vouchersUsed: number;
  vouchersRemaining: number;
  maxTrialVouchers: number;
  maxTrialDays: number;
  isTrialExpired: boolean;
  clockTampered: boolean;
  machineMismatch: boolean;
  vaultTampered?: boolean;
  lockReason: TrialLockReason;
  trialStartDate: Date;
  expiresAt?: Date | null;
  boundMachineId?: string;
  currentMachineId?: string;
  licenseType: string;
}

export function countTrialTransactions(
  usageData?: Partial<Pick<AppData, 'vouchers' | 'invoices' | 'purchaseInvoices'>>
): number {
  if (!usageData) return 0;
  return (
    (usageData.vouchers?.length || 0) +
    (usageData.invoices?.length || 0) +
    (usageData.purchaseInvoices?.length || 0)
  );
}

export function getTrialStatus(
  license?: LicenseInfo,
  usageData?: Partial<Pick<AppData, 'vouchers' | 'invoices' | 'purchaseInvoices'>>,
  nowMs: number = Date.now(),
  options?: { publicKeyB64?: string }
): TrialStatus {
  const currentMachineId = getOrGenerateMachineId().trim().toUpperCase();
  const envelopeCheck = readSealedLicenseCacheEnvelope(currentMachineId);
  const clockIntegrity = checkAndAdvanceClockWatermark(license, nowMs);
  const vouchersUsed = countTrialTransactions(usageData);
  const vouchersRemaining = Math.max(0, MAX_TRIAL_VOUCHERS - vouchersUsed);

  if (envelopeCheck.tampered) {
    return {
      isLicensed: false,
      daysElapsed: MAX_TRIAL_DAYS,
      daysRemaining: 0,
      hoursRemaining: 0,
      vouchersUsed,
      vouchersRemaining,
      maxTrialVouchers: MAX_TRIAL_VOUCHERS,
      maxTrialDays: MAX_TRIAL_DAYS,
      isTrialExpired: true,
      clockTampered: false,
      machineMismatch: true,
      vaultTampered: true,
      lockReason: 'VAULT_TAMPERED',
      trialStartDate: new Date(nowMs),
      boundMachineId: license?.machineId || currentMachineId,
      currentMachineId,
      licenseType: 'VAULT_LOCKED',
    };
  }

  if (!license) {
    const vouchersExceeded = usageData ? vouchersUsed >= MAX_TRIAL_VOUCHERS : false;
    return {
      isLicensed: false,
      daysElapsed: 0,
      daysRemaining: MAX_TRIAL_DAYS,
      hoursRemaining: MAX_TRIAL_DAYS * 24,
      vouchersUsed,
      vouchersRemaining,
      maxTrialVouchers: MAX_TRIAL_VOUCHERS,
      maxTrialDays: MAX_TRIAL_DAYS,
      isTrialExpired: clockIntegrity.clockTampered || vouchersExceeded,
      clockTampered: clockIntegrity.clockTampered,
      machineMismatch: false,
      vaultTampered: false,
      lockReason: clockIntegrity.clockTampered
        ? 'CLOCK_TAMPERED'
        : vouchersExceeded
          ? 'TRIAL_VOUCHERS_EXCEEDED'
          : 'NONE',
      trialStartDate: new Date(nowMs),
      expiresAt: new Date(nowMs + MAX_TRIAL_DAYS * 86400000),
      currentMachineId,
      licenseType: 'TRIAL',
    };
  }

  const parsedStart = new Date(license.trialStartDate || nowMs);
  const trialStartDate = isNaN(parsedStart.getTime()) ? new Date(nowMs) : parsedStart;

  if (license.vaultTampered) {
    return {
      isLicensed: false,
      daysElapsed: MAX_TRIAL_DAYS,
      daysRemaining: 0,
      hoursRemaining: 0,
      vouchersUsed,
      vouchersRemaining,
      maxTrialVouchers: MAX_TRIAL_VOUCHERS,
      maxTrialDays: MAX_TRIAL_DAYS,
      isTrialExpired: true,
      clockTampered: false,
      machineMismatch: true,
      vaultTampered: true,
      lockReason: 'VAULT_TAMPERED',
      trialStartDate,
      boundMachineId: license.machineId,
      currentMachineId,
      licenseType: 'VAULT_LOCKED',
    };
  }

  if (clockIntegrity.clockTampered) {
    return {
      isLicensed: false,
      daysElapsed: MAX_TRIAL_DAYS,
      daysRemaining: 0,
      hoursRemaining: 0,
      vouchersUsed,
      vouchersRemaining,
      maxTrialVouchers: MAX_TRIAL_VOUCHERS,
      maxTrialDays: MAX_TRIAL_DAYS,
      isTrialExpired: true,
      clockTampered: true,
      machineMismatch: false,
      vaultTampered: false,
      lockReason: 'CLOCK_TAMPERED',
      trialStartDate,
      boundMachineId: license.machineId,
      currentMachineId,
      licenseType: 'CLOCK_LOCKED',
    };
  }

  if (license.isLicensed) {
    // Cryptographically re-verify the Ed25519 certificate on EVERY check — unsigned/tampered state cannot unlock
    const sigCheck = parseAndVerifySignedLicense(
      license.licenseKey || '',
      currentMachineId,
      clockIntegrity.effectiveNowMs,
      {
        publicKeyB64: options?.publicKeyB64,
        skipMachineCheck: true,
        skipExpiryCheck: true,
      }
    );

    if (!sigCheck.isValid || !sigCheck.payload) {
      return {
        isLicensed: false,
        daysElapsed: MAX_TRIAL_DAYS,
        daysRemaining: 0,
        hoursRemaining: 0,
        vouchersUsed,
        vouchersRemaining,
        maxTrialVouchers: MAX_TRIAL_VOUCHERS,
        maxTrialDays: MAX_TRIAL_DAYS,
        isTrialExpired: true,
        clockTampered: false,
        machineMismatch: true,
        vaultTampered: true,
        lockReason: 'VAULT_TAMPERED',
        trialStartDate,
        boundMachineId: license.machineId,
        currentMachineId,
        licenseType: 'SIGNATURE_INVALID',
      };
    }

    const signedPayload = sigCheck.payload;
    const signedHwid = signedPayload.hwid.trim().toUpperCase();
    const recordHwid = (license.machineId || '').trim().toUpperCase();

    const machineMismatch = Boolean(
      (signedHwid !== 'ANY_HARDWARE_ID' && signedHwid !== currentMachineId) ||
      (recordHwid && recordHwid !== 'ANY_HARDWARE_ID' && recordHwid !== currentMachineId)
    );

    if (machineMismatch) {
      return {
        isLicensed: false,
        daysElapsed: MAX_TRIAL_DAYS,
        daysRemaining: 0,
        hoursRemaining: 0,
        vouchersUsed,
        vouchersRemaining,
        maxTrialVouchers: MAX_TRIAL_VOUCHERS,
        maxTrialDays: MAX_TRIAL_DAYS,
        isTrialExpired: true,
        clockTampered: false,
        machineMismatch: true,
        vaultTampered: false,
        lockReason: 'MACHINE_MISMATCH',
        trialStartDate,
        boundMachineId: signedHwid !== 'ANY_HARDWARE_ID' ? signedHwid : recordHwid,
        currentMachineId,
        licenseType: signedPayload.plan || license.licenseType || 'MACHINE_LOCKED',
      };
    }

    // Revocation check against tracked issuedLicenses registry
    const revokedMatch = (license.issuedLicenses || []).find(
      (rec) =>
        rec.status === 'REVOKED' &&
        (rec.id === signedPayload.licenseId || rec.licenseKey.trim() === (license.licenseKey || '').trim())
    );
    if (revokedMatch) {
      return {
        isLicensed: false,
        daysElapsed: MAX_TRIAL_DAYS,
        daysRemaining: 0,
        hoursRemaining: 0,
        vouchersUsed,
        vouchersRemaining,
        maxTrialVouchers: MAX_TRIAL_VOUCHERS,
        maxTrialDays: MAX_TRIAL_DAYS,
        isTrialExpired: true,
        clockTampered: false,
        machineMismatch: false,
        vaultTampered: false,
        lockReason: 'LICENSE_REVOKED',
        trialStartDate,
        boundMachineId: signedHwid,
        currentMachineId,
        licenseType: 'REVOKED',
      };
    }

    // Authoritative expiry comes strictly from signed Ed25519 payload.expiresAtMs
    const expiresAt = new Date(signedPayload.expiresAtMs);
    const diffMs = signedPayload.expiresAtMs - clockIntegrity.effectiveNowMs;
    const isExpired = diffMs <= 0;
    const daysRemaining = isExpired ? 0 : Math.ceil(diffMs / 86400000);
    const hoursRemaining = isExpired ? 0 : Math.max(0, Math.ceil(diffMs / 3600000));

    if (isExpired) {
      return {
        isLicensed: false,
        daysElapsed: license.validityDays || 365,
        daysRemaining: 0,
        hoursRemaining: 0,
        vouchersUsed,
        vouchersRemaining,
        maxTrialVouchers: MAX_TRIAL_VOUCHERS,
        maxTrialDays: MAX_TRIAL_DAYS,
        isTrialExpired: true,
        clockTampered: false,
        machineMismatch: false,
        vaultTampered: false,
        lockReason: 'LICENSE_EXPIRED',
        trialStartDate,
        expiresAt,
        boundMachineId: signedHwid,
        currentMachineId,
        licenseType: signedPayload.plan || 'EXPIRED',
      };
    }

    const activatedMs = signedPayload.issuedAtMs || Date.parse(license.activatedAtIso || '');
    const daysElapsed = Number.isFinite(activatedMs)
      ? Math.max(0, Math.floor((clockIntegrity.effectiveNowMs - activatedMs) / 86400000))
      : 0;

    return {
      isLicensed: true,
      daysElapsed,
      daysRemaining: Math.max(1, daysRemaining),
      hoursRemaining,
      vouchersUsed,
      vouchersRemaining,
      maxTrialVouchers: MAX_TRIAL_VOUCHERS,
      maxTrialDays: MAX_TRIAL_DAYS,
      isTrialExpired: false,
      clockTampered: false,
      machineMismatch: false,
      vaultTampered: false,
      lockReason: 'NONE',
      trialStartDate,
      expiresAt,
      boundMachineId: signedHwid === 'ANY_HARDWARE_ID' ? currentMachineId : signedHwid,
      currentMachineId,
      licenseType: signedPayload.plan,
    };
  }

  const diffTime = Math.max(0, clockIntegrity.effectiveNowMs - trialStartDate.getTime());
  const daysElapsed = Math.floor(diffTime / 86400000);
  const daysRemaining = Math.max(0, MAX_TRIAL_DAYS - daysElapsed);
  const hoursRemaining = Math.max(0, Math.ceil((MAX_TRIAL_DAYS * 86400000 - diffTime) / 3600000));
  const daysExceeded = daysElapsed >= MAX_TRIAL_DAYS;
  const vouchersExceeded = usageData ? vouchersUsed >= MAX_TRIAL_VOUCHERS : false;
  const isTrialExpired = daysExceeded || vouchersExceeded;

  return {
    isLicensed: false,
    daysElapsed,
    daysRemaining,
    hoursRemaining,
    vouchersUsed,
    vouchersRemaining,
    maxTrialVouchers: MAX_TRIAL_VOUCHERS,
    maxTrialDays: MAX_TRIAL_DAYS,
    isTrialExpired,
    clockTampered: false,
    machineMismatch: false,
    vaultTampered: false,
    lockReason: vouchersExceeded
      ? 'TRIAL_VOUCHERS_EXCEEDED'
      : daysExceeded
        ? 'TRIAL_DAYS_EXPIRED'
        : 'NONE',
    trialStartDate,
    expiresAt: new Date(trialStartDate.getTime() + MAX_TRIAL_DAYS * 86400000),
    boundMachineId: license.machineId || currentMachineId,
    currentMachineId,
    licenseType: 'TRIAL',
  };
}

// Validate signed Ed25519 certificate strictly against Hardware ID, Revocation Registry & Monotonic Clock
export function validateLicenseKey(
  inputKey: string,
  _registeredOwner: string,
  machineId: string,
  issuedLicenses?: IssuedLicenseRecord[],
  nowMs: number = Date.now(),
  options?: { publicKeyB64?: string }
): {
  isValid: boolean;
  message: string;
  licenseType?: 'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL' | 'ENTERPRISE';
  validityDays?: number;
  expiryDate?: string;
  expiresAtIso?: string;
  signedPayload?: SignedLicensePayloadV3;
} {
  const trimmedKey = (inputKey || '').trim();
  const normalizedMachineId = (machineId || getOrGenerateMachineId()).trim().toUpperCase();

  if (!trimmedKey) {
    return { isValid: false, message: 'Please enter a valid Ed25519-signed HV-LIC-V3 license certificate.' };
  }

  const clockIntegrity = checkAndAdvanceClockWatermark(undefined, nowMs);
  if (clockIntegrity.clockTampered) {
    return {
      isValid: false,
      message: 'System clock rollback detected! Restore your computer date/time to activate a license.',
    };
  }

  const verified = parseAndVerifySignedLicense(
    trimmedKey,
    normalizedMachineId,
    clockIntegrity.effectiveNowMs,
    { publicKeyB64: options?.publicKeyB64 }
  );

  if (!verified.isValid || !verified.payload) {
    return {
      isValid: false,
      message: verified.error || 'License certificate Ed25519 verification failed.',
    };
  }

  const payload = verified.payload;

  // Check revocation / status in Admin Issued Licenses Registry if present
  if (issuedLicenses && issuedLicenses.length > 0) {
    const matched = issuedLicenses.find(
      (r) => r.id === payload.licenseId || r.licenseKey.trim() === trimmedKey
    );
    if (matched?.status === 'REVOKED') {
      return {
        isValid: false,
        message: `License Certificate for ${payload.clientName} has been REVOKED by administrator.`,
      };
    }
    if (matched?.status === 'EXPIRED') {
      return {
        isValid: false,
        message: `License Certificate for ${payload.clientName} has EXPIRED.`,
      };
    }
  }

  const totalDays = Math.max(
    1,
    Math.round((payload.expiresAtMs - payload.issuedAtMs) / 86400000)
  );
  const expiresAtIso = new Date(payload.expiresAtMs).toISOString();

  return {
    isValid: true,
    message: `Ed25519 Signed License Verified for ${payload.clientName} (${payload.plan})!`,
    licenseType: payload.plan,
    validityDays: payload.plan === 'PRO_PERPETUAL' ? 9999 : totalDays,
    expiryDate: expiresAtIso.split('T')[0],
    expiresAtIso,
    signedPayload: payload,
  };
}

export interface ActivateLicenseParams {
  inputKey: string;
  registeredOwner: string;
  currentMachineId: string;
  ownerPin?: string;
  licenseMode?: 'SINGLE_USER' | 'MULTI_USER';
  maxSeats?: number;
  existingLicense?: LicenseInfo;
  issuedLicenses?: IssuedLicenseRecord[];
  nowMs?: number;
  publicKeyB64?: string;
}

export interface ActivateLicenseResult {
  success: boolean;
  message: string;
  license?: LicenseInfo;
}

export function activateLicenseOnMachine(params: ActivateLicenseParams): ActivateLicenseResult {
  const nowMs = params.nowMs ?? Date.now();
  const normalizedMachineId = (params.currentMachineId || getOrGenerateMachineId()).trim().toUpperCase();
  const validation = validateLicenseKey(
    params.inputKey,
    params.registeredOwner,
    normalizedMachineId,
    params.issuedLicenses,
    nowMs,
    { publicKeyB64: params.publicKeyB64 }
  );

  if (!validation.isValid || !validation.signedPayload) {
    return {
      success: false,
      message: validation.message,
    };
  }

  const payload = validation.signedPayload;
  const activatedAtIso = new Date(payload.issuedAtMs || nowMs).toISOString();
  const expiresAtIso = validation.expiresAtIso || new Date(payload.expiresAtMs).toISOString();
  const expiryDate = expiresAtIso.split('T')[0];

  const license: LicenseInfo = {
    trialStartDate: params.existingLicense?.trialStartDate || activatedAtIso,
    isLicensed: true,
    licenseKey: params.inputKey.trim(),
    registeredOwner: payload.clientName || params.registeredOwner.trim() || 'CLIENT',
    machineId: payload.hwid === 'ANY_HARDWARE_ID' ? normalizedMachineId : payload.hwid,
    ...(params.ownerPin?.trim() ? { ownerPin: params.ownerPin.trim() } : {}),
    activatedDate: activatedAtIso.split('T')[0],
    activatedAtIso,
    expiryDate,
    expiresAtIso,
    validityDays: validation.validityDays ?? 365,
    licenseType: payload.plan,
    licenseMode: payload.mode || params.licenseMode || 'SINGLE_USER',
    maxSeats: payload.maxSeats || (payload.mode === 'MULTI_USER' ? 5 : 1),
    issuedLicenses: params.issuedLicenses || params.existingLicense?.issuedLicenses,
    lastKnownTimestamp: new Date(nowMs).toISOString(),
    clockTamperDetected: false,
    vaultTampered: false,
  };

  // Seal immediately into hardware-bound localStorage envelope
  sealLicenseCacheEnvelope(
    {
      maxObservedTimeMs: Math.max(nowMs, getLastVerifiedServerTimeMs()),
      lastVerifiedServerTimeMs: getLastVerifiedServerTimeMs(),
      trialStartDate: license.trialStartDate,
      license,
    },
    normalizedMachineId
  );

  return {
    success: true,
    message: validation.message,
    license,
  };
}

// Cryptographic SHA-256 data integrity token
export function computeDataIntegrityHash(data: AppData): string {
  const jsonStr = JSON.stringify({
    co: data.company.name,
    invoicesCount: data.invoices?.length || 0,
    vouchersCount: data.vouchers?.length || 0,
  });
  return `SHA256-HV-${sha256HexSync(jsonStr).slice(0, 16)}`;
}
