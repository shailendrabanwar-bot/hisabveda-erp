import { AppData, Account, AccountCategory, AccountGroup, ItemMaster, JournalEntryLine, SalesInvoice, PurchaseInvoice, Voucher, BankStatementLine, PartyMaster, CompanyDetails } from '../types';
import { AppConfiguration } from './appConfig';
import { getFinancialYearRange, getFinancialYearStartForDate, isDateInFinancialYear, normalizeDateISO } from './fiscalYear';

export interface AccountBalance {
  account: Account;
  debit: number;
  credit: number;
  netBalance: number;
  balanceType: 'DR' | 'CR';
}

export interface FinancialSummary {
  totalSales: number;
  totalCollected: number;
  totalReceivables: number;
  totalPayables: number;
  cashAndBankBalance: number;
  netProfit: number;
  totalExpenses: number;
  totalPurchases: number;
  totalTaxPayable: number;
  unreconciledBankCount: number;
}

export function getSignedLedgerAmount(
  bal: AccountBalance | undefined,
  category: AccountCategory
): number {
  if (!bal) return 0;
  if (category === 'REVENUE' || category === 'LIABILITY' || category === 'EQUITY') {
    return bal.balanceType === 'CR' ? bal.netBalance : -bal.netBalance;
  }
  return bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance;
}

export function getItemClosingStockValue(item: ItemMaster): number {
  const qty = Number(item.currentStock ?? 0);
  const price = Number(item.purchasePrice) || Number(item.salesPrice) || 0;
  const rateUnchanged =
    item.importedPurchasePrice === undefined ||
    Math.abs((Number(item.purchasePrice) || 0) - item.importedPurchasePrice) < 0.001;
  if (
    item.closingStockValue !== undefined &&
    item.importedClosingQty !== undefined &&
    Math.abs(qty - item.importedClosingQty) < 0.001 &&
    rateUnchanged
  ) {
    return Math.round(item.closingStockValue * 100) / 100;
  }
  return Math.round(qty * price * 100) / 100;
}

export function getEffectiveOpeningStock(data: AppData): number {
  const invAcc = (data.accounts || []).find(a => a.id === 'acc_inventory');
  if (invAcc && (invAcc.openingBalance || 0) !== 0) {
    return invAcc.balanceType === 'CR' ? -(invAcc.openingBalance || 0) : (invAcc.openingBalance || 0);
  }
  const extraStockAccs = (data.accounts || []).filter(
    a =>
      a.id !== 'acc_inventory' &&
      a.category === 'ASSET' &&
      ['stock-in-hand', 'stock in hand', 'opening stock'].includes((a.name || '').toLowerCase().trim())
  );
  if (extraStockAccs.length > 0) {
    return Math.round(
      extraStockAccs.reduce(
        (s, a) => s + (a.balanceType === 'CR' ? -(a.openingBalance || 0) : (a.openingBalance || 0)),
        0
      ) * 100
    ) / 100;
  }
  return 0;
}

export function calculateClosingStock(data: AppData, manualOverride?: number): number {
  if (typeof manualOverride === 'number' && Number.isFinite(manualOverride)) {
    return Math.round(manualOverride * 100) / 100;
  }
  if (
    data.company?.closingStockValuationMode === 'MANUAL' &&
    typeof data.company?.manualClosingStock === 'number' &&
    Number.isFinite(data.company.manualClosingStock)
  ) {
    return Math.round(data.company.manualClosingStock * 100) / 100;
  }
  if (!data.items || data.items.length === 0) return 0;
  const total = data.items.reduce((sum, item) => sum + getItemClosingStockValue(item), 0);
  return Math.round(total * 100) / 100;
}

export function calculateAccountBalances(data: AppData): Map<string, AccountBalance> {
  const map = new Map<string, AccountBalance>();

  // Initialize from Chart of Accounts opening balances
  for (const acc of data.accounts) {
    const dr = acc.balanceType === 'DR' ? acc.openingBalance : 0;
    const cr = acc.balanceType === 'CR' ? acc.openingBalance : 0;
    map.set(acc.id, {
      account: acc,
      debit: dr,
      credit: cr,
      netBalance: Math.abs(dr - cr),
      balanceType: dr >= cr ? 'DR' : 'CR'
    });
  }

  // Helper to safely get or initialize a system account in map
  const getOrCreate = (
    id: string, 
    name: string, 
    category: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE', 
    subCategory: string, 
    code: string, 
    defaultType: 'DR' | 'CR'
  ): AccountBalance => {
    let existing = map.get(id);
    if (!existing) {
      const accountObj = {
        id,
        code,
        name,
        category,
        subCategory,
        openingBalance: 0,
        balanceType: defaultType,
        isSystem: true
      };
      existing = {
        account: accountObj,
        debit: 0,
        credit: 0,
        netBalance: 0,
        balanceType: defaultType
      };
      map.set(id, existing);
    }
    return existing;
  };

  const partyById = new Map((data.parties || []).map(p => [p.id, p]));

  // 1. Process Vouchers (Journal, Payment, Receipt, Contra)
  for (const vch of data.vouchers) {
    if ((vch as any).isOptional || (vch as any).isCancelled) continue;
    let vchDr = 0;
    let vchCr = 0;
    for (const line of vch.entries) {
      if (!line.accountId) continue;
      let existing = map.get(line.accountId);
      if (!existing) {
        // Resolve legacy vouchers where a Party ID (e.g. pty_*) was posted directly as accountId
        const matchedParty = partyById.get(line.accountId);
        if (matchedParty || line.accountId.startsWith('pty_')) {
          const isDebtor =
            matchedParty?.type === 'CUSTOMER' ||
            (matchedParty?.type !== 'VENDOR' && vch.type === 'RECEIPT');
          existing = isDebtor
            ? getOrCreate('acc_debtors', 'Sundry Debtors (Receivables)', 'ASSET', 'Current Assets', '1100', 'DR')
            : getOrCreate('acc_creditors', 'Sundry Creditors (Payables)', 'LIABILITY', 'Current Liabilities', '2010', 'CR');
        } else {
          existing = getOrCreate(line.accountId, line.accountName || `Account ${line.accountId}`, 'EXPENSE', 'General', line.accountCode || '9999', 'DR');
        }
      }
      const dr = Number(line.debit) || 0;
      const cr = Number(line.credit) || 0;
      existing.debit += dr;
      existing.credit += cr;
      vchDr += dr;
      vchCr += cr;
    }
    if (vch.type !== 'CONTRA') {
      const autoRo = getAutoRoundOffAdjustment(vchDr, vchCr);
      if (autoRo) {
        const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
        roundOffAcc.debit += autoRo.debit;
        roundOffAcc.credit += autoRo.credit;
      }
    }
  }

  // 2. Process Sales Invoices (Instant Cash/Bank + Sundry Debtors Settlement)
  for (const inv of data.invoices) {
    if (inv.status === 'CANCELLED') continue;

    const settlement = resolveSalesInvoiceSettlement(data, inv);
    let invDr = 0;
    let invCr = 0;

    // Debit Cash / Bank accounts immediately for paid Cash/UPI/Card/Bank portion
    for (const leg of settlement.legs) {
      if (leg.amount <= 0.0001) continue;
      const legAcc =
        map.get(leg.account.id) ||
        getOrCreate(
          leg.account.id,
          leg.account.name,
          leg.account.category || 'ASSET',
          leg.account.subCategory || 'Cash & Bank',
          leg.account.code || '1010',
          leg.account.balanceType || 'DR'
        );
      legAcc.debit += leg.amount;
      invDr += leg.amount;
    }

    // Debit Sundry Debtors strictly for remaining unpaid/credit or linked-voucher portion
    if (settlement.debtorsAmount > 0.0001) {
      const debtorsAcc = getOrCreate('acc_debtors', 'Sundry Debtors (Receivables)', 'ASSET', 'Current Assets', '1100', 'DR');
      debtorsAcc.debit += settlement.debtorsAmount;
      invDr += settlement.debtorsAmount;
    }

    // Sales Revenue Cr
    const salesTargetId = inv.primaryAccountId || 'acc_sales';
    const salesAcc =
      map.get(salesTargetId) ||
      getOrCreate(salesTargetId, 'Sales Account - Goods', 'REVENUE', 'Direct Revenue', '4010', 'CR');
    const netSales = (inv.subtotal || 0) - (inv.totalDiscount || 0);
    salesAcc.credit += netSales;
    invCr += netSales;

    // Taxes Cr
    if ((inv.cgstAmount || 0) > 0) {
      const cgst = getOrCreate('acc_gst_cgst', 'Output GST Payable - CGST', 'LIABILITY', 'Duties & Taxes', '2110', 'CR');
      cgst.credit += inv.cgstAmount;
      invCr += inv.cgstAmount;
    }
    if ((inv.sgstAmount || 0) > 0) {
      const sgst = getOrCreate('acc_gst_sgst', 'Output GST Payable - SGST', 'LIABILITY', 'Duties & Taxes', '2120', 'CR');
      sgst.credit += inv.sgstAmount;
      invCr += inv.sgstAmount;
    }
    if ((inv.igstAmount || 0) > 0) {
      const igst = getOrCreate('acc_gst_igst', 'Output GST Payable - IGST', 'LIABILITY', 'Duties & Taxes', '2130', 'CR');
      igst.credit += inv.igstAmount;
      invCr += inv.igstAmount;
    }
    if ((inv.cessAmount || 0) > 0) {
      const cessAcc = getOrCreate('acc_gst_cess', 'Output GST Payable - Cess', 'LIABILITY', 'Duties & Taxes', '2140', 'CR');
      cessAcc.credit += inv.cessAmount || 0;
      invCr += inv.cessAmount || 0;
    }

    // Round Off A/c
    if (inv.roundOff && Math.abs(inv.roundOff) > 0.0001) {
      const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
      if (inv.roundOff > 0) {
        roundOffAcc.credit += inv.roundOff;
        invCr += inv.roundOff;
      } else {
        const absRo = Math.abs(inv.roundOff);
        roundOffAcc.debit += absRo;
        invDr += absRo;
      }
    }

    // Extra invoice-level ledgers (e.g. Freight, Packing, TCS, multi-rate GST sales ledgers)
    if (inv.extraLedgerLines && inv.extraLedgerLines.length > 0) {
      for (const el of inv.extraLedgerLines) {
        if (!el.accountId) continue;
        const extraAcc =
          map.get(el.accountId) ||
          getOrCreate(el.accountId, el.accountName || `Ledger ${el.accountId}`, (el.credit || 0) >= (el.debit || 0) ? 'REVENUE' : 'EXPENSE', (el.credit || 0) >= (el.debit || 0) ? 'Indirect Revenue' : 'Indirect Expenses', '9998', (el.credit || 0) >= (el.debit || 0) ? 'CR' : 'DR');
        const dr = el.debit || 0;
        const cr = el.credit || 0;
        extraAcc.debit += dr;
        extraAcc.credit += cr;
        invDr += dr;
        invCr += cr;
      }
    }

    // Route any remaining sub-rupee rounding difference to Round Off A/c so Dr === Cr strictly
    const invAutoRo = getAutoRoundOffAdjustment(invDr, invCr);
    if (invAutoRo) {
      const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
      roundOffAcc.debit += invAutoRo.debit;
      roundOffAcc.credit += invAutoRo.credit;
    }
  }

  // 3. Process Purchase Invoices (Instant Cash/Bank + Sundry Creditors Settlement)
  if (data.purchaseInvoices) {
    for (const pur of data.purchaseInvoices) {
      if (pur.status === 'CANCELLED') continue;
      let purDr = 0;
      let purCr = 0;

      // Purchase Account Dr
      const purTargetId = pur.primaryAccountId || 'acc_cogs';
      const cogsAcc =
        map.get(purTargetId) ||
        getOrCreate(purTargetId, 'Cost of Goods Sold (Purchase)', 'EXPENSE', 'Direct Expenses', '5010', 'DR');
      const netPur = (pur.subtotal || 0) - (pur.totalDiscount || 0);
      cogsAcc.debit += netPur;
      purDr += netPur;

      // Input Tax Dr
      if ((pur.cgstAmount || 0) > 0) {
        const itcCgst = getOrCreate('acc_itc_cgst', 'Input Tax Credit - CGST', 'ASSET', 'Duties & Taxes', '1310', 'DR');
        itcCgst.debit += pur.cgstAmount;
        purDr += pur.cgstAmount;
      }
      if ((pur.sgstAmount || 0) > 0) {
        const itcSgst = getOrCreate('acc_itc_sgst', 'Input Tax Credit - SGST', 'ASSET', 'Duties & Taxes', '1320', 'DR');
        itcSgst.debit += pur.sgstAmount;
        purDr += pur.sgstAmount;
      }
      if ((pur.igstAmount || 0) > 0) {
        const itcIgst = getOrCreate('acc_itc_igst', 'Input Tax Credit - IGST', 'ASSET', 'Duties & Taxes', '1330', 'DR');
        itcIgst.debit += pur.igstAmount;
        purDr += pur.igstAmount;
      }
      if ((pur.cessAmount || 0) > 0) {
        const itcCess = getOrCreate('acc_itc_cess', 'Input Tax Credit - Cess', 'ASSET', 'Duties & Taxes', '1340', 'DR');
        itcCess.debit += pur.cessAmount || 0;
        purDr += pur.cessAmount || 0;
      }

      // Round Off A/c
      if (pur.roundOff && Math.abs(pur.roundOff) > 0.0001) {
        const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
        if (pur.roundOff > 0) {
          roundOffAcc.debit += pur.roundOff;
          purDr += pur.roundOff;
        } else {
          const absRo = Math.abs(pur.roundOff);
          roundOffAcc.credit += absRo;
          purCr += absRo;
        }
      }

      // Extra purchase-level ledgers (e.g. Freight Inward, Custom Duty, Packing, TCS, multi-rate GST purchase ledgers)
      if (pur.extraLedgerLines && pur.extraLedgerLines.length > 0) {
        for (const el of pur.extraLedgerLines) {
          if (!el.accountId) continue;
          const extraAcc =
            map.get(el.accountId) ||
            getOrCreate(el.accountId, el.accountName || `Ledger ${el.accountId}`, 'EXPENSE', 'Direct Expenses', '9997', 'DR');
          const dr = el.debit || 0;
          const cr = el.credit || 0;
          extraAcc.debit += dr;
          extraAcc.credit += cr;
          purDr += dr;
          purCr += cr;
        }
      }

      const purSettlement = resolvePurchaseBillSettlement(data, pur);

      // Credit Cash / Bank accounts immediately for paid Cash/UPI/Card/Bank portion
      for (const leg of purSettlement.legs) {
        if (leg.amount <= 0.0001) continue;
        const legAcc =
          map.get(leg.account.id) ||
          getOrCreate(
            leg.account.id,
            leg.account.name,
            leg.account.category || 'ASSET',
            leg.account.subCategory || 'Cash & Bank',
            leg.account.code || '1010',
            leg.account.balanceType || 'DR'
          );
        legAcc.credit += leg.amount;
        purCr += leg.amount;
      }

      // Credit Sundry Creditors strictly for remaining unpaid/credit or linked-voucher portion
      if (purSettlement.creditorsAmount > 0.0001) {
        const creditorsAcc = getOrCreate('acc_creditors', 'Sundry Creditors (Payables)', 'LIABILITY', 'Current Liabilities', '2010', 'CR');
        creditorsAcc.credit += purSettlement.creditorsAmount;
        purCr += purSettlement.creditorsAmount;
      }

      // Route any remaining sub-rupee rounding difference to Round Off A/c so Dr === Cr strictly
      const purAutoRo = getAutoRoundOffAdjustment(purDr, purCr);
      if (purAutoRo) {
        const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
        roundOffAcc.debit += purAutoRo.debit;
        roundOffAcc.credit += purAutoRo.credit;
      }
    }
  }

  // 4. Process Debit & Credit Notes
  if (data.debitCreditNotes) {
    for (const note of data.debitCreditNotes) {
      let noteDr = 0;
      let noteCr = 0;
      const taxableVal = (note.subtotal || 0) - (note.totalDiscount || 0);

      if (note.type === 'DEBIT_NOTE') {
        const creditorsAcc = getOrCreate('acc_creditors', 'Sundry Creditors (Payables)', 'LIABILITY', 'Current Liabilities', '2010', 'CR');
        creditorsAcc.debit += note.grandTotal || 0;
        noteDr += note.grandTotal || 0;

        const dnTargetId = note.primaryAccountId || 'acc_cogs';
        const cogsAcc =
          map.get(dnTargetId) ||
          getOrCreate(dnTargetId, 'Cost of Goods Sold (Purchase)', 'EXPENSE', 'Direct Expenses', '5010', 'DR');
        cogsAcc.credit += taxableVal;
        noteCr += taxableVal;

        if ((note.cgstAmount || 0) > 0) {
          const itcCgst = getOrCreate('acc_itc_cgst', 'Input Tax Credit - CGST', 'ASSET', 'Duties & Taxes', '1310', 'DR');
          itcCgst.credit += note.cgstAmount;
          noteCr += note.cgstAmount;
        }
        if ((note.sgstAmount || 0) > 0) {
          const itcSgst = getOrCreate('acc_itc_sgst', 'Input Tax Credit - SGST', 'ASSET', 'Duties & Taxes', '1320', 'DR');
          itcSgst.credit += note.sgstAmount;
          noteCr += note.sgstAmount;
        }
        if ((note.igstAmount || 0) > 0) {
          const itcIgst = getOrCreate('acc_itc_igst', 'Input Tax Credit - IGST', 'ASSET', 'Duties & Taxes', '1330', 'DR');
          itcIgst.credit += note.igstAmount;
          noteCr += note.igstAmount;
        }
        if ((note.cessAmount || 0) > 0) {
          const itcCess = getOrCreate('acc_itc_cess', 'Input Tax Credit - Cess', 'ASSET', 'Duties & Taxes', '1340', 'DR');
          itcCess.credit += note.cessAmount || 0;
          noteCr += note.cessAmount || 0;
        }
        if (note.roundOff && Math.abs(note.roundOff) > 0.0001) {
          const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
          if (note.roundOff > 0) {
            roundOffAcc.credit += note.roundOff;
            noteCr += note.roundOff;
          } else {
            const absRo = Math.abs(note.roundOff);
            roundOffAcc.debit += absRo;
            noteDr += absRo;
          }
        }
      } else if (note.type === 'CREDIT_NOTE') {
        const cnTargetId = note.primaryAccountId || 'acc_sales';
        const salesAcc =
          map.get(cnTargetId) ||
          getOrCreate(cnTargetId, 'Sales Account - Goods', 'REVENUE', 'Direct Revenue', '4010', 'CR');
        salesAcc.debit += taxableVal;
        noteDr += taxableVal;

        if ((note.cgstAmount || 0) > 0) {
          const cgst = getOrCreate('acc_gst_cgst', 'Output GST Payable - CGST', 'LIABILITY', 'Duties & Taxes', '2110', 'CR');
          cgst.debit += note.cgstAmount;
          noteDr += note.cgstAmount;
        }
        if ((note.sgstAmount || 0) > 0) {
          const sgst = getOrCreate('acc_gst_sgst', 'Output GST Payable - SGST', 'LIABILITY', 'Duties & Taxes', '2120', 'CR');
          sgst.debit += note.sgstAmount;
          noteDr += note.sgstAmount;
        }
        if ((note.igstAmount || 0) > 0) {
          const igst = getOrCreate('acc_gst_igst', 'Output GST Payable - IGST', 'LIABILITY', 'Duties & Taxes', '2130', 'CR');
          igst.debit += note.igstAmount;
          noteDr += note.igstAmount;
        }
        if ((note.cessAmount || 0) > 0) {
          const cessAcc = getOrCreate('acc_gst_cess', 'Output GST Payable - Cess', 'LIABILITY', 'Duties & Taxes', '2140', 'CR');
          cessAcc.debit += note.cessAmount || 0;
          noteDr += note.cessAmount || 0;
        }
        if (note.roundOff && Math.abs(note.roundOff) > 0.0001) {
          const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
          if (note.roundOff > 0) {
            roundOffAcc.debit += note.roundOff;
            noteDr += note.roundOff;
          } else {
            const absRo = Math.abs(note.roundOff);
            roundOffAcc.credit += absRo;
            noteCr += absRo;
          }
        }

        const debtorsAcc = getOrCreate('acc_debtors', 'Sundry Debtors (Receivables)', 'ASSET', 'Current Assets', '1100', 'DR');
        debtorsAcc.credit += note.grandTotal || 0;
        noteCr += note.grandTotal || 0;
      }

      if (note.extraLedgerLines && note.extraLedgerLines.length > 0) {
        for (const el of note.extraLedgerLines) {
          if (!el.accountId) continue;
          const extraAcc =
            map.get(el.accountId) ||
            getOrCreate(el.accountId, el.accountName || `Ledger ${el.accountId}`, 'EXPENSE', 'Direct Expenses', '9996', 'DR');
          const dr = el.debit || 0;
          const cr = el.credit || 0;
          extraAcc.debit += dr;
          extraAcc.credit += cr;
          noteDr += dr;
          noteCr += cr;
        }
      }

      // Route any remaining sub-rupee rounding difference to Round Off A/c so Dr === Cr strictly
      const noteAutoRo = getAutoRoundOffAdjustment(noteDr, noteCr);
      if (noteAutoRo) {
        const roundOffAcc = getOrCreate('acc_round_off', 'Round Off Account (राउंड ऑफ)', 'EXPENSE', 'Indirect Expenses', '5990', 'DR');
        roundOffAcc.debit += noteAutoRo.debit;
        roundOffAcc.credit += noteAutoRo.credit;
      }
    }
  }

  // Finalize Net Balances & Balance Types for Trial Balance
  let totalDrSum = 0;
  let totalCrSum = 0;

  for (const [, bal] of map.entries()) {
    const diff = round2(bal.debit - bal.credit);
    if (diff >= 0) {
      bal.netBalance = diff;
      bal.balanceType = 'DR';
      totalDrSum += diff;
    } else {
      bal.netBalance = Math.abs(diff);
      bal.balanceType = 'CR';
      totalCrSum += Math.abs(diff);
    }
  }

  // Calculate Difference in Opening Balances if Trial Balance Debit != Credit
  const tbDiff = Math.round((totalDrSum - totalCrSum) * 1000) / 1000;
  if (Math.abs(tbDiff) >= 0.001) {
    const absDiff = Math.round(Math.abs(tbDiff) * 100) / 100;
    const diffType: 'DR' | 'CR' = tbDiff > 0 ? 'CR' : 'DR';
    const diffAccountObj: Account = {
      id: 'acc_diff_opening_bal',
      code: '3099',
      name: 'Difference in Opening Balances (ओपनिंग बैलेंस अंतर)',
      category: 'EQUITY',
      subCategory: 'Capital Account',
      openingBalance: absDiff,
      balanceType: diffType,
      isSystem: true
    };
    map.set('acc_diff_opening_bal', {
      account: diffAccountObj,
      debit: diffType === 'DR' ? absDiff : 0,
      credit: diffType === 'CR' ? absDiff : 0,
      netBalance: absDiff,
      balanceType: diffType
    });
  }

  return map;
}

