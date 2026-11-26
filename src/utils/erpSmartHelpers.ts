import {
  AppData,
  CompanyDetails,
  Godown,
  InvoiceItem,
  ItemBatch,
  ItemMaster,
  PartyMaster,
} from '../types';
import { INDIAN_STATE_CODES } from './gstin';
import { calculatePartyOutstanding } from './accounting';
import { getItemStockInGodown } from './inventoryBatches';
import { AppConfiguration } from './appConfig';

export type PriceTier = 'RETAIL' | 'WHOLESALE' | 'MRP';
export type NegativeStockPolicy = 'ALLOW' | 'WARN' | 'BLOCK';

export interface GstinExtractedMetadata {
  cleanGstin: string;
  isComplete: boolean;
  stateCode: string;
  stateName: string;
  pan: string;
  panValid: boolean;
  inferredGstCategory: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED';
}

/**
 * Extracts State Code, State Name, 10-character PAN (chars 3-12), and GST Registration Type
 * immediately as the user types a GSTIN.
 */
export function extractGstinMetadata(gstinInput: string): GstinExtractedMetadata {
  const cleanGstin = String(gstinInput || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 15);

  const prefix = cleanGstin.slice(0, 2);
  const stateName = prefix.length === 2 ? INDIAN_STATE_CODES[prefix] || '' : '';
  const stateCode = stateName ? prefix : '';

  const rawPanSlice = cleanGstin.length >= 12 ? cleanGstin.slice(2, 12) : '';
  const panValid = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(rawPanSlice);
  const pan = rawPanSlice;

  let inferredGstCategory: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' = 'UNREGISTERED';
  if (cleanGstin.length === 15) {
    const flag = cleanGstin.charAt(13);
    inferredGstCategory = flag !== 'Z' && flag !== '0' ? 'COMPOSITION' : 'REGULAR';
  }

  return {
    cleanGstin,
    isComplete: cleanGstin.length === 15,
    stateCode,
    stateName,
    pan,
    panValid,
    inferredGstCategory,
  };
}

/**
 * Adds creditDays to an ISO date string (YYYY-MM-DD) using UTC calendar arithmetic
 * to avoid local timezone DST shifts.
 */
export function computeDueDateFromCreditDays(
  invoiceDate: string,
  creditDays?: number,
  defaultDays = 15
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(invoiceDate || '').trim());
  const baseUtc = match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : Date.now();
  const days =
    typeof creditDays === 'number' && Number.isFinite(creditDays) && creditDays >= 0
      ? Math.floor(creditDays)
      : defaultDays;
  const target = new Date(baseUtc + days * 24 * 60 * 60 * 1000);
  return target.toISOString().split('T')[0];
}

export interface OverdueInvoiceInfo {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  daysOverdue: number;
  balanceDue: number;
}

export interface PartyCreditEvaluation {
  outstandingBalance: number;
  projectedBalance: number;
  creditLimit: number;
  creditLimitExceeded: boolean;
  excessAmount: number;
  creditDays: number;
  overdueInvoices: OverdueInvoiceInfo[];
  totalOverdueAmount: number;
}

/**
 * Evaluates a customer party's outstanding receivable, credit limit exposure,
 * and past-due unpaid invoices as of `asOfDate`.
 */
export function evaluatePartyCreditAndOverdue(
  party: PartyMaster | undefined,
  data: Pick<AppData, 'accounts' | 'invoices' | 'vouchers' | 'debitCreditNotes' | 'purchaseInvoices'>,
  asOfDate: string,
  newInvoiceUnpaid = 0,
  editingInvoiceId?: string,
  fallbackCreditLimit = 0
): PartyCreditEvaluation | null {
  if (!party) return null;

  const refDate = /^\d{4}-\d{2}-\d{2}$/.test(String(asOfDate || ''))
    ? asOfDate
    : new Date().toISOString().split('T')[0];

  const partyOut = calculatePartyOutstanding(party, data as AppData);
  const editingInv = editingInvoiceId
    ? (data.invoices || []).find((inv) => inv.id === editingInvoiceId)
    : undefined;
  const oldUnpaid = editingInv
    ? Math.max(0, Number(editingInv.grandTotal || 0) - Number(editingInv.amountPaid || 0))
    : 0;

  const creditLimit =
    Number(party.creditLimit || 0) > 0
      ? Number(party.creditLimit)
      : Math.max(0, Number(fallbackCreditLimit || 0));

  const projectedBalance =
    Math.round((partyOut.signedBalance - oldUnpaid + Math.max(0, newInvoiceUnpaid)) * 100) / 100;
  const creditLimitExceeded = creditLimit > 0 && projectedBalance > creditLimit + 0.005;
  const excessAmount = creditLimitExceeded
    ? Math.round((projectedBalance - creditLimit) * 100) / 100
    : 0;

  const refMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(refDate)!;
  const refUtc = Date.UTC(Number(refMatch[1]), Number(refMatch[2]) - 1, Number(refMatch[3]));

  const overdueInvoices: OverdueInvoiceInfo[] = [];
  let totalOverdueAmount = 0;

  for (const inv of data.invoices || []) {
    if (inv.id === editingInvoiceId) continue;
    if (inv.partyId !== party.id) continue;
    if (inv.status === 'CANCELLED' || inv.invoiceType === 'PROFORMA') continue;

    const balanceDue = Math.round((Number(inv.grandTotal || 0) - Number(inv.amountPaid || 0)) * 100) / 100;
    if (balanceDue <= 0.01) continue;

    const effectiveDueDate =
      inv.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(inv.dueDate)
        ? inv.dueDate
        : computeDueDateFromCreditDays(inv.date, party.creditDays, 0);

    if (effectiveDueDate < refDate) {
      const dueMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(effectiveDueDate);
      const dueUtc = dueMatch
        ? Date.UTC(Number(dueMatch[1]), Number(dueMatch[2]) - 1, Number(dueMatch[3]))
        : refUtc;
      const daysOverdue = Math.max(1, Math.round((refUtc - dueUtc) / (24 * 60 * 60 * 1000)));
      overdueInvoices.push({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        date: inv.date,
        dueDate: effectiveDueDate,
        daysOverdue,
        balanceDue,
      });
      totalOverdueAmount += balanceDue;
    }
  }

  overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  return {
    outstandingBalance: partyOut.signedBalance,
    projectedBalance,
    creditLimit,
    creditLimitExceeded,
    excessAmount,
    creditDays: Number(party.creditDays || 0),
    overdueInvoices,
    totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
  };
}

