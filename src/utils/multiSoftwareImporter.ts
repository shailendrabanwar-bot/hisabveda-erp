import * as XLSX from 'xlsx';
import {
  Account,
  AccountCategory,
  AppData,
  InvoiceItem,
  ItemMaster,
  PartyMaster,
  PartyType,
  PurchaseInvoice,
  SalesInvoice,
  Voucher,
  VoucherType,
} from '../types';
import { INDIAN_STATE_CODES } from './gstin';
import { normalizeDateISO } from './fiscalYear';

export type ExternalSoftwarePreset =
  | 'AUTO'
  | 'VYAPAR'
  | 'BUSY'
  | 'MARG'
  | 'ZOHO_BOOKS'
  | 'QUICKBOOKS'
  | 'EXCEL_CSV';

export type ExternalImportEntityType =
  | 'PARTIES'
  | 'ITEMS'
  | 'ACCOUNTS'
  | 'SALES'
  | 'PURCHASES'
  | 'VOUCHERS';

export interface ExternalFieldDef {
  key: string;
  labelEn: string;
  labelHi: string;
  required?: boolean;
  aliases: string[];
}

export interface ExternalWorkbookData {
  fileName: string;
  sheetNames: string[];
  sheets: Record<string, { headers: string[]; rows: Record<string, string>[] }>;
}

export interface ExternalItemStockUpdate {
  itemId: string;
  qtyDelta: number;
  purchasePrice?: number;
  salesPrice?: number;
}

export interface ExternalParsedResult {
  success: boolean;
  error?: string;
  warnings: string[];
  parties: PartyMaster[];
  items: ItemMaster[];
  accounts: Account[];
  invoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  vouchers: Voucher[];
  itemStockUpdates?: ExternalItemStockUpdate[];
  skippedDuplicates: number;
  minDate?: string;
  maxDate?: string;
}

export interface ExternalImportCommitPayload {
  software: ExternalSoftwarePreset;
  entityType: ExternalImportEntityType;
  fileName: string;
  parties: PartyMaster[];
  items: ItemMaster[];
  accounts: Account[];
  invoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  vouchers: Voucher[];
  itemStockUpdates?: ExternalItemStockUpdate[];
  minDate?: string;
  maxDate?: string;
}

export interface ExternalLastImportBatch {
  fileName: string;
  software: string;
  importedAt: string;
  accountIds: string[];
  partyIds: string[];
  itemIds: string[];
  invoiceIds: string[];
  purchaseIds: string[];
  voucherIds: string[];
}

export const SOFTWARE_PRESETS: Array<{
  id: ExternalSoftwarePreset;
  name: string;
  taglineEn: string;
  taglineHi: string;
}> = [
  {
    id: 'AUTO',
    name: 'Auto-Detect (Any Software)',
    taglineEn: 'Smart automatic column detection from any Excel / CSV / JSON file',
    taglineHi: 'किसी भी Excel / CSV / JSON फ़ाइल से कॉलम की स्वतः पहचान',
  },
  {
    id: 'VYAPAR',
    name: 'Vyapar App',
    taglineEn: 'Vyapar Item Report, Party Report, Sale & Purchase Excel/CSV exports',
    taglineHi: 'Vyapar से निकली Party, Item, Sale व Purchase Excel/CSV रिपोर्ट',
  },
  {
    id: 'BUSY',
    name: 'Busy Accounting',
    taglineEn: 'Busy Account Master, Item Master, Bill Registers & Vouchers',
    taglineHi: 'Busy सॉफ़्टवेयर की Master, Sales/Purchase Register व Voucher शीट',
  },
  {
    id: 'MARG',
    name: 'Marg ERP 9+',
    taglineEn: 'Marg ERP Ledgers, Stock Master & GST Invoice Excel exports',
    taglineHi: 'Marg ERP के लेज़र, स्टॉक आइटम और बिल रजिस्टर एक्सपोर्ट',
  },
  {
    id: 'ZOHO_BOOKS',
    name: 'Zoho Books',
    taglineEn: 'Zoho Books Customers, Vendors, Items, Invoices & Bills CSV/XLSX',
    taglineHi: 'Zoho Books से एक्सपोर्ट की गई Contacts, Items, Invoices व Bills फ़ाइल',
  },
  {
    id: 'QUICKBOOKS',
    name: 'QuickBooks',
    taglineEn: 'QuickBooks Online / Desktop Lists, Sales, Expenses & Journal CSV/XLSX',
    taglineHi: 'QuickBooks से एक्सपोर्ट किए गए Customer, Vendor, Product व Journal डेटा',
  },
  {
    id: 'EXCEL_CSV',
    name: 'Custom Excel / CSV / JSON',
    taglineEn: 'Import your own spreadsheet or download ready-made Excel templates',
    taglineHi: 'अपनी कस्टम Excel/CSV शीट या हमारे सैंपल टेम्पलेट से डेटा अपलोड करें',
  },
];