/**
 * Returns true strictly for Cash in Hand / Petty Cash ledgers (excludes Bank Accounts & Cash Credit OD).
 */
export function isCashLedger(acc?: Account | null): boolean {
  if (!acc || acc.isGroup) return false;
  const cat = (acc.category || '').toUpperCase().trim();
  if (cat !== 'ASSET') return false;

  const id = (acc.id || '').toLowerCase().trim();
  const code = (acc.code || '').trim();
  const sub = (acc.subCategory || '').toLowerCase().trim();
  const name = (acc.name || '').toLowerCase().trim();

  if ((acc as any).type === 'CASH') return true;
  if (id === 'acc_cash' || code === '1010' || code === '1001') return true;
  if (sub === 'cash in hand' || sub === 'cash' || sub === 'petty cash') return true;
  if (
    (name === 'cash' ||
      name.includes('cash in hand') ||
      name.includes('petty cash') ||
      name.includes('cash account') ||
      name.includes('cash drawer') ||
      name.includes('cash box') ||
      name.includes('rokar') ||
      name.includes('नकद')) &&
    !name.includes('cash credit') &&
    !name.includes('bank')
  ) {
    return true;
  }
  return false;
}

export interface ResolvedAccountClassification {
  category: AccountCategory;
  nature:
    | 'TRADING_INCOME'
    | 'INDIRECT_INCOME'
    | 'TRADING_EXPENSE'
    | 'INDIRECT_EXPENSE'
    | 'FIXED_ASSET'
    | 'CURRENT_ASSET'
    | 'CAPITAL_EQUITY'
    | 'NON_CURRENT_LIABILITY'
    | 'CURRENT_LIABILITY';
  isSuspense: boolean;
  groupChain: string[];
}

function normalizeGroupKey(s?: string | null): string {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function inferNatureFromGroupLabel(
  label: string
): {
  category?: AccountCategory;
  isDirect?: boolean;
  isIndirect?: boolean;
  isFixedAsset?: boolean;
  isNonCurrentLiab?: boolean;
  isSuspense?: boolean;
} {
  const n = normalizeGroupKey(label);
  if (!n) return {};
  if (n.includes('suspense')) return { category: 'ASSET', isSuspense: true };
  if (
    n === 'capital account' ||
    n.includes('capital') ||
    n.includes('reserves') ||
    n.includes('surplus') ||
    n.includes('retained earnings') ||
    n.includes('profit loss a c') ||
    n === 'profit loss' ||
    n === 'equity'
  ) {
    return { category: 'EQUITY' };
  }
  if (
    n.includes('indirect income') ||
    n.includes('income indirect') ||
    n.includes('other income') ||
    n.includes('misc income') ||
    n.includes('non operating income')
  ) {
    return { category: 'REVENUE', isIndirect: true };
  }
  if (
    n.includes('sales account') ||
    /\bdirect income/.test(n) ||
    /\bdirect revenue/.test(n) ||
    /\bincome direct\b/.test(n)
  ) {
    return { category: 'REVENUE', isDirect: true };
  }
  if (
    n.includes('indirect expense') ||
    n.includes('expenses indirect') ||
    n.includes('administrative') ||
    n.includes('office expense') ||
    n.includes('selling expense') ||
    n.includes('selling distribution') ||
    n.includes('financial expense') ||
    n.includes('finance cost') ||
    n.includes('depreciation') ||
    n.includes('employee') ||
    n.includes('overhead')
  ) {
    return { category: 'EXPENSE', isIndirect: true };
  }
  if (
    n.includes('purchase account') ||
    /\bdirect expense/.test(n) ||
    /\bexpenses direct\b/.test(n) ||
    n.includes('cost of goods') ||
    n.includes('manufacturing expense')
  ) {
    return { category: 'EXPENSE', isDirect: true };
  }
  if (
    n.includes('fixed asset') ||
    n.includes('property plant') ||
    n.includes('plant machinery') ||
    n.includes('tangible asset') ||
    n.includes('intangible asset')
  ) {
    return { category: 'ASSET', isFixedAsset: true };
  }
  if (
    n.includes('current asset') ||
    n.includes('sundry debtor') ||
    n.includes('cash in hand') ||
    n.includes('cash bank') ||
    n.includes('bank account') ||
    n.includes('stock in hand') ||
    n.includes('inventory') ||
    n.includes('deposits asset') ||
    n.includes('loans advances asset') ||
    n.includes('investment') ||
    n.includes('input tax credit') ||
    n.includes('misc expenses asset')
  ) {
    return { category: 'ASSET', isFixedAsset: false };
  }
  if (
    n.includes('loans liability') ||
    n.includes('bank od') ||
    n.includes('bank occ') ||
    n.includes('cash credit') ||
    n.includes('overdraft') ||
    n.includes('secured loan') ||
    n.includes('unsecured loan') ||
    n.includes('non current liabilit') ||
    n.includes('long term') ||
    n.includes('borrowing') ||
    n === 'loans'
  ) {
    return { category: 'LIABILITY', isNonCurrentLiab: true };
  }
  if (
    n.includes('current liabilit') ||
    n.includes('sundry creditor') ||
    n.includes('duties taxes') ||
    n.includes('provision') ||
    n.includes('statutory') ||
    n.includes('outstanding')
  ) {
    return { category: 'LIABILITY', isNonCurrentLiab: false };
  }
  return {};
}

/**
 * Recursively traverses the AccountGroup parent-child hierarchy up to the root primary nature
 * (Income, Expense, Asset, Liability, Equity) so custom Tally sub-groups never get lost or
 * misclassified into Suspense.
 */
export function resolveAccountClassification(
  acc?: Account | null,
  accountGroups?: AccountGroup[]
): ResolvedAccountClassification {
  if (!acc) {
    return {
      category: 'EXPENSE',
      nature: 'INDIRECT_EXPENSE',
      isSuspense: false,
      groupChain: [],
    };
  }

  const groupById = new Map<string, AccountGroup>();
  const groupByName = new Map<string, AccountGroup>();
  for (const g of accountGroups || []) {
    if (!g) continue;
    if (g.id) groupById.set(g.id, g);
    const nk = normalizeGroupKey(g.name);
    if (nk && !groupByName.has(nk)) groupByName.set(nk, g);
  }

  const chainGroups: AccountGroup[] = [];
  const groupChain: string[] = [];
  const visitedIds = new Set<string>();
  const visitedNames = new Set<string>();

  let curr: AccountGroup | undefined =
    (acc.parentGroupId ? groupById.get(acc.parentGroupId) : undefined) ||
    (acc.subCategory ? groupByName.get(normalizeGroupKey(acc.subCategory)) : undefined) ||
    (acc.mainGroup ? groupByName.get(normalizeGroupKey(acc.mainGroup)) : undefined);

  while (curr && chainGroups.length < 25) {
    if (curr.id && visitedIds.has(curr.id)) break;
    const nk = normalizeGroupKey(curr.name);
    if (nk && visitedNames.has(nk)) break;
    if (curr.id) visitedIds.add(curr.id);
    if (nk) visitedNames.add(nk);

    chainGroups.push(curr);
    groupChain.push(curr.name);

    let next: AccountGroup | undefined =
      curr.parentGroupId ? groupById.get(curr.parentGroupId) : undefined;
    if (!next && curr.parentGroupName) {
      const pKey = normalizeGroupKey(curr.parentGroupName);
      if (!visitedNames.has(pKey)) {
        next = groupByName.get(pKey);
        if (!next) {
          groupChain.push(curr.parentGroupName);
          visitedNames.add(pKey);
        }
      }
    }
    curr = next;
  }

  // Append acc.mainGroup / subCategory if not already captured in groupChain
  for (const rawLbl of [acc.subCategory, acc.mainGroup]) {
    if (!rawLbl) continue;
    const nk = normalizeGroupKey(rawLbl);
    if (nk && !visitedNames.has(nk)) {
      groupChain.push(rawLbl);
      visitedNames.add(nk);
    }
  }

  // Traverse root-most group to leaf to establish primary Category & P&L / BS nature
  let inferredCategory: AccountCategory | undefined;
  let inferredDirect: boolean | undefined;
  let inferredFixedAsset: boolean | undefined;
  let inferredNonCurrentLiab: boolean | undefined;
  let hasSuspenseLabel = false;
  let resolvedByNonSuspenseChain = false;

  // Walk from root -> leaf across groupChain
  for (let i = groupChain.length - 1; i >= 0; i--) {
    const info = inferNatureFromGroupLabel(groupChain[i]);
    if (info.isSuspense) {
      hasSuspenseLabel = true;
      continue;
    }
    if (info.category) {
      inferredCategory = info.category;
      resolvedByNonSuspenseChain = true;
    }
    if (info.isDirect) inferredDirect = true;
    if (info.isIndirect) inferredDirect = false;
    if (info.isFixedAsset !== undefined) inferredFixedAsset = info.isFixedAsset;
    if (info.isNonCurrentLiab !== undefined) inferredNonCurrentLiab = info.isNonCurrentLiab;
  }

  // Also examine Tally XML group flags (nature + affectsGrossProfit) on ancestor chain from root -> leaf
  for (let i = chainGroups.length - 1; i >= 0; i--) {
    const g = chainGroups[i];
    if (g.nature === 'INCOME') {
      inferredCategory = 'REVENUE';
      resolvedByNonSuspenseChain = true;
    } else if (g.nature === 'EXPENSE') {
      inferredCategory = 'EXPENSE';
      resolvedByNonSuspenseChain = true;
    } else if (g.nature === 'ASSET') {
      if (!normalizeGroupKey(g.name).includes('suspense')) {
        inferredCategory = 'ASSET';
        resolvedByNonSuspenseChain = true;
      }
    } else if (g.nature === 'LIABILITY') {
      if (inferredCategory !== 'EQUITY') inferredCategory = 'LIABILITY';
      resolvedByNonSuspenseChain = true;
    }
    if (typeof g.affectsGrossProfit === 'boolean') {
      inferredDirect = g.affectsGrossProfit;
    }
  }

  const accNameLow = (acc.name || '').toLowerCase();
  const isGenuineSuspenseName =
    accNameLow.includes('suspense') || (acc.id || '').toLowerCase().includes('suspense');

  let category: AccountCategory = acc.category || 'EXPENSE';
  if (inferredCategory) {
    // Only preserve explicit EQUITY over LIABILITY unless parent chain explicitly says REVENUE/EXPENSE/ASSET
    if (!(acc.category === 'EQUITY' && inferredCategory === 'LIABILITY')) {
      category = inferredCategory;
    }
  }
  // If account was tagged under Suspense previously solely because custom group wasn't resolved, promote it cleanly
  if (acc.category === 'EQUITY' && (acc.mainGroup || '').toLowerCase().includes('profit')) {
    category = 'EQUITY';
  }

  const isSuspense =
    (isGenuineSuspenseName || (hasSuspenseLabel && !resolvedByNonSuspenseChain)) &&
    !resolvedByNonSuspenseChain;

  if (category === 'REVENUE') {
    const isDirect =
      acc.id === 'acc_sales' ||
      acc.id === 'acc_services' ||
      (inferredDirect !== undefined
        ? inferredDirect
        : /\bdirect\b/.test(normalizeGroupKey(acc.subCategory)) ||
          /\bdirect\b/.test(normalizeGroupKey(acc.mainGroup)) ||
          normalizeGroupKey(acc.subCategory).includes('sales') ||
          normalizeGroupKey(acc.mainGroup).includes('sales'));
    return {
      category,
      nature: isDirect ? 'TRADING_INCOME' : 'INDIRECT_INCOME',
      isSuspense: false,
      groupChain,
    };
  }

  if (category === 'EXPENSE') {
    const isDirect =
      acc.id === 'acc_cogs' ||
      acc.id === 'acc_purchases' ||
      (inferredDirect !== undefined
        ? inferredDirect
        : (() => {
            const sub = (acc.subCategory || '').toLowerCase().trim();
            const main = (acc.mainGroup || '').toLowerCase().trim();
            if (
              sub.includes('indirect') ||
              main.includes('indirect') ||
              sub.includes('employee') ||
              main.includes('employee')
            ) {
              return false;
            }
            return (
              /\bdirect\b/.test(sub) ||
              /\bdirect\b/.test(main) ||
              sub.includes('purchase') ||
              main.includes('purchase') ||
              sub.includes('cost of goods') ||
              main.includes('cost of goods')
            );
          })());
    return {
      category,
      nature: isDirect ? 'TRADING_EXPENSE' : 'INDIRECT_EXPENSE',
      isSuspense: false,
      groupChain,
    };
  }

  if (category === 'EQUITY') {
    return {
      category: 'EQUITY',
      nature: 'CAPITAL_EQUITY',
      isSuspense: false,
      groupChain,
    };
  }

  if (category === 'LIABILITY') {
    const sub = (acc.subCategory || '').toLowerCase();
    const main = (acc.mainGroup || '').toLowerCase();
    const isNonCurrent =
      inferredNonCurrentLiab !== undefined
        ? inferredNonCurrentLiab
        : sub.includes('long') ||
          sub.includes('loan') ||
          sub.includes('secured') ||
          sub.includes('unsecured') ||
          sub.includes('borrowing') ||
          sub.includes('bank od') ||
          sub.includes('bank occ') ||
          sub.includes('overdraft') ||
          main.includes('loan') ||
          main.includes('bank od') ||
          main.includes('overdraft') ||
          main.includes('non-current') ||
          main.includes('borrowing');
    return {
      category: 'LIABILITY',
      nature: isNonCurrent ? 'NON_CURRENT_LIABILITY' : 'CURRENT_LIABILITY',
      isSuspense: false,
      groupChain,
    };
  }

  // ASSET
  const sub = (acc.subCategory || '').toLowerCase();
  const main = (acc.mainGroup || '').toLowerCase();
  const isFixed =
    inferredFixedAsset !== undefined
      ? inferredFixedAsset
      : sub.includes('fixed') ||
        sub.includes('property') ||
        sub.includes('plant') ||
        sub.includes('equipment') ||
        main.includes('fixed') ||
        main.includes('property') ||
        main.includes('plant') ||
        main.includes('equipment');

  return {
    category: 'ASSET',
    nature: isFixed ? 'FIXED_ASSET' : 'CURRENT_ASSET',
    isSuspense,
    groupChain,
  };
}

export function getEffectiveAccountCategory(
  acc?: Account | null,
  accountGroups?: AccountGroup[]
): AccountCategory {
  return resolveAccountClassification(acc, accountGroups).category;
}

/**
 * Returns true strictly for Direct Expense ledgers (Trading A/c), explicitly excluding Indirect Expenses.
 * Traverses recursive AccountGroup hierarchy when provided.
 */
export function isDirectExpenseLedger(
  acc?: Account | null,
  accountGroups?: AccountGroup[]
): boolean {
  const cls = resolveAccountClassification(acc, accountGroups);
  return cls.category === 'EXPENSE' && cls.nature === 'TRADING_EXPENSE';
}

/**
 * Returns true strictly for Direct Revenue / Sales ledgers (Trading A/c), excluding Indirect Incomes.
 * Traverses recursive AccountGroup hierarchy when provided.
 */
export function isDirectRevenueLedger(
  acc?: Account | null,
  accountGroups?: AccountGroup[]
): boolean {
  const cls = resolveAccountClassification(acc, accountGroups);
  return cls.category === 'REVENUE' && cls.nature === 'TRADING_INCOME';
}

/**
 * Returns true for Non-Current Liabilities / Loans / Bank OD / Cash Credit ledgers.
 */
export function isNonCurrentLiabilityLedger(
  acc?: Account | null,
  accountGroups?: AccountGroup[]
): boolean {
  const cls = resolveAccountClassification(acc, accountGroups);
  return cls.category === 'LIABILITY' && cls.nature === 'NON_CURRENT_LIABILITY';
}

/**
 * Returns true strictly for Bank Account ledgers (excludes Cash in Hand / Petty Cash and non-asset accounts).
 */
export function isBankLedger(acc?: Account | null): boolean {
  if (!acc || acc.isGroup) return false;
  if (isCashLedger(acc)) return false;

  const cat = (acc.category || '').toUpperCase().trim();
  const sub = (acc.subCategory || '').toLowerCase().trim();
  const main = (acc.mainGroup || '').toLowerCase().trim();
  const name = (acc.name || '').toLowerCase().trim();

  // Allow Bank OD / Cash Credit liability accounts if explicitly marked
  if (
    cat === 'LIABILITY' &&
    (sub.includes('bank od') ||
      sub.includes('overdraft') ||
      main.includes('bank od') ||
      name.includes('overdraft') ||
      name.includes('od a/c') ||
      name.includes('cc a/c') ||
      name.includes('cash credit'))
  ) {
    return true;
  }

  if (cat !== 'ASSET') return false;
  if ((acc as any).type === 'BANK') return true;

  if (
    acc.id === 'acc_bank' ||
    acc.id === 'acc_hdfc' ||
    acc.id === 'acc_icici' ||
    acc.code === '1020' ||
    acc.code === '1030' ||
    acc.parentGroupId === 'grp_cash_bank' ||
    sub === 'cash & bank' ||
    sub === 'bank account' ||
    sub === 'bank accounts' ||
    main.includes('cash & bank') ||
    main.includes('cash and bank') ||
    main.includes('bank accounts')
  ) {
    return true;
  }

  if (
    name.includes('bank') ||
    name.includes('hdfc') ||
    name.includes('sbi') ||
    name.includes('icici') ||
    name.includes('axis') ||
    name.includes('kotak') ||
    name.includes('pnb') ||
    name.includes('bob') ||
    name.includes('canara') ||
    name.includes('union bank') ||
    name.includes('indusind') ||
    name.includes('idfc') ||
    name.includes('yes bank') ||
    name.includes('current a/c') ||
    name.includes('savings a/c')
  ) {
    return true;
  }

  return false;
}

/**
 * Returns true if the ledger is ANY Cash or Bank account (used to prohibit Cash/Bank in Journal Vouchers
 * and restrict Contra/Payment/Receipt money accounts).
 */
export function isCashOrBankLedger(acc?: Account | null): boolean {
  return isCashLedger(acc) || isBankLedger(acc);
}

export function isBankAccount(acc: Account): boolean {
  return isCashOrBankLedger(acc);
}

export interface SettlementLedgerLeg {
  account: Account;
  amount: number;
  modeLabel: string;
}

const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n: number): number => Math.round((Number(n) || 0) * 10000) / 10000;

