import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAccountOrPartyLedgerStatement,
  calculateAccountBalances,
  calculateClosingStock,
  getEffectiveOpeningStock,
  getSignedLedgerAmount,
  isDirectExpenseLedger,
  isDirectRevenueLedger,
  isEffectiveStockOpeningAccount,
  isFixedAssetLedger,
  mergeAccountsWithBalancesMap,
} from './accounting';
import { buildPeriodicFinancialBreakdown } from './periodicReports';
import type { AppData } from '../types';

function makeComplexAccountingData(): AppData {
  return {
    company: {
      id: 'cmp_audit',
      name: 'Precision Traders Pvt Ltd',
      tagline: 'Industrial Steel & Engineering',
      address: 'Mumbai',
      gstin: '27AAAAA0000A1Z5',
      pan: 'AAAAA0000A',
      state: 'Maharashtra',
      stateCode: '27',
      phone: '9876543210',
      email: 'accounts@precision.example.com',
      bankName: 'HDFC Bank',
      accountNumber: '50200012345678',
      ifscCode: 'HDFC0000001',
      branch: 'Fort Mumbai',
      upiId: 'precision@hdfcbank',
      terms: 'Payment due within 15 days',
      financialYearStart: '2025-04-01',
      currency: 'INR',
    },
    accounts: [
      {
        id: 'acc_capital',
        code: '3001',
        name: 'Share Capital',
        category: 'EQUITY',
        subCategory: 'Capital Account',
        openingBalance: 500000,
        balanceType: 'CR',
      },
      {
        id: 'acc_cash',
        code: '1010',
        name: 'Cash in Hand',
        category: 'ASSET',
        subCategory: 'Cash in Hand',
        openingBalance: 100000,
        balanceType: 'DR',
      },
      {
        id: 'acc_bank',
        code: '1020',
        name: 'HDFC Bank Ltd',
        category: 'ASSET',
        subCategory: 'Bank Accounts',
        openingBalance: 250000,
        balanceType: 'DR',
      },
      {
        id: 'acc_machinery',
        code: '1501',
        name: 'Plant & Machinery',
        category: 'ASSET',
        subCategory: 'Fixed Assets',
        openingBalance: 50000,
        balanceType: 'DR',
      },
      {
        id: 'acc_stock_imported',
        code: '1300',
        name: 'Stock-in-Hand',
        category: 'ASSET',
        subCategory: 'Current Assets',
        openingBalance: 100000,
        balanceType: 'DR',
      },
      {
        id: 'acc_sales',
        code: '4010',
        name: 'Sales Account',
        category: 'REVENUE',
        subCategory: 'Direct Revenue',
        openingBalance: 0,
        balanceType: 'CR',
      },
      {
        id: 'acc_cogs',
        code: '5010',
        name: 'Purchase Account',
        category: 'EXPENSE',
        subCategory: 'Direct Expenses',
        openingBalance: 0,
        balanceType: 'DR',
      },
      {
        id: 'acc_freight',
        code: '5025',
        name: 'Freight Inward',
        category: 'EXPENSE',
        subCategory: 'Direct Expenses',
        openingBalance: 0,
        balanceType: 'DR',
      },
      {
        id: 'acc_rent',
        code: '6010',
        name: 'Office Rent',
        category: 'EXPENSE',
        subCategory: 'Indirect Expenses',
        openingBalance: 0,
        balanceType: 'DR',
      },
      {
        id: 'acc_salary',
        code: '6020',
        name: 'Staff Salary',
        category: 'EXPENSE',
        subCategory: 'Indirect Expenses',
        openingBalance: 0,
        balanceType: 'DR',
      },
      {
        id: 'acc_apex',
        code: '6090',
        name: 'Apex Traders',
        category: 'EXPENSE',
        subCategory: 'Indirect Expenses',
        openingBalance: 0,
        balanceType: 'DR',
      },
    ],
    accountGroups: [],
    parties: [
      {
        id: 'pty_cust_1',
        code: 'C001',
        name: 'Apex Traders',
        type: 'CUSTOMER',
        gstin: '27BBBBB1111B1Z2',
        pan: '',
        email: '',
        phone: '9999900001',
        address: 'Pune',
        state: 'Maharashtra',
        stateCode: '27',
        creditLimit: 0,
        openingBalance: 0,
        balanceType: 'DR',
        openingBalanceType: 'DR',
      },
      {
        id: 'pty_vend_1',
        code: 'V001',
        name: 'Bharat Steel Suppliers',
        type: 'VENDOR',
        gstin: '27CCCCC2222C1Z3',
        pan: '',
        email: '',
        phone: '9999900002',
        address: 'Nashik',
        state: 'Maharashtra',
        stateCode: '27',
        creditLimit: 0,
        openingBalance: 0,
        balanceType: 'CR',
        openingBalanceType: 'CR',
      },
    ],
    items: [
      {
        id: 'itm_1',
        code: 'ITM001',
        name: 'Steel Rods',
        description: 'TMT Steel Rods 12mm',
        category: 'Raw Material',
        hsnSacCode: '7214',
        unit: 'KG',
        purchasePrice: 100,
        salesPrice: 150,
        taxRate: 18,
        gstRate: 18,
        openingStock: 1000,
        currentStock: 1000,
        minStockLevel: 10,
        openingStockValue: 100000,
        closingStockValue: 100000,
        importedClosingQty: 1000,
      },
    ],
    invoices: [
      {
        id: 'inv_1',
        invoiceNumber: 'INV-001',
        date: '2025-05-10',
        dueDate: '2025-05-25',
        invoiceType: 'TAX_INVOICE',
        partyId: 'pty_cust_1',
        partyName: 'Apex Traders',
        partyGstin: '27BBBBB1111B1Z2',
        partyAddress: 'Pune',
        partyState: 'Maharashtra',
        placeOfSupply: 'Maharashtra',
        isInterState: false,
        items: [],
        subtotal: 10000,
        totalDiscount: 0,
        cgstAmount: 900,
        sgstAmount: 900,
        igstAmount: 0,
        totalTax: 1800,
        roundOff: 0.4,
        grandTotal: 11800.4,
        amountPaid: 0,
        status: 'UNPAID',
      },
    ],
    purchaseInvoices: [
      {
        id: 'pur_1',
        billNumber: 'PUR-001',
        supplierInvoiceNo: 'SUP-77',
        date: '2025-05-05',
        dueDate: '2025-05-20',
        partyId: 'pty_vend_1',
        partyName: 'Bharat Steel Suppliers',
        partyGstin: '27CCCCC2222C1Z3',
        partyState: 'Maharashtra',
        isInterState: false,
        items: [],
        subtotal: 6000,
        totalDiscount: 0,
        cgstAmount: 540,
        sgstAmount: 540,
        igstAmount: 0,
        totalTax: 1080,
        roundOff: -0.2,
        grandTotal: 7579.8,
        amountPaid: 0,
        status: 'UNPAID',
        extraLedgerLines: [
          {
            accountId: 'acc_freight',
            accountName: 'Freight Inward',
            debit: 500,
            credit: 0,
          },
        ],
      },
      // Purchase Bill WITHOUT vendorId (common in imported bills)
      {
        id: 'pur_no_vendor',
        billNumber: 'PUR-002',
        supplierInvoiceNo: 'CASH-88',
        date: '2025-05-06',
        dueDate: '2025-05-21',
        partyId: '',
        partyName: 'Cash Supplier',
        partyState: 'Maharashtra',
        isInterState: false,
        items: [],
        subtotal: 2000,
        totalDiscount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 2000,
        amountPaid: 2000,
        status: 'PAID',
      },
    ],
    debitCreditNotes: [
      {
        id: 'cn_1',
        noteNumber: 'CN-001',
        type: 'CREDIT_NOTE',
        date: '2025-05-12',
        partyId: 'pty_cust_1',
        partyName: 'Apex Traders',
        originalInvoiceNo: 'INV-001',
        reason: 'Sales Return',
        items: [],
        subtotal: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        totalTax: 180,
        grandTotal: 1180,
      },
      {
        id: 'dn_1',
        noteNumber: 'DN-001',
        type: 'DEBIT_NOTE',
        date: '2025-05-14',
        partyId: 'pty_vend_1',
        partyName: 'Bharat Steel Suppliers',
        originalInvoiceNo: 'SUP-77',
        reason: 'Purchase Return',
        items: [],
        subtotal: 500,
        cgstAmount: 45,
        sgstAmount: 45,
        igstAmount: 0,
        totalTax: 90,
        grandTotal: 590,
      },
    ],
    vouchers: [
      // Journal voucher WITHOUT partyId & blank accountCode (must NOT leak into Sales or Purchase)
      {
        id: 'vch_jv_rent',
        voucherNumber: 'JV-001',
        date: '2025-05-08',
        type: 'JOURNAL',
        narration: 'Monthly office rent accrual',
        totalAmount: 15000,
        entries: [
          {
            id: 'e1',
            accountId: 'acc_rent',
            accountCode: '',
            accountName: 'Office Rent',
            debit: 15000,
            credit: 0,
          },
          {
            id: 'e2',
            accountId: 'acc_cash',
            accountCode: '',
            accountName: 'Cash in Hand',
            debit: 0,
            credit: 15000,
          },
        ],
      },
      // Payment voucher WITHOUT partyId (must NOT leak into Sales or Purchase)
      {
        id: 'vch_pay_sal',
        voucherNumber: 'PAY-001',
        date: '2025-05-09',
        type: 'PAYMENT',
        paymentMode: 'BANK_TRANSFER',
        narration: 'Paid staff salaries',
        totalAmount: 25000,
        entries: [
          {
            id: 'e3',
            accountId: 'acc_salary',
            accountCode: '',
            accountName: 'Staff Salary',
            debit: 25000,
            credit: 0,
          },
          {
            id: 'e4',
            accountId: 'acc_bank',
            accountCode: '',
            accountName: 'HDFC Bank Ltd',
            debit: 0,
            credit: 25000,
          },
        ],
      },
      // Receipt voucher using legacy pty_* entry accountId (credits Sundry Debtors)
      {
        id: 'vch_rec_cust',
        voucherNumber: 'REC-001',
        date: '2025-05-15',
        type: 'RECEIPT',
        partyId: 'pty_cust_1',
        partyName: 'Apex Traders',
        paymentMode: 'BANK_TRANSFER',
        narration: 'Part payment received from Apex',
        totalAmount: 5000,
        entries: [
          {
            id: 'e5',
            accountId: 'acc_bank',
            accountCode: '1020',
            accountName: 'HDFC Bank Ltd',
            debit: 5000,
            credit: 0,
          },
          {
            id: 'e6',
            accountId: 'pty_cust_1',
            accountCode: '',
            accountName: 'Apex Traders',
            debit: 0,
            credit: 5000,
          },
        ],
      },
      // Explicit Journal entry posted to Sales Account (SHOULD appear in Sales Account)
      {
        id: 'vch_jv_sales',
        voucherNumber: 'JV-002',
        date: '2025-05-18',
        type: 'JOURNAL',
        narration: 'Unbilled service revenue accrued',
        totalAmount: 2000,
        entries: [
          {
            id: 'e7',
            accountId: 'acc_apex',
            accountCode: '',
            accountName: 'Apex Traders',
            debit: 2000,
            credit: 0,
          },
          {
            id: 'e8',
            accountId: 'acc_sales',
            accountCode: '4010',
            accountName: 'Sales Account',
            debit: 0,
            credit: 2000,
          },
        ],
      },
    ],
    bankStatements: [],
    auditLogs: [],
    securityPin: null,
    pinRequired: false,
  };
}

