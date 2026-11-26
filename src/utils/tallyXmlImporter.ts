import {
  Account,
  AccountCategory,
  AccountGroup,
  AppData,
  CompanyDetails,
  DebitCreditNote,
  ExtraInvoiceLedgerLine,
  InvoiceItem,
  ItemMaster,
  JournalEntryLine,
  PartyMaster,
  PartyType,
  PurchaseInvoice,
  SalesInvoice,
  Voucher,
  VoucherType,
} from '../types';
import { INDIAN_STATE_CODES } from './gstin';
import { canonicalLedgerKey } from './ledgerDeduplicator';
import { normalizeDateISO } from './fiscalYear';

export interface TallyImportOptions {
  skipDuplicates: boolean;
  updateCompanyInfo: boolean;
  includeAccounts: boolean;
  includeParties: boolean;
  includeItems: boolean;
  includeSales: boolean;
  includePurchases: boolean;
  includeVouchers: boolean;
  includeNotes: boolean;
}

export interface TallyAccountOpeningUpdate {
  id: string;
  openingBalance: number;
  balanceType: 'DR' | 'CR';
}

export interface TallyItemStockUpdate {
  itemId: string;
  qtyDelta: number;
  purchasePrice?: number;
  salesPrice?: number;
  openingStock?: number;
  openingStockValue?: number;
  closingStockValue?: number;
  importedClosingQty?: number;
}

export interface TallyPartyUpdate {
  partyId: string;
  gstin: string;
  pan?: string;
  gstCategory?: PartyMaster['gstCategory'];
  state?: string;
  stateCode?: string;
  openingBalance?: number;
  balanceType?: 'DR' | 'CR';
}

export interface TallyParsedResult {
  success: boolean;
  error?: string;
  warnings: string[];
  companyInfo?: Partial<CompanyDetails>;
  accountGroups?: AccountGroup[];
  accounts: Account[];
  parties: PartyMaster[];
  items: ItemMaster[];
  invoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  vouchers: Voucher[];
  debitCreditNotes: DebitCreditNote[];
  accountOpeningUpdates?: TallyAccountOpeningUpdate[];
  itemStockUpdates?: TallyItemStockUpdate[];
  partyUpdates?: TallyPartyUpdate[];
  stats: {
    rawGroups: number;
    rawLedgers: number;
    rawStockItems: number;
    rawVouchers: number;
    skippedCancelledOrOptional: number;
    duplicateAccounts: number;
    duplicateParties: number;
    duplicateItems: number;
    duplicateInvoices: number;
    duplicatePurchases: number;
    duplicateVouchers: number;
    duplicateNotes: number;
    minDate?: string;
    maxDate?: string;
  };
}

export interface TallyImportCommitPayload {
  fileName?: string;
  companyInfo?: Partial<CompanyDetails>;
  accountGroups?: AccountGroup[];
  accounts: Account[];
  parties: PartyMaster[];
  items: ItemMaster[];
  invoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  vouchers: Voucher[];
  debitCreditNotes: DebitCreditNote[];
  accountOpeningUpdates?: TallyAccountOpeningUpdate[];
  itemStockUpdates?: TallyItemStockUpdate[];
  partyUpdates?: TallyPartyUpdate[];
  minDate?: string;
  maxDate?: string;
}

export interface TallyLastImportBatch {
  fileName: string;
  importedAt: string;
  groupIds?: string[];
  accountIds: string[];
  partyIds: string[];
  itemIds: string[];
  invoiceIds: string[];
  purchaseIds: string[];
  voucherIds: string[];
  noteIds: string[];
  previousCompany?: CompanyDetails;
}

export function countTallyImportedRecords(data: AppData): {
  accounts: number;
  parties: number;
  items: number;
  invoices: number;
  purchases: number;
  vouchers: number;
  notes: number;
  total: number;
} {
  const isTal = (id?: string) => Boolean(id && id.includes('_tal_'));
  const accounts = (data.accounts || []).filter((a) => isTal(a.id)).length;
  const parties = (data.parties || []).filter((p) => isTal(p.id)).length;
  const items = (data.items || []).filter((i) => isTal(i.id)).length;
  const invoices = (data.invoices || []).filter((i) => isTal(i.id)).length;
  const purchases = (data.purchaseInvoices || []).filter((p) => isTal(p.id)).length;
  const vouchers = (data.vouchers || []).filter((v) => isTal(v.id)).length;
  const notes = (data.debitCreditNotes || []).filter((n) => isTal(n.id)).length;
  return {
    accounts,
    parties,
    items,
    invoices,
    purchases,
    vouchers,
    notes,
    total: accounts + parties + items + invoices + purchases + vouchers + notes,
  };
}

/**
 * Decodes ArrayBuffer exported by Tally Prime / Tally ERP 9 (handles UTF-16LE, UTF-16BE, UTF-8, BOM)
 * and removes invalid XML characters like &#4; that Tally embeds in addresses/narrations.
 */
export function decodeTallyXmlBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = '';

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = new TextDecoder('utf-16le').decode(bytes.subarray(2));
  } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = new TextDecoder('utf-16be').decode(bytes.subarray(2));
  } else if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = new TextDecoder('utf-8').decode(bytes.subarray(3));
  } else {
    // Heuristic: Tally XML without BOM may still be UTF-16LE if every other byte near start is 0x00
    let nullOdd = 0;
    const sampleLen = Math.min(bytes.length, 200);
    for (let i = 1; i < sampleLen; i += 2) {
      if (bytes[i] === 0) nullOdd++;
    }
    if (sampleLen > 20 && nullOdd > sampleLen * 0.3) {
      text = new TextDecoder('utf-16le').decode(bytes);
    } else {
      text = new TextDecoder('utf-8').decode(bytes);
    }
  }

  return sanitizeTallyXmlString(text);
}

export function sanitizeTallyXmlString(raw: string): string {
  return (raw || '')
    // Remove BOM if remaining
    .replace(/^\uFEFF/, '')
    // Ensure XML prolog encoding matches decoded JS UTF string so DOMParser never trips on UTF-16 prolog
    .replace(/(<\?xml[^>]*encoding\s*=\s*["'])utf-16[^"']*(["'][^>]*\?>)/i, '$1UTF-8$2')
    // Strip invalid numeric XML character references (Tally commonly writes &#4; for newlines)
    .replace(/&#(?:0|[1-8]|1[1-2]|1[4-9]|2[0-9]|3[0-1]);/gi, ' ')
    .replace(/&#x(?:0?[0-8BbCc]|0?[EeFf]|1[0-9A-Fa-f]);/gi, ' ')
    // Strip literal disallowed ASCII control chars (keep \t \n \r)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
    // Replace bare unescaped ampersands (rare malformed tags) carefully while preserving valid entities
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;');
}

function getDirectChildrenByTag(el: Element, tagNameUpper: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (child.tagName.toUpperCase() === tagNameUpper) {
      out.push(child);
    }
  }
  return out;
}

function getFirstChildText(el: Element, tagNames: string[]): string {
  const set = new Set(tagNames.map((t) => t.toUpperCase()));
  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    if (set.has(child.tagName.toUpperCase())) {
      const txt = (child.textContent || '').trim();
      if (txt) return txt;
    }
  }
  return '';
}

function getAllDescendantElements(root: Element, tagNameUpper: string): Element[] {
  const result: Element[] = [];
  const all = root.getElementsByTagName('*');
  for (let i = 0; i < all.length; i++) {
    if (all[i].tagName.toUpperCase() === tagNameUpper) {
      result.push(all[i]);
    }
  }
  return result;
}

function getAttrOrChild(el: Element, attrName: string, childTags: string[]): string {
  const attr = el.getAttribute(attrName) || el.getAttribute(attrName.toLowerCase()) || '';
  if (attr.trim()) return attr.trim();
  return getFirstChildText(el, childTags);
}

/**
 * Converts Tally date (YYYYMMDD or DD-MM-YYYY or YYYY-MM-DD) to YYYY-MM-DD
 */
function parseTallyDate(raw: string): string {
  const s = (raw || '').trim();
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return normalizeDateISO(s) || new Date().toISOString().split('T')[0];
}

/**
 * Parses Tally numbers like "-1,250.50", "(1,250.50)", "₹ 500.00/Pcs", "15.000 Nos (150 Pcs)", "1200 Dr", "1200 Cr"
 */
function parseTallyNumeric(raw: string): { value: number; unitHint: string; explicitDrCr?: 'DR' | 'CR' } {
  let cleaned = (raw || '')
    .replace(/,/g, '')
    .replace(/₹|\b(?:rs\.?|inr)\b/gi, '')
    .replace(/\u2212/g, '-')
    .trim();
  if (!cleaned) return { value: 0, unitHint: '' };

  let explicitDrCr: 'DR' | 'CR' | undefined;
  if (/\bdr\.?$/i.test(cleaned)) {
    explicitDrCr = 'DR';
    cleaned = cleaned.replace(/\bdr\.?$/i, '').trim();
  } else if (/\bcr\.?$/i.test(cleaned)) {
    explicitDrCr = 'CR';
    cleaned = cleaned.replace(/\bcr\.?$/i, '').trim();
  }

  let isNeg = false;
  if (/\(\s*-\s*\)/.test(cleaned)) {
    isNeg = true;
    cleaned = cleaned.replace(/\(\s*-\s*\)/g, ' ').trim();
  } else if (/^\(\s*[-+]?\d+(?:\.\d+)?\s*\)(?:\s|$)/.test(cleaned)) {
    const innerSigned = cleaned.match(/^\(\s*([-+]?\d+(?:\.\d+)?)\s*\)/);
    isNeg = true;
    if (innerSigned) {
      cleaned = cleaned.replace(/^\(\s*[-+]?\d+(?:\.\d+)?\s*\)/, innerSigned[1]).trim();
    }
  }

  // Normalize "- 123.45" -> "-123.45"
  cleaned = cleaned.replace(/^([-+])\s+(\d)/, '$1$2');

  const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/);
  let value = match ? parseFloat(match[0]) : 0;
  if (isNeg && value > 0) value = -value;

  let unitHint = '';
  const withoutAlt = cleaned.replace(/\([^)]*\)/g, '').trim();
  const slashUnit = withoutAlt.match(/\/\s*([A-Za-z][A-Za-z0-9.\-_]*)/);
  if (slashUnit) {
    unitHint = slashUnit[1];
  } else {
    const trailingWord = withoutAlt.replace(/[-+]?\d+(?:\.\d+)?/, '').trim();
    if (trailingWord && /^[A-Za-z]/.test(trailingWord)) {
      unitHint = trailingWord.split(/\s+/)[0];
    }
  }

  return { value: Number.isFinite(value) ? value : 0, unitHint, explicitDrCr };
}

