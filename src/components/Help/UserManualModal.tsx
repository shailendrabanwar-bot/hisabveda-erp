import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Search,
  X,
  CheckCircle2,
  ArrowUpRight,
  Keyboard,
  ShieldCheck,
  Lightbulb
} from 'lucide-react';
import {
  MANUAL_CATEGORIES,
  MANUAL_TOPICS,
  ManualCategoryId,
  ManualTopic,
  filterManualTopics
} from '../../utils/userManualData';

interface UserManualModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHindi: boolean;
  onNavigateTab?: (tab: any) => void;
  onOpenLicenseModal?: () => void;
  onOpenShortcutsModal?: () => void;
}

export const UserManualModal: React.FC<UserManualModalProps> = ({
  isOpen,
  onClose,
  isHindi,
  onNavigateTab,
  onOpenLicenseModal,
  onOpenShortcutsModal
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ManualCategoryId>('all');
  const [activeTopicId, setActiveTopicId] = useState<string>(MANUAL_TOPICS[0].id);

  const filteredTopics = useMemo(
    () => filterManualTopics(MANUAL_TOPICS, searchQuery, selectedCategory),
    [searchQuery, selectedCategory]
  );

  if (!isOpen) return null;

  const activeTopic: ManualTopic | undefined =
    filteredTopics.find((t) => t.id === activeTopicId) || filteredTopics[0];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[88vh] max-h-[820px] flex flex-col overflow-hidden shadow-2xl text-slate-200 animate-fadeIn">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {isHindi ? 'HISAB VEDA ERP — संपूर्ण उपयोगकर्ता गाइड (User Manual)' : 'HISAB VEDA ERP — Interactive User Manual & How-To Guide'}
              </h2>
              <p className="text-xs text-slate-400">
                {isHindi
                  ? 'बिलिंग, Tally XML इम्पोर्ट, GST रिपोर्ट, 4-लेवल ड्रिल-डाउन, शॉर्टकट्स और डेस्कटॉप लाइसेंसिंग गाइड'
                  : 'Searchable step-by-step documentation for Billing, Tally XML Import, GST, Reports & Desktop Licensing'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onOpenShortcutsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShortcutsModal();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <Keyboard className="w-3.5 h-3.5" />
                <span>{isHindi ? 'शॉर्टकट्स' : 'Shortcuts'}</span>
              </button>
            )}

            {onOpenLicenseModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLicenseModal();
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{isHindi ? 'लाइसेंस केंद्र' : 'License Center'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1 transition cursor-pointer"
              aria-label={isHindi ? 'गाइड बंद करें' : 'Close User Manual'}
            >
              <X className="w-4 h-4" />
              <span>{isHindi ? 'बंद करें' : 'Close'}</span>
            </button>
          </div>
        </div>

        {/* Search + Category Filter Strip */}
        <div className="px-5 py-3 bg-slate-900 border-b border-slate-800 space-y-2.5 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isHindi
                  ? 'विषय खोजें: जैसे Tally XML, GSTR-1 B2B, Drill-Down, Machine ID, POS, Round Off, Esc...'
                  : 'Search any topic: e.g. Tally XML, GSTR-1 B2B, Drill-Down, Machine ID, POS, Closing Stock, Esc...'
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-20 py-2 text-sm text-white placeholder-slate-400 focus:border-indigo-500 outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                {isHindi ? 'साफ़ करें' : 'Clear'}
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {MANUAL_CATEGORIES.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white border border-slate-800'
                  }`}
                >
                  {isHindi ? cat.labelHi : cat.labelEn}
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-Pane Body: Topic List (Left) + Detailed Guide (Right) */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Topics Sidebar */}
          <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-800 overflow-y-auto bg-slate-950/60 p-3 space-y-1.5">
            {filteredTopics.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 space-y-2">
                <p>{isHindi ? `"${searchQuery}" के लिए कोई विषय नहीं मिला।` : `No manual topics matched "${searchQuery}".`}</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                  className="text-indigo-400 hover:underline font-bold cursor-pointer"
                >
                  {isHindi ? 'सभी विषय दिखाएँ' : 'Show all guides'}
                </button>
              </div>
            ) : (
              filteredTopics.map((topic) => {
                const isSelected = activeTopic?.id === topic.id;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    onClick={() => setActiveTopicId(topic.id)}
                    className={`w-full text-left p-3 rounded-xl border transition cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500/60 text-white'
                        : 'bg-slate-900/70 border-slate-800/80 text-slate-300 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="text-xs font-bold leading-snug">
                      {isHindi ? topic.titleHi : topic.titleEn}
                    </div>
                    {topic.shortcutLabel && (
                      <div className="text-[11px] font-mono text-amber-300/90">
                        {topic.shortcutLabel}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Right Reading Content Pane */}
          <div className="md:col-span-8 overflow-y-auto p-5 sm:p-6 space-y-5">
            {activeTopic ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                  <div className="space-y-1.5 max-w-2xl">
                    {activeTopic.shortcutLabel && (
                      <div className="text-xs font-mono font-bold text-amber-300">
                        {activeTopic.shortcutLabel}
                      </div>
                    )}
                    <h3 className="text-lg font-extrabold text-white">
                      {isHindi ? activeTopic.titleHi : activeTopic.titleEn}
                    </h3>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {isHindi ? activeTopic.summaryHi : activeTopic.summaryEn}
                    </p>
                  </div>

                  {activeTopic.navTab && onNavigateTab && (
                    <button
                      type="button"
                      onClick={() => {
                        onNavigateTab(activeTopic.navTab);
                        onClose();
                      }}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 whitespace-nowrap cursor-pointer"
                    >
                      <span>{isHindi ? 'मॉड्यूल खोलें' : 'Open Module'}</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                    {isHindi ? 'उपयोग के चरण (Step-by-Step Instructions)' : 'Step-by-Step Workflow'}
                  </h4>
                  <ol className="space-y-2.5">
                    {(isHindi ? activeTopic.stepsHi : activeTopic.stepsEn).map((step, index) => (
                      <li
                        key={step}
                        className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-start gap-3 text-sm text-slate-200 leading-relaxed"
                      >
                        <span className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 tabular-nums">
                          {index + 1}
                        </span>
                        <span className="flex-1">{step}</span>
                        <CheckCircle2 className="w-4 h-4 text-emerald-500/60 shrink-0 mt-1 hidden sm:block" />
                      </li>
                    ))}
                  </ol>
                </div>

                {(isHindi ? activeTopic.tipsHi : activeTopic.tipsEn) && (
                  <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-200 leading-relaxed">
                    <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold text-amber-300 block mb-0.5">
                        {isHindi ? 'प्रो टिप (Pro Tip):' : 'Pro Tip:'}
                      </strong>
                      <span>{isHindi ? activeTopic.tipsHi : activeTopic.tipsEn}</span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                {isHindi ? 'बाईं ओर से कोई गाइड चुनें' : 'Select a guide topic from the left'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
