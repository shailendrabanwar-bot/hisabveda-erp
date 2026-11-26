# HisabVeda ERP — Firestore & Licensing Security Specification

## 1. Data Invariants
1. **Tenant Isolation**: Every company dataset (`/companies/{companyId}`) and sub-collection (`/companies/{companyId}/members/{memberId}`, `/companies/{companyId}/dataShards/{shardId}`) MUST satisfy `companyId == "cmp_" + request.auth.uid` and `ownerUid == request.auth.uid`.
2. **Server-Authoritative Licensing (`/licenses/{licenseId}` & `/companies/{companyId}.license`)**:
   - No client SDK (not even an authenticated tenant owner or `ADMIN`) may create, modify, extend, or delete `/licenses/{licenseId}` or `/licenses/{licenseId}/devices/{deviceHash}`.
   - No client SDK may write, inject, or mutate the `license` field inside `/companies/{companyId}` on `create` or `update` (explicitly excluded from `affectedKeys().hasOnly(...)` and blocked on creation).
   - Verified clients may only `get`/`list` their own `/licenses/{licenseId}` records where `resource.data.ownerUid == request.auth.uid`.
3. **Immutable Ownership & Identity**: `id`, `uid`, `companyId`, `ownerUid`, `collectionKey`, and `shardIndex` are immutable after document creation.
4. **Privilege Escalation Prevention**: Users cannot escalate their own `/users/{userId}.role` on update or spoof an unverified email claim (`request.auth.token.email_verified == true` required).
5. **Bounded Document & Array Limits**: Every string, ID (`^[a-zA-Z0-9_\-]+$`, max 128 chars), and array size is strictly bounded inside validation helper functions (`isValidUserProfile`, `isValidCompanyDoc`, `isValidCompanyMember`, `isValidDataShard`).

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)
1. **Client Self-Licensing on Company Create**: Authenticated owner attempts `setDoc('/companies/cmp_<uid>', { ..., license: { isLicensed: true, expiryDate: '2099-12-31' } })` -> Denied (`!('license' in data)`).
2. **Client License Expiry Extension on Company Update**: Authenticated owner attempts `updateDoc('/companies/cmp_<uid>', { 'license.expiryDate': '2099-12-31', 'license.isLicensed': true })` -> Denied (`'license'` omitted from `affectedKeys().hasOnly(...)` + immutability check).
3. **Client MaxSeats / HWID Tampering on Company Update**: Authenticated owner attempts `updateDoc('/companies/cmp_<uid>', { 'license.maxSeats': 999, 'license.machineId': 'SPOOFED' })` -> Denied.
4. **Direct Write to `/licenses/{licenseId}`**: Authenticated user attempts `setDoc('/licenses/lic_fake', { ownerUid: uid, status: 'ACTIVE', plan: 'PRO_PERPETUAL' })` -> Denied (`allow write: if false`).
5. **Client Update to `/licenses/{licenseId}/devices/{deviceHash}`**: Authenticated user attempts to bind an extra PC seat directly -> Denied (`allow write: if false`).
6. **Cross-Tenant Company Read/Write**: User B attempts `getDoc` or `setDoc` on `/companies/cmp_<userA_uid>` -> Denied (`isTenantOwner` fails).
7. **Unverified Email Spoof Attack**: User with `email_verified: false` (even with matching email string) attempts to write `/users/{uid}` or `/companies/cmp_<uid>` -> Denied (`isVerifiedSignedIn()` requires `email_verified == true`).
8. **Self-Role Escalation on `/users/{uid}`**: `BILLING` or `VIEWER` user attempts `updateDoc('/users/<uid>', { role: 'ADMIN' })` -> Denied (`incoming().role == existing().role`).
9. **Ghost / Shadow Field Injection**: Owner sends `{ ..., isBypassEnabled: true }` on `/companies/cmp_<uid>` or `/users/{uid}` -> Denied (`data.keys().hasOnly(...)` & `affectedKeys().hasOnly(...)`).
10. **ID Poisoning / Path Traversal Payload**: Attacker writes `/companies/cmp_../etc/passwd` or 1.5KB junk `shardId` -> Denied (`isValidCompanyId` / `isValidId` regex + max length).
11. **Tier-2 Billing Role Privilege Creep**: `BILLING` member attempts to modify `company` details or `securityPin` on `/companies/cmp_<uid>` -> Denied (Tier 2 `affectedKeys().hasOnly(...)` restricts to shard manifest & sync metadata only).
12. **Blanket Query Scraping on `/licenses` or `/companies`**: Unauthenticated or cross-tenant `getDocs(collection(db, 'licenses'))` without `where('ownerUid', '==', uid)` -> Denied (`resource.data.ownerUid == request.auth.uid` on `list`, and `list: if false` on `/companies`, `/users`, `/members`).

## 3. Test Runner
See `firestore.rules.test.ts` for automated verification of all 12 adversarial payloads and valid accounting sync workflows against the Firestore Rules test harness.
