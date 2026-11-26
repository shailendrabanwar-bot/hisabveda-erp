import {
  Account,
  AccountCategory,
  AppData,
  CompanyDetails,
  Currency,
  Employee,
  LanLiveSnapshot,
  PayrollRecord,
  SalesInvoice,
  Voucher,
} from '../types';
import {
  calculateAccountBalances,
  calculatePartyOutstanding,
  getAutoRoundOffAdjustment,
  getFinancialSummary,
  isBankLedger,
  isCashLedger,
  isCashOrBankLedger,
  mergeAccountsWithBalancesMap,
} from './accounting';
import { buildUpiPaymentUri } from './erpSmartHelpers';
import { formatCurrency } from './storage';

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

export interface IndianPayrollCalcOptions {
  employee: Pick<
    Employee,
    | 'id'
    | 'employeeCode'
    | 'name'
    | 'designation'
    | 'department'
    | 'basicSalary'
    | 'hra'
    | 'conveyanceAllowance'
    | 'specialAllowance'
    | 'pfDeduction'
    | 'esiDeduction'
    | 'tdsDeduction'
  >;
  payrollMonth: string;
  workingDays?: number;
  unpaidLeaveDays?: number;
  overtimeHours?: number;
  overtimePay?: number;
  advanceDeduction?: number;
  tdsOverride?: number;
  ptOverride?: number;
  applyAutoPf12?: boolean;
  capPfAt15k?: boolean;
  applyAutoEsic?: boolean;
  applyAutoPt?: boolean;
}

export interface IndianPayrollBreakdown {
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  earnedBasic: number;
  earnedHra: number;
  earnedConveyance: number;
  earnedSpecial: number;
  overtimePay: number;
  fullMonthlyGross: number;
  leaveDeduction: number;
  grossSalary: number;
  pfDeduction: number;
  pfEmployerContribution: number;
  esiDeduction: number;
  esicEmployerContribution: number;
  professionalTax: number;
  tdsDeduction: number;
  advanceDeduction: number;
  totalDeductions: number;
  netSalary: number;
}

/**
 * Computes Indian statutory payroll deductions:
 * - Pro-rata Leave / LOP deduction from full monthly pay
 * - Employee PF @ 12% of earned Basic (optional Rs. 15,000 wage ceiling)
 * - Employer PF @ 12% (informational / CTC note)
 * - Employee ESIC @ 0.75% & Employer ESIC @ 3.25% when Gross <= Rs. 21,000
 * - Professional Tax (Indian standard slab: >15k => 200, >10k => 150, else 0)
 * - Advance Deduction & TDS
 */
