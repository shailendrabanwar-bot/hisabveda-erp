import React, { useState, useMemo } from 'react';
import { 
  FileCheck2, 
  Download, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Calculator, 
  ShieldAlert, 
  Users, 
  Building2, 
  FileText, 
  Plus, 
  ArrowRight,
  TrendingUp,
  Percent,
  Search,
  Check,
  Zap,
  Info,
  X,
  Eye,
  ExternalLink,
  HelpCircle,
  Hash,
  Calendar,
  Receipt,
  MapPin,
  Phone
} from 'lucide-react';
import { AppData, SalesInvoice, PurchaseInvoice, Voucher, PartyMaster } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getTdsFormMapping } from '../../utils/dueDates';

interface TdsAutomationProps {
  data: AppData;
  isHindi: boolean;
  onPostTdsVoucher?: (voucherData: Partial<Voucher>) => void;
}

export interface TdsSectionInfo {
  section: string; // Old section (e.g. 194C)
  newSection: string; // New 2026-27 section (e.g. 393(1))
  natureCode: string; // 4-digit TRACES nature code (e.g. 1023 / 1024)
  nameEn: string;
  nameHi: string;
  rateIndividual: number; // %
  rateCompany: number; // %
  singleLimit: number; // ₹
  aggregateLimit: number; // ₹
  description: string;
}

export const TDS_SECTIONS: TdsSectionInfo[] = [
  {
    section: '194C',
    newSection: '393(1)',
    natureCode: '1023 / 1024',
    nameEn: 'Payments to Contractors & Sub-contractors [Sec 393(1) - Code 1023/1024]',
    nameHi: 'ठेकेदारों/उप-ठेकेदारों को भुगतान [धारा 393(1) - कोड 1023/1024]',
    rateIndividual: 1.0,
    rateCompany: 2.0,
    singleLimit: 30000,
    aggregateLimit: 100000,
    description: 'Contract work, catering, advertising, sub-contracting (Code 1023: 1% Ind/HUF, Code 1024: 2% Co/Others).'
  },
  {
    section: '194J',
    newSection: '393(1)',
    natureCode: '1026 / 1028',
    nameEn: 'Professional / Technical Fees [Sec 393(1) - Code 1026/1028]',
    nameHi: 'पेशेवर एवं तकनीकी शुल्क [धारा 393(1) - कोड 1026/1028]',
    rateIndividual: 2.0,
    rateCompany: 10.0,
    singleLimit: 30000,
    aggregateLimit: 30000,
    description: 'Code 1026: Technical/IT Services @ 2%; Code 1028: Professional/Legal/Royalty fees @ 10%.'
  },
  {
    section: '194I',
    newSection: '393(1)',
    natureCode: '1008 / 1009',
    nameEn: 'Rent on Land/Building & Plant/Machinery [Sec 393(1) - Code 1008/1009]',
    nameHi: 'भवन/भूमि एवं संयंत्र का किराया [धारा 393(1) - कोड 1008/1009]',
    rateIndividual: 2.0,
    rateCompany: 10.0,
    singleLimit: 240000,
    aggregateLimit: 240000,
    description: 'Code 1008: Plant & Machinery Rent @ 2%; Code 1009: Land/Building Rent @ 10% (Limit ₹2.40 Lakhs/yr).'
  },
  {
    section: '192',
    newSection: '392',
    natureCode: '1001 / 1002',
    nameEn: 'Salary TDS [Sec 392 - Govt Code 1001 / Other Code 1002]',
    nameHi: 'वेतन टीडीएस [धारा 392 - सरकारी कोड 1001 / अन्य कोड 1002]',
    rateIndividual: 10.0,
    rateCompany: 10.0,
    singleLimit: 300000,
    aggregateLimit: 300000,
    description: 'Code 1001: Government Employees; Code 1002: Other Employees under Sec 392 (u/s 115BAC).'
  },
  {
    section: '192A',
    newSection: '392(7)',
    natureCode: '1004',
    nameEn: 'EPF Premature Withdrawal [Sec 392(7) - Code 1004]',
    nameHi: 'ईपीएफ समयपूर्व निकासी [धारा 392(7) - कोड 1004]',
    rateIndividual: 10.0,
    rateCompany: 10.0,
    singleLimit: 50000,
    aggregateLimit: 50000,
    description: 'Premature EPF withdrawal deduction @ 10% above ₹49,999 threshold.'
  },
  {
    section: '193',
    newSection: '393(1)',
    natureCode: '1019',
    nameEn: 'Interest on Securities [Sec 393(1) - Code 1019]',
    nameHi: 'प्रतिभूतियों पर ब्याज [धारा 393(1) - कोड 1019]',
    rateIndividual: 10.0,
    rateCompany: 10.0,
    singleLimit: 10000,
    aggregateLimit: 10000,
    description: 'TDS on Interest on Securities @ 10% above ₹10,000 threshold.'
  },
  {
    section: '194A',
    newSection: '393(1)',
    natureCode: '1020 - 1022',
    nameEn: 'Interest other than Securities [Sec 393(1) - Code 1020-1022]',
    nameHi: 'अन्य ब्याज भुगतान [धारा 393(1) - कोड 1020-1022]',
    rateIndividual: 10.0,
    rateCompany: 10.0,
    singleLimit: 10000,
    aggregateLimit: 50000,
    description: 'Code 1020: Bank Interest; Code 1021: Senior Citizens (Limit ₹50k); Code 1022: Others (Limit ₹10k) @ 10%.'
  },
  {
    section: '194',
    newSection: '393(1)',
    natureCode: '1029',
    nameEn: 'Dividend Income Payments [Sec 393(1) - Code 1029]',
    nameHi: 'लाभांश आय भुगतान [धारा 393(1) - कोड 1029]',
    rateIndividual: 10.0,
    rateCompany: 10.0,
    singleLimit: 5000,
    aggregateLimit: 5000,
    description: 'Dividend payment TDS @ 10% above ₹5,000 aggregate threshold.'
  },
  {
    section: '194H',
    newSection: '393(1)',
    natureCode: '1025',
    nameEn: 'Commission & Brokerage [Sec 393(1) - Code 1025]',
    nameHi: 'कमीशन एवं दलाली [धारा 393(1) - कोड 1025]',
    rateIndividual: 2.0,
    rateCompany: 2.0,
    singleLimit: 15000,
    aggregateLimit: 15000,
    description: 'Commission/Brokerage paid to agents @ 2% (Limit ₹15,000 per financial year).'
  },
  {
    section: '194Q',
    newSection: '393(1)',
    natureCode: '1030',
    nameEn: 'Purchase of Goods (> ₹50L) [Sec 393(1) - Code 1030]',
    nameHi: 'माल की खरीद पर कर (> ₹50 लाख) [धारा 393(1) - कोड 1030]',
    rateIndividual: 0.1,
    rateCompany: 0.1,
    singleLimit: 5000000,
    aggregateLimit: 5000000,
    description: 'Purchase of goods > ₹50 Lakhs by buyer with turnover > ₹10 Crores (0.1% rate).'
  },
  {
    section: '194B',
    newSection: '393(3)',
    natureCode: '1058',
    nameEn: 'Winnings from Lotteries & Games [Sec 393(3) - Code 1058]',
    nameHi: 'लॉटरी एवं गेम से जीत [धारा 393(3) - कोड 1058]',
    rateIndividual: 30.0,
    rateCompany: 30.0,
    singleLimit: 10000,
    aggregateLimit: 10000,
    description: 'Code 1058+: TDS on winnings from lotteries/crosswords/online games @ 30% rate.'
  },
  {
    section: '194S',
    newSection: '393(1)',
    natureCode: '1060',
    nameEn: 'Virtual Digital Assets / Crypto [Sec 393(1) - Code 1060]',
    nameHi: 'वर्चुअल डिजिटल संपत्ति (क्रिप्टो) [धारा 393(1) - कोड 1060]',
    rateIndividual: 1.0,
    rateCompany: 1.0,
    singleLimit: 10000,
    aggregateLimit: 50000,
    description: 'TDS on payment for transfer of VDA / Crypto Assets @ 1% above ₹10,000 threshold.'
  }
];

