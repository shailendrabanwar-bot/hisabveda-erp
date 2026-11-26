import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGstUqcCode, normalizeUqc } from './ewayBill';
import {
  computeGstr9Summary,
  reconcileGstr2Entries,
  resolveTransactionGstDetails,
  syncPartyDetailsAcrossAppData,
} from './gstAuditEngine';
import { calculateInventoryValuationReport } from './inventoryValuation';
import {
  auditBooksZeroDifference,
  buildAccountOrPartyLedgerStatement,
  buildMonthlyLedgerSummary,
  calculateAccountBalances,
  calculateClosingStock,
  getFinancialSummary,
  getItemClosingStockValue,
  normalizeVoucherWithRoundOff,
} from './accounting';
import { buildPeriodicFinancialBreakdown } from './periodicReports';
import { filterAppDataByFinancialYear } from './fiscalYear';
import { createDefaultChartOfAccounts } from './storage';
import { initialSampleData } from '../data/sampleData';
import { AppData } from '../types';

function makeCleanErpData(): AppData {
  return {
    ...initialSampleData,
    company: {
      ...initialSampleData.company,
      financialYearStart: '2025-04-01',
      booksBeginningFrom: '2025-04-01',
    },
    accounts: createDefaultChartOfAccounts().map((a) => ({ ...a, openingBalance: 0 })),
    parties: [],
    items: [],
    invoices: [],
    purchaseInvoices: [],
    vouchers: [],
    debitCreditNotes: [],
    bankStatements: [],
  };
}

test('formatGstUqcCode maps units into full GST portal UQC descriptors', () => {
  assert.equal(normalizeUqc('Meters'), 'MTR');
  assert.equal(formatGstUqcCode('Mtr'), 'MTR-METERS');
  assert.equal(formatGstUqcCode('Nos'), 'NOS-NUMBERS');
  assert.equal(formatGstUqcCode('Pack'), 'PAC-PACKS');
  assert.equal(formatGstUqcCode('kg'), 'KGS-KILOGRAMS');
});

test('reconcileGstr2Entries applies INR 2.00 tolerance before flagging mismatch', () => {
  const purchase = {
    id: 'pur_1',
    billNumber: 'PB-1',
    supplierInvoiceNo: 'SUP/25/101',
    date: '2025-08-12',
    dueDate: '2025-09-11',
    partyId: 'p1',
    partyName: 'Alpha Traders',
    partyGstin: '27AAAAA0000A1Z5',
    partyState: 'Maharashtra',
    isInterState: false,
    items: [],
    subtotal: 10000,
    totalDiscount: 0,
    cgstAmount: 900,
    sgstAmount: 900,
    igstAmount: 0,
    totalTax: 1800,
    grandTotal: 11800,
    amountPaid: 0,
    status: 'UNPAID' as const,
  };

  const withinTolerance = reconcileGstr2Entries(
    [purchase],
    [],
    [
      {
        id: '2b_1',
        source: 'GSTR2B',
        returnPeriod: '082025',
        vendorName: 'Alpha Traders',
        vendorGstin: '27AAAAA0000A1Z5',
        invoiceNumber: 'SUP/25/101',
        invoiceDate: '2025-08-12',
        invoiceType: 'Regular',
        taxableValue: 10001.5,
        cgst: 900.9,
        sgst: 900.9,
        igst: 0,
        cess: 0,
        totalTax: 1801.8,
        itcEligibility: 'ELIGIBLE',
      },
    ],
    '2B_VS_BOOKS'
  );
  assert.equal(withinTolerance.rows[0].status, 'EXACT_MATCH');

  const outsideTolerance = reconcileGstr2Entries(
    [purchase],
    [],
    [
      {
        id: '2b_2',
        source: 'GSTR2B',
        returnPeriod: '082025',
        vendorName: 'Alpha Traders',
        vendorGstin: '27AAAAA0000A1Z5',
        invoiceNumber: 'SUP/25/101',
        invoiceDate: '2025-08-12',
        invoiceType: 'Regular',
        taxableValue: 10000,
        cgst: 901.5,
        sgst: 901.5,
        igst: 0,
        cess: 0,
        totalTax: 1803,
        itcEligibility: 'ELIGIBLE',
      },
    ],
    '2B_VS_BOOKS'
  );
  assert.equal(outsideTolerance.rows[0].status, 'AMOUNT_TAX_DIFF');
});