test('Sales Account drilldown never leaks Journal, Payment, Receipt vouchers or Purchase Bills', () => {
  const data = makeComplexAccountingData();
  const salesStmt = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: 'acc_sales',
    targetName: 'Sales Account',
    preferredKind: 'ACCOUNT',
  });

  assert.equal(salesStmt.kind, 'ACCOUNT');
  const sourceIds = salesStmt.rows.map(r => r.sourceId);
  // Only INV-001 (10000 Cr), CN-001 (1000 Dr), and explicit Sales JV-002 (2000 Cr)
  assert.deepEqual(sourceIds, ['inv_1', 'cn_1', 'vch_jv_sales']);
  assert.equal(salesStmt.rows.some(r => r.sourceId === 'vch_jv_rent'), false);
  assert.equal(salesStmt.rows.some(r => r.sourceId === 'vch_pay_sal'), false);
  assert.equal(salesStmt.rows.some(r => r.sourceId === 'vch_rec_cust'), false);
  assert.equal(salesStmt.rows.some(r => r.sourceId.startsWith('pur_')), false);

  assert.equal(salesStmt.totalCredit, 12000);
  assert.equal(salesStmt.totalDebit, 1000);
  assert.equal(salesStmt.closingBalance, 11000);
  assert.equal(salesStmt.closingType, 'CR');
});

