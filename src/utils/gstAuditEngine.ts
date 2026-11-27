import * as XLSX from 'xlsx';
import {
  AppData,
  GstPortalData,
  GstPortalFiledReturn,
  Gstr9ManualAdjustments,
  GstrPortalPurchaseEntry,
  PartyMaster,
  PurchaseInvoice,
  SalesInvoice,
} from '../types';
import { INDIAN_STATE_CODES, validateGSTIN } from './gstin';

export interface ParsedDateParts {
  iso: string; // YYYY-MM-DD
  year: number;
  month: number; // 0..11
  day: number;
  monthKey: string; // YYYY-MM
  fp: string; // MMYYYY
}

const MONTH_ABBR: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

export const FY_MONTH_ORDER: Array<{ monthIdx: number; shortEn: string; fullEn: string; hi: string }> = [
  { monthIdx: 3, shortEn: 'Apr', fullEn: 'April', hi: 'अप्रैल' },
  { monthIdx: 4, shortEn: 'May', fullEn: 'May', hi: 'मई' },
  { monthIdx: 5, shortEn: 'Jun', fullEn: 'June', hi: 'जून' },
  { monthIdx: 6, shortEn: 'Jul', fullEn: 'July', hi: 'जुलाई' },
  { monthIdx: 7, shortEn: 'Aug', fullEn: 'August', hi: 'अगस्त' },
  { monthIdx: 8, shortEn: 'Sep', fullEn: 'September', hi: 'सितंबर' },
  { monthIdx: 9, shortEn: 'Oct', fullEn: 'October', hi: 'अक्टूबर' },
  { monthIdx: 10, shortEn: 'Nov', fullEn: 'November', hi: 'नवंबर' },
  { monthIdx: 11, shortEn: 'Dec', fullEn: 'December', hi: 'दिसंबर' },
  { monthIdx: 0, shortEn: 'Jan', fullEn: 'January', hi: 'जनवरी' },
  { monthIdx: 1, shortEn: 'Feb', fullEn: 'February', hi: 'फरवरी' },
  { monthIdx: 2, shortEn: 'Mar', fullEn: 'March', hi: 'मार्च' },
];

