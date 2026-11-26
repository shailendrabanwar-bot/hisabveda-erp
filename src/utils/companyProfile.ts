import {
  CompanyDetails,
  CompanyGstRegistrationType,
  Currency,
  NumberFormatMode,
  SalesInvoice,
} from '../types';

export interface CountryPreset {
  country: string;
  currency: Currency;
  numberFormat: NumberFormatMode;
  defaultGstEnabled: boolean;
  defaultGstType: CompanyGstRegistrationType;
  taxLabel: string;
}

export const COUNTRY_PRESETS: CountryPreset[] = [
  {
    country: 'India',
    currency: 'INR',
    numberFormat: 'INDIAN',
    defaultGstEnabled: true,
    defaultGstType: 'REGULAR',
    taxLabel: 'GST (CGST / SGST / IGST)',
  },
  {
    country: 'United Arab Emirates (UAE)',
    currency: 'AED',
    numberFormat: 'INTERNATIONAL',
    defaultGstEnabled: false,
    defaultGstType: 'UNREGISTERED',
    taxLabel: 'VAT / Non-GST',
  },
  {
    country: 'United States',
    currency: 'USD',
    numberFormat: 'INTERNATIONAL',
    defaultGstEnabled: false,
    defaultGstType: 'UNREGISTERED',
    taxLabel: 'Sales Tax / Exempt',
  },
  {
    country: 'United Kingdom',
    currency: 'GBP',
    numberFormat: 'INTERNATIONAL',
    defaultGstEnabled: false,
    defaultGstType: 'UNREGISTERED',
    taxLabel: 'VAT / Standard',
  },
  {
    country: 'European Union',
    currency: 'EUR',
    numberFormat: 'INTERNATIONAL',
    defaultGstEnabled: false,
    defaultGstType: 'UNREGISTERED',
    taxLabel: 'VAT / Standard',
  },
  {
    country: 'Singapore',
    currency: 'USD',
    numberFormat: 'INTERNATIONAL',
    defaultGstEnabled: false,
    defaultGstType: 'UNREGISTERED',
    taxLabel: 'GST / Exempt',
  },
  {
    country: 'Other / International',
    currency: 'USD',
    numberFormat: 'INTERNATIONAL',
    defaultGstEnabled: false,
    defaultGstType: 'UNREGISTERED',
    taxLabel: 'Non-GST / International',
  },
];

export const CURRENCY_OPTIONS: { code: Currency; symbol: string; label: string }[] = [
  { code: 'INR', symbol: '₹', label: 'INR (₹) — Indian Rupee' },
  { code: 'USD', symbol: '$', label: 'USD ($) — US Dollar' },
  { code: 'AED', symbol: 'د.إ', label: 'AED (د.إ) — UAE Dirham' },
  { code: 'EUR', symbol: '€', label: 'EUR (€) — Euro' },
  { code: 'GBP', symbol: '£', label: 'GBP (£) — British Pound' },
];

export function getCurrencySymbol(currency?: Currency | string): string {
  switch (currency) {
    case 'USD':
      return '$';
    case 'AED':
      return 'د.إ';
    case 'EUR':
      return '€';
    case 'GBP':
      return '£';
    case 'INR':
    default:
      return '₹';
  }
}

export interface ResolvedCompanyTaxProfile {
  country: string;
  currency: Currency;
  numberFormat: NumberFormatMode;
  gstEnabled: boolean;
  gstRegistrationType: CompanyGstRegistrationType;
  isRegularGst: boolean;
  isComposition: boolean;
  isNonGst: boolean;
  shouldChargeGstOnSales: boolean;
  compositionTaxRate: number;
  cessEnabled: boolean;
  ewayBillEnabled: boolean;
  tdsTcsEnabled: boolean;
  batchGodownEnabled: boolean;
}

export function resolveCompanyTaxProfile(company?: Partial<CompanyDetails> | null): ResolvedCompanyTaxProfile {
  const country = (company?.country || 'India').trim() || 'India';
  const currency: Currency = (company?.currency as Currency) || 'INR';
  const numberFormat: NumberFormatMode =
    company?.numberFormat ||
    (currency === 'INR' && country.toLowerCase() === 'india' ? 'INDIAN' : currency === 'INR' ? 'INDIAN' : 'INTERNATIONAL');

  let gstRegistrationType: CompanyGstRegistrationType;
  if (company?.gstRegistrationType) {
    gstRegistrationType = company.gstRegistrationType;
  } else if (company?.gstEnabled === false) {
    gstRegistrationType = 'UNREGISTERED';
  } else {
    gstRegistrationType = 'REGULAR';
  }

  const gstEnabled =
    typeof company?.gstEnabled === 'boolean'
      ? company.gstEnabled
      : gstRegistrationType !== 'UNREGISTERED';

  const effectiveRegType: CompanyGstRegistrationType = gstEnabled ? gstRegistrationType : 'UNREGISTERED';
  const isComposition = gstEnabled && effectiveRegType === 'COMPOSITION';
  const isNonGst = !gstEnabled || effectiveRegType === 'UNREGISTERED';
  const isRegularGst = gstEnabled && (effectiveRegType === 'REGULAR' || effectiveRegType === 'SEZ_EXPORT');
  const shouldChargeGstOnSales = isRegularGst;

  const rawCompRate = Number(company?.compositionTaxRate);
  const compositionTaxRate = Number.isFinite(rawCompRate) && rawCompRate >= 0 ? rawCompRate : 1;

  const cessEnabled = Boolean(company?.cessEnabled);
  const ewayBillEnabled =
    typeof company?.ewayBillEnabled === 'boolean'
      ? company.ewayBillEnabled
      : country.toLowerCase() === 'india' && gstEnabled;
  const tdsTcsEnabled =
    typeof company?.tdsTcsEnabled === 'boolean' ? company.tdsTcsEnabled : country.toLowerCase() === 'india';
  const batchGodownEnabled =
    typeof company?.batchGodownEnabled === 'boolean' ? company.batchGodownEnabled : false;

  return {
    country,
    currency,
    numberFormat,
    gstEnabled,
    gstRegistrationType: effectiveRegType,
    isRegularGst,
    isComposition,
    isNonGst,
    shouldChargeGstOnSales,
    compositionTaxRate,
    cessEnabled,
    ewayBillEnabled,
    tdsTcsEnabled,
    batchGodownEnabled,
  };
}

