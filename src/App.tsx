import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppData, SalesInvoice, Voucher, VoucherType, BankStatementLine, Account, AccountCategory, AccountGroup, ItemMaster, PartyMaster, CompanyDetails, Currency, CategoryBudget, PurchaseInvoice, PurchaseOrder, Employee, PayrollRecord, StockAdjustmentRecord, UserRole, Godown, ItemBatch, StockTransfer } from './types';
import {
  applySalesInvoiceStockAndBatchChanges,
  applyPurchaseBillStockAndBatchChanges,
  executeInterGodownTransfer,
  applyBatchWriteOffOrAdjustment,
  ensureGodowns,
  reconcileGodownStocksMap,
  resolveDefaultGodownId,
  computeBatchStatus,
} from './utils/inventoryBatches';
import {
  loadAppData,
  saveAppData,
  logAuditAction,
  setActiveStorageUserId,
  createFreshAppData,
  createSampleDemoData,
  createDefaultChartOfAccounts,
  mergeStandardChartOfAccounts,
  getStorageMode,
  clearUserLocalData,
  PreImportSnapshot,
  savePreImportSnapshot,
  loadPreImportSnapshot,
  clearPreImportSnapshot,
  OWNER_ADMIN_EMAIL,
  isOwnerEmail,
  setActiveNumberFormat,
  resolveAuthoritativeLicense,
  isElectronDesktopRuntime
} from './utils/storage';
import {
  performFinancialYearShift,
  isBankAccount,
  isCashLedger,
  isBankLedger,
  isCashOrBankLedger,
  isDateLockedByBooksLock,
  getAutoRoundOffAdjustment,
  normalizeVoucherWithRoundOff,
  validateVoucherAccountingRules
} from './utils/accounting';
import { AppConfiguration, isNavTabEnabled, loadAppConfig, saveAppConfig } from './utils/appConfig';
import { resolveCompanyTaxProfile } from './utils/companyProfile';
import {
  ALL_FINANCIAL_YEARS,
  buildFYRangeToken,
  getCurrentFinancialYearStart,
  getFinancialYearRange,
  getAvailableFinancialYears,
  getFinancialYearStartForDate,
  filterAppDataByFinancialYear,
  isCustomPeriodToken,
  normalizeFYStartDate,
  isDateInFinancialYear,
  isStrictBankLedger
} from './utils/fiscalYear';
import {
  findDuplicateLedgersAndParties,
  mergeDuplicateLedgersAndParties
} from './utils/ledgerDeduplicator';
import { TallyImportCommitPayload, TallyLastImportBatch } from './utils/tallyXmlImporter';
import { ExternalImportCommitPayload, ExternalLastImportBatch } from './utils/multiSoftwareImporter';
import { syncPartyDetailsAcrossAppData } from './utils/gstAuditEngine';
import { Repeat, X, CheckCircle2, ArrowLeft, RotateCcw, Sparkles, LayoutDashboard, Receipt, ShoppingBag, Package, Menu, AlertTriangle, Calendar } from 'lucide-react';

// UI Components
import { Header, AppTheme } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { InvoiceList } from './components/Invoices/InvoiceList';
import { InvoiceFormModal } from './components/Invoices/InvoiceFormModal';
import { InvoicePrintModal } from './components/Invoices/InvoicePrintModal';
import { PurchaseModule } from './components/Purchases/PurchaseModule';
import { PurchaseBillModal } from './components/Purchases/PurchaseBillModal';
import { VoucherList } from './components/Vouchers/VoucherList';
import { JournalVoucherModal } from './components/Vouchers/JournalVoucherModal';
import { PaymentVoucherModal } from './components/Vouchers/PaymentVoucherModal';
import { ReceiptVoucherModal } from './components/Vouchers/ReceiptVoucherModal';
import { ContraVoucherModal } from './components/Vouchers/ContraVoucherModal';
import { BankReconciliation } from './components/BankReconciliation/BankReconciliation';
import { PayrollManagement, PayrollBatchSaveOptions } from './components/Payroll/PayrollManagement';
import { TaxCompliance } from './components/Tax/TaxCompliance';
import { ChartOfAccounts } from './components/Ledger/ChartOfAccounts';
import { GeneralLedgerView } from './components/Ledger/GeneralLedgerView';
import { FinancialStatements } from './components/Ledger/FinancialStatements';
import { Budgeting } from './components/Budgeting/Budgeting';
import { ItemMasterList } from './components/Masters/ItemMasterList';
import { BarcodePOSModule } from './components/POS/BarcodePOSModule';
import { PartyMasterList } from './components/Masters/PartyMasterList';
import { CompanySettings } from './components/Settings/CompanySettings';
import { CompanyManagerModal } from './components/Settings/CompanyManagerModal';
import { SecurityBackupModal } from './components/Security/SecurityBackupModal';
import { MasterPinPasswordModal } from './components/Security/MasterPinPasswordModal';
import { PinLockOverlay } from './components/Security/PinLockOverlay';
import { AuditLogView } from './components/Security/AuditLogView';
import { LicenseActivationModal } from './components/Security/LicenseActivationModal';
import { UserManagementModal } from './components/Security/UserManagementModal';
import { AuthScreen } from './components/Security/AuthScreen';
import { SalesPage } from './components/Marketing/SalesPage';
import { DebitCreditNoteModal } from './components/Vouchers/DebitCreditNoteModal';
import { MISReports } from './components/Reports/MISReports';
import { UtilitiesModule } from './components/Utilities/UtilitiesModule';
import { SoftwareUpdateModal } from './components/Settings/SoftwareUpdateModal';
import { AiComplianceCopilot } from './components/Common/AiComplianceCopilot';
import { MobileAppModal } from './components/Mobile/MobileAppModal';
import { LanLiveView } from './components/Mobile/LanLiveView';
import { buildPayrollAccountingVouchers, buildLanLiveSnapshot } from './utils/enterpriseErpHelpers';
import { EWayBillGeneratorModal } from './components/Tax/EWayBillGeneratorModal';
import { ConfigureSettingsModal, ConfigureSection } from './components/Settings/ConfigureSettingsModal';
import { CloudSyncModal } from './components/Settings/CloudSyncModal';
import { KeyboardShortcutsModal } from './components/Common/KeyboardShortcutsModal';
import { UserManualModal } from './components/Help/UserManualModal';
import {
  APP_SHORTCUT_DEFINITIONS,
  AppShortcutDef,
  isEditableEventTarget
} from './utils/keyboardShortcuts';
import { pushAppDataToCloud, pullLatestFromCloud, subscribeToCloudSync, CloudSyncStatus } from './utils/cloudSync';
import { getTrialStatus, syncServerClockFromApi } from './utils/license';
import { LicenseInfo, UserProfile, DebitCreditNote } from './types';
import { signOut, onAuthStateChanged, sendEmailVerification, User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, buildFirestoreErrorInfo, OperationType, testFirestoreConnection } from './lib/firebase';
import {
  canAccessTab,
  getRolePermissions,
  getRbacDenialMessage,
  normalizeUserRole,
  canManageTargetRole
} from './utils/rbac';

