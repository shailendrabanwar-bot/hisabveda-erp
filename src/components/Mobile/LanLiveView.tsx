import React, { useEffect, useState, useCallback } from 'react';
import {
  Wifi,
  RefreshCw,
  Landmark,
  Users,
  Receipt,
  Lock,
  MessageCircle,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { LanLiveSnapshot } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { buildWhatsAppLedgerReminderUrl } from '../../utils/enterpriseErpHelpers';
import { SnaLogo } from '../SnaLogo';

interface LanLiveViewProps {
  isHindi: boolean;
  initialCode?: string;
}

export const LanLiveView: React.FC<LanLiveViewProps> = ({ isHindi, initialCode = '' }) => {
  const [pairCode, setPairCode] = useState<string>(() => initialCode.trim().toUpperCase());
  const [codeInput, setCodeInput] = useState<string>(() => initialCode.trim().toUpperCase());
  const [snapshot, setSnapshot] = useState<LanLiveSnapshot | null>(null);
  const [waitingForHost, setWaitingForHost] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'cashbank' | 'parties' | 'sales'>('cashbank');
  const [partySearch, setPartySearch] = useState<string>('');
  const [lastFetchedAt, setLastFetchedAt] = useState<string>('');

  const fetchSnapshot = useCallback(async (activeCode: string) => {
    const cleanCode = activeCode.trim().toUpperCase();
    if (!cleanCode) {
      setLoading(false);
      setAuthError(
        isHindi
          ? 'मुख्य PC से प्राप्त 6-अंकीय पेयरिंग कोड (Pairing Code) दर्ज करें।'
          : 'Enter the 6-character Pairing Code shown on your main billing PC.'
      );
      return;
    }

    try {
      const res = await fetch(`/api/lan/snapshot?code=${encodeURIComponent(cleanCode)}`, {
        headers: { 'x-lan-code': cleanCode },
        cache: 'no-store',
      });
      if (res.status === 401) {
        setAuthError(
          isHindi
            ? 'अमान्य पेयरिंग कोड। कृपया मुख्य PC पर "Mobile & LAN Setup" में नया कोड देखें।'
            : 'Invalid or expired pairing code. Check the active code in Mobile & LAN Setup on the main PC.'
        );
        setSnapshot(null);
        setWaitingForHost(false);
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = await res.json();
      setAuthError(null);
      if (json.waiting || !json.snapshot) {
        setWaitingForHost(true);
        setSnapshot(null);
      } else {
        setWaitingForHost(false);
        setSnapshot(json.snapshot as LanLiveSnapshot);
        setLastFetchedAt(new Date().toLocaleTimeString());
      }
    } catch {
      setAuthError(
        isHindi
          ? 'लोकल वाई-फ़ाई सर्वर से कनेक्ट नहीं हो सका। सुनिश्चित करें कि मुख्य PC और आपका फ़ोन एक ही Wi-Fi पर हैं।'
          : 'Unable to reach local Wi-Fi ERP server. Ensure both devices are on the same shop Wi-Fi network.'
      );
    } finally {
      setLoading(false);
    }
  }, [isHindi]);

  useEffect(() => {
    fetchSnapshot(pairCode);
  }, [pairCode, fetchSnapshot]);

  useEffect(() => {
    if (!autoRefresh || !pairCode) return;
    const timer = setInterval(() => {
      fetchSnapshot(pairCode);
    }, 5000);
    return () => clearInterval(timer);
  }, [autoRefresh, pairCode, fetchSnapshot]);

  const handleUnlockWithCode = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPairCode(codeInput.trim().toUpperCase());
  };

  const currency = snapshot?.currency || 'INR';
  const filteredParties = (snapshot?.partyOutstandings || []).filter((p) =>
    p.name.toLowerCase().includes(partySearch.trim().toLowerCase())
  );

  return (
    <div className="hv-app-shell hv-canvas min-h-screen font-sans pb-12">
      <header className="sticky top-0 z-20 bg-[var(--bg-header)] backdrop-blur-md border-b border-[var(--border-primary)] px-4 py-3 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SnaLogo size="sm" showText={false} />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] tracking-tight">
                  {snapshot?.companyName || 'HISAB VEDA Live LAN View'}
                </h1>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold hv-pill-emerald border px-2 py-0.5 rounded-full">
                  <Wifi className="w-3 h-3" />
                  <span>{isHindi ? 'Wi-Fi लाइव (Read-Only)' : 'Wi-Fi Live View'}</span>
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                {snapshot?.fyLabel && <span>{snapshot.fyLabel}</span>}
                {lastFetchedAt && (
                  <span className="inline-flex items-center gap-1 text-[var(--text-secondary)]">
                    <Clock className="w-3 h-3 text-indigo-500" />
                    {isHindi ? `अपडेटेड: ${lastFetchedAt}` : `Synced: ${lastFetchedAt}`}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((v) => !v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                autoRefresh
                  ? 'hv-pill-emerald'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
              }`}
            >
              {autoRefresh ? (isHindi ? 'ऑटो-सिंक चालू (5s)' : 'Auto-Sync: ON') : (isHindi ? 'ऑटो-सिंक बंद' : 'Auto-Sync: OFF')}
            </button>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                fetchSnapshot(pairCode);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{isHindi ? 'रिफ्रेश' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {authError && (
          <form
            onSubmit={handleUnlockWithCode}
            className="bg-[var(--bg-surface)] border border-amber-500/40 rounded-2xl p-5 max-w-md mx-auto space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl hv-pill-amber border">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-[var(--text-primary)]">
                  {isHindi ? 'लोकल LAN पेयरिंग कोड दर्ज करें' : 'Enter Local Wi-Fi Pairing Code'}
                </h2>
                <p className="text-xs text-[var(--text-muted)]">{authError}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. A1B2C3"
                maxLength={12}
                className="flex-1 bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 font-mono text-sm font-bold tracking-widest uppercase text-[var(--text-primary)] focus:border-indigo-500 outline-none"
                required
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-extrabold rounded-xl text-xs transition cursor-pointer"
              >
                {isHindi ? 'कनेक्ट करें' : 'Connect'}
              </button>
            </div>
          </form>
        )}

        {!authError && waitingForHost && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-8 text-center space-y-3 max-w-lg mx-auto">
            <Wifi className="w-10 h-10 text-indigo-500 mx-auto animate-pulse" />
            <h2 className="font-bold text-base text-[var(--text-primary)]">
              {isHindi ? 'मुख्य PC से लाइव डेटा की प्रतीक्षा है...' : 'Connected to LAN! Waiting for Main PC Sync...'}
            </h2>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              {isHindi
                ? 'मुख्य कंप्यूटर पर HISAB VEDA में लॉगिन करें (या "Mobile & LAN Setup" में "Sync Live Data Now" दबाएँ)। डेटा अपने आप यहाँ दिखाई देगा।'
                : 'Make sure HISAB VEDA is open on your main billing PC (or click "Sync Live Data Now" inside Mobile & LAN Setup).'}
            </p>
          </div>
        )}

        {snapshot && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-3.5">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {isHindi ? 'आज की बिक्री' : "Today's Sales"}
                </span>
                <p className="text-base sm:text-lg font-mono font-extrabold text-emerald-500 mt-1 tabular-nums">
                  {formatCurrency(snapshot.summary.todaySales, currency)}
                </p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-3.5">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {isHindi ? 'कुल बिक्री' : 'Total Sales'}
                </span>
                <p className="text-base sm:text-lg font-mono font-extrabold text-[var(--text-primary)] mt-1 tabular-nums">
                  {formatCurrency(snapshot.summary.totalSales, currency)}
                </p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-indigo-500/40 rounded-2xl p-3.5">
                <span className="text-xs font-semibold text-indigo-500">
                  {isHindi ? 'कैश व बैंक शेष' : 'Cash & Bank'}
                </span>
                <p className="text-base sm:text-lg font-mono font-extrabold text-indigo-500 mt-1 tabular-nums">
                  {formatCurrency(snapshot.summary.cashAndBankBalance, currency)}
                </p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-3.5">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {isHindi ? 'कुल प्राप्य (बकाया)' : 'Receivables'}
                </span>
                <p className="text-base sm:text-lg font-mono font-extrabold text-amber-500 mt-1 tabular-nums">
                  {formatCurrency(snapshot.summary.totalReceivables, currency)}
                </p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-3.5">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {isHindi ? 'कुल देय' : 'Payables'}
                </span>
                <p className="text-base sm:text-lg font-mono font-extrabold text-rose-500 mt-1 tabular-nums">
                  {formatCurrency(snapshot.summary.totalPayables, currency)}
                </p>
              </div>

              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-3.5">
                <span className="text-xs font-semibold text-[var(--text-muted)]">
                  {isHindi ? 'बकाया बिल' : 'Pending Bills'}
                </span>
                <p className="text-base sm:text-lg font-mono font-extrabold text-sky-500 mt-1 tabular-nums">
                  {snapshot.summary.pendingInvoicesCount} / {snapshot.summary.invoiceCount}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 bg-[var(--bg-surface)] p-2 rounded-2xl border border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => setActiveTab('cashbank')}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'cashbank'
                    ? 'bg-indigo-600 text-white hv-keep-white shadow'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                <Landmark className="w-4 h-4" />
                <span>{isHindi ? 'कैश व बैंक खाते' : 'Cash & Bank'} ({snapshot.cashBankAccounts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('parties')}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'parties'
                    ? 'bg-indigo-600 text-white hv-keep-white shadow'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>{isHindi ? 'पार्टी बकाया (Outstandings)' : 'Party Outstandings'} ({snapshot.partyOutstandings.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sales')}
                className={`flex-1 min-w-[140px] py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  activeTab === 'sales'
                    ? 'bg-indigo-600 text-white hv-keep-white shadow'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                <Receipt className="w-4 h-4" />
                <span>{isHindi ? 'ताज़ा बिक्री बिल' : 'Recent Sales'} ({snapshot.recentInvoices.length})</span>
              </button>
            </div>

            {activeTab === 'cashbank' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {snapshot.cashBankAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-4 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase border ${
                          acc.kind === 'CASH'
                            ? 'hv-pill-emerald'
                            : 'hv-pill-sky'
                        }`}
                      >
                        {acc.kind} • {acc.code}
                      </span>
                      <h3 className="font-bold text-sm text-[var(--text-primary)] mt-1.5">{acc.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-base font-mono font-extrabold text-[var(--text-primary)] tabular-nums">
                        {formatCurrency(acc.balance, currency)}
                      </p>
                      <span className="text-[11px] font-mono text-[var(--text-muted)]">{acc.balanceType}</span>
                    </div>
                  </div>
                ))}
                {snapshot.cashBankAccounts.length === 0 && (
                  <div className="col-span-full text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl">
                    {isHindi ? 'कोई कैश या बैंक खाता उपलब्ध नहीं है।' : 'No Cash or Bank accounts synced yet.'}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'parties' && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={partySearch}
                    onChange={(e) => setPartySearch(e.target.value)}
                    placeholder={isHindi ? 'पार्टी नाम से खोजें...' : 'Search party by name...'}
                    className="w-full bg-[var(--bg-input)] border border-[var(--border-primary)] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-indigo-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredParties.map((p) => {
                    const waHref = buildWhatsAppLedgerReminderUrl({
                      partyName: p.name,
                      partyPhone: p.phone,
                      company: {
                        name: snapshot.companyName,
                        currency,
                      },
                      closingBalance: p.balance,
                      closingType: p.balanceType,
                      isHindi,
                    });
                    return (
                      <div
                        key={p.id}
                        className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-4 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded hv-pill-slate border">
                              {p.type}
                            </span>
                            {p.pendingInvoicesCount > 0 && (
                              <span className="text-[11px] text-amber-500 font-semibold">
                                {p.pendingInvoicesCount} {isHindi ? 'लंबित बिल' : 'pending'}
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-sm text-[var(--text-primary)] mt-1 truncate">{p.name}</h4>
                          {p.phone && <p className="text-xs text-[var(--text-muted)] font-mono">{p.phone}</p>}
                        </div>

                        <div className="text-right shrink-0 space-y-1.5">
                          <p
                            className={`text-base font-mono font-extrabold tabular-nums ${
                              p.balanceType === 'DR' ? 'text-amber-500' : 'text-rose-500'
                            }`}
                          >
                            {formatCurrency(p.balance, currency)}{' '}
                            <span className="text-xs">{p.balanceType}</span>
                          </p>
                          {p.balanceType === 'DR' && (
                            <a
                              href={waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white px-2.5 py-1 rounded-lg transition"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>{isHindi ? 'WhatsApp रिमाइंडर' : 'WhatsApp'}</span>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {filteredParties.length === 0 && (
                    <div className="col-span-full bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-8 text-center text-xs text-[var(--text-muted)]">
                      <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
                      {isHindi ? 'कोई बकाया पार्टी नहीं मिली।' : 'No matching party outstandings.'}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'sales' && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm tabular-nums">
                    <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-xs uppercase">
                      <tr>
                        <th className="p-3">{isHindi ? 'बिल नं.' : 'Invoice #'}</th>
                        <th className="p-3">{isHindi ? 'तिथि' : 'Date'}</th>
                        <th className="p-3">{isHindi ? 'पार्टी' : 'Customer'}</th>
                        <th className="p-3 text-right">{isHindi ? 'कुल राशि' : 'Total'}</th>
                        <th className="p-3 text-right">{isHindi ? 'प्राप्त' : 'Paid'}</th>
                        <th className="p-3 text-center">{isHindi ? 'स्थिति' : 'Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)]">
                      {snapshot.recentInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-[var(--hover-surface)]">
                          <td className="p-3 font-mono font-bold text-indigo-500">{inv.invoiceNumber}</td>
                          <td className="p-3 font-mono text-[var(--text-secondary)]">{inv.date}</td>
                          <td className="p-3 font-semibold text-[var(--text-primary)]">{inv.partyName}</td>
                          <td className="p-3 text-right font-mono font-bold text-[var(--text-primary)]">
                            {formatCurrency(inv.grandTotal, currency)}
                          </td>
                          <td className="p-3 text-right font-mono text-emerald-500">
                            {formatCurrency(inv.amountPaid, currency)}
                          </td>
                          <td className="p-3 text-center">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                                inv.status === 'PAID'
                                  ? 'hv-pill-emerald'
                                  : inv.status === 'PARTIAL'
                                  ? 'hv-pill-amber'
                                  : 'hv-pill-rose'
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                      {snapshot.recentInvoices.length === 0 && (
                        <tr>
                          <td colSpan={6} className="p-6 text-center text-xs text-[var(--text-muted)]">
                            <AlertCircle className="w-5 h-5 mx-auto mb-1 text-[var(--text-muted)]" />
                            {isHindi ? 'कोई हालिया बिक्री बिल नहीं है।' : 'No recent sales invoices found.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};
