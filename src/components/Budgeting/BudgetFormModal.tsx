import React, { useState } from 'react';
import { X, PiggyBank, Calculator, AlertCircle, Info } from 'lucide-react';
import { AppData, CategoryBudget, Account } from '../../types';
import { formatCurrency } from '../../utils/storage';

interface BudgetFormModalProps {
  data: AppData;
  isHindi: boolean;
  budgetToEdit?: CategoryBudget | null;
  defaultAccountId?: string;
  selectedMonth: string;
  actualSpentForAccount: (accountId: string) => number;
  onSaveBudget: (budget: CategoryBudget) => void;
  onClose: () => void;
}

export const BudgetFormModal: React.FC<BudgetFormModalProps> = ({
  data,
  isHindi,
  budgetToEdit,
  defaultAccountId,
  selectedMonth,
  actualSpentForAccount,
  onSaveBudget,
  onClose
}) => {
  // Filter only EXPENSE category accounts from Chart of Accounts
  const expenseAccounts = data.accounts.filter(a => a.category === 'EXPENSE');

  const [accountId, setAccountId] = useState<string>(() => {
    if (budgetToEdit) return budgetToEdit.accountId;
    if (defaultAccountId) return defaultAccountId;
    return '';
  });

  const selectedAccount = expenseAccounts.find(a => a.id === accountId);

  const [monthlyLimit, setMonthlyLimit] = useState<number>(() => {
    if (budgetToEdit) return budgetToEdit.monthlyLimit;
    return 0;
  });

  const [notes, setNotes] = useState<string>(() => {
    if (budgetToEdit) return budgetToEdit.notes || '';
    return '';
  });
  const [formError, setFormError] = useState<string | null>(null);

  const currentSpent = selectedAccount ? actualSpentForAccount(selectedAccount.id) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!selectedAccount) {
      setFormError(isHindi ? 'कृपया एक वैध खर्च खाता चुनें।' : 'Please select a valid expense account.');
      return;
    }

    if (monthlyLimit <= 0) {
      setFormError(isHindi ? 'कृपया 0 से अधिक मासिक बजट सीमा दर्ज करें।' : 'Please enter a monthly limit greater than 0.');
      return;
    }

    const newBudget: CategoryBudget = {
      id: budgetToEdit ? budgetToEdit.id : 'bdg_' + Date.now(),
      accountId: selectedAccount.id,
      accountName: selectedAccount.name,
      category: selectedAccount.subCategory || 'Indirect Expenses',
      monthlyLimit: Number(monthlyLimit),
      period: selectedMonth,
      notes: notes.trim()
    };

    onSaveBudget(newBudget);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-100 animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {budgetToEdit 
                  ? (isHindi ? 'बजट सीमा अपडेट करें' : 'Update Spending Limit') 
                  : (isHindi ? 'नया बजट सीमा निर्धारित करें' : 'Set New Spending Limit')}
              </h3>
              <p className="text-xs text-slate-400">
                {isHindi ? `माह: ${selectedMonth}` : `Period: ${selectedMonth}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && (
            <div className="bg-rose-500/15 border border-rose-500/40 text-rose-200 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          {/* Account Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isHindi ? 'खर्च खाता चुनें (Expense Account)' : 'Expense Account'} <span className="text-rose-400">*</span>
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={!!budgetToEdit}
              className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none disabled:opacity-60"
            >
              <option value="">{isHindi ? '-- खर्च खाता चुनें --' : '-- Select Expense Account --'}</option>
              {expenseAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code} - {acc.name} ({acc.subCategory})
                </option>
              ))}
            </select>
          </div>

          {/* Current Spent Reference Box */}
          {selectedAccount && (
            <div className="bg-slate-800/60 border border-slate-700/80 p-3 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>{isHindi ? 'इस माह अब तक हुआ वास्तविक खर्च:' : 'Actual spent so far this month:'}</span>
              </div>
              <span className="font-mono font-bold text-indigo-300">
                {formatCurrency(currentSpent, data.company.currency)}
              </span>
            </div>
          )}

          {/* Monthly Limit Field */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isHindi ? 'मासिक बजट खर्च सीमा (Monthly Spending Limit)' : 'Monthly Spending Limit'} ({data.company.currency}) <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                min="100"
                step="500"
                value={monthlyLimit || ''}
                onChange={(e) => setMonthlyLimit(Number(e.target.value) || 0)}
                placeholder="0"
                className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-xl px-3 py-2.5 text-sm font-mono focus:border-indigo-500 focus:outline-none"
                required
              />
            </div>
            {monthlyLimit > 0 && currentSpent > monthlyLimit && (
              <p className="text-[11px] text-amber-400 mt-1 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {isHindi 
                  ? 'ध्यान दें: वर्तमान खर्च निर्धारित सीमा से अधिक है!' 
                  : 'Note: Current actual spending already exceeds this limit!'}
              </p>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
              {isHindi ? 'त्वरित बजट राशि चुनें:' : 'Quick Presets:'}
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {[10000, 25000, 50000, 100000, 150000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setMonthlyLimit(preset)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border transition font-mono ${
                    monthlyLimit === preset
                      ? 'bg-indigo-600 text-white border-indigo-500 font-bold'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {formatCurrency(preset, data.company.currency)}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              {isHindi ? 'टिप्पणी / विवरण (Notes)' : 'Notes / Remarks'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isHindi ? 'उदाहरण: प्रबंधन स्वीकृति...' : 'e.g., Approved budget for Q3 IT infrastructure...'}
              className="w-full bg-slate-800 text-slate-100 border border-slate-700 rounded-xl px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
            >
              {budgetToEdit ? (isHindi ? 'अपडेट करें' : 'Update Limit') : (isHindi ? 'बजट सहेजें' : 'Save Budget Limit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
