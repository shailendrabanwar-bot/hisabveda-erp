import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import nacl from 'tweetnacl';
import {
  DEFAULT_VENDOR_ED25519_PUBLIC_KEY_B64,
  LICENSE_ENVELOPE_STORAGE_KEY,
  CONSUMED_ACTIVATIONS_STORAGE_KEY,
  CLOCK_WATERMARK_STORAGE_KEY,
  parseAndVerifySignedLicense,
  parseAndVerifyEncryptedLicenseString,
  validateLicenseKey,
  activateLicenseOnMachine,
  deriveActivationCode,
  readConsumedActivationsRegistry,
  getTrialStatus,
  getOrGenerateMachineId,
  sealLicenseCacheEnvelope,
  readSealedLicenseCacheEnvelope,
  MAX_TRIAL_DAYS,
  MAX_TRIAL_VOUCHERS,
} from './license.ts';
import {
  issueSignedLicenseV3,
  verifySignedLicenseV3,
  deriveActivationCode as keygenDeriveActivationCode,
} from '../../scripts/admin-license-keygen.ts';

function createTestKeyPair() {
  const kp = nacl.sign.keyPair();
  const publicKeyB64 = Buffer.from(kp.publicKey).toString('base64');
  return { kp, publicKeyB64 };
}

function withMockLocalStorage(fn: (store: Map<string, string>) => void) {
  const prev = (globalThis as any).localStorage;
  const map = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
  try {
    fn(map);
  } finally {
    if (prev === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = prev;
  }
}

test('Ed25519 asymmetric verification rejects forged, legacy symmetric, and bypass keys', () => {
  const { kp, publicKeyB64 } = createTestKeyPair();
  const { publicKeyB64: wrongPubB64 } = createTestKeyPair();
  const machineA = 'HV-HWID-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  const machineB = 'HV-HWID-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
  const owner = 'Sharma Traders';
  const nowMs = Date.UTC(2026, 5, 1, 10, 0, 0);

  // Legacy symmetric, wildcard, and hardcoded master bypass keys must ALL fail
  for (const legacyOrFakeKey of [
    'HV-KEY-2026-PAID',
    'HV-MASTER-2026-OWNER',
    'HV-FAKE-CRACK-9999',
    'HV-2026-PRO-9842-8871',
    'HV-LIC-V2.eyJjb21wYW55IjoiVEVTVElORyJ9.DEADBEEF',
    'SNA-LIC-V2.eyJjb21wYW55IjoiVEVTVElORyJ9.DEADBEEF',
  ]) {
    const res = validateLicenseKey(legacyOrFakeKey, owner, machineA, undefined, nowMs, { publicKeyB64 });
    assert.equal(res.isValid, false, `Expected ${legacyOrFakeKey} to be rejected`);
  }

  // Genuine Ed25519 HV-LIC-V3 cert issued for machineA succeeds on machineA
  const issued = issueSignedLicenseV3(kp, {
    clientName: owner,
    hwid: machineA,
    plan: 'PRO_PERPETUAL',
    mode: 'SINGLE_USER',
    nowMs,
  });
  assert.ok(issued.certificate.startsWith('HV-LIC-V3.'));
  assert.equal(issued.publicKeyB64, publicKeyB64);

  const validOnA = validateLicenseKey(issued.certificate, owner, machineA, undefined, nowMs, { publicKeyB64 });
  assert.equal(validOnA.isValid, true);
  assert.equal(validOnA.licenseType, 'PRO_PERPETUAL');

  // Cross-verify CLI verifySignedLicenseV3 helper
  const cliVerifyA = verifySignedLicenseV3(issued.certificate, publicKeyB64, machineA, nowMs);
  assert.equal(cliVerifyA.valid, true);

  // Fails when verified against wrong public key
  const wrongKeyVerify = validateLicenseKey(issued.certificate, owner, machineA, undefined, nowMs, {
    publicKeyB64: wrongPubB64,
  });
  assert.equal(wrongKeyVerify.isValid, false);

  // Fails when used on a different Machine ID
  const resOnB = validateLicenseKey(issued.certificate, owner, machineB, undefined, nowMs, { publicKeyB64 });
  assert.equal(resOnB.isValid, false);
  assert.ok(resOnB.message.includes('Machine ID mismatch'));
});

test('Rejects payload tampering on HV-LIC-V3 Ed25519 certificates', () => {
  const { kp, publicKeyB64 } = createTestKeyPair();
  const machineA = 'HV-HWID-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
  const nowMs = Date.UTC(2026, 5, 10, 12, 0, 0);

  const issued = issueSignedLicenseV3(kp, {
    clientName: 'Apex Enterprises',
    gstinOrReg: '27AABCA1234F1Z5',
    hwid: machineA,
    plan: 'STANDARD_ANNUAL',
    validityDays: 365,
    nowMs,
  });

  // Tamper expiresAtMs / hwid in the Base64Url payload while keeping original signature
  const parts = issued.certificate.split('.');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const decoded = JSON.parse(Buffer.from(b64 + '='.repeat((4 - (b64.length % 4)) % 4), 'base64').toString('utf8'));
  decoded.expiresAtMs = Date.UTC(2099, 11, 31);
  decoded.hwid = 'ANY_HARDWARE_ID';
  const tamperedPayloadB64Url = Buffer.from(JSON.stringify(decoded), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const tamperedCert = `${parts[0]}.${tamperedPayloadB64Url}.${parts[2]}`;

  const parsedTampered = parseAndVerifySignedLicense(tamperedCert, machineA, nowMs, { publicKeyB64 });
  assert.equal(parsedTampered.isValid, false);
  assert.equal(parsedTampered.reason, 'INVALID_SIGNATURE');

  const legacyAlias = parseAndVerifyEncryptedLicenseString(tamperedCert, machineA, nowMs, publicKeyB64);
  assert.equal(legacyAlias.isValid, false);
});

test('Enforces Issued Registry REVOKED status and hardware binding', () => {
  const { kp, publicKeyB64 } = createTestKeyPair();
  const machineA = 'HV-HWID-EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
  const nowMs = Date.UTC(2026, 5, 15, 8, 0, 0);

  const issued = issueSignedLicenseV3(kp, {
    clientName: 'Verma Agencies',
    hwid: machineA,
    plan: 'PRO_PERPETUAL',
    nowMs,
  });

  const activeIssued = [
    {
      id: issued.payload.licenseId,
      clientName: 'Verma Agencies',
      licenseKey: issued.certificate,
      licenseMode: 'SINGLE_USER' as const,
      maxSeats: 1,
      issuedDate: '2026-06-15',
      status: 'ACTIVE' as const,
      machineId: machineA,
    },
  ];

  assert.equal(
    validateLicenseKey(issued.certificate, 'Verma Agencies', machineA, activeIssued, nowMs, { publicKeyB64 }).isValid,
    true
  );

  const revokedIssued = [{ ...activeIssued[0], status: 'REVOKED' as const }];
  const revokedRes = validateLicenseKey(issued.certificate, 'Verma Agencies', machineA, revokedIssued, nowMs, {
    publicKeyB64,
  });
  assert.equal(revokedRes.isValid, false);
  assert.ok(revokedRes.message.includes('REVOKED'));

  // Even inside getTrialStatus, a revoked cert in issuedLicenses locks the app on the current machine
  const currentMachine = getOrGenerateMachineId();
  const issuedForCurrent = issueSignedLicenseV3(kp, {
    clientName: 'Verma Agencies',
    hwid: currentMachine,
    plan: 'PRO_PERPETUAL',
    nowMs,
  });
  const statusRevoked = getTrialStatus(
    {
      trialStartDate: new Date(nowMs).toISOString(),
      isLicensed: true,
      licenseKey: issuedForCurrent.certificate,
      machineId: currentMachine,
      issuedLicenses: [
        {
          id: issuedForCurrent.payload.licenseId,
          clientName: 'Verma Agencies',
          licenseKey: issuedForCurrent.certificate,
          licenseMode: 'SINGLE_USER',
          maxSeats: 1,
          issuedDate: '2026-06-15',
          status: 'REVOKED',
          machineId: currentMachine,
        },
      ],
    },
    { vouchers: [], invoices: [], purchaseInvoices: [] },
    nowMs,
    { publicKeyB64 }
  );
  assert.equal(statusRevoked.isLicensed, false);
  assert.equal(statusRevoked.lockReason, 'LICENSE_REVOKED');
});

test('Detects forged isLicensed:true state in getTrialStatus and triggers VAULT_TAMPERED lock', () => {
  withMockLocalStorage(() => {
    const machineId = getOrGenerateMachineId();
    const nowMs = Date.UTC(2026, 6, 10, 12, 0, 0);

    // Attacker sets isLicensed: true in storage JSON without a real Ed25519 signature
    const forgedStateStatus = getTrialStatus(
      {
        trialStartDate: new Date(nowMs).toISOString(),
        isLicensed: true,
        licenseKey: 'HV-FAKE-KEY-BYPASS',
        machineId,
      },
      { vouchers: [], invoices: [], purchaseInvoices: [] },
      nowMs
    );
    assert.equal(forgedStateStatus.isLicensed, false);
    assert.equal(forgedStateStatus.vaultTampered, true);
    assert.equal(forgedStateStatus.lockReason, 'VAULT_TAMPERED');
  });
});

test('Sealed localStorage license envelope rejects JSON/HMAC tampering', () => {
  withMockLocalStorage((store) => {
    const machineId = getOrGenerateMachineId();
    const nowMs = Date.UTC(2026, 6, 10, 12, 0, 0);

    sealLicenseCacheEnvelope(
      {
        maxObservedTimeMs: nowMs,
        lastVerifiedServerTimeMs: nowMs,
        trialStartDate: new Date(nowMs).toISOString(),
        license: null,
      },
      machineId
    );

    const validEnv = readSealedLicenseCacheEnvelope(machineId);
    assert.equal(validEnv.exists, true);
    assert.equal(validEnv.tampered, false);

    // Tamper payload in localStorage directly (e.g. extending trialStartDate)
    const raw = JSON.parse(store.get(LICENSE_ENVELOPE_STORAGE_KEY)!);
    raw.payload.trialStartDate = '2099-01-01T00:00:00.000Z';
    store.set(LICENSE_ENVELOPE_STORAGE_KEY, JSON.stringify(raw));

    const tamperedEnv = readSealedLicenseCacheEnvelope(machineId);
    assert.equal(tamperedEnv.exists, true);
    assert.equal(tamperedEnv.tampered, true);

    const lockedStatus = getTrialStatus(undefined, { vouchers: [], invoices: [], purchaseInvoices: [] }, nowMs);
    assert.equal(lockedStatus.vaultTampered, true);
    assert.equal(lockedStatus.lockReason, 'VAULT_TAMPERED');
  });
});

test('Detects system-clock rollback tampering and locks trial/timed licenses immediately', () => {
  withMockLocalStorage((store) => {
    const startMs = Date.UTC(2026, 4, 10, 10, 0, 0);
    const day12Ms = startMs + 12 * 24 * 60 * 60 * 1000;
    const rolledBackDay2Ms = startMs + 2 * 24 * 60 * 60 * 1000;

    const license = {
      trialStartDate: new Date(startMs).toISOString(),
      lastKnownTimestamp: new Date(day12Ms).toISOString(),
      isLicensed: false,
      machineId: getOrGenerateMachineId(),
    };

    const normalDay12 = getTrialStatus(license, { vouchers: [], invoices: [], purchaseInvoices: [] }, day12Ms);
    assert.equal(normalDay12.isTrialExpired, true);
    assert.equal(normalDay12.clockTampered, false);

    // User rolls clock backwards -> anti-tamper lock triggers!
    const tampered = getTrialStatus(license, { vouchers: [], invoices: [], purchaseInvoices: [] }, rolledBackDay2Ms);
    assert.equal(tampered.clockTampered, true);
    assert.equal(tampered.isTrialExpired, true);
    assert.equal(tampered.isLicensed, false);
    assert.equal(tampered.lockReason, 'CLOCK_TAMPERED');
    assert.equal(store.get(CLOCK_WATERMARK_STORAGE_KEY), String(day12Ms));
  });
});

test('Enforces 7-day AND 50-voucher limits in Trial mode and Machine Mismatch check on copied DB', () => {
  withMockLocalStorage(() => {
    const { kp, publicKeyB64 } = createTestKeyPair();
    const startMs = Date.UTC(2026, 4, 1, 9, 0, 0);
    const currentMachine = getOrGenerateMachineId();

    const trialLic = {
      trialStartDate: new Date(startMs).toISOString(),
      lastKnownTimestamp: new Date(startMs).toISOString(),
      isLicensed: false,
      machineId: currentMachine,
    };

    const makeItems = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `x_${i}` })) as any[];
    const activeStatus = getTrialStatus(
      trialLic,
      { vouchers: makeItems(5), invoices: makeItems(3), purchaseInvoices: makeItems(2) },
      startMs + 2 * 86400000
    );
    assert.equal(activeStatus.isTrialExpired, false);
    assert.equal(activeStatus.daysRemaining, MAX_TRIAL_DAYS - 2);
    assert.equal(activeStatus.vouchersUsed, 10);
    assert.equal(activeStatus.vouchersRemaining, MAX_TRIAL_VOUCHERS - 10);

    const voucherCapStatus = getTrialStatus(
      trialLic,
      { vouchers: makeItems(30), invoices: makeItems(15), purchaseInvoices: makeItems(5) },
      startMs + 2 * 86400000
    );
    assert.equal(voucherCapStatus.isTrialExpired, true);
    assert.equal(voucherCapStatus.lockReason, 'TRIAL_VOUCHERS_EXCEEDED');

    // Genuine Ed25519 cert issued for ANOTHER PC fails cleanly with MACHINE_MISMATCH
    const otherMachine = 'HV-HWID-9999999999999999999999999999999999999999999999999999999999999999';
    const otherPcCert = issueSignedLicenseV3(kp, {
      clientName: 'Copied Shop',
      hwid: otherMachine,
      plan: 'PRO_PERPETUAL',
      nowMs: startMs,
    });
    const copiedStatus = getTrialStatus(
      {
        trialStartDate: new Date(startMs).toISOString(),
        isLicensed: true,
        licenseKey: otherPcCert.certificate,
        machineId: otherMachine,
        licenseMode: 'SINGLE_USER',
      },
      { vouchers: [], invoices: [], purchaseInvoices: [] },
      startMs + 2 * 86400000,
      { publicKeyB64 }
    );
    assert.equal(copiedStatus.machineMismatch, true);
    assert.equal(copiedStatus.isLicensed, false);
    assert.equal(copiedStatus.lockReason, 'MACHINE_MISMATCH');
  });
});

