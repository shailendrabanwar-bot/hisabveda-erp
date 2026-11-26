import { AppData, PartyMaster, ItemMaster, Account, BankStatementLine } from '../types';
import { formatCurrency } from './storage';
import {
  buildAccountOrPartyLedgerStatement,
  calculatePartyOutstanding,
  calculateAccountBalances,
  calculateClosingStock,
  getEffectiveAccountCategory,
  getEffectiveOpeningStock,
  getSignedLedgerAmount,
  isDirectExpenseLedger,
  isDirectRevenueLedger,
  isEffectiveStockOpeningAccount,
  isFixedAssetLedger,
  isNonCurrentLiabilityLedger,
  mergeAccountsWithBalancesMap
} from './accounting';
import { calculateInventoryValuationReport, ValuationMethod } from './inventoryValuation';
import { loadAppConfig } from './appConfig';
import { getFinancialYearRange } from './fiscalYear';
import { exportElementToPdf, PdfPaperSize, PdfMarginMode } from './pdfExport';

export interface PrintDomOptions {
  paperSize?: PdfPaperSize;
  orientation?: 'portrait' | 'landscape';
  marginMode?: PdfMarginMode;
  title?: string;
}

function resolvePageCssRule(
  paperSize: PdfPaperSize,
  orientation: 'portrait' | 'landscape',
  marginMode: PdfMarginMode
): string {
  const marginVal =
    paperSize === 'Thermal-3inch' || paperSize === 'Thermal-58mm'
      ? '3mm'
      : marginMode === 'compact'
      ? '6mm'
      : marginMode === 'wide'
      ? '16mm'
      : '10mm';

  const sizeVal =
    paperSize === 'A5'
      ? `A5 ${orientation}`
      : paperSize === 'Thermal-3inch'
      ? '80mm auto'
      : paperSize === 'Thermal-58mm'
      ? '58mm auto'
      : `A4 ${orientation}`;

  return `@page { size: ${sizeVal}; margin: ${marginVal}; }`;
}

/**
 * Isolated DOM Element Print Helper:
 * Clones only the target printable sheet into a dedicated root directly on <body>,
 * sets dynamic @page rules from Print Configuration, and triggers window.print()
 * cleanly without overflow-hidden or 100dvh clipping.
 */
export function printDomElement(
  elementIdOrEl: string | HTMLElement,
  options: PrintDomOptions = {}
): void {
  const target =
    typeof elementIdOrEl === 'string'
      ? document.getElementById(elementIdOrEl)
      : elementIdOrEl;

  if (!target) {
    window.print();
    return;
  }

  const cfg = loadAppConfig();
  const paperSize = options.paperSize || cfg.defaultPaperSize || 'A4';
  const orientation = options.orientation || cfg.printOrientation || 'portrait';
  const marginMode = options.marginMode || cfg.printMargins || 'standard';

  // Remove stale print artifacts if any
  document.getElementById('hv-active-print-root')?.remove();
  document.getElementById('hv-dynamic-page-style')?.remove();

  const printRoot = document.createElement('div');
  printRoot.id = 'hv-active-print-root';
  printRoot.style.background = '#ffffff';
  printRoot.style.color = '#0f172a';
  printRoot.style.width = '100%';

  const clone = target.cloneNode(true) as HTMLElement;
  clone.style.transform = 'none';
  clone.style.maxHeight = 'none';
  clone.style.height = 'auto';
  clone.style.overflow = 'visible';
  clone.style.boxShadow = 'none';
  clone.style.margin = '0 auto';

  // Convert any <canvas> elements to <img> so charts/QR codes preserve in cloned DOM
  const origCanvases = Array.from(target.querySelectorAll('canvas'));
  const clonedCanvases = Array.from(clone.querySelectorAll('canvas'));
  origCanvases.forEach((origCanvas, idx) => {
    const clonedCanvas = clonedCanvases[idx];
    if (clonedCanvas && clonedCanvas.parentNode) {
      try {
        const img = document.createElement('img');
        img.src = origCanvas.toDataURL('image/png');
        img.className = clonedCanvas.className;
        img.style.cssText = clonedCanvas.style.cssText;
        clonedCanvas.parentNode.replaceChild(img, clonedCanvas);
      } catch {
        // Ignore tainted canvas
      }
    }
  });

  // Hide elements marked no-print / print:hidden inside clone
  clone.querySelectorAll('.no-print, .print\\:hidden').forEach((el) => {
    (el as HTMLElement).style.display = 'none';
  });

  printRoot.appendChild(clone);
  document.body.appendChild(printRoot);

  const pageStyle = document.createElement('style');
  pageStyle.id = 'hv-dynamic-page-style';
  pageStyle.textContent = `
    @media print {
      ${resolvePageCssRule(paperSize, orientation, marginMode)}
    }
  `;
  document.head.appendChild(pageStyle);

  const prevTitle = document.title;
  if (options.title) {
    document.title = options.title;
  }

  document.body.setAttribute('data-hv-printing', 'true');

  const cleanup = () => {
    document.body.removeAttribute('data-hv-printing');
    document.getElementById('hv-active-print-root')?.remove();
    document.getElementById('hv-dynamic-page-style')?.remove();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);

  setTimeout(() => {
    try {
      window.focus();
      window.print();
    } finally {
      // Fallback cleanup in case afterprint doesn't fire in embedded preview
      setTimeout(cleanup, 1500);
    }
  }, 80);
}

/**
 * Universal print & PDF preview helper that guarantees printing and real PDF download
 * work reliably inside iframes, pop-up blocked environments, and desktop browsers
 * without blocked window.open calls. Applies saved Print Configuration automatically.
 */
export function printHtmlDocument(
  rawHtml: string,
  options: { title?: string; filename?: string } = {}
): void {
  const cfg = loadAppConfig();

  // Strip self-invoking onload print calls that double-trigger inside frames
  let html = rawHtml.replace(/window\.onload\s*=\s*function\s*\(\)\s*\{[\s\S]*?window\.print\(\);?[\s\S]*?\};?/gi, '');

  // Inject configured @page size/margin + optional logo visibility rules
  const pageRule = resolvePageCssRule(
    cfg.defaultPaperSize || 'A4',
    cfg.printOrientation || 'portrait',
    cfg.printMargins || 'standard'
  );
  const logoCss = cfg.showCompanyLogoOnPrint === false ? '.header img { display: none !important; }' : '';
  const sigCss = cfg.showAuthorizedSignatory === false ? '.footer .sig-box, .sig-box { display: none !important; }' : '';
  const injectedStyle = `<style id="__hv_print_cfg_style__">${pageRule} ${logoCss} ${sigCss}</style>`;

  if (html.includes('</head>')) {
    html = html.replace('</head>', `${injectedStyle}</head>`);
  } else {
    html = `${injectedStyle}${html}`;
  }

  showInteractivePrintOverlay(html, options);
}

/**
 * Universal interactive in-app print & PDF preview overlay with Print Configuration bar,
 * Direct Real PDF Download, Print Trigger, and HTML Save.
 */
