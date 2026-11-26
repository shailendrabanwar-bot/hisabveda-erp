import React, { useState, useMemo } from 'react';
import { 
  X, 
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
  Calendar,
  Building2,
  MapPin,
  Clock,
  QrCode,
  Layers,
  ArrowRight
} from 'lucide-react';
import { AppData, SalesInvoice } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { 
  EWayBillBulkJsonPayload, 
  EWayBillDocPayload, 
  TransportDetailsConfig, 
  SimulatedEWayBillResult,
  generateBulkEWayBillJson, 
  validateInvoicesForEWayBill, 
  simulateEWayBillGeneration, 
  downloadEWayBillJsonFile,
  estimateTransportDistance,
  parseStateCodeNum
} from '../../utils/ewayBill';
import { INDIAN_STATE_CODES } from '../../utils/gstin';
import { AppConfiguration, loadAppConfig } from '../../utils/appConfig';
import { printDomElement } from '../../utils/printReport';
import { exportElementToPdf } from '../../utils/pdfExport';
import { PrintConfigPanel } from '../Common/PrintConfigPanel';

interface EWayBillGeneratorModalProps {
  data: AppData;
  isHindi: boolean;
  initialSelectedInvoiceIds?: string[];
  onClose: () => void;
  onUpdateInvoiceEwbNumber?: (invId: string, ewbNo: string, ewbDate: string) => void;
}