test('activateLicenseOnMachine binds strictly to current Machine ID and starts signed 365-day countdown', () => {
  withMockLocalStorage(() => {
    const { kp, publicKeyB64 } = createTestKeyPair();
    const currentMachine = getOrGenerateMachineId();
    const activationNowMs = Date.UTC(2026, 6, 1, 10, 0, 0);

    const annualCert = issueSignedLicenseV3(kp, {
      clientName: 'Patel Pharma',
      hwid: currentMachine,
      plan: 'STANDARD_ANNUAL',
      validityDays: 365,
      nowMs: activationNowMs,
    });
    assert.match(annualCert.activationCode, /^ACT-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
    assert.equal(annualCert.activationCode, deriveActivationCode(annualCert.certificate, currentMachine));
    assert.equal(annualCert.activationCode, keygenDeriveActivationCode(annualCert.certificate));

    const res = activateLicenseOnMachine({
      inputKey: annualCert.certificate,
      activationCode: annualCert.activationCode,
      registeredOwner: 'Patel Pharma',
      currentMachineId: currentMachine,
      nowMs: activationNowMs,
      publicKeyB64,
    });

    assert.equal(res.success, true);
    assert.ok(res.license);
    assert.equal(res.license.machineId, currentMachine);
    assert.equal(res.license.licenseType, 'STANDARD_ANNUAL');
    assert.equal(res.license.validityDays, 365);
    assert.equal(res.license.licenseSerial, annualCert.payload.licenseId);

    const statusDay100 = getTrialStatus(
      res.license,
      { vouchers: [], invoices: [], purchaseInvoices: [] },
      activationNowMs + 100 * 86400000,
      { publicKeyB64 }
    );
    assert.equal(statusDay100.isLicensed, true);
    assert.equal(statusDay100.daysElapsed, 100);
    assert.equal(statusDay100.daysRemaining, 265);

    // Attempting to extend license.expiryDate locally cannot bypass signed payload.expiresAtMs!
    const spoofedExpiryLicense = {
      ...res.license,
      expiryDate: '2099-12-31',
      expiresAtIso: '2099-12-31T23:59:59.000Z',
    };
    const statusExpired = getTrialStatus(
      spoofedExpiryLicense,
      { vouchers: [], invoices: [], purchaseInvoices: [] },
      activationNowMs + 366 * 86400000,
      { publicKeyB64 }
    );
    assert.equal(statusExpired.isLicensed, false);
    assert.equal(statusExpired.lockReason, 'LICENSE_EXPIRED');
    assert.equal(statusExpired.daysRemaining, 0);
  });
});

test('Security hardening: client bundle, Electron main/preload, and packaging contain zero private keys or hardcoded secrets', () => {
  const root = process.cwd();
  const licenseTs = fs.readFileSync(path.join(root, 'src/utils/license.ts'), 'utf8');
  const mainJs = fs.readFileSync(path.join(root, 'electron/main.js'), 'utf8');
  const preloadJs = fs.readFileSync(path.join(root, 'electron/preload.js'), 'utf8');
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const electronPkg = JSON.parse(fs.readFileSync(path.join(root, 'electron/package.json'), 'utf8'));
  const buildBat = fs.readFileSync(path.join(root, 'scripts/build-windows-exe.bat'), 'utf8');

  // Client license.ts MUST NOT contain symmetric salts, private key signing, or hardcoded demo bypass keys
  assert.equal(/SNA_SECRET_SALT/.test(licenseTs), false);
  assert.equal(/HV-KEY-2026-PAID/.test(licenseTs), false);
  assert.equal(/generateVendorLicenseKey/.test(licenseTs), false);
  assert.ok(licenseTs.includes(DEFAULT_VENDOR_ED25519_PUBLIC_KEY_B64));
  assert.ok(licenseTs.includes('nacl.sign.detached.verify'));

  // Electron main.js & preload.js hardening assertions
  assert.equal(electronPkg.type, 'commonjs');
  assert.equal(/VAULT_ENCRYPTION_SECRET/.test(mainJs), false);
  assert.equal(/HWID-HV-2026-DESKTOP-0001/.test(mainJs), false);
  assert.ok(mainJs.includes("app.getPath('userData')"));
  assert.ok(mainJs.includes('scryptSync'));
  assert.ok(mainJs.includes('aes-256-gcm'));
  assert.ok(mainJs.includes('readPrimaryDiskSerial'));
  assert.ok(mainJs.includes('readCpuProcessorId'));
  assert.ok(mainJs.includes('readSystemBoardUuid'));
  assert.ok(mainJs.includes('sandbox: true'));
  assert.ok(mainJs.includes('devTools: false'));
  assert.ok(mainJs.includes('nacl.sign.detached.verify'));
  assert.ok(preloadJs.includes('Object.freeze'));
  assert.ok(preloadJs.includes('hisabvedaDesktop'));

  // Packaging ASAR + obfuscation + exclusion of keygen script, server mailer & source files
  assert.equal(pkgJson.build.asar, true);
  assert.ok(Array.isArray(pkgJson.build.files));
  assert.ok(pkgJson.build.files.includes('dist/**/*'));
  assert.ok(pkgJson.build.files.includes('!server/**/*'));
  assert.ok(pkgJson.build.files.some((f: string) => f.includes('!scripts/admin-license-keygen') || f === '!scripts/**/*'));
  assert.ok(buildBat.includes('obfuscate-build.mjs'));
  assert.ok(fs.existsSync(path.join(root, 'public/hv-icon.ico')));

  // Auto-license mailer reads signing key from env, never embeds it in client, and enforces persistence in main.js + storage.ts
  const mailerJs = fs.readFileSync(path.join(root, 'server/auto-license-mailer.js'), 'utf8');
  const storageTs = fs.readFileSync(path.join(root, 'src/utils/storage.ts'), 'utf8');
  assert.ok(mailerJs.includes('process.env.PRIVATE_KEY'));
  assert.ok(mailerJs.includes('escapeHtml'));
  assert.ok(mailerJs.includes('isRateLimited'));
  assert.equal(/HV-LIC-V3\./.test(mailerJs), true);
  assert.ok(mainJs.includes('authoritativeLicense'));
  assert.ok(mainJs.includes('syncLicenseToVault'));
  assert.ok(mainJs.includes("ipcMain.on('hv:flush-sync'"));
  assert.ok(storageTs.includes('resolveAuthoritativeLicense'));
});

test('Auto-license mailer rejects invalid HTTP method, validates fields, and signs compatible HV-LIC-V3 certificates', async () => {
  const { handleLicenseRequest, signLicenseCertificate } = await import('../../server/auto-license-mailer.js');
  const makeRes = () => {
    const out: { statusCode: number; headers: Record<string, string>; body: any; ended: boolean } = {
      statusCode: 200,
      headers: {},
      body: null,
      ended: false,
    };
    const resObj: any = {
      set statusCode(code: number) {
        out.statusCode = code;
      },
      get statusCode() {
        return out.statusCode;
      },
      setHeader: (k: string, v: string) => {
        out.headers[k] = v;
      },
      status: (code: number) => {
        out.statusCode = code;
        return {
          json: (payload: any) => {
            out.body = payload;
            out.ended = true;
          },
        };
      },
      end: (raw?: string) => {
        out.ended = true;
        if (raw) out.body = JSON.parse(raw);
      },
    };
    return { out, res: resObj };
  };

  const getMock = makeRes();
  await handleLicenseRequest({ method: 'GET', headers: {} } as any, getMock.res as any);
  assert.equal(getMock.out.statusCode, 405);

  const badHwidMock = makeRes();
  await handleLicenseRequest(
    {
      method: 'POST',
      headers: { 'x-forwarded-for': '127.0.0.99' },
      body: {
        fullName: 'Test Traders',
        email: 'owner@example.com',
        mobile: '+91 9876543210',
        plan: 'STANDARD_ANNUAL',
        machineId: 'INVALID-ID',
      },
    } as any,
    badHwidMock.res as any
  );
  assert.equal(badHwidMock.out.statusCode, 400);
  assert.match(String(badHwidMock.out.body?.error || ''), /Machine ID/i);

  // Verify signLicenseCertificate produces a valid HV-LIC-V3 token accepted by client verifier
  const { kp, publicKeyB64 } = createTestKeyPair();
  const prevKey = process.env.PRIVATE_KEY;
  process.env.PRIVATE_KEY = Buffer.from(kp.secretKey.slice(0, 32)).toString('base64');
  try {
    const hwid = 'HV-HWID-1234567890ABCDEF1234567890ABCDEF';
    const signed = signLicenseCertificate({
      fullName: 'Mail Customer Traders',
      machineId: hwid,
      plan: 'PRO_PERPETUAL',
      mode: 'SINGLE_USER',
      maxSeats: 1,
    });
    assert.ok(signed.certificate.startsWith('HV-LIC-V3.'));
    const verified = verifySignedLicenseV3(signed.certificate, publicKeyB64, hwid);
    assert.equal(verified.valid, true);
    assert.equal(verified.payload?.plan, 'PRO_PERPETUAL');
    assert.equal(verified.payload?.clientName, 'Mail Customer Traders');
  } finally {
    if (prevKey === undefined) delete process.env.PRIVATE_KEY;
    else process.env.PRIVATE_KEY = prevKey;
  }
});

test('Electron main.js prevents unlicensed flush-sync or workspace save from downgrading active license', () => {
  const mainJs = fs.readFileSync(path.join(process.cwd(), 'electron/main.js'), 'utf8');
  assert.ok(mainJs.includes('authoritativeLicense'));
  assert.ok(mainJs.includes('verifySignedLicenseInMain'));
  assert.ok(mainJs.includes("ipcMain.handle('hv:save-license'"));
  assert.ok(mainJs.includes("ipcMain.handle('hv:save-workspace'"));
});

test('Dual-layer activation requires matching ACT-XXXX-XXXX code and enforces single-use against file reset/copy', async () => {
  const { signLicenseCertificate, deriveActivationCode: mailerDeriveActivationCode } = await import('../../server/auto-license-mailer.js');
  withMockLocalStorage((store) => {
    const { kp, publicKeyB64 } = createTestKeyPair();
    const currentMachine = getOrGenerateMachineId();
    const nowMs = Date.UTC(2026, 7, 1, 11, 0, 0);

    const certA = issueSignedLicenseV3(kp, {
      clientName: 'Dual Layer Traders',
      hwid: currentMachine,
      plan: 'PRO_PERPETUAL',
      nowMs,
    });
    const certB = issueSignedLicenseV3(kp, {
      clientName: 'Dual Layer Traders',
      hwid: currentMachine,
      plan: 'PRO_PERPETUAL',
      nowMs,
    });

    // Verify mailer matches the same ACT-XXXX-XXXX deterministic format
    const prevKey = process.env.PRIVATE_KEY;
    process.env.PRIVATE_KEY = Buffer.from(kp.secretKey.slice(0, 32)).toString('base64');
    try {
      const mailed = signLicenseCertificate({
        fullName: 'Mailer Dual Layer',
        machineId: currentMachine,
        plan: 'STANDARD_ANNUAL',
        mode: 'SINGLE_USER',
        maxSeats: 1,
      });
      assert.equal(mailed.activationCode, deriveActivationCode(mailed.certificate, currentMachine));
      assert.equal(mailed.activationCode, mailerDeriveActivationCode(mailed.certificate));
    } finally {
      if (prevKey === undefined) delete process.env.PRIVATE_KEY;
      else process.env.PRIVATE_KEY = prevKey;
    }

    // 1. Missing activation code must fail
    const missingCode = activateLicenseOnMachine({
      inputKey: certA.certificate,
      activationCode: '',
      registeredOwner: 'Dual Layer Traders',
      currentMachineId: currentMachine,
      nowMs,
      publicKeyB64,
    });
    assert.equal(missingCode.success, false);
    assert.match(missingCode.message, /Activation Code/i);

    // 2. Activation code from another certificate must fail
    const swappedCode = activateLicenseOnMachine({
      inputKey: certA.certificate,
      activationCode: certB.activationCode,
      registeredOwner: 'Dual Layer Traders',
      currentMachineId: currentMachine,
      nowMs,
      publicKeyB64,
    });
    assert.equal(swappedCode.success, false);
    assert.match(swappedCode.message, /Invalid Activation Code/i);

    // 3. Valid pair (certA + certA.activationCode normalized without hyphens/lowercase) activates & consumes serial
    const validRes = activateLicenseOnMachine({
      inputKey: certA.certificate,
      activationCode: certA.activationCode.toLowerCase().replace(/-/g, ''),
      registeredOwner: 'Dual Layer Traders',
      currentMachineId: currentMachine,
      nowMs,
      publicKeyB64,
    });
    assert.equal(validRes.success, true);
    assert.ok(store.get(CONSUMED_ACTIVATIONS_STORAGE_KEY));

    const consumedReg = readConsumedActivationsRegistry(currentMachine);
    assert.equal(consumedReg.tampered, false);
    assert.equal(consumedReg.entries.length, 1);
    assert.equal(consumedReg.entries[0].licenseId, certA.payload.licenseId);

    // 4. Even if sealed license envelope / workspace is deleted/reset, reusing consumed certA + activationCode fails!
    store.delete(LICENSE_ENVELOPE_STORAGE_KEY);
    const replayAfterReset = activateLicenseOnMachine({
      inputKey: certA.certificate,
      activationCode: certA.activationCode,
      registeredOwner: 'Dual Layer Traders',
      currentMachineId: currentMachine,
      nowMs: nowMs + 60_000,
      publicKeyB64,
    });
    assert.equal(replayAfterReset.success, false);
    assert.match(replayAfterReset.message, /already been used/i);

    // 5. A newly issued certificate (certB + certB.activationCode) succeeds cleanly
    const upgradeRes = activateLicenseOnMachine({
      inputKey: certB.certificate,
      activationCode: certB.activationCode,
      registeredOwner: 'Dual Layer Traders',
      currentMachineId: currentMachine,
      nowMs: nowMs + 120_000,
      publicKeyB64,
    });
    assert.equal(upgradeRes.success, true);

    // 6. Tampering with encrypted consumed registry triggers VAULT_TAMPERED in getTrialStatus
    const rawConsumed = JSON.parse(store.get(CONSUMED_ACTIVATIONS_STORAGE_KEY)!);
    rawConsumed.ct = 'AAAA' + rawConsumed.ct.slice(4);
    store.set(CONSUMED_ACTIVATIONS_STORAGE_KEY, JSON.stringify(rawConsumed));
    const tamperedStatus = getTrialStatus(upgradeRes.license, { vouchers: [], invoices: [], purchaseInvoices: [] }, nowMs + 180_000, { publicKeyB64 });
    assert.equal(tamperedStatus.vaultTampered, true);
    assert.equal(tamperedStatus.lockReason, 'VAULT_TAMPERED');
  });
});



