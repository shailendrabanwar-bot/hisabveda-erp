import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Download, 
  Trash2, 
  Filter, 
  Clock, 
  User, 
  FileText, 
  Receipt, 
  ArrowRightLeft, 
  Landmark, 
  Package, 
  Users, 
  Settings, 
  PlusCircle, 
  CheckCircle2, 
  History,
  FileSpreadsheet
} from 'lucide-react';
import { AppData, AuditLog, UserRole } from '../../types';
import { RolePermissions, getRolePermissions, normalizeUserRole } from '../../utils/rbac';

interface AuditLogViewProps {
  data: AppData;
  isHindi: boolean;
  onAddLog: (action: string, details: string) => void;
  onClearLogs?: () => void;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  data,
  isHindi,
  onAddLog,
  onClearLogs,
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [noteAction, setNoteAction] = useState('Manual Audit Entry');
  const [noteDetails, setNoteDetails] = useState('');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);

  // Primary audit trail retrieval with fallback
  const auditList: AuditLog[] = data.auditTrail || data.auditLogs || [];

  // Filter logs based on category and search query
  const filteredLogs = auditList.filter(log => {
    const matchesSearch = 
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.timestamp.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (selectedCategory === 'ALL') return true;
    if (selectedCategory === 'INVOICES') return log.action.toLowerCase().includes('invoice') || log.action.toLowerCase().includes('payment');
    if (selectedCategory === 'VOUCHERS') return log.action.toLowerCase().includes('voucher');
    if (selectedCategory === 'MASTERS') return log.action.toLowerCase().includes('master') || log.action.toLowerCase().includes('party') || log.action.toLowerCase().includes('item') || log.action.toLowerCase().includes('account');
    if (selectedCategory === 'SECURITY') return log.action.toLowerCase().includes('pin') || log.action.toLowerCase().includes('system') || log.action.toLowerCase().includes('currency') || log.action.toLowerCase().includes('audit');

    return true;
  });

  // Export Audit Trail to CSV
  const handleExportCSV = () => {
    if (auditList.length === 0) {
      setExportNotice(isHindi ? 'निर्यात करने के लिए कोई ऑडिट लॉग नहीं है।' : 'No audit logs available to export.');
      return;
    }
    setExportNotice(null);

    const headers = ['Log ID', 'Timestamp', 'User', 'Action', 'Details'];
    const rows = auditList.map(l => [
      `"${l.id}"`,
      `"${l.timestamp}"`,
      `"${l.user}"`,
      `"${l.action.replace(/"/g, '""')}"`,
      `"${l.details.replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `HisabVeda_Audit_Trail_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Helper for Icon based on Action Name
  const getActionIcon = (actionName: string) => {
    const act = actionName.toLowerCase();
    if (act.includes('invoice') || act.includes('sales')) {
      return <Receipt className="w-4 h-4 text-emerald-400" />;
    }
    if (act.includes('voucher') || act.includes('payment') || act.includes('receipt')) {
      return <ArrowRightLeft className="w-4 h-4 text-indigo-400" />;
    }
    if (act.includes('bank') || act.includes('reconcil')) {
      return <Landmark className="w-4 h-4 text-sky-400" />;
    }
    if (act.includes('item') || act.includes('master')) {
      return <Package className="w-4 h-4 text-amber-400" />;
    }
    if (act.includes('party')) {
      return <Users className="w-4 h-4 text-purple-400" />;
    }
    if (act.includes('pin') || act.includes('security') || act.includes('system') || act.includes('currency')) {
      return <ShieldCheck className="w-4 h-4 text-rose-400" />;
    }
    return <FileText className="w-4 h-4 text-slate-400" />;
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteDetails.trim()) return;
    onAddLog(noteAction, noteDetails.trim());
    setNoteDetails('');
    setShowAddNoteModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="hv-surface border rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl hv-pill-indigo border flex items-center justify-center shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-black text-[var(--text-primary)] tracking-wide">
                  {isHindi ? 'ऑडिट लॉग एवं इतिहास (Audit Trail)' : 'Chronological Audit Trail & Log'}
                </h2>
                <span className="hv-pill-emerald border text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {isHindi ? 'सक्रिय एनक्रिप्टेड ट्रैकिंग' : 'Active Immutable Logging'}
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] mt-1">
                {isHindi 
                  ? 'इनवॉइस निर्माण, वाउचर संशोधन एवं सिस्टम बदलावों की पूरी समयबद्ध जवाबदेही' 
                  : 'Real-time chronological activity ledger for transaction creation, edits, deletions, and administrative actions.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!perms.isReadOnly && (
              <button
                onClick={() => setShowAddNoteModal(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-semibold text-xs px-3.5 py-2 rounded-xl transition shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                <span>{isHindi ? 'मैनुअल ऑडिट नोट जोड़ें' : 'Add Audit Note'}</span>
              </button>
            )}

            {perms.canExportData && (
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold text-xs px-3.5 py-2 rounded-xl transition cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                <span>{isHindi ? 'CSV रिपोर्ट' : 'Export Audit CSV'}</span>
              </button>
            )}
          </div>
        </div>

        {exportNotice && (
          <div className="mt-3 hv-pill-amber border text-xs font-semibold px-3 py-2 rounded-xl flex items-center justify-between">
            <span>{exportNotice}</span>
            <button type="button" onClick={() => setExportNotice(null)} className="font-bold px-1 cursor-pointer">
              ✕
            </button>
          </div>
        )}

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-[var(--border-primary)]">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
              {isHindi ? 'कुल रिकॉर्डेड घटनाएं' : 'Total Trail Entries'}
            </p>
            <p className="text-lg font-black text-[var(--text-primary)] mt-0.5 tabular-nums">{auditList.length}</p>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
              {isHindi ? 'इनवॉइस एक्टिविटी' : 'Invoice Events'}
            </p>
            <p className="text-lg font-black text-emerald-500 mt-0.5 tabular-nums">
              {auditList.filter(l => l.action.toLowerCase().includes('invoice') || l.action.toLowerCase().includes('payment')).length}
            </p>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
              {isHindi ? 'वाउचर एवं लेजर पोस्टिंग' : 'Voucher Postings'}
            </p>
            <p className="text-lg font-black text-indigo-500 mt-0.5 tabular-nums">
              {auditList.filter(l => l.action.toLowerCase().includes('voucher')).length}
            </p>
          </div>

          <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-3 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
              {isHindi ? 'ऑपरेटिंग यूज़र' : 'Active Audit User'}
            </p>
            <p className="text-sm font-bold text-amber-500 mt-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>Admin / Officer</span>
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="hv-surface border rounded-2xl p-4 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isHindi ? 'एक्शन, यूज़र या विवरण खोजें...' : 'Search actions, details, user...'}
            className="w-full hv-input border rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-indigo-500 transition"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: isHindi ? 'सभी' : 'All Events' },
            { id: 'INVOICES', label: isHindi ? 'इनवॉइस' : 'Invoices' },
            { id: 'VOUCHERS', label: isHindi ? 'वाउचर्स' : 'Vouchers' },
            { id: 'MASTERS', label: isHindi ? 'मास्टर्स' : 'Masters' },
            { id: 'SECURITY', label: isHindi ? 'सुरक्षा/सेटिंग्स' : 'Security' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white hv-keep-white shadow-sm'
                  : 'bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-primary)]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chronological Audit Trail List / Table */}
      <div className="hv-surface border rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-[var(--border-primary)] flex items-center justify-between bg-[var(--bg-elevated)]">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-500" />
            <h3 className="font-bold text-sm text-[var(--text-primary)]">
              {isHindi ? 'कालानुक्रमिक ऑडिट इतिहास' : 'Chronological Audit Ledger'}
            </h3>
            <span className="text-xs text-[var(--text-muted)] tabular-nums">({filteredLogs.length} entries)</span>
          </div>

          <span className="text-[11px] text-[var(--text-muted)] font-mono">
            {isHindi ? 'नवीनतम पहले' : 'Sorted: Newest First'}
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-[var(--text-muted)] space-y-2">
            <ShieldCheck className="w-10 h-10 mx-auto text-[var(--text-muted)]" />
            <p className="text-sm font-medium text-[var(--text-primary)]">{isHindi ? 'कोई ऑडिट लॉग प्रविष्टि नहीं मिली' : 'No matching audit trail logs found'}</p>
            <p className="text-xs text-[var(--text-muted)]">{isHindi ? 'अपनी खोज फ़िल्टर बदलें' : 'Try adjusting your search filter or add a manual entry'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-primary)]">
            {filteredLogs.map((log) => (
              <div 
                key={log.id} 
                onClick={() => setSelectedLog(log)}
                className="p-4 hover:bg-[var(--hover-surface)] cursor-pointer transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
              >
                <div className="flex items-start gap-3.5">
                  <div className="w-9 h-9 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] group-hover:border-indigo-500/50 flex items-center justify-center shrink-0 mt-0.5 transition">
                    {getActionIcon(log.action)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-[var(--text-primary)] group-hover:text-indigo-500 transition">
                        {log.action}
                      </span>
                      <span className="text-[10px] font-semibold hv-pill-indigo border px-2 py-0.5 rounded-md flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {log.user}
                      </span>
                    </div>

                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                      {log.details}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 sm:self-center pl-12 sm:pl-0">
                  <div className="text-right text-xs text-[var(--text-muted)] font-mono flex items-center gap-1.5 bg-[var(--bg-elevated)] px-2.5 py-1.5 rounded-lg border border-[var(--border-primary)]">
                    <Clock className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{log.timestamp}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal: Add Manual Audit Note */}
      {showAddNoteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <h3 className="font-bold text-base text-[var(--text-primary)] flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-indigo-500" />
                <span>{isHindi ? 'मैनुअल ऑडिट प्रविष्टि जोड़ें' : 'Add Manual Audit Entry'}</span>
              </h3>
              <button 
                onClick={() => setShowAddNoteModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateNote} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {isHindi ? 'एक्शन शीर्षक / प्रकार' : 'Action Title / Category'}
                </label>
                <input
                  type="text"
                  value={noteAction}
                  onChange={(e) => setNoteAction(e.target.value)}
                  placeholder="e.g. Annual Audit Verification, Tax File Uploaded"
                  className="w-full hv-input border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
                  {isHindi ? 'विस्तृत विवरण' : 'Detailed Notes / Reason'}
                </label>
                <textarea
                  rows={3}
                  value={noteDetails}
                  onChange={(e) => setNoteDetails(e.target.value)}
                  placeholder={isHindi ? 'ऑडिट प्रविष्टि के संबंध में विस्तृत विवरण लिखें...' : 'Enter details regarding the compliance check or audit note...'}
                  className="w-full hv-input border rounded-xl p-3 text-xs focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddNoteModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] transition cursor-pointer"
                >
                  {isHindi ? 'रद्द करें' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white hv-keep-white bg-indigo-600 hover:bg-indigo-500 transition shadow-md shadow-indigo-600/30 cursor-pointer"
                >
                  {isHindi ? 'ऑडिट लॉग में सहेजें' : 'Save Audit Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Audit Log Details Inspector */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 hv-pill-indigo rounded-xl border">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-[var(--text-primary)]">
                    {isHindi ? 'ऑडिट प्रविष्टि विस्तृत विवरण' : 'Audit Trail Record Details'}
                  </h3>
                  <span className="font-mono text-[10px] text-[var(--text-muted)]">Log ID: {selectedLog.id}</span>
                </div>
              </div>

              <button 
                onClick={() => setSelectedLog(null)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-primary)]">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-[var(--text-muted)]">Action / Event</span>
                  <span className="font-bold text-indigo-500 text-sm">{selectedLog.action}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase font-bold text-[var(--text-muted)]">User / Operator</span>
                  <span className="font-bold text-[var(--text-primary)]">{selectedLog.user}</span>
                </div>
              </div>

              <div className="bg-[var(--bg-elevated)] p-3 rounded-xl border border-[var(--border-primary)] space-y-2">
                <div className="flex justify-between items-center text-[var(--text-muted)] font-mono text-[11px]">
                  <span>{isHindi ? 'घटना तिथि एवं समय (Timestamp):' : 'Logged Date & Time:'}</span>
                  <span className="text-amber-500 font-bold">{selectedLog.timestamp}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--text-muted)] font-mono text-[11px]">
                  <span>{isHindi ? 'ट्रैकिंग स्थिति:' : 'Verification Status:'}</span>
                  <span className="hv-pill-emerald font-bold px-2 py-0.5 rounded border">
                    ✓ Verified Immutable Record
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-[var(--text-secondary)] font-bold">{isHindi ? 'पूर्ण ऑडिट विवरण (Complete Audit Narrative):' : 'Full Narrative & Change Record:'}</label>
                <div className="bg-[var(--bg-elevated)] p-3.5 rounded-xl border border-[var(--border-primary)] text-[var(--text-primary)] font-mono leading-relaxed text-xs max-h-40 overflow-y-auto">
                  {selectedLog.details}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-primary)]">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`[AUDIT LOG] ${selectedLog.action} by ${selectedLog.user} at ${selectedLog.timestamp}: ${selectedLog.details}`);
                  setCopiedLogId(selectedLog.id);
                  setTimeout(() => setCopiedLogId(null), 2500);
                }}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-[var(--text-primary)] bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedLogId === selectedLog.id ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">{isHindi ? 'कॉपी हो गया ✓' : 'Copied ✓'}</span>
                  </>
                ) : (
                  <span>{isHindi ? 'विवरण कॉपी करें' : 'Copy Details'}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white hv-keep-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer"
              >
                {isHindi ? 'बंद करें' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
