import React, { useState } from 'react';
import { AlertTriangle, Clock, Calendar, ShieldAlert, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, BellRing } from 'lucide-react';
import { getStatutoryDueDates, getTdsFormMapping, StatutoryReturnAlert } from '../../utils/dueDates';

interface StatutoryDueDateAlertsProps {
  isHindi: boolean;
  activeFy?: string;
  onNavigateTab?: (tab: string) => void;
  compact?: boolean;
}

export const StatutoryDueDateAlerts: React.FC<StatutoryDueDateAlertsProps> = ({
  isHindi,
  activeFy = '2026-27',
  onNavigateTab,
  compact = false
}) => {
  const [expanded, setExpanded] = useState(!compact);
  const alerts = getStatutoryDueDates(activeFy);
  const formMapping = getTdsFormMapping(activeFy);

  const overdueAlerts = alerts.filter(a => a.status === 'OVERDUE');
  const dueSoonAlerts = alerts.filter(a => a.status === 'DUE_SOON');

  if (compact) {
    return (
      <div className="bg-gradient-to-r from-amber-950/60 via-slate-900 to-slate-900 border border-amber-500/40 rounded-2xl p-4 text-white shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  {isHindi ? 'वैधानिक रिटर्न नियत तिथि अलर्ट' : 'Statutory Return Due Date Alerts'}
                </span>
                {overdueAlerts.length > 0 && (
                  <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {overdueAlerts.length} {isHindi ? 'विलंबित' : 'Overdue'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 font-medium mt-0.5">
                {isHindi 
                  ? `GST (11/20 अगस्त) एवं TDS त्रैमासिक रिटर्न फाइलिंग नियत तिथियों की सूचना।`
                  : `GST (11th/20th) & TDS Quarterly Returns Due Date Notifications.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab && onNavigateTab('tax')}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition"
            >
              <span>{isHindi ? 'रिटर्न देखें' : 'View Returns'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-slate-400 hover:text-white p-1 rounded-lg"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
            {alerts.map((alt) => (
              <div 
                key={alt.id}
                className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 text-xs ${
                  alt.status === 'OVERDUE' 
                    ? 'bg-rose-950/40 border-rose-800/60 text-rose-200' 
                    : alt.status === 'DUE_SOON'
                    ? 'bg-amber-950/40 border-amber-800/60 text-amber-200'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{alt.returnName}</span>
                    <span className="text-[10px] opacity-75 font-mono">({alt.period})</span>
                  </div>
                  <p className="text-[11px] opacity-80">{isHindi ? alt.descriptionHi : alt.descriptionEn}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    alt.status === 'OVERDUE' ? 'bg-rose-600 text-white' : alt.status === 'DUE_SOON' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {alt.status === 'OVERDUE' ? `${Math.abs(alt.daysRemaining)}D Overdue` : `Due in ${alt.daysRemaining}D`}
                  </span>
                  <div className="text-[10px] font-mono text-slate-400 mt-0.5">Due: {alt.dueDate}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-800/40 rounded-2xl p-5 text-white shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-white">
                {isHindi ? 'वैधानिक रिटर्न अलर्ट एवं फाइलिंग कैलेंडर' : 'Statutory Due Date Alert & Compliance Calendar'}
              </h3>
              <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                FY {activeFy}
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              {isHindi 
                ? 'जीएसटी (GSTR-1, GSTR-3B) एवं टीडीएस त्रैमासिक रिटर्न (Q1, Q2, Q3, Q4) की वैधानिक तिथियों के ऑटो-अलर्ट।'
                : 'Automated statutory due date warnings for GST (GSTR-1/3B) & Quarterly TDS Returns.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdueAlerts.length} {isHindi ? 'रिटर्न विलंबित' : 'Overdue'}
          </span>
          <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {dueSoonAlerts.length} {isHindi ? 'शीघ्र देय' : 'Due Soon'}
          </span>
        </div>
      </div>

      {/* Grid of Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {alerts.map((alt) => {
          const isOverdue = alt.status === 'OVERDUE';
          const isDueSoon = alt.status === 'DUE_SOON';

          return (
            <div 
              key={alt.id}
              className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition ${
                isOverdue 
                  ? 'bg-rose-950/30 border-rose-800/70 text-rose-100 shadow-lg shadow-rose-950/20' 
                  : isDueSoon
                  ? 'bg-amber-950/30 border-amber-800/70 text-amber-100 shadow-lg shadow-amber-950/20'
                  : 'bg-slate-950/70 border-slate-800 text-slate-200'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                    alt.category === 'GST' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    {alt.category} Return
                  </span>

                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                    isOverdue ? 'bg-rose-600 text-white' : isDueSoon ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {isOverdue ? `${Math.abs(alt.daysRemaining)} Days Overdue` : `In ${alt.daysRemaining} Days`}
                  </span>
                </div>

                <div className="font-bold text-sm text-white pt-1">
                  {alt.returnName}
                </div>

                <div className="text-xs font-mono text-slate-300 flex items-center justify-between pt-0.5 border-t border-slate-800/60">
                  <span className="text-[11px] opacity-75">{alt.period}</span>
                  <span className="font-bold text-amber-400">Due: {alt.dueDate}</span>
                </div>

                <p className="text-[11px] text-slate-300 leading-snug pt-1">
                  {isHindi ? alt.descriptionHi : alt.descriptionEn}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">
                  {isOverdue ? (isHindi ? '⚠️ तुरंत दाखिल करें' : '⚠️ Late fee applies') : (isHindi ? 'निजी पोर्टल' : 'Statutory Date')}
                </span>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('tax')}
                  className="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1"
                >
                  <span>{isHindi ? 'फाइल करें' : 'File Now'}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
