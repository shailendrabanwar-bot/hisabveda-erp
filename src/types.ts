export type Currency = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED';
export type NumberFormatMode = 'INDIAN' | 'INTERNATIONAL';
export type CompanyGstRegistrationType = 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ_EXPORT';

export type AccountCategory = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountGroup {
  id: string;
  code: string;
  name: string;
  category: AccountCategory;
  nature?: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';
  affectsGrossProfit?: boolean;
  parentGroupId?: string; // ID of parent group if this is a sub-group
  parentGroupName?: string; // Name of parent group e.g. "Indirect Expenses"
  isSystem?: boolean;
  description?: string;
}

export interface Account {
  id: string;
  code: string;
  name: string;
  category: AccountCategory;
  subCategory: string; // e.g. "Current Asset", "Sundry Debtors", "Direct Expense", "Bank Account"
  mainGroup?: string; // Main Accounting Group e.g. "Sundry Debtors", "Direct Expenses", "Bank Accounts", "Fixed Assets"
  parentGroupId?: string; // ID of Parent Group if this is a Sub-Ledger or Sub-Group
  isGroup?: boolean; // true if this is a Group heading
  isSubLedger?: boolean; // true if this is a sub-account/sub-ledger
  accountNumber?: string; // Bank Account number or reference
  openingBalance: number;
  balanceType: 'DR' | 'CR';
  isSystem?: boolean;
  externalGuid?: string;
}

export interface ItemMaster {
  id: string;
  code: string;
  name: string;
  description: string;
  hsnSacCode: string;
  unit: string; // Pcs, Kg, Box, Service, Mtr, Box
  purchasePrice: number;
  salesPrice: number;
  sellingPrice?: number; // Alias for salesPrice
  wholesalePrice?: number; // Wholesale tier price
  taxRate: number; // e.g. 18 for 18%
  gstRate?: number; // Alias for taxRate
  cessRate?: number; // Optional Cess % e.g. 12 for 12%
  currentStock: number;
  openingStock?: number;
  minStockLevel: number; // Reorder Point
  minStockAlert?: number;
  reorderQuantity?: number; // Recommended Reorder Batch Qty
  maxStockLevel?: number; // Maximum stock threshold
  location?: string; // Warehouse rack / godown location
  category: string;
  valuationMethod?: 'FIFO' | 'WEIGHTED_AVG' | 'PURCHASE_COST';
  barcode?: string;
  mrp?: number;
  defaultGodownId?: string;
  godownStocks?: Record<string, number>;
  trackBatchExpiry?: boolean;
  openingStockValue?: number;
  closingStockValue?: number;
  importedClosingQty?: number;
  importedPurchasePrice?: number;
  externalGuid?: string;
}

export type GodownType = 'MAIN_WAREHOUSE' | 'RETAIL_SHOP' | 'POS_COUNTER' | 'COLD_STORAGE' | 'BRANCH';

export interface Godown {
  id: string;
  name: string;
  code: string;
  address?: string;
  managerName?: string;
  phone?: string;
  godownType: GodownType;
  isDefault?: boolean;
  isPosCounter?: boolean;
  isActive: boolean;
}

export interface ItemBatch {
  id: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  godownId: string;
  godownName?: string;
  batchNumber: string;
  mfgDate?: string;
  expiryDate?: string;
  mrp?: number;
  purchaseRate: number;
  salesRate: number;
  initialQty: number;
  availableQty: number;
  barcode?: string;
  supplierInvoiceNo?: string;
  purchaseBillId?: string;
  notes?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'DEPLETED' | 'WRITTEN_OFF';
  createdAt?: string;
}

export interface StockTransferLine {
  id: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  mrp?: number;
  rate?: number;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  date: string;
  fromGodownId: string;
  fromGodownName: string;
  toGodownId: string;
  toGodownName: string;
  items: StockTransferLine[];
  totalQuantity: number;
  notes?: string;
  transferredBy?: string;
  status: 'COMPLETED' | 'CANCELLED';
}

export interface StockAdjustmentRecord {
  id: string;
  itemId: string;
  itemName: string;
  itemCode?: string;
  date: string;
  previousStock: number;
  newStock: number;
  difference: number;
  reason: string;
  notes?: string;
  adjustedBy?: string;
  godownId?: string;
  godownName?: string;
  batchId?: string;
  batchNumber?: string;
}

export type PartyType = 'CUSTOMER' | 'VENDOR' | 'BOTH';

