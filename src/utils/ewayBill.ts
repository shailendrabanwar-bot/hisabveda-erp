import { AppData, CompanyDetails, SalesInvoice } from '../types';
import { INDIAN_STATE_CODES } from './gstin';

/**
 * Official India GST e-Way Bill JSON Schema (NIC Portal Specification v1.0.0421)
 * Portal Reference: https://ewaybillgst.gov.in / https://docs.ewaybillgst.gov.in
 */

export interface EWayBillItemPayload {
  itemNo: number;
  productName: string;
  productDesc: string;
  hsnCode: number;
  quantity: number;
  qtyUnit: string; // Standard UQC: NOS, KGS, PCS, BOX, SET, MTR, LTR, etc.
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cessRate: number;
  cessNonAdvol: number;
  taxableAmount: number;
}

export interface EWayBillDocPayload {
  userGstin: string;
  supplyType: 'O' | 'I'; // Outward / Inward
  subSupplyType: string; // 1: Supply, 2: Import, 3: Export, 4: Job Work, 5: For Own Use, 7: Sales Return, 8: Others
  subSupplyDesc: string;
  docType: 'INV' | 'BIL' | 'BOE' | 'CHL' | 'OTH';
  docNo: string;
  docDate: string; // DD/MM/YYYY
  fromGstin: string;
  fromTrdName: string;
  fromAddr1: string;
  fromAddr2: string;
  fromPlace: string;
  fromPincode: number;
  actFromStateCode: number;
  fromStateCode: number;
  toGstin: string;
  toTrdName: string;
  toAddr1: string;
  toAddr2: string;
  toPlace: string;
  toPincode: number;
  actToStateCode: number;
  toStateCode: number;
  transactionType: number; // 1: Regular, 2: Bill To - Ship To, 3: Bill From - Dispatch From, 4: Combination
  dispatchFromGSTIN: string;
  dispatchFromTradeName: string;
  shipToGSTIN: string;
  shipToTradeName: string;
  totalValue: number;
  cgstValue: number;
  sgstValue: number;
  igstValue: number;
  cessValue: number;
  cessNonAdvolValue: number;
  otherValue: number;
  totInvValue: number;
  transporterId: string;
  transporterName: string;
  transDocNo: string;
  transDocDate: string; // DD/MM/YYYY
  transMode: '1' | '2' | '3' | '4'; // 1: Road, 2: Rail, 3: Air, 4: Ship
  transDistance: string; // Distance in KM (as string per NIC spec)
  vehicleNo: string;
  vehicleType: 'R' | 'O'; // Regular / Over Dimensional Cargo
  itemList: EWayBillItemPayload[];
}

export interface EWayBillBulkJsonPayload {
  version: string; // e.g. "1.0.0421"
  billLists: EWayBillDocPayload[];
}

export interface TransportDetailsConfig {
  transMode: '1' | '2' | '3' | '4';
  transporterId?: string;
  transporterName?: string;
  vehicleNo?: string;
  vehicleType?: 'R' | 'O';
  transDocNo?: string;
  transDocDate?: string;
  distanceKm?: number;
  subSupplyType?: string;
  subSupplyDesc?: string;
  transactionType?: number;
  docType?: 'INV' | 'BIL' | 'BOE' | 'CHL' | 'OTH';
}

export interface EWayBillValidationIssue {
  invoiceId: string;
  invoiceNo: string;
  field: string;
  severity: 'error' | 'warning';
  message: string;
  messageHindi: string;
}

export interface SimulatedEWayBillResult {
  ewayBillNo: string;
  ewayBillDate: string;
  validUntil: string;
  generatedBy: string;
  docNo: string;
  docDate: string;
  fromTrdName: string;
  fromGstin: string;
  toTrdName: string;
  toGstin: string;
  totInvValue: number;
  vehicleNo: string;
  transDistance: string;
  status: 'ACTIVE' | 'CANCELLED';
  qrPayload: string;
}

