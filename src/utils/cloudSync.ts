import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  auth,
  db,
  buildFirestoreErrorInfo,
  OperationType,
  isFirestoreQuotaError,
  isFirestoreQuotaPaused,
  pauseFirestoreForQuota,
} from '../lib/firebase';
import { AppData, UserProfile } from '../types';
import { getStorageMode, saveAppData } from './storage';

export type CloudSyncStatus = 'connected' | 'syncing' | 'offline' | 'local' | 'error';

export { OperationType as FirestoreOperationType };
export type { FirestoreErrorInfo } from '../lib/firebase';

export function logFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  if (isFirestoreQuotaError(error)) {
    void pauseFirestoreForQuota();
  }
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

// Unique device/browser session ID to avoid infinite self-echo loops
const DEVICE_SESSION_ID =
  typeof window !== 'undefined'
    ? sessionStorage.getItem('sna_device_session_id') ||
      (() => {
        const id = 'dev_' + Math.random().toString(36).substring(2, 9);
        sessionStorage.setItem('sna_device_session_id', id);
        return id;
      })()
    : 'dev_server';

export const SHARDED_COLLECTION_KEYS = [
  'invoices',
  'vouchers',
  'parties',
  'items',
  'accounts',
  'purchaseInvoices',
  'purchaseOrders',
  'debitCreditNotes',
  'bankStatements',
  'employees',
  'payrolls',
  'budgets',
  'stockAdjustments',
  'godowns',
  'itemBatches',
  'stockTransfers',
  'auditLogs',
  'companiesList',
  'companiesStores',
] as const;

export type ShardedCollectionKey = (typeof SHARDED_COLLECTION_KEYS)[number];

const MAX_ITEMS_PER_SHARD = 150;
const MAX_SHARD_BYTES = 480_000; // Strict margin far below Firestore 1 MB (1,048,576 B) limit
const MAX_BATCH_OPS = 380; // Safely below Firestore 500 write-batch op limit

let lastPushedTimestamp = 0;
let isApplyingRemoteChange = false;

// Incremental diff caches keyed by companyId
const lastPushedShardHashes = new Map<string, Map<string, string>>();
const lastPushedShardManifest = new Map<string, Record<string, number>>();
const lastPushedHeaderHashes = new Map<string, string>();
let lastSyncedMemberSignature = '';

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

function utf8ByteLength(str: string): number {
  if (textEncoder) return textEncoder.encode(str).length;
  return new Blob([str]).size;
}

