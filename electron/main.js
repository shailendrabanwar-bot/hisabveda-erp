const { app, BrowserWindow, Menu, ipcMain, dialog, shell, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const nacl = require('tweetnacl');

// Register secure custom protocol so ESM modules, Firebase IndexedDB, and localStorage work cleanly without file:// CORS blocks
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// Reject Chromium / Node remote debugging switches immediately in packaged desktop builds
if (app.isPackaged) {
  const blockedDebugFlags = [
    '--remote-debugging-port',
    '--remote-debugging-pipe',
    '--inspect',
    '--inspect-brk',
  ];
  const hasDebugSwitch = process.argv.some((arg) =>
    blockedDebugFlags.some((flag) => String(arg || '').toLowerCase().startsWith(flag))
  );
  if (hasDebugSwitch) {
    app.exit(1);
  }
  app.commandLine.appendSwitch('disable-features', 'DevTools');
}

const MAX_DAILY_BACKUPS = 30;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes tolerance for NTP/DST drift
const BACKUP_DEBOUNCE_MS = 5 * 60 * 1000;
const VAULT_KDF_SALT = 'HISABVEDA_AES256_VAULT_SALT_V3';
const VAULT_AAD = Buffer.from('hisabveda-vault-v3', 'utf8');

// Ed25519 Public Key ONLY (zero private key inside Electron binary or ASAR)
const VENDOR_ED25519_PUBLIC_KEY_B64 =
  (process.env.VITE_LICENSE_PUBLIC_KEY || 'Z8Ht8Q8s/qmsxfm4KLeB+y/wh8Y0sWj+OAljax0FzlY=').trim();

let mainWindow = null;
let cachedDb = null;
let cachedVault = null;
let cachedLiveHardwareSummary = null;
let cachedHardwareVaultKey = null;
let lastBackupWrittenAtMs = 0;

// Enforce single desktop instance so concurrent processes never race disk writes
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function fromBase64Url(b64u) {
  const normalized = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/').trim();
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function verifySignedLicenseInMain(licenseKey, liveMachineId, nowMs = Date.now()) {
  const trimmed = String(licenseKey || '').trim();
  if (!trimmed.startsWith('HV-LIC-V3.')) {
    return { valid: false, reason: 'MALFORMED', error: 'Expected Ed25519 HV-LIC-V3 certificate.' };
  }
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { valid: false, reason: 'MALFORMED', error: 'Malformed license certificate.' };
  }
  try {
    const unsignedToken = `${parts[0]}.${parts[1]}`;
    const sigBytes = new Uint8Array(fromBase64Url(parts[2]));
    const pubBytes = new Uint8Array(fromBase64Url(VENDOR_ED25519_PUBLIC_KEY_B64));
    if (
      sigBytes.length !== nacl.sign.signatureLength ||
      pubBytes.length !== nacl.sign.publicKeyLength
    ) {
      return { valid: false, reason: 'INVALID_SIGNATURE', error: 'Malformed Ed25519 key or signature length.' };
    }
    const sigOk = nacl.sign.detached.verify(
      new Uint8Array(Buffer.from(unsignedToken, 'utf8')),
      sigBytes,
      pubBytes
    );
    if (!sigOk) {
      return { valid: false, reason: 'INVALID_SIGNATURE', error: 'Invalid Ed25519 certificate signature.' };
    }

    const payload = JSON.parse(fromBase64Url(parts[1]).toString('utf8'));
    if (!payload || payload.v !== 3 || payload.app !== 'HISABVEDA_ERP' || !Number.isFinite(payload.expiresAtMs)) {
      return { valid: false, reason: 'MALFORMED', error: 'Invalid certificate payload claims.' };
    }

    const signedHwid = String(payload.hwid || '').trim().toUpperCase();
    const targetHwid = String(liveMachineId || '').trim().toUpperCase();
    if (signedHwid !== 'ANY_HARDWARE_ID' && signedHwid !== targetHwid) {
      return { valid: false, reason: 'MACHINE_MISMATCH', error: 'Certificate is bound to another PC.', payload };
    }

    if (payload.expiresAtMs < nowMs) {
      return { valid: false, reason: 'EXPIRED', error: 'Certificate has expired.', payload };
    }

    return { valid: true, payload };
  } catch {
    return { valid: false, reason: 'MALFORMED', error: 'Failed to parse certificate.' };
  }
}

function getStoragePaths() {
  const userDataDir = app.getPath('userData');
  const dataDir = path.join(userDataDir, 'HisabVedaData');
  const backupsDir = path.join(dataDir, 'backups');
  return {
    userDataDir,
    dataDir,
    backupsDir,
    dbFile: path.join(dataDir, 'hisabveda-db.json'),
    vaultFile: path.join(dataDir, '.hv-security-vault.json'),
  };
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, '../public/hv-icon.ico'),
    path.join(__dirname, '../public/icon.ico'),
    path.join(__dirname, '../public/hv-app-512.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function writeJsonAtomic(targetPath, dataObj) {
  ensureDir(path.dirname(targetPath));
  const payload = JSON.stringify(dataObj, null, 2);
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, payload, 'utf8');
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch {
    fs.writeFileSync(targetPath, payload, 'utf8');
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore temp cleanup failure
    }
  }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readWindowsMachineGuid() {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync(
      'reg',
      ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'],
      { encoding: 'utf8', timeout: 1500, windowsHide: true }
    );
    const match = out.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function readWindowsRegValue(keyPath, valueName) {
  if (process.platform !== 'win32') return '';
  try {
    const out = execFileSync(
      'reg',
      ['query', keyPath, '/v', valueName],
      { encoding: 'utf8', timeout: 800, windowsHide: true }
    );
    const escapedName = valueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = out.match(new RegExp(`${escapedName}\\s+REG_\\w+\\s+([^\\r\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function readCpuProcessorId() {
  try {
    if (process.platform === 'win32') {
      const procId = readWindowsRegValue('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', 'Identifier');
      const procName = readWindowsRegValue('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', 'ProcessorNameString');
      const vendorId = readWindowsRegValue('HKLM\\HARDWARE\\DESCRIPTION\\System\\CentralProcessor\\0', 'VendorIdentifier');
      const cpuFallback = (os.cpus()?.[0]?.model || '').trim();
      const combined = [procId, procName || cpuFallback, vendorId].filter(Boolean).join('|');
      if (combined) return combined;
      return cpuFallback;
    } else if (process.platform === 'linux') {
      if (fs.existsSync('/proc/cpuinfo')) {
        const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
        const m = cpuInfo.match(/^(?:Serial|Hardware|model name)\s*:\s*(.+)$/im);
        if (m) return m[1].trim();
      }
    } else if (process.platform === 'darwin') {
      const cpuBrand = execFileSync('sysctl', ['-n', 'machdep.cpu.brand_string'], { encoding: 'utf8', timeout: 1500 }).trim();
      if (cpuBrand) return cpuBrand;
    }
  } catch {
    // ignore
  }
  return (os.cpus()?.[0]?.model || '').trim();
}

function readPrimaryDiskSerial() {
  try {
    if (process.platform === 'win32') {
      const diskEnum = readWindowsRegValue('HKLM\\SYSTEM\\CurrentControlSet\\Services\\disk\\Enum', '0');
      const scsiId = readWindowsRegValue(
        'HKLM\\HARDWARE\\DEVICEMAP\\Scsi\\Scsi Port 0\\Scsi Bus 0\\Target Id 0\\Logical Unit Id 0',
        'Identifier'
      );
      const mountedVol = readWindowsRegValue('HKLM\\SYSTEM\\MountedDevices', '\\DosDevices\\C:');
      const fallbackVol = mountedVol
        ? crypto.createHash('sha256').update(mountedVol).digest('hex').slice(0, 24)
        : '';
      const diskVal = diskEnum || scsiId || fallbackVol;
      if (diskVal) return diskVal;
      return readWindowsMachineGuid();
    } else if (process.platform === 'linux') {
      const byIdDir = '/dev/disk/by-id';
      if (fs.existsSync(byIdDir)) {
        const entries = fs.readdirSync(byIdDir).filter((e) => !e.includes('-part')).sort();
        if (entries[0]) return entries[0].trim();
      }
    } else if (process.platform === 'darwin') {
      const ioOut = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 1500 });
      const m = ioOut.match(/"IOPlatformSerialNumber"\s*=\s*"([^"]+)"/i);
      if (m) return m[1].trim();
    }
  } catch {
    // ignore
  }
  return '';
}

function readSystemBoardUuid() {
  try {
    if (process.platform === 'win32') {
      const hwProfileGuid = readWindowsRegValue(
        'HKLM\\SYSTEM\\CurrentControlSet\\Control\\IDConfigDB\\Hardware Profiles\\0001',
        'HwProfileGuid'
      );
      const biosProduct = readWindowsRegValue('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'SystemProductName');
      const biosBoard = readWindowsRegValue('HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS', 'BaseBoardProduct');
      const combined = [hwProfileGuid, biosProduct, biosBoard].filter(Boolean).join('|');
      if (combined) return combined;
      return readWindowsMachineGuid();
    }

    if (process.platform === 'linux') {
      for (const p of ['/sys/class/dmi/id/product_uuid', '/etc/machine-id']) {
        try {
          if (fs.existsSync(p)) {
            const val = fs.readFileSync(p, 'utf8').trim();
            if (val) return val;
          }
        } catch {
          // ignore permission error on product_uuid
        }
      }
    }

    if (process.platform === 'darwin') {
      try {
        const ioOut = execFileSync(
          'ioreg',
          ['-rd1', '-c', 'IOPlatformExpertDevice'],
          { encoding: 'utf8', timeout: 1500 }
        );
        const match = ioOut.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/i);
        if (match) return match[1].trim();
      } catch {
        // ignore ioreg error
      }
    }
  } catch {
    // ignore hardware UUID lookup failure
  }
  return '';
}

function getLiveHardwareSummary() {
  if (cachedLiveHardwareSummary) return cachedLiveHardwareSummary;

  const cpus = os.cpus() || [];
  const cpuModel = (cpus[0]?.model || 'GENERIC_CPU').trim();
  const cpuCores = cpus.length || 1;
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const winGuid = readWindowsMachineGuid();
  const systemUuid = readSystemBoardUuid();
  const cpuId = readCpuProcessorId();
  const diskSerial = readPrimaryDiskSerial();

  const seed = [
    'HISABVEDA-HWID-V3',
    cpuId || 'NO_CPU_ID',
    systemUuid || 'NO_SYS_UUID',
    diskSerial || 'NO_DISK_SERIAL',
    winGuid || 'NO_OS_GUID',
    hostname,
    platform,
    arch,
    cpuModel,
    String(cpuCores),
    String(os.totalmem()),
  ].join('|');

  const digest = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
  const machineId = `HV-HWID-${digest}`;

  cachedLiveHardwareSummary = {
    machineId,
    hostname,
    platform,
    arch,
    cpuModel,
    cpuCores,
    hasCpuId: Boolean(cpuId),
    hasSystemUuid: Boolean(systemUuid),
    hasDiskSerial: Boolean(diskSerial),
    hasMachineGuid: Boolean(winGuid),
    source: 'ELECTRON_HARDWARE',
  };
  return cachedLiveHardwareSummary;
}

function computeHardwareMachineId() {
  return getLiveHardwareSummary().machineId;
}

function deriveHardwareVaultKey() {
  if (cachedHardwareVaultKey) return cachedHardwareVaultKey;
  const liveHwid = computeHardwareMachineId();
  cachedHardwareVaultKey = crypto.scryptSync(liveHwid, VAULT_KDF_SALT, 32);
  return cachedHardwareVaultKey;
}

function encryptVaultPayload(vaultObj) {
  const keyBuf = deriveHardwareVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  cipher.setAAD(VAULT_AAD);
  const plaintext = JSON.stringify(vaultObj);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    v: 3,
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag: authTag.toString('hex'),
    data: encrypted.toString('base64'),
  };
}

function readEncryptedVaultFile(vaultFilePath) {
  try {
    if (!fs.existsSync(vaultFilePath)) return { vault: null, tampered: false };
    const rawText = fs.readFileSync(vaultFilePath, 'utf8');
    if (!rawText || !rawText.trim()) return { vault: null, tampered: false };

    let parsedEnvelope;
    try {
      parsedEnvelope = JSON.parse(rawText);
    } catch {
      return { vault: null, tampered: true };
    }

    // Strict AES-256-GCM v3 hardware-bound envelope ONLY (legacy plain JSON v1 & static-key v2 rejected)
    if (parsedEnvelope && parsedEnvelope.v === 3 && parsedEnvelope.alg === 'aes-256-gcm') {
      try {
        const keyBuf = deriveHardwareVaultKey();
        const iv = Buffer.from(String(parsedEnvelope.iv || ''), 'hex');
        const tag = Buffer.from(String(parsedEnvelope.tag || ''), 'hex');
        const ciphertext = Buffer.from(String(parsedEnvelope.data || ''), 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuf, iv);
        decipher.setAAD(VAULT_AAD);
        decipher.setAuthTag(tag);
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
        const vaultObj = JSON.parse(decrypted);
        return { vault: vaultObj, tampered: false };
      } catch {
        // Decryption fails automatically if copied onto another PC or modified on disk
        return { vault: null, tampered: true };
      }
    }

    return { vault: null, tampered: true };
  } catch {
    return { vault: null, tampered: true };
  }
}

function loadOrInitVault() {
  if (cachedVault) return cachedVault;
  const { vaultFile } = getStoragePaths();
  const { vault: existing, tampered } = readEncryptedVaultFile(vaultFile);
  const nowMs = Date.now();
  const liveMachineId = computeHardwareMachineId();
  const existingBoundId = (existing && (existing.boundMachineId || existing.machineId || existing.license?.machineId))
    ? String(existing.boundMachineId || existing.machineId || existing.license?.machineId).trim().toUpperCase()
    : liveMachineId;

  let storedLicense = existing?.license || null;
  let signatureTampered = false;
  if (storedLicense?.isLicensed) {
    const sigCheck = verifySignedLicenseInMain(storedLicense.licenseKey, liveMachineId, nowMs);
    if (!sigCheck.valid && sigCheck.reason !== 'EXPIRED' && sigCheck.reason !== 'MACHINE_MISMATCH') {
      signatureTampered = true;
      storedLicense = null;
    }
  }

  const vault = {
    version: 3,
    machineId: liveMachineId,
    boundMachineId: existingBoundId,
    trialStartDate: (existing && existing.trialStartDate) || new Date(nowMs).toISOString(),
    maxObservedTimeMs: Math.max(Number(existing?.maxObservedTimeMs || 0), 0),
    lastCheckTimeMs: Number(existing?.lastCheckTimeMs || nowMs),
    clockTamperLocked: Boolean(existing?.clockTamperLocked),
    clockTamperDetectedAt: existing?.clockTamperDetectedAt || null,
    vaultTampered: Boolean(tampered || existing?.vaultTampered || signatureTampered),
    license: storedLicense,
  };

  if (!vault.maxObservedTimeMs) {
    vault.maxObservedTimeMs = nowMs;
  }

  cachedVault = vault;
  try {
    writeJsonAtomic(vaultFile, encryptVaultPayload(vault));
  } catch (err) {
    console.error('Failed to persist initial encrypted vault:', err);
  }
  return cachedVault;
}

function saveVault(vault) {
  vault.machineId = computeHardwareMachineId();
  cachedVault = vault;
  const { vaultFile } = getStoragePaths();
  try {
    writeJsonAtomic(vaultFile, encryptVaultPayload(vault));
  } catch (err) {
    console.error('Failed to persist encrypted vault:', err);
  }
}

function evaluateAndUpdateClock(nowMs = Date.now()) {
  const vault = loadOrInitVault();
  const trialStartMs = vault.trialStartDate ? Date.parse(vault.trialStartDate) : 0;
  const highWaterMs = Math.max(Number(vault.maxObservedTimeMs || 0), Number.isFinite(trialStartMs) ? trialStartMs : 0);

  const rolledBackAgainstHighWater = highWaterMs > 0 && (nowMs + CLOCK_SKEW_TOLERANCE_MS < highWaterMs);
  const rolledBackBeforeTrial = Number.isFinite(trialStartMs) && trialStartMs > 0 && (nowMs + CLOCK_SKEW_TOLERANCE_MS < trialStartMs);

  if (rolledBackAgainstHighWater || rolledBackBeforeTrial) {
    vault.clockTamperLocked = true;
    vault.clockTamperDetectedAt = new Date(nowMs).toISOString();
    vault.lastCheckTimeMs = nowMs;
    saveVault(vault);
    return {
      clockTampered: true,
      maxObservedTimeMs: highWaterMs,
      lastCheckTimeMs: nowMs,
      clockTamperDetectedAt: vault.clockTamperDetectedAt,
    };
  }

  vault.clockTamperLocked = false;
  vault.clockTamperDetectedAt = null;
  vault.maxObservedTimeMs = Math.max(highWaterMs, nowMs);
  vault.lastCheckTimeMs = nowMs;
  saveVault(vault);
  return {
    clockTampered: false,
    maxObservedTimeMs: vault.maxObservedTimeMs,
    lastCheckTimeMs: nowMs,
    clockTamperDetectedAt: null,
  };
}

function listBackups() {
  const { backupsDir } = getStoragePaths();
  if (!fs.existsSync(backupsDir)) return [];
  return fs
    .readdirSync(backupsDir)
    .filter((f) => /^hisabveda-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
}

function loadOrRecoverDb() {
  if (cachedDb) return cachedDb;
  const { dbFile, backupsDir } = getStoragePaths();

  let db = readJsonSafe(dbFile);
  if (!db || typeof db !== 'object') {
    const backups = listBackups();
    for (const fileName of backups) {
      const recovered = readJsonSafe(path.join(backupsDir, fileName));
      if (recovered && typeof recovered === 'object' && recovered.workspaces) {
        db = recovered;
        try {
          writeJsonAtomic(dbFile, db);
        } catch {
          // ignore write error during recovery
        }
        break;
      }
    }
  }

  if (!db || typeof db !== 'object') {
    db = {
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedAtMs: Date.now(),
      workspaces: {},
      settings: null,
      snapshots: {},
      license: null,
    };
  }

  db.workspaces = db.workspaces && typeof db.workspaces === 'object' ? db.workspaces : {};
  db.snapshots = db.snapshots && typeof db.snapshots === 'object' ? db.snapshots : {};

  // Cross-heal license state between encrypted vault and JSON DB
  const vault = loadOrInitVault();
  if (vault.license?.isLicensed) {
    db.license = vault.license;
  } else if (db.license?.isLicensed) {
    if (syncLicenseToVault(db.license)) {
      db.license = loadOrInitVault().license;
    }
  }

  cachedDb = db;
  return cachedDb;
}

function rotateDailyBackup(force = false) {
  const db = loadOrRecoverDb();
  const { backupsDir } = getStoragePaths();
  ensureDir(backupsDir);

  const today = new Date().toISOString().split('T')[0];
  const todayFile = path.join(backupsDir, `hisabveda-backup-${today}.json`);
  const nowMs = Date.now();

  const shouldWrite =
    force ||
    !fs.existsSync(todayFile) ||
    nowMs - lastBackupWrittenAtMs >= BACKUP_DEBOUNCE_MS;

  if (shouldWrite) {
    writeJsonAtomic(todayFile, {
      ...db,
      backupCreatedAt: new Date(nowMs).toISOString(),
    });
    lastBackupWrittenAtMs = nowMs;
  }

  const allBackups = listBackups();
  if (allBackups.length > MAX_DAILY_BACKUPS) {
    for (const obsolete of allBackups.slice(MAX_DAILY_BACKUPS)) {
      try {
        fs.unlinkSync(path.join(backupsDir, obsolete));
      } catch {
        // ignore prune error
      }
    }
  }

  return {
    backupCount: Math.min(allBackups.length, MAX_DAILY_BACKUPS),
    latestBackupFile: todayFile,
  };
}

function saveDb(forceBackup = false) {
  const db = loadOrRecoverDb();
  const { dbFile } = getStoragePaths();
  const nowMs = Date.now();
  db.updatedAt = new Date(nowMs).toISOString();
  db.updatedAtMs = nowMs;
  writeJsonAtomic(dbFile, db);
  return rotateDailyBackup(forceBackup);
}

function syncLicenseToVault(license) {
  if (!license || typeof license !== 'object') return false;
  const vault = loadOrInitVault();
  const liveMachineId = computeHardwareMachineId();

  // Never allow resetting trialStartDate to a later date via wiped local state
  const existingStartMs = vault.trialStartDate ? Date.parse(vault.trialStartDate) : 0;
  const incomingStartMs = license.trialStartDate ? Date.parse(license.trialStartDate) : 0;
  if (
    Number.isFinite(incomingStartMs) &&
    incomingStartMs > 0 &&
    (!existingStartMs || incomingStartMs < existingStartMs)
  ) {
    vault.trialStartDate = license.trialStartDate;
  }

  // Strictly enforce Ed25519 signature verification in main process before saving any licensed state
  if (license.isLicensed) {
    const verified = verifySignedLicenseInMain(license.licenseKey, liveMachineId, Date.now());
    if (!verified.valid) {
      if (verified.reason === 'INVALID_SIGNATURE' || verified.reason === 'MALFORMED') {
        vault.vaultTampered = true;
        saveVault(vault);
      }
      return false;
    }
    const signedPayload = verified.payload;
    const boundHwid = signedPayload.hwid === 'ANY_HARDWARE_ID' ? liveMachineId : signedPayload.hwid;
    vault.boundMachineId = boundHwid;
    vault.vaultTampered = false;
    vault.license = {
      ...license,
      isLicensed: true,
      machineId: boundHwid,
      registeredOwner: signedPayload.clientName,
      licenseType: signedPayload.plan,
      licenseMode: signedPayload.mode,
      maxSeats: signedPayload.maxSeats,
      expiresAtIso: new Date(signedPayload.expiresAtMs).toISOString(),
      expiryDate: new Date(signedPayload.expiresAtMs).toISOString().split('T')[0],
      trialStartDate: vault.trialStartDate,
    };
    saveVault(vault);
    return true;
  }

  if (!vault.license?.isLicensed) {
    vault.boundMachineId = liveMachineId;
    vault.license = {
      ...license,
      isLicensed: false,
      machineId: liveMachineId,
      trialStartDate: vault.trialStartDate,
    };
  } else if (vault.license && license.issuedLicenses) {
    vault.license = {
      ...vault.license,
      issuedLicenses: license.issuedLicenses,
    };
  }
  saveVault(vault);
  return true;
}

function buildBootstrapPayload() {
  const paths = getStoragePaths();
  const vault = loadOrInitVault();
  const clockState = evaluateAndUpdateClock(Date.now());
  const db = loadOrRecoverDb();
  const backups = listBackups();
  const hardwareSummary = getLiveHardwareSummary();
  const liveMachineId = hardwareSummary.machineId;

  // Recover licensed state from db.license or workspace copies if vault was not yet updated
  if (!vault.license?.isLicensed) {
    const candidateLicense =
      (db.license?.isLicensed ? db.license : null) ||
      Object.values(db.workspaces || {})
        .map((w) => w && w.data && w.data.license)
        .find((lic) => lic && lic.isLicensed) ||
      null;
    if (candidateLicense) {
      syncLicenseToVault(candidateLicense);
    }
  }

  const boundId = String(vault.license?.machineId || vault.boundMachineId || liveMachineId).trim().toUpperCase();
  const machineMismatch = Boolean(
    vault.license?.isLicensed &&
    boundId &&
    boundId !== 'ANY_HARDWARE_ID' &&
    boundId !== liveMachineId
  );

  let sanitizedVaultLicense = vault.license;
  if (sanitizedVaultLicense?.isLicensed) {
    const recheck = verifySignedLicenseInMain(
      sanitizedVaultLicense.licenseKey,
      liveMachineId,
      Math.max(Date.now(), clockState.maxObservedTimeMs || 0)
    );
    if (!recheck.valid && recheck.reason !== 'EXPIRED' && recheck.reason !== 'MACHINE_MISMATCH') {
      sanitizedVaultLicense = null;
      vault.vaultTampered = true;
    } else {
      db.license = sanitizedVaultLicense;
    }
  }

  return {
    machineId: liveMachineId,
    hardwareSummary,
    dataDir: paths.dataDir,
    backupsDir: paths.backupsDir,
    backupCount: backups.length,
    latestBackupDate: backups[0] ? backups[0].replace('hisabveda-backup-', '').replace('.json', '') : null,
    clockState,
    vault: {
      machineId: liveMachineId,
      boundMachineId: boundId,
      trialStartDate: vault.trialStartDate,
      maxObservedTimeMs: vault.maxObservedTimeMs,
      clockTamperLocked: vault.clockTamperLocked,
      vaultTampered: Boolean(vault.vaultTampered),
      machineMismatch,
      license: sanitizedVaultLicense,
    },
    db,
  };
}

function registerIpcHandlers() {
  ipcMain.on('hv:bootstrap-sync', (event) => {
    try {
      event.returnValue = buildBootstrapPayload();
    } catch (err) {
      console.error('hv:bootstrap-sync failed:', err);
      event.returnValue = null;
    }
  });

  ipcMain.on('hv:get-machine-id', (event) => {
    try {
      event.returnValue = computeHardwareMachineId();
    } catch {
      const emergencySeed = `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()?.length || 1}`;
      event.returnValue = `HV-HWID-${crypto.createHash('sha256').update(emergencySeed).digest('hex').toUpperCase()}`;
    }
  });

  ipcMain.on('hv:get-hardware-summary', (event) => {
    try {
      event.returnValue = getLiveHardwareSummary();
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('hv:clock-check', (event, clientNowMs) => {
    try {
      const targetNow = typeof clientNowMs === 'number' && Number.isFinite(clientNowMs) ? clientNowMs : Date.now();
      event.returnValue = evaluateAndUpdateClock(targetNow);
    } catch {
      event.returnValue = { clockTampered: false, maxObservedTimeMs: Date.now(), lastCheckTimeMs: Date.now() };
    }
  });

  ipcMain.on('hv:flush-sync', (event, payload) => {
    try {
      const db = loadOrRecoverDb();
      const vault = loadOrInitVault();
      if (payload && typeof payload === 'object') {
        if (payload.storageKey && payload.data) {
          if (payload.data.license?.isLicensed) {
            syncLicenseToVault(payload.data.license);
          } else if (payload.data.license && !vault.license?.isLicensed) {
            syncLicenseToVault(payload.data.license);
          }
          const latestVault = loadOrInitVault();
          const authoritativeLicense = latestVault.license?.isLicensed
            ? latestVault.license
            : (db.license?.isLicensed ? db.license : latestVault.license);
          if (authoritativeLicense?.isLicensed) {
            db.license = authoritativeLicense;
          }
          db.workspaces[payload.storageKey] = {
            data: {
              ...payload.data,
              ...(authoritativeLicense ? { license: authoritativeLicense } : {}),
            },
            savedAtMs: Date.now(),
            savedAt: new Date().toISOString(),
          };
        }
        if (payload.settings) {
          db.settings = {
            data: payload.settings,
            savedAtMs: Date.now(),
            savedAt: new Date().toISOString(),
          };
        }
      }
      saveDb(false);
      event.returnValue = true;
    } catch (err) {
      console.error('hv:flush-sync failed:', err);
      event.returnValue = false;
    }
  });

  ipcMain.handle('hv:save-workspace', async (_event, storageKey, data) => {
    if (!storageKey || !data) return false;
    const db = loadOrRecoverDb();
    const vault = loadOrInitVault();
    const nowMs = Date.now();
    if (data.license?.isLicensed) {
      syncLicenseToVault(data.license);
    } else if (data.license && !vault.license?.isLicensed) {
      syncLicenseToVault(data.license);
    }
    const latestVault = loadOrInitVault();
    const authoritativeLicense = latestVault.license?.isLicensed
      ? latestVault.license
      : (db.license?.isLicensed ? db.license : latestVault.license);
    if (authoritativeLicense?.isLicensed) {
      db.license = authoritativeLicense;
    }
    db.workspaces[storageKey] = {
      data: {
        ...data,
        ...(authoritativeLicense ? { license: authoritativeLicense } : {}),
      },
      savedAtMs: nowMs,
      savedAt: new Date(nowMs).toISOString(),
    };
    evaluateAndUpdateClock(nowMs);
    saveDb(false);
    return true;
  });

  ipcMain.handle('hv:save-settings', async (_event, config) => {
    if (!config) return false;
    const db = loadOrRecoverDb();
    const nowMs = Date.now();
    db.settings = {
      data: config,
      savedAtMs: nowMs,
      savedAt: new Date(nowMs).toISOString(),
    };
    saveDb(false);
    return true;
  });

  ipcMain.handle('hv:save-snapshot', async (_event, snapshotKey, snapshot) => {
    if (!snapshotKey) return false;
    const db = loadOrRecoverDb();
    if (snapshot === null) {
      delete db.snapshots[snapshotKey];
    } else {
      db.snapshots[snapshotKey] = snapshot;
    }
    saveDb(false);
    return true;
  });

  ipcMain.handle('hv:save-license', async (_event, license) => {
    if (!license) return false;
    const accepted = syncLicenseToVault(license);
    if (!accepted) return false;
    const db = loadOrRecoverDb();
    const verifiedVaultLicense = loadOrInitVault().license;
    db.license = verifiedVaultLicense;
    // Propagate verified commercial license across every persisted workspace in hisabveda-db.json
    if (verifiedVaultLicense?.isLicensed && db.workspaces && typeof db.workspaces === 'object') {
      for (const key of Object.keys(db.workspaces)) {
        const entry = db.workspaces[key];
        if (entry && entry.data && typeof entry.data === 'object') {
          entry.data = {
            ...entry.data,
            license: verifiedVaultLicense,
          };
          entry.savedAtMs = Date.now();
          entry.savedAt = new Date().toISOString();
        }
      }
    }
    saveDb(true);
    return true;
  });

  ipcMain.handle('hv:create-backup-now', async () => {
    return saveDb(true);
  });

  ipcMain.handle('hv:get-storage-info', async () => {
    const paths = getStoragePaths();
    const backups = listBackups();
    return {
      dataDir: paths.dataDir,
      dbFile: paths.dbFile,
      backupsDir: paths.backupsDir,
      backupCount: backups.length,
      backups,
    };
  });

  ipcMain.handle('hv:open-external', async (_event, url) => {
    try {
      const parsed = new URL(String(url || ''));
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        await shell.openExternal(parsed.toString());
        return true;
      }
      return false;
    } catch {
      return false;
    }
  });
}

function createWindow() {
  const iconPath = getAppIconPath();
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'HisabVeda ERP - Enterprise Accounting Software',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
    },
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.maximize();

  const allowedOrigin = process.env.ELECTRON_START_URL
    ? (() => {
        try {
          return new URL(process.env.ELECTRON_START_URL).origin;
        } catch {
          return null;
        }
      })()
    : null;

  const applyWindowZoom = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.setZoomFactor(0.9);
    }
  };

  mainWindow.webContents.on('dom-ready', applyWindowZoom);
  mainWindow.webContents.on('did-finish-load', applyWindowZoom);

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('Renderer failed to load:', errorCode, errorDescription, validatedURL);
    if (errorCode === -3) return; // Ignore intentional ERR_ABORTED navigations
    if (mainWindow && !mainWindow.isDestroyed()) {
      const safeErr = String(errorDescription || 'Load failed').replace(/[<>&"]/g, '');
      const fallbackHtml = `<!doctype html><html><body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="max-width:460px;padding:28px;border:1px solid #334155;border-radius:16px;background:#1e293b;text-align:center;"><h2 style="margin:0 0 10px;color:#fff;">HisabVeda ERP Startup Recovery</h2><p style="font-size:13px;color:#94a3b8;margin:0 0 16px;">Unable to load desktop interface (${errorCode}: ${safeErr}).</p><button onclick="location.reload()" style="background:#4f46e5;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;">Reload App</button></div></body></html>`;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`).catch(() => {});
    }
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process crashed:', details?.reason);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const reason = String(details?.reason || 'unknown').replace(/[<>&"]/g, '');
      const fallbackHtml = `<!doctype html><html><body style="margin:0;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;"><div style="max-width:460px;padding:28px;border:1px solid #334155;border-radius:16px;background:#1e293b;text-align:center;"><h2 style="margin:0 0 10px;color:#fff;">HisabVeda ERP Recovery</h2><p style="font-size:13px;color:#94a3b8;margin:0 0 16px;">Display process stopped (${reason}). Click below to restart.</p><button onclick="location.href='app://hisabveda/index.html'" style="background:#4f46e5;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;">Restart Workspace</button></div></body></html>`;
      mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(fallbackHtml)}`).catch(() => {});
    }
  });

  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
  } else {
    mainWindow.loadURL('app://hisabveda/index.html');
  }

  // Runtime DevTools, Inspect-Element, Navigation Lockdown & Zoom Shortcuts
  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow?.webContents.closeDevTools();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toUpperCase();
    const code = String(input.code || '');
    const isDevToolsShortcut =
      key === 'F12' ||
      ((input.control || input.meta) && input.shift && (key === 'I' || key === 'J' || key === 'C')) ||
      (process.platform === 'darwin' && input.meta && input.alt && (key === 'I' || key === 'J' || key === 'C')) ||
      (app.isPackaged && (input.control || input.meta) && key === 'R');
    if (isDevToolsShortcut) {
      event.preventDefault();
      return;
    }

    if ((input.control || input.meta) && !input.alt && mainWindow && !mainWindow.isDestroyed()) {
      if (input.key === '+' || input.key === '=' || code === 'Equal' || code === 'NumpadAdd') {
        event.preventDefault();
        const nextZoom = Math.min(2.0, Number((mainWindow.webContents.getZoomFactor() + 0.1).toFixed(2)));
        mainWindow.webContents.setZoomFactor(nextZoom);
      } else if (input.key === '-' || input.key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
        event.preventDefault();
        const nextZoom = Math.max(0.5, Number((mainWindow.webContents.getZoomFactor() - 0.1).toFixed(2)));
        mainWindow.webContents.setZoomFactor(nextZoom);
      } else if (input.key === '0' || code === 'Digit0' || code === 'Numpad0') {
        event.preventDefault();
        mainWindow.webContents.setZoomFactor(0.9);
      }
    }
  });

  mainWindow.webContents.on('context-menu', (event) => {
    if (app.isPackaged) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.protocol === 'app:' || parsed.protocol === 'file:' || parsed.protocol === 'data:') return;
      if (allowedOrigin && parsed.origin === allowedOrigin) return;
      event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function getMimeTypeForExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json':
    case '.webmanifest': return 'application/json; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    case '.woff': return 'font/woff';
    case '.ttf': return 'font/ttf';
    default: return 'application/octet-stream';
  }
}

function registerDistProtocol() {
  const distDir = path.resolve(__dirname, '../dist');
  protocol.handle('app', async (request) => {
    try {
      const reqUrl = new URL(request.url);
      let relPath = decodeURIComponent(reqUrl.pathname || '/');
      relPath = relPath.replace(/^\/+/, '');
      if (!relPath || relPath === '/') {
        relPath = 'index.html';
      }

      const candidate = path.resolve(distDir, relPath);
      const relFromDist = path.relative(distDir, candidate);
      if (relFromDist.startsWith('..') || path.isAbsolute(relFromDist)) {
        return new Response('Forbidden', { status: 403 });
      }

      let targetFile = candidate;
      if (!fs.existsSync(targetFile) || fs.statSync(targetFile).isDirectory()) {
        if (!path.extname(relPath)) {
          targetFile = path.join(distDir, 'index.html');
        } else {
          return new Response('Not Found', { status: 404 });
        }
      }

      const data = await fs.promises.readFile(targetFile);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': getMimeTypeForExt(targetFile),
          'Cache-Control': 'no-cache',
        },
      });
    } catch (err) {
      console.error('app:// protocol error:', err);
      return new Response('Internal Desktop Asset Error', { status: 500 });
    }
  });
}

app.whenReady().then(() => {
  registerDistProtocol();
  loadOrInitVault();
  evaluateAndUpdateClock(Date.now());
  loadOrRecoverDb();
  registerIpcHandlers();
  createWindow();
});

app.on('before-quit', () => {
  try {
    saveDb(false);
  } catch {
    // ignore quit save error
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
