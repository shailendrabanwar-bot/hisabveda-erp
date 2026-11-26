import { AppData, SalesInvoice, RecurringFrequency, ItemMaster } from '../types';
import { generateNextNumber } from './accounting';
import { logAuditAction } from './storage';

/**
 * Calculates the next occurrence date based on the current date and frequency.
 */
export function calculateNextRecurringDate(startDateStr: string, frequency: RecurringFrequency): string {
  const date = new Date(startDateStr);
  if (isNaN(date.getTime())) {
    return new Date().toISOString().split('T')[0];
  }

  switch (frequency) {
    case 'WEEKLY':
      date.setDate(date.getDate() + 7);
      break;
    case 'MONTHLY':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'QUARTERLY':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'YEARLY':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  return date.toISOString().split('T')[0];
}

export interface RecurringProcessResult {
  updatedData: AppData;
  generatedCount: number;
  generatedInvoices: SalesInvoice[];
}

/**
 * Background processor that inspects all recurring invoice templates and auto-generates
 * new invoice instances if the nextRecurringDate is due (<= today).
 */
export function checkAndGenerateRecurringInvoices(currentData: AppData): RecurringProcessResult {
  const todayStr = new Date().toISOString().split('T')[0];
  
  let workingInvoices = [...currentData.invoices];
  let workingItems = [...currentData.items];
  const generatedInvoices: SalesInvoice[] = [];

  let auditData = { ...currentData };

  // Loop through all invoices that are marked as recurring
  for (let i = 0; i < workingInvoices.length; i++) {
    const inv = workingInvoices[i];

    if (
      inv.isRecurring &&
      inv.frequency &&
      inv.frequency !== 'NONE' &&
      inv.nextRecurringDate &&
      inv.nextRecurringDate <= todayStr &&
      inv.lastGeneratedDate !== todayStr // Prevent duplicate runs on the exact same date
    ) {
      // 1. Calculate due date for new invoice (+15 days)
      const newInvoiceDate = todayStr;
      const dueDateObj = new Date(newInvoiceDate);
      dueDateObj.setDate(dueDateObj.getDate() + 15);
      const newDueDate = dueDateObj.toISOString().split('T')[0];

      // 2. Generate unique invoice number
      const newInvNumber = generateNextNumber('INV', workingInvoices);

      // 3. Construct new generated invoice instance
      const newInvoice: SalesInvoice = {
        id: 'inv_rec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        invoiceNumber: newInvNumber,
        date: newInvoiceDate,
        dueDate: newDueDate,
        invoiceType: inv.invoiceType || 'TAX_INVOICE',
        partyId: inv.partyId,
        partyName: inv.partyName,
        partyGstin: inv.partyGstin,
        partyAddress: inv.partyAddress,
        partyState: inv.partyState,
        placeOfSupply: inv.placeOfSupply,
        isInterState: inv.isInterState,
        items: inv.items.map(item => ({ ...item, id: 'ii_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5) })),
        subtotal: inv.subtotal,
        totalDiscount: inv.totalDiscount,
        cgstAmount: inv.cgstAmount,
        sgstAmount: inv.sgstAmount,
        igstAmount: inv.igstAmount,
        totalTax: inv.totalTax,
        roundOff: inv.roundOff || 0,
        grandTotal: inv.grandTotal,
        amountPaid: 0,
        status: 'UNPAID',
        notes: `Auto-generated recurring invoice (${inv.frequency}) from template ${inv.invoiceNumber}`,
        termsConditions: inv.termsConditions,
        recurringParentId: inv.id,
        isRecurring: false // The child instance itself is a normal invoice
      };

      generatedInvoices.push(newInvoice);

      // 4. Calculate next recurring run date for parent
      const nextRunDate = calculateNextRecurringDate(newInvoiceDate, inv.frequency);

      // Update parent template in array
      workingInvoices[i] = {
        ...inv,
        lastGeneratedDate: todayStr,
        nextRecurringDate: nextRunDate
      };

      // Append new invoice to working list
      workingInvoices.unshift(newInvoice);

      // 5. Deduct item stock quantities
      workingItems = workingItems.map(item => {
        const line = inv.items.find(l => l.itemId === item.id);
        if (line) {
          return { ...item, currentStock: Math.max(0, item.currentStock - line.quantity) };
        }
        return item;
      });

      // 6. Log audit trail
      auditData = logAuditAction(
        { ...auditData, invoices: workingInvoices, items: workingItems },
        'Recurring Invoice Auto-Generated',
        `Auto-generated ${newInvNumber} for ${inv.partyName} (${inv.frequency}). Next run set to ${nextRunDate}.`
      );
    }
  }

  return {
    updatedData: {
      ...auditData,
      invoices: workingInvoices,
      items: workingItems
    },
    generatedCount: generatedInvoices.length,
    generatedInvoices
  };
}
