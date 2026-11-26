import { AppData, ItemMaster, Currency } from '../types';

export type ValuationMethod = 'COST' | 'SALES' | 'WAC' | 'FIFO';

export interface ItemValuationDetail {
  item: ItemMaster;
  currentStock: number;
  unit: string;
  reorderPoint: number;
  reorderQuantity: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  deficit: number;
  costRate: number;
  salesRate: number;
  effectiveRate: number;
  valuationAmount: number;
  salesValuationAmount: number;
  potentialProfit: number;
  profitMarginPercent: number;
  category: string;
}

export interface CategoryValuationSummary {
  category: string;
  itemsCount: number;
  totalQuantity: number;
  totalCostValuation: number;
  totalSalesValuation: number;
  sharePercent: number;
}

export interface InventoryValuationReportData {
  items: ItemValuationDetail[];
  categories: CategoryValuationSummary[];
  totalItems: number;
  totalStockUnits: number;
  totalCostValuation: number;
  totalSalesValuation: number;
  totalPotentialProfit: number;
  overallProfitMarginPercent: number;
  lowStockCount: number;
  outOfStockCount: number;
  healthyStockCount: number;
  totalRestockCostRequired: number;
  method: ValuationMethod;
}

export interface StockMovementEntry {
  id: string;
  date: string;
  type: 'OPENING' | 'PURCHASE' | 'SALE' | 'ADJUSTMENT' | 'SALES_RETURN' | 'PURCHASE_RETURN';
  refNumber: string;
  partyName?: string;
  inflow: number;
  outflow: number;
  rate: number;
  amount: number;
  runningBalance: number;
  notes?: string;
}

/**
 * Compute Weighted Average Cost (WAC) Rate for an item based on purchase history
 */
export function calculateWACRate(item: ItemMaster, data: AppData): number {
  let totalCost = (Number(item.openingStock || 0)) * (Number(item.purchasePrice || 0));
  let totalUnits = Number(item.openingStock || 0);

  const purchaseBills = data.purchaseInvoices || [];
  for (const bill of purchaseBills) {
    if (bill.status === 'CANCELLED') continue;
    for (const line of bill.items || []) {
      if (
        (line.itemId && line.itemId === item.id) ||
        (line.itemName && line.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())
      ) {
        const qty = Number(line.quantity || 0);
        const rate = Number(line.rate || 0);
        totalCost += qty * rate;
        totalUnits += qty;
      }
    }
  }

  if (totalUnits > 0 && totalCost > 0) {
    return totalCost / totalUnits;
  }
  return Number(item.purchasePrice || 0);
}

/**
 * Compute FIFO (First-In, First-Out) Valuation for an item
 */
export function calculateFIFOValuation(item: ItemMaster, data: AppData): { rate: number; valuation: number } {
  const currentStock = Math.max(0, Number(item.currentStock || 0));
  if (currentStock === 0) return { rate: Number(item.purchasePrice || 0), valuation: 0 };

  // Collect all batches (Purchases sorted newest to oldest to evaluate remaining stock from recent batches)
  const batches: Array<{ date: string; qty: number; rate: number }> = [];

  const purchaseBills = (data.purchaseInvoices || []).filter(b => b.status !== 'CANCELLED');
  for (const bill of purchaseBills) {
    for (const line of bill.items || []) {
      if (
        (line.itemId && line.itemId === item.id) ||
        (line.itemName && line.itemName.trim().toLowerCase() === item.name.trim().toLowerCase())
      ) {
        batches.push({
          date: bill.date,
          qty: Number(line.quantity || 0),
          rate: Number(line.rate || 0)
        });
      }
    }
  }

  // Add opening stock as the oldest batch
  if ((item.openingStock || 0) > 0) {
    batches.unshift({
      date: '1970-01-01',
      qty: Number(item.openingStock),
      rate: Number(item.purchasePrice || 0)
    });
  }

  // In FIFO, remaining stock is valued from the most recent purchases
  batches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  let remainingNeeded = currentStock;
  let totalValuation = 0;

  for (const batch of batches) {
    if (remainingNeeded <= 0) break;
    const qtyTaken = Math.min(batch.qty, remainingNeeded);
    totalValuation += qtyTaken * batch.rate;
    remainingNeeded -= qtyTaken;
  }

  // If there's still stock not accounted by recorded batches, use base purchase price
  if (remainingNeeded > 0) {
    totalValuation += remainingNeeded * (Number(item.purchasePrice) || 0);
  }

  const effectiveRate = totalValuation / currentStock;
  return { rate: effectiveRate, valuation: totalValuation };
}

/**
 * Calculate full inventory valuation report for all items
 */
