import test from 'node:test';
import assert from 'node:assert/strict';
import { getBankPeriodInfo, buildBankPeriodicSummary } from './bankPeriod';
import { BankStatementLine, Voucher } from '../types';

test('getBankPeriodInfo computes Daily, Weekly, Monthly, and Indian FY Quarterly buckets accurately', () => {
  const daily = getBankPeriodInfo('2026-11-18', 'DAILY');
  assert.equal(daily?.key, '2026-11-18');
  assert.equal(daily?.fromDate, '2026-11-18');

  // 2026-11-18 is a Wednesday -> Week is Mon 16 Nov to Sun 22 Nov 2026
  const weekly = getBankPeriodInfo('2026-11-18', 'WEEKLY');
  assert.equal(weekly?.key, 'W_2026-11-16');
  assert.equal(weekly?.fromDate, '2026-11-16');
  assert.equal(weekly?.toDate, '2026-11-22');

  const monthly = getBankPeriodInfo('2026-02-14', 'MONTHLY');
  assert.equal(monthly?.key, '2026-02');
  assert.equal(monthly?.toDate, '2026-02-28');

  // Indian FY Quarters: Nov 2026 -> Q3 FY 2026-27; Feb 2027 -> Q4 FY 2026-27
  const q3 = getBankPeriodInfo('2026-11-18', 'QUARTERLY');
  assert.equal(q3?.key, 'FY2026_Q3');
  assert.match(q3?.label || '', /Q3 \(Oct–Dec\) FY 2026-27/);

  const q4 = getBankPeriodInfo('2027-02-10', 'QUARTERLY');
  assert.equal(q4?.key, 'FY2026_Q4');
  assert.match(q4?.label || '', /Q4 \(Jan–Mar\) FY 2026-27/);
});

test('buildBankPeriodicSummary aggregates statement inflows/outflows and book vouchers per bucket', () => {
  const lines: BankStatementLine[] = [
    { id: 's1', date: '2026-11-16', description: 'NEFT IN', referenceNo: 'UTR1', amount: 15000, type: 'CREDIT', reconciled: true, isReconciled: true },
    { id: 's2', date: '2026-11-18', description: 'UPI OUT', referenceNo: 'UPI2', amount: 4500, type: 'DEBIT', reconciled: false, isReconciled: false },
    { id: 's3', date: '2026-10-05', description: 'OCT DEP', referenceNo: 'NEFT3', amount: 5000, type: 'CREDIT', reconciled: false, isReconciled: false },
  ];
  const vouchers: Voucher[] = [
    {
      id: 'v1',
      voucherNumber: 'REC-1',
      date: '2026-11-16',
      type: 'RECEIPT',
      totalAmount: 15000,
      narration: 'Payment received',
      entries: [
        { id: 'e1', accountId: 'bank1', accountCode: '1010', accountName: 'HDFC Bank', debit: 15000, credit: 0 },
        { id: 'e2', accountId: 'cust1', accountCode: '1200', accountName: 'Customer', debit: 0, credit: 15000 },
      ],
    },
  ];

  const weekly = buildBankPeriodicSummary(lines, vouchers, 'bank1', 'WEEKLY');
  assert.equal(weekly.length, 2);
  assert.equal(weekly[0].key, 'W_2026-11-16');
  assert.equal(weekly[0].stmtCredit, 15000);
  assert.equal(weekly[0].stmtDebit, 4500);
  assert.equal(weekly[0].stmtNetFlow, 10500);
  assert.equal(weekly[0].stmtReconciledCount, 1);
  assert.equal(weekly[0].stmtPendingCount, 1);
  assert.equal(weekly[0].bookReceipts, 15000);

  const quarterly = buildBankPeriodicSummary(lines, vouchers, 'bank1', 'QUARTERLY');
  assert.equal(quarterly.length, 1);
  assert.equal(quarterly[0].stmtCredit, 20000);
  assert.equal(quarterly[0].stmtDebit, 4500);
});
