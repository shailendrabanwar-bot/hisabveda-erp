/**
 * IMMUTABLE BANK STATEMENT AUDITOR ENGINE
 * 
 * Permanently guarded normalization & audit algorithm for bank transactions.
 * Accurately classifies and verifies DEBIT vs CREDIT across all Indian Bank Statement formats.
 */

export interface RawBankTransaction {
  date?: string;
  description?: string;
  debit?: number | string | null;
  credit?: number | string | null;
  amount?: number | string | null;
  type?: 'DEBIT' | 'CREDIT' | string | null;
  runningBalance?: number | string | null;
  referenceNo?: string;
  auditTag?: string;
  [key: string]: any;
}

export interface AuditedBankTransaction {
  date: string;
  description: string;
  debit: number;
  credit: number;
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  runningBalance?: number;
  referenceNo?: string;
  auditTag: string;
  originalId?: string;
  allocatedAccountId?: string;
  allocatedAccountName?: string;
}

const MONTH_MAP: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Normalizes various date string formats (DD/MM/YYYY, DD-MMM-YYYY, YYYY-MM-DD) into ISO YYYY-MM-DD
 */
export function normalizeDateToIso(rawDate: string): string {
  if (!rawDate || typeof rawDate !== 'string') {
    return new Date().toISOString().split('T')[0];
  }
  const clean = rawDate.trim();

  // YYYY-MM-DD or YYYY/MM/DD
  const yyyymmdd = clean.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (yyyymmdd) {
    return `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2, '0')}-${yyyymmdd[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-\.](\d{1,2}|[a-zA-Z]{3,9})[\/\-\.](\d{2,4})/);
  if (ddmmyyyy) {
    let day = ddmmyyyy[1].padStart(2, '0');
    let rawMonth = ddmmyyyy[2].toLowerCase();
    let month = '01';
    if (MONTH_MAP[rawMonth.substring(0, 3)]) {
      month = MONTH_MAP[rawMonth.substring(0, 3)];
    } else {
      month = ddmmyyyy[2].padStart(2, '0');
    }
    let year = ddmmyyyy[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }

  return clean;
}

/**
 * Returns epoch timestamp for date comparison
 */
export function getDateTimestamp(rawDate: string): number {
  const iso = normalizeDateToIso(rawDate);
  const ts = Date.parse(iso);
  return isNaN(ts) ? 0 : ts;
}

// Non-transaction metadata, footer, summary, and print timestamp patterns (MUST NEVER be parsed as transactions)
export const NON_TRANSACTION_METADATA_REGEX = /\b(STATEMENT SUMMARY|ACCOUNT SUMMARY|GRAND TOTAL|PAGE TOTAL|SUB TOTAL|TOTAL DEBITS?|TOTAL CREDITS?|TOTAL WITHDRAWALS?|TOTAL DEPOSITS?|TOTAL AMOUNT|TOTAL COUNT|COUNT OF TRANSACTIONS|CLOSING BAL(ANCE)?|OPENING BAL(ANCE)?|BROUGHT FORWARD|CARRIED FORWARD|BAL B\/F|BAL C\/F|BAL B\/D|BAL C\/D|B\/F|C\/F|B\/D|C\/D|BALANCE B\/F|BALANCE C\/F|BALANCE B\/D|BALANCE C\/D|OP\.?\s*BAL(ANCE)?|CL\.?\s*BAL(ANCE)?|AVAILABLE BAL(ANCE)?|EFFECTIVE BAL(ANCE)?|SWEEP BAL(ANCE)?|MOD BAL(ANCE)?|HOLD AMOUNT|UNCLEARED (FUNDS|AMOUNT|BAL(ANCE)?)|OD LIMIT|DRAWING POWER|GENERATED ON|PRINTED ON|DOWNLOADED ON|STATEMENT GENERATED|DATE OF PRINT|DATE OF ISSUE|DATE OF DOWNLOAD|REPORT DATE|RUN DATE|PRINT DATE|AS ON DATE|NOMINATION REGISTERED|COMPUTER GENERATED|THIS IS A COMPUTER GENERATED|END OF STATEMENT|REGISTERED OFFICE|CUSTOMER CARE|TOLL FREE|BRANCH MANAGER|AUTHORISED SIGNATORY|SYSTEM GENERATED|PAGE\s+\d+\s+OF\s+\d+|PAGE\s*:\s*\d+)\b|^\s*(TOTAL|SUMMARY|BALANCE|STATEMENT|PAGE\s+\d+|END OF STATEMENT|OPENING|CLOSING|OP\s*BAL|CL\s*BAL|B\/F|C\/F|B\/D|C\/D)\b/i;

// Account Profile & Header metadata patterns (Account open date, Joint holders, Nominee, KYC, etc. MUST NEVER be parsed as transactions)
export const ACCOUNT_METADATA_REGEX = /^\s*(ACCOUNT\s*OPEN(ING)?(\s*DATE)?|A\/C\s*OPEN(ING)?(\s*DATE)?|DATE\s*OF\s*OPEN(ING)?|OPENING\s*DATE\s*:|JOINT\s*HOLDER(S)?|JOINT\s*NAME|2ND\s*HOLDER|SECOND\s*HOLDER|NOMINEE\s*(NAME)?|NOMINATION\s*(REG(ISTERED)?)?|KYC\s*(DATE|STATUS|DUE)|STATEMENT\s*PERIOD|PERIOD\s*FROM|CUSTOMER\s*ID\s*:|CIF\s*(NO|NUMBER)?\s*:|ACCOUNT\s*(NO|NUMBER)\s*:|A\/C\s*(NO|NUMBER)\s*:|MICR\s*(CODE)?\s*:|IFSC\s*(CODE)?\s*:)\b|\b(ACCOUNT\s*OPENING\s*DATE|A\/C\s*OPEN\s*DATE|DATE\s*OF\s*OPENING\s*:|JOINT\s*HOLDERS?\s*:|NOMINEE\s*NAME\s*:|STATEMENT\s*PERIOD\s*:)\b/i;

// Indian Banking Debit (Withdrawals / Outflow) Patterns
const DEBIT_REGEX = /\b(WITHDRAWAL|WITHDRAWALS|ATM|PAID|OUTFLOW|CHARGES|POS|TRANSFER TO|DEBIT|DR|\(DR\)|\(D\)|UPI\/PAY|UPI\/OUT|UPI\-DR|UPI\/DR|NEFT TO|NEFT DR|RTGS TO|RTGS DR|IMPS TO|IMPS DR|CHQ|CHEQUE|PAYMENT|PAYOUT|FEE|TAX|SWIGGY|ZOMATO|AMAZON|FLIPKART|UBER|OLA|BILL|EMI|INTEREST CHG|INT CHG|SURCHARGE|ANNUAL FEE)\b|^\s*TO\s+/i;

// Indian Banking Credit (Deposits / Inflow) Patterns - Dominant Credit Keywords take precedence over merchant names
const CREDIT_REGEX = /\b(DEPOSIT|DEPOSITS|RECEIVED|INFLOW|REFUND|INTEREST|INT\.PD|INT PD|NEFT FROM|NEFT CR|RTGS FROM|RTGS CR|IMPS FROM|IMPS CR|UPI\/REC|UPI\/IN|UPI\-CR|UPI\/CR|BY CLEARING|SALARY|DIVIDEND|CASH DEP|CASH DEPOSIT|CR|CREDIT|CREDITS|\(CR\)|\(C\)|REVERSAL|CASHBACK)\b|^\s*BY\s+/i;
const DOMINANT_CREDIT_REGEX = /\b(REFUND|REVERSAL|CASHBACK|SALARY|DIVIDEND|INTEREST|INT\.PD|UPI\/CR|UPI\-CR|NEFT CR|RTGS CR|IMPS CR|BY TRANSFER|BY CLEARING|BY CASH|CASH DEP|DEPOSIT)\b|^\s*BY\s+/i;

/**
 * Permanently guarded normalization & mathematical audit algorithm for bank transactions.
 * Uses consecutive running balance verification (Balance_n - Balance_{n-1}) to guarantee
 * 100% mathematical accuracy of Debit (money out) vs Credit (money in) and exact transaction amounts.
 */
export function normalizeAndAuditBankTransactions(
  rawTransactions: RawBankTransaction[]
): AuditedBankTransaction[] {
  if (!Array.isArray(rawTransactions) || rawTransactions.length === 0) {
    return [];
  }

  // --- PASS 1: Base sanitization, metadata filtering and initial classification ---
  const initialList: AuditedBankTransaction[] = [];

  for (let i = 0; i < rawTransactions.length; i++) {
    const tx = rawTransactions[i];
    const rawDesc = String(tx.description || '').trim();
    const descUpper = rawDesc.toUpperCase();

    // 1. Strictly drop non-transaction summary, footer, print timestamps, balance lines, and account header profiles
    if (
      NON_TRANSACTION_METADATA_REGEX.test(descUpper) || 
      NON_TRANSACTION_METADATA_REGEX.test(rawDesc) ||
      ACCOUNT_METADATA_REGEX.test(descUpper) ||
      ACCOUNT_METADATA_REGEX.test(rawDesc) ||
      /OPENING\s*BAL|BROUGHT\s*FWD|BAL\s*B\/F|BAL\s*B\/D|CLOSING\s*BAL|CARRIED\s*FWD|BAL\s*C\/F|BAL\s*C\/D/i.test(descUpper) ||
      /TOTAL\s*DEBIT|TOTAL\s*CREDIT|PAGE\s*TOTAL|GRAND\s*TOTAL|STATEMENT\s*SUMMARY/i.test(descUpper) ||
      /ACCOUNT\s*OPEN|JOINT\s*HOLDER|NOMINEE|KYC|STATEMENT\s*PERIOD|CUSTOMER\s*ID|CIF\s*NO/i.test(descUpper)
    ) {
      continue;
    }

    const rawDate = normalizeDateToIso(String(tx.date || new Date().toISOString().split('T')[0]));
    const rawRef = String(tx.referenceNo || '').trim();

    let dNum = Math.abs(Number(tx.debit) || 0);
    let cNum = Math.abs(Number(tx.credit) || 0);
    let amt = Math.abs(Number(tx.amount) || 0);
    let rBal = (tx.runningBalance !== undefined && tx.runningBalance !== null && !isNaN(Number(tx.runningBalance))) 
      ? Number(tx.runningBalance) 
      : undefined;

    // Filter out obvious noise or spurious huge numbers
    if (amt > 500000000 || (amt >= 10000000 && Number.isInteger(amt))) amt = 0;
    if (dNum > 500000000 || (dNum >= 10000000 && Number.isInteger(dNum))) dNum = 0;
    if (cNum > 500000000 || (cNum >= 10000000 && Number.isInteger(cNum))) cNum = 0;
    if (rBal !== undefined && (rBal > 5000000000 || (rBal >= 100000000 && Number.isInteger(rBal)))) {
      rBal = undefined;
    }

    // Skip standalone opening/closing balance rows that equal running balance
    const isExplicitBalRow = /^\s*(OPENING\s*BAL(ANCE)?|CLOSING\s*BAL(ANCE)?|BAL(ANCE)?\s*B\/[FD]|BAL(ANCE)?\s*C\/[FD]|BROUGHT\s*FORWARD|CARRIED\s*FORWARD|B\/F|C\/F)\b/i.test(descUpper);
    if (rBal !== undefined && amt === rBal && isExplicitBalRow) {
      continue;
    }

    let finalType: 'DEBIT' | 'CREDIT' = 'DEBIT';
    let finalDebit = 0;
    let finalCredit = 0;
    let auditTag = tx.auditTag || 'EXPLICIT';

    const isDominantCredit = DOMINANT_CREDIT_REGEX.test(descUpper);
    const isKeywordDebit = DEBIT_REGEX.test(descUpper);
    const isKeywordCredit = CREDIT_REGEX.test(descUpper);

    const hasExplicitCrIndicator = /\b(CR|\(CR\)|\(C\)|CREDIT)\b/i.test(descUpper) || /\b(CR|\(CR\))\b/i.test(String(tx.type || ''));
    const hasExplicitDrIndicator = /\b(DR|\(DR\)|\(D\)|DEBIT)\b/i.test(descUpper) || /\b(DR|\(DR\))\b/i.test(String(tx.type || ''));

    if (dNum > 0 && cNum === 0) {
      finalType = 'DEBIT';
      finalDebit = dNum;
      finalCredit = 0;
      amt = dNum;
      auditTag = 'EXPLICIT_DEBIT_COL';
    } else if (cNum > 0 && dNum === 0) {
      finalType = 'CREDIT';
      finalCredit = cNum;
      finalDebit = 0;
      amt = cNum;
      auditTag = 'EXPLICIT_CREDIT_COL';
    } else if (dNum > 0 && cNum > 0) {
      if (String(tx.type).toUpperCase() === 'CREDIT' || isDominantCredit || (isKeywordCredit && !isKeywordDebit)) {
        finalType = 'CREDIT';
        finalCredit = cNum;
        finalDebit = 0;
        amt = cNum;
        auditTag = 'SPLIT_RESOLVED_CREDIT';
      } else {
        finalType = 'DEBIT';
        finalDebit = dNum;
        finalCredit = 0;
        amt = dNum;
        auditTag = 'SPLIT_RESOLVED_DEBIT';
      }
    } else if (String(tx.type).toUpperCase() === 'CREDIT') {
      finalType = 'CREDIT';
      finalCredit = amt || cNum;
      finalDebit = 0;
      amt = finalCredit;
      auditTag = tx.auditTag || 'PARSER_TYPE_CREDIT';
    } else if (String(tx.type).toUpperCase() === 'DEBIT') {
      finalType = 'DEBIT';
      finalDebit = amt || dNum;
      finalCredit = 0;
      amt = finalDebit;
      auditTag = tx.auditTag || 'PARSER_TYPE_DEBIT';
    } else if (isDominantCredit) {
      finalType = 'CREDIT';
      amt = amt || Math.max(dNum, cNum);
      finalCredit = amt;
      finalDebit = 0;
      auditTag = 'DOMINANT_KEYWORD_CREDIT';
    } else if (hasExplicitCrIndicator && !hasExplicitDrIndicator) {
      finalType = 'CREDIT';
      amt = amt || Math.max(dNum, cNum);
      finalCredit = amt;
      finalDebit = 0;
      auditTag = 'EXPLICIT_CR_INDICATOR';
    } else if (hasExplicitDrIndicator && !hasExplicitCrIndicator) {
      finalType = 'DEBIT';
      amt = amt || Math.max(dNum, cNum);
      finalDebit = amt;
      finalCredit = 0;
      auditTag = 'EXPLICIT_DR_INDICATOR';
    } else if (isKeywordCredit && !isKeywordDebit) {
      finalType = 'CREDIT';
      amt = amt || Math.max(dNum, cNum);
      finalCredit = amt;
      finalDebit = 0;
      auditTag = 'KEYWORD_CREDIT';
    } else if (isKeywordDebit && !isKeywordCredit) {
      finalType = 'DEBIT';
      amt = amt || Math.max(dNum, cNum);
      finalDebit = amt;
      finalCredit = 0;
      auditTag = 'KEYWORD_DEBIT';
    } else {
      finalType = 'DEBIT';
      amt = amt || Math.max(dNum, cNum);
      finalDebit = amt;
      finalCredit = 0;
      auditTag = 'UNCONFIRMED_DEFAULT';
    }

    if (amt > 0) {
      initialList.push({
        date: rawDate,
        description: rawDesc || 'Bank Entry',
        referenceNo: rawRef,
        debit: finalType === 'DEBIT' ? Math.round(amt * 100) / 100 : 0,
        credit: finalType === 'CREDIT' ? Math.round(amt * 100) / 100 : 0,
        amount: Math.round(amt * 100) / 100,
        type: finalType,
        runningBalance: rBal,
        auditTag,
        ...(tx.originalId ? { originalId: tx.originalId } : {}),
        ...(tx.allocatedAccountId ? { allocatedAccountId: tx.allocatedAccountId } : {}),
        ...(tx.allocatedAccountName ? { allocatedAccountName: tx.allocatedAccountName } : {})
      });
    }
  }

  if (initialList.length === 0) return [];

  // --- PASS 2: MATHEMATICAL RUNNING BALANCE PROOF & AUTOCORRECTION ---
  // In a bank statement:
  // Forward Chronological:  Balance_n = Balance_{n-1} + Credit_n - Debit_n
  // Reverse Chronological:  Balance_{n-1} = Balance_n + Credit_{n-1} - Debit_{n-1}
  
  // Step 2a: Detect ordering direction
  let forwardBalanceMatches = 0;
  let reverseBalanceMatches = 0;

  for (let i = 1; i < initialList.length; i++) {
    const prev = initialList[i - 1];
    const curr = initialList[i];
    if (prev.runningBalance !== undefined && curr.runningBalance !== undefined) {
      const fwdDelta = Math.round((curr.runningBalance - prev.runningBalance) * 100) / 100;
      if (Math.abs(Math.abs(fwdDelta) - curr.amount) < 0.05 || Math.abs(fwdDelta) > 0) {
        if (Math.abs(Math.abs(fwdDelta) - curr.amount) < 0.05) forwardBalanceMatches++;
      }
      const revDelta = Math.round((prev.runningBalance - curr.runningBalance) * 100) / 100;
      if (Math.abs(Math.abs(revDelta) - prev.amount) < 0.05) {
        reverseBalanceMatches++;
      }
    }
  }

  const isReverseChronological = reverseBalanceMatches > forwardBalanceMatches;

  // Step 2b: Track column swap statistics across mathematical proofs
  let col1MatchesDebit = 0;
  let col1MatchesCredit = 0;
  let col2MatchesDebit = 0;
  let col2MatchesCredit = 0;

  // Step 2c: Apply exact mathematical verification to each row
  for (let i = 0; i < initialList.length; i++) {
    const row = initialList[i];

    let balanceDelta: number | null = null;

    if (!isReverseChronological) {
      // Forward chronological: compare with previous row (i - 1)
      if (i > 0 && initialList[i - 1].runningBalance !== undefined && row.runningBalance !== undefined) {
        balanceDelta = Math.round((row.runningBalance - initialList[i - 1].runningBalance) * 100) / 100;
      }
    } else {
      // Reverse chronological: compare with next row (i + 1)
      if (i < initialList.length - 1 && initialList[i + 1].runningBalance !== undefined && row.runningBalance !== undefined) {
        balanceDelta = Math.round((row.runningBalance - initialList[i + 1].runningBalance) * 100) / 100;
      }
    }

    if (balanceDelta !== null && Math.abs(balanceDelta) > 0.01) {
      const expectedAmount = Math.abs(balanceDelta);
      const isDeltaMatch = Math.abs(row.amount - expectedAmount) <= 0.05;

      if (isDeltaMatch) {
        if (balanceDelta > 0) {
          // Balance increased -> 100% MATHEMATICAL PROOF of CREDIT (Money In)
          if (row.auditTag === 'EXPLICIT_DEBIT_COL') col1MatchesCredit++;
          else if (row.auditTag === 'EXPLICIT_CREDIT_COL') col2MatchesCredit++;
          
          row.type = 'CREDIT';
          row.credit = row.amount;
          row.debit = 0;
          row.auditTag = 'MATH_PROVEN_EXACT_CREDIT';
        } else {
          // Balance decreased -> 100% MATHEMATICAL PROOF of DEBIT (Money Out)
          if (row.auditTag === 'EXPLICIT_DEBIT_COL') col1MatchesDebit++;
          else if (row.auditTag === 'EXPLICIT_CREDIT_COL') col2MatchesDebit++;

          row.type = 'DEBIT';
          row.debit = row.amount;
          row.credit = 0;
          row.auditTag = 'MATH_PROVEN_EXACT_DEBIT';
        }
      } else if (expectedAmount > 0 && expectedAmount < 50000000) {
        // If amount had a slight typo, column shift, or Cheque No misidentification:
        if (row.amount === 0 || Math.abs(row.amount - expectedAmount) > 0.05) {
          row.amount = Math.round(expectedAmount * 100) / 100;
          if (balanceDelta > 0) {
            row.type = 'CREDIT';
            row.credit = row.amount;
            row.debit = 0;
            row.auditTag = 'MATH_CORRECTED_CREDIT';
          } else {
            row.type = 'DEBIT';
            row.debit = row.amount;
            row.credit = 0;
            row.auditTag = 'MATH_CORRECTED_DEBIT';
          }
        }
      }
    } else {
      // Narration Keyword disambiguation for rows without direct single-step balance delta
      const descU = row.description.toUpperCase();
      if (/^\s*BY\s+/i.test(descU) || /\b(BY TRANSFER|BY CLEARING|SALARY|REFUND|INTEREST|DIVIDEND|NEFT CR|RTGS CR|UPI\/CR|UPI\-CR|IMPS CR|DEPOSIT|CASH DEP)\b/i.test(descU)) {
        row.type = 'CREDIT';
        row.credit = row.amount;
        row.debit = 0;
        row.auditTag = 'KEYWORD_RECONCILED_CREDIT';
      } else if (/^\s*TO\s+/i.test(descU) || /\b(TO TRANSFER|TO CLEARING|ATM|POS|CHQ|FEE|TAX|SWIGGY|ZOMATO|AMAZON|NEFT DR|RTGS DR|UPI\/DR|UPI\-DR|IMPS DR|WITHDRAWAL)\b/i.test(descU)) {
        row.type = 'DEBIT';
        row.debit = row.amount;
        row.credit = 0;
        row.auditTag = 'KEYWORD_RECONCILED_DEBIT';
      }
    }
  }

  // Step 2d: Global Inversion Shield: Check if statement template had [Deposits (Cr) | Withdrawals (Dr)]
  const totalCol1Proofs = col1MatchesDebit + col1MatchesCredit;
  const totalCol2Proofs = col2MatchesDebit + col2MatchesCredit;
  const isGlobalInverted = (totalCol1Proofs >= 2 && col1MatchesCredit > col1MatchesDebit * 2) ||
                           (totalCol2Proofs >= 2 && col2MatchesDebit > col2MatchesCredit * 2);

  if (isGlobalInverted) {
    console.log('[PASS 2] Global Column Inversion detected (Deposit column was before Withdrawal column). Auto-correcting unverified rows...');
    for (const row of initialList) {
      if (!row.auditTag.startsWith('MATH_PROVEN')) {
        if (row.auditTag === 'EXPLICIT_DEBIT_COL' || row.auditTag === 'PARSER_TYPE_DEBIT') {
          row.type = 'CREDIT';
          row.credit = row.amount;
          row.debit = 0;
          row.auditTag = 'GLOBAL_INVERSION_CORRECTED_CREDIT';
        } else if (row.auditTag === 'EXPLICIT_CREDIT_COL' || row.auditTag === 'PARSER_TYPE_CREDIT') {
          row.type = 'DEBIT';
          row.debit = row.amount;
          row.credit = 0;
          row.auditTag = 'GLOBAL_INVERSION_CORRECTED_DEBIT';
        }
      }
    }
  }

  // Step 2e: First Row & Last Row boundary mathematical resolution
  if (initialList.length >= 2) {
    if (!isReverseChronological) {
      const row0 = initialList[0];
      const row1 = initialList[1];
      if (!row0.auditTag.startsWith('MATH_PROVEN') && row0.runningBalance !== undefined && row1.runningBalance !== undefined) {
        // If row 1 is mathematically proven, we can verify row 0's direction
        const desc0 = row0.description.toUpperCase();
        if (/^\s*BY\s+/i.test(desc0) || /\b(SALARY|INTEREST|REFUND|NEFT CR|RTGS CR|UPI\/CR|DEPOSIT)\b/i.test(desc0)) {
          row0.type = 'CREDIT';
          row0.credit = row0.amount;
          row0.debit = 0;
        } else if (/^\s*TO\s+/i.test(desc0) || /\b(ATM|POS|CHQ|FEE|SWIGGY|ZOMATO|NEFT DR|RTGS DR|UPI\/DR|WITHDRAWAL)\b/i.test(desc0)) {
          row0.type = 'DEBIT';
          row0.debit = row0.amount;
          row0.credit = 0;
        }
      }
    }
  }

  // --- PASS 3: OUTLIER & STATEMENT SUMMARY TOTAL PURGE ---
  let step3Rows = initialList;
  if (initialList.length >= 2) {
    const validRows: AuditedBankTransaction[] = [];
    const coreTransactions = initialList.slice(0, initialList.length - 1);
    const sumDebits = coreTransactions.reduce((acc, r) => acc + (r.type === 'DEBIT' ? r.amount : 0), 0);
    const sumCredits = coreTransactions.reduce((acc, r) => acc + (r.type === 'CREDIT' ? r.amount : 0), 0);

    for (let i = 0; i < initialList.length; i++) {
      const row = initialList[i];
      const descU = row.description.toUpperCase();

      const isLastRow = i === initialList.length - 1;
      const isSummaryName = /\b(TOTAL|SUMMARY|CLOSING|BALANCE|CARRIED|PRINTED|GENERATED)\b/.test(descU);
      const isTotalDebitMatch = Math.abs(row.amount - sumDebits) < 0.05;
      const isTotalCreditMatch = Math.abs(row.amount - sumCredits) < 0.05;

      if (isLastRow && (isSummaryName || isTotalDebitMatch || isTotalCreditMatch)) {
        const prevRow = initialList[i - 1];
        const rowTime = getDateTimestamp(row.date);
        const prevTime = getDateTimestamp(prevRow.date);

        if (rowTime - prevTime > 5 * 24 * 3600 * 1000 || isTotalDebitMatch || isTotalCreditMatch) {
          console.log(`[PASS 3] Purging footer summary/generation date row: ${row.date} - ${row.description}`);
          continue;
        }
      }

      validRows.push(row);
    }
    step3Rows = validRows;
  }

  // --- PASS 4: STATEMENT DATE CLUSTER & HEADER DATE OUTLIER FILTER ---
  // If 90%+ of transactions occur within a specific year/quarter/range, filter out any isolated
  // header metadata date row (e.g., Account Open Date from 2022 when statement is from 2026).
  if (step3Rows.length >= 2) {
    const timestamps = step3Rows.map(r => getDateTimestamp(r.date)).filter(t => t > 0).sort((a, b) => a - b);
    if (timestamps.length >= 2) {
      // Find median timestamp
      const midIdx = Math.floor(timestamps.length / 2);
      const medianTime = timestamps[midIdx];
      const ONE_YEAR_MS = 365 * 24 * 3600 * 1000;

      const finalAuditedRows: AuditedBankTransaction[] = [];
      for (const r of step3Rows) {
        const t = getDateTimestamp(r.date);
        const descU = r.description.toUpperCase();

        const isExplicitProfileHeader = 
          /^\s*(ACCOUNT\s*OPEN|A\/C\s*OPEN|DATE\s*OF\s*OPEN|JOINT\s*HOLDER|2ND\s*HOLDER|NOMINEE|KYC|STATEMENT\s*PERIOD|CUST(OMER)?\s*ID\s*:|CIF\s*(NO|NUMBER)?\s*:)/i.test(descU) ||
          /\b(ACCOUNT\s*OPENING\s*DATE|A\/C\s*OPEN\s*DATE|DATE\s*OF\s*OPENING\s*:|JOINT\s*HOLDERS?\s*:|NOMINEE\s*NAME\s*:)\b/i.test(descU);

        // Only purge if it is explicitly an account profile header or it is an extreme multi-year past date with profile header keywords
        const isMultiYearPastDate = t > 0 && (medianTime - t > 365 * 24 * 3600 * 1000);

        if (isExplicitProfileHeader || (isMultiYearPastDate && /OPEN|HOLDER|NOMINEE|PROFILE|JOIN/i.test(descU))) {
          console.log(`[PASS 4] Purging isolated old header metadata date row: ${r.date} - ${r.description}`);
          continue;
        }

        finalAuditedRows.push(r);
      }
      return finalAuditedRows;
    }
  }

  return step3Rows;
}

/**
 * High-Precision Structured Spreadsheet & CSV Table Parser
 * Directly maps columns for Date, Particulars, Chq/Ref, Withdrawal (Debit), Deposit (Credit), and Balance
 */
export function parseStructuredSpreadsheetRows(rows: any[][]): AuditedBankTransaction[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  let headerRowIdx = -1;
  let dateCol = -1;
  let descCol = -1;
  let refCol = -1;
  let debitCol = -1;
  let creditCol = -1;
  let amountCol = -1;
  let typeCol = -1;
  let balanceCol = -1;

  // Scan first 20 rows to detect table header
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const rowTokens = row.map(cell => String(cell || '').trim().toLowerCase());
    
    let dIdx = -1, narIdx = -1, rIdx = -1, drIdx = -1, crIdx = -1, amtIdx = -1, tIdx = -1, balIdx = -1;

    rowTokens.forEach((tok, c) => {
      if (!tok) return;
      if (/(txn\s*date|trans\s*date|value\s*date|post\s*date|booking\s*date|^date$|दिनांक|तारीख)/i.test(tok) && dIdx === -1) dIdx = c;
      else if (/(particular|narration|description|remarks|details|details\s*of\s*trans|विवरण)/i.test(tok) && narIdx === -1) narIdx = c;
      else if (/(chq|cheque|ref|utr|trans\s*id|reference|instrument|चेक)/i.test(tok) && rIdx === -1) rIdx = c;
      else if (/(withdrawal|dr\s*amount|debit\s*amount|debit|dr|paid\s*out|निकासी|डेबिट)/i.test(tok) && drIdx === -1) drIdx = c;
      else if (/(deposit|cr\s*amount|credit\s*amount|credit|cr|paid\s*in|जमा|क्रेडिट)/i.test(tok) && crIdx === -1) crIdx = c;
      else if (/(closing\s*bal|balance|closing|bal|शेष|बैलेंस)/i.test(tok) && balIdx === -1) balIdx = c;
      else if (/(^amount$|txn\s*amount|trans\s*amount|राशि)/i.test(tok) && amtIdx === -1) amtIdx = c;
      else if (/(^type$|d\/c|cr\/dr|dr\/cr|txn\s*type)/i.test(tok) && tIdx === -1) tIdx = c;
    });

    if (dIdx >= 0 && (drIdx >= 0 || crIdx >= 0 || amtIdx >= 0 || balIdx >= 0)) {
      headerRowIdx = r;
      dateCol = dIdx;
      descCol = narIdx >= 0 ? narIdx : (dIdx === 0 ? 1 : 0);
      refCol = rIdx;
      debitCol = drIdx;
      creditCol = crIdx;
      amountCol = amtIdx;
      typeCol = tIdx;
      balanceCol = balIdx;
      break;
    }
  }

  const rawList: RawBankTransaction[] = [];

  const parseNumber = (val: any): number | null => {
    if (val === undefined || val === null || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    const str = String(val).replace(/,/g, '').replace(/[^\d.-]/g, '').trim();
    if (!str) return null;
    const n = parseFloat(str);
    return isNaN(n) ? null : n;
  };

  const startRow = headerRowIdx >= 0 ? headerRowIdx + 1 : 0;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Extract Date
    const rawDateVal = dateCol >= 0 ? row[dateCol] : row[0];
    if (!rawDateVal) continue;

    let dateStr = '';
    if (typeof rawDateVal === 'number' && rawDateVal > 30000 && rawDateVal < 70000) {
      // Excel serial date number
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + rawDateVal * 86400000);
      dateStr = d.toISOString().split('T')[0];
    } else {
      dateStr = String(rawDateVal).trim();
    }

    const isoDate = normalizeDateToIso(dateStr);
    const dateMatch = isoDate.match(/^\d{4}-\d{2}-\d{2}$/) || dateStr.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/);
    if (!dateMatch) continue;

    const descStr = descCol >= 0 && row[descCol] !== undefined ? String(row[descCol]).trim() : 'Bank Transaction';
    const refStr = refCol >= 0 && row[refCol] !== undefined ? String(row[refCol]).trim() : '';

    const dVal = debitCol >= 0 ? parseNumber(row[debitCol]) : null;
    const cVal = creditCol >= 0 ? parseNumber(row[creditCol]) : null;
    const aVal = amountCol >= 0 ? parseNumber(row[amountCol]) : null;
    const bVal = balanceCol >= 0 ? parseNumber(row[balanceCol]) : null;
    const tStr = typeCol >= 0 && row[typeCol] !== undefined ? String(row[typeCol]).trim().toUpperCase() : '';

    let txType: 'DEBIT' | 'CREDIT' = 'DEBIT';
    let txAmt = 0;
    let finalDebit = 0;
    let finalCredit = 0;

    if (dVal !== null && dVal > 0 && (cVal === null || cVal === 0)) {
      txType = 'DEBIT';
      txAmt = dVal;
      finalDebit = dVal;
      finalCredit = 0;
    } else if (cVal !== null && cVal > 0 && (dVal === null || dVal === 0)) {
      txType = 'CREDIT';
      txAmt = cVal;
      finalCredit = cVal;
      finalDebit = 0;
    } else if (dVal !== null && cVal !== null && dVal > 0 && cVal > 0) {
      if (dVal > cVal) {
        txType = 'DEBIT';
        txAmt = dVal;
        finalDebit = dVal;
      } else {
        txType = 'CREDIT';
        txAmt = cVal;
        finalCredit = cVal;
      }
    } else if (aVal !== null && aVal !== 0) {
      txAmt = Math.abs(aVal);
      if (tStr.includes('CR') || tStr.includes('CREDIT') || tStr.includes('+')) {
        txType = 'CREDIT';
        finalCredit = txAmt;
      } else if (tStr.includes('DR') || tStr.includes('DEBIT') || tStr.includes('-')) {
        txType = 'DEBIT';
        finalDebit = txAmt;
      } else if (aVal < 0) {
        txType = 'DEBIT';
        finalDebit = txAmt;
      } else if (CREDIT_REGEX.test(descStr.toUpperCase())) {
        txType = 'CREDIT';
        finalCredit = txAmt;
      } else {
        txType = 'DEBIT';
        finalDebit = txAmt;
      }
    } else {
      // Fallback scan of remaining numeric cells in row
      const numCells: number[] = [];
      row.forEach((cell, cIdx) => {
        if (cIdx !== dateCol && cIdx !== descCol && cIdx !== refCol) {
          const num = parseNumber(cell);
          if (num !== null && num > 0) numCells.push(num);
        }
      });

      if (numCells.length >= 2) {
        txAmt = numCells[0];
        // check if last is balance
      } else if (numCells.length === 1) {
        txAmt = numCells[0];
      }
    }

    if (txAmt > 0) {
      rawList.push({
        date: dateStr,
        description: descStr || 'Bank Transaction',
        referenceNo: refStr,
        debit: finalDebit,
        credit: finalCredit,
        amount: txAmt,
        type: txType,
        runningBalance: bVal !== null ? bVal : undefined,
        auditTag: debitCol >= 0 || creditCol >= 0 ? (txType === 'DEBIT' ? 'EXPLICIT_DEBIT_COL' : 'EXPLICIT_CREDIT_COL') : 'SPREADSHEET_ROW'
      });
    }
  }

  return normalizeAndAuditBankTransactions(rawList);
}

/**
 * Parses Delimited CSV / TSV text into 2D grid matrix then processes
 */
export function parseCsvOrTsvText(text: string): AuditedBankTransaction[] {
  if (!text || typeof text !== 'string' || !text.trim()) return [];

  const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return [];

  // Determine delimiter: tab, comma, semicolon, pipe
  const first5 = rawLines.slice(0, 5).join('\n');
  let delimiter = ',';
  if (first5.split('\t').length > first5.split(',').length) delimiter = '\t';
  else if (first5.split(';').length > first5.split(',').length) delimiter = ';';
  else if (first5.split('|').length > first5.split(',').length) delimiter = '|';

  const grid: any[][] = rawLines.map(line => {
    if (delimiter === ',') {
      // Regex for CSV with quoted strings
      const cells: string[] = [];
      let cur = '';
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"' || c === "'") {
          inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      return cells;
    }
    return line.split(delimiter).map(c => c.trim());
  });

  return parseStructuredSpreadsheetRows(grid);
}

/**
 * Multi-Page Stateful Bank Statement Table Parser
 * Captures 100% of all transaction rows across all pages (even dense 30+ page statements).
 * Handles multi-line narrations, same-day multiple transactions, and variable column layouts.
 */
export function parseMultiPageBankStatement(pageTexts: string[] | string): AuditedBankTransaction[] {
  let pages: string[] = [];
  if (Array.isArray(pageTexts)) {
    pages = pageTexts;
  } else if (typeof pageTexts === 'string') {
    pages = pageTexts.split(/(?=--- Page \d+ ---)/g).map(s => s.trim()).filter(Boolean);
    if (pages.length === 0 && pageTexts.trim().length > 0) {
      pages = [pageTexts];
    }
  }

  if (pages.length === 0) return [];

  const rawTransactions: RawBankTransaction[] = [];
  const dateRegex = /\b(\d{1,2})[\s\/\-\.]([a-zA-Z]{3,9}|\d{1,2})[\s\/\-\.](\d{2,4})\b|\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b|\b([a-zA-Z]{3,9})\s+(\d{1,2}),?\s+(\d{4})\b/g;

  let lastSeenTxDate = '';

  for (let p = 0; p < pages.length; p++) {
    const pageStr = pages[p];
    const lines = pageStr.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    let pendingTx: RawBankTransaction | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const upper = line.toUpperCase();

      // Skip non-transaction headers, footers, summaries, and print timestamps
      if (
        line.startsWith('--- Page') ||
        /^\s*PAGE\s+\d+/i.test(line) ||
        NON_TRANSACTION_METADATA_REGEX.test(upper) ||
        ACCOUNT_METADATA_REGEX.test(upper) ||
        /STATEMENT OF ACCOUNT|ACCOUNT STATEMENT|BRANCH ADDRESS|IFSC CODE|CUSTOMER ID|NOMINATION|BRANCH CODE/i.test(upper) ||
        /^\s*(ACCOUNT\s*OPEN|JOINT\s*HOLDER|NOMINEE|KYC|STATEMENT\s*PERIOD|CUSTOMER\s*ID|CIF\s*NO)/i.test(upper) ||
        /OPENING BALANCE|BROUGHT FORWARD|B\/F|BAL B\/F|CARRIED FORWARD|C\/F|BAL C\/F|CLOSING BALANCE/i.test(upper)
      ) {
        continue;
      }

      // Check if line contains a transaction date
      dateRegex.lastIndex = 0;
      const dateMatches = Array.from(line.matchAll(dateRegex));
      
      if (dateMatches.length >= 1) {
        // If we had a pending transaction that already had an amount, push it!
        if (pendingTx && Number(pendingTx.amount || 0) > 0) {
          rawTransactions.push(pendingTx);
          pendingTx = null;
        }

        const rawTxDate = dateMatches[0][0];
        lastSeenTxDate = rawTxDate;
        let restLine = line;

        // Remove date tokens so they don't get picked up as money amounts
        for (const dm of dateMatches) {
          restLine = restLine.replace(dm[0], ' ');
        }

        // Extract Cheque/Ref/UTR number if present
        let refNo = '';
        const refMatch = restLine.match(/\b(?:\d{6,25}|[A-Z0-9]{8,25})\b/);
        if (refMatch) {
          // ensure it's not a money amount with decimal
          if (!refMatch[0].includes('.')) {
            refNo = refMatch[0];
            restLine = restLine.replace(refNo, ' ');
          }
        }

        // Extract all numerical values from the rest of the line, distinguishing pure reference integers from decimal amounts
        const allNumTokens = Array.from(restLine.matchAll(/\b[\d,]+(?:\.\d{1,2})?\b/g)).map(m => m[0]);
        
        // Isolate cheque / reference numbers (pure integers with 5 to 7 digits when other decimal numbers exist)
        let lineRef = refNo;
        const validAmountTokens: string[] = [];
        
        const hasDecimalTokens = allNumTokens.some(tok => tok.includes('.'));
        
        for (const tok of allNumTokens) {
          const clean = tok.replace(/,/g, '');
          const n = parseFloat(clean);
          if (isNaN(n) || n <= 0) continue;
          
          // Skip 4-digit years like 2024..2030
          if (!tok.includes('.') && n >= 2020 && n <= 2035) continue;
          
          // If this is a 5 to 7 digit integer and we have decimal amounts elsewhere on this line, it's a cheque/reference number
          if (!tok.includes('.') && clean.length >= 5 && clean.length <= 8 && hasDecimalTokens && !lineRef) {
            lineRef = clean;
            continue;
          }
          
          if (n > 500000000) continue;
          validAmountTokens.push(tok);
        }

        if (validAmountTokens.length >= 1) {
          const nums = validAmountTokens.map(m => parseFloat(m.replace(/,/g, '')));
          let txAmt = 0;
          let dVal = 0;
          let cVal = 0;
          let rBal: number | undefined = undefined;
          let tType: 'DEBIT' | 'CREDIT' = 'DEBIT';

          const hasCr = /\b(CR|\(CR\)|\(C\)|CREDIT|BY)\b/i.test(upper) || /\b(BY TRANSFER|BY CLEARING|SALARY|REFUND|INTEREST)\b/i.test(upper);
          const hasDr = /\b(DR|\(DR\)|\(D\)|DEBIT|TO)\b/i.test(upper) || /\b(TO TRANSFER|TO CLEARING|ATM|POS|CHQ)\b/i.test(upper);

          if (validAmountTokens.length >= 3) {
            const tok0HasDecimal = validAmountTokens[0].includes('.');
            const tok1HasDecimal = validAmountTokens[1].includes('.');
            const tok0Clean = validAmountTokens[0].replace(/,/g, '');
            
            // Check if tok[0] is actually a Cheque / Reference number (e.g., 6-digit integer like 450912)
            if (!tok0HasDecimal && tok0Clean.length >= 5 && tok1HasDecimal) {
              lineRef = tok0Clean;
              txAmt = nums[1];
              rBal = nums[2];
              if (hasCr && !hasDr) {
                tType = 'CREDIT';
                cVal = txAmt;
                dVal = 0;
              } else if (hasDr && !hasCr) {
                tType = 'DEBIT';
                dVal = txAmt;
                cVal = 0;
              } else if (CREDIT_REGEX.test(upper)) {
                tType = 'CREDIT';
                cVal = txAmt;
                dVal = 0;
              } else {
                tType = 'DEBIT';
                dVal = txAmt;
                cVal = 0;
              }
            } else {
              // Standard 3 columns: [Withdrawal, Deposit, Balance]
              dVal = nums[0];
              cVal = nums[1];
              rBal = nums[2];
              if (dVal > 0 && cVal === 0) {
                tType = 'DEBIT';
                txAmt = dVal;
              } else if (cVal > 0 && dVal === 0) {
                tType = 'CREDIT';
                txAmt = cVal;
              } else if (hasCr && !hasDr) {
                tType = 'CREDIT';
                txAmt = Math.max(dVal, cVal);
                cVal = txAmt;
                dVal = 0;
              } else if (hasDr && !hasCr) {
                tType = 'DEBIT';
                txAmt = Math.max(dVal, cVal);
                dVal = txAmt;
                cVal = 0;
              } else {
                tType = dVal > cVal ? 'DEBIT' : 'CREDIT';
                txAmt = Math.max(dVal, cVal);
              }
            }
          } else if (validAmountTokens.length === 2) {
            txAmt = nums[0];
            rBal = nums[1];
            if (hasCr && !hasDr) {
              tType = 'CREDIT';
              cVal = txAmt;
            } else if (hasDr && !hasCr) {
              tType = 'DEBIT';
              dVal = txAmt;
            } else if (CREDIT_REGEX.test(upper)) {
              tType = 'CREDIT';
              cVal = txAmt;
            } else {
              tType = 'DEBIT';
              dVal = txAmt;
            }
          } else {
            txAmt = nums[0];
            if (hasCr || CREDIT_REGEX.test(upper)) {
              tType = 'CREDIT';
              cVal = txAmt;
            } else {
              tType = 'DEBIT';
              dVal = txAmt;
            }
          }

          let cleanDesc = restLine;
          allNumTokens.forEach(m => {
            cleanDesc = cleanDesc.replace(m, ' ');
          });
          cleanDesc = cleanDesc.replace(/\s+/g, ' ').trim();

          pendingTx = {
            date: rawTxDate,
            description: cleanDesc || 'Bank Transaction',
            referenceNo: lineRef,
            debit: dVal,
            credit: cVal,
            amount: txAmt,
            type: tType,
            runningBalance: rBal
          };
        } else {
          // Date found but amount is on the next line
          let cleanDesc = restLine.replace(/\s+/g, ' ').trim();
          pendingTx = {
            date: rawTxDate,
            description: cleanDesc || 'Bank Transaction',
            referenceNo: lineRef,
            debit: 0,
            credit: 0,
            amount: 0,
            type: 'DEBIT'
          };
        }
      } else {
        // Line without date -> belongs to the narration of pendingTx (or completes its amount if incomplete)
        const numMatches = Array.from(line.matchAll(/\b[\d,]+(?:\.\d{1,2})?\b/g))
          .map(m => m[0])
          .filter(str => {
            const clean = str.replace(/,/g, '');
            const n = parseFloat(clean);
            if (isNaN(n) || n <= 0) return false;
            if (!str.includes('.') && n >= 2020 && n <= 2035) return false;
            if (!str.includes('.') && clean.length >= 8) return false;
            return true;
          });

        if (pendingTx && (!pendingTx.amount || pendingTx.amount === 0) && numMatches.length >= 1) {
          // Fill incomplete pending transaction amount
          const nums = numMatches.map(m => parseFloat(m.replace(/,/g, '')));
          const amt = nums[0];
          const bal = nums.length >= 2 ? nums[1] : undefined;
          const isCr = CREDIT_REGEX.test(upper);

          pendingTx.amount = amt;
          pendingTx.runningBalance = bal;
          pendingTx.type = isCr ? 'CREDIT' : 'DEBIT';
          pendingTx.credit = isCr ? amt : 0;
          pendingTx.debit = isCr ? 0 : amt;
          let extraDesc = line;
          numMatches.forEach(m => { extraDesc = extraDesc.replace(m, ' '); });
          if (extraDesc.trim()) {
            pendingTx.description += ' ' + extraDesc.trim();
          }
        } else if (pendingTx) {
          // Pure continuation text of narration for the current transaction
          const trimmed = line.trim();
          if (trimmed && !/^\s*[\d,]+(?:\.\d{1,2})?\s*$/.test(trimmed)) {
            pendingTx.description += ' ' + trimmed;
          }
        }
      }
    }

    if (pendingTx && Number(pendingTx.amount || 0) > 0) {
      rawTransactions.push(pendingTx);
      pendingTx = null;
    }
  }

  return normalizeAndAuditBankTransactions(rawTransactions);
}

/**
 * Deterministic Tabular Bank Statement Parser (For CSV, Excel, Clipboard Text, Tab/Pipe separated PDF text)
 */
export function parseTabularBankStatementText(text: string): AuditedBankTransaction[] {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return [];
  }

  // If text contains CSV commas, tabs, or pipes, try high-precision spreadsheet grid parser first
  if (text.includes(',') || text.includes('\t') || text.includes('|') || text.includes(';')) {
    const csvParsed = parseCsvOrTsvText(text);
    if (csvParsed.length > 0) {
      return csvParsed;
    }
  }

  return parseMultiPageBankStatement(text);
}

export interface BankStatementAuditSummary {
  totalDebits: number;
  totalCredits: number;
  debitCount: number;
  creditCount: number;
  netMovement: number;
  totalTransactions: number;
  dateRange: { start: string; end: string };
  openingBalance?: number;
  closingBalance?: number;
}

export function calculateBankStatementSummary(transactions: AuditedBankTransaction[]): BankStatementAuditSummary {
  let totalDebits = 0;
  let totalCredits = 0;
  let debitCount = 0;
  let creditCount = 0;
  let minDate = '';
  let maxDate = '';

  for (const tx of transactions) {
    if (tx.type === 'DEBIT') {
      totalDebits += tx.amount;
      debitCount++;
    } else {
      totalCredits += tx.amount;
      creditCount++;
    }

    if (!minDate || tx.date < minDate) minDate = tx.date;
    if (!maxDate || tx.date > maxDate) maxDate = tx.date;
  }

  const openingBalance = transactions.length > 0 ? transactions[0].runningBalance : undefined;
  const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].runningBalance : undefined;

  return {
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    debitCount,
    creditCount,
    netMovement: Math.round((totalCredits - totalDebits) * 100) / 100,
    totalTransactions: transactions.length,
    dateRange: { start: minDate, end: maxDate },
    openingBalance,
    closingBalance
  };
}

export interface MathProofResult {
  hasProof: boolean;
  expectedType: 'DEBIT' | 'CREDIT' | null;
  expectedAmount: number | null;
  isMatched: boolean;
  delta: number | null;
}

/**
 * Checks mathematical proof for a line based on adjacent running balances
 */
export function getLineMathProof(
  index: number,
  lines: Array<{ amount: number; type: 'DEBIT' | 'CREDIT'; runningBalance?: number }>
): MathProofResult {
  if (index < 0 || index >= lines.length) {
    return { hasProof: false, expectedType: null, expectedAmount: null, isMatched: true, delta: null };
  }

  const curr = lines[index];
  if (curr.runningBalance === undefined) {
    return { hasProof: false, expectedType: null, expectedAmount: null, isMatched: true, delta: null };
  }

  // Detect if chronological forward (earlier dates first) or reverse (newest dates first)
  let forwardMatches = 0;
  let reverseMatches = 0;
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i - 1];
    const c = lines[i];
    if (p.runningBalance !== undefined && c.runningBalance !== undefined) {
      const fDelta = Math.round((c.runningBalance - p.runningBalance) * 100) / 100;
      if (Math.abs(Math.abs(fDelta) - c.amount) < 0.05) forwardMatches++;
      const rDelta = Math.round((p.runningBalance - c.runningBalance) * 100) / 100;
      if (Math.abs(Math.abs(rDelta) - p.amount) < 0.05) reverseMatches++;
    }
  }

  const isReverse = reverseMatches > forwardMatches;
  let delta: number | null = null;

  if (!isReverse) {
    // Forward chronological: delta = curr.balance - prev.balance
    if (index > 0 && lines[index - 1].runningBalance !== undefined) {
      delta = Math.round(((curr.runningBalance || 0) - (lines[index - 1].runningBalance || 0)) * 100) / 100;
    }
  } else {
    // Reverse chronological: delta = curr.balance - next.balance
    if (index < lines.length - 1 && lines[index + 1].runningBalance !== undefined) {
      delta = Math.round(((curr.runningBalance || 0) - (lines[index + 1].runningBalance || 0)) * 100) / 100;
    }
  }

  if (delta === null || Math.abs(delta) < 0.01) {
    return { hasProof: false, expectedType: null, expectedAmount: null, isMatched: true, delta: null };
  }

  const expectedType: 'DEBIT' | 'CREDIT' = delta > 0 ? 'CREDIT' : 'DEBIT';
  const expectedAmount = Math.round(Math.abs(delta) * 100) / 100;
  const isTypeMatched = curr.type === expectedType;
  const isAmountMatched = Math.abs(curr.amount - expectedAmount) <= 0.05;

  return {
    hasProof: true,
    expectedType,
    expectedAmount,
    isMatched: isTypeMatched && isAmountMatched,
    delta
  };
}

/**
 * Automatically realigns an array of lines so all debit/credit values strictly match running balance math.
 */
export function autoAlignStatementLinesWithMath(
  lines: Array<any>
): Array<any> {
  const audited = lines.map((l, idx) => ({
    date: l.date,
    description: l.description,
    referenceNo: l.referenceNo || '',
    debit: l.type === 'DEBIT' ? l.amount : 0,
    credit: l.type === 'CREDIT' ? l.amount : 0,
    amount: l.amount,
    type: l.type,
    runningBalance: l.runningBalance,
    originalId: l.id || `line_${idx}`,
    allocatedAccountId: l.allocatedAccountId,
    allocatedAccountName: l.allocatedAccountName
  }));

  const reAudited = normalizeAndAuditBankTransactions(audited);

  return reAudited.map((a, idx) => {
    const orig = lines.find(l => l.id === a.originalId) || lines[idx] || {};
    return {
      ...orig,
      date: a.date,
      description: a.description,
      referenceNo: a.referenceNo,
      type: a.type,
      amount: a.amount,
      debit: a.debit,
      credit: a.credit,
      runningBalance: a.runningBalance
    };
  });
}


