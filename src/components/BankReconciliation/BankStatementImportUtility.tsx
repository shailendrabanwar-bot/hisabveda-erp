import React, { useState, useRef, useMemo, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  FileSpreadsheet, 
  ClipboardPaste, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  AlertTriangle, 
  Sparkles, 
  Check, 
  X, 
  Trash2, 
  ArrowRight, 
  Landmark, 
  Search, 
  RefreshCw, 
  Plus, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  TrendingUp, 
  TrendingDown, 
  Layers,
  ArrowRightLeft,
  HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AppData, BankStatementLine, Account } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { isCashOrBankLedger } from '../../utils/accounting';
import { 
  normalizeAndAuditBankTransactions, 
  parseTabularBankStatementText, 
  parseMultiPageBankStatement,
  parseStructuredSpreadsheetRows,
  parseCsvOrTsvText,
  calculateBankStatementSummary,
  getLineMathProof,
  autoAlignStatementLinesWithMath,
  NON_TRANSACTION_METADATA_REGEX,
  ACCOUNT_METADATA_REGEX,
  AuditedBankTransaction,
  RawBankTransaction
} from '../../utils/bankStatementAuditor';
import {
  isStrictBankLedger,
  validateBankStatementIdentity,
  isDateInFinancialYear,
  getFinancialYearRange,
  isDuplicateStatementLine,
  normalizeDateISO
} from '../../utils/fiscalYear';
import { resolveApiUrl } from '../../utils/apiBase';

// Configure PDF.js worker reliably for Vite and offline/online environments
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface BankStatementImportUtilityProps {
  data: AppData;
  isHindi: boolean;
  onImportStatementLines: (lines: BankStatementLine[]) => void;
  onPostBankVouchersBatch?: (lines: BankStatementLine[], bankAccountId: string) => void;
  onCreateBankLedgerQuick?: (bankName: string, accountNumber?: string) => void;
  onClose: () => void;
}

type ImportSourceTab = 'PDF' | 'EXCEL' | 'PASTE';