export interface PartyMaster {
  id: string;
  code: string;
  name: string;
  legalName?: string;
  tradeName?: string;
  contactPerson?: string;
  type: PartyType;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  address: string;
  pincode?: string;
  state: string;
  stateCode: string;
  creditLimit: number;
  creditDays?: number;
  openingBalance: number;
  balanceType: 'DR' | 'CR';
  openingBalanceType?: 'DR' | 'CR';
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  gstCategory?: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ_DEVELOPER' | 'CASUAL';
  taxpayerStatus?: 'Active' | 'Cancelled' | 'Suspended';
  externalGuid?: string;
}

export interface InvoiceItem {
  id: string;
  itemId: string;
  itemName: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  rate: number;
  discountPercent: number;
  taxRate: number; // e.g., 18
  taxAmount: number;
  cessPercent?: number;
  cessAmount?: number;
  totalAmount: number; // Subtotal + Tax + Cess
  barcode?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  mfgDate?: string;
  mrp?: number;
  godownId?: string;
  godownName?: string;
}

export type InvoiceType = 'TAX_INVOICE' | 'RETAIL_BILL' | 'PROFORMA' | 'EXPORT' | 'NIL_RATED' | 'EXEMPT';
export type InvoiceStatus = 'PAID' | 'PARTIAL' | 'UNPAID' | 'CANCELLED';
export type RecurringFrequency = 'NONE' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

export interface MediaAttachment {
  id: string;
  title: string;
  type: 'VIDEO' | 'DOCUMENT' | 'IMAGE';
  fileUrl: string;
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  category?: string;
  notes?: string;
}

export interface ExtraInvoiceLedgerLine {
  accountId: string;
  accountName?: string;
  debit: number;
  credit: number;
}

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  invoiceType: InvoiceType;
  partyId: string;
  partyName: string;
  partyGstin: string;
  partyGstCategory?: 'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ_DEVELOPER' | 'CASUAL';
  partyAddress: string;
  partyState: string;
  placeOfSupply: string; // State
  isInterState: boolean; // if true, IGST else CGST+SGST
  items: InvoiceItem[];
  subtotal: number;
  totalDiscount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount?: number;
  totalTax: number;
  roundOff: number;
  registrationTypeAtSupply?: CompanyGstRegistrationType;
  grandTotal: number;
  amountPaid: number;
  showAdvanceOnInvoice?: boolean;
  advanceNote?: string;
  status: InvoiceStatus;
  paymentMode?: string;
  paymentAccountId?: string;
  notes?: string;
  termsConditions?: string;
  isRecurring?: boolean;
  frequency?: RecurringFrequency;
  nextRecurringDate?: string;
  lastGeneratedDate?: string;
  recurringParentId?: string;
  mediaAttachments?: MediaAttachment[];
  // Shipping & Logistics / E-Waybill details
  shippingName?: string;
  shippingGstin?: string;
  shippingAddress?: string;
  shippingState?: string;
  deliveryNoteNo?: string;
  deliveryNoteDate?: string;
  orderReferenceNo?: string;
  orderDate?: string;
  shippedVia?: string;
  termsOfDelivery?: string;
  partyCity?: string;
  partyPincode?: string;
  ewayBillNumber?: string;
  ewayBillDate?: string;
  godownId?: string;
  godownName?: string;
  isPosSale?: boolean;
  posCounterName?: string;
  tenderedAmount?: number;
  changeAmount?: number;
  paymentBreakdown?: {
    cash: number;
    upi: number;
    card: number;
    credit: number;
  };
  primaryAccountId?: string;
  extraLedgerLines?: ExtraInvoiceLedgerLine[];
  vehicleNo?: string;
  transporterId?: string;
  externalGuid?: string;
}

export type VoucherType = 'JOURNAL' | 'PAYMENT' | 'RECEIPT' | 'DEBIT_NOTE' | 'CREDIT_NOTE' | 'CONTRA';

export type NoteType = 'DEBIT_NOTE' | 'CREDIT_NOTE';

export interface DebitCreditNote {
  id: string;
  noteNumber: string; // e.g. DN-2026-001 or CN-2026-001
  type: NoteType;
  date: string;
  partyId: string;
  partyName: string;
  partyGstin?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  reason: string; // e.g., 'Goods Returned', 'Discount Allowed', 'Price Difference', 'Damaged Stock'
  items: InvoiceItem[];
  subtotal: number;
  totalDiscount?: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount?: number;
  totalTax: number;
  roundOff?: number;
  grandTotal: number;
  remarks?: string;
  primaryAccountId?: string;
  extraLedgerLines?: ExtraInvoiceLedgerLine[];
  externalGuid?: string;
}

