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
      <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-slate-950 px-5 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Database className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <span>{isHindi ? 'ऑनलाइन जीएसटी एचएसएन खोज निर्देशिका' : 'Online GST HSN / SAC Code Directory'}</span>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                  Live GST Search
                </span>
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isHindi 
                  ? 'उत्पाद का नाम या श्रेणी खोजें, सटीक HSN और GST दर अपने आप प्राप्त होगी' 
                  : 'Search product title or category to fetch exact HSN code & official GST rate'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Input Box */}
        <div className="p-4 bg-slate-950/70 border-b border-slate-800 shrink-0 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-indigo-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isHindi ? 'उत्पाद का नाम, श्रेणी या HSN लिखें (उदा. Shirt, Mobile, Cement, Rice, Plywood, Repair)...' : 'Type product name, category or HSN code (e.g. Steel, Laptop, Cloth, Cement, Audit)...'}
              className="w-full bg-slate-900 border border-indigo-500/50 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-100 font-medium placeholder-slate-500 focus:outline-none focus:border-indigo-400 shadow-inner"
              autoFocus
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Tabs Scroll */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-[10px]">
            <span className="text-slate-400 font-bold shrink-0 flex items-center gap-1">
              <Filter className="w-3 h-3 text-amber-400" />
              {isHindi ? 'श्रेणी:' : 'Category:'}
            </span>
            {CATEGORY_TABS.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-lg border font-bold shrink-0 transition ${
                  selectedCategory === cat
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                {cat === 'ALL' ? (isHindi ? 'सभी श्रेणियां (All)' : 'All Categories') : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Directory Results List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1 text-xs">
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 mb-1">
            <span>
              {isHindi ? `कुल ${results.length} HSN परिणाम मिले` : `Found ${results.length} HSN Directory Entries`}
            </span>
            <span className="text-amber-300 font-semibold">
              {isHindi ? 'किसी भी HSN पर क्लिक करके चुनें' : 'Click any HSN to select'}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="p-8 text-center space-y-2 text-slate-400">
              <Sparkles className="w-8 h-8 mx-auto text-amber-400" />
              <p className="font-bold text-slate-300">
                {isHindi ? 'कोई मेल खाता HSN कोड नहीं मिला।' : 'No matching HSN code found for your query.'}
              </p>
              <p className="text-[11px] text-slate-500">
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
                  className="p-3 bg-slate-950/80 hover:bg-indigo-950/50 border border-slate-800 hover:border-indigo-500/60 rounded-xl cursor-pointer transition flex items-center justify-between gap-3 group"
                >
                  <div className="space-y-1 overflow-hidden">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30 text-xs">
                        HSN: {item.code}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-bold border border-indigo-500/30">
                        {item.category}
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-100 group-hover:text-white truncate text-xs">
                      {item.name}
                    </h4>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">{isHindi ? 'जीएसटी दर' : 'GST Rate'}</span>
                      <span className="font-mono font-extrabold text-emerald-400 text-xs">{item.gstRate}% GST</span>
                    </div>
                    <button
                      type="button"
                      className="px-3 py-1.5 bg-indigo-600 group-hover:bg-indigo-500 text-white font-bold text-[11px] rounded-lg shadow transition"
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
        <div className="bg-slate-950 px-5 py-2.5 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            {isHindi ? 'आधिकारिक अखिल भारतीय जीएसटी एचएसएन/एसएससी निर्देशिका' : 'Official Pan-India GST HSN / SAC Directory'}
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 font-semibold"
          >
            {isHindi ? 'बंद करें' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