export const ENTITY_FIELD_DEFS: Record<ExternalImportEntityType, ExternalFieldDef[]> = {
  PARTIES: [
    { key: 'name', labelEn: 'Party / Ledger Name', labelHi: 'पार्टी / ग्राहक / विक्रेता नाम', required: true, aliases: ['partyname', 'name', 'customername', 'vendorname', 'displayname', 'companyname', 'ledgername', 'accountname', 'contactname', 'billingname', 'party'] },
    { key: 'type', labelEn: 'Party Type (Customer/Vendor)', labelHi: 'प्रकार (Customer / Vendor)', aliases: ['type', 'partytype', 'group', 'parentgroup', 'accountgroup', 'contacttype', 'category'] },
    { key: 'gstin', labelEn: 'GSTIN / UIN', labelHi: 'GSTIN नंबर', aliases: ['gstin', 'gstno', 'gstnumber', 'gstinuin', 'gstregistrationnumber', 'gst', 'taxid'] },
    { key: 'pan', labelEn: 'PAN Number', labelHi: 'PAN नंबर', aliases: ['pan', 'panno', 'pannumber', 'itpan'] },
    { key: 'phone', labelEn: 'Phone / Mobile', labelHi: 'फ़ोन / मोबाइल नंबर', aliases: ['phone', 'phoneno', 'mobile', 'mobileno', 'contactno', 'telephone', 'whatsapp'] },
    { key: 'email', labelEn: 'Email ID', labelHi: 'ईमेल आईडी', aliases: ['email', 'emailid', 'mail', 'emailaddress'] },
    { key: 'address', labelEn: 'Billing Address', labelHi: 'पता (Address)', aliases: ['address', 'billingaddress', 'street', 'fulladdress', 'addr'] },
    { key: 'state', labelEn: 'State', labelHi: 'राज्य (State)', aliases: ['state', 'statename', 'billingstate', 'placeofsupply'] },
    { key: 'openingBalance', labelEn: 'Opening Balance', labelHi: 'ओपनिंग बैलेंस', aliases: ['openingbalance', 'opbal', 'openingbal', 'receivablebalance', 'balance', 'amount'] },
    { key: 'balanceType', labelEn: 'Dr / Cr', labelHi: 'Dr / Cr प्रकार', aliases: ['balancetype', 'drcr', 'opdrcr', 'typebalance'] },
  ],
  ITEMS: [
    { key: 'name', labelEn: 'Item / Product Name', labelHi: 'आइटम / उत्पाद का नाम', required: true, aliases: ['itemname', 'name', 'productname', 'stockitemname', 'sku', 'title', 'description'] },
    { key: 'code', labelEn: 'Item Code / SKU', labelHi: 'आइटम कोड / SKU', aliases: ['code', 'itemcode', 'sku', 'productcode', 'alias'] },
    { key: 'hsnSacCode', labelEn: 'HSN / SAC Code', labelHi: 'HSN / SAC कोड', aliases: ['hsn', 'hsncode', 'hsnsac', 'hsnsaccode', 'sac', 'hsnsacno'] },
    { key: 'unit', labelEn: 'Unit (Pcs/Kg/Box)', labelHi: 'इकाई (Unit)', aliases: ['unit', 'uom', 'baseunit', 'measuringunit', 'qtyunit'] },
    { key: 'salesPrice', labelEn: 'Sales Price / Rate', labelHi: 'विक्रय मूल्य (Sale Price)', aliases: ['salesprice', 'saleprice', 'sellingprice', 'rate', 'mrp', 'price', 'sellingrate'] },
    { key: 'purchasePrice', labelEn: 'Purchase Price / Cost', labelHi: 'खरीद मूल्य (Purchase Price)', aliases: ['purchaseprice', 'costprice', 'cost', 'purchaserate', 'buyprice', 'landingcost'] },
    { key: 'taxRate', labelEn: 'GST Tax Rate (%)', labelHi: 'GST दर (%)', aliases: ['taxrate', 'gst', 'gstrate', 'gstpercent', 'taxpercent', 'igstrate', 'tax'] },
    { key: 'currentStock', labelEn: 'Opening / Current Stock Qty', labelHi: 'ओपनिंग / वर्तमान स्टॉक मात्रा', aliases: ['currentstock', 'openingstock', 'stock', 'qty', 'quantity', 'openingqty', 'stockqty', 'availableqty'] },
    { key: 'stockValue', labelEn: 'Stock / Inventory Value (₹)', labelHi: 'कुल स्टॉक मूल्य (Stock Value ₹)', aliases: ['stockvalue', 'inventoryvalue', 'closingvalue', 'openingvalue', 'valuation', 'totalvalue', 'stockamount'] },
    { key: 'category', labelEn: 'Category / Group', labelHi: 'श्रेणी (Category)', aliases: ['category', 'itemcategory', 'group', 'itemgroup'] },
  ],
  ACCOUNTS: [
    { key: 'name', labelEn: 'Ledger / Account Name', labelHi: 'लेज़र / खाता नाम', required: true, aliases: ['accountname', 'ledgername', 'name', 'ledger', 'account'] },
    { key: 'code', labelEn: 'Account Code', labelHi: 'खाता कोड', aliases: ['code', 'accountcode', 'ledgercode'] },
    { key: 'category', labelEn: 'Group / Category', labelHi: 'ग्रुप / श्रेणी (Expense/Income/Asset/Liability)', aliases: ['category', 'group', 'accounttype', 'parentgroup', 'mainGroup', 'type', 'subcategory'] },
    { key: 'openingBalance', labelEn: 'Opening Balance', labelHi: 'ओपनिंग बैलेंस', aliases: ['openingbalance', 'opbal', 'balance', 'opening'] },
    { key: 'balanceType', labelEn: 'Dr / Cr', labelHi: 'Dr / Cr', aliases: ['balancetype', 'drcr', 'opdrcr'] },
  ],
  SALES: [
    { key: 'invoiceNumber', labelEn: 'Invoice No.', labelHi: 'इनवॉइस / बिल नंबर', required: true, aliases: ['invoicenumber', 'invoiceno', 'invno', 'billno', 'vouchernumber', 'vchno', 'vchbillno', 'refno', 'docno'] },
    { key: 'date', labelEn: 'Invoice Date', labelHi: 'बिल दिनांक', required: true, aliases: ['date', 'invoicedate', 'billdate', 'vchdate', 'txndate'] },
    { key: 'partyName', labelEn: 'Customer Name', labelHi: 'ग्राहक / पार्टी का नाम', required: true, aliases: ['partyname', 'customername', 'party', 'customer', 'billingname', 'ledgername', 'name'] },
    { key: 'partyGstin', labelEn: 'Customer GSTIN', labelHi: 'ग्राहक GSTIN', aliases: ['partygstin', 'customergstin', 'gstin', 'gstno', 'gst'] },
    { key: 'itemName', labelEn: 'Item / Service Description', labelHi: 'आइटम / सेवा विवरण', aliases: ['itemname', 'productname', 'description', 'item', 'particulars', 'service'] },
    { key: 'hsnSacCode', labelEn: 'HSN / SAC', labelHi: 'HSN / SAC', aliases: ['hsn', 'hsncode', 'hsnsaccode', 'sac'] },
    { key: 'quantity', labelEn: 'Qty', labelHi: 'मात्रा (Qty)', aliases: ['quantity', 'qty', 'billedqty'] },
    { key: 'rate', labelEn: 'Rate / Unit Price', labelHi: 'दर (Rate)', aliases: ['rate', 'price', 'unitprice'] },
    { key: 'discount', labelEn: 'Discount Amount (₹)', labelHi: 'ग्राहक छूट राशि (Discount ₹)', aliases: ['discount', 'discountamount', 'discamount', 'discamt', 'tradediscount', 'cashdiscount', 'rebate'] },
    { key: 'discountPercent', labelEn: 'Discount %', labelHi: 'छूट प्रतिशत (Disc %)', aliases: ['discountpercent', 'discountpct', 'discpercent', 'disc', 'discpct'] },
    { key: 'subtotal', labelEn: 'Taxable Amount', labelHi: 'कर योग्य राशि (Taxable Value)', aliases: ['taxableamount', 'taxablevalue', 'taxable', 'subtotal', 'basicamount', 'netamount'] },
    { key: 'cgst', labelEn: 'CGST Amount', labelHi: 'CGST राशि', aliases: ['cgst', 'cgstamount', 'cgstamt'] },
    { key: 'sgst', labelEn: 'SGST Amount', labelHi: 'SGST राशि', aliases: ['sgst', 'sgstamount', 'sgstamt', 'utgst'] },
    { key: 'igst', labelEn: 'IGST Amount', labelHi: 'IGST राशि', aliases: ['igst', 'igstamount', 'igstamt'] },
    { key: 'totalTax', labelEn: 'Total Tax (if single column)', labelHi: 'कुल GST टैक्स', aliases: ['totaltax', 'taxamount', 'taxamt', 'gstamount', 'tax'] },
    { key: 'grandTotal', labelEn: 'Grand / Invoice Total', labelHi: 'कुल बिल राशि (Grand Total)', aliases: ['grandtotal', 'total', 'totalamount', 'invoiceamount', 'billamount', 'amount', 'nettotal'] },
    { key: 'amountPaid', labelEn: 'Received / Paid Amount', labelHi: 'प्राप्त राशि (Paid)', aliases: ['received', 'amountpaid', 'paid', 'paidamount'] },
    { key: 'notes', labelEn: 'Notes / Narration', labelHi: 'टिप्पणी / विवरण', aliases: ['notes', 'narration', 'remarks', 'memo'] },
  ],
  PURCHASES: [
    { key: 'billNumber', labelEn: 'Supplier Bill / Invoice No.', labelHi: 'सप्लायर बिल नंबर', required: true, aliases: ['supplierinvoiceno', 'billno', 'invoiceno', 'invoicenumber', 'vouchernumber', 'vchno', 'vchbillno', 'refno'] },
    { key: 'date', labelEn: 'Bill Date', labelHi: 'बिल दिनांक', required: true, aliases: ['date', 'billdate', 'invoicedate', 'vchdate'] },
    { key: 'partyName', labelEn: 'Vendor / Supplier Name', labelHi: 'विक्रेता / सप्लायर का नाम', required: true, aliases: ['vendorname', 'suppliername', 'partyname', 'party', 'vendor', 'supplier', 'ledgername', 'name'] },
    { key: 'partyGstin', labelEn: 'Vendor GSTIN', labelHi: 'विक्रेता GSTIN', aliases: ['partygstin', 'vendorgstin', 'suppliergstin', 'gstin', 'gstno'] },
    { key: 'itemName', labelEn: 'Item / Expense Description', labelHi: 'आइटम / खरीद विवरण', aliases: ['itemname', 'productname', 'description', 'item', 'particulars'] },
    { key: 'hsnSacCode', labelEn: 'HSN / SAC', labelHi: 'HSN / SAC', aliases: ['hsn', 'hsncode', 'hsnsaccode'] },
    { key: 'quantity', labelEn: 'Qty', labelHi: 'मात्रा (Qty)', aliases: ['quantity', 'qty', 'billedqty'] },
    { key: 'rate', labelEn: 'Rate', labelHi: 'दर (Rate)', aliases: ['rate', 'price', 'unitprice'] },
    { key: 'discount', labelEn: 'Discount Amount (₹)', labelHi: 'छूट राशि (Discount ₹)', aliases: ['discount', 'discountamount', 'discamount', 'discamt', 'tradediscount', 'cashdiscount', 'rebate'] },
    { key: 'discountPercent', labelEn: 'Discount %', labelHi: 'छूट % (Disc %)', aliases: ['discountpercent', 'discountpct', 'discpercent', 'disc', 'discpct'] },
    { key: 'subtotal', labelEn: 'Taxable Amount', labelHi: 'कर योग्य राशि (Taxable)', aliases: ['taxableamount', 'taxablevalue', 'taxable', 'subtotal', 'basicamount'] },
    { key: 'cgst', labelEn: 'CGST Amount', labelHi: 'CGST राशि', aliases: ['cgst', 'cgstamount', 'cgstamt'] },
    { key: 'sgst', labelEn: 'SGST Amount', labelHi: 'SGST राशि', aliases: ['sgst', 'sgstamount', 'sgstamt'] },
    { key: 'igst', labelEn: 'IGST Amount', labelHi: 'IGST राशि', aliases: ['igst', 'igstamount', 'igstamt'] },
    { key: 'totalTax', labelEn: 'Total Tax', labelHi: 'कुल टैक्स', aliases: ['totaltax', 'taxamount', 'taxamt', 'gstamount'] },
    { key: 'grandTotal', labelEn: 'Grand Total', labelHi: 'कुल बिल राशि', aliases: ['grandtotal', 'total', 'totalamount', 'billamount', 'amount'] },
    { key: 'amountPaid', labelEn: 'Paid Amount', labelHi: 'भुगतान राशि', aliases: ['paid', 'amountpaid', 'paidamount'] },
    { key: 'notes', labelEn: 'Notes', labelHi: 'विवरण / टिप्पणी', aliases: ['notes', 'narration', 'remarks'] },
  ],
  VOUCHERS: [
    { key: 'voucherNumber', labelEn: 'Voucher No.', labelHi: 'वाउचर नंबर', aliases: ['vouchernumber', 'vchno', 'voucher', 'refno', 'entryno', 'docno'] },
    { key: 'date', labelEn: 'Date', labelHi: 'दिनांक', required: true, aliases: ['date', 'vchdate', 'txndate', 'entrydate'] },
    { key: 'type', labelEn: 'Voucher Type (Payment/Receipt/Contra/Journal)', labelHi: 'वाउचर प्रकार', aliases: ['type', 'vouchertype', 'vchtype', 'txntype'] },
    { key: 'debitAccount', labelEn: 'Debit Ledger (Dr)', labelHi: 'डेबिट खाता (Dr Ledger)', required: true, aliases: ['debitaccount', 'debitledger', 'drledger', 'draccount', 'expense', 'category', 'particulars', 'account', 'ledger', 'paidto'] },
    { key: 'creditAccount', labelEn: 'Credit Ledger (Cr)', labelHi: 'क्रेडिट खाता (Cr Ledger)', aliases: ['creditaccount', 'creditledger', 'crledger', 'craccount', 'paymentaccount', 'paidfrom', 'bank', 'cash', 'mode'] },
    { key: 'amount', labelEn: 'Amount (₹)', labelHi: 'राशि (₹)', required: true, aliases: ['amount', 'total', 'totalamount', 'debit', 'credit', 'value'] },
    { key: 'narration', labelEn: 'Narration / Particulars', labelHi: 'विवरण / नरेशन', aliases: ['narration', 'description', 'remarks', 'memo', 'notes', 'particulars'] },
  ],
};

