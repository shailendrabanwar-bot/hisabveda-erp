import { UserRole } from '../types';

export interface RolePermissions {
  canCreateEditTransactions: boolean; // Sales Invoices, Receipts on Invoices
  canCreateEditVouchers: boolean; // Vouchers, Purchases, Debit/Credit Notes, Chart of Accounts, Budgets
  canCreateEditMasters: boolean; // Parties & Stock Items
  canDeleteRecords: boolean; // Delete any invoice, voucher, purchase bill, party, item, or ledger
  canBulkReclassify: boolean; // Bulk reclassify counter ledgers
  canEditCompanySettings: boolean; // Edit company profile, GST config, currency
  canManageCompanies: boolean; // Create, delete, and FY-shift companies
  canManageUsersAndPin: boolean; // Manage users, roles, Master PIN, License
  canImportData: boolean; // Tally XML, External Software, CSV import/undo/remove
  canResetWorkspace: boolean; // Wipe workspace, load sample demo, JSON restore
  canReconcileBank: boolean; // Bank Reconciliation posting & matching
  canManagePayroll: boolean; // Employee & Salary payroll processing
  canViewFinancialStatements: boolean; // P&L, Balance Sheet, Trial Balance, GST, MIS
  canViewAuditLog: boolean; // Security & Audit Logs
  canExportData: boolean; // CSV/Excel/PDF/JSON exports
  canUseAdminBackup: boolean; // Security Backup center
  isReadOnly: boolean;
}

export interface RoleMeta {
  role: UserRole;
  labelEn: string;
  labelHi: string;
  badgeColor: string;
  summaryEn: string;
  summaryHi: string;
}

export const ALL_USER_ROLES: UserRole[] = [
  'ADMIN',
  'MANAGER',
  'ACCOUNTANT',
  'BILLING',
  'AUDITOR',
  'VIEWER'
];

export const ROLE_METADATA: Record<UserRole, RoleMeta> = {
  ADMIN: {
    role: 'ADMIN',
    labelEn: 'Administrator (Full Control)',
    labelHi: 'व्यवस्थापक (पूर्ण अधिकार)',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    summaryEn: 'Full access: companies, users, Master PIN, imports, deletions & settings.',
    summaryHi: 'सभी अधिकार: कंपनी, उपयोगकर्ता, मास्टर पिन, इम्पोर्ट, डिलीट एवं सेटिंग्स।'
  },
  MANAGER: {
    role: 'MANAGER',
    labelEn: 'Operations Manager',
    labelHi: 'मैनेजर (प्रबंधन व संचालन)',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    summaryEn: 'Billing, accounting, deletes, payroll, imports & company profile; cannot reset workspace or manage Admin PIN.',
    summaryHi: 'बिलिंग, खाते, डिलीट, पेरोल व इम्पोर्ट; वर्कस्पेस रीसेट व मास्टर पिन बदलाव निषिद्ध।'
  },
  ACCOUNTANT: {
    role: 'ACCOUNTANT',
    labelEn: 'Senior Accountant',
    labelHi: 'सीनियर अकाउंटेंट',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    summaryEn: 'Vouchers, purchases, GST, BRS, ledgers, ERP XML import & record edits/deletes; no user/PIN/company delete access.',
    summaryHi: 'वाउचर, खरीद, जीएसटी, बैंक मिलान, लेजर व XML इम्पोर्ट; यूज़र, पिन व कंपनी डिलीट वर्जित।'
  },
  BILLING: {
    role: 'BILLING',
    labelEn: 'Billing Operator (No Delete)',
    labelHi: 'बिलिंग ऑपरेटर (बिना डिलीट अधिकार)',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    summaryEn: 'Can create/edit Sales Invoices, receipts, Parties & Items. Strictly CANNOT delete records, edit ledgers, or access settings/imports.',
    summaryHi: 'केवल सेल इनवॉइस, रसीद, पार्टी व स्टॉक बना सकते हैं — कोई भी डेटा डिलीट या सेटिंग्स/लेजर बदलना सख्त वर्जित।'
  },
  AUDITOR: {
    role: 'AUDITOR',
    labelEn: 'Tax Auditor (Read-Only)',
    labelHi: 'टैक्स ऑडिटर (केवल देखने हेतु)',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    summaryEn: 'Read-only access to all books, GST, financial statements & audit trails with print/export. Zero write or delete access.',
    summaryHi: 'सभी खाते, GST, रिपोर्ट्स व ऑडिट लॉग केवल देख/प्रिंट कर सकते हैं। कोई बदलाव या डिलीट अनुमत नहीं।'
  },
  VIEWER: {
    role: 'VIEWER',
    labelEn: 'Restricted Viewer (Read-Only)',
    labelHi: 'व्यूअर (सीमित पठन अधिकार)',
    badgeColor: 'bg-slate-600/30 text-slate-300 border-slate-500/40',
    summaryEn: 'Basic read-only view of dashboard, invoices, parties, stock and statements. Cannot export, edit, delete, or view audit settings.',
    summaryHi: 'डैशबोर्ड, बिल, पार्टी व रिपोर्ट केवल देखने की अनुमति। एक्सपोर्ट, संपादन या डिलीट पूर्णतः बंद।'
  }
};

