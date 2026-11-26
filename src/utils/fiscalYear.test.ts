import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDateRangeToken,
  buildFYRangeToken,
  filterAppDataByFinancialYear,
  filterAppDataByFYRange,
  getFinancialYearRange,
  isDateInFinancialYear
} from './fiscalYear';
import { APP_SHORTCUT_DEFINITIONS, isEditableEventTarget } from './keyboardShortcuts';
import type { AppData, SalesInvoice } from '../types';

function makeInvoice(
  id: string,
  invoiceNumber: string,
  date: string,
  grandTotal: number,
  amountPaid: number,
  status: SalesInvoice['status']
): SalesInvoice {
  return {
    id,
    invoiceNumber,
    date,
    dueDate: date,
    invoiceType: 'TAX_INVOICE',
    partyId: 'p_cust',
    partyName: 'Customer A',
    partyGstin: '',
    partyAddress: 'Delhi',
    partyState: 'Delhi',
    placeOfSupply: 'Delhi',
    isInterState: false,
    items: [],
    subtotal: grandTotal,
    totalDiscount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal,
    amountPaid,
    status
  };
}

function makeMinimalAppData(): AppData {
  return {
    company: {
      id: 'cmp_test',
      name: 'Test Co',
      address: 'Delhi',
      gstin: '07AAAAA0000A1Z5',
      state: 'Delhi',
      phone: '9999999999',
      email: 'test@example.com',
      financialYearStart: '2025-04-01',
      currency: 'INR'
    },
    accounts: [
      {
        id: 'acc_cash',
        code: '1001',
        name: 'Cash in Hand',
        category: 'ASSET',
        subCategory: 'Cash in Hand',
        openingBalance: 1000,
        balanceType: 'DR'
      },
      {
        id: 'acc_sales',
        code: '4001',
        name: 'Sales Account',
        category: 'REVENUE',
        subCategory: 'Sales Accounts',
        openingBalance: 0,
        balanceType: 'CR'
      },
      {
        id: 'acc_cust',
        code: '1101',
        name: 'Customer A',
        category: 'ASSET',
        subCategory: 'Sundry Debtors',
        openingBalance: 0,
        balanceType: 'DR'
      }
    ],
    accountGroups: [],
    parties: [
      {
        id: 'p_cust',
        code: 'P001',
        name: 'Customer A',
        type: 'CUSTOMER',
        gstin: '',
        pan: '',
        email: '',
        phone: '9876543210',
        address: 'Delhi',
        state: 'Delhi',
        stateCode: '07',
        creditLimit: 0,
        openingBalance: 0,
        balanceType: 'DR',
        openingBalanceType: 'DR'
      }
    ],
    items: [],
    invoices: [
      makeInvoice('inv_fy24', 'INV-24-01', '2024-06-15', 5000, 0, 'UNPAID'),
      makeInvoice('inv_fy25', 'INV-25-01', '2025-07-10', 3000, 3000, 'PAID'),
      makeInvoice('inv_fy26', 'INV-26-01', '2026-05-20', 7000, 0, 'UNPAID')
    ],
    purchaseInvoices: [],
    purchaseOrders: [],
    vouchers: [],
    debitCreditNotes: [],
    bankStatements: [],
    employees: [],
    payrollRuns: [],
    budgets: [],
    recurringTemplates: [],
    godowns: [],
    batches: [],
    stockAdjustments: [],
    auditLogs: [],
    userProfiles: [],
    activeUser: { id: 'u1', name: 'Admin', role: 'ADMIN', email: 'a@b.com', companyId: 'cmp_test', pin: '' },
    securityPin: '',
    pinRequired: false,
    license: { isLicensed: true, key: 'PRO', planName: 'Enterprise', activatedAt: '2025-01-01', maxCompanies: 99, licenseType: 'OWNER' }
  } as unknown as AppData;
}