export function calculateIndianStatutoryPayroll(
  opts: IndianPayrollCalcOptions
): IndianPayrollBreakdown {
  const emp = opts.employee;
  const workingDays = Math.max(1, Math.min(31, Number(opts.workingDays ?? 26)));
  const leaveDays = Math.max(0, Math.min(workingDays, Number(opts.unpaidLeaveDays ?? 0)));
  const presentDays = Math.max(0, Math.round((workingDays - leaveDays) * 100) / 100);
  const payRatio = presentDays / workingDays;

  const fullBasic = Math.max(0, Number(emp.basicSalary) || 0);
  const fullHra = Math.max(0, Number(emp.hra) || 0);
  const fullConveyance = Math.max(0, Number(emp.conveyanceAllowance) || 0);
  const fullSpecial = Math.max(0, Number(emp.specialAllowance) || 0);
  const fullMonthlyGross = r2(fullBasic + fullHra + fullConveyance + fullSpecial);

  const earnedBasic = r2(fullBasic * payRatio);
  const earnedHra = r2(fullHra * payRatio);
  const earnedConveyance = r2(fullConveyance * payRatio);
  const earnedSpecial = r2(fullSpecial * payRatio);
  const overtimePay = r2(Math.max(0, Number(opts.overtimePay) || 0));

  const earnedBaseGross = r2(earnedBasic + earnedHra + earnedConveyance + earnedSpecial);
  const leaveDeduction = r2(Math.max(0, fullMonthlyGross - earnedBaseGross));
  const grossSalary = r2(earnedBaseGross + overtimePay);

  // PF 12%
  const applyPf = opts.applyAutoPf12 !== false;
  let pfDeduction = 0;
  let pfEmployerContribution = 0;
  if (applyPf && earnedBasic > 0) {
    const pfWage = opts.capPfAt15k ? Math.min(earnedBasic, 15000) : earnedBasic;
    pfDeduction = r2(pfWage * 0.12);
    pfEmployerContribution = r2(pfWage * 0.12);
  } else if (!applyPf) {
    pfDeduction = r2(Math.max(0, Number(emp.pfDeduction) || 0));
    pfEmployerContribution = pfDeduction;
  }

  // ESIC 0.75% Employee / 3.25% Employer (statutory limit: Gross <= 21,000)
  const applyEsic = opts.applyAutoEsic !== false;
  let esiDeduction = 0;
  let esicEmployerContribution = 0;
  if (applyEsic && grossSalary > 0 && grossSalary <= 21000) {
    esiDeduction = r2(grossSalary * 0.0075);
    esicEmployerContribution = r2(grossSalary * 0.0325);
  } else if (!applyEsic) {
    esiDeduction = r2(Math.max(0, Number(emp.esiDeduction) || 0));
    esicEmployerContribution = esiDeduction > 0 ? r2(grossSalary * 0.0325) : 0;
  }

  // Professional Tax (PT)
  let professionalTax = 0;
  if (opts.ptOverride !== undefined && Number.isFinite(opts.ptOverride)) {
    professionalTax = r2(Math.max(0, opts.ptOverride));
  } else if (opts.applyAutoPt !== false) {
    if (grossSalary > 15000) professionalTax = 200;
    else if (grossSalary > 10000) professionalTax = 150;
    else professionalTax = 0;
  }

  const tdsDeduction = r2(
    Math.max(0, opts.tdsOverride !== undefined ? opts.tdsOverride : Number(emp.tdsDeduction) || 0)
  );
  const advanceDeduction = r2(Math.max(0, Number(opts.advanceDeduction) || 0));

  const totalDeductions = r2(
    pfDeduction + esiDeduction + professionalTax + tdsDeduction + advanceDeduction
  );
  const netSalary = r2(Math.max(0, grossSalary - totalDeductions));

  return {
    workingDays,
    presentDays,
    leaveDays,
    earnedBasic,
    earnedHra,
    earnedConveyance,
    earnedSpecial,
    overtimePay,
    fullMonthlyGross,
    leaveDeduction,
    grossSalary,
    pfDeduction,
    pfEmployerContribution,
    esiDeduction,
    esicEmployerContribution,
    professionalTax,
    tdsDeduction,
    advanceDeduction,
    totalDeductions,
    netSalary,
  };
}

export interface PayrollPostingOptions {
  settlementMode: 'PAYABLE' | 'BANK' | 'CASH';
  settlementAccountId?: string;
  voucherDate: string;
  createdBy?: string;
  includeEmployerEsicInExpense?: boolean;
}

export interface PayrollAccountingPostResult {
  newAccounts: Account[];
  vouchers: Voucher[];
  updatedPayrolls: PayrollRecord[];
  journalVoucher?: Voucher;
  paymentVoucher?: Voucher;
  totals: {
    grossWages: number;
    employerEsic: number;
    totalExpenseDebited: number;
    pfPayable: number;
    esicPayable: number;
    ptPayable: number;
    tdsPayable: number;
    advanceRecovery: number;
    netSalaryTotal: number;
  };
}

/**
 * Generates strictly balanced Double-Entry accounting vouchers for a monthly payroll batch:
 * 1. Journal Voucher (Non-Cash):
 *    Dr Salary & Wages Expense (+ Employer ESIC Expense if applicable)
 *    Cr EPF Statutory Payable (Employee 12%)
 *    Cr ESIC Statutory Payable (Employee 0.75% + Employer 3.25% when applicable)
 *    Cr Professional Tax Payable
 *    Cr TDS Payable on Salary
 *    Cr Staff Advance Recovery / Deduction
 *    Cr Salary & Wages Payable (Net Take-Home)
 * 2. Optional Payment Voucher (if settlementMode === 'BANK' | 'CASH'):
 *    Dr Salary & Wages Payable (Net Take-Home)
 *    Cr Selected Bank / Cash Account
 */
