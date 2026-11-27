/// <reference types="vite/client" />

declare module '*?url' {
  const src: string;
  export default src;
}

export interface DesktopClockState {
  clockTampered: boolean;
  maxObservedTimeMs: number;
  lastCheckTimeMs: number;
  clockTamperDetectedAt?: string | null;
}

export interface DesktopHardwareSummary {
  machineId: string;
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  hasCpuId?: boolean;
  hasSystemUuid: boolean;
  hasDiskSerial?: boolean;
  hasMachineGuid: boolean;
  source: 'ELECTRON_HARDWARE';
}

export interface DesktopBootstrapState {
  machineId: string;
  hardwareSummary?: DesktopHardwareSummary;
  dataDir: string;
  backupsDir: string;
  backupCount: number;
  latestBackupDate: string | null;
  clockState: DesktopClockState;
  vault: {
    machineId: string;
    boundMachineId?: string;
    trialStartDate: string;
    trialActivated?: boolean;
    trialBusinessName?: string;
    trialMobile?: string;
    maxObservedTimeMs: number;
    clockTamperLocked: boolean;
    vaultTampered?: boolean;
    machineMismatch?: boolean;
    license?: any;
    consumedSerials?: Array<{
      licenseId: string;
      nonceHash: string;
      activationCodeHash?: string;
      hwid: string;
      consumedAtIso: string;
    }>;
  };
  db: {
    version: number;
    updatedAt: string;
    updatedAtMs: number;
    workspaces: Record<string, { data: any; savedAtMs: number; savedAt: string }>;
    settings?: { data: any; savedAtMs: number; savedAt: string } | null;
    snapshots?: Record<string, any>;
    license?: any;
  };
}

export interface HisabVedaDesktopBridge {
  isDesktopApp: boolean;
  platform: string;
  onNavigate: (callback: (tab: string) => void) => void;
  getBootstrapState: () => DesktopBootstrapState | null;
  getMachineId: () => string;
  getHardwareSummary?: () => DesktopHardwareSummary | null;
  checkClockSync: (nowMs?: number) => DesktopClockState;
  saveWorkspace: (storageKey: string, data: any) => Promise<boolean>;
  saveSettings: (config: any) => Promise<boolean>;
  saveSnapshot: (snapshotKey: string, snapshot: any) => Promise<boolean>;
  saveLicenseState: (license: any) => Promise<boolean>;
  createBackupNow: () => Promise<{ backupCount: number; latestBackupFile: string }>;
  getStorageInfo: () => Promise<{
    dataDir: string;
    dbFile: string;
    backupsDir: string;
    backupCount: number;
    backups: string[];
  }>;
  openExternalUrl?: (url: string) => Promise<boolean>;
  flushSync: (payload: { storageKey?: string; data?: any; settings?: any }) => boolean;
}

declare global {
  interface Window {
    hisabvedaDesktop?: HisabVedaDesktopBridge;
    snaNativeAPI?: {
      onNavigate: (callback: (tab: string) => void) => void;
      platform: string;
      isDesktopApp: boolean;
    };
  }
}
