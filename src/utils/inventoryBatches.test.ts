import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEan13Barcode,
  isValidEan13Barcode,
  encodeCode39Bars,
  getExpiryStatus,
  pickFefoBatchesForSale,
  findItemOrBatchByScan,
  applySalesInvoiceStockAndBatchChanges,
  applyPurchaseBillStockAndBatchChanges,
  executeInterGodownTransfer,
  applyBatchWriteOffOrAdjustment,
  getItemStockInGodown,
} from './inventoryBatches';
import { Godown, ItemBatch, ItemMaster, PurchaseInvoice, SalesInvoice } from '../types';

const sampleGodowns: Godown[] = [
  {
    id: 'gdw_main',
    name: 'Main Warehouse',
    code: 'WH-01',
    godownType: 'MAIN_WAREHOUSE',
    isDefault: true,
    isPosCounter: false,
    isActive: true,
  },
  {
    id: 'gdw_pos',
    name: 'Retail Counter POS',
    code: 'POS-01',
    godownType: 'POS_COUNTER',
    isDefault: false,
    isPosCounter: true,
    isActive: true,
  },
];

const sampleItem: ItemMaster = {
  id: 'itm_1',
  code: 'SKU-101',
  name: 'Paracetamol 650mg Strip',
  description: 'Strip of 15 tablets',
  hsnSacCode: '3004',
  unit: 'BOX',
  purchasePrice: 20,
  salesPrice: 32,
  mrp: 35,
  taxRate: 12,
  currentStock: 50,
  minStockLevel: 10,
  category: 'Pharma',
  barcode: '8901234567893',
  defaultGodownId: 'gdw_main',
  godownStocks: {
    gdw_main: 30,
    gdw_pos: 20,
  },
  trackBatchExpiry: true,
};

const sampleBatches: ItemBatch[] = [
  {
    id: 'bat_expired',
    itemId: 'itm_1',
    itemName: sampleItem.name,
    godownId: 'gdw_pos',
    godownName: 'Retail Counter POS',
    batchNumber: 'B-OLD',
    expiryDate: '2026-01-10',
    purchaseRate: 20,
    salesRate: 32,
    mrp: 35,
    initialQty: 5,
    availableQty: 5,
    barcode: '8900000000017',
    status: 'EXPIRED',
  },
  {
    id: 'bat_later',
    itemId: 'itm_1',
    itemName: sampleItem.name,
    godownId: 'gdw_pos',
    godownName: 'Retail Counter POS',
    batchNumber: 'B-DEC26',
    expiryDate: '2026-12-31',
    purchaseRate: 20,
    salesRate: 32,
    mrp: 35,
    initialQty: 10,
    availableQty: 10,
    barcode: '8900000000024',
    status: 'ACTIVE',
  },
  {
    id: 'bat_sooner',
    itemId: 'itm_1',
    itemName: sampleItem.name,
    godownId: 'gdw_pos',
    godownName: 'Retail Counter POS',
    batchNumber: 'B-AUG26',
    expiryDate: '2026-08-15',
    purchaseRate: 20,
    salesRate: 32,
    mrp: 35,
    initialQty: 5,
    availableQty: 5,
    barcode: '8900000000031',
    status: 'ACTIVE',
  },
];

test('EAN-13 generator produces valid check digits and Code-39 encodes bars', () => {
  const code1 = generateEan13Barcode('itm_12345');
  const code2 = generateEan13Barcode('998877665');
  assert.equal(code1.length, 13);
  assert.ok(isValidEan13Barcode(code1));
  assert.ok(isValidEan13Barcode(code2));

  const encoded = encodeCode39Bars(code1);
  assert.ok(encoded.bars.length > 20);
  assert.ok(encoded.totalWidth > 50);
});

test('Expiry status & FEFO allocation pick soonest non-expired batch and skip expired', () => {
  assert.equal(getExpiryStatus('2026-01-10', '2026-06-01').bucket, 'EXPIRED');
  assert.equal(getExpiryStatus('2026-06-15', '2026-06-01').bucket, 'EXPIRING_SOON');
  assert.equal(getExpiryStatus('2026-08-01', '2026-06-01').bucket, 'WATCH');
  assert.equal(getExpiryStatus('2027-01-01', '2026-06-01').bucket, 'SAFE');

  const fefo = pickFefoBatchesForSale(sampleBatches, 'itm_1', 8, 'gdw_pos', false, '2026-06-01');
  assert.equal(fefo.unallocatedQty, 0);
  assert.equal(fefo.allocations.length, 2);
  assert.equal(fefo.allocations[0].batch.id, 'bat_sooner');
  assert.equal(fefo.allocations[0].qty, 5);
  assert.equal(fefo.allocations[1].batch.id, 'bat_later');
  assert.equal(fefo.allocations[1].qty, 3);
});

