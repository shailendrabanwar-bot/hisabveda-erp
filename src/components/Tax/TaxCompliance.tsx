import React, { useState, useEffect } from 'react';
import { 
  FileCheck2, 
  Download, 
  Building2, 
  CheckCircle2, 
  ArrowUpRight, 
  ArrowRight,
  PieChart as PieChartIcon,
  Calculator,
  ShieldCheck,
  Search,
  Check,
  AlertCircle,
  FileSpreadsheet,
  Globe,
  Sparkles,
  Receipt,
  Coins,
  FileText,
  Layers,
  Calendar,
  Filter,
  Truck,
  ClipboardCheck,
  BookOpenCheck
} from 'lucide-react';
import { AppData, GstPortalData, SalesInvoice, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import { getFinancialSummary, calculateAccountBalances } from '../../utils/accounting';
import { exportGSTR1PortalJson, exportGSTR1OfflineExcelCsv } from '../../utils/exportHelpers';
import { fetchGSTINDetails } from '../../utils/gstin';
import { resolveCompanyTaxProfile, computeCompositionTurnoverSummary } from '../../utils/companyProfile';
import { Gstr1Report } from './Gstr1Report';
import { StatutoryDueDateAlerts } from './StatutoryDueDateAlerts';
import { Gstr2bReconciliation } from './Gstr2bReconciliation';
import { Gstr9AnnualReturn } from './Gstr9AnnualReturn';
import { GstReturnAuditReport } from './GstReturnAuditReport';
import { TdsAutomation } from './TdsAutomation';
import { EWayBillTab } from './EWayBillTab';

interface TaxComplianceProps {
  data: AppData;
  isHindi: boolean;
  activeFyLabel?: string;
  onSelectInvoice?: (inv: SalesInvoice) => void;
  onPrintInvoice?: (inv: SalesInvoice) => void;
  onEditInvoice?: (inv: SalesInvoice) => void;
  onOpenEWayBillModal?: (invoiceIds?: string[]) => void;
  onUpdateGstPortalData?: (updater: (prev: GstPortalData) => GstPortalData) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

// Indian State Codes mapping for GSTIN validation
const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh'
};

export const TaxCompliance: React.FC<TaxComplianceProps> = ({ 
  data, 
  isHindi, 
  activeFyLabel = '2026-27',
  onSelectInvoice, 
  onPrintInvoice,
  onEditInvoice,
  onOpenEWayBillModal,
  onUpdateGstPortalData,
  activeUserRole = 'ADMIN',
  permissions
}) => {
  const effectiveRole = normalizeUserRole(activeUserRole);
  const perms = permissions || getRolePermissions(effectiveRole);
  const canEditGstPortal = !perms.isReadOnly && (perms.canCreateEditVouchers || perms.canCreateEditTransactions);
  const currency = data.company.currency;
  const taxProfile = resolveCompanyTaxProfile(data.company);
  const summary = getFinancialSummary(data);

  // Active Tab state
  const [activeTab, setActiveTab] = useState<'GSTR3B' | 'GSTR1' | 'GSTR2B' | 'GSTR9' | 'GST_AUDIT' | 'TDS' | 'EWAY_BILL' | 'INSPECTOR'>('GSTR3B');

  // GST Inspector state
  const [testGstin, setTestGstin] = useState(data.company.gstin || '07AAAAA0000A1Z5');

  // Header-selected Financial Year / Period lock: GSTR-3B Change Period locks to Header FY/Period
  const cleanActiveFy = (activeFyLabel || '').trim();
  const isHeaderSingleFy = /^\d{4}-\d{2}$/.test(cleanActiveFy);
  const isHeaderLockedFy = Boolean(cleanActiveFy) && cleanActiveFy !== 'All Years';

  // Return Period Filtering state
  const [filingFrequency, setFilingFrequency] = useState<'MONTHLY' | 'QUARTERLY' | 'ALL'>('ALL');
  const [selectedFy, setSelectedFy] = useState<string>(() => (isHeaderSingleFy ? cleanActiveFy : 'ALL'));
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [showPeriodModal, setShowPeriodModal] = useState<boolean>(false);

  // Always keep TaxCompliance synced with Header's active Financial Year / Period selection
  useEffect(() => {
    setSelectedFy(isHeaderSingleFy ? cleanActiveFy : 'ALL');
  }, [isHeaderSingleFy, cleanActiveFy]);

  // Keyboard shortcuts for Tax tabs (Alt+1..8), Period modal (F2), and Escape
  useEffect(() => {
    const tabOrder: Array<'GSTR3B' | 'GSTR1' | 'GSTR2B' | 'GSTR9' | 'GST_AUDIT' | 'TDS' | 'EWAY_BILL' | 'INSPECTOR'> = [
      'GSTR3B', 'GSTR1', 'GSTR2B', 'GSTR9', 'GST_AUDIT', 'TDS', 'EWAY_BILL', 'INSPECTOR'
    ];
    const handleSubTab = (ev: Event) => {
      const idx = (ev as CustomEvent<{ index: number }>).detail?.index;
      if (typeof idx === 'number' && idx >= 1 && idx <= tabOrder.length) {
        setActiveTab(tabOrder[idx - 1]);
      }
    };
    const handleOpenPeriod = () => {
      setActiveTab('GSTR3B');
      setShowPeriodModal(true);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPeriodModal) {
        setShowPeriodModal(false);
      }
    };
    window.addEventListener('hisabveda:subtab', handleSubTab);
    window.addEventListener('hisabveda:open-period', handleOpenPeriod);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('hisabveda:subtab', handleSubTab);
      window.removeEventListener('hisabveda:open-period', handleOpenPeriod);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [showPeriodModal]);

  // Date Parsing Helper
  const parseDate = (dateStr?: string): { year: number; month: number } => {
    if (!dateStr) return { year: new Date().getFullYear(), month: new Date().getMonth() };
    const clean = dateStr.split('T')[0].trim();
    const parts = clean.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        if (!isNaN(y) && !isNaN(m) && m >= 0 && m <= 11) return { year: y, month: m };
      } else if (parts[2].length === 4) {
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

  // Indian FY Helper
  const getFy = (year: number, month: number): string => {
    const startYear = month >= 3 ? year : year - 1;
    const endYearShort = (startYear + 1).toString().slice(-2);
    return `${startYear}-${endYearShort}`;
  };

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

  // Dynamically collect available FYs
  const availableFys = React.useMemo(() => {
    const fySet = new Set<string>();
    data.invoices.forEach(inv => {
      if (inv.status !== 'CANCELLED') {
        const { year, month } = parseDate(inv.date);
        fySet.add(getFy(year, month));
      }
    });
    data.vouchers.forEach(vch => {
      const { year, month } = parseDate(vch.date);
      fySet.add(getFy(year, month));
    });
    fySet.add('2025-26');
    fySet.add('2026-27');
    fySet.add('2024-25');
    return Array.from(fySet).sort().reverse();
  }, [data.invoices, data.vouchers]);

  const effectiveFy = isHeaderSingleFy ? cleanActiveFy : selectedFy;

  // Filter Active Invoices by Status and Selected Return Period
  const activeInvoices = data.invoices.filter(inv => {
    if (inv.status === 'CANCELLED') return false;
    if (filingFrequency === 'ALL' && effectiveFy === 'ALL') return true;

    const { year, month } = parseDate(inv.date);
    const invFy = getFy(year, month);

    if (effectiveFy !== 'ALL' && invFy !== effectiveFy) return false;
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

  // Filter Active Vouchers by Selected Return Period
  const activeVouchers = data.vouchers.filter(vch => {
    if (filingFrequency === 'ALL' && effectiveFy === 'ALL') return true;

    const { year, month } = parseDate(vch.date);
    const vchFy = getFy(year, month);

    if (effectiveFy !== 'ALL' && vchFy !== effectiveFy) return false;
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

  // Compute Outward GST Totals from Active Sales Invoices
  let totalB2BSales = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let totalOutwardCess = 0;

  for (const inv of activeInvoices) {
    totalB2BSales += (inv.subtotal - inv.totalDiscount);
    totalCGST += inv.cgstAmount;
    totalSGST += inv.sgstAmount;
    totalIGST += inv.igstAmount;
    totalOutwardCess += Number(inv.cessAmount) || 0;
  }

  const compositionSummary = computeCompositionTurnoverSummary(activeInvoices, data.company);
  const totalOutputGST = totalCGST + totalSGST + totalIGST + totalOutwardCess;

  // Account Balances for Inward Supplies & Input Tax Credit (ITC)
  const balancesMap = calculateAccountBalances(data);
  const ledgerItcCgst = balancesMap.get('acc_itc_cgst')?.netBalance ?? 0;
  const ledgerItcSgst = balancesMap.get('acc_itc_sgst')?.netBalance ?? 0;
  const ledgerItcIgst = balancesMap.get('acc_itc_igst')?.netBalance ?? 0;
  const ledgerItcCess = balancesMap.get('acc_itc_cess')?.netBalance ?? 0;

  // Aggregate Inward Supplies / Purchase Vouchers
  let totalInwardTaxableValue = 0;
  let inwardVoucherCount = 0;
  const inwardVouchersList: Array<{ voucherNumber: string; date: string; partyName?: string; narration: string; amount: number; type: string }> = [];

  let periodItcCgst = 0;
  let periodItcSgst = 0;
  let periodItcIgst = 0;
  let periodItcCess = 0;

  for (const vch of activeVouchers) {
    let vchTaxable = 0;
    let isPurchaseOrExpense = false;

    for (const entry of vch.entries) {
      if (entry.debit > 0) {
        if (entry.accountId === 'acc_itc_cgst') periodItcCgst += entry.debit;
        if (entry.accountId === 'acc_itc_sgst') periodItcSgst += entry.debit;
        if (entry.accountId === 'acc_itc_igst') periodItcIgst += entry.debit;
        if (entry.accountId === 'acc_itc_cess') periodItcCess += entry.debit;

        if (['acc_cogs', 'acc_rent', 'acc_electric', 'acc_software', 'acc_creditors', 'acc_itc_cgst', 'acc_itc_sgst', 'acc_itc_igst', 'acc_itc_cess'].includes(entry.accountId)) {
          isPurchaseOrExpense = true;
          if (!['acc_itc_cgst', 'acc_itc_sgst', 'acc_itc_igst', 'acc_itc_cess'].includes(entry.accountId)) {
            vchTaxable += entry.debit;
          }
        }
      }
    }

    if (isPurchaseOrExpense) {
      totalInwardTaxableValue += (vchTaxable || vch.totalAmount);
      inwardVoucherCount++;
      inwardVouchersList.push({
        voucherNumber: vch.voucherNumber,
        date: vch.date,
        partyName: vch.partyName || 'Multiple Accounts',
        narration: vch.narration,
        amount: vch.totalAmount,
        type: vch.type
      });
    }
  }

  // ITC calculation logic with graceful fallback
  const itcCgst = (filingFrequency === 'ALL' && effectiveFy === 'ALL')
    ? ledgerItcCgst
    : (periodItcCgst > 0 ? periodItcCgst : ledgerItcCgst);
  const itcSgst = (filingFrequency === 'ALL' && effectiveFy === 'ALL')
    ? ledgerItcSgst
    : (periodItcSgst > 0 ? periodItcSgst : ledgerItcSgst);
  const itcIgst = (filingFrequency === 'ALL' && effectiveFy === 'ALL')
    ? ledgerItcIgst
    : (periodItcIgst > 0 ? periodItcIgst : ledgerItcIgst);
  const itcCess = (filingFrequency === 'ALL' && effectiveFy === 'ALL')
    ? ledgerItcCess
    : (periodItcCess > 0 ? periodItcCess : ledgerItcCess);

  const totalAvailableITC = itcCgst + itcSgst + itcIgst + itcCess;

  const getPeriodDisplayLabel = () => {
    if (filingFrequency === 'ALL' && effectiveFy === 'ALL') {
      return isHindi ? 'संपूर्ण अवधि (सभी रिकॉर्ड / All Period)' : 'All Records (All Period)';
    }
    if (filingFrequency === 'ALL') {
      return `FY ${effectiveFy} (${isHindi ? 'सक्रिय वित्तीय वर्ष की संपूर्ण अवधि' : 'All Period – Full Active FY'})`;
    }

    const fyLabel = effectiveFy === 'ALL' ? '' : ` (FY ${effectiveFy})`;

    if (filingFrequency === 'MONTHLY') {
      const mObj = MONTH_LIST.find(m => m.idx === selectedMonth);
      const startYear = effectiveFy !== 'ALL' ? (parseInt(effectiveFy.split('-')[0], 10) || new Date().getFullYear()) : new Date().getFullYear();
      const calYear = selectedMonth >= 3 ? startYear : startYear + 1;
      return `${isHindi ? mObj?.hi : mObj?.en} ${calYear}${fyLabel}`;
    }

    if (filingFrequency === 'QUARTERLY') {
      return `${selectedQuarter} Return${fyLabel}`;
    }

    return `FY ${effectiveFy}`;
  };

  const getReturnPeriodCode = () => {
    const fyRef = effectiveFy !== 'ALL' ? effectiveFy : 'ALL';
    if (filingFrequency === 'MONTHLY') {
      const startYear = fyRef !== 'ALL' ? (parseInt(fyRef.split('-')[0], 10) || new Date().getFullYear()) : new Date().getFullYear();
      const calYear = selectedMonth >= 3 ? startYear : startYear + 1;
      return `${String(selectedMonth + 1).padStart(2, '0')}${calYear}`;
    }
    if (filingFrequency === 'QUARTERLY') {
      return `${selectedQuarter}_${fyRef}`;
    }
    return `FY_${fyRef}`;
  };

  const getRecordCountForMonth = (mIdx: number) => {
    const invCount = data.invoices.filter(i => {
      if (i.status === 'CANCELLED') return false;
      const { year, month } = parseDate(i.date);
      if (effectiveFy !== 'ALL' && getFy(year, month) !== effectiveFy) return false;
      return month === mIdx;
    }).length;

    const vchCount = data.vouchers.filter(v => {
      const { year, month } = parseDate(v.date);
      if (effectiveFy !== 'ALL' && getFy(year, month) !== effectiveFy) return false;
      return month === mIdx;
    }).length;

    return invCount + vchCount;
  };

  const getRecordCountForQuarter = (qKey: 'Q1' | 'Q2' | 'Q3' | 'Q4') => {
    const invs = data.invoices.filter(i => {
      if (i.status === 'CANCELLED') return false;
      const { year, month } = parseDate(i.date);
      if (effectiveFy !== 'ALL' && getFy(year, month) !== effectiveFy) return false;
      if (qKey === 'Q1') return month === 3 || month === 4 || month === 5;
      if (qKey === 'Q2') return month === 6 || month === 7 || month === 8;
      if (qKey === 'Q3') return month === 9 || month === 10 || month === 11;
      if (qKey === 'Q4') return month === 0 || month === 1 || month === 2;
      return false;
    }).length;

    const vchs = data.vouchers.filter(v => {
      const { year, month } = parseDate(v.date);
      if (effectiveFy !== 'ALL' && getFy(year, month) !== effectiveFy) return false;
      if (qKey === 'Q1') return month === 3 || month === 4 || month === 5;
      if (qKey === 'Q2') return month === 6 || month === 7 || month === 8;
      if (qKey === 'Q3') return month === 9 || month === 10 || month === 11;
      if (qKey === 'Q4') return month === 0 || month === 1 || month === 2;
      return false;
    }).length;

    return invs + vchs;
  };

  // Statutory GST Set-Off Computation Rules
  const outputIgst = totalIGST;
  const outputCgst = totalCGST;
  const outputSgst = totalSGST;

  // Set-off 1: IGST Output Liability against IGST ITC -> CGST ITC -> SGST ITC
  const igstPaidViaIgstItc = Math.min(outputIgst, itcIgst);
  let remOutputIgst = outputIgst - igstPaidViaIgstItc;
  let remItcIgst = itcIgst - igstPaidViaIgstItc;

  const igstPaidViaCgstItc = Math.min(remOutputIgst, itcCgst);
  remOutputIgst -= igstPaidViaCgstItc;
  let remItcCgst = itcCgst - igstPaidViaCgstItc;

  const igstPaidViaSgstItc = Math.min(remOutputIgst, itcSgst);
  remOutputIgst -= igstPaidViaSgstItc;
  let remItcSgst = itcSgst - igstPaidViaSgstItc;

  // Set-off 2: CGST Output Liability against CGST ITC -> IGST ITC
  const cgstPaidViaCgstItc = Math.min(outputCgst, remItcCgst);
  let remOutputCgst = outputCgst - cgstPaidViaCgstItc;
  remItcCgst -= cgstPaidViaCgstItc;

  const cgstPaidViaIgstItc = Math.min(remOutputCgst, remItcIgst);
  remOutputCgst -= cgstPaidViaIgstItc;
  remItcIgst -= cgstPaidViaIgstItc;

  // Set-off 3: SGST Output Liability against SGST ITC -> IGST ITC
  const sgstPaidViaSgstItc = Math.min(outputSgst, remItcSgst);
  let remOutputSgst = outputSgst - sgstPaidViaSgstItc;
  remItcSgst -= sgstPaidViaSgstItc;

  const sgstPaidViaIgstItc = Math.min(remOutputSgst, remItcIgst);
  remOutputSgst -= sgstPaidViaIgstItc;
  remItcIgst -= sgstPaidViaIgstItc;

  // Cash Payable Breakdown
  const cashPayableIgst = Math.max(0, remOutputIgst);
  const cashPayableCgst = Math.max(0, remOutputCgst);
  const cashPayableSgst = Math.max(0, remOutputSgst);
  const cashPayableCess = Math.max(0, totalOutwardCess - itcCess);
  const totalNetCashPayable = cashPayableIgst + cashPayableCgst + cashPayableSgst + cashPayableCess;

  const totalItcUtilized = (outputIgst - cashPayableIgst) + (outputCgst - cashPayableCgst) + (outputSgst - cashPayableSgst) + Math.min(totalOutwardCess, itcCess);
  const totalItcCarryForward = remItcIgst + remItcCgst + remItcSgst + Math.max(0, itcCess - totalOutwardCess);

  // Validate GSTIN Helper
  const validateGstinDetails = (gstinStr: string) => {
    const clean = (gstinStr || '').trim().toUpperCase();
    const fetched = fetchGSTINDetails(clean);

    if (fetched.success && fetched.details) {
      const d = fetched.details;
      const isInterstate = d.stateCode !== (data.company.stateCode || '07');
      const hasName = !!(d.legalName || d.tradeName);
      const nameStr = hasName ? `${d.legalName || d.tradeName} | ` : '';
      return {
        isValid: true,
        stateCode: d.stateCode,
        stateName: d.stateName,
        pan: d.pan,
        tradeName: d.tradeName,
        legalName: d.legalName,
        address: d.principalAddress,
        constitutionOfBusiness: d.constitutionOfBusiness || 'Company',
        status: d.status,
        isInterstate,
        supplyType: isInterstate ? 'INTER-STATE (IGST Applicable)' : 'INTRA-STATE (CGST + SGST Applicable)',
        message: `Valid GSTIN (${d.gstin}): ${nameStr}State: ${d.stateName} (${d.stateCode}) | PAN: ${d.pan} | Type: ${d.constitutionOfBusiness || 'Company'} | Status: ${d.status}`
      };
    }

    return {
      isValid: false,
      stateCode: '',
      stateName: 'Unknown',
      pan: '',
      tradeName: '',
      legalName: '',
      address: '',
      isInterstate: false,
      supplyType: '',
      message: fetched.error || 'Invalid GSTIN structure.'
    };
  };

  const inspectedGstinInfo = validateGstinDetails(testGstin);

  // HSN Breakdown map
  const hsnMap = new Map<string, { hsn: string; taxable: number; taxRate: number; tax: number; uom: string; qty: number }>();

  for (const inv of data.invoices) {
    if (inv.status === 'CANCELLED') continue;
    for (const item of inv.items) {
      const existing = hsnMap.get(item.hsnSacCode) || {
        hsn: item.hsnSacCode,
        taxable: 0,
        taxRate: item.taxRate,
        tax: 0,
        uom: item.unit || 'Pcs',
        qty: 0
      };
      existing.taxable += (item.quantity * item.rate * (1 - item.discountPercent / 100));
      existing.tax += item.taxAmount;
      existing.qty += item.quantity;
      hsnMap.set(item.hsnSacCode, existing);
    }
  }

  // GSTR-1 Portal JSON Export
  const handleExportGstr1Json = () => {
    exportGSTR1PortalJson(data.invoices, data.company, data.parties);
  };

  const handleExportGstr1Excel = () => {
    exportGSTR1OfflineExcelCsv(data.invoices, data.company, data.parties);
  };


  // GSTR-3B Portal JSON Export
  const handleExportGstr3bJson = () => {
    const periodCode = getReturnPeriodCode();
    const gstr3bPayload = {
      gstin: (data.company.gstin || '23AOZPD9829B1ZP').trim().toUpperCase(),
      ret_period: periodCode,
      version: 'GST3.2.2',
      gt: 0,
      sec_sum: {
        sup_details: {
          osup_det: {
            txval: Number(totalB2BSales.toFixed(2)),
            iamt: Number(totalIGST.toFixed(2)),
            camt: Number(totalCGST.toFixed(2)),
            samt: Number(totalSGST.toFixed(2)),
            csamt: Number(totalOutwardCess.toFixed(2))
          },
          osup_zero: { txval: 0, iamt: 0, csamt: 0 },
          osup_nil_exmp: { txval: 0 },
          isup_rev: { txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 },
          osup_nongst: { txval: 0 }
        },
        itc_elg: {
          itc_avl: [
            {
              ty: 'OTH',
              iamt: Number(itcIgst.toFixed(2)),
              camt: Number(itcCgst.toFixed(2)),
              samt: Number(itcSgst.toFixed(2)),
              csamt: Number(itcCess.toFixed(2))
            }
          ],
          itc_rev: [],
          itc_net: {
            iamt: Number(itcIgst.toFixed(2)),
            camt: Number(itcCgst.toFixed(2)),
            samt: Number(itcSgst.toFixed(2)),
            csamt: Number(itcCess.toFixed(2))
          }
        },
        inward_sup: {
          isup_details: [
            {
              ty: 'GST',
              inter: 0,
              intra: Number(totalInwardTaxableValue.toFixed(2))
            }
          ]
        },
        tax_pay: {
          tax_details: [
            {
              trans_desc: 'Integrated Tax',
              tx: Number(outputIgst.toFixed(2)),
              iamt: Number(igstPaidViaIgstItc.toFixed(2)),
              camt: Number(igstPaidViaCgstItc.toFixed(2)),
              samt: Number(igstPaidViaSgstItc.toFixed(2)),
              csamt: 0,
              pad_cash: Number(cashPayableIgst.toFixed(2))
            },
            {
              trans_desc: 'Central Tax',
              tx: Number(outputCgst.toFixed(2)),
              iamt: Number(cgstPaidViaIgstItc.toFixed(2)),
              camt: Number(cgstPaidViaCgstItc.toFixed(2)),
              samt: 0,
              csamt: 0,
              pad_cash: Number(cashPayableCgst.toFixed(2))
            },
            {
              trans_desc: 'State/UT Tax',
              tx: Number(outputSgst.toFixed(2)),
              iamt: Number(sgstPaidViaIgstItc.toFixed(2)),
              camt: 0,
              samt: Number(sgstPaidViaSgstItc.toFixed(2)),
              csamt: 0,
              pad_cash: Number(cashPayableSgst.toFixed(2))
            }
          ]
        }
      }
    };

    const jsonString = JSON.stringify(gstr3bPayload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR3B_Return_Upload_${gstr3bPayload.gstin}_${periodCode}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // GSTR-3B CSV Export
  const handleExportGstr3bCsv = () => {
    const periodCode = getReturnPeriodCode();
    const periodTitle = getPeriodDisplayLabel();
    const rows = [
      ['GSTR-3B STATUTORY GST RETURN SUMMARY', data.company.name, `GSTIN: ${data.company.gstin}`, `Period: ${periodTitle}`],
      [],
      ['TABLE 3.1: DETAILS OF OUTWARD SUPPLIES & INWARD SUPPLIES LIABLE TO REVERSE CHARGE'],
      ['Nature of Supplies', 'Total Taxable Value (INR)', 'Integrated Tax (IGST)', 'Central Tax (CGST)', 'State/UT Tax (SGST)', 'Cess (INR)'],
      ['3.1(a) Outward taxable supplies (other than zero rated, nil rated, exempted)', totalB2BSales, totalIGST, totalCGST, totalSGST, totalOutwardCess],
      ['3.1(b) Outward taxable supplies (zero rated)', 0, 0, 0, 0, 0],
      ['3.1(c) Other outward supplies (Nil rated, exempted)', 0, 0, 0, 0, 0],
      ['3.1(d) Inward supplies liable to reverse charge', 0, 0, 0, 0, 0],
      ['3.1(e) Non-GST outward supplies', 0, 0, 0, 0, 0],
      ['TOTAL OUTWARD TAX LIABILITY', totalB2BSales, totalIGST, totalCGST, totalSGST, totalOutwardCess],
      [],
      ['TABLE 4: ELIGIBLE INPUT TAX CREDIT (ITC) FROM INWARD SUPPLIES & VOUCHERS'],
      ['Details', 'Integrated Tax (IGST)', 'Central Tax (CGST)', 'State/UT Tax (SGST)', 'Cess (INR)'],
      ['4(A)(5) All Other ITC (From Purchases/Vouchers)', itcIgst, itcCgst, itcSgst, itcCess],
      ['4(B) ITC Reversed', 0, 0, 0, 0],
      ['4(C) NET ITC AVAILABLE', itcIgst, itcCgst, itcSgst, itcCess],
      [],
      ['TABLE 6: PAYMENT OF TAX & NET TAX LIABILITY SETTLEMENT'],
      ['Description', 'Total Tax Payable', 'Paid via IGST ITC', 'Paid via CGST ITC', 'Paid via SGST ITC', 'Net Cash Payable (INR)'],
      ['Integrated Tax (IGST)', outputIgst, igstPaidViaIgstItc, igstPaidViaCgstItc, igstPaidViaSgstItc, cashPayableIgst],
      ['Central Tax (CGST)', outputCgst, cgstPaidViaIgstItc, cgstPaidViaCgstItc, 0, cashPayableCgst],
      ['State/UT Tax (SGST)', outputSgst, sgstPaidViaIgstItc, 0, sgstPaidViaSgstItc, cashPayableSgst],
      ['TOTAL NET TAX PAYABLE', totalOutputGST, totalItcUtilized, '', '', totalNetCashPayable]
    ];

    const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `GSTR3B_Filing_Summary_${data.company.name.replace(/\s+/g, '_')}_${periodCode}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hv-surface p-5 rounded-2xl border border-[var(--border-primary)] shadow-lg">
        <div>
          <h2 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-emerald-500" />
            <span>{isHindi ? 'जीएसटी एवं टीडीएस वैधानिक कर अनुपालन केंद्र' : 'GST & TDS Statutory Tax Compliance Center'}</span>
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {isHindi 
              ? 'मासिक GSTR-3B शुद्ध कर देयता, GSTR-1 विवरणी, और टीडीएस रिटर्न (Form 26Q/24Q/27Q)'
              : 'Monthly GSTR-3B Net Tax Settlement, GSTR-1 Outward Supplies, and TDS Returns (Form 26Q/24Q/27Q)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href="https://www.gst.gov.in"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs px-3.5 py-2.5 rounded-xl shadow transition active:scale-95 cursor-pointer"
          >
            <Globe className="w-4 h-4 text-slate-950" />
            <span>{isHindi ? '🌐 जीएसटी पोर्टल (www.gst.gov.in)' : '🌐 Open GST Portal'}</span>
          </a>

          {perms.canExportData && (
            <>
              <button
                onClick={handleExportGstr3bJson}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white hv-keep-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg transition transform active:scale-95"
              >
                <Download className="w-4 h-4" />
                <span>{isHindi ? 'GSTR-3B JSON डाउनलोड' : 'Export GSTR-3B Portal JSON'}</span>
              </button>

              <button
                onClick={handleExportGstr1Json}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-extrabold text-xs px-3.5 py-2.5 rounded-xl shadow transition active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>{isHindi ? 'GSTR-1 JSON' : 'Export GSTR-1 JSON'}</span>
              </button>

              <button
                onClick={handleExportGstr1Excel}
                className="flex items-center gap-2 hv-elevated hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold text-xs px-3.5 py-2.5 rounded-xl shadow transition active:scale-95 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                <span>{isHindi ? 'GSTR-1 Excel' : 'Export GSTR-1 Excel'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Statutory Return Due Date Alerts Banner */}
      {taxProfile.gstEnabled && <StatutoryDueDateAlerts isHindi={isHindi} activeFy={activeFyLabel} />}

      {/* Non-GST / Composition Dealer Mode Summary */}
      {taxProfile.isNonGst && (
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-extrabold uppercase tracking-wider text-amber-500">
              {isHindi ? 'गैर-जीएसटी / अंतर्राष्ट्रीय व्यवसाय मोड सक्रिय है' : 'Non-GST / International Business Mode Active'}
            </div>
            <p className="text-xs text-[var(--text-secondary)]">
              {isHindi
                ? `${data.company.name} के लिए GST अक्षम है (${taxProfile.country} • ${currency})। सभी बिक्री बिल ऑफ सप्लाई (0% GST) के रूप में जारी हो रहे हैं।`
                : `GST collection is disabled for ${data.company.name} (${taxProfile.country} • ${currency}). Invoices print as Bill of Supply / Retail Invoice without mandatory GST fields.`}
            </p>
          </div>
          <span className="text-xs font-mono font-bold hv-pill-slate border px-3 py-1.5 rounded-xl shrink-0">
            Non-GST Mode
          </span>
        </div>
      )}

      {taxProfile.isComposition && (
        <div className="hv-surface border border-amber-500/40 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
            <div>
              <h3 className="text-sm font-black text-amber-500 uppercase tracking-wider">
                {isHindi ? 'कंपोज़िशन डीलर टर्नओवर एवं कर गणना (Form CMP-08)' : 'Composition Scheme Turnover Tax Summary (Form CMP-08)'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                {isHindi
                  ? 'ग्राहक से 0% GST वसूला जाता है; नीचे कुल बिक्री टर्नओवर पर देय कंपोज़िशन कर दर्शाया गया है (ITC अनुमन्य नहीं)।'
                  : '0% GST collected from buyers on Bills of Supply. Quarterly composition tax is calculated flat on net taxable turnover (ITC ineligible).'}
              </p>
            </div>
            <span className="text-xs font-mono font-bold hv-pill-amber border px-2.5 py-1 rounded-lg shrink-0">
              Rate: {compositionSummary.compositionTaxRate}% Flat
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3">
              <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase block">
                {isHindi ? 'कुल बिल संख्या / अवधि' : 'Bills of Supply (Period)'}
              </span>
              <span className="text-xl font-black text-[var(--text-primary)] font-mono tabular-nums">
                {compositionSummary.invoiceCount}
              </span>
            </div>
            <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3">
              <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase block">
                {isHindi ? 'कुल कर-योग्य टर्नओवर' : 'Aggregate Taxable Turnover'}
              </span>
              <span className="text-xl font-black text-emerald-500 font-mono tabular-nums">
                {formatCurrency(compositionSummary.taxableTurnover, currency)}
              </span>
            </div>
            <div className="hv-elevated border border-amber-500/40 rounded-xl p-3">
              <span className="text-[11px] font-bold text-amber-500 uppercase block">
                {isHindi ? `देय कंपोज़िशन कर (${compositionSummary.compositionTaxRate}%)` : `Composition Tax Payable (${compositionSummary.compositionTaxRate}%)`}
              </span>
              <span className="text-xl font-black text-amber-500 font-mono tabular-nums">
                {formatCurrency(compositionSummary.compositionTaxPayable, currency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Total Statutory Tax Payable Summary Card (Matching Dashboard Figure) */}
      <div className="hv-surface border border-amber-500/35 rounded-2xl p-4 md:p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider hv-pill-amber px-2.5 py-1 rounded-lg border">
              {isHindi ? 'डैशबोर्ड कुल देय कर मिलान (Total Tax Payable Summary)' : 'Total Pending Statutory Tax Liability'}
            </span>
          </div>
          <div className="text-2xl font-black text-amber-500 font-mono pt-1">
            {formatCurrency(taxProfile.isComposition ? compositionSummary.compositionTaxPayable : summary.totalTaxPayable, currency)}
          </div>
          <p className="text-xs text-[var(--text-secondary)]">
            {isHindi 
              ? 'यह राशि आपके डैशबोर्ड के कुल देय कर से 100% सटीक मेल खाती है।'
              : 'Consolidated pending tax liabilities across GST, Composition, TDS, and statutory duties.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3 text-center min-w-[140px]">
            <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">
              {taxProfile.isComposition ? (isHindi ? 'कंपोज़िशन कर देय' : 'Composition Tax') : (isHindi ? 'जीएसटी नकद देय' : 'Net GST Cash Payable')}
            </span>
            <span className="text-sm font-black text-amber-500 font-mono">
              {formatCurrency(taxProfile.isComposition ? compositionSummary.compositionTaxPayable : totalNetCashPayable, currency)}
            </span>
          </div>

          {taxProfile.tdsTcsEnabled && (
            <>
              <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3 text-center min-w-[140px]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase font-bold block">{isHindi ? 'टीडीएस देयता (TDS)' : 'TDS Liability'}</span>
                <span className="text-sm font-black text-indigo-500 font-mono">
                  {formatCurrency(Math.max(0, summary.totalTaxPayable - totalNetCashPayable), currency)}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('TDS')}
                className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 cursor-pointer"
              >
                <span>{isHindi ? 'टीडीएस विवरण देखें' : 'Manage TDS Returns'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 hv-surface p-1.5 rounded-2xl border border-[var(--border-primary)]">
        <button
          type="button"
          title="Alt + 1"
          onClick={() => setActiveTab('GSTR3B')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'GSTR3B'
              ? 'bg-gradient-to-r from-amber-600 to-indigo-600 text-white hv-keep-white shadow-md'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Calculator className={`w-4 h-4 ${activeTab === 'GSTR3B' ? 'text-white' : 'text-amber-500'}`} />
          <span>{isHindi ? 'GSTR-3B मासिक देयता' : 'GSTR-3B Monthly Return'}</span>
          <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+1</span>
        </button>

        <button
          type="button"
          title="Alt + 2"
          onClick={() => setActiveTab('GSTR1')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'GSTR1'
              ? 'bg-indigo-600 text-white hv-keep-white shadow-md'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>{isHindi ? 'GSTR-1 बाहरी आपूर्ति' : 'GSTR-1 Outward Supplies'}</span>
          <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+2</span>
        </button>

        <button
          type="button"
          title="Alt + 3"
          onClick={() => setActiveTab('GSTR2B')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'GSTR2B'
              ? 'bg-emerald-600 text-white hv-keep-white shadow-md'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <Sparkles className={`w-4 h-4 ${activeTab === 'GSTR2B' ? 'text-white' : 'text-emerald-500'}`} />
          <span>{isHindi ? 'GSTR-2A एवं 2B मिलान' : 'GSTR-2A & 2B Matcher'}</span>
          <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+3</span>
        </button>

        <button
          type="button"
          title="Alt + 4"
          onClick={() => setActiveTab('GSTR9')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'GSTR9'
              ? 'bg-indigo-600 text-white hv-keep-white shadow-md'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <BookOpenCheck className={`w-4 h-4 ${activeTab === 'GSTR9' ? 'text-white' : 'text-indigo-500'}`} />
          <span>{isHindi ? 'GSTR-9 वार्षिक रिटर्न' : 'GSTR-9 Annual Return'}</span>
          <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+4</span>
        </button>

        <button
          type="button"
          title="Alt + 5"
          onClick={() => setActiveTab('GST_AUDIT')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'GST_AUDIT'
              ? 'bg-amber-500 text-slate-950 font-black shadow-md'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>{isHindi ? 'GST ऑडिट (रिटर्न vs सॉफ्टवेयर)' : 'GST Audit (Return vs Books)'}</span>
          <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+5</span>
        </button>

        {taxProfile.tdsTcsEnabled && (
          <button
            type="button"
            title="Alt + 6"
            onClick={() => setActiveTab('TDS')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'TDS'
                ? 'bg-indigo-600 text-white hv-keep-white shadow-md'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <FileCheck2 className={`w-4 h-4 ${activeTab === 'TDS' ? 'text-white' : 'text-indigo-500'}`} />
            <span>{isHindi ? 'टीडीएस फाइलिंग (26Q)' : 'TDS Return (26Q)'}</span>
            <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+6</span>
          </button>
        )}

        {taxProfile.gstEnabled && taxProfile.ewayBillEnabled && (
          <button
            type="button"
            title="Alt + 7"
            onClick={() => setActiveTab('EWAY_BILL')}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'EWAY_BILL'
                ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-slate-950 font-black shadow-md'
                : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Truck className={`w-4 h-4 ${activeTab === 'EWAY_BILL' ? 'text-slate-950' : 'text-amber-500'}`} />
            <span>{isHindi ? 'ई-वे बिल JSON' : 'e-Way Bill JSON'}</span>
            <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+7</span>
          </button>
        )}

        <button
          type="button"
          title="Alt + 8"
          onClick={() => setActiveTab('INSPECTOR')}
          className={`px-4 py-2.5 text-xs font-bold rounded-xl transition flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'INSPECTOR'
              ? 'hv-pill-amber border shadow-md'
              : 'text-[var(--text-secondary)] hover:bg-[var(--hover-surface)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{isHindi ? 'जीएसटी नंबर जांच' : 'GSTIN Inspector'}</span>
          <span className="text-[10px] font-mono opacity-75 hidden xl:inline">Alt+8</span>
        </button>
      </div>

      {/* TAB: GSTR-9 ANNUAL RETURN FILING */}
      {activeTab === 'GSTR9' && (
        <div className="animate-fadeIn">
          <Gstr9AnnualReturn
            data={data}
            isHindi={isHindi}
            onUpdateGstPortalData={canEditGstPortal ? onUpdateGstPortalData : undefined}
          />
        </div>
      )}

      {/* TAB: GST RETURN VS SOFTWARE AUDIT REPORT */}
      {activeTab === 'GST_AUDIT' && (
        <div className="animate-fadeIn">
          <GstReturnAuditReport
            data={data}
            isHindi={isHindi}
            onUpdateGstPortalData={canEditGstPortal ? onUpdateGstPortalData : undefined}
          />
        </div>
      )}

      {/* TAB 1: GSTR-3B MONTHLY FILING & NET TAX LIABILITY GENERATOR */}
      {activeTab === 'GSTR3B' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Return Filing Period Selector Banner */}
          <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 hv-pill-amber rounded-xl border">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                  {isHindi ? 'रिटर्न दाखिल करने की अवधि (GSTR-3B Filing Period)' : 'GSTR-3B Statutory Return Filing Period'}
                </span>
                <div className="text-sm font-bold text-amber-500 font-mono mt-0.5">
                  {getPeriodDisplayLabel()}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setShowPeriodModal(true)}
                className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs rounded-xl shadow transition active:scale-95 cursor-pointer flex items-center gap-1.5"
                title={isHindi ? 'रिटर्न अवधि बदलें (शॉर्टकट: F2)' : 'Change Filing Period (Shortcut: F2)'}
              >
                <Filter className="w-3.5 h-3.5" />
                <span>{isHindi ? 'रिटर्न अवधि बदलें (F2)' : 'Change Filing Period (F2)'}</span>
              </button>
            </div>
          </div>

          {/* Key Tax Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 shadow-md space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                {isHindi ? 'कुल आउटवर्ड टैक्स देयता (Total Output GST)' : 'Total Output GST Liability'}
              </span>
              <div className="text-xl font-black text-rose-500 font-mono">
                {formatCurrency(totalOutputGST, currency)}
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">From Active Sales Invoices (Table 3.1)</p>
            </div>

            <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 shadow-md space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                {isHindi ? 'उपलब्ध इनपुट टैक्स क्रेडिट (Available ITC)' : 'Total Available Input Tax Credit'}
              </span>
              <div className="text-xl font-black text-emerald-500 font-mono">
                {formatCurrency(totalAvailableITC, currency)}
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">From Inward Vouchers & ITC Ledger (Table 4)</p>
            </div>

            <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 shadow-md space-y-1">
              <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider block">
                {isHindi ? 'ITC द्वारा समायोजित टैक्स (ITC Set-Off)' : 'ITC Set-Off Utilized'}
              </span>
              <div className="text-xl font-black text-indigo-500 font-mono">
                {formatCurrency(totalItcUtilized, currency)}
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">Adjusted via Statutory Set-Off Rules</p>
            </div>

            <div className="hv-surface border border-amber-500/40 rounded-2xl p-4 shadow-md space-y-1">
              <span className="text-[11px] font-extrabold text-amber-500 uppercase tracking-wider block flex items-center justify-between">
                <span>{isHindi ? 'नकद भुगतान योग्य टैक्स' : 'Net Cash Payable'}</span>
                <Coins className="w-4 h-4 text-amber-500" />
              </span>
              <div className="text-2xl font-black text-amber-500 font-mono">
                {formatCurrency(totalNetCashPayable, currency)}
              </div>
              <p className="text-[10px] text-amber-500 font-medium">Final Tax to pay via Electronic Cash Ledger</p>
            </div>
          </div>

          {/* TABLE 3.1: DETAILS OF OUTWARD SUPPLIES */}
          <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-indigo-500" />
                  <span>3.1 Details of Outward Supplies and Inward Supplies liable to reverse charge</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi
                    ? `अवधि: ${getPeriodDisplayLabel()} के सक्रिय बिक्री इनवॉइस से संकलित`
                    : `Aggregated from active sales invoices in the system for ${getPeriodDisplayLabel()}`}
                </p>
              </div>

              <span className="text-[10px] font-mono hv-pill-indigo px-2.5 py-1 rounded-lg border font-bold self-start sm:self-auto">
                Table 3.1 Compliant
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="hv-elevated text-[var(--text-muted)] text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-3">Nature of Supplies</th>
                    <th className="p-3 text-right">Total Taxable Value</th>
                    <th className="p-3 text-right text-indigo-500">Integrated Tax (IGST)</th>
                    <th className="p-3 text-right text-indigo-500">Central Tax (CGST)</th>
                    <th className="p-3 text-right text-indigo-500">State/UT Tax (SGST)</th>
                    <th className="p-3 text-right">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  <tr>
                    <td className="p-3 font-sans font-medium text-[var(--text-primary)]">
                      (a) Outward taxable supplies (other than zero rated, nil rated and exempted)
                    </td>
                    <td className="p-3 text-right font-bold text-[var(--text-primary)]">{formatCurrency(totalB2BSales, currency)}</td>
                    <td className="p-3 text-right text-indigo-500">{formatCurrency(totalIGST, currency)}</td>
                    <td className="p-3 text-right text-indigo-500">{formatCurrency(totalCGST, currency)}</td>
                    <td className="p-3 text-right text-indigo-500">{formatCurrency(totalSGST, currency)}</td>
                    <td className="p-3 text-right text-amber-500">{formatCurrency(totalOutwardCess, currency)}</td>
                  </tr>

                  <tr className="text-[var(--text-muted)]">
                    <td className="p-3 font-sans">(b) Outward taxable supplies (zero rated)</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                  </tr>

                  <tr className="text-[var(--text-muted)]">
                    <td className="p-3 font-sans">(c) Other outward supplies (Nil rated, exempted)</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                  </tr>

                  <tr className="text-[var(--text-muted)]">
                    <td className="p-3 font-sans">(d) Inward supplies liable to reverse charge</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                  </tr>

                  <tr className="hv-elevated font-bold text-amber-500 text-xs">
                    <td className="p-3 uppercase font-sans">Total Outward Tax Liabilities (Table 3.1)</td>
                    <td className="p-3 text-right">{formatCurrency(totalB2BSales, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(totalIGST, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(totalCGST, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(totalSGST, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(totalOutwardCess, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLE 4: ELIGIBLE INPUT TAX CREDIT (ITC) */}
          <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-500" />
                  <span>4. Eligible Input Tax Credit (ITC) from Purchases & Vouchers</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">Aggregated from inward vouchers, purchase bills, and ITC accounts in Chart of Accounts</p>
              </div>

              <span className="text-[10px] font-mono hv-pill-emerald px-2.5 py-1 rounded-lg border font-bold self-start sm:self-auto">
                Table 4 Compliant
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="hv-elevated text-[var(--text-muted)] text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-3">Details</th>
                    <th className="p-3 text-right text-emerald-500">Integrated Tax (IGST)</th>
                    <th className="p-3 text-right text-emerald-500">Central Tax (CGST)</th>
                    <th className="p-3 text-right text-emerald-500">State/UT Tax (SGST)</th>
                    <th className="p-3 text-right">Cess</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  <tr className="font-bold text-[var(--text-primary)]">
                    <td className="p-3 font-sans">(A) ITC Available (whether in full or part)</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(itcIgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(itcCgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(itcSgst, currency)}</td>
                    <td className="p-3 text-right text-amber-500">{formatCurrency(itcCess, currency)}</td>
                  </tr>

                  <tr className="text-[var(--text-muted)] text-[11px]">
                    <td className="p-3 pl-6 font-sans">└ (1) Import of Goods</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                  </tr>

                  <tr className="text-[var(--text-muted)] text-[11px]">
                    <td className="p-3 pl-6 font-sans">└ (2) Import of Services</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">-</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                  </tr>

                  <tr className="text-[var(--text-secondary)] font-semibold">
                    <td className="p-3 pl-6 font-sans">└ (5) All Other ITC (From Purchase Vouchers & Expenses)</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(itcIgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(itcCgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(itcSgst, currency)}</td>
                    <td className="p-3 text-right text-amber-500">{formatCurrency(itcCess, currency)}</td>
                  </tr>

                  <tr className="text-[var(--text-muted)]">
                    <td className="p-3 font-sans">(B) ITC Reversed</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(0, currency)}</td>
                  </tr>

                  <tr className="hv-pill-emerald border-t-2 font-bold">
                    <td className="p-3 uppercase font-sans">(C) NET ITC AVAILABLE (A - B)</td>
                    <td className="p-3 text-right">{formatCurrency(itcIgst, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(itcCgst, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(itcSgst, currency)}</td>
                    <td className="p-3 text-right">{formatCurrency(itcCess, currency)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLE 6: PAYMENT OF TAX & SET-OFF SETTLEMENT MATRIX */}
          <div className="hv-surface border border-amber-500/35 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-amber-500 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-amber-500" />
                  <span>6. Payment of Tax & Statutory GST Set-Off Settlement Engine</span>
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">Automatic set-off rules applied: IGST set off first against IGST/CGST/SGST ITC; CGST/SGST against CGST/SGST/IGST ITC</p>
              </div>

              {perms.canExportData && (
                <button
                  onClick={handleExportGstr3bCsv}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-3.5 py-1.5 rounded-xl shadow transition flex items-center gap-1.5 self-start sm:self-auto"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export GSTR-3B CSV Audit</span>
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                <thead className="hv-elevated text-[var(--text-muted)] text-[11px] uppercase tracking-wider font-bold">
                  <tr>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right text-rose-500">Total Tax Payable</th>
                    <th className="p-3 text-right text-emerald-500">Paid via IGST ITC</th>
                    <th className="p-3 text-right text-emerald-500">Paid via CGST ITC</th>
                    <th className="p-3 text-right text-emerald-500">Paid via SGST ITC</th>
                    <th className="p-3 text-right text-amber-500 font-extrabold">Net Cash Payable (INR)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-primary)] font-mono">
                  <tr>
                    <td className="p-3 font-sans font-bold text-[var(--text-primary)]">Integrated Tax (IGST)</td>
                    <td className="p-3 text-right font-bold text-rose-500">{formatCurrency(outputIgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(igstPaidViaIgstItc, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(igstPaidViaCgstItc, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(igstPaidViaSgstItc, currency)}</td>
                    <td className="p-3 text-right font-black text-amber-500 text-sm hv-elevated">
                      {formatCurrency(cashPayableIgst, currency)}
                    </td>
                  </tr>

                  <tr>
                    <td className="p-3 font-sans font-bold text-[var(--text-primary)]">Central Tax (CGST)</td>
                    <td className="p-3 text-right font-bold text-rose-500">{formatCurrency(outputCgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(cgstPaidViaIgstItc, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(cgstPaidViaCgstItc, currency)}</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">-</td>
                    <td className="p-3 text-right font-black text-amber-500 text-sm hv-elevated">
                      {formatCurrency(cashPayableCgst, currency)}
                    </td>
                  </tr>

                  <tr>
                    <td className="p-3 font-sans font-bold text-[var(--text-primary)]">State/UT Tax (SGST)</td>
                    <td className="p-3 text-right font-bold text-rose-500">{formatCurrency(outputSgst, currency)}</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(sgstPaidViaIgstItc, currency)}</td>
                    <td className="p-3 text-right text-[var(--text-muted)]">-</td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(sgstPaidViaSgstItc, currency)}</td>
                    <td className="p-3 text-right font-black text-amber-500 text-sm hv-elevated">
                      {formatCurrency(cashPayableSgst, currency)}
                    </td>
                  </tr>

                  <tr className="hv-elevated border-t-2 border-amber-500/40 font-black text-xs">
                    <td className="p-3 font-sans uppercase text-amber-500">TOTAL NET GST LIABILITY SETTLEMENT</td>
                    <td className="p-3 text-right text-rose-500">{formatCurrency(totalOutputGST, currency)}</td>
                    <td className="p-3 text-right text-emerald-500" colSpan={3}>
                      Total ITC Set-Off: {formatCurrency(totalItcUtilized, currency)}
                    </td>
                    <td className="p-3 text-right hv-pill-amber text-base">
                      {formatCurrency(totalNetCashPayable, currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Carry Forward ITC Callout */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-3.5 hv-elevated rounded-xl border border-[var(--border-subtle)] text-xs gap-2">
              <span className="text-[var(--text-muted)] flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Remaining ITC carried forward to next filing period:</span>
              </span>
              <div className="flex items-center gap-4 font-mono font-bold text-emerald-500">
                <span>IGST: {formatCurrency(remItcIgst, currency)}</span>
                <span>CGST: {formatCurrency(remItcCgst, currency)}</span>
                <span>SGST: {formatCurrency(remItcSgst, currency)}</span>
              </div>
            </div>
          </div>

          {/* INWARD SUPPLIES VOUCHERS BREAKDOWN CARD */}
          <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 shadow-xl space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <span>Inward Purchases & Expense Vouchers Contributing to ITC ({inwardVoucherCount})</span>
              </h3>
              <span className="text-xs text-[var(--text-muted)]">Total Inward Taxable Base: <strong className="font-mono text-[var(--text-primary)]">{formatCurrency(totalInwardTaxableValue, currency)}</strong></span>
            </div>

            <div className="space-y-2 text-xs">
              {inwardVouchersList.map((vch) => (
                <div key={vch.voucherNumber} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 hv-elevated rounded-xl border border-[var(--border-subtle)] gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold hv-pill-indigo px-2 py-0.5 rounded border">
                      {vch.voucherNumber}
                    </span>
                    <div>
                      <span className="font-bold text-[var(--text-primary)] block">{vch.partyName}</span>
                      <span className="text-[11px] text-[var(--text-muted)]">{vch.narration} • {vch.date}</span>
                    </div>
                  </div>
                  <span className="font-mono font-bold text-emerald-500 self-end sm:self-center">
                    {formatCurrency(vch.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GSTR-1 OUTWARD SUPPLIES & HSN SUMMARY */}
      {activeTab === 'GSTR1' && (
        <Gstr1Report 
          data={data} 
          isHindi={isHindi} 
          onSelectInvoice={onPrintInvoice || onSelectInvoice} 
        />
      )}

      {/* TAB 3: GSTR-2A & 2B RECONCILIATION */}
      {activeTab === 'GSTR2B' && (
        <Gstr2bReconciliation
          data={data}
          isHindi={isHindi}
          onUpdateGstPortalData={canEditGstPortal ? onUpdateGstPortalData : undefined}
        />
      )}

      {/* TAB 4: AUTOMATED TDS COMPLIANCE */}
      {activeTab === 'TDS' && (
        <TdsAutomation
          data={data}
          isHindi={isHindi}
        />
      )}

      {/* TAB 5: E-WAY BILL BULK PORTAL JSON GENERATOR */}
      {activeTab === 'EWAY_BILL' && (
        <EWayBillTab
          data={data}
          isHindi={isHindi}
          onOpenModal={perms.canCreateEditTransactions && onOpenEWayBillModal ? (ids) => onOpenEWayBillModal(ids) : undefined}
        />
      )}

      {/* TAB 6: GSTIN & STATE SUPPLY INSPECTOR */}
      {activeTab === 'INSPECTOR' && (
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 shadow-xl space-y-4 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
            <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              <span>{isHindi ? 'जीएसटी नंबर सत्यापन एवं राज्य आपूर्ति नियम जांच' : 'GSTIN Validation & State Supply Inspector'}</span>
            </h3>
            <span className="text-xs text-indigo-500 font-semibold flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" /> Company Home State Code: <strong className="font-mono text-[var(--text-primary)]">{data.company.stateCode || '07'} ({data.company.state || 'Delhi'})</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="md:col-span-1 space-y-1.5">
              <label className="block text-[var(--text-secondary)] font-bold">Inspect Party GSTIN:</label>
              <div className="relative">
                <input
                  type="text"
                  maxLength={15}
                  value={testGstin}
                  onChange={(e) => setTestGstin(e.target.value.toUpperCase())}
                  className="w-full hv-input border rounded-xl px-3.5 py-2.5 text-xs text-amber-500 font-mono font-bold tracking-wider focus:border-amber-500 outline-none uppercase"
                  placeholder="e.g. 27AAAAA0000A1Z5"
                />
              </div>
            </div>

            <div className="md:col-span-2 hv-elevated p-3 rounded-xl border border-[var(--border-subtle)] flex flex-col justify-center space-y-1">
              <div className="flex items-center justify-between font-bold">
                <span className={`text-xs flex items-center gap-1.5 ${inspectedGstinInfo.isValid ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {inspectedGstinInfo.isValid ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{inspectedGstinInfo.message}</span>
                </span>

                {inspectedGstinInfo.isValid && (
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border ${
                    inspectedGstinInfo.isInterstate ? 'hv-pill-amber' : 'hv-pill-indigo'
                  }`}>
                    {inspectedGstinInfo.supplyType}
                  </span>
                )}
              </div>

              {inspectedGstinInfo.isValid && (
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--text-muted)] pt-1 font-mono">
                  <span>State Code: <strong className="text-[var(--text-primary)]">{inspectedGstinInfo.stateCode}</strong></span>
                  <span>State: <strong className="text-[var(--text-primary)]">{inspectedGstinInfo.stateName}</strong></span>
                  <span>PAN Extracted: <strong className="text-indigo-500">{inspectedGstinInfo.pan}</strong></span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Return Filing Period Selector Modal */}
      {showPeriodModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Calendar className="w-5 h-5 text-amber-500" />
                <span>{isHindi ? 'जीएसटी रिटर्न अवधि चुनें (Select GST Return Period)' : 'Select GST Return Period'}</span>
              </h3>
              <button
                onClick={() => setShowPeriodModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Active Financial Year Banner (Locked to Header FY when selected) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">
                {isHindi ? 'सक्रिय वित्तीय वर्ष (Active Financial Year):' : 'Active Financial Year (FY):'}
              </label>
              {isHeaderLockedFy ? (
                <div className="hv-elevated border border-emerald-500/40 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold font-mono text-emerald-500">
                      {isHeaderSingleFy ? `FY ${cleanActiveFy}` : cleanActiveFy} ({isHindi ? 'सक्रिय व लॉक' : 'Synced & Locked to Header'})
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      {isHindi
                        ? 'आपने ऊपर मुख्य मेनू में यह अवधि चुनी है, इसलिए यहाँ केवल मासिक, तिमाही या पूरी सक्रिय अवधि चुनें।'
                        : 'Locked to your selected Header Financial Year/Period — filter below by Monthly, Quarterly, or All Period within this selection.'}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono hv-pill-emerald border px-2 py-0.5 rounded-lg shrink-0 font-bold">
                    LOCKED
                  </span>
                </div>
              ) : (
                <select
                  value={selectedFy}
                  onChange={(e) => setSelectedFy(e.target.value)}
                  className="w-full hv-input border text-amber-500 font-mono font-bold text-xs rounded-xl px-3.5 py-2.5 outline-none cursor-pointer"
                >
                  <option value="ALL">{isHindi ? 'सभी वर्ष (All Period)' : 'All Period (Selected Range)'}</option>
                  {availableFys.map(fy => (
                    <option key={fy} value={fy}>FY {fy}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Frequency Selector Tabs */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">
                {isHindi ? 'फाइलिंग आवृत्ति (Filing Frequency):' : 'Filing Frequency:'}
              </label>
              <div className="grid grid-cols-3 gap-2 hv-elevated p-1.5 rounded-xl border border-[var(--border-subtle)]">
                <button
                  type="button"
                  onClick={() => setFilingFrequency('MONTHLY')}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    filingFrequency === 'MONTHLY'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isHindi ? 'मासिक (Monthly)' : 'Monthly'}
                </button>

                <button
                  type="button"
                  onClick={() => setFilingFrequency('QUARTERLY')}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    filingFrequency === 'QUARTERLY'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isHindi ? 'तिमाही (Quarterly)' : 'Quarterly'}
                </button>

                <button
                  type="button"
                  onClick={() => setFilingFrequency('ALL')}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
                    filingFrequency === 'ALL'
                      ? 'bg-indigo-600 text-white hv-keep-white font-bold'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  {isHindi ? 'पूरी अवधि (All Period)' : 'All Period'}
                </button>
              </div>
            </div>

            {/* Monthly Grid Selector */}
            {filingFrequency === 'MONTHLY' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--text-secondary)]">
                  {isHindi ? 'माह चुनें (Select Month):' : 'Select Return Month:'}
                </label>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {MONTH_LIST.map((m) => {
                    const count = getRecordCountForMonth(m.idx);
                    const isSelected = selectedMonth === m.idx && filingFrequency === 'MONTHLY';
                    const startYear = effectiveFy !== 'ALL' ? (parseInt(effectiveFy.split('-')[0], 10) || new Date().getFullYear()) : new Date().getFullYear();
                    const calYear = m.idx >= 3 ? startYear : startYear + 1;

                    return (
                      <button
                        key={m.idx}
                        type="button"
                        onClick={() => setSelectedMonth(m.idx)}
                        className={`p-2.5 text-left rounded-xl border text-xs transition flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? 'hv-pill-amber font-bold'
                            : 'hv-elevated border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
                        }`}
                      >
                        <span className="font-bold block">{isHindi ? m.hi : m.en}</span>
                        <span className="text-[10px] text-[var(--text-muted)] font-mono flex items-center justify-between mt-1">
                          <span>{calYear}</span>
                          <span className={count > 0 ? 'text-emerald-500 font-bold' : 'text-[var(--text-muted)]'}>
                            {count} rec
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quarterly Grid Selector */}
            {filingFrequency === 'QUARTERLY' && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--text-secondary)]">
                  {isHindi ? 'तिमाही चुनें (Select Quarter):' : 'Select Quarter:'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'Q1', labelEn: 'Q1 (Apr - Jun)', labelHi: 'Q1 (अप्रैल - जून)' },
                    { key: 'Q2', labelEn: 'Q2 (Jul - Sep)', labelHi: 'Q2 (जुलाई - सितंबर)' },
                    { key: 'Q3', labelEn: 'Q3 (Oct - Dec)', labelHi: 'Q3 (अक्टूबर - दिसंबर)' },
                    { key: 'Q4', labelEn: 'Q4 (Jan - Mar)', labelHi: 'Q4 (जनवरी - मार्च)' },
                  ].map((q) => {
                    const count = getRecordCountForQuarter(q.key as any);
                    const isSelected = selectedQuarter === q.key && filingFrequency === 'QUARTERLY';

                    return (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => setSelectedQuarter(q.key as any)}
                        className={`p-3 text-left rounded-xl border text-xs transition flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? 'hv-pill-amber font-bold'
                            : 'hv-elevated border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
                        }`}
                      >
                        <span className="font-bold">{isHindi ? q.labelHi : q.labelEn}</span>
                        <span className={`text-[10px] font-mono mt-2 ${count > 0 ? 'text-emerald-500 font-bold' : 'text-[var(--text-muted)]'}`}>
                          {count} Records found
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => setShowPeriodModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs rounded-xl transition cursor-pointer"
              >
                {isHindi ? 'अवधि लागू करें (Apply Period)' : 'Apply Period Filter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

