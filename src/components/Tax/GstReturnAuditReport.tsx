import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Edit3,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { AppData, GstPortalData, GstPortalFiledReturn } from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  computeGstAuditReport,
  getFyLabelFromDateStr,
  MonthlyGstAuditRow,
  parseGstr1Or3bPortalJson,
} from '../../utils/gstAuditEngine';
import { printHtmlDocument } from '../../utils/printReport';

interface GstReturnAuditReportProps {
  data: AppData;
  isHindi: boolean;
  onUpdateGstPortalData?: (updater: (prev: GstPortalData) => GstPortalData) => void;
}

export const GstReturnAuditReport: React.FC<GstReturnAuditReportProps> = ({
  data,
  isHindi,
  onUpdateGstPortalData,
}) => {
  const currency = data.company.currency;
  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const defaultFy = getFyLabelFromDateStr(data.company.financialYearStart || new Date().toISOString());
  const [selectedFy, setSelectedFy] = useState<string>(defaultFy);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [editingMonth, setEditingMonth] = useState<MonthlyGstAuditRow | null>(null);

  const [portalEditForm, setPortalEditForm] = useState({
    gstr1Taxable: '',
    gstr1Igst: '',
    gstr1Cgst: '',
    gstr1Sgst: '',
    gstr3bOutTaxable: '',
    gstr3bOutIgst: '',
    gstr3bOutCgst: '',
    gstr3bOutSgst: '',
    gstr3bItcIgst: '',
    gstr3bItcCgst: '',
    gstr3bItcSgst: '',
    gstr3bTaxPaidItc: '',
    gstr3bTaxPaidCash: '',
    arn: '',
  });

  const availableFys = useMemo(() => {
    const s = new Set<string>([defaultFy, '2026-27', '2025-26', '2024-25']);
    (data.invoices || []).forEach((i) => s.add(getFyLabelFromDateStr(i.date)));
    (data.purchaseInvoices || []).forEach((p) => s.add(getFyLabelFromDateStr(p.date)));
    return Array.from(s).sort().reverse();
  }, [data.invoices, data.purchaseInvoices, defaultFy]);

  const audit = useMemo(
    () => computeGstAuditReport(data, selectedFy),
    [data, selectedFy]
  );

  const handleUploadPortalReturnJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const res = parseGstr1Or3bPortalJson(text);
      if (res.error || !res.filedReturn) {
        setNotice({ type: 'error', text: res.error || 'Could not parse GST return JSON.' });
        return;
      }

      if (onUpdateGstPortalData) {
        const ret = res.filedReturn;
        onUpdateGstPortalData((prev) => {
          const filtered = (prev.filedReturns || []).filter(
            (r) => !(r.returnType === ret.returnType && r.periodKey === ret.periodKey)
          );
          return {
            ...prev,
            filedReturns: [...filtered, ret],
            lastImportedAt: new Date().toISOString(),
          };
        });
      }

      setNotice({
        type: 'success',
        text: isHindi
          ? `${res.filedReturn.returnType} (${res.filedReturn.periodKey}) पोर्टल रिटर्न ऑडिट में सफलतापूर्वक सेव हुआ!`
          : `Imported ${res.filedReturn.returnType} portal snapshot for period ${res.filedReturn.periodKey}.`,
      });
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Failed to read JSON file.' });
    }
  };

  // One-click helper when returns were generated directly from software
  const handleSyncPortalAsPerBooks = (targetMonth?: MonthlyGstAuditRow) => {
    if (!onUpdateGstPortalData) return;
    const rowsToSync = targetMonth
      ? [targetMonth]
      : audit.monthlyRows.filter((r) => r.booksSalesCount > 0 || r.booksPurchaseCount > 0 || r.booksItcTotal > 0);

    if (rowsToSync.length === 0) {
      setNotice({
        type: 'info',
        text: isHindi
          ? `FY ${selectedFy} में सिंक करने के लिए कोई बिक्री/खरीद रिकॉर्ड नहीं मिला।`
          : `No monthly Books transactions found in FY ${selectedFy} to sync.`,
      });
      return;
    }

    onUpdateGstPortalData((prev) => {
      const nextReturns = [...(prev.filedReturns || [])];
      rowsToSync.forEach((row) => {
        const g1: GstPortalFiledReturn = {
          id: `GSTR1_${row.monthKey}`,
          returnType: 'GSTR1',
          periodKey: row.monthKey,
          periodLabel: row.labelEn,
          outwardTaxable: Number(row.booksOutwardTaxable.toFixed(2)),
          outwardIgst: Number(row.booksOutwardIgst.toFixed(2)),
          outwardCgst: Number(row.booksOutwardCgst.toFixed(2)),
          outwardSgst: Number(row.booksOutwardSgst.toFixed(2)),
          itcIgst: 0,
          itcCgst: 0,
          itcSgst: 0,
          taxPaidItc: 0,
          taxPaidCash: 0,
          source: 'BOOKS_SYNC',
        };
        const itcAvailable = row.booksItcTotal;
        const taxPaidItc = Math.min(row.booksOutwardTotalTax, itcAvailable);
        const taxPaidCash = Math.max(0, row.booksOutwardTotalTax - taxPaidItc);
        const g3b: GstPortalFiledReturn = {
          id: `GSTR3B_${row.monthKey}`,
          returnType: 'GSTR3B',
          periodKey: row.monthKey,
          periodLabel: row.labelEn,
          outwardTaxable: Number(row.booksOutwardTaxable.toFixed(2)),
          outwardIgst: Number(row.booksOutwardIgst.toFixed(2)),
          outwardCgst: Number(row.booksOutwardCgst.toFixed(2)),
          outwardSgst: Number(row.booksOutwardSgst.toFixed(2)),
          itcIgst: Number(row.booksItcIgst.toFixed(2)),
          itcCgst: Number(row.booksItcCgst.toFixed(2)),
          itcSgst: Number(row.booksItcSgst.toFixed(2)),
          taxPaidItc: Number(taxPaidItc.toFixed(2)),
          taxPaidCash: Number(taxPaidCash.toFixed(2)),
          source: 'BOOKS_SYNC',
        };

        const g1Idx = nextReturns.findIndex((r) => r.returnType === 'GSTR1' && r.periodKey === row.monthKey);
        if (g1Idx >= 0) nextReturns[g1Idx] = g1;
        else nextReturns.push(g1);

        const g3Idx = nextReturns.findIndex((r) => r.returnType === 'GSTR3B' && r.periodKey === row.monthKey);
        if (g3Idx >= 0) nextReturns[g3Idx] = g3b;
        else nextReturns.push(g3b);
      });

      return {
        ...prev,
        filedReturns: nextReturns,
        lastImportedAt: new Date().toISOString(),
      };
    });

    setNotice({
      type: 'success',
      text: isHindi
        ? `${rowsToSync.length} माह के GSTR-1 एवं GSTR-3B आंकड़े सॉफ्टवेयर रिकॉर्ड से सिंक किए गए। (परचेज बिल बनाम पोर्टल 2A/2B जांच अभी भी सक्रिय है!)`
        : `Synced ${rowsToSync.length} month(s) GSTR-1 & GSTR-3B baseline from software books while keeping Purchase vs Portal 2A/2B checks active.`,
    });
  };

  const openMonthEditor = (row: MonthlyGstAuditRow) => {
    setEditingMonth(row);
    setPortalEditForm({
      gstr1Taxable: String(row.portalGstr1?.outwardTaxable ?? row.booksOutwardTaxable.toFixed(2)),
      gstr1Igst: String(row.portalGstr1?.outwardIgst ?? row.booksOutwardIgst.toFixed(2)),
      gstr1Cgst: String(row.portalGstr1?.outwardCgst ?? row.booksOutwardCgst.toFixed(2)),
      gstr1Sgst: String(row.portalGstr1?.outwardSgst ?? row.booksOutwardSgst.toFixed(2)),
      gstr3bOutTaxable: String(row.portalGstr3b?.outwardTaxable ?? row.booksOutwardTaxable.toFixed(2)),
      gstr3bOutIgst: String(row.portalGstr3b?.outwardIgst ?? row.booksOutwardIgst.toFixed(2)),
      gstr3bOutCgst: String(row.portalGstr3b?.outwardCgst ?? row.booksOutwardCgst.toFixed(2)),
      gstr3bOutSgst: String(row.portalGstr3b?.outwardSgst ?? row.booksOutwardSgst.toFixed(2)),
      gstr3bItcIgst: String(row.portalGstr3b?.itcIgst ?? row.booksItcIgst.toFixed(2)),
      gstr3bItcCgst: String(row.portalGstr3b?.itcCgst ?? row.booksItcCgst.toFixed(2)),
      gstr3bItcSgst: String(row.portalGstr3b?.itcSgst ?? row.booksItcSgst.toFixed(2)),
      gstr3bTaxPaidItc: String(row.portalGstr3b?.taxPaidItc ?? 0),
      gstr3bTaxPaidCash: String(row.portalGstr3b?.taxPaidCash ?? 0),
      arn: row.portalGstr3b?.arn || row.portalGstr1?.arn || '',
    });
  };

  const handleSaveMonthPortalEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMonth || !onUpdateGstPortalData) return;

    const g1: GstPortalFiledReturn = {
      id: `GSTR1_${editingMonth.monthKey}`,
      returnType: 'GSTR1',
      periodKey: editingMonth.monthKey,
      periodLabel: editingMonth.labelEn,
      outwardTaxable: Number(portalEditForm.gstr1Taxable) || 0,
      outwardIgst: Number(portalEditForm.gstr1Igst) || 0,
      outwardCgst: Number(portalEditForm.gstr1Cgst) || 0,
      outwardSgst: Number(portalEditForm.gstr1Sgst) || 0,
      itcIgst: 0,
      itcCgst: 0,
      itcSgst: 0,
      taxPaidItc: 0,
      taxPaidCash: 0,
      arn: portalEditForm.arn.trim(),
      source: 'MANUAL',
    };

    const g3b: GstPortalFiledReturn = {
      id: `GSTR3B_${editingMonth.monthKey}`,
      returnType: 'GSTR3B',
      periodKey: editingMonth.monthKey,
      periodLabel: editingMonth.labelEn,
      outwardTaxable: Number(portalEditForm.gstr3bOutTaxable) || 0,
      outwardIgst: Number(portalEditForm.gstr3bOutIgst) || 0,
      outwardCgst: Number(portalEditForm.gstr3bOutCgst) || 0,
      outwardSgst: Number(portalEditForm.gstr3bOutSgst) || 0,
      itcIgst: Number(portalEditForm.gstr3bItcIgst) || 0,
      itcCgst: Number(portalEditForm.gstr3bItcCgst) || 0,
      itcSgst: Number(portalEditForm.gstr3bItcSgst) || 0,
      taxPaidItc: Number(portalEditForm.gstr3bTaxPaidItc) || 0,
      taxPaidCash: Number(portalEditForm.gstr3bTaxPaidCash) || 0,
      arn: portalEditForm.arn.trim(),
      source: 'MANUAL',
    };

    onUpdateGstPortalData((prev) => {
      const remaining = (prev.filedReturns || []).filter(
        (r) => r.periodKey !== editingMonth.monthKey
      );
      return {
        ...prev,
        filedReturns: [...remaining, g1, g3b],
        lastImportedAt: new Date().toISOString(),
      };
    });
    setEditingMonth(null);
    setNotice({
      type: 'success',
      text: isHindi
        ? `${editingMonth.labelEn} का पोर्टल डेटा सेव हो गया।`
        : `Updated Portal GSTR-1 & GSTR-3B figures for ${editingMonth.labelEn}.`,
    });
  };

  const handleExportAuditExcel = () => {
    const wb = XLSX.utils.book_new();
    const monthlySheet = audit.monthlyRows.map((r) => ({
      Month: r.labelEn,
      Books_Sales_Bills: r.booksSalesCount,
      Books_Outward_Tax: Number(r.booksOutwardTotalTax.toFixed(2)),
      Portal_GSTR1_Tax: r.portalGstr1
        ? Number((r.portalGstr1.outwardIgst + r.portalGstr1.outwardCgst + r.portalGstr1.outwardSgst).toFixed(2))
        : 0,
      Portal_GSTR3B_Out_Tax: r.portalGstr3b
        ? Number((r.portalGstr3b.outwardIgst + r.portalGstr3b.outwardCgst + r.portalGstr3b.outwardSgst).toFixed(2))
        : 0,
      Books_Purchase_Bills: r.booksPurchaseCount,
      Portal_2B_Bills: r.portal2bCount,
      Books_ITC_Total: Number(r.booksItcTotal.toFixed(2)),
      Portal_2B_ITC: Number(r.portal2bItc.toFixed(2)),
      Portal_3B_Claimed_ITC: r.portalGstr3b
        ? Number((r.portalGstr3b.itcIgst + r.portalGstr3b.itcCgst + r.portalGstr3b.itcSgst).toFixed(2))
        : 0,
      Diff_GSTR1_vs_Books: r.outwardDiffGstr1VsBooks,
      Diff_Books_vs_2B_Excess_Risk: r.itcDiffBooksVs2b,
      Audit_Status: r.auditStatus,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlySheet), 'Monthly_Return_Audit');

    if (audit.findings.length > 0) {
      const riskSheet = audit.findings.map((f) => ({
        Severity: f.severity,
        Rule: f.ruleCode,
        Finding: f.titleEn,
        Amount_At_Risk: f.amountAtRisk,
        Details: f.detailEn,
        Sample_Refs: f.affectedRefs.join('; '),
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(riskSheet), 'CA_Audit_Findings');
    }

    XLSX.writeFile(wb, `GST_Return_Audit_Report_FY_${selectedFy}.xlsx`);
  };

  const handlePrintAuditReport = () => {
    const rowsHtml = audit.monthlyRows
      .map((r) => {
        const g1 = r.portalGstr1 ? r.portalGstr1.outwardIgst + r.portalGstr1.outwardCgst + r.portalGstr1.outwardSgst : 0;
        const g3Out = r.portalGstr3b ? r.portalGstr3b.outwardIgst + r.portalGstr3b.outwardCgst + r.portalGstr3b.outwardSgst : 0;
        const g3Itc = r.portalGstr3b ? r.portalGstr3b.itcIgst + r.portalGstr3b.itcCgst + r.portalGstr3b.itcSgst : 0;
        return `
          <tr>
            <td>${r.labelEn}</td>
            <td class="r">${formatCurrency(r.booksOutwardTotalTax, currency)}</td>
            <td class="r">${formatCurrency(g1, currency)}</td>
            <td class="r">${formatCurrency(g3Out, currency)}</td>
            <td class="r">${r.booksPurchaseCount} / ${r.portal2bCount}</td>
            <td class="r">${formatCurrency(r.booksItcTotal, currency)}</td>
            <td class="r">${formatCurrency(r.portal2bItc, currency)}</td>
            <td class="r">${formatCurrency(g3Itc, currency)}</td>
            <td class="r" style="color:${r.itcDiffBooksVs2b > 5 ? '#dc2626' : '#0f172a'}">${formatCurrency(r.itcDiffBooksVs2b, currency)}</td>
            <td>${r.auditStatus}</td>
          </tr>
        `;
      })
      .join('');

    const findingsHtml =
      audit.findings.length === 0
        ? '<p>No critical discrepancies or statutory ITC risks detected in this Financial Year.</p>'
        : audit.findings
            .map(
              (f) => `
            <div style="border:1px solid ${f.severity === 'CRITICAL' ? '#dc2626' : '#d97706'}; padding:10px; margin-bottom:8px; border-radius:6px;">
              <div><strong>[${f.severity}] ${f.ruleCode}</strong> — ${f.titleEn} (At Risk: ${formatCurrency(f.amountAtRisk, currency)})</div>
              <div style="margin-top:4px; color:#334155;">${f.detailEn}</div>
            </div>
          `
            )
            .join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>GST Return vs Software Audit Report - FY ${selectedFy}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #0f172a; margin: 18px; font-size: 11px; }
            .hdr { border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 14px; display: flex; justify-content: space-between; }
            h1 { margin: 0; font-size: 16px; }
            h2 { font-size: 13px; margin: 14px 0 6px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
            th { background: #f1f5f9; font-weight: bold; }
            .r { text-align: right; font-variant-numeric: tabular-nums; }
          </style>
        </head>
        <body>
          <div class="hdr">
            <div>
              <h1>GST RETURN vs SOFTWARE AUDIT REPORT</h1>
              <div>${data.company.name || 'Taxpayer'} · GSTIN: ${data.company.gstin || 'N/A'}</div>
            </div>
            <div style="text-align:right">
              <div><strong>Financial Year:</strong> FY ${selectedFy}</div>
              <div>Compliance Health Score: <strong>${audit.complianceScore}/100</strong></div>
            </div>
          </div>

          <h2>Month-by-Month Reconciliation Matrix (Books vs GSTR-1 / 3B / 2B)</h2>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th class="r">Books Sales Tax</th>
                <th class="r">Portal GSTR-1</th>
                <th class="r">Portal 3B Out</th>
                <th class="r">Pur Bills (B / 2B)</th>
                <th class="r">Books ITC</th>
                <th class="r">Portal 2B ITC</th>
                <th class="r">3B Claimed ITC</th>
                <th class="r">Excess Books ITC</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <h2>Statutory GST Audit Observations & Risk Flags</h2>
          ${findingsHtml}
        </body>
      </html>
    `;
    printHtmlDocument(html, {
      title: `GST Audit Report FY ${selectedFy}`,
      filename: `GST_Audit_Report_FY_${selectedFy}`,
    });
  };

  return (
    <div className="space-y-5">
      <input
        ref={jsonInputRef}
        type="file"
        accept=".json"
        onChange={handleUploadPortalReturnJson}
        className="hidden"
      />

      {/* Header */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 text-[var(--text-primary)] space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-xs text-amber-500 font-semibold">
              {isHindi ? 'सॉफ्टवेयर बनाम जीएसटी पोर्टल ऑडिट' : 'GST Return vs Software Audit'} · FY {selectedFy}
            </div>
            <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2.5">
              <ShieldCheck className="w-6 h-6 text-amber-500 shrink-0" />
              <span>
                {isHindi
                  ? 'जीएसटी रिटर्न बनाम सॉफ्टवेयर ऑडिट रिपोर्ट (Portal vs Books)'
                  : 'GST Return vs Software Books Reconciliation & Audit Report'}
              </span>
            </h2>
            <p className="text-xs text-[var(--text-muted)] max-w-3xl">
              {isHindi
                ? 'पोर्टल पर दाखिल GSTR-1, GSTR-3B और GSTR-2A/2B का सॉफ्टवेयर की बिक्री और खरीद से मिलान करें। खास तौर पर यह पकड़ेगा कि यदि सॉफ्टवेयर में परचेज बिल ज्यादा हैं और पोर्टल पर कम, तो कितना ITC जोखिम में है।'
                : 'Audit what is filed on GST Portal (GSTR-1, GSTR-3B, GSTR-2A/2B) against your Software Sales & Purchase Books. Automatically detects Excess Purchase Bills missing on Portal, Rule 88C mismatches, and Rule 37 180-day unpaid risks.'}
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
              onClick={() => jsonInputRef.current?.click()}
              className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-4 h-4" />
              <span>{isHindi ? 'GSTR-1 / 3B JSON अपलोड' : 'Upload GSTR-1 / 3B JSON'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSyncPortalAsPerBooks()}
              className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="If GSTR-1/3B returns were generated & filed directly from this software, click to sync Portal Return columns with Books."
            >
              <RefreshCw className="w-4 h-4" />
              <span>{isHindi ? 'सॉफ्टवेयर से GSTR-1/3B सिंक' : 'Sync 1/3B Filed = Books'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportAuditExcel}
              className="px-3 py-2.5 hv-elevated hover:bg-[var(--bg-hover)] border border-[var(--border-primary)] text-[var(--text-primary)] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={handlePrintAuditReport}
              className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              <span>{isHindi ? 'ऑडिट रिपोर्ट PDF' : 'Print Audit PDF'}</span>
            </button>
          </div>
        </div>

        {/* Annual Audit Comparison KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-[var(--border-subtle)]">
          <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3.5">
            <div className="text-[11px] text-[var(--text-muted)] font-medium">{isHindi ? 'बुक्स बिक्री टैक्स (Sales)' : 'Books Sales Tax'}</div>
            <div className="text-lg font-bold text-[var(--text-primary)] font-mono tabular-nums mt-0.5">
              {formatCurrency(audit.totals.booksOutwardTax, currency)}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Portal GSTR-1: <span className="font-mono text-indigo-500 font-semibold">{formatCurrency(audit.totals.portalGstr1Tax, currency)}</span>
            </div>
          </div>

          <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3.5">
            <div className="text-[11px] text-[var(--text-muted)] font-medium">{isHindi ? 'GSTR-3B आउटपुट बनाम 1' : '3B Outward vs GSTR-1'}</div>
            <div className="text-lg font-bold text-indigo-500 font-mono tabular-nums mt-0.5">
              {formatCurrency(audit.totals.portalGstr3bOutwardTax, currency)}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Diff: <span className="font-mono text-amber-500 font-semibold">{formatCurrency(audit.totals.portalGstr3bOutwardTax - audit.totals.portalGstr1Tax, currency)}</span>
            </div>
          </div>

          <div className="hv-elevated border border-[var(--border-subtle)] rounded-xl p-3.5">
            <div className="text-[11px] text-[var(--text-muted)] font-medium">{isHindi ? 'परचेज बिल बुक्स ITC' : 'Books Purchase ITC'}</div>
            <div className="text-lg font-bold text-emerald-500 font-mono tabular-nums mt-0.5">
              {formatCurrency(audit.totals.booksItcTotal, currency)}
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
              {audit.totals.booksPurchaseCount} {isHindi ? 'बिल बुक्स में' : 'bills in Books'}
            </div>
          </div>

          <div className="hv-pill-rose border rounded-xl p-3.5">
            <div className="text-[11px] font-semibold">
              {isHindi ? 'पोर्टल 2B ITC बनाम बुक्स' : 'Portal 2B ITC vs Books'}
            </div>
            <div className="text-lg font-bold text-rose-500 font-mono tabular-nums mt-0.5">
              {formatCurrency(audit.totals.portal2bItc, currency)}
            </div>
            <div className="text-[11px] opacity-85 mt-0.5 tabular-nums">
              Gap: {formatCurrency(audit.totals.booksItcTotal - audit.totals.portal2bItc, currency)} ({audit.totals.booksPurchaseCount - audit.totals.portal2bCount} bills)
            </div>
          </div>

          <div className="hv-pill-amber border rounded-xl p-3.5">
            <div className="text-[11px] font-semibold">
              {isHindi ? 'जीएसटी ऑडिट जोखिम स्तर' : 'Audit Health Status'}
            </div>
            <div
              className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                audit.complianceScore >= 85 ? 'text-emerald-500' : audit.complianceScore >= 60 ? 'text-amber-500' : 'text-rose-500'
              }`}
            >
              {audit.complianceScore}% Clean
            </div>
            <div className="text-[11px] opacity-85 mt-0.5 tabular-nums">
              {audit.findings.length} {isHindi ? 'ऑडिट अलर्ट सक्रिय' : 'audit alerts found'}
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div
          className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between gap-2 ${
            notice.type === 'success'
              ? 'hv-pill-emerald'
              : notice.type === 'error'
              ? 'hv-pill-rose'
              : 'hv-pill-indigo'
          }`}
        >
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
            ✕
          </button>
        </div>
      )}

      {/* Advanced Audit Findings (Rule 37, Excess Purchase vs Portal, Rule 88C, Sec 17(5), GSTIN) */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2.5">
          <ShieldAlert className="w-4 h-4 text-amber-500" />
          <span>
            {isHindi
              ? 'प्रमुख ऑडिट निष्कर्ष एवं कानूनी जोखिम जांच (CA Audit Flags)'
              : 'Statutory Audit Findings & Automated Risk Scanner'}
          </span>
        </h3>

        {audit.findings.length === 0 ? (
          <div className="hv-pill-emerald border rounded-xl p-4 text-xs flex items-center gap-2.5 font-medium">
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <span>
              {isHindi
                ? 'इस वित्तीय वर्ष में कोई गंभीर GSTR-1 / 3B / 2B अंतर, 180-दिन बकाया जोखिम या अमान्य GSTIN त्रुटि नहीं मिली।'
                : 'No critical GSTR-1/3B variances, excess Purchase vs Portal gaps, or 180-day unpaid Rule 37 risks detected.'}
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {audit.findings.map((f) => (
              <div
                key={f.id}
                className={`p-4 rounded-xl border space-y-1.5 text-xs ${
                  f.severity === 'CRITICAL'
                    ? 'hv-pill-rose'
                    : f.severity === 'WARNING'
                    ? 'hv-pill-amber'
                    : 'hv-pill-indigo'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold text-[var(--text-primary)] flex items-center gap-1.5">
                    {f.severity === 'CRITICAL' ? (
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                    )}
                    <span>{isHindi ? f.titleHi : f.titleEn}</span>
                  </div>
                  <span className="font-mono font-bold text-amber-500 shrink-0 tabular-nums">
                    {formatCurrency(f.amountAtRisk, currency)}
                  </span>
                </div>
                <div className="text-[11px] opacity-80 font-mono">{f.ruleCode}</div>
                <p className="text-[var(--text-primary)] leading-relaxed">{isHindi ? f.detailHi : f.detailEn}</p>
                {f.affectedRefs.length > 0 && (
                  <div className="text-[11px] font-mono opacity-85 pt-1">
                    Ref: {f.affectedRefs.join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 12-Month Return vs Software Audit Table */}
      <div className="hv-surface border border-[var(--border-primary)] rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              {isHindi
                ? `मासिक रिटर्न बनाम सॉफ्टवेयर मिलान तालिका (अप्रैल – मार्च FY ${selectedFy})`
                : `12-Month Return vs Software Audit Matrix (FY ${selectedFy})`}
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              {isHindi
                ? 'किसी भी माह का पोर्टल GSTR-1 / 3B डेटा बदलने या दर्ज करने के लिए "Edit Portal" पर क्लिक करें।'
                : 'Click "Edit Portal" on any month to enter filed portal figures manually or compare uploaded JSONs.'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-[var(--text-secondary)]">
            <thead className="hv-elevated text-[var(--text-muted)] uppercase text-[10px] font-bold border-b border-[var(--border-primary)]">
              <tr>
                <th className="p-3">{isHindi ? 'माह' : 'Period'}</th>
                <th className="p-3 text-right">{isHindi ? 'बुक्स बिक्री कर' : 'Books Sales Tax'}</th>
                <th className="p-3 text-right">{isHindi ? 'पोर्टल GSTR-1' : 'Portal GSTR-1'}</th>
                <th className="p-3 text-right">{isHindi ? 'पोर्टल 3B देय' : 'Portal 3B Out'}</th>
                <th className="p-3 text-center">{isHindi ? 'बिल (बुक्स / 2B)' : 'Pur Bills (B/2B)'}</th>
                <th className="p-3 text-right">{isHindi ? 'बुक्स ITC' : 'Books ITC'}</th>
                <th className="p-3 text-right">{isHindi ? 'पोर्टल 2B ITC' : 'Portal 2B ITC'}</th>
                <th className="p-3 text-right">{isHindi ? '3B क्लेम ITC' : '3B ITC'}</th>
                <th className="p-3 text-right">{isHindi ? 'बुक्स - 2B जोखिम' : 'Excess Books ITC'}</th>
                <th className="p-3 text-center">{isHindi ? 'स्थिति' : 'Status'}</th>
                <th className="p-3 text-right">{isHindi ? 'क्रिया' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] font-mono tabular-nums">
              {audit.monthlyRows.map((r) => {
                const g1Out = r.portalGstr1
                  ? r.portalGstr1.outwardIgst + r.portalGstr1.outwardCgst + r.portalGstr1.outwardSgst
                  : 0;
                const g3Out = r.portalGstr3b
                  ? r.portalGstr3b.outwardIgst + r.portalGstr3b.outwardCgst + r.portalGstr3b.outwardSgst
                  : 0;
                const g3Itc = r.portalGstr3b
                  ? r.portalGstr3b.itcIgst + r.portalGstr3b.itcCgst + r.portalGstr3b.itcSgst
                  : 0;

                const statusText: Record<MonthlyGstAuditRow['auditStatus'], { label: string; cls: string }> = {
                  RECONCILED: { label: 'Matched', cls: 'text-emerald-500' },
                  OUTWARD_MISMATCH: { label: 'Sales Diff', cls: 'text-amber-500' },
                  ITC_AT_RISK: { label: 'ITC Risk', cls: 'text-rose-500' },
                  BOTH_MISMATCH: { label: 'Mismatch', cls: 'text-rose-500 font-bold' },
                  PORTAL_PENDING: { label: 'No Portal', cls: 'text-[var(--text-muted)]' },
                };

                const st = statusText[r.auditStatus];
                return (
                  <tr key={r.monthKey} className="hover:bg-[var(--bg-hover)]">
                    <td className="p-3 font-sans font-bold text-[var(--text-primary)] whitespace-nowrap">
                      {isHindi ? r.labelHi : r.labelEn}
                    </td>
                    <td className="p-3 text-right text-[var(--text-primary)]">{formatCurrency(r.booksOutwardTotalTax, currency)}</td>
                    <td className="p-3 text-right text-indigo-500">
                      {r.portalGstr1 ? formatCurrency(g1Out, currency) : '-'}
                    </td>
                    <td className="p-3 text-right text-indigo-500">
                      {r.portalGstr3b ? formatCurrency(g3Out, currency) : '-'}
                    </td>
                    <td className="p-3 text-center">
                      <span className="text-[var(--text-primary)]">{r.booksPurchaseCount}</span>
                      <span className="text-[var(--text-muted)]"> / </span>
                      <span className={r.booksPurchaseCount > r.portal2bCount && r.portal2bCount > 0 ? 'text-rose-500 font-bold' : 'text-emerald-500'}>
                        {r.portal2bCount}
                      </span>
                    </td>
                    <td className="p-3 text-right text-emerald-500">{formatCurrency(r.booksItcTotal, currency)}</td>
                    <td className="p-3 text-right text-emerald-500 font-semibold">
                      {r.portal2bCount > 0 ? formatCurrency(r.portal2bItc, currency) : '-'}
                    </td>
                    <td className="p-3 text-right text-[var(--text-primary)]">
                      {r.portalGstr3b ? formatCurrency(g3Itc, currency) : '-'}
                    </td>
                    <td className={`p-3 text-right font-bold ${r.itcDiffBooksVs2b > 5 ? 'text-rose-500' : 'text-[var(--text-muted)]'}`}>
                      {r.itcDiffBooksVs2b !== 0 ? formatCurrency(r.itcDiffBooksVs2b, currency) : '-'}
                    </td>
                    <td className={`p-3 text-center font-sans text-[11px] font-bold ${st.cls}`}>{st.label}</td>
                    <td className="p-3 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => openMonthEditor(r)}
                        className="px-2.5 py-1 hv-pill-amber border rounded-lg text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer hover:opacity-90"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>{isHindi ? 'संपादित' : 'Edit Portal'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Month Portal Filed Return Editor Modal */}
      {editingMonth && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMonthPortalEdit}
            className="hv-surface border border-[var(--border-primary)] rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto text-[var(--text-primary)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-base font-bold text-[var(--text-primary)]">
                  {isHindi ? `पोर्टल रिटर्न प्रविष्टि: ${editingMonth.labelHi}` : `Portal Filed Returns: ${editingMonth.labelEn}`}
                </h3>
                <p className="text-xs text-[var(--text-muted)]">
                  Books Sales Tax: {formatCurrency(editingMonth.booksOutwardTotalTax, currency)} · Books ITC: {formatCurrency(editingMonth.booksItcTotal, currency)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMonth(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="text-indigo-500 font-bold uppercase tracking-wider text-[11px]">Portal GSTR-1 Outward</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Taxable</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr1Taxable} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr1Taxable: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">IGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr1Igst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr1Igst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">CGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr1Cgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr1Cgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">SGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr1Sgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr1Sgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
              </div>

              <div className="text-amber-500 font-bold uppercase tracking-wider text-[11px] pt-2">Portal GSTR-3B Outward & Claimed ITC</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B Taxable</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bOutTaxable} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bOutTaxable: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B Out IGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bOutIgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bOutIgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B Out CGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bOutCgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bOutCgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B Out SGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bOutSgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bOutSgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B ITC IGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bItcIgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bItcIgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 text-emerald-500 font-mono font-semibold" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B ITC CGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bItcCgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bItcCgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 text-emerald-500 font-mono font-semibold" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">3B ITC SGST</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bItcSgst} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bItcSgst: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 text-emerald-500 font-mono font-semibold" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Tax Paid via ITC</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bTaxPaidItc} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bTaxPaidItc: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Tax Paid in Cash</label>
                  <input type="number" step="0.01" value={portalEditForm.gstr3bTaxPaidCash} onChange={(e) => setPortalEditForm({ ...portalEditForm, gstr3bTaxPaidCash: e.target.value })} className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
                <div>
                  <label className="block text-[var(--text-secondary)] mb-1">Portal ARN (Optional)</label>
                  <input type="text" value={portalEditForm.arn} onChange={(e) => setPortalEditForm({ ...portalEditForm, arn: e.target.value })} placeholder="AA230726..." className="w-full hv-input border rounded-xl px-2.5 py-2 font-mono" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setEditingMonth(null)}
                className="px-4 py-2 hv-elevated hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] border border-[var(--border-primary)] text-xs font-bold rounded-xl cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl cursor-pointer"
              >
                {isHindi ? 'पोर्टल डेटा सेव करें' : 'Save Portal Snapshot'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