export function buildPayrollAccountingVouchers(
  payrolls: PayrollRecord[],
  existingAccounts: Account[],
  options: PayrollPostingOptions
): PayrollAccountingPostResult {
  const newAccounts: Account[] = [];
  const findOrCreateAccount = (
    id: string,
    name: string,
    category: AccountCategory,
    subCategory: string,
    mainGroup: string,
    code: string,
    keywords: string[]
  ): Account => {
    const byId = existingAccounts.find((a) => a.id === id);
    if (byId) return byId;
    const byKeyword = existingAccounts.find(
      (a) =>
        !a.isGroup &&
        a.category === category &&
        keywords.some((k) => a.name.toLowerCase().includes(k))
    );
    if (byKeyword) return byKeyword;
    const created: Account = {
      id,
      code,
      name,
      category,
      subCategory,
      mainGroup,
      openingBalance: 0,
      balanceType: category === 'EXPENSE' || category === 'ASSET' ? 'DR' : 'CR',
      isSystem: true,
    };
    if (!newAccounts.some((a) => a.id === created.id)) {
      newAccounts.push(created);
    }
    return created;
  };

  const accSalaryWages = findOrCreateAccount(
    'acc_salary',
    'Salary & Wages Expense',
    'EXPENSE',
    'Indirect Expenses',
    'Employee Benefits & Salary Expense',
    '5110',
    ['salary & wages', 'salary expense', 'staff salary']
  );
  const accEmployerEsicExp = findOrCreateAccount(
    'acc_employer_esic_exp',
    'Employer ESIC Contribution Expense (3.25%)',
    'EXPENSE',
    'Indirect Expenses',
    'Employee Benefits & Salary Expense',
    '5116',
    ['employer esic', 'esic expense']
  );
  const accEpfPayable = findOrCreateAccount(
    'acc_epf_payable',
    'EPF / PF Statutory Payable',
    'LIABILITY',
    'Statutory Liabilities',
    'Statutory & Payroll Liabilities',
    '2210',
    ['epf', 'pf payable', 'provident fund']
  );
  const accEsicPayable = findOrCreateAccount(
    'acc_esi_payable',
    'ESIC Statutory Payable',
    'LIABILITY',
    'Statutory Liabilities',
    'Statutory & Payroll Liabilities',
    '2220',
    ['esic payable', 'esi payable']
  );
  const accPtPayable = findOrCreateAccount(
    'acc_pt_payable',
    'Professional Tax (PT) Payable',
    'LIABILITY',
    'Statutory Liabilities',
    'Statutory & Payroll Liabilities',
    '2240',
    ['professional tax', 'pt payable']
  );
  const accTdsPayable = findOrCreateAccount(
    'acc_tds_salary_payable',
    'TDS Payable on Salary',
    'LIABILITY',
    'Statutory Liabilities',
    'Statutory & Payroll Liabilities',
    '2230',
    ['tds payable', 'tds on salary']
  );
  const accAdvanceRecovery = findOrCreateAccount(
    'acc_staff_advance',
    'Staff Salary Advance Recoverable',
    'ASSET',
    'Current Assets',
    'Loans & Advances (Asset)',
    '1250',
    ['staff advance', 'salary advance']
  );
  const accSalaryPayable = findOrCreateAccount(
    'acc_net_salary_payable',
    'Salary & Wages Payable A/c',
    'LIABILITY',
    'Current Liabilities',
    'Statutory & Payroll Liabilities',
    '2250',
    ['salary payable', 'net salary payable']
  );
  const accRoundOff = findOrCreateAccount(
    'acc_round_off',
    'Round Off Account (राउंड ऑफ)',
    'EXPENSE',
    'Indirect Expenses',
    'Indirect Expenses',
    '5990',
    ['round off']
  );

  let grossWages = 0;
  let employerEsic = 0;
  let pfPayable = 0;
  let empEsicPayable = 0;
  let ptPayable = 0;
  let tdsPayable = 0;
  let advanceRecovery = 0;
  let netSalaryTotal = 0;

  for (const p of payrolls) {
    const gross = r2(p.grossSalary);
    const pf = r2(p.pfDeduction);
    const esiEmp = r2(p.esiDeduction);
    const esiEr = options.includeEmployerEsicInExpense === false ? 0 : r2(p.esicEmployerContribution || 0);
    const pt = r2(p.professionalTax ?? 0);
    const tds = r2(p.tdsDeduction);
    const adv = r2((p.advanceDeduction ?? 0) + (p.otherDeductions ?? 0));
    const net = r2(Math.max(0, gross - (pf + esiEmp + pt + tds + adv)));

    grossWages = r2(grossWages + gross);
    employerEsic = r2(employerEsic + esiEr);
    pfPayable = r2(pfPayable + pf);
    empEsicPayable = r2(empEsicPayable + esiEmp);
    ptPayable = r2(ptPayable + pt);
    tdsPayable = r2(tdsPayable + tds);
    advanceRecovery = r2(advanceRecovery + adv);
    netSalaryTotal = r2(netSalaryTotal + net);
  }

  const esicPayable = r2(empEsicPayable + employerEsic);
  const totalExpenseDebited = r2(grossWages + employerEsic);
  const ts = Date.now();
  const suffix = String(ts).slice(-6);
  const monthLabel = payrolls[0]?.payrollMonth || options.voucherDate.slice(0, 7);

  const journalEntries: Voucher['entries'] = [];
  if (grossWages > 0) {
    journalEntries.push({
      id: `sal_dr_wages_${ts}`,
      accountId: accSalaryWages.id,
      accountName: accSalaryWages.name,
      accountCode: accSalaryWages.code,
      debit: grossWages,
      credit: 0,
      narration: `Gross Salary Expense for ${monthLabel} (${payrolls.length} staff)`,
    });
  }
  if (employerEsic > 0) {
    journalEntries.push({
      id: `sal_dr_er_esic_${ts}`,
      accountId: accEmployerEsicExp.id,
      accountName: accEmployerEsicExp.name,
      accountCode: accEmployerEsicExp.code,
      debit: employerEsic,
      credit: 0,
      narration: `Employer ESIC 3.25% contribution for ${monthLabel}`,
    });
  }
  if (pfPayable > 0) {
    journalEntries.push({
      id: `sal_cr_pf_${ts}`,
      accountId: accEpfPayable.id,
      accountName: accEpfPayable.name,
      accountCode: accEpfPayable.code,
      debit: 0,
      credit: pfPayable,
      narration: 'Employee EPF 12% deduction',
    });
  }
  if (esicPayable > 0) {
    journalEntries.push({
      id: `sal_cr_esic_${ts}`,
      accountId: accEsicPayable.id,
      accountName: accEsicPayable.name,
      accountCode: accEsicPayable.code,
      debit: 0,
      credit: esicPayable,
      narration: 'ESIC Payable (0.75% Emp + 3.25% Er)',
    });
  }
  if (ptPayable > 0) {
    journalEntries.push({
      id: `sal_cr_pt_${ts}`,
      accountId: accPtPayable.id,
      accountName: accPtPayable.name,
      accountCode: accPtPayable.code,
      debit: 0,
      credit: ptPayable,
      narration: 'Professional Tax deduction',
    });
  }
  if (tdsPayable > 0) {
    journalEntries.push({
      id: `sal_cr_tds_${ts}`,
      accountId: accTdsPayable.id,
      accountName: accTdsPayable.name,
      accountCode: accTdsPayable.code,
      debit: 0,
      credit: tdsPayable,
      narration: 'TDS on Salary deduction',
    });
  }
  if (advanceRecovery > 0) {
    journalEntries.push({
      id: `sal_cr_adv_${ts}`,
      accountId: accAdvanceRecovery.id,
      accountName: accAdvanceRecovery.name,
      accountCode: accAdvanceRecovery.code,
      debit: 0,
      credit: advanceRecovery,
      narration: 'Salary Advance / Other recovery',
    });
  }
  if (netSalaryTotal > 0) {
    journalEntries.push({
      id: `sal_cr_net_${ts}`,
      accountId: accSalaryPayable.id,
      accountName: accSalaryPayable.name,
      accountCode: accSalaryPayable.code,
      debit: 0,
      credit: netSalaryTotal,
      narration: `Net Salary Payable (${payrolls.length} employees)`,
    });
  }

  const drSum = r2(journalEntries.reduce((s, e) => s + e.debit, 0));
  const crSum = r2(journalEntries.reduce((s, e) => s + e.credit, 0));
  const autoRo = getAutoRoundOffAdjustment(drSum, crSum);
  if (autoRo) {
    journalEntries.push({
      id: `sal_ro_${ts}`,
      accountId: accRoundOff.id,
      accountName: accRoundOff.name,
      accountCode: accRoundOff.code,
      debit: autoRo.debit,
      credit: autoRo.credit,
      narration: 'Payroll rounding adjustment',
    });
  }

  const vouchers: Voucher[] = [];
  let journalVoucher: Voucher | undefined;
  let paymentVoucher: Voucher | undefined;

  if (totalExpenseDebited > 0 && journalEntries.length >= 2) {
    journalVoucher = {
      id: `vch_payroll_jrn_${ts}`,
      voucherNumber: `SAL-JRN-${suffix}`,
      type: 'JOURNAL',
      date: options.voucherDate,
      entries: journalEntries,
      totalAmount: r2(journalEntries.reduce((s, e) => s + e.debit, 0)),
      narration: `Payroll Auto-Post for ${monthLabel} (${payrolls.length} employees) | Gross: ${grossWages}, PF: ${pfPayable}, ESIC: ${esicPayable}, PT: ${ptPayable}, Net: ${netSalaryTotal}`,
      createdBy: options.createdBy || 'System',
    };
    vouchers.push(journalVoucher);
  }

  if ((options.settlementMode === 'BANK' || options.settlementMode === 'CASH') && netSalaryTotal > 0) {
    const preferred = options.settlementAccountId
      ? existingAccounts.find((a) => a.id === options.settlementAccountId && isCashOrBankLedger(a))
      : undefined;
    const payoutAcc =
      preferred ||
      (options.settlementMode === 'CASH'
        ? existingAccounts.find(isCashLedger)
        : existingAccounts.find(isBankLedger)) ||
      existingAccounts.find(isCashOrBankLedger);

    if (payoutAcc) {
      const isCashOut = isCashLedger(payoutAcc);
      paymentVoucher = {
        id: `vch_payroll_pay_${ts}`,
        voucherNumber: `SAL-PAY-${suffix}`,
        type: 'PAYMENT',
        date: options.voucherDate,
        paymentMode: isCashOut ? 'CASH' : 'BANK_TRANSFER',
        bankAccountId: payoutAcc.id,
        entries: [
          {
            id: `sal_pay_dr_${ts}`,
            accountId: accSalaryPayable.id,
            accountName: accSalaryPayable.name,
            accountCode: accSalaryPayable.code,
            debit: netSalaryTotal,
            credit: 0,
          },
          {
            id: `sal_pay_cr_${ts}`,
            accountId: payoutAcc.id,
            accountName: payoutAcc.name,
            accountCode: payoutAcc.code,
            debit: 0,
            credit: netSalaryTotal,
          },
        ],
        totalAmount: netSalaryTotal,
        narration: `Salary Disbursement via ${payoutAcc.name} for ${monthLabel} (${payrolls.length} employees)`,
        createdBy: options.createdBy || 'System',
      };
      vouchers.push(paymentVoucher);
    }
  }

  const updatedPayrolls: PayrollRecord[] = payrolls.map((p) => ({
    ...p,
    paymentStatus: paymentVoucher ? 'PAID' : 'PENDING',
    paymentDate: options.voucherDate,
    settlementMode: options.settlementMode,
    settlementAccountId: options.settlementAccountId,
    paymentMode: paymentVoucher
      ? options.settlementMode === 'CASH'
        ? 'Cash'
        : 'Bank Transfer'
      : 'Salary Payable (Accrued)',
    voucherId: paymentVoucher?.id || journalVoucher?.id || p.voucherId,
    postedVoucherId: journalVoucher?.id || p.postedVoucherId,
    postedVoucherNo: journalVoucher?.voucherNumber || p.postedVoucherNo,
    paymentVoucherId: paymentVoucher?.id || p.paymentVoucherId,
    paymentVoucherNo: paymentVoucher?.voucherNumber || p.paymentVoucherNo,
  }));

  return {
    newAccounts,
    vouchers,
    updatedPayrolls,
    journalVoucher,
    paymentVoucher,
    totals: {
      grossWages,
      employerEsic,
      totalExpenseDebited,
      pfPayable,
      esicPayable,
      ptPayable,
      tdsPayable,
      advanceRecovery,
      netSalaryTotal,
    },
  };
}

