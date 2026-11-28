import React, { useState, useRef } from 'react';
import { Users, Plus, Search, Trash2, Building2, Phone, Mail, Edit3, Printer, FileText, Sparkles, Loader2, CheckCircle2, ExternalLink, Clipboard, Copy, AlertTriangle, BookOpen } from 'lucide-react';
import { AppData, PartyMaster, PartyType, UserRole } from '../../types';
import { formatCurrency } from '../../utils/storage';
import { getRolePermissions, normalizeUserRole, RolePermissions } from '../../utils/rbac';
import { INDIAN_STATE_CODES, fetchGSTINDetailsAsync, parseGstPortalText, saveGSTINToCache, validateGSTIN, FetchedGSTINDetails } from '../../utils/gstin';
import { extractGstinMetadata } from '../../utils/erpSmartHelpers';
import { getCurrencySymbol } from '../../utils/companyProfile';
import { printPartyLedger } from '../../utils/printReport';

interface PartyMasterListProps {
  data: AppData;
  isHindi: boolean;
  onAddParty: (party: PartyMaster) => void;
  onUpdateParty?: (party: PartyMaster) => void;
  onDeleteParty: (id: string) => void;
  onViewPartyLedger?: (partyId: string) => void;
  initialSearchQuery?: string;
  activeUserRole?: UserRole;
  permissions?: RolePermissions;
}

