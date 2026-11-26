import { Account, AppData, PartyMaster } from '../types';

/**
 * Generates a canonical normalized lookup key for Indian accounting ledgers & party names.
 * Handles common Tally / ERP variations such as:
 * - "M/s Sharma Traders A/c" vs "Sharma Traders" vs "Sharma  Traders (Dr)"
 * - "HDFC Bank Account" vs "HDFC Bank A/c"
 * - "Cash-in-Hand" vs "Cash in Hand" vs "Cash A/c"
 */
export function canonicalLedgerKey(name: string): string {
  let s = (name || '').toLowerCase().trim();
  if (!s) return '';

  // Remove trailing Dr/Cr markers in parentheses e.g. "(Dr)", "(Cr)"
  s = s.replace(/\(\s*(dr|cr|debit|credit)\s*\)/gi, ' ');

  // Remove common Indian business honorific prefixes
  s = s.replace(/^(m\/s\.?|ms\.?|mr\.?|mrs\.?|shri|smt\.?|late)\s+/i, '');

  // Normalize '&' -> 'and' and common corporate abbreviations
  s = s
    .replace(/&/g, ' and ')
    .replace(/\bprivate\s+limited\b/gi, 'pvtltd')
    .replace(/\bpvt\.?\s*ltd\.?\b/gi, 'pvtltd')
    .replace(/\blimited\b/gi, 'ltd')
    .replace(/\baccount\b|\baccounts\b|\ba\/c\b|\bacct\.?\b|\bledger\b/gi, ' ');

  // Canonical alias for primary Cash ledger variations
  const collapsed = s.replace(/[^a-z0-9]/g, '');
  if (collapsed === 'cashinhand' || collapsed === 'cash') {
    return 'cash';
  }
  return collapsed;
}

/**
 * Tokenizes a name after removing filler words for fuzzy similarity matching.
 */