export const EWayBillGeneratorModal: React.FC<EWayBillGeneratorModalProps> = ({
  data,
  isHindi,
  initialSelectedInvoiceIds = [],
  onClose,
  onUpdateInvoiceEwbNumber
}) => {
  const currency = data.company.currency;
  
  // Available eligible invoices (Non-cancelled outward sales invoices)
  const availableInvoices = useMemo(() => {
    return data.invoices.filter(i => i.status !== 'CANCELLED');
  }, [data.invoices]);

  // Selected invoices state
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    if (initialSelectedInvoiceIds.length > 0) {
      return initialSelectedInvoiceIds;
    }
    // Default select invoices > 50,000 threshold or the first 3
    const overFifty = availableInvoices.filter(i => i.grandTotal >= 50000).map(i => i.id);
    return overFifty.length > 0 ? overFifty : availableInvoices.slice(0, 3).map(i => i.id);
  });

  // Filter & Search in selection table
  const [tableSearch, setTableSearch] = useState('');
  const [tableFilter, setTableFilter] = useState<'ALL' | 'OVER_50K' | 'INTERSTATE' | 'SELECTED'>('ALL');

  // Active Tab: 'selection' | 'transport' | 'json' | 'simulation'
  const [activeTab, setActiveTab] = useState<'selection' | 'transport' | 'json' | 'simulation'>('selection');

  // Global Transport Details Config (Part-B)
  const [transportConfig, setTransportConfig] = useState<TransportDetailsConfig>({
    transMode: '1', // 1: Road
    vehicleNo: '',
    vehicleType: 'R', // Regular
    transporterId: '',
    transporterName: '',
    transDocNo: '',
    transDocDate: new Date().toISOString().split('T')[0],
    distanceKm: 0,
    subSupplyType: '1', // Supply
    subSupplyDesc: '',
    transactionType: 1, // Regular
    docType: 'INV'
  });

  // Per-invoice custom overrides (optional)
  const [customConfigs, setCustomConfigs] = useState<Record<string, Partial<TransportDetailsConfig>>>({});

  // Simulation Results
  const [simulatedBills, setSimulatedBills] = useState<SimulatedEWayBillResult[]>([]);
  const [copiedJson, setCopiedJson] = useState(false);
  const [savedToInvoices, setSavedToInvoices] = useState(false);
  const [ewbPrintConfig, setEwbPrintConfig] = useState<AppConfiguration>(() => loadAppConfig());
  const [showEwbPrintConfig, setShowEwbPrintConfig] = useState(false);

  // Selected Invoices Objects
  const selectedInvoices = useMemo(() => {
    return availableInvoices.filter(i => selectedIds.includes(i.id));
  }, [availableInvoices, selectedIds]);

  // Combined configurations for each selected invoice
  const combinedConfigs = useMemo(() => {
    const map: Record<string, Partial<TransportDetailsConfig>> = {};
    selectedInvoices.forEach(inv => {
      // Calculate realistic auto-distance based on states if not manually set
      const fromSt = parseStateCodeNum(data.company.stateCode || data.company.state);
      const toSt = parseStateCodeNum(inv.partyGstin ? inv.partyGstin.substring(0, 2) : inv.placeOfSupply);
      const autoDist = estimateTransportDistance(fromSt, toSt);

      map[inv.id] = {
        ...transportConfig,
        distanceKm: transportConfig.distanceKm || autoDist,
        ...(customConfigs[inv.id] || {})
      };
    });
    return map;
  }, [selectedInvoices, transportConfig, customConfigs, data.company]);

  // Generate Current JSON Payload
  const currentJsonPayload: EWayBillBulkJsonPayload = useMemo(() => {
    return generateBulkEWayBillJson(selectedInvoices, data.company, combinedConfigs);
  }, [selectedInvoices, data.company, combinedConfigs]);

  // Validation Issues
  const validationIssues = useMemo(() => {
    return validateInvoicesForEWayBill(selectedInvoices, data.company, combinedConfigs);
  }, [selectedInvoices, data.company, combinedConfigs]);

  const hasValidationErrors = validationIssues.some(i => i.severity === 'error');

  // Handle invoice toggle
  const toggleInvoiceSelect = (id: string) => {
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

  const handleSelectOver50k = () => {
    const overFifty = availableInvoices.filter(i => i.grandTotal >= 50000).map(i => i.id);
    setSelectedIds(overFifty);
  };

  // Filtered invoices for the selection table
  const displayedInvoices = useMemo(() => {
    return availableInvoices.filter(inv => {
      // Search check
      const q = tableSearch.toLowerCase().trim();
      const matchSearch = !q || 
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.partyName.toLowerCase().includes(q) ||
        (inv.partyGstin && inv.partyGstin.toLowerCase().includes(q)) ||
        (inv.placeOfSupply && inv.placeOfSupply.toLowerCase().includes(q));

      if (!matchSearch) return false;

      // Filter check
      if (tableFilter === 'OVER_50K') return inv.grandTotal >= 50000;
      if (tableFilter === 'INTERSTATE') return inv.isInterState;
      if (tableFilter === 'SELECTED') return selectedIds.includes(inv.id);
      return true;
    });
  }, [availableInvoices, tableSearch, tableFilter, selectedIds]);

  // Handle Copy JSON
  const handleCopyJson = () => {
    const jsonString = JSON.stringify(currentJsonPayload, null, 2);
    navigator.clipboard.writeText(jsonString);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 3000);
  };

  // Handle Download JSON
  const handleDownloadJson = () => {
    downloadEWayBillJsonFile(currentJsonPayload);
  };

  // Handle Portal Simulation
  const handleRunSimulation = () => {
    const results = currentJsonPayload.billLists.map(doc => simulateEWayBillGeneration(doc));
    setSimulatedBills(results);
    setActiveTab('simulation');
  };

  // Save generated e-Way bill numbers back to invoices
  const handleSaveEwbToInvoices = () => {
    if (!onUpdateInvoiceEwbNumber) return;
    simulatedBills.forEach(sim => {
      const matchInv = selectedInvoices.find(i => i.invoiceNumber === sim.docNo);
      if (matchInv) {
        onUpdateInvoiceEwbNumber(matchInv.id, sim.ewayBillNo, sim.ewayBillDate);
      }
    });
    setSavedToInvoices(true);
    setTimeout(() => setSavedToInvoices(false), 4000);
  };

  // Metrics
  const totalSelectedValue = selectedInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
  const totalMandatoryCount = availableInvoices.filter(i => i.grandTotal >= 50000).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[94vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950/40 border-b border-slate-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">
                  {isHindi ? 'जीएसटी ई-वे बिल JSON जेनरेटर एवं पोर्टल सिमुलेटर' : 'GST e-Way Bill JSON Generator & Portal Tool'}
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2 py-0.5 rounded border border-emerald-500/40 font-mono">
                  NIC v1.0.0421
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {isHindi 
                  ? 'भारत सरकार के ई-वे बिल पोर्टल (ewaybillgst.gov.in) के प्रारूप अनुसार बल्क JSON जनरेशन' 
                  : 'Generate bulk e-Way Bill JSON formatted for National Informatics Centre (NIC) portal bulk upload'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://ewaybillgst.gov.in"
              target="_blank"
              rel="noreferrer"
              className="hidden sm:flex items-center gap-1.5 text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 px-3 py-1.5 rounded-xl transition cursor-pointer"
              title="Open Official NIC e-Way Bill Portal"
            >
              <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
              <span>{isHindi ? 'पोर्टल खोलें' : 'NIC Portal'}</span>
            </a>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Top Workflow Tabs */}
        <div className="flex border-b border-slate-700/80 bg-slate-800/60 px-4 pt-2 gap-2 text-xs font-bold overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('selection')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'selection'
                ? 'border-indigo-400 text-indigo-300 bg-indigo-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-indigo-400" />
            <span>{isHindi ? '1. इनवॉइस चयन (Part-A)' : '1. Invoices Selection'}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-600/40 text-indigo-200 font-mono ml-1">
              {selectedIds.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transport')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'transport'
                ? 'border-amber-400 text-amber-300 bg-amber-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Truck className="w-3.5 h-3.5 text-amber-400" />
            <span>{isHindi ? '2. परिवहन विवरण (Part-B)' : '2. Transport Details'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('json')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'json'
                ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isHindi ? '3. JSON डाउनलोड व सत्यापन' : '3. JSON & Schema'}</span>
            {hasValidationErrors && (
              <span className="w-2 h-2 rounded-full bg-rose-500 ml-1" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('simulation')}
            className={`pb-2.5 px-3 flex items-center gap-1.5 border-b-2 transition cursor-pointer shrink-0 ${
              activeTab === 'simulation'
                ? 'border-sky-400 text-sky-300 bg-sky-500/10 rounded-t-lg'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>{isHindi ? '4. पोर्टल सिमुलेशन व ई-वे बिल' : '4. Portal Simulation'}</span>
            {simulatedBills.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-sky-600/40 text-sky-200 font-mono ml-1">
                {simulatedBills.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-xs flex-1">
          
          {/* TAB 1: INVOICE SELECTION & PART-A */}
          {activeTab === 'selection' && (
            <div className="space-y-4">
              {/* Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                  <div className="text-[10px] uppercase font-bold text-slate-400">{isHindi ? 'कुल आउटवर्ड इनवॉइस' : 'Total Outward Invoices'}</div>
                  <div className="text-lg font-bold text-white mt-0.5">{availableInvoices.length}</div>
                </div>

                <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-500/30">
                  <div className="text-[10px] uppercase font-bold text-amber-300">{isHindi ? 'ई-वे बिल अनिवार्य (> ₹50k)' : 'Mandatory (> ₹50k)'}</div>
                  <div className="text-lg font-bold text-amber-400 mt-0.5">{totalMandatoryCount} <span className="text-xs font-normal">invoices</span></div>
                </div>

                <div className="p-3 bg-indigo-950/30 rounded-xl border border-indigo-500/30">
                  <div className="text-[10px] uppercase font-bold text-indigo-300">{isHindi ? 'चयनित इनवॉइस' : 'Selected for e-Way Bill'}</div>
                  <div className="text-lg font-bold text-indigo-400 mt-0.5">{selectedIds.length} <span className="text-xs font-normal">of {availableInvoices.length}</span></div>
                </div>

                <div className="p-3 bg-emerald-950/30 rounded-xl border border-emerald-500/30">
                  <div className="text-[10px] uppercase font-bold text-emerald-300">{isHindi ? 'चयनित माल मूल्य' : 'Total Consignment Value'}</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5 font-mono">{formatCurrency(totalSelectedValue, currency)}</div>
                </div>
              </div>

              {/* Table Controls */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/70">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder={isHindi ? 'इनवॉइस #, पार्टी या स्थान खोजें...' : 'Search Invoice #, party name, or POS...'}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTableFilter('ALL')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${tableFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {isHindi ? 'सभी' : 'All'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableFilter('OVER_50K')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${tableFilter === 'OVER_50K' ? 'bg-amber-600 text-slate-950 font-bold' : 'text-amber-400 hover:text-amber-300'}`}
                    >
                      &gt; ₹50,000 ({totalMandatoryCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableFilter('INTERSTATE')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${tableFilter === 'INTERSTATE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {isHindi ? 'इंटर-स्टेट (IGST)' : 'Inter-State'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTableFilter('SELECTED')}
                      className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${tableFilter === 'SELECTED' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {isHindi ? 'चयनित' : 'Selected'} ({selectedIds.length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSelectOver50k}
                    className="text-[11px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold transition cursor-pointer"
                  >
                    {isHindi ? '⚡ केवल > ₹50k चुनें' : '⚡ Select All > ₹50k'}
                  </button>
                </div>
              </div>

              {/* Invoices Selection Table */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-800/90 text-slate-400 text-[10px] uppercase font-bold sticky top-0 z-10 border-b border-slate-700">
                      <tr>
                        <th className="p-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.length > 0 && selectedIds.length === availableInvoices.length}
                            onChange={handleSelectAll}
                            className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                          />
                        </th>
                        <th className="p-3">Invoice # / Date</th>
                        <th className="p-3">Customer Party & GSTIN</th>
                        <th className="p-3">Place of Supply</th>
                        <th className="p-3 text-center">Items & HSN</th>
                        <th className="p-3 text-right">Taxable & Tax</th>
                        <th className="p-3 text-right">Invoice Grand Total</th>
                        <th className="p-3 text-center">e-Way Bill Rule</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {displayedInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-6 text-center text-slate-500">
                            {isHindi ? 'कोई इनवॉइस नहीं मिला।' : 'No matching sales invoices found.'}
                          </td>
                        </tr>
                      ) : (
                        displayedInvoices.map(inv => {
                          const isSelected = selectedIds.includes(inv.id);
                          const isOver50k = inv.grandTotal >= 50000;
                          return (
                            <tr
                              key={inv.id}
                              onClick={() => toggleInvoiceSelect(inv.id)}
                              className={`hover:bg-slate-800/60 cursor-pointer transition ${
                                isSelected ? 'bg-indigo-950/20' : ''
                              }`}
                            >
                              <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleInvoiceSelect(inv.id)}
                                  className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                                />
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-white font-mono">{inv.invoiceNumber}</div>
                                <div className="text-[10px] text-slate-400">{inv.date}</div>
                              </td>
                              <td className="p-3">
                                <div className="font-semibold text-slate-200">{inv.partyName}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {inv.partyGstin ? inv.partyGstin : <span className="text-slate-500 italic">Unregistered (URP)</span>}
                                </div>
                              </td>
                              <td className="p-3">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  inv.isInterState ? 'bg-purple-950 text-purple-300 border border-purple-800' : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {inv.placeOfSupply || inv.partyState || 'Delhi'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <span className="bg-slate-800 px-2 py-0.5 rounded text-[11px] font-mono">
                                  {inv.items?.length || 1} items
                                </span>
                              </td>
                              <td className="p-3 text-right font-mono">
                                <div className="text-slate-300">{formatCurrency(inv.subtotal - inv.totalDiscount, currency)}</div>
                                <div className="text-[10px] text-slate-400">Tax: {formatCurrency(inv.totalTax, currency)}</div>
                              </td>
                              <td className="p-3 text-right">
                                <div className="font-extrabold text-amber-300 font-mono text-sm">
                                  {formatCurrency(inv.grandTotal, currency)}
                                </div>
                              </td>
                              <td className="p-3 text-center">
                                {isOver50k ? (
                                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-2 py-0.5 rounded font-bold">
                                    MANDATORY
                                  </span>
                                ) : (
                                  <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded">
                                    OPTIONAL
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="text-slate-400 text-xs">
                  {selectedIds.length === 0 ? (
                    <span className="text-rose-400 font-semibold">{isHindi ? 'कृपया कम से कम एक इनवॉइस चुनें।' : 'Please select at least 1 invoice to proceed.'}</span>
                  ) : (
                    <span>
                      {isHindi ? `${selectedIds.length} इनवॉइस चयनित (कुल मूल्य: ${formatCurrency(totalSelectedValue, currency)})` : `${selectedIds.length} invoice(s) selected (Total: ${formatCurrency(totalSelectedValue, currency)})`}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={selectedIds.length === 0}
                    onClick={() => setActiveTab('transport')}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
                  >
                    <span>{isHindi ? 'परिवहन विवरण भरें (Next: Part-B)' : 'Next: Transport Details'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRANSPORTATION & LOGISTICS DETAILS (PART-B) */}
          {activeTab === 'transport' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-amber-950/30 via-slate-800 to-indigo-950/30 p-4 rounded-xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                    <Truck className="w-4 h-4 text-amber-400" />
                    <span>{isHindi ? 'भाग-बी: परिवहन एवं लॉजिस्टिक्स विवरण (Part-B Transport Details)' : 'Part-B: Transporter & Vehicle Configuration'}</span>
                  </h4>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded border border-amber-500/40">
                    Rule 138(2) CGST
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  {isHindi 
                    ? 'नीचे दिया गया ट्रांसपोर्ट विवरण सभी चयनित ' + selectedIds.length + ' इनवॉइसों पर स्वतः लागू होगा। आप आवश्यकतानुसार वाहन नंबर या ट्रांसपोर्टर बदल सकते हैं।'
                    : 'The transport configuration below will be applied to all ' + selectedIds.length + ' selected consignment(s). Formatted to NIC JSON specifications.'}
                </p>
              </div>

              {/* Form Grid */}
              <div className="bg-slate-800/60 p-4 rounded-xl border border-slate-700 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Mode of Transport */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'परिवहन का माध्यम (Transport Mode) *' : 'Mode of Transport *'}
                    </label>
                    <select
                      value={transportConfig.transMode}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, transMode: e.target.value as any }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="1">1 - Road (सड़क मार्ग)</option>
                      <option value="2">2 - Rail (रेलवे)</option>
                      <option value="3">3 - Air (हवाई मार्ग)</option>
                      <option value="4">4 - Ship (समुद्री / पोत मार्ग)</option>
                    </select>
                  </div>

                  {/* Vehicle Number */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        {isHindi ? 'वाहन नंबर (Vehicle Number) *' : 'Vehicle Number (e.g. DL01AB1234) *'}
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">No spaces</span>
                    </div>
                    <input
                      type="text"
                      value={transportConfig.vehicleNo || ''}
                      onChange={(e) => setTransportConfig(prev => ({ 
                        ...prev, 
                        vehicleNo: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() 
                      }))}
                      placeholder="DL01AB1234"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono uppercase tracking-wider text-xs focus:border-amber-500 focus:outline-none font-bold"
                    />
                  </div>

                  {/* Vehicle Type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'वाहन प्रकार (Vehicle Type) *' : 'Vehicle Type *'}
                    </label>
                    <select
                      value={transportConfig.vehicleType}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, vehicleType: e.target.value as any }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="R">Regular (सामान्य कार्गो - 200 km/day)</option>
                      <option value="O">Over Dimensional Cargo (ODC - 20 km/day)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Transporter ID */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'ट्रांसपोर्टर आईडी / GSTIN' : 'Transporter ID / TRANSIN'}
                    </label>
                    <input
                      type="text"
                      value={transportConfig.transporterId || ''}
                      onChange={(e) => setTransportConfig(prev => ({ 
                        ...prev, 
                        transporterId: e.target.value.toUpperCase() 
                      }))}
                      placeholder="07AAAAA0000A1Z5"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Transporter Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'ट्रांसपोर्टर का नाम' : 'Transporter Name'}
                    </label>
                    <input
                      type="text"
                      value={transportConfig.transporterName || ''}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, transporterName: e.target.value }))}
                      placeholder="TCI Freight Logistics / VRL / Delhivery"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Transit Distance in KM */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-semibold text-slate-300">
                        {isHindi ? 'दूरी (Distance in KM) *' : 'Approx Transit Distance (KM) *'}
                      </label>
                      <span className="text-[10px] text-slate-400">Max 4000 KM</span>
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={4000}
                      value={transportConfig.distanceKm || ''}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, distanceKm: parseInt(e.target.value, 10) || 0 }))}
                      placeholder="250"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-mono text-xs focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Distance Quick Presets */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-400 font-medium">
                    {isHindi ? 'क्विक दूरी प्रीसेट्स:' : 'Quick Distance Presets:'}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[50, 150, 350, 850, 1400].map(km => (
                      <button
                        key={km}
                        type="button"
                        onClick={() => setTransportConfig(prev => ({ ...prev, distanceKm: km }))}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono rounded border border-slate-600 cursor-pointer"
                      >
                        {km} KM
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Transport Doc (LR / RR / Airway Bill No.) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'ट्रांसपोर्ट डॉक / LR नंबर' : 'Trans Doc / Lorry Receipt (LR) No.'}
                    </label>
                    <input
                      type="text"
                      value={transportConfig.transDocNo || ''}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, transDocNo: e.target.value }))}
                      placeholder="LR-98842"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none font-mono"
                    />
                  </div>

                  {/* Trans Doc Date */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'LR / डॉक्युमेंट दिनांक' : 'LR Document Date'}
                    </label>
                    <input
                      type="date"
                      value={transportConfig.transDocDate || ''}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, transDocDate: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Sub-supply Type */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      {isHindi ? 'सप्लाई उप-प्रकार (Sub-Supply Type)' : 'Sub-Supply Type'}
                    </label>
                    <select
                      value={transportConfig.subSupplyType}
                      onChange={(e) => setTransportConfig(prev => ({ ...prev, subSupplyType: e.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-xs focus:border-indigo-500 focus:outline-none"
                    >
                      <option value="1">1 - Supply (नियमित माल बिक्री)</option>
                      <option value="3">3 - Export (निर्यात)</option>
                      <option value="4">4 - Job Work (जॉब वर्क)</option>
                      <option value="5">5 - For Own Use (स्वयं के उपयोग हेतु)</option>
                      <option value="7">7 - Sales Return (बिक्री वापसी)</option>
                      <option value="8">8 - Others (अन्य)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('selection')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  {isHindi ? '← पिछला: इनवॉइस चयन' : '← Back: Invoices Selection'}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('json')}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20 cursor-pointer"
                >
                  <span>{isHindi ? 'JSON प्रीव्यू एवं सत्यापन देखें (Next: JSON)' : 'Next: Preview JSON & Validate'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: JSON PREVIEW & SCHEMA VALIDATION */}
          {activeTab === 'json' && (
            <div className="space-y-4">
              {/* Validation Status Card */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                hasValidationErrors 
                  ? 'bg-rose-950/40 border-rose-500/40 text-rose-200' 
                  : 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
              }`}>
                <div className="flex items-center gap-3">
                  {hasValidationErrors ? (
                    <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold text-sm">
                      {hasValidationErrors 
                        ? (isHindi ? 'NIC स्कीमा में कुछ त्रुटियां हैं' : 'Validation Issues Detected') 
                        : (isHindi ? 'NIC ई-वे बिल स्कीमा 100% सत्यापित!' : 'NIC e-Way Bill JSON Schema 100% Validated!')}
                    </div>
                    <div className="text-[11px] opacity-80 mt-0.5">
                      {selectedInvoices.length} {isHindi ? 'इनवॉइसों का JSON तैयार है' : 'invoice(s) ready for bulk portal upload'} (NIC Schema v1.0.0421)
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyJson}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold px-3 py-1.5 rounded-xl border border-slate-700 transition flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedJson ? (isHindi ? 'कॉपी हो गया!' : 'Copied!') : (isHindi ? 'JSON कॉपी करें' : 'Copy JSON')}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-950 font-extrabold px-4 py-1.5 rounded-xl shadow transition flex items-center gap-1.5 text-xs cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'JSON डाउनलोड करें (.json)' : 'Download JSON File'}</span>
                  </button>
                </div>
              </div>

              {/* Validation Issues List if any */}
              {validationIssues.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 uppercase">
                    <Info className="w-3.5 h-3.5 text-amber-400" />
                    <span>{isHindi ? 'स्कीमा सत्यापन चेतावनियाँ एवं फ़ील्ड रिपोर्ट:' : 'Schema Validation & Compliance Checklist:'}</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {validationIssues.map((issue, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg text-[11px] flex items-start gap-2 border ${
                          issue.severity === 'error'
                            ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                            : 'bg-amber-950/30 border-amber-800/50 text-amber-300'
                        }`}
                      >
                        <span className="font-mono font-bold uppercase text-[9px] px-1 py-0.2 rounded bg-slate-950">
                          {issue.severity}
                        </span>
                        <span>{isHindi ? issue.messageHindi : issue.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formatted JSON Viewer */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-inner">
                <div className="bg-slate-900 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400 font-mono">
                    <span className="text-emerald-400 font-bold">NIC_eWayBill_Bulk_Upload.json</span>
                    <span>({currentJsonPayload.billLists.length} bills, version {currentJsonPayload.version})</span>
                  </div>
                  <span className="text-slate-500 font-mono text-[10px]">Formatted JSON</span>
                </div>
                <pre className="p-4 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-80 leading-relaxed selection:bg-emerald-800 selection:text-white">
                  {JSON.stringify(currentJsonPayload, null, 2)}
                </pre>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('transport')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  {isHindi ? '← पिछला: परिवहन विवरण' : '← Back: Transport Details'}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRunSimulation}
                    className="bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-sky-600/20 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-amber-300" />
                    <span>{isHindi ? 'पोर्टल सिमुलेशन चलाएँ (Simulate e-Way Bill)' : 'Simulate NIC Portal Response'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PORTAL SIMULATION & OFFICIAL E-WAY BILL SLIP */}
          {activeTab === 'simulation' && (
            <div className="space-y-5">
              {simulatedBills.length === 0 ? (
                <div className="p-8 text-center bg-slate-900 rounded-2xl border border-slate-800 space-y-3">
                  <Truck className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-semibold text-slate-300">
                    {isHindi ? 'सिमुलेशन अभी नहीं चलाया गया है।' : 'Portal simulation has not been initiated yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={handleRunSimulation}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition"
                  >
                    {isHindi ? 'पोर्टल सिमुलेशन शुरू करें' : 'Run Portal Simulation Now'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Success Banner */}
                  <div className="bg-gradient-to-r from-emerald-950/50 via-slate-800 to-indigo-950/50 p-4 rounded-xl border border-emerald-500/40 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-sm text-emerald-200">
                          {isHindi ? 'ई-वे बिल सफलतापूर्वक जनरेट हो गए (सिमुलेटेड)!' : 'e-Way Bills Generated Successfully (Simulated)!'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {simulatedBills.length} {isHindi ? 'ई-वे बिल नंबर आवंटित किए गए' : 'official e-Way Bill Numbers generated with 24-hr/200km validity'}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 no-print">
                      <button
                        type="button"
                        onClick={handleSaveEwbToInvoices}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{savedToInvoices ? (isHindi ? 'सेव हो गया!' : 'Saved to Invoices!') : (isHindi ? 'इनवॉइसों में ई-वे बिल नं. जोड़ें' : 'Save e-Way No. to Invoices')}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowEwbPrintConfig(prev => !prev)}
                        className={`font-bold text-xs px-3 py-2 rounded-xl border transition flex items-center gap-1.5 cursor-pointer ${
                          showEwbPrintConfig
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                        }`}
                      >
                        <span>{isHindi ? 'प्रिंट सेटिंग्स' : 'Print Config'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await exportElementToPdf('printable-eway-slip', {
                            filename: `EWayBill_Slips_${new Date().toISOString().split('T')[0]}`,
                            paperSize: ewbPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                            orientation: ewbPrintConfig.printOrientation,
                            marginMode: ewbPrintConfig.printMargins,
                            scale: 2
                          });
                          if (!ok) {
                            printDomElement('printable-eway-slip', {
                              paperSize: ewbPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                              orientation: ewbPrintConfig.printOrientation,
                              marginMode: ewbPrintConfig.printMargins,
                              title: 'GST e-Way Bill Slips'
                            });
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'PDF डाउनलोड' : 'Download PDF'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          printDomElement('printable-eway-slip', {
                            paperSize: ewbPrintConfig.defaultPaperSize === 'A5' ? 'A5' : 'A4',
                            orientation: ewbPrintConfig.printOrientation,
                            marginMode: ewbPrintConfig.printMargins,
                            title: 'GST e-Way Bill Slips'
                          })
                        }
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs px-3.5 py-2 rounded-xl border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-amber-400" />
                        <span>{isHindi ? 'प्रिंट स्लिप' : 'Print Slip'}</span>
                      </button>
                    </div>
                  </div>

                  {showEwbPrintConfig && (
                    <div className="rounded-xl overflow-hidden border border-slate-800 no-print">
                      <PrintConfigPanel
                        config={ewbPrintConfig}
                        onChange={setEwbPrintConfig}
                        isHindi={isHindi}
                        docKind="eway"
                      />
                    </div>
                  )}

                  {/* Official e-Way Bill Slips (NIC Print Style) */}
                  <div id="printable-eway-slip" className="space-y-4">
                    {simulatedBills.map((sim, index) => (
                      <div 
                        key={sim.ewayBillNo} 
                        className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4 shadow-xl"
                      >
                        {/* Slip Top Header */}
                        <div className="border-b border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                              Government of India • GST e-Way Bill System
                            </div>
                            <h4 className="text-lg font-black text-white font-mono tracking-wider mt-0.5">
                              e-Way Bill No: <span className="text-amber-400">{sim.ewayBillNo}</span>
                            </h4>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase">
                              STATUS: ACTIVE / GENERATED
                            </span>
                          </div>
                        </div>

                        {/* Part-A & Part-B Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Part-A: Document & Supplier/Recipient */}
                          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                            <div className="font-bold text-indigo-300 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                              <span>PART-A: DOCUMENT & CONSIGNMENT DETAILS</span>
                              <span className="text-[10px] text-slate-500 font-mono">Invoice: {sim.docNo}</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500 block">Generated On:</span>
                                <span className="text-slate-200 font-medium font-mono">{sim.ewayBillDate}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Valid Until:</span>
                                <span className="text-emerald-400 font-bold font-mono">{sim.validUntil}</span>
                              </div>
                            </div>

                            <div className="pt-1 space-y-1 text-[11px]">
                              <div>
                                <span className="text-slate-500">From (Consignor):</span>{' '}
                                <span className="text-slate-200 font-bold">{sim.fromTrdName}</span>
                                <span className="text-slate-400 font-mono block text-[10px]">GSTIN: {sim.fromGstin}</span>
                              </div>

                              <div className="pt-1">
                                <span className="text-slate-500">To (Consignee):</span>{' '}
                                <span className="text-slate-200 font-bold">{sim.toTrdName}</span>
                                <span className="text-slate-400 font-mono block text-[10px]">GSTIN: {sim.toGstin}</span>
                              </div>

                              <div className="pt-1 flex justify-between items-center font-mono">
                                <span className="text-slate-500">Total Consignment Value:</span>
                                <span className="text-amber-300 font-bold text-xs">{formatCurrency(sim.totInvValue, currency)}</span>
                              </div>
                            </div>
                          </div>

                          {/* Part-B: Vehicle & Transportation */}
                          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                            <div className="font-bold text-amber-300 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                              <span>PART-B: VEHICLE & MOVEMENT DETAILS</span>
                              <span className="text-[10px] text-slate-500 font-mono">Road (1)</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div>
                                <span className="text-slate-500 block">Vehicle Number:</span>
                                <span className="text-amber-400 font-black font-mono text-sm tracking-wider">{sim.vehicleNo}</span>
                              </div>
                              <div>
                                <span className="text-slate-500 block">Transit Distance:</span>
                                <span className="text-slate-200 font-bold font-mono">{sim.transDistance}</span>
                              </div>
                            </div>

                            {/* Simulated QR Code / Barcode Block */}
                            <div className="mt-3 p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between gap-3">
                              <div className="space-y-0.5">
                                <div className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1">
                                  <QrCode className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Digital QR Code Verification</span>
                                </div>
                                <div className="text-[9px] text-slate-500 font-mono">
                                  Encrypted with NIC Public Key • Scan via e-Way Bill App
                                </div>
                              </div>
                              <div className="w-14 h-14 bg-white p-1 rounded border border-slate-700 flex items-center justify-center shrink-0">
                                <QrCode className="w-full h-full text-slate-950" />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Footer Disclaimer */}
                        <div className="text-[10px] text-slate-500 pt-1 border-t border-slate-800/80 flex items-center justify-between">
                          <span>Simulated strictly following Section 68 of CGST Act read with Rule 138.</span>
                          <span className="font-mono">JSON Doc #{index + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Bottom Buttons */}
                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('json')}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition cursor-pointer"
                    >
                      {isHindi ? '← पिछला: JSON देखें' : '← Back to JSON'}
                    </button>

                    <button
                      type="button"
                      onClick={handleDownloadJson}
                      className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs px-5 py-2.5 rounded-xl shadow transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      <span>{isHindi ? 'अंतिम पोर्टल JSON डाउनलोड करें' : 'Download Portal JSON File'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
