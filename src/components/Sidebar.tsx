import React, { useRef, useState } from 'react';
import { 
  LayoutDashboard, 
  Receipt, 
  ShoppingBag,
  BookOpen, 
  Landmark, 
  FileCheck2, 
  Package, 
  Users, 
  Settings, 
  FileSpreadsheet,
  ArrowRightLeft,
  PieChart,
  PiggyBank,
  ShieldCheck,
  Database,
  Menu,
  X,
  Search,
  Check,
  Sparkles,
  ScanBarcode,
  ToggleRight,
  KeyRound
} from 'lucide-react';
import { SnaLogo } from './SnaLogo';
import { UserRole } from '../types';
import { canAccessTab, normalizeUserRole, ROLE_METADATA } from '../utils/rbac';
import { AppConfiguration, isNavTabEnabled, loadAppConfig } from '../utils/appConfig';

export type NavTab = 
  | 'dashboard'
  | 'pos'
  | 'invoices'
  | 'purchases'
  | 'vouchers'
  | 'reconciliation'
  | 'payroll'
  | 'tax'
  | 'ledger'
  | 'statements'
  | 'mis-reports'
  | 'budgeting'
  | 'audit'
  | 'items'
  | 'parties'
  | 'utilities'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  isHindi: boolean;
  unreconciledCount: number;
  pendingInvoicesCount: number;
  lowStockCount?: number;
  isCustomerView?: boolean;
  activeUserRole?: UserRole;
  mobileMenuOpen?: boolean;
  onToggleMobileMenu?: (open: boolean) => void;
  appConfig?: AppConfiguration;
  onOpenFeaturesModal?: () => void;
  softwareVersion?: string;
  onOpenAdminLicenseGenerator?: () => void;
  isOwner?: boolean;
}

