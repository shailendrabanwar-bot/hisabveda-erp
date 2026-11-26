import React, { useState } from 'react';
import { X, PackagePlus, PlusCircle, Sparkles, ScanBarcode, Warehouse } from 'lucide-react';
import { ItemMaster, Currency } from '../../types';
import { STANDARD_UNITS, getCustomUnits, saveCustomUnit } from '../../data/hsnDirectory';
import { generateEan13Barcode } from '../../utils/inventoryBatches';
import { getCurrencySymbol } from '../../utils/companyProfile';
import { BarcodeSvg } from './BarcodeSvg';

interface QuickAddStockItemModalProps {
  isHindi: boolean;
  onSave: (item: ItemMaster) => void;
  onClose: () => void;
  initialBarcode?: string;
  initialName?: string;
  initialOpeningStock?: number;
  defaultGodownId?: string;
  defaultGodownName?: string;
  submitLabel?: string;
  currency?: Currency;
  gstEnabled?: boolean;
  cessEnabled?: boolean;
}

export const QuickAddStockItemModal: React.FC<QuickAddStockItemModalProps> = ({
  isHindi,
  onSave,
  onClose,
  initialBarcode = '',
  initialName = '',
  initialOpeningStock,
  defaultGodownId,
  defaultGodownName,
  submitLabel,
  currency = 'INR',
  gstEnabled = true,
  cessEnabled = false,
}) => {
  const currencySymbol = getCurrencySymbol(currency);
  const isFromBarcodeScan = Boolean(initialBarcode.trim());
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState('');
  const [code, setCode] = useState('');
  const [hsnSacCode, setHsnSacCode] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('');
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [wholesalePrice, setWholesalePrice] = useState<number>(0);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [gstRate, setGstRate] = useState<number>(0);
  const [cessRate, setCessRate] = useState<number>(0);
  const [openingStock, setOpeningStock] = useState<number>(
    initialOpeningStock !== undefined ? initialOpeningStock : 0
  );
  const [barcode, setBarcode] = useState<string>(initialBarcode);
  const [mrp, setMrp] = useState<number>(0);
  const [trackBatchExpiry, setTrackBatchExpiry] = useState<boolean>(false);

  // Custom Unit States
  const [customUnits, setCustomUnits] = useState<string[]>(() => getCustomUnits());
  const [showAddUnitInput, setShowAddUnitInput] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');

  const allAvailableUnits = Array.from(new Set([...STANDARD_UNITS, ...customUnits]));

  const handleAddNewCustomUnit = () => {
    if (!newUnitName.trim()) return;
    const cleanUnit = newUnitName.trim().toUpperCase();
    const updated = saveCustomUnit(cleanUnit);
    setCustomUnits(updated);
    setUnit(cleanUnit);
    setNewUnitName('');
    setShowAddUnitInput(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const id = 'item_' + Date.now();
    const finalBarcode = barcode.trim() || generateEan13Barcode(id);
    const stockQty = Math.max(0, Number(openingStock) || 0);
    const newItem: ItemMaster = {
      id,
      name: name.trim(),
      description: description.trim() || name.trim(),
      code: code.trim() || ('ITM-' + Date.now()),
      hsnSacCode: hsnSacCode.trim(),
      category: category || 'General Goods',
      unit: unit || 'PCS',
      salesPrice: Number(sellingPrice) || 0,
      sellingPrice: Number(sellingPrice) || 0,
      wholesalePrice: Number(wholesalePrice) > 0 ? Number(wholesalePrice) : undefined,
      purchasePrice: Number(purchasePrice) || 0,
      mrp: Number(mrp) || Number(sellingPrice) || 0,
      barcode: finalBarcode,
      trackBatchExpiry,
      taxRate: gstEnabled ? (Number(gstRate) || 0) : 0,
      gstRate: gstEnabled ? (Number(gstRate) || 0) : 0,
      cessRate: gstEnabled && cessEnabled ? (Number(cessRate) || 0) : 0,
      openingStock: stockQty,
      currentStock: stockQty,
      defaultGodownId: defaultGodownId || undefined,
      godownStocks: defaultGodownId ? { [defaultGodownId]: stockQty } : undefined,
      minStockLevel: 0,
      minStockAlert: 0
    };

    onSave(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded-xl border ${
              isFromBarcodeScan
                ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                : 'bg-emerald-600/20 text-emerald-400 border-emerald-500/30'
            }`}>
              {isFromBarcodeScan ? <ScanBarcode className="w-5 h-5" /> : <PackagePlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">
                {isFromBarcodeScan
                  ? (isHindi ? 'स्कैन किए गए नए बारकोड से आइटम व स्टॉक जोड़ें' : 'Register Scanned Barcode & Add Stock')
                  : (isHindi ? 'त्वरित नया स्टॉक आइटम जोड़ें (+ Quick Add Stock Ledger)' : '+ Quick Create Stock Item / Ledger')}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isFromBarcodeScan
                  ? (isHindi ? 'नाम, HSN कोड, विवरण व स्टॉक भरकर सीधे बिल में जोड़ें' : 'Enter Item Name, HSN Code, Description & Stock Qty to bill immediately')
                  : (isHindi ? 'इनवॉइस बनाते समय सीधे नया उत्पाद या स्टॉक ledger जोड़ें' : 'Add new product master directly during invoice creation')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {isFromBarcodeScan && (
            <div className="bg-cyan-950/40 border border-cyan-500/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ScanBarcode className="w-4 h-4 text-cyan-400 shrink-0" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-cyan-300">
                    {isHindi ? 'स्कैन किया गया बारकोड' : 'Scanned Barcode'}
                  </div>
                  <div className="font-mono font-black text-sm text-white">{initialBarcode}</div>
                </div>
              </div>
              {defaultGodownName && (
                <div className="flex items-center gap-1.5 bg-slate-900/90 border border-slate-700 px-2.5 py-1 rounded-lg text-[11px] text-amber-300 font-bold">
                  <Warehouse className="w-3.5 h-3.5 text-amber-400" />
                  <span>{defaultGodownName}</span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? 'सामग्री / उत्पाद का नाम (Item / Product Name) *' : 'Stock Item Name *'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wireless Ergonomic Mouse / Cotton Shirt"
                className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl px-3 py-2 font-semibold focus:border-emerald-500 outline-none"
                required
                autoFocus
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? 'उत्पाद विवरण (Description / Brand / Size / Spec)' : 'Item Description (Brand / Size / Spec)'}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={isHindi ? 'उदा. 500ml पैक, लाल रंग, 1 साल वारंटी या अन्य विवरण...' : 'e.g. 500ml Pack, Model spec, color or customer bill note...'}
                className="w-full bg-slate-950 text-slate-100 border border-slate-700 rounded-xl px-3 py-2 focus:border-cyan-500 outline-none"
              />
            </div>


            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? 'एचएसएन / एसएससी कोड (HSN/SAC Code)' : 'HSN / SAC Code'}
              </label>
              <input
                type="text"
                value={hsnSacCode}
                onChange={(e) => setHsnSacCode(e.target.value)}
                placeholder="8517"
                className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl px-3 py-2 font-mono focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-300 font-bold">
                  {isHindi ? 'मापक इकाई (Unit)' : 'Unit of Measurement (UOM)'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddUnitInput(!showAddUnitInput)}
                  className="text-[10px] text-amber-300 hover:text-amber-200 font-bold flex items-center gap-0.5"
                >
                  <PlusCircle className="w-3 h-3" />
                  <span>{isHindi ? '+ नई यूनिट' : '+ New Unit'}</span>
                </button>
              </div>

              {showAddUnitInput ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    placeholder="e.g. ROLL / BUNDLE"
                    className="w-full bg-slate-950 text-amber-300 border border-amber-500/60 rounded-xl px-2 py-1.5 uppercase font-bold text-xs outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleAddNewCustomUnit}
                    className="px-2 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs rounded-xl"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <select
                  value={unit}
                  onChange={(e) => {
                    if (e.target.value === '__ADD_NEW__') {
                      setShowAddUnitInput(true);
                    } else {
                      setUnit(e.target.value);
                    }
                  }}
                  className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl px-3 py-2 font-semibold focus:border-emerald-500 outline-none"
                >
                  <option value="">{isHindi ? '-- इकाई चुनें --' : '-- Select Unit --'}</option>
                  {allAvailableUnits.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                  <option value="__ADD_NEW__">+ {isHindi ? 'नई यूनिट जोड़ें (Custom UOM)' : 'Add New Unit...'}</option>
                </select>
              )}
            </div>

            {gstEnabled && (
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  {isHindi ? 'जीएसटी दर % (GST Rate)' : 'GST Rate (%)'}
                </label>
                <select
                  value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  className="w-full bg-slate-950 text-white border border-slate-700 rounded-xl px-3 py-2 font-bold focus:border-emerald-500 outline-none"
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5% GST</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST</option>
                  <option value={28}>28% GST</option>
                </select>
              </div>
            )}

            {gstEnabled && cessEnabled && (
              <div>
                <label className="block text-amber-300 font-bold mb-1">
                  {isHindi ? 'सेस दर % (Cess Rate)' : 'Cess Rate (%)'}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={cessRate || ''}
                  onChange={(e) => setCessRate(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full bg-slate-950 text-amber-300 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold focus:border-amber-500 outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? `बिक्री मूल्य - रिटेल (Retail Sale ${currencySymbol})` : `Retail Sale Price (${currencySymbol})`}
              </label>
              <input
                type="number"
                value={sellingPrice || ''}
                onChange={(e) => setSellingPrice(Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-950 text-emerald-400 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? `थोक मूल्य (Wholesale Price ${currencySymbol})` : `Wholesale Price (${currencySymbol} Optional)`}
              </label>
              <input
                type="number"
                value={wholesalePrice || ''}
                onChange={(e) => setWholesalePrice(Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-950 text-cyan-300 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold focus:border-cyan-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? `खरीद दर / कॉस्ट (Purchase Rate ${currencySymbol})` : `Purchase Cost (${currencySymbol})`}
              </label>
              <input
                type="number"
                value={purchasePrice || ''}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded-xl px-3 py-2 font-mono focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? `एमआरपी (MRP ${currencySymbol} - वैकल्पिक)` : `MRP (${currencySymbol} - Optional)`}
              </label>
              <input
                type="number"
                value={mrp || ''}
                onChange={(e) => setMrp(Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-950 text-slate-200 border border-slate-700 rounded-xl px-3 py-2 font-mono focus:border-emerald-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">
                {isHindi ? 'प्रारंभिक स्टॉक मात्रा' : 'Initial Opening Stock'}
              </label>
              <input
                type="number"
                value={openingStock || ''}
                onChange={(e) => setOpeningStock(Number(e.target.value))}
                placeholder="0"
                className="w-full bg-slate-950 text-amber-300 border border-slate-700 rounded-xl px-3 py-2 font-mono font-bold focus:border-emerald-500 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-300 font-bold">
                  {isHindi ? 'बारकोड / EAN-13 (खाली छोड़ने पर स्वतः बनेगा)' : 'Barcode / EAN-13 (Auto-generated if blank)'}
                </label>
                <button
                  type="button"
                  onClick={() => setBarcode(generateEan13Barcode(name || code || Date.now()))}
                  className="text-[11px] bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>{isHindi ? 'ऑटो बारकोड बनाएं' : 'Auto-Generate Barcode'}</span>
                </button>
              </div>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="890..."
                className="w-full bg-slate-950 text-cyan-300 border border-slate-700 rounded-xl px-3 py-2 font-mono focus:border-cyan-500 outline-none"
              />
              {barcode.trim() && (
                <div className="mt-2 bg-white rounded-xl p-2 flex items-center justify-between border border-slate-300">
                  <BarcodeSvg value={barcode.trim()} height={28} />
                  <span className="text-[10px] font-mono font-bold text-slate-700 px-2">POS READY</span>
                </div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-semibold">
                <input
                  type="checkbox"
                  checked={trackBatchExpiry}
                  onChange={(e) => setTrackBatchExpiry(e.target.checked)}
                  className="w-4 h-4 accent-cyan-500 rounded"
                />
                <span>{isHindi ? 'बैच एवं एक्सपायरी तिथि ट्रैक करें (Batch & Expiry Tracking)' : 'Enable Batch & Expiry Date Tracking (FEFO)'}</span>
              </label>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-emerald-600/30 flex items-center gap-1.5"
            >
              <PackagePlus className="w-4 h-4" />
              <span>{submitLabel || (isHindi ? 'स्टॉक आइटम सेव करें' : 'Save & Add Item')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
