import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, ShieldCheck, RefreshCw, X, Zap, Download, AlertCircle } from 'lucide-react';
import { AppData } from '../../types';

export interface DesktopUpdateProgress {
  percent?: number;
  transferred?: number;
  total?: number;
  bytesPerSecond?: number;
}

export interface DesktopUpdateState {
  available: boolean;
  version: string | null;
  progress: DesktopUpdateProgress | null;
  downloaded: boolean;
  error: string | null;
}

interface SoftwareUpdateModalProps {
  data: AppData;
  isHindi: boolean;
  onClose: () => void;
  onApplyUpdate?: () => void;
  desktopUpdateState?: DesktopUpdateState;
  onSyncUpdateState?: (next: Partial<DesktopUpdateState>) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const SoftwareUpdateModal: React.FC<SoftwareUpdateModalProps> = ({
  data,
  isHindi,
  onClose,
  onApplyUpdate,
  desktopUpdateState,
  onSyncUpdateState,
}) => {
  const isDesktop = Boolean(window.hisabvedaDesktop?.isDesktopApp);
  const desktopVersionRaw = isDesktop ? window.hisabvedaDesktop?.getAppVersion?.() : undefined;
  const currentVersion = desktopVersionRaw
    ? (desktopVersionRaw.startsWith('v') ? desktopVersionRaw : `v${desktopVersionRaw}`)
    : (data.softwareVersion || 'v2.4.2');

  const ownerName = data.license?.registeredOwner || data.company.name;
  const licenseKey = data.license?.licenseKey || 'HV-PRO-2026-SUBSCRIPTION-ACTIVE';

  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(Boolean(desktopUpdateState?.available));
  const [newVersion, setNewVersion] = useState<string | null>(desktopUpdateState?.version || null);
  const [downloadProgress, setDownloadProgress] = useState<DesktopUpdateProgress | null>(
    desktopUpdateState?.progress || null
  );
  const [updateDownloaded, setUpdateDownloaded] = useState(Boolean(desktopUpdateState?.downloaded));
  const [statusMessage, setStatusMessage] = useState<string | null>(desktopUpdateState?.error || null);
  const [isUpToDate, setIsUpToDate] = useState(false);

  useEffect(() => {
    if (!desktopUpdateState) return;
    if (desktopUpdateState.available) setUpdateAvailable(true);
    if (desktopUpdateState.version) setNewVersion(desktopUpdateState.version);
    if (desktopUpdateState.progress) setDownloadProgress(desktopUpdateState.progress);
    if (desktopUpdateState.downloaded) setUpdateDownloaded(true);
    if (desktopUpdateState.error) setStatusMessage(desktopUpdateState.error);
  }, [desktopUpdateState]);

  useEffect(() => {
    if (!isDesktop) return;
    const desktop = window.hisabvedaDesktop;
    const cleanups: Array<() => void> = [];

    const offAvailable = desktop?.onUpdateAvailable?.((info: any) => {
      const ver = info?.version ? `v${String(info.version).replace(/^v/i, '')}` : 'Latest Release';
      setUpdateAvailable(true);
      setIsUpToDate(false);
      setStatusMessage(null);
      setNewVersion(ver);
      onSyncUpdateState?.({ available: true, version: ver, error: null });
    });
    if (typeof offAvailable === 'function') cleanups.push(offAvailable);

    const offProgress = desktop?.onUpdateProgress?.((progress: any) => {
      const prog: DesktopUpdateProgress = {
        percent: progress?.percent || 0,
        transferred: progress?.transferred || 0,
        total: progress?.total || 0,
        bytesPerSecond: progress?.bytesPerSecond || 0,
      };
      setDownloadProgress(prog);
      onSyncUpdateState?.({ progress: prog });
    });
    if (typeof offProgress === 'function') cleanups.push(offProgress);

    const offDownloaded = desktop?.onUpdateDownloaded?.((info: any) => {
      const ver = info?.version ? `v${String(info.version).replace(/^v/i, '')}` : newVersion;
      setUpdateDownloaded(true);
      setDownloadProgress((prev) => ({ ...(prev || {}), percent: 100 }));
      if (ver) setNewVersion(ver);
      onSyncUpdateState?.({ downloaded: true, ...(ver ? { version: ver } : {}) });
    });
    if (typeof offDownloaded === 'function') cleanups.push(offDownloaded);

    const offNotAvailable = desktop?.onUpdateNotAvailable?.(() => {
      setChecking(false);
      setIsUpToDate(true);
      setStatusMessage(
        isHindi
          ? `आप पहले से ही नवीनतम संस्करण (${currentVersion}) चला रहे हैं।`
          : `You are running the latest version (${currentVersion}).`
      );
    });
    if (typeof offNotAvailable === 'function') cleanups.push(offNotAvailable);

    const offError = desktop?.onUpdateError?.((err: any) => {
      setChecking(false);
      setStatusMessage(err?.message || 'Unable to check GitHub Releases right now.');
    });
    if (typeof offError === 'function') cleanups.push(offError);

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [isDesktop, isHindi, currentVersion, newVersion, onSyncUpdateState]);

  const handleCheckForUpdates = async () => {
    if (!isDesktop) {
      setIsUpToDate(true);
      setStatusMessage(
        isHindi
          ? `वेब ऐप नवीनतम संस्करण (${currentVersion}) पर सक्रिय है। ऑटो-अपडेट्स डेस्कटॉप (.exe) ऐप में GitHub Releases से चलते हैं।`
          : `Web workspace is live on ${currentVersion}. GitHub Releases auto-updater is active in the Desktop (.exe) build.`
      );
      return;
    }
    setChecking(true);
    setStatusMessage(null);
    setIsUpToDate(false);
    try {
      const res = await window.hisabvedaDesktop?.checkForUpdates?.();
      if (res?.error) {
        setStatusMessage(res.error);
      } else if (res?.updateAvailable) {
        const ver = res.version ? `v${String(res.version).replace(/^v/i, '')}` : 'New Version';
        setUpdateAvailable(true);
        setNewVersion(ver);
        onSyncUpdateState?.({ available: true, version: ver, error: null });
      } else {
        setIsUpToDate(true);
        setStatusMessage(
          res?.message ||
            (isHindi
              ? `आप पहले से ही नवीनतम संस्करण (${currentVersion}) पर हैं!`
              : `You are already running the latest version (${currentVersion}).`)
        );
      }
    } catch (err: any) {
      setStatusMessage(err?.message || 'Failed to check for updates');
    } finally {
      setChecking(false);
    }
  };

  const handleInstallAndRestart = async () => {
    if (isDesktop && window.hisabvedaDesktop?.installUpdate) {
      await window.hisabvedaDesktop.installUpdate();
    } else {
      if (onApplyUpdate) onApplyUpdate();
      onClose();
    }
  };

  const percentRounded = Math.min(100, Math.max(0, Math.round(downloadProgress?.percent || 0)));

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-5 md:p-6 text-slate-200 space-y-5 shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>
                  {updateAvailable
                    ? (isHindi ? 'सॉफ्टवेयर अपडेट उपलब्ध है' : 'Software Update Available')
                    : (isHindi ? 'सॉफ्टवेयर अपडेट एवं रिलीज सेंटर' : 'Software Update & GitHub Releases Center')}
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  AUTO-UPDATER
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi ? 'GitHub Releases से कनेक्टेड ऑटो-अपडेट और सब्सक्रिप्शन सिंक' : 'Automated updates connected securely to GitHub Releases'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subscription & Version Card */}
        <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-bold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>{isHindi ? 'सब्सक्रिप्शन स्थिति: सक्रिय' : 'Subscription Status: ACTIVE'}</span>
            </div>
            <p className="text-slate-300">
              {isHindi ? 'पंजीकृत स्वामी:' : 'Registered Owner:'} <strong className="text-white">{ownerName}</strong>
            </p>
            <p className="text-slate-400 font-mono text-[11px] truncate max-w-md">Key: {licenseKey}</p>
          </div>

          <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center shrink-0">
            <span className="text-slate-400 text-[10px] block font-semibold">{isHindi ? 'वर्तमान संस्करण' : 'Current Version'}</span>
            <span className="text-indigo-300 font-extrabold font-mono text-base">{currentVersion}</span>
          </div>
        </div>

        {/* Update Status / Banner */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
            <div className="flex items-center gap-2 font-bold text-white text-xs">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>{isHindi ? 'लाइव अपडेट स्थिति' : 'GitHub Releases Live Status'}</span>
            </div>
            <button
              type="button"
              onClick={handleCheckForUpdates}
              disabled={checking}
              className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? (isHindi ? 'जांच हो रही है...' : 'Checking...') : (isHindi ? 'अपडेट जांचें' : 'Check for Updates')}</span>
            </button>
          </div>

          {statusMessage && !updateAvailable && !updateDownloaded && (
            <div
              className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                isUpToDate
                  ? 'bg-emerald-950/30 border-emerald-500/35 text-emerald-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
              }`}
            >
              {isUpToDate ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span>{statusMessage}</span>
            </div>
          )}

          {updateDownloaded ? (
            <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-4 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div>
                <h4 className="font-extrabold text-emerald-300 text-sm">
                  {isHindi
                    ? `नया अपडेट ${newVersion || ''} सफलतापूर्वक डाउनलोड हो गया है!`
                    : `Update ${newVersion || ''} Downloaded Successfully!`}
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  {isHindi
                    ? 'अपडेट इंस्टॉल करने और ऐप पुनः आरंभ करने के लिए नीचे क्लिक करें।'
                    : 'Click below to install the latest release and restart HisabVeda ERP instantly.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleInstallAndRestart}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition cursor-pointer"
              >
                {isHindi ? 'अपडेट और रीस्टार्ट करें' : 'Update & Restart Now'}
              </button>
            </div>
          ) : updateAvailable ? (
            <div className="space-y-3 bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-4">
              <div className="flex items-center justify-between text-xs text-slate-200">
                <span className="font-bold text-amber-300 flex items-center gap-2">
                  <Download className="w-4 h-4 animate-bounce" />
                  <span>
                    {isHindi
                      ? `नया अपडेट ${newVersion || ''} डाउनलोड हो रहा है...`
                      : `Software Update Available (${newVersion || ''}) — Downloading...`}
                  </span>
                </span>
                <span className="font-mono font-bold text-indigo-300">{percentRounded}%</span>
              </div>

              <div className="w-full bg-slate-900 rounded-full h-3 overflow-hidden border border-slate-700">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-emerald-400 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${percentRounded}%` }}
                />
              </div>

              {downloadProgress && downloadProgress.total ? (
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                  <span>
                    {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
                  </span>
                  {downloadProgress.bytesPerSecond ? (
                    <span>{formatBytes(downloadProgress.bytesPerSecond)}/s</span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-300">
              <p className="font-semibold text-slate-200">
                {isHindi ? 'नवीनतम संस्करण हाइलाइट्स:' : 'HisabVeda ERP Enterprise Release Highlights:'}
              </p>
              <ul className="space-y-1.5 pl-4 list-disc text-slate-300 text-[11px]">
                <li>🚀 <strong>electron-updater:</strong> Direct secure integration with GitHub Releases for seamless zero-friction updates.</li>
                <li>🚚 <strong>Consignee & Shipping Logistics:</strong> Delivery Note No., Vehicle No., Terms of Delivery in GST Invoices.</li>
                <li>🏢 <strong>Isolated Multi-Company Engine:</strong> Clean blank workspace for every newly created company.</li>
                <li>🛠️ <strong>Enterprise Utilities:</strong> Daily encrypted backups, CSV master sync, and Tally XML migration.</li>
              </ul>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
          >
            {isHindi ? 'बंद करें (Close)' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
