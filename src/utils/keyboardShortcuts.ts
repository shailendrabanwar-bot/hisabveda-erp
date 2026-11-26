import { NavTab } from '../components/Sidebar';

export type ShortcutCategoryId = 'NAVIGATION' | 'VOUCHERS' | 'REPORTS' | 'SYSTEM';

export interface AppShortcutDef {
  id: string;
  keys: string;
  category: ShortcutCategoryId;
  labelEn: string;
  labelHi: string;
  descEn: string;
  descHi: string;
  actionType: 'NAV' | 'MODAL' | 'SUBTAB' | 'EVENT' | 'INFO';
  tabTarget?: NavTab;
  modalTarget?: 'invoice' | 'payment' | 'receipt' | 'journal' | 'contra' | 'note' | 'configure' | 'shortcuts';
  subTabIndex?: number;
  eventName?: string;
}

export const APP_SHORTCUT_DEFINITIONS: AppShortcutDef[] = [
  // 1. MODULE NAVIGATION (Alt + Key)
  {
    id: 'nav_dashboard',
    keys: 'Alt + D',
    category: 'NAVIGATION',
    labelEn: 'Dashboard Overview',
    labelHi: 'मुख्य डैशबोर्ड',
    descEn: 'Jump to KPI overview & cash flow charts',
    descHi: 'मुख्य डैशबोर्ड और वित्तीय सारांश खोलें',
    actionType: 'NAV',
    tabTarget: 'dashboard'
  },
  {
    id: 'nav_pos',
    keys: 'Alt + B',
    category: 'NAVIGATION',
    labelEn: 'Barcode POS Counter',
    labelHi: 'बारकोड POS काउंटर',
    descEn: 'Open high-speed retail barcode billing',
    descHi: 'तेज़ बारकोड POS बिलिंग टर्मिनल खोलें',
    actionType: 'NAV',
    tabTarget: 'pos'
  },
  {
    id: 'nav_invoices',
    keys: 'Alt + S',
    category: 'NAVIGATION',
    labelEn: 'Sales & Tax Invoices',
    labelHi: 'बिक्री व इनवॉइस रजिस्टर',
    descEn: 'Open sales register and tax bills',
    descHi: 'बिक्री बिल और इनवॉइस सूची खोलें',
    actionType: 'NAV',
    tabTarget: 'invoices'
  },
  {
    id: 'nav_purchases',
    keys: 'Alt + P',
    category: 'NAVIGATION',
    labelEn: 'Purchase Bills & PO',
    labelHi: 'खरीद बिल व ऑर्डर',
    descEn: 'Open supplier bills and purchase orders',
    descHi: 'खरीद बिल और सप्लायर ऑर्डर खोलें',
    actionType: 'NAV',
    tabTarget: 'purchases'
  },
  {
    id: 'nav_vouchers',
    keys: 'Alt + V',
    category: 'NAVIGATION',
    labelEn: 'Accounting Vouchers',
    labelHi: 'अकाउंटिंग वाउचर रजिस्टर',
    descEn: 'View payments, receipts, contra & journals',
    descHi: 'पेमेंट, रसीद, कॉन्ट्रा व जर्नल रजिस्टर',
    actionType: 'NAV',
    tabTarget: 'vouchers'
  },
  {
    id: 'nav_items',
    keys: 'Alt + I',
    category: 'NAVIGATION',
    labelEn: 'Inventory & Stock Adjustment',
    labelHi: 'इन्वेंटरी व स्टॉक एडजस्टमेंट',
    descEn: 'Manage stock, batches, godowns & negative stock clearance',
    descHi: 'स्टॉक मास्टर, गोदाम व स्टॉक एडजस्टमेंट खोलें',
    actionType: 'NAV',
    tabTarget: 'items'
  },
  {
    id: 'nav_ledger',
    keys: 'Alt + L',
    category: 'NAVIGATION',
    labelEn: 'Chart of Accounts & Ledgers',
    labelHi: 'लेजर व चार्ट ऑफ अकाउंट्स',
    descEn: 'Inspect account ledgers and groups',
    descHi: 'सभी खाते व लेजर स्टेटमेंट खोलें',
    actionType: 'NAV',
    tabTarget: 'ledger'
  },
  {
    id: 'nav_statements',
    keys: 'Alt + F',
    category: 'NAVIGATION',
    labelEn: 'Financial Statements (P&L / BS / TB)',
    labelHi: 'वित्तीय विवरण (P&L / बैलेंस शीट)',
    descEn: 'Trading, Profit & Loss, Balance Sheet & Trial Balance',
    descHi: 'ट्रेडिंग, P&L, बैलेंस शीट व ट्रायल बैलेंस',
    actionType: 'NAV',
    tabTarget: 'statements'
  },
  {
    id: 'nav_mis',
    keys: 'Alt + M',
    category: 'NAVIGATION',
    labelEn: 'MIS Reports & Export Center',
    labelHi: 'MIS रिपोर्ट्स व एक्सपोर्ट केंद्र',
    descEn: 'Sales, Purchase, Day Book, Outstanding & P&L MIS',
    descHi: 'सभी 8 एमआईएस रिपोर्ट्स व Excel/PDF एक्सपोर्ट',
    actionType: 'NAV',
    tabTarget: 'mis-reports'
  },
  {
    id: 'nav_tax',
    keys: 'Alt + T',
    category: 'NAVIGATION',
    labelEn: 'GST & TDS Compliance (3B / 1 / 2B / 9)',
    labelHi: 'जीएसटी व टीडीएस केंद्र (GSTR-3B/1/2B/9)',
    descEn: 'GSTR-3B, GSTR-1, GSTR-2B, GSTR-9, Audit & TDS',
    descHi: 'GSTR-3B, GSTR-1, 2B, 9, GST ऑडिट व TDS',
    actionType: 'NAV',
    tabTarget: 'tax'
  },
  {
    id: 'nav_parties',
    keys: 'Alt + U',
    category: 'NAVIGATION',
    labelEn: 'Parties (Debtors & Creditors)',
    labelHi: 'पार्टी मास्टर (ग्राहक व सप्लायर)',
    descEn: 'Customers, vendors & outstanding aging',
    descHi: 'ग्राहक व सप्लायर खाते और बकाया देखें',
    actionType: 'NAV',
    tabTarget: 'parties'
  },
  {
    id: 'nav_banking',
    keys: 'Alt + R',
    category: 'NAVIGATION',
    labelEn: 'Bank Reconciliation',
    labelHi: 'बैंक रिकॉन्सिलिएशन',
    descEn: 'Import & match bank statements',
    descHi: 'बैंक स्टेटमेंट मिलान व इम्पोर्ट',
    actionType: 'NAV',
    tabTarget: 'reconciliation'
  },
  {
    id: 'nav_payroll',
    keys: 'Alt + Y',
    category: 'NAVIGATION',
    labelEn: 'Payroll & Salary',
    labelHi: 'पेरोल व वेतन प्रबंधन',
    descEn: 'Manage employees & salary runs',
    descHi: 'कर्मचारी व वेतन रजिस्टर',
    actionType: 'NAV',
    tabTarget: 'payroll'
  },
  {
    id: 'nav_budget',
    keys: 'Alt + G',
    category: 'NAVIGATION',
    labelEn: 'Budgeting & Limits',
    labelHi: 'बजट व खर्च सीमा',
    descEn: 'Monitor monthly department budgets',
    descHi: 'मासिक बजट व खर्च निगरानी',
    actionType: 'NAV',
    tabTarget: 'budgeting'
  },
  {
    id: 'nav_audit',
    keys: 'Alt + A',
    category: 'NAVIGATION',
    labelEn: 'Audit Log & History',
    labelHi: 'ऑडिट लॉग एवं इतिहास',
    descEn: 'View chronological security & action trail',
    descHi: 'सुरक्षा और सभी बदलावों का ऑडिट लॉग',
    actionType: 'NAV',
    tabTarget: 'audit'
  },
  {
    id: 'nav_utilities',
    keys: 'Alt + X',
    category: 'NAVIGATION',
    labelEn: 'Data Backup & Import Utilities',
    labelHi: 'डेटा बैकअप व इम्पोर्ट टूल्स',
    descEn: 'Backup, restore & bulk data import',
    descHi: 'बैकअप, रीस्टोर व बल्क डेटा इम्पोर्ट',
    actionType: 'NAV',
    tabTarget: 'utilities'
  },
  {
    id: 'nav_settings',
    keys: 'Alt + O',
    category: 'NAVIGATION',
    labelEn: 'Company Settings',
    labelHi: 'कंपनी सेटिंग्स',
    descEn: 'GSTIN, logo, invoice terms & workspace setup',
    descHi: 'कंपनी प्रोफाइल, GSTIN, लोगो व सेटिंग्स',
    actionType: 'NAV',
    tabTarget: 'settings'
  },

  // 2. QUICK VOUCHER & TRANSACTION ENTRY (Function Keys / Alt)
  {
    id: 'vch_contra',
    keys: 'F4',
    category: 'VOUCHERS',
    labelEn: 'Contra Voucher (Cash <-> Bank)',
    labelHi: 'कॉन्ट्रा वाउचर (नकद / बैंक)',
    descEn: 'Cash deposit, withdrawal or bank transfer',
    descHi: 'बैंक में जमा, निकासी या इंटर-बैंक ट्रांसफर',
    actionType: 'MODAL',
    modalTarget: 'contra'
  },
  {
    id: 'vch_payment',
    keys: 'F5',
    category: 'VOUCHERS',
    labelEn: 'Payment Voucher',
    labelHi: 'पेमेंट वाउचर',
    descEn: 'Record vendor or expense payout',
    descHi: 'सप्लायर या खर्च का भुगतान दर्ज करें',
    actionType: 'MODAL',
    modalTarget: 'payment'
  },
  {
    id: 'vch_receipt',
    keys: 'F6',
    category: 'VOUCHERS',
    labelEn: 'Receipt Voucher',
    labelHi: 'रसीद वाउचर (Receipt)',
    descEn: 'Record customer payment received',
    descHi: 'ग्राहक से भुगतान प्राप्ति दर्ज करें',
    actionType: 'MODAL',
    modalTarget: 'receipt'
  },
  {
    id: 'vch_journal',
    keys: 'F7',
    category: 'VOUCHERS',
    labelEn: 'Journal Voucher',
    labelHi: 'जर्नल वाउचर',
    descEn: 'Record accounting adjustment entry',
    descHi: 'अकाउंटिंग समायोजन / जर्नल एंट्री करें',
    actionType: 'MODAL',
    modalTarget: 'journal'
  },
  {
    id: 'vch_sales',
    keys: 'F8',
    category: 'VOUCHERS',
    labelEn: 'New Sales Tax Invoice',
    labelHi: 'नया सेल्स इनवॉइस बनाएं',
    descEn: 'Open new GST Sales Invoice creator',
    descHi: 'नया जीएसटी बिक्री बिल बनाएं',
    actionType: 'MODAL',
    modalTarget: 'invoice'
  },
  {
    id: 'vch_purchase',
    keys: 'F9',
    category: 'VOUCHERS',
    labelEn: 'Purchase Bills & Entry',
    labelHi: 'खरीद बिल (Purchase)',
    descEn: 'Jump directly to Purchase Entry module',
    descHi: 'सीधे खरीद बिल मॉड्यूल खोलें',
    actionType: 'NAV',
    tabTarget: 'purchases'
  },
  {
    id: 'vch_note',
    keys: 'Alt + N',
    category: 'VOUCHERS',
    labelEn: 'New Debit / Credit Note',
    labelHi: 'नया डेबिट / क्रेडिट नोट',
    descEn: 'Create Sales Return or Purchase Return note',
    descHi: 'सेल्स/परचेज रिटर्न या डिस्काउंट नोट बनाएं',
    actionType: 'MODAL',
    modalTarget: 'note'
  },

  // 3. INSIDE REPORTS & MODULES
  {
    id: 'rep_subtabs',
    keys: 'Alt + 1 .. 8',
    category: 'REPORTS',
    labelEn: 'Switch Report Sub-Tab (1 to 8)',
    labelHi: 'रिपोर्ट / मॉड्यूल सब-टैब बदलें (1 से 8)',
    descEn: 'Quickly jump between Trading/BS/TB/Sch-III, MIS Reports 1–8, GST Tabs 1–8, or Stock Tabs 1–7',
    descHi: 'वित्तीय रिपोर्ट्स, MIS (1–8), GST (1–8) और स्टॉक टैब्स (1–7) पर तुरंत स्विच करें',
    actionType: 'INFO'
  },
  {
    id: 'rep_condensed',
    keys: 'Alt + F1',
    category: 'REPORTS',
    labelEn: 'Condensed <-> Detailed Report Toggle',
    labelHi: 'संक्षिप्त <-> विस्तृत रिपोर्ट टॉगल',
    descEn: 'Expand or collapse all sub-ledgers in Financial Statements',
    descHi: 'बैलेंस शीट/P&L में सभी सब-लेजर एक क्लिक में खोलें या बंद करें',
    actionType: 'INFO'
  },
  {
    id: 'rep_period',
    keys: 'F2',
    category: 'REPORTS',
    labelEn: 'Change Period / Negative Stock Filter',
    labelHi: 'अवधि बदलें (GSTR-3B / MIS / Stock Adjust)',
    descEn: 'Open Filing Period in GST, focus Date Filter in MIS, or open Stock Adjustment in Inventory',
    descHi: 'GST में अवधि बदलें, MIS में तारीख चुनें, या इन्वेंटरी में स्टॉक एडजस्टमेंट खोलें',
    actionType: 'EVENT',
    eventName: 'hisabveda:open-period'
  },

  // 4. SYSTEM & UTILITIES
  {
    id: 'sys_search',
    keys: 'Ctrl + K',
    category: 'SYSTEM',
    labelEn: 'Global Instant Search',
    labelHi: 'ग्लोबल सर्च बार',
    descEn: 'Search invoices, parties, items, vouchers or ledgers anywhere',
    descHi: 'कहीं से भी बिल, पार्टी, आइटम या खाता खोजें',
    actionType: 'INFO'
  },
  {
    id: 'sys_configure',
    keys: 'F12',
    category: 'SYSTEM',
    labelEn: 'Master Configuration (F12)',
    labelHi: 'मास्टर कॉन्फ़िगरेशन सेटिंग्स',
    descEn: 'Open ERP feature & accounting rules settings',
    descHi: 'सॉफ्टवेयर की मुख्य विशेषताएं व नियम बदलें',
    actionType: 'MODAL',
    modalTarget: 'configure'
  },
  {
    id: 'sys_shortcuts',
    keys: 'Alt + K  or  ?',
    category: 'SYSTEM',
    labelEn: 'Keyboard Shortcuts Palette',
    labelHi: 'कीबोर्ड शॉर्टकट गाइड खोलें',
    descEn: 'Show all navigation, voucher & report shortcuts',
    descHi: 'सभी नेविगेशन, वाउचर व रिपोर्ट शॉर्टकट देखें',
    actionType: 'MODAL',
    modalTarget: 'shortcuts'
  },
  {
    id: 'sys_escape',
    keys: 'Esc',
    category: 'SYSTEM',
    labelEn: 'Close Active Modal / Dialog',
    labelHi: 'खुला हुआ पॉपअप / डायलॉग बंद करें',
    descEn: 'Safely dismiss active popup or search dropdown',
    descHi: 'किसी भी खुले पॉपअप या विंडो को बंद करें',
    actionType: 'INFO'
  }
];

/**
 * Returns true when focus is inside an input, textarea, select, or contentEditable element.
 * Bare single-key shortcuts (like '?') MUST NOT trigger inside editable fields.
 */
export function isEditableEventTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}
