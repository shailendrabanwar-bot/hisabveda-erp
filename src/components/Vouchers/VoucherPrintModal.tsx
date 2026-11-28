import React, { useState, useEffect } from 'react';
import { Printer, X, Building2, CheckCircle2, Download, Sliders, Loader2 } from 'lucide-react';
import { AppData, Voucher } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { AppConfiguration, loadAppConfig } from '../../utils/appConfig';
import { printDomElement } from '../../utils/printReport';
import { exportElementToPdf } from '../../utils/pdfExport';
import {
  PrintConfigPanel,
  getPaperPaddingClass,
  getPaperWidthClass,
  getPrintCopyBadgeText
} from '../Common/PrintConfigPanel';

interface VoucherPrintModalProps {
  voucher: Voucher;
  data: AppData;
  isHindi: boolean;
  onClose: () => void;
}

export const VoucherPrintModal: React.FC<VoucherPrintModalProps> = ({
  voucher,
  data,
  isHindi,
  onClose
}) => {
  const currency = data.company.currency;
  const [printConfig, setPrintConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);

  useEffect(() => {
    const syncConfig = () => setPrintConfig(loadAppConfig());
    window.addEventListener('sna_config_updated', syncConfig);
    return () => window.removeEventListener('sna_config_updated', syncConfig);
  }, []);

  const getVoucherTitle = (type: string) => {
    switch (type) {
      case 'PAYMENT': return isHindi ? 'पेमेंट वाउचर (Payment Voucher)' : 'PAYMENT VOUCHER';
      case 'RECEIPT': return isHindi ? 'रसीद वाउचर (Receipt Voucher)' : 'RECEIPT VOUCHER';
      case 'JOURNAL': return isHindi ? 'जर्नल वाउचर (Journal Voucher)' : 'JOURNAL VOUCHER';
      case 'CONTRA': return isHindi ? 'कॉण्ट्रा वाउचर (Contra Voucher)' : 'CONTRA VOUCHER';
      default: return `${type} VOUCHER`;
    }
  };

  const copyBadge = getPrintCopyBadgeText(printConfig.printCopyLabel);
  const fontScaleStyle =
    printConfig.printFontScale === 'compact'
      ? { fontSize: '92%' }
      : printConfig.printFontScale === 'large'
      ? { fontSize: '108%' }
      : undefined;

  const handlePrint = () => {
    printDomElement('printable-voucher', {
      paperSize: printConfig.defaultPaperSize,
      orientation: printConfig.printOrientation,
      marginMode: printConfig.printMargins,
      title: `Voucher_${voucher.voucherNumber}`
    });
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    const ok = await exportElementToPdf('printable-voucher', {
      filename: `Voucher_${voucher.voucherNumber}_${voucher.type}`,
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
      <div className={`print-preview-dialog hv-surface border rounded-2xl w-full ${printConfig.printOrientation === 'landscape' ? 'max-w-4xl' : 'max-w-3xl'} max-h-[92vh] flex flex-col overflow-hidden shadow-2xl`}>
        {/* Modal Top Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 hv-elevated border-b shrink-0 no-print">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-sm">
            <span>{isHindi ? 'वाउचर प्रिंट पूर्वावलोकन' : 'Official Voucher Print View'}</span>
            <span className="text-xs hv-pill-indigo px-2 py-0.5 rounded-full font-semibold border">
              {voucher.voucherNumber}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowConfigPanel((prev) => !prev)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border transition cursor-pointer ${
                showConfigPanel
                  ? 'hv-pill-amber'
                  : 'hv-surface hover:bg-[var(--hover-surface)] text-[var(--text-primary)]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{isHindi ? 'प्रिंट सेटिंग्स' : 'Print Config'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer disabled:opacity-60"
            >
              {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isDownloadingPdf ? (isHindi ? 'PDF बन रहा है...' : 'Saving PDF...') : (isHindi ? 'PDF डाउनलोड' : 'Download PDF')}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isHindi ? 'प्रिंट करें' : 'Print'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hv-surface hover:bg-[var(--hover-surface)] rounded-xl border transition cursor-pointer"
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
            docKind="voucher"
          />
        )}

        {pdfNotice && (
          <div className="bg-emerald-600 text-white hv-keep-white px-4 py-2 text-xs font-bold flex items-center gap-2 shrink-0 no-print">
            <CheckCircle2 className="w-4 h-4" />
            <span>{pdfNotice}</span>
          </div>
        )}

        {/* Printable Paper Canvas */}
        <div className="overflow-y-auto flex-1 bg-[var(--bg-canvas)] py-3">
          <div
            className={`bg-white text-slate-900 font-sans print:p-0 print:m-0 ${getPaperPaddingClass(printConfig.printMargins)} ${getPaperWidthClass(printConfig.defaultPaperSize, printConfig.printOrientation)}`}
            style={fontScaleStyle}
            id="printable-voucher"
          >
            {copyBadge && (
              <div className="flex justify-end mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-300 px-2 py-0.5 rounded">
                  {copyBadge}
                </span>
              </div>
            )}

            {/* Company Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6 gap-4">
              <div className="flex items-center gap-3">
                {printConfig.showCompanyLogoOnPrint && (
                  data.company.logoUrl ? (
                    <img
                      src={data.company.logoUrl}
                      alt={data.company.name}
                      className="max-h-14 max-w-[150px] object-contain rounded"
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-indigo-700 shrink-0" />
                  )
                )}
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900">{data.company.name}</h1>
                  <p className="text-xs text-slate-600 mt-1">{data.company.address}</p>
                  <p className="text-xs text-slate-600">
                    GSTIN: <span className="font-semibold">{data.company.gstin}</span> | Phone: {data.company.phone}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block bg-slate-900 text-white font-black text-xs px-3 py-1 rounded tracking-wider uppercase">
                  {getVoucherTitle(voucher.type)}
                </span>
                <p className="text-xs font-bold text-slate-800 mt-2">
                  No: <span className="font-mono text-indigo-700">{voucher.voucherNumber}</span>
                </p>
                <p className="text-xs text-slate-600">Date: {voucher.date}</p>
              </div>
            </div>

            {/* Party & Reference Details */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs mb-6">
              <div>
                <p className="text-slate-500 uppercase text-[10px] font-bold">Paid To / Received From Party:</p>
                <p className="text-sm font-extrabold text-slate-900">{voucher.partyName || 'N/A General Entry'}</p>
                {voucher.paymentMode && (
                  <p className="text-slate-600 mt-1">Payment Mode: <span className="font-semibold">{voucher.paymentMode}</span></p>
                )}
              </div>
              <div className="text-right">
                <p className="text-slate-500 uppercase text-[10px] font-bold">Reference / Cheque / UTR No:</p>
                <p className="text-sm font-mono font-bold text-slate-800">{voucher.referenceNo || 'N/A'}</p>
                {voucher.reconciledDate && (
                  <p className="text-emerald-700 font-semibold mt-1 flex items-center justify-end gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled on {voucher.reconciledDate}
                  </p>
                )}
              </div>
            </div>

            {/* Double Entry Table */}
            <table className="w-full text-xs text-left border-collapse border border-slate-300 mb-6">
              <thead>
                <tr className="bg-slate-800 text-white font-bold text-[11px] uppercase">
                  <th className="border border-slate-300 p-2.5">Code</th>
                  <th className="border border-slate-300 p-2.5">Account Particulars</th>
                  <th className="border border-slate-300 p-2.5 text-right">Debit ({currency})</th>
                  <th className="border border-slate-300 p-2.5 text-right">Credit ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {voucher.entries.map((entry, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="border border-slate-300 p-2.5 font-mono text-slate-600 font-bold">{entry.accountCode}</td>
                    <td className="border border-slate-300 p-2.5 font-semibold text-slate-800">{entry.accountName}</td>
                    <td className="border border-slate-300 p-2.5 text-right font-mono font-bold text-slate-900">
                      {entry.debit > 0 ? formatCurrency(entry.debit, currency) : '-'}
                    </td>
                    <td className="border border-slate-300 p-2.5 text-right font-mono font-bold text-slate-900">
                      {entry.credit > 0 ? formatCurrency(entry.credit, currency) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-black text-xs text-slate-900">
                  <td colSpan={2} className="border border-slate-300 p-2.5 text-right uppercase">Total Voucher Amount:</td>
                  <td className="border border-slate-300 p-2.5 text-right font-mono text-indigo-700">
                    {formatCurrency(voucher.totalAmount, currency)}
                  </td>
                  <td className="border border-slate-300 p-2.5 text-right font-mono text-indigo-700">
                    {formatCurrency(voucher.totalAmount, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Narration */}
            <div className="border border-slate-200 p-3 rounded-lg text-xs bg-slate-50 mb-8">
              <span className="font-bold text-slate-700 uppercase text-[10px] block">Narration / Particulars Remarks:</span>
              <p className="text-slate-800 italic mt-0.5">{voucher.narration || 'No remarks provided.'}</p>
            </div>

            {/* Signatures */}
            {printConfig.showAuthorizedSignatory && (
              <div className="grid grid-cols-3 gap-4 pt-12 text-center text-xs font-bold text-slate-700 border-t border-slate-300 footer">
                <div>
                  <p className="border-t border-dashed border-slate-400 pt-2">Prepared By</p>
                </div>
                <div>
                  <p className="border-t border-dashed border-slate-400 pt-2">Verified Accountant</p>
                </div>
                <div>
                  <p className="border-t border-dashed border-slate-400 pt-2">Authorised Signatory</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
