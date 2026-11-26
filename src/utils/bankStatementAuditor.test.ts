import { normalizeAndAuditBankTransactions, RawBankTransaction } from './bankStatementAuditor';

/**
 * AUTOMATED IMMUTABLE TEST SUITE FOR BANK STATEMENT AUDITOR
 * Verifies that Debit & Credit calculations remain 100% stable regardless of software edits.
 */

export function runBankAuditorSelfTests(): { passed: boolean; log: string[] } {
  const logs: string[] = [];
  let allPassed = true;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      logs.push(`✅ PASS: ${testName}`);
    } else {
      logs.push(`❌ FAIL: ${testName}`);
      allPassed = false;
    }
  }

  // Test Case 1: Explicit 2-Column Table (Standard Bank Statement)
  const case1: RawBankTransaction[] = [
    { date: '2026-04-01', description: 'ATM Cash Withdrawal', debit: 5000, credit: 0, runningBalance: 45000 },
    { date: '2026-04-02', description: 'Customer Receipt UPI', debit: 0, credit: 12500, runningBalance: 57500 }
  ];
  const res1 = normalizeAndAuditBankTransactions(case1);
  assert(res1[0].type === 'DEBIT' && res1[0].debit === 5000, 'Test 1.1: Explicit Debit Column');
  assert(res1[1].type === 'CREDIT' && res1[1].credit === 12500, 'Test 1.2: Explicit Credit Column');

  // Test Case 2: Running Balance Proof (Bal_n - Bal_{n-1})
  const case2: RawBankTransaction[] = [
    { date: '2026-04-01', description: 'Vendor Payment', debit: null, credit: null, runningBalance: 100000 },
    { date: '2026-04-02', description: 'ACH Direct Clearing', debit: null, credit: null, runningBalance: 85000 }, // -15000 DEBIT
    { date: '2026-04-03', description: 'Interest Credit', debit: null, credit: null, runningBalance: 87200 }     // +2200 CREDIT
  ];
  const res2 = normalizeAndAuditBankTransactions(case2);
  assert(res2[1].type === 'DEBIT' && res2[1].debit === 15000, 'Test 2.1: Balance Proof Delta Debit');
  assert(res2[2].type === 'CREDIT' && res2[2].credit === 2200, 'Test 2.2: Balance Proof Delta Credit');

  // Test Case 3: Reverse Chronological Statements (Newest Top -> Oldest Bottom)
  const case3: RawBankTransaction[] = [
    { date: '2026-04-03', description: 'Vendor Payment B', debit: 10000, credit: 0, runningBalance: 40000 },
    { date: '2026-04-01', description: 'Initial Deposit', debit: 0, credit: 50000, runningBalance: 50000 }
  ];
  const res3 = normalizeAndAuditBankTransactions(case3);
  assert(res3[0].date === '2026-04-03', 'Test 3.1: Preservation of Row Index 0');
  assert(res3[0].type === 'DEBIT' && res3[0].debit === 10000, 'Test 3.2: Row 0 is Debit');
  assert(res3[1].type === 'CREDIT' && res3[1].credit === 50000, 'Test 3.3: Row 1 is Credit');

  // Test Case 4: Keyword Pattern Fallback
  const case4: RawBankTransaction[] = [
    { date: '2026-04-01', description: 'Swiggy Food Order UPI/PAY/1234', amount: 450 },
    { date: '2026-04-02', description: 'NEFT FROM TATA CONSULTANCY', amount: 85000 }
  ];
  const res4 = normalizeAndAuditBankTransactions(case4);
  assert(res4[0].type === 'DEBIT' && res4[0].debit === 450, 'Test 4.1: Keyword Debit Match');
  assert(res4[1].type === 'CREDIT' && res4[1].credit === 85000, 'Test 4.2: Keyword Credit Match');

  return { passed: allPassed, log: logs };
}
