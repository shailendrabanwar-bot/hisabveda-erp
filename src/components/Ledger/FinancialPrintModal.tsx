import React, { useState, useRef } from 'react';
import { 
  Printer, 
  X, 
  Download, 
  FileSpreadsheet, 
  CheckCircle2, 
  Building2, 
  AlertCircle,
  Copy,
  Check,
  PieChart,
  Scale,
  Sparkles,
  Maximize2,
  ZoomIn,
  ZoomOut,
  FileText,
  Sliders,
  Loader2
} from 'lucide-react';
import { AppData } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
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
import { printDomElement } from '../../utils/printReport';
import { exportElementToPdf } from '../../utils/pdfExport';
import { AppConfiguration, loadAppConfig } from '../../utils/appConfig';
import { getFinancialYearRange } from '../../utils/fiscalYear';
import { PrintConfigPanel, getPaperWidthClass } from '../Common/PrintConfigPanel';

interface FinancialPrintModalProps {
  data: AppData;
  isHindi: boolean;
  activeReport: 'TRADING_PL' | 'BS' | 'TB' | 'SCH34';
  initialViewMode?: 'condensed' | 'detailed';
  periodLabel?: string;
  tbOptions?: { showOpening?: boolean; showTransactions?: boolean; showClosing?: boolean };
  onClose: () => void;
}

interface StatementItem {
  name: string;
  amount: number;
  isBold?: boolean;
  isHeader?: boolean;
  highlight?: 'green' | 'red';
}