test('calculateInventoryValuationReport supports WAC total valuation and 3-decimal quantities', () => {
  const data = makeCleanErpData();
  data.items = [
    {
      id: 'itm_wac',
      code: 'CBL-01',
      name: 'Copper Cable',
      description: '',
      hsnSacCode: '8544',
      unit: 'MTR',
      purchasePrice: 100,
      salesPrice: 150,
      taxRate: 18,
      openingStock: 10,
      openingStockValue: 1000,
      currentStock: 15.125,
      minStockLevel: 2,
      category: 'Cables',
    },
  ];
  data.purchaseInvoices = [
    {
      id: 'pb_wac',
      billNumber: 'PB-10',
      supplierInvoiceNo: 'S-10',
      date: '2025-05-01',
      dueDate: '2025-05-31',
      partyId: 'v1',
      partyName: 'Wire Mill',
      partyState: 'Delhi',
      isInterState: false,
      items: [
        {
          id: 'li_1',
          itemId: 'itm_wac',
          itemName: 'Copper Cable',
          hsnSacCode: '8544',
          quantity: 10,
          unit: 'MTR',
          rate: 120,
          discountPercent: 0,
          taxRate: 18,
          taxAmount: 216,
          totalAmount: 1416,
        },
      ],
      subtotal: 1200,
      totalDiscount: 0,
      cgstAmount: 108,
      sgstAmount: 108,
      igstAmount: 0,
      totalTax: 216,
      grandTotal: 1416,
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];

  const report = calculateInventoryValuationReport(data, 'WAC');
  assert.equal(report.totalStockUnits, 15.125);
  assert.equal(report.items[0].effectiveRate, 110);
  assert.equal(Math.round(report.items[0].valuationAmount * 100) / 100, 1663.75);
  assert.equal(Math.round(report.totalCostValuation * 100) / 100, 1663.75);
});

test('buildMonthlyLedgerSummary reconciles Apr-Mar monthly closing with statement & auditBooksZeroDifference reports clean books', () => {
  const data = makeCleanErpData();
  const cashAcc = data.accounts.find((a) => a.id === 'acc_cash')!;
  const capAcc = data.accounts.find((a) => a.id === 'acc_capital')!;
  cashAcc.openingBalance = 50000;
  cashAcc.balanceType = 'DR';
  capAcc.openingBalance = 50000;
  capAcc.balanceType = 'CR';

  data.vouchers = [
    {
      id: 'v1',
      voucherNumber: 'PMT-01',
      type: 'PAYMENT',
      date: '2025-06-15',
      totalAmount: 2000,
      narration: 'Office rent',
      entries: [
        { id: 'e1', accountId: 'acc_rent', accountName: 'Rent Expense', accountCode: '5010', debit: 2000, credit: 0 },
        { id: 'e2', accountId: 'acc_cash', accountName: 'Cash in Hand', accountCode: '1001', debit: 0, credit: 2000 },
      ],
    },
  ];

  const monthly = buildMonthlyLedgerSummary(
    data,
    { partyOrAccountId: 'acc_cash', targetName: 'Cash in Hand', preferredKind: 'ACCOUNT' },
    '2025-04-01'
  );
  assert.equal(monthly.months.length, 12);
  const june = monthly.months.find((m) => m.monthKey === '2025-06')!;
  assert.equal(june.credit, 2000);
  assert.equal(june.txCount, 1);
  assert.equal(june.closingBalance, 48000);
  assert.equal(june.closingType, 'DR');
  assert.equal(monthly.closingBalance, 48000);

  const zeroDiff = auditBooksZeroDifference(data);
  assert.equal(zeroDiff.isZeroDifference, true);
  assert.equal(zeroDiff.trialBalanceDiff, 0);
  assert.equal(zeroDiff.balanceSheetDiff, 0);
  assert.equal(zeroDiff.unbalancedVouchersCount, 0);
});

test('dynamically resolves Party Master GSTIN for B2B classification and propagates Party GSTIN edits across all invoices & notes', () => {
  const data = makeCleanErpData();
  data.parties = [
    {
      id: 'pty_1',
      code: 'CUST-1',
      name: 'Kiran Electricals',
      type: 'BOTH',
      gstin: '27AABCK1234L1Z9',
      pan: 'AABCK1234L',
      email: '',
      phone: '',
      address: 'Pune MIDC',
      state: 'Maharashtra',
      stateCode: '27',
      creditLimit: 0,
      openingBalance: 0,
      balanceType: 'DR',
      gstCategory: 'REGULAR',
    },
  ];
  // Legacy invoice saved BEFORE party had GSTIN (blank GSTIN & UNREGISTERED category)
  data.invoices = [
    {
      id: 'inv_legacy_1',
      invoiceNumber: 'INV-501',
      date: '2025-07-10',
      dueDate: '2025-07-10',
      invoiceType: 'TAX_INVOICE',
      partyId: 'pty_1',
      partyName: 'Kiran Electricals',
      partyGstin: '',
      partyGstCategory: 'UNREGISTERED',
      partyAddress: '',
      partyState: 'Delhi',
      placeOfSupply: 'Delhi',
      isInterState: true,
      items: [],
      subtotal: 10000,
      totalDiscount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 1800,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 11800,
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];
  data.purchaseInvoices = [
    {
      id: 'pur_legacy_1',
      billNumber: 'PB-501',
      supplierInvoiceNo: 'KE/25/501',
      date: '2025-07-11',
      dueDate: '2025-07-11',
      partyId: 'pty_1',
      partyName: 'Kiran Electricals',
      partyGstin: '',
      partyState: 'Delhi',
      isInterState: true,
      items: [],
      subtotal: 5000,
      totalDiscount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 900,
      totalTax: 900,
      grandTotal: 5900,
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];
  data.debitCreditNotes = [
    {
      id: 'note_legacy_1',
      noteNumber: 'CN-501',
      type: 'CREDIT_NOTE',
      date: '2025-07-12',
      partyId: 'pty_1',
      partyName: 'Kiran Electricals',
      partyGstin: '',
      reason: 'Price Difference',
      items: [],
      subtotal: 1000,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 180,
      totalTax: 180,
      grandTotal: 1180,
    },
  ];

  // 1. Live resolver classifies legacy invoice under B2B immediately without mutating invoice yet
  const resolved = resolveTransactionGstDetails(data.invoices[0], data.parties, data.company.state);
  assert.equal(resolved.gstin, '27AABCK1234L1Z9');
  assert.equal(resolved.isB2b, true);
  assert.equal(resolved.state, 'Maharashtra');

  const gstr9 = computeGstr9Summary(data, '2025-26');
  assert.equal(gstr9.table4.b2bTaxable, 10000);
  assert.equal(gstr9.table4.b2cTaxable, 0);

  // 2. GSTR-2B reconciliation sees vendor GSTIN from Party Master and scores exact match
  const gstr2bRec = reconcileGstr2Entries(
    data.purchaseInvoices,
    [],
    [
      {
        id: '2b_k1',
        source: 'GSTR2B',
        returnPeriod: '072025',
        vendorName: 'Different Trade Name',
        vendorGstin: '27AABCK1234L1Z9',
        invoiceNumber: 'KE/25/501',
        invoiceDate: '2025-07-11',
        invoiceType: 'Regular',
        taxableValue: 5000,
        igst: 900,
        cgst: 0,
        sgst: 0,
        cess: 0,
        totalTax: 900,
        itcEligibility: 'ELIGIBLE',
      },
    ],
    '2B_VS_BOOKS',
    data.parties
  );
  assert.equal(gstr2bRec.rows[0].status, 'EXACT_MATCH');
  assert.equal(gstr2bRec.rows[0].vendorGstin, '27AABCK1234L1Z9');

  // 3. Propagate Party Master update across existing invoices, purchases, and notes
  const synced = syncPartyDetailsAcrossAppData(data, data.parties[0]);
  assert.equal(synced.invoices[0].partyGstin, '27AABCK1234L1Z9');
  assert.equal(synced.invoices[0].partyGstCategory, 'REGULAR');
  assert.equal(synced.invoices[0].partyState, 'Maharashtra');
  assert.equal(synced.invoices[0].placeOfSupply, 'Maharashtra');
  assert.equal(synced.purchaseInvoices[0].partyGstin, '27AABCK1234L1Z9');
  assert.equal(synced.purchaseInvoices[0].partyState, 'Maharashtra');
  assert.equal(synced.debitCreditNotes[0].partyGstin, '27AABCK1234L1Z9');
});

test('Sales Invoice & POS Cash/UPI/Card/Split immediately post to exact Cash-in-Hand & Bank ledgers with zero Balance Sheet diff', () => {
  const data = makeCleanErpData();
  data.accounts = [
    ...data.accounts,
    {
      id: 'acc_hdfc',
      code: '1021',
      name: 'HDFC Bank Current A/c',
      category: 'ASSET',
      subCategory: 'Bank Account',
      mainGroup: 'Bank Accounts',
      openingBalance: 10000,
      balanceType: 'DR',
    },
    {
      id: 'acc_icici',
      code: '1022',
      name: 'ICICI Bank UPI A/c',
      category: 'ASSET',
      subCategory: 'Bank Account',
      mainGroup: 'Bank Accounts',
      openingBalance: 5000,
      balanceType: 'DR',
    },
  ];
  const cashAcc = data.accounts.find((a) => a.id === 'acc_cash')!;
  cashAcc.openingBalance = 2000;

  // 1. Cash Sales Invoice (full paid Cash -> debits acc_cash ₹1180, leaves 0 in Sundry Debtors)
  // 2. UPI Sales Invoice deposited into ICICI Bank (debits acc_icici ₹2360, leaves 0 in Sundry Debtors)
  // 3. POS Split Sale (Cash ₹500 + UPI ₹600 to HDFC + Credit ₹80 -> Debits acc_cash ₹500, acc_hdfc ₹600, acc_debtors ₹80)
  data.invoices = [
    {
      id: 'inv_cash_1',
      invoiceNumber: 'INV-CASH-1',
      date: '2025-07-05',
      dueDate: '2025-07-05',
      invoiceType: 'TAX_INVOICE',
      partyId: 'pty_c1',
      partyName: 'Cash Buyer',
      partyGstin: '',
      partyAddress: '',
      partyState: 'Maharashtra',
      placeOfSupply: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 1000,
      totalDiscount: 0,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      totalTax: 180,
      roundOff: 0,
      grandTotal: 1180,
      amountPaid: 1180,
      paymentMode: 'CASH',
      paymentAccountId: 'acc_cash',
      status: 'PAID',
    },
    {
      id: 'inv_upi_1',
      invoiceNumber: 'INV-UPI-1',
      date: '2025-07-06',
      dueDate: '2025-07-06',
      invoiceType: 'TAX_INVOICE',
      partyId: 'pty_c2',
      partyName: 'UPI Buyer',
      partyGstin: '',
      partyAddress: '',
      partyState: 'Maharashtra',
      placeOfSupply: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 2000,
      totalDiscount: 0,
      cgstAmount: 180,
      sgstAmount: 180,
      igstAmount: 0,
      totalTax: 360,
      roundOff: 0,
      grandTotal: 2360,
      amountPaid: 2360,
      paymentMode: 'UPI',
      paymentAccountId: 'acc_icici',
      status: 'PAID',
    },
    {
      id: 'inv_pos_split',
      invoiceNumber: 'POS-001',
      date: '2025-07-07',
      dueDate: '2025-07-07',
      invoiceType: 'RETAIL_BILL',
      isPosSale: true,
      partyId: 'pty_c3',
      partyName: 'Split Customer',
      partyGstin: '',
      partyAddress: '',
      partyState: 'Maharashtra',
      placeOfSupply: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 1000,
      totalDiscount: 0,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      totalTax: 180,
      roundOff: 0,
      grandTotal: 1180,
      amountPaid: 1100,
      paymentMode: 'SPLIT',
      paymentAccountId: 'acc_hdfc',
      paymentBreakdown: { cash: 500, upi: 400, card: 200, credit: 80 },
      status: 'PARTIAL',
    },
  ];

  const balances = calculateAccountBalances(data);
  const signedDr = (id: string) => {
    const b = balances.get(id);
    if (!b) return 0;
    return b.balanceType === 'DR' ? b.netBalance : -b.netBalance;
  };
  assert.equal(signedDr('acc_cash'), 2000 + 1180 + 500);
  assert.equal(signedDr('acc_icici'), 5000 + 2360);
  assert.equal(signedDr('acc_hdfc'), 10000 + 600);
  assert.equal(signedDr('acc_debtors'), 80);

  const summary = getFinancialSummary(data);
  assert.equal(summary.cashAndBankBalance, 3680 + 7360 + 10600);
  assert.equal(summary.totalReceivables, 80);

  // Cash ledger drill-down statement matches exact closing balance
  const cashStmt = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: 'acc_cash',
    targetName: 'Cash in Hand',
    preferredKind: 'ACCOUNT',
  });
  assert.equal(cashStmt.closingBalance, 3680);
  assert.equal(cashStmt.rows.length, 2);

  // Zero TB / BS / Double-Entry Difference
  const audit = auditBooksZeroDifference(data);
  assert.equal(audit.trialBalanceDiff, 0);
  assert.equal(audit.balanceSheetDiff, 0);
  assert.equal(audit.unbalancedVouchersCount, 0);
  assert.equal(audit.unbalancedSalesCount, 0);
  assert.equal(audit.isZeroDifference, true);
});

test('Purchase Bills & Expense Payment Vouchers immediately credit Cash/Bank ledgers and reconcile Debtors/Creditors', () => {
  const data = makeCleanErpData();
  data.accounts = [
    ...data.accounts,
    {
      id: 'acc_hdfc',
      code: '1021',
      name: 'HDFC Bank Current A/c',
      category: 'ASSET',
      subCategory: 'Bank Account',
      mainGroup: 'Bank Accounts',
      openingBalance: 50000,
      balanceType: 'DR',
    },
  ];
  const cashAcc = data.accounts.find((a) => a.id === 'acc_cash')!;
  cashAcc.openingBalance = 25000;

  // 1. Purchase Bill paid in full via Cash (₹5,900 -> credits acc_cash ₹5,900, leaves ₹0 in Creditors)
  // 2. Purchase Bill partially paid via HDFC Bank (₹4,000 paid of ₹11,800 -> credits acc_hdfc ₹4,000, Credits ₹7,800 to Creditors)
  data.purchaseInvoices = [
    {
      id: 'pur_cash_1',
      billNumber: 'PB-101',
      supplierInvoiceNo: 'SUP/101',
      date: '2025-07-08',
      dueDate: '2025-07-08',
      partyId: 'pty_v1',
      partyName: 'Local Depot',
      partyGstin: '',
      partyState: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 5000,
      cgstAmount: 450,
      sgstAmount: 450,
      igstAmount: 0,
      totalTax: 900,
      roundOff: 0,
      grandTotal: 5900,
      amountPaid: 5900,
      paymentMode: 'CASH',
      paymentAccountId: 'acc_cash',
      status: 'PAID',
    },
    {
      id: 'pur_bank_partial',
      billNumber: 'PB-102',
      supplierInvoiceNo: 'SUP/102',
      date: '2025-07-09',
      dueDate: '2025-08-08',
      partyId: 'pty_v2',
      partyName: 'Wholesale Co',
      partyGstin: '',
      partyState: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 10000,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 11800,
      amountPaid: 4000,
      paymentMode: 'BANK_TRANSFER',
      paymentAccountId: 'acc_hdfc',
      status: 'PARTIAL',
    },
  ];

  // 3. Expense Payment Voucher via HDFC Bank (Office Rent ₹3,000)
  data.vouchers = [
    {
      id: 'vch_exp_1',
      voucherNumber: 'PAY-001',
      type: 'PAYMENT',
      date: '2025-07-10',
      narration: 'Office rent paid',
      totalAmount: 3000,
      paymentMode: 'BANK_TRANSFER',
      entries: [
        { id: 'e1', accountId: 'acc_rent', accountName: 'Office Rent Expense', accountCode: '5120', debit: 3000, credit: 0 },
        { id: 'e2', accountId: 'acc_hdfc', accountName: 'HDFC Bank Current A/c', accountCode: '1021', debit: 0, credit: 3000 },
      ],
    },
  ];

  const balances = calculateAccountBalances(data);
  const bal = (id: string) => balances.get(id)?.netBalance || 0;
  assert.equal(bal('acc_cash'), 25000 - 5900);
  assert.equal(bal('acc_hdfc'), 50000 - 4000 - 3000);
  assert.equal(bal('acc_creditors'), 7800);
  assert.equal(bal('acc_rent'), 3000);

  const bankStmt = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: 'acc_hdfc',
    targetName: 'HDFC Bank Current A/c',
    preferredKind: 'ACCOUNT',
  });
  assert.equal(bankStmt.closingBalance, 43000);
  assert.equal(bankStmt.rows.length, 2);

  const audit = auditBooksZeroDifference(data);
  assert.equal(audit.trialBalanceDiff, 0);
  assert.equal(audit.balanceSheetDiff, 0);
  assert.equal(audit.unbalancedPurchasesCount, 0);
  assert.equal(audit.isZeroDifference, true);
});

