import React, { useState, useMemo } from 'react';
import { 
  Users, 
  UserPlus, 
  FileText, 
  DollarSign, 
  Calendar, 
  CheckCircle2, 
  Search, 
  Plus, 
  Printer, 
  Eye, 
  Edit, 
  Building2, 
  ShieldCheck, 
  Briefcase, 
  ArrowRight,
  TrendingUp,
  CreditCard,
  X,
  FileCheck2,
  Trash2,
  Landmark,
  BookCheck
} from 'lucide-react';
import { AppData, Employee, PayrollRecord, Voucher, UserRole } from '../../types';
import { SalarySlipModal } from './SalarySlipModal';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';
import { isBankLedger, isCashLedger } from '../../utils/accounting';
import { calculateIndianStatutoryPayroll } from '../../utils/enterpriseErpHelpers';

export interface PayrollBatchSaveOptions {
  postVoucher: boolean;
  settlementMode: 'PAYABLE' | 'BANK' | 'CASH';
  settlementAccountId?: string;
}

interface PayrollManagementProps {
  data: AppData;
  isHindi: boolean;
  currency: string;
  onSaveEmployee: (employee: Employee) => void;
  onDeleteEmployee?: (empId: string) => void;
  onSavePayrollBatch: (payrolls: PayrollRecord[], options: PayrollBatchSaveOptions) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const PayrollManagement: React.FC<PayrollManagementProps> = ({
  data,
  isHindi,
  currency,
  onSaveEmployee,
  onDeleteEmployee,
  onSavePayrollBatch,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const [activeTab, setActiveTab] = useState<'EMPLOYEES' | 'PROCESSING' | 'SLIPS'>('PROCESSING');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-07');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Modals
  const [showAddEmpModal, setShowAddEmpModal] = useState<boolean>(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [selectedSlipPayroll, setSelectedSlipPayroll] = useState<PayrollRecord | null>(null);

  const employees = data.employees || [];
  const payrolls = data.payrolls || [];

  // Employee Form State
  const [empName, setEmpName] = useState('');
  const [empCode, setEmpCode] = useState('');
  const [empDesignation, setEmpDesignation] = useState('');
  const [empDepartment, setEmpDepartment] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empEmail, setEmpEmail] = useState('');
  const [empPan, setEmpPan] = useState('');
  const [empAadhaar, setEmpAadhaar] = useState('');
  const [empBankName, setEmpBankName] = useState('');
  const [empAccountNo, setEmpAccountNo] = useState('');
  const [empIfsc, setEmpIfsc] = useState('');
  const [empBasic, setEmpBasic] = useState<number>(0);
  const [empHra, setEmpHra] = useState<number>(0);
  const [empConveyance, setEmpConveyance] = useState<number>(0);
  const [empSpecial, setEmpSpecial] = useState<number>(0);
  const [empPf, setEmpPf] = useState<number>(0);
  const [empEsi, setEmpEsi] = useState<number>(0);
  const [empTds, setEmpTds] = useState<number>(0);

  const handleOpenAddEmp = (emp?: Employee) => {
    if (emp) {
      setEditingEmp(emp);
      setEmpName(emp.name);
      setEmpCode(emp.employeeCode);
      setEmpDesignation(emp.designation);
      setEmpDepartment(emp.department);
      setEmpPhone(emp.phone || '');
      setEmpEmail(emp.email || '');
      setEmpPan(emp.pan || '');
      setEmpAadhaar(emp.aadhaar || '');
      setEmpBankName(emp.bankName || '');
      setEmpAccountNo(emp.bankAccountNo || '');
      setEmpIfsc(emp.ifscCode || '');
      setEmpBasic(emp.basicSalary || 0);
      setEmpHra(emp.hra || 0);
      setEmpConveyance(emp.conveyanceAllowance || 0);
      setEmpSpecial(emp.specialAllowance || 0);
      setEmpPf(emp.pfDeduction || 0);
      setEmpEsi(emp.esiDeduction || 0);
      setEmpTds(emp.tdsDeduction || 0);
    } else {
      setEditingEmp(null);
      setEmpName('');
      setEmpCode('');
      setEmpDesignation('');
      setEmpDepartment('');
      setEmpPhone('');
      setEmpEmail('');
      setEmpPan('');
      setEmpAadhaar('');
      setEmpBankName('');
      setEmpAccountNo('');
      setEmpIfsc('');
      setEmpBasic(0);
      setEmpHra(0);
      setEmpConveyance(0);
      setEmpSpecial(0);
      setEmpPf(0);
      setEmpEsi(0);
      setEmpTds(0);
    }
    setShowAddEmpModal(true);
  };

  const handleSaveEmployeeForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) return;

    const newEmp: Employee = {
      id: editingEmp ? editingEmp.id : `emp_${Date.now()}`,
      employeeCode: empCode || `EMP-${Date.now()}`,
      name: empName.trim(),
      designation: empDesignation || 'Staff Member',
      department: empDepartment,
      joiningDate: editingEmp ? editingEmp.joiningDate : new Date().toISOString().split('T')[0],
      phone: empPhone,
      email: empEmail,
      pan: empPan,
      aadhaar: empAadhaar,
      bankAccountNo: empAccountNo,
      bankName: empBankName,
      ifscCode: empIfsc,
      basicSalary: Number(empBasic) || 0,
      hra: Number(empHra) || 0,
      conveyanceAllowance: Number(empConveyance) || 0,
      specialAllowance: Number(empSpecial) || 0,
      pfDeduction: Number(empPf) || 0,
      esiDeduction: Number(empEsi) || 0,
      tdsDeduction: Number(empTds) || 0,
      status: 'ACTIVE'
    };

    onSaveEmployee(newEmp);
    setShowAddEmpModal(false);
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(e => 
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.employeeCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  // Filtered payrolls
  const filteredPayrolls = useMemo(() => {
    return payrolls.filter(p => 
      p.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.payrollMonth.includes(searchQuery)
    );
  }, [payrolls, searchQuery]);

  // Statutory Auto-Deduction & Accounting Settlement Controls
  const [applyAutoPf12, setApplyAutoPf12] = useState<boolean>(true);
  const [capPfAt15k, setCapPfAt15k] = useState<boolean>(false);
  const [applyAutoEsic, setApplyAutoEsic] = useState<boolean>(true);
  const [applyAutoPt, setApplyAutoPt] = useState<boolean>(true);

  const bankLedgers = useMemo(() => (data.accounts || []).filter(isBankLedger), [data.accounts]);
  const cashLedgers = useMemo(() => (data.accounts || []).filter(isCashLedger), [data.accounts]);

  const [settlementMode, setSettlementMode] = useState<'PAYABLE' | 'BANK' | 'CASH'>(() =>
    bankLedgers.length > 0 ? 'BANK' : cashLedgers.length > 0 ? 'CASH' : 'PAYABLE'
  );
  const [settlementAccountId, setSettlementAccountId] = useState<string>(
    () => bankLedgers[0]?.id || cashLedgers[0]?.id || ''
  );

  // Monthly Processing Batch Setup (per-employee editable Working Days, LOP Leave, Advance, TDS)
  const [draftPayrolls, setDraftPayrolls] = useState<{
    [empId: string]: {
      workingDays: number;
      leaveDays: number;
      overtimeHours: number;
      advanceDeduction: number;
      tdsOverride?: number;
    };
  }>({});

  const monthPayrolls = useMemo(() => {
    const settlementAcc =
      settlementMode === 'PAYABLE'
        ? undefined
        : (data.accounts || []).find((a) => a.id === settlementAccountId);

    return employees
      .filter((e) => e.status === 'ACTIVE')
      .map((emp) => {
        const existing = payrolls.find(
          (p) => p.employeeId === emp.id && p.payrollMonth === selectedMonth
        );
        const draft = draftPayrolls[emp.id];
        if (existing && !draft) return existing;

        const workingDays = draft?.workingDays ?? existing?.workingDays ?? 26;
        const leaveDays = draft?.leaveDays ?? existing?.leaveDays ?? 0;
        const overtimeHours = draft?.overtimeHours ?? existing?.overtimeHours ?? 0;
        const advanceDeduction =
          draft?.advanceDeduction ?? existing?.advanceDeduction ?? 0;
        const tdsOverride =
          draft?.tdsOverride !== undefined
            ? draft.tdsOverride
            : existing?.tdsDeduction ?? emp.tdsDeduction;

        const overtimePay = Math.round(
          ((emp.basicSalary || 0) / 240) * 1.5 * overtimeHours
        );

        const calc = calculateIndianStatutoryPayroll({
          employee: emp,
          payrollMonth: selectedMonth,
          workingDays,
          unpaidLeaveDays: leaveDays,
          overtimeHours,
          overtimePay,
          advanceDeduction,
          tdsOverride,
          applyAutoPf12,
          capPfAt15k,
          applyAutoEsic,
          applyAutoPt,
        });

        return {
          id: existing?.id || `pay_${emp.id}_${selectedMonth}`,
          payrollMonth: selectedMonth,
          employeeId: emp.id,
          employeeName: emp.name,
          employeeCode: emp.employeeCode,
          designation: emp.designation,
          department: emp.department,
          workingDays: calc.workingDays,
          presentDays: calc.presentDays,
          leaveDays: calc.leaveDays,
          overtimeHours,
          overtimePay: calc.overtimePay,
          basicSalary: calc.earnedBasic,
          hra: calc.earnedHra,
          conveyanceAllowance: calc.earnedConveyance,
          specialAllowance: calc.earnedSpecial,
          grossSalary: calc.grossSalary,
          pfDeduction: calc.pfDeduction,
          pfEmployerContribution: calc.pfEmployerContribution,
          esiDeduction: calc.esiDeduction,
          esicEmployerContribution: calc.esicEmployerContribution,
          professionalTax: calc.professionalTax,
          tdsDeduction: calc.tdsDeduction,
          advanceDeduction: calc.advanceDeduction,
          leaveDeduction: calc.leaveDeduction,
          otherDeductions: calc.advanceDeduction,
          totalDeductions: calc.totalDeductions,
          netSalary: calc.netSalary,
          paymentStatus: settlementMode === 'PAYABLE' ? ('PENDING' as const) : ('PAID' as const),
          paymentDate: existing?.paymentDate || new Date().toISOString().split('T')[0],
          paymentMode:
            settlementMode === 'CASH'
              ? 'CASH'
              : settlementMode === 'BANK'
              ? 'BANK_TRANSFER'
              : 'ACCRUED_PAYABLE',
          settlementMode,
          settlementAccountId: settlementAcc?.id,
          postedVoucherId: existing?.postedVoucherId,
          postedVoucherNo: existing?.postedVoucherNo,
          paymentVoucherId: existing?.paymentVoucherId,
          paymentVoucherNo: existing?.paymentVoucherNo,
        } satisfies PayrollRecord;
      });
  }, [
    employees,
    payrolls,
    selectedMonth,
    draftPayrolls,
    applyAutoPf12,
    capPfAt15k,
    applyAutoEsic,
    applyAutoPt,
    settlementMode,
    settlementAccountId,
    data.accounts,
  ]);

  const totalMonthlyPayout = monthPayrolls.reduce((sum, p) => sum + p.netSalary, 0);
  const totalMonthlyStatutory = monthPayrolls.reduce(
    (sum, p) => sum + p.pfDeduction + p.esiDeduction + (p.professionalTax || 0) + p.tdsDeduction,
    0
  );
  const totalMonthlyAdvance = monthPayrolls.reduce((sum, p) => sum + (p.advanceDeduction || 0), 0);
  const monthPostedCount = monthPayrolls.filter((p) => Boolean(p.postedVoucherId || p.voucherId)).length;

  const handleSettlementModeChange = (mode: 'PAYABLE' | 'BANK' | 'CASH') => {
    setSettlementMode(mode);
    if (mode === 'BANK') {
      setSettlementAccountId(bankLedgers[0]?.id || '');
    } else if (mode === 'CASH') {
      setSettlementAccountId(cashLedgers[0]?.id || '');
    } else {
      setSettlementAccountId('');
    }
  };

  const handleSaveDraftOnly = () => {
    if (monthPayrolls.length === 0) return;
    onSavePayrollBatch(monthPayrolls, {
      postVoucher: false,
      settlementMode,
      settlementAccountId: settlementMode === 'PAYABLE' ? undefined : settlementAccountId,
    });
    setActiveTab('SLIPS');
  };

  const handleExecutePayrollBatch = () => {
    if (monthPayrolls.length === 0) return;
    onSavePayrollBatch(monthPayrolls, {
      postVoucher: true,
      settlementMode,
      settlementAccountId: settlementMode === 'PAYABLE' ? undefined : settlementAccountId,
    });
    setActiveTab('SLIPS');
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-indigo-400" />
            <span>{isHindi ? 'पेरोल एवं कर्मचारी वेतन प्रबंधन' : 'Payroll Management & Salary Slip Engine'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isHindi 
              ? 'कर्मचारियों का रिकॉर्ड, स्वचालित वेतन गणना, ईपीएफ/ईएसआई/टीडीएस कटौती एवं वेतन पर्ची प्रिंट करें'
              : 'Complete employee master, automated monthly payroll calculations, statutory deductions & printable pay slips'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {perms.canManagePayroll && (
            <button
              onClick={() => handleOpenAddEmp()}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg transition"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isHindi ? '+ नया कर्मचारी जोड़ें' : '+ Add New Employee'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('PROCESSING')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'PROCESSING'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{isHindi ? '1. मासिक पेरोल प्रोसेसिंग' : '1. Monthly Payroll Processing'}</span>
        </button>

        <button
          onClick={() => setActiveTab('SLIPS')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'SLIPS'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <FileCheck2 className="w-4 h-4" />
          <span>{isHindi ? '2. सैलरी स्लिप प्रिंट एवं देखें' : '2. Salary Slips & History'}</span>
        </button>

        <button
          onClick={() => setActiveTab('EMPLOYEES')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'EMPLOYEES'
              ? 'bg-indigo-600 text-white shadow-lg'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>{isHindi ? '3. कर्मचारी सूची (Employee Directory)' : '3. Employee Master Directory'} ({employees.length})</span>
        </button>
      </div>

      {/* TAB 1: MONTHLY PROCESSING */}
      {activeTab === 'PROCESSING' && (
        <div className="space-y-4">
          {/* Month, Statutory Switches & Settlement Controls */}
          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 space-y-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-xs text-slate-300">
                    {isHindi ? 'पेरोल माह:' : 'Payroll Month:'}
                  </span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-indigo-300 font-mono font-bold text-xs rounded-xl px-3 py-1.5 outline-none"
                  />
                </div>

                {/* Settlement Mode & Bank/Cash Picker */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-950/70 border border-slate-800 px-3 py-1.5 rounded-xl">
                  <Landmark className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-400">
                    {isHindi ? 'भुगतान खाता:' : 'Settle Via:'}
                  </span>
                  <select
                    value={settlementMode}
                    onChange={(e) => handleSettlementModeChange(e.target.value as 'PAYABLE' | 'BANK' | 'CASH')}
                    className="bg-slate-900 border border-slate-700 text-slate-100 text-xs font-bold rounded-lg px-2 py-1 outline-none"
                  >
                    <option value="BANK">{isHindi ? 'बैंक से भुगतान (Bank Payment)' : 'Bank Account Payout'}</option>
                    <option value="CASH">{isHindi ? 'नकद भुगतान (Cash in Hand)' : 'Cash Payout'}</option>
                    <option value="PAYABLE">{isHindi ? 'देय वेतन बकाया (Salary Payable)' : 'Accrue in Salary Payable'}</option>
                  </select>

                  {settlementMode !== 'PAYABLE' && (
                    <select
                      value={settlementAccountId}
                      onChange={(e) => setSettlementAccountId(e.target.value)}
                      className="bg-slate-900 border border-emerald-600/40 text-emerald-300 text-xs font-bold rounded-lg px-2 py-1 outline-none max-w-[200px]"
                    >
                      {(settlementMode === 'CASH' ? cashLedgers : bankLedgers).map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          [{acc.code}] {acc.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-between lg:justify-end">
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">
                      {isHindi ? 'वैधानिक व एडवांस कटौती' : 'Statutory & Adv.'}
                    </span>
                    <span className="text-sm font-bold text-rose-400 font-mono">
                      -₹{(totalMonthlyStatutory + totalMonthlyAdvance).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block font-bold uppercase">
                      {isHindi ? 'कुल शुद्ध वेतन देय' : 'Total Net Payout'}
                    </span>
                    <span className="text-lg font-extrabold text-emerald-400 font-mono">
                      ₹{totalMonthlyPayout.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {perms.canManagePayroll && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDraftOnly}
                      className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
                    >
                      {isHindi ? 'केवल ड्राफ्ट सेव' : 'Save Draft'}
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePayrollBatch}
                      className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
                    >
                      <BookCheck className="w-4 h-4" />
                      <span>{isHindi ? 'खातों में पेरोल पोस्ट करें' : 'Post Payroll to Accounts'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Automatic Indian Statutory Deduction Switches */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
                  {isHindi ? 'स्वचालित भारतीय कटौती:' : 'Auto Indian Statutory Rules:'}
                </span>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={applyAutoPf12}
                    onChange={(e) => setApplyAutoPf12(e.target.checked)}
                    className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
                  />
                  <span>PF 12% (Basic)</span>
                </label>

                {applyAutoPf12 && (
                  <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={capPfAt15k}
                      onChange={(e) => setCapPfAt15k(e.target.checked)}
                      className="w-3.5 h-3.5 accent-indigo-500 rounded cursor-pointer"
                    />
                    <span>PF ₹15k Ceiling</span>
                  </label>
                )}

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={applyAutoEsic}
                    onChange={(e) => setApplyAutoEsic(e.target.checked)}
                    className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                  />
                  <span>ESIC 0.75% / 3.25% (≤ ₹21k)</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-slate-200 select-none">
                  <input
                    type="checkbox"
                    checked={applyAutoPt}
                    onChange={(e) => setApplyAutoPt(e.target.checked)}
                    className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                  />
                  <span>Prof. Tax (PT Slab)</span>
                </label>
              </div>

              {monthPostedCount > 0 && (
                <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-lg">
                  {isHindi
                    ? `${monthPostedCount} कर्मचारी खातों में पोस्टेड`
                    : `${monthPostedCount} Posted to Accounts`}
                </span>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                    <th className="p-3">Employee</th>
                    <th className="p-3 text-center">Working / LOP Days</th>
                    <th className="p-3 text-right">Earned Gross</th>
                    <th className="p-3 text-right">PF (12%) + ESIC</th>
                    <th className="p-3 text-right">PT + TDS</th>
                    <th className="p-3 text-right">Advance Ded.</th>
                    <th className="p-3 text-right font-extrabold text-emerald-400">Net Salary</th>
                    <th className="p-3 text-center">Salary Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {monthPayrolls.map((pay) => {
                    const draft = draftPayrolls[pay.employeeId];
                    const curWorkingDays = draft?.workingDays ?? pay.workingDays ?? 26;
                    const curLeaveDays = draft?.leaveDays ?? pay.leaveDays ?? 0;
                    const curAdvance = draft?.advanceDeduction ?? pay.advanceDeduction ?? 0;
                    const curTds = draft?.tdsOverride ?? pay.tdsDeduction ?? 0;
                    const updateDraft = (patch: Partial<NonNullable<typeof draft>>) => {
                      setDraftPayrolls((prev) => ({
                        ...prev,
                        [pay.employeeId]: {
                          workingDays: prev[pay.employeeId]?.workingDays ?? curWorkingDays,
                          leaveDays: prev[pay.employeeId]?.leaveDays ?? curLeaveDays,
                          overtimeHours: prev[pay.employeeId]?.overtimeHours ?? pay.overtimeHours ?? 0,
                          advanceDeduction: prev[pay.employeeId]?.advanceDeduction ?? curAdvance,
                          tdsOverride: prev[pay.employeeId]?.tdsOverride ?? curTds,
                          ...patch,
                        },
                      }));
                    };

                    return (
                      <tr key={pay.id} className="hover:bg-slate-800/40 font-mono">
                        <td className="p-3 font-sans">
                          <strong className="text-slate-100 block font-bold">{pay.employeeName}</strong>
                          <span className="text-[10px] text-indigo-400 block">
                            {pay.employeeCode} • {pay.designation}
                          </span>
                          {(pay.postedVoucherNo || pay.paymentVoucherNo) && (
                            <span className="text-[10px] text-emerald-400 font-mono block mt-0.5">
                              GL: {pay.postedVoucherNo || ''}{pay.paymentVoucherNo ? ` • ${pay.paymentVoucherNo}` : ''}
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-center font-sans">
                          <div className="inline-flex items-center gap-1.5">
                            <input
                              type="number"
                              min="1"
                              max="31"
                              disabled={!perms.canManagePayroll}
                              value={curWorkingDays}
                              onChange={(e) =>
                                updateDraft({
                                  workingDays: Math.max(1, Math.min(31, parseInt(e.target.value, 10) || 26)),
                                })
                              }
                              title="Working Days"
                              className="w-12 bg-slate-950 border border-slate-700 text-center font-bold text-slate-200 rounded px-1 py-1 outline-none disabled:opacity-60"
                            />
                            <span className="text-[10px] text-slate-500">LOP:</span>
                            <input
                              type="number"
                              min="0"
                              max={curWorkingDays}
                              step="0.5"
                              disabled={!perms.canManagePayroll}
                              value={curLeaveDays}
                              onChange={(e) =>
                                updateDraft({
                                  leaveDays: Math.max(0, Math.min(curWorkingDays, Number(e.target.value) || 0)),
                                })
                              }
                              title="Unpaid Leave / LOP Days"
                              className="w-12 bg-slate-950 border border-amber-600/50 text-center font-bold text-amber-300 rounded px-1 py-1 outline-none disabled:opacity-60"
                            />
                          </div>
                          {(pay.leaveDeduction || 0) > 0 && (
                            <span className="text-[10px] text-amber-400 block mt-0.5 font-mono">
                              -{currency} {(pay.leaveDeduction || 0).toLocaleString('en-IN')} LOP
                            </span>
                          )}
                        </td>

                        <td className="p-3 text-right font-bold text-slate-100">
                          ₹{pay.grossSalary.toLocaleString('en-IN')}
                        </td>

                        <td className="p-3 text-right">
                          <div className="font-bold text-rose-300">
                            -₹{(pay.pfDeduction + pay.esiDeduction).toLocaleString('en-IN')}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            PF: ₹{pay.pfDeduction.toLocaleString('en-IN')} | ESI: ₹{pay.esiDeduction.toLocaleString('en-IN')}
                          </div>
                          {(pay.esicEmployerContribution || 0) > 0 && (
                            <div className="text-[10px] text-indigo-300">
                              Er ESIC (3.25%): ₹{(pay.esicEmployerContribution || 0).toLocaleString('en-IN')}
                            </div>
                          )}
                        </td>

                        <td className="p-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            <span className="text-[10px] text-slate-400">PT: ₹{pay.professionalTax || 0}</span>
                            <span className="text-slate-600">|</span>
                            <span className="text-[10px] text-slate-400">TDS:</span>
                            <input
                              type="number"
                              min="0"
                              disabled={!perms.canManagePayroll}
                              value={curTds || ''}
                              placeholder="0"
                              onChange={(e) =>
                                updateDraft({ tdsOverride: Math.max(0, Number(e.target.value) || 0) })
                              }
                              className="w-16 bg-slate-950 border border-slate-700 text-right font-bold text-rose-300 rounded px-1.5 py-0.5 outline-none"
                            />
                          </div>
                        </td>

                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            disabled={!perms.canManagePayroll}
                            value={curAdvance || ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateDraft({ advanceDeduction: Math.max(0, Number(e.target.value) || 0) })
                            }
                            className="w-20 bg-slate-950 border border-slate-700 text-right font-bold text-rose-300 rounded px-2 py-1 outline-none disabled:opacity-60"
                          />
                        </td>

                        <td className="p-3 text-right font-extrabold text-emerald-400 text-sm">
                          ₹{pay.netSalary.toLocaleString('en-IN')}
                        </td>

                        <td className="p-3 text-center font-sans">
                          {perms.canExportData ? (
                            <button
                              onClick={() => setSelectedSlipPayroll(pay)}
                              className="bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-500/30 px-3 py-1 rounded-lg text-[11px] font-bold transition flex items-center gap-1 mx-auto cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>View Slip</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SALARY SLIPS & HISTORY */}
      {activeTab === 'SLIPS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search salary slips by employee name or month..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950 border-b border-slate-800 text-slate-400 font-bold uppercase text-[11px]">
                    <th className="p-3">Month</th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">GL Ref</th>
                    <th className="p-3 text-right">Gross Salary</th>
                    <th className="p-3 text-right">Deductions</th>
                    <th className="p-3 text-right">Net Payable</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono">
                  {filteredPayrolls.length > 0 ? (
                    filteredPayrolls.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-800/40">
                        <td className="p-3 font-bold text-indigo-300">{p.payrollMonth}</td>
                        <td className="p-3 font-sans font-bold text-slate-100">
                          <div>{p.employeeName}</div>
                          <span className="text-[10px] text-slate-400 font-normal">{p.designation}</span>
                        </td>
                        <td className="p-3 text-slate-400">{p.employeeCode}</td>
                        <td className="p-3 text-[11px]">
                          {p.postedVoucherNo || p.paymentVoucherNo ? (
                            <div className="text-emerald-300 space-y-0.5">
                              {p.postedVoucherNo && <div>{p.postedVoucherNo}</div>}
                              {p.paymentVoucherNo && <div className="text-sky-300">{p.paymentVoucherNo}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-500 font-sans">Draft Only</span>
                          )}
                        </td>
                        <td className="p-3 text-right font-bold text-slate-100">₹{p.grossSalary.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right text-rose-400">-₹{p.totalDeductions.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-right font-extrabold text-emerald-400">₹{p.netSalary.toLocaleString('en-IN')}</td>
                        <td className="p-3 text-center font-sans">
                          <span className={`border text-[10px] font-bold px-2 py-0.5 rounded ${
                            p.paymentStatus === 'PAID'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                          }`}>
                            {p.paymentStatus}
                          </span>
                        </td>
                        <td className="p-3 text-center font-sans">
                          {perms.canExportData ? (
                            <button
                              onClick={() => setSelectedSlipPayroll(p)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow transition flex items-center gap-1.5 mx-auto cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>Print Salary Slip</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                        No processed payroll slips found for selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: EMPLOYEES DIRECTORY */}
      {activeTab === 'EMPLOYEES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search staff directory..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-4 py-2 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEmployees.map((emp) => (
              <div key={emp.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg hover:border-slate-700 transition">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-100">{emp.name}</h4>
                    <p className="text-xs text-indigo-400 font-mono font-semibold">{emp.employeeCode} • {emp.designation}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{emp.department}</p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {perms.canManagePayroll && (
                      <button
                        onClick={() => handleOpenAddEmp(emp)}
                        className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
                        title={isHindi ? 'कर्मचारी विवरण बदलें' : 'Edit Employee'}
                      >
                        <Edit className="w-4 h-4 text-amber-400" />
                      </button>
                    )}

                    {onDeleteEmployee && perms.canDeleteRecords && (
                      <button
                        onClick={() => {
                          onDeleteEmployee(emp.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-800 hover:bg-rose-950/60 rounded-lg transition"
                        title={isHindi ? 'कर्मचारी हटाएँ' : 'Delete Employee'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-xl border border-slate-800/80 grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Basic Pay:</span>
                    <strong className="text-slate-200 font-mono">₹{emp.basicSalary.toLocaleString('en-IN')}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block">HRA Allowance:</span>
                    <strong className="text-slate-200 font-mono">₹{emp.hra.toLocaleString('en-IN')}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block">PAN Number:</span>
                    <strong className="text-indigo-300 font-mono">{emp.pan || 'N/A'}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block">Aadhaar Number:</span>
                    <strong className="text-amber-300 font-mono">{emp.aadhaar || 'N/A'}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block">Bank Account:</span>
                    <strong className="text-slate-300 font-mono">{emp.bankAccountNo ? '••••' + emp.bankAccountNo.slice(-4) : 'N/A'}</strong>
                  </div>

                  <div>
                    <span className="text-slate-500 block">PF Deduction:</span>
                    <strong className="text-rose-400 font-mono">₹{emp.pfDeduction.toLocaleString('en-IN')}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showAddEmpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
            <div className="bg-slate-950 px-4 sm:px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <span>{editingEmp ? (isHindi ? 'कर्मचारी विवरण बदलें (Edit Employee)' : 'Edit Employee Details') : (isHindi ? 'नया कर्मचारी मास्टर जोड़ें (Add Employee)' : 'Add New Employee Master')}</span>
              </h3>

              <button onClick={() => setShowAddEmpModal(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployeeForm} className="p-4 sm:p-6 space-y-5 text-xs overflow-y-auto flex-1">
              {/* Section 1: Basic & Position Info */}
              <div>
                <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-800 flex items-center justify-between">
                  <span>1. Employee Information (कर्मचारी प्राथमिक जानकारी)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Full Employee Name *</label>
                    <input
                      type="text"
                      required
                      value={empName}
                      onChange={(e) => setEmpName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Employee Code</label>
                    <input
                      type="text"
                      value={empCode}
                      onChange={(e) => setEmpCode(e.target.value)}
                      placeholder="Auto / e.g. EMP-001"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-indigo-300 font-mono font-bold outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Designation</label>
                    <input
                      type="text"
                      value={empDesignation}
                      onChange={(e) => setEmpDesignation(e.target.value)}
                      placeholder="e.g. Senior Accountant"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Department</label>
                    <select
                      value={empDepartment}
                      onChange={(e) => setEmpDepartment(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white outline-none"
                    >
                      <option value="">-- Select Department --</option>
                      <option value="Finance & Accounts">Finance & Accounts</option>
                      <option value="Sales & Marketing">Sales & Marketing</option>
                      <option value="Operations & Billing">Operations & Billing</option>
                      <option value="Human Resources">Human Resources</option>
                      <option value="Administration">Administration</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Bank & Identification */}
              <div>
                <h4 className="text-xs font-extrabold text-indigo-400 uppercase tracking-wider mb-2 pb-1 border-b border-slate-800">
                  2. Bank & ID Registration (बैंक व पहचान संख्या)
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Bank Name & IFSC Code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Bank Name"
                        value={empBankName}
                        onChange={(e) => setEmpBankName(e.target.value)}
                        className="w-1/2 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-white outline-none"
                      />
                      <input
                        type="text"
                        placeholder="IFSC Code"
                        value={empIfsc}
                        onChange={(e) => setEmpIfsc(e.target.value.toUpperCase())}
                        className="w-1/2 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-2 text-indigo-300 font-mono outline-none uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Bank Account Number</label>
                    <input
                      type="text"
                      placeholder="Account Number"
                      value={empAccountNo}
                      onChange={(e) => setEmpAccountNo(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">PAN Number (पैन कार्ड)</label>
                    <input
                      type="text"
                      value={empPan}
                      onChange={(e) => setEmpPan(e.target.value.toUpperCase())}
                      placeholder="e.g. ABCDE1234F"
                      maxLength={10}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-indigo-300 font-mono font-bold outline-none uppercase placeholder:normal-case"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-bold">Aadhaar Number (आधार नंबर)</label>
                    <input
                      type="text"
                      value={empAadhaar}
                      onChange={(e) => setEmpAadhaar(e.target.value)}
                      placeholder="e.g. 1234 5678 9012"
                      maxLength={14}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-amber-300 font-mono font-bold outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Earnings Breakdown (Fully Customizable) */}
              <div className="bg-emerald-950/20 border border-emerald-900/50 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-900/60 pb-1.5">
                  <h4 className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>3. Earnings Structure / भत्ते व कमाई (Full Options)</span>
                  </h4>
                  <span className="text-[10px] text-emerald-300 font-mono font-bold">
                    Gross: ₹{(empBasic + empHra + empConveyance + empSpecial).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-emerald-200 mb-1 font-bold">Basic Monthly Salary (बेसिक वेतन) ₹ *</label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={empBasic || ''}
                      placeholder="0"
                      onChange={(e) => setEmpBasic(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-emerald-700/80 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-emerald-200 mb-1 font-bold">HRA Allowance (घर का किराया भत्ता) ₹</label>
                    <input
                      type="number"
                      min="0"
                      value={empHra || ''}
                      onChange={(e) => setEmpHra(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-emerald-700/80 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-emerald-200 mb-1 font-bold">Conveyance Allowance (यात्रा भत्ता) ₹</label>
                    <input
                      type="number"
                      min="0"
                      value={empConveyance || ''}
                      onChange={(e) => setEmpConveyance(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-emerald-700/80 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold outline-none focus:border-emerald-400"
                    />
                  </div>

                  <div>
                    <label className="block text-emerald-200 mb-1 font-bold">Special / Other Allowance (विशेष भत्ता) ₹</label>
                    <input
                      type="number"
                      min="0"
                      value={empSpecial || ''}
                      onChange={(e) => setEmpSpecial(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-emerald-700/80 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold outline-none focus:border-emerald-400"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Deductions Breakdown (Fully Customizable - TDS, PF, ESI) */}
              <div className="bg-rose-950/20 border border-rose-900/50 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-rose-900/60 pb-1.5">
                  <h4 className="text-xs font-extrabold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>4. Deductions Structure / कटौती विवरण (0 if No Deduction)</span>
                  </h4>
                  <span className="text-[10px] text-rose-300 font-mono font-bold">
                    Total Deductions: ₹{(empPf + empEsi + empTds).toLocaleString('en-IN')}
                  </span>
                </div>

                <p className="text-[10px] text-slate-400 italic">
                  नोट: यदि आप कर्मचारी से TDS, PF या ESI नहीं काटना चाहते हैं, तो मान 0 रखें। बिना किसी कटौती के पूरा बेसिक वेतन पे किया जा सकता है।
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-rose-200 mb-1 font-bold">PF Deduction (पीएफ कटौती) ₹</label>
                    <input
                      type="number"
                      min="0"
                      value={empPf || ''}
                      onChange={(e) => setEmpPf(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-rose-700/80 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-rose-200 mb-1 font-bold">ESI Deduction (ईएसआई कटौती) ₹</label>
                    <input
                      type="number"
                      min="0"
                      value={empEsi || ''}
                      onChange={(e) => setEmpEsi(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-rose-700/80 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold outline-none focus:border-rose-400"
                    />
                  </div>

                  <div>
                    <label className="block text-rose-200 mb-1 font-bold">TDS / Income Tax Deduction ₹</label>
                    <input
                      type="number"
                      min="0"
                      value={empTds || ''}
                      onChange={(e) => setEmpTds(Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-rose-700/80 rounded-xl px-3 py-2 text-rose-300 font-mono font-bold outline-none focus:border-rose-400"
                    />
                  </div>
                </div>
              </div>

              {/* Calculated Summary Bar */}
              <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-400 text-[10px] block font-bold uppercase">Resulting Monthly Net Salary</span>
                  <span className="text-emerald-400 font-mono font-extrabold text-base">
                    ₹{((empBasic + empHra + empConveyance + empSpecial) - (empPf + empEsi + empTds)).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  <span>Gross: ₹{(empBasic + empHra + empConveyance + empSpecial).toLocaleString('en-IN')}</span>
                  <span className="mx-1 text-slate-600">|</span>
                  <span className="text-rose-400">Deductions: ₹{(empPf + empEsi + empTds).toLocaleString('en-IN')}</span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold rounded-xl shadow-lg transition"
                >
                  Save Employee Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Salary Slip Print Modal */}
      {selectedSlipPayroll && (
        <SalarySlipModal
          company={data.company}
          payroll={selectedSlipPayroll}
          employee={employees.find(e => e.id === selectedSlipPayroll.employeeId)}
          isHindi={isHindi}
          currency={currency}
          onClose={() => setSelectedSlipPayroll(null)}
        />
      )}
    </div>
  );
};
