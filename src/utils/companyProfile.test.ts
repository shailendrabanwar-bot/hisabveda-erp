import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COUNTRY_PRESETS,
  computeCompositionTurnoverSummary,
  getCurrencySymbol,
  getInvoicePrintHeaderInfo,
  resolveCompanyTaxProfile,
} from './companyProfile';
import { calculateAccountBalances } from './accounting';
import { createDefaultChartOfAccounts, formatCurrency, setActiveNumberFormat } from './storage';
import { initialSampleData } from '../data/sampleData';
import { AppData, PurchaseInvoice, SalesInvoice } from '../types';

function makeCleanData(companyOverrides?: Partial<AppData['company']>): AppData {
  return {
    ...initialSampleData,
    company: {
      ...initialSampleData.company,
      financialYearStart: '2025-04-01',
      booksBeginningFrom: '2025-04-01',
      ...companyOverrides,
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

function makeSampleInvoice(overrides?: Partial<SalesInvoice>): SalesInvoice {
  return {
    id: 'inv_test_1',
    invoiceNumber: 'INV-001',
    date: '2025-08-10',
    dueDate: '2025-08-25',
    invoiceType: 'TAX_INVOICE',
    partyId: 'pty_1',
    partyName: 'Test Customer',
    partyGstin: '',
    partyAddress: 'Mumbai',
    partyState: 'Maharashtra',
    placeOfSupply: 'Maharashtra',
    isInterState: false,
    items: [],
    subtotal: 10000,
    totalDiscount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    cessAmount: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 10000,
    amountPaid: 0,
    status: 'UNPAID',
    ...overrides,
  };
}

test('formatCurrency applies Indian Lakhs/Crores vs International Millions and AED symbol cleanly', () => {
  setActiveNumberFormat(null);

  const inrIndian = formatCurrency(1234567.5, 'INR', 'INDIAN');
  assert.ok(inrIndian.includes('12,34,567.50'), `Expected Indian grouping in "${inrIndian}"`);
  assert.ok(inrIndian.includes('₹'), `Expected Rupee symbol in "${inrIndian}"`);

  const inrIntl = formatCurrency(1234567.5, 'INR', 'INTERNATIONAL');
  assert.ok(inrIntl.includes('1,234,567.50'), `Expected International grouping in "${inrIntl}"`);

  const usdIntl = formatCurrency(1234567.5, 'USD', 'INTERNATIONAL');
  assert.ok(usdIntl.includes('1,234,567.50') && usdIntl.includes('$'), `Expected USD format in "${usdIntl}"`);

  const aedIntl = formatCurrency(2500000, 'AED', 'INTERNATIONAL');
  assert.equal(aedIntl, 'د.إ 2,500,000.00');
  assert.equal(formatCurrency(-1500, 'AED', 'INTERNATIONAL'), '-د.إ 1,500.00');

  assert.equal(getCurrencySymbol('INR'), '₹');
  assert.equal(getCurrencySymbol('USD'), '$');
  assert.equal(getCurrencySymbol('AED'), 'د.إ');
  assert.equal(getCurrencySymbol('EUR'), '€');
  assert.equal(getCurrencySymbol('GBP'), '£');

  setActiveNumberFormat('INDIAN');
  const activeFollow = formatCurrency(1500000, 'USD');
  assert.ok(activeFollow.includes('15,00,000.00'));
  setActiveNumberFormat(null);
});

test('resolveCompanyTaxProfile handles Regular, Unregistered Non-GST, Composition, SEZ, and International presets', () => {
  const regular = resolveCompanyTaxProfile({
    country: 'India',
    currency: 'INR',
    gstEnabled: true,
    gstRegistrationType: 'REGULAR',
    cessEnabled: true,
  });
  assert.equal(regular.isRegularGst, true);
  assert.equal(regular.isComposition, false);
  assert.equal(regular.isNonGst, false);
  assert.equal(regular.shouldChargeGstOnSales, true);
  assert.equal(regular.cessEnabled, true);
  assert.equal(regular.numberFormat, 'INDIAN');

  const unregistered = resolveCompanyTaxProfile({
    country: 'India',
    currency: 'INR',
    gstEnabled: false,
    gstRegistrationType: 'UNREGISTERED',
  });
  assert.equal(unregistered.gstEnabled, false);
  assert.equal(unregistered.isNonGst, true);
  assert.equal(unregistered.shouldChargeGstOnSales, false);
  assert.equal(unregistered.gstRegistrationType, 'UNREGISTERED');

  const composition = resolveCompanyTaxProfile({
    country: 'India',
    currency: 'INR',
    gstEnabled: true,
    gstRegistrationType: 'COMPOSITION',
    compositionTaxRate: 5,
  });
  assert.equal(composition.isComposition, true);
  assert.equal(composition.isRegularGst, false);
  assert.equal(composition.shouldChargeGstOnSales, false);
  assert.equal(composition.compositionTaxRate, 5);

  const sez = resolveCompanyTaxProfile({
    country: 'India',
    currency: 'INR',
    gstEnabled: true,
    gstRegistrationType: 'SEZ_EXPORT',
  });
  assert.equal(sez.isRegularGst, true);
  assert.equal(sez.shouldChargeGstOnSales, true);

  const uaePreset = COUNTRY_PRESETS.find((c) => c.currency === 'AED');
  assert.ok(uaePreset);
  const intlUae = resolveCompanyTaxProfile({
    country: uaePreset.country,
    currency: uaePreset.currency,
    numberFormat: uaePreset.numberFormat,
    gstEnabled: uaePreset.defaultGstEnabled,
    gstRegistrationType: uaePreset.defaultGstType,
  });
  assert.equal(intlUae.isNonGst, true);
  assert.equal(intlUae.ewayBillEnabled, false);
  assert.equal(intlUae.tdsTcsEnabled, false);
  assert.equal(intlUae.numberFormat, 'INTERNATIONAL');
});

test('getInvoicePrintHeaderInfo switches cleanly between TAX INVOICE, BILL OF SUPPLY, and Composition notice', () => {
  const regularCompany = {
    country: 'India',
    currency: 'INR' as const,
    gstEnabled: true,
    gstRegistrationType: 'REGULAR' as const,
    cessEnabled: true,
  };
  const regularHeader = getInvoicePrintHeaderInfo(
    regularCompany,
    makeSampleInvoice({ invoiceType: 'TAX_INVOICE', cgstAmount: 900, sgstAmount: 900, totalTax: 1800, grandTotal: 11800 })
  );
  assert.equal(regularHeader.title, 'TAX INVOICE');
  assert.equal(regularHeader.compositionDeclaration, null);
  assert.equal(regularHeader.hideTaxColumns, false);
  assert.equal(regularHeader.showCessColumn, true);

  const compCompany = {
    country: 'India',
    currency: 'INR' as const,
    gstEnabled: true,
    gstRegistrationType: 'COMPOSITION' as const,
    compositionTaxRate: 1,
    cessEnabled: true,
  };
  const compHeader = getInvoicePrintHeaderInfo(
    compCompany,
    makeSampleInvoice({ invoiceType: 'RETAIL_BILL', registrationTypeAtSupply: 'COMPOSITION' })
  );
  assert.equal(compHeader.title, 'BILL OF SUPPLY');
  assert.equal(
    compHeader.compositionDeclaration,
    'Composition Taxable Person, not eligible to collect tax on supplies'
  );
  assert.equal(compHeader.hideTaxColumns, true);
  assert.equal(compHeader.showCessColumn, false);

  const nonGstCompany = {
    country: 'United States',
    currency: 'USD' as const,
    gstEnabled: false,
    gstRegistrationType: 'UNREGISTERED' as const,
  };
  const nonGstRetailHeader = getInvoicePrintHeaderInfo(
    nonGstCompany,
    makeSampleInvoice({ invoiceType: 'RETAIL_BILL', registrationTypeAtSupply: 'UNREGISTERED' })
  );
  assert.equal(nonGstRetailHeader.title, 'RETAIL INVOICE / BILL OF SUPPLY');
  assert.equal(nonGstRetailHeader.compositionDeclaration, null);
  assert.equal(nonGstRetailHeader.hideTaxColumns, true);
  assert.equal(nonGstRetailHeader.showCessColumn, false);
});

test('computeCompositionTurnoverSummary excludes cancelled & proforma invoices and computes flat turnover tax', () => {
  const invoices: SalesInvoice[] = [
    makeSampleInvoice({ id: '1', subtotal: 50000, totalDiscount: 5000, grandTotal: 45000, status: 'PAID' }),
    makeSampleInvoice({ id: '2', subtotal: 25000, totalDiscount: 0, grandTotal: 25000, status: 'UNPAID' }),
    makeSampleInvoice({ id: '3', subtotal: 10000, totalDiscount: 0, grandTotal: 10000, status: 'CANCELLED' }),
    makeSampleInvoice({ id: '4', invoiceType: 'PROFORMA', subtotal: 15000, grandTotal: 15000, status: 'UNPAID' }),
  ];

  const summary = computeCompositionTurnoverSummary(invoices, {
    gstEnabled: true,
    gstRegistrationType: 'COMPOSITION',
    compositionTaxRate: 1,
  });

  assert.equal(summary.invoiceCount, 2);
  assert.equal(summary.taxableTurnover, 70000);
  assert.equal(summary.compositionTaxPayable, 700);
});

test('calculateAccountBalances posts Output/Input Cess and maintains strict Total Debit == Total Credit', () => {
  const data = makeCleanData({
    gstEnabled: true,
    gstRegistrationType: 'REGULAR',
    cessEnabled: true,
  });

  const salesWithCess = makeSampleInvoice({
    id: 'inv_cess_1',
    subtotal: 10000,
    totalDiscount: 0,
    cgstAmount: 1400,
    sgstAmount: 1400,
    igstAmount: 0,
    cessAmount: 1200,
    totalTax: 2800,
    roundOff: 0,
    grandTotal: 14000,
    amountPaid: 14000,
    paymentMode: 'CASH',
    paymentAccountId: 'acc_cash',
    status: 'PAID',
  });

  const purchaseWithCess: PurchaseInvoice = {
    id: 'pur_cess_1',
    billNumber: 'PB-1',
    supplierInvoiceNo: 'SUP-101',
    date: '2025-08-12',
    dueDate: '2025-09-11',
    partyId: 'pty_v1',
    partyName: 'Beverage Supplier',
    partyGstin: '27AAAAA0000A1Z5',
    partyState: 'Maharashtra',
    isInterState: false,
    items: [],
    subtotal: 5000,
    totalDiscount: 0,
    cgstAmount: 700,
    sgstAmount: 700,
    igstAmount: 0,
    cessAmount: 600,
    totalTax: 1400,
    grandTotal: 7000,
    amountPaid: 0,
    status: 'UNPAID',
  };

  data.invoices.push(salesWithCess);
  data.purchaseInvoices.push(purchaseWithCess);

  const balances = calculateAccountBalances(data);
  assert.equal(balances.get('acc_gst_cess')?.credit, 1200);
  assert.equal(balances.get('acc_itc_cess')?.debit, 600);
  assert.equal(balances.get('acc_cash')?.debit, 14000);
  assert.equal(balances.get('acc_creditors')?.credit, 7000);
  assert.equal(balances.get('acc_diff_opening_bal'), undefined);

  let totalDr = 0;
  let totalCr = 0;
  for (const [, b] of balances.entries()) {
    if (b.balanceType === 'DR') totalDr += b.netBalance;
    else totalCr += b.netBalance;
  }
  assert.ok(Math.abs(totalDr - totalCr) < 0.001, `Expected Dr (${totalDr}) == Cr (${totalCr})`);
});

test('calculateAccountBalances handles Non-GST sales with zero tax liability and balanced Dr == Cr', () => {
  const data = makeCleanData({
    country: 'United Arab Emirates (UAE)',
    currency: 'AED',
    numberFormat: 'INTERNATIONAL',
    gstEnabled: false,
    gstRegistrationType: 'UNREGISTERED',
    cessEnabled: false,
  });

  data.invoices.push(
    makeSampleInvoice({
      id: 'inv_nongst_1',
      invoiceType: 'RETAIL_BILL',
      registrationTypeAtSupply: 'UNREGISTERED',
      subtotal: 5000,
      totalDiscount: 250,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      cessAmount: 0,
      totalTax: 0,
      grandTotal: 4750,
      amountPaid: 4750,
      paymentMode: 'BANK_TRANSFER',
      paymentAccountId: 'acc_bank',
      status: 'PAID',
    })
  );

  const balances = calculateAccountBalances(data);
  assert.equal(balances.get('acc_gst_cgst')?.credit || 0, 0);
  assert.equal(balances.get('acc_gst_sgst')?.credit || 0, 0);
  assert.equal(balances.get('acc_gst_cess')?.credit || 0, 0);
  assert.equal(balances.get('acc_bank')?.debit, 4750);
  assert.equal(balances.get('acc_sales')?.credit, 4750);
  assert.equal(balances.get('acc_diff_opening_bal'), undefined);
});
