import React, { useState, useEffect, useMemo } from 'react';
import { 
  PieChart, 
  Printer, 
  FileSpreadsheet, 
  Scale, 
  TrendingUp, 
  CheckCircle2,
  Building2,
  Boxes,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
  Layers,
  ListTree,
  Calendar,
  Globe2,
  Clock,
  ChevronDown,
  ChevronRight,
  Download,
  SlidersHorizontal
} from 'lucide-react';
import { Account, AppData, CompanyDetails, PurchaseInvoice, SalesInvoice, UserRole, Voucher } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import {
  AccountBalance,
  auditBooksZeroDifference,
  calculateAccountBalances,
  calculateClosingStock,
  getEffectiveAccountCategory,
  getEffectiveOpeningStock,
  getSignedLedgerAmount,
  isDirectExpenseLedger,
  isDirectRevenueLedger,
  isEffectiveStockOpeningAccount,
  isFixedAssetLedger,
  isNonCurrentLiabilityLedger,
  mergeAccountsWithBalancesMap
} from '../../utils/accounting';
import { printFinancialStatementReport } from '../../utils/printReport';
import { FinancialPrintModal } from './FinancialPrintModal';
import { FinancialDetailModal, FinancialDetailPayload, FinancialGroupLedgerRow } from './FinancialDetailModal';
import { LedgerDrilldownModal } from './LedgerDrilldownModal';
import { loadAppConfig } from '../../utils/appConfig';
import {
  ALL_FINANCIAL_YEARS,
  filterAppDataByDateRange,
  filterAppDataByFinancialYear,
  filterAppDataByFYRange,
  getAvailableFinancialYears,
  getCurrentFinancialYearStart,
  getFinancialYearRange,
  normalizeDateISO
} from '../../utils/fiscalYear';
import {
  buildPeriodicFinancialBreakdown,
  ReportGranularity
} from '../../utils/periodicReports';

interface FinancialStatementsProps {
  data: AppData;
  masterData?: AppData;
  activePeriodLabel?: string;
  isHindi: boolean;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  isEditModalOpen?: boolean;
  onEditInvoice?: (inv: SalesInvoice) => void;
  onEditPurchaseBill?: (pur: PurchaseInvoice) => void;
  onEditVoucher?: (vch: Voucher) => void;
  onUpdateCompany?: (comp: CompanyDetails) => void;
}

