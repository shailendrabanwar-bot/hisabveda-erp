import {
  Godown,
  ItemBatch,
  ItemMaster,
  PurchaseInvoice,
  SalesInvoice,
  StockAdjustmentRecord,
  StockTransfer,
  StockTransferLine,
} from '../types';

export const DEFAULT_MAIN_GODOWN_ID = 'gdw_main';

export function createDefaultMainGodown(): Godown {
  return {
    id: DEFAULT_MAIN_GODOWN_ID,
    name: 'Main Godown / Primary Counter',
    code: 'MAIN-01',
    address: 'Primary Warehouse & Store',
    godownType: 'MAIN_WAREHOUSE',
    isDefault: true,
    isPosCounter: true,
    isActive: true,
  };
}

export function ensureGodowns(godowns?: Godown[]): Godown[] {
  if (!Array.isArray(godowns) || godowns.length === 0) {
    return [createDefaultMainGodown()];
  }
  const hasDefault = godowns.some((g) => g.isDefault);
  if (hasDefault) return godowns;
  return godowns.map((g, idx) => (idx === 0 ? { ...g, isDefault: true } : g));
}

export function resolveDefaultGodownId(godowns?: Godown[]): string {
  const list = ensureGodowns(godowns);
  return (list.find((g) => g.isDefault && g.isActive) || list.find((g) => g.isActive) || list[0]).id;
}

export function resolvePosGodownId(godowns?: Godown[]): string {
  const list = ensureGodowns(godowns);
  return (
    list.find((g) => g.isPosCounter && g.isActive) ||
    list.find((g) => g.isDefault && g.isActive) ||
    list[0]
  ).id;
}

// ============================================================================
// BARCODE UTILITIES (EAN-13 CHECKSUM + DETERMINISTIC CODE-39 SVG ENCODER)
// ============================================================================

