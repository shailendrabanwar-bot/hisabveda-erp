import React, { useState } from 'react';
import { 
  PiggyBank, 
  Plus, 
  Search, 
  Filter, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  CheckCircle2, 
  Edit3, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  DollarSign, 
  ArrowUpRight, 
  FileText, 
  BarChart2, 
  Info,
  CreditCard
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { AppData, CategoryBudget, Account, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  getMonthlyLedgerActualExpense,
  getLedgerBudgetVarianceSummary,
} from '../../utils/accounting';
import { BudgetFormModal } from './BudgetFormModal';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';

interface BudgetingProps {
  data: AppData;
  isHindi: boolean;
  onSaveBudget: (budget: CategoryBudget) => void;
  onDeleteBudget: (budgetId: string) => void;
  onOpenQuickModal: (type: 'payment' | 'journal') => void;
  onNavigateTab: (tab: any, accountId?: string) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const Budgeting: React.FC<BudgetingProps> = ({
  data,
  isHindi,
  onSaveBudget,
  onDeleteBudget,
  onOpenQuickModal,
  onNavigateTab,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const budgets = data.budgets || [];

  // Selected Period State (Default to 2026-07)
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVER_BUDGET' | 'NEAR_LIMIT' | 'WITHIN_BUDGET'>('ALL');

  // Modal State
  const [showModal, setShowModal] = useState<boolean>(false);
  const [budgetToEdit, setBudgetToEdit] = useState<CategoryBudget | null>(null);
  const [defaultAccountId, setDefaultAccountId] = useState<string | undefined>(undefined);
  const [confirmDeleteBudget, setConfirmDeleteBudget] = useState<{ id: string; name: string } | null>(null);

  // Month Navigator Handlers
  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 2, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month, 1);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${y}-${m}`);
  };

  // Helper: Calculate live actual spent for an account in selectedMonth from accounting.ts GL engine
  const getActualSpentForAccount = (accountId: string): number =>
    getMonthlyLedgerActualExpense(data, accountId, selectedMonth);

  // Process Budget Items with live Budget vs. Actual Variance (₹ & %) from accounting.ts
  const budgetItemsProcessed = budgets.map((b) => {
    const variance = getLedgerBudgetVarianceSummary(data, b, selectedMonth);
    const actualSpent = variance.actualExpense;
    const remaining = variance.varianceAmount;
    const percentUsed = variance.utilizationPercent;

    let status: 'WITHIN_BUDGET' | 'NEAR_LIMIT' | 'OVER_BUDGET' = 'WITHIN_BUDGET';
    if (variance.status === 'EXCEEDED') status = 'OVER_BUDGET';
    else if (variance.status === 'WARNING') status = 'NEAR_LIMIT';

    return {
      ...b,
      actualSpent,
      remaining,
      percentUsed,
      variancePercent: variance.variancePercent,
      status
    };
  });

  // Calculate Overall Totals
  const totalBudgetLimit = budgetItemsProcessed.reduce((acc, curr) => acc + curr.monthlyLimit, 0);
  const totalActualSpent = budgetItemsProcessed.reduce((acc, curr) => acc + curr.actualSpent, 0);
  const totalRemaining = totalBudgetLimit - totalActualSpent;
  const overallPercent = totalBudgetLimit > 0 ? (totalActualSpent / totalBudgetLimit) * 100 : 0;

  const overBudgetCount = budgetItemsProcessed.filter((b) => b.status === 'OVER_BUDGET').length;
  const nearLimitCount = budgetItemsProcessed.filter((b) => b.status === 'NEAR_LIMIT').length;

  // Filtered Budget Items
  const filteredBudgets = budgetItemsProcessed.filter((b) => {
    const matchesSearch = 
      b.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.notes && b.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus = statusFilter === 'ALL' || b.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Chart Data Preparation
  const chartData = budgetItemsProcessed.map((b) => ({
    name: b.accountName.length > 15 ? b.accountName.substring(0, 15) + '...' : b.accountName,
    fullName: b.accountName,
    budget: b.monthlyLimit,
    spent: b.actualSpent,
    status: b.status
  }));

  const pieChartData = budgetItemsProcessed
    .filter((b) => b.actualSpent > 0)
    .map((b) => ({
      name: b.accountName,
      value: b.actualSpent
    }));

  const PIE_COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6'];

  // Unbudgeted Expense Accounts
  const budgetedAccountIds = new Set(budgets.map((b) => b.accountId));
  const unbudgetedExpenseAccounts = data.accounts.filter(
    (a) => a.category === 'EXPENSE' && !budgetedAccountIds.has(a.id)
  );

  // Form Open Helpers
  const handleOpenAddModal = (accId?: string) => {
    setBudgetToEdit(null);
    setDefaultAccountId(accId);
    setShowModal(true);
  };

  const handleOpenEditModal = (budget: CategoryBudget) => {
    setBudgetToEdit(budget);
    setDefaultAccountId(undefined);
    setShowModal(true);
  };

  // Format month title nicely (e.g., "July 2026")
  const formatMonthDisplay = (monthStr: string) => {
    const [year, m] = monthStr.split('-').map(Number);
    const date = new Date(year, m - 1, 1);
    return date.toLocaleString(isHindi ? 'hi-IN' : 'en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto text-[var(--text-primary)]">
      {/* Top Banner & Action Controls */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl hv-pill-indigo border flex items-center justify-center font-bold">
              <PiggyBank className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                <span>{isHindi ? 'मासिक बजट एवं खर्च सीमा प्रणाली' : 'Monthly Budgeting & Expense Tracker'}</span>
                <span className="hv-pill-indigo border text-xs px-2.5 py-0.5 rounded-full font-semibold">
                  ERP Module
                </span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {isHindi
                  ? 'खाता श्रेणियों के लिए मासिक खर्च सीमा निर्धारित करें और वास्तविक खर्च की निगरानी करें।'
                  : 'Set monthly expense limits for account categories and track real-time utilization.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Controls: Month Selector & Add Budget Button */}
        <div className="flex items-center gap-3 flex-wrap w-full lg:w-auto justify-between lg:justify-end">
          {/* Month Navigator */}
          <div className="flex items-center bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-xl p-1 shadow-inner">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-[var(--hover-surface)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title={isHindi ? 'पिछला महीना' : 'Previous Month'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5 px-3 py-1 font-mono text-xs font-bold text-[var(--text-primary)]">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>{formatMonthDisplay(selectedMonth)}</span>
            </div>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-[var(--hover-surface)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition cursor-pointer"
              title={isHindi ? 'अगला महीना' : 'Next Month'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {perms.canCreateEditVouchers && (
            <button
              onClick={() => handleOpenAddModal()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isHindi ? '+ नया बजट जोड़ें' : '+ Set Budget Limit'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Budgeted Limit */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-4 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {isHindi ? 'कुल निर्धारित बजट' : 'Total Budgeted Limit'}
            </span>
            <div className="w-8 h-8 rounded-lg hv-pill-indigo border flex items-center justify-center">
              <PiggyBank className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-mono font-bold text-[var(--text-primary)] mt-2 tabular-nums">
            {formatCurrency(totalBudgetLimit, currency)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {isHindi ? `${budgets.length} खर्च खातों पर लागू` : `Across ${budgets.length} expense categories`}
          </p>
        </div>

        {/* Card 2: Actual Expenses Spent */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-4 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {isHindi ? 'वास्तविक खर्च (Actual Spent)' : 'Actual Expenses Spent'}
            </span>
            <div className="w-8 h-8 rounded-lg hv-pill-emerald border flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <p className="text-xl font-mono font-bold text-emerald-500 mt-2 tabular-nums">
            {formatCurrency(totalActualSpent, currency)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 flex items-center gap-1">
            <span>{isHindi ? 'माह के लिए दर्ज वाउचर से' : 'Voucher entries in'}</span>
            <span className="font-mono text-[var(--text-secondary)] font-semibold">{selectedMonth}</span>
          </p>
        </div>

        {/* Card 3: Remaining Balance */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-4 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {totalRemaining >= 0 ? (isHindi ? 'शेष बजट राशि' : 'Remaining Unspent') : (isHindi ? 'अतिरिक्त खर्च (Overspent)' : 'Over Budget Amount')}
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
              totalRemaining >= 0 ? 'hv-pill-blue' : 'hv-pill-rose'
            }`}>
              {totalRemaining >= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            </div>
          </div>
          <p className={`text-xl font-mono font-bold mt-2 tabular-nums ${totalRemaining >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
            {formatCurrency(Math.abs(totalRemaining), currency)}
          </p>
          <p className="text-[11px] text-[var(--text-muted)] mt-1">
            {totalRemaining >= 0 
              ? (isHindi ? 'सुरक्षित सीमा के अंदर' : 'Within target limit allowance')
              : (isHindi ? '🚨 निर्धारित बजट पार कर गया!' : '🚨 Total budget threshold exceeded!')}
          </p>
        </div>

        {/* Card 4: Overall Progress Utilization */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-4 rounded-2xl shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)]">
              {isHindi ? 'बजट उपयोग दर' : 'Budget Utilization Rate'}
            </span>
            <div className="w-8 h-8 rounded-lg hv-pill-amber border flex items-center justify-center">
              <BarChart2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-xl font-mono font-bold text-[var(--text-primary)] tabular-nums">
              {overallPercent.toFixed(1)}%
            </p>
            {overBudgetCount > 0 && (
              <span className="text-[10px] font-bold hv-pill-rose border px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {overBudgetCount} Over
              </span>
            )}
          </div>
          {/* Progress Bar Track */}
          <div className="w-full hv-progress-track h-2 rounded-full mt-2 overflow-hidden border border-[var(--border-subtle)]">
            <div 
              className={`h-full transition-all duration-500 ${
                overallPercent > 100 
                  ? 'bg-rose-500 shadow-sm shadow-rose-500' 
                  : overallPercent >= 75 
                  ? 'bg-amber-500' 
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, overallPercent)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Bar Chart: Budget vs Actual */}
        <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
            <div>
              <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                <span>{isHindi ? 'बजट सीमा बनाम वास्तविक खर्च तुलना' : 'Budget Limit vs. Actual Spent Comparison'}</span>
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {isHindi ? 'प्रत्येक खर्च खाते के लिए दृश्य प्रगति' : 'Visual comparison per budgeted account category'}
              </p>
            </div>
            <span className="text-xs font-mono hv-pill-indigo border px-2.5 py-1 rounded-lg font-bold">
              {selectedMonth}
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.65} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--chart-axis)" 
                  fontSize={11} 
                  tickLine={false} 
                  angle={-15} 
                  textAnchor="end"
                />
                <YAxis stroke="var(--chart-axis)" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', borderRadius: '12px', color: 'var(--text-primary)' }}
                  formatter={(value: any) => [formatCurrency(Number(value), currency), '']}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="budget" name={isHindi ? 'बजट सीमा (Budget Limit)' : 'Budget Limit'} fill="#6366f1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="spent" name={isHindi ? 'वास्तविक खर्च (Actual Spent)' : 'Actual Spent'} radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={
                        entry.status === 'OVER_BUDGET' 
                          ? '#f43f5e' 
                          : entry.status === 'NEAR_LIMIT' 
                          ? '#f59e0b' 
                          : '#10b981'
                      } 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expense Distribution Pie Chart */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md space-y-4 flex flex-col">
          <div className="border-b border-[var(--border-primary)] pb-3">
            <h3 className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? 'खर्च वितरण (Spending Share)' : 'Expense Distribution Share'}</span>
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isHindi ? 'कुल खर्च का श्रेणी-वार वितरण' : 'Breakdown of actual monthly spending'}
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-[200px]">
            {pieChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', borderRadius: '12px', color: 'var(--text-primary)' }}
                    formatter={(value: any) => [formatCurrency(Number(value), currency), 'Spent']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                <Info className="w-6 h-6 mx-auto mb-2 text-[var(--text-muted)]" />
                <p>{isHindi ? 'इस माह के लिए कोई खर्च दर्ज नहीं है।' : 'No actual expenses recorded for this month.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--text-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isHindi ? 'बजट खाता या टिप्पणी खोजें...' : 'Search budget accounts or notes...'}
            className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] text-xs rounded-xl pl-9 pr-3 py-2 border border-[var(--border-subtle)] focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
          <span className="text-xs text-[var(--text-muted)] font-medium shrink-0 mr-1">{isHindi ? 'स्थिति:' : 'Status:'}</span>
          {[
            { id: 'ALL', label: isHindi ? 'सभी' : 'All' },
            { id: 'OVER_BUDGET', label: isHindi ? '🔴 ओवर बजट' : '🔴 Over Budget' },
            { id: 'NEAR_LIMIT', label: isHindi ? '🟡 सीमा के पास (>75%)' : '🟡 Near Limit (>75%)' },
            { id: 'WITHIN_BUDGET', label: isHindi ? '🟢 सामान्य (<75%)' : '🟢 Within Budget' }
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id as any)}
              className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-indigo-600 text-white hv-keep-white shadow'
                  : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Budget Categories Grid Display */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
            <PiggyBank className="w-5 h-5 text-indigo-500" />
            <span>{isHindi ? 'निर्धारित बजट सीमा सूची' : 'Budgeted Expense Categories'}</span>
            <span className="text-xs font-normal text-[var(--text-muted)] font-mono">({filteredBudgets.length})</span>
          </h3>
        </div>

        {filteredBudgets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBudgets.map((item) => {
              const isOver = item.status === 'OVER_BUDGET';
              const isNear = item.status === 'NEAR_LIMIT';

              return (
                <div
                  key={item.id}
                  className={`bg-[var(--bg-surface)] border rounded-2xl p-5 shadow-md transition space-y-4 flex flex-col justify-between ${
                    isOver 
                      ? 'border-rose-500/60' 
                      : isNear 
                      ? 'border-amber-500/50' 
                      : 'border-[var(--border-primary)]'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md hv-pill-indigo border">
                          {item.category}
                        </span>
                        <h4 className="font-bold text-sm text-[var(--text-primary)] mt-1.5 leading-snug">
                          {item.accountName}
                        </h4>
                      </div>

                      {/* Status Badge */}
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 flex items-center gap-1 ${
                        isOver
                          ? 'hv-pill-rose animate-pulse'
                          : isNear
                          ? 'hv-pill-amber'
                          : 'hv-pill-emerald'
                      }`}>
                        {isOver && <AlertTriangle className="w-3 h-3" />}
                        {isNear && <Info className="w-3 h-3" />}
                        {!isOver && !isNear && <CheckCircle2 className="w-3 h-3" />}
                        <span>
                          {isOver 
                            ? (isHindi ? 'ओवर बजट' : 'OVER BUDGET') 
                            : isNear 
                            ? (isHindi ? 'सीमा के पास' : 'NEAR LIMIT') 
                            : (isHindi ? 'सामान्य' : 'WITHIN LIMIT')}
                        </span>
                      </span>
                    </div>

                    {item.notes && (
                      <p className="text-[11px] text-[var(--text-muted)] italic mt-1.5 line-clamp-2">
                        "{item.notes}"
                      </p>
                    )}
                  </div>

                  {/* Amounts & Numbers */}
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">{isHindi ? 'वास्तविक खर्च:' : 'Actual Spent:'}</span>
                      <span className={`font-mono font-bold tabular-nums ${isOver ? 'text-rose-500' : 'text-[var(--text-primary)]'}`}>
                        {formatCurrency(item.actualSpent, currency)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">{isHindi ? 'मासिक बजट सीमा:' : 'Monthly Limit:'}</span>
                      <span className="font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                        {formatCurrency(item.monthlyLimit, currency)}
                      </span>
                    </div>

                    <div className="border-t border-[var(--border-primary)] pt-1.5 flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">
                        {item.remaining >= 0 ? (isHindi ? 'बजट अंतर (Variance):' : 'Variance (Remaining):') : (isHindi ? 'अतिरिक्त खर्च (Overrun):' : 'Overrun Variance:')}
                      </span>
                      <span className={`font-mono font-bold tabular-nums ${item.remaining >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {item.remaining < 0 ? '+' : '-'}{formatCurrency(Math.abs(item.remaining), currency)} ({item.variancePercent >= 0 ? '+' : ''}{item.variancePercent.toFixed(1)}%)
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar Visualization */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[var(--text-muted)] font-medium">{isHindi ? 'उपयोग:' : 'Utilization:'}</span>
                      <span className={`font-mono font-bold tabular-nums ${
                        isOver ? 'text-rose-500' : isNear ? 'text-amber-500' : 'text-emerald-500'
                      }`}>
                        {item.percentUsed.toFixed(1)}%
                      </span>
                    </div>

                    <div className="w-full hv-progress-track h-2.5 rounded-full overflow-hidden border border-[var(--border-subtle)] p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isOver
                            ? 'bg-rose-500 shadow-sm shadow-rose-500'
                            : isNear
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, item.percentUsed)}%` }}
                      ></div>
                    </div>

                    {isOver && (
                      <p className="text-[10px] text-rose-500 font-semibold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {isHindi
                          ? `सावधानी: इस खाते पर बजट सीमा ${formatCurrency(Math.abs(item.remaining), currency)} से अधिक हो गई है!`
                          : `Alert: Limit exceeded by ${formatCurrency(Math.abs(item.remaining), currency)}!`}
                      </p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center justify-between border-t border-[var(--border-primary)] pt-3 gap-2">
                    <div className="flex items-center gap-1">
                      {perms.canCreateEditVouchers && (
                        <button
                          onClick={() => handleOpenEditModal(item)}
                          className="p-1.5 hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] hover:text-indigo-500 rounded-lg transition cursor-pointer"
                          title={isHindi ? 'बजट संपादित करें' : 'Edit Budget Limit'}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {perms.canDeleteRecords && (
                        <button
                          onClick={() => setConfirmDeleteBudget({ id: item.id, name: item.accountName })}
                          className="p-1.5 hover:bg-[var(--hover-surface)] text-[var(--text-muted)] hover:text-rose-500 rounded-lg transition cursor-pointer"
                          title={isHindi ? 'बजट हटाएँ' : 'Delete Budget'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onNavigateTab('ledger', item.accountId)}
                        className="text-[11px] text-indigo-500 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <span>{isHindi ? 'लेज़र' : 'Ledger'}</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </button>

                      {perms.canCreateEditVouchers && (
                        <button
                          onClick={() => onOpenQuickModal('payment')}
                          className="text-[11px] bg-[var(--bg-elevated)] hover:bg-indigo-600 text-[var(--text-primary)] hover:text-white px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] font-semibold transition cursor-pointer"
                        >
                          {isHindi ? '+ खर्च दर्ज करें' : '+ Record Expense'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-8 text-center space-y-3">
            <PiggyBank className="w-10 h-10 text-[var(--text-muted)] mx-auto" />
            <h4 className="font-bold text-[var(--text-primary)] text-sm">
              {isHindi ? 'कोई बजट सीमा नहीं मिली' : 'No Budget Limits Found'}
            </h4>
            <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
              {isHindi
                ? 'अपने व्यवसाय के खर्चों पर नियंत्रण रखने के लिए खर्च खातों के लिए मासिक सीमा निर्धारित करें।'
                : 'Set monthly budget limits for your expense accounts to stay in control of business costs.'}
            </p>
            {perms.canCreateEditVouchers && (
              <button
                onClick={() => handleOpenAddModal()}
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-4 py-2 rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{isHindi ? 'बजट सीमा बनाएँ' : 'Create Budget Limit'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Unbudgeted Expense Accounts Quick Section */}
      {unbudgetedExpenseAccounts.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
            <div>
              <h4 className="font-bold text-xs text-[var(--text-primary)] flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-500" />
                <span>{isHindi ? 'बिना बजट वाले खर्च खाते' : 'Expense Accounts Without Budget Limits'}</span>
              </h4>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi ? 'नीचे दिए गए खातों के लिए त्वरित 1-क्लिक में बजट सीमा जोड़ें:' : 'Set budget limits for these accounts with 1-click:'}
              </p>
            </div>
            <span className="text-[11px] font-mono text-[var(--text-muted)]">
              {unbudgetedExpenseAccounts.length} {isHindi ? 'खाते' : 'accounts'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {unbudgetedExpenseAccounts.map((acc) => {
              const spent = getActualSpentForAccount(acc.id);
              return (
                <div
                  key={acc.id}
                  className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-3 rounded-xl flex items-center justify-between text-xs hover:border-indigo-500 transition"
                >
                  <div>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono block">{acc.code}</span>
                    <span className="font-bold text-[var(--text-primary)] block truncate">{acc.name}</span>
                    <span className="text-[10px] text-indigo-500 font-mono tabular-nums">
                      Spent: {formatCurrency(spent, currency)}
                    </span>
                  </div>
                  {perms.canCreateEditVouchers && (
                    <button
                      onClick={() => handleOpenAddModal(acc.id)}
                      className="flex items-center gap-1 hv-pill-indigo border hover:bg-indigo-600 hover:text-white text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{isHindi ? 'बजट तय करें' : 'Set Budget'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Budget Form Modal */}
      {showModal && (
        <BudgetFormModal
          data={data}
          isHindi={isHindi}
          budgetToEdit={budgetToEdit}
          defaultAccountId={defaultAccountId}
          selectedMonth={selectedMonth}
          actualSpentForAccount={getActualSpentForAccount}
          onSaveBudget={onSaveBudget}
          onClose={() => setShowModal(false)}
        />
      )}

      {/* Inline Delete Budget Confirmation Modal */}
      {confirmDeleteBudget && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-rose-500/50 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl hv-pill-rose border flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--text-primary)]">
                  {isHindi ? 'बजट सीमा हटाने की पुष्टि' : 'Delete Budget Limit?'}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">{confirmDeleteBudget.name}</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              {isHindi
                ? `क्या आप वाकई "${confirmDeleteBudget.name}" की मासिक बजट सीमा हटाना चाहते हैं?`
                : `Are you sure you want to remove the monthly budget limit for "${confirmDeleteBudget.name}"?`}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteBudget(null)}
                className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteBudget(confirmDeleteBudget.id);
                  setConfirmDeleteBudget(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white hv-keep-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                {isHindi ? 'हाँ, डिलीट करें' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