test('Barcode scanner resolves batch barcode and item barcode cleanly', () => {
  const scanBatch = findItemOrBatchByScan('8900000000024', [sampleItem], sampleBatches, 'gdw_pos', '2026-06-01');
  assert.equal(scanBatch?.matchedBy, 'BATCH_BARCODE');
  assert.equal(scanBatch?.batch?.id, 'bat_later');

  const scanItem = findItemOrBatchByScan('8901234567893', [sampleItem], sampleBatches, 'gdw_pos', '2026-06-01');
  assert.equal(scanItem?.matchedBy, 'ITEM_BARCODE');
  assert.equal(scanItem?.batch?.id, 'bat_sooner'); // FEFO batch auto-picked
});

test('Sales invoice multi-line stock, batch & godown deduction and deletion roundtrip cleanly', () => {
  const sale: SalesInvoice = {
    id: 'inv_pos_1',
    invoiceNumber: 'POS/2026/001',
    date: '2026-06-01',
    dueDate: '2026-06-01',
    invoiceType: 'RETAIL_BILL',
    partyId: 'pty_walkin',
    partyName: 'Walk-in Customer',
    partyGstin: '',
    partyAddress: '',
    partyState: 'Maharashtra',
    placeOfSupply: 'Maharashtra',
    isInterState: false,
    godownId: 'gdw_pos',
    godownName: 'Retail Counter POS',
    isPosSale: true,
    items: [
      {
        id: 'l1',
        itemId: 'itm_1',
        itemName: sampleItem.name,
        hsnSacCode: '3004',
        quantity: 5,
        unit: 'BOX',
        rate: 32,
        discountPercent: 0,
        taxRate: 12,
        taxAmount: 19.2,
        totalAmount: 179.2,
        batchId: 'bat_sooner',
        godownId: 'gdw_pos',
      },
      {
        id: 'l2',
        itemId: 'itm_1',
        itemName: sampleItem.name,
        hsnSacCode: '3004',
        quantity: 4,
        unit: 'BOX',
        rate: 32,
        discountPercent: 0,
        taxRate: 12,
        taxAmount: 15.36,
        totalAmount: 143.36,
        batchId: 'bat_later',
        godownId: 'gdw_pos',
      },
    ],
    subtotal: 288,
    totalDiscount: 0,
    cgstAmount: 17.28,
    sgstAmount: 17.28,
    igstAmount: 0,
    totalTax: 34.56,
    roundOff: 0,
    grandTotal: 322.56,
    amountPaid: 322.56,
    status: 'PAID',
  };

  const afterSale = applySalesInvoiceStockAndBatchChanges({
    items: [sampleItem],
    batches: sampleBatches,
    godowns: sampleGodowns,
    nextInvoice: sale,
  });

  // 50 - (5 + 4) = 41 total; pos 20 - 9 = 11; main stays 30
  assert.equal(afterSale.items[0].currentStock, 41);
  assert.equal(getItemStockInGodown(afterSale.items[0], 'gdw_pos', sampleGodowns), 11);
  assert.equal(getItemStockInGodown(afterSale.items[0], 'gdw_main', sampleGodowns), 30);
  assert.equal(afterSale.itemBatches.find((b) => b.id === 'bat_sooner')?.availableQty, 0);
  assert.equal(afterSale.itemBatches.find((b) => b.id === 'bat_sooner')?.status, 'DEPLETED');
  assert.equal(afterSale.itemBatches.find((b) => b.id === 'bat_later')?.availableQty, 6);

  // Deleting sale restores exact quantities
  const afterDelete = applySalesInvoiceStockAndBatchChanges({
    items: afterSale.items,
    batches: afterSale.itemBatches,
    godowns: sampleGodowns,
    previousInvoice: sale,
    nextInvoice: null,
  });

  assert.equal(afterDelete.items[0].currentStock, 50);
  assert.equal(getItemStockInGodown(afterDelete.items[0], 'gdw_pos', sampleGodowns), 20);
  assert.equal(afterDelete.itemBatches.find((b) => b.id === 'bat_sooner')?.availableQty, 5);
  assert.equal(afterDelete.itemBatches.find((b) => b.id === 'bat_later')?.availableQty, 10);
});