export function calculateInventoryValuationReport(
  data: AppData,
  method: ValuationMethod = 'COST'
): InventoryValuationReportData {
  const items = data.items || [];
  let totalCostValuation = 0;
  let totalSalesValuation = 0;
  let totalStockUnits = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalRestockCostRequired = 0;

  const categoryMap: { [cat: string]: { count: number; qty: number; costVal: number; salesVal: number } } = {};

  const details: ItemValuationDetail[] = items.map(item => {
    const stock = Number(item.currentStock || 0);
    const reorderPoint = Number(item.minStockLevel || item.minStockAlert || 5);
    const reorderQty = Number(item.reorderQuantity || Math.max(reorderPoint * 2, 10));
    const costRate = Number(item.purchasePrice || 0);
    const salesRate = Number(item.salesPrice || item.sellingPrice || (costRate * 1.2));
    const isOutOfStock = stock <= 0;
    const isLowStock = stock <= reorderPoint;
    const deficit = Math.max(0, reorderPoint - stock);

    if (isOutOfStock) outOfStockCount++;
    else if (isLowStock) lowStockCount++;

    if (isLowStock) {
      totalRestockCostRequired += (deficit + reorderQty) * costRate;
    }

    let effectiveRate = costRate;
    let valuationAmount = 0;

    if (method === 'SALES') {
      effectiveRate = salesRate;
      valuationAmount = Math.max(0, stock) * salesRate;
    } else if (method === 'WAC') {
      effectiveRate = calculateWACRate(item, data);
      valuationAmount = Math.max(0, stock) * effectiveRate;
    } else if (method === 'FIFO') {
      const fifo = calculateFIFOValuation(item, data);
      effectiveRate = fifo.rate;
      valuationAmount = fifo.valuation;
    } else {
      // Standard Cost Price
      effectiveRate = costRate;
      valuationAmount = Math.max(0, stock) * costRate;
    }

    const cleanStock = Math.round((Number(stock) || 0) * 1000) / 1000;
    const itemSalesValuation = Math.max(0, cleanStock) * salesRate;
    const itemCostValuation = Math.max(0, cleanStock) * costRate;
    const effectiveCostOrMethodVal =
      method === 'SALES' ? itemCostValuation : Math.max(0, Math.round(valuationAmount * 100) / 100);
    const potentialProfit = Math.max(0, itemSalesValuation - effectiveCostOrMethodVal);
    const profitMarginPercent = itemSalesValuation > 0 ? (potentialProfit / itemSalesValuation) * 100 : 0;

    totalCostValuation += effectiveCostOrMethodVal;
    totalSalesValuation += itemSalesValuation;
    totalStockUnits = Math.round((totalStockUnits + Math.max(0, cleanStock)) * 1000) / 1000;

    // Grouping by category
    const cat = item.category || 'General';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { count: 0, qty: 0, costVal: 0, salesVal: 0 };
    }
    categoryMap[cat].count += 1;
    categoryMap[cat].qty = Math.round((categoryMap[cat].qty + Math.max(0, cleanStock)) * 1000) / 1000;
    categoryMap[cat].costVal += effectiveCostOrMethodVal;
    categoryMap[cat].salesVal += itemSalesValuation;

    return {
      item,
      currentStock: cleanStock,
      unit: item.unit || 'PCS',
      reorderPoint,
      reorderQuantity: reorderQty,
      isLowStock,
      isOutOfStock,
      deficit,
      costRate,
      salesRate,
      effectiveRate,
      valuationAmount,
      salesValuationAmount: itemSalesValuation,
      potentialProfit,
      profitMarginPercent,
      category: cat
    };
  });

  const totalPotentialProfit = Math.max(0, totalSalesValuation - totalCostValuation);
  const overallProfitMarginPercent = totalSalesValuation > 0 ? (totalPotentialProfit / totalSalesValuation) * 100 : 0;

  const categories: CategoryValuationSummary[] = Object.entries(categoryMap).map(([category, info]) => ({
    category,
    itemsCount: info.count,
    totalQuantity: info.qty,
    totalCostValuation: info.costVal,
    totalSalesValuation: info.salesVal,
    sharePercent: totalCostValuation > 0 ? (info.costVal / totalCostValuation) * 100 : 0
  })).sort((a, b) => b.totalCostValuation - a.totalCostValuation);

  return {
    items: details,
    categories,
    totalItems: items.length,
    totalStockUnits,
    totalCostValuation,
    totalSalesValuation,
    totalPotentialProfit,
    overallProfitMarginPercent,
    lowStockCount: lowStockCount + outOfStockCount,
    outOfStockCount,
    healthyStockCount: Math.max(0, items.length - (lowStockCount + outOfStockCount)),
    totalRestockCostRequired,
    method
  };
}

/**
 * Get complete chronological stock movement history for a specific item
 */
