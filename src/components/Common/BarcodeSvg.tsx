import React, { useState } from 'react';
import { Printer, X, Tag, Copy, Check } from 'lucide-react';
import { encodeCode39Bars, generateEan13Barcode } from '../../utils/inventoryBatches';
import { printDomElement } from '../../utils/printReport';

interface BarcodeSvgProps {
  value: string;
  height?: number;
  className?: string;
  showText?: boolean;
  darkText?: boolean;
}

export const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  height = 42,
  className = '',
  showText = true,
  darkText = true,
}) => {
  const { bars, totalWidth, normalizedText } = encodeCode39Bars(value || '000000');

  return (
    <div className={`inline-flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox={`0 0 ${totalWidth} ${height}`}
        className="w-full h-auto max-w-full"
        style={{ minHeight: `${Math.max(24, height - 8)}px` }}
        role="img"
        aria-label={`Barcode ${normalizedText}`}
      >
        <rect x={0} y={0} width={totalWidth} height={height} fill="#ffffff" />
        {bars.map((bar, idx) => (
          <rect
            key={idx}
            x={bar.x}
            y={2}
            width={bar.width}
            height={height - 4}
            fill="#0f172a"
          />
        ))}
      </svg>
      {showText && (
        <span
          className={`font-mono font-bold tracking-[0.22em] text-[10px] leading-tight mt-0.5 ${
            darkText ? 'text-slate-900' : 'text-white'
          }`}
        >
          {normalizedText}
        </span>
      )}
    </div>
  );
};

export interface BarcodeLabelTarget {
  itemName: string;
  itemCode?: string;
  barcode: string;
  price?: number;
  wholesalePrice?: number;
  mrp?: number;
  unit?: string;
  batchNumber?: string;
  expiryDate?: string;
  godownName?: string;
}

interface BarcodePrintModalProps {
  target: BarcodeLabelTarget;
  companyName: string;
  currencySymbol?: string;
  isHindi: boolean;
  onClose: () => void;
}

export type BarcodeSheetLayout = 'ONE_UP' | 'TWO_UP' | 'A4_SHEET';

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  target,
  companyName,
  currencySymbol = '₹',
  isHindi,
  onClose,
}) => {
  const [sheetLayout, setSheetLayout] = useState<BarcodeSheetLayout>('A4_SHEET');
  const [labelCount, setLabelCount] = useState<number>(12);
  const [copied, setCopied] = useState(false);

  const effectiveCode = target.barcode?.trim() || generateEan13Barcode(target.itemCode || target.itemName);
  const stickers = Array.from({ length: Math.min(60, Math.max(1, labelCount)) });

  const handleCopy = () => {
    navigator.clipboard?.writeText(effectiveCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleLayoutSwitch = (nextLayout: BarcodeSheetLayout) => {
    setSheetLayout(nextLayout);
    if (nextLayout === 'ONE_UP' && labelCount > 4) setLabelCount(2);
    else if (nextLayout === 'TWO_UP' && labelCount < 2) setLabelCount(6);
    else if (nextLayout === 'A4_SHEET' && labelCount < 6) setLabelCount(12);
  };

  const gridClass =
    sheetLayout === 'ONE_UP'
      ? 'grid-cols-1 max-w-[260px] mx-auto'
      : sheetLayout === 'TWO_UP'
      ? 'grid-cols-2 max-w-[460px] mx-auto'
      : 'grid-cols-2 sm:grid-cols-3';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-fadeIn">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                {isHindi ? 'बारकोड स्टिकर लेबल प्रिंट (Print Barcode Stickers)' : 'Print Barcode Stickers'}
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {target.itemName} • {effectiveCode}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Controls */}
        <div className="px-5 py-3 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1.5">
              <label className="text-slate-400 font-semibold">
                {isHindi ? 'स्टिकर:' : 'Labels:'}
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={labelCount}
                onChange={(e) => setLabelCount(Math.min(60, Math.max(1, parseInt(e.target.value || '1', 10))))}
                className="w-16 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white font-mono text-center font-bold"
              />
            </div>

            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 font-bold">
              {(
                [
                  { id: 'ONE_UP', label: '1-Up Roll' },
                  { id: 'TWO_UP', label: '2-Up Twin' },
                  { id: 'A4_SHEET', label: 'A4 Sheet' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleLayoutSwitch(opt.id)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                    sheetLayout === opt.id ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-[11px] cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
              <span>{copied ? (isHindi ? 'कॉपी हुआ' : 'Copied') : effectiveCode}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              printDomElement('hv-barcode-label-sheet', {
                paperSize: sheetLayout === 'A4_SHEET' ? 'A4' : 'Thermal-3inch',
                orientation: 'portrait',
                marginMode: 'compact',
                title: `Barcode-${effectiveCode}`,
              })
            }
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition shadow-lg shadow-emerald-600/20 min-h-[40px] cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>{isHindi ? 'स्टिकर प्रिंट करें' : 'Print Stickers'}</span>
          </button>
        </div>

        {/* Preview Sheet */}
        <div className="p-5 overflow-y-auto bg-slate-950/60">
          <div
            id="hv-barcode-label-sheet"
            className={`bg-white text-slate-900 p-4 rounded-2xl grid gap-2.5 ${gridClass}`}
          >
            {stickers.map((_, idx) => (
              <div
                key={idx}
                className="border border-dashed border-slate-400 rounded-lg p-2.5 flex flex-col justify-between bg-white text-slate-900"
              >
                <div className="border-b border-slate-200 pb-1 mb-1.5 space-y-0.5">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-500 truncate">
                    {companyName || 'Hisabveda Store'}
                  </div>
                  <div className="text-[11px] font-extrabold text-slate-950 truncate leading-tight">
                    {target.itemName}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-0.5 text-[10px] font-mono tabular-nums">
                    {target.mrp && target.mrp > 0 ? (
                      <span className="text-slate-600 font-bold">
                        MRP {currencySymbol}{Number(target.mrp).toFixed(2)}
                      </span>
                    ) : (
                      <span />
                    )}
                    {target.price !== undefined && target.price > 0 && (
                      <span className="font-black text-slate-950 text-[11px]">
                        Sale {currencySymbol}{Number(target.price).toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-1">
                  <BarcodeSvg value={effectiveCode} height={sheetLayout === 'TWO_UP' ? 32 : 38} />
                </div>

                <div className="mt-1.5 pt-1 border-t border-slate-200 flex items-center justify-between text-[9px] font-mono text-slate-700 gap-1">
                  <span className="truncate">
                    {target.batchNumber ? `B:${target.batchNumber}` : (target.itemCode || 'SKU')}
                  </span>
                  <span className="shrink-0 font-bold">
                    {target.expiryDate ? `EXP:${target.expiryDate.slice(0, 7)}` : (target.unit || 'PCS')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