test('Purchase Account drilldown never leaks unrelated Journal, Payment, Receipt vouchers or Sales Invoices', () => {
  const data = makeComplexAccountingData();
  const purStmt = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: 'acc_cogs',
    targetName: 'Purchase Account',
    preferredKind: 'ACCOUNT',
  });

  assert.equal(purStmt.kind, 'ACCOUNT');
  const sourceIds = purStmt.rows.map(r => r.sourceId);
  // Only PUR-001 (6000 Dr), PUR-002 (2000 Dr), DN-001 (500 Cr)
  assert.deepEqual(sourceIds, ['pur_1', 'pur_no_vendor', 'dn_1']);
  assert.equal(purStmt.rows.some(r => r.sourceId === 'vch_jv_rent'), false);
  assert.equal(purStmt.rows.some(r => r.sourceId === 'vch_pay_sal'), false);
  assert.equal(purStmt.rows.some(r => r.sourceId === 'vch_rec_cust'), false);
  assert.equal(purStmt.rows.some(r => r.sourceId === 'inv_1'), false);

  assert.equal(purStmt.totalDebit, 8000);
  assert.equal(purStmt.totalCredit, 500);
  assert.equal(purStmt.closingBalance, 7500);
  assert.equal(purStmt.closingType, 'DR');
});

