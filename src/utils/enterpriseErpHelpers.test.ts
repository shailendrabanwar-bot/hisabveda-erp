import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateIndianStatutoryPayroll,
  buildPayrollAccountingVouchers,
  buildLanLiveSnapshot,
  formatPhoneForWhatsApp,
  buildWhatsAppInvoiceShareUrl,
  buildWhatsAppLedgerReminderUrl,
} from './enterpriseErpHelpers';
import {
  getLedgerBudgetVarianceSummary,
  getMonthlyLedgerActualExpense,
  evaluateBudgetOverrunForVoucher,
  validateVoucherAccountingRules,
} from './accounting';
import { createFreshAppData } from './storage';
import { Employee, PayrollRecord } from '../types';

function makeBaseData() {
  return createFreshAppData('cmp_demo_1', 'Enterprise Demo Co', null);
}

describe('Enterprise ERP Helpers — Payroll Statutory & Double-Entry Posting', () => {
  const sampleEmployee: Employee = {
    id: 'emp_1',
    employeeCode: 'EMP-001',
    name: 'Rajesh Sharma',
    designation: 'Senior Executive',
    department: 'Operations',
    joiningDate: '2025-01-01',
    phone: '9876543210',
    email: 'rajesh@example.com',
    pan: 'ABCDE1234F',
    bankAccountNo: '501000123456',
    bankName: 'HDFC Bank',
    ifscCode: 'HDFC0000123',
    basicSalary: 12000,
    hra: 4000,
    conveyanceAllowance: 1500,
    specialAllowance: 2500,
    pfDeduction: 0,
    esiDeduction: 0,
    tdsDeduction: 0,
    status: 'ACTIVE',
  };

  it('computes PF 12%, ESIC 0.75% / 3.25%, PT slab, Advance & LOP leave deductions accurately', () => {
    const full = calculateIndianStatutoryPayroll({
      employee: sampleEmployee,
      payrollMonth: '2026-07',
      workingDays: 26,
      unpaidLeaveDays: 0,
      advanceDeduction: 1000,
      tdsOverride: 0,
      applyAutoPf12: true,
      applyAutoEsic: true,
      applyAutoPt: true,
    });

    assert.equal(full.grossSalary, 20000);
    assert.equal(full.pfDeduction, 1440); // 12% of 12,000
    assert.equal(full.pfEmployerContribution, 1440);
    assert.equal(full.esiDeduction, 150); // 0.75% of 20,000 (<= 21k)
    assert.equal(full.esicEmployerContribution, 650); // 3.25% of 20,000
    assert.equal(full.professionalTax, 200); // > 15,000 slab
    assert.equal(full.advanceDeduction, 1000);
    assert.equal(full.totalDeductions, 1440 + 150 + 200 + 1000);
    assert.equal(full.netSalary, 20000 - full.totalDeductions);

    // Pro-rata LOP leave deduction check (2 unpaid days out of 26)
    const lop = calculateIndianStatutoryPayroll({
      employee: sampleEmployee,
      payrollMonth: '2026-07',
      workingDays: 26,
      unpaidLeaveDays: 2,
      applyAutoPf12: true,
      applyAutoEsic: true,
      applyAutoPt: true,
    });
    assert.equal(lop.presentDays, 24);
    assert.ok(lop.leaveDeduction > 1500);
    assert.ok(lop.grossSalary < 20000);
  });

  it('creates strictly balanced Journal + Bank Payment vouchers complying with accounting rules', () => {
    const data = makeBaseData();
    const calc = calculateIndianStatutoryPayroll({
      employee: sampleEmployee,
      payrollMonth: '2026-07',
      workingDays: 26,
      unpaidLeaveDays: 0,
      advanceDeduction: 500,
    });

    const record: PayrollRecord = {
      id: 'pay_emp_1_2026-07',
      payrollMonth: '2026-07',
      employeeId: sampleEmployee.id,
      employeeName: sampleEmployee.name,
      employeeCode: sampleEmployee.employeeCode,
      designation: sampleEmployee.designation,
      department: sampleEmployee.department,
      workingDays: calc.workingDays,
      presentDays: calc.presentDays,
      leaveDays: calc.leaveDays,
      basicSalary: calc.earnedBasic,
      hra: calc.earnedHra,
      conveyanceAllowance: calc.earnedConveyance,
      specialAllowance: calc.earnedSpecial,
      grossSalary: calc.grossSalary,
      pfDeduction: calc.pfDeduction,
      pfEmployerContribution: calc.pfEmployerContribution,
      esiDeduction: calc.esiDeduction,
      esicEmployerContribution: calc.esicEmployerContribution,
      professionalTax: calc.professionalTax,
      tdsDeduction: calc.tdsDeduction,
      advanceDeduction: calc.advanceDeduction,
      leaveDeduction: calc.leaveDeduction,
      otherDeductions: calc.advanceDeduction,
      totalDeductions: calc.totalDeductions,
      netSalary: calc.netSalary,
      paymentStatus: 'PAID',
      paymentDate: '2026-07-31',
      paymentMode: 'BANK_TRANSFER',
    };

    const bankAcc = data.accounts.find((a) => a.id === 'acc_bank') || data.accounts[0];
    const post = buildPayrollAccountingVouchers([record], data.accounts, {
      settlementMode: 'BANK',
      settlementAccountId: bankAcc.id,
      voucherDate: '2026-07-31',
      createdBy: 'Tester',
    });

    assert.equal(post.vouchers.length, 2);
    const mergedData = {
      ...data,
      accounts: [...data.accounts, ...post.newAccounts],
    };

    for (const vch of post.vouchers) {
      const sumDr = vch.entries.reduce((s, e) => s + e.debit, 0);
      const sumCr = vch.entries.reduce((s, e) => s + e.credit, 0);
      assert.ok(Math.abs(sumDr - sumCr) < 0.001, `Voucher ${vch.voucherNumber} unbalanced: Dr=${sumDr}, Cr=${sumCr}`);
      const check = validateVoucherAccountingRules(vch, mergedData, '2026-04-01');
      assert.equal(check.valid, true, JSON.stringify(check.errors));
    }

    assert.ok(post.updatedPayrolls[0].postedVoucherNo);
    assert.ok(post.updatedPayrolls[0].paymentVoucherNo);
  });
});

