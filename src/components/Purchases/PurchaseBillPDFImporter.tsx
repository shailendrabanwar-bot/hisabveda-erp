import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, Sparkles, CheckCircle2, AlertCircle, X, Loader2, Building2, PackageCheck, Plus, Trash2, Edit3, ArrowLeft, RefreshCw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { AppData, PartyMaster, ItemMaster, InvoiceItem } from '../../types';
import { INDIAN_STATE_CODES } from '../../utils/gstin';
import {
  getFinancialYearRange,
  isDateInFinancialYear,
  isOptionalGstinValid,
  normalizeDateISO
} from '../../utils/fiscalYear';
import { resolveApiUrl } from '../../utils/apiBase';

// Set worker for pdfjs reliably for Vite
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

interface PurchaseBillPDFImporterProps {
  data: AppData;
  isHindi: boolean;
  onAddParty: (party: PartyMaster) => void;
  onAddItem: (item: ItemMaster) => void;
  onImportComplete: (importedBill: {
    partyId: string;
    supplierInvoiceNo: string;
    date: string;
    dueDate: string;
    items: InvoiceItem[];
    roundOff?: number;
    notes: string;
    createdVendorName?: string;
    createdItemsCount?: number;
    newParty?: PartyMaster;
    newItems?: ItemMaster[];
  }) => void;
  onClose: () => void;
}

export interface ReviewItem {
  id: string;
  itemName: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  rate: number;
  discountPercent: number;
  taxRate: number;
}

export interface ReviewAdditionalCharge {
  id: string;
  description: string;
  amount: number;
  gstPercent: number;
}

export interface ReviewBillData {
  supplierName: string;
  supplierGstin: string;
  supplierAddress: string;
  supplierInvoiceNo: string;
  invoiceDate: string;
  dueDate: string;
  items: ReviewItem[];
  additionalCharges: ReviewAdditionalCharge[];
  roundOff: number;
  notes: string;
}