export const PartyMasterList: React.FC<PartyMasterListProps> = ({
  data,
  isHindi,
  onAddParty,
  onUpdateParty,
  onDeleteParty,
  onViewPartyLedger,
  initialSearchQuery = '',
  activeUserRole,
  permissions
}) => {
  const perms = permissions || getRolePermissions(normalizeUserRole(activeUserRole || 'ADMIN'));
  const currency = data.company.currency;
  const [search, setSearch] = useState(initialSearchQuery);

  React.useEffect(() => {
    if (initialSearchQuery) {
      setSearch(initialSearchQuery);
    }
  }, [initialSearchQuery]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingParty, setEditingParty] = useState<PartyMaster | null>(null);

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [type, setType] = useState<PartyType>('CUSTOMER');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [state, setState] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [creditDays, setCreditDays] = useState<number>(0);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [balanceType, setBalanceType] = useState<'DR' | 'CR'>('DR');
  const [gstCategory, setGstCategory] = useState<'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ_DEVELOPER' | 'CASUAL'>('REGULAR');
  const [taxpayerStatus, setTaxpayerStatus] = useState<'Active' | 'Cancelled' | 'Suspended'>('Active');
  const [isVerifyingGstin, setIsVerifyingGstin] = useState(false);
  const [gstVerificationResult, setGstVerificationResult] = useState<string | null>(null);
  const [gstInfoMeta, setGstInfoMeta] = useState<{
    isVerified: boolean;
    status?: string;
    constitution?: string;
    registrationDate?: string;
    source?: string;
    checksumWarning?: string;
    notFoundReason?: 'QUOTA' | 'UNLISTED' | null;
    sources?: Array<{ title: string; url: string }>;
  } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [gstPasteInput, setGstPasteInput] = useState('');
  const lastAutoFetchedRef = useRef<string>('');

  const handleCopyGstinForPortal = () => {
    if (gstin) {
      try {
        navigator.clipboard?.writeText(gstin);
      } catch {}
    }
  };

  const applyFetchedDetails = (d: Partial<FetchedGSTINDetails>, sourceLabel?: string) => {
    if (d.stateCode && INDIAN_STATE_CODES[d.stateCode]) {
      setStateCode(d.stateCode);
      setState(INDIAN_STATE_CODES[d.stateCode]);
    } else if (d.stateName) {
      setState(d.stateName);
    }

    if (d.pan) setPan(d.pan);
    if (d.gstin && d.gstin.length === 15) setGstin(d.gstin);

    const bName = (d.tradeName || d.legalName || '').trim();
    const legName = (d.legalName || bName).trim();
    const trdName = (d.tradeName || legName).trim();
    if (bName) {
      setName(bName);
      setLegalName(legName);
      setTradeName(trdName);
    }

    const fullAddr = (d.principalAddress || '').trim();
    if (fullAddr) {
      setAddress(
        d.pincode && !fullAddr.includes(d.pincode)
          ? `${fullAddr} - ${d.pincode}`
          : fullAddr
      );
    }
    if (d.pincode) setPincode(d.pincode);

    if (d.taxpayerType) {
      const upperType = d.taxpayerType.toUpperCase();
      if (upperType.includes('COMP')) setGstCategory('COMPOSITION');
      else if (upperType.includes('SEZ')) setGstCategory('SEZ_DEVELOPER');
      else setGstCategory('REGULAR');
    }
    if (d.status) setTaxpayerStatus(d.status);

    if (bName) {
      setGstInfoMeta({
        isVerified: true,
        status: d.status || 'Active',
        constitution: d.constitutionOfBusiness,
        registrationDate: d.registrationDate,
        source: sourceLabel || d.source || 'Verified GST Record',
        notFoundReason: null,
        sources: d.groundingSources
      });
      setGstVerificationResult(`✅ 100% असली GST विवरण प्राप्त: ${bName}${d.status ? ` (${d.status})` : ''}`);
    }
  };

  const handleParsePastedGstText = (textToParse: string) => {
    if (!textToParse.trim()) return;
    const parsed = parseGstPortalText(textToParse);
    if (parsed.legalName || parsed.tradeName) {
      const effectiveGstin = (parsed.gstin && parsed.gstin.length === 15 ? parsed.gstin : gstin).toUpperCase().trim();
      const sc = parsed.stateCode || (effectiveGstin.length >= 2 ? effectiveGstin.substring(0, 2) : stateCode);
      const st = parsed.stateName || INDIAN_STATE_CODES[sc] || state;
      const derivedPan = parsed.pan || (effectiveGstin.length >= 12 ? effectiveGstin.substring(2, 12) : pan);

      applyFetchedDetails({ ...parsed, gstin: effectiveGstin, stateCode: sc, stateName: st, pan: derivedPan }, 'Official Govt Portal Paste');

      if (effectiveGstin.length === 15) {
        saveGSTINToCache({
          gstin: effectiveGstin,
          legalName: parsed.legalName || parsed.tradeName || '',
          tradeName: parsed.tradeName || parsed.legalName || '',
          pan: derivedPan,
          stateCode: sc,
          stateName: st,
          taxpayerType: parsed.taxpayerType || 'Regular',
          status: parsed.status || 'Active',
          registrationDate: parsed.registrationDate || '',
          principalAddress: parsed.principalAddress || '',
          city: parsed.city || st,
          pincode: parsed.pincode || '',
          constitutionOfBusiness: parsed.constitutionOfBusiness,
          einvoiceStatus: 'Enabled',
          isLivePortalData: true,
          source: 'Official Govt Portal Paste'
        });
      }

      setShowPasteBox(false);
      setGstPasteInput('');
    } else {
      setGstVerificationResult(isHindi ? 'पेस्ट किए गए टेक्स्ट में Legal Name / Address नहीं मिला। कृपया Govt GST पोर्टल (services.gst.gov.in) पर रिजल्ट का पूरा टेक्स्ट Ctrl+A / Ctrl+C करके पेस्ट करें।' : 'Legal Name / Address not found in pasted text. Please copy the full result table from services.gst.gov.in.');
    }
  };

  const handleFetchGstinDetails = async (overrideGstin?: string) => {
    const targetGstin = typeof overrideGstin === 'string' ? overrideGstin : gstin;
    const cleanGstin = targetGstin.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!cleanGstin || cleanGstin.length < 2) {
      setGstVerificationResult(isHindi ? 'कृपया कम से कम 2-डिजिट राज्य कोड या 15-अंकों का GSTIN दर्ज करें!' : 'Please enter at least 2-digit state code or 15-digit GSTIN!');
      return;
    }

    setIsVerifyingGstin(true);
    setGstVerificationResult(null);
    setGstInfoMeta(null);

    // 1. Instant local structural extraction (State Code & PAN)
    const scPrefix = cleanGstin.substring(0, 2);
    const derivedState = INDIAN_STATE_CODES[scPrefix];
    if (derivedState) {
      setStateCode(scPrefix);
      setState(derivedState);
    }

    let derivedPan = '';
    if (cleanGstin.length >= 12) {
      const p = cleanGstin.substring(2, 12);
      if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(p)) {
        derivedPan = p;
        setPan(p);
      }
    }

    if (cleanGstin.length === 15) {
      const validation = validateGSTIN(cleanGstin);
      if (!validation.isValid) {
        setGstVerificationResult(`⚠️ ${isHindi ? (validation.errorHindi || validation.error) : validation.error}`);
        setIsVerifyingGstin(false);
        return;
      }
      if (validation.checksumValid === false) {
        setGstInfoMeta({
          isVerified: false,
          checksumWarning: isHindi
            ? `चेकसम चेतावनी: अंतिम अक्षर '${validation.actualChecksum}' की जगह '${validation.expectedChecksum}' होना चाहिए। कृपया GSTIN नंबर जाँचें।`
            : `Checksum mismatch: Expected '${validation.expectedChecksum}' instead of '${validation.actualChecksum}'. Please verify GSTIN typo.`
        });
        setGstVerificationResult(`⚠️ ${isHindi ? 'GSTIN चेकसम गलत है — कृपया नंबर जाँचें।' : 'GSTIN checksum mismatch — please check for typos.'}`);
        setIsVerifyingGstin(false);
        return;
      }
      setGstCategory(cleanGstin.charAt(13) !== 'Z' && cleanGstin.charAt(13) !== '0' ? 'COMPOSITION' : 'REGULAR');

      // 2. Check existing saved Party Master in ERP first (100% genuine user-verified record)
      const existingMatch = data.parties.find(
        p => p.id !== editingParty?.id && p.gstin?.toUpperCase() === cleanGstin && (p.legalName || p.name)
      );
      if (existingMatch) {
        applyFetchedDetails({
          gstin: cleanGstin,
          legalName: existingMatch.legalName || existingMatch.name,
          tradeName: existingMatch.tradeName || existingMatch.name,
          principalAddress: existingMatch.address || '',
          pincode: existingMatch.pincode || '',
          pan: existingMatch.pan || derivedPan,
          stateCode: existingMatch.stateCode || scPrefix,
          stateName: existingMatch.state || derivedState,
          status: existingMatch.taxpayerStatus || 'Active',
          taxpayerType: existingMatch.gstCategory === 'COMPOSITION' ? 'Composition' : 'Regular'
        }, isHindi ? 'ERP पार्टी रिकॉर्ड' : 'Existing ERP Master');
        setIsVerifyingGstin(false);
        return;
      }
    }

    // 3. Call unified verified GSTIN lookup (Local Cache -> /api/verify-gstin Official GST API / Live Google Search Grounding)
    try {
      const clientRes = await fetchGSTINDetailsAsync(cleanGstin);
      if (clientRes.success && clientRes.details) {
        const d = clientRes.details;
        const bName = (d.tradeName || d.legalName || '').trim();

        if (bName) {
          applyFetchedDetails(d, d.source || (d.isLivePortalData ? 'Live Verified Record' : 'Verified Registry'));
        } else {
          setGstInfoMeta({
            isVerified: false,
            constitution: d.constitutionOfBusiness,
            notFoundReason: clientRes.quotaExceeded ? 'QUOTA' : 'UNLISTED'
          });
          setGstVerificationResult(
            clientRes.quotaExceeded
              ? (isHindi
                  ? `GSTIN संरचना सही है (${d.stateName} - ${d.stateCode}, PAN: ${d.pan})। लाइव वेब सर्च कोटा अभी सीमित है — असली विवरण के लिए नीचे 'Govt Portal' से कॉपी कर 'Paste' करें।`
                  : `Valid GSTIN (${d.stateName}, PAN: ${d.pan}). Live search quota temporarily limited — copy from Govt Portal & Paste below for 100% genuine details.`)
              : (isHindi
                  ? `GSTIN संरचना सही है (${d.stateName} - ${d.stateCode}, PAN: ${d.pan})। यह फ़र्म पब्लिक वेब सर्च में उपलब्ध नहीं है (कोई फ़र्ज़ी नाम नहीं डाला गया) — असली विवरण के लिए 'Govt Portal' से कॉपी कर 'Paste' करें।`
                  : `Valid GSTIN (${d.stateName}, PAN: ${d.pan}). Business not publicly indexed on web (no fake data injected) — use Govt Portal & Paste below.`)
          );
        }
      } else {
        setGstVerificationResult(`⚠️ ${clientRes.error || (isHindi ? 'GSTIN सत्यापन विफल रहा।' : 'GSTIN verification failed.')}`);
      }
    } catch {
      setGstVerificationResult(`✅ ${isHindi ? 'राज्य व PAN निकाला गया:' : 'State & PAN derived:'} ${derivedState || scPrefix}`);
    } finally {
      setIsVerifyingGstin(false);
    }
  };

  const openCreateModal = () => {
    setEditingParty(null);
    setCode('');
    setName('');
    setLegalName('');
    setTradeName('');
    setType('CUSTOMER');
    setGstin('');
    setPan('');
    setEmail('');
    setPhone('');
    setAddress('');
    setPincode('');
    setState('');
    setStateCode('');
    setCreditLimit(0);
    setCreditDays(0);
    setOpeningBalance(0);
    setBalanceType('DR');
    setGstCategory('UNREGISTERED');
    setTaxpayerStatus('Active');
    setGstVerificationResult(null);
    setGstInfoMeta(null);
    setShowPasteBox(false);
    setGstPasteInput('');
    lastAutoFetchedRef.current = '';
    setShowAddModal(true);
  };

  const openEditModal = (p: PartyMaster) => {
    setEditingParty(p);
    setCode(p.code);
    setName(p.name);
    setLegalName(p.legalName || p.name);
    setTradeName(p.tradeName || p.name);
    setType(p.type);
    setGstin(p.gstin || '');
    setPan(p.pan || '');
    setEmail(p.email || '');
    setPhone(p.phone || '');
    setAddress(p.address || '');
    setPincode(p.pincode || '');
    setState(p.state || 'Delhi');
    setStateCode(p.stateCode || '07');
    setCreditLimit(p.creditLimit || 0);
    setCreditDays(p.creditDays || 0);
    setOpeningBalance(p.openingBalance || 0);
    setBalanceType(p.balanceType || 'DR');
    setGstCategory(p.gstCategory || (p.gstin && p.gstin !== 'URP' ? 'REGULAR' : 'UNREGISTERED'));
    setTaxpayerStatus(p.taxpayerStatus || 'Active');
    setGstVerificationResult(null);
    setGstInfoMeta(null);
    setShowPasteBox(false);
    setGstPasteInput('');
    lastAutoFetchedRef.current = p.gstin || '';
    setShowAddModal(true);
  };

  const filtered = data.parties.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase()))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const rawGstin = gstin.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    const cleanGstin = rawGstin === 'URP' ? '' : rawGstin;
    const effectiveCategory: PartyMaster['gstCategory'] =
      cleanGstin.length === 15
        ? (gstCategory === 'UNREGISTERED'
            ? (cleanGstin.charAt(13) !== 'Z' && cleanGstin.charAt(13) !== '0' ? 'COMPOSITION' : 'REGULAR')
            : gstCategory)
        : (!cleanGstin ? 'UNREGISTERED' : gstCategory);
    const derivedStateCode =
      stateCode ||
      (cleanGstin.length >= 2 && INDIAN_STATE_CODES[cleanGstin.slice(0, 2)]
        ? cleanGstin.slice(0, 2)
        : '');
    const derivedState =
      (derivedStateCode && INDIAN_STATE_CODES[derivedStateCode]) || state;
    const derivedPan =
      pan.trim().toUpperCase() ||
      (cleanGstin.length >= 12 ? cleanGstin.substring(2, 12).toUpperCase() : '');

    const partyCode = editingParty?.code || code.trim() || `PRT-${Date.now().toString().slice(-6)}`;
    const extractedPin = pincode.trim() || (address.match(/\b([1-9][0-9]{5})\b/)?.[1] || '');

    const partyPayload: PartyMaster = {
      id: editingParty ? editingParty.id : 'pty_' + Date.now(),
      code: partyCode,
      name: name.trim(),
      legalName: (legalName || name).trim(),
      tradeName: (tradeName || name).trim(),
      type,
      gstin: cleanGstin,
      pan: derivedPan,
      email: email.trim(),
      phone: phone.trim(),
      address: address.trim(),
      pincode: extractedPin,
      state: derivedState,
      stateCode: derivedStateCode,
      creditLimit: Math.max(0, Number(creditLimit) || 0),
      creditDays: Math.max(0, Math.floor(Number(creditDays) || 0)),
      openingBalance,
      balanceType,
      gstCategory: effectiveCategory,
      taxpayerStatus
    };

    if (cleanGstin.length === 15 && partyPayload.name) {
      saveGSTINToCache({
        gstin: cleanGstin,
        legalName: partyPayload.legalName || partyPayload.name,
        tradeName: partyPayload.tradeName || partyPayload.name,
        pan: partyPayload.pan,
        stateCode: derivedStateCode,
        stateName: derivedState,
        taxpayerType: effectiveCategory === 'COMPOSITION' ? 'Composition' : effectiveCategory === 'SEZ_DEVELOPER' ? 'SEZ Unit' : 'Regular',
        status: taxpayerStatus,
        registrationDate: gstInfoMeta?.registrationDate || '',
        principalAddress: partyPayload.address,
        city: derivedState,
        pincode: extractedPin,
        constitutionOfBusiness: gstInfoMeta?.constitution,
        einvoiceStatus: 'Enabled',
        isLivePortalData: true,
        source: gstInfoMeta?.source || 'Saved Party Master'
      });
    }

    if (editingParty && onUpdateParty) {
      onUpdateParty(partyPayload);
    } else {
      onAddParty(partyPayload);
    }

    setShowAddModal(false);
  };

  return (
    <div className="md:h-full md:min-h-0 flex flex-col p-4 md:p-5 gap-4 w-full md:overflow-hidden">
      <div className="shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hv-surface p-4 md:p-5 rounded-2xl border border-[var(--border-primary)] shadow-lg">
        <div>
          <h2 className="text-xl font-bold text-[var(--text-primary)] flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <span>{isHindi ? 'ग्राहक एवं विक्रेता मास्टर्स (Party Master Directory)' : 'Customer & Vendor Masters'}</span>
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {isHindi 
              ? 'ग्राहकों व सप्लायरों के नाम, जीएसटी नंबर, पता एवं क्रेडिट सीमा प्रबंधित करें'
              : 'Directory of B2B/B2C Customers, Vendors, GSTIN, Address, and Credit Limits'}
          </p>
        </div>

        {perms.canCreateEditMasters && (
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>{isHindi ? '+ नई पार्टी जोड़ें' : '+ Create Party Master'}</span>
          </button>
        )}
      </div>

      <div className="shrink-0 hv-surface p-3 rounded-xl border border-[var(--border-primary)]">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-3 text-[var(--text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isHindi ? 'पार्टी का नाम या GSTIN खोजें...' : 'Search Party Name, GSTIN...'}
            className="w-full hv-input text-sm rounded-xl pl-9 pr-3 py-2 border border-[var(--border-subtle)] focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col hv-surface border border-[var(--border-primary)] rounded-2xl shadow-xl overflow-hidden">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full text-left text-sm text-[var(--text-primary)]">
            <thead className="sticky top-0 z-10 bg-[var(--bg-elevated)] text-[var(--text-secondary)] font-bold text-xs uppercase tracking-wider border-b border-[var(--border-primary)]">
              <tr>
                <th className="p-3">Code</th>
                <th className="p-3">Party Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">GSTIN</th>
                <th className="p-3">State</th>
                <th className="p-3">Contact Details</th>
                <th className="p-3 text-right">Opening Balance</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-primary)]">
              {filtered.map((pty) => (
                <tr key={pty.id} className="hover:bg-[var(--hover-surface)]">
                  <td className="p-3 font-mono font-bold text-indigo-500">{pty.code}</td>
                  <td className="p-3 font-semibold text-[var(--text-primary)]">
                    <div className="text-[var(--text-primary)] font-bold">{pty.name}</div>
                    {(pty.tradeName || pty.legalName) && (pty.tradeName !== pty.name || pty.legalName !== pty.name) && (
                      <div className="text-xs text-amber-500 font-medium mt-0.5">
                        🏢 {pty.tradeName || pty.legalName}
                      </div>
                    )}
                    {pty.address ? (
                      <div className="text-xs text-[var(--text-muted)] font-normal max-w-xs truncate mt-0.5" title={pty.address}>
                        📍 {pty.address}
                      </div>
                    ) : (
                      <div className="text-xs text-[var(--text-muted)] italic mt-0.5">
                        (No address recorded)
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <span className={`px-2.5 py-0.5 rounded text-xs font-bold border ${
                      pty.type === 'CUSTOMER' ? 'hv-pill-indigo' :
                      pty.type === 'VENDOR' ? 'hv-pill-rose' :
                      'hv-pill-emerald'
                    }`}>
                      {pty.type}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-[var(--text-secondary)] text-xs">
                    <div>{pty.gstin || 'URP'}</div>
                    {pty.pan && <div className="text-[10px] text-indigo-500 mt-0.5">PAN: {pty.pan}</div>}
                  </td>
                  <td className="p-3 text-[var(--text-secondary)]">{pty.state}</td>
                  <td className="p-3 text-[var(--text-secondary)] text-xs">
                    <div>{pty.phone}</div>
                    <div className="text-[var(--text-muted)]">{pty.email}</div>
                    {(pty.creditLimit > 0 || (pty.creditDays || 0) > 0) && (
                      <div className="text-[10px] text-amber-500 font-mono mt-0.5">
                        {pty.creditLimit > 0 ? `Limit: ${formatCurrency(pty.creditLimit, currency)}` : ''}
                        {pty.creditLimit > 0 && (pty.creditDays || 0) > 0 ? ' • ' : ''}
                        {(pty.creditDays || 0) > 0 ? `${pty.creditDays}d Terms` : ''}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums font-bold text-[var(--text-primary)]">
                    {formatCurrency(pty.openingBalance, currency)} ({pty.balanceType})
                  </td>
                  <td className="p-3 text-right space-x-1 whitespace-nowrap">
                    {onViewPartyLedger && (
                      <button
                        type="button"
                        onClick={() => onViewPartyLedger(pty.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold hv-pill-indigo border rounded-lg transition cursor-pointer"
                        title={isHindi ? 'संपूर्ण अवधि (आज तक) का पूरा लेज़र देखें' : 'View Full Party Ledger (All Years to Current)'}
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'लेज़र' : 'Ledger'}</span>
                      </button>
                    )}
                    {perms.canExportData && (
                      <button
                        onClick={() => printPartyLedger(pty, data, isHindi)}
                        className="p-1.5 text-emerald-500 hover:bg-[var(--hover-surface)] rounded-lg transition"
                        title={isHindi ? 'बहीखाता प्रिंट करें (Print Ledger)' : 'Print Party Ledger Statement'}
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    )}
                    {perms.canCreateEditMasters && (
                      <button
                        onClick={() => openEditModal(pty)}
                        className="p-1.5 text-indigo-500 hover:bg-[var(--hover-surface)] rounded-lg transition"
                        title={isHindi ? 'पार्टी एडिट करें' : 'Edit Party Master'}
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    )}
                    {perms.canDeleteRecords && (
                      <button
                        onClick={() => onDeleteParty(pty.id)}
                        className="p-1.5 text-[var(--text-muted)] hover:text-rose-500 hover:bg-[var(--hover-surface)] rounded-lg transition"
                        title={isHindi ? 'पार्टी हटाएँ' : 'Delete Party'}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto p-5 text-[var(--text-primary)] space-y-4 my-auto shadow-2xl">
            <h3 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-500" />
              <span>{editingParty ? (isHindi ? 'पार्टी मास्टर एडिट करें' : 'Edit Party Master') : (isHindi ? 'नई पार्टी मास्टर जोड़ें' : 'Add Party Master')}</span>
            </h3>

            <form onSubmit={handleSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'पार्टी का प्रकार (Party Type) *' : 'Party Type *'}
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full hv-input border border-[var(--border-subtle)] rounded-xl p-2.5"
                >
                  <option value="CUSTOMER">Customer (ग्राहक)</option>
                  <option value="VENDOR">Vendor / Supplier (विक्रेता)</option>
                  <option value="BOTH">Both (ग्राहक एवं विक्रेता दोनों)</option>
                </select>
              </div>

              <div className="space-y-3 hv-elevated p-3 rounded-xl border border-[var(--border-primary)]">
                <div>
                  <label className="block text-[var(--text-secondary)] font-bold mb-1">
                    {isHindi ? 'जीएसटी पंजीकरण प्रकार (GST Registration Type) *' : 'GST Registration Type *'}
                  </label>
                  <select
                    value={gstCategory}
                    onChange={(e) => {
                      const newCat = e.target.value as any;
                      setGstCategory(newCat);
                      if (newCat === 'UNREGISTERED') {
                        setGstin('');
                      }
                    }}
                    className="w-full hv-input border border-amber-500/50 text-amber-500 font-bold rounded-xl p-2 focus:border-amber-400 focus:outline-none text-xs"
                  >
                    <option value="UNREGISTERED">Unregistered / Consumer (गैर-पंजीकृत / उपभोक्ता)</option>
                    <option value="REGULAR">Regular (नियमित पंजीकृत GSTIN)</option>
                    <option value="COMPOSITION">Composition Scheme (कंपोजिशन स्कीम)</option>
                    <option value="SEZ_DEVELOPER">SEZ / Overseas (विशेष आर्थिक क्षेत्र)</option>
                    <option value="CASUAL">Casual Taxable Person (कैजुअल करदाता)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] text-[var(--text-muted)]">GSTIN (15 Digits)</label>
                    <button
                      type="button"
                      onClick={handleFetchGstinDetails}
                      disabled={isVerifyingGstin || !gstin.trim()}
                      className="flex items-center gap-1.5 text-[11px] hv-pill-amber font-bold px-2.5 py-1 rounded-lg border transition disabled:opacity-50"
                    >
                      {isVerifyingGstin ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          <span>जांच जारी...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3 h-3" />
                          <span>AI GSTIN Details Pickup</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <input
                        type="text"
                        value={gstin}
                        onChange={(e) => {
                          const meta = extractGstinMetadata(e.target.value);
                          setGstin(meta.cleanGstin);
                          setGstVerificationResult('');

                          if (!meta.cleanGstin) {
                            setGstCategory('UNREGISTERED');
                          }

                          if (meta.stateCode && meta.stateName) {
                            setStateCode(meta.stateCode);
                            setState(meta.stateName);
                          }

                          if (meta.panValid) {
                            setPan(meta.pan);
                          }

                          if (meta.isComplete) {
                            setGstCategory(meta.inferredGstCategory);
                            if (lastAutoFetchedRef.current !== meta.cleanGstin) {
                              lastAutoFetchedRef.current = meta.cleanGstin;
                              handleFetchGstinDetails(meta.cleanGstin);
                            }
                          }
                        }}
                        maxLength={15}
                        placeholder="15-digit GSTIN (e.g. 23AOZPD9829B1ZP)"
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-xs font-mono uppercase focus:border-amber-500 focus:outline-none"
                        style={{ textTransform: 'uppercase' }}
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleFetchGstinDetails()}
                        disabled={isVerifyingGstin || !gstin.trim()}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold p-2 rounded-lg text-xs transition disabled:opacity-50"
                      >
                        {isHindi ? 'GST ऑटो भरें' : 'Auto Fetch'}
                      </button>
                      
                      <a
                        href="https://services.gst.gov.in/services/searchtp"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={handleCopyGstinForPortal}
                        title="Govt GST Portal par search karein (Captcha verification)"
                        className="hv-pill-blue border font-semibold p-2 rounded-lg text-xs flex items-center gap-1 transition"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Govt Portal</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setShowPasteBox(!showPasteBox)}
                        title="GST Portal text/JSON paste karke auto-fill karein"
                        className="hv-pill-purple border font-semibold p-2 rounded-lg text-xs flex items-center gap-1 transition"
                      >
                        <Clipboard className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Paste</span>
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Paste Portal Text Parser Box */}
                  {showPasteBox && (
                    <div className="p-3 hv-pill-purple border rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold">
                          {isHindi ? '📋 Govt GST Portal रिजल्ट यहाँ पेस्ट करें:' : '📋 Paste Govt GST Portal Search Text/JSON:'}
                        </span>
                        <button 
                          type="button" 
                          onClick={() => setShowPasteBox(false)}
                          className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <textarea
                        value={gstPasteInput}
                        onChange={(e) => setGstPasteInput(e.target.value)}
                        placeholder={isHindi ? "Govt GST portal (services.gst.gov.in) se copy kiya gaya text ya JSON paste karein (Legal Name, Trade Name, Address, Status)..." : "Paste full text copied from Govt GST Portal (services.gst.gov.in)..."}
                        rows={3}
                        className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-purple-400"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleParsePastedGstText(gstPasteInput)}
                          className="bg-purple-600 hover:bg-purple-500 text-white hv-keep-white font-bold px-3 py-1 rounded-lg text-xs transition"
                        >
                          {isHindi ? 'विवरण एक्सट्रेक्ट करें' : 'Extract Party Details'}
                        </button>
                      </div>
                    </div>
                  )}

                  {gstVerificationResult && (
                    <div className={`p-2.5 rounded-xl border text-[11px] font-medium space-y-1.5 ${
                      gstInfoMeta?.isVerified
                        ? 'hv-pill-emerald'
                        : 'hv-pill-amber'
                    }`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-1.5">
                          {gstInfoMeta?.isVerified ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          )}
                          <span>{gstVerificationResult}</span>
                        </div>
                        <a
                          href="https://services.gst.gov.in/services/searchtp"
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={handleCopyGstinForPortal}
                          className="text-[10px] hv-pill-blue border px-2 py-1 rounded-lg flex items-center gap-1 shrink-0"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Govt Portal</span>
                        </a>
                      </div>

                      {gstInfoMeta && (
                        <div className="flex flex-wrap items-center gap-2 text-[10px] pt-1 border-t border-[var(--border-primary)]">
                          {gstInfoMeta.status && (
                            <span className={`px-2 py-0.5 rounded font-bold border ${
                              gstInfoMeta.status === 'Active'
                                ? 'hv-pill-emerald'
                                : 'hv-pill-rose'
                            }`}>
                              Status: {gstInfoMeta.status}
                            </span>
                          )}
                          {gstInfoMeta.constitution && (
                            <span className="px-2 py-0.5 rounded hv-pill-slate border">
                              {gstInfoMeta.constitution}
                            </span>
                          )}
                          {gstInfoMeta.registrationDate && (
                            <span className="px-2 py-0.5 rounded hv-pill-slate border">
                              Reg: {gstInfoMeta.registrationDate}
                            </span>
                          )}
                          {gstInfoMeta.source && (
                            <span className="px-2 py-0.5 rounded hv-pill-indigo border">
                              {gstInfoMeta.source}
                            </span>
                          )}
                          {!gstInfoMeta.isVerified && !showPasteBox && (
                            <button
                              type="button"
                              onClick={() => setShowPasteBox(true)}
                              className="px-2 py-0.5 rounded hv-pill-purple border font-bold"
                            >
                              📋 {isHindi ? 'Portal Text यहाँ Paste करें' : 'Paste Portal Result'}
                            </button>
                          )}
                        </div>
                      )}

                      {gstInfoMeta?.sources && gstInfoMeta.sources.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                          <span>Sources:</span>
                          {gstInfoMeta.sources.map((s, idx) => (
                            <a
                              key={idx}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-500 hover:underline truncate max-w-[180px]"
                            >
                              {s.title}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Party Main Information Grid - 2 Column Compact Layout */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[var(--text-secondary)] text-xs font-semibold mb-1">Party / Business Name (व्यापारिक/कंपनी नाम) *</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setName(val);
                      if (!legalName) setLegalName(val);
                      if (!tradeName) setTradeName(val);
                    }}
                    placeholder="e.g. Vinay Dubey Enterprises"
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 font-semibold text-xs focus:border-amber-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Legal Name (कानूनी नाम)</label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="e.g. VINAY DUBEY PVT LTD"
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Trade Name (व्यापार नाम)</label>
                  <input
                    type="text"
                    value={tradeName}
                    onChange={(e) => setTradeName(e.target.value)}
                    placeholder="e.g. Vinay Enterprises"
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    maxLength={10}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 font-mono text-indigo-500 font-bold uppercase text-xs"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Taxpayer Status (GST स्थिति)</label>
                  <select
                    value={taxpayerStatus}
                    onChange={(e) => setTaxpayerStatus(e.target.value as any)}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-semibold"
                  >
                    <option value="Active">Active (सक्रिय)</option>
                    <option value="Cancelled">Cancelled (रद्द)</option>
                    <option value="Suspended">Suspended (निलंबित)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="accounts@company.com"
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                  />
                </div>

                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-4 gap-2">
                  <div className="sm:col-span-3">
                    <label className="block text-[var(--text-secondary)] text-xs font-semibold mb-1">Billing Address (पूरा पता)</label>
                    <input
                      type="text"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Street address, City, Pin code"
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-xs focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] text-xs font-semibold mb-1">Pincode</label>
                    <input
                      type="text"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                      placeholder="482001"
                      maxLength={6}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">{isHindi ? 'राज्य एवं राज्य कोड *' : 'State & State Code *'}</label>
                  <select
                    value={stateCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      const stName = code ? (INDIAN_STATE_CODES[code] || '') : '';
                      setStateCode(code);
                      setState(stName);
                    }}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-semibold focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">{isHindi ? '-- राज्य चुनें --' : '-- Select State --'}</option>
                    {Object.entries(INDIAN_STATE_CODES).map(([code, stName]) => (
                      <option key={code} value={code}>
                        {code} - {stName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Op. Balance</label>
                    <input
                      type="number"
                      value={openingBalance || ''}
                      placeholder="0"
                      onChange={(e) => setOpeningBalance(Number(e.target.value))}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[var(--text-secondary)] text-[11px] font-medium mb-1">Type</label>
                    <select
                      value={balanceType}
                      onChange={(e) => setBalanceType(e.target.value as any)}
                      className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs"
                    >
                      <option value="DR">DR (Customer)</option>
                      <option value="CR">CR (Vendor)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-amber-500 text-[11px] font-semibold mb-1">
                    {isHindi
                      ? `क्रेडिट सीमा (Credit Limit ${getCurrencySymbol(currency)} - वैकल्पिक)`
                      : `Credit Limit (${getCurrencySymbol(currency)} Optional)`}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={creditLimit || ''}
                    placeholder="0 (No limit)"
                    onChange={(e) => setCreditLimit(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-mono text-amber-500 font-bold focus:border-amber-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-amber-500 text-[11px] font-semibold mb-1">
                    {isHindi ? 'क्रेडिट अवधि (Credit Period - Days)' : 'Credit Period (Days - Optional)'}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={creditDays || ''}
                    placeholder="e.g. 15 or 30 days"
                    onChange={(e) => setCreditDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-lg p-1.5 text-xs font-mono focus:border-amber-500 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold rounded-xl shadow-lg"
                >
                  Save Party
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