function canonicalTokens(name: string): string[] {
  let s = (name || '').toLowerCase().trim();
  s = s.replace(/\(\s*(dr|cr|debit|credit)\s*\)/gi, ' ');
  s = s.replace(/^(m\/s\.?|ms\.?|mr\.?|mrs\.?|shri|smt\.?|late)\s+/i, '');
  s = s
    .replace(/&/g, ' and ')
    .replace(/\b(private|pvt|limited|ltd|llp|inc|co|company|account|accounts|a\/c|acct|ledger|the|and|in|hand)\b/gi, ' ');

  return s
    .split(/[^a-z0-9]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/**
 * Levenshtein distance for fuzzy name similarity checking.
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Computes similarity score [0..100] between two names.
 */
export function computeNameSimilarity(nameA: string, nameB: string): number {
  const keyA = canonicalLedgerKey(nameA);
  const keyB = canonicalLedgerKey(nameB);
  if (!keyA || !keyB) return 0;
  if (keyA === keyB) return 100;

  const tokA = canonicalTokens(nameA);
  const tokB = canonicalTokens(nameB);
  if (tokA.length > 0 && tokB.length > 0 && tokA.join('') === tokB.join('')) {
    return 98;
  }

  // Only perform edit-distance check on reasonably sized keys to prevent short-code false positives
  const maxLen = Math.max(keyA.length, keyB.length);
  if (maxLen < 6) return 0;

  const dist = levenshtein(keyA, keyB);
  const charScore = Math.round(((maxLen - dist) / maxLen) * 100);

  // Also check token overlap (order-independent e.g. "Traders Sharma" vs "Sharma Traders")
  if (tokA.length >= 2 && tokB.length >= 2 && tokA.length === tokB.length) {
    const sortedA = [...tokA].sort().join('|');
    const sortedB = [...tokB].sort().join('|');
    if (sortedA === sortedB) return 95;
  }

  return charScore;
}

export interface DuplicateLedgerCluster {
  clusterId: string;
  entityType: 'ACCOUNT' | 'PARTY';
  matchType: 'EXACT_NAME' | 'SIMILAR_NAME' | 'GSTIN_MATCH';
  confidence: number;
  reason: string;
  reasonHindi: string;
  primaryAccount?: Account;
  duplicateAccounts?: Account[];
  primaryParty?: PartyMaster;
  duplicateParties?: PartyMaster[];
  txCounts: Record<string, number>;
}

export interface DuplicateAuditReport {
  accountClusters: DuplicateLedgerCluster[];
  partyClusters: DuplicateLedgerCluster[];
  totalDuplicateRecords: number;
}

/**
 * Counts transaction references for each Account ID & Party ID so auto-merge keeps the most active ledger as primary.
 */
function buildUsageCountMaps(data: AppData): {
  accCounts: Map<string, number>;
  partyCounts: Map<string, number>;
} {
  const accCounts = new Map<string, number>();
  const partyCounts = new Map<string, number>();

  const bumpAcc = (id?: string) => {
    if (!id) return;
    accCounts.set(id, (accCounts.get(id) || 0) + 1);
  };
  const bumpParty = (id?: string) => {
    if (!id) return;
    partyCounts.set(id, (partyCounts.get(id) || 0) + 1);
  };

  (data.vouchers || []).forEach(v => {
    if (v.partyId) bumpParty(v.partyId);
    if (v.bankAccountId) bumpAcc(v.bankAccountId);
    (v.entries || []).forEach(e => bumpAcc(e.accountId));
  });
  (data.invoices || []).forEach(i => bumpParty(i.partyId));
  (data.purchaseInvoices || []).forEach(p => bumpParty(p.partyId));
  (data.purchaseOrders || []).forEach(po => bumpParty(po.partyId));
  (data.debitCreditNotes || []).forEach(n => bumpParty(n.partyId));
  (data.bankStatements || []).forEach(b => bumpAcc(b.allocatedAccountId));
  (data.budgets || []).forEach(b => bumpAcc(b.accountId));

  return { accCounts, partyCounts };
}

/**
 * Audits Chart of Accounts and Party Masters for exact and fuzzy duplicate ledgers.
 */
export function findDuplicateLedgersAndParties(data: AppData): DuplicateAuditReport {
  const { accCounts, partyCounts } = buildUsageCountMaps(data);

  // 1. Inspect Accounts
  const accounts = (data.accounts || []).filter(a => !a.isGroup);
  const visitedAccIds = new Set<string>();
  const accountClusters: DuplicateLedgerCluster[] = [];

  for (let i = 0; i < accounts.length; i++) {
    const base = accounts[i];
    if (visitedAccIds.has(base.id)) continue;

    const baseKey = canonicalLedgerKey(base.name);
    if (!baseKey) continue;

    const group: Array<{ acc: Account; score: number }> = [{ acc: base, score: 100 }];
    for (let j = i + 1; j < accounts.length; j++) {
      const cand = accounts[j];
      if (visitedAccIds.has(cand.id)) continue;

      // Only group duplicates sharing the same accounting category (prevents merging Sales Income with Sales Expense)
      if (cand.category !== base.category) continue;

      const sim = computeNameSimilarity(base.name, cand.name);
      if (sim >= 88) {
        group.push({ acc: cand, score: sim });
      }
    }

    if (group.length > 1) {
      group.forEach(g => visitedAccIds.add(g.acc.id));

      // Sort to select best primary ledger: System > Non-zero Opening > Higher Tx Usage > Shorter Clean Name
      const sorted = [...group].sort((a, b) => {
        if (Boolean(a.acc.isSystem) !== Boolean(b.acc.isSystem)) return a.acc.isSystem ? -1 : 1;
        const aTx = accCounts.get(a.acc.id) || 0;
        const bTx = accCounts.get(b.acc.id) || 0;
        if (aTx !== bTx) return bTx - aTx;
        const aOp = Math.abs(a.acc.openingBalance || 0) > 0 ? 1 : 0;
        const bOp = Math.abs(b.acc.openingBalance || 0) > 0 ? 1 : 0;
        if (aOp !== bOp) return bOp - aOp;
        return a.acc.name.length - b.acc.name.length;
      });

      const primary = sorted[0].acc;
      const dups = sorted.slice(1).map(s => s.acc);
      const minScore = Math.min(...sorted.slice(1).map(s => s.score));
      const isExact = minScore >= 98;

      const txCounts: Record<string, number> = {};
      sorted.forEach(s => {
        txCounts[s.acc.id] = accCounts.get(s.acc.id) || 0;
      });

      accountClusters.push({
        clusterId: `dup_acc_${primary.id}`,
        entityType: 'ACCOUNT',
        matchType: isExact ? 'EXACT_NAME' : 'SIMILAR_NAME',
        confidence: minScore,
        reason: isExact
          ? `Same ledger name/alias under ${primary.category} (${dups.map(d => `"${d.name}"`).join(', ')})`
          : `Similar spelling (${minScore}% match) under ${primary.category}: ${dups.map(d => `"${d.name}"`).join(', ')}`,
        reasonHindi: isExact
          ? `${primary.category} श्रेणी में समान नाम वाले लेज़र मिले (${dups.map(d => `"${d.name}"`).join(', ')})`
          : `${primary.category} श्रेणी में मिलते-जुलते नाम (${minScore}% मिलान): ${dups.map(d => `"${d.name}"`).join(', ')}`,
        primaryAccount: primary,
        duplicateAccounts: dups,
        txCounts
      });
    }
  }

  // 2. Inspect Parties (Customers & Vendors)
  const parties = data.parties || [];
  const visitedPartyIds = new Set<string>();
  const partyClusters: DuplicateLedgerCluster[] = [];

  for (let i = 0; i < parties.length; i++) {
    const base = parties[i];
    if (visitedPartyIds.has(base.id)) continue;

    const baseKey = canonicalLedgerKey(base.name);
    const baseGstin = (base.gstin || '').toUpperCase().trim();
    const hasValidBaseGstin = baseGstin.length === 15;

    const group: Array<{ party: PartyMaster; score: number; byGstin: boolean }> = [
      { party: base, score: 100, byGstin: false }
    ];

    for (let j = i + 1; j < parties.length; j++) {
      const cand = parties[j];
      if (visitedPartyIds.has(cand.id)) continue;

      const candGstin = (cand.gstin || '').toUpperCase().trim();
      const gstinMatch = hasValidBaseGstin && candGstin.length === 15 && candGstin === baseGstin;
      const sim = baseKey ? computeNameSimilarity(base.name, cand.name) : 0;

      // Do not falsely merge two parties with completely different valid 15-digit GSTINs
      if (!gstinMatch && hasValidBaseGstin && candGstin.length === 15 && candGstin !== baseGstin) {
        continue;
      }

      if (gstinMatch || sim >= 88) {
        group.push({ party: cand, score: gstinMatch ? 100 : sim, byGstin: gstinMatch });
      }
    }

    if (group.length > 1) {
      group.forEach(g => visitedPartyIds.add(g.party.id));

      const sorted = [...group].sort((a, b) => {
        const aG = (a.party.gstin || '').length === 15 ? 1 : 0;
        const bG = (b.party.gstin || '').length === 15 ? 1 : 0;
        if (aG !== bG) return bG - aG;
        const aTx = partyCounts.get(a.party.id) || 0;
        const bTx = partyCounts.get(b.party.id) || 0;
        if (aTx !== bTx) return bTx - aTx;
        const aOp = Math.abs(a.party.openingBalance || 0) > 0 ? 1 : 0;
        const bOp = Math.abs(b.party.openingBalance || 0) > 0 ? 1 : 0;
        if (aOp !== bOp) return bOp - aOp;
        return a.party.name.length - b.party.name.length;
      });

      const primary = sorted[0].party;
      const dups = sorted.slice(1).map(s => s.party);
      const anyGstin = sorted.some(s => s.byGstin);
      const minScore = Math.min(...sorted.slice(1).map(s => s.score));
      const isExact = minScore >= 98;

      const txCounts: Record<string, number> = {};
      sorted.forEach(s => {
        txCounts[s.party.id] = partyCounts.get(s.party.id) || 0;
      });

      partyClusters.push({
        clusterId: `dup_pty_${primary.id}`,
        entityType: 'PARTY',
        matchType: anyGstin ? 'GSTIN_MATCH' : isExact ? 'EXACT_NAME' : 'SIMILAR_NAME',
        confidence: anyGstin ? 100 : minScore,
        reason: anyGstin
          ? `Same 15-digit GSTIN (${primary.gstin}) across ${sorted.length} parties`
          : isExact
          ? `Exact canonical party name match (${dups.map(d => `"${d.name}"`).join(', ')})`
          : `Similar party spelling (${minScore}% match): ${dups.map(d => `"${d.name}"`).join(', ')}`,
        reasonHindi: anyGstin
          ? `एक ही GSTIN (${primary.gstin}) पर ${sorted.length} डुप्लीकेट पार्टी मिलीं`
          : isExact
          ? `समान नाम वाली डुप्लीकेट पार्टी (${dups.map(d => `"${d.name}"`).join(', ')})`
          : `मिलते-जुलते पार्टी नाम (${minScore}% मिलान): ${dups.map(d => `"${d.name}"`).join(', ')}`,
        primaryParty: primary,
        duplicateParties: dups,
        txCounts
      });
    }
  }

  const totalDuplicateRecords =
    accountClusters.reduce((s, c) => s + (c.duplicateAccounts?.length || 0), 0) +
    partyClusters.reduce((s, c) => s + (c.duplicateParties?.length || 0), 0);

  return {
    accountClusters,
    partyClusters,
    totalDuplicateRecords
  };
}

export interface MergeDuplicatesResult {
  updatedData: AppData;
  mergedAccountsCount: number;
  mergedPartiesCount: number;
  relinkedEntriesCount: number;
}

/**
 * Merges duplicate Accounts & Parties cleanly, re-pointing all invoices, purchases, vouchers,
 * debit/credit notes, bank statements, and budgets to the surviving primary master record.
 */
export function mergeDuplicateLedgersAndParties(
  data: AppData,
  selectedClusterIds?: string[],
  balanceStrategy: 'KEEP_PRIMARY_OR_NONZERO' | 'SUM' = 'KEEP_PRIMARY_OR_NONZERO'
): MergeDuplicatesResult {
  const report = findDuplicateLedgersAndParties(data);
  const filterSet = selectedClusterIds && selectedClusterIds.length > 0 ? new Set(selectedClusterIds) : null;

  const targetAccClusters = report.accountClusters.filter(c => !filterSet || filterSet.has(c.clusterId));
  const targetPartyClusters = report.partyClusters.filter(c => !filterSet || filterSet.has(c.clusterId));

  const accRedirect = new Map<string, Account>();
  const removedAccIds = new Set<string>();
  const mergedPrimaryAccUpdates = new Map<string, Account>();

  for (const cluster of targetAccClusters) {
    if (!cluster.primaryAccount || !cluster.duplicateAccounts?.length) continue;
    let primary = { ...cluster.primaryAccount };

    let signedBal = primary.balanceType === 'CR' ? -(primary.openingBalance || 0) : (primary.openingBalance || 0);
    for (const dup of cluster.duplicateAccounts) {
      removedAccIds.add(dup.id);
      if (!primary.accountNumber && dup.accountNumber) {
        primary.accountNumber = dup.accountNumber;
      }
      if (!primary.externalGuid && dup.externalGuid) {
        primary.externalGuid = dup.externalGuid;
      }
      const dupSigned = dup.balanceType === 'CR' ? -(dup.openingBalance || 0) : (dup.openingBalance || 0);
      if (balanceStrategy === 'SUM') {
        signedBal += dupSigned;
      } else if (Math.abs(signedBal) < 0.01 && Math.abs(dupSigned) > 0.01) {
        signedBal = dupSigned;
      }
    }

    primary.openingBalance = Math.round(Math.abs(signedBal) * 100) / 100;
    primary.balanceType = signedBal >= 0 ? 'DR' : 'CR';
    mergedPrimaryAccUpdates.set(primary.id, primary);

    for (const dup of cluster.duplicateAccounts) {
      accRedirect.set(dup.id, primary);
    }
  }

  const partyRedirect = new Map<string, PartyMaster>();
  const removedPartyIds = new Set<string>();
  const mergedPrimaryPartyUpdates = new Map<string, PartyMaster>();

  for (const cluster of targetPartyClusters) {
    if (!cluster.primaryParty || !cluster.duplicateParties?.length) continue;
    let primary = { ...cluster.primaryParty };

    let signedBal = primary.balanceType === 'CR' ? -(primary.openingBalance || 0) : (primary.openingBalance || 0);
    for (const dup of cluster.duplicateParties) {
      removedPartyIds.add(dup.id);
      if (!primary.gstin && dup.gstin) primary.gstin = dup.gstin;
      if (!primary.pan && dup.pan) primary.pan = dup.pan;
      if (!primary.email && dup.email) primary.email = dup.email;
      if (!primary.phone && dup.phone) primary.phone = dup.phone;
      if (!primary.address && dup.address) primary.address = dup.address;
      if (!primary.pincode && dup.pincode) primary.pincode = dup.pincode;
      if (!primary.legalName && dup.legalName) primary.legalName = dup.legalName;
      if (!primary.tradeName && dup.tradeName) primary.tradeName = dup.tradeName;
      if (!primary.externalGuid && dup.externalGuid) primary.externalGuid = dup.externalGuid;
      if (primary.type !== dup.type) primary.type = 'BOTH';

      const dupSigned = dup.balanceType === 'CR' ? -(dup.openingBalance || 0) : (dup.openingBalance || 0);
      if (balanceStrategy === 'SUM') {
        signedBal += dupSigned;
      } else if (Math.abs(signedBal) < 0.01 && Math.abs(dupSigned) > 0.01) {
        signedBal = dupSigned;
      }
    }

    primary.openingBalance = Math.round(Math.abs(signedBal) * 100) / 100;
    primary.balanceType = signedBal >= 0 ? 'DR' : 'CR';
    if ('openingBalanceType' in primary) {
      primary.openingBalanceType = primary.balanceType;
    }
    mergedPrimaryPartyUpdates.set(primary.id, primary);

    for (const dup of cluster.duplicateParties) {
      partyRedirect.set(dup.id, primary);
    }
  }

  let relinkedEntriesCount = 0;

  // Build name fallback map for old vouchers that matched by name or legacy ID
  const dupAccByName = new Map<string, Account>();
  targetAccClusters.forEach(c => {
    const updatedPrimary = c.primaryAccount ? mergedPrimaryAccUpdates.get(c.primaryAccount.id) : undefined;
    if (!updatedPrimary) return;
    c.duplicateAccounts?.forEach(d => {
      dupAccByName.set(d.name.toLowerCase().trim(), updatedPrimary);
    });
  });

  const dupPartyByName = new Map<string, PartyMaster>();
  targetPartyClusters.forEach(c => {
    const updatedPrimary = c.primaryParty ? mergedPrimaryPartyUpdates.get(c.primaryParty.id) : undefined;
    if (!updatedPrimary) return;
    c.duplicateParties?.forEach(d => {
      dupPartyByName.set(d.name.toLowerCase().trim(), updatedPrimary);
    });
  });

  const resolveNewParty = (pId?: string, pName?: string): PartyMaster | undefined => {
    if (pId && partyRedirect.has(pId)) {
      const target = partyRedirect.get(pId)!;
      return mergedPrimaryPartyUpdates.get(target.id) || target;
    }
    if (pName && dupPartyByName.has(pName.toLowerCase().trim())) {
      return dupPartyByName.get(pName.toLowerCase().trim());
    }
    return undefined;
  };

  const resolveNewAccount = (aId?: string, aName?: string): Account | undefined => {
    if (aId && accRedirect.has(aId)) {
      const target = accRedirect.get(aId)!;
      return mergedPrimaryAccUpdates.get(target.id) || target;
    }
    if (aName && dupAccByName.has(aName.toLowerCase().trim())) {
      return dupAccByName.get(aName.toLowerCase().trim());
    }
    return undefined;
  };

  const nextAccounts = (data.accounts || [])
    .filter(a => !removedAccIds.has(a.id))
    .map(a => mergedPrimaryAccUpdates.get(a.id) || a);

  const nextParties = (data.parties || [])
    .filter(p => !removedPartyIds.has(p.id))
    .map(p => mergedPrimaryPartyUpdates.get(p.id) || p);

  const nextVouchers = (data.vouchers || []).map(v => {
    let changed = false;
    let nextBankAccountId = v.bankAccountId;
    const bankTarget = resolveNewAccount(v.bankAccountId);
    if (bankTarget) {
      nextBankAccountId = bankTarget.id;
      changed = true;
    }

    let nextPartyId = v.partyId;
    let nextPartyName = v.partyName;
    const partyTarget = resolveNewParty(v.partyId, v.partyName);
    if (partyTarget) {
      nextPartyId = partyTarget.id;
      nextPartyName = partyTarget.name;
      changed = true;
    }

    const nextEntries = (v.entries || []).map(e => {
      const accTarget = resolveNewAccount(e.accountId, e.accountName);
      if (accTarget) {
        relinkedEntriesCount++;
        changed = true;
        return {
          ...e,
          accountId: accTarget.id,
          accountCode: accTarget.code,
          accountName: accTarget.name
        };
      }
      return e;
    });

    if (!changed) return v;
    return {
      ...v,
      ...(nextBankAccountId ? { bankAccountId: nextBankAccountId } : {}),
      ...(nextPartyId ? { partyId: nextPartyId } : {}),
      ...(nextPartyName ? { partyName: nextPartyName } : {}),
      entries: nextEntries
    };
  });

  const nextInvoices = (data.invoices || []).map(inv => {
    const partyTarget = resolveNewParty(inv.partyId, inv.partyName);
    if (!partyTarget) return inv;
    relinkedEntriesCount++;
    return {
      ...inv,
      partyId: partyTarget.id,
      partyName: partyTarget.name,
      ...(partyTarget.gstin ? { partyGstin: partyTarget.gstin } : {})
    };
  });

  const nextPurchases = (data.purchaseInvoices || []).map(pur => {
    const partyTarget = resolveNewParty(pur.partyId, pur.partyName);
    if (!partyTarget) return pur;
    relinkedEntriesCount++;
    return {
      ...pur,
      partyId: partyTarget.id,
      partyName: partyTarget.name,
      ...(partyTarget.gstin ? { partyGstin: partyTarget.gstin } : {})
    };
  });

  const nextPOs = (data.purchaseOrders || []).map(po => {
    const partyTarget = resolveNewParty(po.partyId, po.partyName);
    if (!partyTarget) return po;
    relinkedEntriesCount++;
    return {
      ...po,
      partyId: partyTarget.id,
      partyName: partyTarget.name,
      ...(partyTarget.gstin ? { partyGstin: partyTarget.gstin } : {})
    };
  });

  const nextNotes = (data.debitCreditNotes || []).map(note => {
    const partyTarget = resolveNewParty(note.partyId, note.partyName);
    if (!partyTarget) return note;
    relinkedEntriesCount++;
    return {
      ...note,
      partyId: partyTarget.id,
      partyName: partyTarget.name,
      ...(partyTarget.gstin ? { partyGstin: partyTarget.gstin } : {})
    };
  });

  const nextStatements = (data.bankStatements || []).map(st => {
    const accTarget = resolveNewAccount(st.allocatedAccountId, st.allocatedAccountName);
    if (!accTarget) return st;
    relinkedEntriesCount++;
    return {
      ...st,
      allocatedAccountId: accTarget.id,
      allocatedAccountName: accTarget.name
    };
  });

  const nextBudgets = (data.budgets || []).map(b => {
    const accTarget = resolveNewAccount(b.accountId, b.accountName);
    if (!accTarget) return b;
    relinkedEntriesCount++;
    return {
      ...b,
      accountId: accTarget.id,
      accountName: accTarget.name
    };
  });

  return {
    updatedData: {
      ...data,
      accounts: nextAccounts,
      parties: nextParties,
      vouchers: nextVouchers,
      invoices: nextInvoices,
      purchaseInvoices: nextPurchases,
      purchaseOrders: nextPOs,
      debitCreditNotes: nextNotes,
      bankStatements: nextStatements,
      budgets: nextBudgets
    },
    mergedAccountsCount: removedAccIds.size,
    mergedPartiesCount: removedPartyIds.size,
    relinkedEntriesCount
  };
}
