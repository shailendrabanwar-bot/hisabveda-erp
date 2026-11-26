import React, { useState, useMemo, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  Trash2, 
  Edit3, 
  Tag, 
  Printer, 
  PlusCircle, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown, 
  Boxes, 
  Layers, 
  History, 
  FileSpreadsheet, 
  Filter, 
  ArrowUpDown, 
  CheckCircle2, 
  X, 
  SlidersHorizontal, 
  ShoppingBag, 
  Receipt, 
  Sparkles, 
  Warehouse, 
  RotateCcw, 
  Download, 
  ShieldAlert, 
  HelpCircle,
  Eye,
  Percent,
  Barcode,
  ArrowRightLeft,
  Calendar,
  Clock,
  ScanBarcode,
  MapPin
} from 'lucide-react';
import { AppData, ItemMaster, Currency, StockAdjustmentRecord, UserRole, Godown, GodownType, ItemBatch, StockTransfer, StockTransferLine } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getRolePermissions, normalizeUserRole, RolePermissions } from '../../utils/rbac';
import { resolveCompanyTaxProfile, getCurrencySymbol } from '../../utils/companyProfile';
import { printStockLedger, printInventoryValuationReport, printDomElement } from '../../utils/printReport';
import { exportItemsCSV, exportInventoryValuationCSV } from '../../utils/exportHelpers';
import { STANDARD_UNITS, getCustomUnits, saveCustomUnit } from '../../data/hsnDirectory';
import { 
  calculateInventoryValuationReport, 
  getItemStockMovements, 
  ValuationMethod, 
  ItemValuationDetail, 
  StockMovementEntry 
} from '../../utils/inventoryValuation';
import {
  ensureGodowns,
  resolveDefaultGodownId,
  generateEan13Barcode,
  getExpiryStatus,
  getBatchSummaryStats,
  getItemStockInGodown,
  getSortedItemBatchesFefo,
  computeBatchStatus,
} from '../../utils/inventoryBatches';
import { BarcodeSvg, BarcodePrintModal, BarcodeLabelTarget } from '../Common/BarcodeSvg';