test('Every account statement closing balance reconciles 1:1 with Trial Balance, P&L, and Balance Sheet', () => {
  const data = makeComplexAccountingData();
  const balancesMap = calculateAccountBalances(data);
  const allAccounts = mergeAccountsWithBalancesMap(data, balancesMap);

  // 1. Trial Balance sum Dr === sum Cr
  let tbDr = 0;
  let tbCr = 0;
  for (const [accId, bal] of balancesMap.entries()) {
    if (bal.balanceType === 'DR') tbDr += bal.netBalance;
    else tbCr += bal.netBalance;

    // 2. Every account's drilldown closing balance matches calculateAccountBalances(data)
    const stmt = buildAccountOrPartyLedgerStatement(data, {
      partyOrAccountId: accId,
      targetName: bal.account.name,
      preferredKind: 'ACCOUNT',
    });
    const expectedSignedDr = bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance;
    assert.ok(
      Math.abs(stmt.closingSignedDr - expectedSignedDr) < 0.02,
      `Mismatch on ${accId} (${bal.account.name}): statement=${stmt.closingSignedDr}, balanceMap=${expectedSignedDr}`
    );
  }
  assert.ok(Math.abs(tbDr - tbCr) < 0.02, `Trial Balance mismatch: Dr=${tbDr}, Cr=${tbCr}`);
  assert.equal(balancesMap.has('acc_diff_opening_bal'), false);

  // 3. P&L + Balance Sheet reconciliation including fallback Stock-in-Hand & dynamic ledgers
  const openingStock = getEffectiveOpeningStock(data);
  const closingStock = calculateClosingStock(data);
  assert.equal(openingStock, 100000);
  assert.equal(closingStock, 100000);

  let salesRev = 0;
  let directExp = 0;
  let indirectRev = 0;
  let indirectExp = 0;
  let fixedAssets = 0;
  let otherAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const acc of allAccounts) {
    const signed = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
    if (acc.category === 'REVENUE') {
      if (isDirectRevenueLedger(acc)) salesRev += signed;
      else indirectRev += signed;
    } else if (acc.category === 'EXPENSE') {
      if (isDirectExpenseLedger(acc)) directExp += signed;
      else indirectExp += signed;
    } else if (acc.category === 'ASSET') {
      if (isEffectiveStockOpeningAccount(acc, data)) continue;
      if (isFixedAssetLedger(acc)) fixedAssets += signed;
      else otherAssets += signed;
    } else if (acc.category === 'LIABILITY') {
      totalLiabilities += signed;
    } else if (acc.category === 'EQUITY') {
      totalEquity += signed;
    }
  }

  const grossProfit = salesRev + closingStock - (openingStock + directExp);
  const netProfit = grossProfit + indirectRev - indirectExp;
  const totalAssets = fixedAssets + otherAssets + closingStock;
  const totalLiabAndEquity = totalEquity + netProfit + totalLiabilities;

  assert.ok(
    Math.abs(totalAssets - totalLiabAndEquity) < 0.02,
    `Balance Sheet mismatch: Assets=${totalAssets}, Liab+Eq=${totalLiabAndEquity}`
  );
});

