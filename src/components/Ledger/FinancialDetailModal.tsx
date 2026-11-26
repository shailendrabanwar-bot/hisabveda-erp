import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  Download,
  Package,
  Layers,
  Receipt,
  ChevronRight,
  ArrowLeft,
  ArrowUpRight,
  Info,
  FileText,
  Calendar,
  Pencil,
  Eye,
} from 'lucide-react';
import {
  Account,
  AppData,
  DebitCreditNote,
  PurchaseInvoice,
  SalesInvoice,
  Voucher,
} from '../../types';
import { formatCurrency } from '../../utils/storage';
import {
  buildMonthlyLedgerSummary,
  calculateAccountBalances,
  getItemClosingStockValue,
  getSignedLedgerAmount,
  LedgerStatementRow,
  MonthlyLedgerSummaryRow,
} from '../../utils/accounting';

export interface FinancialGroupLedgerRow {
  account: Account;
  openingDr: number;
  openingCr: number;
  periodDr: number;
  periodCr: number;
  closingDr: number;
  closingCr: number;
  signedAmount: number;
}

export type FinancialDetailPayload =
  | {
      kind: 'GROUP_LEDGERS';
      title: string;
      subtitle?: string;
      formulaHint?: string;
      metricLabel?: string;
      metricValue?: number;
      accounts: FinancialGroupLedgerRow[];
    }
  | {
      kind: 'STOCK_VALUATION';
      stockType: 'OPENING' | 'CLOSING';
      title: string;
      subtitle?: string;
      accInventoryOpening?: number;
    }
  | {
      kind: 'TRANSACTION_DETAIL';
      title: string;
      voucherKind: 'SALES' | 'PURCHASE' | 'VOUCHER' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
      record: SalesInvoice | PurchaseInvoice | Voucher | DebitCreditNote;
    };

type DrillStep =
  | { kind: 'ROOT' }
  | {
      kind: 'SUB_GROUP_LEDGERS';
      subGroupName: string;
    }
  | {
      kind: 'MONTHLY_SUMMARY';
      id: string;
      name: string;
      preferredKind?: 'ACCOUNT' | 'PARTY';
    }
  | {
      kind: 'MONTH_VOUCHERS';
      id: string;
      name: string;
      preferredKind?: 'ACCOUNT' | 'PARTY';
      monthKey: string; // 'ALL' for full register
      monthLabel: string;
    }
  | {
      kind: 'TX_DETAIL';
      title: string;
      voucherKind: 'SALES' | 'PURCHASE' | 'VOUCHER' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
      record: SalesInvoice | PurchaseInvoice | Voucher | DebitCreditNote;
    };

interface FinancialDetailModalProps {
  data: AppData;
  isHindi: boolean;
  payload: FinancialDetailPayload;
  reportTitle?: string;
  isEditModalOpen?: boolean;
  onClose: () => void;
  onInspectAccountOrParty?: (
    accountOrPartyId: string,
    name?: string,
    preferredKind?: 'ACCOUNT' | 'PARTY'
  ) => void;
  onEditInvoice?: (inv: SalesInvoice) => void;
  onEditPurchaseBill?: (pur: PurchaseInvoice) => void;
  onEditVoucher?: (vch: Voucher) => void;
}

function getSourceKindAndRecord(
  row: LedgerStatementRow
): {
  voucherKind: 'SALES' | 'PURCHASE' | 'VOUCHER' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
  record: any;
  title: string;
} {
  if (row.sourceType === 'SALES_INVOICE') {
    return {
      voucherKind: 'SALES',
      record: row.rawObj,
      title: `Sales Invoice #${row.voucherNo}`,
    };
  }
  if (row.sourceType === 'PURCHASE_BILL') {
    return {
      voucherKind: 'PURCHASE',
      record: row.rawObj,
      title: `Purchase Bill #${row.voucherNo}`,
    };
  }
  if (row.sourceType === 'DEBIT_CREDIT_NOTE') {
    const isCredit = (row.rawObj as DebitCreditNote)?.type === 'CREDIT_NOTE';
    return {
      voucherKind: isCredit ? 'CREDIT_NOTE' : 'DEBIT_NOTE',
      record: row.rawObj,
      title: `${isCredit ? 'Credit Note' : 'Debit Note'} #${row.voucherNo}`,
    };
  }
  return {
    voucherKind: 'VOUCHER',
    record: row.rawObj,
    title: `${row.voucherType || 'Voucher'} #${row.voucherNo}`,
  };
}

