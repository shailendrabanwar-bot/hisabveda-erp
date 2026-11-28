import React, { useState, useMemo } from 'react';
import { 
  Landmark, 
  CheckCircle2, 
  Plus, 
  RefreshCw, 
  FileCheck2, 
  AlertCircle, 
  Upload, 
  ArrowRight, 
  Sparkles,
  Search,
  Check,
  UploadCloud,
  FileSpreadsheet,
  Zap,
  Filter,
  ChevronDown,
  Info,
  CheckCheck,
  ListFilter,
  Trash2,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Printer,
  FileText,
  HelpCircle,
  Clock,
  ShieldCheck,
  Layers,
  Download,
  Sliders,
  Loader2
} from 'lucide-react';
import { AppData, Account, BankStatementLine, Voucher, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getFinancialSummary, isBankAccount, isCashLedger, isCashOrBankLedger, isDateLockedByBooksLock } from '../../utils/accounting';
import { getFinancialYearRange, isDateInFinancialYear, isStrictBankLedger } from '../../utils/fiscalYear';
import { BankStatementImportUtility } from './BankStatementImportUtility';
import { AppConfiguration, loadAppConfig } from '../../utils/appConfig';
import { printDomElement } from '../../utils/printReport';
import { exportElementToPdf } from '../../utils/pdfExport';
import { PrintConfigPanel, getPaperPaddingClass, getPaperWidthClass } from '../Common/PrintConfigPanel';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import { BankPeriodGranularity, buildBankPeriodicSummary, getBankPeriodInfo } from '../../utils/bankPeriod';

