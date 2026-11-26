import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  ScanBarcode,
  Search,
  Warehouse,
  UserPlus,
  PackagePlus,
  Plus,
  Minus,
  Trash2,
  PauseCircle,
  PlayCircle,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Camera,
  X,
  Banknote,
  Smartphone,
  CreditCard,
  Split,
  Clock,
  RotateCcw,
  ShoppingCart,
  Keyboard,
  ShieldAlert,
  RefreshCw,
  SwitchCamera,
  ExternalLink,
  ImagePlus,
} from 'lucide-react';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';
import { QRCodeSVG } from 'qrcode.react';
import {
  AppData,
  InvoiceItem,
  ItemBatch,
  ItemMaster,
  PartyMaster,
  SalesInvoice,
  UserRole,
} from '../../types';
import { formatCurrency } from '../../utils/storage';
import { generateNextNumber, getCashLedgers, getBankLedgers } from '../../utils/accounting';
import { getRolePermissions, normalizeUserRole, RolePermissions } from '../../utils/rbac';
import {
  ensureGodowns,
  findItemOrBatchByScan,
  getExpiryStatus,
  getItemStockInGodown,
  getSortedItemBatchesFefo,
  resolvePosGodownId,
} from '../../utils/inventoryBatches';
import { QuickAddPartyModal } from '../Common/QuickAddPartyModal';
import { QuickAddStockItemModal } from '../Common/QuickAddStockItemModal';
import { SearchablePartySelect } from '../Common/SearchablePartySelect';
import { loadAppConfig, saveAppConfig, AppConfiguration } from '../../utils/appConfig';
import { resolveCompanyTaxProfile, getCurrencySymbol } from '../../utils/companyProfile';
import { resolveIsInterStateSupply } from '../../utils/gstAuditEngine';
import {
  PriceTier,
  buildUpiPaymentUri,
  evaluateCartNegativeStock,
  evaluatePartyCreditAndOverdue,
  getItemPriceForTier,
  resolveNegativeStockPolicy,
} from '../../utils/erpSmartHelpers';

interface PosCartLine {
  id: string;
  itemId: string;
  itemName: string;
  hsnSacCode: string;
  unit: string;
  quantity: number;
  rate: number; // Tax-exclusive base rate per unit
  discountPercent: number;
  taxRate: number;
  cessPercent?: number;
  mrp?: number;
  barcode?: string;
  batchId?: string;
  batchNumber?: string;
  expiryDate?: string;
  mfgDate?: string;
  godownId: string;
  godownName: string;
}

interface ParkedPosBill {
  id: string;
  parkedAt: string;
  label: string;
  godownId: string;
  partyId: string;
  lines: PosCartLine[];
  notes: string;
}

type PosPaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'SPLIT' | 'CREDIT';