export const FinancialPrintModal: React.FC<FinancialPrintModalProps> = ({
  data,
  isHindi,
  activeReport: initialReport,
  initialViewMode = 'condensed',
  periodLabel,
  tbOptions,
  onClose
}) => {
  const company = data.company;
  const currency = company.currency || 'INR';
  const [printConfig, setPrintConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false);
  const [currentReport, setCurrentReport] = useState<'TRADING_PL' | 'BS' | 'TB' | 'SCH34'>(initialReport);
  const [viewMode, setViewMode] = useState<'condensed' | 'detailed'>(initialViewMode);
  const [tbShowOpening, setTbShowOpening] = useState<boolean>(tbOptions?.showOpening ?? false);
  const [tbShowTransactions, setTbShowTransactions] = useState<boolean>(tbOptions?.showTransactions ?? false);
  const [tbShowClosing, setTbShowClosing] = useState<boolean>(tbOptions?.showClosing ?? true);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => loadAppConfig().printOrientation || 'portrait');
  const [zoomScale, setZoomScale] = useState<number>(100);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const printSheetRef = useRef<HTMLDivElement>(null);

  const handlePrintConfigChange = (nextCfg: AppConfiguration) => {
    setPrintConfig(nextCfg);
    setOrientation(nextCfg.printOrientation);
  };

  const balancesMap = calculateAccountBalances(data);
  const allMergedAccounts = mergeAccountsWithBalancesMap(data, balancesMap);
  const closingStock = calculateClosingStock(data);

  // Group accounts by recursive effective Category (includes dynamic system/imported ledgers)
  const assetAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'ASSET');
  const liabilityAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'LIABILITY');
  const equityAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'EQUITY');
  const revenueAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'REVENUE');
  const expenseAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'EXPENSE');
  const allBalancesList = Array.from(balancesMap.values());

  // Direct Revenues vs Indirect Revenues
  const salesAccounts = revenueAccounts.filter(a => isDirectRevenueLedger(a, data.accountGroups));
  const indirectRevenueAccounts = revenueAccounts.filter(a => !salesAccounts.some(s => s.id === a.id));

  // Direct Expenses vs Indirect Expenses
  const directExpenseAccounts = expenseAccounts.filter(a => isDirectExpenseLedger(a, data.accountGroups));
  const indirectExpenseAccounts = expenseAccounts.filter(a => !directExpenseAccounts.some(d => d.id === a.id));

  // Opening Stock
  const openingStock = getEffectiveOpeningStock(data);

  // 1. Trading Account Calculations
  let totalSalesRevenue = 0;
  for (const acc of salesAccounts) {
    totalSalesRevenue += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  let totalDirectExpenses = 0;
  for (const acc of directExpenseAccounts) {
    totalDirectExpenses += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  const totalTradingDebit = openingStock + totalDirectExpenses;
  const totalTradingCredit = totalSalesRevenue + closingStock;
  const grossProfit = totalTradingCredit - totalTradingDebit;

  // 2. P&L Calculations
  let totalIndirectIncome = 0;
  for (const acc of indirectRevenueAccounts) {
    totalIndirectIncome += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  let totalIndirectExpenses = 0;
  for (const acc of indirectExpenseAccounts) {
    totalIndirectExpenses += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  const totalPlCredits = (grossProfit > 0 ? grossProfit : 0) + totalIndirectIncome;
  const totalPlDebits = (grossProfit < 0 ? Math.abs(grossProfit) : 0) + totalIndirectExpenses;
  const netProfit = totalPlCredits - totalPlDebits;

  // 3. Balance Sheet Calculations
  let fixedAssetsTotal = 0;
  let otherAssetsTotal = 0;
  const fixedAssetList = assetAccounts.filter(a => isFixedAssetLedger(a, data.accountGroups) && !isEffectiveStockOpeningAccount(a, data));

  for (const acc of assetAccounts) {
    if (isEffectiveStockOpeningAccount(acc, data)) continue;
    const bal = getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
    if (fixedAssetList.some(f => f.id === acc.id)) {
      fixedAssetsTotal += bal;
    } else {
      otherAssetsTotal += bal;
    }
  }
  const totalAssets = fixedAssetsTotal + otherAssetsTotal + closingStock;

  let totalCapitalEquity = 0;
  for (const bal of allBalancesList) {
    if (getEffectiveAccountCategory(bal.account, data.accountGroups) === 'EQUITY') {
      totalCapitalEquity += getSignedLedgerAmount(bal, 'EQUITY');
    }
  }
  let totalLiabilities = 0;
  let nonCurrentLiabTotal = 0;
  let currentLiabTotal = 0;
  for (const acc of liabilityAccounts) {
    const bal = getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
    totalLiabilities += bal;
    if (isNonCurrentLiabilityLedger(acc, data.accountGroups)) {
      nonCurrentLiabTotal += bal;
    } else {
      currentLiabTotal += bal;
    }
  }
  const totalLiabAndEquity = totalCapitalEquity + netProfit + totalLiabilities;
  const bsDifference = totalAssets - totalLiabAndEquity;

  // 4. Trial Balance Totals & Breakdowns (Opening, Period Transactions, Closing)
  let totalTbDr = 0;
  let totalTbCr = 0;
  let totalTbOpenDr = 0;
  let totalTbOpenCr = 0;
  let totalTbTxDr = 0;
  let totalTbTxCr = 0;

  const tbDetailedEntries = allBalancesList
    .map(bal => {
      if (!bal) return null;
      const acc = bal.account;
      const openDr = acc.balanceType === 'DR' ? (acc.openingBalance || 0) : 0;
      const openCr = acc.balanceType === 'CR' ? (acc.openingBalance || 0) : 0;
      const txDr = Math.max(0, Math.round((bal.debit - openDr) * 100) / 100);
      const txCr = Math.max(0, Math.round((bal.credit - openCr) * 100) / 100);
      const closeDr = bal.balanceType === 'DR' ? bal.netBalance : 0;
      const closeCr = bal.balanceType === 'CR' ? bal.netBalance : 0;
      const hasActivity = openDr > 0.001 || openCr > 0.001 || txDr > 0.001 || txCr > 0.001 || closeDr > 0.001 || closeCr > 0.001;
      if (!hasActivity) return null;
      totalTbOpenDr += openDr;
      totalTbOpenCr += openCr;
      totalTbTxDr += txDr;
      totalTbTxCr += txCr;
      totalTbDr += closeDr;
      totalTbCr += closeCr;
      return { bal, openDr, openCr, txDr, txCr, closeDr, closeCr };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  // Trial Balance Condensed Groupings
  const tbGroupsMap = new Map<
    string,
    {
      groupName: string;
      category: string;
      openDr: number;
      openCr: number;
      txDr: number;
      txCr: number;
      dr: number;
      cr: number;
      count: number;
    }
  >();
  for (const entry of tbDetailedEntries) {
    const { bal, openDr, openCr, txDr, txCr, closeDr, closeCr } = entry;
    const grp = bal.account.mainGroup || bal.account.subCategory || (
      bal.account.category === 'ASSET' ? 'Current Assets' :
      bal.account.category === 'LIABILITY' ? 'Current Liabilities' :
      bal.account.category === 'EQUITY' ? 'Capital & Reserves' :
      bal.account.category === 'REVENUE' ? 'Sales & Revenues' :
      'Direct & Indirect Expenses'
    );
    if (!tbGroupsMap.has(grp)) {
      tbGroupsMap.set(grp, { groupName: grp, category: bal.account.category, openDr: 0, openCr: 0, txDr: 0, txCr: 0, dr: 0, cr: 0, count: 0 });
    }
    const item = tbGroupsMap.get(grp)!;
    item.count += 1;
    item.openDr += openDr;
    item.openCr += openCr;
    item.txDr += txDr;
    item.txCr += txCr;
    item.dr += closeDr;
    item.cr += closeCr;
  }
  const condensedTbGroups = Array.from(tbGroupsMap.values());

  // --- BALANCED ROW BUILDERS ---
  // Trading Rows
  const tradingDebits: StatementItem[] = [
    { name: 'To Opening Stock (प्रारम्भिक स्टॉक)', amount: openingStock, isBold: true }
  ];

  if (viewMode === 'condensed') {
    tradingDebits.push({ name: 'To Direct Expenses & Cost of Sales (कुल प्रत्यक्ष व्यय व लागत)', amount: totalDirectExpenses, isBold: true });
  } else {
    for (const acc of directExpenseAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) tradingDebits.push({ name: `To ${acc.name} (${acc.code})`, amount: val });
    }
  }

  const tradingCredits: StatementItem[] = [];
  if (viewMode === 'condensed') {
    tradingCredits.push({ name: 'By Sales & Direct Revenues (कुल बिक्री एवं प्रत्यक्ष आय)', amount: totalSalesRevenue, isBold: true });
  } else {
    for (const acc of salesAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) tradingCredits.push({ name: `By ${acc.name} (${acc.code})`, amount: val });
    }
    if (tradingCredits.length === 0 && totalSalesRevenue !== 0) {
      tradingCredits.push({ name: 'By Sales & Direct Revenues', amount: totalSalesRevenue, isBold: true });
    }
  }
  tradingCredits.push({ name: 'By Closing Stock in Hand (अंतिम स्टॉक)', amount: closingStock, isBold: true });

  if (grossProfit >= 0) {
    tradingDebits.push({ name: 'To Gross Profit c/d (सकल लाभ)', amount: grossProfit, isBold: true, highlight: 'green' });
  } else {
    tradingCredits.push({ name: 'By Gross Loss c/d (सकल हानि)', amount: Math.abs(grossProfit), isBold: true, highlight: 'red' });
  }

  const tradingMaxRows = Math.max(tradingDebits.length, tradingCredits.length);
  const tradingTableTotal = Math.max(
    totalTradingDebit + (grossProfit > 0 ? grossProfit : 0), 
    totalTradingCredit + (grossProfit < 0 ? Math.abs(grossProfit) : 0)
  );

  // P&L Rows
  const plDebits: StatementItem[] = [];
  const plCredits: StatementItem[] = [];

  if (grossProfit < 0) {
    plDebits.push({ name: 'To Gross Loss b/d (सकल हानि अंतरण)', amount: Math.abs(grossProfit), isBold: true, highlight: 'red' });
  } else if (grossProfit >= 0) {
    plCredits.push({ name: 'By Gross Profit b/d (सकल लाभ अंतरण)', amount: grossProfit, isBold: true, highlight: 'green' });
  }

  if (viewMode === 'condensed') {
    plDebits.push({ name: 'To Indirect Operating Expenses (कुल अप्रत्यक्ष संचालन व्यय)', amount: totalIndirectExpenses, isBold: true });
    plCredits.push({ name: 'By Indirect Incomes & Other Gains (कुल अप्रत्यक्ष आय व लाभ)', amount: totalIndirectIncome, isBold: true });
  } else {
    for (const acc of indirectExpenseAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) plDebits.push({ name: `To ${acc.name} (${acc.code})`, amount: val });
    }

    for (const acc of indirectRevenueAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) plCredits.push({ name: `By ${acc.name} (${acc.code})`, amount: val });
    }
  }

  if (netProfit >= 0) {
    plDebits.push({ name: 'To Net Profit Transferred to Capital (शुद्ध लाभ)', amount: netProfit, isBold: true, highlight: 'green' });
  } else {
    plCredits.push({ name: 'By Net Loss Transferred to Capital (शुद्ध हानि)', amount: Math.abs(netProfit), isBold: true, highlight: 'red' });
  }

  const plMaxRows = Math.max(plDebits.length, plCredits.length);
  const plTableTotal = Math.max(
    totalPlDebits + (netProfit > 0 ? netProfit : 0), 
    totalPlCredits + (netProfit < 0 ? Math.abs(netProfit) : 0)
  );

  // Balance Sheet Rows
  const bsLiabilities: StatementItem[] = [
    { name: 'A. CAPITAL & RESERVES (पूंजी व आरक्षित कोष)', amount: 0, isBold: true, isHeader: true }
  ];

  if (viewMode === 'condensed') {
    bsLiabilities.push({ name: '  Proprietor / Partner / Equity Capital', amount: totalCapitalEquity, isBold: true });
    if (netProfit !== 0) {
      bsLiabilities.push({ 
        name: netProfit >= 0 ? '  Add: Net Profit for the Year' : '  Less: Net Loss for the Year', 
        amount: netProfit,
        isBold: true,
        highlight: netProfit >= 0 ? 'green' : 'red'
      });
    }
    bsLiabilities.push({ name: 'B. LIABILITIES (देनदारियां व दायित्व)', amount: 0, isBold: true, isHeader: true });
    if (nonCurrentLiabTotal !== 0) {
      bsLiabilities.push({ name: '  Long-Term / Non-Current Liabilities (दीर्घकालिक ऋण)', amount: nonCurrentLiabTotal, isBold: true });
    }
    bsLiabilities.push({ name: '  Current Liabilities & Trade Payables (लेनदार व चालू देनदारियां)', amount: currentLiabTotal, isBold: true });
  } else {
    for (const acc of equityAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) bsLiabilities.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
    }
    if (!bsLiabilities.some(x => !x.isHeader) && totalCapitalEquity !== 0) {
      bsLiabilities.push({ name: '  Proprietor / Partner / Equity Capital', amount: totalCapitalEquity });
    }

    if (netProfit !== 0) {
      bsLiabilities.push({ 
        name: netProfit >= 0 ? '  Add: Net Profit for the Year' : '  Less: Net Loss for the Year', 
        amount: netProfit,
        isBold: true,
        highlight: netProfit >= 0 ? 'green' : 'red'
      });
    }

    bsLiabilities.push({ name: 'B. LIABILITIES (देनदारियां व दायित्व)', amount: 0, isBold: true, isHeader: true });
    for (const acc of liabilityAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) bsLiabilities.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
    }
  }

  const bsAssets: StatementItem[] = [
    { name: 'C. FIXED ASSETS (अचल संपत्तियां)', amount: 0, isBold: true, isHeader: true }
  ];

  if (viewMode === 'condensed') {
    bsAssets.push({ name: '  Property, Plant & Equipment (अचल संपत्तियां)', amount: fixedAssetsTotal, isBold: true });
    bsAssets.push({ name: 'D. CURRENT ASSETS & RECEIVABLES (चालू संपत्तियां)', amount: 0, isBold: true, isHeader: true });
    if (closingStock > 0) {
      bsAssets.push({ name: '  Closing Stock in Hand (अंतिम स्टॉक)', amount: closingStock, isBold: true });
    }
    bsAssets.push({ name: '  Cash, Bank, Debtors & Receivables (चालू संपत्तियां)', amount: otherAssetsTotal, isBold: true });
  } else {
    for (const acc of fixedAssetList) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) bsAssets.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
    }
    if (fixedAssetList.length === 0 && fixedAssetsTotal > 0) {
      bsAssets.push({ name: '  Property, Plant & Equipment', amount: fixedAssetsTotal });
    }

    bsAssets.push({ name: 'D. CURRENT ASSETS & RECEIVABLES (चालू संपत्तियां)', amount: 0, isBold: true, isHeader: true });
    if (closingStock > 0) {
      bsAssets.push({ name: '  Closing Stock in Hand (अंतिम स्टॉक)', amount: closingStock, isBold: true });
    }

    const nonFixedAssets = assetAccounts.filter(a => !fixedAssetList.some(f => f.id === a.id) && !isEffectiveStockOpeningAccount(a, data));
    for (const acc of nonFixedAssets) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) bsAssets.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
    }
  }

  const bsMaxRows = Math.max(bsLiabilities.length, bsAssets.length);

  // Report Title
  const getReportTitle = () => {
    switch (currentReport) {
      case 'TRADING_PL':
        return isHindi 
          ? 'व्यापारिक तथा लाभ व हानि खाता (Trading & Profit Loss Account)' 
          : 'Trading and Profit & Loss Account';
      case 'BS':
        return isHindi 
          ? 'बैलेंस शीट / वित्तीय स्थिति विवरण (Balance Sheet Statement)' 
          : 'Balance Sheet Statement';
      case 'TB':
        return isHindi 
          ? 'तलपट / जांच सूची (Standard Trial Balance Statement)' 
          : 'Standard Trial Balance Statement';
      case 'SCH34':
        return isHindi 
          ? 'Schedule III / IV प्रकटीकरण विवरण (Corporate Statutory Disclosures)' 
          : 'Schedule III / IV Statutory Disclosures';
    }
  };

  // 1-Click Direct Real A4/A5 PDF Download Action
  const handleDownloadDirectA4Pdf = async () => {
    setIsGeneratingPdf(true);
    const element = document.getElementById('printable-financial-statement');
    if (!element) {
      setIsGeneratingPdf(false);
      return;
    }

    const cleanCompName = (company.name || 'Company').replace(/[^a-zA-Z0-9]/g, '_');
    const paperTag = printConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4';
    const filename = `${cleanCompName}_${currentReport}_${paperTag}_${new Date().toISOString().split('T')[0]}.pdf`;

    const success = await exportElementToPdf(element, {
      filename,
      paperSize: printConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
      orientation,
      marginMode: printConfig.printMargins,
      scale: 2
    });

    setIsGeneratingPdf(false);
    if (success) {
      const msg = isHindi
        ? `✅ ${paperTag} PDF डाउनलोड हो गया: ${filename}`
        : `✅ ${paperTag} PDF downloaded successfully: ${filename}`;
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 4000);
    } else {
      handlePrint();
    }
  };

  // Browser Print Dialog via Isolated Print Root
  const handlePrint = () => {
    printDomElement('printable-financial-statement', {
      paperSize: printConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
      orientation,
      marginMode: printConfig.printMargins,
      title: `${getReportTitle()} - ${company.name}`
    });
  };

  // Handler: Download Standalone HTML Report for CA/Offline Sharing
  const handleDownloadHtml = () => {
    const printArea = document.getElementById('printable-financial-statement');
    if (!printArea) return;

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${getReportTitle()} - ${company.name}</title>
  <style>
    @page { size: A4 ${orientation}; margin: 12mm 10mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 25px; color: #0f172a; background: #ffffff; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
    th { background: #1e3a8a !important; color: #ffffff !important; padding: 8px 10px; border: 1px solid #94a3b8; text-align: left; }
    td { padding: 7px 10px; border: 1px solid #cbd5e1; }
    .text-right { text-align: right; }
    .font-bold { font-weight: bold; }
    .mono { font-family: ui-monospace, SFMono-Regular, monospace; }
    .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
    .footer { margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  ${printArea.innerHTML}
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_${currentReport}_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handler: Export CSV
  const handleExportCsv = () => {
    let csvRows: string[][] = [];
    let filename = `${currentReport}_Report`;

    if (currentReport === 'TB') {
      const header = ['Account Code', 'Account Name', 'Category'];
      if (tbShowOpening) header.push('Opening (DR)', 'Opening (CR)');
      if (tbShowTransactions) header.push('Period Txns (DR)', 'Period Txns (CR)');
      if (tbShowClosing || (!tbShowOpening && !tbShowTransactions)) header.push('Closing (DR)', 'Closing (CR)');
      csvRows.push(header);

      const includeClose = tbShowClosing || (!tbShowOpening && !tbShowTransactions);
      tbDetailedEntries.forEach(({ bal, openDr, openCr, txDr, txCr, closeDr, closeCr }) => {
        const row = [
          bal.account.code,
          bal.account.name,
          `${bal.account.category} - ${bal.account.subCategory || ''}`
        ];
        if (tbShowOpening) row.push(openDr.toString(), openCr.toString());
        if (tbShowTransactions) row.push(txDr.toString(), txCr.toString());
        if (includeClose) row.push(closeDr.toString(), closeCr.toString());
        csvRows.push(row);
      });
      const totalRow = ['TOTAL', 'Trial Balance Total', ''];
      if (tbShowOpening) totalRow.push(totalTbOpenDr.toString(), totalTbOpenCr.toString());
      if (tbShowTransactions) totalRow.push(totalTbTxDr.toString(), totalTbTxCr.toString());
      if (includeClose) totalRow.push(totalTbDr.toString(), totalTbCr.toString());
      csvRows.push(totalRow);
    } else if (currentReport === 'BS') {
      csvRows.push(['Liabilities & Capital', 'Amount', 'Assets & Properties', 'Amount']);
      Array.from({ length: bsMaxRows }).forEach((_, idx) => {
        const l = bsLiabilities[idx];
        const a = bsAssets[idx];
        csvRows.push([
          l ? l.name.trim() : '',
          l && !l.isHeader ? l.amount.toString() : '',
          a ? a.name.trim() : '',
          a && !a.isHeader ? a.amount.toString() : ''
        ]);
      });
      csvRows.push(['TOTAL LIABILITIES & EQUITY', totalLiabAndEquity.toString(), 'TOTAL ASSETS', totalAssets.toString()]);
    } else {
      csvRows.push(['Debit Particulars', 'Amount', 'Credit Particulars', 'Amount']);
      Array.from({ length: tradingMaxRows }).forEach((_, idx) => {
        const dr = tradingDebits[idx];
        const cr = tradingCredits[idx];
        csvRows.push([
          dr ? dr.name : '',
          dr ? dr.amount.toString() : '',
          cr ? cr.name : '',
          cr ? cr.amount.toString() : ''
        ]);
      });
    }

    let csvContent = '\uFEFF';
    csvContent += csvRows.map(row => row.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${company.name.replace(/[^a-zA-Z0-9]/g, '_')}_${filename}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="financial-print-modal-overlay fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="print-preview-dialog bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Top Control Bar (Hidden when printed) */}
        <div className="p-3.5 sm:p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0 no-print">
          
          {/* Left: Title & Report Selector Tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 mr-2">
              <span className="p-1.5 bg-indigo-600/20 text-indigo-400 rounded-lg border border-indigo-500/30">
                <Printer className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-sm font-black text-white leading-tight">
                  {isHindi ? 'A4 वित्तीय रिपोर्ट प्रिंटर' : 'A4 Financial Report Print & PDF'}
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">
                  Standard A4 (210 × 297 mm)
                </span>
              </div>
            </div>

            {/* In-Modal Report Switcher Tabs */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setCurrentReport('TRADING_PL')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  currentReport === 'TRADING_PL'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isHindi ? 'Trading & P&L' : 'Trading & P&L'}
              </button>
              <button
                type="button"
                onClick={() => setCurrentReport('BS')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  currentReport === 'BS'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isHindi ? 'Balance Sheet' : 'Balance Sheet'}
              </button>
              <button
                type="button"
                onClick={() => setCurrentReport('TB')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  currentReport === 'TB'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isHindi ? 'Trial Balance' : 'Trial Balance'}
              </button>
              <button
                type="button"
                onClick={() => setCurrentReport('SCH34')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition ${
                  currentReport === 'SCH34'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {isHindi ? 'Schedule III' : 'Schedule III'}
              </button>
            </div>

            {/* View Mode Toggle: Condensed vs Detailed */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setViewMode('condensed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'condensed' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
                title="Condensed Group Summary"
              >
                <span>{isHindi ? 'संक्षिप्त (Condensed)' : 'Condensed'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('detailed')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer ${
                  viewMode === 'detailed' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
                }`}
                title="Detailed All Ledgers"
              >
                <span>{isHindi ? 'विस्तृत (Detailed All)' : 'Detailed (All Ledgers)'}</span>
              </button>
            </div>

            {currentReport === 'TB' && (
              <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-[11px]">
                <label className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tbShowOpening}
                    onChange={(e) => setTbShowOpening(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  <span>{isHindi ? 'ओपनिंग' : 'Opening'}</span>
                </label>
                <label className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tbShowTransactions}
                    onChange={(e) => setTbShowTransactions(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  <span>{isHindi ? 'लेनदेन' : 'Txns'}</span>
                </label>
                <label className="flex items-center gap-1 text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tbShowClosing}
                    onChange={(e) => setTbShowClosing(e.target.checked)}
                    className="accent-indigo-500 rounded"
                  />
                  <span>{isHindi ? 'क्लोजिंग' : 'Closing'}</span>
                </label>
              </div>
            )}
          </div>

          {/* Right: Page Controls & Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            
            {/* Orientation Toggle */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  orientation === 'portrait' ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white'
                }`}
                title="A4 Portrait (210mm x 297mm)"
              >
                <span>📄 {isHindi ? 'पोर्ट्रेट' : 'Portrait'}</span>
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded-lg font-bold transition flex items-center gap-1 ${
                  orientation === 'landscape' ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white'
                }`}
                title="A4 Landscape (297mm x 210mm)"
              >
                <span>📃 {isHindi ? 'लैंडस्केप' : 'Landscape'}</span>
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
              <button
                type="button"
                onClick={() => setZoomScale(prev => Math.max(50, prev - 10))}
                className="px-1.5 py-1 text-slate-400 hover:text-white"
                title="Zoom Out"
              >
                -
              </button>
              <span className="px-1 font-bold">{zoomScale}%</span>
              <button
                type="button"
                onClick={() => setZoomScale(prev => Math.min(130, prev + 10))}
                className="px-1.5 py-1 text-slate-400 hover:text-white"
                title="Zoom In"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoomScale(100)}
                className="ml-1 px-1.5 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] rounded text-slate-300"
                title="Reset to 100% Actual A4 Size"
              >
                100%
              </button>
            </div>

            {/* Print Config Toggle */}
            <button
              type="button"
              onClick={() => setShowConfigPanel(prev => !prev)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl border transition cursor-pointer ${
                showConfigPanel
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isHindi ? 'प्रिंट सेटिंग्स' : 'Print Config'}</span>
            </button>

            {/* Download Real A4/A5 PDF (Direct .pdf file export) */}
            <button
              type="button"
              onClick={handleDownloadDirectA4Pdf}
              disabled={isGeneratingPdf}
              className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl shadow-lg transition transform active:scale-95 cursor-pointer disabled:opacity-60"
              title={isHindi ? 'वास्तविक PDF फाइल सीधे डाउनलोड करें' : 'Download real PDF file directly to device'}
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{isHindi ? 'PDF तैयार हो रहा है...' : 'Generating PDF...'}</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-white" />
                  <span>{isHindi ? 'PDF डाउनलोड करें' : 'Download PDF'}</span>
                </>
              )}
            </button>

            {/* Print / System Print Dialog */}
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-3 py-2 rounded-xl shadow transition cursor-pointer"
              title={isHindi ? 'सिस्टम प्रिंटर या ब्राउज़र प्रिंट डायलॉग खोलें' : 'Open system print dialog'}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isHindi ? 'प्रिंट' : 'Print'}</span>
            </button>

            {/* CSV / HTML Export Options */}
            <button
              type="button"
              onClick={handleExportCsv}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-xl border border-slate-700 transition"
              title="Export to Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleDownloadHtml}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded-xl border border-slate-700 transition"
              title="Download Standalone HTML"
            >
              <FileText className="w-4 h-4" />
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Collapsible Print Configuration Panel */}
        {showConfigPanel && (
          <PrintConfigPanel
            config={printConfig}
            onChange={handlePrintConfigChange}
            isHindi={isHindi}
            docKind="financial"
          />
        )}

        {/* Toast Notification */}
        {toastMsg && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow animate-fadeIn">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{toastMsg}</span>
            </div>
            <button onClick={() => setToastMsg(null)} className="p-1 hover:bg-emerald-700 rounded">
              ✕
            </button>
          </div>
        )}

        {/* Paper Canvas Work Area - Authentic Physical A4 Sheet */}
        <div className="a4-sheet-container flex-1 overflow-auto bg-slate-950 p-4 sm:p-8 flex justify-center items-start">
          
          <div 
            style={{ 
              transform: zoomScale !== 100 ? `scale(${zoomScale / 100})` : undefined,
              transformOrigin: 'top center'
            }}
            className="transition-transform duration-200"
          >
            {/* The Authentic Physical Sheet */}
            <div 
              ref={printSheetRef}
              id="printable-financial-statement"
              style={{
                fontSize: printConfig.printFontScale === 'compact' ? '92%' : printConfig.printFontScale === 'large' ? '108%' : undefined,
                padding: printConfig.printMargins === 'compact' ? '8mm' : printConfig.printMargins === 'wide' ? '18mm' : undefined
              }}
              className={`a4-sheet-paper ${orientation} ${printConfig.defaultPaperSize === 'A5' ? getPaperWidthClass('A5', orientation) : ''} printable-area rounded-sm text-slate-900 font-sans space-y-5`}
            >
              
              {/* 1. Official Letterhead / Corporate Header */}
              <div className="border-b-2 border-indigo-900 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3">
                  {printConfig.showCompanyLogoOnPrint && (
                    company.logoUrl ? (
                      <img 
                        src={company.logoUrl} 
                        alt={company.name} 
                        className="max-h-12 max-w-[130px] object-contain rounded"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-lg bg-indigo-900 text-white flex items-center justify-center font-black text-sm tracking-wider shadow">
                        {company.name.slice(0, 2).toUpperCase()}
                      </div>
                    )
                  )}
                  <div>
                    <h1 className="text-lg font-black text-indigo-950 uppercase tracking-tight leading-tight">
                      {company.name}
                    </h1>
                    <p className="text-[10px] text-slate-600 font-medium">
                      {company.address} {company.phone ? `| Ph: ${company.phone}` : ''} {company.email ? `| ${company.email}` : ''}
                    </p>
                    <p className="text-[10.5px] text-slate-700 font-bold">
                      GSTIN: {company.gstin || 'URP'} | PAN: {company.pan || 'N/A'} {company.stateCode ? `| State: ${company.stateCode}` : ''}
                    </p>
                  </div>
                </div>

                <div className="text-left sm:text-right text-[10.5px] text-slate-600 shrink-0">
                  <div className="text-xs font-black text-indigo-900 uppercase tracking-wide">
                    {getReportTitle()}
                  </div>
                  <div><b>Financial Period:</b> {periodLabel || getFinancialYearRange(company.financialYearStart).displayRange}</div>
                  <div><b>Generated:</b> {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  <div><b>Denomination:</b> All Figures in INR ({currency})</div>
                </div>
              </div>

              {/* 2. REPORT CONTENT BASED ON ACTIVE REPORT */}
              
              {/* TAB 1: TRADING & P&L */}
              {currentReport === 'TRADING_PL' && (
                <div className="space-y-5">
                  
                  {/* 1. Trading Account */}
                  <div>
                    <div className="bg-indigo-950 text-white font-bold px-3 py-1 rounded-t-md text-[11px] uppercase tracking-wider flex justify-between items-center">
                      <span>1. TRADING ACCOUNT SECTION (व्यापारिक खाता विवरण)</span>
                      <span className="text-[9.5px] text-indigo-200">For the period ended {new Date().toLocaleDateString('en-IN')}</span>
                    </div>
                    <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                          <th className="p-1.5 border border-slate-300 text-left w-[35%]">Dr. Particulars (डेबिट व्यय)</th>
                          <th className="p-1.5 border border-slate-300 text-right w-[15%]">Amount ({currency})</th>
                          <th className="p-1.5 border border-slate-300 text-left w-[35%]">Cr. Particulars (क्रेडिट आय)</th>
                          <th className="p-1.5 border border-slate-300 text-right w-[15%]">Amount ({currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: tradingMaxRows }).map((_, idx) => {
                          const dr = tradingDebits[idx];
                          const cr = tradingCredits[idx];
                          return (
                            <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                              <td className={`p-1.5 border border-slate-300 ${dr?.isBold ? 'font-bold' : ''}`}>
                                {dr ? dr.name : ''}
                              </td>
                              <td className={`p-1.5 border border-slate-300 text-right font-mono ${dr?.highlight === 'green' ? 'text-emerald-800 font-bold' : ''}`}>
                                {dr ? formatCurrency(dr.amount, currency) : ''}
                              </td>
                              <td className={`p-1.5 border border-slate-300 ${cr?.isBold ? 'font-bold' : ''}`}>
                                {cr ? cr.name : ''}
                              </td>
                              <td className={`p-1.5 border border-slate-300 text-right font-mono ${cr?.highlight === 'green' ? 'text-emerald-800 font-bold' : cr?.highlight === 'red' ? 'text-rose-800 font-bold' : ''}`}>
                                {cr ? formatCurrency(cr.amount, currency) : ''}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-b-2 border-slate-500">
                          <td className="p-1.5 border border-slate-300">TRADING TOTAL (DEBIT)</td>
                          <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(tradingTableTotal, currency)}</td>
                          <td className="p-1.5 border border-slate-300">TRADING TOTAL (CREDIT)</td>
                          <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(tradingTableTotal, currency)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 2. Profit & Loss Account */}
                  <div>
                    <div className="bg-indigo-950 text-white font-bold px-3 py-1 rounded-t-md text-[11px] uppercase tracking-wider flex justify-between items-center">
                      <span>2. PROFIT & LOSS ACCOUNT SECTION (लाभ व हानि विवरण)</span>
                      <span className="text-[9.5px] text-indigo-200">Net Profit / Loss Determination</span>
                    </div>
                    <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
                      <thead>
                        <tr className="bg-slate-100 font-bold text-slate-800 border-b border-slate-300">
                          <th className="p-1.5 border border-slate-300 text-left w-[35%]">Dr. Expenses (अप्रत्यक्ष व्यय)</th>
                          <th className="p-1.5 border border-slate-300 text-right w-[15%]">Amount ({currency})</th>
                          <th className="p-1.5 border border-slate-300 text-left w-[35%]">Cr. Income (अप्रत्यक्ष आय)</th>
                          <th className="p-1.5 border border-slate-300 text-right w-[15%]">Amount ({currency})</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: plMaxRows }).map((_, idx) => {
                          const dr = plDebits[idx];
                          const cr = plCredits[idx];
                          return (
                            <tr key={idx} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                              <td className={`p-1.5 border border-slate-300 ${dr?.isBold ? 'font-bold' : ''}`}>
                                {dr ? dr.name : ''}
                              </td>
                              <td className={`p-1.5 border border-slate-300 text-right font-mono ${dr?.highlight === 'green' ? 'text-emerald-800 font-bold' : dr?.highlight === 'red' ? 'text-rose-800 font-bold' : ''}`}>
                                {dr ? formatCurrency(dr.amount, currency) : ''}
                              </td>
                              <td className={`p-1.5 border border-slate-300 ${cr?.isBold ? 'font-bold' : ''}`}>
                                {cr ? cr.name : ''}
                              </td>
                              <td className={`p-1.5 border border-slate-300 text-right font-mono ${cr?.highlight === 'green' ? 'text-emerald-800 font-bold' : cr?.highlight === 'red' ? 'text-rose-800 font-bold' : ''}`}>
                                {cr ? formatCurrency(cr.amount, currency) : ''}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-b-2 border-slate-500">
                          <td className="p-1.5 border border-slate-300">P&L TOTAL (DEBIT)</td>
                          <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(plTableTotal, currency)}</td>
                          <td className="p-1.5 border border-slate-300">P&L TOTAL (CREDIT)</td>
                          <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(plTableTotal, currency)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {/* TAB 2: BALANCE SHEET */}
              {currentReport === 'BS' && (
                <div className="space-y-4">
                  <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
                    <thead>
                      <tr className="bg-indigo-950 text-white font-bold">
                        <th className="p-2 border border-slate-300 text-left w-[35%]">Liabilities & Capital (पूंजी व दायित्व)</th>
                        <th className="p-2 border border-slate-300 text-right w-[15%]">Amount ({currency})</th>
                        <th className="p-2 border border-slate-300 text-left w-[35%]">Assets & Properties (संपत्तियां व प्राप्य)</th>
                        <th className="p-2 border border-slate-300 text-right w-[15%]">Amount ({currency})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: bsMaxRows }).map((_, idx) => {
                        const l = bsLiabilities[idx];
                        const a = bsAssets[idx];
                        const isLHeader = l?.isHeader;
                        const isAHeader = a?.isHeader;

                        return (
                          <tr key={idx} className={(isLHeader || isAHeader) ? 'bg-slate-100 font-bold' : idx % 2 === 1 ? 'bg-slate-50/60' : ''}>
                            <td className={`p-1.5 border border-slate-300 ${l?.isBold ? 'font-bold' : ''}`}>
                              {l ? l.name : ''}
                            </td>
                            <td className={`p-1.5 border border-slate-300 text-right font-mono ${l?.highlight === 'green' ? 'text-emerald-800 font-bold' : l?.highlight === 'red' ? 'text-rose-800 font-bold' : ''}`}>
                              {l && !isLHeader ? formatCurrency(l.amount, currency) : ''}
                            </td>
                            <td className={`p-1.5 border border-slate-300 ${a?.isBold ? 'font-bold' : ''}`}>
                              {a ? a.name : ''}
                            </td>
                            <td className={`p-1.5 border border-slate-300 text-right font-mono ${a?.highlight === 'green' ? 'text-emerald-800 font-bold' : ''}`}>
                              {a && !isAHeader ? formatCurrency(a.amount, currency) : ''}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-b-2 border-slate-500">
                        <td className="p-2 border border-slate-300">TOTAL LIABILITIES & CAPITAL</td>
                        <td className="p-2 border border-slate-300 text-right font-mono text-xs">{formatCurrency(totalLiabAndEquity, currency)}</td>
                        <td className="p-2 border border-slate-300">TOTAL ASSETS</td>
                        <td className="p-2 border border-slate-300 text-right font-mono text-xs">{formatCurrency(totalAssets, currency)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {Math.abs(bsDifference) > 0.05 ? (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[10px] font-semibold">
                      ⚠️ <b>Unreconciled Variance:</b> {formatCurrency(Math.abs(bsDifference), currency)} (Please review ledger opening balances or suspense vouchers).
                    </div>
                  ) : (
                    <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[10px] font-bold flex items-center justify-between">
                      <span>✅ Balance Sheet is 100% Mathematically Balanced (Assets = Liabilities + Equity)</span>
                      <span className="font-mono text-slate-600">Variance: ₹0.00</span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: TRIAL BALANCE */}
              {currentReport === 'TB' && (() => {
                const showClose = tbShowClosing || (!tbShowOpening && !tbShowTransactions);
                return (
                <div className="space-y-4">
                  <table className="w-full border-collapse border border-slate-300 text-[10px]">
                    <thead>
                      <tr className="bg-indigo-950 text-white font-bold">
                        <th className="p-1.5 border border-slate-300 text-left">{viewMode === 'condensed' ? '#' : 'Code'}</th>
                        <th className="p-1.5 border border-slate-300 text-left">{viewMode === 'condensed' ? 'Account Group / Head' : 'Account Head Name'}</th>
                        <th className="p-1.5 border border-slate-300 text-left">Category</th>
                        {tbShowOpening && (
                          <>
                            <th className="p-1.5 border border-slate-300 text-right">Opening DR</th>
                            <th className="p-1.5 border border-slate-300 text-right">Opening CR</th>
                          </>
                        )}
                        {tbShowTransactions && (
                          <>
                            <th className="p-1.5 border border-slate-300 text-right">Txns DR</th>
                            <th className="p-1.5 border border-slate-300 text-right">Txns CR</th>
                          </>
                        )}
                        {showClose && (
                          <>
                            <th className="p-1.5 border border-slate-300 text-right">Closing DR</th>
                            <th className="p-1.5 border border-slate-300 text-right">Closing CR</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {viewMode === 'condensed' ? (
                        condensedTbGroups.map((g, idx) => (
                          <tr key={g.groupName} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                            <td className="p-1.5 border border-slate-300 font-mono font-bold text-slate-800">{idx + 1}</td>
                            <td className="p-1.5 border border-slate-300 font-bold">
                              {g.groupName} <span className="font-normal text-[9px] text-slate-500">({g.count})</span>
                            </td>
                            <td className="p-1.5 border border-slate-300 text-slate-600 text-[9.5px]">{g.category}</td>
                            {tbShowOpening && (
                              <>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{g.openDr > 0.001 ? formatCurrency(g.openDr, currency) : '-'}</td>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{g.openCr > 0.001 ? formatCurrency(g.openCr, currency) : '-'}</td>
                              </>
                            )}
                            {tbShowTransactions && (
                              <>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{g.txDr > 0.001 ? formatCurrency(g.txDr, currency) : '-'}</td>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{g.txCr > 0.001 ? formatCurrency(g.txCr, currency) : '-'}</td>
                              </>
                            )}
                            {showClose && (
                              <>
                                <td className="p-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800">{g.dr > 0.001 ? formatCurrency(g.dr, currency) : '-'}</td>
                                <td className="p-1.5 border border-slate-300 text-right font-mono font-bold text-indigo-800">{g.cr > 0.001 ? formatCurrency(g.cr, currency) : '-'}</td>
                              </>
                            )}
                          </tr>
                        ))
                      ) : (
                        tbDetailedEntries.map(({ bal, openDr, openCr, txDr, txCr, closeDr, closeCr }, idx) => (
                          <tr key={bal.account.id} className={idx % 2 === 1 ? 'bg-slate-50/70' : ''}>
                            <td className="p-1.5 border border-slate-300 font-mono font-bold text-slate-800">{bal.account.code}</td>
                            <td className="p-1.5 border border-slate-300 font-semibold">{bal.account.name}</td>
                            <td className="p-1.5 border border-slate-300 text-slate-600 text-[9.5px]">{bal.account.category}</td>
                            {tbShowOpening && (
                              <>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{openDr > 0.001 ? formatCurrency(openDr, currency) : '-'}</td>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{openCr > 0.001 ? formatCurrency(openCr, currency) : '-'}</td>
                              </>
                            )}
                            {tbShowTransactions && (
                              <>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{txDr > 0.001 ? formatCurrency(txDr, currency) : '-'}</td>
                                <td className="p-1.5 border border-slate-300 text-right font-mono">{txCr > 0.001 ? formatCurrency(txCr, currency) : '-'}</td>
                              </>
                            )}
                            {showClose && (
                              <>
                                <td className="p-1.5 border border-slate-300 text-right font-mono font-bold text-emerald-800">{closeDr > 0.001 ? formatCurrency(closeDr, currency) : '-'}</td>
                                <td className="p-1.5 border border-slate-300 text-right font-mono font-bold text-indigo-800">{closeCr > 0.001 ? formatCurrency(closeCr, currency) : '-'}</td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                      <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-b-2 border-slate-500">
                        <td colSpan={3} className="p-2 border border-slate-300 text-left">GRAND TOTAL TRIAL BALANCE</td>
                        {tbShowOpening && (
                          <>
                            <td className="p-2 border border-slate-300 text-right font-mono text-[10.5px]">{formatCurrency(totalTbOpenDr, currency)}</td>
                            <td className="p-2 border border-slate-300 text-right font-mono text-[10.5px]">{formatCurrency(totalTbOpenCr, currency)}</td>
                          </>
                        )}
                        {tbShowTransactions && (
                          <>
                            <td className="p-2 border border-slate-300 text-right font-mono text-[10.5px]">{formatCurrency(totalTbTxDr, currency)}</td>
                            <td className="p-2 border border-slate-300 text-right font-mono text-[10.5px]">{formatCurrency(totalTbTxCr, currency)}</td>
                          </>
                        )}
                        {showClose && (
                          <>
                            <td className="p-2 border border-slate-300 text-right font-mono text-[10.5px]">{formatCurrency(totalTbDr, currency)}</td>
                            <td className="p-2 border border-slate-300 text-right font-mono text-[10.5px]">{formatCurrency(totalTbCr, currency)}</td>
                          </>
                        )}
                      </tr>
                    </tbody>
                  </table>

                  {Math.abs(totalTbDr - totalTbCr) < 0.05 ? (
                    <div className="p-1.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-[10px] font-bold">
                      ✅ Trial Balance is 100% Balanced (Total Debits match Total Credits).
                    </div>
                  ) : (
                    <div className="p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 text-[10px] font-semibold">
                      ⚠️ <b>Trial Balance Variance:</b> {formatCurrency(Math.abs(totalTbDr - totalTbCr), currency)}.
                    </div>
                  )}
                </div>
                );
              })()}

              {/* TAB 4: SCHEDULE III / IV */}
              {currentReport === 'SCH34' && (
                <div className="space-y-4">
                  <div className="bg-slate-100 p-2.5 rounded border text-slate-700 text-[10.5px]">
                    <b>Corporate Statutory Form (Companies Act 2013 / Income Tax Rules):</b> Detailed Schedule III Part I (Balance Sheet) & Part II (Statement of Profit and Loss) Classification.
                  </div>
                  <table className="w-full border-collapse border border-slate-300 text-[10.5px]">
                    <thead>
                      <tr className="bg-indigo-950 text-white font-bold">
                        <th className="p-1.5 border border-slate-300 text-left">Particulars</th>
                        <th className="p-1.5 border border-slate-300 text-center w-24">Note No.</th>
                        <th className="p-1.5 border border-slate-300 text-right w-36">Current Year ({currency})</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="bg-slate-100 font-bold">
                        <td colSpan={3} className="p-1.5 border border-slate-300">I. EQUITY AND LIABILITIES</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 border border-slate-300 pl-6">(1) Shareholders / Partners Funds</td>
                        <td className="p-1.5 border border-slate-300 text-center font-mono">1</td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono font-bold">{formatCurrency(totalCapitalEquity + netProfit, currency)}</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 border border-slate-300 pl-6">(2) Non-Current Liabilities</td>
                        <td className="p-1.5 border border-slate-300 text-center font-mono">2</td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(nonCurrentLiabTotal, currency)}</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 border border-slate-300 pl-6">(3) Current Liabilities (Trade Payables, Other Current Liab)</td>
                        <td className="p-1.5 border border-slate-300 text-center font-mono">3</td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(currentLiabTotal, currency)}</td>
                      </tr>
                      <tr className="bg-slate-200 font-black">
                        <td className="p-1.5 border border-slate-300">TOTAL EQUITY AND LIABILITIES</td>
                        <td className="p-1.5 border border-slate-300 text-center"></td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono text-xs">{formatCurrency(totalLiabAndEquity, currency)}</td>
                      </tr>
                      <tr className="bg-slate-100 font-bold">
                        <td colSpan={3} className="p-1.5 border border-slate-300">II. ASSETS</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 border border-slate-300 pl-6">(1) Non-Current Assets (Property, Plant & Equipment)</td>
                        <td className="p-1.5 border border-slate-300 text-center font-mono">4</td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(fixedAssetsTotal, currency)}</td>
                      </tr>
                      <tr>
                        <td className="p-1.5 border border-slate-300 pl-6">(2) Current Assets (Inventories, Trade Receivables, Cash & Bank)</td>
                        <td className="p-1.5 border border-slate-300 text-center font-mono">5</td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono">{formatCurrency(otherAssetsTotal + closingStock, currency)}</td>
                      </tr>
                      <tr className="bg-slate-200 font-black">
                        <td className="p-1.5 border border-slate-300">TOTAL ASSETS</td>
                        <td className="p-1.5 border border-slate-300 text-center"></td>
                        <td className="p-1.5 border border-slate-300 text-right font-mono text-xs">{formatCurrency(totalAssets, currency)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* 3. Official Signatures & Seal */}
              {printConfig.showAuthorizedSignatory && (
                <div className="pt-6 flex justify-between items-end text-[10.5px] text-slate-700 border-t border-slate-300 mt-6 footer">
                  <div className="text-center w-44">
                    <div className="w-full border-b border-slate-400 mb-1.5 h-8"></div>
                    <span className="font-bold">Prepared By Accountant</span>
                  </div>
                  <div className="text-center w-44">
                    <div className="w-full border-b border-slate-400 mb-1.5 h-8"></div>
                    <span className="font-bold">Internal Auditor / CA</span>
                  </div>
                  <div className="text-center w-52">
                    <div className="w-full border-b border-slate-400 mb-1.5 h-8"></div>
                    <span className="font-bold text-slate-900 block">For {company.name}</span>
                    <span className="text-[9.5px] text-slate-500">Authorized Signatory & Seal</span>
                  </div>
                </div>
              )}

              {/* 4. Physical Sheet Bottom Micro-Footer */}
              <div className="pt-2 text-[9px] text-slate-400 border-t border-slate-200 flex justify-between items-center font-mono">
                <span>Page 1 of 1 • System Generated by HisabVeda ERP</span>
                <span>Confidential Statutory Financial Statement</span>
              </div>

            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
