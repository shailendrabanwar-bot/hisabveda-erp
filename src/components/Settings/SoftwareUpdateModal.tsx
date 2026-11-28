import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, ShieldCheck, RefreshCw, X, Zap, Download, AlertCircle } from 'lucide-react';
import { AppData } from '../../types';

interface SoftwareUpdateModalProps {
  data: AppData;
  isHindi: boolean;
  onClose: () => void;
  onApplyUpdate?: () => void;
}

export const SoftwareUpdateModal: React.FC<SoftwareUpdateModalProps> = ({
  data,
  isHindi,
  onClose,
  onApplyUpdate
}) => {
  const currentVersion = data.softwareVersion || 'v2.4.2';
  const ownerName = data.license?.registeredOwner || data.company.name;
  const licenseKey = data.license?.licenseKey || 'HV-PRO-2026-SUBSCRIPTION-ACTIVE';

  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ percent?: number; transferred?: number; total?: number } | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isDesktop = Boolean(window.hisabvedaDesktop?.isDesktopApp);

  useEffect(() => {
    if (!isDesktop) return;
    const desktop = window.hisabvedaDesktop;
    if (desktop?.onUpdateAvailable) {
      desktop.onUpdateAvailable((info: any) => {
        setUpdateAvailable(true);
        setNewVersion(info?.version || 'Latest Release');
      });
    }
    if (desktop?.onUpdateProgress) {
      desktop.onUpdateProgress((progress: any) => {
        setDownloadProgress({
          percent: progress?.percent || 0,
          transferred: progress?.transferred || 0,
          total: progress?.total || 0,
        });
      });
    }
    if (desktop?.onUpdateDownloaded) {
      desktop.onUpdateDownloaded(() => {
        setUpdateDownloaded(true);
      });
    }
  }, [isDesktop]);

  const handleCheckForUpdates = async () => {
    if (!isDesktop) {
      setErrorMsg(isHindi ? 'वेब संस्करण में ऑटो-अपडेट केवल डेस्कटॉप ऐप (Electron) में उपलब्ध है।' : 'Auto-update is fully active in the HisabVeda ERP Desktop App.');
      return;
    }
    setChecking(true);
    setErrorMsg(null);
    try {
      const res = await window.hisabvedaDesktop?.checkForUpdates?.();
      if (res?.error) {
        setErrorMsg(res.error);
      } else if (res?.updateAvailable) {
        setUpdateAvailable(true);
        setNewVersion(res.version || 'New Version');
      } else {
        setErrorMsg(isHindi ? 'आप पहले से ही नवीनतम संस्करण पर हैं!' : 'You are already running the latest version.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to check updates');
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
                <span>{isHindi ? 'सॉफ्टवेयर अपडेट एवं रिलीज सेंटर' : 'Software Update & GitHub Releases Center'}</span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  ELECTRON-UPDATER
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi ? 'GitHub Releases से कनेक्टेड ऑटो-अपडेट और सब्सक्रिप्शन सिंक' : 'Automated updates connected securely to GitHub Releases'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-xl hover:bg-slate-700 transition"
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
            <p className="text-slate-400 font-mono text-[11px]">Key: {licenseKey}</p>
          </div>

          <div className="bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800 text-center shrink-0">
            <span className="text-slate-400 text-[10px] block font-semibold">{isHindi ? 'वर्तमान संस्करण' : 'Current Version'}</span>
            <span className="text-indigo-300 font-extrabold font-mono text-base">{currentVersion}</span>
          </div>
        </div>

        {/* Update Status / Banner */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2 font-bold text-white text-xs">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>{isHindi ? 'अपडेट स्थिति' : 'Live Update Status'}</span>
            </div>
            <button
              onClick={handleCheckForUpdates}
              disabled={checking}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-bold text-xs rounded-lg flex items-center gap-1.5 transition shadow"
            >
              {checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              <span>{isHindi ? 'अपडेट जांचें' : 'Check for Updates'}</span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {updateDownloaded ? (
            <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-xl p-4 text-center space-y-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div>
                <h4 className="font-extrabold text-emerald-300 text-sm">
                  {isHindi ? 'नया अपडेट सफलतापूर्वक डाउनलोड हो गया है!' : 'Update Downloaded Successfully!'}
                </h4>
                <p className="text-xs text-slate-300 mt-1">
                  {isHindi ? 'अपडेट इंस्टॉल करने और ऐप पुनः आरंभ करने के लिए नीचे क्लिक करें।' : 'Click below to apply the update and restart HisabVeda ERP instantly.'}
                </p>
              </div>
              <button
                onClick={handleInstallAndRestart}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition"
              >
                {isHindi ? 'अपडेट और रीस्टार्ट करें' : 'Update & Restart Now'}
              </button>
            </div>
          ) : updateAvailable ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  <Download className="w-4 h-4 animate-bounce" />
                  {isHindi ? `नया संस्करण ${newVersion || ''} डाउनलोड हो रहा है...` : `Downloading new version ${newVersion || ''}...`}
                </span>
                {downloadProgress && (
                  <span className="font-mono font-bold text-indigo-400">
                    {Math.round(downloadProgress.percent || 0)}%
                  </span>
                )}
              </div>
              {downloadProgress && (
                <div className="w-full bg-slate-900 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${Math.min(100, Math.max(0, downloadProgress.percent || 0))}%` }}
                  />
                </div>
              )}
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
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition"
          >
            {isHindi ? 'बंद करें (Close)' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
