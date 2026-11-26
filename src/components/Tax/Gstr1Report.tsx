import React, { useState } from 'react';
import { 
  FileText, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  Globe, 
  Filter, 
  RefreshCw, 
  Sparkles, 
  Calendar, 
  Building2, 
  AlertCircle, 
  ArrowLeft, 
  FileSpreadsheet,
  Layers,
  HelpCircle,
  Eye,
  Check,
  ShieldCheck,
  ArrowUpRight,
  PieChart as PieChartIcon,
  Receipt
} from 'lucide-react';
import { AppData, DebitCreditNote, SalesInvoice } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { exportGSTR1PortalJson, exportGSTR1OfflineExcelCsv } from '../../utils/exportHelpers';
import { resolveIsInterStateSupply, resolveSalesInvoiceWithParty, resolveTransactionGstDetails } from '../../utils/gstAuditEngine';

interface Gstr1ReportProps {
  data: AppData;
  isHindi: boolean;
  onSelectInvoice?: (inv: SalesInvoice) => void;
  onBack?: () => void;
}

export const Gstr1Report: React.FC<Gstr1ReportProps> = ({
  data,
  isHindi,
  onSelectInvoice,
  onBack
}) => {
  const currency = data.company.currency || 'INR';

  // State
  const [returnStatus, setReturnStatus] = useState<'Not Filed' | 'Filed'>('Not Filed');
  const [arnNumber, setArnNumber] = useState<string>('');
  const [arnDate, setArnDate] = useState<string>('');
  const [filingFrequency, setFilingFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ALL'>('ALL');
  const [selectedFy, setSelectedFy] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [selectedRowKey, setSelectedRowKey] = useState<string>('B2B');
  const [showPortalModal, setShowPortalModal] = useState<boolean>(false);
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);
  const [showArnModal, setShowArnModal] = useState<boolean>(false);
  const [tempArn, setTempArn] = useState<string>('');
  const [tempArnDate, setTempArnDate] = useState<string>('');

  // Helper to parse date string into calendar year & 0-indexed month
  const parseInvoiceDate = (dateStr?: string): { year: number; month: number } => {
    if (!dateStr) return { year: new Date().getFullYear(), month: new Date().getMonth() };
    const clean = dateStr.split('T')[0].trim();
    
    // Check YYYY-MM-DD or DD-MM-YYYY or DD/MM/YYYY
    const parts = clean.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD or YYYY/MM/DD
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) return { year: y, month: m };
      } else if (parts[2].length === 4) {
        // DD-MM-YYYY or DD/MM/YYYY
        const y = parseInt(parts[2], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) return { year: y, month: m };
      }
    }

    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return { year: d.getFullYear(), month: d.getMonth() };
    }

    return { year: new Date().getFullYear(), month: new Date().getMonth() };
  };

  // Indian Financial Year helper: April-Dec = year-(year+1), Jan-Mar = (year-1)-year
  const getInvoiceFy = (year: number, month: number): string => {
    const startYear = month >= 3 ? year : year - 1;
    const endYearShort = (startYear + 1).toString().slice(-2);
    return `${startYear}-${endYearShort}`;
  };

  // Dynamically collect available FYs from invoices
  const availableFys = React.useMemo(() => {
    const fySet = new Set<string>();
    data.invoices.forEach(inv => {
      if (inv.status !== 'CANCELLED') {
        const { year, month } = parseInvoiceDate(inv.date);
        fySet.add(getInvoiceFy(year, month));
      }
    });
    // Ensure standard years exist
    fySet.add('2025-26');
    fySet.add('2026-27');
    fySet.add('2024-25');
    return Array.from(fySet).sort().reverse();
  }, [data.invoices]);

  const MONTH_LIST = [
    { idx: 3, en: 'April', hi: 'अप्रैल', q: 'Q1' },
    { idx: 4, en: 'May', hi: 'मई', q: 'Q1' },
    { idx: 5, en: 'June', hi: 'जून', q: 'Q1' },
    { idx: 6, en: 'July', hi: 'जुलाई', q: 'Q2' },
    { idx: 7, en: 'August', hi: 'अगस्त', q: 'Q2' },
    { idx: 8, en: 'September', hi: 'सितंबर', q: 'Q2' },
    { idx: 9, en: 'October', hi: 'अक्टूबर', q: 'Q3' },
    { idx: 10, en: 'November', hi: 'नवंबर', q: 'Q3' },
    { idx: 11, en: 'December', hi: 'दिसंबर', q: 'Q3' },
    { idx: 0, en: 'January', hi: 'जनवरी', q: 'Q4' },
    { idx: 1, en: 'February', hi: 'फरवरी', q: 'Q4' },
    { idx: 2, en: 'March', hi: 'मार्च', q: 'Q4' }
  ];

  // Filter Active Invoices by Status and Selected Return Period
  const activeInvoices = data.invoices.filter(inv => {
    if (inv.status === 'CANCELLED') return false;

    // If both frequency & FY are ALL, show everything
    if (filingFrequency === 'ALL' && selectedFy === 'ALL') return true;

    const { year, month } = parseInvoiceDate(inv.date);
    const invFy = getInvoiceFy(year, month);

    // If specific FY selected, invoice FY must match
    if (selectedFy !== 'ALL' && invFy !== selectedFy) return false;

    if (filingFrequency === 'ALL') return true;

    if (filingFrequency === 'MONTHLY') {
      return month === selectedMonth;
    }

    if (filingFrequency === 'QUARTERLY') {
      if (selectedQuarter === 'Q1') return month === 3 || month === 4 || month === 5;
      if (selectedQuarter === 'Q2') return month === 6 || month === 7 || month === 8;
      if (selectedQuarter === 'Q3') return month === 9 || month === 10 || month === 11;
      if (selectedQuarter === 'Q4') return month === 0 || month === 1 || month === 2;
    }

    return true;
  });

  const getPeriodDisplayLabel = () => {
    if (filingFrequency === 'ALL' && selectedFy === 'ALL') {
      return isHindi ? 'सभी तिथियों के बिल (All Records)' : 'All Records (All Period)';
    }
    if (filingFrequency === 'ALL') {
      return `FY ${selectedFy} (${isHindi ? 'पूरा वर्ष' : 'Full Financial Year'})`;
    }

    const fyLabel = selectedFy === 'ALL' ? '' : ` (${selectedFy})`;

    if (filingFrequency === 'MONTHLY') {
      const mObj = MONTH_LIST.find(m => m.idx === selectedMonth);
      const startYear = selectedFy !== 'ALL' ? parseInt(selectedFy.split('-')[0], 10) : new Date().getFullYear();
      const calYear = selectedMonth >= 3 ? startYear : startYear + 1;
      return `${mObj?.en || 'June'} ${calYear}${fyLabel}`;
    }

    if (filingFrequency === 'QUARTERLY') {
      return `${selectedQuarter} Return${fyLabel}`;
    }

    return `FY ${selectedFy}`;
  };

  const getInvoiceCountForMonth = (mIdx: number) => {
    return data.invoices.filter(i => {
      if (i.status === 'CANCELLED') return false;
      const { year, month } = parseInvoiceDate(i.date);
      if (selectedFy !== 'ALL' && getInvoiceFy(year, month) !== selectedFy) return false;
      return month === mIdx;
    }).length;
  };

  const getInvoiceCountForQuarter = (qKey: 'Q1' | 'Q2' | 'Q3' | 'Q4') => {
    return data.invoices.filter(i => {
      if (i.status === 'CANCELLED') return false;
      const { year, month } = parseInvoiceDate(i.date);
      if (selectedFy !== 'ALL' && getInvoiceFy(year, month) !== selectedFy) return false;
      if (qKey === 'Q1') return month === 3 || month === 4 || month === 5;
      if (qKey === 'Q2') return month === 6 || month === 7 || month === 8;
      if (qKey === 'Q3') return month === 9 || month === 10 || month === 11;
      if (qKey === 'Q4') return month === 0 || month === 1 || month === 2;
      return false;
    }).length;
  };

  // Dynamically resolve live Party Master GSTIN & State first on every invoice
  const resolvedActiveInvoices = React.useMemo(
    () =>
      activeInvoices.map((inv) =>
        resolveSalesInvoiceWithParty(inv, data.parties, data.company?.state)
      ),
    [activeInvoices, data.parties, data.company?.state]
  );

  // Categorize Invoices according to GSTR-1 Return Tables (using live Party Master GSTIN)
  const isInvoiceB2b = (inv: SalesInvoice) =>
    resolveTransactionGstDetails(inv, data.parties, data.company?.state).isB2b;

  const b2bInvoices = resolvedActiveInvoices.filter((i) => isInvoiceB2b(i));
  const b2clInvoices = resolvedActiveInvoices.filter(
    (i) => !isInvoiceB2b(i) && i.isInterState && i.grandTotal > 250000
  );
  const b2csInvoices = resolvedActiveInvoices.filter(
    (i) => !isInvoiceB2b(i) && (!i.isInterState || i.grandTotal <= 250000)
  );
  const exportInvoices = resolvedActiveInvoices.filter((i) => i.invoiceType === 'EXPORT');
  const nilInvoices = resolvedActiveInvoices.filter(
    (i) => i.invoiceType === 'NIL_RATED' || i.invoiceType === 'EXEMPT'
  );

  // Helper to sum taxes for an array of invoices
  const calculateTableTotals = (invList: SalesInvoice[]) => {
    let taxable = 0;
    let igst = 0;
    let cgst = 0;
    let sgst = 0;
    let cess = 0;
    let totalTax = 0;
    let grandTotal = 0;

    invList.forEach(inv => {
      taxable += (inv.subtotal - inv.totalDiscount);
      cgst += inv.cgstAmount;
      sgst += inv.sgstAmount;
      igst += inv.igstAmount;
      cess += inv.cessAmount || 0;
      totalTax += inv.totalTax;
      grandTotal += inv.grandTotal;
    });

    return {
      vchCount: invList.length,
      taxable,
      igst,
      cgst,
      sgst,
      cess,
      totalTax,
      grandTotal
    };
  };

  const b2bTotals = calculateTableTotals(b2bInvoices);
  const b2clTotals = calculateTableTotals(b2clInvoices);
  const b2csTotals = calculateTableTotals(b2csInvoices);
  const exportTotals = calculateTableTotals(exportInvoices);
  const nilTotals = calculateTableTotals(nilInvoices);

  // Filter & classify Credit / Debit Notes (Table 9B: CDNR & CDNUR)
  const matchesSelectedPeriod = (dateStr?: string) => {
    if (filingFrequency === 'ALL' && selectedFy === 'ALL') return true;
    const { year, month } = parseInvoiceDate(dateStr);
    const fy = getInvoiceFy(year, month);
    if (selectedFy !== 'ALL' && fy !== selectedFy) return false;
    if (filingFrequency === 'ALL') return true;
    if (filingFrequency === 'MONTHLY') return month === selectedMonth;
    if (filingFrequency === 'QUARTERLY') {
      if (selectedQuarter === 'Q1') return month === 3 || month === 4 || month === 5;
      if (selectedQuarter === 'Q2') return month === 6 || month === 7 || month === 8;
      if (selectedQuarter === 'Q3') return month === 9 || month === 10 || month === 11;
      if (selectedQuarter === 'Q4') return month === 0 || month === 1 || month === 2;
    }
    return true;
  };

  const activeNotes = (data.debitCreditNotes || []).filter(n => matchesSelectedPeriod(n.date));
  const cdnrNotes = activeNotes.filter(n =>
    resolveTransactionGstDetails({ partyId: n.partyId, partyName: n.partyName, partyGstin: n.partyGstin }, data.parties, data.company?.state).isB2b
  );
  const cdnurNotes = activeNotes.filter(n => {
    const gstDet = resolveTransactionGstDetails({ partyId: n.partyId, partyName: n.partyName, partyGstin: n.partyGstin }, data.parties, data.company?.state);
    if (gstDet.isB2b) return false;
    const isInter =
      (Number(n.igstAmount) || 0) > 0 ||
      resolveIsInterStateSupply({
        companyGstin: data.company?.gstin,
        companyState: data.company?.state,
        companyStateCode: data.company?.stateCode,
        partyGstin: gstDet.gstin || n.partyGstin,
        partyState: gstDet.state,
        partyStateCode: gstDet.stateCode,
      });
    return isInter && (Number(n.grandTotal) || 0) > 250000;
  });

  const calculateNoteTotals = (notes: DebitCreditNote[]) => {
    let taxable = 0;
    let igst = 0;
    let cgst = 0;
    let sgst = 0;
    let cess = 0;
    let totalTax = 0;
    let grandTotal = 0;
    notes.forEach(n => {
      taxable += Math.max(0, (n.subtotal || 0) - (n.totalDiscount || 0));
      cgst += n.cgstAmount || 0;
      sgst += n.sgstAmount || 0;
      igst += n.igstAmount || 0;
      cess += n.cessAmount || 0;
      totalTax += n.totalTax || 0;
      grandTotal += n.grandTotal || 0;
    });
    return { vchCount: notes.length, taxable, igst, cgst, sgst, cess, totalTax, grandTotal };
  };

  const cdnrTotals = calculateNoteTotals(cdnrNotes);
  const cdnurTotals = calculateNoteTotals(cdnurNotes);

  const [hsnFilter, setHsnFilter] = useState<'ALL' | 'B2B' | 'B2C'>('ALL');

  // HSN Summary Maps (All, B2B, B2C)
  const hsnSummaryMap = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number; totalTax: number; totalVal: number; }>();
  const hsnB2bMap = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number; totalTax: number; totalVal: number; }>();
  const hsnB2cMap = new Map<string, { hsn: string; desc: string; uqc: string; qty: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number; totalTax: number; totalVal: number; }>();

  resolvedActiveInvoices.forEach(inv => {
    const isB2b = isInvoiceB2b(inv);
    const targetMap = isB2b ? hsnB2bMap : hsnB2cMap;

    inv.items.forEach(item => {
      const code = item.hsnSacCode || '5909';
      const lineTaxable = item.quantity * item.rate * (1 - (item.discountPercent || 0) / 100);
      const lineTax = item.taxAmount || (lineTaxable * item.taxRate / 100);
      const lineCess = item.cessAmount || 0;
      const lineVal = lineTaxable + lineTax + lineCess;

      // Update Combined
      const existing = hsnSummaryMap.get(code) || {
        hsn: code,
        desc: item.itemName || 'Goods/Services',
        uqc: (item.unit || 'NOS').toUpperCase(),
        qty: 0,
        taxable: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
        totalTax: 0,
        totalVal: 0
      };
      existing.qty += item.quantity;
      existing.taxable += lineTaxable;
      if (inv.isInterState) existing.igst += lineTax;
      else { existing.cgst += lineTax / 2; existing.sgst += lineTax / 2; }
      existing.cess += lineCess;
      existing.totalTax += lineTax;
      existing.totalVal += lineVal;
      hsnSummaryMap.set(code, existing);

      // Update Specific (B2B or B2C)
      const existingSpecific = targetMap.get(code) || {
        hsn: code,
        desc: item.itemName || 'Goods/Services',
        uqc: (item.unit || 'NOS').toUpperCase(),
        qty: 0,
        taxable: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0,
        totalTax: 0,
        totalVal: 0
      };
      existingSpecific.qty += item.quantity;
      existingSpecific.taxable += lineTaxable;
      if (inv.isInterState) existingSpecific.igst += lineTax;
      else { existingSpecific.cgst += lineTax / 2; existingSpecific.sgst += lineTax / 2; }
      existingSpecific.cess += lineCess;
      existingSpecific.totalTax += lineTax;
      existingSpecific.totalVal += lineVal;
      targetMap.set(code, existingSpecific);
    });
  });

  const hsnList = Array.from(hsnSummaryMap.values());
  const hsnB2bList = Array.from(hsnB2bMap.values());
  const hsnB2cList = Array.from(hsnB2cMap.values());
  const hsnTotals = {
    vchCount: hsnList.length,
    taxable: hsnList.reduce((acc, h) => acc + h.taxable, 0),
    igst: hsnList.reduce((acc, h) => acc + h.igst, 0),
    cgst: hsnList.reduce((acc, h) => acc + h.cgst, 0),
    sgst: hsnList.reduce((acc, h) => acc + h.sgst, 0),
    cess: hsnList.reduce((acc, h) => acc + h.cess, 0),
    totalTax: hsnList.reduce((acc, h) => acc + h.totalTax, 0),
    grandTotal: hsnList.reduce((acc, h) => acc + h.totalVal, 0)
  };

  // Document Summary (Table 13)
  const cancelledInvoices = data.invoices.filter(i => i.status === 'CANCELLED');
  const docSummaryTotal = {
    vchCount: 1,
    taxable: b2bTotals.taxable + b2csTotals.taxable + b2clTotals.taxable,
    igst: b2bTotals.igst + b2csTotals.igst + b2clTotals.igst,
    cgst: b2bTotals.cgst + b2csTotals.cgst + b2clTotals.cgst,
    sgst: b2bTotals.sgst + b2csTotals.sgst + b2clTotals.sgst,
    cess: b2bTotals.cess + b2csTotals.cess + b2clTotals.cess,
    totalTax: b2bTotals.totalTax + b2csTotals.totalTax + b2clTotals.totalTax,
    grandTotal: b2bTotals.grandTotal + b2csTotals.grandTotal + b2clTotals.grandTotal
  };

  // Total Return Row
  const totalReturnRow = {
    vchCount: b2bTotals.vchCount + b2clTotals.vchCount + b2csTotals.vchCount + exportTotals.vchCount,
    taxable: b2bTotals.taxable + b2clTotals.taxable + b2csTotals.taxable + exportTotals.taxable,
    igst: b2bTotals.igst + b2clTotals.igst + b2csTotals.igst + exportTotals.igst,
    cgst: b2bTotals.cgst + b2clTotals.cgst + b2csTotals.cgst + exportTotals.cgst,
    sgst: b2bTotals.sgst + b2clTotals.sgst + b2csTotals.sgst + exportTotals.sgst,
    cess: b2bTotals.cess + b2clTotals.cess + b2csTotals.cess + exportTotals.cess,
    totalTax: b2bTotals.totalTax + b2clTotals.totalTax + b2csTotals.totalTax + exportTotals.totalTax,
    grandTotal: b2bTotals.grandTotal + b2clTotals.grandTotal + b2csTotals.grandTotal + exportTotals.grandTotal
  };

  // Return Table Definitions
  const tableRows: Array<{
    key: string;
    title: string;
    totals: ReturnType<typeof calculateTableTotals>;
    invList?: SalesInvoice[];
    noteList?: DebitCreditNote[];
    isHsn?: boolean;
    isDoc?: boolean;
  }> = [
    { key: 'B2B', title: 'B2B Invoices (4A, 4B, 4C, 6B, 6C)', totals: b2bTotals, invList: b2bInvoices },
    { key: 'B2CL', title: 'B2C Large Invoices (5A, 5B)', totals: b2clTotals, invList: b2clInvoices },
    { key: 'EXPORTS', title: 'Exports Invoices (6A)', totals: exportTotals, invList: exportInvoices },
    { key: 'CDNR', title: 'Credit / Debit Notes Registered (9B)', totals: cdnrTotals, noteList: cdnrNotes },
    { key: 'CDNUR', title: 'Credit / Debit Notes Unregistered (9B)', totals: cdnurTotals, noteList: cdnurNotes },
    { key: 'B2CS', title: 'B2C Small Invoices (7)', totals: b2csTotals, invList: b2csInvoices },
    { key: 'NIL', title: 'Nil Rated / Exempt Invoices (8A, 8B, 8C, 8D)', totals: nilTotals, invList: nilInvoices },
    { key: 'HSN', title: 'HSN Summary (12)', totals: hsnTotals, isHsn: true },
    { key: 'DOC', title: 'Document Summary (13)', totals: docSummaryTotal, isDoc: true }
  ];

  // Currently Selected Row Definition
  const currentRowObj = tableRows.find(r => r.key === selectedRowKey) || tableRows[0];

  // Actions
  const handleExportJson = () => {
    exportGSTR1PortalJson(resolvedActiveInvoices, data.company, data.parties, activeNotes);
  };

  const handleExportExcel = () => {
    exportGSTR1OfflineExcelCsv(resolvedActiveInvoices, data.company, data.parties, activeNotes);
  };

  const handleSaveArn = () => {
    setArnNumber(tempArn);
    setArnDate(tempArnDate);
    setShowArnModal(false);
  };

  return (
    <div className="bg-slate-950 min-h-screen text-slate-100 font-sans text-xs flex flex-col selection:bg-amber-400 selection:text-slate-900 space-y-4 p-4 md:p-6">
      
      {/* Top Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          {onBack && (
            <button 
              onClick={onBack}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 flex items-center gap-1.5 font-bold text-xs transition cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{isHindi ? 'पीछे जाएँ' : 'Back'}</span>
            </button>
          )}
          
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-amber-400 text-lg uppercase tracking-wider">HisabVeda ERP</span>
              <span className="bg-emerald-500/20 text-emerald-300 font-extrabold px-2 py-0.5 text-[10px] rounded-full border border-emerald-500/30 uppercase">
                GSTR-1 Module
              </span>
            </div>
            <p className="text-slate-400 text-xs mt-0.5">
              {isHindi ? 'जीएसटी आर-1 बिक्री विवरणी एवं गवर्नमेंट यूटिलिटी रिपोर्ट' : 'Outward Supply Return & Official Govt Utility Format'}
            </p>
          </div>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <a
            href="https://www.gst.gov.in"
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl shadow text-xs flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Globe className="w-4 h-4 text-slate-950" />
            <span>{isHindi ? 'जीएसटी पोर्टल (www.gst.gov.in)' : 'Open GST Portal (www.gst.gov.in)'}</span>
          </a>

          <button 
            onClick={handleExportJson}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow text-xs flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isHindi ? 'GSTR-1 JSON डाउनलोड (GST3.2.4)' : 'Export GSTR-1 JSON (GST3.2.4)'}</span>
          </button>

          <button 
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl shadow text-xs flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-300" />
            <span>Export GSTR-1.xlsx Workbook</span>
          </button>
        </div>
      </div>

      {/* Overview Metadata Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Company GSTIN</span>
          <div className="text-base font-bold text-amber-300 mt-1 font-mono">{data.company.gstin || '23AOZPD9829B1ZP'}</div>
          <span className="text-[10px] text-slate-500">{data.company.name || 'Company Name'}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex justify-between items-center">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Return Period</span>
            <div className="text-sm font-bold text-amber-300 mt-1 font-mono">{getPeriodDisplayLabel()}</div>
          </div>
          <button 
            onClick={() => setShowPeriodModal(true)}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl transition"
            title="Change Period"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex justify-between items-center">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">Filing Status</span>
            <span className={`inline-block mt-1 font-bold px-2 py-0.5 rounded-lg text-xs ${returnStatus === 'Filed' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'}`}>
              {returnStatus}
            </span>
          </div>
          <button 
            onClick={() => setReturnStatus(returnStatus === 'Not Filed' ? 'Filed' : 'Not Filed')}
            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold rounded-xl border border-slate-700 transition"
          >
            Toggle Status
          </button>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-md flex justify-between items-center">
          <div>
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">ARN Details</span>
            <div className="text-xs font-bold text-indigo-300 mt-1 font-mono">{arnNumber || 'Not Updated'}</div>
          </div>
          <button 
            onClick={() => setShowArnModal(true)}
            className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-xl text-[10px] font-bold transition"
          >
            Update ARN
          </button>
        </div>
      </div>

      {/* Main Table Breakdown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <span>GSTR-1 Outward Supplies Summary Tables</span>
            </h2>
            <p className="text-[11px] text-slate-400">Click on any section below to view detailed invoice-level line items</p>
          </div>

          <span className="text-xs font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-xl border border-slate-700 font-bold self-start sm:self-auto">
            Total Invoices: <strong className="text-amber-400">{activeInvoices.length}</strong>
          </span>
        </div>

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-200 font-mono">
            <thead className="bg-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-extrabold">
              <tr>
                <th className="p-3 font-sans">Table / Particulars</th>
                <th className="p-3 text-center">Invoices Count</th>
                <th className="p-3 text-right">Taxable Amount</th>
                <th className="p-3 text-right text-indigo-300">IGST</th>
                <th className="p-3 text-right text-indigo-300">CGST</th>
                <th className="p-3 text-right text-indigo-300">SGST</th>
                <th className="p-3 text-right text-emerald-400">Total Tax</th>
                <th className="p-3 text-right text-amber-300 font-bold">Total Invoice Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tableRows.map((row) => {
                const isSelected = selectedRowKey === row.key;
                const hasData = row.totals.vchCount > 0 || row.totals.taxable > 0;

                return (
                  <tr 
                    key={row.key}
                    onClick={() => setSelectedRowKey(row.key)}
                    className={`cursor-pointer transition ${
                      isSelected 
                        ? 'bg-indigo-950/80 border-l-4 border-amber-400 text-white font-bold' 
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <td className="p-3 font-sans font-semibold flex items-center justify-between">
                      <span>{row.title}</span>
                      {hasData && (
                        <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                          ACTIVE
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center font-bold">
                      {row.totals.vchCount > 0 ? row.totals.vchCount : '-'}
                    </td>

                    <td className="p-3 text-right">
                      {row.totals.taxable > 0 ? formatCurrency(row.totals.taxable, currency) : '-'}
                    </td>

                    <td className="p-3 text-right text-indigo-300">
                      {row.totals.igst > 0 ? formatCurrency(row.totals.igst, currency) : '-'}
                    </td>

                    <td className="p-3 text-right text-indigo-300">
                      {row.totals.cgst > 0 ? formatCurrency(row.totals.cgst, currency) : '-'}
                    </td>

                    <td className="p-3 text-right text-indigo-300">
                      {row.totals.sgst > 0 ? formatCurrency(row.totals.sgst, currency) : '-'}
                    </td>

                    <td className="p-3 text-right text-emerald-400 font-bold">
                      {row.totals.totalTax > 0 ? formatCurrency(row.totals.totalTax, currency) : '-'}
                    </td>

                    <td className="p-3 text-right font-bold text-amber-300">
                      {row.totals.grandTotal > 0 ? formatCurrency(row.totals.grandTotal, currency) : '-'}
                    </td>
                  </tr>
                );
              })}

              {/* Grand Total Row */}
              <tr className="bg-slate-950 text-amber-300 font-black text-xs border-t-2 border-amber-400">
                <td className="p-3 font-sans uppercase">Grand Total</td>
                <td className="p-3 text-center font-mono">{totalReturnRow.vchCount}</td>
                <td className="p-3 text-right font-mono">{formatCurrency(totalReturnRow.taxable, currency)}</td>
                <td className="p-3 text-right font-mono">{formatCurrency(totalReturnRow.igst, currency)}</td>
                <td className="p-3 text-right font-mono">{formatCurrency(totalReturnRow.cgst, currency)}</td>
                <td className="p-3 text-right font-mono">{formatCurrency(totalReturnRow.sgst, currency)}</td>
                <td className="p-3 text-right font-mono text-emerald-400">{formatCurrency(totalReturnRow.totalTax, currency)}</td>
                <td className="p-3 text-right font-mono text-amber-300 text-sm">{formatCurrency(totalReturnRow.grandTotal, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Table Section Drilldown */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="font-extrabold text-white text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Section Drilldown: {currentRowObj.title}</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            Total Items: <strong className="text-white">{currentRowObj.totals.vchCount}</strong> | Value: <strong className="text-emerald-400">{formatCurrency(currentRowObj.totals.grandTotal, currency)}</strong>
          </span>
        </div>

        {currentRowObj.isHsn ? (
          /* HSN Drilldown Table */
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-900 p-2 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-amber-300">
                {isHindi ? 'HSN / SAC रिपोर्ट वर्गीकरण:' : 'HSN Classification:'}
              </span>
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setHsnFilter('ALL')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    hsnFilter === 'ALL'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isHindi ? 'सभी HSN (B2B + B2C)' : 'All HSN (B2B + B2C)'}
                </button>
                <button
                  onClick={() => setHsnFilter('B2B')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    hsnFilter === 'B2B'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isHindi ? 'B2B HSN विवरण' : 'B2B HSN Wise'} ({hsnB2bList.length})
                </button>
                <button
                  onClick={() => setHsnFilter('B2C')}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                    hsnFilter === 'B2C'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {isHindi ? 'B2C HSN विवरण (उपभोक्ता)' : 'B2C HSN Wise (Consumer)'} ({hsnB2cList.length})
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300 font-mono">
                <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="p-2">HSN / SAC</th>
                    <th className="p-2 font-sans">Description</th>
                    <th className="p-2 text-center">UQC</th>
                    <th className="p-2 text-right">Quantity</th>
                    <th className="p-2 text-right">Taxable Value</th>
                    <th className="p-2 text-right text-indigo-300">CGST</th>
                    <th className="p-2 text-right text-indigo-300">SGST</th>
                    <th className="p-2 text-right text-indigo-300">IGST</th>
                    <th className="p-2 text-right text-amber-300 font-bold">Total Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(hsnFilter === 'B2B' ? hsnB2bList : hsnFilter === 'B2C' ? hsnB2cList : hsnList).map((hsnItem) => (
                    <tr key={hsnItem.hsn} className="hover:bg-slate-800/60">
                      <td className="p-2 font-bold text-amber-300">{hsnItem.hsn}</td>
                      <td className="p-2 font-sans text-slate-100">{hsnItem.desc}</td>
                      <td className="p-2 text-center text-slate-400">{hsnItem.uqc}</td>
                      <td className="p-2 text-right font-bold text-white">{hsnItem.qty}</td>
                      <td className="p-2 text-right">{formatCurrency(hsnItem.taxable, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(hsnItem.cgst, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(hsnItem.sgst, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(hsnItem.igst, currency)}</td>
                      <td className="p-2 text-right font-bold text-amber-300">{formatCurrency(hsnItem.totalVal, currency)}</td>
                    </tr>
                  ))}
                  {(hsnFilter === 'B2B' ? hsnB2bList : hsnFilter === 'B2C' ? hsnB2cList : hsnList).length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-slate-500 font-sans italic">
                        {isHindi ? 'चुनी गई श्रेणी (B2B/B2C) के लिए कोई HSN रिकॉर्ड मौजूद नहीं है।' : 'No HSN records found for the selected classification.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : currentRowObj.isDoc ? (
          /* Document Summary Drilldown */
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-xs space-y-3">
            <div className="flex justify-between border-b border-slate-800 pb-2">
              <span className="font-bold text-slate-300">Outward Invoices Range:</span>
              <span className="font-mono text-emerald-400 font-bold">
                {activeInvoices[0]?.invoiceNumber || 'INF/25-26/067'} to {activeInvoices[activeInvoices.length - 1]?.invoiceNumber || 'INF/25-26/081'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center font-mono">
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Total Issued</span>
                <strong className="text-amber-300 text-base">{data.invoices.length}</strong>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Cancelled</span>
                <strong className="text-rose-400 text-base">{cancelledInvoices.length}</strong>
              </div>
              <div className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block">Net Issued</span>
                <strong className="text-emerald-400 text-base">{activeInvoices.length}</strong>
              </div>
            </div>
          </div>
        ) : currentRowObj.noteList ? (
          /* Credit / Debit Notes Drilldown */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 font-mono">
              <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-2">Note #</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Date</th>
                  <th className="p-2 font-sans">Party</th>
                  <th className="p-2">GSTIN</th>
                  <th className="p-2 text-right">Taxable</th>
                  <th className="p-2 text-right text-indigo-300">CGST</th>
                  <th className="p-2 text-right text-indigo-300">SGST</th>
                  <th className="p-2 text-right text-indigo-300">IGST</th>
                  <th className="p-2 text-right text-emerald-400 font-bold">Note Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {currentRowObj.noteList.length > 0 ? (
                  currentRowObj.noteList.map((note) => (
                    <tr key={note.id} className="hover:bg-slate-800/60">
                      <td className="p-2 font-bold text-amber-300">{note.noteNumber}</td>
                      <td className="p-2 text-slate-300 font-sans">{note.type === 'CREDIT_NOTE' ? 'Credit Note' : 'Debit Note'}</td>
                      <td className="p-2 text-slate-400 font-sans">{note.date}</td>
                      <td className="p-2 font-sans font-semibold text-slate-100">{note.partyName}</td>
                      <td className="p-2 text-slate-400">{note.partyGstin || 'URP'}</td>
                      <td className="p-2 text-right">{formatCurrency((note.subtotal || 0) - (note.totalDiscount || 0), currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(note.cgstAmount || 0, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(note.sgstAmount || 0, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(note.igstAmount || 0, currency)}</td>
                      <td className="p-2 text-right font-black text-emerald-400">{formatCurrency(note.grandTotal || 0, currency)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-500 italic font-sans">
                      No Credit / Debit Notes recorded under {currentRowObj.title} for this return period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          /* Invoices List Drilldown */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 font-mono">
              <thead className="bg-slate-800 text-slate-400 text-[10px] uppercase font-bold">
                <tr>
                  <th className="p-2">Invoice #</th>
                  <th className="p-2">Date</th>
                  <th className="p-2 font-sans">Customer / Party</th>
                  <th className="p-2">GSTIN</th>
                  <th className="p-2 text-right">Taxable</th>
                  <th className="p-2 text-right text-indigo-300">CGST</th>
                  <th className="p-2 text-right text-indigo-300">SGST</th>
                  <th className="p-2 text-right text-indigo-300">IGST</th>
                  <th className="p-2 text-right text-emerald-400 font-bold">Grand Total</th>
                  <th className="p-2 text-center font-sans">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {currentRowObj.invList && currentRowObj.invList.length > 0 ? (
                  currentRowObj.invList.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-800/60 cursor-pointer" onClick={() => onSelectInvoice && onSelectInvoice(inv)}>
                      <td className="p-2 font-bold text-amber-300">{inv.invoiceNumber}</td>
                      <td className="p-2 text-slate-400 font-sans">{inv.date}</td>
                      <td className="p-2 font-sans font-semibold text-slate-100">{inv.partyName}</td>
                      <td className="p-2 text-slate-400">{inv.partyGstin || 'URP'}</td>
                      <td className="p-2 text-right">{formatCurrency(inv.subtotal - inv.totalDiscount, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(inv.cgstAmount, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(inv.sgstAmount, currency)}</td>
                      <td className="p-2 text-right text-indigo-300">{formatCurrency(inv.igstAmount, currency)}</td>
                      <td className="p-2 text-right font-black text-emerald-400">{formatCurrency(inv.grandTotal, currency)}</td>
                      <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onSelectInvoice && onSelectInvoice(inv)}
                          className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-bold text-[10px] rounded-lg transition"
                        >
                          View / Print
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="p-4 text-center text-slate-500 italic font-sans">
                      No invoices recorded under {currentRowObj.title} for this return period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Bottom Export Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl">
        <div>
          <h4 className="font-bold text-slate-100 text-xs">
            {isHindi ? 'जीएसटी पोर्टल रिटर्न फाइलिंग डाउनलोड' : 'GST Portal Return Upload Downloads'}
          </h4>
          <p className="text-[11px] text-slate-400">
            {isHindi ? 'आधिकारिक GST3.2.4 स्कीमा JSON या Excel में डाउनलोड करें' : 'Download official GST3.2.4 Schema JSON for direct upload on GST Portal'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleExportJson}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow text-xs flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isHindi ? 'GSTR-1 JSON डाउनलोड (GST3.2.4)' : 'Export GSTR-1 JSON (GST3.2.4)'}</span>
          </button>

          <button 
            onClick={handleExportExcel}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl shadow text-xs flex items-center gap-2 transition active:scale-95 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-300" />
            <span>{isHindi ? 'GSTR-1 Excel / CSV वर्कबुक' : 'Export GSTR-1.xlsx Workbook'}</span>
          </button>
        </div>
      </div>

      {/* MODAL 1: ARN UPDATE MODAL */}
      {showArnModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 text-slate-100 shadow-2xl">
            <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Update ARN Filing Details</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">ARN Number:</label>
                <input
                  type="text"
                  value={tempArn}
                  onChange={(e) => setTempArn(e.target.value)}
                  placeholder="e.g. AA2303260981240"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">ARN Filing Date:</label>
                <input
                  type="date"
                  value={tempArnDate}
                  onChange={(e) => setTempArnDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowArnModal(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 font-bold rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveArn}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
              >
                Save Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: PERIOD SELECTOR MODAL */}
      {showPeriodModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 text-slate-100 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-sm text-amber-300 flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span>{isHindi ? 'रिटर्न अवधि का चयन करें (GSTR-1 Period)' : 'Select GSTR-1 Return Filing Period'}</span>
              </h3>
              <button 
                onClick={() => setShowPeriodModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {/* Financial Year Selector */}
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <span className="text-xs font-bold text-slate-300">
                {isHindi ? 'वित्तीय वर्ष (Financial Year):' : 'Financial Year (FY):'}
              </span>
              <select
                value={selectedFy}
                onChange={(e) => setSelectedFy(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-amber-300 font-mono font-bold text-xs rounded-lg px-3 py-1.5 outline-none cursor-pointer"
              >
                <option value="ALL">{isHindi ? 'सभी वर्ष (All Years)' : 'All Financial Years'}</option>
                {availableFys.map(fy => (
                  <option key={fy} value={fy}>FY {fy}</option>
                ))}
              </select>
            </div>

            {/* Frequency Selection Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => setFilingFrequency('MONTHLY')}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                  filingFrequency === 'MONTHLY'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isHindi ? 'मासिक (Monthly)' : 'Monthly Return'}
              </button>
              <button
                onClick={() => setFilingFrequency('QUARTERLY')}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                  filingFrequency === 'QUARTERLY'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isHindi ? 'तिमाही (Quarterly)' : 'Quarterly (QRMP)'}
              </button>
              <button
                onClick={() => setFilingFrequency('ALL')}
                className={`py-2 px-2 rounded-lg text-xs font-bold transition text-center cursor-pointer ${
                  filingFrequency === 'ALL'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {isHindi ? 'पूरा वर्ष (Full FY)' : 'All Records'}
              </button>
            </div>

            {/* Tab 1: Monthly Return Selection */}
            {filingFrequency === 'MONTHLY' && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400 font-sans">
                  {isHindi ? 'महीने पर क्लिक करके उस महीने का GSTR-1 देखें व एक्सपोर्ट करें:' : 'Select a month to filter invoices & export monthly GSTR-1:'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {MONTH_LIST.map((m) => {
                    const count = getInvoiceCountForMonth(m.idx);
                    const isSelected = selectedMonth === m.idx && filingFrequency === 'MONTHLY';
                    const startYear = selectedFy !== 'ALL' ? (parseInt(selectedFy.split('-')[0], 10) || new Date().getFullYear()) : new Date().getFullYear();
                    const calYear = m.idx >= 3 ? startYear : startYear + 1;

                    return (
                      <button
                        key={m.idx}
                        onClick={() => {
                          setSelectedMonth(m.idx);
                          setFilingFrequency('MONTHLY');
                          setShowPeriodModal(false);
                        }}
                        className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-lg ring-1 ring-amber-400'
                            : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{m.en}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{calYear}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-slate-400">{isHindi ? m.hi : m.q}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold ${
                            count > 0 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                              : 'bg-slate-800 text-slate-500'
                          }`}>
                            {count} Inv
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 2: Quarterly Return Selection */}
            {filingFrequency === 'QUARTERLY' && (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400 font-sans">
                  {isHindi ? 'तिमाही (Quarter) का चयन करें (QRMP Scheme):' : 'Select return filing quarter (QRMP Scheme):'}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'Q1' as const, label: 'Q1 (Apr - Jun)', desc: 'अप्रैल - जून' },
                    { key: 'Q2' as const, label: 'Q2 (Jul - Sep)', desc: 'जुलाई - सितंबर' },
                    { key: 'Q3' as const, label: 'Q3 (Oct - Dec)', desc: 'अक्टूबर - दिसंबर' },
                    { key: 'Q4' as const, label: 'Q4 (Jan - Mar)', desc: 'जनवरी - मार्च' }
                  ].map((q) => {
                    const count = getInvoiceCountForQuarter(q.key);
                    const isSelected = selectedQuarter === q.key && filingFrequency === 'QUARTERLY';

                    return (
                      <button
                        key={q.key}
                        onClick={() => {
                          setSelectedQuarter(q.key);
                          setFilingFrequency('QUARTERLY');
                          setShowPeriodModal(false);
                        }}
                        className={`p-3 rounded-xl border text-left flex flex-col justify-between transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold shadow-lg ring-1 ring-amber-400'
                            : 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs">{q.label}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
                            count > 0 
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                              : 'bg-slate-800 text-slate-500'
                          }`}>
                            {count} Invoices
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1">{q.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 3: Full FY Selection */}
            {filingFrequency === 'ALL' && (
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-center space-y-3">
                <p className="text-xs text-slate-300">
                  {isHindi 
                    ? `वित्तीय वर्ष ${selectedFy} की सभी तिथियों के बिल एक साथ देखें व एक्सपोर्ट करें।` 
                    : `View and export all outward invoices across the entire financial year ${selectedFy}.`}
                </p>
                <button
                  onClick={() => {
                    setFilingFrequency('ALL');
                    setShowPeriodModal(false);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md transition cursor-pointer"
                >
                  {isHindi ? 'सभी बिल देखें (Apply Full FY)' : 'Show All Invoices'}
                </button>
              </div>
            )}

            {/* Modal Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
              <span className="text-[11px] text-slate-400 font-mono">
                {isHindi ? 'चयनित:' : 'Selected:'} <strong className="text-amber-300">{getPeriodDisplayLabel()}</strong>
              </span>
              <button
                onClick={() => setShowPeriodModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl transition cursor-pointer"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
