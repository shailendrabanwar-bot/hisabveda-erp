import test from 'node:test';
import assert from 'node:assert/strict';
import {
  auditBooksZeroDifference,
  calculatePartyOutstanding,
  getFinancialSummary,
} from './accounting';
import {
  resolveIsInterStateSupply,
  resolveOfficialStateCode,
} from './gstAuditEngine';
import { buildGSTR1PortalJsonPayload } from './exportHelpers';
import { validateInvoicesForEWayBill } from './ewayBill';
import { createDefaultChartOfAccounts } from './storage';
import { initialSampleData } from '../data/sampleData';
import { AppData, DebitCreditNote, PartyMaster, SalesInvoice } from '../types';

function makeCleanErpData(): AppData {
  return {
    ...initialSampleData,
    company: {
      ...initialSampleData.company,
      gstin: '23AOZPD9829B1ZP',
      state: 'Madhya Pradesh',
      stateCode: '23',
      financialYearStart: '2026-04-01',
      booksBeginningFrom: '2026-04-01',
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

test('calculatePartyOutstanding matches vouchers & notes by partyId and skips optional/cancelled vouchers', () => {
  const data = makeCleanErpData();
  const party: PartyMaster = {
    id: 'pty_renamed_1',
    code: 'CUS-101',
    name: 'Apollo Industries Pvt Ltd',
    type: 'CUSTOMER',
    gstin: '23AAAAA0000A1Z5',
    pan: 'AAAAA0000A',
    email: '',
    phone: '',
    address: '',
    state: 'Madhya Pradesh',
    stateCode: '23',
    creditLimit: 0,
    openingBalance: 0,
    balanceType: 'DR',
  };
  data.parties = [party];
  data.invoices = [
    {
      id: 'inv_1',
      invoiceNumber: 'INV/26-27/001',
      date: '2026-05-10',
      dueDate: '2026-05-25',
      invoiceType: 'TAX_INVOICE',
      partyId: party.id,
      partyName: 'Old Party Name Ltd',
      partyGstin: party.gstin,
      partyAddress: '',
      partyState: 'Madhya Pradesh',
      placeOfSupply: 'Madhya Pradesh',
      isInterState: false,
      items: [],
      subtotal: 10000,
      totalDiscount: 0,
      cgstAmount: 900,
      sgstAmount: 900,
      igstAmount: 0,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 11800,
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];
  data.vouchers = [
    {
      id: 'vch_rcpt_1',
      voucherNumber: 'REC/26-27/001',
      type: 'RECEIPT',
      date: '2026-05-12',
      partyId: party.id,
      partyName: 'Old Party Name Ltd',
      entries: [
        { id: 'e1', accountId: 'acc_bank', accountName: 'Bank', accountCode: '1020', debit: 5000, credit: 0 },
        { id: 'e2', accountId: 'acc_debtors', accountName: 'Debtors', accountCode: '1100', debit: 0, credit: 5000 },
      ],
      totalAmount: 5000,
      narration: 'Part payment',
    },
    {
      id: 'vch_opt_1',
      voucherNumber: 'REC/26-27/002',
      type: 'RECEIPT',
      date: '2026-05-13',
      partyId: party.id,
      partyName: 'Apollo Industries Pvt Ltd',
      isOptional: true,
      entries: [],
      totalAmount: 3000,
      narration: 'Optional draft receipt (must be ignored)',
    } as AppData['vouchers'][number],
  ];
  data.debitCreditNotes = [
    {
      id: 'cn_1',
      noteNumber: 'CN/26-27/001',
      type: 'CREDIT_NOTE',
      date: '2026-05-15',
      partyId: party.id,
      partyName: 'Old Party Name Ltd',
      partyGstin: party.gstin,
      reason: 'Discount',
      items: [],
      subtotal: 1000,
      cgstAmount: 90,
      sgstAmount: 90,
      igstAmount: 0,
      totalTax: 180,
      grandTotal: 1180,
    },
  ];

  const out = calculatePartyOutstanding(party, data);
  // 11800 invoice - 5000 receipt - 1180 credit note = 5620 (optional 3000 skipped)
  assert.equal(out.netBalance, 5620);
  assert.equal(out.balanceType, 'DR');
  assert.equal(out.totalPaid, 5000);
});

test('auditBooksZeroDifference and getFinancialSummary include Cess accurately on notes & invoices', () => {
  const data = makeCleanErpData();
  const noteWithCess: DebitCreditNote = {
    id: 'cn_cess_1',
    noteNumber: 'CN/26-27/009',
    type: 'CREDIT_NOTE',
    date: '2026-06-01',
    partyId: 'p_1',
    partyName: 'Buyer A',
    partyGstin: '23BBBBB1111B1Z5',
    reason: 'Rate revision',
    items: [],
    subtotal: 10000,
    totalDiscount: 0,
    cgstAmount: 1400,
    sgstAmount: 1400,
    igstAmount: 0,
    cessAmount: 1200,
    totalTax: 2800,
    roundOff: 0,
    grandTotal: 14000,
  };
  data.debitCreditNotes = [noteWithCess];

  const audit = auditBooksZeroDifference(data);
  assert.equal(audit.isZeroDifference, true, `Expected zero diff, got issues: ${audit.issues.join('; ')}`);
  assert.equal(audit.unbalancedNotesCount, 0);

  // Also test getFinancialSummary includes acc_gst_cess liability & acc_itc_cess asset
  const invData = makeCleanErpData();
  invData.invoices = [
    {
      id: 'inv_cess_1',
      invoiceNumber: 'INV/26-27/099',
      date: '2026-06-02',
      dueDate: '2026-06-17',
      invoiceType: 'TAX_INVOICE',
      partyId: 'p_1',
      partyName: 'Buyer A',
      partyGstin: '23BBBBB1111B1Z5',
      partyAddress: '',
      partyState: 'Madhya Pradesh',
      placeOfSupply: 'Madhya Pradesh',
      isInterState: false,
      items: [],
      subtotal: 10000,
      totalDiscount: 0,
      cgstAmount: 1400,
      sgstAmount: 1400,
      igstAmount: 0,
      cessAmount: 1200,
      totalTax: 2800,
      roundOff: 0,
      grandTotal: 14000,
      amountPaid: 0,
      status: 'UNPAID',
    },
  ];
  const summary = getFinancialSummary(invData);
  assert.equal(summary.totalTaxPayable, 4000);
});

test('resolveIsInterStateSupply and resolveOfficialStateCode handle GSTIN prefixes, POS, and state aliases', () => {
  assert.equal(resolveOfficialStateCode({ placeOfSupply: '07-New Delhi' }), '07');
  assert.equal(resolveOfficialStateCode({ stateName: 'Orissa' }), '21');

  // Empty party state falls back to GSTIN prefix 23 == company 23 -> intra-state (false)
  assert.equal(
    resolveIsInterStateSupply({
      companyGstin: '23AOZPD9829B1ZP',
      companyState: 'Madhya Pradesh',
      partyGstin: '23BBBBB1111B1Z5',
      partyState: '',
    }),
    false
  );

  // Party in Maharashtra (27) vs MP company (23) -> inter-state (true)
  assert.equal(
    resolveIsInterStateSupply({
      companyGstin: '23AOZPD9829B1ZP',
      companyState: 'Madhya Pradesh',
      partyGstin: '27BBBBB1111B1Z5',
      partyState: 'Maharashtra',
    }),
    true
  );

  // Alias 'New Delhi' matches company stateCode '07' -> intra-state (false)
  assert.equal(
    resolveIsInterStateSupply({
      companyState: 'Delhi',
      companyStateCode: '07',
      partyState: 'New Delhi',
    }),
    false
  );

  // Explicit Place of Supply overrides billing state
  assert.equal(
    resolveIsInterStateSupply({
      companyGstin: '23AOZPD9829B1ZP',
      companyState: 'Madhya Pradesh',
      partyGstin: '23BBBBB1111B1Z5',
      partyState: 'Madhya Pradesh',
      placeOfSupply: 'Maharashtra',
    }),
    true
  );
});

test('buildGSTR1PortalJsonPayload populates CDNR, CDNUR, B2CL, EXP, POS, and Cess amounts', () => {
  const company = {
    ...initialSampleData.company,
    gstin: '23AOZPD9829B1ZP',
    state: 'Madhya Pradesh',
    stateCode: '23',
  };
  const b2bParty: PartyMaster = {
    id: 'p_b2b',
    code: 'C1',
    name: 'West Coast Fire Ltd',
    type: 'CUSTOMER',
    gstin: '27AACCT1234D1Z5',
    pan: 'AACCT1234D',
    email: '',
    phone: '',
    address: '',
    state: 'Maharashtra',
    stateCode: '27',
    creditLimit: 0,
    openingBalance: 0,
    balanceType: 'DR',
    gstCategory: 'REGULAR',
  };
  const unregInterParty: PartyMaster = {
    id: 'p_unreg',
    code: 'C2',
    name: 'Delhi Walkin Bulk',
    type: 'CUSTOMER',
    gstin: '',
    pan: '',
    email: '',
    phone: '',
    address: '',
    state: 'Delhi',
    stateCode: '07',
    creditLimit: 0,
    openingBalance: 0,
    balanceType: 'DR',
    gstCategory: 'UNREGISTERED',
  };

  const invoices: SalesInvoice[] = [
    {
      id: 'inv_b2b',
      invoiceNumber: 'INV/001',
      date: '2026-06-10',
      dueDate: '2026-06-25',
      invoiceType: 'TAX_INVOICE',
      partyId: b2bParty.id,
      partyName: b2bParty.name,
      partyGstin: b2bParty.gstin,
      partyAddress: '',
      partyState: 'Maharashtra',
      placeOfSupply: 'Maharashtra',
      isInterState: true,
      items: [
        {
          id: 'l1',
          itemId: 'i1',
          itemName: 'Luxury Valve',
          hsnSacCode: '8481',
          quantity: 1,
          unit: 'NOS',
          rate: 10000,
          discountPercent: 0,
          taxRate: 28,
          taxAmount: 2800,
          cessPercent: 12,
          cessAmount: 1200,
          totalAmount: 14000,
        },
      ],
      subtotal: 10000,
      totalDiscount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 2800,
      cessAmount: 1200,
      totalTax: 2800,
      roundOff: 0,
      grandTotal: 14000,
      amountPaid: 0,
      status: 'UNPAID',
    },
    {
      id: 'inv_b2cl',
      invoiceNumber: 'INV/002',
      date: '2026-06-11',
      dueDate: '2026-06-26',
      invoiceType: 'TAX_INVOICE',
      partyId: unregInterParty.id,
      partyName: unregInterParty.name,
      partyGstin: '',
      partyAddress: '',
      partyState: 'Delhi',
      placeOfSupply: 'Delhi',
      isInterState: true,
      items: [
        {
          id: 'l2',
          itemId: 'i2',
          itemName: 'Hydrant System',
          hsnSacCode: '8424',
          quantity: 1,
          unit: 'SET',
          rate: 300000,
          discountPercent: 0,
          taxRate: 18,
          taxAmount: 54000,
          cessAmount: 0,
          totalAmount: 354000,
        },
      ],
      subtotal: 300000,
      totalDiscount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 54000,
      cessAmount: 0,
      totalTax: 54000,
      roundOff: 0,
      grandTotal: 354000,
      amountPaid: 0,
      status: 'UNPAID',
    },
    {
      id: 'inv_b2cs',
      invoiceNumber: 'INV/003',
      date: '2026-06-12',
      dueDate: '2026-06-12',
      invoiceType: 'RETAIL_BILL',
      partyId: unregInterParty.id,
      partyName: unregInterParty.name,
      partyGstin: '',
      partyAddress: '',
      partyState: 'Delhi',
      placeOfSupply: 'Delhi',
      isInterState: true,
      items: [
        {
          id: 'l3',
          itemId: 'i3',
          itemName: 'Nozzle',
          hsnSacCode: '8424',
          quantity: 2,
          unit: 'NOS',
          rate: 5000,
          discountPercent: 0,
          taxRate: 18,
          taxAmount: 1800,
          cessAmount: 500,
          totalAmount: 12300,
        },
      ],
      subtotal: 10000,
      totalDiscount: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 1800,
      cessAmount: 500,
      totalTax: 1800,
      roundOff: 0,
      grandTotal: 12300,
      amountPaid: 12300,
      status: 'PAID',
    },
  ];

  const notes: DebitCreditNote[] = [
    {
      id: 'cn_b2b',
      noteNumber: 'CN/001',
      type: 'CREDIT_NOTE',
      date: '2026-06-15',
      partyId: b2bParty.id,
      partyName: b2bParty.name,
      partyGstin: b2bParty.gstin,
      reason: 'Damaged goods return',
      items: [
        {
          id: 'nl1',
          itemId: 'i1',
          itemName: 'Luxury Valve',
          hsnSacCode: '8481',
          quantity: 1,
          unit: 'NOS',
          rate: 2000,
          discountPercent: 0,
          taxRate: 28,
          taxAmount: 560,
          cessAmount: 240,
          totalAmount: 2800,
        },
      ],
      subtotal: 2000,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 560,
      cessAmount: 240,
      totalTax: 560,
      grandTotal: 2800,
    },
  ];

  const payload = buildGSTR1PortalJsonPayload(invoices, company, [b2bParty, unregInterParty], notes);
  assert.equal(payload.b2b.length, 1);
  assert.equal(payload.b2b[0].inv[0].itms[0].itm_det.csamt, 1200);
  assert.equal(payload.b2cl.length, 1);
  assert.equal(payload.b2cl[0].pos, '07');
  assert.equal(payload.b2cs.length, 1);
  assert.equal(payload.b2cs[0].pos, '07');
  assert.equal(payload.b2cs[0].csamt, 500);
  assert.equal(payload.cdnr.length, 1);
  assert.equal(payload.cdnr[0].nt[0].nt_num, 'CN/001');
  assert.equal(payload.cdnr[0].nt[0].itms[0].itm_det.csamt, 240);
  assert.equal(payload.hsn.hsn_b2b[0].csamt, 1200);
});

test('validateInvoicesForEWayBill enforces mandatory Part-B transport strictly above ₹50,000', () => {
  const baseCompany = { ...initialSampleData.company, gstin: '23AOZPD9829B1ZP' };
  const exact50k: SalesInvoice = {
    id: 'inv_50k',
    invoiceNumber: 'INV-50K',
    date: '2026-06-01',
    dueDate: '2026-06-15',
    invoiceType: 'TAX_INVOICE',
    partyId: 'p1',
    partyName: 'Customer One',
    partyGstin: '23BBBBB1111B1Z5',
    partyAddress: '',
    partyState: 'Madhya Pradesh',
    placeOfSupply: 'Madhya Pradesh',
    isInterState: false,
    items: [],
    subtotal: 50000,
    totalDiscount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    totalTax: 0,
    roundOff: 0,
    grandTotal: 50000,
    amountPaid: 0,
    status: 'UNPAID',
  };
  const over50k = { ...exact50k, id: 'inv_50001', invoiceNumber: 'INV-50001', grandTotal: 50001 };

  const issues50k = validateInvoicesForEWayBill([exact50k], baseCompany);
  const transport50k = issues50k.find((i) => i.field === 'transport');
  assert.equal(transport50k?.severity, 'warning');

  const issuesOver50k = validateInvoicesForEWayBill([over50k], baseCompany);
  const transportOver50k = issuesOver50k.find((i) => i.field === 'transport');
  assert.equal(transportOver50k?.severity, 'error');
});