/**
 * Builds a compact, secret-free LAN live snapshot of Sales, Cash/Bank balances, and Party Outstandings
 * for mobile & 2nd-PC read-only sync on the shop Wi-Fi.
 */
export function buildLanLiveSnapshot(data: AppData, fyLabel: string): LanLiveSnapshot {
  const summary = getFinancialSummary(data);
  const balancesMap = calculateAccountBalances(data);
  const allAccounts = mergeAccountsWithBalancesMap(data, balancesMap);

  const todayIso = new Date().toISOString().split('T')[0];
  let todaySales = 0;
  let activeInvoiceCount = 0;
  let pendingInvoicesCount = 0;

  for (const inv of data.invoices || []) {
    if (inv.status === 'CANCELLED') continue;
    activeInvoiceCount++;
    if (inv.date === todayIso) {
      todaySales += Number(inv.grandTotal) || 0;
    }
    if ((inv.grandTotal || 0) - (inv.amountPaid || 0) > 0.01 || inv.status !== 'PAID') {
      pendingInvoicesCount++;
    }
  }

  const cashBankAccounts = allAccounts
    .filter((acc) => !acc.isGroup && isCashOrBankLedger(acc))
    .map((acc) => {
      const bal = balancesMap.get(acc.id);
      return {
        id: acc.id,
        name: String(acc.name || '').slice(0, 80),
        code: String(acc.code || '').slice(0, 20),
        kind: (isCashLedger(acc) ? 'CASH' : 'BANK') as 'CASH' | 'BANK',
        balance: r2(bal ? bal.netBalance : acc.openingBalance || 0),
        balanceType: (bal ? bal.balanceType : acc.balanceType || 'DR') as 'DR' | 'CR',
      };
    });

  const partyOutstandings = (data.parties || [])
    .map((party) => {
      const out = calculatePartyOutstanding(party, data);
      return {
        id: party.id,
        name: String(party.name || '').slice(0, 80),
        phone: party.phone ? String(party.phone).slice(0, 20) : undefined,
        type: party.type,
        balance: r2(out.netBalance),
        balanceType: out.balanceType,
        pendingInvoicesCount: out.pendingInvoicesCount,
      };
    })
    .filter((p) => p.balance > 0.01)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 60);

  const recentInvoices = [...(data.invoices || [])]
    .filter((inv) => inv.status !== 'CANCELLED')
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 20)
    .map((inv) => ({
      id: inv.id,
      invoiceNumber: String(inv.invoiceNumber || '').slice(0, 40),
      date: String(inv.date || '').slice(0, 20),
      partyName: String(inv.partyName || '').slice(0, 80),
      grandTotal: r2(inv.grandTotal),
      amountPaid: r2(inv.amountPaid || 0),
      status: inv.status,
    }));

  return {
    companyName: String(data.company?.name || 'HISAB VEDA Enterprise').slice(0, 80),
    currency: (data.company?.currency || 'INR') as Currency,
    numberFormat: data.company?.numberFormat || 'INDIAN',
    updatedAt: new Date().toISOString(),
    fyLabel: String(fyLabel || '').slice(0, 40),
    summary: {
      totalSales: r2(summary.totalSales),
      todaySales: r2(todaySales),
      totalCollected: r2(summary.totalCollected),
      totalReceivables: r2(summary.totalReceivables),
      totalPayables: r2(summary.totalPayables),
      cashAndBankBalance: r2(summary.cashAndBankBalance),
      netProfit: r2(summary.netProfit),
      invoiceCount: activeInvoiceCount,
      pendingInvoicesCount,
    },
    cashBankAccounts,
    partyOutstandings,
    recentInvoices,
  };
}