test('Linked Receipt/Payment vouchers do not double-count Cash/Bank settlements', () => {
  const data = makeCleanErpData();
  data.invoices = [
    {
      id: 'inv_linked_1',
      invoiceNumber: 'INV/2025/001',
      date: '2025-07-01',
      dueDate: '2025-07-15',
      invoiceType: 'TAX_INVOICE',
      partyId: 'pty_1',
      partyName: 'Omega Corp',
      partyGstin: '',
      partyAddress: '',
      partyState: 'Maharashtra',
      placeOfSupply: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 1000,
      totalDiscount: 0,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      totalTax: 180,
      roundOff: 0,
      grandTotal: 1180,
      amountPaid: 1180,
      paymentMode: 'CASH',
      paymentAccountId: 'acc_cash',
      status: 'PAID',
    },
  ];
  data.vouchers = [
    {
      id: 'v_rct_1',
      voucherNumber: 'RCT/2025/001',
      type: 'RECEIPT',
      date: '2025-07-02',
      partyId: 'pty_1',
      partyName: 'Omega Corp',
      referenceNo: 'INV/2025/001',
      linkedInvoiceId: 'inv_linked_1',
      narration: 'Receipt against INV/2025/001',
      totalAmount: 1180,
      entries: [
        { id: 'e1', accountId: 'acc_cash', accountName: 'Cash in Hand', accountCode: '1010', debit: 1180, credit: 0 },
        { id: 'e2', accountId: 'acc_debtors', accountName: 'Sundry Debtors', accountCode: '1030', debit: 0, credit: 1180 },
      ],
    },
  ];

  const balances = calculateAccountBalances(data);
  assert.equal(balances.get('acc_cash')?.netBalance, 1180); // Debited ONCE, never ₹2,360
  assert.equal(balances.get('acc_debtors')?.netBalance || 0, 0); // Cleared cleanly to zero
  const audit = auditBooksZeroDifference(data);
  assert.equal(audit.isZeroDifference, true);
});