test('preferredKind disambiguates same-name Account vs Party and periodic rows expose valid kind tags', () => {
  const data = makeComplexAccountingData();

  // Name "Apex Traders" exists as BOTH acc_apex (Account) and pty_cust_1 (Party)
  const asAccount = buildAccountOrPartyLedgerStatement(data, {
    targetName: 'Apex Traders',
    preferredKind: 'ACCOUNT',
  });
  assert.equal(asAccount.kind, 'ACCOUNT');
  assert.equal(asAccount.account?.id, 'acc_apex');
  assert.equal(asAccount.closingBalance, 2000);

  const asParty = buildAccountOrPartyLedgerStatement(data, {
    targetName: 'Apex Traders',
    preferredKind: 'PARTY',
  });
  assert.equal(asParty.kind, 'PARTY');
  assert.equal(asParty.party?.id, 'pty_cust_1');
  // INV-001 (11800.40 Dr) - CN-001 (1180 Cr) - REC-001 (5000 Cr) = 5620.40 Dr
  assert.ok(Math.abs(asParty.closingBalance - 5620.4) < 0.02);

  // Sundry Debtors should include INV-001, CN-001, and legacy pty_cust_1 line in REC-001
  const debtorsStmt = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: 'acc_debtors',
    preferredKind: 'ACCOUNT',
  });
  assert.equal(debtorsStmt.rows.length, 3);
  assert.ok(Math.abs(debtorsStmt.closingBalance - 5620.4) < 0.02);

  // Periodic Breakdown rows use `.kind` matching FinancialStatements click inspector
  const rows = buildPeriodicFinancialBreakdown(data, 'MONTHLY');
  assert.equal(rows.length, 1);
  const kinds = new Set(rows[0].items.map(i => i.kind));
  assert.deepEqual(kinds, new Set(['SALES', 'PURCHASE', 'VOUCHER', 'NOTE']));
});
