import React, { useState, useMemo } from 'react';
import { Keyboard, Search, X, ArrowRight, Sparkles } from 'lucide-react';
import { APP_SHORTCUT_DEFINITIONS, AppShortcutDef, ShortcutCategoryId } from '../../utils/keyboardShortcuts';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  isHindi: boolean;
  onClose: () => void;
  onExecuteShortcut?: (def: AppShortcutDef) => void;
}

const CATEGORY_LABELS: Record<ShortcutCategoryId, { en: string; hi: string; badgeClass: string }> = {
  NAVIGATION: {
    en: 'Module & Page Navigation',
    hi: 'मॉड्यूल एवं पेज नेविगेशन',
    badgeClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
  },
  VOUCHERS: {
    en: 'Quick Voucher & Invoice Creation',
    hi: 'त्वरित वाउचर व बिल निर्माण',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  },
  REPORTS: {
    en: 'Reports, Sub-Tabs & Period Controls',
    hi: 'रिपोर्ट्स, सब-टैब एवं अवधि नियंत्रण',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  },
  SYSTEM: {
    en: 'System, Search & Configuration',
    hi: 'सिस्टम, सर्च व कॉन्फ़िगरेशन',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  }
};

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  isHindi,
  onClose,
  onExecuteShortcut
}) => {
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState<ShortcutCategoryId | 'ALL'>('ALL');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return APP_SHORTCUT_DEFINITIONS.filter((def) => {
      if (activeCat !== 'ALL' && def.category !== activeCat) return false;
      if (!q) return true;
      return (
        def.keys.toLowerCase().includes(q) ||
        def.labelEn.toLowerCase().includes(q) ||
        def.labelHi.toLowerCase().includes(q) ||
        def.descEn.toLowerCase().includes(q) ||
        def.descHi.toLowerCase().includes(q)
      );
    });
  }, [query, activeCat]);

  if (!isOpen) return null;

  const grouped: Record<ShortcutCategoryId, AppShortcutDef[]> = {
    NAVIGATION: filtered.filter((d) => d.category === 'NAVIGATION'),
    VOUCHERS: filtered.filter((d) => d.category === 'VOUCHERS'),
    REPORTS: filtered.filter((d) => d.category === 'REPORTS'),
    SYSTEM: filtered.filter((d) => d.category === 'SYSTEM')
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <Keyboard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>{isHindi ? 'कीबोर्ड शॉर्टकट एवं त्वरित कमांड सेंटर' : 'Keyboard Shortcuts & Command Center'}</span>
                <span className="text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full">
                  Alt+K / ?
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'कीबोर्ड से शॉर्टकट दबाएं या किसी भी विकल्प पर सीधे माउस से क्लिक करके तुरंत खोलें'
                  : 'Press shortcut keys on your keyboard or click any action below with your mouse'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition"
            aria-label="Close shortcuts"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Category Filter */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isHindi ? 'शॉर्टकट, मॉड्यूल या रिपोर्ट खोजें (जैसे F8, GSTR, Stock)...' : 'Search shortcut, module, voucher or report (e.g. F8, GSTR, Stock)...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveCat('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                activeCat === 'ALL'
                  ? 'bg-indigo-600 text-white border-indigo-400'
                  : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              {isHindi ? 'सभी' : 'All'}
            </button>
            {(['NAVIGATION', 'VOUCHERS', 'REPORTS', 'SYSTEM'] as ShortcutCategoryId[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCat(cat)}
                className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                  activeCat === cat
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {cat === 'NAVIGATION' ? (isHindi ? 'पेज' : 'Pages') :
                 cat === 'VOUCHERS' ? (isHindi ? 'वाउचर' : 'Vouchers') :
                 cat === 'REPORTS' ? (isHindi ? 'रिपोर्ट्स' : 'Reports') :
                 (isHindi ? 'सिस्टम' : 'System')}
              </button>
            ))}
          </div>
        </div>

        {/* Shortcut Grid */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {(['VOUCHERS', 'REPORTS', 'NAVIGATION', 'SYSTEM'] as ShortcutCategoryId[]).map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const meta = CATEGORY_LABELS[cat];
            return (
              <div key={cat} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${meta.badgeClass}`}>
                    {isHindi ? meta.hi : meta.en}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">{items.length} shortcuts</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {items.map((def) => {
                    const isClickable = def.actionType !== 'INFO' && Boolean(onExecuteShortcut);
                    return (
                      <button
                        key={def.id}
                        type="button"
                        disabled={!isClickable}
                        onClick={() => {
                          if (isClickable && onExecuteShortcut) {
                            onExecuteShortcut(def);
                            onClose();
                          }
                        }}
                        className={`text-left p-3 rounded-2xl border flex items-center justify-between gap-3 transition ${
                          isClickable
                            ? 'bg-slate-950/80 hover:bg-slate-800/90 border-slate-800 hover:border-indigo-500/60 cursor-pointer group'
                            : 'bg-slate-950/50 border-slate-800/70 cursor-default'
                        }`}
                      >
                        <div className="min-w-0 space-y-0.5">
                          <div className="font-bold text-xs text-white flex items-center gap-1.5 truncate">
                            <span className="truncate">{isHindi ? def.labelHi : def.labelEn}</span>
                            {isClickable && (
                              <ArrowRight className="w-3.5 h-3.5 text-indigo-400 opacity-0 group-hover:opacity-100 transition shrink-0" />
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 line-clamp-1">
                            {isHindi ? def.descHi : def.descEn}
                          </div>
                        </div>

                        <span className="shrink-0 font-mono text-[11px] font-extrabold px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-amber-300 shadow-inner">
                          {def.keys}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="py-12 text-center text-slate-500 text-xs">
              {isHindi ? `"${query}" से मिलता कोई शॉर्टकट नहीं मिला` : `No keyboard shortcut matching "${query}"`}
            </div>
          )}
        </div>

        {/* Footer Tip */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>
              {isHindi
                ? 'टिप: किसी भी रिपोर्ट (Financial Statements, MIS Reports, GST) में Alt+1 से Alt+8 दबाकर सीधे सब-रिपोर्ट बदलें।'
                : 'Tip: Inside Financial Statements, MIS Reports, GST, or Inventory, press Alt+1 to Alt+8 to switch report sub-tabs instantly.'}
            </span>
          </div>
          <span className="font-mono text-slate-500">Esc = Close</span>
        </div>
      </div>
    </div>
  );
};