export interface JournalEntryLine {
  id: string;
  accountId: string;
  accountName: string;
  accountCode: string;
  debit: number;
  credit: number;
  narration?: string;
}

export interface Voucher {
  id: string;
  voucherNumber: string;
  type: VoucherType;
  date: string;
  bankersDate?: string;
  instrumentNumber?: string;
  referenceNo?: string;
  partyId?: string;
  partyName?: string;
  paymentMode?: 'CASH' | 'BANK_TRANSFER' | 'CHEQUE' | 'UPI' | 'CARD';
  bankAccountId?: string;
  linkedInvoiceId?: string;
  linkedPurchaseId?: string;
  entries: JournalEntryLine[];
  totalAmount: number;
  narration: string;
  isReconciled?: boolean;
  reconciledDate?: string;
  createdBy?: string;
  bankReferenceNo?: string;
  externalGuid?: string;
}

export interface BankStatementLine {
  id: string;
  date: string;
  description: string;
  referenceNo: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  debit?: number;
  credit?: number;
  runningBalance?: number;
  reconciled: boolean;
  isReconciled?: boolean;
  matchedVoucherId?: string;
  matchedTxId?: string;
  matchedTxType?: 'INVOICE' | 'VOUCHER' | string;
  allocatedAccountId?: string;
  allocatedAccountName?: string;
}

export interface Employee {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
  joiningDate: string;
  phone: string;
  email: string;
  pan: string;
  aadhaar?: string;
  bankAccountNo: string;
  bankName: string;
  ifscCode: string;
  basicSalary: number;
  hra: number;
  conveyanceAllowance: number;
  specialAllowance: number;
  pfDeduction: number;
  esiDeduction: number;
  tdsDeduction: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface PayrollRecord {
  id: string;
  payrollMonth: string; // e.g. "2026-07" or "July 2026"
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  designation: string;
  department: string;
  workingDays: number;
  presentDays: number;
  leaveDays: number;
  overtimeHours?: number;
  overtimePay?: number;
  basicSalary: number;
  hra: number;
  conveyanceAllowance: number;
  specialAllowance: number;
  grossSalary: number;
  pfDeduction: number;
  pfEmployerContribution?: number;
  esiDeduction: number;
  esicEmployerContribution?: number;
  professionalTax?: number;
  tdsDeduction: number;
  advanceDeduction?: number;
  leaveDeduction?: number;
  otherDeductions: number;
  totalDeductions: number;
  netSalary: number;
  paymentStatus: 'PAID' | 'PENDING';
  paymentDate?: string;
  paymentMode?: string;
  settlementMode?: 'PAYABLE' | 'BANK' | 'CASH';
  settlementAccountId?: string;
  voucherId?: string;
  postedVoucherId?: string;
  postedVoucherNo?: string;
  paymentVoucherId?: string;
  paymentVoucherNo?: string;
}

export interface LanLiveSnapshot {
  companyName: string;
  currency: Currency;
  numberFormat?: NumberFormatMode;
  updatedAt: string;
  fyLabel?: string;
  summary: {
    totalSales: number;
    todaySales: number;
    totalCollected: number;
    totalReceivables: number;
    totalPayables: number;
    cashAndBankBalance: number;
    netProfit: number;
    invoiceCount: number;
    pendingInvoicesCount: number;
  };
  cashBankAccounts: Array<{
    id: string;
    name: string;
    code: string;
    kind: 'CASH' | 'BANK';
    balance: number;
    balanceType: 'DR' | 'CR';
  }>;
  partyOutstandings: Array<{
    id: string;
    name: string;
    phone?: string;
    type: 'CUSTOMER' | 'VENDOR' | 'BOTH';
    balance: number;
    balanceType: 'DR' | 'CR';
    pendingInvoicesCount: number;
  }>;
  recentInvoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    partyName: string;
    grandTotal: number;
    amountPaid: number;
    status: string;
  }>;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate: string;
  partyId: string;
  partyName: string;
  partyGstin?: string;
  partyState?: string;
  items: InvoiceItem[];
  subtotal: number;
  totalTax: number;
  grandTotal: number;
  status: 'PENDING' | 'APPROVED' | 'FULFILLED' | 'CANCELLED';
  notes?: string;
}