function showInteractivePrintOverlay(
  html: string,
  options: { title?: string; filename?: string } = {}
): void {
  const existingOverlay = document.getElementById('__interactive_print_overlay__');
  if (existingOverlay) {
    existingOverlay.remove();
  }

  let cfg = loadAppConfig();
  let currentPaper: PdfPaperSize = cfg.defaultPaperSize || 'A4';
  let currentOrientation: 'portrait' | 'landscape' = cfg.printOrientation || 'portrait';
  let currentMargin: PdfMarginMode = cfg.printMargins || 'standard';

  const overlay = document.createElement('div');
  overlay.id = '__interactive_print_overlay__';
  overlay.className = 'no-print';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '99999';
  overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.88)';
  overlay.style.backdropFilter = 'blur(6px)';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '16px';

  const reportTitle = options.title || 'रिपोर्ट प्रिंट एवं PDF पूर्वावलोकन (Report Print & PDF Preview)';
  const baseFilename = options.filename || `HisabVeda_Report_${new Date().toISOString().split('T')[0]}`;

  overlay.innerHTML = `
    <div style="background: #0f172a; border: 1px solid #334155; border-radius: 16px; width: 100%; max-width: 980px; max-height: 94vh; display: flex; flex-direction: column; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); overflow: hidden; font-family: system-ui, -apple-system, sans-serif;">
      <div style="padding: 12px 18px; background: #1e293b; border-bottom: 1px solid #334155; display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; align-items: center;">
        <div style="color: #f8fafc; font-weight: 700; font-size: 14px; display: flex; align-items: center; gap: 8px;">
          <span>📄 ${reportTitle}</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
          <select id="__cfg_paper__" style="background: #0f172a; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 600;">
            <option value="A4" ${currentPaper === 'A4' ? 'selected' : ''}>A4 Sheet</option>
            <option value="A5" ${currentPaper === 'A5' ? 'selected' : ''}>A5 Half</option>
          </select>
          <select id="__cfg_orient__" style="background: #0f172a; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 600;">
            <option value="portrait" ${currentOrientation === 'portrait' ? 'selected' : ''}>Portrait</option>
            <option value="landscape" ${currentOrientation === 'landscape' ? 'selected' : ''}>Landscape</option>
          </select>
          <select id="__cfg_margin__" style="background: #0f172a; color: #e2e8f0; border: 1px solid #475569; border-radius: 8px; padding: 6px 8px; font-size: 12px; font-weight: 600;">
            <option value="compact" ${currentMargin === 'compact' ? 'selected' : ''}>Narrow Margin</option>
            <option value="standard" ${currentMargin === 'standard' ? 'selected' : ''}>Standard Margin</option>
            <option value="wide" ${currentMargin === 'wide' ? 'selected' : ''}>Wide Margin</option>
          </select>
          <button id="__btn_overlay_pdf__" style="background: #059669; color: white; border: none; padding: 7px 14px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            ⬇️ PDF डाउनलोड
          </button>
          <button id="__btn_overlay_print__" style="background: #4f46e5; color: white; border: none; padding: 7px 15px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            🖨️ प्रिंट करें
          </button>
          <button id="__btn_overlay_download__" style="background: #0284c7; color: white; border: none; padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer;">
            HTML
          </button>
          <button id="__btn_overlay_close__" style="background: #334155; color: #cbd5e1; border: none; padding: 7px 12px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer;">
            ✕
          </button>
        </div>
      </div>
      <div style="flex: 1; overflow-y: auto; background: #0b1120; padding: 18px; display: flex; justify-content: center;">
        <iframe id="__inner_print_frame__" style="width: 100%; max-width: 840px; height: 76vh; border: 1px solid #334155; border-radius: 10px; background: #ffffff; box-shadow: 0 10px 25px rgba(0,0,0,0.4);"></iframe>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const innerFrame = document.getElementById('__inner_print_frame__') as HTMLIFrameElement | null;
  const writeFrameHtml = () => {
    if (!innerFrame) return;
    const doc = innerFrame.contentWindow?.document || innerFrame.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      const styleEl = doc.getElementById('__hv_print_cfg_style__');
      const rule = resolvePageCssRule(currentPaper, currentOrientation, currentMargin);
      if (styleEl) {
        styleEl.textContent = `${rule} ${cfg.showCompanyLogoOnPrint === false ? '.header img { display: none !important; }' : ''}`;
      }
      innerFrame.style.maxWidth = currentOrientation === 'landscape' ? '920px' : currentPaper === 'A5' ? '580px' : '820px';
    }
  };
  writeFrameHtml();

  document.getElementById('__cfg_paper__')?.addEventListener('change', (e) => {
    currentPaper = (e.target as HTMLSelectElement).value as PdfPaperSize;
    writeFrameHtml();
  });
  document.getElementById('__cfg_orient__')?.addEventListener('change', (e) => {
    currentOrientation = (e.target as HTMLSelectElement).value as 'portrait' | 'landscape';
    writeFrameHtml();
  });
  document.getElementById('__cfg_margin__')?.addEventListener('change', (e) => {
    currentMargin = (e.target as HTMLSelectElement).value as PdfMarginMode;
    writeFrameHtml();
  });

  document.getElementById('__btn_overlay_close__')?.addEventListener('click', () => {
    overlay.remove();
  });

  // Real PDF Download from the rendered iframe document body
  const pdfBtn = document.getElementById('__btn_overlay_pdf__') as HTMLButtonElement | null;
  pdfBtn?.addEventListener('click', async () => {
    const doc = innerFrame?.contentWindow?.document || innerFrame?.contentDocument;
    if (!doc?.body) return;
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.textContent = '⏳ PDF बन रहा है...';
    }
    const ok = await exportElementToPdf(doc.body, {
      filename: baseFilename,
      paperSize: currentPaper,
      orientation: currentOrientation,
      marginMode: currentMargin,
      scale: 2
    });
    if (pdfBtn) {
      pdfBtn.disabled = false;
      pdfBtn.textContent = ok ? '✅ PDF सहेजा गया' : '⬇️ PDF डाउनलोड';
      setTimeout(() => {
        if (pdfBtn) pdfBtn.textContent = '⬇️ PDF डाउनलोड';
      }, 2500);
    }
  });

  // Reliable Print Trigger: try iframe print, also support direct isolated DOM print fallback
  document.getElementById('__btn_overlay_print__')?.addEventListener('click', () => {
    try {
      const win = innerFrame?.contentWindow;
      if (win) {
        win.focus();
        win.print();
        return;
      }
    } catch {
      // Fallback below
    }
    const doc = innerFrame?.contentWindow?.document || innerFrame?.contentDocument;
    if (doc?.body) {
      printDomElement(doc.body, {
        paperSize: currentPaper,
        orientation: currentOrientation,
        marginMode: currentMargin,
        title: reportTitle
      });
    } else {
      window.print();
    }
  });

  document.getElementById('__btn_overlay_download__')?.addEventListener('click', () => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseFilename}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

/**
 * Clean isolated window print for Party Ledger (Customer / Supplier Statement)
 */
export function printPartyLedger(party: PartyMaster, data: AppData, isHindi: boolean = false, options: PrintLedgerOptions = {}) {
  const company = data.company;
  const currency = company.currency;
  const { fromDate, toDate } = options;

  const statement = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: party.id,
    targetName: party.name,
    preferredKind: 'PARTY',
    startDate: fromDate,
    endDate: toDate
  });

  const periodOpeningNet = statement.openingForPeriod;
  const periodOpeningDr = periodOpeningNet >= 0 ? periodOpeningNet : 0;
  const periodOpeningCr = periodOpeningNet < 0 ? Math.abs(periodOpeningNet) : 0;

  let totalDebitSum = periodOpeningDr + statement.totalDebit;
  let totalCreditSum = periodOpeningCr + statement.totalCredit;

  const rowsHtml = statement.rows.map(r => {
    return `
      <tr>
        <td>${r.date}</td>
        <td>${r.particulars}</td>
        <td>${r.voucherType}</td>
        <td style="font-family: monospace; font-weight: bold;">${r.voucherNo}</td>
        <td style="text-align: right; font-family: monospace;">${r.debit > 0 ? formatCurrency(r.debit, currency) : '-'}</td>
        <td style="text-align: right; font-family: monospace;">${r.credit > 0 ? formatCurrency(r.credit, currency) : '-'}</td>
        <td style="text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(r.runningBalance, currency)} (${r.runningType})</td>
      </tr>
    `;
  }).join('');

  // Closing balance math for bottom section (Image 2 format)
  const netDiff = totalDebitSum - totalCreditSum; // > 0 means DR balance
  let closingRowHtml = '';
  let finalTotalDr = 0;
  let finalTotalCr = 0;

  if (netDiff > 0) {
    // Net is DR balance => "By Closing Balance" in Credit column
    closingRowHtml = `
      <tr style="font-weight: bold; background-color: #f1f5f9;">
        <td>${toDate || new Date().toISOString().split('T')[0]}</td>
        <td colspan="3" style="color: #0284c7;">By Closing Balance</td>
        <td style="text-align: right; font-family: monospace;">-</td>
        <td style="text-align: right; font-family: monospace; color: #0284c7;">${formatCurrency(netDiff, currency)}</td>
        <td style="text-align: right; font-family: monospace;">-</td>
      </tr>
    `;
    finalTotalDr = totalDebitSum;
    finalTotalCr = totalCreditSum + netDiff;
  } else if (netDiff < 0) {
    // Net is CR balance => "To Closing Balance" in Debit column
    const absDiff = Math.abs(netDiff);
    closingRowHtml = `
      <tr style="font-weight: bold; background-color: #f1f5f9;">
        <td>${toDate || new Date().toISOString().split('T')[0]}</td>
        <td colspan="3" style="color: #0284c7;">To Closing Balance</td>
        <td style="text-align: right; font-family: monospace; color: #0284c7;">${formatCurrency(absDiff, currency)}</td>
        <td style="text-align: right; font-family: monospace;">-</td>
        <td style="text-align: right; font-family: monospace;">-</td>
      </tr>
    `;
    finalTotalDr = totalDebitSum + absDiff;
    finalTotalCr = totalCreditSum;
  } else {
    finalTotalDr = totalDebitSum;
    finalTotalCr = totalCreditSum;
  }

  const periodOpeningTypeStr = periodOpeningNet >= 0 ? 'DR' : 'CR';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Ledger Statement - ${party.name}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company-title { font-size: 22px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .company-sub { font-size: 11px; color: #475569; margin-top: 3px; }
          .report-title { font-size: 15px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-top: 6px; }
          .party-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 15px; font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
          th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #cbd5e1; }
          td { padding: 8px; border: 1px solid #cbd5e1; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 30px; border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; align-items: center; gap: 15px;">
            ${company.logoUrl ? `<img src="${company.logoUrl}" alt="Logo" style="max-height: 60px; max-width: 140px; object-fit: contain; border-radius: 4px;" />` : ''}
            <div>
              <h1 class="company-title">${company.name}</h1>
              <div class="company-sub">${company.address || ''} ${company.phone ? `| Phone: ${company.phone}` : ''} ${company.email ? `| Email: ${company.email}` : ''}</div>
              <div class="company-sub"><b>GSTIN:</b> ${company.gstin || 'N/A'} ${company.pan ? `| <b>PAN:</b> ${company.pan}` : ''}</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #475569;">
            <div class="report-title">${isHindi ? 'खाता लेज़र विवरण (Ledger Account Statement)' : 'Party Ledger Account Statement'}</div>
            <div><b>Statement Date:</b> ${new Date().toLocaleDateString('en-IN')}</div>
            <div><b>Period:</b> ${fromDate || '1-Apr-2026'} to ${toDate || 'Present'}</div>
          </div>
        </div>

        <div class="party-card">
          <div>
            <div><b>Party Name:</b> <span style="font-size: 13px; font-weight: bold; color: #1e3a8a;">${party.name}</span></div>
            <div><b>Legal / Trade Name:</b> ${party.legalName || party.name}</div>
            <div><b>GSTIN / UIN:</b> ${party.gstin || 'Unregistered'} (${party.gstCategory || 'REGULAR'})</div>
            <div><b>Address:</b> ${party.address || 'N/A'}, ${party.state || 'Delhi'}</div>
          </div>
          <div>
            <div><b>Contact Phone:</b> ${party.phone || 'N/A'}</div>
            <div><b>Email:</b> ${party.email || 'N/A'}</div>
            <div><b>Opening Balance:</b> ${formatCurrency(Math.abs(periodOpeningNet), currency)} (${periodOpeningTypeStr})</div>
            <div><b>Closing Outstanding Balance:</b> <span style="font-weight: bold; color: ${netDiff >= 0 ? '#15803d' : '#b91c1c'};">${formatCurrency(Math.abs(netDiff), currency)} (${netDiff >= 0 ? 'DR' : 'CR'})</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%;">Date</th>
              <th style="width: 32%;">Particulars</th>
              <th style="width: 14%;">Vch Type</th>
              <th style="width: 14%;">Vch No.</th>
              <th style="width: 10%; text-align: right;">Debit (${currency})</th>
              <th style="width: 10%; text-align: right;">Credit (${currency})</th>
              <th style="width: 10%; text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td>${fromDate || 'Opening'}</td>
              <td colspan="3">${periodOpeningTypeStr === 'DR' ? 'To Opening Balance' : 'By Opening Balance'}</td>
              <td style="text-align: right; font-family: monospace;">${periodOpeningDr > 0 ? formatCurrency(periodOpeningDr, currency) : '-'}</td>
              <td style="text-align: right; font-family: monospace;">${periodOpeningCr > 0 ? formatCurrency(periodOpeningCr, currency) : '-'}</td>
              <td style="text-align: right; font-family: monospace;">${formatCurrency(Math.abs(periodOpeningNet), currency)} (${periodOpeningTypeStr})</td>
            </tr>
            ${rowsHtml || '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #64748b;">No transactions recorded for this period.</td></tr>'}
            
            <tr style="font-weight: bold; background-color: #f8fafc; border-top: 2px solid #94a3b8;">
              <td colspan="4" style="text-align: right; text-transform: uppercase;">Total Posting Sum:</td>
              <td style="text-align: right; font-family: monospace; color: #15803d;">${formatCurrency(totalDebitSum, currency)}</td>
              <td style="text-align: right; font-family: monospace; color: #b91c1c;">${formatCurrency(totalCreditSum, currency)}</td>
              <td style="text-align: right; font-family: monospace;">-</td>
            </tr>
            
            ${closingRowHtml}

            <tr style="font-weight: bold; background-color: #e2e8f0; border-top: 2px solid #1e3a8a; border-bottom: 2px solid #1e3a8a; font-size: 12px;">
              <td colspan="4" style="text-align: right; text-transform: uppercase; color: #1e3a8a;">Balanced Total:</td>
              <td style="text-align: right; font-family: monospace; color: #1e3a8a;">${formatCurrency(finalTotalDr, currency)}</td>
              <td style="text-align: right; font-family: monospace; color: #1e3a8a;">${formatCurrency(finalTotalCr, currency)}</td>
              <td style="text-align: right; font-family: monospace; color: #1e3a8a;">0.00</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <span>Printed from Hisabveda ERP Platform</span>
          <span><b>For ${company.name}</b><br/><br/><br/><b>Authorized Signatory & Stamp</b></span>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}

/**
 * Clean isolated window print for Stock Item Ledger Register
 */
export function printStockLedger(item: ItemMaster, data: AppData, isHindi: boolean = false) {
  const company = data.company;
  const currency = company.currency;

  const movements: Array<{
    date: string;
    refNo: string;
    partyName: string;
    type: 'INWARD' | 'OUTWARD';
    qty: number;
    rate: number;
    amount: number;
  }> = [];

  // Sales Invoices (Outward Movement)
  for (const inv of data.invoices || []) {
    if (inv.status === 'CANCELLED') continue;
    for (const it of inv.items || []) {
      if (it.itemId === item.id || it.itemName.toLowerCase() === item.name.toLowerCase()) {
        movements.push({
          date: inv.date,
          refNo: inv.invoiceNumber,
          partyName: inv.partyName,
          type: 'OUTWARD',
          qty: it.quantity,
          rate: it.rate,
          amount: it.totalAmount
        });
      }
    }
  }

  // Purchase Invoices (Inward Movement)
  for (const pur of data.purchaseInvoices || []) {
    if (pur.status === 'CANCELLED') continue;
    for (const it of pur.items || []) {
      if (it.itemId === item.id || it.itemName.toLowerCase() === item.name.toLowerCase()) {
        movements.push({
          date: pur.date,
          refNo: pur.billNumber,
          partyName: pur.partyName,
          type: 'INWARD',
          qty: it.quantity,
          rate: it.rate,
          amount: it.totalAmount
        });
      }
    }
  }

  movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  let currentStock = item.currentStock || 0;
  let totalInward = 0;
  let totalOutward = 0;

  const rowsHtml = movements.map(m => {
    if (m.type === 'INWARD') totalInward += m.qty;
    else totalOutward += m.qty;

    return `
      <tr>
        <td>${m.date}</td>
        <td style="font-family: monospace; font-weight: bold;">${m.refNo}</td>
        <td>${m.partyName}</td>
        <td><span style="font-weight: bold; color: ${m.type === 'INWARD' ? '#047857' : '#b91c1c'};">${m.type}</span></td>
        <td style="text-align: right; font-family: monospace; color: #047857;">${m.type === 'INWARD' ? m.qty : '-'}</td>
        <td style="text-align: right; font-family: monospace; color: #b91c1c;">${m.type === 'OUTWARD' ? m.qty : '-'}</td>
        <td style="text-align: right; font-family: monospace;">${formatCurrency(m.rate, currency)}</td>
        <td style="text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(m.amount, currency)}</td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Stock Movement Register - ${item.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 25px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company-title { font-size: 22px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .company-sub { font-size: 11px; color: #475569; margin-top: 4px; }
          .report-title { font-size: 16px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-top: 10px; }
          .stock-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #cbd5e1; }
          td { padding: 8px; border: 1px solid #e2e8f0; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="company-title">${company.name}</h1>
            <div class="company-sub">${company.address} | GSTIN: ${company.gstin || 'N/A'}</div>
            <div class="report-title">${isHindi ? 'स्टॉक रजिस्टर रिपोर्ट (Stock Movement Ledger)' : 'Stock Item Movement Register'}</div>
          </div>
          <div style="text-align: right; font-size: 11px; color: #475569;">
            <div><b>Generated On:</b> ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div class="stock-card">
          <div>
            <div><b>Item Name:</b> ${item.name}</div>
            <div><b>Item Code:</b> ${item.code}</div>
            <div><b>Category:</b> ${item.category || 'General'}</div>
            <div><b>HSN / SAC:</b> ${item.hsnSacCode || 'N/A'}</div>
          </div>
          <div>
            <div><b>GST Tax Rate:</b> ${item.taxRate}%</div>
            <div><b>Purchase Price:</b> ${formatCurrency(item.purchasePrice, currency)}</div>
            <div><b>Sales Price:</b> ${formatCurrency(item.salesPrice, currency)}</div>
            <div><b>Current On-Hand Stock:</b> <span style="font-weight: bold; color: #1e3a8a;">${currentStock} ${item.unit}</span></div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Document #</th>
              <th>Party Name</th>
              <th>Movement</th>
              <th style="text-align: right;">Inward Qty</th>
              <th style="text-align: right;">Outward Qty</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="text-align: center; padding: 20px;">No stock movements recorded yet.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <span>Generated from Hisabveda ERP Platform</span>
          <span><b>Authorized Signatory</b></span>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}

