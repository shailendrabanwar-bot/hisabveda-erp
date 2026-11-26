import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTallyXmlString, TallyImportOptions } from './tallyXmlImporter';
import {
  auditBooksZeroDifference,
  calculateAccountBalances,
  calculateClosingStock,
  getEffectiveAccountCategory,
  getEffectiveOpeningStock,
  getFinancialSummary,
  getSignedLedgerAmount,
  isDirectExpenseLedger,
  isDirectRevenueLedger,
  isNonCurrentLiabilityLedger,
} from './accounting';
import { filterAppDataByFinancialYear } from './fiscalYear';
import { buildPeriodicFinancialBreakdown } from './periodicReports';
import { createDefaultChartOfAccounts } from './storage';
import { initialSampleData } from '../data/sampleData';
import { AppData } from '../types';

/**
 * Minimal Node-compatible XML DOMParser shim covering the exact Element API used by tallyXmlImporter.
 */
class MiniXmlElement {
  tagName: string;
  children: MiniXmlElement[] = [];
  attrs: Map<string, string> = new Map();
  textParts: string[] = [];

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? this.attrs.get(name.toUpperCase()) ?? this.attrs.get(name.toLowerCase()) ?? null;
  }

  get textContent(): string {
    if (this.children.length === 0) return this.textParts.join('');
    let out = this.textParts.join('');
    for (const c of this.children) {
      out += c.textContent;
    }
    return out;
  }

  getElementsByTagName(tag: string): MiniXmlElement[] {
    const upper = tag.toUpperCase();
    const res: MiniXmlElement[] = [];
    const walk = (node: MiniXmlElement) => {
      for (const child of node.children) {
        if (upper === '*' || child.tagName.toUpperCase() === upper) {
          res.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return res;
  }
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function installMiniDomParser() {
  if ((globalThis as any).DOMParser) return;
  (globalThis as any).DOMParser = class {
    parseFromString(xmlStr: string) {
      const cleaned = xmlStr
        .replace(/<\?[\s\S]*?\?>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, inner) =>
          inner.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        );
      const rootWrapper = new MiniXmlElement('__ROOT__');
      const stack: MiniXmlElement[] = [rootWrapper];
      const tagRe = /<\/?([A-Za-z0-9_.:-]+)([^>]*)>/g;
      let lastIdx = 0;
      let match: RegExpExecArray | null;

      while ((match = tagRe.exec(cleaned)) !== null) {
        if (match.index > lastIdx) {
          const textSlice = cleaned.slice(lastIdx, match.index);
          if (textSlice) {
            stack[stack.length - 1].textParts.push(decodeXmlEntities(textSlice));
          }
        }
        lastIdx = tagRe.lastIndex;
        const fullTag = match[0];
        const tagName = match[1];
        const attrRaw = match[2] || '';

        if (fullTag.startsWith('</')) {
          if (stack.length > 1 && stack[stack.length - 1].tagName.toUpperCase() === tagName.toUpperCase()) {
            stack.pop();
          }
          continue;
        }

        const el = new MiniXmlElement(tagName);
        const attrRe = /([A-Za-z0-9_.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let am: RegExpExecArray | null;
        while ((am = attrRe.exec(attrRaw)) !== null) {
          el.attrs.set(am[1], decodeXmlEntities(am[2] ?? am[3] ?? ''));
        }

        stack[stack.length - 1].children.push(el);
        const selfClosing = attrRaw.trimEnd().endsWith('/');
        if (!selfClosing) {
          stack.push(el);
        }
      }

      const documentElement = rootWrapper.children[0] || null;
      return {
        documentElement,
        getElementsByTagName: (tag: string) =>
          documentElement ? documentElement.getElementsByTagName(tag) : [],
      };
    }
  };
}

installMiniDomParser();

const FULL_IMPORT_OPTS: TallyImportOptions = {
  skipDuplicates: true,
  updateCompanyInfo: true,
  includeAccounts: true,
  includeParties: true,
  includeItems: true,
  includeSales: true,
  includePurchases: true,
  includeVouchers: true,
  includeNotes: true,
};

function makeEmptyBaseData(): AppData {
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

function applyResultToAppData(base: AppData, res: ReturnType<typeof parseTallyXmlString>): AppData {
  let accounts = [...base.accounts, ...res.accounts];
  if (res.accountOpeningUpdates && res.accountOpeningUpdates.length > 0) {
    const updMap = new Map(res.accountOpeningUpdates.map((u) => [u.id, u]));
    accounts = accounts.map((a) => {
      const u = updMap.get(a.id);
      return u ? { ...a, openingBalance: u.openingBalance, balanceType: u.balanceType } : a;
    });
  }
  return {
    ...base,
    company: { ...base.company, ...(res.companyInfo || {}) },
    accountGroups: [...(base.accountGroups || []), ...(res.accountGroups || [])],
    accounts,
    parties: [...base.parties, ...res.parties],
    items: [...base.items, ...res.items],
    invoices: [...base.invoices, ...res.invoices],
    purchaseInvoices: [...base.purchaseInvoices, ...res.purchaseInvoices],
    vouchers: [...base.vouchers, ...res.vouchers],
    debitCreditNotes: [...base.debitCreditNotes, ...res.debitCreditNotes],
  };
}

test('preserves exact StockItem Opening/Closing stock value and avoids double-counting vouchers', () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC><STATICVARIABLES><SVCURRENTCOMPANY>Apex Traders</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <STOCKITEM NAME="Premium Widget">
                <NAME>Premium Widget</NAME>
                <BASEUNITS>Pcs</BASEUNITS>
                <OPENINGBALANCE>100 Pcs</OPENINGBALANCE>
                <OPENINGVALUE>-50000.00</OPENINGVALUE>
                <CLOSINGBALANCE>80 Pcs</CLOSINGBALANCE>
                <CLOSINGVALUE>-44000.00</CLOSINGVALUE>
              </STOCKITEM>
              <STOCKITEM NAME="Spare Part">
                <NAME>Spare Part</NAME>
                <BASEUNITS>Nos</BASEUNITS>
                <BATCHALLOCATIONS.LIST>
                  <CLOSINGBALANCE>25 Nos</CLOSINGBALANCE>
                  <CLOSINGVALUE>-12500.50</CLOSINGVALUE>
                </BATCHALLOCATIONS.LIST>
              </STOCKITEM>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const base = makeEmptyBaseData();
  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);
  assert.equal(res.items.length, 2);
  assert.equal(res.items[0].openingStock, 100);
  assert.equal(res.items[0].currentStock, 80);
  assert.equal(res.items[0].closingStockValue, 44000);
  assert.equal(res.items[1].currentStock, 25);
  assert.equal(res.items[1].closingStockValue, 12500.5);

  const updated = applyResultToAppData(base, res);
  assert.equal(getEffectiveOpeningStock(updated), 50000);
  assert.equal(calculateClosingStock(updated), 56500.5);
});

test('imports Sales, Purchase with Freight Inward, Trade Discount, and Contra with balanced Trial Balance Dr === Cr', () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <LEDGER NAME="HDFC Bank">
                <NAME>HDFC Bank</NAME>
                <PARENT>Bank Accounts</PARENT>
                <OPENINGBALANCE>-250000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Capital Account">
                <NAME>Capital Account</NAME>
                <PARENT>Capital Account</PARENT>
                <OPENINGBALANCE>350000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Freight Inward">
                <NAME>Freight Inward</NAME>
                <PARENT>Direct Expenses</PARENT>
              </LEDGER>
              <LEDGER NAME="Discount Allowed">
                <NAME>Discount Allowed</NAME>
                <PARENT>Indirect Expenses</PARENT>
              </LEDGER>
              <STOCKITEM NAME="Steel Coil">
                <NAME>Steel Coil</NAME>
                <BASEUNITS>Kg</BASEUNITS>
                <OPENINGBALANCE>500 Kg</OPENINGBALANCE>
                <OPENINGVALUE>-100000.00</OPENINGVALUE>
                <CLOSINGBALANCE>200 Kg</CLOSINGBALANCE>
                <CLOSINGVALUE>-60000.00</CLOSINGVALUE>
              </STOCKITEM>
              <VOUCHER VCHTYPE="Purchase" ACTION="Create">
                <DATE>20250610</DATE>
                <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
                <VOUCHERNUMBER>PUR-001</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Global Steels</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Global Steels</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>118000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Purchase Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-95000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Freight Inward</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-5000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>CGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-9000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>SGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-9000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
                <DATE>20250715</DATE>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>INV-101</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Metro Infra</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Metro Infra</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>-177000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>150000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>CGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>13500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>SGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>13500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
              <VOUCHER VCHTYPE="Contra" ACTION="Create">
                <DATE>20250720</DATE>
                <VOUCHERTYPENAME>Contra</VOUCHERTYPENAME>
                <VOUCHERNUMBER>CNT-01</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Cash</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-10000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>HDFC Bank</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>10000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
              <VOUCHER VCHTYPE="Delivery Note" ACTION="Create">
                <DATE>20250714</DATE>
                <VOUCHERTYPENAME>Delivery Note</VOUCHERTYPENAME>
                <VOUCHERNUMBER>DN-99</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Metro Infra</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Metro Infra</LEDGERNAME>
                  <AMOUNT>-50000</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <AMOUNT>50000</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const base = makeEmptyBaseData();
  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);
  assert.equal(res.stats.skippedCancelledOrOptional, 1); // Delivery Note skipped
  assert.equal(res.purchaseInvoices.length, 1);
  assert.equal(res.invoices.length, 1);
  assert.equal(res.vouchers.length, 1);

  // Verify Freight Inward captured in purchase extraLedgerLines & base subtotal is 95000
  const pur = res.purchaseInvoices[0];
  assert.equal(pur.subtotal, 95000);
  assert.equal(pur.extraLedgerLines?.length, 1);
  assert.equal(pur.extraLedgerLines?.[0].debit, 5000);
  assert.equal(pur.grandTotal, 118000);

  // Verify Contra lines mapped cleanly without double inversion
  const contra = res.vouchers[0];
  assert.equal(contra.type, 'CONTRA');
  const cashLine = contra.entries.find((e) => e.accountId === 'acc_cash');
  assert.equal(cashLine?.debit, 10000);
  assert.equal(cashLine?.credit, 0);

  const appData = applyResultToAppData(base, res);
  const balances = calculateAccountBalances(appData);

  // Check Trial Balance Equality (Dr === Cr)
  let totalDr = 0;
  let totalCr = 0;
  for (const b of balances.values()) {
    if (b.account.id === 'acc_diff_opening_bal') continue;
    totalDr += b.balanceType === 'DR' ? b.netBalance : 0;
    totalCr += b.balanceType === 'CR' ? b.netBalance : 0;
  }
  assert.equal(Math.round((totalDr - totalCr) * 100) / 100, 0);

  // Check Direct Sales & Direct Expenses (Purchases 95k + Freight Inward 5k = 100k)
  let directRev = 0;
  let directExp = 0;
  for (const b of balances.values()) {
    if (isDirectRevenueLedger(b.account)) {
      directRev += getSignedLedgerAmount(b, b.account.category);
    }
    if (isDirectExpenseLedger(b.account)) {
      directExp += getSignedLedgerAmount(b, b.account.category);
    }
  }
  assert.equal(directRev, 150000);
  assert.equal(directExp, 100000);

  // Opening Stock = 100,000; Closing Stock = 60,000; Profit = (150k + 60k) - (100k + 100k) = 10,000
  const summary = getFinancialSummary(appData);
  assert.equal(summary.netProfit, 10000);

  // FY slicing & Periodic breakdown consistency
  const fyData = filterAppDataByFinancialYear(appData, '2025-04-01');
  assert.equal(fyData.invoices.length, 1);
  assert.equal(fyData.purchaseInvoices.length, 1);
  const periodic = buildPeriodicFinancialBreakdown(fyData, 'MONTHLY');
  const totalPeriodSales = periodic.reduce((s, r) => s + r.salesRevenue, 0);
  assert.equal(totalPeriodSales, 150000);
});

test('DayBook-only export without LEDGER block classifies direct vs indirect ledgers properly', () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <DATA>
          <TALLYMESSAGE>
            <VOUCHER VCHTYPE="Sales Return" ACTION="Create">
              <DATE>20250801</DATE>
              <VOUCHERTYPENAME>Sales Return</VOUCHERTYPENAME>
              <VOUCHERNUMBER>CN-01</VOUCHERNUMBER>
              <PARTYLEDGERNAME>Walkin Buyer</PARTYLEDGERNAME>
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Walkin Buyer</LEDGERNAME>
                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                <AMOUNT>11800.00</AMOUNT>
              </ALLLEDGERENTRIES.LIST>
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>Sales @ 18%</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-10000.00</AMOUNT>
              </ALLLEDGERENTRIES.LIST>
              <ALLLEDGERENTRIES.LIST>
                <LEDGERNAME>IGST</LEDGERNAME>
                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                <AMOUNT>-1800.00</AMOUNT>
              </ALLLEDGERENTRIES.LIST>
            </VOUCHER>
          </TALLYMESSAGE>
        </DATA>
      </BODY>
    </ENVELOPE>
  `;

  const base = makeEmptyBaseData();
  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);
  assert.equal(res.debitCreditNotes.length, 1);
  assert.equal(res.debitCreditNotes[0].type, 'CREDIT_NOTE');
  assert.equal(res.debitCreditNotes[0].subtotal, 10000);
  assert.equal(res.debitCreditNotes[0].igstAmount, 1800);
});

test('inherits HSN & GST rate recursively from parent STOCKGROUP and updates 3-decimal stock from Material Out without financial posting', () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <STOCKGROUP NAME="Electricals">
                <NAME>Electricals</NAME>
                <HSNDETAILS.LIST><HSNCODE>8544</HSNCODE></HSNDETAILS.LIST>
                <GSTDETAILS.LIST>
                  <STATEWISEDETAILS.LIST>
                    <RATEDETAILS.LIST><GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD><GSTRATE>18</GSTRATE></RATEDETAILS.LIST>
                  </STATEWISEDETAILS.LIST>
                </GSTDETAILS.LIST>
              </STOCKGROUP>
              <STOCKGROUP NAME="Copper Cables">
                <NAME>Copper Cables</NAME>
                <PARENT>Electricals</PARENT>
              </STOCKGROUP>
              <STOCKITEM NAME="1.5mm Wire Roll">
                <NAME>1.5mm Wire Roll</NAME>
                <GUID>item-guid-001</GUID>
                <PARENT>Copper Cables</PARENT>
                <BASEUNITS>Mtr</BASEUNITS>
                <OPENINGBALANCE>100.000 Mtr</OPENINGBALANCE>
                <OPENINGVALUE>-5000.00</OPENINGVALUE>
              </STOCKITEM>
              <VOUCHER VCHTYPE="Material Out" ACTION="Create">
                <DATE>20250810</DATE>
                <VOUCHERTYPENAME>Material Out</VOUCHERTYPENAME>
                <VOUCHERNUMBER>MO-001</VOUCHERNUMBER>
                <ALLINVENTORYENTRIES.LIST>
                  <STOCKITEMNAME>1.5mm Wire Roll</STOCKITEMNAME>
                  <ACTUALQTY>12.345 Mtr</ACTUALQTY>
                </ALLINVENTORYENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const base = makeEmptyBaseData();
  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].hsnSacCode, '8544');
  assert.equal(res.items[0].taxRate, 18);
  assert.equal(res.items[0].externalGuid, 'item-guid-001');
  assert.equal(res.items[0].currentStock, 87.655);
  assert.equal(res.invoices.length, 0);
  assert.equal(res.vouchers.length, 0);
  assert.equal(res.stats.skippedCancelledOrOptional, 1);
});

test('matches separate Masters and Transactions XML via GUID and extracts BANKERSDATE, INSTRUMENTNUMBER & EWAYBILLDETAILS', () => {
  const base = makeEmptyBaseData();
  base.accounts.push({
    id: 'acc_sbi_guid',
    code: '1015',
    name: 'SBI Current Account',
    category: 'ASSET',
    subCategory: 'Bank',
    mainGroup: 'Bank Accounts',
    openingBalance: 120000,
    balanceType: 'DR',
    externalGuid: 'guid-sbi-999',
  });
  base.parties.push({
    id: 'party_cust_guid',
    code: 'CUS-901',
    name: 'Shakti Traders',
    type: 'CUSTOMER',
    gstin: '07AAACS1234A1Z5',
    pan: 'AAACS1234A',
    email: '',
    phone: '',
    address: '',
    state: 'Delhi',
    stateCode: '07',
    creditLimit: 0,
    openingBalance: 0,
    balanceType: 'DR',
    externalGuid: 'guid-party-901',
  });

  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <LEDGER NAME="SBI Renamed Main" GUID="guid-sbi-999">
                <NAME>SBI Renamed Main</NAME>
                <GUID>guid-sbi-999</GUID>
                <PARENT>Bank Accounts</PARENT>
                <OPENINGBALANCE>-120000.00</OPENINGBALANCE>
              </LEDGER>
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
                <DATE>20250901</DATE>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>INV-EWB-01</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Shakti Traders</PARTYLEDGERNAME>
                <EWAYBILLDETAILS.LIST>
                  <BILLNUMBER>341009876543</BILLNUMBER>
                  <VEHICLENUMBER>DL01AB1234</VEHICLENUMBER>
                  <TRANSPORTERID>07AAACT1234C1Z2</TRANSPORTERID>
                </EWAYBILLDETAILS.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Shakti Traders</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>-59000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>50000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>CGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>4500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>SGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>4500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
              <VOUCHER VCHTYPE="Receipt" ACTION="Create">
                <DATE>20250902</DATE>
                <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
                <VOUCHERNUMBER>REC-55</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>SBI Current Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-59000.00</AMOUNT>
                  <BANKALLOCATIONS.LIST>
                    <INSTRUMENTNUMBER>UTR88442211</INSTRUMENTNUMBER>
                    <BANKERSDATE>20250904</BANKERSDATE>
                  </BANKALLOCATIONS.LIST>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Shakti Traders</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>59000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);
  assert.equal(res.accounts.length, 0); // Matched existing SBI account via GUID
  assert.equal(res.stats.duplicateAccounts, 1);
  assert.equal(res.invoices.length, 1);
  assert.equal(res.invoices[0].ewayBillNumber, '341009876543');
  assert.equal(res.invoices[0].vehicleNo, 'DL01AB1234');
  assert.equal(res.invoices[0].transporterId, '07AAACT1234C1Z2');

  assert.equal(res.vouchers.length, 1);
  assert.equal(res.vouchers[0].isReconciled, true);
  assert.equal(res.vouchers[0].bankersDate, '2025-09-04');
  assert.equal(res.vouchers[0].instrumentNumber, 'UTR88442211');
});

test('extracts GSTIN from LEDGSTREGDETAILS.LIST, PARTYGSTIN, and CONSIGNEEGSTIN in Masters & Vouchers and attaches to Party + Invoices/Purchases', () => {
  const base = makeEmptyBaseData();
  // Pre-existing party with missing GSTIN (simulating prior Master-only import without GSTIN)
  base.parties.push({
    id: 'pty_existing_nogst',
    code: 'VEND-01',
    name: 'Prime Distributors',
    type: 'VENDOR',
    gstin: '',
    pan: '',
    email: '',
    phone: '',
    address: '',
    state: 'Delhi',
    stateCode: '07',
    creditLimit: 0,
    openingBalance: 0,
    balanceType: 'CR',
    gstCategory: 'UNREGISTERED',
  });

  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <!-- Tally Prime 3.x Master Ledger with nested LEDGSTREGDETAILS.LIST -->
              <LEDGER NAME="Sunrise Retail Co">
                <NAME>Sunrise Retail Co</NAME>
                <PARENT>Sundry Debtors</PARENT>
                <LEDGSTREGDETAILS.LIST>
                  <APPLICABLEFROM>20250401</APPLICABLEFROM>
                  <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
                  <STATENAME>Maharashtra</STATENAME>
                  <GSTIN>27AABCS5678K1Z2</GSTIN>
                </LEDGSTREGDETAILS.LIST>
              </LEDGER>

              <!-- Sales voucher referencing Sunrise Retail Co without repeating PARTYGSTIN -->
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
                <DATE>20251005</DATE>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>INV-B2B-01</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Sunrise Retail Co</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sunrise Retail Co</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>-11800.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>10000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>IGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>1800.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>

              <!-- Voucher with CONSIGNEEGSTIN only for pre-existing party lacking GSTIN -->
              <VOUCHER VCHTYPE="Purchase" ACTION="Create">
                <DATE>20251008</DATE>
                <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
                <VOUCHERNUMBER>PB-B2B-02</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Prime Distributors</PARTYLEDGERNAME>
                <CONSIGNEEGSTIN>24AABCP9988L1Z9</CONSIGNEEGSTIN>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Prime Distributors</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>23600.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Purchase Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-20000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>IGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-3600.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>

              <!-- Voucher with nested LEDGSTREGDETAILS.LIST GSTIN for new cash/credit buyer -->
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
                <DATE>20251010</DATE>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>INV-B2B-03</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Apex Electronics</PARTYLEDGERNAME>
                <LEDGSTREGDETAILS.LIST>
                  <GSTREGISTRATIONTYPE>Regular</GSTREGISTRATIONTYPE>
                  <GSTIN>07AABCA4455M1Z4</GSTIN>
                </LEDGSTREGDETAILS.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Apex Electronics</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>-5900.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>5000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>CGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>450.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>SGST</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>450.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);

  const sunrise = res.parties.find((p) => p.name === 'Sunrise Retail Co')!;
  assert.ok(sunrise);
  assert.equal(sunrise.gstin, '27AABCS5678K1Z2');
  assert.equal(sunrise.gstCategory, 'REGULAR');
  assert.equal(sunrise.state, 'Maharashtra');

  const apex = res.parties.find((p) => p.name === 'Apex Electronics')!;
  assert.ok(apex);
  assert.equal(apex.gstin, '07AABCA4455M1Z4');
  assert.equal(apex.gstCategory, 'REGULAR');

  // Existing party Prime Distributors received partyUpdate with CONSIGNEEGSTIN
  assert.ok(res.partyUpdates && res.partyUpdates.length === 1);
  assert.equal(res.partyUpdates[0].partyId, 'pty_existing_nogst');
  assert.equal(res.partyUpdates[0].gstin, '24AABCP9988L1Z9');
  assert.equal(res.partyUpdates[0].gstCategory, 'REGULAR');
  assert.equal(res.partyUpdates[0].state, 'Gujarat');

  // Attached onto every Sales & Purchase invoice
  const inv1 = res.invoices.find((i) => i.invoiceNumber === 'INV-B2B-01')!;
  assert.equal(inv1.partyGstin, '27AABCS5678K1Z2');
  assert.equal(inv1.partyGstCategory, 'REGULAR');

  const inv3 = res.invoices.find((i) => i.invoiceNumber === 'INV-B2B-03')!;
  assert.equal(inv3.partyGstin, '07AABCA4455M1Z4');
  assert.equal(inv3.partyGstCategory, 'REGULAR');

  const pur2 = res.purchaseInvoices.find((p) => p.billNumber === 'PB-B2B-02')!;
  assert.equal(pur2.partyGstin, '24AABCP9988L1Z9');
  assert.equal(pur2.partyState, 'Gujarat');
});

test('recursively resolves nested Tally sub-groups, reconciles balanced Opening Balances (Debtors/Creditors/P&L/OD/Stock), and aggregates all voucher series with zero Suspense & zero diff', () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC><STATICVARIABLES><SVCURRENTCOMPANY>Inferno Fire Protection System</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <!-- Nested Custom Sub-Groups -->
              <GROUP NAME="Administrative Expenses">
                <NAME>Administrative Expenses</NAME>
                <PARENT>Indirect Expenses</PARENT>
              </GROUP>
              <GROUP NAME="Office Utilities">
                <NAME>Office Utilities</NAME>
                <PARENT>Administrative Expenses</PARENT>
              </GROUP>
              <GROUP NAME="Financial Expenses">
                <NAME>Financial Expenses</NAME>
                <PARENT>Primary</PARENT>
                <NATUREOFGROUP>Expenses</NATUREOFGROUP>
                <AFFECTSGROSSPROFIT>No</AFFECTSGROSSPROFIT>
              </GROUP>
              <GROUP NAME="Other Operating Income">
                <NAME>Other Operating Income</NAME>
                <PARENT>Indirect Incomes</PARENT>
              </GROUP>
              <GROUP NAME="Short Term OD">
                <NAME>Short Term OD</NAME>
                <PARENT>Bank OD A/c</PARENT>
              </GROUP>

              <!-- Ledgers with balanced Opening Balances:
                   DR: Cash 10,000 + Debtor A 40,000 + Stock 50,000 = 1,00,000
                   CR: Capital 30,000 + Profit & Loss A/c 25,000 + Unsecured Loan 15,000 + Bank OD 10,000 + Creditor X 20,000 = 1,00,000 -->
              <LEDGER NAME="Cash">
                <NAME>Cash</NAME>
                <PARENT>Cash-in-Hand</PARENT>
                <OPENINGBALANCE>-10000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Debtor A">
                <NAME>Debtor A</NAME>
                <PARENT>Sundry Debtors</PARENT>
                <OPENINGBALANCE>-40000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Stock-in-Hand">
                <NAME>Stock-in-Hand</NAME>
                <PARENT>Stock-in-Hand</PARENT>
                <OPENINGBALANCE>-50000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Proprietor Capital">
                <NAME>Proprietor Capital</NAME>
                <PARENT>Capital Account</PARENT>
                <OPENINGBALANCE>30000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Profit &amp; Loss A/c">
                <NAME>Profit &amp; Loss A/c</NAME>
                <PARENT>Primary</PARENT>
                <OPENINGBALANCE>25000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Director Unsecured Loan">
                <NAME>Director Unsecured Loan</NAME>
                <PARENT>Unsecured Loans</PARENT>
                <OPENINGBALANCE>15000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="HDFC OD A/c">
                <NAME>HDFC OD A/c</NAME>
                <PARENT>Short Term OD</PARENT>
                <OPENINGBALANCE>10000.00</OPENINGBALANCE>
              </LEDGER>
              <LEDGER NAME="Creditor X">
                <NAME>Creditor X</NAME>
                <PARENT>Sundry Creditors</PARENT>
                <OPENINGBALANCE>20000.00</OPENINGBALANCE>
              </LEDGER>

              <!-- Expense & Income ledgers mapped to nested custom groups -->
              <LEDGER NAME="Office Electricity">
                <NAME>Office Electricity</NAME>
                <PARENT>Office Utilities</PARENT>
              </LEDGER>
              <LEDGER NAME="Bank Charges">
                <NAME>Bank Charges</NAME>
                <PARENT>Financial Expenses</PARENT>
              </LEDGER>
              <LEDGER NAME="Scrap &amp; Misc Income">
                <NAME>Scrap &amp; Misc Income</NAME>
                <PARENT>Other Operating Income</PARENT>
              </LEDGER>

              <!-- Stock Item with Opening & Closing (30k) -->
              <STOCKITEM NAME="Fire Extinguisher">
                <NAME>Fire Extinguisher</NAME>
                <BASEUNITS>Pcs</BASEUNITS>
                <OPENINGBALANCE>100 Pcs</OPENINGBALANCE>
                <OPENINGVALUE>-50000.00</OPENINGVALUE>
                <CLOSINGBALANCE>60 Pcs</CLOSINGBALANCE>
                <CLOSINGVALUE>-30000.00</CLOSINGVALUE>
              </STOCKITEM>

              <!-- Voucher 1: Custom Sales Invoice Series on same date/number with GUID -->
              <VOUCHER VCHTYPE="Tax Invoice - Branch" ACTION="Create">
                <GUID>vch-guid-1</GUID>
                <DATE>20250601</DATE>
                <VOUCHERTYPENAME>Tax Invoice - Branch</VOUCHERTYPENAME>
                <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                <VOUCHERNUMBER>001</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Debtor A</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Debtor A</LEDGERNAME>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>-59000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <AMOUNT>50000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>IGST</LEDGERNAME>
                  <AMOUNT>9000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>

              <!-- Voucher 2: Cash Sale on SAME date & SAME voucher number 001 but different series & GUID -->
              <VOUCHER VCHTYPE="Cash Sales" ACTION="Create">
                <GUID>vch-guid-2</GUID>
                <DATE>20250601</DATE>
                <VOUCHERTYPENAME>Cash Sales</VOUCHERTYPENAME>
                <ISINVOICE>Yes</ISINVOICE>
                <VOUCHERNUMBER>001</VOUCHERNUMBER>
                <PARTYLEDGERNAME>Cash</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Cash</LEDGERNAME>
                  <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                  <AMOUNT>-11800.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Sales Account</LEDGERNAME>
                  <AMOUNT>10000.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>IGST</LEDGERNAME>
                  <AMOUNT>1800.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>

              <!-- Voucher 3: Journal Voucher posting Indirect Expenses & Indirect Income -->
              <VOUCHER VCHTYPE="Journal" ACTION="Create">
                <GUID>vch-guid-3</GUID>
                <DATE>20250605</DATE>
                <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
                <VOUCHERNUMBER>JV-01</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Office Electricity</LEDGERNAME>
                  <AMOUNT>-4500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Creditor X</LEDGERNAME>
                  <AMOUNT>4500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>

              <!-- Voucher 4: Payment Voucher for Bank Charges paid from Cash -->
              <VOUCHER VCHTYPE="Payment" ACTION="Create">
                <GUID>vch-guid-4</GUID>
                <DATE>20250606</DATE>
                <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
                <VOUCHERNUMBER>PMT-01</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Bank Charges</LEDGERNAME>
                  <AMOUNT>-500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Cash</LEDGERNAME>
                  <AMOUNT>500.00</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>

              <!-- Voucher 5: Receipt Voucher for Scrap & Misc Income -->
              <VOUCHER VCHTYPE="Receipt" ACTION="Create">
                <GUID>vch-guid-5</GUID>
                <DATE>20250607</DATE>
                <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
                <VOUCHERNUMBER>REC-01</VOUCHERNUMBER>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Cash</LEDGERNAME>
                  <AMOUNT>-1418.62</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Scrap &amp; Misc Income</LEDGERNAME>
                  <AMOUNT>1418.62</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const base = makeEmptyBaseData();
  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.success, true);
  assert.equal(res.invoices.length, 2); // Both Branch Tax Invoice #001 & Cash Sales #001 preserved!
  assert.equal(res.vouchers.length, 3); // Journal + Payment + Receipt
  const cashSaleInv = res.invoices.find((i) => i.invoiceNumber === '001' && i.status === 'PAID');
  assert.ok(cashSaleInv);
  assert.equal(cashSaleInv.paymentMode, 'CASH');
  assert.equal(cashSaleInv.paymentAccountId, 'acc_cash');

  const appData = applyResultToAppData(base, res);
  const audit = auditBooksZeroDifference(appData);
  assert.equal(audit.openingDiff, 0);
  assert.equal(audit.trialBalanceDiff, 0);
  assert.equal(audit.balanceSheetDiff, 0);
  assert.equal(audit.suspenseBalance, 0);

  // Verify nested group resolution
  const elecAcc = appData.accounts.find((a) => a.name === 'Office Electricity')!;
  const bankChgAcc = appData.accounts.find((a) => a.name === 'Bank Charges')!;
  const miscIncAcc = appData.accounts.find((a) => a.name === 'Scrap & Misc Income')!;
  const odAcc = appData.accounts.find((a) => a.name === 'HDFC OD A/c')!;
  assert.equal(getEffectiveAccountCategory(elecAcc, appData.accountGroups), 'EXPENSE');
  assert.equal(isDirectExpenseLedger(elecAcc, appData.accountGroups), false);
  assert.equal(getEffectiveAccountCategory(bankChgAcc, appData.accountGroups), 'EXPENSE');
  assert.equal(isDirectExpenseLedger(bankChgAcc, appData.accountGroups), false);
  assert.equal(getEffectiveAccountCategory(miscIncAcc, appData.accountGroups), 'REVENUE');
  assert.equal(isDirectRevenueLedger(miscIncAcc, appData.accountGroups), false);
  assert.equal(isNonCurrentLiabilityLedger(odAcc, appData.accountGroups), true);

  // Sales = 50k + 10k = 60,000; Closing Stock = 30k; Opening Stock = 50k -> Gross Profit = 40,000
  // Indirect Income = 1,418.62; Indirect Expenses = 4,500 + 500 = 5,000 -> Net Profit = 36,418.62
  const summary = getFinancialSummary(appData);
  assert.equal(summary.totalSales, 60000);
  assert.equal(Math.round(summary.netProfit * 100) / 100, 36418.62);
});

test('preserves negative/credit Tally Closing Stock and applies live Manual Closing Stock override with Zero BS Difference', () => {
  const xml = `
    <ENVELOPE>
      <BODY>
        <IMPORTDATA>
          <REQUESTDATA>
            <TALLYMESSAGE>
              <STOCKITEM NAME="Over-Issued Wire">
                <NAME>Over-Issued Wire</NAME>
                <BASEUNITS>Mtr</BASEUNITS>
                <CLOSINGBALANCE>(-)10 Mtr</CLOSINGBALANCE>
                <CLOSINGVALUE>2500.00</CLOSINGVALUE>
              </STOCKITEM>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>
  `;

  const base = makeEmptyBaseData();
  base.accounts = base.accounts.map((a) =>
    a.id === 'acc_capital' ? { ...a, openingBalance: 10000, balanceType: 'CR' } :
    a.id === 'acc_cash' ? { ...a, openingBalance: 10000, balanceType: 'DR' } : a
  );
  const res = parseTallyXmlString(xml, base, FULL_IMPORT_OPTS);
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].currentStock, -10);
  assert.equal(res.items[0].closingStockValue, -2500);

  const appData = applyResultToAppData(base, res);
  assert.equal(calculateClosingStock(appData), -2500);
  assert.equal(auditBooksZeroDifference(appData).balanceSheetDiff, 0);

  // Manual Closing Stock Override updates Closing Stock, Net Profit, and Balance Sheet seamlessly
  const manualData: AppData = {
    ...appData,
    company: {
      ...appData.company,
      closingStockValuationMode: 'MANUAL',
      manualClosingStock: 75000,
    },
  };
  assert.equal(calculateClosingStock(manualData), 75000);
  assert.equal(getFinancialSummary(manualData).netProfit, 75000);
  const manualAudit = auditBooksZeroDifference(manualData);
  assert.equal(manualAudit.balanceSheetAssets, 85000);
  assert.equal(manualAudit.balanceSheetLiabilitiesAndEquity, 85000);
  assert.equal(manualAudit.balanceSheetDiff, 0);
});