function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${input.length}_${(h >>> 0).toString(36)}`;
}

function sanitizeForFirestore<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function sanitizeUserProfiles(profiles?: UserProfile[]): UserProfile[] {
  if (!Array.isArray(profiles)) return [];
  return profiles.slice(0, 200).map((u) => {
    const clean: UserProfile = {
      id: String(u.id || '').slice(0, 128),
      name: String(u.name || '').slice(0, 120),
      role: u.role,
      email: String(u.email || '').slice(0, 200),
      pin: String(u.pin || '').slice(0, 10),
      ...(u.permissions ? { permissions: u.permissions } : {}),
      ...(u.companyId ? { companyId: String(u.companyId).slice(0, 140) } : {}),
    };
    return clean;
  });
}

function sanitizeCompanyHeader(company: AppData['company'], companyId: string) {
  const cloned = sanitizeForFirestore({ ...company, id: companyId });
  // Keep company logo bounded so root metadata doc stays compact (< 250 KB)
  if (typeof cloned.logoUrl === 'string' && cloned.logoUrl.length > 180_000) {
    cloned.logoUrl = '';
  }
  return cloned;
}

interface CompanyStoreShardEntry {
  storeKey: string;
  field: string; // '__FULL__' or specific sub-array key when a company store is very large
  chunkIndex: number;
  data: any;
}

function flattenCompaniesStores(
  stores?: { [companyId: string]: Partial<AppData> }
): CompanyStoreShardEntry[] {
  if (!stores || typeof stores !== 'object') return [];
  const result: CompanyStoreShardEntry[] = [];

  for (const [storeKey, storeVal] of Object.entries(stores)) {
    if (!storeVal || typeof storeVal !== 'object') continue;
    const cleanStore = sanitizeForFirestore(storeVal);
    const serialized = JSON.stringify(cleanStore);
    if (utf8ByteLength(serialized) <= 320_000) {
      result.push({ storeKey, field: '__FULL__', chunkIndex: 0, data: cleanStore });
    } else {
      // Split large archived company stores by array field & slices so every shard fits well under MAX_SHARD_BYTES
      const scalarFields: Record<string, any> = {};
      for (const [k, v] of Object.entries(cleanStore)) {
        if (Array.isArray(v)) {
          for (let i = 0; i < v.length; i += 100) {
            result.push({
              storeKey,
              field: k,
              chunkIndex: Math.floor(i / 100),
              data: v.slice(i, i + 100),
            });
          }
        } else {
          scalarFields[k] = v;
        }
      }
      if (Object.keys(scalarFields).length > 0) {
        result.push({ storeKey, field: '__SCALARS__', chunkIndex: 0, data: scalarFields });
      }
    }
  }
  return result;
}

function rebuildCompaniesStores(
  entries: CompanyStoreShardEntry[]
): { [companyId: string]: Partial<AppData> } {
  const rebuilt: { [companyId: string]: Partial<AppData> } = {};
  for (const entry of entries) {
    if (!entry || !entry.storeKey) continue;
    if (entry.field === '__FULL__') {
      rebuilt[entry.storeKey] = entry.data || {};
    } else if (entry.field === '__SCALARS__') {
      rebuilt[entry.storeKey] = {
        ...(rebuilt[entry.storeKey] || {}),
        ...(entry.data || {}),
      };
    } else {
      const target = (rebuilt[entry.storeKey] = rebuilt[entry.storeKey] || {});
      const prevArr = Array.isArray((target as any)[entry.field]) ? (target as any)[entry.field] : [];
      const addArr = Array.isArray(entry.data) ? entry.data : [];
      (target as any)[entry.field] = [...prevArr, ...addArr];
    }
  }
  return rebuilt;
}

function buildShardsForCollection(
  collectionKey: ShardedCollectionKey,
  rawItems: any[]
): { shardId: string; shardIndex: number; items: any[]; jsonString: string }[] {
  if (!Array.isArray(rawItems) || rawItems.length === 0) return [];

  const shards: { shardId: string; shardIndex: number; items: any[]; jsonString: string }[] = [];
  let currentChunk: any[] = [];
  let currentBytes = 2; // '[]'

  const flushChunk = () => {
    if (currentChunk.length === 0) return;
    const shardIndex = shards.length;
    const shardId = `${collectionKey}_${String(shardIndex).padStart(4, '0')}`;
    const jsonString = JSON.stringify(currentChunk);
    shards.push({ shardId, shardIndex, items: currentChunk, jsonString });
    currentChunk = [];
    currentBytes = 2;
  };

  for (const rawItem of rawItems) {
    const cleanItem = sanitizeForFirestore(rawItem);
    const itemJson = JSON.stringify(cleanItem);
    const itemBytes = utf8ByteLength(itemJson) + 1;

    // Guard against hitting either item count limit or 480 KB byte limit
    if (
      currentChunk.length > 0 &&
      (currentChunk.length >= MAX_ITEMS_PER_SHARD || currentBytes + itemBytes > MAX_SHARD_BYTES)
    ) {
      flushChunk();
    }

    currentChunk.push(cleanItem);
    currentBytes += itemBytes;
  }

  flushChunk();
  return shards;
}

function getCollectionSourceArray(data: AppData, key: ShardedCollectionKey): any[] {
  if (key === 'companiesStores') {
    return flattenCompaniesStores(data.companiesStores);
  }
  const val = (data as any)[key];
  return Array.isArray(val) ? val : [];
}

export interface CloudSyncDiagnostics {
  rootHeaderKB: number;
  totalDatasetKB: number;
  shardCount: number;
  largestShardKB: number;
  isShardedArchitecture: boolean;
}

export function getCloudSyncDiagnostics(data: AppData): CloudSyncDiagnostics {
  try {
    const headerSample = {
      company: data.company,
      accountGroups: data.accountGroups || [],
      license: data.license || null,
      userProfiles: sanitizeUserProfiles(data.userProfiles),
      gstPortalData: data.gstPortalData || {},
      softwareVersion: data.softwareVersion || 'v2.4.2',
    };
    const rootHeaderBytes = utf8ByteLength(JSON.stringify(headerSample));

    let shardCount = 0;
    let totalBytes = rootHeaderBytes;
    let largestShardBytes = 0;

    for (const key of SHARDED_COLLECTION_KEYS) {
      const source = getCollectionSourceArray(data, key);
      const shards = buildShardsForCollection(key, source);
      shardCount += shards.length;
      for (const s of shards) {
        const b = utf8ByteLength(s.jsonString);
        totalBytes += b;
        if (b > largestShardBytes) largestShardBytes = b;
      }
    }

    return {
      rootHeaderKB: Math.ceil(rootHeaderBytes / 1024),
      totalDatasetKB: Math.ceil(totalBytes / 1024),
      shardCount,
      largestShardKB: Math.ceil(largestShardBytes / 1024),
      isShardedArchitecture: true,
    };
  } catch {
    return {
      rootHeaderKB: 0,
      totalDatasetKB: 0,
      shardCount: 0,
      largestShardKB: 0,
      isShardedArchitecture: true,
    };
  }
}

export function estimateCloudPayloadSizeKB(data: AppData): number {
  return getCloudSyncDiagnostics(data).totalDatasetKB;
}

function assembleAppDataFromShardsAndHeader(
  targetCompanyId: string,
  headerData: Record<string, any>,
  shardDocs: Array<Record<string, any>>
): AppData {
  const isV2Sharded = Number(headerData.syncSchemaVersion || 0) >= 2 || shardDocs.length > 0;

  if (!isV2Sharded) {
    // Legacy v1 single-document fallback (100% backward compatible)
    return {
      company: { ...(headerData.company || { name: 'Hisab Veda Enterprise' }), id: targetCompanyId },
      invoices: headerData.invoices || [],
      vouchers: headerData.vouchers || [],
      parties: headerData.parties || [],
      items: headerData.items || [],
      accounts: headerData.accounts || [],
      accountGroups: headerData.accountGroups || [],
      purchaseInvoices: headerData.purchaseInvoices || [],
      purchaseOrders: headerData.purchaseOrders || [],
      debitCreditNotes: headerData.debitCreditNotes || [],
      stockAdjustments: headerData.stockAdjustments || [],
      bankStatements: headerData.bankStatements || [],
      employees: headerData.employees || [],
      payrolls: headerData.payrolls || [],
      budgets: headerData.budgets || [],
      godowns: headerData.godowns || undefined,
      itemBatches: headerData.itemBatches || [],
      stockTransfers: headerData.stockTransfers || [],
      gstPortalData: headerData.gstPortalData || {},
      auditLogs: headerData.auditLogs || [],
      companiesList: headerData.companiesList || undefined,
      companiesStores: headerData.companiesStores || undefined,
      license: headerData.license || undefined,
      userProfiles: headerData.userProfiles || undefined,
      pinRequired: Boolean(headerData.pinRequired),
      securityPin: headerData.securityPin ?? '',
      softwareVersion: headerData.softwareVersion || 'v2.4.2',
      standardLedgersSeeded: headerData.standardLedgersSeeded,
      syncSchemaVersion: 1,
    };
  }

  // Group and sort shards strictly by collectionKey & shardIndex
  const grouped = new Map<string, Array<{ shardIndex: number; items: any[] }>>();
  for (const shard of shardDocs) {
    const key = String(shard.collectionKey || '');
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push({
      shardIndex: Number(shard.shardIndex || 0),
      items: Array.isArray(shard.items) ? shard.items : [],
    });
    grouped.set(key, list);
  }

  const readShardedArray = (key: ShardedCollectionKey): any[] => {
    const bucket = grouped.get(key);
    if (!bucket || bucket.length === 0) {
      // Fallback to inline legacy field if that specific key wasn't sharded yet
      return Array.isArray(headerData[key]) ? headerData[key] : [];
    }
    bucket.sort((a, b) => a.shardIndex - b.shardIndex);
    const merged: any[] = [];
    for (const part of bucket) {
      merged.push(...part.items);
    }
    return merged;
  };

  const storeEntries = readShardedArray('companiesStores') as CompanyStoreShardEntry[];
  const rebuiltStores =
    storeEntries.length > 0
      ? rebuildCompaniesStores(storeEntries)
      : headerData.companiesStores || undefined;

  const companiesList = readShardedArray('companiesList');

  return {
    company: { ...(headerData.company || { name: 'Hisab Veda Enterprise' }), id: targetCompanyId },
    invoices: readShardedArray('invoices'),
    vouchers: readShardedArray('vouchers'),
    parties: readShardedArray('parties'),
    items: readShardedArray('items'),
    accounts: readShardedArray('accounts'),
    accountGroups: headerData.accountGroups || [],
    purchaseInvoices: readShardedArray('purchaseInvoices'),
    purchaseOrders: readShardedArray('purchaseOrders'),
    debitCreditNotes: readShardedArray('debitCreditNotes'),
    stockAdjustments: readShardedArray('stockAdjustments'),
    bankStatements: readShardedArray('bankStatements'),
    employees: readShardedArray('employees'),
    payrolls: readShardedArray('payrolls'),
    budgets: readShardedArray('budgets'),
    godowns: readShardedArray('godowns'),
    itemBatches: readShardedArray('itemBatches'),
    stockTransfers: readShardedArray('stockTransfers'),
    auditLogs: readShardedArray('auditLogs'),
    companiesList: companiesList.length > 0 ? companiesList : undefined,
    companiesStores: rebuiltStores,
    gstPortalData: headerData.gstPortalData || {},
    license: headerData.license || undefined,
    userProfiles: headerData.userProfiles || undefined,
    pinRequired: Boolean(headerData.pinRequired),
    securityPin: headerData.securityPin ?? '',
    softwareVersion: headerData.softwareVersion || 'v2.4.2',
    standardLedgersSeeded: headerData.standardLedgersSeeded,
    syncSchemaVersion: 2,
  };
}

function buildStableHeaderSignature(data: AppData, companyId: string, manifest: Record<string, number>): string {
  return hashString(
    JSON.stringify({
      companyId,
      shardManifest: manifest,
      company: sanitizeCompanyHeader(data.company, companyId),
      accountGroups: sanitizeForFirestore(data.accountGroups || []).slice(0, 1000),
      userProfiles: sanitizeUserProfiles(data.userProfiles),
      gstPortalData: sanitizeForFirestore(data.gstPortalData || {}),
      pinRequired: Boolean(data.pinRequired),
      securityPin: String(data.securityPin || '').slice(0, 20),
      softwareVersion: String(data.softwareVersion || 'v2.4.2').slice(0, 30),
      standardLedgersSeeded: Boolean(data.standardLedgersSeeded),
    })
  );
}

function primeSyncCachesFromAppData(companyId: string, assembled: AppData, remoteHeaderData?: Record<string, any>) {
  const seededHashes = new Map<string, string>();
  const seededManifest: Record<string, number> = {};
  for (const collectionKey of SHARDED_COLLECTION_KEYS) {
    const sourceArr = getCollectionSourceArray(assembled, collectionKey);
    const shards = buildShardsForCollection(collectionKey, sourceArr);
    seededManifest[collectionKey] = shards.length;
    for (const shard of shards) {
      seededHashes.set(shard.shardId, hashString(shard.jsonString));
    }
  }
  lastPushedShardHashes.set(companyId, seededHashes);
  lastPushedShardManifest.set(
    companyId,
    remoteHeaderData?.shardManifest && typeof remoteHeaderData.shardManifest === 'object'
      ? remoteHeaderData.shardManifest
      : seededManifest
  );
  lastPushedHeaderHashes.set(companyId, buildStableHeaderSignature(assembled, companyId, seededManifest));
}

/**
 * Pushes the authenticated user's company dataset to Firestore using bounded Sub-Collection Shards
 * (`/companies/{companyId}/dataShards/{shardId}`), eliminating the 1 MB single-document limit.
 */
export async function pushAppDataToCloud(data: AppData): Promise<boolean> {
  if (isApplyingRemoteChange) return false;
  if (isFirestoreQuotaPaused()) return false;

  const currentUser = auth.currentUser;
  if (!currentUser) return false;

  // Firestore security rules strictly require verified email for all cloud writes
  if (!currentUser.emailVerified) {
    return false;
  }

  if (getStorageMode(currentUser.uid) === 'local') {
    return false;
  }

  const companyId = `cmp_${currentUser.uid}`;
  let currentWritePath = `companies/${companyId}`;
  const docRef = doc(db, 'companies', companyId);

  try {
    const now = Date.now();
    const nowIso = new Date().toISOString();
    lastPushedTimestamp = now;

    // 1. Ensure company membership/role doc exists for owner/member verification in Firestore rules
    // Tenant owner (cmp_<uid>) must retain ADMIN privileges on their own Firestore workspace
    const activeOperator = data.activeUser;
    const ownerMemberRole = 'ADMIN';
    const memberEmail = String(currentUser.email || activeOperator?.email || '').slice(0, 200);
    const memberName = String(currentUser.displayName || activeOperator?.name || 'Administrator').slice(0, 120);
    const memberSig = `${currentUser.uid}:${ownerMemberRole}:${memberEmail}`;
    if (memberSig !== lastSyncedMemberSignature) {
      currentWritePath = `companies/${companyId}/members/${currentUser.uid}`;
      const memberRef = doc(db, 'companies', companyId, 'members', currentUser.uid);
      await setDoc(memberRef, {
        uid: currentUser.uid,
        companyId,
        email: memberEmail,
        name: memberName,
        role: ownerMemberRole,
        updatedAtMs: now,
        updatedAtIso: nowIso,
      });
      lastSyncedMemberSignature = memberSig;
    }

    // 2. Build all shards cleanly and diff against cached hashes
    const prevHashMap = lastPushedShardHashes.get(companyId) || new Map<string, string>();
    const prevManifest = lastPushedShardManifest.get(companyId) || {};
    const nextHashMap = new Map<string, string>();
    const nextManifest: Record<string, number> = {};

    type PendingWriteOp =
      | { type: 'set'; shardId: string; payload: Record<string, any> }
      | { type: 'delete'; shardId: string };

    const pendingOps: PendingWriteOp[] = [];

    for (const collectionKey of SHARDED_COLLECTION_KEYS) {
      const sourceArr = getCollectionSourceArray(data, collectionKey);
      const shards = buildShardsForCollection(collectionKey, sourceArr);
      nextManifest[collectionKey] = shards.length;

      for (const shard of shards) {
        const shardHash = hashString(shard.jsonString);
        nextHashMap.set(shard.shardId, shardHash);
        if (prevHashMap.get(shard.shardId) !== shardHash) {
          pendingOps.push({
            type: 'set',
            shardId: shard.shardId,
            payload: {
              id: shard.shardId,
              companyId,
              ownerUid: currentUser.uid,
              collectionKey,
              shardIndex: shard.shardIndex,
              items: shard.items,
              itemCount: shard.items.length,
              updatedAtMs: now,
              updatedAtIso: nowIso,
            },
          });
        }
      }

      // Clean up orphaned trailing shards when collection shrinks
      const prevCount = prevManifest[collectionKey] || 0;
      if (prevCount > shards.length) {
        for (let idx = shards.length; idx < prevCount; idx++) {
          const staleShardId = `${collectionKey}_${String(idx).padStart(4, '0')}`;
          pendingOps.push({ type: 'delete', shardId: staleShardId });
        }
      }
    }

    const headerHash = buildStableHeaderSignature(data, companyId, nextManifest);
    const headerChanged = lastPushedHeaderHashes.get(companyId) !== headerHash;

    // Skip redundant cloud roundtrip completely when neither shards nor header changed
    if (pendingOps.length === 0 && !headerChanged) {
      return true;
    }

    // 3. Commit dirty/deleted shards first in bounded writeBatch chunks (max 380 ops/batch)
    currentWritePath = `companies/${companyId}/dataShards`;
    for (let i = 0; i < pendingOps.length; i += MAX_BATCH_OPS) {
      const slice = pendingOps.slice(i, i + MAX_BATCH_OPS);
      const batch = writeBatch(db);
      for (const op of slice) {
        const shardRef = doc(db, 'companies', companyId, 'dataShards', op.shardId);
        if (op.type === 'set') {
          batch.set(shardRef, op.payload);
        } else {
          batch.delete(shardRef);
        }
      }
      await batch.commit();
    }

    // Update incremental diff cache only after shards succeed
    lastPushedShardHashes.set(companyId, nextHashMap);
    lastPushedShardManifest.set(companyId, nextManifest);

    // 4. Write lightweight root company header (license field is excluded per hardened firestore.rules)
    if (headerChanged || pendingOps.length > 0) {
      currentWritePath = `companies/${companyId}`;
      const headerPayload = {
        companyId,
        ownerUid: currentUser.uid,
        syncSchemaVersion: 2,
        shardManifest: nextManifest,
        company: sanitizeCompanyHeader(data.company, companyId),
        accountGroups: sanitizeForFirestore(data.accountGroups || []).slice(0, 1000),
        userProfiles: sanitizeUserProfiles(data.userProfiles),
        gstPortalData: sanitizeForFirestore(data.gstPortalData || {}),
        pinRequired: Boolean(data.pinRequired),
        securityPin: String(data.securityPin || '').slice(0, 20),
        softwareVersion: String(data.softwareVersion || 'v2.4.2').slice(0, 30),
        standardLedgersSeeded: Boolean(data.standardLedgersSeeded),
        updatedAtMs: now,
        updatedAtIso: nowIso,
        updatedByDevice: DEVICE_SESSION_ID.slice(0, 64),
        serverTime: serverTimestamp(),
      };

      await setDoc(docRef, headerPayload, { merge: true });
      lastPushedHeaderHashes.set(companyId, headerHash);
    }
    return true;
  } catch (error) {
    logFirestoreError(error, OperationType.WRITE, currentWritePath);
    return false;
  }
}

async function fetchShardsForCompany(companyId: string): Promise<Array<Record<string, any>>> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) return [];
  const shardsPath = `companies/${companyId}/dataShards`;
  try {
    const q = query(
      collection(db, 'companies', companyId, 'dataShards'),
      where('ownerUid', '==', currentUid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data());
  } catch (error) {
    logFirestoreError(error, OperationType.LIST, shardsPath);
    return [];
  }
}

/**
 * Subscribes to real-time changes from Firestore scoped strictly to the signed-in user's company.
 */
export function subscribeToCloudSync(
  companyId: string,
  onRemoteUpdate: (newData: AppData) => void,
  onStatusChange: (status: CloudSyncStatus, lastSyncTime?: string) => void
): () => void {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    onStatusChange('offline');
    return () => {};
  }

  if (getStorageMode(currentUser.uid) === 'local' || !currentUser.emailVerified) {
    onStatusChange('local');
    return () => {};
  }

  if (isFirestoreQuotaPaused()) {
    onStatusChange('error');
    return () => {};
  }

  const targetCompanyId = `cmp_${currentUser.uid}`;
  const docPath = `companies/${targetCompanyId}`;
  const docRef = doc(db, 'companies', targetCompanyId);

  onStatusChange('syncing');

  const unsubscribe = onSnapshot(
    docRef,
    async (snapshot) => {
      if (!snapshot.exists()) {
        onStatusChange('connected', new Date().toLocaleTimeString());
        return;
      }

      const remoteData = snapshot.data();
      if (!remoteData) return;

      if (remoteData.updatedByDevice === DEVICE_SESSION_ID) {
        onStatusChange('connected', new Date().toLocaleTimeString());
        return;
      }

      const remoteTimestamp = remoteData.updatedAtMs || 0;
      if (remoteTimestamp > lastPushedTimestamp) {
        isApplyingRemoteChange = true;
        try {
          const shardDocs =
            Number(remoteData.syncSchemaVersion || 0) >= 2
              ? await fetchShardsForCompany(targetCompanyId)
              : [];

          const mergedData = assembleAppDataFromShardsAndHeader(
            targetCompanyId,
            remoteData,
            shardDocs
          );

          // Prime shard & header diff caches so next local edit only writes the modified shard
          primeSyncCachesFromAppData(targetCompanyId, mergedData, remoteData);

          saveAppData(mergedData, currentUser.uid, { suppressCloudEvent: true });
          onRemoteUpdate(mergedData);
          onStatusChange('connected', new Date().toLocaleTimeString());
        } finally {
          setTimeout(() => {
            isApplyingRemoteChange = false;
          }, 300);
        }
      } else {
        onStatusChange('connected', new Date().toLocaleTimeString());
      }
    },
    (error) => {
      logFirestoreError(error, OperationType.GET, docPath);
      onStatusChange('error');
    }
  );

  return unsubscribe;
}

/**
 * Manually fetches the latest cloud data (header + sub-collection shards) on-demand for the signed-in user's company.
 */
export async function pullLatestFromCloud(companyId?: string): Promise<AppData | null> {
  if (isFirestoreQuotaPaused()) return null;
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;

  const targetCompanyId =
    companyId && companyId === `cmp_${currentUser.uid}`
      ? companyId
      : `cmp_${currentUser.uid}`;
  const docPath = `companies/${targetCompanyId}`;

  try {
    const docRef = doc(db, 'companies', targetCompanyId);
    const [snap, shardDocs] = await Promise.all([
      getDoc(docRef),
      fetchShardsForCompany(targetCompanyId),
    ]);

    if (snap.exists()) {
      const remoteData = snap.data();
      const assembled = assembleAppDataFromShardsAndHeader(targetCompanyId, remoteData, shardDocs);
      primeSyncCachesFromAppData(targetCompanyId, assembled, remoteData);
      return assembled;
    }
    return null;
  } catch (e) {
    logFirestoreError(e, OperationType.GET, docPath);
    return null;
  }
}