/**
 * Computes an automatic Round Off ledger posting whenever a document's double-entry totals
 * have a sub-rupee rounding remainder (< ₹1.00 and >= ₹0.0001).
 */
export function getAutoRoundOffAdjustment(
  totalDebit: number,
  totalCredit: number
): { debit: number; credit: number } | null {
  const diff = round4((Number(totalDebit) || 0) - (Number(totalCredit) || 0));
  if (Math.abs(diff) < 0.0001 || Math.abs(diff) >= 1.0) return null;
  if (diff > 0) {
    return { debit: 0, credit: diff };
  }
  return { debit: round4(Math.abs(diff)), credit: 0 };
}

/**
 * Normalizes a Voucher's entries by automatically routing any sub-rupee rounding remainder (< ₹1)
 * to the Round Off Account (`acc_round_off`) so Total Debit === Total Credit within < 0.001.
 */
export function normalizeVoucherWithRoundOff(voucher: Voucher, accounts?: Account[]): Voucher {
  const entries = (voucher.entries || []).map(l => ({ ...l }));
  if (voucher.type === 'CONTRA' || entries.length === 0) return voucher;

  let totalDr = 0;
  let totalCr = 0;
  for (const line of entries) {
    totalDr += Number(line.debit) || 0;
    totalCr += Number(line.credit) || 0;
  }

  const autoRo = getAutoRoundOffAdjustment(totalDr, totalCr);
  if (!autoRo) return voucher;

  const roAcc = (accounts || []).find(a => a.id === 'acc_round_off');
  const existingRoIdx = entries.findIndex(e => e.accountId === 'acc_round_off');

  if (existingRoIdx >= 0) {
    const prev = entries[existingRoIdx];
    const netDr = round4((Number(prev.debit) || 0) + autoRo.debit - (Number(prev.credit) || 0) - autoRo.credit);
    if (Math.abs(netDr) < 0.0001) {
      entries.splice(existingRoIdx, 1);
    } else if (netDr > 0) {
      entries[existingRoIdx] = { ...prev, debit: netDr, credit: 0 };
    } else {
      entries[existingRoIdx] = { ...prev, debit: 0, credit: round4(Math.abs(netDr)) };
    }
  } else {
    entries.push({
      id: `ro_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      accountId: 'acc_round_off',
      accountName: roAcc?.name || 'Round Off Account (राउंड ऑफ)',
      accountCode: roAcc?.code || '5990',
      debit: autoRo.debit,
      credit: autoRo.credit,
      narration: 'Auto sub-rupee rounding adjustment'
    });
  }

  const normalizedTotal = round2(entries.reduce((s, e) => s + (Number(e.debit) || 0), 0));
  return {
    ...voucher,
    entries,
    totalAmount: normalizedTotal
  };
}

export function getCashLedgers(data: AppData): Account[] {
  return (data.accounts || []).filter(isCashLedger);
}

export function getBankLedgers(data: AppData): Account[] {
  return (data.accounts || []).filter(isBankLedger);
}

export function getCashAndBankLedgers(data: AppData): Account[] {
  return (data.accounts || []).filter(isCashOrBankLedger);
}

export function isImmediateMoneyMode(mode?: string): boolean {
  const m = (mode || '').trim().toUpperCase();
  if (!m) return false;
  if (m === 'CREDIT' || m === 'UNPAID' || m === 'ON_CREDIT' || m === 'PAY_LATER') return false;
  return true;
}

export function isBankPaymentMode(mode?: string): boolean {
  const m = (mode || '').trim().toLowerCase();
  if (!m) return false;
  if (m === 'cash' || m === 'petty cash') return false;
  return (
    m.includes('upi') ||
    m.includes('card') ||
    m.includes('bank') ||
    m.includes('neft') ||
    m.includes('rtgs') ||
    m.includes('imps') ||
    m.includes('cheque') ||
    m.includes('chq') ||
    m.includes('hdfc') ||
    m.includes('icici') ||
    m.includes('sbi') ||
    m.includes('axis') ||
    m.includes('kotak') ||
    m.includes('online') ||
    m.includes('razorpay')
  );
}

export function resolveCashLedgerAccount(data: AppData, preferredId?: string): Account {
  const accounts = data.accounts || [];
  if (preferredId) {
    const byId = accounts.find(a => a.id === preferredId && isCashLedger(a));
    if (byId) return byId;
  }
  const bySystem = accounts.find(a => a.id === 'acc_cash');
  if (bySystem) return bySystem;
  const firstCash = accounts.find(isCashLedger);
  if (firstCash) return firstCash;
  return {
    id: 'acc_cash',
    code: '1010',
    name: 'Cash in Hand',
    category: 'ASSET',
    subCategory: 'Cash & Bank',
    mainGroup: 'Cash & Bank Accounts',
    openingBalance: 0,
    balanceType: 'DR',
    isSystem: true,
  };
}

export function resolveBankLedgerAccount(
  data: AppData,
  preferredId?: string,
  modeHint?: string
): Account {
  const accounts = data.accounts || [];
  const banks = accounts.filter(isBankLedger);
  if (preferredId) {
    const byId = accounts.find(a => a.id === preferredId && isBankLedger(a));
    if (byId) return byId;
  }
  const hint = (modeHint || '').trim().toLowerCase();
  if (hint && hint.length >= 3 && !['upi', 'card', 'bank', 'bank_transfer', 'cheque'].includes(hint)) {
    const nameMatched = banks.find(b => (b.name || '').toLowerCase().includes(hint));
    if (nameMatched) return nameMatched;
  }
  const preferredDefault =
    banks.find(a => a.id === 'acc_bank') ||
    banks.find(a => a.id === 'acc_hdfc') ||
    banks[0];
  if (preferredDefault) return preferredDefault;
  return {
    id: 'acc_bank',
    code: '1020',
    name: 'Bank Account',
    category: 'ASSET',
    subCategory: 'Cash & Bank',
    mainGroup: 'Cash & Bank Accounts',
    openingBalance: 0,
    balanceType: 'DR',
    isSystem: true,
  };
}

export function hasLinkedReceiptVoucherForInvoice(data: AppData, inv: SalesInvoice): boolean {
  const invNo = (inv.invoiceNumber || '').trim().toLowerCase();
  const pId = inv.partyId;
  const pNameLow = (inv.partyName || '').trim().toLowerCase();
  return (data.vouchers || []).some(v => {
    if ((v as any).isOptional || (v as any).isCancelled) return false;
    if (v.type !== 'RECEIPT') return false;
    if (v.linkedInvoiceId && v.linkedInvoiceId === inv.id) return true;
    const sameParty =
      (pId && v.partyId === pId) ||
      (pNameLow && v.partyName && v.partyName.trim().toLowerCase() === pNameLow);
    if (!sameParty || !invNo) return false;
    return (
      (v.referenceNo && v.referenceNo.trim().toLowerCase() === invNo) ||
      (v.narration && v.narration.toLowerCase().includes(invNo))
    );
  });
}

export function hasLinkedPaymentVoucherForPurchase(data: AppData, pur: PurchaseInvoice): boolean {
  const billNo = (pur.billNumber || '').trim().toLowerCase();
  const suppNo = (pur.supplierInvoiceNo || '').trim().toLowerCase();
  const pId = pur.partyId || (pur as any).vendorId;
  const pNameLow = (pur.partyName || '').trim().toLowerCase();
  return (data.vouchers || []).some(v => {
    if ((v as any).isOptional || (v as any).isCancelled) return false;
    if (v.type !== 'PAYMENT') return false;
    if (v.linkedPurchaseId && v.linkedPurchaseId === pur.id) return true;
    const sameParty =
      (pId && v.partyId === pId) ||
      (pNameLow && v.partyName && v.partyName.trim().toLowerCase() === pNameLow);
    if (!sameParty) return false;
    const refLow = (v.referenceNo || '').trim().toLowerCase();
    const narLow = (v.narration || '').toLowerCase();
    if (billNo && (refLow === billNo || narLow.includes(billNo))) return true;
    if (suppNo && (refLow === suppNo || narLow.includes(suppNo))) return true;
    return false;
  });
}

/**
 * Resolves exact Cash-in-Hand / Bank Account / Sundry Debtors legs for a Sales Invoice or POS Bill.
 * Guarantees sum(legs.amount) + debtorsAmount === inv.grandTotal.
 */
export function resolveSalesInvoiceSettlement(
  data: AppData,
  inv: SalesInvoice
): { legs: SettlementLedgerLeg[]; debtorsAmount: number } {
  const grandTotal = Math.max(0, round2(inv.grandTotal || 0));
  if (inv.status === 'CANCELLED' || grandTotal <= 0) {
    return { legs: [], debtorsAmount: grandTotal };
  }

  // If a separate Receipt Voucher already clears this invoice, keep full bill on Debtors so Cash/Bank is not double-counted
  if (hasLinkedReceiptVoucherForInvoice(data, inv)) {
    return { legs: [], debtorsAmount: grandTotal };
  }

  const accounts = data.accounts || [];
  const preferredAcc = inv.paymentAccountId ? accounts.find(a => a.id === inv.paymentAccountId) : undefined;
  const legs: SettlementLedgerLeg[] = [];

  if (inv.paymentBreakdown) {
    const rawCash = Math.max(0, Number(inv.paymentBreakdown.cash) || 0);
    const rawBank = Math.max(0, (Number(inv.paymentBreakdown.upi) || 0) + (Number(inv.paymentBreakdown.card) || 0));
    const cashAmt = round2(Math.min(grandTotal, rawCash));
    const bankAmt = round2(Math.min(Math.max(0, grandTotal - cashAmt), rawBank));

    if (cashAmt > 0.001) {
      const cashAcc =
        preferredAcc && isCashLedger(preferredAcc)
          ? preferredAcc
          : resolveCashLedgerAccount(data, inv.paymentAccountId);
      legs.push({ account: cashAcc, amount: cashAmt, modeLabel: 'Cash' });
    }
    if (bankAmt > 0.001) {
      const bankAcc =
        preferredAcc && isBankLedger(preferredAcc)
          ? preferredAcc
          : resolveBankLedgerAccount(data, inv.paymentAccountId, inv.paymentMode);
      const bankMode =
        (inv.paymentBreakdown.upi || 0) > 0 && (inv.paymentBreakdown.card || 0) > 0
          ? 'UPI + Card'
          : (inv.paymentBreakdown.upi || 0) > 0
          ? 'UPI'
          : inv.paymentMode || 'Card / Bank';
      legs.push({ account: bankAcc, amount: bankAmt, modeLabel: bankMode });
    }

    if (legs.length > 0) {
      const settled = round2(legs.reduce((s, l) => s + l.amount, 0));
      const debtorsAmount = Math.max(0, round2(grandTotal - settled));
      return { legs, debtorsAmount };
    }
  }

  const rawPaid = round2(Math.max(0, Number(inv.amountPaid) || 0));
  const settledAmt =
    rawPaid > 0.001
      ? Math.min(grandTotal, rawPaid)
      : inv.status === 'PAID' || isImmediateMoneyMode(inv.paymentMode)
      ? grandTotal
      : 0;

  if (settledAmt > 0.001) {
    let targetAcc: Account;
    if (preferredAcc && isCashOrBankLedger(preferredAcc)) {
      targetAcc = preferredAcc;
    } else if (isBankPaymentMode(inv.paymentMode) || isBankPaymentMode(inv.advanceNote)) {
      targetAcc = resolveBankLedgerAccount(data, inv.paymentAccountId, inv.paymentMode);
    } else {
      targetAcc = resolveCashLedgerAccount(data, inv.paymentAccountId);
    }
    const modeLabel = inv.paymentMode || (isCashLedger(targetAcc) ? 'Cash' : 'Bank');
    legs.push({ account: targetAcc, amount: settledAmt, modeLabel });
  }

  const debtorsAmount = Math.max(0, round2(grandTotal - settledAmt));
  return { legs, debtorsAmount };
}

/**
 * Resolves exact Cash-in-Hand / Bank Account / Sundry Creditors legs for a Purchase or Expense Bill.
 * Guarantees sum(legs.amount) + creditorsAmount === pur.grandTotal.
 */
export function resolvePurchaseBillSettlement(
  data: AppData,
  pur: PurchaseInvoice
): { legs: SettlementLedgerLeg[]; creditorsAmount: number } {
  const grandTotal = Math.max(0, round2(pur.grandTotal || 0));
  if (pur.status === 'CANCELLED' || grandTotal <= 0) {
    return { legs: [], creditorsAmount: grandTotal };
  }

  if (hasLinkedPaymentVoucherForPurchase(data, pur)) {
    return { legs: [], creditorsAmount: grandTotal };
  }

  const rawPaid = round2(Math.max(0, Number(pur.amountPaid) || 0));
  const settledAmt =
    rawPaid > 0.001
      ? Math.min(grandTotal, rawPaid)
      : pur.status === 'PAID' || isImmediateMoneyMode(pur.paymentMode)
      ? grandTotal
      : 0;

  const legs: SettlementLedgerLeg[] = [];
  if (settledAmt > 0.001) {
    const accounts = data.accounts || [];
    const preferredAcc = pur.paymentAccountId ? accounts.find(a => a.id === pur.paymentAccountId) : undefined;
    let targetAcc: Account;
    if (preferredAcc && isCashOrBankLedger(preferredAcc)) {
      targetAcc = preferredAcc;
    } else if (isBankPaymentMode(pur.paymentMode)) {
      targetAcc = resolveBankLedgerAccount(data, pur.paymentAccountId, pur.paymentMode);
    } else {
      targetAcc = resolveCashLedgerAccount(data, pur.paymentAccountId);
    }
    const modeLabel = pur.paymentMode || (isCashLedger(targetAcc) ? 'Cash' : 'Bank');
    legs.push({ account: targetAcc, amount: settledAmt, modeLabel });
  }

  const creditorsAmount = Math.max(0, round2(grandTotal - settledAmt));
  return { legs, creditorsAmount };
}

/**
 * Computes the available net balance of a ledger account (positive = DR, negative = CR),
 * optionally excluding a voucher being edited so balance checks don't double-count it.
 */
export function getLedgerAvailableBalance(
  accountId: string,
  data: AppData,
  excludeVoucherId?: string
): { netBalance: number; balanceType: 'DR' | 'CR'; signedDrBalance: number } {
  const effectiveData = excludeVoucherId
    ? { ...data, vouchers: (data.vouchers || []).filter(v => v.id !== excludeVoucherId) }
    : data;
  const bal = calculateAccountBalances(effectiveData).get(accountId);
  if (!bal) return { netBalance: 0, balanceType: 'DR', signedDrBalance: 0 };
  const signedDrBalance = bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance;
  return {
    netBalance: bal.netBalance,
    balanceType: bal.balanceType,
    signedDrBalance: Math.round(signedDrBalance * 100) / 100
  };
}

/**
 * Checks whether a transaction date falls on or before the configured Books Lock / Freeze date.
 */
export function isDateLockedByBooksLock(dateStr?: string, booksLockDate?: string): boolean {
  if (!booksLockDate || !booksLockDate.trim()) return false;
  const txIso = normalizeDateISO(dateStr);
  const lockIso = normalizeDateISO(booksLockDate);
  if (!txIso || !lockIso) return false;
  return txIso <= lockIso;
}

export interface AccountingValidationResult {
  valid: boolean;
  errors: Array<{ en: string; hi: string }>;
  warnings: Array<{ en: string; hi: string }>;
}

/**
 * Centralized Indian Accounting Standards & Double-Entry Rules Validator for ALL Vouchers
 * (JOURNAL, PAYMENT, RECEIPT, CONTRA).
 */
export function validateVoucherAccountingRules(
  voucher: Voucher,
  data: AppData,
  activeFYStart?: string,
  config?: Partial<AppConfiguration>,
  editingVoucherId?: string
): AccountingValidationResult {
  const errors: Array<{ en: string; hi: string }> = [];
  const warnings: Array<{ en: string; hi: string }> = [];

  const fyRange = getFinancialYearRange(activeFYStart || data.company?.financialYearStart);
  const effectiveEditId = editingVoucherId || (data.vouchers.some(v => v.id === voucher.id) ? voucher.id : undefined);

  // 1. Voucher Number Required & Unique
  if (!voucher.voucherNumber || !voucher.voucherNumber.trim()) {
    errors.push({
      en: 'Voucher Number is required.',
      hi: 'वाउचर नंबर आवश्यक है।'
    });
  } else {
    const duplicate = (data.vouchers || []).some(
      v =>
        v.id !== effectiveEditId &&
        v.voucherNumber.trim().toLowerCase() === voucher.voucherNumber.trim().toLowerCase()
    );
    if (duplicate) {
      errors.push({
        en: `Duplicate Voucher Number "${voucher.voucherNumber}" already exists.`,
        hi: `वाउचर नंबर "${voucher.voucherNumber}" पहले से मौजूद है।`
      });
    }
  }

  // 2. Date within Active Financial Year & not prior to Books Beginning / Books Lock Date
  const normDate = normalizeDateISO(voucher.date);
  if (!normDate || !isDateInFinancialYear(normDate, fyRange.fyStart)) {
    errors.push({
      en: `Out-of-FY Date (${voucher.date}): Transaction must fall within active ${fyRange.label} (${fyRange.displayRange}).`,
      hi: `अमान्य तिथि (${voucher.date}): वाउचर सक्रिय वित्तीय वर्ष ${fyRange.label} (${fyRange.displayRange}) के भीतर होना चाहिए।`
    });
  } else {
    if (config?.booksLockDate && isDateLockedByBooksLock(normDate, config.booksLockDate)) {
      errors.push({
        en: `Books Locked: Transactions on or before ${config.booksLockDate} are frozen in Settings.`,
        hi: `लेखा पुस्तकें लॉक हैं: ${config.booksLockDate} या उससे पहले की तिथि में प्रविष्टि/बदलाव वर्जित है।`
      });
    }
    const booksStartIso = normalizeDateISO(data.company?.booksBeginningFrom);
    if (
      booksStartIso &&
      getFinancialYearStartForDate(booksStartIso) === fyRange.fyStart &&
      normDate < booksStartIso
    ) {
      errors.push({
        en: `Date (${normDate}) cannot be earlier than Books Beginning From date (${booksStartIso}).`,
        hi: `तिथि (${normDate}) लेखा प्रारंभ तिथि (${booksStartIso}) से पहले की नहीं हो सकती।`
      });
    }
  }

  // 3. Double-Entry Line Integrity
  const entries = voucher.entries || [];
  if (entries.length < 2) {
    errors.push({
      en: 'Double-entry requires at least 2 ledger lines (Debit and Credit).',
      hi: 'दोहरा लेखा (Double-Entry) के लिए कम से कम 2 खाते (डेबिट और क्रेडिट) आवश्यक हैं।'
    });
  }

  const accMap = new Map((data.accounts || []).map(a => [a.id, a]));
  const drAccounts = new Set<string>();
  const crAccounts = new Set<string>();
  let totalDr = 0;
  let totalCr = 0;

  for (const line of entries) {
    const dr = Number(line.debit) || 0;
    const cr = Number(line.credit) || 0;

    if (dr < 0 || cr < 0) {
      errors.push({
        en: 'Debit and Credit amounts cannot be negative.',
        hi: 'डेबिट और क्रेडिट राशि ऋणात्मक (Negative) नहीं हो सकती।'
      });
      break;
    }
    if (dr > 0 && cr > 0) {
      errors.push({
        en: `Line "${line.accountName || line.accountId}" cannot have both Debit and Credit amounts simultaneously.`,
        hi: `एक ही पंक्ति "${line.accountName || line.accountId}" में डेबिट और क्रेडिट दोनों राशि एक साथ नहीं हो सकतीं।`
      });
      break;
    }
    if (dr === 0 && cr === 0) {
      errors.push({
        en: `Empty/Zero line found for "${line.accountName || line.accountId}". Remove zero-amount rows.`,
        hi: `"${line.accountName || line.accountId}" की राशि ₹0 है — कृपया 0 रुपये वाली पंक्ति हटाएँ या राशि भरें।`
      });
      break;
    }

    const acc = accMap.get(line.accountId);
    if (!acc) {
      errors.push({
        en: `Invalid ledger selected ("${line.accountName || line.accountId}"). Please choose an active Chart of Accounts ledger.`,
        hi: `अमान्य लेजर खाता ("${line.accountName || line.accountId}") — कृपया Chart of Accounts से मान्य खाता चुनें।`
      });
      continue;
    }
    if (acc.isGroup) {
      errors.push({
        en: `Group heading "${acc.name}" cannot be posted directly. Select a ledger account.`,
        hi: `ग्रुप शीर्षक "${acc.name}" में सीधे प्रविष्टि नहीं की जा सकती — कृपया लेजर खाता चुनें।`
      });
    }

    if (dr > 0) drAccounts.add(acc.id);
    if (cr > 0) crAccounts.add(acc.id);

    totalDr += dr;
    totalCr += cr;
  }

  // Self-posting (same account debited & credited in the same voucher)
  for (const id of drAccounts) {
    if (crAccounts.has(id)) {
      const accName = accMap.get(id)?.name || id;
      errors.push({
        en: `Same ledger "${accName}" cannot be both Debited and Credited in the same voucher.`,
        hi: `एक ही वाउचर में खाता "${accName}" को डेबिट और क्रेडिट दोनों नहीं किया जा सकता!`
      });
    }
  }

  if (totalDr <= 0 || Math.abs(totalDr - totalCr) >= 0.001) {
    errors.push({
      en: `Unbalanced Double Entry: Total Debit (${totalDr.toFixed(2)}) must equal Total Credit (${totalCr.toFixed(2)}) and exceed zero.`,
      hi: `असंतुलित प्रविष्टि: कुल डेबिट (${totalDr.toFixed(2)}) और कुल क्रेडिट (${totalCr.toFixed(2)}) बराबर तथा ₹0 से अधिक होने चाहिए।`
    });
  }

  // 4. Voucher-Type Specific Accounting Golden Rules
  const resolvedLedgers = entries
    .map(l => ({ line: l, acc: accMap.get(l.accountId) }))
    .filter((x): x is { line: typeof entries[number]; acc: Account } => Boolean(x.acc));

  if (voucher.type === 'JOURNAL') {
    const forbiddenCashOrBank = resolvedLedgers.filter(x => isCashOrBankLedger(x.acc));
    if (forbiddenCashOrBank.length > 0) {
      const names = forbiddenCashOrBank.map(x => x.acc.name).join(', ');
      errors.push({
        en: `Journal Rule Violation: Cash/Bank ledger (${names}) cannot be used in a Journal Voucher! Use Payment (F5), Receipt (F6), or Contra (F4) instead.`,
        hi: `जर्नल वाउचर नियम उल्लंघन: नकद/बैंक खाता (${names}) जर्नल वाउचर में वर्जित है! नकद या बैंक लेनदेन के लिए Payment (F5), Receipt (F6) या Contra (F4) का उपयोग करें।`
      });
    }
  } else if (voucher.type === 'CONTRA') {
    const nonCashOrBank = resolvedLedgers.filter(x => !isCashOrBankLedger(x.acc));
    if (nonCashOrBank.length > 0) {
      const names = nonCashOrBank.map(x => x.acc.name).join(', ');
      errors.push({
        en: `Contra Rule Violation: Only Cash and Bank ledgers are allowed in Contra Vouchers (found: ${names}). Use Payment/Receipt/Journal for other accounts.`,
        hi: `कॉण्ट्रा वाउचर नियम उल्लंघन: कॉण्ट्रा वाउचर में केवल कैश और बैंक खाते ही मान्य हैं (${names} अमान्य है)।`
      });
    }
  } else if (voucher.type === 'PAYMENT') {
    const crLines = resolvedLedgers.filter(x => (x.line.credit || 0) > 0);
    const drLines = resolvedLedgers.filter(x => (x.line.debit || 0) > 0);

    if (crLines.some(x => !isCashOrBankLedger(x.acc))) {
      const bad = crLines.filter(x => !isCashOrBankLedger(x.acc)).map(x => x.acc.name).join(', ');
      errors.push({
        en: `Payment Rule Violation: Credit (Paid From) ledger must be a Cash or Bank account (found: ${bad}).`,
        hi: `पेमेंट वाउचर नियम: भुगतान स्रोत (Credit / Paid From) केवल कैश या बैंक खाता होना चाहिए (${bad} अमान्य है)।`
      });
    }
    if (drLines.some(x => isCashOrBankLedger(x.acc))) {
      const bad = drLines.filter(x => isCashOrBankLedger(x.acc)).map(x => x.acc.name).join(', ');
      errors.push({
        en: `Payment Rule Violation: Debit (Paid To) ledger cannot be Cash/Bank (${bad}). Use a Contra Voucher (F4) for Cash-Bank or Bank-Bank transfers.`,
        hi: `पेमेंट वाउचर नियम: नामे खाता (${bad}) कैश या बैंक नहीं हो सकता! कैश व बैंक के बीच ट्रांसफर के लिए Contra Voucher (F4) का उपयोग करें।`
      });
    }
    if (voucher.paymentMode === 'CASH' && crLines.some(x => isBankLedger(x.acc))) {
      errors.push({
        en: 'Mode Mismatch: Cash payment mode requires a Cash in Hand / Petty Cash ledger, not a Bank Account.',
        hi: 'माध्यम असंगति: Cash भुगतान माध्यम के लिए कैश (Cash in Hand) खाता चुनें, बैंक खाता नहीं।'
      });
    }
    if (
      voucher.paymentMode &&
      voucher.paymentMode !== 'CASH' &&
      crLines.some(x => isCashLedger(x.acc))
    ) {
      errors.push({
        en: `Mode Mismatch: ${voucher.paymentMode} payment mode requires a Bank Account ledger, not Cash in Hand.`,
        hi: `माध्यम असंगति: ${voucher.paymentMode} माध्यम के लिए बैंक खाता चुनें, Cash in Hand नहीं।`
      });
    }
  } else if (voucher.type === 'RECEIPT') {
    const drLines = resolvedLedgers.filter(x => (x.line.debit || 0) > 0);
    const crLines = resolvedLedgers.filter(x => (x.line.credit || 0) > 0);

    if (drLines.some(x => !isCashOrBankLedger(x.acc))) {
      const bad = drLines.filter(x => !isCashOrBankLedger(x.acc)).map(x => x.acc.name).join(', ');
      errors.push({
        en: `Receipt Rule Violation: Debit (Received Into) ledger must be a Cash or Bank account (found: ${bad}).`,
        hi: `रसीद वाउचर नियम: प्राप्ति खाता (Debit / Received Into) केवल कैश या बैंक खाता होना चाहिए (${bad} अमान्य है)।`
      });
    }
    if (crLines.some(x => isCashOrBankLedger(x.acc))) {
      const bad = crLines.filter(x => isCashOrBankLedger(x.acc)).map(x => x.acc.name).join(', ');
      errors.push({
        en: `Receipt Rule Violation: Credit (Received From) ledger cannot be Cash/Bank (${bad}). Use a Contra Voucher (F4) for Cash-Bank deposits/withdrawals.`,
        hi: `रसीद वाउचर नियम: जमा खाता (${bad}) कैश या बैंक नहीं हो सकता! कैश व बैंक के बीच जमा/निकासी के लिए Contra Voucher (F4) का उपयोग करें।`
      });
    }
    if (voucher.paymentMode === 'CASH' && drLines.some(x => isBankLedger(x.acc))) {
      errors.push({
        en: 'Mode Mismatch: Cash receipt mode requires a Cash in Hand / Petty Cash ledger, not a Bank Account.',
        hi: 'माध्यम असंगति: Cash रसीद के लिए कैश (Cash in Hand) खाता चुनें, बैंक खाता नहीं।'
      });
    }
    if (
      voucher.paymentMode &&
      voucher.paymentMode !== 'CASH' &&
      drLines.some(x => isCashLedger(x.acc))
    ) {
      errors.push({
        en: `Mode Mismatch: ${voucher.paymentMode} receipt mode requires a Bank Account ledger, not Cash in Hand.`,
        hi: `माध्यम असंगति: ${voucher.paymentMode} माध्यम के लिए बैंक खाता चुनें, Cash in Hand नहीं।`
      });
    }
  }

  // 5. Negative Cash in Hand Protection (Cash never physically has a Credit balance)
  if (config?.negativeCashWarning !== false) {
    for (const { line, acc } of resolvedLedgers) {
      if ((line.credit || 0) > 0 && isCashLedger(acc)) {
        const bal = getLedgerAvailableBalance(acc.id, data, effectiveEditId);
        const resultingCash = Math.round((bal.signedDrBalance - (line.credit || 0)) * 100) / 100;
        if (resultingCash < -0.01) {
          errors.push({
            en: `Negative Cash Prohibited: "${acc.name}" only has ${bal.signedDrBalance.toLocaleString('en-IN')} available; cannot pay/withdraw ${(line.credit || 0).toLocaleString('en-IN')} in cash.`,
            hi: `नेगेटिव कैश वर्जित: "${acc.name}" में केवल ₹${bal.signedDrBalance.toLocaleString('en-IN')} नकद शेष उपलब्ध है; ₹${(line.credit || 0).toLocaleString('en-IN')} की नकद निकासी/भुगतान संभव नहीं है।`
          });
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function getFinancialSummary(data: AppData): FinancialSummary {
  const accountBalances = calculateAccountBalances(data);
  const groups = data.accountGroups;

  let totalSalesFromInvoices = 0;
  let totalReceivables = 0;
  for (const inv of data.invoices) {
    if (inv.status !== 'CANCELLED') {
      totalSalesFromInvoices += inv.grandTotal;
      totalReceivables += (inv.grandTotal - (inv.amountPaid || 0));
    }
  }

  const debtorsBal = accountBalances.get('acc_debtors')?.netBalance || 0;
  totalReceivables = Math.max(totalReceivables, debtorsBal);

  const creditorsBal = accountBalances.get('acc_creditors')?.netBalance || 0;
  let totalPayables = creditorsBal;

  let totalPurchasesFromBills = 0;
  if (data.purchaseInvoices && data.purchaseInvoices.length > 0) {
    let purUnpaid = 0;
    for (const pur of data.purchaseInvoices) {
      if (pur.status !== 'CANCELLED') {
        totalPurchasesFromBills += pur.grandTotal;
        purUnpaid += (pur.grandTotal - (pur.amountPaid || 0));
      }
    }
    totalPayables = Math.max(totalPayables, purUnpaid);
  }

  // Cash & Bank (Comprehensive detection for all bank/cash ledgers including dynamically created cash/bank accounts)
  let cashAndBankBalance = 0;
  for (const acc of mergeAccountsWithBalancesMap(data, accountBalances)) {
    if (isBankAccount(acc)) {
      const bal = accountBalances.get(acc.id);
      if (bal) {
        cashAndBankBalance += (bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance);
      }
    }
  }

  // Revenue vs Expense & Trading Sales/Purchases across ALL non-optional vouchers, bills & notes
  let totalRevenue = 0;
  let totalExpenses = 0;
  let ledgerDirectSales = 0;
  let ledgerDirectPurchases = 0;

  for (const bal of accountBalances.values()) {
    const acc = bal.account;
    if (!acc) continue;
    const effCat = getEffectiveAccountCategory(acc, groups);
    if (effCat === 'REVENUE') {
      const netVal = bal.balanceType === 'CR' ? bal.netBalance : -bal.netBalance;
      totalRevenue += netVal;
      if (isDirectRevenueLedger(acc, groups)) {
        ledgerDirectSales += netVal;
      }
    } else if (effCat === 'EXPENSE') {
      const netVal = bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance;
      totalExpenses += netVal;
      if (isDirectExpenseLedger(acc, groups)) {
        ledgerDirectPurchases += netVal;
      }
    }
  }

  // Include Closing Stock & Opening Stock for accurate P&L Net Profit calculation
  const closingStock = calculateClosingStock(data);
  const openingStock = getEffectiveOpeningStock(data);

  const netProfit = (totalRevenue + closingStock) - (totalExpenses + openingStock);

  // Calculate Net GST & Statutory Tax Payable from Account Balances
  let outputGstLedger = 0;
  let inputGstLedger = 0;
  let tdsPayableLedger = 0;
  let otherDutiesAndTaxesPayable = 0;

  let hasTaxLedgerEntries = false;

  for (const bal of accountBalances.values()) {
    const acc = bal.account;
    if (!acc) continue;

    const effCat = getEffectiveAccountCategory(acc, groups);
    const sub = (acc.subCategory || '').toLowerCase();
    const main = (acc.mainGroup || '').toLowerCase();
    const name = (acc.name || '').toLowerCase();
    const id = (acc.id || '').toLowerCase();

    // Output GST accounts (Liabilities)
    if (id === 'acc_gst_cgst' || id === 'acc_gst_sgst' || id === 'acc_gst_igst' || id === 'acc_gst_cess' || (effCat === 'LIABILITY' && (name.includes('output gst') || name.includes('gst payable')))) {
      hasTaxLedgerEntries = true;
      const netVal = bal.balanceType === 'CR' ? bal.netBalance : -bal.netBalance;
      outputGstLedger += Math.max(0, netVal);
    } 
    // Input Tax Credit accounts (Assets)
    else if (id === 'acc_itc_cgst' || id === 'acc_itc_sgst' || id === 'acc_itc_igst' || id === 'acc_itc_cess' || (effCat === 'ASSET' && (name.includes('input tax') || name.includes('itc')))) {
      hasTaxLedgerEntries = true;
      const netVal = bal.balanceType === 'DR' ? bal.netBalance : -bal.netBalance;
      inputGstLedger += Math.max(0, netVal);
    }
    // TDS / TCS & Statutory Duties & Taxes Liabilities
    else if (effCat === 'LIABILITY' && (id.includes('tds') || name.includes('tds') || sub.includes('duties') || main.includes('duties') || sub.includes('statutory'))) {
      const netVal = bal.balanceType === 'CR' ? bal.netBalance : -bal.netBalance;
      if (netVal > 0) {
        if (id.includes('tds') || name.includes('tds')) {
          tdsPayableLedger += netVal;
        } else {
          otherDutiesAndTaxesPayable += netVal;
        }
      }
    }
  }

  // Invoice-level tax fallback (only if no ledger output/input balances exist)
  let invOutputTax = 0;
  for (const inv of data.invoices) {
    if (inv.status !== 'CANCELLED') {
      invOutputTax += ((inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0) + (inv.cessAmount || 0));
    }
  }

  let purInputTax = 0;
  if (data.purchaseInvoices) {
    for (const pur of data.purchaseInvoices) {
      if (pur.status !== 'CANCELLED') {
        purInputTax += ((pur.cgstAmount || 0) + (pur.sgstAmount || 0) + (pur.igstAmount || 0) + (pur.cessAmount || 0));
      }
    }
  }

  const finalOutputGst = hasTaxLedgerEntries ? outputGstLedger : invOutputTax;
  const finalInputGst = hasTaxLedgerEntries ? inputGstLedger : purInputTax;

  const netGstPayable = Math.max(0, finalOutputGst - finalInputGst);
  const totalTaxPayable = netGstPayable + tdsPayableLedger + otherDutiesAndTaxesPayable;

  const unreconciledBankCount = data.bankStatements.filter(b => !b.reconciled).length;

  const totalSales = Math.round((ledgerDirectSales !== 0 ? ledgerDirectSales : totalSalesFromInvoices) * 100) / 100;
  const totalPurchases = Math.round((ledgerDirectPurchases !== 0 ? ledgerDirectPurchases : totalPurchasesFromBills) * 100) / 100;

  return {
    totalSales,
    totalCollected: Math.max(0, Math.round((totalSales - totalReceivables) * 100) / 100),
    totalReceivables,
    totalPayables,
    cashAndBankBalance,
    netProfit,
    totalExpenses,
    totalPurchases,
    totalTaxPayable,
    unreconciledBankCount
  };
}

/**
 * Creates a new company profile for a new Financial Year with Closing Balances carried forward as Opening Balances
 */
export function performFinancialYearShift(data: AppData, newFYStart: string): { newCompany: CompanyDetails; newAccounts: Account[]; newParties: PartyMaster[] } {
  const accountBalances = calculateAccountBalances(data);

  // 1. Carried Forward Accounts with updated Opening Balances
  const newAccounts: Account[] = data.accounts.map(acc => {
    const bal = accountBalances.get(acc.id);
    if (!bal) return { ...acc };
    return {
      ...acc,
      openingBalance: Math.round(bal.netBalance * 100) / 100,
      balanceType: bal.balanceType
    };
  });

  // 2. Carried Forward Parties with updated Opening Balances
  const newParties: PartyMaster[] = data.parties.map(p => {
    const out = calculatePartyOutstanding(p, data);
    return {
      ...p,
      openingBalance: Math.round(out.netBalance * 100) / 100,
      openingBalanceType: out.balanceType,
      balanceType: out.balanceType
    };
  });

  const currentFYYear = Number(newFYStart.split('-')[0]) || 2027;
  const baseName = data.company.name.replace(/\s*\(FY\s*\d{4}-\d{2}\)/gi, '');
  const newCompanyName = `${baseName} (FY ${currentFYYear}-${(currentFYYear + 1).toString().slice(-2)})`;

  const newCompany: CompanyDetails = {
    ...data.company,
    id: 'cmp_' + Date.now(),
    name: newCompanyName,
    financialYearStart: newFYStart,
    booksBeginningFrom: newFYStart
  };

  return {
    newCompany,
    newAccounts,
    newParties
  };
}

export interface PartyOutstanding {
  netBalance: number;
  balanceType: 'DR' | 'CR';
  signedBalance: number;
  totalInvoiced: number;
  totalPaid: number;
  pendingInvoicesCount: number;
}

export function calculatePartyOutstanding(party: PartyMaster, data: AppData): PartyOutstanding {
  // Opening balance sign: DR is positive (receivable), CR is negative (payable)
  let net = party.balanceType === 'DR' ? (party.openingBalance || 0) : -(party.openingBalance || 0);
  let totalInvoiced = 0;
  let totalPaid = 0;
  let pendingInvoicesCount = 0;

  // 1. Sales Invoices
  for (const inv of data.invoices || []) {
    if (inv.status === 'CANCELLED') continue;
    if (inv.partyId === party.id || (inv.partyName && inv.partyName.toLowerCase() === party.name.toLowerCase())) {
      const unpaid = inv.grandTotal - (inv.amountPaid || 0);
      net += unpaid;
      totalInvoiced += inv.grandTotal;
      totalPaid += (inv.amountPaid || 0);
      if (unpaid > 0.01) pendingInvoicesCount++;
    }
  }

  // 2. Purchase Invoices
  for (const pur of data.purchaseInvoices || []) {
    if (pur.status === 'CANCELLED') continue;
    if (pur.partyId === party.id || (pur.partyName && pur.partyName.toLowerCase() === party.name.toLowerCase())) {
      const unpaid = pur.grandTotal - (pur.amountPaid || 0);
      net -= unpaid; // Payable reduces DR net
      totalInvoiced += pur.grandTotal;
      totalPaid += (pur.amountPaid || 0);
      if (unpaid > 0.01) pendingInvoicesCount++;
    }
  }

  // 3. Payment & Receipt Vouchers
  const normalizedPartyName = (party.name || '').trim().toLowerCase();
  for (const vch of data.vouchers || []) {
    if ((vch as any).isOptional || (vch as any).isCancelled) continue;
    const matchesParty =
      (vch.partyId && vch.partyId === party.id) ||
      (vch.partyName && vch.partyName.trim().toLowerCase() === normalizedPartyName);
    if (matchesParty) {
      if (vch.type === 'RECEIPT') {
        net -= vch.totalAmount; // Receipt from customer reduces receivable
        totalPaid += vch.totalAmount;
      } else if (vch.type === 'PAYMENT') {
        net += vch.totalAmount; // Payment to supplier reduces payable (increases net DR)
        totalPaid += vch.totalAmount;
      }
    }
  }

  // 4. Debit & Credit Notes
  for (const note of data.debitCreditNotes || []) {
    const matchesParty =
      (note.partyId && note.partyId === party.id) ||
      (note.partyName && note.partyName.trim().toLowerCase() === normalizedPartyName);
    if (matchesParty) {
      if (note.type === 'CREDIT_NOTE') {
        net -= note.grandTotal;
      } else if (note.type === 'DEBIT_NOTE') {
        net += note.grandTotal;
      }
    }
  }

  const absNet = Math.abs(net);
  const balanceType = net >= 0 ? 'DR' : 'CR';

  return {
    netBalance: absNet,
    balanceType,
    signedBalance: net,
    totalInvoiced,
    totalPaid,
    pendingInvoicesCount
  };
}

export function generateNextNumber(
  prefix: string,
  list: Array<{ invoiceNumber?: string; voucherNumber?: string; billNumber?: string; poNumber?: string }>
): string {
  const year = new Date().getFullYear();
  let maxNum = 0;
  for (const item of list) {
    const numStr = item.invoiceNumber || item.voucherNumber || item.billNumber || item.poNumber;
    if (numStr && numStr.startsWith(prefix)) {
      const parts = numStr.split('/');
      const last = parts[parts.length - 1];
      const parsed = parseInt(last, 10);
      if (!isNaN(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  const next = maxNum + 1;
  const padded = next.toString().padStart(3, '0');
  return `${prefix}/${year}/${padded}`;
}

/**
 * Returns an ordered union of `data.accounts` and any dynamic/system accounts present
 * in `balancesMap` (such as Sundry Debtors/Creditors, Output/Input GST, Round Off, or
 * imported custom accounts), ensuring Financial Statements, Printouts & Exports stay 100%
 * consistent with Trial Balance.
 */
export function mergeAccountsWithBalancesMap(
  data: AppData,
  balancesMap: Map<string, AccountBalance>
): Account[] {
  const merged: Account[] = [];
  const seen = new Set<string>();
  for (const acc of data.accounts || []) {
    if (!acc || seen.has(acc.id)) continue;
    seen.add(acc.id);
    merged.push(acc);
  }
  for (const [id, bal] of balancesMap.entries()) {
    if (bal?.account && !seen.has(id)) {
      seen.add(id);
      merged.push(bal.account);
    }
  }
  return merged;
}

/**
 * Unified Fixed Asset classifier across UI, Print Preview, HTML Printouts & Periodic Reports.
 */
export function isFixedAssetLedger(
  acc?: Account | null,
  accountGroups?: AccountGroup[]
): boolean {
  const cls = resolveAccountClassification(acc, accountGroups);
  return cls.category === 'ASSET' && cls.nature === 'FIXED_ASSET';
}

/**
 * Returns true if the Balance Sheet should exclude this Asset ledger because its
 * opening stock value is already accounted for by `getEffectiveOpeningStock(data)`
 * and replaced by Closing Stock Valuation on the Assets side.
 */
export function isEffectiveStockOpeningAccount(
  acc: Account | undefined | null,
  data: AppData
): boolean {
  if (!acc) return false;
  if (acc.id === 'acc_inventory') return true;
  const invAcc = (data.accounts || []).find(a => a.id === 'acc_inventory');
  if (invAcc && (invAcc.openingBalance || 0) !== 0) return false;
  return (
    acc.category === 'ASSET' &&
    ['stock-in-hand', 'stock in hand', 'opening stock'].includes((acc.name || '').toLowerCase().trim())
  );
}

/**
 * Resolves a Voucher Entry line's effective ledger account ID using the exact same rules
 * as `calculateAccountBalances(data)` (never matching by blank accountCode or name collision).
 */
export function resolveVoucherLineAccountId(
  lineAccountId: string | undefined,
  vchType: Voucher['type'],
  accountById: Map<string, Account>,
  partyById: Map<string, PartyMaster>
): string {
  if (!lineAccountId) return '';
  if (accountById.has(lineAccountId)) return lineAccountId;
  const matchedParty = partyById.get(lineAccountId);
  if (matchedParty || lineAccountId.startsWith('pty_')) {
    const isDebtor =
      matchedParty?.type === 'CUSTOMER' ||
      (matchedParty?.type !== 'VENDOR' && vchType === 'RECEIPT');
    return isDebtor ? 'acc_debtors' : 'acc_creditors';
  }
  return lineAccountId;
}

export interface LedgerStatementRow {
  id: string;
  date: string;
  voucherNo: string;
  voucherType: string;
  opposingLedger: string;
  narration: string;
  bankRef: string;
  particulars: string;
  debit: number;
  credit: number;
  runningBalance: number;
  runningType: 'DR' | 'CR';
  sourceType: 'VOUCHER' | 'SALES_INVOICE' | 'PURCHASE_BILL' | 'DEBIT_CREDIT_NOTE';
  sourceId: string;
  rawObj?: any;
}

export interface LedgerStatementResult {
  kind: 'ACCOUNT' | 'PARTY';
  account?: Account;
  party?: PartyMaster;
  title: string;
  code: string;
  categoryLabel: string;
  gstin: string;
  openingForPeriod: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingType: 'DR' | 'CR';
  closingSignedDr: number;
  rows: LedgerStatementRow[];
}

export interface LedgerStatementTarget {
  partyOrAccountId?: string;
  targetName?: string;
  preferredKind?: 'ACCOUNT' | 'PARTY';
  startDate?: string;
  endDate?: string;
}

/**
 * Canonical Double-Entry Account / Party Ledger Statement builder.
 * Guarantees 100% parity with `calculateAccountBalances(data)` and prevents
 * `undefined === undefined` party matches or blank-code voucher leaks.
 */
export function buildAccountOrPartyLedgerStatement(
  data: AppData,
  target: LedgerStatementTarget
): LedgerStatementResult {
  const balancesMap = calculateAccountBalances(data);
  const allAccounts = mergeAccountsWithBalancesMap(data, balancesMap);
  const accountById = new Map<string, Account>(allAccounts.map(a => [a.id, a]));
  const partyById = new Map<string, PartyMaster>((data.parties || []).map(p => [p.id, p]));

  const targetId = target.partyOrAccountId?.trim() || undefined;
  const targetNameLower = target.targetName?.trim().toLowerCase() || '';

  let resolvedAccount: Account | undefined;
  let resolvedParty: PartyMaster | undefined;

  if (target.preferredKind === 'ACCOUNT') {
    if (targetId) resolvedAccount = accountById.get(targetId);
    if (!resolvedAccount && targetNameLower) {
      resolvedAccount = allAccounts.find(a => (a.name || '').trim().toLowerCase() === targetNameLower);
    }
    if (!resolvedAccount && targetId) {
      resolvedAccount = {
        id: targetId,
        code: '',
        name: target.targetName || targetId,
        category: 'EXPENSE',
        subCategory: 'General',
        openingBalance: 0,
        balanceType: 'DR'
      };
    }
  } else if (target.preferredKind === 'PARTY') {
    if (targetId) resolvedParty = partyById.get(targetId);
    if (!resolvedParty && targetNameLower) {
      resolvedParty = (data.parties || []).find(p => (p.name || '').trim().toLowerCase() === targetNameLower);
    }
    if (!resolvedParty && targetId) {
      resolvedAccount = accountById.get(targetId);
    }
  } else {
    // Auto resolution: ALWAYS check exact ID first (Accounts then Parties), then exact name (Accounts then Parties)
    if (targetId) {
      resolvedAccount = accountById.get(targetId);
      if (!resolvedAccount) {
        resolvedParty = partyById.get(targetId);
      }
    }
    if (!resolvedAccount && !resolvedParty && targetNameLower) {
      resolvedAccount = allAccounts.find(a => (a.name || '').trim().toLowerCase() === targetNameLower);
      if (!resolvedAccount) {
        resolvedParty = (data.parties || []).find(p => (p.name || '').trim().toLowerCase() === targetNameLower);
      }
    }
    if (!resolvedAccount && !resolvedParty && targetId) {
      resolvedAccount = {
        id: targetId,
        code: '',
        name: target.targetName || targetId,
        category: 'EXPENSE',
        subCategory: 'General',
        openingBalance: 0,
        balanceType: 'DR'
      };
    }
  }

  const kind: 'ACCOUNT' | 'PARTY' = resolvedParty ? 'PARTY' : 'ACCOUNT';
  const normDate = (d?: string): string => (d ? normalizeDateISO(d) || d : '');
  const normStart = normDate(target.startDate);
  const normEnd = normDate(target.endDate);

  type RawLine = Omit<LedgerStatementRow, 'runningBalance' | 'runningType'>;
  const rawLines: RawLine[] = [];

  const getVoucherOpposing = (vch: Voucher, currentAccountId: string, isCurrentDebit: boolean): string => {
    const oppositeEntries = (vch.entries || []).filter(e => {
      const resolvedId = resolveVoucherLineAccountId(e.accountId, vch.type, accountById, partyById);
      if (resolvedId === currentAccountId) return false;
      return isCurrentDebit ? (e.credit || 0) > 0 : (e.debit || 0) > 0;
    });

    const names = Array.from(
      new Set(
        oppositeEntries
          .map(e => {
            const resolvedId = resolveVoucherLineAccountId(e.accountId, vch.type, accountById, partyById);
            return e.accountName || accountById.get(resolvedId)?.name;
          })
          .filter(Boolean)
      )
    );

    let counterStr = names.join(', ');
    if (!counterStr && vch.partyName) counterStr = vch.partyName;
    if (!counterStr) {
      const others = (vch.entries || []).filter(e => {
        const resolvedId = resolveVoucherLineAccountId(e.accountId, vch.type, accountById, partyById);
        return resolvedId !== currentAccountId;
      });
      counterStr = Array.from(new Set(others.map(e => e.accountName).filter(Boolean))).join(', ') || 'Adjustment A/c';
    }
    return `${isCurrentDebit ? 'To ' : 'By '}${counterStr}`;
  };

  if (resolvedParty) {
    const pId = resolvedParty.id;
    const pNameLower = (resolvedParty.name || '').trim().toLowerCase();
    const matchesParty = (docPartyId?: string, docPartyName?: string): boolean => {
      if (docPartyId && docPartyId === pId) return true;
      if (pNameLower && docPartyName && docPartyName.trim().toLowerCase() === pNameLower) return true;
      return false;
    };

    // 1. Sales Invoices for Party
    for (const inv of data.invoices || []) {
      if (inv.status === 'CANCELLED') continue;
      if (!matchesParty(inv.partyId, inv.partyName)) continue;
      const d = normDate(inv.date);
      const itemDesc = (inv.items || []).map(i => i.itemName || (i as any).description || i.itemId).join(', ').slice(0, 45);
      rawLines.push({
        id: `inv_${inv.id}`,
        date: d,
        voucherNo: inv.invoiceNumber,
        voucherType: 'Sales Invoice',
        opposingLedger: 'To Sales Account',
        narration: `Tax Invoice #${inv.invoiceNumber}${itemDesc ? ` (${itemDesc})` : ''}`,
        bankRef: '',
        particulars: `Sales Tax Invoice #${inv.invoiceNumber} (${inv.invoiceType || 'B2B'})`,
        debit: inv.grandTotal || 0,
        credit: 0,
        sourceType: 'SALES_INVOICE',
        sourceId: inv.id,
        rawObj: inv
      });

      if ((inv.amountPaid || 0) > 0) {
        const hasReceiptVch = (data.vouchers || []).some(
          v =>
            v.type === 'RECEIPT' &&
            matchesParty(v.partyId, v.partyName) &&
            (v.referenceNo === inv.invoiceNumber || (v.narration && v.narration.includes(inv.invoiceNumber)))
        );
        if (!hasReceiptVch) {
          rawLines.push({
            id: `inv_pay_${inv.id}`,
            date: d,
            voucherNo: `REC-${inv.invoiceNumber}`,
            voucherType: 'Payment Received',
            opposingLedger: 'By Cash/Bank Account',
            narration: `Payment received against Sales Invoice #${inv.invoiceNumber}`,
            bankRef: '',
            particulars: `Receipt against Invoice #${inv.invoiceNumber}`,
            debit: 0,
            credit: inv.amountPaid,
            sourceType: 'SALES_INVOICE',
            sourceId: inv.id,
            rawObj: inv
          });
        }
      }
    }

    // 2. Purchase Bills for Party
    for (const pur of data.purchaseInvoices || []) {
      if (pur.status === 'CANCELLED') continue;
      if (!matchesParty(pur.partyId || (pur as any).vendorId, pur.partyName)) continue;
      const d = normDate(pur.date);
      const billRef = pur.supplierInvoiceNo || pur.billNumber;
      const itemDesc = (pur.items || []).map(i => i.itemName || (i as any).description || i.itemId).join(', ').slice(0, 45);
      rawLines.push({
        id: `pur_${pur.id}`,
        date: d,
        voucherNo: pur.billNumber,
        voucherType: 'Purchase Bill',
        opposingLedger: 'By Purchase Account',
        narration: `Bill #${billRef} from ${pur.partyName}${itemDesc ? ` (${itemDesc})` : ''}`,
        bankRef: '',
        particulars: `Purchase Bill #${billRef}`,
        debit: 0,
        credit: pur.grandTotal || 0,
        sourceType: 'PURCHASE_BILL',
        sourceId: pur.id,
        rawObj: pur
      });

      if ((pur.amountPaid || 0) > 0) {
        const hasPaymentVch = (data.vouchers || []).some(
          v =>
            v.type === 'PAYMENT' &&
            matchesParty(v.partyId, v.partyName) &&
            (v.referenceNo === billRef || (v.narration && v.narration.includes(pur.billNumber)))
        );
        if (!hasPaymentVch) {
          rawLines.push({
            id: `pur_pay_${pur.id}`,
            date: d,
            voucherNo: `PAY-${pur.billNumber}`,
            voucherType: 'Vendor Payment',
            opposingLedger: 'To Cash/Bank Account',
            narration: `Payment made against Purchase Bill #${billRef}`,
            bankRef: '',
            particulars: `Payment paid against Bill #${billRef}`,
            debit: pur.amountPaid,
            credit: 0,
            sourceType: 'PURCHASE_BILL',
            sourceId: pur.id,
            rawObj: pur
          });
        }
      }
    }

    // 3. Vouchers for Party
    for (const vch of data.vouchers || []) {
      const partyHeaderMatch = matchesParty(vch.partyId, vch.partyName);
      const explicitPartyLine = (vch.entries || []).find(
        e =>
          e.accountId === pId ||
          ((!e.accountId || !accountById.has(e.accountId)) &&
            pNameLower &&
            e.accountName &&
            e.accountName.trim().toLowerCase() === pNameLower)
      );
      if (!partyHeaderMatch && !explicitPartyLine) continue;

      const d = normDate(vch.date);
      const bankRef = vch.bankReferenceNo || (vch as any).utrNumber || (vch as any).chequeNo || '';
      const otherEntries = (vch.entries || []).map(e => e.accountName).filter(Boolean).join(', ');
      const isReceipt = vch.type === 'RECEIPT';
      const isPayment = vch.type === 'PAYMENT';

      let debitAmt = 0;
      let creditAmt = 0;
      if (isPayment) {
        debitAmt = vch.totalAmount || 0;
      } else if (isReceipt) {
        creditAmt = vch.totalAmount || 0;
      } else if (explicitPartyLine) {
        debitAmt = explicitPartyLine.debit || 0;
        creditAmt = explicitPartyLine.credit || 0;
      } else {
        const controlLine = (vch.entries || []).find(
          e => e.accountId === 'acc_debtors' || e.accountId === 'acc_creditors'
        );
        if (controlLine) {
          debitAmt = controlLine.debit || 0;
          creditAmt = controlLine.credit || 0;
        } else {
          debitAmt = resolvedParty.type === 'CUSTOMER' ? (vch.totalAmount || 0) : 0;
          creditAmt = resolvedParty.type === 'VENDOR' ? (vch.totalAmount || 0) : 0;
        }
      }

      rawLines.push({
        id: `vch_${vch.id}`,
        date: d,
        voucherNo: vch.voucherNumber,
        voucherType: `${vch.type} Voucher`,
        opposingLedger: isReceipt
          ? `By ${vch.paymentMode || 'Bank/Cash'}`
          : isPayment
            ? `To ${vch.paymentMode || 'Bank/Cash'}`
            : `To/By ${otherEntries || 'General Ledger'}`,
        narration: vch.narration || '',
        bankRef,
        particulars: vch.narration || `${vch.type} via ${vch.paymentMode || 'Cash/Bank'}${otherEntries ? ` [${otherEntries}]` : ''}`,
        debit: debitAmt,
        credit: creditAmt,
        sourceType: 'VOUCHER',
        sourceId: vch.id,
        rawObj: vch
      });
    }

    // 4. Debit & Credit Notes for Party
    for (const dcn of data.debitCreditNotes || []) {
      if (!matchesParty(dcn.partyId, dcn.partyName)) continue;
      const d = normDate(dcn.date);
      const refInv = dcn.originalInvoiceNo || (dcn as any).originalInvoiceNumber || '-';
      const isCreditNote = dcn.type === 'CREDIT_NOTE';
      rawLines.push({
        id: `dcn_${dcn.id}`,
        date: d,
        voucherNo: dcn.noteNumber,
        voucherType: isCreditNote ? 'Credit Note' : 'Debit Note',
        opposingLedger: isCreditNote ? 'By Sales Return / Adjustment A/c' : 'To Purchase Return / Adjustment A/c',
        narration: dcn.reason || `${dcn.type} issued`,
        bankRef: '',
        particulars: `${isCreditNote ? 'Credit Note' : 'Debit Note'} against Inv/Bill #${refInv}${dcn.reason ? ` (${dcn.reason})` : ''}`,
        debit: isCreditNote ? 0 : (dcn.grandTotal || 0),
        credit: isCreditNote ? (dcn.grandTotal || 0) : 0,
        sourceType: 'DEBIT_CREDIT_NOTE',
        sourceId: dcn.id,
        rawObj: dcn
      });
    }
  } else if (resolvedAccount) {
    const accId = resolvedAccount.id;

    // 1. Vouchers strictly matched by resolved accountId
    for (const vch of data.vouchers || []) {
      if ((vch as any).isOptional || (vch as any).isCancelled) continue;
      const d = normDate(vch.date);
      const bankRef = vch.bankReferenceNo || (vch as any).utrNumber || (vch as any).chequeNo || '';
      let vchDr = 0;
      let vchCr = 0;
      for (const line of vch.entries || []) {
        const dr = Number(line.debit) || 0;
        const cr = Number(line.credit) || 0;
        if (line.accountId) {
          vchDr += dr;
          vchCr += cr;
        }
        const lineTargetId = resolveVoucherLineAccountId(line.accountId, vch.type, accountById, partyById);
        if (lineTargetId !== accId) continue;

        const isCurrentDebit = dr > 0;
        const oppLedger = getVoucherOpposing(vch, accId, isCurrentDebit);
        let partText = oppLedger;
        if (vch.partyName && !partText.toLowerCase().includes(vch.partyName.toLowerCase())) {
          partText += ` (${vch.partyName})`;
        }
        if (vch.narration) {
          partText += ` - ${vch.narration}`;
        }

        rawLines.push({
          id: `vch_${vch.id}_${line.id}`,
          date: d,
          voucherNo: vch.voucherNumber,
          voucherType: `${vch.type} Voucher`,
          opposingLedger: oppLedger,
          narration: vch.narration || '',
          bankRef,
          particulars: partText,
          debit: dr,
          credit: cr,
          sourceType: 'VOUCHER',
          sourceId: vch.id,
          rawObj: vch
        });
      }
      if (accId === 'acc_round_off' && vch.type !== 'CONTRA') {
        const autoRo = getAutoRoundOffAdjustment(vchDr, vchCr);
        if (autoRo) {
          rawLines.push({
            id: `vch_ro_${vch.id}`,
            date: d,
            voucherNo: vch.voucherNumber,
            voucherType: `${vch.type} Voucher`,
            opposingLedger: vch.partyName || `${vch.type} Adjustment`,
            narration: `Auto Round Off on #${vch.voucherNumber}`,
            bankRef,
            particulars: `Round Off – ${vch.voucherNumber}`,
            debit: autoRo.debit,
            credit: autoRo.credit,
            sourceType: 'VOUCHER',
            sourceId: vch.id,
            rawObj: vch
          });
        }
      }
    }

    // 2. Sales Invoices (matches calculateAccountBalances 1:1 including Cash & Bank settlement)
    for (const inv of data.invoices || []) {
      if (inv.status === 'CANCELLED') continue;
      const d = normDate(inv.date);
      const salesTargetId = inv.primaryAccountId || 'acc_sales';
      const salesAccName = accountById.get(salesTargetId)?.name || 'Sales Account';
      const settlement = resolveSalesInvoiceSettlement(data, inv);

      if (accId === 'acc_debtors' && settlement.debtorsAmount > 0.0001) {
        rawLines.push({
          id: `inv_dr_${inv.id}`,
          date: d,
          voucherNo: inv.invoiceNumber,
          voucherType: inv.isPosSale ? 'POS Bill' : 'Sales Invoice',
          opposingLedger: `To ${salesAccName}`,
          narration: `Tax Invoice #${inv.invoiceNumber} to ${inv.partyName}`,
          bankRef: '',
          particulars: `Sales Invoice #${inv.invoiceNumber} – ${inv.partyName}`,
          debit: settlement.debtorsAmount,
          credit: 0,
          sourceType: 'SALES_INVOICE',
          sourceId: inv.id,
          rawObj: inv
        });
      }

      settlement.legs.forEach((leg, lIdx) => {
        if (leg.account.id === accId && leg.amount > 0.0001) {
          rawLines.push({
            id: `inv_cb_${inv.id}_${lIdx}`,
            date: d,
            voucherNo: inv.invoiceNumber,
            voucherType: inv.isPosSale ? 'POS Sale' : 'Sales Invoice',
            opposingLedger: `To ${salesAccName} (${leg.modeLabel})`,
            narration: `${inv.isPosSale ? 'POS' : 'Sales'} receipt via ${leg.modeLabel} #${inv.invoiceNumber} (${inv.partyName})`,
            bankRef: inv.advanceNote || '',
            particulars: `${inv.isPosSale ? 'POS Sale' : 'Sales Receipt'} – ${inv.partyName} (${leg.modeLabel})`,
            debit: leg.amount,
            credit: 0,
            sourceType: 'SALES_INVOICE',
            sourceId: inv.id,
            rawObj: inv
          });
        }
      });

      if (accId === salesTargetId) {
        const netSalesVal = (inv.subtotal || 0) - (inv.totalDiscount || 0);
        rawLines.push({
          id: `inv_sal_${inv.id}`,
          date: d,
          voucherNo: inv.invoiceNumber,
          voucherType: 'Sales Invoice',
          opposingLedger: `By ${inv.partyName || 'Sundry Debtors'}`,
          narration: `Tax Invoice #${inv.invoiceNumber} to ${inv.partyName}`,
          bankRef: '',
          particulars: `Sales to ${inv.partyName} (Inv #${inv.invoiceNumber})`,
          debit: 0,
          credit: netSalesVal,
          sourceType: 'SALES_INVOICE',
          sourceId: inv.id,
          rawObj: inv
        });
      }

      if (accId === 'acc_gst_cgst' && (inv.cgstAmount || 0) > 0) {
        rawLines.push({
          id: `inv_cgst_${inv.id}`,
          date: d,
          voucherNo: inv.invoiceNumber,
          voucherType: 'Sales Invoice',
          opposingLedger: `By ${inv.partyName || 'Sundry Debtors'}`,
          narration: `Output CGST @ Sales #${inv.invoiceNumber}`,
          bankRef: '',
          particulars: `Output CGST – ${inv.partyName}`,
          debit: 0,
          credit: inv.cgstAmount,
          sourceType: 'SALES_INVOICE',
          sourceId: inv.id,
          rawObj: inv
        });
      }

      if (accId === 'acc_gst_sgst' && (inv.sgstAmount || 0) > 0) {
        rawLines.push({
          id: `inv_sgst_${inv.id}`,
          date: d,
          voucherNo: inv.invoiceNumber,
          voucherType: 'Sales Invoice',
          opposingLedger: `By ${inv.partyName || 'Sundry Debtors'}`,
          narration: `Output SGST @ Sales #${inv.invoiceNumber}`,
          bankRef: '',
          particulars: `Output SGST – ${inv.partyName}`,
          debit: 0,
          credit: inv.sgstAmount,
          sourceType: 'SALES_INVOICE',
          sourceId: inv.id,
          rawObj: inv
        });
      }

      if (accId === 'acc_gst_igst' && (inv.igstAmount || 0) > 0) {
        rawLines.push({
          id: `inv_igst_${inv.id}`,
          date: d,
          voucherNo: inv.invoiceNumber,
          voucherType: 'Sales Invoice',
          opposingLedger: `By ${inv.partyName || 'Sundry Debtors'}`,
          narration: `Output IGST @ Sales #${inv.invoiceNumber}`,
          bankRef: '',
          particulars: `Output IGST – ${inv.partyName}`,
          debit: 0,
          credit: inv.igstAmount,
          sourceType: 'SALES_INVOICE',
          sourceId: inv.id,
          rawObj: inv
        });
      }

      if (accId === 'acc_round_off') {
        if (inv.roundOff && Math.abs(inv.roundOff) > 0.0001) {
          rawLines.push({
            id: `inv_ro_${inv.id}`,
            date: d,
            voucherNo: inv.invoiceNumber,
            voucherType: 'Sales Invoice',
            opposingLedger: `To/By ${inv.partyName || 'Sundry Debtors'}`,
            narration: `Round Off on Sales #${inv.invoiceNumber}`,
            bankRef: '',
            particulars: `Round Off – ${inv.partyName} (Inv #${inv.invoiceNumber})`,
            debit: inv.roundOff < 0 ? Math.abs(inv.roundOff) : 0,
            credit: inv.roundOff > 0 ? inv.roundOff : 0,
            sourceType: 'SALES_INVOICE',
            sourceId: inv.id,
            rawObj: inv
          });
        }
        const invDr = settlement.debtorsAmount + settlement.legs.reduce((s, l) => s + l.amount, 0)
          + (inv.roundOff && inv.roundOff < -0.0001 ? Math.abs(inv.roundOff) : 0)
          + (inv.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.debit || 0) : 0), 0);
        const invCr = ((inv.subtotal || 0) - (inv.totalDiscount || 0))
          + (inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0)
          + (inv.roundOff && inv.roundOff > 0.0001 ? inv.roundOff : 0)
          + (inv.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.credit || 0) : 0), 0);
        const invAutoRo = getAutoRoundOffAdjustment(invDr, invCr);
        if (invAutoRo) {
          rawLines.push({
            id: `inv_aro_${inv.id}`,
            date: d,
            voucherNo: inv.invoiceNumber,
            voucherType: 'Sales Invoice',
            opposingLedger: `To/By ${inv.partyName || 'Sundry Debtors'}`,
            narration: `Auto Round Off on Sales #${inv.invoiceNumber}`,
            bankRef: '',
            particulars: `Auto Round Off – ${inv.partyName} (Inv #${inv.invoiceNumber})`,
            debit: invAutoRo.debit,
            credit: invAutoRo.credit,
            sourceType: 'SALES_INVOICE',
            sourceId: inv.id,
            rawObj: inv
          });
        }
      }

      (inv.extraLedgerLines || []).forEach((el, eIdx) => {
        if (el.accountId === accId) {
          rawLines.push({
            id: `inv_ex_${inv.id}_${eIdx}`,
            date: d,
            voucherNo: inv.invoiceNumber,
            voucherType: 'Sales Invoice',
            opposingLedger: `By ${inv.partyName || 'Sundry Debtors'}`,
            narration: `${el.accountName || resolvedAccount!.name} on Inv #${inv.invoiceNumber}`,
            bankRef: '',
            particulars: `${el.accountName || resolvedAccount!.name} – ${inv.partyName}`,
            debit: el.debit || 0,
            credit: el.credit || 0,
            sourceType: 'SALES_INVOICE',
            sourceId: inv.id,
            rawObj: inv
          });
        }
      });
    }

    // 3. Purchase Invoices (matches calculateAccountBalances 1:1 including Cash & Bank outflow)
    for (const pur of data.purchaseInvoices || []) {
      if (pur.status === 'CANCELLED') continue;
      const d = normDate(pur.date);
      const purTargetId = pur.primaryAccountId || 'acc_cogs';
      const purAccName = accountById.get(purTargetId)?.name || 'Purchase Account';
      const billRef = pur.supplierInvoiceNo || pur.billNumber;
      const purSettlement = resolvePurchaseBillSettlement(data, pur);

      if (accId === purTargetId) {
        const netPurVal = (pur.subtotal || 0) - (pur.totalDiscount || 0);
        rawLines.push({
          id: `pur_exp_${pur.id}`,
          date: d,
          voucherNo: pur.billNumber,
          voucherType: 'Purchase Bill',
          opposingLedger: `To ${pur.partyName || 'Sundry Creditors'}`,
          narration: `Purchase Bill #${billRef} from ${pur.partyName}`,
          bankRef: '',
          particulars: `Purchases from ${pur.partyName} (#${billRef})`,
          debit: netPurVal,
          credit: 0,
          sourceType: 'PURCHASE_BILL',
          sourceId: pur.id,
          rawObj: pur
        });
      }

      if (accId === 'acc_creditors' && purSettlement.creditorsAmount > 0.0001) {
        rawLines.push({
          id: `pur_cr_${pur.id}`,
          date: d,
          voucherNo: pur.billNumber,
          voucherType: 'Purchase Bill',
          opposingLedger: `By ${purAccName}`,
          narration: `Purchase Bill #${billRef} from ${pur.partyName}`,
          bankRef: '',
          particulars: `Purchase Bill from ${pur.partyName} (#${billRef})`,
          debit: 0,
          credit: purSettlement.creditorsAmount,
          sourceType: 'PURCHASE_BILL',
          sourceId: pur.id,
          rawObj: pur
        });
      }

      purSettlement.legs.forEach((leg, lIdx) => {
        if (leg.account.id === accId && leg.amount > 0.0001) {
          rawLines.push({
            id: `pur_cb_${pur.id}_${lIdx}`,
            date: d,
            voucherNo: pur.billNumber,
            voucherType: 'Purchase Bill',
            opposingLedger: `By ${purAccName} (${leg.modeLabel})`,
            narration: `Purchase payment via ${leg.modeLabel} #${billRef} to ${pur.partyName}`,
            bankRef: '',
            particulars: `Purchase Paid – ${pur.partyName} (${leg.modeLabel})`,
            debit: 0,
            credit: leg.amount,
            sourceType: 'PURCHASE_BILL',
            sourceId: pur.id,
            rawObj: pur
          });
        }
      });

      if (accId === 'acc_itc_cgst' && (pur.cgstAmount || 0) > 0) {
        rawLines.push({
          id: `pur_cgst_${pur.id}`,
          date: d,
          voucherNo: pur.billNumber,
          voucherType: 'Purchase Bill',
          opposingLedger: `To ${pur.partyName || 'Sundry Creditors'}`,
          narration: `Input CGST @ Purchase #${billRef}`,
          bankRef: '',
          particulars: `Input CGST – ${pur.partyName}`,
          debit: pur.cgstAmount,
          credit: 0,
          sourceType: 'PURCHASE_BILL',
          sourceId: pur.id,
          rawObj: pur
        });
      }

      if (accId === 'acc_itc_sgst' && (pur.sgstAmount || 0) > 0) {
        rawLines.push({
          id: `pur_sgst_${pur.id}`,
          date: d,
          voucherNo: pur.billNumber,
          voucherType: 'Purchase Bill',
          opposingLedger: `To ${pur.partyName || 'Sundry Creditors'}`,
          narration: `Input SGST @ Purchase #${billRef}`,
          bankRef: '',
          particulars: `Input SGST – ${pur.partyName}`,
          debit: pur.sgstAmount,
          credit: 0,
          sourceType: 'PURCHASE_BILL',
          sourceId: pur.id,
          rawObj: pur
        });
      }

      if (accId === 'acc_itc_igst' && (pur.igstAmount || 0) > 0) {
        rawLines.push({
          id: `pur_igst_${pur.id}`,
          date: d,
          voucherNo: pur.billNumber,
          voucherType: 'Purchase Bill',
          opposingLedger: `To ${pur.partyName || 'Sundry Creditors'}`,
          narration: `Input IGST @ Purchase #${billRef}`,
          bankRef: '',
          particulars: `Input IGST – ${pur.partyName}`,
          debit: pur.igstAmount,
          credit: 0,
          sourceType: 'PURCHASE_BILL',
          sourceId: pur.id,
          rawObj: pur
        });
      }

      if (accId === 'acc_round_off') {
        if (pur.roundOff && Math.abs(pur.roundOff) > 0.0001) {
          rawLines.push({
            id: `pur_ro_${pur.id}`,
            date: d,
            voucherNo: pur.billNumber,
            voucherType: 'Purchase Bill',
            opposingLedger: `To/By ${pur.partyName || 'Sundry Creditors'}`,
            narration: `Round Off on Purchase #${billRef}`,
            bankRef: '',
            particulars: `Round Off – ${pur.partyName} (#${billRef})`,
            debit: pur.roundOff > 0 ? pur.roundOff : 0,
            credit: pur.roundOff < 0 ? Math.abs(pur.roundOff) : 0,
            sourceType: 'PURCHASE_BILL',
            sourceId: pur.id,
            rawObj: pur
          });
        }
        const purDr = ((pur.subtotal || 0) - (pur.totalDiscount || 0))
          + (pur.cgstAmount || 0) + (pur.sgstAmount || 0) + (pur.igstAmount || 0)
          + (pur.roundOff && pur.roundOff > 0.0001 ? pur.roundOff : 0)
          + (pur.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.debit || 0) : 0), 0);
        const purCr = purSettlement.creditorsAmount + purSettlement.legs.reduce((s, l) => s + l.amount, 0)
          + (pur.roundOff && pur.roundOff < -0.0001 ? Math.abs(pur.roundOff) : 0)
          + (pur.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.credit || 0) : 0), 0);
        const purAutoRo = getAutoRoundOffAdjustment(purDr, purCr);
        if (purAutoRo) {
          rawLines.push({
            id: `pur_aro_${pur.id}`,
            date: d,
            voucherNo: pur.billNumber,
            voucherType: 'Purchase Bill',
            opposingLedger: `To/By ${pur.partyName || 'Sundry Creditors'}`,
            narration: `Auto Round Off on Purchase #${billRef}`,
            bankRef: '',
            particulars: `Auto Round Off – ${pur.partyName} (#${billRef})`,
            debit: purAutoRo.debit,
            credit: purAutoRo.credit,
            sourceType: 'PURCHASE_BILL',
            sourceId: pur.id,
            rawObj: pur
          });
        }
      }

      (pur.extraLedgerLines || []).forEach((el, eIdx) => {
        if (el.accountId === accId) {
          rawLines.push({
            id: `pur_ex_${pur.id}_${eIdx}`,
            date: d,
            voucherNo: pur.billNumber,
            voucherType: 'Purchase Bill',
            opposingLedger: `To ${pur.partyName || 'Sundry Creditors'}`,
            narration: `${el.accountName || resolvedAccount!.name} on Purchase #${billRef}`,
            bankRef: '',
            particulars: `${el.accountName || resolvedAccount!.name} – ${pur.partyName}`,
            debit: el.debit || 0,
            credit: el.credit || 0,
            sourceType: 'PURCHASE_BILL',
            sourceId: pur.id,
            rawObj: pur
          });
        }
      });
    }

    // 4. Debit & Credit Notes (matches calculateAccountBalances 1:1)
    for (const dcn of data.debitCreditNotes || []) {
      const d = normDate(dcn.date);
      const refInv = dcn.originalInvoiceNo || (dcn as any).originalInvoiceNumber || '-';
      const isCreditNote = dcn.type === 'CREDIT_NOTE';
      const taxableVal = (dcn.subtotal || 0) - (dcn.totalDiscount || 0);

      if (dcn.type === 'DEBIT_NOTE') {
        const dnTargetId = dcn.primaryAccountId || 'acc_cogs';
        if (accId === dnTargetId) {
          rawLines.push({
            id: `dcn_exp_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Debit Note',
            opposingLedger: `By ${dcn.partyName || 'Sundry Creditors'}`,
            narration: dcn.reason || `Purchase Return / Debit Note #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `Purchase Return / Debit Note – ${dcn.partyName} (#${refInv})`,
            debit: 0,
            credit: taxableVal,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_creditors') {
          rawLines.push({
            id: `dcn_cr_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Debit Note',
            opposingLedger: 'To Purchase Return A/c',
            narration: dcn.reason || `Debit Note #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `Debit Note – ${dcn.partyName}`,
            debit: dcn.grandTotal || 0,
            credit: 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_itc_cgst' && (dcn.cgstAmount || 0) > 0) {
          rawLines.push({
            id: `dcn_cg_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Debit Note',
            opposingLedger: `By ${dcn.partyName || 'Sundry Creditors'}`,
            narration: `ITC Reversal CGST #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `ITC Reversal CGST – ${dcn.partyName}`,
            debit: 0,
            credit: dcn.cgstAmount,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_itc_sgst' && (dcn.sgstAmount || 0) > 0) {
          rawLines.push({
            id: `dcn_sg_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Debit Note',
            opposingLedger: `By ${dcn.partyName || 'Sundry Creditors'}`,
            narration: `ITC Reversal SGST #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `ITC Reversal SGST – ${dcn.partyName}`,
            debit: 0,
            credit: dcn.sgstAmount,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_itc_igst' && (dcn.igstAmount || 0) > 0) {
          rawLines.push({
            id: `dcn_ig_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Debit Note',
            opposingLedger: `By ${dcn.partyName || 'Sundry Creditors'}`,
            narration: `ITC Reversal IGST #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `ITC Reversal IGST – ${dcn.partyName}`,
            debit: 0,
            credit: dcn.igstAmount,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_round_off') {
          if (dcn.roundOff && Math.abs(dcn.roundOff) > 0.0001) {
            rawLines.push({
              id: `dcn_ro_${dcn.id}`,
              date: d,
              voucherNo: dcn.noteNumber,
              voucherType: 'Debit Note',
              opposingLedger: `By ${dcn.partyName || 'Sundry Creditors'}`,
              narration: `Round Off on Debit Note #${dcn.noteNumber}`,
              bankRef: '',
              particulars: `Round Off – ${dcn.partyName} (#${dcn.noteNumber})`,
              debit: dcn.roundOff < 0 ? Math.abs(dcn.roundOff) : 0,
              credit: dcn.roundOff > 0 ? dcn.roundOff : 0,
              sourceType: 'DEBIT_CREDIT_NOTE',
              sourceId: dcn.id,
              rawObj: dcn
            });
          }
          const noteDr = (dcn.grandTotal || 0)
            + (dcn.roundOff && dcn.roundOff < -0.0001 ? Math.abs(dcn.roundOff) : 0)
            + (dcn.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.debit || 0) : 0), 0);
          const noteCr = taxableVal + (dcn.cgstAmount || 0) + (dcn.sgstAmount || 0) + (dcn.igstAmount || 0)
            + (dcn.roundOff && dcn.roundOff > 0.0001 ? dcn.roundOff : 0)
            + (dcn.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.credit || 0) : 0), 0);
          const noteAutoRo = getAutoRoundOffAdjustment(noteDr, noteCr);
          if (noteAutoRo) {
            rawLines.push({
              id: `dcn_aro_${dcn.id}`,
              date: d,
              voucherNo: dcn.noteNumber,
              voucherType: 'Debit Note',
              opposingLedger: `By ${dcn.partyName || 'Sundry Creditors'}`,
              narration: `Auto Round Off on Debit Note #${dcn.noteNumber}`,
              bankRef: '',
              particulars: `Auto Round Off – ${dcn.partyName} (#${dcn.noteNumber})`,
              debit: noteAutoRo.debit,
              credit: noteAutoRo.credit,
              sourceType: 'DEBIT_CREDIT_NOTE',
              sourceId: dcn.id,
              rawObj: dcn
            });
          }
        }
      } else {
        const cnTargetId = dcn.primaryAccountId || 'acc_sales';
        if (accId === cnTargetId) {
          rawLines.push({
            id: `dcn_rev_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Credit Note',
            opposingLedger: `To ${dcn.partyName || 'Sundry Debtors'}`,
            narration: dcn.reason || `Sales Return / Credit Note #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `Sales Return / Credit Note – ${dcn.partyName} (#${refInv})`,
            debit: taxableVal,
            credit: 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_debtors') {
          rawLines.push({
            id: `dcn_dr_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Credit Note',
            opposingLedger: 'By Sales Return A/c',
            narration: dcn.reason || `Credit Note #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `Credit Note – ${dcn.partyName}`,
            debit: 0,
            credit: dcn.grandTotal || 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_gst_cgst' && (dcn.cgstAmount || 0) > 0) {
          rawLines.push({
            id: `dcn_cg_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Credit Note',
            opposingLedger: `To ${dcn.partyName || 'Sundry Debtors'}`,
            narration: `GST Reversal CGST #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `GST Reversal CGST – ${dcn.partyName}`,
            debit: dcn.cgstAmount,
            credit: 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_gst_sgst' && (dcn.sgstAmount || 0) > 0) {
          rawLines.push({
            id: `dcn_sg_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Credit Note',
            opposingLedger: `To ${dcn.partyName || 'Sundry Debtors'}`,
            narration: `GST Reversal SGST #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `GST Reversal SGST – ${dcn.partyName}`,
            debit: dcn.sgstAmount,
            credit: 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_gst_igst' && (dcn.igstAmount || 0) > 0) {
          rawLines.push({
            id: `dcn_ig_${dcn.id}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: 'Credit Note',
            opposingLedger: `To ${dcn.partyName || 'Sundry Debtors'}`,
            narration: `GST Reversal IGST #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `GST Reversal IGST – ${dcn.partyName}`,
            debit: dcn.igstAmount,
            credit: 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
        if (accId === 'acc_round_off') {
          if (dcn.roundOff && Math.abs(dcn.roundOff) > 0.0001) {
            rawLines.push({
              id: `dcn_ro_${dcn.id}`,
              date: d,
              voucherNo: dcn.noteNumber,
              voucherType: 'Credit Note',
              opposingLedger: `To ${dcn.partyName || 'Sundry Debtors'}`,
              narration: `Round Off on Credit Note #${dcn.noteNumber}`,
              bankRef: '',
              particulars: `Round Off – ${dcn.partyName} (#${dcn.noteNumber})`,
              debit: dcn.roundOff > 0 ? dcn.roundOff : 0,
              credit: dcn.roundOff < 0 ? Math.abs(dcn.roundOff) : 0,
              sourceType: 'DEBIT_CREDIT_NOTE',
              sourceId: dcn.id,
              rawObj: dcn
            });
          }
          const noteDr = taxableVal + (dcn.cgstAmount || 0) + (dcn.sgstAmount || 0) + (dcn.igstAmount || 0)
            + (dcn.roundOff && dcn.roundOff > 0.0001 ? dcn.roundOff : 0)
            + (dcn.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.debit || 0) : 0), 0);
          const noteCr = (dcn.grandTotal || 0)
            + (dcn.roundOff && dcn.roundOff < -0.0001 ? Math.abs(dcn.roundOff) : 0)
            + (dcn.extraLedgerLines || []).reduce((s, el) => s + (el.accountId ? (el.credit || 0) : 0), 0);
          const noteAutoRo = getAutoRoundOffAdjustment(noteDr, noteCr);
          if (noteAutoRo) {
            rawLines.push({
              id: `dcn_aro_${dcn.id}`,
              date: d,
              voucherNo: dcn.noteNumber,
              voucherType: 'Credit Note',
              opposingLedger: `To ${dcn.partyName || 'Sundry Debtors'}`,
              narration: `Auto Round Off on Credit Note #${dcn.noteNumber}`,
              bankRef: '',
              particulars: `Auto Round Off – ${dcn.partyName} (#${dcn.noteNumber})`,
              debit: noteAutoRo.debit,
              credit: noteAutoRo.credit,
              sourceType: 'DEBIT_CREDIT_NOTE',
              sourceId: dcn.id,
              rawObj: dcn
            });
          }
        }
      }

      (dcn.extraLedgerLines || []).forEach((el, eIdx) => {
        if (el.accountId === accId) {
          rawLines.push({
            id: `dcn_ex_${dcn.id}_${eIdx}`,
            date: d,
            voucherNo: dcn.noteNumber,
            voucherType: isCreditNote ? 'Credit Note' : 'Debit Note',
            opposingLedger: `To/By ${dcn.partyName || 'Party'}`,
            narration: `${el.accountName || resolvedAccount!.name} #${dcn.noteNumber}`,
            bankRef: '',
            particulars: `${el.accountName || resolvedAccount!.name} – ${dcn.partyName}`,
            debit: el.debit || 0,
            credit: el.credit || 0,
            sourceType: 'DEBIT_CREDIT_NOTE',
            sourceId: dcn.id,
            rawObj: dcn
          });
        }
      });
    }
  }

  // Sort chronologically by normalized ISO date
  rawLines.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const openVal = resolvedParty ? (resolvedParty.openingBalance || 0) : (resolvedAccount?.openingBalance || 0);
  const openType = resolvedParty
    ? (resolvedParty.openingBalanceType || resolvedParty.balanceType || 'DR')
    : (resolvedAccount?.balanceType || 'DR');
  let runningBal = openType === 'DR' ? openVal : -openVal;

  const filteredLines: RawLine[] = [];
  for (const line of rawLines) {
    if (normStart && line.date && line.date < normStart) {
      runningBal += (line.debit - line.credit);
    } else if (normEnd && line.date && line.date > normEnd) {
      // exclude entries beyond endDate
    } else {
      filteredLines.push(line);
    }
  }

  const openingForPeriod = Math.round(runningBal * 100) / 100;
  let totalDebit = 0;
  let totalCredit = 0;

  const rows: LedgerStatementRow[] = filteredLines.map(line => {
    totalDebit += line.debit;
    totalCredit += line.credit;
    runningBal = runningBal + line.debit - line.credit;
    const roundedRun = Math.round(runningBal * 100) / 100;
    return {
      ...line,
      runningBalance: Math.abs(roundedRun),
      runningType: roundedRun >= 0 ? 'DR' : 'CR'
    };
  });

  const closingSignedDr = Math.round(runningBal * 100) / 100;

  return {
    kind,
    account: resolvedAccount,
    party: resolvedParty,
    title: resolvedParty ? resolvedParty.name : (resolvedAccount?.name || target.targetName || 'Ledger Statement'),
    code: resolvedParty ? (resolvedParty.code || '') : (resolvedAccount?.code || ''),
    categoryLabel: resolvedParty ? (resolvedParty.state || resolvedParty.type) : (resolvedAccount?.category || ''),
    gstin: resolvedParty ? (resolvedParty.gstin || '') : '',
    openingForPeriod,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    closingBalance: Math.abs(closingSignedDr),
    closingType: closingSignedDr >= 0 ? 'DR' : 'CR',
    closingSignedDr,
    rows
  };
}

export interface MonthlyLedgerSummaryRow {
  monthKey: string; // YYYY-MM
  label: string; // e.g. 'Apr 2025'
  monthIndex: number; // 0-11 (Apr=0 ... Mar=11)
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  openingBalance: number;
  openingType: 'DR' | 'CR';
  debit: number;
  credit: number;
  closingBalance: number;
  closingType: 'DR' | 'CR';
  closingSignedDr: number;
  txCount: number;
  rows: LedgerStatementRow[];
}

export interface MonthlyLedgerSummaryResult {
  statement: LedgerStatementResult;
  fyYearStart: number;
  fyLabel: string;
  months: MonthlyLedgerSummaryRow[];
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  closingType: 'DR' | 'CR';
}

const FY_MONTH_ORDER = [
  { monthNum: 4, short: 'Apr' },
  { monthNum: 5, short: 'May' },
  { monthNum: 6, short: 'Jun' },
  { monthNum: 7, short: 'Jul' },
  { monthNum: 8, short: 'Aug' },
  { monthNum: 9, short: 'Sep' },
  { monthNum: 10, short: 'Oct' },
  { monthNum: 11, short: 'Nov' },
  { monthNum: 12, short: 'Dec' },
  { monthNum: 1, short: 'Jan' },
  { monthNum: 2, short: 'Feb' },
  { monthNum: 3, short: 'Mar' }
];

function parseFyStartYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const iso = normalizeDateISO(dateStr) || dateStr;
  const m = iso.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const yr = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  if (isNaN(yr) || isNaN(mo)) return null;
  return mo >= 4 ? yr : yr - 1;
}

/**
 * Builds an April-to-March 12-month rollup for any Account or Party ledger.
 * Uses `buildAccountOrPartyLedgerStatement` internally so monthly figures match P&L / BS 100%.
 */
export function buildMonthlyLedgerSummary(
  data: AppData,
  target: LedgerStatementTarget,
  fyStartOverride?: string
): MonthlyLedgerSummaryResult {
  const fullStatement = buildAccountOrPartyLedgerStatement(data, {
    ...target,
    startDate: undefined,
    endDate: undefined
  });

  let fyYearStart = parseFyStartYear(fyStartOverride || target.startDate || data.company.financialYearStart);
  if (!fyYearStart && fullStatement.rows.length > 0) {
    fyYearStart = parseFyStartYear(fullStatement.rows[fullStatement.rows.length - 1].date);
  }
  if (!fyYearStart) {
    const now = new Date();
    fyYearStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  }

  const fyStartIso = `${fyYearStart}-04-01`;
  const fyEndIso = `${fyYearStart + 1}-03-31`;

  const statement = buildAccountOrPartyLedgerStatement(data, {
    ...target,
    startDate: fyStartIso,
    endDate: fyEndIso
  });

  const rowsByMonth = new Map<string, LedgerStatementRow[]>();
  for (const r of statement.rows) {
    const iso = normalizeDateISO(r.date) || r.date || '';
    const mk = iso.slice(0, 7);
    if (!rowsByMonth.has(mk)) rowsByMonth.set(mk, []);
    rowsByMonth.get(mk)!.push(r);
  }

  let runningSigned = statement.openingForPeriod;
  const months: MonthlyLedgerSummaryRow[] = FY_MONTH_ORDER.map((mDef, idx) => {
    const calYear = mDef.monthNum >= 4 ? fyYearStart! : fyYearStart! + 1;
    const mm = String(mDef.monthNum).padStart(2, '0');
    const monthKey = `${calYear}-${mm}`;
    const lastDay = new Date(calYear, mDef.monthNum, 0).getDate();
    const startDate = `${calYear}-${mm}-01`;
    const endDate = `${calYear}-${mm}-${String(lastDay).padStart(2, '0')}`;

    const monthRows = rowsByMonth.get(monthKey) || [];
    const openingSigned = Math.round(runningSigned * 100) / 100;
    let dr = 0;
    let cr = 0;
    for (const r of monthRows) {
      dr += r.debit || 0;
      cr += r.credit || 0;
    }
    dr = Math.round(dr * 100) / 100;
    cr = Math.round(cr * 100) / 100;
    runningSigned = Math.round((runningSigned + dr - cr) * 100) / 100;

    return {
      monthKey,
      label: `${mDef.short} ${calYear}`,
      monthIndex: idx,
      startDate,
      endDate,
      openingBalance: Math.abs(openingSigned),
      openingType: openingSigned >= 0 ? 'DR' : 'CR',
      debit: dr,
      credit: cr,
      closingBalance: Math.abs(runningSigned),
      closingType: runningSigned >= 0 ? 'DR' : 'CR',
      closingSignedDr: runningSigned,
      txCount: monthRows.length,
      rows: monthRows
    };
  });

  return {
    statement,
    fyYearStart,
    fyLabel: `FY ${fyYearStart}-${String(fyYearStart + 1).slice(-2)}`,
    months,
    totalDebit: statement.totalDebit,
    totalCredit: statement.totalCredit,
    closingBalance: statement.closingBalance,
    closingType: statement.closingType
  };
}

export interface BooksZeroDiffDiagnostic {
  isZeroDifference: boolean;
  trialBalanceDr: number;
  trialBalanceCr: number;
  trialBalanceDiff: number;
  openingDr: number;
  openingCr: number;
  openingDiff: number;
  balanceSheetAssets: number;
  balanceSheetLiabilitiesAndEquity: number;
  balanceSheetDiff: number;
  suspenseBalance: number;
  unbalancedVouchersCount: number;
  unbalancedSalesCount?: number;
  unbalancedPurchasesCount?: number;
  unbalancedNotesCount?: number;
  issues: string[];
}

/**
 * Verifies Trial Balance, Opening Balances, Balance Sheet (with Closing Stock & Net Profit),
 * Suspense ledgers, and per-document Double-Entry Integrity (Total Debit == Total Credit)
 * across Sales, Purchases, Receipts, Payments, Contras, Journals, and Notes.
 */
export function auditBooksZeroDifference(data: AppData): BooksZeroDiffDiagnostic {
  const balancesMap = calculateAccountBalances(data);
  const allAccounts = mergeAccountsWithBalancesMap(data, balancesMap);
  const summary = getFinancialSummary(data);

  let tbDr = 0;
  let tbCr = 0;
  let openDr = 0;
  let openCr = 0;
  let totalAssetsSigned = 0;
  let totalLiabEqSigned = 0;
  let suspenseBalance = 0;

  for (const acc of allAccounts) {
    if (acc.isGroup) continue;
    const op = Math.abs(Number(acc.openingBalance) || 0);
    if (acc.balanceType === 'DR') openDr += op;
    else openCr += op;

    const bal = balancesMap.get(acc.id);
    const net = bal ? bal.netBalance : op;
    const bType = bal ? bal.balanceType : acc.balanceType;

    if (bType === 'DR') tbDr += net;
    else tbCr += net;

    const cls = resolveAccountClassification(acc, data.accountGroups);
    if (cls.isSuspense) {
      suspenseBalance += net;
    }

    if (cls.category === 'ASSET') {
      if (isEffectiveStockOpeningAccount(acc, data)) continue;
      totalAssetsSigned += bType === 'DR' ? net : -net;
    } else if (cls.category === 'LIABILITY' || cls.category === 'EQUITY') {
      totalLiabEqSigned += bType === 'CR' ? net : -net;
    }
  }

  const closingStock = calculateClosingStock(data);
  const balanceSheetAssets = Math.round((totalAssetsSigned + closingStock) * 100) / 100;
  const balanceSheetLiabilitiesAndEquity = Math.round((totalLiabEqSigned + summary.netProfit) * 100) / 100;

  const trialBalanceDr = Math.round(tbDr * 100) / 100;
  const trialBalanceCr = Math.round(tbCr * 100) / 100;
  const trialBalanceDiff = Math.round((trialBalanceDr - trialBalanceCr) * 100) / 100;

  const openingDr = Math.round(openDr * 100) / 100;
  const openingCr = Math.round(openCr * 100) / 100;
  const openingDiff = Math.round((openingDr - openingCr) * 100) / 100;

  const balanceSheetDiff = Math.round((balanceSheetAssets - balanceSheetLiabilitiesAndEquity) * 100) / 100;

  // Per-voucher Double-Entry Check (Payment, Receipt, Contra, Journal)
  let unbalancedVouchersCount = 0;
  for (const vch of data.vouchers || []) {
    if ((vch as any).isOptional || (vch as any).isCancelled) continue;
    let dr = 0;
    let cr = 0;
    for (const e of vch.entries || []) {
      dr += Number(e.debit) || 0;
      cr += Number(e.credit) || 0;
    }
    if (vch.type !== 'CONTRA') {
      const autoRo = getAutoRoundOffAdjustment(dr, cr);
      if (autoRo) {
        dr += autoRo.debit;
        cr += autoRo.credit;
      }
    }
    if (Math.abs(dr - cr) >= 0.001) {
      unbalancedVouchersCount++;
    }
  }

  // Per-Sales Invoice Double-Entry Check (Cash/Bank/Debtors Dr === Sales + Tax + RoundOff Cr)
  let unbalancedSalesCount = 0;
  for (const inv of data.invoices || []) {
    if (inv.status === 'CANCELLED') continue;
    const settlement = resolveSalesInvoiceSettlement(data, inv);
    let dr = settlement.debtorsAmount + settlement.legs.reduce((s, l) => s + l.amount, 0);
    let cr = ((inv.subtotal || 0) - (inv.totalDiscount || 0)) + (inv.cgstAmount || 0) + (inv.sgstAmount || 0) + (inv.igstAmount || 0);
    if (inv.roundOff && Math.abs(inv.roundOff) > 0.0001) {
      if (inv.roundOff > 0) cr += inv.roundOff;
      else dr += Math.abs(inv.roundOff);
    }
    for (const el of inv.extraLedgerLines || []) {
      if (!el.accountId) continue;
      dr += el.debit || 0;
      cr += el.credit || 0;
    }
    const autoRo = getAutoRoundOffAdjustment(dr, cr);
    if (autoRo) {
      dr += autoRo.debit;
      cr += autoRo.credit;
    }
    if (Math.abs(dr - cr) >= 0.001) {
      unbalancedSalesCount++;
    }
  }

  // Per-Purchase Bill Double-Entry Check (Purchase + ITC + RoundOff Dr === Cash/Bank/Creditors Cr)
  let unbalancedPurchasesCount = 0;
  for (const pur of data.purchaseInvoices || []) {
    if (pur.status === 'CANCELLED') continue;
    const purSettlement = resolvePurchaseBillSettlement(data, pur);
    let dr = ((pur.subtotal || 0) - (pur.totalDiscount || 0)) + (pur.cgstAmount || 0) + (pur.sgstAmount || 0) + (pur.igstAmount || 0);
    let cr = purSettlement.creditorsAmount + purSettlement.legs.reduce((s, l) => s + l.amount, 0);
    if (pur.roundOff && Math.abs(pur.roundOff) > 0.0001) {
      if (pur.roundOff > 0) dr += pur.roundOff;
      else cr += Math.abs(pur.roundOff);
    }
    for (const el of pur.extraLedgerLines || []) {
      if (!el.accountId) continue;
      dr += el.debit || 0;
      cr += el.credit || 0;
    }
    const autoRo = getAutoRoundOffAdjustment(dr, cr);
    if (autoRo) {
      dr += autoRo.debit;
      cr += autoRo.credit;
    }
    if (Math.abs(dr - cr) >= 0.001) {
      unbalancedPurchasesCount++;
    }
  }

  // Per-Debit/Credit Note Double-Entry Check
  let unbalancedNotesCount = 0;
  for (const note of data.debitCreditNotes || []) {
    let dr = 0;
    let cr = 0;
    const taxableVal = (note.subtotal || 0) - (note.totalDiscount || 0);
    if (note.type === 'DEBIT_NOTE') {
      dr += note.grandTotal || 0;
      cr += taxableVal + (note.cgstAmount || 0) + (note.sgstAmount || 0) + (note.igstAmount || 0) + (note.cessAmount || 0);
      if (note.roundOff && Math.abs(note.roundOff) > 0.0001) {
        if (note.roundOff > 0) cr += note.roundOff;
        else dr += Math.abs(note.roundOff);
      }
    } else {
      dr += taxableVal + (note.cgstAmount || 0) + (note.sgstAmount || 0) + (note.igstAmount || 0) + (note.cessAmount || 0);
      cr += note.grandTotal || 0;
      if (note.roundOff && Math.abs(note.roundOff) > 0.0001) {
        if (note.roundOff > 0) dr += note.roundOff;
        else cr += Math.abs(note.roundOff);
      }
    }
    for (const el of note.extraLedgerLines || []) {
      if (!el.accountId) continue;
      dr += el.debit || 0;
      cr += el.credit || 0;
    }
    const autoRo = getAutoRoundOffAdjustment(dr, cr);
    if (autoRo) {
      dr += autoRo.debit;
      cr += autoRo.credit;
    }
    if (Math.abs(dr - cr) >= 0.001) {
      unbalancedNotesCount++;
    }
  }

  const issues: string[] = [];
  if (Math.abs(openingDiff) >= 0.001) {
    issues.push(
      `Opening Balances differ by ₹${Math.abs(openingDiff).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${openingDiff > 0 ? 'Dr excess' : 'Cr excess'}).`
    );
  }
  if (Math.abs(trialBalanceDiff) >= 0.001) {
    issues.push(
      `Trial Balance out of balance by ₹${Math.abs(trialBalanceDiff).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    );
  }
  if (Math.abs(balanceSheetDiff) >= 0.001) {
    issues.push(
      `Balance Sheet difference of ₹${Math.abs(balanceSheetDiff).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (Assets vs Liabilities + Net Profit).`
    );
  }
  if (suspenseBalance > 0.001) {
    issues.push(
      `Suspense Account holds ₹${suspenseBalance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pending ledger classification.`
    );
  }
  if (unbalancedVouchersCount > 0) {
    issues.push(`${unbalancedVouchersCount} voucher(s) have unequal Debit & Credit totals.`);
  }
  if (unbalancedSalesCount > 0) {
    issues.push(`${unbalancedSalesCount} sales invoice(s) have unequal Debit & Credit totals.`);
  }
  if (unbalancedPurchasesCount > 0) {
    issues.push(`${unbalancedPurchasesCount} purchase bill(s) have unequal Debit & Credit totals.`);
  }
  if (unbalancedNotesCount > 0) {
    issues.push(`${unbalancedNotesCount} debit/credit note(s) have unequal Debit & Credit totals.`);
  }

  const isZeroDifference =
    Math.abs(trialBalanceDiff) < 0.001 &&
    Math.abs(balanceSheetDiff) < 0.001 &&
    unbalancedVouchersCount === 0 &&
    unbalancedSalesCount === 0 &&
    unbalancedPurchasesCount === 0 &&
    unbalancedNotesCount === 0;

  return {
    isZeroDifference,
    trialBalanceDr,
    trialBalanceCr,
    trialBalanceDiff,
    openingDr,
    openingCr,
    openingDiff,
    balanceSheetAssets,
    balanceSheetLiabilitiesAndEquity,
    balanceSheetDiff,
    suspenseBalance: Math.round(suspenseBalance * 100) / 100,
    unbalancedVouchersCount,
    unbalancedSalesCount,
    unbalancedPurchasesCount,
    unbalancedNotesCount,
    issues
  };
}

export interface LedgerBudgetVarianceSummary {
  accountId: string;
  accountName: string;
  monthKey: string;
  monthlyLimit: number;
  actualExpense: number;
  varianceAmount: number;
  variancePercent: number;
  utilizationPercent: number;
  status: 'HEALTHY' | 'WARNING' | 'EXCEEDED';
}

export interface VoucherBudgetOverrunAlert {
  accountId: string;
  accountName: string;
  monthKey: string;
  monthlyLimit: number;
  currentActual: number;
  proposedAmount: number;
  projectedActual: number;
  exceededBy: number;
  exceededPercent: number;
}

/**
 * Pulls live monthly net expense (Debit - Credit within YYYY-MM) for a ledger account
 * directly from the canonical General Ledger Statement engine (including Payments,
 * Journals, Purchase Bills, and Debit/Credit Notes).
 */
export function getMonthlyLedgerActualExpense(
  data: AppData,
  accountId: string,
  monthKey: string,
  excludeVoucherId?: string
): number {
  if (!accountId || !/^\d{4}-\d{2}$/.test(monthKey)) return 0;
  const effectiveData: AppData = excludeVoucherId
    ? { ...data, vouchers: (data.vouchers || []).filter(v => v.id !== excludeVoucherId) }
    : data;

  const [yrStr, moStr] = monthKey.split('-');
  const yr = parseInt(yrStr, 10);
  const mo = parseInt(moStr, 10);
  const lastDay = new Date(yr, mo, 0).getDate();
  const startDate = `${yrStr}-${moStr}-01`;
  const endDate = `${yrStr}-${moStr}-${String(lastDay).padStart(2, '0')}`;

  const stmt = buildAccountOrPartyLedgerStatement(effectiveData, {
    partyOrAccountId: accountId,
    preferredKind: 'ACCOUNT',
    startDate,
    endDate
  });

  const netExpense = Math.round(((stmt.totalDebit || 0) - (stmt.totalCredit || 0)) * 100) / 100;
  return Math.max(0, netExpense);
}

/**
 * Computes Budget vs. Actual Variance (Rs and %) using live ledger postings from accounting.ts.
 */
export function getLedgerBudgetVarianceSummary(
  data: AppData,
  budget: { accountId: string; accountName: string; monthlyLimit: number },
  monthKey: string
): LedgerBudgetVarianceSummary {
  const actualExpense = getMonthlyLedgerActualExpense(data, budget.accountId, monthKey);
  const monthlyLimit = Math.max(0, round2(budget.monthlyLimit || 0));
  const varianceAmount = round2(monthlyLimit - actualExpense);
  const utilizationPercent = monthlyLimit > 0 ? round2((actualExpense / monthlyLimit) * 100) : 0;
  const variancePercent = monthlyLimit > 0 ? round2(((actualExpense - monthlyLimit) / monthlyLimit) * 100) : 0;

  let status: 'HEALTHY' | 'WARNING' | 'EXCEEDED' = 'HEALTHY';
  if (monthlyLimit > 0) {
    if (actualExpense > monthlyLimit + 0.005) status = 'EXCEEDED';
    else if (utilizationPercent >= 80) status = 'WARNING';
  }

  return {
    accountId: budget.accountId,
    accountName: budget.accountName,
    monthKey,
    monthlyLimit,
    actualExpense,
    varianceAmount,
    variancePercent,
    utilizationPercent,
    status
  };
}

/**
 * Evaluates candidate Expense/Payment/Journal voucher lines against configured monthly budgets.
 * Returns non-blocking overrun alerts whenever projected monthly spend exceeds budget limit.
 */
export function evaluateBudgetOverrunForVoucher(
  data: AppData,
  entries: Array<{ accountId?: string; accountName?: string; debit?: number; credit?: number }>,
  voucherDate: string,
  excludeVoucherId?: string
): VoucherBudgetOverrunAlert[] {
  const budgets = data.budgets || [];
  if (budgets.length === 0) return [];

  const iso = normalizeDateISO(voucherDate) || voucherDate || '';
  const monthKey = iso.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return [];

  const proposedByAcc = new Map<string, number>();
  for (const line of entries || []) {
    if (!line.accountId) continue;
    const netDr = (Number(line.debit) || 0) - (Number(line.credit) || 0);
    if (netDr <= 0) continue;
    proposedByAcc.set(line.accountId, (proposedByAcc.get(line.accountId) || 0) + netDr);
  }

  const alerts: VoucherBudgetOverrunAlert[] = [];
  for (const [accId, proposedRaw] of proposedByAcc.entries()) {
    const proposedAmount = round2(proposedRaw);
    if (proposedAmount <= 0) continue;

    const budget =
      budgets.find(b => b.accountId === accId && b.period === monthKey) ||
      budgets.find(b => b.accountId === accId && (!b.period || b.period === 'ALL'));

    if (!budget || (budget.monthlyLimit || 0) <= 0) continue;

    const currentActual = getMonthlyLedgerActualExpense(data, accId, monthKey, excludeVoucherId);
    const projectedActual = round2(currentActual + proposedAmount);
    const monthlyLimit = round2(budget.monthlyLimit);

    if (projectedActual > monthlyLimit + 0.005) {
      const exceededBy = round2(projectedActual - monthlyLimit);
      const exceededPercent = round2((exceededBy / monthlyLimit) * 100);
      const acc = (data.accounts || []).find(a => a.id === accId);
      alerts.push({
        accountId: accId,
        accountName: acc?.name || budget.accountName || accId,
        monthKey,
        monthlyLimit,
        currentActual,
        proposedAmount,
        projectedActual,
        exceededBy,
        exceededPercent
      });
    }
  }

  return alerts;
}


