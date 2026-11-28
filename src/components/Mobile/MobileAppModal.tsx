import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Smartphone,
  Monitor,
  Download,
  QrCode,
  CheckCircle2,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Terminal,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Wifi,
  KeyRound,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { SnaLogo } from '../SnaLogo';
import {
  downloadAndroidApkBuilderZip,
  downloadWindowsDesktopShortcutZip,
  isRunningInIframe,
  resolvePublicAppUrl,
} from '../../utils/desktopShortcut';
import { AppData } from '../../types';
import { buildLanLiveSnapshot } from '../../utils/enterpriseErpHelpers';

interface LanNetworkInfo {
  port: number;
  pairCode: string;
  hasSnapshot: boolean;
  lastSyncedAt?: string | null;
  snapshotUpdatedAt?: string | null;
  recommendedLanUrl?: string | null;
  interfaces: Array<{ name: string; address: string; isPrivateLan?: boolean; url?: string }>;
  primaryLanUrl?: string | null;
}

interface MobileAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHindi: boolean;
  publicAppUrl?: string;
  data?: AppData;
  fyLabel?: string;
}

export const MobileAppModal: React.FC<MobileAppModalProps> = ({
  isOpen,
  onClose,
  isHindi,
  publicAppUrl,
  data,
  fyLabel,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const isLikelyDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
  const [activeTab, setActiveTab] = useState<'desktop' | 'pwa' | 'qr' | 'apk'>(
    isLikelyDesktop ? 'qr' : 'pwa'
  );
  const [copiedLink, setCopiedLink] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [lanInfo, setLanInfo] = useState<LanNetworkInfo | null>(null);
  const [selectedLanIp, setSelectedLanIp] = useState<string>('');
  const [isSyncingLan, setIsSyncingLan] = useState(false);
  const [lanSyncNote, setLanSyncNote] = useState<string | null>(null);

  const loadLanInfoAndSync = useCallback(async (forcePush = false) => {
    try {
      const res = await fetch('/api/lan/info', { cache: 'no-store' });
      if (!res.ok) return;
      const json: LanNetworkInfo = await res.json();
      setLanInfo(json);
      if (json.interfaces && json.interfaces.length > 0) {
        setSelectedLanIp((prev) => prev || json.interfaces[0].address);
      }

      if (data && (forcePush || !json.hasSnapshot)) {
        setIsSyncingLan(true);
        const snapshot = buildLanLiveSnapshot(data, fyLabel);
        const pushRes = await fetch('/api/lan/snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-lan-code': json.pairCode,
          },
          body: JSON.stringify({ pairCode: json.pairCode, snapshot }),
        });
        if (pushRes.ok) {
          const pushJson = await pushRes.json();
          setLanInfo((prev) =>
            prev
              ? { ...prev, hasSnapshot: true, snapshotUpdatedAt: pushJson.updatedAt || new Date().toISOString() }
              : prev
          );
          if (forcePush) {
            setLanSyncNote(
              isHindi
                ? '✅ लाइव डेटा Wi-Fi / LAN सर्वर पर सिंक हो गया!'
                : '✅ Live snapshot synced to Local Wi-Fi / LAN server!'
            );
            setTimeout(() => setLanSyncNote(null), 3000);
          }
        }
      }
    } catch {
      // LAN endpoints unavailable in static-only builds
    } finally {
      setIsSyncingLan(false);
    }
  }, [data, fyLabel, isHindi]);

  useEffect(() => {
    if (!isOpen) return;
    loadLanInfoAndSync(false);
  }, [isOpen, loadLanInfoAndSync]);

  if (!isOpen) return null;

  const resolvedBaseUrl = resolvePublicAppUrl(publicAppUrl);
  const activeLanInterface =
    lanInfo?.interfaces?.find((i) => i.address === selectedLanIp) || lanInfo?.interfaces?.[0];
  const lanOrigin = activeLanInterface
    ? activeLanInterface.url || `http://${activeLanInterface.address}:${lanInfo?.port || 3000}`
    : lanInfo?.recommendedLanUrl || '';
  const lanLiveUrl =
    lanOrigin && lanInfo?.pairCode
      ? `${lanOrigin}/?view=client&lan=1&code=${encodeURIComponent(lanInfo.pairCode)}`
      : `${resolvedBaseUrl}?view=client&lan=1${lanInfo?.pairCode ? `&code=${encodeURIComponent(lanInfo.pairCode)}` : ''}`;
  const mobileUrl = lanLiveUrl;
  const inIframe = isRunningInIframe();

  const handleCopy = (target = mobileUrl) => {
    navigator.clipboard.writeText(target);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDownloadDesktopShortcut = async () => {
    setIsDownloadingZip(true);
    setDownloadStatus(null);
    try {
      const res = await downloadWindowsDesktopShortcutZip(resolvedBaseUrl);
      setDownloadStatus(
        isHindi
          ? `✅ ${res.fileName} डाउनलोड हो गया! अब ZIP को Extract करें और "Install_HisabVeda_Desktop_Shortcut.bat" पर डबल-क्लिक करें — आपके Desktop पर HisabVeda लोगो वाला शॉर्टकट बन जाएगा।`
          : `✅ Downloaded ${res.fileName}! Extract the ZIP and double-click "Install_HisabVeda_Desktop_Shortcut.bat" to place the official HisabVeda logo app icon directly on your Windows Desktop.`
      );
    } finally {
      setIsDownloadingZip(false);
    }
  };

  const handleDownloadApkScript = async () => {
    setIsDownloadingZip(true);
    setDownloadStatus(null);
    try {
      const res = await downloadAndroidApkBuilderZip();
      setDownloadStatus(
        isHindi
          ? `✅ ${res.fileName} डाउनलोड हो गया! इसे अपने पूरे सोर्स कोड फ़ोल्डर (जहाँ package.json है) में Extract करके चलाएँ।`
          : `✅ Downloaded ${res.fileName}! Extract inside your root source project folder (with package.json) and run Build_Hisabveda_Android_APK.bat.`
      );
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="hv-surface border-emerald-500/30 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border-primary)] flex items-center justify-between hv-elevated">
          <div className="flex items-center gap-3">
            <SnaLogo size="md" showText={false} />
            <div>
              <h2 className="text-base font-extrabold text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                <span>
                  {isHindi
                    ? '🖥️📱 डेस्कटॉप व मोबाइल ऐप इंस्टॉलेशन'
                    : '🖥️📱 Desktop & Mobile App Setup'}
                </span>
                <span className="text-[10px] hv-pill-emerald border px-2 py-0.5 rounded-full font-mono font-bold">
                  Windows • Android • iOS
                </span>
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                {isHindi
                  ? 'ऑफ़िशियल HisabVeda लोगो के साथ Desktop शॉर्टकट और मोबाइल ऐप इंस्टॉल करें'
                  : 'Install Hisabveda ERP with official logo icon on Desktop & smartphones'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 hv-elevated border-b border-[var(--border-primary)]">
          <button
            onClick={() => {
              setActiveTab('desktop');
              setDownloadStatus(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'desktop'
                ? 'bg-emerald-600 text-white hv-keep-white shadow-md'
                : 'hv-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>{isHindi ? 'डेस्कटॉप शॉर्टकट' : 'Desktop App'}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('pwa');
              setDownloadStatus(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'pwa'
                ? 'bg-emerald-600 text-white hv-keep-white shadow-md'
                : 'hv-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>{isHindi ? 'मोबाइल ऐप (PWA)' : 'Mobile (PWA)'}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('qr');
              setDownloadStatus(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'qr'
                ? 'bg-emerald-600 text-white hv-keep-white shadow-md'
                : 'hv-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>{isHindi ? 'QR कोड स्कैन' : 'Scan QR'}</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('apk');
              setDownloadStatus(null);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'apk'
                ? 'bg-emerald-600 text-white hv-keep-white shadow-md'
                : 'hv-surface text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>{isHindi ? 'Android APK' : 'APK Builder'}</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {downloadStatus && (
            <div className="p-3.5 rounded-xl hv-pill-emerald border text-xs font-semibold leading-relaxed animate-fadeIn">
              {downloadStatus}
            </div>
          )}

          {/* TAB 0: DESKTOP APP & WINDOWS SHORTCUT WITH LOGO */}
          {activeTab === 'desktop' && (
            <div className="space-y-4">
              {/* Method 1: Windows 1-Click Desktop Shortcut ZIP (Guaranteed Logo Icon) */}
              <div className="hv-elevated border-emerald-500/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-[var(--text-primary)] flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-emerald-400" />
                      <span>
                        {isHindi
                          ? '1. Windows Desktop आइकन शॉर्टकट (ऑफ़िशियल लोगो सहित)'
                          : '1. Windows Desktop Shortcut Installer (with Official Logo)'}
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                      {isHindi
                        ? 'अन्य सॉफ्टवेयर की तरह सीधे Windows Desktop और Start Menu में HisabVeda लोगो वाला ऐप आइकन बनाने के लिए यह पैकेज डाउनलोड करें (Node.js की ज़रूरत नहीं):'
                        : 'Creates a native "HisabVeda ERP" shortcut with the official HisabVeda .ico logo directly on your Windows Desktop & Start Menu (no Node.js needed).'}
                    </p>
                  </div>
                  <img
                    src="/hv-app-192.png"
                    alt="HisabVeda Desktop Icon"
                    className="w-12 h-12 rounded-xl bg-white p-1 border border-emerald-400/40 shrink-0 shadow-lg"
                  />
                </div>

                <div className="hv-surface p-3 rounded-xl text-[11px] text-[var(--text-secondary)] space-y-1">
                  <p>
                    <strong className="text-emerald-400">Step 1:</strong>{' '}
                    {isHindi
                      ? 'नीचे बटन से HisabVeda_Desktop_App_Shortcut.zip डाउनलोड करें।'
                      : 'Download HisabVeda_Desktop_App_Shortcut.zip below.'}
                  </p>
                  <p>
                    <strong className="text-emerald-400">Step 2:</strong>{' '}
                    {isHindi
                      ? 'ZIP को Extract (Unzip) करें और "Install_HisabVeda_Desktop_Shortcut.bat" पर डबल-क्लिक करें।'
                      : 'Extract the ZIP folder and double-click "Install_HisabVeda_Desktop_Shortcut.bat".'}
                  </p>
                  <p>
                    <strong className="text-emerald-400">Step 3:</strong>{' '}
                    {isHindi
                      ? 'तुरंत आपके Desktop पर HisabVeda लोगो वाला शॉर्टकट आ जाएगा और ऐप अलग विंडो में खुल जाएगा!'
                      : 'Your Desktop instantly gets the HisabVeda logo icon and opens in a standalone window!'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadDesktopShortcut}
                  disabled={isDownloadingZip}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white hv-keep-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isDownloadingZip ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span>
                    {isHindi
                      ? 'Windows Desktop लोगो शॉर्टकट पैकेज डाउनलोड करें (.ZIP)'
                      : 'Download Desktop App Shortcut with Logo (.ZIP)'}
                  </span>
                </button>
              </div>

              {/* Method 2: Chrome / Edge Direct PWA Install */}
              <div className="hv-elevated rounded-2xl p-4 space-y-3">
                <h4 className="font-bold text-xs text-sky-400 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-400" />
                  <span>
                    {isHindi
                      ? '2. ब्राउज़र से सीधा Desktop App इंस्टॉल (Chrome / Edge)'
                      : '2. Direct Browser Desktop Install (Chrome / Edge)'}
                  </span>
                </h4>

                {isInstalled ? (
                  <div className="py-2.5 px-4 hv-pill-emerald border rounded-xl text-xs font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      {isHindi
                        ? 'यह ऐप पहले से Desktop App के रूप में इंस्टॉल है!'
                        : 'App is already installed in standalone Desktop mode!'}
                    </span>
                  </div>
                ) : isInstallable ? (
                  <button
                    type="button"
                    onClick={install}
                    className="w-full bg-sky-600 hover:bg-sky-500 text-white hv-keep-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      {isHindi
                        ? 'अभी सीधे Desktop App इंस्टॉल करें'
                        : 'Install HisabVeda Desktop App Now'}
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2.5 text-[11px] text-[var(--text-secondary)]">
                    <p>
                      {inIframe
                        ? isHindi
                          ? 'आप अभी प्रीव्यू विंडो (iframe) के अंदर हैं, इसलिए ब्राउज़र का "Install App" बटन सीधे यहाँ नहीं दिखता। नीचे दिए लिंक से ऐप को नई टैब में खोलें, फिर एड्रेस बार में इंस्टॉल आइकन (⊕) या 3-डॉट्स ➔ "Install Hisabveda" दबाएँ:'
                          : 'Preview iframes suppress browser install prompts. Open the standalone app tab below, then click the Install icon (⊕) in Chrome/Edge address bar or Menu ➔ "Install Hisabveda":'
                        : isHindi
                          ? 'Chrome या Edge के एड्रेस बार (दाईं ओर) में "Install (⊕)" आइकन पर क्लिक करें या ब्राउज़र मेनू (⋮) ➔ Save & Share / Apps ➔ "Install Hisabveda" चुनें।'
                          : 'Click the Install icon (⊕) in the Chrome/Edge address bar or Browser Menu ➔ Apps ➔ "Install Hisabveda".'}
                    </p>
                    <a
                      href={resolvedBaseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs py-2.5 px-4 rounded-xl transition shadow cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>
                        {isHindi
                          ? 'इंस्टॉल करने के लिए नई टैब में ऐप खोलें'
                          : 'Open Standalone Tab to Install in Chrome / Edge'}
                      </span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 1: 1-Click PWA Mobile App */}
          {activeTab === 'pwa' && (
            <div className="space-y-4">
              <div className="hv-elevated border-emerald-500/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-extrabold text-sm text-[var(--text-primary)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>
                        {isHindi
                          ? 'बिना Play Store के सीधे फोन में इंस्टॉल करें!'
                          : 'Instant Install directly without Play Store!'}
                      </span>
                    </h3>
                    <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
                      {isHindi
                        ? 'इस सॉफ़्टवेयर में नया ऑफ़िशियल HisabVeda लोगो मोबाइल आइकन (/hv-app-192.png) सेट कर दिया गया है।'
                        : 'Updated with the fresh official HisabVeda logo mobile app icon and full-screen offline PWA support.'}
                    </p>
                  </div>
                  <img
                    src="/hv-app-192.png"
                    alt="HisabVeda Mobile App Icon"
                    className="w-12 h-12 rounded-2xl bg-white p-1 border border-emerald-400/40 shrink-0 shadow-lg"
                  />
                </div>

                {/* Cache Refresh Notice for Users Replacing Old Circle Icon */}
                <div className="p-3 rounded-xl hv-pill-amber border text-[11px] flex items-start gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">
                      {isHindi ? 'यदि फ़ोन होम स्क्रीन पर पुराना गोल लोगो दिख रहा है:' : 'Seeing an older icon on your phone home screen?'}
                    </strong>
                    <p className="mt-0.5 text-[var(--text-secondary)]">
                      {isHindi
                        ? 'Android/iPhone पुराना शॉर्टकट आइकन कैश कर लेते हैं। बस पुराने होम-स्क्रीन आइकन को Uninstall/Remove करें, इस पेज को एक बार Reload (रीफ्रेश) करें, और दोबारा "Install App / Add to Home Screen" दबाएँ — नया HisabVeda लोगो तुरंत आ जाएगा!'
                        : 'Mobile OS locks the home-screen icon when first installed. Remove/uninstall the old home-screen shortcut once, reload this page, and tap "Install App / Add to Home Screen" again to get the new HisabVeda logo.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Android Card */}
                  <div className="hv-surface p-3.5 rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Android (Chrome / Edge)</span>
                    </span>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {isHindi
                        ? 'क्रोम में लिंक खोलें ➔ 3 डॉट्स (⋮) दबाएँ ➔ "Install App" या "होम स्क्रीन में जोड़ें" पर टैप करें।'
                        : 'Open in Chrome ➔ Tap 3 dots (⋮) ➔ Tap "Install App" or "Add to Home screen".'}
                    </p>
                  </div>

                  {/* iOS Card */}
                  <div className="hv-surface p-3.5 rounded-xl space-y-2">
                    <span className="text-[11px] font-bold text-sky-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>iPhone / iPad (Safari)</span>
                    </span>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {isHindi
                        ? 'सफ़ारी में लिंक खोलें ➔ शेयर बटन (⎋) दबाएँ ➔ "Add to Home Screen" (+) पर टैप करें।'
                        : 'Open in Safari ➔ Tap Share icon (⎋) ➔ Tap "Add to Home Screen" (+).'}
                    </p>
                  </div>
                </div>

                {/* Direct Action Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
                  {isInstallable && !isInstalled && (
                    <button
                      onClick={install}
                      className="w-full sm:w-auto flex-1 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isHindi ? 'अभी इस डिवाइस पर इंस्टॉल करें' : 'Install on this Device Now'}</span>
                    </button>
                  )}

                  {isInstalled && (
                    <div className="w-full py-2.5 px-4 hv-pill-emerald border rounded-xl text-xs font-bold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isHindi ? 'यह ऐप पहले से आपके डिवाइस पर इंस्टॉल है!' : 'App is already installed on this device!'}</span>
                    </div>
                  )}

                  {isIOS && !isInstalled && (
                    <button
                      onClick={() => setShowIOSSteps(!showIOSSteps)}
                      className="w-full sm:w-auto flex-1 bg-sky-600 hover:bg-sky-500 text-white hv-keep-white font-extrabold text-xs py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>{isHindi ? 'iPhone में इंस्टॉल करने की विधि' : 'How to install on iPhone'}</span>
                    </button>
                  )}

                  <button
                    onClick={handleCopy}
                    className="w-full sm:w-auto flex items-center justify-center gap-1.5 hv-surface hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold text-xs py-3 px-4 rounded-xl transition cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedLink ? (isHindi ? 'लिंक कॉपी हुआ!' : 'Copied!') : (isHindi ? 'मोबाइल लिंक कॉपी करें' : 'Copy Mobile Link')}</span>
                  </button>
                </div>

                {showIOSSteps && (
                  <div className="p-3 hv-surface rounded-xl border-sky-500/40 text-xs text-[var(--text-secondary)] space-y-1 animate-fadeIn">
                    <p className="font-bold text-sky-400">{isHindi ? 'iPhone Safari में इंस्टॉलेशन स्टेप्स:' : 'iPhone Installation Steps:'}</p>
                    <p>1. Safari में नीचे दिया गया <strong>Share</strong> (शेयर) बटन दबाएँ।</p>
                    <p>2. नीचे स्क्रॉल करके <strong>"Add to Home Screen" (+)</strong> पर टैप करें।</p>
                    <p>3. ऊपर दाएँ कोने में <strong>"Add"</strong> दबाएँ — नया Hisabveda ERP लोगो आपके फोन पर आ जाएगा!</p>
                  </div>
                )}
              </div>

              {/* Mobile Features Highlights */}
              <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
                <div className="hv-elevated p-3 rounded-xl">
                  <p className="text-emerald-400 font-bold text-sm">100%</p>
                  <p className="text-[var(--text-secondary)] text-[10px]">{isHindi ? 'फुल-स्क्रीन व्यू' : 'Full Screen Standalone'}</p>
                </div>
                <div className="hv-elevated p-3 rounded-xl">
                  <p className="text-amber-400 font-bold text-sm">0 MB</p>
                  <p className="text-[var(--text-secondary)] text-[10px]">{isHindi ? 'फोन स्टोरेज की बचत' : 'Zero Device Bloat'}</p>
                </div>
                <div className="hv-elevated p-3 rounded-xl">
                  <p className="text-sky-400 font-bold text-sm">ऑफ़लाइन</p>
                  <p className="text-[var(--text-secondary)] text-[10px]">{isHindi ? 'कैश डेटा सपोर्ट' : 'Offline Cached Data'}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QR Code & Local Wi-Fi / LAN Multi-PC Live View */}
          {activeTab === 'qr' && (
            <div className="space-y-4">
              {/* LAN IP & Pairing Status Card */}
              <div className="hv-elevated border-indigo-500/30 rounded-2xl p-4 space-y-3 text-left">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <span className="font-extrabold text-xs text-[var(--text-primary)]">
                      {isHindi
                        ? 'लोकल Wi-Fi / LAN लाइव व्यू (2nd PC व मोबाइल)'
                        : 'Local Wi-Fi / LAN Multi-PC & Mobile Live View'}
                    </span>
                  </div>
                  {lanInfo?.pairCode && (
                    <div className="inline-flex items-center gap-1.5 hv-surface border-emerald-500/40 px-2.5 py-1 rounded-lg">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-[10px] text-[var(--text-secondary)] font-bold uppercase">Code:</span>
                      <span className="font-mono font-black text-xs text-emerald-400 tracking-widest">
                        {lanInfo.pairCode}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="inline-flex hv-pill-emerald border px-3 py-1.5 rounded-xl font-bold">
                    {isHindi ? 'Wi-Fi / LAN लाइव व्यू सक्रिय' : 'Wi-Fi / LAN Live View Active'}
                  </div>

                  {lanInfo && lanInfo.interfaces.length > 0 && (
                    <select
                      value={selectedLanIp}
                      onChange={(e) => setSelectedLanIp(e.target.value)}
                      className="hv-input text-indigo-400 font-mono text-xs rounded-lg px-2.5 py-1.5 outline-none"
                    >
                      {lanInfo.interfaces.map((iface) => (
                        <option key={iface.address} value={iface.address}>
                          {iface.address}:{lanInfo.port} ({iface.name})
                        </option>
                      ))}
                    </select>
                  )}

                  {data && (
                    <button
                      type="button"
                      onClick={() => loadLanInfoAndSync(true)}
                      disabled={isSyncingLan}
                      className="inline-flex items-center gap-1.5 hv-surface hover:bg-[var(--hover-surface)] text-emerald-400 border-emerald-500/30 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLan ? 'animate-spin' : ''}`} />
                      <span>{isHindi ? 'डेटा अभी सिंक करें' : 'Sync Live Data Now'}</span>
                    </button>
                  )}
                </div>

                {lanSyncNote && (
                  <p className="text-[11px] font-bold text-emerald-400">{lanSyncNote}</p>
                )}
              </div>

              {/* QR Display */}
              <div className="text-center space-y-3">
                <div className="hv-elevated p-5 rounded-2xl inline-block mx-auto shadow-2xl">
                  <div className="bg-white p-3 rounded-xl inline-block border border-slate-200">
                    <QRCodeSVG
                      value={mobileUrl}
                      size={190}
                      level="H"
                      includeMargin={true}
                    />
                  </div>
                  <p className="text-xs font-bold text-emerald-400 mt-3">
                    {isHindi
                      ? 'उसी दुकान के Wi-Fi से जुड़े फोन या दूसरे PC से स्कैन करें'
                      : 'Scan on Mobile or Open on 2nd PC on same Shop Wi-Fi'}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-1 max-w-sm mx-auto">
                    {isHindi
                      ? 'बिक्री, कैश/बैंक बैलेंस और पार्टी बकाया बिना क्लाउड लॉगिन के लाइव देखें (Read-Only)।'
                      : 'View Live Sales, Cash/Bank Balances & Party Outstandings on Wi-Fi without cloud login (Read-Only).'}
                  </p>
                </div>

                <div className="hv-elevated p-3 rounded-xl flex items-center justify-between gap-2 text-xs font-mono text-emerald-400">
                  <span className="break-all select-all text-left">{mobileUrl}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(mobileUrl)}
                    className="shrink-0 px-3 py-1.5 hv-surface hover:bg-[var(--hover-surface)] text-[var(--text-primary)] rounded-lg font-sans font-bold flex items-center gap-1 cursor-pointer"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? (isHindi ? 'कॉपी!' : 'Copied') : (isHindi ? 'कॉपी' : 'Copy')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Native Android APK Script */}
          {activeTab === 'apk' && (
            <div className="space-y-4">
              <div className="hv-elevated p-4 rounded-2xl space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
                  <span className="font-bold text-[var(--text-primary)] flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <span>{isHindi ? 'Android APK / Google Play Store पैकेज टूल' : 'Native Android APK & Play Store Builder'}</span>
                  </span>
                  <span className="text-[10px] hv-pill-amber border px-2 py-0.5 rounded font-mono font-bold">
                    .APK / .AAB
                  </span>
                </div>

                <p className="text-[var(--text-secondary)] text-[11px] leading-relaxed">
                  {isHindi
                    ? 'यदि आप अपने सॉफ़्टवेयर की असली Android APK (.apk) फ़ाइल बनाकर ग्राहकों को WhatsApp से भेजना चाहते हैं या Google Play Store पर डालना चाहते हैं, तो यह ZIP पैकेज डाउनलोड करें:'
                    : 'Download the Capacitor Android APK Builder ZIP package to wrap the full source project into a native Android APK.'}
                </p>

                <div className="hv-surface p-3 rounded-xl font-mono text-[11px] text-amber-400 space-y-1">
                  <p>1. पूरा सोर्स कोड ZIP (package.json सहित) कंप्यूटर पर Extract करें।</p>
                  <p>2. <strong>Build_Hisabveda_Android_APK.bat</strong> को प्रोजेक्ट रूट फ़ोल्डर में रखकर चलाएँ।</p>
                  <p>3. Android Studio में <strong>Build APK</strong> दबाएँ — APK फ़ाइल तैयार हो जाएगी!</p>
                </div>

                <button
                  onClick={handleDownloadApkScript}
                  disabled={isDownloadingZip}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-emerald-600 hover:from-amber-500 hover:to-emerald-500 disabled:opacity-60 text-white hv-keep-white font-extrabold py-3 px-4 rounded-xl shadow-lg transition cursor-pointer"
                >
                  {isDownloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{isHindi ? 'Android APK बिल्डर पैकेज डाउनलोड करें (.ZIP)' : 'Download Android APK Builder (.ZIP)'}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--border-primary)] hv-elevated flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-[var(--text-secondary)]">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{isHindi ? 'सुरक्षित, तेज़ एवं 100% रिस्पॉन्सिव इंटरफेस' : 'Secure, fast & responsive Desktop/Mobile interface'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 hv-surface hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold rounded-xl transition cursor-pointer"
          >
            {isHindi ? 'बंद करें' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