export function normalizeUserRole(role?: string | null): UserRole {
  const upper = (role || '').toUpperCase();
  if (
    upper === 'ADMIN' ||
    upper === 'MANAGER' ||
    upper === 'ACCOUNTANT' ||
    upper === 'BILLING' ||
    upper === 'AUDITOR' ||
    upper === 'VIEWER'
  ) {
    return upper;
  }
  return 'VIEWER';
}

export function getRolePermissions(role?: UserRole | string | null): RolePermissions {
  const r = normalizeUserRole(role);

  switch (r) {
    case 'ADMIN':
      return {
        canCreateEditTransactions: true,
        canCreateEditVouchers: true,
        canCreateEditMasters: true,
        canDeleteRecords: true,
        canBulkReclassify: true,
        canEditCompanySettings: true,
        canManageCompanies: true,
        canManageUsersAndPin: true,
        canImportData: true,
        canResetWorkspace: true,
        canReconcileBank: true,
        canManagePayroll: true,
        canViewFinancialStatements: true,
        canViewAuditLog: true,
        canExportData: true,
        canUseAdminBackup: true,
        isReadOnly: false
      };

    case 'MANAGER':
      return {
        canCreateEditTransactions: true,
        canCreateEditVouchers: true,
        canCreateEditMasters: true,
        canDeleteRecords: true,
        canBulkReclassify: true,
        canEditCompanySettings: true,
        canManageCompanies: false,
        canManageUsersAndPin: false,
        canImportData: true,
        canResetWorkspace: false,
        canReconcileBank: true,
        canManagePayroll: true,
        canViewFinancialStatements: true,
        canViewAuditLog: true,
        canExportData: true,
        canUseAdminBackup: true,
        isReadOnly: false
      };

    case 'ACCOUNTANT':
      return {
        canCreateEditTransactions: true,
        canCreateEditVouchers: true,
        canCreateEditMasters: true,
        canDeleteRecords: true,
        canBulkReclassify: true,
        canEditCompanySettings: false,
        canManageCompanies: false,
        canManageUsersAndPin: false,
        canImportData: true,
        canResetWorkspace: false,
        canReconcileBank: true,
        canManagePayroll: true,
        canViewFinancialStatements: true,
        canViewAuditLog: true,
        canExportData: true,
        canUseAdminBackup: false,
        isReadOnly: false
      };

    case 'BILLING':
      return {
        canCreateEditTransactions: true,
        canCreateEditVouchers: false,
        canCreateEditMasters: true,
        canDeleteRecords: false,
        canBulkReclassify: false,
        canEditCompanySettings: false,
        canManageCompanies: false,
        canManageUsersAndPin: false,
        canImportData: false,
        canResetWorkspace: false,
        canReconcileBank: false,
        canManagePayroll: false,
        canViewFinancialStatements: false,
        canViewAuditLog: false,
        canExportData: true,
        canUseAdminBackup: false,
        isReadOnly: false
      };

    case 'AUDITOR':
      return {
        canCreateEditTransactions: false,
        canCreateEditVouchers: false,
        canCreateEditMasters: false,
        canDeleteRecords: false,
        canBulkReclassify: false,
        canEditCompanySettings: false,
        canManageCompanies: false,
        canManageUsersAndPin: false,
        canImportData: false,
        canResetWorkspace: false,
        canReconcileBank: false,
        canManagePayroll: false,
        canViewFinancialStatements: true,
        canViewAuditLog: true,
        canExportData: true,
        canUseAdminBackup: false,
        isReadOnly: true
      };

    case 'VIEWER':
    default:
      return {
        canCreateEditTransactions: false,
        canCreateEditVouchers: false,
        canCreateEditMasters: false,
        canDeleteRecords: false,
        canBulkReclassify: false,
        canEditCompanySettings: false,
        canManageCompanies: false,
        canManageUsersAndPin: false,
        canImportData: false,
        canResetWorkspace: false,
        canReconcileBank: false,
        canManagePayroll: false,
        canViewFinancialStatements: true,
        canViewAuditLog: false,
        canExportData: false,
        canUseAdminBackup: false,
        isReadOnly: true
      };
  }
}

