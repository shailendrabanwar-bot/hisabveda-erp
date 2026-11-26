import React, { useState, useEffect } from 'react';
import { X, Printer, Download, Building2, FileCheck, Calendar, Sliders, Loader2, CheckCircle2 } from 'lucide-react';
import { CompanyDetails, Employee, PayrollRecord } from '../../types';
import { numberToIndianWords } from '../../utils/numberToWords';
import { AppConfiguration, loadAppConfig } from '../../utils/appConfig';
import { printDomElement } from '../../utils/printReport';
import { exportElementToPdf } from '../../utils/pdfExport';
import {
  PrintConfigPanel,
  getPaperPaddingClass,
  getPaperWidthClass
} from '../Common/PrintConfigPanel';

const formatSalaryMonth = (rawMonth: string) => {
  if (!rawMonth) return { display: 'N/A', eng: 'N/A', hindi: 'N/A' };

  if (/^\d{4}-\d{2}$/.test(rawMonth.trim())) {
    const [year, month] = rawMonth.trim().split('-');
    const monthNum = parseInt(month, 10);
    const date = new Date(parseInt(year, 10), monthNum - 1, 1);
    const monthNameEng = date.toLocaleString('en-US', { month: 'long' });
    const hindiMonths: Record<string, string> = {
      '01': 'जनवरी', '02': 'फरवरी', '03': 'मार्च', '04': 'अप्रैल',
      '05': 'मई', '06': 'जून', '07': 'जुलाई', '08': 'अगस्त',
      '09': 'सितंबर', '10': 'अक्टूबर', '11': 'नवंबर', '12': 'दिसंबर'
    };
    const monthNameHindi = hindiMonths[month] || monthNameEng;
    return {
      eng: `${monthNameEng} ${year}`,
      hindi: `${monthNameHindi} ${year}`,
      display: `${monthNameEng} ${year} (${monthNameHindi} ${year})`
    };
  }
  return { display: rawMonth, eng: rawMonth, hindi: rawMonth };
};

interface SalarySlipModalProps {
  company: CompanyDetails;
  payroll: PayrollRecord;
  employee?: Employee;
  isHindi: boolean;
  currency: string;
  onClose: () => void;
}

