# Security Summary

HisabVeda ERP licensing, hardware binding, local/desktop storage, cloud sync rules, and Electron packaging have been refactored to eliminate client-side key generation, hardcoded secrets, local tamper bypasses, and Firestore client privilege escalation while preserving Starter Tier Firebase compatibility.

## Implemented Hardening Controls

1. **Ed25519 Asymmetric Cryptography (`HV-LIC-V3`)**:
   - **Client & Electron (`src/utils/license.ts`, `electron/main.js`)**: Contain only the 32-byte Ed25519 **Public Key** (`DEFAULT_VENDOR_ED25519_PUBLIC_KEY_B64`) and verify certificates via `nacl.sign.detached.verify`. All client-side key generators, symmetric HMAC salts, wildcard key prefixes, hardcoded master bypass keys (`HV-KEY-2026-PAID`, `HV-MASTER-2026-OWNER`), and default `'1234'` PIN backdoors were removed.
   - **Offline CLI & Server Issuance (`scripts/admin-license-keygen.ts`, `server.ts`)**: `HV-LIC-V3` certificates are signed exclusively using the offline Ed25519 Private Key CLI (`npx tsx scripts/admin-license-keygen.ts issue ...`) or `POST /api/license/issue` (authenticated via Firebase ID token `verifyIdToken` + verified owner email + `process.env.LICENSE_PRIVATE_KEY`).

2. **Hardware ID (HWID) Extraction & Dynamic Vault Key Derivation**:
   - **Electron (`electron/main.js`, `electron/preload.js`)**: Computes a 256-bit SHA-256 Machine Fingerprint (`HV-HWID-<64hex>`) combining CPU `ProcessorId` (`wmic`/`PowerShell`), Motherboard/BIOS UUID, primary physical disk serial (`readPrimaryDiskSerial`), and OS MachineGuid—with no static fallback ID.
   - **Vault Encryption (`electron/main.js`)**: Replaced the static vault secret with a dynamic 32-byte AES-256-GCM key derived per-PC via `crypto.scryptSync(liveMachineId, 'HISABVEDA_AES256_VAULT_SALT_V3', 32)` and authenticated AAD. Removed legacy plaintext v1 and static-key v2 vault fallbacks.

3. **Signed Local Cache Envelope, Anti-Tamper & Clock Rollback Protection**:
   - `getTrialStatus` cryptographically re-verifies `license.licenseKey` via Ed25519 on every evaluation (`VAULT_TAMPERED` lock on forged/unsigned `isLicensed: true`), enforces authoritative `payload.expiresAtMs` and `payload.hwid`, and checks `REVOKED` registry entries (`LICENSE_REVOKED`).
   - Browser state (`hv_secure_license_envelope_v1`) is HMAC-SHA256-sealed to the active `machineId` alongside monotonic clock watermarks (`hv_clock_watermark_v1`) and server clock attestation (`GET /api/license/time`, `POST /api/license/verify`).

4. **Desktop & Packaging Hardening (`electron/main.js`, `package.json`, `scripts/obfuscate-build.mjs`, `scripts/build-windows-exe.bat`)**:
   - Enabled `sandbox: true`, disabled `devTools` in production builds, stripped DevTools/reload shortcuts and context menu, rejected debug CLI inspection flags in packaged mode, locked navigation/new-window handlers, and frozen `contextBridge` APIs via `Object.freeze`.
   - Enabled Electron ASAR packaging (`"asar": true`), excluded `scripts/admin-license-keygen*`, `.env*`, test files, and rules from builds, and integrated `javascript-obfuscator` (`scripts/obfuscate-build.mjs`) into `build:exe` and `build-windows-exe.bat`.

5. **Firestore Rules Hardening (`firestore.rules`, `src/utils/cloudSync.ts`, `src/components/Security/AuthScreen.tsx`)**:
   - Deployed rules blocking all client writes to `/licenses/{licenseId}`, `/licenses/{licenseId}/devices/{deviceHash}`, and `/companies/{companyId}.license`, enforcing `email_verified == true`, strict tenant isolation (`cmp_<uid>`), and immutable roles/ownership.

## PoC Verification

- **Unit & Integration Security Tests**: Ran `./node_modules/.bin/tsx --test src/utils/*.test.ts firestore.rules.test.ts` — **78/78 tests passed**, covering:
  - Rejection of forged, wildcard, legacy (`HV-LIC-V2`, `SNA-LIC-V2`), and bypass keys (`HV-KEY-2026-PAID`).
  - Ed25519 `HV-LIC-V3` issuance/verification roundtrip, tampered payload rejection (`expiresAtMs` / `hwid`), and `REVOKED` blocking.
  - Forged `isLicensed: true` & HMAC-sealed `localStorage` envelope tampering detection (`VAULT_TAMPERED`).
  - Monotonic clock rollback lock (`CLOCK_TAMPERED`), copied-database `MACHINE_MISMATCH`, and Electron/ASAR hardening checks.
  - Adversarial Firestore rules assertions across all 12 privilege-escalation and injection vectors.
- **Firestore Rules Static Validation**: Ran `npx eslint firestore.rules` — exited with code `0` (zero errors), and live rules deployed cleanly.
- **TypeScript & Lint Verification**: Verified via `npm run build` / `compile_applet` and `lint_applet` (`tsc --noEmit`).
