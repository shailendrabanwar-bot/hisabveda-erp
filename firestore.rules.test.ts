import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RULES_PATH = path.join(process.cwd(), 'firestore.rules');
const rulesText = fs.readFileSync(RULES_PATH, 'utf8');

test('Firestore rules enforce Global Default-Deny Safety Net and rules_version 2', () => {
  assert.ok(rulesText.includes("rules_version = '2';"));
  assert.match(
    rulesText,
    /match\s+\/\{document=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/
  );
});

test('Dirty Dozen #1-#3: Client cannot create or update license status, expiry, seats, or HWID on /companies/{companyId}', () => {
  // On create: !('license' in incoming()) must be required
  const companiesMatch = rulesText.slice(rulesText.indexOf('match /companies/{companyId}'));
  assert.ok(companiesMatch.includes("!('license' in incoming())"));

  // License must NOT be in Tier 1 or Tier 2 affectedKeys allowlists
  const tier1Block = companiesMatch.match(/Tier 1:[\s\S]*?affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
  assert.ok(tier1Block, 'Tier 1 affectedKeys block must exist');
  assert.equal(/'license'/.test(tier1Block[1]), false, "'license' must NOT be writable in Tier 1 update");

  const tier2Block = companiesMatch.match(/Tier 2:[\s\S]*?affectedKeys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
  assert.ok(tier2Block, 'Tier 2 affectedKeys block must exist');
  assert.equal(/'license'/.test(tier2Block[1]), false, "'license' must NOT be writable in Tier 2 update");

  // Update must explicitly assert incoming().license == existing().license when present
  assert.ok(companiesMatch.includes('incoming().license == existing().license'));
});

test('Dirty Dozen #4-#5 & #12: /licenses/{licenseId} and /devices/{deviceHash} block all client writes and enforce owner-scoped reads', () => {
  const licensesIdx = rulesText.indexOf('match /licenses/{licenseId}');
  assert.ok(licensesIdx !== -1, '/licenses/{licenseId} match block must exist');
  const licensesBlock = rulesText.slice(licensesIdx, rulesText.indexOf('match /users/{userId}'));

  assert.ok(licensesBlock.includes('allow create, update, delete: if false;'));
  assert.ok(licensesBlock.includes('existing().ownerUid == request.auth.uid'));
  assert.ok(licensesBlock.includes('match /devices/{deviceHash}'));
  assert.ok(licensesBlock.includes('isVerifiedSignedIn()'));
});

test('Dirty Dozen #6-#11: Enforces verified email, tenant isolation, role immutability, ID regex, and strict key allowlists', () => {
  assert.ok(rulesText.includes('function isVerifiedSignedIn()'));
  assert.ok(rulesText.includes('request.auth.token.email_verified == true'));
  assert.ok(rulesText.includes("companyId == ('cmp_' + request.auth.uid)"));
  assert.ok(rulesText.includes('incoming().role == existing().role'));
  assert.ok(rulesText.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));
  assert.ok(rulesText.includes('data.keys().hasAll('));
  assert.ok(rulesText.includes('data.keys().hasOnly('));
  assert.equal(/allow\s+list:\s*if\s+isSignedIn\(\)\s*;/.test(rulesText), false, 'Blanket list queries must never exist');
});
