import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, PackagePlus, AlertCircle, Sparkles, X } from 'lucide-react';
import { ItemMaster, Currency } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getItemPriceForTier, PriceTier } from '../../utils/erpSmartHelpers';

interface SearchableItemSelectProps {
  items: ItemMaster[];
  selectedItemId: string;
  selectedItemName?: string;
  onSelectItem: (item: ItemMaster) => void;
  currency?: Currency;
  priceType?: 'sales' | 'purchase';
  priceTier?: PriceTier;
  isHindi?: boolean;
  onAddNewItem?: () => void;
  placeholder?: string;
  className?: string;
}

export const SearchableItemSelect: React.FC<SearchableItemSelectProps> = ({
  items,
  selectedItemId,
  selectedItemName,
  onSelectItem,
  currency = 'INR',
  priceType = 'sales',
  priceTier = 'RETAIL',
  isHindi = false,
  onAddNewItem,
  placeholder,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Position state for portal/fixed dropdown to avoid table overflow clipping
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  const selectedItem = items.find(i => i.id === selectedItemId);
  const displayText = selectedItem ? `${selectedItem.name} (${selectedItem.code})` : (selectedItemName || '');

  // Calculate dropdown position
  const updatePosition = () => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      const width = Math.max(rect.width, 340);
      let left = rect.left;
      if (left + width > window.innerWidth - 16) {
        left = window.innerWidth - width - 16;
      }
      if (left < 16) left = 16;

      const openAbove = spaceBelow < 250 && spaceAbove > spaceBelow;
      const maxHeight = openAbove ? Math.min(spaceAbove - 16, 320) : Math.min(spaceBelow - 16, 320);
      const top = openAbove ? (rect.top - maxHeight - 4) : (rect.bottom + 4);

      setCoords({ top, left, width, maxHeight });
    }
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Filter items
  const cleanSearch = search.trim().toLowerCase();
  const filteredItems = items.filter(item => {
    if (!cleanSearch) return true;
    const nameMatch = item.name.toLowerCase().includes(cleanSearch);
    const codeMatch = (item.code || '').toLowerCase().includes(cleanSearch);
    const barcodeMatch = (item.barcode || '').toLowerCase().includes(cleanSearch);
    const hsnMatch = (item.hsnSacCode || '').toLowerCase().includes(cleanSearch);
    const catMatch = (item.category || '').toLowerCase().includes(cleanSearch);
    return nameMatch || codeMatch || barcodeMatch || hsnMatch || catMatch;
  });

  const handleOpen = () => {
    setSearch('');
    setHighlightedIndex(0);
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSelect = (item: ItemMaster) => {
    onSelectItem(item);
    setIsOpen(false);
    setSearch('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev + 1 < filteredItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[highlightedIndex]) {
        handleSelect(filteredItems[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Display Trigger Button */}
      <button
        type="button"
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        className="w-full text-left hv-input hover:bg-[var(--hover-surface)] border focus:border-indigo-500 rounded-lg p-2 text-xs text-[var(--text-primary)] flex items-center justify-between gap-1 transition shadow-sm cursor-pointer"
        title={displayText || (placeholder || (isHindi ? 'सामग्री / आइटम चुनें या खोजें' : 'Select or search item'))}
      >
        <div className="truncate flex-1 font-medium">
          {displayText ? (
            <span className="text-[var(--text-primary)] font-semibold flex items-center gap-1.5">
              <span className="truncate">{selectedItem?.name || displayText}</span>
              {selectedItem?.code && (
                <span className="text-[10px] hv-pill-indigo px-1.5 py-0.5 rounded border font-mono shrink-0">
                  {selectedItem.code}
                </span>
              )}
            </span>
          ) : (
            <span className="text-[var(--text-muted)]">
              {placeholder || (isHindi ? '🔍 सामग्री खोजें या चुनें...' : '🔍 Search or select item...')}
            </span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Floating Dropdown Overlay */}
      {isOpen && coords && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: `${coords.top}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            maxHeight: `${coords.maxHeight}px`,
            zIndex: 9999
          }}
          className="hv-surface border rounded-xl shadow-2xl overflow-hidden flex flex-col animate-fadeIn text-xs"
        >
          {/* Search Input Box */}
          <div className="p-2 border-b hv-canvas flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder={isHindi ? 'नाम, कोड, HSN या श्रेणी टाइप करें...' : 'Type name, code, HSN, or category...'}
              className="w-full bg-transparent text-[var(--text-primary)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Quick Add Button Header if needed */}
          {onAddNewItem && (
            <div className="px-2.5 py-1.5 hv-elevated border-b flex items-center justify-between">
              <span className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-wider">
                {filteredItems.length} {isHindi ? 'सामग्री मिली' : 'Items Found'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onAddNewItem();
                }}
                className="text-[11px] text-emerald-500 hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <PackagePlus className="w-3 h-3" />
                <span>{isHindi ? '+ नया आइटम जोड़ें' : '+ Create New Item'}</span>
              </button>
            </div>
          )}

          {/* Items List */}
          <div className="overflow-y-auto flex-1 divide-y divide-[var(--border-primary)] p-1">
            {filteredItems.length === 0 ? (
              <div className="p-4 text-center space-y-2">
                <AlertCircle className="w-5 h-5 text-amber-500 mx-auto opacity-80" />
                <p className="text-[var(--text-muted)] text-xs">
                  {isHindi ? `"${search}" से संबंधित कोई आइटम नहीं मिला` : `No item matching "${search}"`}
                </p>
                {onAddNewItem && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onAddNewItem();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 hv-pill-emerald border rounded-lg font-bold text-xs transition cursor-pointer"
                  >
                    <PackagePlus className="w-3.5 h-3.5" />
                    <span>{isHindi ? `"${search}" को नया स्टॉक आइटम बनाएँ` : `Create "${search}" as New Item`}</span>
                  </button>
                )}
              </div>
            ) : (
              filteredItems.map((item, idx) => {
                const isSelected = item.id === selectedItemId;
                const isHighlighted = idx === highlightedIndex;
                const activePriceTier: PriceTier = priceTier === 'WHOLESALE' || priceTier === 'MRP' ? priceTier : 'RETAIL';
                const price = priceType === 'purchase'
                  ? (item.purchasePrice || item.salesPrice || 0)
                  : getItemPriceForTier(item, activePriceTier);
                const stock = item.currentStock ?? item.openingStock ?? 0;
                const isLowStock = stock <= (item.minStockLevel || 5);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`p-2 rounded-lg cursor-pointer transition flex items-center justify-between gap-2 ${
                      isHighlighted ? 'hv-pill-indigo border' : 'hover:bg-[var(--hover-surface)] text-[var(--text-primary)]'
                    } ${isSelected ? 'hv-pill-indigo border font-semibold' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-[var(--text-primary)] truncate">
                          {item.name}
                        </span>
                        <span className="text-[10px] hv-pill-indigo px-1.5 py-0.2 rounded font-mono border shrink-0">
                          {item.code}
                        </span>
                        {item.hsnSacCode && (
                          <span className="text-[10px] hv-elevated text-[var(--text-secondary)] px-1 py-0.2 rounded font-mono border shrink-0">
                            HSN: {item.hsnSacCode}
                          </span>
                        )}
                        <span className="text-[10px] hv-pill-emerald px-1 rounded font-semibold shrink-0">
                          {item.taxRate || 18}% GST
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-[var(--text-muted)] flex-wrap">
                        <span>
                          {priceType === 'purchase'
                            ? (isHindi ? 'क्रय मूल्य:' : 'Cost:')
                            : priceTier === 'WHOLESALE'
                            ? (isHindi ? 'थोक दर:' : 'Wholesale:')
                            : priceTier === 'MRP'
                            ? 'MRP:'
                            : (isHindi ? 'रिटेल मूल्य:' : 'Retail:')}{' '}
                          <strong className="text-amber-500 font-mono">{formatCurrency(price, (currency as Currency) || 'INR')}</strong>
                          <span className="text-[var(--text-muted)] text-[10px]"> /{item.unit || 'Unit'}</span>
                        </span>
                        {priceType === 'sales' && item.wholesalePrice && item.wholesalePrice > 0 && priceTier !== 'WHOLESALE' && (
                          <span className="text-[10px] font-mono text-cyan-500">
                            W:{formatCurrency(item.wholesalePrice, (currency as Currency) || 'INR')}
                          </span>
                        )}

                        <span className={`flex items-center gap-1 font-semibold ${
                          stock <= 0 
                            ? 'text-rose-500 font-bold' 
                            : isLowStock 
                              ? 'text-amber-500' 
                              : 'text-emerald-500'
                        }`}>
                          • {isHindi ? 'स्टॉक:' : 'Stock:'} {stock} {item.unit || 'Pcs'}
                          {stock <= 0 && <span className="text-[9px] uppercase tracking-wider">(Out)</span>}
                        </span>
                      </div>
                    </div>

                    {isSelected && (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
