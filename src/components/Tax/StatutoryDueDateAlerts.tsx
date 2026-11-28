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
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-4 text-[var(--text-primary)] shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl hv-pill-amber border flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-wider hv-pill-amber px-2 py-0.5 rounded border">
                  {isHindi ? 'वैधानिक रिटर्न नियत तिथि अलर्ट' : 'Statutory Return Due Date Alerts'}
                </span>
                {overdueAlerts.length > 0 && (
                  <span className="hv-pill-rose border text-[10px] font-black px-2 py-0.5 rounded-full">
                    {overdueAlerts.length} {isHindi ? 'विलंबित' : 'Overdue'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
                {isHindi 
                  ? `GST (11/20 अगस्त) एवं TDS त्रैमासिक रिटर्न फाइलिंग नियत तिथियों की सूचना।`
                  : `GST (11th/20th) & TDS Quarterly Returns Due Date Notifications.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigateTab && onNavigateTab('tax')}
              className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer"
            >
              <span>{isHindi ? 'रिटर्न देखें' : 'View Returns'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-lg cursor-pointer"
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-[var(--border-primary)]">
            {alerts.map((alt) => (
              <div 
                key={alt.id}
                className={`p-2.5 rounded-xl border flex items-start justify-between gap-2 text-xs ${
                  alt.status === 'OVERDUE' 
                    ? 'hv-pill-rose' 
                    : alt.status === 'DUE_SOON'
                    ? 'hv-pill-amber'
                    : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)]'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{alt.returnName}</span>
                    <span className="text-[10px] font-mono text-[var(--text-muted)]">({alt.period})</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)]">{isHindi ? alt.descriptionHi : alt.descriptionEn}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    alt.status === 'OVERDUE' ? 'bg-rose-600 text-white hv-keep-white' : alt.status === 'DUE_SOON' ? 'bg-amber-400 text-slate-950' : 'hv-pill-slate border'
                  }`}>
                    {alt.status === 'OVERDUE' ? `${Math.abs(alt.daysRemaining)}D Overdue` : `Due in ${alt.daysRemaining}D`}
                  </span>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] mt-0.5">Due: {alt.dueDate}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 text-[var(--text-primary)] shadow-md space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-primary)] pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl hv-pill-amber border flex items-center justify-center shrink-0">
            <BellRing className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-black text-[var(--text-primary)]">
                {isHindi ? 'वैधानिक रिटर्न अलर्ट एवं फाइलिंग कैलेंडर' : 'Statutory Due Date Alert & Compliance Calendar'}
              </h3>
              <span className="hv-pill-indigo border text-[10px] font-bold px-2.5 py-0.5 rounded-full">
                FY {activeFy}
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {isHindi 
                ? 'जीएसटी (GSTR-1, GSTR-3B) एवं टीडीएस त्रैमासिक रिटर्न (Q1, Q2, Q3, Q4) की वैधानिक तिथियों के ऑटो-अलर्ट।'
                : 'Automated statutory due date warnings for GST (GSTR-1/3B) & Quarterly TDS Returns.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="hv-pill-rose border px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            {overdueAlerts.length} {isHindi ? 'रिटर्न विलंबित' : 'Overdue'}
          </span>
          <span className="hv-pill-amber border px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
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
                  ? 'hv-pill-rose shadow-sm' 
                  : isDueSoon
                  ? 'hv-pill-amber shadow-sm'
                  : 'bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-primary)]'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                    alt.category === 'GST' ? 'hv-pill-indigo' : 'hv-pill-emerald'
                  }`}>
                    {alt.category} Return
                  </span>

                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                    isOverdue ? 'bg-rose-600 text-white hv-keep-white' : isDueSoon ? 'bg-amber-400 text-slate-950' : 'hv-pill-slate border'
                  }`}>
                    {isOverdue ? `${Math.abs(alt.daysRemaining)} Days Overdue` : `In ${alt.daysRemaining} Days`}
                  </span>
                </div>

                <div className="font-bold text-sm text-[var(--text-primary)] pt-1">
                  {alt.returnName}
                </div>

                <div className="text-xs font-mono text-[var(--text-secondary)] flex items-center justify-between pt-0.5 border-t border-[var(--border-primary)]">
                  <span className="text-[11px] text-[var(--text-muted)]">{alt.period}</span>
                  <span className="font-bold text-amber-500">Due: {alt.dueDate}</span>
                </div>

                <p className="text-[11px] text-[var(--text-secondary)] leading-snug pt-1">
                  {isHindi ? alt.descriptionHi : alt.descriptionEn}
                </p>
              </div>

              <div className="pt-2 border-t border-[var(--border-primary)] flex items-center justify-between text-[11px]">
                <span className="text-[var(--text-muted)]">
                  {isOverdue ? (isHindi ? '⚠️ तुरंत दाखिल करें' : '⚠️ Late fee applies') : (isHindi ? 'निजी पोर्टल' : 'Statutory Date')}
                </span>
                <button
                  onClick={() => onNavigateTab && onNavigateTab('tax')}
                  className="text-indigo-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
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