test('Purchase bill auto-creates ItemBatch & updates destination godown, and inter-godown transfer splits batch', () => {
  const bill: PurchaseInvoice = {
    id: 'pb_1',
    billNumber: 'PB/2026/001',
    supplierInvoiceNo: 'SUP-991',
    date: '2026-06-02',
    dueDate: '2026-07-02',
    partyId: 'pty_sup',
    partyName: 'Cipla Distributors',
    isInterState: false,
    godownId: 'gdw_main',
    godownName: 'Main Warehouse',
    items: [
      {
        id: 'pl1',
        itemId: 'itm_1',
        itemName: sampleItem.name,
        hsnSacCode: '3004',
        quantity: 25,
        unit: 'BOX',
        rate: 19,
        discountPercent: 0,
        taxRate: 12,
        taxAmount: 57,
        totalAmount: 532,
        batchNumber: 'LOT-MAR27',
        expiryDate: '2027-03-31',
        mrp: 36,
      },
    ],
    subtotal: 475,
    cgstAmount: 28.5,
    sgstAmount: 28.5,
    igstAmount: 0,
    totalTax: 57,
    grandTotal: 532,
    amountPaid: 0,
    status: 'UNPAID',
  };

  const afterPurchase = applyPurchaseBillStockAndBatchChanges({
    items: [sampleItem],
    batches: sampleBatches,
    godowns: sampleGodowns,
    nextBill: bill,
  });

  assert.equal(afterPurchase.items[0].currentStock, 75);
  assert.equal(getItemStockInGodown(afterPurchase.items[0], 'gdw_main', sampleGodowns), 55);
  const createdBatch = afterPurchase.itemBatches.find((b) => b.batchNumber === 'LOT-MAR27');
  assert.ok(createdBatch);
  assert.equal(createdBatch?.availableQty, 25);
  assert.equal(createdBatch?.godownId, 'gdw_main');

  // Transfer 12 units of LOT-MAR27 from gdw_main -> gdw_pos
  const trResult = executeInterGodownTransfer({
    items: afterPurchase.items,
    batches: afterPurchase.itemBatches,
    godowns: sampleGodowns,
    transfer: {
      id: 'tr_1',
      transferNumber: 'TRF/2026/001',
      date: '2026-06-03',
      fromGodownId: 'gdw_main',
      fromGodownName: 'Main Warehouse',
      toGodownId: 'gdw_pos',
      toGodownName: 'Retail Counter POS',
      items: [
        {
          id: 'tl_1',
          itemId: 'itm_1',
          itemName: sampleItem.name,
          unit: 'BOX',
          quantity: 12,
          batchId: createdBatch!.id,
        },
      ],
      totalQuantity: 12,
      status: 'COMPLETED',
    },
  });

  assert.equal(trResult.ok, true);
  // Total stock invariant: 75
  assert.equal(trResult.items[0].currentStock, 75);
  assert.equal(getItemStockInGodown(trResult.items[0], 'gdw_main', sampleGodowns), 43);
  assert.equal(getItemStockInGodown(trResult.items[0], 'gdw_pos', sampleGodowns), 32);

  const srcBatchAfter = trResult.itemBatches.find((b) => b.id === createdBatch!.id);
  const destBatchAfter = trResult.itemBatches.find(
    (b) => b.batchNumber === 'LOT-MAR27' && b.godownId === 'gdw_pos'
  );
  assert.equal(srcBatchAfter?.availableQty, 13);
  assert.equal(destBatchAfter?.availableQty, 12);

  // Write off expired batch
  const writeOff = applyBatchWriteOffOrAdjustment({
    items: trResult.items,
    batches: trResult.itemBatches,
    godowns: sampleGodowns,
    batchId: 'bat_expired',
  });
  assert.equal(writeOff.ok, true);
  assert.equal(writeOff.items[0].currentStock, 70);
  assert.equal(writeOff.itemBatches.find((b) => b.id === 'bat_expired')?.status, 'WRITTEN_OFF');
});