/**
 * Resolves the item selling rate based on selected pricing tier: Retail, Wholesale, or MRP.
 */
export function getItemPriceForTier(
  item: Pick<ItemMaster, 'salesPrice' | 'sellingPrice' | 'wholesalePrice' | 'mrp'>,
  tier: PriceTier,
  batch?: Pick<ItemBatch, 'salesRate' | 'mrp'>
): number {
  const retailRate = Number(batch?.salesRate || item.salesPrice || item.sellingPrice || 0);
  if (tier === 'WHOLESALE') {
    const wholesale = Number(item.wholesalePrice || 0);
    return wholesale > 0 ? wholesale : retailRate;
  }
  if (tier === 'MRP') {
    const mrpVal = Number(batch?.mrp || item.mrp || 0);
    return mrpVal > 0 ? mrpVal : retailRate;
  }
  return retailRate;
}

/**
 * Resolves active Negative Stock Policy ('ALLOW' | 'WARN' | 'BLOCK') across Company & App settings.
 */
export function resolveNegativeStockPolicy(
  company?: Partial<CompanyDetails>,
  appConfig?: Partial<AppConfiguration>
): NegativeStockPolicy {
  if (company?.negativeStockMode === 'ALLOW' || company?.negativeStockMode === 'WARN' || company?.negativeStockMode === 'BLOCK') {
    return company.negativeStockMode;
  }
  if (appConfig?.negativeStockMode === 'ALLOW' || appConfig?.negativeStockMode === 'WARN' || appConfig?.negativeStockMode === 'BLOCK') {
    return appConfig.negativeStockMode;
  }
  if (appConfig?.negativeStockWarning === false) return 'ALLOW';
  return 'WARN';
}

export interface NegativeStockViolation {
  itemId: string;
  name: string;
  unit: string;
  available: number;
  reqQty: number;
  shortfall: number;
}

/**
 * Evaluates whether requested billing lines exceed available godown stock.
 * Automatically ignores pure service items (Unit containing Service / Hr / Month).
 */
export function evaluateCartNegativeStock(
  requestedLines: Array<Pick<InvoiceItem, 'itemId' | 'quantity'>>,
  masterItems: ItemMaster[],
  godowns: Godown[],
  godownId: string,
  editingInvoice?: { items?: InvoiceItem[]; godownId?: string } | null
): NegativeStockViolation[] {
  const reqByItem = new Map<string, number>();
  for (const line of requestedLines) {
    if (!line.itemId) continue;
    const qty = Number(line.quantity) || 0;
    if (qty <= 0) continue;
    reqByItem.set(line.itemId, (reqByItem.get(line.itemId) || 0) + qty);
  }

  const violations: NegativeStockViolation[] = [];
  reqByItem.forEach((reqQty, itemId) => {
    const master = masterItems.find((i) => i.id === itemId);
    if (!master) return;
    const unitLower = (master.unit || '').toLowerCase();
    if (unitLower.includes('service') || unitLower.includes('hr') || unitLower.includes('month')) return;

    const previouslySoldQty = editingInvoice?.items
      ? editingInvoice.items
          .filter(
            (ol) =>
              ol.itemId === master.id &&
              (ol.godownId || editingInvoice.godownId || godownId) === godownId
          )
          .reduce((s, ol) => s + (Number(ol.quantity) || 0), 0)
      : 0;

    const available = getItemStockInGodown(master, godownId, godowns) + previouslySoldQty;
    if (reqQty > available + 0.0005) {
      violations.push({
        itemId: master.id,
        name: master.name,
        unit: master.unit || 'PCS',
        available: Math.round(available * 1000) / 1000,
        reqQty: Math.round(reqQty * 1000) / 1000,
        shortfall: Math.round((reqQty - available) * 1000) / 1000,
      });
    }
  });

  return violations;
}

/**
 * Generates standard NPCI UPI deep-link URI with formatted 2-decimal payable amount.
 */
export function buildUpiPaymentUri(params: {
  upiId?: string;
  payeeName?: string;
  amount: number;
  note?: string;
}): string {
  const pa = (params.upiId || '').trim() || 'hisabveda@upi';
  const pn = (params.payeeName || '').trim() || 'Store';
  const am = Math.max(0, Number(params.amount) || 0).toFixed(2);
  const tn = (params.note || '').trim();
  const base = `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${am}&cu=INR`;
  return tn ? `${base}&tn=${encodeURIComponent(tn)}` : base;
}