// Standard Unit of Quantity Code (UQC) map for GST portal
const UQC_MAP: Record<string, string> = {
  pcs: 'PCS',
  pieces: 'PCS',
  piece: 'PCS',
  nos: 'NOS',
  number: 'NOS',
  numbers: 'NOS',
  box: 'BOX',
  boxes: 'BOX',
  kg: 'KGS',
  kgs: 'KGS',
  kilogram: 'KGS',
  mtr: 'MTR',
  meter: 'MTR',
  meters: 'MTR',
  set: 'SET',
  sets: 'SET',
  sqm: 'SQM',
  ltr: 'LTR',
  litre: 'LTR',
  litres: 'LTR',
  pac: 'PAC',
  pack: 'PAC',
  packs: 'PAC',
  packet: 'PAC',
  packets: 'PAC',
  rol: 'ROL',
  rolls: 'ROL',
  bag: 'BAG',
  bags: 'BAG',
  btl: 'BTL',
  bottle: 'BTL',
  bottles: 'BTL',
  can: 'CAN',
  tub: 'TUB',
  doz: 'DOZ',
  dozen: 'DOZ',
  oth: 'OTH'
};

const UQC_FULL_DESC: Record<string, string> = {
  PCS: 'PCS-PIECES',
  NOS: 'NOS-NUMBERS',
  BOX: 'BOX-BOX',
  KGS: 'KGS-KILOGRAMS',
  MTR: 'MTR-METERS',
  SET: 'SET-SETS',
  SQM: 'SQM-SQ. METERS',
  LTR: 'LTR-LITRES',
  PAC: 'PAC-PACKS',
  ROL: 'ROL-ROLLS',
  BAG: 'BAG-BAGS',
  BTL: 'BTL-BOTTLES',
  CAN: 'CAN-CANS',
  TUB: 'TUB-TUBES',
  DOZ: 'DOZ-DOZENS',
  OTH: 'OTH-OTHERS',
};

export function normalizeUqc(unit?: string): string {
  if (!unit) return 'NOS';
  const clean = unit.trim().toLowerCase().split(/[\s-]+/)[0];
  return UQC_MAP[clean] || 'NOS';
}

/**
 * Returns full GST Portal UQC descriptor e.g. MTR-METERS, NOS-NUMBERS, PAC-PACKS, KGS-KILOGRAMS.
 */
export function formatGstUqcCode(unit?: string): string {
  const code = normalizeUqc(unit);
  return UQC_FULL_DESC[code] || `${code}-${code}`;
}

/**
 * Format any ISO or slash date to DD/MM/YYYY for NIC e-Way Bill portal
 */
