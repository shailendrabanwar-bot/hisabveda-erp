import { AppData, SalesInvoice, Voucher, Account, ItemMaster, PartyMaster, CompanyDetails, DebitCreditNote } from '../types';
import { formatCurrency } from './storage';
import { calculateInventoryValuationReport, ValuationMethod } from './inventoryValuation';
import * as XLSX from 'xlsx';
import { printHtmlDocument } from './printReport';
import {
  isValidB2bGstin,
  resolveIsInterStateSupply,
  resolveOfficialStateCode,
  resolveSalesInvoiceWithParty,
  resolveTransactionGstDetails,
} from './gstAuditEngine';

// Helper to sanitize CSV field
function escapeCsvCell(cell: string | number | undefined | null): string {
  if (cell === undefined || cell === null) return '""';
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

// Helper to trigger file download
function triggerDownload(content: string, filename: string, mimeType: string = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ------------------- CSV EXPORTS -------------------

export function exportInvoicesCSV(invoices: SalesInvoice[]) {
  const headers = [
    'Invoice Number',
    'Date',
    'Type',
    'Party Name',
    'GSTIN',
    'Place of Supply',
    'Subtotal',
    'CGST Amount',
    'SGST Amount',
    'IGST Amount',
    'Total Tax',
    'Grand Total',
    'Amount Paid',
    'Status'
  ];

  const rows = invoices.map(inv => [
    inv.invoiceNumber,
    inv.date,
    inv.invoiceType,
    inv.partyName,
    inv.partyGstin || '',
    inv.placeOfSupply || '',
    inv.subtotal.toFixed(2),
    inv.cgstAmount.toFixed(2),
    inv.sgstAmount.toFixed(2),
    inv.igstAmount.toFixed(2),
    inv.totalTax.toFixed(2),
    inv.grandTotal.toFixed(2),
    inv.amountPaid.toFixed(2),
    inv.status
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(r => r.map(escapeCsvCell).join(','))
  ].join('\n');

  triggerDownload(csvContent, `Invoices_Export_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportVouchersCSV(vouchers: Voucher[]) {
  const headers = [
    'Voucher No',
    'Date',
    'Type',
    'Party Name',
    'Account Name',
    'Debit',
    'Credit',
    'Payment Mode',
    'Narration'
  ];

  const rows: (string | number)[][] = [];

  vouchers.forEach(v => {
    if (v.entries && v.entries.length > 0) {
      v.entries.forEach(entry => {
        rows.push([
          v.voucherNumber,
          v.date,
          v.type,
          v.partyName || '',
          entry.accountName,
          entry.debit.toFixed(2),
          entry.credit.toFixed(2),
          v.paymentMode || '',
          entry.narration || v.narration || ''
        ]);
      });
    } else {
      rows.push([
        v.voucherNumber,
        v.date,
        v.type,
        v.partyName || '',
        'Direct Entry',
        v.totalAmount.toFixed(2),
        '0.00',
        v.paymentMode || '',
        v.narration
      ]);
    }
  });

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(r => r.map(escapeCsvCell).join(','))
  ].join('\n');

  triggerDownload(csvContent, `Journal_Vouchers_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportAccountsCSV(accounts: Account[]) {
  const headers = ['Account Code', 'Account Name', 'Category', 'Sub Category', 'Opening Balance', 'Balance Type'];
  const rows = accounts.map(acc => [
    acc.code,
    acc.name,
    acc.category,
    acc.subCategory,
    acc.openingBalance.toFixed(2),
    acc.balanceType
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(r => r.map(escapeCsvCell).join(','))
  ].join('\n');

  triggerDownload(csvContent, `Chart_of_Accounts_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportPartiesCSV(parties: PartyMaster[]) {
  const headers = ['Code', 'Party Name', 'Type', 'GSTIN', 'PAN', 'Phone', 'Email', 'Address', 'State', 'Opening Balance', 'Balance Type'];
  const rows = parties.map(p => [
    p.code,
    p.name,
    p.type,
    p.gstin || '',
    p.pan || '',
    p.phone || '',
    p.email || '',
    p.address || '',
    p.state || '',
    p.openingBalance.toFixed(2),
    p.balanceType
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(r => r.map(escapeCsvCell).join(','))
  ].join('\n');

  triggerDownload(csvContent, `Parties_Master_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportItemsCSV(items: ItemMaster[]) {
  const headers = ['Code', 'Item Name', 'Category', 'HSN/SAC', 'Unit', 'Purchase Price', 'Sales Price', 'Tax Rate (%)', 'Current Stock'];
  const rows = items.map(item => [
    item.code,
    item.name,
    item.category || '',
    item.hsnSacCode || '',
    item.unit,
    item.purchasePrice.toFixed(2),
    item.salesPrice.toFixed(2),
    item.taxRate,
    item.currentStock
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(r => r.map(escapeCsvCell).join(','))
  ].join('\n');

  triggerDownload(csvContent, `Inventory_Items_${new Date().toISOString().split('T')[0]}.csv`);
}

export function exportInventoryValuationCSV(data: AppData, method: ValuationMethod = 'COST') {
  const report = calculateInventoryValuationReport(data, method);
  const headers = [
    'Item Code',
    'Item Name',
    'Category',
    'HSN/SAC',
    'Unit',
    'In-Stock Qty',
    'Reorder Level',
    'Stock Status',
    'Valuation Rate',
    'Total Valuation Amount',
    'Selling Rate',
    'Realizable Sales Value',
    'Potential Profit Margin (%)'
  ];

  const rows = report.items.map(row => [
    row.item.code || '',
    row.item.name,
    row.category,
    row.item.hsnSacCode || '',
    row.unit,
    row.currentStock,
    row.reorderPoint,
    row.isOutOfStock ? 'OUT OF STOCK' : (row.isLowStock ? 'LOW STOCK - REORDER' : 'HEALTHY'),
    row.effectiveRate.toFixed(2),
    row.valuationAmount.toFixed(2),
    row.salesRate.toFixed(2),
    row.salesValuationAmount.toFixed(2),
    row.profitMarginPercent.toFixed(1) + '%'
  ]);

  const csvContent = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map(r => r.map(escapeCsvCell).join(','))
  ].join('\n');

  triggerDownload(csvContent, `Inventory_Valuation_${method}_${new Date().toISOString().split('T')[0]}.csv`);
}

// Consolidated Master CSV
export function exportAllDataCSV(data: AppData) {
  let combined = `--- COMPANY DETAILS ---\n`;
  combined += `Name,GSTIN,Email,Phone,State,Bank\n`;
  combined += `${escapeCsvCell(data.company.name)},${escapeCsvCell(data.company.gstin)},${escapeCsvCell(data.company.email)},${escapeCsvCell(data.company.phone)},${escapeCsvCell(data.company.state)},${escapeCsvCell(data.company.bankName)}\n\n`;

  combined += `--- SALES INVOICES ---\n`;
  combined += `Invoice No,Date,Party,GSTIN,Grand Total,Status\n`;
  data.invoices.forEach(inv => {
    combined += `${escapeCsvCell(inv.invoiceNumber)},${escapeCsvCell(inv.date)},${escapeCsvCell(inv.partyName)},${escapeCsvCell(inv.partyGstin)},${escapeCsvCell(inv.grandTotal)},${escapeCsvCell(inv.status)}\n`;
  });

  combined += `\n--- VOUCHERS ---\n`;
  combined += `Voucher No,Date,Type,Amount,Narration\n`;
  data.vouchers.forEach(v => {
    combined += `${escapeCsvCell(v.voucherNumber)},${escapeCsvCell(v.date)},${escapeCsvCell(v.type)},${escapeCsvCell(v.totalAmount)},${escapeCsvCell(v.narration)}\n`;
  });

  triggerDownload(combined, `Master_Accounting_Data_${new Date().toISOString().split('T')[0]}.csv`);
}

// ------------------- PRINT / PDF EXPORTS -------------------

export function exportFinancialReportPDF(data: AppData) {

  const totalSales = data.invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalReceived = data.invoices.reduce((sum, inv) => sum + inv.amountPaid, 0);
  const totalOutstanding = totalSales - totalReceived;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Financial Report - ${data.company.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 20px; color: #1e293b; background: #fff; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company-title { font-size: 24px; font-weight: bold; color: #0f172a; margin: 0; }
          .subtitle { font-size: 13px; color: #64748b; margin-top: 4px; }
          .meta { text-align: right; font-size: 11px; color: #475569; }
          .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; rounded: 8px; border-radius: 6px; }
          .card-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; }
          .card-value { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 4px; }
          section { margin-bottom: 24px; }
          h2 { font-size: 15px; font-weight: 700; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; color: #1e293b; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 12px; }
          th { background: #f1f5f9; font-weight: 600; text-align: left; padding: 8px; border: 1px solid #cbd5e1; }
          td { padding: 8px; border: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .footer { margin-top: 40px; font-size: 10px; text-align: center; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print {
            body { margin: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="margin-bottom: 12px; text-align: right;">
          <button onclick="window.print()" style="background: #4f46e5; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer;">
            🖨️ Save as PDF / Print
          </button>
        </div>

        <div class="header">
          <div>
            <h1 class="company-title">${data.company.name}</h1>
            <div class="subtitle">${data.company.address || 'Financial Record Statement'}</div>
            <div class="subtitle">GSTIN: ${data.company.gstin || 'N/A'} | PAN: ${data.company.pan || 'N/A'}</div>
          </div>
          <div class="meta">
            <div><strong>Report Type:</strong> Financial Statement Summary</div>
            <div><strong>Generated:</strong> ${new Date().toLocaleDateString('en-IN', { dateStyle: 'full' })}</div>
            <div><strong>Currency:</strong> ${data.company.currency || 'INR'}</div>
          </div>
        </div>

        <div class="summary-cards">
          <div class="card">
            <div class="card-title">Total Sales Revenue</div>
            <div class="card-value">${formatCurrency(totalSales, data.company.currency)}</div>
          </div>
          <div class="card">
            <div class="card-title">Total Payments Received</div>
            <div class="card-value" style="color: #16a34a;">${formatCurrency(totalReceived, data.company.currency)}</div>
          </div>
          <div class="card">
            <div class="card-title">Outstanding Receivables</div>
            <div class="card-value" style="color: #dc2626;">${formatCurrency(totalOutstanding, data.company.currency)}</div>
          </div>
        </div>

        <section>
          <h2>Recent Sales Invoices</h2>
          <table>
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date</th>
                <th>Party Name</th>
                <th>GSTIN</th>
                <th class="text-right">Grand Total</th>
                <th class="text-right">Amount Paid</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              ${data.invoices.map(inv => `
                <tr>
                  <td><strong>${inv.invoiceNumber}</strong></td>
                  <td>${inv.date}</td>
                  <td>${inv.partyName}</td>
                  <td>${inv.partyGstin || '-'}</td>
                  <td class="text-right">${formatCurrency(inv.grandTotal, data.company.currency)}</td>
                  <td class="text-right">${formatCurrency(inv.amountPaid, data.company.currency)}</td>
                  <td class="text-center">${inv.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <section>
          <h2>Journal Vouchers & Entries Summary</h2>
          <table>
            <thead>
              <tr>
                <th>Voucher No</th>
                <th>Date</th>
                <th>Type</th>
                <th>Party/Ref</th>
                <th class="text-right">Amount</th>
                <th>Narration</th>
              </tr>
            </thead>
            <tbody>
              ${data.vouchers.map(v => `
                <tr>
                  <td><strong>${v.voucherNumber}</strong></td>
                  <td>${v.date}</td>
                  <td>${v.type}</td>
                  <td>${v.partyName || '-'}</td>
                  <td class="text-right">${formatCurrency(v.totalAmount, data.company.currency)}</td>
                  <td>${v.narration || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>

        <div class="footer">
          Generated automatically by ${data.company.name} ERP System on ${new Date().toLocaleString()}
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          }
        </script>
      </body>
    </html>
  `;

  printHtmlDocument(html, {
    title: `Financial Report - ${data.company.name}`,
    filename: `${data.company.name.replace(/[^a-zA-Z0-9]/g, '_')}_Financial_Report`
  });
}

// ------------------- OFFICIAL GSTR-1 PORTAL OFFLINE UTILITY EXPORTS -------------------

function formatGstDate(isoDateStr: string): string {
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  if (!isoDateStr) {
    const curYear = new Date().getFullYear();
    return `01-Jan-${curYear}`;
  }
  const clean = isoDateStr.split('T')[0].trim();
  let day = '01';
  let monthIdx = 0;
  let year = new Date().getFullYear().toString();

  const parseMonth = (str: string): number => {
    const num = parseInt(str, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) return num - 1;
    const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === str.toLowerCase());
    return idx !== -1 ? idx : 0;
  };

  if (clean.includes('-')) {
    const parts = clean.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) { // YYYY-MM-DD
        year = parts[0];
        monthIdx = parseMonth(parts[1]);
        day = parts[2].padStart(2, '0');
      } else if (parts[2].length === 4) { // DD-MM-YYYY
        day = parts[0].padStart(2, '0');
        monthIdx = parseMonth(parts[1]);
        year = parts[2];
      }
    }
  } else if (clean.includes('/')) {
    const parts = clean.split('/');
    if (parts.length === 3) {
      if (parts[0].length === 4) { // YYYY/MM/DD
        year = parts[0];
        monthIdx = parseMonth(parts[1]);
        day = parts[2].padStart(2, '0');
      } else if (parts[2].length === 4) { // DD/MM/YYYY
        day = parts[0].padStart(2, '0');
        monthIdx = parseMonth(parts[1]);
        year = parts[2];
      }
    }
  }

  let yNum = parseInt(year, 10);
  if (isNaN(yNum) || yNum < 2000 || yNum > 2099) {
    yNum = new Date().getFullYear();
  }
  year = String(yNum);

  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11) monthIdx = 0;
  return `${day}-${MONTH_NAMES[monthIdx]}-${year}`;
}

const GST_STATE_MAP: { [key: string]: string } = {
  '01': '01-Jammu and Kashmir',
  '02': '02-Himachal Pradesh',
  '03': '03-Punjab',
  '04': '04-Chandigarh',
  '05': '05-Uttarakhand',
  '06': '06-Haryana',
  '07': '07-Delhi',
  '08': '08-Rajasthan',
  '09': '09-Uttar Pradesh',
  '10': '10-Bihar',
  '11': '11-Sikkim',
  '12': '12-Arunachal Pradesh',
  '13': '13-Nagaland',
  '14': '14-Manipur',
  '15': '15-Mizoram',
  '16': '16-Tripura',
  '17': '17-Meghalaya',
  '18': '18-Assam',
  '19': '19-West Bengal',
  '20': '20-Jharkhand',
  '21': '21-Odisha',
  '22': '22-Chhattisgarh',
  '23': '23-Madhya Pradesh',
  '24': '24-Gujarat',
  '25': '25-Daman and Diu',
  '26': '26-Dadra and Nagar Haveli',
  '27': '27-Maharashtra',
  '28': '28-Andhra Pradesh(Old)',
  '29': '29-Karnataka',
  '30': '30-Goa',
  '31': '31-Lakshadweep',
  '32': '32-Kerala',
  '33': '33-Tamil Nadu',
  '34': '34-Puducherry',
  '35': '35-Andaman and Nicobar Islands',
  '36': '36-Telangana',
  '37': '37-Andhra Pradesh',
  '38': '38-Ladakh',
  '97': '97-Other Territory',
  '99': '99-Center Jurisdiction'
};

function getOfficialPos(gstin?: string, stateName?: string, defaultState?: string): string {
  if (gstin && gstin.length >= 2) {
    const code = gstin.substring(0, 2);
    if (GST_STATE_MAP[code]) return GST_STATE_MAP[code];
  }
  const searchName = (stateName || defaultState || 'Madhya Pradesh').toLowerCase().trim();
  for (const key in GST_STATE_MAP) {
    const val = GST_STATE_MAP[key].toLowerCase();
    if (val.includes(searchName) || searchName.includes(val.split('-')[1] || '')) {
      return GST_STATE_MAP[key];
    }
  }
  return '23-Madhya Pradesh';
}

function sanitizeUqc(unitStr?: string): string {
  if (!unitStr) return 'NOS';
  const u = unitStr.trim().toUpperCase();
  const validList = [
    'BAG', 'BTL', 'BOL', 'BOX', 'BKN', 'BTH', 'BDL', 'GMS', 'GGK', 'KGS', 
    'KLR', 'KME', 'MLT', 'MTR', 'MTS', 'NOS', 'PAC', 'PCS', 'PRS', 'QTL', 
    'SET', 'SQF', 'SQM', 'SQY', 'TBS', 'TUB', 'UGS', 'UNT', 'YDS', 'OTH'
  ];
  if (validList.includes(u)) return u;
  if (u.includes('NO') || u.includes('NUM')) return 'NOS';
  if (u.includes('PC') || u.includes('PIECE')) return 'PCS';
  if (u.includes('KG') || u.includes('KILO')) return 'KGS';
  if (u.includes('MTR') || u.includes('MET')) return 'MTR';
  if (u.includes('BOX')) return 'BOX';
  if (u.includes('SET')) return 'SET';
  if (u.includes('BAG')) return 'BAG';
  if (u.includes('BTL') || u.includes('BOTTLE')) return 'BTL';
  if (u.includes('DOZ')) return 'DOZ';
  if (u.includes('GM') || u.includes('GRAM')) return 'GMS';
  if (u.includes('PAC') || u.includes('PACK')) return 'PAC';
  if (u.includes('QTL')) return 'QTL';
  if (u.includes('SQF')) return 'SQF';
  if (u.includes('SQM')) return 'SQM';
  if (u.includes('TON')) return 'MTS';
  if (u.includes('UNT') || u.includes('UNIT')) return 'UNT';
  return 'OTH';
}

function sanitizeHsnCode(hsnStr?: string): string {
  if (!hsnStr) return '59090020';
  const digits = hsnStr.trim().replace(/[^0-9]/g, '');
  if (digits.length >= 2) return digits;
  return '59090020';
}

function sanitizePosCode(posStr?: string, defaultPos: string = '23'): string {
  if (!posStr) return defaultPos;
  const digits = posStr.trim().replace(/[^0-9]/g, '');
  if (digits.length === 1) return `0${digits}`;
  if (digits.length >= 2) return digits.substring(0, 2);
  return defaultPos;
}

export function buildGSTR1PortalJsonPayload(
  invoices: SalesInvoice[],
  company: CompanyDetails,
  parties?: PartyMaster[],
  debitCreditNotes: DebitCreditNote[] = []
) {
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const activeInvoices = safeInvoices
    .filter(i => i && i.status !== 'CANCELLED')
    .map(i => resolveSalesInvoiceWithParty(i, parties, company?.state));

  const companyGstinClean = company?.gstin ? company.gstin.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
  const validCompanyGstin = companyGstinClean.length === 15 ? companyGstinClean : '23AOZPD9829B1ZP';
  const companyStateCode =
    resolveOfficialStateCode({
      gstin: validCompanyGstin,
      stateCode: company?.stateCode,
      stateName: company?.state,
      fallbackStateCode: '23',
    }) || '23';

  // Financial Period "fp" e.g. "062026"
  let fpPeriod = '062026';
  for (const inv of activeInvoices) {
    if (!inv || !inv.date) continue;
    const clean = inv.date.split('T')[0].trim();
    if (clean.includes('-')) {
      const p = clean.split('-');
      if (p.length === 3) {
        if (p[0].length === 4) { fpPeriod = `${p[1]}${p[0]}`; break; }
        if (p[2].length === 4) { fpPeriod = `${p[1]}${p[2]}`; break; }
      }
    }
    if (clean.includes('/')) {
      const p = clean.split('/');
      if (p.length === 3) {
        if (p[0].length === 4) { fpPeriod = `${p[1]}${p[0]}`; break; }
        if (p[2].length === 4) { fpPeriod = `${p[1]}${p[2]}`; break; }
      }
    }
  }

  const resolveInvPos = (inv: {
    partyGstin?: string;
    partyState?: string;
    placeOfSupply?: string;
  }) => {
    const code = resolveOfficialStateCode({
      placeOfSupply: inv.placeOfSupply,
      gstin: inv.partyGstin,
      stateName: inv.partyState,
      fallbackStateCode: companyStateCode,
    });
    return sanitizePosCode(code || companyStateCode, companyStateCode);
  };

  // Categorize invoices according to Govt GST Offline Tool rules:
  const expInvoices = activeInvoices.filter(i => i.invoiceType === 'EXPORT');
  const nilExemptInvoices = activeInvoices.filter(
    i => i.invoiceType === 'NIL_RATED' || i.invoiceType === 'EXEMPT'
  );
  const taxableOutwardInvoices = activeInvoices.filter(
    i => i.invoiceType !== 'EXPORT' && i.invoiceType !== 'NIL_RATED' && i.invoiceType !== 'EXEMPT'
  );

  const b2bInvoices = taxableOutwardInvoices.filter(i =>
    resolveTransactionGstDetails(i, parties, company?.state).isB2b
  );
  const b2clInvoices = taxableOutwardInvoices.filter(i => {
    const isB2b = resolveTransactionGstDetails(i, parties, company?.state).isB2b;
    const isInter =
      i.isInterState ||
      resolveIsInterStateSupply({
        companyGstin: validCompanyGstin,
        companyState: company?.state,
        companyStateCode,
        partyGstin: i.partyGstin,
        partyState: i.partyState,
        placeOfSupply: i.placeOfSupply,
      });
    return !isB2b && isInter && (Number(i.grandTotal) || 0) > 250000;
  });
  const b2csInvoices = taxableOutwardInvoices.filter(i => {
    const isB2b = resolveTransactionGstDetails(i, parties, company?.state).isB2b;
    const isInter =
      i.isInterState ||
      resolveIsInterStateSupply({
        companyGstin: validCompanyGstin,
        companyState: company?.state,
        companyStateCode,
        partyGstin: i.partyGstin,
        partyState: i.partyState,
        placeOfSupply: i.placeOfSupply,
      });
    return !isB2b && (!isInter || (Number(i.grandTotal) || 0) <= 250000);
  });

  // Group B2B by Party GSTIN (ctin)
  const b2bGroupedMap = new Map<string, SalesInvoice[]>();
  b2bInvoices.forEach(inv => {
    const rawCtin = inv.partyGstin ? inv.partyGstin.trim().replace(/[^A-Za-z0-9]/g, '').toUpperCase() : '';
    const ctin = fixGstinChecksum(rawCtin);
    const existing = b2bGroupedMap.get(ctin) || [];
    existing.push(inv);
    b2bGroupedMap.set(ctin, existing);
  });

  const buildRateWiseItems = (items: SalesInvoice['items'], isInter: boolean) => {
    const rateMap = new Map<number, { txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
    (items || []).forEach(item => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discountPercent) || 0;
      const taxRate = Number(item.taxRate) || 0;

      const lineTaxable = qty * rate * (1 - disc / 100);
      const lineTax = Number(item.taxAmount) || (lineTaxable * taxRate / 100);
      const lineCess = Number(item.cessAmount) || 0;
      const existing = rateMap.get(taxRate) || { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      existing.txval += lineTaxable;
      existing.csamt += lineCess;
      if (isInter) {
        existing.iamt += lineTax;
      } else {
        existing.camt += lineTax / 2;
        existing.samt += lineTax / 2;
      }
      rateMap.set(taxRate, existing);
    });

    return Array.from(rateMap.entries()).map(([rt, det]) => {
      const rtNum = Number(rt) || 0;
      const numVal = rtNum > 0 ? (rtNum * 100 + 1) : 1;
      const itemDet: any = {
        txval: Number(det.txval.toFixed(2)),
        rt: rtNum,
        csamt: Number(det.csamt.toFixed(2))
      };
      if (isInter) {
        itemDet.iamt = Number(det.iamt.toFixed(2));
      } else {
        itemDet.camt = Number(det.camt.toFixed(2));
        itemDet.samt = Number(det.samt.toFixed(2));
      }
      return {
        num: numVal,
        itm_det: itemDet
      };
    });
  };

  const b2bPayload = Array.from(b2bGroupedMap.entries()).map(([ctin, invList]) => ({
    ctin,
    inv: invList.map(inv => {
      const invPos = resolveInvPos(inv);
      const isInter = inv.isInterState || (invPos !== companyStateCode);
      return {
        inum: inv.invoiceNumber ? inv.invoiceNumber.trim() : 'INF/26-27/01',
        idt: formatGstDate(inv.date),
        val: Number((inv.grandTotal || 0).toFixed(2)),
        pos: invPos,
        rchrg: (inv as any).reverseCharge ? 'Y' : 'N',
        inv_typ: 'R',
        itms: buildRateWiseItems(inv.items || [], isInter)
      };
    })
  }));

  // B2CL (Unregistered Inter-State > 2.5L) grouped by POS
  const b2clGroupedMap = new Map<string, SalesInvoice[]>();
  b2clInvoices.forEach(inv => {
    const pos = resolveInvPos(inv);
    const existing = b2clGroupedMap.get(pos) || [];
    existing.push(inv);
    b2clGroupedMap.set(pos, existing);
  });
  const b2clPayload = Array.from(b2clGroupedMap.entries()).map(([pos, invList]) => ({
    pos,
    inv: invList.map(inv => ({
      inum: inv.invoiceNumber ? inv.invoiceNumber.trim() : 'INF/26-27/01',
      idt: formatGstDate(inv.date),
      val: Number((inv.grandTotal || 0).toFixed(2)),
      itms: buildRateWiseItems(inv.items || [], true),
    }))
  }));

  // B2CS (B2C Small) Summarized Grouping by Supply Type, POS, Rate
  const b2csMap = new Map<string, { sply_ty: string; pos: string; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
  b2csInvoices.forEach(inv => {
    const invPos = resolveInvPos(inv);
    const isInter = inv.isInterState || (invPos !== companyStateCode);
    const sply_ty = isInter ? 'INTER' : 'INTRA';

    (inv.items || []).forEach(item => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discountPercent) || 0;
      const taxRate = Number(item.taxRate) || 0;

      const key = `${sply_ty}_${invPos}_${taxRate}`;
      const lineTaxable = qty * rate * (1 - disc / 100);
      const lineTax = Number(item.taxAmount) || (lineTaxable * taxRate / 100);
      const lineCess = Number(item.cessAmount) || 0;
      const existing = b2csMap.get(key) || { sply_ty, pos: invPos, rt: taxRate, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
      existing.txval += lineTaxable;
      existing.csamt += lineCess;
      if (isInter) {
        existing.iamt += lineTax;
      } else {
        existing.camt += lineTax / 2;
        existing.samt += lineTax / 2;
      }
      b2csMap.set(key, existing);
    });
  });

  const b2csPayload = Array.from(b2csMap.values()).map(row => {
    const itemObj: any = {
      sply_ty: row.sply_ty,
      rt: Number(row.rt),
      typ: 'OE',
      pos: row.pos,
      txval: Number(row.txval.toFixed(2)),
      csamt: Number(row.csamt.toFixed(2))
    };
    if (row.sply_ty === 'INTRA') {
      itemObj.camt = Number(row.camt.toFixed(2));
      itemObj.samt = Number(row.samt.toFixed(2));
    } else {
      itemObj.iamt = Number(row.iamt.toFixed(2));
    }
    return itemObj;
  });

  // Export invoices (Table 6A)
  const expPayload = expInvoices.length > 0
    ? [
        {
          exp_typ: 'WOPAY',
          inv: expInvoices.map(inv => ({
            inum: inv.invoiceNumber ? inv.invoiceNumber.trim() : 'EXP-01',
            idt: formatGstDate(inv.date),
            val: Number((inv.grandTotal || 0).toFixed(2)),
            sbpcode: 'INB995',
            sbnum: '184298',
            sbdt: formatGstDate(inv.date),
            itms: (inv.items || []).map(item => {
              const qty = Number(item.quantity) || 0;
              const rate = Number(item.rate) || 0;
              const disc = Number(item.discountPercent) || 0;
              const txval = qty * rate * (1 - disc / 100);
              return {
                txval: Number(txval.toFixed(2)),
                rt: Number(item.taxRate) || 0,
                iamt: Number((Number(item.taxAmount) || 0).toFixed(2)),
                csamt: Number((Number(item.cessAmount) || 0).toFixed(2)),
              };
            }),
          })),
        },
      ]
    : [];

  // Nil Rated / Exempted structure (Table 8)
  const nilTotals = {
    INTRB2B: { nil: 0, expt: 0 },
    INTRAB2B: { nil: 0, expt: 0 },
    INTRB2C: { nil: 0, expt: 0 },
    INTRAB2C: { nil: 0, expt: 0 },
  };
  nilExemptInvoices.forEach(inv => {
    const isB2b = resolveTransactionGstDetails(inv, parties, company?.state).isB2b;
    const invPos = resolveInvPos(inv);
    const isInter = inv.isInterState || (invPos !== companyStateCode);
    const splyType = `${isInter ? 'INTR' : 'INTRA'}${isB2b ? 'B2B' : 'B2C'}` as keyof typeof nilTotals;
    const taxable = Math.max(0, (inv.subtotal || 0) - (inv.totalDiscount || 0));
    if (inv.invoiceType === 'NIL_RATED') nilTotals[splyType].nil += taxable;
    else nilTotals[splyType].expt += taxable;
  });
  const nilInvRows = Object.entries(nilTotals)
    .filter(([, v]) => v.nil > 0 || v.expt > 0)
    .map(([sply_ty, v]) => ({
      sply_ty,
      nil_amt: Number(v.nil.toFixed(2)),
      expt_amt: Number(v.expt.toFixed(2)),
      ngsup_amt: 0,
    }));
  const nilPayload = {
    inv: nilInvRows
  };

  // CDNR & CDNUR (Table 9B - Credit/Debit Notes)
  const safeNotes = Array.isArray(debitCreditNotes) ? debitCreditNotes : [];
  const cdnrGroupedMap = new Map<string, DebitCreditNote[]>();
  const cdnurPayload: any[] = [];

  safeNotes.forEach(note => {
    if (!note) return;
    const gstDet = resolveTransactionGstDetails(
      { partyId: note.partyId, partyName: note.partyName, partyGstin: note.partyGstin },
      parties,
      company?.state
    );
    const notePos = sanitizePosCode(
      resolveOfficialStateCode({
        gstin: gstDet.gstin || note.partyGstin,
        stateCode: gstDet.stateCode,
        stateName: gstDet.state,
        fallbackStateCode: companyStateCode,
      }) || companyStateCode,
      companyStateCode
    );
    const isInter =
      (Number(note.igstAmount) || 0) > 0 ||
      resolveIsInterStateSupply({
        companyGstin: validCompanyGstin,
        companyState: company?.state,
        companyStateCode,
        partyGstin: gstDet.gstin || note.partyGstin,
        partyState: gstDet.state,
        partyStateCode: gstDet.stateCode,
      });
    const ntty = note.type === 'CREDIT_NOTE' ? 'C' : 'D';
    const itemsList = (note.items && note.items.length > 0)
      ? note.items
      : [{
          id: 'fallback',
          itemId: '',
          itemName: note.reason || 'Adjustment',
          hsnSacCode: '9997',
          quantity: 1,
          unit: 'NOS',
          rate: Math.max(0, (note.subtotal || 0) - (note.totalDiscount || 0)),
          discountPercent: 0,
          taxRate: (note.subtotal || 0) > 0
            ? Math.round(((note.totalTax || 0) / Math.max(1, (note.subtotal || 0) - (note.totalDiscount || 0))) * 100)
            : 18,
          taxAmount: note.totalTax || 0,
          cessAmount: note.cessAmount || 0,
          totalAmount: note.grandTotal || 0,
        }];

    if (gstDet.isB2b && isValidB2bGstin(gstDet.gstin)) {
      const ctin = fixGstinChecksum(gstDet.gstin);
      const list = cdnrGroupedMap.get(ctin) || [];
      list.push(note);
      cdnrGroupedMap.set(ctin, list);
    } else if (isInter && (Number(note.grandTotal) || 0) > 250000) {
      cdnurPayload.push({
        typ: 'B2CL',
        nt_num: note.noteNumber ? note.noteNumber.trim() : 'NOTE-01',
        nt_dt: formatGstDate(note.date),
        ntty,
        pos: notePos,
        val: Number((note.grandTotal || 0).toFixed(2)),
        itms: buildRateWiseItems(itemsList, true),
      });
    }
  });

  const cdnrPayload = Array.from(cdnrGroupedMap.entries()).map(([ctin, notesList]) => ({
    ctin,
    nt: notesList.map(note => {
      const gstDet = resolveTransactionGstDetails(
        { partyId: note.partyId, partyName: note.partyName, partyGstin: note.partyGstin },
        parties,
        company?.state
      );
      const notePos = sanitizePosCode(
        resolveOfficialStateCode({
          gstin: gstDet.gstin || note.partyGstin,
          stateCode: gstDet.stateCode,
          stateName: gstDet.state,
          fallbackStateCode: companyStateCode,
        }) || companyStateCode,
        companyStateCode
      );
      const isInter =
        (Number(note.igstAmount) || 0) > 0 ||
        notePos !== companyStateCode;
      const itemsList = (note.items && note.items.length > 0)
        ? note.items
        : [{
            id: 'fallback',
            itemId: '',
            itemName: note.reason || 'Adjustment',
            hsnSacCode: '9997',
            quantity: 1,
            unit: 'NOS',
            rate: Math.max(0, (note.subtotal || 0) - (note.totalDiscount || 0)),
            discountPercent: 0,
            taxRate: (note.subtotal || 0) > 0
              ? Math.round(((note.totalTax || 0) / Math.max(1, (note.subtotal || 0) - (note.totalDiscount || 0))) * 100)
              : 18,
            taxAmount: note.totalTax || 0,
            cessAmount: note.cessAmount || 0,
            totalAmount: note.grandTotal || 0,
          }];
      return {
        ntty: note.type === 'CREDIT_NOTE' ? 'C' : 'D',
        nt_num: note.noteNumber ? note.noteNumber.trim() : 'NOTE-01',
        nt_dt: formatGstDate(note.date),
        p_gst: 'N',
        pos: notePos,
        rchrg: 'N',
        inv_typ: 'R',
        val: Number((note.grandTotal || 0).toFixed(2)),
        itms: buildRateWiseItems(itemsList, isInter),
      };
    }),
  }));

  // HSN Summary (Separated into hsn_b2b and hsn_b2c as per GST3.2.4 schema)
  const hsnB2bMap = new Map<string, { hsn_sc: string; user_desc: string; desc: string; uqc: string; qty: number; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
  const hsnB2cMap = new Map<string, { hsn_sc: string; user_desc: string; desc: string; uqc: string; qty: number; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();

  activeInvoices.forEach(inv => {
    const isB2b = resolveTransactionGstDetails(inv, parties, company?.state).isB2b;
    const targetMap = isB2b ? hsnB2bMap : hsnB2cMap;

    const invPos = resolveInvPos(inv);
    const isInter = inv.isInterState || (invPos !== companyStateCode);

    (inv.items || []).forEach(item => {
      const hsnCode = sanitizeHsnCode(item.hsnSacCode);
      const uqc = sanitizeUqc(item.unit);
      const taxRate = Number(item.taxRate) || 0;
      const key = `${hsnCode}_${taxRate}_${uqc}`;

      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discountPercent) || 0;

      const lineTaxable = qty * rate * (1 - disc / 100);
      const lineTax = Number(item.taxAmount) || (lineTaxable * taxRate / 100);
      const lineCess = Number(item.cessAmount) || 0;

      const itemDesc = item.itemName ? item.itemName.trim().toUpperCase() : 'OUTWARD SUPPLY';
      const userDesc = itemDesc.substring(0, 30);
      const fullDesc = itemDesc.substring(0, 40);

      const existing = targetMap.get(key) || {
        hsn_sc: hsnCode,
        user_desc: userDesc,
        desc: fullDesc,
        uqc,
        qty: 0,
        rt: taxRate,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0
      };

      existing.qty += qty;
      existing.txval += lineTaxable;
      existing.csamt += lineCess;
      if (isInter) {
        existing.iamt += lineTax;
      } else {
        existing.camt += lineTax / 2;
        existing.samt += lineTax / 2;
      }
      targetMap.set(key, existing);
    });
  });

  const hsnB2bData = Array.from(hsnB2bMap.values()).map((h, idx) => ({
    num: idx + 1,
    hsn_sc: h.hsn_sc,
    user_desc: h.user_desc,
    desc: h.desc,
    uqc: h.uqc,
    qty: Number((Number(h.qty) || 0).toFixed(2)),
    rt: Number(h.rt) || 0,
    txval: Number((Number(h.txval) || 0).toFixed(2)),
    iamt: Number((Number(h.iamt) || 0).toFixed(2)),
    samt: Number((Number(h.samt) || 0).toFixed(2)),
    camt: Number((Number(h.camt) || 0).toFixed(2)),
    csamt: Number((Number(h.csamt) || 0).toFixed(2)),
    ctin: ''
  }));

  const hsnB2cData = Array.from(hsnB2cMap.values()).map((h, idx) => ({
    num: idx + 1,
    hsn_sc: h.hsn_sc,
    user_desc: h.user_desc,
    desc: h.desc,
    uqc: h.uqc,
    qty: Number((Number(h.qty) || 0).toFixed(2)),
    rt: Number(h.rt) || 0,
    txval: Number((Number(h.txval) || 0).toFixed(2)),
    iamt: Number((Number(h.iamt) || 0).toFixed(2)),
    samt: Number((Number(h.samt) || 0).toFixed(2)),
    camt: Number((Number(h.camt) || 0).toFixed(2)),
    csamt: Number((Number(h.csamt) || 0).toFixed(2))
  }));

  // Document Summary (doc_issue)
  const cancelledInvoices = safeInvoices.filter(i => i && i.status === 'CANCELLED');
  const totalCount = activeInvoices.length + cancelledInvoices.length;
  const activeCount = activeInvoices.length;
  const cancelledCount = cancelledInvoices.length;

  const firstInvNum = activeInvoices[0]?.invoiceNumber ? activeInvoices[0].invoiceNumber.trim() : 'INF/26-27/01';
  const lastInvNum = activeInvoices[activeInvoices.length - 1]?.invoiceNumber 
    ? activeInvoices[activeInvoices.length - 1].invoiceNumber.trim() 
    : firstInvNum;

  const doc_det: any[] = [
    {
      doc_num: 1,
      doc_typ: 'Invoices for outward supply',
      docs: [
        {
          num: 1,
          from: firstInvNum,
          to: lastInvNum,
          totnum: totalCount,
          cancel: cancelledCount,
          net_issue: activeCount
        }
      ]
    }
  ];

  const creditNotes = safeNotes.filter(n => n.type === 'CREDIT_NOTE');
  if (creditNotes.length > 0) {
    doc_det.push({
      doc_num: 5,
      doc_typ: 'Credit Note',
      docs: [{
        num: 1,
        from: creditNotes[0].noteNumber,
        to: creditNotes[creditNotes.length - 1].noteNumber,
        totnum: creditNotes.length,
        cancel: 0,
        net_issue: creditNotes.length,
      }],
    });
  }
  const debitNotes = safeNotes.filter(n => n.type === 'DEBIT_NOTE');
  if (debitNotes.length > 0) {
    doc_det.push({
      doc_num: 4,
      doc_typ: 'Debit Note',
      docs: [{
        num: 1,
        from: debitNotes[0].noteNumber,
        to: debitNotes[debitNotes.length - 1].noteNumber,
        totnum: debitNotes.length,
        cancel: 0,
        net_issue: debitNotes.length,
      }],
    });
  }

  const docIssuePayload = { doc_det };

  // Check if fpPeriod >= May 2025 ("052025") for showHSNTabs
  const fpMonth = parseInt(fpPeriod.substring(0, 2), 10);
  const fpYear = parseInt(fpPeriod.substring(2), 10);
  const showHSNTabs = (fpYear > 2025) || (fpYear === 2025 && fpMonth >= 5);

  return {
    gstin: validCompanyGstin,
    fp: fpPeriod,
    gt: 0,
    cur_gt: 0,
    version: 'GST3.2.4',
    hash: 'hash',
    b2b: b2bPayload,
    b2ba: [],
    b2cl: b2clPayload,
    b2cla: [],
    b2cs: b2csPayload,
    b2csa: [],
    nil: nilPayload,
    exp: expPayload,
    expa: [],
    hsnSac: [],
    cdnra: [],
    at: [],
    ata: [],
    cdnr: cdnrPayload,
    cdnur: cdnurPayload,
    cdnura: [],
    atadj: [],
    atadja: [],
    doc_issue: docIssuePayload,
    hsn: showHSNTabs ? {
      hsn_b2b: hsnB2bData,
      hsn_b2c: hsnB2cData
    } : {
      data: []
    },
    supeco: { clttx: [], paytx: [] },
    supecoa: { clttxa: [], paytxa: [] },
    ecom: { b2b: [], b2c: [], urp2b: [], urp2c: [] },
    ecoma: { b2ba: [], b2ca: [], urp2ba: [], urp2ca: [] }
  };
}

export function exportGSTR1PortalJson(
  invoices: SalesInvoice[],
  company: CompanyDetails,
  parties?: PartyMaster[],
  debitCreditNotes: DebitCreditNote[] = []
) {
  try {
    const officialGstr1Payload = buildGSTR1PortalJsonPayload(invoices, company, parties, debitCreditNotes);
    const jsonString = JSON.stringify(officialGstr1Payload, null, 2);
    triggerDownload(
      jsonString,
      `GSTR1_${officialGstr1Payload.gstin}_${officialGstr1Payload.fp}.json`,
      'application/json;charset=utf-8;'
    );
  } catch (err: any) {
    console.error('Error exporting GSTR1 JSON:', err);
  }
}

export function fixGstinChecksum(gstinStr?: string): string {
  if (!gstinStr) return '';
  const clean = gstinStr.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length !== 15) return clean;
  const factor = [1, 2];
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let code = chars.indexOf(clean[i]);
    if (code === -1) return clean;
    let product = code * factor[i % 2];
    sum += Math.floor(product / 36) + (product % 36);
  }
  let checkCode = (36 - (sum % 36)) % 36;
  const validChar = chars[checkCode];
  return clean.substring(0, 14) + validChar;
}

export function exportGSTR1OfflineExcelCsv(
  invoices: SalesInvoice[],
  company: CompanyDetails,
  parties?: PartyMaster[],
  debitCreditNotes: DebitCreditNote[] = []
) {
  const activeInvoices = (invoices || [])
    .filter(i => i && i.status !== 'CANCELLED')
    .map(i => resolveSalesInvoiceWithParty(i, parties, company?.state));
  const cancelledCount = (invoices || []).filter(i => i && i.status === 'CANCELLED').length;

  const wb = XLSX.utils.book_new();

  // Helper to create a worksheet matching GST Offline Utility template layout:
  // Row 1: Section Title
  // Row 2: SubHeader (if any, e.g., Original/Revised details)
  // Row 3: Blank Row
  // Row 4: Column Headers
  // Row 5+: Data Rows
  const createSheetWithLayout = (title: string, subHeaderRow: string[] = [], headers: string[], rows: any[][]) => {
    const aoa = [
      [title],
      subHeaderRow,
      [],
      headers,
      ...rows
    ];
    return XLSX.utils.aoa_to_sheet(aoa);
  };

  // 1. Sheet: b2b
  const b2bHeaders = [
    'GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice date',
    'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Applicable % of Tax Rate',
    'Invoice Type', 'E-Commerce GSTIN', 'Rate', 'Taxable Value', 'Cess Amount'
  ];
  const b2bRows: any[][] = [];
  activeInvoices.forEach(inv => {
    if (inv.invoiceType === 'EXPORT' || inv.invoiceType === 'NIL_RATED' || inv.invoiceType === 'EXEMPT') return;
    const resolvedGst = resolveTransactionGstDetails(inv, parties, company?.state);
    const partyGstin = fixGstinChecksum(resolvedGst.gstin);
    const isB2b = resolvedGst.isB2b;
    if (isB2b) {
      const pos = getOfficialPos(partyGstin, inv.placeOfSupply || inv.partyState, company.state);
      const formattedDate = formatGstDate(inv.date);
      const rawInv = (inv.invoiceNumber || '').trim().replace(/[^A-Za-z0-9\/-]/g, '');
      const cleanInvNum = (rawInv && rawInv !== '0') ? rawInv.substring(0, 16) : 'INV-01';

      // Group line items by taxRate for this invoice to prevent duplicate rate rows in Offline Tool
      const rateMap = new Map<number, { txval: number; cess: number }>();
      (inv.items || []).forEach(item => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const disc = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const txval = qty * rate * (1 - disc / 100);
        const cess = Number(item.cessAmount) || 0;

        const cur = rateMap.get(taxRate) || { txval: 0, cess: 0 };
        cur.txval += txval;
        cur.cess += cess;
        rateMap.set(taxRate, cur);
      });

      rateMap.forEach((det, taxRate) => {
        const cat = ((inv as any).partyGstCategory || '') as string;
        const invType = (cat === 'SEZ_WITH_PAYMENT') ? 'SEZ supplies with payment' :
                        (cat === 'SEZ_WITHOUT_PAYMENT') ? 'SEZ supplies without payment' :
                        (cat === 'DEEMED_EXPORT') ? 'Deemed Exports' : 'Regular';
        b2bRows.push([
          partyGstin,
          (inv.partyName || 'B2B Customer').trim(),
          cleanInvNum,
          formattedDate,
          Number((inv.grandTotal || 0).toFixed(2)),
          pos,
          (inv as any).reverseCharge ? 'Y' : 'N',
          '',
          invType,
          '',
          taxRate,
          Number(det.txval.toFixed(2)),
          Number(det.cess.toFixed(2))
        ]);
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For B2B(4)', [], b2bHeaders, b2bRows), 'b2b');

  // 2. Sheet: b2ba
  const b2baHeaders = [
    'GSTIN/UIN of Recipient', 'Receiver Name', 'Original Invoice Number', 'Original Invoice date',
    'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Place Of Supply',
    'Reverse Charge', 'Applicable % of Tax Rate', 'Invoice Type', 'E-Commerce GSTIN',
    'Rate', 'Taxable Value', 'Cess Amount'
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For B2BA', ['Original details', '', '', '', 'Revised Details'], b2baHeaders, []), 'b2ba');

  // 3. Sheet: b2cl
  const b2clHeaders = [
    'Invoice Number', 'Invoice date', 'Invoice Value', 'Place Of Supply',
    'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'
  ];
  const b2clRows: any[][] = [];
  activeInvoices.forEach(inv => {
    if (inv.invoiceType === 'EXPORT' || inv.invoiceType === 'NIL_RATED' || inv.invoiceType === 'EXEMPT') return;
    const resolvedGst = resolveTransactionGstDetails(inv, parties, company?.state);
    const partyGstin = resolvedGst.gstin;
    const isUnregistered = !resolvedGst.isB2b;
    if (isUnregistered && inv.isInterState && inv.grandTotal > 250000) {
      const pos = getOfficialPos(partyGstin, inv.placeOfSupply || inv.partyState, company.state);
      const formattedDate = formatGstDate(inv.date);

      const rateMap = new Map<number, { txval: number; cess: number }>();
      (inv.items || []).forEach(item => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const disc = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const txval = qty * rate * (1 - disc / 100);
        const cess = Number(item.cessAmount) || 0;

        const cur = rateMap.get(taxRate) || { txval: 0, cess: 0 };
        cur.txval += txval;
        cur.cess += cess;
        rateMap.set(taxRate, cur);
      });

      rateMap.forEach((det, taxRate) => {
        b2clRows.push([
          inv.invoiceNumber,
          formattedDate,
          Number((inv.grandTotal || 0).toFixed(2)),
          pos,
          '',
          taxRate,
          Number(det.txval.toFixed(2)),
          Number(det.cess.toFixed(2)),
          ''
        ]);
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For B2CL(5)', [], b2clHeaders, b2clRows), 'b2cl');

  // 4. Sheet: b2cla
  const b2claHeaders = [
    'Original Invoice Number', 'Original Invoice date', 'Original Place Of Supply',
    'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value',
    'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For B2CLA', ['Original details', '', '', 'Revised Details'], b2claHeaders, []), 'b2cla');

  // 5. Sheet: b2cs
  const b2csHeaders = [
    'Type', 'Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'
  ];
  const b2csMap = new Map<string, { type: string; pos: string; rate: number; txval: number; cess: number }>();
  activeInvoices.forEach(inv => {
    if (inv.invoiceType === 'EXPORT' || inv.invoiceType === 'NIL_RATED' || inv.invoiceType === 'EXEMPT') return;
    const resolvedGst = resolveTransactionGstDetails(inv, parties, company?.state);
    const partyGstin = resolvedGst.gstin;
    const isUnregistered = !resolvedGst.isB2b;
    if (isUnregistered && (!inv.isInterState || inv.grandTotal <= 250000)) {
      const type = 'OE';
      const pos = getOfficialPos(partyGstin, inv.placeOfSupply || inv.partyState, company.state);

      (inv.items || []).forEach(item => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const disc = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const txval = qty * rate * (1 - disc / 100);
        const cess = Number(item.cessAmount) || 0;

        const key = `${type}_${pos}_${taxRate}`;
        const existing = b2csMap.get(key) || { type, pos, rate: taxRate, txval: 0, cess: 0 };
        existing.txval += txval;
        existing.cess += cess;
        b2csMap.set(key, existing);
      });
    }
  });

  const b2csRows: any[][] = Array.from(b2csMap.values()).map(row => [
    row.type,
    row.pos,
    '',
    row.rate,
    Number(row.txval.toFixed(2)),
    Number(row.cess.toFixed(2)),
    ''
  ]);
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For B2CS(7)', [], b2csHeaders, b2csRows), 'b2cs');

  // 6. Sheet: b2csa
  const b2csaHeaders = [
    'Financial Year', 'Original Month', 'Place Of Supply', 'Type',
    'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount', 'E-Commerce GSTIN'
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For B2CSA', ['Original details', '', '', 'Revised details'], b2csaHeaders, []), 'b2csa');

  // 7. Sheet: cdnr & 9. Sheet: cdnur
  const cdnrHeaders = [
    'GSTIN/UIN of Recipient', 'Receiver Name', 'Note Number', 'Note Date', 'Note Type',
    'Place Of Supply', 'Reverse Charge', 'Note Supply Type', 'Note Value',
    'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'
  ];
  const cdnurHeaders = [
    'UR Type', 'Note Number', 'Note Date', 'Note Type', 'Place Of Supply',
    'Note Value', 'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'
  ];
  const cdnrRows: any[][] = [];
  const cdnurRows: any[][] = [];

  (debitCreditNotes || []).forEach(note => {
    if (!note) return;
    const gstDet = resolveTransactionGstDetails(
      { partyId: note.partyId, partyName: note.partyName, partyGstin: note.partyGstin },
      parties,
      company?.state
    );
    const pos = getOfficialPos(gstDet.gstin || note.partyGstin, gstDet.state, company?.state);
    const formattedDate = formatGstDate(note.date);
    const noteTypeCode = note.type === 'CREDIT_NOTE' ? 'C' : 'D';
    const itemsList = (note.items && note.items.length > 0)
      ? note.items
      : [{
          id: 'fallback',
          itemId: '',
          itemName: note.reason || 'Adjustment',
          hsnSacCode: '9997',
          quantity: 1,
          unit: 'NOS',
          rate: Math.max(0, (note.subtotal || 0) - (note.totalDiscount || 0)),
          discountPercent: 0,
          taxRate: (note.subtotal || 0) > 0
            ? Math.round(((note.totalTax || 0) / Math.max(1, (note.subtotal || 0) - (note.totalDiscount || 0))) * 100)
            : 18,
          taxAmount: note.totalTax || 0,
          cessAmount: note.cessAmount || 0,
          totalAmount: note.grandTotal || 0,
        }];

    const rateMap = new Map<number, { txval: number; cess: number }>();
    itemsList.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discountPercent) || 0;
      const taxRate = Number(item.taxRate) || 0;
      const txval = qty * rate * (1 - disc / 100);
      const cess = Number(item.cessAmount) || 0;
      const cur = rateMap.get(taxRate) || { txval: 0, cess: 0 };
      cur.txval += txval;
      cur.cess += cess;
      rateMap.set(taxRate, cur);
    });

    if (gstDet.isB2b && isValidB2bGstin(gstDet.gstin)) {
      const partyGstin = fixGstinChecksum(gstDet.gstin);
      rateMap.forEach((det, taxRate) => {
        cdnrRows.push([
          partyGstin,
          (note.partyName || 'B2B Party').trim(),
          note.noteNumber,
          formattedDate,
          noteTypeCode,
          pos,
          'N',
          'Regular',
          Number((note.grandTotal || 0).toFixed(2)),
          '',
          taxRate,
          Number(det.txval.toFixed(2)),
          Number(det.cess.toFixed(2))
        ]);
      });
    } else {
      const isInter =
        (Number(note.igstAmount) || 0) > 0 ||
        resolveIsInterStateSupply({
          companyGstin: company?.gstin,
          companyState: company?.state,
          companyStateCode: company?.stateCode,
          partyGstin: gstDet.gstin || note.partyGstin,
          partyState: gstDet.state,
          partyStateCode: gstDet.stateCode,
        });
      if (isInter && (Number(note.grandTotal) || 0) > 250000) {
        rateMap.forEach((det, taxRate) => {
          cdnurRows.push([
            'B2CL',
            note.noteNumber,
            formattedDate,
            noteTypeCode,
            pos,
            Number((note.grandTotal || 0).toFixed(2)),
            '',
            taxRate,
            Number(det.txval.toFixed(2)),
            Number(det.cess.toFixed(2))
          ]);
        });
      }
    }
  });
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For CDNR(9B)', [], cdnrHeaders, cdnrRows), 'cdnr');

  // 8. Sheet: cdnra
  const cdnraHeaders = [
    'GSTIN/UIN of Recipient', 'Receiver Name', 'Original Note Number', 'Original Note Date',
    'Revised Note Number', 'Revised Note Date', 'Note Type', 'Place Of Supply',
    'Reverse Charge', 'Note Supply Type', 'Note Value', 'Applicable % of Tax Rate',
    'Rate', 'Taxable Value', 'Cess Amount'
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For CDNRA', ['Original details', '', '', '', 'Revised details'], cdnraHeaders, []), 'cdnra');

  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For CDNUR(9B)', [], cdnurHeaders, cdnurRows), 'cdnur');

  // 10. Sheet: cdnura
  const cdnuraHeaders = [
    'UR Type', 'Original Note Number', 'Original Note Date', 'Revised Note Number',
    'Revised Note Date', 'Note Type', 'Place Of Supply', 'Note Value',
    'Applicable % of Tax Rate', 'Rate', 'Taxable Value', 'Cess Amount'
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For CDNURA', ['Original details', '', '', 'Revised details'], cdnuraHeaders, []), 'cdnura');

  // 11. Sheet: exp
  const expHeaders = [
    'Export Type', 'Invoice Number', 'Invoice date', 'Invoice Value', 'Port Code',
    'Shipping Bill Number', 'Shipping Bill Date', 'Rate', 'Taxable Value', 'Cess Amount'
  ];
  const expRows: any[][] = [];
  activeInvoices.forEach(inv => {
    if (inv.invoiceType === 'EXPORT') {
      const formattedDate = formatGstDate(inv.date);
      const rateMap = new Map<number, { txval: number; cess: number }>();
      (inv.items || []).forEach(item => {
        const qty = Number(item.quantity) || 0;
        const rate = Number(item.rate) || 0;
        const disc = Number(item.discountPercent) || 0;
        const taxRate = Number(item.taxRate) || 0;
        const txval = qty * rate * (1 - disc / 100);
        const cess = Number(item.cessAmount) || 0;

        const cur = rateMap.get(taxRate) || { txval: 0, cess: 0 };
        cur.txval += txval;
        cur.cess += cess;
        rateMap.set(taxRate, cur);
      });

      rateMap.forEach((det, taxRate) => {
        expRows.push([
          'WOPAY',
          inv.invoiceNumber,
          formattedDate,
          Number((inv.grandTotal || 0).toFixed(2)),
          'INB995',
          '184298',
          formattedDate,
          taxRate,
          Number(det.txval.toFixed(2)),
          Number(det.cess.toFixed(2))
        ]);
      });
    }
  });
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For EXP(6)', [], expHeaders, expRows), 'exp');

  // 12. Sheet: expa
  const expaHeaders = [
    'Export Type', 'Original Invoice Number', 'Original Invoice date',
    'Revised Invoice Number', 'Revised Invoice date', 'Invoice Value', 'Port Code',
    'Shipping Bill Number', 'Shipping Bill Date', 'Rate', 'Taxable Value', 'Cess Amount'
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For EXPA', ['Original details', '', '', 'Revised details'], expaHeaders, []), 'expa');

  // 13. Sheet: at
  const atHeaders = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For Advance Received (11B)', [], atHeaders, []), 'at');

  // 14. Sheet: ata
  const ataHeaders = ['Financial Year', 'Original Month', 'Original Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Received', 'Cess Amount'];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For Amended Tax Liability(Advance Received)', ['Original details', '', '', 'Revised details'], ataHeaders, []), 'ata');

  // 15. Sheet: atadj
  const atadjHeaders = ['Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For Advance Adjusted (11B)', [], atadjHeaders, []), 'atadj');

  // 16. Sheet: atadja
  const atadjaHeaders = ['Financial Year', 'Original Month', 'Original Place Of Supply', 'Applicable % of Tax Rate', 'Rate', 'Gross Advance Adjusted', 'Cess Amount'];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For Amendement Of Adjustment Advances', ['Original details', '', '', 'Revised details'], atadjaHeaders, []), 'atadja');

  // 17. Sheet: exemp
  const exempBuckets = {
    interReg: { nil: 0, expt: 0 },
    intraReg: { nil: 0, expt: 0 },
    interUnreg: { nil: 0, expt: 0 },
    intraUnreg: { nil: 0, expt: 0 },
  };
  activeInvoices.forEach(inv => {
    if (inv.invoiceType !== 'NIL_RATED' && inv.invoiceType !== 'EXEMPT') return;
    const isB2b = resolveTransactionGstDetails(inv, parties, company?.state).isB2b;
    const taxable = Math.max(0, (inv.subtotal || 0) - (inv.totalDiscount || 0));
    const bucket = inv.isInterState
      ? (isB2b ? exempBuckets.interReg : exempBuckets.interUnreg)
      : (isB2b ? exempBuckets.intraReg : exempBuckets.intraUnreg);
    if (inv.invoiceType === 'NIL_RATED') bucket.nil += taxable;
    else bucket.expt += taxable;
  });
  const exempHeaders = ['Description', 'Nil Rated Supplies', 'Exempted (other than nil rated/non GST supply )', 'Non-GST supplies'];
  const exempRows = [
    ['Inter-State supplies to registered persons', Number(exempBuckets.interReg.nil.toFixed(2)), Number(exempBuckets.interReg.expt.toFixed(2)), 0],
    ['Intra-State supplies to registered persons', Number(exempBuckets.intraReg.nil.toFixed(2)), Number(exempBuckets.intraReg.expt.toFixed(2)), 0],
    ['Inter-State supplies to unregistered persons', Number(exempBuckets.interUnreg.nil.toFixed(2)), Number(exempBuckets.interUnreg.expt.toFixed(2)), 0],
    ['Intra-State supplies to unregistered persons', Number(exempBuckets.intraUnreg.nil.toFixed(2)), Number(exempBuckets.intraUnreg.expt.toFixed(2)), 0]
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For Nil rated, exempted and non GST outward supplies (8)', [], exempHeaders, exempRows), 'exemp');

  // 18. Sheet: hsn(b2b), hsn(b2c), hsn
  const hsnHeaders = [
    'HSN', 'Description', 'UQC', 'Total Quantity', 'Total Value',
    'Rate', 'Taxable Value', 'Integrated Tax Amount', 'Central Tax Amount',
    'State/UT Tax Amount', 'Cess Amount'
  ];
  const hsnMap = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; val: number; txval: number; iamt: number; camt: number; samt: number; csamt: number; rate: number }>();
  const hsnB2bMap = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; val: number; txval: number; iamt: number; camt: number; samt: number; csamt: number; rate: number }>();
  const hsnB2cMap = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; val: number; txval: number; iamt: number; camt: number; samt: number; csamt: number; rate: number }>();

  activeInvoices.forEach(inv => {
    const resolvedGst = resolveTransactionGstDetails(inv, parties, company?.state);
    const partyGstin = resolvedGst.gstin;
    const isB2b = resolvedGst.isB2b;
    const pos = getOfficialPos(partyGstin, inv.placeOfSupply || inv.partyState, company.state);
    const companyPos = getOfficialPos(company.gstin, company.state, company.state);
    const isInter = inv.isInterState || (pos !== companyPos);

    (inv.items || []).forEach(item => {
      const hsn = sanitizeHsnCode(item.hsnSacCode);
      const taxRate = Number(item.taxRate) || 0;
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discountPercent) || 0;
      const txval = qty * rate * (1 - disc / 100);
      const tax = Number(item.taxAmount) || (txval * taxRate / 100);
      const cess = Number(item.cessAmount) || 0;

      const updateMap = (m: Map<string, any>) => {
        const uqc = sanitizeUqc(item.unit);
        const key = `${hsn}_${taxRate}_${uqc}`;
        const existing = m.get(key) || {
          hsn,
          desc: item.itemName ? `${item.itemName.toUpperCase().substring(0, 30)}` : 'OUTWARD SUPPLY',
          uqc,
          qty: 0,
          val: 0,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
          rate: taxRate
        };
        existing.qty += qty;
        existing.txval += txval;
        existing.val += (txval + tax + cess);
        existing.csamt += cess;
        if (isInter) {
          existing.iamt += tax;
        } else {
          existing.camt += tax / 2;
          existing.samt += tax / 2;
        }
        m.set(key, existing);
      };

      updateMap(hsnMap);
      if (isB2b) {
        updateMap(hsnB2bMap);
      } else {
        updateMap(hsnB2cMap);
      }
    });
  });

  const mapToHsnRows = (map: Map<string, any>) => Array.from(map.values()).map(h => [
    h.hsn,
    h.desc,
    h.uqc,
    Number(h.qty.toFixed(2)),
    Number(h.val.toFixed(2)),
    h.rate,
    Number(h.txval.toFixed(2)),
    Number(h.iamt.toFixed(2)),
    Number(h.camt.toFixed(2)),
    Number(h.samt.toFixed(2)),
    Number(h.csamt.toFixed(2))
  ]);

  // Append HSN B2B, HSN B2C and HSN sheets required by GST Offline Utility v3.2.4
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For HSN B2B(12)', [], hsnHeaders, mapToHsnRows(hsnB2bMap)), 'hsn(b2b)');
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For HSN B2C(12)', [], hsnHeaders, mapToHsnRows(hsnB2cMap)), 'hsn(b2c)');
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For HSN(12)', [], hsnHeaders, mapToHsnRows(hsnMap)), 'hsn');

  // 19. Sheet: doc_issue
  const docIssueHeaders = ['Nature of Document', 'Sr. No. From', 'Sr. No. To', 'Total Number', 'Cancelled'];
  const firstInv = activeInvoices[0]?.invoiceNumber || 'INF/25-26/01';
  const lastInv = activeInvoices[activeInvoices.length - 1]?.invoiceNumber || firstInv;
  const docIssueRows = [
    ['Invoices for outward supply', firstInv, lastInv, invoices.length, cancelledCount]
  ];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary of documents issued during the tax period (13)', [], docIssueHeaders, docIssueRows), 'doc_issue');

  // 20. Sheet: ecom
  const ecomHeaders = ['Nature of Supply', 'GSTIN of E-Commerce Operator', 'E-Commerce Operator Name', 'Net value of supplies', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess'];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For ECO(15)', [], ecomHeaders, []), 'ecom');

  // 21. Sheet: ecoma
  const ecomaHeaders = ['Nature of Supply', 'Financial Year', 'Original Month/Quarter', 'Original GSTIN of E-Commerce Operator', 'Revised GSTIN of E-Commerce Operator', 'E-Commerce Operator Name', 'Revised Net value of supplies', 'Integrated tax', 'Central tax', 'State/UT tax', 'Cess'];
  XLSX.utils.book_append_sheet(wb, createSheetWithLayout('Summary For ECOA(15A)', [], ecomaHeaders, []), 'ecoma');

  // Write and download GSTR-1.xlsx file
  XLSX.writeFile(wb, `GSTR-1_${company.gstin || 'GSTIN'}.xlsx`);
}