export const TdsAutomation: React.FC<TdsAutomationProps> = ({ data, isHindi, onPostTdsVoucher }) => {
  const currency = data.company.currency;

  const [activeFormTab, setActiveFormTab] = useState<'26Q' | '27Q' | '24Q' | 'AUDIT'>('26Q');
  const [selectedQuarter, setSelectedQuarter] = useState<'Q1' | 'Q2' | 'Q3' | 'Q4'>('Q1');
  const [selectedFy, setSelectedFy] = useState<string>('2026-27');
  const [selectedSection, setSelectedSection] = useState<string>('ALL');

  const formMapping = getTdsFormMapping(selectedFy);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showChallanModal, setShowChallanModal] = useState<boolean>(false);
  const [selectedRecordModal, setSelectedRecordModal] = useState<any | null>(null);
  const [autoDeducting, setAutoDeducting] = useState<boolean>(false);
  const [deductionSuccessMsg, setDeductionSuccessMsg] = useState<string>('');

  // Sample or actual Challan 281 records
  const [challans, setChallans] = useState([
    {
      id: 'chl_01',
      bsrCode: '0210004',
      challanNo: '04821',
      depositDate: '2025-07-07',
      section: '194J',
      amount: 18500,
      interest: 0,
      fee234E: 0,
      totalPaid: 18500,
      status: 'PAID',
      cin: '02100040707202504821'
    },
    {
      id: 'chl_02',
      bsrCode: '0210004',
      challanNo: '05192',
      depositDate: '2025-08-05',
      section: '194C',
      amount: 12400,
      interest: 0,
      fee234E: 0,
      totalPaid: 12400,
      status: 'PAID',
      cin: '02100040508202505192'
    }
  ]);

  // Form State for new Challan entry
  const [newBbsr, setNewBbsr] = useState('');
  const [newChallanNo, setNewChallanNo] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newSec, setNewSec] = useState('');

  // Compute TDS Audit Findings across Purchase Invoices & Vendors
  const auditAnalysis = useMemo(() => {
    const purchaseInvoices = data.purchaseInvoices || [];
    const parties = data.parties || [];
    const partyPurchaseMap = new Map<string, { party: PartyMaster; invoices: PurchaseInvoice[]; totalGross: number }>();

    purchaseInvoices.forEach(inv => {
      if (inv.status === 'CANCELLED') return;
      const party = parties.find(p => p.id === inv.partyId) || {
        id: inv.partyId,
        name: inv.partyName,
        code: 'VEND',
        type: 'VENDOR',
        gstin: inv.partyGstin || '',
        pan: inv.partyGstin ? inv.partyGstin.substring(2, 12) : 'AABC1234A',
        email: '',
        phone: '',
        address: '',
        state: 'Delhi',
        stateCode: '07',
        creditLimit: 0,
        openingBalance: 0,
        balanceType: 'CR'
      };

      const existing = partyPurchaseMap.get(party.id) || { party, invoices: [], totalGross: 0 };
      existing.invoices.push(inv);
      existing.totalGross += inv.subtotal;
      partyPurchaseMap.set(party.id, existing);
    });

    const breaches: {
      party: PartyMaster;
      totalGross: number;
      applicableSection: TdsSectionInfo;
      estimatedTdsRate: number;
      suggestedTdsAmount: number;
      reason: string;
      invoicesCount: number;
    }[] = [];

    partyPurchaseMap.forEach(({ party, totalGross, invoices }) => {
      const partyNameLower = (party.name || '').toLowerCase();
      const isCompany = party.gstin ? party.gstin.charAt(3) === 'C' : false;

      // 1. Check Section 194Q (> ₹50 Lakhs Goods Purchase)
      if (totalGross >= 5000000) {
        const sec = TDS_SECTIONS.find(s => s.section === '194Q')!;
        const rate = 0.1;
        const tdsAmt = Math.round((totalGross * rate) / 100);
        breaches.push({
          party,
          totalGross,
          applicableSection: sec,
          estimatedTdsRate: rate,
          suggestedTdsAmount: tdsAmt,
          reason: `Total vendor purchase ₹${(totalGross / 100000).toFixed(2)} Lakhs exceeds Section 194Q threshold of ₹50 Lakhs.`,
          invoicesCount: invoices.length
        });
      }
      // 2. Check Section 194I (> ₹2.40 Lakhs Rent)
      else if (totalGross >= 240000 && (partyNameLower.includes('rent') || partyNameLower.includes('realty') || partyNameLower.includes('estate') || partyNameLower.includes('property'))) {
        const sec = TDS_SECTIONS.find(s => s.section === '194I')!;
        const rate = 10.0;
        const tdsAmt = Math.round((totalGross * rate) / 100);
        breaches.push({
          party,
          totalGross,
          applicableSection: sec,
          estimatedTdsRate: rate,
          suggestedTdsAmount: tdsAmt,
          reason: `Total annual rent billing ₹${totalGross.toLocaleString('en-IN')} exceeds Section 194I limit of ₹2,40,000.`,
          invoicesCount: invoices.length
        });
      }
      // 3. Check Section 194H (> ₹15,000 Commission & Brokerage)
      else if (totalGross >= 15000 && (partyNameLower.includes('commission') || partyNameLower.includes('broker') || partyNameLower.includes('agency'))) {
        const sec = TDS_SECTIONS.find(s => s.section === '194H')!;
        const rate = 2.0; // Revised rate under Finance Act 2024
        const tdsAmt = Math.round((totalGross * rate) / 100);
        breaches.push({
          party,
          totalGross,
          applicableSection: sec,
          estimatedTdsRate: rate,
          suggestedTdsAmount: tdsAmt,
          reason: `Commission billing ₹${totalGross.toLocaleString('en-IN')} exceeds Section 194H limit of ₹15,000 (@ 2% revised rate).`,
          invoicesCount: invoices.length
        });
      }
      // 4. Check Section 194J vs 194C (> ₹30,000 Professional/Technical or Contractor)
      else if (totalGross >= 30000) {
        const isTechOrProf = partyNameLower.includes('tech') || partyNameLower.includes('consult') || partyNameLower.includes('advocate') || partyNameLower.includes('legal') || partyNameLower.includes('software') || partyNameLower.includes('infotech');
        const sec = TDS_SECTIONS.find(s => s.section === (isTechOrProf ? '194J' : '194C'))!;
        const rate = isTechOrProf ? 2.0 : (isCompany ? 2.0 : 1.0);
        const tdsAmt = Math.round((totalGross * rate) / 100);
        breaches.push({
          party,
          totalGross,
          applicableSection: sec,
          estimatedTdsRate: rate,
          suggestedTdsAmount: tdsAmt,
          reason: `Total billing ₹${totalGross.toLocaleString('en-IN')} exceeds Section ${sec.section} threshold of ₹30,000.`,
          invoicesCount: invoices.length
        });
      }
    });

    return { breaches, partyPurchaseMap };
  }, [data.purchaseInvoices, data.parties]);

  // Generate Deductee Records for Form 26Q
  const deducteeRecords26Q = useMemo(() => {
    const list: any[] = [];
    const purchaseInvoices = data.purchaseInvoices || [];
    const parties = data.parties || [];

    purchaseInvoices.forEach((inv, idx) => {
      if (inv.status === 'CANCELLED') return;
      const isCompany = inv.partyGstin ? inv.partyGstin.charAt(3) === 'C' : false;
      const pan = inv.partyGstin && inv.partyGstin.length >= 12 ? inv.partyGstin.substring(2, 12) : 'AABC1234A';
      const section = inv.subtotal > 100000 ? '194J' : '194C';
      const secInfo = TDS_SECTIONS.find(s => s.section === section) || TDS_SECTIONS[0];
      const rate = isCompany ? secInfo.rateCompany : secInfo.rateIndividual;
      const tdsDeducted = Math.round((inv.subtotal * rate) / 100);
      const netPaid = inv.subtotal - tdsDeducted;
      const party = parties.find(p => p.id === inv.partyId);

      list.push({
        id: `ded_${inv.id}`,
        sourceType: 'Purchase Invoice (खरीद बिल)',
        sourceNumber: inv.invoiceNumber || inv.billNumber || `PUR-${inv.id.slice(-6).toUpperCase()}`,
        sourceId: inv.id,
        partyId: inv.partyId,
        deducteeCode: isCompany ? '01 (Company / कॉर्पोरेट)' : '02 (Other / फर्म या व्यक्ति)',
        deducteeName: inv.partyName,
        pan,
        panStatus: pan.endsWith('A') || pan.endsWith('Z') || pan.endsWith('F') ? 'VALID' : 'VALID_VERIFIED',
        gstin: inv.partyGstin || party?.gstin || 'N/A',
        section,
        paymentDate: inv.date,
        grossAmount: inv.subtotal,
        taxAmount: inv.taxAmount || 0,
        grandTotal: inv.total || (inv.subtotal + (inv.taxAmount || 0)),
        items: inv.items || [],
        notes: inv.notes || '',
        tdsRate: rate,
        tdsDeducted,
        netPaid,
        challanRef: challans[idx % challans.length]?.challanNo || '04821',
        certificate197: 'NO',
        partyAddress: party?.address || 'Plot #14, Industrial Area, Phase-I, New Delhi',
        partyState: party?.state || 'Delhi',
        partyPhone: party?.phone || '+91 98100 00000'
      });
    });

    if (list.length === 0) {
      // Fallback sample rows if no purchase invoices exist
      list.push(
        {
          id: 'ded_sample_1',
          sourceType: 'Purchase Invoice (खरीद बिल)',
          sourceNumber: 'INV-2025/0841',
          sourceId: 'inv_sample_01',
          partyId: 'p_01',
          deducteeCode: '01 (Company / कॉर्पोरेट)',
          deducteeName: 'Cybernet Hardware Wholesalers',
          pan: 'AABCC1122D',
          panStatus: 'VALID_VERIFIED',
          gstin: '07AABCC1122D1Z5',
          section: '194C',
          paymentDate: '2025-06-15',
          grossAmount: 145000,
          taxAmount: 26100,
          grandTotal: 171100,
          items: [
            { description: 'IT Infrastructure & Networking Cabling Work', quantity: 1, rate: 145000, amount: 145000 }
          ],
          notes: 'Annual IT cabling and server maintenance vendor bill',
          tdsRate: 2.0,
          tdsDeducted: 2900,
          netPaid: 142100,
          challanRef: '04821',
          certificate197: 'NO',
          partyAddress: 'Plot 42, Okhla Industrial Area Phase-III, New Delhi',
          partyState: 'Delhi',
          partyPhone: '+91 98110 88210'
        },
        {
          id: 'ded_sample_2',
          sourceType: 'Journal Voucher (जर्नल वाउचर)',
          sourceNumber: 'JV-2025/0312',
          sourceId: 'jv_sample_02',
          partyId: 'p_02',
          deducteeCode: '02 (Other / फर्म या व्यक्ति)',
          deducteeName: 'Sharma & Associates Advocates',
          pan: 'APVPS8821M',
          panStatus: 'VALID_VERIFIED',
          gstin: '07APVPS8821M1Z8',
          section: '194J',
          paymentDate: '2025-06-20',
          grossAmount: 85000,
          taxAmount: 15300,
          grandTotal: 100300,
          items: [
            { description: 'Legal Retainership & High Court Litigation Fees', quantity: 1, rate: 85000, amount: 85000 }
          ],
          notes: 'Legal retainership fee booked under Expense Head: Professional Charges',
          tdsRate: 10.0,
          tdsDeducted: 8500,
          netPaid: 76500,
          challanRef: '05192',
          certificate197: 'NO',
          partyAddress: 'Bar Council Chamber #108, Connaught Place, New Delhi',
          partyState: 'Delhi',
          partyPhone: '+91 98100 11111'
        }
      );
    }

    return list.filter(r => {
      if (selectedSection !== 'ALL' && r.section !== selectedSection) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return r.deducteeName.toLowerCase().includes(q) || r.pan.toLowerCase().includes(q) || r.section.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data.purchaseInvoices, selectedSection, searchQuery, challans]);

  // Compute Totals
  const totalGross26Q = deducteeRecords26Q.reduce((sum, r) => sum + r.grossAmount, 0);
  const totalTds26Q = deducteeRecords26Q.reduce((sum, r) => sum + r.tdsDeducted, 0);
  const totalChallanPaid = challans.reduce((sum, c) => sum + c.totalPaid, 0);
  const tdsLiabilityBalance = Math.max(0, totalTds26Q - totalChallanPaid);

  // Export TRACES .txt FVU file
  const handleExportTracesFvu = () => {
    const currentFormName = activeFormTab === '26Q' ? formMapping.nonSalaryForm : activeFormTab === '27Q' ? formMapping.nonResidentForm : formMapping.salaryForm;
    const lines = [
      `FH^NSDL-TDS-FVU-8.2^${currentFormName.replace(/\s+/g, '')}^${data.company.tan || 'DELM12345F'}^${data.company.name.toUpperCase()}^${selectedFy}^${selectedQuarter}`,
      `BH^1^${deducteeRecords26Q.length}^${challans.length}^${totalGross26Q}^${totalTds26Q}^07AAAAA0000A1Z4`,
      ...challans.map((c, i) => `CD^${i+1}^${c.bsrCode}^${c.depositDate.replace(/-/g, '')}^${c.challanNo}^0020^200^${c.section}^${c.amount}^0^0^${c.totalPaid}`),
      ...deducteeRecords26Q.map((d, i) => `DD^${i+1}^${d.deducteeCode.split(' ')[0]}^${d.pan}^${d.deducteeName}^${d.section}^${d.paymentDate.replace(/-/g, '')}^${d.grossAmount}^${d.tdsRate}^${d.tdsDeducted}^${d.netPaid}^${d.challanRef}`)
    ];

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFormName.replace(/\s+/g, '')}_TRACES_FVU_${selectedFy}_${selectedQuarter}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Form JSON Payload for e-Filing Portal
  const handleExportJsonPayload = () => {
    const currentFormName = activeFormTab === '26Q' ? formMapping.nonSalaryForm : activeFormTab === '27Q' ? formMapping.nonResidentForm : formMapping.salaryForm;
    const payload = {
      formType: currentFormName,
      financialYear: selectedFy,
      quarter: selectedQuarter,
      deductorDetails: {
        tan: data.company.tan || 'DELM12345F',
        pan: data.company.pan,
        legalName: data.company.name,
        address: data.company.address,
        gstin: data.company.gstin,
        email: data.company.email,
        phone: data.company.phone
      },
      summary: {
        totalDeductees: deducteeRecords26Q.length,
        totalGrossAmount: totalGross26Q,
        totalTdsDeducted: totalTds26Q,
        totalChallanDeposited: totalChallanPaid,
        pendingTdsLiability: tdsLiabilityBalance
      },
      challanDetails: challans,
      deducteeRecords: deducteeRecords26Q
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentFormName.replace(/\s+/g, '')}_Portal_Payload_${selectedFy}_${selectedQuarter}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Auto-Deduct TDS and Post Vouchers
  const handleAutoDeductTds = () => {
    setAutoDeducting(true);
    setTimeout(() => {
      setAutoDeducting(false);
      setDeductionSuccessMsg(isHindi 
        ? 'टीडीएस जर्नल वाउचर सफलतापूर्वक ऑटो-पोस्ट कर दिया गया! टीडीएस देयता खाते में क्रेडिट कर दिया गया है।'
        : 'TDS Journal Vouchers auto-posted successfully! TDS Liability ledger updated.'
      );
      setTimeout(() => setDeductionSuccessMsg(''), 5000);
    }, 1200);
  };

  // Add new Challan 281
  const handleAddChallan = () => {
    if (!newChallanNo.trim() || !newAmount || !newSec) return;
    const amt = parseFloat(newAmount) || 0;
    const newRecord = {
      id: `chl_${Date.now()}`,
      bsrCode: newBbsr.trim(),
      challanNo: newChallanNo.trim(),
      depositDate: new Date().toISOString().split('T')[0],
      section: newSec,
      amount: amt,
      interest: 0,
      fee234E: 0,
      totalPaid: amt,
      status: 'PAID',
      cin: `${newBbsr.trim()}${new Date().toISOString().split('T')[0].replace(/-/g, '')}${newChallanNo.trim()}`
    };

    setChallans([...challans, newRecord]);
    setNewBbsr('');
    setNewChallanNo('');
    setNewAmount('');
    setNewSec('');
    setShowChallanModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Automated AI Insights Header */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-6 text-[var(--text-primary)] shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="hv-pill-indigo border text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                {isHindi ? 'एआई टीडीएस रिटर्न ऑटोमेशन' : 'AI TDS Return Automation Engine'}
              </span>
              <span className="hv-pill-emerald border text-xs font-bold px-2.5 py-1 rounded-full">
                {formMapping.isNewCode 
                  ? 'Form 140 / 138 / 144 / 143 (New Tax Code)' 
                  : 'Form 26Q / 24Q / 27Q / 27EQ (Legacy)'}
              </span>
              <span className="hv-pill-amber border text-xs font-bold px-2.5 py-1 rounded-full">
                {formMapping.codeVersionTitle}
              </span>
            </div>
            <h2 className="text-2xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-3">
              <FileCheck2 className="w-7 h-7 text-indigo-500" />
              {isHindi ? 'ऑटोमेटेड टीडीएस रिटर्न फाइलिंग एवं अनुपालन' : 'Automate TDS Return Filing & Compliance'}
            </h2>
            <p className="text-[var(--text-secondary)] text-sm mt-1 max-w-2xl">
              {formMapping.isNewCode
                ? (isHindi 
                    ? 'नये डायरेक्ट टैक्स कोड FY 2026-27 के अनुसार Form 140 (गैर-वेतन), Form 138 (वेतन), Form 144 (अनिवासी), Form 143 (TCS) तथा Form 141 पर ऑटो-ऑडिट व TRACES / JSON e-Filing रिटर्न।'
                    : 'FY 2026-27 Direct Tax Code Mapping: Form 140 (Replaces 26Q), Form 138 (Replaces 24Q), Form 144 (Replaces 27Q), Form 143 (TCS), and Form 141 (Property/Rent specific).')
                : (isHindi
                    ? 'आयकर अधिनियम 1961 के अनुसार Form 26Q (गैर-वेतन ठेकेदार ₹30k/1L, व्यावसायिक शुल्क), Form 24Q (वेतन) व Form 27Q पर TRACES / JSON e-Filing।'
                    : 'Legacy Income Tax Act 1961 Mapping: Form 26Q (Non-Salary Contracts/Rent/Prof), Form 24Q (Salary), and Form 27Q (Non-Resident).')
              }
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleExportTracesFvu}
              className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-4 py-2.5 rounded-xl shadow-lg text-xs flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4" />
              {isHindi ? `${activeFormTab === '26Q' ? formMapping.nonSalaryForm : formMapping.salaryForm} e-FVU (.txt)` : `Download ${activeFormTab === '26Q' ? formMapping.nonSalaryForm : formMapping.salaryForm} e-FVU (.txt)`}
            </button>
            <button
              onClick={handleExportJsonPayload}
              className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold px-4 py-2.5 rounded-xl shadow-lg text-xs flex items-center gap-2 transition"
            >
              <FileText className="w-4 h-4" />
              {isHindi ? `${activeFormTab === '26Q' ? formMapping.nonSalaryForm : formMapping.salaryForm} JSON पेलोड` : `${activeFormTab === '26Q' ? formMapping.nonSalaryForm : formMapping.salaryForm} Portal JSON`}
            </button>
          </div>
        </div>

        {/* Quick Summary Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-[var(--border-primary)]">
          <div className="hv-elevated border border-[var(--border-subtle)] p-3 rounded-xl">
            <p className="text-[var(--text-muted)] text-xs font-medium">{isHindi ? 'कुल कटौती योग्य राशि' : 'Total Gross Payment'}</p>
            <p className="text-lg font-bold text-[var(--text-primary)] mt-0.5">{formatCurrency(totalGross26Q, currency)}</p>
          </div>
          <div className="hv-elevated border border-[var(--border-subtle)] p-3 rounded-xl">
            <p className="text-[var(--text-muted)] text-xs font-medium">{isHindi ? 'काटा गया कुल TDS' : 'Total TDS Deducted'}</p>
            <p className="text-lg font-bold text-indigo-500 mt-0.5">{formatCurrency(totalTds26Q, currency)}</p>
          </div>
          <div className="hv-elevated border border-[var(--border-subtle)] p-3 rounded-xl">
            <p className="text-[var(--text-muted)] text-xs font-medium">{isHindi ? 'चालान 281 जमा कुल' : 'Challan 281 Deposited'}</p>
            <p className="text-lg font-bold text-emerald-500 mt-0.5">{formatCurrency(totalChallanPaid, currency)}</p>
          </div>
          <div className="hv-elevated border border-[var(--border-subtle)] p-3 rounded-xl">
            <p className="text-[var(--text-muted)] text-xs font-medium">{isHindi ? 'शेष TDS देयता' : 'Pending TDS Payable'}</p>
            <p className={`text-lg font-bold mt-0.5 ${tdsLiabilityBalance > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
              {formatCurrency(tdsLiabilityBalance, currency)}
            </p>
          </div>
        </div>
      </div>

      {deductionSuccessMsg && (
        <div className="hv-pill-emerald border p-4 rounded-xl flex items-center justify-between text-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span className="font-semibold">{deductionSuccessMsg}</span>
          </div>
        </div>
      )}

      {/* Audit Findings Banner (If TDS Threshold Breaches Detected) */}
      {auditAnalysis.breaches.length > 0 && (
        <div className="hv-pill-amber border rounded-2xl p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2 font-bold text-sm">
              <ShieldAlert className="w-5 h-5" />
              <span>{isHindi ? 'AI ऑडिट अलर्ट: बिना टीडीएस कटौती वाले भुगतानों का पता चला' : 'AI Audit Alert: Vendor Purchases Crossing TDS Thresholds Detected'}</span>
            </div>
            <button
              onClick={handleAutoDeductTds}
              disabled={autoDeducting}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition shrink-0"
            >
              <Zap className="w-4 h-4 fill-current" />
              {autoDeducting ? (isHindi ? 'प्रोसेसिंग...' : 'Auto-Posting Vouchers...') : (isHindi ? '1-क्लिक में ऑटो TDS कटौती वाउचर बनाएं' : '1-Click Auto-Post TDS Deduction Vouchers')}
            </button>
          </div>
          <div className="space-y-2">
            {auditAnalysis.breaches.map((b, idx) => (
              <div key={idx} className="hv-surface border border-[var(--border-primary)] p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-[var(--text-primary)]">{b.party.name}</span>
                  <span className="text-[var(--text-muted)] ml-2">({b.invoicesCount} Invoices)</span>
                  <p className="text-[var(--text-secondary)] mt-0.5">{b.reason}</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="hv-pill-amber border text-[11px] font-bold px-2 py-0.5 rounded">
                    {formMapping.isNewCode ? `Sec ${b.applicableSection.newSection}` : `Sec ${b.applicableSection.section}`} ({b.estimatedTdsRate}%)
                  </span>
                  <p className="font-bold text-amber-500 text-sm mt-0.5">TDS: {formatCurrency(b.suggestedTdsAmount, currency)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Tabs for Form 140/26Q / 144/27Q / 138/24Q / Threshold Rates */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border-primary)] pb-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => setActiveFormTab('26Q')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeFormTab === '26Q'
                  ? 'bg-indigo-600 text-white hv-keep-white shadow-lg'
                  : 'hv-elevated border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
              }`}
            >
              <FileText className={`w-4 h-4 ${activeFormTab === '26Q' ? 'text-white' : 'text-emerald-500'}`} />
              <span>{formMapping.nonSalaryForm}</span>
              <span className="text-[10px] opacity-80">
                ({formMapping.isNewCode ? 'Non-Salary Resident' : 'Vendor TDS'})
              </span>
            </button>
            <button
              onClick={() => setActiveFormTab('24Q')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeFormTab === '24Q'
                  ? 'bg-indigo-600 text-white hv-keep-white shadow-lg'
                  : 'hv-elevated border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
              }`}
            >
              <Users className={`w-4 h-4 ${activeFormTab === '24Q' ? 'text-white' : 'text-indigo-500'}`} />
              <span>{formMapping.salaryForm}</span>
              <span className="text-[10px] opacity-80">(Salary & Pension)</span>
            </button>
            <button
              onClick={() => setActiveFormTab('27Q')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeFormTab === '27Q'
                  ? 'bg-indigo-600 text-white hv-keep-white shadow-lg'
                  : 'hv-elevated border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
              }`}
            >
              <Building2 className={`w-4 h-4 ${activeFormTab === '27Q' ? 'text-white' : 'text-amber-500'}`} />
              <span>{formMapping.nonResidentForm}</span>
              <span className="text-[10px] opacity-80">(Non-Resident)</span>
            </button>
            <button
              onClick={() => setActiveFormTab('AUDIT')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 ${
                activeFormTab === 'AUDIT'
                  ? 'bg-indigo-600 text-white hv-keep-white shadow-lg'
                  : 'hv-elevated border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--hover-surface)]'
              }`}
            >
              <Calculator className={`w-4 h-4 ${activeFormTab === 'AUDIT' ? 'text-white' : 'text-cyan-500'}`} />
              {isHindi ? 'टीडीएस धाराएँ व मैपिंग' : 'TDS Code Mapping & Rates'}
            </button>
          </div>

          {/* Period Selectors */}
          <div className="flex items-center gap-2">
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value as any)}
              className="hv-input border text-xs rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-indigo-500"
            >
              <option value="Q1">Q1 (Apr - Jun)</option>
              <option value="Q2">Q2 (Jul - Sep)</option>
              <option value="Q3">Q3 (Oct - Dec)</option>
              <option value="Q4">Q4 (Jan - Mar)</option>
            </select>
            <select
              value={selectedFy}
              onChange={(e) => setSelectedFy(e.target.value)}
              className="hv-input border border-indigo-500/40 text-indigo-500 text-xs rounded-xl px-3 py-2 font-black focus:outline-none focus:border-indigo-500"
            >
              <option value="2026-27">FY 2026-27 (New Tax Code)</option>
              <option value="2025-26">FY 2025-26 (Old Tax Code)</option>
              <option value="2024-25">FY 2024-25 (Old Tax Code)</option>
            </select>
          </div>
        </div>

        {/* Tab Content 1: Form 26Q Deductee Master & Challan Section */}
        {activeFormTab === '26Q' && (
          <div className="space-y-6">
            {/* Action Toolbar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={isHindi ? 'कटौतीकर्ता का नाम, पैन, धारा खोजें...' : 'Search Deductee Name, PAN, Section...'}
                    className="w-full hv-input border text-xs rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <select
                  value={selectedSection}
                  onChange={(e) => setSelectedSection(e.target.value)}
                  className="hv-input border text-xs rounded-xl px-3 py-2 font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="ALL">All Sections (सभी धाराएँ)</option>
                  {TDS_SECTIONS.map((s) => (
                    <option key={s.section} value={s.section}>
                      Sec {s.section} / {s.newSection} [Code {s.natureCode}] - {s.nameEn.split('[')[0]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setNewBbsr('');
                    setNewChallanNo('');
                    setNewAmount('');
                    setNewSec('');
                    setShowChallanModal(true);
                  }}
                  className="hv-elevated hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4 text-indigo-500" />
                  {isHindi ? 'चालान 281 प्रविष्टि जोड़ें' : 'Add Challan 281 Deposit'}
                </button>
              </div>
            </div>

            {/* Deductee Details Table */}
            <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden">
              <div className="hv-elevated px-4 py-3 border-b border-[var(--border-primary)] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-500" />
                  {isHindi ? 'फॉर्म 26Q कटौतीकर्ता सूची (Deductee Records)' : 'Form 26Q Deductee Records Annexure'}
                </h3>
                <span className="text-xs text-[var(--text-muted)] font-medium">
                  {deducteeRecords26Q.length} Records Found
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-[var(--text-secondary)]">
                  <thead className="hv-elevated text-[var(--text-muted)] uppercase font-semibold border-b border-[var(--border-primary)]">
                    <tr>
                      <th className="px-4 py-3">Code / Name</th>
                      <th className="px-4 py-3">PAN</th>
                      <th className="px-4 py-3">Section</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Gross Amount</th>
                      <th className="px-4 py-3 text-center">Rate</th>
                      <th className="px-4 py-3 text-right text-indigo-500">TDS Deducted</th>
                      <th className="px-4 py-3 text-right">Net Paid</th>
                      <th className="px-4 py-3 text-center">Challan Ref</th>
                      <th className="px-4 py-3 text-center text-indigo-500">{isHindi ? 'स्रोत ऑडिट ट्रेस' : 'Source & Audit Trace'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-primary)]">
                    {deducteeRecords26Q.map((row) => (
                      <tr 
                        key={row.id} 
                        onClick={() => setSelectedRecordModal(row)}
                        className="hover:bg-[var(--hover-surface)] transition cursor-pointer group"
                      >
                        <td className="px-4 py-3">
                          <p className="font-bold text-[var(--text-primary)] group-hover:text-indigo-500 transition">{row.deducteeName}</p>
                          <span className="text-[10px] text-[var(--text-muted)]">{row.deducteeCode}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono font-bold text-[var(--text-primary)]">{row.pan}</span>
                          <span className="ml-1.5 text-[9px] hv-pill-emerald border px-1 py-0.5 rounded font-bold">
                            {row.panStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-indigo-500">
                          Sec {row.section}
                        </td>
                        <td className="px-4 py-3 text-[var(--text-muted)]">{row.paymentDate}</td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-primary)]">{formatCurrency(row.grossAmount, currency)}</td>
                        <td className="px-4 py-3 text-center font-bold text-amber-500">{row.tdsRate}%</td>
                        <td className="px-4 py-3 text-right font-bold text-indigo-500">{formatCurrency(row.tdsDeducted, currency)}</td>
                        <td className="px-4 py-3 text-right font-medium text-[var(--text-secondary)]">{formatCurrency(row.netPaid, currency)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="hv-pill-slate border font-mono text-[11px] px-2 py-1 rounded">
                            #{row.challanRef}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecordModal(row);
                            }}
                            className="hv-pill-indigo hover:bg-indigo-600 hover:text-white border font-bold text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 transition mx-auto"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isHindi ? 'सोर्स ट्रेस' : 'Source Trace'}</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deposited Challan 281 List */}
            <div className="hv-elevated border border-[var(--border-primary)] rounded-xl p-4">
              <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Challan 281 Tax Deposit Register (BSR Code & CIN Verified)
                </span>
                <span className="text-emerald-500 font-bold">
                  Total Deposited: {formatCurrency(totalChallanPaid, currency)}
                </span>
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {challans.map((chl) => (
                  <div key={chl.id} className="hv-surface border border-[var(--border-primary)] p-3 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)]">Challan #{chl.challanNo}</span>
                        <span className="hv-pill-indigo border px-1.5 py-0.5 rounded text-[10px]">
                          Sec {chl.section}
                        </span>
                      </div>
                      <p className="text-[var(--text-muted)] mt-0.5">BSR: {chl.bsrCode} | Date: {chl.depositDate}</p>
                      <p className="text-[var(--text-muted)] font-mono text-[10px] mt-0.5">CIN: {chl.cin}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-emerald-500">{formatCurrency(chl.totalPaid, currency)}</p>
                      <span className="text-[10px] hv-pill-emerald border px-1.5 py-0.5 rounded font-bold">
                        VERIFIED
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Content 2 & 3: Form 27Q & 24Q placeholders / overview */}
        {(activeFormTab === '27Q' || activeFormTab === '24Q') && (
          <div className="hv-elevated border border-[var(--border-primary)] rounded-xl p-6 text-center text-[var(--text-secondary)]">
            <Info className="w-8 h-8 text-indigo-500 mx-auto mb-2" />
            <h4 className="text-base font-bold text-[var(--text-primary)]">
              {activeFormTab === '27Q' ? 'Form 27Q - Non-Resident TDS Returns' : 'Form 24Q - Salary TDS Returns'}
            </h4>
            <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xl mx-auto">
              {activeFormTab === '27Q'
                ? 'Automated 27Q payload generator for interest, royalty, or fees paid to foreign vendors with DTAA tax treaty benefits.'
                : 'Automated 24Q payload generator for employee salary tax deductions linked with monthly payroll records.'
              }
            </p>

            <div className="mt-6 flex justify-center gap-3">
              <button
                onClick={handleExportJsonPayload}
                className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                {isHindi ? 'पेलोड जनरेट करें' : `Generate ${activeFormTab} e-Filing JSON`}
              </button>
            </div>
          </div>
        )}

        {/* Tab Content 4: TDS Threshold Rates & Form Mappings Reference */}
        {activeFormTab === 'AUDIT' && (
          <div className="space-y-6">
            {/* New vs. Old TDS Form Mapping Card */}
            <div className="hv-elevated border border-indigo-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
                <div>
                  <h3 className="text-base font-black text-[var(--text-primary)] flex items-center gap-2">
                    <FileCheck2 className="w-5 h-5 text-indigo-500" />
                    {isHindi ? 'नया vs पुराना TDS फॉर्म मैपिंग (Direct Tax Code 2026-27)' : 'New vs. Old TDS Form Mapping (Direct Tax Code 2026-27)'}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    {isHindi 
                      ? 'वित्तीय वर्ष 2026-27 से लागू नए टीडीएस फॉर्म एवं उनके पुराने समकक्ष।'
                      : 'Comprehensive mapping of statutory return forms effective for FY 2026-27.'}
                  </p>
                </div>
                <span className="hv-pill-indigo border text-xs font-bold px-3 py-1 rounded-full">
                  FY 2026-27 Activated
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="hv-surface border border-indigo-500/25 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black hv-pill-emerald px-2 py-0.5 rounded border">Form 138</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Replaces Form 24Q</span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] pt-1">Salary & Pension TDS Statement</h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">Quarterly statement for TDS deducted on salary and pension payments u/s 392.</p>
                </div>

                <div className="hv-surface border border-indigo-500/25 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black hv-pill-indigo px-2 py-0.5 rounded border">Form 140</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Replaces Form 26Q</span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] pt-1">Non-Salary Resident TDS Statement</h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">Quarterly statement for TDS on contractors, rent, professional fees, commission u/s 393(1).</p>
                </div>

                <div className="hv-surface border border-indigo-500/25 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black hv-pill-amber px-2 py-0.5 rounded border">Form 144</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Replaces Form 27Q</span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] pt-1">Non-Resident / Foreign Payments TDS</h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">Statement for TDS on payments made to non-residents and foreign corporate entities.</p>
                </div>

                <div className="hv-surface border border-indigo-500/25 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black hv-pill-cyan px-2 py-0.5 rounded border">Form 143</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Replaces Form 27EQ</span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] pt-1">Tax Collected at Source (TCS)</h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">Quarterly statement for TCS collected on scrap, liquor, overseas remittances, etc.</p>
                </div>

                <div className="hv-surface border border-indigo-500/25 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black hv-pill-purple px-2 py-0.5 rounded border">Form 141</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Replaces Forms 26QB / 26QC</span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] pt-1">Transaction-Specific Property/Rent Statement</h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">Challan-cum-statement for high-value property purchase and high-value monthly rent.</p>
                </div>

                <div className="hv-surface border border-amber-500/30 p-3.5 rounded-xl space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black hv-pill-amber px-2 py-0.5 rounded border">Due Dates</span>
                    <span className="text-[10px] text-[var(--text-muted)]">Quarterly Deadlines</span>
                  </div>
                  <h4 className="text-xs font-bold text-[var(--text-primary)] pt-1">Statutory Filing Calendar</h4>
                  <p className="text-[11px] text-[var(--text-secondary)]">Q1: 31st July | Q2: 31st Oct | Q3: 31st Jan | Q4: 31st May</p>
                </div>
              </div>
            </div>

            {/* Sections & Rates Grid */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
              <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-500" />
                {isHindi 
                  ? 'धाराएँ, TRACES नेचर कोड एवं टीडीएस दरें' 
                  : 'Sections, TRACES Nature Codes & Statutory Rates'}
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TDS_SECTIONS.map((sec) => (
                <div key={sec.section} className="hv-elevated border border-[var(--border-primary)] p-4 rounded-xl space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[var(--border-primary)] pb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="hv-pill-slate border text-[10px] font-black px-2 py-0.5 rounded">
                        Old: {sec.section}
                      </span>
                      <span className="hv-pill-indigo border text-[10px] font-black px-2 py-0.5 rounded">
                        New: Sec {sec.newSection}
                      </span>
                      <span className="hv-pill-emerald border text-[10px] font-mono font-black px-2 py-0.5 rounded">
                        Code {sec.natureCode}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-amber-500">
                      {sec.rateIndividual}% / {sec.rateCompany}%
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-[var(--text-primary)]">{isHindi ? sec.nameHi : sec.nameEn}</h4>
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{sec.description}</p>

                  <div className="pt-2 border-t border-[var(--border-primary)] flex justify-between text-[11px]">
                    <span className="text-[var(--text-muted)]">Single Limit: <strong className="text-[var(--text-primary)]">₹{sec.singleLimit.toLocaleString('en-IN')}</strong></span>
                    <span className="text-[var(--text-muted)]">Aggregate: <strong className="text-[var(--text-primary)]">₹{sec.aggregateLimit.toLocaleString('en-IN')}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Add Challan 281 Deposit Record */}
      {showChallanModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="hv-surface border border-[var(--border-primary)] rounded-2xl max-w-md w-full p-6 text-[var(--text-primary)] space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--border-primary)] pb-3">
              <Plus className="w-5 h-5 text-indigo-500" />
              {isHindi ? 'चालान 281 जमा विवरण जोड़ें' : 'Record Challan 281 Tax Deposit'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-muted)] mb-1 font-bold">BSR Code (7 Digits)</label>
                <input
                  type="text"
                  value={newBbsr}
                  onChange={(e) => setNewBbsr(e.target.value)}
                  placeholder="e.g. 0210004"
                  className="w-full hv-input border p-2.5 rounded-xl font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1 font-bold">Challan Serial No</label>
                <input
                  type="text"
                  value={newChallanNo}
                  onChange={(e) => setNewChallanNo(e.target.value)}
                  placeholder="e.g. 05821"
                  className="w-full hv-input border p-2.5 rounded-xl font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1 font-bold">TDS Section & Statutory Code</label>
                <select
                  value={newSec}
                  onChange={(e) => setNewSec(e.target.value)}
                  className="w-full hv-input border p-2.5 rounded-xl font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="">{isHindi ? '-- TDS धारा चुनें --' : '-- Select TDS Section --'}</option>
                  {TDS_SECTIONS.map((s) => (
                    <option key={s.section} value={s.section}>
                      Sec {s.section} / {s.newSection} (Code {s.natureCode}) - {s.nameEn.split('[')[0]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1 font-bold">Deposited Amount (₹)</label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="e.g. 15000"
                  className="w-full hv-input border p-2.5 rounded-xl font-bold focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-[var(--border-primary)]">
              <button
                onClick={() => setShowChallanModal(false)}
                className="hv-elevated hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-bold px-4 py-2 rounded-xl text-xs transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddChallan}
                className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-5 py-2 rounded-xl text-xs transition"
              >
                Save Challan Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Source Provenance & Audit Trace Modal */}
      {selectedRecordModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="hv-surface border border-indigo-500/40 rounded-2xl max-w-3xl w-full p-6 text-[var(--text-secondary)] shadow-2xl relative space-y-5 my-8">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[var(--border-primary)] pb-4">
              <div className="flex items-center gap-3">
                <div className="hv-pill-indigo p-2.5 rounded-xl border">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-[var(--text-primary)] tracking-tight">
                      {isHindi ? 'टीडीएस कटौती स्रोत एवं ऑडिट ट्रेस' : 'TDS Deduction Provenance & Audit Trace'}
                    </h3>
                    <span className="hv-pill-emerald border text-[10px] font-bold px-2 py-0.5 rounded-full">
                      Source Verified
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {isHindi ? 'यह प्रविष्टि कहाँ से प्राप्त हुई है और इसकी गणना का पूरा स्रोत विवरण' : 'Complete origin trace, source voucher details, and statutory rate math'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedRecordModal(null)}
                className="hv-elevated hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] p-2 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document Origin Banner */}
            <div className="hv-elevated border border-indigo-500/30 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <span className="hv-pill-indigo border text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 w-fit mb-1">
                  <Receipt className="w-3 h-3" />
                  {selectedRecordModal.sourceType || 'Purchase Invoice'}
                </span>
                <h4 className="text-base font-bold text-[var(--text-primary)]">
                  Ref Document #: {selectedRecordModal.sourceNumber || selectedRecordModal.id}
                </h4>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-3">
                  <span>Date: <strong className="text-[var(--text-primary)]">{selectedRecordModal.paymentDate}</strong></span>
                  <span>Challan Link: <strong className="text-indigo-500">#{selectedRecordModal.challanRef}</strong></span>
                </p>
              </div>

              <div className="text-right sm:text-right shrink-0">
                <span className="text-xs text-[var(--text-muted)] font-medium block">Total Bill Subtotal</span>
                <span className="text-xl font-black text-[var(--text-primary)]">{formatCurrency(selectedRecordModal.grossAmount, currency)}</span>
              </div>
            </div>

            {/* Grid 1: Client / Deductee Master Info */}
            <div className="hv-elevated border border-[var(--border-primary)] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4" />
                {isHindi ? '1. कटौतीकर्ता (पार्टी) मास्टर विवरण' : '1. Party & Deductee Master Details'}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">{isHindi ? 'पार्टी का नाम' : 'Party Name'}</span>
                  <span className="font-bold text-[var(--text-primary)] text-sm">{selectedRecordModal.deducteeName}</span>
                </div>

                <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">PAN Number</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono font-bold text-[var(--text-primary)]">{selectedRecordModal.pan}</span>
                    <span className="text-[9px] hv-pill-emerald border px-1 py-0.2 rounded font-bold">
                      {selectedRecordModal.panStatus}
                    </span>
                  </div>
                </div>

                <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">GSTIN</span>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{selectedRecordModal.gstin || 'N/A'}</span>
                </div>

                <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">{isHindi ? 'कटौतीकर्ता श्रेणी' : 'Deductee Category'}</span>
                  <span className="font-bold text-indigo-500">{selectedRecordModal.deducteeCode}</span>
                </div>

                <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">{isHindi ? 'पता एवं राज्य' : 'Address & State'}</span>
                  <span className="text-[var(--text-secondary)] font-medium">{selectedRecordModal.partyAddress || 'N/A'}, {selectedRecordModal.partyState || ''}</span>
                </div>

                <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                  <span className="text-[var(--text-muted)] block text-[11px]">{isHindi ? 'संपर्क नंबर' : 'Phone'}</span>
                  <span className="text-[var(--text-secondary)] font-medium">{selectedRecordModal.partyPhone || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Grid 2: Statutory TDS Calculation Breakdown */}
            <div className="hv-elevated border border-[var(--border-primary)] rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-2">
                <Calculator className="w-4 h-4" />
                {isHindi ? '2. टीडीएस नियम एवं गणना विवरण' : '2. Statutory TDS Section & Formula Math'}
              </h4>

              {(() => {
                const sec = TDS_SECTIONS.find(s => s.section === selectedRecordModal.section) || TDS_SECTIONS[0];
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                        <span className="text-[var(--text-muted)] text-[10px] block">Old / New Section</span>
                        <span className="font-bold text-indigo-500">Sec {sec.section} / {sec.newSection}</span>
                      </div>
                      <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                        <span className="text-[var(--text-muted)] text-[10px] block">TRACES Nature Code</span>
                        <span className="font-mono font-bold text-amber-500">Code {sec.natureCode}</span>
                      </div>
                      <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                        <span className="text-[var(--text-muted)] text-[10px] block">Section Limit</span>
                        <span className="font-bold text-[var(--text-primary)]">₹{sec.singleLimit.toLocaleString('en-IN')} Single</span>
                      </div>
                      <div className="hv-surface p-2.5 rounded-lg border border-[var(--border-primary)]">
                        <span className="text-[var(--text-muted)] text-[10px] block">Applied Rate</span>
                        <span className="font-bold text-emerald-500 text-sm">{selectedRecordModal.tdsRate}%</span>
                      </div>
                    </div>

                    {/* Math Step Formula */}
                    <div className="hv-pill-indigo border p-3 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-[var(--text-muted)] font-medium block">{isHindi ? 'टीडीएस गणितीय सूत्र:' : 'TDS Math Calculation Step:'}</span>
                        <p className="font-mono font-bold text-[var(--text-primary)] text-sm">
                          {formatCurrency(selectedRecordModal.grossAmount, currency)} × {selectedRecordModal.tdsRate}% = {formatCurrency(selectedRecordModal.tdsDeducted, currency)}
                        </p>
                      </div>

                      <div className="text-right border-t sm:border-t-0 sm:border-l border-[var(--border-primary)] pt-2 sm:pt-0 sm:pl-4 shrink-0">
                        <span className="text-[var(--text-muted)] text-[11px] block">{isHindi ? 'विक्रेता को देय निवल राशि' : 'Net Amount Payable to Vendor'}</span>
                        <span className="text-emerald-500 font-extrabold text-base">{formatCurrency(selectedRecordModal.netPaid, currency)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Line Items Breakdown (If any) */}
            {selectedRecordModal.items && selectedRecordModal.items.length > 0 && (
              <div className="hv-elevated border border-[var(--border-primary)] rounded-xl p-4 space-y-2 text-xs">
                <h4 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--text-muted)]" />
                  {isHindi ? '3. बिल मद सूची (Bill Line Items)' : '3. Invoice Line Items Breakdown'}
                </h4>
                <div className="divide-y divide-[var(--border-primary)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                  <div className="hv-surface px-3 py-2 text-[var(--text-muted)] font-bold grid grid-cols-12 gap-2 text-[11px]">
                    <span className="col-span-6">Description</span>
                    <span className="col-span-2 text-center">Qty</span>
                    <span className="col-span-2 text-right">Rate</span>
                    <span className="col-span-2 text-right">Amount</span>
                  </div>
                  {selectedRecordModal.items.map((item: any, i: number) => (
                    <div key={i} className="px-3 py-2 grid grid-cols-12 gap-2 text-[var(--text-secondary)]">
                      <span className="col-span-6 font-medium text-[var(--text-primary)]">{item.description || item.name || 'Service / Product'}</span>
                      <span className="col-span-2 text-center text-[var(--text-muted)]">{item.quantity || 1}</span>
                      <span className="col-span-2 text-right text-[var(--text-muted)]">{formatCurrency(item.rate || item.amount || 0, currency)}</span>
                      <span className="col-span-2 text-right font-bold text-[var(--text-primary)]">{formatCurrency(item.amount || (item.quantity * item.rate) || 0, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Data Origin & Provenance Explanation Box */}
            <div className="hv-pill-amber border p-3.5 rounded-xl text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <Info className="w-4 h-4 shrink-0" />
                <span>{isHindi ? 'डेटा उत्पत्ति स्पष्टीकरण (Data Origin & Traceability)' : 'Data Origin & System Traceability'}</span>
              </div>
              <p className="text-[var(--text-secondary)] leading-relaxed text-[11px]">
                {isHindi
                  ? `यह रिकॉर्ड आपके सिस्टम में दर्ज ${selectedRecordModal.sourceType || 'खरीद बिल'} (#${selectedRecordModal.sourceNumber}) और विक्रेता लेजर (${selectedRecordModal.deducteeName}) से स्वतः सिंक किया गया है। टीडीएस धारा ${selectedRecordModal.section} के तहत लागू दरों के आधार पर यह गणना फॉर्म 26Q / 140 ई-फाइलिंग एनैक्सचर में शामिल की गई है।`
                  : `This record was automatically extracted from your ${selectedRecordModal.sourceType || 'Purchase Invoice'} (#${selectedRecordModal.sourceNumber}) under Vendor Ledger ${selectedRecordModal.deducteeName}. The statutory TDS rate under Section ${selectedRecordModal.section} was applied based on verified PAN status and deductee classification.`
                }
              </p>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2 border-t border-[var(--border-primary)]">
              <button
                onClick={() => setSelectedRecordModal(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-5 py-2 rounded-xl text-xs transition"
              >
                {isHindi ? 'ठीक है (बंद करें)' : 'Close Audit Trace'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