function normalizeNameKey(name: string): string {
  return canonicalLedgerKey(name) || (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
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

function cleanValidTallyGstin(raw?: string): string {
  const clean = (raw || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (!clean || clean === 'URP' || clean === 'UNREGISTERED' || clean === 'NA' || clean === 'NONE') {
    return '';
  }
  return clean;
}

function isValid15Gstin(gstin?: string): boolean {
  const g = cleanValidTallyGstin(gstin);
  return g.length === 15 && /^[0-9]{2}[A-Z0-9]{13}$/.test(g);
}

function mapTallyGstRegType(regTypeRaw: string, gstin: string): PartyMaster['gstCategory'] {
  const reg = (regTypeRaw || '').toLowerCase().trim();
  if (reg.includes('composition')) return 'COMPOSITION';
  if (reg.includes('sez')) return 'SEZ_DEVELOPER';
  if (reg.includes('casual')) return 'CASUAL';
  if (isValid15Gstin(gstin)) return 'REGULAR';
  if (reg.includes('unregistered') || reg.includes('consumer')) return 'UNREGISTERED';
  if (reg.includes('regular')) return 'REGULAR';
  return 'UNREGISTERED';
}

function extractPartyGstRegFromElement(el: Element): {
  gstin: string;
  regTypeRaw: string;
  stateRaw: string;
  gstCategory: PartyMaster['gstCategory'];
} {
  const regLists = [
    ...getAllDescendantElements(el, 'LEDGSTREGDETAILS.LIST'),
    ...getAllDescendantElements(el, 'GSTREGISTRATIONDETAILS.LIST'),
  ];
  const candidates: string[] = [];

  const directPrimary = cleanValidTallyGstin(getFirstChildText(el, ['PARTYGSTIN']));
  if (directPrimary) candidates.push(directPrimary);

  for (let i = regLists.length - 1; i >= 0; i--) {
    const g = cleanValidTallyGstin(
      getFirstChildText(regLists[i], ['GSTIN', 'PARTYGSTIN', 'GSTREGISTRATIONNUMBER'])
    );
    if (g) candidates.push(g);
  }

  const directOther = cleanValidTallyGstin(
    getFirstChildText(el, [
      'GSTIN',
      'CONSIGNEEGSTIN',
      'BUYERGSTIN',
      'SUPPLIERGSTIN',
      'GSTREGISTRATIONNUMBER',
    ])
  );
  if (directOther) candidates.push(directOther);

  for (const tagName of ['PARTYGSTIN', 'CONSIGNEEGSTIN', 'BUYERGSTIN', 'SUPPLIERGSTIN']) {
    const descEls = getAllDescendantElements(el, tagName);
    for (const d of descEls) {
      const g = cleanValidTallyGstin(d.textContent || '');
      if (g) candidates.push(g);
    }
  }

  const gstin = candidates.find((c) => isValid15Gstin(c)) || candidates[0] || '';

  let regTypeRaw = getFirstChildText(el, ['GSTREGISTRATIONTYPE']);
  if (!regTypeRaw) {
    for (let i = regLists.length - 1; i >= 0; i--) {
      const rt = getFirstChildText(regLists[i], ['GSTREGISTRATIONTYPE']);
      if (rt) {
        regTypeRaw = rt;
        break;
      }
    }
  }

  let stateRaw = getFirstChildText(el, [
    'LEDSTATENAME',
    'STATENAME',
    'PLACEOFSUPPLY',
    'CONSIGNEESTATENAME',
  ]);
  if (!stateRaw) {
    for (let i = regLists.length - 1; i >= 0; i--) {
      const st = getFirstChildText(regLists[i], ['STATENAME', 'STATE', 'PLACEOFSUPPLY']);
      if (st) {
        stateRaw = st;
        break;
      }
    }
  }
  if (!stateRaw) {
    const mailingLists = getAllDescendantElements(el, 'LEDMAILINGDETAILS.LIST');
    for (let i = mailingLists.length - 1; i >= 0; i--) {
      const st = getFirstChildText(mailingLists[i], ['STATE', 'STATENAME']);
      if (st) {
        stateRaw = st;
        break;
      }
    }
  }

  const gstCategory = mapTallyGstRegType(regTypeRaw, gstin);
  return { gstin, regTypeRaw, stateRaw, gstCategory };
}

interface TallyGroupMetaNode {
  name: string;
  parent: string;
  natureOfGroup: string;
  affectsGrossProfit: boolean | null;
  isRevenue: boolean | null;
  guid?: string;
}

function cleanTallyLabel(raw: string): string {
  return (raw || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPrimaryTallyParent(parentRaw: string): boolean {
  const low = cleanTallyLabel(parentRaw).toLowerCase();
  return !low || low === 'primary' || low.endsWith(' primary');
}

function inferPrimaryGroupFromTallyNature(node: TallyGroupMetaNode): string {
  const nature = cleanTallyLabel(node.natureOfGroup).toLowerCase();
  const nLow = cleanTallyLabel(node.name).toLowerCase();
  if (nature === 'income' || nature === 'revenues' || node.isRevenue === true) {
    if (nLow.includes('sales')) return 'Sales Accounts';
    return node.affectsGrossProfit === true ? 'Direct Incomes' : 'Indirect Incomes';
  }
  if (nature === 'expenses' || nature === 'expense') {
    if (nLow.includes('purchase')) return 'Purchase Accounts';
    return node.affectsGrossProfit === true ? 'Direct Expenses' : 'Indirect Expenses';
  }
  if (nature === 'assets' || nature === 'asset') {
    if (nLow.includes('fixed')) return 'Fixed Assets';
    if (nLow.includes('cash')) return 'Cash-in-Hand';
    if (nLow.includes('bank')) return 'Bank Accounts';
    if (nLow.includes('debtor')) return 'Sundry Debtors';
    if (nLow.includes('stock')) return 'Stock-in-Hand';
    return node.name || 'Current Assets';
  }
  if (nature === 'liabilities' || nature === 'liability') {
    if (nLow.includes('capital') || nLow.includes('reserve')) return 'Capital Account';
    if (nLow.includes('creditor')) return 'Sundry Creditors';
    if (nLow.includes('dut') || nLow.includes('tax')) return 'Duties & Taxes';
    if (nLow.includes('bank od') || nLow.includes('bank occ') || nLow.includes('overdraft')) return 'Bank OD A/c';
    if (nLow.includes('loan')) return 'Loans (Liability)';
    return node.name || 'Current Liabilities';
  }
  if (nature === 'equity') return 'Capital Account';
  return '';
}

function resolveTallyRootGroup(
  groupName: string,
  groupMetaMap: Map<string, TallyGroupMetaNode>
): string {
  let cur = cleanTallyLabel(groupName);
  const visited = new Set<string>();
  const primarySet = new Set([
    'sundry debtors',
    'sundry creditors',
    'bank accounts',
    'bank od a/c',
    'bank occ a/c',
    'cash-in-hand',
    'cash in hand',
    'duties & taxes',
    'duties and taxes',
    'direct expenses',
    'indirect expenses',
    'direct incomes',
    'indirect incomes',
    'sales accounts',
    'purchase accounts',
    'fixed assets',
    'current assets',
    'current liabilities',
    'capital account',
    'reserves & surplus',
    'loans (liability)',
    'secured loans',
    'unsecured loans',
    'investments',
    'stock-in-hand',
    'stock in hand',
    'deposits (asset)',
    'loans & advances (asset)',
    'provisions',
    'suspense a/c',
    'branch / divisions',
    'misc. expenses (asset)',
    'expenses (direct)',
    'expenses (indirect)',
    'income (direct)',
    'income (indirect)',
  ]);

  let lastKnownNode: TallyGroupMetaNode | undefined;
  let lastCustomName = cur;

  while (cur) {
    const low = cur.toLowerCase();
    const key = normalizeNameKey(cur);
    if (primarySet.has(low)) return cur;
    if (visited.has(key) || visited.has(low)) break;
    visited.add(key);
    visited.add(low);

    const node = groupMetaMap.get(key) || groupMetaMap.get(low);
    if (node) {
      lastKnownNode = node;
      lastCustomName = node.name || cur;
      if (!node.parent || isPrimaryTallyParent(node.parent)) {
        const inferred = inferPrimaryGroupFromTallyNature(node);
        return inferred || node.name || cur;
      }
      cur = cleanTallyLabel(node.parent);
    } else {
      break;
    }
  }

  if (lastKnownNode) {
    const inferred = inferPrimaryGroupFromTallyNature(lastKnownNode);
    if (inferred) return inferred;
  }
  return lastCustomName || cur || '';
}

function mapTallyGroupToAccountMeta(
  rootGroup: string,
  ledgerName: string,
  directParentName?: string
): {
  category: AccountCategory;
  subCategory: string;
  mainGroup: string;
  defaultBalanceType: 'DR' | 'CR';
  isPartyType?: PartyType;
  systemAccountMatch?: string;
  explicitRootResolved?: boolean;
} {
  const g = cleanTallyLabel(rootGroup).toLowerCase();
  const dp = cleanTallyLabel(directParentName || rootGroup).toLowerCase();
  const combinedG = `${g} ${dp}`.trim();
  const n = cleanTallyLabel(ledgerName).toLowerCase();

  if (
    g.includes('stock-in-hand') ||
    g.includes('stock in hand') ||
    n === 'stock-in-hand' ||
    n === 'stock in hand' ||
    n === 'opening stock' ||
    n === 'closing stock'
  ) {
    return { category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', defaultBalanceType: 'DR', systemAccountMatch: 'acc_inventory', explicitRootResolved: true };
  }
  if (g.includes('sundry debtor')) {
    return { category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Sundry Debtors', defaultBalanceType: 'DR', isPartyType: 'CUSTOMER', explicitRootResolved: true };
  }
  if (g.includes('sundry creditor')) {
    return { category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Sundry Creditors', defaultBalanceType: 'CR', isPartyType: 'VENDOR', explicitRootResolved: true };
  }
  if (g.includes('cash-in-hand') || g.includes('cash in hand')) {
    return { category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', defaultBalanceType: 'DR', systemAccountMatch: 'acc_cash', explicitRootResolved: true };
  }
  if (
    g.includes('bank od') ||
    g.includes('bank occ') ||
    g.includes('overdraft') ||
    g.includes('cash credit')
  ) {
    return { category: 'LIABILITY', subCategory: 'Loans & Liabilities', mainGroup: 'Loans & Liabilities', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (g.includes('bank account')) {
    return { category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', defaultBalanceType: 'DR', explicitRootResolved: true };
  }
  if (g.includes('sales account')) {
    const isExactSales = n === 'sales' || n === 'sales account' || n === 'sales a/c';
    return { category: 'REVENUE', subCategory: 'Direct Revenue', mainGroup: 'Direct Incomes', defaultBalanceType: 'CR', systemAccountMatch: isExactSales ? 'acc_sales' : undefined, explicitRootResolved: true };
  }
  if (g.includes('purchase account')) {
    const isExactPurchase = n === 'purchase' || n === 'purchases' || n === 'purchase account' || n === 'purchase a/c';
    return { category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', defaultBalanceType: 'DR', systemAccountMatch: isExactPurchase ? 'acc_cogs' : undefined, explicitRootResolved: true };
  }
  if (g.includes('duties & taxes') || g.includes('duties and taxes')) {
    if ((n.includes('input') || n.includes('itc')) && n.includes('cgst')) return { category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'DR', systemAccountMatch: 'acc_itc_cgst', explicitRootResolved: true };
    if ((n.includes('input') || n.includes('itc')) && (n.includes('sgst') || n.includes('utgst'))) return { category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'DR', systemAccountMatch: 'acc_itc_sgst', explicitRootResolved: true };
    if ((n.includes('input') || n.includes('itc')) && n.includes('igst')) return { category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'DR', systemAccountMatch: 'acc_itc_igst', explicitRootResolved: true };
    if (n.includes('cgst')) return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_gst_cgst', explicitRootResolved: true };
    if (n.includes('sgst') || n.includes('utgst')) return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_gst_sgst', explicitRootResolved: true };
    if (n.includes('igst')) return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_gst_igst', explicitRootResolved: true };
    if (n.includes('tds')) return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_tds_payable', explicitRootResolved: true };
    return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (
    g.includes('indirect income') ||
    g.includes('income (indirect)') ||
    g.includes('other income') ||
    g.includes('non-operating income')
  ) {
    return { category: 'REVENUE', subCategory: 'Indirect Revenue', mainGroup: 'Indirect Incomes', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (/\bdirect income/.test(g) || g.includes('income (direct)')) {
    return { category: 'REVENUE', subCategory: 'Direct Revenue', mainGroup: 'Direct Incomes', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (
    g.includes('indirect expense') ||
    g.includes('expenses (indirect)') ||
    combinedG.includes('administrative') ||
    combinedG.includes('selling') ||
    combinedG.includes('distribution') ||
    combinedG.includes('marketing') ||
    combinedG.includes('financial expense') ||
    combinedG.includes('finance expense') ||
    combinedG.includes('finance cost') ||
    combinedG.includes('depreciation') ||
    combinedG.includes('operating expense') ||
    combinedG.includes('office expense') ||
    combinedG.includes('staff welfare') ||
    combinedG.includes('employee benefit') ||
    combinedG.includes('other expense')
  ) {
    if (n.includes('round') && n.includes('off')) {
      return { category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', defaultBalanceType: 'DR', systemAccountMatch: 'acc_round_off', explicitRootResolved: true };
    }
    return { category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', defaultBalanceType: 'DR', explicitRootResolved: true };
  }
  if (
    /\bdirect expense/.test(g) ||
    g.includes('expenses (direct)') ||
    g.includes('manufacturing') ||
    g.includes('factory expense') ||
    /\bdirect cost\b/.test(g)
  ) {
    return { category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', defaultBalanceType: 'DR', explicitRootResolved: true };
  }
  if (g.includes('fixed asset') || g.includes('property, plant')) {
    return { category: 'ASSET', subCategory: 'Fixed Assets', mainGroup: 'Fixed Assets', defaultBalanceType: 'DR', explicitRootResolved: true };
  }
  if (
    g.includes('capital') ||
    g.includes('reserve') ||
    g.includes('retained') ||
    n === 'profit & loss a/c' ||
    n === 'profit and loss a/c' ||
    n === 'profit & loss' ||
    n === 'profit and loss'
  ) {
    const isReserves = g.includes('reserve') || g.includes('retained') || n.includes('profit & loss') || n.includes('profit and loss');
    return { category: 'EQUITY', subCategory: isReserves ? 'Reserve & Surplus' : 'Capital', mainGroup: isReserves ? 'Reserves & Surplus' : 'Capital Account', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (g.includes('loan') && !g.includes('advance')) {
    return { category: 'LIABILITY', subCategory: 'Loans & Liabilities', mainGroup: 'Loans & Liabilities', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (
    g.includes('current asset') ||
    g.includes('investment') ||
    g.includes('deposit') ||
    g.includes('loans & advances') ||
    g.includes('misc. expenses (asset)')
  ) {
    return { category: 'ASSET', subCategory: 'Current Assets', mainGroup: 'Current Assets', defaultBalanceType: 'DR', explicitRootResolved: true };
  }
  if (
    g.includes('current liabilit') ||
    g.includes('provision') ||
    g.includes('branch / division')
  ) {
    return { category: 'LIABILITY', subCategory: 'Current Liabilities', mainGroup: 'Current Liabilities', defaultBalanceType: 'CR', explicitRootResolved: true };
  }
  if (g.includes('suspense')) {
    return { category: 'LIABILITY', subCategory: 'Suspense', mainGroup: 'Current Liabilities', defaultBalanceType: 'CR', systemAccountMatch: 'acc_suspense', explicitRootResolved: true };
  }

  // Name-based heuristics for DayBook-only XML (where <GROUP> / <PARENT> is missing) or unmapped custom groups
  if (n === 'cash' || n === 'cash-in-hand' || n === 'cash in hand' || n === 'petty cash') {
    return { category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', defaultBalanceType: 'DR', systemAccountMatch: 'acc_cash' };
  }
  if (
    /\bsales?\b/.test(n) &&
    !n.includes('promotion') &&
    !n.includes('incentive') &&
    !n.includes('salary') &&
    !n.includes('commission') &&
    !n.includes('salesman') &&
    !n.includes('expense')
  ) {
    const isExactSales = n === 'sales' || n === 'sales account' || n === 'sales a/c';
    return { category: 'REVENUE', subCategory: 'Direct Revenue', mainGroup: 'Direct Incomes', defaultBalanceType: 'CR', systemAccountMatch: isExactSales ? 'acc_sales' : undefined };
  }
  if (/\bpurchases?\b/.test(n) && !n.includes('tax') && !n.includes('gst')) {
    const isExactPurchase = n === 'purchase' || n === 'purchases' || n === 'purchase account' || n === 'purchase a/c';
    return { category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', defaultBalanceType: 'DR', systemAccountMatch: isExactPurchase ? 'acc_cogs' : undefined };
  }
  if (
    n.includes('interest received') ||
    n.includes('commission received') ||
    n.includes('discount received') ||
    n.includes('rent received') ||
    n.includes('dividend') ||
    n.includes('misc income') ||
    n.includes('miscellaneous income') ||
    n.includes('other income') ||
    n.includes('scrap sale') ||
    n.includes('indirect income')
  ) {
    return { category: 'REVENUE', subCategory: 'Indirect Revenue', mainGroup: 'Indirect Incomes', defaultBalanceType: 'CR' };
  }
  if (
    n.includes('freight inward') ||
    n.includes('carriage inward') ||
    n.includes('cartage') ||
    n.includes('coolie') ||
    n.includes('hamali') ||
    n.includes('loading') ||
    n.includes('unloading') ||
    n.includes('custom duty') ||
    n.includes('clearing') ||
    n.includes('octroi') ||
    n.includes('job work') ||
    n.includes('manufacturing') ||
    n.includes('power & fuel') ||
    n.includes('power and fuel') ||
    n.includes('packing material') ||
    /\bdirect\s+expense/.test(n)
  ) {
    return { category: 'EXPENSE', subCategory: 'Direct Expenses', mainGroup: 'Direct Expenses', defaultBalanceType: 'DR' };
  }
  if ((n.includes('input') || n.includes('itc')) && n.includes('cgst')) {
    return { category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'DR', systemAccountMatch: 'acc_itc_cgst' };
  }
  if ((n.includes('input') || n.includes('itc')) && (n.includes('sgst') || n.includes('utgst'))) {
    return { category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'DR', systemAccountMatch: 'acc_itc_sgst' };
  }
  if ((n.includes('input') || n.includes('itc')) && n.includes('igst')) {
    return { category: 'ASSET', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'DR', systemAccountMatch: 'acc_itc_igst' };
  }
  if (n.includes('cgst') && !n.includes('late fee') && !n.includes('interest') && !n.includes('penalty')) {
    return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_gst_cgst' };
  }
  if ((n.includes('sgst') || n.includes('utgst')) && !n.includes('late fee') && !n.includes('interest') && !n.includes('penalty')) {
    return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_gst_sgst' };
  }
  if (n.includes('igst') && !n.includes('late fee') && !n.includes('interest') && !n.includes('penalty')) {
    return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_gst_igst' };
  }
  if (n.includes('tds') && !n.includes('interest') && !n.includes('late fee') && !n.includes('penalty')) {
    return { category: 'LIABILITY', subCategory: 'Duties & Taxes', mainGroup: 'Duties & Taxes', defaultBalanceType: 'CR', systemAccountMatch: 'acc_tds_payable' };
  }
  if (n.includes('round') && n.includes('off')) {
    return { category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', defaultBalanceType: 'DR', systemAccountMatch: 'acc_round_off' };
  }
  if (
    (n.includes('bank') && !n.includes('charges') && !n.includes('interest') && !n.includes('commission') && !n.includes('fee')) ||
    n.includes('hdfc') ||
    n.includes('sbi') ||
    n.includes('icici') ||
    n.includes('axis') ||
    n.includes('kotak') ||
    n.includes('current a/c') ||
    n.includes('savings a/c')
  ) {
    if (n.includes('overdraft') || n.includes('od a/c') || n.includes('cc a/c') || n.includes('cash credit')) {
      return { category: 'LIABILITY', subCategory: 'Loans & Liabilities', mainGroup: 'Loans & Liabilities', defaultBalanceType: 'CR' };
    }
    return { category: 'ASSET', subCategory: 'Cash & Bank', mainGroup: 'Cash & Bank Accounts', defaultBalanceType: 'DR' };
  }

  return { category: 'EXPENSE', subCategory: 'Indirect Expenses', mainGroup: 'Indirect Expenses', defaultBalanceType: 'DR' };
}

function classifyTaxLedger(name: string): 'CGST' | 'SGST' | 'IGST' | 'ROUNDOFF' | 'DISCOUNT' | null {
  const n = (name || '').toLowerCase().trim();
  if (n.includes('cgst')) return 'CGST';
  if (n.includes('sgst') || n.includes('utgst')) return 'SGST';
  if (n.includes('igst')) return 'IGST';
  if (n.includes('round off') || n.includes('round-off') || n === 'roundoff' || n === 'rounding off') return 'ROUNDOFF';
  if (
    n.includes('discount') ||
    n.includes('rebate') ||
    /\bdisc\b/.test(n) ||
    n.includes('scheme')
  ) {
    return 'DISCOUNT';
  }
  return null;
}

export function parseTallyXmlString(
  rawXmlText: string,
  existingData: AppData,
  options: TallyImportOptions
): TallyParsedResult {
  const warnings: string[] = [];
  const emptyStats = {
    rawGroups: 0,
    rawLedgers: 0,
    rawStockItems: 0,
    rawVouchers: 0,
    skippedCancelledOrOptional: 0,
    duplicateAccounts: 0,
    duplicateParties: 0,
    duplicateItems: 0,
    duplicateInvoices: 0,
    duplicatePurchases: 0,
    duplicateVouchers: 0,
    duplicateNotes: 0,
  };

  if (!rawXmlText || !rawXmlText.trim()) {
    return {
      success: false,
      error: 'Uploaded XML file is empty.',
      warnings,
      accounts: [],
      parties: [],
      items: [],
      invoices: [],
      purchaseInvoices: [],
      vouchers: [],
      debitCreditNotes: [],
      stats: emptyStats,
    };
  }

  const sanitized = sanitizeTallyXmlString(rawXmlText);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, 'text/xml');
  const parserErr = doc.getElementsByTagName('parsererror')[0];
  if (parserErr || !doc.documentElement) {
    return {
      success: false,
      error: `Invalid XML structure: ${parserErr?.textContent?.slice(0, 180) || 'Unable to parse Tally XML envelope.'}`,
      warnings,
      accounts: [],
      parties: [],
      items: [],
      invoices: [],
      purchaseInvoices: [],
      vouchers: [],
      debitCreditNotes: [],
      stats: emptyStats,
    };
  }

  const root = doc.documentElement;
  const uidBase = Date.now().toString(36);
  let seq = 1;
  const nextId = (prefix: string) => `${prefix}_tal_${uidBase}_${seq++}`;

  // Helper to read first non-empty descendant tag value from a list of elements
  const getDeepTagText = (containers: Element[], tagNames: string[]): string => {
    for (const c of containers) {
      const direct = getFirstChildText(c, tagNames);
      if (direct) return direct;
      for (const tag of tagNames) {
        const matches = getAllDescendantElements(c, tag.toUpperCase());
        for (const m of matches) {
          const val = (m.textContent || '').trim();
          if (val) return val;
        }
      }
    }
    return '';
  };

  // 1. Extract Company Profile from <COMPANY>, <STATICVARIABLES>, <TAXUNIT.LIST>, <GSTREGISTRATIONDETAILS.LIST> & Voucher header tags
  let companyInfo: Partial<CompanyDetails> | undefined;
  const companyEls = getAllDescendantElements(root, 'COMPANY');
  const staticVarEls = getAllDescendantElements(root, 'STATICVARIABLES');
  const requestDescEls = getAllDescendantElements(root, 'REQUESTDESC');
  const voucherPreviewEls = getAllDescendantElements(root, 'VOUCHER');

  const cmpContainers: Element[] = [
    ...companyEls,
    ...staticVarEls,
    ...requestDescEls,
  ];

  const primaryCmpEl = companyEls[0];
  let cmpName =
    (primaryCmpEl ? getAttrOrChild(primaryCmpEl, 'NAME', ['MAILINGNAME', 'NAME', 'COMPANYNAME', 'BASICCOMPANYNAME']) : '') ||
    getDeepTagText(staticVarEls, ['SVCURRENTCOMPANY', 'SVCOMPANY', 'COMPANYNAME', 'BASICCOMPANYNAME', 'MAILINGNAME']) ||
    getDeepTagText(requestDescEls, ['SVCURRENTCOMPANY', 'COMPANYNAME']) ||
    getDeepTagText([root], ['SVCURRENTCOMPANY', 'BASICCOMPANYNAME']);
  cmpName = cmpName.replace(/\s+/g, ' ').trim();

  // Check GSTIN in COMPANY descendants (e.g., GSTREGISTRATIONDETAILS.LIST -> GSTIN, TAXUNIT.LIST -> TAXREGISTRATIONNUMBER), STATICVARIABLES, or VOUCHER (<CMPGSTIN>)
  const gstCandidatesRaw: string[] = [];
  const gstTagNames = [
    'GSTIN',
    'COMPANYGSTIN',
    'CMPGSTIN',
    'GSTREGISTRATIONNUMBER',
    'TAXREGISTRATIONNUMBER',
    'GSTINNO',
    'GSTNO',
    'PARTYGSTIN',
  ];
  cmpContainers.forEach((c) => {
    gstTagNames.forEach((tag) => {
      getAllDescendantElements(c, tag).forEach((el) => {
        const val = (el.textContent || '').trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
        if (val) gstCandidatesRaw.push(val);
      });
    });
  });

  // Fallback: inspect vouchers' <CMPGSTIN> (Tally Prime DayBook exports almost always emit <CMPGSTIN> per voucher!)
  if (gstCandidatesRaw.length === 0) {
    for (let i = 0; i < Math.min(voucherPreviewEls.length, 30); i++) {
      const vGstin = getFirstChildText(voucherPreviewEls[i], ['CMPGSTIN', 'COMPANYGSTIN', 'SELLER_GSTIN'])
        .toUpperCase()
        .replace(/[^0-9A-Z]/g, '');
      if (/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}$/.test(vGstin)) {
        gstCandidatesRaw.push(vGstin);
        break;
      }
    }
  }

  const valid15Gstin = gstCandidatesRaw.find((g) => /^[0-9]{2}[A-Z0-9]{13}$/.test(g));
  const gstin = valid15Gstin || gstCandidatesRaw[0] || '';

  const panRaw =
    getDeepTagText(cmpContainers, ['INCOMETAXNUMBER', 'PANNUMBER', 'PAN', 'ITPAN'])
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '') ||
    (gstin.length >= 12 ? gstin.slice(2, 12) : '');

  const stateRaw =
    getDeepTagText(cmpContainers, ['STATENAME', 'CMPSTATE', 'LEDSTATENAME', 'STATE']) ||
    (voucherPreviewEls.length > 0 ? getFirstChildText(voucherPreviewEls[0], ['CMPSTATE']) : '');

  const hasExplicitStateOrGstin = Boolean(stateRaw || (gstin && gstin.length >= 2));
  const { state, stateCode } = hasExplicitStateOrGstin
    ? findStateFromTextOrGstin(stateRaw, gstin)
    : { state: '', stateCode: '' };

  // Collect Company Address lines strictly from <COMPANY> / <STATICVARIABLES> (never pull party ledger addresses!)
  const addrParts: string[] = [];
  const addrSeen = new Set<string>();
  cmpContainers.forEach((c) => {
    ['ADDRESS', 'BASICCOMPANYADDRESS', 'ADDR1', 'ADDR2', 'ADDR3'].forEach((tag) => {
      getAllDescendantElements(c, tag).forEach((node) => {
        const line = (node.textContent || '').trim();
        if (line && !addrSeen.has(line.toLowerCase())) {
          addrSeen.add(line.toLowerCase());
          addrParts.push(line);
        }
      });
    });
  });
  const pincode = getDeepTagText(cmpContainers, ['PINCODE', 'PIN', 'POSTALCODE']);
  if (pincode && !addrParts.some((a) => a.includes(pincode))) {
    addrParts.push(`PIN: ${pincode}`);
  }
  const address = addrParts.join(', ');

  const email = getDeepTagText(cmpContainers, ['EMAIL', 'EMAILID', 'COMPANYEMAIL']);
  const phone = getDeepTagText(cmpContainers, ['PHONENUMBER', 'MOBILENO', 'TELEPHONENO', 'MOBILE', 'PHONE', 'CONTACTNO']);
  const startingFrom = getDeepTagText(cmpContainers, ['STARTINGFROM', 'FINYEARFROM', 'SVFROMDATE']);
  const booksFrom = getDeepTagText(cmpContainers, ['BOOKSFROM', 'BOOKBEGINFROM']);

  if (cmpName || gstin || panRaw || address || email || phone || (state && stateCode)) {
    companyInfo = {
      ...(cmpName ? { name: cmpName } : {}),
      ...(gstin ? { gstin } : {}),
      ...(panRaw ? { pan: panRaw } : {}),
      ...(address ? { address } : {}),
      ...(pincode ? { pincode } : {}),
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
      ...(state && stateCode ? { state, stateCode } : {}),
      ...(startingFrom ? { financialYearStart: parseTallyDate(startingFrom) } : {}),
      ...(booksFrom ? { booksBeginningFrom: parseTallyDate(booksFrom) } : {}),
    };
  }

  // 2. Parse <GROUP> elements and <STOCKGROUP> hierarchy (for Account groups + Item HSN/GST inheritance)
  const groupMetaMap = new Map<string, TallyGroupMetaNode>();
  const groupEls = getAllDescendantElements(root, 'GROUP');
  groupEls.forEach((grpEl) => {
    const isDelAttr = (grpEl.getAttribute('ISDELETED') || '').toLowerCase() === 'yes';
    const isDelChild = getFirstChildText(grpEl, ['ISDELETED']).toLowerCase() === 'yes';
    if (isDelAttr || isDelChild) return;

    const langNameNode = getAllDescendantElements(grpEl, 'LANGUAGENAME.LIST')[0];
    const langName = langNameNode ? getFirstChildText(langNameNode, ['NAME']) : '';
    const rawName = getAttrOrChild(grpEl, 'NAME', ['NAME']) || langName;
    const name = cleanTallyLabel(rawName);
    if (!name) return;

    const parent = cleanTallyLabel(getFirstChildText(grpEl, ['PARENT']));
    const natureOfGroup = cleanTallyLabel(getFirstChildText(grpEl, ['NATUREOFGROUP', 'BASICGROUPIS'])).toLowerCase();
    const affectsGpRaw = cleanTallyLabel(getFirstChildText(grpEl, ['AFFECTSGROSSPROFIT'])).toLowerCase();
    const isRevRaw = cleanTallyLabel(getFirstChildText(grpEl, ['ISREVENUE'])).toLowerCase();
    const guid = getFirstChildText(grpEl, ['GUID']).trim() || undefined;

    const node: TallyGroupMetaNode = {
      name,
      parent,
      natureOfGroup,
      affectsGrossProfit: affectsGpRaw === 'yes' ? true : affectsGpRaw === 'no' ? false : null,
      isRevenue: isRevRaw === 'yes' ? true : isRevRaw === 'no' ? false : null,
      guid,
    };
    groupMetaMap.set(normalizeNameKey(name), node);
    groupMetaMap.set(name.toLowerCase(), node);
  });

  // Build persistent AccountGroup[] tree preserving Tally parent-child nesting across custom groups
  const existingGroupByKey = new Map<string, AccountGroup>();
  const existingGroupCodes = new Set<string>();
  (existingData.accountGroups || []).forEach((g) => {
    existingGroupByKey.set(normalizeNameKey(g.name), g);
    existingGroupByKey.set(cleanTallyLabel(g.name).toLowerCase(), g);
    if (g.code) existingGroupCodes.add(g.code.trim());
  });
  const importedAccountGroups: AccountGroup[] = [];
  const importedGroupByKey = new Map<string, AccountGroup>();
  let nextGrpCode = 7100;
  const allocGrpCode = () => {
    while (existingGroupCodes.has(String(nextGrpCode))) nextGrpCode++;
    const c = String(nextGrpCode++);
    existingGroupCodes.add(c);
    return c;
  };
  const seenGroupNames = new Set<string>();
  groupMetaMap.forEach((node) => {
    const key = normalizeNameKey(node.name);
    if (seenGroupNames.has(key)) return;
    seenGroupNames.add(key);
    const existingGrp = existingGroupByKey.get(key) || existingGroupByKey.get(node.name.toLowerCase());
    if (existingGrp) {
      importedGroupByKey.set(key, existingGrp);
      return;
    }
    const rootG = resolveTallyRootGroup(node.name, groupMetaMap);
    const meta = mapTallyGroupToAccountMeta(rootG, node.name, node.parent);
    const natLow = node.natureOfGroup;
    const mappedNature: AccountGroup['nature'] =
      natLow === 'income' || natLow === 'revenues' || node.isRevenue === true
        ? 'INCOME'
        : natLow === 'expenses' || natLow === 'expense'
        ? 'EXPENSE'
        : natLow === 'assets' || natLow === 'asset'
        ? 'ASSET'
        : natLow === 'liabilities' || natLow === 'liability' || natLow === 'equity'
        ? 'LIABILITY'
        : undefined;
    const grpObj: AccountGroup = {
      id: nextId('grp'),
      code: allocGrpCode(),
      name: node.name,
      category: meta.category,
      ...(mappedNature ? { nature: mappedNature } : {}),
      ...(node.affectsGrossProfit !== null ? { affectsGrossProfit: node.affectsGrossProfit } : {}),
      parentGroupName: node.parent && !isPrimaryTallyParent(node.parent) ? node.parent : undefined,
      isSystem: false,
    };
    importedAccountGroups.push(grpObj);
    importedGroupByKey.set(key, grpObj);
  });
  // Link parentGroupId across imported + existing AccountGroups cleanly
  importedAccountGroups.forEach((grp) => {
    if (!grp.parentGroupName) return;
    const pk = normalizeNameKey(grp.parentGroupName);
    const parentGrp = importedGroupByKey.get(pk) || existingGroupByKey.get(pk);
    if (parentGrp && parentGrp.id !== grp.id) {
      grp.parentGroupId = parentGrp.id;
    }
  });

  // Helper to extract HSN Code & total GST Rate from an XML element (<STOCKGROUP>, <STOCKITEM>, or <LEDGER>)
  const extractGstAndHsnFromEl = (el: Element): { hsn: string; taxRate: number } => {
    let hsn = getFirstChildText(el, ['HSNCODE']);
    if (!hsn) {
      const hsnEls = getAllDescendantElements(el, 'HSNCODE');
      for (const he of hsnEls) {
        const txt = (he.textContent || '').trim();
        if (txt) {
          hsn = txt;
          break;
        }
      }
    }
    let taxRate = 0;
    const rateDetailEls = getAllDescendantElements(el, 'RATEDETAILS.LIST');
    if (rateDetailEls.length > 0) {
      let igst = 0;
      let cgstSgstSum = 0;
      rateDetailEls.forEach((rd) => {
        const head = getFirstChildText(rd, ['GSTRATEDUTYHEAD']).toLowerCase();
        const r = parseFloat(getFirstChildText(rd, ['GSTRATE'])) || 0;
        if (head.includes('integrated') || head.includes('igst')) igst = r;
        else if (head.includes('central') || head.includes('state') || head.includes('cgst') || head.includes('sgst')) {
          cgstSgstSum += r;
        }
      });
      if (igst > 0) taxRate = igst;
      else if (cgstSgstSum > 0) taxRate = cgstSgstSum;
    }
    return { hsn, taxRate };
  };

  const stockGroupMap = new Map<string, { parent: string; hsn: string; taxRate: number }>();
  const stockGroupEls = getAllDescendantElements(root, 'STOCKGROUP');
  stockGroupEls.forEach((sgEl) => {
    const name = getAttrOrChild(sgEl, 'NAME', ['NAME']);
    if (!name) return;
    const parent = getFirstChildText(sgEl, ['PARENT']).trim();
    const { hsn, taxRate } = extractGstAndHsnFromEl(sgEl);
    stockGroupMap.set(normalizeNameKey(name), { parent, hsn, taxRate });
  });

  const resolveStockGroupGstHierarchy = (groupName: string): { hsn: string; taxRate: number } => {
    let cur = normalizeNameKey(groupName);
    const visited = new Set<string>();
    let hsn = '';
    let taxRate = 0;
    while (cur && !visited.has(cur)) {
      visited.add(cur);
      const node = stockGroupMap.get(cur);
      if (!node) break;
      if (!hsn && node.hsn) hsn = node.hsn;
      if (taxRate <= 0 && node.taxRate > 0) taxRate = node.taxRate;
      if (hsn && taxRate > 0) break;
      cur = normalizeNameKey(node.parent);
    }
    return { hsn, taxRate };
  };

  // Lookup maps across existing + newly imported masters (GUID first, exact Name second)
  const existingAccountByKey = new Map<string, Account>();
  const existingAccountByGuid = new Map<string, Account>();
  const existingAccountCodes = new Set<string>();
  (existingData.accounts || []).forEach((a) => {
    existingAccountByKey.set(normalizeNameKey(a.name), a);
    if (a.externalGuid) existingAccountByGuid.set(a.externalGuid.trim(), a);
    if (a.code) existingAccountCodes.add(a.code.trim());
  });

  const existingPartyByKey = new Map<string, PartyMaster>();
  const existingPartyByGuid = new Map<string, PartyMaster>();
  const existingPartyByGstin = new Map<string, PartyMaster>();
  (existingData.parties || []).forEach((p) => {
    existingPartyByKey.set(normalizeNameKey(p.name), p);
    if (p.externalGuid) existingPartyByGuid.set(p.externalGuid.trim(), p);
    if (p.gstin && p.gstin.length >= 15) existingPartyByGstin.set(p.gstin.toUpperCase().trim(), p);
  });

  const existingItemByKey = new Map<string, ItemMaster>();
  const existingItemByGuid = new Map<string, ItemMaster>();
  (existingData.items || []).forEach((it) => {
    existingItemByKey.set(normalizeNameKey(it.name), it);
    if (it.externalGuid) existingItemByGuid.set(it.externalGuid.trim(), it);
  });

  const importedAccounts: Account[] = [];
  const importedAccountByKey = new Map<string, Account>();
  const importedAccountByGuid = new Map<string, Account>();
  const importedParties: PartyMaster[] = [];
  const importedPartyByKey = new Map<string, PartyMaster>();
  const importedPartyByGuid = new Map<string, PartyMaster>();
  const importedPartyByGstin = new Map<string, PartyMaster>();
  const importedPartyIds = new Set<string>();
  const ledgerGroupByKey = new Map<string, string>();
  const ledgerTaxByKey = new Map<string, { hsn: string; taxRate: number }>();

  let nextAccCode = 6100;
  const allocateAccountCode = () => {
    while (existingAccountCodes.has(String(nextAccCode))) nextAccCode++;
    const code = String(nextAccCode);
    existingAccountCodes.add(code);
    nextAccCode++;
    return code;
  };

  // 3. Parse <LEDGER> elements
  const ledgerEls = getAllDescendantElements(root, 'LEDGER');
  let duplicateAccounts = 0;
  let duplicateParties = 0;
  const accountOpeningUpdateMap = new Map<string, TallyAccountOpeningUpdate>();
  const partyUpdateMap = new Map<string, TallyPartyUpdate>();
  const partyGstOverlayById = new Map<
    string,
    { gstin: string; gstCategory: PartyMaster['gstCategory']; state: string; stateCode: string }
  >();
  const seenXmlLedgerKeys = new Set<string>();
  let addedDebtorOpeningSignedDr = 0;
  let addedCreditorOpeningSignedDr = 0;

  const accumulateAccountOpeningUpdate = (accId: string, baseSignedDr: number, addSignedDr: number) => {
    const prevUpd = accountOpeningUpdateMap.get(accId);
    const curSignedDr = prevUpd
      ? prevUpd.balanceType === 'DR'
        ? prevUpd.openingBalance
        : -prevUpd.openingBalance
      : baseSignedDr;
    const nextSignedDr = Math.round((curSignedDr + addSignedDr) * 100) / 100;
    accountOpeningUpdateMap.set(accId, {
      id: accId,
      openingBalance: Math.abs(nextSignedDr),
      balanceType: nextSignedDr >= 0 ? 'DR' : 'CR',
    });
  };

  ledgerEls.forEach((ledEl) => {
    const isDelAttr = (ledEl.getAttribute('ISDELETED') || '').toLowerCase() === 'yes';
    const isDelChild = getFirstChildText(ledEl, ['ISDELETED']).toLowerCase() === 'yes';
    if (isDelAttr || isDelChild) return;

    const name = cleanTallyLabel(getAttrOrChild(ledEl, 'NAME', ['NAME', 'MAILINGNAME']));
    if (!name) return;
    const ledGuid = getFirstChildText(ledEl, ['GUID']).trim();

    const parentGroupRaw = cleanTallyLabel(getFirstChildText(ledEl, ['PARENT']));
    const directParentKey = normalizeNameKey(parentGroupRaw);
    const parentGrpObj =
      importedGroupByKey.get(directParentKey) ||
      existingGroupByKey.get(directParentKey) ||
      existingGroupByKey.get(parentGroupRaw.toLowerCase());
    const rootGroup = resolveTallyRootGroup(parentGroupRaw, groupMetaMap);
    const key = normalizeNameKey(name);
    ledgerGroupByKey.set(key, rootGroup || parentGroupRaw);
    const ledTaxMeta = extractGstAndHsnFromEl(ledEl);
    if (ledTaxMeta.hsn || ledTaxMeta.taxRate > 0) {
      ledgerTaxByKey.set(key, ledTaxMeta);
    }

    const meta = mapTallyGroupToAccountMeta(rootGroup, name, parentGroupRaw);

    const opRaw = getFirstChildText(ledEl, ['OPENINGBALANCE']);
    const opParsed = parseTallyNumeric(opRaw);
    const openingAmount = Math.round(Math.abs(opParsed.value) * 100) / 100;
    // In ERP XML, negative OPENINGBALANCE = Debit, positive = Credit
    const openingBalType: 'DR' | 'CR' = opParsed.explicitDrCr
      ? opParsed.explicitDrCr
      : opParsed.value < 0
      ? 'DR'
      : opParsed.value > 0
      ? 'CR'
      : meta.defaultBalanceType;
    const signedOpeningDr = openingBalType === 'DR' ? openingAmount : -openingAmount;

    // Extract contact / GST metadata (including nested <LEDGSTREGDETAILS.LIST>)
    const gstMeta = extractPartyGstRegFromElement(ledEl);
    const gstin = gstMeta.gstin;
    const pan =
      getFirstChildText(ledEl, ['INCOMETAXNUMBER', 'PANNUMBER']).toUpperCase() ||
      (gstin.length >= 12 ? gstin.slice(2, 12) : '');
    const stateRaw = getFirstChildText(ledEl, ['LEDSTATENAME', 'STATENAME']) || gstMeta.stateRaw;
    const { state, stateCode } = findStateFromTextOrGstin(stateRaw, gstin);
    const pincode = getFirstChildText(ledEl, ['PINCODE']);
    const phone = getFirstChildText(ledEl, ['LEDGERMOBILE', 'LEDGERPHONE', 'PHONENUMBER', 'MOBILENO']);
    const email = getFirstChildText(ledEl, ['EMAIL']);
    const addrNodes = getAllDescendantElements(ledEl, 'ADDRESS');
    const address = addrNodes.map((n) => (n.textContent || '').trim()).filter(Boolean).join(', ');
    const gstCategory = gstMeta.gstCategory;

    // If Sundry Debtor / Creditor -> create PartyMaster AND accumulate control account opening balance
    if (meta.isPartyType) {
      const dupParty =
        (ledGuid ? existingPartyByGuid.get(ledGuid) || importedPartyByGuid.get(ledGuid) : undefined) ||
        existingPartyByKey.get(key) ||
        importedPartyByKey.get(key) ||
        (gstin.length >= 15
          ? existingPartyByGstin.get(gstin) || importedPartyByGstin.get(gstin)
          : undefined);

      if (dupParty && options.skipDuplicates) {
        const curGstin = cleanValidTallyGstin(
          partyGstOverlayById.get(dupParty.id)?.gstin ?? dupParty.gstin
        );
        const existingUpd = partyUpdateMap.get(dupParty.id);
        const nextUpd: TallyPartyUpdate = existingUpd || {
          partyId: dupParty.id,
          gstin: dupParty.gstin || '',
        };
        let hasUpd = false;
        if (isValid15Gstin(gstin) && (!isValid15Gstin(curGstin) || dupParty.gstCategory === 'UNREGISTERED')) {
          if (importedPartyIds.has(dupParty.id)) {
            dupParty.gstin = gstin;
            if (!dupParty.pan && pan) dupParty.pan = pan;
            dupParty.gstCategory = gstCategory;
            if (state) dupParty.state = state;
            if (stateCode) dupParty.stateCode = stateCode;
            importedPartyByGstin.set(gstin, dupParty);
          } else {
            partyGstOverlayById.set(dupParty.id, {
              gstin,
              gstCategory,
              state: state || dupParty.state,
              stateCode: stateCode || dupParty.stateCode,
            });
            nextUpd.gstin = gstin;
            nextUpd.pan = dupParty.pan || pan;
            nextUpd.gstCategory = gstCategory;
            nextUpd.state = state || dupParty.state;
            nextUpd.stateCode = stateCode || dupParty.stateCode;
            hasUpd = true;
            existingPartyByGstin.set(gstin, dupParty);
          }
        }
        if (
          !importedPartyIds.has(dupParty.id) &&
          openingAmount > 0 &&
          (dupParty.openingBalance || 0) === 0 &&
          !seenXmlLedgerKeys.has(key)
        ) {
          nextUpd.openingBalance = openingAmount;
          nextUpd.balanceType = openingBalType;
          hasUpd = true;
          if (meta.isPartyType === 'CUSTOMER') addedDebtorOpeningSignedDr += signedOpeningDr;
          else addedCreditorOpeningSignedDr += signedOpeningDr;
        }
        if (hasUpd) partyUpdateMap.set(dupParty.id, nextUpd);
        seenXmlLedgerKeys.add(key);
        duplicateParties++;
        return;
      }

      if (openingAmount > 0) {
        if (meta.isPartyType === 'CUSTOMER') addedDebtorOpeningSignedDr += signedOpeningDr;
        else addedCreditorOpeningSignedDr += signedOpeningDr;
      }
      seenXmlLedgerKeys.add(key);

      const partyObj: PartyMaster = {
        id: nextId('pty'),
        code: `${meta.isPartyType === 'CUSTOMER' ? 'CUST' : 'VEND'}-${String(importedParties.length + 101)}`,
        name,
        type: meta.isPartyType,
        gstin: gstin || '',
        pan: pan || '',
        email: email || '',
        phone: phone || '',
        address: address || '',
        ...(pincode ? { pincode } : {}),
        state,
        stateCode,
        creditLimit: 500000,
        openingBalance: openingAmount,
        balanceType: openingBalType,
        gstCategory,
        ...(ledGuid ? { externalGuid: ledGuid } : {}),
      };
      importedParties.push(partyObj);
      importedPartyIds.add(partyObj.id);
      importedPartyByKey.set(key, partyObj);
      if (ledGuid) importedPartyByGuid.set(ledGuid, partyObj);
      if (gstin.length >= 15) importedPartyByGstin.set(gstin, partyObj);
      return;
    }

    // Standard Accounting Ledger -> check system/existing account
    const existingSys = meta.systemAccountMatch
      ? (existingData.accounts || []).find((a) => a.id === meta.systemAccountMatch)
      : undefined;
    const dupAcc =
      existingSys ||
      (ledGuid ? existingAccountByGuid.get(ledGuid) || importedAccountByGuid.get(ledGuid) : undefined) ||
      existingAccountByKey.get(key) ||
      importedAccountByKey.get(key);

    // Always map Stock-in-Hand / Opening Stock to system acc_inventory instead of creating duplicates
    if (meta.systemAccountMatch === 'acc_inventory' && existingSys) {
      if (openingAmount > 0 && !seenXmlLedgerKeys.has(key)) {
        const baseDr =
          existingSys.balanceType === 'DR'
            ? (existingSys.openingBalance || 0)
            : -(existingSys.openingBalance || 0);
        // Replace if existing was 0 or accumulate if multiple Stock-in-Hand ledgers exist in XML
        accumulateAccountOpeningUpdate(existingSys.id, baseDr === 0 ? 0 : baseDr, signedOpeningDr);
      }
      seenXmlLedgerKeys.add(key);
      duplicateAccounts++;
      return;
    }

    if (dupAcc && options.skipDuplicates) {
      if (
        openingAmount > 0 &&
        (dupAcc.openingBalance || 0) === 0 &&
        !importedAccountByKey.has(key) &&
        !seenXmlLedgerKeys.has(key)
      ) {
        accumulateAccountOpeningUpdate(dupAcc.id, 0, signedOpeningDr);
      }
      seenXmlLedgerKeys.add(key);
      duplicateAccounts++;
      return;
    }

    seenXmlLedgerKeys.add(key);
    const newAcc: Account = {
      id: nextId('acc'),
      code: allocateAccountCode(),
      name,
      category: meta.category,
      subCategory: meta.subCategory,
      mainGroup: parentGroupRaw && !isPrimaryTallyParent(parentGroupRaw) ? parentGroupRaw : meta.mainGroup,
      ...(parentGrpObj ? { parentGroupId: parentGrpObj.id } : {}),
      openingBalance: openingAmount,
      balanceType: openingBalType,
      isSystem: false,
      ...(ledGuid ? { externalGuid: ledGuid } : {}),
    };
    importedAccounts.push(newAcc);
    importedAccountByKey.set(key, newAcc);
    if (ledGuid) importedAccountByGuid.set(ledGuid, newAcc);
  });

  // Sync Sundry Debtors & Creditors party opening balances into control accounts acc_debtors / acc_creditors
  if (Math.abs(addedDebtorOpeningSignedDr) > 0.001) {
    const existingDebtors = (existingData.accounts || []).find((a) => a.id === 'acc_debtors');
    if (existingDebtors) {
      const baseDr =
        existingDebtors.balanceType === 'DR'
          ? (existingDebtors.openingBalance || 0)
          : -(existingDebtors.openingBalance || 0);
      accumulateAccountOpeningUpdate('acc_debtors', baseDr, addedDebtorOpeningSignedDr);
    } else {
      const newDebtorsAcc: Account = {
        id: 'acc_debtors',
        code: '1100',
        name: 'Sundry Debtors (Receivables)',
        category: 'ASSET',
        subCategory: 'Current Assets',
        mainGroup: 'Sundry Debtors',
        openingBalance: Math.round(Math.abs(addedDebtorOpeningSignedDr) * 100) / 100,
        balanceType: addedDebtorOpeningSignedDr >= 0 ? 'DR' : 'CR',
        isSystem: true,
      };
      importedAccounts.push(newDebtorsAcc);
      importedAccountByKey.set(normalizeNameKey(newDebtorsAcc.name), newDebtorsAcc);
    }
  }
  if (Math.abs(addedCreditorOpeningSignedDr) > 0.001) {
    const existingCreditors = (existingData.accounts || []).find((a) => a.id === 'acc_creditors');
    if (existingCreditors) {
      const baseDr =
        existingCreditors.balanceType === 'DR'
          ? (existingCreditors.openingBalance || 0)
          : -(existingCreditors.openingBalance || 0);
      accumulateAccountOpeningUpdate('acc_creditors', baseDr, addedCreditorOpeningSignedDr);
    } else {
      const newCreditorsAcc: Account = {
        id: 'acc_creditors',
        code: '2010',
        name: 'Sundry Creditors (Payables)',
        category: 'LIABILITY',
        subCategory: 'Current Liabilities',
        mainGroup: 'Sundry Creditors',
        openingBalance: Math.round(Math.abs(addedCreditorOpeningSignedDr) * 100) / 100,
        balanceType: addedCreditorOpeningSignedDr >= 0 ? 'DR' : 'CR',
        isSystem: true,
      };
      importedAccounts.push(newCreditorsAcc);
      importedAccountByKey.set(normalizeNameKey(newCreditorsAcc.name), newCreditorsAcc);
    }
  }

  // 4. Parse <STOCKITEM> elements (and Stock Summary <DSPACCNAME>/<DSPSTKINFO> exports)
  const stockItemEls = getAllDescendantElements(root, 'STOCKITEM');
  const voucherPreviewCount = getAllDescendantElements(root, 'VOUCHER').length;
  const importedItems: ItemMaster[] = [];
  const importedItemByKey = new Map<string, ItemMaster>();
  const importedItemByGuid = new Map<string, ItemMaster>();
  const existingItemUpdateMap = new Map<string, TallyItemStockUpdate>();
  const itemMetaByKey = new Map<
    string,
    {
      rawClQty: number;
      hasExplicitClQty: boolean;
      absClVal: number;
      absOpVal: number;
      derivedClRate: number;
    }
  >();
  const seenStockKeys = new Set<string>();
  let totalItemOpeningValue = 0;
  let duplicateItems = 0;

  stockItemEls.forEach((itemEl) => {
    const isDelAttr = (itemEl.getAttribute('ISDELETED') || '').toLowerCase() === 'yes';
    const isDelChild = getFirstChildText(itemEl, ['ISDELETED']).toLowerCase() === 'yes';
    if (isDelAttr || isDelChild) return;

    const name = getAttrOrChild(itemEl, 'NAME', ['NAME']);
    if (!name) return;
    const itemGuid = getFirstChildText(itemEl, ['GUID']).trim();
    const key = normalizeNameKey(name);

    const category = getFirstChildText(itemEl, ['PARENT']) || 'General';
    const baseUnitRaw = getFirstChildText(itemEl, ['BASEUNITS', 'ADDITIONALUNITS']) || 'Pcs';

    // Direct stock fields
    const opBalRaw = getFirstChildText(itemEl, ['OPENINGBALANCE']);
    const opBalParsed = parseTallyNumeric(opBalRaw);
    const opValRaw = getFirstChildText(itemEl, ['OPENINGVALUE']);
    const opValParsed = parseTallyNumeric(opValRaw);
    const opRateRaw = getFirstChildText(itemEl, ['OPENINGRATE']);
    const opRateParsed = parseTallyNumeric(opRateRaw);

    const clBalRaw = getFirstChildText(itemEl, ['CLOSINGBALANCE']);
    const clBalParsed = parseTallyNumeric(clBalRaw);
    const clValRaw = getFirstChildText(itemEl, ['CLOSINGVALUE']);
    const clValParsed = parseTallyNumeric(clValRaw);
    const clRateRaw = getFirstChildText(itemEl, ['CLOSINGRATE']);
    const clRateParsed = parseTallyNumeric(clRateRaw);

    let stdCostVal = parseTallyNumeric(getFirstChildText(itemEl, ['STANDARDCOST', 'LASTPURCHASECOST', 'LASTPURCHASERATE'])).value;
    if (stdCostVal <= 0) {
      const stdCostNodes = getAllDescendantElements(itemEl, 'STANDARDCOSTLIST.LIST');
      for (let i = stdCostNodes.length - 1; i >= 0; i--) {
        const r = parseTallyNumeric(getFirstChildText(stdCostNodes[i], ['RATE'])).value;
        if (r > 0) {
          stdCostVal = r;
          break;
        }
      }
    }

    let stdPriceVal = parseTallyNumeric(getFirstChildText(itemEl, ['STANDARDPRICE'])).value;
    if (stdPriceVal <= 0) {
      const stdPriceNodes = getAllDescendantElements(itemEl, 'STANDARDPRICELIST.LIST');
      for (let i = stdPriceNodes.length - 1; i >= 0; i--) {
        const r = parseTallyNumeric(getFirstChildText(stdPriceNodes[i], ['RATE'])).value;
        if (r > 0) {
          stdPriceVal = r;
          break;
        }
      }
    }

    // Batch / Godown fallback for opening & closing qty/value inside <BATCHALLOCATIONS.LIST> or <GODOWNLIST.LIST>
    let batchOpQty = 0;
    let batchOpVal = 0;
    let batchOpRate = 0;
    let batchClQty = 0;
    let batchClVal = 0;
    let batchClRate = 0;
    let batchHasCl = false;
    let batchUnitHint = '';
    const batchNodes = [
      ...getAllDescendantElements(itemEl, 'BATCHALLOCATIONS.LIST'),
      ...getAllDescendantElements(itemEl, 'GODOWNLIST.LIST'),
    ];
    batchNodes.forEach((bn) => {
      const bQty = parseTallyNumeric(getFirstChildText(bn, ['OPENINGBALANCE']));
      const bVal = parseTallyNumeric(getFirstChildText(bn, ['OPENINGVALUE']));
      const bRate = parseTallyNumeric(getFirstChildText(bn, ['OPENINGRATE']));
      batchOpQty += bQty.value;
      batchOpVal += Math.abs(bVal.value);
      if (bRate.value > 0 && batchOpRate === 0) batchOpRate = Math.abs(bRate.value);
      if (!batchUnitHint && bQty.unitHint) batchUnitHint = bQty.unitHint;

      const bcRaw = getFirstChildText(bn, ['CLOSINGBALANCE']);
      const bvRaw = getFirstChildText(bn, ['CLOSINGVALUE']);
      const bcQty = parseTallyNumeric(bcRaw);
      const bcVal = parseTallyNumeric(bvRaw);
      const bcRate = parseTallyNumeric(getFirstChildText(bn, ['CLOSINGRATE']));
      if (bcRaw.trim() || bvRaw.trim()) batchHasCl = true;
      const bQtySigned = bcQty.explicitDrCr === 'CR' ? -Math.abs(bcQty.value) : bcQty.value;
      batchClQty += bQtySigned;
      const bValSigned = bQtySigned < 0 || bcVal.explicitDrCr === 'CR' ? -Math.abs(bcVal.value) : Math.abs(bcVal.value);
      batchClVal += bValSigned;
      if (bcRate.value > 0 && batchClRate === 0) batchClRate = Math.abs(bcRate.value);
      if (!batchUnitHint && bcQty.unitHint) batchUnitHint = bcQty.unitHint;
    });

    const itemGst = extractGstAndHsnFromEl(itemEl);
    const groupGst = resolveStockGroupGstHierarchy(category);
    const salesLedgerName = getFirstChildText(itemEl, ['SALESLIST', 'BASICRATEOFEXCISE', 'LEDGERNAME']);
    const ledgerGst = salesLedgerName ? ledgerTaxByKey.get(normalizeNameKey(salesLedgerName)) : undefined;

    const hsnSacCode = itemGst.hsn || groupGst.hsn || ledgerGst?.hsn || '';
    const taxRate =
      itemGst.taxRate > 0
        ? itemGst.taxRate
        : groupGst.taxRate > 0
        ? groupGst.taxRate
        : ledgerGst && ledgerGst.taxRate > 0
        ? ledgerGst.taxRate
        : 18;

    const opQty = Math.round(Math.max(0, Math.abs(opBalParsed.value) || Math.abs(batchOpQty)) * 1000) / 1000;
    const rawSignedClQty =
      clBalRaw.trim()
        ? (clBalParsed.explicitDrCr === 'CR' ? -Math.abs(clBalParsed.value) : clBalParsed.value)
        : batchClQty;
    const clQty = Math.round(rawSignedClQty * 1000) / 1000;
    const absOpVal = Math.abs(opValParsed.value) || batchOpVal;
    const isNegativeStock =
      clQty < 0 ||
      clBalParsed.explicitDrCr === 'CR' ||
      clValParsed.explicitDrCr === 'CR';
    const rawClValAbs = Math.abs(clValParsed.value) || Math.abs(batchClVal);
    const signedClVal = clBalRaw.trim() || clValRaw.trim()
      ? (isNegativeStock ? -rawClValAbs : rawClValAbs)
      : batchClVal;
    const hasExplicitClQty = Boolean(clBalRaw.trim() || clValRaw.trim() || batchHasCl);

    const derivedOpRate = opQty > 0 && absOpVal > 0 ? absOpVal / opQty : 0;
    const derivedClRate = Math.abs(clQty) > 0 && Math.abs(signedClVal) > 0 ? Math.abs(signedClVal) / Math.abs(clQty) : 0;

    // Prioritize effective closing valuation rate when explicit ClosingBalance + ClosingValue exist, rounded to 4 decimals
    const rawRate =
      derivedClRate ||
      Math.abs(clRateParsed.value) ||
      batchClRate ||
      Math.abs(stdCostVal) ||
      derivedOpRate ||
      Math.abs(opRateParsed.value) ||
      batchOpRate ||
      0;
    const purchasePrice = Math.round(rawRate * 10000) / 10000;

    const salesPrice =
      Math.round((Math.abs(stdPriceVal) || (purchasePrice > 0 ? purchasePrice * 1.15 : 0)) * 100) / 100;

    if (!seenStockKeys.has(key)) {
      seenStockKeys.add(key);
      totalItemOpeningValue += absOpVal;
      itemMetaByKey.set(key, {
        rawClQty: clQty,
        hasExplicitClQty,
        absClVal: Math.round(signedClVal * 100) / 100,
        absOpVal: Math.round(absOpVal * 100) / 100,
        derivedClRate,
      });
    }

    const existingMaster = (itemGuid ? existingItemByGuid.get(itemGuid) : undefined) || existingItemByKey.get(key);
    const dupItem = existingMaster || (itemGuid ? importedItemByGuid.get(itemGuid) : undefined) || importedItemByKey.get(key);
    if (dupItem && options.skipDuplicates) {
      if (existingMaster && (hasExplicitClQty || absOpVal > 0 || Math.abs(signedClVal) > 0)) {
        const prevUpd = existingItemUpdateMap.get(existingMaster.id) || {
          itemId: existingMaster.id,
          qtyDelta: 0,
        };
        if (opQty > 0 && (existingMaster.openingStock || 0) === 0) prevUpd.openingStock = opQty;
        if (absOpVal > 0) prevUpd.openingStockValue = Math.round(absOpVal * 100) / 100;
        if (Math.abs(signedClVal) > 0 || isNegativeStock) prevUpd.closingStockValue = Math.round(signedClVal * 100) / 100;
        if (hasExplicitClQty) prevUpd.importedClosingQty = clQty;
        if (purchasePrice > 0 && (existingMaster.purchasePrice || 0) === 0) prevUpd.purchasePrice = purchasePrice;
        existingItemUpdateMap.set(existingMaster.id, prevUpd);
      }
      duplicateItems++;
      return;
    }

    // Start from actual OpeningBalance (never fall back to clQty here, or vouchers would double-count purchases)
    const openingQty = opQty;
    const initialCurrentStock = voucherPreviewCount === 0 && hasExplicitClQty ? clQty : openingQty;

    const itemObj: ItemMaster = {
      id: nextId('itm'),
      code: `ERP-${100 + importedItems.length + 1}`,
      name,
      description: getFirstChildText(itemEl, ['DESCRIPTION', 'NARRATION']) || name,
      hsnSacCode: hsnSacCode || '8471',
      unit: opBalParsed.unitHint || clBalParsed.unitHint || batchUnitHint || baseUnitRaw || 'Pcs',
      purchasePrice,
      salesPrice,
      taxRate,
      currentStock: initialCurrentStock,
      openingStock: openingQty,
      ...(absOpVal > 0 ? { openingStockValue: Math.round(absOpVal * 100) / 100 } : {}),
      ...(Math.abs(signedClVal) > 0 || isNegativeStock ? { closingStockValue: Math.round(signedClVal * 100) / 100 } : {}),
      ...(hasExplicitClQty ? { importedClosingQty: clQty } : {}),
      minStockLevel: 5,
      category,
      ...(itemGuid ? { externalGuid: itemGuid } : {}),
    };
    importedItems.push(itemObj);
    importedItemByKey.set(key, itemObj);
    if (itemGuid) importedItemByGuid.set(itemGuid, itemObj);
  });

  // 4b. Tally Stock Summary XML fallback (<DSPACCNAME> + <DSPSTKINFO>) when Stock Summary report is exported directly
  const dspAccNameEls = getAllDescendantElements(root, 'DSPACCNAME');
  if (dspAccNameEls.length > 0) {
    dspAccNameEls.forEach((accNode) => {
      const itemName = getFirstChildText(accNode, ['DSPDISPNAME']);
      if (!itemName) return;
      const key = normalizeNameKey(itemName);

      let nextSibling = accNode.nextElementSibling;
      while (nextSibling && nextSibling.tagName.toUpperCase() !== 'DSPSTKINFO') {
        if (nextSibling.tagName.toUpperCase() === 'DSPACCNAME') {
          nextSibling = null;
          break;
        }
        nextSibling = nextSibling.nextElementSibling;
      }
      if (!nextSibling) return;

      const stkCl = getDirectChildrenByTag(nextSibling, 'DSPSTKCL')[0] || nextSibling;
      const qtyParsed = parseTallyNumeric(getFirstChildText(stkCl, ['DSPCLQTY']));
      const rateParsed = parseTallyNumeric(getFirstChildText(stkCl, ['DSPCLRATE']));
      const valParsed = parseTallyNumeric(getFirstChildText(stkCl, ['DSPCLAMTA']));

      const qty = Math.max(0, Math.abs(qtyParsed.value));
      const absVal = Math.abs(valParsed.value);
      const derivedRate = qty > 0 && absVal > 0 ? absVal / qty : 0;
      const costRate = Math.round((derivedRate || Math.abs(rateParsed.value) || 0) * 10000) / 10000;

      if (qty === 0 && costRate === 0 && absVal === 0) return;

      itemMetaByKey.set(key, {
        rawClQty: qty,
        hasExplicitClQty: true,
        absClVal: Math.round(absVal * 100) / 100,
        absOpVal: 0,
        derivedClRate: derivedRate,
      });

      const existingMaster = existingItemByKey.get(key);
      const dupItem = existingMaster || importedItemByKey.get(key);
      if (dupItem && options.skipDuplicates) {
        if (existingMaster) {
          const prevUpd = existingItemUpdateMap.get(existingMaster.id) || {
            itemId: existingMaster.id,
            qtyDelta: 0,
          };
          if (absVal > 0) prevUpd.closingStockValue = Math.round(absVal * 100) / 100;
          prevUpd.importedClosingQty = qty;
          if (costRate > 0 && (existingMaster.purchasePrice || 0) === 0) prevUpd.purchasePrice = costRate;
          existingItemUpdateMap.set(existingMaster.id, prevUpd);
        }
        return;
      }

      const itemObj: ItemMaster = {
        id: nextId('itm'),
        code: `TAL-${100 + importedItems.length + 1}`,
        name: itemName,
        description: itemName,
        hsnSacCode: '8471',
        unit: qtyParsed.unitHint || 'Pcs',
        purchasePrice: costRate,
        salesPrice: costRate > 0 ? Math.round(costRate * 1.15 * 100) / 100 : 0,
        taxRate: 18,
        currentStock: qty,
        openingStock: 0,
        ...(absVal > 0 ? { closingStockValue: Math.round(absVal * 100) / 100 } : {}),
        importedClosingQty: qty,
        minStockLevel: 5,
        category: 'Stock Summary',
      };
      importedItems.push(itemObj);
      importedItemByKey.set(key, itemObj);
    });
  }

  // If XML carried StockItem Opening Values without a Stock-in-Hand Ledger opening balance, populate acc_inventory
  const existingInvAcc = (existingData.accounts || []).find((a) => a.id === 'acc_inventory');
  if (
    totalItemOpeningValue > 0 &&
    !accountOpeningUpdateMap.has('acc_inventory') &&
    (existingInvAcc?.openingBalance || 0) === 0
  ) {
    accountOpeningUpdateMap.set('acc_inventory', {
      id: 'acc_inventory',
      openingBalance: Math.round(totalItemOpeningValue * 100) / 100,
      balanceType: 'DR',
    });
  }

  // Helper to lookup Account by name across existing + imported (or auto-create safely)
  const resolveAccountForEntry = (ledgerName: string, isDebit: boolean): Account => {
    const key = normalizeNameKey(ledgerName);
    const foundExisting = existingAccountByKey.get(key) || importedAccountByKey.get(key);
    if (foundExisting) return foundExisting;

    const mappedGroup = ledgerGroupByKey.get(key) || '';
    const meta = mapTallyGroupToAccountMeta(mappedGroup, ledgerName);

    // If this ledger belongs to a Sundry Debtor or Creditor (Party), map voucher accounting line to control account
    if (meta.isPartyType === 'CUSTOMER' || existingPartyByKey.get(key)?.type === 'CUSTOMER' || importedPartyByKey.get(key)?.type === 'CUSTOMER') {
      return (
        (existingData.accounts || []).find((a) => a.id === 'acc_debtors') || {
          id: 'acc_debtors',
          code: '1100',
          name: 'Sundry Debtors (Receivables)',
          category: 'ASSET',
          subCategory: 'Current Assets',
          mainGroup: 'Sundry Debtors',
          openingBalance: 0,
          balanceType: 'DR',
          isSystem: true,
        }
      );
    }
    if (meta.isPartyType === 'VENDOR' || existingPartyByKey.get(key)?.type === 'VENDOR' || importedPartyByKey.get(key)?.type === 'VENDOR') {
      return (
        (existingData.accounts || []).find((a) => a.id === 'acc_creditors') || {
          id: 'acc_creditors',
          code: '2010',
          name: 'Sundry Creditors (Payables)',
          category: 'LIABILITY',
          subCategory: 'Current Liabilities',
          mainGroup: 'Sundry Creditors',
          openingBalance: 0,
          balanceType: 'CR',
          isSystem: true,
        }
      );
    }

    if (meta.systemAccountMatch) {
      const sysAcc = (existingData.accounts || []).find((a) => a.id === meta.systemAccountMatch);
      if (sysAcc) return sysAcc;
    }

    // Create a clean missing account on the fly so zero vouchers break Trial Balance
    const inferredCategory: AccountCategory = mappedGroup
      ? meta.category
      : isDebit
      ? 'EXPENSE'
      : 'REVENUE';
    const autoAcc: Account = {
      id: nextId('acc'),
      code: allocateAccountCode(),
      name: ledgerName,
      category: inferredCategory,
      subCategory: mappedGroup ? meta.subCategory : inferredCategory === 'EXPENSE' ? 'Indirect Expenses' : 'Indirect Revenue',
      mainGroup: mappedGroup ? meta.mainGroup : inferredCategory === 'EXPENSE' ? 'Indirect Expenses' : 'Indirect Incomes',
      openingBalance: 0,
      balanceType: inferredCategory === 'EXPENSE' || inferredCategory === 'ASSET' ? 'DR' : 'CR',
      isSystem: false,
    };
    importedAccounts.push(autoAcc);
    importedAccountByKey.set(key, autoAcc);
    return autoAcc;
  };

  // Helper to resolve/ensure PartyMaster for Sales/Purchase/DebitNote/CreditNote
  const resolveOrCreateParty = (
    partyName: string,
    partyGstin: string,
    partyState: string,
    defaultType: PartyType,
    gstCatHint?: PartyMaster['gstCategory']
  ): PartyMaster => {
    const cleanName = (partyName || 'Cash / Counter Party').trim();
    const cleanGstin = cleanValidTallyGstin(partyGstin);
    const key = normalizeNameKey(cleanName);
    const existing =
      existingPartyByKey.get(key) ||
      importedPartyByKey.get(key) ||
      (cleanGstin.length >= 15
        ? existingPartyByGstin.get(cleanGstin) || importedPartyByGstin.get(cleanGstin)
        : undefined);

    if (existing) {
      const overlay = partyGstOverlayById.get(existing.id);
      const currentGstin = cleanValidTallyGstin(overlay?.gstin ?? existing.gstin);
      if (isValid15Gstin(cleanGstin) && (!isValid15Gstin(currentGstin) || existing.gstCategory === 'UNREGISTERED')) {
        const upPan = cleanGstin.slice(2, 12);
        const { state: upState, stateCode: upCode } = findStateFromTextOrGstin(
          partyState || existing.state,
          cleanGstin
        );
        const upCat: PartyMaster['gstCategory'] =
          gstCatHint && gstCatHint !== 'UNREGISTERED' ? gstCatHint : 'REGULAR';
        if (importedPartyIds.has(existing.id)) {
          existing.gstin = cleanGstin;
          if (!existing.pan) existing.pan = upPan;
          existing.gstCategory = upCat;
          if (upState) existing.state = upState;
          if (upCode) existing.stateCode = upCode;
          importedPartyByGstin.set(cleanGstin, existing);
        } else {
          partyGstOverlayById.set(existing.id, {
            gstin: cleanGstin,
            gstCategory: upCat,
            state: upState || existing.state,
            stateCode: upCode || existing.stateCode,
          });
          partyUpdateMap.set(existing.id, {
            partyId: existing.id,
            gstin: cleanGstin,
            pan: existing.pan || upPan,
            gstCategory: upCat,
            state: upState || existing.state,
            stateCode: upCode || existing.stateCode,
          });
          existingPartyByGstin.set(cleanGstin, existing);
        }
      }
      return existing;
    }

    const { state, stateCode } = findStateFromTextOrGstin(partyState, cleanGstin);
    const newCat: PartyMaster['gstCategory'] = isValid15Gstin(cleanGstin)
      ? gstCatHint && gstCatHint !== 'UNREGISTERED'
        ? gstCatHint
        : 'REGULAR'
      : 'UNREGISTERED';
    const newParty: PartyMaster = {
      id: nextId('pty'),
      code: `${defaultType === 'CUSTOMER' ? 'CUST' : 'VEND'}-${101 + importedParties.length}`,
      name: cleanName,
      type: defaultType,
      gstin: cleanGstin || '',
      pan: cleanGstin && cleanGstin.length >= 12 ? cleanGstin.slice(2, 12) : '',
      email: '',
      phone: '',
      address: '',
      state,
      stateCode,
      creditLimit: 500000,
      openingBalance: 0,
      balanceType: defaultType === 'CUSTOMER' ? 'DR' : 'CR',
      gstCategory: newCat,
    };
    importedParties.push(newParty);
    importedPartyIds.add(newParty.id);
    importedPartyByKey.set(key, newParty);
    if (cleanGstin.length >= 15) importedPartyByGstin.set(cleanGstin, newParty);
    return newParty;
  };

  // Existing voucher/invoice deduplication sets (GUID first + Ref/Date only for legacy records without GUID)
  const preExistingInvKeys = new Set(
    (existingData.invoices || []).map((inv) => `${inv.invoiceNumber.trim().toLowerCase()}|${inv.date}`)
  );
  const preExistingPurKeys = new Set(
    (existingData.purchaseInvoices || []).map((p) => `${p.supplierInvoiceNo.trim().toLowerCase()}|${p.date}`)
  );
  const preExistingVchKeys = new Set(
    (existingData.vouchers || []).map((v) => `${v.type}|${v.voucherNumber.trim().toLowerCase()}|${v.date}`)
  );
  const preExistingNoteKeys = new Set(
    (existingData.debitCreditNotes || []).map((n) => `${n.type}|${n.noteNumber.trim().toLowerCase()}|${n.date}`)
  );
  const existingVoucherGuids = new Set<string>();
  [
    ...(existingData.invoices || []),
    ...(existingData.purchaseInvoices || []),
    ...(existingData.vouchers || []),
    ...(existingData.debitCreditNotes || []),
  ].forEach((r) => {
    if (r.externalGuid) existingVoucherGuids.add(r.externalGuid.trim());
  });
  const seenXmlNoGuidKeys = new Set<string>();

  // Helper to apply non-accounting stock movements cleanly without ledger postings
  const applyNonAccountingStockDelta = (
    itemName: string,
    qtyDelta: number,
    unitHint: string,
    hsnHint: string
  ) => {
    const itmKey = normalizeNameKey(itemName);
    const existingMaster = existingItemByKey.get(itmKey);
    const importedItem = importedItemByKey.get(itmKey);
    if (importedItem) {
      importedItem.currentStock = Math.round((Number(importedItem.currentStock || 0) + qtyDelta) * 1000) / 1000;
    } else if (existingMaster) {
      const prevUpd = existingItemUpdateMap.get(existingMaster.id) || {
        itemId: existingMaster.id,
        qtyDelta: 0,
      };
      prevUpd.qtyDelta = Math.round((prevUpd.qtyDelta + qtyDelta) * 1000) / 1000;
      existingItemUpdateMap.set(existingMaster.id, prevUpd);
    } else {
      const newItm: ItemMaster = {
        id: nextId('itm'),
        code: `ERP-${100 + importedItems.length + 1}`,
        name: itemName,
        description: itemName,
        hsnSacCode: hsnHint || '8471',
        unit: unitHint || 'Pcs',
        purchasePrice: 0,
        salesPrice: 0,
        taxRate: 18,
        currentStock: Math.round(qtyDelta * 1000) / 1000,
        openingStock: 0,
        minStockLevel: 5,
        category: 'Imported',
      };
      importedItems.push(newItm);
      importedItemByKey.set(itmKey, newItm);
    }
  };

  // 5. Parse <VOUCHER> elements
  const voucherEls = getAllDescendantElements(root, 'VOUCHER');
  const importedInvoices: SalesInvoice[] = [];
  const importedPurchases: PurchaseInvoice[] = [];
  const importedVouchers: Voucher[] = [];
  const importedNotes: DebitCreditNote[] = [];

  let skippedCancelledOrOptional = 0;
  let duplicateInvoices = 0;
  let duplicatePurchases = 0;
  let duplicateVouchers = 0;
  let duplicateNotes = 0;
  let minDate = '';
  let maxDate = '';

  const trackDate = (d: string) => {
    if (!d) return;
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  };

  voucherEls.forEach((vchEl, idx) => {
    const isCancelled =
      getFirstChildText(vchEl, ['ISCANCELLED']).toLowerCase() === 'yes' ||
      (vchEl.getAttribute('ISCANCELLED') || '').toLowerCase() === 'yes';
    const isDeleted =
      getFirstChildText(vchEl, ['ISDELETED']).toLowerCase() === 'yes' ||
      (vchEl.getAttribute('ISDELETED') || '').toLowerCase() === 'yes';
    const isOptional =
      getFirstChildText(vchEl, ['ISOPTIONAL']).toLowerCase() === 'yes' ||
      (vchEl.getAttribute('ISOPTIONAL') || '').toLowerCase() === 'yes';
    if (isCancelled || isDeleted || isOptional) {
      skippedCancelledOrOptional++;
      return;
    }

    const vchGuid = getFirstChildText(vchEl, ['GUID']).trim();
    if (vchGuid) {
      if (options.skipDuplicates && existingVoucherGuids.has(vchGuid)) {
        duplicateVouchers++;
        return;
      }
      existingVoucherGuids.add(vchGuid);
    }

    const vchTypeRaw = getAttrOrChild(vchEl, 'VCHTYPE', ['VOUCHERTYPENAME', 'VCHTYPE']).trim();
    const vchTypeLow = vchTypeRaw.toLowerCase();

    // Pure memorandum / order / HR vouchers -> skip completely (zero stock & zero financial posting)
    const PURE_NON_POSTING_TYPES = [
      'sales order',
      'purchase order',
      'memorandum',
      'reversing journal',
      'attendance',
      'payroll',
    ];
    if (PURE_NON_POSTING_TYPES.some((t) => vchTypeLow === t || vchTypeLow.includes(t))) {
      skippedCancelledOrOptional++;
      return;
    }

    // Inventory-only movement vouchers (Delivery Note, Receipt Note, Material In/Out, Stock Journal, Physical Stock):
    // Sync stock quantity delta ONLY — never post accounting ledger values
    const INVENTORY_ONLY_TYPES = [
      'delivery note',
      'receipt note',
      'rejection in',
      'rejection out',
      'rejections in',
      'rejections out',
      'stock journal',
      'physical stock',
      'material in',
      'material out',
    ];
    if (INVENTORY_ONLY_TYPES.some((t) => vchTypeLow === t || vchTypeLow.includes(t))) {
      const invOnlyNodes = [
        ...getAllDescendantElements(vchEl, 'ALLINVENTORYENTRIES.LIST'),
        ...getAllDescendantElements(vchEl, 'INVENTORYENTRIESIN.LIST'),
        ...getAllDescendantElements(vchEl, 'INVENTORYENTRIESOUT.LIST'),
        ...getAllDescendantElements(vchEl, 'INVENTORYENTRIES.LIST'),
      ];
      invOnlyNodes.forEach((inNode) => {
        const iName = getFirstChildText(inNode, ['STOCKITEMNAME']);
        if (!iName) return;
        const qParsed = parseTallyNumeric(
          getFirstChildText(inNode, ['ACTUALQTY', 'BILLEDQTY'])
        );
        const absQ = Math.abs(qParsed.value);
        if (absQ <= 0) return;

        const tagUp = inNode.tagName.toUpperCase();
        const isDeemedInward = getFirstChildText(inNode, ['ISDEEMEDPOSITIVE']).toLowerCase() === 'yes';
        const isInwardType =
          vchTypeLow.includes('receipt note') ||
          vchTypeLow.includes('material in') ||
          vchTypeLow.includes('rejection in') ||
          vchTypeLow.includes('rejections in') ||
          tagUp === 'INVENTORYENTRIESIN.LIST' ||
          ((vchTypeLow.includes('stock journal') || vchTypeLow.includes('physical stock')) && isDeemedInward);
        const delta = isInwardType ? absQ : -absQ;
        applyNonAccountingStockDelta(iName, delta, qParsed.unitHint, getFirstChildText(inNode, ['HSNCODE']));
      });
      skippedCancelledOrOptional++;
      return;
    }

    const date = parseTallyDate(getFirstChildText(vchEl, ['DATE', 'EFFECTIVEDATE']));
    trackDate(date);

    const vchNumber =
      getFirstChildText(vchEl, ['VOUCHERNUMBER']) || `VCH-${idx + 1}`;
    const referenceNo = getFirstChildText(vchEl, ['REFERENCE']);
    const narration = getFirstChildText(vchEl, ['NARRATION']);
    const partyLedgerName = getFirstChildText(vchEl, ['PARTYLEDGERNAME', 'PARTYNAME']);
    const vchGstMeta = extractPartyGstRegFromElement(vchEl);
    const partyGstin = vchGstMeta.gstin;
    const placeOfSupplyRaw =
      getFirstChildText(vchEl, ['PLACEOFSUPPLY', 'STATENAME', 'CONSIGNEESTATENAME']) ||
      vchGstMeta.stateRaw;

    // Extract E-Way Bill metadata (<EWAYBILLDETAILS.LIST> or direct tags)
    const ewayNode = getAllDescendantElements(vchEl, 'EWAYBILLDETAILS.LIST')[0] || vchEl;
    const ewayBillNumber = getFirstChildText(ewayNode, ['BILLNUMBER', 'EWAYBILLNUMBER', 'EWAYBILLNO']);
    const transporterId = getFirstChildText(ewayNode, ['TRANSPORTERID', 'CONSIGNORTRANSPORTERID']);
    const vehicleNo = getFirstChildText(ewayNode, ['VEHICLENUMBER', 'VEHICLENO', 'TRANSPORTDETAILS']);

    // Extract Ledger Lines (Tally puts them in ALLLEDGERENTRIES.LIST or LEDGERENTRIES.LIST)
    const rawLedgerNodes = [
      ...getDirectChildrenByTag(vchEl, 'ALLLEDGERENTRIES.LIST'),
      ...getDirectChildrenByTag(vchEl, 'LEDGERENTRIES.LIST'),
    ];

    interface RawLedgerLine {
      ledgerName: string;
      debit: number;
      credit: number;
      amountAbs: number;
      isPartyEntry: boolean;
      invAllocations: Element[];
    }

    const parsedRawAmounts = rawLedgerNodes.map((ln) => {
      const parsed = parseTallyNumeric(getFirstChildText(ln, ['AMOUNT']));
      return {
        amtNum: parsed.value,
        explicitDrCr: parsed.explicitDrCr,
        isDeemedPos: getFirstChildText(ln, ['ISDEEMEDPOSITIVE']).toLowerCase() === 'yes',
      };
    });
    const hasNegativeAmt = parsedRawAmounts.some((x) => x.amtNum < 0);

    const parsedLedgerLines: RawLedgerLine[] = rawLedgerNodes
      .map((ln, lineIdx) => {
        const lName = getFirstChildText(ln, ['LEDGERNAME']);
        const { amtNum, explicitDrCr, isDeemedPos } = parsedRawAmounts[lineIdx];
        const isPartyFlag = getFirstChildText(ln, ['ISPARTYLEDGER']).toLowerCase() === 'yes';
        const absAmt = Math.round(Math.abs(amtNum) * 100) / 100;
        // Respect explicit Dr/Cr suffix first, then signed AMOUNT (negative = Debit, positive = Credit), then ISDEEMEDPOSITIVE
        const isDebit = explicitDrCr
          ? explicitDrCr === 'DR'
          : amtNum !== 0
          ? hasNegativeAmt
            ? amtNum < 0
            : isDeemedPos
          : isDeemedPos;

        const invAlloc = [
          ...getDirectChildrenByTag(ln, 'INVENTORYALLOCATIONS.LIST'),
          ...getDirectChildrenByTag(ln, 'ALLINVENTORYENTRIES.LIST'),
        ];

        return {
          ledgerName: lName,
          debit: isDebit ? absAmt : 0,
          credit: !isDebit ? absAmt : 0,
          amountAbs: absAmt,
          isPartyEntry: isPartyFlag,
          invAllocations: invAlloc,
        };
      })
      .filter((l) => l.ledgerName && l.amountAbs > 0);

    // Extract Inventory Lines (either direct ALLINVENTORYENTRIES.LIST or nested inside ledger entries)
    const directInvNodes = [
      ...getDirectChildrenByTag(vchEl, 'ALLINVENTORYENTRIES.LIST'),
      ...getDirectChildrenByTag(vchEl, 'INVENTORYENTRIES.LIST'),
    ];
    const nestedInvNodes = parsedLedgerLines.flatMap((l) => l.invAllocations);
    const rawInvNodes = directInvNodes.length > 0 ? directInvNodes : nestedInvNodes;

    // Classify Voucher Category (check Credit/Debit Note BEFORE Sales/Purchase, and recognize custom Tally invoice types)
    const persistedView = getFirstChildText(vchEl, ['PERSISTEDVIEW']).toLowerCase();
    const isInvoiceTag = getFirstChildText(vchEl, ['ISINVOICE']).toLowerCase() === 'yes';
    const isStdVoucherType =
      vchTypeLow.includes('payment') ||
      vchTypeLow.includes('receipt') ||
      vchTypeLow.includes('contra') ||
      vchTypeLow.includes('journal');
    const isCreditNote = vchTypeLow.includes('credit note') || vchTypeLow.includes('sales return');
    const isDebitNote = vchTypeLow.includes('debit note') || vchTypeLow.includes('purchase return');
    const isPurchase =
      !isCreditNote &&
      !isDebitNote &&
      !isStdVoucherType &&
      vchTypeLow.includes('purchase');
    const isSales =
      !isCreditNote &&
      !isDebitNote &&
      !isPurchase &&
      !isStdVoucherType &&
      (vchTypeLow.includes('sales') ||
        vchTypeLow.includes('tax invoice') ||
        vchTypeLow.includes('invoice') ||
        persistedView.includes('invoice voucher view') ||
        isInvoiceTag);

    if (isSales || isPurchase || isCreditNote || isDebitNote) {
      // Deduplicate strictly against pre-existing records (when distinct GUID isn't set) + no-GUID within-XML series key
      const noGuidKey = `${vchTypeLow}|${vchNumber.trim().toLowerCase()}|${date}`;
      const isDuplicateVoucher = (() => {
        if (!options.skipDuplicates) return false;
        if (!vchGuid && seenXmlNoGuidKeys.has(noGuidKey)) return true;
        if (vchGuid) return false; // distinct GUID inside XML is already checked against existingVoucherGuids
        if (isSales) return preExistingInvKeys.has(`${vchNumber.trim().toLowerCase()}|${date}`);
        if (isPurchase) {
          const suppInv = (referenceNo || vchNumber).trim();
          return preExistingPurKeys.has(`${suppInv.toLowerCase()}|${date}`);
        }
        const noteType = isCreditNote ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
        return preExistingNoteKeys.has(`${noteType}|${vchNumber.trim().toLowerCase()}|${date}`);
      })();

      const defaultPartyType: PartyType = isSales || isCreditNote ? 'CUSTOMER' : 'VENDOR';

      if (isDuplicateVoucher) {
        if (partyLedgerName && isValid15Gstin(partyGstin)) {
          const existingDupParty =
            existingPartyByKey.get(normalizeNameKey(partyLedgerName)) ||
            importedPartyByKey.get(normalizeNameKey(partyLedgerName));
          if (existingDupParty) {
            resolveOrCreateParty(
              existingDupParty.name,
              partyGstin,
              placeOfSupplyRaw,
              defaultPartyType,
              vchGstMeta.gstCategory
            );
          }
        }
        if (isSales) duplicateInvoices++;
        else if (isPurchase) duplicatePurchases++;
        else duplicateNotes++;
        return;
      }
      if (!vchGuid) seenXmlNoGuidKeys.add(noGuidKey);

      // Shared extraction for invoice-style vouchers
      const expectPartyDebit = isSales || isDebitNote;
      const partyLine =
        parsedLedgerLines.find((l) => l.isPartyEntry) ||
        parsedLedgerLines.find(
          (l) => partyLedgerName && normalizeNameKey(l.ledgerName) === normalizeNameKey(partyLedgerName)
        ) ||
        parsedLedgerLines.find(
          (l) => !classifyTaxLedger(l.ledgerName) && (expectPartyDebit ? l.debit > 0 : l.credit > 0)
        ) ||
        parsedLedgerLines.find((l) => !classifyTaxLedger(l.ledgerName));

      const resolvedPartyName = partyLedgerName || partyLine?.ledgerName || 'Counter Party';
      const party = resolveOrCreateParty(
        resolvedPartyName,
        partyGstin,
        placeOfSupplyRaw,
        defaultPartyType,
        vchGstMeta.gstCategory
      );

      let cgstAmount = 0;
      let sgstAmount = 0;
      let igstAmount = 0;
      let roundOffSigned = 0;
      let invoiceLedgerDiscount = 0;
      const nonTaxLedgerNames: string[] = [];
      const nonTaxLines: RawLedgerLine[] = [];
      const extraLedgerLines: ExtraInvoiceLedgerLine[] = [];

      const expectedLineNet = (l: RawLedgerLine) =>
        isSales || isDebitNote ? l.credit - l.debit : l.debit - l.credit;

      parsedLedgerLines.forEach((l) => {
        if (partyLine && l === partyLine) return;
        const taxKind = classifyTaxLedger(l.ledgerName);
        if (taxKind === 'CGST') {
          cgstAmount += expectedLineNet(l);
        } else if (taxKind === 'SGST') {
          sgstAmount += expectedLineNet(l);
        } else if (taxKind === 'IGST') {
          igstAmount += expectedLineNet(l);
        } else if (taxKind === 'ROUNDOFF') {
          if (isCreditNote || isDebitNote) {
            const roAcc = resolveAccountForEntry(l.ledgerName, l.debit > 0);
            extraLedgerLines.push({
              accountId: roAcc.id,
              accountName: roAcc.name,
              debit: l.debit,
              credit: l.credit,
            });
          } else {
            roundOffSigned += isSales ? l.credit - l.debit : l.debit - l.credit;
          }
        } else if (taxKind === 'DISCOUNT') {
          invoiceLedgerDiscount += isSales || isDebitNote ? l.debit - l.credit : l.credit - l.debit;
        } else {
          nonTaxLines.push(l);
          nonTaxLedgerNames.push(l.ledgerName);
        }
      });

      // If any tax sum became negative (unusual tax reversal inside invoice), push net to extraLedgerLines cleanly
      const clampTaxOrExtra = (rawVal: number, accId: string, label: string): number => {
        const rounded = Math.round(rawVal * 100) / 100;
        if (rounded >= 0) return rounded;
        const absNeg = Math.abs(rounded);
        const onExpectedSideDebit = isSales || isDebitNote;
        extraLedgerLines.push({
          accountId: accId,
          accountName: label,
          debit: onExpectedSideDebit ? absNeg : 0,
          credit: onExpectedSideDebit ? 0 : absNeg,
        });
        return 0;
      };

      const isInputSide = isPurchase || isDebitNote;
      cgstAmount = clampTaxOrExtra(
        cgstAmount,
        isInputSide ? 'acc_itc_cgst' : 'acc_gst_cgst',
        isInputSide ? 'Input Tax Credit - CGST' : 'Output GST Payable - CGST'
      );
      sgstAmount = clampTaxOrExtra(
        sgstAmount,
        isInputSide ? 'acc_itc_sgst' : 'acc_gst_sgst',
        isInputSide ? 'Input Tax Credit - SGST' : 'Output GST Payable - SGST'
      );
      igstAmount = clampTaxOrExtra(
        igstAmount,
        isInputSide ? 'acc_itc_igst' : 'acc_gst_igst',
        isInputSide ? 'Input Tax Credit - IGST' : 'Output GST Payable - IGST'
      );

      roundOffSigned = Math.round(roundOffSigned * 100) / 100;
      const rawDiscountSigned = Math.round(invoiceLedgerDiscount * 100) / 100;
      if (rawDiscountSigned < 0) {
        const absExtraDisc = Math.abs(rawDiscountSigned);
        const isCreditOnSalesOrDn = isSales || isDebitNote;
        extraLedgerLines.push({
          accountId: 'acc_discount_allowed',
          accountName: 'Discount / Surcharge Adjustment',
          debit: isCreditOnSalesOrDn ? 0 : absExtraDisc,
          credit: isCreditOnSalesOrDn ? absExtraDisc : 0,
        });
      }
      invoiceLedgerDiscount = Math.max(0, rawDiscountSigned);
      const totalTax = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      // Pick primary accounting line (Sales / Purchase / CN / DN) and route all additional lines to extraLedgerLines
      let primaryLine: RawLedgerLine | undefined;
      if (nonTaxLines.length > 0) {
        primaryLine =
          nonTaxLines.find((l) => l.invAllocations.length > 0) ||
          nonTaxLines.find((l) => {
            const acc = resolveAccountForEntry(l.ledgerName, l.debit > 0);
            return acc.id === 'acc_sales' || acc.id === 'acc_cogs';
          }) ||
          [...nonTaxLines].sort((a, b) => b.amountAbs - a.amountAbs)[0];
      }

      let primaryAccountId: string | undefined;
      if (primaryLine) {
        const primaryAcc = resolveAccountForEntry(primaryLine.ledgerName, primaryLine.debit > 0);
        primaryAccountId = primaryAcc.id;
        nonTaxLines.forEach((l) => {
          if (l === primaryLine) return;
          const acc = resolveAccountForEntry(l.ledgerName, l.debit > 0);
          extraLedgerLines.push({
            accountId: acc.id,
            accountName: acc.name,
            debit: l.debit,
            credit: l.credit,
          });
        });
      }

      const nonTaxIncomeOrExpenseSubtotal = Math.round(
        (primaryLine
          ? Math.max(0, expectedLineNet(primaryLine))
          : nonTaxLines.reduce((s, l) => s + expectedLineNet(l), 0)) * 100
      ) / 100;

      // Duplicate check already completed above

      // Build InvoiceItem[] with item-level discount & stock awareness
      const invoiceItems: InvoiceItem[] = [];
      let rawInvGrossSub = 0;
      let rawInvNetSub = 0;
      let lineDiscountsTotal = 0;

      rawInvNodes.forEach((invNode) => {
        const itemName = getFirstChildText(invNode, ['STOCKITEMNAME']);
        if (!itemName) return;
        const billedRaw = getFirstChildText(invNode, ['BILLEDQTY']);
        const actualRaw = getFirstChildText(invNode, ['ACTUALQTY']);
        const qtyRaw = billedRaw || actualRaw || '1';
        const rateRaw = getFirstChildText(invNode, ['RATE']);
        const discRaw = getFirstChildText(invNode, ['DISCOUNT', 'DISCPERCENT', 'DISCOUNTPERCENT']);
        const amtRaw = getFirstChildText(invNode, ['AMOUNT']);

        const qtyParsed = parseTallyNumeric(qtyRaw);
        const actualQtyParsed = actualRaw ? parseTallyNumeric(actualRaw) : qtyParsed;
        const rateParsed = parseTallyNumeric(rateRaw);
        const explicitDiscPct = Math.max(0, Math.min(100, Math.abs(parseTallyNumeric(discRaw).value)));
        const amtNum = Math.round(Math.abs(parseTallyNumeric(amtRaw).value) * 100) / 100;

        const qty = Math.round(Math.max(0.001, Math.abs(qtyParsed.value) || 1) * 1000) / 1000;
        const stockQty = Math.round(Math.max(0, Math.abs(actualQtyParsed.value) || qty) * 1000) / 1000;
        const rate = rateParsed.value > 0 ? rateParsed.value : Math.round((amtNum / qty) * 100) / 100;
        const grossLine = Math.round(qty * rate * 100) / 100;
        const netLine =
          amtNum > 0
            ? amtNum
            : explicitDiscPct > 0
            ? Math.round(grossLine * (1 - explicitDiscPct / 100) * 100) / 100
            : grossLine;

        let lineDiscountPct = 0;
        let lineDiscountAmt = 0;
        if (explicitDiscPct > 0) {
          lineDiscountPct = Math.round(explicitDiscPct * 100) / 100;
          lineDiscountAmt =
            grossLine > 0 && amtNum > 0 && grossLine >= amtNum
              ? Math.round((grossLine - amtNum) * 100) / 100
              : Math.round(grossLine * (lineDiscountPct / 100) * 100) / 100;
        } else if (rate > 0 && amtNum > 0 && grossLine - amtNum > 0.05) {
          lineDiscountAmt = Math.round((grossLine - amtNum) * 100) / 100;
          lineDiscountPct = Math.round((lineDiscountAmt / grossLine) * 10000) / 100;
        }

        const effectiveGross = grossLine > 0 ? grossLine : netLine;
        const netUnitRate = qty > 0 ? Math.round((netLine / qty) * 100) / 100 : rate;

        // Resolve or auto-create ItemMaster reference & keep stock/cost in sync
        const itmKey = normalizeNameKey(itemName);
        const existingMaster = existingItemByKey.get(itmKey);
        let matchedItem = existingMaster || importedItemByKey.get(itmKey);
        const qtyDelta = isPurchase || isCreditNote ? stockQty : isSales || isDebitNote ? -stockQty : 0;

        if (!matchedItem) {
          matchedItem = {
            id: nextId('itm'),
            code: `ERP-${100 + importedItems.length + 1}`,
            name: itemName,
            description: itemName,
            hsnSacCode: getFirstChildText(invNode, ['HSNCODE']) || '8471',
            unit: qtyParsed.unitHint || rateParsed.unitHint || 'Pcs',
            purchasePrice: isPurchase ? netUnitRate : 0,
            salesPrice: isSales ? rate : isPurchase ? Math.round(netUnitRate * 1.15 * 100) / 100 : 0,
            taxRate: 18,
            currentStock: Math.round(qtyDelta * 1000) / 1000,
            openingStock: 0,
            minStockLevel: 5,
            category: 'Imported',
          };
          importedItems.push(matchedItem);
          importedItemByKey.set(itmKey, matchedItem);
        } else if (importedItemByKey.has(itmKey)) {
          matchedItem.currentStock = Math.round((Number(matchedItem.currentStock || 0) + qtyDelta) * 1000) / 1000;
          if (isPurchase && netUnitRate > 0 && (matchedItem.purchasePrice || 0) === 0) {
            matchedItem.purchasePrice = netUnitRate;
          }
          if (isSales && rate > 0 && (matchedItem.salesPrice || 0) === 0) {
            matchedItem.salesPrice = rate;
          }
        } else if (existingMaster) {
          const prevUpd = existingItemUpdateMap.get(existingMaster.id) || {
            itemId: existingMaster.id,
            qtyDelta: 0,
          };
          prevUpd.qtyDelta = Math.round((prevUpd.qtyDelta + qtyDelta) * 1000) / 1000;
          if (isPurchase && netUnitRate > 0) prevUpd.purchasePrice = netUnitRate;
          if (isSales && rate > 0) prevUpd.salesPrice = rate;
          existingItemUpdateMap.set(existingMaster.id, prevUpd);
        }

        rawInvGrossSub += effectiveGross;
        rawInvNetSub += netLine;
        lineDiscountsTotal += lineDiscountAmt;

        invoiceItems.push({
          id: nextId('line'),
          itemId: matchedItem.id,
          itemName: matchedItem.name,
          hsnSacCode: matchedItem.hsnSacCode || '8471',
          quantity: qty,
          unit: qtyParsed.unitHint || matchedItem.unit || 'Pcs',
          rate,
          discountPercent: lineDiscountPct,
          taxRate: 0,
          taxAmount: 0,
          totalAmount: netLine,
        });
      });

      const primaryNetFromLedger =
        primaryLine
          ? Math.max(0, Math.round((expectedLineNet(primaryLine) - invoiceLedgerDiscount) * 100) / 100)
          : undefined;

      const totalDiscount = Math.round((lineDiscountsTotal + invoiceLedgerDiscount) * 100) / 100;
      const subtotal = Math.round(
        (primaryNetFromLedger !== undefined && partyLine
          ? primaryNetFromLedger + totalDiscount
          : rawInvGrossSub > 0
          ? rawInvGrossSub
          : nonTaxIncomeOrExpenseSubtotal) * 100
      ) / 100;

      const netTaxableSubtotal = Math.max(0, Math.round((subtotal - totalDiscount) * 100) / 100);

      // Fold any invoice-level discount ledger proportionally into line discountPercent so edits stay consistent
      if (invoiceItems.length > 0 && invoiceLedgerDiscount > 0 && rawInvNetSub > 0) {
        const extraRatio = Math.min(1, invoiceLedgerDiscount / rawInvNetSub);
        invoiceItems.forEach((line) => {
          const gross = (Number(line.quantity) || 0) * (Number(line.rate) || 0);
          if (gross > 0) {
            const combinedPct = (1 - (1 - (line.discountPercent || 0) / 100) * (1 - extraRatio)) * 100;
            line.discountPercent = Math.round(Math.min(100, Math.max(0, combinedPct)) * 100) / 100;
            line.totalAmount = Math.round(gross * (1 - line.discountPercent / 100) * 100) / 100;
          }
        });
      }

      // Distribute tax proportionally across net item values
      if (invoiceItems.length > 0 && netTaxableSubtotal > 0 && totalTax > 0) {
        const totalLineNet = invoiceItems.reduce((s, l) => s + (l.totalAmount || 0), 0) || netTaxableSubtotal;
        const effTaxPct = Math.round((totalTax / netTaxableSubtotal) * 1000) / 10;
        invoiceItems.forEach((line) => {
          const share = totalLineNet > 0 ? line.totalAmount / totalLineNet : 1 / invoiceItems.length;
          const lineTax = Math.round(totalTax * share * 100) / 100;
          line.taxRate = effTaxPct;
          line.taxAmount = lineTax;
          line.totalAmount = Math.round((line.totalAmount + lineTax) * 100) / 100;
        });
      } else if (invoiceItems.length === 0) {
        const effTaxPct =
          netTaxableSubtotal > 0 && totalTax > 0
            ? Math.round((totalTax / netTaxableSubtotal) * 1000) / 10
            : 0;
        const svcDiscountPct =
          subtotal > 0 && totalDiscount > 0
            ? Math.round(Math.min(100, (totalDiscount / subtotal) * 100) * 100) / 100
            : 0;
        invoiceItems.push({
          id: nextId('line'),
          itemId: 'acc_service_imported',
          itemName: nonTaxLedgerNames[0] || narration || `${vchTypeRaw} Entry`,
          hsnSacCode: '9983',
          quantity: 1,
          unit: 'Unit',
          rate: subtotal,
          discountPercent: svcDiscountPct,
          taxRate: effTaxPct,
          taxAmount: totalTax,
          totalAmount: Math.round((netTaxableSubtotal + totalTax) * 100) / 100,
        });
      }

      const extraNet = extraLedgerLines.reduce((s, el) => s + expectedLineNet({
        ledgerName: el.accountName || '',
        debit: el.debit,
        credit: el.credit,
        amountAbs: Math.max(el.debit, el.credit),
        isPartyEntry: false,
        invAllocations: [],
      }), 0);
      const computedGrand = Math.round((netTaxableSubtotal + extraNet + totalTax + roundOffSigned) * 100) / 100;
      const grandTotal = partyLine && partyLine.amountAbs > 0 ? partyLine.amountAbs : computedGrand;
      const isInterState = igstAmount > 0 && cgstAmount === 0 && sgstAmount === 0;
      const companyState = existingData.company.state || companyInfo?.state || 'Delhi';
      const posState = party.state || companyState;
      const isCashSettled = normalizeNameKey(resolvedPartyName).includes('cash');

      const partyOverlay = partyGstOverlayById.get(party.id);
      const effectivePartyGstin =
        cleanValidTallyGstin(partyOverlay?.gstin ?? party.gstin) || cleanValidTallyGstin(partyGstin) || '';
      const effectivePartyGstCat: PartyMaster['gstCategory'] = isValid15Gstin(effectivePartyGstin)
        ? (partyOverlay?.gstCategory ?? party.gstCategory) !== 'UNREGISTERED'
          ? partyOverlay?.gstCategory ?? party.gstCategory
          : vchGstMeta.gstCategory !== 'UNREGISTERED'
          ? vchGstMeta.gstCategory
          : 'REGULAR'
        : partyOverlay?.gstCategory ?? party.gstCategory ?? 'UNREGISTERED';
      const resolvedPosState =
        findStateFromTextOrGstin(
          placeOfSupplyRaw || partyOverlay?.state || party.state || companyState,
          effectivePartyGstin
        ).state || posState;

      // Detect Cash or Bank ledger settlement when PARTYLEDGERNAME is Cash or a Bank Account
      const resolvedPartyKey = normalizeNameKey(resolvedPartyName);
      const existingCashOrBankAcc =
        existingAccountByKey.get(resolvedPartyKey) ||
        importedAccountByKey.get(resolvedPartyKey);
      const partyMappedGroupLow = (ledgerGroupByKey.get(resolvedPartyKey) || '').toLowerCase();
      const partyNameLow = cleanTallyLabel(resolvedPartyName).toLowerCase();
      const isPartyBank =
        !partyMappedGroupLow.includes('debtor') &&
        !partyMappedGroupLow.includes('creditor') &&
        ((existingCashOrBankAcc &&
          existingCashOrBankAcc.category === 'ASSET' &&
          (existingCashOrBankAcc.subCategory || '').toLowerCase().includes('bank') &&
          !(existingCashOrBankAcc.name || '').toLowerCase().includes('cash')) ||
          partyMappedGroupLow.includes('bank account') ||
          partyMappedGroupLow.includes('bank od') ||
          partyMappedGroupLow.includes('bank occ'));
      const isPartyCash =
        !isPartyBank &&
        !partyMappedGroupLow.includes('debtor') &&
        !partyMappedGroupLow.includes('creditor') &&
        (isCashSettled || partyMappedGroupLow.includes('cash'));
      const isImmediatePaid = isPartyCash || isPartyBank;
      const settlementAccountId = isImmediatePaid
        ? existingCashOrBankAcc?.id || (isPartyCash ? 'acc_cash' : undefined)
        : undefined;

      if (isSales) {
        importedInvoices.push({
          id: nextId('inv'),
          invoiceNumber: vchNumber,
          date,
          dueDate: date,
          invoiceType: totalTax > 0 ? 'TAX_INVOICE' : 'RETAIL_BILL',
          partyId: party.id,
          partyName: party.name,
          partyGstin: effectivePartyGstin,
          partyGstCategory: effectivePartyGstCat,
          partyAddress: party.address || '',
          partyState: resolvedPosState,
          placeOfSupply: resolvedPosState,
          isInterState,
          items: invoiceItems,
          subtotal,
          totalDiscount,
          cgstAmount,
          sgstAmount,
          igstAmount,
          totalTax,
          roundOff: roundOffSigned,
          grandTotal,
          amountPaid: isImmediatePaid ? grandTotal : 0,
          status: isImmediatePaid ? 'PAID' : 'UNPAID',
          paymentMode: isPartyBank ? 'BANK' : isPartyCash ? 'CASH' : 'CREDIT',
          ...(settlementAccountId ? { paymentAccountId: settlementAccountId } : {}),
          notes: narration || 'Imported from ERP XML',
          ...(primaryAccountId ? { primaryAccountId } : {}),
          ...(extraLedgerLines.length > 0 ? { extraLedgerLines } : {}),
          ...(ewayBillNumber ? { ewayBillNumber } : {}),
          ...(vehicleNo ? { vehicleNo } : {}),
          ...(transporterId ? { transporterId } : {}),
          ...(vchGuid ? { externalGuid: vchGuid } : {}),
        });
        return;
      }

      if (isPurchase) {
        const suppInv = (referenceNo || vchNumber).trim();
        importedPurchases.push({
          id: nextId('pur'),
          billNumber: vchNumber,
          supplierInvoiceNo: suppInv,
          date,
          dueDate: date,
          partyId: party.id,
          partyName: party.name,
          partyGstin: effectivePartyGstin,
          partyState: resolvedPosState,
          isInterState,
          items: invoiceItems,
          subtotal,
          cgstAmount,
          sgstAmount,
          igstAmount,
          totalTax,
          totalDiscount,
          roundOff: roundOffSigned,
          grandTotal,
          amountPaid: isImmediatePaid ? grandTotal : 0,
          status: isImmediatePaid ? 'PAID' : 'UNPAID',
          paymentMode: isPartyBank ? 'BANK' : isPartyCash ? 'CASH' : 'CREDIT',
          ...(settlementAccountId ? { paymentAccountId: settlementAccountId } : {}),
          notes: narration || 'Imported from ERP XML',
          ...(primaryAccountId ? { primaryAccountId } : {}),
          ...(extraLedgerLines.length > 0 ? { extraLedgerLines } : {}),
          ...(ewayBillNumber ? { ewayBillNumber } : {}),
          ...(vehicleNo ? { vehicleNo } : {}),
          ...(transporterId ? { transporterId } : {}),
          ...(vchGuid ? { externalGuid: vchGuid } : {}),
        });
        return;
      }

      // Debit Note / Credit Note (note.subtotal in accounting.ts is net taxable without subtracting totalDiscount)
      const noteType = isCreditNote ? 'CREDIT_NOTE' : 'DEBIT_NOTE';
      importedNotes.push({
        id: nextId('note'),
        noteNumber: vchNumber,
        type: noteType,
        date,
        partyId: party.id,
        partyName: party.name,
        partyGstin: effectivePartyGstin,
        ...(referenceNo ? { originalInvoiceNo: referenceNo } : {}),
        reason: 'Price Difference',
        items: invoiceItems,
        subtotal: netTaxableSubtotal,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTax,
        grandTotal,
        remarks: narration || 'Imported from ERP XML',
        ...(primaryAccountId ? { primaryAccountId } : {}),
        ...(extraLedgerLines.length > 0 ? { extraLedgerLines } : {}),
        ...(vchGuid ? { externalGuid: vchGuid } : {}),
      });
      return;
    }

    // Standard Accounting Vouchers: PAYMENT / RECEIPT / CONTRA / JOURNAL
    let mappedType: VoucherType = 'JOURNAL';
    if (vchTypeLow.includes('payment')) mappedType = 'PAYMENT';
    else if (vchTypeLow.includes('receipt')) mappedType = 'RECEIPT';
    else if (vchTypeLow.includes('contra')) mappedType = 'CONTRA';
    else if (vchTypeLow.includes('journal')) mappedType = 'JOURNAL';
    else {
      warnings.push(`Voucher #${vchNumber} (${vchTypeRaw}) mapped to JOURNAL.`);
    }

    const vchNoGuidKey = `${mappedType}|${vchTypeLow}|${vchNumber.trim().toLowerCase()}|${date}`;
    const vchPreExistKey = `${mappedType}|${vchNumber.trim().toLowerCase()}|${date}`;
    if (
      options.skipDuplicates &&
      !vchGuid &&
      (seenXmlNoGuidKeys.has(vchNoGuidKey) || preExistingVchKeys.has(vchPreExistKey))
    ) {
      duplicateVouchers++;
      return;
    }
    if (!vchGuid) seenXmlNoGuidKeys.add(vchNoGuidKey);

    // Extract Bank Clearance Date (<BANKERSDATE>) & Instrument/UTR No. from <BANKALLOCATIONS.LIST>
    const bankAllocNodes = getAllDescendantElements(vchEl, 'BANKALLOCATIONS.LIST');
    const rawBankersDate =
      getFirstChildText(vchEl, ['BANKERSDATE']) ||
      bankAllocNodes.map((b) => getFirstChildText(b, ['BANKERSDATE'])).find(Boolean) ||
      '';
    const bankersDate = rawBankersDate ? parseTallyDate(rawBankersDate) : undefined;
    const instrumentNumber =
      getFirstChildText(vchEl, ['INSTRUMENTNUMBER', 'CHEQUENUMBER']) ||
      bankAllocNodes.map((b) => getFirstChildText(b, ['INSTRUMENTNUMBER', 'CHEQUENUMBER'])).find(Boolean) ||
      '';

    const entries: JournalEntryLine[] = parsedLedgerLines.map((ln) => {
      const acc = resolveAccountForEntry(ln.ledgerName, ln.debit > 0);
      return {
        id: nextId('jel'),
        accountId: acc.id,
        accountName: acc.name,
        accountCode: acc.code,
        debit: ln.debit,
        credit: ln.credit,
        narration: ln.ledgerName !== acc.name ? `External Ledger: ${ln.ledgerName}` : '',
      };
    });

    if (entries.length < 2) {
      warnings.push(`Skipped voucher #${vchNumber} (${vchTypeRaw}): fewer than 2 valid ledger lines.`);
      return;
    }

    const drSum = Math.round(entries.reduce((s, e) => s + e.debit, 0) * 100) / 100;
    const crSum = Math.round(entries.reduce((s, e) => s + e.credit, 0) * 100) / 100;
    if (Math.abs(drSum - crSum) > 1) {
      warnings.push(`Voucher #${vchNumber} (${date}) skipped: Unbalanced Dr (₹${drSum}) vs Cr (₹${crSum}).`);
      return;
    }
    if (Math.abs(drSum - crSum) > 0 && Math.abs(drSum - crSum) <= 1) {
      // Absorb tiny decimal discrepancy on last line
      const diff = Math.round((drSum - crSum) * 100) / 100;
      if (diff > 0) entries[entries.length - 1].credit = Math.round((entries[entries.length - 1].credit + diff) * 100) / 100;
      else entries[entries.length - 1].debit = Math.round((entries[entries.length - 1].debit + Math.abs(diff)) * 100) / 100;
    }

    const matchedParty = partyLedgerName
      ? existingPartyByKey.get(normalizeNameKey(partyLedgerName)) ||
        importedPartyByKey.get(normalizeNameKey(partyLedgerName))
      : undefined;

    const totalAmount = Math.round(entries.reduce((s, e) => s + e.debit, 0) * 100) / 100;

    importedVouchers.push({
      id: nextId('vch'),
      voucherNumber: vchNumber,
      type: mappedType,
      date,
      ...(bankersDate ? { bankersDate, isReconciled: true, reconciledDate: bankersDate } : {}),
      ...(instrumentNumber ? { instrumentNumber, bankReferenceNo: instrumentNumber } : {}),
      ...(referenceNo ? { referenceNo } : {}),
      ...(matchedParty ? { partyId: matchedParty.id, partyName: matchedParty.name } : partyLedgerName ? { partyName: partyLedgerName } : {}),
      entries,
      totalAmount,
      narration: narration || `${vchTypeRaw} imported from ERP XML`,
      ...(vchGuid ? { externalGuid: vchGuid } : {}),
    });
  });

  // Reconcile imported items with Tally's authoritative explicit Closing Stock qty & value when present
  importedItems.forEach((itm) => {
    const metaInfo = itemMetaByKey.get(normalizeNameKey(itm.name));
    if (!metaInfo) return;
    if (metaInfo.hasExplicitClQty) {
      itm.currentStock = metaInfo.rawClQty;
      itm.importedClosingQty = metaInfo.rawClQty;
      if (Math.abs(metaInfo.absClVal) > 0 || metaInfo.rawClQty < 0) {
        itm.closingStockValue = Math.round(metaInfo.absClVal * 100) / 100;
      }
      if (metaInfo.derivedClRate > 0 && itm.purchasePrice <= 0) {
        itm.purchasePrice = Math.round(metaInfo.derivedClRate * 10000) / 10000;
      }
    }
  });

  // Final reconciliation pass: ensure every imported Sales/Purchase/Note receives the party's resolved GSTIN
  const finalPartyGstinById = new Map<
    string,
    { gstin: string; gstCategory: PartyMaster['gstCategory']; state: string }
  >();
  [...(existingData.parties || []), ...importedParties].forEach((p) => {
    const ov = partyGstOverlayById.get(p.id);
    const g = cleanValidTallyGstin(ov?.gstin ?? p.gstin);
    if (isValid15Gstin(g)) {
      finalPartyGstinById.set(p.id, {
        gstin: g,
        gstCategory:
          (ov?.gstCategory ?? p.gstCategory) !== 'UNREGISTERED'
            ? (ov?.gstCategory ?? p.gstCategory)
            : 'REGULAR',
        state: ov?.state || p.state || '',
      });
    }
  });

  importedInvoices.forEach((inv) => {
    const resolved = finalPartyGstinById.get(inv.partyId);
    if (resolved && !isValid15Gstin(inv.partyGstin)) {
      inv.partyGstin = resolved.gstin;
      inv.partyGstCategory = resolved.gstCategory;
      if (resolved.state) {
        inv.partyState = resolved.state;
        inv.placeOfSupply = resolved.state;
      }
    } else if (isValid15Gstin(inv.partyGstin) && inv.partyGstCategory === 'UNREGISTERED') {
      inv.partyGstCategory = 'REGULAR';
    }
  });
  importedPurchases.forEach((pur) => {
    const resolved = finalPartyGstinById.get(pur.partyId);
    if (resolved && !isValid15Gstin(pur.partyGstin)) {
      pur.partyGstin = resolved.gstin;
      if (resolved.state) pur.partyState = resolved.state;
    }
  });
  importedNotes.forEach((note) => {
    const resolved = finalPartyGstinById.get(note.partyId);
    if (resolved && !isValid15Gstin(note.partyGstin)) {
      note.partyGstin = resolved.gstin;
    }
  });

  const accountOpeningUpdates = Array.from(accountOpeningUpdateMap.values());
  const itemStockUpdates = Array.from(existingItemUpdateMap.values());
  const partyUpdates = Array.from(partyUpdateMap.values());

  return {
    success: true,
    warnings,
    companyInfo,
    ...(options.includeAccounts && importedAccountGroups.length > 0
      ? { accountGroups: importedAccountGroups }
      : {}),
    accounts: options.includeAccounts ? importedAccounts : [],
    parties: options.includeParties ? importedParties : [],
    items: options.includeItems ? importedItems : [],
    invoices: options.includeSales ? importedInvoices : [],
    purchaseInvoices: options.includePurchases ? importedPurchases : [],
    vouchers: options.includeVouchers ? importedVouchers : [],
    debitCreditNotes: options.includeNotes ? importedNotes : [],
    ...((options.includeAccounts || options.includeItems) && accountOpeningUpdates.length > 0
      ? { accountOpeningUpdates }
      : {}),
    ...((options.includeSales || options.includePurchases || options.includeItems) && itemStockUpdates.length > 0
      ? { itemStockUpdates }
      : {}),
    ...(partyUpdates.length > 0 ? { partyUpdates } : {}),
    stats: {
      rawGroups: groupEls.length,
      rawLedgers: ledgerEls.length,
      rawStockItems: stockItemEls.length,
      rawVouchers: voucherEls.length,
      skippedCancelledOrOptional,
      duplicateAccounts,
      duplicateParties,
      duplicateItems,
      duplicateInvoices,
      duplicatePurchases,
      duplicateVouchers,
      duplicateNotes,
      minDate: minDate || undefined,
      maxDate: maxDate || undefined,
    },
  };
}

/**
 * Generates a realistic Tally Prime XML export file for instant testing & verification.
 */
export function generateSampleTallyXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters &amp; Day Book</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>Shree Ganesh Electronics Pvt Ltd</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <COMPANY NAME="Shree Ganesh Electronics Pvt Ltd">
            <MAILINGNAME>Shree Ganesh Electronics Pvt Ltd</MAILINGNAME>
            <INCOMETAXNUMBER>AABCS1234H</INCOMETAXNUMBER>
            <STATENAME>Delhi</STATENAME>
            <PINCODE>110019</PINCODE>
            <PHONENUMBER>+91 9810011223</PHONENUMBER>
            <EMAIL>accounts@shreeganesh.in</EMAIL>
            <STARTINGFROM>20260401</STARTINGFROM>
            <BOOKSFROM>20260401</BOOKSFROM>
            <ADDRESS.LIST>
              <ADDRESS>Plot 42, Okhla Industrial Area Phase-III</ADDRESS>
              <ADDRESS>New Delhi</ADDRESS>
            </ADDRESS.LIST>
            <GSTREGISTRATIONDETAILS.LIST>
              <GSTIN>07AABCS1234H1Z8</GSTIN>
              <STATE>Delhi</STATE>
            </GSTREGISTRATIONDETAILS.LIST>
          </COMPANY>
          <GROUP NAME="HDFC Banking Group">
            <PARENT>Bank Accounts</PARENT>
          </GROUP>
          <LEDGER NAME="HDFC Current Account">
            <PARENT>HDFC Banking Group</PARENT>
            <OPENINGBALANCE>-250000.00</OPENINGBALANCE>
          </LEDGER>
          <LEDGER NAME="Godown Maintenance Expense">
            <PARENT>Indirect Expenses</PARENT>
            <OPENINGBALANCE>0</OPENINGBALANCE>
          </LEDGER>
          <LEDGER NAME="Bharat Electronics Retail">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>07AABCB1234F1Z5</PARTYGSTIN>
            <INCOMETAXNUMBER>AABCB1234F</INCOMETAXNUMBER>
            <LEDSTATENAME>Delhi</LEDSTATENAME>
            <PINCODE>110001</PINCODE>
            <LEDGERMOBILE>9811002233</LEDGERMOBILE>
            <EMAIL>accounts@bharatelec.in</EMAIL>
            <ADDRESS.LIST>
              <ADDRESS>Shop 14, Nehru Place Electronics Market</ADDRESS>
              <ADDRESS>New Delhi - 110001</ADDRESS>
            </ADDRESS.LIST>
            <OPENINGBALANCE>-45000.00</OPENINGBALANCE>
          </LEDGER>
          <LEDGER NAME="Metro Wholesale Distributors">
            <PARENT>Sundry Creditors</PARENT>
            <PARTYGSTIN>27AABCM5678K1Z2</PARTYGSTIN>
            <INCOMETAXNUMBER>AABCM5678K</INCOMETAXNUMBER>
            <LEDSTATENAME>Maharashtra</LEDSTATENAME>
            <PINCODE>400001</PINCODE>
            <LEDGERMOBILE>9820011223</LEDGERMOBILE>
            <ADDRESS.LIST>
              <ADDRESS>Plot 88, Lamington Road, Mumbai</ADDRESS>
            </ADDRESS.LIST>
            <OPENINGBALANCE>62000.00</OPENINGBALANCE>
          </LEDGER>
          <STOCKITEM NAME="LG Smart LED TV 43 Inch">
            <PARENT>Home Appliances</PARENT>
            <BASEUNITS>Pcs</BASEUNITS>
            <HSNCODE>8528</HSNCODE>
            <OPENINGBALANCE>15 Pcs</OPENINGBALANCE>
            <OPENINGVALUE>-330000.00</OPENINGVALUE>
            <STANDARDPRICE>28500.00</STANDARDPRICE>
            <GSTDETAILS.LIST>
              <STATEWISEDETAILS.LIST>
                <RATEDETAILS.LIST>
                  <GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD>
                  <GSTRATE>18</GSTRATE>
                </RATEDETAILS.LIST>
              </STATEWISEDETAILS.LIST>
            </GSTDETAILS.LIST>
          </STOCKITEM>
          <STOCKITEM NAME="HP LaserJet Pro M126nw">
            <PARENT>Printers &amp; IT</PARENT>
            <BASEUNITS>Pcs</BASEUNITS>
            <HSNCODE>8443</HSNCODE>
            <OPENINGBALANCE>10 Pcs</OPENINGBALANCE>
            <OPENINGRATE>14500.00/Pcs</OPENINGRATE>
            <STANDARDCOST>14500.00</STANDARDCOST>
            <STANDARDPRICE>18200.00</STANDARDPRICE>
            <GSTDETAILS.LIST>
              <STATEWISEDETAILS.LIST>
                <RATEDETAILS.LIST>
                  <GSTRATEDUTYHEAD>Integrated Tax</GSTRATEDUTYHEAD>
                  <GSTRATE>18</GSTRATE>
                </RATEDETAILS.LIST>
              </STATEWISEDETAILS.LIST>
            </GSTDETAILS.LIST>
          </STOCKITEM>

          <!-- Sample Purchase Voucher (Inter-State IGST 18%) -->
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>20260512</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>PUR-TAL-001</VOUCHERNUMBER>
            <REFERENCE>MWD/26-27/104</REFERENCE>
            <PARTYLEDGERNAME>Metro Wholesale Distributors</PARTYLEDGERNAME>
            <PARTYGSTIN>27AABCM5678K1Z2</PARTYGSTIN>
            <PLACEOFSUPPLY>Delhi</PLACEOFSUPPLY>
            <NARRATION>Purchased 5 LG Smart TV from Mumbai supplier</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Metro Wholesale Distributors</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>129800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-110000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input IGST</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-19800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>LG Smart LED TV 43 Inch</STOCKITEMNAME>
              <ACTUALQTY>5 Pcs</ACTUALQTY>
              <BILLEDQTY>5 Pcs</BILLEDQTY>
              <RATE>22000.00/Pcs</RATE>
              <AMOUNT>-110000.00</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>

          <!-- Sample Sales Voucher (Intra-State CGST+SGST 18% with 10% Customer Discount) -->
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>20260518</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TAL-INV-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Bharat Electronics Retail</PARTYLEDGERNAME>
            <PARTYGSTIN>07AABCB1234F1Z5</PARTYGSTIN>
            <PLACEOFSUPPLY>Delhi</PLACEOFSUPPLY>
            <NARRATION>Sold 2 LG Smart TVs with 10% Customer Discount and 18% GST</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Bharat Electronics Retail</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>-60534.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>51300.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>CGST Output</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>4617.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>SGST Output</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>4617.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>LG Smart LED TV 43 Inch</STOCKITEMNAME>
              <ACTUALQTY>2 Pcs</ACTUALQTY>
              <BILLEDQTY>2 Pcs</BILLEDQTY>
              <RATE>28500.00/Pcs</RATE>
              <DISCOUNT>10</DISCOUNT>
              <AMOUNT>51300.00</AMOUNT>
            </ALLINVENTORYENTRIES.LIST>
          </VOUCHER>

          <!-- Sample Receipt Voucher -->
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <DATE>20260520</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TAL-RCPT-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Bharat Electronics Retail</PARTYLEDGERNAME>
            <NARRATION>NEFT received against TAL-INV-001</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Current Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-50000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Bharat Electronics Retail</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
              <AMOUNT>50000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>

          <!-- Sample Payment Voucher -->
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>20260522</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>TAL-PAY-001</VOUCHERNUMBER>
            <NARRATION>Paid monthly godown maintenance</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Godown Maintenance Expense</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-8500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Current Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>8500.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}
