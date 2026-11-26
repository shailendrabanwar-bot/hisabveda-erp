import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpiPaymentUri,
  computeDueDateFromCreditDays,
  evaluateCartNegativeStock,
  evaluatePartyCreditAndOverdue,
  extractGstinMetadata,
  getItemPriceForTier,
  resolveNegativeStockPolicy,
} from './erpSmartHelpers';
import { AppData, ItemMaster, PartyMaster } from '../types';

test('extractGstinMetadata extracts PAN (chars 3-12) and State Code/Name immediately', () => {
  const mp = extractGstinMetadata('23aabcu9603r1zm');
  assert.equal(mp.cleanGstin, '23AABCU9603R1ZM');
  assert.equal(mp.stateCode, '23');
  assert.equal(mp.stateName, 'Madhya Pradesh');
  assert.equal(mp.pan, 'AABCU9603R');
  assert.equal(mp.panValid, true);
  assert.equal(mp.isComplete, true);
  assert.equal(mp.inferredGstCategory, 'REGULAR');

  const up = extractGstinMetadata('09');
  assert.equal(up.stateCode, '09');
  assert.equal(up.stateName, 'Uttar Pradesh');
  assert.equal(up.pan, '');
  assert.equal(up.isComplete, false);
});

test('computeDueDateFromCreditDays uses UTC calendar math cleanly', () => {
  assert.equal(computeDueDateFromCreditDays('2026-04-01', 30, 15), '2026-05-01');
  assert.equal(computeDueDateFromCreditDays('2026-04-01', 0, 15), '2026-04-01');
  assert.equal(computeDueDateFromCreditDays('2026-04-01', undefined, 15), '2026-04-16');
});

test('evaluatePartyCreditAndOverdue detects credit limit exceedance and overdue bills', () => {
  const party: PartyMaster = {
    id: 'pty_1',
    code: 'C001',
    name: 'Shree Traders',
    gstin: '23AABCU9603R1ZM',
    pan: 'AABCU9603R',
    stateCode: '23',
    address: 'Indore',
    state: 'Madhya Pradesh',
    phone: '9876543210',
    email: 'a@b.com',
    type: 'CUSTOMER',
    creditLimit: 10000,
    creditDays: 15,
    openingBalance: 0,
    balanceType: 'DR',
  };

  const mockData: Pick<AppData, 'accounts' | 'invoices' | 'vouchers' | 'debitCreditNotes' | 'purchaseInvoices'> = {
    accounts: [],
    vouchers: [],
    debitCreditNotes: [],
    purchaseInvoices: [],
    invoices: [
      {
        id: 'inv_1',
        invoiceNumber: 'INV-001',
        date: '2026-04-01',
        dueDate: '2026-04-16',
        invoiceType: 'TAX_INVOICE',
        partyId: 'pty_1',
        partyName: 'Shree Traders',
        partyGstin: '23AABCU9603R1ZM',
        partyAddress: 'Indore',
        partyState: 'Madhya Pradesh',
        placeOfSupply: 'Madhya Pradesh',
        isInterState: false,
        items: [],
        subtotal: 7000,
        totalDiscount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 7000,
        amountPaid: 1000,
        status: 'PARTIAL',
        isRecurring: false,
      },
    ],
  };

  const evalResult = evaluatePartyCreditAndOverdue(party, mockData, '2026-04-25', 5500);
  assert.ok(evalResult);
  assert.equal(evalResult.outstandingBalance, 6000);
  assert.equal(evalResult.projectedBalance, 11500);
  assert.equal(evalResult.creditLimitExceeded, true);
  assert.equal(evalResult.excessAmount, 1500);
  assert.equal(evalResult.overdueInvoices.length, 1);
  assert.equal(evalResult.overdueInvoices[0].daysOverdue, 9);
  assert.equal(evalResult.totalOverdueAmount, 6000);
});

test('getItemPriceForTier returns Retail, Wholesale, or MRP with fallback', () => {
  const item = {
    salesPrice: 450,
    wholesalePrice: 400,
    mrp: 500,
  };
  assert.equal(getItemPriceForTier(item, 'RETAIL'), 450);
  assert.equal(getItemPriceForTier(item, 'WHOLESALE'), 400);
  assert.equal(getItemPriceForTier(item, 'MRP'), 500);

  // Fallback when wholesalePrice is missing/zero
  assert.equal(getItemPriceForTier({ salesPrice: 450, mrp: 500 }, 'WHOLESALE'), 450);
});

test('resolveNegativeStockPolicy & evaluateCartNegativeStock enforce stock levels', () => {
  assert.equal(resolveNegativeStockPolicy({ negativeStockMode: 'BLOCK' }, { negativeStockMode: 'WARN' }), 'BLOCK');
  assert.equal(resolveNegativeStockPolicy({}, { negativeStockMode: 'ALLOW' }), 'ALLOW');
  assert.equal(resolveNegativeStockPolicy({}, { negativeStockWarning: false }), 'ALLOW');

  const items: ItemMaster[] = [
    {
      id: 'item_1',
      code: 'ITM001',
      name: 'LED Monitor',
      description: '24 inch Monitor',
      category: 'Electronics',
      hsnSacCode: '8528',
      unit: 'PCS',
      purchasePrice: 6000,
      salesPrice: 8000,
      wholesalePrice: 7500,
      mrp: 9000,
      taxRate: 18,
      openingStock: 4,
      currentStock: 4,
      minStockLevel: 2,
      godownStocks: { gdw_main: 4 },
    },
    {
      id: 'item_svc',
      code: 'SVC001',
      name: 'Installation Service',
      description: 'On-site installation',
      category: 'Services',
      hsnSacCode: '9987',
      unit: 'Service',
      purchasePrice: 0,
      salesPrice: 500,
      taxRate: 18,
      openingStock: 0,
      currentStock: 0,
      minStockLevel: 0,
    },
  ];

  const violations = evaluateCartNegativeStock(
    [
      { itemId: 'item_1', quantity: 6 },
      { itemId: 'item_svc', quantity: 10 },
    ],
    items,
    [{ id: 'gdw_main', name: 'Main Godown', code: 'MAIN', godownType: 'MAIN_WAREHOUSE', isDefault: true, isActive: true }],
    'gdw_main'
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0].itemId, 'item_1');
  assert.equal(violations[0].available, 4);
  assert.equal(violations[0].shortfall, 2);
});

test('buildUpiPaymentUri formats exact 2-decimal NPCI URI', () => {
  const uri = buildUpiPaymentUri({
    upiId: 'merchant@okicici',
    payeeName: 'Hisab Veda Store',
    amount: 1250.5,
    note: 'Invoice INV-101',
  });
  assert.equal(
    uri,
    'upi://pay?pa=merchant%40okicici&pn=Hisab%20Veda%20Store&am=1250.50&cu=INR&tn=Invoice%20INV-101'
  );
});
