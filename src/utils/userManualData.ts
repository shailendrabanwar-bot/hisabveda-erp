export type ManualCategoryId =
  | 'all'
  | 'getting-started'
  | 'billing-pos'
  | 'tally-xml'
  | 'purchases-inventory'
  | 'gst-compliance'
  | 'financial-reports'
  | 'desktop-licensing'
  | 'shortcuts';

export interface ManualCategoryMeta {
  id: ManualCategoryId;
  labelEn: string;
  labelHi: string;
}

export interface ManualTopic {
  id: string;
  category: Exclude<ManualCategoryId, 'all'>;
  titleEn: string;
  titleHi: string;
  summaryEn: string;
  summaryHi: string;
  stepsEn: string[];
  stepsHi: string[];
  tipsEn?: string;
  tipsHi?: string;
  keywords: string[];
  navTab?: string;
  shortcutLabel?: string;
}

export const MANUAL_CATEGORIES: ManualCategoryMeta[] = [
  { id: 'all', labelEn: 'All Guides', labelHi: 'सभी विषय' },
  { id: 'getting-started', labelEn: 'Setup & Workspace', labelHi: 'सेटअप एवं कार्यक्षेत्र' },
  { id: 'billing-pos', labelEn: 'Sales & POS', labelHi: 'बिलिंग व POS' },
  { id: 'tally-xml', labelEn: 'Tally XML Import', labelHi: 'Tally XML इम्पोर्ट' },
  { id: 'purchases-inventory', labelEn: 'Purchase & Stock', labelHi: 'खरीद व स्टॉक' },
  { id: 'gst-compliance', labelEn: 'GST & E-Way Bill', labelHi: 'GST व ई-वे बिल' },
  { id: 'financial-reports', labelEn: '4-Level Drill-Down', labelHi: 'रिपोर्ट्स व ड्रिल-डाउन' },
  { id: 'desktop-licensing', labelEn: 'Desktop .exe & License', labelHi: 'डेस्कटॉप .exe व लाइसेंस' },
  { id: 'shortcuts', labelEn: 'Keyboard Shortcuts', labelHi: 'कीबोर्ड शॉर्टकट्स' },
];

