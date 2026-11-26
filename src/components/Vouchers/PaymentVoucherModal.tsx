import React, { useState, useMemo } from 'react';
import { X, ArrowDownLeft, AlertCircle, AlertTriangle, PlusCircle } from 'lucide-react';
import { AppData, Voucher, Account } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  generateNextNumber,
  isCashLedger,
  isBankLedger,
  isCashOrBankLedger,
  getLedgerAvailableBalance,
  validateVoucherAccountingRules,
  evaluateBudgetOverrunForVoucher
} from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange, isDateInFinancialYear } from '../../utils/fiscalYear';
import { QuickCreateLedgerModal, QuickLedgerContext } from './QuickCreateLedgerModal';

interface PaymentVoucherModalProps {
  data: AppData;
  isHindi: boolean;
  onSaveVoucher: (vch: Voucher) => void;
  onAddAccount?: (acc: Account) => void;
  onClose: () => void;
  editingVoucher?: Voucher;
}

export const PaymentVoucherModal: React.FC<PaymentVoucherModalProps> = ({
  data,
  isHindi,
  onSaveVoucher,
  onAddAccount,
  onClose,
  editingVoucher
}) => {
  const currency = data.company.currency;
  const nextNo = generateNextNumber('PAY', data.vouchers);
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  const cashAccounts = data.accounts.filter(isCashLedger);
  const bankAccounts = data.accounts.filter(isBankLedger);
  const allMoneyAccounts = data.accounts.filter(isCashOrBankLedger);

  // Debit Account (Paid To) must NEVER be Cash or Bank (use Contra F4 for Cash<->Bank)
  const eligibleDebitLedgers = data.accounts.filter(a => !a.isGroup && !isCashOrBankLedger(a));

  const initialMode: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CARD' =
    editingVoucher?.paymentMode || (bankAccounts.length > 0 ? 'BANK_TRANSFER' : 'CASH');

  const initialBankOrCash = (() => {
    if (!editingVoucher) return '';
    const editedSrc = editingVoucher?.bankAccountId || editingVoucher?.entries?.find(e => e.credit > 0)?.accountId;
    if (editedSrc && allMoneyAccounts.some(a => a.id === editedSrc)) return editedSrc;
    return '';
  })();

  const initialDebitAccId = (() => {
    if (!editingVoucher) return '';
    const editedDr = editingVoucher?.entries?.find(e => e.debit > 0)?.accountId;
    if (editedDr && eligibleDebitLedgers.some(a => a.id === editedDr)) return editedDr;
    return '';
  })();

  const [voucherNumber, setVoucherNumber] = useState(editingVoucher?.voucherNumber || nextNo);
  const [date, setDate] = useState(editingVoucher?.date || defaultActiveDate);
  const [amount, setAmount] = useState<number>(editingVoucher?.totalAmount || 0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CARD'>(initialMode);
  const [bankAccountId, setBankAccountId] = useState(initialBankOrCash);
  const [expenseAccountId, setExpenseAccountId] = useState(initialDebitAccId);
  const [partyId, setPartyId] = useState(editingVoucher?.partyId || '');
  const [referenceNo, setReferenceNo] = useState(editingVoucher?.referenceNo || '');
  const [narration, setNarration] = useState(editingVoucher?.narration || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [quickLedgerContext, setQuickLedgerContext] = useState<QuickLedgerContext | null>(null);

  const selectedParty = data.parties.find(p => p.id === partyId);
  const selectedExpAcc = eligibleDebitLedgers.find(a => a.id === expenseAccountId);
  const selectedBankAcc = allMoneyAccounts.find(a => a.id === bankAccountId);

  const modeFilteredSources =
    paymentMode === 'CASH'
      ? (cashAccounts.length > 0 ? cashAccounts : allMoneyAccounts)
      : (bankAccounts.length > 0 ? bankAccounts : allMoneyAccounts);

  const sourceBalance = bankAccountId
    ? getLedgerAvailableBalance(bankAccountId, data, editingVoucher?.id)
    : null;

  const isCashDeficit =
    selectedBankAcc &&
    isCashLedger(selectedBankAcc) &&
    sourceBalance !== null &&
    sourceBalance.signedDrBalance - (amount || 0) < -0.01;

  const budgetOverrunAlerts = useMemo(() => {
    if (!expenseAccountId || !(Number(amount) > 0)) return [];
    return evaluateBudgetOverrunForVoucher(
      data,
      [{ accountId: expenseAccountId, debit: Number(amount) || 0, credit: 0 }],
      date,
      editingVoucher?.id
    );
  }, [data, expenseAccountId, amount, date, editingVoucher?.id]);

  const handlePaymentModeChange = (mode: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CARD') => {
    setPaymentMode(mode);
    setValidationError(null);
    if (!bankAccountId) return;
    if (mode === 'CASH') {
      if (selectedBankAcc && !isCashLedger(selectedBankAcc)) {
        setBankAccountId(cashAccounts[0]?.id || '');
      }
    } else {
      if (selectedBankAcc && isCashLedger(selectedBankAcc)) {
        setBankAccountId(bankAccounts[0]?.id || '');
      }
    }
  };

  const handlePartyChange = (newPartyId: string) => {
    setPartyId(newPartyId);
    if (newPartyId) {
      const party = data.parties.find(p => p.id === newPartyId);
      const preferredGlId = party?.type === 'CUSTOMER' ? 'acc_debtors' : 'acc_creditors';
      const preferredGl = eligibleDebitLedgers.find(a => a.id === preferredGlId);
      if (preferredGl) {
        setExpenseAccountId(preferredGl.id);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedBankAcc) {
      setValidationError(isHindi ? 'कृपया भुगतान के लिए वैध बैंक या कैश खाता चुनें।' : 'Please select a valid Paid From bank or cash account.');
      return;
    }
    if (!selectedExpAcc) {
      setValidationError(isHindi ? 'कृपया मान्य नामे (Debit) लेजर खाता चुनें।' : 'Please select a valid Debit (Expense / Party GL) ledger account.');
      return;
    }

    // Dr GL Account (Sundry Creditors / Expense / Liability — NEVER partyId!)
    // Cr Bank / Cash Account
    const entries = [
      {
        id: 'pe_1',
        accountId: selectedExpAcc.id,
        accountName: selectedExpAcc.name,
        accountCode: selectedExpAcc.code,
        debit: Math.round((Number(amount) || 0) * 100) / 100,
        credit: 0
      },
      {
        id: 'pe_2',
        accountId: selectedBankAcc.id,
        accountName: selectedBankAcc.name,
        accountCode: selectedBankAcc.code,
        debit: 0,
        credit: Math.round((Number(amount) || 0) * 100) / 100
      }
    ];

    const newVoucher: Voucher = {
      id: editingVoucher?.id || 'vch_' + Date.now(),
      voucherNumber: voucherNumber.trim(),
      type: 'PAYMENT',
      date,
      referenceNo: referenceNo.trim(),
      partyId: selectedParty?.id,
      partyName: selectedParty?.name,
      paymentMode,
      bankAccountId: selectedBankAcc.id,
      entries,
      totalAmount: Math.round((Number(amount) || 0) * 100) / 100,
      narration: narration.trim() || `Payment made via ${paymentMode}${selectedParty ? ` to ${selectedParty.name}` : ''}`
    };

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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowDownLeft className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-white">
              {editingVoucher
                ? (isHindi ? `भुगतान वाउचर संपादित करें (${editingVoucher.voucherNumber})` : `Edit Payment Voucher (${editingVoucher.voucherNumber})`)
                : (isHindi ? 'नया भुगतान वाउचर (Payment Voucher - F5)' : 'Record Payment Voucher (Outflow - F5)')}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white bg-slate-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {validationError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/50 rounded-xl text-rose-200 font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="text-rose-300 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {budgetOverrunAlerts.length > 0 && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-xl text-amber-200 space-y-1">
              {budgetOverrunAlerts.map((alert) => (
                <div key={alert.accountId} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] leading-relaxed">
                    <span className="font-bold text-amber-300">
                      {isHindi
                        ? `बजट सीमा चेतावनी (${alert.accountName}): `
                        : `Budget Overrun Alert (${alert.accountName}): `}
                    </span>
                    {isHindi
                      ? `मासिक बजट ${formatCurrency(alert.monthlyLimit, currency)} है; यह वाउचर जुड़ने पर कुल खर्च ${formatCurrency(alert.projectedActual, currency)} होगा (+${formatCurrency(alert.exceededBy, currency)} / +${alert.exceededPercent.toFixed(1)}% अधिक)। आप चाहें तो फिर भी सेव कर सकते हैं।`
                      : `Monthly budget is ${formatCurrency(alert.monthlyLimit, currency)}; projected spend will reach ${formatCurrency(alert.projectedActual, currency)} (exceeding by ${formatCurrency(alert.exceededBy, currency)} / +${alert.exceededPercent.toFixed(1)}%). You may still post this voucher.`}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? 'वाउचर नंबर' : 'Voucher Number'}
              </label>
              <input
                type="text"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? 'भुगतान तिथि' : 'Payment Date'}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? 'विक्रेता / प्राप्तकर्ता पार्टी (Optional)' : 'Vendor / Party Paid (Optional)'}
              </label>
              <select
                value={partyId}
                onChange={(e) => handlePartyChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2"
              >
                <option value="">-- No Specific Party (Direct Expense) --</option>
                {data.parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-slate-300 font-semibold">
                  {isHindi ? 'खर्च / लेजर नामे (Debit Account) *' : 'Debit Ledger (Expense/Payable) *'}
                </label>
                {onAddAccount && (
                  <button
                    type="button"
                    onClick={() => setQuickLedgerContext('PAYMENT_DEBIT')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-300 hover:text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/40 px-2 py-0.5 rounded-md transition"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>{isHindi ? '+ नया लेजर' : '+ New Ledger'}</span>
                  </button>
                )}
              </div>
              <select
                value={expenseAccountId}
                onChange={(e) => {
                  if (e.target.value === '__CREATE_NEW__') {
                    setQuickLedgerContext('PAYMENT_DEBIT');
                    return;
                  }
                  setExpenseAccountId(e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2"
                required
              >
                <option value="">{isHindi ? '-- लेजर खाता चुनें --' : '-- Select Debit Ledger --'}</option>
                {eligibleDebitLedgers.map((acc) => (
                  <option key={acc.id} value={acc.id}>[{acc.code}] {acc.name} ({acc.category})</option>
                ))}
                {onAddAccount && (
                  <option value="__CREATE_NEW__" className="text-indigo-300 font-bold">
                    {isHindi ? '➕ + नया खर्च / लेजर खाता बनाएँ...' : '➕ + Create New Expense / Ledger...'}
                  </option>
                )}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">
                {isHindi ? 'नोट: कैश ↔ बैंक ट्रांसफर के लिए Contra (F4) का उपयोग करें।' : 'Note: Use Contra (F4) for Cash ↔ Bank transfers.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? 'भुगतान माध्यम' : 'Payment Mode'}
              </label>
              <select
                value={paymentMode}
                onChange={(e) => handlePaymentModeChange(e.target.value as any)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2"
              >
                <option value="BANK_TRANSFER">Bank Transfer (IMPS/NEFT)</option>
                <option value="UPI">UPI Payment</option>
                <option value="CHEQUE">Cheque</option>
                <option value="CASH">Cash in Hand</option>
                <option value="CARD">Credit / Debit Card</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-slate-300 font-semibold">
                  {isHindi ? 'बैंक या कैश खाता (Paid From) *' : 'Paid From Account (Cash/Bank) *'}
                </label>
                {onAddAccount && (
                  <button
                    type="button"
                    onClick={() => setQuickLedgerContext('PAYMENT_SOURCE')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 hover:text-emerald-200 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 px-2 py-0.5 rounded-md transition"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>{isHindi ? '+ नया बैंक/कैश' : '+ New Bank/Cash'}</span>
                  </button>
                )}
              </div>
              <select
                value={bankAccountId}
                onChange={(e) => {
                  if (e.target.value === '__CREATE_NEW__') {
                    setQuickLedgerContext('PAYMENT_SOURCE');
                    return;
                  }
                  setBankAccountId(e.target.value);
                }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2"
                required
              >
                <option value="">{isHindi ? '-- बैंक / कैश खाता चुनें --' : '-- Select Bank / Cash Account --'}</option>
                {modeFilteredSources.map((acc) => (
                  <option key={acc.id} value={acc.id}>[{acc.code}] {acc.name}</option>
                ))}
                {onAddAccount && (
                  <option value="__CREATE_NEW__" className="text-emerald-300 font-bold">
                    {isHindi ? '➕ + नया बैंक / कैश खाता जोड़ें...' : '➕ + Add New Bank / Cash Account...'}
                  </option>
                )}
              </select>
              {sourceBalance && (
                <p className={`text-[11px] font-mono mt-1 ${isCashDeficit ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                  {isHindi ? 'उपलब्ध शेष: ' : 'Available: '}
                  {formatCurrency(sourceBalance.netBalance, currency)} {sourceBalance.balanceType}
                  {isCashDeficit && (isHindi ? ' — अपर्याप्त नकद!' : ' — Insufficient Cash!')}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? `कुल भुगतान राशि (${currency})` : `Total Paid Amount (${currency}) *`}
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount || ''}
                placeholder="0.00"
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 font-mono text-sm text-rose-400 font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                {isHindi ? 'ट्रांजैक्शन / यूटीआर नंबर' : 'Transaction Ref / UTR No'}
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="UTR/99881122"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              {isHindi ? 'नारेशन / टिप्पणी' : 'Narration'}
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Rent paid for July 2026..."
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl shadow-lg shadow-rose-600/30 transition"
            >
              {editingVoucher ? (isHindi ? 'भुगतान अपडेट करें' : 'Update Payment') : (isHindi ? 'भुगतान दर्ज करें' : 'Record Payment')}
            </button>
          </div>
        </form>
      </div>

      {onAddAccount && (
        <QuickCreateLedgerModal
          isOpen={quickLedgerContext !== null}
          isHindi={isHindi}
          existingAccounts={data.accounts}
          existingGroups={data.accountGroups}
          voucherContext={quickLedgerContext || 'PAYMENT_DEBIT'}
          onCreateAccount={onAddAccount}
          onCreatedAndSelect={(newAcc) => {
            setValidationError(null);
            if (quickLedgerContext === 'PAYMENT_SOURCE') {
              setPaymentMode(isCashLedger(newAcc) ? 'CASH' : 'BANK_TRANSFER');
              setBankAccountId(newAcc.id);
            } else {
              setExpenseAccountId(newAcc.id);
            }
          }}
          onClose={() => setQuickLedgerContext(null)}
        />
      )}
    </div>
  );
};
