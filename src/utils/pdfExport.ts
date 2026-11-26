import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export type PdfPaperSize = 'A4' | 'A5' | 'Thermal-3inch' | 'Thermal-58mm';
export type PdfMarginMode = 'compact' | 'standard' | 'wide';

export interface PdfExportOptions {
  filename: string;
  orientation?: 'portrait' | 'landscape';
  paperSize?: PdfPaperSize;
  marginMode?: PdfMarginMode;
  title?: string;
  scale?: number;
}

// Reusable 1x1 2D canvas context to resolve modern CSS color functions (oklch, oklab, lab, lch, color-mix) into standard hex/rgba
let colorResolverCtx: CanvasRenderingContext2D | null = null;
function getColorResolverContext(): CanvasRenderingContext2D | null {
  if (colorResolverCtx) return colorResolverCtx;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  colorResolverCtx = c.getContext('2d');
  return colorResolverCtx;
}

const colorResolutionCache = new Map<string, string>();

/**
 * Resolves any single CSS color expression (e.g. oklch(...), oklab(...), color-mix(...))
 * into an rgb(...) / rgba(...) / #rrggbb string supported by html2canvas@1.4.
 */
function resolveColorExpressionToRgb(expr: string, fallback = '#0f172a'): string {
  const cached = colorResolutionCache.get(expr);
  if (cached) return cached;

  try {
    // Use DOM getComputedStyle on a temp probe for color-mix/oklch/oklab when needed
    const ctx = getColorResolverContext();
    if (ctx) {
      ctx.fillStyle = '#010203';
      ctx.fillStyle = expr;
      const firstPass = ctx.fillStyle;
      if (
        firstPass &&
        !firstPass.includes('oklch') &&
        !firstPass.includes('oklab') &&
        !firstPass.includes('color-mix') &&
        !firstPass.includes('lab(') &&
        !firstPass.includes('lch(')
      ) {
        // Check if it stayed #010203 only because expr was actually rejected
        ctx.fillStyle = '#fe0102';
        ctx.fillStyle = expr;
        if (ctx.fillStyle !== '#fe0102' || expr.toLowerCase().includes('fe0102')) {
          colorResolutionCache.set(expr, ctx.fillStyle);
          return ctx.fillStyle;
        }
      }
    }

    // Fallback via temporary hidden element computed style
    if (typeof document !== 'undefined' && document.body) {
      const probe = document.createElement('span');
      probe.style.display = 'none';
      probe.style.color = expr;
      document.body.appendChild(probe);
      const computed = window.getComputedStyle(probe).color;
      document.body.removeChild(probe);
      if (
        computed &&
        !computed.includes('oklch') &&
        !computed.includes('oklab') &&
        !computed.includes('color-mix')
      ) {
        colorResolutionCache.set(expr, computed);
        return computed;
      }
    }
  } catch {
    // Fall through to safe fallback
  }

  colorResolutionCache.set(expr, fallback);
  return fallback;
}

/**
 * Replaces balanced CSS function calls like oklch(...), oklab(...), lab(...), lch(...), color-mix(...)
 * inside raw CSS stylesheet text with html2canvas-safe RGB values.
 */