export interface InvoicePrintHeaderInfo {
  title: string;
  subtitleHindi: string;
  compositionDeclaration: string | null;
  hideTaxColumns: boolean;
  showCessColumn: boolean;
  isNonGstOrComposition: boolean;
}

export function getInvoicePrintHeaderInfo(
  company: Partial<CompanyDetails> | null | undefined,
  invoice: Partial<SalesInvoice>
): InvoicePrintHeaderInfo {
  const profile = resolveCompanyTaxProfile(company);
  const effectiveSupplyType = invoice.registrationTypeAtSupply || profile.gstRegistrationType;
  const isCompositionSupply = profile.isComposition || effectiveSupplyType === 'COMPOSITION';
  const isNonGstSupply = !profile.gstEnabled || effectiveSupplyType === 'UNREGISTERED';
  const hasRecordedTax = (Number(invoice.totalTax) || 0) > 0;
  const hasRecordedCess = (Number(invoice.cessAmount) || 0) > 0;

  if (invoice.invoiceType === 'PROFORMA') {
    return {
      title: 'PROFORMA INVOICE',
      subtitleHindi: 'प्रोफोर्मा इनवॉइस (अनुमानित बिल)',
      compositionDeclaration: null,
      hideTaxColumns: isNonGstSupply || (isCompositionSupply && !hasRecordedTax),
      showCessColumn: hasRecordedCess || (profile.cessEnabled && !isNonGstSupply && !isCompositionSupply),
      isNonGstOrComposition: isNonGstSupply || isCompositionSupply,
    };
  }

  if (isCompositionSupply) {
    return {
      title: 'BILL OF SUPPLY',
      subtitleHindi: 'बिल ऑफ सप्लाई (कंपोज़िशन डीलर)',
      compositionDeclaration: 'Composition Taxable Person, not eligible to collect tax on supplies',
      hideTaxColumns: true,
      showCessColumn: false,
      isNonGstOrComposition: true,
    };
  }

  if (isNonGstSupply) {
    const isRetail = invoice.invoiceType === 'RETAIL_BILL';
    return {
      title: isRetail ? 'RETAIL INVOICE / BILL OF SUPPLY' : 'BILL OF SUPPLY',
      subtitleHindi: isRetail ? 'खुदरा बिल / बिल ऑफ सप्लाई' : 'बिल ऑफ सप्लाई (गैर-जीएसटी)',
      compositionDeclaration: null,
      hideTaxColumns: !hasRecordedTax,
      showCessColumn: hasRecordedCess,
      isNonGstOrComposition: true,
    };
  }

  if (invoice.invoiceType === 'NIL_RATED' || invoice.invoiceType === 'EXEMPT') {
    return {
      title: 'BILL OF SUPPLY',
      subtitleHindi: 'बिल ऑफ सप्लाई (कर-मुक्त)',
      compositionDeclaration: null,
      hideTaxColumns: !hasRecordedTax,
      showCessColumn: hasRecordedCess,
      isNonGstOrComposition: false,
    };
  }

  if (invoice.invoiceType === 'RETAIL_BILL' && !hasRecordedTax) {
    return {
      title: 'RETAIL INVOICE / BILL OF SUPPLY',
      subtitleHindi: 'खुदरा इनवॉइस',
      compositionDeclaration: null,
      hideTaxColumns: true,
      showCessColumn: false,
      isNonGstOrComposition: true,
    };
  }

  return {
    title: 'TAX INVOICE',
    subtitleHindi: 'टैक्स इनवॉइस',
    compositionDeclaration: null,
    hideTaxColumns: false,
    showCessColumn: hasRecordedCess || profile.cessEnabled,
    isNonGstOrComposition: false,
  };
}

export interface CompositionTurnoverSummary {
  invoiceCount: number;
  taxableTurnover: number;
  compositionTaxRate: number;
  compositionTaxPayable: number;
}

export function computeCompositionTurnoverSummary(
  invoices: SalesInvoice[],
  company?: Partial<CompanyDetails> | null
): CompositionTurnoverSummary {
  const profile = resolveCompanyTaxProfile(company);
  const activeSales = (invoices || []).filter(
    (inv) => inv.status !== 'CANCELLED' && inv.invoiceType !== 'PROFORMA'
  );
  const taxableTurnover = activeSales.reduce((sum, inv) => {
    const net = Math.max(0, (Number(inv.subtotal) || 0) - (Number(inv.totalDiscount) || 0));
    return sum + (net > 0 ? net : Number(inv.grandTotal) || 0);
  }, 0);
  const compositionTaxPayable =
    Math.round(taxableTurnover * (profile.compositionTaxRate / 100) * 100) / 100;

  return {
    invoiceCount: activeSales.length,
    taxableTurnover: Math.round(taxableTurnover * 100) / 100,
    compositionTaxRate: profile.compositionTaxRate,
    compositionTaxPayable,
  };
}