export const SalarySlipModal: React.FC<SalarySlipModalProps> = ({
  company,
  payroll,
  employee,
  isHindi,
  onClose
}) => {
  const [printConfig, setPrintConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncConfig = () => setPrintConfig(loadAppConfig());
    window.addEventListener('sna_config_updated', syncConfig);
    return () => window.removeEventListener('sna_config_updated', syncConfig);
  }, []);

  const monthInfo = formatSalaryMonth(payroll.payrollMonth);
  const grossEarnings = payroll.grossSalary || (payroll.basicSalary + payroll.hra + payroll.conveyanceAllowance + payroll.specialAllowance + (payroll.overtimePay || 0));
  const professionalTax = Number(payroll.professionalTax || 0);
  const advanceDeduction = Number(payroll.advanceDeduction || 0);
  const otherDedOnly = Number(payroll.otherDeductions || 0);
  const effectiveAdvanceAndOther = advanceDeduction > 0 ? advanceDeduction : otherDedOnly;
  const totalDeductions =
    payroll.totalDeductions ||
    (payroll.pfDeduction + payroll.esiDeduction + professionalTax + payroll.tdsDeduction + effectiveAdvanceAndOther);
  const netPay = payroll.netSalary || (grossEarnings - totalDeductions);

  const fontScaleStyle =
    printConfig.printFontScale === 'compact'
      ? { fontSize: '92%' }
      : printConfig.printFontScale === 'large'
      ? { fontSize: '108%' }
      : undefined;

  const handlePrint = () => {
    printDomElement('salary-slip-document', {
      paperSize: printConfig.defaultPaperSize,
      orientation: printConfig.printOrientation,
      marginMode: printConfig.printMargins,
      title: `Salary_Slip_${payroll.employeeName}_${payroll.payrollMonth}`
    });
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    const ok = await exportElementToPdf('salary-slip-document', {
      filename: `Salary_Slip_${payroll.employeeName}_${payroll.payrollMonth}`,
      paperSize: printConfig.defaultPaperSize,
      orientation: printConfig.printOrientation,
      marginMode: printConfig.printMargins,
      scale: 2
    });
    setIsDownloadingPdf(false);
    if (ok) {
      setPdfNotice(isHindi ? 'PDF सफलतापूर्वक डाउनलोड हो गया!' : 'PDF downloaded successfully!');
      setTimeout(() => setPdfNotice(null), 3000);
    } else {
      handlePrint();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`print-preview-dialog bg-slate-900 border border-slate-800 rounded-2xl w-full ${printConfig.printOrientation === 'landscape' ? 'max-w-4xl' : 'max-w-3xl'} max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto`}>
        {/* Modal Top Actions */}
        <div className="bg-slate-950 px-4 sm:px-6 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 no-print">
          <div className="flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-sm text-slate-100">
              {isHindi ? `कर्मचारी वेतन पर्ची - ${monthInfo.hindi}` : `Employee Salary Pay Slip - ${monthInfo.eng}`}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowConfigPanel((prev) => !prev)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition cursor-pointer ${
                showConfigPanel
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-slate-900 hover:bg-slate-700 text-slate-200 border-slate-600'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isHindi ? 'प्रिंट सेटिंग्स' : 'Print Config'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition shadow cursor-pointer disabled:opacity-60"
            >
              {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isDownloadingPdf ? (isHindi ? 'PDF बन रहा है...' : 'Saving PDF...') : (isHindi ? 'PDF डाउनलोड' : 'Download PDF')}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2 rounded-xl transition shadow cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isHindi ? 'प्रिंट करें' : 'Print'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 hover:bg-slate-800 rounded-xl transition cursor-pointer"
              title={isHindi ? 'बंद करें' : 'Close'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {showConfigPanel && (
          <PrintConfigPanel
            config={printConfig}
            onChange={setPrintConfig}
            isHindi={isHindi}
            docKind="salary"
          />
        )}

        {pdfNotice && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center gap-2 shrink-0 no-print">
            <CheckCircle2 className="w-4 h-4" />
            <span>{pdfNotice}</span>
          </div>
        )}

        {/* Printable Salary Slip Document Container */}
        <div className="overflow-y-auto flex-1 bg-slate-950/60">
          <div
            className={`bg-white text-slate-900 font-sans text-xs space-y-6 print:p-0 print:m-0 ${getPaperPaddingClass(printConfig.printMargins)} ${getPaperWidthClass(printConfig.defaultPaperSize, printConfig.printOrientation)}`}
            style={fontScaleStyle}
            id="salary-slip-document"
          >
            {/* Company Branding & Slip Title */}
            <div className="border-b-2 border-indigo-900 pb-4 flex justify-between items-start gap-4">
              <div className="flex items-center gap-3">
                {printConfig.showCompanyLogoOnPrint && (
                  company.logoUrl ? (
                    <img
                      src={company.logoUrl}
                      alt={company.name}
                      className="max-h-16 max-w-[160px] object-contain rounded"
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-indigo-900 shrink-0" />
                  )
                )}
                <div>
                  <h1 className="text-xl font-extrabold text-indigo-950 tracking-tight">{company.name}</h1>
                  <p className="text-slate-600 text-[11px] font-medium max-w-md mt-1">
                    {company.address} {company.city ? `, ${company.city}` : ''} {company.state ? `, ${company.state}` : ''} {company.pincode ? `- ${company.pincode}` : ''}
                  </p>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    GSTIN: <strong className="text-slate-800">{company.gstin || 'N/A'}</strong> | PAN: <strong className="text-slate-800">{company.pan || 'N/A'}</strong>
                  </p>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="inline-block bg-indigo-900 text-white font-extrabold px-3 py-1.5 text-xs rounded-lg shadow-sm">
                  SALARY SLIP FOR: {monthInfo.eng.toUpperCase()}
                </span>
                <p className="text-[10px] text-slate-700 font-bold mt-1">वेतन माह: {monthInfo.hindi}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">Generated On: {payroll.paymentDate || new Date().toISOString().split('T')[0]}</p>
              </div>
            </div>

            {/* Employee Master Metadata Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-[11px]">
              <div className="col-span-2 sm:col-span-1 bg-indigo-50 border border-indigo-200 p-2 rounded-lg">
                <span className="text-indigo-900 font-bold block text-[10px] uppercase flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-700 shrink-0" />
                  <span>Salary Month / माह</span>
                </span>
                <strong className="text-indigo-950 font-black text-xs block mt-0.5">{monthInfo.eng}</strong>
                <span className="text-indigo-800 font-bold text-[10px] block">{monthInfo.hindi}</span>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Employee Name</span>
                <strong className="text-slate-900 font-bold text-xs">{payroll.employeeName}</strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Employee Code</span>
                <strong className="text-indigo-900 font-mono font-bold">{payroll.employeeCode}</strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Designation</span>
                <strong className="text-slate-800">{payroll.designation}</strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Department</span>
                <strong className="text-slate-800">{payroll.department}</strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Bank Name</span>
                <strong className="text-slate-800">{employee?.bankName || 'HDFC Bank'}</strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Bank Account No</span>
                <strong className="text-slate-800 font-mono">{employee?.bankAccountNo || 'XXXXXXXX1234'}</strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">PAN / Aadhaar No</span>
                <strong className="text-slate-800 font-mono text-[10px] block">
                  {employee?.pan ? `PAN: ${employee.pan}` : 'PAN: N/A'}
                  {employee?.aadhaar ? ` | Aadhaar: ${employee.aadhaar}` : ''}
                </strong>
              </div>

              <div>
                <span className="text-slate-500 font-medium block">Days (Working / Paid)</span>
                <strong className="text-emerald-700 font-bold">{payroll.presentDays} / {payroll.workingDays} Days</strong>
              </div>
            </div>

            {/* Earnings vs Deductions Table */}
            <div className="border border-slate-300 rounded-xl overflow-hidden">
              <div className="grid grid-cols-2 bg-indigo-950 text-white text-[11px] font-bold">
                <div className="p-2.5 uppercase border-r border-indigo-800">Earnings Particulars</div>
                <div className="p-2.5 uppercase">Deductions Particulars</div>
              </div>

              <div className="grid grid-cols-2 divide-x divide-slate-200 text-[11px]">
                {/* Earnings Column */}
                <div className="p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-700 font-semibold">Basic Salary</span>
                    <span className="font-mono font-bold text-slate-900">₹{payroll.basicSalary.toLocaleString('en-IN')}</span>
                  </div>
                  {payroll.hra > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">House Rent Allowance (HRA)</span>
                      <span className="font-mono font-bold text-slate-800">₹{payroll.hra.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {payroll.conveyanceAllowance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Conveyance Allowance</span>
                      <span className="font-mono font-bold text-slate-800">₹{payroll.conveyanceAllowance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {payroll.specialAllowance > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Special / Other Allowance</span>
                      <span className="font-mono font-bold text-slate-800">₹{payroll.specialAllowance.toLocaleString('en-IN')}</span>
                    </div>
                  )}
                  {Boolean(payroll.overtimePay && payroll.overtimePay > 0) && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">Overtime Pay ({payroll.overtimeHours || 0} hrs)</span>
                      <span className="font-mono font-bold text-slate-800">₹{(payroll.overtimePay || 0).toLocaleString('en-IN')}</span>
                    </div>
                  )}
                </div>

                {/* Deductions Column */}
                <div className="p-3 space-y-2">
                  {totalDeductions === 0 ? (
                    <div className="py-2 text-center text-slate-500 font-medium italic">
                      <span>Nil / No Deductions (कोई कटौती नहीं)</span>
                      <p className="font-mono text-emerald-700 font-bold mt-1">₹0.00</p>
                    </div>
                  ) : (
                    <>
                      {payroll.pfDeduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Employee EPF (12%)</span>
                          <span className="font-mono font-bold text-rose-700">₹{payroll.pfDeduction.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {payroll.esiDeduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Employee ESIC (0.75%)</span>
                          <span className="font-mono font-bold text-rose-700">₹{payroll.esiDeduction.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {professionalTax > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Professional Tax (PT)</span>
                          <span className="font-mono font-bold text-rose-700">₹{professionalTax.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {payroll.tdsDeduction > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Tax Deducted at Source (TDS)</span>
                          <span className="font-mono font-bold text-rose-700">₹{payroll.tdsDeduction.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {effectiveAdvanceAndOther > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">Salary Advance / Other Ded.</span>
                          <span className="font-mono font-bold text-rose-700">₹{effectiveAdvanceAndOther.toLocaleString('en-IN')}</span>
                        </div>
                      )}
                      {Boolean(payroll.leaveDeduction && payroll.leaveDeduction > 0) && (
                        <div className="flex justify-between text-[10px] text-amber-800 pt-1 border-t border-slate-200">
                          <span>LOP / Leave Adjusted ({payroll.leaveDays} days)</span>
                          <span className="font-mono font-semibold">-₹{(payroll.leaveDeduction || 0).toLocaleString('en-IN')}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Totals Header */}
              <div className="grid grid-cols-2 bg-slate-100 border-t border-slate-300 font-bold text-xs p-2.5">
                <div className="flex justify-between pr-4 border-r border-slate-300">
                  <span>Total Gross Earnings (A):</span>
                  <span className="font-mono text-emerald-800">₹{grossEarnings.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between pl-4">
                  <span>Total Deductions (B):</span>
                  <span className="font-mono text-rose-800">₹{totalDeductions.toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>

            {((payroll.pfEmployerContribution || 0) > 0 || (payroll.esicEmployerContribution || 0) > 0) && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-700">
                <span className="font-bold uppercase text-slate-600">Employer Statutory Contribution (CTC):</span>
                <div className="font-mono font-semibold flex items-center gap-3">
                  {(payroll.pfEmployerContribution || 0) > 0 && (
                    <span>Employer EPF (12%): ₹{(payroll.pfEmployerContribution || 0).toLocaleString('en-IN')}</span>
                  )}
                  {(payroll.esicEmployerContribution || 0) > 0 && (
                    <span>Employer ESIC (3.25%): ₹{(payroll.esicEmployerContribution || 0).toLocaleString('en-IN')}</span>
                  )}
                </div>
              </div>
            )}

            {/* Net Payable Highlight Banner */}
            <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div>
                <span className="text-indigo-900 font-extrabold uppercase text-[11px] block tracking-wide">Net Salary Payable (A - B)</span>
                <p className="text-xs font-semibold text-slate-700 mt-0.5 capitalize">
                  Amount in Words: <strong className="text-indigo-950 font-bold">{numberToIndianWords(netPay)}</strong>
                </p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-2xl font-black text-indigo-950 font-mono">
                  ₹{netPay.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Ledger Accounting Verification Badge */}
            <div className={`border rounded-lg p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium ${
              payroll.postedVoucherNo || payroll.paymentVoucherNo
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}>
              <span className="flex items-center gap-1.5 font-bold">
                <span className={`w-2 h-2 rounded-full ${
                  payroll.postedVoucherNo || payroll.paymentVoucherNo ? 'bg-emerald-500' : 'bg-amber-500'
                }`}></span>
                <span>General Ledger Status:</span>
              </span>
              <span className="font-mono text-[10px]">
                {payroll.postedVoucherNo || payroll.paymentVoucherNo
                  ? `Posted: ${payroll.postedVoucherNo || ''}${payroll.paymentVoucherNo ? ` | Payout: ${payroll.paymentVoucherNo}` : ' (Salary Payable)'}`
                  : 'Draft Slip (Click "Post Payroll to Accounts" to generate GL vouchers)'}
              </span>
            </div>

            {/* Verification Footnote & Signatures */}
            <div className="pt-8 border-t border-slate-200 flex justify-between items-end text-[10px] text-slate-500 footer">
              <div>
                <p className="italic">This is a computer-generated salary slip and requires authorized signature.</p>
                <p className="mt-1">Mode of Payment: <strong className="text-slate-800">{payroll.paymentMode || 'BANK_TRANSFER'}</strong></p>
              </div>

              {printConfig.showAuthorizedSignatory && (
                <div className="text-center space-y-8">
                  <div className="w-36 border-b border-slate-400"></div>
                  <p className="font-bold text-slate-800 uppercase text-[10px]">Authorized Signatory</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