interface BarcodePOSModuleProps {
  data: AppData;
  isHindi: boolean;
  onCompleteSale: (invoice: SalesInvoice, autoPrint: boolean) => void;
  onAddParty?: (party: PartyMaster) => void;
  onAddItem?: (item: ItemMaster) => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const BarcodePOSModule: React.FC<BarcodePOSModuleProps> = ({
  data,
  isHindi,
  onCompleteSale,
  onAddParty,
  onAddItem,
  activeUserRole,
  permissions,
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const currencySymbol = getCurrencySymbol(currency);
  const taxProfile = resolveCompanyTaxProfile(data.company);
  const forceZeroTax = !taxProfile.shouldChargeGstOnSales;
  const showCess = taxProfile.isRegularGst && taxProfile.cessEnabled;
  const [posAppConfig, setPosAppConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const batchGodownActive = taxProfile.batchGodownEnabled || posAppConfig.maintainBatches;
  const negativeStockPolicy = resolveNegativeStockPolicy(data.company, posAppConfig);
  const accountsOnly = Boolean(posAppConfig.accountingWithoutInventory);
  const todayIso = new Date().toISOString().split('T')[0];

  const godowns = useMemo(() => ensureGodowns(data.godowns).filter((g) => g.isActive), [data.godowns]);
  const [selectedGodownId, setSelectedGodownId] = useState<string>(() => resolvePosGodownId(data.godowns));

  useEffect(() => {
    if (!godowns.some((g) => g.id === selectedGodownId) && godowns[0]) {
      setSelectedGodownId(godowns[0].id);
    }
  }, [godowns, selectedGodownId]);

  const activeGodown = useMemo(
    () => godowns.find((g) => g.id === selectedGodownId) || godowns[0],
    [godowns, selectedGodownId]
  );

  // Customer selection (empty string = Walk-in Cash Customer)
  const [selectedPartyId, setSelectedPartyId] = useState<string>('');
  const customerParties = useMemo(() => (data.parties || []).filter((p) => p.type !== 'VENDOR'), [data.parties]);
  const selectedParty = useMemo(
    () => customerParties.find((p) => p.id === selectedPartyId) || null,
    [customerParties, selectedPartyId]
  );

  // Barcode scan & catalog filter
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [scanInput, setScanInput] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [inclusivePricing, setInclusivePricing] = useState<boolean>(false);
  const [priceTier, setPriceTier] = useState<PriceTier>('RETAIL');

  // Cart & notes
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [notes, setNotes] = useState('');
  const [confirmNegativeStockPos, setConfirmNegativeStockPos] = useState<boolean>(false);
  const [scanBanner, setScanBanner] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

  // Payment settlement state
  const cashLedgers = useMemo(() => getCashLedgers(data), [data]);
  const bankLedgers = useMemo(() => getBankLedgers(data), [data]);
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string>(
    () => cashLedgers[0]?.id || 'acc_cash'
  );
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>(
    () => bankLedgers.find(b => b.id === 'acc_hdfc' || b.id === 'acc_bank')?.id || bankLedgers[0]?.id || 'acc_bank'
  );

  useEffect(() => {
    if (cashLedgers.length > 0 && !cashLedgers.some(a => a.id === selectedCashAccountId)) {
      setSelectedCashAccountId(cashLedgers[0].id);
    }
    if (bankLedgers.length > 0 && !bankLedgers.some(a => a.id === selectedBankAccountId)) {
      setSelectedBankAccountId(bankLedgers.find(b => b.id === 'acc_hdfc' || b.id === 'acc_bank')?.id || bankLedgers[0].id);
    }
  }, [cashLedgers, bankLedgers, selectedCashAccountId, selectedBankAccountId]);

  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('CASH');
  const [tenderedCash, setTenderedCash] = useState<number>(0);
  const [splitCash, setSplitCash] = useState<number>(0);
  const [splitUpi, setSplitUpi] = useState<number>(0);
  const [splitCard, setSplitCard] = useState<number>(0);

  // Modals / Popovers
  const [showQuickParty, setShowQuickParty] = useState(false);
  const [showQuickItem, setShowQuickItem] = useState(false);
  const [pendingScanBarcode, setPendingScanBarcode] = useState('');
  const [unmatchedCode, setUnmatchedCode] = useState('');
  const [autoPromptNewBarcode, setAutoPromptNewBarcode] = useState<boolean>(() => loadAppConfig().posAutoPromptNewBarcode);
  const [showParkedDrawer, setShowParkedDrawer] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameraErrorKind, setCameraErrorKind] = useState<'PERMISSION_DENIED' | 'NO_HARDWARE' | 'UNSUPPORTED' | 'OTHER' | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraRetryKey, setCameraRetryKey] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [photoScanBusy, setPhotoScanBusy] = useState(false);
  const photoScanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const syncConfig = () => {
      const nextCfg = loadAppConfig();
      setPosAppConfig(nextCfg);
      setAutoPromptNewBarcode(nextCfg.posAutoPromptNewBarcode);
    };
    window.addEventListener('sna_config_updated', syncConfig);
    return () => window.removeEventListener('sna_config_updated', syncConfig);
  }, []);

  const parkedStorageKey = `hv_pos_parked_${data.company.id || 'default'}`;
  const [parkedBills, setParkedBills] = useState<ParkedPosBill[]>(() => {
    try {
      const raw = localStorage.getItem(`hv_pos_parked_${data.company.id || 'default'}`);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(parkedStorageKey, JSON.stringify(parkedBills));
    } catch {
      // ignore storage quota errors
    }
  }, [parkedBills, parkedStorageKey]);

  const showBanner = useCallback((type: 'ok' | 'warn' | 'err', text: string) => {
    setScanBanner({ type, text });
    setTimeout(() => {
      setScanBanner((prev) => (prev?.text === text ? null : prev));
    }, 3800);
  }, []);

  const focusScanInput = useCallback(() => {
    setTimeout(() => {
      scanInputRef.current?.focus();
    }, 20);
  }, []);

  useEffect(() => {
    focusScanInput();
  }, [focusScanInput]);

  // Distinct item categories
  const categories = useMemo(() => {
    const s = new Set<string>();
    (data.items || []).forEach((it) => {
      if (it.category) s.add(it.category);
    });
    return ['ALL', ...Array.from(s).sort()];
  }, [data.items]);

  // Precompute FEFO earliest non-expired batch per item in active godown
  const fefoByItemId = useMemo(() => {
    const map = new Map<string, ItemBatch[]>();
    for (const it of data.items || []) {
      const list = getSortedItemBatchesFefo(data.itemBatches || [], it.id, activeGodown?.id, {
        includeExpired: false,
        includeDepleted: false,
        referenceDate: todayIso,
      });
      if (list.length > 0) map.set(it.id, list);
    }
    return map;
  }, [data.items, data.itemBatches, activeGodown?.id, todayIso]);

  // Filtered quick catalog items
  const catalogItems = useMemo(() => {
    const q = (catalogSearch || scanInput).trim().toLowerCase();
    return (data.items || []).filter((it) => {
      const catOk = selectedCategory === 'ALL' || it.category === selectedCategory;
      if (!catOk) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.code || '').toLowerCase().includes(q) ||
        (it.barcode || '').toLowerCase().includes(q) ||
        (it.hsnSacCode || '').toLowerCase().includes(q)
      );
    });
  }, [data.items, selectedCategory, catalogSearch, scanInput]);

  const computeCartRate = useCallback(
    (item: ItemMaster, tier: PriceTier, batch?: ItemBatch): number => {
      const taxRate = forceZeroTax ? 0 : Number(item.taxRate ?? item.gstRate ?? 18);
      const rawRate = getItemPriceForTier(item, tier, batch);
      return !forceZeroTax && inclusivePricing && taxRate > 0
        ? Math.round((rawRate / (1 + taxRate / 100)) * 100) / 100
        : rawRate;
    },
    [forceZeroTax, inclusivePricing]
  );

  const handlePriceTierChange = useCallback(
    (nextTier: PriceTier) => {
      setPriceTier(nextTier);
      setCart((prev) =>
        prev.map((line) => {
          const master = (data.items || []).find((i) => i.id === line.itemId);
          if (!master) return line;
          const batch = line.batchId
            ? (data.itemBatches || []).find((b) => b.id === line.batchId)
            : (fefoByItemId.get(master.id) || [])[0];
          return {
            ...line,
            rate: computeCartRate(master, nextTier, batch),
          };
        })
      );
    },
    [computeCartRate, data.itemBatches, data.items, fefoByItemId]
  );

  // Add item (with optional specific batch) to POS cart
  const addItemToCart = useCallback(
    (item: ItemMaster, explicitBatch?: ItemBatch) => {
      if (!perms.canCreateEditTransactions) {
        showBanner('err', isHindi ? 'बिलिंग की अनुमति नहीं है।' : 'Role lacks billing permission.');
        return;
      }

      const godownId = activeGodown?.id || 'gdw_main';
      const godownName = activeGodown?.name || 'Main Godown';
      const itemBatchesInGodown = fefoByItemId.get(item.id) || [];
      const chosenBatch = explicitBatch || itemBatchesInGodown[0];

      // Block scanning a strictly expired batch
      if (chosenBatch) {
        const exp = getExpiryStatus(chosenBatch.expiryDate, todayIso);
        if (exp.bucket === 'EXPIRED') {
          showBanner(
            'err',
            isHindi
              ? `बैच ${chosenBatch.batchNumber} (${item.name}) EXPIRED हो चुका है (${chosenBatch.expiryDate})! इसे बेचा नहीं जा सकता।`
              : `Blocked: Batch ${chosenBatch.batchNumber} (${item.name}) EXPIRED on ${chosenBatch.expiryDate}!`
          );
          return;
        }
      }

      const unitLower = (item.unit || '').toLowerCase();
      const isServiceItem = unitLower.includes('service') || unitLower.includes('hr') || unitLower.includes('month');
      const availableInGodown = getItemStockInGodown(item, godownId, godowns);
      const currentInCartQty = cart
        .filter((l) => l.itemId === item.id)
        .reduce((s, l) => s + (Number(l.quantity) || 0), 0);

      if (!accountsOnly && !isServiceItem && negativeStockPolicy === 'BLOCK' && currentInCartQty + 1 > availableInGodown + 0.0005) {
        showBanner(
          'err',
          isHindi
            ? `स्टॉक अवरुद्ध (Blocked): "${item.name}" का ${godownName} में केवल ${availableInGodown} ${item.unit || 'PCS'} उपलब्ध है।`
            : `Stock Blocked: "${item.name}" only has ${availableInGodown} ${item.unit || 'PCS'} available in ${godownName}.`
        );
        return;
      }

      const taxRate = forceZeroTax ? 0 : Number(item.taxRate ?? item.gstRate ?? 18);
      const cessPercent = showCess ? Number(item.cessRate || 0) : 0;
      const baseRate = computeCartRate(item, priceTier, chosenBatch);

      setConfirmNegativeStockPos(false);
      setCart((prev) => {
        const matchIdx = prev.findIndex(
          (l) => l.itemId === item.id && (l.batchId || '') === (chosenBatch?.id || '')
        );
        if (matchIdx >= 0) {
          const existing = prev[matchIdx];
          const nextQty = existing.quantity + 1;
          if (chosenBatch && nextQty > chosenBatch.availableQty) {
            showBanner(
              'warn',
              isHindi
                ? `बैच ${chosenBatch.batchNumber} में केवल ${chosenBatch.availableQty} ${item.unit} उपलब्ध है।`
                : `Batch ${chosenBatch.batchNumber} max available: ${chosenBatch.availableQty} ${item.unit}`
            );
          }
          const copy = [...prev];
          copy[matchIdx] = { ...existing, quantity: nextQty };
          return copy;
        }

        const newLine: PosCartLine = {
          id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          itemId: item.id,
          itemName: item.name,
          hsnSacCode: item.hsnSacCode || '8471',
          unit: item.unit || 'PCS',
          quantity: 1,
          rate: baseRate,
          discountPercent: 0,
          taxRate,
          cessPercent,
          mrp: chosenBatch?.mrp ?? item.mrp,
          barcode: chosenBatch?.barcode || item.barcode,
          batchId: chosenBatch?.id,
          batchNumber: chosenBatch?.batchNumber,
          expiryDate: chosenBatch?.expiryDate,
          mfgDate: chosenBatch?.mfgDate,
          godownId,
          godownName,
        };
        return [...prev, newLine];
      });

      const expInfo = chosenBatch ? getExpiryStatus(chosenBatch.expiryDate, todayIso) : null;
      if (expInfo && expInfo.bucket === 'EXPIRING_SOON') {
        showBanner(
          'warn',
          `${item.name} • Batch ${chosenBatch?.batchNumber} (${expInfo.labelEn})`
        );
      } else if (!accountsOnly && !isServiceItem && negativeStockPolicy === 'WARN' && currentInCartQty + 1 > availableInGodown + 0.0005) {
        showBanner(
          'warn',
          isHindi
            ? `कम स्टॉक चेतावनी: "${item.name}" केवल ${availableInGodown} ${item.unit || 'PCS'} उपलब्ध (मांग: ${currentInCartQty + 1})`
            : `Low Stock Warning: "${item.name}" has ${availableInGodown} ${item.unit || 'PCS'} in stock (cart: ${currentInCartQty + 1})`
        );
      } else {
        showBanner(
          'ok',
          `${isHindi ? 'जोड़ा गया:' : 'Added:'} ${item.name}${chosenBatch ? ` [${chosenBatch.batchNumber}]` : ''}`
        );
      }
    },
    [accountsOnly, activeGodown, cart, computeCartRate, fefoByItemId, forceZeroTax, godowns, isHindi, negativeStockPolicy, perms.canCreateEditTransactions, priceTier, showBanner, showCess, todayIso]
  );

  const openQuickAddForBarcode = useCallback(
    (code: string, forceOpen = false) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setUnmatchedCode(trimmed);
      if (perms.canCreateEditMasters && onAddItem && (forceOpen || autoPromptNewBarcode)) {
        setPendingScanBarcode(trimmed);
        setShowQuickItem(true);
        showBanner(
          'warn',
          isHindi
            ? `नया बारकोड "${trimmed}" स्कैन हुआ! नाम, HSN कोड, विवरण व स्टॉक भरें ताकि तुरंत बिल में जुड़ सके।`
            : `New barcode "${trimmed}" scanned! Enter Item Name, HSN Code, Description & Stock Qty to bill.`
        );
      } else {
        showBanner(
          'warn',
          isHindi
            ? `"${trimmed}" से कोई बारकोड नहीं मिला — सूची से चुनें या "+ Add Item & Stock" दबाएं।`
            : `No exact barcode match for "${trimmed}" — pick from catalog or click "+ Add Item & Stock".`
        );
      }
    },
    [autoPromptNewBarcode, isHindi, onAddItem, perms.canCreateEditMasters, showBanner]
  );

  // Handle Barcode / SKU Scan Submit (Enter key)
  const handleScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = scanInput.trim();
    if (!query) return;

    const match = findItemOrBatchByScan(
      query,
      data.items || [],
      data.itemBatches || [],
      activeGodown?.id,
      todayIso
    );

    if (match) {
      setUnmatchedCode('');
      addItemToCart(match.item, match.batch);
      setScanInput('');
      setCatalogSearch('');
      focusScanInput();
      return;
    }

    // Fallback: if filtered catalog has exact 1 item, add it cleanly
    const qLower = query.toLowerCase();
    const partialMatches = (data.items || []).filter(
      (it) =>
        it.name.toLowerCase().includes(qLower) ||
        (it.code || '').toLowerCase().includes(qLower) ||
        (it.barcode || '').toLowerCase().includes(qLower)
    );
    if (partialMatches.length === 1) {
      setUnmatchedCode('');
      addItemToCart(partialMatches[0]);
      setScanInput('');
      setCatalogSearch('');
      focusScanInput();
      return;
    }

    openQuickAddForBarcode(query);
  };

  // Cart Calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalCess = 0;
    let totalQty = 0;

    for (const line of cart) {
      const gross = (Number(line.quantity) || 0) * (Number(line.rate) || 0);
      const disc = (gross * (Number(line.discountPercent) || 0)) / 100;
      const taxable = gross - disc;
      const effTaxRate = forceZeroTax ? 0 : (Number(line.taxRate) || 0);
      const effCessRate = showCess ? (Number(line.cessPercent) || 0) : 0;
      const tax = (taxable * effTaxRate) / 100;
      const cess = (taxable * effCessRate) / 100;
      subtotal += gross;
      totalDiscount += disc;
      totalTax += tax;
      totalCess += cess;
      totalQty += Number(line.quantity) || 0;
    }

    const isInterState = selectedParty
      ? resolveIsInterStateSupply({
          companyGstin: data.company.gstin,
          companyState: data.company.state,
          companyStateCode: data.company.stateCode,
          partyGstin: selectedParty.gstin,
          partyState: selectedParty.state,
          partyStateCode: selectedParty.stateCode,
        })
      : false;

    const cgstAmount = forceZeroTax || isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
    const sgstAmount = forceZeroTax || isInterState ? 0 : Math.round((totalTax / 2) * 100) / 100;
    const igstAmount = forceZeroTax || !isInterState ? 0 : Math.round(totalTax * 100) / 100;
    const cessAmount = showCess ? Math.round(totalCess * 100) / 100 : 0;

    const exactTotal = subtotal - totalDiscount + (forceZeroTax ? 0 : totalTax) + cessAmount;
    const grandTotal = Math.round(exactTotal);
    const roundOff = Math.round((grandTotal - exactTotal) * 100) / 100;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      cgstAmount,
      sgstAmount,
      igstAmount,
      cessAmount,
      totalTax: forceZeroTax ? 0 : Math.round(totalTax * 100) / 100,
      roundOff,
      grandTotal,
      totalQty,
      isInterState,
    };
  }, [cart, data.company.gstin, data.company.state, data.company.stateCode, forceZeroTax, selectedParty, showCess]);

  // Keep tendered cash / split defaults responsive when cart changes
  const changeDue = useMemo(() => {
    if (paymentMethod !== 'CASH') return 0;
    return Math.max(0, Math.round((tenderedCash - totals.grandTotal) * 100) / 100);
  }, [paymentMethod, tenderedCash, totals.grandTotal]);

  const effectiveAmountPaid = useMemo(() => {
    if (paymentMethod === 'CREDIT') return 0;
    if (paymentMethod === 'UPI' || paymentMethod === 'CARD') return totals.grandTotal;
    if (paymentMethod === 'SPLIT') {
      return Math.min(totals.grandTotal, Math.round((splitCash + splitUpi + splitCard) * 100) / 100);
    }
    // CASH
    if (tenderedCash <= 0) return totals.grandTotal;
    return Math.min(totals.grandTotal, tenderedCash);
  }, [paymentMethod, splitCard, splitCash, splitUpi, tenderedCash, totals.grandTotal]);

  const negativeStockViolations = useMemo(() => {
    if (accountsOnly) return [];
    return evaluateCartNegativeStock(cart, data.items || [], godowns, activeGodown?.id || 'gdw_main');
  }, [accountsOnly, activeGodown?.id, cart, data.items, godowns]);

  const posPartyCreditEval = useMemo(() => {
    if (!selectedParty) return null;
    return evaluatePartyCreditAndOverdue(
      selectedParty,
      data,
      todayIso,
      Math.max(0, totals.grandTotal - effectiveAmountPaid),
      undefined,
      posAppConfig.showCreditLimitWarning ? posAppConfig.creditLimitAmount : 0
    );
  }, [data, effectiveAmountPaid, posAppConfig.creditLimitAmount, posAppConfig.showCreditLimitWarning, selectedParty, todayIso, totals.grandTotal]);

  // Hold / Park Current Bill
  const handleParkBill = useCallback(() => {
    if (cart.length === 0) return;
    const label = selectedParty?.name || `Counter Walk-In (${cart.length} items)`;
    const parked: ParkedPosBill = {
      id: `park_${Date.now()}`,
      parkedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      label,
      godownId: activeGodown?.id || 'gdw_main',
      partyId: selectedPartyId,
      lines: cart,
      notes,
    };
    setParkedBills((prev) => [parked, ...prev].slice(0, 20));
    setCart([]);
    setTenderedCash(0);
    setNotes('');
    showBanner('ok', isHindi ? 'बिल होल्ड (Park) कर दिया गया।' : `Bill parked (${label}).`);
    focusScanInput();
  }, [activeGodown?.id, cart, focusScanInput, isHindi, notes, selectedParty?.name, selectedPartyId, showBanner]);

  const handleRecallBill = (bill: ParkedPosBill) => {
    if (cart.length > 0) {
      handleParkBill();
    }
    setSelectedGodownId(bill.godownId);
    setSelectedPartyId(bill.partyId);
    setCart(bill.lines);
    setNotes(bill.notes);
    setParkedBills((prev) => prev.filter((p) => p.id !== bill.id));
    setShowParkedDrawer(false);
    focusScanInput();
  };

  // Complete Checkout
  const handleCheckout = useCallback(
    (autoPrint: boolean) => {
      if (!perms.canCreateEditTransactions) {
        showBanner('err', isHindi ? 'इनवॉइस बनाने की अनुमति नहीं है।' : 'No billing permission.');
        return;
      }
      if (cart.length === 0) {
        showBanner('warn', isHindi ? 'कार्ट खाली है — पहले आइटम स्कैन करें।' : 'Cart is empty — scan an item first.');
        focusScanInput();
        return;
      }

      // Guard against expired batches in cart
      for (const line of cart) {
        if (line.expiryDate && getExpiryStatus(line.expiryDate, todayIso).bucket === 'EXPIRED') {
          showBanner(
            'err',
            isHindi
              ? `एक्सपायर बैच (${line.batchNumber}) हटाएं: ${line.itemName}`
              : `Remove expired batch (${line.batchNumber}) for ${line.itemName} before billing.`
          );
          return;
        }
      }

      if (negativeStockPolicy === 'BLOCK' && negativeStockViolations.length > 0) {
        const v = negativeStockViolations[0];
        showBanner(
          'err',
          isHindi
            ? `स्टॉक अवरुद्ध (Blocked): "${v.name}" का केवल ${v.available} ${v.unit} उपलब्ध है (मांग: ${v.reqQty})।`
            : `Stock Blocked: "${v.name}" only has ${v.available} ${v.unit} available (requested ${v.reqQty}).`
        );
        return;
      }

      if (negativeStockPolicy === 'WARN' && negativeStockViolations.length > 0 && !confirmNegativeStockPos) {
        const v = negativeStockViolations[0];
        showBanner(
          'warn',
          isHindi
            ? `कम स्टॉक चेतावनी: "${v.name}" (${v.available}/${v.reqQty}) — चेकआउट के नीचे पुष्टि बॉक्स चुनें।`
            : `Low Stock Warning: "${v.name}" (${v.available}/${v.reqQty}) — check confirmation box above checkout.`
        );
        return;
      }

      const invoiceItems: InvoiceItem[] = cart.map((line) => {
        const gross = line.quantity * line.rate;
        const discAmt = (gross * line.discountPercent) / 100;
        const taxable = gross - discAmt;
        const effTaxRate = forceZeroTax ? 0 : line.taxRate;
        const effCessRate = showCess ? (Number(line.cessPercent) || 0) : 0;
        const taxAmt = (taxable * effTaxRate) / 100;
        const cessAmt = (taxable * effCessRate) / 100;
        return {
          id: line.id,
          itemId: line.itemId,
          itemName: line.itemName,
          hsnSacCode: line.hsnSacCode,
          quantity: line.quantity,
          unit: line.unit,
          rate: Math.round(line.rate * 100) / 100,
          discountPercent: line.discountPercent,
          taxRate: effTaxRate,
          taxAmount: Math.round(taxAmt * 100) / 100,
          cessPercent: effCessRate > 0 ? effCessRate : undefined,
          cessAmount: cessAmt > 0 ? Math.round(cessAmt * 100) / 100 : undefined,
          totalAmount: Math.round((taxable + taxAmt + cessAmt) * 100) / 100,
          barcode: line.barcode,
          batchId: line.batchId,
          batchNumber: line.batchNumber,
          expiryDate: line.expiryDate,
          mfgDate: line.mfgDate,
          mrp: line.mrp,
          godownId: activeGodown?.id,
          godownName: activeGodown?.name,
        };
      });

      const paid = effectiveAmountPaid;
      const status =
        paid >= totals.grandTotal - 0.01
          ? 'PAID'
          : paid > 0
          ? 'PARTIAL'
          : 'UNPAID';

      const breakdown =
        paymentMethod === 'CASH'
          ? { cash: paid, upi: 0, card: 0, credit: Math.max(0, totals.grandTotal - paid) }
          : paymentMethod === 'UPI'
          ? { cash: 0, upi: paid, card: 0, credit: 0 }
          : paymentMethod === 'CARD'
          ? { cash: 0, upi: 0, card: paid, credit: 0 }
          : paymentMethod === 'SPLIT'
          ? {
              cash: splitCash,
              upi: splitUpi,
              card: splitCard,
              credit: Math.max(0, totals.grandTotal - paid),
            }
          : { cash: 0, upi: 0, card: 0, credit: totals.grandTotal };

      const posInvoiceNo = generateNextNumber('POS', data.invoices || []);
      const partyName = selectedParty?.name || 'Walk-in Counter Customer';
      const partyState = selectedParty?.state || data.company.state || '';

      const resolvedPaymentAccountId =
        paymentMethod === 'CASH'
          ? (selectedCashAccountId || cashLedgers[0]?.id || 'acc_cash')
          : paymentMethod === 'UPI' || paymentMethod === 'CARD' || paymentMethod === 'SPLIT'
          ? (selectedBankAccountId || bankLedgers[0]?.id || 'acc_bank')
          : undefined;

      const newInvoice: SalesInvoice = {
        id: `inv_pos_${Date.now()}`,
        invoiceNumber: posInvoiceNo,
        date: todayIso,
        dueDate: todayIso,
        invoiceType: forceZeroTax ? 'RETAIL_BILL' : (selectedParty?.gstin ? 'TAX_INVOICE' : 'RETAIL_BILL'),
        partyId: selectedParty?.id || 'pty_walkin_cash',
        partyName,
        partyGstin: selectedParty?.gstin || '',
        partyGstCategory: selectedParty?.gstCategory || 'UNREGISTERED',
        partyAddress: selectedParty?.address || activeGodown?.address || 'Counter Sale',
        partyState,
        placeOfSupply: partyState,
        isInterState: forceZeroTax ? false : totals.isInterState,
        items: invoiceItems,
        subtotal: totals.subtotal,
        totalDiscount: totals.totalDiscount,
        cgstAmount: totals.cgstAmount,
        sgstAmount: totals.sgstAmount,
        igstAmount: totals.igstAmount,
        cessAmount: totals.cessAmount,
        registrationTypeAtSupply: taxProfile.gstRegistrationType,
        totalTax: totals.totalTax,
        roundOff: totals.roundOff,
        grandTotal: totals.grandTotal,
        amountPaid: paid,
        showAdvanceOnInvoice: status === 'PARTIAL',
        status,
        paymentMode: paymentMethod,
        paymentAccountId: resolvedPaymentAccountId,
        notes: notes.trim() || `Counter POS Sale • ${activeGodown?.name || 'Main Counter'}`,
        godownId: activeGodown?.id,
        godownName: activeGodown?.name,
        isPosSale: true,
        posCounterName: activeGodown?.name,
        tenderedAmount: paymentMethod === 'CASH' ? (tenderedCash > 0 ? tenderedCash : totals.grandTotal) : paid,
        changeAmount: paymentMethod === 'CASH' ? changeDue : 0,
        paymentBreakdown: breakdown,
      };

      onCompleteSale(newInvoice, autoPrint);

      // Reset cart cleanly for the next customer
      setCart([]);
      setConfirmNegativeStockPos(false);
      setTenderedCash(0);
      setSplitCash(0);
      setSplitUpi(0);
      setSplitCard(0);
      setNotes('');
      showBanner(
        'ok',
        isHindi
          ? `✅ बिल ${posInvoiceNo} (${formatCurrency(totals.grandTotal, currency)}) सफलतापूर्वक सहेजा गया!`
          : `✅ POS Bill ${posInvoiceNo} (${formatCurrency(totals.grandTotal, currency)}) completed!`
      );
      focusScanInput();
    },
    [
      activeGodown?.address,
      activeGodown?.id,
      activeGodown?.name,
      bankLedgers,
      cart,
      cashLedgers,
      changeDue,
      confirmNegativeStockPos,
      currency,
      data.company.state,
      data.invoices,
      effectiveAmountPaid,
      focusScanInput,
      forceZeroTax,
      isHindi,
      negativeStockPolicy,
      negativeStockViolations,
      notes,
      onCompleteSale,
      paymentMethod,
      perms.canCreateEditTransactions,
      selectedBankAccountId,
      selectedCashAccountId,
      selectedParty,
      showBanner,
      showCess,
      splitCard,
      splitCash,
      splitUpi,
      taxProfile.gstRegistrationType,
      tenderedCash,
      todayIso,
      totals,
    ]
  );

  // Global POS Keyboard Shortcuts (F2 Focus Scan, F4 Park Bill, F8 Exact Cash, F9 Checkout & Print)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        scanInputRef.current?.focus();
        scanInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleParkBill();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setPaymentMethod('CASH');
        setTenderedCash(totals.grandTotal);
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleCheckout(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleCheckout, handleParkBill, totals.grandTotal]);

  const handleDecodedBarcode = useCallback(
    (rawCode: string) => {
      const rawVal = String(rawCode || '').trim();
      if (!rawVal) return;
      const match = findItemOrBatchByScan(
        rawVal,
        data.items || [],
        data.itemBatches || [],
        activeGodown?.id,
        todayIso
      );
      if (match) {
        setUnmatchedCode('');
        addItemToCart(match.item, match.batch);
        setShowCameraModal(false);
        focusScanInput();
      } else {
        setScanInput(rawVal);
        setShowCameraModal(false);
        openQuickAddForBarcode(rawVal);
      }
    },
    [activeGodown?.id, addItemToCart, data.itemBatches, data.items, focusScanInput, openQuickAddForBarcode, todayIso]
  );

  const handleDecodedBarcodeRef = useRef(handleDecodedBarcode);
  useEffect(() => {
    handleDecodedBarcodeRef.current = handleDecodedBarcode;
  }, [handleDecodedBarcode]);

  // Photo / File Barcode Scanner (works even if live iframe/browser camera permission is denied)
  const handleBarcodeImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      setPhotoScanBusy(true);
      setCameraError(null);
      setCameraErrorKind(null);
      const objectUrl = URL.createObjectURL(file);
      try {
        let decodedText = '';
        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        if (BarcodeDetectorCtor && typeof createImageBitmap === 'function') {
          try {
            const bitmap = await createImageBitmap(file);
            try {
              const detector = new BarcodeDetectorCtor({
                formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'],
              });
              const detected = await detector.detect(bitmap);
              if (detected && detected.length > 0 && detected[0].rawValue) {
                decodedText = String(detected[0].rawValue).trim();
              }
            } finally {
              bitmap.close?.();
            }
          } catch {
            // Fall through to ZXing
          }
        }

        if (!decodedText) {
          const reader = new BrowserMultiFormatReader();
          const result = await reader.decodeFromImageUrl(objectUrl);
          decodedText = result?.getText()?.trim() || '';
        }

        if (decodedText) {
          handleDecodedBarcodeRef.current(decodedText);
        } else {
          setCameraError(
            isHindi
              ? 'फोटो में बारकोड स्पष्ट नहीं दिखा। कृपया साफ़ रोशनी में बारकोड के करीब से फोटो लें।'
              : 'No barcode detected in this photo. Please capture a clearer, well-lit close-up of the barcode.'
          );
        }
      } catch {
        setCameraError(
          isHindi
            ? 'फोटो से बारकोड पढ़ा नहीं जा सका। कृपया साफ़ बारकोड फोटो चुनें या नीचे कोड टाइप करें।'
            : 'Could not read barcode from photo. Try a sharper close-up or type the barcode manually below.'
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
        setPhotoScanBusy(false);
      }
    },
    [isHindi]
  );

  // Camera Barcode Scanner Logic (Native BarcodeDetector + @zxing/browser universal fallback)
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!showCameraModal) {
      setCameraActive(false);
      return;
    }
    let stream: MediaStream | null = null;
    let zxingControls: IScannerControls | null = null;
    let rafId = 0;
    let cancelled = false;
    let handledDetection = false;

    const startCamera = async () => {
      setCameraError(null);
      setCameraErrorKind(null);
      setCameraActive(false);

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setCameraErrorKind('UNSUPPORTED');
          setCameraError(
            isHindi
              ? 'इस ब्राउज़र या HTTP/Iframe मोड में लाइव कैमरा उपलब्ध नहीं है। नीचे "फोटो से स्कैन करें" या "नए टैब में खोलें" का उपयोग करें।'
              : 'Live camera API is unavailable in this browser or context. Use "Scan from Camera Photo" or "Open in New Tab" below.'
          );
          return;
        }

        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: cameraFacing } },
            audio: false,
          });
        } catch (primaryErr: any) {
          const name = primaryErr?.name || '';
          if (
            name === 'OverconstrainedError' ||
            name === 'ConstraintNotSatisfiedError' ||
            name === 'NotFoundError'
          ) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          } else {
            throw primaryErr;
          }
        }

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);

        const onFound = (rawVal: string) => {
          if (cancelled || handledDetection) return;
          const clean = String(rawVal || '').trim();
          if (!clean) return;
          handledDetection = true;
          handleDecodedBarcodeRef.current(clean);
        };

        const BarcodeDetectorCtor = (window as any).BarcodeDetector;
        if (BarcodeDetectorCtor) {
          const detector = new BarcodeDetectorCtor({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'],
          });

          const scanLoop = async () => {
            if (cancelled || handledDetection || !videoRef.current) return;
            try {
              if (videoRef.current.readyState >= 2) {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                  onFound(barcodes[0].rawValue);
                  return;
                }
              }
            } catch {
              // ignore single-frame decode error
            }
            rafId = requestAnimationFrame(scanLoop);
          };
          rafId = requestAnimationFrame(scanLoop);
        } else if (videoRef.current) {
          // Universal pure-JS @zxing/browser live video decoder (Safari, Firefox, iOS, older Chromium)
          const reader = new BrowserMultiFormatReader();
          zxingControls = await reader.decodeFromStream(stream, videoRef.current, (result) => {
            if (result && result.getText()) {
              onFound(result.getText());
            }
          });
        }
      } catch (err: any) {
        if (cancelled) return;
        const errName = String(err?.name || '');
        const errMsg = String(err?.message || '');
        const isPermDenied =
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errName === 'SecurityError' ||
          /permission denied|not allowed|denied by system|permissions policy/i.test(errMsg);
        const isNoDevice =
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError' ||
          /requested device not found|no camera/i.test(errMsg);

        if (isPermDenied) {
          setCameraErrorKind('PERMISSION_DENIED');
          setCameraError(
            isHindi
              ? 'ब्राउज़र ने कैमरा अनुमति (Permission Denied) रोक दी है।'
              : 'Camera permission was blocked by the browser or preview frame.'
          );
        } else if (isNoDevice) {
          setCameraErrorKind('NO_HARDWARE');
          setCameraError(
            isHindi
              ? 'इस डिवाइस पर कोई कैमरा जुड़ा नहीं मिला। फोटो अपलोड या USB बारकोड स्कैनर उपयोग करें।'
              : 'No camera hardware detected on this device. Use photo upload or a USB barcode scanner.'
          );
        } else {
          setCameraErrorKind('OTHER');
          setCameraError(
            errMsg ||
              (isHindi
                ? 'कैमरा चालू करने में समस्या आई। कृपया Retry करें या फोटो से स्कैन करें।'
                : 'Unable to start camera. Please retry or use photo barcode scan.')
          );
        }
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      setCameraActive(false);
      cancelAnimationFrame(rafId);
      try {
        zxingControls?.stop();
      } catch {
        // ignore stop errors
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [cameraFacing, cameraRetryKey, isHindi, showCameraModal]);

  const upiId = data.company.upiId || 'hisabveda@upi';
  const upiUri = buildUpiPaymentUri({
    upiId,
    payeeName: data.company.name || 'Store',
    amount: totals.grandTotal,
  });

  return (
    <div className="p-3 sm:p-4 lg:p-5 max-w-[1600px] mx-auto space-y-3 font-sans">
      {/* Top Counter Terminal Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <ScanBarcode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>{isHindi ? 'हाई-स्पीड बारकोड POS टर्मिनल' : 'High-Speed Barcode POS Terminal'}</span>
            </h2>
            <p className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2">
              <span className="inline-flex items-center gap-1 font-mono text-cyan-400">
                <Keyboard className="w-3 h-3" /> F2 Scan • F4 Hold • F8 Exact Cash • F9 Checkout & Print
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Active Godown / Counter */}
          {(batchGodownActive || godowns.length > 1) && (
            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 min-h-[40px]">
              <Warehouse className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {isHindi ? 'सक्रिय गोदाम / काउंटर' : 'Active Counter / Godown'}
                </span>
                <select
                  value={activeGodown?.id || ''}
                  onChange={(e) => setSelectedGodownId(e.target.value)}
                  className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer"
                >
                  {godowns.map((g) => (
                    <option key={g.id} value={g.id} className="bg-slate-900 text-white">
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Multi-Price Tier Switcher */}
          <div className="inline-flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 min-h-[40px] text-xs font-bold">
            {(
              [
                { id: 'RETAIL', label: isHindi ? 'रिटेल' : 'Retail' },
                { id: 'WHOLESALE', label: isHindi ? 'होलसेल' : 'Wholesale' },
                { id: 'MRP', label: 'MRP' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handlePriceTierChange(t.id)}
                className={`px-2.5 py-1.5 rounded-lg transition cursor-pointer ${
                  priceTier === t.id
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Inclusive Rate Toggle (only when GST billing is active) */}
          {!forceZeroTax && (
            <button
              type="button"
              onClick={() => setInclusivePricing((v) => !v)}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition min-h-[40px] ${
                inclusivePricing
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title={
                isHindi
                  ? 'चालू होने पर आइटम का बिक्री मूल्य/MRP GST सहित मानकर कर अलग किया जाएगा'
                  : 'When active, item Sales Rate is treated as GST-inclusive'
              }
            >
              {inclusivePricing
                ? isHindi
                  ? 'दर: GST सहित (MRP)'
                  : 'Rate: Tax-Inclusive'
                : isHindi
                ? 'दर: +GST अतिरिक्त'
                : 'Rate: Tax-Exclusive'}
            </button>
          )}

          {/* Unknown Barcode Auto-Popup Toggle */}
          {perms.canCreateEditMasters && onAddItem && (
            <button
              type="button"
              onClick={() => {
                const next = !autoPromptNewBarcode;
                setAutoPromptNewBarcode(next);
                saveAppConfig({ ...loadAppConfig(), posAutoPromptNewBarcode: next });
              }}
              className={`px-3 py-2 rounded-xl border text-xs font-bold transition min-h-[40px] flex items-center gap-1.5 ${
                autoPromptNewBarcode
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title={
                isHindi
                  ? 'अज्ञात बारकोड स्कैन होते ही नया आइटम व स्टॉक जोड़ने वाला फॉर्म स्वतः खोलें'
                  : 'Auto-open Quick Add Item & Stock modal when scanning an unknown barcode'
              }
            >
              <PackagePlus className="w-3.5 h-3.5 shrink-0" />
              <span>
                {isHindi
                  ? `नया स्कैन ऑटो-पॉपअप: ${autoPromptNewBarcode ? 'ON' : 'OFF'}`
                  : `New Scan Auto-Add: ${autoPromptNewBarcode ? 'ON' : 'OFF'}`}
              </span>
            </button>
          )}

          {/* Parked / Held Bills Button */}
          <button
            type="button"
            onClick={() => setShowParkedDrawer((v) => !v)}
            className="flex items-center gap-1.5 bg-slate-950 hover:bg-slate-800 border border-slate-700 text-amber-300 font-bold px-3.5 py-2 rounded-xl text-xs transition min-h-[40px]"
          >
            <Clock className="w-4 h-4" />
            <span>{isHindi ? 'होल्ड बिल' : 'Held Bills'}</span>
            {parkedBills.length > 0 && (
              <span className="bg-amber-500 text-slate-950 font-mono font-black px-1.5 py-0.2 rounded-md text-[10px]">
                {parkedBills.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {scanBanner && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-bold flex flex-wrap items-center justify-between gap-2 animate-fadeIn ${
            scanBanner.type === 'ok'
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : scanBanner.type === 'warn'
              ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
              : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {scanBanner.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : scanBanner.type === 'warn' ? (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 shrink-0" />
            )}
            <span>{scanBanner.text}</span>
          </div>
          <div className="flex items-center gap-2">
            {scanBanner.type === 'warn' && unmatchedCode && perms.canCreateEditMasters && onAddItem && (
              <button
                type="button"
                onClick={() => openQuickAddForBarcode(unmatchedCode, true)}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold px-2.5 py-1 rounded-lg text-[11px] flex items-center gap-1 shrink-0 transition"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                <span>
                  {isHindi
                    ? `"${unmatchedCode}" के लिए आइटम व स्टॉक जोड़ें`
                    : `Add Item & Stock for "${unmatchedCode}"`}
                </span>
              </button>
            )}
            <button type="button" onClick={() => setScanBanner(null)} className="opacity-70 hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Parked Bills Recall Drawer */}
      {showParkedDrawer && (
        <div className="bg-slate-900 border border-amber-500/40 rounded-2xl p-4 shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-2">
              <PauseCircle className="w-4 h-4" />
              <span>{isHindi ? 'होल्ड किए गए काउंटर बिल (Recall Bill)' : 'Parked Counter Bills Queue'}</span>
            </h3>
            <button
              type="button"
              onClick={() => setShowParkedDrawer(false)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {parkedBills.length === 0 ? (
            <p className="text-xs text-slate-500 py-2">
              {isHindi ? 'अभी कोई बिल होल्ड पर नहीं है।' : 'No parked bills in queue.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {parkedBills.map((pb) => (
                <div
                  key={pb.id}
                  className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate">{pb.label}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      {pb.parkedAt} • {pb.lines.length} lines
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRecallBill(pb)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1"
                    >
                      <PlayCircle className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'खोलें' : 'Recall'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setParkedBills((prev) => prev.filter((x) => x.id !== pb.id))}
                      className="p-1.5 text-rose-400 hover:bg-rose-500/15 rounded-lg"
                      title="Discard"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Split Workspace: Left Scanner + Catalog (60%) | Right Cart + Checkout (40%) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        {/* LEFT PANEL */}
        <div className="xl:col-span-7 space-y-3">
          {/* Barcode Scan Input Bar */}
          <form
            onSubmit={handleScanSubmit}
            className="bg-slate-900 border-2 border-cyan-500/40 focus-within:border-cyan-400 rounded-2xl p-3 shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
          >
            <div className="relative flex-1 flex items-center">
              <ScanBarcode className="w-5 h-5 text-cyan-400 absolute left-3 pointer-events-none" />
              <input
                ref={scanInputRef}
                type="text"
                value={scanInput}
                onChange={(e) => {
                  setScanInput(e.target.value);
                  setCatalogSearch(e.target.value);
                }}
                placeholder={
                  isHindi
                    ? 'बारकोड स्कैन करें या SKU / बैच नंबर / आइटम नाम लिखकर Enter दबाएं [F2]...'
                    : 'Scan Barcode or type SKU / Batch No / Item Name & press Enter [F2]...'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-9 py-2.5 text-sm font-mono font-bold text-white placeholder-slate-500 focus:outline-none min-h-[44px]"
              />
              {scanInput && (
                <button
                  type="button"
                  onClick={() => {
                    setScanInput('');
                    setCatalogSearch('');
                    focusScanInput();
                  }}
                  className="absolute right-2.5 text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold px-4 py-2.5 rounded-xl text-xs transition min-h-[44px]"
              >
                {isHindi ? 'जोड़ें (Enter)' : 'Add [↵]'}
              </button>

              <button
                type="button"
                onClick={() => setShowCameraModal(true)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition min-h-[44px]"
                title={isHindi ? 'कैमरा से बारकोड स्कैन करें' : 'Scan Barcode with Camera'}
              >
                <Camera className="w-4 h-4 text-cyan-400" />
                <span className="hidden sm:inline">{isHindi ? 'कैमरा' : 'Cam'}</span>
              </button>

              {perms.canCreateEditMasters && onAddItem && (
                <button
                  type="button"
                  onClick={() => {
                    setPendingScanBarcode('');
                    setUnmatchedCode('');
                    setShowQuickItem(true);
                  }}
                  className="bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center gap-1.5 transition min-h-[44px]"
                  title={isHindi ? 'नया स्टॉक आइटम जोड़ें' : 'Quick Add New Item'}
                >
                  <PackagePlus className="w-4 h-4" />
                  <span className="hidden sm:inline">{isHindi ? 'नया आइटम' : 'New'}</span>
                </button>
              )}
            </div>
          </form>

          {/* Category Filter + Search */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-3 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition border ${
                      selectedCategory === cat
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {cat === 'ALL' ? (isHindi ? 'सभी श्रेणियां' : 'All Items') : cat}
                  </button>
                ))}
              </div>

              <div className="relative flex items-center w-full sm:w-52">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  placeholder={isHindi ? 'आइटम खोजें...' : 'Filter catalog...'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Catalog Item Touch Grid */}
            {catalogItems.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                <p>{isHindi ? 'कोई मिलान आइटम नहीं मिला।' : 'No matching inventory items found.'}</p>
                {perms.canCreateEditMasters && onAddItem && (
                  <button
                    type="button"
                    onClick={() => {
                      const typed = scanInput.trim();
                      setPendingScanBarcode(typed);
                      setUnmatchedCode(typed);
                      setShowQuickItem(true);
                    }}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>
                      {scanInput.trim()
                        ? isHindi
                          ? `"${scanInput.trim()}" को नए आइटम व स्टॉक के रूप में जोड़ें`
                          : `Add "${scanInput.trim()}" as New Item & Stock`
                        : isHindi
                        ? 'नया आइटम जोड़ें'
                        : 'Add First Product'}
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[540px] overflow-y-auto pr-1">
                {catalogItems.map((item) => {
                  const godownQty = getItemStockInGodown(item, activeGodown?.id, godowns);
                  const fefoBatches = fefoByItemId.get(item.id) || [];
                  const firstBatch = fefoBatches[0];
                  const expInfo = firstBatch ? getExpiryStatus(firstBatch.expiryDate, todayIso) : null;
                  const outOfStock = godownQty <= 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addItemToCart(item)}
                      className={`text-left p-3 rounded-xl border transition flex flex-col justify-between min-h-[96px] active:scale-[0.98] ${
                        outOfStock
                          ? 'bg-slate-950/70 border-slate-800/80 opacity-75 hover:border-amber-500/40'
                          : 'bg-slate-950 border-slate-800 hover:border-cyan-500/60 hover:bg-slate-900'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-white line-clamp-2 leading-snug">
                          {item.name}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 truncate">
                          {item.barcode || item.code || item.hsnSacCode}
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-end justify-between gap-1">
                        <div>
                          <div className="text-xs font-black font-mono text-emerald-400 tabular-nums">
                            {formatCurrency(getItemPriceForTier(item, priceTier, firstBatch), currency)}
                          </div>
                          {priceTier !== 'MRP' && item.mrp && item.mrp > getItemPriceForTier(item, priceTier, firstBatch) && (
                            <div className="text-[9px] font-mono text-slate-500 line-through">
                              MRP {currencySymbol}{item.mrp}
                            </div>
                          )}
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-[10px] font-mono font-bold block ${
                              outOfStock
                                ? 'text-rose-400'
                                : godownQty <= (item.minStockLevel || 5)
                                ? 'text-amber-400'
                                : 'text-cyan-400'
                            }`}
                          >
                            {godownQty} {item.unit || 'PCS'}
                          </span>
                          {firstBatch && expInfo && expInfo.bucket !== 'NO_EXPIRY' && (
                            <span
                              className={`text-[9px] font-mono block ${
                                expInfo.bucket === 'EXPIRING_SOON'
                                  ? 'text-amber-400 font-bold'
                                  : 'text-slate-500'
                              }`}
                            >
                              {firstBatch.expiryDate?.slice(0, 7)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Customer + Active Cart + Express Settlement */}
        <div className="xl:col-span-5 space-y-3">
          {/* Customer Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-lg space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {isHindi ? 'ग्राहक (Customer / Walk-in)' : 'Customer (Walk-In / Registered)'}
              </label>
              <div className="flex items-center gap-2">
                {selectedPartyId && (
                  <button
                    type="button"
                    onClick={() => setSelectedPartyId('')}
                    className="text-[11px] font-bold text-amber-400 hover:underline"
                  >
                    {isHindi ? 'वॉक-इन कैश चुनें' : 'Reset to Walk-In'}
                  </button>
                )}
                {perms.canCreateEditMasters && onAddParty && (
                  <button
                    type="button"
                    onClick={() => setShowQuickParty(true)}
                    className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{isHindi ? '+ नया ग्राहक' : '+ New Customer'}</span>
                  </button>
                )}
              </div>
            </div>

            {selectedPartyId ? (
              <SearchablePartySelect
                parties={customerParties}
                selectedPartyId={selectedPartyId}
                onSelectParty={(val) => setSelectedPartyId(val)}
                isHindi={isHindi}
                onAddNewParty={perms.canCreateEditMasters && onAddParty ? () => setShowQuickParty(true) : undefined}
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold text-emerald-300 flex items-center justify-between">
                  <span>{isHindi ? 'वॉक-इन कैश ग्राहक (Counter Consumer)' : 'Walk-In Cash Customer (Retail Counter)'}</span>
                  <span className="text-[10px] font-mono text-slate-500">{taxProfile.gstEnabled ? 'URP' : 'Retail'}</span>
                </div>
                {customerParties.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedPartyId(customerParties[0].id)}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-2 rounded-xl text-xs border border-slate-700 shrink-0"
                  >
                    {isHindi ? 'पार्टी चुनें' : 'Pick Party'}
                  </button>
                )}
              </div>
            )}

            {selectedParty && posPartyCreditEval && (posPartyCreditEval.creditLimitExceeded || posPartyCreditEval.overdueInvoices.length > 0) && (
              <div className="bg-amber-500/10 border border-amber-500/35 rounded-xl px-3 py-2 text-[11px] text-amber-200 space-y-0.5">
                {posPartyCreditEval.creditLimitExceeded && (
                  <div className="font-bold text-rose-300">
                    {isHindi
                      ? `क्रेडिट सीमा पार: अनुमानित बकाया ${formatCurrency(posPartyCreditEval.projectedBalance, currency)} / सीमा ${formatCurrency(posPartyCreditEval.creditLimit, currency)}`
                      : `Credit Limit Alert: Projected ${formatCurrency(posPartyCreditEval.projectedBalance, currency)} > Limit ${formatCurrency(posPartyCreditEval.creditLimit, currency)}`}
                  </div>
                )}
                {posPartyCreditEval.overdueInvoices.length > 0 && (
                  <div>
                    {isHindi
                      ? `बकाया ओवरड्यू बिल: ${posPartyCreditEval.overdueInvoices.length} (${formatCurrency(posPartyCreditEval.totalOverdueAmount, currency)})`
                      : `Overdue Bills: ${posPartyCreditEval.overdueInvoices.length} unpaid (${formatCurrency(posPartyCreditEval.totalOverdueAmount, currency)})`}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Active POS Cart */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-white">
                  {isHindi ? 'काउंटर बिल कार्ट' : 'Active Counter Cart'}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  ({cart.length} {isHindi ? 'लाइन' : 'lines'} • {totals.totalQty} {isHindi ? 'नग' : 'qty'})
                </span>
              </div>

              <div className="flex items-center gap-2">
                {cart.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleParkBill}
                      className="text-[11px] font-bold text-amber-300 hover:text-amber-200 flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30"
                      title="Hold Bill [F4]"
                    >
                      <PauseCircle className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'होल्ड' : 'Hold'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCart([])}
                      className="text-[11px] font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-rose-500/10"
                      title="Clear Cart"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'साफ करें' : 'Clear'}</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {cart.length === 0 ? (
              <div className="py-12 px-4 text-center text-slate-500 text-xs space-y-1.5">
                <ScanBarcode className="w-8 h-8 text-slate-700 mx-auto" />
                <p className="font-semibold text-slate-400">
                  {isHindi ? 'बिलिंग शुरू करने के लिए बारकोड स्कैन करें या आइटम पर क्लिक करें' : 'Scan a barcode or click any item to start counter billing'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80 max-h-[290px] overflow-y-auto">
                {cart.map((line) => {
                  const lineBatches = getSortedItemBatchesFefo(
                    data.itemBatches || [],
                    line.itemId,
                    activeGodown?.id,
                    { includeExpired: true, includeDepleted: false, referenceDate: todayIso }
                  );
                  const gross = line.quantity * line.rate;
                  const effTax = forceZeroTax ? 0 : line.taxRate;
                  const effCess = showCess ? (line.cessPercent || 0) : 0;
                  const net = gross * (1 - line.discountPercent / 100) * (1 + (effTax + effCess) / 100);

                  return (
                    <div key={line.id} className="p-3 hover:bg-slate-800/30 space-y-2 text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-white truncate">{line.itemName}</div>
                          <div className="text-[10px] font-mono text-slate-400 flex flex-wrap items-center gap-x-2">
                            {!forceZeroTax && <span>Tax: {line.taxRate}%</span>}
                            {showCess && (line.cessPercent || 0) > 0 && (
                              <span className="text-amber-300">Cess: {line.cessPercent}%</span>
                            )}
                            {line.batchNumber && (
                              <span className="text-cyan-300">
                                Batch: {line.batchNumber}
                                {line.expiryDate ? ` (${line.expiryDate})` : ''}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono font-black text-emerald-400 tabular-nums text-sm">
                            {formatCurrency(net, currency)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setCart((prev) => prev.filter((x) => x.id !== line.id))}
                            className="text-slate-500 hover:text-rose-400 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {/* Qty Stepper */}
                        <div className="inline-flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setCart((prev) =>
                                prev
                                  .map((x) =>
                                    x.id === line.id ? { ...x, quantity: x.quantity - 1 } : x
                                  )
                                  .filter((x) => x.quantity > 0)
                              )
                            }
                            className="px-2 py-1 text-slate-300 hover:bg-slate-800"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={0.01}
                            step="any"
                            value={line.quantity}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              const master = (data.items || []).find((i) => i.id === line.itemId);
                              if (master && !accountsOnly && negativeStockPolicy === 'BLOCK') {
                                const avail = getItemStockInGodown(master, activeGodown?.id, godowns);
                                const otherQty = cart
                                  .filter((l) => l.itemId === line.itemId && l.id !== line.id)
                                  .reduce((s, l) => s + (Number(l.quantity) || 0), 0);
                                if (otherQty + val > avail + 0.0005) {
                                  showBanner(
                                    'err',
                                    isHindi
                                      ? `स्टॉक अवरुद्ध: "${master.name}" केवल ${avail} ${master.unit || 'PCS'} उपलब्ध है।`
                                      : `Stock Blocked: "${master.name}" max ${avail} ${master.unit || 'PCS'} available.`
                                  );
                                  return;
                                }
                              }
                              setCart((prev) =>
                                prev.map((x) => (x.id === line.id ? { ...x, quantity: val } : x))
                              );
                            }}
                            className="w-12 bg-transparent text-center font-mono font-bold text-white text-xs focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const master = (data.items || []).find((i) => i.id === line.itemId);
                              if (master && !accountsOnly && negativeStockPolicy === 'BLOCK') {
                                const avail = getItemStockInGodown(master, activeGodown?.id, godowns);
                                const totalAfter = cart
                                  .filter((l) => l.itemId === line.itemId)
                                  .reduce((s, l) => s + (Number(l.quantity) || 0), 0) + 1;
                                if (totalAfter > avail + 0.0005) {
                                  showBanner(
                                    'err',
                                    isHindi
                                      ? `स्टॉक अवरुद्ध: "${master.name}" केवल ${avail} ${master.unit || 'PCS'} उपलब्ध है।`
                                      : `Stock Blocked: "${master.name}" only has ${avail} ${master.unit || 'PCS'} in stock.`
                                  );
                                  return;
                                }
                              }
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.id === line.id ? { ...x, quantity: x.quantity + 1 } : x
                                )
                              );
                            }}
                            className="px-2 py-1 text-slate-300 hover:bg-slate-800"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Rate & Discount Inputs */}
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] text-slate-500">Rate</label>
                          <input
                            type="number"
                            step="0.01"
                            value={line.rate}
                            onChange={(e) => {
                              const r = parseFloat(e.target.value) || 0;
                              setCart((prev) =>
                                prev.map((x) => (x.id === line.id ? { ...x, rate: r } : x))
                              );
                            }}
                            className="w-20 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-right font-mono text-white text-xs"
                          />
                          <label className="text-[10px] text-slate-500">Disc%</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={line.discountPercent}
                            onChange={(e) => {
                              const d = Math.min(100, Math.max(0, parseFloat(e.target.value) || 0));
                              setCart((prev) =>
                                prev.map((x) => (x.id === line.id ? { ...x, discountPercent: d } : x))
                              );
                            }}
                            className="w-14 bg-slate-950 border border-slate-800 rounded-lg px-1.5 py-1 text-right font-mono text-amber-300 text-xs"
                          />
                        </div>
                      </div>

                      {/* Batch Picker when multiple batches exist */}
                      {lineBatches.length > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                            {isHindi ? 'बैच:' : 'Batch:'}
                          </span>
                          <select
                            value={line.batchId || ''}
                            onChange={(e) => {
                              const b = lineBatches.find((x) => x.id === e.target.value);
                              setCart((prev) =>
                                prev.map((x) =>
                                  x.id === line.id
                                    ? {
                                        ...x,
                                        batchId: b?.id,
                                        batchNumber: b?.batchNumber,
                                        expiryDate: b?.expiryDate,
                                        mfgDate: b?.mfgDate,
                                        mrp: b?.mrp ?? x.mrp,
                                        barcode: b?.barcode ?? x.barcode,
                                      }
                                    : x
                                )
                              );
                            }}
                            className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none"
                          >
                            <option value="">-- No Specific Batch --</option>
                            {lineBatches.map((b) => {
                              const exp = getExpiryStatus(b.expiryDate, todayIso);
                              return (
                                <option key={b.id} value={b.id} disabled={exp.bucket === 'EXPIRED'}>
                                  {b.batchNumber} | Qty: {b.availableQty}
                                  {b.expiryDate ? ` | Exp: ${b.expiryDate}` : ''}
                                  {exp.bucket === 'EXPIRED' ? ' [EXPIRED]' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Totals Strip */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-2 text-xs">
              {forceZeroTax && (
                <div className="text-[11px] font-semibold text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5 mb-1">
                  {taxProfile.isComposition
                    ? (isHindi ? 'कंपोज़िशन डीलर: 0% GST बिल ऑफ सप्लाई' : 'Composition Dealer: 0% GST Bill of Supply')
                    : (isHindi ? 'गैर-जीएसटी बिलिंग मोड (Tax-Free)' : 'Non-GST Billing Mode (Tax-Free)')}
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>{isHindi ? 'उप-योग (Subtotal):' : 'Subtotal:'}</span>
                <span className="font-mono tabular-nums text-slate-200">{formatCurrency(totals.subtotal, currency)}</span>
              </div>
              {totals.totalDiscount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>{isHindi ? 'छूट (Discount):' : 'Discount:'}</span>
                  <span className="font-mono tabular-nums">-{formatCurrency(totals.totalDiscount, currency)}</span>
                </div>
              )}
              {!forceZeroTax && (
                <div className="flex justify-between text-slate-400">
                  <span>{totals.isInterState ? 'IGST:' : 'CGST + SGST:'}</span>
                  <span className="font-mono tabular-nums text-slate-200">{formatCurrency(totals.totalTax, currency)}</span>
                </div>
              )}
              {showCess && totals.cessAmount > 0 && (
                <div className="flex justify-between text-amber-300">
                  <span>Cess:</span>
                  <span className="font-mono tabular-nums">{formatCurrency(totals.cessAmount, currency)}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <span className="text-sm font-extrabold text-white">
                  {isHindi ? 'कुल देय राशि (Net Payable):' : 'Net Payable:'}
                </span>
                <span className="text-2xl font-black font-mono tabular-nums text-emerald-400">
                  {formatCurrency(totals.grandTotal, currency)}
                </span>
              </div>
            </div>
          </div>

          {/* Express Payment & Checkout Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <div className="grid grid-cols-5 gap-1.5 text-[11px] font-bold">
              {(
                [
                  { id: 'CASH', label: isHindi ? 'नकद' : 'Cash', icon: Banknote },
                  { id: 'UPI', label: 'UPI', icon: Smartphone },
                  { id: 'CARD', label: isHindi ? 'कार्ड' : 'Card', icon: CreditCard },
                  { id: 'SPLIT', label: isHindi ? 'स्प्लिट' : 'Split', icon: Split },
                  { id: 'CREDIT', label: isHindi ? 'उधार' : 'Credit', icon: Clock },
                ] as const
              ).map((m) => {
                const Icon = m.icon;
                const active = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`py-2 px-1.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition min-h-[48px] ${
                      active
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </div>

            {paymentMethod === 'CASH' && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-slate-400 font-semibold">
                    {isHindi ? 'नकद खाता (Cash Ledger):' : 'Cash Account:'}
                  </label>
                  <select
                    value={selectedCashAccountId}
                    onChange={(e) => setSelectedCashAccountId(e.target.value)}
                    className="w-44 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-emerald-300"
                  >
                    {(cashLedgers.length > 0 ? cashLedgers : [{ id: 'acc_cash', name: 'Cash in Hand', code: '1010' } as any]).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-slate-400 font-semibold">
                    {isHindi ? 'प्राप्त नकद (Tendered Cash):' : 'Cash Received:'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={tenderedCash || ''}
                    onChange={(e) => setTenderedCash(parseFloat(e.target.value) || 0)}
                    placeholder={String(totals.grandTotal)}
                    className="w-32 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-mono font-bold text-white"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTenderedCash(totals.grandTotal)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-[11px]"
                  >
                    Exact ({currencySymbol}{totals.grandTotal})
                  </button>
                  {(currency === 'INR' ? [50, 100, 500, 2000] : [10, 20, 50, 100]).map((den) => (
                    <button
                      key={den}
                      type="button"
                      onClick={() => setTenderedCash((prev) => (prev || 0) + den)}
                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 hover:text-white font-mono text-[11px]"
                    >
                      +{currencySymbol}{den}
                    </button>
                  ))}
                </div>
                {tenderedCash > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                    <span className="font-bold text-slate-300">
                      {isHindi ? 'वापस छुट्टे (Change Due):' : 'Change to Return:'}
                    </span>
                    <span className="font-mono font-black text-base text-amber-400 tabular-nums">
                      {formatCurrency(changeDue, currency)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'UPI' && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label className="text-slate-400 font-semibold">
                    {isHindi ? 'जमा बैंक खाता (Bank Ledger):' : 'Deposit Bank Account:'}
                  </label>
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="w-44 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-cyan-300"
                  >
                    {(bankLedgers.length > 0 ? bankLedgers : [{ id: 'acc_bank', name: 'Bank Account', code: '1020' } as any]).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                {totals.grandTotal > 0 && currency === 'INR' && Boolean(data.company.upiId?.trim()) && (
                  <div className="flex items-center gap-3">
                    <div className="bg-white p-1.5 rounded-lg shrink-0">
                      <QRCodeSVG value={upiUri} size={74} level="M" />
                    </div>
                    <div className="text-xs space-y-1">
                      <div className="font-bold text-white">
                        {isHindi ? 'ग्राहक को UPI QR स्कैन कराएं' : 'Customer Scan & Pay (UPI)'}
                      </div>
                      <div className="text-[11px] font-mono text-cyan-400">{upiId}</div>
                      <div className="font-mono font-black text-emerald-400">
                        {formatCurrency(totals.grandTotal, currency)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {paymentMethod === 'CARD' && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-slate-400 font-semibold">
                    {isHindi ? 'कार्ड सेटलमेंट बैंक:' : 'Card Settlement Bank:'}
                  </label>
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="w-44 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-cyan-300"
                  >
                    {(bankLedgers.length > 0 ? bankLedgers : [{ id: 'acc_bank', name: 'Bank Account', code: '1020' } as any]).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>{isHindi ? 'पूर्ण राशि बैंक खाते में डेबिट होगी' : 'Full amount debits selected Bank ledger immediately'}</span>
                  <span className="font-mono font-bold text-emerald-400">{formatCurrency(totals.grandTotal, currency)}</span>
                </div>
              </div>
            )}

            {paymentMethod === 'SPLIT' && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Cash</label>
                    <input
                      type="number"
                      min={0}
                      value={splitCash || ''}
                      onChange={(e) => setSplitCash(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-white text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">UPI</label>
                    <input
                      type="number"
                      min={0}
                      value={splitUpi || ''}
                      onChange={(e) => setSplitUpi(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-white text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1">Card</label>
                    <input
                      type="number"
                      min={0}
                      value={splitCard || ''}
                      onChange={(e) => setSplitCard(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 font-mono text-white text-right"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800">
                  <label className="text-[11px] text-slate-400 font-semibold">
                    {isHindi ? 'UPI/Card हेतु बैंक खाता:' : 'Bank (for UPI/Card):'}
                  </label>
                  <select
                    value={selectedBankAccountId}
                    onChange={(e) => setSelectedBankAccountId(e.target.value)}
                    className="w-44 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-[11px] font-semibold text-cyan-300"
                  >
                    {(bankLedgers.length > 0 ? bankLedgers : [{ id: 'acc_bank', name: 'Bank Account', code: '1020' } as any]).map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {negativeStockPolicy !== 'ALLOW' && negativeStockViolations.length > 0 && (
              <div
                className={`rounded-xl p-2.5 border text-xs ${
                  negativeStockPolicy === 'BLOCK'
                    ? 'bg-rose-500/15 border-rose-500/45 text-rose-200 font-semibold'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                }`}
              >
                {negativeStockPolicy === 'BLOCK' ? (
                  <div>
                    <strong>{isHindi ? 'स्टॉक अवरुद्ध (Blocked): ' : 'Stock Blocked: '}</strong>
                    {negativeStockViolations.map((v) => `${v.name} (Avail: ${v.available}, Cart: ${v.reqQty})`).join(', ')}
                  </div>
                ) : (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={confirmNegativeStockPos}
                      onChange={(e) => setConfirmNegativeStockPos(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0"
                    />
                    <span>
                      <strong className="text-amber-300">{isHindi ? 'कम स्टॉक चेतावनी: ' : 'Low Stock Warning: '}</strong>
                      {negativeStockViolations.map((v) => `${v.name} (Avail: ${v.available}, Cart: ${v.reqQty})`).join(', ')} —{' '}
                      {isHindi ? 'कम स्टॉक के साथ बिल जारी करने की पुष्टि करें।' : 'Confirm proceeding with negative stock.'}
                    </span>
                  </label>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={cart.length === 0 || (negativeStockPolicy === 'BLOCK' && negativeStockViolations.length > 0)}
                onClick={() => handleCheckout(false)}
                className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition min-h-[46px]"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{isHindi ? 'केवल सेव करें' : 'Save Bill Only'}</span>
              </button>

              <button
                type="button"
                disabled={cart.length === 0 || (negativeStockPolicy === 'BLOCK' && negativeStockViolations.length > 0)}
                onClick={() => handleCheckout(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-extrabold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 transition min-h-[46px]"
              >
                <Printer className="w-4 h-4" />
                <span>{isHindi ? 'बिल बनाएं & प्रिंट [F9]' : 'Checkout & Print [F9]'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Camera Scanner Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-bold text-white text-sm">
                <Camera className="w-4 h-4 text-cyan-400" />
                <span>{isHindi ? 'कैमरा बारकोड स्कैनर' : 'Camera Barcode Scanner'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCameraFacing((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1"
                  title={isHindi ? 'फ्रंट / बैक कैमरा बदलें' : 'Switch Front / Back Camera'}
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">
                    {cameraFacing === 'environment' ? (isHindi ? 'बैक' : 'Rear') : (isHindi ? 'फ्रंट' : 'Front')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowCameraModal(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <div className="bg-black rounded-2xl overflow-hidden aspect-video relative flex items-center justify-center border border-slate-800">
                <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
                {cameraActive && (
                  <div className="absolute inset-8 border-2 border-cyan-400/70 rounded-xl pointer-events-none" />
                )}
                {!cameraActive && !cameraError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs gap-2 bg-slate-950/70">
                    <Camera className="w-7 h-7 text-cyan-400 animate-pulse" />
                    <span>{isHindi ? 'कैमरा चालू हो रहा है...' : 'Starting camera...'}</span>
                  </div>
                )}
              </div>

              {cameraError && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-100 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{cameraError}</span>
                  </div>

                  {cameraErrorKind === 'PERMISSION_DENIED' && (
                    <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-200 leading-relaxed">
                      <li>
                        {isHindi
                          ? 'ब्राउज़र के एड्रेस बार (ऊपर बाईं ओर 🔒 या कैमरा आइकन) पर क्लिक करें → Camera को "Allow" चुनें।'
                          : 'Click the Lock / Camera icon in your browser address bar → set Camera to "Allow".'}
                      </li>
                      <li>
                        {isHindi
                          ? 'अगर आप प्रीव्यू विंडो के अंदर हैं तो नीचे "नए टैब में खोलें" पर क्लिक करें (वहाँ कैमरा 100% सीधे चलेगा)।'
                          : 'If running inside an embedded preview frame, click "Open in New Tab" below for unrestricted camera access.'}
                      </li>
                      <li>
                        {isHindi
                          ? 'या बिना किसी लाइव परमिशन के नीचे "फोटो से स्कैन करें" बटन से फोन के कैमरे से फोटो खींचकर तुरंत बिल में जोड़ें।'
                          : 'Or tap "Capture Barcode Photo" below to scan straight from your phone camera without live stream permissions.'}
                      </li>
                    </ol>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setCameraRetryKey((k) => k + 1)}
                      className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-extrabold text-[11px] flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'कैमरा पुनः प्रयास करें' : 'Retry Camera'}</span>
                    </button>

                    <a
                      href={typeof window !== 'undefined' ? window.location.href : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 font-bold text-[11px] flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{isHindi ? 'नए टैब में खोलें' : 'Open in New Tab'}</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Direct Native Camera Photo / Image Upload Scanner (works even when live getUserMedia is blocked) */}
              <input
                ref={photoScanInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleBarcodeImageUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={photoScanBusy}
                onClick={() => photoScanInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-xl bg-indigo-600/25 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-200 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                <ImagePlus className="w-4 h-4 text-indigo-300" />
                <span>
                  {photoScanBusy
                    ? isHindi
                      ? 'फोटो से बारकोड पढ़ा जा रहा है...'
                      : 'Reading barcode from photo...'
                    : isHindi
                    ? '📷 कैमरा फोटो / इमेज से बारकोड स्कैन करें (बिना Permission)'
                    : '📷 Capture / Upload Barcode Photo (Fallback)'}
                </span>
              </button>

              <p className="text-[11px] text-slate-400 text-center">
                {isHindi
                  ? 'बारकोड को फ्रेम के बीच रखें। स्कैन होते ही आइटम अपने आप बिल में जुड़ जाएगा (नया बारकोड होने पर जोड़ने की विंडो खुलेगी)।'
                  : 'Center the barcode inside the cyan frame. Items add automatically (unregistered barcodes open Quick Add).'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Add Party & Stock Item Modals */}
      {showQuickParty && onAddParty && (
        <QuickAddPartyModal
          isHindi={isHindi}
          initialType="CUSTOMER"
          onSave={(party) => {
            onAddParty(party);
            setSelectedPartyId(party.id);
            setShowQuickParty(false);
          }}
          onClose={() => setShowQuickParty(false)}
        />
      )}

      {showQuickItem && onAddItem && (
        <QuickAddStockItemModal
          isHindi={isHindi}
          currency={currency}
          gstEnabled={!forceZeroTax}
          cessEnabled={showCess}
          initialBarcode={pendingScanBarcode || undefined}
          initialOpeningStock={pendingScanBarcode ? 1 : undefined}
          defaultGodownId={activeGodown?.id}
          defaultGodownName={activeGodown?.name}
          submitLabel={
            pendingScanBarcode
              ? isHindi
                ? 'आइटम + स्टॉक सेव कर बिल में जोड़ें'
                : 'Save Item + Stock & Add to Bill'
              : undefined
          }
          onSave={(item) => {
            onAddItem(item);
            addItemToCart(item);
            setPendingScanBarcode('');
            setUnmatchedCode('');
            setScanInput('');
            setCatalogSearch('');
            setShowQuickItem(false);
            showBanner(
              'ok',
              isHindi
                ? `✅ "${item.name}" (${item.currentStock} ${item.unit}) स्टॉक में जुड़ा और बिल में शामिल किया गया!`
                : `✅ Added "${item.name}" (+${item.currentStock} ${item.unit} stock) & inserted into POS cart!`
            );
            focusScanInput();
          }}
          onClose={() => {
            setPendingScanBarcode('');
            setShowQuickItem(false);
            focusScanInput();
          }}
        />
      )}
    </div>
  );
};
