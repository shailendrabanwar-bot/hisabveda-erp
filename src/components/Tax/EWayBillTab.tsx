import React, { useState, useMemo } from 'react';
import { 
  Truck, 
  Download, 
  Copy, 
  Check, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  Search, 
  Filter, 
  ShieldCheck, 
  ExternalLink, 
  Sparkles, 
  Printer, 
  Info, 
  RotateCcw,
  QrCode,
  ArrowRight
} from 'lucide-react';
import { AppData, SalesInvoice } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { 
  EWayBillBulkJsonPayload, 
  TransportDetailsConfig, 
  SimulatedEWayBillResult,
  generateBulkEWayBillJson, 
  validateInvoicesForEWayBill, 
  simulateEWayBillGeneration, 
  downloadEWayBillJsonFile,
  estimateTransportDistance,
  parseStateCodeNum
} from '../../utils/ewayBill';

interface EWayBillTabProps {
  data: AppData;
  isHindi: boolean;
  onOpenModal?: (invoiceIds?: string[]) => void;
  onUpdateInvoiceEwbNumber?: (invId: string, ewbNo: string, ewbDate: string) => void;
}

export const EWayBillTab: React.FC<EWayBillTabProps> = ({
  data,
  isHindi,
  onOpenModal,
  onUpdateInvoiceEwbNumber
}) => {
  const currency = data.company.currency;
  
  const availableInvoices = useMemo(() => {
    return data.invoices.filter(i => i.status !== 'CANCELLED');
  }, [data.invoices]);

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const overFifty = availableInvoices.filter(i => i.grandTotal >= 50000).map(i => i.id);
    return overFifty.length > 0 ? overFifty : availableInvoices.slice(0, 3).map(i => i.id);
  });

  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'OVER_50K' | 'INTERSTATE' | 'SELECTED'>('ALL');

  const [transportConfig, setTransportConfig] = useState<TransportDetailsConfig>({
    transMode: '1', // Road
    vehicleNo: 'DL01AB1234',
    vehicleType: 'R',
    transporterId: '07AAAAA0000A1Z5',
    transporterName: 'TCI Freight Logistics Ltd',
    transDocNo: 'LR-99882',
    transDocDate: new Date().toISOString().split('T')[0],
    distanceKm: 250,
    subSupplyType: '1',
    docType: 'INV'
  });

  const [copied, setCopied] = useState(false);
  const [simulatedBills, setSimulatedBills] = useState<SimulatedEWayBillResult[]>([]);

  const selectedInvoices = useMemo(() => {
    return availableInvoices.filter(i => selectedIds.includes(i.id));
  }, [availableInvoices, selectedIds]);

  const combinedConfigs = useMemo(() => {
    const map: Record<string, Partial<TransportDetailsConfig>> = {};
    selectedInvoices.forEach(inv => {
      const fromSt = parseStateCodeNum(data.company.stateCode || data.company.state);
      const toSt = parseStateCodeNum(inv.partyGstin ? inv.partyGstin.substring(0, 2) : inv.placeOfSupply);
      map[inv.id] = {
        ...transportConfig,
        distanceKm: transportConfig.distanceKm || estimateTransportDistance(fromSt, toSt)
      };
    });
    return map;
  }, [selectedInvoices, transportConfig, data.company]);

  const jsonPayload: EWayBillBulkJsonPayload = useMemo(() => {
    return generateBulkEWayBillJson(selectedInvoices, data.company, combinedConfigs);
  }, [selectedInvoices, data.company, combinedConfigs]);

  const validationIssues = useMemo(() => {
    return validateInvoicesForEWayBill(selectedInvoices, data.company, combinedConfigs);
  }, [selectedInvoices, data.company, combinedConfigs]);

  const hasValidationErrors = validationIssues.some(i => i.severity === 'error');

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === availableInvoices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(availableInvoices.map(i => i.id));
    }
  };

  const displayedInvoices = useMemo(() => {
    return availableInvoices.filter(inv => {
      const q = search.toLowerCase().trim();
      const matchSearch = !q || 
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.partyName.toLowerCase().includes(q) ||
        (inv.partyGstin && inv.partyGstin.toLowerCase().includes(q));

      if (!matchSearch) return false;
      if (filterMode === 'OVER_50K') return inv.grandTotal >= 50000;
      if (filterMode === 'INTERSTATE') return inv.isInterState;
      if (filterMode === 'SELECTED') return selectedIds.includes(inv.id);
      return true;
    });
  }, [availableInvoices, search, filterMode, selectedIds]);

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(jsonPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    downloadEWayBillJsonFile(jsonPayload);
  };

  const handleSimulate = () => {
    const results = jsonPayload.billLists.map(b => simulateEWayBillGeneration(b));
    setSimulatedBills(results);
  };

  const totalConsignmentValue = selectedInvoices.reduce((s, i) => s + i.grandTotal, 0);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-amber-950/40 via-slate-900 to-indigo-950/40 p-5 rounded-2xl border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              Rule 138 CGST Rules • NIC Schema v1.0.0421
            </span>
          </div>
          <h3 className="text-base font-extrabold text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-amber-400" />
            <span>{isHindi ? 'ई-वे बिल पोर्टल JSON जनरेटर एवं बल्क अपलोड टूल' : 'Official GST e-Way Bill Bulk JSON Generator Tool'}</span>
          </h3>
          <p className="text-xs text-slate-300 max-w-2xl">
            {isHindi 
              ? 'बिक्री इनवॉइसों के आधार पर भारत सरकार के आधिकारिक ई-वे बिल पोर्टल (ewaybillgst.gov.in) के लिए वैध बल्क JSON फ़ाइल तैयार करें, पार्ट-बी वाहन संख्या जोड़ें, और 1-क्लिक में डाउनलोड करें।'
              : 'Generate simulated e-Way Bill JSON files based on selected sales invoices, formatted specifically for India\'s GST e-Way Bill portal requirements with Part-A & Part-B vehicle tracking.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <a
            href="https://ewaybillgst.gov.in"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold px-3 py-2 rounded-xl transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
            <span>ewaybillgst.gov.in</span>
          </a>

          <button
            type="button"
            onClick={handleDownload}
            disabled={selectedIds.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs px-4 py-2 rounded-xl shadow-lg transition active:scale-95 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{isHindi ? 'e-Way Bill JSON डाउनलोड' : 'Download Portal JSON'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-bold">{isHindi ? 'कुल आउटवर्ड इनवॉइस' : 'Total Outward Invoices'}</div>
          <div className="text-lg font-bold text-white mt-0.5">{availableInvoices.length}</div>
        </div>

        <div className="p-3 bg-amber-950/30 border border-amber-500/30 rounded-xl">
          <div className="text-[10px] text-amber-300 uppercase font-bold">{isHindi ? 'ई-वे बिल अनिवार्य (> ₹50k)' : 'Mandatory (> ₹50k)'}</div>
          <div className="text-lg font-bold text-amber-400 mt-0.5">
            {availableInvoices.filter(i => i.grandTotal >= 50000).length} <span className="text-xs font-normal">bills</span>
          </div>
        </div>

        <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-xl">
          <div className="text-[10px] text-indigo-300 uppercase font-bold">{isHindi ? 'चयनित इनवॉइस' : 'Selected for e-Way Bill'}</div>
          <div className="text-lg font-bold text-indigo-400 mt-0.5">
            {selectedIds.length} <span className="text-xs font-normal">selected</span>
          </div>
        </div>

        <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl">
          <div className="text-[10px] text-emerald-300 uppercase font-bold">{isHindi ? 'चयनित कुल मूल्य' : 'Selected Consignment Value'}</div>
          <div className="text-lg font-bold text-emerald-400 mt-0.5 font-mono">
            {formatCurrency(totalConsignmentValue, currency)}
          </div>
        </div>
      </div>

      {/* Two Column Layout: Invoices Table + Transport/JSON Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        
        {/* Left Side: Invoice Selection Table (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-400" />
              <span>{isHindi ? 'इनवॉइस चुनें (Select Invoices for e-Way Bill):' : 'Select Invoices for e-Way Bill:'}</span>
            </h4>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const overFifty = availableInvoices.filter(i => i.grandTotal >= 50000).map(i => i.id);
                  setSelectedIds(overFifty);
                }}
                className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded font-bold cursor-pointer"
              >
                &gt; ₹50k Only
              </button>
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-0.5 rounded border border-slate-700 cursor-pointer"
              >
                {selectedIds.length === availableInvoices.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={isHindi ? 'इनवॉइस #, पार्टी या GSTIN खोजें...' : 'Search Invoice #, party name...'}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as any)}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="ALL">{isHindi ? 'सभी इनवॉइस' : 'All Invoices'}</option>
              <option value="OVER_50K">&gt; ₹50,000 (Mandatory)</option>
              <option value="INTERSTATE">{isHindi ? 'इंटर-स्टेट (IGST)' : 'Inter-State'}</option>
              <option value="SELECTED">{isHindi ? 'केवल चयनित' : 'Selected Only'}</option>
            </select>
          </div>

          {/* Table */}
          <div className="overflow-x-auto max-h-80 border border-slate-800 rounded-xl">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold sticky top-0 z-10 border-b border-slate-800">
                <tr>
                  <th className="p-2.5 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length > 0 && selectedIds.length === availableInvoices.length}
                      onChange={handleSelectAll}
                      className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                    />
                  </th>
                  <th className="p-2.5">Invoice #</th>
                  <th className="p-2.5">Party & GSTIN</th>
                  <th className="p-2.5 text-right">Grand Total</th>
                  <th className="p-2.5 text-center">e-Way Bill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {displayedInvoices.map(inv => {
                  const isSelected = selectedIds.includes(inv.id);
                  const isMandatory = inv.grandTotal >= 50000;
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => toggleSelect(inv.id)}
                      className={`hover:bg-slate-800/50 cursor-pointer transition ${isSelected ? 'bg-indigo-950/25' : ''}`}
                    >
                      <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(inv.id)}
                          className="w-3.5 h-3.5 accent-indigo-600 rounded cursor-pointer"
                        />
                      </td>
                      <td className="p-2.5">
                        <div className="font-bold text-white font-mono">{inv.invoiceNumber}</div>
                        <div className="text-[10px] text-slate-500">{inv.date}</div>
                      </td>
                      <td className="p-2.5">
                        <div className="font-medium text-slate-200 truncate max-w-[150px]">{inv.partyName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {inv.partyGstin || 'URP'}
                        </div>
                      </td>
                      <td className="p-2.5 text-right font-mono font-bold text-amber-300">
                        {formatCurrency(inv.grandTotal, currency)}
                      </td>
                      <td className="p-2.5 text-center">
                        {isMandatory ? (
                          <span className="text-[9px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
                            &gt; 50k
                          </span>
                        ) : (
                          <span className="text-[9px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                            &lt; 50k
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span>{selectedIds.length} of {availableInvoices.length} selected</span>
            {onOpenModal && (
              <button
                type="button"
                onClick={() => onOpenModal(selectedIds)}
                className="text-indigo-400 hover:text-indigo-300 font-semibold underline cursor-pointer"
              >
                {isHindi ? 'फुल-स्क्रीन जेनरेटर मोडल खोलें' : 'Open Fullscreen Generator Modal'}
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Part-B Config & JSON Actions (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          
          {/* Part-B Config Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-xl text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-bold text-amber-300 flex items-center gap-1.5 uppercase text-[11px]">
                <Truck className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'पार्ट-बी परिवहन सेटिंग्स' : 'Part-B Transport Settings'}</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">Road / Rail / Air</span>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Vehicle No. *</label>
                  <input
                    type="text"
                    value={transportConfig.vehicleNo || ''}
                    onChange={(e) => setTransportConfig(prev => ({ 
                      ...prev, 
                      vehicleNo: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() 
                    }))}
                    placeholder="DL01AB1234"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-xs uppercase text-amber-400 font-bold focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Distance (KM) *</label>
                  <input
                    type="number"
                    value={transportConfig.distanceKm || ''}
                    onChange={(e) => setTransportConfig(prev => ({ ...prev, distanceKm: parseInt(e.target.value, 10) || 0 }))}
                    placeholder="250"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Transporter Name</label>
                <input
                  type="text"
                  value={transportConfig.transporterName || ''}
                  onChange={(e) => setTransportConfig(prev => ({ ...prev, transporterName: e.target.value }))}
                  placeholder="TCI Freight Logistics / VRL"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Transporter ID</label>
                  <input
                    type="text"
                    value={transportConfig.transporterId || ''}
                    onChange={(e) => setTransportConfig(prev => ({ ...prev, transporterId: e.target.value.toUpperCase() }))}
                    placeholder="07AAAAA0000A1Z5"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">LR Document No.</label>
                  <input
                    type="text"
                    value={transportConfig.transDocNo || ''}
                    onChange={(e) => setTransportConfig(prev => ({ ...prev, transDocNo: e.target.value }))}
                    placeholder="LR-99882"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 font-mono text-xs text-white focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="pt-2 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={selectedIds.length === 0}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2 px-3 rounded-xl shadow transition flex items-center justify-center gap-1.5 text-xs cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isHindi ? 'NIC JSON डाउनलोड' : 'Download NIC JSON'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold p-2 rounded-xl border border-slate-700 transition cursor-pointer"
                  title="Copy JSON"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="button"
                onClick={handleSimulate}
                disabled={selectedIds.length === 0}
                className="w-full bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/40 font-bold py-2 px-3 rounded-xl transition flex items-center justify-center gap-1.5 text-xs cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>{isHindi ? 'पोर्टल रिस्पॉन्स सिमुलेट करें' : 'Simulate Portal Generation'}</span>
              </button>
            </div>
          </div>

          {/* Validation Notice */}
          <div className={`p-3.5 rounded-xl border text-xs ${
            hasValidationErrors 
              ? 'bg-rose-950/30 border-rose-500/40 text-rose-300' 
              : 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
          }`}>
            <div className="font-bold flex items-center gap-1.5">
              {hasValidationErrors ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
              <span>{hasValidationErrors ? 'NIC Schema Validation Issues' : 'NIC e-Way Bill Schema Valid'}</span>
            </div>
            <p className="text-[11px] opacity-80 mt-1">
              {validationIssues.length === 0 
                ? 'All consignor, consignee, HSN codes, and tax rates strictly comply with ewaybillgst.gov.in format.'
                : `${validationIssues.length} check(s) found. Check before official upload.`}
            </p>
          </div>
        </div>
      </div>

      {/* Simulated Results Drawer if available */}
      {simulatedBills.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" />
              <h4 className="font-bold text-white text-sm">
                {isHindi ? 'सिमुलेटेड ई-वे बिल पावती पर्ची (Simulated e-Way Bill Slips)' : 'Simulated e-Way Bill Acknowledgment Slips'}
              </h4>
            </div>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/40">
              {simulatedBills.length} BILLS GENERATED
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {simulatedBills.map(sim => (
              <div key={sim.ewayBillNo} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-mono">e-Way Bill No.</div>
                    <div className="text-base font-black text-amber-400 font-mono tracking-wider">{sim.ewayBillNo}</div>
                  </div>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded">
                    ACTIVE
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Invoice:</span>
                    <span className="font-bold text-white font-mono">{sim.docNo}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Valid Until:</span>
                    <span className="font-bold text-emerald-400 font-mono">{sim.validUntil}</span>
                  </div>
                </div>

                <div className="text-[11px] space-y-0.5 pt-1">
                  <div className="text-slate-300 font-medium truncate">To: {sim.toTrdName} ({sim.toGstin})</div>
                  <div className="text-slate-400 font-mono text-[10px]">Vehicle: <span className="text-amber-300 font-bold">{sim.vehicleNo}</span> | Distance: {sim.transDistance}</div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800/60">
                  <span className="text-amber-400 font-bold font-mono text-xs">{formatCurrency(sim.totInvValue, currency)}</span>
                  <div className="flex items-center gap-1 text-[10px] text-indigo-400 font-mono">
                    <QrCode className="w-3.5 h-3.5" />
                    <span>NIC Digital QR Verified</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