function normHeader(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normKey(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseNum(raw: string): number {
  const cleaned = String(raw || '')
    .replace(/[₹$,]/g, '')
    .replace(/\b(dr|cr)\.?$/i, '')
    .trim();
  const m = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  const n = m ? parseFloat(m[0]) : 0;
  return Number.isFinite(n) ? n : 0;
}

function parseDrCr(rawAmt: string, rawType: string, defaultType: 'DR' | 'CR'): 'DR' | 'CR' {
  const t = `${rawType || ''} ${rawAmt || ''}`.toLowerCase();
  if (/\bcr\b|credit|payable|vendor|creditor/i.test(t)) return 'CR';
  if (/\bdr\b|debit|receivable|customer|debtor/i.test(t)) return 'DR';
  return defaultType;
}

function parseFlexDate(raw: unknown): string {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, '0');
    const d = String(raw.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(raw || '').trim();
  if (!s) return new Date().toISOString().split('T')[0];

  // Excel serial number as string (e.g. 46125)
  if (/^\d{5}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 30000 && serial < 70000) {
      const utc = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      return utc.toISOString().split('T')[0];
    }
  }
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return normalizeDateISO(s) || new Date().toISOString().split('T')[0];
}

function findStateFromTextOrGstin(stateInput: string, gstin: string): { state: string; stateCode: string } {
  const cleanGstin = (gstin || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
  if (cleanGstin.length >= 2) {
    const prefix = cleanGstin.slice(0, 2);
    if (INDIAN_STATE_CODES[prefix]) {
      return { stateCode: prefix, state: INDIAN_STATE_CODES[prefix] };
    }
  }
  const normalized = (stateInput || '').toLowerCase().replace(/[^a-z]/g, '');
  if (normalized) {
    for (const [code, name] of Object.entries(INDIAN_STATE_CODES)) {
      const target = name.toLowerCase().replace(/[^a-z]/g, '');
      if (normalized === target || normalized.includes(target) || target.includes(normalized)) {
        return { stateCode: code, state: name };
      }
    }
  }
  return { state: stateInput || 'Delhi', stateCode: '07' };
}

function inferAccountMetaFromGroup(groupRaw: string, accName: string): {
  category: AccountCategory;
  subCategory: string;
  mainGroup: string;
  balanceType: 'DR' | 'CR';
} {
  const g = `${groupRaw || ''} ${accName || ''}`.toLowerCase();
  if (g.includes('bank') || g.includes('cash') || g.includes('petty')) {
    return { category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', balanceType: 'DR' };
  }
  if (g.includes('debtor') || g.includes('receivable') || g.includes('customer')) {
    return { category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Sundry Debtors', balanceType: 'DR' };
  }
  if (g.includes('creditor') || g.includes('payable') || g.includes('vendor')) {
    return { category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Sundry Creditors', balanceType: 'CR' };
  }
  if (g.includes('fixed asset') || g.includes('machinery') || g.includes('furniture') || g.includes('laptop')) {
    return { category: 'ASSET', subCategory: 'Fixed Assets', mainGroup: 'Fixed Assets', balanceType: 'DR' };
  }
  if (g.includes('capital') || g.includes('equity') || g.includes('reserve')) {
    return { category: 'EQUITY', subCategory: 'Capital', mainGroup: 'Capital Account', balanceType: 'CR' };
  }
  if (g.includes('loan') || g.includes('liability') || g.includes('tax') || g.includes('gst') || g.includes('tds')) {
    return { category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Current Liabilities', balanceType: 'CR' };
  }
  if (g.includes('sale') || g.includes('income') || g.includes('revenue') || g.includes('receipt')) {
    return {
      category: 'REVENUE',
      subCategory: g.includes('direct') || g.includes('sale') ? 'Direct Revenue' : 'Indirect Revenue',
      mainGroup: g.includes('direct') || g.includes('sale') ? 'Direct Incomes' : 'Indirect Incomes',
      balanceType: 'CR',
    };
  }
  if (g.includes('purchase') || g.includes('cogs') || g.includes('direct expense') || g.includes('freight') || g.includes('wages')) {
    return { category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', balanceType: 'DR' };
  }
  if (g.includes('asset') || g.includes('deposit') || g.includes('advance') || g.includes('stock')) {
    return { category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', balanceType: 'DR' };
  }
  return { category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', balanceType: 'DR' };
}

/**
 * Reads an uploaded .xlsx / .xls / .csv / .json file into multi-sheet tabular records
 */
export function parseExternalSpreadsheetBuffer(buffer: ArrayBuffer, fileName: string): ExternalWorkbookData {
  const lower = fileName.toLowerCase();

  // Support JSON arrays / exported JSON objects from other tools
  if (lower.endsWith('.json')) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '');
    const parsed = JSON.parse(text);
    const arr: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.data)
      ? parsed.data
      : Array.isArray(parsed?.rows)
      ? parsed.rows
      : Array.isArray(parsed?.parties)
      ? parsed.parties
      : Array.isArray(parsed?.items)
      ? parsed.items
      : [];

    if (!arr.length) {
      throw new Error('JSON file does not contain an array of records.');
    }

    const headerSet = new Set<string>();
    arr.slice(0, 50).forEach((obj) => {
      if (obj && typeof obj === 'object') {
        Object.keys(obj).forEach((k) => headerSet.add(k));
      }
    });
    const headers = Array.from(headerSet);
    const rows = arr.map((obj) => {
      const rec: Record<string, string> = {};
      headers.forEach((h) => {
        const v = obj?.[h];
        rec[h] = v === null || v === undefined ? '' : String(v);
      });
      return rec;
    });

    return {
      fileName,
      sheetNames: ['JSON Data'],
      sheets: { 'JSON Data': { headers, rows } },
    };
  }

  // Excel (.xlsx, .xls) or CSV via SheetJS
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheets: ExternalWorkbookData['sheets'] = {};
  const validSheetNames: string[] = [];

  wb.SheetNames.forEach((sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;
    const rawMatrix = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '' });
    if (!rawMatrix || rawMatrix.length < 2) return;

    // Vyapar / Busy / Marg Excel exports often put Company Banner in top 2-6 rows before actual column headers!
    // Auto-detect the real header row (the row within top 15 rows having max non-empty string columns >= 2)
    let headerRowIdx = 0;
    let bestScore = -1;
    const scanLimit = Math.min(rawMatrix.length, 15);
    for (let r = 0; r < scanLimit; r++) {
      const row = rawMatrix[r] || [];
      const nonEmptyStrings = row.filter((cell) => {
        const s = String(cell ?? '').trim();
        return s.length > 0 && !/^\d+(\.\d+)?$/.test(s);
      }).length;
      if (nonEmptyStrings > bestScore) {
        bestScore = nonEmptyStrings;
        headerRowIdx = r;
      }
    }

    const rawHeaders = (rawMatrix[headerRowIdx] || []).map((h, i) => {
      const txt = String(h ?? '').replace(/\s+/g, ' ').trim();
      return txt || `Column_${i + 1}`;
    });

    // Deduplicate identical header labels cleanly
    const seenHeaderCount = new Map<string, number>();
    const headers = rawHeaders.map((h) => {
      const cnt = seenHeaderCount.get(h) || 0;
      seenHeaderCount.set(h, cnt + 1);
      return cnt === 0 ? h : `${h} (${cnt + 1})`;
    });

    const rows: Record<string, string>[] = [];
    for (let r = headerRowIdx + 1; r < rawMatrix.length; r++) {
      const line = rawMatrix[r] || [];
      const hasAnyValue = line.some((c) => String(c ?? '').trim() !== '');
      if (!hasAnyValue) continue;

      const rowObj: Record<string, string> = {};
      headers.forEach((h, cIdx) => {
        const cell = line[cIdx];
        rowObj[h] = cell instanceof Date ? parseFlexDate(cell) : String(cell ?? '').trim();
      });

      // Skip common summary/total footer rows exported by Vyapar/Busy
      const firstVal = String(rowObj[headers[0]] || '').toLowerCase().trim();
      if (firstVal === 'total' || firstVal === 'grand total' || firstVal.startsWith('total:')) {
        continue;
      }

      rows.push(rowObj);
    }

    if (rows.length > 0) {
      validSheetNames.push(sheetName);
      sheets[sheetName] = { headers, rows };
    }
  });

  if (validSheetNames.length === 0) {
    throw new Error('No tabular rows found inside uploaded file.');
  }

  return {
    fileName,
    sheetNames: validSheetNames,
    sheets,
  };
}

/**
 * Computes smart initial column mapping from sheet headers to HisabVeda target fields
 */
export function autoSuggestColumnMapping(
  headers: string[],
  entityType: ExternalImportEntityType
): Record<string, string> {
  const fields = ENTITY_FIELD_DEFS[entityType];
  const mapping: Record<string, string> = {};
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normHeader(h) }));

  fields.forEach((field) => {
    // 1. Exact alias match
    for (const alias of field.aliases) {
      const hit = normalizedHeaders.find((h) => h.norm === alias);
      if (hit) {
        mapping[field.key] = hit.raw;
        return;
      }
    }
    // 2. Partial contains match
    for (const alias of field.aliases) {
      if (alias.length < 4) continue;
      const hit = normalizedHeaders.find((h) => h.norm.includes(alias) || alias.includes(h.norm));
      if (hit) {
        mapping[field.key] = hit.raw;
        return;
      }
    }
    mapping[field.key] = '';
  });

  return mapping;
}

/**
 * Converts mapped rows into strict HisabVeda AppData domain entities with deduplication
 */
export function buildExternalImportPreview(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  entityType: ExternalImportEntityType,
  existingData: AppData,
  skipDuplicates: boolean,
  softwareLabel: ExternalSoftwarePreset
): ExternalParsedResult {
  const warnings: string[] = [];
  const uidBase = Date.now().toString(36);
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}_ext_${uidBase}_${seq++}`;
  const get = (row: Record<string, string>, fieldKey: string): string => {
    const col = mapping[fieldKey];
    return col ? String(row[col] ?? '').trim() : '';
  };

  const importedParties: PartyMaster[] = [];
  const importedItems: ItemMaster[] = [];
  const importedAccounts: Account[] = [];
  const importedInvoices: SalesInvoice[] = [];
  const importedPurchases: PurchaseInvoice[] = [];
  const importedVouchers: Voucher[] = [];

  let skippedDuplicates = 0;
  let minDate = '';
  let maxDate = '';
  const trackDate = (d: string) => {
    if (!d) return;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  };

  const existingPartyByKey = new Map<string, PartyMaster>();
  (existingData.parties || []).forEach((p) => existingPartyByKey.set(normKey(p.name), p));
  const importedPartyByKey = new Map<string, PartyMaster>();

  const existingItemByKey = new Map<string, ItemMaster>();
  (existingData.items || []).forEach((it) => existingItemByKey.set(normKey(it.name), it));
  const importedItemByKey = new Map<string, ItemMaster>();

  const existingAccountByKey = new Map<string, Account>();
  const existingCodes = new Set<string>();
  (existingData.accounts || []).forEach((a) => {
    existingAccountByKey.set(normKey(a.name), a);
    if (a.code) existingCodes.add(a.code.trim());
  });
  const importedAccountByKey = new Map<string, Account>();

  let nextAccCode = 7100;
  const allocCode = () => {
    while (existingCodes.has(String(nextAccCode))) nextAccCode++;
    const c = String(nextAccCode);
    existingCodes.add(c);
    nextAccCode++;
    return c;
  };

  const resolveOrCreateParty = (
    partyName: string,
    gstinRaw: string,
    defaultType: PartyType
  ): PartyMaster => {
    const clean = (partyName || 'Cash / Counter Party').trim();
    const key = normKey(clean);
    const existing = existingPartyByKey.get(key) || importedPartyByKey.get(key);
    if (existing) return existing;

    const cleanGst = (gstinRaw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const { state, stateCode } = findStateFromTextOrGstin('', cleanGst);
    const p: PartyMaster = {
      id: nextId('pty'),
      code: `${defaultType === 'CUSTOMER' ? 'CUST' : 'VEND'}-${101 + importedParties.length}`,
      name: clean,
      type: defaultType,
      gstin: cleanGst,
      pan: cleanGst.length >= 12 ? cleanGst.slice(2, 12) : '',
      email: '',
      phone: '',
      address: '',
      state,
      stateCode,
      creditLimit: 500000,
      openingBalance: 0,
      balanceType: defaultType === 'CUSTOMER' ? 'DR' : 'CR',
      gstCategory: cleanGst.length === 15 ? 'REGULAR' : 'UNREGISTERED',
    };
    importedParties.push(p);
    importedPartyByKey.set(key, p);
    return p;
  };

  const existingItemUpdateMap = new Map<string, ExternalItemStockUpdate>();

  const resolveOrCreateItem = (
    itemName: string,
    hsn: string,
    rate: number,
    taxRate: number,
    isPurchase: boolean,
    qty: number
  ): ItemMaster => {
    const clean = (itemName || 'General Service / Product').trim();
    const key = normKey(clean);
    const existingMaster = existingItemByKey.get(key);
    const newlyCreated = importedItemByKey.get(key);
    const qtyDelta = isPurchase ? qty : -qty;

    if (existingMaster) {
      const prevUpd = existingItemUpdateMap.get(existingMaster.id) || {
        itemId: existingMaster.id,
        qtyDelta: 0,
      };
      prevUpd.qtyDelta = Math.round((prevUpd.qtyDelta + qtyDelta) * 1000) / 1000;
      if (isPurchase && rate > 0) prevUpd.purchasePrice = rate;
      if (!isPurchase && rate > 0) prevUpd.salesPrice = rate;
      existingItemUpdateMap.set(existingMaster.id, prevUpd);
      return existingMaster;
    }

    if (newlyCreated) {
      newlyCreated.currentStock = Math.max(0, Math.round((Number(newlyCreated.currentStock || 0) + qtyDelta) * 1000) / 1000);
      if (isPurchase && rate > 0 && (newlyCreated.purchasePrice || 0) === 0) newlyCreated.purchasePrice = rate;
      if (!isPurchase && rate > 0 && (newlyCreated.salesPrice || 0) === 0) newlyCreated.salesPrice = rate;
      return newlyCreated;
    }

    const it: ItemMaster = {
      id: nextId('itm'),
      code: `EXT-${100 + importedItems.length + 1}`,
      name: clean,
      description: clean,
      hsnSacCode: hsn || '8471',
      unit: 'Pcs',
      purchasePrice: isPurchase ? rate : 0,
      salesPrice: !isPurchase ? rate : Math.round(rate * 1.15 * 100) / 100,
      taxRate: taxRate || 18,
      currentStock: isPurchase ? qty : 0,
      openingStock: 0,
      minStockLevel: 5,
      category: 'Imported',
    };
    importedItems.push(it);
    importedItemByKey.set(key, it);
    return it;
  };

  const resolveOrCreateAccount = (ledgerName: string, groupHint: string): Account => {
    const clean = ledgerName.trim();
    const key = normKey(clean);
    const existing = existingAccountByKey.get(key) || importedAccountByKey.get(key);
    if (existing) return existing;

    const meta = inferAccountMetaFromGroup(groupHint, clean);
    const acc: Account = {
      id: nextId('acc'),
      code: allocCode(),
      name: clean,
      category: meta.category,
      subCategory: meta.subCategory,
      mainGroup: meta.mainGroup,
      openingBalance: 0,
      balanceType: meta.balanceType,
      isSystem: false,
    };
    importedAccounts.push(acc);
    importedAccountByKey.set(key, acc);
    return acc;
  };

  if (entityType === 'PARTIES') {
    rows.forEach((row) => {
      const name = get(row, 'name');
      if (!name) return;
      const key = normKey(name);
      if (skipDuplicates && (existingPartyByKey.has(key) || importedPartyByKey.has(key))) {
        skippedDuplicates++;
        return;
      }

      const typeRaw = get(row, 'type').toLowerCase();
      const gstin = get(row, 'gstin').toUpperCase().replace(/[^0-9A-Z]/g, '');
      const pan = get(row, 'pan').toUpperCase().replace(/[^0-9A-Z]/g, '') || (gstin.length >= 12 ? gstin.slice(2, 12) : '');
      const phone = get(row, 'phone');
      const email = get(row, 'email');
      const address = get(row, 'address');
      const stateRaw = get(row, 'state');
      const { state, stateCode } = findStateFromTextOrGstin(stateRaw, gstin);
      const opBalRaw = get(row, 'openingBalance');
      const opBal = Math.abs(parseNum(opBalRaw));
      const partyType: PartyType =
        typeRaw.includes('both')
          ? 'BOTH'
          : typeRaw.includes('vendor') || typeRaw.includes('supplier') || typeRaw.includes('creditor') || typeRaw.includes('payable')
          ? 'VENDOR'
          : 'CUSTOMER';
      const balType = parseDrCr(opBalRaw, get(row, 'balanceType'), partyType === 'CUSTOMER' ? 'DR' : 'CR');

      const p: PartyMaster = {
        id: nextId('pty'),
        code: `${partyType === 'CUSTOMER' ? 'CUST' : 'VEND'}-${101 + importedParties.length}`,
        name,
        type: partyType,
        gstin,
        pan,
        email,
        phone,
        address,
        state,
        stateCode,
        creditLimit: 500000,
        openingBalance: Math.round(opBal * 100) / 100,
        balanceType: balType,
        gstCategory: gstin.length === 15 ? 'REGULAR' : 'UNREGISTERED',
      };
      importedParties.push(p);
      importedPartyByKey.set(key, p);
    });
  } else if (entityType === 'ITEMS') {
    rows.forEach((row) => {
      const name = get(row, 'name');
      if (!name) return;
      const key = normKey(name);
      if (skipDuplicates && (existingItemByKey.has(key) || importedItemByKey.has(key))) {
        skippedDuplicates++;
        return;
      }

      const salesPrice = Math.max(0, parseNum(get(row, 'salesPrice')));
      const rawPurchasePrice = Math.max(0, parseNum(get(row, 'purchasePrice')));
      const rawCurrentStock = Math.max(0, parseNum(get(row, 'currentStock')));
      const stockValue = Math.max(0, parseNum(get(row, 'stockValue')));
      const taxRate = Math.max(0, Math.min(28, parseNum(get(row, 'taxRate')) || 18));

      const currentStock =
        rawCurrentStock > 0
          ? rawCurrentStock
          : stockValue > 0 && rawPurchasePrice > 0
          ? Math.round((stockValue / rawPurchasePrice) * 1000) / 1000
          : 0;

      const purchasePrice =
        rawPurchasePrice > 0
          ? rawPurchasePrice
          : stockValue > 0 && currentStock > 0
          ? Math.round((stockValue / currentStock) * 100) / 100
          : 0;

      const item: ItemMaster = {
        id: nextId('itm'),
        code: get(row, 'code') || `EXT-${100 + importedItems.length + 1}`,
        name,
        description: name,
        hsnSacCode: get(row, 'hsnSacCode') || '8471',
        unit: get(row, 'unit') || 'Pcs',
        purchasePrice: Math.round(purchasePrice * 100) / 100,
        salesPrice: Math.round((salesPrice || purchasePrice * 1.15) * 100) / 100,
        taxRate,
        currentStock,
        openingStock: currentStock,
        minStockLevel: 5,
        category: get(row, 'category') || 'General',
      };
      importedItems.push(item);
      importedItemByKey.set(key, item);
    });
  } else if (entityType === 'ACCOUNTS') {
    rows.forEach((row) => {
      const name = get(row, 'name');
      if (!name) return;
      const key = normKey(name);
      if (skipDuplicates && (existingAccountByKey.has(key) || importedAccountByKey.has(key))) {
        skippedDuplicates++;
        return;
      }

      const groupRaw = get(row, 'category');
      const meta = inferAccountMetaFromGroup(groupRaw, name);
      const opBalRaw = get(row, 'openingBalance');
      const opBal = Math.abs(parseNum(opBalRaw));
      const balType = parseDrCr(opBalRaw, get(row, 'balanceType'), meta.balanceType);

      const acc: Account = {
        id: nextId('acc'),
        code: get(row, 'code') || allocCode(),
        name,
        category: meta.category,
        subCategory: meta.subCategory,
        mainGroup: meta.mainGroup,
        openingBalance: Math.round(opBal * 100) / 100,
        balanceType: balType,
        isSystem: false,
      };
      importedAccounts.push(acc);
      importedAccountByKey.set(key, acc);
    });
  } else if (entityType === 'SALES' || entityType === 'PURCHASES') {
    const isSales = entityType === 'SALES';
    const existingKeys = new Set(
      isSales
        ? (existingData.invoices || []).map((i) => `${i.invoiceNumber.trim().toLowerCase()}|${i.date}`)
        : (existingData.purchaseInvoices || []).map((p) => `${p.supplierInvoiceNo.trim().toLowerCase()}|${p.date}`)
    );

    // Group rows by Bill/Invoice Number + Date so multi-item Excel bills stay together
    const grouped = new Map<string, Record<string, string>[]>();
    rows.forEach((row, idx) => {
      const docNo = (isSales ? get(row, 'invoiceNumber') : get(row, 'billNumber')) || `EXT-${idx + 1}`;
      const dt = parseFlexDate(get(row, 'date'));
      const grpKey = `${docNo.trim().toLowerCase()}|${dt}`;
      if (!grouped.has(grpKey)) grouped.set(grpKey, []);
      grouped.get(grpKey)!.push(row);
    });

    grouped.forEach((grpRows, grpKey) => {
      if (skipDuplicates && existingKeys.has(grpKey)) {
        skippedDuplicates++;
        return;
      }
      existingKeys.add(grpKey);

      const first = grpRows[0];
      const docNo = (isSales ? get(first, 'invoiceNumber') : get(first, 'billNumber')) || `EXT-${seq}`;
      const date = parseFlexDate(get(first, 'date'));
      trackDate(date);

      const partyName = get(first, 'partyName') || (isSales ? 'Cash Customer' : 'Cash Supplier');
      const partyGstin = get(first, 'partyGstin');
      const party = resolveOrCreateParty(partyName, partyGstin, isSales ? 'CUSTOMER' : 'VENDOR');

      const lines: InvoiceItem[] = [];
      let sumGrossSub = 0;
      let sumDiscount = 0;
      let sumCgst = 0;
      let sumSgst = 0;
      let sumIgst = 0;
      let sumSingleTax = 0;
      let sumGrand = 0;
      let maxPaid = 0;

      grpRows.forEach((r) => {
        const qty = Math.max(0.01, parseNum(get(r, 'quantity')) || 1);
        const rawRate = parseNum(get(r, 'rate'));
        const rowDiscAmt = Math.max(0, parseNum(get(r, 'discount')));
        const rowDiscPct = Math.max(0, Math.min(100, parseNum(get(r, 'discountPercent'))));
        const rowSub = parseNum(get(r, 'subtotal'));
        const rowCgst = parseNum(get(r, 'cgst'));
        const rowSgst = parseNum(get(r, 'sgst'));
        const rowIgst = parseNum(get(r, 'igst'));
        const rowTotTax = parseNum(get(r, 'totalTax'));
        const rowGrand = parseNum(get(r, 'grandTotal'));
        const rowPaid = parseNum(get(r, 'amountPaid'));
        if (rowPaid > maxPaid) maxPaid = rowPaid;

        const inferredTax = rowCgst + rowSgst + rowIgst > 0 ? rowCgst + rowSgst + rowIgst : rowTotTax;

        let grossLine = 0;
        let discAmt = 0;
        let discPct = 0;
        let netLine = 0;

        if (rawRate > 0) {
          grossLine = Math.round(qty * rawRate * 100) / 100;
          if (rowDiscAmt > 0) {
            discAmt = Math.min(grossLine, Math.round(rowDiscAmt * 100) / 100);
            discPct = grossLine > 0 ? Math.round((discAmt / grossLine) * 10000) / 100 : 0;
          } else if (rowDiscPct > 0) {
            discPct = Math.round(rowDiscPct * 100) / 100;
            discAmt = Math.round(grossLine * (discPct / 100) * 100) / 100;
          } else if (rowSub > 0 && grossLine - rowSub > 0.05) {
            discAmt = Math.round((grossLine - rowSub) * 100) / 100;
            discPct = Math.round((discAmt / grossLine) * 10000) / 100;
          }
          netLine = rowSub > 0 && Math.abs((grossLine - discAmt) - rowSub) <= 1 ? rowSub : Math.max(0, Math.round((grossLine - discAmt) * 100) / 100);
        } else {
          const baseNet = rowSub > 0 ? rowSub : Math.max(0, rowGrand - inferredTax);
          if (rowDiscAmt > 0) {
            discAmt = Math.round(rowDiscAmt * 100) / 100;
            grossLine = Math.round((baseNet + discAmt) * 100) / 100;
            discPct = grossLine > 0 ? Math.round((discAmt / grossLine) * 10000) / 100 : 0;
            netLine = baseNet;
          } else if (rowDiscPct > 0 && rowDiscPct < 100) {
            discPct = Math.round(rowDiscPct * 100) / 100;
            grossLine = Math.round((baseNet / (1 - discPct / 100)) * 100) / 100;
            discAmt = Math.round((grossLine - baseNet) * 100) / 100;
            netLine = baseNet;
          } else {
            grossLine = baseNet;
            netLine = baseNet;
          }
        }

        const unitRate = rawRate > 0 ? rawRate : Math.round((grossLine / qty) * 100) / 100;
        const taxRatePct = netLine > 0 && inferredTax > 0 ? Math.round((inferredTax / netLine) * 1000) / 10 : 0;

        const itmName = get(r, 'itemName') || (isSales ? 'Sales Item' : 'Purchase Item');
        const hsn = get(r, 'hsnSacCode') || '8471';
        const matchedItm = resolveOrCreateItem(itmName, hsn, unitRate, taxRatePct || 18, !isSales, qty);

        sumGrossSub += grossLine;
        sumDiscount += discAmt;
        sumCgst += rowCgst;
        sumSgst += rowSgst;
        sumIgst += rowIgst;
        sumSingleTax += rowTotTax;
        sumGrand += rowGrand;

        lines.push({
          id: nextId('line'),
          itemId: matchedItm.id,
          itemName: matchedItm.name,
          hsnSacCode: hsn,
          quantity: qty,
          unit: matchedItm.unit || 'Pcs',
          rate: unitRate,
          discountPercent: discPct,
          taxRate: taxRatePct,
          taxAmount: Math.round(inferredTax * 100) / 100,
          totalAmount: Math.round((netLine + inferredTax) * 100) / 100,
        });
      });

      const compStateCode = existingData.company.stateCode || '07';
      const isInterState = sumIgst > 0 || (Boolean(party.stateCode) && party.stateCode !== compStateCode);

      let cgstAmount = Math.round(sumCgst * 100) / 100;
      let sgstAmount = Math.round(sumSgst * 100) / 100;
      let igstAmount = Math.round(sumIgst * 100) / 100;

      if (cgstAmount + sgstAmount + igstAmount === 0 && sumSingleTax > 0) {
        if (isInterState) igstAmount = Math.round(sumSingleTax * 100) / 100;
        else {
          cgstAmount = Math.round((sumSingleTax / 2) * 100) / 100;
          sgstAmount = Math.round((sumSingleTax - cgstAmount) * 100) / 100;
        }
      }

      const subtotal = Math.round(sumGrossSub * 100) / 100;
      const totalDiscount = Math.round(sumDiscount * 100) / 100;
      const netTaxable = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);
      const totalTax = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;
      const grandTotal = sumGrand > 0 ? Math.round(sumGrand * 100) / 100 : Math.round((netTaxable + totalTax) * 100) / 100;
      const roundOff = Math.round((grandTotal - (netTaxable + totalTax)) * 100) / 100;
      const amountPaid = Math.min(grandTotal, Math.max(0, maxPaid));
      const status = amountPaid >= grandTotal && grandTotal > 0 ? 'PAID' : amountPaid > 0 ? 'PARTIAL' : 'UNPAID';
      const notes = get(first, 'notes') || `Imported from ${softwareLabel}`;

      if (isSales) {
        importedInvoices.push({
          id: nextId('inv'),
          invoiceNumber: docNo,
          date,
          dueDate: date,
          invoiceType: 'TAX_INVOICE',
          partyId: party.id,
          partyName: party.name,
          partyGstin: party.gstin || '',
          partyGstCategory: party.gstCategory,
          partyAddress: party.address || '',
          partyState: party.state || existingData.company.state || 'Delhi',
          placeOfSupply: party.state || existingData.company.state || 'Delhi',
          isInterState,
          items: lines,
          subtotal,
          totalDiscount,
          cgstAmount,
          sgstAmount,
          igstAmount,
          totalTax,
          roundOff,
          grandTotal,
          amountPaid,
          status,
          notes,
        });
      } else {
        importedPurchases.push({
          id: nextId('pur'),
          billNumber: `PB-${docNo}`,
          supplierInvoiceNo: docNo,
          date,
          dueDate: date,
          partyId: party.id,
          partyName: party.name,
          partyGstin: party.gstin || '',
          partyState: party.state || existingData.company.state || 'Delhi',
          isInterState,
          items: lines,
          subtotal,
          cgstAmount,
          sgstAmount,
          igstAmount,
          totalTax,
          totalDiscount,
          roundOff,
          grandTotal,
          amountPaid,
          status,
          notes,
        });
      }
    });
  } else if (entityType === 'VOUCHERS') {
    const existingVchKeys = new Set(
      (existingData.vouchers || []).map((v) => `${v.type}|${v.voucherNumber.trim().toLowerCase()}|${v.date}`)
    );

    const cashAcc =
      (existingData.accounts || []).find((a) => a.id === 'acc_cash' || a.name.toLowerCase() === 'cash') ||
      resolveOrCreateAccount('Cash in Hand', 'Cash');
    const bankAcc =
      (existingData.accounts || []).find((a) => !a.isGroup && a.subCategory === 'Cash & Bank' && a.id !== cashAcc.id) ||
      cashAcc;

    rows.forEach((row, idx) => {
      const amount = Math.round(Math.abs(parseNum(get(row, 'amount'))) * 100) / 100;
      const drName = get(row, 'debitAccount');
      if (!drName || amount <= 0) return;

      const date = parseFlexDate(get(row, 'date'));
      trackDate(date);
      const vchNo = get(row, 'voucherNumber') || `EXT-VCH-${idx + 1}`;
      const typeRaw = get(row, 'type').toLowerCase();
      let vchType: VoucherType = 'PAYMENT';
      if (typeRaw.includes('receipt') || typeRaw.includes('income')) vchType = 'RECEIPT';
      else if (typeRaw.includes('contra')) vchType = 'CONTRA';
      else if (typeRaw.includes('journal')) vchType = 'JOURNAL';
      else if (typeRaw.includes('payment') || typeRaw.includes('expense')) vchType = 'PAYMENT';

      const dupKey = `${vchType}|${vchNo.trim().toLowerCase()}|${date}`;
      if (skipDuplicates && existingVchKeys.has(dupKey)) {
        skippedDuplicates++;
        return;
      }
      existingVchKeys.add(dupKey);

      const crRaw = get(row, 'creditAccount');
      const drAcc = resolveOrCreateAccount(drName, vchType === 'PAYMENT' ? 'Indirect Expenses' : '');
      const crAcc = crRaw
        ? crRaw.toLowerCase() === 'cash'
          ? cashAcc
          : crRaw.toLowerCase() === 'bank'
          ? bankAcc
          : resolveOrCreateAccount(crRaw, 'Bank Accounts')
        : cashAcc;

      if (drAcc.id === crAcc.id) {
        warnings.push(`Row ${idx + 1} (${vchNo}): Debit and Credit accounts matched ("${drAcc.name}") — skipped.`);
        return;
      }

      importedVouchers.push({
        id: nextId('vch'),
        voucherNumber: vchNo,
        type: vchType,
        date,
        entries: [
          {
            id: nextId('jel'),
            accountId: drAcc.id,
            accountName: drAcc.name,
            accountCode: drAcc.code,
            debit: amount,
            credit: 0,
          },
          {
            id: nextId('jel'),
            accountId: crAcc.id,
            accountName: crAcc.name,
            accountCode: crAcc.code,
            debit: 0,
            credit: amount,
          },
        ],
        totalAmount: amount,
        narration: get(row, 'narration') || `${vchType} imported from ${softwareLabel}`,
      });
    });
  }

  const itemStockUpdates = Array.from(existingItemUpdateMap.values());

  return {
    success: true,
    warnings,
    parties: importedParties,
    items: importedItems,
    accounts: importedAccounts,
    invoices: importedInvoices,
    purchaseInvoices: importedPurchases,
    vouchers: importedVouchers,
    ...(itemStockUpdates.length > 0 ? { itemStockUpdates } : {}),
    skippedDuplicates,
    minDate: minDate || undefined,
    maxDate: maxDate || undefined,
  };
}

export function countExternalImportedRecords(data: AppData): {
  parties: number;
  items: number;
  accounts: number;
  invoices: number;
  purchases: number;
  vouchers: number;
  total: number;
} {
  const isExt = (id?: string) => Boolean(id && id.includes('_ext_'));
  const parties = (data.parties || []).filter((p) => isExt(p.id)).length;
  const items = (data.items || []).filter((i) => isExt(i.id)).length;
  const accounts = (data.accounts || []).filter((a) => isExt(a.id)).length;
  const invoices = (data.invoices || []).filter((i) => isExt(i.id)).length;
  const purchases = (data.purchaseInvoices || []).filter((p) => isExt(p.id)).length;
  const vouchers = (data.vouchers || []).filter((v) => isExt(v.id)).length;
  return {
    parties,
    items,
    accounts,
    invoices,
    purchases,
    vouchers,
    total: parties + items + accounts + invoices + purchases + vouchers,
  };
}

/**
 * Downloads a crisp Excel (.xlsx) template ready for Busy / Vyapar / Marg / Zoho / Custom Excel data
 */
export function downloadExternalSampleTemplateXlsx(entityType: ExternalImportEntityType) {
  const sampleRows: Record<ExternalImportEntityType, Record<string, any>[]> = {
    PARTIES: [
      { 'Party Name': 'Surya Traders Delhi', Type: 'Customer', GSTIN: '07AABCS1234F1Z2', Phone: '9811223344', Email: 'accounts@surya.in', Address: 'Shop 12, Chandni Chowk', State: 'Delhi', 'Opening Balance': 25000, 'Dr/Cr': 'Dr' },
      { 'Party Name': 'Mahalaxmi Distributors', Type: 'Vendor', GSTIN: '27AABCM5678G1Z9', Phone: '9820112233', Email: 'sales@mahalaxmi.in', Address: 'Plot 5, Bhiwandi', State: 'Maharashtra', 'Opening Balance': 42000, 'Dr/Cr': 'Cr' },
    ],
    ITEMS: [
      { 'Item Name': 'HP Laser Printer 108w', Code: 'HP-108W', HSN: '8443', Unit: 'Pcs', 'Sale Price': 12500, 'Purchase Price': 10200, 'GST %': 18, 'Opening Stock': 14, 'Stock Value': 142800, Category: 'Printers' },
      { 'Item Name': 'A4 Copier Paper Ream', Code: 'PPR-A4', HSN: '4802', Unit: 'Box', 'Sale Price': 290, 'Purchase Price': 235, 'GST %': 12, 'Opening Stock': 80, 'Stock Value': 18800, Category: 'Stationery' },
    ],
    ACCOUNTS: [
      { 'Account Name': 'Godown Electricity Expense', Code: '6201', Group: 'Indirect Expenses', 'Opening Balance': 0, 'Dr/Cr': 'Dr' },
      { 'Account Name': 'ICICI Bank Current A/c', Code: '1025', Group: 'Bank Accounts', 'Opening Balance': 175000, 'Dr/Cr': 'Dr' },
    ],
    SALES: [
      { 'Invoice No': 'INV-2026-101', Date: '2026-05-14', 'Customer Name': 'Surya Traders Delhi', GSTIN: '07AABCS1234F1Z2', 'Item Name': 'HP Laser Printer 108w', HSN: '8443', Qty: 2, Rate: 12500, 'Discount': 1250, 'Taxable Value': 23750, CGST: 2137.5, SGST: 2137.5, IGST: 0, 'Grand Total': 28025, Paid: 28025 },
    ],
    PURCHASES: [
      { 'Bill No': 'SUP-884', Date: '2026-05-10', 'Vendor Name': 'Mahalaxmi Distributors', GSTIN: '27AABCM5678G1Z9', 'Item Name': 'HP Laser Printer 108w', HSN: '8443', Qty: 5, Rate: 10200, 'Discount': 0, 'Taxable Value': 51000, CGST: 0, SGST: 0, IGST: 9180, 'Grand Total': 60180, Paid: 0 },
    ],
    VOUCHERS: [
      { 'Voucher No': 'PAY-501', Date: '2026-05-18', Type: 'Payment', 'Debit Ledger': 'Godown Electricity Expense', 'Credit Ledger': 'Cash', Amount: 4200, Narration: 'May month electricity bill paid' },
      { 'Voucher No': 'REC-301', Date: '2026-05-20', Type: 'Receipt', 'Debit Ledger': 'ICICI Bank Current A/c', 'Credit Ledger': 'Surya Traders Delhi', Amount: 25000, Narration: 'NEFT received' },
    ],
  };

  const ws = XLSX.utils.json_to_sheet(sampleRows[entityType]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, entityType);
  XLSX.writeFile(wb, `HisabVeda_${entityType}_Import_Template.xlsx`);
}