export function getItemStockMovements(item: ItemMaster, data: AppData): StockMovementEntry[] {
  const movements: StockMovementEntry[] = [];
  const itemId = item.id;
  const itemNameLower = item.name.trim().toLowerCase();

  // 1. Opening Stock
  const openingQty = Number(item.openingStock || 0);
  if (openingQty > 0) {
    movements.push({
      id: 'mov_open_' + itemId,
      date: data.company.financialYearStart || '2026-04-01',
      type: 'OPENING',
      refNumber: 'OPEN-STOCK',
      partyName: 'Opening Balance (आरंभिक स्टॉक)',
      inflow: openingQty,
      outflow: 0,
      rate: Number(item.purchasePrice || 0),
      amount: openingQty * Number(item.purchasePrice || 0),
      runningBalance: openingQty,
      notes: 'Initial stock balance carried forward'
    });
  }

  // 2. Purchases (Inward Inflow)
  const purchaseBills = data.purchaseInvoices || [];
  for (const bill of purchaseBills) {
    if (bill.status === 'CANCELLED') continue;
    for (const line of bill.items || []) {
      if (
        (line.itemId && line.itemId === itemId) ||
        (line.itemName && line.itemName.trim().toLowerCase() === itemNameLower)
      ) {
        movements.push({
          id: 'mov_pur_' + bill.id + '_' + line.id,
          date: bill.date,
          type: 'PURCHASE',
          refNumber: bill.billNumber || bill.supplierInvoiceNo || 'BILL',
          partyName: bill.partyName || 'Vendor',
          inflow: Number(line.quantity || 0),
          outflow: 0,
          rate: Number(line.rate || 0),
          amount: Number(line.totalAmount || (line.quantity * line.rate) || 0),
          runningBalance: 0, // Computed below
          notes: `Purchase Bill from ${bill.partyName}`
        });
      }
    }
  }

  // 3. Sales Invoices (Outward Outflow)
  const salesInvoices = data.invoices || [];
  for (const inv of salesInvoices) {
    if (inv.status === 'CANCELLED') continue;
    for (const line of inv.items || []) {
      if (
        (line.itemId && line.itemId === itemId) ||
        (line.itemName && line.itemName.trim().toLowerCase() === itemNameLower)
      ) {
        movements.push({
          id: 'mov_sale_' + inv.id + '_' + line.id,
          date: inv.date,
          type: 'SALE',
          refNumber: inv.invoiceNumber || 'INV',
          partyName: inv.partyName || 'Customer',
          inflow: 0,
          outflow: Number(line.quantity || 0),
          rate: Number(line.rate || 0),
          amount: Number(line.totalAmount || (line.quantity * line.rate) || 0),
          runningBalance: 0, // Computed below
          notes: `Sales Invoice to ${inv.partyName}`
        });
      }
    }
  }

  // 4. Manual Stock Adjustments (if any recorded in AppData)
  const adjustments = data.stockAdjustments || [];
  for (const adj of adjustments) {
    if (adj.itemId === itemId) {
      const diff = Number(adj.difference || 0);
      movements.push({
        id: 'mov_adj_' + adj.id,
        date: adj.date,
        type: 'ADJUSTMENT',
        refNumber: 'ADJ-' + adj.id.slice(-6).toUpperCase(),
        partyName: `Adjustment (${adj.reason})`,
        inflow: diff > 0 ? diff : 0,
        outflow: diff < 0 ? Math.abs(diff) : 0,
        rate: Number(item.purchasePrice || 0),
        amount: Math.abs(diff) * Number(item.purchasePrice || 0),
        runningBalance: 0,
        notes: adj.notes || adj.reason
      });
    }
  }

  // 5. Debit / Credit Notes (Returns)
  const notes = data.debitCreditNotes || [];
  for (const note of notes) {
    if (note.originalInvoiceNo) {
      if (note.type === 'CREDIT_NOTE') {
        // Sales Return: stock comes back
        movements.push({
          id: 'mov_cr_' + note.id,
          date: note.date,
          type: 'SALES_RETURN',
          refNumber: note.noteNumber,
          partyName: `Return from ${note.partyName}`,
          inflow: 1, // Nominal 1 unit if item-level not specified
          outflow: 0,
          rate: note.grandTotal,
          amount: note.grandTotal,
          runningBalance: 0,
          notes: `Sales Return Credit Note #${note.noteNumber}`
        });
      } else if (note.type === 'DEBIT_NOTE') {
        // Purchase Return: stock goes out
        movements.push({
          id: 'mov_dr_' + note.id,
          date: note.date,
          type: 'PURCHASE_RETURN',
          refNumber: note.noteNumber,
          partyName: `Return to ${note.partyName}`,
          inflow: 0,
          outflow: 1,
          rate: note.grandTotal,
          amount: note.grandTotal,
          runningBalance: 0,
          notes: `Purchase Return Debit Note #${note.noteNumber}`
        });
      }
    }
  }

  // Sort chronological
  movements.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Compute running balance
  let running = 0;
  for (const m of movements) {
    running += (m.inflow - m.outflow);
    m.runningBalance = running;
  }

  return movements;
}