export const FinancialStatements: React.FC<FinancialStatementsProps> = ({
  data: activeFyData,
  masterData,
  activePeriodLabel,
  isHindi,
  activeUserRole = 'ADMIN',
  permissions,
  isEditModalOpen = false,
  onEditInvoice,
  onEditPurchaseBill,
  onEditVoucher,
  onUpdateCompany,
}) => {
  const effectiveRole = normalizeUserRole(activeUserRole);
  const perms = permissions || getRolePermissions(effectiveRole);
  const fullSource = masterData || activeFyData;

  const earliestRecordDate = useMemo(() => {
    const dates: string[] = [];
    (fullSource.invoices || []).forEach(i => { if (i.date) dates.push(normalizeDateISO(i.date)); });
    (fullSource.purchaseInvoices || []).forEach(p => { if (p.date) dates.push(normalizeDateISO(p.date)); });
    (fullSource.vouchers || []).forEach(v => { if (v.date) dates.push(normalizeDateISO(v.date)); });
    (fullSource.debitCreditNotes || []).forEach(n => { if (n.date) dates.push(normalizeDateISO(n.date)); });
    const valid = dates.filter(Boolean).sort();
    return valid[0] || fullSource.company.booksBeginningFrom || activeFyData.company.financialYearStart;
  }, [fullSource, activeFyData.company.financialYearStart]);

  const availableFysAsc = useMemo(
    () =>
      getAvailableFinancialYears(fullSource)
        .filter((f) => f.fyStart !== ALL_FINANCIAL_YEARS)
        .slice()
        .sort((a, b) => a.fyStart.localeCompare(b.fyStart)),
    [fullSource]
  );

  const activeFyStartClean =
    activeFyData.company.financialYearStart && activeFyData.company.financialYearStart !== ALL_FINANCIAL_YEARS
      ? activeFyData.company.financialYearStart
      : getCurrentFinancialYearStart();

  const [periodScope, setPeriodScope] = useState<'ACTIVE_FY' | 'FY_RANGE' | 'CUSTOM_RANGE'>('ACTIVE_FY');
  const [fromFyStart, setFromFyStart] = useState<string>(() => availableFysAsc[0]?.fyStart || activeFyStartClean);
  const [toFyStart, setToFyStart] = useState<string>(() => activeFyStartClean);
  const [customFrom, setCustomFrom] = useState<string>(() => earliestRecordDate);
  const [customTo, setCustomTo] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [granularity, setGranularity] = useState<ReportGranularity>('SUMMARY');
  const [expandedPeriodKey, setExpandedPeriodKey] = useState<string | null>(null);

  // Sync default To-FY when active Header FY changes (while keeping user choice if already in FY_RANGE)
  useEffect(() => {
    setToFyStart(activeFyStartClean);
  }, [activeFyStartClean]);

  // Trial Balance View Settings
  const [tbShowOpening, setTbShowOpening] = useState<boolean>(true);
  const [tbShowTransactions, setTbShowTransactions] = useState<boolean>(true);
  const [tbShowClosing, setTbShowClosing] = useState<boolean>(true);
  const [tbYearWise, setTbYearWise] = useState<boolean>(false);

  const fyRangeResult = useMemo(() => {
    if (periodScope !== 'FY_RANGE') return null;
    return filterAppDataByFYRange(fullSource, fromFyStart, toFyStart);
  }, [periodScope, fullSource, fromFyStart, toFyStart]);

  const [editingClosingStock, setEditingClosingStock] = useState(false);
  const [closingStockDraft, setClosingStockDraft] = useState<string>(() =>
    fullSource.company.manualClosingStock !== undefined ? String(fullSource.company.manualClosingStock) : ''
  );

  const rawPeriodData = useMemo(() => {
    if (periodScope === 'FY_RANGE' && fyRangeResult) {
      return fyRangeResult.filtered;
    }
    if (periodScope === 'CUSTOM_RANGE') {
      return filterAppDataByDateRange(fullSource, customFrom || undefined, customTo || undefined);
    }
    return activeFyData;
  }, [periodScope, fyRangeResult, fullSource, activeFyData, customFrom, customTo]);

  const data = rawPeriodData;
  const autoComputedClosingStock = useMemo(
    () => calculateClosingStock({ ...data, company: { ...data.company, closingStockValuationMode: 'AUTO' } }),
    [data]
  );
  const isManualClosingStock = data.company.closingStockValuationMode === 'MANUAL';

  const applyClosingStockSetting = (mode: 'AUTO' | 'MANUAL', manualVal?: number) => {
    const targetCompany = fullSource.company;
    const nextComp: CompanyDetails = {
      ...targetCompany,
      closingStockValuationMode: mode,
      manualClosingStock:
        mode === 'MANUAL'
          ? Math.round(((manualVal !== undefined && Number.isFinite(manualVal) ? manualVal : autoComputedClosingStock) || 0) * 100) / 100
          : targetCompany.manualClosingStock,
    };
    onUpdateCompany?.(nextComp);
  };

  const statementPeriodLabel = useMemo(() => {
    if (periodScope === 'FY_RANGE' && fyRangeResult) {
      return `${fyRangeResult.rangeLabel} (${fyRangeResult.displayRange})`;
    }
    if (periodScope === 'CUSTOM_RANGE') {
      return `${customFrom || 'Beginning'} → ${customTo || 'Present'}`;
    }
    if (activePeriodLabel) {
      return activePeriodLabel;
    }
    const r = getFinancialYearRange(activeFyData.company.financialYearStart);
    return `${r.label} (${r.displayRange})`;
  }, [periodScope, fyRangeResult, customFrom, customTo, activePeriodLabel, activeFyData.company.financialYearStart]);

  const currency = data.company.currency;
  const [activeReport, setActiveReport] = useState<'TRADING_PL' | 'BS' | 'TB' | 'SCH34'>('TRADING_PL');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [detailModalPayload, setDetailModalPayload] = useState<FinancialDetailPayload | null>(null);
  const [drillAccountTarget, setDrillAccountTarget] = useState<{ id?: string; name?: string; preferredKind?: 'ACCOUNT' | 'PARTY' } | null>(null);
  const [viewMode, setViewMode] = useState<'condensed' | 'detailed'>(() => {
    return loadAppConfig().defaultFinancialReportMode || 'condensed';
  });

  const activeReportTitle = useMemo(() => {
    if (activeReport === 'BS') return isHindi ? 'बैलेंस शीट (Balance Sheet)' : 'Balance Sheet';
    if (activeReport === 'TB') return isHindi ? 'ट्रायल बैलेंस (Trial Balance)' : 'Trial Balance';
    if (activeReport === 'SCH34') return 'Schedule III / IV';
    return isHindi ? 'व्यापारिक व लाभ-हानि खाता (Trading & P&L)' : 'Trading & Profit & Loss A/c';
  }, [activeReport, isHindi]);

  // Alt+F1 Condensed/Detailed + Alt+1..4 Statement Sub-Tabs + F2 Cycle Period Scope + Escape
  useEffect(() => {
    const reportTabsOrder: Array<'TRADING_PL' | 'BS' | 'TB' | 'SCH34'> = ['TRADING_PL', 'BS', 'TB', 'SCH34'];
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isEditModalOpen) return;
      if (e.altKey && (e.key === 'F1' || e.code === 'F1')) {
        e.preventDefault();
        setViewMode(prev => prev === 'condensed' ? 'detailed' : 'condensed');
      } else if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        if (showPrintModal) setShowPrintModal(false);
      }
    };
    const handleSubTab = (ev: Event) => {
      const idx = (ev as CustomEvent<{ index: number }>).detail?.index;
      if (typeof idx === 'number' && idx >= 1 && idx <= reportTabsOrder.length) {
        setActiveReport(reportTabsOrder[idx - 1]);
      }
    };
    const handleOpenPeriod = () => {
      setPeriodScope((prev) => (prev === 'ACTIVE_FY' ? 'FY_RANGE' : prev === 'FY_RANGE' ? 'CUSTOM_RANGE' : 'ACTIVE_FY'));
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('hisabveda:subtab', handleSubTab);
    window.addEventListener('hisabveda:open-period', handleOpenPeriod);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('hisabveda:subtab', handleSubTab);
      window.removeEventListener('hisabveda:open-period', handleOpenPeriod);
    };
  }, [showPrintModal, isEditModalOpen]);

  const balancesMap = useMemo<Map<string, AccountBalance>>(() => calculateAccountBalances(data), [data]);
  const allMergedAccounts = useMemo(() => mergeAccountsWithBalancesMap(data, balancesMap), [data, balancesMap]);
  const closingStock = calculateClosingStock(data);
  const zeroDiffAudit = useMemo(() => auditBooksZeroDifference(data), [data]);

  // Group accounts by recursive effective Category (includes dynamic system/imported ledgers from balancesMap)
  const effCatOf = (acc: Account) => getEffectiveAccountCategory(acc, data.accountGroups);
  const assetAccounts = allMergedAccounts.filter(a => effCatOf(a) === 'ASSET');
  const liabilityAccounts = allMergedAccounts.filter(a => effCatOf(a) === 'LIABILITY');
  const equityAccounts = allMergedAccounts.filter(a => effCatOf(a) === 'EQUITY');
  const revenueAccounts = allMergedAccounts.filter(a => effCatOf(a) === 'REVENUE');
  const expenseAccounts = allMergedAccounts.filter(a => effCatOf(a) === 'EXPENSE');

  // Direct Revenues (Sales) vs Indirect Revenues
  const salesAccounts = revenueAccounts.filter(a => isDirectRevenueLedger(a, data.accountGroups));
  const indirectRevenueAccounts = revenueAccounts.filter(a => !salesAccounts.some(s => s.id === a.id));

  // Direct Expenses (Purchases & Direct Costs) vs Indirect Expenses
  const directExpenseAccounts = expenseAccounts.filter(a => isDirectExpenseLedger(a, data.accountGroups));
  const indirectExpenseAccounts = expenseAccounts.filter(a => !directExpenseAccounts.some(d => d.id === a.id));

  // Opening Stock Value (signed Dr opening on acc_inventory or fallback stock-in-hand)
  const openingStock = getEffectiveOpeningStock(data);

  const buildDetailRows = (accs: Account[]): FinancialGroupLedgerRow[] =>
    accs
      .map((acc) => {
        const bal = balancesMap.get(acc.id);
        const openingDr = acc.balanceType === 'DR' ? (acc.openingBalance || 0) : 0;
        const openingCr = acc.balanceType === 'CR' ? (acc.openingBalance || 0) : 0;
        const periodDr = bal ? Math.max(0, Math.round((bal.debit - openingDr) * 100) / 100) : 0;
        const periodCr = bal ? Math.max(0, Math.round((bal.credit - openingCr) * 100) / 100) : 0;
        const closingDr = bal && bal.balanceType === 'DR' ? bal.netBalance : 0;
        const closingCr = bal && bal.balanceType === 'CR' ? bal.netBalance : 0;
        const signedAmount = getSignedLedgerAmount(bal, effCatOf(acc));
        return {
          account: acc,
          openingDr,
          openingCr,
          periodDr,
          periodCr,
          closingDr,
          closingCr,
          signedAmount,
        };
      })
      .filter((r) => Math.abs(r.openingDr) > 0.005 || Math.abs(r.openingCr) > 0.005 || Math.abs(r.periodDr) > 0.005 || Math.abs(r.periodCr) > 0.005 || Math.abs(r.signedAmount) > 0.005);

  const openGroupDrilldown = (
    title: string,
    accs: Account[],
    opts?: { subtitle?: string; formulaHint?: string; metricLabel?: string; metricValue?: number }
  ) => {
    setDetailModalPayload({
      kind: 'GROUP_LEDGERS',
      title,
      subtitle: opts?.subtitle || statementPeriodLabel,
      formulaHint: opts?.formulaHint,
      metricLabel: opts?.metricLabel,
      metricValue: opts?.metricValue,
      accounts: buildDetailRows(accs),
    });
  };

  const openAccountStatement = (acc: Account) => {
    setDrillAccountTarget({ id: acc.id, name: acc.name, preferredKind: 'ACCOUNT' });
  };

  // 1. TRADING ACCOUNT CALCULATIONS (Signed by natural category orientation)
  let totalSalesRevenue = 0;
  for (const acc of salesAccounts) {
    totalSalesRevenue += getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
  }

  let totalDirectExpenses = 0;
  for (const acc of directExpenseAccounts) {
    totalDirectExpenses += getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
  }

  const totalTradingDebit = openingStock + totalDirectExpenses;
  const totalTradingCredit = totalSalesRevenue + closingStock;
  const grossProfit = totalTradingCredit - totalTradingDebit;

  // 2. PROFIT & LOSS CALCULATIONS
  let totalIndirectIncome = 0;
  for (const acc of indirectRevenueAccounts) {
    totalIndirectIncome += getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
  }

  let totalIndirectExpenses = 0;
  for (const acc of indirectExpenseAccounts) {
    totalIndirectExpenses += getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
  }

  const totalPlCredits = (grossProfit > 0 ? grossProfit : 0) + totalIndirectIncome;
  const totalPlDebits = (grossProfit < 0 ? Math.abs(grossProfit) : 0) + totalIndirectExpenses;
  const netProfit = totalPlCredits - totalPlDebits;

  // 3. TRIAL BALANCE BREAKDOWNS (Opening, Transactions, Closing, Condensed Groups)
  const allBalancesList = useMemo<AccountBalance[]>(() => Array.from<AccountBalance>(balancesMap.values()), [balancesMap]);

  const tbAccountEntries = useMemo(() => {
    return allBalancesList
      .map(bal => {
        if (!bal) return null;
        const acc = bal.account;
        const openingDr = acc.balanceType === 'DR' ? (acc.openingBalance || 0) : 0;
        const openingCr = acc.balanceType === 'CR' ? (acc.openingBalance || 0) : 0;
        const txDebit = Math.max(0, Math.round((bal.debit - openingDr) * 100) / 100);
        const txCredit = Math.max(0, Math.round((bal.credit - openingCr) * 100) / 100);
        const closingDr = bal.balanceType === 'DR' ? bal.netBalance : 0;
        const closingCr = bal.balanceType === 'CR' ? bal.netBalance : 0;
        const hasActivity =
          openingDr > 0.001 ||
          openingCr > 0.001 ||
          txDebit > 0.001 ||
          txCredit > 0.001 ||
          closingDr > 0.001 ||
          closingCr > 0.001;
        if (!hasActivity) return null;
        return { account: acc, bal, openingDr, openingCr, txDebit, txCredit, closingDr, closingCr };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
  }, [allBalancesList]);

  const tbColumnTotals = useMemo(() => {
    return tbAccountEntries.reduce(
      (acc, e) => ({
        openingDr: acc.openingDr + e.openingDr,
        openingCr: acc.openingCr + e.openingCr,
        txDebit: acc.txDebit + e.txDebit,
        txCredit: acc.txCredit + e.txCredit,
        closingDr: acc.closingDr + e.closingDr,
        closingCr: acc.closingCr + e.closingCr
      }),
      { openingDr: 0, openingCr: 0, txDebit: 0, txCredit: 0, closingDr: 0, closingCr: 0 }
    );
  }, [tbAccountEntries]);

  const totalTbDebit = tbColumnTotals.closingDr;
  const totalTbCredit = tbColumnTotals.closingCr;

  // 4. BALANCE SHEET TOTALS (Signed by natural category orientation)
  let fixedAssetsTotal = 0;
  let otherAssetsTotal = 0;
  const fixedAssetAccounts: Account[] = [];
  const otherAssetAccounts: Account[] = [];
  for (const acc of assetAccounts) {
    if (isEffectiveStockOpeningAccount(acc, data)) continue; // Stock handled via Closing Stock valuation
    const bal = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
    if (isFixedAssetLedger(acc, data.accountGroups)) {
      fixedAssetsTotal += bal;
      fixedAssetAccounts.push(acc);
    } else {
      otherAssetsTotal += bal;
      otherAssetAccounts.push(acc);
    }
  }

  const totalAssetsCalculated = fixedAssetsTotal + otherAssetsTotal + closingStock;

  let totalCapitalEquity = 0;
  for (const bal of allBalancesList) {
    if (effCatOf(bal.account) === 'EQUITY') {
      totalCapitalEquity += getSignedLedgerAmount(bal, 'EQUITY');
    }
  }

  let totalLiabilitiesVal = 0;
  let nonCurrentLiabTotal = 0;
  let currentLiabTotal = 0;
  const nonCurrentLiabAccounts: Account[] = [];
  const currentLiabAccounts: Account[] = [];
  for (const acc of liabilityAccounts) {
    const bal = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
    totalLiabilitiesVal += bal;
    if (isNonCurrentLiabilityLedger(acc, data.accountGroups)) {
      nonCurrentLiabTotal += bal;
      nonCurrentLiabAccounts.push(acc);
    } else {
      currentLiabTotal += bal;
      currentLiabAccounts.push(acc);
    }
  }

  const currentAssetsTotal = otherAssetsTotal;

  // Trial Balance Condensed Groupings
  const condensedTbGroups = useMemo(() => {
    const tbGroupsMap = new Map<
      string,
      {
        groupName: string;
        category: string;
        openingDr: number;
        openingCr: number;
        txDebit: number;
        txCredit: number;
        dr: number;
        cr: number;
        count: number;
      }
    >();
    for (const entry of tbAccountEntries) {
      const { account, openingDr, openingCr, txDebit, txCredit, closingDr, closingCr } = entry;
      const grp = account.mainGroup || account.subCategory || (
        account.category === 'ASSET' ? 'Current Assets' :
        account.category === 'LIABILITY' ? 'Current Liabilities' :
        account.category === 'EQUITY' ? 'Capital & Reserves' :
        account.category === 'REVENUE' ? 'Sales & Revenues' :
        'Direct & Indirect Expenses'
      );
      if (!tbGroupsMap.has(grp)) {
        tbGroupsMap.set(grp, {
          groupName: grp,
          category: account.category,
          openingDr: 0,
          openingCr: 0,
          txDebit: 0,
          txCredit: 0,
          dr: 0,
          cr: 0,
          count: 0
        });
      }
      const item = tbGroupsMap.get(grp)!;
      item.count += 1;
      item.openingDr += openingDr;
      item.openingCr += openingCr;
      item.txDebit += txDebit;
      item.txCredit += txCredit;
      item.dr += closingDr;
      item.cr += closingCr;
    }
    return Array.from(tbGroupsMap.values());
  }, [tbAccountEntries]);

  // Year-Wise Trial Balance Columns (sorted chronologically ascending)
  const yearWiseColumns = useMemo(() => {
    if (!tbYearWise) return [];
    const fyOptions = getAvailableFinancialYears(fullSource)
      .filter(fy => !fy.isAllYears && fy.fyStart !== 'ALL')
      .slice()
      .sort((a, b) => a.fyStart.localeCompare(b.fyStart));

    const currentStartYear = Number(getFinancialYearRange(activeFyData.company.financialYearStart).fyStart.split('-')[0]);
    return fyOptions
      .filter(fy => {
        const startYear = Number(fy.fyStart.split('-')[0]);
        return fy.count > 0 || startYear <= currentStartYear;
      })
      .map(fy => {
        const fyAppData = filterAppDataByFinancialYear(fullSource, fy.fyStart);
        const fyBalances = calculateAccountBalances(fyAppData);
        return {
          fyStart: fy.fyStart,
          label: fy.label,
          shortLabel: fy.label.replace(/^FY\s*/i, ''),
          txCount: fy.count,
          balancesMap: fyBalances
        };
      });
  }, [tbYearWise, fullSource, activeFyData.company.financialYearStart]);

  // Chronological Periodic Breakdown (Daily / Monthly / Quarterly / Yearly)
  const periodicRows = useMemo(() => {
    if (granularity === 'SUMMARY') return [];
    return buildPeriodicFinancialBreakdown(data, granularity);
  }, [data, granularity]);

  const handleExportPeriodicCsv = () => {
    if (periodicRows.length === 0) return;
    const headers = [
      'Period',
      'Date Range',
      'Transactions',
      'Sales Revenue',
      'Direct Expenses',
      'Gross Profit',
      'Indirect Income',
      'Indirect Expenses',
      'Net Profit',
      'Period Debit',
      'Period Credit',
      'Total Assets (As At End)',
      'Total Liabilities (As At End)',
      'Output GST',
      'Input GST'
    ];
    const rows = periodicRows.map(r => [
      r.label,
      `${r.fromDate} to ${r.toDate}`,
      r.txCount.toString(),
      r.salesRevenue.toFixed(2),
      r.directExpenses.toFixed(2),
      r.grossProfit.toFixed(2),
      r.indirectIncome.toFixed(2),
      r.indirectExpenses.toFixed(2),
      r.netProfit.toFixed(2),
      r.periodDebit.toFixed(2),
      r.periodCredit.toFixed(2),
      r.totalAssets.toFixed(2),
      r.totalLiabilities.toFixed(2),
      r.outputGst.toFixed(2),
      r.inputGst.toFixed(2)
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(data.company.name || 'Company').replace(/\s+/g, '_')}_${activeReport}_${granularity}_Breakdown.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  let totalLiabilitiesAndEquity = totalCapitalEquity + netProfit + totalLiabilitiesVal;
  const bsDifference = totalAssetsCalculated - totalLiabilitiesAndEquity;

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-3 md:p-5 gap-3 w-full md:overflow-hidden">
      {/* Top Banner Header */}
      <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-900 p-4 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-100 flex items-center gap-2 flex-wrap">
            <PieChart className="w-5 h-5 text-indigo-400 shrink-0" />
            <span>{isHindi ? 'व्यापारिक, लाभ-हानि खाता, बैलेंस शीट व ट्रायल बैलेंस' : 'Trading, P&L, Balance Sheet & Trial Balance ERP'}</span>
            <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 text-xs px-2.5 py-0.5 rounded-full font-bold font-mono">
              {statementPeriodLabel}
            </span>
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {isHindi 
              ? 'ट्रेडिंग अकाउंट, पीएंडएल खाता, ट्रायल बैलेंस तथा बैलेंस शीट — चयनित सक्रिय वित्तीय वर्ष, FY-to-FY तुलना या कस्टम तारीख अवधि के अनुसार'
              : 'Indian Accounting Standards Compliant Trading, P&L, Balance Sheet & Trial Balance (Active FY, Custom FY-to-FY Range, or Date Range)'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          
          {/* Condensed vs Detailed View Toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('condensed')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'condensed' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={isHindi ? 'संक्षिप्त दृश्य (मुख्य समूह सारांश)' : 'Condensed View (Summary by Group Heads)'}
            >
              <Layers className="w-3.5 h-3.5 text-amber-300" />
              <span>{isHindi ? 'संक्षिप्त (Condensed)' : 'Condensed'}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('detailed')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'detailed' 
                  ? 'bg-indigo-600 text-white shadow' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={isHindi ? 'विस्तृत दृश्य (सभी सब-लेजर खातों के साथ)' : 'Detailed View (All sub-ledger accounts)'}
            >
              <ListTree className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isHindi ? 'विस्तृत (Detailed - सभी लेजर)' : 'Detailed (All Ledgers)'}</span>
            </button>
            <span className="hidden xl:inline text-[10px] text-slate-500 font-mono px-2">
              Alt+F1
            </span>
          </div>

          {perms.canExportData && (
            <>
              <button
                onClick={() => setShowPrintModal(true)}
                className="flex items-center justify-center gap-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg transition transform active:scale-95 cursor-pointer"
                title={isHindi ? 'A4 साइज़ में वास्तविक प्रिंट पूर्वावलोकन देखें व PDF फाइल डाउनलोड करें' : 'Open authentic A4 paper preview and download real A4 PDF'}
              >
                <Printer className="w-4 h-4 text-emerald-200" />
                <span>{isHindi ? '📄 A4 प्रिंट पूर्वावलोकन व PDF' : '📄 A4 Preview & PDF Download'}</span>
              </button>

              <button
                onClick={() =>
                  printFinancialStatementReport(activeReport, data, isHindi, statementPeriodLabel, {
                    showOpening: tbShowOpening,
                    showTransactions: tbShowTransactions,
                    showClosing: tbShowClosing
                  })
                }
                className="flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2.5 rounded-xl border border-slate-700 shadow transition cursor-pointer"
                title={isHindi ? 'सिस्टम ब्राउज़र प्रिंट डायलॉग' : 'Quick browser print'}
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-400" />
                <span>{isHindi ? 'ब्राउज़र प्रिंट' : 'Browser Print'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Multi-Year Report Period Scope Selector (Active FY vs Custom FY-to-FY vs Date Range) */}
      <div className="shrink-0 bg-slate-900 border border-slate-800 p-3 rounded-2xl flex flex-col gap-2.5 shadow-md text-xs">
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 font-bold text-slate-200">
            <Calendar className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{isHindi ? 'रिपोर्ट अवधि चुनें (Period Scope - F2):' : 'Statement Period Scope (F2):'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setPeriodScope('ACTIVE_FY')}
              className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                periodScope === 'ACTIVE_FY'
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow'
                  : 'bg-slate-950 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {isHindi
                ? `सक्रिय वित्तीय वर्ष (${getFinancialYearRange(activeFyData.company.financialYearStart).label})`
                : `Active FY (${getFinancialYearRange(activeFyData.company.financialYearStart).label})`}
            </button>

            <button
              type="button"
              onClick={() => setPeriodScope('FY_RANGE')}
              className={`px-3 py-1.5 rounded-xl font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                periodScope === 'FY_RANGE'
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                  : 'bg-slate-950 text-emerald-300 border-emerald-500/30 hover:bg-slate-800'
              }`}
            >
              <Globe2 className="w-3.5 h-3.5" />
              <span>{isHindi ? 'किस FY से किस FY तक (Custom FY Range)' : 'Custom FY-to-FY Range'}</span>
            </button>

            <button
              type="button"
              onClick={() => setPeriodScope('CUSTOM_RANGE')}
              className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                periodScope === 'CUSTOM_RANGE'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                  : 'bg-slate-950 text-amber-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              {isHindi ? 'कस्टम तारीख (Custom Dates)' : 'Custom Date Range'}
            </button>

            {periodScope === 'FY_RANGE' && (
              <div className="flex flex-wrap items-center gap-2 ml-0 sm:ml-2">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-emerald-500/40">
                  <span className="text-[11px] text-emerald-300 font-bold">{isHindi ? 'किस FY से:' : 'From FY:'}</span>
                  <select
                    value={fromFyStart}
                    onChange={(e) => setFromFyStart(e.target.value)}
                    className="bg-transparent text-slate-100 font-mono text-xs font-bold outline-none cursor-pointer"
                  >
                    {availableFysAsc.map((fy) => (
                      <option key={fy.fyStart} value={fy.fyStart} className="bg-slate-900">
                        {fy.label} ({fy.count})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-emerald-500/40">
                  <span className="text-[11px] text-emerald-300 font-bold">{isHindi ? 'किस FY तक:' : 'To FY:'}</span>
                  <select
                    value={toFyStart}
                    onChange={(e) => setToFyStart(e.target.value)}
                    className="bg-transparent text-slate-100 font-mono text-xs font-bold outline-none cursor-pointer"
                  >
                    {availableFysAsc.map((fy) => (
                      <option key={fy.fyStart} value={fy.fyStart} className="bg-slate-900">
                        {fy.label} ({fy.count})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {periodScope === 'CUSTOM_RANGE' && (
              <div className="flex flex-wrap items-center gap-2 ml-0 sm:ml-2">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-700">
                  <span className="text-[11px] text-slate-400 font-bold">{isHindi ? 'से:' : 'From:'}</span>
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="bg-transparent text-slate-100 font-mono text-xs outline-none cursor-pointer"
                  />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-700">
                  <span className="text-[11px] text-slate-400 font-bold">{isHindi ? 'तक:' : 'To:'}</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="bg-transparent text-slate-100 font-mono text-xs outline-none cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Report Details Granularity Selector: Summary | Daily | Monthly | Quarterly | Yearly */}
        <div className="pt-2.5 border-t border-slate-800/80 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 font-bold text-slate-300">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{isHindi ? 'रिपोर्ट विवरण अंतराल (Periodicity Details):' : 'Report Details Granularity:'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'SUMMARY', en: 'Summary (Total)', hi: 'कुल सारांश (Summary)' },
              { id: 'DAILY', en: 'Daily (Day-Wise)', hi: 'दैनिक (Daily)' },
              { id: 'MONTHLY', en: 'Monthly (Month-Wise)', hi: 'मासिक (Monthly)' },
              { id: 'QUARTERLY', en: 'Quarterly (Q1–Q4)', hi: 'तिमाही (Quarterly)' },
              { id: 'YEARLY', en: 'Yearly (FY-Wise)', hi: 'वार्षिक (Yearly)' }
            ] as { id: ReportGranularity; en: string; hi: string }[]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setGranularity(opt.id);
                  setExpandedPeriodKey(null);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold border transition cursor-pointer ${
                  granularity === opt.id
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                {isHindi ? opt.hi : opt.en}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Zero-Difference Accounting Integrity Bar */}
      <div
        className={`shrink-0 rounded-xl px-4 py-2 border flex flex-wrap items-center justify-between gap-3 text-sm ${
          zeroDiffAudit.isZeroDifference && zeroDiffAudit.suspenseBalance < 0.001
            ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200'
            : 'bg-amber-950/30 border-amber-500/30 text-amber-200'
        }`}
      >
        <div className="flex items-center gap-2 font-bold">
          {zeroDiffAudit.isZeroDifference ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <span>
            {zeroDiffAudit.isZeroDifference
              ? isHindi
                ? 'शून्य-अंतर लेखा सत्यापित (Zero-Difference Verified)'
                : 'Zero-Difference Books Verified (TB & Balance Sheet Reconciled)'
              : isHindi
              ? 'खाता मिलान चेतावनी (Reconciliation Notice)'
              : 'Reconciliation Diagnostic Notice'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-xs">
          <span>
            TB Diff:{' '}
            <strong className={Math.abs(zeroDiffAudit.trialBalanceDiff) < 0.001 ? 'text-emerald-300' : 'text-rose-300'}>
              {formatCurrency(Math.abs(zeroDiffAudit.trialBalanceDiff), currency)}
            </strong>
          </span>
          <span>
            BS Diff:{' '}
            <strong className={Math.abs(zeroDiffAudit.balanceSheetDiff) < 0.001 ? 'text-emerald-300' : 'text-rose-300'}>
              {formatCurrency(Math.abs(zeroDiffAudit.balanceSheetDiff), currency)}
            </strong>
          </span>
          {Math.abs(zeroDiffAudit.openingDiff) >= 0.001 && (
            <span className="text-amber-300">
              Opening Diff: <strong>{formatCurrency(Math.abs(zeroDiffAudit.openingDiff), currency)}</strong>
            </span>
          )}
          {zeroDiffAudit.suspenseBalance >= 0.001 && (
            <span className="text-amber-300">
              Suspense A/c: <strong>{formatCurrency(zeroDiffAudit.suspenseBalance, currency)}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Navigation Tabs - Mobile Responsive Scroll */}
      <div className="shrink-0 flex items-center gap-1.5 bg-slate-900 p-1.5 rounded-xl border border-slate-800 overflow-x-auto text-nowrap">
        <button
          type="button"
          onClick={() => setActiveReport('TRADING_PL')}
          className={`px-3 md:px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeReport === 'TRADING_PL' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <span>{isHindi ? 'व्यापारिक व लाभ-हानि खाता (Trading & P&L)' : 'Trading & Profit Loss A/c'}</span>
          <span className="text-[10px] font-mono opacity-60 hidden xl:inline">Alt+1</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('BS')}
          className={`px-3 md:px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeReport === 'BS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <span>{isHindi ? 'बैलेंस शीट (Balance Sheet)' : 'Balance Sheet'}</span>
          <span className="text-[10px] font-mono opacity-60 hidden xl:inline">Alt+2</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('TB')}
          className={`px-3 md:px-4 py-2 text-xs font-bold rounded-lg transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
            activeReport === 'TB' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
          }`}
        >
          <span>{isHindi ? 'ट्रायल बैलेंस (Trial Balance)' : 'Standard Trial Balance'}</span>
          <span className="text-[10px] font-mono opacity-60 hidden xl:inline">Alt+3</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveReport('SCH34')}
          className={`px-3 md:px-4 py-2 text-xs font-bold rounded-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'SCH34' ? 'bg-gradient-to-r from-amber-500 to-indigo-600 text-white shadow-md' : 'text-amber-400 hover:bg-slate-800'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          <span>{isHindi ? 'Schedule III/IV (ITR/Companies Act)' : 'Schedule III/IV Disclosures'}</span>
          <span className="text-[10px] font-mono opacity-60 hidden xl:inline">Alt+4</span>
        </button>
      </div>

      {/* Independent Scrollable / Viewport-Locked Report Workspace */}
      <div className={granularity === 'SUMMARY' && activeReport === 'TB' ? 'flex-1 min-h-0 flex flex-col md:overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto space-y-5 pr-1'}>

      {/* PERIODIC BREAKDOWN SCHEDULE (Daily / Monthly / Quarterly / Yearly) */}
      {granularity !== 'SUMMARY' && (
        <div className="bg-slate-900 border border-amber-500/30 rounded-2xl p-4 md:p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-black text-amber-300 flex items-center gap-2 flex-wrap">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  {granularity === 'DAILY'
                    ? (isHindi ? 'दैनिक (Daily) वित्तीय विश्लेषण एवं वाउचर विवरण' : 'Daily Chronological Financial Breakdown')
                    : granularity === 'MONTHLY'
                      ? (isHindi ? 'मासिक (Monthly) वित्तीय विश्लेषण एवं तुलना' : 'Monthly Financial Breakdown & Trends')
                      : granularity === 'QUARTERLY'
                        ? (isHindi ? 'तिमाही (Quarterly Q1–Q4) वित्तीय विश्लेषण' : 'Quarterly Financial Breakdown (Q1–Q4)')
                        : (isHindi ? 'वार्षिक (Yearly FY-Wise) वित्तीय तुलना' : 'Yearly Financial Breakdown (FY-Wise)')}
                </span>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-mono px-2 py-0.5 rounded-full">
                  {periodicRows.length} {isHindi ? 'अवधियाँ' : 'Periods'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isHindi
                  ? 'किसी भी पंक्ति पर क्लिक करके उस दिन/माह/तिमाही/वर्ष के सभी बिल व वाउचर देखें'
                  : 'Click any period row to drill down into exact invoices, purchases, vouchers & notes'}
              </p>
            </div>

            {perms.canExportData && (
              <button
                type="button"
                onClick={handleExportPeriodicCsv}
                disabled={periodicRows.length === 0}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-extrabold text-xs px-3.5 py-2 rounded-xl shadow transition cursor-pointer self-start sm:self-auto"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isHindi ? 'CSV एक्सपोर्ट करें' : `Export ${granularity} CSV`}</span>
              </button>
            )}
          </div>

          {periodicRows.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-slate-950 rounded-xl border border-slate-800">
              {isHindi
                ? 'चयनित अवधि में कोई लेनदेन नहीं मिला।'
                : 'No transactions found in the selected period scope.'}
            </div>
          ) : (
            <div className="overflow-auto max-h-[52vh]">
              <table className="w-full text-left text-sm text-slate-200 min-w-[760px]">
                <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300 font-bold text-xs uppercase border-b border-slate-700">
                  <tr>
                    <th className="p-2.5 w-8"></th>
                    <th className="p-2.5">{isHindi ? 'अवधि (Period)' : 'Period'}</th>
                    <th className="p-2.5 text-center">{isHindi ? 'एंट्रीज़' : 'Txns'}</th>
                    {activeReport === 'BS' ? (
                      <>
                        <th className="p-2.5 text-right">Fixed Assets</th>
                        <th className="p-2.5 text-right">Current Assets</th>
                        <th className="p-2.5 text-right">Total Assets</th>
                        <th className="p-2.5 text-right">Liabilities</th>
                        <th className="p-2.5 text-right">Capital + P&amp;L</th>
                      </>
                    ) : activeReport === 'TB' || activeReport === 'SCH34' ? (
                      <>
                        <th className="p-2.5 text-right">{isHindi ? 'अवधि डेबिट (DR)' : 'Period Debit (DR)'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'अवधि क्रेडिट (CR)' : 'Period Credit (CR)'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'बिक्री (Sales)' : 'Sales Rev.'}</th>
                        <th className="p-2.5 text-right">Output GST</th>
                        <th className="p-2.5 text-right">Input GST</th>
                      </>
                    ) : (
                      <>
                        <th className="p-2.5 text-right">{isHindi ? 'बिक्री आय' : 'Sales Revenue'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'प्रत्यक्ष व्यय/खरीद' : 'Direct Costs'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'सकल लाभ' : 'Gross Profit'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'अप्रत्यक्ष व्यय' : 'Indirect Exp.'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'शुद्ध लाभ / हानि' : 'Net Profit'}</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {periodicRows.map((row) => {
                    const isOpen = expandedPeriodKey === row.key;
                    return (
                      <React.Fragment key={row.key}>
                        <tr
                          onClick={() => setExpandedPeriodKey(isOpen ? null : row.key)}
                          className={`hover:bg-slate-800/60 transition cursor-pointer ${isOpen ? 'bg-indigo-950/30' : ''}`}
                        >
                          <td className="p-2.5 text-slate-400">
                            {isOpen ? <ChevronDown className="w-4 h-4 text-amber-400" /> : <ChevronRight className="w-4 h-4" />}
                          </td>
                          <td className="p-2.5">
                            <div className="font-bold text-slate-100">{row.label}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{row.subLabel}</div>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="bg-slate-800 text-indigo-300 font-mono font-bold px-2 py-0.5 rounded border border-slate-700">
                              {row.txCount}
                            </span>
                          </td>
                          {activeReport === 'BS' ? (
                            <>
                              <td className="p-2.5 text-right font-mono text-slate-200">{formatCurrency(row.fixedAssets, currency)}</td>
                              <td className="p-2.5 text-right font-mono text-slate-200">{formatCurrency(row.currentAssets, currency)}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-400">{formatCurrency(row.totalAssets, currency)}</td>
                              <td className="p-2.5 text-right font-mono text-rose-300">{formatCurrency(row.totalLiabilities, currency)}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-indigo-300">{formatCurrency(row.totalEquityWithProfit, currency)}</td>
                            </>
                          ) : activeReport === 'TB' || activeReport === 'SCH34' ? (
                            <>
                              <td className="p-2.5 text-right font-mono font-bold text-emerald-400">{formatCurrency(row.periodDebit, currency)}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-indigo-400">{formatCurrency(row.periodCredit, currency)}</td>
                              <td className="p-2.5 text-right font-mono text-slate-200">{formatCurrency(row.salesRevenue, currency)}</td>
                              <td className="p-2.5 text-right font-mono text-amber-300">{formatCurrency(row.outputGst, currency)}</td>
                              <td className="p-2.5 text-right font-mono text-sky-300">{formatCurrency(row.inputGst, currency)}</td>
                            </>
                          ) : (
                            <>
                              <td className="p-2.5 text-right font-mono font-semibold text-emerald-300">{formatCurrency(row.salesRevenue, currency)}</td>
                              <td className="p-2.5 text-right font-mono text-amber-300">{formatCurrency(row.directExpenses, currency)}</td>
                              <td className={`p-2.5 text-right font-mono font-bold ${row.grossProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {formatCurrency(row.grossProfit, currency)}
                              </td>
                              <td className="p-2.5 text-right font-mono text-rose-300">{formatCurrency(row.indirectExpenses, currency)}</td>
                              <td className={`p-2.5 text-right font-mono font-extrabold ${row.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {formatCurrency(row.netProfit, currency)}
                              </td>
                            </>
                          )}
                        </tr>

                        {isOpen && (
                          <tr className="bg-slate-950/90">
                            <td colSpan={8} className="p-3 border-t border-slate-800">
                              <div className="text-[11px] font-bold text-indigo-300 mb-2 flex items-center justify-between">
                                <span>
                                  {row.label} — {row.items.length} {isHindi ? 'लेनदेन विवरण' : 'Transactions'}
                                </span>
                                <span className="font-mono text-slate-400">
                                  Sales: {row.invoiceCount} • Purchase: {row.purchaseCount} • Vouchers: {row.voucherCount} • Notes: {row.noteCount}
                                </span>
                              </div>
                                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-800">
                                <table className="w-full text-sm text-left tabular-nums">
                                  <thead className="bg-slate-900 text-slate-300 font-bold text-xs uppercase sticky top-0 z-10 border-b border-slate-800">
                                    <tr>
                                      <th className="p-2">Date</th>
                                      <th className="p-2">Ref No</th>
                                      <th className="p-2">Type</th>
                                      <th className="p-2">Party / Particulars</th>
                                      <th className="p-2 text-right">Taxable</th>
                                      <th className="p-2 text-right">GST</th>
                                      <th className="p-2 text-right">Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/70">
                                    {row.items.map(item => {
                                      const handleInspectPeriodicItem = () => {
                                        if (item.kind === 'SALES') {
                                          const rec = (data.invoices || []).find(x => x.id === item.id);
                                          if (rec) setDetailModalPayload({ kind: 'TRANSACTION_DETAIL', title: `Sales Invoice #${rec.invoiceNumber}`, voucherKind: 'SALES', record: rec });
                                        } else if (item.kind === 'PURCHASE') {
                                          const rec = (data.purchaseInvoices || []).find(x => x.id === item.id);
                                          if (rec) setDetailModalPayload({ kind: 'TRANSACTION_DETAIL', title: `Purchase Bill #${rec.billNumber}`, voucherKind: 'PURCHASE', record: rec });
                                        } else if (item.kind === 'VOUCHER') {
                                          const rec = (data.vouchers || []).find(x => x.id === item.id);
                                          if (rec) setDetailModalPayload({ kind: 'TRANSACTION_DETAIL', title: `${rec.type} Voucher #${rec.voucherNumber}`, voucherKind: 'VOUCHER', record: rec });
                                        } else if (item.kind === 'NOTE') {
                                          const rec = (data.debitCreditNotes || []).find(x => x.id === item.id);
                                          if (rec) setDetailModalPayload({ kind: 'TRANSACTION_DETAIL', title: `${rec.type} #${rec.noteNumber}`, voucherKind: rec.type, record: rec });
                                        }
                                      };
                                      return (
                                        <tr
                                          key={item.id}
                                          onClick={handleInspectPeriodicItem}
                                          className="hover:bg-indigo-500/10 cursor-pointer transition group"
                                        >
                                          <td className="p-2 font-mono text-slate-400">{item.date}</td>
                                          <td className="p-2 font-mono font-bold text-indigo-300 group-hover:underline">{item.refNo}</td>
                                          <td className="p-2">
                                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                                              {item.subType}
                                            </span>
                                          </td>
                                          <td className="p-2 text-slate-200">{item.partyOrParticulars}</td>
                                          <td className="p-2 text-right font-mono text-slate-300">{formatCurrency(item.taxableValue, currency)}</td>
                                          <td className="p-2 text-right font-mono text-amber-300">{formatCurrency(item.gstAmount, currency)}</td>
                                          <td className="p-2 text-right font-mono font-bold text-white">{formatCurrency(item.amount, currency)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {activeReport !== 'BS' && (
                  <tfoot className="bg-slate-950 font-bold text-white border-t-2 border-slate-700">
                    <tr>
                      <td colSpan={2} className="p-2.5 text-right uppercase">
                        {isHindi ? 'कुल अवधि योग:' : 'Period Breakdown Total:'}
                      </td>
                      <td className="p-2.5 text-center font-mono">
                        {periodicRows.reduce((s, r) => s + r.txCount, 0)}
                      </td>
                      {activeReport === 'TB' || activeReport === 'SCH34' ? (
                        <>
                          <td className="p-2.5 text-right font-mono text-emerald-400">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.periodDebit, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-indigo-400">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.periodCredit, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.salesRevenue, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-amber-300">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.outputGst, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-sky-300">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.inputGst, 0), currency)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2.5 text-right font-mono text-emerald-300">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.salesRevenue, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-amber-300">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.directExpenses, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-emerald-400">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.grossProfit, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-rose-300">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.indirectExpenses, 0), currency)}
                          </td>
                          <td className="p-2.5 text-right font-mono text-emerald-400">
                            {formatCurrency(periodicRows.reduce((s, r) => s + r.netProfit, 0), currency)}
                          </td>
                        </>
                      )}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      )}

      {/* REPORT 1: TRADING & PROFIT & LOSS ACCOUNT */}
      {activeReport === 'TRADING_PL' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl space-y-6">
          <div className="text-center border-b border-slate-800 pb-4">
            <h2 className="text-base md:text-lg font-black text-white">{data.company.name}</h2>
            <h3 className="text-xs md:text-sm font-bold text-indigo-400 uppercase tracking-wider mt-1">
              Trading and Profit & Loss Account (व्यापारिक तथा लाभ व हानि खाता)
            </h3>
            <p className="text-[11px] md:text-xs text-slate-400">{statementPeriodLabel}</p>
          </div>

          {/* SECTION A: TRADING ACCOUNT */}
          <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <Boxes className="w-4 h-4 text-amber-400" />
                <span>1. Trading Account Section (व्यापारिक विवरण)</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Gross Income & Cost of Goods</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm tabular-nums">
              {/* Trading Debit Side */}
              <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 flex justify-between">
                  <span>Dr. Particulars (डेबिट व्यय एवं प्रारम्भिक स्टॉक)</span>
                  <span>Amount ({currency})</span>
                </div>
                <div
                  onClick={() => setDetailModalPayload({
                    kind: 'STOCK_VALUATION',
                    stockType: 'OPENING',
                    title: isHindi ? 'प्रारम्भिक स्टॉक आइटम विवरण (Opening Stock Details)' : 'Opening Stock Valuation Breakdown',
                    subtitle: statementPeriodLabel,
                    accInventoryOpening: openingStock
                  })}
                  className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-200 px-1.5 rounded cursor-pointer transition group"
                >
                  <span className="flex items-center gap-1">
                    <span>To Opening Stock (प्रारम्भिक स्टॉक)</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400" />
                  </span>
                  <span className="font-mono font-semibold">{formatCurrency(openingStock, currency)}</span>
                </div>
                {viewMode === 'condensed' ? (
                  <div
                    onClick={() => openGroupDrilldown(
                      isHindi ? 'प्रत्यक्ष व्यय व खरीद लेज़र विवरण (Direct Expenses & Purchases)' : 'Direct Expenses & Purchases Breakdown',
                      directExpenseAccounts,
                      { metricLabel: isHindi ? 'कुल प्रत्यक्ष व्यय व खरीद' : 'Total Direct Expenses', metricValue: totalDirectExpenses }
                    )}
                    className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-amber-300 font-semibold bg-slate-900/40 hover:bg-amber-500/15 px-2 rounded cursor-pointer transition group"
                  >
                    <span className="flex items-center gap-1">
                      <span>To Direct Expenses & Purchases (कुल प्रत्यक्ष व्यय व खरीद)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-amber-400/70 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <span className="font-mono font-bold">{formatCurrency(totalDirectExpenses, currency)}</span>
                  </div>
                ) : (
                  directExpenseAccounts.map((acc) => {
                    const amt = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                    return (
                      <div
                        key={acc.id}
                        onClick={() => openAccountStatement(acc)}
                        className="flex justify-between items-center py-1 border-b border-slate-800/60 text-slate-300 pl-2 pr-1 hover:bg-indigo-500/10 hover:text-indigo-200 rounded cursor-pointer transition group"
                      >
                        <span className="flex items-center gap-1">
                          <span>To [{acc.code}] {acc.name}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-indigo-400" />
                        </span>
                        <span className="font-mono font-semibold">{formatCurrency(amt, currency)}</span>
                      </div>
                    );
                  })
                )}
                <div className="flex justify-between font-bold text-amber-300 pt-2 border-t border-slate-700 bg-slate-800/40 p-1.5 rounded">
                  <span>Total Direct Costs:</span>
                  <span className="font-mono">{formatCurrency(totalTradingDebit, currency)}</span>
                </div>
              </div>

              {/* Trading Credit Side */}
              <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-slate-200 border-b border-slate-800 pb-1 flex justify-between">
                  <span>Cr. Particulars (क्रेडिट बिक्री एवं अंतिम स्टॉक)</span>
                  <span>Amount ({currency})</span>
                </div>
                {viewMode === 'condensed' ? (
                  <div
                    onClick={() => openGroupDrilldown(
                      isHindi ? 'बिक्री एवं प्रत्यक्ष आय लेज़र विवरण (Sales & Direct Revenues)' : 'Sales & Direct Revenues Breakdown',
                      salesAccounts,
                      { metricLabel: isHindi ? 'कुल बिक्री एवं प्रत्यक्ष आय' : 'Total Sales Revenue', metricValue: totalSalesRevenue }
                    )}
                    className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-emerald-300 font-semibold bg-slate-900/40 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition group"
                  >
                    <span className="flex items-center gap-1">
                      <span>By Sales & Direct Revenues (कुल बिक्री एवं प्रत्यक्ष आय)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400/70 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <span className="font-mono font-bold">{formatCurrency(totalSalesRevenue, currency)}</span>
                  </div>
                ) : (
                  salesAccounts.map((acc) => {
                    const amt = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                    return (
                      <div
                        key={acc.id}
                        onClick={() => openAccountStatement(acc)}
                        className="flex justify-between items-center py-1 border-b border-slate-800/60 text-slate-300 pl-2 pr-1 hover:bg-emerald-500/10 hover:text-emerald-200 rounded cursor-pointer transition group"
                      >
                        <span className="flex items-center gap-1">
                          <span>By [{acc.code}] {acc.name}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                        </span>
                        <span className="font-mono font-semibold">{formatCurrency(amt, currency)}</span>
                      </div>
                    );
                  })
                )}
                <div className="border-b border-slate-800/60 rounded">
                  <div className="flex justify-between items-center py-1.5 text-emerald-400 font-semibold hover:bg-emerald-500/10 px-1.5 rounded transition group">
                    <button
                      type="button"
                      onClick={() => setDetailModalPayload({
                        kind: 'STOCK_VALUATION',
                        stockType: 'CLOSING',
                        title: isHindi ? 'अंतिम स्टॉक आइटम विवरण (Closing Stock Valuation)' : 'Closing Stock Valuation Breakdown',
                        subtitle: statementPeriodLabel
                      })}
                      className="flex items-center gap-1 text-left cursor-pointer"
                    >
                      <span>By Closing Stock (अंतिम स्टॉक)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400/70 group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <div className="flex items-center gap-2">
                      {onUpdateCompany && (
                        <button
                          type="button"
                          onClick={() => {
                            setClosingStockDraft(String(closingStock));
                            setEditingClosingStock(prev => !prev);
                          }}
                          className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/30 cursor-pointer"
                          title={isHindi ? 'मैनुअल क्लोजिंग स्टॉक ओवरराइड' : 'Toggle Auto / Manual Closing Stock'}
                        >
                          {isManualClosingStock ? (isHindi ? 'मैनुअल (बदलें)' : 'Manual (Edit)') : (isHindi ? 'ऑटो (बदलें)' : 'Auto (Override)')}
                        </button>
                      )}
                      <span className="font-mono">{formatCurrency(closingStock, currency)}</span>
                    </div>
                  </div>
                  {editingClosingStock && onUpdateCompany && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-2 pt-1 bg-slate-950/80 border-t border-slate-800/80 text-xs">
                      <span className="text-slate-400">
                        {isHindi ? `ऑटो स्टॉक: ${formatCurrency(autoComputedClosingStock, currency)}` : `Auto Stock Value: ${formatCurrency(autoComputedClosingStock, currency)}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={closingStockDraft}
                          onChange={(e) => setClosingStockDraft(e.target.value)}
                          placeholder="0.00"
                          className="w-32 bg-slate-900 border border-amber-500/50 rounded px-2 py-1 text-right font-mono text-white focus:outline-none focus:border-amber-400"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const parsed = parseFloat(closingStockDraft);
                            if (Number.isFinite(parsed)) {
                              applyClosingStockSetting('MANUAL', parsed);
                              setEditingClosingStock(false);
                            }
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold cursor-pointer"
                        >
                          {isHindi ? 'सहेजें' : 'Apply'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            applyClosingStockSetting('AUTO');
                            setEditingClosingStock(false);
                          }}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold cursor-pointer"
                        >
                          {isHindi ? 'ऑटो रीसेट' : 'Use Auto'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex justify-between font-bold text-emerald-300 pt-2 border-t border-slate-700 bg-slate-800/40 p-1.5 rounded">
                  <span>Total Trading Credits:</span>
                  <span className="font-mono">{formatCurrency(totalTradingCredit, currency)}</span>
                </div>
              </div>
            </div>

            {/* Gross Profit / Loss Banner */}
            <div
              onClick={() => openGroupDrilldown(
                isHindi ? 'सकल लाभ गणना विवरण (Trading Account Ledgers)' : 'Gross Profit / Trading Account Breakdown',
                [...salesAccounts, ...directExpenseAccounts],
                {
                  formulaHint: `(${formatCurrency(totalSalesRevenue, currency)} Sales + ${formatCurrency(closingStock, currency)} Closing) - (${formatCurrency(openingStock, currency)} Opening + ${formatCurrency(totalDirectExpenses, currency)} Direct Exp)`,
                  metricLabel: grossProfit >= 0 ? 'Gross Profit' : 'Gross Loss',
                  metricValue: grossProfit
                }
              )}
              className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs font-bold cursor-pointer hover:brightness-110 transition ${
                grossProfit >= 0 ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span>
                  {grossProfit >= 0
                    ? (isHindi ? 'सकल लाभ (Gross Profit c/d - P&L में स्थानांतरित):' : 'Gross Profit c/d (Carried to Profit & Loss A/c):')
                    : (isHindi ? 'सकल हानि (Gross Loss c/d - P&L में स्थानांतरित):' : 'Gross Loss c/d (Carried to Profit & Loss A/c):')}
                </span>
                <ChevronRight className="w-4 h-4 opacity-70" />
              </div>
              <span className="text-base font-black font-mono">{formatCurrency(Math.abs(grossProfit), currency)}</span>
            </div>
          </div>

          {/* SECTION B: PROFIT & LOSS ACCOUNT */}
          <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-black text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <Scale className="w-4 h-4 text-indigo-400" />
                <span>2. Profit & Loss Section (अप्रत्यक्ष आय एवं संचालन व्यय)</span>
              </h4>
              <span className="text-[10px] text-slate-400 font-mono">Net Earning Calculation</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm tabular-nums">
              {/* P&L Expenses Side */}
              <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-rose-300 border-b border-slate-800 pb-1 flex justify-between">
                  <span>Dr. Indirect Expenses (अप्रत्यक्ष व्यय)</span>
                  <span>Amount ({currency})</span>
                </div>
                {grossProfit < 0 && (
                  <div
                    onClick={() => openGroupDrilldown(
                      isHindi ? 'सकल हानि गणना विवरण (Trading Account Ledgers)' : 'Gross Loss / Trading Account Breakdown',
                      [...salesAccounts, ...directExpenseAccounts],
                      { metricLabel: 'Gross Loss', metricValue: Math.abs(grossProfit) }
                    )}
                    className="flex justify-between items-center py-1 border-b border-slate-800/60 text-rose-400 font-bold hover:bg-rose-500/10 px-1.5 rounded cursor-pointer transition group"
                  >
                    <span className="flex items-center gap-1">
                      <span>To Gross Loss b/d</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                    </span>
                    <span className="font-mono">{formatCurrency(Math.abs(grossProfit), currency)}</span>
                  </div>
                )}
                {viewMode === 'condensed' ? (
                  <div
                    onClick={() => openGroupDrilldown(
                      isHindi ? 'अप्रत्यक्ष संचालन व्यय विवरण (Indirect Expenses)' : 'Indirect Operating Expenses Breakdown',
                      indirectExpenseAccounts,
                      { metricLabel: isHindi ? 'कुल अप्रत्यक्ष व्यय' : 'Total Indirect Expenses', metricValue: totalIndirectExpenses }
                    )}
                    className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-rose-300 font-semibold bg-slate-900/40 hover:bg-rose-500/15 px-2 rounded cursor-pointer transition group"
                  >
                    <span className="flex items-center gap-1">
                      <span>To Indirect Operating Expenses (कुल अप्रत्यक्ष संचालन व्यय)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-rose-400/70 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <span className="font-mono font-bold">{formatCurrency(totalIndirectExpenses, currency)}</span>
                  </div>
                ) : (
                  indirectExpenseAccounts.map((acc) => {
                    const amt = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                    return (
                      <div
                        key={acc.id}
                        onClick={() => openAccountStatement(acc)}
                        className="flex justify-between items-center py-1 border-b border-slate-800/60 text-slate-300 pl-2 pr-1 hover:bg-rose-500/10 hover:text-rose-200 rounded cursor-pointer transition group"
                      >
                        <span className="flex items-center gap-1">
                          <span>To [{acc.code}] {acc.name}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-rose-400" />
                        </span>
                        <span className="font-mono font-semibold">{formatCurrency(amt, currency)}</span>
                      </div>
                    );
                  })
                )}
                <div className="flex justify-between font-bold text-rose-400 pt-2 border-t border-slate-700 bg-slate-800/40 p-1.5 rounded">
                  <span>Total P&L Debits:</span>
                  <span className="font-mono">{formatCurrency(totalPlDebits, currency)}</span>
                </div>
              </div>

              {/* P&L Incomes Side */}
              <div className="space-y-2 bg-slate-900/60 p-3 rounded-lg border border-slate-800">
                <div className="font-bold text-emerald-300 border-b border-slate-800 pb-1 flex justify-between">
                  <span>Cr. Incomes & Gains (अप्रत्यक्ष आय)</span>
                  <span>Amount ({currency})</span>
                </div>
                {grossProfit >= 0 && (
                  <div
                    onClick={() => openGroupDrilldown(
                      isHindi ? 'सकल लाभ गणना विवरण (Trading Account Ledgers)' : 'Gross Profit / Trading Account Breakdown',
                      [...salesAccounts, ...directExpenseAccounts],
                      { metricLabel: 'Gross Profit', metricValue: grossProfit }
                    )}
                    className="flex justify-between items-center py-1 border-b border-slate-800/60 text-emerald-400 font-bold hover:bg-emerald-500/10 px-1.5 rounded cursor-pointer transition group"
                  >
                    <span className="flex items-center gap-1">
                      <span>By Gross Profit b/d</span>
                      <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                    </span>
                    <span className="font-mono">{formatCurrency(grossProfit, currency)}</span>
                  </div>
                )}
                {viewMode === 'condensed' ? (
                  <div
                    onClick={() => openGroupDrilldown(
                      isHindi ? 'अप्रत्यक्ष आय एवं लाभ विवरण (Indirect Incomes)' : 'Indirect Incomes & Other Gains Breakdown',
                      indirectRevenueAccounts,
                      { metricLabel: isHindi ? 'कुल अप्रत्यक्ष आय' : 'Total Indirect Income', metricValue: totalIndirectIncome }
                    )}
                    className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-emerald-300 font-semibold bg-slate-900/40 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition group"
                  >
                    <span className="flex items-center gap-1">
                      <span>By Indirect Incomes & Other Gains (कुल अप्रत्यक्ष आय व लाभ)</span>
                      <ChevronRight className="w-3.5 h-3.5 text-emerald-400/70 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                    <span className="font-mono font-bold">{formatCurrency(totalIndirectIncome, currency)}</span>
                  </div>
                ) : (
                  indirectRevenueAccounts.map((acc) => {
                    const amt = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                    return (
                      <div
                        key={acc.id}
                        onClick={() => openAccountStatement(acc)}
                        className="flex justify-between items-center py-1 border-b border-slate-800/60 text-slate-300 pl-2 pr-1 hover:bg-emerald-500/10 hover:text-emerald-200 rounded cursor-pointer transition group"
                      >
                        <span className="flex items-center gap-1">
                          <span>By [{acc.code}] {acc.name}</span>
                          <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                        </span>
                        <span className="font-mono font-semibold">{formatCurrency(amt, currency)}</span>
                      </div>
                    );
                  })
                )}
                <div className="flex justify-between font-bold text-emerald-300 pt-2 border-t border-slate-700 bg-slate-800/40 p-1.5 rounded">
                  <span>Total P&L Credits:</span>
                  <span className="font-mono">{formatCurrency(totalPlCredits, currency)}</span>
                </div>
              </div>
            </div>

            {/* Net Profit Summary Card */}
            <div
              onClick={() => openGroupDrilldown(
                isHindi ? 'शुद्ध लाभ / हानि गणना विवरण (All Revenue & Expense Ledgers)' : 'Net Profit / Loss Complete Breakdown',
                [...salesAccounts, ...indirectRevenueAccounts, ...directExpenseAccounts, ...indirectExpenseAccounts],
                {
                  formulaHint: `Gross Profit (${formatCurrency(grossProfit, currency)}) + Indirect Income (${formatCurrency(totalIndirectIncome, currency)}) - Indirect Expenses (${formatCurrency(totalIndirectExpenses, currency)})`,
                  metricLabel: netProfit >= 0 ? 'Net Profit' : 'Net Loss',
                  metricValue: netProfit
                }
              )}
              className={`p-4 rounded-xl border flex flex-col sm:flex-row items-center justify-between gap-3 cursor-pointer hover:brightness-110 transition ${
                netProfit >= 0 ? 'bg-emerald-950/50 border-emerald-500/50 text-white' : 'bg-rose-950/50 border-rose-500/50 text-white'
              }`}
            >
              <div>
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>{isHindi ? 'शुद्ध लाभ / हानि (Net Profit / Loss c/f to Capital):' : 'Net Profit / Loss (Transferred to Capital):'}</span>
                  <ChevronRight className="w-4 h-4 opacity-70" />
                </h4>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  {isHindi ? 'संचालन तथा प्रत्यक्ष/अप्रत्यक्ष व्यय पश्चात अंतिम वित्तीय परिणाम (क्लिक करके विस्तृत विवरण देखें)' : 'Final net earnings added to Owner Capital in Balance Sheet (Click for complete ledger breakdown)'}
                </p>
              </div>
              <div className={`text-2xl font-black font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(netProfit, currency)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPORT 2: BALANCE SHEET */}
      {activeReport === 'BS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl space-y-6">
          <div className="text-center border-b border-slate-800 pb-4">
            <h2 className="text-base md:text-lg font-black text-white">{data.company.name}</h2>
            <h3 className="text-xs md:text-sm font-bold text-indigo-400 uppercase tracking-wider mt-1">
              Balance Sheet Statement (तुलन पत्र / संपत्ति एवं दायित्व)
            </h3>
            <p className="text-[11px] md:text-xs text-slate-400">Financial Year Statement - HisabVeda Double Entry Balanced Verification</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Liabilities & Capital Side */}
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-rose-400 uppercase tracking-wider border-b border-slate-800 pb-2 flex justify-between">
                <span>Capital & Liabilities (दायित्व एवं पूंजी)</span>
                <span>Amount ({currency})</span>
              </h4>
              <div className="space-y-2 text-sm tabular-nums">
                {viewMode === 'condensed' ? (
                  <>
                    <div
                      onClick={() => openGroupDrilldown(
                        isHindi ? 'पूंजी एवं आरक्षित कोष (Capital & Equity Accounts)' : 'Capital & Equity Accounts Breakdown',
                        equityAccounts,
                        { metricLabel: 'Total Capital & Equity', metricValue: totalCapitalEquity }
                      )}
                      className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-amber-300 font-bold bg-slate-900/50 hover:bg-amber-500/15 px-2 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>1. Capital & Equity Accounts (कुल शेयर/पार्टनर पूंजी)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono text-white">{formatCurrency(totalCapitalEquity, currency)}</span>
                    </div>
                    <div
                      onClick={() => openGroupDrilldown(
                        isHindi ? 'शुद्ध लाभ / हानि विवरण (Net Profit P&L Ledgers)' : 'Net Profit Calculation Breakdown',
                        [...salesAccounts, ...indirectRevenueAccounts, ...directExpenseAccounts, ...indirectExpenseAccounts],
                        { metricLabel: netProfit >= 0 ? 'Net Profit' : 'Net Loss', metricValue: netProfit }
                      )}
                      className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-emerald-400 font-bold bg-emerald-950/20 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>(+) Current Period Net Profit (P&L से शुद्ध लाभ)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono">{formatCurrency(netProfit, currency)}</span>
                    </div>
                    {nonCurrentLiabTotal !== 0 && (
                      <div
                        onClick={() => openGroupDrilldown(
                          isHindi ? 'दीर्घकालिक देनदारियाँ (Non-Current Liabilities)' : 'Non-Current / Long-Term Liabilities Breakdown',
                          nonCurrentLiabAccounts,
                          { metricLabel: 'Non-Current Liabilities', metricValue: nonCurrentLiabTotal }
                        )}
                        className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-rose-300 font-semibold bg-slate-900/50 hover:bg-rose-500/15 px-2 rounded cursor-pointer transition group"
                      >
                        <span className="flex items-center gap-1">
                          <span>2. Non-Current / Long-Term Liabilities (दीर्घकालिक ऋण)</span>
                          <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                        </span>
                        <span className="font-mono">{formatCurrency(nonCurrentLiabTotal, currency)}</span>
                      </div>
                    )}
                    <div
                      onClick={() => openGroupDrilldown(
                        isHindi ? 'चालू देनदारियाँ व लेनदार (Current Liabilities & Payables)' : 'Current Liabilities & Trade Payables Breakdown',
                        currentLiabAccounts,
                        { metricLabel: 'Current Liabilities', metricValue: currentLiabTotal }
                      )}
                      className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-rose-300 font-semibold bg-slate-900/50 hover:bg-rose-500/15 px-2 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>3. Current Liabilities & Trade Payables (लेनदार व चालू देनदारियां)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono">{formatCurrency(currentLiabTotal, currency)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-amber-400 text-[11px] uppercase pt-1">1. Capital & Equity Accounts</div>
                    {equityAccounts.map((acc) => {
                      const bal = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                      return (
                        <div
                          key={acc.id}
                          onClick={() => openAccountStatement(acc)}
                          className="flex justify-between items-center py-1 border-b border-slate-800/60 pl-2 pr-1 hover:bg-indigo-500/10 rounded cursor-pointer transition group"
                        >
                          <span className="text-slate-300 flex items-center gap-1">
                            <span>[{acc.code}] {acc.name}</span>
                            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-indigo-400" />
                          </span>
                          <span className="font-mono font-semibold text-slate-100">{formatCurrency(bal, currency)}</span>
                        </div>
                      );
                    })}
                    <div
                      onClick={() => openGroupDrilldown(
                        isHindi ? 'शुद्ध लाभ / हानि विवरण (Net Profit)' : 'Net Profit Calculation Breakdown',
                        [...salesAccounts, ...indirectRevenueAccounts, ...directExpenseAccounts, ...indirectExpenseAccounts],
                        { metricLabel: netProfit >= 0 ? 'Net Profit' : 'Net Loss', metricValue: netProfit }
                      )}
                      className="flex justify-between items-center py-1 border-b border-slate-800/60 text-emerald-400 font-bold bg-emerald-950/20 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition"
                    >
                      <span className="flex items-center gap-1">
                        <span>(+) Current Period Net Profit (P&L से शुद्ध लाभ)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono">{formatCurrency(netProfit, currency)}</span>
                    </div>

                    <div className="font-bold text-amber-400 text-[11px] uppercase pt-2">2. Liabilities & Payables</div>
                    {liabilityAccounts.map((acc) => {
                      const bal = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                      return (
                        <div
                          key={acc.id}
                          onClick={() => openAccountStatement(acc)}
                          className="flex justify-between items-center py-1 border-b border-slate-800/60 pl-2 pr-1 hover:bg-rose-500/10 rounded cursor-pointer transition group"
                        >
                          <span className="text-slate-300 flex items-center gap-1">
                            <span>[{acc.code}] {acc.name}</span>
                            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-rose-400" />
                          </span>
                          <span className="font-mono font-semibold text-slate-100">{formatCurrency(bal, currency)}</span>
                        </div>
                      );
                    })}
                  </>
                )}

              </div>
              <div className="flex justify-between text-xs font-extrabold text-slate-100 pt-3 border-t-2 border-slate-700 bg-slate-800/60 p-2.5 rounded-lg">
                <span>Total Capital & Liabilities:</span>
                <span className="font-mono text-sm text-indigo-300">{formatCurrency(totalLiabilitiesAndEquity, currency)}</span>
              </div>
            </div>

            {/* Assets Side */}
            <div className="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider border-b border-slate-800 pb-2 flex justify-between">
                <span>Assets & Properties (परिसंपत्तियां)</span>
                <span>Amount ({currency})</span>
              </h4>
              <div className="space-y-2 text-sm tabular-nums">
                {viewMode === 'condensed' ? (
                  <>
                    <div
                      onClick={() => openGroupDrilldown(
                        isHindi ? 'अचल संपत्तियाँ विवरण (Fixed Assets)' : 'Non-Current / Fixed Assets Breakdown',
                        fixedAssetAccounts,
                        { metricLabel: 'Fixed Assets', metricValue: fixedAssetsTotal }
                      )}
                      className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-emerald-400 font-bold bg-slate-900/50 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>1. Non-Current / Fixed Assets (कुल अचल संपत्तियां)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono text-white">{formatCurrency(fixedAssetsTotal, currency)}</span>
                    </div>
                    <div
                      onClick={() => setDetailModalPayload({
                        kind: 'STOCK_VALUATION',
                        stockType: 'CLOSING',
                        title: isHindi ? 'अंतिम स्टॉक मूल्यांकन विवरण (Closing Stock Breakdown)' : 'Closing Stock Valuation Breakdown',
                        subtitle: statementPeriodLabel
                      })}
                      className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-emerald-300 font-bold bg-emerald-950/20 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>2. Closing Stock Valuation (अंतिम स्टॉक मूल्यांकन)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono">{formatCurrency(closingStock, currency)}</span>
                    </div>
                    <div
                      onClick={() => openGroupDrilldown(
                        isHindi ? 'चालू संपत्तियाँ, बैंक, नकद व देनदार' : 'Current Assets, Bank, Cash & Receivables Breakdown',
                        otherAssetAccounts,
                        { metricLabel: 'Current Assets (Excl. Stock)', metricValue: currentAssetsTotal }
                      )}
                      className="flex justify-between items-center py-1.5 border-b border-slate-800/60 text-emerald-400 font-semibold bg-slate-900/50 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>3. Current Assets, Bank, Cash & Receivables (चालू संपत्तियां व देनदार)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono text-white">{formatCurrency(currentAssetsTotal, currency)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-bold text-emerald-400 text-[11px] uppercase pt-1">1. Non-Current / Fixed Assets</div>
                    {fixedAssetAccounts.map((acc) => {
                      const bal = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                      return (
                        <div
                          key={acc.id}
                          onClick={() => openAccountStatement(acc)}
                          className="flex justify-between items-center py-1 border-b border-slate-800/60 pl-2 pr-1 hover:bg-emerald-500/10 rounded cursor-pointer transition group"
                        >
                          <span className="text-slate-300 flex items-center gap-1">
                            <span>[{acc.code}] {acc.name}</span>
                            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                          </span>
                          <span className="font-mono font-semibold text-slate-100">{formatCurrency(bal, currency)}</span>
                        </div>
                      );
                    })}

                    <div className="font-bold text-emerald-400 text-[11px] uppercase pt-2">2. Current Assets, Inventory & Cash</div>
                    <div
                      onClick={() => setDetailModalPayload({
                        kind: 'STOCK_VALUATION',
                        stockType: 'CLOSING',
                        title: isHindi ? 'अंतिम स्टॉक मूल्यांकन विवरण (Closing Stock Breakdown)' : 'Closing Stock Valuation Breakdown',
                        subtitle: statementPeriodLabel
                      })}
                      className="flex justify-between items-center py-1 border-b border-slate-800/60 text-emerald-300 font-bold bg-emerald-950/20 hover:bg-emerald-500/15 px-2 rounded cursor-pointer transition"
                    >
                      <span className="flex items-center gap-1">
                        <span>Closing Stock Valuation (अंतिम स्टॉक)</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70" />
                      </span>
                      <span className="font-mono">{formatCurrency(closingStock, currency)}</span>
                    </div>
                    {otherAssetAccounts.map((acc) => {
                      const bal = getSignedLedgerAmount(balancesMap.get(acc.id), effCatOf(acc));
                      return (
                        <div
                          key={acc.id}
                          onClick={() => openAccountStatement(acc)}
                          className="flex justify-between items-center py-1 border-b border-slate-800/60 pl-2 pr-1 hover:bg-emerald-500/10 rounded cursor-pointer transition group"
                        >
                          <span className="text-slate-300 flex items-center gap-1">
                            <span>[{acc.code}] {acc.name}</span>
                            <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                          </span>
                          <span className="font-mono font-semibold text-slate-100">{formatCurrency(bal, currency)}</span>
                        </div>
                      );
                    })}
                  </>
                )}

              </div>
              <div className="flex justify-between text-xs font-extrabold text-slate-100 pt-3 border-t-2 border-slate-700 bg-slate-800/60 p-2.5 rounded-lg">
                <span>Total Assets:</span>
                <span className="font-mono text-sm text-emerald-400">{formatCurrency(totalAssetsCalculated, currency)}</span>
              </div>
            </div>
          </div>

          {/* Balanced Status Badge */}
          <div
            className={`p-3.5 rounded-xl flex items-center justify-between text-sm font-bold border ${
              Math.abs(bsDifference) < 0.001
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {Math.abs(bsDifference) < 0.001 ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              )}
              <span>
                {Math.abs(bsDifference) < 0.001
                  ? (isHindi ? '✓ बैलेंस शीट 100% संतुलित व टली है (Total Liabilities = Total Assets)' : '✓ Balance Sheet 100% Tallied & Balanced (Liabilities = Assets)')
                  : (isHindi
                      ? `बैलेंस शीट अंतर मिला: ${formatCurrency(Math.abs(bsDifference), currency)} (Opening Stock / Ledgers जाँचें)`
                      : `Balance Sheet Difference Detected: ${formatCurrency(Math.abs(bsDifference), currency)} (Review Opening Stock / Ledgers)`)}
              </span>
            </div>
            <span className="font-mono tabular-nums text-base text-white">{formatCurrency(totalAssetsCalculated, currency)}</span>
          </div>
        </div>
      )}

      {/* REPORT 3: TRIAL BALANCE */}
      {activeReport === 'TB' && (() => {
        const showClosingCol = tbShowClosing || (!tbShowOpening && !tbShowTransactions);
        return (
        <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 shadow-xl gap-3.5 md:overflow-hidden">
          <div className="shrink-0 text-center border-b border-slate-800 pb-3">
            <h2 className="text-base md:text-lg font-black text-white">{data.company.name}</h2>
            <h3 className="text-xs md:text-sm font-bold text-indigo-400 uppercase tracking-wider mt-0.5">
              Standard Trial Balance Statement (तलपट / ट्रायल बैलेंस)
            </h3>
            <p className="text-xs text-slate-400">
              {viewMode === 'condensed' 
                ? (isHindi ? 'संक्षिप्त समूह-वाइज़ तलपट दृश्य' : 'Condensed Group-Wise Summary View') 
                : (isHindi ? 'विस्तृत सभी उप-लेजर खाता दृश्य' : 'Detailed All Sub-Ledger Account View')}
              {tbYearWise ? (isHindi ? ' • वर्ष-वार तुलनात्मक (Year-Wise)' : ' • Year-Wise Comparison') : ''}
            </p>
          </div>

          {/* Trial Balance View Settings Bar (F12 Display Options) */}
          <div className="shrink-0 bg-slate-950 border border-slate-800 rounded-xl p-2.5 px-3 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-2 font-bold text-indigo-300 shrink-0">
              <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
              <span>{isHindi ? 'ट्रायल बैलेंस दृश्य सेटिंग्स (View Settings):' : 'Trial Balance View Settings:'}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 cursor-pointer hover:border-indigo-500/40 select-none">
                <input
                  type="checkbox"
                  checked={tbShowOpening}
                  disabled={tbYearWise}
                  onChange={(e) => setTbShowOpening(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span>{isHindi ? 'प्रारंभिक शेष (Opening Balance)' : 'Show Opening Balance'}</span>
              </label>

              <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 cursor-pointer hover:border-indigo-500/40 select-none">
                <input
                  type="checkbox"
                  checked={tbShowTransactions}
                  disabled={tbYearWise}
                  onChange={(e) => setTbShowTransactions(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span>{isHindi ? 'लेनदेन विवरण (Transaction Details)' : 'Show Transactions (Dr/Cr)'}</span>
              </label>

              <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 cursor-pointer hover:border-indigo-500/40 select-none">
                <input
                  type="checkbox"
                  checked={showClosingCol}
                  disabled={tbYearWise}
                  onChange={(e) => setTbShowClosing(e.target.checked)}
                  className="accent-indigo-500 rounded"
                />
                <span>{isHindi ? 'अंतिम शेष (Closing Balance)' : 'Show Closing Balance'}</span>
              </label>

              <button
                type="button"
                onClick={() => setTbYearWise(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                  tbYearWise
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                    : 'bg-slate-900 text-emerald-300 border-emerald-500/30 hover:bg-slate-800'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>{isHindi ? 'वर्ष-वार तुलना (Year-Wise)' : 'Year-Wise Breakdown'}</span>
              </button>
            </div>
          </div>

          {tbYearWise ? (
            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-sm text-slate-200 min-w-[780px] tabular-nums">
                <thead className="sticky top-0 z-10 bg-slate-800 text-slate-200 font-bold text-xs uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="p-3">{viewMode === 'condensed' ? '#' : 'Code'}</th>
                    <th className="p-3">{viewMode === 'condensed' ? 'Account Group' : 'Account Particulars'}</th>
                    <th className="p-3">Category</th>
                    {yearWiseColumns.map(col => (
                      <th key={col.fyStart} className="p-3 text-right border-l border-slate-700/70">
                        <div>{col.shortLabel}</div>
                        <div className="text-[9px] text-slate-400 font-normal">({col.txCount} tx)</div>
                      </th>
                    ))}
                    <th className="p-3 text-right border-l border-slate-700 text-emerald-300">Cumulative</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {viewMode === 'condensed' ? (
                    condensedTbGroups.map((g, idx) => {
                      const cumSigned = g.dr - g.cr;
                      const groupMatchedAccounts = tbAccountEntries
                        .filter((entry) => {
                          const grp = entry.account.mainGroup || entry.account.subCategory || (
                            entry.account.category === 'ASSET' ? 'Current Assets' :
                            entry.account.category === 'LIABILITY' ? 'Current Liabilities' :
                            entry.account.category === 'EQUITY' ? 'Capital & Reserves' :
                            entry.account.category === 'REVENUE' ? 'Sales & Revenues' :
                            'Direct & Indirect Expenses'
                          );
                          return grp === g.groupName;
                        })
                        .map((e) => e.account);
                      return (
                        <tr
                          key={g.groupName}
                          onClick={() => openGroupDrilldown(
                            `${g.groupName} (${g.category})`,
                            groupMatchedAccounts,
                            { metricLabel: 'Net Group Balance', metricValue: Math.abs(cumSigned) }
                          )}
                          className="hover:bg-indigo-500/10 cursor-pointer transition group"
                        >
                          <td className="p-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-100 group-hover:text-indigo-300">
                            {g.groupName} <span className="text-[10px] text-slate-500 font-normal">({g.count})</span>
                          </td>
                          <td className="p-3 text-slate-400">{g.category}</td>
                          {yearWiseColumns.map(col => {
                            let grpSigned = 0;
                            for (const entry of tbAccountEntries) {
                              const grp = entry.account.mainGroup || entry.account.subCategory || (
                                entry.account.category === 'ASSET' ? 'Current Assets' :
                                entry.account.category === 'LIABILITY' ? 'Current Liabilities' :
                                entry.account.category === 'EQUITY' ? 'Capital & Reserves' :
                                entry.account.category === 'REVENUE' ? 'Sales & Revenues' :
                                'Direct & Indirect Expenses'
                              );
                              if (grp === g.groupName) {
                                const b = col.balancesMap.get(entry.account.id);
                                if (b) {
                                  grpSigned += b.balanceType === 'DR' ? b.netBalance : -b.netBalance;
                                }
                              }
                            }
                            return (
                              <td key={col.fyStart} className="p-3 text-right font-mono border-l border-slate-800/70">
                                {Math.abs(grpSigned) > 0.001 ? (
                                  <span className={grpSigned >= 0 ? 'text-emerald-400 font-semibold' : 'text-indigo-300 font-semibold'}>
                                    {formatCurrency(Math.abs(grpSigned), currency)}{' '}
                                    <span className="text-[10px]">{grpSigned >= 0 ? 'Dr' : 'Cr'}</span>
                                  </span>
                                ) : '-'}
                              </td>
                            );
                          })}
                          <td className="p-3 text-right font-mono font-bold border-l border-slate-800">
                            <span className={cumSigned >= 0 ? 'text-emerald-400' : 'text-indigo-400'}>
                              {formatCurrency(Math.abs(cumSigned), currency)} {cumSigned >= 0 ? 'Dr' : 'Cr'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    tbAccountEntries.map(({ account, closingDr, closingCr }) => {
                      const cumSigned = closingDr - closingCr;
                      return (
                        <tr
                          key={account.id}
                          onClick={() => openAccountStatement(account)}
                          className="hover:bg-indigo-500/10 cursor-pointer transition group"
                        >
                          <td className="p-3 font-mono font-bold text-indigo-300">{account.code}</td>
                          <td className="p-3 font-semibold text-slate-100 group-hover:text-indigo-300">{account.name}</td>
                          <td className="p-3 text-slate-400">{account.category}</td>
                          {yearWiseColumns.map(col => {
                            const b = col.balancesMap.get(account.id);
                            const amt = b?.netBalance || 0;
                            const isDr = (b?.balanceType || 'DR') === 'DR';
                            return (
                              <td key={col.fyStart} className="p-3 text-right font-mono border-l border-slate-800/70">
                                {amt > 0.001 ? (
                                  <span className={isDr ? 'text-emerald-400 font-semibold' : 'text-indigo-300 font-semibold'}>
                                    {formatCurrency(amt, currency)} <span className="text-[10px]">{isDr ? 'Dr' : 'Cr'}</span>
                                  </span>
                                ) : '-'}
                              </td>
                            );
                          })}
                          <td className="p-3 text-right font-mono font-bold border-l border-slate-800">
                            <span className={cumSigned >= 0 ? 'text-emerald-400' : 'text-indigo-400'}>
                              {formatCurrency(Math.abs(cumSigned), currency)} {cumSigned >= 0 ? 'Dr' : 'Cr'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-slate-800 font-bold text-xs text-white border-t-2 border-slate-700">
                  <tr>
                    <td colSpan={3} className="p-3 text-right uppercase">Year-Wise Dr / Cr Totals:</td>
                    {yearWiseColumns.map(col => {
                      let drSum = 0;
                      let crSum = 0;
                      col.balancesMap.forEach((b) => {
                        if (b.netBalance > 0.001) {
                          if (b.balanceType === 'DR') drSum += b.netBalance;
                          else crSum += b.netBalance;
                        }
                      });
                      return (
                        <td key={col.fyStart} className="p-3 text-right font-mono text-xs border-l border-slate-700">
                          <div className="text-emerald-400">Dr {formatCurrency(drSum, currency)}</div>
                          <div className="text-indigo-300">Cr {formatCurrency(crSum, currency)}</div>
                        </td>
                      );
                    })}
                    <td className="p-3 text-right font-mono text-xs border-l border-slate-700">
                      <div className="text-emerald-400">Dr {formatCurrency(totalTbDebit, currency)}</div>
                      <div className="text-indigo-300">Cr {formatCurrency(totalTbCredit, currency)}</div>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-slate-800">
              <table className="w-full text-left text-sm text-slate-200 min-w-[680px] tabular-nums">
                <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300 font-bold text-xs uppercase tracking-wider border-b border-slate-700">
                  <tr>
                    <th className="p-3">{viewMode === 'condensed' ? '#' : 'Code'}</th>
                    <th className="p-3">{viewMode === 'condensed' ? 'Account Group / Head' : 'Account Particulars'}</th>
                    <th className="p-3">Category</th>
                    {tbShowOpening && (
                      <>
                        <th className="p-3 text-right border-l border-slate-700/70">Opening DR ({currency})</th>
                        <th className="p-3 text-right">Opening CR ({currency})</th>
                      </>
                    )}
                    {tbShowTransactions && (
                      <>
                        <th className="p-3 text-right border-l border-slate-700/70">Txns Debit ({currency})</th>
                        <th className="p-3 text-right">Txns Credit ({currency})</th>
                      </>
                    )}
                    {showClosingCol && (
                      <>
                        <th className="p-3 text-right border-l border-slate-700/70">Closing DR ({currency})</th>
                        <th className="p-3 text-right">Closing CR ({currency})</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {viewMode === 'condensed' ? (
                    condensedTbGroups.map((g, idx) => {
                      const groupMatchedAccounts = tbAccountEntries
                        .filter((entry) => {
                          const grp = entry.account.mainGroup || entry.account.subCategory || (
                            entry.account.category === 'ASSET' ? 'Current Assets' :
                            entry.account.category === 'LIABILITY' ? 'Current Liabilities' :
                            entry.account.category === 'EQUITY' ? 'Capital & Reserves' :
                            entry.account.category === 'REVENUE' ? 'Sales & Revenues' :
                            'Direct & Indirect Expenses'
                          );
                          return grp === g.groupName;
                        })
                        .map((e) => e.account);
                      return (
                        <tr
                          key={g.groupName}
                          onClick={() => openGroupDrilldown(
                            `${g.groupName} (${g.category})`,
                            groupMatchedAccounts,
                            { metricLabel: 'Net Closing Balance', metricValue: Math.abs(g.dr - g.cr) }
                          )}
                          className="hover:bg-indigo-500/10 cursor-pointer transition group"
                        >
                          <td className="p-3 font-mono font-bold text-slate-400">{idx + 1}</td>
                          <td className="p-3 font-bold text-slate-100 flex items-center gap-2 group-hover:text-indigo-300">
                            <span>{g.groupName}</span>
                            <span className="text-[10px] text-slate-500 font-normal">({g.count} accounts)</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400" />
                          </td>
                          <td className="p-3 text-slate-400">{g.category}</td>
                          {tbShowOpening && (
                            <>
                              <td className="p-3 text-right font-mono text-slate-300 border-l border-slate-800/70">
                                {g.openingDr > 0.001 ? formatCurrency(g.openingDr, currency) : '-'}
                              </td>
                              <td className="p-3 text-right font-mono text-slate-300">
                                {g.openingCr > 0.001 ? formatCurrency(g.openingCr, currency) : '-'}
                              </td>
                            </>
                          )}
                          {tbShowTransactions && (
                            <>
                              <td className="p-3 text-right font-mono text-amber-300 border-l border-slate-800/70">
                                {g.txDebit > 0.001 ? formatCurrency(g.txDebit, currency) : '-'}
                              </td>
                              <td className="p-3 text-right font-mono text-sky-300">
                                {g.txCredit > 0.001 ? formatCurrency(g.txCredit, currency) : '-'}
                              </td>
                            </>
                          )}
                          {showClosingCol && (
                            <>
                              <td className="p-3 text-right font-mono text-emerald-400 font-bold border-l border-slate-800/70">
                                {g.dr > 0.001 ? formatCurrency(g.dr, currency) : '-'}
                              </td>
                              <td className="p-3 text-right font-mono text-indigo-400 font-bold">
                                {g.cr > 0.001 ? formatCurrency(g.cr, currency) : '-'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })
                  ) : (
                    tbAccountEntries.map(({ account, openingDr, openingCr, txDebit, txCredit, closingDr, closingCr }) => (
                      <tr
                        key={account.id}
                        onClick={() => openAccountStatement(account)}
                        className="hover:bg-indigo-500/10 cursor-pointer transition group"
                      >
                        <td className="p-3 font-mono font-bold text-indigo-300">{account.code}</td>
                        <td className="p-3 font-semibold text-slate-100 group-hover:text-indigo-300 flex items-center gap-1.5">
                          <span>{account.name}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-400" />
                        </td>
                        <td className="p-3 text-slate-400">{account.category} ({account.subCategory})</td>
                        {tbShowOpening && (
                          <>
                            <td className="p-3 text-right font-mono text-slate-300 border-l border-slate-800/70">
                              {openingDr > 0.001 ? formatCurrency(openingDr, currency) : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">
                              {openingCr > 0.001 ? formatCurrency(openingCr, currency) : '-'}
                            </td>
                          </>
                        )}
                        {tbShowTransactions && (
                          <>
                            <td className="p-3 text-right font-mono text-amber-300 border-l border-slate-800/70">
                              {txDebit > 0.001 ? formatCurrency(txDebit, currency) : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-sky-300">
                              {txCredit > 0.001 ? formatCurrency(txCredit, currency) : '-'}
                            </td>
                          </>
                        )}
                        {showClosingCol && (
                          <>
                            <td className="p-3 text-right font-mono text-emerald-400 font-bold border-l border-slate-800/70">
                              {closingDr > 0.001 ? formatCurrency(closingDr, currency) : '-'}
                            </td>
                            <td className="p-3 text-right font-mono text-indigo-400 font-bold">
                              {closingCr > 0.001 ? formatCurrency(closingCr, currency) : '-'}
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-slate-800 font-bold text-xs text-white border-t-2 border-slate-700">
                  <tr>
                    <td colSpan={3} className="p-3 text-right uppercase">Total Trial Balance:</td>
                    {tbShowOpening && (
                      <>
                        <td className="p-3 text-right font-mono text-slate-200 border-l border-slate-700">
                          {formatCurrency(tbColumnTotals.openingDr, currency)}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-200">
                          {formatCurrency(tbColumnTotals.openingCr, currency)}
                        </td>
                      </>
                    )}
                    {tbShowTransactions && (
                      <>
                        <td className="p-3 text-right font-mono text-amber-300 border-l border-slate-700">
                          {formatCurrency(tbColumnTotals.txDebit, currency)}
                        </td>
                        <td className="p-3 text-right font-mono text-sky-300">
                          {formatCurrency(tbColumnTotals.txCredit, currency)}
                        </td>
                      </>
                    )}
                    {showClosingCol && (
                      <>
                        <td className="p-3 text-right font-mono text-emerald-400 text-sm font-extrabold border-l border-slate-700">
                          {formatCurrency(totalTbDebit, currency)}
                        </td>
                        <td className="p-3 text-right font-mono text-indigo-400 text-sm font-extrabold">
                          {formatCurrency(totalTbCredit, currency)}
                        </td>
                      </>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="shrink-0 bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between text-sm">
            <div className={`flex items-center gap-2 font-bold ${Math.abs(totalTbDebit - totalTbCredit) < 0.001 ? 'text-emerald-400' : 'text-amber-300'}`}>
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {Math.abs(totalTbDebit - totalTbCredit) < 0.001
                  ? (isHindi ? 'ट्रायल बैलेंस टली स्थिति: डेबिट = क्रेडिट बराबर है' : 'Trial Balance Status: Debit Equals Credit')
                  : (isHindi ? 'ट्रायल बैलेंस में अंतर मिला (Opening Balance जाँचें)' : 'Trial Balance Difference Detected (Review Opening Balances)')}
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-300">
              Difference: <strong className={Math.abs(totalTbDebit - totalTbCredit) < 0.001 ? 'text-emerald-400' : 'text-amber-300'}>
                {formatCurrency(Math.abs(totalTbDebit - totalTbCredit), currency)}
              </strong>
            </div>
          </div>
        </div>
        );
      })()}

      {/* REPORT 4: SCHEDULE III / SCHEDULE IV DISCLOSURES */}
      {activeReport === 'SCH34' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base md:text-lg font-black text-white">{data.company.name}</h2>
              <h3 className="text-xs md:text-sm font-bold text-amber-400 uppercase tracking-wider mt-0.5 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-400" />
                <span>Schedule III / Schedule IV Disclosures (Income Tax Return & Companies Act)</span>
              </h3>
              <p className="text-xs text-slate-400">ITR Disclosures & Statutory Financial Statement Classification</p>
            </div>

            {perms.canExportData && (
              <button
                onClick={() => {
                  const rows = [
                    ['Schedule Section', 'Account Code', 'Account Particulars', 'ITR Category', 'Debit (INR)', 'Credit (INR)'],
                    ...allMergedAccounts.map(acc => {
                      const bal = balancesMap.get(acc.id);
                      const isDr = bal?.balanceType === 'DR';
                      const amt = bal?.netBalance || 0;
                      return [
                        acc.category,
                        acc.code,
                        acc.name,
                        acc.subCategory || acc.category,
                        isDr ? amt : 0,
                        !isDr ? amt : 0
                      ];
                    }),
                    ['TOTAL', '', '', '', totalTbDebit, totalTbCredit]
                  ];
                  const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
                  const encodedUri = encodeURI(csvContent);
                  const link = document.createElement("a");
                  link.setAttribute("href", encodedUri);
                  link.setAttribute("download", `Schedule_III_IV_Trial_Balance_${data.company.name.replace(/\s+/g, '_')}.csv`);
                  document.body.appendChild(link);
                  link.click();
                  link.remove();
                }}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl shadow transition"
              >
                <FileSpreadsheet className="w-4 h-4 text-slate-950" />
                <span>Export Schedule III/IV CSV</span>
              </button>
            )}
          </div>

          <div className="space-y-6 text-sm tabular-nums">
            {/* PART 1: EQUITY AND LIABILITIES */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-extrabold text-indigo-300 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
                <span>I. EQUITY AND LIABILITIES (समता एवं दायित्व)</span>
                <span className="text-[10px] text-slate-400 font-normal">Companies Act Schedule III Heading</span>
              </h4>

              <div className="space-y-2">
                <div className="font-bold text-amber-400 text-[11px] uppercase pt-1">1. Shareholders' Funds & Capital Accounts</div>
                {equityAccounts.map(acc => {
                  const bal = balancesMap.get(acc.id);
                  const amt = getSignedLedgerAmount(bal, acc.category);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => openAccountStatement(acc)}
                      className="flex justify-between items-center py-1 border-b border-slate-900 px-2 text-slate-300 hover:bg-indigo-500/10 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>[{acc.code}] {acc.name} ({acc.subCategory})</span>
                        <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-indigo-400" />
                      </span>
                      <span className="font-mono text-indigo-300 font-bold">
                        {formatCurrency(Math.abs(amt), currency)} {bal?.balanceType || 'CR'}
                      </span>
                    </div>
                  );
                })}

                <div className="font-bold text-amber-400 text-[11px] uppercase pt-2">2. Liabilities & Trade Payables</div>
                {liabilityAccounts.map(acc => {
                  const bal = balancesMap.get(acc.id);
                  const amt = getSignedLedgerAmount(bal, acc.category);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => openAccountStatement(acc)}
                      className="flex justify-between items-center py-1 border-b border-slate-900 px-2 text-slate-300 hover:bg-rose-500/10 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>[{acc.code}] {acc.name} ({acc.subCategory})</span>
                        <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-rose-400" />
                      </span>
                      <span className="font-mono text-rose-300 font-bold">
                        {formatCurrency(Math.abs(amt), currency)} {bal?.balanceType || 'CR'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* PART 2: ASSETS */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <h4 className="text-xs font-extrabold text-emerald-300 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
                <span>II. ASSETS (परिसंपत्तियां)</span>
                <span className="text-[10px] text-slate-400 font-normal">Schedule III Current & Non-Current Assets</span>
              </h4>

              <div className="space-y-2">
                <div className="font-bold text-emerald-400 text-[11px] uppercase pt-1">1. Non-Current Assets & Fixed Assets</div>
                {fixedAssetAccounts.map(acc => {
                  const bal = balancesMap.get(acc.id);
                  const amt = getSignedLedgerAmount(bal, acc.category);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => openAccountStatement(acc)}
                      className="flex justify-between items-center py-1 border-b border-slate-900 px-2 text-slate-300 hover:bg-emerald-500/10 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>[{acc.code}] {acc.name} ({acc.subCategory || acc.category})</span>
                        <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                      </span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {formatCurrency(Math.abs(amt), currency)} {bal?.balanceType || 'DR'}
                      </span>
                    </div>
                  );
                })}

                <div className="font-bold text-emerald-400 text-[11px] uppercase pt-2">2. Current Assets (Inventories, Receivables, Cash & Bank)</div>
                <div
                  onClick={() => setDetailModalPayload({
                    kind: 'STOCK_VALUATION',
                    stockType: 'CLOSING',
                    title: isHindi ? 'अंतिम स्टॉक मूल्यांकन विवरण (Closing Stock Breakdown)' : 'Closing Stock Valuation Breakdown',
                    subtitle: statementPeriodLabel
                  })}
                  className="flex justify-between items-center py-1 border-b border-slate-900 px-2 text-emerald-300 font-bold hover:bg-emerald-500/10 rounded cursor-pointer transition group"
                >
                  <span className="flex items-center gap-1">
                    <span>Closing Inventories / Stock-in-Hand (अंतिम स्टॉक)</span>
                    <ChevronRight className="w-3.5 h-3.5 text-emerald-400/70" />
                  </span>
                  <span className="font-mono">{formatCurrency(closingStock, currency)} DR</span>
                </div>
                {otherAssetAccounts.map(acc => {
                  const bal = balancesMap.get(acc.id);
                  const amt = getSignedLedgerAmount(bal, acc.category);
                  return (
                    <div
                      key={acc.id}
                      onClick={() => openAccountStatement(acc)}
                      className="flex justify-between items-center py-1 border-b border-slate-900 px-2 text-slate-300 hover:bg-emerald-500/10 rounded cursor-pointer transition group"
                    >
                      <span className="flex items-center gap-1">
                        <span>[{acc.code}] {acc.name} ({acc.subCategory || acc.category})</span>
                        <ChevronRight className="w-3 h-3 text-slate-500 group-hover:text-emerald-400" />
                      </span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {formatCurrency(Math.abs(amt), currency)} {bal?.balanceType || 'DR'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      </div>

      {/* FINANCIAL STATEMENT PRINT & EXPORT MODAL */}
      {showPrintModal && (
        <FinancialPrintModal
          data={data}
          isHindi={isHindi}
          activeReport={activeReport}
          initialViewMode={viewMode}
          periodLabel={statementPeriodLabel}
          tbOptions={{
            showOpening: tbShowOpening,
            showTransactions: tbShowTransactions,
            showClosing: tbShowClosing
          }}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* INTERACTIVE DETAIL DRILLDOWN MODAL (4-Layer Multi-Level + Edit) */}
      {detailModalPayload && (
        <FinancialDetailModal
          data={data}
          isHindi={isHindi}
          payload={detailModalPayload}
          reportTitle={activeReportTitle}
          isEditModalOpen={isEditModalOpen}
          onClose={() => setDetailModalPayload(null)}
          onInspectAccountOrParty={(id, name, preferredKind) => setDrillAccountTarget({ id, name, preferredKind })}
          onEditInvoice={onEditInvoice}
          onEditPurchaseBill={onEditPurchaseBill}
          onEditVoucher={onEditVoucher}
        />
      )}

      {/* INDIVIDUAL ACCOUNT / PARTY LEDGER STATEMENT MODAL */}
      {drillAccountTarget && (
        <LedgerDrilldownModal
          data={data}
          isHindi={isHindi}
          partyOrAccountId={drillAccountTarget.id}
          targetName={drillAccountTarget.name}
          preferredKind={drillAccountTarget.preferredKind}
          reportTitle={activeReportTitle}
          isEditModalOpen={isEditModalOpen}
          onClose={() => setDrillAccountTarget(null)}
          onEditInvoice={onEditInvoice}
          onEditPurchaseBill={onEditPurchaseBill}
          onEditVoucher={onEditVoucher}
        />
      )}
    </div>
  );
};