export function parseFlexibleDate(input?: string | number | null): ParsedDateParts | null {
  if (input === undefined || input === null || input === '') return null;

  // Handle Excel serial date numbers
  if (typeof input === 'number' && input > 20000 && input < 80000) {
    const utcDays = Math.floor(input - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth();
      const day = d.getUTCDate();
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return { iso: `${y}-${mm}-${dd}`, year: y, month: m, day, monthKey: `${y}-${mm}`, fp: `${mm}${y}` };
    }
  }

  const raw = String(input).split('T')[0].trim();
  if (!raw) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]) - 1;
    const day = Number(isoMatch[3]);
    if (m >= 0 && m <= 11 && day >= 1 && day <= 31) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return { iso: `${y}-${mm}-${dd}`, year: y, month: m, day, monthKey: `${y}-${mm}`, fp: `${mm}${y}` };
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]) - 1;
    const y = Number(dmyMatch[3]);
    if (m >= 0 && m <= 11 && day >= 1 && day <= 31) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return { iso: `${y}-${mm}-${dd}`, year: y, month: m, day, monthKey: `${y}-${mm}`, fp: `${mm}${y}` };
    }
  }

  // DD-MMM-YYYY or DD MMM YYYY (GST Portal style e.g. 14-Jul-2026)
  const textMatch = raw.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/](\d{2,4})$/);
  if (textMatch) {
    const day = Number(textMatch[1]);
    const m = MONTH_ABBR[textMatch[2].toLowerCase()];
    let y = Number(textMatch[3]);
    if (y < 100) y += 2000;
    if (m !== undefined && day >= 1 && day <= 31) {
      const mm = String(m + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return { iso: `${y}-${mm}-${dd}`, year: y, month: m, day, monthKey: `${y}-${mm}`, fp: `${mm}${y}` };
    }
  }

  const fallback = new Date(raw);
  if (!isNaN(fallback.getTime())) {
    const y = fallback.getFullYear();
    const m = fallback.getMonth();
    const day = fallback.getDate();
    const mm = String(m + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return { iso: `${y}-${mm}-${dd}`, year: y, month: m, day, monthKey: `${y}-${mm}`, fp: `${mm}${y}` };
  }

  return null;
}

export function normalizeFpToMonthKey(fp?: string): string {
  if (!fp) return '';
  const clean = String(fp).trim();
  if (/^\d{4}-\d{2}$/.test(clean)) return clean;
  if (/^\d{6}$/.test(clean)) {
    const mm = clean.slice(0, 2);
    const yyyy = clean.slice(2, 6);
    if (Number(mm) >= 1 && Number(mm) <= 12) return `${yyyy}-${mm}`;
  }
  return '';
}

export function getFyLabelFromDateStr(dateStr?: string): string {
  const parsed = parseFlexibleDate(dateStr);
  if (!parsed) return '2026-27';
  const startYr = parsed.month >= 3 ? parsed.year : parsed.year - 1;
  return `${startYr}-${String(startYr + 1).slice(-2)}`;
}

export function getFyMonths(fyLabel: string): Array<{
  monthKey: string;
  fp: string;
  labelEn: string;
  labelHi: string;
  year: number;
  monthIdx: number;
}> {
  const startYear = parseInt(fyLabel.split('-')[0], 10) || 2026;
  return FY_MONTH_ORDER.map((m) => {
    const calYear = m.monthIdx >= 3 ? startYear : startYear + 1;
    const mm = String(m.monthIdx + 1).padStart(2, '0');
    return {
      monthKey: `${calYear}-${mm}`,
      fp: `${mm}${calYear}`,
      labelEn: `${m.shortEn} ${calYear}`,
      labelHi: `${m.hi} ${calYear}`,
      year: calYear,
      monthIdx: m.monthIdx,
    };
  });
}

function safeNum(v: any): number {
  if (typeof v === 'number' && !isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[₹,\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

export function normalizeInvoiceNo(val?: string): string {
  return (val || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^0+/, '') || '';
}

export function normalizeGstin(val?: string): string {
  const clean = (val || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean === 'URP' || clean === 'UNREGISTERED' || clean === 'NA' || clean === 'NONE') {
    return '';
  }
  return clean;
}

export function isValidB2bGstin(val?: string): boolean {
  const g = normalizeGstin(val);
  return g.length === 15 && /^[0-9]{2}[A-Z0-9]{13}$/.test(g);
}

function normalizePartyLookupKey(name?: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function findLinkedParty(
  ref: { partyId?: string; partyName?: string; partyGstin?: string },
  parties?: PartyMaster[]
): PartyMaster | undefined {
  if (!parties || parties.length === 0) return undefined;
  if (ref.partyId) {
    const byId = parties.find((p) => p.id === ref.partyId);
    if (byId) return byId;
  }
  const nameKey = normalizePartyLookupKey(ref.partyName);
  if (nameKey) {
    const byName = parties.find((p) => normalizePartyLookupKey(p.name) === nameKey);
    if (byName) return byName;
  }
  const gstinKey = normalizeGstin(ref.partyGstin);
  if (gstinKey.length === 15) {
    return parties.find((p) => normalizeGstin(p.gstin) === gstinKey);
  }
  return undefined;
}

const STATE_NAME_ALIASES: Record<string, string> = {
  'delhi': '07',
  'new delhi': '07',
  'nct of delhi': '07',
  'jammu and kashmir': '01',
  'jammu & kashmir': '01',
  'j&k': '01',
  'dadra and nagar haveli': '26',
  'dadra & nagar haveli': '26',
  'daman and diu': '25',
  'daman & diu': '25',
  'andaman and nicobar': '35',
  'andaman and nicobar islands': '35',
  'andaman & nicobar': '35',
  'pondicherry': '34',
  'puducherry': '34',
  'orissa': '21',
  'odisha': '21',
  'uttaranchal': '05',
  'uttarakhand': '05',
  'chattisgarh': '22',
  'chhattisgarh': '22',
  'maharashtra': '27',
  'madhya pradesh': '23',
  'uttar pradesh': '09',
  'tamil nadu': '33',
  'west bengal': '19',
  'andhra pradesh': '37',
};

export function resolveOfficialStateCode(input?: {
  gstin?: string;
  stateCode?: string;
  stateName?: string;
  placeOfSupply?: string;
  fallbackStateCode?: string;
}): string {
  if (!input) return '';

  const tryPos = (raw?: string): string => {
    if (!raw) return '';
    const trimmed = raw.trim();
    if (!trimmed) return '';
    // Match "23-Madhya Pradesh" or "23"
    const codePrefix = trimmed.match(/^(\d{1,2})\b/);
    if (codePrefix) {
      const padded = codePrefix[1].padStart(2, '0');
      if (INDIAN_STATE_CODES[padded]) return padded;
    }
    const cleanText = trimmed.replace(/^\d{1,2}\s*[-–]\s*/, '').trim().toLowerCase();
    if (STATE_NAME_ALIASES[cleanText]) return STATE_NAME_ALIASES[cleanText];
    for (const [code, name] of Object.entries(INDIAN_STATE_CODES)) {
      const normName = name.toLowerCase();
      if (normName === cleanText || normName.includes(cleanText) || cleanText.includes(normName)) {
        return code;
      }
    }
    return '';
  };

  // Priority: explicit Place of Supply -> valid GSTIN prefix -> explicit stateCode -> stateName
  const fromPos = tryPos(input.placeOfSupply);
  if (fromPos) return fromPos;

  const cleanGstin = normalizeGstin(input.gstin);
  if (cleanGstin.length >= 2 && INDIAN_STATE_CODES[cleanGstin.slice(0, 2)]) {
    return cleanGstin.slice(0, 2);
  }

  if (input.stateCode) {
    const padded = input.stateCode.trim().padStart(2, '0');
    if (INDIAN_STATE_CODES[padded]) return padded;
  }

  const fromStateName = tryPos(input.stateName);
  if (fromStateName) return fromStateName;

  if (input.fallbackStateCode) {
    const padded = input.fallbackStateCode.trim().padStart(2, '0');
    if (INDIAN_STATE_CODES[padded]) return padded;
  }

  return '';
}

export function resolveIsInterStateSupply(params: {
  companyGstin?: string;
  companyState?: string;
  companyStateCode?: string;
  partyGstin?: string;
  partyState?: string;
  partyStateCode?: string;
  placeOfSupply?: string;
}): boolean {
  const companyCode = resolveOfficialStateCode({
    gstin: params.companyGstin,
    stateCode: params.companyStateCode,
    stateName: params.companyState,
  });

  const supplyCode = resolveOfficialStateCode({
    placeOfSupply: params.placeOfSupply,
    gstin: params.partyGstin,
    stateCode: params.partyStateCode,
    stateName: params.partyState,
  });

  if (companyCode && supplyCode) {
    return companyCode !== supplyCode;
  }

  const compName = (params.companyState || '').trim().toLowerCase();
  const destName = (params.placeOfSupply || params.partyState || '').trim().toLowerCase();
  if (compName && destName) {
    return compName !== destName;
  }

  return false;
}

export interface ResolvedTransactionGst {
  party?: PartyMaster;
  gstin: string;
  gstCategory: PartyMaster['gstCategory'];
  isB2b: boolean;
  state: string;
  stateCode: string;
  placeOfSupply: string;
}

export function resolveTransactionGstDetails(
  tx: {
    partyId?: string;
    partyName?: string;
    partyGstin?: string;
    partyGstCategory?: PartyMaster['gstCategory'];
    partyState?: string;
    placeOfSupply?: string;
  },
  parties?: PartyMaster[],
  fallbackState?: string
): ResolvedTransactionGst {
  const party = findLinkedParty(tx, parties);
  const masterGstin = normalizeGstin(party?.gstin);
  const txGstin = normalizeGstin(tx.partyGstin);

  let effectiveGstin = '';
  if (party) {
    if (masterGstin.length >= 15) {
      effectiveGstin = masterGstin;
    } else if (party.gstCategory === 'UNREGISTERED' && !masterGstin) {
      effectiveGstin = '';
    } else {
      effectiveGstin = masterGstin || txGstin;
    }
  } else {
    effectiveGstin = txGstin;
  }

  let effectiveCategory: PartyMaster['gstCategory'] = 'UNREGISTERED';
  if (party) {
    if (isValidB2bGstin(effectiveGstin)) {
      effectiveCategory =
        party.gstCategory && party.gstCategory !== 'UNREGISTERED'
          ? party.gstCategory
          : 'REGULAR';
    } else {
      effectiveCategory = party.gstCategory || 'UNREGISTERED';
    }
  } else if (isValidB2bGstin(effectiveGstin)) {
    effectiveCategory =
      tx.partyGstCategory && tx.partyGstCategory !== 'UNREGISTERED'
        ? tx.partyGstCategory
        : 'REGULAR';
  } else if (tx.partyGstCategory) {
    effectiveCategory = tx.partyGstCategory;
  }

  const gstinStateCode =
    effectiveGstin.length >= 2 && INDIAN_STATE_CODES[effectiveGstin.slice(0, 2)]
      ? effectiveGstin.slice(0, 2)
      : '';
  const gstinStateName = gstinStateCode ? INDIAN_STATE_CODES[gstinStateCode] : '';

  const effectiveState =
    (party?.state && party.state.trim()) ||
    gstinStateName ||
    (tx.partyState && tx.partyState.trim()) ||
    (tx.placeOfSupply && tx.placeOfSupply.trim()) ||
    fallbackState ||
    '';

  const effectiveStateCode =
    (party?.stateCode && party.stateCode.trim()) || gstinStateCode || '';

  const effectivePos =
    (party?.state && party.state.trim()) ||
    (tx.placeOfSupply && tx.placeOfSupply.trim()) ||
    gstinStateName ||
    effectiveState;

  const isB2b =
    isValidB2bGstin(effectiveGstin) && effectiveCategory !== 'UNREGISTERED';

  return {
    party,
    gstin: effectiveGstin,
    gstCategory: effectiveCategory,
    isB2b,
    state: effectiveState,
    stateCode: effectiveStateCode,
    placeOfSupply: effectivePos,
  };
}

export function resolveSalesInvoiceWithParty(
  inv: SalesInvoice,
  parties?: PartyMaster[],
  fallbackState?: string
): SalesInvoice {
  const resolved = resolveTransactionGstDetails(inv, parties, fallbackState);
  const nextPartyId = resolved.party?.id || inv.partyId;
  const nextPartyName = resolved.party?.name || inv.partyName;
  if (
    nextPartyId === inv.partyId &&
    nextPartyName === inv.partyName &&
    resolved.gstin === (inv.partyGstin || '') &&
    resolved.gstCategory === (inv.partyGstCategory || 'UNREGISTERED') &&
    (!resolved.state || resolved.state === inv.partyState) &&
    (!resolved.placeOfSupply || resolved.placeOfSupply === inv.placeOfSupply)
  ) {
    return inv;
  }
  return {
    ...inv,
    partyId: nextPartyId,
    partyName: nextPartyName,
    partyGstin: resolved.gstin,
    partyGstCategory: resolved.gstCategory,
    ...(resolved.state ? { partyState: resolved.state } : {}),
    ...(resolved.placeOfSupply ? { placeOfSupply: resolved.placeOfSupply } : {}),
  };
}

export function resolvePurchaseInvoiceWithParty(
  pur: PurchaseInvoice,
  parties?: PartyMaster[],
  fallbackState?: string
): PurchaseInvoice {
  const resolved = resolveTransactionGstDetails(pur, parties, fallbackState);
  const nextPartyId = resolved.party?.id || pur.partyId;
  const nextPartyName = resolved.party?.name || pur.partyName;
  if (
    nextPartyId === pur.partyId &&
    nextPartyName === pur.partyName &&
    resolved.gstin === (pur.partyGstin || '') &&
    (!resolved.state || resolved.state === pur.partyState)
  ) {
    return pur;
  }
  return {
    ...pur,
    partyId: nextPartyId,
    partyName: nextPartyName,
    partyGstin: resolved.gstin,
    ...(resolved.state ? { partyState: resolved.state } : {}),
  };
}

export { syncPartyDetailsAcrossAppData } from './partySync';

/**
 * Parses official GSTN Portal JSON files for both GSTR-2B and GSTR-2A.
 * Supports:
 * - GSTR-2B schema: data.docdata.b2b / docdata.b2b / docdata.b2ba / docdata.cdnr
 * - GSTR-2A schema: b2b[].inv[].itms[].itm_det / cdnr
 * - Custom exported array or { entries: [...] }
 */
export function parseGstr2PortalJson(
  rawText: string,
  source: 'GSTR2A' | 'GSTR2B'
): { entries: GstrPortalPurchaseEntry[]; returnPeriod: string; gstin?: string; warnings: string[] } {
  const parsed = JSON.parse(rawText);
  const root = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
  const warnings: string[] = [];
  const entries: GstrPortalPurchaseEntry[] = [];

  const rtnPrdRaw = root?.rtnprd || parsed?.rtnprd || root?.fp || parsed?.fp || '';
  const returnPeriodKey = normalizeFpToMonthKey(rtnPrdRaw) || '';
  const gstin = root?.gstin || parsed?.gstin;

  const docdata = root?.docdata || root;
  const b2bList = Array.isArray(docdata?.b2b)
    ? docdata.b2b
    : Array.isArray(docdata?.b2ba)
    ? docdata.b2ba
    : Array.isArray(parsed?.entries)
    ? parsed.entries
    : Array.isArray(parsed)
    ? parsed
    : [];

  b2bList.forEach((supplierBlock: any, sIdx: number) => {
    // Handle pre-flattened GstrPortalPurchaseEntry format
    if (supplierBlock && supplierBlock.invoiceNumber && !supplierBlock.inv) {
      const dt = parseFlexibleDate(supplierBlock.invoiceDate);
      const igst = safeNum(supplierBlock.igst);
      const cgst = safeNum(supplierBlock.cgst);
      const sgst = safeNum(supplierBlock.sgst);
      entries.push({
        id: supplierBlock.id || `${source.toLowerCase()}_${Date.now()}_${sIdx}`,
        source,
        returnPeriod: supplierBlock.returnPeriod || returnPeriodKey || dt?.monthKey || '',
        vendorGstin: normalizeGstin(supplierBlock.vendorGstin),
        vendorName: String(supplierBlock.vendorName || supplierBlock.vendorGstin || 'Vendor'),
        invoiceNumber: String(supplierBlock.invoiceNumber).trim(),
        invoiceDate: dt?.iso || String(supplierBlock.invoiceDate || ''),
        invoiceType: supplierBlock.invoiceType || 'Regular',
        taxableValue: safeNum(supplierBlock.taxableValue),
        igst,
        cgst,
        sgst,
        cess: safeNum(supplierBlock.cess),
        totalTax: safeNum(supplierBlock.totalTax) || igst + cgst + sgst,
        itcEligibility: supplierBlock.itcEligibility || 'ELIGIBLE',
        gstr1FilingStatus: supplierBlock.gstr1FilingStatus || 'Filed',
        gstr1FilingDate: supplierBlock.gstr1FilingDate || '',
        reverseCharge: Boolean(supplierBlock.reverseCharge),
      });
      return;
    }

    const vendorGstin = normalizeGstin(supplierBlock?.ctin || supplierBlock?.gstin);
    const vendorName = String(
      supplierBlock?.trdnm || supplierBlock?.cname || supplierBlock?.lgnm || vendorGstin || 'Portal Supplier'
    ).trim();
    const invList = Array.isArray(supplierBlock?.inv) ? supplierBlock.inv : [];
    const blockFilingStatus = supplierBlock?.cfs || supplierBlock?.cfs3b || '';
    const blockFilingDate = supplierBlock?.supfildt || '';

    invList.forEach((inv: any, iIdx: number) => {
      const invNo = String(inv?.inum || inv?.nt_num || '').trim();
      if (!invNo) return;
      const dtParsed = parseFlexibleDate(inv?.dt || inv?.idt || inv?.nt_dt);

      let txval = safeNum(inv?.txval);
      let igst = safeNum(inv?.igst ?? inv?.iamt);
      let cgst = safeNum(inv?.cgst ?? inv?.camt);
      let sgst = safeNum(inv?.sgst ?? inv?.samt);
      let cess = safeNum(inv?.cess ?? inv?.csamt);

      // GSTR-2A / detailed 2B puts line rates inside inv.items or inv.itms
      const itemArrays = Array.isArray(inv?.items) ? inv.items : Array.isArray(inv?.itms) ? inv.itms : [];
      if (itemArrays.length > 0 && txval === 0 && igst === 0 && cgst === 0 && sgst === 0) {
        itemArrays.forEach((line: any) => {
          const det = line?.itm_det || line;
          txval += safeNum(det?.txval);
          igst += safeNum(det?.igst ?? det?.iamt);
          cgst += safeNum(det?.cgst ?? det?.camt);
          sgst += safeNum(det?.sgst ?? det?.samt);
          cess += safeNum(det?.cess ?? det?.csamt);
        });
      }

      // If taxable missing but val & tax exist
      if (txval === 0 && safeNum(inv?.val) > 0) {
        txval = Math.max(0, safeNum(inv.val) - igst - cgst - sgst - cess);
      }

      const itcFlagRaw = String(inv?.itcavl || 'Y').toUpperCase();
      const itcEligibility: GstrPortalPurchaseEntry['itcEligibility'] =
        itcFlagRaw === 'N' ? 'INELIGIBLE' : 'ELIGIBLE';

      const invTypeRaw = String(inv?.typ || inv?.inv_typ || 'R').toUpperCase();
      const invoiceType: GstrPortalPurchaseEntry['invoiceType'] =
        invTypeRaw.includes('SEZ') ? 'SEZ' : invTypeRaw.includes('DE') ? 'Deemed Export' : 'Regular';

      entries.push({
        id: `${source.toLowerCase()}_${vendorGstin}_${invNo}_${sIdx}_${iIdx}`,
        source,
        returnPeriod: returnPeriodKey || dtParsed?.monthKey || '',
        vendorGstin,
        vendorName,
        invoiceNumber: invNo,
        invoiceDate: dtParsed?.iso || String(inv?.dt || inv?.idt || ''),
        invoiceType,
        taxableValue: Number(txval.toFixed(2)),
        igst: Number(igst.toFixed(2)),
        cgst: Number(cgst.toFixed(2)),
        sgst: Number(sgst.toFixed(2)),
        cess: Number(cess.toFixed(2)),
        totalTax: Number((igst + cgst + sgst).toFixed(2)),
        itcEligibility,
        gstr1FilingStatus: String(inv?.supfildt || blockFilingStatus || 'Y'),
        gstr1FilingDate: String(inv?.supfildt || blockFilingDate || ''),
        reverseCharge: String(inv?.rev || inv?.rchrg || 'N').toUpperCase() === 'Y',
      });
    });
  });

  // Also check Credit/Debit Notes (cdnr) if present
  const cdnrList = Array.isArray(docdata?.cdnr) ? docdata.cdnr : [];
  cdnrList.forEach((supplierBlock: any, sIdx: number) => {
    const vendorGstin = normalizeGstin(supplierBlock?.ctin);
    const vendorName = String(supplierBlock?.trdnm || supplierBlock?.cname || vendorGstin || 'Vendor Note').trim();
    const notes = Array.isArray(supplierBlock?.nt) ? supplierBlock.nt : [];
    notes.forEach((nt: any, nIdx: number) => {
      const noteNo = String(nt?.ntnum || nt?.nt_num || '').trim();
      if (!noteNo) return;
      const dtParsed = parseFlexibleDate(nt?.dt || nt?.nt_dt);
      const sign = String(nt?.typ || nt?.ntty || 'C').toUpperCase() === 'C' ? -1 : 1;

      let txval = safeNum(nt?.txval);
      let igst = safeNum(nt?.igst ?? nt?.iamt);
      let cgst = safeNum(nt?.cgst ?? nt?.camt);
      let sgst = safeNum(nt?.sgst ?? nt?.samt);
      const itemArrays = Array.isArray(nt?.items) ? nt.items : Array.isArray(nt?.itms) ? nt.itms : [];
      if (itemArrays.length > 0 && txval === 0) {
        itemArrays.forEach((line: any) => {
          const det = line?.itm_det || line;
          txval += safeNum(det?.txval);
          igst += safeNum(det?.igst ?? det?.iamt);
          cgst += safeNum(det?.cgst ?? det?.camt);
          sgst += safeNum(det?.sgst ?? det?.samt);
        });
      }

      entries.push({
        id: `${source.toLowerCase()}_cdnr_${vendorGstin}_${noteNo}_${sIdx}_${nIdx}`,
        source,
        returnPeriod: returnPeriodKey || dtParsed?.monthKey || '',
        vendorGstin,
        vendorName,
        invoiceNumber: noteNo,
        invoiceDate: dtParsed?.iso || '',
        invoiceType: 'Credit/Debit Note',
        taxableValue: Number((sign * txval).toFixed(2)),
        igst: Number((sign * igst).toFixed(2)),
        cgst: Number((sign * cgst).toFixed(2)),
        sgst: Number((sign * sgst).toFixed(2)),
        totalTax: Number((sign * (igst + cgst + sgst)).toFixed(2)),
        itcEligibility: String(nt?.itcavl || 'Y').toUpperCase() === 'N' ? 'INELIGIBLE' : 'ELIGIBLE',
        gstr1FilingStatus: String(nt?.supfildt || supplierBlock?.cfs || 'Y'),
      });
    });
  });

  if (entries.length === 0) {
    warnings.push('No B2B or CDNR invoice records found in the uploaded JSON file. Please verify this is a valid GSTR-2A / GSTR-2B JSON download from gst.gov.in.');
  }

  return { entries, returnPeriod: returnPeriodKey, gstin, warnings };
}

/**
 * Parses official GST Portal GSTR-2A / GSTR-2B Excel (.xlsx/.xls) or CSV exports.
 */
export function parseGstr2PortalSpreadsheet(
  buffer: ArrayBuffer,
  source: 'GSTR2A' | 'GSTR2B'
): { entries: GstrPortalPurchaseEntry[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' });
  const warnings: string[] = [];
  const entries: GstrPortalPurchaseEntry[] = [];

  // Prioritize B2B sheets over Read Me / Summary sheets
  const sortedSheets = [...wb.SheetNames].sort((a, b) => {
    const score = (name: string) => {
      const low = name.toLowerCase();
      if (low.includes('b2b') && !low.includes('b2ba')) return 0;
      if (low.includes('invoice') || low.includes('sheet1') || low.includes('data')) return 1;
      if (low.includes('read') || low.includes('help') || low.includes('itc')) return 9;
      return 4;
    };
    return score(a) - score(b);
  });

  for (const sheetName of sortedSheets) {
    if (sheetName.toLowerCase().includes('read me')) continue;
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    if (!rows || rows.length < 2) continue;

    // Locate header row dynamically within first 15 rows (GST portal XLSX puts merged headers on rows 4-6)
    let headerIdx = -1;
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const rowStr = (rows[r] || []).map((c: any) => String(c || '').toLowerCase()).join(' | ');
      if (
        (rowStr.includes('gstin') || rowStr.includes('ctin')) &&
        (rowStr.includes('invoice') || rowStr.includes('bill') || rowStr.includes('doc'))
      ) {
        headerIdx = r;
        break;
      }
    }
    if (headerIdx === -1) continue;

    // Some GST portal Excels split headers across 2 rows (e.g. Row 5: Invoice details | Tax Amount, Row 6: Number | Date | IGST | CGST | SGST)
    const headerRow1 = rows[headerIdx] || [];
    const headerRow2 = rows[headerIdx + 1] || [];
    const hasSubHeader = headerRow2.some((c: any) => {
      const s = String(c || '').toLowerCase();
      return s.includes('igst') || s.includes('cgst') || s.includes('sgst') || s.includes('taxable') || s.includes('number') || s.includes('date');
    });
    const combinedHeaders = headerRow1.map((h: any, idx: number) => {
      const p1 = String(h || '').trim();
      const p2 = hasSubHeader ? String(headerRow2[idx] || '').trim() : '';
      return `${p1} ${p2}`.trim().toLowerCase();
    });

    const findCol = (keywords: string[], exclude: string[] = []): number => {
      for (let i = 0; i < combinedHeaders.length; i++) {
        const h = combinedHeaders[i];
        if (!h) continue;
        if (exclude.some((ex) => h.includes(ex))) continue;
        if (keywords.some((kw) => h.includes(kw))) return i;
      }
      return -1;
    };

    const gstinCol = findCol(['gstin of supplier', 'gstin/uin', 'supplier gstin', 'vendor gstin', 'gstin', 'ctin']);
    const nameCol = findCol(['trade/legal name', 'trade name', 'legal name', 'supplier name', 'vendor name', 'party name']);
    const invNoCol = findCol(['invoice number', 'invoice no', 'bill no', 'document number', 'note number'], ['date', 'value', 'type']);
    const dateCol = findCol(['invoice date', 'bill date', 'document date', 'note date', 'date'], ['filing']);
    const taxableCol = findCol(['taxable value', 'taxable amt', 'taxable']);
    const igstCol = findCol(['integrated tax', 'igst']);
    const cgstCol = findCol(['central tax', 'cgst']);
    const sgstCol = findCol(['state/ut tax', 'state tax', 'sgst', 'utgst']);
    const cessCol = findCol(['cess']);
    const itcCol = findCol(['itc availability', 'itc available', 'eligibility']);
    const filingDateCol = findCol(['gstr-1/iff/gstr-5 filing date', 'filing date']);

    if (invNoCol === -1 || taxableCol === -1) continue;

    const startRow = hasSubHeader ? headerIdx + 2 : headerIdx + 1;
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const invNo = String(row[invNoCol] || '').trim();
      const gstin = gstinCol >= 0 ? normalizeGstin(row[gstinCol]) : '';
      if (!invNo || invNo.toLowerCase() === 'total') continue;
      if (!gstin && safeNum(row[taxableCol]) === 0) continue;

      const dtParsed = dateCol >= 0 ? parseFlexibleDate(row[dateCol]) : null;
      const taxableValue = safeNum(row[taxableCol]);
      const igst = igstCol >= 0 ? safeNum(row[igstCol]) : 0;
      const cgst = cgstCol >= 0 ? safeNum(row[cgstCol]) : 0;
      const sgst = sgstCol >= 0 ? safeNum(row[sgstCol]) : 0;
      const cess = cessCol >= 0 ? safeNum(row[cessCol]) : 0;
      const totalTax = igst + cgst + sgst;
      if (taxableValue === 0 && totalTax === 0) continue;

      const itcRaw = itcCol >= 0 ? String(row[itcCol] || '').toLowerCase() : 'yes';
      const itcEligibility: GstrPortalPurchaseEntry['itcEligibility'] =
        itcRaw.startsWith('n') || itcRaw.includes('ineligible') ? 'INELIGIBLE' : 'ELIGIBLE';

      entries.push({
        id: `${source.toLowerCase()}_xls_${sheetName}_${r}_${invNo}`,
        source,
        returnPeriod: dtParsed?.monthKey || '',
        vendorGstin: gstin,
        vendorName: (nameCol >= 0 ? String(row[nameCol] || '').trim() : '') || gstin || 'Supplier',
        invoiceNumber: invNo,
        invoiceDate: dtParsed?.iso || '',
        invoiceType: sheetName.toLowerCase().includes('cdnr') ? 'Credit/Debit Note' : 'Regular',
        taxableValue: Number(taxableValue.toFixed(2)),
        igst: Number(igst.toFixed(2)),
        cgst: Number(cgst.toFixed(2)),
        sgst: Number(sgst.toFixed(2)),
        cess: Number(cess.toFixed(2)),
        totalTax: Number(totalTax.toFixed(2)),
        itcEligibility,
        gstr1FilingDate: filingDateCol >= 0 ? String(row[filingDateCol] || '').trim() : '',
      });
    }

    if (entries.length > 0 && sheetName.toLowerCase().includes('b2b')) break;
  }

  if (entries.length === 0) {
    warnings.push('Could not detect GST Portal B2B columns (GSTIN, Invoice Number, Taxable Value, IGST/CGST/SGST) in this sheet.');
  }

  return { entries, warnings };
}

/**
 * Parses an official GSTN GSTR-1 JSON or GSTR-3B JSON file to extract filed return totals.
 */
export function parseGstr1Or3bPortalJson(rawText: string): {
  filedReturn?: GstPortalFiledReturn;
  error?: string;
} {
  try {
    const json = JSON.parse(rawText);
    const root = json?.data && typeof json.data === 'object' ? json.data : json;
    const periodKey = normalizeFpToMonthKey(root?.ret_period || root?.fp || json?.ret_period || json?.fp);
    if (!periodKey) {
      return { error: 'Could not detect return period (fp / ret_period MMYYYY) in the uploaded JSON.' };
    }

    // Detect GSTR-3B JSON
    if (root?.sec_sum) {
      const sup = root.sec_sum.sup_details || {};
      const osup = sup.osup_det || {};
      const ozero = sup.osup_zero || {};
      const onil = sup.osup_nil_exmp || {};
      const outwardTaxable = safeNum(osup.txval) + safeNum(ozero.txval) + safeNum(onil.txval);
      const outwardIgst = safeNum(osup.iamt) + safeNum(ozero.iamt);
      const outwardCgst = safeNum(osup.camt);
      const outwardSgst = safeNum(osup.samt);

      const itcNet = root.sec_sum.itc_elg?.itc_net || {};
      let itcIgst = safeNum(itcNet.iamt);
      let itcCgst = safeNum(itcNet.camt);
      let itcSgst = safeNum(itcNet.samt);
      if (itcIgst === 0 && itcCgst === 0 && itcSgst === 0 && Array.isArray(root.sec_sum.itc_elg?.itc_avl)) {
        root.sec_sum.itc_elg.itc_avl.forEach((row: any) => {
          itcIgst += safeNum(row.iamt);
          itcCgst += safeNum(row.camt);
          itcSgst += safeNum(row.samt);
        });
      }

      let taxPaidItc = 0;
      let taxPaidCash = 0;
      const taxDetails = root.sec_sum.tax_pay?.tax_details || [];
      if (Array.isArray(taxDetails)) {
        taxDetails.forEach((td: any) => {
          taxPaidItc += safeNum(td.iamt) + safeNum(td.camt) + safeNum(td.samt);
          taxPaidCash += safeNum(td.pad_cash);
        });
      }

      return {
        filedReturn: {
          id: `GSTR3B_${periodKey}`,
          returnType: 'GSTR3B',
          periodKey,
          outwardTaxable: Number(outwardTaxable.toFixed(2)),
          outwardIgst: Number(outwardIgst.toFixed(2)),
          outwardCgst: Number(outwardCgst.toFixed(2)),
          outwardSgst: Number(outwardSgst.toFixed(2)),
          itcIgst: Number(itcIgst.toFixed(2)),
          itcCgst: Number(itcCgst.toFixed(2)),
          itcSgst: Number(itcSgst.toFixed(2)),
          taxPaidItc: Number(taxPaidItc.toFixed(2)),
          taxPaidCash: Number(taxPaidCash.toFixed(2)),
          source: 'JSON_IMPORT',
        },
      };
    }

    // Detect GSTR-1 JSON (b2b, b2cl, b2cs, cdnr, exp)
    if (Array.isArray(root?.b2b) || Array.isArray(root?.b2cs) || Array.isArray(root?.b2cl) || Array.isArray(root?.exp)) {
      let txval = 0;
      let igst = 0;
      let cgst = 0;
      let sgst = 0;

      const accumulateItems = (itms: any[], sign = 1) => {
        if (!Array.isArray(itms)) return;
        itms.forEach((it) => {
          const det = it?.itm_det || it;
          txval += sign * safeNum(det?.txval);
          igst += sign * safeNum(det?.iamt ?? det?.igst);
          cgst += sign * safeNum(det?.camt ?? det?.cgst);
          sgst += sign * safeNum(det?.samt ?? det?.sgst);
        });
      };

      (root.b2b || []).forEach((sup: any) => {
        (sup.inv || []).forEach((inv: any) => accumulateItems(inv.itms || inv.items || [], 1));
      });
      (root.b2cl || []).forEach((st: any) => {
        (st.inv || []).forEach((inv: any) => accumulateItems(inv.itms || inv.items || [], 1));
      });
      (root.b2cs || []).forEach((row: any) => accumulateItems([row], 1));
      (root.exp || []).forEach((expBlock: any) => {
        (expBlock.inv || []).forEach((inv: any) => accumulateItems(inv.itms || inv.items || [], 1));
      });
      (root.cdnr || []).forEach((sup: any) => {
        (sup.nt || []).forEach((nt: any) => {
          const sign = String(nt?.ntty || 'C').toUpperCase() === 'C' ? -1 : 1;
          accumulateItems(nt.itms || nt.items || [], sign);
        });
      });

      return {
        filedReturn: {
          id: `GSTR1_${periodKey}`,
          returnType: 'GSTR1',
          periodKey,
          outwardTaxable: Number(txval.toFixed(2)),
          outwardIgst: Number(igst.toFixed(2)),
          outwardCgst: Number(cgst.toFixed(2)),
          outwardSgst: Number(sgst.toFixed(2)),
          itcIgst: 0,
          itcCgst: 0,
          itcSgst: 0,
          taxPaidItc: 0,
          taxPaidCash: 0,
          source: 'JSON_IMPORT',
        },
      };
    }

    return { error: 'Unrecognized JSON schema. Upload GSTR-1 or GSTR-3B JSON exported from GST Portal or this software.' };
  } catch (e: any) {
    return { error: e?.message || 'Invalid JSON file.' };
  }
}

export type Gstr2ReconcileMode = '2B_VS_BOOKS' | '2A_VS_BOOKS' | 'THREE_WAY';

export type Gstr2MatchStatus =
  | 'EXACT_MATCH'
  | 'TYPO_OR_DATE_DIFF'
  | 'AMOUNT_TAX_DIFF'
  | 'IN_2A_ONLY_NOT_2B'
  | 'MISSING_IN_PORTAL'
  | 'MISSING_IN_BOOKS';

export interface Gstr2ReconciledRow {
  id: string;
  vendorName: string;
  vendorGstin: string;
  invoiceNumber: string;
  invoiceDate: string;
  gstr2a?: GstrPortalPurchaseEntry;
  gstr2b?: GstrPortalPurchaseEntry;
  purchaseInvoice?: PurchaseInvoice;
  matchScore: number;
  status: Gstr2MatchStatus;
  taxDiff: number; // portalTax - booksTax
  taxableDiff: number;
  reasons: string[];
}

export interface VendorFollowUpItem {
  vendorGstin: string;
  vendorName: string;
  missingCount: number;
  atRiskItc: number;
  taxableTotal: number;
  billNumbers: string[];
  oldestDate: string;
}

function scoreEntryVsBook(
  portal: GstrPortalPurchaseEntry,
  book: PurchaseInvoice
): { score: number; reasons: string[]; taxDiff: number; taxableDiff: number } {
  let score = 0;
  const reasons: string[] = [];

  const g1 = normalizeGstin(portal.vendorGstin);
  const g2 = normalizeGstin(book.partyGstin);
  if (g1 && g2 && g1 === g2) {
    score += 35;
    reasons.push('GSTIN Exact');
  } else if (
    portal.vendorName &&
    book.partyName &&
    portal.vendorName.toLowerCase().trim() === book.partyName.toLowerCase().trim()
  ) {
    score += 20;
    reasons.push('Vendor Name Match');
  }

  const n1 = normalizeInvoiceNo(portal.invoiceNumber);
  const n2 = normalizeInvoiceNo(book.supplierInvoiceNo || book.billNumber);
  if (n1 && n2 && n1 === n2) {
    score += 40;
    reasons.push('Invoice No Exact');
  } else if (n1 && n2 && (n1.includes(n2) || n2.includes(n1))) {
    score += 24;
    reasons.push('Invoice No Fuzzy');
  }

  const taxDiff = Number((portal.totalTax - (book.totalTax || 0)).toFixed(2));
  const taxableDiff = Number((portal.taxableValue - (book.subtotal || 0)).toFixed(2));
  const absTaxDiff = Math.abs(taxDiff);

  if (absTaxDiff <= 2 && Math.abs(taxableDiff) <= 2) {
    score += 25;
    reasons.push('Tax & Value Exact');
  } else if (absTaxDiff <= 50) {
    score += 12;
    reasons.push(`Tax Diff ₹${taxDiff.toFixed(2)}`);
  } else {
    reasons.push(`Tax Variance ₹${taxDiff.toFixed(2)}`);
  }

  return { score, reasons, taxDiff, taxableDiff };
}

export function reconcileGstr2Entries(
  purchasesRaw: PurchaseInvoice[],
  gstr2aRaw: GstrPortalPurchaseEntry[],
  gstr2bRaw: GstrPortalPurchaseEntry[],
  mode: Gstr2ReconcileMode,
  parties?: PartyMaster[]
): {
  rows: Gstr2ReconciledRow[];
  summary: {
    booksTotalTax: number;
    booksCount: number;
    portal2aTax: number;
    portal2aCount: number;
    portal2bTax: number;
    portal2bCount: number;
    exactMatchedTax: number;
    varianceCount: number;
    excessInBooksTax: number;
    excessInBooksCount: number;
    missingInBooksTax: number;
    missingInBooksCount: number;
    in2aOnlyCount: number;
    in2aOnlyTax: number;
  };
  vendorFollowUps: VendorFollowUpItem[];
} {
  const purchases = (purchasesRaw || [])
    .filter((p) => p.status !== 'CANCELLED')
    .map((p) => resolvePurchaseInvoiceWithParty(p, parties));
  const gstr2a = gstr2aRaw || [];
  const gstr2b = gstr2bRaw || [];

  const primaryPortal = mode === '2A_VS_BOOKS' ? gstr2a : gstr2b;
  const matchedBookIds = new Set<string>();
  const matched2aIds = new Set<string>();
  const matched2bIds = new Set<string>();

  const findCounterpartIn2a = (targetGstin: string, targetInv: string, excludeMatched = true) => {
    const tg = normalizeGstin(targetGstin);
    const ti = normalizeInvoiceNo(targetInv);
    return gstr2a.find((e) => {
      if (excludeMatched && matched2aIds.has(e.id)) return false;
      const eg = normalizeGstin(e.vendorGstin);
      const ei = normalizeInvoiceNo(e.invoiceNumber);
      return (!tg || !eg || tg === eg) && ei && ti && (ei === ti || ei.includes(ti) || ti.includes(ei));
    });
  };

  const rows: Gstr2ReconciledRow[] = [];

  // Pass 1: Match primary portal list (2B or 2A) against Purchase Register
  primaryPortal.forEach((pEntry) => {
    let bestBook: PurchaseInvoice | undefined;
    let bestResult = { score: 0, reasons: [] as string[], taxDiff: 0, taxableDiff: 0 };

    purchases.forEach((book) => {
      if (matchedBookIds.has(book.id)) return;
      const res = scoreEntryVsBook(pEntry, book);
      if (res.score > bestResult.score) {
        bestResult = res;
        bestBook = book;
      }
    });

    const match2a =
      mode === '2A_VS_BOOKS'
        ? pEntry
        : findCounterpartIn2a(pEntry.vendorGstin, pEntry.invoiceNumber, true);
    if (match2a) matched2aIds.add(match2a.id);

    if (mode !== '2A_VS_BOOKS') matched2bIds.add(pEntry.id);

    if (bestBook && bestResult.score >= 52) {
      matchedBookIds.add(bestBook.id);
      let status: Gstr2MatchStatus = 'AMOUNT_TAX_DIFF';
      if (bestResult.score >= 96 && Math.abs(bestResult.taxDiff) <= 2) {
        status = 'EXACT_MATCH';
      } else if (Math.abs(bestResult.taxDiff) <= 2) {
        status = 'TYPO_OR_DATE_DIFF';
      }

      rows.push({
        id: `rec_${pEntry.id}_${bestBook.id}`,
        vendorName: pEntry.vendorName || bestBook.partyName,
        vendorGstin: pEntry.vendorGstin || bestBook.partyGstin || '',
        invoiceNumber: bestBook.supplierInvoiceNo || bestBook.billNumber || pEntry.invoiceNumber,
        invoiceDate: bestBook.date || pEntry.invoiceDate,
        gstr2a: match2a,
        gstr2b: mode === '2A_VS_BOOKS' ? undefined : pEntry,
        purchaseInvoice: bestBook,
        matchScore: bestResult.score,
        status,
        taxDiff: bestResult.taxDiff,
        taxableDiff: bestResult.taxableDiff,
        reasons: bestResult.reasons,
      });
    } else {
      rows.push({
        id: `rec_portal_only_${pEntry.id}`,
        vendorName: pEntry.vendorName,
        vendorGstin: pEntry.vendorGstin,
        invoiceNumber: pEntry.invoiceNumber,
        invoiceDate: pEntry.invoiceDate,
        gstr2a: match2a,
        gstr2b: mode === '2A_VS_BOOKS' ? undefined : pEntry,
        matchScore: 0,
        status: 'MISSING_IN_BOOKS',
        taxDiff: pEntry.totalTax,
        taxableDiff: pEntry.taxableValue,
        reasons: ['Filed by vendor on GST Portal, NOT recorded in Software Purchase Register (Unclaimed ITC)'],
      });
    }
  });

  // Pass 2 (for 3-way or 2B mode): Any unmatched 2A entries not present in 2B
  if (mode === 'THREE_WAY' || mode === '2B_VS_BOOKS') {
    gstr2a.forEach((aEntry) => {
      if (matched2aIds.has(aEntry.id)) return;
      let bestBook: PurchaseInvoice | undefined;
      let bestResult = { score: 0, reasons: [] as string[], taxDiff: 0, taxableDiff: 0 };

      purchases.forEach((book) => {
        if (matchedBookIds.has(book.id)) return;
        const res = scoreEntryVsBook(aEntry, book);
        if (res.score > bestResult.score) {
          bestResult = res;
          bestBook = book;
        }
      });

      if (bestBook && bestResult.score >= 52) {
        matchedBookIds.add(bestBook.id);
        matched2aIds.add(aEntry.id);
        rows.push({
          id: `rec_2a_only_${aEntry.id}_${bestBook.id}`,
          vendorName: aEntry.vendorName || bestBook.partyName,
          vendorGstin: aEntry.vendorGstin || bestBook.partyGstin || '',
          invoiceNumber: bestBook.supplierInvoiceNo || aEntry.invoiceNumber,
          invoiceDate: bestBook.date || aEntry.invoiceDate,
          gstr2a: aEntry,
          purchaseInvoice: bestBook,
          matchScore: bestResult.score,
          status: 'IN_2A_ONLY_NOT_2B',
          taxDiff: Number((0 - bestBook.totalTax).toFixed(2)),
          taxableDiff: Number((0 - bestBook.subtotal).toFixed(2)),
          reasons: ['Present in GSTR-2A & Books, NOT reflected in this month GSTR-2B (vendor filed after 11th/13th cutoff)'],
        });
      } else if (mode === 'THREE_WAY') {
        matched2aIds.add(aEntry.id);
        rows.push({
          id: `rec_2a_unclaimed_${aEntry.id}`,
          vendorName: aEntry.vendorName,
          vendorGstin: aEntry.vendorGstin,
          invoiceNumber: aEntry.invoiceNumber,
          invoiceDate: aEntry.invoiceDate,
          gstr2a: aEntry,
          matchScore: 0,
          status: 'MISSING_IN_BOOKS',
          taxDiff: aEntry.totalTax,
          taxableDiff: aEntry.taxableValue,
          reasons: ['In GSTR-2A only (not in 2B or Books)'],
        });
      }
    });
  }

  // Pass 3: Purchase bills in Books still unmatched -> EXCESS IN BOOKS / MISSING ON PORTAL!
  const vendorFollowUpMap = new Map<string, VendorFollowUpItem>();
  purchases.forEach((book) => {
    if (matchedBookIds.has(book.id)) return;
    const gstinKey = normalizeGstin(book.partyGstin) || book.partyName.toUpperCase();
    const invNo = book.supplierInvoiceNo || book.billNumber;

    rows.push({
      id: `rec_book_only_${book.id}`,
      vendorName: book.partyName,
      vendorGstin: book.partyGstin || 'NO GSTIN',
      invoiceNumber: invNo,
      invoiceDate: book.date,
      purchaseInvoice: book,
      matchScore: 0,
      status: 'MISSING_IN_PORTAL',
      taxDiff: Number((0 - (book.totalTax || 0)).toFixed(2)),
      taxableDiff: Number((0 - (book.subtotal || 0)).toFixed(2)),
      reasons: ['Recorded in Books, MISSING in GST Portal 2A/2B — Rule 36(4) / Sec 16(2)(aa) ITC At Risk!'],
    });

    const existingVendor = vendorFollowUpMap.get(gstinKey) || {
      vendorGstin: book.partyGstin || 'UNREGISTERED / MISSING',
      vendorName: book.partyName,
      missingCount: 0,
      atRiskItc: 0,
      taxableTotal: 0,
      billNumbers: [],
      oldestDate: book.date,
    };
    existingVendor.missingCount += 1;
    existingVendor.atRiskItc += book.totalTax || 0;
    existingVendor.taxableTotal += book.subtotal || 0;
    existingVendor.billNumbers.push(invNo);
    if (book.date && (!existingVendor.oldestDate || book.date < existingVendor.oldestDate)) {
      existingVendor.oldestDate = book.date;
    }
    vendorFollowUpMap.set(gstinKey, existingVendor);
  });

  const booksTotalTax = purchases.reduce((s, p) => s + (p.totalTax || 0), 0);
  const portal2aTax = gstr2a.reduce((s, e) => s + (e.totalTax || 0), 0);
  const portal2bTax = gstr2b.reduce((s, e) => s + (e.totalTax || 0), 0);

  const exactMatchedTax = rows
    .filter((r) => r.status === 'EXACT_MATCH' || r.status === 'TYPO_OR_DATE_DIFF')
    .reduce((s, r) => s + (r.purchaseInvoice?.totalTax || 0), 0);

  const excessRows = rows.filter((r) => r.status === 'MISSING_IN_PORTAL');
  const missingBookRows = rows.filter((r) => r.status === 'MISSING_IN_BOOKS');
  const in2aOnlyRows = rows.filter((r) => r.status === 'IN_2A_ONLY_NOT_2B');

  return {
    rows,
    summary: {
      booksTotalTax,
      booksCount: purchases.length,
      portal2aTax,
      portal2aCount: gstr2a.length,
      portal2bTax,
      portal2bCount: gstr2b.length,
      exactMatchedTax,
      varianceCount: rows.filter((r) => r.status === 'AMOUNT_TAX_DIFF').length,
      excessInBooksTax: excessRows.reduce((s, r) => s + (r.purchaseInvoice?.totalTax || 0), 0),
      excessInBooksCount: excessRows.length,
      missingInBooksTax: missingBookRows.reduce((s, r) => s + (r.gstr2b?.totalTax || r.gstr2a?.totalTax || 0), 0),
      missingInBooksCount: missingBookRows.length,
      in2aOnlyCount: in2aOnlyRows.length,
      in2aOnlyTax: in2aOnlyRows.reduce((s, r) => s + (r.purchaseInvoice?.totalTax || 0), 0),
    },
    vendorFollowUps: Array.from(vendorFollowUpMap.values()).sort((a, b) => b.atRiskItc - a.atRiskItc),
  };
}

export interface MonthlyGstAuditRow {
  monthKey: string;
  fp: string;
  labelEn: string;
  labelHi: string;
  booksSalesCount: number;
  booksOutwardTaxable: number;
  booksOutwardIgst: number;
  booksOutwardCgst: number;
  booksOutwardSgst: number;
  booksOutwardTotalTax: number;
  booksPurchaseCount: number;
  booksInwardTaxable: number;
  booksItcIgst: number;
  booksItcCgst: number;
  booksItcSgst: number;
  booksItcTotal: number;
  portalGstr1?: GstPortalFiledReturn;
  portalGstr3b?: GstPortalFiledReturn;
  portal2aCount: number;
  portal2aItc: number;
  portal2bCount: number;
  portal2bItc: number;
  // Audit Variances
  outwardDiffGstr1VsBooks: number; // Portal GSTR-1 Tax - Books Outward Tax
  outwardDiffGstr3bVsGstr1: number; // 3B Output Tax - GSTR1 Output Tax
  itcDiffBooksVs3b: number; // Books Purchase ITC - 3B Claimed ITC
  itcDiff3bVs2b: number; // 3B Claimed ITC - Portal 2B Eligible ITC (Positive => Over-claimed!)
  itcDiffBooksVs2b: number; // Books Purchase ITC - Portal 2B Eligible ITC (Positive => Excess Purchase Bills in Software missing on Portal!)
  purchaseBillCountDelta: number; // Books Purchase Bills - Portal 2B Bills
  auditStatus: 'RECONCILED' | 'OUTWARD_MISMATCH' | 'ITC_AT_RISK' | 'BOTH_MISMATCH' | 'PORTAL_PENDING';
}

export interface AdvancedGstRiskFinding {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  ruleCode: string;
  titleEn: string;
  titleHi: string;
  detailEn: string;
  detailHi: string;
  amountAtRisk: number;
  affectedRefs: string[];
}

export interface GstAuditReportResult {
  fyLabel: string;
  monthlyRows: MonthlyGstAuditRow[];
  totals: {
    booksSalesCount: number;
    booksOutwardTaxable: number;
    booksOutwardIgst: number;
    booksOutwardCgst: number;
    booksOutwardSgst: number;
    booksOutwardTax: number;
    portalGstr1Taxable: number;
    portalGstr1Tax: number;
    portalGstr3bOutwardTaxable: number;
    portalGstr3bOutwardTax: number;
    booksPurchaseCount: number;
    booksInwardTaxable: number;
    booksItcIgst: number;
    booksItcCgst: number;
    booksItcSgst: number;
    booksItcTotal: number;
    portalGstr3bItcTotal: number;
    portal2aCount: number;
    portal2aItc: number;
    portal2bCount: number;
    portal2bItc: number;
    portalTaxPaidCash: number;
    portalTaxPaidItc: number;
  };
  findings: AdvancedGstRiskFinding[];
  complianceScore: number; // 0-100 based strictly on real audit deltas
}

export function computeGstAuditReport(
  data: AppData,
  fyLabel: string,
  gstPortalDataOverride?: GstPortalData
): GstAuditReportResult {
  const portalData = gstPortalDataOverride || data.gstPortalData || {};
  const fyMonths = getFyMonths(fyLabel);
  const fyMonthKeys = new Set(fyMonths.map((m) => m.monthKey));

  const filedReturns = portalData.filedReturns || [];
  const gstr2aEntries = portalData.gstr2aEntries || [];
  const gstr2bEntries = portalData.gstr2bEntries || [];

  const getEntryMonthKey = (dateStr?: string, returnPeriod?: string): string => {
    const fromDate = parseFlexibleDate(dateStr)?.monthKey;
    if (fromDate && fyMonthKeys.has(fromDate)) return fromDate;
    const fromRp = normalizeFpToMonthKey(returnPeriod);
    if (fromRp && fyMonthKeys.has(fromRp)) return fromRp;
    return fromDate || fromRp || '';
  };

  const monthlyRows: MonthlyGstAuditRow[] = fyMonths.map((m) => {
    // 1. Outward Supplies (Sales Invoices minus Credit Notes + Debit Notes)
    const monthSales = (data.invoices || []).filter(
      (i) => i.status !== 'CANCELLED' && parseFlexibleDate(i.date)?.monthKey === m.monthKey
    );
    const monthNotes = (data.debitCreditNotes || []).filter(
      (n) => parseFlexibleDate(n.date)?.monthKey === m.monthKey
    );

    let booksOutwardTaxable = 0;
    let booksOutwardIgst = 0;
    let booksOutwardCgst = 0;
    let booksOutwardSgst = 0;

    monthSales.forEach((inv) => {
      booksOutwardTaxable += Math.max(0, (inv.subtotal || 0) - (inv.totalDiscount || 0));
      booksOutwardIgst += inv.igstAmount || 0;
      booksOutwardCgst += inv.cgstAmount || 0;
      booksOutwardSgst += inv.sgstAmount || 0;
    });
    monthNotes.forEach((nt) => {
      const sign = nt.type === 'CREDIT_NOTE' ? -1 : 1;
      booksOutwardTaxable += sign * (nt.subtotal || 0);
      booksOutwardIgst += sign * (nt.igstAmount || 0);
      booksOutwardCgst += sign * (nt.cgstAmount || 0);
      booksOutwardSgst += sign * (nt.sgstAmount || 0);
    });

    const booksOutwardTotalTax = booksOutwardIgst + booksOutwardCgst + booksOutwardSgst;

    // 2. Inward Purchases & ITC from Purchase Invoices + Direct Expense ITC Vouchers
    const monthPurchases = (data.purchaseInvoices || []).filter(
      (p) => p.status !== 'CANCELLED' && parseFlexibleDate(p.date)?.monthKey === m.monthKey
    );
    let booksInwardTaxable = 0;
    let booksItcIgst = 0;
    let booksItcCgst = 0;
    let booksItcSgst = 0;

    monthPurchases.forEach((p) => {
      booksInwardTaxable += Math.max(0, (p.subtotal || 0) - (p.totalDiscount || 0));
      booksItcIgst += p.igstAmount || 0;
      booksItcCgst += p.cgstAmount || 0;
      booksItcSgst += p.sgstAmount || 0;
    });

    // Include standalone voucher ITC debits (for non-PurchaseBill expenses like Bank/Rent/Software GST)
    (data.vouchers || []).forEach((v) => {
      if (parseFlexibleDate(v.date)?.monthKey !== m.monthKey) return;
      (v.entries || []).forEach((e) => {
        if (e.debit > 0) {
          if (e.accountId === 'acc_itc_igst') booksItcIgst += e.debit;
          if (e.accountId === 'acc_itc_cgst') booksItcCgst += e.debit;
          if (e.accountId === 'acc_itc_sgst') booksItcSgst += e.debit;
        }
      });
    });

    const booksItcTotal = booksItcIgst + booksItcCgst + booksItcSgst;

    // 3. Portal Returns (GSTR-1 & GSTR-3B)
    const portalGstr1 = filedReturns.find((r) => r.returnType === 'GSTR1' && r.periodKey === m.monthKey);
    const portalGstr3b = filedReturns.find((r) => r.returnType === 'GSTR3B' && r.periodKey === m.monthKey);

    // 4. Portal 2A & 2B
    const month2a = gstr2aEntries.filter((e) => getEntryMonthKey(e.invoiceDate, e.returnPeriod) === m.monthKey);
    const month2b = gstr2bEntries.filter((e) => getEntryMonthKey(e.invoiceDate, e.returnPeriod) === m.monthKey);

    const portal2aItc = month2a.filter((e) => e.itcEligibility !== 'INELIGIBLE').reduce((s, e) => s + e.totalTax, 0);
    const portal2bItc = month2b.filter((e) => e.itcEligibility !== 'INELIGIBLE').reduce((s, e) => s + e.totalTax, 0);

    const g1Tax = portalGstr1 ? portalGstr1.outwardIgst + portalGstr1.outwardCgst + portalGstr1.outwardSgst : 0;
    const g3bOutTax = portalGstr3b ? portalGstr3b.outwardIgst + portalGstr3b.outwardCgst + portalGstr3b.outwardSgst : 0;
    const g3bItc = portalGstr3b ? portalGstr3b.itcIgst + portalGstr3b.itcCgst + portalGstr3b.itcSgst : 0;

    const outwardDiffGstr1VsBooks = portalGstr1 ? Number((g1Tax - booksOutwardTotalTax).toFixed(2)) : 0;
    const outwardDiffGstr3bVsGstr1 = portalGstr1 && portalGstr3b ? Number((g3bOutTax - g1Tax).toFixed(2)) : 0;
    const itcDiffBooksVs3b = portalGstr3b ? Number((booksItcTotal - g3bItc).toFixed(2)) : 0;
    const itcDiff3bVs2b = portalGstr3b && month2b.length > 0 ? Number((g3bItc - portal2bItc).toFixed(2)) : 0;
    const itcDiffBooksVs2b = month2b.length > 0 || (monthPurchases.length > 0 && portal2bItc > 0)
      ? Number((booksItcTotal - portal2bItc).toFixed(2))
      : monthPurchases.length > 0 && gstr2bEntries.length > 0
      ? Number(booksItcTotal.toFixed(2))
      : 0;
    const purchaseBillCountDelta = monthPurchases.length - month2b.length;

    const hasOutwardIssue =
      Math.abs(outwardDiffGstr1VsBooks) > 5 || Math.abs(outwardDiffGstr3bVsGstr1) > 5;
    const hasItcIssue =
      itcDiff3bVs2b > 5 ||
      (gstr2bEntries.length > 0 && itcDiffBooksVs2b > 5) ||
      Math.abs(itcDiffBooksVs3b) > 5;

    let auditStatus: MonthlyGstAuditRow['auditStatus'] = 'PORTAL_PENDING';
    if (!portalGstr1 && !portalGstr3b && month2b.length === 0 && month2a.length === 0) {
      auditStatus = 'PORTAL_PENDING';
    } else if (hasOutwardIssue && hasItcIssue) {
      auditStatus = 'BOTH_MISMATCH';
    } else if (hasOutwardIssue) {
      auditStatus = 'OUTWARD_MISMATCH';
    } else if (hasItcIssue) {
      auditStatus = 'ITC_AT_RISK';
    } else {
      auditStatus = 'RECONCILED';
    }

    return {
      monthKey: m.monthKey,
      fp: m.fp,
      labelEn: m.labelEn,
      labelHi: m.labelHi,
      booksSalesCount: monthSales.length,
      booksOutwardTaxable,
      booksOutwardIgst,
      booksOutwardCgst,
      booksOutwardSgst,
      booksOutwardTotalTax,
      booksPurchaseCount: monthPurchases.length,
      booksInwardTaxable,
      booksItcIgst,
      booksItcCgst,
      booksItcSgst,
      booksItcTotal,
      portalGstr1,
      portalGstr3b,
      portal2aCount: month2a.length,
      portal2aItc,
      portal2bCount: month2b.length,
      portal2bItc,
      outwardDiffGstr1VsBooks,
      outwardDiffGstr3bVsGstr1,
      itcDiffBooksVs3b,
      itcDiff3bVs2b,
      itcDiffBooksVs2b,
      purchaseBillCountDelta,
      auditStatus,
    };
  });

  // Aggregate Totals
  const totals = monthlyRows.reduce(
    (acc, r) => {
      acc.booksSalesCount += r.booksSalesCount;
      acc.booksOutwardTaxable += r.booksOutwardTaxable;
      acc.booksOutwardIgst += r.booksOutwardIgst;
      acc.booksOutwardCgst += r.booksOutwardCgst;
      acc.booksOutwardSgst += r.booksOutwardSgst;
      acc.booksOutwardTax += r.booksOutwardTotalTax;
      if (r.portalGstr1) {
        acc.portalGstr1Taxable += r.portalGstr1.outwardTaxable;
        acc.portalGstr1Tax += r.portalGstr1.outwardIgst + r.portalGstr1.outwardCgst + r.portalGstr1.outwardSgst;
      }
      if (r.portalGstr3b) {
        acc.portalGstr3bOutwardTaxable += r.portalGstr3b.outwardTaxable;
        acc.portalGstr3bOutwardTax += r.portalGstr3b.outwardIgst + r.portalGstr3b.outwardCgst + r.portalGstr3b.outwardSgst;
        acc.portalGstr3bItcTotal += r.portalGstr3b.itcIgst + r.portalGstr3b.itcCgst + r.portalGstr3b.itcSgst;
        acc.portalTaxPaidCash += r.portalGstr3b.taxPaidCash || 0;
        acc.portalTaxPaidItc += r.portalGstr3b.taxPaidItc || 0;
      }
      acc.booksPurchaseCount += r.booksPurchaseCount;
      acc.booksInwardTaxable += r.booksInwardTaxable;
      acc.booksItcIgst += r.booksItcIgst;
      acc.booksItcCgst += r.booksItcCgst;
      acc.booksItcSgst += r.booksItcSgst;
      acc.booksItcTotal += r.booksItcTotal;
      acc.portal2aCount += r.portal2aCount;
      acc.portal2aItc += r.portal2aItc;
      acc.portal2bCount += r.portal2bCount;
      acc.portal2bItc += r.portal2bItc;
      return acc;
    },
    {
      booksSalesCount: 0,
      booksOutwardTaxable: 0,
      booksOutwardIgst: 0,
      booksOutwardCgst: 0,
      booksOutwardSgst: 0,
      booksOutwardTax: 0,
      portalGstr1Taxable: 0,
      portalGstr1Tax: 0,
      portalGstr3bOutwardTaxable: 0,
      portalGstr3bOutwardTax: 0,
      booksPurchaseCount: 0,
      booksInwardTaxable: 0,
      booksItcIgst: 0,
      booksItcCgst: 0,
      booksItcSgst: 0,
      booksItcTotal: 0,
      portalGstr3bItcTotal: 0,
      portal2aCount: 0,
      portal2aItc: 0,
      portal2bCount: 0,
      portal2bItc: 0,
      portalTaxPaidCash: 0,
      portalTaxPaidItc: 0,
    }
  );

  // Advanced Audit Risk Scanner
  const findings: AdvancedGstRiskFinding[] = [];
  let penaltyPoints = 0;

  // 1. Purchase Bills > Portal 2A/2B (Excess Books ITC vs Portal)
  const allFyPurchases = (data.purchaseInvoices || []).filter(
    (p) => p.status !== 'CANCELLED' && getFyLabelFromDateStr(p.date) === fyLabel
  );
  if (allFyPurchases.length > 0 && (gstr2bEntries.length > 0 || gstr2aEntries.length > 0)) {
    const twoBRec = reconcileGstr2Entries(
      allFyPurchases,
      gstr2aEntries,
      gstr2bEntries,
      gstr2bEntries.length > 0 ? '2B_VS_BOOKS' : '2A_VS_BOOKS',
      data.parties
    );
    if (twoBRec.summary.excessInBooksCount > 0) {
      penaltyPoints += Math.min(30, twoBRec.summary.excessInBooksCount * 6);
      findings.push({
        id: 'risk_excess_purchase_books',
        severity: 'CRITICAL',
        ruleCode: 'Sec 16(2)(aa) / Rule 36(4)',
        titleEn: `${twoBRec.summary.excessInBooksCount} Purchase Bills in Software Missing on GST Portal (2A/2B)`,
        titleHi: `सॉफ्टवेयर में ${twoBRec.summary.excessInBooksCount} परचेज बिल ज्यादा हैं जो पोर्टल (2A/2B) में नहीं दिख रहे`,
        detailEn: `Your Books show ${allFyPurchases.length} purchase bills, but ${twoBRec.summary.excessInBooksCount} bill(s) are NOT reflecting in Vendor GSTR-1 / GSTR-2B. Claiming this ITC risks DRC-01 / ASMT-10 demand notices.`,
        detailHi: `आपकी बुक्स में ${allFyPurchases.length} खरीद बिल दर्ज हैं लेकिन उनमें से ${twoBRec.summary.excessInBooksCount} बिल विक्रेता द्वारा पोर्टल पर अपलोड न होने के कारण 2A/2B में नहीं हैं। इस पर ITC लेने से नोटिस का जोखिम है।`,
        amountAtRisk: twoBRec.summary.excessInBooksTax,
        affectedRefs: twoBRec.rows
          .filter((r) => r.status === 'MISSING_IN_PORTAL')
          .slice(0, 8)
          .map((r) => `${r.invoiceNumber} (${r.vendorName})`),
      });
    }
    if (twoBRec.summary.missingInBooksCount > 0) {
      findings.push({
        id: 'risk_unclaimed_portal_itc',
        severity: 'INFO',
        ruleCode: 'Sec 16(4) Unclaimed ITC',
        titleEn: `${twoBRec.summary.missingInBooksCount} Vendor Bills Present on GST Portal Missing in Books`,
        titleHi: `पोर्टल 2A/2B में ${twoBRec.summary.missingInBooksCount} बिल मौजूद हैं जो सॉफ्टवेयर में एंट्री होना बाकी हैं`,
        detailEn: `Vendors have uploaded ${twoBRec.summary.missingInBooksCount} invoice(s) on the GST Portal that are missing in your Purchase Register. Record them before Nov 30 deadline to claim ITC.`,
        detailHi: `विक्रेताओं ने पोर्टल पर ${twoBRec.summary.missingInBooksCount} बिल अपलोड कर दिए हैं लेकिन आपकी परचेज बुक में दर्ज नहीं हैं। इन्हें दर्ज करके आप अतिरिक्त ITC क्लेम कर सकते हैं।`,
        amountAtRisk: twoBRec.summary.missingInBooksTax,
        affectedRefs: twoBRec.rows
          .filter((r) => r.status === 'MISSING_IN_BOOKS')
          .slice(0, 8)
          .map((r) => `${r.invoiceNumber} (${r.vendorName})`),
      });
    }
  }

  // 2. GSTR-1 vs Books Sales Discrepancy
  if (totals.portalGstr1Tax > 0 && Math.abs(totals.portalGstr1Tax - totals.booksOutwardTax) > 10) {
    const diff = totals.portalGstr1Tax - totals.booksOutwardTax;
    penaltyPoints += 18;
    findings.push({
      id: 'risk_gstr1_vs_books',
      severity: 'CRITICAL',
      ruleCode: 'Sec 37 / GSTR-1 Audit',
      titleEn: `Outward Sales Tax Variance: Portal GSTR-1 vs Software Books`,
      titleHi: `बिक्री कर अंतर: पोर्टल GSTR-1 बनाम सॉफ्टवेयर सेल्स रजिस्टर`,
      detailEn: `Portal GSTR-1 outward tax (${totals.portalGstr1Tax.toFixed(2)}) differs from Software Books (${totals.booksOutwardTax.toFixed(2)}) by ₹${Math.abs(diff).toFixed(2)}.`,
      detailHi: `पोर्टल GSTR-1 का कुल आउटवर्ड टैक्स और सॉफ्टवेयर सेल्स बुक के टैक्स में ₹${Math.abs(diff).toFixed(2)} का अंतर पाया गया।`,
      amountAtRisk: Math.abs(diff),
      affectedRefs: monthlyRows
        .filter((r) => Math.abs(r.outwardDiffGstr1VsBooks) > 10)
        .map((r) => `${r.labelEn}: ₹${r.outwardDiffGstr1VsBooks.toFixed(2)}`),
    });
  }

  // 3. GSTR-1 vs GSTR-3B Liability Mismatch (DRC-01B Auto Intimation Rule 88C)
  const g1Vs3bRows = monthlyRows.filter((r) => Math.abs(r.outwardDiffGstr3bVsGstr1) > 10);
  if (g1Vs3bRows.length > 0) {
    const diffAmt = g1Vs3bRows.reduce((s, r) => s + Math.abs(r.outwardDiffGstr3bVsGstr1), 0);
    penaltyPoints += 20;
    findings.push({
      id: 'risk_rule88c_g1_3b',
      severity: 'CRITICAL',
      ruleCode: 'Rule 88C (Form DRC-01B)',
      titleEn: `GSTR-1 vs GSTR-3B Liability Mismatch Across ${g1Vs3bRows.length} Period(s)`,
      titleHi: `${g1Vs3bRows.length} महीनों में GSTR-1 और GSTR-3B टैक्स देयता में अंतर`,
      detailEn: `Outward liability declared in GSTR-1 does not match tax paid in GSTR-3B. Rule 88C triggers automated GST DRC-01B notices.`,
      detailHi: `GSTR-1 की बिक्री देयता और GSTR-3B में भरा गया टैक्स मेल नहीं खाता। Rule 88C के तहत पोर्टल से ऑटो-नोटिस आ सकता है।`,
      amountAtRisk: diffAmt,
      affectedRefs: g1Vs3bRows.map((r) => `${r.labelEn}: ₹${r.outwardDiffGstr3bVsGstr1.toFixed(2)}`),
    });
  }

  // 4. Rule 37: 180-Day Unpaid Vendor Invoices (Mandatory ITC Reversal)
  const todayMs = Date.now();
  const unpaidOver180 = (data.purchaseInvoices || []).filter((p) => {
    if (p.status === 'CANCELLED' || p.status === 'PAID') return false;
    const balance = Math.max(0, (p.grandTotal || 0) - (p.amountPaid || 0));
    if (balance <= 1 || (p.totalTax || 0) <= 0) return false;
    const dt = parseFlexibleDate(p.date);
    if (!dt) return false;
    const days = (todayMs - new Date(dt.iso).getTime()) / (1000 * 60 * 60 * 24);
    return days > 180;
  });
  if (unpaidOver180.length > 0) {
    const rule37Itc = unpaidOver180.reduce((s, p) => {
      const unpaidRatio = p.grandTotal > 0 ? Math.max(0, p.grandTotal - p.amountPaid) / p.grandTotal : 1;
      return s + (p.totalTax || 0) * unpaidRatio;
    }, 0);
    penaltyPoints += 12;
    findings.push({
      id: 'risk_rule37_180days',
      severity: 'WARNING',
      ruleCode: 'Rule 37 (180-Day Payment)',
      titleEn: `${unpaidOver180.length} Unpaid Purchase Bills > 180 Days Old (ITC Reversal Alert)`,
      titleHi: `${unpaidOver180.length} बकाया खरीद बिल 180 दिन से पुराने हैं (Rule 37 ITC रिवर्सल चेतावनी)`,
      detailEn: `Under 2nd Proviso to Sec 16(2) & Rule 37, ITC on supplier invoices unpaid beyond 180 days must be reversed with 18% interest until paid.`,
      detailHi: `जीएसटी धारा 16(2) व नियम 37 के तहत 180 दिनों तक सप्लायर को भुगतान न करने पर उस बिल का ITC 18% ब्याज सहित वापस (Reverse) करना अनिवार्य है।`,
      amountAtRisk: Number(rule37Itc.toFixed(2)),
      affectedRefs: unpaidOver180.slice(0, 6).map((p) => `${p.supplierInvoiceNo || p.billNumber} (${p.partyName}, ${p.date})`),
    });
  }

  // 5. Party GSTIN Check & Invoice Series Check (resolving live Party Master GSTIN first)
  const invalidB2bInvoices = (data.invoices || []).filter((inv) => {
    if (inv.status === 'CANCELLED' || getFyLabelFromDateStr(inv.date) !== fyLabel) return false;
    const g = resolveTransactionGstDetails(inv, data.parties, data.company?.state).gstin;
    return g.length > 0 && g !== 'URP' && !validateGSTIN(g).isValid;
  });
  if (invalidB2bInvoices.length > 0) {
    penaltyPoints += 8;
    findings.push({
      id: 'risk_invalid_gstin',
      severity: 'WARNING',
      ruleCode: 'GSTIN Checksum Validation',
      titleEn: `${invalidB2bInvoices.length} Invoice(s) Have Invalid Party GSTIN Format/Checksum`,
      titleHi: `${invalidB2bInvoices.length} बिलों में पार्टी का GSTIN नंबर अमान्य/त्रुटिपूर्ण है`,
      detailEn: `GST Portal rejects B2B JSON uploads if any customer GSTIN fails the 15-character checksum validation.`,
      detailHi: `गलत GSTIN वाले बिल पोर्टल GSTR-1 JSON अपलोड के समय पोर्टल द्वारा रिजेक्ट कर दिए जाते हैं।`,
      amountAtRisk: invalidB2bInvoices.reduce((s, i) => s + (i.totalTax || 0), 0),
      affectedRefs: invalidB2bInvoices.slice(0, 6).map((i) => {
        const g = resolveTransactionGstDetails(i, data.parties, data.company?.state).gstin;
        return `${i.invoiceNumber}: ${g || i.partyGstin}`;
      }),
    });
  }

  // 6. Sec 17(5) Blocked Credit & RCM Keyword Check
  const sec17Keywords = ['car', 'vehicle', 'suv', 'food', 'catering', 'hotel', 'club', 'health', 'fitness', 'gift'];
  const flaggedBlocked = allFyPurchases.filter((p) =>
    (p.items || []).some((it) => sec17Keywords.some((kw) => it.itemName.toLowerCase().includes(kw)))
  );
  if (flaggedBlocked.length > 0) {
    findings.push({
      id: 'risk_sec17_5',
      severity: 'WARNING',
      ruleCode: 'Sec 17(5) Blocked Credit Review',
      titleEn: `${flaggedBlocked.length} Purchase Bill(s) Contain Potential Sec 17(5) Blocked Items`,
      titleHi: `${flaggedBlocked.length} परचेज बिलों में संभावित Sec 17(5) प्रतिबंधित (Blocked ITC) मदें मिलीं`,
      detailEn: `Review items related to motor vehicles, food/catering, or personal consumption to confirm ITC eligibility before GSTR-3B / GSTR-9 filing.`,
      detailHi: `वाहन, भोजन/कैटरिंग या व्यक्तिगत उपभोग से संबंधित खरीद पर Section 17(5) के तहत ITC अयोग्य (Ineligible) हो सकता है — ऑडिट में जांच करें।`,
      amountAtRisk: flaggedBlocked.reduce((s, p) => s + (p.totalTax || 0), 0),
      affectedRefs: flaggedBlocked.slice(0, 5).map((p) => `${p.supplierInvoiceNo || p.billNumber} (${p.partyName})`),
    });
  }

  const complianceScore = Math.max(0, Math.min(100, 100 - penaltyPoints));

  return {
    fyLabel,
    monthlyRows,
    totals,
    findings,
    complianceScore,
  };
}

export interface Gstr9Computation {
  fyLabel: string;
  table4: {
    b2bTaxable: number;
    b2bIgst: number;
    b2bCgst: number;
    b2bSgst: number;
    b2cTaxable: number;
    b2cIgst: number;
    b2cCgst: number;
    b2cSgst: number;
    exportZeroTaxable: number;
    exportZeroIgst: number;
    creditDebitNoteNetTaxable: number;
    creditDebitNoteNetTax: number;
    totalTaxableSuppliesOnWhichTaxPayable: number;
    totalTaxPayable: number;
  };
  table5: {
    nilRatedExemptNonGst: number;
    totalTurnoverIncludingExempt: number;
  };
  table6: {
    itcAsPer3bTotal: number;
    itcInputsIgst: number;
    itcInputsCgst: number;
    itcInputsSgst: number;
    itcCapitalGoodsTotal: number;
    itcInputServicesTotal: number;
    subtotal6O: number;
    itcShortExcessBooksVs3b: number;
  };
  table7: {
    rule37Reversal: number;
    rule42_43Reversal: number;
    sec17_5Blocked: number;
    totalReversed: number;
    netItcAvailableForUtilisation: number;
  };
  table8: {
    itcAsPer2BOr2A: number;
    itcAsPerTable6B: number;
    previousFyItcClaimedNextFy: number;
    ineligibleItcSec16_4: number;
    difference8D: number; // 8A - (8B + 8C) -> Positive = Unclaimed/Lapsed, Negative = Excess Claimed (Danger!)
  };
  table9: {
    totalTaxPayable: number;
    paidThroughItc: number;
    paidThroughCash: number;
    lateFeeInterest: number;
    balancePayableDRC03: number;
  };
  table10to14: {
    prevFyTaxableAdj: number;
    prevFyTaxAdj: number;
    prevFyItcNextYear: number;
    prevFyItcReversedNextYear: number;
  };
  hsnOutward: Array<{ hsn: string; uqc: string; qty: number; taxable: number; taxRate: number; igst: number; cgst: number; sgst: number }>;
  hsnInward: Array<{ hsn: string; uqc: string; qty: number; taxable: number; taxRate: number; igst: number; cgst: number; sgst: number }>;
}

export function computeGstr9Summary(
  data: AppData,
  fyLabel: string,
  adjustments?: Gstr9ManualAdjustments
): Gstr9Computation {
  const audit = computeGstAuditReport(data, fyLabel);
  const adj = adjustments || { fyLabel };

  const fyInvoices = (data.invoices || []).filter(
    (inv) => inv.status !== 'CANCELLED' && getFyLabelFromDateStr(inv.date) === fyLabel
  );
  const fyPurchases = (data.purchaseInvoices || []).filter(
    (p) => p.status !== 'CANCELLED' && getFyLabelFromDateStr(p.date) === fyLabel
  );
  const fyNotes = (data.debitCreditNotes || []).filter(
    (n) => getFyLabelFromDateStr(n.date) === fyLabel
  );

  let b2bTaxable = 0, b2bIgst = 0, b2bCgst = 0, b2bSgst = 0;
  let b2cTaxable = 0, b2cIgst = 0, b2cCgst = 0, b2cSgst = 0;
  let exportZeroTaxable = adj.outwardZeroRatedTaxable || 0, exportZeroIgst = 0;
  let autoNilExempt = 0;

  const hsnOutMap = new Map<string, { hsn: string; uqc: string; qty: number; taxable: number; taxRate: number; igst: number; cgst: number; sgst: number }>();

  fyInvoices.forEach((inv) => {
    const taxable = Math.max(0, (inv.subtotal || 0) - (inv.totalDiscount || 0));
    const resolvedGst = resolveTransactionGstDetails(inv, data.parties, data.company?.state);
    const isB2b = resolvedGst.isB2b;

    if (inv.invoiceType === 'EXPORT') {
      exportZeroTaxable += taxable;
      exportZeroIgst += inv.igstAmount || 0;
    } else if (inv.invoiceType === 'NIL_RATED' || inv.invoiceType === 'EXEMPT') {
      autoNilExempt += taxable;
    } else if (isB2b) {
      b2bTaxable += taxable;
      b2bIgst += inv.igstAmount || 0;
      b2bCgst += inv.cgstAmount || 0;
      b2bSgst += inv.sgstAmount || 0;
    } else {
      b2cTaxable += taxable;
      b2cIgst += inv.igstAmount || 0;
      b2cCgst += inv.cgstAmount || 0;
      b2cSgst += inv.sgstAmount || 0;
    }

    (inv.items || []).forEach((it) => {
      const hsn = (it.hsnSacCode || '9999').trim();
      const uqc = (it.unit || 'NOS').toUpperCase();
      const rt = Number(it.taxRate) || 0;
      const key = `${hsn}_${rt}_${uqc}`;
      const lineTx = (Number(it.quantity) || 0) * (Number(it.rate) || 0) * (1 - (Number(it.discountPercent) || 0) / 100);
      const lineTax = Number(it.taxAmount) || (lineTx * rt) / 100;
      const cur = hsnOutMap.get(key) || { hsn, uqc, qty: 0, taxable: 0, taxRate: rt, igst: 0, cgst: 0, sgst: 0 };
      cur.qty += Number(it.quantity) || 0;
      cur.taxable += lineTx;
      if (inv.isInterState) cur.igst += lineTax;
      else {
        cur.cgst += lineTax / 2;
        cur.sgst += lineTax / 2;
      }
      hsnOutMap.set(key, cur);
    });
  });

  let noteNetTaxable = 0;
  let noteNetTax = 0;
  fyNotes.forEach((n) => {
    const sign = n.type === 'CREDIT_NOTE' ? -1 : 1;
    noteNetTaxable += sign * (n.subtotal || 0);
    noteNetTax += sign * (n.totalTax || 0);
  });

  const totalTaxableSuppliesOnWhichTaxPayable =
    b2bTaxable + b2cTaxable + exportZeroTaxable + noteNetTaxable;
  const totalTaxPayable =
    b2bIgst + b2bCgst + b2bSgst + b2cIgst + b2cCgst + b2cSgst + exportZeroIgst + noteNetTax;

  const nilRatedExemptNonGst = autoNilExempt + (adj.outwardNilExemptNonGst || 0);
  const totalTurnoverIncludingExempt = totalTaxableSuppliesOnWhichTaxPayable + nilRatedExemptNonGst;

  // Table 6 & 7 (ITC)
  const hsnInMap = new Map<string, { hsn: string; uqc: string; qty: number; taxable: number; taxRate: number; igst: number; cgst: number; sgst: number }>();
  fyPurchases.forEach((p) => {
    (p.items || []).forEach((it) => {
      const hsn = (it.hsnSacCode || '9999').trim();
      const uqc = (it.unit || 'NOS').toUpperCase();
      const rt = Number(it.taxRate) || 0;
      const key = `${hsn}_${rt}_${uqc}`;
      const lineTx = (Number(it.quantity) || 0) * (Number(it.rate) || 0) * (1 - (Number(it.discountPercent) || 0) / 100);
      const lineTax = Number(it.taxAmount) || (lineTx * rt) / 100;
      const cur = hsnInMap.get(key) || { hsn, uqc, qty: 0, taxable: 0, taxRate: rt, igst: 0, cgst: 0, sgst: 0 };
      cur.qty += Number(it.quantity) || 0;
      cur.taxable += lineTx;
      if (p.isInterState) cur.igst += lineTax;
      else {
        cur.cgst += lineTax / 2;
        cur.sgst += lineTax / 2;
      }
      hsnInMap.set(key, cur);
    });
  });

  const itcInputsIgst = audit.totals.booksItcIgst;
  const itcInputsCgst = audit.totals.booksItcCgst;
  const itcInputsSgst = audit.totals.booksItcSgst;
  const subtotal6O = itcInputsIgst + itcInputsCgst + itcInputsSgst;
  const itcAsPer3bTotal =
    audit.totals.portalGstr3bItcTotal > 0 ? audit.totals.portalGstr3bItcTotal : subtotal6O;

  const rule37Reversal = adj.itcReversedRule37 || 0;
  const rule42_43Reversal = adj.itcReversedRule42_43 || 0;
  const sec17_5Blocked = adj.itcBlockedSec17_5 || 0;
  const totalReversed = rule37Reversal + rule42_43Reversal + sec17_5Blocked;
  const netItcAvailableForUtilisation = Math.max(0, subtotal6O - totalReversed);

  const itcAsPer2BOr2A =
    audit.totals.portal2bItc > 0 ? audit.totals.portal2bItc : audit.totals.portal2aItc;
  const previousFyItcClaimedNextFy = adj.previousFyItcClaimedNextFy || 0;
  const difference8D = Number((itcAsPer2BOr2A - (itcAsPer3bTotal + previousFyItcClaimedNextFy)).toFixed(2));

  const paidThroughItc =
    audit.totals.portalTaxPaidItc > 0
      ? audit.totals.portalTaxPaidItc
      : Math.min(totalTaxPayable, netItcAvailableForUtilisation);
  const paidThroughCash =
    audit.totals.portalTaxPaidCash > 0
      ? audit.totals.portalTaxPaidCash
      : Math.max(0, totalTaxPayable - paidThroughItc);
  const lateFeeInterest = adj.lateFeeInterestPaid || 0;
  const balancePayableDRC03 = Math.max(
    0,
    totalTaxPayable + (adj.previousFyTaxAdj || 0) - paidThroughItc - paidThroughCash
  );

  return {
    fyLabel,
    table4: {
      b2bTaxable,
      b2bIgst,
      b2bCgst,
      b2bSgst,
      b2cTaxable,
      b2cIgst,
      b2cCgst,
      b2cSgst,
      exportZeroTaxable,
      exportZeroIgst,
      creditDebitNoteNetTaxable: noteNetTaxable,
      creditDebitNoteNetTax: noteNetTax,
      totalTaxableSuppliesOnWhichTaxPayable,
      totalTaxPayable,
    },
    table5: {
      nilRatedExemptNonGst,
      totalTurnoverIncludingExempt,
    },
    table6: {
      itcAsPer3bTotal,
      itcInputsIgst,
      itcInputsCgst,
      itcInputsSgst,
      itcCapitalGoodsTotal: 0,
      itcInputServicesTotal: 0,
      subtotal6O,
      itcShortExcessBooksVs3b: Number((subtotal6O - itcAsPer3bTotal).toFixed(2)),
    },
    table7: {
      rule37Reversal,
      rule42_43Reversal,
      sec17_5Blocked,
      totalReversed,
      netItcAvailableForUtilisation,
    },
    table8: {
      itcAsPer2BOr2A,
      itcAsPerTable6B: itcAsPer3bTotal,
      previousFyItcClaimedNextFy,
      ineligibleItcSec16_4: difference8D > 0 ? difference8D : 0,
      difference8D,
    },
    table9: {
      totalTaxPayable,
      paidThroughItc,
      paidThroughCash,
      lateFeeInterest,
      balancePayableDRC03,
    },
    table10to14: {
      prevFyTaxableAdj: adj.previousFyTaxableAdj || 0,
      prevFyTaxAdj: adj.previousFyTaxAdj || 0,
      prevFyItcNextYear: adj.previousFyItcClaimedNextFy || 0,
      prevFyItcReversedNextYear: adj.previousFyItcReversedNextFy || 0,
    },
    hsnOutward: Array.from(hsnOutMap.values()),
    hsnInward: Array.from(hsnInMap.values()),
  };
}