test('auditBooksZeroDifference detects unbalanced Double-Entry records cleanly', () => {
  const data = makeCleanErpData();
  data.vouchers = [
    {
      id: 'v_bad',
      voucherNumber: 'JRN-BAD',
      type: 'JOURNAL',
      date: '2025-07-12',
      narration: 'Intentionally unbalanced',
      totalAmount: 500,
      entries: [
        { id: 'e1', accountId: 'acc_rent', accountName: 'Office Rent Expense', accountCode: '5120', debit: 500, credit: 0 },
        { id: 'e2', accountId: 'acc_creditors', accountName: 'Sundry Creditors', accountCode: '2010', debit: 0, credit: 400 },
      ],
    },
  ];

  const audit = auditBooksZeroDifference(data);
  assert.equal(audit.unbalancedVouchersCount, 1);
  assert.equal(audit.isZeroDifference, false);
});

test('Sub-rupee remainders auto-route to Round Off ledger across Sales, Purchase, Debit/Credit Notes & Vouchers with strict <0.001 zero difference', () => {
  const data = makeCleanErpData();
  // 1. Sales Invoice with sub-rupee fractional diff (no explicit roundOff set -> 0.33 diff)
  data.invoices = [
    {
      id: 'inv_ro_1',
      invoiceNumber: 'INV-RO-1',
      date: '2025-08-05',
      dueDate: '2025-08-05',
      invoiceType: 'TAX_INVOICE',
      partyId: 'pty_ro1',
      partyName: 'Paise Customer',
      partyGstin: '',
      partyAddress: '',
      partyState: 'Maharashtra',
      placeOfSupply: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 1000,
      totalDiscount: 100,
      cgstAmount: 81.17,
      sgstAmount: 81.16,
      igstAmount: 0,
      totalTax: 162.33,
      roundOff: 0,
      grandTotal: 1062, // 900 + 162.33 = 1062.33 -> -0.33 auto-routed to Round Off Credit/Income
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];

  // 2. Purchase Bill with 0.28 paise diff (1000 - 50 + 171.28 = 1121.28 -> grandTotal 1121)
  data.purchaseInvoices = [
    {
      id: 'pur_ro_1',
      billNumber: 'PB-RO-1',
      supplierInvoiceNo: 'SUP-RO-1',
      date: '2025-08-06',
      dueDate: '2025-08-06',
      partyId: 'pty_ro2',
      partyName: 'Paise Supplier',
      partyGstin: '',
      partyState: 'Maharashtra',
      isInterState: false,
      items: [],
      subtotal: 1000,
      totalDiscount: 50,
      cgstAmount: 85.64,
      sgstAmount: 85.64,
      igstAmount: 0,
      totalTax: 171.28,
      grandTotal: 1121,
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];

  // 3. Credit Note with Discount + sub-rupee diff
  data.debitCreditNotes = [
    {
      id: 'cn_ro_1',
      noteNumber: 'CN-RO-1',
      type: 'CREDIT_NOTE',
      date: '2025-08-07',
      partyId: 'pty_ro1',
      partyName: 'Paise Customer',
      reason: 'Sales Return with Discount',
      items: [],
      subtotal: 200,
      totalDiscount: 20,
      cgstAmount: 16.33,
      sgstAmount: 16.34,
      igstAmount: 0,
      totalTax: 32.67,
      roundOff: -0.67,
      grandTotal: 212,
    },
  ];

  // 4. Journal Voucher normalized through normalizeVoucherWithRoundOff with +0.45 Dr/Cr gap
  const normalizedJrn = normalizeVoucherWithRoundOff(
    {
      id: 'vch_ro_1',
      voucherNumber: 'JRN-RO-1',
      type: 'JOURNAL',
      date: '2025-08-08',
      totalAmount: 500,
      narration: 'Vendor settlement with sub-rupee diff',
      entries: [
        { id: 'j1', accountId: 'acc_rent', accountName: 'Rent Expense', accountCode: '5010', debit: 500.45, credit: 0 },
        { id: 'j2', accountId: 'acc_creditors', accountName: 'Sundry Creditors', accountCode: '2010', debit: 0, credit: 500 },
      ],
    },
    data.accounts
  );
  data.vouchers = [normalizedJrn];

  // Voucher itself is now strictly balanced (< 0.001) with explicit Round Off entry
  const jrnDr = normalizedJrn.entries.reduce((s, e) => s + e.debit, 0);
  const jrnCr = normalizedJrn.entries.reduce((s, e) => s + e.credit, 0);
  assert.ok(Math.abs(jrnDr - jrnCr) < 0.001);
  assert.equal(normalizedJrn.entries.some((e) => e.accountId === 'acc_round_off'), true);

  const audit = auditBooksZeroDifference(data);
  assert.equal(audit.trialBalanceDiff, 0);
  assert.equal(audit.balanceSheetDiff, 0);
  assert.equal(audit.unbalancedVouchersCount, 0);
  assert.equal(audit.unbalancedSalesCount, 0);
  assert.equal(audit.unbalancedPurchasesCount, 0);
  assert.equal(audit.unbalancedNotesCount, 0);
  assert.equal(audit.isZeroDifference, true);

  // Round Off Ledger Statement must match calculateAccountBalances 1:1
  const balances = calculateAccountBalances(data);
  const roBal = balances.get('acc_round_off')!;
  const roStmt = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: 'acc_round_off',
    targetName: 'Round Off Account',
    preferredKind: 'ACCOUNT',
  });
  assert.ok(Math.abs(roStmt.closingBalance - roBal.netBalance) < 0.001);
  assert.equal(roStmt.closingType, roBal.balanceType);

  // Periodic breakdown matches strict zero-difference Debits & Credits
  const monthly = buildPeriodicFinancialBreakdown(data, 'MONTHLY');
  const aug = monthly.find((m) => m.key === '2025-08')!;
  assert.ok(Math.abs(aug.periodDebit - aug.periodCredit) < 0.001);
});

