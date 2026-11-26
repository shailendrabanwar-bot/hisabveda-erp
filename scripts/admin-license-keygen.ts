#!/usr/bin/env node
/**
 * HisabVeda ERP — Offline / Server-Side Ed25519 License Keygen & Certificate CLI
 *
 * SECURITY MODEL:
 *  - Private key is NEVER bundled in the client or Electron `.asar` archive.
 *  - Only the 32-byte Ed25519 Public Key is compiled into `src/utils/license.ts` & `electron/main.js`.
 *  - Usage:
 *      npx tsx scripts/admin-license-keygen.ts keygen
 *      LICENSE_PRIVATE_KEY="<b64>" npx tsx scripts/admin-license-keygen.ts issue --owner "Sharma Traders" --hwid "HV-HWID-..." --plan PRO_PERPETUAL --days 9999
 *      npx tsx scripts/admin-license-keygen.ts verify --cert "HV-LIC-V3...." --hwid "HV-HWID-..."
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import nacl from 'tweetnacl';

export const DEFAULT_PUBLIC_KEY_B64 = 'Z8Ht8Q8s/qmsxfm4KLeB+y/wh8Y0sWj+OAljax0FzlY=';

export type PlanType = 'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL' | 'ENTERPRISE';
export type LicenseMode = 'SINGLE_USER' | 'MULTI_USER';

export interface SignedLicensePayloadV3 {
  v: 3;
  app: 'HISABVEDA_ERP';
  licenseId: string;
  clientName: string;
  gstinOrReg: string;
  hwid: string;
  plan: PlanType;
  mode: LicenseMode;
  maxSeats: number;
  issuedAtMs: number;
  expiresAtMs: number;
  serverTimeMs: number;
  nonce: string;
}

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(b64u: string): Uint8Array {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

export function parsePrivateKeyInput(rawInput: string): nacl.SignKeyPair {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Missing private key. Provide --key, --key-file, or LICENSE_PRIVATE_KEY env var.');
  }

  // PKCS8 PEM support (Node crypto Ed25519)
  if (trimmed.includes('BEGIN PRIVATE KEY')) {
    const keyObj = crypto.createPrivateKey(trimmed);
    const jwk = keyObj.export({ format: 'jwk' }) as { d?: string };
    if (!jwk.d) throw new Error('Invalid PKCS8 Ed25519 private key.');
    const seed = fromBase64Url(jwk.d);
    return nacl.sign.keyPair.fromSeed(seed);
  }

  // Hex 64 (32-byte seed) or 128 (64-byte secretKey)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return nacl.sign.keyPair.fromSeed(new Uint8Array(Buffer.from(trimmed, 'hex')));
  }
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    return nacl.sign.keyPair.fromSecretKey(new Uint8Array(Buffer.from(trimmed, 'hex')));
  }

  // Base64 / Base64Url 32-byte seed or 64-byte secretKey
  const bytes = fromBase64Url(trimmed);
  if (bytes.length === 32) {
    return nacl.sign.keyPair.fromSeed(bytes);
  }
  if (bytes.length === 64) {
    return nacl.sign.keyPair.fromSecretKey(bytes);
  }
  throw new Error(`Unsupported private key length (${bytes.length} bytes). Expected 32-byte seed or 64-byte Ed25519 secret key.`);
}

export function issueSignedLicenseV3(
  keyPair: nacl.SignKeyPair,
  params: {
    clientName: string;
    gstinOrReg?: string;
    hwid: string;
    plan?: PlanType;
    mode?: LicenseMode;
    maxSeats?: number;
    validityDays?: number;
    nowMs?: number;
  }
): { certificate: string; payload: SignedLicensePayloadV3; publicKeyB64: string } {
  const nowMs = params.nowMs ?? Date.now();
  const plan: PlanType = params.plan || 'PRO_PERPETUAL';
  const mode: LicenseMode = params.mode || 'SINGLE_USER';
  const hwid = params.hwid.trim().toUpperCase();
  if (!hwid) throw new Error('Target Hardware Machine ID (--hwid) is required.');
  const clientName = params.clientName.trim();
  if (!clientName) throw new Error('Client / Company name (--owner) is required.');

  const defaultDays = plan === 'TRIAL' ? 7 : plan === 'STANDARD_ANNUAL' ? 365 : 9999;
  const validityDays = Math.max(1, Number(params.validityDays || defaultDays));
  const expiresAtMs =
    validityDays >= 9999
      ? Date.UTC(2099, 11, 31, 23, 59, 59, 999)
      : nowMs + validityDays * 86400000;

  const payload: SignedLicensePayloadV3 = {
    v: 3,
    app: 'HISABVEDA_ERP',
    licenseId: `lic_${crypto.randomBytes(8).toString('hex')}`,
    clientName,
    gstinOrReg: (params.gstinOrReg || 'UNREGISTERED').trim().toUpperCase(),
    hwid,
    plan,
    mode,
    maxSeats: mode === 'SINGLE_USER' ? 1 : Math.max(2, Number(params.maxSeats || 5)),
    issuedAtMs: nowMs,
    expiresAtMs,
    serverTimeMs: nowMs,
    nonce: crypto.randomBytes(12).toString('hex'),
  };

  const payloadB64Url = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `HV-LIC-V3.${payloadB64Url}`;
  const sigBytes = nacl.sign.detached(new TextEncoder().encode(unsignedToken), keyPair.secretKey);
  const certificate = `${unsignedToken}.${toBase64Url(sigBytes)}`;

  return {
    certificate,
    payload,
    publicKeyB64: Buffer.from(keyPair.publicKey).toString('base64'),
  };
}

export function verifySignedLicenseV3(
  certificate: string,
  publicKeyB64: string = DEFAULT_PUBLIC_KEY_B64,
  expectedHwid?: string,
  nowMs: number = Date.now()
): { valid: boolean; reason?: string; payload?: SignedLicensePayloadV3 } {
  const parts = certificate.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'HV-LIC-V3') {
    return { valid: false, reason: 'Invalid certificate format (expected HV-LIC-V3.<payload>.<sig>).' };
  }
  try {
    const unsignedToken = `${parts[0]}.${parts[1]}`;
    const sigBytes = fromBase64Url(parts[2]);
    const pubBytes = fromBase64Url(publicKeyB64);
    if (sigBytes.length !== nacl.sign.signatureLength || pubBytes.length !== nacl.sign.publicKeyLength) {
      return { valid: false, reason: 'Malformed Ed25519 signature or public key length.' };
    }
    const ok = nacl.sign.detached.verify(
      new TextEncoder().encode(unsignedToken),
      sigBytes,
      pubBytes
    );
    if (!ok) {
      return { valid: false, reason: 'Ed25519 signature verification failed (forged or tampered).' };
    }

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) as SignedLicensePayloadV3;
    if (payload.app !== 'HISABVEDA_ERP' || payload.v !== 3) {
      return { valid: false, reason: 'Unsupported license application payload.' };
    }
    if (expectedHwid) {
      const target = expectedHwid.trim().toUpperCase();
      if (payload.hwid !== 'ANY_HARDWARE_ID' && payload.hwid !== target) {
        return {
          valid: false,
          reason: `Hardware ID mismatch: bound to ${payload.hwid}, current PC is ${target}.`,
          payload,
        };
      }
    }
    if (Number(payload.expiresAtMs || 0) < nowMs) {
      return { valid: false, reason: 'Signed license certificate has expired.', payload };
    }
    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, reason: err?.message || 'Certificate decode error.' };
  }
}

function parseArgs(argv: string[]): { cmd: string; flags: Record<string, string> } {
  const [cmd = 'help', ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const val = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : 'true';
      flags[key] = val;
    }
  }
  return { cmd, flags };
}

function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));

  if (cmd === 'keygen') {
    const seed = crypto.randomBytes(32);
    const kp = nacl.sign.keyPair.fromSeed(seed);
    const seedB64 = Buffer.from(seed).toString('base64');
    const pubB64 = Buffer.from(kp.publicKey).toString('base64');

    console.log('\n=== HisabVeda ERP Ed25519 Keypair Generated ===');
    console.log(`LICENSE_PRIVATE_KEY="${seedB64}"   (KEEP SECRET — Server / Offline Only)`);
    console.log(`VITE_LICENSE_PUBLIC_KEY="${pubB64}"  (Safe to embed in client & Electron)\n`);
    return;
  }

  if (cmd === 'issue') {
    let rawKey = flags['key'] || process.env.LICENSE_PRIVATE_KEY || '';
    if (!rawKey && flags['key-file']) {
      rawKey = fs.readFileSync(flags['key-file'], 'utf8');
    }
    const kp = parsePrivateKeyInput(rawKey);
    const result = issueSignedLicenseV3(kp, {
      clientName: flags['owner'] || flags['client'] || '',
      gstinOrReg: flags['gstin'],
      hwid: flags['hwid'] || '',
      plan: (flags['plan'] as PlanType) || 'PRO_PERPETUAL',
      mode: (flags['mode'] as LicenseMode) || 'SINGLE_USER',
      maxSeats: flags['seats'] ? Number(flags['seats']) : undefined,
      validityDays: flags['days'] ? Number(flags['days']) : undefined,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === 'verify') {
    const cert = flags['cert'] || '';
    const pub = flags['pub'] || process.env.VITE_LICENSE_PUBLIC_KEY || DEFAULT_PUBLIC_KEY_B64;
    const hwid = flags['hwid'];
    const result = verifySignedLicenseV3(cert, pub, hwid);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
    return;
  }

  console.log(`HisabVeda ERP Admin License CLI
Commands:
  keygen
  issue --owner "<Company>" --hwid "<HV-HWID-...>" [--plan PRO_PERPETUAL|STANDARD_ANNUAL|TRIAL|ENTERPRISE] [--mode SINGLE_USER|MULTI_USER] [--seats 1] [--days 365] [--key "<B64>" | --key-file path]
  verify --cert "<HV-LIC-V3...>" [--hwid "<HV-HWID-...>"] [--pub "<B64>"]`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('admin-license-keygen.ts')) {
  main();
}
