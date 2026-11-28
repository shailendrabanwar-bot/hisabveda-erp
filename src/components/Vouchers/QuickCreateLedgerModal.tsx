import React, { useState, useMemo, useEffect } from 'react';
import { X, PlusCircle, CheckCircle2, AlertCircle, Landmark, Wallet, BookOpen } from 'lucide-react';
import { Account, AccountCategory, AccountGroup } from '../../types';
import { isCashOrBankLedger } from '../../utils/accounting';

export type QuickLedgerContext =
  | 'JOURNAL'
  | 'PAYMENT_DEBIT'
  | 'PAYMENT_SOURCE'
  | 'RECEIPT_CREDIT'
  | 'RECEIPT_TARGET'
  | 'CONTRA';

interface GroupPreset {
  key: string;
  labelEn: string;
  labelHi: string;
  category: AccountCategory;
  subCategory: string;
  mainGroup: string;
  defaultBalanceType: 'DR' | 'CR';
  codePrefix: string;
}

const NON_CASH_GROUP_PRESETS: GroupPreset[] = [
  {
    key: 'INDIRECT_EXP',
    labelEn: 'Indirect Expenses (Office / Admin / Selling / P&L)',
    labelHi: 'अप्रत्यक्ष खर्च (Indirect Expenses - P&L)',
    category: 'EXPENSE',
    subCategory: 'Indirect Expenses',
    mainGroup: 'Indirect Expenses',
    defaultBalanceType: 'DR',
    codePrefix: '52'
  },
  {
    key: 'DIRECT_EXP',
    labelEn: 'Direct Expenses (Trading A/c / Purchase / Freight / Wages)',
    labelHi: 'प्रत्यक्ष खर्च (Direct Expenses - Trading A/c)',
    category: 'EXPENSE',
    subCategory: 'Direct Expenses',
    mainGroup: 'Direct Expenses',
    defaultBalanceType: 'DR',
    codePrefix: '50'
  },
  {
    key: 'SALARY_EXP',
    labelEn: 'Employee Benefits & Salary Expense',
    labelHi: 'वेतन एवं कर्मचारी लाभ खर्च (Employee Benefits)',
    category: 'EXPENSE',
    subCategory: 'Indirect Expenses',
    mainGroup: 'Employee Benefits & Salary Expense',
    defaultBalanceType: 'DR',
    codePrefix: '51'
  },
  {
    key: 'INDIRECT_INC',
    labelEn: 'Indirect Incomes (Interest / Commission / Rent Recd)',
    labelHi: 'अप्रत्यक्ष आय (Indirect Incomes)',
    category: 'REVENUE',
    subCategory: 'Indirect Revenue',
    mainGroup: 'Indirect Incomes',
    defaultBalanceType: 'CR',
    codePrefix: '41'
  },
  {
    key: 'DIRECT_INC',
    labelEn: 'Direct Incomes (Sales / Service Revenue)',
    labelHi: 'प्रत्यक्ष आय (Direct Incomes / Sales)',
    category: 'REVENUE',
    subCategory: 'Direct Revenue',
    mainGroup: 'Direct Incomes',
    defaultBalanceType: 'CR',
    codePrefix: '40'
  },
  {
    key: 'FIXED_ASSET',
    labelEn: 'Fixed Assets (Furniture / Computer / Machinery / Vehicle)',
    labelHi: 'स्थायी संपत्ति (Fixed Assets)',
    category: 'ASSET',
    subCategory: 'Fixed Assets',
    mainGroup: 'Fixed Assets',
    defaultBalanceType: 'DR',
    codePrefix: '15'
  },
  {
    key: 'CURRENT_ASSET',
    labelEn: 'Current Assets (Deposit / Advance Given / Prepaid)',
    labelHi: 'चालू संपत्ति (Current Assets / Advance Given)',
    category: 'ASSET',
    subCategory: 'Current Assets',
    mainGroup: 'Current Assets',
    defaultBalanceType: 'DR',
    codePrefix: '14'
  },
  {
    key: 'CURRENT_LIAB',
    labelEn: 'Current Liabilities (Outstanding Exp / Advance Received)',
    labelHi: 'चालू देनदारी (Current Liabilities / Payable)',
    category: 'LIABILITY',
    subCategory: 'Current Liabilities',
    mainGroup: 'Current Liabilities',
    defaultBalanceType: 'CR',
    codePrefix: '23'
  },
  {
    key: 'LOANS_LIAB',
    labelEn: 'Loans & Borrowings (Secured / Unsecured Loan)',
    labelHi: 'ऋण एवं उधार (Loans & Borrowings)',
    category: 'LIABILITY',
    subCategory: 'Loans & Liabilities',
    mainGroup: 'Loans & Liabilities',
    defaultBalanceType: 'CR',
    codePrefix: '24'
  },
  {
    key: 'DUTIES_TAXES',
    labelEn: 'Duties & Taxes (GST / TDS / Statutory Tax)',
    labelHi: 'कर एवं शुल्क (Duties & Taxes)',
    category: 'LIABILITY',
    subCategory: 'Duties & Taxes',
    mainGroup: 'Duties & Taxes',
    defaultBalanceType: 'CR',
    codePrefix: '22'
  },
  {
    key: 'CAPITAL',
    labelEn: 'Capital Account / Owner Drawings',
    labelHi: 'पूंजी खाता / आहरण (Capital / Drawings)',
    category: 'EQUITY',
    subCategory: 'Capital',
    mainGroup: 'Capital Account',
    defaultBalanceType: 'CR',
    codePrefix: '30'
  }
];