describe('Enterprise ERP Helpers — Live Budget Variance & Overrun Alerts', () => {
  it('pulls actual ledger expenses and detects non-blocking budget overrun', () => {
    const data = makeBaseData();
    const rentAcc = data.accounts.find((a) => a.id === 'acc_rent')!;
    const cashAcc = data.accounts.find((a) => a.id === 'acc_cash')!;

    data.budgets = [
      {
        id: 'bud_rent',
        accountId: rentAcc.id,
        accountName: rentAcc.name,
        category: 'FIXED_COST',
        monthlyLimit: 10000,
        period: '2026-07',
      },
    ];

    data.vouchers.push({
      id: 'vch_rent_1',
      voucherNumber: 'PAY-001',
      date: '2026-07-10',
      type: 'PAYMENT',
      paymentMode: 'CASH',
      bankAccountId: cashAcc.id,
      totalAmount: 7500,
      narration: 'Partial Rent',
      entries: [
        { id: 'e1', accountId: rentAcc.id, accountName: rentAcc.name, accountCode: rentAcc.code, debit: 7500, credit: 0 },
        { id: 'e2', accountId: cashAcc.id, accountName: cashAcc.name, accountCode: cashAcc.code, debit: 0, credit: 7500 },
      ],
    });

    const actual = getMonthlyLedgerActualExpense(data, rentAcc.id, '2026-07');
    assert.equal(actual, 7500);

    const variance = getLedgerBudgetVarianceSummary(data, data.budgets[0], '2026-07');
    assert.equal(variance.varianceAmount, 2500);
    assert.equal(variance.status, 'HEALTHY');

    const alerts = evaluateBudgetOverrunForVoucher(
      data,
      [{ accountId: rentAcc.id, debit: 4000, credit: 0 }],
      '2026-07-20'
    );
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].projectedActual, 11500);
    assert.equal(alerts[0].exceededBy, 1500);
  });
});

describe('Enterprise ERP Helpers — LAN Snapshot & WhatsApp Share', () => {
  it('builds secret-free LAN snapshot and strict https://wa.me WhatsApp deep links', () => {
    const data = makeBaseData();
    data.company.upiId = 'shop@okaxis';
    data.parties = [
      {
        id: 'pty_1',
        code: 'CUST-1',
        name: 'Anand Traders',
        type: 'CUSTOMER',
        gstin: '',
        pan: '',
        address: 'Indore',
        state: 'Madhya Pradesh',
        stateCode: '23',
        phone: '9876543210',
        email: '',
        openingBalance: 12500,
        balanceType: 'DR',
        creditLimit: 50000,
      },
    ];
    data.securityPin = '9999';

    const snap = buildLanLiveSnapshot(data, 'FY 2026-27');
    const serialized = JSON.stringify(snap);
    assert.equal(serialized.includes('9999'), false);
    assert.equal(snap.companyName, 'Enterprise Demo Co');
    assert.ok(snap.cashBankAccounts.length > 0);
    assert.equal(snap.partyOutstandings.length, 1);

    assert.equal(formatPhoneForWhatsApp('98765 43210'), '919876543210');

    const invUrl = buildWhatsAppInvoiceShareUrl({
      invoice: {
        invoiceNumber: 'INV-101',
        date: '2026-07-15',
        dueDate: '2026-07-30',
        partyName: 'Anand Traders',
        grandTotal: 5400,
        amountPaid: 1400,
        status: 'PARTIAL',
      },
      company: data.company,
      partyPhone: '9876543210',
    });
    assert.ok(invUrl.startsWith('https://wa.me/919876543210?text='));
    const decodedInv = decodeURIComponent(invUrl.split('?text=')[1]);
    assert.ok(decodedInv.includes('INV-101'));
    assert.ok(decodedInv.includes('2026-07-30'));
    assert.ok(decodedInv.includes('shop@okaxis'));

    const ledgerUrl = buildWhatsAppLedgerReminderUrl({
      partyName: 'Anand Traders',
      partyPhone: '9876543210',
      company: data.company,
      closingBalance: 12500,
      closingType: 'DR',
      totalDebit: 20000,
      totalCredit: 7500,
    });
    assert.ok(ledgerUrl.startsWith('https://wa.me/919876543210?text='));
    const decodedLedger = decodeURIComponent(ledgerUrl.split('?text=')[1]);
    assert.ok(decodedLedger.includes('12,500'));
    assert.ok(decodedLedger.includes('shop@okaxis'));
  });
});
