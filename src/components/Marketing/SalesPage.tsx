import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  ShieldCheck,
  Zap,
  ArrowRight,
  PhoneCall,
  Building2,
  Receipt,
  BarChart3,
  Users,
  Landmark,
  HelpCircle,
  MessageSquare,
  Check,
  Send,
  Laptop,
  X,
  Copy,
  ShoppingCart,
  Play,
  Pause,
  Video,
  Lock,
  ScanLine,
  Cloud,
  HardDrive,
  AlertTriangle,
  Scale,
  Layers,
  FileSpreadsheet,
  Smartphone,
  QrCode,
  Keyboard,
  Palette,
  CalendarClock,
  UploadCloud,
  Search,
  PiggyBank,
  Download,
  Monitor,
  Cpu,
  ExternalLink,
  Settings
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { SnaLogo } from '../SnaLogo';
import { formatCurrency } from '../../utils/storage';
import { loadAppConfig, resolveWindowsInstallerUrl } from '../../utils/appConfig';

interface SalesPageProps {
  isHindi: boolean;
  onLaunchDemo: () => void;
  onOpenInstallerSettings?: () => void;
  onToggleLanguage?: () => void;
}

type PlanKey = 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
type VideoTab = 'BILLING' | 'AI_SCAN' | 'INVENTORY' | 'BANK' | 'GSTR' | 'PAYROLL';
type LegalDocType = 'TERMS' | 'PRIVACY' | 'REFUND' | 'DISCLAIMER' | null;

