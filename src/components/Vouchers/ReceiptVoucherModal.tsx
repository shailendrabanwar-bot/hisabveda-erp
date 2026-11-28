import React, { useState } from 'react';
import { X, ArrowUpRight, AlertCircle, PlusCircle } from 'lucide-react';
import { AppData, Voucher, Account } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  generateNextNumber,
  isCashLedger,
  isBankLedger,
  isCashOrBankLedger,
  getLedgerAvailableBalance,
  validateVoucherAccountingRules
} from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange, isDateInFinancialYear } from '../../utils/fiscalYear';
import { QuickCreateLedgerModal, QuickLedgerContext } from './QuickCreateLedgerModal';

interface ReceiptVoucherModalProps {
  data: AppData;
  isHindi: boolean;
  onSaveVoucher: (vch: Voucher) => void;
  onAddAccount?: (acc: Account) => void;
  onClose: () => void;
  editingVoucher?: Voucher;
}

export const ReceiptVoucherModal: React.FC<ReceiptVoucherModalProps> = ({
  data,
  isHindi,
  onSaveVoucher,
  onAddAccount,
  onClose,
  editingVoucher
}) => {
  const currency = data.company.currency;
  const nextNo = generateNextNumber('RCT', data.vouchers);
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  const cashAccounts = data.accounts.filter(isCashLedger);
  const bankAccounts = data.accounts.filter(isBankLedger);
  const allMoneyAccounts = data.accounts.filter(isCashOrBankLedger);

  // Credit Account (Received From) must NEVER be Cash or Bank (use Contra F4 for Cash<->Bank)
  const eligibleCreditLedgers = data.accounts.filter(a => !a.isGroup && !isCashOrBankLedger(a));

  const initialMode: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CARD' =
    editingVoucher?.paymentMode || (bankAccounts.length > 0 ? 'BANK_TRANSFER' : 'CASH');

  const initialBankOrCash = (() => {
    if (!editingVoucher) return '';
    const editedDst = editingVoucher?.bankAccountId || editingVoucher?.entries?.find(e => e.debit > 0)?.accountId;
    if (editedDst && allMoneyAccounts.some(a => a.id === editedDst)) return editedDst;
    return '';
  })();

  const initialCreditAccId = (() => {
    if (!editingVoucher) return '';
    const editedCr = editingVoucher?.entries?.find(e => e.credit > 0)?.accountId;
    if (editedCr && eligibleCreditLedgers.some(a => a.id === editedCr)) return editedCr;
    return '';
  })();

  const [voucherNumber, setVoucherNumber] = useState(editingVoucher?.voucherNumber || nextNo);
  const [date, setDate] = useState(editingVoucher?.date || defaultActiveDate);
  const [amount, setAmount] = useState<number>(editingVoucher?.totalAmount || 0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CARD'>(initialMode);
  const [bankAccountId, setBankAccountId] = useState(initialBankOrCash);
  const [incomeAccountId, setIncomeAccountId] = useState(initialCreditAccId);
  const [partyId, setPartyId] = useState(editingVoucher?.partyId || '');
  const [referenceNo, setReferenceNo] = useState(editingVoucher?.referenceNo || '');
  const [narration, setNarration] = useState(editingVoucher?.narration || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [quickLedgerContext, setQuickLedgerContext] = useState<QuickLedgerContext | null>(null);

  const selectedParty = data.parties.find(p => p.id === partyId);
  const selectedIncomeAcc = eligibleCreditLedgers.find(a => a.id === incomeAccountId);
  const selectedBankAcc = allMoneyAccounts.find(a => a.id === bankAccountId);

  const modeFilteredTargets =
    paymentMode === 'CASH'
      ? (cashAccounts.length > 0 ? cashAccounts : allMoneyAccounts)
      : (bankAccounts.length > 0 ? bankAccounts : allMoneyAccounts);

  const targetBalance = bankAccountId
    ? getLedgerAvailableBalance(bankAccountId, data, editingVoucher?.id)
    : null;

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
      const preferredGlId = party?.type === 'VENDOR' ? 'acc_creditors' : 'acc_debtors';
      const preferredGl = eligibleCreditLedgers.find(a => a.id === preferredGlId);
      if (preferredGl) {
        setIncomeAccountId(preferredGl.id);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedBankAcc) {
      setValidationError(isHindi ? 'कृपया प्राप्ति के लिए वैध बैंक या कैश खाता चुनें।' : 'Please select a valid Received Into bank or cash account.');
      return;
    }
    if (!selectedIncomeAcc) {
      setValidationError(isHindi ? 'कृपया मान्य जमा (Credit) लेजर खाता चुनें।' : 'Please select a valid Credit (Income / Party GL) ledger account.');
      return;
    }

    // Dr Cash/Bank
    // Cr GL Account (Sundry Debtors / Revenue / Capital / Liability — NEVER partyId!)
    const entries = [
      {
        id: 're_1',
        accountId: selectedBankAcc.id,
        accountName: selectedBankAcc.name,
        accountCode: selectedBankAcc.code,
        debit: Math.round((Number(amount) || 0) * 100) / 100,
        credit: 0
      },
      {
        id: 're_2',
        accountId: selectedIncomeAcc.id,
        accountName: selectedIncomeAcc.name,
        accountCode: selectedIncomeAcc.code,
        debit: 0,
        credit: Math.round((Number(amount) || 0) * 100) / 100
      }
    ];

    const newVoucher: Voucher = {
      id: editingVoucher?.id || 'vch_' + Date.now(),
      voucherNumber: voucherNumber.trim(),
      type: 'RECEIPT',
      date,
      referenceNo: referenceNo.trim(),
      partyId: selectedParty?.id,
      partyName: selectedParty?.name,
      paymentMode,
      bankAccountId: selectedBankAcc.id,
      entries,
      totalAmount: Math.round((Number(amount) || 0) * 100) / 100,
      narration: narration.trim() || `Receipt collected via ${paymentMode}${selectedParty ? ` from ${selectedParty.name}` : ''}`
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
      <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-[var(--text-primary)]">
        <div className="p-4 hv-elevated border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-5 h-5 text-emerald-500" />
            <h3 className="text-base font-bold text-[var(--text-primary)]">
              {editingVoucher
                ? (isHindi ? `रसीद वाउचर संपादित करें (${editingVoucher.voucherNumber})` : `Edit Receipt Voucher (${editingVoucher.voucherNumber})`)
                : (isHindi ? 'नया रसीद वाउचर (Receipt Voucher - F6)' : 'Record Receipt Voucher (Inflow - F6)')}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {validationError && (
            <div className="p-3 hv-pill-rose border rounded-xl font-bold flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{validationError}</span>
              </div>
              <button type="button" onClick={() => setValidationError(null)} className="opacity-80 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 hv-elevated p-3 rounded-xl border border-[var(--border-primary)]">
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
                {isHindi ? 'प्राप्ति तिथि' : 'Receipt Date'}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'ग्राहक पार्टी (Optional)' : 'Customer Party Received From (Optional)'}
              </label>
              <select
                value={partyId}
                onChange={(e) => handlePartyChange(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
              >
                <option value="">-- Direct Income / No Party --</option>
                {data.parties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[var(--text-secondary)] font-semibold">
                  {isHindi ? 'आय / देनदार लेजर (Credit Account) *' : 'Credit Ledger (Income/Receivable) *'}
                </label>
                {onAddAccount && (
                  <button
                    type="button"
                    onClick={() => setQuickLedgerContext('RECEIPT_CREDIT')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold hv-pill-indigo border px-2 py-0.5 rounded-md transition"
                  >
                    <PlusCircle className="w-3 h-3" />
                    <span>{isHindi ? '+ नया लेजर' : '+ New Ledger'}</span>
                  </button>
                )}
              </div>
              <select
                value={incomeAccountId}
                onChange={(e) => {
                  if (e.target.value === '__CREATE_NEW__') {
                    setQuickLedgerContext('RECEIPT_CREDIT');
                    return;
                  }
                  setIncomeAccountId(e.target.value);
                }}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
                required
              >
                <option value="">{isHindi ? '-- लेजर खाता चुनें --' : '-- Select Credit Ledger --'}</option>
                {eligibleCreditLedgers.map((acc) => (
                  <option key={acc.id} value={acc.id}>[{acc.code}] {acc.name} ({acc.category})</option>
                ))}
                {onAddAccount && (
                  <option value="__CREATE_NEW__" className="text-indigo-500 font-bold">
                    {isHindi ? '➕ + नया आय / लेजर खाता बनाएँ...' : '➕ + Create New Income / Ledger...'}
                  </option>
                )}
              </select>
              <p className="text-[10px] text-[var(--text-muted)] mt-1">
                {isHindi ? 'नोट: कैश ↔ बैंक जमा/निकासी के लिए Contra (F4) का उपयोग करें।' : 'Note: Use Contra (F4) for Cash ↔ Bank deposits/withdrawals.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'प्राप्ति माध्यम' : 'Received Via'}
              </label>
              <select
                value={paymentMode}
                onChange={(e) => handlePaymentModeChange(e.target.value as any)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
              >
                <option value="BANK_TRANSFER">Bank Transfer (IMPS/NEFT)</option>
                <option value="UPI">UPI Transfer</option>
                <option value="CHEQUE">Cheque Deposit</option>
                <option value="CASH">Cash in Hand</option>
                <option value="CARD">Credit / Debit Card</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-[var(--text-secondary)] font-semibold">
                  {isHindi ? 'बैंक या कैश खाता (Received Into) *' : 'Received Into Account (Cash/Bank) *'}
                </label>
                {onAddAccount && (
                  <button
                    type="button"
                    onClick={() => setQuickLedgerContext('RECEIPT_TARGET')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold hv-pill-emerald border px-2 py-0.5 rounded-md transition"
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
                    setQuickLedgerContext('RECEIPT_TARGET');
                    return;
                  }
                  setBankAccountId(e.target.value);
                }}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
                required
              >
                <option value="">{isHindi ? '-- बैंक / कैश खाता चुनें --' : '-- Select Bank / Cash Account --'}</option>
                {modeFilteredTargets.map((acc) => (
                  <option key={acc.id} value={acc.id}>[{acc.code}] {acc.name}</option>
                ))}
                {onAddAccount && (
                  <option value="__CREATE_NEW__" className="text-emerald-500 font-bold">
                    {isHindi ? '➕ + नया बैंक / कैश खाता जोड़ें...' : '➕ + Add New Bank / Cash Account...'}
                  </option>
                )}
              </select>
              {targetBalance && (
                <p className="text-[11px] font-mono text-[var(--text-muted)] mt-1">
                  {isHindi ? 'वर्तमान शेष: ' : 'Current Balance: '}
                  {formatCurrency(targetBalance.netBalance, currency)} {targetBalance.balanceType}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? `प्राप्त राशि (${currency})` : `Amount Received (${currency}) *`}
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount || ''}
                placeholder="0.00"
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2.5 font-mono text-sm text-emerald-500 font-bold"
                required
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                {isHindi ? 'संदर्भ सं. / बैंक यूटीआर' : 'Transaction Ref / Cheque No'}
              </label>
              <input
                type="text"
                value={referenceNo}
                onChange={(e) => setReferenceNo(e.target.value)}
                placeholder="IMPS-88776655"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[var(--text-secondary)] font-semibold mb-1">
              {isHindi ? 'नारेशन / टिप्पणी' : 'Narration'}
            </label>
            <input
              type="text"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder="Amount collected against invoice..."
              className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition"
            >
              {editingVoucher ? (isHindi ? 'रसीद अपडेट करें' : 'Update Receipt') : (isHindi ? 'रसीद सेव करें' : 'Record Receipt')}
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
          voucherContext={quickLedgerContext || 'RECEIPT_CREDIT'}
          onCreateAccount={onAddAccount}
          onCreatedAndSelect={(newAcc) => {
            setValidationError(null);
            if (quickLedgerContext === 'RECEIPT_TARGET') {
              setPaymentMode(isCashLedger(newAcc) ? 'CASH' : 'BANK_TRANSFER');
              setBankAccountId(newAcc.id);
            } else {
              setIncomeAccountId(newAcc.id);
            }
          }}
          onClose={() => setQuickLedgerContext(null)}
        />
      )}
    </div>
  );
};