function sanitizeCssColorFunctions(cssText: string): string {
  if (!cssText) return cssText;
  const fnPattern = /(?:oklch|oklab|lab|lch|color-mix)\(/gi;
  if (!fnPattern.test(cssText)) return cssText;

  let result = '';
  let i = 0;
  const lower = cssText.toLowerCase();
  const targets = ['oklch(', 'oklab(', 'color-mix(', 'lab(', 'lch('];

  while (i < cssText.length) {
    let matchedPrefixLen = 0;
    for (const prefix of targets) {
      if (lower.startsWith(prefix, i)) {
        // Ensure not inside identifier (e.g. my-lab( )
        const prevChar = i > 0 ? lower[i - 1] : ' ';
        if (!/[a-z0-9_-]/.test(prevChar)) {
          matchedPrefixLen = prefix.length;
          break;
        }
      }
    }

    if (matchedPrefixLen === 0) {
      result += cssText[i];
      i++;
      continue;
    }

    // Find matching closing parenthesis
    let depth = 1;
    let j = i + matchedPrefixLen;
    while (j < cssText.length && depth > 0) {
      if (cssText[j] === '(') depth++;
      else if (cssText[j] === ')') depth--;
      j++;
    }

    const fullExpr = cssText.slice(i, j);
    result += resolveColorExpressionToRgb(fullExpr);
    i = j;
  }

  return result;
}

/**
 * Collects all document CSS rules and rewrites unsupported Tailwind v4 color functions
 * into standard RGB/Hex inside the html2canvas cloned document.
 */
function sanitizeClonedDocumentStyles(clonedDoc: Document, origElement: HTMLElement, clonedElement: HTMLElement): void {
  // 1. Collect all active stylesheet rules from the live document and sanitize modern CSS color functions
  const collectedCssChunks: string[] = [];
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        const rules = sheet.cssRules;
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          collectedCssChunks.push(rule.cssText);
        }
      } catch {
        // Ignore cross-origin sheets (like Google Fonts if any)
      }
    }
  } catch {
    // Ignore stylesheet enumeration error
  }

  if (collectedCssChunks.length > 0) {
    // Remove existing <style> and stylesheet <link> in clonedDoc so html2canvas never parses raw oklch() rules
    clonedDoc.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => {
      node.parentNode?.removeChild(node);
    });

    const sanitizedCss = sanitizeCssColorFunctions(collectedCssChunks.join('\n'));
    const safeStyleEl = clonedDoc.createElement('style');
    safeStyleEl.textContent = sanitizedCss;
    clonedDoc.head.appendChild(safeStyleEl);
  } else {
    // Fallback: sanitize inline <style> tags
    clonedDoc.querySelectorAll('style').forEach((styleEl) => {
      if (styleEl.textContent) {
        styleEl.textContent = sanitizeCssColorFunctions(styleEl.textContent);
      }
    });
  }

  // 2. Also inline resolved RGB colors directly on every node inside the printable target
  try {
    const origNodes: Element[] = [origElement, ...Array.from(origElement.querySelectorAll('*'))];
    const clonedNodes: Element[] = [clonedElement, ...Array.from(clonedElement.querySelectorAll('*'))];

    const count = Math.min(origNodes.length, clonedNodes.length);
    for (let idx = 0; idx < count; idx++) {
      const origNode = origNodes[idx];
      const cloneNode = clonedNodes[idx] as HTMLElement;
      if (!cloneNode || !cloneNode.style) continue;

      const cs = window.getComputedStyle(origNode);
      const colorProps: Array<['color' | 'backgroundColor' | 'borderTopColor' | 'borderRightColor' | 'borderBottomColor' | 'borderLeftColor' | 'outlineColor', string]> = [
        ['color', cs.color],
        ['backgroundColor', cs.backgroundColor],
        ['borderTopColor', cs.borderTopColor],
        ['borderRightColor', cs.borderRightColor],
        ['borderBottomColor', cs.borderBottomColor],
        ['borderLeftColor', cs.borderLeftColor],
        ['outlineColor', cs.outlineColor],
      ];

      for (const [prop, val] of colorProps) {
        if (val && (val.includes('oklch') || val.includes('oklab') || val.includes('color-mix') || val.includes('lab(') || val.includes('lch('))) {
          cloneNode.style[prop] = resolveColorExpressionToRgb(val);
        }
      }

      if (cs.boxShadow && (cs.boxShadow.includes('oklch') || cs.boxShadow.includes('oklab') || cs.boxShadow.includes('color-mix'))) {
        cloneNode.style.boxShadow = 'none';
      }
      if (cs.backgroundImage && (cs.backgroundImage.includes('oklch') || cs.backgroundImage.includes('oklab') || cs.backgroundImage.includes('color-mix'))) {
        cloneNode.style.backgroundImage = 'none';
      }
    }
  } catch {
    // Non-fatal fallback
  }
}

/**
 * Exports any DOM element directly into a real, high-resolution PDF document file.
 * Supports A4, A5, and 80mm / 58mm Thermal POS slips, with Tailwind v4 color safety.
 */