export interface PurchaseInvoice {
  id: string;
  billNumber: string; // Internal PB No
  supplierInvoiceNo: string; // Vendor's Tax Invoice No
  date: string;
  dueDate: string;
  partyId: string;
  partyName: string;
  partyGstin?: string;
  partyState?: string;
  isInterState: boolean;
  items: InvoiceItem[];
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  cessAmount?: number;
  totalTax: number;
  totalDiscount?: number;
  roundOff?: number;
  grandTotal: number;
  amountPaid: number;
  status: InvoiceStatus;
  paymentMode?: string;
  paymentAccountId?: string;
  poReferenceNo?: string;
  notes?: string;
  godownId?: string;
  godownName?: string;
  primaryAccountId?: string;
  extraLedgerLines?: ExtraInvoiceLedgerLine[];
  ewayBillNumber?: string;
  vehicleNo?: string;
  transporterId?: string;
  externalGuid?: string;
}

export interface CompanyDetails {
  id?: string;
  name: string;
  tagline: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  address: string;
  city?: string;
  pincode?: string;
  state: string;
  stateCode: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  upiId: string;
  logoUrl?: string;
  signatureUrl?: string;
  authorizedSignatory?: string;
  terms: string;
  currency: Currency;
  country?: string; // e.g., 'India', 'UAE', 'United States', 'United Kingdom'
  numberFormat?: NumberFormatMode; // 'INDIAN' (Lakhs/Crores) vs 'INTERNATIONAL' (Millions)
  gstEnabled?: boolean; // Enable/Disable GST across billing, POS, print
  gstRegistrationType?: CompanyGstRegistrationType; // REGULAR | COMPOSITION | UNREGISTERED | SEZ_EXPORT
  compositionTaxRate?: number; // Composition dealer turnover tax % (default 1%)
  cessEnabled?: boolean; // Enable/Disable Cess columns
  ewayBillEnabled?: boolean; // Enable/Disable E-Way Bill fields & prompts
  tdsTcsEnabled?: boolean; // Enable/Disable TDS / TCS workflows
  batchGodownEnabled?: boolean; // Enable/Disable Batch/Expiry & Multi-Godown Inventory
  negativeStockMode?: 'ALLOW' | 'WARN' | 'BLOCK'; // Negative stock control policy
  financialYearStart?: string; // e.g., "2026-04-01"
  booksBeginningFrom?: string; // e.g., "2026-04-01"
  closingStockValuationMode?: 'AUTO' | 'MANUAL';
  manualClosingStock?: number;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: string; // e.g. "Invoice Created", "Payment Voucher Added"
  details: string;
  user: string;
}

export interface CategoryBudget {
  id: string;
  accountId: string; // Account ID from Chart of Accounts or category key
  accountName: string;
  category: string; // e.g., 'Indirect Expenses', 'Direct Expenses', 'Operations'
  monthlyLimit: number;
  period?: string; // YYYY-MM or 'ALL'
  notes?: string;
}

export interface IssuedLicenseRecord {
  id: string;
  clientName: string;
  licenseKey: string;
  licenseMode: 'SINGLE_USER' | 'MULTI_USER';
  licenseType?: 'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL' | 'ENTERPRISE';
  validityDays?: number;
  maxSeats: number;
  issuedDate: string;
  expiryDate?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  phone?: string;
  machineId?: string;
}

export interface LicenseInfo {
  trialStartDate: string; // ISO string when first launched
  trialActivated?: boolean; // True once user starts 7-Day Free Trial (or activates commercial license)
  trialMobile?: string; // Customer mobile number provided during 1-step free trial onboarding
  isLicensed: boolean; // true if perpetual / paid serial key entered
  licenseKey?: string; // Activated serial key
  licenseSerial?: string; // Unique certificate serial (payload.licenseId)
  activationCodeHash?: string; // SHA-256 hash of consumed single-use ACT-XXXX-XXXX code
  registeredOwner?: string; // Owner/Company name
  machineId: string; // Unique Machine / Hardware Fingerprint
  ownerPin?: string; // Master Owner Security PIN
  activatedDate?: string; // Date of activation (YYYY-MM-DD)
  activatedAtIso?: string; // Exact ISO timestamp when activated
  expiryDate?: string; // License Expiry Date (or 2099-12-31 for Lifetime)
  expiresAtIso?: string; // Exact ISO expiration timestamp for countdown
  validityDays?: number; // Duration days (7 for trial, 365 for annual, 9999 for lifetime)
  licenseType?: 'TRIAL' | 'STANDARD_ANNUAL' | 'PRO_PERPETUAL' | 'ENTERPRISE';
  licenseMode?: 'SINGLE_USER' | 'MULTI_USER'; // Single User (1 seat) or Multi User
  maxSeats?: number;
  issuedLicenses?: IssuedLicenseRecord[];
  lastKnownTimestamp?: string; // High-water monotonic timestamp for clock-rollback detection
  clockTamperDetected?: boolean;
  vaultTampered?: boolean;
}

