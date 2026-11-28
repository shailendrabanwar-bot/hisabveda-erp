import React, { useState, useRef } from 'react';
import { X, UserPlus, Building2, MapPin, Hash, Phone, Mail, Sparkles, Loader2, CheckCircle2, ExternalLink, Clipboard, AlertTriangle } from 'lucide-react';
import { PartyMaster } from '../../types';
import { INDIAN_STATE_CODES, fetchGSTINDetailsAsync, parseGstPortalText, saveGSTINToCache, validateGSTIN, FetchedGSTINDetails } from '../../utils/gstin';
import { extractGstinMetadata } from '../../utils/erpSmartHelpers';

interface QuickAddPartyModalProps {
  isHindi: boolean;
  initialType?: 'CUSTOMER' | 'VENDOR' | 'BOTH';
  onSave: (party: PartyMaster) => void;
  onClose: () => void;
}

export const QuickAddPartyModal: React.FC<QuickAddPartyModalProps> = ({
  isHindi,
  initialType = 'CUSTOMER',
  onSave,
  onClose
}) => {
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'VENDOR' | 'BOTH'>(initialType);
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [gstCategory, setGstCategory] = useState<'REGULAR' | 'COMPOSITION' | 'UNREGISTERED' | 'SEZ_DEVELOPER' | 'CASUAL'>('UNREGISTERED');
  const [taxpayerStatus, setTaxpayerStatus] = useState<'Active' | 'Cancelled' | 'Suspended'>('Active');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [stateCode, setStateCode] = useState('');
  const [state, setState] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [creditDays, setCreditDays] = useState<number>(0);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [openingBalanceType, setOpeningBalanceType] = useState<'DR' | 'CR'>('DR');
  const [isVerifyingGstin, setIsVerifyingGstin] = useState(false);
  const [gstVerificationResult, setGstVerificationResult] = useState<string | null>(null);
  const [gstInfoMeta, setGstInfoMeta] = useState<{
    isVerified: boolean;
    status?: string;
    constitution?: string;
    registrationDate?: string;
    source?: string;
    sources?: Array<{ title: string; url: string }>;
  } | null>(null);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [gstPasteInput, setGstPasteInput] = useState('');
  const lastAutoFetchedRef = useRef<string>('');

  const handleCopyGstinBeforePortal = () => {
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
        sources: d.groundingSources
      });
      setGstVerificationResult(`✅ ${isHindi ? '100% असली GST विवरण प्राप्त:' : 'Verified Live GST Record:'} ${bName}${d.status ? ` (${d.status})` : ''}`);
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
      setGstVerificationResult(isHindi ? 'पेस्ट किए गए टेक्स्ट में Legal Name / Address नहीं मिला। कृपया Govt GST पोर्टल (services.gst.gov.in) का पूरा रिजल्ट कॉपी करके पेस्ट करें।' : 'Legal Name / Address not found in pasted text. Please copy full text from services.gst.gov.in.');
    }
  };

  const handleFetchGstinDetails = async (overrideGstin?: string) => {
    const targetGstin = typeof overrideGstin === 'string' ? overrideGstin : gstin;
    const cleanGstin = targetGstin.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!cleanGstin || cleanGstin.length < 2) {
      setGstVerificationResult(isHindi ? 'कम से कम 2-डिजिट राज्य कोड या 15-डिजिट GSTIN दर्ज करें!' : 'Enter at least 2-digit State Code or 15-digit GSTIN');
      return;
    }

    setIsVerifyingGstin(true);
    setGstVerificationResult(null);
    setGstInfoMeta(null);

    const scPrefix = cleanGstin.substring(0, 2);
    const derivedState = INDIAN_STATE_CODES[scPrefix];
    if (derivedState) {
      setStateCode(scPrefix);
      setState(derivedState);
    }

    if (cleanGstin.length >= 12) {
      const derivedPan = cleanGstin.substring(2, 12);
      if (/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(derivedPan)) {
        setPan(derivedPan);
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
        setGstVerificationResult(`⚠️ ${isHindi ? `चेकसम त्रुटि: अंतिम अक्षर '${validation.actualChecksum}' की जगह '${validation.expectedChecksum}' होना चाहिए।` : `Checksum error: Expected '${validation.expectedChecksum}' instead of '${validation.actualChecksum}'.`}`);
        setIsVerifyingGstin(false);
        return;
      }
      setGstCategory(cleanGstin.charAt(13) !== 'Z' && cleanGstin.charAt(13) !== '0' ? 'COMPOSITION' : 'REGULAR');
    }

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
            constitution: d.constitutionOfBusiness
          });
          setGstVerificationResult(
            clientRes.quotaExceeded
              ? (isHindi
                  ? `GSTIN सही है (${d.stateName} - ${d.stateCode}, PAN: ${d.pan})। सर्च कोटा सीमित होने से नाम अभी नहीं मिला — 'Govt Search' से कॉपी कर 'Paste' करें।`
                  : `Valid GSTIN (${d.stateName}, PAN: ${d.pan}). Live search quota reached — copy from Govt Search & Paste below.`)
              : (isHindi
                  ? `GSTIN सही है (${d.stateName} - ${d.stateCode}, PAN: ${d.pan})। यह फ़र्म पब्लिक वेब सर्च में इंडेक्स्ड नहीं है (कोई फ़र्ज़ी डेटा नहीं भरा गया) — 'Govt Search' से कॉपी कर 'Paste' करें।`
                  : `Valid GSTIN (${d.stateName}, PAN: ${d.pan}). Not indexed on public search (no fake data injected) — copy from Govt Search & Paste.`)
          );
        }
      } else {
        setGstVerificationResult(`⚠️ ${clientRes.error || (isHindi ? 'सत्यापन विफल' : 'Verification failed')}`);
      }
    } catch {
      setGstVerificationResult(`✅ ${derivedState || 'State'} (${scPrefix}) ${isHindi ? 'सत्यापित' : 'verified'}`);
    } finally {
      setIsVerifyingGstin(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const rawGstin = gstin.toUpperCase().replace(/[^0-9A-Z]/g, '').trim();
    const cleanGstin = rawGstin === 'URP' ? '' : rawGstin;
    const finalCategory: PartyMaster['gstCategory'] =
      cleanGstin.length === 15
        ? (gstCategory === 'UNREGISTERED'
            ? (cleanGstin.charAt(13) !== 'Z' && cleanGstin.charAt(13) !== '0' ? 'COMPOSITION' : 'REGULAR')
            : gstCategory)
        : (!cleanGstin ? 'UNREGISTERED' : gstCategory);
    const derivedPan = pan.trim().toUpperCase() || (cleanGstin.length >= 12 ? cleanGstin.substring(2, 12).toUpperCase() : '');
    const derivedStateCode = stateCode || (cleanGstin.length >= 2 && INDIAN_STATE_CODES[cleanGstin.slice(0, 2)] ? cleanGstin.slice(0, 2) : '');
    const derivedState = (derivedStateCode && INDIAN_STATE_CODES[derivedStateCode]) || state;
    const extractedPin = pincode.trim() || (address.match(/\b([1-9][0-9]{5})\b/)?.[1] || '');

    const newParty: PartyMaster = {
      id: 'pty_' + Date.now(),
      code: 'PRT-' + Math.floor(1000 + Math.random() * 9000),
      name: name.trim(),
      legalName: (legalName || name).trim(),
      tradeName: (tradeName || name).trim(),
      type,
      gstin: cleanGstin || '',
      pan: derivedPan,
      phone: phone.trim(),
      email: email.trim(),
      contactPerson: contactPerson.trim(),
      address: address.trim(),
      state: derivedState,
      stateCode: derivedStateCode,
      pincode: extractedPin,
      creditLimit: Math.max(0, Number(creditLimit) || 0),
      creditDays: Math.max(0, Math.floor(Number(creditDays) || 0)),
      openingBalance: Number(openingBalance) || 0,
      balanceType: openingBalanceType || 'DR',
      openingBalanceType,
      gstCategory: finalCategory,
      taxpayerStatus,
      bankName: '',
      accountNumber: '',
      ifscCode: ''
    };

    if (cleanGstin.length === 15 && newParty.name) {
      saveGSTINToCache({
        gstin: cleanGstin,
        legalName: newParty.legalName || newParty.name,
        tradeName: newParty.tradeName || newParty.name,
        pan: derivedPan,
        stateCode: derivedStateCode,
        stateName: derivedState,
        taxpayerType: finalCategory === 'COMPOSITION' ? 'Composition' : finalCategory === 'SEZ_DEVELOPER' ? 'SEZ Unit' : 'Regular',
        status: taxpayerStatus,
        registrationDate: gstInfoMeta?.registrationDate || '',
        principalAddress: newParty.address,
        city: state,
        pincode: extractedPin,
        constitutionOfBusiness: gstInfoMeta?.constitution,
        einvoiceStatus: 'Enabled',
        isLivePortalData: true,
        source: gstInfoMeta?.source || 'Saved Quick Party'
      });
    }

    onSave(newParty);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="hv-surface border border-[var(--border-subtle)] rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto text-[var(--text-primary)]">
        {/* Modal Header */}
        <div className="hv-elevated px-5 py-3.5 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 hv-pill-indigo border rounded-xl">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[var(--text-primary)]">
                {isHindi ? 'त्वरित नया पार्टी मास्टर जोड़ें (+ Quick Add Party)' : '+ Quick Create Party Master'}
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                {isHindi ? 'इनवॉइस में तुरंत उपयोग के लिए ग्राहक/सप्लायर बनाएं' : 'Add new customer or supplier on the fly for immediate invoicing'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-primary)] rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'पार्टी का नाम (Party / Customer Name) *' : 'Party / Company Name *'}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Acme Traders & Co."
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-indigo-500 outline-none"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'पार्टी का प्रकार (Party Type)' : 'Party Type *'}
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-indigo-500 outline-none"
              >
                <option value="CUSTOMER">{isHindi ? 'ग्राहक (Customer)' : 'Customer (Debtor)'}</option>
                <option value="VENDOR">{isHindi ? 'विक्रेता / सप्लायर (Vendor)' : 'Vendor / Supplier (Creditor)'}</option>
                <option value="BOTH">{isHindi ? 'दोनों (Both Customer & Vendor)' : 'Both (Customer & Vendor)'}</option>
              </select>
            </div>

            <div className="sm:col-span-2 hv-elevated p-3 rounded-xl border border-[var(--border-primary)] space-y-2">
              <label className="block text-amber-500 font-bold">
                {isHindi ? 'जीएसटी पंजीकरण प्रकार (GST Registration Type) *' : 'GST Registration Type *'}
              </label>
              <select
                value={gstCategory}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setGstCategory(val);
                  if (val === 'UNREGISTERED') {
                    setGstin('');
                  }
                }}
                className="w-full hv-input text-amber-500 font-bold border border-amber-500/50 rounded-xl px-3 py-2 text-xs focus:border-amber-400 outline-none"
              >
                <option value="UNREGISTERED">Unregistered / Consumer (गैर-पंजीकृत / उपभोक्ता)</option>
                <option value="REGULAR">Regular (नियमित पंजीकृत GSTIN)</option>
                <option value="COMPOSITION">Composition Scheme (कंपोजिशन स्कीम)</option>
                <option value="SEZ_DEVELOPER">SEZ / Overseas (विशेष आर्थिक क्षेत्र)</option>
              </select>
            </div>

            <div className="sm:col-span-2 space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[var(--text-secondary)] font-bold">
                  {isHindi ? 'जीएसटी नंबर (GSTIN)' : 'GSTIN (Optional / URP)'}
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleFetchGstinDetails()}
                    disabled={isVerifyingGstin || !gstin.trim()}
                    className="flex items-center gap-1.5 text-[11px] hv-pill-amber font-bold px-2.5 py-1 rounded-lg border transition disabled:opacity-50"
                  >
                    {isVerifyingGstin ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{isHindi ? 'जांच जारी...' : 'Verifying...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3" />
                        <span>{isHindi ? 'GST विवरण भरें' : 'Fetch GST'}</span>
                      </>
                    )}
                  </button>

                  <a
                    href="https://services.gst.gov.in/services/searchtp"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleCopyGstinBeforePortal}
                    title="Govt GST Portal par search karein"
                    className="flex items-center gap-1 text-[11px] hv-pill-blue font-bold px-2 py-1 rounded-lg border transition"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Govt Search</span>
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowPasteBox(!showPasteBox)}
                    title="GST Portal text paste karein"
                    className="flex items-center gap-1 text-[11px] hv-pill-purple font-bold px-2 py-1 rounded-lg border transition"
                  >
                    <Clipboard className="w-3 h-3" />
                    <span>Paste</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => {
                      const meta = extractGstinMetadata(e.target.value);
                      setGstin(meta.cleanGstin);
                      if (!meta.cleanGstin) setGstCategory('UNREGISTERED');
                      setGstVerificationResult(null);
                      setGstInfoMeta(null);

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
                    placeholder="e.g. 07AAAAA0000A1Z5 or URP"
                    className="w-full hv-input text-amber-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono uppercase focus:border-indigo-500 outline-none"
                  />
                  {(pan || stateCode) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-mono text-emerald-500">
                      {stateCode && state && <span>State: {stateCode} - {state}</span>}
                      {pan && <span>PAN: {pan}</span>}
                    </div>
                  )}
                </div>
                <div>
                  <select
                    value={stateCode}
                    onChange={(e) => {
                      const code = e.target.value;
                      setStateCode(code);
                      setState(code ? (INDIAN_STATE_CODES[code] || '') : '');
                    }}
                    className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-semibold focus:border-indigo-500 outline-none"
                  >
                    <option value="">{isHindi ? '-- राज्य चुनें --' : '-- Select State --'}</option>
                    {Object.entries(INDIAN_STATE_CODES).map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} - {name}
                      </option>
                    ))}
                  </select>
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
                    placeholder={isHindi ? "Govt GST portal (services.gst.gov.in) se copy kiya gaya text ya JSON paste karein..." : "Paste full text copied from Govt GST Portal (services.gst.gov.in)..."}
                    rows={3}
                    className="w-full hv-input border border-purple-500/40 rounded-lg p-2 text-xs font-mono focus:outline-none focus:border-purple-500"
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
                  </div>
                  {gstInfoMeta && (
                    <div className="flex flex-wrap items-center gap-2 text-[10px] pt-1 border-t border-[var(--border-subtle)]">
                      {gstInfoMeta.status && (
                        <span className={`px-2 py-0.5 rounded font-bold border ${
                          gstInfoMeta.status === 'Active'
                            ? 'hv-pill-emerald'
                            : 'hv-pill-rose'
                        }`}>
                          {gstInfoMeta.status}
                        </span>
                      )}
                      {gstInfoMeta.constitution && (
                        <span className="px-2 py-0.5 rounded hv-pill-slate border">
                          {gstInfoMeta.constitution}
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
                          📋 {isHindi ? 'Portal Text Paste करें' : 'Paste Portal Result'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'कानूनी नाम (Legal Name)' : 'Legal Name'}
              </label>
              <input
                type="text"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Official Registered Name"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'पैन नंबर (PAN)' : 'PAN Number'}
              </label>
              <input
                type="text"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                maxLength={10}
                placeholder="ABCDE1234F"
                className="w-full hv-input text-indigo-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono uppercase focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'मोबाइल नंबर (Phone)' : 'Phone / Mobile'}
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'पिनकोड (Pincode)' : 'Pincode'}
              </label>
              <input
                type="text"
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                maxLength={6}
                placeholder="482001"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono focus:border-indigo-500 outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'बिलिंग का पूरा पता (Full Address)' : 'Billing Address'}
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop No. 12, Commercial Complex..."
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'प्रारंभिक शेष (Opening Balance)' : 'Opening Balance (₹)'}
              </label>
              <input
                type="number"
                value={openingBalance || ''}
                onChange={(e) => setOpeningBalance(Number(e.target.value))}
                placeholder="0"
                className="w-full hv-input text-emerald-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono font-bold focus:border-indigo-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-[var(--text-secondary)] font-bold mb-1">
                {isHindi ? 'शेष प्रकार (Balance Type)' : 'Dr / Cr Type'}
              </label>
              <select
                value={openingBalanceType}
                onChange={(e) => setOpeningBalanceType(e.target.value as 'DR' | 'CR')}
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-bold focus:border-indigo-500 outline-none"
              >
                <option value="DR">DR (Receivable / लेने हैं)</option>
                <option value="CR">CR (Payable / देने हैं)</option>
              </select>
            </div>

            <div>
              <label className="block text-amber-500 font-bold mb-1">
                {isHindi ? 'क्रेडिट सीमा (Credit Limit - वैकल्पिक)' : 'Credit Limit (Optional)'}
              </label>
              <input
                type="number"
                min={0}
                value={creditLimit || ''}
                onChange={(e) => setCreditLimit(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0 (No limit)"
                className="w-full hv-input text-amber-500 border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono font-bold focus:border-amber-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-amber-500 font-bold mb-1">
                {isHindi ? 'क्रेडिट अवधि (Credit Period Days)' : 'Credit Period (Days)'}
              </label>
              <input
                type="number"
                min={0}
                max={365}
                value={creditDays || ''}
                onChange={(e) => setCreditDays(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                placeholder="e.g. 15 or 30"
                className="w-full hv-input border border-[var(--border-subtle)] rounded-xl px-3 py-2 font-mono font-bold focus:border-amber-500 outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-[var(--border-primary)] flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] text-[var(--text-secondary)] border border-[var(--border-subtle)] font-bold text-xs rounded-xl transition"
            >
              {isHindi ? 'रद्द करें' : 'Cancel'}
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold text-xs rounded-xl transition shadow-lg shadow-indigo-600/30 flex items-center gap-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isHindi ? 'पार्टी सेव करें (+ Auto Select)' : 'Save & Select Party'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
