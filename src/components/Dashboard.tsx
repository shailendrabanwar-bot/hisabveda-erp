import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  CreditCard, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Landmark, 
  FileCheck2, 
  AlertTriangle, 
  Plus, 
  Clock, 
  CheckCircle2, 
  Receipt, 
  PieChart as PieChartIcon,
  BarChart2,
  FileText,
  X,
  ExternalLink,
  ShoppingBag
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  Legend,
  Cell
} from 'recharts';
import { AppData, Currency, SalesInvoice, Voucher, PurchaseInvoice, UserRole } from '../types';
import { formatCurrency } from '../utils/storage';
import { RolePermissions, canAccessTab, getRolePermissions, normalizeUserRole } from '../utils/rbac';
import { AppConfiguration, isNavTabEnabled, loadAppConfig } from '../utils/appConfig';
import { getFinancialSummary, calculateAccountBalances, isBankAccount } from '../utils/accounting';
import { getFinancialYearRange, getCurrentFinancialYearStart } from '../utils/fiscalYear';
import { StatutoryDueDateAlerts } from './Tax/StatutoryDueDateAlerts';

interface DashboardProps {
  data: AppData;
  isHindi: boolean;
  onNavigateTab: (tab: any, accountId?: string) => void;
  onOpenQuickModal: (type: 'invoice' | 'journal' | 'payment' | 'receipt') => void;
  onPrintInvoice: (inv: SalesInvoice) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  appConfig?: AppConfiguration;
}

