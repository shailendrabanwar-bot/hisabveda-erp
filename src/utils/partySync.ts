import { AppData, PartyMaster } from '../types';
import { INDIAN_STATE_CODES } from './gstin';

function normalizeGstinForSync(val?: string): string {
  const clean = (val || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean || clean === 'URP' || clean === 'UNREGISTERED' || clean === 'NA' || clean === 'NONE') {
    return '';
  }
  return clean;
}

function isValidB2bGstinForSync(val?: string): boolean {
  const g = normalizeGstinForSync(val);
  return g.length === 15 && /^[0-9]{2}[A-Z0-9]{13}$/.test(g);
}

function normalizePartyLookupKey(name?: string): string {
  return (name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function syncPartyDetailsAcrossAppData(prev: AppData, updatedParty: PartyMaster): AppData {
  const cleanGstin = normalizeGstinForSync(updatedParty.gstin);
  const nextCategory: PartyMaster['gstCategory'] = isValidB2bGstinForSync(cleanGstin)
    ? updatedParty.gstCategory && updatedParty.gstCategory !== 'UNREGISTERED'
      ? updatedParty.gstCategory
      : 'REGULAR'
    : updatedParty.gstCategory || 'UNREGISTERED';
  const gstinState =
    cleanGstin.length >= 2 && INDIAN_STATE_CODES[cleanGstin.slice(0, 2)]
      ? INDIAN_STATE_CODES[cleanGstin.slice(0, 2)]
      : '';
  const nextState = (updatedParty.state || '').trim() || gstinState;
  const partyKey = normalizePartyLookupKey(updatedParty.name);
  const existingPartyIds = new Set((prev.parties || []).map((p) => p.id));

  const matchesParty = (rec: { partyId?: string; partyName?: string }) => {
    if (rec.partyId && rec.partyId === updatedParty.id) return true;
    if (!partyKey) return false;
    const recKey = normalizePartyLookupKey(rec.partyName);
    if (!recKey || recKey !== partyKey) return false;
    return !rec.partyId || !existingPartyIds.has(rec.partyId);
  };

  let invChanged = false;
  const nextInvoices = (prev.invoices || []).map((inv) => {
    if (!matchesParty(inv)) return inv;
    const nextPos = nextState || inv.placeOfSupply;
    const nextPartyState = nextState || inv.partyState;
    const nextAddr = updatedParty.address || inv.partyAddress || '';
    if (
      inv.partyId === updatedParty.id &&
      inv.partyName === updatedParty.name &&
      (inv.partyGstin || '') === cleanGstin &&
      inv.partyGstCategory === nextCategory &&
      (inv.partyState || '') === (nextPartyState || '') &&
      (inv.placeOfSupply || '') === (nextPos || '') &&
      (inv.partyAddress || '') === nextAddr
    ) {
      return inv;
    }
    invChanged = true;
    return {
      ...inv,
      partyId: updatedParty.id,
      partyName: updatedParty.name,
      partyGstin: cleanGstin,
      partyGstCategory: nextCategory,
      ...(nextPartyState ? { partyState: nextPartyState } : {}),
      ...(nextPos ? { placeOfSupply: nextPos } : {}),
      ...(nextAddr ? { partyAddress: nextAddr } : {}),
    };
  });

  let purChanged = false;
  const nextPurchases = (prev.purchaseInvoices || []).map((pur) => {
    if (!matchesParty(pur)) return pur;
    const nextPartyState = nextState || pur.partyState;
    if (
      pur.partyId === updatedParty.id &&
      pur.partyName === updatedParty.name &&
      (pur.partyGstin || '') === cleanGstin &&
      (pur.partyState || '') === (nextPartyState || '')
    ) {
      return pur;
    }
    purChanged = true;
    return {
      ...pur,
      partyId: updatedParty.id,
      partyName: updatedParty.name,
      partyGstin: cleanGstin,
      ...(nextPartyState ? { partyState: nextPartyState } : {}),
    };
  });

  let noteChanged = false;
  const nextNotes = (prev.debitCreditNotes || []).map((note) => {
    if (!matchesParty(note)) return note;
    if (
      note.partyId === updatedParty.id &&
      note.partyName === updatedParty.name &&
      (note.partyGstin || '') === cleanGstin
    ) {
      return note;
    }
    noteChanged = true;
    return {
      ...note,
      partyId: updatedParty.id,
      partyName: updatedParty.name,
      partyGstin: cleanGstin,
    };
  });

  let vchChanged = false;
  const nextVouchers = (prev.vouchers || []).map((vch) => {
    if (!matchesParty(vch)) return vch;
    if (vch.partyId === updatedParty.id && vch.partyName === updatedParty.name) {
      return vch;
    }
    vchChanged = true;
    return {
      ...vch,
      partyId: updatedParty.id,
      partyName: updatedParty.name,
    };
  });

  if (!invChanged && !purChanged && !noteChanged && !vchChanged) return prev;
  return {
    ...prev,
    ...(invChanged ? { invoices: nextInvoices } : {}),
    ...(purChanged ? { purchaseInvoices: nextPurchases } : {}),
    ...(noteChanged ? { debitCreditNotes: nextNotes } : {}),
    ...(vchChanged ? { vouchers: nextVouchers } : {}),
  };
}