/**
 * Sanitizes an Indian / international phone string for https://wa.me/<digits> URLs.
 * Auto-prefixes Indian country code 91 for standard 10-digit mobile numbers.
 */
export function formatPhoneForWhatsApp(rawPhone?: string, defaultCountryCode = '91'): string {
  const digits = String(rawPhone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `${defaultCountryCode}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('0')) {
    return `${defaultCountryCode}${digits.slice(1)}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return digits;
  }
  return '';
}

/**
 * Builds a strict https://wa.me/ deep link with pre-formatted Hindi/English Tax Invoice summary
 * including Invoice No., Amount, Due Date, and UPI Payment details.
 */
export function buildWhatsAppInvoiceShareUrl(params: {
  invoice: Pick<
    SalesInvoice,
    'invoiceNumber' | 'date' | 'dueDate' | 'partyName' | 'grandTotal' | 'amountPaid' | 'status'
  >;
  company: Pick<CompanyDetails, 'name' | 'currency'> &
    Partial<Pick<CompanyDetails, 'upiId' | 'phone'>>;
  partyPhone?: string;
  balancePayable?: number;
  isHindi?: boolean;
}): string {
  const { invoice, company, partyPhone, isHindi } = params;
  const currency = company.currency || 'INR';
  const total = Number(invoice.grandTotal) || 0;
  const paid = Number(invoice.amountPaid) || 0;
  const bal =
    params.balancePayable !== undefined
      ? Math.max(0, Number(params.balancePayable) || 0)
      : Math.max(0, r2(total - paid));

  const amtText = formatCurrency(total, currency);
  const balText = formatCurrency(bal, currency);
  const upiId = (company.upiId || '').trim();
  const upiUri =
    upiId && bal > 0 && currency === 'INR'
      ? buildUpiPaymentUri({
          upiId,
          payeeName: company.name,
          amount: bal,
          note: `Inv ${invoice.invoiceNumber}`,
        })
      : '';

  const lines = isHindi
    ? [
        `नमस्ते *${invoice.partyName}*,`,
        `*${company.name}* की ओर से आपके बिल का विवरण:`,
        ``,
        `🧾 *इनवॉइस नं.:* ${invoice.invoiceNumber}`,
        `📅 *तिथि:* ${invoice.date}`,
        invoice.dueDate ? `⏳ *देय तिथि (Due Date):* ${invoice.dueDate}` : '',
        `💰 *कुल राशि:* ${amtText}`,
        bal > 0
          ? `📌 *शेष देय राशि:* ${balText}`
          : `✅ *भुगतान स्थिति:* पूर्ण भुगतान प्राप्त (PAID)`,
        upiId ? `` : '',
        upiId ? `📲 *UPI भुगतान विवरण:*` : '',
        upiId ? `UPI ID: ${upiId}` : '',
        upiUri ? `UPI Pay Link: ${upiUri}` : '',
        ``,
        `धन्यवाद!`,
        `${company.name}${company.phone ? ` (${company.phone})` : ''}`,
      ]
    : [
        `Dear *${invoice.partyName}*,`,
        `Greetings from *${company.name}*. Please find your invoice details below:`,
        ``,
        `🧾 *Invoice No:* ${invoice.invoiceNumber}`,
        `📅 *Date:* ${invoice.date}`,
        invoice.dueDate ? `⏳ *Due Date:* ${invoice.dueDate}` : '',
        `💰 *Invoice Amount:* ${amtText}`,
        bal > 0
          ? `📌 *Balance Due:* ${balText}`
          : `✅ *Status:* PAID IN FULL`,
        upiId ? `` : '',
        upiId ? `📲 *UPI Payment Details:*` : '',
        upiId ? `UPI ID: ${upiId}` : '',
        upiUri ? `Quick Pay: ${upiUri}` : '',
        ``,
        `Thank you for your business!`,
        `${company.name}${company.phone ? ` | Ph: ${company.phone}` : ''}`,
      ];

  const message = lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
  const cleanPhone = formatPhoneForWhatsApp(partyPhone);
  const base = cleanPhone ? `https://wa.me/${cleanPhone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Builds a strict https://wa.me/ deep link for Customer/Party Ledger Payment Reminder
 * with closing balance, period summary, and UPI payment details.
 */
export function buildWhatsAppLedgerReminderUrl(params: {
  partyName: string;
  partyPhone?: string;
  company: Pick<CompanyDetails, 'name' | 'currency'> &
    Partial<Pick<CompanyDetails, 'upiId' | 'phone'>>;
  closingBalance: number;
  closingType: 'DR' | 'CR';
  totalDebit?: number;
  totalCredit?: number;
  periodLabel?: string;
  dueDate?: string;
  isHindi?: boolean;
}): string {
  const { partyName, partyPhone, company, closingBalance, closingType, isHindi } = params;
  const currency = company.currency || 'INR';
  const balFormatted = formatCurrency(Math.abs(closingBalance || 0), currency);
  const upiId = (company.upiId || '').trim();
  const isReceivable = closingType === 'DR' && closingBalance > 0;
  const upiUri =
    upiId && isReceivable && currency === 'INR'
      ? buildUpiPaymentUri({
          upiId,
          payeeName: company.name,
          amount: closingBalance,
          note: `Ledger Payment - ${partyName}`,
        })
      : '';

  const lines = isHindi
    ? [
        `नमस्ते *${partyName}*,`,
        `*${company.name}* से आपका खाता (लेज़र) विवरण:`,
        ``,
        params.periodLabel ? `🗓️ *अवधि:* ${params.periodLabel}` : '',
        `📊 *कुल नामे (Debit):* ${formatCurrency(params.totalDebit || 0, currency)}`,
        `📊 *कुल जमा (Credit):* ${formatCurrency(params.totalCredit || 0, currency)}`,
        `📌 *वर्तमान बकाया / क्लोज़िंग शेष:* ${balFormatted} (${closingType})`,
        params.dueDate ? `⏳ *देय तिथि:* ${params.dueDate}` : '',
        upiId && isReceivable ? `` : '',
        upiId && isReceivable ? `📲 *तुरंत UPI भुगतान विवरण:*` : '',
        upiId && isReceivable ? `UPI ID: ${upiId}` : '',
        upiUri ? `UPI Pay Link: ${upiUri}` : '',
        ``,
        isReceivable
          ? `कृपया समय पर बकाया राशि का भुगतान करने की कृपा करें। धन्यवाद!`
          : `आपके व्यवसाय के लिए धन्यवाद!`,
        `${company.name}${company.phone ? ` (${company.phone})` : ''}`,
      ]
    : [
        `Dear *${partyName}*,`,
        `Payment & Ledger Statement Summary from *${company.name}*:`,
        ``,
        params.periodLabel ? `🗓️ *Period:* ${params.periodLabel}` : '',
        `📊 *Total Billed (Dr):* ${formatCurrency(params.totalDebit || 0, currency)}`,
        `📊 *Total Received (Cr):* ${formatCurrency(params.totalCredit || 0, currency)}`,
        `📌 *Closing Balance:* ${balFormatted} (${closingType === 'DR' ? 'Receivable / Due' : 'CR Advance'})`,
        params.dueDate ? `⏳ *Due Date:* ${params.dueDate}` : '',
        upiId && isReceivable ? `` : '',
        upiId && isReceivable ? `📲 *UPI Payment Details:*` : '',
        upiId && isReceivable ? `UPI ID: ${upiId}` : '',
        upiUri ? `Quick Pay: ${upiUri}` : '',
        ``,
        isReceivable
          ? `Kindly arrange payment at your earliest convenience. Thank you!`
          : `Thank you for your continued business!`,
        `${company.name}${company.phone ? ` | Ph: ${company.phone}` : ''}`,
      ];

  const message = lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
  const cleanPhone = formatPhoneForWhatsApp(partyPhone);
  const base = cleanPhone ? `https://wa.me/${cleanPhone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}
