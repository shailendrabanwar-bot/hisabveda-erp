import React, { useState, useEffect } from 'react';
import { Printer, X, Download, Building2, Mail, Smartphone, Sliders, Loader2, CheckCircle2, MessageCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SalesInvoice, CompanyDetails, Currency, AppData } from '../../types';
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
import { getInvoicePrintHeaderInfo, resolveCompanyTaxProfile } from '../../utils/companyProfile';
import { buildUpiPaymentUri } from '../../utils/erpSmartHelpers';
import { buildWhatsAppInvoiceShareUrl } from '../../utils/enterpriseErpHelpers';

interface InvoicePrintModalProps {
  invoice: SalesInvoice;
  data?: AppData;
  company?: CompanyDetails;
  isHindi: boolean;
  onClose: () => void;
}

export const InvoicePrintModal: React.FC<InvoicePrintModalProps> = ({
  invoice,
  data,
  company: propCompany,
  isHindi,
  onClose
}) => {
  const company: CompanyDetails = propCompany || data?.company || {
    name: 'HisabVeda-ERP Accounting Solution',
    tagline: 'Smart GST & Financial Accounting Software',
    address: 'A3 401, Fortune Somya Heritage, 4th Floor, Behind IPS School, Huzur, Bhopal, Madhya Pradesh - 462047, India',
    gstin: '23AAAAA0000A1Z5',
    stateCode: '23',
    email: 'support@hisabveda.com',
    phone: '+91-7489655303',
    bankName: 'HDFC Bank Ltd',
    accountNumber: '50200012345678',
    ifscCode: 'HDFC0000123',
    branch: 'Main Branch',
    upiId: 'hisabveda@upi',
    currency: 'INR' as Currency,
    terms: '1. Goods once sold will not be taken back.\n2. Interest @ 18% p.a. charged if payment delayed beyond due date.'
  };

  const currency = company.currency || 'INR';
  const taxProfile = resolveCompanyTaxProfile(company);
  const printHeader = getInvoicePrintHeaderInfo(company, invoice);
  const [qrMode, setQrMode] = useState<'UPI' | 'DATA'>(() =>
    currency === 'INR' && Boolean(company.upiId) ? 'UPI' : 'DATA'
  );
  const [showAdvanceDetails, setShowAdvanceDetails] = useState<boolean>(() =>
    Boolean(invoice?.showAdvanceOnInvoice ?? ((invoice?.amountPaid || 0) > 0))
  );
  const [printConfig, setPrintConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState<string>(() => {
    const matchedParty = (data?.parties || []).find(
      (p) =>
        (invoice.partyId && p.id === invoice.partyId) ||
        p.name.toLowerCase().trim() === (invoice.partyName || '').toLowerCase().trim()
    );
    return matchedParty?.phone || '';
  });

  useEffect(() => {
    const syncConfig = () => setPrintConfig(loadAppConfig());
    window.addEventListener('sna_config_updated', syncConfig);
    return () => window.removeEventListener('sna_config_updated', syncConfig);
  }, []);

  // Build standard UPI deep-link payment URL
  const upiId = company.upiId || 'hisabveda@upi';
  const grandTotal = invoice?.grandTotal || 0;
  const amountPaid = Number(invoice?.amountPaid || 0);
  const balancePayable = Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);
  const qrPayableAmount = showAdvanceDetails && amountPaid > 0 ? balancePayable : grandTotal;
  const invoiceNumber = invoice?.invoiceNumber || 'INV-000';
  const companyName = company.name || 'Company';

  const upiPaymentUrl = buildUpiPaymentUri({
    upiId,
    payeeName: companyName,
    amount: qrPayableAmount,
    note: `Invoice ${invoiceNumber}`,
  });

  // Build GST Invoice verification data payload string
  const invoiceDataPayload = `GSTIN:${company.gstin || 'URP'}|INV:${invoiceNumber}|DATE:${invoice?.date || ''}|AMT:${grandTotal}|BUYER:${invoice?.partyGstin || invoice?.partyName || ''}`;

  const qrValue = qrMode === 'UPI' ? upiPaymentUrl : invoiceDataPayload;
  const isThermal = printConfig.defaultPaperSize === 'Thermal-3inch' || printConfig.defaultPaperSize === 'Thermal-58mm';
  const isA5 = printConfig.defaultPaperSize === 'A5';
  const isModernTheme = !isThermal && printConfig.invoicePrintTheme === 'MODERN';
  const copyBadge = getPrintCopyBadgeText(printConfig.printCopyLabel);
  const hasLineDiscounts = (invoice.items || []).some((it) => (Number(it.discountPercent) || 0) > 0);
  const lineDiscountFallback = (invoice.items || []).reduce(
    (sum, it) =>
      sum +
      (Number(it.quantity) || 0) * (Number(it.rate) || 0) * ((Number(it.discountPercent) || 0) / 100),
    0
  );
  const effectiveTotalDiscount =
    Number(invoice.totalDiscount) > 0
      ? Number(invoice.totalDiscount)
      : Math.round(lineDiscountFallback * 100) / 100;
  const fontScaleStyle =
    printConfig.printFontScale === 'compact'
      ? { fontSize: '92%' }
      : printConfig.printFontScale === 'large'
      ? { fontSize: '108%' }
      : undefined;

  const handlePrint = () => {
    printDomElement('printable-invoice', {
      paperSize: printConfig.defaultPaperSize,
      orientation: printConfig.printOrientation,
      marginMode: printConfig.printMargins,
      title: `Invoice_${invoice.invoiceNumber}`
    });
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    const filename = `Invoice_${invoice.invoiceNumber}_${invoice.partyName || 'Customer'}`;
    const ok = await exportElementToPdf('printable-invoice', {
      filename,
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

  const handleShareEmail = () => {
    const subject = encodeURIComponent(`Tax Invoice ${invoice.invoiceNumber} - ${company.name}`);
    const itemsSummary = invoice.items
      .map((item, i) => `${i + 1}. ${item.itemName} (Qty: ${item.quantity} ${item.unit}) - ${formatCurrency(item.totalAmount, currency)}`)
      .join('\n');

    const bodyText =
      `Dear ${invoice.partyName},\n\n` +
      `Greetings from ${company.name}.\n\n` +
      `Please find the invoice summary for Tax Invoice ${invoice.invoiceNumber}:\n\n` +
      `--------------------------------------------------\n` +
      `Invoice Number : ${invoice.invoiceNumber}\n` +
      `Invoice Date   : ${invoice.date}\n` +
      `Due Date       : ${invoice.dueDate}\n` +
      `Place of Supply: ${invoice.placeOfSupply}\n` +
      `--------------------------------------------------\n\n` +
      `Item Breakdown:\n${itemsSummary}\n\n` +
      `--------------------------------------------------\n` +
      `Grand Total    : ${formatCurrency(invoice.grandTotal, currency)}\n` +
      (showAdvanceDetails
        ? `Advance / Paid : ${formatCurrency(amountPaid, currency)}${invoice.advanceNote ? ` (${invoice.advanceNote})` : ''}\n` +
          `Balance Due    : ${formatCurrency(balancePayable, currency)}\n`
        : '') +
      `Payment Status : ${invoice.status}\n` +
      `--------------------------------------------------\n\n` +
      `Bank Remittance Details:\n` +
      `Bank Name : ${company.bankName}\n` +
      `Account No: ${company.accountNumber}\n` +
      `IFSC Code : ${company.ifscCode}\n` +
      `UPI ID    : ${company.upiId}\n\n` +
      `Thank you for your business.\n\n` +
      `Best regards,\n` +
      `${company.name}\n` +
      `Phone: ${company.phone} | Email: ${company.email}`;

    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(bodyText)}`;
  };

  const dialogMaxWidthClass =
    printConfig.printOrientation === 'landscape' && !isThermal ? 'max-w-5xl' : 'max-w-4xl';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className={`print-preview-dialog hv-surface border rounded-2xl w-full ${dialogMaxWidthClass} max-h-[92vh] flex flex-col shadow-2xl overflow-hidden`}>
        {/* Modal Top Control Bar */}
        <div className="p-4 hv-elevated border-b flex flex-wrap items-center justify-between gap-2 shrink-0 no-print">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {isHindi ? 'इनवॉइस प्रिंट पूर्वावलोकन' : 'Official Tax Invoice Preview'}
            </h3>
            <span className="text-xs hv-pill-indigo border px-2 py-0.5 rounded-full font-semibold">
              {invoice.invoiceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <label className="flex items-center gap-1.5 hv-surface hover:bg-[var(--hover-surface)] border text-[var(--text-primary)] text-xs font-semibold px-3 py-2 rounded-xl cursor-pointer transition select-none">
              <input
                type="checkbox"
                checked={showAdvanceDetails}
                onChange={(e) => setShowAdvanceDetails(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
              />
              <span>{isHindi ? 'एडवांस व वास्तविक भुगतान' : 'Show Advance & Balance'}</span>
            </label>

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

            <div className="flex items-center hv-input border border-emerald-600/40 rounded-xl overflow-hidden">
              <input
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder={isHindi ? 'ग्राहक WhatsApp नं.' : 'Customer Phone'}
                className="w-32 bg-transparent text-[var(--text-primary)] text-xs px-2.5 py-2 outline-none font-mono placeholder:font-sans placeholder:text-[var(--text-muted)]"
              />
              <a
                href={buildWhatsAppInvoiceShareUrl({
                  invoice,
                  company,
                  partyPhone: whatsappPhone,
                  balancePayable: showAdvanceDetails && amountPaid > 0 ? balancePayable : grandTotal,
                  isHindi,
                })}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white hv-keep-white text-xs font-bold px-3 py-2 shadow-md transition cursor-pointer"
                title={isHindi ? 'WhatsApp पर बिल व UPI लिंक भेजें' : 'Send Bill & UPI Details on WhatsApp'}
              >
                <MessageCircle className="w-4 h-4" />
                <span>{isHindi ? 'WhatsApp भेजें' : 'Send on WhatsApp'}</span>
              </a>
            </div>

            <button
              type="button"
              onClick={handleShareEmail}
              className="flex items-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white hv-keep-white text-xs font-semibold px-3 py-2 rounded-xl shadow-md transition cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              <span>{isHindi ? 'ईमेल' : 'Email'}</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-md transition cursor-pointer disabled:opacity-60"
            >
              {isDownloadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isDownloadingPdf ? (isHindi ? 'PDF बन रहा है...' : 'Saving PDF...') : (isHindi ? 'PDF डाउनलोड' : 'Download PDF')}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white text-xs font-semibold px-4 py-2 rounded-xl shadow-md transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>{isHindi ? 'प्रिंट करें' : 'Print'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hv-surface rounded-xl hover:bg-[var(--hover-surface)] transition cursor-pointer border"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 1-Click 4-Format Print Switcher */}
        <div className="px-4 py-2 hv-surface border-b flex flex-wrap items-center justify-between gap-2 text-xs shrink-0 no-print">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)] mr-1">
              {isHindi ? 'प्रिंट लेआउट:' : 'Print Format:'}
            </span>
            <button
              type="button"
              onClick={() =>
                setPrintConfig(prev => ({
                  ...prev,
                  defaultPaperSize: 'A4',
                  invoicePrintTheme: 'GST_STANDARD',
                }))
              }
              className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                printConfig.defaultPaperSize === 'A4' && (printConfig.invoicePrintTheme || 'GST_STANDARD') === 'GST_STANDARD'
                  ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500'
                  : 'hv-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isHindi ? 'A4 GST स्टैंडर्ड' : 'A4 GST Standard'}
            </button>
            <button
              type="button"
              onClick={() =>
                setPrintConfig(prev => ({
                  ...prev,
                  defaultPaperSize: 'A4',
                  invoicePrintTheme: 'MODERN',
                }))
              }
              className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                printConfig.defaultPaperSize === 'A4' && printConfig.invoicePrintTheme === 'MODERN'
                  ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500'
                  : 'hv-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isHindi ? 'A4 आधुनिक थीम' : 'A4 Modern Theme'}
            </button>
            <button
              type="button"
              onClick={() =>
                setPrintConfig(prev => ({
                  ...prev,
                  defaultPaperSize: 'A5',
                }))
              }
              className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                printConfig.defaultPaperSize === 'A5'
                  ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500'
                  : 'hv-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isHindi ? 'A5 हाफ-पेज' : 'A5 Half-Page'}
            </button>
            <button
              type="button"
              onClick={() =>
                setPrintConfig(prev => ({
                  ...prev,
                  defaultPaperSize: prev.defaultPaperSize === 'Thermal-58mm' ? 'Thermal-58mm' : 'Thermal-3inch',
                }))
              }
              className={`px-2.5 py-1 rounded-lg font-bold border transition cursor-pointer ${
                isThermal
                  ? 'bg-cyan-600 text-white hv-keep-white border-cyan-500 font-extrabold'
                  : 'hv-elevated text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {isHindi ? 'थर्मल POS रसीद' : 'Thermal POS (80/58mm)'}
            </button>
          </div>

          {isThermal && (
            <div className="inline-flex items-center hv-canvas border rounded-lg p-0.5 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setPrintConfig(prev => ({ ...prev, defaultPaperSize: 'Thermal-3inch' }))}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  printConfig.defaultPaperSize === 'Thermal-3inch'
                    ? 'bg-cyan-600 text-white hv-keep-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                80mm (3&quot;)
              </button>
              <button
                type="button"
                onClick={() => setPrintConfig(prev => ({ ...prev, defaultPaperSize: 'Thermal-58mm' }))}
                className={`px-2 py-0.5 rounded cursor-pointer ${
                  printConfig.defaultPaperSize === 'Thermal-58mm'
                    ? 'bg-cyan-600 text-white hv-keep-white'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                }`}
              >
                58mm (2&quot;)
              </button>
            </div>
          )}
        </div>

        {/* Collapsible Print Configuration Panel */}
        {showConfigPanel && (
          <PrintConfigPanel
            config={printConfig}
            onChange={setPrintConfig}
            isHindi={isHindi}
            docKind="invoice"
            allowThermal={true}
          />
        )}

        {/* PDF Toast Feedback */}
        {pdfNotice && (
          <div className="bg-emerald-600 text-white hv-keep-white px-4 py-2 text-xs font-bold flex items-center gap-2 shrink-0 no-print">
            <CheckCircle2 className="w-4 h-4" />
            <span>{pdfNotice}</span>
          </div>
        )}

        {/* Scrollable Sheet Preview Area */}
        <div className="overflow-y-auto flex-1 bg-[var(--bg-canvas)] py-3">
          <div
            className={`bg-white text-slate-900 font-sans print:p-0 print:m-0 print:shadow-none print:bg-white ${
              isThermal ? 'p-3' : isA5 ? 'p-4 sm:p-5' : getPaperPaddingClass(printConfig.printMargins)
            } ${getPaperWidthClass(printConfig.defaultPaperSize, printConfig.printOrientation)}`}
            style={fontScaleStyle}
            id="printable-invoice"
          >
            {/* Copy Label Banner */}
            {copyBadge && !isThermal && (
              <div className="flex justify-end mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                  isModernTheme
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    : 'text-slate-600 border-slate-300'
                }`}>
                  {copyBadge}
                </span>
              </div>
            )}

            {/* Invoice Header */}
            <div className={`flex ${isThermal ? 'flex-col items-center text-center border-b border-dashed border-slate-400 pb-3' : `flex-col sm:flex-row justify-between items-start ${isModernTheme ? 'bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white p-5 rounded-xl mb-4' : 'border-b-2 border-slate-800 pb-5'}`} gap-4`}>
              <div className={`flex ${isThermal ? 'flex-col items-center text-center' : 'items-center'} gap-3`}>
                {printConfig.showCompanyLogoOnPrint && (
                  company.logoUrl ? (
                    <img
                      src={company.logoUrl}
                      alt={company.name}
                      className="max-h-16 max-w-[180px] object-contain rounded"
                    />
                  ) : !isThermal ? (
                    <Building2 className={`w-8 h-8 shrink-0 ${isModernTheme ? 'text-indigo-300' : 'text-indigo-700'}`} />
                  ) : null
                )}
                <div>
                  <h1 className={`${isThermal ? 'text-base' : 'text-xl'} font-black tracking-tight ${isModernTheme ? 'text-white' : 'text-slate-900'}`}>{company.name}</h1>
                  {!isThermal && <p className={`text-xs mt-0.5 font-medium ${isModernTheme ? 'text-indigo-200' : 'text-slate-600'}`}>{company.tagline}</p>}
                  <p className={`text-xs mt-1 max-w-sm leading-relaxed ${isModernTheme ? 'text-slate-200' : 'text-slate-700'}`}>{company.address}</p>
                  {(taxProfile.gstEnabled || company.gstin) ? (
                    <p className={`text-xs font-semibold mt-1 ${isModernTheme ? 'text-indigo-100' : 'text-slate-700'}`}>
                      {company.gstin ? (
                        <>GSTIN: <span className={`font-mono ${isModernTheme ? 'text-emerald-300' : 'text-indigo-900'}`}>{company.gstin}</span></>
                      ) : (
                        <span>Unregistered / Non-GST</span>
                      )}
                      {company.stateCode ? ` | State Code: ${company.stateCode}` : company.state ? ` | ${company.state}` : ''}
                    </p>
                  ) : (
                    <p className={`text-xs font-semibold mt-1 ${isModernTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                      {[company.state, taxProfile.country].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <p className={`text-xs ${isModernTheme ? 'text-slate-300' : 'text-slate-600'}`}>
                    {isThermal ? `Ph: ${company.phone}` : `Email: ${company.email} | Phone: ${company.phone}`}
                  </p>
                </div>
              </div>

              <div className={`${isThermal ? 'w-full text-center border-t border-dashed border-slate-300 pt-2' : 'text-left sm:text-right'}`}>
                <div className={`inline-block text-xs font-extrabold uppercase px-3 py-1 rounded tracking-wider mb-1.5 ${
                  isModernTheme
                    ? 'bg-emerald-500 text-slate-950'
                    : isThermal
                    ? 'bg-slate-900 text-white text-[10px]'
                    : 'bg-indigo-900 text-white'
                }`}>
                  {printHeader.title}{!isThermal ? ` / ${printHeader.subtitleHindi}` : ''}
                </div>
                {printHeader.compositionDeclaration && (
                  <p className="text-[11px] font-bold text-amber-900 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded mb-1.5 max-w-xs sm:ml-auto">
                    {printHeader.compositionDeclaration}
                  </p>
                )}
                <p className={`text-sm font-black font-mono ${isModernTheme ? 'text-white' : 'text-indigo-900'}`}>{invoice.invoiceNumber}</p>
                <p className={`text-xs mt-1 ${isModernTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                  <strong>Date:</strong> {invoice.date}{isThermal ? '' : ''}
                </p>
                {!isThermal && (
                  <p className={`text-xs ${isModernTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                    <strong>Due Date:</strong> {invoice.dueDate}
                  </p>
                )}
                {!isThermal && (taxProfile.gstEnabled || invoice.placeOfSupply) && (
                  <p className={`text-xs mt-1 ${isModernTheme ? 'text-slate-200' : 'text-slate-700'}`}>
                    <strong>Place of Supply:</strong> {invoice.placeOfSupply || company.state || taxProfile.country}
                  </p>
                )}
                {invoice.godownName && (
                  <p className={`text-[11px] mt-0.5 ${isModernTheme ? 'text-indigo-200' : 'text-slate-600'}`}>
                    <strong>Counter / Godown:</strong> {invoice.godownName}
                  </p>
                )}
              </div>
            </div>

            {/* Billed To / Shipped To / Dispatch Details Section */}
            <div className={`grid ${isThermal ? 'grid-cols-1 my-2.5 p-2 border-b border-dashed border-slate-400 bg-transparent' : `grid-cols-1 md:grid-cols-2 ${isA5 ? 'my-3 p-3' : 'my-5 p-4'} rounded-xl border ${isModernTheme ? 'bg-indigo-50/50 border-indigo-200' : 'bg-slate-50 border-slate-300'}`} gap-4 text-xs`}>
              {/* Buyer Details */}
              <div className={`${isThermal ? '' : 'border-r border-slate-200 pr-0 md:pr-4'}`}>
                <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider block mb-1.5 pb-1 border-b border-slate-200">
                  Billed To (Buyer / ग्राहक का विवरण)
                </span>
                <h2 className="text-sm font-extrabold text-slate-900">{invoice.partyName}</h2>
                <p className="text-slate-700 mt-1 leading-relaxed">{invoice.partyAddress}</p>
                {(taxProfile.gstEnabled || (invoice.partyGstin && invoice.partyGstin !== 'URP')) && (
                  <p className="text-slate-800 font-semibold mt-1">
                    GSTIN / UIN: <span className="font-mono text-indigo-900">
                      {(!invoice.partyGstin || invoice.partyGstin === 'URP' || invoice.partyGstCategory === 'UNREGISTERED')
                        ? 'Unregistered / Consumer'
                        : invoice.partyGstin}
                    </span>
                  </p>
                )}
                {invoice.partyState && (
                  <p className="text-slate-700">State / Region: {invoice.partyState}</p>
                )}
              </div>

              {/* Consignee / Shipped To Details */}
              {!isThermal && (
                <div>
                  <span className="text-[10px] font-black text-indigo-900 uppercase tracking-wider block mb-1.5 pb-1 border-b border-slate-200">
                    Shipped To (Consignee / शिपिंग स्थान)
                  </span>
                  <h2 className="text-sm font-extrabold text-slate-900">
                    {invoice.shippingName || invoice.partyName}
                  </h2>
                  <p className="text-slate-700 mt-1 leading-relaxed">
                    {invoice.shippingAddress || invoice.partyAddress}
                  </p>
                  {(taxProfile.gstEnabled || (invoice.shippingGstin && invoice.shippingGstin !== 'URP')) && (
                    <p className="text-slate-800 font-semibold mt-1">
                      GSTIN / UIN: <span className="font-mono text-indigo-900">
                        {(!invoice.shippingGstin && (!invoice.partyGstin || invoice.partyGstin === 'URP' || invoice.partyGstCategory === 'UNREGISTERED'))
                          ? 'Unregistered / Consumer'
                          : (invoice.shippingGstin || invoice.partyGstin)}
                      </span>
                    </p>
                  )}
                  {(invoice.shippingState || invoice.partyState) && (
                    <p className="text-slate-700">State / Region: {invoice.shippingState || invoice.partyState}</p>
                  )}
                </div>
              )}

              {/* Logistics & Dispatch Info Bar */}
              {!isThermal && (invoice.deliveryNoteNo || invoice.orderReferenceNo || invoice.shippedVia || invoice.termsOfDelivery) && (
                <div className="md:col-span-2 pt-3 border-t border-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-2.5 rounded-lg border border-slate-200 text-[11px]">
                  {invoice.deliveryNoteNo && (
                    <div>
                      <span className="text-slate-500 block font-semibold">Delivery Note No:</span>
                      <span className="font-mono font-bold text-slate-900">{invoice.deliveryNoteNo}</span>
                      {invoice.deliveryNoteDate && <span className="text-slate-500 block text-[10px]">{invoice.deliveryNoteDate}</span>}
                    </div>
                  )}
                  {invoice.orderReferenceNo && (
                    <div>
                      <span className="text-slate-500 block font-semibold">Buyers Order No:</span>
                      <span className="font-mono font-bold text-slate-900">{invoice.orderReferenceNo}</span>
                      {invoice.orderDate && <span className="text-slate-500 block text-[10px]">{invoice.orderDate}</span>}
                    </div>
                  )}
                  {invoice.shippedVia && (
                    <div>
                      <span className="text-slate-500 block font-semibold">Vehicle / Transporter:</span>
                      <span className="font-mono font-bold text-slate-900">{invoice.shippedVia}</span>
                    </div>
                  )}
                  {invoice.termsOfDelivery && (
                    <div>
                      <span className="text-slate-500 block font-semibold">Terms of Delivery:</span>
                      <span className="font-bold text-slate-900">{invoice.termsOfDelivery}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Invoice Items Table */}
            <div className={`overflow-x-auto ${isThermal ? 'my-2.5' : isA5 ? 'my-3' : 'my-6'}`}>
              <table className={`w-full text-left text-xs border-collapse ${isThermal ? 'border-b border-dashed border-slate-400' : 'border border-slate-300'}`}>
                <thead className={`${
                  isThermal
                    ? 'bg-slate-100 text-slate-900 border-y border-dashed border-slate-400'
                    : isModernTheme
                    ? 'bg-indigo-900 text-white'
                    : 'bg-slate-800 text-white'
                } font-bold text-[11px] uppercase`}>
                  <tr>
                    <th className="p-2 border border-slate-300 text-center w-8">#</th>
                    <th className="p-2 border border-slate-300">Item Description</th>
                    {printConfig.showHsnTaxBreakdown && !printHeader.hideTaxColumns && !isThermal && (
                      <th className="p-2 border border-slate-300 text-center">HSN/SAC</th>
                    )}
                    <th className="p-2 border border-slate-300 text-center">Qty</th>
                    <th className="p-2 border border-slate-300 text-right">Rate</th>
                    {hasLineDiscounts && !isThermal && (
                      <th className="p-2 border border-slate-300 text-center">Disc %</th>
                    )}
                    {printConfig.showHsnTaxBreakdown && !printHeader.hideTaxColumns && !isThermal && (
                      <>
                        <th className="p-2 border border-slate-300 text-center">Tax %</th>
                        {printHeader.showCessColumn && (
                          <th className="p-2 border border-slate-300 text-right">Cess</th>
                        )}
                        <th className="p-2 border border-slate-300 text-right">Tax Amount</th>
                      </>
                    )}
                    <th className="p-2 border border-slate-300 text-right">Total ({currency})</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-300">
                  {invoice.items.map((item, idx) => (
                    <tr key={item.id} className="text-slate-800 hover:bg-slate-50">
                      <td className="p-2 border border-slate-300 text-center font-medium">{idx + 1}</td>
                      <td className="p-2 border border-slate-300 font-semibold">
                        <div>{item.itemName}</div>
                        {(item.batchNumber || item.expiryDate) && (
                          <div className="text-[10px] font-normal font-mono text-slate-600 mt-0.5">
                            {item.batchNumber ? `Batch: ${item.batchNumber}` : ''}
                            {item.batchNumber && item.expiryDate ? ' • ' : ''}
                            {item.expiryDate ? `Exp: ${item.expiryDate}` : ''}
                          </div>
                        )}
                      </td>
                      {printConfig.showHsnTaxBreakdown && !printHeader.hideTaxColumns && !isThermal && (
                        <td className="p-2 border border-slate-300 text-center font-mono">{item.hsnSacCode}</td>
                      )}
                      <td className="p-2 border border-slate-300 text-center">{item.quantity} {item.unit}</td>
                      <td className="p-2 border border-slate-300 text-right font-mono">{formatCurrency(item.rate, currency)}</td>
                      {hasLineDiscounts && !isThermal && (
                        <td className="p-2 border border-slate-300 text-center font-mono text-emerald-700">
                          {(item.discountPercent || 0) > 0 ? `${item.discountPercent}%` : '-'}
                        </td>
                      )}
                      {printConfig.showHsnTaxBreakdown && !printHeader.hideTaxColumns && !isThermal && (
                        <>
                          <td className="p-2 border border-slate-300 text-center font-mono">{item.taxRate}%</td>
                          {printHeader.showCessColumn && (
                            <td className="p-2 border border-slate-300 text-right font-mono">
                              {formatCurrency(item.cessAmount || 0, currency)}
                            </td>
                          )}
                          <td className="p-2 border border-slate-300 text-right font-mono">{formatCurrency(item.taxAmount, currency)}</td>
                        </>
                      )}
                      <td className="p-2 border border-slate-300 text-right font-mono font-bold">{formatCurrency(item.totalAmount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals & Tax Calculation Breakdown */}
            <div className={`grid ${isThermal ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-6 my-6`}>
              {/* Left: Bank Details & Automated Payment QR Code */}
              {printConfig.showBankQrCode ? (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-800 flex flex-col justify-between gap-3">
                  <div className="space-y-1.5">
                    <span className="font-extrabold uppercase text-indigo-900 block text-[11px] tracking-wider border-b border-slate-200 pb-1">
                      Bank Details For Remittance / बैंक विवरण
                    </span>
                    <p><strong>Bank Name:</strong> {company.bankName}</p>
                    <p><strong>A/c Number:</strong> <span className="font-mono font-bold">{company.accountNumber}</span></p>
                    <p><strong>IFSC Code:</strong> <span className="font-mono font-bold">{company.ifscCode}</span></p>
                    {!isThermal && <p><strong>Branch:</strong> {company.branch}</p>}
                    <p><strong>UPI ID:</strong> <span className="font-mono text-indigo-700 font-bold">{upiId}</span></p>
                  </div>

                  {/* Dynamic QR Code Box for UPI / Digital Payment */}
                  <div className="bg-white p-3 rounded-lg border border-slate-300 flex items-center gap-3.5 shadow-sm">
                    <div className="bg-white p-1 rounded border border-slate-200 shrink-0">
                      <QRCodeSVG
                        value={qrValue}
                        size={isThermal ? 78 : 96}
                        level="H"
                        includeMargin={false}
                      />
                    </div>

                    <div className="space-y-1 text-[11px] leading-tight">
                      <div className="flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                        <span className="font-black text-slate-900 uppercase">
                          {qrMode === 'UPI' ? 'Scan to Pay via UPI' : 'Invoice Digital QR'}
                        </span>
                      </div>

                      <p className="text-slate-600 font-mono text-[10px]">
                        {qrMode === 'UPI'
                          ? `${showAdvanceDetails && amountPaid > 0 ? 'Balance Due' : 'Amount'}: ${formatCurrency(qrPayableAmount, currency)}`
                          : `Inv: ${invoice.invoiceNumber}`}
                      </p>

                      {!isThermal && (
                        <p className="text-[10px] text-slate-500">
                          {qrMode === 'UPI'
                            ? 'Supports Google Pay, PhonePe, Paytm, BHIM & All UPI Apps.'
                            : 'Verified GST Tax Invoice Metadata Payload.'}
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 pt-1 print:hidden no-print">
                        <button
                          type="button"
                          onClick={() => setQrMode('UPI')}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border transition ${
                            qrMode === 'UPI'
                              ? 'bg-indigo-900 text-white border-indigo-900'
                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          UPI QR
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrMode('DATA')}
                          className={`text-[9px] font-bold px-2 py-0.5 rounded border transition ${
                            qrMode === 'DATA'
                              ? 'bg-indigo-900 text-white border-indigo-900'
                              : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          GST Data QR
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div />
              )}

              {/* Right: Calculations */}
              <div className="space-y-2 text-xs text-slate-800">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-600">Subtotal Amount:</span>
                  <span className="font-mono font-semibold">{formatCurrency(invoice.subtotal, currency)}</span>
                </div>
                {effectiveTotalDiscount > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-200 text-emerald-700">
                    <span>Less Discount:</span>
                    <span className="font-mono font-semibold">-{formatCurrency(effectiveTotalDiscount, currency)}</span>
                  </div>
                )}
                {!printHeader.hideTaxColumns && (
                  !invoice.isInterState ? (
                    <>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">CGST (Intra-state):</span>
                        <span className="font-mono font-semibold">{formatCurrency(invoice.cgstAmount, currency)}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-200">
                        <span className="text-slate-600">SGST (Intra-state):</span>
                        <span className="font-mono font-semibold">{formatCurrency(invoice.sgstAmount, currency)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-600">IGST (Inter-state):</span>
                      <span className="font-mono font-semibold">{formatCurrency(invoice.igstAmount, currency)}</span>
                    </div>
                  )
                )}
                {(invoice.cessAmount || 0) > 0 && !printHeader.hideTaxColumns && (
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">GST Cess:</span>
                    <span className="font-mono font-semibold">{formatCurrency(invoice.cessAmount || 0, currency)}</span>
                  </div>
                )}
                <div className={`flex justify-between py-2 border-t-2 text-sm font-black p-2 rounded ${
                  isModernTheme
                    ? 'bg-indigo-900 text-white border-indigo-950'
                    : 'border-slate-800 text-slate-900 bg-indigo-50'
                }`}>
                  <span>Grand Total Amount:</span>
                  <span className={`font-mono ${isModernTheme ? 'text-emerald-300' : 'text-indigo-900'}`}>{formatCurrency(invoice.grandTotal, currency)}</span>
                </div>
                {showAdvanceDetails && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-300 space-y-1.5">
                    <div className="flex justify-between items-start py-1 text-emerald-800 bg-emerald-50/70 px-2 rounded border border-emerald-200">
                      <div>
                        <span className="font-bold block">Less: Advance / Amount Paid (प्राप्त राशि):</span>
                        {invoice.advanceNote && (
                          <span className="text-[10px] text-emerald-700 font-medium block">{invoice.advanceNote}</span>
                        )}
                      </div>
                      <span className="font-mono font-bold">-{formatCurrency(amountPaid, currency)}</span>
                    </div>
                    <div className={`flex justify-between items-center py-2 px-2.5 rounded border-2 text-sm font-black ${
                      balancePayable <= 0
                        ? 'bg-emerald-50 border-emerald-600 text-emerald-900'
                        : 'bg-amber-50 border-amber-500 text-slate-900'
                    }`}>
                      <span>
                        {balancePayable <= 0
                          ? 'Net Balance Payable (पूर्ण भुगतान प्राप्त):'
                          : 'Actual Balance Payable (वास्तविक शेष देय):'}
                      </span>
                      <span className="font-mono">
                        {balancePayable <= 0 ? `${formatCurrency(0, currency)} (PAID)` : formatCurrency(balancePayable, currency)}
                      </span>
                    </div>
                  </div>
                )}
                {invoice.isPosSale && invoice.tenderedAmount && invoice.tenderedAmount > 0 && (
                  <div className="mt-2 pt-2 border-t border-dashed border-slate-300 space-y-1 text-[11px] text-slate-700">
                    <div className="flex justify-between">
                      <span>Payment Mode ({invoice.paymentMode || 'CASH'}):</span>
                      <span className="font-mono font-bold">{formatCurrency(invoice.tenderedAmount, currency)}</span>
                    </div>
                    {invoice.changeAmount && invoice.changeAmount > 0 ? (
                      <div className="flex justify-between text-emerald-700 font-bold">
                        <span>Change Returned:</span>
                        <span className="font-mono">{formatCurrency(invoice.changeAmount, currency)}</span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            {/* Terms & Signatures */}
            {(printConfig.showTermsOnPrint || printConfig.showAuthorizedSignatory) && (
              <div className={`border-t border-slate-300 pt-4 mt-6 grid ${isThermal ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'} gap-6 text-xs text-slate-700 footer`}>
                <div>
                  {printConfig.showTermsOnPrint && (
                    <>
                      <span className="font-bold text-slate-900 block mb-1">Terms & Conditions / नियम व शर्तें:</span>
                      <p className="whitespace-pre-line leading-relaxed text-[11px] text-slate-600">{company.terms}</p>
                    </>
                  )}
                </div>
                {printConfig.showAuthorizedSignatory && (
                  <div className="flex flex-col items-end justify-end text-right pt-4">
                    {company.signatureUrl && (
                      <img
                        src={company.signatureUrl}
                        alt="Authorized Signature"
                        className="max-h-14 max-w-[160px] object-contain mb-1"
                      />
                    )}
                    <div className="w-48 border-b border-slate-800 mb-2"></div>
                    <p className="font-bold text-slate-900">For {company.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {company.authorizedSignatory || 'Authorized Signatory'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