function sortByRecentDate<T extends { date?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export const Dashboard: React.FC<DashboardProps> = ({
  data,
  isHindi,
  onNavigateTab,
  onOpenQuickModal,
  onPrintInvoice,
  activeUserRole = 'ADMIN',
  permissions,
  appConfig
}) => {
  const effectiveConfig = appConfig || loadAppConfig();
  const effectiveRole = normalizeUserRole(activeUserRole);
  const perms = permissions || getRolePermissions(effectiveRole);
  const [showCashBankModal, setShowCashBankModal] = useState(false);
  const summary = getFinancialSummary(data);
  const currency = data.company.currency;
  const balancesMap = calculateAccountBalances(data);

  const cashBankAccounts = data.accounts.filter(isBankAccount).map(acc => {
    const balInfo = balancesMap.get(acc.id);
    const netBal = balInfo ? (balInfo.balanceType === 'DR' ? balInfo.netBalance : -balInfo.netBalance) : acc.openingBalance;
    return {
      account: acc,
      balance: netBal,
      debit: balInfo?.debit || 0,
      credit: balInfo?.credit || 0
    };
  });

  // Dynamic Chart Data preparation: Group real monthly sales, purchases & expenses
  const expenseAccountIds = new Set(
    data.accounts.filter(a => a.category === 'EXPENSE').map(a => a.id)
  );

  const monthlyMap = new Map<string, { sales: number; purchases: number; expenses: number }>();
  const ensureMonth = (ym: string) => {
    if (!monthlyMap.has(ym)) {
      monthlyMap.set(ym, { sales: 0, purchases: 0, expenses: 0 });
    }
    return monthlyMap.get(ym)!;
  };

  for (const inv of data.invoices) {
    if (inv.status === 'CANCELLED' || !inv.date) continue;
    const ym = inv.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      ensureMonth(ym).sales += inv.grandTotal || 0;
    }
  }

  for (const pur of data.purchaseInvoices || []) {
    if (pur.status === 'CANCELLED' || !pur.date) continue;
    const ym = pur.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      ensureMonth(ym).purchases += pur.grandTotal || 0;
    }
  }

  for (const vch of data.vouchers) {
    if (!vch.date) continue;
    const ym = vch.date.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(ym)) {
      let vchExpense = 0;
      for (const line of vch.entries || []) {
        if (expenseAccountIds.has(line.accountId)) {
          vchExpense += (line.debit || 0) - (line.credit || 0);
        }
      }
      if (vchExpense > 0) {
        ensureMonth(ym).expenses += vchExpense;
      }
    }
  }

  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const isCurrentFY = fyRange.fyStart === getCurrentFinancialYearStart();

  // Ensure active FY months (Apr through current month if current FY, else Apr–Mar) are represented continuously
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1..12
  const fyStartYear = fyRange.fyStartYear;
  const fyMonths: string[] = [];
  for (let m = 4; m <= 12; m++) {
    const ym = `${fyStartYear}-${String(m).padStart(2, '0')}`;
    if (!isCurrentFY || fyStartYear < currentYear || m <= currentMonth) fyMonths.push(ym);
  }
  for (let m = 1; m <= 3; m++) {
    const endYr = fyStartYear + 1;
    if (!isCurrentFY || endYr < currentYear || (endYr === currentYear && m <= currentMonth)) {
      fyMonths.push(`${endYr}-${String(m).padStart(2, '0')}`);
    }
  }

  const allMonthsSet = new Set<string>([...fyMonths, ...monthlyMap.keys()]);
  const sortedMonths = Array.from(allMonthsSet).sort().slice(-12);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const monthlyData = sortedMonths.map(ym => {
    const [yr, mo] = ym.split('-');
    const mIdx = Math.max(0, Math.min(11, parseInt(mo, 10) - 1));
    const bucket = monthlyMap.get(ym) || { sales: 0, purchases: 0, expenses: 0 };
    return {
      month: `${monthNames[mIdx]} '${yr.slice(-2)}`,
      sales: Math.round(bucket.sales),
      purchases: Math.round(bucket.purchases),
      expenses: Math.round(bucket.expenses)
    };
  });

  const recentInvoices = sortByRecentDate<SalesInvoice>(data.invoices).slice(0, 5);
  const recentPurchases = sortByRecentDate<PurchaseInvoice>(data.purchaseInvoices || []).slice(0, 5);
  const recentVouchers = sortByRecentDate<Voucher>(data.vouchers).slice(0, 5);

  const isFreshWorkspace =
    !data.company.name?.trim() &&
    data.invoices.length === 0 &&
    data.vouchers.length === 0 &&
    data.parties.length === 0 &&
    data.items.length === 0;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-5 md:space-y-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
      {/* Clean Onboarding Banner for Brand-New Workspaces */}
      {isFreshWorkspace && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold hv-pill-emerald border px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isHindi ? 'आपका नया अकाउंटिंग कार्यक्षेत्र तैयार है' : 'Your Clean Accounting Workspace is Ready'}</span>
            </div>
            <h3 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)]">
              {isHindi
                ? 'शुरुआत करने के लिए अपनी कंपनी का नाम, राज्य और लोगो सेट करें'
                : 'Complete Your Business Profile to Start Billing & Accounting'}
            </h3>
            <p className="text-xs text-[var(--text-secondary)] max-w-2xl leading-relaxed">
              {isHindi
                ? 'डिफ़ॉल्ट लेजर (Cash, Bank, Sales, Purchase, CGST, SGST, IGST) 0 बैलेंस के साथ तैयार हैं। प्रैक्टिस करने के लिए आप Settings में "Load Sample Demo Data" भी चला सकते हैं।'
                : 'Standard Chart of Accounts ledgers (Cash, Bank, Sales, Purchase, CGST, SGST, IGST) are pre-configured with 0 opening balance. Want to practice first? You can load sample demo data inside Settings.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {perms.canEditCompanySettings && (
              <button
                type="button"
                onClick={() => onNavigateTab('settings')}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white text-xs font-extrabold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>{isHindi ? 'कंपनी प्रोफ़ाइल सेट करें' : 'Setup Company Profile'}</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            )}
            {perms.canCreateEditMasters && (
              <>
                <button
                  type="button"
                  onClick={() => onNavigateTab('parties')}
                  className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-bold px-3.5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{isHindi ? 'पार्टी जोड़ें' : 'Add Party'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('items')}
                  className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-bold px-3.5 py-2.5 rounded-xl transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-500" />
                  <span>{isHindi ? 'आइटम जोड़ें' : 'Add Item'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top Banner & Quick Voucher Shortcuts */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[var(--text-primary)]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
            <span>{isHindi ? 'वित्तीय डैशबोर्ड एवं सेल्स रिपोर्ट' : 'Real-time Financial & Sales Dashboard'}</span>
            <span className="hv-pill-emerald border text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live
            </span>
            <span className="hv-pill-indigo border text-xs px-2.5 py-0.5 rounded-full font-bold font-mono">
              {fyRange.label} ({fyRange.displayRange})
            </span>
            {effectiveConfig.accountingWithoutInventory && (
              <span className="hv-pill-amber border text-xs px-2.5 py-0.5 rounded-full font-bold">
                {isHindi ? 'केवल अकाउंटिंग (No Inventory)' : 'Accounts-Only Mode'}
              </span>
            )}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {isHindi 
              ? 'बिक्री, खाता बही, बैंक रिकॉन्सिलेशन और टैक्स देनदारियों का वास्तविक समय अवलोकन'
              : 'Real-time overview of Sales, Ledger, Bank Reconciliation, and Tax Liabilities'}
          </p>
        </div>

        {/* Quick Voucher Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {perms.canCreateEditTransactions && (
            <button
              onClick={() => onOpenQuickModal('invoice')}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-lg shadow-indigo-600/25 transition transform active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isHindi ? 'नया इनवॉइस' : '+ New Invoice'}</span>
            </button>
          )}

          {perms.canCreateEditVouchers && (
            <>
              {isNavTabEnabled('purchases', effectiveConfig) && (
                <button
                  onClick={() => onNavigateTab('purchases')}
                  className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white hv-keep-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-lg shadow-amber-600/20 transition transform active:scale-95 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'परचेज बिल' : '+ Purchase Bill'}</span>
                </button>
              )}

              <button
                onClick={() => onOpenQuickModal('journal')}
                className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-indigo-500" />
                <span>{isHindi ? 'जर्नल वाउचर' : 'Journal'}</span>
              </button>

              <button
                onClick={() => onOpenQuickModal('payment')}
                className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <ArrowDownLeft className="w-3.5 h-3.5 text-rose-500" />
                <span>{isHindi ? 'पेमेंट वाउचर' : 'Payment'}</span>
              </button>

              <button
                onClick={() => onOpenQuickModal('receipt')}
                className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] text-xs font-semibold px-3 py-2 rounded-xl transition cursor-pointer"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isHindi ? 'रसीद वाउचर' : 'Receipt'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alert Notifications if any */}
      {(summary.unreconciledBankCount > 0 || summary.totalReceivables > 0 || summary.totalPayables > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.unreconciledBankCount > 0 && (
            <div className="hv-pill-rose border rounded-xl p-3.5 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  <strong>{summary.unreconciledBankCount}</strong> {isHindi ? 'बैंक स्टेटमेंट एंट्रीज़ रिकॉन्साइल होना बाक़ी हैं।' : 'unreconciled bank statement entries found.'}
                </span>
              </div>
              {perms.canReconcileBank && isNavTabEnabled('reconciliation', effectiveConfig) && (
                <button
                  onClick={() => onNavigateTab('reconciliation')}
                  className="bg-rose-600 hover:bg-rose-500 text-white hv-keep-white font-semibold px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer"
                >
                  {isHindi ? 'अभी रिकॉन्साइल करें' : 'Reconcile Now'}
                </button>
              )}
            </div>
          )}

          {summary.totalReceivables > 0 && (
            <div className="hv-pill-amber border rounded-xl p-3.5 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4 shrink-0" />
                <span>
                  {isHindi ? 'कुल बकाया ग्राहक भुगतान:' : 'Pending Customer Receivables:'} <strong>{formatCurrency(summary.totalReceivables, currency)}</strong>
                </span>
              </div>
              {canAccessTab(effectiveRole, 'invoices') && (
                <button
                  onClick={() => onNavigateTab('invoices')}
                  className="bg-amber-600 hover:bg-amber-500 text-white hv-keep-white font-semibold px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer"
                >
                  {isHindi ? 'इनवॉइस देखें' : 'View Invoices'}
                </button>
              )}
            </div>
          )}

          {summary.totalPayables > 0 && isNavTabEnabled('purchases', effectiveConfig) && (
            <div className="hv-pill-indigo border rounded-xl p-3.5 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="w-4 h-4 shrink-0" />
                <span>
                  {isHindi ? 'सप्लायर बकाया देनदारी:' : 'Pending Vendor Payables:'} <strong>{formatCurrency(summary.totalPayables, currency)}</strong>
                </span>
              </div>
              {canAccessTab(effectiveRole, 'purchases') && (
                <button
                  onClick={() => onNavigateTab('purchases')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-semibold px-2.5 py-1 rounded-lg transition shrink-0 cursor-pointer"
                >
                  {isHindi ? 'परचेज देखें' : 'View Purchases'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Statutory Return Due Date Alerts Banner */}
      <StatutoryDueDateAlerts isHindi={isHindi} activeFy="2026-27" onNavigateTab={onNavigateTab} compact={true} />

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Sales */}
        <div 
          onClick={() => onNavigateTab('invoices')}
          className="bg-[var(--bg-surface)] border border-[var(--border-primary)] hover:border-indigo-500 cursor-pointer rounded-2xl p-4 shadow-md relative overflow-hidden group transition transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {isHindi ? 'कुल बिक्री (Total Sales)' : 'Total Sales (Revenue)'}
            </span>
            <div className="w-9 h-9 rounded-xl hv-pill-indigo border flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums">
              {formatCurrency(summary.totalSales, currency)}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-500 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{isHindi ? 'क्लिक करें इनवॉइस देखने के लिए' : 'Click to view all invoices'}</span>
            </div>
          </div>
        </div>

        {/* Card 2: Net Profit / Loss */}
        <div 
          onClick={() => onNavigateTab('statements')}
          className="bg-[var(--bg-surface)] border border-[var(--border-primary)] hover:border-emerald-500 cursor-pointer rounded-2xl p-4 shadow-md relative overflow-hidden group transition transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {isHindi ? 'शुद्ध लाभ (Net Profit)' : 'Net Profit'}
            </span>
            <div className="w-9 h-9 rounded-xl hv-pill-emerald border flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className={`text-2xl font-bold tracking-tight tabular-nums ${summary.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
              {formatCurrency(summary.netProfit, currency)}
            </div>
            <div className="flex items-center gap-1 mt-1 text-xs text-emerald-500 font-semibold">
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>{isHindi ? 'P&L वित्तीय लाभ-हानि रिपोर्ट देखें' : 'Click to view P&L Statement'}</span>
            </div>
          </div>
        </div>

        {/* Card 3: Cash & Bank Balance */}
        <div 
          onClick={() => setShowCashBankModal(true)}
          className="bg-[var(--bg-surface)] border border-[var(--border-primary)] hover:border-blue-500 cursor-pointer rounded-2xl p-4 shadow-md relative overflow-hidden group transition transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {isHindi ? 'कैश एवं बैंक बैलेंस' : 'Cash & Bank Balance'}
            </span>
            <div className="w-9 h-9 rounded-xl hv-pill-blue border flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
              <Landmark className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums">
              {formatCurrency(summary.cashAndBankBalance, currency)}
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-blue-500 font-semibold">
              <span>{isHindi ? 'विवरण देखने के लिए क्लिक करें' : 'Click to view breakdown & details'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>

        {/* Card 4: Tax Liabilities (GST/VAT & TDS) */}
        <div 
          onClick={() => onNavigateTab('tax')}
          className="bg-[var(--bg-surface)] border border-[var(--border-primary)] hover:border-amber-500 cursor-pointer rounded-2xl p-4 shadow-md relative overflow-hidden group transition transform hover:-translate-y-0.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              {isHindi ? 'जीएसटी / टीडीएस कुल देयता' : 'Pending Tax Payable'}
            </span>
            <div className="w-9 h-9 rounded-xl hv-pill-amber border flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition">
              <FileCheck2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-500 tracking-tight tabular-nums">
              {formatCurrency(summary.totalTaxPayable, currency)}
            </div>
            <div className="flex items-center justify-between mt-1 text-[11px] text-amber-500 font-semibold">
              <span>{isHindi ? 'जीएसटी एवं टीडीएस रिपोर्ट प्रबंधित करें' : 'Manage GST & TDS Tax Compliance'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales & Revenue Trend Chart (2 columns) */}
        <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-500" />
                {isHindi ? 'मासिक बिक्री, खरीद और खर्च रुझान' : 'Monthly Sales, Purchases & Expense Trend'}
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                {isHindi ? 'वित्तीय वर्ष 2026-27 के लिए वास्तविक समय आय, खरीद व व्यय ग्राफ' : 'Real-time sales, purchases & operational cost analytics'}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)] flex-wrap">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span> Sales
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Purchases
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Expenses
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPurchases" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" opacity={0.65} />
                <XAxis dataKey="month" stroke="var(--chart-axis)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--chart-axis)" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)', borderRadius: '0.75rem', color: 'var(--text-primary)', fontSize: '12px' }}
                  formatter={(val: any) => formatCurrency(Number(val), currency)}
                />
                <Area type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" name="Sales" />
                <Area type="monotone" dataKey="purchases" stroke="#f59e0b" strokeWidth={2} fillOpacity={1} fill="url(#colorPurchases)" name="Purchases" />
                <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Collection & Purchases Breakdown (1 column) */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 mb-1">
              <PieChartIcon className="w-4 h-4 text-emerald-500" />
              {isHindi ? 'भुगतान व खरीद स्थिति ब्रेकडाउन' : 'Invoicing, Purchases & Payables'}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mb-4">
              {isHindi ? 'प्राप्त राशि, बकाया और कुल खरीद विवरण' : 'Collected revenue, receivables & vendor purchases'}
            </p>

            <div className="space-y-3">
              <div className="bg-[var(--bg-elevated)] rounded-xl p-3 border border-[var(--border-subtle)]">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-secondary)] font-medium">{isHindi ? 'कुल प्राप्त राशि (Collected)' : 'Total Collected Revenue'}</span>
                  <span className="text-emerald-500 font-bold tabular-nums">{formatCurrency(summary.totalCollected, currency)}</span>
                </div>
                <div className="w-full hv-progress-track h-2 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${summary.totalSales > 0 ? Math.min(100, (summary.totalCollected / summary.totalSales) * 100) : 0}%` }}
                  ></div>
                </div>
              </div>

              <div className="bg-[var(--bg-elevated)] rounded-xl p-3 border border-[var(--border-subtle)]">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-secondary)] font-medium">{isHindi ? 'बकाया लेनदारी (Outstanding)' : 'Customer Outstanding'}</span>
                  <span className="text-amber-500 font-bold tabular-nums">{formatCurrency(summary.totalReceivables, currency)}</span>
                </div>
                <div className="w-full hv-progress-track h-2 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-amber-500 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${summary.totalSales > 0 ? Math.min(100, (summary.totalReceivables / summary.totalSales) * 100) : 0}%` }}
                  ></div>
                </div>
              </div>

              <div
                onClick={() => onNavigateTab('purchases')}
                className="bg-[var(--bg-elevated)] hover:border-amber-500 cursor-pointer rounded-xl p-3 border border-[var(--border-subtle)] transition"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="text-[var(--text-secondary)] font-medium">{isHindi ? 'कुल खरीद (Total Purchases)' : 'Total Purchases'}</span>
                  <span className="text-amber-500 font-bold tabular-nums">{formatCurrency(summary.totalPurchases, currency)}</span>
                </div>
                <div className="flex justify-between items-center text-[11px] mt-1.5 pt-1.5 border-t border-[var(--border-subtle)]">
                  <span className="text-[var(--text-muted)]">{isHindi ? 'विक्रेता देनदारी (Payables)' : 'Vendor Payables'}</span>
                  <span className="text-rose-500 font-bold tabular-nums">{formatCurrency(summary.totalPayables, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[var(--border-primary)] grid grid-cols-2 gap-2 text-center">
            <button
              onClick={() => onNavigateTab('invoices')}
              className="text-xs text-indigo-500 hover:underline font-semibold flex items-center justify-center gap-1 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg cursor-pointer"
            >
              <span>{isHindi ? 'बिक्री इनवॉइस' : 'Sales Invoices'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onNavigateTab('purchases')}
              className="text-xs text-amber-500 hover:underline font-semibold flex items-center justify-center gap-1 py-1.5 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg cursor-pointer"
            >
              <span>{isHindi ? 'परचेज बिल' : 'Purchase Bills'}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Entries Grid: Sales Invoices + Purchase Bills */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Receipt className="w-4 h-4 text-indigo-500" />
              {isHindi ? 'हाल ही के बिक्री इनवॉइस (Recent Sales)' : 'Recent Sales Invoices'}
            </h3>
            <button
              onClick={() => onNavigateTab('invoices')}
              className="text-xs text-indigo-500 hover:underline font-semibold cursor-pointer"
            >
              {isHindi ? 'सभी देखें →' : 'View All →'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-2.5 rounded-l-lg">Invoice #</th>
                  <th className="p-2.5">Party Name</th>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5 text-right">Amount</th>
                  <th className="p-2.5 text-center">Status</th>
                  <th className="p-2.5 rounded-r-lg text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[var(--text-muted)]">
                      {isHindi ? 'अभी तक कोई बिक्री इनवॉइस दर्ज नहीं है।' : 'No sales invoices recorded yet.'}
                    </td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => (
                    <tr key={inv.id} className="hover:bg-[var(--hover-surface)] transition">
                      <td className="p-2.5 font-bold text-indigo-500">{inv.invoiceNumber}</td>
                      <td className="p-2.5 max-w-[140px] truncate text-[var(--text-primary)] font-medium">{inv.partyName}</td>
                      <td className="p-2.5 text-[var(--text-muted)]">{inv.date}</td>
                      <td className="p-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                        {formatCurrency(inv.grandTotal, currency)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          inv.status === 'PAID' ? 'hv-pill-emerald' :
                          inv.status === 'UNPAID' ? 'hv-pill-rose' :
                          'hv-pill-amber'
                        }`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="p-2.5 text-right">
                        {perms.canExportData ? (
                          <button
                            onClick={() => onPrintInvoice(inv)}
                            className="p-1 hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] rounded transition cursor-pointer"
                            title={isHindi ? 'प्रिंट इनवॉइस' : 'Print Invoice'}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Purchase Bills Table */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-500" />
              {isHindi ? 'हाल ही के परचेज बिल (Recent Purchases)' : 'Recent Purchase Bills'}
            </h3>
            <button
              onClick={() => onNavigateTab('purchases')}
              className="text-xs text-amber-500 hover:underline font-semibold cursor-pointer"
            >
              {isHindi ? 'सभी देखें →' : 'View All →'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="p-2.5 rounded-l-lg">Bill #</th>
                  <th className="p-2.5">Vendor Name</th>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5 text-right">Amount</th>
                  <th className="p-2.5 rounded-r-lg text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)]">
                {recentPurchases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-[var(--text-muted)]">
                      <div className="space-y-2">
                        <p>{isHindi ? 'अभी तक कोई परचेज बिल दर्ज नहीं है।' : 'No purchase bills recorded yet.'}</p>
                        {perms.canCreateEditVouchers && (
                          <button
                            onClick={() => onNavigateTab('purchases')}
                            className="inline-flex items-center gap-1 px-3 py-1 hv-pill-amber border rounded-lg text-[11px] font-semibold transition cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>{isHindi ? 'नया परचेज बिल डालें' : 'Add Purchase Bill'}</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentPurchases.map((bill) => (
                    <tr
                      key={bill.id}
                      onClick={() => onNavigateTab('purchases')}
                      className="hover:bg-[var(--hover-surface)] cursor-pointer transition"
                    >
                      <td className="p-2.5 font-bold text-amber-500">
                        <div>{bill.billNumber}</div>
                        {bill.supplierInvoiceNo && (
                          <div className="text-[10px] font-normal text-[var(--text-muted)]">{bill.supplierInvoiceNo}</div>
                        )}
                      </td>
                      <td className="p-2.5 max-w-[140px] truncate text-[var(--text-primary)] font-medium">{bill.partyName}</td>
                      <td className="p-2.5 text-[var(--text-muted)]">{bill.date}</td>
                      <td className="p-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                        {formatCurrency(bill.grandTotal, currency)}
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                          bill.status === 'PAID' ? 'hv-pill-emerald' :
                          bill.status === 'UNPAID' ? 'hv-pill-rose' :
                          'hv-pill-amber'
                        }`}>
                          {bill.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Vouchers Table */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            {isHindi ? 'हाल ही की वाउचर प्रविष्टियाँ (Journal/Pay/Rec)' : 'Recent Voucher Entries (Journal/Pay/Rec)'}
          </h3>
          <button
            onClick={() => onNavigateTab('vouchers')}
            className="text-xs text-indigo-500 hover:underline font-semibold cursor-pointer"
          >
            {isHindi ? 'सभी देखें →' : 'View All →'}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)]">
            <thead className="bg-[var(--bg-elevated)] text-[var(--text-muted)] text-[11px] uppercase tracking-wider">
              <tr>
                <th className="p-2.5 rounded-l-lg">Voucher #</th>
                <th className="p-2.5">Type</th>
                <th className="p-2.5">Date</th>
                <th className="p-2.5 text-right">Total Amount</th>
                <th className="p-2.5 rounded-r-lg">Narration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {recentVouchers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[var(--text-muted)]">
                    {isHindi ? 'अभी तक कोई वाउचर प्रविष्टि दर्ज नहीं है।' : 'No voucher entries recorded yet.'}
                  </td>
                </tr>
              ) : (
                recentVouchers.map((vch) => (
                  <tr key={vch.id} className="hover:bg-[var(--hover-surface)] transition">
                    <td className="p-2.5 font-bold text-emerald-500">{vch.voucherNumber}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                        vch.type === 'JOURNAL' ? 'hv-pill-indigo' :
                        vch.type === 'PAYMENT' ? 'hv-pill-rose' :
                        'hv-pill-emerald'
                      }`}>
                        {vch.type}
                      </span>
                    </td>
                    <td className="p-2.5 text-[var(--text-muted)]">{vch.date}</td>
                    <td className="p-2.5 text-right font-semibold text-[var(--text-primary)] tabular-nums">
                      {formatCurrency(vch.totalAmount, currency)}
                    </td>
                    <td className="p-2.5 max-w-[260px] truncate text-[var(--text-muted)] italic">
                      {vch.narration}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cash & Bank Account Details Modal */}
      {showCashBankModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm animate-fade-in">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-4 bg-[var(--bg-elevated)] border-b border-[var(--border-primary)] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl hv-pill-blue border flex items-center justify-center">
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--text-primary)]">
                    {isHindi ? 'कैश एवं बैंक खाते विवरण' : 'Cash & Bank Accounts Detail Breakdown'}
                  </h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    {isHindi ? 'सभी एक्टिव बैंक लेज़र एवं कैश बैलेंस की वास्तविक स्थिति' : 'Live balance breakdown across all bank and cash ledgers'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCashBankModal(false)}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--hover-surface)] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Summary Banner */}
            <div className="hv-pill-blue border-b p-4 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {isHindi ? 'कुल कैश एवं बैंक बैलेंस' : 'Total Net Cash & Bank Balance'}
                </span>
                <div className="text-2xl font-black tracking-tight tabular-nums">
                  {formatCurrency(summary.cashAndBankBalance, currency)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {perms.canReconcileBank && (
                  <button
                    onClick={() => {
                      setShowCashBankModal(false);
                      onNavigateTab('reconciliation');
                    }}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md cursor-pointer"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'बैंक रिकॉन्सिलेशन' : 'Bank Reconciliation'}</span>
                  </button>
                )}
                {canAccessTab(effectiveRole, 'ledger') && (
                  <button
                    onClick={() => {
                      setShowCashBankModal(false);
                      onNavigateTab('ledger');
                    }}
                    className="px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'खाता बही (Ledger)' : 'Chart of Accounts'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Account List Table */}
            <div className="p-4 max-h-[350px] overflow-y-auto space-y-2">
              {cashBankAccounts.length === 0 ? (
                <div className="text-center py-8 text-[var(--text-muted)] text-xs">
                  {isHindi ? 'कोई कैश या बैंक खाता उपलब्ध नहीं है।' : 'No Cash or Bank accounts found.'}
                </div>
              ) : (
                cashBankAccounts.map(({ account, balance, debit, credit }) => (
                  <div 
                    key={account.id}
                    className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] hover:border-blue-500 rounded-xl p-3 flex items-center justify-between transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg hv-pill-blue border flex items-center justify-center font-bold text-xs">
                        {account.code.slice(0, 4)}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-[var(--text-primary)] flex items-center gap-2">
                          <span>{account.name}</span>
                          <span className="text-[10px] hv-pill-slate border px-2 py-0.5 rounded-md font-mono">
                            {account.subCategory || 'Cash & Bank'}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-3 mt-0.5 tabular-nums">
                          <span>Opening: {formatCurrency(account.openingBalance, currency)}</span>
                          <span>Dr: {formatCurrency(debit, currency)}</span>
                          <span>Cr: {formatCurrency(credit, currency)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-extrabold text-base tabular-nums ${balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(Math.abs(balance), currency)} {balance >= 0 ? 'Dr' : 'Cr'}
                      </div>
                      <button
                        onClick={() => {
                          setShowCashBankModal(false);
                          onNavigateTab('ledger', account.id);
                        }}
                        className="text-[10px] text-indigo-500 hover:underline font-semibold cursor-pointer"
                      >
                        {isHindi ? 'लेज़र विवरण देखें →' : 'View Ledger →'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-[var(--bg-elevated)] border-t border-[var(--border-primary)] text-right">
              <button
                onClick={() => setShowCashBankModal(false)}
                className="px-4 py-2 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border border-[var(--border-subtle)] rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
