import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDocFromServer,
  disableNetwork,
  enableNetwork,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Initialize Firestore (handling named database ID if provisioned)
export const db =
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== '(default)'
    ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
    : getFirestore(app);

export const FIREBASE_QUOTA_UPGRADE_URL = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data?openUpgradeDialog=true`;

const QUOTA_PAUSE_KEY = 'hv_firestore_quota_paused_day';
let quotaPausedInMemory = false;

function getUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isFirestoreQuotaError(error: unknown): boolean {
  if (!error) return false;
  const code = typeof (error as any)?.code === 'string' ? (error as any).code : '';
  const msg =
    error instanceof Error
      ? error.message
      : typeof (error as any)?.message === 'string'
        ? (error as any).message
        : String(error);
  const lower = msg.toLowerCase();
  return (
    code === 'resource-exhausted' ||
    lower.includes('resource-exhausted') ||
    lower.includes('quota limit exceeded') ||
    lower.includes('quota exceeded')
  );
}

export function isFirestoreQuotaPaused(): boolean {
  if (quotaPausedInMemory) return true;
  if (typeof window === 'undefined') return false;
  try {
    const savedDay = sessionStorage.getItem(QUOTA_PAUSE_KEY);
    if (savedDay && savedDay === getUtcDayKey()) {
      quotaPausedInMemory = true;
      return true;
    }
    if (savedDay && savedDay !== getUtcDayKey()) {
      sessionStorage.removeItem(QUOTA_PAUSE_KEY);
    }
  } catch {
    // Ignore storage access errors
  }
  return false;
}

export async function pauseFirestoreForQuota(): Promise<void> {
  const alreadyPaused = isFirestoreQuotaPaused();
  quotaPausedInMemory = true;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(QUOTA_PAUSE_KEY, getUtcDayKey());
    } catch {
      // Ignore storage access errors
    }
    if (!alreadyPaused) {
      window.dispatchEvent(new CustomEvent('sna_cloud_quota_exceeded'));
    }
  }
  // Halt pending Firestore SDK backoff write retries cleanly while local vault continues working
  try {
    await disableNetwork(db);
  } catch {
    // Ignore network toggle errors
  }
}

export async function resumeFirestoreFromQuota(): Promise<void> {
  quotaPausedInMemory = false;
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem(QUOTA_PAUSE_KEY);
    } catch {
      // Ignore
    }
  }
  try {
    await enableNetwork(db);
  } catch {
    // Ignore
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function buildFirestoreErrorInfo(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  return {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId ?? null,
          email: provider.email ?? null,
        })) || [],
    },
    operationType,
    path,
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  if (isFirestoreQuotaError(error)) {
    void pauseFirestoreForQuota();
  }
  const errInfo = buildFirestoreErrorInfo(error, operationType, path);
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test helper
export async function testFirestoreConnection(): Promise<boolean> {
  if (isFirestoreQuotaPaused()) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error: any) {
    if (isFirestoreQuotaError(error)) {
      void pauseFirestoreForQuota();
      return false;
    }
    if (error?.code === 'not-found' || error?.code === 'permission-denied') {
      return true;
    }
    if (error?.message?.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.', error.message);
    } else {
      console.warn('Firestore connection health check notice:', error?.message);
    }
    return false;
  }
}