export function computeEan13CheckDigit(base12: string): string {
  const digits = base12.replace(/\D/g, '').padStart(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(digits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const mod = sum % 10;
  return String(mod === 0 ? 0 : 10 - mod);
}

export function isValidEan13Barcode(code: string): boolean {
  const clean = (code || '').trim();
  if (!/^\d{13}$/.test(clean)) return false;
  return computeEan13CheckDigit(clean.slice(0, 12)) === clean[12];
}

export function generateEan13Barcode(seed?: string | number): string {
  const numericSeed =
    typeof seed === 'number'
      ? String(Math.abs(Math.floor(seed)))
      : String(seed || Date.now())
          .split('')
          .map((ch) => {
            const c = ch.charCodeAt(0);
            return c >= 48 && c <= 57 ? ch : String(c % 10);
          })
          .join('');
  // GS1 India prefix '890' + 9 deterministic digits
  const tail9 = (numericSeed + '104729385').slice(-9).padStart(9, '0');
  const base12 = `890${tail9}`;
  return base12 + computeEan13CheckDigit(base12);
}

// Standard Code-39 encoding table (1 = narrow, 3 = wide; alternating bar/space starting with bar)
const CODE39_TABLE: Record<string, string> = {
  '0': '111331311',
  '1': '311311113',
  '2': '113311113',
  '3': '313311111',
  '4': '111331113',
  '5': '311331111',
  '6': '113331111',
  '7': '111311313',
  '8': '311311311',
  '9': '113311311',
  A: '311113113',
  B: '113113113',
  C: '313113111',
  D: '111133113',
  E: '311133111',
  F: '113133111',
  G: '111113313',
  H: '311113311',
  I: '113113311',
  J: '111133311',
  K: '311111133',
  L: '113111133',
  M: '313111131',
  N: '111131133',
  O: '311131131',
  P: '113131131',
  Q: '111111333',
  R: '311111331',
  S: '113111331',
  T: '111131331',
  U: '331111113',
  V: '133111113',
  W: '333111111',
  X: '131131113',
  Y: '331131111',
  Z: '133131111',
  '-': '131111313',
  '.': '331111311',
  ' ': '133111311',
  $: '131313111',
  '/': '131311131',
  '+': '131113131',
  '%': '111313131',
  '*': '131131311',
};

export interface BarcodeBarRect {
  x: number;
  width: number;
}

export function encodeCode39Bars(rawText: string): {
  bars: BarcodeBarRect[];
  totalWidth: number;
  normalizedText: string;
} {
  const cleaned = (rawText || '000000')
    .toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, '-')
    .slice(0, 32) || '000000';
  const full = `*${cleaned}*`;
  const bars: BarcodeBarRect[] = [];
  let cursor = 4; // quiet zone

  for (let cIdx = 0; cIdx < full.length; cIdx++) {
    const ch = full[cIdx];
    const pattern = CODE39_TABLE[ch] || CODE39_TABLE['-'];
    for (let i = 0; i < pattern.length; i++) {
      const w = Number(pattern[i]);
      if (i % 2 === 0) {
        bars.push({ x: cursor, width: w });
      }
      cursor += w;
    }
    cursor += 1; // inter-character narrow gap
  }

  return {
    bars,
    totalWidth: cursor + 4,
    normalizedText: cleaned,
  };
}

// ============================================================================
// BATCH & EXPIRY HELPERS (FEFO)
// ============================================================================

export type ExpiryBucket = 'EXPIRED' | 'EXPIRING_SOON' | 'WATCH' | 'SAFE' | 'NO_EXPIRY';

export interface ExpiryStatusInfo {
  bucket: ExpiryBucket;
  daysRemaining: number | null;
  labelEn: string;
  labelHi: string;
}

export function getExpiryStatus(expiryDate?: string, referenceDate?: string): ExpiryStatusInfo {
  if (!expiryDate || !expiryDate.trim()) {
    return {
      bucket: 'NO_EXPIRY',
      daysRemaining: null,
      labelEn: 'No Expiry',
      labelHi: 'कोई समाप्ति नहीं',
    };
  }

  const expTime = new Date(`${expiryDate.slice(0, 10)}T00:00:00`).getTime();
  if (Number.isNaN(expTime)) {
    return {
      bucket: 'NO_EXPIRY',
      daysRemaining: null,
      labelEn: 'No Expiry',
      labelHi: 'कोई समाप्ति नहीं',
    };
  }

  const refStr = referenceDate
    ? referenceDate.slice(0, 10)
    : new Date().toISOString().split('T')[0];
  const refTime = new Date(`${refStr}T00:00:00`).getTime();
  const daysRemaining = Math.floor((expTime - refTime) / 86_400_000);

  if (daysRemaining < 0) {
    return {
      bucket: 'EXPIRED',
      daysRemaining,
      labelEn: `Expired ${Math.abs(daysRemaining)}d ago`,
      labelHi: `${Math.abs(daysRemaining)} दिन पहले समाप्त`,
    };
  }
  if (daysRemaining <= 30) {
    return {
      bucket: 'EXPIRING_SOON',
      daysRemaining,
      labelEn: daysRemaining === 0 ? 'Expires Today' : `Expires in ${daysRemaining}d`,
      labelHi: daysRemaining === 0 ? 'आज समाप्त' : `${daysRemaining} दिन में समाप्त`,
    };
  }
  if (daysRemaining <= 90) {
    return {
      bucket: 'WATCH',
      daysRemaining,
      labelEn: `${daysRemaining}d left`,
      labelHi: `${daysRemaining} दिन शेष`,
    };
  }
  return {
    bucket: 'SAFE',
    daysRemaining,
    labelEn: `${daysRemaining}d left`,
    labelHi: `${daysRemaining} दिन शेष`,
  };
}

export function computeBatchStatus(
  batch: Pick<ItemBatch, 'availableQty' | 'expiryDate' | 'status'>,
  referenceDate?: string
): ItemBatch['status'] {
  if (batch.status === 'WRITTEN_OFF') return 'WRITTEN_OFF';
  if ((Number(batch.availableQty) || 0) <= 0) return 'DEPLETED';
  const exp = getExpiryStatus(batch.expiryDate, referenceDate);
  if (exp.bucket === 'EXPIRED') return 'EXPIRED';
  return 'ACTIVE';
}

export interface BatchSummaryStats {
  totalActiveBatches: number;
  expiredBatchesCount: number;
  expiredQty: number;
  expiredStockValue: number;
  expiringSoonCount: number; // <= 30 days
  expiringSoonQty: number;
  watchCount: number; // 31..90 days
  healthyCount: number;
}

export function getBatchSummaryStats(
  batches?: ItemBatch[],
  referenceDate?: string
): BatchSummaryStats {
  const stats: BatchSummaryStats = {
    totalActiveBatches: 0,
    expiredBatchesCount: 0,
    expiredQty: 0,
    expiredStockValue: 0,
    expiringSoonCount: 0,
    expiringSoonQty: 0,
    watchCount: 0,
    healthyCount: 0,
  };

  for (const b of batches || []) {
    const qty = Number(b.availableQty) || 0;
    if (qty <= 0 || b.status === 'WRITTEN_OFF') continue;
    const exp = getExpiryStatus(b.expiryDate, referenceDate);
    if (exp.bucket === 'EXPIRED') {
      stats.expiredBatchesCount++;
      stats.expiredQty += qty;
      stats.expiredStockValue += qty * (Number(b.purchaseRate) || 0);
    } else {
      stats.totalActiveBatches++;
      if (exp.bucket === 'EXPIRING_SOON') {
        stats.expiringSoonCount++;
        stats.expiringSoonQty += qty;
      } else if (exp.bucket === 'WATCH') {
        stats.watchCount++;
      } else {
        stats.healthyCount++;
      }
    }
  }
  stats.expiredStockValue = Math.round(stats.expiredStockValue * 100) / 100;
  return stats;
}

// ============================================================================
// GODOWN STOCK HELPERS
// ============================================================================

export function reconcileGodownStocksMap(
  item: ItemMaster,
  godowns?: Godown[]
): Record<string, number> {
  const list = ensureGodowns(godowns);
  const defaultId =
    item.defaultGodownId && list.some((g) => g.id === item.defaultGodownId)
      ? item.defaultGodownId
      : resolveDefaultGodownId(list);

  const totalStock = Number(item.currentStock) || 0;
  const existing = item.godownStocks ? { ...item.godownStocks } : {};
  const keys = Object.keys(existing);

  if (keys.length === 0) {
    return { [defaultId]: totalStock };
  }

  // Ensure sum equals item.currentStock; place any untracked delta into defaultId
  const mapSum = keys.reduce((acc, k) => acc + (Number(existing[k]) || 0), 0);
  const delta = Math.round((totalStock - mapSum) * 1000) / 1000;
  if (Math.abs(delta) > 0.0005) {
    existing[defaultId] = Math.round(((Number(existing[defaultId]) || 0) + delta) * 1000) / 1000;
  }
  return existing;
}

export function getItemStockInGodown(
  item: ItemMaster,
  godownId?: string,
  godowns?: Godown[]
): number {
  if (!godownId) return Number(item.currentStock) || 0;
  const map = reconcileGodownStocksMap(item, godowns);
  return Number(map[godownId] || 0);
}

// ============================================================================
// FEFO BATCH SELECTION & BARCODE LOOKUP
// ============================================================================

export interface FefoAllocation {
  batch: ItemBatch;
  qty: number;
}

export function getSortedItemBatchesFefo(
  batches: ItemBatch[],
  itemId: string,
  godownId?: string,
  options?: { includeExpired?: boolean; includeDepleted?: boolean; referenceDate?: string }
): ItemBatch[] {
  const includeExpired = Boolean(options?.includeExpired);
  const includeDepleted = Boolean(options?.includeDepleted);

  return (batches || [])
    .filter((b) => {
      if (b.itemId !== itemId) return false;
      if (b.status === 'WRITTEN_OFF') return false;
      if (godownId && b.godownId !== godownId) return false;
      const qty = Number(b.availableQty) || 0;
      if (!includeDepleted && qty <= 0) return false;
      if (!includeExpired) {
        const exp = getExpiryStatus(b.expiryDate, options?.referenceDate);
        if (exp.bucket === 'EXPIRED') return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Batches with expiry come first (earliest expiry first = FEFO), no-expiry last
      const aExp = a.expiryDate ? a.expiryDate.slice(0, 10) : '9999-12-31';
      const bExp = b.expiryDate ? b.expiryDate.slice(0, 10) : '9999-12-31';
      if (aExp !== bExp) return aExp.localeCompare(bExp);
      const aCreated = a.createdAt || '';
      const bCreated = b.createdAt || '';
      return aCreated.localeCompare(bCreated);
    });
}

export function pickFefoBatchesForSale(
  batches: ItemBatch[],
  itemId: string,
  requestedQty: number,
  godownId?: string,
  allowExpired = false,
  referenceDate?: string
): { allocations: FefoAllocation[]; unallocatedQty: number } {
  const sorted = getSortedItemBatchesFefo(batches, itemId, godownId, {
    includeExpired: allowExpired,
    includeDepleted: false,
    referenceDate,
  });

  let remaining = Math.max(0, Number(requestedQty) || 0);
  const allocations: FefoAllocation[] = [];

  for (const batch of sorted) {
    if (remaining <= 0) break;
    const avail = Math.max(0, Number(batch.availableQty) || 0);
    if (avail <= 0) continue;
    const take = Math.min(avail, remaining);
    allocations.push({ batch, qty: Math.round(take * 1000) / 1000 });
    remaining = Math.round((remaining - take) * 1000) / 1000;
  }

  return { allocations, unallocatedQty: remaining };
}

export interface ScanLookupResult {
  item: ItemMaster;
  batch?: ItemBatch;
  matchedBy: 'BATCH_BARCODE' | 'ITEM_BARCODE' | 'ITEM_CODE' | 'BATCH_NUMBER' | 'ITEM_NAME';
}

export function findItemOrBatchByScan(
  rawQuery: string,
  items: ItemMaster[],
  batches: ItemBatch[],
  godownId?: string,
  referenceDate?: string
): ScanLookupResult | null {
  const q = (rawQuery || '').trim();
  if (!q) return null;
  const qLower = q.toLowerCase();

  // 1. Exact Batch Barcode match (prefer non-expired in active godown, else any matching batch)
  const matchingBatchBarcode = (batches || []).filter(
    (b) => b.barcode && b.barcode.trim().toLowerCase() === qLower && b.status !== 'WRITTEN_OFF'
  );
  if (matchingBatchBarcode.length > 0) {
    const preferred =
      matchingBatchBarcode.find(
        (b) =>
          (!godownId || b.godownId === godownId) &&
          (Number(b.availableQty) || 0) > 0 &&
          getExpiryStatus(b.expiryDate, referenceDate).bucket !== 'EXPIRED'
      ) ||
      matchingBatchBarcode.find((b) => !godownId || b.godownId === godownId) ||
      matchingBatchBarcode[0];
    const item = items.find((i) => i.id === preferred.itemId);
    if (item) {
      return { item, batch: preferred, matchedBy: 'BATCH_BARCODE' };
    }
  }

  // 2. Exact Item Barcode match
  const itemByBarcode = items.find(
    (i) => i.barcode && i.barcode.trim().toLowerCase() === qLower
  );
  if (itemByBarcode) {
    const fefo = getSortedItemBatchesFefo(batches, itemByBarcode.id, godownId, {
      includeExpired: false,
      referenceDate,
    });
    return {
      item: itemByBarcode,
      batch: fefo[0],
      matchedBy: 'ITEM_BARCODE',
    };
  }

  // 3. Exact Item Code / SKU match
  const itemByCode = items.find(
    (i) => i.code && i.code.trim().toLowerCase() === qLower
  );
  if (itemByCode) {
    const fefo = getSortedItemBatchesFefo(batches, itemByCode.id, godownId, {
      includeExpired: false,
      referenceDate,
    });
    return {
      item: itemByCode,
      batch: fefo[0],
      matchedBy: 'ITEM_CODE',
    };
  }

  // 4. Exact Batch Number match
  const matchingBatchNo = (batches || []).filter(
    (b) => b.batchNumber && b.batchNumber.trim().toLowerCase() === qLower && b.status !== 'WRITTEN_OFF'
  );
  if (matchingBatchNo.length > 0) {
    const preferred =
      matchingBatchNo.find((b) => (!godownId || b.godownId === godownId) && (Number(b.availableQty) || 0) > 0) ||
      matchingBatchNo[0];
    const item = items.find((i) => i.id === preferred.itemId);
    if (item) {
      return { item, batch: preferred, matchedBy: 'BATCH_NUMBER' };
    }
  }

  // 5. Exact Item Name match
  const itemByName = items.find((i) => i.name.trim().toLowerCase() === qLower);
  if (itemByName) {
    const fefo = getSortedItemBatchesFefo(batches, itemByName.id, godownId, {
      includeExpired: false,
      referenceDate,
    });
    return {
      item: itemByName,
      batch: fefo[0],
      matchedBy: 'ITEM_NAME',
    };
  }

  return null;
}

// ============================================================================
// IMMUTABLE STOCK + GODOWN + BATCH MUTATORS FOR TRANSACTIONS
// ============================================================================

function mutateItemAndGodownStock(
  item: ItemMaster,
  godownDeltas: Map<string, number>,
  godowns: Godown[]
): ItemMaster {
  const defaultId =
    item.defaultGodownId && godowns.some((g) => g.id === item.defaultGodownId)
      ? item.defaultGodownId
      : resolveDefaultGodownId(godowns);

  const nextGodownStocks = reconcileGodownStocksMap(item, godowns);
  let totalDelta = 0;

  for (const [gId, delta] of godownDeltas.entries()) {
    const targetGid = gId || defaultId;
    nextGodownStocks[targetGid] =
      Math.round(((Number(nextGodownStocks[targetGid]) || 0) + delta) * 1000) / 1000;
    totalDelta += delta;
  }

  const nextTotal = Math.round(((Number(item.currentStock) || 0) + totalDelta) * 1000) / 1000;
  const qtyChanged = Math.abs(totalDelta) > 0.0005;
  return {
    ...item,
    currentStock: nextTotal,
    godownStocks: nextGodownStocks,
    ...(qtyChanged ? { closingStockValue: undefined, importedClosingQty: undefined } : {}),
  };
}

/**
 * Reverses an old SalesInvoice (if editing/deleting) and applies the new SalesInvoice (if saving).
 * Safely sums quantities across multiple lines referencing the same itemId (e.g. split batches)
 * and deducts/restores both ItemMaster godownStocks and ItemBatch availableQty.
 */
export function applySalesInvoiceStockAndBatchChanges(params: {
  items: ItemMaster[];
  batches: ItemBatch[];
  godowns?: Godown[];
  previousInvoice?: SalesInvoice | null;
  nextInvoice?: SalesInvoice | null;
}): { items: ItemMaster[]; itemBatches: ItemBatch[] } {
  const godowns = ensureGodowns(params.godowns);
  const fallbackGodownId = resolveDefaultGodownId(godowns);

  // Key: itemId -> Map<godownId, delta>
  const itemGodownDeltas = new Map<string, Map<string, number>>();
  // Key: batchId -> delta
  const batchQtyDeltas = new Map<string, number>();

  const addItemDelta = (itemId: string, godownId: string, delta: number) => {
    if (!itemId || !delta) return;
    const inner = itemGodownDeltas.get(itemId) || new Map<string, number>();
    inner.set(godownId, (inner.get(godownId) || 0) + delta);
    itemGodownDeltas.set(itemId, inner);
  };

  // 1. Restore stock from previous invoice (if not CANCELLED)
  if (params.previousInvoice && params.previousInvoice.status !== 'CANCELLED') {
    const invGodown = params.previousInvoice.godownId || fallbackGodownId;
    for (const line of params.previousInvoice.items || []) {
      const qty = Number(line.quantity) || 0;
      if (!qty) continue;
      const lineGodown = line.godownId || invGodown;
      addItemDelta(line.itemId, lineGodown, +qty);
      if (line.batchId) {
        batchQtyDeltas.set(line.batchId, (batchQtyDeltas.get(line.batchId) || 0) + qty);
      }
    }
  }

  // 2. Deduct stock for next invoice (if not CANCELLED)
  if (params.nextInvoice && params.nextInvoice.status !== 'CANCELLED') {
    const invGodown = params.nextInvoice.godownId || fallbackGodownId;
    for (const line of params.nextInvoice.items || []) {
      const qty = Number(line.quantity) || 0;
      if (!qty) continue;
      const lineGodown = line.godownId || invGodown;
      addItemDelta(line.itemId, lineGodown, -qty);
      if (line.batchId) {
        batchQtyDeltas.set(line.batchId, (batchQtyDeltas.get(line.batchId) || 0) - qty);
      }
    }
  }

  const nextItems = (params.items || []).map((item) => {
    const deltas = itemGodownDeltas.get(item.id);
    if (!deltas) return item;
    return mutateItemAndGodownStock(item, deltas, godowns);
  });

  const nextBatches = (params.batches || []).map((batch) => {
    const delta = batchQtyDeltas.get(batch.id);
    if (!delta) return batch;
    const nextQty = Math.max(0, Math.round(((Number(batch.availableQty) || 0) + delta) * 1000) / 1000);
    const updated: ItemBatch = {
      ...batch,
      availableQty: nextQty,
    };
    return {
      ...updated,
      status: computeBatchStatus(updated),
    };
  });

  return { items: nextItems, itemBatches: nextBatches };
}

/**
 * Reverses an old PurchaseInvoice (if editing/deleting) and applies the new PurchaseInvoice (if saving),
 * updating ItemMaster godownStocks AND creating/updating/reversing ItemBatch entries when batch metadata exists.
 */
export function applyPurchaseBillStockAndBatchChanges(params: {
  items: ItemMaster[];
  batches: ItemBatch[];
  godowns?: Godown[];
  previousBill?: PurchaseInvoice | null;
  nextBill?: PurchaseInvoice | null;
}): { items: ItemMaster[]; itemBatches: ItemBatch[] } {
  const godowns = ensureGodowns(params.godowns);
  const fallbackGodownId = resolveDefaultGodownId(godowns);

  const itemGodownDeltas = new Map<string, Map<string, number>>();
  const addItemDelta = (itemId: string, godownId: string, delta: number) => {
    if (!itemId || !delta) return;
    const inner = itemGodownDeltas.get(itemId) || new Map<string, number>();
    inner.set(godownId, (inner.get(godownId) || 0) + delta);
    itemGodownDeltas.set(itemId, inner);
  };

  let nextBatches = [...(params.batches || [])];

  // 1. Reverse previous purchase bill stock & batches
  if (params.previousBill && params.previousBill.status !== 'CANCELLED') {
    const billGodown = params.previousBill.godownId || fallbackGodownId;
    for (const line of params.previousBill.items || []) {
      const qty = Number(line.quantity) || 0;
      if (!qty) continue;
      const lineGodown = line.godownId || billGodown;
      addItemDelta(line.itemId, lineGodown, -qty);

      if (line.batchId || line.batchNumber) {
        nextBatches = nextBatches
          .map((b) => {
            const matchById = line.batchId && b.id === line.batchId;
            const matchByCompound =
              !line.batchId &&
              line.batchNumber &&
              b.itemId === line.itemId &&
              b.godownId === lineGodown &&
              b.batchNumber.toLowerCase() === line.batchNumber.trim().toLowerCase() &&
              (b.purchaseBillId === params.previousBill?.id || true);

            if (!matchById && !matchByCompound) return b;
            const nextAvail = Math.max(0, Math.round(((Number(b.availableQty) || 0) - qty) * 1000) / 1000);
            const nextInit = Math.max(0, Math.round(((Number(b.initialQty) || 0) - qty) * 1000) / 1000);
            const updated: ItemBatch = {
              ...b,
              initialQty: nextInit,
              availableQty: nextAvail,
            };
            return { ...updated, status: computeBatchStatus(updated) };
          })
          .filter((b) => !(b.purchaseBillId === params.previousBill?.id && b.initialQty <= 0 && b.availableQty <= 0));
      }
    }
  }

  // 2. Apply next purchase bill stock & create/top-up batches
  if (params.nextBill && params.nextBill.status !== 'CANCELLED') {
    const billGodownId = params.nextBill.godownId || fallbackGodownId;
    const billGodownObj = godowns.find((g) => g.id === billGodownId);

    for (const line of params.nextBill.items || []) {
      const qty = Number(line.quantity) || 0;
      if (!qty) continue;
      const lineGodownId = line.godownId || billGodownId;
      const lineGodownObj = godowns.find((g) => g.id === lineGodownId) || billGodownObj;
      addItemDelta(line.itemId, lineGodownId, +qty);

      const batchNo = (line.batchNumber || '').trim();
      if (batchNo || line.expiryDate) {
        const effectiveBatchNo = batchNo || `LOT-${params.nextBill.billNumber || 'PB'}`;
        const masterItem = (params.items || []).find((i) => i.id === line.itemId);

        const existingIdx = nextBatches.findIndex(
          (b) =>
            b.status !== 'WRITTEN_OFF' &&
            ((line.batchId && b.id === line.batchId) ||
              (b.itemId === line.itemId &&
                b.godownId === lineGodownId &&
                b.batchNumber.toLowerCase() === effectiveBatchNo.toLowerCase() &&
                (b.expiryDate || '') === (line.expiryDate || '')))
        );

        if (existingIdx >= 0) {
          const prevB = nextBatches[existingIdx];
          const updated: ItemBatch = {
            ...prevB,
            mfgDate: line.mfgDate || prevB.mfgDate,
            expiryDate: line.expiryDate || prevB.expiryDate,
            mrp: line.mrp ?? prevB.mrp,
            purchaseRate: Number(line.rate) || prevB.purchaseRate,
            initialQty: Math.round(((Number(prevB.initialQty) || 0) + qty) * 1000) / 1000,
            availableQty: Math.round(((Number(prevB.availableQty) || 0) + qty) * 1000) / 1000,
            supplierInvoiceNo: params.nextBill.supplierInvoiceNo || prevB.supplierInvoiceNo,
          };
          nextBatches[existingIdx] = { ...updated, status: computeBatchStatus(updated) };
        } else {
          const batchId =
            line.batchId ||
            `bat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const newBatch: ItemBatch = {
            id: batchId,
            itemId: line.itemId,
            itemName: line.itemName || masterItem?.name || 'Item',
            itemCode: masterItem?.code,
            godownId: lineGodownId,
            godownName: lineGodownObj?.name || 'Main Godown',
            batchNumber: effectiveBatchNo,
            mfgDate: line.mfgDate || undefined,
            expiryDate: line.expiryDate || undefined,
            mrp: line.mrp ?? masterItem?.mrp ?? masterItem?.salesPrice,
            purchaseRate: Number(line.rate) || masterItem?.purchasePrice || 0,
            salesRate: masterItem?.salesPrice || line.mrp || Number(line.rate) || 0,
            initialQty: qty,
            availableQty: qty,
            barcode:
              line.barcode ||
              generateEan13Barcode(`${line.itemId}_${effectiveBatchNo}`),
            supplierInvoiceNo: params.nextBill.supplierInvoiceNo,
            purchaseBillId: params.nextBill.id,
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
          };
          newBatch.status = computeBatchStatus(newBatch);
          nextBatches.unshift(newBatch);
        }
      }
    }
  }

  const nextItems = (params.items || []).map((item) => {
    const deltas = itemGodownDeltas.get(item.id);
    if (!deltas) return item;
    return mutateItemAndGodownStock(item, deltas, godowns);
  });

  return { items: nextItems, itemBatches: nextBatches };
}

/**
 * Executes an Inter-Godown Stock Transfer cleanly:
 * - Validates positive quantity & source godown availability
 * - Moves qty from `fromGodownId` to `toGodownId` (Company-wide `item.currentStock` stays invariant!)
 * - Splits/moves `ItemBatch` quantities if lines specify a `batchId`
 */
export function executeInterGodownTransfer(params: {
  items: ItemMaster[];
  batches: ItemBatch[];
  godowns?: Godown[];
  transfer: StockTransfer;
}): {
  ok: boolean;
  error?: string;
  items: ItemMaster[];
  itemBatches: ItemBatch[];
  transfer: StockTransfer;
} {
  const godowns = ensureGodowns(params.godowns);
  const { transfer } = params;

  if (!transfer.fromGodownId || !transfer.toGodownId) {
    return {
      ok: false,
      error: 'Both Source and Destination Godowns are required.',
      items: params.items,
      itemBatches: params.batches,
      transfer,
    };
  }
  if (transfer.fromGodownId === transfer.toGodownId) {
    return {
      ok: false,
      error: 'Source and Destination Godown cannot be the same.',
      items: params.items,
      itemBatches: params.batches,
      transfer,
    };
  }
  if (!transfer.items || transfer.items.length === 0) {
    return {
      ok: false,
      error: 'Add at least one item to transfer.',
      items: params.items,
      itemBatches: params.batches,
      transfer,
    };
  }

  let nextItems = [...(params.items || [])];
  let nextBatches = [...(params.batches || [])];

  // Validate per-item and per-batch totals across all lines before mutating
  const itemRequestedTotals = new Map<string, number>();
  const batchRequestedTotals = new Map<string, number>();

  for (const line of transfer.items) {
    const qty = Number(line.quantity) || 0;
    if (qty <= 0) {
      return {
        ok: false,
        error: `Quantity for "${line.itemName}" must be greater than zero.`,
        items: params.items,
        itemBatches: params.batches,
        transfer,
      };
    }
    itemRequestedTotals.set(line.itemId, (itemRequestedTotals.get(line.itemId) || 0) + qty);
    if (line.batchId) {
      batchRequestedTotals.set(line.batchId, (batchRequestedTotals.get(line.batchId) || 0) + qty);
    }
  }

  for (const [itemId, reqQty] of itemRequestedTotals.entries()) {
    const item = nextItems.find((i) => i.id === itemId);
    if (!item) {
      return {
        ok: false,
        error: `Item "${itemId}" not found in inventory.`,
        items: params.items,
        itemBatches: params.batches,
        transfer,
      };
    }
    const availInSource = getItemStockInGodown(item, transfer.fromGodownId, godowns);
    if (reqQty > availInSource + 0.0005) {
      return {
        ok: false,
        error: `Insufficient stock for "${item.name}" in ${transfer.fromGodownName}. Available: ${availInSource}, Requested: ${reqQty}.`,
        items: params.items,
        itemBatches: params.batches,
        transfer,
      };
    }
  }

  for (const [batchId, reqQty] of batchRequestedTotals.entries()) {
    const batch = nextBatches.find((b) => b.id === batchId);
    if (!batch || batch.godownId !== transfer.fromGodownId) {
      return {
        ok: false,
        error: `Selected batch not found in source godown "${transfer.fromGodownName}".`,
        items: params.items,
        itemBatches: params.batches,
        transfer,
      };
    }
    if (reqQty > (Number(batch.availableQty) || 0) + 0.0005) {
      return {
        ok: false,
        error: `Insufficient batch qty for Batch ${batch.batchNumber}. Available: ${batch.availableQty}, Requested: ${reqQty}.`,
        items: params.items,
        itemBatches: params.batches,
        transfer,
      };
    }
  }

  // Apply godownStocks movement (net company total unchanged)
  nextItems = nextItems.map((item) => {
    const reqQty = itemRequestedTotals.get(item.id);
    if (!reqQty) return item;
    const deltas = new Map<string, number>([
      [transfer.fromGodownId, -reqQty],
      [transfer.toGodownId, +reqQty],
    ]);
    return mutateItemAndGodownStock(item, deltas, godowns);
  });

  // Apply batch splitting/moving
  const destGodown = godowns.find((g) => g.id === transfer.toGodownId);
  const completedLines: StockTransferLine[] = transfer.items.map((line) => {
    if (!line.batchId) return line;
    const qty = Number(line.quantity) || 0;
    const srcIdx = nextBatches.findIndex((b) => b.id === line.batchId);
    if (srcIdx < 0) return line;
    const srcBatch = nextBatches[srcIdx];
    const nextSrcAvail = Math.max(0, Math.round(((Number(srcBatch.availableQty) || 0) - qty) * 1000) / 1000);
    const updatedSrc: ItemBatch = {
      ...srcBatch,
      availableQty: nextSrcAvail,
    };
    nextBatches[srcIdx] = { ...updatedSrc, status: computeBatchStatus(updatedSrc) };

    // Merge into matching batch in destination godown or create a split batch
    const destIdx = nextBatches.findIndex(
      (b) =>
        b.status !== 'WRITTEN_OFF' &&
        b.itemId === srcBatch.itemId &&
        b.godownId === transfer.toGodownId &&
        b.batchNumber.toLowerCase() === srcBatch.batchNumber.toLowerCase() &&
        (b.expiryDate || '') === (srcBatch.expiryDate || '')
    );

    if (destIdx >= 0) {
      const destB = nextBatches[destIdx];
      const updatedDest: ItemBatch = {
        ...destB,
        initialQty: Math.round(((Number(destB.initialQty) || 0) + qty) * 1000) / 1000,
        availableQty: Math.round(((Number(destB.availableQty) || 0) + qty) * 1000) / 1000,
      };
      nextBatches[destIdx] = { ...updatedDest, status: computeBatchStatus(updatedDest) };
    } else {
      const splitBatch: ItemBatch = {
        ...srcBatch,
        id: `bat_tr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        godownId: transfer.toGodownId,
        godownName: destGodown?.name || transfer.toGodownName,
        initialQty: qty,
        availableQty: qty,
        notes: `Transferred via ${transfer.transferNumber} from ${transfer.fromGodownName}`,
        createdAt: new Date().toISOString(),
      };
      splitBatch.status = computeBatchStatus(splitBatch);
      nextBatches.unshift(splitBatch);
    }

    return {
      ...line,
      batchNumber: srcBatch.batchNumber,
      expiryDate: srcBatch.expiryDate,
      mrp: srcBatch.mrp,
    };
  });

  const finalTransfer: StockTransfer = {
    ...transfer,
    items: completedLines,
    totalQuantity: completedLines.reduce((acc, l) => acc + (Number(l.quantity) || 0), 0),
    status: 'COMPLETED',
  };

  return {
    ok: true,
    items: nextItems,
    itemBatches: nextBatches,
    transfer: finalTransfer,
  };
}

/**
 * Writes off an expired or damaged batch and adjusts item/godown stock + records StockAdjustmentRecord.
 */
export function applyBatchWriteOffOrAdjustment(params: {
  items: ItemMaster[];
  batches: ItemBatch[];
  godowns?: Godown[];
  batchId: string;
  reason?: string;
  adjustedBy?: string;
}): {
  ok: boolean;
  items: ItemMaster[];
  itemBatches: ItemBatch[];
  adjustmentRecord?: StockAdjustmentRecord;
} {
  const godowns = ensureGodowns(params.godowns);
  const targetBatch = (params.batches || []).find((b) => b.id === params.batchId);
  if (!targetBatch || (Number(targetBatch.availableQty) || 0) <= 0) {
    return { ok: false, items: params.items, itemBatches: params.batches };
  }

  const writeOffQty = Number(targetBatch.availableQty) || 0;
  const masterItem = (params.items || []).find((i) => i.id === targetBatch.itemId);
  const prevStock = Number(masterItem?.currentStock || 0);
  const nextStock = Math.max(0, Math.round((prevStock - writeOffQty) * 1000) / 1000);

  const nextItems = (params.items || []).map((item) => {
    if (item.id !== targetBatch.itemId) return item;
    const map = reconcileGodownStocksMap(item, godowns);
    const gId = targetBatch.godownId || resolveDefaultGodownId(godowns);
    map[gId] = Math.max(0, Math.round(((Number(map[gId]) || 0) - writeOffQty) * 1000) / 1000);
    return {
      ...item,
      currentStock: nextStock,
      godownStocks: map,
      closingStockValue: undefined,
      importedClosingQty: undefined,
    };
  });

  const nextBatches = (params.batches || []).map((b) =>
    b.id === targetBatch.id
      ? {
          ...b,
          availableQty: 0,
          status: 'WRITTEN_OFF' as const,
          notes: `${b.notes ? b.notes + ' | ' : ''}Written off (${writeOffQty}) on ${new Date().toISOString().split('T')[0]}`,
        }
      : b
  );

  const adjustmentRecord: StockAdjustmentRecord = {
    id: `adj_exp_${Date.now()}`,
    itemId: targetBatch.itemId,
    itemName: targetBatch.itemName,
    itemCode: targetBatch.itemCode,
    date: new Date().toISOString().split('T')[0],
    previousStock: prevStock,
    newStock: nextStock,
    difference: -writeOffQty,
    reason: params.reason || 'Expired / Wastage',
    notes: `Batch ${targetBatch.batchNumber} (${targetBatch.godownName || 'Godown'}) write-off`,
    adjustedBy: params.adjustedBy || 'Admin',
    godownId: targetBatch.godownId,
    godownName: targetBatch.godownName,
    batchId: targetBatch.id,
    batchNumber: targetBatch.batchNumber,
  };

  return {
    ok: true,
    items: nextItems,
    itemBatches: nextBatches,
    adjustmentRecord,
  };
}
