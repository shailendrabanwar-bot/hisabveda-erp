import React, { useState, useEffect, useRef } from 'react';
import { 
  Building2, 
  Search, 
  ShieldCheck, 
  Download, 
  Plus, 
  Coins, 
  Globe2, 
  FileText,
  RotateCcw,
  RefreshCw,
  LogOut,
  Users,
  ZoomIn,
  ZoomOut,
  Palette,
  Sparkles,
  Maximize,
  Minimize,
  ChevronDown,
  Eye,
  Receipt,
  CreditCard,
  BookOpen,
  SlidersHorizontal,
  Package,
  Layers,
  ArrowRight,
  ArrowUpRight,
  X,
  Smartphone,
  KeyRound,
  Settings,
  Cloud,
  CheckCircle2,
  MoreVertical,
  HelpCircle,
  Calendar,
  ScanBarcode,
  Keyboard,
  ToggleRight
} from 'lucide-react';
import { AppData, Currency, UserProfile, SalesInvoice, UserRole } from '../types';
import { TrialStatus } from '../utils/license';
import { SnaLogo } from './SnaLogo';
import { formatCurrency, isElectronDesktopRuntime } from '../utils/storage';
import { AppConfiguration, isNavTabEnabled, loadAppConfig } from '../utils/appConfig';
import {
  ALL_FINANCIAL_YEARS,
  AvailableFinancialYear,
  buildDateRangeToken,
  buildFYRangeToken,
  getFinancialYearRange,
  parseDateRangeToken,
  parseFYRangeToken
} from '../utils/fiscalYear';
import { getRolePermissions, normalizeUserRole, ROLE_METADATA, RolePermissions } from '../utils/rbac';

export type AppTheme = 'slate' | 'navy' | 'emerald' | 'purple' | 'light';