export type UserRole = 'ADMIN' | 'MANAGER' | 'ACCOUNTANT' | 'BILLING' | 'AUDITOR' | 'VIEWER';

export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  password?: string;
  pin: string;
  permissions?: string[];
  companyId?: string;
}

export interface GstrPortalPurchaseEntry {
  id: string;
  source: 'GSTR2A' | 'GSTR2B';
  returnPeriod: string; // MMYYYY e.g. '072026' or 'YYYY-MM'
  vendorGstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  invoiceType: 'Regular' | 'SEZ' | 'Deemed Export' | 'Credit/Debit Note';
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess?: number;
  totalTax: number;
  itcEligibility: 'ELIGIBLE' | 'INELIGIBLE' | 'BLOCK_SEC_17_5';
  gstr1FilingStatus?: string;
  gstr1FilingDate?: string;
  reverseCharge?: boolean;
}

export interface GstPortalFiledReturn {
  id: string;
  returnType: 'GSTR1' | 'GSTR3B';
  periodKey: string; // YYYY-MM e.g. '2026-07'
  periodLabel?: string;
  outwardTaxable: number;
  outwardIgst: number;
  outwardCgst: number;
  outwardSgst: number;
  itcIgst: number;
  itcCgst: number;
  itcSgst: number;
  taxPaidItc: number;
  taxPaidCash: number;
  lateFeeInterest?: number;
  filingDate?: string;
  arn?: string;
  source?: 'JSON_IMPORT' | 'EXCEL_IMPORT' | 'MANUAL' | 'BOOKS_SYNC';
}

export interface Gstr9ManualAdjustments {
  fyLabel: string;
  outwardZeroRatedTaxable?: number;
  outwardNilExemptNonGst?: number;
  itcReversedRule37?: number;
  itcReversedRule42_43?: number;
  itcBlockedSec17_5?: number;
  previousFyTaxableAdj?: number;
  previousFyTaxAdj?: number;
  previousFyItcClaimedNextFy?: number;
  previousFyItcReversedNextFy?: number;
  lateFeeInterestPaid?: number;
  auditorRemarks?: string;
}

export interface GstPortalData {
  gstr2aEntries?: GstrPortalPurchaseEntry[];
  gstr2bEntries?: GstrPortalPurchaseEntry[];
  filedReturns?: GstPortalFiledReturn[];
  gstr9Adjustments?: Record<string, Gstr9ManualAdjustments>;
  lastImportedAt?: string;
}

export interface AppData {
  company: CompanyDetails;
  accounts: Account[];
  accountGroups?: AccountGroup[];
  items: ItemMaster[];
  parties: PartyMaster[];
  invoices: SalesInvoice[];
  purchaseOrders?: PurchaseOrder[];
  purchaseInvoices?: PurchaseInvoice[];
  vouchers: Voucher[];
  debitCreditNotes?: DebitCreditNote[];
  stockAdjustments?: StockAdjustmentRecord[];
  godowns?: Godown[];
  itemBatches?: ItemBatch[];
  stockTransfers?: StockTransfer[];
  bankStatements: BankStatementLine[];
  auditLogs: AuditLog[];
  auditTrail?: AuditLog[];
  securityPin: string | null;
  pinRequired: boolean;
  budgets?: CategoryBudget[];
  license?: LicenseInfo;
  usersList?: UserProfile[];
  userProfiles?: UserProfile[];
  employees?: Employee[];
  payrolls?: PayrollRecord[];
  activeUser?: UserProfile;
  companiesList?: CompanyDetails[];
  companiesStores?: { [companyId: string]: Partial<AppData> };
  mediaAttachments?: MediaAttachment[];
  softwareVersion?: string;
  standardLedgersSeeded?: boolean;
  gstPortalData?: GstPortalData;
  syncSchemaVersion?: number;
}
