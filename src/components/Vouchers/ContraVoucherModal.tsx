import React, { useState } from 'react';
import { X, RefreshCw, AlertCircle, PlusCircle } from 'lucide-react';
import { AppData, Voucher, Account } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  generateNextNumber,
  isCashLedger,
  isCashOrBankLedger,
  getLedgerAvailableBalance,
  validateVoucherAccountingRules
} from '../../utils/accounting';
import { loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange, isDateInFinancialYear } from '../../utils/fiscalYear';
import { QuickCreateLedgerModal } from './QuickCreateLedgerModal';

interface ContraVoucherModalProps {
  data: AppData;
  isHindi: boolean;
  onSaveVoucher: (vch: Voucher) => void;
  onAddAccount?: (acc: Account) => void;
  onClose: () => void;
  editingVoucher?: Voucher;
}

export const ContraVoucherModal: React.FC<ContraVoucherModalProps> = ({
  data,
  isHindi,
  onSaveVoucher,
  onAddAccount,
  onClose,
  editingVoucher
}) => {
  const currency = data.company.currency;
  const nextNo = generateNextNumber('CNT', data.vouchers);
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const todayIso = new Date().toISOString().split('T')[0];
  const defaultActiveDate = isDateInFinancialYear(todayIso, fyRange.fyStart) ? todayIso : fyRange.fyEnd;

  // Strictly ONLY Cash & Bank ledgers (excluding Group headings)
  const bankAndCashAccounts = data.accounts.filter(a => !a.isGroup && isCashOrBankLedger(a));

  const [voucherNumber, setVoucherNumber] = useState(editingVoucher?.voucherNumber || nextNo);
  const [date, setDate] = useState(editingVoucher?.date || defaultActiveDate);
  const [amount, setAmount] = useState<number>(editingVoucher?.totalAmount || 0);
  const [fromAccountId, setFromAccountId] = useState<string>(
    editingVoucher ? (editingVoucher.entries?.find(e => e.credit > 0)?.accountId || '') : ''
  );
  const [toAccountId, setToAccountId] = useState<string>(
    editingVoucher ? (editingVoucher.entries?.find(e => e.debit > 0)?.accountId || '') : ''
  );
  const [referenceNo, setReferenceNo] = useState(editingVoucher?.referenceNo || '');
  const [narration, setNarration] = useState(editingVoucher?.narration || '');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [quickTargetSide, setQuickTargetSide] = useState<'FROM' | 'TO' | null>(null);

  const selectedFrom = bankAndCashAccounts.find(a => a.id === fromAccountId);
  const selectedTo = bankAndCashAccounts.find(a => a.id === toAccountId);

  const fromBalance = fromAccountId
    ? getLedgerAvailableBalance(fromAccountId, data, editingVoucher?.id)
    : null;
  const toBalance = toAccountId
    ? getLedgerAvailableBalance(toAccountId, data, editingVoucher?.id)
    : null;

  const isCashDeficit =
    selectedFrom &&
    isCashLedger(selectedFrom) &&
    fromBalance !== null &&
    fromBalance.signedDrBalance - (amount || 0) < -0.01;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!selectedFrom || !selectedTo) {
      setValidationError(isHindi ? 'कृपया सोर्स और डेस्टिनेशन दोनों कैश/बैंक खाते चुनें।' : 'Please select both Source and Destination Cash/Bank accounts.');
      return;
    }

    const roundedAmt = Math.round((Number(amount) || 0) * 100) / 100;

    // Dr Destination Account (Bank / Cash)
    // Cr Source Account (Cash / Bank)
    const entries = [
      {
        id: `cnt_dr_${Date.now()}`,
        accountId: selectedTo.id,
        accountName: selectedTo.name,
        accountCode: selectedTo.code,
        debit: roundedAmt,
        credit: 0
      },
      {
        id: `cnt_cr_${Date.now()}`,
        accountId: selectedFrom.id,
        accountName: selectedFrom.name,
        accountCode: selectedFrom.code,
        debit: 0,
        credit: roundedAmt
      }
    ];

    const isCashInvolved = isCashLedger(selectedFrom) || isCashLedger(selectedTo);
    const voucher: Voucher = {
      id: editingVoucher?.id || `vch_cnt_${Date.now()}`,
      voucherNumber: voucherNumber.trim(),
      type: 'CONTRA',
      date,
      referenceNo: referenceNo.trim(),
      partyName: `${selectedFrom.name} ➔ ${selectedTo.name}`,
      paymentMode: isCashInvolved ? 'CASH' : 'BANK_TRANSFER',
      entries,
      totalAmount: roundedAmt,
      narration: narration.trim() || `Contra Transfer of ${formatCurrency(roundedAmt, currency)}`
    };

    const validation = validateVoucherAccountingRules(
      voucher,
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

    onSaveVoucher(voucher);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden my-auto animate-fadeIn">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-950 via-slate-900 to-slate-900 p-5 border-b border-amber-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400">
              <RefreshCw className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <span>{editingVoucher ? (isHindi ? 'कॉण्ट्रा वाउचर संपादित करें' : 'Edit Contra Voucher') : (isHindi ? 'नया कॉण्ट्रा वाउचर (Contra Voucher - F4)' : 'Create Contra Voucher (F4)')}</span>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full font-mono border border-amber-500/30">
                  CONTRA
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {isHindi ? 'बैंक में कैश जमा, बैंक से कैश निकासी या बैंक से बैंक ट्रांसफर' : 'Cash Deposit to Bank, Cash Withdrawal or Inter-Bank Transfer'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl border border-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {bankAndCashAccounts.length < 2 && (
            <div className="p-3 bg-amber-500/15 border border-amber-500/50 rounded-xl text-amber-200 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {isHindi
                  ? 'कॉण्ट्रा वाउचर के लिए Chart of Accounts में कम से कम 2 कैश/बैंक खाते होने आवश्यक हैं।'
                  : 'At least 2 Cash/Bank ledgers are required in Chart of Accounts to post a Contra Voucher.'}
              </span>
            </div>
          )}

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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? 'वाउचर सं. (Voucher No.):' : 'Voucher No:'}
              </label>
              <input
                type="text"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? 'दिनांक (Date):' : 'Date:'}
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono"
              />
            </div>
          </div>

          {/* Transfer direction */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-rose-400 font-bold flex items-center gap-1">
                    <span>{isHindi ? 'खाते से निकाला (Credit - From):' : 'Transfer From (Cr / Paid Out):'}</span>
                  </label>
                  {onAddAccount && (
                    <button
                      type="button"
                      onClick={() => setQuickTargetSide('FROM')}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-2 py-0.5 rounded-md transition"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>{isHindi ? '+ नया बैंक/कैश' : '+ New'}</span>
                    </button>
                  )}
                </div>
                <select
                  value={fromAccountId}
                  onChange={(e) => {
                    if (e.target.value === '__CREATE_NEW__') {
                      setQuickTargetSide('FROM');
                      return;
                    }
                    setFromAccountId(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-amber-400"
                >
                  <option value="">{isHindi ? '-- कैश/बैंक खाता चुनें --' : '-- Select Cash / Bank Account --'}</option>
                  {bankAndCashAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                  ))}
                  {onAddAccount && (
                    <option value="__CREATE_NEW__" className="text-amber-300 font-bold">
                      {isHindi ? '➕ + नया बैंक / कैश खाता बनाएँ...' : '➕ + Add New Bank / Cash Ledger...'}
                    </option>
                  )}
                </select>
                {fromBalance && (
                  <p className={`text-[11px] font-mono mt-1 ${isCashDeficit ? 'text-rose-400 font-bold' : 'text-slate-400'}`}>
                    {isHindi ? 'उपलब्ध: ' : 'Avail: '}{formatCurrency(fromBalance.netBalance, currency)} {fromBalance.balanceType}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-emerald-400 font-bold flex items-center gap-1">
                    <span>{isHindi ? 'खाते में जमा हुआ (Debit - To):' : 'Transfer To (Dr / Received In):'}</span>
                  </label>
                  {onAddAccount && (
                    <button
                      type="button"
                      onClick={() => setQuickTargetSide('TO')}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 px-2 py-0.5 rounded-md transition"
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>{isHindi ? '+ नया बैंक/कैश' : '+ New'}</span>
                    </button>
                  )}
                </div>
                <select
                  value={toAccountId}
                  onChange={(e) => {
                    if (e.target.value === '__CREATE_NEW__') {
                      setQuickTargetSide('TO');
                      return;
                    }
                    setToAccountId(e.target.value);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-white outline-none focus:border-amber-400"
                >
                  <option value="">{isHindi ? '-- कैश/बैंक खाता चुनें --' : '-- Select Cash / Bank Account --'}</option>
                  {bankAndCashAccounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} ({acc.code})</option>
                  ))}
                  {onAddAccount && (
                    <option value="__CREATE_NEW__" className="text-amber-300 font-bold">
                      {isHindi ? '➕ + नया बैंक / कैश खाता बनाएँ...' : '➕ + Add New Bank / Cash Ledger...'}
                    </option>
                  )}
                </select>
                {toBalance && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {isHindi ? 'शेष: ' : 'Bal: '}{formatCurrency(toBalance.netBalance, currency)} {toBalance.balanceType}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  {isHindi ? 'स्थानांतरित राशि (Amount):' : 'Transfer Amount:'}
                </label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount || ''}
                  placeholder="0.00"
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  required
                  className="w-full bg-slate-900 border border-amber-500/50 rounded-xl px-3 py-2 text-sm text-amber-300 font-mono font-extrabold"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  {isHindi ? 'रेफरेंस / चेकमार्क / UTR सं.:' : 'Ref / Cheque / UTR No:'}
                </label>
                <input
                  type="text"
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="e.g. UTR-9821415 or CHQ-0012"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              {isHindi ? 'विवरण / नारेशन (Narration):' : 'Narration / Remarks:'}
            </label>
            <textarea
              rows={2}
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
              placeholder={isHindi ? 'कैश बैंक में जमा कराया गया...' : 'Cash deposited into bank account...'}
            />
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-4 py-2.5 rounded-xl transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>

            <button
              type="submit"
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-6 py-2.5 rounded-xl shadow-lg transition transform active:scale-95"
            >
              {editingVoucher ? (isHindi ? 'वाउचर सहेजें' : 'Update Voucher') : (isHindi ? 'कॉण्ट्रा वाउचर दर्ज करें' : 'Save Contra Voucher')}
            </button>
          </div>
        </form>

      </div>

      {onAddAccount && (
        <QuickCreateLedgerModal
          isOpen={quickTargetSide !== null}
          isHindi={isHindi}
          existingAccounts={data.accounts}
          existingGroups={data.accountGroups}
          voucherContext="CONTRA"
          onCreateAccount={onAddAccount}
          onCreatedAndSelect={(newAcc) => {
            setValidationError(null);
            if (quickTargetSide === 'FROM') {
              setFromAccountId(newAcc.id);
            } else {
              setToAccountId(newAcc.id);
            }
          }}
          onClose={() => setQuickTargetSide(null)}
        />
      )}
    </div>
  );
};
