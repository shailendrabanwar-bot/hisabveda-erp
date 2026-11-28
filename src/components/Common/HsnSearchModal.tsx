import React, { useState } from 'react';
import { Search, X, Check, Sparkles, Database, Tag, ShieldCheck, Filter } from 'lucide-react';
import { PAN_INDIA_HSN_DIRECTORY, searchHsnDirectory, HsnItem } from '../../data/hsnDirectory';

interface HsnSearchModalProps {
  isHindi: boolean;
  initialQuery?: string;
  onSelect: (hsn: HsnItem) => void;
  onClose: () => void;
}

const CATEGORY_TABS = [
  'ALL',
  'Electronics & IT',
  'Electricals & Power',
  'Textiles & Garments',
  'FMCG & Groceries',
  'Dairy & Beverages',
  'Construction Materials',
  'Steel & Metals',
  'Hardware & Tools',
  'Home Appliances',
  'Automobiles & Auto Parts',
  'Pharmaceuticals & Medical',
  'Stationery & Paper',
  'IT & Digital Services',
  'Professional Services'
];

export const HsnSearchModal: React.FC<HsnSearchModalProps> = ({
  isHindi,
  initialQuery = '',
  onSelect,
  onClose
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const results = searchHsnDirectory(query, selectedCategory);

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="hv-surface border border-indigo-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="hv-elevated px-5 py-4 border-b flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 hv-pill-indigo border rounded-xl">
              <Database className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-black text-sm text-[var(--text-primary)] flex items-center gap-2">
                <span>{isHindi ? 'ऑनलाइन जीएसटी एचएसएन खोज निर्देशिका' : 'Online GST HSN / SAC Code Directory'}</span>
                <span className="hv-pill-emerald text-[10px] font-bold px-2 py-0.5 rounded-full border">
                  Live GST Search
                </span>
              </h3>
              <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {isHindi 
                  ? 'उत्पाद का नाम या श्रेणी खोजें, सटीक HSN और GST दर अपने आप प्राप्त होगी' 
                  : 'Search product title or category to fetch exact HSN code & official GST rate'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hv-surface hover:bg-[var(--hover-surface)] rounded-xl border transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="p-4 hv-canvas border-b shrink-0 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-indigo-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isHindi ? 'उत्पाद का नाम, श्रेणी या HSN लिखें (उदा. Shirt, Mobile, Cement, Rice, Plywood, Repair)...' : 'Type product name, category or HSN code (e.g. Steel, Laptop, Cloth, Cement, Audit)...'}
              className="w-full hv-input border border-indigo-500/40 rounded-xl pl-10 pr-10 py-2.5 text-xs font-medium focus:outline-none focus:border-indigo-500 shadow-inner"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Tabs Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px]">
            <span className="text-[var(--text-muted)] font-bold shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3 text-amber-500" />
              {isHindi ? 'श्रेणी:' : 'Category:'}
            </span>
            {CATEGORY_TABS.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg border font-bold shrink-0 transition cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'hv-elevated hover:bg-[var(--hover-surface)] text-[var(--text-secondary)]'
                }`}
              >
                {cat === 'ALL' ? (isHindi ? 'सभी श्रेणियां (All)' : 'All Categories') : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Directory Results List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1 text-xs">
          <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] px-1 mb-1">
            <span>
              {isHindi ? `कुल ${results.length} HSN परिणाम मिले` : `Found ${results.length} HSN Directory Entries`}
            </span>
            <span className="text-amber-500 font-semibold">
              {isHindi ? 'किसी भी HSN पर क्लिक करके चुनें' : 'Click any HSN to select'}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center space-y-2 text-[var(--text-muted)]">
              <Sparkles className="w-8 h-8 mx-auto text-amber-500" />
              <p className="font-bold text-[var(--text-secondary)]">
                {isHindi ? 'कोई मेल खाता HSN कोड नहीं मिला।' : 'No matching HSN code found for your query.'}
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi ? 'कृपया "सभी श्रेणियां" चुनें या सरल कीवर्ड खोजें।' : 'Try selecting "All Categories" or searching a simpler keyword.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {results.map((item) => (
                <div
                  key={item.code + item.name}
                  onClick={() => {
                    onSelect(item);
                    onClose();
                  }}
                  className="p-3 hv-elevated hover:bg-[var(--hover-surface)] border hover:border-indigo-500/60 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black hv-pill-amber px-2 py-0.5 rounded border text-xs">
                        HSN: {item.code}
                      </span>
                      <span className="px-2 py-0.5 rounded hv-pill-indigo text-[10px] font-bold border">
                        {item.category}
                      </span>
                    </div>
                    <h4 className="font-bold text-[var(--text-primary)] truncate text-xs">
                      {item.name}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-[var(--text-muted)] block">{isHindi ? 'जीएसटी दर' : 'GST Rate'}</span>
                      <span className="font-mono font-extrabold text-emerald-500 text-xs">{item.gstRate}% GST</span>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-indigo-600 group-hover:bg-indigo-500 text-white hv-keep-white font-bold text-[11px] rounded-lg shadow transition cursor-pointer"
                    >
                      {isHindi ? 'चुनें' : 'Select'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="hv-canvas px-5 py-2.5 border-t text-[11px] text-[var(--text-muted)] flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            {isHindi ? 'आधिकारिक अखिल भारतीय जीएसटी एचएसएन/एसएससी निर्देशिका' : 'Official Pan-India GST HSN / SAC Directory'}
          </span>
          <button
            onClick={onClose}
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-semibold cursor-pointer"
          >
            {isHindi ? 'बंद करें' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