interface MenuItem {
  id: NavTab;
  label: string;
  category: 'core' | 'masters' | 'reports' | 'tools';
  categoryLabelHindi: string;
  categoryLabelEng: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  badge?: string | null;
  badgeColor?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isHindi,
  unreconciledCount,
  pendingInvoicesCount,
  lowStockCount = 0,
  isCustomerView = false,
  activeUserRole = 'ADMIN',
  mobileMenuOpen: controlledOpen,
  onToggleMobileMenu,
  appConfig,
  onOpenFeaturesModal,
  softwareVersion,
  onOpenAdminLicenseGenerator,
  isOwner = false
}) => {
  const effectiveConfig = appConfig || loadAppConfig();
  const [internalOpen, setInternalOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState('');
  const versionClickCountRef = useRef(0);
  const versionClickTimerRef = useRef<number | null>(null);

  const handleVersionBadgeClick = () => {
    if (!onOpenAdminLicenseGenerator) return;
    versionClickCountRef.current += 1;
    if (versionClickTimerRef.current) {
      window.clearTimeout(versionClickTimerRef.current);
    }
    if (versionClickCountRef.current >= 5) {
      versionClickCountRef.current = 0;
      versionClickTimerRef.current = null;
      onOpenAdminLicenseGenerator();
      return;
    }
    versionClickTimerRef.current = window.setTimeout(() => {
      versionClickCountRef.current = 0;
      versionClickTimerRef.current = null;
    }, 3000);
  };

  const isMenuOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setMenuOpen = (open: boolean) => {
    if (onToggleMobileMenu) {
      onToggleMobileMenu(open);
    } else {
      setInternalOpen(open);
    }
  };

  const rawMenuItems: MenuItem[] = [
    // 1. CORE TRANSACTIONS
    {
      id: 'dashboard',
      label: isHindi ? 'डैशबोर्ड' : 'Dashboard',
      category: 'core',
      categoryLabelHindi: 'कोर लेखांकन (Core Accounting)',
      categoryLabelEng: 'Core Accounting',
      icon: LayoutDashboard,
      iconColor: 'text-indigo-400',
      badge: null
    },
    {
      id: 'pos',
      label: isHindi ? 'बारकोड POS बिलिंग' : 'Barcode POS Billing',
      category: 'core',
      categoryLabelHindi: 'कोर लेखांकन (Core Accounting)',
      categoryLabelEng: 'Core Accounting',
      icon: ScanBarcode,
      iconColor: 'text-cyan-400',
      badge: 'POS',
      badgeColor: 'bg-cyan-500/25 text-cyan-300 border-cyan-500/40'
    },
    {
      id: 'invoices',
      label: isHindi ? 'सेल एवं इनवॉइस' : 'Sales & Invoices',
      category: 'core',
      categoryLabelHindi: 'कोर लेखांकन (Core Accounting)',
      categoryLabelEng: 'Core Accounting',
      icon: Receipt,
      iconColor: 'text-emerald-400',
      badge: pendingInvoicesCount > 0 ? `${pendingInvoicesCount} Pending` : null,
      badgeColor: 'bg-amber-500/25 text-amber-300 border-amber-500/40'
    },
    {
      id: 'purchases',
      label: isHindi ? 'खरीद एवं परचेज ऑर्डर' : 'Purchases & Orders',
      category: 'core',
      categoryLabelHindi: 'कोर लेखांकन (Core Accounting)',
      categoryLabelEng: 'Core Accounting',
      icon: ShoppingBag,
      iconColor: 'text-amber-400',
      badge: isHindi ? 'बिल & PO' : 'Bill & PO',
      badgeColor: 'bg-amber-500/25 text-amber-300 border-amber-500/40'
    },
    {
      id: 'vouchers',
      label: isHindi ? 'वाउचर एंट्रीज़ (F5-F7)' : 'Vouchers & Journals',
      category: 'core',
      categoryLabelHindi: 'कोर लेखांकन (Core Accounting)',
      categoryLabelEng: 'Core Accounting',
      icon: ArrowRightLeft,
      iconColor: 'text-rose-400',
      badge: 'F5-F7',
      badgeColor: 'bg-rose-500/25 text-rose-300 border-rose-500/40'
    },
    {
      id: 'items',
      label: isHindi ? 'इन्वेंटरी एवं स्टॉक' : 'Inventory & Stock',
      category: 'core',
      categoryLabelHindi: 'कोर लेखांकन (Core Accounting)',
      categoryLabelEng: 'Core Accounting',
      icon: Package,
      iconColor: 'text-cyan-400',
      badge: lowStockCount > 0 ? (isHindi ? `${lowStockCount} कम` : `${lowStockCount} Low`) : null,
      badgeColor: 'bg-rose-500/25 text-rose-300 border-rose-500/40'
    },

    // 2. MASTERS & LEDGERS
    {
      id: 'parties',
      label: isHindi ? 'पार्टियां (ग्राहक व विक्रेता)' : 'Parties & Contacts',
      category: 'masters',
      categoryLabelHindi: 'मास्टर्स एवं खाते (Masters & Ledgers)',
      categoryLabelEng: 'Masters & Ledgers',
      icon: Users,
      iconColor: 'text-sky-400',
      badge: null
    },
    {
      id: 'ledger',
      label: isHindi ? 'खाता बही (Ledger)' : 'Chart of Accounts',
      category: 'masters',
      categoryLabelHindi: 'मास्टर्स एवं खाते (Masters & Ledgers)',
      categoryLabelEng: 'Masters & Ledgers',
      icon: BookOpen,
      iconColor: 'text-violet-400',
      badge: null
    },
    {
      id: 'reconciliation',
      label: isHindi ? 'बैंक समाधान' : 'Bank Reconciliation',
      category: 'masters',
      categoryLabelHindi: 'मास्टर्स एवं खाते (Masters & Ledgers)',
      categoryLabelEng: 'Masters & Ledgers',
      icon: Landmark,
      iconColor: 'text-teal-400',
      badge: unreconciledCount > 0 ? `${unreconciledCount}` : null,
      badgeColor: 'bg-rose-500/25 text-rose-300 border-rose-500/40'
    },

    // 3. TAX & REPORTS
    {
      id: 'tax',
      label: isHindi ? 'जीएसटी एवं टैक्स' : 'Tax & GST Returns',
      category: 'reports',
      categoryLabelHindi: 'टैक्स, पेरोल व रिपोर्ट्स (Tax & Reports)',
      categoryLabelEng: 'Tax, Payroll & Reports',
      icon: FileCheck2,
      iconColor: 'text-emerald-400',
      badge: 'GSTR-1/3B',
      badgeColor: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
    },
    {
      id: 'statements',
      label: isHindi ? 'फाइनेंशियल रिपोर्ट्स' : 'Financial Reports',
      category: 'reports',
      categoryLabelHindi: 'टैक्स, पेरोल व रिपोर्ट्स (Tax & Reports)',
      categoryLabelEng: 'Tax, Payroll & Reports',
      icon: PieChart,
      iconColor: 'text-indigo-400',
      badge: isHindi ? 'वार्षिक' : 'P&L / BS',
      badgeColor: 'bg-indigo-500/25 text-indigo-300 border-indigo-500/40'
    },
    {
      id: 'mis-reports',
      label: isHindi ? 'एमआईएस रिपोर्ट्स' : 'MIS & Export',
      category: 'reports',
      categoryLabelHindi: 'टैक्स, पेरोल व रिपोर्ट्स (Tax & Reports)',
      categoryLabelEng: 'Tax, Payroll & Reports',
      icon: FileSpreadsheet,
      iconColor: 'text-cyan-400',
      badge: 'PDF/XLS',
      badgeColor: 'bg-cyan-500/25 text-cyan-300 border-cyan-500/40'
    },
    {
      id: 'payroll',
      label: isHindi ? 'पेरोल एवं वेतन पर्ची' : 'Payroll & Salary',
      category: 'reports',
      categoryLabelHindi: 'टैक्स, पेरोल व रिपोर्ट्स (Tax & Reports)',
      categoryLabelEng: 'Tax, Payroll & Reports',
      icon: Users,
      iconColor: 'text-purple-400',
      badge: isHindi ? 'वेतन' : 'Salary',
      badgeColor: 'bg-purple-500/25 text-purple-300 border-purple-500/40'
    },
    {
      id: 'budgeting',
      label: isHindi ? 'बजट एवं खर्च नियंत्रण' : 'Budgeting & Limits',
      category: 'reports',
      categoryLabelHindi: 'टैक्स, पेरोल व रिपोर्ट्स (Tax & Reports)',
      categoryLabelEng: 'Tax, Payroll & Reports',
      icon: PiggyBank,
      iconColor: 'text-amber-400',
      badge: null
    },

    // 4. TOOLS & SETTINGS
    {
      id: 'audit',
      label: isHindi ? 'ऑडिट लॉग एवं इतिहास' : 'Audit Log & History',
      category: 'tools',
      categoryLabelHindi: 'टूल्स व सेटिंग्स (Tools & Settings)',
      categoryLabelEng: 'Tools & Settings',
      icon: ShieldCheck,
      iconColor: 'text-emerald-400',
      badge: isHindi ? 'सुरक्षा' : 'Security',
      badgeColor: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/40'
    },
    {
      id: 'utilities',
      label: isHindi ? 'बैकअप व इंपोर्ट टूल्स' : 'Utilities & Backup',
      category: 'tools',
      categoryLabelHindi: 'टूल्स व सेटिंग्स (Tools & Settings)',
      categoryLabelEng: 'Tools & Settings',
      icon: Database,
      iconColor: 'text-blue-400',
      badge: null
    },
    {
      id: 'settings',
      label: isHindi ? 'कंपनी सेटिंग्स' : 'Company Settings',
      category: 'tools',
      categoryLabelHindi: 'टूल्स व सेटिंग्स (Tools & Settings)',
      categoryLabelEng: 'Tools & Settings',
      icon: Settings,
      iconColor: 'text-slate-400',
      badge: null
    }
  ];

  const normalizedRole = normalizeUserRole(activeUserRole);
  const roleMeta = ROLE_METADATA[normalizedRole];

  // Enforce strict role-based navigation, customer-view restrictions, and enabled ERP module switches
  const menuItems = rawMenuItems.filter(
    item => canAccessTab(normalizedRole, item.id, isCustomerView) && isNavTabEnabled(item.id, effectiveConfig)
  );

  const currentItem = menuItems.find(m => m.id === activeTab) || menuItems[0] || rawMenuItems[0];
  const CurrentIcon = currentItem.icon;

  const handleTabClick = (tabId: NavTab) => {
    onSelectTab(tabId);
    setMenuOpen(false);
    setMenuSearch('');
  };

  const filteredItems = menuSearch.trim()
    ? menuItems.filter(item => 
        item.label.toLowerCase().includes(menuSearch.toLowerCase()) ||
        item.id.toLowerCase().includes(menuSearch.toLowerCase())
      )
    : menuItems;

  const totalAlerts = (pendingInvoicesCount > 0 ? 1 : 0) + (lowStockCount > 0 ? 1 : 0) + (unreconciledCount > 0 ? 1 : 0);

  return (
    <>
      {/* 1. MOBILE TOP APP BAR (Visible on mobile screens < md) */}
      <div className="flex md:hidden items-center justify-between px-3.5 py-2.5 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md shrink-0 w-full z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <SnaLogo size="sm" showText={false} />
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/90 border border-slate-700/80 rounded-xl text-sm font-bold text-slate-100 truncate max-w-[190px] shadow-sm">
            <CurrentIcon className={`w-4 h-4 ${currentItem.iconColor} shrink-0`} />
            <span className="truncate">{currentItem.label}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex items-center gap-1.5 mirror-btn hover:mirror-btn text-white px-3.5 py-2 rounded-xl text-sm font-bold shadow-md transition cursor-pointer shrink-0"
        >
          <Menu className="w-4 h-4 text-indigo-400" />
          <span>{isHindi ? 'सभी मेनू' : 'All Menus'}</span>
          {totalAlerts > 0 && (
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-indigo-900" />
          )}
        </button>
      </div>

      {/* 2. MOBILE FULL-SCREEN NAVIGATION MODAL DRAWER */}
      {isMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-slate-950/98 backdrop-blur-2xl text-slate-100 animate-fadeIn">
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/90 shrink-0">
            <div className="flex items-center gap-2.5">
              <SnaLogo size="sm" showText={true} />
              <span className="text-xs bg-indigo-500/20 text-indigo-300 font-bold px-2.5 py-0.5 rounded-full border border-indigo-500/30">
                ERP Navigator
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setMenuSearch('');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-sm font-bold border border-slate-700 transition cursor-pointer"
            >
              <X className="w-4 h-4 text-rose-400" />
              <span>{isHindi ? 'बंद करें' : 'Close'}</span>
            </button>
          </div>

          {/* Quick Search inside Drawer */}
          <div className="p-3.5 border-b border-slate-800/80 bg-slate-900/50 shrink-0">
            <div className="relative flex items-center">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
              <input
                type="text"
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder={isHindi ? 'मेनू खोजें (जैसे: सेल, खरीद, स्टॉक, जीएसटी)...' : 'Search module (e.g. Sales, Stock, Tax)...'}
                className="w-full bg-slate-900 text-slate-100 placeholder-slate-400 text-sm rounded-xl pl-10 pr-9 py-2.5 border border-slate-700 focus:outline-none focus:border-indigo-500"
              />
              {menuSearch && (
                <button
                  type="button"
                  onClick={() => setMenuSearch('')}
                  className="absolute right-3 text-slate-400 hover:text-white p-1 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable List with Smooth Native Touch Scrolling & Mirror Buttons */}
          <div 
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 space-y-2 pb-28 touch-pan-y"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-2 py-1 flex items-center justify-between">
              <span>{isHindi ? 'सभी सॉफ्टवेयर मॉड्यूल' : 'All ERP Modules'}</span>
              <span className="text-indigo-400 font-mono">({filteredItems.length})</span>
            </div>

            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'mirror-btn-active'
                      : 'mirror-btn text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      isActive 
                        ? 'bg-white/25 text-white shadow-inner' 
                        : 'bg-slate-800/80 border border-slate-700/80 ' + item.iconColor
                    }`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <span className="truncate text-sm font-bold">{item.label}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.badge && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${item.badgeColor || 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'}`}>
                        {item.badge}
                      </span>
                    )}
                    {isActive && <Check className="w-4.5 h-4.5 text-emerald-300" />}
                  </div>
                </button>
              );
            })}

            {filteredItems.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">
                {isHindi ? `"${menuSearch}" के नाम से कोई मेनू नहीं मिला` : `No menu matches "${menuSearch}"`}
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-3.5 border-t border-slate-800 text-xs text-slate-400 text-center bg-slate-900/90 shrink-0">
            <p className="font-bold text-amber-300 flex items-center justify-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Hisabveda Enterprise ERP</span>
            </p>
            <p className="text-emerald-400 text-xs mt-0.5">
              {isHindi ? '● मल्टी-सिस्टम क्लाउड लाइव सिंक सक्रिय' : '● Multi-System Cloud Live Sync Active'}
            </p>
          </div>
        </div>
      )}

      {/* 3. DESKTOP PERMANENT SIDEBAR (Visible on md+ screens) */}
      <aside className="hidden md:flex md:w-56 lg:w-60 xl:w-64 bg-slate-900/95 backdrop-blur-xl border-r border-slate-800 text-slate-200 flex-col shrink-0 h-full min-h-0 overflow-hidden shadow-2xl">
        {/* Quick Menu Filter on Desktop */}
        <div className="px-2.5 py-2 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
            <input
              type="text"
              value={menuSearch}
              onChange={(e) => setMenuSearch(e.target.value)}
              placeholder={isHindi ? 'मेनू खोजें...' : 'Quick menu search...'}
              className="w-full bg-slate-950/80 text-slate-100 placeholder-slate-400 text-xs rounded-lg pl-8 pr-6 py-1.5 border border-slate-800 focus:outline-none focus:border-indigo-500"
            />
            {menuSearch && (
              <button
                type="button"
                onClick={() => setMenuSearch('')}
                className="absolute right-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop Navigation List with Premium Mirror Buttons */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <nav className="p-2 space-y-1 overflow-y-auto overscroll-contain flex-1 scrollbar-thin scrollbar-thumb-slate-700">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl text-[12.5px] font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'mirror-btn-active font-bold'
                      : 'mirror-btn text-slate-200 hover:text-white'
                  }`}
                  title={item.label}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${
                      isActive 
                        ? 'bg-white/20 text-white' 
                        : 'bg-slate-800/80 border border-slate-700/60 ' + item.iconColor
                    }`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <span className="truncate">{item.label}</span>
                  </div>

                  {item.badge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${
                      item.badgeColor || 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {filteredItems.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                {isHindi ? `"${menuSearch}" के नाम से कोई मेनू नहीं` : `No menu matches "${menuSearch}"`}
              </div>
            )}
          </nav>

          {/* Desktop Footer Badge + Quick Modules Switcher */}
          <div className="p-2.5 border-t border-slate-800 text-[11px] text-slate-400 text-center bg-slate-950/50 shrink-0 space-y-1">
            {isOwner && onOpenAdminLicenseGenerator && (
              <button
                type="button"
                onClick={onOpenAdminLicenseGenerator}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-amber-500/40 text-amber-300 font-extrabold text-[11px] transition cursor-pointer shadow-sm mb-1"
                title={isHindi ? 'सुपर एडमिन लाइसेंस जनरेटर खोलें' : 'Open Super Admin License Generator'}
              >
                <span className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isHindi ? 'लाइसेंस मैनेजर (एडमिन)' : 'License Manager (Admin)'}</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/30 text-amber-200 text-[9px] font-mono font-bold">
                  ADMIN
                </span>
              </button>
            )}
            {onOpenFeaturesModal && (
              <button
                type="button"
                onClick={onOpenFeaturesModal}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-[11px] transition cursor-pointer"
                title={isHindi ? 'POS, बिना इन्वेंटरी अकाउंटिंग व अन्य मॉड्यूल ऑन/ऑफ करें' : 'Enable / Disable POS, Accounts-Only & ERP Modules'}
              >
                <span className="flex items-center gap-1.5">
                  <ToggleRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{isHindi ? 'फीचर्स ऑन/ऑफ' : 'Modules On/Off'}</span>
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-extrabold ${
                  effectiveConfig.accountingWithoutInventory
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-300'
                }`}>
                  {effectiveConfig.accountingWithoutInventory ? 'ACC ONLY' : 'FULL ERP'}
                </span>
              </button>
            )}
            <p className="font-bold text-amber-300 flex items-center justify-center gap-1.5">
              <span>Hisabveda ERP Software</span>
              <span
                onClick={handleVersionBadgeClick}
                className={`text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800/90 border border-slate-700 text-slate-300 ${
                  onOpenAdminLicenseGenerator ? 'cursor-pointer select-none hover:border-indigo-500/40' : ''
                }`}
              >
                {softwareVersion || 'v2.4.2'}
              </span>
            </p>
            <div className="flex items-center justify-center">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${roleMeta.badgeColor}`}>
                {normalizedRole}
              </span>
            </div>
            <p className="text-emerald-400 flex items-center justify-center gap-1 font-medium text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{isHindi ? 'मल्टी-सिस्टम क्लाउड सिंक ऑन' : 'Multi-System Cloud Sync Active'}</span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
