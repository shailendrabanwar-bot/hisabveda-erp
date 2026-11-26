import React, { useState, useMemo, useEffect } from 'react';
import { 
  BookOpen, 
  Plus, 
  Search, 
  ArrowRight, 
  FolderTree, 
  Layers, 
  ListTree,
  ChevronRight, 
  ChevronDown,
  CheckCircle2,
  FolderPlus,
  CornerDownRight,
  Info,
  Printer,
  Edit3,
  Trash2,
  Eye,
  AlertCircle,
  GitMerge,
  Sparkles,
  X
} from 'lucide-react';
import { AppData, Account, AccountCategory, AccountGroup, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { calculateAccountBalances, calculatePartyOutstanding } from '../../utils/accounting';
import { findDuplicateLedgersAndParties } from '../../utils/ledgerDeduplicator';
import { printHtmlDocument } from '../../utils/printReport';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';

interface ChartOfAccountsProps {
  data: AppData;
  isHindi: boolean;
  onSelectAccountLedger: (accId: string) => void;
  onAddAccount: (acc: Account) => void;
  onUpdateAccount?: (acc: Account) => void;
  onDeleteAccount?: (accId: string) => void;
  onAddGroup?: (group: AccountGroup) => void;
  onDeleteGroup?: (groupId: string) => void;
  onMergeDuplicateLedgers?: (
    selectedClusterIds?: string[],
    balanceStrategy?: 'KEEP_PRIMARY_OR_NONZERO' | 'SUM'
  ) => { mergedAccountsCount: number; mergedPartiesCount: number; relinkedEntriesCount: number } | void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const DEFAULT_GROUPS: AccountGroup[] = [
  { id: 'grp_cash_bank', code: 'GRP-101', name: 'Cash & Bank Accounts', category: 'ASSET', parentGroupName: 'Current Assets' },
  { id: 'grp_sundry_debtors', code: 'GRP-102', name: 'Sundry Debtors', category: 'ASSET', parentGroupName: 'Current Assets' },
  { id: 'grp_current_assets', code: 'GRP-103', name: 'Current Assets', category: 'ASSET' },
  { id: 'grp_fixed_assets', code: 'GRP-104', name: 'Fixed Assets', category: 'ASSET' },
  { id: 'grp_sundry_creditors', code: 'GRP-201', name: 'Sundry Creditors', category: 'LIABILITY', parentGroupName: 'Current Liabilities' },
  { id: 'grp_duties_taxes', code: 'GRP-202', name: 'Duties & Taxes', category: 'LIABILITY', parentGroupName: 'Current Liabilities' },
  { id: 'grp_statutory_payables', code: 'GRP-203', name: 'Statutory & Payroll Liabilities', category: 'LIABILITY', parentGroupName: 'Current Liabilities' },
  { id: 'grp_current_liabilities', code: 'GRP-204', name: 'Current Liabilities', category: 'LIABILITY' },
  { id: 'grp_loans_liabilities', code: 'GRP-205', name: 'Loans & Liabilities', category: 'LIABILITY' },
  { id: 'grp_direct_expenses', code: 'GRP-501', name: 'Direct Expenses', category: 'EXPENSE' },
  { id: 'grp_indirect_expenses', code: 'GRP-502', name: 'Indirect Expenses', category: 'EXPENSE' },
  { id: 'grp_employee_benefits', code: 'GRP-503', name: 'Employee Benefits & Salary Expense', category: 'EXPENSE', parentGroupName: 'Indirect Expenses' },
  { id: 'grp_direct_income', code: 'GRP-401', name: 'Direct Incomes', category: 'REVENUE' },
  { id: 'grp_indirect_income', code: 'GRP-402', name: 'Indirect Incomes', category: 'REVENUE' },
  { id: 'grp_capital', code: 'GRP-301', name: 'Capital Account', category: 'EQUITY' },
  { id: 'grp_reserves', code: 'GRP-302', name: 'Reserves & Surplus', category: 'EQUITY' }
];

export const ChartOfAccounts: React.FC<ChartOfAccountsProps> = ({
  data,
  isHindi,
  onSelectAccountLedger,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onAddGroup,
  onDeleteGroup,
  onMergeDuplicateLedgers,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const balancesMap = calculateAccountBalances(data);

  const dupAudit = useMemo(() => findDuplicateLedgersAndParties(data), [data]);

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [coaViewMode, setCoaViewMode] = useState<'detailed' | 'condensed'>('detailed');

  // Alt+F1 Keyboard Shortcut for Condensed / Detailed Chart of Accounts View
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'F1' || e.code === 'F1')) {
        e.preventDefault();
        setCoaViewMode(prev => (prev === 'condensed' ? 'detailed' : 'condensed'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Modal States
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showDupAuditModal, setShowDupAuditModal] = useState(false);
  const [selectedDupClusterIds, setSelectedDupClusterIds] = useState<string[]>([]);
  const [dupMergeStrategy, setDupMergeStrategy] = useState<'KEEP_PRIMARY_OR_NONZERO' | 'SUM'>('KEEP_PRIMARY_OR_NONZERO');
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [summaryGroup, setSummaryGroup] = useState<{ name: string; accounts: Account[] } | null>(null);
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<{ kind: 'GROUP' | 'ACCOUNT'; id: string; name: string } | null>(null);

  const openDupAuditModal = () => {
    const allIds = [
      ...dupAudit.accountClusters.map(c => c.clusterId),
      ...dupAudit.partyClusters.map(c => c.clusterId)
    ];
    setSelectedDupClusterIds(allIds);
    setShowDupAuditModal(true);
  };

  // New Group Form State
  const [grpCode, setGrpCode] = useState('');
  const [grpName, setGrpName] = useState('');
  const [grpCategory, setGrpCategory] = useState<AccountCategory | ''>('');
  const [grpParentId, setGrpParentId] = useState<string>(''); // empty string means Primary Group
  const [grpDescription, setGrpDescription] = useState('');

  // New Account / Sub-Ledger Form State
  const [accCode, setAccCode] = useState('');
  const [accName, setAccName] = useState('');
  const [accCategory, setAccCategory] = useState<AccountCategory | ''>('');
  const [accSelectedGroup, setAccSelectedGroup] = useState<string>('');
  const [accIsSubLedger, setAccIsSubLedger] = useState<boolean>(true);
  const [accAccountNumber, setAccAccountNumber] = useState<string>('');
  const [accOpeningBalance, setAccOpeningBalance] = useState<number>(0);
  const [accBalanceType, setAccBalanceType] = useState<'DR' | 'CR'>('DR');

  const openCreateGroupModal = () => {
    setGrpCode('');
    setGrpName('');
    setGrpCategory('');
    setGrpParentId('');
    setGrpDescription('');
    setShowAddGroupModal(true);
  };

  const openCreateAccountModal = () => {
    setAccCode('');
    setAccName('');
    setAccCategory('');
    setAccSelectedGroup('');
    setAccIsSubLedger(true);
    setAccAccountNumber('');
    setAccOpeningBalance(0);
    setAccBalanceType('DR');
    setShowAddAccountModal(true);
  };

  // Combined Account Groups
  const allGroups = useMemo(() => {
    const combined = [...DEFAULT_GROUPS];
    (data.accountGroups || []).forEach(g => {
      if (!combined.some(c => c.id === g.id || c.name.toLowerCase() === g.name.toLowerCase())) {
        combined.push(g);
      }
    });
    return combined;
  }, [data.accountGroups]);

  // Filtered Groups based on category
  const activeCategoryGroups = useMemo(() => {
    return allGroups.filter(g => grpCategory === g.category);
  }, [allGroups, grpCategory]);

  const filteredAccounts = data.accounts.filter(a => {
    const matchesCat = selectedCategory === 'ALL' || a.category === selectedCategory;
    const matchesSearch = a.name.toLowerCase().includes(search.toLowerCase()) || 
                          a.code.includes(search) ||
                          (a.mainGroup || '').toLowerCase().includes(search.toLowerCase()) ||
                          a.subCategory.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Group accounts by Main Group
  const groupedMap = useMemo(() => {
    const map = new Map<string, Account[]>();
    filteredAccounts.forEach(acc => {
      const groupKey = acc.mainGroup || acc.subCategory || 'General Accounts';
      if (!map.has(groupKey)) {
        map.set(groupKey, []);
      }
      map.get(groupKey)!.push(acc);
    });
    return map;
  }, [filteredAccounts]);

  // Print Chart of Accounts Statement (Condensed Group Summary or Detailed Sub-Ledgers)
  const handlePrintChartOfAccounts = () => {
    const isCondensedPrint = coaViewMode === 'condensed';
    const tableHeaderHtml = isCondensedPrint
      ? `
        <tr>
          <th style="width: 45px;">#</th>
          <th>Primary / Account Group Head</th>
          <th>Category</th>
          <th class="text-right">Ledgers</th>
          <th class="text-right">Opening Balance</th>
          <th class="text-right">Net Current Balance</th>
        </tr>
      `
      : `
        <tr>
          <th style="width: 80px;">Code</th>
          <th>Sub-Ledger Account Name</th>
          <th>Category</th>
          <th>Group / Sub-Group</th>
          <th class="text-right">Opening Balance</th>
          <th class="text-right">Net Current Balance</th>
        </tr>
      `;

    const tableBodyHtml = isCondensedPrint
      ? Array.from(groupedMap.entries()).map(([groupName, accs], idx) => {
          const matchedGroupObj = allGroups.find(g => g.name === groupName || g.id === groupName);
          const grpCat = accs[0]?.category || matchedGroupObj?.category || 'EXPENSE';
          let openSigned = 0;
          let netSigned = 0;
          accs.forEach(acc => {
            openSigned += acc.balanceType === 'CR' ? -(acc.openingBalance || 0) : (acc.openingBalance || 0);
            const b = balancesMap.get(acc.id);
            if (b) {
              netSigned += b.balanceType === 'CR' ? -b.netBalance : b.netBalance;
            }
          });
          return `
            <tr>
              <td class="font-mono">${idx + 1}</td>
              <td><b>${groupName}</b>${matchedGroupObj?.parentGroupName ? ` <span style="color:#64748b;font-size:10px;">(Under: ${matchedGroupObj.parentGroupName})</span>` : ''}</td>
              <td>${grpCat}</td>
              <td class="text-right font-mono">${accs.length}</td>
              <td class="text-right font-mono">${formatCurrency(Math.abs(openSigned), currency)} (${openSigned >= 0 ? 'DR' : 'CR'})</td>
              <td class="text-right font-mono" style="font-weight: bold;">${formatCurrency(Math.abs(netSigned), currency)} (${netSigned >= 0 ? 'DR' : 'CR'})</td>
            </tr>
          `;
        }).join('')
      : Array.from(groupedMap.entries()).map(([groupName, accs]) => `
          <tr class="group-row">
            <td colspan="6">Group: ${groupName} (${accs.length} Ledgers)</td>
          </tr>
          ${accs.map(acc => {
            const balInfo = balancesMap.get(acc.id);
            return `
              <tr>
                <td class="font-mono" style="font-weight: bold;">${acc.code}</td>
                <td>${acc.name} ${acc.accountNumber ? `(A/c No: ${acc.accountNumber})` : ''}</td>
                <td>${acc.category}</td>
                <td>${acc.subCategory}</td>
                <td class="text-right font-mono">${formatCurrency(acc.openingBalance, currency)} (${acc.balanceType})</td>
                <td class="text-right font-mono" style="font-weight: bold;">${formatCurrency(balInfo?.netBalance || 0, currency)} (${balInfo?.balanceType || 'DR'})</td>
              </tr>
            `;
          }).join('')}
        `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Chart of Accounts (${isCondensedPrint ? 'Condensed' : 'Detailed'}) - ${data.company.name}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #0f172a; font-size: 11px; }
            .header { border-bottom: 2px solid #334155; padding-bottom: 10px; margin-bottom: 15px; }
            h1 { font-size: 18px; margin: 0; text-transform: uppercase; color: #1e293b; }
            .sub { font-size: 11px; color: #64748b; margin-top: 3px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 11px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px 10px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; }
            .group-row { background-color: #e2e8f0; font-weight: bold; color: #1e293b; }
            .text-right { text-align: right; }
            .font-mono { font-family: monospace; }
            @media print {
              body { padding: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${data.company.name}</h1>
            <div class="sub">Chart of Accounts (${isCondensedPrint ? 'Condensed Group-Wise Summary' : 'Detailed Sub-Ledger Directory'}) | Date: ${new Date().toLocaleDateString()}</div>
          </div>
          <table>
            <thead>
              ${tableHeaderHtml}
            </thead>
            <tbody>
              ${tableBodyHtml}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;
    printHtmlDocument(html);
  };

  // Handle Save New Group or Sub-Group
  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!grpName.trim() || !grpCategory) return;

    const parentGroupObj = allGroups.find(g => g.id === grpParentId);
    const autoGrpCode = grpCode.trim() || ('GRP-' + Math.floor(100 + Math.random() * 900));

    const newGroup: AccountGroup = {
      id: 'grp_' + Date.now(),
      code: autoGrpCode.toUpperCase(),
      name: grpName.trim(),
      category: grpCategory as AccountCategory,
      parentGroupId: grpParentId || undefined,
      parentGroupName: parentGroupObj ? parentGroupObj.name : undefined,
      description: grpDescription.trim() || undefined
    };

    if (onAddGroup) {
      onAddGroup(newGroup);
    }
    
    setShowAddGroupModal(false);
    setGrpCode('');
    setGrpName('');
    setGrpCategory('');
    setGrpParentId('');
    setGrpDescription('');
  };

  // Handle Save New Sub-Ledger Account
  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim() || !accCategory || !accSelectedGroup) return;

    const targetGrpObj = allGroups.find(g => g.name === accSelectedGroup || g.id === accSelectedGroup);
    const grpNameStr = targetGrpObj ? targetGrpObj.name : accSelectedGroup;

    // Automatically generate clean ledger code based on category (No user input required)
    const categoryPrefix = accCategory === 'ASSET' ? '1' 
      : accCategory === 'LIABILITY' ? '2' 
      : accCategory === 'EQUITY' ? '3' 
      : accCategory === 'REVENUE' ? '4' 
      : '5';
    const autoAccCode = accCode.trim() || `${categoryPrefix}${Math.floor(1000 + Math.random() * 9000)}`;

    const newAcc: Account = {
      id: 'acc_' + Date.now(),
      code: autoAccCode,
      name: accName.trim(),
      category: accCategory as AccountCategory,
      subCategory: targetGrpObj?.parentGroupName || targetGrpObj?.name || 'General Accounts',
      mainGroup: grpNameStr,
      accountNumber: accAccountNumber.trim() || undefined,
      isSubLedger: accIsSubLedger,
      openingBalance: accOpeningBalance,
      balanceType: accBalanceType
    };

    onAddAccount(newAcc);
    setShowAddAccountModal(false);
    setAccCode('');
    setAccName('');
    setAccCategory('');
    setAccSelectedGroup('');
    setAccAccountNumber('');
    setAccOpeningBalance(0);
  };

  // Open Edit Ledger Modal
  const handleOpenEditAccount = (acc: Account) => {
    setEditingAccount(acc);
    setAccCode(acc.code);
    setAccName(acc.name);
    setAccCategory(acc.category);
    setAccSelectedGroup(acc.mainGroup || acc.subCategory || 'Cash & Bank Accounts');
    setAccAccountNumber(acc.accountNumber || '');
    setAccOpeningBalance(acc.openingBalance);
    setAccBalanceType(acc.balanceType);
  };

  // Handle Update Existing Ledger Account
  const handleUpdateExistingAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !accName.trim() || !onUpdateAccount) return;

    const targetGrpObj = allGroups.find(g => g.name === accSelectedGroup || g.id === accSelectedGroup);
    const grpNameStr = targetGrpObj ? targetGrpObj.name : accSelectedGroup;

    const updated: Account = {
      ...editingAccount,
      code: editingAccount.code || accCode.trim() || `ACC-${Date.now().toString().slice(-4)}`,
      name: accName.trim(),
      category: (accCategory || editingAccount.category) as AccountCategory,
      subCategory: targetGrpObj?.parentGroupName || targetGrpObj?.name || editingAccount.subCategory,
      mainGroup: grpNameStr,
      accountNumber: accAccountNumber.trim() || undefined,
      openingBalance: accOpeningBalance,
      balanceType: accBalanceType
    };

    onUpdateAccount(updated);
    setEditingAccount(null);
  };

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-3.5 w-full md:overflow-hidden animate-fadeIn">
      {/* Top Header Banner */}
      <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 p-4 md:p-5 rounded-2xl border border-slate-800 shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FolderTree className="w-5 h-5 text-indigo-400" />
            <span>{isHindi ? 'लेजर ग्रुप एवं खाता बही मास्टर (Chart of Accounts & Ledger Master)' : 'Chart of Accounts & Master Ledger Directory'}</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {isHindi 
              ? 'मुख्य समूहों (Primary Groups), सब-ग्रुप्स (Sub-Groups) एवं लेजर खातों को देखें, जोड़ें, सम्पादित (Edit) या डिलीट (Delete) करें'
              : 'Multi-level account groups hierarchy, edit/delete ledgers, statutory payables, salary components, and print master statement'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {onMergeDuplicateLedgers && (
            <button
              type="button"
              onClick={openDupAuditModal}
              className={`flex items-center gap-1.5 font-bold text-xs px-3.5 py-2.5 rounded-xl border transition cursor-pointer ${
                dupAudit.totalDuplicateRecords > 0
                  ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border-amber-400/50 shadow-lg shadow-amber-500/10'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-emerald-500/30'
              }`}
              title={isHindi ? 'एक नाम के डुप्लीकेट लेजर व पार्टी जाँचें और मर्ज करें' : 'Inspect & auto-merge duplicate ledgers and parties'}
            >
              <GitMerge className="w-4 h-4 shrink-0" />
              <span>{isHindi ? 'डुप्लीकेट लेज़र जाँच' : 'Duplicate Audit'}</span>
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${
                dupAudit.totalDuplicateRecords > 0
                  ? 'bg-amber-400 text-slate-950'
                  : 'bg-emerald-500/20 text-emerald-300'
              }`}>
                {dupAudit.totalDuplicateRecords > 0 ? dupAudit.totalDuplicateRecords : '0 ✓'}
              </span>
            </button>
          )}

          {perms.canExportData && (
            <button
              onClick={handlePrintChartOfAccounts}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 font-bold text-xs px-3.5 py-2.5 rounded-xl transition"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'प्रिंट खाता सूची' : 'Print Master Chart'}</span>
            </button>
          )}

          {perms.canCreateEditVouchers && (
            <>
              <button
                onClick={openCreateGroupModal}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 font-bold text-xs px-3.5 py-2.5 rounded-xl transition"
              >
                <FolderPlus className="w-4 h-4 text-indigo-400" />
                <span>{isHindi ? '+ नया ग्रुप / सब-ग्रुप' : '+ Create Group'}</span>
              </button>

              <button
                onClick={openCreateAccountModal}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition"
              >
                <Plus className="w-4 h-4" />
                <span>{isHindi ? '+ नया लेजर खाता' : '+ Create Sub-Ledger Account'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Group Hierarchy Bar */}
      <div className="shrink-0 bg-slate-900/70 p-3 rounded-xl border border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-slate-200">
            {isHindi ? 'कुल खाता समूह एवं लेजर दर्ज हैं:' : 'Active Account Groups & Registered Ledgers:'}
          </span>
          <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/30 font-bold font-mono px-2 py-0.5 rounded text-xs">
            {allGroups.length} {isHindi ? 'ग्रुप्स' : 'Groups'} / {data.accounts.length} {isHindi ? 'लेजर्स' : 'Ledgers'}
          </span>
        </div>

        <div className="text-xs text-slate-400 flex items-center gap-1">
          <Info className="w-3.5 h-3.5 text-amber-400" />
          <span>{isHindi ? 'बैंक रिकॉन्सिलिएशन या वाउचर में नया बैंक लेजर जोड़ने पर वह स्वतः यहाँ दिखेगा।' : 'Bank ledgers added in Reconciliation or Vouchers sync instantly to Chart of Accounts.'}</span>
        </div>
      </div>

      {/* Filter Bar + Condensed / Detailed View Switcher */}
      <div className="shrink-0 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full lg:w-72 shrink-0">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isHindi ? 'ग्रुप, खाता नाम या कोड खोजें...' : 'Search Group, Sub-Group, Account Name or Code...'}
            className="w-full bg-slate-800 text-slate-100 placeholder-slate-400 text-sm rounded-xl pl-9 pr-3 py-2 border border-slate-700 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 flex-1">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {['ALL', 'ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition shrink-0 cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-indigo-600 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Condensed vs Detailed View Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs shadow-inner shrink-0">
            <button
              type="button"
              onClick={() => setCoaViewMode('condensed')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                coaViewMode === 'condensed'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={isHindi ? 'संक्षिप्त समूह सारांश (केवल मुख्य ग्रुप्स व कुल शेष)' : 'Condensed View (Group-Wise Summary Totals)'}
            >
              <Layers className="w-3.5 h-3.5 text-amber-300" />
              <span>{isHindi ? 'संक्षिप्त (Condensed)' : 'Condensed'}</span>
            </button>
            <button
              type="button"
              onClick={() => setCoaViewMode('detailed')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer ${
                coaViewMode === 'detailed'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={isHindi ? 'विस्तृत दृश्य (सभी सब-लेजर व पार्टी खातों के साथ)' : 'Detailed View (Expanded All Sub-Ledgers & Parties)'}
            >
              <ListTree className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isHindi ? 'विस्तृत (Detailed)' : 'Detailed'}</span>
            </button>
            <span className="hidden xl:inline text-[10px] text-slate-500 font-mono px-2">
              Alt+F1
            </span>
          </div>
        </div>
      </div>

      {/* Accounts View: Condensed Group Summary Table vs Detailed Expanded Cards */}
      {coaViewMode === 'condensed' ? (
        <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="shrink-0 p-3.5 px-4 bg-slate-950/90 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'संक्षिप्त चार्ट ऑफ़ अकाउंट्स (Group-Wise Condensed Summary)' : 'Condensed Chart of Accounts — Group-Wise Summary'}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isHindi
                  ? 'प्रत्येक खाता समूह का प्रारंभिक व वर्तमान शुद्ध शेष देखें — विस्तृत देखने हेतु किसी ग्रुप पर क्लिक करें'
                  : 'Group-level Opening & Net Current Balances — click Group Summary or switch to Detailed (Alt+F1) to inspect sub-ledgers'}
              </p>
            </div>
            <span className="text-xs font-mono bg-slate-800 text-indigo-300 px-2.5 py-1 rounded-lg border border-slate-700 self-start sm:self-auto">
              {groupedMap.size} {isHindi ? 'ग्रुप्स' : 'Groups'} • {filteredAccounts.length} {isHindi ? 'लेजर्स' : 'Ledgers'}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-left text-sm text-slate-200 min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300 font-bold text-xs uppercase border-b border-slate-700">
                <tr>
                  <th className="p-3 w-12">#</th>
                  <th className="p-3">{isHindi ? 'खाता समूह (Account Group)' : 'Account Group / Parent'}</th>
                  <th className="p-3">{isHindi ? 'श्रेणी' : 'Category'}</th>
                  <th className="p-3 text-center">{isHindi ? 'खाते / पार्टी' : 'Ledgers'}</th>
                  <th className="p-3 text-right">{isHindi ? 'प्रारंभिक शेष (Opening)' : 'Opening Balance'}</th>
                  <th className="p-3 text-right">{isHindi ? 'शुद्ध वर्तमान शेष (Closing)' : 'Net Current Balance'}</th>
                  <th className="p-3 text-right">{isHindi ? 'कार्रवाई' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {Array.from(groupedMap.entries()).map(([groupName, accounts], idx) => {
                  const matchedGroupObj = allGroups.find(g => g.name === groupName || g.id === groupName);
                  const groupCategory = accounts[0]?.category || matchedGroupObj?.category || 'EXPENSE';

                  let openSigned = 0;
                  let netSigned = 0;
                  accounts.forEach(acc => {
                    openSigned += acc.balanceType === 'CR' ? -(acc.openingBalance || 0) : (acc.openingBalance || 0);
                    const b = balancesMap.get(acc.id);
                    if (b) {
                      netSigned += b.balanceType === 'CR' ? -b.netBalance : b.netBalance;
                    }
                  });

                  const grpLower = groupName.toLowerCase();
                  const isDebtorsGroup = grpLower.includes('debtor') || grpLower.includes('receivable');
                  const isCreditorsGroup = grpLower.includes('creditor') || grpLower.includes('payable');
                  const matchingPartiesCount = isDebtorsGroup
                    ? data.parties.filter(p => p.type === 'CUSTOMER' || p.type === 'BOTH').length
                    : isCreditorsGroup
                      ? data.parties.filter(p => p.type === 'VENDOR' || p.type === 'BOTH').length
                      : 0;

                  return (
                    <tr key={groupName} className="hover:bg-slate-800/40 transition">
                      <td className="p-3 font-mono font-bold text-slate-500">{idx + 1}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-100 flex items-center gap-2 flex-wrap">
                          <span>{groupName}</span>
                          {matchedGroupObj?.parentGroupName && (
                            <span className="text-[10px] text-indigo-300 bg-indigo-950/70 px-1.5 py-0.5 rounded border border-indigo-500/30 font-mono">
                              ↳ {matchedGroupObj.parentGroupName}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                          groupCategory === 'ASSET' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                          groupCategory === 'LIABILITY' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                          groupCategory === 'REVENUE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                          'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {groupCategory}
                        </span>
                      </td>
                      <td className="p-3 text-center font-mono">
                        <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700 font-bold">
                          {accounts.length}
                        </span>
                        {matchingPartiesCount > 0 && (
                          <span className="ml-1 text-[10px] text-emerald-400 font-semibold">
                            +{matchingPartiesCount} {isHindi ? 'पार्टियां' : 'Parties'}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-right font-mono tabular-nums text-slate-300">
                        {formatCurrency(Math.abs(openSigned), currency)}{' '}
                        <span className="text-xs font-bold">({openSigned >= 0 ? 'DR' : 'CR'})</span>
                      </td>
                      <td className={`p-3 text-right font-mono tabular-nums font-bold ${netSigned >= 0 ? 'text-emerald-400' : 'text-indigo-300'}`}>
                        {formatCurrency(Math.abs(netSigned), currency)}{' '}
                        <span className="text-xs">({netSigned >= 0 ? 'DR' : 'CR'})</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSummaryGroup({ name: groupName, accounts })}
                            className="px-2.5 py-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                          >
                            <FolderTree className="w-3 h-3" />
                            <span>{isHindi ? 'समरी देखें' : 'Inspect'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSearch(groupName);
                              setCoaViewMode('detailed');
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-[11px] font-semibold transition flex items-center gap-1 cursor-pointer"
                            title={isHindi ? 'इस ग्रुप के सभी सब-लेजर खोलें' : 'Expand detailed ledgers for this group'}
                          >
                            <Eye className="w-3 h-3" />
                            <span>{isHindi ? 'खोलें' : 'Expand'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
        {Array.from(groupedMap.entries()).map(([groupName, accounts]) => {
          const matchedGroupObj = allGroups.find(g => g.name === groupName || g.id === groupName);
          const groupCategory = accounts[0]?.category || matchedGroupObj?.category || 'EXPENSE';
          const isCustomGroup = data.accountGroups?.some(g => g.id === matchedGroupObj?.id);
          
          const groupTotalBalance = accounts.reduce((sum, acc) => {
            const b = balancesMap.get(acc.id);
            return sum + (b?.netBalance || 0);
          }, 0);

          return (
            <div key={groupName} className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              {/* Group Header */}
              <div className="p-4 bg-slate-950/90 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-xs tracking-wide flex items-center gap-2 flex-wrap">
                      <span>{groupName}</span>
                      
                      {matchedGroupObj?.parentGroupName && (
                        <span className="text-[10px] text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-500/30 font-mono flex items-center gap-1">
                          <CornerDownRight className="w-3 h-3" />
                          <span>Sub-Group of {matchedGroupObj.parentGroupName}</span>
                        </span>
                      )}

                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${
                        groupCategory === 'ASSET' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' :
                        groupCategory === 'LIABILITY' ? 'bg-rose-500/10 text-rose-400 border-rose-500/30' :
                        groupCategory === 'REVENUE' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      }`}>
                        {groupCategory}
                      </span>

                      {isCustomGroup && onDeleteGroup && matchedGroupObj && perms.canDeleteRecords && (
                        <button
                          onClick={() =>
                            setConfirmDeleteTarget({
                              kind: 'GROUP',
                              id: matchedGroupObj.id,
                              name: matchedGroupObj.name
                            })
                          }
                          className="text-[10px] text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete Group</span>
                        </button>
                      )}
                    </h3>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {accounts.length} {isHindi ? 'उप-लेजर खाते इस ग्रुप में पंजीकृत हैं' : 'Sub-Ledger Accounts registered under this group'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setSummaryGroup({ name: groupName, accounts })}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <FolderTree className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{isHindi ? 'ग्रुप समरी (Group Summary)' : 'Group Summary'}</span>
                  </button>

                  <div className="text-right font-mono">
                    <div className="text-[10px] text-slate-400">Group Total Balance:</div>
                    <div className="text-xs font-bold text-indigo-300">{formatCurrency(groupTotalBalance, currency)}</div>
                  </div>
                </div>
              </div>

              {/* Sub-Ledgers Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-200">
                  <thead className="sticky top-0 z-10 bg-slate-800 text-slate-300 font-bold text-xs uppercase border-b border-slate-700">
                    <tr>
                      <th className="p-3 w-20">Code</th>
                      <th className="p-3">Sub-Ledger Account Name</th>
                      <th className="p-3">Type / Category</th>
                      <th className="p-3 text-right">Opening Bal</th>
                      <th className="p-3 text-right">Net Current Balance</th>
                      <th className="p-3 text-right">Actions (View / Edit / Delete)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {accounts.map((acc) => {
                      const balInfo = balancesMap.get(acc.id);
                      return (
                        <tr key={acc.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono font-bold text-indigo-400 pl-6">{acc.code}</td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              <span className="text-slate-600">├─</span>
                              <span>{acc.name}</span>
                              {acc.accountNumber && (
                                <span className="text-xs bg-slate-800 text-indigo-300 font-mono px-1.5 py-0.5 rounded border border-slate-700">
                                  A/c: {acc.accountNumber}
                                </span>
                              )}
                              {acc.isSystem && (
                                <span className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20">System</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className="bg-slate-800 text-slate-200 border border-slate-700 px-2 py-0.5 rounded text-xs font-medium">
                              {acc.subCategory || 'Sub-Ledger'}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-slate-300">
                            {formatCurrency(acc.openingBalance, currency)} ({acc.balanceType})
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-bold text-slate-100">
                            {formatCurrency(balInfo?.netBalance || 0, currency)} ({balInfo?.balanceType || 'DR'})
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => onSelectAccountLedger(acc.id)}
                                title="View Ledger Transactions"
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-indigo-300 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View</span>
                              </button>

                              {onUpdateAccount && perms.canCreateEditVouchers && (
                                <button
                                  onClick={() => handleOpenEditAccount(acc)}
                                  title="Edit Ledger Account"
                                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                              )}

                              {onDeleteAccount && !acc.isSystem && perms.canDeleteRecords && (
                                <button
                                  onClick={() =>
                                    setConfirmDeleteTarget({
                                      kind: 'ACCOUNT',
                                      id: acc.id,
                                      name: acc.name
                                    })
                                  }
                                  title="Delete Ledger Account"
                                  className="px-2 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Render Party Sub-Ledgers if viewing Sundry Debtors or Sundry Creditors */}
                    {(() => {
                      const grpLower = groupName.toLowerCase();
                      const isDebtorsGroup = grpLower.includes('debtor') || grpLower.includes('receivable');
                      const isCreditorsGroup = grpLower.includes('creditor') || grpLower.includes('payable');

                      if (!isDebtorsGroup && !isCreditorsGroup) return null;

                      const partyList = isDebtorsGroup 
                        ? data.parties.filter(p => (p.type === 'CUSTOMER' || p.type === 'BOTH') && (
                            !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
                          ))
                        : data.parties.filter(p => (p.type === 'VENDOR' || p.type === 'BOTH') && (
                            !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.code.toLowerCase().includes(search.toLowerCase())
                          ));

                      if (partyList.length === 0) return null;

                      return partyList.map(p => {
                        const out = calculatePartyOutstanding(p, data);
                        return (
                          <tr key={`party_${p.id}`} className="hover:bg-slate-800/40 transition bg-indigo-950/10">
                            <td className="p-3 font-mono font-bold text-emerald-400 pl-6">{p.code}</td>
                            <td className="p-3">
                              <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                                <span className="text-slate-600">├─</span>
                                <span className="text-emerald-300 font-bold">{p.name}</span>
                                <span className="text-[9px] bg-emerald-500/10 text-emerald-300 font-semibold px-1.5 py-0.5 rounded border border-emerald-500/20">
                                  {isDebtorsGroup ? 'Customer Party' : 'Vendor Party'}
                                </span>
                                {p.gstin && (
                                  <span className="text-[10px] bg-slate-800 text-indigo-300 font-mono px-1.5 py-0.5 rounded border border-slate-700">
                                    GSTIN: {p.gstin}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="bg-indigo-950 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded text-[10px] font-medium">
                                Party Ledger Master
                              </span>
                            </td>
                            <td className="p-3 text-right font-mono text-slate-400">
                              {formatCurrency(p.openingBalance || 0, currency)} ({p.balanceType || 'DR'})
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-emerald-400">
                              {formatCurrency(out.netBalance, currency)} ({out.balanceType})
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => onSelectAccountLedger(p.id)}
                                  title="View Party Ledger Statement"
                                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-md shadow-indigo-600/30"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>{isHindi ? 'लेजर देखें' : 'View Ledger'}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Modal 1: Add New Group / Sub-Group */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 md:p-6 text-slate-200 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <FolderPlus className="w-5 h-5 text-indigo-400" />
              <span>{isHindi ? 'नया खाता ग्रुप या सब-ग्रुप बनाएं' : 'Create New Account Group / Sub-Group'}</span>
            </h3>

            <form onSubmit={handleSaveGroup} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'खाता श्रेणी (Category) *' : 'Account Category *'}
                </label>
                <select
                  value={grpCategory}
                  onChange={(e) => {
                    const newCat = e.target.value as AccountCategory | '';
                    setGrpCategory(newCat);
                    setGrpParentId('');
                  }}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium"
                >
                  <option value="">{isHindi ? '-- श्रेणी चुनें --' : '-- Select Category --'}</option>
                  <option value="ASSET">ASSET (संपत्ति)</option>
                  <option value="LIABILITY">LIABILITY (देनदारी)</option>
                  <option value="EQUITY">EQUITY (पूंजी/इक्विटी)</option>
                  <option value="REVENUE">REVENUE (आय/बिक्री)</option>
                  <option value="EXPENSE">EXPENSE (खर्च/लागत)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'ग्रुप का नाम (Group Name) *' : 'Group Name *'}
                </label>
                <input
                  type="text"
                  value={grpName}
                  onChange={(e) => setGrpName(e.target.value)}
                  placeholder={isHindi ? 'उदा: Employee Welfare Expenses' : 'e.g. Employee Welfare & Allowances'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'पेरेंट ग्रुप (सब-ग्रुप बनाने के लिए पैरेंट ग्रुप चुनें)' : 'Parent Group (Select to create as Sub-Group)'}
                </label>
                <select
                  value={grpParentId}
                  onChange={(e) => setGrpParentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-bold"
                >
                  <option value="">{isHindi ? 'कोई नहीं (मुख्य प्राइमरी ग्रुप बनाएं)' : 'None (Create as Top Primary Group)'}</option>
                  {activeCategoryGroups.map(g => (
                    <option key={g.id} value={g.id}>
                      ↳ Sub-Group under: {g.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'विवरण (Description / Notes)' : 'Description / Purpose'}
                </label>
                <input
                  type="text"
                  value={grpDescription}
                  onChange={(e) => setGrpDescription(e.target.value)}
                  placeholder="e.g. For grouping staff medical insurance, PF, and employee benefit ledgers"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-300"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddGroupModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isHindi ? 'ग्रुप सेव करें' : 'Save Account Group'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add New Sub-Ledger Account */}
      {showAddAccountModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 md:p-6 text-slate-200 space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <FolderTree className="w-5 h-5 text-indigo-400" />
              <span>{isHindi ? 'नया लेजर खाता बनाएं' : 'Create Sub-Ledger Account'}</span>
            </h3>

            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'खाता वर्ग (Account Category) *' : 'Account Category *'}
                </label>
                <select
                  value={accCategory}
                  onChange={(e) => setAccCategory(e.target.value as any)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium"
                >
                  <option value="">{isHindi ? '-- खाता वर्ग चुनें --' : '-- Select Category --'}</option>
                  <option value="ASSET">ASSET (संपत्ति)</option>
                  <option value="LIABILITY">LIABILITY (देनदारी)</option>
                  <option value="EQUITY">EQUITY (पूंजी/इक्विटी)</option>
                  <option value="REVENUE">REVENUE (आय/बिक्री)</option>
                  <option value="EXPENSE">EXPENSE (खर्च/लागत)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'खाता समूह चुनें (Select Group / Sub-Group) *' : 'Select Account Group / Sub-Group *'}
                </label>
                <select
                  value={accSelectedGroup}
                  onChange={(e) => setAccSelectedGroup(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-bold"
                >
                  <option value="">{isHindi ? '-- खाता समूह चुनें --' : '-- Select Account Group --'}</option>
                  {allGroups.map(g => (
                    <option key={g.id} value={g.name}>
                      {g.name} {g.parentGroupName ? `(Sub-Group under ${g.parentGroupName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'लेजर का नाम (Sub-Ledger Account Name) *' : 'Sub-Ledger Account Name *'}
                </label>
                <input
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="e.g. Staff Medical Insurance Exp A/c or HDFC Bank Current A/c"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'बैंक खाता संख्या / संदर्भ (Bank Account No / Ref)' : 'Bank Account Number / External Ref'}
                </label>
                <input
                  type="text"
                  value={accAccountNumber}
                  onChange={(e) => setAccAccountNumber(e.target.value)}
                  placeholder="e.g. 50200012345678"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'प्रारंभिक शेष (Opening Balance)' : 'Opening Balance'}
                  </label>
                  <input
                    type="number"
                    value={accOpeningBalance || ''}
                    onChange={(e) => setAccOpeningBalance(Number(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'शेष प्रकार (Dr / Cr)' : 'Balance Type (Dr / Cr)'}
                  </label>
                  <select
                    value={accBalanceType}
                    onChange={(e) => setAccBalanceType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-white font-bold"
                  >
                    <option value="DR">DR (Debit)</option>
                    <option value="CR">CR (Credit)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddAccountModal(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isHindi ? 'लेजर खाता सेव करें' : 'Save Sub-Ledger Account'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Edit Existing Sub-Ledger Account */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-5 md:p-6 text-slate-200 space-y-4 shadow-2xl animate-fadeIn">
            <h3 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Edit3 className="w-5 h-5 text-amber-400" />
              <span>{isHindi ? 'लेजर खाता संपादित करें (Edit Sub-Ledger Account)' : 'Edit Sub-Ledger Account'}</span>
            </h3>

            <form onSubmit={handleUpdateExistingAccount} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Account Category *</label>
                <select
                  value={accCategory}
                  onChange={(e) => setAccCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium"
                >
                  <option value="ASSET">ASSET (संपत्ति)</option>
                  <option value="LIABILITY">LIABILITY (देनदारी)</option>
                  <option value="EQUITY">EQUITY (पूंजी/इक्विटी)</option>
                  <option value="REVENUE">REVENUE (आय/बिक्री)</option>
                  <option value="EXPENSE">EXPENSE (खर्च/लागत)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Account Group / Sub-Group *</label>
                <select
                  value={accSelectedGroup}
                  onChange={(e) => setAccSelectedGroup(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-bold"
                >
                  {allGroups.map(g => (
                    <option key={g.id} value={g.name}>
                      {g.name} {g.parentGroupName ? `(Sub-Group under ${g.parentGroupName})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Account Name *</label>
                <input
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-semibold"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Bank Account Number / External Ref</label>
                <input
                  type="text"
                  value={accAccountNumber}
                  onChange={(e) => setAccAccountNumber(e.target.value)}
                  placeholder="e.g. 50200012345678"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-indigo-300 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Opening Balance</label>
                  <input
                    type="number"
                    value={accOpeningBalance}
                    onChange={(e) => setAccOpeningBalance(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Balance Type (Dr / Cr)</label>
                  <select
                    value={accBalanceType}
                    onChange={(e) => setAccBalanceType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-white font-bold"
                  >
                    <option value="DR">DR (Debit)</option>
                    <option value="CR">CR (Credit)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl shadow-lg shadow-amber-600/30 flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Update Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Group Summary Modal */}
      {summaryGroup && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30">
                  <FolderTree className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {isHindi ? `ग्रुप समरी: ${summaryGroup.name}` : `Group Summary: ${summaryGroup.name}`}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isHindi ? `इस ग्रुप के अंतर्गत शामिल कुल ${summaryGroup.accounts.length} सब-लेजर खाते` : `${summaryGroup.accounts.length} Sub-Ledgers included in this group`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSummaryGroup(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950">
              {summaryGroup.accounts.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {isHindi ? 'इस ग्रुप में कोई सब-लेजर खाता मौजूद नहीं है।' : 'No sub-ledger accounts under this group yet.'}
                </div>
              ) : (
                summaryGroup.accounts.map(acc => {
                  const bal = balancesMap.get(acc.id);
                  return (
                    <div key={acc.id} className="p-3.5 flex items-center justify-between hover:bg-slate-900 transition">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-indigo-400">{acc.code}</span>
                          <span className="font-bold text-slate-100 text-xs">{acc.name}</span>
                          {acc.accountNumber && (
                            <span className="text-[10px] text-cyan-400 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/20 font-mono">
                              A/c: {acc.accountNumber}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-3">
                          <span>{acc.subCategory || acc.category}</span>
                          <span>•</span>
                          <span>{isHindi ? 'प्रारंभिक:' : 'Opening:'} {formatCurrency(acc.openingBalance, currency)} ({acc.balanceType})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400">{isHindi ? 'वर्तमान बैलेंस' : 'Net Balance'}</div>
                          <div className="text-xs font-bold text-indigo-300 font-mono">
                            {formatCurrency(bal?.netBalance || 0, currency)} ({bal?.balanceType || 'DR'})
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSummaryGroup(null);
                            onSelectAccountLedger(acc.id);
                          }}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 shrink-0"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'लेजर खोलें (Dr/Cr breakdown)' : 'View Ledger'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSummaryGroup(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Smart Duplicate Ledger & Party Inspector Modal */}
      {showDupAuditModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn">
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-start justify-between gap-3 bg-slate-950/70">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {isHindi ? 'स्मार्ट डुप्लीकेट लेज़र एवं पार्टी इंस्पेक्टर' : 'Smart Duplicate Ledger & Party Inspector'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isHindi
                      ? 'एक ही नाम, GSTIN, या मिलती-जुलती स्पेलिंग वाले डुप्लीकेट लेज़रों को सुरक्षित रूप से मर्ज करें (सभी वाउचर और बिल स्वतः मुख्य लेज़र से जुड़ जाएँगे)।'
                      : 'Consolidate duplicate ledgers & parties by exact name, canonical key, GSTIN, or fuzzy match. All vouchers, bills & notes automatically relink.'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDupAuditModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {dupAudit.accountClusters.length === 0 && dupAudit.partyClusters.length === 0 ? (
                <div className="p-8 text-center space-y-2 bg-emerald-950/20 border border-emerald-500/30 rounded-2xl">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <p className="font-bold text-sm text-emerald-200">
                    {isHindi ? 'बधाई हो! कोई डुप्लीकेट लेज़र या पार्टी नहीं मिली।' : 'No Duplicate Ledgers or Parties Found!'}
                  </p>
                  <p className="text-slate-400 text-xs">
                    {isHindi
                      ? 'आपका चार्ट ऑफ़ एकाउंट्स और पार्टी मास्टर 100% साफ़ और डुप्लीकेट-मुक्त है।'
                      : 'Your Chart of Accounts and Party Master are clean and conflict-free.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Opening Balance Merge Strategy */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-slate-300">
                      {isHindi ? 'ओपनिंग बैलेंस मर्ज नियम:' : 'Opening Balance Merge Rule:'}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setDupMergeStrategy('KEEP_PRIMARY_OR_NONZERO')}
                        className={`px-3 py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                          dupMergeStrategy === 'KEEP_PRIMARY_OR_NONZERO'
                            ? 'bg-indigo-600 text-white border-indigo-400'
                            : 'bg-slate-900 text-slate-300 border-slate-700'
                        }`}
                      >
                        {isHindi ? 'मुख्य / गैर-शून्य बैलेंस रखें (अनुशंसित)' : 'Keep Primary / Non-Zero (Recommended)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDupMergeStrategy('SUM')}
                        className={`px-3 py-1.5 rounded-lg font-bold border transition cursor-pointer ${
                          dupMergeStrategy === 'SUM'
                            ? 'bg-indigo-600 text-white border-indigo-400'
                            : 'bg-slate-900 text-slate-300 border-slate-700'
                        }`}
                      >
                        {isHindi ? 'सभी का योग जोड़ें (Sum)' : 'Sum All Openings'}
                      </button>
                    </div>
                  </div>

                  {/* Account Clusters */}
                  {dupAudit.accountClusters.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="font-extrabold text-indigo-300 uppercase tracking-wide text-[11px]">
                        {isHindi ? `डुप्लीकेट लेज़र खाते (${dupAudit.accountClusters.length} समूह)` : `Duplicate Ledger Accounts (${dupAudit.accountClusters.length} clusters)`}
                      </h4>
                      {dupAudit.accountClusters.map((cluster) => {
                        const checked = selectedDupClusterIds.includes(cluster.clusterId);
                        return (
                          <div key={cluster.clusterId} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-white">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedDupClusterIds(prev =>
                                      e.target.checked
                                        ? [...prev, cluster.clusterId]
                                        : prev.filter(id => id !== cluster.clusterId)
                                    );
                                  }}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <span>{cluster.primary.name}</span>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  PRIMARY • {cluster.primary.code}
                                </span>
                              </label>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                {cluster.reason} ({cluster.similarity}%)
                              </span>
                            </div>
                            <div className="pl-6 space-y-1 text-[11px]">
                              <div className="text-slate-400">
                                Primary Opening: <strong className="text-slate-200 font-mono">{formatCurrency(cluster.primary.openingBalance, currency)} ({cluster.primary.balanceType})</strong> | Entries linked: <strong className="text-indigo-300">{cluster.usageCounts[cluster.primary.id] || 0}</strong>
                              </div>
                              {cluster.duplicates.map((dup) => (
                                <div key={dup.id} className="flex flex-wrap items-center justify-between gap-2 text-rose-300/90 bg-rose-950/20 px-2.5 py-1 rounded-lg border border-rose-500/20">
                                  <span>↳ Merge Duplicate: <strong>{dup.name}</strong> ({dup.code})</span>
                                  <span className="font-mono text-[10px]">
                                    Op: {formatCurrency(dup.openingBalance, currency)} ({dup.balanceType}) • Txns: {cluster.usageCounts[dup.id] || 0}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Party Clusters */}
                  {dupAudit.partyClusters.length > 0 && (
                    <div className="space-y-2.5">
                      <h4 className="font-extrabold text-emerald-300 uppercase tracking-wide text-[11px]">
                        {isHindi ? `डुप्लीकेट पार्टियाँ / ग्राहक / सप्लायर (${dupAudit.partyClusters.length} समूह)` : `Duplicate Parties / Customers / Vendors (${dupAudit.partyClusters.length} clusters)`}
                      </h4>
                      {dupAudit.partyClusters.map((cluster) => {
                        const checked = selectedDupClusterIds.includes(cluster.clusterId);
                        return (
                          <div key={cluster.clusterId} className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <label className="flex items-center gap-2 cursor-pointer font-bold text-white">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedDupClusterIds(prev =>
                                      e.target.checked
                                        ? [...prev, cluster.clusterId]
                                        : prev.filter(id => id !== cluster.clusterId)
                                    );
                                  }}
                                  className="accent-amber-500 rounded cursor-pointer"
                                />
                                <span>{cluster.primary.name}</span>
                                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  PRIMARY • {cluster.primary.gstin || cluster.primary.code}
                                </span>
                              </label>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                {cluster.reason} ({cluster.similarity}%)
                              </span>
                            </div>
                            <div className="pl-6 space-y-1 text-[11px]">
                              <div className="text-slate-400">
                                Primary Opening: <strong className="text-slate-200 font-mono">{formatCurrency(cluster.primary.openingBalance, currency)} ({cluster.primary.balanceType})</strong> | Entries linked: <strong className="text-indigo-300">{cluster.usageCounts[cluster.primary.id] || 0}</strong>
                              </div>
                              {cluster.duplicates.map((dup) => (
                                <div key={dup.id} className="flex flex-wrap items-center justify-between gap-2 text-rose-300/90 bg-rose-950/20 px-2.5 py-1 rounded-lg border border-rose-500/20">
                                  <span>↳ Merge Duplicate: <strong>{dup.name}</strong> ({dup.gstin || dup.code})</span>
                                  <span className="font-mono text-[10px]">
                                    Op: {formatCurrency(dup.openingBalance, currency)} ({dup.balanceType}) • Txns: {cluster.usageCounts[dup.id] || 0}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-400">
                {dupAudit.totalDuplicateRecords > 0
                  ? (isHindi
                      ? `${selectedDupClusterIds.length} समूह चुने गए`
                      : `${selectedDupClusterIds.length} cluster(s) selected for merge`)
                  : ''}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDupAuditModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition cursor-pointer"
                >
                  {isHindi ? 'बंद करें' : 'Close'}
                </button>
                {onMergeDuplicateLedgers && dupAudit.totalDuplicateRecords > 0 && (
                  perms.canBulkReclassify ? (
                    <button
                      type="button"
                      disabled={selectedDupClusterIds.length === 0}
                      onClick={() => {
                        onMergeDuplicateLedgers(selectedDupClusterIds, dupMergeStrategy);
                        setShowDupAuditModal(false);
                      }}
                      className={`px-5 py-2 rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 ${
                        selectedDupClusterIds.length > 0
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      <GitMerge className="w-4 h-4" />
                      <span>{isHindi ? 'चयनित डुप्लीकेट मर्ज करें' : 'Merge & Clean Selected'}</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl font-semibold">
                      {isHindi ? 'केवल रीड-ओनली ऑडिट (मर्ज अनुमति नहीं)' : 'Audit Preview Only (No Merge Permission)'}
                    </span>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline Delete Confirmation Modal */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-rose-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  {confirmDeleteTarget.kind === 'GROUP'
                    ? (isHindi ? 'खाता समूह हटाने की पुष्टि' : 'Delete Custom Account Group?')
                    : (isHindi ? 'लेजर खाता हटाने की पुष्टि' : 'Delete Ledger Account?')}
                </h3>
                <p className="text-xs text-slate-400">{confirmDeleteTarget.name}</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {confirmDeleteTarget.kind === 'GROUP'
                ? (isHindi
                    ? `क्या आप वाकई कस्टम ग्रुप "${confirmDeleteTarget.name}" को हटाना चाहते हैं?`
                    : `Are you sure you want to delete custom account group "${confirmDeleteTarget.name}"?`)
                : (isHindi
                    ? `क्या आप वाकई लेजर खाता "${confirmDeleteTarget.name}" को स्थायी रूप से हटाना चाहते हैं?`
                    : `Are you sure you want to permanently delete ledger account "${confirmDeleteTarget.name}"?`)}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-xs transition cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDeleteTarget.kind === 'GROUP' && onDeleteGroup) {
                    onDeleteGroup(confirmDeleteTarget.id);
                  } else if (confirmDeleteTarget.kind === 'ACCOUNT' && onDeleteAccount) {
                    onDeleteAccount(confirmDeleteTarget.id);
                  }
                  setConfirmDeleteTarget(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition shadow-lg shadow-rose-600/30 cursor-pointer"
              >
                {isHindi ? 'हाँ, डिलीट करें' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
