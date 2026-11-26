export interface StatutoryReturnAlert {
  id: string;
  category: 'GST' | 'TDS';
  returnName: string;
  formNumberNew?: string; // e.g. Form 140
  formNumberOld?: string; // e.g. Form 26Q
  period: string; // e.g. July 2026 or Q1 (Apr-Jun 2026)
  dueDate: string; // YYYY-MM-DD
  daysRemaining: number; // negative if overdue
  status: 'OVERDUE' | 'DUE_SOON' | 'UPCOMING' | 'FILED';
  descriptionEn: string;
  descriptionHi: string;
  actionTab: 'tax' | 'tds' | 'dashboard';
}

export function getStatutoryDueDates(activeFy: string = '2026-27'): StatutoryReturnAlert[] {
  const currentDateStr = '2026-08-12';
  const currentDate = new Date(currentDateStr);

  const alerts: StatutoryReturnAlert[] = [];

  // 1. GST GSTR-1 (Due 11th of every month for previous month)
  const gstr1DueDate = new Date('2026-08-11');
  const gstr1DiffDays = Math.ceil((gstr1DueDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24));
  alerts.push({
    id: 'gst_gstr1',
    category: 'GST',
    returnName: 'GSTR-1 (Outward Sales)',
    period: 'July 2026',
    dueDate: '2026-08-11',
    daysRemaining: gstr1DiffDays,
    status: gstr1DiffDays < 0 ? 'OVERDUE' : gstr1DiffDays <= 5 ? 'DUE_SOON' : 'UPCOMING',
    descriptionEn: 'Monthly GSTR-1 Outward Supplies return deadline was 11th August.',
    descriptionHi: 'मासिक GSTR-1 बिक्री विवरणी दाखिल करने की नियत तिथि 11 अगस्त थी।',
    actionTab: 'tax'
  });

  // 2. GST GSTR-3B (Due 20th of every month)
  const gstr3bDueDate = new Date('2026-08-20');
  const gstr3bDiffDays = Math.ceil((gstr3bDueDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24));
  alerts.push({
    id: 'gst_gstr3b',
    category: 'GST',
    returnName: 'GSTR-3B (Net Tax Settlement)',
    period: 'July 2026',
    dueDate: '2026-08-20',
    daysRemaining: gstr3bDiffDays,
    status: gstr3bDiffDays < 0 ? 'OVERDUE' : gstr3bDiffDays <= 10 ? 'DUE_SOON' : 'UPCOMING',
    descriptionEn: 'Monthly GSTR-3B summary tax settlement return due in 8 days.',
    descriptionHi: 'मासिक GSTR-3B शुद्ध कर भुगतान विवरणी 20 अगस्त तक देय है।',
    actionTab: 'tax'
  });

  // 3. TDS Q1 Return (Due 31st July)
  const isNewDtc = activeFy === '2026-27';
  const tdsQ1DueDate = new Date('2026-07-31');
  const tdsQ1DiffDays = Math.ceil((tdsQ1DueDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24));

  alerts.push({
    id: 'tds_q1',
    category: 'TDS',
    returnName: isNewDtc 
      ? 'Form 140 / 138 / 144 (Q1 TDS Return)' 
      : 'Form 26Q / 24Q / 27Q (Q1 TDS Return)',
    formNumberNew: 'Form 140 / 138 / 144',
    formNumberOld: 'Form 26Q / 24Q / 27Q',
    period: 'Q1 (Apr - Jun 2026)',
    dueDate: '2026-07-31',
    daysRemaining: tdsQ1DiffDays,
    status: tdsQ1DiffDays < 0 ? 'OVERDUE' : tdsQ1DiffDays <= 10 ? 'DUE_SOON' : 'UPCOMING',
    descriptionEn: isNewDtc
      ? 'Quarter 1 TDS Return (Form 140 / 138) statutory due date was 31st July 2026.'
      : 'Quarter 1 TDS Return (Form 26Q / 24Q) statutory due date was 31st July 2026.',
    descriptionHi: isNewDtc
      ? 'त्रैमासिक Q1 टीडीएस रिटर्न (फॉर्म 140/138 - नया डायरेक्ट टैक्स कोड) 31 जुलाई तक देय थी।'
      : 'त्रैमासिक Q1 टीडीएस रिटर्न (फॉर्म 26Q/24Q) 31 जुलाई तक देय थी।',
    actionTab: 'tax'
  });

  // 4. TDS Q2 Return (Due 31st October)
  const tdsQ2DueDate = new Date('2026-10-31');
  const tdsQ2DiffDays = Math.ceil((tdsQ2DueDate.getTime() - currentDate.getTime()) / (1000 * 3600 * 24));
  alerts.push({
    id: 'tds_q2',
    category: 'TDS',
    returnName: isNewDtc ? 'Form 140 / 138 (Q2 TDS)' : 'Form 26Q / 24Q (Q2 TDS)',
    period: 'Q2 (Jul - Sep 2026)',
    dueDate: '2026-10-31',
    daysRemaining: tdsQ2DiffDays,
    status: 'UPCOMING',
    descriptionEn: 'Q2 TDS Quarterly filing due on 31st October 2026.',
    descriptionHi: 'Q2 टीडीएस रिटर्न फाइलिंग की नियत तिथि 31 अक्टूबर 2026 है।',
    actionTab: 'tax'
  });

  return alerts;
}

export function getTdsFormMapping(fy: string) {
  const isNewCode = fy === '2026-27';
  return {
    isNewCode,
    salaryForm: isNewCode ? 'Form 138' : 'Form 24Q',
    salaryFormDesc: isNewCode ? 'Form 138 (Replaces Form 24Q - Salary & Pension TDS)' : 'Form 24Q (Salary TDS Return)',
    nonSalaryForm: isNewCode ? 'Form 140' : 'Form 26Q',
    nonSalaryFormDesc: isNewCode ? 'Form 140 (Replaces Form 26Q - Non-Salary Resident TDS)' : 'Form 26Q (Non-Salary Resident TDS)',
    nonResidentForm: isNewCode ? 'Form 144' : 'Form 27Q',
    nonResidentFormDesc: isNewCode ? 'Form 144 (Replaces Form 27Q - Non-Resident TDS)' : 'Form 27Q (Non-Resident TDS)',
    tcsForm: isNewCode ? 'Form 143' : 'Form 27EQ',
    tcsFormDesc: isNewCode ? 'Form 143 (Replaces Form 27EQ - Tax Collected at Source TCS)' : 'Form 27EQ (Tax Collected at Source TCS)',
    propertyRentForm: isNewCode ? 'Form 141' : 'Form 26QB/26QC',
    propertyRentFormDesc: isNewCode ? 'Form 141 (Replaces Forms 26QB/QC - Specific PAN/Property/Rent TDS)' : 'Form 26QB/26QC (Property/Rent Specific TDS)',
    codeVersionTitle: isNewCode ? 'Direct Tax Code 2026-27 (New Sections & TRACES Nature Codes)' : 'Income Tax Act 1961 (Legacy Sections)'
  };
}