export const BankStatementImportUtility: React.FC<BankStatementImportUtilityProps> = ({
  data,
  isHindi,
  onImportStatementLines,
  onPostBankVouchersBatch,
  onCreateBankLedgerQuick,
  onClose
}) => {
  // Navigation & State
  const [activeSourceTab, setActiveSourceTab] = useState<ImportSourceTab>('PDF');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  
  // File & Password
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  const [isPasswordRequired, setIsPasswordRequired] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [rawPastedText, setRawPastedText] = useState('');

  // Strict Bank Ledgers Only (excludes Cash in Hand)
  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const bankAccounts = useMemo(() => {
    return data.accounts.filter(isStrictBankLedger);
  }, [data.accounts]);

  const [targetBankAccountId, setTargetBankAccountId] = useState<string>(
    bankAccounts[0]?.id || ''
  );

  useEffect(() => {
    if (bankAccounts.length > 0 && !bankAccounts.some(b => b.id === targetBankAccountId)) {
      setTargetBankAccountId(bankAccounts[0].id);
    } else if (bankAccounts.length === 0 && targetBankAccountId !== '') {
      setTargetBankAccountId('');
    }
  }, [bankAccounts, targetBankAccountId]);

  const selectedBankLedger = useMemo(() => {
    return bankAccounts.find(b => b.id === targetBankAccountId);
  }, [bankAccounts, targetBankAccountId]);

  const [newBankName, setNewBankName] = useState(data.company.bankName || '');
  const [newBankAccNo, setNewBankAccNo] = useState(data.company.accountNumber || '');
  const [showAddBankModal, setShowAddBankModal] = useState(false);

  // Extracted Lines & Review State
  const [parsedLines, setParsedLines] = useState<BankStatementLine[]>([]);
  const [selectedLineIds, setSelectedLineIds] = useState<Set<string>>(new Set());
  const [searchFilter, setSearchFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [bankQuickErr, setBankQuickErr] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suspense / Counter Ledger (Never fall back to Cash/Bank or Group accounts)
  const suspenseAccount = useMemo(() => {
    const nonMoneyLeafs = data.accounts.filter(a => !a.isGroup && !isCashOrBankLedger(a));
    return (
      nonMoneyLeafs.find(a => a.id === 'acc_suspense' || a.name.toLowerCase().includes('suspense')) ||
      nonMoneyLeafs[0] ||
      data.accounts.find(a => !a.isGroup && a.id !== selectedBankLedger?.id)
    );
  }, [data.accounts, selectedBankLedger?.id]);

  // Strict Identity, Financial Year & Duplicate Verifier before accepting extracted lines
  const verifyAndFilterExtractedLines = (
    statementLines: BankStatementLine[],
    headerText: string
  ): { accepted: BankStatementLine[]; outOfFyCount: number; dupCount: number } => {
    const identityCheck = validateBankStatementIdentity(
      headerText,
      data.company,
      selectedBankLedger,
      data.accounts
    );
    if (!identityCheck.valid) {
      setParsedLines([]);
      setSelectedLineIds(new Set());
      throw new Error(
        (isHindi ? identityCheck.reasonHindi : identityCheck.reason) ||
          identityCheck.reason ||
          'Bank statement does not match company bank ledger.'
      );
    }

    const validAmtLines = statementLines
      .map(l => ({ ...l, date: normalizeDateISO(l.date) || l.date }))
      .filter(l => l.amount > 0);

    if (validAmtLines.length === 0) {
      throw new Error(isHindi ? 'कोई वैध सकारात्मक राशि वाला ट्रांजैक्शन नहीं मिला।' : 'No valid positive-amount transactions found.');
    }

    const inFyLines = validAmtLines.filter(l => isDateInFinancialYear(l.date, fyRange.fyStart));
    const outOfFyCount = validAmtLines.length - inFyLines.length;

    if (inFyLines.length === 0) {
      setParsedLines([]);
      setSelectedLineIds(new Set());
      throw new Error(
        isHindi
          ? `🚫 वित्तीय वर्ष मेल नहीं खाया: इस स्टेटमेंट की सभी ${validAmtLines.length} प्रविष्टियाँ सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) से बाहर की हैं। पुराना स्टेटमेंट देखने/इम्पोर्ट करने के लिए ऊपर हेडर से वित्तीय वर्ष बदलें।`
          : `🚫 Financial Year Mismatch: All ${validAmtLines.length} transactions are outside active ${fyRange.label} (${fyRange.displayRange}). Switch Financial Year in header to import older statements.`
      );
    }

    const nonDupLines = inFyLines.filter(l => !isDuplicateStatementLine(l, data.bankStatements || []));
    const dupCount = inFyLines.length - nonDupLines.length;

    if (nonDupLines.length === 0 && dupCount > 0) {
      setParsedLines([]);
      setSelectedLineIds(new Set());
      throw new Error(
        isHindi
          ? `⚠️ इस स्टेटमेंट की सभी ${dupCount} प्रविष्टियाँ पहले ही BRS में इम्पोर्ट हो चुकी हैं (Duplicate Entry Blocked)।`
          : `⚠️ All ${dupCount} entries in this statement are already imported in BRS (Duplicate Entry Blocked).`
      );
    }

    return { accepted: nonDupLines, outOfFyCount, dupCount };
  };

  // Executive Statement Summary
  const statementSummary = useMemo(() => {
    const auditedList: AuditedBankTransaction[] = parsedLines.map(l => ({
      date: l.date,
      description: l.description,
      debit: l.type === 'DEBIT' ? l.amount : 0,
      credit: l.type === 'CREDIT' ? l.amount : 0,
      amount: l.amount,
      type: l.type,
      runningBalance: l.runningBalance,
      referenceNo: l.referenceNo,
      auditTag: 'UI_CALC'
    }));
    return calculateBankStatementSummary(auditedList);
  }, [parsedLines]);

  // Filtered Lines
  const visibleLines = useMemo(() => {
    return parsedLines.filter(line => {
      const matchType = typeFilter === 'ALL' || line.type === typeFilter;
      const q = searchFilter.toLowerCase().trim();
      const matchSearch = !q || 
        line.description.toLowerCase().includes(q) ||
        (line.referenceNo && line.referenceNo.toLowerCase().includes(q)) ||
        line.date.includes(q) ||
        line.amount.toString().includes(q);
      return matchType && matchSearch;
    });
  }, [parsedLines, typeFilter, searchFilter]);

  // Convert Audited List to BankStatementLine format with intelligent counter-ledger suggestion
  const convertAuditedToStatementLines = (audited: AuditedBankTransaction[]): BankStatementLine[] => {
    return audited.map((tx, idx) => {
      const descLower = tx.description.toLowerCase();
      let matchedAcc = suspenseAccount;

      // 1. Bank Charges
      if (tx.type === 'DEBIT' && (descLower.includes('charge') || descLower.includes('chg') || descLower.includes('sms') || descLower.includes('annual fee') || descLower.includes('atm fee'))) {
        const bankChargeAcc = data.accounts.find(a => a.name.toLowerCase().includes('bank charge') || a.name.toLowerCase().includes('charges'));
        if (bankChargeAcc) matchedAcc = bankChargeAcc;
      }
      // 2. Bank Interest
      else if (tx.type === 'CREDIT' && (descLower.includes('interest') || descLower.includes('int.pd') || descLower.includes('int pd') || descLower.includes('fd int'))) {
        const interestAcc = data.accounts.find(a => a.name.toLowerCase().includes('interest') || a.name.toLowerCase().includes('income'));
        if (interestAcc) matchedAcc = interestAcc;
      }
      // 3. Cash Withdrawal / Deposit
      else if (descLower.includes('atm wdl') || descLower.includes('cash wdl') || descLower.includes('self') || descLower.includes('cash dep')) {
        const cashAcc = data.accounts.find(a => a.code === '1010' || a.name.toLowerCase().includes('cash in hand') || a.name.toLowerCase() === 'cash');
        if (cashAcc) matchedAcc = cashAcc;
      }
      // 4. Salary / Payroll
      else if (descLower.includes('salary') || descLower.includes('payroll')) {
        const salAcc = data.accounts.find(a => a.id === 'acc_net_salary_payable' || a.name.toLowerCase().includes('salary'));
        if (salAcc) matchedAcc = salAcc;
      }
      // 5. Party Search
      else if (data.parties && data.parties.length > 0) {
        for (const party of data.parties) {
          const pName = party.name.toLowerCase().trim();
          if (pName.length >= 3 && descLower.includes(pName)) {
            const partyAcc = data.accounts.find(a => a.name.toLowerCase().includes(pName)) ||
                             data.accounts.find(a => party.type === 'CUSTOMER' ? a.id === 'acc_debtors' : a.id === 'acc_creditors');
            if (partyAcc) {
              matchedAcc = partyAcc;
              break;
            }
          }
        }
      }

      return {
        id: `stmt_row_${Date.now()}_${idx}`,
        date: tx.date,
        description: tx.description,
        referenceNo: tx.referenceNo || '',
        type: tx.type,
        amount: tx.amount,
        runningBalance: tx.runningBalance,
        reconciled: false,
        isReconciled: false,
        allocatedAccountId: matchedAcc?.id || 'acc_suspense',
        allocatedAccountName: matchedAcc?.name || 'Suspense Account'
      };
    });
  };

  // 1. PDF Statement Text & Spatial Extractor
  const extractPdfSpatialText = async (file: File, password?: string): Promise<{ text: string; pages: string[]; pageImages: string[]; structuredTxs: AuditedBankTransaction[] }> => {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      password: password || undefined,
      standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
    });

    const pdfDoc = await loadingTask.promise;
    const numPages = pdfDoc.numPages;
    const pageTexts: string[] = [];
    const pageImages: string[] = [];
    const rawStructuredList: RawBankTransaction[] = [];

    // Global column positions discovered across pages
    let globalXDate = -1;
    let globalXDesc = -1;
    let globalXRef = -1;
    let globalXDr = -1;
    let globalXCr = -1;
    let globalXBal = -1;
    let lastSeenDate = '';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);

      // Render page to canvas image for multimodal AI Vision extraction
      try {
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          await (page as any).render({ canvasContext: ctx, canvas, viewport }).promise;
          const imgData = canvas.toDataURL('image/jpeg', 0.85);
          pageImages.push(imgData);
        }
      } catch (renderErr) {
        console.warn(`[BankImport] Could not render page ${pageNum} to canvas:`, renderErr);
      }

      const textContent = await page.getTextContent();
      
      if (textContent && textContent.items && textContent.items.length > 0) {
        const items = (textContent.items as any[]).filter(it => it.str && it.str.trim().length > 0);
        
        // Sort all items top-to-bottom first
        const sortedItems = [...items].sort((a, b) => (b.transform?.[5] || 0) - (a.transform?.[5] || 0));

        // Group text items by Y-coordinate into clean table rows
        const rowsMap: Array<{ y: number; items: any[] }> = [];
        for (const item of sortedItems) {
          const itemY = item.transform ? item.transform[5] : 0;
          let targetRow = rowsMap.find(r => Math.abs(r.y - itemY) <= 4.5);
          if (!targetRow) {
            targetRow = { y: itemY, items: [] };
            rowsMap.push(targetRow);
          }
          targetRow.items.push(item);
        }

        // Sort top-to-bottom
        rowsMap.sort((a, b) => b.y - a.y);

        const pageLines: string[] = [];
        let pageXDate = -1, pageXDesc = -1, pageXRef = -1, pageXDr = -1, pageXCr = -1, pageXBal = -1;

        for (const row of rowsMap) {
          // Sort left-to-right
          row.items.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
          
          let rowText = '';
          let lastX = -1;
          for (const it of row.items) {
            const str = String(it.str).trim();
            const x = it.transform ? it.transform[4] : 0;
            if (lastX >= 0) {
              const gap = x - lastX;
              if (gap > 15) {
                rowText += '\t';
              } else if (gap > 4) {
                rowText += '  ';
              } else {
                rowText += ' ';
              }
            }
            rowText += str;
            lastX = x + (it.width || (str.length * 5));
          }

          if (rowText.trim()) {
            pageLines.push(rowText.trim());
          }

          // Check if this row is a Table Header row
          const rowUpper = rowText.toUpperCase();
          const hasDateHdr = /(^|\b)(DATE|TXN\s*DATE|POST\s*DATE|VALUE\s*DATE|TRAN\s*DATE)(\b|$)/i.test(rowUpper);
          const hasDrHdr = /(^|\b)(WITHDRAWAL|WITHDRAWALS|DEBIT|DEBITS|DR|DR\s*AMT|PAID\s*OUT)(\b|$)/i.test(rowUpper);
          const hasCrHdr = /(^|\b)(DEPOSIT|DEPOSITS|CREDIT|CREDITS|CR|CR\s*AMT|PAID\s*IN)(\b|$)/i.test(rowUpper);
          const hasBalHdr = /(^|\b)(BALANCE|CLOSING|BAL|RUNNING\s*BAL|NET\s*BALANCE)(\b|$)/i.test(rowUpper);

          if (hasDateHdr && (hasDrHdr || hasCrHdr || hasBalHdr)) {
            for (const it of row.items) {
              const u = String(it.str).trim().toUpperCase();
              const itX = it.transform ? it.transform[4] : 0;
              if (/\b(TXN\s*DATE|VALUE\s*DATE|POST\s*DATE|TRAN\s*DATE|^DATE$)\b/i.test(u) && pageXDate === -1) pageXDate = itX;
              else if (/\b(PARTICULARS?|NARRATION|DESCRIPTION|REMARKS|DETAILS)\b/i.test(u) && pageXDesc === -1) pageXDesc = itX;
              else if (/\b(CHQ|CHEQUE|REF|UTR|INSTRUMENT)\b/i.test(u) && pageXRef === -1) pageXRef = itX;
              else if (/\b(WITHDRAWALS?|DEBITS?|DR|PAID\s*OUT)\b/i.test(u) && pageXDr === -1) pageXDr = itX;
              else if (/\b(DEPOSITS?|CREDITS?|CR|PAID\s*IN)\b/i.test(u) && pageXCr === -1) pageXCr = itX;
              else if (/\b(BALANCE|CLOSING|BAL)\b/i.test(u) && pageXBal === -1) pageXBal = itX;
            }

            if (pageXDate >= 0) globalXDate = pageXDate;
            if (pageXDesc >= 0) globalXDesc = pageXDesc;
            if (pageXRef >= 0) globalXRef = pageXRef;
            if (pageXDr >= 0) globalXDr = pageXDr;
            if (pageXCr >= 0) globalXCr = pageXCr;
            if (pageXBal >= 0) globalXBal = pageXBal;
            continue; // Skip header row from transactions
          }

          // Use page or global column positions
          const colXDr = pageXDr >= 0 ? pageXDr : globalXDr;
          const colXCr = pageXCr >= 0 ? pageXCr : globalXCr;
          const colXBal = pageXBal >= 0 ? pageXBal : globalXBal;
          const colXDesc = pageXDesc >= 0 ? pageXDesc : globalXDesc;
          const colXRef = pageXRef >= 0 ? pageXRef : globalXRef;

          // Check if row has a transaction date (supports slash, dash, dot, or space separators)
          const dateMatch = rowText.match(/\b(\d{1,2})[\s\/\-\.]([a-zA-Z]{3,9}|\d{1,2})[\s\/\-\.](\d{2,4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b|\b([a-zA-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/);
          
          if (
            dateMatch &&
            !NON_TRANSACTION_METADATA_REGEX.test(rowUpper) && 
            !ACCOUNT_METADATA_REGEX.test(rowUpper) &&
            !ACCOUNT_METADATA_REGEX.test(rowText) &&
            !/OPENING\s*BAL|BROUGHT\s*FWD|BAL\s*B\/F|BAL\s*B\/D/i.test(rowUpper) &&
            !/^\s*(ACCOUNT\s*OPEN|JOINT\s*HOLDER|NOMINEE|KYC|STATEMENT\s*PERIOD|CUSTOMER\s*ID|CIF\s*NO)/i.test(rowUpper)
          ) {
            let rowDate = dateMatch[0];
            let rowDesc = '';
            let rowRef = '';
            let rowDebit = 0;
            let rowCredit = 0;
            let rowBalance: number | undefined = undefined;

            if (colXDr >= 0 && colXCr >= 0) {
              // Exact Order-Independent Column Geometry Classification with Centroid Distance Matching
              const colCenterDr = colXDr + 20;
              const colCenterCr = colXCr + 20;
              const colCenterBal = colXBal >= 0 ? colXBal + 20 : -1;
              const colCenterRef = colXRef >= 0 ? colXRef + 15 : -1;
              const colCenterDate = (pageXDate >= 0 ? pageXDate : globalXDate) >= 0 ? (pageXDate >= 0 ? pageXDate : globalXDate) + 20 : -1;

              for (const it of row.items) {
                const str = String(it.str).trim();
                const x = it.transform ? it.transform[4] : 0;
                const width = it.width || (str.length * 6);
                const xMid = x + (width / 2);
                const cleanNum = str.replace(/,/g, '');
                const numVal = parseFloat(cleanNum);
                const isNum = !isNaN(numVal) && numVal > 0 && /\d/.test(str);
                const isPureRefInteger = !str.includes('.') && cleanNum.length >= 5 && cleanNum.length <= 9;

                // Distances to column centroids
                const distDr = Math.abs(xMid - colCenterDr);
                const distCr = Math.abs(xMid - colCenterCr);
                const distBal = colCenterBal >= 0 ? Math.abs(xMid - colCenterBal) : 9999;
                const distRef = colCenterRef >= 0 ? Math.abs(xMid - colCenterRef) : 9999;
                const distDate = colCenterDate >= 0 ? Math.abs(xMid - colCenterDate) : 9999;

                if (distDate < 45 && str.match(/\d/) && !str.includes('.') && (str.includes('/') || str.includes('-') || str.includes('.') || str.length <= 10)) {
                  // Date column
                  if (str.match(/\d{2}/)) rowDate = str;
                } else if (isNum && colCenterBal >= 0 && distBal < distDr && distBal < distCr && distBal < 65) {
                  // Balance Column
                  rowBalance = numVal;
                } else if (isPureRefInteger && distRef < distDr && distRef < distCr && distRef < 50) {
                  // Cheque / Reference Number column
                  rowRef = cleanNum;
                } else if (isNum && distDr <= distCr && distDr < 65) {
                  // Debit Column (Money Withdrawn)
                  rowDebit = numVal;
                } else if (isNum && distCr < distDr && distCr < 65) {
                  // Credit Column (Money Deposited)
                  rowCredit = numVal;
                } else if (colCenterRef >= 0 && distRef < 40 && !str.includes('.')) {
                  // Cheque / Ref Column
                  rowRef = str;
                } else if (!isNum) {
                  rowDesc += (rowDesc ? ' ' : '') + str;
                }
              }

              if (rowDebit > 0 || rowCredit > 0 || rowBalance !== undefined) {
                const txType = rowCredit > 0 && rowDebit === 0 ? 'CREDIT' : (rowDebit > 0 && rowCredit === 0 ? 'DEBIT' : (rowCredit > rowDebit ? 'CREDIT' : 'DEBIT'));
                const txAmt = txType === 'CREDIT' ? (rowCredit || rowDebit) : (rowDebit || rowCredit);
                
                if (txAmt > 0) {
                  rawStructuredList.push({
                    date: rowDate,
                    description: rowDesc || 'Bank Transaction',
                    referenceNo: rowRef,
                    debit: txType === 'DEBIT' ? txAmt : 0,
                    credit: txType === 'CREDIT' ? txAmt : 0,
                    amount: txAmt,
                    type: txType,
                    runningBalance: rowBalance,
                    auditTag: txType === 'CREDIT' ? 'EXPLICIT_CREDIT_COL' : 'EXPLICIT_DEBIT_COL'
                  });
                }
              }
            } else {
              // Fallback row parser when explicit column headers weren't found
              const rowNums: number[] = [];
              for (const it of row.items) {
                const str = String(it.str).trim();
                const clean = str.replace(/,/g, '');
                const n = parseFloat(clean);
                if (!isNaN(n) && n > 0 && /\d/.test(str)) {
                  if (!str.includes('.') && n >= 2020 && n <= 2035) continue; // Skip year
                  // Check if integer ref number
                  if (!str.includes('.') && clean.length >= 5 && clean.length <= 8 && !rowRef) {
                    rowRef = clean;
                    continue;
                  }
                  rowNums.push(n);
                } else {
                  rowDesc += (rowDesc ? ' ' : '') + str;
                }
              }
              if (rowNums.length >= 1) {
                const isCr = /(\b(CR|\(CR\)|\(C\)|CREDIT|BY|REFUND|SALARY|INTEREST|DEPOSIT)\b|NEFT CR|RTGS CR|UPI\/CR)/i.test(rowText);
                const amt = rowNums[0];
                const bal = rowNums.length >= 2 ? rowNums[rowNums.length - 1] : undefined;
                rawStructuredList.push({
                  date: rowDate,
                  description: rowDesc || 'Bank Transaction',
                  referenceNo: rowRef,
                  debit: isCr ? 0 : amt,
                  credit: isCr ? amt : 0,
                  amount: amt,
                  type: isCr ? 'CREDIT' : 'DEBIT',
                  runningBalance: bal,
                  auditTag: isCr ? 'KEYWORD_CREDIT' : 'KEYWORD_DEBIT'
                });
              }
            }
          } else if (rawStructuredList.length > 0 && !NON_TRANSACTION_METADATA_REGEX.test(rowUpper) && !ACCOUNT_METADATA_REGEX.test(rowUpper)) {
            // Row without date is narration continuation for the preceding transaction
            const trimmed = rowText.trim();
            if (trimmed && !/^\s*[\d,]+(?:\.\d{1,2})?\s*$/.test(trimmed)) {
              rawStructuredList[rawStructuredList.length - 1].description += ' ' + trimmed;
            }
          }
        }

        pageTexts.push(`--- Page ${pageNum} ---\n${pageLines.join('\n')}`);
      }
    }

    const structuredTxs = rawStructuredList.length > 0 ? normalizeAndAuditBankTransactions(rawStructuredList) : [];

    return {
      text: pageTexts.join('\n\n'),
      pages: pageTexts,
      pageImages,
      structuredTxs
    };
  };

  // 2. Parse PDF File
  const handleProcessPdfFile = async (fileToProcess: File, pwd?: string) => {
    setIsProcessing(true);
    setProcessingStatus(isHindi ? 'PDF डॉक्युमेंट एवं 100% टेबल स्ट्रक्चर का विश्लेषण जारी है...' : 'Reading multi-page PDF structure & tables...');
    setErrorMessage(null);
    setSuccessMessage(null);
    setPasswordError('');

    try {
      let extracted: { text: string; pages: string[]; pageImages: string[]; structuredTxs: AuditedBankTransaction[] };
      try {
        extracted = await extractPdfSpatialText(fileToProcess, pwd);
      } catch (pdfErr: any) {
        if (pdfErr?.name === 'PasswordException' || /password/i.test(pdfErr?.message || '')) {
          setIsPasswordRequired(true);
          setIsProcessing(false);
          setPasswordError(isHindi ? 'यह बैंक PDF पासवर्ड से सुरक्षित है। कृपया पासवर्ड दर्ज करें।' : 'This Bank PDF is password protected. Please enter password to unlock.');
          return;
        }
        throw pdfErr;
      }

      setIsPasswordRequired(false);
      setProcessingStatus(isHindi ? 'सभी पेजों से संपूर्ण 100% एंट्रीज और बैलेंस ऑडिट हो रहा है...' : 'Extracting all pages and verifying running balance continuity...');

      // 1. Coordinate-geometry structured extraction as baseline
      let auditedTransactions: AuditedBankTransaction[] = [];
      if (extracted.structuredTxs && extracted.structuredTxs.length > 0) {
        auditedTransactions = normalizeAndAuditBankTransactions(extracted.structuredTxs);
      }

      // 2. Tabular text parser fallback
      if (auditedTransactions.length === 0) {
        const textParsed = parseMultiPageBankStatement(extracted.pages.length > 0 ? extracted.pages : extracted.text);
        if (textParsed.length > 0) {
          auditedTransactions = textParsed;
        }
      }

      console.log(`[BankImport] Local deterministic extractor found ${auditedTransactions.length} transactions across ${extracted.pages.length} pages.`);

      // 3. AI vision + spatial server parser enhancement (Primary for accurate multi-column Debit/Credit discernment)
      try {
        const response = await fetch(resolveApiUrl('/api/parse-bank-statement'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: extracted.text,
            pageTexts: extracted.pages,
            pageImages: extracted.pageImages
          })
        });

        const json = await response.json();
        if (json.success && json.data && Array.isArray(json.data.transactions) && json.data.transactions.length > 0) {
          const aiAudited = normalizeAndAuditBankTransactions(json.data.transactions);
          console.log(`[BankImport] AI parser returned ${aiAudited.length} transactions.`);
          
          // AI vision provides superior visual alignment of Debit vs Credit columns on Indian bank layouts
          if (aiAudited.length > 0) {
            auditedTransactions = aiAudited;
          }
        }
      } catch (aiErr) {
        console.warn('Server AI parser fallback to local extractor:', aiErr);
      }

      if (auditedTransactions.length === 0) {
        throw new Error(isHindi ? 'PDF से कोई वैध ट्रांजैक्शन नहीं मिले। कृपया फाइल चेक करें।' : 'No valid bank transactions could be extracted from this PDF.');
      }

      const rawStatementLines = convertAuditedToStatementLines(auditedTransactions);
      const { accepted, outOfFyCount, dupCount } = verifyAndFilterExtractedLines(rawStatementLines, extracted.text);
      setParsedLines(accepted);
      setSelectedLineIds(new Set(accepted.map(l => l.id)));
      const skipNotes: string[] = [];
      if (outOfFyCount > 0) {
        skipNotes.push(isHindi ? `${outOfFyCount} अन्य वर्ष की प्रविष्टियाँ रोकी गईं` : `${outOfFyCount} out-of-FY rows blocked`);
      }
      if (dupCount > 0) {
        skipNotes.push(isHindi ? `${dupCount} डुप्लिकेट रोकी गईं` : `${dupCount} duplicates skipped`);
      }
      setSuccessMessage(
        isHindi 
          ? `✅ सत्यापित: ${accepted.length} प्रविष्टियाँ (${fyRange.label}) ${extracted.pages.length || 1} पेजों से लोड हुईं!${skipNotes.length ? ` (${skipNotes.join(', ')})` : ''}`
          : `✅ Verified: Loaded ${accepted.length} transactions for ${fyRange.label} across ${extracted.pages.length || 1} page(s)!${skipNotes.length ? ` (${skipNotes.join(', ')})` : ''}`
      );
    } catch (err: any) {
      console.error('PDF parsing error:', err);
      setErrorMessage(err?.message || (isHindi ? 'PDF पार्स करने में त्रुटि हुई।' : 'Failed to parse bank PDF.'));
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 3. Process Excel / CSV File
  const handleProcessSpreadsheetFile = async (file: File) => {
    setIsProcessing(true);
    setProcessingStatus(isHindi ? 'एक्सेल/CSV ग्रिड व कॉलम संरचना का विश्लेषण जारी है...' : 'Analyzing Excel/CSV grid structure & column mapping...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const dataBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(dataBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      
      // 1. Direct 2D structured matrix extraction (Preserves empty cells and explicit Debit/Credit columns)
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      const headerText = rawRows.slice(0, 35).map(r => (Array.isArray(r) ? r.join(' ') : String(r))).join('\n');
      let auditedTransactions = parseStructuredSpreadsheetRows(rawRows);

      // 2. Fallback to CSV text parser if 2D grid didn't detect columns
      if (auditedTransactions.length === 0) {
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        auditedTransactions = parseCsvOrTsvText(csvText);
      }

      // 3. Final fallback to multi-page regex parser
      if (auditedTransactions.length === 0) {
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        auditedTransactions = parseTabularBankStatementText(csvText);
      }

      if (auditedTransactions.length === 0) {
        throw new Error(isHindi ? 'एक्सेल/CSV फाइल में कोई वैध बैंक ट्रांजैक्शन नहीं मिला।' : 'No valid bank transactions found in this Excel/CSV file.');
      }

      const rawStatementLines = convertAuditedToStatementLines(auditedTransactions);
      const { accepted, outOfFyCount, dupCount } = verifyAndFilterExtractedLines(rawStatementLines, headerText);
      setParsedLines(accepted);
      setSelectedLineIds(new Set(accepted.map(l => l.id)));
      const skipNotes: string[] = [];
      if (outOfFyCount > 0) skipNotes.push(isHindi ? `${outOfFyCount} अन्य FY की प्रविष्टियाँ रोकी गईं` : `${outOfFyCount} out-of-FY rows blocked`);
      if (dupCount > 0) skipNotes.push(isHindi ? `${dupCount} डुप्लिकेट रोकी गईं` : `${dupCount} duplicates skipped`);
      setSuccessMessage(
        isHindi 
          ? `✅ सत्यापित: एक्सेल/CSV से ${accepted.length} प्रविष्टियां (${fyRange.label}) लोड हुईं!${skipNotes.length ? ` (${skipNotes.join(', ')})` : ''}`
          : `✅ Verified: Loaded ${accepted.length} entries for ${fyRange.label}!${skipNotes.length ? ` (${skipNotes.join(', ')})` : ''}`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || (isHindi ? 'शीट पार्स करने में त्रुटि हुई।' : 'Error processing spreadsheet file.'));
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 4. Process Pasted Text
  const handleProcessPastedText = () => {
    if (!rawPastedText || rawPastedText.trim().length === 0) {
      setErrorMessage(isHindi ? 'कृपया बैंक स्टेटमेंट का टेक्स्ट पेस्ट करें।' : 'Please paste bank statement table text.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus(isHindi ? 'पेस्ट किए गए डेटा का विश्लेषण हो रहा है...' : 'Parsing pasted bank statement text...');
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const auditedTransactions = parseTabularBankStatementText(rawPastedText);
      if (auditedTransactions.length === 0) {
        throw new Error(isHindi ? 'पेस्ट किए गए टेक्स्ट से कोई तालिका प्रविष्टि नहीं पहचानी जा सकी।' : 'Could not parse tabular entries from pasted text.');
      }

      const rawStatementLines = convertAuditedToStatementLines(auditedTransactions);
      const { accepted, outOfFyCount, dupCount } = verifyAndFilterExtractedLines(rawStatementLines, rawPastedText);
      setParsedLines(accepted);
      setSelectedLineIds(new Set(accepted.map(l => l.id)));
      const skipNotes: string[] = [];
      if (outOfFyCount > 0) skipNotes.push(isHindi ? `${outOfFyCount} अन्य FY की प्रविष्टियाँ रोकी गईं` : `${outOfFyCount} out-of-FY rows blocked`);
      if (dupCount > 0) skipNotes.push(isHindi ? `${dupCount} डुप्लिकेट रोकी गईं` : `${dupCount} duplicates skipped`);
      setSuccessMessage(
        isHindi 
          ? `✅ सत्यापित: ${accepted.length} ट्रांजैक्शन (${fyRange.label}) लोड हुए!${skipNotes.length ? ` (${skipNotes.join(', ')})` : ''}`
          : `✅ Verified: Parsed ${accepted.length} transactions for ${fyRange.label}!${skipNotes.length ? ` (${skipNotes.join(', ')})` : ''}`
      );
    } catch (err: any) {
      setErrorMessage(err?.message || (isHindi ? 'टेक्स्ट पार्स नहीं हो सका।' : 'Failed to parse text.'));
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // 5. Swap all parsed Debits and Credits
  const handleSwapAllDebitCredit = () => {
    setParsedLines(prev => prev.map(line => {
      const newType = line.type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
      return {
        ...line,
        type: newType,
        debit: newType === 'DEBIT' ? line.amount : 0,
        credit: newType === 'CREDIT' ? line.amount : 0
      };
    }));
  };

  // 6. Auto-Align Debit/Credit directly with consecutive running balance deltas (Math Ground Truth)
  const handleAutoAlignWithMath = () => {
    if (parsedLines.length === 0) return;
    const aligned = autoAlignStatementLinesWithMath(parsedLines);
    setParsedLines(aligned);
    setSuccessMessage(
      isHindi 
        ? '✅ सभी डेबिट एवं क्रेडिट आंकड़े रनिंग बैलेंस (Balance Math) के साथ 100% सटीक मिलान कर दिए गए हैं!' 
        : '✅ All Debit & Credit figures auto-aligned and verified against Running Balance math!'
    );
  };

  // File Upload Drop Handlers
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFileSelected(file);
    }
  };

  const handleFileSelected = (file: File) => {
    if (!selectedBankLedger) {
      setErrorMessage(
        isHindi
          ? 'कृपया पहले कंपनी का बैंक खाता लेजर चुनें या "+ नया बैंक" बटन से बैंक खाता बनाएं। बिना बैंक लेजर के स्टेटमेंट अपलोड नहीं हो सकता।'
          : 'Please select or create a valid Company Bank Ledger first before uploading a statement.'
      );
      return;
    }
    setSelectedFile(file);
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.pdf')) {
      setActiveSourceTab('PDF');
      handleProcessPdfFile(file);
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || fileName.endsWith('.csv')) {
      setActiveSourceTab('EXCEL');
      handleProcessSpreadsheetFile(file);
    } else {
      setErrorMessage(isHindi ? 'अमान्य फाइल प्रकार। कृपया PDF, Excel (.xlsx, .xls) या CSV अपलोड करें।' : 'Unsupported file format. Please upload PDF, Excel, or CSV.');
    }
  };

  // Toggle selection
  const handleToggleSelectLine = (id: string) => {
    setSelectedLineIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLineIds(new Set(visibleLines.map(l => l.id)));
    } else {
      setSelectedLineIds(new Set());
    }
  };

  // Edit Line Properties
  const handleUpdateLine = (id: string, updates: Partial<BankStatementLine>) => {
    setParsedLines(prev => prev.map(line => {
      if (line.id === id) {
        const updated = { ...line, ...updates };
        if (updates.type && updates.type !== line.type) {
          // Keep amount positive and consistent
          updated.amount = Math.abs(updated.amount);
        }
        return updated;
      }
      return line;
    }));
  };

  const handleDeleteLine = (id: string) => {
    setParsedLines(prev => prev.filter(l => l.id !== id));
    setSelectedLineIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // Commit Validation Guard
  const validateLinesBeforeCommit = (linesToCommit: BankStatementLine[]): string | null => {
    if (!selectedBankLedger) {
      return isHindi ? 'कोई वैध बैंक लेजर चयनित नहीं है।' : 'No valid Company Bank Ledger is selected.';
    }
    if (linesToCommit.length === 0) {
      return isHindi ? 'कृपया कम से कम एक ट्रांजैक्शन चुनें।' : 'Please select at least one transaction.';
    }
    const invalidAmt = linesToCommit.find(l => !l.amount || l.amount <= 0);
    if (invalidAmt) {
      return isHindi ? `अमान्य राशि (0 या कम) मिली: ${invalidAmt.description}` : `Invalid zero/negative amount on row: ${invalidAmt.description}`;
    }
    const outOfFy = linesToCommit.find(l => !isDateInFinancialYear(l.date, fyRange.fyStart));
    if (outOfFy) {
      return isHindi
        ? `दिनांक ${outOfFy.date} सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) से बाहर है। कृपया तारीख सुधारें या हेडर से FY बदलें।`
        : `Transaction date ${outOfFy.date} is outside active ${fyRange.label} (${fyRange.displayRange}).`;
    }
    return null;
  };

  // Commit Options
  const handleCommitPostVouchers = () => {
    const linesToPost = parsedLines.filter(l => selectedLineIds.has(l.id));
    const err = validateLinesBeforeCommit(linesToPost);
    if (err) {
      setErrorMessage(err);
      return;
    }

    if (onPostBankVouchersBatch && targetBankAccountId) {
      onPostBankVouchersBatch(linesToPost, targetBankAccountId);
    } else {
      onImportStatementLines(linesToPost);
    }
    onClose();
  };

  const handleCommitImportReconciliation = () => {
    const linesToImport = parsedLines.filter(l => selectedLineIds.has(l.id));
    const err = validateLinesBeforeCommit(linesToImport);
    if (err) {
      setErrorMessage(err);
      return;
    }

    onImportStatementLines(linesToImport);
    onClose();
  };

  const handleCreateNewBankQuick = () => {
    if (!newBankName.trim() || !newBankAccNo.trim()) {
      setBankQuickErr(isHindi ? 'कृपया बैंक का नाम और खाता संख्या (A/c No.) दोनों दर्ज करें।' : 'Please enter both Bank Name and Account Number for verification.');
      return;
    }
    setBankQuickErr(null);
    if (onCreateBankLedgerQuick) {
      onCreateBankLedgerQuick(newBankName.trim(), newBankAccNo.trim());
    }
    setShowAddBankModal(false);
    setNewBankName('');
    setNewBankAccNo('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-2 md:p-4 overflow-y-auto">
      <div className="hv-surface border border-[var(--border-primary)] text-[var(--text-primary)] w-full max-w-6xl rounded-2xl shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="hv-elevated border-b border-[var(--border-primary)] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white hv-keep-white shadow-lg shadow-emerald-500/20">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                <span>{isHindi ? 'बैंक स्टेटमेंट ऑटो-इम्पोर्ट एवं सत्यापन' : 'Bank Statement Auto-Import & Audit'}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full hv-pill-emerald border flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {isHindi ? '100% सटीक डेबिट/क्रेडिट' : '100% Exact Dr/Cr Shield'}
                </span>
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {isHindi 
                  ? 'HDFC, SBI, ICICI, Axis, Kotak, BOB आदि सभी भारतीय बैंकों के PDF/Excel/CSV स्टेटमेंट्स को सीधे इम्पोर्ट करें।' 
                  : 'Import, verify, and post transactions from all Indian Bank PDFs, Excel, or CSV files.'}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-2 rounded-xl hover:bg-[var(--hover-surface)] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Target Bank Account Selection + Ledger Ownership Guard */}
          <div className="hv-elevated border border-[var(--border-subtle)] p-4 rounded-xl space-y-3">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Landmark className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <label className="text-xs font-semibold text-[var(--text-secondary)] flex items-center gap-2 flex-wrap">
                    <span>{isHindi ? 'लक्ष्य कंपनी बैंक खाता (Company Bank Ledger):' : 'Target Company Bank Ledger:'}</span>
                    <span className="text-[10px] font-mono hv-pill-indigo px-2 py-0.5 rounded border">
                      {fyRange.label}
                    </span>
                  </label>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi
                      ? 'सिर्फ आपकी कंपनी के रजिस्टर्ड बैंक लेजर और खाता संख्या से मेल खाने वाला स्टेटमेंट ही अपलोड होगा।'
                      : 'Statement is cross-verified against this Company Bank Ledger (Bank Name, A/c No, IFSC, Holder Name).'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                {bankAccounts.length > 0 ? (
                  <select
                    value={targetBankAccountId}
                    onChange={(e) => {
                      setTargetBankAccountId(e.target.value);
                      setErrorMessage(null);
                    }}
                    className="hv-input border border-[var(--border-subtle)] text-xs font-semibold rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 focus:outline-none min-w-[230px]"
                  >
                    {bankAccounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.code}) {acc.accountNumber ? `- A/c ****${acc.accountNumber.slice(-4)}` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-bold hv-pill-rose border px-3 py-2 rounded-xl">
                    {isHindi ? 'कोई बैंक लेजर नहीं है' : 'No Bank Ledger Found'}
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setBankQuickErr(null);
                    setShowAddBankModal(true);
                  }}
                  className="hv-pill-indigo border px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shrink-0 hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isHindi ? '+ नया बैंक' : '+ New Bank'}</span>
                </button>
              </div>
            </div>

            {bankAccounts.length === 0 && (
              <div className="hv-pill-rose border rounded-xl p-3 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>
                  {isHindi
                    ? 'पहले "+ नया बैंक" बटन दबाकर अपनी कंपनी का बैंक खाता लेजर और खाता संख्या जोड़ें — उसके बाद ही स्टेटमेंट अपलोड किया जा सकेगा।'
                    : 'Please click "+ New Bank" above to register your company bank ledger & account number before uploading any statement.'}
                </span>
              </div>
            )}
          </div>

          {/* Source Tabs (PDF / Excel / Paste) */}
          <div className="flex border-b border-[var(--border-primary)] gap-2 overflow-x-auto">
            <button
              onClick={() => setActiveSourceTab('PDF')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
                activeSourceTab === 'PDF' 
                  ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10 rounded-t-lg' 
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>{isHindi ? '1. बैंक PDF स्टेटमेंट (पासवर्ड अनलॉक समर्थित)' : '1. Bank PDF Statement (Password Supported)'}</span>
            </button>

            <button
              onClick={() => setActiveSourceTab('EXCEL')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
                activeSourceTab === 'EXCEL' 
                  ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10 rounded-t-lg' 
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isHindi ? '2. एक्सेल / CSV फाइल (.xlsx, .csv)' : '2. Excel / CSV File (.xlsx, .csv)'}</span>
            </button>

            <button
              onClick={() => setActiveSourceTab('PASTE')}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition whitespace-nowrap ${
                activeSourceTab === 'PASTE' 
                  ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10 rounded-t-lg' 
                  : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>{isHindi ? '3. नेट-बैंकिंग टेक्स्ट पेस्ट करें' : '3. Paste Statement Text'}</span>
            </button>
          </div>

          {/* TAB 1: PDF STATEMENT UPLOAD */}
          {activeSourceTab === 'PDF' && (
            <div className="space-y-4">
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-[var(--border-subtle)] hover:border-emerald-500/80 hv-elevated hover:bg-[var(--hover-surface)] rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition group"
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  accept=".pdf" 
                  className="hidden" 
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                  <Upload className="w-7 h-7" />
                </div>
                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                  {selectedFile?.name || (isHindi ? 'बैंक स्टेटमेंट PDF यहाँ ड्रैग करें या क्लिक करके चुनें' : 'Drag and drop Bank Statement PDF here or click to browse')}
                </h4>
                <p className="text-xs text-[var(--text-muted)] max-w-md">
                  {isHindi 
                    ? 'HDFC, SBI, ICICI, Axis, Kotak, BOB, PNB, Canara आदि सभी बैंकों के आधिकारिक PDF स्टेटमेंट समर्थित हैं।' 
                    : 'Supports e-statements from all major Indian Banks with multi-page tabular layout.'}
                </p>
              </div>

              {/* Password Unlock Panel (if PDF is encrypted) */}
              {isPasswordRequired && (
                <div className="hv-pill-amber border p-4 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 text-amber-500">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-bold">
                        {isHindi ? 'यह PDF पासवर्ड से सुरक्षित है (Password Protected PDF)' : 'Password Protected PDF Detected'}
                      </h5>
                      <p className="text-[11px] opacity-90">
                        {isHindi ? 'कृपया स्टेटमेंट खोलने का पासवर्ड दर्ज करें (उदा. PAN नंबर, जन्मतिथि या खाता संख्या):' : 'Enter the PDF password (e.g., PAN, DOB DDMMYYYY, or Account No):'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="relative flex-1 sm:w-64">
                      <input 
                        type={showPassword ? 'text' : 'password'}
                        value={pdfPassword}
                        onChange={(e) => setPdfPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && selectedFile) {
                            handleProcessPdfFile(selectedFile, pdfPassword);
                          }
                        }}
                        placeholder={isHindi ? 'पासवर्ड दर्ज करें...' : 'Enter PDF password...'}
                        className="w-full hv-input border border-amber-500/60 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 pr-9"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => selectedFile && handleProcessPdfFile(selectedFile, pdfPassword)}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shrink-0"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'अनलॉक व पार्स करें' : 'Unlock & Parse'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EXCEL / CSV UPLOAD */}
          {activeSourceTab === 'EXCEL' && (
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--border-subtle)] hover:border-emerald-500/80 hv-elevated hover:bg-[var(--hover-surface)] rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                accept=".xlsx,.xls,.csv" 
                className="hidden" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3 group-hover:scale-110 transition">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1">
                {selectedFile?.name || (isHindi ? 'एक्सेल (.xlsx) या CSV फाइल यहाँ अपलोड करें' : 'Upload Excel (.xlsx, .xls) or CSV statement')}
              </h4>
              <p className="text-xs text-[var(--text-muted)] max-w-md">
                {isHindi 
                  ? 'नेट बैंकिंग से डाउनलोड की गई एक्सेल या CSV फाइल को सीधे लोड करें।' 
                  : 'Fast deterministic parsing from net banking spreadsheet exports.'}
              </p>
            </div>
          )}

          {/* TAB 3: PASTE TEXT */}
          {activeSourceTab === 'PASTE' && (
            <div className="space-y-3">
              <textarea
                value={rawPastedText}
                onChange={(e) => setRawPastedText(e.target.value)}
                placeholder={isHindi ? "नेट-बैंकिंग पेज से कॉपी की गई टेबल को यहाँ पेस्ट करें (Date, Narration, Withdrawal, Deposit, Balance)..." : "Paste statement table rows copied directly from your online banking portal..."}
                rows={5}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleProcessPastedText}
                disabled={isProcessing || !rawPastedText.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white hv-keep-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isHindi ? 'पेस्ट किया गया डेटा पार्स करें' : 'Parse Pasted Statement'}</span>
              </button>
            </div>
          )}

          {/* Status & Alerts */}
          {isProcessing && (
            <div className="hv-pill-indigo border p-4 rounded-xl flex items-center gap-3 animate-pulse">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-500" />
              <span className="text-xs font-semibold">{processingStatus}</span>
            </div>
          )}

          {errorMessage && (
            <div className="hv-pill-rose border p-4 rounded-xl flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
              <span className="text-xs font-semibold">{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="hv-pill-emerald border p-4 rounded-xl flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <span className="text-xs font-semibold">{successMessage}</span>
            </div>
          )}

          {/* EXECUTIVE STATEMENT AUDIT SUMMARY (Cards) */}
          {parsedLines.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                
                {/* Total Deposits (Credits) */}
                <div className="hv-elevated border border-emerald-500/30 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-emerald-500 text-xs font-bold mb-1">
                    <span className="flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {isHindi ? 'कुल क्रेडिट / इनफ्लो' : 'Total Deposits (Cr)'}
                    </span>
                    <span className="hv-pill-emerald border px-2 py-0.5 rounded text-[10px]">
                      {statementSummary.creditCount} {isHindi ? 'प्रविष्टियां' : 'txns'}
                    </span>
                  </div>
                  <div className="text-base font-extrabold text-emerald-500 font-mono">
                    {formatCurrency(statementSummary.totalCredits, data.company.currency)}
                  </div>
                </div>

                {/* Total Withdrawals (Debits) */}
                <div className="hv-elevated border border-rose-500/30 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-rose-500 text-xs font-bold mb-1">
                    <span className="flex items-center gap-1.5">
                      <TrendingDown className="w-3.5 h-3.5" />
                      {isHindi ? 'कुल डेबिट / आउटफ्लो' : 'Total Withdrawals (Dr)'}
                    </span>
                    <span className="hv-pill-rose border px-2 py-0.5 rounded text-[10px]">
                      {statementSummary.debitCount} {isHindi ? 'प्रविष्टियां' : 'txns'}
                    </span>
                  </div>
                  <div className="text-base font-extrabold text-rose-500 font-mono">
                    {formatCurrency(statementSummary.totalDebits, data.company.currency)}
                  </div>
                </div>

                {/* Net Statement Movement */}
                <div className="hv-elevated border border-blue-500/30 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-blue-500 text-xs font-bold mb-1">
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" />
                      {isHindi ? 'शुद्ध अंतर (Net Flow)' : 'Net Movement'}
                    </span>
                  </div>
                  <div className={`text-base font-extrabold font-mono ${statementSummary.netMovement >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {statementSummary.netMovement >= 0 ? '+' : ''}{formatCurrency(statementSummary.netMovement, data.company.currency)}
                  </div>
                </div>

                {/* Total Extracted Entries */}
                <div className="hv-elevated border border-indigo-500/30 p-3.5 rounded-xl">
                  <div className="flex items-center justify-between text-indigo-500 text-xs font-bold mb-1">
                    <span className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      {isHindi ? 'कुल ट्रांजैक्शन' : 'Verified Rows'}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      {statementSummary.dateRange.start || 'N/A'}
                    </span>
                  </div>
                  <div className="text-base font-extrabold text-[var(--text-primary)] font-mono">
                    {statementSummary.totalTransactions} {isHindi ? 'सत्यापित' : 'Rows'}
                  </div>
                </div>

              </div>

              {/* Table Filter & Search Controls */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 hv-elevated p-2.5 rounded-xl border border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder={isHindi ? 'विवरण, राशि या Ref No से खोजें...' : 'Search narration, amount, ref...'}
                      className="hv-input border border-[var(--border-subtle)] text-xs rounded-lg pl-8 pr-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex rounded-lg hv-surface p-0.5 border border-[var(--border-subtle)] text-[11px] font-bold">
                    <button
                      onClick={() => setTypeFilter('ALL')}
                      className={`px-2.5 py-1 rounded ${typeFilter === 'ALL' ? 'bg-indigo-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      {isHindi ? 'सभी' : 'All'}
                    </button>
                    <button
                      onClick={() => setTypeFilter('DEBIT')}
                      className={`px-2.5 py-1 rounded ${typeFilter === 'DEBIT' ? 'bg-rose-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      {isHindi ? 'डेबिट (Dr)' : 'Debits'}
                    </button>
                    <button
                      onClick={() => setTypeFilter('CREDIT')}
                      className={`px-2.5 py-1 rounded ${typeFilter === 'CREDIT' ? 'bg-emerald-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
                    >
                      {isHindi ? 'क्रेडिट (Cr)' : 'Credits'}
                    </button>
                  </div>

                  {/* 1-Click Debit/Credit Swap Button */}
                  <button
                    type="button"
                    onClick={handleSwapAllDebitCredit}
                    title={isHindi ? "यदि बैंक प्रारूप में डेबिट व क्रेडिट उल्टे लोड हुए हों, तो उन्हें तुरंत एक क्लिक में आपस में बदलें" : "Invert/Swap all Debits and Credits with one click"}
                    className="flex items-center gap-1.5 hv-pill-amber border font-bold px-2.5 py-1 rounded-lg text-[11px] transition shadow-sm hover:opacity-90"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'Dr ⇄ Cr आपस में बदलें' : 'Swap All Dr ⇄ Cr'}</span>
                  </button>

                  {/* 1-Click Auto-Align with Balance Math */}
                  <button
                    type="button"
                    onClick={handleAutoAlignWithMath}
                    title={isHindi ? "रनिंग बैलेंस अंतर (Δ Balance) के आधार पर सभी डेबिट/क्रेडिट को स्वतः 100% सही करें" : "Automatically calculate and align Debit/Credit types & amounts from running balance difference"}
                    className="flex items-center gap-1.5 hv-pill-emerald border font-bold px-2.5 py-1 rounded-lg text-[11px] transition shadow-sm hover:opacity-90"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{isHindi ? '📐 बैलेंस गणित से मिलान करें' : 'Auto-Align Math'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={visibleLines.length > 0 && visibleLines.every(l => selectedLineIds.has(l.id))}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold">{isHindi ? 'सभी चुनें' : 'Select All'} ({selectedLineIds.size}/{parsedLines.length})</span>
                  </label>
                </div>
              </div>

              {/* STATEMENT REVIEW & EDIT TABLE */}
              <div className="border border-[var(--border-primary)] rounded-xl overflow-x-auto overflow-y-auto hv-surface max-h-96">
                <table className="w-full text-left text-xs min-w-[960px]">
                  <thead className="hv-elevated text-[var(--text-secondary)] uppercase text-[10px] font-bold sticky top-0 z-10 border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="p-2.5 w-10 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={visibleLines.length > 0 && visibleLines.every(l => selectedLineIds.has(l.id))}
                          onChange={(e) => handleSelectAll(e.target.checked)}
                          className="rounded border-[var(--border-subtle)] text-emerald-600"
                        />
                      </th>
                      <th className="p-2.5 w-28 whitespace-nowrap">{isHindi ? 'दिनांक' : 'Date'}</th>
                      <th className="p-2.5 min-w-[200px]">{isHindi ? 'विवरण / नरेशन' : 'Narration / Particulars'}</th>
                      <th className="p-2.5 w-24 whitespace-nowrap">{isHindi ? 'Ref / UTR' : 'Ref / Chq No'}</th>
                      <th className="p-2.5 w-28 text-center whitespace-nowrap">{isHindi ? 'प्रकार (Type)' : 'Type'}</th>
                      <th className="p-2.5 w-32 text-right text-rose-500 whitespace-nowrap">{isHindi ? 'डेबिट / निकासी (Dr ₹)' : 'Withdrawal (Dr ₹)'}</th>
                      <th className="p-2.5 w-32 text-right text-emerald-500 whitespace-nowrap">{isHindi ? 'क्रेडिट / जमा (Cr ₹)' : 'Deposit (Cr ₹)'}</th>
                      <th className="p-2.5 w-28 text-right text-[var(--text-muted)] whitespace-nowrap">{isHindi ? 'शेष (Balance ₹)' : 'Balance (₹)'}</th>
                      <th className="p-2.5 w-36 whitespace-nowrap">{isHindi ? 'खाता (Counter A/c)' : 'Counter Ledger'}</th>
                      <th className="p-2.5 w-10 text-center whitespace-nowrap">{isHindi ? 'हटाएं' : 'Del'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)]">
                    {visibleLines.map((line) => {
                      const isSelected = selectedLineIds.has(line.id);
                      const isDebit = line.type === 'DEBIT';
                      const isCredit = line.type === 'CREDIT';
                      const lineIdx = parsedLines.findIndex(l => l.id === line.id);
                      const mathProof = getLineMathProof(lineIdx, parsedLines);

                      return (
                        <tr 
                          key={line.id}
                          className={`hover:bg-[var(--hover-surface)] transition ${isSelected ? 'bg-emerald-500/10' : ''}`}
                        >
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectLine(line.id)}
                              className="rounded border-[var(--border-subtle)] text-emerald-600"
                            />
                          </td>

                          {/* Editable Date */}
                          <td className="p-2.5">
                            <input
                              type="date"
                              value={line.date}
                              onChange={(e) => handleUpdateLine(line.id, { date: e.target.value })}
                              className="bg-transparent border-b border-transparent hover:border-[var(--border-subtle)] focus:border-emerald-500 text-[var(--text-primary)] text-xs font-mono focus:outline-none"
                            />
                          </td>

                          {/* Editable Narration */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={line.description}
                              onChange={(e) => handleUpdateLine(line.id, { description: e.target.value })}
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--border-subtle)] focus:border-emerald-500 text-[var(--text-primary)] text-xs focus:outline-none"
                            />
                          </td>

                          {/* Editable Reference */}
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={line.referenceNo || ''}
                              onChange={(e) => handleUpdateLine(line.id, { referenceNo: e.target.value })}
                              placeholder="-"
                              className="w-full bg-transparent border-b border-transparent hover:border-[var(--border-subtle)] focus:border-emerald-500 text-[var(--text-muted)] font-mono text-[11px] focus:outline-none"
                            />
                          </td>

                          {/* Type Toggle Button (DEBIT vs CREDIT) with Math Proof */}
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleUpdateLine(line.id, { type: isDebit ? 'CREDIT' : 'DEBIT' })}
                              title={isHindi ? "प्रकार बदलने हेतु क्लिक करें (Dr ⇄ Cr)" : "Click to toggle between Debit and Credit"}
                              className={`px-2 py-0.5 rounded text-[10px] font-extrabold transition flex items-center justify-center gap-1 mx-auto border ${
                                isCredit 
                                  ? 'hv-pill-emerald hover:opacity-90' 
                                  : 'hv-pill-rose hover:opacity-90'
                              }`}
                            >
                              <span>{isCredit ? 'CREDIT (Cr)' : 'DEBIT (Dr)'}</span>
                            </button>

                            {mathProof.hasProof && !mathProof.isMatched && mathProof.expectedType && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateLine(line.id, {
                                    type: mathProof.expectedType!,
                                    amount: mathProof.expectedAmount || line.amount
                                  });
                                }}
                                title={`Running balance delta indicates ${mathProof.expectedType} ₹${mathProof.expectedAmount}`}
                                className="mt-1 px-1.5 py-0.5 rounded text-[9px] font-bold hv-pill-amber border hover:opacity-90 flex items-center justify-center gap-0.5 mx-auto"
                              >
                                ⚡ Fix {mathProof.expectedType === 'CREDIT' ? 'Cr' : 'Dr'} ₹{mathProof.expectedAmount}
                              </button>
                            )}
                          </td>

                          {/* Dedicated Debit (Withdrawals / Dr) Column */}
                          <td className="p-2.5 text-right font-mono font-bold">
                            <input
                              type="number"
                              step="0.01"
                              value={isDebit ? (line.amount || '') : ''}
                              placeholder={isDebit ? '0.00' : '-'}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                handleUpdateLine(line.id, { 
                                  type: 'DEBIT', 
                                  amount: val 
                                });
                              }}
                              className={`w-28 text-right bg-transparent border-b border-transparent hover:border-[var(--border-subtle)] focus:border-rose-500 font-mono text-xs focus:outline-none ${
                                isDebit ? 'text-rose-500 font-bold' : 'text-[var(--text-muted)] opacity-50'
                              }`}
                            />
                          </td>

                          {/* Dedicated Credit (Deposits / Cr) Column */}
                          <td className="p-2.5 text-right font-mono font-bold">
                            <input
                              type="number"
                              step="0.01"
                              value={isCredit ? (line.amount || '') : ''}
                              placeholder={isCredit ? '0.00' : '-'}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value) || 0;
                                handleUpdateLine(line.id, { 
                                  type: 'CREDIT', 
                                  amount: val 
                                });
                              }}
                              className={`w-28 text-right bg-transparent border-b border-transparent hover:border-[var(--border-subtle)] focus:border-emerald-500 font-mono text-xs focus:outline-none ${
                                isCredit ? 'text-emerald-500 font-bold' : 'text-[var(--text-muted)] opacity-50'
                              }`}
                            />
                          </td>

                          {/* Running Balance Column */}
                          <td className="p-2.5 text-right font-mono text-xs text-[var(--text-secondary)]">
                            {line.runningBalance !== undefined ? (
                              <span>{formatCurrency(line.runningBalance, data.company.currency)}</span>
                            ) : (
                              <span className="text-[var(--text-muted)]">-</span>
                            )}
                          </td>

                          {/* Counter Account / Suspense Mapping */}
                          <td className="p-2.5">
                            <select
                              value={line.allocatedAccountId || suspenseAccount?.id}
                              onChange={(e) => {
                                const acc = data.accounts.find(a => a.id === e.target.value);
                                handleUpdateLine(line.id, { 
                                  allocatedAccountId: acc?.id, 
                                  allocatedAccountName: acc?.name 
                                });
                              }}
                              className="w-full hv-input border border-[var(--border-subtle)] text-[11px] rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              {data.accounts.filter(a => !a.isGroup && a.id !== selectedBankLedger?.id).map(a => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          </td>

                          {/* Delete Action */}
                          <td className="p-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteLine(line.id)}
                              className="text-[var(--text-muted)] hover:text-rose-500 p-1 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer (Action Buttons) */}
        <div className="hv-elevated border-t border-[var(--border-primary)] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-[var(--text-muted)]">
            {parsedLines.length > 0 ? (
              <span>
                {isHindi ? 'चयनित प्रविष्टियां:' : 'Selected entries:'} <strong className="text-[var(--text-primary)]">{selectedLineIds.size}</strong> of {parsedLines.length}
              </span>
            ) : (
              <span>{isHindi ? 'कोई फाइल चुनी नहीं गई।' : 'Ready to import statement.'}</span>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)] font-bold px-4 py-2 rounded-xl text-xs transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>

            {parsedLines.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleCommitImportReconciliation}
                  disabled={selectedLineIds.size === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white hv-keep-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20"
                >
                  <FileText className="w-4 h-4" />
                  <span>{isHindi ? 'BRS मैच हेतु इम्पोर्ट करें' : 'Import for BRS Matching'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCommitPostVouchers}
                  disabled={selectedLineIds.size === 0}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white hv-keep-white font-extrabold px-5 py-2 rounded-xl text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-600/30"
                >
                  <Check className="w-4 h-4" />
                  <span>{isHindi ? 'खाते में सीधे वाउचर पोस्ट करें' : 'Post Direct Bank Vouchers'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>

      </div>

      {/* Quick Add Bank Account Modal */}
      {showAddBankModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4">
          <div className="hv-surface border border-[var(--border-primary)] text-[var(--text-primary)] w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4">
            <h4 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-500" />
              <span>{isHindi ? 'नया बैंक खाता लेजर जोड़ें' : 'Create Bank Account Ledger'}</span>
            </h4>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[var(--text-secondary)] font-semibold mb-1 block">{isHindi ? 'बैंक का नाम (उदा. HDFC Bank, SBI)' : 'Bank Name (e.g. HDFC Bank, SBI)'}</label>
                <input
                  type="text"
                  value={newBankName}
                  onChange={(e) => setNewBankName(e.target.value)}
                  placeholder="e.g. HDFC Bank Current A/c"
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[var(--text-secondary)] font-semibold mb-1 block">{isHindi ? 'खाता संख्या (A/c No. अनिवार्य) *' : 'Company Bank Account Number *'}</label>
                <input
                  type="text"
                  value={newBankAccNo}
                  onChange={(e) => setNewBankAccNo(e.target.value)}
                  placeholder="e.g. 50200012345678"
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-lg px-3 py-2 font-mono focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {bankQuickErr && (
                <div className="p-2.5 hv-pill-rose border rounded-lg text-[11px] font-semibold">
                  {bankQuickErr}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddBankModal(false)}
                className="bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] px-3 py-1.5 rounded-lg text-xs font-bold transition"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleCreateNewBankQuick}
                disabled={!newBankName.trim() || !newBankAccNo.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white hv-keep-white px-4 py-1.5 rounded-lg text-xs font-bold transition"
              >
                {isHindi ? 'खाता बनाएं' : 'Create Ledger'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