interface QuickCreateLedgerModalProps {
  isOpen: boolean;
  isHindi: boolean;
  existingAccounts: Account[];
  existingGroups?: AccountGroup[];
  voucherContext: QuickLedgerContext;
  onCreateAccount: (acc: Account) => void;
  onCreatedAndSelect: (acc: Account) => void;
  onClose: () => void;
}

export const QuickCreateLedgerModal: React.FC<QuickCreateLedgerModalProps> = ({
  isOpen,
  isHindi,
  existingAccounts,
  existingGroups = [],
  voucherContext,
  onCreateAccount,
  onCreatedAndSelect,
  onClose
}) => {
  const isCashOrBankOnly =
    voucherContext === 'CONTRA' ||
    voucherContext === 'PAYMENT_SOURCE' ||
    voucherContext === 'RECEIPT_TARGET';

  const availablePresets = useMemo(() => {
    const customPresets: GroupPreset[] = existingGroups
      .filter(g => {
        const lower = g.name.toLowerCase();
        if (lower.includes('cash') || lower.includes('bank')) return false;
        return !NON_CASH_GROUP_PRESETS.some(
          p => p.mainGroup.toLowerCase() === lower
        );
      })
      .map(g => ({
        key: `CUSTOM_${g.id}`,
        labelEn: g.name,
        labelHi: g.name,
        category: g.category,
        subCategory: g.parentGroupName || g.name,
        mainGroup: g.name,
        defaultBalanceType: g.category === 'ASSET' || g.category === 'EXPENSE' ? 'DR' : 'CR',
        codePrefix:
          g.category === 'ASSET'
            ? '16'
            : g.category === 'LIABILITY'
            ? '25'
            : g.category === 'EQUITY'
            ? '31'
            : g.category === 'REVENUE'
            ? '42'
            : '53'
      }));

    const combined = [...NON_CASH_GROUP_PRESETS, ...customPresets];

    if (voucherContext === 'RECEIPT_CREDIT') {
      // Put Income & Liabilities at top for Receipt Credit slot
      const order = ['INDIRECT_INC', 'DIRECT_INC', 'CURRENT_LIAB', 'LOANS_LIAB', 'CAPITAL'];
      return [...combined].sort((a, b) => {
        const ia = order.indexOf(a.key);
        const ib = order.indexOf(b.key);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        return 0;
      });
    }
    return combined;
  }, [existingGroups, voucherContext]);

  const getDefaultPresetKey = () => {
    if (voucherContext === 'RECEIPT_CREDIT') return 'INDIRECT_INC';
    return 'INDIRECT_EXP';
  };

  const [cashBankType, setCashBankType] = useState<'BANK' | 'PETTY_CASH' | 'BANK_OD'>('BANK');
  const [selectedPresetKey, setSelectedPresetKey] = useState<string>(getDefaultPresetKey());
  const [ledgerName, setLedgerName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<'DR' | 'CR'>(
    voucherContext === 'RECEIPT_CREDIT' ? 'CR' : 'DR'
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLedgerName('');
    setAccountNumber('');
    setOpeningBalance(0);
    setErrorMsg(null);
    if (isCashOrBankOnly) {
      setCashBankType('BANK');
      setBalanceType('DR');
    } else {
      const defKey = getDefaultPresetKey();
      setSelectedPresetKey(defKey);
      const found = availablePresets.find(p => p.key === defKey);
      setBalanceType(found?.defaultBalanceType || 'DR');
    }
  }, [isOpen, voucherContext]);

  if (!isOpen) return null;

  const activePreset = availablePresets.find(p => p.key === selectedPresetKey) || availablePresets[0];

  const handlePresetChange = (key: string) => {
    setSelectedPresetKey(key);
    const found = availablePresets.find(p => p.key === key);
    if (found) {
      setBalanceType(found.defaultBalanceType);
    }
    setErrorMsg(null);
  };

  const generateUniqueCode = (prefix: string): string => {
    const usedCodes = new Set(existingAccounts.map(a => (a.code || '').trim()));
    let num = parseInt(prefix.padEnd(4, '0'), 10) || 5500;
    while (usedCodes.has(String(num))) {
      num += 1;
    }
    return String(num);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setErrorMsg(null);

    const trimmedName = ledgerName.trim();
    if (trimmedName.length < 2) {
      setErrorMsg(isHindi ? 'कृपया मान्य लेजर नाम दर्ज करें।' : 'Please enter a valid ledger name.');
      return;
    }

    const duplicate = existingAccounts.find(
      a => a.name.toLowerCase().trim() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      setErrorMsg(
        isHindi
          ? `"${duplicate.name}" नाम का लेजर पहले से मौजूद है। कृपया सूची से चुनें या अलग नाम दें।`
          : `Ledger "${duplicate.name}" already exists. Please pick it from the dropdown or enter a unique name.`
      );
      return;
    }

    let candidateAccount: Account;

    if (isCashOrBankOnly) {
      const isOd = cashBankType === 'BANK_OD';
      const isPetty = cashBankType === 'PETTY_CASH';
      candidateAccount = {
        id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        code: generateUniqueCode(isOd ? '24' : '10'),
        name: trimmedName,
        category: isOd ? 'LIABILITY' : 'ASSET',
        subCategory: isPetty ? 'Petty Cash' : isOd ? 'Bank Overdraft' : 'Cash & Bank',
        mainGroup: 'Cash & Bank Accounts',
        parentGroupId: 'grp_cash_bank',
        accountNumber: accountNumber.trim() || undefined,
        isSubLedger: true,
        openingBalance: Math.max(0, Number(openingBalance) || 0),
        balanceType: isOd ? 'CR' : balanceType,
        isSystem: false
      };

      if (!isCashOrBankLedger(candidateAccount)) {
        setErrorMsg(
          isHindi
            ? 'यह नाम एक मान्य कैश/बैंक खाते के रूप में पहचान योग्य नहीं है। कृपया बैंक या कैश का नाम स्पष्ट लिखें।'
            : 'Please ensure a valid Bank or Cash account name (e.g. SBI Current A/c or Petty Cash).'
        );
        return;
      }
    } else {
      const preset = activePreset;
      candidateAccount = {
        id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5),
        code: generateUniqueCode(preset.codePrefix),
        name: trimmedName,
        category: preset.category,
        subCategory: preset.subCategory,
        mainGroup: preset.mainGroup,
        isSubLedger: true,
        openingBalance: Math.max(0, Number(openingBalance) || 0),
        balanceType,
        isSystem: false
      };

      if (isCashOrBankLedger(candidateAccount)) {
        setErrorMsg(
          isHindi
            ? `लेखांकन नियम: "${trimmedName}" एक कैश/बैंक खाता प्रतीत होता है। इसे जर्नल या सामान्य खर्च सूची में नहीं बनाया जा सकता — बैंक/कैश बनाने के लिए Contra (F4) या Paid From/Received Into के "+ नया बैंक/कैश" का उपयोग करें।`
            : `Accounting Rule: "${trimmedName}" looks like a Cash/Bank ledger, which is not permitted in this slot. Use Contra (F4) or the "+ New Bank/Cash" button on cash/bank fields.`
        );
        return;
      }
    }

    onCreateAccount(candidateAccount);
    onCreatedAndSelect(candidateAccount);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="hv-surface border border-indigo-500/40 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-[var(--text-primary)]">
        <div className="p-4 hv-elevated border-b border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 hv-pill-indigo border rounded-xl">
              {isCashOrBankOnly ? <Landmark className="w-5 h-5" /> : <BookOpen className="w-5 h-5" />}
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-extrabold text-[var(--text-primary)]">
                {isCashOrBankOnly
                  ? (isHindi ? 'नया बैंक / कैश लेजर जोड़ें' : 'Quick Create Bank / Cash Ledger')
                  : (isHindi ? 'तुरंत नया लेजर खाता बनाएँ' : 'Quick Create Accounting Ledger')}
              </h4>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi
                  ? 'Chart of Accounts में जाए बिना यहीं नया लेजर बनाएँ — सेव होते ही वाउचर में चुन लिया जाएगा'
                  : 'Create ledger right here without leaving your voucher — auto-selected on save'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreateSubmit} className="p-5 space-y-4 text-xs">
          {errorMsg && (
            <div className="p-3 hv-pill-rose border rounded-xl font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isCashOrBankOnly ? (
            <div className="space-y-3">
              <label className="block text-[var(--text-secondary)] font-bold">
                {isHindi ? 'खाते का प्रकार चुनें (Cash / Bank Type) *' : 'Select Cash / Bank Ledger Type *'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCashBankType('BANK');
                    setBalanceType('DR');
                    setErrorMsg(null);
                  }}
                  className={`p-2.5 rounded-xl border font-bold text-center transition flex flex-col items-center gap-1 ${
                    cashBankType === 'BANK'
                      ? 'hv-pill-indigo'
                      : 'hv-elevated border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Landmark className="w-4 h-4" />
                  <span>{isHindi ? 'बैंक खाता' : 'Bank Account'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCashBankType('PETTY_CASH');
                    setBalanceType('DR');
                    setErrorMsg(null);
                  }}
                  className={`p-2.5 rounded-xl border font-bold text-center transition flex flex-col items-center gap-1 ${
                    cashBankType === 'PETTY_CASH'
                      ? 'hv-pill-emerald'
                      : 'hv-elevated border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>{isHindi ? 'पेटी कैश / नकद' : 'Petty Cash'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCashBankType('BANK_OD');
                    setBalanceType('CR');
                    setErrorMsg(null);
                  }}
                  className={`p-2.5 rounded-xl border font-bold text-center transition flex flex-col items-center gap-1 ${
                    cashBankType === 'BANK_OD'
                      ? 'hv-pill-amber'
                      : 'hv-elevated border-[var(--border-primary)] text-[var(--text-muted)] hover:border-[var(--border-subtle)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>{isHindi ? 'बैंक OD / CC' : 'Bank OD / CC'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'लेखांकन ग्रुप (Accounting Group / Nature) *' : 'Accounting Group / Under *'}
              </label>
              <select
                value={selectedPresetKey}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-indigo-500 font-semibold"
              >
                {availablePresets.map(p => (
                  <option key={p.key} value={p.key}>
                    {isHindi ? p.labelHi : p.labelEn}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-[var(--text-secondary)] font-bold mb-1">
              {isHindi ? 'लेजर का नाम (Ledger Name) *' : 'Ledger Account Name *'}
            </label>
            <input
              type="text"
              autoFocus
              value={ledgerName}
              onChange={(e) => setLedgerName(e.target.value)}
              placeholder={
                isCashOrBankOnly
                  ? (cashBankType === 'PETTY_CASH'
                      ? 'e.g. Shop Petty Cash / Counter Cash'
                      : 'e.g. SBI Current A/c - 4410')
                  : (voucherContext === 'RECEIPT_CREDIT'
                      ? 'e.g. Rental Income / Commission Received'
                      : 'e.g. Godown Security Exp / Website Hosting Charges')
              }
              className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 font-semibold"
              required
            />
          </div>

          {isCashOrBankOnly && cashBankType !== 'PETTY_CASH' && (
            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'बैंक खाता संख्या (Bank Account No - Optional)' : 'Bank Account Number (Optional)'}
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="e.g. 50200012345678"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 text-indigo-500 font-mono"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'प्रारंभिक शेष (Opening Bal.)' : 'Opening Balance'}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={openingBalance || ''}
                placeholder="0.00"
                onChange={(e) => setOpeningBalance(Number(e.target.value) || 0)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 font-mono"
              />
            </div>
            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'प्रकार (Dr / Cr)' : 'Balance Type (Dr / Cr)'}
              </label>
              <select
                value={balanceType}
                onChange={(e) => setBalanceType(e.target.value as 'DR' | 'CR')}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5 font-mono font-bold"
              >
                <option value="DR">DR (Debit / नामे)</option>
                <option value="CR">CR (Credit / जमा)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-primary)]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 transition"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isHindi ? 'लेजर बनाएँ व चुनें' : 'Create & Select Ledger'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
