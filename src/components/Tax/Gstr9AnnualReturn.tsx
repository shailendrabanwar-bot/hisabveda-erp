import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileCheck2,
  FileSpreadsheet,
  Printer,
  Save,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppData, GstPortalData, Gstr9ManualAdjustments } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { computeGstr9Summary, getFyLabelFromDateStr } from '../../utils/gstAuditEngine';
import { printHtmlDocument } from '../../utils/printReport';

interface Gstr9AnnualReturnProps {
  data: AppData;
  isHindi: boolean;
  onUpdateGstPortalData?: (updater: (prev: GstPortalData) => GstPortalData) => void;
}

export const Gstr9AnnualReturn: React.FC<Gstr9AnnualReturnProps> = ({
  data,
  isHindi,
  onUpdateGstPortalData,
}) => {
  const currency = data.company.currency;
  const defaultFy = getFyLabelFromDateStr(data.company.financialYearStart || new Date().toISOString());
  const [selectedFy, setSelectedFy] = useState<string>(defaultFy);

  const availableFys = useMemo(() => {
    const s = new Set<string>([defaultFy, '2026-27', '2025-26', '2024-25']);
    (data.invoices || []).forEach((i) => s.add(getFyLabelFromDateStr(i.date)));
    (data.purchaseInvoices || []).forEach((p) => s.add(getFyLabelFromDateStr(p.date)));
    return Array.from(s).sort().reverse();
  }, [data.invoices, data.purchaseInvoices, defaultFy]);

  const savedAdj = data.gstPortalData?.gstr9Adjustments?.[selectedFy];
  const [formAdj, setFormAdj] = useState<Gstr9ManualAdjustments>(
    savedAdj || {
      fyLabel: selectedFy,
      outwardZeroRatedTaxable: 0,
      outwardNilExemptNonGst: 0,
      itcReversedRule37: 0,
      itcReversedRule42_43: 0,
      itcBlockedSec17_5: 0,
      previousFyTaxableAdj: 0,
      previousFyTaxAdj: 0,
      previousFyItcClaimedNextFy: 0,
      previousFyItcReversedNextFy: 0,
      lateFeeInterestPaid: 0,
      auditorRemarks: '',
    }
  );
  const [savedNotice, setSavedNotice] = useState(false);

  // Sync adjustment state if FY changes
  React.useEffect(() => {
    const existing = data.gstPortalData?.gstr9Adjustments?.[selectedFy];
    setFormAdj(
      existing || {
        fyLabel: selectedFy,
        outwardZeroRatedTaxable: 0,
        outwardNilExemptNonGst: 0,
        itcReversedRule37: 0,
        itcReversedRule42_43: 0,
        itcBlockedSec17_5: 0,
        previousFyTaxableAdj: 0,
        previousFyTaxAdj: 0,
        previousFyItcClaimedNextFy: 0,
        previousFyItcReversedNextFy: 0,
        lateFeeInterestPaid: 0,
        auditorRemarks: '',
      }
    );
  }, [selectedFy, data.gstPortalData?.gstr9Adjustments]);

  const gstr9 = useMemo(
    () => computeGstr9Summary(data, selectedFy, formAdj),
    [data, selectedFy, formAdj]
  );

  const handleSaveAdjustments = () => {
    if (!onUpdateGstPortalData) return;
    onUpdateGstPortalData((prev) => ({
      ...prev,
      gstr9Adjustments: {
        ...(prev.gstr9Adjustments || {}),
        [selectedFy]: { ...formAdj, fyLabel: selectedFy },
      },
    }));
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  const handleExportGstr9Json = () => {
    const payload = {
      gstin: (data.company.gstin || 'URP').toUpperCase(),
      fp: `03${2000 + parseInt(selectedFy.split('-')[1] || '27', 10)}`,
      fy: selectedFy,
      version: 'GSTR9_v1.0',
      table4: gstr9.table4,
      table5: gstr9.table5,
      table6: gstr9.table6,
      table7: gstr9.table7,
      table8: gstr9.table8,
      table9: gstr9.table9,
      table10_to_14: gstr9.table10to14,
      table17_hsn_out: gstr9.hsnOutward,
      table18_hsn_in: gstr9.hsnInward,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR9_Annual_Return_${payload.gstin}_FY_${selectedFy}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExportGstr9Excel = () => {
    const wb = XLSX.utils.book_new();
    const summaryRows = [
      ['FORM GSTR-9 ANNUAL RETURN WORKING SHEET', data.company.name || 'Company', `GSTIN: ${data.company.gstin || 'N/A'}`, `FY ${selectedFy}`],
      [],
      ['Section / Table', 'Description', 'Taxable Value / Base', 'Total Tax / ITC'],
      ['Table 4A', 'Supplies made to Unregistered Persons (B2C)', gstr9.table4.b2cTaxable, gstr9.table4.b2cIgst + gstr9.table4.b2cCgst + gstr9.table4.b2cSgst],
      ['Table 4B', 'Supplies made to Registered Persons (B2B)', gstr9.table4.b2bTaxable, gstr9.table4.b2bIgst + gstr9.table4.b2bCgst + gstr9.table4.b2bSgst],
      ['Table 4C-4E', 'Zero Rated / Exports / SEZ', gstr9.table4.exportZeroTaxable, gstr9.table4.exportZeroIgst],
      ['Table 4I-4J', 'Net Credit / Debit Notes (+/-)', gstr9.table4.creditDebitNoteNetTaxable, gstr9.table4.creditDebitNoteNetTax],
      ['Table 4N', 'Total Taxable Supplies on which Tax Payable', gstr9.table4.totalTaxableSuppliesOnWhichTaxPayable, gstr9.table4.totalTaxPayable],
      ['Table 5', 'Nil Rated / Exempted / Non-GST Supplies', gstr9.table5.nilRatedExemptNonGst, 0],
      ['Table 5N', 'Total Turnover (Including Advances & Exempt)', gstr9.table5.totalTurnoverIncludingExempt, gstr9.table4.totalTaxPayable],
      [],
      ['Table 6A', 'Total ITC Availed through FORM GSTR-3B', 0, gstr9.table6.itcAsPer3bTotal],
      ['Table 6B', 'Inward Supplies ITC in Books (IGST+CGST+SGST)', 0, gstr9.table6.subtotal6O],
      ['Table 7', 'Total ITC Reversed (Rule 37 / Rule 42-43 / Sec 17(5))', 0, gstr9.table7.totalReversed],
      ['Table 7J', 'Net ITC Available for Utilisation', 0, gstr9.table7.netItcAvailableForUtilisation],
      ['Table 8A', 'ITC as per GSTR-2A / GSTR-2B Portal', 0, gstr9.table8.itcAsPer2BOr2A],
      ['Table 8D', 'Difference (8A - 8B - 8C) [+Lapsed / -Excess Claimed]', 0, gstr9.table8.difference8D],
      [],
      ['Table 9', 'Total Tax Paid through ITC Ledger', 0, gstr9.table9.paidThroughItc],
      ['Table 9', 'Total Tax Paid in Cash', 0, gstr9.table9.paidThroughCash],
      ['Table 9', 'Balance Tax Payable (DRC-03 Liability)', 0, gstr9.table9.balancePayableDRC03],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'GSTR9_Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr9.hsnOutward), 'Table17_HSN_Outward');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gstr9.hsnInward), 'Table18_HSN_Inward');
    XLSX.writeFile(wb, `GSTR9_Annual_FY_${selectedFy}.xlsx`);
  };

  const handlePrintGstr9 = () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Form GSTR-9 Annual Return - FY ${selectedFy}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 20px; font-size: 12px; }
            .hdr { border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; }
            h1 { margin: 0; font-size: 18px; }
            h2 { font-size: 13px; margin: 16px 0 6px; background: #f1f5f9; padding: 6px 10px; border: 1px solid #cbd5e1; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
            th { background: #f8fafc; font-weight: bold; }
            .r { text-align: right; font-variant-numeric: tabular-nums; }
            .tot { font-weight: bold; background: #fef3c7; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <div>
              <h1>FORM GSTR-9 — ANNUAL GST RETURN SUMMARY</h1>
              <div>${data.company.name || 'Registered Taxpayer'} · GSTIN: ${data.company.gstin || 'N/A'}</div>
            </div>
            <div style="text-align:right">
              <div><strong>Financial Year:</strong> FY ${selectedFy}</div>
              <div>Generated: ${new Date().toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          <h2>Part II: Outward & Inward Supplies Declared During FY ${selectedFy} (Table 4 & 5)</h2>
          <table>
            <thead><tr><th>Table</th><th>Nature of Supply</th><th class="r">Taxable Value</th><th class="r">IGST</th><th class="r">CGST</th><th class="r">SGST</th></tr></thead>
            <tbody>
              <tr><td>4A</td><td>Supplies to Unregistered (B2C)</td><td class="r">${formatCurrency(gstr9.table4.b2cTaxable, currency)}</td><td class="r">${formatCurrency(gstr9.table4.b2cIgst, currency)}</td><td class="r">${formatCurrency(gstr9.table4.b2cCgst, currency)}</td><td class="r">${formatCurrency(gstr9.table4.b2cSgst, currency)}</td></tr>
              <tr><td>4B</td><td>Supplies to Registered (B2B)</td><td class="r">${formatCurrency(gstr9.table4.b2bTaxable, currency)}</td><td class="r">${formatCurrency(gstr9.table4.b2bIgst, currency)}</td><td class="r">${formatCurrency(gstr9.table4.b2bCgst, currency)}</td><td class="r">${formatCurrency(gstr9.table4.b2bSgst, currency)}</td></tr>
              <tr><td>4C-4E</td><td>Zero Rated / Exports</td><td class="r">${formatCurrency(gstr9.table4.exportZeroTaxable, currency)}</td><td class="r">${formatCurrency(gstr9.table4.exportZeroIgst, currency)}</td><td class="r">-</td><td class="r">-</td></tr>
              <tr><td>4I-4J</td><td>Net Debit / Credit Notes</td><td class="r">${formatCurrency(gstr9.table4.creditDebitNoteNetTaxable, currency)}</td><td class="r" colspan="3">${formatCurrency(gstr9.table4.creditDebitNoteNetTax, currency)}</td></tr>
              <tr class="tot"><td>4N / 5N</td><td>Total Turnover (Taxable + Exempt ${formatCurrency(gstr9.table5.nilRatedExemptNonGst, currency)})</td><td class="r">${formatCurrency(gstr9.table5.totalTurnoverIncludingExempt, currency)}</td><td class="r" colspan="3">Total Output Tax: ${formatCurrency(gstr9.table4.totalTaxPayable, currency)}</td></tr>
            </tbody>
          </table>

          <h2>Part III: Details of ITC Availed, Reversed & Reconciled (Table 6, 7 & 8)</h2>
          <table>
            <tbody>
              <tr><td>6A</td><td>Total ITC Availed via GSTR-3B</td><td class="r">${formatCurrency(gstr9.table6.itcAsPer3bTotal, currency)}</td></tr>
              <tr><td>6B / 6O</td><td>Books Input Tax Credit (IGST: ${formatCurrency(gstr9.table6.itcInputsIgst, currency)} · CGST: ${formatCurrency(gstr9.table6.itcInputsCgst, currency)} · SGST: ${formatCurrency(gstr9.table6.itcInputsSgst, currency)})</td><td class="r">${formatCurrency(gstr9.table6.subtotal6O, currency)}</td></tr>
              <tr><td>7H</td><td>Less: ITC Reversed (Rule 37 / Rule 42-43 / Sec 17(5))</td><td class="r">${formatCurrency(gstr9.table7.totalReversed, currency)}</td></tr>
              <tr class="tot"><td>7J</td><td>Net ITC Available for Utilisation</td><td class="r">${formatCurrency(gstr9.table7.netItcAvailableForUtilisation, currency)}</td></tr>
              <tr><td>8A</td><td>ITC Auto-Populated as per GSTR-2A / GSTR-2B</td><td class="r">${formatCurrency(gstr9.table8.itcAsPer2BOr2A, currency)}</td></tr>
              <tr class="tot"><td>8D</td><td>Difference (8A - 8B - 8C)</td><td class="r">${formatCurrency(gstr9.table8.difference8D, currency)}</td></tr>
            </tbody>
          </table>

          <h2>Part IV: Details of Tax Paid as Declared in Returns (Table 9)</h2>
          <table>
            <tbody>
              <tr><td>Tax Payable (Total FY Output)</td><td class="r">${formatCurrency(gstr9.table9.totalTaxPayable, currency)}</td></tr>
              <tr><td>Paid Through ITC Ledger</td><td class="r">${formatCurrency(gstr9.table9.paidThroughItc, currency)}</td></tr>
              <tr><td>Paid in Cash</td><td class="r">${formatCurrency(gstr9.table9.paidThroughCash, currency)}</td></tr>
              <tr class="tot"><td>Additional Liability / DRC-03 Balance Payable</td><td class="r">${formatCurrency(gstr9.table9.balancePayableDRC03, currency)}</td></tr>
            </tbody>
          </table>

          ${formAdj.auditorRemarks ? `<p><strong>CA / Auditor Remarks:</strong> ${formAdj.auditorRemarks}</p>` : ''}
        </body>
      </html>
    `;
    printHtmlDocument(html, {
      title: `GSTR-9 Annual Return FY ${selectedFy}`,
      filename: `GSTR9_Annual_FY_${selectedFy}`,
    });
  };

  return (
    <div className="space-y-5">
      {/* Header Controls */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs text-indigo-500 font-semibold">
            {isHindi ? 'वार्षिक जीएसटी रिटर्न' : 'Annual GST Return'} · Form GSTR-9
          </div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
            <FileCheck2 className="w-6 h-6 text-indigo-500 shrink-0" />
            <span>
              {isHindi
                ? `GSTR-9 वार्षिक रिटर्न तैयारी एवं फाइलिंग (FY ${selectedFy})`
                : `GSTR-9 Annual Return Filing & Preparation (FY ${selectedFy})`}
            </span>
          </h2>
          <p className="text-xs text-[var(--text-muted)]">
            {isHindi
              ? 'बिक्री रजिस्टर, परचेज ITC, GSTR-2A/2B, GSTR-3B, HSN (Table 17/18) और DRC-03 अंतर का पूर्ण ऑटो-संकलन।'
              : 'Auto-populated annual tables from Sales Register, Purchase Register, Portal 2A/2B, GSTR-3B, and HSN Summary.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <select
            value={selectedFy}
            onChange={(e) => setSelectedFy(e.target.value)}
            className="hv-input border text-amber-500 font-mono font-bold text-xs rounded-xl px-3 py-2.5 cursor-pointer outline-none"
          >
            {availableFys.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportGstr9Json}
            className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            <span>{isHindi ? 'GSTR-9 JSON' : 'Export GSTR-9 JSON'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportGstr9Excel}
            className="px-3.5 py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <span>{isHindi ? 'Excel' : 'Export Excel'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintGstr9}
            className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Printer className="w-4 h-4" />
            <span>{isHindi ? 'प्रिंट / PDF' : 'Print GSTR-9 PDF'}</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4">
          <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'वार्षिक कुल टर्नओवर (Table 5N)' : 'Annual Aggregate Turnover (5N)'}</div>
          <div className="text-xl font-bold text-[var(--text-primary)] font-mono tabular-nums mt-1">
            {formatCurrency(gstr9.table5.totalTurnoverIncludingExempt, currency)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Output Tax: <span className="font-mono font-semibold text-rose-500">{formatCurrency(gstr9.table4.totalTaxPayable, currency)}</span>
          </div>
        </div>

        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4">
          <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'शुद्ध पात्र ITC (Table 7J)' : 'Net Eligible ITC (Table 7J)'}</div>
          <div className="text-xl font-bold text-emerald-500 font-mono tabular-nums mt-1">
            {formatCurrency(gstr9.table7.netItcAvailableForUtilisation, currency)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            Reversed (Table 7): <span className="font-mono font-semibold text-amber-500">{formatCurrency(gstr9.table7.totalReversed, currency)}</span>
          </div>
        </div>

        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-4">
          <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'Table 8D मिलान (2A/2B बनाम 3B)' : 'Table 8D Variance (2A/2B vs 3B)'}</div>
          <div
            className={`text-xl font-bold font-mono tabular-nums mt-1 ${
              gstr9.table8.difference8D < -5 ? 'text-rose-500' : 'text-emerald-500'
            }`}
          >
            {formatCurrency(gstr9.table8.difference8D, currency)}
          </div>
          <div className="text-[11px] text-[var(--text-muted)] mt-1">
            {gstr9.table8.difference8D < -5
              ? isHindi ? 'चेतावनी: 3B में 2B से ज्यादा क्लेम!' : 'Alert: Excess ITC Claimed vs Portal'
              : isHindi ? 'पोर्टल 2A/2B सीमा के भीतर' : 'Within 2A/2B ceiling'}
          </div>
        </div>

        <div className="hv-pill-amber border rounded-2xl p-4">
          <div className="text-xs font-semibold">
            {isHindi ? 'अतिरिक्त देयता / DRC-03 बकाया' : 'Differential Liability (DRC-03)'}
          </div>
          <div className="text-xl font-bold font-mono tabular-nums mt-1">
            {formatCurrency(gstr9.table9.balancePayableDRC03, currency)}
          </div>
          <div className="text-[11px] opacity-90 mt-1">
            Paid Cash + ITC: <span className="font-mono font-bold">{formatCurrency(gstr9.table9.paidThroughCash + gstr9.table9.paidThroughItc, currency)}</span>
          </div>
        </div>
      </div>

      {/* Part II: Table 4 & 5 Outward */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-4">
        <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-2.5">
          Part II (Table 4 & Table 5): Outward & Zero-Rated Supplies Declared in FY {selectedFy}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)]">
            <thead className="hv-elevated text-[var(--text-muted)] uppercase text-[11px] border-b border-[var(--border-primary)]">
              <tr>
                <th className="p-3">Table</th>
                <th className="p-3">Nature of Supplies</th>
                <th className="p-3 text-right">Taxable Value</th>
                <th className="p-3 text-right">IGST</th>
                <th className="p-3 text-right">CGST</th>
                <th className="p-3 text-right">SGST</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)] font-mono tabular-nums">
              <tr>
                <td className="p-3 text-indigo-500 font-bold">4A</td>
                <td className="p-3 font-sans">Supplies to Unregistered Persons (B2C)</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{formatCurrency(gstr9.table4.b2cTaxable, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.b2cIgst, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.b2cCgst, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.b2cSgst, currency)}</td>
              </tr>
              <tr>
                <td className="p-3 text-indigo-500 font-bold">4B</td>
                <td className="p-3 font-sans">Supplies to Registered Persons (B2B)</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{formatCurrency(gstr9.table4.b2bTaxable, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.b2bIgst, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.b2bCgst, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.b2bSgst, currency)}</td>
              </tr>
              <tr>
                <td className="p-3 text-indigo-500 font-bold">4C-4E</td>
                <td className="p-3 font-sans">Zero Rated / Exports / SEZ Supplies</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{formatCurrency(gstr9.table4.exportZeroTaxable, currency)}</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table4.exportZeroIgst, currency)}</td>
                <td className="p-3 text-right">-</td>
                <td className="p-3 text-right">-</td>
              </tr>
              <tr>
                <td className="p-3 text-indigo-500 font-bold">4I-4J</td>
                <td className="p-3 font-sans">Net Credit / Debit Notes Issued</td>
                <td className="p-3 text-right text-[var(--text-primary)]">{formatCurrency(gstr9.table4.creditDebitNoteNetTaxable, currency)}</td>
                <td className="p-3 text-right" colSpan={3}>{formatCurrency(gstr9.table4.creditDebitNoteNetTax, currency)}</td>
              </tr>
              <tr>
                <td className="p-3 text-indigo-500 font-bold">5A-5F</td>
                <td className="p-3 font-sans">Nil Rated / Exempted / Non-GST Supplies</td>
                <td className="p-3 text-right text-[var(--text-secondary)]">{formatCurrency(gstr9.table5.nilRatedExemptNonGst, currency)}</td>
                <td className="p-3 text-right">-</td>
                <td className="p-3 text-right">-</td>
                <td className="p-3 text-right">-</td>
              </tr>
              <tr className="hv-elevated font-bold text-amber-500">
                <td className="p-3">5N</td>
                <td className="p-3 font-sans">Total Aggregate Turnover & Output Tax (FY {selectedFy})</td>
                <td className="p-3 text-right">{formatCurrency(gstr9.table5.totalTurnoverIncludingExempt, currency)}</td>
                <td className="p-3 text-right" colSpan={3}>{formatCurrency(gstr9.table4.totalTaxPayable, currency)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Part III: Table 6, 7, 8 & Editable Reversals / Amendments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-2">
            Part III (Table 6, 7 & 8): ITC Reconciliation Summary
          </h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between p-2.5 hv-elevated border border-[var(--border-subtle)] rounded-xl">
              <span className="text-[var(--text-secondary)]">6A. ITC Claimed in GSTR-3B Returns</span>
              <span className="font-mono font-bold text-[var(--text-primary)] tabular-nums">{formatCurrency(gstr9.table6.itcAsPer3bTotal, currency)}</span>
            </div>
            <div className="flex justify-between p-2.5 hv-elevated border border-[var(--border-subtle)] rounded-xl">
              <span className="text-[var(--text-secondary)]">6B. Books Purchase ITC (IGST / CGST / SGST)</span>
              <span className="font-mono font-bold text-emerald-500 tabular-nums">{formatCurrency(gstr9.table6.subtotal6O, currency)}</span>
            </div>
            <div className="flex justify-between p-2.5 hv-elevated border border-[var(--border-subtle)] rounded-xl">
              <span className="text-[var(--text-secondary)]">7H. Less: Reversed (Rule 37 + Rule 42/43 + Sec 17(5))</span>
              <span className="font-mono font-bold text-amber-500 tabular-nums">-{formatCurrency(gstr9.table7.totalReversed, currency)}</span>
            </div>
            <div className="flex justify-between p-2.5 hv-pill-emerald border rounded-xl font-bold">
              <span>7J. Net ITC Available for Utilisation</span>
              <span className="font-mono tabular-nums">{formatCurrency(gstr9.table7.netItcAvailableForUtilisation, currency)}</span>
            </div>
            <div className="flex justify-between p-2.5 hv-elevated border border-[var(--border-subtle)] rounded-xl">
              <span className="text-[var(--text-secondary)]">8A. Auto-Populated ITC as per GSTR-2A / 2B Portal</span>
              <span className="font-mono font-bold text-indigo-500 tabular-nums">{formatCurrency(gstr9.table8.itcAsPer2BOr2A, currency)}</span>
            </div>
            <div className="flex justify-between p-2.5 hv-elevated border border-[var(--border-subtle)] rounded-xl font-bold">
              <span className="text-[var(--text-primary)]">8D. Difference (8A - 8B - 8C)</span>
              <span className={`font-mono tabular-nums ${gstr9.table8.difference8D < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {formatCurrency(gstr9.table8.difference8D, currency)}
              </span>
            </div>
          </div>

          {gstr9.table8.itcAsPer2BOr2A === 0 && (
            <div className="text-[11px] hv-pill-amber border rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                {isHindi
                  ? 'Table 8A में सटीक मिलान देखने के लिए पहले "GSTR-2A & 2B" टैब में पोर्टल फ़ाइल अपलोड करें।'
                  : 'Upload GSTR-2A or GSTR-2B portal files in the 2A & 2B Matcher tab to populate Table 8A accurately.'}
              </span>
            </div>
          )}
        </div>

        {/* Editable GSTR-9 Reversals, Part V (Table 10-14) & Notes */}
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {isHindi ? 'Table 5, 7, 10–14 समायोजन एवं ऑडिट टिप्पणियां' : 'Table 5, 7 & Part V (Table 10–14) Adjustments'}
            </h3>
            <button
              type="button"
              onClick={handleSaveAdjustments}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isHindi ? 'सेव करें' : 'Save Inputs'}</span>
            </button>
          </div>

          {savedNotice && (
            <div className="text-xs hv-pill-emerald border p-2 rounded-lg flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-4 h-4" />
              <span>{isHindi ? 'GSTR-9 समायोजन सफलतापूर्वक सेव हुए!' : 'GSTR-9 adjustments saved to company workspace.'}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[var(--text-muted)] font-medium mb-1">Table 7A: Rule 37 (180-Day Unpaid) Reversal</label>
              <input
                type="number"
                value={formAdj.itcReversedRule37 || ''}
                onChange={(e) => setFormAdj({ ...formAdj, itcReversedRule37: Number(e.target.value) || 0 })}
                className="w-full hv-input border rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-medium mb-1">Table 7E: Sec 17(5) Blocked Credit</label>
              <input
                type="number"
                value={formAdj.itcBlockedSec17_5 || ''}
                onChange={(e) => setFormAdj({ ...formAdj, itcBlockedSec17_5: Number(e.target.value) || 0 })}
                className="w-full hv-input border rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-medium mb-1">Table 5: Additional Exempt/Nil Sales</label>
              <input
                type="number"
                value={formAdj.outwardNilExemptNonGst || ''}
                onChange={(e) => setFormAdj({ ...formAdj, outwardNilExemptNonGst: Number(e.target.value) || 0 })}
                className="w-full hv-input border rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-medium mb-1">Table 8C: ITC of FY Claimed Next Year</label>
              <input
                type="number"
                value={formAdj.previousFyItcClaimedNextFy || ''}
                onChange={(e) => setFormAdj({ ...formAdj, previousFyItcClaimedNextFy: Number(e.target.value) || 0 })}
                className="w-full hv-input border rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-medium mb-1">Table 10/11: Next-FY Amendment Tax (+/-)</label>
              <input
                type="number"
                value={formAdj.previousFyTaxAdj || ''}
                onChange={(e) => setFormAdj({ ...formAdj, previousFyTaxAdj: Number(e.target.value) || 0 })}
                className="w-full hv-input border rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block text-[var(--text-muted)] font-medium mb-1">Table 9: Late Fee / Interest Paid</label>
              <input
                type="number"
                value={formAdj.lateFeeInterestPaid || ''}
                onChange={(e) => setFormAdj({ ...formAdj, lateFeeInterestPaid: Number(e.target.value) || 0 })}
                className="w-full hv-input border rounded-xl px-3 py-2 font-mono"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[var(--text-muted)] font-medium mb-1">CA / Annual Reconciliation Remarks</label>
              <input
                type="text"
                value={formAdj.auditorRemarks || ''}
                onChange={(e) => setFormAdj({ ...formAdj, auditorRemarks: e.target.value })}
                placeholder="Notes on spillover ITC, credit notes, or DRC-03 payment..."
                className="w-full hv-input border rounded-xl px-3 py-2"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Part VI: Table 17 & 18 HSN Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-2">
            Table 17: HSN Summary of Outward Supplies ({gstr9.hsnOutward.length})
          </h3>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="hv-elevated text-[var(--text-muted)] uppercase text-[10px] border-b border-[var(--border-primary)]">
                <tr>
                  <th className="p-2.5">HSN</th>
                  <th className="p-2.5">UQC</th>
                  <th className="p-2.5 text-right">Qty</th>
                  <th className="p-2.5 text-right">Taxable</th>
                  <th className="p-2.5 text-right">Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)] font-mono tabular-nums">
                {gstr9.hsnOutward.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-[var(--text-muted)] font-sans">No outward HSN data for FY {selectedFy}</td>
                  </tr>
                ) : (
                  gstr9.hsnOutward.map((h, i) => (
                    <tr key={`${h.hsn}_${i}`}>
                      <td className="p-2.5 text-[var(--text-primary)] font-bold">{h.hsn}</td>
                      <td className="p-2.5">{h.uqc} ({h.taxRate}%)</td>
                      <td className="p-2.5 text-right">{h.qty.toFixed(2)}</td>
                      <td className="p-2.5 text-right text-[var(--text-primary)]">{formatCurrency(h.taxable, currency)}</td>
                      <td className="p-2.5 text-right text-indigo-500 font-semibold">{formatCurrency(h.igst + h.cgst + h.sgst, currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-bold text-[var(--text-primary)] border-b border-[var(--border-primary)] pb-2">
            Table 18: HSN Summary of Inward Supplies ({gstr9.hsnInward.length})
          </h3>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-left text-xs text-[var(--text-secondary)]">
              <thead className="hv-elevated text-[var(--text-muted)] uppercase text-[10px] border-b border-[var(--border-primary)]">
                <tr>
                  <th className="p-2.5">HSN</th>
                  <th className="p-2.5">UQC</th>
                  <th className="p-2.5 text-right">Qty</th>
                  <th className="p-2.5 text-right">Taxable</th>
                  <th className="p-2.5 text-right">ITC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-primary)] font-mono tabular-nums">
                {gstr9.hsnInward.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-[var(--text-muted)] font-sans">No inward HSN data for FY {selectedFy}</td>
                  </tr>
                ) : (
                  gstr9.hsnInward.map((h, i) => (
                    <tr key={`${h.hsn}_${i}`}>
                      <td className="p-2.5 text-[var(--text-primary)] font-bold">{h.hsn}</td>
                      <td className="p-2.5">{h.uqc} ({h.taxRate}%)</td>
                      <td className="p-2.5 text-right">{h.qty.toFixed(2)}</td>
                      <td className="p-2.5 text-right text-[var(--text-primary)]">{formatCurrency(h.taxable, currency)}</td>
                      <td className="p-2.5 text-right text-emerald-500 font-semibold">{formatCurrency(h.igst + h.cgst + h.sgst, currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
