import React, { useState, useEffect } from 'react';
import { Printer, X, Building2, Download, Sliders, Loader2, CheckCircle2 } from 'lucide-react';
import { AppData, PurchaseInvoice } from '../../types';
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

interface PurchasePrintModalProps {
  purchase: PurchaseInvoice;
  data: AppData;
  isHindi: boolean;
  onClose: () => void;
}

export const PurchasePrintModal: React.FC<PurchasePrintModalProps> = ({
  purchase,
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

  const vendor = data.parties.find(
    p => p.id === purchase.partyId || (p.name && purchase.partyName && p.name.toLowerCase() === purchase.partyName.toLowerCase())
  );

  const vendorName = purchase.partyName || vendor?.name || (purchase as any).vendorName || 'Vendor';
  const vendorGstin = purchase.partyGstin || vendor?.gstin || (purchase as any).vendorGstin || 'URP / Not Provided';
  const vendorAddress = vendor?.address || '';
  const vendorPhone = vendor?.phone || '';
  const vendorEmail = vendor?.email || '';
  const vendorState = purchase.partyState || vendor?.state || '';
  const vendorPan = vendor?.pan || '';

  const billNo = purchase.billNumber || (purchase as any).purchaseNumber || 'PB-001';
  const supplierInvNo = purchase.supplierInvoiceNo || (purchase as any).vendorInvoiceNo || 'N/A';
  const copyBadge = getPrintCopyBadgeText(printConfig.printCopyLabel);
  const fontScaleStyle =
    printConfig.printFontScale === 'compact'
      ? { fontSize: '92%' }
      : printConfig.printFontScale === 'large'
      ? { fontSize: '108%' }
      : undefined;

  const handlePrint = () => {
    printDomElement('printable-purchase-bill', {
      paperSize: printConfig.defaultPaperSize,
      orientation: printConfig.printOrientation,
      marginMode: printConfig.printMargins,
      title: `Purchase_Bill_${billNo}`
    });
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    const ok = await exportElementToPdf('printable-purchase-bill', {
      filename: `Purchase_Bill_${billNo}_${vendorName}`,
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
      <div className={`print-preview-dialog hv-surface border rounded-2xl w-full ${printConfig.printOrientation === 'landscape' ? 'max-w-5xl' : 'max-w-4xl'} max-h-[92vh] flex flex-col overflow-hidden shadow-2xl`}>
        {/* Modal Top Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-4 hv-elevated border-b shrink-0 no-print">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-bold text-sm">
            <span>{isHindi ? 'खरीद बिल वाउचर प्रिंट' : 'Official Purchase Voucher Print'}</span>
            <span className="text-xs hv-pill-indigo px-2 py-0.5 rounded-full font-semibold border">
              {billNo}
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
            docKind="purchase"
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
            id="printable-purchase-bill"
          >
            {copyBadge && (
              <div className="flex justify-end mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-300 px-2 py-0.5 rounded">
                  {copyBadge}
                </span>
              </div>
            )}

            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-800 pb-4 mb-6 gap-4">
              <div className="flex items-center gap-3">
                {printConfig.showCompanyLogoOnPrint && (
                  data.company.logoUrl ? (
                    <img
                      src={data.company.logoUrl}
                      alt={data.company.name}
                      className="max-h-16 max-w-[180px] object-contain rounded"
                    />
                  ) : (
                    <Building2 className="w-8 h-8 text-indigo-700 shrink-0" />
                  )
                )}
                <div>
                  <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">{data.company.name}</h1>
                  <p className="text-xs text-slate-600 mt-0.5">{data.company.address}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    GSTIN: <span className="font-semibold text-indigo-900">{data.company.gstin}</span> | Phone: {data.company.phone}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="inline-block bg-indigo-900 text-white font-black text-xs px-3 py-1 rounded tracking-wider uppercase">
                  PURCHASE INVOICE VOUCHER
                </span>
                <p className="text-xs font-bold text-slate-800 mt-2">
                  Pur Bill #: <span className="font-mono text-indigo-700">{billNo}</span>
                </p>
                <p className="text-xs text-slate-600">Vendor Invoice #: <span className="font-mono text-slate-800">{supplierInvNo}</span></p>
                <p className="text-xs text-slate-600">Bill Date: {purchase.date}</p>
              </div>
            </div>

            {/* Vendor Details */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs mb-6">
              <div>
                <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Vendor / Supplier Details (विक्रेता विवरण):</p>
                <p className="text-sm font-extrabold text-slate-900 mt-1">{vendorName}</p>
                {vendorAddress && <p className="text-slate-600 mt-0.5 leading-relaxed">{vendorAddress}</p>}
                {vendorState && <p className="text-slate-600 mt-0.5">State: {vendorState}</p>}
                <p className="text-slate-700 font-mono mt-1 font-semibold">
                  GSTIN: <span className="text-indigo-900">{vendorGstin}</span>
                  {vendorPan && <span> | PAN: {vendorPan}</span>}
                </p>
                {(vendorPhone || vendorEmail) && (
                  <p className="text-slate-600 mt-0.5">
                    {vendorPhone && <span>Phone: {vendorPhone}</span>}
                    {vendorPhone && vendorEmail && <span> | </span>}
                    {vendorEmail && <span>Email: {vendorEmail}</span>}
                  </p>
                )}
              </div>
              <div className="text-right flex flex-col justify-between">
                <div>
                  <p className="text-slate-500 uppercase text-[10px] font-bold tracking-wider">Payment & Status Details:</p>
                  <span className={`inline-block font-extrabold text-xs px-2.5 py-0.5 rounded mt-1 ${
                    purchase.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : purchase.status === 'PARTIAL' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {purchase.status}
                  </span>
                  <p className="text-slate-600 mt-1.5">Due Date: {purchase.dueDate || purchase.date}</p>
                </div>
                <div className="text-right border-t border-slate-200 pt-1.5 mt-2">
                  <p className="text-slate-600">Amount Paid: <span className="font-mono font-semibold text-emerald-700">{formatCurrency(purchase.amountPaid || 0, currency)}</span></p>
                  <p className="text-slate-800 font-bold">Balance Due: <span className="font-mono text-rose-700">{formatCurrency((purchase.grandTotal || 0) - (purchase.amountPaid || 0), currency)}</span></p>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <table className="w-full text-xs text-left border-collapse border border-slate-300 mb-6">
              <thead>
                <tr className="bg-slate-800 text-white font-bold text-[11px] uppercase">
                  <th className="border border-slate-300 p-2">Item / Service Description</th>
                  {printConfig.showHsnTaxBreakdown && (
                    <th className="border border-slate-300 p-2 text-center">HSN/SAC</th>
                  )}
                  <th className="border border-slate-300 p-2 text-right">Qty</th>
                  <th className="border border-slate-300 p-2 text-right">Rate ({currency})</th>
                  {printConfig.showHsnTaxBreakdown && (
                    <>
                      <th className="border border-slate-300 p-2 text-right">GST %</th>
                      <th className="border border-slate-300 p-2 text-right">Tax ({currency})</th>
                    </>
                  )}
                  <th className="border border-slate-300 p-2 text-right">Total ({currency})</th>
                </tr>
              </thead>
              <tbody>
                {purchase.items.map((item, idx) => (
                  <tr key={idx} className="border-b border-slate-200">
                    <td className="border border-slate-300 p-2 font-semibold text-slate-800">{item.itemName}</td>
                    {printConfig.showHsnTaxBreakdown && (
                      <td className="border border-slate-300 p-2 text-center font-mono text-slate-600">{item.hsnSacCode || '-'}</td>
                    )}
                    <td className="border border-slate-300 p-2 text-right font-mono">{item.quantity} {item.unit}</td>
                    <td className="border border-slate-300 p-2 text-right font-mono">{formatCurrency(item.rate, currency)}</td>
                    {printConfig.showHsnTaxBreakdown && (
                      <>
                        <td className="border border-slate-300 p-2 text-right font-mono">{item.taxRate}%</td>
                        <td className="border border-slate-300 p-2 text-right font-mono">{formatCurrency(item.taxAmount, currency)}</td>
                      </>
                    )}
                    <td className="border border-slate-300 p-2 text-right font-mono font-bold text-slate-900">{formatCurrency(item.totalAmount, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-bold text-xs">
                  <td colSpan={printConfig.showHsnTaxBreakdown ? 5 : 3} className="border border-slate-300 p-2 text-right uppercase">Subtotal:</td>
                  <td colSpan={2} className="border border-slate-300 p-2 text-right font-mono">{formatCurrency(purchase.subtotal, currency)}</td>
                </tr>
                {purchase.totalTax > 0 && (
                  <tr className="bg-slate-100 font-bold text-xs">
                    <td colSpan={printConfig.showHsnTaxBreakdown ? 5 : 3} className="border border-slate-300 p-2 text-right uppercase">Total GST Tax Input Credit:</td>
                    <td colSpan={2} className="border border-slate-300 p-2 text-right font-mono text-indigo-700">{formatCurrency(purchase.totalTax, currency)}</td>
                  </tr>
                )}
                <tr className="bg-slate-800 text-white font-black text-xs">
                  <td colSpan={printConfig.showHsnTaxBreakdown ? 5 : 3} className="border border-slate-300 p-2.5 text-right uppercase">Grand Total Purchase Bill:</td>
                  <td colSpan={2} className="border border-slate-300 p-2.5 text-right font-mono text-emerald-400 text-sm">
                    {formatCurrency(purchase.grandTotal, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>

            {/* Remarks */}
            {purchase.notes && (
              <div className="border border-slate-200 p-3 rounded-lg text-xs bg-slate-50 mb-8">
                <span className="font-bold text-slate-700 uppercase text-[10px] block">Notes / Remarks:</span>
                <p className="text-slate-800 italic mt-0.5">{purchase.notes}</p>
              </div>
            )}

            {/* Signatures */}
            {printConfig.showAuthorizedSignatory && (
              <div className="grid grid-cols-2 gap-8 pt-12 text-center text-xs font-bold text-slate-700 border-t border-slate-300 footer">
                <div>
                  <p className="border-t border-dashed border-slate-400 pt-2">Goods Received & Verified</p>
                </div>
                <div>
                  <p className="border-t border-dashed border-slate-400 pt-2">Authorised Purchase Signatory</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