export interface PrintLedgerOptions {
  showNarration?: boolean;
  showBankRef?: boolean;
  showOpposingLedger?: boolean;
  showRunningBalance?: boolean;
  fromDate?: string;
  toDate?: string;
}

/**
 * Clean isolated window print for General Account Ledger Statement with Custom Options
 */
export function printAccountLedgerCustom(
  account: Account,
  data: AppData,
  isHindi: boolean = false,
  options: PrintLedgerOptions = {}
) {
  const {
    showNarration = true,
    showBankRef = true,
    showOpposingLedger = true,
    showRunningBalance = true,
    fromDate,
    toDate
  } = options;

  const company = data.company;
  const currency = company.currency;

  const statement = buildAccountOrPartyLedgerStatement(data, {
    partyOrAccountId: account.id,
    targetName: account.name,
    preferredKind: 'ACCOUNT',
    startDate: fromDate,
    endDate: toDate
  });

  const periodOpening = statement.openingForPeriod;

  const rowsHtml = statement.rows.map(line => {
    let detailsText = '';
    if (showOpposingLedger) {
      detailsText += `<b>${line.opposingLedger || line.particulars}</b>`;
    }
    if (showBankRef && line.bankRef) {
      detailsText += `<div style="font-size: 10px; color: #0284c7; font-family: monospace;">Ref/UTR: ${line.bankRef}</div>`;
    }
    if (showNarration && line.narration) {
      detailsText += `<div style="font-size: 10px; color: #64748b; font-style: italic;">Note: ${line.narration}</div>`;
    }

    return `
      <tr>
        <td>${line.date}</td>
        <td style="font-family: monospace; font-weight: bold;">${line.voucherNo}</td>
        <td>${line.voucherType}</td>
        <td>${detailsText || line.particulars || 'Posting'}</td>
        <td style="text-align: right; color: #15803d; font-family: monospace;">${line.debit > 0 ? formatCurrency(line.debit, currency) : '-'}</td>
        <td style="text-align: right; color: #b91c1c; font-family: monospace;">${line.credit > 0 ? formatCurrency(line.credit, currency) : '-'}</td>
        ${showRunningBalance ? `<td style="text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(line.runningBalance, currency)} (${line.runningType})</td>` : ''}
      </tr>
    `;
  }).join('');

  const periodOpeningType = periodOpening >= 0 ? 'DR' : 'CR';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Account Ledger - ${account.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 25px; color: #0f172a; line-height: 1.4; }
          .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .company-title { font-size: 22px; font-weight: bold; color: #1e3a8a; margin: 0; }
          .company-sub { font-size: 11px; color: #475569; margin-top: 4px; }
          .report-title { font-size: 16px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-top: 10px; }
          .account-card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 12px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
          th { background-color: #f1f5f9; color: #1e293b; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #cbd5e1; }
          td { padding: 8px; border: 1px solid #e2e8f0; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .footer { margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b; }
          @media print {
            body { padding: 0; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1 class="company-title">${company.name}</h1>
            <div class="company-sub">${company.address} | GSTIN: ${company.gstin || 'N/A'}</div>
            <div class="report-title">${isHindi ? 'खाता लेज़र विवरण (Account General Ledger)' : 'General Ledger Account Statement'}</div>
            ${fromDate || toDate ? `<div style="font-size: 11px; color: #0284c7; margin-top: 4px; font-weight: bold;">Period: ${fromDate || 'Beginning'} to ${toDate || 'Present'}</div>` : ''}
          </div>
          <div style="text-align: right; font-size: 11px; color: #475569;">
            <div><b>Printed Date:</b> ${new Date().toLocaleDateString()}</div>
          </div>
        </div>

        <div class="account-card">
          <div>
            <div><b>Account Head:</b> ${account.name} (Code: ${account.code})</div>
            <div><b>Group Category:</b> ${account.category} (${account.subCategory})</div>
          </div>
          <div style="text-align: right;">
            <div><b>Period Opening Balance:</b> ${formatCurrency(Math.abs(periodOpening), currency)} (${periodOpeningType})</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Voucher #</th>
              <th>Type</th>
              <th>Particulars & Opposing Ledger</th>
              <th style="text-align: right;">Debit (DR)</th>
              <th style="text-align: right;">Credit (CR)</th>
              ${showRunningBalance ? `<td style="text-align: right; font-weight: bold;">Running Balance</td>` : ''}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="4"><b>OPENING BALANCE ${fromDate ? `(As on ${fromDate})` : ''}</b></td>
              <td style="text-align: right; font-family: monospace;">${periodOpeningType === 'DR' ? formatCurrency(Math.abs(periodOpening), currency) : '-'}</td>
              <td style="text-align: right; font-family: monospace;">${periodOpeningType === 'CR' ? formatCurrency(Math.abs(periodOpening), currency) : '-'}</td>
              ${showRunningBalance ? `<td style="text-align: right; font-weight: bold; font-family: monospace;">${formatCurrency(Math.abs(periodOpening), currency)} (${periodOpeningType})</td>` : ''}
            </tr>
            ${rowsHtml || `<tr><td colspan="${showRunningBalance ? 7 : 6}" style="text-align: center; padding: 20px;">No postings recorded for this account.</td></tr>`}
          </tbody>
        </table>

        <div class="footer">
          <span>Printed from Hisabveda ERP Platform</span>
          <span><b>Authorized Signatory</b></span>
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}

/**
 * Clean isolated window print for General Account Ledger Statement
 */
export function printAccountLedger(account: Account, data: AppData, isHindi: boolean = false) {
  printAccountLedgerCustom(account, data, isHindi, {
    showNarration: true,
    showBankRef: true,
    showOpposingLedger: true,
    showRunningBalance: true
  });
}

/**
 * Professional, Indian Accounting Standards Compliant Financial Statement Print Engine
 * Supports: Trading & P&L, Balance Sheet, Standard Trial Balance, Schedule III Disclosures
 */
export interface TrialBalancePrintOptions {
  showOpening?: boolean;
  showTransactions?: boolean;
  showClosing?: boolean;
}

export function printFinancialStatementReport(
  reportType: 'TRADING_PL' | 'BS' | 'TB' | 'SCH34',
  data: AppData,
  isHindi: boolean = false,
  periodLabel?: string,
  tbOptions?: TrialBalancePrintOptions
) {
  const company = data.company;
  const currency = company.currency || 'INR';
  const balancesMap = calculateAccountBalances(data);
  const allMergedAccounts = mergeAccountsWithBalancesMap(data, balancesMap);
  const closingStock = calculateClosingStock(data);

  // Group accounts by recursive effective category (including dynamic balancesMap ledgers)
  const revenueAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'REVENUE');
  const expenseAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'EXPENSE');
  const assetAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'ASSET');
  const liabilityAccounts = allMergedAccounts.filter(a => getEffectiveAccountCategory(a, data.accountGroups) === 'LIABILITY');
  const allBalancesList = Array.from(balancesMap.values());

  const salesAccounts = revenueAccounts.filter(a => isDirectRevenueLedger(a, data.accountGroups));
  const indirectRevenueAccounts = revenueAccounts.filter(a => !salesAccounts.some(s => s.id === a.id));
  const directExpenseAccounts = expenseAccounts.filter(a => isDirectExpenseLedger(a, data.accountGroups));
  const indirectExpenseAccounts = expenseAccounts.filter(a => !directExpenseAccounts.some(d => d.id === a.id));

  const openingStock = getEffectiveOpeningStock(data);

  // Trading Calculations
  let totalSalesRevenue = 0;
  for (const acc of salesAccounts) {
    totalSalesRevenue += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  let totalDirectExpenses = 0;
  for (const acc of directExpenseAccounts) {
    totalDirectExpenses += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  const totalTradingDebit = openingStock + totalDirectExpenses;
  const totalTradingCredit = totalSalesRevenue + closingStock;
  const grossProfit = totalTradingCredit - totalTradingDebit;

  // P&L Calculations
  let totalIndirectIncome = 0;
  for (const acc of indirectRevenueAccounts) {
    totalIndirectIncome += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  let totalIndirectExpenses = 0;
  for (const acc of indirectExpenseAccounts) {
    totalIndirectExpenses += getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
  }
  const totalPlCredits = (grossProfit > 0 ? grossProfit : 0) + totalIndirectIncome;
  const totalPlDebits = (grossProfit < 0 ? Math.abs(grossProfit) : 0) + totalIndirectExpenses;
  const netProfit = totalPlCredits - totalPlDebits;

  // Balance Sheet Calculations
  let fixedAssetsTotal = 0;
  let otherAssetsTotal = 0;
  for (const acc of assetAccounts) {
    if (isEffectiveStockOpeningAccount(acc, data)) continue;
    const bal = getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
    if (isFixedAssetLedger(acc, data.accountGroups)) {
      fixedAssetsTotal += bal;
    } else {
      otherAssetsTotal += bal;
    }
  }
  const totalAssets = fixedAssetsTotal + otherAssetsTotal + closingStock;

  let totalCapitalEquity = 0;
  for (const bal of allBalancesList) {
    if (getEffectiveAccountCategory(bal.account, data.accountGroups) === 'EQUITY') {
      totalCapitalEquity += getSignedLedgerAmount(bal, 'EQUITY');
    }
  }
  let totalLiabilities = 0;
  let nonCurrentLiabTotal = 0;
  let currentLiabTotal = 0;
  for (const acc of liabilityAccounts) {
    const val = getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
    totalLiabilities += val;
    if (isNonCurrentLiabilityLedger(acc, data.accountGroups)) {
      nonCurrentLiabTotal += val;
    } else {
      currentLiabTotal += val;
    }
  }
  const totalLiabAndEquity = totalCapitalEquity + netProfit + totalLiabilities;
  const bsDifference = totalAssets - totalLiabAndEquity;

  let reportTitle = '';
  let contentHtml = '';

  interface StatementItem {
    name: string;
    amount: number;
    isBold?: boolean;
    isHeader?: boolean;
    highlight?: 'green' | 'red';
  }

  if (reportType === 'TRADING_PL') {
    reportTitle = isHindi 
      ? 'व्यापारिक तथा लाभ व हानि खाता (Trading & Profit Loss Account)' 
      : 'Trading and Profit & Loss Account';

    // 1. TRADING ACCOUNT ITEMS
    const tradingDebits: StatementItem[] = [
      { name: 'To Opening Stock (प्रारम्भिक स्टॉक)', amount: openingStock, isBold: true }
    ];
    for (const acc of directExpenseAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) {
        tradingDebits.push({ name: `To ${acc.name} (${acc.code})`, amount: val });
      }
    }

    const tradingCredits: StatementItem[] = [];
    for (const acc of salesAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) {
        tradingCredits.push({ name: `By ${acc.name} (${acc.code})`, amount: val });
      }
    }
    if (tradingCredits.length === 0 && totalSalesRevenue !== 0) {
      tradingCredits.push({ name: 'By Sales & Direct Revenues', amount: totalSalesRevenue, isBold: true });
    }
    tradingCredits.push({ name: 'By Closing Stock (अंतिम स्टॉक)', amount: closingStock, isBold: true });

    if (grossProfit >= 0) {
      tradingDebits.push({ name: 'To Gross Profit c/d (सकल लाभ)', amount: grossProfit, isBold: true, highlight: 'green' });
    } else {
      tradingCredits.push({ name: 'By Gross Loss c/d (सकल हानि)', amount: Math.abs(grossProfit), isBold: true, highlight: 'red' });
    }

    const tradingMaxRows = Math.max(tradingDebits.length, tradingCredits.length);
    const tradingTableTotal = Math.max(totalTradingDebit + (grossProfit > 0 ? grossProfit : 0), totalTradingCredit + (grossProfit < 0 ? Math.abs(grossProfit) : 0));

    // 2. PROFIT & LOSS ITEMS
    const plDebits: StatementItem[] = [];
    const plCredits: StatementItem[] = [];

    if (grossProfit < 0) {
      plDebits.push({ name: 'To Gross Loss b/d (सकल हानि अंतरण)', amount: Math.abs(grossProfit), isBold: true, highlight: 'red' });
    } else if (grossProfit >= 0) {
      plCredits.push({ name: 'By Gross Profit b/d (सकल लाभ अंतरण)', amount: grossProfit, isBold: true, highlight: 'green' });
    }

    for (const acc of indirectExpenseAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) {
        plDebits.push({ name: `To ${acc.name} (${acc.code})`, amount: val });
      }
    }

    for (const acc of indirectRevenueAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) {
        plCredits.push({ name: `By ${acc.name} (${acc.code})`, amount: val });
      }
    }

    if (netProfit >= 0) {
      plDebits.push({ name: 'To Net Profit Transferred to Capital (शुद्ध लाभ)', amount: netProfit, isBold: true, highlight: 'green' });
    } else {
      plCredits.push({ name: 'By Net Loss Transferred to Capital (शुद्ध हानि)', amount: Math.abs(netProfit), isBold: true, highlight: 'red' });
    }

    const plMaxRows = Math.max(plDebits.length, plCredits.length);
    const plTableTotal = Math.max(totalPlDebits + (netProfit > 0 ? netProfit : 0), totalPlCredits + (netProfit < 0 ? Math.abs(netProfit) : 0));

    contentHtml = `
      <div class="section-title">1. TRADING ACCOUNT SECTION (व्यापारिक खाता विवरण)</div>
      <table class="grid-table">
        <thead>
          <tr>
            <th style="width: 35%;">Dr. Particulars (डेबिट व्यय)</th>
            <th style="width: 15%; text-align: right;">Amount (${currency})</th>
            <th style="width: 35%;">Cr. Particulars (क्रेडिट आय)</th>
            <th style="width: 15%; text-align: right;">Amount (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: tradingMaxRows }).map((_, idx) => {
            const dr = tradingDebits[idx];
            const cr = tradingCredits[idx];
            return `
              <tr>
                <td style="${dr?.isBold ? 'font-weight: bold;' : ''}">${dr ? dr.name : ''}</td>
                <td style="text-align: right; ${dr?.highlight === 'green' ? 'color: #15803d; font-weight: bold;' : ''}" class="mono">${dr ? formatCurrency(dr.amount, currency) : ''}</td>
                <td style="${cr?.isBold ? 'font-weight: bold;' : ''}">${cr ? cr.name : ''}</td>
                <td style="text-align: right; ${cr?.highlight === 'green' ? 'color: #15803d; font-weight: bold;' : cr?.highlight === 'red' ? 'color: #b91c1c; font-weight: bold;' : ''}" class="mono">${cr ? formatCurrency(cr.amount, currency) : ''}</td>
              </tr>
            `;
          }).join('')}
          <tr class="total-row">
            <td><b>TRADING TOTAL (DEBIT)</b></td>
            <td style="text-align: right;" class="mono"><b>${formatCurrency(tradingTableTotal, currency)}</b></td>
            <td><b>TRADING TOTAL (CREDIT)</b></td>
            <td style="text-align: right;" class="mono"><b>${formatCurrency(tradingTableTotal, currency)}</b></td>
          </tr>
        </tbody>
      </table>

      <div class="section-title" style="margin-top: 25px;">2. PROFIT & LOSS ACCOUNT SECTION (लाभ व हानि विवरण)</div>
      <table class="grid-table">
        <thead>
          <tr>
            <th style="width: 35%;">Dr. Expenses (अप्रत्यक्ष व्यय)</th>
            <th style="width: 15%; text-align: right;">Amount (${currency})</th>
            <th style="width: 35%;">Cr. Income (अप्रत्यक्ष आय)</th>
            <th style="width: 15%; text-align: right;">Amount (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: plMaxRows }).map((_, idx) => {
            const dr = plDebits[idx];
            const cr = plCredits[idx];
            return `
              <tr>
                <td style="${dr?.isBold ? 'font-weight: bold;' : ''}">${dr ? dr.name : ''}</td>
                <td style="text-align: right; ${dr?.highlight === 'green' ? 'color: #15803d; font-weight: bold;' : dr?.highlight === 'red' ? 'color: #b91c1c; font-weight: bold;' : ''}" class="mono">${dr ? formatCurrency(dr.amount, currency) : ''}</td>
                <td style="${cr?.isBold ? 'font-weight: bold;' : ''}">${cr ? cr.name : ''}</td>
                <td style="text-align: right; ${cr?.highlight === 'green' ? 'color: #15803d; font-weight: bold;' : cr?.highlight === 'red' ? 'color: #b91c1c; font-weight: bold;' : ''}" class="mono">${cr ? formatCurrency(cr.amount, currency) : ''}</td>
              </tr>
            `;
          }).join('')}
          <tr class="total-row">
            <td><b>P&L TOTAL (DEBIT)</b></td>
            <td style="text-align: right;" class="mono"><b>${formatCurrency(plTableTotal, currency)}</b></td>
            <td><b>P&L TOTAL (CREDIT)</b></td>
            <td style="text-align: right;" class="mono"><b>${formatCurrency(plTableTotal, currency)}</b></td>
          </tr>
        </tbody>
      </table>
    `;
  } else if (reportType === 'BS') {
    reportTitle = isHindi 
      ? 'बैलेंस शीट / स्थिति विवरण (Balance Sheet as per Accounting Standards)' 
      : 'Balance Sheet Statement';

    // 1. LIABILITIES & CAPITAL ITEMS
    const bsLiabilities: StatementItem[] = [
      { name: 'A. CAPITAL & RESERVES (पूंजी व आरक्षित कोष)', amount: 0, isBold: true, isHeader: true }
    ];

    const equityAccounts = allMergedAccounts.filter(a => a.category === 'EQUITY');
    for (const acc of equityAccounts) {
      const bal = balancesMap.get(acc.id);
      const val = bal ? (bal.balanceType === 'CR' ? bal.netBalance : -bal.netBalance) : 0;
      if (val !== 0) {
        bsLiabilities.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
      }
    }
    if (equityAccounts.length === 0 || totalCapitalEquity !== 0) {
      if (!bsLiabilities.some(x => !x.isHeader)) {
        bsLiabilities.push({ name: '  Proprietor / Partner / Equity Capital', amount: totalCapitalEquity });
      }
    }

    if (netProfit !== 0) {
      bsLiabilities.push({ 
        name: netProfit >= 0 ? '  Add: Net Profit for the Year' : '  Less: Net Loss for the Year', 
        amount: netProfit,
        isBold: true,
        highlight: netProfit >= 0 ? 'green' : 'red'
      });
    }

    bsLiabilities.push({ name: 'B. LIABILITIES (देनदारियां व दायित्व)', amount: 0, isBold: true, isHeader: true });
    for (const acc of liabilityAccounts) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), acc.category);
      if (Math.abs(val) > 0.005) {
        bsLiabilities.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
      }
    }

    // 2. ASSETS ITEMS
    const bsAssets: StatementItem[] = [
      { name: 'C. FIXED ASSETS (अचल संपत्तियां)', amount: 0, isBold: true, isHeader: true }
    ];

    const fixedAssetList = assetAccounts.filter(a => isFixedAssetLedger(a, data.accountGroups));

    for (const acc of fixedAssetList) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
      if (Math.abs(val) > 0.005) {
        bsAssets.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
      }
    }
    if (fixedAssetList.length === 0 && fixedAssetsTotal > 0) {
      bsAssets.push({ name: '  Property, Plant & Equipment', amount: fixedAssetsTotal });
    }

    bsAssets.push({ name: 'D. CURRENT ASSETS & RECEIVABLES (चालू संपत्तियां)', amount: 0, isBold: true, isHeader: true });
    if (Math.abs(closingStock) > 0.005) {
      bsAssets.push({ name: '  Closing Stock in Hand (अंतिम स्टॉक)', amount: closingStock, isBold: true });
    }

    const nonFixedAssets = assetAccounts.filter(a => !fixedAssetList.some(f => f.id === a.id) && !isEffectiveStockOpeningAccount(a, data));
    for (const acc of nonFixedAssets) {
      const val = getSignedLedgerAmount(balancesMap.get(acc.id), getEffectiveAccountCategory(acc, data.accountGroups));
      if (Math.abs(val) > 0.005) {
        bsAssets.push({ name: `  ${acc.name} (${acc.code})`, amount: val });
      }
    }

    const bsMaxRows = Math.max(bsLiabilities.length, bsAssets.length);

    contentHtml = `
      <table class="grid-table">
        <thead>
          <tr>
            <th style="width: 35%;">Liabilities & Equity (पूंजी व दायित्व)</th>
            <th style="width: 15%; text-align: right;">Amount (${currency})</th>
            <th style="width: 35%;">Assets (संपत्तियां व प्राप्य)</th>
            <th style="width: 15%; text-align: right;">Amount (${currency})</th>
          </tr>
        </thead>
        <tbody>
          ${Array.from({ length: bsMaxRows }).map((_, idx) => {
            const l = bsLiabilities[idx];
            const a = bsAssets[idx];
            const isLHeader = l?.isHeader;
            const isAHeader = a?.isHeader;

            return `
              <tr style="${(isLHeader || isAHeader) ? 'background-color: #f8fafc; font-weight: bold;' : ''}">
                <td style="${l?.isBold ? 'font-weight: bold;' : ''}">${l ? l.name : ''}</td>
                <td style="text-align: right; ${l?.highlight === 'green' ? 'color: #15803d; font-weight: bold;' : l?.highlight === 'red' ? 'color: #b91c1c; font-weight: bold;' : ''}" class="mono">
                  ${l && !isLHeader ? formatCurrency(l.amount, currency) : ''}
                </td>
                <td style="${a?.isBold ? 'font-weight: bold;' : ''}">${a ? a.name : ''}</td>
                <td style="text-align: right; ${a?.highlight === 'green' ? 'color: #15803d; font-weight: bold;' : ''}" class="mono">
                  ${a && !isAHeader ? formatCurrency(a.amount, currency) : ''}
                </td>
              </tr>
            `;
          }).join('')}
          <tr class="total-row">
            <td><b>TOTAL LIABILITIES & EQUITY</b></td>
            <td style="text-align: right;" class="mono"><b>${formatCurrency(totalLiabAndEquity, currency)}</b></td>
            <td><b>TOTAL ASSETS</b></td>
            <td style="text-align: right;" class="mono"><b>${formatCurrency(totalAssets, currency)}</b></td>
          </tr>
        </tbody>
      </table>

      ${Math.abs(bsDifference) > 0.05 ? `
        <div style="margin-top: 15px; padding: 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; font-size: 11px; color: #9f1239;">
          ⚠️ <b>Unreconciled Difference:</b> ${formatCurrency(Math.abs(bsDifference), currency)} (Please review ledger opening balances or suspense postings).
        </div>
      ` : `
        <div style="margin-top: 15px; padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 11px; color: #166534; font-weight: bold;">
          ✅ Balance Sheet is 100% Mathematically Balanced (Assets = Liabilities + Equity).
        </div>
      `}
    `;
  } else if (reportType === 'TB') {
    reportTitle = isHindi 
      ? 'तलपट / जांच सूची (Standard Trial Balance Statement)' 
      : 'Standard Trial Balance Statement';

    const showOpen = tbOptions?.showOpening ?? false;
    const showTx = tbOptions?.showTransactions ?? false;
    const showClose = tbOptions?.showClosing ?? true;

    let totalOpenDr = 0;
    let totalOpenCr = 0;
    let totalTxDr = 0;
    let totalTxCr = 0;
    let totalCloseDr = 0;
    let totalCloseCr = 0;

    const tbEntries = allBalancesList
      .map(bal => {
        if (!bal) return null;
        const acc = bal.account;
        const openDr = acc.balanceType === 'DR' ? (acc.openingBalance || 0) : 0;
        const openCr = acc.balanceType === 'CR' ? (acc.openingBalance || 0) : 0;
        const txDr = Math.max(0, Math.round((bal.debit - openDr) * 100) / 100);
        const txCr = Math.max(0, Math.round((bal.credit - openCr) * 100) / 100);
        const closeDr = bal.balanceType === 'DR' ? bal.netBalance : 0;
        const closeCr = bal.balanceType === 'CR' ? bal.netBalance : 0;
        const hasActivity = openDr > 0.001 || openCr > 0.001 || txDr > 0.001 || txCr > 0.001 || closeDr > 0.001 || closeCr > 0.001;
        if (!hasActivity) return null;
        return { bal, openDr, openCr, txDr, txCr, closeDr, closeCr };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    const rows = tbEntries.map(({ bal, openDr, openCr, txDr, txCr, closeDr, closeCr }) => {
      totalOpenDr += openDr;
      totalOpenCr += openCr;
      totalTxDr += txDr;
      totalTxCr += txCr;
      totalCloseDr += closeDr;
      totalCloseCr += closeCr;
      return `
        <tr>
          <td class="mono font-bold">${bal.account.code}</td>
          <td><b>${bal.account.name}</b></td>
          <td><span class="badge">${bal.account.category}</span> - ${bal.account.subCategory || '-'}</td>
          ${showOpen ? `<td style="text-align: right;" class="mono">${openDr > 0.001 ? formatCurrency(openDr, currency) : '-'}</td><td style="text-align: right;" class="mono">${openCr > 0.001 ? formatCurrency(openCr, currency) : '-'}</td>` : ''}
          ${showTx ? `<td style="text-align: right;" class="mono">${txDr > 0.001 ? formatCurrency(txDr, currency) : '-'}</td><td style="text-align: right;" class="mono">${txCr > 0.001 ? formatCurrency(txCr, currency) : '-'}</td>` : ''}
          ${showClose ? `<td style="text-align: right;" class="mono">${closeDr > 0.001 ? formatCurrency(closeDr, currency) : '-'}</td><td style="text-align: right;" class="mono">${closeCr > 0.001 ? formatCurrency(closeCr, currency) : '-'}</td>` : ''}
        </tr>
      `;
    }).join('');

    const colCount = 3 + (showOpen ? 2 : 0) + (showTx ? 2 : 0) + (showClose ? 2 : 0);

    contentHtml = `
      <table class="grid-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Account Head Name (खाता नाम)</th>
            <th>Group / Category</th>
            ${showOpen ? `<th style="text-align: right;">Opening DR</th><th style="text-align: right;">Opening CR</th>` : ''}
            ${showTx ? `<th style="text-align: right;">Txns Debit</th><th style="text-align: right;">Txns Credit</th>` : ''}
            ${showClose ? `<th style="text-align: right;">Closing DR</th><th style="text-align: right;">Closing CR</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="${colCount}" style="text-align: center; padding: 20px;">No ledger balances found.</td></tr>`}
          <tr class="total-row">
            <td colspan="3"><b>GRAND TOTAL TRIAL BALANCE</b></td>
            ${showOpen ? `<td style="text-align: right;" class="mono font-bold"><b>${formatCurrency(totalOpenDr, currency)}</b></td><td style="text-align: right;" class="mono font-bold"><b>${formatCurrency(totalOpenCr, currency)}</b></td>` : ''}
            ${showTx ? `<td style="text-align: right;" class="mono font-bold"><b>${formatCurrency(totalTxDr, currency)}</b></td><td style="text-align: right;" class="mono font-bold"><b>${formatCurrency(totalTxCr, currency)}</b></td>` : ''}
            ${showClose ? `<td style="text-align: right;" class="mono font-bold"><b>${formatCurrency(totalCloseDr, currency)}</b></td><td style="text-align: right;" class="mono font-bold"><b>${formatCurrency(totalCloseCr, currency)}</b></td>` : ''}
          </tr>
        </tbody>
      </table>

      ${Math.abs(totalCloseDr - totalCloseCr) < 0.05 ? `
        <div style="margin-top: 15px; padding: 8px 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; font-size: 11px; color: #166534; font-weight: bold;">
          ✅ Trial Balance is 100% Balanced (Total Debits match Total Credits).
        </div>
      ` : `
        <div style="margin-top: 15px; padding: 10px; background: #fff1f2; border: 1px solid #fecdd3; border-radius: 6px; font-size: 11px; color: #9f1239;">
          ⚠️ <b>Trial Balance Difference:</b> ${formatCurrency(Math.abs(totalCloseDr - totalCloseCr), currency)}.
        </div>
      `}
    `;
  } else {
    reportTitle = isHindi 
      ? 'Schedule III / IV प्रकटीकरण विवरण (Corporate Financial Disclosures)' 
      : 'Schedule III / IV Statutory Disclosures';

    contentHtml = `
      <div class="section-title">SCHEDULE III - PART I: FORM OF BALANCE SHEET</div>
      <table class="grid-table">
        <thead>
          <tr>
            <th style="width: 60%;">Particulars</th>
            <th style="width: 15%;">Note No.</th>
            <th style="width: 25%; text-align: right;">Figures as at End of Current Period (${currency})</th>
          </tr>
        </thead>
        <tbody>
          <tr style="background: #f8fafc; font-weight: bold;"><td colspan="3">I. EQUITY AND LIABILITIES</td></tr>
          <tr><td>(1) Shareholders' Funds / Capital</td><td>1</td><td style="text-align: right;" class="mono">${formatCurrency(totalCapitalEquity, currency)}</td></tr>
          <tr><td>(2) Reserves & Surplus / Retained Earnings</td><td>2</td><td style="text-align: right;" class="mono">${formatCurrency(netProfit, currency)}</td></tr>
          <tr><td>(3) Non-Current Liabilities (Long-term borrowings)</td><td>3</td><td style="text-align: right;" class="mono">${formatCurrency(nonCurrentLiabTotal, currency)}</td></tr>
          <tr><td>(4) Current Liabilities (Trade payables, short-term provisions)</td><td>4</td><td style="text-align: right;" class="mono">${formatCurrency(currentLiabTotal, currency)}</td></tr>
          <tr class="total-row"><td colspan="2"><b>TOTAL EQUITY & LIABILITIES</b></td><td style="text-align: right;" class="mono"><b>${formatCurrency(totalLiabAndEquity, currency)}</b></td></tr>
          
          <tr style="background: #f8fafc; font-weight: bold;"><td colspan="3">II. ASSETS</td></tr>
          <tr><td>(1) Non-Current Assets (Property, Plant, Equipment)</td><td>5</td><td style="text-align: right;" class="mono">${formatCurrency(fixedAssetsTotal, currency)}</td></tr>
          <tr><td>(2) Current Assets (Inventories, Trade receivables, Cash & bank)</td><td>6</td><td style="text-align: right;" class="mono">${formatCurrency(otherAssetsTotal + closingStock, currency)}</td></tr>
          <tr class="total-row"><td colspan="2"><b>TOTAL ASSETS</b></td><td style="text-align: right;" class="mono"><b>${formatCurrency(totalAssets, currency)}</b></td></tr>
        </tbody>
      </table>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8" />
        <title>${reportTitle} - ${company.name}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm 10mm 12mm 10mm;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            padding: 15px 25px;
            color: #0f172a;
            line-height: 1.4;
            background: #ffffff;
            margin: 0;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .header {
            border-bottom: 2.5px solid #1e3a8a;
            padding-bottom: 12px;
            margin-bottom: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .company-title {
            font-size: 20px;
            font-weight: 800;
            color: #1e3a8a;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: -0.02em;
          }
          .company-sub {
            font-size: 10.5px;
            color: #475569;
            margin-top: 2px;
          }
          .report-title {
            font-size: 14px;
            font-weight: 800;
            color: #0369a1;
            text-transform: uppercase;
            margin-top: 4px;
          }
          .section-title {
            font-size: 11.5px;
            font-weight: 800;
            color: #1e293b;
            background: #f1f5f9;
            padding: 6px 10px;
            border-left: 4px solid #1e3a8a;
            margin-bottom: 6px;
            text-transform: uppercase;
          }
          .grid-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 4px;
            font-size: 10.5px;
          }
          .grid-table thead {
            display: table-header-group;
          }
          .grid-table th {
            background-color: #1e3a8a !important;
            color: #ffffff !important;
            font-weight: 700;
            text-align: left;
            padding: 7px 8px;
            border: 1px solid #94a3b8;
          }
          .grid-table td {
            padding: 6px 8px;
            border: 1px solid #cbd5e1;
            vertical-align: middle;
          }
          .grid-table tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }
          .grid-table tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .total-row {
            background-color: #e2e8f0 !important;
            font-weight: 800 !important;
            border-top: 2px solid #0f172a !important;
            border-bottom: 2px solid #0f172a !important;
          }
          .mono {
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          }
          .badge {
            background: #e0e7ff;
            color: #3730a3;
            padding: 1px 5px;
            border-radius: 4px;
            font-size: 9px;
            font-weight: bold;
          }
          .footer {
            margin-top: 35px;
            border-top: 1px solid #cbd5e1;
            padding-top: 15px;
            display: flex;
            justify-content: space-between;
            font-size: 10.5px;
            color: #475569;
            page-break-inside: avoid;
          }
          .sig-box {
            text-align: center;
            width: 190px;
          }
          .sig-line {
            border-bottom: 1px solid #94a3b8;
            height: 38px;
            margin-bottom: 5px;
          }
          @media print {
            body {
              padding: 0;
              background: #ffffff !important;
            }
            .grid-table th {
              background-color: #1e3a8a !important;
              color: #ffffff !important;
            }
            .total-row {
              background-color: #e2e8f0 !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="display: flex; align-items: center; gap: 14px;">
            ${company.logoUrl ? `<img src="${company.logoUrl}" alt="Logo" style="max-height: 55px; max-width: 130px; object-fit: contain; border-radius: 4px;" />` : ''}
            <div>
              <h1 class="company-title">${company.name}</h1>
              <div class="company-sub">${company.address || ''} ${company.phone ? `| Phone: ${company.phone}` : ''} ${company.email ? `| Email: ${company.email}` : ''}</div>
              <div class="company-sub"><b>GSTIN:</b> ${company.gstin || 'URP'} ${company.pan ? `| <b>PAN:</b> ${company.pan}` : ''}</div>
            </div>
          </div>
          <div style="text-align: right; font-size: 10.5px; color: #475569;">
            <div class="report-title">${reportTitle}</div>
            <div><b>Financial Period:</b> ${periodLabel || getFinancialYearRange(company.financialYearStart).displayRange}</div>
            <div><b>Generated Date:</b> ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            <div><b>Denomination:</b> Indian Rupees (${currency})</div>
          </div>
        </div>

        ${contentHtml}

        <div class="footer">
          <div class="sig-box">
            <div class="sig-line"></div>
            <span>Prepared By Accountant</span>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <span>Internal Auditor / CA</span>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <span><b>For ${company.name}</b><br/>Authorized Signatory</span>
          </div>
        </div>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}

/**
 * Official BRS (Bank Reconciliation Statement) Print Generator
 */
export function printBrsReport(
  data: AppData,
  selectedBank: Account | undefined,
  balances: any,
  statementLines: BankStatementLine[],
  isHindi: boolean = false
) {
  const company = data.company;
  const currency = company.currency || 'INR';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Bank Reconciliation Statement - ${selectedBank?.name || 'Bank'}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #0f172a; line-height: 1.4; background: #ffffff; }
          .header { border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 18px; text-align: center; }
          .company-title { font-size: 22px; font-weight: 800; color: #1e3a8a; margin: 0; text-transform: uppercase; }
          .company-sub { font-size: 11px; color: #475569; margin-top: 3px; }
          .report-title { font-size: 15px; font-weight: bold; color: #0284c7; text-transform: uppercase; margin-top: 6px; }
          .meta { font-size: 11px; color: #475569; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
          th { background-color: #1e3a8a; color: #ffffff; font-weight: bold; text-align: left; padding: 9px; border: 1px solid #cbd5e1; }
          td { padding: 9px; border: 1px solid #cbd5e1; }
          .mono { font-family: monospace; }
          .total-row { background-color: #e2e8f0; font-weight: bold; }
          .footer { margin-top: 50px; border-top: 1px solid #cbd5e1; padding-top: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #64748b; }
          .sig-box { text-align: center; width: 200px; }
          .sig-line { border-bottom: 1px solid #94a3b8; height: 40px; margin-bottom: 5px; }
          @media print {
            body { padding: 0; background: #ffffff; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="company-title">${company.name}</h1>
          <div class="company-sub">${company.address || ''} | GSTIN: ${company.gstin || 'N/A'} | Phone: ${company.phone || 'N/A'}</div>
          <div class="report-title">${isHindi ? 'बैंक समाधान विवरण (Bank Reconciliation Statement)' : 'BANK RECONCILIATION STATEMENT (BRS)'}</div>
          <div class="meta">Bank Account: <b>${selectedBank?.name || 'Bank A/c'}</b> (${selectedBank?.accountNumber ? `A/c: ${selectedBank.accountNumber}` : `Code: ${selectedBank?.code}`}) | As on: <b>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</b></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 75%;">Particulars / विवरण</th>
              <th style="width: 25%; text-align: right;">Amount (${currency})</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #f8fafc; font-weight: bold;">
              <td>1. Balance as per Company Books / Ledger (बहीखाते अनुसार बैंक शेष)</td>
              <td style="text-align: right;" class="mono font-bold">${formatCurrency(balances.bookBalance, currency)}</td>
            </tr>
            <tr>
              <td style="padding-left: 20px;">(+) Amounts directly Credited / Deposited in Bank Statement (बैंक में जमा जो बहियों में लंबित है)</td>
              <td style="text-align: right; color: #15803d;" class="mono font-bold">+${formatCurrency(balances.unreconciledCredits, currency)}</td>
            </tr>
            <tr>
              <td style="padding-left: 20px;">(-) Direct Debits / Bank Charges / Outflows in Statement (बैंक द्वारा काटी गई राशि जो बहियों में दर्ज नहीं थी)</td>
              <td style="text-align: right; color: #b91c1c;" class="mono font-bold">-${formatCurrency(balances.unreconciledDebits, currency)}</td>
            </tr>
            <tr style="background-color: #f1f5f9; font-weight: bold;">
              <td>Adjusted / Reconciled Bank Balance (समायोजित बैंक शेष)</td>
              <td style="text-align: right;" class="mono font-bold">${formatCurrency(balances.statementClosingBalance, currency)}</td>
            </tr>
            <tr style="background: #f0fdf4; font-weight: bold;">
              <td>2. Balance as per Bank Statement / Passbook (बैंक पासबुक अनुसार अंतिम शेष)</td>
              <td style="text-align: right;" class="mono font-bold text-green">${formatCurrency(balances.statementClosingBalance, currency)}</td>
            </tr>
            <tr class="total-row">
              <td><b>NET RECONCILIATION DIFFERENCE (समाधान अंतर)</b></td>
              <td style="text-align: right;" class="mono"><b>${balances.difference < 0.05 ? 'NIL (₹ 0.00)' : formatCurrency(balances.difference, currency)}</b></td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 15px; font-size: 11px; color: ${balances.difference < 0.05 ? '#15803d' : '#b91c1c'}; font-weight: bold;">
          ${balances.difference < 0.05 
            ? '✅ Fully Balanced: Bank Passbook and Company Ledger match 100% with zero unresolved variance.' 
            : `⚠️ Variance of ${formatCurrency(balances.difference, currency)} requires matching or creating adjusting vouchers.`}
        </div>

        <div class="footer">
          <div class="sig-box">
            <div class="sig-line"></div>
            <span>Prepared By Accountant</span>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <span>Auditor / Authorized Signatory</span>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <span><b>For ${company.name}</b><br/>Official Seal & Stamp</span>
          </div>
        </div>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}

/**
 * Official Inventory Valuation Statement & Stock Summary Print
 */
export function printInventoryValuationReport(
  data: AppData,
  method: ValuationMethod = 'COST',
  isHindi: boolean = false
) {
  const company = data.company;
  const currency = company.currency;
  const report = calculateInventoryValuationReport(data, method);

  const methodLabels: { [key in ValuationMethod]: string } = {
    COST: isHindi ? 'लागत मूल्य आधार (Purchase Cost Price Basis)' : 'Cost Price Basis (Purchase Rate)',
    SALES: isHindi ? 'बिक्री मूल्य आधार (Realizable Selling Price Basis)' : 'Realizable Sales Value Basis',
    WAC: isHindi ? 'भारित औसत लागत (Weighted Average Cost - WAC)' : 'Weighted Average Cost (WAC)',
    FIFO: isHindi ? 'प्रथम आगमन प्रथम निर्गमन (First-In, First-Out - FIFO)' : 'First-In, First-Out (FIFO)'
  };

  const rowsHtml = report.items.map((row, idx) => `
    <tr style="${row.isLowStock ? 'background-color: #fffbeb;' : ''}">
      <td style="text-align: center;" class="mono">${idx + 1}</td>
      <td class="mono font-bold">${row.item.code || '-'}</td>
      <td>
        <b>${row.item.name}</b>
        <div style="font-size: 10px; color: #64748b;">HSN: ${row.item.hsnSacCode || '-'} | Category: ${row.category}</div>
      </td>
      <td style="text-align: center;">${row.unit}</td>
      <td style="text-align: right;" class="mono font-bold ${row.isOutOfStock ? 'text-red' : (row.isLowStock ? 'text-amber' : '')}">
        ${row.currentStock}
        ${row.isLowStock ? `<span style="font-size: 9px; color: #d97706; display: block;">${isHindi ? 'कम स्टॉक' : 'LOW'}</span>` : ''}
      </td>
      <td style="text-align: right;" class="mono">${row.reorderPoint}</td>
      <td style="text-align: right;" class="mono">${formatCurrency(row.effectiveRate, currency)}</td>
      <td style="text-align: right;" class="mono font-bold">${formatCurrency(row.valuationAmount, currency)}</td>
      <td style="text-align: right;" class="mono">${formatCurrency(row.salesRate, currency)}</td>
      <td style="text-align: right;" class="mono">${formatCurrency(row.salesValuationAmount, currency)}</td>
    </tr>
  `).join('');

  const catRowsHtml = report.categories.map(c => `
    <tr>
      <td><b>${c.category}</b></td>
      <td style="text-align: center;">${c.itemsCount}</td>
      <td style="text-align: right;" class="mono">${c.totalQuantity}</td>
      <td style="text-align: right;" class="mono font-bold">${formatCurrency(c.totalCostValuation, currency)}</td>
      <td style="text-align: right;" class="mono">${formatCurrency(c.totalSalesValuation, currency)}</td>
      <td style="text-align: right;" class="mono">${c.sharePercent.toFixed(1)}%</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Inventory Valuation Statement - ${company.name}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm 10mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; color: #0f172a; line-height: 1.4; }
          .header { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px; }
          .company-name { font-size: 20px; font-weight: 800; color: #0f172a; text-transform: uppercase; }
          .company-details { font-size: 11px; color: #475569; margin-top: 3px; }
          .report-title { font-size: 15px; font-weight: 800; color: #0369a1; margin-top: 6px; letter-spacing: 0.5px; }
          .badge-box { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th { background-color: #0f172a; color: #ffffff; font-weight: 700; padding: 6px 8px; font-size: 10px; text-transform: uppercase; border: 1px solid #334155; }
          td { padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 10.5px; }
          .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
          .font-bold { font-weight: 700; }
          .text-red { color: #dc2626; }
          .text-amber { color: #d97706; }
          .total-row { background-color: #f1f5f9; font-weight: 800; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; }
          .footer { margin-top: 25px; display: flex; justify-content: space-between; }
          .sig-box { text-align: center; width: 200px; }
          .sig-line { border-top: 1px solid #475569; margin-top: 40px; margin-bottom: 5px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="company-name">${company.name}</div>
          <div class="company-details">${company.address} • GSTIN: ${company.gstin || 'N/A'} • Phone: ${company.phone || '-'}</div>
          <div class="report-title">${isHindi ? 'इन्वेंटरी स्टॉक मूल्यांकन विवरण' : 'INVENTORY VALUATION & STOCK SUMMARY STATEMENT'}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
            ${isHindi ? 'मूल्यांकन पद्धति' : 'Valuation Method'}: <b>${methodLabels[method]}</b> | As on: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </div>
        </div>

        <div class="badge-box">
          <div><b>Total Distinct Items:</b> ${report.totalItems}</div>
          <div><b>Total Physical Units:</b> ${report.totalStockUnits}</div>
          <div><b>Cost Valuation:</b> <span class="mono font-bold">${formatCurrency(report.totalCostValuation, currency)}</span></div>
          <div><b>Sales Value:</b> <span class="mono font-bold">${formatCurrency(report.totalSalesValuation, currency)}</span></div>
          <div><b>Potential Margin:</b> <span class="mono font-bold" style="color: #16a34a;">${formatCurrency(report.totalPotentialProfit, currency)} (${report.overallProfitMarginPercent.toFixed(1)}%)</span></div>
          <div><b>Reorder Alerts:</b> <span class="mono font-bold ${report.lowStockCount > 0 ? 'text-amber' : ''}">${report.lowStockCount} items</span></div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px;">#</th>
              <th style="width: 80px;">Item Code</th>
              <th>Item Name & Description</th>
              <th style="width: 50px;">Unit</th>
              <th style="width: 65px; text-align: right;">In-Stock</th>
              <th style="width: 60px; text-align: right;">Reorder</th>
              <th style="width: 80px; text-align: right;">Val. Rate</th>
              <th style="width: 95px; text-align: right;">Total Valuation</th>
              <th style="width: 80px; text-align: right;">Sales Rate</th>
              <th style="width: 95px; text-align: right;">Realizable Value</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="4" style="text-align: right;"><b>TOTAL (कुल योग):</b></td>
              <td style="text-align: right;" class="mono font-bold">${report.totalStockUnits}</td>
              <td></td>
              <td></td>
              <td style="text-align: right;" class="mono font-bold">${formatCurrency(report.totalCostValuation, currency)}</td>
              <td></td>
              <td style="text-align: right;" class="mono font-bold">${formatCurrency(report.totalSalesValuation, currency)}</td>
            </tr>
          </tbody>
        </table>

        <!-- Category Summary -->
        <div style="font-weight: 800; font-size: 12px; margin-bottom: 6px; color: #0369a1;">
          ${isHindi ? 'श्रेणी-वार स्टॉक सारांश (Category-wise Stock Breakdown):' : 'Category-wise Stock Valuation Breakdown:'}
        </div>
        <table>
          <thead>
            <tr>
              <th>Category</th>
              <th style="width: 90px; text-align: center;">Item Count</th>
              <th style="width: 100px; text-align: right;">Stock Qty</th>
              <th style="width: 130px; text-align: right;">Cost Valuation</th>
              <th style="width: 130px; text-align: right;">Sales Realizable</th>
              <th style="width: 90px; text-align: right;">Share %</th>
            </tr>
          </thead>
          <tbody>
            ${catRowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div class="sig-box">
            <div class="sig-line"></div>
            <span>Store In-Charge / Warehouse</span>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <span>Internal Auditor</span>
          </div>
          <div class="sig-box">
            <div class="sig-line"></div>
            <span><b>For ${company.name}</b><br/>Authorized Signatory</span>
          </div>
        </div>
      </body>
    </html>
  `;

  printHtmlDocument(html);
}