export function formatToEwbDate(dateStr?: string): string {
  if (!dateStr) {
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    return `${day}/${mon}/${d.getFullYear()}`;
  }

  const clean = dateStr.trim();
  // If already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(clean)) {
    return clean;
  }

  // If YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(clean)) {
    const [y, m, d] = clean.split('T')[0].split('-');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  // If DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    const [d, m, y] = clean.split('-');
    return `${d}/${m}/${y}`;
  }

  // Fallback to JS Date
  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0');
    const mon = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${day}/${mon}/${parsed.getFullYear()}`;
  }

  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Parse State Code to 2-digit integer (e.g. "07" -> 7, "27" -> 27)
 */
export function parseStateCodeNum(codeOrName?: string): number {
  if (!codeOrName) return 7; // Default Delhi
  const clean = codeOrName.trim();
  // Check if first 2 chars are numeric
  const prefix = clean.substring(0, 2);
  if (/^\d{2}$/.test(prefix)) {
    return parseInt(prefix, 10);
  }

  // Look up by state name
  const lower = clean.toLowerCase();
  for (const [code, name] of Object.entries(INDIAN_STATE_CODES)) {
    if (name.toLowerCase().includes(lower) || lower.includes(name.toLowerCase())) {
      return parseInt(code, 10);
    }
  }

  return 7;
}

/**
 * Parse 6-digit postal code / PIN code
 */
export function parsePincode(pinStr?: string | number): number {
  if (!pinStr) return 110001;
  const digits = String(pinStr).replace(/\D/g, '');
  if (digits.length >= 6) {
    return parseInt(digits.substring(0, 6), 10);
  }
  return 110001;
}

/**
 * Parse numeric HSN code (at least 2, 4, 6 or 8 digits)
 */
export function parseHsnCode(hsnStr?: string | number): number {
  if (!hsnStr) return 8471;
  const digits = String(hsnStr).replace(/\D/g, '');
  if (digits.length >= 2) {
    return parseInt(digits, 10);
  }
  return 8471;
}

/**
 * Estimate road distance in KM between consignor & consignee states
 */
export function estimateTransportDistance(fromStateCode: number, toStateCode: number): number {
  if (fromStateCode === toStateCode) {
    return 65; // Average intra-state local dispatch distance in KM
  }

  // Inter-state rough distance matrix based on major transit corridors
  const diff = Math.abs(fromStateCode - toStateCode);
  if (diff <= 2) return 220; // Neighboring states (e.g. Delhi to Haryana/UP)
  if (diff <= 6) return 450; // Regional corridor (e.g. Delhi to Rajasthan/Punjab)
  if (diff <= 15) return 850; // Central corridor (e.g. Delhi to MP/Gujarat)
  if (diff <= 25) return 1400; // Metro corridor (e.g. Delhi to Mumbai/Kolkata)
  return 1850; // Long-haul corridor (e.g. Delhi to Chennai/Bengaluru)
}

/**
 * Build Single e-Way Bill Document object per NIC JSON specifications
 */
export function convertInvoiceToEWayBill(
  invoice: SalesInvoice,
  company: CompanyDetails,
  config?: Partial<TransportDetailsConfig>
): EWayBillDocPayload {
  const userGstin = company.gstin ? company.gstin.trim().toUpperCase() : '07AAAAA0000A1Z5';
  const fromStateCode = parseStateCodeNum(company.stateCode || company.state || userGstin.substring(0, 2));
  
  // Destination state
  let toStateCode = fromStateCode;
  if (invoice.partyGstin && invoice.partyGstin.length >= 2 && /^\d{2}/.test(invoice.partyGstin)) {
    toStateCode = parseInt(invoice.partyGstin.substring(0, 2), 10);
  } else if (invoice.placeOfSupply) {
    toStateCode = parseStateCodeNum(invoice.placeOfSupply);
  } else if (invoice.partyState) {
    toStateCode = parseStateCodeNum(invoice.partyState);
  }

  // Distance
  const defaultDist = estimateTransportDistance(fromStateCode, toStateCode);
  const finalDistance = config?.distanceKm && config.distanceKm > 0 ? config.distanceKm : defaultDist;

  // Clean vehicle registration number (e.g. DL01AB1234, no dashes/spaces per NIC)
  const rawVeh = config?.vehicleNo || invoice.shippedVia || 'DL01AB1234';
  const cleanVehicleNo = rawVeh.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // Document Type
  const docType = config?.docType || (invoice.invoiceType === 'RETAIL_BILL' ? 'BIL' : 'INV');

  // Items List
  const items: EWayBillItemPayload[] = (invoice.items && invoice.items.length > 0)
    ? invoice.items.map((item, idx) => {
        const taxable = item.quantity * item.rate * (1 - (item.discountPercent || 0) / 100);
        const taxRate = item.taxRate || 18;
        const isInterState = invoice.isInterState;

        return {
          itemNo: idx + 1,
          productName: item.itemName ? item.itemName.trim() : `Item ${idx + 1}`,
          productDesc: item.itemName || 'Goods',
          hsnCode: parseHsnCode(item.hsnSacCode),
          quantity: Number(item.quantity.toFixed(2)),
          qtyUnit: normalizeUqc(item.unit),
          cgstRate: isInterState ? 0 : Number((taxRate / 2).toFixed(2)),
          sgstRate: isInterState ? 0 : Number((taxRate / 2).toFixed(2)),
          igstRate: isInterState ? Number(taxRate.toFixed(2)) : 0,
          cessRate: 0,
          cessNonAdvol: 0,
          taxableAmount: Number(taxable.toFixed(2))
        };
      })
    : [
        {
          itemNo: 1,
          productName: 'General Goods',
          productDesc: 'Commercial merchandise',
          hsnCode: 8471,
          quantity: 1,
          qtyUnit: 'NOS',
          cgstRate: invoice.isInterState ? 0 : 9,
          sgstRate: invoice.isInterState ? 0 : 9,
          igstRate: invoice.isInterState ? 18 : 0,
          cessRate: 0,
          cessNonAdvol: 0,
          taxableAmount: Number((invoice.subtotal - invoice.totalDiscount).toFixed(2))
        }
      ];

  const totalTaxable = Number((invoice.subtotal - invoice.totalDiscount).toFixed(2));
  const cgst = Number(invoice.cgstAmount.toFixed(2));
  const sgst = Number(invoice.sgstAmount.toFixed(2));
  const igst = Number(invoice.igstAmount.toFixed(2));
  const roundOff = Number(invoice.roundOff?.toFixed(2) || 0);

  const cleanPartyGstin = (invoice.partyGstin && invoice.partyGstin.trim().length === 15)
    ? invoice.partyGstin.trim().toUpperCase()
    : 'URP';

  return {
    userGstin,
    supplyType: 'O', // Outward
    subSupplyType: config?.subSupplyType || '1', // 1: Supply
    subSupplyDesc: config?.subSupplyDesc || '',
    docType,
    docNo: invoice.invoiceNumber.replace(/[^a-zA-Z0-9\/\-]/g, '').substring(0, 16),
    docDate: formatToEwbDate(invoice.date),
    fromGstin: userGstin,
    fromTrdName: company.name ? company.name.substring(0, 100) : 'Apex Commercial Solutions',
    fromAddr1: company.address ? company.address.substring(0, 100) : 'Commercial Hub',
    fromAddr2: '',
    fromPlace: company.city || 'New Delhi',
    fromPincode: parsePincode(company.pincode),
    actFromStateCode: fromStateCode,
    fromStateCode: fromStateCode,
    toGstin: cleanPartyGstin,
    toTrdName: invoice.partyName ? invoice.partyName.substring(0, 100) : 'Customer Party',
    toAddr1: invoice.partyAddress ? invoice.partyAddress.substring(0, 100) : 'Customer Destination',
    toAddr2: '',
    toPlace: invoice.partyCity || invoice.partyState || 'Delhi',
    toPincode: parsePincode(invoice.partyPincode || 110002),
    actToStateCode: toStateCode,
    toStateCode: toStateCode,
    transactionType: config?.transactionType || (invoice.shippingAddress ? 2 : 1),
    dispatchFromGSTIN: '',
    dispatchFromTradeName: '',
    shipToGSTIN: invoice.shippingGstin || '',
    shipToTradeName: invoice.shippingName || '',
    totalValue: totalTaxable,
    cgstValue: cgst,
    sgstValue: sgst,
    igstValue: igst,
    cessValue: 0,
    cessNonAdvolValue: 0,
    otherValue: roundOff,
    totInvValue: Number(invoice.grandTotal.toFixed(2)),
    transporterId: config?.transporterId ? config.transporterId.trim().toUpperCase() : '',
    transporterName: config?.transporterName ? config.transporterName.trim() : 'TCI Freight Logistics',
    transDocNo: config?.transDocNo || invoice.deliveryNoteNo || `LR-${invoice.invoiceNumber.replace(/\D/g, '') || '8841'}`,
    transDocDate: formatToEwbDate(config?.transDocDate || invoice.deliveryNoteDate || invoice.date),
    transMode: config?.transMode || '1', // 1: Road
    transDistance: String(finalDistance),
    vehicleNo: cleanVehicleNo,
    vehicleType: config?.vehicleType || 'R', // Regular
    itemList: items
  };
}

/**
 * Generate Complete NIC Bulk e-Way Bill JSON Payload
 */
export function generateBulkEWayBillJson(
  invoices: SalesInvoice[],
  company: CompanyDetails,
  configPerInvoice?: Record<string, Partial<TransportDetailsConfig>>
): EWayBillBulkJsonPayload {
  const billLists = invoices.map(inv => {
    const cfg = configPerInvoice ? configPerInvoice[inv.id] : undefined;
    return convertInvoiceToEWayBill(inv, company, cfg);
  });

  return {
    version: '1.0.0421',
    billLists
  };
}

/**
 * Validate Selected Invoices against official NIC e-Way Bill requirements
 */
export function validateInvoicesForEWayBill(
  invoices: SalesInvoice[],
  company: CompanyDetails,
  configPerInvoice?: Record<string, Partial<TransportDetailsConfig>>
): EWayBillValidationIssue[] {
  const issues: EWayBillValidationIssue[] = [];

  // Consignor validation
  if (!company.gstin || company.gstin.trim().length !== 15) {
    issues.push({
      invoiceId: 'company',
      invoiceNo: 'COMPANY',
      field: 'company.gstin',
      severity: 'error',
      message: 'Company GSTIN is missing or not a valid 15-character identifier.',
      messageHindi: 'कंपनी का 15-अंकों का वैध GSTIN नंबर दर्ज नहीं है।'
    });
  }

  invoices.forEach(inv => {
    const cfg = configPerInvoice ? configPerInvoice[inv.id] : undefined;
    const veh = (cfg?.vehicleNo || inv.shippedVia || '').replace(/[^a-zA-Z0-9]/g, '');
    const transId = (cfg?.transporterId || '').trim();

    // Consignment value threshold rule (Rule 138: Mandatory if consignment > Rs. 50,000)
    if (inv.grandTotal > 50000) {
      if (!veh && !transId) {
        issues.push({
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNumber,
          field: 'transport',
          severity: 'error',
          message: `Mandatory e-Way Bill for invoice above ₹50,000 (${inv.invoiceNumber}). Either Vehicle Number or Transporter ID is required in Part-B.`,
          messageHindi: `₹50,000 से अधिक के इनवॉइस (${inv.invoiceNumber}) के लिए e-Way Bill अनिवार्य है। पार्ट-बी में वाहन संख्या या ट्रांसपोर्टर आईडी आवश्यक है।`
        });
      }
    } else {
      if (!veh && !transId) {
        issues.push({
          invoiceId: inv.id,
          invoiceNo: inv.invoiceNumber,
          field: 'transport',
          severity: 'warning',
          message: `Consignment is below ₹50,000 (${inv.invoiceNumber}). Vehicle No. or Transporter ID recommended for generating Part-B.`,
          messageHindi: `चालान राशि ₹50,000 से कम है (${inv.invoiceNumber})। पूर्ण ई-वे बिल हेतु वाहन नंबर प्रदान करना अनुशंसित है।`
        });
      }
    }

    // Party / Customer Name
    if (!inv.partyName || inv.partyName.trim().length < 3) {
      issues.push({
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNumber,
        field: 'partyName',
        severity: 'error',
        message: `Recipient / Customer name is missing for invoice ${inv.invoiceNumber}.`,
        messageHindi: `इनवॉइस ${inv.invoiceNumber} में प्राप्तकर्ता/ग्राहक का नाम अनुपस्थित है।`
      });
    }

    // Party GSTIN format check if present and not URP
    if (inv.partyGstin && inv.partyGstin.trim().toUpperCase() !== 'URP' && inv.partyGstin.trim().length !== 15) {
      issues.push({
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNumber,
        field: 'partyGstin',
        severity: 'warning',
        message: `Customer GSTIN is ${inv.partyGstin.length} chars (expected 15). Set as 'URP' if unregistered.`,
        messageHindi: `ग्राहक का GSTIN अमान्य है। यदि ग्राहक पंजीकृत नहीं है तो 'URP' होना चाहिए।`
      });
    }

    // Items check
    if (!inv.items || inv.items.length === 0) {
      issues.push({
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNumber,
        field: 'items',
        severity: 'error',
        message: `No line items found in invoice ${inv.invoiceNumber}. At least 1 item is required.`,
        messageHindi: `इनवॉइस ${inv.invoiceNumber} में कोई आइटम नहीं मिला। कम से कम एक आइटम आवश्यक है।`
      });
    } else {
      inv.items.forEach((item, itemIdx) => {
        if (!item.hsnSacCode || item.hsnSacCode.trim().length < 2) {
          issues.push({
            invoiceId: inv.id,
            invoiceNo: inv.invoiceNumber,
            field: `item[${itemIdx}].hsn`,
            severity: 'warning',
            message: `HSN code missing or short for item "${item.itemName}" in ${inv.invoiceNumber}. Default 8471 will be used.`,
            messageHindi: `इनवॉइस ${inv.invoiceNumber} में आइटम "${item.itemName}" का HSN कोड नहीं मिला। डिफ़ॉल्ट 8471 उपयोग होगा।`
          });
        }
      });
    }

    // Distance validation
    const dist = cfg?.distanceKm || 0;
    if (dist > 4000) {
      issues.push({
        invoiceId: inv.id,
        invoiceNo: inv.invoiceNumber,
        field: 'distance',
        severity: 'error',
        message: `Transit distance (${dist} km) exceeds NIC portal maximum limit of 4000 km.`,
        messageHindi: `परिवहन दूरी (${dist} km) पोर्टल की अधिकतम सीमा 4000 किमी से अधिक है।`
      });
    }
  });

  return issues;
}

/**
 * Simulate e-Way Bill portal response (Generates 12-digit e-Way Bill Number & validity)
 */
export function simulateEWayBillGeneration(
  doc: EWayBillDocPayload
): SimulatedEWayBillResult {
  const now = new Date();
  
  // 12-digit official-style e-Way Bill No. (e.g. 2410 + random 8 digits)
  const yr = String(now.getFullYear()).slice(-2);
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const randSeq = Math.floor(10000000 + Math.random() * 90000000);
  const ewayBillNo = `${yr}${mo}${randSeq}`;

  // Validity calculation per Rule 138(10):
  // 1 day for every 200 km (for regular cargo)
  // 1 day for every 20 km (for ODC cargo)
  const dist = parseInt(doc.transDistance, 10) || 100;
  const daysAllowed = doc.vehicleType === 'O' 
    ? Math.max(1, Math.ceil(dist / 20)) 
    : Math.max(1, Math.ceil(dist / 200));

  const validUntilDate = new Date(now.getTime() + daysAllowed * 24 * 60 * 60 * 1000);

  const qrData = JSON.stringify({
    ewbNo: ewayBillNo,
    ewbDt: `${formatToEwbDate(now.toISOString())} 12:00:00 AM`,
    genGstin: doc.fromGstin,
    docNo: doc.docNo,
    docDt: doc.docDate,
    totVal: doc.totInvValue,
    toGstin: doc.toGstin,
    vehNo: doc.vehicleNo
  });

  return {
    ewayBillNo,
    ewayBillDate: `${formatToEwbDate(now.toISOString())} ${now.toLocaleTimeString()}`,
    validUntil: `${formatToEwbDate(validUntilDate.toISOString())} 11:59:59 PM`,
    generatedBy: `${doc.fromGstin} (${doc.fromTrdName})`,
    docNo: doc.docNo,
    docDate: doc.docDate,
    fromTrdName: doc.fromTrdName,
    fromGstin: doc.fromGstin,
    toTrdName: doc.toTrdName,
    toGstin: doc.toGstin,
    totInvValue: doc.totInvValue,
    vehicleNo: doc.vehicleNo,
    transDistance: `${doc.transDistance} KM`,
    status: 'ACTIVE',
    qrPayload: qrData
  };
}

/**
 * Trigger download of formatted JSON file
 */
export function downloadEWayBillJsonFile(
  payload: EWayBillBulkJsonPayload,
  customFilename?: string
): void {
  const jsonContent = JSON.stringify(payload, null, 2);
  const dateStr = new Date().toISOString().split('T')[0];
  const count = payload.billLists.length;
  const filename = customFilename || `NIC_eWayBill_Bulk_${count}_Invoices_${dateStr}.json`;

  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