export const SalesPage: React.FC<SalesPageProps> = ({ isHindi, onLaunchDemo, onOpenInstallerSettings, onToggleLanguage }) => {
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('BUSINESS');
  const [billingCycle, setBillingCycle] = useState<'LIFETIME' | 'YEARLY'>('LIFETIME');
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(false);
  const [upiCopied, setUpiCopied] = useState(false);
  const [orderRefCode, setOrderRefCode] = useState('');
  const [activeLegalDoc, setActiveLegalDoc] = useState<LegalDocType>(null);

  // Configurable Windows Desktop (.exe) installer state
  const [appConfig, setAppConfig] = useState(() => loadAppConfig());
  const [downloadStatusNotice, setDownloadStatusNotice] = useState<{ type: 'success' | 'setup'; text: string } | null>(null);

  useEffect(() => {
    const onConfigUpdated = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setAppConfig(detail || loadAppConfig());
      setDownloadStatusNotice(null);
    };
    window.addEventListener('sna_config_updated', onConfigUpdated);
    return () => window.removeEventListener('sna_config_updated', onConfigUpdated);
  }, []);

  const resolvedExeUrl = resolveWindowsInstallerUrl(appConfig.windowsExeDownloadUrl);
  const windowsExeVersion = (appConfig.windowsExeVersion || '2.0.0').trim() || '2.0.0';

  const handleDownloadWindowsExe = () => {
    if (!resolvedExeUrl) {
      setDownloadStatusNotice({
        type: 'setup',
        text: isHindi
          ? 'अभी .exe डाउनलोड URL सेट नहीं है। नीचे "Configure .exe Link" से Google Drive / GitHub लिंक जोड़ें या सीधे WhatsApp से इंस्टॉलर मंगवाएँ।'
          : 'Installer URL is not configured yet. Click "Configure .exe Link" in Settings to paste your Google Drive / GitHub Release link, or request the setup file via WhatsApp.'
      });
      return;
    }

    if (typeof window !== 'undefined' && window.hisabvedaDesktop?.openExternalUrl) {
      window.hisabvedaDesktop.openExternalUrl(resolvedExeUrl).catch(() => {});
    } else if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = resolvedExeUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.download = `Hisabveda-ERP-Setup-${windowsExeVersion}.exe`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setDownloadStatusNotice({
      type: 'success',
      text: isHindi
        ? `Hisabveda ERP v${windowsExeVersion} (.exe) डाउनलोड प्रारंभ हो गया है। इंस्टॉल करने के बाद अपना Hardware Machine ID भेजकर लाइसेंस सक्रिय करें।`
        : `Hisabveda ERP v${windowsExeVersion} (.exe) download started. After installing, open Activation to copy your Hardware Machine ID.`
    });
  };

  // Form states for sales inquiry / checkout
  const [buyerName, setBuyerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [buyerPhone, setBuyerPhone] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [buyerGstin, setBuyerGstin] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'UPI' | 'BANK' | 'CONTACT'>('UPI');
  const [upiRef, setUpiRef] = useState('');
  const [formError, setFormError] = useState('');

  // Interactive Walkthrough Player States
  const [activeVideoTab, setActiveVideoTab] = useState<VideoTab>('BILLING');
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [videoStep, setVideoStep] = useState(0);
  const [videoSpeed, setVideoSpeed] = useState<1 | 1.5 | 2>(1);
  const [customVideoEmbedUrl, setCustomVideoEmbedUrl] = useState('');
  const [embedInputUrl, setEmbedInputUrl] = useState('');
  const [showEmbedVideoModal, setShowEmbedVideoModal] = useState(false);

  // Modules directory tab
  const [activeModuleGroup, setActiveModuleGroup] = useState<number>(0);

  const getEmbedUrl = (rawUrl: string) => {
    if (!rawUrl) return '';
    try {
      if (rawUrl.includes('youtube.com/watch?v=')) {
        const id = rawUrl.split('v=')[1]?.split('&')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
      if (rawUrl.includes('youtu.be/')) {
        const id = rawUrl.split('youtu.be/')[1]?.split('?')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
      if (rawUrl.includes('youtube.com/shorts/')) {
        const id = rawUrl.split('shorts/')[1]?.split('?')[0];
        return `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  };

  useEffect(() => {
    if (!isPlayingVideo || customVideoEmbedUrl) return;
    const interval = setInterval(() => {
      setVideoStep((prev) => (prev + 1) % 5);
    }, 2600 / videoSpeed);
    return () => clearInterval(interval);
  }, [isPlayingVideo, customVideoEmbedUrl, videoSpeed]);

  const plans = {
    STARTER: {
      name: isHindi ? 'स्टार्टर प्लान (Single Business)' : 'Starter Edition',
      yearlyPrice: 1999,
      lifetimePrice: 2999,
      tag: isHindi ? 'छोटे व्यवसाय व दुकानों हेतु' : 'For Retail Shops & Freelancers',
      color: 'from-slate-800 to-slate-900 border-slate-700',
      popular: false,
      features: [
        isHindi ? '1 यूजर / 1 कंपनी प्रोफाइल' : '1 User / 1 Company Profile',
        isHindi ? 'असीमित GST सेल, परचेज & डायनामिक UPI QR' : 'Unlimited GST Billing, Purchases & UPI QR',
        isHindi ? 'स्टॉक, HSN समरी & लो-स्टॉक अलर्ट' : 'Inventory, HSN Summary & Low-Stock Alerts',
        isHindi ? 'पेमेंट, रसीद, कॉन्ट्रा & जर्नल वाउचर' : 'Payment, Receipt, Contra & Journal Vouchers',
        isHindi ? 'GSTR-1, GSTR-3B समरी & JSON एक्सपोर्ट' : 'GSTR-1 & GSTR-3B Summary + JSON Export',
        isHindi ? 'WhatsApp, PDF & थर्मल/A4 प्रिंटिंग' : 'PDF, Thermal/A4 Print & WhatsApp Sharing',
        isHindi ? 'लोकल प्राइवेट मोड या क्लाउड बैकअप विकल्प' : 'Personal Local Mode or Cloud Backup Choice'
      ]
    },
    BUSINESS: {
      name: isHindi ? 'बिजनेस प्रो प्लान' : 'Business Pro Edition',
      yearlyPrice: 2999,
      lifetimePrice: 4999,
      tag: isHindi ? 'तेजी से बढ़ते व्यापार हेतु' : 'For Wholesalers & Distributors',
      color: 'from-indigo-900/60 to-slate-900 border-indigo-500/60',
      popular: true,
      features: [
        isHindi ? 'असीमित कंपनियाँ & मल्टी-काउंटर क्लाउड सिंक' : 'Unlimited Companies & Multi-Counter Sync',
        isHindi ? 'AI परचेज बिल (PDF/Photo) ऑटो-स्कैनर' : 'AI Purchase Bill PDF/Photo Auto-Scanner',
        isHindi ? 'AI बैंक स्टेटमेंट पार्सर & ऑटो BRS मिलान' : 'AI Bank Statement Parser & Auto BRS',
        isHindi ? 'लाइव GSTIN वेरिफिकेशन & E-Way Bill JSON' : 'Live GSTIN Verification & E-Way Bill JSON',
        isHindi ? 'कर्मचारी पेरोल, उपस्थिति & सैलरी स्लिप PDF' : 'Employee Payroll, Attendance & Salary Slips',
        isHindi ? 'वित्तीय वर्ष रोल-ओवर (Opening Balance Shift)' : 'FY Roll-Over & Opening Balance Transfer',
        isHindi ? 'PIN लॉक + ईमेल री-ऑथ सुरक्षा & ऑडिट लॉग' : 'PIN Lock Security, Re-Auth & Audit Logs',
        isHindi ? 'प्राथमिकता WhatsApp, फोन & AnyDesk सपोर्ट' : 'Priority WhatsApp, Call & AnyDesk Support'
      ]
    },
    ENTERPRISE: {
      name: isHindi ? 'CA & एंटरप्राइज सूट' : 'CA & Enterprise Suite',
      yearlyPrice: 4999,
      lifetimePrice: 8999,
      tag: isHindi ? 'अकाउंटेंट्स, CAs & बड़ी फर्मों हेतु' : 'For Accountants, CAs & Multi-Branch',
      color: 'from-amber-950/40 to-slate-900 border-amber-500/50',
      popular: false,
      features: [
        isHindi ? 'बिजनेस प्रो के सभी AI & क्लाउड फीचर्स शामिल' : 'All Business Pro AI & Cloud Sync Features',
        isHindi ? 'असीमित क्लाइंट कंपनियाँ & पार्टी लेजर MIS' : 'Unlimited Client Books & Advanced MIS Exports',
        isHindi ? 'कस्टम इनवॉइस टेम्पलेट & मल्टी-टेम्पलेट सेटअप' : 'Custom Invoice Styling & Format Setup',
        isHindi ? 'TDS रजिस्टर, बजट बनाम खर्च & GSTR-2B मिलान' : 'TDS Register, Budgeting & GSTR-2B Matching',
        isHindi ? 'मल्टी-डिवाइस रियल-टाइम सिंक + ऑफ़लाइन बैकअप' : 'Multi-Device Live Sync + Offline JSON Backups',
        isHindi ? 'सीधे ऑनबोर्डिंग एवं रिमोट स्टाफ ट्रेनिंग' : 'Direct Onboarding & Remote Team Training'
      ]
    }
  };

  const featureCards = [
    {
      num: '01',
      icon: Receipt,
      accent: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
      title: isHindi ? 'त्वरित GST बिलिंग & UPI QR' : 'Fast GST Billing & Dynamic UPI QR',
      desc: isHindi
        ? 'A4, थर्मल और कस्टम GST इनवॉइस, कोटेशन व क्रेडिट/डेबिट नोट सेकंडों में बनाएँ। प्रत्येक बिल पर स्वतः भुगतान UPI QR कोड प्रिंट करें।'
        : 'Create A4/Thermal GST tax invoices, quotations, and debit/credit notes in seconds with dynamic UPI QR codes and direct WhatsApp PDF share.'
    },
    {
      num: '02',
      icon: ScanLine,
      accent: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      title: isHindi ? 'AI परचेज बिल PDF/फोटो स्कैनर' : 'AI Purchase Bill PDF & Photo Scanner',
      desc: isHindi
        ? 'सप्लायर का PDF या फोटो बिल अपलोड करें — सिस्टम स्वतः पार्टी GSTIN, आइटम, HSN, मात्रा, टैक्स और भाड़ा पढ़कर स्टॉक में जोड़ देता है।'
        : 'Upload supplier PDF or photo bills—AI reads vendor GSTIN, items, HSN codes, taxes, and freight to pre-fill vouchers and update stock automatically.'
    },
    {
      num: '03',
      icon: Landmark,
      accent: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
      title: isHindi ? 'AI बैंक स्टेटमेंट पार्सर & BRS' : 'AI Bank Statement Parser & BRS',
      desc: isHindi
        ? 'HDFC, SBI, ICICI या किसी भी बैंक की PDF/CSV स्टेटमेंट अपलोड करें। एंट्री का तुरंत मिलान करें और पेंडिंग चेक/UPI ट्रैक करें।'
        : 'Upload bank statement CSV or PDF from any Indian bank. Match receipts/payments with recorded books and spot uncleared entries fast.'
    },
    {
      num: '04',
      icon: Cloud,
      accent: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      title: isHindi ? 'क्लाउड सिंक या 100% प्राइवेट लोकल मोड' : 'Cloud Sync or 100% Private Local Mode',
      desc: isHindi
        ? 'Counter 1 और Counter 2 पर लाइव क्लाउड सिंक चलाएँ, या पूर्ण गोपनीयता के लिए डेटा केवल अपने कंप्यूटर/डिवाइस पर सुरक्षित रखें।'
        : 'Choose real-time Cloud Sync across counters & devices, or switch to Personal Device Local Mode so financial data never leaves your system.'
    },
    {
      num: '05',
      icon: ShieldCheck,
      accent: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      title: isHindi ? 'लाइव GSTIN जाँच & PIN लॉक सुरक्षा' : 'Live GSTIN Check & Re-Auth PIN Lock',
      desc: isHindi
        ? 'पार्टी जोड़ते समय GSTIN की असली जाँच (या Govt Portal Paste), टेनेंट-आइसोलेटेड डेटाबेस और Firebase पासवर्ड-प्रोटेक्टेड PIN लॉक।'
        : 'Verify supplier/buyer GSTIN via live lookup or Govt Portal Paste with strict company isolation and Firebase-verified PIN lock protection.'
    },
    {
      num: '06',
      icon: BarChart3,
      accent: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
      title: isHindi ? 'GSTR-1/2B/3B, MIS & FY रोल-ओवर' : 'GSTR Reports, Balance Sheet & FY Roll-Over',
      desc: isHindi
        ? 'प्रॉफिट & लॉस, बैलेंस शीट, ट्रायल बैलेंस, पार्टी लेजर ड्रिलडाउन, E-Way Bill JSON और नए वित्तीय वर्ष में ऑटो ओपनिंग बैलेंस शिफ्ट।'
        : 'Full Profit & Loss, Balance Sheet, Trial Balance, Party Drilldown Ledger, E-Way Bill JSON, TDS tracking, and 1-click year-end balance shift.'
    }
  ];

  const moduleGroups = [
    {
      title: isHindi ? 'बिलिंग एवं विक्रय (Sales & E-Way)' : 'GST Billing & Sales Suite',
      icon: Receipt,
      summary: isHindi
        ? 'रिटेल काउंटर से लेकर थोक B2B बिलिंग तक हर प्रारूप के लिए तैयार।'
        : 'Built for retail counters, B2B wholesalers, distributors, and service agencies.',
      items: [
        isHindi ? 'A4, हाफ-पेज और थर्मल (3-इंच) GST टैक्स इनवॉइस प्रिंट' : 'A4, Half-Page & Thermal (80mm) Tax Invoice Printing',
        isHindi ? 'प्रत्येक बिल पर स्वतः अमाउंट-लॉक्ड UPI भुगतान QR कोड' : 'Amount-Locked Dynamic UPI QR Code on Every Invoice',
        isHindi ? 'E-Way Bill JSON जनरेशन & कोटेशन-टू-बिल कन्वर्जन' : 'Direct E-Way Bill JSON Export & Quote-to-Bill Flow',
        isHindi ? 'क्रेडिट नोट, डेबिट नोट और सेल्स रिटर्न एडजस्टमेंट' : 'Credit Notes, Debit Notes & Sales Return Adjustments',
        isHindi ? '1-क्लिक PDF डाउनलोड एवं WhatsApp ग्राहक शेयरिंग' : 'One-Click PDF Export & Direct WhatsApp Dispatch'
      ]
    },
    {
      title: isHindi ? 'AI परचेज एवं स्टॉक इन्वेंटरी' : 'AI Purchase & Stock Inventory',
      icon: ScanLine,
      summary: isHindi
        ? 'मैनुअल बिल एंट्री का समय 80% तक कम करें और स्टॉक हमेशा सटीक रखें।'
        : 'Cut manual supplier bill typing by up to 80% while keeping stock real-time.',
      items: [
        isHindi ? 'AI परचेज बिल स्कैनर (PDF / फोटो से आइटम, HSN & टैक्स रीड)' : 'AI Purchase Bill PDF/Photo Reader with Freight & Round-Off',
        isHindi ? 'वेंडर पेएबल्स डैशबोर्ड & देय बिल अलर्ट' : 'Supplier Payables Tracking & Overdue Bill Reminders',
        isHindi ? 'आइटम मास्टर, यूनिट्स, बारकोड एवं HSN कोड मैपिंग' : 'Item Master, Multi-Units, Barcode & HSN Mapping',
        isHindi ? 'लो-स्टॉक रीऑर्डर अलर्ट & क्लोजिंग स्टॉक वैल्यूएशन रिपोर्ट' : 'Low-Stock Reorder Warnings & Stock Valuation Report',
        isHindi ? 'सप्लायर वाइज परचेज हिस्ट्री और आइटम रेट तुलना' : 'Supplier Purchase History & Last Purchase Rate Recall'
      ]
    },
    {
      title: isHindi ? 'संपूर्ण एकाउंटिंग, बैंक BRS & वाउचर्स' : 'Core Accounting, Bank BRS & Vouchers',
      icon: Landmark,
      summary: isHindi
        ? 'डबल-एंट्री एकाउंटिंग नियमों के साथ पक्के बही-खाते और स्वचालित बैंक मिलान।'
        : 'True double-entry books with instant bank passbook matching and drilldowns.',
      items: [
        isHindi ? 'AI बैंक स्टेटमेंट अपलोडर (PDF/CSV) & ऑटो BRS मिलान' : 'AI Bank Statement PDF/CSV Parser & Auto Reconciliation',
        isHindi ? 'रिसीट, पेमेंट, कॉन्ट्रा (कैश⇄बैंक) & जर्नल वाउचर्स' : 'Receipt, Payment, Contra (Cash/Bank) & Journal Vouchers',
        isHindi ? 'पार्टी वाइज स्टेटमेंट ड्रिलडाउन (बिल, भुगतान व शेष)' : 'Interactive Party Ledger Drilldown & Outstanding Aging',
        isHindi ? 'प्रॉफिट एंड लॉस अकाउंट, बैलेंस शीट & ट्रायल बैलेंस' : 'Profit & Loss, Balance Sheet, Day Book & Trial Balance',
        isHindi ? 'वित्तीय वर्ष क्लोज़िंग और नए साल में ओपनिंग बैलेंस शिफ्ट' : 'Financial Year Roll-Over with Automated Opening Balances'
      ]
    },
    {
      title: isHindi ? 'GST फाइलिंग, TDS, पेरोल & सुरक्षा' : 'Tax, Payroll, Budgeting & Security',
      icon: Layers,
      summary: isHindi
        ? 'अकाउंटेंट्स, CAs और व्यापारियों के लिए टैक्स, स्टाफ वेतन एवं डेटा सुरक्षा टूल्स।'
        : 'Everything required by practicing accountants, CAs, and compliance-focused firms.',
      items: [
        isHindi ? 'GSTR-1 B2B/B2C समरी, GSTR-2B तुलना & GSTR-3B रिपोर्ट' : 'GSTR-1, GSTR-2B ITC Comparison & GSTR-3B Tax Summary',
        isHindi ? 'TDS डिडक्शन रजिस्टर और एक्सपेंस बजट बनाम वास्तविक तुलना' : 'TDS Register & Monthly Expense Budgeting vs Actuals',
        isHindi ? 'कर्मचारी उपस्थिति, एडवांस कटौती & मासिक सैलरी स्लिप PDF' : 'Staff Attendance, Advance Deduction & Monthly Salary Slips',
        isHindi ? 'मल्टी-काउंटर रियल-टाइम क्लाउड सिंक (या पर्सनल लोकल मोड)' : 'Multi-Counter Cloud Sync or Personal Device Local Storage',
        isHindi ? 'PIN लॉक, एक्टिविटी ऑडिट ट्रेल & 1-क्लिक पूर्ण JSON बैकअप' : 'PIN Lock Protection, Audit Logs & 1-Click JSON Backup'
      ]
    },
    {
      title: isHindi ? 'मोबाइल ऐप (PWA), शॉर्टकट्स & डेटा माइग्रेशन' : 'Mobile App (PWA), Shortcuts & Bulk Import',
      icon: Smartphone,
      summary: isHindi
        ? 'फोन पर 1-क्लिक इंस्टॉल, तेज़ डेटा इम्पोर्ट और उत्पादकता टूल्स।'
        : 'Install on Android/iOS in 1 click, migrate ERP/Excel CSVs, and work faster.',
      items: [
        isHindi ? 'Android & iOS पर बिना Play Store के 1-क्लिक PWA मोबाइल ऐप' : '1-Click PWA Mobile App Install for Android & iPhone (No Play Store)',
        isHindi ? 'डेस्कटॉप से QR कोड स्कैन कर तुरंत फोन पर खोलें + APK बिल्डर टूल' : 'Instant Mobile QR Launch Link + Built-in Android APK Builder Script',
        isHindi ? 'Excel / CSV से हजारों आइटम व पार्टियों का 1-क्लिक बल्क इम्पोर्ट' : '1-Click Bulk CSV/Excel Import for Items & Parties (Merge / Append)',
        isHindi ? 'त्वरित F5-F7 वाउचर शॉर्टकट्स, ग्लोबल सर्च & स्क्रीन ज़ूम (80–125%)' : 'Fast F5-F7 Voucher Shortcuts, Global Search & Screen Zoom (80-125%)',
        isHindi ? '5 प्रीमियम कलर थीम (Dark/Light/Navy/Emerald) & 1-क्लिक हिंदी⇄अंग्रेजी' : '5 Color Themes (Dark/Light/Navy/Emerald) & Instant Hindi/English UI'
      ]
    }
  ];

  const comparisonRows = [
    {
      aspect: isHindi ? 'बिल व बैंक स्टेटमेंट एंट्री' : 'Purchase & Bank Entry',
      traditional: isHindi ? 'घंटों मैनुअल टाइपिंग व गलती की संभावना' : 'Hours of manual line-by-line typing',
      hisabveda: isHindi ? 'AI स्कैनर से PDF/फोटो अपलोड कर सेकंडों में एंट्री' : 'Built-in AI reads Purchase PDFs & Bank Statements'
    },
    {
      aspect: isHindi ? 'डेटा स्टोरेज व प्राइवेसी कंट्रोल' : 'Storage & Data Privacy',
      traditional: isHindi ? 'केवल एक PC पर लॉक या महँगा अनिवार्य क्लाउड' : 'Locked to 1 PC or forced expensive cloud server',
      hisabveda: isHindi ? 'Cloud Sync (Multi-Counter) या Private Local Mode दोनों विकल्प' : 'Switch freely between Cloud Sync & Local Device Mode'
    },
    {
      aspect: isHindi ? 'GSTIN जाँच व त्रुटि रोकथाम' : 'GSTIN Accuracy',
      traditional: isHindi ? 'गलत या नकली GST नंबर टाइप होने का जोखिम' : 'Manual typing errors cause GSTR mismatches',
      hisabveda: isHindi ? 'लाइव GSTIN चेक & Govt Portal Paste वेरिफिकेशन' : 'Live GSTIN Verification + Govt Portal Paste Verification'
    },
    {
      aspect: isHindi ? 'भाषा एवं उपयोगिता' : 'Language & Accessibility',
      traditional: isHindi ? 'केवल कठिन अंग्रेजी डेस्कटॉप स्क्रीन' : 'Complex English-only desktop menus',
      hisabveda: isHindi ? 'सरल हिंदी + अंग्रेजी (Bilingual), Windows, Web व Mobile पर' : 'Clean Hindi + English UI on Desktop, Web & Mobile'
    },
    {
      aspect: isHindi ? 'लाइसेंस शुल्क व वार्षिक नवीनीकरण' : 'Pricing & Ownership',
      traditional: isHindi ? 'हर साल भारी AMC और प्रति-यूज़र अतिरिक्त शुल्क' : 'Expensive mandatory yearly AMC & per-user fees',
      hisabveda: isHindi ? 'किफायती लाइफटाइम विकल्प, कोई अतिरिक्त GST नहीं' : 'Affordable Lifetime option · No Extra GST Charges'
    }
  ];

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const digitsOnly = buyerPhone.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      setFormError(isHindi ? 'कृपया सही 10 अंकों का मोबाइल नंबर दर्ज करें।' : 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setOrderRefCode(`HV-ORD-${Math.floor(100000 + Math.random() * 900000)}`);
    setInquirySuccess(true);
  };

  const currentPlanObj = plans[selectedPlan];
  const finalPrice = billingCycle === 'LIFETIME' ? currentPlanObj.lifetimePrice : currentPlanObj.yearlyPrice;
  const upiPayUri = `upi://pay?pa=7489655303@hdfcbank&pn=${encodeURIComponent('Shailendra Banwar')}&am=${finalPrice}&cu=INR&tn=${encodeURIComponent(`Hisabveda ${currentPlanObj.name}`)}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white pb-16">
      {/* Top Announcement Strip */}
      <div className="bg-gradient-to-r from-indigo-800 via-indigo-700 to-slate-900 text-white text-xs py-2 px-4 text-center font-semibold flex flex-wrap items-center justify-center gap-3 border-b border-indigo-500/30">
        <span>
          {isHindi
            ? 'विशेष लॉन्च ऑफर: Hisabveda ERP लाइफटाइम लाइसेंस पर सीधी बचत · कोई अतिरिक्त GST शुल्क नहीं'
            : 'Launch Offer: Direct Savings on Hisabveda ERP Lifetime License · Zero Extra GST Charges'}
        </span>
        <button
          onClick={() => setShowCheckoutModal(true)}
          className="bg-amber-400 text-slate-950 hover:bg-amber-300 px-3 py-1 rounded-lg text-[11px] font-extrabold transition whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isHindi ? 'लाइसेंस खरीदें' : 'Claim Offer'}
        </button>
      </div>

      {/* Clean 3-Zone Top Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-8">
        <a href="#top" className="flex items-center shrink-0 whitespace-nowrap">
          <SnaLogo size="md" showText={true} />
        </a>

        <nav className="hidden lg:flex items-center gap-6 text-xs font-semibold text-slate-300">
          <a href="#features" className="hover:text-white hover:underline underline-offset-4 transition whitespace-nowrap shrink-0">
            {isHindi ? 'विशेषताएँ' : 'Features'}
          </a>
          <a href="#modules" className="hover:text-white hover:underline underline-offset-4 transition whitespace-nowrap shrink-0">
            {isHindi ? 'मॉड्यूल्स' : 'Modules'}
          </a>
          <a href="#mobile" className="hover:text-white hover:underline underline-offset-4 transition whitespace-nowrap shrink-0">
            {isHindi ? 'मोबाइल ऐप' : 'Mobile App'}
          </a>
          <a href="#download" className="text-emerald-300 hover:text-emerald-200 hover:underline underline-offset-4 transition whitespace-nowrap shrink-0">
            {isHindi ? 'डाउनलोड (.exe)' : 'Download'}
          </a>
          <a href="#pricing" className="hover:text-white hover:underline underline-offset-4 transition whitespace-nowrap shrink-0">
            {isHindi ? 'प्लान्स' : 'Pricing'}
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onLaunchDemo}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Laptop className="w-4 h-4" />
            <span>{isHindi ? 'Web ERP / लॉगिन' : 'Open Web ERP'}</span>
          </button>
        </div>
      </header>

      {/* HERO SECTION */}
      <section id="top" className="relative overflow-hidden pt-10 sm:pt-14 pb-14 px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-4xl mx-auto space-y-5 relative z-10">
          <div className="flex justify-center pb-1">
            <SnaLogo size="xl" variant="full" showText={false} />
          </div>
          <div className="text-xs font-semibold text-indigo-300 tracking-wide">
            {isHindi
              ? 'भारतीय GST अनुरूप · AI बिल & बैंक ऑटोमेशन · ऑफ़लाइन एवं क्लाउड सुरक्षित'
              : 'GST Compliant · AI Bill & Bank Automation · Offline Local & Cloud Sync'}
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-tight [text-wrap:balance]">
            {isHindi ? (
              <>
                भारतीय व्यापार हेतु संपूर्ण{' '}
                <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-amber-300 bg-clip-text text-transparent">
                  GST बिलिंग, एकाउंटिंग & AI ERP
                </span>{' '}
                सॉफ़्टवेयर
              </>
            ) : (
              <>
                Complete{' '}
                <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-amber-300 bg-clip-text text-transparent">
                  GST Billing, Accounting & AI ERP
                </span>{' '}
                for Indian Business
              </>
            )}
          </h1>

          <p className="text-slate-300 text-base sm:text-lg font-normal leading-relaxed max-w-3xl mx-auto">
            {isHindi
              ? 'सेकंडों में GST इनवॉइस बनाएँ, AI से परचेज बिल व बैंक स्टेटमेंट स्कैन करें, स्टॉक इन्वेंटरी ट्रैक करें, GSTR रिपोर्ट एक्सपोर्ट करें और क्लाउड या लोकल डिवाइस पर सुरक्षित व्यापार संभालें।'
              : 'Create GST invoices with UPI QR in seconds, auto-scan supplier bills & bank statements with AI, manage inventory & payroll, export GSTR JSON, and switch between Cloud Sync or Private Local Mode.'}
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-3">
            <button
              onClick={() => setShowCheckoutModal(true)}
              className="px-7 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-lg shadow-indigo-600/25 transition flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Zap className="w-5 h-5 text-amber-300" />
              <span>{isHindi ? 'सॉफ़्टवेयर लाइसेंस खरीदें' : 'Get Software License'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onLaunchDemo}
              className="px-7 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-100 border border-slate-700 rounded-2xl font-bold text-sm sm:text-base transition flex items-center gap-2 whitespace-nowrap cursor-pointer"
            >
              <Laptop className="w-5 h-5 text-indigo-400" />
              <span>{isHindi ? 'लाइव डेमो चलाकर देखें' : 'Try Live Demo'}</span>
            </button>

            <a
              href="#download"
              className="px-6 py-3.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-2xl font-bold text-sm sm:text-base transition flex items-center gap-2 whitespace-nowrap"
            >
              <Download className="w-5 h-5 text-emerald-400" />
              <span>{isHindi ? 'Windows (.exe) डाउनलोड' : 'Download Windows (.exe)'}</span>
            </a>

            {onToggleLanguage && (
              <button
                type="button"
                onClick={onToggleLanguage}
                className="px-4 py-3.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 rounded-2xl font-bold text-xs sm:text-sm transition whitespace-nowrap cursor-pointer"
              >
                {isHindi ? 'Switch to English' : 'हिंदी में देखें'}
              </button>
            )}
          </div>

          <div className="pt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-slate-400 text-xs font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'अंतिम मूल्य — कोई अतिरिक्त GST नहीं' : 'Transparent Price · Zero Extra GST'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'हिंदी व अंग्रेजी (Bilingual UI)' : 'Hindi & English Bilingual UI'}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{isHindi ? 'सीधे WhatsApp & AnyDesk सपोर्ट' : 'Direct WhatsApp & AnyDesk Support'}</span>
            </div>
          </div>
        </div>

        {/* HERO INTERFACE PREVIEW */}
        <div className="mt-12 rounded-3xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-800 mb-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-200">
                {isHindi ? 'Hisabveda ERP — लाइव डैशबोर्ड प्रीव्यू (सैंपल आंकड़े)' : 'Hisabveda ERP — Sample Dashboard Preview'}
              </span>
            </div>
            <div className="text-[11px] text-emerald-400 font-semibold">
              {isHindi ? 'Counter 1 & 2 क्लाउड सिंक / लोकल मोड तैयार' : 'Cloud Multi-Counter & Local Mode Ready'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isHindi ? 'वार्षिक कुल बिक्री' : 'Sample Annual Sales'}</span>
                <Receipt className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-extrabold text-white font-mono tabular-nums">₹ 14,85,250</div>
              <div className="text-[11px] text-emerald-400 font-medium">GSTR-1 & B2B/B2C Tracked</div>
            </div>

            <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isHindi ? 'ऑटो इनपुट/आउटपुट GST' : 'GST Summary & ITC'}</span>
                <BarChart3 className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-2xl font-extrabold text-indigo-300 font-mono tabular-nums">₹ 2,67,345</div>
              <div className="text-[11px] text-slate-400 font-medium">GSTR-3B & JSON Export Ready</div>
            </div>

            <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isHindi ? 'ग्राहक उधारी / वसूली' : 'Party Receivables'}</span>
                <Users className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-extrabold text-amber-300 font-mono tabular-nums">₹ 3,12,000</div>
              <div className="text-[11px] text-amber-400 font-medium">Bill-by-Bill Ledger Drilldown</div>
            </div>

            <div className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>{isHindi ? 'बैंक व नकद मिलान' : 'Reconciled Bank & Cash'}</span>
                <Landmark className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-extrabold text-cyan-300 font-mono tabular-nums">₹ 8,45,900</div>
              <div className="text-[11px] text-cyan-400 font-medium">AI Passbook BRS Matched</div>
            </div>
          </div>
        </div>

        {/* INTERACTIVE WALKTHROUGH DEMO SECTION */}
        <div id="video-demo" className="mt-14 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">
                {isHindi ? 'इंटरैक्टिव प्रोडक्ट वॉकथ्रू' : 'Interactive Product Walkthrough'}
              </div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                {isHindi ? 'देखें Hisabveda ERP Solution रोज़मर्रा के काम कैसे आसान बनाता है' : 'See How Hisabveda ERP Automates Daily Accounting'}
              </h2>
              <p className="text-slate-400 text-xs mt-1">
                {isHindi
                  ? 'प्रत्येक प्रमुख मॉड्यूल के 5-चरणीय लाइव वर्कफ़्लो को क्लिक करके देखें या कस्टम YouTube डेमो लिंक जोड़ें।'
                  : 'Click through 5-step interactive workflows for key modules, or attach your own YouTube demo stream.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setEmbedInputUrl(customVideoEmbedUrl);
                  setShowEmbedVideoModal(true);
                }}
                className="text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2 rounded-xl transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Video className="w-4 h-4 text-indigo-400" />
                <span>{customVideoEmbedUrl ? (isHindi ? 'YouTube वीडियो बदलें' : 'Change Video URL') : (isHindi ? '+ YouTube डेमो जोड़ें' : '+ Attach YouTube Video')}</span>
              </button>
            </div>
          </div>

          {/* Walkthrough Module Selector Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs font-bold">
            {(
              [
                { id: 'BILLING', icon: Receipt, label: isHindi ? '1. GST बिलिंग (10 सेकंड)' : '1. GST Billing' },
                { id: 'AI_SCAN', icon: ScanLine, label: isHindi ? '2. AI बिल स्कैनर' : '2. AI Purchase Scan' },
                { id: 'INVENTORY', icon: Building2, label: isHindi ? '3. स्टॉक & बारकोड' : '3. Stock & Inventory' },
                { id: 'BANK', icon: Landmark, label: isHindi ? '4. AI बैंक BRS' : '4. AI Bank BRS' },
                { id: 'GSTR', icon: BarChart3, label: isHindi ? '5. GSTR-1 & 3B' : '5. GSTR-1 & 3B' },
                { id: 'PAYROLL', icon: Users, label: isHindi ? '6. सैलरी व पेरोल' : '6. Payroll Slips' }
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveVideoTab(tab.id);
                    setIsPlayingVideo(true);
                    setVideoStep(0);
                  }}
                  className={`px-4 py-2.5 rounded-xl whitespace-nowrap shrink-0 transition flex items-center gap-2 cursor-pointer ${
                    activeVideoTab === tab.id
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Player Frame */}
          <div className="relative rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden min-h-[380px] flex flex-col justify-between p-5 sm:p-7">
            {customVideoEmbedUrl ? (
              <div className="w-full space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-3">
                  <span className="font-bold text-white flex items-center gap-2">
                    <Video className="w-4 h-4 text-indigo-400" />
                    {isHindi ? 'कस्टम YouTube वीडियो डेमो' : 'Official YouTube Demo Video'}
                  </span>
                  <button
                    onClick={() => setCustomVideoEmbedUrl('')}
                    className="text-slate-300 hover:text-white px-3 py-1 rounded-lg bg-slate-800 text-[11px] font-semibold cursor-pointer"
                  >
                    {isHindi ? 'इंटरैक्टिव डेमो पर लौटें' : 'Switch to Interactive Walkthrough'}
                  </button>
                </div>
                <iframe
                  src={getEmbedUrl(customVideoEmbedUrl)}
                  title="Hisabveda ERP Video Demo"
                  className="w-full h-[360px] sm:h-[420px] rounded-xl border-0 bg-black"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between text-xs border-b border-slate-800 pb-3 gap-2">
                  <span className="font-mono text-indigo-300 font-bold">
                    {activeVideoTab === 'BILLING' && (isHindi ? 'वर्कफ़्लो 1: त्वरित GST इनवॉइस + डायनामिक UPI QR' : 'Workflow 1: Fast GST Tax Invoice & UPI QR')}
                    {activeVideoTab === 'AI_SCAN' && (isHindi ? 'वर्कफ़्लो 2: AI PDF/फोटो परचेज बिल स्कैनर' : 'Workflow 2: AI Purchase Bill PDF/Photo Extractor')}
                    {activeVideoTab === 'INVENTORY' && (isHindi ? 'वर्कफ़्लो 3: बारकोड स्टॉक, HSN और लो-स्टॉक अलर्ट' : 'Workflow 3: Inventory Barcode, HSN & Low-Stock Alerts')}
                    {activeVideoTab === 'BANK' && (isHindi ? 'वर्कफ़्लो 4: AI बैंक स्टेटमेंट अपलोड & ऑटो BRS' : 'Workflow 4: AI Bank Statement Upload & Auto BRS')}
                    {activeVideoTab === 'GSTR' && (isHindi ? 'वर्कफ़्लो 5: GSTR-1, GSTR-2B, 3B & JSON एक्सपोर्ट' : 'Workflow 5: GSTR-1, 2B, 3B & Portal JSON Export')}
                    {activeVideoTab === 'PAYROLL' && (isHindi ? 'वर्कफ़्लो 6: कर्मचारी उपस्थिति & मासिक वेतन स्लिप' : 'Workflow 6: Staff Attendance & Salary Slips')}
                  </span>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <Lock className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{isHindi ? 'सुरक्षित सैंपल डेटा प्रीव्यू' : 'Masked Sample Data Preview'}</span>
                  </div>
                </div>

                <div className="my-auto py-5 max-w-3xl mx-auto w-full">
                  {isPlayingVideo ? (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 text-xs">
                        <span className="font-bold text-white">Hisabveda ERP Walkthrough</span>
                        <span className="font-mono tabular-nums text-indigo-300 font-bold">
                          STEP {videoStep + 1} / 5
                        </span>
                      </div>

                      {activeVideoTab === 'BILLING' && (
                        <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300">
                          <div className="flex justify-between text-indigo-300 font-bold border-b border-slate-800 pb-1.5">
                            <span>TAX INVOICE #HV-2026-089</span>
                            <span className="text-emerald-400">READY TO PRINT</span>
                          </div>
                          {videoStep === 0 && (
                            <div className="p-2.5 space-y-1">
                              <div className="font-bold text-white text-sm">Step 1: Party Selection & Live GSTIN Check</div>
                              <p className="text-slate-300">Party: Sharma Enterprises (GSTIN: 23AABCU9603R1ZM)</p>
                              <div className="text-emerald-400">✓ Intra-State CGST/SGST vs IGST auto-selected by state code</div>
                            </div>
                          )}
                          {videoStep === 1 && (
                            <div className="p-2.5 space-y-1">
                              <div className="font-bold text-white text-sm">Step 2: Add Stock Item & Quantity</div>
                              <p className="text-slate-300">Item: Brass Bearing (HSN 8482) · Qty: 100 Pcs @ ₹450.00</p>
                              <div className="text-emerald-400">✓ Real-time inventory stock deducted automatically</div>
                            </div>
                          )}
                          {videoStep === 2 && (
                            <div className="p-2.5 space-y-1">
                              <div className="font-bold text-white text-sm">Step 3: Tax & Round-Off Calculation</div>
                              <p className="text-slate-300">Taxable: ₹45,000 · CGST 9%: ₹4,050 · SGST 9%: ₹4,050</p>
                              <div className="text-amber-300 font-bold">Grand Total: ₹53,100.00</div>
                            </div>
                          )}
                          {videoStep === 3 && (
                            <div className="p-2.5 space-y-1">
                              <div className="font-bold text-white text-sm">Step 4: Dynamic Invoice UPI QR Printed</div>
                              <p className="text-slate-300">Customer scans printed QR with ₹53,100 pre-filled automatically</p>
                              <div className="text-emerald-400">✓ Thermal 80mm & A4 Print formats ready</div>
                            </div>
                          )}
                          {videoStep === 4 && (
                            <div className="p-2.5 space-y-1">
                              <div className="font-bold text-white text-sm">Step 5: WhatsApp PDF Share & Cloud Sync</div>
                              <p className="text-slate-300">PDF invoice shared on WhatsApp & synced to Counter 2 instantly</p>
                              <div className="text-emerald-400">✓ Full bill completed in under 10 seconds</div>
                            </div>
                          )}
                        </div>
                      )}

                      {activeVideoTab === 'AI_SCAN' && (
                        <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300">
                          <div className="flex justify-between text-emerald-300 font-bold border-b border-slate-800 pb-1.5">
                            <span>AI PURCHASE BILL PARSER</span>
                            <span>GEMINI DOCUMENT ENGINE</span>
                          </div>
                          {videoStep === 0 && <div className="p-2">Step 1: Upload supplier PDF or mobile camera photo of purchase bill.</div>}
                          {videoStep === 1 && <div className="p-2">Step 2: AI extracts Vendor Name, GSTIN, Invoice No & Invoice Date.</div>}
                          {videoStep === 2 && <div className="p-2">Step 3: Line items, HSN codes, quantities, rates & GST % auto-mapped.</div>}
                          {videoStep === 3 && <div className="p-2">Step 4: Freight / Packing charges & round-off matched to bill total.</div>}
                          {videoStep === 4 && <div className="p-2 text-emerald-400 font-bold">Step 5: Verify & Save — Stock increases and Payable Ledger updates!</div>}
                        </div>
                      )}

                      {activeVideoTab === 'INVENTORY' && (
                        <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300">
                          <div className="flex justify-between text-indigo-300 font-bold border-b border-slate-800 pb-1.5">
                            <span>STOCK & BARCODE CONTROL</span>
                            <span className="text-amber-400">LIVE LEDGER</span>
                          </div>
                          <div className="p-2 space-y-1.5">
                            <div className="font-bold text-white">Item: Hydraulic Oil 20L Can (HSN 2710)</div>
                            <div className="flex justify-between">
                              <span>Barcode: 890123456789</span>
                              <span className="text-emerald-400 font-bold tabular-nums">In Stock: {120 + videoStep * 15} Cans</span>
                            </div>
                            <div className="text-amber-300">Low-Stock Reorder Alert triggers automatically below threshold.</div>
                          </div>
                        </div>
                      )}

                      {activeVideoTab === 'BANK' && (
                        <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300">
                          <div className="flex justify-between text-indigo-300 font-bold border-b border-slate-800 pb-1.5">
                            <span>AI BANK STATEMENT BRS</span>
                            <span className="text-emerald-400">AUTO MATCHED</span>
                          </div>
                          <div className="p-2 space-y-1">
                            <div className="font-bold text-white">Bank Passbook PDF / CSV Imported (Step {videoStep + 1}/5)</div>
                            <div>Book Balance: ₹3,42,890.50 · Bank Balance: ₹3,42,890.50</div>
                            <div className="text-emerald-400 font-bold">✓ Unmatched NEFT/UPI transfers highlighted for 1-click voucher entry</div>
                          </div>
                        </div>
                      )}

                      {activeVideoTab === 'GSTR' && (
                        <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300">
                          <div className="flex justify-between text-indigo-300 font-bold border-b border-slate-800 pb-1.5">
                            <span>GSTR-1, GSTR-2B & GSTR-3B SUMMARY</span>
                            <span>PORTAL READY</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3 p-1">
                            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              <span className="block text-slate-400">Taxable Sales</span>
                              <span className="font-bold text-white tabular-nums">₹ 12,45,000.00</span>
                            </div>
                            <div className="bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                              <span className="block text-slate-400">Output Tax / Net Payable</span>
                              <span className="font-bold text-amber-300 tabular-nums">₹ 2,24,100.00</span>
                            </div>
                          </div>
                          <div className="text-emerald-400 px-1">✓ Download JSON / Excel Summary for CA review & GST portal upload</div>
                        </div>
                      )}

                      {activeVideoTab === 'PAYROLL' && (
                        <div className="space-y-2 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800 font-mono text-slate-300">
                          <div className="flex justify-between text-indigo-300 font-bold border-b border-slate-800 pb-1.5">
                            <span>PAYROLL & ATTENDANCE LEDGER</span>
                            <span className="text-emerald-400">STEP {videoStep + 1}/5</span>
                          </div>
                          <div className="p-2 space-y-1">
                            <div className="font-bold text-white">Employee: Rajesh Kumar (Senior Accountant)</div>
                            <div>Basic: ₹25,000 · Overtime: ₹3,500 · Advance Adjusted: ₹0</div>
                            <div className="text-emerald-400 font-bold">✓ Monthly Salary Slip PDF & Expense Voucher generated</div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800">
                        <button
                          onClick={() => setVideoStep((prev) => (prev > 0 ? prev - 1 : 4))}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold cursor-pointer"
                        >
                          ← {isHindi ? 'पिछला' : 'Previous'}
                        </button>
                        <div className="flex items-center gap-1.5">
                          {[0, 1, 2, 3, 4].map((step) => (
                            <button
                              key={step}
                              onClick={() => setVideoStep(step)}
                              aria-label={`Step ${step + 1}`}
                              className={`w-2.5 h-2.5 rounded-full transition cursor-pointer ${
                                videoStep === step ? 'bg-indigo-400 scale-125' : 'bg-slate-700'
                              }`}
                            />
                          ))}
                        </div>
                        <button
                          onClick={() => setVideoStep((prev) => (prev + 1) % 5)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold cursor-pointer"
                        >
                          {isHindi ? 'अगला' : 'Next'} →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center space-y-4 max-w-md mx-auto py-4">
                      <button
                        onClick={() => setIsPlayingVideo(true)}
                        className="w-16 h-16 mx-auto rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center shadow-lg transition cursor-pointer"
                        aria-label="Play interactive walkthrough"
                      >
                        <Play className="w-7 h-7 fill-white ml-0.5" />
                      </button>
                      <div>
                        <h3 className="text-lg font-extrabold text-white">
                          {isHindi ? 'इंटरैक्टिव प्रोडक्ट डेमो चलाएँ' : 'Start Interactive Product Walkthrough'}
                        </h3>
                        <p className="text-xs text-slate-400 mt-1">
                          {isHindi
                            ? 'ऊपर दिए गए किसी भी मॉड्यूल को चुनें और देखें GST बिलिंग, AI बिल स्कैनर व बैंक BRS कैसे काम करते हैं।'
                            : 'Select any tab above or click Play to step through GST Billing, AI Bill Scan, Inventory, Bank BRS & GSTR.'}
                        </p>
                      </div>
                      <button
                        onClick={() => setIsPlayingVideo(true)}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-xs transition cursor-pointer inline-flex items-center gap-2"
                      >
                        <Play className="w-4 h-4 fill-white" />
                        <span>{isHindi ? 'वॉकथ्रू शुरू करें' : 'Play Walkthrough'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Controls Bar */}
                <div className="flex flex-wrap items-center justify-between text-xs border-t border-slate-800 pt-3 gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsPlayingVideo(!isPlayingVideo)}
                      className="p-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 hover:text-white cursor-pointer"
                      aria-label={isPlayingVideo ? 'Pause walkthrough' : 'Play walkthrough'}
                    >
                      {isPlayingVideo ? <Pause className="w-4 h-4 text-amber-400" /> : <Play className="w-4 h-4 text-indigo-400" />}
                    </button>
                    <span className="font-mono tabular-nums text-slate-300 text-[11px] font-bold">
                      {isPlayingVideo ? `STEP 0${videoStep + 1} / 05` : 'READY'}
                    </span>
                  </div>

                  <div className="flex-1 max-w-xs bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 transition-all duration-300"
                      style={{ width: isPlayingVideo ? `${((videoStep + 1) / 5) * 100}%` : '0%' }}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setVideoSpeed((prev) => (prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1))}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-700 text-[11px] font-mono cursor-pointer"
                    >
                      {videoSpeed}x
                    </button>
                    <button
                      onClick={onLaunchDemo}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-[11px] transition cursor-pointer whitespace-nowrap"
                    >
                      {isHindi ? 'असली सॉफ़्टवेयर खोलें →' : 'Launch Live App →'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* CORE FEATURES SECTION */}
      <section id="features" className="py-16 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto space-y-2 mb-12">
          <div className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
            {isHindi ? 'मुख्य विशेषताएँ' : 'Core Capabilities'}
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white [text-wrap:balance]">
            {isHindi ? 'हर वह आधुनिक सुविधा जो आपके व्यापार व एकाउंटिंग को तेज़ बनाए' : 'Built With Real Automation, GST Accuracy & Data Privacy'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featureCards.map((ft) => {
            const Icon = ft.icon;
            return (
              <div
                key={ft.num}
                className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl space-y-3 hover:border-indigo-500/50 transition"
              >
                <div className="flex items-center justify-between">
                  <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${ft.accent}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-500">{ft.num}</span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-white">{ft.title}</h3>
                <p className="text-slate-300 text-xs leading-relaxed">{ft.desc}</p>
              </div>
            );
          })}
        </div>

        {/* EXTRA SIGNATURE SPECIALTIES ("AUR BHI KHASIYAT") */}
        <div className="mt-14 pt-12 border-t border-slate-800/70 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase font-extrabold tracking-widest text-amber-400">
                {isHindi ? 'सॉफ़्टवेयर की अन्य प्रमुख खासियतें' : 'More Built-In Specialties'}
              </div>
              <h3 className="text-xl sm:text-3xl font-extrabold text-white mt-1">
                {isHindi ? 'तेज़ एकाउंटिंग व आसान माइग्रेशन के लिए खास स्मार्ट टूल्स' : 'Thoughtful Productivity Tools Included at Zero Extra Cost'}
              </h3>
            </div>
            <p className="text-xs text-slate-400 max-w-md">
              {isHindi
                ? 'अन्य सॉफ़्टवेयर में जिनके लिए अलग से ऐड-ऑन या पैसे देने पड़ते हैं, वे सभी सुविधाएँ पहले से ही Hisabveda ERP में शामिल हैं।'
                : 'Capabilities that legacy tools charge extra add-ons for come pre-built inside every Hisabveda ERP workspace.'}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2.5 text-indigo-300 font-bold text-sm">
                <Keyboard className="w-4 h-4 shrink-0" />
                <span>{isHindi ? 'तेज़ F5–F7 शॉर्टकट्स & ग्लोबल सर्च' : 'Fast F5–F7 Keys & Global Search'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHindi
                  ? 'अकाउंटेंट्स की रफ़्तार के लिए F5 (Payment), F6 (Receipt), F7 (Journal) शॉर्टकट और हेडर में इंस्टेंट ग्लोबल सर्च — कोई भी बिल या पार्टी तुरंत खोलें।'
                  : 'Speed through daily entries using classic F5/F6/F7 voucher keys and a global instant search bar to jump to any invoice, party, or ledger.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2.5 text-emerald-300 font-bold text-sm">
                <UploadCloud className="w-4 h-4 shrink-0" />
                <span>{isHindi ? '1-क्लिक Bulk CSV / Excel डेटा इम्पोर्ट' : '1-Click Bulk CSV/Excel Migration'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHindi
                  ? 'पुराने सॉफ़्टवेयर या Excel से सैकड़ों/हज़ारों स्टॉक आइटम्स, HSN कोड, रेट और पार्टी बैलेंस एक साथ CSV के ज़रिए Merge या Append करें — नई शुरुआत मिनटों में।'
                  : 'Import thousands of existing items, HSN codes, rates, and party opening balances via CSV/Excel with smart Merge or Append duplicate safety.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2.5 text-amber-300 font-bold text-sm">
                <CalendarClock className="w-4 h-4 shrink-0" />
                <span>{isHindi ? 'GSTR-2B मिलान & टैक्स ड्यू-डेट अलर्ट' : 'GSTR-2B Matching & Due-Date Alerts'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHindi
                  ? 'खरीद पर मिलने वाले ITC का GSTR-2B मिलान करें, TDS रजिस्टर देखें और GST/TDS रिटर्न जमा करने की अंतिम तारीखों का रिमाइंडर पाएँ।'
                  : 'Reconcile supplier purchase ITC with GSTR-2B, maintain a clean TDS register, and track upcoming statutory GST/TDS filing due dates.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2.5 text-purple-300 font-bold text-sm">
                <Palette className="w-4 h-4 shrink-0" />
                <span>{isHindi ? '5 कलर थीम, ज़ूम (80–125%) & Bilingual' : '5 Custom Themes, Zoom & Bilingual UI'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHindi
                  ? 'आँखों के आराम के लिए Dark, Light, Navy, Emerald या Purple थीम चुनें, स्क्रीन ज़ूम सेट करें और 1-क्लिक में पूरा ऐप हिंदी या अंग्रेजी में बदलें।'
                  : 'Pick Slate Dark, Light, Navy, Emerald, or Purple themes, adjust screen zoom (80%–125%) for any monitor, and toggle Hindi ⇄ English anytime.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2.5 text-cyan-300 font-bold text-sm">
                <PiggyBank className="w-4 h-4 shrink-0" />
                <span>{isHindi ? 'बजट कंट्रोल & छेड़छाड़-रोधी ऑडिट लॉग' : 'Expense Budgeting & Audit Trail'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHindi
                  ? 'हर खर्च श्रेणी के लिए मासिक बजट सीमा तय करें और स्टाफ द्वारा किए गए हर बिल बदलाव या डिलीट का रिकॉर्ड Audit History में सुरक्षित देखें।'
                  : 'Set monthly category expense limits vs actual spend and inspect every voucher creation, edit, or deletion in the full Audit Log.'}
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2.5 text-rose-300 font-bold text-sm">
                <Search className="w-4 h-4 shrink-0" />
                <span>{isHindi ? 'पार्टी ड्रिलडाउन लेजर & मल्टी-करेंसी' : 'Interactive Ledger Drilldown & Multi-Currency'}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                {isHindi
                  ? 'किसी भी ग्राहक/सप्लायर पर क्लिक कर सीधे उसके सभी बिल, रसीद और बकाया देख सकते हैं, साथ ही INR व अंतर्राष्ट्रीय करेंसी सपोर्ट भी उपलब्ध है।'
                  : 'Click any party or ledger account to drill straight down to source bills and vouchers, with support for INR as well as international currencies.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* COMPLETE MODULES DIRECTORY (Fixes #modules link!) */}
      <section id="modules" className="py-16 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-10">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs uppercase font-extrabold tracking-widest text-emerald-400">
              {isHindi ? 'संपूर्ण ERP मॉड्यूल्स' : 'Complete ERP Modules'}
            </div>
            <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
              {isHindi ? 'एक ही प्लेटफ़ॉर्म में 20+ एकाउंटिंग व बिज़नेस मॉड्यूल्स' : 'Everything Your Counter, Store & Accountant Need in One System'}
            </h2>
          </div>
          <button
            onClick={onLaunchDemo}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-indigo-300 font-bold text-xs rounded-xl transition whitespace-nowrap self-start lg:self-auto cursor-pointer"
          >
            {isHindi ? 'सॉफ़्टवेयर के भीतर सभी मॉड्यूल देखें →' : 'Explore Modules Inside Demo →'}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Module Category Selector */}
          <div className="lg:col-span-5 space-y-2.5">
            {moduleGroups.map((group, idx) => {
              const Icon = group.icon;
              const isSelected = activeModuleGroup === idx;
              return (
                <button
                  key={group.title}
                  onClick={() => setActiveModuleGroup(idx)}
                  className={`w-full text-left p-4 rounded-2xl border transition flex items-start gap-3.5 cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600/15 border-indigo-500/70 text-white'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className={`p-2.5 rounded-xl shrink-0 ${isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">{group.title}</div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{group.summary}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right Selected Module Details */}
          <div className="lg:col-span-7 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  {isHindi ? 'मॉड्यूल विवरण' : 'Included Capabilities'}
                </div>
                <h3 className="text-xl font-extrabold text-white mt-1">{moduleGroups[activeModuleGroup].title}</h3>
              </div>
              <FileSpreadsheet className="w-6 h-6 text-indigo-400 shrink-0" />
            </div>

            <div className="space-y-3">
              {moduleGroups[activeModuleGroup].items.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm text-slate-200 py-1.5 border-b border-slate-800/60 last:border-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
              <span>{isHindi ? 'Desktop Browser, Windows PWA & Mobile पर उपलब्ध' : 'Runs smoothly on Windows PC, Laptop & Mobile PWA'}</span>
              <button
                onClick={() => setShowCheckoutModal(true)}
                className="text-indigo-300 hover:text-indigo-200 font-bold underline underline-offset-4 cursor-pointer"
              >
                {isHindi ? 'लाइसेंस ऑर्डर करें' : 'Order License Now'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* MOBILE APP & SMARTPHONE CAPABILITIES SECTION */}
      <section id="mobile" className="py-16 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left: Smartphone Screen Mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-[320px] rounded-[2.2rem] border-4 border-slate-700 bg-slate-950 p-4 shadow-2xl space-y-4">
              <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 border-b border-slate-800 pb-2.5">
                <span className="font-bold text-white flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                  Hisabveda Mobile
                </span>
                <span className="text-emerald-400 font-semibold">PWA · Cloud Sync</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1">
                <div className="text-[11px] text-slate-400">{isHindi ? 'आज की लाइव बिक्री' : "Today's Counter Sales"}</div>
                <div className="text-xl font-extrabold font-mono tabular-nums text-white">₹ 48,650.00</div>
                <div className="text-[11px] text-emerald-400">{isHindi ? 'Counter 1 से लाइव सिंक' : 'Synced live from Counter 1'}</div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-[11px] font-bold">
                <div className="p-3 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-200 space-y-1">
                  <Receipt className="w-4 h-4 text-indigo-400" />
                  <div>{isHindi ? 'मोबाइल से बिल बनाएँ' : 'Create Bill + QR'}</div>
                </div>
                <div className="p-3 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-200 space-y-1">
                  <ScanLine className="w-4 h-4 text-emerald-400" />
                  <div>{isHindi ? 'कैमरा AI बिल स्कैन' : 'Photo AI Bill Scan'}</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-600/20 border border-amber-500/30 text-amber-200 space-y-1">
                  <Users className="w-4 h-4 text-amber-400" />
                  <div>{isHindi ? 'उधारी / लेजर देखें' : 'Party Dues Check'}</div>
                </div>
                <div className="p-3 rounded-xl bg-cyan-600/20 border border-cyan-500/30 text-cyan-200 space-y-1">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <div>{isHindi ? 'WhatsApp बिल भेजें' : 'WhatsApp Share'}</div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between text-[11px]">
                <div>
                  <div className="font-bold text-white">{isHindi ? 'Android & iOS Ready' : 'Android & iOS Ready'}</div>
                  <div className="text-slate-400">{isHindi ? 'होम स्क्रीन पर 1-क्लिक इंस्टॉल' : '1-Tap Home Screen Install'}</div>
                </div>
                <QrCode className="w-7 h-7 text-indigo-400 shrink-0" />
              </div>
            </div>
          </div>

          {/* Right: Mobile Capabilities Breakdown */}
          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-2">
              <div className="text-xs uppercase font-extrabold tracking-widest text-emerald-400">
                {isHindi ? 'मोबाइल एवं ऑन-द-गो एकाउंटिंग' : 'Mobile App & On-The-Go Access'}
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white [text-wrap:balance]">
                {isHindi ? 'आपकी पूरी दुकान व मुनीम अब सीधे आपकी जेब में — Android व iPhone दोनों पर' : 'Run Your Business From Anywhere on Android & iPhone'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                {isHindi
                  ? 'Hisabveda ERP सिर्फ कंप्यूटर तक सीमित नहीं है। आप यात्रा में हों या गोदाम में — अपने स्मार्टफोन से लाइव बिक्री, स्टॉक, पार्टी उधारी और बिलिंग तुरंत संभाल सकते हैं।'
                  : 'Hisabveda ERP is not tied to one shop desk. Whether travelling or visiting clients, manage live sales, stock, receivables, and billing right from your smartphone.'}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{isHindi ? '1-क्लिक PWA मोबाइल ऐप' : '1-Click PWA Mobile App'}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? 'Android (Chrome) या iPhone (Safari) से बिना Play Store झंझट के सीधे होम स्क्रीन पर फुल-स्क्रीन मोबाइल ऐप इंस्टॉल करें।'
                    : 'Install directly onto Android or iPhone home screens via Chrome/Safari as a native-feeling full-screen app without Play Store delays.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>{isHindi ? 'QR कोड स्कैन से तुरंत मोबाइल लिंक' : 'Instant QR Phone Link'}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? 'डेस्कटॉप सॉफ्टवेयर के Mobile Setup से QR स्कैन करें और सेकंडों में अपने फोन पर सुरक्षित क्लाइंट/ऑनर व्यू खोलें।'
                    : 'Scan the built-in QR code inside the ERP header to open the mobile-optimized workspace on your phone in seconds.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <ScanLine className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{isHindi ? 'मोबाइल कैमरा से AI बिल स्कैन & WhatsApp' : 'Phone Camera AI Scan & WhatsApp'}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? 'फोन के कैमरे से परचेज बिल की फोटो खींचकर ऑटो एंट्री करें, और ग्राहकों को तुरंत UPI QR वाले PDF बिल WhatsApp पर भेजें।'
                    : 'Snap purchase bill photos straight from your phone camera for AI data entry, and dispatch GST PDF bills with UPI QR over WhatsApp.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-1.5">
                <div className="font-bold text-white text-sm flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{isHindi ? 'Android APK बिल्डर टूल भी शामिल' : 'Built-In Android APK Builder'}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? 'यदि आप अलग से Android `.APK` फ़ाइल बनाना चाहते हैं, तो सॉफ़्टवेयर में इन-बिल्ट Capacitor APK बिल्डर स्क्रिप्ट भी दी गई है।'
                    : 'Need a standalone `.APK` installer for Android distribution? Includes a ready-to-run Capacitor Android APK generator script inside the app.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                onClick={onLaunchDemo}
                className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer"
              >
                <Smartphone className="w-4 h-4" />
                <span>{isHindi ? 'मोबाइल-रेडी लाइव डेमो खोलें' : 'Open Mobile-Ready Demo'}</span>
              </button>
              <button
                onClick={() => setShowCheckoutModal(true)}
                className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                {isHindi ? 'मोबाइल + डेस्कटॉप लाइसेंस खरीदें' : 'Get Desktop + Mobile License'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* BUSINESS ADVANTAGES & COMPARISON SECTION */}
      <section id="advantages" className="py-16 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-800/80 space-y-10">
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <div className="text-xs uppercase font-extrabold tracking-widest text-amber-400">
            {isHindi ? 'व्यापार को मिलने वाले प्रमुख लाभ' : 'Why Businesses Switch to Hisabveda'}
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white [text-wrap:balance]">
            {isHindi ? 'पारंपरिक रजिस्टर व महँगे ERP की तुलना में स्पष्ट बढ़त' : 'Clear Operational Advantages Over Legacy Accounting Tools'}
          </h2>
        </div>

        {/* Comparison Table */}
        <div className="overflow-x-auto rounded-3xl border border-slate-800 bg-slate-900/70">
          <table className="w-full text-left text-xs sm:text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-300">
                <th className="p-4 font-bold">{isHindi ? 'व्यापार की जरूरत' : 'Business Area'}</th>
                <th className="p-4 font-bold text-slate-400">{isHindi ? 'पुरानी / महँगी प्रणाली' : 'Manual / Legacy Software'}</th>
                <th className="p-4 font-bold text-emerald-400">{isHindi ? 'Hisabveda ERP Solution' : 'Hisabveda ERP Solution'}</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.aspect} className="border-b border-slate-800/70 last:border-0">
                  <td className="p-4 font-bold text-white">{row.aspect}</td>
                  <td className="p-4 text-slate-400">{row.traditional}</td>
                  <td className="p-4 text-emerald-300 font-semibold">{row.hisabveda}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Storage Modes Advantage Highlight */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                <Cloud className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {isHindi ? 'फायदा 1: मल्टी-काउंटर रियल-टाइम क्लाउड सिंक' : 'Advantage 1: Multi-Counter Real-Time Cloud Sync'}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isHindi
                ? 'एक ही कंपनी अकाउंट से Counter 1, Counter 2 और मालिक के मोबाइल/लैपटॉप पर लाइव बिल, स्टॉक और डैशबोर्ड तुरंत सिंक होते हैं — हर कंपनी का डेटा सख्त अलग और सुरक्षित रहता है।'
                : 'Connect Counter 1, Counter 2, and the owner laptop seamlessly. Invoices, stock levels, and recent entries sync automatically with strict tenant-isolated database security.'}
            </p>
          </div>

          <div className="p-6 bg-slate-900/70 border border-slate-800 rounded-3xl space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white">
                {isHindi ? 'फायदा 2: पर्सनल डिवाइस प्राइवेट मोड (बिना क्लाउड)' : 'Advantage 2: Personal Device Private Mode (Offline-Safe)'}
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {isHindi
                ? 'यदि आप अपना खाता-बही किसी भी ऑनलाइन सर्वर पर नहीं रखना चाहते, तो सेटिंग्स से Personal Device Only मोड चुनें — डेटा केवल आपके अपने कंप्यूटर पर रहेगा और JSON बैकअप से कभी भी रीस्टोर किया जा सकेगा।'
                : 'Prefer zero cloud exposure? Switch to Personal Device Only storage mode anytime—all books stay exclusively on your local computer with instant offline JSON backup & restore.'}
            </p>
          </div>
        </div>
      </section>

      {/* WINDOWS DESKTOP (.EXE) DOWNLOAD SECTION */}
      <section id="download" className="py-16 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/90 p-6 sm:p-10 space-y-8">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2.5 max-w-2xl">
              <div className="text-xs uppercase font-extrabold tracking-widest text-emerald-400 font-mono">
                {`WINDOWS DESKTOP INSTALLER · v${windowsExeVersion} · WINDOWS 10 / 11 (64-BIT)`}
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
                {isHindi
                  ? 'Windows कंप्यूटर हेतु Hisabveda ERP (.exe) डाउनलोड करें'
                  : 'Download Windows Desktop (.exe) Offline & Vault Edition'}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {isHindi
                  ? 'आपके PC पर सीधे हार्ड-डिस्क डेटाबेस सेव (AES-256 एन्क्रिप्टेड लाइसेंस वॉल्ट), 30-दिन के ऑटोमैटिक डेली बैकअप और बिना इंटरनेट के तेज़ बिलिंग के लिए आधिकारिक डेस्कटॉप इंस्टॉलर।'
                  : 'Native Windows desktop edition with permanent disk JSON storage, 30-day automatic daily backup rotation, and hardware-bound AES-256 license protection.'}
              </p>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={handleDownloadWindowsExe}
                className="px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-sm rounded-2xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2.5 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-5 h-5" />
                <span>
                  {isHindi
                    ? `Download Windows Desktop (.exe) v${windowsExeVersion}`
                    : `Download Windows Desktop (.exe) v${windowsExeVersion}`}
                </span>
                {resolvedExeUrl && <ExternalLink className="w-4 h-4 opacity-75" />}
              </button>

              {onOpenInstallerSettings && (
                <button
                  type="button"
                  onClick={onOpenInstallerSettings}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-sky-400" />
                  <span>{isHindi ? '.exe डाउनलोड लिंक बदलें (Settings)' : 'Configure .exe Download URL'}</span>
                </button>
              )}
            </div>
          </div>

          {downloadStatusNotice && (
            <div
              className={`p-4 rounded-2xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                downloadStatusNotice.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {downloadStatusNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                )}
                <span className="leading-relaxed">{downloadStatusNotice.text}</span>
              </div>

              {downloadStatusNotice.type === 'setup' && (
                <div className="flex items-center gap-2 shrink-0">
                  {onOpenInstallerSettings && (
                    <button
                      type="button"
                      onClick={onOpenInstallerSettings}
                      className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold rounded-lg text-xs whitespace-nowrap cursor-pointer"
                    >
                      {isHindi ? 'लिंक सेट करें' : 'Open Settings'}
                    </button>
                  )}
                  <a
                    href={`https://wa.me/917489655303?text=${encodeURIComponent(`Namaste, please share Hisabveda ERP v${windowsExeVersion} Windows (.exe) installer download link.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs whitespace-nowrap"
                  >
                    {isHindi ? 'WhatsApp से मँगवाएँ' : 'Request on WhatsApp'}
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* System Requirements */}
            <div className="lg:col-span-5 bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-300">
                <Monitor className="w-4 h-4 text-sky-400" />
                <span>{isHindi ? 'सिस्टम आवश्यकताएँ (PC Requirements)' : 'Windows System Requirements'}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-0.5">
                  <div className="text-slate-400">{isHindi ? 'ऑपरेटिंग सिस्टम' : 'Operating System'}</div>
                  <div className="font-bold text-white">Windows 10 / 11 (64-bit)</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-0.5">
                  <div className="text-slate-400">{isHindi ? 'प्रोसेसर व RAM' : 'Processor & Memory'}</div>
                  <div className="font-bold text-white">Intel/AMD · 4 GB+ RAM</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-0.5">
                  <div className="text-slate-400">{isHindi ? 'डिस्क स्टोरेज' : 'Disk Space'}</div>
                  <div className="font-bold text-white font-mono tabular-nums">250 MB Free SSD/HDD</div>
                </div>
                <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-0.5">
                  <div className="text-slate-400">{isHindi ? 'सुरक्षा एवं डेटा वॉल्ट' : 'Vault & Anti-Tamper'}</div>
                  <div className="font-bold text-emerald-300">AES-256 + HWID Lock</div>
                </div>
              </div>
            </div>

            {/* 4-Step Installation & Hardware Activation Steps */}
            <div className="lg:col-span-7 bg-slate-950/90 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-300">
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>{isHindi ? 'इंस्टॉलेशन और लाइसेंस एक्टिवेशन प्रक्रिया' : '4-Step Installation & PC Binding Guide'}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="font-bold text-emerald-300">
                    {isHindi ? '1. Setup (.exe) डाउनलोड व इंस्टॉल करें' : '1. Download & Run Setup .exe'}
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {isHindi
                      ? 'इंस्टॉलर चलाएँ (SmartScreen चेतावनी आने पर "More info → Run anyway" चुनें)। डेस्कटॉप पर लोगो आइकन बन जाएगा।'
                      : 'Launch the installer (click "More info → Run anyway" if Windows SmartScreen prompts). Creates Desktop shortcut.'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="font-bold text-indigo-300">
                    {isHindi ? '2. 7 दिन / 50 बिल फ्री ट्रायल शुरू करें' : '2. Start 7-Day Free Trial Immediately'}
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {isHindi
                      ? 'सभी डेटा आपके PC के सुरक्षित UserData फ़ोल्डर में ऑटो-बैकअप के साथ सेव होता है।'
                      : 'Explore GST billing, Tally XML import, and accounts locally with automatic daily disk backup rotation.'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="font-bold text-amber-300">
                    {isHindi ? '3. अपना Hardware Machine ID भेजें' : '3. Copy Your Hardware Machine ID'}
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {isHindi
                      ? 'एक्टिवेशन स्क्रीन से इस PC का यूनीक HWID कॉपी करें और हमें भेजें — की सीधे इसी कंप्यूटर के लिए बनेगी।'
                      : 'Open Activation Center, copy this computer’s Hardware Fingerprint ID (HWID), and receive your bound license key.'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="font-bold text-sky-300">
                    {isHindi ? '4. Key डालते ही वैधता तुरंत शुरू' : '4. Instant PC Lock & Countdown'}
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    {isHindi
                      ? 'Key एक्टिवेट करते ही लाइसेंस इस मशीन पर लॉक हो जाता है और चुने गए प्लान की वैधता (जैसे 365 दिन) तुरंत शुरू हो जाती है।'
                      : 'Entering the key locks the license strictly to your motherboard/CPU and starts the exact validity countdown immediately.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING SECTION */}
      <section id="pricing" className="py-16 px-4 sm:px-8 max-w-7xl mx-auto border-t border-slate-800/80">
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-10">
          <div className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
            {isHindi ? 'किफायती एवं पारदर्शी योजनाएं' : 'Affordable & Transparent Pricing'}
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white">
            {isHindi ? 'अपने व्यापार के अनुकूल सही लाइसेंस चुनें' : 'Choose the Right License for Your Business'}
          </h2>
          <p className="text-xs text-emerald-400 font-semibold">
            {isHindi
              ? 'सीधा इंडिविजुअल प्रोप्राइटर लाइसेंस (Non-GST Billing) — दिखाए गए मूल्य अंतिम हैं, कोई अतिरिक्त 18% GST नहीं।'
              : 'Direct Proprietor Billing (Non-GST) — Prices shown are final with zero hidden taxes.'}
          </p>

          {/* Billing Toggle */}
          <div className="inline-flex items-center bg-slate-900 p-1.5 rounded-2xl border border-slate-800 mt-3 text-xs font-bold">
            <button
              onClick={() => setBillingCycle('LIFETIME')}
              className={`px-5 py-2 rounded-xl transition cursor-pointer ${
                billingCycle === 'LIFETIME' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isHindi ? 'लाइफटाइम लाइसेंस (One Time)' : 'Lifetime License (One-Time)'}
            </button>
            <button
              onClick={() => setBillingCycle('YEARLY')}
              className={`px-5 py-2 rounded-xl transition cursor-pointer ${
                billingCycle === 'YEARLY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {isHindi ? 'वार्षिक लाइसेंस (1 Year)' : 'Annual License (1 Year)'}
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {(Object.keys(plans) as Array<PlanKey>).map((planKey) => {
            const plan = plans[planKey];
            const price = billingCycle === 'LIFETIME' ? plan.lifetimePrice : plan.yearlyPrice;

            return (
              <div
                key={planKey}
                className={`relative rounded-3xl bg-gradient-to-b ${plan.color} p-7 border flex flex-col justify-between space-y-6`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-400">{plan.tag}</span>
                    {plan.popular && (
                      <span className="text-amber-300 font-extrabold uppercase tracking-wide">
                        {isHindi ? 'सर्वप्रिय' : 'Best Value'}
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>

                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-extrabold font-mono tabular-nums text-white">
                        {formatCurrency(price, 'INR')}
                      </span>
                      <span className="text-slate-400 text-xs font-semibold">
                        {billingCycle === 'LIFETIME' ? (isHindi ? '/ आजीवन' : '/ Lifetime') : (isHindi ? '/ वर्ष' : '/ Year')}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-400 mt-1 font-medium">
                      {isHindi ? 'अंतिम मूल्य (कोई अतिरिक्त GST नहीं)' : 'Final Price · No Extra GST'}
                    </div>
                  </div>

                  <div className="border-t border-slate-800 pt-4 space-y-3">
                    {plan.features.map((ft) => (
                      <div key={ft} className="flex items-start gap-2 text-xs text-slate-200">
                        <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{ft}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => {
                    setSelectedPlan(planKey);
                    setShowCheckoutModal(true);
                  }}
                  className={`w-full py-3.5 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-2 cursor-pointer ${
                    plan.popular
                      ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4" />
                  <span>{isHindi ? 'लाइसेंस प्राप्त करें' : 'Buy This License'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* FREQUENTLY ASKED QUESTIONS */}
      <section id="faq" className="py-16 px-4 sm:px-8 max-w-5xl mx-auto border-t border-slate-800/80 space-y-8">
        <div className="text-center space-y-2">
          <div className="text-xs uppercase font-extrabold tracking-widest text-indigo-400">
            {isHindi ? 'अक्सर पूछे जाने वाले सवाल' : 'Frequently Asked Questions'}
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            {isHindi ? 'सॉफ़्टवेयर, सुरक्षा व बिलिंग से जुड़े सवाल' : 'Common Questions Answered Clearly'}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 space-y-2">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{isHindi ? 'क्या बिना इंटरनेट या ऑफ़लाइन भी उपयोग हो सकता है?' : 'Can I use it offline without internet?'}</span>
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              {isHindi
                ? 'हाँ! Personal Device Local Mode में पूरा डेटा आपके कंप्यूटर पर रहता है और बिना इंटरनेट बिलिंग/लेजर काम करते हैं। Cloud Sync और AI स्कैनर के लिए इंटरनेट आवश्यक होता है।'
                : 'Yes! In Personal Device Local Mode your books stay locally on your device for offline billing & ledgers. Internet is needed for Cloud Sync, live GSTIN lookup, and AI scanning.'}
            </p>
          </div>

          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 space-y-2">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{isHindi ? 'Counter 1 और Counter 2 पर एक साथ डेटा कैसे सिंक होगा?' : 'How does Multi-Counter sync keep data private?'}</span>
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              {isHindi
                ? 'प्रत्येक व्यापार का डेटा उसके सुरक्षित टेनेंट ID में पूरी तरह अलग रहता है — कोई दूसरा ग्राहक आपका डेटा नहीं देख सकता। आप अपने दोनों काउंटर पर एक ही कंपनी ईमेल से लॉगिन कर लाइव सिंक चला सकते हैं।'
                : 'Each business has strict database isolation so no other customer can ever view your books. Simply sign in on Counter 1 & Counter 2 with your business account for live Cloud Sync.'}
            </p>
          </div>

          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 space-y-2">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{isHindi ? 'क्या मैं कंप्यूटर बदलने पर पूरा डेटा ट्रांसफर कर सकता हूँ?' : 'Can I export backups or switch computers easily?'}</span>
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              {isHindi
                ? 'बिल्कुल! क्लाउड मोड में ईमेल लॉगिन करते ही डेटा आ जाता है, और 1-क्लिक JSON बैकअप डाउनलोड करके किसी भी नए लैपटॉप पर सेकंडों में इम्पोर्ट किया जा सकता है।'
                : 'Yes! In Cloud mode simply sign in on your new PC, or download a 1-click full JSON backup file anytime and restore it onto another system.'}
            </p>
          </div>

          <div className="p-5 bg-slate-900/70 rounded-2xl border border-slate-800 space-y-2">
            <h3 className="font-bold text-white text-sm flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>{isHindi ? 'सॉफ़्टवेयर का स्वामित्व व सपोर्ट कौन प्रदान करता है?' : 'Who owns the software & handles customer support?'}</span>
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed">
              {isHindi
                ? 'Hisabveda ERP का संचालन शैलेन्द्र बनवार (अकाउंटेंट एवं प्रोप्राइटर, भोपाल, म.प्र.) द्वारा किया जाता है। सेटअप, ट्रेनिंग और सपोर्ट के लिए सीधे WhatsApp/फोन (+91 7489655303) उपलब्ध है।'
                : 'Hisabveda ERP is owned and supported directly by Shailendra Banwar (Accountant & Proprietor, Bhopal, MP) via WhatsApp, Phone (+91 7489655303), and AnyDesk.'}
            </p>
          </div>
        </div>
      </section>

      {/* SOFTWARE & STATUTORY DISCLAIMER SECTION */}
      <section id="disclaimer" className="py-8 px-4 sm:px-8 max-w-7xl mx-auto">
        <div className="rounded-3xl border border-amber-500/30 bg-slate-900/80 p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                {isHindi ? 'सॉफ़्टवेयर एवं वैधानिक अस्वीकरण (Disclaimer)' : 'Software, Tax & AI Advisory Disclaimer'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {isHindi ? 'उपयोग एवं लाइसेंस लेने से पहले कृपया महत्वपूर्ण सूचना पढ़ें' : 'Important operational, GST filing, AI accuracy, and data backup notice'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Scale className="w-4 h-4 shrink-0" />
                <span>{isHindi ? '1. GST / टैक्स फाइलिंग एवं वैधानिक जिम्मेदारी' : '1. Tax & Statutory Compliance Verification'}</span>
              </div>
              <p>
                {isHindi
                  ? 'Hisabveda ERP आपके द्वारा दर्ज किए गए बिलों व वाउचर के आधार पर GSTR-1/2B/3B समरी, E-Way Bill JSON, TDS और एकाउंटिंग रिपोर्ट तैयार करने का एक सहायक टूल है। GSTN या इनकम टैक्स पोर्टल पर अंतिम रिटर्न दाखिल करने से पहले सभी आंकड़ों की जाँच स्वयं या अपने चार्टर्ड अकाउंटेंट (CA) से अवश्य कराएँ।'
                  : 'Hisabveda ERP is an accounting productivity tool generating GSTR-1/2B/3B summaries, E-Way Bill JSONs, TDS, and financial statements strictly from user-entered data. Users or their Chartered Accountants must verify final figures before submitting statutory returns on government portals.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <ScanLine className="w-4 h-4 shrink-0" />
                <span>{isHindi ? '2. AI बिल/बैंक स्कैनर एवं GSTIN लुकअप' : '2. AI Document Extraction & GSTIN Lookup'}</span>
              </div>
              <p>
                {isHindi
                  ? 'AI PDF/फोटो बिल स्कैनर, बैंक स्टेटमेंट पार्सर और ऑनलाइन GSTIN खोज सुविधाएँ केवल आपकी डेटा एंट्री तेज करने के लिए हैं। धुंधली स्कैन कॉपी या बाहरी पोर्टल बदलाव के कारण मात्रा, दर या टैक्स अंकों में अंतर आ सकता है — वाउचर सेव करने से पहले मिलान अवश्य करें।'
                  : 'AI purchase bill parsing, bank statement extraction, and live GSTIN lookups are assistive automation aids. Scan clarity or external portal changes may affect extracted fields—always review values before saving final vouchers.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 shrink-0" />
                <span>{isHindi ? '3. डेटा बैकअप एवं इंटरनेट उपलब्धता' : '3. User Data Backup Responsibility'}</span>
              </div>
              <p>
                {isHindi
                  ? 'Personal Device Local Mode में डेटा आपके ब्राउज़र/डिवाइस में स्टोर होता है, जो ब्राउज़र डेटा क्लियर करने या सिस्टम खराब होने पर हट सकता है। कृपया नियमित रूप से Settings से JSON पूर्ण बैकअप डाउनलोड कर सुरक्षित रखें।'
                  : 'In Personal Device Local Mode, data resides inside your device browser storage and may be lost if browser storage is cleared or hardware fails. Users are strongly advised to regularly download offline JSON backups.'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-1.5">
              <div className="font-bold text-amber-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 shrink-0" />
                <span>{isHindi ? '4. स्वामित्व व गैर-GST बिलिंग सूचना' : '4. Proprietor Ownership & Non-GST Notice'}</span>
              </div>
              <p>
                {isHindi
                  ? 'यह सॉफ़्टवेयर शैलेन्द्र बनवार (इंडिविजुअल प्रोप्राइटर एवं अकाउंटेंट, भोपाल, मध्य प्रदेश) द्वारा संचालित है। वर्तमान में GST पंजीकरण सीमा से कम होने के कारण लाइसेंस शुल्क पर कोई GST नहीं वसूला जाता है और न ही टैक्स इनवॉइस पर GST चार्ज किया जाता है।'
                  : 'This software service is operated by Shailendra Banwar (Individual Proprietor, Bhopal, Madhya Pradesh, India). As an unregistered individual provider below GST threshold limits, no GST is charged on software license fees.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER & CONTACT */}
      <footer id="contact" className="mt-8 bg-slate-900 border-t border-slate-800 py-12 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 items-center text-center md:text-left">
          <div className="space-y-2">
            <div className="flex items-center justify-center md:justify-start">
              <SnaLogo size="md" showText={true} />
            </div>
            <p className="text-xs text-slate-400">
              {isHindi ? 'विश्वसनीय भारतीय GST बिलिंग, AI एवं एकाउंटिंग सॉफ़्टवेयर' : 'Trusted Indian GST Billing, AI & Accounting ERP Software'}
            </p>
            <div className="text-xs text-slate-400 pt-1">
              <span className="text-slate-200 font-semibold">Prop. Shailendra Banwar</span> · Bhopal, Madhya Pradesh
            </div>
          </div>

          <div className="space-y-1.5 text-xs text-slate-300">
            <div className="font-bold text-white mb-1">{isHindi ? 'सेल्स एवं ग्राहक सहायता (Customer Support):' : 'Sales & Customer Support:'}</div>
            <div className="flex items-center justify-center md:justify-start gap-2 text-indigo-300 font-mono font-bold text-sm">
              <PhoneCall className="w-4 h-4 text-emerald-400" />
              <span>+91 7489655303</span>
            </div>
            <div>
              Support Email:{' '}
              <a href="mailto:support@hisabveda.com" className="text-emerald-300 hover:underline font-semibold">
                support@hisabveda.com
              </a>
            </div>
            <div className="text-[11px] text-slate-400">
              Web:{' '}
              <a href="https://hisabveda.com" className="text-indigo-300 hover:underline">
                hisabveda.com
              </a>
              {' · '}
              <a href="https://hisabveda.in" className="text-indigo-300 hover:underline">
                hisabveda.in
              </a>
              {' · UPI: '}
              <span className="font-mono text-emerald-400">7489655303@hdfcbank</span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center md:justify-end gap-3">
            <a
              href={`https://wa.me/917489655303?text=${encodeURIComponent('Namaste Shailendra ji, I want to know more / buy Hisabveda ERP Software.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition inline-flex items-center gap-2 whitespace-nowrap"
            >
              <MessageSquare className="w-4 h-4" />
              <span>{isHindi ? 'WhatsApp पर पूछें' : 'WhatsApp Inquiry'}</span>
            </a>
            <button
              onClick={() => setShowCheckoutModal(true)}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer whitespace-nowrap"
            >
              {isHindi ? 'अभी खरीदें' : 'Buy License'}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 max-w-7xl mx-auto text-[11px] text-slate-400">
          <div>
            © {new Date().getFullYear()} Hisabveda ERP Solution (Prop. Shailendra Banwar, Bhopal, MP). All Rights Reserved.
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => setActiveLegalDoc('TERMS')} className="hover:text-indigo-300 transition underline cursor-pointer">
              {isHindi ? 'नियम व शर्तें' : 'Terms'}
            </button>
            <button type="button" onClick={() => setActiveLegalDoc('PRIVACY')} className="hover:text-indigo-300 transition underline cursor-pointer">
              {isHindi ? 'गोपनीयता नीति' : 'Privacy'}
            </button>
            <button type="button" onClick={() => setActiveLegalDoc('REFUND')} className="hover:text-indigo-300 transition underline cursor-pointer">
              {isHindi ? 'रिफंड नीति' : 'Refund'}
            </button>
            <button type="button" onClick={() => setActiveLegalDoc('DISCLAIMER')} className="hover:text-amber-300 transition underline cursor-pointer">
              {isHindi ? 'डिस्क्लेमर' : 'Disclaimer'}
            </button>
          </div>
        </div>
      </footer>

      {/* BUY LICENSE / CHECKOUT MODAL */}
      {showCheckoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl relative my-auto">
            <button
              onClick={() => {
                setShowCheckoutModal(false);
                setInquirySuccess(false);
                setFormError('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 cursor-pointer"
              aria-label="Close checkout"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white">
                  {isHindi ? 'Hisabveda ERP लाइसेंस खरीदें' : 'Purchase Software License'}
                </h3>
                <span className="text-xs text-indigo-400 font-bold">
                  {plans[selectedPlan].name} ({formatCurrency(finalPrice, 'INR')})
                </span>
              </div>
            </div>

            {inquirySuccess ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-6 rounded-2xl text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500 text-emerald-400 mx-auto flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h4 className="text-lg font-extrabold text-emerald-300">
                  {isHindi ? 'धन्यवाद! आपका ऑर्डर अनुरोध तैयार है।' : 'Order Request Created Successfully!'}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isHindi
                    ? 'कृपया नीचे दिए WhatsApp बटन से अपना ऑर्डर विवरण (+ पेमेंट स्क्रीनशॉट यदि किया हो) भेजें ताकि आपका लाइसेंस तुरंत एक्टिवेट किया जा सके।'
                    : 'Click below to send your order confirmation via WhatsApp (+91 7489655303) for rapid license activation.'}
                </p>
                <div className="p-3 bg-slate-950 rounded-xl text-xs font-mono text-indigo-300 border border-slate-800">
                  {isHindi ? 'ऑर्डर रेफ़रेंस संख्या:' : 'Order Reference:'}{' '}
                  <span className="font-bold text-white">{orderRefCode || 'HV-ORD-NEW'}</span>
                </div>
                <a
                  href={`https://wa.me/917489655303?text=${encodeURIComponent(
                    `Namaste Shailendra ji, I ordered Hisabveda ERP (${plans[selectedPlan].name} - ₹${finalPrice}).\nOrder Ref: ${orderRefCode}\nName: ${buyerName}\nBusiness: ${businessName}${buyerGstin ? `\nBuyer GSTIN: ${buyerGstin}` : ''}\nPhone: ${buyerPhone}\nPayment Mode: ${paymentMethod}${upiRef ? `\nUTR/Ref: ${upiRef}` : ''}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>{isHindi ? 'WhatsApp पर पेमेंट/ऑर्डर भेजें (+91 7489655303)' : 'Send Order on WhatsApp (+91 7489655303)'}</span>
                </a>
                <button
                  onClick={() => {
                    setShowCheckoutModal(false);
                    setInquirySuccess(false);
                    onLaunchDemo();
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs rounded-xl transition cursor-pointer"
                >
                  {isHindi ? 'लाइव सॉफ़्टवेयर डेमो खोलें' : 'Open Live Software Demo'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleCheckoutSubmit} className="space-y-4 text-xs">
                <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-white">{plans[selectedPlan].name}</div>
                    <div className="text-[11px] text-slate-400">
                      {billingCycle === 'LIFETIME' ? 'Lifetime License' : 'Annual License'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-extrabold font-mono tabular-nums text-emerald-400">
                      {formatCurrency(finalPrice, 'INR')}
                    </div>
                    <div className="text-[10px] text-emerald-400/90 font-semibold">
                      {isHindi ? 'अंतिम मूल्य (कोई अतिरिक्त GST नहीं)' : 'Final Price (No Extra GST)'}
                    </div>
                  </div>
                </div>

                {formError && (
                  <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 font-semibold">
                    {formError}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-bold mb-1">{isHindi ? 'आपका नाम *' : 'Full Name *'}</label>
                    <input
                      type="text"
                      required
                      value={buyerName}
                      onChange={(e) => setBuyerName(e.target.value)}
                      placeholder="e.g. Rahul Sharma"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">{isHindi ? 'व्यापार / दुकान का नाम *' : 'Business / Shop Name *'}</label>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Sharma Enterprises"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">{isHindi ? 'मोबाइल नंबर (WhatsApp) *' : 'WhatsApp Mobile No *'}</label>
                    <input
                      type="tel"
                      required
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhone(e.target.value)}
                      placeholder="+91 9876543210"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-bold mb-1">{isHindi ? 'ईमेल आईडी' : 'Email Address'}</label>
                    <input
                      type="email"
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
                      placeholder="rahul@example.com"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    {isHindi ? 'आपका GSTIN (वैकल्पिक — केवल रिकॉर्ड हेतु)' : 'Your Business GSTIN (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={buyerGstin}
                    onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())}
                    placeholder="23AABCU9603R1ZM"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono uppercase"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1.5">{isHindi ? 'भुगतान विकल्प चुनें *' : 'Select Payment Mode *'}</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${
                        paymentMethod === 'UPI' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      UPI QR Code
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('BANK')}
                      className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${
                        paymentMethod === 'BANK' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Bank NEFT/IMPS
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CONTACT')}
                      className={`p-2.5 rounded-xl border text-center font-bold transition cursor-pointer ${
                        paymentMethod === 'CONTACT' ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      Call Me Back
                    </button>
                  </div>
                </div>

                {paymentMethod === 'UPI' && (
                  <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 flex flex-col sm:flex-row items-center gap-4">
                    <div className="bg-white p-2.5 rounded-xl shrink-0 shadow-md">
                      <QRCodeSVG value={upiPayUri} size={108} level="M" includeMargin={false} />
                    </div>
                    <div className="space-y-1.5 flex-1 w-full">
                      <div className="font-bold text-white text-xs">
                        {isHindi ? 'Google Pay / PhonePe / Paytm से स्कैन करें' : 'Scan & Pay via Google Pay / PhonePe / Paytm'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Payee: <span className="text-slate-200 font-semibold">Shailendra Banwar</span> · Amount:{' '}
                        <span className="text-amber-300 font-bold tabular-nums">{formatCurrency(finalPrice, 'INR')}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] text-emerald-400 font-mono font-bold">UPI: 7489655303@hdfcbank</span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard?.writeText('7489655303@hdfcbank');
                            setUpiCopied(true);
                            setTimeout(() => setUpiCopied(false), 2000);
                          }}
                          className="text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>{upiCopied ? 'Copied!' : 'Copy UPI'}</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={upiRef}
                        onChange={(e) => setUpiRef(e.target.value)}
                        placeholder={isHindi ? 'भुगतान के बाद UTR / Ref नंबर लिखें (वैकल्पिक)' : 'Enter UPI Ref / UTR No (Optional)'}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white font-mono text-[11px]"
                      />
                    </div>
                  </div>
                )}

                {paymentMethod === 'BANK' && (
                  <div className="p-3.5 bg-slate-950 rounded-2xl border border-slate-800 space-y-1.5 text-[11px] text-slate-300">
                    <div className="font-bold text-indigo-300">
                      {isHindi ? 'बैंक ट्रांसफर / IMPS / NEFT विवरण:' : 'Direct Bank Transfer / NEFT / IMPS:'}
                    </div>
                    <div>
                      Account Holder: <span className="text-white font-semibold">Shailendra Banwar</span>
                    </div>
                    <div>
                      {isHindi
                        ? 'बैंक खाता नंबर व IFSC के लिए ऑर्डर सबमिट करें या WhatsApp करें: '
                        : 'Submit inquiry or WhatsApp/Call for Account No & IFSC: '}
                      <span className="font-mono text-emerald-400 font-bold">+91 7489655303</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isHindi ? 'ऑर्डर एवं एक्टिवेशन अनुरोध भेजें' : 'Submit Order & Request License Key'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* CUSTOM YOUTUBE VIDEO EMBED MODAL */}
      {showEmbedVideoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setShowEmbedVideoModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">
                  {isHindi ? 'अपना YouTube डेमो लिंक जोड़ें' : 'Attach Official YouTube Demo'}
                </h3>
                <span className="text-xs text-slate-400">
                  {isHindi ? 'यूट्यूब वीडियो का लिंक पेस्ट करें' : 'Paste a YouTube watch or embed link'}
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">YouTube Video URL:</label>
                <input
                  type="url"
                  value={embedInputUrl}
                  onChange={(e) => setEmbedInputUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomVideoEmbedUrl(embedInputUrl.trim());
                    setShowEmbedVideoModal(false);
                  }}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl transition cursor-pointer"
                >
                  {isHindi ? 'वीडियो चलाएँ' : 'Save & Show Video'}
                </button>
                {(customVideoEmbedUrl || embedInputUrl) && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomVideoEmbedUrl('');
                      setEmbedInputUrl('');
                      setShowEmbedVideoModal(false);
                    }}
                    className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition cursor-pointer"
                  >
                    {isHindi ? 'हटाएँ' : 'Reset'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LEGAL & DISCLAIMER MODAL */}
      {activeLegalDoc && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl relative text-xs text-slate-300">
            <button
              onClick={() => setActiveLegalDoc(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 cursor-pointer"
              aria-label="Close legal notice"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-extrabold text-white">
              {activeLegalDoc === 'TERMS'
                ? 'Terms & Conditions (EULA)'
                : activeLegalDoc === 'PRIVACY'
                ? 'Privacy Policy & Data Security'
                : activeLegalDoc === 'REFUND'
                ? 'Refund & Cancellation Policy'
                : 'Software & Statutory Disclaimer'}
            </h3>

            <div className="space-y-2.5 leading-relaxed max-h-[60vh] overflow-y-auto pr-1">
              <p className="text-[11px] text-indigo-300 font-semibold">
                Proprietor: Shailendra Banwar · Bhopal, Madhya Pradesh · +91 7489655303 · support@hisabveda.com
              </p>

              {activeLegalDoc === 'TERMS' && (
                <>
                  <p>1. Hisabveda ERP Solution (hisabveda.com) is licensed by Shailendra Banwar (Proprietor, Bhopal, MP) for business billing, inventory, and accounting management.</p>
                  <p>2. Pricing listed is final and non-GST as an unregistered individual provider below GST registration threshold limits.</p>
                  <p>3. License keys are issued per subscribed plan (Starter, Business Pro, or CA & Enterprise Suite) and may not be resold or redistributed without written consent.</p>
                </>
              )}

              {activeLegalDoc === 'PRIVACY' && (
                <>
                  <p>1. In Personal Device Mode, accounting records stay in local browser storage on your device. In Cloud Sync Mode, books are isolated strictly per authenticated tenant ID (cmp_&lt;uid&gt;) in Firebase Firestore.</p>
                  <p>2. We never sell, rent, or expose customer invoices, ledgers, GSTINs, or bank records to third parties.</p>
                  <p>3. Optional AI document parsing transmits uploaded bill/statement content strictly for structured data extraction and does not retain financial documents on AI inference servers.</p>
                </>
              )}

              {activeLegalDoc === 'REFUND' && (
                <>
                  <p>1. Customers are encouraged to evaluate all modules using the free Live Demo before purchasing a commercial license.</p>
                  <p>2. Once a commercial license key is generated and activated, fees are generally non-refundable; however, duplicate payments or unresolved activation issues reported within 7 days at support@hisabveda.com or +91 7489655303 are resolved or refunded promptly after verification.</p>
                </>
              )}

              {activeLegalDoc === 'DISCLAIMER' && (
                <>
                  <p>1. Hisabveda ERP is an accounting productivity tool. GSTR-1/2B/3B summaries, TDS reports, and E-Way Bill JSONs are prepared solely from user-entered data—users and their CA must verify statutory filings before submission on GST/Income Tax portals.</p>
                  <p>2. AI bill scanning, bank statement parsing, and GSTIN lookups are assistive automation aids; users must verify extracted values prior to final voucher saving.</p>
                  <p>3. Users operating in Personal Device Local Mode are responsible for maintaining periodic offline JSON backups prior to OS resets or clearing browser storage.</p>
                </>
              )}
            </div>

            <button
              onClick={() => setActiveLegalDoc(null)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition cursor-pointer"
            >
              {isHindi ? 'बंद करें' : 'Close'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