interface BankReconciliationProps {
  data: AppData;
  isHindi: boolean;
  onReconcileMatch: (statementId: string, matchedType: 'INVOICE' | 'VOUCHER', matchedId: string) => void;
  onAddStatementLine: (line: BankStatementLine) => void;
  onBatchAddStatementLines?: (lines: BankStatementLine[]) => void;
  onPostBankVouchersBatch?: (lines: BankStatementLine[], bankAccountId: string) => void;
  onCreateBankLedgerQuick?: (bankName: string, accountNumber?: string) => void;
  onUpdateAccount?: (account: Account) => void;
  onQuickCreateBankChargeVoucher: (voucher: Voucher) => void;
  onDeleteStatementLine?: (statementId: string) => void;
  onClearAllBankStatements?: () => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export interface VoucherMatchSuggestion {
  voucher: Voucher;
  score: number; // 0 to 100
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  reasons: string[];
  daysDiff: number;
  amountDiff: number;
}

// Auto-Matching Algorithm: Computes match scores based on date proximity, amount similarity, reference numbers, and direction
export function computeVoucherMatches(
  statementLine: BankStatementLine,
  vouchers: Voucher[],
  selectedBankId?: string
): VoucherMatchSuggestion[] {
  const lineDate = new Date(statementLine.date).getTime();
  if (isNaN(lineDate)) return [];

  const suggestions: VoucherMatchSuggestion[] = [];

  for (const v of vouchers) {
    if (v.isReconciled) continue; // Skip already reconciled vouchers

    let score = 0;
    const reasons: string[] = [];

    // 0. Direction & Transaction Type Compatibility
    const isStmtDebit = statementLine.type === 'DEBIT'; // Money out of bank
    const bankEntry = selectedBankId ? v.entries.find(e => e.accountId === selectedBankId) : undefined;
    
    if (bankEntry) {
      if (isStmtDebit && bankEntry.debit > 0 && bankEntry.credit === 0) {
        // Bank is debited in book = money coming in, but statement shows money out -> Incompatible
        continue;
      }
      if (!isStmtDebit && bankEntry.credit > 0 && bankEntry.debit === 0) {
        // Bank is credited in book = money going out, but statement shows money in -> Incompatible
        continue;
      }
      // Give direction bonus if properly aligned
      if ((isStmtDebit && bankEntry.credit > 0) || (!isStmtDebit && bankEntry.debit > 0)) {
        score += 20;
        reasons.push(isStmtDebit ? 'Aligned Payment/Outflow' : 'Aligned Deposit/Inflow');
      }
    } else {
      if (isStmtDebit && v.type === 'RECEIPT') continue;
      if (!isStmtDebit && v.type === 'PAYMENT') continue;
      if ((isStmtDebit && v.type === 'PAYMENT') || (!isStmtDebit && v.type === 'RECEIPT')) {
        score += 15;
      }
    }

    // 1. Reference / UTR Number Match
    const stmtRef = (statementLine.referenceNo || '').trim().toLowerCase();
    const vchRef = (v.referenceNo || '').trim().toLowerCase();
    const vchBankRef = (v.bankReferenceNo || '').trim().toLowerCase();
    const vchNum = (v.voucherNumber || '').trim().toLowerCase();

    if (stmtRef && stmtRef.length >= 3) {
      if (vchRef && (vchRef.includes(stmtRef) || stmtRef.includes(vchRef))) {
        score += 45;
        reasons.push('Exact Reference / UTR Match');
      } else if (vchBankRef && (vchBankRef.includes(stmtRef) || stmtRef.includes(vchBankRef))) {
        score += 40;
        reasons.push('Bank Reference Match');
      } else if (vchNum && vchNum.includes(stmtRef)) {
        score += 35;
        reasons.push('Voucher No Match');
      }
    }

    // 2. Amount Match
    const amountDiff = Math.abs(v.totalAmount - statementLine.amount);
    if (amountDiff < 0.01) {
      score += 45;
      reasons.push('Exact Amount Match');
    } else if (amountDiff <= 5) {
      score += 25;
      reasons.push(`Minor Difference (₹${amountDiff.toFixed(2)})`);
    }

    // 3. Date Proximity
    const vchDate = new Date(v.date).getTime();
    const daysDiff = Math.round(Math.abs(lineDate - vchDate) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      score += 25;
      reasons.push('Same Date');
    } else if (daysDiff <= 3) {
      score += 20;
      reasons.push(`Within 3 days (${daysDiff}d)`);
    } else if (daysDiff <= 7) {
      score += 10;
      reasons.push(`Within 7 days`);
    }

    // 4. Party / Narration Match
    const narration = (statementLine.description || '').toLowerCase();
    const vchNarration = (v.narration || '').toLowerCase();
    const partyName = (v.partyName || '').toLowerCase();

    if (partyName && narration.includes(partyName)) {
      score += 20;
      reasons.push(`Party Name '${v.partyName}' in Narration`);
    } else if (vchNarration && (narration.includes(vchNarration) || vchNarration.includes(narration))) {
      score += 15;
      reasons.push('Narration Keyword Match');
    }

    // Cap score at 100
    score = Math.min(100, Math.max(0, score));

    if (score >= 35) {
      let confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
      if (score >= 70) confidenceLabel = 'HIGH';
      else if (score >= 45) confidenceLabel = 'MEDIUM';

      suggestions.push({
        voucher: v,
        score,
        confidenceLabel,
        reasons,
        daysDiff,
        amountDiff
      });
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

export const BankReconciliation: React.FC<BankReconciliationProps> = ({
  data,
  isHindi,
  onReconcileMatch,
  onAddStatementLine,
  onBatchAddStatementLines,
  onPostBankVouchersBatch,
  onCreateBankLedgerQuick,
  onUpdateAccount,
  onQuickCreateBankChargeVoucher,
  onDeleteStatementLine,
  onClearAllBankStatements,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  // Active Tab: RECONCILE | STATEMENT | BOOKS | REPORT
  const [activeTab, setActiveTab] = useState<'RECONCILE' | 'STATEMENT' | 'BOOKS' | 'REPORT'>('RECONCILE');
  
  // Active Financial Year info
  const fyRange = getFinancialYearRange(data.company.financialYearStart);

  // Strict Bank Accounts list (excludes Cash in Hand / Petty Cash)
  const bankAccounts = useMemo(() => {
    return data.accounts.filter(isStrictBankLedger);
  }, [data.accounts]);

  const [selectedBankId, setSelectedBankId] = useState<string>(
    bankAccounts[0]?.id || ''
  );

  const selectedBank = useMemo(() => {
    return bankAccounts.find(a => a.id === selectedBankId) || bankAccounts[0];
  }, [bankAccounts, selectedBankId]);

  const [quickBankName, setQuickBankName] = useState(data.company.bankName || '');
  const [quickBankAccNo, setQuickBankAccNo] = useState(data.company.accountNumber || '');
  const [brsAlert, setBrsAlert] = useState<string | null>(null);

  // Import Modal
  const [showImportModal, setShowImportModal] = useState(false);

  // Print Config & PDF State for BRS Official Report
  const [brsPrintConfig, setBrsPrintConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [showBrsPrintConfig, setShowBrsPrintConfig] = useState(false);
  const [isDownloadingBrsPdf, setIsDownloadingBrsPdf] = useState(false);

  // Manual Match Modal
  const [matchingStatementLine, setMatchingStatementLine] = useState<BankStatementLine | null>(null);

  // Quick Missing Voucher Modal
  const [quickVoucherLine, setQuickVoucherLine] = useState<BankStatementLine | null>(null);
  const [quickVoucherType, setQuickVoucherType] = useState<'PAYMENT' | 'RECEIPT' | 'BANK_CHARGES' | 'INTEREST'>('PAYMENT');
  const [quickTargetAccountId, setQuickTargetAccountId] = useState<string>('');

  // Filters & Search
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UNRECONCILED' | 'RECONCILED'>('UNRECONCILED');
  const [periodGranularity, setPeriodGranularity] = useState<BankPeriodGranularity>('ALL');
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string>('');
  const [showPeriodBreakdown, setShowPeriodBreakdown] = useState<boolean>(true);

  // Vouchers relating to selected bank
  const bankBookVouchers = useMemo(() => {
    if (!selectedBank) return [];
    return data.vouchers.filter(v => {
      // Check if any entry belongs to selected bank account
      return v.entries.some(e => e.accountId === selectedBank.id);
    });
  }, [data.vouchers, selectedBank]);

  // Statement lines
  const statementLines = useMemo(() => {
    return data.bankStatements || [];
  }, [data.bankStatements]);

  // Daily / Weekly / Monthly / Quarterly period summary buckets
  const periodicBuckets = useMemo(() => {
    return buildBankPeriodicSummary(statementLines, bankBookVouchers, selectedBank?.id, periodGranularity);
  }, [statementLines, bankBookVouchers, selectedBank?.id, periodGranularity]);

  const activePeriodBucket = useMemo(() => {
    if (periodGranularity === 'ALL' || !selectedPeriodKey) return null;
    return periodicBuckets.find(b => b.key === selectedPeriodKey) || null;
  }, [periodGranularity, selectedPeriodKey, periodicBuckets]);

  const periodScopedStatementLines = useMemo(() => {
    if (periodGranularity === 'ALL' || !selectedPeriodKey) return statementLines;
    return statementLines.filter(line => getBankPeriodInfo(line.date, periodGranularity)?.key === selectedPeriodKey);
  }, [statementLines, periodGranularity, selectedPeriodKey]);

  const periodScopedBankVouchers = useMemo(() => {
    if (periodGranularity === 'ALL' || !selectedPeriodKey) return bankBookVouchers;
    return bankBookVouchers.filter(v => getBankPeriodInfo(v.date, periodGranularity)?.key === selectedPeriodKey);
  }, [bankBookVouchers, periodGranularity, selectedPeriodKey]);

  const handleExportBankPeriodCsv = () => {
    if (periodicBuckets.length === 0) return;
    const headers = [
      'Period',
      'From Date',
      'To Date',
      'Statement Deposits (Cr)',
      'Statement Withdrawals (Dr)',
      'Statement Net Flow',
      'Statement Txns',
      'Matched Txns',
      'Pending Txns',
      'Books Receipts (In)',
      'Books Payments (Out)',
      'Books Voucher Count'
    ];
    const rows = periodicBuckets.map(b => [
      b.label,
      b.fromDate,
      b.toDate,
      b.stmtCredit.toFixed(2),
      b.stmtDebit.toFixed(2),
      b.stmtNetFlow.toFixed(2),
      String(b.stmtCount),
      String(b.stmtReconciledCount),
      String(b.stmtPendingCount),
      b.bookReceipts.toFixed(2),
      b.bookPayments.toFixed(2),
      String(b.bookCount)
    ]);
    const csvContent = '\uFEFF' + [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bank_${(selectedBank?.name || 'Account').replace(/\s+/g, '_')}_${periodGranularity}_Summary.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  // Filtered statement lines
  const visibleStatementLines = useMemo(() => {
    return periodScopedStatementLines.filter(line => {
      const isReconciled = !!(line.reconciled || line.isReconciled);
      if (statusFilter === 'UNRECONCILED' && isReconciled) return false;
      if (statusFilter === 'RECONCILED' && !isReconciled) return false;

      const q = searchFilter.toLowerCase().trim();
      if (q) {
        const matchDesc = line.description.toLowerCase().includes(q);
        const matchRef = (line.referenceNo || '').toLowerCase().includes(q);
        const matchAmt = line.amount.toString().includes(q);
        const matchDate = line.date.includes(q);
        return matchDesc || matchRef || matchAmt || matchDate;
      }
      return true;
    });
  }, [periodScopedStatementLines, statusFilter, searchFilter]);

  // Financial Balances (Book Balance vs Statement Balance)
  const balances = useMemo(() => {
    // 1. Bank Balance as per Company Books
    let bookBalance = 0;
    if (selectedBank) {
      // Opening Balance
      const opBal = selectedBank.openingBalance || 0;
      const isDr = selectedBank.balanceType === 'DR' || selectedBank.category === 'ASSET';
      bookBalance = isDr ? opBal : -opBal;

      // Sum all voucher entries for this bank
      data.vouchers.forEach(v => {
        v.entries.forEach(e => {
          if (e.accountId === selectedBank.id) {
            bookBalance += (e.debit || 0) - (e.credit || 0);
          }
        });
      });
    }

    // 2. Unreconciled Statement Items
    const unreconciledDebits = statementLines
      .filter(l => !(l.reconciled || l.isReconciled) && l.type === 'DEBIT')
      .reduce((sum, l) => sum + l.amount, 0);

    const unreconciledCredits = statementLines
      .filter(l => !(l.reconciled || l.isReconciled) && l.type === 'CREDIT')
      .reduce((sum, l) => sum + l.amount, 0);

    // 3. Unreconciled Book Vouchers
    const unreconciledBookPayments = bankBookVouchers
      .filter(v => !v.isReconciled && v.type === 'PAYMENT')
      .reduce((sum, v) => sum + v.totalAmount, 0);

    const unreconciledBookReceipts = bankBookVouchers
      .filter(v => !v.isReconciled && v.type === 'RECEIPT')
      .reduce((sum, v) => sum + v.totalAmount, 0);

    // 4. Statement Closing Balance
    let statementClosingBalance = bookBalance + unreconciledBookPayments - unreconciledBookReceipts + unreconciledCredits - unreconciledDebits;
    const linesWithBalance = statementLines.filter(l => l.runningBalance !== undefined && l.runningBalance !== null && !isNaN(Number(l.runningBalance)));
    
    if (linesWithBalance.length > 0) {
      // Find the transaction with the latest date
      const sortedByDate = [...linesWithBalance].sort((a, b) => {
        const timeA = new Date(a.date).getTime() || 0;
        const timeB = new Date(b.date).getTime() || 0;
        return timeB - timeA; // latest date first
      });
      statementClosingBalance = Number(sortedByDate[0].runningBalance);
    }

    // 5. Reconciled Balance & Variance
    const reconciledBookBalance = bookBalance + unreconciledBookPayments - unreconciledBookReceipts + unreconciledCredits - unreconciledDebits;
    const difference = Math.abs(reconciledBookBalance - statementClosingBalance);
    const isFullyReconciled = difference < 0.05 && statementLines.filter(l => !(l.reconciled || l.isReconciled)).length === 0;

    return {
      bookBalance: Math.round(bookBalance * 100) / 100,
      statementClosingBalance: Math.round(statementClosingBalance * 100) / 100,
      unreconciledDebits: Math.round(unreconciledDebits * 100) / 100,
      unreconciledCredits: Math.round(unreconciledCredits * 100) / 100,
      unreconciledBookPayments: Math.round(unreconciledBookPayments * 100) / 100,
      unreconciledBookReceipts: Math.round(unreconciledBookReceipts * 100) / 100,
      difference: Math.round(difference * 100) / 100,
      isFullyReconciled
    };
  }, [selectedBank, data.vouchers, statementLines, bankBookVouchers]);

  // 1-Click Auto Match Handler
  const handleRunAutoMatch = () => {
    let matchCount = 0;
    const unreconciledStatements = statementLines.filter(l => !(l.reconciled || l.isReconciled));
    const unreconciledVouchers = bankBookVouchers.filter(v => !v.isReconciled);

    const matchedVoucherIds = new Set<string>();

    unreconciledStatements.forEach(line => {
      const availableVouchers = unreconciledVouchers.filter(v => !matchedVoucherIds.has(v.id));
      const suggestions = computeVoucherMatches(line, availableVouchers, selectedBankId);
      
      // Auto-match high-confidence suggestions (score >= 70)
      if (suggestions.length > 0 && suggestions[0].score >= 70) {
        const topMatch = suggestions[0].voucher;
        matchedVoucherIds.add(topMatch.id);
        onReconcileMatch(line.id, 'VOUCHER', topMatch.id);
        matchCount++;
      }
    });
  };

  // Quick Missing Voucher Creation Execution
  const handleExecuteCreateQuickVoucher = () => {
    if (!quickVoucherLine || !selectedBank) return;

    const timestamp = Date.now();
    const dateStr = quickVoucherLine.date || new Date().toISOString().split('T')[0];
    const amt = Math.round((Number(quickVoucherLine.amount) || 0) * 100) / 100;
    const appConfig = loadAppConfig();

    if (!isDateInFinancialYear(dateStr, fyRange.fyStart)) {
      setBrsAlert(
        isHindi
          ? `अमान्य तिथि (${dateStr}): स्टेटमेंट प्रविष्टि सक्रिय वित्तीय वर्ष ${fyRange.label} से बाहर है।`
          : `Out-of-FY Date (${dateStr}): Statement line must fall within active ${fyRange.label}.`
      );
      return;
    }
    if (isDateLockedByBooksLock(dateStr, appConfig.booksLockDate)) {
      setBrsAlert(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${appConfig.booksLockDate} या उससे पहले की तिथि में वाउचर दर्ज नहीं किया जा सकता।`
          : `Books Locked: Transactions on or before ${appConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }

    const leafAccounts = data.accounts.filter(a => !a.isGroup && a.id !== selectedBank.id);
    const nonMoneyAccounts = leafAccounts.filter(a => !isCashOrBankLedger(a));

    let targetAcc = leafAccounts.find(a => a.id === quickTargetAccountId);
    if (!targetAcc) {
      if (quickVoucherType === 'BANK_CHARGES') {
        targetAcc =
          nonMoneyAccounts.find(a => a.category === 'EXPENSE' && (a.name.toLowerCase().includes('bank charge') || a.name.toLowerCase().includes('charges'))) ||
          nonMoneyAccounts.find(a => a.category === 'EXPENSE');
      } else if (quickVoucherType === 'INTEREST') {
        targetAcc =
          nonMoneyAccounts.find(a => a.category === 'REVENUE' && (a.name.toLowerCase().includes('interest') || a.name.toLowerCase().includes('income'))) ||
          nonMoneyAccounts.find(a => a.category === 'REVENUE');
      } else {
        targetAcc =
          nonMoneyAccounts.find(a => a.id === 'acc_suspense' || a.name.toLowerCase().includes('suspense')) ||
          nonMoneyAccounts[0];
      }
    }

    if (!targetAcc) {
      setBrsAlert(
        isHindi
          ? 'कृपया काउंटर लेजर खाता चुनें — वैध लेजर उपलब्ध नहीं है।'
          : 'Please select a valid counter ledger account.'
      );
      return;
    }

    const isDebit = quickVoucherLine.type === 'DEBIT';
    const isContraTarget = isCashOrBankLedger(targetAcc);
    const voucherType = isContraTarget ? 'CONTRA' : (isDebit ? 'PAYMENT' : 'RECEIPT');
    const vchNo = (isContraTarget ? 'CNT-' : isDebit ? 'PAY-' : 'REC-') + Math.floor(100000 + Math.random() * 900000);

    const newVoucher: Voucher = {
      id: `vch_quick_brs_${timestamp}`,
      voucherNumber: vchNo,
      date: dateStr,
      type: voucherType,
      paymentMode: isContraTarget && isCashLedger(targetAcc) ? 'CASH' : 'BANK_TRANSFER',
      bankAccountId: selectedBank.id,
      entries: [
        {
          id: `ent_1_${timestamp}`,
          accountId: isDebit ? targetAcc.id : selectedBank.id,
          accountCode: isDebit ? targetAcc.code : selectedBank.code,
          accountName: isDebit ? targetAcc.name : selectedBank.name,
          debit: amt,
          credit: 0
        },
        {
          id: `ent_2_${timestamp}`,
          accountId: isDebit ? selectedBank.id : targetAcc.id,
          accountCode: isDebit ? selectedBank.code : targetAcc.code,
          accountName: isDebit ? selectedBank.name : targetAcc.name,
          debit: 0,
          credit: amt
        }
      ],
      totalAmount: amt,
      narration: `BRS Direct Entry: ${quickVoucherLine.description} (Ref: ${quickVoucherLine.referenceNo || 'N/A'})`,
      bankReferenceNo: quickVoucherLine.referenceNo || '',
      isReconciled: true,
      reconciledDate: dateStr,
      createdBy: 'Bank Reconciliation Utility'
    };

    onQuickCreateBankChargeVoucher(newVoucher);
    onReconcileMatch(quickVoucherLine.id, 'VOUCHER', newVoucher.id);
    setQuickVoucherLine(null);
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">
      
      {/* Top Header & Actions Bar */}
      <div className="hv-surface border border-[var(--border-primary)] p-4 md:p-6 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-indigo-600 flex items-center justify-center text-white hv-keep-white shadow-lg shadow-emerald-500/20 shrink-0">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[var(--text-primary)] flex flex-wrap items-center gap-2">
              <span>{isHindi ? 'बैंक समाधान विवरण (Bank Reconciliation - BRS)' : 'Bank Reconciliation Statement (BRS)'}</span>
              {balances.isFullyReconciled ? (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full hv-pill-emerald border flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {isHindi ? '100% समाधान पूर्ण' : '100% Reconciled'}
                </span>
              ) : (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full hv-pill-amber border flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {statementLines.filter(l => !(l.reconciled || l.isReconciled)).length} {isHindi ? 'लंबित प्रविष्टियां' : 'Pending'}
                </span>
              )}
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-1 flex flex-wrap items-center gap-2">
              <span>
                {isHindi 
                  ? 'लेजर खाता, पासबुक/स्टेटमेंट और बैंक वाउचर्स का ऑटो-मिलान एवं अंतर विश्लेषण।' 
                  : 'Compare bank statement with company ledgers, auto-match entries, and eliminate book-bank variance.'}
              </span>
              <span className="text-[11px] font-mono hv-pill-indigo border px-2 py-0.5 rounded-lg font-bold">
                {fyRange.label} ({fyRange.displayRange})
              </span>
            </p>
          </div>
        </div>

        {/* Bank Account Selector & Import Button */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {bankAccounts.length > 0 ? (
            <select
              value={selectedBank?.id || ''}
              onChange={(e) => {
                setSelectedBankId(e.target.value);
                setBrsAlert(null);
              }}
              className="hv-input border border-[var(--border-subtle)] text-xs font-bold rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-emerald-500 focus:outline-none min-w-[200px] flex-1 sm:flex-initial"
            >
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}) {b.accountNumber ? `- A/c ****${b.accountNumber.slice(-4)}` : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="hv-pill-rose border text-xs font-bold px-3 py-2 rounded-xl">
              {isHindi ? '⚠️ कोई बैंक लेजर नहीं बना है' : '⚠️ No Bank Ledger Found'}
            </span>
          )}

          {perms.canReconcileBank && (
            <>
              <button
                onClick={handleRunAutoMatch}
                disabled={!selectedBank || statementLines.filter(l => !(l.reconciled || l.isReconciled)).length === 0}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white hv-keep-white font-bold px-3.5 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20 shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isHindi ? 'ऑटो-मैच (1-Click)' : 'Auto Match'}</span>
              </button>

              <button
                onClick={() => {
                  if (bankAccounts.length === 0) {
                    setBrsAlert(
                      isHindi
                        ? 'बैंक स्टेटमेंट अपलोड करने से पहले कृपया अपनी कंपनी का बैंक खाता लेजर (Bank Ledger) नीचे जोड़ें। बिना बैंक लेजर के कोई स्टेटमेंट अपलोड नहीं होगा।'
                        : 'Please create your company Bank Account Ledger below before importing a bank statement.'
                    );
                    return;
                  }
                  setBrsAlert(null);
                  setShowImportModal(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-extrabold px-4 py-2.5 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/30 shrink-0"
              >
                <Upload className="w-4 h-4" />
                <span>{isHindi ? '+ स्टेटमेंट इम्पोर्ट' : '+ Import Statement'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bank Ledger Missing / Validation Guard Banner */}
      {(bankAccounts.length === 0 || brsAlert) && (
        <div className="hv-pill-rose border p-4 md:p-5 rounded-2xl space-y-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold">
                {isHindi
                  ? 'कंपनी का बैंक खाता लेजर सत्यापन आवश्यक है (Bank Ledger Guard)'
                  : 'Company Bank Account Ledger Verification Required'}
              </h3>
              <p className="text-xs opacity-90">
                {brsAlert || (isHindi
                  ? 'बैंक स्टेटमेंट किसी भी अनजान व्यक्ति का अपलोड न हो, इसके लिए कंपनी के Chart of Accounts में वास्तविक बैंक खाता लेजर (और खाता संख्या) होना अनिवार्य है।'
                  : 'To prevent third-party statements from being imported, your Chart of Accounts must have a configured Company Bank Account Ledger with account number.')}
              </p>
            </div>
          </div>

          {bankAccounts.length === 0 && onCreateBankLedgerQuick && perms.canReconcileBank && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <input
                type="text"
                value={quickBankName}
                onChange={(e) => setQuickBankName(e.target.value)}
                placeholder={isHindi ? 'बैंक का नाम (उदा. HDFC Bank)' : 'Bank Name (e.g. HDFC Bank)'}
                className="hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                value={quickBankAccNo}
                onChange={(e) => setQuickBankAccNo(e.target.value)}
                placeholder={isHindi ? 'कंपनी बैंक खाता संख्या (A/c No.)' : 'Company Bank A/c Number'}
                className="hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-xs font-mono focus:outline-none focus:border-emerald-500"
              />
              <button
                type="button"
                onClick={() => {
                  if (!quickBankName.trim() || !quickBankAccNo.trim()) {
                    setBrsAlert(isHindi ? 'कृपया बैंक का नाम और खाता संख्या दोनों दर्ज करें।' : 'Please enter both Bank Name and Account Number.');
                    return;
                  }
                  onCreateBankLedgerQuick(quickBankName.trim(), quickBankAccNo.trim());
                  setBrsAlert(null);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isHindi ? '+ कंपनी बैंक लेजर बनाएं' : '+ Create Company Bank Ledger'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* EXECUTIVE BRS COMPARISON DASHBOARD (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* 1. Bank Balance As Per Company Books */}
        <div className="hv-surface border border-[var(--border-primary)] p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-[var(--text-muted)] text-xs font-bold mb-2">
              <span>{isHindi ? 'लेजर शेष (Books Balance)' : 'Balance as per Books'}</span>
              <Landmark className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl font-extrabold text-[var(--text-primary)] font-mono">
              {formatCurrency(balances.bookBalance, data.company.currency)}
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium">
            {selectedBank?.name || 'Bank Account'}
          </p>
        </div>

        {/* 2. Bank Balance As Per Statement / Passbook */}
        <div className="hv-surface border border-[var(--border-primary)] p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-[var(--text-muted)] text-xs font-bold mb-2">
              <span>{isHindi ? 'बैंक स्टेटमेंट शेष (Passbook)' : 'Balance as per Statement'}</span>
              <FileCheck2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="text-xl font-extrabold text-emerald-500 font-mono">
              {formatCurrency(balances.statementClosingBalance, data.company.currency)}
            </div>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] mt-2 font-medium">
            {statementLines.length} {isHindi ? 'स्टेटमेंट प्रविष्टियां' : 'Statement Entries'}
          </p>
        </div>

        {/* 3. Uncleared Deposits & Withdrawals */}
        <div className="hv-surface border border-[var(--border-primary)] p-4 rounded-2xl relative overflow-hidden flex flex-col justify-between h-full">
          <div>
            <div className="flex items-center justify-between text-[var(--text-muted)] text-xs font-bold mb-2">
              <span>{isHindi ? 'अलक्षित / अन-रिकन्साइल्ड अंतर' : 'Uncleared Movements'}</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-mono font-bold">
              <span className="text-emerald-500">+{formatCurrency(balances.unreconciledCredits, data.company.currency)}</span>
              <span className="text-rose-500">-{formatCurrency(balances.unreconciledDebits, data.company.currency)}</span>
            </div>
          </div>
          <p className="text-[11px] text-amber-500 mt-2 font-semibold">
            {statementLines.filter(l => !(l.reconciled || l.isReconciled)).length} {isHindi ? 'स्टेटमेंट लाइनें मिलान बाकी' : 'unmatched statement lines'}
          </p>
        </div>

        {/* 4. Variance / Difference Meter */}
        <div className={`p-4 rounded-2xl relative overflow-hidden border flex flex-col justify-between h-full ${
          balances.difference < 0.05 
            ? 'hv-pill-emerald' 
            : 'hv-pill-rose'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-2">
              <span>
                {isHindi ? 'समाधान अंतर (Difference)' : 'Reconciliation Difference'}
              </span>
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="text-xl font-extrabold font-mono">
              {formatCurrency(balances.difference, data.company.currency)}
            </div>
          </div>
          <p className="text-[11px] font-semibold mt-2 opacity-90">
            {balances.difference < 0.05 
              ? (isHindi ? '✅ शून्य अंतर - पूर्णतः संतुलित' : '✅ Zero variance - Fully balanced') 
              : (isHindi ? '⚠️ अंतर समाधान आवश्यक है' : '⚠️ Action needed to reconcile')}
          </p>
        </div>

      </div>

      {/* PERIOD GRANULARITY BAR: All | Daily | Weekly | Monthly | Quarterly */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-3.5 md:p-4 space-y-3 shadow-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <Calendar className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{isHindi ? 'बैंक अवधि विश्लेषण (Period Filter & Grouping):' : 'Bank Period Breakdown (Daily / Weekly / Monthly / Quarterly):'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'ALL', hi: 'सभी (All)', en: 'All' },
              { id: 'DAILY', hi: 'दैनिक (Daily)', en: 'Daily' },
              { id: 'WEEKLY', hi: 'साप्ताहिक (Weekly)', en: 'Weekly' },
              { id: 'MONTHLY', hi: 'मासिक (Monthly)', en: 'Monthly' },
              { id: 'QUARTERLY', hi: 'तिमाही (Quarterly)', en: 'Quarterly' }
            ] as { id: BankPeriodGranularity; hi: string; en: string }[]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setPeriodGranularity(opt.id);
                  setSelectedPeriodKey('');
                  if (opt.id !== 'ALL') setShowPeriodBreakdown(true);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  periodGranularity === opt.id
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                }`}
              >
                {isHindi ? opt.hi : opt.en}
              </button>
            ))}
          </div>
        </div>

        {periodGranularity !== 'ALL' && (
          <div className="pt-2.5 border-t border-[var(--border-primary)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedPeriodKey}
                  onChange={(e) => setSelectedPeriodKey(e.target.value)}
                  className="hv-input border border-[var(--border-subtle)] text-xs font-bold rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-400 min-w-[210px]"
                >
                  <option value="">
                    {isHindi
                      ? `-- सभी ${periodicBuckets.length} अवधियाँ दिखाएँ --`
                      : `-- All ${periodicBuckets.length} Periods --`}
                  </option>
                  {periodicBuckets.map(b => (
                    <option key={b.key} value={b.key}>
                      {b.label} ({b.stmtCount + b.bookCount} {isHindi ? 'एंट्रीज़' : 'entries'})
                    </option>
                  ))}
                </select>

                {activePeriodBucket && (
                  <button
                    type="button"
                    onClick={() => setSelectedPeriodKey('')}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hv-pill-amber border text-xs font-bold transition cursor-pointer"
                  >
                    <span>{activePeriodBucket.label}</span>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {perms.canExportData && periodicBuckets.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportBankPeriodCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hv-pill-emerald border text-xs font-bold transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'CSV एक्सपोर्ट' : 'Export CSV'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowPeriodBreakdown(prev => !prev)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-bold transition cursor-pointer"
                >
                  <span>
                    {showPeriodBreakdown
                      ? (isHindi ? 'सारांश तालिका छिपाएँ' : 'Hide Summary Table')
                      : (isHindi ? 'सारांश तालिका दिखाएँ' : 'Show Summary Table')}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPeriodBreakdown ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {showPeriodBreakdown && (
              periodicBuckets.length === 0 ? (
                <div className="p-4 text-center text-xs text-[var(--text-muted)] hv-elevated rounded-xl border border-[var(--border-primary)]">
                  {isHindi
                    ? 'इस बैंक खाते के लिए कोई स्टेटमेंट या वाउचर प्रविष्टि उपलब्ध नहीं है।'
                    : 'No statement lines or bank book vouchers found for this bank account.'}
                </div>
              ) : (
                <div className="border border-[var(--border-primary)] rounded-xl overflow-x-auto hv-surface max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs min-w-[760px]">
                    <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] uppercase text-[10px] font-bold sticky top-0 z-10 border-b border-[var(--border-primary)]">
                      <tr>
                        <th className="p-2.5">{isHindi ? 'अवधि (Period)' : 'Period'}</th>
                        <th className="p-2.5 text-right text-emerald-500">{isHindi ? 'बैंक जमा (Cr)' : 'Stmt Deposits (Cr)'}</th>
                        <th className="p-2.5 text-right text-rose-500">{isHindi ? 'बैंक निकासी (Dr)' : 'Stmt Withdrawals (Dr)'}</th>
                        <th className="p-2.5 text-right">{isHindi ? 'नेट स्टेटमेंट' : 'Net Stmt Flow'}</th>
                        <th className="p-2.5 text-right text-indigo-500">{isHindi ? 'बुक्स प्राप्ति' : 'Books Receipts'}</th>
                        <th className="p-2.5 text-right text-amber-500">{isHindi ? 'बुक्स भुगतान' : 'Books Payments'}</th>
                        <th className="p-2.5 text-center">{isHindi ? 'मिलान स्थिति' : 'Match Status'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                      {periodicBuckets.map(bucket => {
                        const isSelected = selectedPeriodKey === bucket.key;
                        return (
                          <tr
                            key={bucket.key}
                            onClick={() => setSelectedPeriodKey(isSelected ? '' : bucket.key)}
                            className={`cursor-pointer transition ${
                              isSelected ? 'hv-pill-amber' : 'hover:bg-[var(--hover-surface)]'
                            }`}
                          >
                            <td className="p-2.5">
                              <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                                <span>{bucket.label}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-amber-500" />}
                              </div>
                              <div className="text-[10px] text-[var(--text-muted)] font-mono">
                                {bucket.fromDate === bucket.toDate ? bucket.fromDate : `${bucket.fromDate} → ${bucket.toDate}`}
                              </div>
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-emerald-500">
                              +{formatCurrency(bucket.stmtCredit, data.company.currency)}
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-rose-500">
                              -{formatCurrency(bucket.stmtDebit, data.company.currency)}
                            </td>
                            <td className={`p-2.5 text-right font-mono font-extrabold ${bucket.stmtNetFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                              {formatCurrency(bucket.stmtNetFlow, data.company.currency)}
                            </td>
                            <td className="p-2.5 text-right font-mono text-indigo-500">
                              {formatCurrency(bucket.bookReceipts, data.company.currency)}
                            </td>
                            <td className="p-2.5 text-right font-mono text-amber-500">
                              {formatCurrency(bucket.bookPayments, data.company.currency)}
                            </td>
                            <td className="p-2.5 text-center font-mono text-[11px]">
                              <span className="text-emerald-500 font-bold">{bucket.stmtReconciledCount}</span>
                              <span className="text-[var(--text-muted)]"> / </span>
                              <span className="text-amber-500 font-bold">{bucket.stmtPendingCount} pending</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-[var(--border-primary)] gap-2 overflow-x-auto no-scrollbar whitespace-nowrap pb-1">
        <button
          onClick={() => setActiveTab('RECONCILE')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'RECONCILE' 
              ? 'border-emerald-500 text-emerald-500 hv-pill-emerald rounded-t-xl' 
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>{isHindi ? '1. समाधान मिलान वर्कस्पेस (Reconciliation Match)' : '1. Reconciliation Match Workspace'}</span>
          {periodScopedStatementLines.filter(l => !(l.reconciled || l.isReconciled)).length > 0 && (
            <span className="hv-pill-amber border text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {periodScopedStatementLines.filter(l => !(l.reconciled || l.isReconciled)).length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('STATEMENT')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'STATEMENT' 
              ? 'border-emerald-500 text-emerald-500 hv-pill-emerald rounded-t-xl' 
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isHindi ? '2. बैंक स्टेटमेंट रजिस्टर' : '2. Bank Statement Register'} ({periodScopedStatementLines.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('BOOKS')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'BOOKS' 
              ? 'border-emerald-500 text-emerald-500 hv-pill-emerald rounded-t-xl' 
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Landmark className="w-4 h-4" />
          <span>{isHindi ? '3. कंपनी बैंक वाउचर्स' : '3. Books Bank Vouchers'} ({periodScopedBankVouchers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('REPORT')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === 'REPORT' 
              ? 'border-emerald-500 text-emerald-500 hv-pill-emerald rounded-t-xl' 
              : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>{isHindi ? '4. आधिकारिक BRS ऑडिट रिपोर्ट' : '4. Official BRS Audit Report'}</span>
        </button>
      </div>

      {/* TAB 1: RECONCILIATION WORKSPACE (Side-by-Side Match & Create) */}
      {activeTab === 'RECONCILE' && (
        <div className="space-y-4">
          
          {/* Filter Bar */}
          <div className="hv-surface border border-[var(--border-primary)] p-3 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={isHindi ? 'विवरण, राशि या संदर्भ से खोजें...' : 'Search statement entries...'}
                  className="hv-input border border-[var(--border-subtle)] text-xs rounded-lg pl-8 pr-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="flex rounded-lg hv-elevated p-0.5 border border-[var(--border-subtle)] text-[11px] font-bold">
                <button
                  onClick={() => setStatusFilter('UNRECONCILED')}
                  className={`px-2.5 py-1 rounded transition ${statusFilter === 'UNRECONCILED' ? 'bg-amber-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {isHindi ? 'लंबित मिलान (Pending)' : 'Unreconciled'}
                </button>
                <button
                  onClick={() => setStatusFilter('RECONCILED')}
                  className={`px-2.5 py-1 rounded transition ${statusFilter === 'RECONCILED' ? 'bg-emerald-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {isHindi ? 'समाधान पूर्ण (Matched)' : 'Reconciled'}
                </button>
                <button
                  onClick={() => setStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded transition ${statusFilter === 'ALL' ? 'bg-indigo-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                >
                  {isHindi ? 'सभी' : 'All'}
                </button>
              </div>
            </div>

            {onClearAllBankStatements && perms.canDeleteRecords && statementLines.length > 0 && (
              <button
                onClick={onClearAllBankStatements}
                className="text-[var(--text-muted)] hover:text-rose-500 text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--hover-surface)] transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isHindi ? 'सभी स्टेटमेंट साफ़ करें' : 'Clear All Statement Entries'}</span>
              </button>
            )}
          </div>

          {/* Statement Lines Match Table */}
          {visibleStatementLines.length === 0 ? (
            <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-12 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl hv-pill-emerald border flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-[var(--text-primary)]">
                {isHindi ? 'कोई लंबित बैंक प्रविष्टि नहीं है!' : 'No Pending Bank Statement Lines!'}
              </h4>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto">
                {isHindi 
                  ? 'सभी प्रविष्टियाँ समाधान हो चुकी हैं या कोई नया बैंक स्टेटमेंट अपलोड नहीं किया गया है।' 
                  : 'All transactions are reconciled, or no statement has been uploaded yet.'}
              </p>
              {perms.canReconcileBank && (
                <button
                  onClick={() => setShowImportModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-bold px-4 py-2 rounded-xl transition"
                >
                  {isHindi ? '+ नया बैंक स्टेटमेंट अपलोड करें' : '+ Upload Bank Statement'}
                </button>
              )}
            </div>
          ) : (
            <div className="border border-[var(--border-primary)] rounded-2xl overflow-x-auto hv-surface shadow-xl">
              <table className="w-full text-left text-xs min-w-[880px]">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] uppercase text-[10px] font-bold border-b border-[var(--border-primary)]">
                  <tr>
                    <th className="p-3 w-28 whitespace-nowrap">{isHindi ? 'दिनांक' : 'Date'}</th>
                    <th className="p-3 min-w-[200px]">{isHindi ? 'बैंक स्टेटमेंट विवरण' : 'Bank Statement Particulars'}</th>
                    <th className="p-3 w-32 whitespace-nowrap">{isHindi ? 'संदर्भ / UTR' : 'Ref / UTR'}</th>
                    <th className="p-3 w-28 text-center whitespace-nowrap">{isHindi ? 'प्रकार' : 'Type'}</th>
                    <th className="p-3 w-32 text-right whitespace-nowrap">{isHindi ? 'राशि (₹)' : 'Amount (₹)'}</th>
                    <th className="p-3 w-40 whitespace-nowrap">{isHindi ? 'मिलान स्थिति' : 'Match Status'}</th>
                    <th className="p-3 w-44 text-center whitespace-nowrap">{isHindi ? 'कार्यवाही' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                  {visibleStatementLines.map((line) => {
                    const isReconciled = !!(line.reconciled || line.isReconciled);
                    const matchedVoucher = isReconciled && line.matchedVoucherId 
                      ? data.vouchers.find(v => v.id === line.matchedVoucherId) 
                      : null;

                    // Compute top suggestions if unreconciled
                    const suggestions = !isReconciled ? computeVoucherMatches(line, bankBookVouchers, selectedBankId) : [];
                    const topSuggestion = suggestions.length > 0 ? suggestions[0] : null;

                    return (
                      <tr key={line.id} className="hover:bg-[var(--hover-surface)] transition">
                        <td className="p-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">{line.date}</td>
                        
                        <td className="p-3 min-w-[200px]">
                          <div className="font-semibold text-[var(--text-primary)]">{line.description}</div>
                          {topSuggestion && (
                            <div className="mt-1 text-[11px] text-amber-500 flex items-center gap-1">
                              <Sparkles className="w-3 h-3 shrink-0" />
                              <span>
                                {isHindi ? 'सुझाया गया मिलान:' : 'Suggested Match:'} <strong>{topSuggestion.voucher.voucherNumber}</strong> ({topSuggestion.voucher.partyName || topSuggestion.voucher.type}) - {topSuggestion.score}%
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="p-3 font-mono text-[var(--text-muted)] text-[11px] whitespace-nowrap">
                          {line.referenceNo || '-'}
                        </td>

                        <td className="p-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${
                            line.type === 'CREDIT' 
                              ? 'hv-pill-emerald' 
                              : 'hv-pill-rose'
                          }`}>
                            {line.type === 'CREDIT' ? 'CR (Deposit)' : 'DR (Withdrawal)'}
                          </span>
                        </td>

                        <td className={`p-3 text-right font-mono font-bold whitespace-nowrap ${
                          line.type === 'CREDIT' ? 'text-emerald-500' : 'text-rose-500'
                        }`}>
                          {formatCurrency(line.amount, data.company.currency)}
                        </td>

                        <td className="p-3 whitespace-nowrap">
                          {isReconciled ? (
                            <div className="flex items-center gap-1.5 text-emerald-500 font-bold text-xs">
                              <CheckCircle2 className="w-4 h-4 shrink-0" />
                              <span>{isHindi ? 'समाधान पूर्ण' : 'Reconciled'}</span>
                              {matchedVoucher && (
                                <span className="text-[10px] text-[var(--text-muted)] font-mono">
                                  ({matchedVoucher.voucherNumber})
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-amber-500 font-semibold text-xs">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>{isHindi ? 'लंबित' : 'Pending Match'}</span>
                            </div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            {perms.canReconcileBank ? (
                              !isReconciled ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setMatchingStatementLine(line)}
                                    className="hv-pill-indigo border px-2.5 py-1 rounded-lg text-xs font-bold transition"
                                    title={isHindi ? 'वाउचर से मिलान करें' : 'Match with Voucher'}
                                  >
                                    {isHindi ? 'मिलान करें' : 'Match'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      setQuickVoucherLine(line);
                                      setQuickVoucherType(line.type === 'DEBIT' ? 'PAYMENT' : 'RECEIPT');
                                    }}
                                    className="hv-pill-emerald border px-2.5 py-1 rounded-lg text-xs font-bold transition"
                                    title={isHindi ? 'सीधे वाउचर बनाएं' : 'Create Missing Voucher'}
                                  >
                                    {isHindi ? '+ वाउचर' : '+ Voucher'}
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => onReconcileMatch(line.id, 'VOUCHER', '')}
                                  className="text-[var(--text-muted)] hover:text-rose-500 px-2 py-1 rounded text-xs font-semibold transition"
                                >
                                  {isHindi ? 'अन-मैच' : 'Unmatch'}
                                </button>
                              )
                            ) : (
                              <span className="text-[10px] text-[var(--text-muted)] font-semibold">
                                {isHindi ? 'रीड-ओनली' : 'View Only'}
                              </span>
                            )}

                            {onDeleteStatementLine && perms.canDeleteRecords && (
                              <button
                                type="button"
                                onClick={() => onDeleteStatementLine(line.id)}
                                className="text-[var(--text-muted)] hover:text-rose-500 p-1 transition"
                                title="Delete statement line"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

      {/* TAB 2: STATEMENT REGISTER */}
      {activeTab === 'STATEMENT' && (
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? 'बैंक स्टेटमेंट सम्पूर्ण लेजर' : 'Bank Statement Full Ledger'}</span>
            </h3>
            {perms.canReconcileBank && (
              <button
                onClick={() => setShowImportModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-bold px-3 py-1.5 rounded-xl transition"
              >
                {isHindi ? '+ नया स्टेटमेंट जोड़ें' : '+ Import More'}
              </button>
            )}
          </div>

          <div className="border border-[var(--border-primary)] rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[780px]">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] uppercase text-[10px] font-bold border-b border-[var(--border-primary)]">
                <tr>
                  <th className="p-3 w-28 whitespace-nowrap">{isHindi ? 'दिनांक' : 'Date'}</th>
                  <th className="p-3 min-w-[200px]">{isHindi ? 'विवरण' : 'Particulars'}</th>
                  <th className="p-3 w-32 whitespace-nowrap">{isHindi ? 'Ref / UTR' : 'Ref No'}</th>
                  <th className="p-3 w-28 text-right whitespace-nowrap text-rose-500">{isHindi ? 'डेबिट / Withdrawal' : 'Debit (Dr)'}</th>
                  <th className="p-3 w-28 text-right whitespace-nowrap text-emerald-500">{isHindi ? 'क्रेडिट / Deposit' : 'Credit (Cr)'}</th>
                  <th className="p-3 w-32 text-right whitespace-nowrap">{isHindi ? 'रनिंग बैलेंस' : 'Running Balance'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                {periodScopedStatementLines.map(l => (
                  <tr key={l.id} className="hover:bg-[var(--hover-surface)]">
                    <td className="p-3 font-mono text-[var(--text-secondary)] whitespace-nowrap">{l.date}</td>
                    <td className="p-3 text-[var(--text-primary)] min-w-[200px]">{l.description}</td>
                    <td className="p-3 font-mono text-[var(--text-muted)] text-[11px] whitespace-nowrap">{l.referenceNo || '-'}</td>
                    <td className="p-3 text-right font-mono text-rose-500 whitespace-nowrap">
                      {l.type === 'DEBIT' ? formatCurrency(l.amount, data.company.currency) : '-'}
                    </td>
                    <td className="p-3 text-right font-mono text-emerald-500 whitespace-nowrap">
                      {l.type === 'CREDIT' ? formatCurrency(l.amount, data.company.currency) : '-'}
                    </td>
                    <td className="p-3 text-right font-mono text-[var(--text-primary)] font-bold whitespace-nowrap">
                      {l.runningBalance !== undefined ? formatCurrency(l.runningBalance, data.company.currency) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: BOOKS BANK VOUCHERS */}
      {activeTab === 'BOOKS' && (
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Landmark className="w-4 h-4 text-indigo-500" />
              <span>{isHindi ? 'कंपनी बैंक वही खाते (Bank Book Vouchers)' : 'Company Bank Book Vouchers'}</span>
            </h3>
            <span className="text-xs text-[var(--text-muted)] font-medium">
              {selectedBank?.name} ({periodScopedBankVouchers.length} {isHindi ? 'वाउचर्स' : 'vouchers'})
            </span>
          </div>

          <div className="border border-[var(--border-primary)] rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[920px]">
              <thead className="bg-[var(--bg-elevated)] text-[var(--text-secondary)] uppercase text-[10px] font-bold border-b border-[var(--border-primary)]">
                <tr>
                  <th className="p-3 w-28 whitespace-nowrap">{isHindi ? 'दिनांक' : 'Date'}</th>
                  <th className="p-3 w-32 whitespace-nowrap">{isHindi ? 'वाउचर नं.' : 'Voucher No'}</th>
                  <th className="p-3 w-24 text-center whitespace-nowrap">{isHindi ? 'प्रकार' : 'Type'}</th>
                  <th className="p-3 min-w-[200px]">{isHindi ? 'पार्टी / विवरण' : 'Party / Narration'}</th>
                  <th className="p-3 w-36 whitespace-nowrap">{isHindi ? 'इंस्ट्रूमेंट / UTR' : 'Instrument / UTR'}</th>
                  <th className="p-3 w-32 whitespace-nowrap">{isHindi ? 'बैंक क्लियरेंस तिथि' : 'Clearance Date'}</th>
                  <th className="p-3 w-32 text-right whitespace-nowrap">{isHindi ? 'राशि (₹)' : 'Amount (₹)'}</th>
                  <th className="p-3 w-32 text-center whitespace-nowrap">{isHindi ? 'स्थिति' : 'Status'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)] hv-surface">
                {periodScopedBankVouchers.map(v => {
                  const clearanceDate = v.bankersDate || v.reconciledDate || '';
                  const instrumentRef = v.instrumentNumber || v.bankReferenceNo || v.referenceNo || '';
                  const isCleared = Boolean(v.isReconciled || clearanceDate);
                  return (
                    <tr key={v.id} className="hover:bg-[var(--hover-surface)]">
                      <td className="p-3 font-mono tabular-nums text-[var(--text-secondary)] whitespace-nowrap">{v.date}</td>
                      <td className="p-3 font-mono font-bold text-indigo-500 whitespace-nowrap">{v.voucherNumber}</td>
                      <td className="p-3 font-bold text-[var(--text-secondary)] text-center whitespace-nowrap">{v.type}</td>
                      <td className="p-3 min-w-[200px]">
                        <div className="text-[var(--text-primary)] font-semibold">{v.partyName || v.narration}</div>
                        {v.partyName && <div className="text-[11px] text-[var(--text-muted)]">{v.narration}</div>}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-[var(--text-secondary)] whitespace-nowrap">
                        {instrumentRef || <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="p-3 font-mono tabular-nums text-[11px] whitespace-nowrap">
                        {clearanceDate ? (
                          <span className="text-emerald-500 font-semibold">{clearanceDate}</span>
                        ) : (
                          <span className="text-amber-500 font-semibold">
                            {isHindi ? 'बैंक में लंबित' : 'Uncleared'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums font-bold text-[var(--text-primary)] whitespace-nowrap">
                        {formatCurrency(v.totalAmount, data.company.currency)}
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {isCleared ? (
                          <span className="text-emerald-500 font-bold text-xs flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isHindi ? 'क्लियर / मिलान पूर्ण' : 'Cleared'}</span>
                          </span>
                        ) : (
                          <span className="text-amber-500 font-semibold text-xs">
                            {isHindi ? 'लंबित (Uncleared)' : 'Uncleared'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: OFFICIAL BRS AUDIT REPORT (Printable) */}
      {activeTab === 'REPORT' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 hv-surface border border-[var(--border-primary)] p-4 rounded-2xl no-print shadow-lg">
            <div>
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Printer className="w-4 h-4 text-emerald-500" />
                <span>{isHindi ? 'आधिकारिक BRS ऑडिट रिपोर्ट पूर्वावलोकन' : 'Official BRS Audit Report Preview'}</span>
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {isHindi ? 'लेजर और बैंक स्टेटमेंट का प्रमाणित समाधान विवरण' : 'Certified reconciliation statement for management & tax auditors'}
              </p>
            </div>
            {perms.canExportData && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBrsPrintConfig(prev => !prev)}
                  className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition cursor-pointer ${
                    showBrsPrintConfig
                      ? 'hv-pill-amber'
                      : 'bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'प्रिंट सेटिंग्स' : 'Print Config'}</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    setIsDownloadingBrsPdf(true);
                    const ok = await exportElementToPdf('printable-brs-report', {
                      filename: `BRS_Statement_${selectedBank?.name || 'Bank'}_${new Date().toISOString().split('T')[0]}`,
                      paperSize: brsPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                      orientation: brsPrintConfig.printOrientation,
                      marginMode: brsPrintConfig.printMargins,
                      scale: 2
                    });
                    setIsDownloadingBrsPdf(false);
                    if (!ok) {
                      printDomElement('printable-brs-report', {
                        paperSize: brsPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                        orientation: brsPrintConfig.printOrientation,
                        marginMode: brsPrintConfig.printMargins,
                        title: `BRS Report - ${data.company.name}`
                      });
                    }
                  }}
                  disabled={isDownloadingBrsPdf}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-extrabold px-3.5 py-2 rounded-xl shadow-md transition cursor-pointer disabled:opacity-60"
                >
                  {isDownloadingBrsPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{isDownloadingBrsPdf ? (isHindi ? 'PDF बन रहा है...' : 'Saving PDF...') : (isHindi ? 'PDF डाउनलोड' : 'Download PDF')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const printArea = document.getElementById('printable-brs-report');
                    if (!printArea) return;
                    const blob = new Blob([`<!DOCTYPE html><html><head><title>BRS Report - ${data.company.name}</title><style>body{font-family:sans-serif;padding:25px;color:#0f172a;}table{width:100%;border-collapse:collapse;margin-top:15px;font-size:12px;}th,td{padding:8px;border:1px solid #cbd5e1;}.text-right{text-align:right;}.mono{font-family:monospace;}</style></head><body>${printArea.innerHTML}</body></html>`], { type: 'text/html;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `BRS_Report_${new Date().toISOString().split('T')[0]}.html`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs font-bold px-3 py-2 rounded-xl transition cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-sky-500" />
                  <span>HTML</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    printDomElement('printable-brs-report', {
                      paperSize: brsPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                      orientation: brsPrintConfig.printOrientation,
                      marginMode: brsPrintConfig.printMargins,
                      title: `BRS Report - ${data.company.name}`
                    })
                  }
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-md transition cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>{isHindi ? 'प्रिंट करें' : 'Print'}</span>
                </button>
              </div>
            )}
          </div>

          {showBrsPrintConfig && (
            <div className="rounded-2xl overflow-hidden border border-[var(--border-primary)] no-print">
              <PrintConfigPanel
                config={brsPrintConfig}
                onChange={setBrsPrintConfig}
                isHindi={isHindi}
                docKind="brs"
              />
            </div>
          )}

          <div
            id="printable-brs-report"
            style={{
              fontSize: brsPrintConfig.printFontScale === 'compact' ? '92%' : brsPrintConfig.printFontScale === 'large' ? '108%' : undefined
            }}
            className={`printable-area bg-white text-slate-900 rounded-2xl shadow-2xl space-y-6 max-w-4xl mx-auto font-sans border border-slate-200 ${getPaperPaddingClass(brsPrintConfig.printMargins)} ${getPaperWidthClass(brsPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4', brsPrintConfig.printOrientation)}`}
          >
          
          {/* Report Header */}
          <div className="text-center border-b pb-4">
            {brsPrintConfig.showCompanyLogoOnPrint && data.company.logoUrl && (
              <img src={data.company.logoUrl} alt={data.company.name} className="max-h-12 mx-auto mb-2 object-contain" />
            )}
            <h2 className="text-xl font-extrabold uppercase tracking-wide">{data.company.name || 'Company Name'}</h2>
            <p className="text-xs text-slate-600">{data.company.address} {data.company.gstin ? `| GSTIN: ${data.company.gstin}` : ''}</p>
            <h3 className="text-base font-bold text-indigo-900 mt-2">
              {isHindi ? 'बैंक समाधान विवरण (Bank Reconciliation Statement)' : 'BANK RECONCILIATION STATEMENT (BRS)'}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              As on: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} | Bank: <strong>{selectedBank?.name}</strong>
            </p>
          </div>

          {/* BRS Mathematical Table */}
          <div className="space-y-4 text-xs">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-900 font-bold text-slate-800 uppercase">
                  <th className="py-2 text-left">{isHindi ? 'विवरण' : 'Particulars'}</th>
                  <th className="py-2 text-right w-36">{isHindi ? 'राशि (₹)' : 'Amount (₹)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                
                {/* 1. Books Balance */}
                <tr className="font-bold bg-slate-50">
                  <td className="py-2.5">
                    {isHindi ? '1. कंपनी बहीखाते अनुसार बैंक शेष (Balance as per Books):' : '1. Balance as per Company Books:'}
                  </td>
                  <td className="py-2.5 text-right font-mono font-extrabold text-sm">
                    {formatCurrency(balances.bookBalance, data.company.currency)}
                  </td>
                </tr>

                {/* 2. Add: Uncleared Credits in Bank */}
                <tr>
                  <td className="py-2 pl-4 text-slate-700">
                    (+) {isHindi ? 'बैंक में जमा हुई राशि जो बहियों में दर्ज नहीं थी (Amounts Credited in Bank):' : 'Amounts Credited directly in Bank Statement:'}
                  </td>
                  <td className="py-2 text-right font-mono text-emerald-700">
                    +{formatCurrency(balances.unreconciledCredits, data.company.currency)}
                  </td>
                </tr>

                {/* 3. Less: Uncleared Debits in Bank */}
                <tr>
                  <td className="py-2 pl-4 text-slate-700">
                    (-) {isHindi ? 'बैंक द्वारा काटी गई राशि / बैंक शुल्क जो बहियों में दर्ज नहीं थे (Bank Debits/Charges):' : 'Direct Debits / Bank Charges not yet in books:'}
                  </td>
                  <td className="py-2 text-right font-mono text-rose-700">
                    -{formatCurrency(balances.unreconciledDebits, data.company.currency)}
                  </td>
                </tr>

                {/* 4. Calculated Reconciled Balance */}
                <tr className="font-extrabold bg-indigo-50/50 border-t-2 border-slate-400">
                  <td className="py-2.5 text-indigo-950">
                    {isHindi ? 'समायोजित शेष (Reconciled Bank Balance):' : 'Reconciled Bank Balance:'}
                  </td>
                  <td className="py-2.5 text-right font-mono font-extrabold text-indigo-950">
                    {formatCurrency(balances.statementClosingBalance, data.company.currency)}
                  </td>
                </tr>

                {/* 5. Statement Balance Comparison */}
                <tr className="font-bold bg-emerald-50 text-emerald-950">
                  <td className="py-2.5">
                    {isHindi ? '2. बैंक स्टेटमेंट/पासबुक अनुसार शेष (Balance as per Statement):' : '2. Balance as per Bank Statement / Passbook:'}
                  </td>
                  <td className="py-2.5 text-right font-mono font-extrabold text-sm">
                    {formatCurrency(balances.statementClosingBalance, data.company.currency)}
                  </td>
                </tr>

                {/* 6. Net Difference */}
                <tr className="font-extrabold border-t-2 border-b-2 border-slate-900">
                  <td className="py-3">
                    {isHindi ? 'शुद्ध समाधान अंतर (Net BRS Difference):' : 'NET BRS DIFFERENCE:'}
                  </td>
                  <td className="py-3 text-right font-mono text-sm">
                    {balances.difference < 0.05 ? '₹ 0.00 (NIL)' : formatCurrency(balances.difference, data.company.currency)}
                  </td>
                </tr>

              </tbody>
            </table>
          </div>

          {/* Signatures & Certification */}
          {brsPrintConfig.showAuthorizedSignatory && (
            <div className="pt-8 flex justify-between items-end text-xs text-slate-700 border-t footer">
              <div className="text-center">
                <div className="w-40 border-b border-slate-400 mb-1"></div>
                <span>{isHindi ? 'तैयारकर्ता (Prepared By)' : 'Prepared By Accountant'}</span>
              </div>
              <div className="text-center">
                <div className="w-40 border-b border-slate-400 mb-1"></div>
                <span>{isHindi ? 'सत्यापितकर्ता / CA (Auditor Sign)' : 'Auditor / Authorized Signatory'}</span>
              </div>
            </div>
          )}

          {/* Print Button */}
          {perms.canExportData && (
            <div className="text-center pt-4 no-print">
              <button
                onClick={() =>
                  printDomElement('printable-brs-report', {
                    paperSize: brsPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                    orientation: brsPrintConfig.printOrientation,
                    marginMode: brsPrintConfig.printMargins,
                    title: `BRS Report - ${data.company.name}`
                  })
                }
                className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-xl text-xs flex items-center gap-2 mx-auto transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>{isHindi ? 'यह BRS रिपोर्ट प्रिंट करें (Print Report)' : 'Print BRS Statement'}</span>
              </button>
            </div>
          )}

        </div>
      </div>
      )}

      {/* MODAL 1: IMPORT BANK STATEMENT */}
      {showImportModal && (
        <BankStatementImportUtility
          data={data}
          isHindi={isHindi}
          onImportStatementLines={(lines) => {
            if (onBatchAddStatementLines) {
              onBatchAddStatementLines(lines);
            } else {
              lines.forEach(l => onAddStatementLine(l));
            }
            setShowImportModal(false);
          }}
          onPostBankVouchersBatch={onPostBankVouchersBatch}
          onCreateBankLedgerQuick={onCreateBankLedgerQuick}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* MODAL 2: MANUAL MATCH MODAL */}
      {matchingStatementLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="hv-surface border border-[var(--border-subtle)] w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto text-[var(--text-primary)]">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{isHindi ? 'स्टेटमेंट प्रविष्टि का वाउचर से मिलान' : 'Match Statement Entry with Book Voucher'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setMatchingStatementLine(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Statement Line Info */}
            <div className="hv-elevated p-3.5 rounded-xl border border-[var(--border-subtle)] space-y-1">
              <div className="flex justify-between text-xs font-bold text-[var(--text-primary)]">
                <span>{matchingStatementLine.description}</span>
                <span className={matchingStatementLine.type === 'CREDIT' ? 'text-emerald-500' : 'text-rose-500'}>
                  {formatCurrency(matchingStatementLine.amount, data.company.currency)} ({matchingStatementLine.type})
                </span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)] font-mono">
                Date: {matchingStatementLine.date} | Ref: {matchingStatementLine.referenceNo || 'N/A'}
              </div>
            </div>

            {/* Matching Suggestions List */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[var(--text-secondary)]">
                {isHindi ? 'उपलब्ध वाउचर्स (Available Book Vouchers):' : 'Select Matching Voucher from Books:'}
              </h4>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {bankBookVouchers
                  .filter(v => !v.isReconciled)
                  .map(v => {
                    const isExactAmt = Math.abs(v.totalAmount - matchingStatementLine.amount) < 0.01;
                    return (
                      <div
                        key={v.id}
                        onClick={() => {
                          onReconcileMatch(matchingStatementLine.id, 'VOUCHER', v.id);
                          setMatchingStatementLine(null);
                        }}
                        className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                          isExactAmt 
                            ? 'hv-pill-emerald' 
                            : 'hv-elevated border-[var(--border-subtle)] hover:bg-[var(--hover-surface)]'
                        }`}
                      >
                        <div>
                          <div className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                            <span>{v.voucherNumber} ({v.type})</span>
                            {isExactAmt && (
                              <span className="hv-pill-emerald border text-[10px] px-1.5 py-0.2 rounded font-bold">
                                {isHindi ? 'सटीक राशि' : 'Exact Amount'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] font-mono">
                            {v.date} | {v.partyName || v.narration}
                          </div>
                        </div>

                        <div className="text-right font-mono font-bold text-[var(--text-primary)] text-xs">
                          {formatCurrency(v.totalAmount, data.company.currency)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setMatchingStatementLine(null)}
                className="bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] px-4 py-2 rounded-xl text-xs font-bold transition"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: QUICK CREATE MISSING VOUCHER */}
      {quickVoucherLine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="hv-surface border border-[var(--border-subtle)] w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 text-[var(--text-primary)]">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-500" />
                <span>{isHindi ? 'स्टेटमेंट लाइन से सीधे वाउचर बनाएं' : 'Create Missing Voucher'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setQuickVoucherLine(null)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="hv-elevated p-3 rounded-xl border border-[var(--border-subtle)] text-xs space-y-1">
              <div className="text-[var(--text-primary)] font-bold">{quickVoucherLine.description}</div>
              <div className="text-[var(--text-muted)] font-mono flex justify-between">
                <span>Date: {quickVoucherLine.date}</span>
                <span className={quickVoucherLine.type === 'CREDIT' ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
                  {formatCurrency(quickVoucherLine.amount, data.company.currency)} ({quickVoucherLine.type})
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold mb-1 block">
                  {isHindi ? 'विपरीत खाता (Counter Ledger Account):' : 'Counter Ledger Account:'}
                </label>
                <select
                  value={quickTargetAccountId}
                  onChange={(e) => setQuickTargetAccountId(e.target.value)}
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- {isHindi ? 'खाता चुनें' : 'Select Account'} --</option>
                  {data.accounts.filter(acc => !acc.isGroup && acc.id !== selectedBank?.id).map(acc => (
                    <option key={acc.id} value={acc.id}>
                      [{acc.code}] {acc.name} ({acc.category}){isCashOrBankLedger(acc) ? ' → Contra' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setQuickVoucherLine(null)}
                className="bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] px-4 py-2 rounded-xl text-xs font-bold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleExecuteCreateQuickVoucher}
                className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white px-5 py-2 rounded-xl text-xs font-extrabold transition shadow-lg shadow-emerald-600/30"
              >
                {isHindi ? 'वाउचर बनाएं व समाधान करें' : 'Post & Reconcile'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