const ROLE_ALLOWED_TABS: Record<UserRole, Set<string>> = {
  ADMIN: new Set([
    'dashboard',
    'pos',
    'invoices',
    'purchases',
    'vouchers',
    'items',
    'parties',
    'ledger',
    'reconciliation',
    'tax',
    'statements',
    'mis-reports',
    'payroll',
    'budgeting',
    'audit',
    'utilities',
    'settings'
  ]),
  MANAGER: new Set([
    'dashboard',
    'pos',
    'invoices',
    'purchases',
    'vouchers',
    'items',
    'parties',
    'ledger',
    'reconciliation',
    'tax',
    'statements',
    'mis-reports',
    'payroll',
    'budgeting',
    'audit',
    'utilities',
    'settings'
  ]),
  ACCOUNTANT: new Set([
    'dashboard',
    'pos',
    'invoices',
    'purchases',
    'vouchers',
    'items',
    'parties',
    'ledger',
    'reconciliation',
    'tax',
    'statements',
    'mis-reports',
    'payroll',
    'budgeting',
    'audit',
    'utilities',
    'settings'
  ]),
  BILLING: new Set(['dashboard', 'pos', 'invoices', 'parties', 'items']),
  AUDITOR: new Set([
    'dashboard',
    'invoices',
    'purchases',
    'vouchers',
    'items',
    'parties',
    'ledger',
    'reconciliation',
    'tax',
    'statements',
    'mis-reports',
    'payroll',
    'budgeting',
    'audit'
  ]),
  VIEWER: new Set(['dashboard', 'invoices', 'parties', 'items', 'statements', 'mis-reports'])
};

export function canAccessTab(
  role: UserRole | string | undefined,
  tab: string,
  _isCustomerView = false
): boolean {
  const r = normalizeUserRole(role);
  return ROLE_ALLOWED_TABS[r].has(tab);
}

export function canManageTargetRole(actorRole: UserRole | string | undefined, targetRole: UserRole): boolean {
  const actor = normalizeUserRole(actorRole);
  if (actor === 'ADMIN') return true;
  if (actor === 'MANAGER') return targetRole !== 'ADMIN' && targetRole !== 'MANAGER';
  return false;
}

export function getRbacDenialMessage(
  actionHi: string,
  actionEn: string,
  role: UserRole | string | undefined,
  isHindi: boolean
): string {
  const r = normalizeUserRole(role);
  return isHindi
    ? `🔒 अनुमति अस्वीकृत (${r}): आपकी वर्तमान भूमिका "${r}" को "${actionHi}" करने का अधिकार नहीं है।`
    : `🔒 Access Denied (${r}): Your current role "${r}" is not permitted to ${actionEn}.`;
}