// Local smart regex fallback parser for PDF text
function parseInvoiceTextLocally(pdfText: string, fileName: string): ReviewBillData {
  const lines = pdfText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Vendor Name heuristics - find first strong header line that isn't invoice/date/gstin
  let supplierName = '';
  for (const line of lines) {
    if (!/invoice|tax invoice|bill|gstin|date|total|phone|email|copy|original|tax|due|state|address|pincode|bank|ifsc/i.test(line) && line.length > 3 && line.length < 60) {
      if (!/^\d+$/.test(line) && !/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(line) && !/^INV/i.test(line)) {
        supplierName = line;
        break;
      }
    }
  }
  if (!supplierName) supplierName = 'Supplier Vendor';

  // GSTIN extraction
  const gstinMatch = pdfText.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1})\b/i);
  const supplierGstin = gstinMatch ? gstinMatch[1].toUpperCase() : '';

  // Invoice Number (Ensure we don't pick vendor name)
  let supplierInvoiceNo = '';
  const invNoMatch = pdfText.match(/(?:Invoice\s*(?:No|Num|#|Ref)?|Bill\s*(?:No|Num|#|Ref)?|Tax\s*Invoice\s*No)\s*[:.-]?\s*([A-Z0-9\/-]+)/i);
  if (invNoMatch && invNoMatch[1] && invNoMatch[1].length >= 2 && !/vendor|supplier|traders|company|limited|pvt/i.test(invNoMatch[1]) && invNoMatch[1].toLowerCase() !== supplierName.toLowerCase()) {
    supplierInvoiceNo = invNoMatch[1].trim();
  } else {
    supplierInvoiceNo = `BILL-${Date.now().toString().slice(-6)}`;
  }

  // Invoice Date
  const dateMatch = pdfText.match(/(?:Invoice\s*Date|Bill\s*Date|Date)\s*[:.-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})/i);
  let invoiceDate = new Date().toISOString().split('T')[0];
  if (dateMatch) {
    const dStr = dateMatch[1];
    const parts = dStr.split(/[\/\-\.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) invoiceDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
      else if (parts[2].length === 4) invoiceDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      else invoiceDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  // Total Amounts & GST
  const totalMatch = pdfText.match(/(?:Grand\s*Total|Total\s*Amount|Amount\s*Payable|Net\s*Amount|Total)\s*[:.-]?\s*₹?\s*([\d,]+(?:\.\d{2})?)/i);
  const grandTotal = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : 0;

  const roundOffMatch = pdfText.match(/(?:Round\s*Off|R\/O|Rounding|Roundoff)\s*[:.-]?\s*([+-]?\s*[\d,]+(?:\.\d{1,2})?)/i);
  let roundOff = 0;
  if (roundOffMatch) {
    const cleanR = roundOffMatch[1].replace(/\s/g, '').replace(/,/g, '');
    roundOff = parseFloat(cleanR) || 0;
  }

  const cgstMatch = pdfText.match(/CGST\s*[:.-]?\s*₹?\s*([\d,]+(?:\.\d{2})?)/i);
  const sgstMatch = pdfText.match(/SGST\s*[:.-]?\s*₹?\s*([\d,]+(?:\.\d{2})?)/i);
  const igstMatch = pdfText.match(/IGST\s*[:.-]?\s*₹?\s*([\d,]+(?:\.\d{2})?)/i);
  const cgstAmount = cgstMatch ? parseFloat(cgstMatch[1].replace(/,/g, '')) : 0;
  const sgstAmount = sgstMatch ? parseFloat(sgstMatch[1].replace(/,/g, '')) : 0;
  const igstAmount = igstMatch ? parseFloat(igstMatch[1].replace(/,/g, '')) : 0;
  const totalTax = cgstAmount + sgstAmount + igstAmount;

  const subtotal = grandTotal > 0 ? Math.max(0, grandTotal - totalTax - roundOff) : 0;

  // Clean default item name
  const cleanDocTitle = fileName.replace(/\.[^/.]+$/, '').replace(/[_.\-]/g, ' ').trim();
  const defaultItemName = /tax invoice|bill|invoice/i.test(cleanDocTitle) ? 'Goods Purchase Item' : `Goods (${cleanDocTitle})`;

  return {
    supplierName,
    supplierGstin,
    supplierAddress: '',
    supplierInvoiceNo,
    invoiceDate,
    dueDate: invoiceDate,
    items: [{
      id: 'item_1',
      itemName: defaultItemName,
      hsnSacCode: '8471',
      quantity: 1,
      unit: 'PCS',
      rate: subtotal || grandTotal || 1000,
      discountPercent: 0,
      taxRate: totalTax > 0 ? Math.round((totalTax / (subtotal || 1)) * 100) : 18
    }],
    additionalCharges: [],
    roundOff: roundOff,
    notes: 'Imported from Purchase Bill Document'
  };
}

export const PurchaseBillPDFImporter: React.FC<PurchaseBillPDFImporterProps> = ({
  data,
  isHindi,
  onAddParty,
  onAddItem,
  onImportComplete,
  onClose
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Verification & Edit State
  const [reviewData, setReviewData] = useState<ReviewBillData | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fyRange = getFinancialYearRange(data.company.financialYearStart);
  const isReviewDateInFY = reviewData ? isDateInFinancialYear(reviewData.invoiceDate, fyRange.fyStart) : true;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setErrorMsg(null);
    setStatusMsg(isHindi ? 'फ़ाइल पढ़ी जा रही है... AI द्वारा विश्लेषण हो रहा है...' : 'Reading file... analyzing invoice with AI...');

    try {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type.includes('pdf');
      let mimeType = file.type || (isPdf ? 'application/pdf' : 'image/png');
      
      const arrayBuffer = await file.arrayBuffer();
      
      // Convert arrayBuffer to Base64 FIRST
      let binary = '';
      const bytes = new Uint8Array(arrayBuffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = window.btoa(binary);

      let pdfText = '';
      let sendBase64 = base64;
      let sendMimeType = mimeType;
      let canvasRenderedBase64 = '';

      // Extract raw text and render high-res canvas image for PDFs
      if (isPdf) {
        sendMimeType = 'application/pdf';
        sendBase64 = base64;

        try {
          const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
          const pdfDoc = await loadingTask.promise;
          for (let p = 1; p <= pdfDoc.numPages; p++) {
            const page = await pdfDoc.getPage(p);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((it: any) => it.str).join(' ');
            pdfText += pageText + '\n';
          }

          if (pdfDoc.numPages > 0) {
            try {
              const firstPage = await pdfDoc.getPage(1);
              const viewport = firstPage.getViewport({ scale: 2.0 });
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d');
              if (ctx) {
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await firstPage.render({ canvasContext: ctx, viewport, canvas }).promise;
                const renderedDataUrl = canvas.toDataURL('image/jpeg', 0.90);
                canvasRenderedBase64 = renderedDataUrl.split(',')[1] || '';
              }
            } catch (renderErr) {
              console.warn('PDF page canvas rendering warning:', renderErr);
            }
          }
        } catch (pdfErr) {
          console.warn('PDF text extraction warning:', pdfErr);
        }

        // Use high-resolution rendered canvas JPEG as primary image for PDF to guarantee 100% OCR vision accuracy
        if (canvasRenderedBase64) {
          sendBase64 = canvasRenderedBase64;
          sendMimeType = 'image/jpeg';
        } else {
          sendBase64 = base64;
          sendMimeType = 'application/pdf';
        }
      } else {
        const lowName = file.name.toLowerCase();
        if (lowName.endsWith('.jpg') || lowName.endsWith('.jpeg')) sendMimeType = 'image/jpeg';
        else if (lowName.endsWith('.png')) sendMimeType = 'image/png';
        else if (lowName.endsWith('.webp')) sendMimeType = 'image/webp';
        else if (lowName.endsWith('.heic') || lowName.endsWith('.heif')) sendMimeType = 'image/jpeg';
        else sendMimeType = mimeType || 'image/jpeg';
      }

      let parsed: ReviewBillData | null = null;

      // 1. Try server-side API parse with auto-retry
      let tries = 0;
      let apiRes: Response | null = null;

      while (tries < 2 && !parsed) {
        tries++;
        if (tries > 1) {
          setStatusMsg(isHindi ? 'पुनः प्रयास हो रहा है (Retry Attempt)...' : 'Retrying AI invoice extraction...');
        }

        try {
          // Try primary payload on try 1, and raw base64 as fallback on try 2
          const payloadBase64 = (tries === 2 && isPdf && base64 !== sendBase64) ? base64 : sendBase64;
          const payloadMime = (tries === 2 && isPdf && base64 !== sendBase64) ? 'application/pdf' : sendMimeType;

          apiRes = await fetch(resolveApiUrl('/api/parse-purchase-bill'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileBase64: payloadBase64, mimeType: payloadMime, text: pdfText })
          });

          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            if (apiJson.success && apiJson.data) {
              const serverData = apiJson.data;

              // Vendor Name
              let supplierName = String(serverData.vendorName || serverData.supplierName || '').trim();
              if (!supplierName || /tax invoice|bill|invoice/i.test(supplierName)) {
                supplierName = 'Supplier Vendor';
              }

              // Supplier Invoice No
              let supplierInvoiceNo = String(serverData.invoiceNumber || serverData.supplierInvoiceNo || '').trim();
              if (!supplierInvoiceNo || supplierInvoiceNo.toLowerCase() === supplierName.toLowerCase() || /traders|pvt|ltd|company|enterprises|corporation|supplier|vendor/i.test(supplierInvoiceNo)) {
                supplierInvoiceNo = `INV-${Date.now().toString().slice(-6)}`;
              }

              const parsedItems: ReviewItem[] = [];
              const parsedCharges: ReviewAdditionalCharge[] = [];

              // Extract extra charges explicitly returned by server
              if (Array.isArray(serverData.additionalCharges)) {
                serverData.additionalCharges.forEach((ch: any, idx: number) => {
                  const desc = String(ch.description || `Charge ${idx + 1}`).trim();
                  const amt = Number(ch.amount) || 0;
                  if (desc && amt > 0) {
                    parsedCharges.push({
                      id: 'charge_' + Date.now() + '_' + idx,
                      description: desc,
                      amount: amt,
                      gstPercent: Number(ch.gstPercent) || 18
                    });
                  }
                });
              }

              // Extract line items & route any freight/hamali/cartage line items into additionalCharges
              (serverData.items || []).forEach((it: any, idx: number) => {
                let qty = Number(it.quantity);
                let rate = Number(it.rate);
                
                if (qty > 100 && rate > 0 && rate < 2) {
                  const temp = qty;
                  qty = rate;
                  rate = temp;
                }

                if (!qty || isNaN(qty) || qty <= 0) qty = 1;
                if (isNaN(rate) || rate < 0) rate = 0;

                let itemName = String(it.description || it.itemName || `Item ${idx + 1}`).trim();
                
                // Check if this item is actually an extra charge (e.g. Freight, Hamali, Cartage, Packaging)
                const isExtraCharge = /freight|cartage|transport|hamali|loading|unloading|packaging|insurance|handling charges/i.test(itemName);

                if (isExtraCharge) {
                  parsedCharges.push({
                    id: 'charge_' + Date.now() + '_' + idx,
                    description: itemName,
                    amount: rate * qty,
                    gstPercent: Number(it.gstPercent) || Number(it.taxRate) || 18
                  });
                } else {
                  if (!itemName || /purchase item|tax_invoice|goods purchase/i.test(itemName.toLowerCase())) {
                    itemName = `Purchased Item ${idx + 1}`;
                  }

                  parsedItems.push({
                    id: 'item_' + (idx + 1),
                    itemName,
                    hsnSacCode: String(it.hsn || it.hsnSacCode || '8471').trim(),
                    quantity: qty,
                    unit: String(it.unit || 'PCS').toUpperCase(),
                    rate: rate,
                    discountPercent: Number(it.discountPercent) || 0,
                    taxRate: Number(it.gstPercent) || Number(it.taxRate) || 18
                  });
                }
              });

              // Extract Round Off if provided or derive from grand total
              let extractedRoundOff = Number(serverData.roundOff) || 0;
              const extractedGrandTotal = Number(serverData.grandTotal) || 0;
              
              if (!extractedRoundOff && extractedGrandTotal > 0) {
                // Calculate item subtotal + tax to see if there is an inherent round off
                let subSum = 0;
                let taxSum = 0;
                parsedItems.forEach(it => {
                  const gross = it.quantity * it.rate;
                  const net = gross - (gross * (it.discountPercent / 100));
                  subSum += net;
                  taxSum += net * (it.taxRate / 100);
                });
                parsedCharges.forEach(ch => {
                  subSum += ch.amount;
                  taxSum += ch.amount * (ch.gstPercent / 100);
                });
                const calcTotal = subSum + taxSum;
                const diff = Math.round((extractedGrandTotal - calcTotal) * 100) / 100;
                if (Math.abs(diff) > 0.001 && Math.abs(diff) < 25) {
                  extractedRoundOff = diff;
                }
              }

              parsed = {
                supplierName,
                supplierGstin: String(serverData.gstin || serverData.supplierGstin || '').toUpperCase().trim(),
                supplierAddress: String(serverData.supplierAddress || '').trim(),
                supplierInvoiceNo,
                invoiceDate: serverData.invoiceDate || new Date().toISOString().split('T')[0],
                dueDate: serverData.dueDate || serverData.invoiceDate || new Date().toISOString().split('T')[0],
                items: parsedItems.length > 0 ? parsedItems : [{
                  id: 'item_1',
                  itemName: 'Goods Purchase Item',
                  hsnSacCode: '8471',
                  quantity: 1,
                  unit: 'PCS',
                  rate: 1000,
                  discountPercent: 0,
                  taxRate: 18
                }],
                additionalCharges: parsedCharges,
                roundOff: extractedRoundOff,
                notes: 'Extracted from Invoice via Gemini AI'
              };
            }
          }
        } catch (srvErr) {
          console.warn(`Server side purchase bill parse try ${tries} warning:`, srvErr);
        }
      }

      // 2. Local Fallback if server parse was unavailable or returned error
      if (!parsed && pdfText.trim().length > 0) {
        setStatusMsg(isHindi ? 'लोकल टेक्स्ट एक्सट्रैक्शन से पार्स किया जा रहा है...' : 'Parsing bill using local text engine...');
        parsed = parseInvoiceTextLocally(pdfText, file.name);
      }

      if (!parsed) {
        parsed = parseInvoiceTextLocally(file.name, file.name);
      }

      // Normalize extracted dates & inspect Financial Year immediately
      if (parsed.invoiceDate) {
        const normInv = normalizeDateISO(parsed.invoiceDate);
        if (normInv) parsed.invoiceDate = normInv;
      }
      if (parsed.dueDate) {
        const normDue = normalizeDateISO(parsed.dueDate);
        if (normDue) parsed.dueDate = normDue;
      }
      setValidationError(null);

      // Transition to Review Screen
      setReviewData(parsed);

    } catch (err: any) {
      console.error('Purchase Bill AI Import Error:', err);
      setErrorMsg(isHindi ? `इंपोर्ट त्रुटि: ${err.message}` : `Error parsing purchase bill: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper calculations for review screen
  const calculateTotals = (items: ReviewItem[], charges: ReviewAdditionalCharge[], roundOff: number = 0) => {
    let itemsSubtotal = 0;
    let itemsTax = 0;
    items.forEach(it => {
      const gross = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
      const lineDisc = gross * ((Number(it.discountPercent) || 0) / 100);
      const taxable = gross - lineDisc;
      const tax = taxable * ((Number(it.taxRate) || 0) / 100);
      itemsSubtotal += taxable;
      itemsTax += tax;
    });

    let chargesSubtotal = 0;
    let chargesTax = 0;
    charges.forEach(ch => {
      const amt = Number(ch.amount) || 0;
      const tax = amt * ((Number(ch.gstPercent) || 0) / 100);
      chargesSubtotal += amt;
      chargesTax += tax;
    });

    const totalTaxable = itemsSubtotal + chargesSubtotal;
    const totalTax = itemsTax + chargesTax;
    const computedTotal = totalTaxable + totalTax;
    const finalGrandTotal = Math.max(0, Math.round((computedTotal + roundOff) * 100) / 100);

    return {
      itemsSubtotal: Math.round(itemsSubtotal * 100) / 100,
      chargesSubtotal: Math.round(chargesSubtotal * 100) / 100,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      computedTotal: Math.round(computedTotal * 100) / 100,
      roundOff: Math.round(roundOff * 100) / 100,
      grandTotal: finalGrandTotal
    };
  };

  // Handler for item edits in Review Screen
  const handleItemChange = (id: string, field: keyof ReviewItem, value: any) => {
    if (!reviewData) return;
    setReviewData({
      ...reviewData,
      items: reviewData.items.map(it => {
        if (it.id === id) {
          return { ...it, [field]: value };
        }
        return it;
      })
    });
  };

  const handleRoundOffChange = (val: number) => {
    if (!reviewData) return;
    setReviewData({
      ...reviewData,
      roundOff: val
    });
  };

  const handleAutoRoundOff = () => {
    if (!reviewData) return;
    const curTotals = calculateTotals(reviewData.items, reviewData.additionalCharges, 0);
    const rounded = Math.round(curTotals.computedTotal);
    const autoDiff = Math.round((rounded - curTotals.computedTotal) * 100) / 100;
    setReviewData({
      ...reviewData,
      roundOff: autoDiff
    });
  };

  const handleAddItemRow = () => {
    if (!reviewData) return;
    const newItem: ReviewItem = {
      id: 'item_' + Date.now(),
      itemName: 'New Item',
      hsnSacCode: '8471',
      quantity: 1,
      unit: 'PCS',
      rate: 0,
      discountPercent: 0,
      taxRate: 18
    };
    setReviewData({
      ...reviewData,
      items: [...reviewData.items, newItem]
    });
  };

  const handleRemoveItemRow = (id: string) => {
    if (!reviewData || reviewData.items.length <= 1) return;
    setReviewData({
      ...reviewData,
      items: reviewData.items.filter(it => it.id !== id)
    });
  };

  // Handlers for Additional Charges edits
  const handleChargeChange = (id: string, field: keyof ReviewAdditionalCharge, value: any) => {
    if (!reviewData) return;
    setReviewData({
      ...reviewData,
      additionalCharges: reviewData.additionalCharges.map(ch => {
        if (ch.id === id) {
          return { ...ch, [field]: value };
        }
        return ch;
      })
    });
  };

  const handleAddChargeRow = (presetDesc?: string) => {
    if (!reviewData) return;
    const newCharge: ReviewAdditionalCharge = {
      id: 'charge_' + Date.now(),
      description: presetDesc || 'Freight / Cartage Charges',
      amount: 0,
      gstPercent: 18
    };
    setReviewData({
      ...reviewData,
      additionalCharges: [...reviewData.additionalCharges, newCharge]
    });
  };

  const handleRemoveChargeRow = (id: string) => {
    if (!reviewData) return;
    setReviewData({
      ...reviewData,
      additionalCharges: reviewData.additionalCharges.filter(ch => ch.id !== id)
    });
  };

  // Final confirmation action with strict Financial Year & Data Integrity validation
  const handleConfirmAndSave = () => {
    if (!reviewData) return;
    setValidationError(null);

    if (!reviewData.supplierName.trim()) {
      setValidationError(isHindi ? 'कृपया सप्लायर / वेंडर का नाम दर्ज करें।' : 'Supplier / Vendor Name is required.');
      return;
    }
    if (!reviewData.supplierInvoiceNo.trim()) {
      setValidationError(isHindi ? 'कृपया सप्लायर का इनवॉइस / बिल नंबर दर्ज करें।' : 'Supplier Invoice / Bill Reference Number is required.');
      return;
    }

    const gstCheck = isOptionalGstinValid(reviewData.supplierGstin);
    if (!gstCheck.valid) {
      setValidationError(isHindi ? (gstCheck.errorHindi || 'सप्लायर GSTIN मान्य नहीं है।') : (gstCheck.error || 'Invalid Supplier GSTIN.'));
      return;
    }

    const cleanInvDate = normalizeDateISO(reviewData.invoiceDate) || reviewData.invoiceDate;
    if (!cleanInvDate || !isDateInFinancialYear(cleanInvDate, fyRange.fyStart)) {
      setValidationError(
        isHindi
          ? `पुराना या अमान्य बिल दिनांक (${reviewData.invoiceDate}): यह बिल सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) के बाहर है! इस बिल को दर्ज नहीं किया जा सकता (या पहले हेडर से संबंधित वित्तीय वर्ष चुनें)।`
          : `Out-of-Financial-Year Bill Date (${reviewData.invoiceDate}): This bill falls outside active ${fyRange.label} (${fyRange.displayRange}) and cannot be posted into the current year.`
      );
      return;
    }

    const cleanDueDate = normalizeDateISO(reviewData.dueDate) || reviewData.dueDate;
    if (cleanDueDate && cleanDueDate < cleanInvDate) {
      setValidationError(isHindi ? 'भुगतान देय तिथि (Due Date) बिल दिनांक से पहले की नहीं हो सकती।' : 'Payment Due Date cannot be earlier than Invoice Date.');
      return;
    }

    if (!reviewData.items || reviewData.items.length === 0) {
      setValidationError(isHindi ? 'कम से कम एक स्टॉक आइटम होना आवश्यक है।' : 'At least one purchase item is required.');
      return;
    }

    const badItem = reviewData.items.find(it => !it.itemName.trim() || Number(it.quantity) <= 0 || Number(it.rate) < 0);
    if (badItem) {
      setValidationError(
        isHindi
          ? `आइटम "${badItem.itemName || 'Blank'}" की मात्रा > 0 और दर >= 0 होनी चाहिए।`
          : `Item "${badItem.itemName || 'Blank'}" must have valid name, Quantity > 0, and Rate >= 0.`
      );
      return;
    }

    const currentTotals = calculateTotals(reviewData.items, reviewData.additionalCharges, reviewData.roundOff || 0);
    if (currentTotals.grandTotal <= 0) {
      setValidationError(isHindi ? 'कुल बिल राशि ₹0 से अधिक होनी चाहिए।' : 'Grand Total Invoice Value must be greater than zero.');
      return;
    }

    // 1. Resolve or Auto-Create Vendor Party
    let matchedVendor = data.parties.find(p => {
      if (reviewData.supplierGstin && p.gstin && p.gstin.trim().toLowerCase() === reviewData.supplierGstin.trim().toLowerCase()) {
        return true;
      }
      if (reviewData.supplierName && p.name.trim().toLowerCase() === reviewData.supplierName.trim().toLowerCase()) {
        return true;
      }
      return false;
    });

    // Check duplicate supplier bill number for matched vendor
    if (matchedVendor) {
      const duplicateBill = (data.purchaseInvoices || []).some(
        b =>
          b.partyId === matchedVendor!.id &&
          b.supplierInvoiceNo.trim().toLowerCase() === reviewData.supplierInvoiceNo.trim().toLowerCase()
      );
      if (duplicateBill) {
        setValidationError(
          isHindi
            ? `डुप्लीकेट बिल चेतावनी: इस सप्लायर का बिल नंबर "${reviewData.supplierInvoiceNo}" पहले से सॉफ्टवेयर में दर्ज है।`
            : `Duplicate Bill Blocked: Supplier Invoice "${reviewData.supplierInvoiceNo}" already exists for ${matchedVendor.name}.`
        );
        return;
      }
    }

    let createdVendorName: string | undefined = undefined;

    if (!matchedVendor && reviewData.supplierName.trim()) {
      const suppGstin = (reviewData.supplierGstin || '').toUpperCase().trim();
      let derivedStateCode = '07';
      let derivedStateName = data.company.state || 'Delhi';

      if (suppGstin.length >= 2) {
        const scPrefix = suppGstin.substring(0, 2);
        if (INDIAN_STATE_CODES[scPrefix]) {
          derivedStateCode = scPrefix;
          derivedStateName = INDIAN_STATE_CODES[scPrefix];
        }
      }

      const newParty: PartyMaster = {
        id: 'party_ven_' + Date.now(),
        code: 'VEN-' + String(Math.floor(Math.random() * 9000) + 1000),
        name: reviewData.supplierName.trim(),
        type: 'VENDOR',
        gstin: suppGstin || 'URP',
        pan: suppGstin.length >= 12 ? suppGstin.substring(2, 12) : '',
        email: '',
        phone: '',
        address: reviewData.supplierAddress || '',
        state: derivedStateName,
        stateCode: derivedStateCode,
        creditLimit: 100000,
        openingBalance: 0,
        balanceType: 'CR',
        gstCategory: suppGstin && suppGstin !== 'URP' ? 'REGULAR' : 'UNREGISTERED'
      };

      onAddParty(newParty);
      matchedVendor = newParty;
      createdVendorName = newParty.name;
    }

    const selectedPartyId = matchedVendor?.id || data.parties[0]?.id || '';

    // 2. Resolve or Auto-Create Stock Items (Every distinct item in the invoice must get its own master)
    let createdItemsCount = 0;
    const mappedItems: InvoiceItem[] = [];
    const runningItems: ItemMaster[] = [...data.items];

    for (let idx = 0; idx < reviewData.items.length; idx++) {
      const rawItem = reviewData.items[idx];
      const rawName = String(rawItem.itemName || `Item ${idx + 1}`).trim();
      const rawHsn = String(rawItem.hsnSacCode || '8471').trim();
      const rate = Number(rawItem.rate) || 0;
      const qty = Number(rawItem.quantity) || 1;
      const disc = Number(rawItem.discountPercent) || 0;
      const taxRate = Number(rawItem.taxRate) || 18;

      // CRITICAL FIX: Match strictly by Item Name (case-insensitive) - NEVER match solely on HSN code
      // because thousands of completely different products share the exact same HSN code (e.g. 8471, 8517)!
      let matchedItem = runningItems.find(i => 
        i.name.trim().toLowerCase() === rawName.toLowerCase()
      );

      if (!matchedItem) {
        const newItem: ItemMaster = {
          id: 'itm_auto_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7),
          code: 'ITEM-' + String(Math.floor(Math.random() * 9000) + 1000),
          name: rawName,
          description: rawName,
          hsnSacCode: rawHsn,
          unit: rawItem.unit || 'PCS',
          purchasePrice: rate,
          salesPrice: Math.round(rate * 1.2), // 20% default margin
          sellingPrice: Math.round(rate * 1.2),
          taxRate: taxRate,
          gstRate: taxRate,
          currentStock: 0,
          minStockLevel: 5,
          category: 'General'
        };

        runningItems.push(newItem);
        onAddItem(newItem);
        matchedItem = newItem;
        createdItemsCount++;
      }

      const lineGross = qty * rate;
      const lineNetBase = lineGross - (lineGross * (disc / 100));
      const lineTax = lineNetBase * (taxRate / 100);

      mappedItems.push({
        id: 'line_' + Date.now() + '_' + idx,
        itemId: matchedItem.id,
        itemName: matchedItem.name,
        hsnSacCode: matchedItem.hsnSacCode || rawHsn,
        quantity: qty,
        unit: rawItem.unit || matchedItem.unit || 'PCS',
        rate: rate,
        discountPercent: disc,
        taxRate: taxRate,
        taxAmount: Math.round(lineTax * 100) / 100,
        totalAmount: Math.round((lineNetBase + lineTax) * 100) / 100
      });
    }

    // 3. Map Additional Charges as service line items
    reviewData.additionalCharges.forEach((ch, cIdx) => {
      const chargeAmt = Number(ch.amount) || 0;
      if (chargeAmt > 0) {
        const cGst = Number(ch.gstPercent) || 18;
        const cTax = chargeAmt * (cGst / 100);

        // Check if charge master exists or auto-create service item
        let matchedChargeItem = runningItems.find(i => i.name.trim().toLowerCase() === ch.description.trim().toLowerCase());
        if (!matchedChargeItem) {
          const newChargeItem: ItemMaster = {
            id: 'itm_charge_' + Date.now() + '_' + cIdx + '_' + Math.random().toString(36).substring(2, 7),
            code: 'SRV-' + String(Math.floor(Math.random() * 9000) + 1000),
            name: ch.description.trim(),
            description: ch.description.trim(),
            hsnSacCode: '9965', // Freight/Transport SAC
            unit: 'NOS',
            purchasePrice: chargeAmt,
            salesPrice: chargeAmt,
            taxRate: cGst,
            currentStock: 0,
            minStockLevel: 0,
            category: 'Additional Charges'
          };
          runningItems.push(newChargeItem);
          onAddItem(newChargeItem);
          matchedChargeItem = newChargeItem;
        }

        mappedItems.push({
          id: 'line_chg_' + Date.now() + '_' + cIdx,
          itemId: matchedChargeItem.id,
          itemName: ch.description.trim(),
          hsnSacCode: '9965',
          quantity: 1,
          unit: 'NOS',
          rate: chargeAmt,
          discountPercent: 0,
          taxRate: cGst,
          taxAmount: Math.round(cTax * 100) / 100,
          totalAmount: Math.round((chargeAmt + cTax) * 100) / 100
        });
      }
    });

    onImportComplete({
      partyId: selectedPartyId,
      supplierInvoiceNo: reviewData.supplierInvoiceNo || `INV-${Date.now().toString().slice(-5)}`,
      date: reviewData.invoiceDate || new Date().toISOString().split('T')[0],
      dueDate: reviewData.dueDate || new Date().toISOString().split('T')[0],
      items: mappedItems,
      roundOff: reviewData.roundOff || 0,
      notes: reviewData.notes || 'Imported from Purchase Bill Document via AI',
      createdVendorName,
      createdItemsCount,
      newParty: matchedVendor,
      newItems: runningItems
    });
  };

  const totals = reviewData 
    ? calculateTotals(reviewData.items, reviewData.additionalCharges, reviewData.roundOff || 0) 
    : { itemsSubtotal: 0, chargesSubtotal: 0, totalTaxable: 0, totalTax: 0, computedTotal: 0, roundOff: 0, grandTotal: 0 };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 md:p-6 animate-fadeIn overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col my-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                {reviewData ? (
                  <>
                    <span>{isHindi ? 'समीक्षा एवं पुष्टि (Review Extracted Invoice)' : 'Review & Confirm Invoice Details'}</span>
                    <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                      {isHindi ? 'सत्यापन आवश्यक' : 'Verification Mode'}
                    </span>
                  </>
                ) : (
                  isHindi ? 'AI परचेज बिल PDF/इमेज इंपोर्ट' : 'AI Purchase Bill PDF / Image Import'
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {reviewData 
                  ? (isHindi ? 'कृपया निकाले गए डेटा, अतिरिक्त भाड़ा/हम्माली प्रभार एवं कर की जाँच करें' : 'Verify vendor, stock items, freight/hamali extra charges & GST totals before saving')
                  : (isHindi ? 'सप्लायर लेज़र एवं स्टॉक आइटम का स्वतः निर्माण' : 'Auto-extracts vendor, items, prices & extra charges')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 md:p-6 overflow-y-auto flex-1 space-y-5">
          
          {/* STEP 1: UPLOAD SCREEN */}
          {!reviewData && (
            <>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-amber-500/60 bg-slate-800/40 hover:bg-slate-800/80 rounded-2xl p-8 text-center cursor-pointer transition group"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,image/*"
                  className="hidden"
                />
                {loading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                    <p className="text-xs font-semibold text-amber-300">{statusMsg}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-4 bg-amber-500/10 group-hover:bg-amber-500/20 text-amber-400 rounded-2xl border border-amber-500/20 transition transform group-hover:scale-110">
                      <UploadCloud className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-200">
                        {isHindi ? 'परचेज बिल PDF या इमेज अपलोड करें' : 'Upload Purchase Invoice PDF or Image'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        {isHindi ? 'PDF, PNG, JPG, JPEG फ़ाइलें समर्थित हैं' : 'Supports PDF bills, scanned receipts, JPG, PNG'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Highlights */}
              <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{isHindi ? 'सप्लायर/वेन्डर लेज़र एवं स्टॉक आइटम का स्वतः निर्माण (Auto-Create)' : 'Vendor Ledger & Stock Items auto-created if missing'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{isHindi ? 'भाड़ा (Freight), हम्माली, पैकिंग एवं अन्य अतिरिक्त प्रभारों की अलग प्रविष्टि' : 'Extracts Freight, Carriage, Hamali, Packaging & Extra Charges separately'}</span>
                </div>
              </div>

              {errorMsg && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs font-semibold text-rose-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          )}

          {/* STEP 2: REVIEW & CONFIRMATION SCREEN */}
          {reviewData && (
            <div className="space-y-5 animate-fadeIn">
              
              {/* Top Banner with File Info */}
              <div className="flex items-center justify-between bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 px-4 text-xs">
                <div className="flex items-center gap-2.5 text-amber-300 font-medium">
                  <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{isHindi ? `फ़ाइल: ${fileName}` : `Parsed File: ${fileName}`}</span>
                  <span className="bg-slate-900 border border-slate-700 text-indigo-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                    {fyRange.label}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setReviewData(null);
                    setValidationError(null);
                  }}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-amber-300 transition underline underline-offset-2"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'दूसरी फ़ाइल चुनें' : 'Upload another file'}</span>
                </button>
              </div>

              {/* Out-of-Financial-Year Guard Warning */}
              {!isReviewDateInFY && (
                <div className="p-3.5 bg-rose-500/15 border border-rose-500/50 rounded-2xl text-xs text-rose-200 flex items-start gap-2.5 shadow-lg">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-rose-300">
                      {isHindi
                        ? `⚠️ पुरानी / बाहरी वित्तीय वर्ष तिथि पकड़ी गई (${reviewData.invoiceDate})`
                        : `⚠️ Out-of-Financial-Year Bill Date Detected (${reviewData.invoiceDate})`}
                    </p>
                    <p className="text-[11px] text-rose-200/90 mt-0.5">
                      {isHindi
                        ? `सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) है। यह बिल इस वित्तीय वर्ष का नहीं है — सेव करने से पहले बिल दिनांक की जाँच करें या सही वित्तीय वर्ष में जाएं।`
                        : `Active Financial Year is ${fyRange.label} (${fyRange.displayRange}). Bills outside this period are blocked from posting to keep P&L and GST accurate.`}
                    </p>
                  </div>
                </div>
              )}

              {/* Validation Error Banner */}
              {validationError && (
                <div className="p-3.5 bg-rose-600/20 border border-rose-500/60 rounded-2xl text-xs font-bold text-rose-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                  <button type="button" onClick={() => setValidationError(null)} className="text-rose-300 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Vendor & Invoice Meta Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-950/60 p-4 md:p-5 rounded-2xl border border-slate-800">
                {/* Party Name */}
                <div className="space-y-1.5 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isHindi ? 'सप्लायर / वेन्डर का नाम (Supplier Name)' : 'Supplier / Vendor Name'}</span>
                    </label>
                    {data.parties.some(p => p.name.trim().toLowerCase() === reviewData.supplierName.trim().toLowerCase() || (reviewData.supplierGstin && p.gstin === reviewData.supplierGstin)) ? (
                      <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                        <CheckCircle2 className="w-3 h-3" /> {isHindi ? 'मौजूदा वेन्डर मिला' : 'Existing Vendor Matched'}
                      </span>
                    ) : (
                      <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        <Plus className="w-3 h-3" /> {isHindi ? 'नया वेन्डर लेज़र बनेगा' : 'New Vendor Ledger Will Be Created'}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={reviewData.supplierName}
                    onChange={(e) => setReviewData({ ...reviewData, supplierName: e.target.value })}
                    placeholder="Enter Supplier Vendor Name"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
                  />
                </div>

                {/* GSTIN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {isHindi ? 'सप्लायर GSTIN' : 'Supplier GSTIN'}
                  </label>
                  <input
                    type="text"
                    value={reviewData.supplierGstin}
                    onChange={(e) => setReviewData({ ...reviewData, supplierGstin: e.target.value.toUpperCase() })}
                    placeholder="15-digit GSTIN"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                  />
                </div>

                {/* Invoice Ref Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {isHindi ? 'इनवॉइस / बिल नंबर (Supplier Bill No)' : 'Invoice / Bill Reference No'}
                  </label>
                  <input
                    type="text"
                    value={reviewData.supplierInvoiceNo}
                    onChange={(e) => setReviewData({ ...reviewData, supplierInvoiceNo: e.target.value })}
                    placeholder="e.g. INV-2024-001"
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 font-mono focus:outline-none"
                  />
                </div>

                {/* Invoice Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {isHindi ? 'बिल दिनांक (Bill Date)' : 'Invoice Date'}
                  </label>
                  <input
                    type="date"
                    value={reviewData.invoiceDate}
                    onChange={(e) => setReviewData({ ...reviewData, invoiceDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
                  />
                </div>

                {/* Due Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {isHindi ? 'भुगतान देय तिथि (Due Date)' : 'Payment Due Date'}
                  </label>
                  <input
                    type="date"
                    value={reviewData.dueDate}
                    onChange={(e) => setReviewData({ ...reviewData, dueDate: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-sm text-slate-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* SECTION 1: Stock Items Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-amber-400" />
                    <span>{isHindi ? '1. सामान / उत्पाद सूची (Stock Items)' : '1. Purchased Stock Items'}</span>
                  </h4>
                  <button
                    onClick={handleAddItemRow}
                    className="flex items-center gap-1 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isHindi ? '+ आइटम जोड़ें' : '+ Add Item Row'}</span>
                  </button>
                </div>

                <div className="border border-slate-800 rounded-2xl overflow-x-auto bg-slate-950/40">
                  <table className="w-full text-xs text-left min-w-[650px]">
                    <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th className="p-3 w-1/3">{isHindi ? 'आइटम का नाम (Item Name)' : 'Item Description'}</th>
                        <th className="p-3 w-20">{isHindi ? 'HSN' : 'HSN Code'}</th>
                        <th className="p-3 w-20 text-right">{isHindi ? 'मात्रा (Qty)' : 'Quantity'}</th>
                        <th className="p-3 w-20">{isHindi ? 'इकाई (Unit)' : 'Unit'}</th>
                        <th className="p-3 w-28 text-right">{isHindi ? 'दर (Rate ₹)' : 'Rate (₹)'}</th>
                        <th className="p-3 w-20 text-right">{isHindi ? 'GST %' : 'GST %'}</th>
                        <th className="p-3 w-28 text-right">{isHindi ? 'कुल राशि (Total)' : 'Total (₹)'}</th>
                        <th className="p-3 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {reviewData.items.map((it) => {
                        const isExistingItem = data.items.some(i => i.name.trim().toLowerCase() === it.itemName.trim().toLowerCase());
                        const lineGross = (Number(it.quantity) || 0) * (Number(it.rate) || 0);
                        const lineDisc = lineGross * ((Number(it.discountPercent) || 0) / 100);
                        const taxable = lineGross - lineDisc;
                        const lineTax = taxable * ((Number(it.taxRate) || 0) / 100);
                        const lineTotal = taxable + lineTax;

                        return (
                          <tr key={it.id} className="hover:bg-slate-800/30 transition">
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={it.itemName}
                                onChange={(e) => handleItemChange(it.id, 'itemName', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none"
                              />
                              <div className="mt-1">
                                {isExistingItem ? (
                                  <span className="text-[10px] text-emerald-400 font-medium">✓ {isHindi ? 'मौजूदा स्टॉक आइटम' : 'Matched Item Master'}</span>
                                ) : (
                                  <span className="text-[10px] text-amber-400 font-medium">+ {isHindi ? 'नया स्टॉक आइटम बनेगा' : 'Will Auto-Create New Item'}</span>
                                )}
                              </div>
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={it.hsnSacCode}
                                onChange={(e) => handleItemChange(it.id, 'hsnSacCode', e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 font-mono focus:outline-none"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0.01"
                                step="any"
                                value={it.quantity}
                                onChange={(e) => handleItemChange(it.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 text-right font-semibold focus:outline-none"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={it.unit}
                                onChange={(e) => handleItemChange(it.id, 'unit', e.target.value.toUpperCase())}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 uppercase focus:outline-none"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="0"
                                step="any"
                                value={it.rate}
                                onChange={(e) => handleItemChange(it.id, 'rate', parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1.5 text-xs text-slate-100 text-right font-semibold focus:outline-none"
                              />
                            </td>
                            <td className="p-2.5">
                              <select
                                value={it.taxRate}
                                onChange={(e) => handleItemChange(it.id, 'taxRate', parseFloat(e.target.value) || 0)}
                                className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-1.5 py-1.5 text-xs text-slate-100 text-right focus:outline-none"
                              >
                                <option value={0}>0%</option>
                                <option value={5}>5%</option>
                                <option value={12}>12%</option>
                                <option value={18}>18%</option>
                                <option value={28}>28%</option>
                              </select>
                            </td>
                            <td className="p-2.5 text-right font-bold text-slate-200">
                              ₹{lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="p-2.5 text-center">
                              {reviewData.items.length > 1 && (
                                <button
                                  onClick={() => handleRemoveItemRow(it.id)}
                                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                                  title="Remove item"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SECTION 2: Additional Charges & Extra Expenses */}
              <div className="space-y-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      <span>{isHindi ? '2. अतिरिक्त प्रभार (Freight, Carriage, Hamali & Extra Charges)' : '2. Additional Charges & Extra Expenses'}</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {isHindi ? 'भाड़ा, गाड़ी भाड़ा, हम्माली/लोडिंग, पैकिंग प्रभार आदि अलग से दर्ज करें' : 'Log transport freight, cartage, hamali/loading, packaging charges with custom description'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleAddChargeRow('Freight Charges (भाड़ा)')}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition"
                    >
                      + {isHindi ? 'भाड़ा (Freight)' : 'Freight'}
                    </button>
                    <button
                      onClick={() => handleAddChargeRow('Carriage Inward (गाड़ी भाड़ा)')}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition"
                    >
                      + {isHindi ? 'गाड़ी भाड़ा (Cartage)' : 'Cartage'}
                    </button>
                    <button
                      onClick={() => handleAddChargeRow('Hamali / Loading Charges (हम्माली)')}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition"
                    >
                      + {isHindi ? 'हम्माली (Hamali)' : 'Hamali'}
                    </button>
                    <button
                      onClick={() => handleAddChargeRow('Packaging Charges (पैकिंग)')}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition"
                    >
                      + {isHindi ? 'पैकिंग (Packaging)' : 'Packaging'}
                    </button>
                  </div>
                </div>

                {reviewData.additionalCharges.length === 0 ? (
                  <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-xl text-center text-xs text-slate-400">
                    <span>{isHindi ? 'कोई अतिरिक्त प्रभार नहीं है। जोड़ने के लिए ऊपर बटन पर क्लिक करें।' : 'No additional charges added. Click above to add Freight, Hamali, Packaging, etc.'}</span>
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-xl overflow-x-auto bg-slate-900/50">
                    <table className="w-full text-xs text-left min-w-[550px]">
                      <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                        <tr>
                          <th className="p-2.5 w-1/2">{isHindi ? 'शुल्क का प्रकार / विवरण (Charge Description)' : 'Charge Description'}</th>
                          <th className="p-2.5 w-28 text-right">{isHindi ? 'कर योग्य मूल्य (₹)' : 'Taxable Amount (₹)'}</th>
                          <th className="p-2.5 w-20 text-right">{isHindi ? 'GST %' : 'GST %'}</th>
                          <th className="p-2.5 w-28 text-right">{isHindi ? 'कर (GST ₹)' : 'GST Tax (₹)'}</th>
                          <th className="p-2.5 w-28 text-right">{isHindi ? 'कुल मूल्य (Total ₹)' : 'Total (₹)'}</th>
                          <th className="p-2.5 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {reviewData.additionalCharges.map((ch) => {
                          const amt = Number(ch.amount) || 0;
                          const gstP = Number(ch.gstPercent) || 0;
                          const taxAmt = amt * (gstP / 100);
                          const chTotal = amt + taxAmt;

                          return (
                            <tr key={ch.id} className="hover:bg-slate-800/30 transition">
                              <td className="p-2">
                                <input
                                  type="text"
                                  value={ch.description}
                                  onChange={(e) => handleChargeChange(ch.id, 'description', e.target.value)}
                                  placeholder="e.g. Freight / Loading / Packaging"
                                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2.5 py-1 text-xs text-slate-100 focus:outline-none"
                                />
                              </td>
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={ch.amount}
                                  onChange={(e) => handleChargeChange(ch.id, 'amount', parseFloat(e.target.value) || 0)}
                                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-2 py-1 text-xs text-slate-100 text-right font-semibold focus:outline-none"
                                />
                              </td>
                              <td className="p-2">
                                <select
                                  value={ch.gstPercent}
                                  onChange={(e) => handleChargeChange(ch.id, 'gstPercent', parseFloat(e.target.value) || 0)}
                                  className="w-full bg-slate-900 border border-slate-700 focus:border-amber-500 rounded-lg px-1.5 py-1 text-xs text-slate-100 text-right focus:outline-none"
                                >
                                  <option value={0}>0%</option>
                                  <option value={5}>5%</option>
                                  <option value={12}>12%</option>
                                  <option value={18}>18%</option>
                                  <option value={28}>28%</option>
                                </select>
                              </td>
                              <td className="p-2 text-right font-medium text-emerald-400">
                                ₹{taxAmt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="p-2 text-right font-bold text-amber-300">
                                ₹{chTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  onClick={() => handleRemoveChargeRow(ch.id)}
                                  className="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition"
                                  title="Remove charge"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION 3: ROUND OFF ADJUSTMENT */}
              <div className="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-xl">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                      <span>3. {isHindi ? 'राउंड ऑफ समायोजन (Round Off Adjustment)' : 'Round Off Adjustment (Invoice Value Match)'}</span>
                      {reviewData.roundOff !== 0 && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono font-bold">
                          {reviewData.roundOff > 0 ? `+₹${reviewData.roundOff.toFixed(2)}` : `-₹${Math.abs(reviewData.roundOff).toFixed(2)}`}
                        </span>
                      )}
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      {isHindi 
                        ? 'यदि इनवॉइस में कुछ पैसे का अंतर है तो यहाँ राउंड ऑफ जोड़ें/घटाएं ताकि इनवॉइस वैल्यू बिल्कुल मैच हो जाए।' 
                        : 'Adjust rounding fraction (+/-) so the grand total matches the physical supplier invoice exactly.'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1.5 text-xs text-slate-400 font-mono">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      value={reviewData.roundOff || 0}
                      onChange={(e) => handleRoundOffChange(parseFloat(e.target.value) || 0)}
                      placeholder="0.00"
                      className="w-28 bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-xl pl-6 pr-2.5 py-1.5 text-xs font-mono font-bold text-indigo-300 text-right focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoRoundOff}
                    className="px-2.5 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                    title="Auto-calculate round off to nearest rupee"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{isHindi ? 'ऑटो राउंड' : 'Auto Round'}</span>
                  </button>
                  {reviewData.roundOff !== 0 && (
                    <button
                      type="button"
                      onClick={() => handleRoundOffChange(0)}
                      className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-xl text-xs transition"
                      title="Reset to 0"
                    >
                      {isHindi ? 'रीसेट' : 'Zero'}
                    </button>
                  )}
                </div>
              </div>

              {/* Summary Calculations Footer */}
              <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs text-slate-300 w-full md:w-auto">
                  <div>
                    <span className="text-slate-400 block text-[10px]">{isHindi ? 'सामान का कर योग्य मूल्य' : 'Items Taxable'}</span>
                    <span className="font-semibold text-slate-100">₹{totals.itemsSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">{isHindi ? 'अतिरिक्त प्रभार कर योग्य' : 'Charges Taxable'}</span>
                    <span className="font-semibold text-amber-300">₹{totals.chargesSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">{isHindi ? 'कुल जीएसटी कर' : 'Total GST Tax'}</span>
                    <span className="font-semibold text-emerald-400">₹{totals.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">{isHindi ? 'कुल कर योग्य राशि' : 'Total Taxable Value'}</span>
                    <span className="font-bold text-slate-200">₹{totals.totalTaxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-800 pt-3 md:pt-0">
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">{isHindi ? 'अंतिम इनवॉइस मूल्य' : 'Grand Total Invoice Value'}</span>
                    <span className="text-lg font-extrabold text-amber-400">₹{totals.grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <button
                    onClick={handleConfirmAndSave}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-500/20 text-xs transition transform active:scale-95 flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isHindi ? 'सहमत होकर परचेज बिल सहेजें' : 'Confirm & Post Purchase Bill'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  );
};