interface InventoryModuleProps {
  data: AppData;
  isHindi: boolean;
  onAddItem: (item: ItemMaster) => void;
  onUpdateItem?: (item: ItemMaster) => void;
  onDeleteItem: (id: string) => void;
  onStockAdjustment?: (itemId: string, newQuantity: number, reason: string, notes?: string, godownId?: string) => void;
  onBatchStockAdjustment?: (adjustments: Array<{ itemId: string; newQuantity: number; reason: string; notes?: string; godownId?: string }>) => void;
  onSaveGodowns?: (godowns: Godown[]) => void;
  onSaveBatch?: (batch: ItemBatch) => void;
  onDeleteBatch?: (batchId: string) => void;
  onWriteOffBatch?: (batchId: string) => void;
  onExecuteStockTransfer?: (transfer: StockTransfer) => { ok: boolean; error?: string } | void;
  onOpenBarcodePos?: () => void;
  onNavigateToPurchases?: () => void;
  onNavigateToSales?: () => void;
  initialSearchQuery?: string;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const InventoryModule: React.FC<InventoryModuleProps> = ({
  data,
  isHindi,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onStockAdjustment,
  onBatchStockAdjustment,
  onSaveGodowns,
  onSaveBatch,
  onDeleteBatch,
  onWriteOffBatch,
  onExecuteStockTransfer,
  onOpenBarcodePos,
  onNavigateToPurchases,
  onNavigateToSales,
  initialSearchQuery = '',
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const currencySymbol = getCurrencySymbol(currency);
  const taxProfile = resolveCompanyTaxProfile(data.company);
  const showCessCol = taxProfile.isRegularGst && taxProfile.cessEnabled;

  const godowns = useMemo(() => ensureGodowns(data.godowns), [data.godowns]);
  const batches = useMemo(() => data.itemBatches || [], [data.itemBatches]);
  const transfers = useMemo(() => data.stockTransfers || [], [data.stockTransfers]);
  const batchStats = useMemo(() => getBatchSummaryStats(batches), [batches]);

  const negativeStockItems = useMemo(
    () => (data.items || []).filter((it) => Number(it.currentStock || 0) < 0),
    [data.items]
  );

  // Active Sub-tab in Inventory Module
  const [activeSubTab, setActiveSubTab] = useState<'items' | 'batches' | 'godowns' | 'reorder' | 'valuation' | 'movements' | 'adjustments'>('items');

  // Search & Filter States
  const [search, setSearch] = useState(initialSearchQuery);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [stockStatusFilter, setStockStatusFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'NEGATIVE_STOCK'>('ALL');
  const [valuationMethod, setValuationMethod] = useState<ValuationMethod>('COST');

  // Selected item for Ledger / Movements view
  const [selectedLedgerItemId, setSelectedLedgerItemId] = useState<string>(() => data.items[0]?.id || '');
  const [showItemLedgerModal, setShowItemLedgerModal] = useState<ItemMaster | null>(null);

  // Modals
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ItemMaster | null>(null);
  const [quickAdjustItem, setQuickAdjustItem] = useState<ItemMaster | null>(null);
  const [itemFormError, setItemFormError] = useState<string | null>(null);
  const [barcodePrintTarget, setBarcodePrintTarget] = useState<BarcodeLabelTarget | null>(null);

  // Quick Adjust Form State
  const [adjustNewQty, setAdjustNewQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('Physical Count Discrepancy');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [adjustGodownId, setAdjustGodownId] = useState<string>(() => resolveDefaultGodownId(data.godowns));

  // Dedicated Stock Adjustment Center State (Negative Stock Clearance + Single Item + Comments Log)
  const [negSelectedIds, setNegSelectedIds] = useState<Record<string, boolean>>({});
  const [negTargetQtys, setNegTargetQtys] = useState<Record<string, number>>({});
  const [negBatchReason, setNegBatchReason] = useState<string>('Negative Stock Clearance');
  const [negBatchComment, setNegBatchComment] = useState<string>('');
  const [negBatchNotice, setNegBatchNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [singleAdjSearch, setSingleAdjSearch] = useState<string>('');
  const [singleAdjItemId, setSingleAdjItemId] = useState<string>(() => negativeStockItems[0]?.id || data.items[0]?.id || '');
  const [singleAdjGodownId, setSingleAdjGodownId] = useState<string>(() => resolveDefaultGodownId(data.godowns));
  const [singleAdjMode, setSingleAdjMode] = useState<'SET_FINAL' | 'DELTA'>('SET_FINAL');
  const [singleAdjQtyInput, setSingleAdjQtyInput] = useState<number>(0);
  const [singleAdjReason, setSingleAdjReason] = useState<string>('Physical Count Discrepancy');
  const [singleAdjComment, setSingleAdjComment] = useState<string>('');
  const [singleAdjNotice, setSingleAdjNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [adjHistorySearch, setAdjHistorySearch] = useState<string>('');

  // Keep negative stock selection initialized for newly surfaced negative stock items
  useEffect(() => {
    setNegSelectedIds((prev) => {
      const next = { ...prev };
      negativeStockItems.forEach((it) => {
        if (next[it.id] === undefined) next[it.id] = true;
      });
      return next;
    });
    setNegTargetQtys((prev) => {
      const next = { ...prev };
      negativeStockItems.forEach((it) => {
        if (next[it.id] === undefined) next[it.id] = 0;
      });
      return next;
    });
  }, [negativeStockItems]);

  // Ensure selected single item stays valid
  useEffect(() => {
    if (!singleAdjItemId || !data.items.some((i) => i.id === singleAdjItemId)) {
      const fallback = negativeStockItems[0] || data.items[0];
      if (fallback) {
        setSingleAdjItemId(fallback.id);
        setSingleAdjGodownId(fallback.defaultGodownId || resolveDefaultGodownId(godowns));
        setSingleAdjQtyInput(Number(fallback.currentStock || 0) < 0 ? 0 : Number(fallback.currentStock || 0));
      }
    }
  }, [data.items, negativeStockItems, singleAdjItemId, godowns]);

  // Keyboard shortcuts: Alt+1..7 sub-tabs, F2 opens Stock Adjustment, Escape closes active inventory modal
  useEffect(() => {
    const subTabsOrder: Array<'items' | 'reorder' | 'valuation' | 'movements' | 'batches' | 'godowns' | 'adjustments'> = [
      'items', 'reorder', 'valuation', 'movements', 'batches', 'godowns', 'adjustments'
    ];
    const handleSubTab = (ev: Event) => {
      const idx = (ev as CustomEvent<{ index: number }>).detail?.index;
      if (typeof idx === 'number' && idx >= 1 && idx <= subTabsOrder.length) {
        setActiveSubTab(subTabsOrder[idx - 1]);
      }
    };
    const handleOpenPeriodOrAdjust = () => {
      setActiveSubTab('adjustments');
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (quickAdjustItem) setQuickAdjustItem(null);
        else if (showAddEditModal) setShowAddEditModal(false);
        else if (deleteConfirmItem) setDeleteConfirmItem(null);
        else if (showItemLedgerModal) setShowItemLedgerModal(null);
        else if (barcodePrintTarget) setBarcodePrintTarget(null);
      }
    };
    window.addEventListener('hisabveda:subtab', handleSubTab);
    window.addEventListener('hisabveda:open-period', handleOpenPeriodOrAdjust);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('hisabveda:subtab', handleSubTab);
      window.removeEventListener('hisabveda:open-period', handleOpenPeriodOrAdjust);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [quickAdjustItem, showAddEditModal, deleteConfirmItem, showItemLedgerModal, barcodePrintTarget]);

  // Add/Edit Item Form State
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('');
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [salesPrice, setSalesPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [mrp, setMrp] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0);
  const [cessRate, setCessRate] = useState<number>(0);
  const [currentStock, setCurrentStock] = useState<number>(0);
  const [openingStock, setOpeningStock] = useState<number>(0);
  const [minStockLevel, setMinStockLevel] = useState<number>(0);
  const [reorderQuantity, setReorderQuantity] = useState<number>(0);
  const [maxStockLevel, setMaxStockLevel] = useState<number>(0);
  const [location, setLocation] = useState('');
  const [defaultGodownId, setDefaultGodownId] = useState<string>('');
  const [trackBatchExpiry, setTrackBatchExpiry] = useState<boolean>(false);

  // Batch Tracker States
  const [batchSearch, setBatchSearch] = useState('');
  const [batchBucketFilter, setBatchBucketFilter] = useState<'ALL' | 'EXPIRED' | 'EXPIRING_SOON' | 'WATCH' | 'SAFE' | 'NO_EXPIRY'>('ALL');
  const [batchGodownFilter, setBatchGodownFilter] = useState<string>('ALL');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<ItemBatch | null>(null);
  const [confirmWriteOffBatchId, setConfirmWriteOffBatchId] = useState<string | null>(null);
  const [batchFormError, setBatchFormError] = useState<string | null>(null);
  const [bItemId, setBItemId] = useState<string>('');
  const [bGodownId, setBGodownId] = useState<string>('');
  const [bBatchNumber, setBBatchNumber] = useState<string>('');
  const [bMfgDate, setBMfgDate] = useState<string>('');
  const [bExpiryDate, setBExpiryDate] = useState<string>('');
  const [bMrp, setBMrp] = useState<number>(0);
  const [bPurchaseRate, setBPurchaseRate] = useState<number>(0);
  const [bSalesRate, setBSalesRate] = useState<number>(0);
  const [bQty, setBQty] = useState<number>(0);
  const [bBarcode, setBBarcode] = useState<string>('');
  const [bNotes, setBNotes] = useState<string>('');

  // Multi-Godown & Stock Transfer States
  const [showGodownModal, setShowGodownModal] = useState(false);
  const [editingGodown, setEditingGodown] = useState<Godown | null>(null);
  const [godownFormError, setGodownFormError] = useState<string | null>(null);
  const [gName, setGName] = useState('');
  const [gCode, setGCode] = useState('');
  const [gAddress, setGAddress] = useState('');
  const [gType, setGType] = useState<GodownType>('BRANCH_STORE');
  const [gIsPosCounter, setGIsPosCounter] = useState(true);
  const [gIsDefault, setGIsDefault] = useState(false);
  const [gIsActive, setGIsActive] = useState(true);

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [trFromGodownId, setTrFromGodownId] = useState<string>('');
  const [trToGodownId, setTrToGodownId] = useState<string>('');
  const [trDate, setTrDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [trRefNo, setTrRefNo] = useState<string>('');
  const [trNotes, setTrNotes] = useState<string>('');
  const [trLines, setTrLines] = useState<{ id: string; itemId: string; batchId: string; quantity: number }[]>([]);
  const [printTransferSlip, setPrintTransferSlip] = useState<StockTransfer | null>(null);

  // Custom Unit States
  const [customUnits, setCustomUnits] = useState<string[]>(() => getCustomUnits());
  const [showAddUnitInput, setShowAddUnitInput] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');

  const allAvailableUnits = Array.from(new Set([...STANDARD_UNITS, ...customUnits]));

  // Distinct Categories across items
  const distinctCategories = useMemo(() => {
    const set = new Set<string>();
    data.items.forEach(i => {
      if (i.category) set.add(i.category.trim());
    });
    return Array.from(set).sort();
  }, [data.items]);

  // Inventory Valuation Report Data
  const valuationReport = useMemo(() => {
    return calculateInventoryValuationReport(data, valuationMethod);
  }, [data, valuationMethod]);

  // Filtered Items for Main Table
  const filteredItems = useMemo(() => {
    return data.items.filter(item => {
      // Search
      const q = search.toLowerCase().trim();
      const matchSearch = !q || 
        item.name.toLowerCase().includes(q) || 
        (item.code && item.code.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.toLowerCase().includes(q)) ||
        (item.hsnSacCode && item.hsnSacCode.includes(q)) ||
        (item.category && item.category.toLowerCase().includes(q)) ||
        (item.location && item.location.toLowerCase().includes(q));

      // Category
      const matchCategory = categoryFilter === 'ALL' || item.category === categoryFilter;

      // Stock Status
      const stock = Number(item.currentStock || 0);
      const reorderLevel = Number(item.minStockLevel || item.minStockAlert || 5);
      let matchStatus = true;
      if (stockStatusFilter === 'NEGATIVE_STOCK') {
        matchStatus = stock < 0;
      } else if (stockStatusFilter === 'OUT_OF_STOCK') {
        matchStatus = stock <= 0;
      } else if (stockStatusFilter === 'LOW_STOCK') {
        matchStatus = stock > 0 && stock <= reorderLevel;
      } else if (stockStatusFilter === 'IN_STOCK') {
        matchStatus = stock > reorderLevel;
      }

      return matchSearch && matchCategory && matchStatus;
    });
  }, [data.items, search, categoryFilter, stockStatusFilter]);

  // Items currently below reorder level
  const lowStockItems = useMemo(() => {
    return valuationReport.items.filter(i => i.isLowStock || i.isOutOfStock);
  }, [valuationReport.items]);

  // Handle Custom Unit Add
  const handleAddNewCustomUnit = () => {
    if (!newUnitName.trim()) return;
    const cleanUnit = newUnitName.trim().toUpperCase();
    const updated = saveCustomUnit(cleanUnit);
    setCustomUnits(updated);
    setUnit(cleanUnit);
    setNewUnitName('');
    setShowAddUnitInput(false);
  };

  // Filtered Batches for Batch & Expiry Tracker
  const filteredBatches = useMemo(() => {
    const q = batchSearch.toLowerCase().trim();
    return batches
      .filter((b) => {
        const exp = getExpiryStatus(b.expiryDate);
        if (batchBucketFilter !== 'ALL' && exp.bucket !== batchBucketFilter) return false;
        if (batchGodownFilter !== 'ALL' && b.godownId !== batchGodownFilter) return false;
        if (!q) return true;
        return (
          b.itemName.toLowerCase().includes(q) ||
          b.batchNumber.toLowerCase().includes(q) ||
          (b.barcode || '').toLowerCase().includes(q) ||
          (b.itemCode || '').toLowerCase().includes(q) ||
          (b.godownName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aExp = a.expiryDate || '9999-12-31';
        const bExp = b.expiryDate || '9999-12-31';
        return aExp.localeCompare(bExp);
      });
  }, [batches, batchSearch, batchBucketFilter, batchGodownFilter]);

  // Open Create Item Modal
  const openAddModal = () => {
    setItemFormError(null);
    setEditingItem(null);
    setCode('');
    setBarcode('');
    setName('');
    setDescription('');
    setHsnSacCode('');
    setUnit('');
    setCategory('');
    setCustomCategoryInput('');
    setPurchasePrice(0);
    setSalesPrice(0);
    setWholesalePrice(0);
    setMrp(0);
    setTaxRate(0);
    setCessRate(0);
    setCurrentStock(0);
    setOpeningStock(0);
    setMinStockLevel(0);
    setReorderQuantity(0);
    setMaxStockLevel(0);
    setDefaultGodownId('');
    setLocation('');
    setTrackBatchExpiry(false);
    setShowAddEditModal(true);
  };

  // Open Edit Item Modal
  const openEditModal = (item: ItemMaster) => {
    setItemFormError(null);
    setEditingItem(item);
    setCode(item.code || '');
    setBarcode(item.barcode || '');
    setName(item.name);
    setDescription(item.description || '');
    setHsnSacCode(item.hsnSacCode || '');
    setUnit(item.unit || 'PCS');
    setCategory(item.category || 'General Goods');
    setCustomCategoryInput('');
    setPurchasePrice(item.purchasePrice || 0);
    setSalesPrice(item.salesPrice || item.sellingPrice || 0);
    setWholesalePrice(item.wholesalePrice || 0);
    setMrp(item.mrp || 0);
    setTaxRate(item.taxRate ?? item.gstRate ?? 0);
    setCessRate(item.cessRate || 0);
    setCurrentStock(item.currentStock || 0);
    setOpeningStock(item.openingStock ?? item.currentStock ?? 0);
    setMinStockLevel(item.minStockLevel ?? item.minStockAlert ?? 5);
    setReorderQuantity(item.reorderQuantity || 20);
    setMaxStockLevel(item.maxStockLevel || 100);
    setDefaultGodownId(item.defaultGodownId || resolveDefaultGodownId(godowns));
    setLocation(item.location || 'Main Godown');
    setTrackBatchExpiry(Boolean(item.trackBatchExpiry));
    setShowAddEditModal(true);
  };

  // Save Item (Create or Update)
  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setItemFormError(isHindi ? 'कृपया आइटम का नाम दर्ज करें।' : 'Please enter item name.');
      return;
    }
    setItemFormError(null);

    const finalCode = code.trim() || editingItem?.code || `ITM-${String(data.items.length + 101).padStart(3, '0')}`;
    const finalBarcode = barcode.trim() || generateEan13Barcode(finalCode);
    const finalCategory = customCategoryInput.trim() || category || 'General Goods';
    const targetGodownId = defaultGodownId || resolveDefaultGodownId(godowns);
    const nextQty = Number(currentStock) || 0;

    const nextPurchasePrice = Number(purchasePrice) || 0;

    if (editingItem && onUpdateItem) {
      const updatedMap = { ...(editingItem.godownStocks || {}) };
      const oldQty = Number(editingItem.currentStock || 0);
      const oldPurchasePrice = Number(editingItem.purchasePrice || 0);
      const stockOrRateChanged =
        Math.abs(nextQty - oldQty) > 0.0005 ||
        Math.abs(nextPurchasePrice - oldPurchasePrice) > 0.0005;
      if (Object.keys(updatedMap).length === 0) {
        updatedMap[targetGodownId] = nextQty;
      } else if (Math.abs(nextQty - oldQty) > 0.0005) {
        updatedMap[targetGodownId] = Math.max(0, Math.round(((Number(updatedMap[targetGodownId]) || 0) + (nextQty - oldQty)) * 1000) / 1000);
      }
      const updated: ItemMaster = {
        ...editingItem,
        code: finalCode,
        barcode: finalBarcode,
        name: name.trim(),
        description: description.trim(),
        hsnSacCode: hsnSacCode.trim(),
        unit,
        category: finalCategory,
        purchasePrice: nextPurchasePrice,
        salesPrice: Number(salesPrice) || 0,
        sellingPrice: Number(salesPrice) || 0,
        wholesalePrice: Number(wholesalePrice) > 0 ? Number(wholesalePrice) : undefined,
        mrp: Number(mrp) || undefined,
        taxRate: taxProfile.gstEnabled ? (Number(taxRate) || 0) : 0,
        gstRate: taxProfile.gstEnabled ? (Number(taxRate) || 0) : 0,
        cessRate: showCessCol ? (Number(cessRate) || 0) : (editingItem.cessRate || 0),
        currentStock: nextQty,
        openingStock: Number(openingStock) || 0,
        minStockLevel: Number(minStockLevel) || 5,
        minStockAlert: Number(minStockLevel) || 5,
        reorderQuantity: Number(reorderQuantity) || 20,
        maxStockLevel: Number(maxStockLevel) || 100,
        location: location.trim() || godowns.find(g => g.id === targetGodownId)?.name || 'Main Godown',
        defaultGodownId: targetGodownId,
        godownStocks: updatedMap,
        trackBatchExpiry,
        ...(stockOrRateChanged
          ? { closingStockValue: undefined, importedClosingQty: undefined, importedPurchasePrice: undefined }
          : {}),
      };
      onUpdateItem(updated);
    } else {
      const newItem: ItemMaster = {
        id: 'itm_' + Date.now(),
        code: finalCode,
        barcode: finalBarcode,
        name: name.trim(),
        description: description.trim() || name.trim(),
        hsnSacCode: hsnSacCode.trim(),
        unit: unit || 'PCS',
        category: finalCategory,
        purchasePrice: Number(purchasePrice) || 0,
        salesPrice: Number(salesPrice) || 0,
        sellingPrice: Number(salesPrice) || 0,
        wholesalePrice: Number(wholesalePrice) > 0 ? Number(wholesalePrice) : undefined,
        mrp: Number(mrp) || undefined,
        taxRate: taxProfile.gstEnabled ? (Number(taxRate) || 0) : 0,
        gstRate: taxProfile.gstEnabled ? (Number(taxRate) || 0) : 0,
        cessRate: showCessCol ? (Number(cessRate) || 0) : 0,
        currentStock: nextQty,
        openingStock: Number(openingStock) || 0,
        minStockLevel: Number(minStockLevel) || 0,
        minStockAlert: Number(minStockLevel) || 0,
        reorderQuantity: Number(reorderQuantity) || 0,
        maxStockLevel: Number(maxStockLevel) || 0,
        location: location.trim() || godowns.find(g => g.id === targetGodownId)?.name || 'Main Godown',
        defaultGodownId: targetGodownId,
        godownStocks: { [targetGodownId]: nextQty },
        trackBatchExpiry,
      };
      onAddItem(newItem);
    }

    setShowAddEditModal(false);
    setEditingItem(null);
  };

  // Batch Modal Handlers
  const openAddBatchModal = (presetItem?: ItemMaster) => {
    setBatchFormError(null);
    setEditingBatch(null);
    setBItemId(presetItem?.id || '');
    setBGodownId(presetItem?.defaultGodownId || '');
    setBBatchNumber('');
    setBMfgDate('');
    setBExpiryDate('');
    setBMrp(presetItem ? (presetItem.mrp || presetItem.salesPrice || 0) : 0);
    setBPurchaseRate(presetItem ? (presetItem.purchasePrice || 0) : 0);
    setBSalesRate(presetItem ? (presetItem.salesPrice || 0) : 0);
    setBQty(0);
    setBBarcode('');
    setBNotes('');
    setShowBatchModal(true);
  };

  const openEditBatchModal = (bat: ItemBatch) => {
    setBatchFormError(null);
    setEditingBatch(bat);
    setBItemId(bat.itemId);
    setBGodownId(bat.godownId);
    setBBatchNumber(bat.batchNumber);
    setBMfgDate(bat.mfgDate || '');
    setBExpiryDate(bat.expiryDate || '');
    setBMrp(bat.mrp || 0);
    setBPurchaseRate(bat.purchaseRate || 0);
    setBSalesRate(bat.salesRate || 0);
    setBQty(bat.availableQty || 0);
    setBBarcode(bat.barcode || '');
    setBNotes(bat.notes || '');
    setShowBatchModal(true);
  };

  const handleSubmitBatch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!bItemId) {
      setBatchFormError(isHindi ? 'कृपया आइटम चुनें।' : 'Please select an item.');
      return;
    }
    if (!bGodownId) {
      setBatchFormError(isHindi ? 'कृपया गोदाम चुनें।' : 'Please select a godown.');
      return;
    }
    if (!bBatchNumber.trim()) {
      setBatchFormError(isHindi ? 'बैच नंबर आवश्यक है।' : 'Batch Number is required.');
      return;
    }
    if (bQty < 0) {
      setBatchFormError(isHindi ? 'मात्रा 0 से कम नहीं हो सकती।' : 'Quantity cannot be negative.');
      return;
    }
    const masterItem = data.items.find((i) => i.id === bItemId);
    const targetGodown = godowns.find((g) => g.id === bGodownId) || godowns[0];
    const nextBatch: ItemBatch = {
      id: editingBatch ? editingBatch.id : `bat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      itemId: bItemId,
      itemName: masterItem?.name || editingBatch?.itemName || 'Item',
      itemCode: masterItem?.code,
      godownId: targetGodown.id,
      godownName: targetGodown.name,
      batchNumber: bBatchNumber.trim(),
      mfgDate: bMfgDate || undefined,
      expiryDate: bExpiryDate || undefined,
      mrp: Number(bMrp) || undefined,
      purchaseRate: Number(bPurchaseRate) || 0,
      salesRate: Number(bSalesRate) || masterItem?.salesPrice || 0,
      initialQty: editingBatch ? Math.max(editingBatch.initialQty, Number(bQty) || 0) : (Number(bQty) || 0),
      availableQty: Number(bQty) || 0,
      barcode: bBarcode.trim() || generateEan13Barcode(`${bItemId}_${bBatchNumber}`),
      supplierInvoiceNo: editingBatch?.supplierInvoiceNo,
      purchaseBillId: editingBatch?.purchaseBillId,
      notes: bNotes.trim() || undefined,
      status: 'ACTIVE',
      createdAt: editingBatch?.createdAt || new Date().toISOString(),
    };
    nextBatch.status = computeBatchStatus(nextBatch);
    if (onSaveBatch) onSaveBatch(nextBatch);
    setShowBatchModal(false);
    setEditingBatch(null);
  };

  // Godown Modal Handlers
  const openAddGodownModal = () => {
    setGodownFormError(null);
    setEditingGodown(null);
    setGName('');
    setGCode('');
    setGAddress('');
    setGType('BRANCH_STORE');
    setGIsPosCounter(true);
    setGIsDefault(false);
    setGIsActive(true);
    setShowGodownModal(true);
  };

  const openEditGodownModal = (gdw: Godown) => {
    setGodownFormError(null);
    setEditingGodown(gdw);
    setGName(gdw.name);
    setGCode(gdw.code);
    setGAddress(gdw.address || '');
    setGType(gdw.godownType);
    setGIsPosCounter(gdw.isPosCounter);
    setGIsDefault(gdw.isDefault);
    setGIsActive(gdw.isActive);
    setShowGodownModal(true);
  };

  const handleSubmitGodown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!gName.trim()) {
      setGodownFormError(isHindi ? 'गोदाम का नाम आवश्यक है।' : 'Godown name is required.');
      return;
    }
    const newGdw: Godown = {
      id: editingGodown ? editingGodown.id : `gdw_${Date.now()}`,
      name: gName.trim(),
      code: gCode.trim() || `GDW-${String(godowns.length + 1).padStart(2, '0')}`,
      address: gAddress.trim(),
      godownType: gType,
      isDefault: gIsDefault,
      isPosCounter: gIsPosCounter,
      isActive: gIsActive,
    };
    let nextList = editingGodown
      ? godowns.map((g) => (g.id === editingGodown.id ? newGdw : g))
      : [...godowns, newGdw];
    if (newGdw.isDefault) {
      nextList = nextList.map((g) => ({ ...g, isDefault: g.id === newGdw.id }));
    }
    if (onSaveGodowns) onSaveGodowns(nextList);
    setShowGodownModal(false);
    setEditingGodown(null);
  };

  const handleOpenTransferModal = () => {
    setTransferError(null);
    setTrFromGodownId('');
    setTrToGodownId('');
    setTrDate(new Date().toISOString().split('T')[0]);
    setTrRefNo('');
    setTrNotes('');
    setTrLines([{ id: `trl_${Date.now()}`, itemId: '', batchId: '', quantity: 0 }]);
    setShowTransferModal(true);
  };

  const handleSubmitStockTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setTransferError(null);
    if (!trFromGodownId || !trToGodownId) {
      setTransferError(isHindi ? 'स्रोत और गंतव्य दोनों गोदाम चुनें।' : 'Please select both source and destination godowns.');
      return;
    }
    if (trFromGodownId === trToGodownId) {
      setTransferError(isHindi ? 'स्रोत और गंतव्य गोदाम एक नहीं हो सकते।' : 'Source and Destination godowns must be different.');
      return;
    }
    if (trLines.length === 0 || trLines.some(l => !l.itemId || (Number(l.quantity) || 0) <= 0)) {
      setTransferError(isHindi ? 'कम से कम 1 वैध आइटम और मात्रा दर्ज करें।' : 'Please select an item and enter a valid transfer quantity.');
      return;
    }

    const fromObj = godowns.find((g) => g.id === trFromGodownId);
    const toObj = godowns.find((g) => g.id === trToGodownId);
    const lines: StockTransferLine[] = trLines.map((l) => {
      const itm = data.items.find((i) => i.id === l.itemId);
      const bat = batches.find((b) => b.id === l.batchId);
      return {
        id: l.id,
        itemId: l.itemId,
        itemName: itm?.name || 'Item',
        itemCode: itm?.code,
        unit: itm?.unit || 'PCS',
        batchId: l.batchId || undefined,
        batchNumber: bat?.batchNumber,
        expiryDate: bat?.expiryDate,
        mrp: bat?.mrp,
        quantity: Number(l.quantity) || 0,
      };
    });

    const newTransfer: StockTransfer = {
      id: `trf_${Date.now()}`,
      transferNumber: trRefNo.trim() || `ST-${Date.now().toString().slice(-4)}`,
      date: trDate,
      fromGodownId: trFromGodownId,
      fromGodownName: fromObj?.name || 'Source Godown',
      toGodownId: trToGodownId,
      toGodownName: toObj?.name || 'Destination Godown',
      items: lines,
      totalQuantity: lines.reduce((acc, x) => acc + x.quantity, 0),
      notes: trNotes.trim() || undefined,
      status: 'COMPLETED',
    };

    if (onExecuteStockTransfer) {
      const res = onExecuteStockTransfer(newTransfer);
      if (res && !res.ok) {
        setTransferError(res.error || 'Transfer validation failed.');
        return;
      }
    }
    setShowTransferModal(false);
  };

  // Check if item is used in invoices or purchase bills before deleting
  const checkItemUsage = (item: ItemMaster): { inSales: number; inPurchases: number } => {
    let inSales = 0;
    let inPurchases = 0;

    (data.invoices || []).forEach(inv => {
      if (inv.items.some(l => l.itemId === item.id || l.itemName.toLowerCase().trim() === item.name.toLowerCase().trim())) {
        inSales++;
      }
    });

    (data.purchaseInvoices || []).forEach(bill => {
      if (bill.items.some(l => l.itemId === item.id || l.itemName.toLowerCase().trim() === item.name.toLowerCase().trim())) {
        inPurchases++;
      }
    });

    return { inSales, inPurchases };
  };

  // Perform Quick Stock Adjustment
  const handlePerformStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAdjustItem) return;

    const newQty = Number(adjustNewQty);
    const commentText = adjustNotes.trim() || `${adjustReason} (${quickAdjustItem.name}: ${quickAdjustItem.currentStock || 0} -> ${newQty})`;
    if (onStockAdjustment) {
      onStockAdjustment(quickAdjustItem.id, newQty, adjustReason, commentText, adjustGodownId);
    } else if (onUpdateItem) {
      onUpdateItem({
        ...quickAdjustItem,
        currentStock: newQty,
        closingStockValue: undefined,
        importedClosingQty: undefined
      });
    }

    setQuickAdjustItem(null);
  };

  // Batch Negative Stock Clearance Handler
  const handleApplyBatchNegativeClearance = (e: React.FormEvent) => {
    e.preventDefault();
    setNegBatchNotice(null);

    const selectedNegItems = negativeStockItems.filter((it) => negSelectedIds[it.id]);
    if (selectedNegItems.length === 0) {
      setNegBatchNotice({
        type: 'err',
        text: isHindi ? 'कृपया कम से कम एक नेगेटिव स्टॉक आइटम चुनें।' : 'Please select at least one negative stock item to clear.'
      });
      return;
    }

    if (!negBatchComment.trim()) {
      setNegBatchNotice({
        type: 'err',
        text: isHindi
          ? 'कृपया कमेंट/कारण लिखें कि किस स्टॉक में और क्यों एडजस्टमेंट किया जा रहा है।'
          : 'Please enter a comment explaining which stock is being adjusted and why.'
      });
      return;
    }

    const batchPayload = selectedNegItems.map((it) => {
      const targetQty = Math.round((Number(negTargetQtys[it.id] ?? 0) || 0) * 1000) / 1000;
      return {
        itemId: it.id,
        newQuantity: targetQty,
        reason: negBatchReason,
        notes: `${negBatchComment.trim()} [${it.name}: ${it.currentStock || 0} → ${targetQty} ${it.unit || 'PCS'}]`,
        godownId: it.defaultGodownId || resolveDefaultGodownId(godowns)
      };
    });

    if (onBatchStockAdjustment) {
      onBatchStockAdjustment(batchPayload);
    } else if (onStockAdjustment) {
      batchPayload.forEach((adj) =>
        onStockAdjustment(adj.itemId, adj.newQuantity, adj.reason, adj.notes, adj.godownId)
      );
    }

    setNegBatchNotice({
      type: 'ok',
      text: isHindi
        ? `✅ ${batchPayload.length} नेगेटिव स्टॉक आइटम सफलतापूर्वक एडजस्ट और क्लियर किए गए!`
        : `✅ Successfully adjusted & cleared ${batchPayload.length} negative stock item(s)!`
    });
    setNegBatchComment('');
  };

  // Single Particular Stock Adjustment Handler
  const selectedSingleAdjItem = useMemo(
    () => data.items.find((i) => i.id === singleAdjItemId) || null,
    [data.items, singleAdjItemId]
  );

  const singleAdjSelectableItems = useMemo(() => {
    const q = singleAdjSearch.trim().toLowerCase();
    const list = !q
      ? data.items
      : data.items.filter(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            (it.code || '').toLowerCase().includes(q) ||
            (it.category || '').toLowerCase().includes(q)
        );
    // Keep currently selected item reachable even if filter changes
    return list;
  }, [data.items, singleAdjSearch]);

  const handleApplySingleStockAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    setSingleAdjNotice(null);

    if (!selectedSingleAdjItem) {
      setSingleAdjNotice({
        type: 'err',
        text: isHindi ? 'कृपया कोई एक स्टॉक आइटम चुनें।' : 'Please select an item to adjust.'
      });
      return;
    }

    if (!singleAdjComment.trim()) {
      setSingleAdjNotice({
        type: 'err',
        text: isHindi
          ? 'कृपया विस्तृत कमेंट लिखें कि यह स्टॉक एडजस्टमेंट किस आइटम और किस कारण से किया जा रहा है।'
          : 'Please enter a comment explaining this stock adjustment and why it is needed.'
      });
      return;
    }

    const oldQty = Number(selectedSingleAdjItem.currentStock || 0);
    const inputVal = Number(singleAdjQtyInput) || 0;
    const computedNewQty =
      singleAdjMode === 'SET_FINAL'
        ? Math.round(inputVal * 1000) / 1000
        : Math.round((oldQty + inputVal) * 1000) / 1000;

    if (onStockAdjustment) {
      onStockAdjustment(
        selectedSingleAdjItem.id,
        computedNewQty,
        singleAdjReason,
        singleAdjComment.trim(),
        singleAdjGodownId
      );
    }

    setSingleAdjNotice({
      type: 'ok',
      text: isHindi
        ? `✅ "${selectedSingleAdjItem.name}" का स्टॉक ${oldQty} से ${computedNewQty} ${selectedSingleAdjItem.unit || 'PCS'} अपडेट हो गया।`
        : `✅ Adjusted "${selectedSingleAdjItem.name}": ${oldQty} → ${computedNewQty} ${selectedSingleAdjItem.unit || 'PCS'}.`
    });
    setSingleAdjComment('');
    setSingleAdjQtyInput(computedNewQty);
  };

  const filteredAdjustmentHistory = useMemo(() => {
    const q = adjHistorySearch.trim().toLowerCase();
    const list = (data.stockAdjustments || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!q) return list;
    return list.filter(
      (adj) =>
        (adj.itemName || '').toLowerCase().includes(q) ||
        (adj.itemCode || '').toLowerCase().includes(q) ||
        (adj.reason || '').toLowerCase().includes(q) ||
        (adj.notes || '').toLowerCase().includes(q) ||
        (adj.godownName || '').toLowerCase().includes(q) ||
        (adj.adjustedBy || '').toLowerCase().includes(q)
    );
  }, [data.stockAdjustments, adjHistorySearch]);

  const exportAdjustmentRegisterCsv = () => {
    const headers = ['Date', 'Item Name', 'Item Code', 'Godown', 'Previous Stock', 'New Stock', 'Difference', 'Reason', 'Comments', 'Adjusted By'];
    const rows = filteredAdjustmentHistory.map((adj) => [
      adj.date,
      adj.itemName,
      adj.itemCode || '-',
      adj.godownName || 'Main Godown',
      adj.previousStock,
      adj.newStock,
      adj.difference,
      adj.reason,
      adj.notes || '',
      adj.adjustedBy || 'Admin'
    ]);
    const csv = '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Stock_Adjustments_Register_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Selected Item for Movements View
  const selectedLedgerItem = useMemo(() => {
    return data.items.find(i => i.id === selectedLedgerItemId) || data.items[0];
  }, [data.items, selectedLedgerItemId]);

  const selectedItemMovements = useMemo(() => {
    if (!selectedLedgerItem) return [];
    return getItemStockMovements(selectedLedgerItem, data);
  }, [selectedLedgerItem, data]);

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-3.5 w-full md:overflow-hidden font-sans">
      {/* Top Header & Overview Bar */}
      <div className="shrink-0 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 bg-slate-900 p-4 rounded-3xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-inner">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight flex flex-wrap items-center gap-2">
                <span>{isHindi ? 'इन्वेंटरी, बैच एवं मल्टी-गोदाम' : 'Inventory, Batch & Multi-Godown'}</span>
                {valuationReport.lowStockCount > 0 && (
                  <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    <span>{valuationReport.lowStockCount} {isHindi ? 'रीऑर्डर' : 'Reorder'}</span>
                  </span>
                )}
                {(batchStats.expiredBatchesCount + batchStats.expiringSoonCount) > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('batches')}
                    className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 hover:bg-rose-500/30 transition"
                  >
                    <Clock className="w-3 h-3" />
                    <span>
                      {batchStats.expiredBatchesCount > 0
                        ? `${batchStats.expiredBatchesCount} Expired`
                        : `${batchStats.expiringSoonCount} Expiring <=30d`}
                    </span>
                  </button>
                )}
              </h1>
              <p className="text-sm text-slate-400">
                {isHindi 
                  ? 'रियल-टाइम स्टॉक, बारकोड लेबल, FEFO बैच/एक्सपायरी एवं मल्टी-गोदाम ट्रांसफर' 
                  : 'Real-time stock, barcode stickers, FEFO batch/expiry alerts & multi-godown transfers'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          {onOpenBarcodePos && (
            <button
              onClick={onOpenBarcodePos}
              className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold px-3.5 py-2.5 rounded-xl shadow-lg shadow-cyan-600/25 flex items-center gap-1.5 text-xs transition"
            >
              <ScanBarcode className="w-4 h-4" />
              <span>{isHindi ? 'बारकोड POS' : 'Barcode POS'}</span>
            </button>
          )}
          {perms.canCreateEditMasters && (
            <>
              <button
                onClick={openAddModal}
                className="flex-1 sm:flex-initial bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>{isHindi ? 'नया आइटम जोड़ें' : 'Add New Item'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab('adjustments')}
                className={`px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 text-xs transition cursor-pointer border ${
                  negativeStockItems.length > 0
                    ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40 shadow'
                    : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
                }`}
                title={isHindi ? 'नेगेटिव स्टॉक सुधार व स्टॉक एडजस्टमेंट (F2)' : 'Stock Adjustment & Negative Stock Clearance (F2)'}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>{isHindi ? 'स्टॉक एडजस्टमेंट' : 'Stock Adjustment'}</span>
                {negativeStockItems.length > 0 && (
                  <span className="bg-rose-500 text-white font-black text-[10px] px-1.5 py-0.2 rounded-full">
                    {negativeStockItems.length} -ve
                  </span>
                )}
              </button>
            </>
          )}

          {perms.canExportData && (
            <>
              <button
                onClick={() => printInventoryValuationReport(data, valuationMethod, isHindi)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 text-xs transition"
              >
                <Printer className="w-3.5 h-3.5 text-indigo-400" />
                <span>{isHindi ? 'रिपोर्ट प्रिंट' : 'Print Statement'}</span>
              </button>

              <button
                onClick={() => exportInventoryValuationCSV(data, valuationMethod)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-2.5 rounded-xl font-bold flex items-center gap-1.5 text-xs transition"
                title="Download Inventory Valuation CSV"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>{isHindi ? 'CSV' : 'Export'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Valuation (Cost Basis) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>{isHindi ? 'कुल स्टॉक लागत मूल्य' : 'Total Inventory Valuation (Cost)'}</span>
            <Tag className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums tracking-tight">
            {formatCurrency(valuationReport.totalCostValuation, currency)}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-0.5">
            <span className="text-indigo-400 font-bold tabular-nums">{valuationReport.totalStockUnits}</span>
            <span>{isHindi ? 'कुल भौतिक इकाइयां (Units on Hand)' : 'Total Physical Units'}</span>
          </div>
        </div>

        {/* Card 2: Retail Realizable Sales Value */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>{isHindi ? 'बिक्री मूल्य (Realizable Value)' : 'Retail Realizable Value'}</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400 font-mono tabular-nums tracking-tight">
            {formatCurrency(valuationReport.totalSalesValuation, currency)}
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-0.5">
            <span className="text-emerald-400 font-bold tabular-nums">+{formatCurrency(valuationReport.totalPotentialProfit, currency)}</span>
            <span>({valuationReport.overallProfitMarginPercent.toFixed(1)}% {isHindi ? 'मार्जिन' : 'Margin'})</span>
          </div>
        </div>

        {/* Card 3: Reorder & Low Stock Alerts */}
        <div 
          onClick={() => setActiveSubTab('reorder')}
          className={`border rounded-2xl p-3.5 shadow-lg space-y-1 cursor-pointer transition ${
            valuationReport.lowStockCount > 0 
              ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' 
              : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>{isHindi ? 'रीऑर्डर एवं न्यूनतम स्तर' : 'Reorder Point Alerts'}</span>
            <AlertTriangle className={`w-4 h-4 ${valuationReport.lowStockCount > 0 ? 'text-amber-400 animate-pulse' : 'text-slate-500'}`} />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono tabular-nums tracking-tight flex items-center gap-2">
            <span>{valuationReport.lowStockCount}</span>
            <span className="text-xs font-sans text-slate-300 font-medium">
              {isHindi ? 'आइटम तुरंत मंगवाएं' : 'Items to Reorder'}
            </span>
          </div>
          <div className="text-xs text-amber-300 font-medium pt-0.5 truncate">
            {valuationReport.lowStockCount > 0 
              ? `${isHindi ? 'अनुमानित लागत:' : 'Est. Restock:'} ${formatCurrency(valuationReport.totalRestockCostRequired, currency)}`
              : (isHindi ? '✅ सभी आइटम पर्याप्त स्टॉक में हैं' : '✅ All stock levels adequate')}
          </div>
        </div>

        {/* Card 4: Total Items & Categories */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 shadow-lg space-y-1 relative overflow-hidden">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>{isHindi ? 'सक्रिय मास्टर्स एवं श्रेणियां' : 'Master Items & Categories'}</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white font-mono tabular-nums tracking-tight">
            {valuationReport.totalItems} <span className="text-xs font-normal text-slate-400 font-sans">{isHindi ? 'आइटम' : 'Items'}</span>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-1.5 pt-0.5">
            <span className="text-indigo-400 font-bold tabular-nums">{distinctCategories.length}</span>
            <span>{isHindi ? 'श्रेणियां (Categories) पंजीकृत' : 'Categories Registered'}</span>
          </div>
        </div>
      </div>

      {/* Sub-Tabs Navigation */}
      <div className="shrink-0 flex border-b border-slate-800 overflow-x-auto gap-2 text-xs font-bold scrollbar-none">
        <button
          onClick={() => setActiveSubTab('items')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeSubTab === 'items'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>{isHindi ? 'स्टॉक आइटम मास्टर (All Items)' : 'Stock Items Master'}</span>
          <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{data.items.length}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('reorder')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeSubTab === 'reorder'
              ? 'border-amber-500 text-amber-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>{isHindi ? 'रीऑर्डर एवं न्यूनतम स्टॉक अलर्ट' : 'Reorder Point Alerts'}</span>
          {valuationReport.lowStockCount > 0 && (
            <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-1.5 py-0.5 rounded-full">
              {valuationReport.lowStockCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveSubTab('valuation')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeSubTab === 'valuation'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>{isHindi ? 'इन्वेंटरी मूल्यांकन रिपोर्ट (Valuation)' : 'Inventory Valuation Reports'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('movements')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeSubTab === 'movements'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-4 h-4" />
          <span>{isHindi ? 'स्टॉक मूवमेंट लेजर (Stock Ledger)' : 'Stock Movement Ledger'}</span>
        </button>

        <button
          onClick={() => setActiveSubTab('batches')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 ${
            activeSubTab === 'batches'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>{isHindi ? 'बैच एवं एक्सपायरी (FEFO)' : 'Batch & Expiry Tracker'}</span>
          {(batchStats.expiredBatchesCount + batchStats.expiringSoonCount) > 0 && (
            <span className="bg-rose-500 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full">
              {batchStats.expiredBatchesCount + batchStats.expiringSoonCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('godowns')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeSubTab === 'godowns'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>{isHindi ? 'मल्टी-गोदाम एवं ट्रांसफर' : 'Multi-Godown & Transfers'}</span>
          <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">{godowns.length}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('adjustments')}
          className={`pb-3 px-3.5 border-b-2 transition flex items-center gap-2 shrink-0 cursor-pointer ${
            activeSubTab === 'adjustments'
              ? 'border-rose-500 text-rose-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>{isHindi ? 'स्टॉक एडजस्टमेंट (Negative Stock Fix)' : 'Stock Adjustment'}</span>
          {negativeStockItems.length > 0 ? (
            <span className="bg-rose-500 text-white font-black text-[10px] px-1.5 py-0.5 rounded-full">
              {negativeStockItems.length}
            </span>
          ) : (
            <span className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full">
              {(data.stockAdjustments || []).length}
            </span>
          )}
        </button>
      </div>

      {/* VIEW 1: All Stock Items Master */}
      {activeSubTab === 'items' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 md:overflow-hidden">
          {/* Search & Filter Bar */}
          <div className="shrink-0 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-2xl border border-slate-800">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isHindi ? 'नाम, कोड, एचएसएन या वेयरहाउस लोकेशन से खोजें...' : 'Search by name, code, HSN, location...'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500"
              />
              {search && (
                <button 
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Category Filter */}
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none cursor-pointer"
              >
                <option value="ALL">{isHindi ? 'सभी श्रेणियां (All Categories)' : 'All Categories'}</option>
                {distinctCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              {/* Stock Status Filter */}
              <select
                value={stockStatusFilter}
                onChange={(e) => setStockStatusFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none cursor-pointer"
              >
                <option value="ALL">{isHindi ? 'सभी स्टॉक स्थिति' : 'All Stock Status'}</option>
                <option value="NEGATIVE_STOCK">{isHindi ? `नेगेटिव स्टॉक (< 0 Qty) (${negativeStockItems.length})` : `Negative Stock (< 0 Qty) (${negativeStockItems.length})`}</option>
                <option value="IN_STOCK">{isHindi ? 'पर्याप्त स्टॉक (> Reorder)' : 'In Stock (> Reorder)'}</option>
                <option value="LOW_STOCK">{isHindi ? 'कम स्टॉक (At or <= Reorder)' : 'Low Stock (<= Reorder)'}</option>
                <option value="OUT_OF_STOCK">{isHindi ? 'आउट ऑफ स्टॉक (<= 0 Qty)' : 'Out of Stock (<= 0 Qty)'}</option>
              </select>
            </div>
          </div>

          {/* Items Table */}
          <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse text-sm text-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                    <th className="py-3.5 px-4 w-12 text-center">#</th>
                    <th className="py-3.5 px-4">{isHindi ? 'आइटम विवरण' : 'Item Details'}</th>
                    <th className="py-3.5 px-3 text-center">{isHindi ? 'इकाई' : 'Unit'}</th>
                    <th className="py-3.5 px-3 text-right">{isHindi ? 'लागत दर (Cost)' : 'Cost Price'}</th>
                    <th className="py-3.5 px-3 text-right">{isHindi ? 'बिक्री दर (Sales)' : 'Selling Price'}</th>
                    <th className="py-3.5 px-4 text-center">{isHindi ? 'वर्तमान स्टॉक स्तर' : 'Stock Quantity'}</th>
                    <th className="py-3.5 px-3 text-right">{isHindi ? 'रीऑर्डर स्तर' : 'Reorder Point'}</th>
                    <th className="py-3.5 px-4 text-right">{isHindi ? 'कुल मूल्यांकन (Cost)' : 'Total Valuation'}</th>
                    <th className="py-3.5 px-4 text-center">{isHindi ? 'कार्रवाई' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>{isHindi ? 'कोई आइटम नहीं मिला।' : 'No inventory items match your search or filter.'}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item, idx) => {
                      const stock = Number(item.currentStock || 0);
                      const reorderPoint = Number(item.minStockLevel || item.minStockAlert || 5);
                      const isLow = stock > 0 && stock <= reorderPoint;
                      const isOut = stock <= 0;
                      const costValuation = stock * (Number(item.purchasePrice) || 0);
                      const salesValuation = stock * (Number(item.salesPrice || item.sellingPrice) || 0);

                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 text-center text-slate-400 font-mono text-xs tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{item.name}</span>
                              {isOut ? (
                                <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  {isHindi ? 'आउट ऑफ स्टॉक' : 'OUT OF STOCK'}
                                </span>
                              ) : isLow ? (
                                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded animate-pulse">
                                  {isHindi ? 'कम स्टॉक' : 'LOW STOCK'}
                                </span>
                              ) : null}
                            </div>
                            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                              {item.code && <span className="font-mono text-indigo-400">{item.code}</span>}
                              {item.barcode && (
                                <span className="font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-1.5 rounded flex items-center gap-1">
                                  <Barcode className="w-3 h-3" />
                                  {item.barcode}
                                </span>
                              )}
                              {item.hsnSacCode && <span>• HSN: {item.hsnSacCode}</span>}
                              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-slate-200 font-medium">
                                {item.category || 'General Goods'}
                              </span>
                              {(item.location || godowns.length > 0) && (
                                <span className="text-slate-400 flex items-center gap-0.5">
                                  <Warehouse className="w-3 h-3" />
                                  <span>{godowns.find(g => g.id === item.defaultGodownId)?.name || item.location || 'Main Godown'}</span>
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-bold text-slate-200">
                            {item.unit || 'PCS'}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-200">
                            {formatCurrency(item.purchasePrice || 0, currency)}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">
                            <div className="font-bold text-emerald-400">
                              {formatCurrency(item.salesPrice || item.sellingPrice || 0, currency)}
                            </div>
                            {(item.wholesalePrice || item.mrp) && (
                              <div className="text-[10px] text-slate-400 mt-0.5 space-x-1.5">
                                {item.wholesalePrice && item.wholesalePrice > 0 && (
                                  <span className="text-cyan-300">W: {formatCurrency(item.wholesalePrice, currency)}</span>
                                )}
                                {item.mrp && item.mrp > 0 && (
                                  <span>MRP: {formatCurrency(item.mrp, currency)}</span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className={`font-mono tabular-nums font-bold text-sm ${
                                isOut ? 'text-rose-400' : (isLow ? 'text-amber-400' : 'text-white')
                              }`}>
                                {stock} <span className="text-xs text-slate-400 font-normal">{item.unit || 'PCS'}</span>
                              </span>
                              {/* Stock Health Bar */}
                              <div className="w-20 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                                <div 
                                  className={`h-full rounded-full ${
                                    isOut ? 'bg-rose-500' : (isLow ? 'bg-amber-500' : 'bg-emerald-500')
                                  }`}
                                  style={{ width: `${Math.min(100, Math.max(5, (stock / (reorderPoint * 3 || 15)) * 100))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300 font-medium">
                            {reorderPoint} {item.unit || 'PCS'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-100">
                            {formatCurrency(costValuation, currency)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Stock Movement Ledger Shortcut */}
                              <button
                                onClick={() => {
                                  setSelectedLedgerItemId(item.id);
                                  setShowItemLedgerModal(item);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 transition"
                                title={isHindi ? 'स्टॉक लेजर देखें' : 'View Stock Ledger'}
                              >
                                <History className="w-3.5 h-3.5" />
                              </button>

                              {/* Print Barcode Label */}
                              <button
                                onClick={() =>
                                  setBarcodePrintTarget({
                                    itemName: item.name,
                                    itemCode: item.code,
                                    barcode: item.barcode || generateEan13Barcode(item.code || item.name),
                                    price: item.salesPrice || item.sellingPrice,
                                    wholesalePrice: item.wholesalePrice,
                                    mrp: item.mrp,
                                    unit: item.unit,
                                    godownName: godowns.find(g => g.id === item.defaultGodownId)?.name || item.location,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-cyan-400 transition"
                                title={isHindi ? 'बारकोड लेबल प्रिंट' : 'Print Barcode Stickers'}
                              >
                                <Barcode className="w-3.5 h-3.5" />
                              </button>

                              {/* Quick Adjustment */}
                              {perms.canCreateEditMasters && (
                                <button
                                  onClick={() => {
                                    setQuickAdjustItem(item);
                                    setAdjustNewQty(item.currentStock || 0);
                                    setAdjustGodownId(item.defaultGodownId || resolveDefaultGodownId(godowns));
                                    setAdjustReason('Physical Count Discrepancy');
                                    setAdjustNotes('');
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                                  title={isHindi ? 'त्वरित स्टॉक समायोजन' : 'Adjust Stock'}
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Edit Item */}
                              {perms.canCreateEditMasters && (
                                <button
                                  onClick={() => openEditModal(item)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                                  title={isHindi ? 'आइटम संपादित करें' : 'Edit Item'}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete Item */}
                              {perms.canDeleteRecords && (
                                <button
                                  onClick={() => setDeleteConfirmItem(item)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                                  title={isHindi ? 'आइटम हटाएं' : 'Delete Item'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: Reorder Point & Low Stock Alerts */}
      {activeSubTab === 'reorder' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 md:overflow-hidden">
          <div className="shrink-0 bg-amber-500/10 border border-amber-500/30 p-4 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-sm">
                  {isHindi ? 'रीऑर्डर एवं न्यूनतम स्टॉक अलर्ट प्रणाली' : 'Automated Reorder Point Alerts'}
                </h3>
                <p className="text-xs text-slate-300">
                  {isHindi 
                    ? `कुल ${lowStockItems.length} आइटम न्यूनतम स्तर (Reorder Point) से नीचे हैं। उत्पादन या बिक्री न रुके, इसलिए समय पर खरीद ऑर्डर जारी करें।`
                    : `${lowStockItems.length} items have reached or fallen below their reorder points. Place purchase orders to prevent stock-outs.`}
                </p>
              </div>
            </div>

            {onNavigateToPurchases && (
              <button
                onClick={onNavigateToPurchases}
                className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-1.5 text-xs transition shrink-0"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>{isHindi ? 'खरीद बिल / PO बनाएं' : 'Create Purchase Order / Bill'}</span>
              </button>
            )}
          </div>

          {lowStockItems.length === 0 ? (
            <div className="flex-1 min-h-0 bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-2 flex flex-col items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <div className="text-base font-bold text-white">
                {isHindi ? 'शानदार! कोई भी आइटम रीऑर्डर स्तर से नीचे नहीं है।' : 'Great! All inventory levels are above reorder points.'}
              </div>
              <p className="text-xs text-slate-400">
                {isHindi 
                  ? 'सभी स्टॉक पर्याप्त मात्रा में उपलब्ध हैं। जब भी कोई आइटम अपने न्यूनतम स्तर पर पहुँचेगा, वह यहाँ तुरंत अलर्ट होगा।' 
                  : 'All stock levels are optimal. As soon as an item touches its reorder threshold, it will appear here.'}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-left border-collapse text-sm text-slate-200">
                  <thead className="sticky top-0 z-10 bg-slate-800">
                    <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                      <th className="py-3.5 px-4 w-12 text-center">#</th>
                      <th className="py-3.5 px-4">{isHindi ? 'आइटम नाम एवं कोड' : 'Item Name & Code'}</th>
                      <th className="py-3.5 px-3 text-center">{isHindi ? 'वर्तमान स्टॉक' : 'Current Stock'}</th>
                      <th className="py-3.5 px-3 text-center">{isHindi ? 'रीऑर्डर स्तर' : 'Reorder Level'}</th>
                      <th className="py-3.5 px-3 text-center">{isHindi ? 'कमी (Deficit)' : 'Shortage'}</th>
                      <th className="py-3.5 px-3 text-center">{isHindi ? 'सुझाई गई खरीद मात्रा' : 'Suggested Reorder Qty'}</th>
                      <th className="py-3.5 px-3 text-right">{isHindi ? 'लागत दर' : 'Unit Cost'}</th>
                      <th className="py-3.5 px-4 text-right">{isHindi ? 'अनुमानित रीस्टॉक लागत' : 'Est. Restock Cost'}</th>
                      <th className="py-3.5 px-4 text-center">{isHindi ? 'त्वरित कार्रवाई' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {lowStockItems.map((row, idx) => {
                      const item = row.item;
                      const shortage = Math.max(0, row.reorderPoint - row.currentStock);
                      const suggestedBatch = row.reorderQuantity || Math.max(row.reorderPoint * 2, 10);
                      const restockCost = (shortage + suggestedBatch) * row.costRate;

                      return (
                        <tr key={item.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4 text-center font-mono text-slate-400 tabular-nums">{idx + 1}</td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>{item.name}</span>
                              {row.isOutOfStock ? (
                                <span className="bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  {isHindi ? 'शून्य स्टॉक' : 'NIL STOCK'}
                                </span>
                              ) : (
                                <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded">
                                  {isHindi ? 'न्यूनतम स्तर पर' : 'BELOW MIN'}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 font-mono mt-0.5">
                              {item.code} • {item.category} • Location: {item.location || 'Godown'}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-rose-400">
                            {row.currentStock} {row.unit}
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-slate-200">
                            {row.reorderPoint} {row.unit}
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-amber-400">
                            -{shortage} {row.unit}
                          </td>
                          <td className="py-3 px-3 text-center font-mono tabular-nums font-bold text-indigo-400">
                            +{suggestedBatch} {row.unit}
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums font-medium text-slate-200">
                            {formatCurrency(row.costRate, currency)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-amber-300">
                            {formatCurrency(restockCost, currency)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {perms.canCreateEditMasters ? (
                              <button
                                onClick={() => {
                                  setQuickAdjustItem(item);
                                  setAdjustNewQty((item.currentStock || 0) + suggestedBatch);
                                  setAdjustReason('Restock Inflow');
                                  setAdjustNotes('Quick Restock');
                                }}
                                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition"
                              >
                                {isHindi ? 'त्वरित स्टॉक जोड़ें' : 'Restock Now'}
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: Inventory Valuation Reports */}
      {activeSubTab === 'valuation' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 md:overflow-hidden">
          {/* Valuation Method Switcher & Control Bar */}
          <div className="shrink-0 bg-slate-900 p-4 rounded-3xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-400" />
                <span>{isHindi ? 'मूल्यांकन पद्धति चुनें (Inventory Valuation Method):' : 'Select Inventory Valuation Method:'}</span>
              </div>
              <p className="text-xs text-slate-400">
                {isHindi 
                  ? 'वित्तीय विवरणों, बैलेंस शीट एवं टैक्स ऑडिट के लिए मान्य सभी प्रमुख मूल्यांकन विधियों का समर्थन'
                  : 'Supported for official balance sheets, income tax returns, and GST audits'}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 bg-slate-950 p-1 rounded-2xl border border-slate-800 text-xs font-bold gap-1 w-full md:w-auto">
              <button
                onClick={() => setValuationMethod('COST')}
                className={`py-2 px-3 rounded-xl transition text-center ${
                  valuationMethod === 'COST'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isHindi ? 'लागत दर (Cost Price)' : 'Cost Price'}
              </button>

              <button
                onClick={() => setValuationMethod('SALES')}
                className={`py-2 px-3 rounded-xl transition text-center ${
                  valuationMethod === 'SALES'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isHindi ? 'बिक्री दर (Sales Value)' : 'Sales Value'}
              </button>

              <button
                onClick={() => setValuationMethod('WAC')}
                className={`py-2 px-3 rounded-xl transition text-center ${
                  valuationMethod === 'WAC'
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isHindi ? 'भारित औसत (WAC)' : 'Weighted Avg (WAC)'}
              </button>

              <button
                onClick={() => setValuationMethod('FIFO')}
                className={`py-2 px-3 rounded-xl transition text-center ${
                  valuationMethod === 'FIFO'
                    ? 'bg-purple-600 text-white shadow'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {isHindi ? 'फीफो (FIFO)' : 'FIFO Method'}
              </button>
            </div>
          </div>

          {/* Category-Wise Valuation Breakdown */}
          <div className="shrink-0 max-h-44 overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl space-y-3">
            <h3 className="font-bold text-white text-sm flex items-center justify-between">
              <span>{isHindi ? 'श्रेणी-वार स्टॉक मूल्यांकन सारांश (Category Breakdown)' : 'Category-wise Stock Valuation Breakdown'}</span>
              <span className="text-xs font-mono tabular-nums text-indigo-400 font-bold">
                {isHindi ? 'कुल योग: ' : 'Total: '} {formatCurrency(valuationReport.totalCostValuation, currency)}
              </span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {valuationReport.categories.map(cat => (
                <div key={cat.category} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">{cat.category}</span>
                    <span className="text-xs font-mono text-slate-400">{cat.itemsCount} {isHindi ? 'आइटम' : 'Items'}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-black font-mono tabular-nums text-indigo-400">
                      {formatCurrency(cat.totalCostValuation, currency)}
                    </span>
                    <span className="text-xs font-mono tabular-nums font-bold text-emerald-400">
                      {cat.sharePercent.toFixed(1)}% Share
                    </span>
                  </div>
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full rounded-full" 
                      style={{ width: `${Math.min(100, Math.max(3, cat.sharePercent))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Valuation Table */}
          <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="shrink-0 p-3.5 px-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-white text-sm">
                  {isHindi ? 'विस्तृत इन्वेंटरी मूल्यांकन तालिका' : 'Comprehensive Inventory Valuation Register'}
                </h4>
                <p className="text-xs text-slate-400">
                  {isHindi 
                    ? `पद्धति: ${valuationMethod} अनुसार कुल ${valuationReport.items.length} आइटम` 
                    : `Evaluated using ${valuationMethod} for ${valuationReport.items.length} items`}
                </p>
              </div>

              {perms.canExportData && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => printInventoryValuationReport(data, valuationMethod, isHindi)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'विवरण प्रिंट करें' : 'Print Statement'}</span>
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse text-sm text-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                    <th className="py-3 px-4 w-12 text-center">#</th>
                    <th className="py-3 px-4">{isHindi ? 'आइटम नाम & कोड' : 'Item Name & Code'}</th>
                    <th className="py-3 px-3 text-center">{isHindi ? 'श्रेणी' : 'Category'}</th>
                    <th className="py-3 px-3 text-center">{isHindi ? 'स्टॉक' : 'Stock'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'मूल्यांकन दर' : 'Val. Rate'}</th>
                    <th className="py-3 px-4 text-right">{isHindi ? 'कुल मूल्यांकन राशि' : 'Valuation Amount'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'बिक्री दर' : 'Sales Rate'}</th>
                    <th className="py-3 px-4 text-right">{isHindi ? 'संभावित बिक्री मूल्य' : 'Realizable Sales Value'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'मार्जिन %' : 'Margin %'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {valuationReport.items.map((row, idx) => (
                    <tr key={row.item.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-4 text-center font-mono text-slate-400 tabular-nums">{idx + 1}</td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-white">{row.item.name}</div>
                        <div className="text-xs text-slate-400 font-mono">{row.item.code || '-'} • HSN: {row.item.hsnSacCode || '-'}</div>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-300">{row.category}</td>
                      <td className="py-2.5 px-3 text-center font-mono tabular-nums font-bold text-white">
                        {row.currentStock} {row.unit}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                        {formatCurrency(row.effectiveRate, currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-indigo-400">
                        {formatCurrency(row.valuationAmount, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                        {formatCurrency(row.salesRate, currency)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono tabular-nums font-bold text-emerald-400">
                        {formatCurrency(row.salesValuationAmount, currency)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-emerald-400 font-bold">
                        {row.profitMarginPercent.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {/* Total Summary Row */}
                  <tr className="sticky bottom-0 z-10 bg-slate-950 font-bold text-white border-t-2 border-slate-700">
                    <td colSpan={3} className="py-3.5 px-4 text-right uppercase tracking-wider text-xs">
                      {isHindi ? 'कुल योग (Total):' : 'Grand Total:'}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono tabular-nums text-indigo-400">
                      {valuationReport.totalStockUnits}
                    </td>
                    <td></td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-indigo-400 text-sm">
                      {formatCurrency(valuationReport.totalCostValuation, currency)}
                    </td>
                    <td></td>
                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400 text-sm">
                      {formatCurrency(valuationReport.totalSalesValuation, currency)}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-emerald-400">
                      {valuationReport.overallProfitMarginPercent.toFixed(1)}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 4: Stock Movement History / Stock Ledger */}
      {activeSubTab === 'movements' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 md:overflow-hidden">
          {/* Item Selector Header */}
          <div className="shrink-0 bg-slate-900 p-4 rounded-3xl border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <History className="w-5 h-5 text-indigo-400" />
              <div className="flex-1">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  {isHindi ? 'स्टॉक आइटम चुनें (Select Stock Item):' : 'Select Item to View Movements:'}
                </label>
                <select
                  value={selectedLedgerItemId}
                  onChange={(e) => setSelectedLedgerItemId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white font-bold focus:outline-none min-w-[260px]"
                >
                  {data.items.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.code || 'NO-CODE'}) - In-Stock: {item.currentStock || 0} {item.unit || 'PCS'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedLedgerItem && perms.canExportData && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => printStockLedger(selectedLedgerItem, data, isHindi)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'स्टॉक लेजर प्रिंट' : 'Print Stock Ledger'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Movement Ledger Table */}
          {selectedLedgerItem && (
            <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
              <div className="shrink-0 p-3.5 px-4 bg-slate-950/60 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold text-white text-sm">{selectedLedgerItem.name}</h3>
                  <p className="text-xs text-slate-400 font-mono">
                    Code: {selectedLedgerItem.code || '-'} • HSN: {selectedLedgerItem.hsnSacCode || '-'} • Category: {selectedLedgerItem.category}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm font-mono tabular-nums">
                  <div>
                    <span className="text-slate-400">{isHindi ? 'वर्तमान स्टॉक: ' : 'Closing Stock: '}</span>
                    <span className="text-white font-bold">{selectedLedgerItem.currentStock || 0} {selectedLedgerItem.unit || 'PCS'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">{isHindi ? 'मूल्यांकन: ' : 'Valuation: '}</span>
                    <span className="text-indigo-400 font-bold">
                      {formatCurrency((selectedLedgerItem.currentStock || 0) * (selectedLedgerItem.purchasePrice || 0), currency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-left border-collapse text-sm text-slate-200">
                  <thead className="sticky top-0 z-10 bg-slate-800">
                    <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                      <th className="py-3 px-4">{isHindi ? 'दिनांक' : 'Date'}</th>
                      <th className="py-3 px-3">{isHindi ? 'प्रकार (Type)' : 'Voucher Type'}</th>
                      <th className="py-3 px-3">{isHindi ? 'संदर्भ क्रमांक' : 'Ref / Invoice #'}</th>
                      <th className="py-3 px-4">{isHindi ? 'पार्टी विवरण / विवरण' : 'Party / Particulars'}</th>
                      <th className="py-3 px-3 text-right">{isHindi ? 'आवक (+ Inflow)' : 'Inflow (+)'}</th>
                      <th className="py-3 px-3 text-right">{isHindi ? 'जावक (- Outflow)' : 'Outflow (-)'}</th>
                      <th className="py-3 px-3 text-right">{isHindi ? 'दर (Rate)' : 'Rate'}</th>
                      <th className="py-3 px-4 text-right">{isHindi ? 'कुल राशि' : 'Amount'}</th>
                      <th className="py-3 px-4 text-right">{isHindi ? 'अंतिम शेष' : 'Running Balance'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {selectedItemMovements.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          {isHindi ? 'इस आइटम के लिए अभी कोई लेनदेन दर्ज नहीं हुआ है।' : 'No transactions recorded for this item yet.'}
                        </td>
                      </tr>
                    ) : (
                      selectedItemMovements.map(m => (
                        <tr key={m.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">{m.date}</td>
                          <td className="py-2.5 px-3">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                              m.type === 'PURCHASE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                              m.type === 'SALE' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' :
                              m.type === 'OPENING' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                              m.type === 'SALES_RETURN' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                              'bg-slate-800 text-slate-200'
                            }`}>
                              {m.type}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-white font-bold">{m.refNumber}</td>
                          <td className="py-2.5 px-4 text-slate-200">{m.partyName || '-'}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-400">
                            {m.inflow > 0 ? `+${m.inflow}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-rose-400">
                            {m.outflow > 0 ? `-${m.outflow}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                            {m.rate > 0 ? formatCurrency(m.rate, currency) : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                            {m.amount > 0 ? formatCurrency(m.amount, currency) : '-'}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums font-black text-indigo-300">
                            {m.runningBalance} {selectedLedgerItem.unit || 'PCS'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 5: Batch & Expiry Tracker (FEFO) */}
      {activeSubTab === 'batches' && (
        <div className="flex-1 min-h-0 flex flex-col gap-3 md:overflow-hidden">
          <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3.5 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-rose-300">
                {isHindi ? 'एक्सपायर हो चुके बैच' : 'Expired Stock'}
              </div>
              <div className="text-2xl font-black text-rose-400 font-mono tabular-nums">
                {batchStats.expiredBatchesCount}
              </div>
              <div className="text-xs text-rose-200/80 font-mono tabular-nums">
                Qty: {batchStats.expiredQty} • Loss Val: {formatCurrency(batchStats.expiredStockValue, currency)}
              </div>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {isHindi ? '≤ 30 दिन में समाप्ति' : 'Expiring <= 30 Days'}
              </div>
              <div className="text-2xl font-black text-amber-400 font-mono tabular-nums">
                {batchStats.expiringSoonCount}
              </div>
              <div className="text-xs text-amber-200/80 font-mono tabular-nums">
                Units at risk: {batchStats.expiringSoonQty}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isHindi ? '31–90 दिन निगरानी' : '31–90 Day Watch'}
              </div>
              <div className="text-2xl font-black text-cyan-400 font-mono tabular-nums">
                {batchStats.watchCount}
              </div>
              <div className="text-xs text-slate-400">
                {isHindi ? 'FEFO में प्राथमिकता' : 'Prioritized in FEFO'}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3.5 space-y-1">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {isHindi ? 'सक्रिय स्वस्थ बैच' : 'Healthy Active Batches'}
              </div>
              <div className="text-2xl font-black text-emerald-400 font-mono tabular-nums">
                {batchStats.healthyCount}
              </div>
              <div className="text-xs text-slate-400">
                {isHindi ? `कुल बैच: ${batches.length}` : `Total registered: ${batches.length}`}
              </div>
            </div>
          </div>

          <div className="shrink-0 bg-slate-900/90 border border-slate-800 rounded-2xl p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder={isHindi ? 'आइटम, बैच नंबर, बारकोड या गोदाम खोजें...' : 'Search item, batch no., barcode, or godown...'}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:border-rose-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={batchBucketFilter}
                onChange={(e) => setBatchBucketFilter(e.target.value as any)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="ALL">{isHindi ? 'सभी एक्सपायरी स्थिति' : 'All Expiry Buckets'}</option>
                <option value="EXPIRED">{isHindi ? 'केवल एक्सपायर्ड' : 'Expired Only'}</option>
                <option value="EXPIRING_SOON">{isHindi ? '≤ 30 दिन में समाप्त' : 'Expiring <= 30d'}</option>
                <option value="WATCH">{isHindi ? '31–90 दिन' : '31–90 Days'}</option>
                <option value="SAFE">{isHindi ? '90+ दिन सुरक्षित' : 'Safe (90+ d)'}</option>
                <option value="NO_EXPIRY">{isHindi ? 'बिना एक्सपायरी' : 'No Expiry Date'}</option>
              </select>

              <select
                value={batchGodownFilter}
                onChange={(e) => setBatchGodownFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white"
              >
                <option value="ALL">{isHindi ? 'सभी गोदाम' : 'All Godowns'}</option>
                {godowns.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>

              {perms.canCreateEditMasters && (
                <button
                  type="button"
                  onClick={() => openAddBatchModal()}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'नया बैच जोड़ें' : 'Add Batch'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse text-sm text-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                    <th className="py-3 px-4">{isHindi ? 'आइटम / बारकोड' : 'Item & Barcode'}</th>
                    <th className="py-3 px-3">{isHindi ? 'बैच नंबर' : 'Batch No.'}</th>
                    <th className="py-3 px-3">{isHindi ? 'गोदाम' : 'Godown'}</th>
                    <th className="py-3 px-3 text-center">{isHindi ? 'एक्सपायरी दिनांक' : 'Expiry & Status'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'MRP / विक्रय दर' : 'MRP / Sale'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'उपलब्ध मात्रा' : 'Avail Qty'}</th>
                    <th className="py-3 px-4 text-center">{isHindi ? 'कार्रवाई' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredBatches.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>{isHindi ? 'कोई बैच रिकॉर्ड नहीं मिला। परचेज बिल या "Add Batch" से बैच दर्ज करें।' : 'No batches recorded yet. Record via Purchase Bill or "Add Batch".'}</p>
                      </td>
                    </tr>
                  ) : (
                    filteredBatches.map((b) => {
                      const exp = getExpiryStatus(b.expiryDate);
                      const isWrittenOff = b.status === 'WRITTEN_OFF';
                      return (
                        <tr key={b.id} className="hover:bg-slate-800/40 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-white">{b.itemName}</div>
                            <div className="text-xs text-cyan-400 font-mono">{b.barcode || b.itemCode || '-'}</div>
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-indigo-300">{b.batchNumber}</td>
                          <td className="py-3 px-3 text-slate-200">{b.godownName || godowns.find(g => g.id === b.godownId)?.name || 'Main Godown'}</td>
                          <td className="py-3 px-3 text-center">
                            <div className="font-mono text-slate-200">{b.expiryDate || '—'}</div>
                            <span className={`inline-block mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
                              isWrittenOff ? 'bg-slate-800 text-slate-400' :
                              exp.bucket === 'EXPIRED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                              exp.bucket === 'EXPIRING_SOON' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                              exp.bucket === 'WATCH' ? 'bg-cyan-500/15 text-cyan-300' :
                              'bg-emerald-500/15 text-emerald-300'
                            }`}>
                              {isWrittenOff ? 'WRITTEN OFF' : (isHindi ? exp.labelHi : exp.labelEn)}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums">
                            <div className="text-white font-bold">{b.mrp ? formatCurrency(b.mrp, currency) : '—'}</div>
                            <div className="text-xs text-emerald-400">{formatCurrency(b.salesRate || 0, currency)}</div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-black text-white tabular-nums">
                            {b.availableQty} <span className="text-xs text-slate-400 font-normal">/ {b.initialQty}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setBarcodePrintTarget({
                                    itemName: b.itemName,
                                    itemCode: b.itemCode,
                                    barcode: b.barcode || generateEan13Barcode(b.batchNumber),
                                    price: b.salesRate,
                                    mrp: b.mrp,
                                    batchNumber: b.batchNumber,
                                    expiryDate: b.expiryDate,
                                    godownName: b.godownName,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-500/20 text-cyan-400"
                                title={isHindi ? 'बैच बारकोड प्रिंट' : 'Print Batch Barcode'}
                              >
                                <Barcode className="w-3.5 h-3.5" />
                              </button>
                              {perms.canCreateEditMasters && (
                                <button
                                  type="button"
                                  onClick={() => openEditBatchModal(b)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                                  title={isHindi ? 'बैच संपादित करें' : 'Edit Batch'}
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {!isWrittenOff && Number(b.availableQty) > 0 && onWriteOffBatch && perms.canCreateEditMasters && (
                                confirmWriteOffBatchId === b.id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onWriteOffBatch(b.id);
                                      setConfirmWriteOffBatchId(null);
                                    }}
                                    className="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[10px]"
                                  >
                                    {isHindi ? 'पुष्टि करें' : 'Confirm'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmWriteOffBatchId(b.id)}
                                    className="px-2 py-1 rounded-lg bg-amber-500/15 hover:bg-rose-500/20 text-amber-300 hover:text-rose-300 font-bold text-[10px]"
                                    title={isHindi ? 'एक्सपायर्ड स्टॉक राइट-ऑफ करें' : 'Write Off Expired Batch'}
                                  >
                                    {isHindi ? 'राइट-ऑफ' : 'Write-Off'}
                                  </button>
                                )
                              )}
                              {onDeleteBatch && perms.canDeleteRecords && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteBatch(b.id)}
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                                  title={isHindi ? 'बैच हटाएं' : 'Delete Batch'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 6: Multi-Godown & Inter-Godown Transfers */}
      {activeSubTab === 'godowns' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 p-4 rounded-3xl border border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-cyan-400" />
                <span>{isHindi ? 'सक्रिय गोदाम, शोरूम व POS काउंटर' : 'Warehouses, Godowns & POS Counters'}</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                {isHindi ? 'प्रत्येक लोकेशन का अलग स्टॉक बैलेंस एवं इंटर-गोदाम स्टॉक ट्रांसफर' : 'Location-wise inventory tracking & audited inter-godown transfers'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {perms.canCreateEditMasters && (
                <>
                  <button
                    type="button"
                    onClick={handleOpenTransferModal}
                    disabled={godowns.length < 2}
                    className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'नया स्टॉक ट्रांसफर' : 'New Stock Transfer'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={openAddGodownModal}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'नया गोदाम जोड़ें' : 'Add Godown'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Godown Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {godowns.map((g) => {
              const totalUnitsInGodown = data.items.reduce(
                (acc, it) => acc + getItemStockInGodown(it, g.id, godowns),
                0
              );
              const totalCostInGodown = data.items.reduce(
                (acc, it) => acc + getItemStockInGodown(it, g.id, godowns) * (Number(it.purchasePrice) || 0),
                0
              );
              return (
                <div key={g.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-sm">{g.name}</span>
                        {g.isDefault && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            DEFAULT
                          </span>
                        )}
                        {g.isPosCounter && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            POS COUNTER
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                        {g.code} • {g.godownType.replace('_', ' ')}
                      </div>
                    </div>
                    {perms.canCreateEditMasters && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditGodownModal(g)}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title={isHindi ? 'संपादित करें' : 'Edit'}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {!g.isDefault && godowns.length > 1 && onSaveGodowns && (
                          <button
                            type="button"
                            onClick={() => onSaveGodowns(godowns.filter((x) => x.id !== g.id))}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400"
                            title={isHindi ? 'गोदाम हटाएं' : 'Delete Godown'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {g.address && (
                    <div className="text-[11px] text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                      <span className="truncate">{g.address}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-slate-400">{isHindi ? 'इकाइयाँ: ' : 'Stock Qty: '}</span>
                      <span className="text-white font-bold tabular-nums">{totalUnitsInGodown}</span>
                    </div>
                    <div className="text-emerald-400 font-bold tabular-nums">
                      {formatCurrency(totalCostInGodown, currency)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Item x Godown Matrix */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <h4 className="font-bold text-white text-xs">
                {isHindi ? 'आइटम × गोदाम स्टॉक वितरण मैट्रिक्स' : 'Item × Godown Stock Distribution Matrix'}
              </h4>
            </div>
            <div className="overflow-x-auto max-h-[45vh]">
              <table className="w-full text-left border-collapse text-sm text-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-xs">
                    <th className="py-3 px-4">{isHindi ? 'आइटम' : 'Item'}</th>
                    {godowns.map((g) => (
                      <th key={g.id} className="py-3 px-3 text-right">{g.name}</th>
                    ))}
                    <th className="py-3 px-4 text-right">{isHindi ? 'कुल स्टॉक' : 'Company Total'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {data.items.slice(0, 50).map((it) => (
                    <tr key={it.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-bold text-white">{it.name}</td>
                      {godowns.map((g) => {
                        const qty = getItemStockInGodown(it, g.id, godowns);
                        return (
                          <td key={g.id} className={`py-2.5 px-3 text-right font-mono tabular-nums ${qty > 0 ? 'text-slate-100 font-bold' : 'text-slate-500'}`}>
                            {qty}
                          </td>
                        );
                      })}
                      <td className="py-2.5 px-4 text-right font-mono font-black text-cyan-300 tabular-nums">
                        {it.currentStock || 0} {it.unit || 'PCS'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Transfer Register */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
            <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <h4 className="font-bold text-white text-sm">
                {isHindi ? 'स्टॉक ट्रांसफर रजिस्टर (Stock Transfer Slips)' : 'Inter-Godown Transfer History'}
              </h4>
            </div>
            <div className="overflow-x-auto max-h-[45vh]">
              <table className="w-full text-left border-collapse text-sm text-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase text-xs">
                    <th className="py-3 px-4">{isHindi ? 'ट्रांसफर #' : 'Transfer #'}</th>
                    <th className="py-3 px-3">{isHindi ? 'दिनांक' : 'Date'}</th>
                    <th className="py-3 px-3">{isHindi ? 'कहाँ से' : 'From Godown'}</th>
                    <th className="py-3 px-3">{isHindi ? 'कहाँ को' : 'To Godown'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'कुल मात्रा' : 'Total Qty'}</th>
                    <th className="py-3 px-4 text-center">{isHindi ? 'स्लिप प्रिंट' : 'Slip'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        {isHindi ? 'अभी तक कोई गोदाम ट्रांसफर नहीं हुआ है।' : 'No inter-godown transfers recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    transfers.map((tr) => (
                      <tr key={tr.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono font-bold text-cyan-300">{tr.transferNumber}</td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">{tr.date}</td>
                        <td className="py-2.5 px-3 text-rose-300">{tr.fromGodownName}</td>
                        <td className="py-2.5 px-3 text-emerald-300">{tr.toGodownName}</td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-white">{tr.totalQuantity}</td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => setPrintTransferSlip(tr)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400"
                            title={isHindi ? 'ट्रांसफर स्लिप प्रिंट' : 'Print Transfer Slip'}
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 7: Stock Adjustment Center (Negative Stock Clearance + Single Particular Item + Comments Log) */}
      {activeSubTab === 'adjustments' && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1 animate-fadeIn">
          {/* SECTION A: Negative Stock Reconciliation & Bulk Clearance */}
          <div className="bg-slate-900 border border-rose-500/30 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2 flex-wrap">
                    <span>{isHindi ? 'नेगेटिव स्टॉक एडजस्टमेंट व क्लियरेंस (Negative Stock Reconciliation)' : 'Negative Stock Clearance & Reconciliation'}</span>
                    <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full border ${
                      negativeStockItems.length > 0
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}>
                      {negativeStockItems.length} {isHindi ? 'नेगेटिव आइटम' : 'Negative Items'}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {isHindi
                      ? 'जिन आइटम्स का स्टॉक माइनस (-) में चला गया है, उन्हें कारण व कमेंट के साथ एक साथ 0 या वास्तविक भौतिक मात्रा पर समायोजित करें।'
                      : 'Reconcile items with negative stock balances to zero or verified physical counts, complete with audit reason and comments.'}
                  </p>
                </div>
              </div>

              {negativeStockItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = negativeStockItems.every((it) => negSelectedIds[it.id]);
                      const next: Record<string, boolean> = {};
                      negativeStockItems.forEach((it) => { next[it.id] = !allSelected; });
                      setNegSelectedIds(next);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold cursor-pointer"
                  >
                    {negativeStockItems.every((it) => negSelectedIds[it.id])
                      ? (isHindi ? 'सभी अचयनित करें' : 'Unselect All')
                      : (isHindi ? 'सभी चुनें' : 'Select All')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next: Record<string, number> = {};
                      negativeStockItems.forEach((it) => { next[it.id] = 0; });
                      setNegTargetQtys(next);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold cursor-pointer"
                  >
                    {isHindi ? 'सभी को 0 (Nil) सेट करें' : 'Set All Target Qty = 0'}
                  </button>
                </div>
              )}
            </div>

            {negBatchNotice && (
              <div className={`px-4 py-2.5 rounded-2xl border text-xs font-bold ${
                negBatchNotice.type === 'ok'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              }`}>
                {negBatchNotice.text}
              </div>
            )}

            {negativeStockItems.length === 0 ? (
              <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-6 text-center space-y-1.5">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <div className="text-sm font-bold text-white">
                  {isHindi ? 'बहुत बढ़िया! अभी कोई भी आइटम नेगेटिव स्टॉक में नहीं है।' : 'Clean Inventory! Zero items currently have negative stock.'}
                </div>
                <p className="text-xs text-slate-400">
                  {isHindi
                    ? 'आप नीचे दिए गए फॉर्म से किसी भी सिंगल पर्टिकुलर स्टॉक आइटम का एडजस्टमेंट कर सकते हैं।'
                    : 'You can still adjust any single particular stock item below with reason & comments.'}
                </p>
              </div>
            ) : (
              <form onSubmit={handleApplyBatchNegativeClearance} className="space-y-4">
                <div className="overflow-x-auto max-h-[45vh] bg-slate-950/70 rounded-2xl border border-slate-800">
                  <table className="w-full text-left border-collapse text-sm text-slate-200">
                    <thead className="sticky top-0 z-10 bg-slate-800">
                      <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                        <th className="py-3 px-3 w-10 text-center">{isHindi ? 'चुनें' : 'Pick'}</th>
                        <th className="py-3 px-3">{isHindi ? 'स्टॉक आइटम व कोड' : 'Stock Item & Code'}</th>
                        <th className="py-3 px-3 text-center">{isHindi ? 'गोदाम' : 'Godown'}</th>
                        <th className="py-3 px-3 text-right">{isHindi ? 'वर्तमान नेगेटिव स्टॉक' : 'Current (-ve) Qty'}</th>
                        <th className="py-3 px-3 text-center">{isHindi ? 'नया लक्ष्य स्टॉक' : 'New Target Qty'}</th>
                        <th className="py-3 px-3 text-right">{isHindi ? 'समायोजन अंतर (+)' : 'Adjustment Diff'}</th>
                        <th className="py-3 px-3 text-center">{isHindi ? 'सिंगल एडजस्ट' : 'Single'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {negativeStockItems.map((item) => {
                        const checked = Boolean(negSelectedIds[item.id]);
                        const oldQty = Number(item.currentStock || 0);
                        const targetQty = Number(negTargetQtys[item.id] ?? 0);
                        const diff = Math.round((targetQty - oldQty) * 1000) / 1000;
                        const gObj = godowns.find((g) => g.id === item.defaultGodownId) || godowns[0];
                        return (
                          <tr key={item.id} className={`hover:bg-slate-800/40 transition ${checked ? 'bg-rose-950/10' : ''}`}>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => setNegSelectedIds((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                                className="w-4 h-4 accent-rose-500 cursor-pointer"
                              />
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-white">{item.name}</div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {item.code || '-'} • {item.category} • Unit: {item.unit || 'PCS'}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-center text-slate-300 text-[11px]">
                              {gObj?.name || item.location || 'Main Godown'}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-rose-400">
                              {oldQty} {item.unit || 'PCS'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                step="any"
                                value={targetQty}
                                onChange={(e) =>
                                  setNegTargetQtys((prev) => ({
                                    ...prev,
                                    [item.id]: parseFloat(e.target.value) || 0
                                  }))
                                }
                                className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-center text-white font-mono font-bold focus:border-emerald-400 focus:outline-none"
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                              {diff >= 0 ? `+${diff}` : diff} {item.unit || 'PCS'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSingleAdjItemId(item.id);
                                  setSingleAdjGodownId(item.defaultGodownId || resolveDefaultGodownId(godowns));
                                  setSingleAdjMode('SET_FINAL');
                                  setSingleAdjQtyInput(0);
                                  setSingleAdjReason('Negative Stock Clearance');
                                  setSingleAdjComment(
                                    isHindi
                                      ? `नेगेटिव स्टॉक (${oldQty} ${item.unit || 'PCS'}) को क्लियर किया गया`
                                      : `Cleared negative stock balance (${oldQty} ${item.unit || 'PCS'})`
                                  );
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold transition cursor-pointer"
                              >
                                {isHindi ? 'सिर्फ इसे चुनें' : 'Focus Single'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {perms.canCreateEditMasters && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 items-end text-xs">
                    <div className="md:col-span-4">
                      <label className="block text-slate-300 font-bold mb-1">
                        {isHindi ? 'नेगेटिव स्टॉक समायोजन का कारण *' : 'Adjustment Reason *'}
                      </label>
                      <select
                        value={negBatchReason}
                        onChange={(e) => setNegBatchReason(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:border-rose-400 focus:outline-none cursor-pointer"
                      >
                        <option value="Negative Stock Clearance">Negative Stock Clearance (नेगेटिव स्टॉक समायोजन)</option>
                        <option value="Opening Stock Reconciliation">Opening Stock Reconciliation (आरंभिक स्टॉक मिलान)</option>
                        <option value="Unrecorded Purchase / Return">Unrecorded Purchase / Return (अप्रकाशित आवक/खरीद सुधार)</option>
                        <option value="Physical Verification Difference">Physical Verification Difference (भौतिक गणना अंतर)</option>
                      </select>
                    </div>

                    <div className="md:col-span-5">
                      <label className="block text-amber-300 font-bold mb-1">
                        {isHindi ? 'विस्तृत कमेंट (किस स्टॉक व क्यों एडजस्टमेंट हो रहा है) *' : 'Detailed Comments (Which stock & why) *'}
                      </label>
                      <input
                        type="text"
                        value={negBatchComment}
                        onChange={(e) => setNegBatchComment(e.target.value)}
                        placeholder={isHindi ? 'जैसे: मार्च माह भौतिक मिलान के बाद नेगेटिव स्टॉक को शून्य किया गया...' : 'e.g. Month-end physical verification reconciliation to clear negative balances...'}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="md:col-span-3">
                      <button
                        type="submit"
                        className="w-full bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-extrabold py-2.5 px-4 rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isHindi ? 'चुने गए नेगेटिव स्टॉक क्लियर करें' : 'Clear Selected Negative Stock'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* SECTION B: Single Particular Stock Adjustment Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {isHindi ? 'सिंगल पर्टिकुलर स्टॉक एडजस्टमेंट (Particular Stock Item)' : 'Single Particular Stock Item Adjustment'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isHindi
                      ? 'किसी भी एक विशेष आइटम को चुनकर उसकी मात्रा बढ़ाएं, घटाएं या भौतिक स्टॉक सेट करें — पूर्ण कमेंट व कारण सहित'
                      : 'Select any specific item to set its exact physical quantity or add/subtract units with full audit comments'}
                  </p>
                </div>
              </div>
            </div>

            {singleAdjNotice && (
              <div className={`px-4 py-2.5 rounded-2xl border text-xs font-bold ${
                singleAdjNotice.type === 'ok'
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
              }`}>
                {singleAdjNotice.text}
              </div>
            )}

            <form onSubmit={handleApplySingleStockAdjustment} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    {isHindi ? 'आइटम खोजें (Filter Item)' : 'Quick Filter Item'}
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={singleAdjSearch}
                      onChange={(e) => setSingleAdjSearch(e.target.value)}
                      placeholder={isHindi ? 'नाम या कोड लिखें...' : 'Filter by name or code...'}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2.5 text-white focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    {isHindi ? 'पर्टिकुलर स्टॉक आइटम चुनें *' : 'Select Particular Item *'}
                  </label>
                  <select
                    value={singleAdjItemId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSingleAdjItemId(nextId);
                      const found = data.items.find((i) => i.id === nextId);
                      if (found) {
                        setSingleAdjGodownId(found.defaultGodownId || resolveDefaultGodownId(godowns));
                        setSingleAdjQtyInput(singleAdjMode === 'SET_FINAL' ? (Number(found.currentStock || 0) < 0 ? 0 : Number(found.currentStock || 0)) : 0);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white font-bold focus:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    {singleAdjSelectableItems.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({it.code || 'NO-CODE'}) — Stock: {it.currentStock || 0} {it.unit || 'PCS'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    {isHindi ? 'गोदाम (Target Godown)' : 'Target Godown'}
                  </label>
                  <select
                    value={singleAdjGodownId}
                    onChange={(e) => setSingleAdjGodownId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    {godowns.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedSingleAdjItem && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-950/70 p-3.5 rounded-2xl border border-slate-800">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      {isHindi ? 'वर्तमान सिस्टम स्टॉक' : 'Current System Stock'}
                    </div>
                    <div className={`text-lg font-black font-mono mt-0.5 ${
                      (selectedSingleAdjItem.currentStock || 0) < 0 ? 'text-rose-400' : 'text-white'
                    }`}>
                      {selectedSingleAdjItem.currentStock || 0} {selectedSingleAdjItem.unit || 'PCS'}
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      {isHindi ? 'एडजस्टमेंट मोड' : 'Adjustment Mode'}
                    </label>
                    <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => {
                          setSingleAdjMode('SET_FINAL');
                          setSingleAdjQtyInput(Number(selectedSingleAdjItem.currentStock || 0) < 0 ? 0 : Number(selectedSingleAdjItem.currentStock || 0));
                        }}
                        className={`py-1.5 rounded-lg font-bold text-[11px] cursor-pointer ${
                          singleAdjMode === 'SET_FINAL' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isHindi ? 'अंतिम स्टॉक सेट' : 'Final Qty'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSingleAdjMode('DELTA');
                          setSingleAdjQtyInput(0);
                        }}
                        className={`py-1.5 rounded-lg font-bold text-[11px] cursor-pointer ${
                          singleAdjMode === 'DELTA' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {isHindi ? '+ / - अंतर जोड़ें' : '+ / - Delta'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">
                      {singleAdjMode === 'SET_FINAL'
                        ? (isHindi ? 'नया भौतिक स्टॉक *' : 'New Physical Qty *')
                        : (isHindi ? 'जोड़ें (+) या घटाएं (-) *' : 'Add (+) or Deduct (-) *')}
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={singleAdjQtyInput}
                      onChange={(e) => setSingleAdjQtyInput(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-center font-mono font-bold text-base text-white focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>

                  <div className="flex flex-col justify-center">
                    {(() => {
                      const oldQ = Number(selectedSingleAdjItem.currentStock || 0);
                      const newQ = singleAdjMode === 'SET_FINAL' ? singleAdjQtyInput : oldQ + singleAdjQtyInput;
                      const diffQ = Math.round((newQ - oldQ) * 1000) / 1000;
                      const valImpact = diffQ * Number(selectedSingleAdjItem.purchasePrice || 0);
                      return (
                        <div className="space-y-0.5 text-right md:text-left">
                          <div className="text-[10px] uppercase font-bold text-slate-400">
                            {isHindi ? 'परिणाम (Result Preview)' : 'Resulting Stock & Impact'}
                          </div>
                          <div className="font-mono font-black text-sm text-indigo-300">
                            {oldQ} → {Math.round(newQ * 1000) / 1000} {selectedSingleAdjItem.unit || 'PCS'}{' '}
                            <span className={diffQ >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              ({diffQ >= 0 ? `+${diffQ}` : diffQ})
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            Value: {valImpact >= 0 ? '+' : ''}{formatCurrency(valImpact, currency)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-4">
                  <label className="block text-slate-300 font-bold mb-1">
                    {isHindi ? 'समायोजन का कारण (Reason) *' : 'Adjustment Reason *'}
                  </label>
                  <select
                    value={singleAdjReason}
                    onChange={(e) => setSingleAdjReason(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white focus:border-amber-400 focus:outline-none cursor-pointer"
                  >
                    <option value="Negative Stock Clearance">Negative Stock Clearance (नेगेटिव स्टॉक क्लियरेंस)</option>
                    <option value="Physical Count Discrepancy">Physical Count Discrepancy (भौतिक सत्यापन अंतर)</option>
                    <option value="Opening Stock Correction">Opening Stock Correction (आरंभिक स्टॉक सुधार)</option>
                    <option value="Damage / Breakage">Damage / Breakage (टूटा-फूटा / क्षतिग्रस्त)</option>
                    <option value="Expired / Wastage">Expired / Wastage (एक्सपायर्ड / वेस्टेज)</option>
                    <option value="Theft or Shrinkage">Theft or Shrinkage (चोरी / कमी)</option>
                    <option value="Sample Given / Promo">Sample Given / Promotion (सैंपल वितरण)</option>
                    <option value="Restock Inflow">Manual Inward Correction (मैनुअल आवक सुधार)</option>
                  </select>
                </div>

                <div className="md:col-span-5">
                  <label className="block text-amber-300 font-bold mb-1">
                    {isHindi ? 'कमेंट / विवरण (किस स्टॉक के साथ और क्यों) *' : 'Comments (Which stock & why) *'}
                  </label>
                  <input
                    type="text"
                    value={singleAdjComment}
                    onChange={(e) => setSingleAdjComment(e.target.value)}
                    placeholder={isHindi ? 'लिखें: किस गोदाम/आइटम का स्टॉक किस कारण से एडजस्ट किया जा रहा है...' : 'Describe which item/godown is adjusted and the exact reason...'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white placeholder-slate-500 focus:border-amber-400 focus:outline-none"
                    required
                  />
                </div>

                <div className="md:col-span-3">
                  {perms.canCreateEditMasters ? (
                    <button
                      type="submit"
                      className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-2.5 px-4 rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isHindi ? 'स्टॉक एडजस्टमेंट लागू करें' : 'Apply Stock Adjustment'}</span>
                    </button>
                  ) : (
                    <div className="text-[11px] text-slate-500 text-center py-2">
                      {isHindi ? 'केवल एडमिन/मैनेजर अनुमति' : 'Admin/Manager only'}
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>

          {/* SECTION C: Stock Adjustment Register & Comments Audit History */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" />
                  <span>{isHindi ? 'स्टॉक एडजस्टमेंट रजिस्टर व कमैंट्स लॉग' : 'Stock Adjustment Register & Comments Log'}</span>
                  <span className="text-[11px] font-mono bg-slate-800 text-indigo-300 px-2 py-0.5 rounded-full">
                    {filteredAdjustmentHistory.length}
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isHindi
                    ? 'प्रत्येक स्टॉक एडजस्टमेंट का पूरा इतिहास — कौन सा आइटम, पुराना/नया स्टॉक, कारण और टिप्पणियाँ'
                    : 'Complete audit register showing every adjusted item, before/after quantities, reason, and detailed comments'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={adjHistorySearch}
                    onChange={(e) => setAdjHistorySearch(e.target.value)}
                    placeholder={isHindi ? 'इतिहास / कमेंट खोजें...' : 'Search item, reason, comment...'}
                    className="bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                {perms.canExportData && filteredAdjustmentHistory.length > 0 && (
                  <button
                    type="button"
                    onClick={exportAdjustmentRegisterCsv}
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'रजिस्टर CSV' : 'Export CSV'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto max-h-[45vh]">
              <table className="w-full text-left border-collapse text-sm text-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-800">
                  <tr className="border-b border-slate-700 text-slate-300 font-bold uppercase tracking-wider text-xs">
                    <th className="py-3 px-4">{isHindi ? 'दिनांक' : 'Date'}</th>
                    <th className="py-3 px-3">{isHindi ? 'आइटम नाम व कोड' : 'Item Name & Code'}</th>
                    <th className="py-3 px-3">{isHindi ? 'गोदाम' : 'Godown'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'पुराना स्टॉक' : 'Old Qty'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'नया स्टॉक' : 'New Qty'}</th>
                    <th className="py-3 px-3 text-right">{isHindi ? 'अंतर (+/-)' : 'Variance'}</th>
                    <th className="py-3 px-3">{isHindi ? 'कारण' : 'Reason'}</th>
                    <th className="py-3 px-4">{isHindi ? 'कमेंट्स / विवरण (Why)' : 'Comments / Audit Note'}</th>
                    <th className="py-3 px-3">{isHindi ? 'उपयोगकर्ता' : 'By'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAdjustmentHistory.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        {isHindi
                          ? 'अभी तक कोई स्टॉक एडजस्टमेंट दर्ज नहीं हुआ है।'
                          : 'No stock adjustments recorded yet.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAdjustmentHistory.map((adj) => (
                      <tr key={adj.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">{adj.date}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-white">{adj.itemName}</div>
                          <div className="text-xs font-mono text-slate-400">{adj.itemCode || '-'}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-200 text-xs">{adj.godownName || 'Main Godown'}</td>
                        <td className={`py-2.5 px-3 text-right font-mono tabular-nums font-bold ${adj.previousStock < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {adj.previousStock}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-white">{adj.newStock}</td>
                        <td className={`py-2.5 px-3 text-right font-mono tabular-nums font-black ${adj.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {adj.difference >= 0 ? `+${adj.difference}` : adj.difference}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                            {adj.reason}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-200 max-w-xs">{adj.notes || adj.reason}</td>
                        <td className="py-2.5 px-3 text-slate-300 text-xs whitespace-nowrap">{adj.adjustedBy || 'Admin'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODALS ===================== */}

      {/* MODAL 1: Add or Edit Item Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <Package className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingItem 
                      ? (isHindi ? 'आइटम विवरण संपादित करें' : 'Edit Inventory Item') 
                      : (isHindi ? 'नया इन्वेंटरी स्टॉक आइटम जोड़ें' : 'Add New Inventory Item')}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {isHindi ? 'स्टॉक स्तर, रीऑर्डर पॉइंट्स और टैक्स दरें निर्धारित करें' : 'Define stock levels, reorder threshold, and taxation rates'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-6 space-y-4 overflow-y-auto text-xs">
              {itemFormError && (
                <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-between gap-2">
                  <span>{itemFormError}</span>
                  <button type="button" onClick={() => setItemFormError(null)} className="text-rose-200 hover:text-white">✕</button>
                </div>
              )}
              {/* Row 1: Item Name, Code & Barcode */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'आइटम का नाम *' : 'Item Name *'}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Dell Core i7 Business Laptop"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-medium focus:border-indigo-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>{isHindi ? 'आइटम कोड' : 'Item Code'}</span>
                    <span className="text-[10px] text-indigo-400 font-normal">{isHindi ? 'स्वतः' : 'Auto'}</span>
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ITM-101"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between gap-1">
                    <span>{isHindi ? 'बारकोड (EAN-13)' : 'Barcode (EAN-13)'}</span>
                    <button
                      type="button"
                      onClick={() => setBarcode(generateEan13Barcode(code || name || Date.now()))}
                      className="text-[10px] bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-300 font-bold px-2 py-0.5 rounded cursor-pointer transition"
                    >
                      {isHindi ? 'ऑटो बारकोड बनाएं' : 'Auto-Generate Barcode'}
                    </button>
                  </label>
                  <input
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="890..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>
              {barcode && (
                <div className="bg-white rounded-xl p-2.5 flex items-center justify-between gap-3">
                  <BarcodeSvg value={barcode} height={28} />
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-700 font-bold">POS READY</span>
                    <button
                      type="button"
                      onClick={() =>
                        setBarcodePrintTarget({
                          itemName: name.trim() || 'Item',
                          itemCode: code.trim() || 'SKU',
                          barcode: barcode.trim(),
                          price: Number(salesPrice) || 0,
                          wholesalePrice: Number(wholesalePrice) || undefined,
                          mrp: Number(mrp) || undefined,
                          unit: unit || 'PCS',
                        })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer transition"
                    >
                      <Printer className="w-3 h-3 text-cyan-400" />
                      <span>{isHindi ? 'स्टिकर प्रिंट' : 'Print Stickers'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Row 2: Category, Unit, HSN */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? 'श्रेणी (Category) *' : 'Category *'}
                  </label>
                  <div className="space-y-1.5">
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">{isHindi ? '-- श्रेणी चुनें --' : '-- Select Category --'}</option>
                      <option value="General Goods">General Goods</option>
                      <option value="Electronics & IT">Electronics & IT</option>
                      <option value="Hardware & Tools">Hardware & Tools</option>
                      <option value="Raw Materials">Raw Materials</option>
                      <option value="Finished Goods">Finished Goods</option>
                      <option value="Packaging Material">Packaging Material</option>
                      <option value="Office Supplies">Office Supplies</option>
                      <option value="Textiles & Garments">Textiles & Garments</option>
                      <option value="CUSTOM">+ Add New Custom Category</option>
                    </select>
                    {category === 'CUSTOM' && (
                      <input
                        type="text"
                        value={customCategoryInput}
                        onChange={(e) => setCustomCategoryInput(e.target.value)}
                        placeholder="Type new category..."
                        className="w-full bg-slate-950 border border-indigo-500/50 rounded-xl p-2 text-white text-xs"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1 flex items-center justify-between">
                    <span>{isHindi ? 'माप की इकाई (Unit) *' : 'Unit of Measure *'}</span>
                    <button
                      type="button"
                      onClick={() => setShowAddUnitInput(!showAddUnitInput)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold underline"
                    >
                      + {isHindi ? 'नई इकाई' : 'New Unit'}
                    </button>
                  </label>
                  {showAddUnitInput ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={newUnitName}
                        onChange={(e) => setNewUnitName(e.target.value)}
                        placeholder="LTR, MTR, PKT"
                        className="w-full bg-slate-950 border border-indigo-500 rounded-xl p-2 text-white font-mono text-xs uppercase"
                      />
                      <button
                        type="button"
                        onClick={handleAddNewCustomUnit}
                        className="bg-indigo-600 text-white font-bold px-2 rounded-xl text-xs shrink-0"
                      >
                        ✓
                      </button>
                    </div>
                  ) : (
                    <select
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="">{isHindi ? '-- इकाई चुनें --' : '-- Select Unit --'}</option>
                      {allAvailableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {taxProfile.gstEnabled
                      ? (isHindi ? 'HSN / SAC कोड' : 'HSN / SAC Code')
                      : (isHindi ? 'SKU / श्रेणी कोड (वैकल्पिक)' : 'HSN / SKU Code (Optional)')}
                  </label>
                  <input
                    type="text"
                    value={hsnSacCode}
                    onChange={(e) => setHsnSacCode(e.target.value)}
                    placeholder="e.g. 8471"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Row 3: Multi-Tier Pricing, MRP & Tax */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 bg-slate-950/60 rounded-2xl border border-slate-800">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? `खरीद दर (Purchase ${currencySymbol})` : `Purchase Price (${currencySymbol})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={purchasePrice || ''}
                    onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? `रिटेल बिक्री मूल्य (Retail ${currencySymbol})` : `Retail Sale Price (${currencySymbol})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={salesPrice || ''}
                    onChange={(e) => setSalesPrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-emerald-400 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? `थोक मूल्य (Wholesale ${currencySymbol})` : `Wholesale Price (${currencySymbol})`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={wholesalePrice || ''}
                    onChange={(e) => setWholesalePrice(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-amber-300 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    {isHindi ? `MRP (${currencySymbol} Optional)` : `MRP (${currencySymbol} Optional)`}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={mrp || ''}
                    onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-cyan-300 font-mono font-bold focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                {taxProfile.gstEnabled && (
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isHindi ? 'जीएसटी दर (%)' : 'GST Rate (%)'}
                    </label>
                    <select
                      value={taxRate}
                      onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white font-mono focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="0">0% (Nil / Exempted)</option>
                      <option value="5">5% GST</option>
                      <option value="12">12% GST</option>
                      <option value="18">18% GST (Standard)</option>
                      <option value="28">28% GST</option>
                    </select>
                  </div>
                )}

                {showCessCol && (
                  <div>
                    <label className="block text-amber-300 font-semibold mb-1">
                      {isHindi ? 'सेस दर (%)' : 'Cess Rate (%)'}
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={cessRate || ''}
                      onChange={(e) => setCessRate(Math.max(0, parseFloat(e.target.value) || 0))}
                      placeholder="0"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-amber-300 font-mono font-bold focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Row 4: Stock Tracking & Reorder Point Setup */}
              <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-3">
                <div className="font-bold text-amber-300 flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>{isHindi ? 'स्टॉक मात्रा एवं रीऑर्डर पॉइंट (Stock & Reorder Thresholds):' : 'Stock Quantities & Reorder Points:'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isHindi ? 'वर्तमान स्टॉक मात्रा' : 'Current Stock Qty'}
                    </label>
                    <input
                      type="number"
                      value={currentStock || ''}
                      onChange={(e) => setCurrentStock(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-amber-300 font-semibold mb-1">
                      {isHindi ? 'रीऑर्डर पॉइंट (न्यूनतम)' : 'Reorder Point (Min Level)'}
                    </label>
                    <input
                      type="number"
                      value={minStockLevel || ''}
                      onChange={(e) => setMinStockLevel(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-amber-500/60 rounded-xl p-2.5 text-amber-300 font-mono font-bold focus:border-amber-400 focus:outline-none"
                      title="When stock reaches this level or below, reorder alerts will trigger"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isHindi ? 'सुझाई गई रीऑर्डर मात्रा' : 'Reorder Batch Size'}
                    </label>
                    <input
                      type="number"
                      value={reorderQuantity || ''}
                      onChange={(e) => setReorderQuantity(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      {isHindi ? 'डिफ़ॉल्ट गोदाम (Default Godown)' : 'Default Godown / Rack'}
                    </label>
                    <select
                      value={defaultGodownId}
                      onChange={(e) => {
                        setDefaultGodownId(e.target.value);
                        const gObj = godowns.find(g => g.id === e.target.value);
                        setLocation(gObj?.name || '');
                      }}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">{isHindi ? '-- गोदाम चुनें --' : '-- Select Godown --'}</option>
                      {godowns.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 pt-1 text-slate-200 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={trackBatchExpiry}
                    onChange={(e) => setTrackBatchExpiry(e.target.checked)}
                    className="w-4 h-4 accent-rose-500 rounded"
                  />
                  <span>
                    {isHindi ? 'बैच नंबर और एक्सपायरी डेट ट्रैक करें (FEFO)' : 'Enable Batch No. & Expiry Tracking (FEFO)'}
                  </span>
                </label>
              </div>

              {/* Row 5: Description */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'विवरण या तकनीकी विवरण (Optional)' : 'Description / Notes'}
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional item details or notes"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold text-xs transition"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl text-xs transition shadow-lg shadow-indigo-600/30"
                >
                  {editingItem ? (isHindi ? 'आइटम अपडेट करें' : 'Update Item') : (isHindi ? 'आइटम सहेजें' : 'Save Item')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Quick Stock Adjustment Modal */}
      {quickAdjustItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 text-xs my-auto animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-400" />
                <h3 className="font-bold text-white text-sm">
                  {isHindi ? 'त्वरित स्टॉक एडजस्टमेंट / ऑडिट' : 'Physical Stock Audit & Adjustment'}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setQuickAdjustItem(null)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-slate-950 rounded-2xl border border-slate-800 space-y-1">
              <div className="font-bold text-white text-sm">{quickAdjustItem.name}</div>
              <div className="text-[11px] text-slate-400 font-mono">
                Code: {quickAdjustItem.code || '-'} • Unit: {quickAdjustItem.unit || 'PCS'}
              </div>
              <div className="text-xs pt-1 flex items-center justify-between">
                <span className="text-slate-400">{isHindi ? 'वर्तमान सिस्टम स्टॉक:' : 'Current System Stock:'}</span>
                <span className={`font-mono font-bold text-sm ${(quickAdjustItem.currentStock || 0) < 0 ? 'text-rose-400' : 'text-white'}`}>
                  {quickAdjustItem.currentStock || 0} {quickAdjustItem.unit || 'PCS'}
                </span>
              </div>
              {(quickAdjustItem.currentStock || 0) < 0 && (
                <div className="pt-1.5 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-rose-300 font-semibold">
                    {isHindi ? 'नेगेटिव स्टॉक अलर्ट!' : 'Negative stock detected!'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdjustNewQty(0);
                      setAdjustReason('Negative Stock Clearance');
                      if (!adjustNotes.trim()) {
                        setAdjustNotes(isHindi ? 'नेगेटिव स्टॉक को शून्य (0) पर समायोजित किया' : 'Cleared negative stock to 0');
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-[11px] font-bold cursor-pointer"
                  >
                    {isHindi ? '0 (Nil) सेट करें' : 'Set 0 to Clear'}
                  </button>
                </div>
              )}
            </div>

            <form onSubmit={handlePerformStockAdjustment} className="space-y-3">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'लक्ष्य गोदाम (Godown)' : 'Target Godown'}
                </label>
                <select
                  value={adjustGodownId}
                  onChange={(e) => setAdjustGodownId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {godowns.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'भौतिक गणना अनुसार नया स्टॉक (Physical Counted Stock) *' : 'New Actual Physical Stock Count *'}
                </label>
                <input
                  type="number"
                  step="any"
                  value={adjustNewQty}
                  onChange={(e) => setAdjustNewQty(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-center text-white font-mono text-lg font-bold focus:border-amber-500 focus:outline-none"
                  required
                />
                <div className="text-[11px] text-slate-400 flex items-center justify-between mt-1 px-1">
                  <span>{isHindi ? 'अंतर (Variance):' : 'Variance:'}</span>
                  <span className={`font-mono font-bold ${
                    adjustNewQty - (quickAdjustItem.currentStock || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {adjustNewQty - (quickAdjustItem.currentStock || 0) >= 0 ? '+' : ''}
                    {Math.round((adjustNewQty - (quickAdjustItem.currentStock || 0)) * 1000) / 1000} {quickAdjustItem.unit || 'PCS'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  {isHindi ? 'समायोजन का कारण (Reason) *' : 'Adjustment Reason *'}
                </label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  <option value="Negative Stock Clearance">Negative Stock Clearance (नेगेटिव स्टॉक समायोजन)</option>
                  <option value="Physical Count Discrepancy">Physical Count Discrepancy (भौतिक ऑडिट अंतर)</option>
                  <option value="Damage / Breakage">Damage / Breakage (टूटा-फूटा / नुकसान)</option>
                  <option value="Expired / Wastage">Expired / Wastage (खराब / समाप्ति)</option>
                  <option value="Theft or Lost">Theft or Lost (गायब / चोरी)</option>
                  <option value="Sample Given / Promo">Sample Given / Promotion (सैंपल वितरण)</option>
                  <option value="Opening Stock Correction">Opening Stock Correction (आरंभिक स्टॉक सुधार)</option>
                  <option value="Restock Inflow">Restock Inflow (नया स्टॉक प्राप्त हुआ)</option>
                </select>
              </div>

              <div>
                <label className="block text-amber-300 font-semibold mb-1">
                  {isHindi ? 'कमेंट / टिप्पणी (किस स्टॉक व क्यों एडजस्ट हो रहा है) *' : 'Comments / Audit Note (Which stock & why) *'}
                </label>
                <input
                  type="text"
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder={isHindi ? 'जैसे: भौतिक सत्यापन के आधार पर स्टॉक सुधारा गया' : 'e.g. Month-end physical verification adjustment'}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAdjustItem(null)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold px-5 py-2 rounded-xl transition shadow cursor-pointer"
                >
                  {isHindi ? 'स्टॉक अपडेट करें' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Delete Confirmation Modal */}
      {deleteConfirmItem && (() => {
        const usage = checkItemUsage(deleteConfirmItem);
        const hasTransactions = usage.inSales > 0 || usage.inPurchases > 0;

        return (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 text-xs my-auto animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">
                    {isHindi ? 'आइटम हटाने की पुष्टि करें' : 'Confirm Item Deletion'}
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {deleteConfirmItem.name} ({deleteConfirmItem.code || 'NO-CODE'})
                  </p>
                </div>
              </div>

              {hasTransactions ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-amber-300 space-y-1.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>{isHindi ? 'चेतावनी: यह आइटम लेनदेनों में उपयोग हुआ है!' : 'Notice: Item has linked transactions!'}</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    {isHindi 
                      ? `यह आइटम ${usage.inSales} बिक्री इनवॉइस और ${usage.inPurchases} खरीद बिल में दर्ज है। इसे हटाने से पिछले इनवॉइस के नाम तो सुरक्षित रहेंगे, पर मास्टर लिस्ट से यह स्थायी रूप से हट जाएगा।`
                      : `This item is referenced in ${usage.inSales} sales invoices and ${usage.inPurchases} purchase bills. Deleting it will permanently remove it from master catalog.`}
                  </p>
                </div>
              ) : (
                <p className="text-slate-300">
                  {isHindi 
                    ? `क्या आप वाकई "${deleteConfirmItem.name}" को हटाना चाहते हैं? यह क्रिया पूर्ववत नहीं की जा सकती।`
                    : `Are you sure you want to permanently delete "${deleteConfirmItem.name}"? This action cannot be undone.`}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmItem(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 font-bold"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDeleteItem(deleteConfirmItem.id);
                    setDeleteConfirmItem(null);
                  }}
                  className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2.5 rounded-xl transition shadow"
                >
                  {isHindi ? 'हाँ, हटाएं' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL 4: Quick Item Stock Ledger Modal */}
      {showItemLedgerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn">
            <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{showItemLedgerModal.name}</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Stock Ledger Register • In-Stock: {showItemLedgerModal.currentStock || 0} {showItemLedgerModal.unit || 'PCS'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {perms.canExportData && (
                  <button
                    onClick={() => printStockLedger(showItemLedgerModal, data, isHindi)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'प्रिंट' : 'Print'}</span>
                  </button>
                )}
                <button
                  onClick={() => setShowItemLedgerModal(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto text-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-bold uppercase tracking-wider text-[10px]">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-2">Type</th>
                      <th className="py-2.5 px-3">Ref #</th>
                      <th className="py-2.5 px-3">Party / Reason</th>
                      <th className="py-2.5 px-2 text-right">Inflow (+)</th>
                      <th className="py-2.5 px-2 text-right">Outflow (-)</th>
                      <th className="py-2.5 px-3 text-right">Rate</th>
                      <th className="py-2.5 px-3 text-right">Running Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    {getItemStockMovements(showItemLedgerModal, data).map(m => (
                      <tr key={m.id} className="hover:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-400">{m.date}</td>
                        <td className="py-2 px-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            m.type === 'PURCHASE' ? 'bg-emerald-500/20 text-emerald-400' :
                            m.type === 'SALE' ? 'bg-indigo-500/20 text-indigo-400' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {m.type}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-white font-bold">{m.refNumber}</td>
                        <td className="py-2 px-3 font-sans text-slate-300">{m.partyName}</td>
                        <td className="py-2 px-2 text-right text-emerald-400 font-bold">{m.inflow > 0 ? `+${m.inflow}` : '-'}</td>
                        <td className="py-2 px-2 text-right text-rose-400 font-bold">{m.outflow > 0 ? `-${m.outflow}` : '-'}</td>
                        <td className="py-2 px-3 text-right text-slate-400">{m.rate > 0 ? formatCurrency(m.rate, currency) : '-'}</td>
                        <td className="py-2 px-3 text-right text-indigo-300 font-bold">{m.runningBalance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Barcode Label Printer Modal */}
      {barcodePrintTarget && (
        <BarcodePrintModal
          target={barcodePrintTarget}
          companyName={data.company.name}
          currencySymbol={currencySymbol}
          isHindi={isHindi}
          onClose={() => setBarcodePrintTarget(null)}
        />
      )}

      {/* MODAL 6: Add / Edit Batch Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4 text-xs my-auto animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-400" />
                <h3 className="font-bold text-white text-sm">
                  {editingBatch ? (isHindi ? 'बैच संपादित करें' : 'Edit Item Batch') : (isHindi ? 'नया बैच जोड़ें' : 'Register New Item Batch')}
                </h3>
              </div>
              <button type="button" onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-white p-1">
                ✕
              </button>
            </div>
            {batchFormError && (
              <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-2 rounded-xl font-semibold">
                {batchFormError}
              </div>
            )}
            <form onSubmit={handleSubmitBatch} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'आइटम *' : 'Item *'}</label>
                  <select
                    value={bItemId}
                    onChange={(e) => {
                      const itm = data.items.find(i => i.id === e.target.value);
                      setBItemId(e.target.value);
                      if (itm) {
                        setBMrp(itm.mrp || itm.salesPrice || 0);
                        setBPurchaseRate(itm.purchasePrice || 0);
                        setBSalesRate(itm.salesPrice || 0);
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="">{isHindi ? '-- आइटम चुनें --' : '-- Select Item --'}</option>
                    {data.items.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'गोदाम *' : 'Godown *'}</label>
                  <select
                    value={bGodownId}
                    onChange={(e) => setBGodownId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  >
                    <option value="">{isHindi ? '-- गोदाम चुनें --' : '-- Select Godown --'}</option>
                    {godowns.map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'बैच नंबर *' : 'Batch No. *'}</label>
                  <input
                    type="text"
                    value={bBatchNumber}
                    onChange={(e) => setBBatchNumber(e.target.value)}
                    placeholder="e.g. B-2601-01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'उपलब्ध मात्रा *' : 'Available Qty *'}</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={bQty || ''}
                    onChange={(e) => setBQty(parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'निर्माण तिथि (Mfg)' : 'Mfg Date'}</label>
                  <input
                    type="date"
                    value={bMfgDate}
                    onChange={(e) => setBMfgDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'एक्सपायरी दिनांक (Exp)' : 'Expiry Date'}</label>
                  <input
                    type="date"
                    value={bExpiryDate}
                    onChange={(e) => setBExpiryDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-rose-300"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">MRP ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    value={bMrp || ''}
                    onChange={(e) => setBMrp(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-cyan-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'बिक्री दर' : 'Sale Rate'}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={bSalesRate || ''}
                    onChange={(e) => setBSalesRate(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-emerald-300 font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'बैच बारकोड' : 'Batch Barcode'}</label>
                <input
                  type="text"
                  value={bBarcode}
                  onChange={(e) => setBBarcode(e.target.value)}
                  placeholder="Optional (auto-generated if empty)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-cyan-300 font-mono"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowBatchModal(false)} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 font-bold">
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button type="submit" className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-5 py-2 rounded-xl">
                  {isHindi ? 'बैच सेव करें' : 'Save Batch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 7: Add / Edit Godown Modal */}
      {showGodownModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4 text-xs my-auto animate-fadeIn">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Warehouse className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-white text-sm">
                  {editingGodown ? (isHindi ? 'गोदाम अपडेट करें' : 'Edit Godown') : (isHindi ? 'नया गोदाम / काउंटर जोड़ें' : 'Add Godown / Counter')}
                </h3>
              </div>
              <button type="button" onClick={() => setShowGodownModal(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>
            {godownFormError && (
              <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-2 rounded-xl font-semibold">
                {godownFormError}
              </div>
            )}
            <form onSubmit={handleSubmitGodown} className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'गोदाम का नाम *' : 'Godown Name *'}</label>
                  <input
                    type="text"
                    value={gName}
                    onChange={(e) => setGName(e.target.value)}
                    placeholder="e.g. City Showroom Counter 1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'कोड' : 'Code'}</label>
                  <input
                    type="text"
                    value={gCode}
                    onChange={(e) => setGCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'प्रकार' : 'Location Type'}</label>
                <select
                  value={gType}
                  onChange={(e) => setGType(e.target.value as GodownType)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                >
                  <option value="MAIN_WAREHOUSE">Main Warehouse (मुख्य गोदाम)</option>
                  <option value="BRANCH_STORE">Branch / Showroom (शाखा / शोरूम)</option>
                  <option value="POS_COUNTER">Retail POS Counter (रिटेल काउंटर)</option>
                  <option value="COLD_STORAGE">Cold Storage (कोल्ड स्टोरेज)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'पता' : 'Address / Location Note'}</label>
                <input
                  type="text"
                  value={gAddress}
                  onChange={(e) => setGAddress(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white"
                />
              </div>
              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={gIsPosCounter} onChange={(e) => setGIsPosCounter(e.target.checked)} className="accent-cyan-500" />
                  <span>{isHindi ? 'POS काउंटर के लिए उपलब्ध रखें' : 'Enable for Barcode POS Counter billing'}</span>
                </label>
                <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                  <input type="checkbox" checked={gIsDefault} onChange={(e) => setGIsDefault(e.target.checked)} className="accent-indigo-500" />
                  <span>{isHindi ? 'डिफ़ॉल्ट गोदाम सेट करें' : 'Set as Company Default Godown'}</span>
                </label>
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setShowGodownModal(false)} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 font-bold">
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2 rounded-xl">
                  {isHindi ? 'सेव करें' : 'Save Godown'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 8: Inter-Godown Stock Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn text-xs">
            <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-white text-sm">
                  {isHindi ? 'इंटर-गोदाम स्टॉक ट्रांसफर वाउचर' : 'Inter-Godown Stock Transfer Voucher'}
                </h3>
              </div>
              <button type="button" onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-white p-1">✕</button>
            </div>
            <form onSubmit={handleSubmitStockTransfer} className="p-5 overflow-y-auto space-y-4">
              {transferError && (
                <div className="bg-rose-500/15 border border-rose-500/40 text-rose-300 px-3 py-2 rounded-xl font-semibold">
                  {transferError}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'ट्रांसफर #' : 'Transfer #'}</label>
                  <input type="text" value={trRefNo} onChange={(e) => setTrRefNo(e.target.value)} placeholder="Auto (e.g. ST-101)" className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-cyan-300 font-mono font-bold" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'दिनांक' : 'Date'}</label>
                  <input type="date" value={trDate} onChange={(e) => setTrDate(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white" />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'कहाँ से (Source)' : 'From Godown'}</label>
                  <select value={trFromGodownId} onChange={(e) => setTrFromGodownId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-rose-300">
                    <option value="">{isHindi ? '-- स्रोत गोदाम चुनें --' : '-- Select Source Godown --'}</option>
                    {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">{isHindi ? 'कहाँ को (Dest)' : 'To Godown'}</label>
                  <select value={trToGodownId} onChange={(e) => setTrToGodownId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-emerald-300">
                    <option value="">{isHindi ? '-- गंतव्य गोदाम चुनें --' : '-- Select Dest Godown --'}</option>
                    {godowns.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-300">{isHindi ? 'स्थानांतरित आइटम:' : 'Items to Transfer:'}</span>
                  <button
                    type="button"
                    onClick={() => setTrLines(prev => [...prev, { id: `trl_${Date.now()}`, itemId: '', batchId: '', quantity: 0 }])}
                    className="text-cyan-400 font-bold hover:underline"
                  >
                    + {isHindi ? 'पंक्ति जोड़ें' : 'Add Line'}
                  </button>
                </div>
                {trLines.map((line, i) => {
                  const itm = data.items.find(x => x.id === line.itemId);
                  const srcAvail = itm ? getItemStockInGodown(itm, trFromGodownId, godowns) : 0;
                  const srcBatches = line.itemId ? getSortedItemBatchesFefo(batches, line.itemId, trFromGodownId, { includeExpired: true }) : [];
                  return (
                    <div key={line.id} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-xl border border-slate-800">
                      <select
                        value={line.itemId}
                        onChange={(e) => setTrLines(prev => prev.map((x, idx) => idx === i ? { ...x, itemId: e.target.value, batchId: '' } : x))}
                        className="col-span-5 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white"
                      >
                        <option value="">{isHindi ? '-- आइटम चुनें --' : '-- Select Item --'}</option>
                        {data.items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                      </select>
                      <select
                        value={line.batchId}
                        onChange={(e) => setTrLines(prev => prev.map((x, idx) => idx === i ? { ...x, batchId: e.target.value } : x))}
                        className="col-span-4 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-indigo-300"
                      >
                        <option value="">{isHindi ? `कोई बैच नहीं (उपलब्ध: ${srcAvail})` : `No Batch (Avail: ${srcAvail})`}</option>
                        {srcBatches.map(b => (
                          <option key={b.id} value={b.id}>{b.batchNumber} (Qty: {b.availableQty})</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={line.quantity || ''}
                        onChange={(e) => setTrLines(prev => prev.map((x, idx) => idx === i ? { ...x, quantity: parseFloat(e.target.value) || 0 } : x))}
                        placeholder="0"
                        className="col-span-2 bg-slate-900 border border-slate-700 rounded-lg p-1.5 text-white text-center font-mono font-bold"
                      />
                      <button
                        type="button"
                        onClick={() => trLines.length > 1 && setTrLines(prev => prev.filter((_, idx) => idx !== i))}
                        className="col-span-1 text-slate-400 hover:text-rose-400 flex justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button type="button" onClick={() => setShowTransferModal(false)} className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 font-bold">
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button type="submit" className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2 rounded-xl">
                  {isHindi ? 'स्टॉक ट्रांसफर करें' : 'Execute Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 9: Transfer Slip Print Preview */}
      {printTransferSlip && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-white text-sm">Transfer Slip #{printTransferSlip.transferNumber}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => printDomElement('hv-transfer-slip-print', { paperSize: 'A4', title: `Transfer-${printTransferSlip.transferNumber}` })}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isHindi ? 'प्रिंट' : 'Print'}</span>
                </button>
                <button type="button" onClick={() => setPrintTransferSlip(null)} className="text-slate-400 hover:text-white p-1">✕</button>
              </div>
            </div>
            <div className="p-5 bg-white text-slate-900 text-xs" id="hv-transfer-slip-print">
              <div className="border-b-2 border-slate-800 pb-3 mb-3 flex justify-between">
                <div>
                  <div className="text-base font-black">{data.company.name}</div>
                  <div className="text-[11px] text-slate-600">INTER-GODOWN STOCK TRANSFER SLIP</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold">#{printTransferSlip.transferNumber}</div>
                  <div>Date: {printTransferSlip.date}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3 bg-slate-100 p-2.5 rounded-lg">
                <div><span className="font-bold">From Godown:</span> {printTransferSlip.fromGodownName}</div>
                <div><span className="font-bold">To Godown:</span> {printTransferSlip.toGodownName}</div>
              </div>
              <table className="w-full border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-200 text-left">
                    <th className="p-2 border border-slate-300">#</th>
                    <th className="p-2 border border-slate-300">Item</th>
                    <th className="p-2 border border-slate-300">Batch</th>
                    <th className="p-2 border border-slate-300 text-right">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {printTransferSlip.items.map((l, idx) => (
                    <tr key={l.id}>
                      <td className="p-2 border border-slate-300">{idx + 1}</td>
                      <td className="p-2 border border-slate-300 font-bold">{l.itemName}</td>
                      <td className="p-2 border border-slate-300 font-mono">{l.batchNumber || '—'}</td>
                      <td className="p-2 border border-slate-300 text-right font-mono font-bold">{l.quantity} {l.unit || 'PCS'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