export const MANUAL_TOPICS: ManualTopic[] = [
  {
    id: 'workspace-shell-setup',
    category: 'getting-started',
    titleEn: 'Company Setup, Financial Year & Text Zoom Scale',
    titleHi: 'कंपनी सेटअप, वित्तीय वर्ष (FY) और टेक्स्ट ज़ूम कंट्रोल',
    summaryEn:
      'Set your GSTIN, select or customize any Financial Year period, switch Hindi/English instantly, and adjust workspace text size (100% / 115% / 130%) without scrolling headers away.',
    summaryHi:
      'अपना GSTIN सेट करें, कोई भी वित्तीय वर्ष चुनें, एक क्लिक में हिंदी/अंग्रेजी बदलें, और बिना लेआउट टूटे कार्यक्षेत्र का फ़ॉन्ट आकार (100% | 115% | 130%) सेट करें।',
    stepsEn: [
      'Click your Company badge on the top-left header (Company Manager) to switch between businesses or add a new company with GSTIN and Financial Year start date.',
      'Use the FY selector next to the company name to filter reports by a single April–March year or select a custom date range.',
      'Use the 100% | 115% | 130% Aa scale buttons in the top header bar to enlarge table rows and forms while keeping the navbar, sidebar, and table column headers fixed.',
      'Press F12 or open Configure Settings to configure round-off rules, books freeze date, Windows (.exe) installer URL, and active ERP modules.'
    ],
    stepsHi: [
      'हेडर में बाईं ओर कंपनी नाम पर क्लिक करके नई कंपनी जोड़ें या कंपनियों के बीच स्विच करें (GSTIN और FY तिथि सहित)।',
      'कंपनी नाम के पास FY कैलेंडर से किसी भी अप्रैल-मार्च वर्ष या कस्टम दिनांक अवधि की रिपोर्ट देखें।',
      'हेडर में 100% | 115% | 130% स्विचर से केवल अंदर की टेबल और फॉर्म का टेक्स्ट साइज बढ़ाएँ (टॉप बार, साइडबार और टेबल हेडिंग हमेशा स्थिर रहेंगी)।',
      'F12 दबाकर ऑटो राउंड-ऑफ, बुक्स लॉक डेट, .exe डाउनलोड लिंक और मॉड्यूल सेटिंग्स बदलें।'
    ],
    navTab: 'dashboard',
    shortcutLabel: 'F12 Configure',
    keywords: ['company', 'fy', 'financial year', 'zoom', 'scale', '115%', '130%', 'hindi', 'english', 'settings', 'f12']
  },
  {
    id: 'sales-billing-pos',
    category: 'billing-pos',
    titleEn: 'GST Sales Invoicing, UPI QR & High-Speed Barcode POS',
    titleHi: 'GST सेल इनवॉइस, UPI QR कोड और तेज़ बारकोड POS बिलिंग',
    summaryEn:
      'Generate compliant A4 or thermal GST invoices with automatic Cash/Bank ledger posting, dynamic amount-locked UPI QR codes, and barcode scanning.',
    summaryHi:
      'A4 व थर्मल GST बिल बनाएँ जहाँ Cash/UPI/Card भुगतान तुरंत कैश-बैंक खाते में दर्ज होता है, साथ ही स्वतः UPI भुगतान QR कोड प्रिंट होता है।',
    stepsEn: [
      'Press F8 or click "+ Transactions -> Sales Invoice" for detailed B2B/B2C tax invoices, or press F2 to open the counter Barcode POS terminal.',
      'Select Party and Payment Mode: choosing Cash, UPI, Card, or Bank immediately posts the receipt debit into your Cash-in-Hand or chosen Bank ledger so Cash Book and Balance Sheet update live.',
      'Choose Credit if the bill remains receivable under Sundry Debtors; track dues anytime via Customer Ledger or Party Master.',
      'Click Print / PDF to export A4, Half-Page, or 80mm/58mm Thermal receipts complete with HSN tax summary and UPI QR.'
    ],
    stepsHi: [
      'F8 दबाकर नया GST सेल इनवॉइस खोलें या तेज़ काउंटर बिलिंग के लिए F2 दबाकर बारकोड POS टर्मिनल शुरू करें।',
      'भुगतान मोड चुनते समय Cash, UPI, Card या बैंक चुनने पर पैसा तुरंत Cash-in-Hand या संबंधित बैंक खाते में दर्ज हो जाता है (बैलेंस शीट रियल-टाइम अपडेट)।',
      'उधार बिल के लिए Credit चुनें ताकि राशि पार्टी लेजर (Sundry Debtors) में बकाया दिखे।',
      'प्रिंट / PDF बटन से A4, हाफ-पेज या 80mm थर्मल बिल तुरंत प्रिंट या WhatsApp पर शेयर करें।'
    ],
    tipsEn: 'Enable "Barcode Auto-Increment Quantity (+1)" under F12 Special Settings so scanning the same item twice increases quantity automatically without extra clicks.',
    tipsHi: 'F12 सेटिंग्स में "Barcode Auto-Increment Quantity (+1)" चालू करने पर एक ही आइटम दोबारा स्कैन करने पर मात्रा स्वतः +1 बढ़ जाती है।',
    navTab: 'pos',
    shortcutLabel: 'F8 Invoice · F2 POS',
    keywords: ['invoice', 'sales', 'pos', 'barcode', 'upi', 'qr', 'cash', 'bank', 'thermal', 'a4', 'print', 'f8', 'f2']
  },
  {
    id: 'tally-xml-import',
    category: 'tally-xml',
    titleEn: 'Importing Tally Prime / ERP 9 XML (Masters & Transactions)',
    titleHi: 'Tally XML इम्पोर्ट गाइड (Masters और Transactions XML)',
    summaryEn:
      'Import Tally Masters & Vouchers accurately with GUID deduplication, Optional/Cancelled voucher exclusion, and automatic Party & Invoice GSTIN extraction.',
    summaryHi:
      'Tally से एक्सपोर्ट की गई Masters और Transactions XML फाइलों को सटीकता से इम्पोर्ट करें — Optional/Cancelled वाउचर की सुरक्षा व ऑटो पार्टी GSTIN मैपिंग के साथ।',
    stepsEn: [
      'In Tally, first export Masters (Gateway -> Export -> Masters -> XML) and then Transactions (Day Book / Statistics -> XML).',
      'Open "Data Import / Tally XML" inside HISAB VEDA ERP and upload your Masters XML first so all Groups, Stock Items, Opening Balances, and Party GSTINs are created cleanly.',
      'Next upload Transactions XML: Optional (<ISOPTIONAL>Yes</ISOPTIONAL>) and Cancelled vouchers are automatically excluded from P&L and Balance Sheet totals.',
      'Duplicate imports are prevented automatically using Tally GUID matching, and Party GSTINs (<PARTYGSTIN>, <LEDGSTREGDETAILS.LIST>, <CONSIGNEEGSTIN>) attach directly to B2B invoices.'
    ],
    stepsHi: [
      'Tally से पहले Masters XML (Gateway -> Export -> Masters -> XML) और फिर Transactions XML एक्सपोर्ट करें।',
      'सॉफ्टवेयर में Data Import / Tally XML स्क्रीन खोलें और पहले Masters XML अपलोड करें ताकि सभी लेजर, ओपनिंग बैलेंस, स्टॉक आइटम और GSTIN सही जुड़ें।',
      'इसके बाद Transactions XML इम्पोर्ट करें: सिस्टम स्वतः Optional व Cancelled वाउचर्स को बैलेंस शीट और P&L से बाहर रखता है।',
      'GUID डुप्लीकेट रोकथाम पहले से सक्रिय है और पार्टी का GSTIN सीधे सभी सेल्स/परचेज इनवॉइस पर जुड़ जाता है।'
    ],
    navTab: 'tally-import',
    keywords: ['tally', 'xml', 'import', 'masters', 'transactions', 'guid', 'optional', 'cancelled', 'gstin', 'partygstin']
  },
  {
    id: 'purchases-stock-cash',
    category: 'purchases-inventory',
    titleEn: 'Purchase Bills, AI Scanner & Instant Cash/Bank Payments',
    titleHi: 'परचेज बिल एंट्री, AI बिल स्कैनर और रियल-टाइम क्लोजिंग स्टॉक',
    summaryEn:
      'Record supplier bills manually or scan PDF/Photo invoices with AI, sync Closing Stock valuation immediately across P&L and Balance Sheet, and post Cash/Bank payouts.',
    summaryHi:
      'सप्लायर बिल दर्ज करें या PDF/Photo बिल को AI से स्कैन करें; स्टॉक मात्रा या खरीद दर बदलते ही क्लोजिंग स्टॉक P&L और बैलेंस शीट में तुरंत अपडेट होता है।',
    stepsEn: [
      'Open Purchase Registry (press F9 or sidebar Purchases) to create a new bill or scan a supplier PDF/Photo invoice using AI Extraction.',
      'Mark Payment Mode as Cash or Bank to credit your Cash/Bank ledger immediately, or leave as Credit under Sundry Creditors.',
      'Every Sales and Purchase item automatically updates Batch/Godown quantities and weighted valuation—Closing Stock inside Financial Statements recalculates live.',
      'Double-entry validation enforces Total Debit == Total Credit on every bill, voucher, and Credit/Debit Note by routing sub-rupee rounding differences cleanly to Round Off.'
    ],
    stepsHi: [
      'F9 दबाएँ या Purchases मॉड्यूल खोलकर नया परचेज बिल बनाएं अथवा AI स्कैनर में PDF/फोटो अपलोड करें।',
      'यदि भुगतान Cash या Bank से हुआ है तो वही मोड चुनें — Cash Book व Balance Sheet से राशि तुरंत घट जाएगी।',
      'स्टॉक मात्रा या खरीद दर में हर बदलाव का असर तुरंत P&L और बैलेंस शीट के Closing Stock पर दिखता है।',
      'हर बिल और डेबिट/क्रेडिट नोट में डबल-एंट्री संतुलन (Debit == Credit) सुनिश्चित करने के लिए पैसे का अंतर स्वतः Round Off खाते में समायोजित होता है।'
    ],
    navTab: 'purchases',
    shortcutLabel: 'F9 Purchase',
    keywords: ['purchase', 'stock', 'inventory', 'closing stock', 'ai scan', 'round off', 'double entry', 'debit note', 'credit note', 'f9']
  },
  {
    id: 'gst-gstr-eway',
    category: 'gst-compliance',
    titleEn: 'GSTR-1 B2B/B2C Live Sync, GSTR-2B, GSTR-3B & E-Way Bills',
    titleHi: 'GSTR-1 B2B/B2C ऑटो सिंक, GSTR-2B/3B और ई-वे बिल JSON',
    summaryEn:
      'Prepare accurate GST returns: updating any customer GSTIN or State in Party Master immediately refreshes their historical B2C invoices into B2B inside GSTR-1.',
    summaryHi:
      'Party Master में किसी ग्राहक का GSTIN या राज्य अपडेट करते ही उसके सभी पुराने व नए बिल स्वतः B2C से B2B श्रेणी में रिफ्रेश हो जाते हैं।',
    stepsEn: [
      'Open Party Master (or Quick Add Party) to add or edit any customer or supplier’s 15-digit GSTIN and State code.',
      'Saving an updated GSTIN immediately propagates it across linked invoices and vouchers, moving eligible registered transactions from B2C to B2B in GSTR-1.',
      'Navigate to Tax / GST Reports to review GSTR-1 B2B/B2C tables, HSN summary, GSTR-2B ITC register, and GSTR-3B liability computation.',
      'Export GSTN-ready JSON files or generate E-Way Bill JSON directly from eligible invoices above your configured threshold (default ₹50,000).'
    ],
    stepsHi: [
      'Party Master में जाकर किसी भी पार्टी का 15-अंकों का GSTIN या राज्य सुधारें/जोड़ें।',
      'सेव करते ही सभी लिंक इनवॉइस स्वतः अपडेट होकर GSTR-1 में B2C की जगह B2B सेक्शन में दिखाई देने लगते हैं।',
      'Tax / GST मॉड्यूल में GSTR-1, HSN समरी, GSTR-2B इनपुट टैक्स क्रेडिट और GSTR-3B रिपोर्ट जाँचें।',
      'थ्रेशोल्ड (₹50,000+) वाले बिलों का E-Way Bill JSON व GSTR JSON सीधे पोर्टल अपलोड के लिए एक्सपोर्ट करें।'
    ],
    navTab: 'tax',
    keywords: ['gst', 'gstr1', 'gstr-1', 'gstr2b', 'gstr3b', 'b2b', 'b2c', 'eway', 'e-way', 'hsn', 'party master']
  },
  {
    id: 'financial-drilldown',
    category: 'financial-reports',
    titleEn: '4-Level Tally-Style Financial Reports Drill-Down',
    titleHi: 'बैलेंस शीट, P&L और ट्रायल बैलेंस का 4-लेवल ड्रिल-डाउन',
    summaryEn:
      'Click any row inside Balance Sheet, Profit & Loss, or Trial Balance to inspect Groups -> Monthly Summary -> Exact Vouchers -> Original Invoice/Voucher Editor, using Esc to step back one level at a time.',
    summaryHi:
      'Balance Sheet, Profit & Loss या Trial Balance की किसी भी लाइन पर क्लिक करके 4 स्तरों (ग्रुप -> मासिक सारांश -> वाउचर सूची -> मूल बिल एडिट) तक ड्रिल-डाउन करें और Esc दबाकर एक-एक स्तर पीछे आएँ।',
    stepsEn: [
      'Level 1 (Primary Group): Open Financial Statements and click any head (e.g., Sundry Debtors, Direct Expenses, Current Liabilities) to inspect sub-groups and individual ledgers.',
      'Level 2 (Monthly Summary): Click any ledger row to view month-by-month April through March debit, credit, and closing balance breakdown.',
      'Level 3 (Voucher List): Click any month row to inspect every Sales, Purchase, Receipt, Payment, Contra, or Journal entry posted in that month.',
      'Level 4 (Direct Edit & Live Refresh): Click any voucher row to open the exact Invoice, Purchase, or Voucher editor—saving edits refreshes the entire statement automatically. Press Escape (Esc) or click breadcrumb links to step back cleanly level by level.'
    ],
    stepsHi: [
      'स्तर 1 (Primary Group): Financial Statements में किसी भी मुख्य मद (जैसे Sundry Debtors, Indirect Expenses) पर क्लिक कर सभी लेजर देखें।',
      'स्तर 2 (Monthly Summary): किसी लेजर पर क्लिक करके अप्रैल से मार्च तक का महीना-वार सारांश (Debit/Credit/Closing) देखें।',
      'स्तर 3 (Voucher Register): किसी महीने पर क्लिक करके उस माह के सभी बिल व वाउचर देखें।',
      'स्तर 4 (Direct Edit & Esc Back): किसी वाउचर पर क्लिक करके सीधे मूल इनवॉइस/वाउचर एडिट मोडल खोलें। ऊपर दिए ब्रेडक्रम्ब से या Esc बटन दबाकर एक-एक स्तर पीछे वापस आएं।'
    ],
    navTab: 'reports',
    keywords: ['balance sheet', 'profit and loss', 'p&l', 'trial balance', 'drilldown', 'drill-down', 'breadcrumb', 'esc', 'escape', 'ledger']
  },
  {
    id: 'desktop-exe-licensing',
    category: 'desktop-licensing',
    titleEn: 'Windows Desktop (.exe), Encrypted Disk Vault & Machine Lock',
    titleHi: 'Windows डेस्कटॉप (.exe), एन्क्रिप्टेड डिस्क वॉल्ट और मशीन-लॉक लाइसेंस',
    summaryEn:
      'Understand permanent UserData storage with 30-day daily backup rotation, Hardware Machine ID locking, immediate validity countdown on activation, and updating your .exe link.',
    summaryHi:
      'जानें कि Windows (.exe) में डेटा स्थायी डिस्क वॉल्ट में कैसे सुरक्षित रहता है, 30-दिन के ऑटो बैकअप कैसे चलते हैं, और लाइसेंस कुंजी आपके PC की Hardware Machine ID से कैसे लॉक होती है।',
    stepsEn: [
      'Desktop Persistence: In the Windows .exe app, accounting data and settings mirror automatically to a permanent JSON database inside Windows AppData/userData with 30-day rolling daily backups.',
      'Hardware Machine ID: Each computer generates a deterministic Hardware Fingerprint combining CPU, BIOS/motherboard UUID, Windows MachineGuid, and hostname.',
      'Immediate Activation Countdown: Entering a valid License Key binds it strictly to that Machine ID inside the AES-256-GCM encrypted vault (.hv-security-vault.json) and starts the exact validity countdown (e.g., 365 Days for Annual or Lifetime for Perpetual).',
      'Anti-Tamper Guards: Rolling the Windows clock backwards or copying the database folder onto another PC triggers an immediate security lock until a valid key for that PC is activated.'
    ],
    stepsHi: [
      'स्थायी डिस्क स्टोरेज: Windows .exe में पूरा कंपनी डेटा AppData (userData) फ़ोल्डर में सेव रहता है और प्रतिदिन 30 दिनों तक ऑटो-बैकअप सुरक्षित रहता है।',
      'हार्डवेयर मशीन ID: प्रत्येक PC की यूनीक पहचान उसके CPU, मदरबोर्ड/BIOS UUID और होस्टनाम से बनती है, जो एक्टिवेशन स्क्रीन पर दिखती है।',
      'तुरंत वैधता एवं लॉक: लाइसेंस कुंजी डालकर Activate करते ही लाइसेंस उसी Machine ID पर AES-256 एन्क्रिप्टेड वॉल्ट में लॉक होता है और चुनी हुई अवधि (जैसे 365 दिन) तुरंत शुरू हो जाती है।',
      'एंटी-टैंपर सुरक्षा: विंडोज़ की तारीख पीछे करने या डेटा फ़ोल्डर किसी दूसरे कंप्यूटर पर कॉपी करने पर सॉफ्टवेयर स्वतः लॉक हो जाता है।'
    ],
    shortcutLabel: 'License Center',
    keywords: ['exe', 'windows', 'desktop', 'electron', 'license', 'hwid', 'machine id', 'activation', 'countdown', '365', 'vault', 'clock', 'backup', 'download']
  },
  {
    id: 'erp-keyboard-shortcuts',
    category: 'shortcuts',
    titleEn: 'Essential ERP Keyboard Shortcuts Reference',
    titleHi: 'त्वरित कार्य हेतु संपूर्ण कीबोर्ड शॉर्टकट्स सूची',
    summaryEn:
      'Work at Tally-grade speed across billing, vouchers, search, reports, and modal navigation using single-key and Alt+key shortcuts.',
    summaryHi:
      'माउस छुए बिना बिलिंग, वाउचर एंट्री, ग्लोबल सर्च और रिपोर्ट्स पर काम करने के लिए मुख्य कीबोर्ड शॉर्टकट्स।',
    stepsEn: [
      'Ctrl + K : Focus Global Search across all invoices, parties, items, ledgers, and vouchers.',
      'F2 : Open High-Speed Barcode POS | F4 : Contra | F5 : Payment | F6 : Receipt | F7 : Journal | F8 : Sales Invoice | F9 : Purchase Bill.',
      'F12 : Open Master ERP Configuration & Installer Settings.',
      'Alt + D (Dashboard) | Alt + B (POS) | Alt + S (Sales) | Alt + P (Purchases) | Alt + V (Vouchers) | Alt + I (Inventory) | Alt + L (Ledgers) | Alt + F (Financial Statements) | Alt + T (GST Reports).',
      'Escape (Esc) : Step back 1 level inside Report Drill-Down, or close the top open modal.'
    ],
    stepsHi: [
      'Ctrl + K : इनवॉइस, पार्टी, आइटम, लेजर व वाउचर के लिए ग्लोबल सर्च खोलें।',
      'F2 : बारकोड POS | F4 : कॉन्ट्रा | F5 : पेमेंट | F6 : रसीद | F7 : जर्नल | F8 : सेल इनवॉइस | F9 : परचेज बिल।',
      'F12 : मास्टर ERP कॉन्फ़िगरेशन व .exe डाउनलोड लिंक सेटिंग्स।',
      'Alt + D (डैशबोर्ड) | Alt + B (POS) | Alt + S (बिक्री) | Alt + P (खरीद) | Alt + V (वाउचर) | Alt + I (इन्वेंटरी) | Alt + L (लेजर) | Alt + F (बैलेंस शीट/P&L) | Alt + T (GST रिपोर्ट)।',
      'Escape (Esc) : रिपोर्ट ड्रिल-डाउन में एक स्तर पीछे जाएँ या सबसे ऊपर खुला मोडल बंद करें।'
    ],
    shortcutLabel: 'Alt+H / Shift+?',
    keywords: ['shortcut', 'keyboard', 'f2', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f12', 'ctrl+k', 'alt+', 'esc', 'escape']
  }
];

export function filterManualTopics(
  topics: ManualTopic[],
  query: string,
  category: ManualCategoryId = 'all'
): ManualTopic[] {
  const byCategory = category === 'all' ? topics : topics.filter((t) => t.category === category);
  const q = (query || '').trim().toLowerCase();
  if (!q) return byCategory;

  const terms = q.split(/\s+/).filter(Boolean);
  return byCategory.filter((topic) => {
    const haystack = [
      topic.titleEn,
      topic.titleHi,
      topic.summaryEn,
      topic.summaryHi,
      topic.shortcutLabel || '',
      ...topic.stepsEn,
      ...topic.stepsHi,
      topic.tipsEn || '',
      topic.tipsHi || '',
      ...topic.keywords,
    ]
      .join(' ')
      .toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}