test('filterAppDataByFYRange filters custom FY-to-FY range and normalizes swapped FY years', () => {
  const master = makeMinimalAppData();

  // Swapped inputs: 2026-04-01 as from and 2025-04-01 as to
  const res = filterAppDataByFYRange(master, '2026-04-01', '2025-04-01');

  assert.equal(res.fromRange.fyStart, '2025-04-01');
  assert.equal(res.toRange.fyEnd, '2027-03-31');
  assert.equal(res.rangeLabel, 'FY 2025-26 → FY 2026-27');
  assert.equal(res.displayRange, '01 Apr 2025 – 31 Mar 2027');

  // Only invoices inside FY 2025-26 and FY 2026-27 should appear
  const invIds = res.filtered.invoices.map((i) => i.id);
  assert.deepEqual(invIds, ['inv_fy25', 'inv_fy26']);

  // Prior FY 2024-25 invoice (5000 DR) should carry forward into Customer A opening balance
  const cust = res.filtered.parties.find((p) => p.id === 'p_cust');
  assert.ok(cust);
  assert.equal(cust.openingBalance, 5000);
});

test('Header custom FY period token & custom date period token work seamlessly in filterAppDataByFinancialYear', () => {
  const master = makeMinimalAppData();
  const fyToken = buildFYRangeToken('2025-04-01', '2026-04-01');
  assert.equal(fyToken, 'RANGE:2025-04-01:2026-04-01');

  const fyMeta = getFinancialYearRange(fyToken);
  assert.equal(fyMeta.isCustomPeriod, true);
  assert.equal(fyMeta.label, 'FY 2025-26 → FY 2026-27');
  assert.equal(fyMeta.fyStart, '2025-04-01');
  assert.equal(fyMeta.fyEnd, '2027-03-31');
  assert.equal(isDateInFinancialYear('2024-06-15', fyToken), false);
  assert.equal(isDateInFinancialYear('2026-05-20', fyToken), true);

  const filteredFy = filterAppDataByFinancialYear(master, fyToken);
  assert.deepEqual(filteredFy.invoices.map((i) => i.id), ['inv_fy25', 'inv_fy26']);
  assert.equal(filteredFy.parties.find((p) => p.id === 'p_cust')?.openingBalance, 5000);

  const dateToken = buildDateRangeToken('2026-01-01', '2025-06-01');
  assert.equal(dateToken, 'DATES:2025-06-01:2026-01-01');
  const filteredDates = filterAppDataByFinancialYear(master, dateToken);
  assert.deepEqual(filteredDates.invoices.map((i) => i.id), ['inv_fy25']);
});

test('filterAppDataByFYRange single FY keeps single FY label without arrow', () => {
  const master = makeMinimalAppData();
  const res = filterAppDataByFYRange(master, '2025-04-01', '2025-04-01');
  assert.equal(res.rangeLabel, 'FY 2025-26');
  assert.deepEqual(res.filtered.invoices.map((i) => i.id), ['inv_fy25']);
});

test('APP_SHORTCUT_DEFINITIONS has unique IDs and covers navigation, vouchers, reports & system', () => {
  const ids = new Set(APP_SHORTCUT_DEFINITIONS.map((d) => d.id));
  assert.equal(ids.size, APP_SHORTCUT_DEFINITIONS.length);
  const categories = new Set(APP_SHORTCUT_DEFINITIONS.map((d) => d.category));
  assert.deepEqual([...categories].sort(), ['NAVIGATION', 'REPORTS', 'SYSTEM', 'VOUCHERS']);
});

test('isEditableEventTarget prevents single-key shortcuts inside inputs but allows outside', () => {
  assert.equal(isEditableEventTarget({ tagName: 'INPUT' } as unknown as EventTarget), true);
  assert.equal(isEditableEventTarget({ tagName: 'textarea' } as unknown as EventTarget), true);
  assert.equal(isEditableEventTarget({ tagName: 'SELECT' } as unknown as EventTarget), true);
  assert.equal(isEditableEventTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true);
  assert.equal(isEditableEventTarget({ tagName: 'BUTTON', isContentEditable: false } as unknown as EventTarget), false);
  assert.equal(isEditableEventTarget(null), false);
});
