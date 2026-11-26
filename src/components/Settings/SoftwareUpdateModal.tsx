import React, { useState } from 'react';
import { Sparkles, CheckCircle2, ShieldCheck, RefreshCw, X, Zap } from 'lucide-react';
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
  const isAlreadyUpdated = data.softwareVersion === 'v2.4.2';
  const [updateApplied, setUpdateApplied] = useState(isAlreadyUpdated);
  const [alreadyNotice, setAlreadyNotice] = useState(false);

  const ownerName = data.license?.registeredOwner || data.company.name;
  const licenseKey = data.license?.licenseKey || 'HV-PRO-2026-SUBSCRIPTION-ACTIVE';
  const currentVersion = data.softwareVersion || 'v2.4.0';

  const handleApplyUpdateAction = () => {
    if (data.softwareVersion === 'v2.4.2' || isAlreadyUpdated) {
      setAlreadyNotice(true);
      setUpdateApplied(true);
    } else {
      setUpdateApplied(true);
      if (onApplyUpdate) {
        onApplyUpdate();
      }
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
                <span>{isHindi ? 'सॉफ्टवेयर अपडेट एवं सब्सक्रिप्शन नोटिफिकेशन केंद्र' : 'Software Update & Active License Subscription Sync'}</span>
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                  LIVE UPDATE
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi ? 'सक्रिय सब्सक्रिप्शन ग्राहकों के लिए नवीनतम सुविधाओं का ऑटो-अपडेट नोटिफिकेशन' : 'Automated software updates and feature patches for active subscription users'}
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

        {/* Subscription Status Card */}
        <div className="bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-bold text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>{isHindi ? 'सब्सक्रिप्शन स्थिति: सक्रिय / एक्टिव' : 'Subscription Status: ACTIVE'}</span>
            </div>
            <p className="text-slate-300">
              {isHindi ? 'पंजीकृत स्वामी:' : 'Registered License Owner:'} <strong className="text-white">{ownerName}</strong>
            </p>
            <p className="text-slate-400 font-mono text-[11px]">
              Key: {licenseKey}
            </p>
          </div>

          <div className="bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 text-center shrink-0">
            <span className="text-slate-400 text-[10px] block font-semibold">{isHindi ? 'सॉफ्टवेयर संस्करण' : 'Software Version'}</span>
            <span className="text-indigo-300 font-extrabold font-mono text-sm">{currentVersion}</span>
          </div>
        </div>

        {/* Update Banner */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2 font-bold text-white text-xs">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse" />
              <span>{isHindi ? 'नया अपडेट v2.4.2 उपलब्ध है!' : 'New Update v2.4.2 Available for Download!'}</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Released: July 2026</span>
          </div>

          <div className="space-y-2 text-xs text-slate-300">
            <p className="font-semibold text-slate-200">
              {isHindi ? 'नए अपडेट में शामिल सुधार एवं विशेषताएं:' : 'Key Enhancements in this Update Patch:'}
            </p>
            <ul className="space-y-1.5 pl-4 list-disc text-slate-300 text-[11px]">
              <li>🚚 <strong>Consignee & Shipping Logistics:</strong> Delivery Note No., Vehicle No., Terms of Delivery in GST Invoices.</li>
              <li>🏢 <strong>Isolated Multi-Company Engine:</strong> Creating new companies now starts with a clean, blank dataset automatically.</li>
              <li>📦 <strong>Item Master Editing:</strong> Full edit, update, and deletion controls for inventory items.</li>
              <li>🛠️ <strong>Utilities Module:</strong> Full system JSON backup, restore, and CSV master export/import.</li>
              <li>📱 <strong>Mobile Responsive Design:</strong> Optimized layouts and scrollable tables for smartphone touchscreens.</li>
              <li>🔒 <strong>One-Click Auth Logout & Data Reset:</strong> Fixed security logout and full data reset modal routines.</li>
            </ul>
          </div>
        </div>

        {/* Update Notification Confirmation / Action */}
        {updateApplied ? (
          <div className="bg-emerald-950/50 border border-emerald-500/50 rounded-xl p-4 text-center space-y-2 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
            <h4 className="font-extrabold text-emerald-300 text-sm">
              {alreadyNotice || isAlreadyUpdated
                ? (isHindi ? 'सॉफ़्टवेयर पहले से ही नवीनतम संस्करण v2.4.2 पर अपडेट है! (Software update already done!)' : 'Software update already done! You are running the latest version v2.4.2.')
                : (isHindi ? 'सॉफ्टवेयर सफलतापूर्वक v2.4.2 में अपडेट कर दिया गया है!' : 'Software Version v2.4.2 Updated Successfully!')}
            </h4>
            <p className="text-slate-300 text-[11px]">
              {isHindi ? 'आपकी कंपनी का डेटा सुरक्षित है एवं सभी नए फीचर्स (बैंक ऑटो-पोस्टिंग, पेरोल, जीएसटी और सुरक्षा) सक्रिय हैं।' : 'All accounting, GST, payroll, bank auto-posting, and desktop vault modules are active.'}
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition"
              >
                {isHindi ? 'बंद करें (OK)' : 'OK / Close'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex flex-col sm:flex-row items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold w-full sm:w-auto"
              >
                {isHindi ? 'बाद में' : 'Remind Me Later'}
              </button>
              <button
                type="button"
                onClick={handleApplyUpdateAction}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition transform active:scale-95 w-full sm:w-auto shrink-0"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{isHindi ? 'अभी अपडेट लागू करें' : 'Apply Update Now'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
