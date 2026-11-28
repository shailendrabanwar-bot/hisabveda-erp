import React, { useState, useMemo } from 'react';
import { X, Plus, Trash2, ArrowRightLeft, CheckCircle2, AlertCircle, AlertTriangle, ShieldAlert, PlusCircle } from 'lucide-react';
import { AppData, Voucher, JournalEntryLine, Account } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  generateNextNumber,
  isCashOrBankLedger,
  normalizeVoucherWithRoundOff,
  validateVoucherAccountingRules,
  evaluateBudgetOverrunForVoucher
} from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange, isDateInFinancialYear } from '../../utils/fiscalYear';
import { QuickCreateLedgerModal } from './QuickCreateLedgerModal';

interface JournalVoucherModalProps {
  data: AppData;
  isHindi: boolean;
  onSaveVoucher: (vch: Voucher) => void;
  onAddAccount?: (acc: Account) => void;
  onClose: () => void;
  editingVoucher?: Voucher;
}

export const JournalVoucherModal: React.FC<JournalVoucherModalProps> = ({
  data,
  isHindi,
  onSaveVoucher,
  onAddAccount,
  onClose,
  editingVoucher
}) => {
  const currency = data.company.currency;
  const nextNo = generateNextNumber('JRN', data.vouchers);
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  // Accounting Rule: Journal Vouchers (F7) must NEVER contain Cash or Bank ledgers (nor Group headings)
  const eligibleAccounts = data.accounts.filter(a => !a.isGroup && !isCashOrBankLedger(a));

  const defaultDrAcc =
    eligibleAccounts.find(a => a.category === 'EXPENSE') ||
    eligibleAccounts[0];
  const defaultCrAcc =
    eligibleAccounts.find(a => a.id !== defaultDrAcc?.id && (a.category === 'LIABILITY' || a.category === 'REVENUE' || a.category === 'EQUITY')) ||
    eligibleAccounts.find(a => a.id !== defaultDrAcc?.id) ||
    defaultDrAcc;

  const [voucherNumber, setVoucherNumber] = useState(editingVoucher?.voucherNumber || nextNo);
  const [date, setDate] = useState(editingVoucher?.date || defaultActiveDate);
  const [referenceNo, setReferenceNo] = useState(editingVoucher?.referenceNo || '');
  const [narration, setNarration] = useState(editingVoucher?.narration || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [quickLedgerLineId, setQuickLedgerLineId] = useState<string | null>(null);

  const defaultLines: JournalEntryLine[] = [
    {
      id: 'l_1',
      accountId: '',
      accountName: '',
      accountCode: '',
      debit: 0,
      credit: 0
    },
    {
      id: 'l_2',
      accountId: '',
      accountName: '',
      accountCode: '',
      debit: 0,
      credit: 0
    }
  ];

  const [lines, setLines] = useState<JournalEntryLine[]>(editingVoucher?.entries || defaultLines);

  const totalDebit = lines.reduce((acc, curr) => acc + (Number(curr.debit) || 0), 0);
  const totalCredit = lines.reduce((acc, curr) => acc + (Number(curr.credit) || 0), 0);
  const rawDiff = Math.abs(totalDebit - totalCredit);
  const willAutoRoundOff = totalDebit > 0 && totalCredit > 0 && rawDiff >= 0.001 && rawDiff < 1.0;
  const isBalanced = (rawDiff < 0.001 || willAutoRoundOff) && totalDebit > 0;

  // Detect any legacy or selected Cash/Bank ledger line
  const cashOrBankSelectedLines = lines.filter(l => {
    const acc = data.accounts.find(a => a.id === l.accountId);
    return isCashOrBankLedger(acc);
  });

  const budgetOverrunAlerts = useMemo(
    () => evaluateBudgetOverrunForVoucher(data, lines, date, editingVoucher?.id),
    [data, lines, date, editingVoucher?.id]
  );

  const handleAccountSelect = (lineId: string, accId: string) => {
    if (accId === '__CREATE_NEW__') {
      setQuickLedgerLineId(lineId);
      return;
    }
    const acc = eligibleAccounts.find(a => a.id === accId) || data.accounts.find(a => a.id === accId);
    if (!acc) return;
    if (isCashOrBankLedger(acc)) {
      setValidationError(
        isHindi
          ? `जर्नल वाउचर में नकद/बैंक खाता (${acc.name}) वर्जित है! इसके लिए Payment (F5), Receipt (F6) या Contra (F4) का उपयोग करें।`
          : `Cash/Bank ledger (${acc.name}) is prohibited in Journal Vouchers! Use Payment (F5), Receipt (F6), or Contra (F4).`
      );
      return;
    }
    setValidationError(null);
    setLines(prev => prev.map(l => l.id === lineId ? {
      ...l,
      accountId: acc.id,
      accountName: acc.name,
      accountCode: acc.code
    } : l));
  };

  const handleValueChange = (lineId: string, field: 'debit' | 'credit', val: number) => {
    const safeVal = Number.isFinite(val) ? Math.max(0, val) : 0;
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      if (field === 'debit') {
        return { ...l, debit: safeVal, credit: safeVal > 0 ? 0 : l.credit };
      } else {
        return { ...l, credit: safeVal, debit: safeVal > 0 ? 0 : l.debit };
      }
    }));
  };

  const handleAddLine = () => {
    setLines(prev => [
      ...prev,
      {
        id: 'l_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        accountId: '',
        accountName: '',
        accountCode: '',
        debit: 0,
        credit: 0
      }
    ]);
  };

  const handleRemoveLine = (lineId: string) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter(l => l.id !== lineId));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (eligibleAccounts.length < 2) {
      setValidationError(
        isHindi
          ? 'जर्नल प्रविष्टि के लिए Chart of Accounts में कम से कम 2 गैर-नकद/गैर-बैंक लेजर होने चाहिए।'
          : 'At least 2 non-Cash / non-Bank ledgers are required in Chart of Accounts for a Journal Entry.'
      );
      return;
    }

    const rawVoucher: Voucher = {
      id: editingVoucher?.id || 'vch_' + Date.now(),
      voucherNumber: voucherNumber.trim(),
      type: 'JOURNAL',
      date,
      referenceNo: referenceNo.trim(),
      entries: lines,
      totalAmount: Math.round(totalDebit * 100) / 100,
      narration: narration.trim() || 'Journal adjustment voucher'
    };

    const newVoucher = normalizeVoucherWithRoundOff(rawVoucher, data.accounts);

    const validation = validateVoucherAccountingRules(
      newVoucher,
      data,
      fyRange.fyStart,
      loadAppConfig(),
      editingVoucher?.id
    );
    if (!validation.valid) {
      const firstErr = validation.errors[0];
      setValidationError(isHindi ? firstErr.hi : firstErr.en);
      return;
    }

    onSaveVoucher(newVoucher);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-[var(--text-primary)]">
        <div className="p-4 hv-elevated border-b border-[var(--border-subtle)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {editingVoucher
                ? (isHindi ? `जर्नल वाउचर संपादित करें (${editingVoucher.voucherNumber})` : `Edit Journal Voucher (${editingVoucher.voucherNumber})`)
                : (isHindi ? 'नया जर्नल वाउचर प्रविष्टि (Journal Entry - F7)' : 'New Double-Entry Journal Voucher (F7)')}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-sm">
          {/* Accounting Golden Rule Notice */}
          <div className="p-3 hv-pill-indigo border rounded-xl flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">
                {isHindi ? 'लेखांकन नियम (Journal Voucher Rule): ' : 'Accounting Rule (Non-Cash Adjustments Only): '}
              </span>
              {isHindi
                ? 'जर्नल वाउचर में कैश (Cash) या बैंक (Bank) खाते वर्जित हैं। यह केवल समायोजन, मूल्यह्रास (Depreciation), प्रोविजन व नॉन-कैश एंट्री के लिए है। कैश/बैंक के लिए Payment (F5), Receipt (F6) या Contra (F4) चुनें।'
                : 'Cash & Bank ledgers are strictly prohibited in Journal Vouchers. Use Journal (F7) only for adjustments, accruals, provisions, depreciation, & transfers. For Cash/Bank, use Payment (F5), Receipt (F6), or Contra (F4).'}
            </div>
          </div>

          {cashOrBankSelectedLines.length > 0 && (
            <div className="p-3 hv-pill-amber border rounded-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                {isHindi
                  ? 'चेतावनी: इस पुराने जर्नल वाउचर में कैश/बैंक खाता जुड़ा है। सेव करने से पहले कृपया इसे गैर-नकद/गैर-बैंक लेजर में बदलें या Payment/Receipt/Contra वाउचर बनाएं।'
                  : 'Rule Warning: This voucher contains a Cash/Bank ledger. Please replace it with a non-Cash/non-Bank ledger before saving, or record it via Payment / Receipt / Contra.'}
              </span>
            </div>
          )}

          {validationError && (
            <div className="p-3 hv-pill-rose border rounded-xl font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="hover:opacity-75">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {budgetOverrunAlerts.length > 0 && (
            <div className="p-3 hv-pill-amber border rounded-xl space-y-1 text-xs">
              {budgetOverrunAlerts.map((alert) => (
                <div key={alert.accountId} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <span className="font-bold">
                      {isHindi
                        ? `बजट सीमा चेतावनी (${alert.accountName}): `
                        : `Budget Overrun Alert (${alert.accountName}): `}
                    </span>
                    {isHindi
                      ? `मासिक बजट ${formatCurrency(alert.monthlyLimit, currency)} है; इस प्रविष्टि से कुल खर्च ${formatCurrency(alert.projectedActual, currency)} (+${formatCurrency(alert.exceededBy, currency)} / +${alert.exceededPercent.toFixed(1)}%) हो जाएगा।`
                      : `Monthly budget is ${formatCurrency(alert.monthlyLimit, currency)}; projected spend will reach ${formatCurrency(alert.projectedActual, currency)} (over by ${formatCurrency(alert.exceededBy, currency)} / +${alert.exceededPercent.toFixed(1)}%). Posting remains allowed.`}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 hv-elevated p-3 rounded-xl border border-[var(--border-subtle)]">
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'वाउचर नंबर' : 'Voucher Number'}
              </label>
              <input
                type="text"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'तिथि' : 'Date'}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
                required
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'संदर्भ सं. (Ref No)' : 'Reference / Memo No'}
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="REF-1001"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 font-mono"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="space-y-2">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <span className="font-bold text-[var(--text-primary)]">
                {isHindi ? 'डेबिट/क्रेडिट खाते (Cash/Bank रहित)' : 'Journal Debit / Credit Entries (Non-Cash/Non-Bank Ledgers)'}
              </span>
              <div className="flex items-center gap-2">
                {onAddAccount && (
                  <button
                    type="button"
                    onClick={() => setQuickLedgerLineId(lines[0]?.id || 'l_1')}
                    className="flex items-center gap-1 hv-pill-indigo border px-2.5 py-1 rounded-lg text-xs font-bold transition"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>{isHindi ? '+ नया लेजर बनाएँ' : '+ New Ledger'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAddLine}
                  className="flex items-center gap-1 text-indigo-500 hover:opacity-80 text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Entry Line</span>
                </button>
              </div>
            </div>

            <div className="border border-[var(--border-subtle)] rounded-xl overflow-x-auto max-h-[38vh] overflow-y-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold text-xs uppercase border-b border-[var(--border-subtle)]">
                  <tr>
                    <th className="p-2.5">Particulars / Account Name</th>
                    <th className="p-2.5 w-36 text-right">Debit (नामे) ({currency})</th>
                    <th className="p-2.5 w-36 text-right">Credit (जमा) ({currency})</th>
                    <th className="p-2.5 w-10 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                  {lines.map((line) => {
                    const currentAcc = data.accounts.find(a => a.id === line.accountId);
                    const isIllegalLine = isCashOrBankLedger(currentAcc);
                    return (
                      <tr key={line.id} className={isIllegalLine ? 'hv-pill-rose' : 'hover:bg-[var(--hover-surface)]'}>
                        <td className="p-2">
                          <div className="flex items-center gap-1.5">
                            <select
                              value={line.accountId}
                              onChange={(e) => handleAccountSelect(line.id, e.target.value)}
                              className={`w-full hv-input border rounded-lg p-2 text-xs ${
                                isIllegalLine ? 'border-rose-500 text-rose-500' : 'border-[var(--border-subtle)]'
                              }`}
                            >
                              <option value="">{isHindi ? '-- लेजर खाता चुनें --' : '-- Select Ledger Account --'}</option>
                              {isIllegalLine && currentAcc && (
                                <option value={currentAcc.id} disabled>
                                  ⚠️ [{currentAcc.code}] {currentAcc.name} (Cash/Bank Prohibited — Select Another)
                                </option>
                              )}
                              {eligibleAccounts.map((acc) => (
                                <option key={acc.id} value={acc.id}>
                                  [{acc.code}] {acc.name} ({acc.category})
                                </option>
                              ))}
                              {onAddAccount && (
                                <option value="__CREATE_NEW__" className="text-indigo-500 font-bold">
                                  {isHindi ? '➕ + नया लेजर खाता बनाएँ...' : '➕ + Create New Ledger Account...'}
                                </option>
                              )}
                            </select>
                            {onAddAccount && (
                              <button
                                type="button"
                                onClick={() => setQuickLedgerLineId(line.id)}
                                title={isHindi ? 'इस पंक्ति के लिए नया लेजर बनाएँ' : 'Create new ledger for this row'}
                                className="p-2 hv-pill-indigo border rounded-lg shrink-0 transition"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.debit || ''}
                            placeholder="0.00"
                            onChange={(e) => handleValueChange(line.id, 'debit', Number(e.target.value))}
                            className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-right font-mono text-emerald-500"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={line.credit || ''}
                            placeholder="0.00"
                            onChange={(e) => handleValueChange(line.id, 'credit', Number(e.target.value))}
                            className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-right font-mono text-indigo-500"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-40"
                            disabled={lines.length <= 2}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation Balance Banner */}
          <div className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-sm font-semibold ${
            isBalanced ? 'hv-pill-emerald' : 'hv-pill-rose'
          }`}>
            <div className="flex items-center gap-2">
              {isBalanced ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
              <span>
                {willAutoRoundOff
                  ? (isHindi
                      ? `₹${rawDiff.toFixed(2)} का राउंड-ऑफ स्वतः Round Off A/c में समायोजित होगा (Debit = Credit)`
                      : `Sub-rupee remainder (${currency} ${rawDiff.toFixed(2)}) will auto-post to Round Off A/c`)
                  : isBalanced
                  ? (isHindi ? 'जर्नल प्रविष्टि संतुलित है (Debit = Credit)' : 'Journal is balanced: Debit equals Credit')
                  : (isHindi ? 'जर्नल असंतुलित है! डेबिट और क्रेडिट बराबर करें' : 'Journal Unbalanced! Adjust Debit / Credit amounts')}
              </span>
            </div>
            <div className="space-x-4 font-mono tabular-nums">
              <span>Dr: {formatCurrency(totalDebit, currency)}</span>
              <span>Cr: {formatCurrency(totalCredit, currency)}</span>
            </div>
          </div>

          {/* Narration */}
          <div>
            <label className="block text-[var(--text-secondary)] font-semibold mb-1">
              {isHindi ? 'नारेशन / विवरण (Narration)' : 'Voucher Narration / Memo'}
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Being adjustment entry passed for..."
              className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={!isBalanced}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white hv-keep-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition"
            >
              {isHindi ? 'जर्नल वाउचर सेव करें' : 'Post Journal Voucher'}
            </button>
          </div>
        </form>
      </div>

      {onAddAccount && (
        <QuickCreateLedgerModal
          isOpen={quickLedgerLineId !== null}
          isHindi={isHindi}
          existingAccounts={data.accounts}
          existingGroups={data.accountGroups}
          voucherContext="JOURNAL"
          onCreateAccount={onAddAccount}
          onCreatedAndSelect={(newAcc) => {
            if (quickLedgerLineId) {
              setValidationError(null);
              setLines(prev => prev.map(l => l.id === quickLedgerLineId ? {
                ...l,
                accountId: newAcc.id,
                accountName: newAcc.name,
                accountCode: newAcc.code
              } : l));
            }
          }}
          onClose={() => setQuickLedgerLineId(null)}
        />
      )}
    </div>
  );
};