export async function exportElementToPdf(
  elementIdOrEl: string | HTMLElement,
  options: PdfExportOptions
): Promise<boolean> {
  try {
    const element = typeof elementIdOrEl === 'string'
      ? document.getElementById(elementIdOrEl)
      : elementIdOrEl;

    if (!element) {
      console.error(`exportElementToPdf: Element not found: ${elementIdOrEl}`);
      return false;
    }

    const paperSize: PdfPaperSize = options.paperSize || 'A4';
    const orientation = options.orientation || 'portrait';
    const isLandscape = orientation === 'landscape';
    const marginMode = options.marginMode || 'standard';
    const marginMm =
      paperSize === 'Thermal-3inch' || paperSize === 'Thermal-58mm'
        ? 2
        : marginMode === 'compact'
        ? 4
        : marginMode === 'wide'
        ? 12
        : 6;

    // Preserve and reset any ancestor CSS scale transform temporarily if needed,
    // and ensure clean white canvas capture.
    const canvas = await html2canvas(element, {
      scale: options.scale || 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: 0,
      windowWidth: Math.max(element.scrollWidth, element.offsetWidth, 794),
      windowHeight: Math.max(element.scrollHeight, element.offsetHeight, 600),
      onclone: (clonedDoc) => {
        const clonedTarget = typeof elementIdOrEl === 'string'
          ? clonedDoc.getElementById(elementIdOrEl)
          : (element.id ? clonedDoc.getElementById(element.id) : null);

        if (clonedTarget) {
          clonedTarget.style.transform = 'none';
          clonedTarget.style.maxHeight = 'none';
          clonedTarget.style.height = 'auto';
          clonedTarget.style.overflow = 'visible';
          clonedTarget.style.boxShadow = 'none';
          if (clonedTarget.parentElement) {
            clonedTarget.parentElement.style.transform = 'none';
            clonedTarget.parentElement.style.maxHeight = 'none';
            clonedTarget.parentElement.style.overflow = 'visible';
          }
          // Hide any print:hidden / no-print controls inside cloned capture
          clonedTarget.querySelectorAll('.no-print, .print\\:hidden').forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });
          sanitizeClonedDocumentStyles(clonedDoc, element, clonedTarget);
        }
      }
    });

    if (!canvas.width || !canvas.height) {
      throw new Error('Canvas rendering produced zero-dimension output');
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.96);

    let pdfPageWidth = 210;
    let pdfPageHeight = 297;
    let pdfFormat: string | [number, number] = 'a4';

    if (paperSize === 'A5') {
      pdfPageWidth = isLandscape ? 210 : 148;
      pdfPageHeight = isLandscape ? 148 : 210;
      pdfFormat = 'a5';
    } else if (paperSize === 'Thermal-3inch') {
      pdfPageWidth = 80;
      const contentWidth = pdfPageWidth - marginMm * 2;
      const calcH = (canvas.height * contentWidth) / canvas.width + marginMm * 2;
      pdfPageHeight = Math.max(120, calcH);
      pdfFormat = [pdfPageWidth, pdfPageHeight];
    } else if (paperSize === 'Thermal-58mm') {
      pdfPageWidth = 58;
      const contentWidth = pdfPageWidth - marginMm * 2;
      const calcH = (canvas.height * contentWidth) / canvas.width + marginMm * 2;
      pdfPageHeight = Math.max(100, calcH);
      pdfFormat = [pdfPageWidth, pdfPageHeight];
    } else {
      pdfPageWidth = isLandscape ? 297 : 210;
      pdfPageHeight = isLandscape ? 210 : 297;
      pdfFormat = 'a4';
    }

    const pdf = new jsPDF({
      orientation: paperSize.startsWith('Thermal') ? 'portrait' : orientation,
      unit: 'mm',
      format: pdfFormat,
      compress: true
    });

    const printableWidth = pdfPageWidth - marginMm * 2;
    const printableHeight = pdfPageHeight - marginMm * 2;
    const imgHeight = (canvas.height * printableWidth) / canvas.width;

    if (paperSize.startsWith('Thermal')) {
      pdf.addImage(imgData, 'JPEG', marginMm, marginMm, printableWidth, imgHeight, undefined, 'FAST');
    } else {
      let heightLeft = imgHeight;
      let pageOffset = 0;

      pdf.addImage(imgData, 'JPEG', marginMm, marginMm, printableWidth, imgHeight, undefined, 'FAST');
      heightLeft -= printableHeight;

      while (heightLeft > 2) {
        pageOffset -= printableHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', marginMm, marginMm + pageOffset, printableWidth, imgHeight, undefined, 'FAST');
        heightLeft -= printableHeight;
      }
    }

    const cleanFilename = (options.filename || 'HisabVeda_Document')
      .replace(/[^a-zA-Z0-9_\-\u0900-\u097F]/g, '_')
      .substring(0, 80);

    const finalName = cleanFilename.toLowerCase().endsWith('.pdf')
      ? cleanFilename
      : `${cleanFilename}.pdf`;

    pdf.save(finalName);
    return true;
  } catch (error) {
    console.error('Failed to export PDF via jsPDF/html2canvas:', error);
    return false;
  }
}

/**
 * Backward-compatible alias for A4 PDF export
 */
export async function exportElementToA4Pdf(
  elementIdOrEl: string | HTMLElement,
  options: PdfExportOptions
): Promise<boolean> {
  return exportElementToPdf(elementIdOrEl, options);
}