export default function App() {
  // Authentication Session (Verified against Firebase Auth)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(() => auth.currentUser);
  const [isEmailVerified, setIsEmailVerified] = useState<boolean>(() => Boolean(auth.currentUser?.emailVerified));
  const [dismissedEmailVerifyBanner, setDismissedEmailVerifyBanner] = useState<boolean>(false);
  const [isCheckingVerification, setIsCheckingVerification] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [sessionUser, setSessionUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('sna_auth_session');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed?.id && parsed?.email) {
          setActiveStorageUserId(parsed.id);
          return parsed;
        }
      } catch {
        return null;
      }
    }
    return null;
  });

  const sessionUserRef = useRef<UserProfile | null>(sessionUser);
  useEffect(() => {
    sessionUserRef.current = sessionUser;
  }, [sessionUser]);

  const [data, setData] = useState<AppData>(() => {
    if (sessionUser?.id) {
      setActiveStorageUserId(sessionUser.id);
      return loadAppData(sessionUser.id, sessionUser.email);
    }
    return createFreshAppData(undefined, undefined, null);
  });
  const [activeUser, setActiveUser] = useState<UserProfile>(() => {
    return (
      sessionUser ||
      data.activeUser || {
        id: 'usr_admin',
        name: data.company?.name || 'Administrator',
        role: 'ADMIN',
        email: data.company?.email || '',
        pin: data.securityPin || '',
        permissions: ['all'],
      }
    );
  });
  const effectiveRole = normalizeUserRole(activeUser?.role || 'ADMIN');
  const rbac = useMemo(() => getRolePermissions(effectiveRole), [effectiveRole]);
  const rbacRef = useRef(rbac);
  useEffect(() => {
    rbacRef.current = rbac;
  }, [rbac]);
  const effectiveRoleRef = useRef(effectiveRole);
  useEffect(() => {
    effectiveRoleRef.current = effectiveRole;
  }, [effectiveRole]);
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [isHindi, setIsHindi] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(() => !data.pinRequired || !data.securityPin);
  const [selectedLedgerAccountId, setSelectedLedgerAccountId] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfiguration>(() => loadAppConfig());

  useEffect(() => {
    const syncAppConfig = () => {
      setAppConfig(loadAppConfig());
    };
    window.addEventListener('sna_config_updated', syncAppConfig);
    return () => window.removeEventListener('sna_config_updated', syncAppConfig);
  }, []);

  // Active Financial Year Filter State (defaults to current running Indian FY, e.g. FY 2026-27)
  const currentFYStart = getCurrentFinancialYearStart();
  const [selectedFYStart, setSelectedFYStart] = useState<string>(() => getCurrentFinancialYearStart());
  const availableFinancialYears = useMemo(() => getAvailableFinancialYears(data), [data]);
  const fyData = useMemo(() => filterAppDataByFinancialYear(data, selectedFYStart), [data, selectedFYStart]);
  const activeFyRange = useMemo(() => getFinancialYearRange(selectedFYStart), [selectedFYStart]);

  // Inner Workspace Scale / Text Zoom State (75% to 160%; presets 100% / 115% / 130%)
  const [zoomLevel, setZoomLevel] = useState<number>(() => {
    const saved = localStorage.getItem('sna_zoom_level');
    const parsed = saved ? Number(saved) : 100;
    return Number.isFinite(parsed) && parsed >= 75 && parsed <= 160 ? parsed : 100;
  });

  const handleUpdateZoom = (zoom: number) => {
    const clamped = Math.min(160, Math.max(75, Math.round(zoom)));
    setZoomLevel(clamped);
    localStorage.setItem('sna_zoom_level', clamped.toString());
  };

  // Theme Color Customization State
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('sna_theme_mode');
    return (saved as AppTheme) || 'slate';
  });

  const handleUpdateTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    localStorage.setItem('sna_theme_mode', newTheme);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Keep root document unscaled so Top Header Bar & Left Sidebar stay locked at 100%
  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement) {
      (document.documentElement.style as any).zoom = '';
    }
  }, []);

  // Registered Users list (never leaks hardcoded owner/demo profiles to customers)
  const [registeredUsers, setRegisteredUsers] = useState<UserProfile[]>(() => {
    return data.userProfiles && data.userProfiles.length > 0 ? data.userProfiles : [];
  });

  // Check URL query parameters for share mode (e.g. ?mode=demo or ?mode=activate&key=...)
  const [urlParams] = useState<URLSearchParams>(() => {
    try {
      return new URLSearchParams(window.location.search);
    } catch (e) {
      return new URLSearchParams();
    }
  });

  const isDemoShareMode = urlParams.get('mode') === 'demo';
  const urlActivationKey = urlParams.get('key') || '';
  const urlClientName = urlParams.get('client') || '';
  const isAutoActivateMode = urlParams.get('mode') === 'activate' || !!urlActivationKey;
  const isLanClientView = urlParams.get('lan') === '1';
  const urlLanPairCode = urlParams.get('code') || '';
  const lanPairCodeRef = useRef<string>('');
  
  // Dedicated Customer View logic
  const isCustomerLink = 
    urlParams.get('view') === 'client' || 
    isDemoShareMode || 
    isAutoActivateMode || 
    !!urlClientName || 
    urlParams.get('role') === 'client';

  // Customer/End-User Desktop Mode: never expose reseller/seller website or keygen tools inside Electron ERP
  const isSoftwareOwner = false;
  const isCustomerView = true;
  const isDesktopRuntime = isElectronDesktopRuntime();

  const [showWebAuthScreen, setShowWebAuthScreen] = useState<boolean>(() => {
    if (isDesktopRuntime) return true;
    try {
      const normalizedPath = window.location.pathname.replace(/\/+$/, '').toLowerCase() || '/';
      if (
        [
          '/terms',
          '/terms-and-conditions',
          '/privacy',
          '/privacy-policy',
          '/refund',
          '/refund-policy',
          '/cancellation-refund',
          '/disclaimer',
          '/contact',
          '/contact-us',
          '/about',
          '/about-us',
          '/pricing',
        ].includes(normalizedPath)
      ) {
        return false;
      }
      const params = new URLSearchParams(window.location.search);
      if (
        params.get('app') === '1' ||
        params.get('login') === '1' ||
        params.get('mode') === 'activate' ||
        params.get('mode') === 'demo' ||
        params.get('lan') === '1' ||
        Boolean(params.get('key'))
      ) {
        return true;
      }
      if (localStorage.getItem('sna_auth_session')) return true;
    } catch {
      // ignore URL/storage read failures
    }
    return false;
  });

  // Storage Mode ('cloud' vs 'local')
  const [storageMode, setStorageModeState] = useState<'cloud' | 'local'>(() => getStorageMode(sessionUser?.id));

  useEffect(() => {
    setStorageModeState(getStorageMode(sessionUser?.id));
    const onModeChange = (e: any) => {
      setStorageModeState(e?.detail?.mode === 'local' ? 'local' : 'cloud');
    };
    window.addEventListener('sna_storage_mode_changed', onModeChange);
    return () => window.removeEventListener('sna_storage_mode_changed', onModeChange);
  }, [sessionUser?.id]);

  // Verify session against live Firebase Auth state & hydrate verified RBAC role from Firestore
  useEffect(() => {
    syncServerClockFromApi()
      .then((serverTimeMs) => {
        if (serverTimeMs) {
          setData(prev => ({ ...prev }));
        }
      })
      .catch(() => {});
    testFirestoreConnection().catch(() => {});
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      setIsEmailVerified(Boolean(fbUser?.emailVerified));
      setAuthChecked(true);

      if (!fbUser) {
        setActiveStorageUserId(null);
        localStorage.removeItem('sna_auth_session');
        setSessionUser(null);
        setData(createFreshAppData(undefined, undefined, null));
        return;
      }

      setActiveStorageUserId(fbUser.uid);
      const currentSession = sessionUserRef.current;

      // Hydrate authoritative role & profile from Firestore `/users/{uid}` when available
      let remoteProfile: Partial<UserProfile> | null = null;
      const userDocPath = `users/${fbUser.uid}`;
      try {
        const userSnap = await getDoc(doc(db, 'users', fbUser.uid));
        if (userSnap.exists()) {
          remoteProfile = userSnap.data() as Partial<UserProfile>;
        }
      } catch (err) {
        console.warn('Role hydration notice:', JSON.stringify(buildFirestoreErrorInfo(err, OperationType.GET, userDocPath)));
      }

      const resolvedRole = normalizeUserRole(
        (remoteProfile?.role as string | undefined) ||
          (currentSession?.id === fbUser.uid ? currentSession?.role : undefined) ||
          'ADMIN'
      );

      if (
        !currentSession ||
        currentSession.id !== fbUser.uid ||
        (fbUser.email && currentSession.email !== fbUser.email) ||
        (remoteProfile?.role && currentSession.role !== resolvedRole)
      ) {
        const verifiedProfile: UserProfile = {
          id: fbUser.uid,
          name: remoteProfile?.name || fbUser.displayName || fbUser.email?.split('@')[0] || 'Admin User',
          role: resolvedRole,
          email: fbUser.email || remoteProfile?.email || '',
          companyId: remoteProfile?.companyId || `cmp_${fbUser.uid}`,
          pin: remoteProfile?.pin || ''
        };
        localStorage.setItem('sna_auth_session', JSON.stringify(verifiedProfile));
        setSessionUser(verifiedProfile);
        setActiveUser(prev =>
          prev && prev.id !== fbUser.uid && prev.companyId === verifiedProfile.companyId
            ? prev
            : verifiedProfile
        );
        const userLoaded = loadAppData(fbUser.uid, fbUser.email);
        setData(userLoaded);
        setIsUnlocked(!userLoaded.pinRequired || !userLoaded.securityPin);
      }
    });
    return () => unsubAuth();
  }, []);

  // Enforce strict RBAC, customer-view & feature-flag tab restrictions
  useEffect(() => {
    if (
      !canAccessTab(effectiveRole, activeTab, isCustomerView) ||
      !isNavTabEnabled(activeTab, appConfig)
    ) {
      setActiveTab('dashboard');
      setSelectedLedgerAccountId(null);
    }
  }, [isCustomerView, activeTab, effectiveRole, appConfig]);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<SalesInvoice | null>(null);
  const [editingPurchaseBill, setEditingPurchaseBill] = useState<PurchaseInvoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<SalesInvoice | null>(null);
  const [showJournalModal, setShowJournalModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showContraModal, setShowContraModal] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [showMasterPinModal, setShowMasterPinModal] = useState(false);
  const [showLicenseModal, setShowLicenseModal] = useState<boolean>(() => isAutoActivateMode);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showCompanyModal, setShowCompanyModal] = useState(false);
  const [showDebitCreditNoteModal, setShowDebitCreditNoteModal] = useState(false);
  const [showSoftwareUpdateModal, setShowSoftwareUpdateModal] = useState(false);
  const [showConfigureModal, setShowConfigureModal] = useState(false);
  const [configureSection, setConfigureSection] = useState<ConfigureSection>('features');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showUserManualModal, setShowUserManualModal] = useState(false);
  const [showCloudSyncModal, setShowCloudSyncModal] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('connected');
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showEWayBillModal, setShowEWayBillModal] = useState(false);
  const [eWayBillInvoiceIds, setEWayBillInvoiceIds] = useState<string[]>([]);
  const [autoInvoiceNotice, setAutoInvoiceNotice] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorToastMessage, setErrorToastMessage] = useState<string | null>(null);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  const tallyBatchStorageKey = `sna_tally_last_import_${sessionUser?.id || 'default'}`;
  const [lastTallyImportBatch, setLastTallyImportBatch] = useState<TallyLastImportBatch | null>(() => {
    try {
      const raw = localStorage.getItem(`sna_tally_last_import_${sessionUser?.id || 'default'}`);
      return raw ? (JSON.parse(raw) as TallyLastImportBatch) : null;
    } catch {
      return null;
    }
  });

  const externalBatchStorageKey = `sna_ext_last_import_${sessionUser?.id || 'default'}`;
  const [lastExternalImportBatch, setLastExternalImportBatch] = useState<ExternalLastImportBatch | null>(() => {
    try {
      const raw = localStorage.getItem(`sna_ext_last_import_${sessionUser?.id || 'default'}`);
      return raw ? (JSON.parse(raw) as ExternalLastImportBatch) : null;
    } catch {
      return null;
    }
  });
  const [preImportSnapshot, setPreImportSnapshot] = useState<PreImportSnapshot | null>(() =>
    loadPreImportSnapshot(sessionUser?.id)
  );

  const showErrorToast = (msg: string) => {
    setErrorToastMessage(msg);
    setTimeout(() => setErrorToastMessage(null), 5500);
  };

  const requirePermission = (allowed: boolean, actionHi: string, actionEn: string): boolean => {
    if (allowed) return true;
    showErrorToast(getRbacDenialMessage(actionHi, actionEn, effectiveRole, isHindi));
    return false;
  };

  const openConfigureModal = (section: ConfigureSection = 'features') => {
    if (!requirePermission(rbac.canEditCompanySettings, 'सिस्टम कॉन्फ़िगरेशन खोलना', 'open configuration & features settings')) return;
    setConfigureSection(section);
    setShowConfigureModal(true);
  };

  const navigateToTab = (tab: NavTab, accountId?: string) => {
    if (!canAccessTab(effectiveRole, tab, isCustomerView)) {
      showErrorToast(getRbacDenialMessage(`टैब (${tab}) खोलना`, `open module "${tab}"`, effectiveRole, isHindi));
      return;
    }
    if (!isNavTabEnabled(tab, appConfig)) {
      showErrorToast(
        isHindi
          ? `मॉड्यूल "${tab}" अभी Features & Modules सेटिंग्स से Disabled है। इसे चालू करने के लिए Configure Features पर क्लिक करें।`
          : `Module "${tab}" is currently disabled in Features & Modules. Enable it anytime from Configure Features.`
      );
      return;
    }
    setActiveTab(tab);
    if (accountId !== undefined) {
      setSelectedLedgerAccountId(accountId);
    } else {
      setSelectedLedgerAccountId(null);
    }
  };

  const handleChangeFinancialYear = (fyStart: string) => {
    const norm = fyStart === ALL_FINANCIAL_YEARS ? ALL_FINANCIAL_YEARS : normalizeFYStartDate(fyStart);
    setSelectedFYStart(norm);
    const range = getFinancialYearRange(norm);
    setToastMessage(
      norm === ALL_FINANCIAL_YEARS
        ? (isHindi
            ? '🌐 संपूर्ण अवधि (सभी वर्ष – आज तक) सक्रिय — सभी वित्तीय वर्षों का संयुक्त डेटा व लेज़र दिख रहे हैं।'
            : '🌐 Switched to All Years Combined (To Current Date) — Viewing cumulative multi-year books.')
        : isCustomPeriodToken(norm)
          ? (isHindi
              ? `🗓️ चयनित कस्टम पीरियड: ${range.label} (${range.displayRange}) सक्रिय — पिछले वर्षों का क्लोज़िंग बैलेंस स्वतः कैरी फॉरवर्ड है।`
              : `🗓️ Custom Period Active: ${range.label} (${range.displayRange}) — Prior closing balances carried forward automatically.`)
          : (isHindi
              ? `📅 वित्तीय वर्ष ${range.label} (${range.displayRange}) सक्रिय — पिछले वर्षों का क्लोज़िंग बैलेंस स्वतः कैरी फॉरवर्ड है।`
              : `📅 Switched to ${range.label} (${range.displayRange}) — Prior year closing balances carried forward automatically.`)
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  const handleRefreshEmailVerification = async (): Promise<boolean> => {
    const current = auth.currentUser;
    if (!current) return false;
    setIsCheckingVerification(true);
    try {
      await current.reload();
      await current.getIdToken(true);
      const verifiedNow = Boolean(auth.currentUser?.emailVerified);
      setFirebaseUser(auth.currentUser);
      setIsEmailVerified(verifiedNow);
      if (verifiedNow && sessionUser) {
        try {
          const userDocRef = doc(db, 'users', current.uid);
          const userSnap = await getDoc(userDocRef);
          if (!userSnap.exists()) {
            await setDoc(userDocRef, {
              id: current.uid,
              name: (sessionUser.name || current.displayName || 'Admin User').slice(0, 120),
              role: sessionUser.role || 'ADMIN',
              email: (current.email || sessionUser.email || '').slice(0, 200),
              companyId: `cmp_${current.uid}`,
              pin: String(sessionUser.pin || '').slice(0, 10),
            });
          }
        } catch {
          // Ignore optional user doc sync error; main company sync effect will run now
        }
        setToastMessage(
          isHindi
            ? '✅ ईमेल सत्यापित हो गया! क्लाउड लाइव सिंक अब सक्रिय है।'
            : '✅ Email verified! Cloud Live Sync is now enabled.'
        );
        setTimeout(() => setToastMessage(null), 4500);
      } else {
        showErrorToast(
          isHindi
            ? 'ईमेल अभी तक सत्यापित नहीं हुआ है। कृपया इनबॉक्स/स्पैम में दिए सत्यापन लिंक पर क्लिक करें।'
            : 'Email is not verified yet. Please click the verification link sent to your inbox or spam folder.'
        );
      }
      return verifiedNow;
    } finally {
      setIsCheckingVerification(false);
    }
  };

  const handleResendVerificationEmail = async () => {
    const current = auth.currentUser;
    if (!current) return;
    try {
      await sendEmailVerification(current);
      setToastMessage(
        isHindi
          ? `📩 सत्यापन ईमेल "${current.email}" पर भेज दिया गया है।`
          : `📩 Verification email sent to "${current.email}".`
      );
      setTimeout(() => setToastMessage(null), 4500);
    } catch (err: any) {
      showErrorToast(err?.message || (isHindi ? 'सत्यापन ईमेल भेजने में समस्या आई।' : 'Failed to send verification email.'));
    }
  };

  // Multi-System Real-Time Cloud Synchronization (Secure Multi-Tenant Sync)
  useEffect(() => {
    if (!sessionUser || !firebaseUser || sessionUser.id !== firebaseUser.uid) {
      return;
    }

    if (storageMode === 'local' || !isEmailVerified) {
      setCloudSyncStatus('local');
      return;
    }

    const activeCompanyId = `cmp_${firebaseUser.uid}`;
    let cancelled = false;
    let unsub: (() => void) | null = null;
    let debounceTimer: any = null;

    setCloudSyncStatus('syncing');

    if (data.company.id !== activeCompanyId) {
      setData(prev => ({
        ...prev,
        company: { ...prev.company, id: activeCompanyId }
      }));
    }

    const handleLocalDataSaved = (e: any) => {
      if (getStorageMode(firebaseUser.uid) === 'local') return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (e.detail) {
          pushAppDataToCloud({
            ...e.detail,
            company: { ...e.detail.company, id: activeCompanyId }
          });
          setLastSyncTime(new Date().toLocaleTimeString());
        }
      }, 600);
    };

    (async () => {
      // Pull cloud snapshot first so fresh device logins never overwrite cloud data with defaults
      const remoteData = await pullLatestFromCloud(activeCompanyId);
      if (cancelled) return;

      if (remoteData) {
        const mergedRemote = mergeStandardChartOfAccounts(remoteData);
        const enrichedRemote: AppData = {
          ...mergedRemote,
          license: resolveAuthoritativeLicense(mergedRemote.license),
        };
        saveAppData(enrichedRemote, firebaseUser.uid);
        setData(enrichedRemote);
      } else {
        // Compute a verified local workspace directly from Firebase UID + Email before first cloud push
        const localWorkspace = loadAppData(firebaseUser.uid, firebaseUser.email);
        const initialPushData: AppData = {
          ...localWorkspace,
          company: { ...localWorkspace.company, id: activeCompanyId },
          license: resolveAuthoritativeLicense(localWorkspace.license),
        };
        saveAppData(initialPushData, firebaseUser.uid);
        setData(initialPushData);
        await pushAppDataToCloud(initialPushData);
      }

      if (cancelled) return;

      unsub = subscribeToCloudSync(
        activeCompanyId,
        (incomingRemote) => {
          const mergedIncoming = mergeStandardChartOfAccounts(incomingRemote);
          setData({
            ...mergedIncoming,
            license: resolveAuthoritativeLicense(mergedIncoming.license),
          });
          setLastSyncTime(new Date().toLocaleTimeString());
        },
        (status, time) => {
          setCloudSyncStatus(status);
          if (time) setLastSyncTime(time);
        }
      );

      window.addEventListener('sna_data_saved', handleLocalDataSaved);
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
      clearTimeout(debounceTimer);
      window.removeEventListener('sna_data_saved', handleLocalDataSaved);
    };
  }, [sessionUser?.id, firebaseUser?.uid, storageMode, isEmailVerified]);

  // Broadcast read-only Live Snapshot to local Express server for Wi-Fi / LAN Multi-PC & Mobile viewing
  useEffect(() => {
    if (!sessionUser || !firebaseUser || isLanClientView || typeof fetch !== 'function') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        if (!lanPairCodeRef.current) {
          const infoRes = await fetch('/api/lan/info', { cache: 'no-store' });
          if (!infoRes.ok || cancelled) return;
          const infoJson = await infoRes.json();
          if (infoJson?.pairCode) {
            lanPairCodeRef.current = String(infoJson.pairCode).trim().toUpperCase();
          }
        }
        if (!lanPairCodeRef.current || cancelled) return;
        const snapshot = buildLanLiveSnapshot(fyData, activeFyRange.label);
        await fetch('/api/lan/snapshot', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-lan-code': lanPairCodeRef.current,
          },
          body: JSON.stringify({ code: lanPairCodeRef.current, snapshot }),
        });
      } catch {
        // Ignore network errors when running purely static / offline
      }
    }, 900);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [fyData, activeFyRange.label, sessionUser?.id, firebaseUser?.uid, isLanClientView]);


  const executeAppShortcut = (def: AppShortcutDef) => {
    if (def.actionType === 'NAV' && def.tabTarget) {
      navigateToTab(def.tabTarget);
      return;
    }
    if (def.actionType === 'MODAL') {
      if (def.modalTarget === 'shortcuts') {
        setShowShortcutsModal((prev) => !prev);
      } else if (def.modalTarget === 'configure') {
        if (!requirePermission(rbac.canEditCompanySettings, 'सिस्टम कॉन्फ़िगरेशन बदलना', 'open F12 configuration settings')) return;
        setConfigureSection('general');
        setShowConfigureModal((prev) => !prev);
      } else if (def.modalTarget === 'invoice') {
        if (!requirePermission(rbac.canCreateEditTransactions, 'नया इनवॉइस बनाना', 'create sales invoices')) return;
        setEditingInvoice(null);
        setShowInvoiceModal(true);
      } else if (def.modalTarget === 'payment') {
        if (!requirePermission(rbac.canCreateEditVouchers, 'नया पेमेंट वाउचर बनाना', 'create Payment voucher')) return;
        setEditingVoucher(null);
        setShowPaymentModal(true);
      } else if (def.modalTarget === 'receipt') {
        if (!requirePermission(rbac.canCreateEditVouchers, 'नया रसीद वाउचर बनाना', 'create Receipt voucher')) return;
        setEditingVoucher(null);
        setShowReceiptModal(true);
      } else if (def.modalTarget === 'journal') {
        if (!requirePermission(rbac.canCreateEditVouchers, 'नया जर्नल वाउचर बनाना', 'create Journal voucher')) return;
        setEditingVoucher(null);
        setShowJournalModal(true);
      } else if (def.modalTarget === 'contra') {
        if (!requirePermission(rbac.canCreateEditVouchers, 'नया कॉन्ट्रा वाउचर बनाना', 'create Contra voucher')) return;
        setEditingVoucher(null);
        setShowContraModal(true);
      } else if (def.modalTarget === 'note') {
        if (!requirePermission(rbac.canCreateEditVouchers, 'नया डेबिट/क्रेडिट नोट बनाना', 'create Debit/Credit Note')) return;
        setShowDebitCreditNoteModal(true);
      }
      return;
    }
    if (def.actionType === 'EVENT' && def.eventName) {
      window.dispatchEvent(new CustomEvent(def.eventName));
    }
  };

  const executeAppShortcutRef = useRef(executeAppShortcut);
  executeAppShortcutRef.current = executeAppShortcut;

  const isSessionReadyForShortcutsRef = useRef(false);
  isSessionReadyForShortcutsRef.current = Boolean(sessionUser && isUnlocked);

  const closeTopModalRef = useRef<() => boolean>(() => false);
  closeTopModalRef.current = () => {
    if (showUserManualModal) { setShowUserManualModal(false); return true; }
    if (showShortcutsModal) { setShowShortcutsModal(false); return true; }
    if (showConfigureModal) { setShowConfigureModal(false); return true; }
    if (printInvoice) { setPrintInvoice(null); return true; }
    if (showInvoiceModal) { setShowInvoiceModal(false); setEditingInvoice(null); return true; }
    if (showJournalModal) { setShowJournalModal(false); setEditingVoucher(null); return true; }
    if (showPaymentModal) { setShowPaymentModal(false); setEditingVoucher(null); return true; }
    if (showReceiptModal) { setShowReceiptModal(false); setEditingVoucher(null); return true; }
    if (showContraModal) { setShowContraModal(false); setEditingVoucher(null); return true; }
    if (showDebitCreditNoteModal) { setShowDebitCreditNoteModal(false); return true; }
    if (showEWayBillModal) { setShowEWayBillModal(false); setEWayBillInvoiceIds([]); return true; }
    if (showCompanyModal) { setShowCompanyModal(false); return true; }
    if (showUserModal) { setShowUserModal(false); return true; }
    if (showSecurityModal) { setShowSecurityModal(false); return true; }
    if (showMasterPinModal) { setShowMasterPinModal(false); return true; }
    if (showLicenseModal) { setShowLicenseModal(false); return true; }
    if (showCloudSyncModal) { setShowCloudSyncModal(false); return true; }
    if (showMobileModal) { setShowMobileModal(false); return true; }
    if (showSoftwareUpdateModal) { setShowSoftwareUpdateModal(false); return true; }
    if (showResetModal) { setShowResetModal(false); return true; }
    return false;
  };

  // Global Universal ERP Keyboard Shortcuts (Navigation, Vouchers, Reports, Config & Escape)
  useEffect(() => {
    const altNavKeyMap: Record<string, string> = {
      d: 'nav_dashboard',
      b: 'nav_pos',
      s: 'nav_invoices',
      p: 'nav_purchases',
      v: 'nav_vouchers',
      i: 'nav_items',
      l: 'nav_ledger',
      f: 'nav_statements',
      m: 'nav_mis',
      t: 'nav_tax',
      u: 'nav_parties',
      r: 'nav_banking',
      y: 'nav_payroll',
      g: 'nav_budget',
      a: 'nav_audit',
      x: 'nav_utilities',
      o: 'nav_settings',
      n: 'vch_note',
      k: 'sys_shortcuts'
    };

    const functionKeyMap: Record<string, string> = {
      F2: 'rep_period',
      F4: 'vch_contra',
      F5: 'vch_payment',
      F6: 'vch_receipt',
      F7: 'vch_journal',
      F8: 'vch_sales',
      F9: 'vch_purchase',
      F12: 'sys_configure'
    };

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (!isSessionReadyForShortcutsRef.current) return;

      if (e.key === 'Escape') {
        if (closeTopModalRef.current()) {
          e.preventDefault();
        } else {
          window.dispatchEvent(new CustomEvent('hisabveda:escape'));
        }
        return;
      }

      if (!e.altKey && !e.ctrlKey && !e.metaKey && functionKeyMap[e.key]) {
        e.preventDefault();
        const def = APP_SHORTCUT_DEFINITIONS.find((d) => d.id === functionKeyMap[e.key]);
        if (def) executeAppShortcutRef.current(def);
        return;
      }

      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === 'F1') {
          return;
        }
        if (/^[1-8]$/.test(e.key)) {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('hisabveda:subtab', { detail: { index: Number(e.key) } }));
          return;
        }
        const keyLower = e.key.toLowerCase();
        const shortcutId = altNavKeyMap[keyLower];
        if (shortcutId) {
          e.preventDefault();
          const def = APP_SHORTCUT_DEFINITIONS.find((d) => d.id === shortcutId);
          if (def) executeAppShortcutRef.current(def);
          return;
        }
      }

      if (e.key === '?' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        if (isEditableEventTarget(e.target)) return;
        e.preventDefault();
        const def = APP_SHORTCUT_DEFINITIONS.find((d) => d.id === 'sys_shortcuts');
        if (def) executeAppShortcutRef.current(def);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // e-Way Bill Modal Handlers
  const handleOpenEWayBillModal = (ids?: string[]) => {
    if (!requirePermission(rbac.canCreateEditTransactions, 'ई-वे बिल जनरेट करना', 'generate e-Way Bills')) return;
    setEWayBillInvoiceIds(ids || []);
    setShowEWayBillModal(true);
  };

  const handleUpdateInvoiceEwbNumber = (invId: string, ewbNo: string, ewbDate: string) => {
    if (!requirePermission(rbac.canCreateEditTransactions, 'ई-वे बिल अपडेट करना', 'update e-Way Bill number')) return;
    setData(prev => {
      const updatedInvoices = prev.invoices.map(inv => {
        if (inv.id === invId) {
          return {
            ...inv,
            ewayBillNumber: ewbNo,
            ewayBillDate: ewbDate
          };
        }
        return inv;
      });
      return logAuditAction(
        { ...prev, invoices: updatedInvoices },
        'e-Way Bill Generated',
        `Assigned e-Way Bill No. ${ewbNo} dated ${ewbDate} to Sales Invoice ID: ${invId}`
      );
    });

    const msg = isHindi
      ? `✅ ई-वे बिल #${ewbNo} इनवॉइस में सफलतापूर्वक दर्ज कर दिया गया!`
      : `✅ e-Way Bill #${ewbNo} successfully linked to invoice!`;
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Master PIN & Security Password Update Handler
  const handleUpdateSecurityPinAndPass = (newPin: string, pinRequired: boolean, newAdminPass?: string) => {
    if (!requirePermission(rbac.canManageUsersAndPin, 'मास्टर पिन / पासवर्ड बदलना', 'update Master PIN or security password')) return;
    const cleanPin = (newPin || '').trim();
    const updatedUsers = (data.userProfiles && data.userProfiles.length > 0 ? data.userProfiles : registeredUsers).map(u => {
      if (u.role === 'ADMIN' || u.id === 'usr_admin') {
        return {
          ...u,
          pin: cleanPin,
          ...(newAdminPass ? { password: newAdminPass } : {})
        };
      }
      return u;
    });

    const updatedData: AppData = logAuditAction(
      {
        ...data,
        securityPin: cleanPin || null,
        pinRequired: Boolean(cleanPin) && pinRequired,
        userProfiles: updatedUsers
      },
      'Master PIN & Security Updated',
      `Master PIN configuration updated (${cleanPin && pinRequired ? 'Protection Enabled' : 'Protection Disabled'})`
    );

    setData(updatedData);
    setRegisteredUsers(updatedUsers);
    saveAppData(updatedData);

    const msg = isHindi 
      ? '✅ मास्टर पिन और सुरक्षा सेटिंग्स सफलतापूर्वक सहेजी गईं!' 
      : '✅ Master Security PIN and settings updated successfully!';
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const trialStatus = getTrialStatus(data.license, data);

  const requireActiveLicenseForEntry = (isExistingRecord = false): boolean => {
    if (trialStatus.vaultTampered) {
      showErrorToast(
        isHindi
          ? '🚨 सिक्योरिटी वॉल्ट या लाइसेंस सर्टिफिकेट सत्यापन विफल! कृपया वैध Ed25519 लाइसेंस सक्रिय करें।'
          : '🚨 Security vault or Ed25519 license certificate verification failed! Activate a valid license.'
      );
      setShowLicenseModal(true);
      return false;
    }
    if (trialStatus.clockTampered) {
      showErrorToast(
        isHindi
          ? '🚨 सिस्टम क्लॉक रिवर्सल पकड़ा गया! कृपया कंप्यूटर की सही तारीख/समय सेट करें।'
          : '🚨 System clock rollback detected! Restore your PC date & time to continue.'
      );
      setShowLicenseModal(true);
      return false;
    }
    if (trialStatus.lockReason === 'LICENSE_REVOKED') {
      showErrorToast(
        isHindi
          ? '🚨 आपका लाइसेंस एडमिन द्वारा रद्द कर दिया गया है। नया वैध लाइसेंस दर्ज करें।'
          : '🚨 Your license certificate was revoked by the administrator.'
      );
      setShowLicenseModal(true);
      return false;
    }
    if (trialStatus.machineMismatch) {
      showErrorToast(
        isHindi
          ? '🚨 लाइसेंस किसी अन्य PC (Machine ID) का है। इस कंप्यूटर की वैध कुंजी दर्ज करें।'
          : '🚨 Machine ID mismatch! Activate a license key bound to this PC.'
      );
      setShowLicenseModal(true);
      return false;
    }
    if (!isExistingRecord && trialStatus.isTrialExpired && isCustomerView) {
      showErrorToast(
        trialStatus.lockReason === 'TRIAL_VOUCHERS_EXCEEDED'
          ? (isHindi
              ? `🔴 ट्रायल के 50 वाउचर पूरे हो चुके हैं (${trialStatus.vouchersUsed}/50)। नया बिल बनाने के लिए लाइसेंस एक्टिवेट करें।`
              : `🔴 50-Voucher Trial Limit Reached (${trialStatus.vouchersUsed}/50). Activate License to add more entries.`)
          : (isHindi
              ? '🔴 7-दिवसीय ट्रायल समाप्त हो चुका है। नया बिल/वाउचर बनाने के लिए लाइसेंस एक्टिवेट करें।'
              : '🔴 7-Day Free Trial Expired. Activate your License Key to create new entries.')
      );
      setShowLicenseModal(true);
      return false;
    }
    return true;
  };

  // Handler: Refresh & Sync Data
  const handleRefreshData = () => {
    const latestData = loadAppData(sessionUser?.id, sessionUser?.email || firebaseUser?.email);
    setData({ ...latestData });
    const msg = isHindi
      ? '🔄 सॉफ़्टवेयर एवं डेटा सफलतापूर्वक रिफ्रेश और सिंक हो गया है!'
      : '🔄 Software and data refreshed & synced successfully!';
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Sync Session User to user-scoped localStorage
  const handleLoginSuccess = (user: UserProfile) => {
    setActiveStorageUserId(user.id);
    const loaded = loadAppData(user.id, user.email);
    setData(loaded);
    setSessionUser(user);
    setActiveUser(user);
    setIsUnlocked(!loaded.pinRequired || !loaded.securityPin);
    localStorage.setItem('sna_auth_session', JSON.stringify(user));
  };

  const handleLogout = () => {
    setActiveStorageUserId(null);
    localStorage.removeItem('sna_auth_session');
    setSessionUser(null);
    setFirebaseUser(null);
    setIsUnlocked(false);
    setData(createFreshAppData(undefined, undefined, null));
    signOut(auth).catch(() => {});
  };

  const handleRegisterUser = (newUser: UserProfile) => {
    // Allow unauthenticated signup from AuthScreen; require RBAC inside authenticated session
    if (sessionUser && !requirePermission(rbac.canManageUsersAndPin, 'नया उपयोगकर्ता जोड़ना', 'register new users')) return;
    const updatedUsers = [...registeredUsers, newUser];
    setRegisteredUsers(updatedUsers);
    const updatedData = { ...data, userProfiles: updatedUsers };
    setData(updatedData);
    saveAppData(updatedData, sessionUser?.id);
  };

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    if (!requirePermission(rbac.canManageUsersAndPin, 'उपयोगकर्ता भूमिका बदलना', 'change user roles')) return;
    if (!canManageTargetRole(effectiveRole, newRole)) {
      showErrorToast(getRbacDenialMessage(`भूमिका "${newRole}" सौंपना`, `assign role "${newRole}"`, effectiveRole, isHindi));
      return;
    }

    const baseProfiles = data.userProfiles && data.userProfiles.length > 0 ? data.userProfiles : registeredUsers;
    const targetUser = baseProfiles.find(u => u.id === userId);
    if (targetUser && !canManageTargetRole(effectiveRole, targetUser.role)) {
      showErrorToast(getRbacDenialMessage(`"${targetUser.role}" उपयोगकर्ता की भूमिका बदलना`, `modify "${targetUser.role}" user`, effectiveRole, isHindi));
      return;
    }

    const updatedProfiles = baseProfiles.map(u =>
      u.id === userId ? { ...u, role: newRole, permissions: newRole === 'ADMIN' ? ['all'] : [newRole.toLowerCase()] } : u
    );
    setRegisteredUsers(updatedProfiles);

    const updatedActiveUser = activeUser.id === userId ? { ...activeUser, role: newRole } : activeUser;
    if (activeUser.id === userId) {
      setActiveUser(updatedActiveUser);
    }

    const updatedData = logAuditAction(
      { ...data, userProfiles: updatedProfiles, activeUser: updatedActiveUser },
      'User Role Changed',
      `Role updated to ${newRole} for ${targetUser?.name || userId} by ${activeUser.name} (${effectiveRole})`
    );
    setData(updatedData);
    saveAppData(updatedData, sessionUser?.id);

    if (storageMode !== 'local' && firebaseUser && firebaseUser.emailVerified) {
      try {
        const companyId = `cmp_${firebaseUser.uid}`;
        const now = Date.now();
        await setDoc(
          doc(db, 'companies', companyId, 'members', userId),
          {
            uid: userId,
            companyId,
            email: targetUser?.email || '',
            name: targetUser?.name || '',
            role: newRole,
            updatedAtMs: now,
            updatedAtIso: new Date(now).toISOString(),
          },
          { merge: true }
        );
      } catch (err) {
        console.warn('Firestore member role sync notice:', JSON.stringify(buildFirestoreErrorInfo(err, OperationType.WRITE, `companies/cmp_${firebaseUser.uid}/members/${userId}`)));
      }
    }
  };

  const handleResetUserPassword = (targetEmail: string, newPass: string) => {
    if (sessionUser && !requirePermission(rbac.canManageUsersAndPin, 'पासवर्ड रीसेट करना', 'reset user passwords')) return;
    const cleanEmail = targetEmail.trim().toLowerCase();
    const currentUsers = data.userProfiles && data.userProfiles.length > 0 ? data.userProfiles : registeredUsers;
    let matched = false;
    const updatedUsers = currentUsers.map(u => {
      if (u.email.toLowerCase() === cleanEmail) {
        matched = true;
        return { ...u, password: newPass };
      }
      return u;
    });

    if (!matched) {
      updatedUsers.push({
        id: 'usr_' + Date.now(),
        name: cleanEmail.split('@')[0] || 'Administrator',
        role: 'ADMIN',
        email: targetEmail,
        password: newPass,
        pin: data.securityPin || ''
      });
    }

    setRegisteredUsers(updatedUsers);
    const updatedData = logAuditAction(
      { ...data, userProfiles: updatedUsers },
      'User Password Reset',
      `Password reset successfully for ${targetEmail}`
    );
    setData(updatedData);
    saveAppData(updatedData, sessionUser?.id);
  };

  // Handler: Save License
  const handleRestoreData = (restored: AppData) => {
    if (!requirePermission(rbac.canResetWorkspace && rbac.canUseAdminBackup, 'बैकअप रीस्टोर करना', 'restore JSON backup')) return;
    const scopedRestored = sessionUser?.id
      ? { ...restored, company: { ...restored.company, id: `cmp_${sessionUser.id}` } }
      : restored;
    const updated = logAuditAction(scopedRestored, 'Backup Restored', `Restored system data backup for ${scopedRestored.company.name}`);
    setData(updated);
    saveAppData(updated, sessionUser?.id);
  };

  const handleSaveLicense = (license: LicenseInfo) => {
    if (!requirePermission(rbac.canManageUsersAndPin, 'लाइसेंस सक्रिय करना', 'manage software license')) return;
    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.saveLicenseState) {
      window.hisabvedaDesktop.saveLicenseState(license).catch(() => {});
    }
    const updated = logAuditAction(
      { ...data, license },
      'License Activated',
      `Commercial software license registered to ${license.registeredOwner} (${license.licenseKey})`
    );
    setData(updated);
    saveAppData(updated, sessionUser?.id);
    if (storageMode !== 'local' && firebaseUser && isEmailVerified) {
      pushAppDataToCloud({
        ...updated,
        company: { ...updated.company, id: `cmp_${firebaseUser.uid}` },
      }).catch(() => {});
    }
  };

  // Sync data to user-scoped localStorage only when authenticated
  useEffect(() => {
    if (sessionUser?.id) {
      saveAppData(data, sessionUser.id);
    }
  }, [data, sessionUser?.id]);

  // Sync global currency formatting (Indian Lakhs/Crores vs International Millions) with active company
  useEffect(() => {
    const profile = resolveCompanyTaxProfile(data.company);
    setActiveNumberFormat(profile.numberFormat);
  }, [data.company]);

  // Handler: Update Currency
  const handleUpdateCurrency = (curr: Currency) => {
    if (!requirePermission(rbac.canEditCompanySettings, 'मुद्रा बदलना', 'change company currency')) return;
    const defaultNumberFormat = curr === 'INR' ? 'INDIAN' : 'INTERNATIONAL';
    const updatedCompany: CompanyDetails = {
      ...data.company,
      currency: curr,
      numberFormat: data.company.numberFormat || defaultNumberFormat,
    };
    setActiveNumberFormat(updatedCompany.numberFormat);
    const updated = logAuditAction({ ...data, company: updatedCompany }, 'Currency Changed', `Updated app currency to ${curr}`);
    setData(updated);
  };

  // Handler: Edit Invoice
  const handleEditInvoice = (inv: SalesInvoice) => {
    if (!requirePermission(rbac.canCreateEditTransactions, 'इनवॉइस संपादित करना', 'edit sales invoices')) return;
    setEditingInvoice(inv);
    setShowInvoiceModal(true);
  };

  // Handler: Save Sales Invoice
  const handleSaveInvoice = (inv: SalesInvoice, options?: { autoPrint?: boolean; fromPos?: boolean }) => {
    if (!requirePermission(rbac.canCreateEditTransactions, 'सेल इनवॉइस बनाना/संपादित करना', 'create or edit sales invoices')) return;
    const isExisting = data.invoices.some(i => i.id === inv.id);
    if (!requireActiveLicenseForEntry(isExisting)) return;
    if (!inv.invoiceNumber || !inv.invoiceNumber.trim()) {
      showErrorToast(isHindi ? 'इनवॉइस नंबर आवश्यक है।' : 'Invoice Number is required.');
      return;
    }
    const duplicateInv = data.invoices.some(
      i => i.id !== inv.id && i.invoiceNumber.trim().toLowerCase() === inv.invoiceNumber.trim().toLowerCase()
    );
    if (duplicateInv) {
      showErrorToast(isHindi ? `इनवॉइस नंबर "${inv.invoiceNumber}" पहले से मौजूद है।` : `Duplicate Invoice Number "${inv.invoiceNumber}" already exists.`);
      return;
    }
    if (!isDateInFinancialYear(inv.date, selectedFYStart)) {
      showErrorToast(
        isHindi
          ? `अमान्य तिथि (${inv.date}): सेल इनवॉइस सक्रिय वित्तीय वर्ष ${activeFyRange.label} (${activeFyRange.displayRange}) के भीतर होना चाहिए।`
          : `Invalid date (${inv.date}): Sales Invoice must fall within active ${activeFyRange.label} (${activeFyRange.displayRange}).`
      );
      return;
    }
    const currentConfig = loadAppConfig();
    if (isDateLockedByBooksLock(inv.date, currentConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${currentConfig.booksLockDate} या उससे पहले की तिथि में इनवॉइस सेव नहीं किया जा सकता।`
          : `Books Locked: Invoices dated on or before ${currentConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }
    if ((inv.grandTotal || 0) <= 0) {
      showErrorToast(isHindi ? 'इनवॉइस की कुल राशि 0 से अधिक होनी चाहिए।' : 'Invoice Grand Total must be greater than zero.');
      return;
    }

    const oldInv = isExisting ? data.invoices.find(i => i.id === inv.id) : null;
    const updatedInvoices = isExisting
      ? data.invoices.map(i => i.id === inv.id ? inv : i)
      : [inv, ...data.invoices];

    const stockBatchResult = currentConfig.accountingWithoutInventory
      ? { items: data.items, itemBatches: data.itemBatches || [] }
      : applySalesInvoiceStockAndBatchChanges({
          items: data.items,
          batches: data.itemBatches || [],
          godowns: data.godowns,
          previousInvoice: oldInv,
          nextInvoice: inv,
        });

    const updatedData = logAuditAction(
      {
        ...data,
        godowns: ensureGodowns(data.godowns),
        invoices: updatedInvoices,
        items: stockBatchResult.items,
        itemBatches: stockBatchResult.itemBatches,
      },
      isExisting ? 'Sales Invoice Updated' : (options?.fromPos ? 'POS Bill Completed' : 'Sales Invoice Created'),
      `Invoice ${inv.invoiceNumber} ${isExisting ? 'updated' : 'created'} for ${inv.partyName} (Total: ${inv.grandTotal}) by ${activeUser.name} [${currentConfig.accountingWithoutInventory ? 'Accounts-Only Mode' : 'Stock & Batch Adjusted'}]`
    );

    setData(updatedData);
    saveAppData(updatedData);
    if (!options?.fromPos) {
      setShowInvoiceModal(false);
      setEditingInvoice(null);
    }
    if (options?.autoPrint !== false) {
      setPrintInvoice(inv);
    }
  };

  // Handler: Save Purchase Bill (Increases Stock Inflow & Creates Item/Party Ledgers for ALL line items)
  const handleSavePurchaseBill = (bill: PurchaseInvoice) => {
    if (!requirePermission(rbac.canCreateEditVouchers, 'परचेज बिल सेव करना', 'create or edit purchase bills')) return;
    const isExistingBill = data.purchaseInvoices.some(b => b.id === bill.id);
    if (!requireActiveLicenseForEntry(isExistingBill)) return;
    if (!bill.supplierInvoiceNo || !bill.supplierInvoiceNo.trim()) {
      showErrorToast(isHindi ? 'सप्लायर बिल नंबर आवश्यक है।' : 'Supplier Invoice Number is required.');
      return;
    }
    if (!isDateInFinancialYear(bill.date, selectedFYStart)) {
      showErrorToast(
        isHindi
          ? `बिल दिनांक अमान्य (${bill.date}): परचेज बिल सक्रिय वित्तीय वर्ष ${activeFyRange.label} (${activeFyRange.displayRange}) के भीतर होना चाहिए। पुराना बिल अपलोड करने के लिए पहले हेडर से वह वित्तीय वर्ष चुनें।`
          : `Out-of-FY Bill Date (${bill.date}): Purchase Bill date must fall within active ${activeFyRange.label} (${activeFyRange.displayRange}). Switch the Financial Year in the top header to record prior-year bills.`
      );
      return;
    }
    const currentConfig = loadAppConfig();
    if (isDateLockedByBooksLock(bill.date, currentConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${currentConfig.booksLockDate} या उससे पहले की तिथि में परचेज बिल सेव नहीं किया जा सकता।`
          : `Books Locked: Purchase bills dated on or before ${currentConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }
    if ((bill.grandTotal || 0) <= 0 || !bill.items || bill.items.length === 0) {
      showErrorToast(isHindi ? 'परचेज बिल की राशि 0 से अधिक होनी चाहिए।' : 'Purchase Bill total must be greater than zero.');
      return;
    }
    const duplicateVendorBill = (data.purchaseInvoices || []).some(
      b =>
        b.id !== bill.id &&
        b.partyId === bill.partyId &&
        b.supplierInvoiceNo.trim().toLowerCase() === bill.supplierInvoiceNo.trim().toLowerCase()
    );
    if (duplicateVendorBill) {
      showErrorToast(
        isHindi
          ? `डुप्लीकेट बिल नंबर: सप्लायर बिल "${bill.supplierInvoiceNo}" इस विक्रेता के लिए पहले से दर्ज है।`
          : `Duplicate Bill: Supplier Invoice "${bill.supplierInvoiceNo}" already exists for this vendor.`
      );
      return;
    }

    setData(prev => {
      const existingBills = prev.purchaseInvoices || [];
      const oldBill = existingBills.find(b => b.id === bill.id);
      const isExisting = !!oldBill;
      let updatedBills: PurchaseInvoice[];

      const godownsList = ensureGodowns(prev.godowns);
      const destGodownId = bill.godownId || resolveDefaultGodownId(godownsList);
      let catalogItems = [...prev.items];
      let normalizedBill: PurchaseInvoice = bill;
      let updatedItems = prev.items;
      let updatedBatches = prev.itemBatches || [];

      if (!currentConfig.accountingWithoutInventory) {
        // 1. Ensure/Auto-Create ItemMaster records first with normalized itemIds (0 initial stock for newly created items so applyPurchaseBillStockAndBatchChanges adds qty once)
        const normalizedBillItems = bill.items.map((line, idx) => {
          const lineName = String(line.itemName || '').trim();
          if (!lineName) return line;

          const itemIdx = catalogItems.findIndex(
            item => (line.itemId && item.id === line.itemId && item.name.toLowerCase().trim() === lineName.toLowerCase()) ||
                    item.name.toLowerCase().trim() === lineName.toLowerCase()
          );

          if (itemIdx !== -1) {
            const existing = catalogItems[itemIdx];
            const nextPurchasePrice = Number(line.rate) > 0 ? Number(line.rate) : existing.purchasePrice;
            const rateChanged = Math.abs((Number(existing.purchasePrice) || 0) - (Number(nextPurchasePrice) || 0)) > 0.0005;
            catalogItems[itemIdx] = {
              ...existing,
              purchasePrice: nextPurchasePrice,
              mrp: line.mrp !== undefined && line.mrp > 0 ? line.mrp : existing.mrp,
              hsnSacCode: line.hsnSacCode || existing.hsnSacCode,
              unit: line.unit || existing.unit,
              taxRate: line.taxRate !== undefined ? line.taxRate : existing.taxRate,
              gstRate: line.taxRate !== undefined ? line.taxRate : existing.gstRate,
              trackBatchExpiry: existing.trackBatchExpiry || Boolean(line.batchNumber || line.expiryDate),
              ...(rateChanged
                ? {
                    closingStockValue: undefined,
                    importedClosingQty: undefined,
                    importedPurchasePrice: undefined,
                  }
                : {}),
            };
            return { ...line, itemId: existing.id, godownId: line.godownId || destGodownId };
          } else {
            const newItemId = (line.itemId && !catalogItems.some(i => i.id === line.itemId))
              ? line.itemId
              : ('itm_bill_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 7));

            const newItem: ItemMaster = {
              id: newItemId,
              code: 'ITEM-' + String(Math.floor(Math.random() * 9000) + 1000),
              name: lineName,
              description: lineName,
              hsnSacCode: line.hsnSacCode || '8471',
              unit: line.unit || 'PCS',
              purchasePrice: Number(line.rate) || 0,
              salesPrice: Math.round((Number(line.rate) || 0) * 1.2),
              sellingPrice: Math.round((Number(line.rate) || 0) * 1.2),
              mrp: line.mrp,
              taxRate: line.taxRate !== undefined ? line.taxRate : 18,
              gstRate: line.taxRate !== undefined ? line.taxRate : 18,
              currentStock: 0,
              minStockLevel: 5,
              category: 'Purchases',
              defaultGodownId: destGodownId,
              godownStocks: { [destGodownId]: 0 },
              trackBatchExpiry: Boolean(line.batchNumber || line.expiryDate),
            };
            catalogItems.push(newItem);
            return { ...line, itemId: newItemId, godownId: line.godownId || destGodownId };
          }
        });

        normalizedBill = {
          ...bill,
          godownId: destGodownId,
          items: normalizedBillItems,
        };

        const stockBatchRes = applyPurchaseBillStockAndBatchChanges({
          items: catalogItems,
          batches: prev.itemBatches || [],
          godowns: godownsList,
          previousBill: oldBill,
          nextBill: normalizedBill,
        });
        updatedItems = stockBatchRes.items;
        updatedBatches = stockBatchRes.itemBatches;
      }

      updatedBills = isExisting
        ? existingBills.map(b => b.id === bill.id ? normalizedBill : b)
        : [normalizedBill, ...existingBills];

      // 2. Update / Auto-Create Party in Vendor Directory
      let updatedParties = [...prev.parties];
      const partyIdx = updatedParties.findIndex(
        p => p.id === bill.partyId || 
             (bill.partyGstin && p.gstin && p.gstin.trim() !== '' && p.gstin.trim().toUpperCase() === bill.partyGstin.trim().toUpperCase()) ||
             p.name.toLowerCase().trim() === bill.partyName.toLowerCase().trim()
      );
      if (partyIdx === -1 && bill.partyName) {
        const newPartyId = bill.partyId || ('party_ven_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        updatedParties.push({
          id: newPartyId,
          code: 'VEN-' + String(Math.floor(Math.random() * 9000) + 1000),
          name: bill.partyName,
          type: 'VENDOR',
          gstin: bill.partyGstin || 'URP',
          pan: bill.partyGstin && bill.partyGstin.length >= 12 ? bill.partyGstin.substring(2, 12) : '',
          email: '',
          phone: '',
          address: '',
          state: bill.partyState || prev.company.state || 'Delhi',
          stateCode: '07',
          creditLimit: 100000,
          openingBalance: 0,
          balanceType: 'CR',
          gstCategory: bill.partyGstin && bill.partyGstin !== 'URP' ? 'REGULAR' : 'UNREGISTERED'
        });
      }

      const updatedData = logAuditAction(
        {
          ...prev,
          godowns: godownsList,
          purchaseInvoices: updatedBills,
          items: updatedItems,
          itemBatches: updatedBatches,
          parties: updatedParties
        },
        isExisting ? 'Purchase Bill Updated' : 'Purchase Bill Recorded',
        `Purchase Bill ${bill.billNumber} (Supplier Inv: ${bill.supplierInvoiceNo}) recorded for ${bill.partyName} with ${bill.items.length} item(s) (Total: ₹${bill.grandTotal})${currentConfig.accountingWithoutInventory ? ' [Accounts-Only Mode]' : ''}`
      );

      saveAppData(updatedData);
      return updatedData;
    });

    const toast = currentConfig.accountingWithoutInventory
      ? (isHindi
          ? `✅ परचेज बिल #${bill.billNumber} सेव हुआ! (Accounts-Only मोड: कोई स्टॉक प्रविष्टि नहीं)`
          : `✅ Purchase Bill #${bill.billNumber} saved! (Accounts-Only Mode: no inventory stock affected)`)
      : (isHindi 
          ? `✅ परचेज बिल #${bill.billNumber} सेव हुआ! (${bill.items.length} आइटम लेजर व इन्वेंटरी स्टॉक अपडेट हो गए)`
          : `✅ Purchase Bill #${bill.billNumber} saved! (${bill.items.length} item ledgers and stock updated)`);
    setToastMessage(toast);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Handler: Save Purchase Order
  const handleSavePurchaseOrder = (po: PurchaseOrder) => {
    if (!requirePermission(rbac.canCreateEditVouchers, 'परचेज ऑर्डर बनाना', 'create or edit purchase orders')) return;
    const existingPOs = data.purchaseOrders || [];
    const isExisting = existingPOs.some(p => p.id === po.id);
    let updatedPOs: PurchaseOrder[];

    if (isExisting) {
      updatedPOs = existingPOs.map(p => p.id === po.id ? po : p);
    } else {
      updatedPOs = [po, ...existingPOs];
    }

    const updatedData = logAuditAction(
      { ...data, purchaseOrders: updatedPOs },
      isExisting ? 'Purchase Order Updated' : 'Purchase Order Issued',
      `Purchase Order ${po.poNumber} issued to ${po.partyName} (Total: ${po.grandTotal})`
    );

    setData(updatedData);
  };

  const handleDeletePurchaseOrder = (id: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'परचेज ऑर्डर डिलीट करना', 'delete purchase orders')) return;
    const updatedPOs = (data.purchaseOrders || []).filter(p => p.id !== id);
    const updatedData = logAuditAction(
      { ...data, purchaseOrders: updatedPOs },
      'Purchase Order Deleted',
      `Deleted purchase order ref #${id}`
    );
    setData(updatedData);
  };

  // Handlers for Multi-Company (With isolated company databases)
  const handleSwitchCompany = (cmp: CompanyDetails) => {
    if (!requirePermission(rbac.canManageCompanies, 'कंपनी स्विच करना', 'switch active companies')) return;
    const stores = data.companiesStores || {};
    const currentCmpId = data.company.id || 'cmp_1';

    // Store current active company's data in stores map
    const updatedStores = {
      ...stores,
      [currentCmpId]: {
        accounts: data.accounts,
        items: data.items,
        parties: data.parties,
        invoices: data.invoices,
        purchaseOrders: data.purchaseOrders,
        purchaseInvoices: data.purchaseInvoices,
        vouchers: data.vouchers,
        debitCreditNotes: data.debitCreditNotes,
        bankStatements: data.bankStatements,
        budgets: data.budgets,
        employees: data.employees || [],
        payrolls: data.payrolls || [],
        godowns: data.godowns || [],
        itemBatches: data.itemBatches || [],
        stockTransfers: data.stockTransfers || [],
      }
    };

    const freshBlankAccounts = createDefaultChartOfAccounts();
    const targetStore = updatedStores[cmp.id || 'cmp_1'];
    const existingCompanies = data.companiesList || [{ ...data.company }];
    const updatedCompanies = existingCompanies.map(c => (c.id === cmp.id || c.name === cmp.name) ? cmp : c);

    const nextData: AppData = (targetStore && targetStore.accounts && targetStore.accounts.length > 0) ? {
      ...data,
      company: cmp,
      accounts: targetStore.accounts,
      items: targetStore.items || [],
      parties: targetStore.parties || [],
      invoices: targetStore.invoices || [],
      purchaseOrders: targetStore.purchaseOrders || [],
      purchaseInvoices: targetStore.purchaseInvoices || [],
      vouchers: targetStore.vouchers || [],
      debitCreditNotes: targetStore.debitCreditNotes || [],
      bankStatements: targetStore.bankStatements || [],
      budgets: targetStore.budgets || [],
      employees: targetStore.employees || [],
      payrolls: targetStore.payrolls || [],
      godowns: targetStore.godowns,
      itemBatches: targetStore.itemBatches || [],
      stockTransfers: targetStore.stockTransfers || [],
      companiesList: updatedCompanies,
      companiesStores: updatedStores
    } : {
      ...data,
      company: cmp,
      accounts: freshBlankAccounts,
      items: [],
      parties: [],
      invoices: [],
      purchaseOrders: [],
      purchaseInvoices: [],
      vouchers: [],
      debitCreditNotes: [],
      bankStatements: [],
      budgets: [],
      employees: [],
      payrolls: [],
      godowns: undefined,
      itemBatches: [],
      stockTransfers: [],
      companiesList: updatedCompanies,
      companiesStores: updatedStores
    };

    const nextMode = cmp.negativeStockMode;
    if (nextMode) {
      setAppConfig((prevCfg) => {
        const nextCfg: AppConfiguration = {
          ...prevCfg,
          negativeStockMode: nextMode,
          negativeStockWarning: nextMode !== 'ALLOW',
        };
        saveAppConfig(nextCfg);
        return nextCfg;
      });
    }

    const updated = logAuditAction(
      nextData,
      'Active Company Switched',
      `Switched working dataset company to ${cmp.name} (FY Start: ${cmp.financialYearStart || '01-04-2026'}, Books Start: ${cmp.booksBeginningFrom || '01-04-2026'})`
    );
    setData(updated);
    saveAppData(updated);
  };

  const handleCreateNewCompany = (newCompany: CompanyDetails) => {
    if (!requirePermission(rbac.canManageCompanies, 'नई कंपनी बनाना', 'create new companies')) return;
    const stores = data.companiesStores || {};
    const currentCmpId = data.company.id || 'cmp_1';

    // Store current active company data before switching
    const updatedStores = {
      ...stores,
      [currentCmpId]: {
        accounts: data.accounts,
        items: data.items,
        parties: data.parties,
        invoices: data.invoices,
        purchaseOrders: data.purchaseOrders,
        purchaseInvoices: data.purchaseInvoices,
        vouchers: data.vouchers,
        debitCreditNotes: data.debitCreditNotes,
        bankStatements: data.bankStatements,
        budgets: data.budgets,
        employees: data.employees || [],
        payrolls: data.payrolls || [],
        godowns: data.godowns || [],
        itemBatches: data.itemBatches || [],
        stockTransfers: data.stockTransfers || [],
      }
    };

    const newCmpId = newCompany.id || 'cmp_' + Date.now();
    const companyWithId = { ...newCompany, id: newCmpId };

    const list = data.companiesList || [data.company];
    const updatedList = [...list.filter(c => c.id !== newCmpId), companyWithId];

    // Create 100% BLANK dataset with fresh system chart of accounts (0 opening balance) for the NEW company
    const freshAccounts = createDefaultChartOfAccounts();

    const blankCompanyData: AppData = {
      ...data,
      company: companyWithId,
      accounts: freshAccounts,
      items: [], // BLANK ITEMS
      parties: [], // BLANK PARTIES
      invoices: [], // BLANK INVOICES
      vouchers: [], // BLANK VOUCHERS
      purchaseOrders: [], // BLANK PURCHASES
      purchaseInvoices: [],
      debitCreditNotes: [],
      bankStatements: [],
      budgets: [],
      employees: [], // BLANK EMPLOYEES
      payrolls: [], // BLANK PAYROLLS
      godowns: undefined,
      itemBatches: [],
      stockTransfers: [],
      companiesList: updatedList,
      companiesStores: {
        ...updatedStores,
        [newCmpId]: {
          accounts: freshAccounts,
          items: [],
          parties: [],
          invoices: [],
          vouchers: [],
          purchaseOrders: [],
          purchaseInvoices: [],
          debitCreditNotes: [],
          bankStatements: [],
          budgets: [],
          employees: [],
          payrolls: [],
          godowns: [],
          itemBatches: [],
          stockTransfers: [],
        }
      }
    };

    const nextProfile = resolveCompanyTaxProfile(companyWithId);
    setActiveNumberFormat(nextProfile.numberFormat);
    setAppConfig((prevCfg) => {
      const nextCfg: AppConfiguration = {
        ...prevCfg,
        enableTds: nextProfile.tdsTcsEnabled,
        maintainBatches: nextProfile.batchGodownEnabled,
        ...(companyWithId.negativeStockMode
          ? {
              negativeStockMode: companyWithId.negativeStockMode,
              negativeStockWarning: companyWithId.negativeStockMode !== 'ALLOW',
            }
          : {}),
      };
      saveAppConfig(nextCfg);
      return nextCfg;
    });

    const updated = logAuditAction(
      blankCompanyData,
      'New Company Created',
      `Created fresh blank dataset for ${companyWithId.name} (FY Start: ${companyWithId.financialYearStart || '01-04-2026'}, Books Start: ${companyWithId.booksBeginningFrom || '01-04-2026'})`
    );
    setData(updated);
    saveAppData(updated);
  };

  const handleDeleteCompany = (companyId: string) => {
    if (!requirePermission(rbac.canManageCompanies, 'कंपनी डिलीट करना', 'delete companies')) return;
    const list = data.companiesList && data.companiesList.length > 0 ? data.companiesList : [data.company];
    if (list.length <= 1) {
      showErrorToast(
        isHindi
          ? 'कम से कम एक सक्रिय कंपनी रहना आवश्यक है।'
          : 'At least one company profile must remain active.'
      );
      return;
    }

    const updatedList = list.filter(c => c.id !== companyId && c.name !== companyId);
    const stores = { ...(data.companiesStores || {}) };
    delete stores[companyId];

    const deletingActive = data.company.id === companyId || data.company.name === companyId;
    let updatedData: AppData;

    if (deletingActive && updatedList.length > 0) {
      const nextCmp = updatedList[0];
      const nextKey = nextCmp.id || 'cmp_1';
      const nextStore = stores[nextKey];
      const freshAccounts = createDefaultChartOfAccounts();

      updatedData = logAuditAction(
        {
          ...data,
          company: nextCmp,
          accounts: (nextStore?.accounts && nextStore.accounts.length > 0) ? nextStore.accounts : freshAccounts,
          items: nextStore?.items || [],
          parties: nextStore?.parties || [],
          invoices: nextStore?.invoices || [],
          purchaseOrders: nextStore?.purchaseOrders || [],
          purchaseInvoices: nextStore?.purchaseInvoices || [],
          vouchers: nextStore?.vouchers || [],
          debitCreditNotes: nextStore?.debitCreditNotes || [],
          bankStatements: nextStore?.bankStatements || [],
          budgets: nextStore?.budgets || [],
          employees: nextStore?.employees || [],
          payrolls: nextStore?.payrolls || [],
          godowns: nextStore?.godowns,
          itemBatches: nextStore?.itemBatches || [],
          stockTransfers: nextStore?.stockTransfers || [],
          companiesList: updatedList,
          companiesStores: stores
        },
        'Active Company Deleted & Switched',
        `Deleted company ${companyId} and switched active workspace to ${nextCmp.name}`
      );
    } else {
      updatedData = logAuditAction(
        {
          ...data,
          companiesList: updatedList,
          companiesStores: stores
        },
        'Company Deleted',
        `Deleted company profile ${companyId}`
      );
    }

    setData(updatedData);
    saveAppData(updatedData, sessionUser?.id);
    setToastMessage(
      isHindi
        ? '🗑️ कंपनी सफलतापूर्वक डिलीट कर दी गई है!'
        : '🗑️ Company deleted cleanly!'
    );
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleShiftFinancialYear = (newFYStart: string) => {
    if (!requirePermission(rbac.canManageCompanies, 'वित्तीय वर्ष बदलना (Year Shift)', 'shift company financial year')) return;
    const { newCompany, newAccounts, newParties } = performFinancialYearShift(data, newFYStart);

    const stores = data.companiesStores || {};
    const currentCmpId = data.company.id || 'cmp_1';

    // Store current active company data before shifting
    const updatedStores = {
      ...stores,
      [currentCmpId]: {
        accounts: data.accounts,
        items: data.items,
        parties: data.parties,
        invoices: data.invoices,
        purchaseOrders: data.purchaseOrders,
        purchaseInvoices: data.purchaseInvoices,
        vouchers: data.vouchers,
        debitCreditNotes: data.debitCreditNotes,
        bankStatements: data.bankStatements,
        budgets: data.budgets,
        employees: data.employees || [],
        payrolls: data.payrolls || [],
        godowns: data.godowns || [],
        itemBatches: data.itemBatches || [],
        stockTransfers: data.stockTransfers || [],
      }
    };

    const newCmpId = newCompany.id;
    const list = data.companiesList || [data.company];
    const updatedList = [...list, newCompany];

    // Create New FY AppData with carried forward Accounts, Parties, Stock Items
    const newFyAppData: AppData = {
      ...data,
      company: newCompany,
      accounts: newAccounts,
      parties: newParties,
      items: data.items, // Keep stock items
      godowns: data.godowns,
      itemBatches: data.itemBatches || [],
      stockTransfers: data.stockTransfers || [],
      employees: data.employees || [], // Keep employees
      invoices: [], // Reset vouchers for new FY
      purchaseOrders: [],
      purchaseInvoices: [],
      vouchers: [],
      debitCreditNotes: [],
      bankStatements: [],
      budgets: [],
      payrolls: [],
      companiesList: updatedList,
      companiesStores: {
        ...updatedStores,
        [newCmpId]: {
          accounts: newAccounts,
          items: data.items,
          parties: newParties,
          invoices: [],
          vouchers: [],
          purchaseOrders: [],
          purchaseInvoices: [],
          debitCreditNotes: [],
          bankStatements: [],
          budgets: [],
          employees: data.employees || [],
          payrolls: [],
          godowns: data.godowns || [],
          itemBatches: data.itemBatches || [],
          stockTransfers: data.stockTransfers || [],
        }
      }
    };

    const updated = logAuditAction(
      newFyAppData,
      'Financial Year Shifted',
      `Shifted to new Financial Year starting ${newFYStart} for ${newCompany.name}. Carried forward ${newParties.length} parties and ${newAccounts.length} ledgers.`
    );
    setData(updated);
    saveAppData(updated);
    setSelectedFYStart(normalizeFYStartDate(newFYStart));
  };

  // Handler: Switch active operator profile without overwriting verified Firebase Auth sessionUser
  const handleSwitchUser = (user: UserProfile) => {
    setActiveUser(user);
    const updatedData = logAuditAction(
      { ...data, activeUser: user },
      'Active User Switched',
      `Switched active operator to ${user.name} (${user.role})`
    );
    setData(updatedData);
  };

  // Handler: Save Debit / Credit Note
  const handleSaveDebitCreditNote = (note: DebitCreditNote) => {
    if (!requirePermission(rbac.canCreateEditVouchers, 'डेबिट/क्रेडिट नोट सेव करना', 'create or edit Debit/Credit Notes')) return;
    if (!note.noteNumber || !note.noteNumber.trim()) {
      showErrorToast(isHindi ? 'नोट नंबर आवश्यक है।' : 'Debit/Credit Note number is required.');
      return;
    }
    if (!isDateInFinancialYear(note.date, selectedFYStart)) {
      showErrorToast(
        isHindi
          ? `तिथि अमान्य (${note.date}): डेबिट/क्रेडिट नोट सक्रिय वित्तीय वर्ष ${activeFyRange.label} के भीतर होना चाहिए।`
          : `Invalid date (${note.date}): Note date must fall within active ${activeFyRange.label} (${activeFyRange.displayRange}).`
      );
      return;
    }
    const appConfig = loadAppConfig();
    if (isDateLockedByBooksLock(note.date, appConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं: ${appConfig.booksLockDate} या उससे पहले की तिथि में नोट सेव नहीं किया जा सकता।`
          : `Books Locked: Notes dated on or before ${appConfig.booksLockDate} are frozen in Settings.`
      );
      return;
    }
    if ((note.grandTotal || 0) <= 0) {
      showErrorToast(isHindi ? 'डेबिट/क्रेडिट नोट राशि 0 से अधिक होनी चाहिए।' : 'Note Grand Total must be greater than zero.');
      return;
    }

    const subtotalVal = Math.round((Number(note.subtotal) || 0) * 100) / 100;
    const discountVal = Math.round(Math.max(0, Number(note.totalDiscount) || 0) * 100) / 100;
    const netTaxableVal = Math.max(0, Math.round((subtotalVal - discountVal) * 100) / 100);
    const gstVal = Math.round(((Number(note.cgstAmount) || 0) + (Number(note.sgstAmount) || 0) + (Number(note.igstAmount) || 0)) * 100) / 100;
    let roundOffVal = Math.round((Number(note.roundOff) || 0) * 100) / 100;
    const grandTotalVal = Math.round((Number(note.grandTotal) || 0) * 100) / 100;

    // Auto-route sub-rupee remainder to Round Off ledger if residual is < ₹1
    const baseDr = note.type === 'CREDIT_NOTE' ? subtotalVal + gstVal : grandTotalVal + discountVal;
    const baseCr = note.type === 'CREDIT_NOTE' ? grandTotalVal + discountVal : subtotalVal + gstVal;
    const currentDr = baseDr + (note.type === 'CREDIT_NOTE' ? (roundOffVal < 0 ? Math.abs(roundOffVal) : 0) : (roundOffVal > 0 ? roundOffVal : 0));
    const currentCr = baseCr + (note.type === 'CREDIT_NOTE' ? (roundOffVal > 0 ? roundOffVal : 0) : (roundOffVal < 0 ? Math.abs(roundOffVal) : 0));
    const autoAdj = getAutoRoundOffAdjustment(currentDr, currentCr);
    if (autoAdj) {
      const signedDelta = note.type === 'CREDIT_NOTE'
        ? (autoAdj.credit > 0 ? autoAdj.credit : -autoAdj.debit)
        : (autoAdj.debit > 0 ? autoAdj.debit : -autoAdj.credit);
      roundOffVal = Math.round((roundOffVal + signedDelta) * 100) / 100;
    }

    const finalDr = Math.round((baseDr + (note.type === 'CREDIT_NOTE' ? (roundOffVal < 0 ? Math.abs(roundOffVal) : 0) : (roundOffVal > 0 ? roundOffVal : 0))) * 100) / 100;
    const finalCr = Math.round((baseCr + (note.type === 'CREDIT_NOTE' ? (roundOffVal > 0 ? roundOffVal : 0) : (roundOffVal < 0 ? Math.abs(roundOffVal) : 0))) * 100) / 100;
    if (Math.abs(finalDr - finalCr) >= 0.001 || Math.abs(netTaxableVal + gstVal + roundOffVal - grandTotalVal) >= 0.001) {
      showErrorToast(
        isHindi
          ? `डबल-एंट्री असंतुलित है (Dr: ${finalDr.toFixed(2)}, Cr: ${finalCr.toFixed(2)})। कृपया नोट का कुल जोड़ जाँचें।`
          : `Double-Entry Unbalanced on Note (Dr: ${finalDr.toFixed(2)}, Cr: ${finalCr.toFixed(2)}). Please verify subtotal, discount & tax.`
      );
      return;
    }

    const normalizedNote: DebitCreditNote = {
      ...note,
      subtotal: subtotalVal,
      totalDiscount: discountVal,
      roundOff: roundOffVal,
      grandTotal: grandTotalVal,
    };

    const existing = data.debitCreditNotes || [];
    if (existing.some(n => n.id !== normalizedNote.id && n.noteNumber.trim().toLowerCase() === normalizedNote.noteNumber.trim().toLowerCase())) {
      showErrorToast(isHindi ? `नोट नंबर "${normalizedNote.noteNumber}" पहले से मौजूद है।` : `Duplicate Note Number "${normalizedNote.noteNumber}" already exists.`);
      return;
    }
    const isExistingNote = existing.some(n => n.id === normalizedNote.id);
    const updatedNotes = isExistingNote
      ? existing.map(n => (n.id === normalizedNote.id ? normalizedNote : n))
      : [normalizedNote, ...existing];
    const updatedData = logAuditAction(
      { ...data, debitCreditNotes: updatedNotes },
      normalizedNote.type === 'CREDIT_NOTE' ? (isExistingNote ? 'Credit Note Updated' : 'Credit Note Created') : (isExistingNote ? 'Debit Note Updated' : 'Debit Note Created'),
      `${isExistingNote ? 'Updated' : 'Created'} ${normalizedNote.type} #${normalizedNote.noteNumber} for ${normalizedNote.partyName} (₹${(normalizedNote.grandTotal || 0).toLocaleString('en-IN')})`
    );
    saveAppData(updatedData, sessionUser?.id);
    setData(updatedData);
  };

  // Handler: Delete Invoice (Restores Stock Quantities)
  const handleDeleteInvoice = (invId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'सेल इनवॉइस डिलीट करना', 'delete sales invoices')) return;
    const targetInv = data.invoices.find(i => i.id === invId);
    const appConfig = loadAppConfig();
    if (targetInv && isDateLockedByBooksLock(targetInv.date, appConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं (${appConfig.booksLockDate}): लॉक अवधि का इनवॉइस डिलीट नहीं किया जा सकता।`
          : `Books Locked (${appConfig.booksLockDate}): Cannot delete locked-period invoice.`
      );
      return;
    }
    setData(prev => {
      const inv = prev.invoices.find(i => i.id === invId);
      const updatedInvoices = prev.invoices.filter(i => i.id !== invId);

      const res = applySalesInvoiceStockAndBatchChanges({
        items: prev.items,
        batches: prev.itemBatches || [],
        godowns: prev.godowns,
        previousInvoice: inv || null,
        nextInvoice: null,
      });

      const updatedData = logAuditAction(
        { ...prev, invoices: updatedInvoices, items: res.items, itemBatches: res.itemBatches },
        'Sales Invoice Deleted',
        `Deleted invoice ${inv?.invoiceNumber || invId} for ${inv?.partyName || 'Unknown Party'} [Stock & Batch Restored]`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleDeleteBatchInvoices = (invIds: string[]) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बल्क इनवॉइस डिलीट करना', 'bulk delete sales invoices')) return;
    if (!invIds || invIds.length === 0) return;
    const appConfig = loadAppConfig();
    const idSet = new Set(invIds);
    const hasLocked = data.invoices.some(i => idSet.has(i.id) && isDateLockedByBooksLock(i.date, appConfig.booksLockDate));
    if (hasLocked) {
      showErrorToast(
        isHindi
          ? `चयनित इनवॉइस में लॉक अवधि (${appConfig.booksLockDate} तक) के बिल शामिल हैं, जिन्हें डिलीट नहीं किया जा सकता।`
          : `Selection contains locked-period invoices (on/before ${appConfig.booksLockDate}) which cannot be deleted.`
      );
      return;
    }
    setData(prev => {
      const deletedInvoices = prev.invoices.filter(i => idSet.has(i.id));
      const updatedInvoices = prev.invoices.filter(i => !idSet.has(i.id));

      let curItems = prev.items;
      let curBatches = prev.itemBatches || [];
      deletedInvoices.forEach(inv => {
        const res = applySalesInvoiceStockAndBatchChanges({
          items: curItems,
          batches: curBatches,
          godowns: prev.godowns,
          previousInvoice: inv,
          nextInvoice: null,
        });
        curItems = res.items;
        curBatches = res.itemBatches;
      });

      const updatedData = logAuditAction(
        { ...prev, invoices: updatedInvoices, items: curItems, itemBatches: curBatches },
        'Sales Invoices Deleted',
        `Deleted ${invIds.length} sales invoices in bulk [Stock & Batch Restored]`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  // Handler: Record Invoice Payment
  const handleRecordInvoicePayment = (
    invId: string,
    amount: number,
    paymentMode: string = 'CASH',
    paymentAccountId?: string
  ) => {
    if (!requirePermission(rbac.canCreateEditTransactions, 'इनवॉइस भुगतान दर्ज करना', 'record invoice payments')) return;
    if (!(amount > 0)) return;
    setData(prev => {
      const updatedInvoices = prev.invoices.map(inv => {
        if (inv.id !== invId) return inv;
        const prevPaid = Math.max(0, Number(inv.amountPaid) || 0);
        const newPaid = Math.min(inv.grandTotal, Math.round((prevPaid + amount) * 100) / 100);
        const newStatus = newPaid >= inv.grandTotal - 0.01 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
        const isCashMode = (paymentMode || 'CASH').trim().toUpperCase() === 'CASH';

        let nextBreakdown = inv.paymentBreakdown ? { ...inv.paymentBreakdown } : undefined;
        let nextPaymentAccountId = paymentAccountId || inv.paymentAccountId;
        let nextPaymentMode = paymentMode || inv.paymentMode || 'CASH';

        if (prevPaid > 0.001) {
          if (!nextBreakdown) {
            const prevCashMode = (inv.paymentMode || 'CASH').trim().toUpperCase() === 'CASH';
            nextBreakdown = {
              cash: prevCashMode ? prevPaid : 0,
              upi: prevCashMode ? 0 : prevPaid,
              card: 0,
              credit: Math.max(0, Math.round((inv.grandTotal - prevPaid) * 100) / 100),
            };
          }
          if (isCashMode) {
            nextBreakdown.cash = Math.round(((nextBreakdown.cash || 0) + amount) * 100) / 100;
          } else {
            nextBreakdown.upi = Math.round(((nextBreakdown.upi || 0) + amount) * 100) / 100;
            if (paymentAccountId) nextPaymentAccountId = paymentAccountId;
          }
          nextBreakdown.credit = Math.max(0, Math.round((inv.grandTotal - newPaid) * 100) / 100);
          if (nextBreakdown.cash > 0 && (nextBreakdown.upi > 0 || nextBreakdown.card > 0)) {
            nextPaymentMode = 'SPLIT';
          }
        }

        return {
          ...inv,
          amountPaid: newPaid,
          status: newStatus as any,
          paymentMode: nextPaymentMode,
          paymentAccountId: nextPaymentAccountId,
          paymentBreakdown: nextBreakdown,
        };
      });

      const inv = prev.invoices.find(i => i.id === invId);
      const updatedData = logAuditAction(
        { ...prev, invoices: updatedInvoices },
        'Payment Received',
        `Recorded payment of ${amount} via ${paymentMode} (${paymentAccountId || 'auto ledger'}) for Invoice ${inv?.invoiceNumber}`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  // Handler: Save Voucher (Enforces all Double-Entry & Voucher-Type Golden Rules)
  const handleSaveVoucher = (v: Voucher) => {
    if (!requirePermission(rbac.canCreateEditVouchers, 'वाउचर पोस्ट/संपादित करना', 'create or edit accounting vouchers')) return;
    const appConfig = loadAppConfig();
    const normalizedVoucher = normalizeVoucherWithRoundOff(v, data.accounts);
    const isExisting = data.vouchers.some(x => x.id === normalizedVoucher.id);
    if (!requireActiveLicenseForEntry(isExisting)) return;
    const validation = validateVoucherAccountingRules(
      normalizedVoucher,
      data,
      selectedFYStart,
      appConfig,
      isExisting ? normalizedVoucher.id : undefined
    );
    if (!validation.valid) {
      const firstErr = validation.errors[0];
      showErrorToast(isHindi ? firstErr.hi : firstErr.en);
      return;
    }

    setData(prev => {
      const existingIdx = prev.vouchers.findIndex(x => x.id === normalizedVoucher.id);
      let updatedVouchers = [...prev.vouchers];
      if (existingIdx >= 0) {
        updatedVouchers[existingIdx] = normalizedVoucher;
      } else {
        updatedVouchers = [normalizedVoucher, ...prev.vouchers];
      }
      const updated = logAuditAction(
        { ...prev, vouchers: updatedVouchers },
        existingIdx >= 0 ? 'Voucher Updated' : 'Voucher Posted',
        `${existingIdx >= 0 ? 'Updated' : 'Posted'} ${normalizedVoucher.type} voucher ${normalizedVoucher.voucherNumber} (Amount: ${normalizedVoucher.totalAmount}) by ${activeUser.name}`
      );
      saveAppData(updated, sessionUser?.id);
      return updated;
    });
    setShowJournalModal(false);
    setShowPaymentModal(false);
    setShowReceiptModal(false);
    setShowContraModal(false);
    setEditingVoucher(null);
  };

  const handleEditVoucher = (vch: Voucher) => {
    if (!requirePermission(rbac.canCreateEditVouchers, 'वाउचर संपादित करना', 'edit accounting vouchers')) return;
    setEditingVoucher(vch);
    if (vch.type === 'PAYMENT') setShowPaymentModal(true);
    else if (vch.type === 'RECEIPT') setShowReceiptModal(true);
    else if (vch.type === 'CONTRA') setShowContraModal(true);
    else setShowJournalModal(true);
  };

  const handleBulkReclassifyVouchers = (voucherIds: string[], newCounterAccountId: string) => {
    if (!requirePermission(rbac.canBulkReclassify, 'बल्क लेज़र रीक्लासिफिकेशन', 'bulk reclassify voucher ledgers')) return;
    if (!voucherIds || voucherIds.length === 0) return;
    const appConfig = loadAppConfig();
    const targetAcc = data.accounts.find(a => a.id === newCounterAccountId);
    if (!targetAcc || targetAcc.isGroup) {
      showErrorToast(isHindi ? 'कृपया एक मान्य लेजर खाता चुनें (ग्रुप शीर्षक नहीं)।' : 'Please select a valid leaf ledger account.');
      return;
    }
    if (isCashOrBankLedger(targetAcc)) {
      showErrorToast(
        isHindi
          ? 'लेखांकन नियम: काउंटर-लेजर रीक्लासिफिकेशन में कैश या बैंक खाता नहीं चुना जा सकता।'
          : 'Accounting Rule: Cash or Bank ledgers cannot be assigned as general counter-ledgers.'
      );
      return;
    }

    const idSet = new Set(voucherIds);
    const hasLocked = data.vouchers.some(v => idSet.has(v.id) && isDateLockedByBooksLock(v.date, appConfig.booksLockDate));
    if (hasLocked) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं (${appConfig.booksLockDate} तक): लॉक अवधि के वाउचर नहीं बदले जा सकते।`
          : `Books Locked (on/before ${appConfig.booksLockDate}): Cannot modify locked-period vouchers.`
      );
      return;
    }

    setData(prev => {
      const updatedVouchers = prev.vouchers.map(v => {
        if (!idSet.has(v.id)) return v;
        // Contra vouchers only involve Cash/Bank accounts, skip changing them to non-Cash/Bank
        if (v.type === 'CONTRA') return v;

        const updatedEntries = v.entries.map(entry => {
          const entryAcc = prev.accounts.find(a => a.id === entry.accountId);
          const isMoneyAcc = entryAcc ? isCashOrBankLedger(entryAcc) : false;
          if (!isMoneyAcc || entry.accountId === 'acc_suspense' || entry.accountName?.toLowerCase().includes('suspense')) {
            return {
              ...entry,
              accountId: targetAcc.id,
              accountCode: targetAcc.code,
              accountName: targetAcc.name
            };
          }
          return entry;
        });

        return {
          ...v,
          entries: updatedEntries
        };
      });

      return logAuditAction(
        { ...prev, vouchers: updatedVouchers },
        'Vouchers Bulk Reclassified',
        `Reclassified selected vouchers counter-ledger to ${targetAcc.code} - ${targetAcc.name}`
      );
    });
  };

  // Handler: Delete Voucher
  const handleDeleteVoucher = (vId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'वाउचर डिलीट करना', 'delete accounting vouchers')) return;
    const appConfig = loadAppConfig();
    const target = data.vouchers.find(x => x.id === vId);
    if (target && isDateLockedByBooksLock(target.date, appConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं (${appConfig.booksLockDate}): लॉक अवधि का वाउचर डिलीट नहीं किया जा सकता।`
          : `Books Locked (${appConfig.booksLockDate}): Cannot delete locked-period voucher.`
      );
      return;
    }
    setData(prev => {
      const v = prev.vouchers.find(x => x.id === vId);
      const updatedVouchers = prev.vouchers.filter(x => x.id !== vId);
      return logAuditAction(
        { ...prev, vouchers: updatedVouchers },
        'Voucher Deleted',
        `Deleted ${v?.type} voucher ${v?.voucherNumber || vId}`
      );
    });
  };

  const handleDeleteBatchVouchers = (vIds: string[]) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बल्क वाउचर डिलीट करना', 'bulk delete vouchers')) return;
    if (!vIds || vIds.length === 0) return;
    const appConfig = loadAppConfig();
    const idSet = new Set(vIds);
    if (data.vouchers.some(x => idSet.has(x.id) && isDateLockedByBooksLock(x.date, appConfig.booksLockDate))) {
      showErrorToast(
        isHindi
          ? `चयनित वाउचर्स में लॉक अवधि (${appConfig.booksLockDate} तक) की प्रविष्टियाँ शामिल हैं।`
          : `Selection includes locked-period vouchers (on/before ${appConfig.booksLockDate}).`
      );
      return;
    }
    setData(prev => {
      const updatedVouchers = prev.vouchers.filter(x => !idSet.has(x.id));
      return logAuditAction(
        { ...prev, vouchers: updatedVouchers },
        'Vouchers Deleted',
        `Deleted ${vIds.length} vouchers in bulk`
      );
    });
  };

  // Handler: Delete Purchase Bill (Deducts added stock)
  const handleDeletePurchaseBill = (billId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'परचेज बिल डिलीट करना', 'delete purchase bills')) return;
    const appConfig = loadAppConfig();
    const targetBill = (data.purchaseInvoices || []).find(p => p.id === billId);
    if (targetBill && isDateLockedByBooksLock(targetBill.date, appConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं (${appConfig.booksLockDate}): लॉक अवधि का परचेज बिल डिलीट नहीं किया जा सकता।`
          : `Books Locked (${appConfig.booksLockDate}): Cannot delete locked-period purchase bill.`
      );
      return;
    }
    setData(prev => {
      const bill = (prev.purchaseInvoices || []).find(p => p.id === billId);
      const updatedBills = (prev.purchaseInvoices || []).filter(p => p.id !== billId);

      const res = applyPurchaseBillStockAndBatchChanges({
        items: prev.items,
        batches: prev.itemBatches || [],
        godowns: prev.godowns,
        previousBill: bill || null,
        nextBill: null,
      });

      const updatedData = logAuditAction(
        { ...prev, purchaseInvoices: updatedBills, items: res.items, itemBatches: res.itemBatches },
        'Purchase Bill Deleted',
        `Deleted purchase bill ${bill?.billNumber || billId} [Stock & Batch Deducted: ${bill?.items?.length || 0} items]`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleDeleteBatchPurchaseBills = (billIds: string[]) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बल्क परचेज बिल डिलीट करना', 'bulk delete purchase bills')) return;
    if (!billIds || billIds.length === 0) return;
    const appConfig = loadAppConfig();
    const idSet = new Set(billIds);
    if ((data.purchaseInvoices || []).some(p => idSet.has(p.id) && isDateLockedByBooksLock(p.date, appConfig.booksLockDate))) {
      showErrorToast(
        isHindi
          ? `चयनित परचेज बिल में लॉक अवधि (${appConfig.booksLockDate} तक) के बिल शामिल हैं।`
          : `Selection includes locked-period purchase bills (on/before ${appConfig.booksLockDate}).`
      );
      return;
    }
    setData(prev => {
      const deletedBills = (prev.purchaseInvoices || []).filter(p => idSet.has(p.id));
      const updatedBills = (prev.purchaseInvoices || []).filter(p => !idSet.has(p.id));

      let curItems = prev.items;
      let curBatches = prev.itemBatches || [];
      deletedBills.forEach(bill => {
        const res = applyPurchaseBillStockAndBatchChanges({
          items: curItems,
          batches: curBatches,
          godowns: prev.godowns,
          previousBill: bill,
          nextBill: null,
        });
        curItems = res.items;
        curBatches = res.itemBatches;
      });

      const updatedData = logAuditAction(
        { ...prev, purchaseInvoices: updatedBills, items: curItems, itemBatches: curBatches },
        'Purchase Bills Deleted',
        `Deleted ${billIds.length} purchase bills in bulk [Stock Deducted]`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  // Handler: Delete Debit/Credit Note
  const handleDeleteDebitCreditNote = (noteId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'डेबिट/क्रेडिट नोट डिलीट करना', 'delete Debit/Credit Notes')) return;
    const appConfig = loadAppConfig();
    const targetNote = (data.debitCreditNotes || []).find(n => n.id === noteId);
    if (targetNote && isDateLockedByBooksLock(targetNote.date, appConfig.booksLockDate)) {
      showErrorToast(
        isHindi
          ? `लेखा पुस्तकें लॉक हैं (${appConfig.booksLockDate}): लॉक अवधि का नोट डिलीट नहीं किया जा सकता।`
          : `Books Locked (${appConfig.booksLockDate}): Cannot delete locked-period note.`
      );
      return;
    }
    setData(prev => {
      const note = (prev.debitCreditNotes || []).find(n => n.id === noteId);
      const updatedNotes = (prev.debitCreditNotes || []).filter(n => n.id !== noteId);
      return logAuditAction(
        { ...prev, debitCreditNotes: updatedNotes },
        'Debit/Credit Note Deleted',
        `Deleted note ${note?.noteNumber || noteId}`
      );
    });
  };

  const handleDeleteBatchDebitCreditNotes = (noteIds: string[]) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बल्क डेबिट/क्रेडिट नोट डिलीट करना', 'bulk delete Debit/Credit Notes')) return;
    if (!noteIds || noteIds.length === 0) return;
    const appConfig = loadAppConfig();
    const idSet = new Set(noteIds);
    if ((data.debitCreditNotes || []).some(n => idSet.has(n.id) && isDateLockedByBooksLock(n.date, appConfig.booksLockDate))) {
      showErrorToast(
        isHindi
          ? `चयनित नोट्स में लॉक अवधि (${appConfig.booksLockDate} तक) के नोट शामिल हैं।`
          : `Selection includes locked-period notes (on/before ${appConfig.booksLockDate}).`
      );
      return;
    }
    setData(prev => {
      const updatedNotes = (prev.debitCreditNotes || []).filter(n => !idSet.has(n.id));
      return logAuditAction(
        { ...prev, debitCreditNotes: updatedNotes },
        'Debit/Credit Notes Deleted',
        `Deleted ${noteIds.length} debit/credit notes in bulk`
      );
    });
  };

  // Handler: Reconcile Bank Match
  const handleReconcileMatch = (lineId: string, matchedType: 'INVOICE' | 'VOUCHER', matchedId: string) => {
    if (!requirePermission(rbac.canReconcileBank, 'बैंक मिलान (BRS)', 'match bank reconciliation lines')) return;
    const updatedLines = data.bankStatements.map(line => {
      if (line.id === lineId) {
        return { ...line, isReconciled: true, matchedTxId: matchedId, matchedTxType: matchedType };
      }
      return line;
    });
    const updatedData = logAuditAction(
      { ...data, bankStatements: updatedLines },
      'Bank Reconciliation Matched',
      `Reconciled statement line #${lineId} with ${matchedType} #${matchedId}`
    );
    setData(updatedData);
  };

  // Handler: Add Statement Line
  const handleAddStatementLine = (line: BankStatementLine) => {
    if (!requirePermission(rbac.canReconcileBank, 'बैंक स्टेटमेंट लाइन जोड़ना', 'add bank statement entries')) return;
    const strictBanks = data.accounts.filter(isStrictBankLedger);
    if (strictBanks.length === 0) {
      showErrorToast(
        isHindi
          ? 'कंपनी का कोई वैध बैंक लेजर नहीं मिला। कृपया पहले Chart of Accounts में कंपनी का बैंक खाता लेजर बनाएं।'
          : 'No valid company Bank Ledger found. Please create a Bank Account ledger first.'
      );
      return;
    }
    if (!isDateInFinancialYear(line.date, selectedFYStart)) {
      showErrorToast(
        isHindi
          ? `बैंक प्रविष्टि तिथि (${line.date}) सक्रिय वित्तीय वर्ष ${activeFyRange.label} से बाहर है।`
          : `Bank entry date (${line.date}) is outside active ${activeFyRange.label} (${activeFyRange.displayRange}).`
      );
      return;
    }
    if ((line.amount || 0) <= 0) {
      showErrorToast(isHindi ? 'बैंक स्टेटमेंट राशि 0 से अधिक होनी चाहिए।' : 'Statement line amount must be greater than zero.');
      return;
    }
    const updatedData = logAuditAction(
      { ...data, bankStatements: [line, ...data.bankStatements] },
      'Bank Statement Line Added',
      `Added statement line: ${line.description} (${line.type}: ${line.amount})`
    );
    setData(updatedData);
  };

  const handleBatchAddStatementLines = (lines: BankStatementLine[]) => {
    if (!requirePermission(rbac.canReconcileBank, 'बैंक स्टेटमेंट अपलोड करना', 'upload bank statement batches')) return;
    const strictBanks = data.accounts.filter(isStrictBankLedger);
    if (strictBanks.length === 0) {
      showErrorToast(
        isHindi
          ? 'कंपनी का कोई वैध बैंक लेजर नहीं मिला। बैंक स्टेटमेंट अपलोड अवरुद्ध किया गया।'
          : 'No valid company Bank Ledger found. Bank statement upload blocked.'
      );
      return;
    }
    const validLines = lines.filter(l => (l.amount || 0) > 0 && isDateInFinancialYear(l.date, selectedFYStart));
    if (validLines.length === 0) {
      showErrorToast(
        isHindi
          ? `कोई भी प्रविष्टि सक्रिय वित्तीय वर्ष ${activeFyRange.label} के भीतर नहीं मिली।`
          : `No statement lines fell within active ${activeFyRange.label} (${activeFyRange.displayRange}).`
      );
      return;
    }
    const updatedData = logAuditAction(
      { ...data, bankStatements: [...validLines, ...data.bankStatements] },
      'Bank Statement Batch Uploaded',
      `Uploaded ${validLines.length} bank statement entries`
    );
    setData(updatedData);
  };

  const handleDeleteStatementLine = (lineId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बैंक स्टेटमेंट लाइन हटाना', 'delete bank statement entries')) return;
    const updatedData = logAuditAction(
      { ...data, bankStatements: data.bankStatements.filter(s => s.id !== lineId) },
      'Bank Statement Entry Deleted',
      `Deleted bank statement entry #${lineId}`
    );
    setData(updatedData);
  };

  const handleClearAllBankStatements = () => {
    if (!requirePermission(rbac.canDeleteRecords, 'सभी बैंक स्टेटमेंट हटाना', 'clear all bank statement entries')) return;
    const updatedData = logAuditAction(
      { ...data, bankStatements: [] },
      'All Bank Statement Entries Cleared',
      `Cleared all imported bank statement entries`
    );
    setData(updatedData);
  };

  const handlePostBankVouchersBatch = (lines: BankStatementLine[], bankAccountId: string) => {
    if (!requirePermission(rbac.canReconcileBank && rbac.canCreateEditVouchers, 'बैंक से वाउचर पोस्ट करना', 'post vouchers from bank statement')) return;
    const targetBankAcc = data.accounts.find(a => a.id === bankAccountId && isStrictBankLedger(a));
    if (!targetBankAcc) {
      showErrorToast(
        isHindi
          ? 'मान्य कंपनी बैंक लेजर नहीं मिला! वाउचर पोस्टिंग रद्द की गई — कृपया पहले अपनी कंपनी का बैंक खाता लेजर बनाएं।'
          : 'No valid Company Bank Ledger selected! Please create/select a valid company Bank Account ledger first.'
      );
      return;
    }
    const appConfig = loadAppConfig();
    const validLines = lines.filter(
      l =>
        (l.amount || 0) > 0 &&
        isDateInFinancialYear(l.date, selectedFYStart) &&
        !isDateLockedByBooksLock(l.date, appConfig.booksLockDate)
    );
    if (validLines.length === 0) {
      showErrorToast(
        isHindi
          ? `चयनित प्रविष्टियों में से कोई भी सक्रिय वित्तीय वर्ष ${activeFyRange.label} व अनलॉक अवधि के भीतर नहीं है।`
          : `Selected entries do not fall inside active ${activeFyRange.label} or are locked by Books Lock Date.`
      );
      return;
    }

    const suspenseAcc = data.accounts.find(a => !a.isGroup && !isCashOrBankLedger(a) && (a.id === 'acc_suspense' || a.name.toLowerCase().includes('suspense'))) || {
      id: 'acc_suspense',
      code: '9999',
      name: 'Suspense Account',
      category: 'LIABILITY' as AccountCategory,
      subCategory: 'Suspense',
      mainGroup: 'Current Liabilities',
      openingBalance: 0,
      balanceType: 'CR' as const,
      isSystem: true
    };

    const newVouchers: Voucher[] = [];
    const newBankStatements: BankStatementLine[] = [];
    const timestamp = Date.now();

    validLines.forEach((line, idx) => {
      const counterAccountId = line.allocatedAccountId || suspenseAcc.id;
      const foundCounter = data.accounts.find(a => a.id === counterAccountId && !a.isGroup && a.id !== targetBankAcc.id);
      const counterAcc = foundCounter || suspenseAcc;
      const voucherId = `vch_bank_imp_${timestamp}_${idx}`;
      const isContra = isCashOrBankLedger(counterAcc);
      const vchType: VoucherType = isContra ? 'CONTRA' : (line.type === 'DEBIT' ? 'PAYMENT' : 'RECEIPT');
      const vchPrefix = isContra ? 'CON-' : (line.type === 'DEBIT' ? 'PAY-' : 'REC-');
      const vchNo = vchPrefix + Math.floor(100000 + Math.random() * 900000);

      const debitAccount = line.type === 'DEBIT' ? counterAcc : targetBankAcc;
      const creditAccount = line.type === 'DEBIT' ? targetBankAcc : counterAcc;

      const voucher: Voucher = {
        id: voucherId,
        voucherNumber: vchNo,
        date: line.date || new Date().toISOString().split('T')[0],
        type: vchType,
        paymentMode: isContra && isCashLedger(counterAcc) ? 'CASH' : 'BANK_TRANSFER',
        bankAccountId: targetBankAcc.id,
        bankReferenceNo: line.referenceNo || '',
        isReconciled: true,
        reconciledDate: line.date || new Date().toISOString().split('T')[0],
        entries: [
          {
            id: `entry_dr_${timestamp}_${idx}`,
            accountId: debitAccount.id,
            accountCode: debitAccount.code,
            accountName: debitAccount.name,
            debit: line.amount,
            credit: 0
          },
          {
            id: `entry_cr_${timestamp}_${idx}`,
            accountId: creditAccount.id,
            accountCode: creditAccount.code,
            accountName: creditAccount.name,
            debit: 0,
            credit: line.amount
          }
        ],
        totalAmount: line.amount,
        narration: `Bank Statement Reconciliation: ${line.description} (Ref: ${line.referenceNo || 'N/A'})`,
        createdBy: activeUser.name || 'System'
      };

      newVouchers.push(voucher);

      newBankStatements.push({
        ...line,
        reconciled: true,
        isReconciled: true,
        matchedVoucherId: voucherId,
        matchedTxId: voucherId,
        matchedTxType: 'VOUCHER'
      });
    });

    const existingLineIds = new Set(validLines.map(l => l.id));
    const updatedExistingStatements = data.bankStatements.map(s => {
      if (existingLineIds.has(s.id)) {
        const postedLine = newBankStatements.find(n => n.id === s.id);
        return postedLine || s;
      }
      return s;
    });
    const newlyAddedStatements = newBankStatements.filter(n => !data.bankStatements.some(s => s.id === n.id));
    const mergedBankStatements = [...newlyAddedStatements, ...updatedExistingStatements];

    const updatedData = logAuditAction(
      { 
        ...data, 
        vouchers: [...newVouchers, ...data.vouchers],
        bankStatements: mergedBankStatements
      },
      'Bank Statement & Vouchers Auto-Imported',
      `Imported & created ${newVouchers.length} payment/receipt vouchers from bank statement lines with balanced Dr/Cr postings`
    );
    setData(updatedData);
  };

  const handleCreateBankLedgerQuick = (bankName: string, accountNumber?: string) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'बैंक लेजर जोड़ना', 'create a bank ledger')) return;
    const nameWithAcc = accountNumber ? `${bankName} A/c - ${accountNumber.slice(-4)}` : bankName;
    const newAcc: Account = {
      id: `acc_bank_${Date.now()}`,
      code: `10${data.accounts.length + 20}`,
      name: nameWithAcc,
      category: 'ASSET',
      subCategory: 'Cash & Bank',
      mainGroup: 'Cash & Bank Accounts',
      accountNumber: accountNumber || '',
      openingBalance: 0,
      balanceType: 'DR',
      isSystem: false
    };
    handleAddAccount(newAcc);
  };

  const handleQuickCreateBankChargeVoucher = (voucher: Voucher) => {
    handleSaveVoucher(voucher);
  };

  // Handler: Save Employee
  const handleSaveEmployee = (emp: Employee) => {
    if (!requirePermission(rbac.canManagePayroll, 'कर्मचारी रिकॉर्ड सेव करना', 'create or edit employee records')) return;
    const existing = (data.employees || []).findIndex(e => e.id === emp.id);
    let updatedEmployees = [...(data.employees || [])];
    if (existing >= 0) {
      updatedEmployees[existing] = emp;
    } else {
      updatedEmployees.push(emp);
    }
    const updatedData = logAuditAction(
      { ...data, employees: updatedEmployees },
      'Employee Master Saved',
      `Saved employee master record ${emp.name} (${emp.employeeCode})`
    );
    setData(updatedData);
  };

  // Handler: Delete Employee
  const handleDeleteEmployee = (empId: string) => {
    if (!requirePermission(rbac.canDeleteRecords && rbac.canManagePayroll, 'कर्मचारी रिकॉर्ड डिलीट करना', 'delete employee records')) return;
    const emp = (data.employees || []).find(e => e.id === empId);
    const updatedEmployees = (data.employees || []).filter(e => e.id !== empId);
    const updatedData = logAuditAction(
      { ...data, employees: updatedEmployees },
      'Employee Master Deleted',
      `Deleted employee master record ${emp?.name || empId}`
    );
    setData(updatedData);
  };

  // Handler: Save Payroll Batch with Statutory Deductions & Balanced Double-Entry GL Posting
  const handleSavePayrollBatch = (
    payrolls: PayrollRecord[],
    postOrOptions: boolean | PayrollBatchSaveOptions
  ) => {
    if (!requirePermission(rbac.canManagePayroll, 'पेरोल प्रोसेस करना', 'process payroll batches')) return;
    if (!payrolls || payrolls.length === 0) return;

    const opts: PayrollBatchSaveOptions =
      typeof postOrOptions === 'boolean'
        ? {
            postVoucher: postOrOptions,
            settlementMode: 'BANK',
            settlementAccountId:
              data.accounts.find(isBankLedger)?.id ||
              data.accounts.find(isCashLedger)?.id,
          }
        : postOrOptions;

    const appConfig = loadAppConfig();
    const todayIso = new Date().toISOString().split('T')[0];
    const defaultVoucherDate = isDateInFinancialYear(todayIso, selectedFYStart)
      ? todayIso
      : activeFyRange.fyEnd;
    const voucherDate = payrolls[0]?.paymentDate || defaultVoucherDate;

    let settlementAccount = opts.settlementAccountId
      ? data.accounts.find((a) => a.id === opts.settlementAccountId)
      : undefined;
    if (!settlementAccount && opts.settlementMode === 'BANK') {
      settlementAccount = data.accounts.find(isBankLedger) || data.accounts.find(a => !a.isGroup && isBankAccount(a));
    } else if (!settlementAccount && opts.settlementMode === 'CASH') {
      settlementAccount = data.accounts.find(isCashLedger);
    }

    if (opts.postVoucher) {
      if (
        !isDateInFinancialYear(voucherDate, selectedFYStart) ||
        isDateLockedByBooksLock(voucherDate, appConfig.booksLockDate)
      ) {
        showErrorToast(
          isHindi
            ? `वेतन वाउचर तिथि (${voucherDate}) सक्रिय वित्तीय वर्ष (${activeFyRange.label}) के भीतर एवं लॉक तिथि से बाद की होनी चाहिए।`
            : `Payroll voucher date (${voucherDate}) must fall within active ${activeFyRange.label} and after the Books Lock Date.`
        );
        return;
      }
      if (opts.settlementMode !== 'PAYABLE' && !settlementAccount) {
        showErrorToast(
          isHindi
            ? 'वेतन भुगतान पोस्ट करने के लिए कृपया एक मान्य बैंक या कैश खाता चुनें।'
            : 'Please select a valid Bank or Cash ledger for payroll settlement.'
        );
        return;
      }
    }

    let finalAccounts = [...data.accounts];
    let finalVouchers = [...data.vouchers];
    let processedPayrolls = payrolls;

    if (opts.postVoucher) {
      const existingVoucherIds = new Set((data.vouchers || []).map((v) => v.id));
      const payrollsToPost = payrolls.filter(
        (p) => !(p.postedVoucherId && existingVoucherIds.has(p.postedVoucherId))
      );
      if (payrollsToPost.length === 0) {
        showErrorToast(
          isHindi
            ? 'इस माह का पेरोल पहले से ही खातों में पोस्ट किया जा चुका है (डुप्लीकेट प्रविष्टि रोकी गई)।'
            : 'Payroll for this month is already posted to Accounts (duplicate posting prevented).'
        );
        return;
      }

      const postResult = buildPayrollAccountingVouchers(payrollsToPost, data.accounts, {
        settlementMode: opts.settlementMode,
        settlementAccountId: settlementAccount?.id,
        voucherDate,
        createdBy: activeUser.name || 'System',
        includeEmployerEsicInExpense: true,
      });

      const mergedAccounts =
        postResult.newAccounts.length > 0
          ? [...data.accounts, ...postResult.newAccounts]
          : data.accounts;
      const previewData: AppData = { ...data, accounts: mergedAccounts };

      for (const vch of postResult.vouchers) {
        const validation = validateVoucherAccountingRules(
          vch,
          previewData,
          selectedFYStart,
          appConfig
        );
        if (!validation.valid) {
          const firstErr = validation.errors[0];
          showErrorToast(isHindi ? firstErr.hi : firstErr.en);
          return;
        }
      }

      finalAccounts = mergedAccounts;
      finalVouchers = [...postResult.vouchers, ...data.vouchers];
      const postedById = new Map(postResult.updatedPayrolls.map((p) => [p.id, p]));
      processedPayrolls = payrolls.map((p) => postedById.get(p.id) || p);

      const postedRefs = postResult.vouchers.map((v) => v.voucherNumber).join(' & ');
      setToastMessage(
        isHindi
          ? `✅ पेरोल खातों में पोस्ट हो गया! वाउचर: ${postedRefs}`
          : `✅ Payroll posted to P&L & Balance Sheet! Vouchers: ${postedRefs}`
      );
      setTimeout(() => setToastMessage(null), 5000);
    } else {
      setToastMessage(
        isHindi ? '✅ पेरोल ड्राफ्ट सुरक्षित सेव हो गया।' : '✅ Payroll draft saved.'
      );
      setTimeout(() => setToastMessage(null), 3500);
    }

    const newPayrolls = [...(data.payrolls || [])];
    processedPayrolls.forEach((p) => {
      const existingIdx = newPayrolls.findIndex((x) => x.id === p.id);
      if (existingIdx >= 0) {
        newPayrolls[existingIdx] = p;
      } else {
        newPayrolls.push(p);
      }
    });

    const postedVoucherCount = finalVouchers.length - data.vouchers.length;
    const updatedData = logAuditAction(
      {
        ...data,
        accounts: finalAccounts,
        payrolls: newPayrolls,
        vouchers: finalVouchers,
      },
      opts.postVoucher ? 'Payroll Posted to Accounts' : 'Payroll Draft Saved',
      `${opts.postVoucher ? 'Posted' : 'Saved'} monthly payroll for ${processedPayrolls.length} employees (${postedVoucherCount} double-entry vouchers created; Settlement: ${opts.settlementMode})`
    );
    setData(updatedData);
    saveAppData(updatedData, sessionUser?.id);
  };

  // Handler: Add Account
  const handleAddAccount = (acc: Account) => {
    if (!requirePermission(rbac.canCreateEditMasters && rbac.canCreateEditVouchers, 'नया लेजर खाता बनाना', 'create ledger accounts')) return;
    setData(prev => {
      if (prev.accounts.some(a => a.id === acc.id || a.name.toLowerCase().trim() === acc.name.toLowerCase().trim())) {
        return prev;
      }
      return logAuditAction(
        { ...prev, accounts: [...prev.accounts, acc] },
        'Ledger Account Created',
        `Created account ${acc.code} - ${acc.name} (${acc.category})`
      );
    });
  };

  // Handler: Update Account
  const handleUpdateAccount = (updatedAcc: Account) => {
    if (!requirePermission(rbac.canCreateEditMasters && rbac.canCreateEditVouchers, 'लेजर खाता अपडेट करना', 'update ledger accounts')) return;
    const updatedAccounts = data.accounts.map(a => a.id === updatedAcc.id ? updatedAcc : a);
    const updatedData = logAuditAction(
      { ...data, accounts: updatedAccounts },
      'Ledger Account Updated',
      `Updated account ${updatedAcc.code} - ${updatedAcc.name}`
    );
    setData(updatedData);
  };

  // Handler: Add Account Group / Sub-Group
  const handleAddAccountGroup = (group: AccountGroup) => {
    if (!requirePermission(rbac.canCreateEditMasters && rbac.canCreateEditVouchers, 'अकाउंट ग्रुप बनाना', 'create account groups')) return;
    const existingGroups = data.accountGroups || [];
    const updatedData = logAuditAction(
      { ...data, accountGroups: [...existingGroups, group] },
      'Account Group Created',
      `Created Account Group/Sub-Group "${group.name}" under ${group.parentGroupName || group.category}`
    );
    setData(updatedData);
  };

  // Handler: Delete Account
  const handleDeleteAccount = (accId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'लेजर खाता डिलीट करना', 'delete ledger accounts')) return;
    const acc = data.accounts.find(a => a.id === accId);
    if (!acc) return;
    if (acc.isSystem) {
      showErrorToast(isHindi ? 'सिस्टम लेजर खातों को डिलीट नहीं किया जा सकता।' : 'System ledgers cannot be deleted.');
      return;
    }
    const hasVoucherRef = (data.vouchers || []).some(
      (v) => v.bankAccountId === accId || (v.entries || []).some((e) => e.accountId === accId)
    );
    const hasInvoiceRef = (data.invoices || []).some(
      (inv) =>
        inv.paymentAccountId === accId ||
        (inv.extraLedgerLines || []).some((el) => el.accountId === accId)
    );
    const hasPurchaseRef = (data.purchaseInvoices || []).some(
      (pur) =>
        pur.paymentAccountId === accId ||
        (pur.extraLedgerLines || []).some((el) => el.accountId === accId)
    );
    const hasNoteRef = (data.debitCreditNotes || []).some(
      (n) =>
        n.primaryAccountId === accId ||
        (n.extraLedgerLines || []).some((el) => el.accountId === accId)
    );
    if (Math.abs(acc.openingBalance || 0) > 0.001 || hasVoucherRef || hasInvoiceRef || hasPurchaseRef || hasNoteRef) {
      showErrorToast(
        isHindi
          ? `"${acc.name}" में प्रविष्टियाँ या ओपनिंग बैलेंस मौजूद है — इसे डिलीट नहीं किया जा सकता।`
          : `Cannot delete "${acc.name}" because it has an opening balance or linked vouchers/bills.`
      );
      return;
    }
    const updatedAccounts = data.accounts.filter(a => a.id !== accId);
    const updatedData = logAuditAction(
      { ...data, accounts: updatedAccounts },
      'Ledger Account Deleted',
      `Deleted account ${acc.code} - ${acc.name}`
    );
    setData(updatedData);
  };

  // Handler: Delete Account Group
  const handleDeleteAccountGroup = (groupId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'अकाउंट ग्रुप डिलीट करना', 'delete account groups')) return;
    const existing = data.accountGroups || [];
    const groupToDelete = existing.find(g => g.id === groupId);
    if (!groupToDelete) return;
    const updatedGroups = existing.filter(g => g.id !== groupId);
    const updatedData = logAuditAction(
      { ...data, accountGroups: updatedGroups },
      'Account Group Deleted',
      `Deleted account group ${groupToDelete.name}`
    );
    setData(updatedData);
  };

  // Handler: Save Budget
  const handleSaveBudget = (budget: CategoryBudget) => {
    if (!requirePermission(rbac.canCreateEditVouchers, 'बजट सीमा सहेजना', 'create or update budgets')) return;
    const existingIndex = data.budgets.findIndex(b => b.category === budget.category);
    let updatedBudgets = [...data.budgets];
    if (existingIndex >= 0) {
      updatedBudgets[existingIndex] = budget;
    } else {
      updatedBudgets.push(budget);
    }
    const updatedData = logAuditAction(
      { ...data, budgets: updatedBudgets },
      'Budget Limit Set',
      `Set monthly limit for ${budget.category} to ${budget.monthlyLimit}`
    );
    setData(updatedData);
  };

  // Handler: Delete Budget
  const handleDeleteBudget = (category: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बजट हटाना', 'delete budgets')) return;
    const updatedBudgets = data.budgets.filter(b => b.category !== category);
    const updatedData = logAuditAction(
      { ...data, budgets: updatedBudgets },
      'Budget Removed',
      `Removed budget limit for ${category}`
    );
    setData(updatedData);
  };

  // Handler: Master Items
  const handleAddItem = (item: ItemMaster) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'नया स्टॉक आइटम जोड़ना', 'create stock items')) return;
    setData(prev => {
      const exists = prev.items.some(i => i.id === item.id || i.name.trim().toLowerCase() === item.name.trim().toLowerCase());
      if (exists) return prev;
      const updatedData = logAuditAction(
        { ...prev, items: [...prev.items, item] },
        'Item Created',
        `Added item master ${item.name} (HSN: ${item.hsnSacCode})`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleUpdateItem = (updatedItem: ItemMaster) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'स्टॉक आइटम संपादित करना', 'update stock items')) return;
    setData(prev => {
      const updatedItems = prev.items.map(i => {
        if (i.id !== updatedItem.id) return i;
        const stockChanged = Math.abs((Number(i.currentStock) || 0) - (Number(updatedItem.currentStock) || 0)) > 0.0005;
        const rateChanged = Math.abs((Number(i.purchasePrice) || 0) - (Number(updatedItem.purchasePrice) || 0)) > 0.0005;
        if (stockChanged || rateChanged) {
          return {
            ...updatedItem,
            closingStockValue: undefined,
            importedClosingQty: undefined,
            importedPurchasePrice: undefined,
          };
        }
        return updatedItem;
      });
      const updatedData = logAuditAction(
        { ...prev, items: updatedItems },
        'Item Updated',
        `Updated item master details for ${updatedItem.name} (${updatedItem.code})`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleDeleteItem = (itemId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'स्टॉक आइटम डिलीट करना', 'delete stock items')) return;
    const item = data.items.find(i => i.id === itemId);
    if (!item) return;
    const hasLineRef = (list?: Array<{ items?: Array<{ itemId?: string }> }>) =>
      (list || []).some((doc) => (doc.items || []).some((line) => line.itemId === itemId));
    if (
      hasLineRef(data.invoices) ||
      hasLineRef(data.purchaseInvoices) ||
      hasLineRef(data.debitCreditNotes) ||
      hasLineRef(data.quotations) ||
      hasLineRef(data.purchaseOrders) ||
      hasLineRef(data.deliveryChallans)
    ) {
      showErrorToast(
        isHindi
          ? `"${item.name}" पहले से बिल/वाउचर में उपयोग हो चुका है — इसे डिलीट नहीं किया जा सकता।`
          : `Cannot delete "${item.name}" because it is referenced in existing invoices, purchases, or orders.`
      );
      return;
    }
    setData(prev => {
      const updatedItems = prev.items.filter(i => i.id !== itemId);
      const updatedData = logAuditAction(
        { ...prev, items: updatedItems },
        'Item Deleted',
        `Deleted item master ${item.name || itemId}`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleStockAdjustment = (itemId: string, newQuantity: number, reason: string, notes?: string, godownId?: string) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'स्टॉक समायोजन करना', 'adjust inventory stock')) return;
    setData(prev => {
      const item = prev.items.find(i => i.id === itemId);
      if (!item) return prev;
      const godownsList = ensureGodowns(prev.godowns);
      const targetGid = godownId || item.defaultGodownId || resolveDefaultGodownId(godownsList);
      const targetGodown = godownsList.find(g => g.id === targetGid);
      const oldQty = Number(item.currentStock || 0);
      const cleanNewQty = Math.round((Number(newQuantity) || 0) * 1000) / 1000;
      const diff = Math.round((cleanNewQty - oldQty) * 1000) / 1000;

      const updatedItems = prev.items.map(i => {
        if (i.id !== itemId) return i;
        const nextMap = reconcileGodownStocksMap(i, godownsList);
        const curGodownQty = Number(nextMap[targetGid]) || 0;
        nextMap[targetGid] = Math.max(0, Math.round((curGodownQty + diff) * 1000) / 1000);
        if (cleanNewQty === 0) {
          Object.keys(nextMap).forEach((gid) => {
            nextMap[gid] = 0;
          });
        }
        return {
          ...i,
          currentStock: cleanNewQty,
          godownStocks: nextMap,
          closingStockValue: undefined,
          importedClosingQty: undefined
        };
      });

      const commentText = (notes || '').trim() || reason;
      const newAdjRecord: StockAdjustmentRecord = {
        id: 'adj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        itemId,
        itemName: item.name,
        itemCode: item.code,
        date: new Date().toISOString().split('T')[0],
        previousStock: oldQty,
        newStock: cleanNewQty,
        difference: diff,
        reason,
        notes: commentText,
        adjustedBy: activeUser.name,
        godownId: targetGid,
        godownName: targetGodown?.name,
      };

      const existingAdjustments = prev.stockAdjustments || [];
      const updatedAdjustments = [newAdjRecord, ...existingAdjustments];

      const updatedData = logAuditAction(
        { ...prev, godowns: godownsList, items: updatedItems, stockAdjustments: updatedAdjustments },
        'Stock Adjustment',
        `Adjusted stock for ${item.name} (${targetGodown?.name || 'Godown'}): ${oldQty} -> ${cleanNewQty} (${diff >= 0 ? '+' + diff : diff} ${item.unit || 'PCS'}) - Reason: ${reason} | Comment: ${commentText}`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleBatchStockAdjustment = (
    adjustments: Array<{ itemId: string; newQuantity: number; reason: string; notes?: string; godownId?: string }>
  ) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'बल्क स्टॉक समायोजन करना', 'perform batch stock adjustments')) return;
    if (!adjustments || adjustments.length === 0) return;

    setData(prev => {
      const godownsList = ensureGodowns(prev.godowns);
      const defaultGid = resolveDefaultGodownId(godownsList);
      const today = new Date().toISOString().split('T')[0];
      const adjByItem = new Map(adjustments.map(a => [a.itemId, a]));
      const newRecords: StockAdjustmentRecord[] = [];
      let seq = 0;

      const updatedItems = prev.items.map(item => {
        const req = adjByItem.get(item.id);
        if (!req) return item;

        const targetGid = req.godownId || item.defaultGodownId || defaultGid;
        const targetGodown = godownsList.find(g => g.id === targetGid);
        const oldQty = Number(item.currentStock || 0);
        const cleanNewQty = Math.round((Number(req.newQuantity) || 0) * 1000) / 1000;
        const diff = Math.round((cleanNewQty - oldQty) * 1000) / 1000;
        const nextMap = reconcileGodownStocksMap(item, godownsList);
        nextMap[targetGid] = Math.max(0, Math.round(((Number(nextMap[targetGid]) || 0) + diff) * 1000) / 1000);
        if (cleanNewQty === 0) {
          Object.keys(nextMap).forEach((gid) => {
            nextMap[gid] = 0;
          });
        }

        const commentText = (req.notes || '').trim() || req.reason;
        seq += 1;
        newRecords.push({
          id: `adj_${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 5)}`,
          itemId: item.id,
          itemName: item.name,
          itemCode: item.code,
          date: today,
          previousStock: oldQty,
          newStock: cleanNewQty,
          difference: diff,
          reason: req.reason,
          notes: commentText,
          adjustedBy: activeUser.name,
          godownId: targetGid,
          godownName: targetGodown?.name,
        });

        return {
          ...item,
          currentStock: cleanNewQty,
          godownStocks: nextMap,
          closingStockValue: undefined,
          importedClosingQty: undefined
        };
      });

      if (newRecords.length === 0) return prev;

      const updatedAdjustments = [...newRecords, ...(prev.stockAdjustments || [])];
      const sampleSummary = newRecords
        .slice(0, 3)
        .map(r => `${r.itemName} (${r.previousStock} -> ${r.newStock})`)
        .join(', ');

      const updatedData = logAuditAction(
        { ...prev, godowns: godownsList, items: updatedItems, stockAdjustments: updatedAdjustments },
        'Batch Stock Adjustment',
        `Adjusted ${newRecords.length} stock item(s): ${sampleSummary}${newRecords.length > 3 ? ` +${newRecords.length - 3} more` : ''}`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  // Handler: Multi-Godown CRUD
  const handleSaveGodowns = (nextGodowns: Godown[]) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'गोदाम मास्टर अपडेट करना', 'save godown masters')) return;
    const normalized = ensureGodowns(nextGodowns);
    setData(prev => {
      const updatedData = logAuditAction(
        { ...prev, godowns: normalized },
        'Godowns Updated',
        `Updated warehouse/counter locations (${normalized.length} godowns)`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  // Handler: Save / Update Item Batch
  const handleSaveBatch = (batch: ItemBatch) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'बैच रिकॉर्ड सहेजना', 'create or edit item batch')) return;
    setData(prev => {
      const existing = (prev.itemBatches || []).find(b => b.id === batch.id);
      const normalizedBatch: ItemBatch = { ...batch, status: computeBatchStatus(batch) };
      const updatedBatches = existing
        ? (prev.itemBatches || []).map(b => b.id === batch.id ? normalizedBatch : b)
        : [normalizedBatch, ...(prev.itemBatches || [])];

      const updatedData = logAuditAction(
        { ...prev, itemBatches: updatedBatches },
        existing ? 'Item Batch Updated' : 'Item Batch Registered',
        `Saved batch ${batch.batchNumber} for ${batch.itemName} (Qty: ${batch.availableQty})`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleDeleteBatch = (batchId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'बैच हटाना', 'delete item batch')) return;
    setData(prev => {
      const target = (prev.itemBatches || []).find(b => b.id === batchId);
      const updatedBatches = (prev.itemBatches || []).filter(b => b.id !== batchId);
      const updatedData = logAuditAction(
        { ...prev, itemBatches: updatedBatches },
        'Item Batch Deleted',
        `Deleted batch ${target?.batchNumber || batchId}`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleWriteOffBatch = (batchId: string) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'एक्सपायर्ड बैच राइट-ऑफ करना', 'write off expired batch')) return;
    setData(prev => {
      const res = applyBatchWriteOffOrAdjustment({
        items: prev.items,
        batches: prev.itemBatches || [],
        godowns: prev.godowns,
        batchId,
        reason: 'Expired / Wastage',
        adjustedBy: activeUser.name,
      });
      if (!res.ok) return prev;
      const updatedAdjustments = res.adjustmentRecord
        ? [res.adjustmentRecord, ...(prev.stockAdjustments || [])]
        : prev.stockAdjustments;
      const updatedData = logAuditAction(
        {
          ...prev,
          items: res.items,
          itemBatches: res.itemBatches,
          stockAdjustments: updatedAdjustments,
        },
        'Expired Batch Written Off',
        `Wrote off expired batch (${res.adjustmentRecord?.notes || batchId})`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  const handleExecuteStockTransfer = (transfer: StockTransfer): { ok: boolean; error?: string } => {
    if (!requirePermission(rbac.canCreateEditMasters, 'स्टॉक ट्रांसफर करना', 'execute inter-godown transfer')) {
      return { ok: false, error: 'Permission denied' };
    }
    const res = executeInterGodownTransfer({
      items: data.items,
      batches: data.itemBatches || [],
      godowns: data.godowns,
      transfer,
    });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }
    setData(prev => {
      const updatedTransfers = [res.transfer, ...(prev.stockTransfers || [])];
      const updatedData = logAuditAction(
        {
          ...prev,
          items: res.items,
          itemBatches: res.itemBatches,
          stockTransfers: updatedTransfers,
        },
        'Inter-Godown Stock Transfer',
        `Transferred ${res.transfer.totalQuantity} units from ${res.transfer.fromGodownName} to ${res.transfer.toGodownName} (#${res.transfer.transferNumber})`
      );
      saveAppData(updatedData);
      return updatedData;
    });
    return { ok: true };
  };

  // Handler: Master Parties
  const handleAddParty = (party: PartyMaster) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'नई पार्टी जोड़ना', 'create parties')) return;
    setData(prev => {
      const exists = prev.parties.some(p => p.id === party.id || p.name.trim().toLowerCase() === party.name.trim().toLowerCase());
      if (exists) return prev;
      const synced = syncPartyDetailsAcrossAppData(
        { ...prev, parties: [...prev.parties, party] },
        party
      );
      const updatedData = logAuditAction(
        synced,
        'Party Master Created',
        `Created party ${party.name} (${party.type} - GSTIN: ${party.gstin})`
      );
      saveAppData(updatedData, sessionUser?.id);
      return updatedData;
    });
  };

  const handleUpdateParty = (party: PartyMaster) => {
    if (!requirePermission(rbac.canCreateEditMasters, 'पार्टी विवरण संपादित करना', 'update party details')) return;
    setData(prev => {
      const updatedParties = prev.parties.map(p => p.id === party.id ? party : p);
      const synced = syncPartyDetailsAcrossAppData(
        { ...prev, parties: updatedParties },
        party
      );
      const updatedData = logAuditAction(
        synced,
        'Party Master Updated',
        `Updated party details for ${party.name}${party.gstin ? ` (GSTIN: ${party.gstin})` : ''} and synced invoices`
      );
      saveAppData(updatedData, sessionUser?.id);
      return updatedData;
    });
    setToastMessage(
      isHindi
        ? `✅ ${party.name} अपडेट हो गई — सभी संबंधित बिल और GSTR-1 / 2B / 3B रिपोर्ट तुरंत सिंक हो गईं!`
        : `✅ Updated ${party.name} — synced GSTIN & state across all invoices and GSTR-1 / 2B / 3B!`
    );
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleDeleteParty = (partyId: string) => {
    if (!requirePermission(rbac.canDeleteRecords, 'पार्टी डिलीट करना', 'delete party records')) return;
    const party = data.parties.find(p => p.id === partyId);
    if (!party) return;
    const normName = (party.name || '').trim().toLowerCase();
    const matchesRef = (rec: { partyId?: string; partyName?: string }) =>
      rec.partyId === partyId || (Boolean(normName) && (rec.partyName || '').trim().toLowerCase() === normName);
    const hasLinkedDocs =
      Math.abs(party.openingBalance || 0) > 0.001 ||
      (data.invoices || []).some(matchesRef) ||
      (data.purchaseInvoices || []).some(matchesRef) ||
      (data.vouchers || []).some(matchesRef) ||
      (data.debitCreditNotes || []).some(matchesRef);
    if (hasLinkedDocs) {
      showErrorToast(
        isHindi
          ? `"${party.name}" के नाम पर बिल, वाउचर या ओपनिंग बैलेंस दर्ज है — इसे डिलीट नहीं किया जा सकता।`
          : `Cannot delete "${party.name}" because it has an opening balance or linked invoices/vouchers.`
      );
      return;
    }
    setData(prev => {
      const updatedParties = prev.parties.filter(p => p.id !== partyId);
      const updatedData = logAuditAction(
        { ...prev, parties: updatedParties },
        'Party Master Deleted',
        `Deleted party ${party.name || partyId}`
      );
      saveAppData(updatedData);
      return updatedData;
    });
  };

  // Handler: Update Company
  const handleUpdateCompany = (comp: CompanyDetails) => {
    if (!requirePermission(rbac.canEditCompanySettings, 'कंपनी प्रोफ़ाइल बदलना', 'edit company settings')) return;
    const nextProfile = resolveCompanyTaxProfile(comp);
    setActiveNumberFormat(nextProfile.numberFormat);
    setAppConfig((prevCfg) => {
      const nextNegMode = comp.negativeStockMode || prevCfg.negativeStockMode;
      const nextCfg: AppConfiguration = {
        ...prevCfg,
        enableTds: typeof comp.tdsTcsEnabled === 'boolean' ? comp.tdsTcsEnabled : prevCfg.enableTds,
        maintainBatches: typeof comp.batchGodownEnabled === 'boolean' ? comp.batchGodownEnabled : prevCfg.maintainBatches,
        negativeStockMode: nextNegMode,
        negativeStockWarning: nextNegMode !== 'ALLOW',
      };
      saveAppConfig(nextCfg);
      return nextCfg;
    });
    const existingCompanies = data.companiesList || [{ ...data.company }];
    const updatedCompanies = existingCompanies.map(c => (c.id === comp.id || c.name === comp.name) ? comp : c);
    const updatedData = logAuditAction(
      { ...data, company: comp, companiesList: updatedCompanies },
      'Company Profile Updated',
      `Updated settings for ${comp.name}`
    );
    setData(updatedData);
    saveAppData(updatedData);
  };

  // Handler: Bulk Import Items & Parties
  const handleBulkImportItems = (importedItems: ItemMaster[]) => {
    if (!requirePermission(rbac.canImportData && rbac.canCreateEditMasters, 'आइटम बल्क इम्पोर्ट करना', 'bulk import items')) return;
    const updatedData = logAuditAction(
      { ...data, items: [...data.items, ...importedItems] },
      'Items Bulk Imported',
      `Imported ${importedItems.length} items into inventory master`
    );
    setData(updatedData);
  };

  const handleBulkImportParties = (importedParties: PartyMaster[]) => {
    if (!requirePermission(rbac.canImportData && rbac.canCreateEditMasters, 'पार्टियाँ बल्क इम्पोर्ट करना', 'bulk import parties')) return;
    const updatedData = logAuditAction(
      { ...data, parties: [...data.parties, ...importedParties] },
      'Parties Bulk Imported',
      `Imported ${importedParties.length} parties into customer/vendor directory`
    );
    setData(updatedData);
  };

  // Handler: Import Accounting ERP XML Data Payload
  const handleImportTallyData = (payload: TallyImportCommitPayload) => {
    if (!requirePermission(rbac.canImportData, 'ERP XML इम्पोर्ट करना', 'import ERP XML data')) return;
    const cleanPayload: TallyImportCommitPayload = JSON.parse(JSON.stringify(payload));
    const savedSnap = savePreImportSnapshot(
      data,
      cleanPayload.fileName || 'ERP_Import.xml',
      'ERP XML',
      sessionUser?.id
    );
    if (savedSnap) setPreImportSnapshot(savedSnap);
    const hasCmpUpdates = Boolean(
      cleanPayload.companyInfo && Object.keys(cleanPayload.companyInfo).length > 0
    );
    const batchRecord: TallyLastImportBatch = {
      fileName: cleanPayload.fileName || 'ERP_Import.xml',
      importedAt: new Date().toISOString(),
      groupIds: (cleanPayload.accountGroups || []).map(g => g.id),
      accountIds: (cleanPayload.accounts || []).map(a => a.id),
      partyIds: (cleanPayload.parties || []).map(p => p.id),
      itemIds: (cleanPayload.items || []).map(i => i.id),
      invoiceIds: (cleanPayload.invoices || []).map(i => i.id),
      purchaseIds: (cleanPayload.purchaseInvoices || []).map(p => p.id),
      voucherIds: (cleanPayload.vouchers || []).map(v => v.id),
      noteIds: (cleanPayload.debitCreditNotes || []).map(n => n.id),
      ...(hasCmpUpdates ? { previousCompany: JSON.parse(JSON.stringify(data.company)) } : {}),
    };

    try {
      localStorage.setItem(tallyBatchStorageKey, JSON.stringify(batchRecord));
    } catch {
      // ignore storage quota errors
    }
    setLastTallyImportBatch(batchRecord);

    setData(prev => {
      const mergedCompany: CompanyDetails = hasCmpUpdates
        ? {
            ...prev.company,
            ...cleanPayload.companyInfo,
            id: prev.company.id || 'cmp_1',
          }
        : prev.company;

      const existingCompanies =
        prev.companiesList && prev.companiesList.length > 0
          ? prev.companiesList
          : [{ ...prev.company, id: prev.company.id || 'cmp_1' }];
      const activeId = prev.company.id || 'cmp_1';
      const updatedCompaniesList = hasCmpUpdates
        ? existingCompanies.map(c =>
            c.id === activeId || (!c.id && c.name === prev.company.name) ? mergedCompany : c
          )
        : existingCompanies;

      const accOpeningMap = new Map(
        (cleanPayload.accountOpeningUpdates || []).map(u => [u.id, u])
      );
      const nextExistingAccounts = (prev.accounts || []).map(a => {
        const upd = accOpeningMap.get(a.id);
        return upd
          ? { ...a, openingBalance: upd.openingBalance, balanceType: upd.balanceType }
          : a;
      });

      const itemStockMap = new Map(
        (cleanPayload.itemStockUpdates || []).map(u => [u.itemId, u])
      );
      const nextExistingItems = (prev.items || []).map(i => {
        const upd = itemStockMap.get(i.id);
        if (!upd) return i;
        const delta = Number(upd.qtyDelta) || 0;
        const nextStock =
          upd.importedClosingQty !== undefined && delta === 0
            ? upd.importedClosingQty
            : Math.round(((Number(i.currentStock) || 0) + delta) * 1000) / 1000;
        const nextPurchase =
          upd.purchasePrice !== undefined && upd.purchasePrice > 0
            ? upd.purchasePrice
            : i.purchasePrice;
        const nextSales =
          upd.salesPrice !== undefined &&
          upd.salesPrice > 0 &&
          (!i.salesPrice || i.salesPrice <= 0)
            ? upd.salesPrice
            : i.salesPrice;
        return {
          ...i,
          currentStock: nextStock,
          purchasePrice: nextPurchase,
          salesPrice: nextSales,
          ...(upd.openingStock !== undefined ? { openingStock: upd.openingStock } : {}),
          ...(upd.openingStockValue !== undefined ? { openingStockValue: upd.openingStockValue } : {}),
          ...(upd.closingStockValue !== undefined ? { closingStockValue: upd.closingStockValue } : {}),
          ...(upd.importedClosingQty !== undefined ? { importedClosingQty: upd.importedClosingQty } : {}),
        };
      });

      const partyUpdateMap = new Map(
        (cleanPayload.partyUpdates || []).map(u => [u.partyId, u])
      );
      const upgradedExistingParties: PartyMaster[] = [];
      const nextExistingParties = (prev.parties || []).map(p => {
        const upd = partyUpdateMap.get(p.id);
        if (!upd) return p;
        const upgraded: PartyMaster = {
          ...p,
          gstin: upd.gstin || p.gstin,
          ...(upd.pan ? { pan: upd.pan } : {}),
          ...(upd.gstCategory ? { gstCategory: upd.gstCategory } : {}),
          ...(upd.state ? { state: upd.state } : {}),
          ...(upd.stateCode ? { stateCode: upd.stateCode } : {}),
          ...(upd.openingBalance !== undefined ? { openingBalance: upd.openingBalance } : {}),
          ...(upd.balanceType !== undefined ? { balanceType: upd.balanceType } : {}),
        };
        upgradedExistingParties.push(upgraded);
        return upgraded;
      });

      const existingGroupIds = new Set((prev.accountGroups || []).map(g => g.id));
      const existingGroupNames = new Set((prev.accountGroups || []).map(g => g.name.trim().toLowerCase()));
      const newImportedGroups = (cleanPayload.accountGroups || []).filter(
        g => !existingGroupIds.has(g.id) && !existingGroupNames.has(g.name.trim().toLowerCase())
      );

      let updated: AppData = {
        ...prev,
        company: mergedCompany,
        companiesList: updatedCompaniesList,
        accountGroups: [...(prev.accountGroups || []), ...newImportedGroups],
        accounts: [...nextExistingAccounts, ...(cleanPayload.accounts || [])],
        parties: [...nextExistingParties, ...(cleanPayload.parties || [])],
        items: [...nextExistingItems, ...(cleanPayload.items || [])],
        invoices: [...(cleanPayload.invoices || []), ...(prev.invoices || [])],
        purchaseInvoices: [...(cleanPayload.purchaseInvoices || []), ...(prev.purchaseInvoices || [])],
        vouchers: [...(cleanPayload.vouchers || []), ...(prev.vouchers || [])],
        debitCreditNotes: [...(cleanPayload.debitCreditNotes || []), ...(prev.debitCreditNotes || [])],
      };

      // Propagate imported/upgraded party GSTIN & State across all existing + imported invoices/purchases
      [...upgradedExistingParties, ...(cleanPayload.parties || [])].forEach(pty => {
        if (pty.gstin && pty.gstin !== 'URP') {
          updated = syncPartyDetailsAcrossAppData(updated, pty);
        }
      });

      const audited = logAuditAction(
        updated,
        'ERP XML Data Imported',
        `Imported ERP XML (${batchRecord.fileName}): ${cleanPayload.parties.length} Parties, ${cleanPayload.accounts.length} Ledgers, ${cleanPayload.items.length} Items, ${cleanPayload.invoices.length} Sales Bills, ${cleanPayload.purchaseInvoices.length} Purchase Bills, ${cleanPayload.vouchers.length} Vouchers, ${cleanPayload.debitCreditNotes.length} Debit/Credit Notes.`
      );
      saveAppData(audited, sessionUser?.id);
      return audited;
    });

    if (cleanPayload.minDate && cleanPayload.maxDate) {
      const minFy = getFinancialYearStartForDate(cleanPayload.minDate);
      const maxFy = getFinancialYearStartForDate(cleanPayload.maxDate);
      if (minFy && maxFy && minFy !== maxFy) {
        setSelectedFYStart(buildFYRangeToken(minFy, maxFy));
      } else if (selectedFYStart !== ALL_FINANCIAL_YEARS && !isDateInFinancialYear(cleanPayload.maxDate, selectedFYStart)) {
        setSelectedFYStart(normalizeFYStartDate(maxFy || cleanPayload.maxDate));
      }
    } else if (
      cleanPayload.maxDate &&
      selectedFYStart !== ALL_FINANCIAL_YEARS &&
      !isDateInFinancialYear(cleanPayload.maxDate, selectedFYStart)
    ) {
      const targetFy = normalizeFYStartDate(getFinancialYearStartForDate(cleanPayload.maxDate));
      setSelectedFYStart(targetFy);
    }

    const totalImported =
      cleanPayload.accounts.length +
      cleanPayload.parties.length +
      cleanPayload.items.length +
      cleanPayload.invoices.length +
      cleanPayload.purchaseInvoices.length +
      cleanPayload.vouchers.length +
      cleanPayload.debitCreditNotes.length;
    const totalUpdated =
      (cleanPayload.accountOpeningUpdates?.length || 0) +
      (cleanPayload.itemStockUpdates?.length || 0) +
      (cleanPayload.partyUpdates?.length || 0);

    setToastMessage(
      isHindi
        ? `⚡ ERP XML इम्पोर्ट पूर्ण! कुल ${totalImported} नए रिकॉर्ड${totalUpdated > 0 ? ` व ${totalUpdated} स्टॉक/लेज़र अपडेट` : ''}${hasCmpUpdates ? ` (कंपनी: ${cleanPayload.companyInfo?.name || 'अपडेटेड'})` : ''} सहेजे गए। (प्री-इम्पोर्ट स्नैपशॉट सुरक्षित)`
        : `⚡ ERP XML Import Complete! Saved ${totalImported} records${totalUpdated > 0 ? ` & updated ${totalUpdated} stock/ledger balances` : ''}${hasCmpUpdates ? ` (Company Profile updated)` : ''} cleanly. Pre-import snapshot saved.`
    );
    setTimeout(() => setToastMessage(null), 5500);
  };

  // Handler: 1-Click Restore Pre-Import Snapshot (Rollback including modified balances & stock)
  const handleRestorePreImportSnapshot = () => {
    if (!requirePermission(rbac.canImportData && rbac.canDeleteRecords, 'प्री-इम्पोर्ट स्नैपशॉट रिस्टोर करना', 'restore pre-import snapshot')) return;
    const snap = preImportSnapshot || loadPreImportSnapshot(sessionUser?.id);
    if (!snap || !snap.data) return;

    const audited = logAuditAction(
      snap.data,
      'Pre-Import Snapshot Restored',
      `Rolled back workspace to pre-import snapshot before "${snap.label}" (${snap.software}).`
    );
    setData(audited);
    saveAppData(audited, sessionUser?.id);
    clearPreImportSnapshot(sessionUser?.id);
    setPreImportSnapshot(null);

    try {
      localStorage.removeItem(tallyBatchStorageKey);
      localStorage.removeItem(externalBatchStorageKey);
    } catch {
      // ignore
    }
    setLastTallyImportBatch(null);
    setLastExternalImportBatch(null);

    setToastMessage(
      isHindi
        ? `↩️ इम्पोर्ट से पहले का पूरा स्नैपशॉट ("${snap.label}") 100% सफलतापूर्वक रिस्टोर कर दिया गया!`
        : `↩️ Restored exact pre-import workspace snapshot ("${snap.label}") successfully!`
    );
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Handler: Undo / Remove Last XML Import Batch
  const handleUndoLastTallyImport = () => {
    if (!requirePermission(rbac.canImportData && rbac.canDeleteRecords, 'पिछला XML इम्पोर्ट पूर्ववत करना', 'undo last XML import')) return;
    if (!lastTallyImportBatch) return;
    const groupSet = new Set(lastTallyImportBatch.groupIds || []);
    const accSet = new Set(lastTallyImportBatch.accountIds);
    const partySet = new Set(lastTallyImportBatch.partyIds);
    const itemSet = new Set(lastTallyImportBatch.itemIds);
    const invSet = new Set(lastTallyImportBatch.invoiceIds);
    const purSet = new Set(lastTallyImportBatch.purchaseIds);
    const vchSet = new Set(lastTallyImportBatch.voucherIds);
    const noteSet = new Set(lastTallyImportBatch.noteIds);
    const prevCmp = lastTallyImportBatch.previousCompany;

    setData(prev => {
      const restoredCmp = prevCmp ? { ...prevCmp, id: prev.company.id || prevCmp.id || 'cmp_1' } : prev.company;
      const updatedCompaniesList =
        prevCmp && prev.companiesList && prev.companiesList.length > 0
          ? prev.companiesList.map(c =>
              c.id === restoredCmp.id || (!c.id && c.name === prev.company.name) ? restoredCmp : c
            )
          : prev.companiesList;

      const updated: AppData = {
        ...prev,
        company: restoredCmp,
        ...(updatedCompaniesList ? { companiesList: updatedCompaniesList } : {}),
        accountGroups: (prev.accountGroups || []).filter(g => !groupSet.has(g.id)),
        accounts: (prev.accounts || []).filter(a => !accSet.has(a.id)),
        parties: (prev.parties || []).filter(p => !partySet.has(p.id)),
        items: (prev.items || []).filter(i => !itemSet.has(i.id)),
        invoices: (prev.invoices || []).filter(i => !invSet.has(i.id)),
        purchaseInvoices: (prev.purchaseInvoices || []).filter(p => !purSet.has(p.id)),
        vouchers: (prev.vouchers || []).filter(v => !vchSet.has(v.id)),
        debitCreditNotes: (prev.debitCreditNotes || []).filter(n => !noteSet.has(n.id)),
      };
      const audited = logAuditAction(
        updated,
        'ERP XML Import Reverted',
        `Removed records imported from XML batch "${lastTallyImportBatch.fileName}".`
      );
      saveAppData(audited, sessionUser?.id);
      return audited;
    });

    try {
      localStorage.removeItem(tallyBatchStorageKey);
    } catch {
      // ignore
    }
    setLastTallyImportBatch(null);
    setToastMessage(
      isHindi
        ? '↩️ पिछला XML इम्पोर्ट सफलतापूर्वक हटा दिया गया!'
        : '↩️ Last XML import removed cleanly!'
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Handler: Remove ALL XML-imported records (_tal_ IDs) from current company
  const handleRemoveAllTallyData = () => {
    if (!requirePermission(rbac.canDeleteRecords && rbac.canImportData, 'सभी XML इम्पोर्ट डेटा हटाना', 'remove all XML imported records')) return;
    const isNotTal = (id?: string) => !(id && id.includes('_tal_'));
    setData(prev => {
      const updated: AppData = {
        ...prev,
        accountGroups: (prev.accountGroups || []).filter(g => isNotTal(g.id)),
        accounts: (prev.accounts || []).filter(a => isNotTal(a.id)),
        parties: (prev.parties || []).filter(p => isNotTal(p.id)),
        items: (prev.items || []).filter(i => isNotTal(i.id)),
        invoices: (prev.invoices || []).filter(i => isNotTal(i.id)),
        purchaseInvoices: (prev.purchaseInvoices || []).filter(p => isNotTal(p.id)),
        vouchers: (prev.vouchers || []).filter(v => isNotTal(v.id)),
        debitCreditNotes: (prev.debitCreditNotes || []).filter(n => isNotTal(n.id)),
      };
      const audited = logAuditAction(
        updated,
        'All XML Imported Records Removed',
        'Removed all XML imported ledgers, parties, items, invoices, and vouchers from current company.'
      );
      saveAppData(audited, sessionUser?.id);
      return audited;
    });

    try {
      localStorage.removeItem(tallyBatchStorageKey);
    } catch {
      // ignore
    }
    setLastTallyImportBatch(null);
    setToastMessage(
      isHindi
        ? '🧹 सभी XML इम्पोर्टेड डेटा सफलतापूर्वक हटा दिए गए!'
        : '🧹 All XML imported records removed cleanly!'
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Handler: Smart Duplicate Ledger & Party Merge (Audit + Consolidate Same-Name Accounts/Parties)
  const handleMergeDuplicateLedgers = (
    selectedClusterIds?: string[],
    balanceStrategy: 'KEEP_PRIMARY_OR_NONZERO' | 'SUM' = 'KEEP_PRIMARY_OR_NONZERO'
  ) => {
    if (!requirePermission(rbac.canBulkReclassify, 'डुप्लीकेट लेज़र मर्ज करना', 'merge duplicate ledgers and parties')) {
      return { mergedAccountsCount: 0, mergedPartiesCount: 0, relinkedEntriesCount: 0 };
    }
    const audit = findDuplicateLedgersAndParties(data);
    if (audit.totalDuplicateRecords === 0) {
      setToastMessage(
        isHindi
          ? '✅ कोई डुप्लीकेट लेज़र या पार्टी नहीं मिली — आपके खाते 100% साफ़ हैं!'
          : '✅ No duplicate ledgers or parties detected — your books are completely clean!'
      );
      setTimeout(() => setToastMessage(null), 4000);
      return { mergedAccountsCount: 0, mergedPartiesCount: 0, relinkedEntriesCount: 0 };
    }

    const res = mergeDuplicateLedgersAndParties(data, selectedClusterIds, balanceStrategy);
    const audited = logAuditAction(
      res.updatedData,
      'Duplicate Ledgers & Parties Consolidated',
      `Merged ${res.mergedAccountsCount} duplicate accounts & ${res.mergedPartiesCount} duplicate parties; relinked ${res.relinkedEntriesCount} ledger/voucher references.`
    );
    setData(audited);
    saveAppData(audited, sessionUser?.id);

    setToastMessage(
      isHindi
        ? `🧹 डुप्लीकेट सफाई पूर्ण! ${res.mergedAccountsCount} लेज़र और ${res.mergedPartiesCount} पार्टियाँ मर्ज हुईं (${res.relinkedEntriesCount} एंट्री लिंक अपडेटेड)।`
        : `🧹 Merged ${res.mergedAccountsCount} duplicate accounts & ${res.mergedPartiesCount} duplicate parties (${res.relinkedEntriesCount} references relinked).`
    );
    setTimeout(() => setToastMessage(null), 5500);
    return {
      mergedAccountsCount: res.mergedAccountsCount,
      mergedPartiesCount: res.mergedPartiesCount,
      relinkedEntriesCount: res.relinkedEntriesCount
    };
  };

  // Handler: Import Data from External Software (Vyapar, Busy, Marg, Zoho Books, QuickBooks, Excel/CSV)
  const handleImportExternalData = (payload: ExternalImportCommitPayload) => {
    if (!requirePermission(rbac.canImportData, 'अन्य सॉफ़्टवेयर डेटा इम्पोर्ट करना', 'import external software data')) return;
    const cleanPayload: ExternalImportCommitPayload = JSON.parse(JSON.stringify(payload));
    const savedSnap = savePreImportSnapshot(
      data,
      cleanPayload.fileName || 'External_Import.xlsx',
      cleanPayload.software,
      sessionUser?.id
    );
    if (savedSnap) setPreImportSnapshot(savedSnap);
    const batchRecord: ExternalLastImportBatch = {
      fileName: cleanPayload.fileName || 'External_Import.xlsx',
      software: cleanPayload.software,
      importedAt: new Date().toISOString(),
      accountIds: (cleanPayload.accounts || []).map(a => a.id),
      partyIds: (cleanPayload.parties || []).map(p => p.id),
      itemIds: (cleanPayload.items || []).map(i => i.id),
      invoiceIds: (cleanPayload.invoices || []).map(i => i.id),
      purchaseIds: (cleanPayload.purchaseInvoices || []).map(p => p.id),
      voucherIds: (cleanPayload.vouchers || []).map(v => v.id),
    };

    try {
      localStorage.setItem(externalBatchStorageKey, JSON.stringify(batchRecord));
    } catch {
      // ignore
    }
    setLastExternalImportBatch(batchRecord);

    setData(prev => {
      const itemStockMap = new Map(
        (cleanPayload.itemStockUpdates || []).map(u => [u.itemId, u])
      );
      const nextExistingItems = (prev.items || []).map(i => {
        const upd = itemStockMap.get(i.id);
        if (!upd) return i;
        const nextStock = Math.max(
          0,
          Math.round(((Number(i.currentStock) || 0) + (Number(upd.qtyDelta) || 0)) * 1000) / 1000
        );
        const nextPurchase =
          upd.purchasePrice !== undefined && upd.purchasePrice > 0
            ? upd.purchasePrice
            : i.purchasePrice;
        const nextSales =
          upd.salesPrice !== undefined &&
          upd.salesPrice > 0 &&
          (!i.salesPrice || i.salesPrice <= 0)
            ? upd.salesPrice
            : i.salesPrice;
        const stockChanged = Math.abs((Number(i.currentStock) || 0) - nextStock) > 0.0005;
        const rateChanged = Math.abs((Number(i.purchasePrice) || 0) - (Number(nextPurchase) || 0)) > 0.0005;
        return {
          ...i,
          currentStock: nextStock,
          purchasePrice: nextPurchase,
          salesPrice: nextSales,
          ...(stockChanged || rateChanged
            ? {
                closingStockValue: undefined,
                importedClosingQty: undefined,
                importedPurchasePrice: undefined,
              }
            : {}),
        };
      });

      const updated: AppData = {
        ...prev,
        accounts: [...(prev.accounts || []), ...(cleanPayload.accounts || [])],
        parties: [...(prev.parties || []), ...(cleanPayload.parties || [])],
        items: [...nextExistingItems, ...(cleanPayload.items || [])],
        invoices: [...(cleanPayload.invoices || []), ...(prev.invoices || [])],
        purchaseInvoices: [...(cleanPayload.purchaseInvoices || []), ...(prev.purchaseInvoices || [])],
        vouchers: [...(cleanPayload.vouchers || []), ...(prev.vouchers || [])],
      };

      const audited = logAuditAction(
        updated,
        'External Software Data Imported',
        `Imported ${cleanPayload.software} (${cleanPayload.entityType}) from "${batchRecord.fileName}": ${cleanPayload.parties.length} Parties, ${cleanPayload.items.length} Items, ${cleanPayload.accounts.length} Accounts, ${cleanPayload.invoices.length} Sales, ${cleanPayload.purchaseInvoices.length} Purchases, ${cleanPayload.vouchers.length} Vouchers.`
      );
      saveAppData(audited, sessionUser?.id);
      return audited;
    });

    if (cleanPayload.maxDate && !isDateInFinancialYear(cleanPayload.maxDate, selectedFYStart)) {
      const targetFy = normalizeFYStartDate(getFinancialYearStartForDate(cleanPayload.maxDate));
      setSelectedFYStart(targetFy);
    }

    const total =
      cleanPayload.parties.length +
      cleanPayload.items.length +
      cleanPayload.accounts.length +
      cleanPayload.invoices.length +
      cleanPayload.purchaseInvoices.length +
      cleanPayload.vouchers.length;

    setToastMessage(
      isHindi
        ? `🌐 ${cleanPayload.software} इम्पोर्ट पूर्ण! कुल ${total} रिकॉर्ड सहेजे गए।`
        : `🌐 ${cleanPayload.software} Import Complete! Saved ${total} records cleanly.`
    );
    setTimeout(() => setToastMessage(null), 5000);
  };

  const handleUndoLastExternalImport = () => {
    if (!requirePermission(rbac.canImportData && rbac.canDeleteRecords, 'बाहरी इम्पोर्ट पूर्ववत करना', 'undo last external import')) return;
    if (!lastExternalImportBatch) return;
    const accSet = new Set(lastExternalImportBatch.accountIds);
    const partySet = new Set(lastExternalImportBatch.partyIds);
    const itemSet = new Set(lastExternalImportBatch.itemIds);
    const invSet = new Set(lastExternalImportBatch.invoiceIds);
    const purSet = new Set(lastExternalImportBatch.purchaseIds);
    const vchSet = new Set(lastExternalImportBatch.voucherIds);

    setData(prev => {
      const updated: AppData = {
        ...prev,
        accounts: (prev.accounts || []).filter(a => !accSet.has(a.id)),
        parties: (prev.parties || []).filter(p => !partySet.has(p.id)),
        items: (prev.items || []).filter(i => !itemSet.has(i.id)),
        invoices: (prev.invoices || []).filter(i => !invSet.has(i.id)),
        purchaseInvoices: (prev.purchaseInvoices || []).filter(p => !purSet.has(p.id)),
        vouchers: (prev.vouchers || []).filter(v => !vchSet.has(v.id)),
      };
      const audited = logAuditAction(
        updated,
        'External Import Reverted',
        `Removed records imported from "${lastExternalImportBatch.fileName}".`
      );
      saveAppData(audited, sessionUser?.id);
      return audited;
    });

    try {
      localStorage.removeItem(externalBatchStorageKey);
    } catch {
      // ignore
    }
    setLastExternalImportBatch(null);
    setToastMessage(
      isHindi
        ? '↩️ पिछला बाहरी सॉफ़्टवेयर इम्पोर्ट सफलतापूर्वक हटा दिया गया!'
        : '↩️ Last external software import removed cleanly!'
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  const handleRemoveAllExternalData = () => {
    if (!requirePermission(rbac.canDeleteRecords && rbac.canImportData, 'सभी बाहरी इम्पोर्ट डेटा हटाना', 'remove all external imported data')) return;
    const isNotExt = (id?: string) => !(id && id.includes('_ext_'));
    setData(prev => {
      const updated: AppData = {
        ...prev,
        accounts: (prev.accounts || []).filter(a => isNotExt(a.id)),
        parties: (prev.parties || []).filter(p => isNotExt(p.id)),
        items: (prev.items || []).filter(i => isNotExt(i.id)),
        invoices: (prev.invoices || []).filter(i => isNotExt(i.id)),
        purchaseInvoices: (prev.purchaseInvoices || []).filter(p => isNotExt(p.id)),
        vouchers: (prev.vouchers || []).filter(v => isNotExt(v.id)),
      };
      const audited = logAuditAction(
        updated,
        'All External Imported Records Removed',
        'Removed all Excel/CSV/other-software imported records from current company.'
      );
      saveAppData(audited, sessionUser?.id);
      return audited;
    });

    try {
      localStorage.removeItem(externalBatchStorageKey);
    } catch {
      // ignore
    }
    setLastExternalImportBatch(null);
    setToastMessage(
      isHindi
        ? '🧹 सभी Excel / अन्य सॉफ़्टवेयर इम्पोर्टेड डेटा हटा दिए गए!'
        : '🧹 All external software imported records removed cleanly!'
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  const handleAddAuditLog = (action: string, description: string) => {
    if (!requirePermission(!rbac.isReadOnly, 'मैन्युअल ऑडिट टिप्पणी जोड़ना', 'add manual audit entries')) return;
    const updated = logAuditAction(data, action, description);
    setData(updated);
  };

  // Handle App Data Reset
  const handleResetSampleData = () => {
    if (!requirePermission(rbac.canResetWorkspace, 'वर्कस्पेस रीसेट करना', 'reset workspace data')) return;
    setShowResetModal(true);
  };

  const confirmResetDataNow = () => {
    if (!requirePermission(rbac.canResetWorkspace, 'वर्कस्पेस रीसेट करना', 'reset workspace data')) return;
    clearUserLocalData(sessionUser?.id);
    try {
      localStorage.removeItem(tallyBatchStorageKey);
      localStorage.removeItem(externalBatchStorageKey);
    } catch {
      // ignore
    }
    clearPreImportSnapshot(sessionUser?.id);
    setPreImportSnapshot(null);
    setLastTallyImportBatch(null);
    setLastExternalImportBatch(null);

    const userEmail = sessionUser?.email || firebaseUser?.email || null;
    const cleanWorkspace = createFreshAppData(
      sessionUser ? `cmp_${sessionUser.id}` : 'cmp_1',
      undefined,
      userEmail,
      { forceBlank: true }
    );

    // Preserve active license, user profiles & security PIN while wiping all business/demo/imported records
    const preservedCleanData: AppData = {
      ...cleanWorkspace,
      license: data.license || cleanWorkspace.license,
      userProfiles: data.userProfiles || cleanWorkspace.userProfiles,
      activeUser: data.activeUser || cleanWorkspace.activeUser,
      securityPin: data.securityPin ?? null,
      pinRequired: Boolean(data.pinRequired),
    };

    setData(preservedCleanData);
    saveAppData(preservedCleanData, sessionUser?.id);
    setIsUnlocked(true);
    setShowResetModal(false);
    setToastMessage(
      isHindi
        ? '🧹 कार्यक्षेत्र 100% साफ़ खाली हो गया है — अब आप नई कंपनी या XML डेटा इम्पोर्ट कर सकते हैं!'
        : '🧹 Workspace reset to 100% clean empty state — ready for ERP XML import or fresh setup!'
    );
    setTimeout(() => setToastMessage(null), 5000);
  };

  // Load Sample Demo Data on demand (inside Settings) for new users who want to practice
  const handleLoadSampleDemoData = () => {
    if (!requirePermission(rbac.canResetWorkspace, 'सैंपल डेमो डेटा लोड करना', 'load sample demo data')) return;
    const companyId = sessionUser?.id ? `cmp_${sessionUser.id}` : data.company.id;
    const demoData = createSampleDemoData(companyId, data.license);
    const updated = logAuditAction(
      demoData,
      'Sample Demo Data Loaded',
      'User loaded sample demo invoices, vouchers, parties, and stock items from Settings for practice.'
    );
    setData(updated);
    if (sessionUser?.id) {
      saveAppData(updated, sessionUser.id);
    } else {
      saveAppData(updated);
    }
    setToastMessage(
      isHindi
        ? '✅ प्रैक्टिस के लिए सैंपल डेमो डेटा लोड हो गया है! आप कभी भी Settings से साफ़ डेटा रीसेट कर सकते हैं।'
        : '✅ Sample demo data loaded for practice! You can reset to a clean workspace anytime.'
    );
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Local Wi-Fi / LAN Multi-PC & Mobile Live View (bypasses Firebase auth; gated by server pairing code)
  if (isLanClientView) {
    return <LanLiveView isHindi={isHindi} initialCode={urlLanPairCode} />;
  }

  // Wait for Firebase Auth verification before deciding session validity
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-slate-300 gap-3 font-sans">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold tracking-wide text-slate-400">
          {isHindi ? 'सुरक्षित लॉगिन सत्र जाँचा जा रहा है...' : 'Verifying secure session...'}
        </p>
      </div>
    );
  }

  // Public Website Page (Web Browser Only — strictly skipped inside Electron Desktop .exe)
  if ((!sessionUser || !firebaseUser) && !isDesktopRuntime && !showWebAuthScreen) {
    return (
      <SalesPage
        isHindi={isHindi}
        onLaunchDemo={() => setShowWebAuthScreen(true)}
        onToggleLanguage={() => setIsHindi((prev) => !prev)}
      />
    );
  }

  // Unauthenticated Guard Screen
  if (!sessionUser || !firebaseUser) {
    return (
      <AuthScreen
        isHindi={isHindi}
        onLoginSuccess={handleLoginSuccess}
        registeredUsers={registeredUsers}
        onRegisterUser={handleRegisterUser}
        masterPin={data.securityPin}
        onResetPassword={handleResetUserPassword}
        onBackToWebsite={!isDesktopRuntime ? () => setShowWebAuthScreen(false) : undefined}
      />
    );
  }

  // Security PIN Overlay Lock
  if (!isUnlocked && data.pinRequired && data.securityPin) {
    return (
      <PinLockOverlay
        storedPin={data.securityPin}
        userEmail={firebaseUser?.email || sessionUser?.email}
        onUnlock={() => setIsUnlocked(true)}
        onVerifiedResetPin={(newPin: string) => {
          handleUpdateSecurityPinAndPass(newPin, true);
          setIsUnlocked(true);
        }}
        onLogout={handleLogout}
        isHindi={isHindi}
      />
    );
  }

  const unreconciledCount = fyData.bankStatements.filter(s => !s.isReconciled).length;
  const pendingInvoicesCount = fyData.invoices.filter(i => i.status !== 'PAID').length;
  const lowStockCount = (fyData.items || []).filter(i => Number(i.currentStock || 0) <= Number(i.minStockLevel || i.minStockAlert || 5)).length;

  const getThemeClass = (t: AppTheme) => {
    switch (t) {
      case 'navy':
        return 'bg-slate-950 text-blue-50';
      case 'emerald':
        return 'bg-stone-950 text-emerald-50';
      case 'purple':
        return 'bg-zinc-950 text-purple-50';
      case 'light':
        return 'bg-slate-100 text-slate-900';
      default:
        return 'bg-slate-950 text-slate-100';
    }
  };

  const isTableLockedView =
    activeTab === 'invoices' ||
    activeTab === 'purchases' ||
    activeTab === 'vouchers' ||
    activeTab === 'items' ||
    activeTab === 'parties' ||
    activeTab === 'ledger' ||
    activeTab === 'statements';

  const workspaceScaleStyle = {
    '--hv-scale': zoomLevel / 100,
  } as React.CSSProperties;

  return (
    <div 
      className={`h-screen h-[100dvh] max-h-[100dvh] overflow-hidden ${getThemeClass(theme)} flex flex-col font-sans selection:bg-indigo-500 selection:text-white transition-colors duration-300 w-full max-w-full`}
    >
      {/* Top Header */}
      <Header
        data={fyData}
        onUpdateCurrency={handleUpdateCurrency}
        onOpenQuickModal={(type) => {
          if (type === 'invoice') {
            if (!requirePermission(rbac.canCreateEditTransactions, 'नया इनवॉइस बनाना', 'create sales invoices')) return;
            setEditingInvoice(null);
            setShowInvoiceModal(true);
          } else {
            if (!requirePermission(rbac.canCreateEditVouchers, 'नया वाउचर बनाना', 'create vouchers')) return;
            setEditingVoucher(null);
            if (type === 'payment') setShowPaymentModal(true);
            else if (type === 'receipt') setShowReceiptModal(true);
            else if (type === 'contra') setShowContraModal(true);
            else setShowJournalModal(true);
          }
        }}
        onOpenBackupModal={() => {
          if (!requirePermission(rbac.canUseAdminBackup, 'सुरक्षा और बैकअप केंद्र खोलना', 'open Security & Backup center')) return;
          setShowSecurityModal(true);
        }}
        onOpenSecurityModal={() => {
          if (!requirePermission(rbac.canUseAdminBackup, 'सुरक्षा और बैकअप केंद्र खोलना', 'open Security & Backup center')) return;
          setShowSecurityModal(true);
        }}
        onOpenMasterPinModal={() => {
          if (!requirePermission(rbac.canManageUsersAndPin, 'मास्टर पिन सेटिंग्स बदलना', 'open Master PIN & Password settings')) return;
          setShowMasterPinModal(true);
        }}
        onOpenLicenseModal={() => {
          if (!requirePermission(rbac.canManageUsersAndPin, 'लाइसेंस प्रबंधन खोलना', 'open License Activation')) return;
          setShowLicenseModal(true);
        }}
        onOpenUpdateModal={() => {
          if (!requirePermission(rbac.canManageUsersAndPin, 'सॉफ़्टवेयर अपडेट खोलना', 'open Software Update')) return;
          setShowSoftwareUpdateModal(true);
        }}
        onOpenConfigureModal={() => openConfigureModal('general')}
        onRefreshData={handleRefreshData}
        cloudSyncStatus={cloudSyncStatus}
        lastSyncTime={lastSyncTime}
        onOpenCloudSyncModal={() => setShowCloudSyncModal(true)}
        onOpenUserModal={() => setShowUserModal(true)}
        onOpenCompanyManager={() => {
          if (!requirePermission(rbac.canManageCompanies, 'कंपनी प्रबंधक खोलना', 'open Company Manager')) return;
          setShowCompanyModal(true);
        }}
        onLogout={handleLogout}
        activeUser={activeUser}
        activeUserRole={effectiveRole}
        permissions={rbac}
        onLockSession={() => setIsUnlocked(false)}
        onSearchChange={setSearchQuery}
        searchQuery={searchQuery}
        isHindi={isHindi}
        onToggleHindi={() => setIsHindi(!isHindi)}
        onResetSampleData={handleResetSampleData}
        zoomLevel={zoomLevel}
        onUpdateZoom={handleUpdateZoom}
        theme={theme}
        onUpdateTheme={handleUpdateTheme}
        onNavigateTab={(tab) => navigateToTab(tab)}
        onSelectInvoice={(inv) => setPrintInvoice(inv)}
        onSelectParty={() => navigateToTab('parties')}
        onSelectAccount={(accId) => navigateToTab('ledger', accId)}
        onOpenMobileModal={() => setShowMobileModal(true)}
        onOpenUserManual={() => setShowUserManualModal(true)}
        availableFinancialYears={availableFinancialYears}
        activeFinancialYearStart={selectedFYStart}
        onChangeFinancialYear={handleChangeFinancialYear}
        onOpenShortcutsModal={() => setShowShortcutsModal(true)}
        appConfig={appConfig}
        onOpenFeaturesModal={() => openConfigureModal('features')}
      />

      {/* Email Verification Pending Banner for Email/Password Accounts */}
      {firebaseUser && !isEmailVerified && storageMode !== 'local' && !dismissedEmailVerifyBanner && (
        <div className="bg-amber-500/15 text-amber-200 px-4 py-2 text-xs font-semibold flex flex-wrap items-center justify-between gap-2 z-40 border-b border-amber-500/30 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              {isHindi
                ? `ईमेल सत्यापन लंबित (${firebaseUser.email}) — आपका डेटा अभी लोकल डिवाइस मोड में सुरक्षित है। क्लाउड सिंक चालू करने के लिए ईमेल सत्यापित करें।`
                : `Email verification pending (${firebaseUser.email}) — books are safely saved in Local Device Mode. Verify your email to enable Firestore Cloud Sync.`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleResendVerificationEmail}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition cursor-pointer"
            >
              {isHindi ? 'सत्यापन ईमेल भेजें' : 'Resend Link'}
            </button>
            <button
              type="button"
              onClick={handleRefreshEmailVerification}
              disabled={isCheckingVerification}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-[11px] border border-slate-600 transition cursor-pointer disabled:opacity-50"
            >
              {isCheckingVerification
                ? (isHindi ? 'जाँच हो रही है...' : 'Checking...')
                : (isHindi ? 'सत्यापित कर लिया — सिंक चालू करें' : "I've Verified — Sync")}
            </button>
            <button
              type="button"
              onClick={() => setDismissedEmailVerifyBanner(true)}
              className="p-1 rounded-lg text-amber-300 hover:text-white hover:bg-amber-500/20 transition cursor-pointer"
              title={isHindi ? 'बंद करें' : 'Dismiss'}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Historical / Custom Period Financial Year Notice Banner */}
      {selectedFYStart !== currentFYStart && (
        <div
          className={`px-4 py-2 text-xs font-bold flex flex-wrap items-center justify-between gap-2 shadow-xl z-40 border-b shrink-0 ${
            activeFyRange.isCustomPeriod || selectedFYStart === ALL_FINANCIAL_YEARS
              ? 'bg-emerald-600/95 text-white border-emerald-400'
              : 'bg-amber-500/95 text-slate-950 border-amber-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 shrink-0" />
            <span>
              {activeFyRange.isCustomPeriod
                ? (isHindi
                    ? `🗓️ कस्टम पीरियड सक्रिय: ${activeFyRange.label} (${activeFyRange.displayRange}) — पूर्ववर्ती वर्षों का क्लोज़िंग बैलेंस स्वतः Opening Balance के रूप में जुड़ा हुआ है।`
                    : `🗓️ Custom Period Active: ${activeFyRange.label} (${activeFyRange.displayRange}) — Prior closing balances automatically carried forward as Opening Balance.`)
                : selectedFYStart === ALL_FINANCIAL_YEARS
                  ? (isHindi
                      ? '🌐 सभी वर्ष संयुक्त व्यू (आज तक) सक्रिय — सभी वित्तीय वर्षों के संयुक्त लेज़र और रिपोर्ट दिख रहे हैं।'
                      : '🌐 Viewing All Years Combined (To Current Date) — Ledgers, Parties & Financial Statements span complete multi-year data.')
                  : (isHindi
                      ? `🕰️ आप वित्तीय वर्ष ${activeFyRange.label} (${activeFyRange.displayRange}) देख रहे हैं — पिछले वर्ष का क्लोज़िंग बैलेंस इस वर्ष में स्वतः Opening Balance के रूप में जुड़ा हुआ है।`
                      : `🕰️ Viewing ${activeFyRange.label} (${activeFyRange.displayRange}) — Prior year closing balances automatically carried forward as Opening Balance.`)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleChangeFinancialYear(currentFYStart)}
            className="bg-slate-950 hover:bg-slate-900 text-amber-300 px-3 py-1 rounded-xl text-[11px] font-extrabold transition shadow cursor-pointer"
          >
            {isHindi
              ? `वापस वर्तमान वर्ष (${getFinancialYearRange(currentFYStart).label})`
              : `Back to Current ${getFinancialYearRange(currentFYStart).label}`}
          </button>
        </div>
      )}

      {/* Validation / Rejection Error Banner */}
      {errorToastMessage && (
        <div className="bg-rose-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-2xl animate-fadeIn border-b border-rose-400 z-40 shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0" />
            <span>{errorToastMessage}</span>
          </div>
          <button onClick={() => setErrorToastMessage(null)} className="p-1 hover:bg-rose-700 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="bg-indigo-600 text-white px-4 py-2.5 text-xs font-bold flex items-center justify-between shadow-2xl animate-fadeIn border-b border-indigo-400 z-40 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="p-1 hover:bg-indigo-700 rounded-lg transition">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Trial / License Banner */}
      {!trialStatus.isLicensed && (
        <div
          className={`${
            trialStatus.vaultTampered || trialStatus.clockTampered || trialStatus.machineMismatch || trialStatus.lockReason === 'LICENSE_REVOKED' || trialStatus.isTrialExpired
              ? 'bg-gradient-to-r from-rose-700 to-rose-800'
              : 'bg-gradient-to-r from-amber-600 to-amber-700'
          } text-white px-4 py-2 text-xs font-bold flex items-center justify-between gap-2 shadow shrink-0`}
        >
          <span>
            {trialStatus.vaultTampered
              ? (isHindi
                  ? '🚨 सिक्योरिटी अलर्ट: स्थानीय लाइसेंस वॉल्ट या Ed25519 हस्ताक्षर सत्यापन विफल! वैध सर्टिफिकेट दर्ज करें।'
                  : '🚨 Security Alert: Local license vault or Ed25519 signature verification failed! Activate a valid certificate.')
              : trialStatus.clockTampered
                ? (isHindi
                    ? '🚨 एंटी-टैम्पर अलर्ट: सिस्टम की तारीख पीछे बदली गई है! सही तारीख/समय सेट करें या लाइसेंस सत्यापित करें।'
                    : '🚨 Anti-Tamper Alert: System clock rollback detected! Restore Windows date/time to continue.')
                : trialStatus.lockReason === 'LICENSE_REVOKED'
                  ? (isHindi
                      ? '🚨 लाइसेंस रद्द: एडमिन द्वारा इस लाइसेंस को रद्द कर दिया गया है।'
                      : '🚨 License Revoked: This certificate has been revoked by the administrator.')
                  : trialStatus.machineMismatch
                    ? (isHindi
                        ? '🚨 मशीन ID बेमेल: यह लाइसेंस किसी अन्य PC का है। इस कंप्यूटर की लाइसेंस कुंजी दर्ज करें।'
                        : '🚨 Machine Mismatch: License belongs to a different PC. Activate a key for this Machine ID.')
                    : trialStatus.isTrialExpired
                      ? (isHindi
                          ? `🔴 ट्रायल सीमा पूर्ण (${trialStatus.vouchersUsed}/${trialStatus.maxTrialVouchers} वाउचर)। सभी सुविधाएं जारी रखने के लिए लाइसेंस एक्टिवेट करें।`
                          : `🔴 Trial Limit Reached (${trialStatus.vouchersUsed}/${trialStatus.maxTrialVouchers} vouchers). Activate Commercial License.`)
                      : (isHindi
                          ? `⚡ सॉफ्टवेयर ट्रायल: ${trialStatus.daysRemaining} दिन एवं ${trialStatus.vouchersRemaining}/${trialStatus.maxTrialVouchers} वाउचर शेष।`
                          : `⚡ Software Trial: ${trialStatus.daysRemaining} day(s) & ${trialStatus.vouchersRemaining}/${trialStatus.maxTrialVouchers} vouchers remaining. Activate Commercial License.`)}
          </span>
          <button
            onClick={() => setShowLicenseModal(true)}
            className="bg-white text-slate-900 px-3 py-1 rounded-lg text-[11px] font-extrabold hover:bg-slate-100 shadow transition shrink-0"
          >
            {isHindi ? 'लाइसेंस एक्टिवेट करें' : 'Activate License'}
          </button>
        </div>
      )}

      {/* Auto Invoice Notice Toast */}
      {autoInvoiceNotice && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-lg animate-fadeIn shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{autoInvoiceNotice}</span>
          </div>
          <button onClick={() => setAutoInvoiceNotice(null)} className="p-1 hover:bg-emerald-700 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* Left Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => navigateToTab(tab)}
          isHindi={isHindi}
          unreconciledCount={unreconciledCount}
          pendingInvoicesCount={pendingInvoicesCount}
          lowStockCount={lowStockCount}
          isCustomerView={isCustomerView}
          activeUserRole={effectiveRole}
          mobileMenuOpen={isMobileDrawerOpen}
          onToggleMobileMenu={setIsMobileDrawerOpen}
          appConfig={appConfig}
          onOpenFeaturesModal={() => openConfigureModal('features')}
        />

        {/* Main Content Area */}
        <main 
          className={`flex-1 min-h-0 flex flex-col overscroll-contain bg-slate-950 touch-pan-y ${
            isTableLockedView
              ? 'overflow-y-auto md:overflow-hidden pb-24 md:pb-0'
              : 'overflow-y-auto pb-28 md:pb-16'
          }`}
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {activeTab !== 'dashboard' && (
            <div className="bg-slate-900 backdrop-blur-md border-b border-slate-800 px-4 py-2 flex items-center justify-between sticky top-0 z-20 shadow-md shrink-0">
              <button
                onClick={() => {
                  if (selectedLedgerAccountId) {
                    setSelectedLedgerAccountId(null);
                  } else {
                    setActiveTab('dashboard');
                  }
                }}
                className="flex items-center gap-2 text-indigo-300 hover:text-indigo-200 bg-indigo-950/60 hover:bg-indigo-900/80 border border-indigo-500/30 px-3 py-1.5 rounded-xl font-bold text-xs transition shadow shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>{isHindi ? '❮ मुख्य डैशबोर्ड पर वापस जाएं (Back)' : '❮ Back to Dashboard'}</span>
              </button>

              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 font-bold uppercase text-amber-300">
                  {activeTab}
                </span>
                {selectedLedgerAccountId && (
                  <span className="text-slate-300 font-sans">
                    / Account Ledger: <strong className="text-white">{data.accounts.find(a => a.id === selectedLedgerAccountId)?.name}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="hv-workspace-content w-full" style={workspaceScaleStyle}>
              <Dashboard
                data={fyData}
                isHindi={isHindi}
                activeUserRole={effectiveRole}
                permissions={rbac}
                appConfig={appConfig}
                onNavigateTab={(tab) => navigateToTab(tab)}
                onOpenQuickModal={(type) => {
                  if (type === 'invoice') {
                    if (!requirePermission(rbac.canCreateEditTransactions, 'नया इनवॉइस बनाना', 'create sales invoices')) return;
                    setEditingInvoice(null);
                    setShowInvoiceModal(true);
                  } else {
                    if (!requirePermission(rbac.canCreateEditVouchers, 'नया वाउचर बनाना', 'create vouchers')) return;
                    if (type === 'journal') setShowJournalModal(true);
                    else if (type === 'payment') setShowPaymentModal(true);
                    else if (type === 'receipt') setShowReceiptModal(true);
                  }
                }}
                onPrintInvoice={(inv) => setPrintInvoice(inv)}
              />
            </div>
          )}

          {activeTab !== 'dashboard' && (
            <div
              className={`hv-workspace-content comfortable-erp-view w-full ${
                isTableLockedView ? 'md:flex-1 md:min-h-0 md:flex md:flex-col md:overflow-hidden' : ''
              }`}
              style={workspaceScaleStyle}
            >
              {activeTab === 'reconciliation' && (
                <div className="p-3 sm:p-4 md:p-6 pb-0 max-w-7xl mx-auto w-full">
                  <AiComplianceCopilot data={fyData} isHindi={isHindi} mode="BANK" onNavigateTab={(tab) => navigateToTab(tab as NavTab)} />
                </div>
              )}

              {activeTab === 'tax' && (
                <div className="p-4 md:px-6 md:pt-6 pb-0">
                  <AiComplianceCopilot data={fyData} isHindi={isHindi} mode="TAX" onNavigateTab={(tab) => navigateToTab(tab as NavTab)} />
                </div>
              )}

          {activeTab === 'invoices' && (
            <InvoiceList
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onOpenCreateModal={() => {
                if (!requirePermission(rbac.canCreateEditTransactions, 'नया इनवॉइस बनाना', 'create sales invoices')) return;
                setEditingInvoice(null);
                setShowInvoiceModal(true);
              }}
              onOpenBarcodePos={isNavTabEnabled('pos', appConfig) ? () => navigateToTab('pos') : undefined}
              onPrintInvoice={(inv) => setPrintInvoice(inv)}
              onDeleteInvoice={handleDeleteInvoice}
              onRecordPayment={handleRecordInvoicePayment}
              onEditInvoice={handleEditInvoice}
              onOpenEWayBillModal={handleOpenEWayBillModal}
              initialSearchQuery={searchQuery}
            />
          )}

          {activeTab === 'pos' && (
            <BarcodePOSModule
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onCompleteSale={(inv, autoPrint) => handleSaveInvoice(inv, { autoPrint, fromPos: true })}
              onAddParty={handleAddParty}
              onAddItem={handleAddItem}
            />
          )}

          {activeTab === 'purchases' && (
            <PurchaseModule
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onSaveBill={handleSavePurchaseBill}
              onDeleteBill={handleDeletePurchaseBill}
              onSavePO={handleSavePurchaseOrder}
              onDeletePO={handleDeletePurchaseOrder}
              onAddParty={handleAddParty}
              onAddItem={handleAddItem}
            />
          )}

          {activeTab === 'vouchers' && (
            <VoucherList
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onOpenQuickModal={(type, editVch) => {
                if (!requirePermission(rbac.canCreateEditVouchers, 'वाउचर खोलना', 'create or edit vouchers')) return;
                setEditingVoucher(editVch || null);
                if (type === 'journal') setShowJournalModal(true);
                else if (type === 'payment') setShowPaymentModal(true);
                else if (type === 'receipt') setShowReceiptModal(true);
                else if (type === 'contra') setShowContraModal(true);
              }}
              onDeleteVoucher={handleDeleteVoucher}
              onDeleteBatchVouchers={handleDeleteBatchVouchers}
              onBulkReclassifyVouchers={handleBulkReclassifyVouchers}
            />
          )}

          {activeTab === 'reconciliation' && (
            <BankReconciliation
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onReconcileMatch={handleReconcileMatch}
              onAddStatementLine={handleAddStatementLine}
              onBatchAddStatementLines={handleBatchAddStatementLines}
              onPostBankVouchersBatch={handlePostBankVouchersBatch}
              onCreateBankLedgerQuick={handleCreateBankLedgerQuick}
              onUpdateAccount={handleUpdateAccount}
              onQuickCreateBankChargeVoucher={handleQuickCreateBankChargeVoucher}
              onDeleteStatementLine={handleDeleteStatementLine}
              onClearAllBankStatements={handleClearAllBankStatements}
            />
          )}

          {activeTab === 'payroll' && (
            <PayrollManagement
              data={fyData}
              isHindi={isHindi}
              currency={fyData.company.currency || 'INR'}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onSaveEmployee={handleSaveEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onSavePayrollBatch={handleSavePayrollBatch}
            />
          )}

          {activeTab === 'tax' && (
            <TaxCompliance
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              activeFyLabel={activeFyRange.shortLabel}
              onPrintInvoice={(inv) => setPrintInvoice(inv)}
              onEditInvoice={handleEditInvoice}
              onOpenEWayBillModal={handleOpenEWayBillModal}
              onUpdateGstPortalData={(updater) => {
                if (!requirePermission(rbac.canCreateEditVouchers && !rbac.isReadOnly, 'GST पोर्टल डेटा अपडेट करना', 'update GST portal snapshot')) return;
                setData((prev) => {
                  const nextPortalData = updater(prev.gstPortalData || {});
                  const updated = logAuditAction(
                    { ...prev, gstPortalData: nextPortalData },
                    'GST Portal Data Updated',
                    'Updated GST Portal 2A/2B, filed returns, or GSTR-9 reconciliation snapshot.'
                  );
                  return updated;
                });
              }}
            />
          )}

          {activeTab === 'ledger' && (
            <>
              {selectedLedgerAccountId ? (
                <GeneralLedgerView
                  data={fyData}
                  masterData={data}
                  accountId={selectedLedgerAccountId}
                  isHindi={isHindi}
                  activeUserRole={effectiveRole}
                  permissions={rbac}
                  onBack={() => setSelectedLedgerAccountId(null)}
                  onDeleteVoucher={handleDeleteVoucher}
                  onDeleteInvoice={handleDeleteInvoice}
                  onDeletePurchaseInvoice={handleDeletePurchaseBill}
                  onDeleteDebitCreditNote={handleDeleteDebitCreditNote}
                  onDeleteBatchVouchers={handleDeleteBatchVouchers}
                  onDeleteBatchInvoices={handleDeleteBatchInvoices}
                  onDeleteBatchPurchaseInvoices={handleDeleteBatchPurchaseBills}
                  onDeleteBatchDebitCreditNotes={handleDeleteBatchDebitCreditNotes}
                  onEditInvoice={handleEditInvoice}
                  onEditPurchaseBill={(bill) => setEditingPurchaseBill(bill)}
                  onEditVoucher={handleEditVoucher}
                  onBulkReclassifyVouchers={handleBulkReclassifyVouchers}
                  onPrintInvoice={(inv) => setPrintInvoice(inv)}
                />
              ) : (
                <ChartOfAccounts
                  data={fyData}
                  isHindi={isHindi}
                  activeUserRole={effectiveRole}
                  permissions={rbac}
                  onSelectAccountLedger={(id) => setSelectedLedgerAccountId(id)}
                  onAddAccount={handleAddAccount}
                  onUpdateAccount={handleUpdateAccount}
                  onDeleteAccount={handleDeleteAccount}
                  onAddGroup={handleAddAccountGroup}
                  onDeleteGroup={handleDeleteAccountGroup}
                  onMergeDuplicateLedgers={handleMergeDuplicateLedgers}
                />
              )}
            </>
          )}

          {activeTab === 'statements' && (
            <FinancialStatements
              data={fyData}
              masterData={data}
              activePeriodLabel={`${activeFyRange.label} (${activeFyRange.displayRange})`}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              isEditModalOpen={Boolean(
                showInvoiceModal ||
                editingPurchaseBill ||
                showJournalModal ||
                showPaymentModal ||
                showReceiptModal ||
                showContraModal ||
                printInvoice ||
                showDebitCreditNoteModal
              )}
              onEditInvoice={handleEditInvoice}
              onEditPurchaseBill={(bill) => setEditingPurchaseBill(bill)}
              onEditVoucher={handleEditVoucher}
              onUpdateCompany={handleUpdateCompany}
            />
          )}

          {activeTab === 'budgeting' && (
            <Budgeting
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onSaveBudget={handleSaveBudget}
              onDeleteBudget={handleDeleteBudget}
              onOpenQuickModal={(type) => {
                if (!requirePermission(rbac.canCreateEditVouchers, 'वाउचर खोलना', 'open voucher modal')) return;
                if (type === 'payment') setShowPaymentModal(true);
                else if (type === 'journal') setShowJournalModal(true);
              }}
              onNavigateTab={(tab, accountId) => navigateToTab(tab, accountId)}
            />
          )}

          {activeTab === 'audit' && (
            <AuditLogView
              data={data}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onAddLog={handleAddAuditLog}
            />
          )}

          {activeTab === 'items' && (
            <ItemMasterList
              data={data}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onAddItem={handleAddItem}
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onStockAdjustment={handleStockAdjustment}
              onBatchStockAdjustment={handleBatchStockAdjustment}
              onSaveGodowns={handleSaveGodowns}
              onSaveBatch={handleSaveBatch}
              onDeleteBatch={handleDeleteBatch}
              onWriteOffBatch={handleWriteOffBatch}
              onExecuteStockTransfer={handleExecuteStockTransfer}
              onOpenBarcodePos={isNavTabEnabled('pos', appConfig) ? () => navigateToTab('pos') : undefined}
              onNavigateToPurchases={isNavTabEnabled('purchases', appConfig) ? () => navigateToTab('purchases') : undefined}
              onNavigateToSales={() => navigateToTab('invoices')}
              initialSearchQuery={searchQuery}
            />
          )}

          {activeTab === 'parties' && (
            <PartyMasterList
              data={fyData}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onAddParty={handleAddParty}
              onUpdateParty={handleUpdateParty}
              onDeleteParty={handleDeleteParty}
              onViewPartyLedger={(partyId) => navigateToTab('ledger', partyId)}
              initialSearchQuery={searchQuery}
            />
          )}

          {activeTab === 'utilities' && (
            <UtilitiesModule
              data={data}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onRestoreData={handleRestoreData}
              onResetSampleData={handleResetSampleData}
              onBulkImportItems={handleBulkImportItems}
              onBulkImportParties={handleBulkImportParties}
              onImportTallyData={handleImportTallyData}
              lastTallyImportBatch={lastTallyImportBatch}
              onUndoLastTallyImport={handleUndoLastTallyImport}
              onRemoveAllTallyData={handleRemoveAllTallyData}
              onMergeDuplicateLedgers={handleMergeDuplicateLedgers}
              onImportExternalData={handleImportExternalData}
              lastExternalImportBatch={lastExternalImportBatch}
              onUndoLastExternalImport={handleUndoLastExternalImport}
              onRemoveAllExternalData={handleRemoveAllExternalData}
              preImportSnapshot={preImportSnapshot}
              onRestorePreImportSnapshot={handleRestorePreImportSnapshot}
              onUpdateData={(updater) => {
                if (!requirePermission(rbac.canEditCompanySettings, 'मीडिया / उपयोगिता डेटा सहेजना', 'update workspace utilities data')) return;
                const updated = updater(data);
                setData(updated);
                saveAppData(updated);
              }}
              isCustomerView={isCustomerView}
            />
          )}

          {activeTab === 'settings' && (
            <CompanySettings
              data={data}
              isHindi={isHindi}
              activeUserRole={effectiveRole}
              permissions={rbac}
              onUpdateCompany={handleUpdateCompany}
              onBulkImportItems={handleBulkImportItems}
              onBulkImportParties={handleBulkImportParties}
              onImportTallyData={handleImportTallyData}
              lastTallyImportBatch={lastTallyImportBatch}
              onUndoLastTallyImport={handleUndoLastTallyImport}
              onRemoveAllTallyData={handleRemoveAllTallyData}
              onMergeDuplicateLedgers={handleMergeDuplicateLedgers}
              onImportExternalData={handleImportExternalData}
              lastExternalImportBatch={lastExternalImportBatch}
              onUndoLastExternalImport={handleUndoLastExternalImport}
              onRemoveAllExternalData={handleRemoveAllExternalData}
              preImportSnapshot={preImportSnapshot}
              onRestorePreImportSnapshot={handleRestorePreImportSnapshot}
              onSwitchCompany={handleSwitchCompany}
              onCreateNewCompany={handleCreateNewCompany}
              onDeleteCompany={handleDeleteCompany}
              onResetSoleCompany={confirmResetDataNow}
              onOpenCompanyManagerModal={() => {
                if (!requirePermission(rbac.canManageCompanies, 'कंपनी प्रबंधक खोलना', 'open Company Manager')) return;
                setShowCompanyModal(true);
              }}
              onOpenFeaturesModal={() => openConfigureModal('features')}
              onUpdateSecurityPinAndPass={handleUpdateSecurityPinAndPass}
              onOpenSecurityModal={() => {
                if (!requirePermission(rbac.canUseAdminBackup, 'सुरक्षा और बैकअप केंद्र खोलना', 'open Security & Backup center')) return;
                setShowSecurityModal(true);
              }}
              onLoadSampleDemoData={handleLoadSampleDemoData}
              onResetToCleanWorkspace={handleResetSampleData}
            />
          )}

              {activeTab === 'mis-reports' && (
                <MISReports
                  data={fyData}
                  masterData={data}
                  activeFyLabel={activeFyRange.shortLabel}
                  activePeriodStart={activeFyRange.fyStart}
                  activePeriodEnd={activeFyRange.fyEnd}
                  isHindi={isHindi}
                  activeUserRole={effectiveRole}
                  permissions={rbac}
                  onOpenDebitCreditNoteModal={() => {
                    if (!requirePermission(rbac.canCreateEditVouchers, 'नया डेबिट/क्रेडिट नोट बनाना', 'create Debit/Credit Notes')) return;
                    setShowDebitCreditNoteModal(true);
                  }}
                />
              )}
            </div>
          )}
        </main>
      </div>

      {/* Modals rendered dynamically */}
      {showDebitCreditNoteModal && (
        <DebitCreditNoteModal
          data={fyData}
          isOpen={true}
          isHindi={isHindi}
          onSave={handleSaveDebitCreditNote}
          onSaveNote={handleSaveDebitCreditNote}
          onClose={() => setShowDebitCreditNoteModal(false)}
        />
      )}
      {showInvoiceModal && (
        <InvoiceFormModal
          data={fyData}
          isHindi={isHindi}
          editingInvoice={editingInvoice}
          onSaveInvoice={handleSaveInvoice}
          onAddParty={handleAddParty}
          onAddItem={handleAddItem}
          onClose={() => {
            setShowInvoiceModal(false);
            setEditingInvoice(null);
          }}
        />
      )}

      {editingPurchaseBill && (
        <PurchaseBillModal
          data={data}
          isHindi={isHindi}
          editingBill={editingPurchaseBill}
          onAddParty={handleAddParty}
          onAddItem={handleAddItem}
          onSaveBill={(bill) => {
            handleSavePurchaseBill(bill);
            setEditingPurchaseBill(null);
          }}
          onClose={() => setEditingPurchaseBill(null)}
        />
      )}

      {printInvoice && (
        <InvoicePrintModal
          data={fyData}
          company={fyData.company}
          invoice={printInvoice}
          isHindi={isHindi}
          onClose={() => setPrintInvoice(null)}
        />
      )}

      {showJournalModal && (
        <JournalVoucherModal
          data={fyData}
          isHindi={isHindi}
          editingVoucher={editingVoucher || undefined}
          onSaveVoucher={handleSaveVoucher}
          onAddAccount={handleAddAccount}
          onClose={() => {
            setShowJournalModal(false);
            setEditingVoucher(null);
          }}
        />
      )}

      {showPaymentModal && (
        <PaymentVoucherModal
          data={fyData}
          isHindi={isHindi}
          editingVoucher={editingVoucher || undefined}
          onSaveVoucher={handleSaveVoucher}
          onAddAccount={handleAddAccount}
          onClose={() => {
            setShowPaymentModal(false);
            setEditingVoucher(null);
          }}
        />
      )}

      {showReceiptModal && (
        <ReceiptVoucherModal
          data={fyData}
          isHindi={isHindi}
          editingVoucher={editingVoucher || undefined}
          onSaveVoucher={handleSaveVoucher}
          onAddAccount={handleAddAccount}
          onClose={() => {
            setShowReceiptModal(false);
            setEditingVoucher(null);
          }}
        />
      )}

      {showContraModal && (
        <ContraVoucherModal
          data={fyData}
          isHindi={isHindi}
          editingVoucher={editingVoucher || undefined}
          onSaveVoucher={handleSaveVoucher}
          onAddAccount={handleAddAccount}
          onClose={() => {
            setShowContraModal(false);
            setEditingVoucher(null);
          }}
        />
      )}

      {showSecurityModal && (
        <SecurityBackupModal
          data={data}
          isHindi={isHindi}
          activeUserRole={effectiveRole}
          permissions={rbac}
          onUpdateSecurityPinAndPass={handleUpdateSecurityPinAndPass}
          onUpdateSecurityPin={(pin, req) => handleUpdateSecurityPinAndPass(pin || '', req)}
          onUpdateData={(newData) => {
            if (!requirePermission(rbac.canUseAdminBackup, 'सुरक्षा डेटा सहेजना', 'update security data')) return;
            setData(newData);
            saveAppData(newData);
          }}
          onRestoreData={handleRestoreData}
          onClose={() => setShowSecurityModal(false)}
        />
      )}

      {showMasterPinModal && (
        <MasterPinPasswordModal
          data={data}
          isHindi={isHindi}
          activeUser={activeUser}
          activeUserRole={effectiveRole}
          permissions={rbac}
          onUpdateSecurityPinAndPass={handleUpdateSecurityPinAndPass}
          onClose={() => setShowMasterPinModal(false)}
        />
      )}

      {(showLicenseModal || trialStatus.clockTampered || trialStatus.machineMismatch || Boolean(trialStatus.vaultTampered) || trialStatus.lockReason === 'LICENSE_REVOKED') && (
        <LicenseActivationModal
          data={data}
          isHindi={isHindi}
          onSaveLicense={handleSaveLicense}
          onClose={() => setShowLicenseModal(false)}
          isForcedLock={trialStatus.clockTampered || trialStatus.machineMismatch || Boolean(trialStatus.vaultTampered) || trialStatus.lockReason === 'LICENSE_REVOKED'}
          isDemoShareMode={isDemoShareMode}
          isCustomerView={isCustomerView}
          isSoftwareOwner={isSoftwareOwner}
          initialKey={urlActivationKey}
          initialOwnerName={urlClientName}
        />
      )}

      {showUserModal && (
        <UserManagementModal
          data={data}
          isHindi={isHindi}
          activeUser={activeUser}
          activeUserRole={effectiveRole}
          permissions={rbac}
          onSwitchUser={handleSwitchUser}
          registeredUsers={registeredUsers}
          onAddUser={handleRegisterUser}
          onRegisterUser={handleRegisterUser}
          onUpdateUserRole={handleUpdateUserRole}
          onLogout={handleLogout}
          onOpenMasterPinModal={() => setShowMasterPinModal(true)}
          isCustomerView={isCustomerView}
          onClose={() => setShowUserModal(false)}
        />
      )}

      {showCompanyModal && (
        <CompanyManagerModal
          data={data}
          isHindi={isHindi}
          activeUserRole={effectiveRole}
          permissions={rbac}
          onSwitchCompany={handleSwitchCompany}
          onCreateNewCompany={handleCreateNewCompany}
          onDeleteCompany={handleDeleteCompany}
          onResetSoleCompany={confirmResetDataNow}
          onShiftFinancialYear={handleShiftFinancialYear}
          onClose={() => setShowCompanyModal(false)}
        />
      )}

      {/* Mobile App Setup & Local Wi-Fi / LAN Multi-PC Modal */}
      <MobileAppModal
        isOpen={showMobileModal}
        onClose={() => setShowMobileModal(false)}
        isHindi={isHindi}
        data={fyData}
        fyLabel={activeFyRange.label}
      />

      {/* Official India GST e-Way Bill Generator Modal */}
      {showEWayBillModal && (
        <EWayBillGeneratorModal
          data={fyData}
          isHindi={isHindi}
          initialInvoiceIds={eWayBillInvoiceIds}
          onClose={() => {
            setShowEWayBillModal(false);
            setEWayBillInvoiceIds([]);
          }}
          onUpdateInvoiceEwbNumber={handleUpdateInvoiceEwbNumber}
        />
      )}

      {/* Software Update Modal */}
      {showSoftwareUpdateModal && (
        <SoftwareUpdateModal
          data={data}
          isHindi={isHindi}
          onClose={() => setShowSoftwareUpdateModal(false)}
          onApplyUpdate={() => {
            const updated = {
              ...data,
              softwareVersion: 'v2.4.2'
            };
            setData(updated);
            saveAppData(updated);
            const msg = isHindi
              ? '🎉 सॉफ़्टवेयर सफलतापूर्वक v2.4.2 में अपडेट हो चुका है! सभी नए फीचर्स सक्रिय हैं।'
              : '🎉 Software updated to v2.4.2 successfully! All latest features are active.';
            setToastMessage(msg);
            setTimeout(() => setToastMessage(null), 4000);
          }}
        />
      )}

      {/* F12 Master ERP Configuration & Features Modal */}
      <ConfigureSettingsModal
        isOpen={showConfigureModal}
        onClose={() => setShowConfigureModal(false)}
        isHindi={isHindi}
        initialSection={configureSection}
        onConfigSaved={(cfg) => setAppConfig(cfg)}
      />

      {/* Keyboard Shortcuts Command Center Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        isHindi={isHindi}
        onClose={() => setShowShortcutsModal(false)}
        onExecuteShortcut={executeAppShortcut}
      />

      {/* Embedded Searchable User Manual & How-To Guide Modal */}
      <UserManualModal
        isOpen={showUserManualModal}
        isHindi={isHindi}
        onClose={() => setShowUserManualModal(false)}
        onNavigateTab={(tab) => navigateToTab(tab as NavTab)}
        onOpenLicenseModal={() => {
          if (!requirePermission(rbac.canManageUsersAndPin, 'लाइसेंस प्रबंधन खोलना', 'open License Activation')) return;
          setShowLicenseModal(true);
        }}
        onOpenShortcutsModal={() => setShowShortcutsModal(true)}
      />

      {/* Multi-System Real-Time Cloud Live Sync Modal */}
      <CloudSyncModal
        isOpen={showCloudSyncModal}
        onClose={() => setShowCloudSyncModal(false)}
        isHindi={isHindi}
        data={data}
        onDataUpdated={(newData) => setData(newData)}
        syncStatus={cloudSyncStatus}
        lastSyncTime={lastSyncTime}
        onVerificationRefreshed={handleRefreshEmailVerification}
      />

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 text-slate-200 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <RotateCcw className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">
                {isHindi ? 'क्या आप सभी डेटा रीसेट करना चाहते हैं?' : 'Confirm Full System Data Reset?'}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isHindi
                ? 'ध्यान दें: यह क्रिया सभी पुराने इनवॉइस, परचेज बिल, वाउचर, पार्टी, स्टॉक आइटम, डेमो डेटा और अतिरिक्त कंपनियाँ साफ़ करके कार्यक्षेत्र को 100% खाली (0 बैलेंस) स्थिति में ला देगी ताकि आप नई कंपनी या XML डेटा इम्पोर्ट कर सकें।'
                : 'Warning: This action will clear all invoices, purchase bills, vouchers, parties, items, demo records, and extra companies, resetting your workspace to a 100% clean empty state ready for fresh setup or ERP XML import.'}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
              >
                {isHindi ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmResetDataNow();
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-extrabold shadow-lg shadow-rose-600/30 transition"
              >
                {isHindi ? 'हाँ, रीसेट करें' : 'Yes, Reset Data Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Quick Action Bottom Navigation Bar (Native App Dock, RBAC Filtered) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 px-2 py-1.5 flex items-center justify-between shadow-2xl safe-area-pb">
        {/* 1. Dashboard */}
        <button
          type="button"
          onClick={() => navigateToTab('dashboard')}
          className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
            activeTab === 'dashboard' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span className="text-[10px]">{isHindi ? 'डैशबोर्ड' : 'Dashboard'}</span>
        </button>

        {/* 2. Sales / Invoices */}
        {canAccessTab(effectiveRole, 'invoices', isCustomerView) && (
          <button
            type="button"
            onClick={() => navigateToTab('invoices')}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer relative ${
              activeTab === 'invoices' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Receipt className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">{isHindi ? 'बिक्री' : 'Sales'}</span>
            {pendingInvoicesCount > 0 && (
              <span className="absolute top-0 right-3 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        )}

        {/* 3. Purchases */}
        {canAccessTab(effectiveRole, 'purchases', isCustomerView) && isNavTabEnabled('purchases', appConfig) && (
          <button
            type="button"
            onClick={() => navigateToTab('purchases')}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer ${
              activeTab === 'purchases' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">{isHindi ? 'खरीद' : 'Purchases'}</span>
          </button>
        )}

        {/* 4. Stock / Inventory */}
        {canAccessTab(effectiveRole, 'items', isCustomerView) && isNavTabEnabled('items', appConfig) && (
          <button
            type="button"
            onClick={() => navigateToTab('items')}
            className={`flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer relative ${
              activeTab === 'items' ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Package className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">{isHindi ? 'स्टॉक' : 'Stock'}</span>
            {lowStockCount > 0 && (
              <span className="absolute top-0 right-3 w-2 h-2 rounded-full bg-amber-400" />
            )}
          </button>
        )}

        {/* 5. All Menus Drawer Trigger */}
        <button
          type="button"
          onClick={() => setIsMobileDrawerOpen(true)}
          className="flex-1 flex flex-col items-center justify-center py-1 rounded-xl transition cursor-pointer text-slate-400 hover:text-slate-200 relative"
        >
          <Menu className="w-5 h-5 mb-0.5 text-indigo-400" />
          <span className="text-[10px] font-semibold text-slate-200">{isHindi ? 'मेनू' : 'Menu'}</span>
          {(unreconciledCount > 0 || lowStockCount > 0) && (
            <span className="absolute top-0 right-3 w-2 h-2 rounded-full bg-rose-500" />
          )}
        </button>
      </nav>
    </div>
  );
}
