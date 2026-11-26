import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  Package, 
  Users, 
  ArrowRight, 
  RefreshCw,
  FileText,
  Table,
  Check,
  X
} from 'lucide-react';
import { ItemMaster, PartyMaster, PartyType } from '../../types';

interface BulkImportUtilityProps {
  isHindi: boolean;
  onImportItems: (newItems: ItemMaster[], mode: 'merge' | 'append') => void;
  onImportParties: (newParties: PartyMaster[], mode: 'merge' | 'append') => void;
  existingItemCodes: string[];
  existingPartyCodes: string[];
}

type ImportType = 'ITEMS' | 'PARTIES';

export const BulkImportUtility: React.FC<BulkImportUtilityProps> = ({
  isHindi,
  onImportItems,
  onImportParties,
  existingItemCodes,
  existingPartyCodes
}) => {
  const [importType, setImportType] = useState<ImportType>('ITEMS');
  const [importMode, setImportMode] = useState<'merge' | 'append'>('merge');
  const [csvRawText, setCsvRawText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [parsedItems, setParsedItems] = useState<ItemMaster[]>([]);
  const [parsedParties, setParsedParties] = useState<PartyMaster[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper function to robustly parse CSV line considering quotes
  const parseCsvRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  // Download Sample CSV Templates
  const handleDownloadTemplate = (type: ImportType) => {
    let headers: string[];
    let sampleRows: string[];
    let filename: string;

    if (type === 'ITEMS') {
      headers = ['code', 'name', 'description', 'hsnSacCode', 'unit', 'purchasePrice', 'salesPrice', 'taxRate', 'currentStock', 'minStockLevel', 'category'];
      sampleRows = [
        'ITM-101,Office Laptop i7,16GB RAM 512GB SSD,8471,Pcs,45000,58000,18,12,3,Electronics',
        'ITM-102,Ergonomic Executive Chair,High Back Mesh Chair with Lumbar Support,9401,Pcs,4200,6500,18,25,5,Furniture',
        'ITM-103,Wireless Optical Mouse,2.4GHz High Precision Optical Sensor,8471,Pcs,350,650,18,50,10,Accessories'
      ];
      filename = 'HisabVeda_Items_Import_Template.csv';
    } else {
      headers = ['code', 'name', 'type', 'gstin', 'pan', 'email', 'phone', 'address', 'state', 'stateCode', 'creditLimit', 'openingBalance', 'balanceType'];
      sampleRows = [
        'CUST-101,Apex Global Solutions,CUSTOMER,07AAAAA0000A1Z5,AAAAA0000A,info@apexglobal.com,9876543210,123 Corporate Tower,Delhi,07,500000,15000,DR',
        'VEND-201,Supreme Tech Suppliers,VENDOR,27BBBBB1111B2Z3,BBBBB1111B,sales@supremetech.com,9123456789,45 Industrial Estate Phase-2,Maharashtra,27,1000000,0,CR',
        'PARTY-301,Reliable Traders,BOTH,09CCCCC2222C3Z1,CCCCC2222C,contact@reliabletraders.in,9988776655,88 Commercial Market,Uttar Pradesh,09,250000,4500,DR'
      ];
      filename = 'HisabVeda_Parties_Import_Template.csv';
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...sampleRows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Process File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setImportSuccess(null);
    const reader = new FileReader();

    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setCsvRawText(text);
      parseAndValidateCsv(text, importType);
    };

    reader.readAsText(file);
  };

  // Parse CSV and Convert into Master Records
  const parseAndValidateCsv = (csvText: string, targetType: ImportType) => {
    setParseErrors([]);
    setParsedItems([]);
    setParsedParties([]);

    const lines = csvText.split(/\r\n|\n/).filter(line => line.trim().length > 0);
    if (lines.length <= 1) {
      setParseErrors([isHindi ? 'CSV फ़ाइल में डेटा नहीं मिला या फ़ाइल खाली है।' : 'CSV file contains no data rows besides headers.']);
      return;
    }

    const rawHeaders = parseCsvRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-parser]/gi, '').trim());
    const dataRows = lines.slice(1);
    const errors: string[] = [];

    if (targetType === 'ITEMS') {
      const items: ItemMaster[] = [];

      dataRows.forEach((rowStr, idx) => {
        const cols = parseCsvRow(rowStr);
        if (cols.length < 2) return; // skip blank

        // Map column headers dynamically or by index
        const getCol = (key: string, defaultIdx: number) => {
          const foundIdx = rawHeaders.findIndex(h => h.includes(key.toLowerCase()));
          return foundIdx >= 0 ? cols[foundIdx] : (cols[defaultIdx] || '');
        };

        const code = getCol('code', 0) || `ITM-IMP-${Date.now()}-${idx + 1}`;
        const name = getCol('name', 1);

        if (!name) {
          errors.push(`Row ${idx + 2}: Missing Item Name`);
          return;
        }

        const description = getCol('description', 2) || '';
        const hsnSacCode = getCol('hsn', 3) || '8471';
        const unit = getCol('unit', 4) || 'Pcs';
        const purchasePrice = parseFloat(getCol('purchase', 5)) || 0;
        const salesPrice = parseFloat(getCol('sales', 6)) || purchasePrice * 1.2 || 0;
        const taxRate = parseFloat(getCol('tax', 7)) || 18;
        const currentStock = parseFloat(getCol('current', 8)) || parseFloat(getCol('stock', 8)) || 0;
        const minStockLevel = parseFloat(getCol('min', 9)) || 5;
        const category = getCol('category', 10) || 'General';

        items.push({
          id: `itm_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
          code,
          name,
          description,
          hsnSacCode,
          unit,
          purchasePrice,
          salesPrice,
          taxRate,
          currentStock,
          minStockLevel,
          category
        });
      });

      setParsedItems(items);
      if (items.length === 0 && errors.length === 0) {
        errors.push(isHindi ? 'कोई मान्य आइटम रिकॉर्ड नहीं मिला।' : 'No valid item records parsed.');
      }
    } else {
      // PARTIES
      const parties: PartyMaster[] = [];

      dataRows.forEach((rowStr, idx) => {
        const cols = parseCsvRow(rowStr);
        if (cols.length < 2) return;

        const getCol = (key: string, defaultIdx: number) => {
          const foundIdx = rawHeaders.findIndex(h => h.includes(key.toLowerCase()));
          return foundIdx >= 0 ? cols[foundIdx] : (cols[defaultIdx] || '');
        };

        const code = getCol('code', 0) || `PRT-IMP-${Date.now()}-${idx + 1}`;
        const name = getCol('name', 1);

        if (!name) {
          errors.push(`Row ${idx + 2}: Missing Party Name`);
          return;
        }

        const rawType = getCol('type', 2).toUpperCase();
        let type: PartyType = 'CUSTOMER';
        if (rawType.includes('VENDOR') || rawType.includes('SUPPLIER')) type = 'VENDOR';
        if (rawType.includes('BOTH')) type = 'BOTH';

        const gstin = getCol('gstin', 3) || '';
        const pan = getCol('pan', 4) || (gstin.length >= 12 ? gstin.substring(2, 12) : '');
        const email = getCol('email', 5) || '';
        const phone = getCol('phone', 6) || '';
        const address = getCol('address', 7) || '';
        const state = getCol('state', 8) || 'Delhi';
        const stateCode = getCol('statecode', 9) || '07';
        const creditLimit = parseFloat(getCol('credit', 10)) || 100000;
        const openingBalance = parseFloat(getCol('opening', 11)) || 0;
        const rawBalType = getCol('balancetype', 12).toUpperCase();
        const balanceType: 'DR' | 'CR' = rawBalType === 'CR' ? 'CR' : 'DR';

        parties.push({
          id: `party_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 4)}`,
          code,
          name,
          type,
          gstin,
          pan,
          email,
          phone,
          address,
          state,
          stateCode,
          creditLimit,
          openingBalance,
          balanceType
        });
      });

      setParsedParties(parties);
      if (parties.length === 0 && errors.length === 0) {
        errors.push(isHindi ? 'कोई मान्य पार्टी रिकॉर्ड नहीं मिला।' : 'No valid party records parsed.');
      }
    }

    setParseErrors(errors);
  };

  // Perform Final Import
  const handleExecuteImport = () => {
    if (importType === 'ITEMS') {
      if (parsedItems.length === 0) return;
      onImportItems(parsedItems, importMode);
      setImportSuccess(
        isHindi 
          ? `सफलतापूर्वक ${parsedItems.length} आइटम मास्टर्स इंपोर्ट किए गए!` 
          : `Successfully imported ${parsedItems.length} item records into system!`
      );
      setParsedItems([]);
    } else {
      if (parsedParties.length === 0) return;
      onImportParties(parsedParties, importMode);
      setImportSuccess(
        isHindi 
          ? `सफलतापूर्वक ${parsedParties.length} पार्टी मास्टर्स इंपोर्ट किए गए!` 
          : `Successfully imported ${parsedParties.length} party records into system!`
      );
      setParsedParties([]);
    }

    setFileName('');
    setCsvRawText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
              <span>{isHindi ? 'बल्क डेटा इंपोर्ट यूटिलिटी (CSV Upload)' : 'Bulk Data CSV Import Utility'}</span>
              <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                CSV / Excel
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {isHindi 
                ? 'CSV फ़ाइलों के माध्यम से एक साथ अनेक आइटम या पार्टी मास्टर्स इंपोर्ट करें' 
                : 'Batch upload multiple item stock records or party contacts directly from CSV spreadsheets'}
            </p>
          </div>
        </div>

        {/* Template Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleDownloadTemplate('ITEMS')}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-emerald-400 text-xs font-semibold px-3 py-2 rounded-xl transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isHindi ? 'आइटम CSV टेम्पलेट' : 'Items CSV Template'}</span>
          </button>
          <button
            onClick={() => handleDownloadTemplate('PARTIES')}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-indigo-400 text-xs font-semibold px-3 py-2 rounded-xl transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isHindi ? 'पार्टी CSV टेम्पलेट' : 'Parties CSV Template'}</span>
          </button>
        </div>
      </div>

      {/* Success Notification */}
      {importSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 rounded-xl flex items-center gap-3 text-emerald-300 text-xs font-semibold animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{importSuccess}</span>
        </div>
      )}

      {/* Import Configuration Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Step 1: Select Master Entity Type */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-300">
            {isHindi ? '1. इंपोर्ट लक्ष्य चुनें (Select Target Entity)' : '1. Select Entity to Import'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setImportType('ITEMS');
                if (csvRawText) parseAndValidateCsv(csvRawText, 'ITEMS');
              }}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                importType === 'ITEMS'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Package className="w-4 h-4" />
              <span>{isHindi ? 'आइटम मास्टर्स' : 'Item Masters'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setImportType('PARTIES');
                if (csvRawText) parseAndValidateCsv(csvRawText, 'PARTIES');
              }}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition ${
                importType === 'PARTIES'
                  ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>{isHindi ? 'पार्टी मास्टर्स' : 'Party Masters'}</span>
            </button>
          </div>
        </div>

        {/* Step 2: Select Duplicate Code Handling Mode */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-300">
            {isHindi ? '2. डुप्लिकेट कोड रणनीति (Duplicate Code Handling)' : '2. Duplicate Handling Mode'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setImportMode('merge')}
              className={`p-3 rounded-xl border text-xs text-left transition ${
                importMode === 'merge'
                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <p className="font-bold flex items-center justify-between">
                <span>{isHindi ? 'अपडेट / मर्ज' : 'Merge & Update'}</span>
                {importMode === 'merge' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-normal">
                {isHindi ? 'मौजूदा रिकॉर्ड अपडेट करेगा' : 'Updates existing records if code matches'}
              </p>
            </button>

            <button
              type="button"
              onClick={() => setImportMode('append')}
              className={`p-3 rounded-xl border text-xs text-left transition ${
                importMode === 'append'
                  ? 'bg-indigo-950/80 border-indigo-500 text-indigo-200 font-bold'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-800'
              }`}
            >
              <p className="font-bold flex items-center justify-between">
                <span>{isHindi ? 'केवल नए जोड़ें' : 'Append Only'}</span>
                {importMode === 'append' && <Check className="w-3.5 h-3.5 text-indigo-400" />}
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5 font-normal">
                {isHindi ? 'सभी पंक्तियों को नया मानेगा' : 'Adds as brand new unique entries'}
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Step 3: File Drop Zone */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-slate-300">
          {isHindi ? '3. CSV फ़ाइल अपलोड करें' : '3. Upload CSV File'}
        </label>

        <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-950/60 rounded-2xl p-6 text-center transition group">
          <input
            type="file"
            ref={fileInputRef}
            accept=".csv, text/csv, application/vnd.ms-excel"
            onChange={handleFileChange}
            className="hidden"
            id="bulk-csv-input"
          />
          <label 
            htmlFor="bulk-csv-input" 
            className="cursor-pointer flex flex-col items-center justify-center space-y-2"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center group-hover:scale-110 transition">
              <FileSpreadsheet className="w-6 h-6" />
            </div>

            <div>
              <p className="text-xs font-bold text-slate-200">
                {fileName ? (
                  <span className="text-indigo-400 flex items-center gap-1.5 justify-center">
                    <FileText className="w-4 h-4" />
                    {fileName}
                  </span>
                ) : (
                  <span>{isHindi ? 'CSV फ़ाइल अपलोड करने के लिए क्लिक करें' : 'Click to select or drag & drop CSV file'}</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {isHindi ? 'समर्थित प्रारूप: .CSV (Comma Separated Values)' : 'Supported format: .CSV (Standard UTF-8 Comma Separated)'}
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Parse Errors List */}
      {parseErrors.length > 0 && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-4 rounded-xl space-y-2">
          <p className="font-bold text-xs text-rose-400 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            <span>{isHindi ? 'फ़ाइल पार्सिंग त्रुटियां' : 'File Parsing Errors / Warnings'}</span>
          </p>
          <ul className="text-xs text-rose-300 space-y-1 list-disc pl-5">
            {parseErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step 4: Parsed Data Preview Table */}
      {(parsedItems.length > 0 || parsedParties.length > 0) && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-xs text-slate-200">
                {isHindi ? 'इंपोर्ट पूर्व पूर्वावलोकन (Data Preview)' : 'Parsed Records Preview'}
              </h4>
              <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {importType === 'ITEMS' ? `${parsedItems.length} Items` : `${parsedParties.length} Parties`}
              </span>
            </div>

            <button
              onClick={handleExecuteImport}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg transition active:scale-95"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isHindi 
                  ? `इंपोर्ट निष्पादित करें (${importType === 'ITEMS' ? parsedItems.length : parsedParties.length})` 
                  : `Execute Import (${importType === 'ITEMS' ? parsedItems.length : parsedParties.length} Records)`}
              </span>
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-x-auto max-h-60">
            {importType === 'ITEMS' ? (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Item Name</th>
                    <th className="p-2.5">HSN/SAC</th>
                    <th className="p-2.5">Unit</th>
                    <th className="p-2.5">Sales Price</th>
                    <th className="p-2.5">Tax %</th>
                    <th className="p-2.5">Stock</th>
                    <th className="p-2.5">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono text-[11px]">
                  {parsedItems.map((item, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-indigo-400">{item.code}</td>
                      <td className="p-2.5 font-sans font-semibold text-slate-100">{item.name}</td>
                      <td className="p-2.5">{item.hsnSacCode}</td>
                      <td className="p-2.5 font-sans">{item.unit}</td>
                      <td className="p-2.5 text-emerald-400">₹{item.salesPrice}</td>
                      <td className="p-2.5">{item.taxRate}%</td>
                      <td className="p-2.5 font-bold">{item.currentStock}</td>
                      <td className="p-2.5 font-sans text-slate-400">{item.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-slate-800 text-slate-400 font-bold text-[11px] uppercase">
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Party Name</th>
                    <th className="p-2.5">Type</th>
                    <th className="p-2.5">GSTIN</th>
                    <th className="p-2.5">Phone</th>
                    <th className="p-2.5">State</th>
                    <th className="p-2.5">Opening Bal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono text-[11px]">
                  {parsedParties.map((party, i) => (
                    <tr key={i} className="hover:bg-slate-800/40">
                      <td className="p-2.5 font-bold text-indigo-400">{party.code}</td>
                      <td className="p-2.5 font-sans font-semibold text-slate-100">{party.name}</td>
                      <td className="p-2.5 font-sans">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          party.type === 'CUSTOMER' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {party.type}
                        </span>
                      </td>
                      <td className="p-2.5 text-indigo-300">{party.gstin || '-'}</td>
                      <td className="p-2.5 font-sans">{party.phone || '-'}</td>
                      <td className="p-2.5 font-sans">{party.state}</td>
                      <td className="p-2.5">₹{party.openingBalance} {party.balanceType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