interface HeaderProps {
  data: AppData;
  onUpdateCurrency: (currency: Currency) => void;
  onOpenQuickModal: (type: 'invoice' | 'journal' | 'payment' | 'receipt' | 'contra') => void;
  onOpenBackupModal: () => void;
  onOpenSecurityModal: () => void;
  onOpenMasterPinModal?: () => void;
  onOpenLicenseModal: () => void;
  trialStatus?: TrialStatus;
  onOpenUpdateModal?: () => void;
  onOpenConfigureModal?: () => void;
  onRefreshData?: () => void;
  cloudSyncStatus?: 'connected' | 'syncing' | 'offline' | 'local' | 'error';
  lastSyncTime?: string;
  onOpenCloudSyncModal?: () => void;
  onOpenUserModal?: () => void;
  onOpenCompanyManager?: () => void;
  onLogout?: () => void;
  activeUser?: UserProfile;
  onLockSession: () => void;
  onSearchChange: (q: string) => void;
  searchQuery: string;
  isHindi: boolean;
  onToggleHindi: () => void;
  onResetSampleData: () => void;
  zoomLevel?: number;
  onUpdateZoom?: (zoom: number) => void;
  theme?: AppTheme;
  onUpdateTheme?: (theme: AppTheme) => void;
  onNavigateTab?: (tab: any) => void;
  onSelectInvoice?: (invoice: SalesInvoice) => void;
  onSelectParty?: (partyId: string) => void;
  onSelectAccount?: (accountId: string) => void;
  onOpenMobileModal?: () => void;
  availableFinancialYears?: AvailableFinancialYear[];
  activeFinancialYearStart?: string;
  onChangeFinancialYear?: (fyStart: string) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
  onOpenShortcutsModal?: () => void;
  onOpenUserManual?: () => void;
  appConfig?: AppConfiguration;
  onOpenFeaturesModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  data,
  onUpdateCurrency,
  onOpenQuickModal,
  onOpenBackupModal,
  onOpenSecurityModal,
  onOpenMasterPinModal,
  onOpenLicenseModal,
  trialStatus,
  onOpenUpdateModal,
  onOpenConfigureModal,
  onRefreshData,
  cloudSyncStatus = 'connected',
  lastSyncTime,
  onOpenCloudSyncModal,
  onOpenUserModal,
  onOpenCompanyManager,
  onLogout,
  activeUser,
  onLockSession,
  onSearchChange,
  searchQuery,
  isHindi,
  onToggleHindi,
  onResetSampleData,
  zoomLevel = 100,
  onUpdateZoom,
  theme = 'slate',
  onUpdateTheme,
  onNavigateTab,
  onSelectInvoice,
  onSelectParty,
  onSelectAccount,
  onOpenMobileModal,
  availableFinancialYears = [],
  activeFinancialYearStart,
  onChangeFinancialYear,
  activeUserRole,
  permissions,
  onOpenShortcutsModal,
  onOpenUserManual,
  appConfig,
  onOpenFeaturesModal
}) => {
  const effectiveConfig = appConfig || loadAppConfig();
  const posEnabled = isNavTabEnabled('pos', effectiveConfig);
  const itemsEnabled = isNavTabEnabled('items', effectiveConfig);
  const effectiveRole = normalizeUserRole(activeUserRole || activeUser?.role || 'ADMIN');
  const rbac = permissions || getRolePermissions(effectiveRole);
  const roleMeta = ROLE_METADATA[effectiveRole];
  const canCreateAnyQuickTx = rbac.canCreateEditTransactions || rbac.canCreateEditVouchers;
  const canOpenConfig = Boolean(onOpenConfigureModal) && !rbac.isReadOnly && (rbac.canEditCompanySettings || rbac.canCreateEditTransactions || rbac.canCreateEditVouchers);
  const isDesktopApp = isElectronDesktopRuntime();

  const zoomOptions = [75, 90, 100, 115, 130, 145, 160];
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Dropdown States for Clean, Organized Navigation Bar
  const [showTxMenu, setShowTxMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showFyMenu, setShowFyMenu] = useState(false);
  const [showMobileTxSheet, setShowMobileTxSheet] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  const activeFyRange = getFinancialYearRange(activeFinancialYearStart || data.company.financialYearStart);
  const isAllYearsSelected = activeFyRange.fyStart === ALL_FINANCIAL_YEARS;
  const isCustomPeriodSelected = Boolean(activeFyRange.isCustomPeriod);
  const fyList: AvailableFinancialYear[] = availableFinancialYears.length > 0
    ? availableFinancialYears
    : [{
        fyStart: activeFyRange.fyStart,
        fyEnd: activeFyRange.fyEnd,
        label: activeFyRange.label,
        shortLabel: activeFyRange.shortLabel,
        count: 0,
        isCurrent: true
      }];
  const fyListAsc = [...fyList].sort((a, b) => a.fyStart.localeCompare(b.fyStart));
  const currentFyObj = fyList.find(f => f.isCurrent);

  const [customPeriodMode, setCustomPeriodMode] = useState<'FY' | 'DATES'>('FY');
  const [customFromFy, setCustomFromFy] = useState<string>(() => fyListAsc[0]?.fyStart || activeFyRange.fyStart);
  const [customToFy, setCustomToFy] = useState<string>(() => currentFyObj?.fyStart || activeFyRange.fyStart);
  const [customFromDate, setCustomFromDate] = useState<string>(() => activeFyRange.fyStart);
  const [customToDate, setCustomToDate] = useState<string>(() => activeFyRange.fyEnd);

  useEffect(() => {
    const parsedFy = parseFYRangeToken(activeFinancialYearStart);
    const parsedDates = parseDateRangeToken(activeFinancialYearStart);
    if (parsedDates) {
      setCustomPeriodMode('DATES');
      setCustomFromDate(parsedDates.fromDate);
      setCustomToDate(parsedDates.toDate);
    } else if (parsedFy) {
      setCustomPeriodMode('FY');
      setCustomFromFy(parsedFy.fromFYStart);
      setCustomToFy(parsedFy.toFYStart);
    } else {
      setCustomFromDate(activeFyRange.fyStart);
      setCustomToDate(activeFyRange.fyEnd);
    }
  }, [activeFinancialYearStart, activeFyRange.fyStart, activeFyRange.fyEnd]);

  // Global Search Dropdown State
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchCategory, setSearchCategory] = useState<'all' | 'invoices' | 'parties' | 'items' | 'accounts' | 'vouchers'>('all');

  const txMenuRef = useRef<HTMLDivElement>(null);
  const fyMenuRef = useRef<HTMLDivElement>(null);
  const mobileFyMenuRef = useRef<HTMLDivElement>(null);
  const mobileMoreBtnRef = useRef<HTMLButtonElement>(null);
  const desktopMoreBtnRef = useRef<HTMLButtonElement>(null);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (txMenuRef.current && !txMenuRef.current.contains(target)) {
        setShowTxMenu(false);
      }
      const insideFy =
        (fyMenuRef.current && fyMenuRef.current.contains(target)) ||
        (mobileFyMenuRef.current && mobileFyMenuRef.current.contains(target));
      if (!insideFy) {
        setShowFyMenu(false);
      }
      const isInsideMore =
        (morePanelRef.current && morePanelRef.current.contains(target)) ||
        (mobileMoreBtnRef.current && mobileMoreBtnRef.current.contains(target)) ||
        (desktopMoreBtnRef.current && desktopMoreBtnRef.current.contains(target));
      if (!isInsideMore) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.log('Fullscreen failed:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => {
          console.log('Exit fullscreen failed:', err);
        });
      }
    }
  };

  // Search Outside Click & Keyboard Handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (e.key === 'Escape') {
        setIsSearchFocused(false);
        setShowMoreMenu(false);
        setShowMobileSearch(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const isInsideSearch =
        (searchContainerRef.current && searchContainerRef.current.contains(target)) ||
        (mobileSearchContainerRef.current && mobileSearchContainerRef.current.contains(target));
      if (!isInsideSearch) {
        setIsSearchFocused(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const cleanQuery = (searchQuery || '').trim().toLowerCase();

  const matchingInvoices = cleanQuery ? (data.invoices || []).filter(inv => 
    (inv.invoiceNumber || '').toLowerCase().includes(cleanQuery) ||
    (inv.partyName || '').toLowerCase().includes(cleanQuery) ||
    (inv.notes || '').toLowerCase().includes(cleanQuery) ||
    (String(inv.totalAmount) || '').includes(cleanQuery)
  ).slice(0, 5) : [];

  const matchingParties = cleanQuery ? (data.parties || []).filter(p => 
    (p.name || '').toLowerCase().includes(cleanQuery) ||
    (p.code || '').toLowerCase().includes(cleanQuery) ||
    (p.phone || '').toLowerCase().includes(cleanQuery) ||
    (p.gstin || '').toLowerCase().includes(cleanQuery) ||
    (p.state || '').toLowerCase().includes(cleanQuery)
  ).slice(0, 5) : [];

  const matchingItems = cleanQuery && itemsEnabled ? (data.items || []).filter(i => 
    (i.name || '').toLowerCase().includes(cleanQuery) ||
    (i.code || '').toLowerCase().includes(cleanQuery) ||
    (i.barcode || '').toLowerCase().includes(cleanQuery) ||
    (i.hsnSacCode || '').toLowerCase().includes(cleanQuery) ||
    (i.category || '').toLowerCase().includes(cleanQuery)
  ).slice(0, 5) : [];

  const matchingAccounts = cleanQuery ? (data.accounts || []).filter(a => 
    (a.name || '').toLowerCase().includes(cleanQuery) ||
    (a.code || '').toLowerCase().includes(cleanQuery) ||
    (a.group || '').toLowerCase().includes(cleanQuery)
  ).slice(0, 5) : [];

  const matchingVouchers = cleanQuery ? (data.vouchers || []).filter(v => 
    (v.voucherNumber || '').toLowerCase().includes(cleanQuery) ||
    (v.partyName || '').toLowerCase().includes(cleanQuery) ||
    (v.narration || '').toLowerCase().includes(cleanQuery) ||
    (v.type || '').toLowerCase().includes(cleanQuery) ||
    (String(v.amount) || '').includes(cleanQuery)
  ).slice(0, 5) : [];

  const totalResultsCount = matchingInvoices.length + matchingParties.length + matchingItems.length + matchingAccounts.length + matchingVouchers.length;

  const renderSearchResultsDropdown = (isMobileOverlay = false) => (
    <div
      className={
        isMobileOverlay
          ? "mt-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-[var(--border-primary)] animate-fadeIn text-sm max-h-[65dvh] flex flex-col"
          : "absolute top-full left-0 right-0 md:left-auto md:right-0 md:w-[480px] lg:w-[540px] mt-2 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 overflow-hidden divide-y divide-[var(--border-primary)] animate-fadeIn text-sm max-h-[75vh] flex flex-col"
      }
    >
      {/* Header with Results Count & Filter Tabs */}
      <div className="p-3 bg-[var(--bg-elevated)] flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5">
            <Search className="w-4 h-4 text-indigo-500" />
            <span>
              {isHindi
                ? `खोज परिणाम: "${searchQuery}" (${totalResultsCount} मिले)`
                : `Results for "${searchQuery}" (${totalResultsCount} found)`}
            </span>
          </span>
          <button
            type="button"
            onClick={() => {
              setIsSearchFocused(false);
              if (isMobileOverlay) setShowMobileSearch(false);
            }}
            className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] px-2 py-0.5 rounded-lg border border-[var(--border-subtle)] transition cursor-pointer"
          >
            {isMobileOverlay ? (isHindi ? 'बंद करें' : 'Close') : 'Esc'}
          </button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
          <button
            type="button"
            onClick={() => setSearchCategory('all')}
            className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
              searchCategory === 'all'
                ? 'bg-indigo-600 text-white hv-keep-white'
                : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]'
            }`}
          >
            All ({totalResultsCount})
          </button>
          {matchingInvoices.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchCategory('invoices')}
              className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
                searchCategory === 'invoices'
                  ? 'bg-emerald-600 text-white hv-keep-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]'
              }`}
            >
              Invoices ({matchingInvoices.length})
            </button>
          )}
          {matchingParties.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchCategory('parties')}
              className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
                searchCategory === 'parties'
                  ? 'bg-amber-600 text-white hv-keep-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]'
              }`}
            >
              Parties ({matchingParties.length})
            </button>
          )}
          {matchingItems.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchCategory('items')}
              className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
                searchCategory === 'items'
                  ? 'bg-cyan-600 text-white hv-keep-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]'
              }`}
            >
              Items ({matchingItems.length})
            </button>
          )}
          {matchingAccounts.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchCategory('accounts')}
              className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
                searchCategory === 'accounts'
                  ? 'bg-purple-600 text-white hv-keep-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]'
              }`}
            >
              Ledgers ({matchingAccounts.length})
            </button>
          )}
          {matchingVouchers.length > 0 && (
            <button
              type="button"
              onClick={() => setSearchCategory('vouchers')}
              className={`px-2.5 py-1 rounded-lg font-bold transition shrink-0 ${
                searchCategory === 'vouchers'
                  ? 'bg-rose-600 text-white hv-keep-white'
                  : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-primary)]'
              }`}
            >
              Vouchers ({matchingVouchers.length})
            </button>
          )}
        </div>
      </div>

      {/* Scrollable Results Container */}
      <div className="overflow-y-auto flex-1 divide-y divide-[var(--border-primary)] p-2.5 space-y-2">
        {totalResultsCount === 0 ? (
          <div className="p-6 text-center text-[var(--text-muted)] space-y-2">
            <p className="font-semibold text-[var(--text-primary)] text-sm">
              {isHindi ? `"${searchQuery}" के लिए कोई रिकॉर्ड नहीं मिला` : `No matching records found for "${searchQuery}"`}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              {isHindi
                ? 'सुझाव: इनवॉइस नंबर (INV-..), ग्राहक/पार्टी का नाम, या सामग्री (Item) का नाम खोजें।'
                : 'Tip: Try searching by invoice number, party name, phone, or stock item.'}
            </p>
          </div>
        ) : (
          <>
            {(searchCategory === 'all' || searchCategory === 'invoices') && matchingInvoices.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-bold text-emerald-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'बिक्री इनवॉइस (Sales Invoices)' : 'Sales Invoices'}</span>
                </div>
                {matchingInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => {
                      setIsSearchFocused(false);
                      setShowMobileSearch(false);
                      if (onSelectInvoice) onSelectInvoice(inv);
                      else if (onNavigateTab) onNavigateTab('invoices');
                    }}
                    className="p-2.5 hover:bg-[var(--hover-surface)] rounded-xl cursor-pointer transition flex items-center justify-between gap-2.5 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] group-hover:text-emerald-500 transition text-sm">
                          {inv.invoiceNumber}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] font-mono">{inv.date}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded font-bold border ${
                          inv.status === 'PAID' ? 'hv-pill-emerald' : 'hv-pill-rose'
                        }`}>
                          {inv.status}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{inv.partyName}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-emerald-500 text-sm">
                        {formatCurrency(inv.totalAmount, inv.currency || data.company.currency)}
                      </div>
                      <span className="text-xs text-indigo-500 group-hover:underline flex items-center justify-end gap-0.5 mt-0.5">
                        <span>{isHindi ? 'देखें' : 'View'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(searchCategory === 'all' || searchCategory === 'parties') && matchingParties.length > 0 && (
              <div className="space-y-1 pt-1.5">
                <div className="text-xs font-bold text-amber-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'पार्टियां (Customers & Vendors)' : 'Parties & Customers'}</span>
                </div>
                {matchingParties.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => {
                      setIsSearchFocused(false);
                      setShowMobileSearch(false);
                      if (onSelectParty) onSelectParty(p.id);
                      if (onNavigateTab) onNavigateTab('parties');
                    }}
                    className="p-2.5 hover:bg-[var(--hover-surface)] rounded-xl cursor-pointer transition flex items-center justify-between gap-2.5 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] group-hover:text-amber-500 transition text-sm">{p.name}</span>
                        <span className="text-xs bg-[var(--bg-elevated)] text-[var(--text-muted)] px-1.5 py-0.5 rounded font-mono border border-[var(--border-primary)]">{p.code}</span>
                        <span className={`text-[11px] px-2 py-0.5 rounded font-bold border ${
                          p.type === 'CUSTOMER' ? 'hv-pill-indigo' : 'hv-pill-amber'
                        }`}>
                          {p.type}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {p.city ? `${p.city}, ` : ''}{p.state} • {p.phone || p.gstin || 'No GSTIN'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs text-amber-500 group-hover:underline flex items-center justify-end gap-0.5">
                        <span>{isHindi ? 'खाता खोलें' : 'Open Party'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(searchCategory === 'all' || searchCategory === 'items') && matchingItems.length > 0 && (
              <div className="space-y-1 pt-1.5">
                <div className="text-xs font-bold text-cyan-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <Package className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'इन्वेंटरी सामग्री (Stock Items)' : 'Inventory Stock Items'}</span>
                </div>
                {matchingItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      setIsSearchFocused(false);
                      setShowMobileSearch(false);
                      if (onNavigateTab) onNavigateTab('items');
                    }}
                    className="p-2.5 hover:bg-[var(--hover-surface)] rounded-xl cursor-pointer transition flex items-center justify-between gap-2.5 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] group-hover:text-cyan-500 transition text-sm">{item.name}</span>
                        <span className="text-xs hv-pill-cyan px-1.5 py-0.5 rounded font-mono border">{item.code}</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                        {item.category} • HSN: {item.hsnSacCode} • GST: {item.taxRate}%
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-cyan-500 text-sm">
                        {item.currentStock} {item.unit}
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{formatCurrency(item.salePrice, data.company.currency)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(searchCategory === 'all' || searchCategory === 'accounts') && matchingAccounts.length > 0 && (
              <div className="space-y-1 pt-1.5">
                <div className="text-xs font-bold text-purple-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'खाते व लेज़र (Chart of Accounts)' : 'Chart of Accounts'}</span>
                </div>
                {matchingAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    onClick={() => {
                      setIsSearchFocused(false);
                      setShowMobileSearch(false);
                      if (onSelectAccount) onSelectAccount(acc.id);
                      if (onNavigateTab) onNavigateTab('ledger');
                    }}
                    className="p-2.5 hover:bg-[var(--hover-surface)] rounded-xl cursor-pointer transition flex items-center justify-between gap-2.5 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] group-hover:text-purple-500 transition text-sm">{acc.name}</span>
                        <span className="text-xs hv-pill-purple px-1.5 py-0.5 rounded font-mono border">{acc.code}</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">{acc.group} ({acc.category})</div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs text-purple-500 group-hover:underline flex items-center justify-end gap-0.5">
                        <span>{isHindi ? 'लेज़र खोलें' : 'Open Ledger'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(searchCategory === 'all' || searchCategory === 'vouchers') && matchingVouchers.length > 0 && (
              <div className="space-y-1 pt-1.5">
                <div className="text-xs font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'वाउचर एंट्रीज (Vouchers)' : 'Vouchers & Journal Entries'}</span>
                </div>
                {matchingVouchers.map((vch) => (
                  <div
                    key={vch.id}
                    onClick={() => {
                      setIsSearchFocused(false);
                      setShowMobileSearch(false);
                      if (onNavigateTab) onNavigateTab('vouchers');
                    }}
                    className="p-2.5 hover:bg-[var(--hover-surface)] rounded-xl cursor-pointer transition flex items-center justify-between gap-2.5 group"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--text-primary)] group-hover:text-rose-500 transition text-sm">{vch.voucherNumber}</span>
                        <span className="text-[11px] hv-pill-rose px-2 py-0.5 rounded font-bold border">{vch.type}</span>
                        <span className="text-xs text-[var(--text-muted)] font-mono">{vch.date}</span>
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{vch.partyName || vch.narration}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-rose-500 text-sm">
                        {formatCurrency(vch.amount, data.company.currency)}
                      </div>
                      <span className="text-xs text-rose-500 group-hover:underline flex items-center justify-end gap-0.5 mt-0.5">
                        <span>{isHindi ? 'देखें' : 'View'}</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer Quick Actions */}
      <div className="p-2.5 bg-[var(--bg-elevated)] flex items-center justify-between text-xs text-[var(--text-muted)]">
        <span className="flex items-center gap-1">
          <span>{isHindi ? 'परिणाम पर क्लिक करके सीधे खोलें' : 'Click any result to open'}</span>
        </span>
        <button
          type="button"
          onClick={() => onSearchChange('')}
          className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer"
        >
          {isHindi ? 'खोज रीसेट करें' : 'Clear search'}
        </button>
      </div>
    </div>
  );

  return (
    <>
    <header className="hv-header sticky top-0 z-50 bg-[var(--bg-header)] backdrop-blur-xl border-b border-[var(--border-primary)] text-[var(--text-primary)] shadow-md px-3 sm:px-4 py-2 shrink-0 w-full max-w-full">
      
      {/* ============================================================
          1. MOBILE TOP TASKBAR (For small phone screens < md)
          ============================================================ */}
      <div className="flex md:hidden items-center justify-between w-full gap-2">
        {/* Left: SnaLogo + Company Switcher + Mobile FY Switcher */}
        <div className="flex items-center gap-1.5 min-w-0">
          <SnaLogo size="sm" showText={false} />
          <button
            type="button"
            onClick={() => {
              if (rbac.canManageCompanies && onOpenCompanyManager) onOpenCompanyManager();
            }}
            disabled={!rbac.canManageCompanies}
            className={`flex items-center gap-1 px-2 py-1.5 bg-[var(--bg-elevated)] text-[var(--text-primary)] rounded-xl border border-[var(--border-subtle)] text-xs font-bold truncate max-w-[110px] shadow-sm ${
              rbac.canManageCompanies ? 'hover:bg-[var(--hover-surface)] cursor-pointer' : 'cursor-default'
            }`}
            title={
              rbac.canManageCompanies
                ? (isHindi ? 'कंपनी बदलें' : 'Switch Company')
                : (isHindi ? 'केवल एडमिन कंपनी बदल सकते हैं' : 'Only Admin can manage companies')
            }
          >
            <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate">{data.company.name?.trim() || (isHindi ? 'कंपनी' : 'Company')}</span>
          </button>

          <div className="relative" ref={mobileFyMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowFyMenu(prev => !prev);
                setShowMoreMenu(false);
              }}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[11px] font-mono font-extrabold cursor-pointer ${
                isCustomPeriodSelected || isAllYearsSelected
                  ? 'hv-pill-emerald'
                  : currentFyObj && currentFyObj.fyStart !== activeFyRange.fyStart
                    ? 'hv-pill-amber'
                    : 'hv-pill-indigo'
              }`}
              title={isHindi ? 'वित्तीय वर्ष या कस्टम पीरियड चुनें' : 'Select Financial Year or Custom Period'}
            >
              <Calendar className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[115px]">{activeFyRange.shortLabel}</span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </button>

            {showFyMenu && (
              <div className="absolute left-0 mt-2 w-[310px] max-h-[430px] overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 p-2.5 space-y-2 animate-fadeIn">
                <div className="px-2 py-1 border-b border-[var(--border-primary)] flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-[var(--text-primary)]">
                    {isHindi ? 'वित्तीय वर्ष / अवधि चुनें' : 'Select FY / Custom Period'}
                  </span>
                  <span className="text-[10px] text-amber-500 font-mono truncate font-bold">{activeFyRange.shortLabel}</span>
                </div>

                {/* Custom Period Selector (Replaces All Years Combined) */}
                <div className="hv-pill-emerald border rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-extrabold flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>{isHindi ? 'कस्टम पीरियड चुनें' : 'Select Period'}</span>
                    </span>
                    <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border-primary)]">
                      <button
                        type="button"
                        onClick={() => setCustomPeriodMode('FY')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          customPeriodMode === 'FY' ? 'bg-emerald-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        FY → FY
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomPeriodMode('DATES')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          customPeriodMode === 'DATES' ? 'bg-emerald-600 text-white hv-keep-white' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {isHindi ? 'तारीख' : 'Dates'}
                      </button>
                    </div>
                  </div>

                  {customPeriodMode === 'FY' ? (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5 font-semibold">{isHindi ? 'किस FY से' : 'From FY'}</label>
                          <select
                            value={customFromFy}
                            onChange={(e) => setCustomFromFy(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[11px] font-mono text-[var(--text-primary)] cursor-pointer"
                          >
                            {fyListAsc.map((fy) => (
                              <option key={fy.fyStart} value={fy.fyStart}>{fy.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5 font-semibold">{isHindi ? 'किस FY तक' : 'To FY'}</label>
                          <select
                            value={customToFy}
                            onChange={(e) => setCustomToFy(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-[11px] font-mono text-[var(--text-primary)] cursor-pointer"
                          >
                            {fyListAsc.map((fy) => (
                              <option key={fy.fyStart} value={fy.fyStart}>{fy.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeFinancialYear?.(buildFYRangeToken(customFromFy, customToFy));
                          setShowFyMenu(false);
                        }}
                        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-[11px] font-extrabold transition cursor-pointer"
                      >
                        {isHindi ? 'पीरियड लागू करें (Apply Period)' : 'Apply Selected FY Period'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5 font-semibold">{isHindi ? 'शुरुआत दिनांक' : 'From Date'}</label>
                          <input
                            type="date"
                            value={customFromDate}
                            onChange={(e) => setCustomFromDate(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-1.5 py-1 text-[11px] font-mono text-[var(--text-primary)]"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-[var(--text-secondary)] block mb-0.5 font-semibold">{isHindi ? 'अंतिम दिनांक' : 'To Date'}</label>
                          <input
                            type="date"
                            value={customToDate}
                            onChange={(e) => setCustomToDate(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-1.5 py-1 text-[11px] font-mono text-[var(--text-primary)]"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeFinancialYear?.(buildDateRangeToken(customFromDate, customToDate));
                          setShowFyMenu(false);
                        }}
                        className="w-full py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-[11px] font-extrabold transition cursor-pointer"
                      >
                        {isHindi ? 'दिनांक अवधि लागू करें' : 'Apply Date Period'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-1 pt-0.5">
                  {fyList.map((fy) => {
                    const isActive = !isCustomPeriodSelected && !isAllYearsSelected && fy.fyStart === activeFyRange.fyStart;
                    return (
                      <button
                        key={fy.fyStart}
                        type="button"
                        onClick={() => {
                          onChangeFinancialYear?.(fy.fyStart);
                          setShowFyMenu(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between text-xs transition cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white hv-keep-white font-bold'
                            : 'hover:bg-[var(--hover-surface)] text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <span>{fy.label}</span>
                          {fy.isCurrent && (
                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${isActive ? 'bg-white/20 text-white border-white/30' : 'hv-pill-emerald'}`}>
                              {isHindi ? 'चालू' : 'Current'}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] font-mono ${isActive ? 'text-indigo-100' : 'text-[var(--text-muted)]'}`}>
                          {fy.count} {isHindi ? 'एंट्री' : 'rec'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Quick Mobile Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {trialStatus && !trialStatus.isLicensed && (
            <button
              type="button"
              onClick={onOpenLicenseModal}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-xl border text-[11px] font-extrabold transition cursor-pointer whitespace-nowrap ${
                trialStatus.isTrialExpired || trialStatus.clockTampered || trialStatus.vaultTampered || trialStatus.machineMismatch
                  ? 'hv-pill-rose'
                  : 'hv-pill-amber'
              }`}
              title={isHindi ? 'लाइसेंस एक्टिवेट / अपग्रेड करें' : 'Free Trial — Upgrade / Activate License'}
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span>
                {trialStatus.isTrialExpired
                  ? (isHindi ? 'एक्टिवेट' : 'Expired')
                  : (isHindi ? `ट्रायल ${trialStatus.daysRemaining}d` : `Trial ${trialStatus.daysRemaining}d`)}
              </span>
            </button>
          )}

          {/* + New Transaction Button */}
          {canCreateAnyQuickTx && (
            <button
              type="button"
              onClick={() => setShowMobileTxSheet(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 text-white hv-keep-white font-extrabold text-xs rounded-xl shadow-md shadow-indigo-600/30 border border-indigo-400/40 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-200" />
              <span>{isHindi ? '+ नया' : '+ New'}</span>
            </button>
          )}

          {/* Search Toggle */}
          <button
            type="button"
            onClick={() => {
              const next = !showMobileSearch;
              setShowMobileSearch(next);
              setShowMoreMenu(false);
              if (next) {
                setIsSearchFocused(true);
                setTimeout(() => mobileSearchInputRef.current?.focus(), 100);
              } else {
                setIsSearchFocused(false);
              }
            }}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              showMobileSearch ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500' : 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border-[var(--border-subtle)]'
            }`}
            title={isHindi ? 'खोजें' : 'Search'}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* User Manual / How-To Guide on Mobile */}
          {onOpenUserManual && (
            <button
              type="button"
              onClick={onOpenUserManual}
              className="p-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-sky-500 rounded-xl border border-[var(--border-subtle)] cursor-pointer"
              title={isHindi ? 'सॉफ़्टवेयर उपयोग गाइड (User Manual)' : 'User Manual / How to Use'}
              aria-label={isHindi ? 'उपयोग गाइड खोलें' : 'Open User Manual'}
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}

          {/* F12 Master Configure */}
          {canOpenConfig && (
            <button
              type="button"
              onClick={onOpenConfigureModal}
              className="p-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-amber-500 rounded-xl border border-[var(--border-subtle)] cursor-pointer"
              title="F12 Configure"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Language Switcher */}
          <button
            type="button"
            onClick={onToggleHindi}
            className="px-2.5 py-1.5 hv-pill-indigo rounded-xl border text-xs font-bold cursor-pointer"
          >
            {isHindi ? 'Eng' : 'हिंदी'}
          </button>

          {/* More Tools Modal Trigger on Mobile */}
          <button
            ref={mobileMoreBtnRef}
            type="button"
            aria-expanded={showMoreMenu}
            aria-label={isHindi ? 'सभी सेटिंग्स व और विकल्प' : 'More Settings and Options'}
            onClick={() => {
              setShowMoreMenu(prev => !prev);
              setShowMobileSearch(false);
              setShowMobileTxSheet(false);
            }}
            className={`p-2 rounded-xl border transition cursor-pointer ${
              showMoreMenu
                ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : 'bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]'
            }`}
            title={isHindi ? 'और विकल्प' : 'More Options'}
          >
            {showMoreMenu ? <X className="w-4 h-4" /> : <SlidersHorizontal className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ============================================================
          2. MAIN RESPONSIVE HEADER ROW (For md and larger screens)
          ============================================================ */}
      <div className="hidden md:flex items-center justify-between gap-2 w-full min-w-0">
        
        {/* SECTION 1: BRANDING & COMPANY BADGE */}
        <div className="flex items-center gap-2 min-w-0 shrink">
          <SnaLogo size="sm" showText={true} />

          <div className="h-5 w-[1px] bg-[var(--border-primary)] my-auto hidden lg:block shrink-0"></div>

          {/* Company Selector Button */}
          <button
            type="button"
            onClick={() => {
              if (rbac.canManageCompanies && onOpenCompanyManager) onOpenCompanyManager();
            }}
            disabled={!rbac.canManageCompanies}
            className={`font-bold text-[var(--text-primary)] text-xs lg:text-sm flex items-center gap-1.5 transition bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-xl border border-[var(--border-subtle)] shadow-sm group min-w-0 ${
              rbac.canManageCompanies ? 'hover:bg-[var(--hover-surface)] cursor-pointer' : 'cursor-default'
            }`}
            title={
              rbac.canManageCompanies
                ? (isHindi ? 'कंपनी बदलें या नई कंपनी बनाएँ' : 'Switch Company or Create New')
                : (isHindi ? 'केवल एडमिन नई कंपनी बना या बदल सकते हैं' : 'Only Admin can create or switch companies')
            }
          >
            <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="truncate max-w-[115px] lg:max-w-[155px] xl:max-w-[195px]">{data.company.name?.trim() || (isHindi ? 'कंपनी सेटअप करें' : 'Setup Company')}</span>
            {rbac.canManageCompanies && <Plus className="w-3.5 h-3.5 text-emerald-500 shrink-0 group-hover:scale-110 transition" />}
          </button>

          {/* Financial Year & Custom Period Switcher Dropdown */}
          <div className="relative shrink-0" ref={fyMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowFyMenu(prev => !prev);
                setShowTxMenu(false);
                setShowMoreMenu(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-mono font-extrabold transition shadow-sm cursor-pointer ${
                isCustomPeriodSelected || isAllYearsSelected
                  ? 'hv-pill-emerald'
                  : currentFyObj && currentFyObj.fyStart !== activeFyRange.fyStart
                    ? 'hv-pill-amber'
                    : 'hv-pill-indigo'
              }`}
              title={isHindi ? `सक्रिय अवधि: ${activeFyRange.displayRange} (बदलने या कस्टम पीरियड चुनने के लिए क्लिक करें)` : `Active Period: ${activeFyRange.displayRange} (Click to switch FY or Select Custom Period)`}
            >
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[115px] lg:max-w-[150px]">{activeFyRange.label}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform shrink-0 ${showFyMenu ? 'rotate-180' : ''}`} />
            </button>

            {showFyMenu && (
              <div className="absolute left-0 mt-2 w-[350px] max-h-[480px] overflow-y-auto bg-[var(--bg-surface)] backdrop-blur-2xl border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 p-3 space-y-2.5 animate-fadeIn">
                <div className="pb-2 border-b border-[var(--border-primary)]">
                  <div className="text-xs font-bold text-[var(--text-primary)] flex items-center justify-between gap-2">
                    <span>{isHindi ? 'वित्तीय वर्ष या कस्टम पीरियड चुनें' : 'Select Financial Year / Period'}</span>
                    <span className="text-[11px] font-mono text-amber-500 truncate max-w-[140px] font-bold">{activeFyRange.shortLabel}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-0.5 font-sans">
                    {isHindi
                      ? 'नीचे से एकल FY चुनें या कस्टम पीरियड (किस FY से किस FY तक / कस्टम तारीख) सेट करें।'
                      : 'Choose a single FY below or Select Custom Period (From FY → To FY or Exact Dates).'}
                  </p>
                </div>

                {/* Custom Period Selector (Replaces All Years Combined) */}
                <div className="hv-pill-emerald border rounded-xl p-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'कस्टम पीरियड चुनें' : 'Select Period'}</span>
                    </span>
                    <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-0.5 rounded-lg border border-[var(--border-primary)]">
                      <button
                        type="button"
                        onClick={() => setCustomPeriodMode('FY')}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                          customPeriodMode === 'FY' ? 'bg-emerald-600 text-white hv-keep-white shadow' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {isHindi ? 'FY से FY' : 'FY → FY'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustomPeriodMode('DATES')}
                        className={`px-2 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                          customPeriodMode === 'DATES' ? 'bg-emerald-600 text-white hv-keep-white shadow' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                        }`}
                      >
                        {isHindi ? 'कस्टम दिनांक' : 'Custom Dates'}
                      </button>
                    </div>
                  </div>

                  {customPeriodMode === 'FY' ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">
                            {isHindi ? 'किस वित्तीय वर्ष से (From FY)' : 'From Financial Year'}
                          </label>
                          <select
                            value={customFromFy}
                            onChange={(e) => setCustomFromFy(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] font-bold cursor-pointer focus:outline-none focus:border-emerald-500"
                          >
                            {fyListAsc.map((fy) => (
                              <option key={fy.fyStart} value={fy.fyStart}>{fy.label} ({fy.count})</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">
                            {isHindi ? 'किस वित्तीय वर्ष तक (To FY)' : 'To Financial Year'}
                          </label>
                          <select
                            value={customToFy}
                            onChange={(e) => setCustomToFy(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] font-bold cursor-pointer focus:outline-none focus:border-emerald-500"
                          >
                            {fyListAsc.map((fy) => (
                              <option key={fy.fyStart} value={fy.fyStart}>{fy.label} ({fy.count})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeFinancialYear?.(buildFYRangeToken(customFromFy, customToFy));
                          setShowFyMenu(false);
                        }}
                        className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-extrabold shadow-md shadow-emerald-600/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'चयनित FY पीरियड लागू करें' : 'Apply Selected Period (FY → FY)'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">
                            {isHindi ? 'प्रारंभ तिथि (From)' : 'From Date'}
                          </label>
                          <input
                            type="date"
                            value={customFromDate}
                            onChange={(e) => setCustomFromDate(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-[var(--text-secondary)] block mb-1">
                            {isHindi ? 'अंतिम तिथि (To)' : 'To Date'}
                          </label>
                          <input
                            type="date"
                            value={customToDate}
                            onChange={(e) => setCustomToDate(e.target.value)}
                            className="w-full bg-[var(--bg-input)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-xs font-mono text-[var(--text-primary)] focus:outline-none focus:border-emerald-500"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onChangeFinancialYear?.(buildDateRangeToken(customFromDate, customToDate));
                          setShowFyMenu(false);
                        }}
                        className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white text-xs font-extrabold shadow-md shadow-emerald-600/25 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'कस्टम दिनांक अवधि लागू करें' : 'Apply Custom Date Period'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Single Financial Year Quick List */}
                <div className="space-y-1">
                  <div className="px-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                    {isHindi ? 'एकल वित्तीय वर्ष (Single FY Quick Switch)' : 'Single Financial Year'}
                  </div>
                  {fyList.map((fy) => {
                    const isActive = !isCustomPeriodSelected && !isAllYearsSelected && fy.fyStart === activeFyRange.fyStart;
                    return (
                      <button
                        key={fy.fyStart}
                        type="button"
                        onClick={() => {
                          onChangeFinancialYear?.(fy.fyStart);
                          setShowFyMenu(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between text-xs transition cursor-pointer ${
                          isActive
                            ? 'bg-indigo-600 text-white hv-keep-white font-bold shadow-md'
                            : 'hover:bg-[var(--hover-surface)] text-[var(--text-primary)]'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 shrink-0" />
                          <div>
                            <div className="flex items-center gap-1.5 font-bold">
                              <span>{fy.label}</span>
                              {fy.isCurrent && (
                                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${isActive ? 'bg-white/20 text-white border-white/30' : 'hv-pill-emerald'}`}>
                                  {isHindi ? 'चालू वर्ष' : 'Current'}
                                </span>
                              )}
                            </div>
                            <div className={`text-[10px] font-mono ${isActive ? 'text-indigo-100' : 'text-[var(--text-muted)]'}`}>
                              {fy.fyStart} → {fy.fyEnd}
                            </div>
                          </div>
                        </div>
                        <span className={`text-[11px] font-mono px-2 py-0.5 rounded-lg ${isActive ? 'bg-white/20 text-white' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-primary)]'}`}>
                          {fy.count} {isHindi ? 'प्रविष्टि' : 'txns'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SECTION 2: GLOBAL SEARCH BAR (FLEXIBLE & COMPACT) */}
        <div className="flex-1 min-w-[130px] max-w-[240px] lg:max-w-xs xl:max-w-sm mx-1 relative" ref={searchContainerRef}>
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-[var(--text-muted)] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder={isHindi ? 'इनवॉइस, पार्टी, सामग्री, खाता खोजें...' : 'Search Invoices, Parties, Items, Ledgers...'}
              className="w-full bg-[var(--bg-elevated)] text-[var(--text-primary)] text-sm rounded-xl pl-9 pr-12 py-1.5 border border-[var(--border-subtle)] focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition shadow-inner"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded cursor-pointer"
                title={isHindi ? 'सर्च हटाएं' : 'Clear search'}
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <span className="absolute right-2.5 text-[11px] text-[var(--text-muted)] font-mono bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] pointer-events-none hidden xl:inline">
                Ctrl+K
              </span>
            )}
          </div>

          {/* Live Search Results Dropdown Overlay */}
          {isSearchFocused && cleanQuery.length > 0 && renderSearchResultsDropdown(false)}
        </div>

        {/* SECTION 3: TOP RIGHT EXECUTIVE COMMAND HUB (CLEAN, NON-DUPLICATE & FIT TO SCREEN) */}
        <div className="flex items-center gap-1.5 justify-end text-sm shrink-0">

          {/* 3.1 PRIMARY ACTION: TRANSACTIONS DROPDOWN (+ लेन-देन) */}
          {canCreateAnyQuickTx && (
            <div className="relative" ref={txMenuRef}>
              <button
                type="button"
                onClick={() => {
                  setShowTxMenu(!showTxMenu);
                  setShowMoreMenu(false);
                }}
                className="flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 hover:from-indigo-500 hover:to-indigo-400 text-white hv-keep-white font-extrabold text-xs lg:text-sm rounded-xl shadow-md shadow-indigo-600/30 border border-indigo-400/50 transition-all cursor-pointer whitespace-nowrap"
                title={isHindi ? 'नया लेन-देन दर्ज करें (इनवॉइस, जर्नल, पेमेंट, रसीद)' : 'Create New Transaction (Invoice, Journal, Payment, Receipt)'}
              >
                <Plus className="w-4 h-4 text-amber-200 shrink-0" />
                <span>{isHindi ? '+ लेन-देन' : '+ Transactions'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showTxMenu ? 'rotate-180' : ''}`} />
              </button>

              {showTxMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-[var(--bg-surface)] backdrop-blur-2xl border border-[var(--border-subtle)] rounded-2xl shadow-2xl z-50 p-2 space-y-1 animate-fadeIn">
                  <div className="px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider border-b border-[var(--border-primary)] flex items-center justify-between">
                    <span>{isHindi ? 'त्वरित वाउचर निर्माण' : 'Quick Voucher'}</span>
                    <span className="text-amber-500 font-mono text-[11px] font-bold">F5 - F8</span>
                  </div>
                  
                  {rbac.canCreateEditTransactions && (
                    <>
                      <button
                        onClick={() => {
                          onOpenQuickModal('invoice');
                          setShowTxMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--hover-surface)] rounded-xl flex items-center gap-3 text-sm text-[var(--text-primary)] font-semibold transition cursor-pointer"
                      >
                        <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div>
                          <div className="font-bold">{isHindi ? 'सेल इनवॉइस' : 'Sales Invoice'}</div>
                          <div className="text-xs text-[var(--text-muted)] font-normal">{isHindi ? 'जीएसटी बिल/इनवॉइस (F8)' : 'Tax Invoice (F8)'}</div>
                        </div>
                      </button>

                      {onNavigateTab && posEnabled && (
                        <button
                          onClick={() => {
                            onNavigateTab('pos');
                            setShowTxMenu(false);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[var(--hover-surface)] rounded-xl flex items-center gap-3 text-sm text-[var(--text-primary)] font-semibold transition cursor-pointer"
                        >
                          <ScanBarcode className="w-4 h-4 text-cyan-500 shrink-0" />
                          <div>
                            <div className="font-bold">{isHindi ? 'बारकोड POS बिलिंग' : 'Barcode POS Billing'}</div>
                            <div className="text-xs text-[var(--text-muted)] font-normal">{isHindi ? 'काउंटर स्कैनर टर्मिनल' : 'High-Speed Counter POS'}</div>
                          </div>
                        </button>
                      )}
                    </>
                  )}

                  {rbac.canCreateEditVouchers && (
                    <>
                      <button
                        onClick={() => {
                          onOpenQuickModal('journal');
                          setShowTxMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--hover-surface)] rounded-xl flex items-center gap-3 text-sm text-[var(--text-primary)] font-semibold transition cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
                        <div>
                          <div className="font-bold">{isHindi ? 'जर्नल एंट्री' : 'Journal Entry'}</div>
                          <div className="text-xs text-[var(--text-muted)] font-normal">{isHindi ? 'एडजस्टमेंट वाउचर (F7)' : 'Adjustment Entry (F7)'}</div>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          onOpenQuickModal('payment');
                          setShowTxMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--hover-surface)] rounded-xl flex items-center gap-3 text-sm text-[var(--text-primary)] font-semibold transition cursor-pointer"
                      >
                        <CreditCard className="w-4 h-4 text-rose-500 shrink-0" />
                        <div>
                          <div className="font-bold">{isHindi ? 'पेमेंट वाउचर' : 'Payment Entry'}</div>
                          <div className="text-xs text-[var(--text-muted)] font-normal">{isHindi ? 'सप्लायर/खर्च भुगतान (F5)' : 'Supplier Payouts (F5)'}</div>
                        </div>
                      </button>

                      <button
                        onClick={() => {
                          onOpenQuickModal('receipt');
                          setShowTxMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-[var(--hover-surface)] rounded-xl flex items-center gap-3 text-sm text-[var(--text-primary)] font-semibold transition cursor-pointer"
                      >
                        <Receipt className="w-4 h-4 text-sky-500 shrink-0" />
                        <div>
                          <div className="font-bold">{isHindi ? 'रसीद वाउचर' : 'Receipt Entry'}</div>
                          <div className="text-xs text-[var(--text-muted)] font-normal">{isHindi ? 'भुगतान प्राप्ति (F6)' : 'Customer Inflow (F6)'}</div>
                        </div>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3.2 F12 MASTER CONFIGURE BUTTON */}
          {canOpenConfig && (
            <button
              type="button"
              onClick={onOpenConfigureModal}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 hv-pill-amber border rounded-xl text-xs lg:text-sm font-bold transition shadow-sm cursor-pointer whitespace-nowrap hover:brightness-95"
              title={isHindi ? 'F12 मास्टर कॉन्फ़िगरेशन सेटिंग्स (F12 दबाएं)' : 'F12 Master Configuration (Press F12)'}
            >
              <Settings className="w-3.5 h-3.5 shrink-0" />
              <span>{isHindi ? 'कॉन्फ़िगर' : 'Configure'}</span>
              <span className="px-1 py-0.2 bg-black/10 rounded text-[10px] font-mono font-bold hidden lg:inline">
                F12
              </span>
            </button>
          )}

          {/* 3.2b NON-INTRUSIVE FREE TRIAL UPGRADE / ACTIVATE BADGE */}
          {trialStatus && !trialStatus.isLicensed && (
            <button
              type="button"
              onClick={onOpenLicenseModal}
              className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-[11px] lg:text-xs font-extrabold transition shadow-sm cursor-pointer whitespace-nowrap shrink-0 hover:brightness-95 ${
                trialStatus.isTrialExpired || trialStatus.clockTampered || trialStatus.vaultTampered || trialStatus.machineMismatch
                  ? 'hv-pill-rose'
                  : 'hv-pill-amber'
              }`}
              title={
                trialStatus.isTrialExpired
                  ? (isHindi ? 'ट्रायल समाप्त — कमर्शियल लाइसेंस एक्टिवेट करें' : 'Free Trial Expired — Activate License')
                  : (isHindi
                      ? `फ्री ट्रायल: ${trialStatus.daysRemaining} दिन शेष — लाइसेंस एक्टिवेट करें`
                      : `Free Trial: ${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'Day' : 'Days'} Left — Activate License`)
              }
            >
              <KeyRound className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden xl:inline">
                {trialStatus.isTrialExpired
                  ? (isHindi ? 'ट्रायल समाप्त — लाइसेंस एक्टिवेट करें' : 'Trial Expired — Activate License')
                  : (isHindi
                      ? `फ्री ट्रायल: ${trialStatus.daysRemaining} दिन शेष — लाइसेंस एक्टिवेट करें`
                      : `Free Trial: ${trialStatus.daysRemaining} ${trialStatus.daysRemaining === 1 ? 'Day' : 'Days'} Left — Activate License`)}
              </span>
              <span className="xl:hidden">
                {trialStatus.isTrialExpired
                  ? (isHindi ? 'ट्रायल समाप्त' : 'Activate')
                  : (isHindi ? `ट्रायल: ${trialStatus.daysRemaining} दिन` : `Free Trial: ${trialStatus.daysRemaining}d — Activate`)}
              </span>
            </button>
          )}

          {/* 3.3 CLOUD LIVE SYNC / LOCAL MODE STATUS PILL */}
          <button
            type="button"
            onClick={onOpenCloudSyncModal || onRefreshData}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition cursor-pointer text-xs lg:text-sm font-bold shadow-sm whitespace-nowrap hover:brightness-95 ${
              cloudSyncStatus === 'local'
                ? 'hv-pill-amber'
                : cloudSyncStatus === 'error'
                  ? 'hv-pill-rose'
                  : 'hv-pill-emerald'
            }`}
            title={
              cloudSyncStatus === 'local'
                ? (isHindi ? 'पर्सनल डिवाइस मोड (केवल इसी डिवाइस में डेटा सुरक्षित)' : 'Personal Device Only Mode (100% Local Storage)')
                : (isHindi ? 'मल्टी-सिस्टम क्लाउड लाइव सिंक (क्लिक करके मोड बदलें)' : 'Multi-System Cloud Live Sync (Click to configure)')
            }
          >
            <Cloud className="w-4 h-4 shrink-0" />
            <span className="hidden 2xl:inline">
              {cloudSyncStatus === 'local'
                ? (isHindi ? 'डिवाइस मोड' : 'Local Only')
                : (isHindi ? 'क्लाउड सिंक' : 'Cloud Sync')}
            </span>
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              cloudSyncStatus === 'local'
                ? 'bg-amber-500 ring-2 ring-amber-400/35'
                : cloudSyncStatus === 'error'
                  ? 'bg-rose-500 ring-2 ring-rose-400/35'
                  : 'bg-emerald-500 ring-2 ring-emerald-400/35 animate-pulse'
            }`} />
          </button>

          {/* 3.4 LANGUAGE SWITCHER */}
          <button
            onClick={onToggleHindi}
            className="flex items-center gap-1 text-xs lg:text-sm hv-pill-indigo px-2.5 py-1.5 rounded-xl border transition cursor-pointer font-bold whitespace-nowrap shrink-0 hover:brightness-95"
            title={isHindi ? 'Switch to English' : 'हिंदी भाषा में बदलें'}
          >
            <Globe2 className="w-3.5 h-3.5 shrink-0" />
            <span>{isHindi ? 'Eng' : 'हिंदी'}</span>
          </button>

          {/* 3.6 USER PROFILE PILL */}
          <button
            onClick={onOpenUserModal}
            className="px-2.5 py-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] rounded-xl font-bold text-xs lg:text-sm flex items-center gap-1.5 text-[var(--text-primary)] transition cursor-pointer shadow-sm whitespace-nowrap shrink-0"
            title={isHindi ? `सक्रिय भूमिका: ${roleMeta.labelHi}` : `Active Role: ${roleMeta.labelEn}`}
          >
            <div className="w-5 h-5 rounded-lg bg-indigo-600 text-white hv-keep-white flex items-center justify-center text-xs font-bold shrink-0">
              {activeUser ? activeUser.name.charAt(0).toUpperCase() : 'A'}
            </div>
            <span className="hidden xl:inline font-semibold max-w-[90px] truncate">{activeUser ? activeUser.name.split(' ')[0] : 'Admin'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold border ${roleMeta.badgeColor}`}>
              {effectiveRole}
            </span>
          </button>

          {/* ============================================================
              3.7 "MORE TOOLS & SETTINGS" EXECUTIVE DROPDOWN TRIGGER
              ============================================================ */}
          <div className="relative shrink-0">
            <button
              ref={desktopMoreBtnRef}
              type="button"
              aria-expanded={showMoreMenu}
              onClick={() => {
                setShowMoreMenu(prev => !prev);
                setShowTxMenu(false);
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border font-bold text-xs lg:text-sm transition cursor-pointer shadow-sm whitespace-nowrap ${
                showMoreMenu 
                  ? 'bg-indigo-600 text-white hv-keep-white border-indigo-500 shadow-indigo-600/30' 
                  : 'bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] border-[var(--border-subtle)]'
              }`}
              title={isHindi ? 'सभी सेटिंग्स व अन्य विकल्प (Display Zoom, Guide, Shortcuts, Backup, PIN, License)' : 'All Settings & Tools (Display Zoom, Guide, Shortcuts, Backup, PIN, License)'}
            >
              <SlidersHorizontal className={`w-4 h-4 shrink-0 ${showMoreMenu ? 'text-white' : 'text-indigo-500'}`} />
              <span>{isHindi ? 'विकल्प' : 'More'}</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showMoreMenu ? 'rotate-180' : ''}`} />
            </button>
          </div>

        </div>
      </div>

      {/* ============================================================
          3.8 SHARED "MORE TOOLS & SETTINGS" PANEL (Works on Mobile & Desktop!)
          ============================================================ */}
      {showMoreMenu && (
        <>
          {/* Mobile Backdrop below Header */}
          <div
            onClick={() => setShowMoreMenu(false)}
            className="md:hidden absolute top-full left-0 right-0 h-[100dvh] bg-slate-950/70 backdrop-blur-sm z-40"
          />

          <div
            ref={morePanelRef}
            className="absolute top-full left-3 right-3 mt-2 md:left-auto md:right-5 md:w-96 bg-[var(--bg-surface)] backdrop-blur-2xl border border-[var(--border-subtle)] rounded-3xl shadow-2xl z-50 p-4 space-y-4 animate-fadeIn text-sm max-h-[calc(100dvh-5.5rem)] overflow-y-auto text-[var(--text-primary)]"
          >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4.5 h-4.5 text-indigo-500" />
                    <div>
                      <h3 className="font-extrabold text-sm text-[var(--text-primary)]">
                        {isHindi ? 'सॉफ्टवेयर टूल्स एवं सेटिंग्स' : 'ERP Settings & Control Center'}
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        {isHindi ? 'स्क्रीन, सुरक्षा, बैकअप और टूल्स' : 'Display, Security & Utilities'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowMoreMenu(false)}
                    className="p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--hover-surface)] rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 1. DISPLAY & SCALE CONTROLS */}
                <div className="space-y-2 bg-[var(--bg-elevated)] p-3 rounded-2xl border border-[var(--border-primary)]">
                  <div className="flex items-center justify-between text-xs font-bold text-[var(--text-secondary)]">
                    <span className="flex items-center gap-1.5 text-indigo-500">
                      <Eye className="w-4 h-4" />
                      <span>{isHindi ? 'स्क्रीन ज़ूम एवं व्यू (Display Scale)' : 'Display & Screen Scale'}</span>
                    </span>
                    <span className="font-mono text-amber-500 text-xs font-bold">{zoomLevel}%</span>
                  </div>

                  {onUpdateZoom && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between bg-[var(--bg-surface)] p-1.5 rounded-xl border border-[var(--border-primary)]">
                        <button
                          type="button"
                          onClick={() => {
                            const idx = zoomOptions.indexOf(zoomLevel);
                            if (idx > 0) onUpdateZoom(zoomOptions[idx - 1]);
                            else if (zoomLevel > 25) onUpdateZoom(Math.max(25, zoomLevel - 10));
                          }}
                          className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] rounded-lg border border-[var(--border-primary)] transition font-bold cursor-pointer"
                          title={isHindi ? 'छोटा करें (-)' : 'Zoom Out (-)'}
                        >
                          <ZoomOut className="w-4 h-4 text-amber-500" />
                        </button>

                        <select
                          value={zoomLevel}
                          onChange={(e) => onUpdateZoom(Number(e.target.value))}
                          className="bg-transparent text-amber-500 font-mono font-bold focus:outline-none cursor-pointer text-xs"
                        >
                          {zoomOptions.map((z) => (
                            <option key={z} value={z} className="bg-[var(--bg-surface)] text-[var(--text-primary)]">
                              {z}% View
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => {
                            const idx = zoomOptions.indexOf(zoomLevel);
                            if (idx >= 0 && idx < zoomOptions.length - 1) onUpdateZoom(zoomOptions[idx + 1]);
                            else if (zoomLevel < 200) onUpdateZoom(Math.min(200, zoomLevel + 10));
                          }}
                          className="p-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] rounded-lg border border-[var(--border-primary)] transition font-bold cursor-pointer"
                          title={isHindi ? 'बड़ा करें (+)' : 'Zoom In (+)'}
                        >
                          <ZoomIn className="w-4 h-4 text-amber-500" />
                        </button>
                      </div>

                      {/* Quick Presets */}
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onUpdateZoom(100)}
                          className={`py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            zoomLevel === 100 
                              ? 'bg-indigo-600 text-white hv-keep-white border-indigo-400 shadow' 
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--hover-surface)]'
                          }`}
                        >
                          100% Normal
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateZoom(115)}
                          className={`py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            zoomLevel === 115 
                              ? 'bg-indigo-600 text-white hv-keep-white border-indigo-400 shadow' 
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--hover-surface)]'
                          }`}
                        >
                          115% Medium
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateZoom(130)}
                          className={`py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                            zoomLevel === 130 
                              ? 'bg-indigo-600 text-white hv-keep-white border-indigo-400 shadow' 
                              : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--hover-surface)]'
                          }`}
                        >
                          130% Large
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Fullscreen Mode Toggle */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        toggleFullscreen();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] text-xs text-[var(--text-primary)] font-semibold transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        {isFullscreen ? <Minimize className="w-4 h-4 text-amber-500" /> : <Maximize className="w-4 h-4 text-indigo-500" />}
                        <span>{isFullscreen ? (isHindi ? 'फुलस्क्रीन बंद करें' : 'Exit Fullscreen') : (isHindi ? 'फुलस्क्रीन मोड चालू करें' : 'Enter Fullscreen Mode')}</span>
                      </span>
                      <span className="text-[11px] font-mono text-[var(--text-muted)] bg-[var(--bg-elevated)] px-1.5 py-0.5 rounded border border-[var(--border-primary)]">F11</span>
                    </button>
                  </div>

                  {/* Theme Color Switcher */}
                  {onUpdateTheme && (
                    <div className="pt-2 border-t border-[var(--border-primary)] space-y-1">
                      <label className="text-xs text-[var(--text-secondary)] font-semibold flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-indigo-500" />
                        <span>{isHindi ? 'थीम रंग (Theme Mode):' : 'Color Theme:'}</span>
                      </label>
                      <select
                        value={theme}
                        onChange={(e) => onUpdateTheme(e.target.value as AppTheme)}
                        className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] font-bold border border-[var(--border-subtle)] rounded-xl p-2 text-xs focus:outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="slate">Dark Slate (डार्क स्लेट - मानक)</option>
                        <option value="navy">Midnight Navy (मिडनाइट नेवी)</option>
                        <option value="emerald">Forest Emerald (फॉरेस्ट एमराल्ड)</option>
                        <option value="purple">Cyber Purple (साइबर पर्पल)</option>
                        <option value="light">Classic Light ERP (क्लासिक लाइट)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* 2. CURRENCY & DATA BACKUP */}
                <div className="space-y-2 bg-[var(--bg-elevated)] p-3 rounded-2xl border border-[var(--border-primary)]">
                  <div className="text-xs font-bold text-amber-500 flex items-center gap-1.5">
                    <Coins className="w-4 h-4" />
                    <span>{isHindi ? 'मुद्रा व बैकअप प्रबंधन' : 'Currency & Data Management'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* Currency Dropdown */}
                    <div className="bg-[var(--bg-surface)] p-2 rounded-xl border border-[var(--border-primary)]">
                      <span className="text-[11px] text-[var(--text-muted)] block mb-1 font-semibold">
                        {isHindi ? 'मुद्रा (Currency):' : 'Currency:'}
                      </span>
                      <select
                        value={data.company.currency}
                        disabled={!rbac.canEditCompanySettings}
                        onChange={(e) => {
                          if (rbac.canEditCompanySettings) onUpdateCurrency(e.target.value as Currency);
                        }}
                        className="w-full bg-transparent text-amber-500 font-bold focus:outline-none cursor-pointer text-xs disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="INR" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">INR (₹)</option>
                        <option value="USD" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">USD ($)</option>
                        <option value="AED" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">AED (د.إ)</option>
                        <option value="EUR" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">EUR (€)</option>
                        <option value="GBP" className="bg-[var(--bg-surface)] text-[var(--text-primary)]">GBP (£)</option>
                      </select>
                    </div>

                    {/* Data Refresh */}
                    {onRefreshData && (
                      <button
                        type="button"
                        onClick={() => {
                          onRefreshData();
                          setShowMoreMenu(false);
                        }}
                        className="flex flex-col items-start justify-center bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] p-2 rounded-xl border border-[var(--border-primary)] transition text-left cursor-pointer"
                      >
                        <span className="text-[11px] text-[var(--text-muted)] font-semibold">{isHindi ? 'डेटा रिफ्रेश' : 'Refresh Data'}</span>
                        <span className="text-xs font-bold text-indigo-500 flex items-center gap-1 mt-0.5">
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'सिंक करें' : 'Sync Now'}</span>
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Backup & Restore Button */}
                  {rbac.canUseAdminBackup && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenBackupModal();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] text-xs font-bold text-[var(--text-primary)] transition cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Download className="w-4 h-4 text-emerald-500" />
                        <span>{isHindi ? 'डेटा सुरक्षित बैकअप व रिस्टोर' : 'Backup & Restore Database'}</span>
                      </span>
                      <span className="text-[11px] text-emerald-500 font-mono">.json / zip</span>
                    </button>
                  )}
                </div>

                {/* 3. SECURITY & LICENSING */}
                {rbac.canManageUsersAndPin && (
                  <div className="space-y-2 bg-[var(--bg-elevated)] p-3 rounded-2xl border border-[var(--border-primary)]">
                    <div className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      <span>{isHindi ? 'सुरक्षा एवं लाइसेंस स्थिति' : 'Security & License Status'}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {/* License Modal Trigger */}
                      <button
                        type="button"
                        onClick={() => {
                          onOpenLicenseModal();
                          setShowMoreMenu(false);
                        }}
                        className={`p-2.5 rounded-xl border flex flex-col items-start justify-center transition cursor-pointer hover:brightness-95 ${
                          data.license?.isLicensed
                            ? 'hv-pill-emerald'
                            : 'hv-pill-amber'
                        }`}
                      >
                        <span className="text-[11px] font-semibold">{isHindi ? 'लाइसेंस स्टेटस:' : 'License:'}</span>
                        <span className="text-xs font-extrabold flex items-center gap-1 mt-0.5">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>
                            {trialStatus?.isLicensed
                              ? 'PRO ACTIVE'
                              : trialStatus
                                ? (isHindi ? `ट्रायल (${trialStatus.daysRemaining}d शेष)` : `Free Trial (${trialStatus.daysRemaining}d Left)`)
                                : (data.license?.isLicensed ? 'PRO ACTIVE' : (isHindi ? 'ट्रायल' : 'TRIAL'))}
                          </span>
                        </span>
                      </button>

                      {/* Master PIN Settings */}
                      <button
                        type="button"
                        onClick={() => {
                          if (onOpenMasterPinModal) onOpenMasterPinModal();
                          else onOpenSecurityModal();
                          setShowMoreMenu(false);
                        }}
                        className="p-2.5 rounded-xl bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] flex flex-col items-start justify-center text-[var(--text-primary)] transition cursor-pointer"
                      >
                        <span className="text-[11px] text-[var(--text-muted)] font-semibold">{isHindi ? 'मास्टर पिन:' : 'Master PIN:'}</span>
                        <span className="text-xs font-bold text-amber-500 flex items-center gap-1 mt-0.5">
                          <KeyRound className="w-3.5 h-3.5" />
                          <span>{isHindi ? 'पिन बदलें' : 'Change PIN'}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 4. FEATURES, SHORTCUTS, MOBILE APP & PREVIEW */}
                <div className="space-y-1.5 pt-1">
                  {canOpenConfig && (onOpenFeaturesModal || onOpenConfigureModal) && (
                    <button
                      type="button"
                      onClick={() => {
                        if (onOpenFeaturesModal) onOpenFeaturesModal();
                        else if (onOpenConfigureModal) onOpenConfigureModal();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hv-pill-cyan border text-xs font-bold transition cursor-pointer hover:brightness-95"
                    >
                      <span className="flex items-center gap-2">
                        <ToggleRight className="w-4 h-4" />
                        <span>{isHindi ? '⚡ सॉफ्टवेयर फीचर्स ऑन/ऑफ (POS, No-Inventory)' : '⚡ Enable / Disable Features (POS, Accounts-Only)'}</span>
                      </span>
                      <span className="text-[10px] font-mono bg-black/10 px-2 py-0.5 rounded border border-current/25">
                        {effectiveConfig.accountingWithoutInventory ? 'ACC ONLY' : 'F12'}
                      </span>
                    </button>
                  )}

                  {onOpenUserManual && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenUserManual();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hv-pill-sky border text-xs font-bold transition cursor-pointer hover:brightness-95"
                    >
                      <span className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4" />
                        <span>{isHindi ? 'उपयोगकर्ता गाइड (User Manual / How-To)' : 'User Manual & Step-by-Step Guide'}</span>
                      </span>
                      <span className="text-[11px] font-mono bg-black/10 px-2 py-0.5 rounded border border-current/25">
                        {isHindi ? 'गाइड' : 'Help'}
                      </span>
                    </button>
                  )}

                  {onOpenShortcutsModal && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenShortcutsModal();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hv-pill-indigo border text-xs font-bold transition cursor-pointer hover:brightness-95"
                    >
                      <span className="flex items-center gap-2">
                        <Keyboard className="w-4 h-4" />
                        <span>{isHindi ? '⌨️ कीबोर्ड शॉर्टकट गाइड (Alt+K / ?)' : 'Keyboard Shortcuts Guide (Alt+K / ?)'}</span>
                      </span>
                      <span className="text-[11px] font-mono bg-black/10 px-2 py-0.5 rounded border border-current/25">
                        Alt+K
                      </span>
                    </button>
                  )}

                  {onOpenMobileModal && !isDesktopApp && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenMobileModal();
                        setShowMoreMenu(false);
                      }}
                      className="w-full flex items-center justify-between p-2.5 rounded-xl hv-pill-emerald border text-xs font-bold transition cursor-pointer hover:brightness-95"
                    >
                      <span className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        <span>{isHindi ? '🖥️📱 डेस्कटॉप व मोबाइल ऐप इंस्टॉल (Logo Shortcut)' : 'Install App (Desktop Shortcut & Mobile)'}</span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 5. SYSTEM ACTIONS & LOGOUT */}
                <div className="pt-2 border-t border-[var(--border-primary)] flex items-center justify-between gap-2">
                  {rbac.canResetWorkspace ? (
                    <button
                      type="button"
                      onClick={() => {
                        onResetSampleData();
                        setShowMoreMenu(false);
                      }}
                      className="p-2 text-[var(--text-secondary)] hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      title={isHindi ? 'डेमो डेटा रीसेट करें' : 'Reset Sample Data'}
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                      <span>{isHindi ? 'डेमो रीसेट' : 'Reset Demo'}</span>
                    </button>
                  ) : (
                    <span className={`text-[11px] font-mono px-2 py-1 rounded border ${roleMeta.badgeColor}`}>
                      {effectiveRole}
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setShowMoreMenu(false);
                      if (onLogout) onLogout();
                      else onLockSession();
                    }}
                    className="px-3 py-1.5 hv-pill-rose hover:!bg-rose-600 hover:!text-white rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'लॉगआउट' : 'Logout Session'}</span>
                  </button>
                </div>
          </div>
        </>
      )}

      {/* ============================================================
          5. MOBILE SEARCH OVERLAY (When search icon clicked on mobile)
          ============================================================ */}
      {showMobileSearch && (
        <div ref={mobileSearchContainerRef} className="md:hidden mt-2 pt-2 border-t border-[var(--border-primary)]">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 absolute left-3 text-[var(--text-muted)] pointer-events-none" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
              placeholder={isHindi ? 'इनवॉइस, पार्टी, सामग्री, खाता खोजें...' : 'Search Invoices, Parties, Items, Ledgers...'}
              className="w-full bg-[var(--bg-input)] text-[var(--text-primary)] text-sm rounded-xl pl-9 pr-9 py-2 border border-[var(--border-subtle)] focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  mobileSearchInputRef.current?.focus();
                }}
                className="absolute right-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {isSearchFocused && cleanQuery.length > 0 && renderSearchResultsDropdown(true)}
        </div>
      )}

    </header>

      {/* ============================================================
          4. MOBILE TRANSACTION BOTTOM SHEET MODAL
          ============================================================ */}
      {showMobileTxSheet && (
        <div className="fixed inset-0 z-[70] bg-slate-950/85 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-4 animate-fadeIn">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-3xl p-5 w-full max-w-sm shadow-2xl space-y-3.5 text-[var(--text-primary)]">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl hv-pill-indigo border">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">{isHindi ? 'त्वरित नया लेन-देन दर्ज करें' : 'Quick Create Transaction'}</h3>
                  <p className="text-xs text-[var(--text-muted)]">{isHindi ? 'वाउचर या इनवॉइस चुनें' : 'Select Voucher or Invoice'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMobileTxSheet(false)}
                className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-xl hover:bg-[var(--hover-surface)] cursor-pointer"
              >
                <X className="w-5 h-5 text-rose-500" />
              </button>
            </div>

            <div className="space-y-2 pt-1">
              {rbac.canCreateEditTransactions && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenQuickModal('invoice');
                    setShowMobileTxSheet(false);
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-left transition cursor-pointer"
                >
                  <div className="p-2.5 rounded-xl hv-pill-emerald border shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-[var(--text-primary)]">{isHindi ? 'सेल इनवॉइस (Sales Invoice)' : 'Sales Invoice (F8)'}</div>
                    <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'नया जीएसटी टैक्स इनवॉइस बनाएँ' : 'Create Tax Invoice & e-Way Bill'}</div>
                  </div>
                </button>
              )}

              {rbac.canCreateEditVouchers && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenQuickModal('journal');
                      setShowMobileTxSheet(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-left transition cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl hv-pill-amber border shrink-0">
                      <BookOpen className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[var(--text-primary)]">{isHindi ? 'जर्नल एंट्री (Journal Entry)' : 'Journal Entry (F7)'}</div>
                      <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'डेबिट / क्रेडिट समायोजन वाउचर' : 'Adjustment & Non-Cash Entries'}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onOpenQuickModal('payment');
                      setShowMobileTxSheet(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-left transition cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl hv-pill-rose border shrink-0">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[var(--text-primary)]">{isHindi ? 'पेमेंट वाउचर (Payment Entry)' : 'Payment Entry (F5)'}</div>
                      <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'सप्लायर या खर्चों का भुगतान' : 'Supplier & Expense Payouts'}</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onOpenQuickModal('receipt');
                      setShowMobileTxSheet(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-left transition cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl hv-pill-sky border shrink-0">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-sm text-[var(--text-primary)]">{isHindi ? 'रसीद वाउचर (Receipt Entry)' : 'Receipt Entry (F6)'}</div>
                      <div className="text-xs text-[var(--text-muted)]">{isHindi ? 'ग्राहकों से भुगतान वसूली' : 'Customer Payment Collection'}</div>
                    </div>
                  </button>
                </>
              )}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowMobileTxSheet(false)}
                className="w-full py-2.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl text-xs font-bold cursor-pointer"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