export const FinancialDetailModal: React.FC<FinancialDetailModalProps> = ({
  data,
  isHindi,
  payload,
  reportTitle,
  isEditModalOpen = false,
  onClose,
  onEditInvoice,
  onEditPurchaseBill,
  onEditVoucher,
}) => {
  const currency = data.company.currency || 'INR';
  const [search, setSearch] = useState('');
  const [drillStack, setDrillStack] = useState<DrillStep[]>([{ kind: 'ROOT' }]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [groupViewMode, setGroupViewMode] = useState<'SUBGROUPS' | 'LEDGERS'>('SUBGROUPS');

  // Reset stack when root payload identity changes
  useEffect(() => {
    setDrillStack([{ kind: 'ROOT' }]);
    setSearch('');
    setSelectedIndex(0);
    setGroupViewMode('SUBGROUPS');
  }, [payload]);

  const currentStep = drillStack[drillStack.length - 1] || { kind: 'ROOT' };

  const pushStep = (step: DrillStep) => {
    setSearch('');
    setSelectedIndex(0);
    setDrillStack((prev) => [...prev, step]);
  };

  const popStep = () => {
    if (drillStack.length > 1) {
      setSearch('');
      setSelectedIndex(0);
      setDrillStack((prev) => prev.slice(0, -1));
    } else {
      onClose();
    }
  };

  const jumpToCrumb = (idx: number) => {
    setSearch('');
    setSelectedIndex(0);
    setDrillStack((prev) => prev.slice(0, idx + 1));
  };

  const openAccountDrilldown = (
    id?: string,
    name?: string,
    preferredKind?: 'ACCOUNT' | 'PARTY'
  ) => {
    pushStep({
      kind: 'MONTHLY_SUMMARY',
      id: id || '',
      name: name || id || 'Ledger',
      preferredKind,
    });
  };

  // Layer 1 Stock rows
  const stockRows = useMemo(() => {
    if (payload.kind !== 'STOCK_VALUATION') return [];
    const q = search.trim().toLowerCase();
    return (data.items || [])
      .map((it) => {
        const qty =
          payload.stockType === 'OPENING'
            ? Number(it.openingStock) || 0
            : Number(it.currentStock) || 0;
        const val =
          payload.stockType === 'OPENING'
            ? Number(it.openingStockValue) > 0
              ? Number(it.openingStockValue)
              : qty * (Number(it.purchasePrice) || 0)
            : getItemClosingStockValue(it);
        const effRate =
          qty > 0 && val > 0 ? val / qty : Number(it.purchasePrice) || 0;
        return { item: it, qty, rate: effRate, value: val };
      })
      .filter((r) => Math.abs(r.qty) > 0.0001 || Math.abs(r.value) > 0.01)
      .filter((r) => {
        if (!q) return true;
        return (
          r.item.name.toLowerCase().includes(q) ||
          (r.item.category || '').toLowerCase().includes(q) ||
          (r.item.hsnSacCode || '').toLowerCase().includes(q) ||
          (r.item.code || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.value - a.value);
  }, [data.items, payload, search]);

  const stockTotalQty = useMemo(
    () => stockRows.reduce((s, r) => s + r.qty, 0),
    [stockRows]
  );
  const stockTotalVal = useMemo(
    () => stockRows.reduce((s, r) => s + r.value, 0),
    [stockRows]
  );

  // Live balances map so Level 1 Group/Sub-Group rows refresh immediately after Level 4 edits
  const liveBalancesMap = useMemo(() => calculateAccountBalances(data), [data]);

  const liveGroupAccounts = useMemo<FinancialGroupLedgerRow[]>(() => {
    if (payload.kind !== 'GROUP_LEDGERS') return [];
    return payload.accounts
      .map((row) => {
        const liveBal = liveBalancesMap.get(row.account.id);
        if (!liveBal) return row;
        const acc = liveBal.account || row.account;
        const openingDr = acc.balanceType === 'DR' ? acc.openingBalance || 0 : 0;
        const openingCr = acc.balanceType === 'CR' ? acc.openingBalance || 0 : 0;
        const periodDr = Math.max(0, Math.round((liveBal.debit - openingDr) * 100) / 100);
        const periodCr = Math.max(0, Math.round((liveBal.credit - openingCr) * 100) / 100);
        const closingDr = liveBal.balanceType === 'DR' ? liveBal.netBalance : 0;
        const closingCr = liveBal.balanceType === 'CR' ? liveBal.netBalance : 0;
        const signedAmount = getSignedLedgerAmount(liveBal, acc.category);
        return {
          account: acc,
          openingDr,
          openingCr,
          periodDr,
          periodCr,
          closingDr,
          closingCr,
          signedAmount,
        };
      })
      .filter(
        (r) =>
          Math.abs(r.openingDr) > 0.005 ||
          Math.abs(r.openingCr) > 0.005 ||
          Math.abs(r.periodDr) > 0.005 ||
          Math.abs(r.periodCr) > 0.005 ||
          Math.abs(r.signedAmount) > 0.005
      );
  }, [payload, liveBalancesMap]);

  const getAccountSubGroupLabel = (acc: Account) =>
    acc.subCategory || acc.mainGroup || acc.category || 'General Ledgers';

  const subGroupRows = useMemo(() => {
    if (payload.kind !== 'GROUP_LEDGERS') return [];
    const map = new Map<
      string,
      {
        subGroupName: string;
        ledgerCount: number;
        openingDr: number;
        openingCr: number;
        periodDr: number;
        periodCr: number;
        closingDr: number;
        closingCr: number;
        signedAmount: number;
      }
    >();
    liveGroupAccounts.forEach((row) => {
      const subGroupName = getAccountSubGroupLabel(row.account);
      const existing = map.get(subGroupName) || {
        subGroupName,
        ledgerCount: 0,
        openingDr: 0,
        openingCr: 0,
        periodDr: 0,
        periodCr: 0,
        closingDr: 0,
        closingCr: 0,
        signedAmount: 0,
      };
      existing.ledgerCount += 1;
      existing.openingDr += row.openingDr;
      existing.openingCr += row.openingCr;
      existing.periodDr += row.periodDr;
      existing.periodCr += row.periodCr;
      existing.closingDr += row.closingDr;
      existing.closingCr += row.closingCr;
      existing.signedAmount += row.signedAmount;
      map.set(subGroupName, existing);
    });
    return Array.from(map.values()).sort(
      (a, b) => Math.abs(b.signedAmount) - Math.abs(a.signedAmount)
    );
  }, [liveGroupAccounts, payload.kind]);

  const showSubGroupSummary =
    currentStep.kind === 'ROOT' &&
    payload.kind === 'GROUP_LEDGERS' &&
    subGroupRows.length > 1 &&
    groupViewMode === 'SUBGROUPS' &&
    !search.trim();

  // Layer 1 Group Ledgers (all ledgers at ROOT, or filtered by SUB_GROUP_LEDGERS)
  const filteredGroupAccounts = useMemo(() => {
    if (payload.kind !== 'GROUP_LEDGERS') return [];
    const q = search.trim().toLowerCase();
    const baseList =
      currentStep.kind === 'SUB_GROUP_LEDGERS'
        ? liveGroupAccounts.filter(
            (r) => getAccountSubGroupLabel(r.account) === currentStep.subGroupName
          )
        : liveGroupAccounts;
    return baseList
      .filter((row) => {
        if (!q) return true;
        return (
          row.account.name.toLowerCase().includes(q) ||
          row.account.code.toLowerCase().includes(q) ||
          (row.account.mainGroup || row.account.subCategory || '')
            .toLowerCase()
            .includes(q)
        );
      })
      .sort((a, b) => Math.abs(b.signedAmount) - Math.abs(a.signedAmount));
  }, [payload.kind, liveGroupAccounts, currentStep, search]);

  const groupSummary = useMemo(() => {
    if (payload.kind !== 'GROUP_LEDGERS') {
      return {
        openDr: 0,
        openCr: 0,
        periodDr: 0,
        periodCr: 0,
        closeDr: 0,
        closeCr: 0,
        netSigned: 0,
      };
    }
    return filteredGroupAccounts.reduce(
      (acc, r) => ({
        openDr: acc.openDr + r.openingDr,
        openCr: acc.openCr + r.openingCr,
        periodDr: acc.periodDr + r.periodDr,
        periodCr: acc.periodCr + r.periodCr,
        closeDr: acc.closeDr + r.closingDr,
        closeCr: acc.closeCr + r.closingCr,
        netSigned: acc.netSigned + r.signedAmount,
      }),
      {
        openDr: 0,
        openCr: 0,
        periodDr: 0,
        periodCr: 0,
        closeDr: 0,
        closeCr: 0,
        netSigned: 0,
      }
    );
  }, [filteredGroupAccounts, payload.kind]);

  // Layer 2 Monthly Summary (Apr-Mar) & Layer 3 Month Vouchers
  const activeLedgerTarget =
    currentStep.kind === 'MONTHLY_SUMMARY' || currentStep.kind === 'MONTH_VOUCHERS'
      ? {
          partyOrAccountId: currentStep.id || undefined,
          targetName: currentStep.name,
          preferredKind: currentStep.preferredKind,
        }
      : null;

  const monthlySummary = useMemo(() => {
    if (!activeLedgerTarget) return null;
    const fyStart =
      data.company.financialYearStart && data.company.financialYearStart !== 'ALL'
        ? data.company.financialYearStart
        : undefined;
    return buildMonthlyLedgerSummary(data, activeLedgerTarget, fyStart);
  }, [data, activeLedgerTarget]);

  const visibleMonths = useMemo(() => {
    if (!monthlySummary) return [];
    const q = search.trim().toLowerCase();
    if (!q) return monthlySummary.months;
    return monthlySummary.months.filter((m) =>
      m.label.toLowerCase().includes(q)
    );
  }, [monthlySummary, search]);

  const activeMonthVoucherRows = useMemo(() => {
    if (currentStep.kind !== 'MONTH_VOUCHERS' || !monthlySummary) return [];
    const baseRows =
      currentStep.monthKey === 'ALL'
        ? monthlySummary.statement.rows
        : monthlySummary.months.find((m) => m.monthKey === currentStep.monthKey)
            ?.rows || [];
    const q = search.trim().toLowerCase();
    if (!q) return baseRows;
    return baseRows.filter(
      (r) =>
        (r.particulars || '').toLowerCase().includes(q) ||
        (r.voucherNo || '').toLowerCase().includes(q) ||
        (r.voucherType || '').toLowerCase().includes(q) ||
        (r.date || '').includes(q)
    );
  }, [currentStep, monthlySummary, search]);

  // Resolve live transaction record from AppData and open actual Edit modal (Level 4) when supported
  const openVoucherLevel4OrEdit = (row: LedgerStatementRow) => {
    if (!row.rawObj) return;
    if (row.sourceType === 'SALES_INVOICE') {
      const liveInv =
        (data.invoices || []).find((i) => i.id === row.rawObj?.id) ||
        (row.rawObj as SalesInvoice);
      if (onEditInvoice) {
        onEditInvoice(liveInv);
        return;
      }
    } else if (row.sourceType === 'PURCHASE_BILL') {
      const livePur =
        (data.purchaseInvoices || []).find((p) => p.id === row.rawObj?.id) ||
        (row.rawObj as PurchaseInvoice);
      if (onEditPurchaseBill) {
        onEditPurchaseBill(livePur);
        return;
      }
    } else if (row.sourceType === 'VOUCHER') {
      const liveVch =
        (data.vouchers || []).find((v) => v.id === row.rawObj?.id) ||
        (row.rawObj as Voucher);
      if (onEditVoucher) {
        onEditVoucher(liveVch);
        return;
      }
    }
    const info = getSourceKindAndRecord(row);
    pushStep({
      kind: 'TX_DETAIL',
      title: info.title,
      voucherKind: info.voucherKind,
      record: info.record,
    });
  };

  // Keyboard navigation: Esc steps back 1 layer, Enter drills selected row, ArrowUp/Down moves selection
  useEffect(() => {
    if (isEditModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        popStep();
        return;
      }

      if (isInput) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => prev + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Enter') {
        if (showSubGroupSummary && subGroupRows.length > 0) {
          const sg = subGroupRows[Math.min(selectedIndex, subGroupRows.length - 1)];
          if (sg) {
            e.preventDefault();
            pushStep({ kind: 'SUB_GROUP_LEDGERS', subGroupName: sg.subGroupName });
          }
        } else if (
          (currentStep.kind === 'ROOT' || currentStep.kind === 'SUB_GROUP_LEDGERS') &&
          payload.kind === 'GROUP_LEDGERS' &&
          filteredGroupAccounts.length > 0
        ) {
          const row =
            filteredGroupAccounts[
              Math.min(selectedIndex, filteredGroupAccounts.length - 1)
            ];
          if (row) {
            e.preventDefault();
            openAccountDrilldown(row.account.id, row.account.name, 'ACCOUNT');
          }
        } else if (
          currentStep.kind === 'MONTHLY_SUMMARY' &&
          visibleMonths.length > 0
        ) {
          const m =
            visibleMonths[Math.min(selectedIndex, visibleMonths.length - 1)];
          if (m) {
            e.preventDefault();
            pushStep({
              kind: 'MONTH_VOUCHERS',
              id: currentStep.id,
              name: currentStep.name,
              preferredKind: currentStep.preferredKind,
              monthKey: m.monthKey,
              monthLabel: m.label,
            });
          }
        } else if (
          currentStep.kind === 'MONTH_VOUCHERS' &&
          activeMonthVoucherRows.length > 0
        ) {
          const r =
            activeMonthVoucherRows[
              Math.min(selectedIndex, activeMonthVoucherRows.length - 1)
            ];
          if (r && r.rawObj) {
            e.preventDefault();
            openVoucherLevel4OrEdit(r);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  });

  // Effective Transaction Payload (either Layer 4 or direct TRANSACTION_DETAIL root) resolved live from AppData
  const effectiveTxStep = useMemo(() => {
    const rawStep =
      currentStep.kind === 'TX_DETAIL'
        ? currentStep
        : payload.kind === 'TRANSACTION_DETAIL'
        ? {
            kind: 'TX_DETAIL' as const,
            title: payload.title,
            voucherKind: payload.voucherKind,
            record: payload.record,
          }
        : null;
    if (!rawStep || !rawStep.record) return null;
    const recId = rawStep.record.id;
    let liveRecord = rawStep.record;
    if (rawStep.voucherKind === 'SALES') {
      liveRecord = (data.invoices || []).find((i) => i.id === recId) || rawStep.record;
    } else if (rawStep.voucherKind === 'PURCHASE') {
      liveRecord = (data.purchaseInvoices || []).find((p) => p.id === recId) || rawStep.record;
    } else if (rawStep.voucherKind === 'VOUCHER') {
      liveRecord = (data.vouchers || []).find((v) => v.id === recId) || rawStep.record;
    } else {
      liveRecord = (data.debitCreditNotes || []).find((n) => n.id === recId) || rawStep.record;
    }
    return { ...rawStep, record: liveRecord };
  }, [currentStep, payload, data.invoices, data.purchaseInvoices, data.vouchers, data.debitCreditNotes]);

  const canEditCurrentTx = useMemo(() => {
    if (!effectiveTxStep?.record) return false;
    if (effectiveTxStep.voucherKind === 'SALES') return Boolean(onEditInvoice);
    if (effectiveTxStep.voucherKind === 'PURCHASE')
      return Boolean(onEditPurchaseBill);
    if (effectiveTxStep.voucherKind === 'VOUCHER') return Boolean(onEditVoucher);
    return false;
  }, [effectiveTxStep, onEditInvoice, onEditPurchaseBill, onEditVoucher]);

  const handleEditCurrentTx = () => {
    if (!effectiveTxStep?.record) return;
    if (effectiveTxStep.voucherKind === 'SALES' && onEditInvoice) {
      const live =
        (data.invoices || []).find((i) => i.id === effectiveTxStep.record?.id) ||
        (effectiveTxStep.record as SalesInvoice);
      onEditInvoice(live);
    } else if (effectiveTxStep.voucherKind === 'PURCHASE' && onEditPurchaseBill) {
      const live =
        (data.purchaseInvoices || []).find((p) => p.id === effectiveTxStep.record?.id) ||
        (effectiveTxStep.record as PurchaseInvoice);
      onEditPurchaseBill(live);
    } else if (effectiveTxStep.voucherKind === 'VOUCHER' && onEditVoucher) {
      const live =
        (data.vouchers || []).find((v) => v.id === effectiveTxStep.record?.id) ||
        (effectiveTxStep.record as Voucher);
      onEditVoucher(live);
    }
  };

  const handleExportCsv = () => {
    let csv = '\uFEFF';
    let fileSlug = 'Financial_Detail';

    if (currentStep.kind === 'MONTHLY_SUMMARY' && monthlySummary) {
      fileSlug = `${currentStep.name.replace(/[^a-z0-9]/gi, '_')}_Monthly_Apr_Mar`;
      csv += 'Month,Tx Count,Opening Bal,Opening Type,Debit,Credit,Closing Bal,Closing Type\n';
      monthlySummary.months.forEach((m) => {
        csv += `"${m.label}",${m.txCount},${m.openingBalance.toFixed(2)},${m.openingType},${m.debit.toFixed(2)},${m.credit.toFixed(2)},${m.closingBalance.toFixed(2)},${m.closingType}\n`;
      });
    } else if (currentStep.kind === 'MONTH_VOUCHERS') {
      fileSlug = `${currentStep.name.replace(/[^a-z0-9]/gi, '_')}_${currentStep.monthLabel.replace(/\s+/g, '_')}`;
      csv += 'Date,Particulars,Voucher Type,Voucher No,Debit,Credit,Running Balance\n';
      activeMonthVoucherRows.forEach((r) => {
        csv += `"${r.date}","${(r.particulars || '').replace(/"/g, '""')}","${r.voucherType}","${r.voucherNo}",${r.debit.toFixed(2)},${r.credit.toFixed(2)},"${r.runningBalance.toFixed(2)} ${r.runningType}"\n`;
      });
    } else if (payload.kind === 'STOCK_VALUATION') {
      fileSlug = `${payload.stockType}_Stock_Breakdown`;
      csv += 'Code,Item Name,Category,HSN/SAC,Quantity,Unit,Effective Cost Rate,Total Value\n';
      stockRows.forEach((r) => {
        csv += `"${r.item.code}","${r.item.name.replace(/"/g, '""')}","${(r.item.category || '').replace(/"/g, '""')}","${r.item.hsnSacCode || ''}",${r.qty.toFixed(3)},"${r.item.unit}",${r.rate.toFixed(4)},${r.value.toFixed(2)}\n`;
      });
      csv += `,,,TOTAL,${stockTotalQty.toFixed(3)},,,${stockTotalVal.toFixed(2)}\n`;
    } else if (payload.kind === 'GROUP_LEDGERS') {
      fileSlug = payload.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
      csv += 'Code,Ledger Name,Category,Group,Opening Dr,Opening Cr,Period Dr,Period Cr,Closing Dr,Closing Cr,Net Impact\n';
      filteredGroupAccounts.forEach((r) => {
        csv += `"${r.account.code}","${r.account.name.replace(/"/g, '""')}","${r.account.category}","${(r.account.mainGroup || r.account.subCategory || '').replace(/"/g, '""')}",${r.openingDr.toFixed(2)},${r.openingCr.toFixed(2)},${r.periodDr.toFixed(2)},${r.periodCr.toFixed(2)},${r.closingDr.toFixed(2)},${r.closingCr.toFixed(2)},${r.signedAmount.toFixed(2)}\n`;
      });
    } else {
      return;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileSlug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeTitle = useMemo(() => {
    if (currentStep.kind === 'TX_DETAIL') return currentStep.title;
    if (currentStep.kind === 'MONTH_VOUCHERS') {
      return `${currentStep.name} — ${currentStep.monthLabel}`;
    }
    if (currentStep.kind === 'MONTHLY_SUMMARY') {
      return `${currentStep.name} (${isHindi ? 'मासिक सारांश' : 'Monthly Summary'})`;
    }
    if (currentStep.kind === 'SUB_GROUP_LEDGERS') {
      return `${currentStep.subGroupName} — ${isHindi ? 'लेज़र सूची' : 'Ledgers'}`;
    }
    return payload.title;
  }, [currentStep, payload.title, isHindi]);

  return (
    <div
      className={`${
        isEditModalOpen ? 'hidden' : 'fixed'
      } inset-0 z-[95] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn`}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-slate-950 px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={popStep}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer shrink-0"
              title={
                drillStack.length > 1
                  ? isHindi
                    ? 'पिछला स्तर (Esc)'
                    : 'Back 1 Level (Esc)'
                  : isHindi
                  ? 'रिपोर्ट पर वापस जाएँ (Esc)'
                  : 'Back to Report (Esc)'
              }
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 shrink-0">
              {effectiveTxStep ? (
                <Receipt className="w-5 h-5" />
              ) : currentStep.kind === 'MONTHLY_SUMMARY' ||
                currentStep.kind === 'MONTH_VOUCHERS' ? (
                <Calendar className="w-5 h-5" />
              ) : payload.kind === 'STOCK_VALUATION' ? (
                <Package className="w-5 h-5" />
              ) : (
                <Layers className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base text-white truncate">
                {activeTitle}
              </h3>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {currentStep.kind === 'ROOT' && 'subtitle' in payload && payload.subtitle
                  ? payload.subtitle
                  : currentStep.kind === 'SUB_GROUP_LEDGERS'
                  ? isHindi
                    ? `सब-ग्रुप "${currentStep.subGroupName}" के सभी लेज़र • क्लिक करके अप्रैल–मार्च सारांश देखें`
                    : `Ledgers under "${currentStep.subGroupName}" • Click any ledger for Apr–Mar Monthly Summary`
                  : currentStep.kind === 'MONTHLY_SUMMARY' && monthlySummary
                  ? `${monthlySummary.fyLabel} • ${isHindi ? 'मासिक सारांश (अप्रैल–मार्च) • माह पर क्लिक करके वाउचर देखें' : 'April–March Monthly Summary • Click any month to inspect vouchers'}`
                  : currentStep.kind === 'MONTH_VOUCHERS'
                  ? isHindi
                    ? 'वाउचर रजिस्टर • किसी भी वाउचर पर क्लिक करके सीधे एडिट या विवरण खोलें'
                    : 'Voucher Register • Click any voucher row to edit invoice/voucher live'
                  : effectiveTxStep
                  ? isHindi
                    ? 'स्तर 4 वाउचर/बिल विवरण एवं लाइव एडिट'
                    : 'Level 4 Transaction Breakdown & Live Edit'
                  : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEditCurrentTx && (
              <button
                type="button"
                onClick={handleEditCurrentTx}
                className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>
                  {effectiveTxStep?.voucherKind === 'SALES'
                    ? isHindi
                      ? 'बिक्री बिल बदलें'
                      : 'Edit Sales Invoice'
                    : effectiveTxStep?.voucherKind === 'PURCHASE'
                    ? isHindi
                      ? 'परचेज बिल बदलें'
                      : 'Edit Purchase Bill'
                    : isHindi
                    ? 'वाउचर संपादित करें'
                    : 'Edit Voucher'}
                </span>
              </button>
            )}
            {!effectiveTxStep && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition cursor-pointer"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Always-Visible Clickable Breadcrumb Trail */}
        <div className="px-5 py-2 bg-slate-900 border-b border-slate-800 flex items-center flex-wrap gap-1.5 text-[11px] shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white cursor-pointer underline-offset-2 hover:underline font-medium"
          >
            {reportTitle || (isHindi ? 'वित्तीय रिपोर्ट' : 'Financial Report')}
          </button>
          {drillStack.map((step, idx) => {
            const isLast = idx === drillStack.length - 1;
            const label =
              step.kind === 'ROOT'
                ? payload.title
                : step.kind === 'SUB_GROUP_LEDGERS'
                ? step.subGroupName
                : step.kind === 'MONTHLY_SUMMARY'
                ? `${step.name} (Apr–Mar)`
                : step.kind === 'MONTH_VOUCHERS'
                ? step.monthLabel
                : step.title;
            return (
              <React.Fragment key={idx}>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <button
                  type="button"
                  disabled={isLast}
                  onClick={() => jumpToCrumb(idx)}
                  className={`truncate max-w-[220px] ${
                    isLast
                      ? 'text-indigo-300 font-bold cursor-default'
                      : 'text-slate-300 hover:text-white cursor-pointer underline-offset-2 hover:underline'
                  }`}
                >
                  {label}
                </button>
              </React.Fragment>
            );
          })}
          <span className="ml-auto text-[10px] text-slate-500 font-mono hidden sm:inline">
            ↑↓ Move • Enter: Drill Down • Esc: Step Back ({drillStack.length > 1 ? `Level ${drillStack.length} → ${drillStack.length - 1}` : 'Close'})
          </span>
        </div>

        {/* Search & Summary Strip */}
        {!effectiveTxStep && (
          <div className="px-5 py-3 bg-slate-950/60 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder={
                  currentStep.kind === 'MONTHLY_SUMMARY'
                    ? isHindi
                      ? 'महीना खोजें (जैसे Oct, Jan)...'
                      : 'Filter month (e.g. Oct, Jan)...'
                    : currentStep.kind === 'MONTH_VOUCHERS'
                    ? isHindi
                      ? 'वाउचर नं., तारीख, विवरण खोजें...'
                      : 'Search voucher no, particulars, type...'
                    : payload.kind === 'STOCK_VALUATION'
                    ? isHindi
                      ? 'स्टॉक आइटम, श्रेणी या HSN खोजें...'
                      : 'Search stock item, category or HSN...'
                    : isHindi
                    ? 'लेज़र का नाम, कोड या ग्रुप खोजें...'
                    : 'Search ledger name, code or group...'
                }
                className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder:text-slate-500 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {currentStep.kind === 'ROOT' &&
                payload.kind === 'GROUP_LEDGERS' &&
                subGroupRows.length > 1 && (
                  <div className="flex items-center bg-slate-900 p-0.5 rounded-xl border border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        setGroupViewMode('SUBGROUPS');
                        setSelectedIndex(0);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        groupViewMode === 'SUBGROUPS' && !search.trim()
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isHindi
                        ? `सब-ग्रुप (${subGroupRows.length})`
                        : `Sub-Groups (${subGroupRows.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupViewMode('LEDGERS');
                        setSelectedIndex(0);
                      }}
                      className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                        groupViewMode === 'LEDGERS' || Boolean(search.trim())
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {isHindi
                        ? `सभी लेज़र (${liveGroupAccounts.length})`
                        : `All Ledgers (${liveGroupAccounts.length})`}
                    </button>
                  </div>
                )}
              {currentStep.kind === 'ROOT' &&
                payload.kind === 'GROUP_LEDGERS' &&
                payload.formulaHint && (
                  <div className="px-3 py-1.5 rounded-xl bg-indigo-950/60 border border-indigo-500/30 text-indigo-200 font-mono text-[11px]">
                    {payload.formulaHint}
                  </div>
                )}
              {(currentStep.kind === 'ROOT' ||
                currentStep.kind === 'SUB_GROUP_LEDGERS') &&
                payload.kind === 'GROUP_LEDGERS' && (
                  <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono tabular-nums">
                    <span className="text-slate-400 mr-2">
                      {currentStep.kind === 'SUB_GROUP_LEDGERS'
                        ? currentStep.subGroupName
                        : payload.metricLabel || 'Total'}
                      :
                    </span>
                    <span className="font-extrabold text-white">
                      {formatCurrency(Math.abs(groupSummary.netSigned), currency)}
                    </span>
                  </div>
                )}
              {currentStep.kind === 'MONTHLY_SUMMARY' && monthlySummary && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      pushStep({
                        kind: 'MONTH_VOUCHERS',
                        id: currentStep.id,
                        name: currentStep.name,
                        preferredKind: currentStep.preferredKind,
                        monthKey: 'ALL',
                        monthLabel: `${monthlySummary.fyLabel} All Vouchers`,
                      })
                    }
                    className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-200 font-bold cursor-pointer"
                  >
                    {isHindi ? 'पूरे वर्ष के वाउचर देखें' : 'All Vouchers (FY)'}
                  </button>
                  <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono tabular-nums">
                    <span className="text-slate-400 mr-2">Closing:</span>
                    <span className="font-extrabold text-white">
                      {formatCurrency(monthlySummary.closingBalance, currency)}{' '}
                      {monthlySummary.closingType === 'DR' ? 'Dr' : 'Cr'}
                    </span>
                  </div>
                </>
              )}
              {currentStep.kind === 'MONTH_VOUCHERS' && (
                <div className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 font-mono tabular-nums">
                  <span className="text-slate-400 mr-2">Entries:</span>
                  <span className="font-extrabold text-white">
                    {activeMonthVoucherRows.length}
                  </span>
                </div>
              )}
              {currentStep.kind === 'ROOT' &&
                payload.kind === 'STOCK_VALUATION' && (
                  <div className="px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-500/30 font-mono tabular-nums">
                    <span className="text-slate-300 mr-2">
                      {stockRows.length} {isHindi ? 'आइटम' : 'Items'} •{' '}
                      {stockTotalQty.toLocaleString('en-IN', {
                        maximumFractionDigits: 3,
                      })}{' '}
                      Qty:
                    </span>
                    <span className="font-extrabold text-amber-300">
                      {formatCurrency(stockTotalVal, currency)}
                    </span>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
          {/* LAYER 1A: SUB-GROUPS BREAKDOWN */}
          {showSubGroupSummary && (
            <>
              <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    {isHindi
                      ? 'किसी भी सब-ग्रुप पर क्लिक करके उसके सभी लेज़र, अप्रैल–मार्च सारांश और वाउचर देखें।'
                      : 'Click any sub-group below to view its ledgers, or switch to All Ledgers.'}
                  </span>
                </span>
                <span className="hidden sm:inline text-[10px] font-mono text-slate-500">
                  ↑↓ Select • Enter: Open Sub-Group
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      <th className="p-3">Sub-Group Name</th>
                      <th className="p-3 text-center">Ledgers</th>
                      <th className="p-3 text-right">Opening Dr/Cr</th>
                      <th className="p-3 text-right">Period Debit</th>
                      <th className="p-3 text-right">Period Credit</th>
                      <th className="p-3 text-right">Closing Dr/Cr</th>
                      <th className="p-3 text-right">Net Impact</th>
                      <th className="p-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 bg-slate-900/50">
                    {subGroupRows.map((sg, idx) => {
                      const openAmt = Math.max(sg.openingDr, sg.openingCr);
                      const openType = sg.openingDr >= sg.openingCr ? 'Dr' : 'Cr';
                      const closeAmt = Math.max(sg.closingDr, sg.closingCr);
                      const closeType = sg.closingDr >= sg.closingCr ? 'Dr' : 'Cr';
                      const isSelected = idx === selectedIndex;
                      return (
                        <tr
                          key={sg.subGroupName}
                          onClick={() =>
                            pushStep({
                              kind: 'SUB_GROUP_LEDGERS',
                              subGroupName: sg.subGroupName,
                            })
                          }
                          className={`cursor-pointer transition group ${
                            isSelected ? 'bg-indigo-500/15' : 'hover:bg-indigo-500/10'
                          }`}
                        >
                          <td className="p-3 font-bold text-slate-100 group-hover:text-indigo-300">
                            {sg.subGroupName}
                          </td>
                          <td className="p-3 text-center font-mono text-slate-400">
                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-indigo-300 font-bold">
                              {sg.ledgerCount}
                            </span>
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-slate-400">
                            {openAmt > 0.005
                              ? `${formatCurrency(openAmt, currency)} ${openType}`
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-sky-400">
                            {sg.periodDr > 0.005
                              ? formatCurrency(sg.periodDr, currency)
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-emerald-400">
                            {sg.periodCr > 0.005
                              ? formatCurrency(sg.periodCr, currency)
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-semibold text-slate-200">
                            {closeAmt > 0.005
                              ? `${formatCurrency(closeAmt, currency)} ${closeType}`
                              : '-'}
                          </td>
                          <td
                            className={`p-3 text-right font-mono tabular-nums font-bold ${
                              sg.signedAmount < 0 ? 'text-rose-400' : 'text-white'
                            }`}
                          >
                            {sg.signedAmount < 0 ? '-' : ''}
                            {formatCurrency(Math.abs(sg.signedAmount), currency)}
                          </td>
                          <td className="p-3 text-right text-slate-500 group-hover:text-indigo-300">
                            <ChevronRight className="w-4 h-4 inline" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* LAYER 1B: GROUP OR SUB-GROUP LEDGERS */}
          {(currentStep.kind === 'SUB_GROUP_LEDGERS' ||
            (currentStep.kind === 'ROOT' && !showSubGroupSummary)) &&
            payload.kind === 'GROUP_LEDGERS' && (
            <>
              <div className="text-[11px] text-slate-400 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>
                    {isHindi
                      ? 'किसी भी लेज़र पर क्लिक करके उसका अप्रैल–मार्च मासिक सारांश (Level 2) और वाउचर (Level 3) देखें।'
                      : 'Click any ledger row below to open its April–March Monthly Summary (Level 2) and Voucher Register (Level 3).'}
                  </span>
                </span>
                <span className="hidden sm:inline text-[10px] font-mono text-slate-500">
                  ↑↓ Select • Enter: Open Month Summary
                </span>
              </div>

              <div className="overflow-x-auto border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      <th className="p-3">Ledger / Group</th>
                      <th className="p-3 text-right">Opening Dr/Cr</th>
                      <th className="p-3 text-right">Period Debit</th>
                      <th className="p-3 text-right">Period Credit</th>
                      <th className="p-3 text-right">Closing Dr/Cr</th>
                      <th className="p-3 text-right">Net Impact</th>
                      <th className="p-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 bg-slate-900/50">
                    {filteredGroupAccounts.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-8 text-center text-slate-500"
                        >
                          {isHindi
                            ? 'इस श्रेणी में कोई सक्रिय लेज़र नहीं मिला।'
                            : 'No active ledgers found in this section.'}
                        </td>
                      </tr>
                    ) : (
                      filteredGroupAccounts.map((row, idx) => {
                        const openAmt = Math.max(row.openingDr, row.openingCr);
                        const openType =
                          row.openingDr >= row.openingCr ? 'Dr' : 'Cr';
                        const closeAmt = Math.max(row.closingDr, row.closingCr);
                        const closeType =
                          row.closingDr >= row.closingCr ? 'Dr' : 'Cr';
                        const isSelected = idx === selectedIndex;
                        return (
                          <tr
                            key={row.account.id}
                            onClick={() =>
                              openAccountDrilldown(
                                row.account.id,
                                row.account.name,
                                'ACCOUNT'
                              )
                            }
                            className={`cursor-pointer transition group ${
                              isSelected
                                ? 'bg-indigo-500/15'
                                : 'hover:bg-indigo-500/10'
                            }`}
                          >
                            <td className="p-3">
                              <div className="font-bold text-slate-100 group-hover:text-indigo-300 flex items-center gap-2">
                                <span>{row.account.name}</span>
                                <span className="text-[10px] font-mono text-slate-500">
                                  ({row.account.code})
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {row.account.mainGroup || row.account.subCategory}
                              </div>
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums text-slate-400">
                              {openAmt > 0.005
                                ? `${formatCurrency(openAmt, currency)} ${openType}`
                                : '-'}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums text-sky-400">
                              {row.periodDr > 0.005
                                ? formatCurrency(row.periodDr, currency)
                                : '-'}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums text-emerald-400">
                              {row.periodCr > 0.005
                                ? formatCurrency(row.periodCr, currency)
                                : '-'}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums font-semibold text-slate-200">
                              {closeAmt > 0.005
                                ? `${formatCurrency(closeAmt, currency)} ${closeType}`
                                : '-'}
                            </td>
                            <td
                              className={`p-3 text-right font-mono tabular-nums font-bold ${
                                row.signedAmount < 0
                                  ? 'text-rose-400'
                                  : 'text-white'
                              }`}
                            >
                              {row.signedAmount < 0 ? '-' : ''}
                              {formatCurrency(
                                Math.abs(row.signedAmount),
                                currency
                              )}
                            </td>
                            <td className="p-3 text-right text-slate-500 group-hover:text-indigo-300">
                              <ChevronRight className="w-4 h-4 inline" />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {filteredGroupAccounts.length > 0 && (
                    <tfoot className="bg-slate-950 font-bold text-xs border-t-2 border-slate-700">
                      <tr>
                        <td className="p-3 text-slate-300">
                          TOTAL ({filteredGroupAccounts.length} Ledgers)
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-slate-400">
                          {groupSummary.openDr > 0
                            ? `${formatCurrency(groupSummary.openDr, currency)} Dr`
                            : ''}
                          {groupSummary.openDr > 0 && groupSummary.openCr > 0
                            ? ' / '
                            : ''}
                          {groupSummary.openCr > 0
                            ? `${formatCurrency(groupSummary.openCr, currency)} Cr`
                            : ''}
                          {groupSummary.openDr === 0 &&
                          groupSummary.openCr === 0
                            ? '-'
                            : ''}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-sky-300">
                          {formatCurrency(groupSummary.periodDr, currency)}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-emerald-300">
                          {formatCurrency(groupSummary.periodCr, currency)}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-slate-200">
                          {groupSummary.closeDr > 0
                            ? `${formatCurrency(groupSummary.closeDr, currency)} Dr`
                            : ''}
                          {groupSummary.closeDr > 0 &&
                          groupSummary.closeCr > 0
                            ? ' / '
                            : ''}
                          {groupSummary.closeCr > 0
                            ? `${formatCurrency(groupSummary.closeCr, currency)} Cr`
                            : ''}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-white">
                          {groupSummary.netSigned < 0 ? '-' : ''}
                          {formatCurrency(
                            Math.abs(groupSummary.netSigned),
                            currency
                          )}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}

          {/* LAYER 1: STOCK_VALUATION */}
          {currentStep.kind === 'ROOT' &&
            payload.kind === 'STOCK_VALUATION' && (
              <>
                {payload.stockType === 'OPENING' &&
                  payload.accInventoryOpening !== undefined &&
                  Math.abs(payload.accInventoryOpening - stockTotalVal) > 1 && (
                    <div className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-3 text-xs text-sky-200 flex items-start gap-2">
                      <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">
                          {isHindi
                            ? 'Stock-in-Hand खाता प्रारंभिक शेष (Ledger Opening)'
                            : 'Accounting Ledger Opening Stock Reconciliation'}
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Stock-in-Hand Ledger Opening Balance:{' '}
                          <strong className="font-mono tabular-nums text-white">
                            {formatCurrency(
                              payload.accInventoryOpening,
                              currency
                            )}
                          </strong>
                          {stockTotalVal > 0 && (
                            <>
                              {' '}
                              (Item-wise opening sum:{' '}
                              <strong className="font-mono tabular-nums">
                                {formatCurrency(stockTotalVal, currency)}
                              </strong>
                              )
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  )}

                <div className="overflow-x-auto border border-slate-800 rounded-xl">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                      <tr>
                        <th className="p-3">Item / Code</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">HSN</th>
                        <th className="p-3 text-right">
                          {payload.stockType === 'OPENING'
                            ? 'Opening Qty'
                            : 'Closing Qty'}
                        </th>
                        <th className="p-3">Unit</th>
                        <th className="p-3 text-right">Cost Rate</th>
                        <th className="p-3 text-right">
                          Total Valuation ({currency})
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70 bg-slate-900/50">
                      {stockRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={7}
                            className="p-8 text-center text-slate-500"
                          >
                            {isHindi
                              ? 'कोई स्टॉक आइटम नहीं मिला।'
                              : 'No stock items with non-zero balance.'}
                          </td>
                        </tr>
                      ) : (
                        stockRows.map((r) => (
                          <tr
                            key={r.item.id}
                            className="hover:bg-slate-800/50 transition"
                          >
                            <td className="p-3">
                              <div className="font-bold text-slate-100">
                                {r.item.name}
                              </div>
                              <div className="text-[10px] font-mono text-slate-500">
                                {r.item.code}
                              </div>
                            </td>
                            <td className="p-3 text-slate-400">
                              {r.item.category || '-'}
                            </td>
                            <td className="p-3 font-mono text-indigo-300">
                              {r.item.hsnSacCode || '-'}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums font-bold text-emerald-300">
                              {r.qty.toLocaleString('en-IN', {
                                maximumFractionDigits: 3,
                              })}
                            </td>
                            <td className="p-3 text-slate-400">
                              {r.item.unit}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums">
                              {formatCurrency(r.rate, currency)}
                            </td>
                            <td className="p-3 text-right font-mono tabular-nums font-extrabold text-amber-300">
                              {formatCurrency(r.value, currency)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {stockRows.length > 0 && (
                      <tfoot className="bg-slate-950 font-bold text-xs border-t-2 border-slate-700">
                        <tr>
                          <td colSpan={3} className="p-3 text-slate-300">
                            TOTAL ({stockRows.length} Stock Items)
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums text-emerald-300">
                            {stockTotalQty.toLocaleString('en-IN', {
                              maximumFractionDigits: 3,
                            })}
                          </td>
                          <td></td>
                          <td></td>
                          <td className="p-3 text-right font-mono tabular-nums text-amber-300 text-sm">
                            {formatCurrency(stockTotalVal, currency)}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </>
            )}

          {/* LAYER 2: MONTHLY SUMMARY (APRIL - MARCH) */}
          {currentStep.kind === 'MONTHLY_SUMMARY' && monthlySummary && (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                  <tr>
                    <th className="p-3">Month ({monthlySummary.fyLabel})</th>
                    <th className="p-3 text-center">Vouchers</th>
                    <th className="p-3 text-right">Debit ({currency})</th>
                    <th className="p-3 text-right">Credit ({currency})</th>
                    <th className="p-3 text-right">Closing Balance</th>
                    <th className="p-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-slate-900/50">
                  <tr className="bg-slate-950/60 text-slate-400 italic">
                    <td className="p-3 font-bold">Opening Balance (B/F)</td>
                    <td className="p-3 text-center">-</td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      {monthlySummary.statement.openingForPeriod >= 0
                        ? formatCurrency(
                            monthlySummary.statement.openingForPeriod,
                            currency
                          )
                        : '-'}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums">
                      {monthlySummary.statement.openingForPeriod < 0
                        ? formatCurrency(
                            Math.abs(monthlySummary.statement.openingForPeriod),
                            currency
                          )
                        : '-'}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums font-bold text-amber-300">
                      {formatCurrency(
                        Math.abs(monthlySummary.statement.openingForPeriod),
                        currency
                      )}{' '}
                      {monthlySummary.statement.openingForPeriod >= 0
                        ? 'Dr'
                        : 'Cr'}
                    </td>
                    <td></td>
                  </tr>

                  {visibleMonths.map((m: MonthlyLedgerSummaryRow, idx: number) => {
                    const isSelected = idx === selectedIndex;
                    return (
                      <tr
                        key={m.monthKey}
                        onClick={() =>
                          pushStep({
                            kind: 'MONTH_VOUCHERS',
                            id: currentStep.id,
                            name: currentStep.name,
                            preferredKind: currentStep.preferredKind,
                            monthKey: m.monthKey,
                            monthLabel: m.label,
                          })
                        }
                        className={`cursor-pointer transition group ${
                          isSelected
                            ? 'bg-indigo-500/15'
                            : 'hover:bg-indigo-500/10'
                        }`}
                      >
                        <td className="p-3 font-bold text-slate-100 group-hover:text-indigo-300">
                          {m.label}
                        </td>
                        <td className="p-3 text-center font-mono tabular-nums text-slate-400">
                          {m.txCount > 0 ? m.txCount : '—'}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-sky-400 font-semibold">
                          {m.debit > 0.005
                            ? formatCurrency(m.debit, currency)
                            : '-'}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums text-emerald-400 font-semibold">
                          {m.credit > 0.005
                            ? formatCurrency(m.credit, currency)
                            : '-'}
                        </td>
                        <td className="p-3 text-right font-mono tabular-nums font-bold text-white">
                          {m.closingBalance > 0.005
                            ? `${formatCurrency(m.closingBalance, currency)} ${
                                m.closingType === 'DR' ? 'Dr' : 'Cr'
                              }`
                            : '₹0.00'}
                        </td>
                        <td className="p-3 text-right text-slate-500 group-hover:text-indigo-300">
                          <ChevronRight className="w-4 h-4 inline" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-950 font-bold text-xs border-t-2 border-slate-700">
                  <tr>
                    <td className="p-3 text-slate-300">GRAND TOTAL ({monthlySummary.fyLabel})</td>
                    <td className="p-3 text-center font-mono tabular-nums text-slate-400">
                      {monthlySummary.statement.rows.length}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-sky-300">
                      {formatCurrency(monthlySummary.totalDebit, currency)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-emerald-300">
                      {formatCurrency(monthlySummary.totalCredit, currency)}
                    </td>
                    <td className="p-3 text-right font-mono tabular-nums text-white">
                      {formatCurrency(monthlySummary.closingBalance, currency)}{' '}
                      {monthlySummary.closingType === 'DR' ? 'Dr' : 'Cr'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* LAYER 3: MONTH VOUCHER REGISTER */}
          {currentStep.kind === 'MONTH_VOUCHERS' && (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                  <tr>
                    <th className="p-3 w-28">Date</th>
                    <th className="p-3 min-w-[200px]">Particulars</th>
                    <th className="p-3 w-32">Voucher Type</th>
                    <th className="p-3 w-28">Voucher No</th>
                    <th className="p-3 w-28 text-right">Debit</th>
                    <th className="p-3 w-28 text-right">Credit</th>
                    <th className="p-3 w-32 text-right">Balance</th>
                    <th className="p-3 w-20 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 bg-slate-900/50">
                  {activeMonthVoucherRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="p-8 text-center text-slate-500"
                      >
                        {isHindi
                          ? 'इस माह में कोई वाउचर प्रविष्टि नहीं मिली।'
                          : 'No vouchers recorded in this month.'}
                      </td>
                    </tr>
                  ) : (
                    activeMonthVoucherRows.map((row, idx) => {
                      const isSelected = idx === selectedIndex;
                      const isEditable =
                        (row.sourceType === 'SALES_INVOICE' && Boolean(onEditInvoice)) ||
                        (row.sourceType === 'PURCHASE_BILL' && Boolean(onEditPurchaseBill)) ||
                        (row.sourceType === 'VOUCHER' && Boolean(onEditVoucher));
                      return (
                        <tr
                          key={row.id}
                          onClick={() => openVoucherLevel4OrEdit(row)}
                          className={`cursor-pointer transition group ${
                            isSelected
                              ? 'bg-indigo-500/15'
                              : 'hover:bg-indigo-500/10'
                          }`}
                        >
                          <td className="p-3 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                            {row.date}
                          </td>
                          <td className="p-3 text-slate-100 font-medium">
                            {row.particulars}
                          </td>
                          <td className="p-3 text-slate-300 whitespace-nowrap">
                            {row.voucherType}
                          </td>
                          <td className="p-3 font-mono font-bold text-indigo-300 whitespace-nowrap group-hover:underline">
                            {row.voucherNo}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-bold text-sky-400 whitespace-nowrap">
                            {row.debit > 0
                              ? formatCurrency(row.debit, currency)
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-bold text-emerald-400 whitespace-nowrap">
                            {row.credit > 0
                              ? formatCurrency(row.credit, currency)
                              : '-'}
                          </td>
                          <td className="p-3 text-right font-mono tabular-nums font-bold text-white whitespace-nowrap">
                            {formatCurrency(row.runningBalance, currency)}{' '}
                            <span
                              className={
                                row.runningType === 'DR'
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                              }
                            >
                              {row.runningType === 'DR' ? 'Dr' : 'Cr'}
                            </span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {row.rawObj && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const info = getSourceKindAndRecord(row);
                                    pushStep({
                                      kind: 'TX_DETAIL',
                                      title: info.title,
                                      voucherKind: info.voucherKind,
                                      record: info.record,
                                    });
                                  }}
                                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                                  title={isHindi ? 'विवरण देखें' : 'Inspect Breakdown'}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {isEditable && (
                                <span
                                  className="p-1 rounded-lg bg-indigo-600/20 text-indigo-300 group-hover:bg-indigo-600 group-hover:text-white transition"
                                  title={isHindi ? 'संपादित करें' : 'Open Edit Modal'}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* LAYER 4: TRANSACTION DETAIL */}
          {effectiveTxStep && (
            <TransactionBreakdown
              voucherKind={effectiveTxStep.voucherKind}
              record={effectiveTxStep.record}
              currency={currency}
              isHindi={isHindi}
              onInspectAccountOrParty={openAccountDrilldown}
            />
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-5 py-3 border-t border-slate-800 flex items-center justify-between text-xs shrink-0">
          <span className="text-slate-500">
            {isHindi
              ? 'बहु-स्तरीय ड्रिलडाउन जांच दृश्य (Esc: वापस जाएँ)'
              : 'Multi-Level Audit Drilldown (Esc: Step Back)'}
          </span>
          <div className="flex items-center gap-2">
            {drillStack.length > 1 && (
              <button
                type="button"
                onClick={popStep}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-bold cursor-pointer"
              >
                {isHindi ? '← वापस (Back)' : '← Back'}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
            >
              {isHindi ? 'बंद करें' : 'Close'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface TransactionBreakdownProps {
  voucherKind: 'SALES' | 'PURCHASE' | 'VOUCHER' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
  record: SalesInvoice | PurchaseInvoice | Voucher | DebitCreditNote;
  currency: string;
  isHindi: boolean;
  onInspectAccountOrParty: (
    id?: string,
    name?: string,
    preferredKind?: 'ACCOUNT' | 'PARTY'
  ) => void;
}

const TransactionBreakdown: React.FC<TransactionBreakdownProps> = ({
  voucherKind,
  record,
  currency,
  isHindi,
  onInspectAccountOrParty,
}) => {
  if (voucherKind === 'VOUCHER') {
    const vch = record as Voucher;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">Voucher No</div>
            <div className="font-mono font-bold text-white mt-0.5">
              {vch.voucherNumber}
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">
              Type / Date
            </div>
            <div className="font-bold text-indigo-300 mt-0.5">
              {vch.type} • {vch.date}
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">Party</div>
            {vch.partyName ? (
              <button
                type="button"
                onClick={() =>
                  onInspectAccountOrParty(vch.partyId, vch.partyName, 'PARTY')
                }
                className="font-bold text-sky-300 hover:underline flex items-center gap-1 mt-0.5 cursor-pointer text-left"
              >
                <span>{vch.partyName}</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            ) : (
              <div className="text-slate-500 mt-0.5">-</div>
            )}
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400 uppercase">
              Total Amount
            </div>
            <div className="font-mono tabular-nums font-extrabold text-emerald-300 mt-0.5">
              {formatCurrency(vch.totalAmount, currency)}
            </div>
          </div>
        </div>

        {(vch.instrumentNumber || vch.bankersDate) && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap gap-6 text-xs">
            {vch.instrumentNumber && (
              <div>
                <span className="text-slate-400 mr-1.5">Instrument / UTR:</span>
                <span className="font-mono font-bold text-slate-100">
                  {vch.instrumentNumber}
                </span>
              </div>
            )}
            {vch.bankersDate && (
              <div>
                <span className="text-slate-400 mr-1.5">Bank Clearance Date:</span>
                <span className="font-mono font-bold text-emerald-300">
                  {vch.bankersDate}
                </span>
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
              <tr>
                <th className="p-3">Ledger / Account</th>
                <th className="p-3">Narration</th>
                <th className="p-3 text-right">Debit ({currency})</th>
                <th className="p-3 text-right">Credit ({currency})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900/50">
              {vch.entries.map((e, i) => (
                <tr
                  key={e.id || i}
                  onClick={() =>
                    onInspectAccountOrParty(
                      e.accountId,
                      e.accountName,
                      'ACCOUNT'
                    )
                  }
                  className="hover:bg-indigo-500/10 cursor-pointer transition"
                >
                  <td className="p-3 font-bold text-slate-100 flex items-center gap-1.5">
                    <span>{e.accountName}</span>
                    {e.accountCode && (
                      <span className="text-[10px] font-mono text-slate-500">
                        ({e.accountCode})
                      </span>
                    )}
                    <ArrowUpRight className="w-3 h-3 text-indigo-400" />
                  </td>
                  <td className="p-3 text-slate-400">{e.narration || '-'}</td>
                  <td className="p-3 text-right font-mono tabular-nums text-sky-400 font-bold">
                    {e.debit > 0 ? formatCurrency(e.debit, currency) : '-'}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-emerald-400 font-bold">
                    {e.credit > 0 ? formatCurrency(e.credit, currency) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {vch.narration && (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300">
            <span className="text-slate-500 font-bold uppercase text-[10px] mr-2">
              Narration:
            </span>
            {vch.narration}
          </div>
        )}
      </div>
    );
  }

  // SalesInvoice, PurchaseInvoice, DebitCreditNote
  const doc = record as SalesInvoice & PurchaseInvoice & DebitCreditNote;
  const docNo = doc.invoiceNumber || doc.billNumber || doc.noteNumber || '-';
  const extraLedgers = doc.extraLedgerLines || [];
  const items = doc.items || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
            <FileText className="w-3 h-3" /> Document No
          </div>
          <div className="font-mono font-bold text-white mt-0.5">{docNo}</div>
          {doc.supplierInvoiceNo && doc.supplierInvoiceNo !== docNo && (
            <div className="text-[10px] text-slate-400 mt-0.5">
              Supp Inv: {doc.supplierInvoiceNo}
            </div>
          )}
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase">Date</div>
          <div className="font-mono tabular-nums font-bold text-slate-200 mt-0.5">
            {doc.date}
          </div>
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase">Party</div>
          <button
            type="button"
            onClick={() =>
              onInspectAccountOrParty(doc.partyId, doc.partyName, 'PARTY')
            }
            className="font-bold text-sky-300 hover:underline flex items-center gap-1 mt-0.5 cursor-pointer text-left"
          >
            <span>{doc.partyName}</span>
            <ArrowUpRight className="w-3 h-3 shrink-0" />
          </button>
          {doc.partyGstin && (
            <div className="text-[10px] font-mono text-amber-300 mt-0.5">
              {doc.partyGstin}
            </div>
          )}
        </div>
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
          <div className="text-[10px] text-slate-400 uppercase">
            Grand Total
          </div>
          <div className="font-mono tabular-nums font-extrabold text-emerald-300 mt-0.5 text-sm">
            {formatCurrency(doc.grandTotal || 0, currency)}
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="overflow-x-auto border border-slate-800 rounded-xl">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] font-bold">
            <tr>
              <th className="p-3">#</th>
              <th className="p-3">Item / Particular</th>
              <th className="p-3">HSN</th>
              <th className="p-3 text-right">Qty</th>
              <th className="p-3 text-right">Rate</th>
              <th className="p-3 text-right">Disc %</th>
              <th className="p-3 text-right">Tax</th>
              <th className="p-3 text-right">Amount ({currency})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-900/50">
            {items.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-4 text-center text-slate-500">
                  {isHindi
                    ? 'कोई आइटम विवरण नहीं।'
                    : 'No line items recorded.'}
                </td>
              </tr>
            ) : (
              items.map((it, idx) => (
                <tr key={it.id || idx} className="hover:bg-slate-800/40">
                  <td className="p-3 text-slate-500 font-mono">{idx + 1}</td>
                  <td className="p-3 font-semibold text-slate-100">
                    {it.itemName}
                  </td>
                  <td className="p-3 font-mono text-indigo-300">
                    {it.hsnSacCode || '-'}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums">
                    {it.quantity} {it.unit}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums">
                    {formatCurrency(it.rate || 0, currency)}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-slate-400">
                    {it.discountPercent ? `${it.discountPercent}%` : '-'}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums text-amber-300">
                    {formatCurrency(it.taxAmount || 0, currency)}
                  </td>
                  <td className="p-3 text-right font-mono tabular-nums font-bold text-white">
                    {formatCurrency(it.totalAmount || 0, currency)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Extra Ledgers */}
      {extraLedgers.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
          <div className="text-[11px] font-bold uppercase text-indigo-300">
            {isHindi
              ? 'अतिरिक्त लेज़र प्रविष्टियाँ (Additional Ledgers)'
              : 'Additional Invoice Ledgers (Freight, Duties, Charges)'}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {extraLedgers.map((el, i) => (
              <button
                key={`${el.accountId}_${i}`}
                type="button"
                onClick={() =>
                  onInspectAccountOrParty(
                    el.accountId,
                    el.accountName,
                    'ACCOUNT'
                  )
                }
                className="flex items-center justify-between bg-slate-900 hover:bg-indigo-500/10 border border-slate-800 rounded-lg px-3 py-2 cursor-pointer text-left transition"
              >
                <span className="font-semibold text-slate-200 flex items-center gap-1">
                  <span>{el.accountName || el.accountId}</span>
                  <ArrowUpRight className="w-3 h-3 text-indigo-400" />
                </span>
                <span className="font-mono tabular-nums font-bold text-amber-300">
                  {el.debit > 0
                    ? `${formatCurrency(el.debit, currency)} Dr`
                    : `${formatCurrency(el.credit, currency)} Cr`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Summary Breakup */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono tabular-nums">
        <div>
          <span className="text-[10px] text-slate-400 block font-sans">
            Taxable Subtotal
          </span>
          <strong className="text-slate-100">
            {formatCurrency(doc.subtotal || 0, currency)}
          </strong>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block font-sans">
            Discount
          </span>
          <strong className="text-emerald-400">
            -{formatCurrency(doc.totalDiscount || 0, currency)}
          </strong>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block font-sans">
            CGST / SGST / IGST
          </span>
          <strong className="text-amber-300">
            {formatCurrency(
              (doc.cgstAmount || 0) +
                (doc.sgstAmount || 0) +
                (doc.igstAmount || 0),
              currency
            )}
          </strong>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block font-sans">
            Round Off
          </span>
          <strong className="text-slate-300">
            {formatCurrency(doc.roundOff || 0, currency)}
          </strong>
        </div>
        <div>
          <span className="text-[10px] text-slate-400 block font-sans">
            Grand Total
          </span>
          <strong className="text-emerald-300 text-sm">
            {formatCurrency(doc.grandTotal || 0, currency)}
          </strong>
        </div>
      </div>

      {(doc.notes || doc.remarks) && (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-300">
          <span className="text-slate-500 font-bold uppercase text-[10px] mr-2">
            Notes:
          </span>
          {doc.notes || doc.remarks}
        </div>
      )}
    </div>
  );
};