test('Real-time Closing Stock recalculates immediately when item quantity or purchase rate changes after Tally import', () => {
  const data = makeCleanErpData();
  data.items = [
    {
      id: 'itm_sync_1',
      code: 'MED-01',
      name: 'Paracetamol Box',
      description: '',
      hsnSacCode: '3004',
      unit: 'BOX',
      purchasePrice: 100,
      importedPurchasePrice: 100,
      salesPrice: 140,
      taxRate: 12,
      openingStock: 10,
      currentStock: 10,
      importedClosingQty: 10,
      closingStockValue: 980, // FIFO/cost valuation preserved from Tally while unchanged
      minStockLevel: 2,
      category: 'Pharma',
    },
  ];

  // 1. Initially unchanged -> preserves exact Tally valuation 980
  assert.equal(getItemClosingStockValue(data.items[0]), 980);
  assert.equal(calculateClosingStock(data), 980);

  // 2. User edits Purchase Rate to 125 (keeping same stock 10) -> recalculates immediately as 10 * 125 = 1250
  const rateEditedData: AppData = {
    ...data,
    items: [{ ...data.items[0], purchasePrice: 125 }],
  };
  assert.equal(getItemClosingStockValue(rateEditedData.items[0]), 1250);
  assert.equal(calculateClosingStock(rateEditedData), 1250);
  const fyAfterRateEdit = filterAppDataByFinancialYear(rateEditedData, '2025-04-01');
  assert.equal(calculateClosingStock(fyAfterRateEdit), 1250);

  // 3. User adjusts Stock Quantity to 14 (at rate 100) -> recalculates immediately as 14 * 100 = 1400
  const qtyEditedData: AppData = {
    ...data,
    items: [{ ...data.items[0], currentStock: 14 }],
  };
  assert.equal(getItemClosingStockValue(qtyEditedData.items[0]), 1400);
  assert.equal(calculateClosingStock(qtyEditedData), 1400);
  const fyAfterQtyEdit = filterAppDataByFinancialYear(qtyEditedData, '2025-04-01');
  assert.equal(calculateClosingStock(fyAfterQtyEdit), 1400);
});



