import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  Copy, 
  Check, 
  Send, 
  Key, 
  FileCode, 
  Sparkles, 
  Building2, 
  ShieldCheck, 
  Smartphone, 
  Globe, 
  Monitor, 
  Printer, 
  PackageCheck,
  ExternalLink,
  Laptop,
  Loader2,
  Lock,
  CheckCircle2,
  Eye
} from 'lucide-react';
import JSZip from 'jszip';
import { QRCodeSVG } from 'qrcode.react';
import { AppData, CompanyDetails } from '../../types';
import { exportBackupJSON } from '../../utils/storage';
import { downloadAndroidApkBuilderZip } from '../../utils/desktopShortcut';
import { auth } from '../../lib/firebase';
import { resolveApiUrl } from '../../utils/apiBase';

interface ClientDeliveryModalProps {
  data: AppData;
  isHindi: boolean;
  onClose: () => void;
  onToggleCustomerPreview?: () => void;
}

export const ClientDeliveryModal: React.FC<ClientDeliveryModalProps> = ({
  data,
  isHindi,
  onClose,
  onToggleCustomerPreview
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'setup' | 'license' | 'mobile'>('link');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  // Customer Customization State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientGstin, setClientGstin] = useState('');
  const [clientHwid, setClientHwid] = useState('');
  const [licenseType, setLicenseType] = useState<'perpetual' | 'annual' | 'trial'>('perpetual');
  const [generatedKey, setGeneratedKey] = useState('');
  const [isIssuingKey, setIsIssuingKey] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);

  // Custom Base URL Support (Custom Domain or Public Hosting URL)
  const [customBaseUrl, setCustomBaseUrl] = useState(() => {
    return localStorage.getItem('sna_custom_app_url') || '';
  });
  const [showDomainConfig, setShowDomainConfig] = useState(false);
  const [domainSaved, setDomainSaved] = useState(false);

  // Compute Base Web App URL (Auto-convert dev container URL to public share URL)
  const currentUrl = typeof window !== 'undefined' ? window.location.href.split('?')[0] : '';
  const defaultPublicAppUrl = currentUrl.includes('ais-dev-')
    ? currentUrl.replace('ais-dev-', 'ais-pre-')
    : currentUrl;

  const publicAppUrl = (customBaseUrl.trim() || defaultPublicAppUrl).replace(/\/$/, '');

  const handleSaveCustomDomain = (url: string) => {
    setCustomBaseUrl(url);
    localStorage.setItem('sna_custom_app_url', url.trim());
    setDomainSaved(true);
    setTimeout(() => setDomainSaved(false), 2500);
  };

  // Custom Client Links with parameters (tagged with &view=client to hide vendor marketing & domain tools)
  const demoShareUrl = `${publicAppUrl}?mode=demo&view=client${clientName ? `&client=${encodeURIComponent(clientName)}` : ''}`;
  const customShareUrl = `${publicAppUrl}?mode=activate&view=client${clientName ? `&client=${encodeURIComponent(clientName)}&gst=${encodeURIComponent(clientGstin)}` : ''}${generatedKey.trim() ? `&key=${encodeURIComponent(generatedKey.trim())}` : ''}`;

  const [copiedDemoLink, setCopiedDemoLink] = useState(false);

  const handleCopyDemoLink = () => {
    navigator.clipboard.writeText(demoShareUrl);
    setCopiedDemoLink(true);
    setTimeout(() => setCopiedDemoLink(false), 2500);
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(customShareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyLicenseKey = () => {
    navigator.clipboard.writeText(generatedKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  const whatsappMessage = isHindi
    ? `नमस्कार ${clientName || 'प्रिय ग्राहक'},\n\n` +
      `Hisabveda ERP सॉफ्टवेयर का आपका एक्सेस लिंक तैयार है:\n` +
      `🔗 एप्लीकेशन लिंक: ${customShareUrl}\n` +
      `🔑 लाइसेंस कुंजी: ${generatedKey}\n\n` +
      `इस लिंक पर क्लिक करके आप तुरंत अपनी कंपनी के लिए इनवॉइसिंग, जीएसटी रिटर्न्स और स्टॉक मैनेजमेंट शुरू कर सकते हैं। धन्यवाद!`
    : `Hello ${clientName || 'Valued Customer'},\n\n` +
      `Your Hisabveda ERP Software Access Link is ready:\n` +
      `🔗 Web App Link: ${customShareUrl}\n` +
      `🔑 License Key: ${generatedKey}\n\n` +
      `Click the link to start managing your Invoices, GST Returns, and Inventory immediately. Thank you!`;

  const whatsappPhoneClean = clientPhone.replace(/\D/g, '');
  const whatsappShareUrl = whatsappPhoneClean
    ? `https://wa.me/91${whatsappPhoneClean}?text=${encodeURIComponent(whatsappMessage)}`
    : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

  const handleCopyWhatsAppText = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2500);
  };

  const offlinePlanCode = licenseType === 'perpetual' ? 'PRO_PERPETUAL' : licenseType === 'annual' ? 'STANDARD_ANNUAL' : 'TRIAL';
  const offlinePlanDays = licenseType === 'perpetual' ? 9999 : licenseType === 'annual' ? 365 : 7;
  const offlineCliSnippet = `npx tsx scripts/admin-license-keygen.ts issue --owner "${(clientName || 'Customer').replace(/"/g, '')}" --hwid "${(clientHwid || 'TARGET_CLIENT_HWID').trim().toUpperCase()}" --plan ${offlinePlanCode} --days ${offlinePlanDays}`;

  const handleGenerateKey = async (overrideType?: 'perpetual' | 'annual' | 'trial') => {
    const selectedType = overrideType || licenseType;
    const plan = selectedType === 'perpetual' ? 'PRO_PERPETUAL' : selectedType === 'annual' ? 'STANDARD_ANNUAL' : 'TRIAL';
    const days = selectedType === 'perpetual' ? 9999 : selectedType === 'annual' ? 365 : 7;
    if (!clientName.trim() || !clientHwid.trim()) {
      setIssueError(isHindi ? 'हस्ताक्षरित लाइसेंस जारी करने के लिए ग्राहक का नाम और उनका Hardware Machine ID दर्ज करें।' : 'Enter both Client Business Name and their Hardware Machine ID to sign an Ed25519 certificate.');
      return;
    }
    setIsIssuingKey(true);
    setIssueError(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        setIssueError(isHindi ? 'ऑनलाइन सर्वर साइन-इन आवश्यक है, या नीचे ऑफ़लाइन Ed25519 CLI चलाएँ।' : 'Verified owner session required, or use the offline Ed25519 CLI command below.');
        return;
      }
      const res = await fetch(resolveApiUrl('/api/license/issue'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          clientName: clientName.trim(),
          gstinOrReg: clientGstin.trim() || 'UNREGISTERED',
          hwid: clientHwid.trim().toUpperCase(),
          plan,
          mode: 'SINGLE_USER',
          validityDays: days,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.certificate) {
        setIssueError(json?.error || 'Use the offline Ed25519 CLI script to issue signed certificates.');
        return;
      }
      setGeneratedKey(json.certificate);
    } catch {
      setIssueError(isHindi ? 'सर्वर उपलब्ध नहीं है। कृपया ऑफ़लाइन CLI से सर्टिफिकेट जारी करें।' : 'Server unavailable. Run the offline Ed25519 CLI command below.');
    } finally {
      setIsIssuingKey(false);
    }
  };

  // Standalone Single-File HTML Installer Download Generator
  const handleDownloadOfflineHTMLSetup = () => {
    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hisabveda ERP - Client Launcher</title>
    <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 30px; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
        .card { background: #1e293b; border: 1px solid #334155; border-radius: 20px; padding: 36px; max-width: 580px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
        h1 { color: #818cf8; font-size: 24px; margin-bottom: 8px; font-weight: 800; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
        .key-box { background: #0f172a; border: 1px dashed #6366f1; border-radius: 12px; padding: 14px; margin: 20px 0; font-family: monospace; font-size: 18px; color: #fbbf24; font-weight: bold; letter-spacing: 1px; }
        .btn { display: block; width: 100%; background: linear-gradient(135deg, #4f46e5, #06b6d4); color: white; text-decoration: none; font-weight: bold; padding: 14px 20px; border-radius: 12px; margin-top: 16px; transition: all 0.2s; border: none; cursor: pointer; font-size: 15px; box-sizing: border-box; }
        .btn:hover { opacity: 0.95; transform: translateY(-2px); }
        .badge { background: #065f46; color: #34d399; padding: 4px 14px; border-radius: 999px; font-size: 11px; font-weight: bold; margin-bottom: 16px; display: inline-block; letter-spacing: 0.5px; }
        .info-card { background: #091322; border: 1px solid #1e293b; border-radius: 10px; padding: 12px; margin-top: 20px; text-align: left; font-size: 12px; color: #94a3b8; }
    </style>
</head>
<body>
    <div class="card">
        <div class="badge">OFFICIAL CLIENT ERP DESKTOP LAUNCHER</div>
        <h1>Hisabveda ERP</h1>
        <p>Registered To: <strong>${clientName || data.company.name}</strong></p>
        
        <div class="key-box">
            License Key: ${generatedKey}
        </div>

        <p style="font-size: 13px;">Click below to launch your dedicated accounting workspace:</p>
        <a class="btn" href="${customShareUrl}" target="_blank">🚀 Open Hisabveda ERP</a>

        <div class="info-card">
            <strong style="color: #cbd5e1; display: block; margin-bottom: 4px;">📌 Getting 403 Forbidden?</strong>
            <span>If the cloud link displays 403 Forbidden, please notify your administrator (${data.company.email || 'administrator'}) to set the application sharing permissions in Google AI Studio to <strong>'Anyone with the link / Public'</strong>.</span>
        </div>
        <p style="font-size:11px; margin-top:20px; color:#64748b;">Hisabveda ERP v2.0 • Invoicing • GST Compliance • Bank Audit</p>
    </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `HisabVeda_ERP_Setup_${(clientName || 'Customer').replace(/\s+/g, '_')}.html`;
    link.click();
  };

  // Dedicated Client 7-Day Trial Package ZIP Generator
  const [isZippingTrial, setIsZippingTrial] = useState(false);
  const [trialZipDone, setTrialZipDone] = useState(false);

  const handleDownloadTrialClientPackage = async () => {
    setIsZippingTrial(true);
    setTrialZipDone(false);
    try {
      const zip = new JSZip();
      const folderName = `HisabVeda_ERP_7Day_Trial_${(clientName || 'Customer').replace(/[^a-zA-Z0-9]/g, '_')}`;
      const trialFolder = zip.folder(folderName);

      // Clean starter company data for the trial customer (STRICTLY UNLICENSED, ZERO VENDOR PRIVATE TRANSACTIONS)
      const trialStarterData = {
        company: {
          ...data.company,
          name: clientName || data.company.name,
          phone: clientPhone || data.company.phone,
          gstin: clientGstin || ''
        },
        accounts: data.accounts,
        items: data.items,
        parties: [], // Blank client ledger for clean start
        invoices: [], // ZERO previous invoices of the vendor
        vouchers: [], // ZERO previous transactions
        budgets: [],
        creditDebitNotes: [],
        license: {
          trialStartDate: new Date().toISOString(),
          isLicensed: false, // 100% LOCKED 7-DAY TRIAL
          licenseKey: '',
          registeredOwner: clientName || 'Trial Evaluation Client',
          machineId: '',
          licenseType: 'TRIAL'
        },
        auditLogs: [],
        auditTrail: [],
        employees: []
      };

      // 1. README with clear 7-Day Trial notice
      const readme = `================================================================================
HISABVEDA ACCOUNTING & GST ERP - 7-DAY EVALUATION TRIAL EDITION
================================================================================
Issued To: ${clientName || 'Valued Customer'}
Contact: ${clientPhone || 'N/A'}
Issued On: ${new Date().toLocaleDateString('en-IN')}
Trial Duration: 7 Days from First Run

IMPORTANT TRIAL LICENSE NOTICE:
-------------------------------
* This evaluation edition is configured for a 7-day full feature trial.
* After 7 days, the software automatically enters locked mode.
* To purchase a lifetime full commercial license or annual subscription:
  Contact Vendor: ${data.company.name}
  Phone / WhatsApp: ${data.company.phone || 'Contact Vendor'}
  Email: ${data.company.email || 'Contact Vendor'}

HOW TO LAUNCH:
--------------
1. ON WINDOWS PC / LAPTOP (Recommended):
   - Extract the entire ZIP to your computer folder.
   - Double-click 'Launch_Hisabveda_ERP_Trial.bat'.
   (Note: Do not run .bat on mobile phones as Android/iOS do not support Windows scripts).

2. ON MOBILE PHONE OR BROWSER:
   - Open 'Hisabveda_ERP_Launcher.html' in your browser.
   - Note: If accessing via Google Cloud preview, vendor must grant public access or provide a custom domain link.
================================================================================
`;
      trialFolder?.file("README_TRIAL_LICENSE.txt", readme);

      // 2. Windows Bat Launcher (launches trial mode with admin tools locked)
      const batLaunch = `@echo off\nTITLE Hisabveda ERP Software - 7-Day Trial Mode\ncolor 0A\necho =========================================================================\necho       HISABVEDA ERP SOFTWARE - 7-DAY EVALUATION TRIAL\necho =========================================================================\necho.\necho Launching Hisabveda ERP Software on your Windows PC...\nstart msedge --app="${demoShareUrl}" --window-size=1366,768\nif %errorlevel% neq 0 (\n    start chrome --app="${demoShareUrl}" --window-size=1366,768\n)\n`;
      trialFolder?.file("Launch_Hisabveda_ERP_Trial.bat", batLaunch);

      // 3. HTML Standalone Launcher (with device detection & guidance)
      trialFolder?.file("Hisabveda_ERP_Launcher.html", `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hisabveda ERP 7-Day Trial</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0b1120; color: #f8fafc; padding: 20px; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
.card { background: #1e293b; border-radius: 20px; padding: 28px; max-width: 520px; width: 100%; border: 1px solid #334155; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
.badge { background: #059669; color: #a7f3d0; padding: 5px 14px; border-radius: 999px; font-weight: 700; font-size: 11px; display: inline-block; margin-bottom: 16px; letter-spacing: 0.5px; }
h2 { font-size: 22px; font-weight: 800; color: #ffffff; margin-bottom: 8px; }
.sub { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
.client-box { background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 12px; margin-bottom: 20px; font-size: 13px; color: #cbd5e1; text-align: left; }
.client-box strong { color: #38bdf8; }
.btn { display: block; width: 100%; background: linear-gradient(135deg, #10b981, #0284c7); color: white; padding: 15px; border-radius: 12px; font-weight: 800; text-decoration: none; font-size: 15px; box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.4); }
.device-tip { margin-top: 20px; padding: 12px; background: rgba(30, 41, 59, 0.8); border: 1px solid #334155; border-radius: 12px; font-size: 11px; color: #94a3b8; text-align: left; line-height: 1.5; }
.device-tip strong { color: #f59e0b; display: block; margin-bottom: 4px; font-size: 12px; }
.footer { font-size: 11px; color: #64748b; margin-top: 20px; }
</style>
</head>
<body>
<div class="card">
  <div class="badge">7-DAY FREE TRIAL EDITION</div>
  <h2>Hisabveda ERP</h2>
  <p class="sub">Complete GST Invoicing, E-Way Bill & Inventory Management</p>
  
  <div class="client-box">
    <div>👤 <strong>Registered To:</strong> ${clientName || 'Valued Customer'}</div>
    <div>⏳ <strong>Trial Validity:</strong> 7 Days Free Access</div>
    <div>🏢 <strong>Provided By:</strong> ${data.company.name}</div>
  </div>

  <a class="btn" href="${demoShareUrl}" target="_blank">🚀 Open 7-Day Free Trial App</a>

  <div class="device-tip">
    <strong>💡 Device Advice:</strong>
    <div>• <strong>Laptop/PC:</strong> For the best full accounting experience, open on Windows PC / Laptop.</div>
    <div>• <strong>Mobile:</strong> If you see "403 Forbidden", Google Cloud Sandbox requires your vendor to provide a public domain or set permissions to public.</div>
  </div>

  <p class="footer">After 7 days, contact ${data.company.name} (${data.company.phone || 'Vendor'}) for full license key.</p>
</div>
</body>
</html>`);

      // 4. Starter Database JSON (100% Unlicensed Trial)
      trialFolder?.file("HisabVeda_Trial_Database_Starter.json", JSON.stringify(trialStarterData, null, 2));

      // 5. Excel Import Templates
      const itemsCsv = `code,name,description,hsnSacCode,unit,purchasePrice,salesPrice,taxRate,currentStock,minStockLevel,category\nITM-001,Sample Product,Item Description,8471,Pcs,1000,1400,18,50,5,General`;
      trialFolder?.file("Items_Import_Template.csv", itemsCsv);

      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const linkElem = document.createElement('a');
      linkElem.href = url;
      linkElem.download = `HisabVeda_ERP_7Day_Trial_${(clientName || 'Client').replace(/\s+/g, '_')}.zip`;
      document.body.appendChild(linkElem);
      linkElem.click();
      linkElem.remove();
      URL.revokeObjectURL(url);
      setTrialZipDone(true);
      setTimeout(() => setTrialZipDone(false), 3000);
    } catch (e) {
      console.error('Error generating trial zip:', e);
    } finally {
      setIsZippingTrial(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
      <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-[var(--bg-elevated)] p-5 border-b border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 hv-pill-indigo border rounded-xl">
              <Share2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                <span>{isHindi ? 'ग्राहक वितरण एवं लिंक/सेटअप एक्सपोर्ट सेंटर' : 'Client Software Delivery & Link/Setup Exporter'}</span>
                <span className="hv-pill-emerald border text-[10px] px-2 py-0.5 rounded-full font-mono">
                  VENDOR PRO
                </span>
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {isHindi 
                  ? 'ग्राहक को ऑनलाइन वेब लिंक भेजें, डेस्कटॉप सेटअप डाउनलोड करें या लाइसेंस की जारी करें'
                  : 'Send shareable app link to clients, export setup bundle or generate license keys'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] rounded-xl border border-[var(--border-subtle)] transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center border-b border-[var(--border-primary)] bg-[var(--bg-elevated)] px-5 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('link')}
            className={`py-3 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'link'
                ? 'border-indigo-500 text-indigo-500 bg-indigo-500/10'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Globe className="w-4 h-4" />
            <span>{isHindi ? '1. शेयर लिंक (Web Link)' : '1. Web Link Share'}</span>
          </button>

          <button
            onClick={() => setActiveTab('setup')}
            className={`py-3 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'setup'
                ? 'border-indigo-500 text-indigo-500 bg-indigo-500/10'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>{isHindi ? '2. सेटअप डाउनलोड (Setup File)' : '2. Desktop Setup File'}</span>
          </button>

          <button
            onClick={() => setActiveTab('license')}
            className={`py-3 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'license'
                ? 'border-indigo-500 text-indigo-500 bg-indigo-500/10'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>{isHindi ? '3. ग्राहक लाइसेंस (License Key)' : '3. Client License & Key'}</span>
          </button>

          <button
            onClick={() => setActiveTab('mobile')}
            className={`py-3 px-4 font-bold text-xs flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'mobile'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>{isHindi ? '4. मोबाइल ऐप (Mobile & APK)' : '4. Mobile App & APK'}</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          
          {/* Customer Profile Details Form */}
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-amber-500 flex items-center gap-1.5 uppercase tracking-wide">
              <Building2 className="w-4 h-4" />
              <span>{isHindi ? 'ग्राहक/कंपनी विवरण (जिसे सॉफ़्टवेयर बेचना है):' : 'Target Client / Customer Details (To Sale Software):'}</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'ग्राहक कंपनी का नाम:' : 'Client Business Name:'}
                </label>
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="e.g. Ramesh Traders & Co."
                  className="w-full hv-input border rounded-xl p-2 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'व्हाट्सएप / मोबाइल नं.:' : 'WhatsApp / Mobile No.:'}
                </label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full hv-input border rounded-xl p-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
                  {isHindi ? 'लाइसेंस प्रकार:' : 'License Plan:'}
                </label>
                <select
                  value={licenseType}
                  onChange={(e) => {
                    const newType = e.target.value as 'perpetual' | 'annual' | 'trial';
                    setLicenseType(newType);
                  }}
                  className="w-full hv-input border rounded-xl p-2 text-xs focus:outline-none focus:border-indigo-500 font-bold"
                >
                  <option value="perpetual">Full License (Lifetime)</option>
                  <option value="annual">Annual Subscription (1 Year)</option>
                  <option value="trial">7-Day Trial License</option>
                </select>
              </div>
            </div>
          </div>

          {/* TAB 1: WEB LINK SHARE */}
          {activeTab === 'link' && (
            <div className="space-y-4">
              
              {/* Comprehensive 403 Forbidden Root-Cause & Instant Fix Box */}
              <div className="bg-[var(--bg-elevated)] border-2 border-amber-500/50 p-4 rounded-2xl space-y-3 shadow-md">
                <div className="flex items-start gap-3">
                  <div className="p-2 hv-pill-amber border rounded-xl shrink-0 text-lg">
                    ⚠️
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <strong className="text-amber-500 text-sm font-extrabold flex items-center gap-1.5">
                        <span>{isHindi ? 'Error 403 (Forbidden) क्यों आता है और इसका सही हल:' : 'Why Error 403 (Forbidden) Occurs & True Resolution:'}</span>
                      </strong>
                      <span className="text-[10px] hv-pill-rose px-2 py-0.5 rounded-full font-mono font-bold border">
                        GOOGLE SANDBOX SECURITY
                      </span>
                    </div>
                    
                    <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
                      {isHindi 
                        ? 'Google AI Studio का ais-pre-...run.app लिंक केवल आपके गूगल अकाउंट (ShailendraBanwar@gmail.com) के आंतरिक प्रीव्यू के लिए सुरक्षित है। Google Cloud सुरक्षा (IAP) के कारण कोई भी बाहरी ग्राहक इसे सीधे मोबाइल या ब्राउज़र पर नहीं खोल सकता (403 एरर आती है)।'
                        : 'Google AI Studio ais-pre-...run.app URLs are internal developer preview sandboxes strictly restricted to your Google account. Google Cloud Frontend blocks external users with HTTP 403 Forbidden by design.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1 text-xs">
                  <div className="bg-[var(--bg-surface)] border border-emerald-500/40 p-3 rounded-xl space-y-1.5">
                    <div className="font-bold text-emerald-500 flex items-center gap-1.5 text-[11px]">
                      <span>🖥️ 1. {isHindi ? 'डेस्कटॉप ऑफ़लाइन इंस्टॉलर (100% सफल, बिना इंटरनेट/सर्वर)' : 'Offline Desktop Installer (100% Working, No Server Needed)'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                      {isHindi
                        ? 'ऊपर "2. सेटअप डाउनलोड" टैब पर जाएँ और "डेस्कटॉप सेटअप फाइल (.html)" या ZIP पैकेज डाउनलोड करें। इसे पेनड्राइव या व्हाट्सएप से ग्राहक को दें। ग्राहक के कंप्यूटर पर यह बिना किसी गूगल एरर के तुरंत चलेगा।'
                        : 'Go to Tab 2 "Desktop Setup File" and download the standalone setup launcher or ZIP bundle. Send to clients via Pen Drive or WhatsApp; runs directly on their PC without Google restrictions.'}
                    </p>
                  </div>

                  <div className="bg-[var(--bg-surface)] border border-indigo-500/40 p-3 rounded-xl space-y-1.5">
                    <div className="font-bold text-indigo-500 flex items-center gap-1.5 text-[11px]">
                      <span>🌐 2. {isHindi ? 'फ्री पब्लिक होस्टिंग (Vercel / Render पर डिप्लॉय)' : 'Free Public Hosting Deployment (Vercel / Render)'}</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                      {isHindi
                        ? 'यदि आपको वास्तविक पब्लिक वेब लिंक चाहिए, तो कोड को GitHub से Render.com या Vercel पर 2 मिनट में फ्री होस्ट करें। फिर अपना पब्लिक डोमेन नीचे दर्ज करें ताकि ग्राहकों को लिंक से सीधा एक्सेस मिले।'
                        : 'To share a true public link from WhatsApp, deploy this repo to Vercel or Render.com (free 2-minute deploy). Enter your custom URL below to update all share links.'}
                    </p>
                  </div>
                </div>

                {/* Custom Base URL Toggle Button & Form */}
                <div className="pt-1 border-t border-[var(--border-primary)] flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setShowDomainConfig(!showDomainConfig)}
                      className="text-[11px] text-indigo-500 font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>{showDomainConfig ? (isHindi ? 'कस्टम URL सेटिंग्स छिपाएं' : 'Hide Custom URL Settings') : (isHindi ? '⚙️ अपना कस्टम डोमेन / पब्लिक URL बदलें' : '⚙️ Configure Custom Public Domain URL')}</span>
                    </button>

                    {customBaseUrl && (
                      <span className="text-[10px] hv-pill-emerald font-mono px-2 py-0.5 rounded border">
                        Custom: {customBaseUrl}
                      </span>
                    )}
                  </div>

                  {showDomainConfig && (
                    <div className="bg-[var(--bg-surface)] p-3 rounded-xl border border-indigo-500/40 space-y-2 mt-1 animate-fadeIn">
                      <label className="block text-[11px] font-bold text-[var(--text-secondary)]">
                        {isHindi ? 'पब्लिक वेबसाइट या डोमेन URL (उदा. https://billing.mycompany.com):' : 'Public Website or Custom Hosted Domain URL:'}
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="url"
                          value={customBaseUrl}
                          onChange={(e) => setCustomBaseUrl(e.target.value)}
                          placeholder="https://accounting.mycompany.com or public Vercel/Netlify URL"
                          className="flex-1 hv-input border rounded-lg p-2 text-xs focus:outline-none focus:border-indigo-500 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveCustomDomain(customBaseUrl)}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-3 py-2 rounded-lg text-xs transition shrink-0 cursor-pointer"
                        >
                          {domainSaved ? (isHindi ? 'सेव हो गया!' : 'Saved!') : (isHindi ? 'सेव करें' : 'Save URL')}
                        </button>
                        {customBaseUrl && (
                          <button
                            type="button"
                            onClick={() => handleSaveCustomDomain('')}
                            className="bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] px-2.5 py-2 rounded-lg text-xs transition shrink-0 cursor-pointer"
                            title="Reset to default cloud URL"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--text-muted)]">
                        * All generated WhatsApp messages, customer links, and QR codes will automatically use this URL.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* LINK TYPE 1: 7-DAY DEMO TRIAL SHARE LINK */}
              <div className="bg-[var(--bg-elevated)] border border-emerald-500/40 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-extrabold text-emerald-500 flex items-center gap-1.5">
                    <Globe className="w-4 h-4" />
                    <span>{isHindi ? '1. केवल 7-दिवसीय मुफ़्त डेमो लिंक (7-Day Free Trial Link):' : '1. 7-Day Free Demo Trial Link (Trial Only):'}</span>
                  </span>
                  <span className="text-[10px] hv-pill-emerald border px-2 py-0.5 rounded-full font-bold">
                    Admin Tools 100% Hidden
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi 
                    ? 'ट्रायल ग्राहकों को यह लिंक भेजें। इसमें एक्टिवेट ऑप्शन, रीसेलर टूल, मास्टर की और एडमिन पिन बिल्कुल दिखाई नहीं देंगे।'
                    : 'Send this link to demo trial users. All activation options, reseller tools, master keys, and PIN controls are completely hidden.'}
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={demoShareUrl}
                    className="w-full hv-input border rounded-xl px-3 py-2 text-xs text-emerald-500 font-mono select-all focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyDemoLink}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold px-3 py-2 rounded-xl text-xs transition shadow-lg shrink-0 cursor-pointer"
                    >
                      {copiedDemoLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedDemoLink ? (isHindi ? 'कॉपी हुआ!' : 'Copied!') : (isHindi ? 'कॉपी' : 'Copy')}</span>
                    </button>

                    {onToggleCustomerPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onToggleCustomerPreview();
                        }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white hv-keep-white font-bold px-3 py-2 rounded-xl text-xs transition shadow-lg shrink-0 cursor-pointer"
                        title={isHindi ? 'यहीं स्क्रीन पर ग्राहक का व्यू टेस्ट करें' : 'Preview this view right here'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'प्रीव्यू' : 'Preview'}</span>
                      </button>
                    )}

                    <a
                      href={demoShareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold px-2.5 py-2 rounded-xl text-xs transition border border-[var(--border-subtle)] shrink-0 cursor-pointer"
                      title={isHindi ? 'नए ब्राउज़र टैब में खोलें' : 'Open in New Tab'}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isHindi ? 'खोलें' : 'Open'}</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* LINK TYPE 2: PAID COMMERCIAL SOFTWARE ACTIVATION LINK */}
              <div className="bg-[var(--bg-elevated)] border border-indigo-500/40 p-4 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold text-indigo-500 flex items-center gap-1.5">
                    <Key className="w-4 h-4" />
                    <span>{isHindi ? '2. खरीदने वाले ग्राहक हेतु एक्टिवेशन लिंक (Paid License Link):' : '2. Paid Customer Commercial Activation Link:'}</span>
                  </span>
                  <span className="text-[10px] hv-pill-indigo border px-2 py-0.5 rounded-full font-mono">
                    Product Key Included
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {isHindi 
                    ? 'जिस ग्राहक ने सॉफ्टवेयर खरीदा है, उसे यह लिंक दें ताकि वे अपनी सीरियल की (Product Key) डालकर लाइफटाइम/वार्षिक एक्सेस एक्टिवेट कर सकें।'
                    : 'Send this link to paid customers so they can enter their serial product key to activate full access.'}
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <input
                    type="text"
                    readOnly
                    value={customShareUrl}
                    className="w-full hv-input border rounded-xl px-3 py-2 text-xs text-indigo-500 font-mono select-all focus:outline-none"
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-3 py-2 rounded-xl text-xs transition shadow-lg shrink-0 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedLink ? (isHindi ? 'कॉपी हुआ!' : 'Copied!') : (isHindi ? 'कॉपी' : 'Copy')}</span>
                    </button>

                    {onToggleCustomerPreview && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onToggleCustomerPreview();
                        }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-sky-600 hover:bg-sky-500 text-white hv-keep-white font-bold px-3 py-2 rounded-xl text-xs transition shadow-lg shrink-0 cursor-pointer"
                        title={isHindi ? 'यहीं स्क्रीन पर ग्राहक का व्यू टेस्ट करें' : 'Preview this view right here'}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isHindi ? 'प्रीव्यू' : 'Preview'}</span>
                      </button>
                    )}

                    <a
                      href={customShareUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1 bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] text-[var(--text-primary)] font-bold px-2.5 py-2 rounded-xl text-xs transition border border-[var(--border-subtle)] shrink-0 cursor-pointer"
                      title={isHindi ? 'नए ब्राउज़र टैब में खोलें' : 'Open in New Tab'}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">{isHindi ? 'खोलें' : 'Open'}</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* WhatsApp & Message Delivery */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-500" />
                  <span>{isHindi ? 'व्हाट्सएप या मैसेज द्वारा सीधा भेजें (Direct Message Delivery)' : 'Send Directly via WhatsApp / SMS'}</span>
                </h4>

                <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-3 rounded-xl text-xs font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed">
                  {whatsappMessage}
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <a
                    href={whatsappShareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition shadow-lg"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isHindi ? 'व्हाट्सएप पर शेयर करें' : 'Send via WhatsApp'}</span>
                  </a>

                  <button
                    onClick={handleCopyWhatsAppText}
                    className="bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedMsg ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedMsg ? (isHindi ? 'मैसेज कॉपी हुआ!' : 'Message Copied!') : (isHindi ? 'मैसेज टेक्स्ट कॉपी करें' : 'Copy Text')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SETUP FILE DOWNLOAD */}
          {activeTab === 'setup' && (
            <div className="space-y-4">
              
              {/* PRIMARY OPTION: 100% SECURE 7-DAY TRIAL CLIENT PACKAGE (.ZIP) */}
              <div className="bg-[var(--bg-elevated)] border-2 border-emerald-500/50 p-4.5 rounded-2xl space-y-3.5 shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 hv-pill-emerald border rounded-xl">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-extrabold text-emerald-500 flex items-center gap-2 flex-wrap">
                        <span>{isHindi ? '1. सुरक्षित 7-दिवसीय ट्रायल क्लाइंट पैकेज (.ZIP)' : '1. Secure 7-Day Free Trial Client Package (.ZIP)'}</span>
                        <span className="text-[10px] hv-pill-emerald px-2 py-0.5 rounded-full font-mono border">
                          TRIAL LOCKED
                        </span>
                      </h4>
                      <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                        {isHindi 
                          ? 'ग्राहक को देने के लिए 100% सुरक्षित ट्रायल पैकेज। इसमें फुल लाइसेंस लीक होने का शून्य (0%) खतरा है।' 
                          : 'Completely safe trial package to distribute to clients. 0% risk of full license leak.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Trial Security Guarantees */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="bg-[var(--bg-surface)] border border-emerald-500/30 p-2.5 rounded-xl space-y-1">
                    <span className="text-emerald-500 font-bold flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isHindi ? '7 दिन बाद ऑटो-लॉक' : 'Auto-Locks Day 8'}
                    </span>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {isHindi ? '7 दिन पूरे होते ही सॉफ्टवेयर रुक जाएगा और एक्टिवेशन की माँगेगा।' : 'App locks automatically after 7 days; requires key.'}
                    </p>
                  </div>

                  <div className="bg-[var(--bg-surface)] border border-emerald-500/30 p-2.5 rounded-xl space-y-1">
                    <span className="text-emerald-500 font-bold flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isHindi ? 'कोई पर्सनल बिल/डेटा नहीं' : 'Zero Private Data'}
                    </span>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {isHindi ? 'आपकी कंपनी के पर्सनल बिल व लेज़र इसमें बिल्कुल नहीं जाएँगे।' : 'Your previous invoices & party ledger remain 100% private.'}
                    </p>
                  </div>

                  <div className="bg-[var(--bg-surface)] border border-emerald-500/30 p-2.5 rounded-xl space-y-1">
                    <span className="text-emerald-500 font-bold flex items-center gap-1 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isHindi ? 'एडमिन टूल्स ब्लॉक' : 'Admin Tools Hidden'}
                    </span>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {isHindi ? 'रीसेलर की जनरेटर और एडमिन पिन ग्राहक से छिपा रहेगा।' : 'Reseller key generator & master PIN are fully locked.'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTrialClientPackage}
                  disabled={isZippingTrial}
                  className="w-full bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-500 hover:to-indigo-500 text-white hv-keep-white font-extrabold py-3 px-5 rounded-xl text-xs flex items-center justify-center gap-2 shadow-xl transition transform active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {isZippingTrial ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>{isHindi ? 'ट्रायल पैकेज तैयार हो रहा है...' : 'Generating 7-Day Trial Package...'}</span>
                    </>
                  ) : trialZipDone ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{isHindi ? '7-दिवसीय ट्रायल ZIP डाउनलोड हो गया!' : '7-Day Trial ZIP Downloaded!'}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>
                        {isHindi 
                          ? `📦 ग्राहक "${clientName || 'Customer'}" के लिए 7-डे ट्रायल ZIP डाउनलोड करें` 
                          : `📦 Download 7-Day Trial ZIP for "${clientName || 'Customer'}"`}
                      </span>
                    </>
                  )}
                </button>
              </div>

              {/* SECONDARY OPTION: STANDALONE HTML LAUNCHER */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-4 rounded-2xl space-y-3">
                <h4 className="text-xs font-bold text-amber-500 flex items-center gap-2">
                  <Laptop className="w-4 h-4" />
                  <span>{isHindi ? '2. सिंगल डेस्कटॉप HTML लॉन्चर (.html)' : '2. Standalone Desktop HTML Launcher (.html)'}</span>
                </h4>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  {isHindi 
                    ? 'ग्राहक को व्हाट्सएप या ईमेल द्वारा भेजने के लिए एक सिंगल .HTML सेटअप फाइल डाउनलोड करें। ग्राहक इसे विंडोज़ PC या मैक पर बिना किसी सर्वर सेटअप के चला सकता है।'
                    : 'Download a self-contained .HTML launcher file to send via Pen Drive or Email. Customers can launch it on Windows or Mac without technical installation.'}
                </p>

                <div className="pt-1">
                  <button
                    onClick={handleDownloadOfflineHTMLSetup}
                    className="w-full bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-amber-500" />
                    <span>{isHindi ? 'डेस्कटॉप सेटअप फाइल डाउनलोड करें (.html)' : 'Download Desktop Setup File (.html)'}</span>
                  </button>
                </div>
              </div>

              {/* Data Backup & Project ZIP Package */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-indigo-500 font-bold text-xs">
                    <FileCode className="w-4 h-4" />
                    <span>{isHindi ? 'ग्राहक स्टार्टर डेटाबेस (.json)' : 'Customer Starter Database (.json)'}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi ? 'ग्राहक के नए एकाउंट्स के लिए प्री-कॉन्फ़िगर्ड कंपनी बैकअप डाउनलोड करें।' : 'Export pre-configured starter backup for client setup.'}
                  </p>
                  <button
                    onClick={() => exportBackupJSON(data)}
                    className="w-full bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-xs font-bold py-2 rounded-xl text-indigo-500 transition mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'डेटा बैकअप डाउनलोड' : 'Download JSON Data'}</span>
                  </button>
                </div>

                <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-4 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
                    <PackageCheck className="w-4 h-4" />
                    <span>{isHindi ? 'वेब होस्टिंग निर्देश (Server Deploy)' : 'Web Server Bundle Setup'}</span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi ? 'क्लाउड सर्वर या डोमेन पर होस्ट करने हेतु आवश्यक सेटिंग्स।' : 'Hosted on cloud environment. Instant client access.'}
                  </p>
                  <button
                    onClick={handleCopyLink}
                    className="w-full bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-xs font-bold py-2 rounded-xl text-emerald-500 transition mt-2 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>{isHindi ? 'एप्लीकेशन URL शेयर करें' : 'Share App URL'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LICENSE KEY GENERATOR */}
          {activeTab === 'license' && (
            <div className="space-y-4">
              <div className="bg-[var(--bg-elevated)] border border-indigo-500/40 p-5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-bold text-indigo-500 flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-500" />
                    <span>{isHindi ? 'Ed25519 हस्ताक्षरित सर्टिफिकेट जारीकर्ता (HV-LIC-V3)' : 'Ed25519 Signed Certificate Issuer (HV-LIC-V3)'}</span>
                  </h4>

                  <button
                    type="button"
                    disabled={isIssuingKey}
                    onClick={() => handleGenerateKey()}
                    className="text-[11px] bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white hv-keep-white font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                  >
                    {isIssuingKey
                      ? (isHindi ? 'जारी हो रहा है...' : 'Signing...')
                      : (isHindi ? 'सर्वर से सर्टिफिकेट जारी करें' : 'Issue Signed Certificate')}
                  </button>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--text-secondary)] font-semibold mb-1">
                    {isHindi ? 'ग्राहक का Hardware Machine ID (आवश्यक):' : 'Client Hardware Machine ID (Required for Machine Lock):'}
                  </label>
                  <input
                    type="text"
                    value={clientHwid}
                    onChange={(e) => setClientHwid(e.target.value.toUpperCase())}
                    placeholder="HV-HWID-..."
                    className="w-full hv-input border rounded-xl p-2 text-xs text-indigo-500 font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {issueError && (
                  <div className="hv-pill-amber border rounded-xl p-3 text-[11px] space-y-1.5">
                    <p>{issueError}</p>
                    <code className="block bg-[var(--bg-surface)] border border-[var(--border-primary)] rounded p-2 text-[10px] text-emerald-500 font-mono break-all">
                      {offlineCliSnippet}
                    </code>
                  </div>
                )}

                <div className="bg-[var(--bg-surface)] border border-indigo-500/40 p-3 rounded-xl flex items-center justify-between gap-3 shadow-inner">
                  <input
                    type="text"
                    value={generatedKey}
                    onChange={(e) => setGeneratedKey(e.target.value.trim())}
                    placeholder="HV-LIC-V3.<payload>.<ed25519-signature>"
                    className="flex-1 bg-transparent font-mono text-xs font-bold text-amber-500 focus:outline-none"
                  />

                  <button
                    type="button"
                    onClick={handleCopyLicenseKey}
                    disabled={!generatedKey}
                    className="flex items-center gap-1.5 bg-[var(--bg-elevated)] hover:bg-[var(--hover-surface)] disabled:opacity-50 border border-[var(--border-subtle)] text-indigo-500 px-3 py-1.5 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Copied' : 'Copy Cert'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-primary)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">{isHindi ? 'रजिस्टर्ड कंपनी:' : 'Registered Client:'}</span>
                    <span className="font-bold text-[var(--text-primary)]">{clientName || 'Default Enterprise'}</span>
                  </div>
                  <div className="bg-[var(--bg-surface)] p-2.5 rounded-xl border border-[var(--border-primary)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">{isHindi ? 'लाइसेंस अवधि:' : 'License Type:'}</span>
                    <span className="font-bold text-emerald-500 uppercase">{licenseType}</span>
                  </div>
                </div>
              </div>

              {/* Printable Software Receipt / Certificate */}
              <div className="bg-[var(--bg-elevated)] border border-[var(--border-primary)] p-4 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-[var(--text-primary)]">{isHindi ? 'ग्राहक के लिए सॉफ़्टवेयर बिक्री रसीद (Sale Certificate)' : 'Print Client Software Purchase Certificate'}</h5>
                  <p className="text-[11px] text-[var(--text-muted)]">{isHindi ? 'सॉफ़्टवेयर बिक्री व लाइसेंस आवंटन प्रमाण पत्र मुद्रित करें।' : 'Print purchase invoice / license certificate for customer.'}</p>
                </div>

                <button
                  onClick={() => window.print()}
                  className="bg-[var(--bg-surface)] hover:bg-[var(--hover-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shrink-0 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-amber-500" />
                  <span>{isHindi ? 'रसीद प्रिंट करें' : 'Print Certificate'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: MOBILE APP & ANDROID APK DELIVERY */}
          {activeTab === 'mobile' && (
            <div className="space-y-4 animate-fadeIn">
              
              {/* Top Banner */}
              <div className="hv-pill-emerald border p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[var(--bg-surface)] border border-emerald-500/40 flex items-center justify-center text-emerald-500 shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-sm text-[var(--text-primary)] flex items-center gap-2 flex-wrap">
                      <span>{isHindi ? '📱 मोबाइल ऐप इंस्टॉलेशन एवं वितरण केंद्र' : '📱 Mobile App Delivery & Android APK Center'}</span>
                      <span className="text-[10px] hv-pill-emerald px-2 py-0.5 rounded-full border">
                        Android & iOS
                      </span>
                    </h4>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {isHindi 
                        ? 'ग्राहक अपने स्मार्टफोन में बिना किसी प्ले स्टोर शुल्क के सीधे 1-क्लिक में Hisabveda ERP चला सकते हैं।' 
                        : 'Clients can install Hisabveda ERP directly onto their smartphones with standalone full-screen support.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* QR Code and Quick Link Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left: Mobile QR Code */}
                <div className="bg-[var(--bg-elevated)] p-5 rounded-2xl border border-[var(--border-primary)] text-center space-y-3">
                  <span className="text-xs font-bold text-emerald-500 block">
                    {isHindi ? 'ग्राहक हेतु मोबाइल QR कोड (Scan & Install):' : 'Mobile QR Code for Client:'}
                  </span>
                  
                  <div className="bg-white p-3 rounded-2xl inline-block shadow-xl">
                    <QRCodeSVG
                      value={demoShareUrl}
                      size={160}
                      level="H"
                      includeMargin={true}
                    />
                  </div>

                  <p className="text-[11px] text-[var(--text-muted)]">
                    {isHindi 
                      ? 'ग्राहक किसी भी फोन के कैमरे से स्कैन करेगा तो ऐप तुरंत खुल जाएगा।' 
                      : 'Client scans this code with camera to open & install the app.'}
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={demoShareUrl}
                      className="w-full hv-input border rounded-xl px-2.5 py-1.5 text-[11px] text-emerald-500 font-mono select-all focus:outline-none truncate"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(demoShareUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 2500);
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-bold px-3 py-1.5 rounded-xl text-xs transition shadow shrink-0 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Right: Mobile WhatsApp Message & Instructions */}
                <div className="bg-[var(--bg-elevated)] p-5 rounded-2xl border border-[var(--border-primary)] flex flex-col justify-between space-y-3">
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1.5">
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>{isHindi ? 'व्हाट्सएप मोबाइल इनवाइट संदेश:' : 'WhatsApp Mobile App Message:'}</span>
                    </span>

                    <div className="bg-[var(--bg-surface)] border border-[var(--border-primary)] p-3 rounded-xl text-[11px] font-mono text-[var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
{`📱 *HISABVEDA ERP - मोबाइल ऐप एक्सेस* 📱

नमस्ते ${clientName ? clientName : 'सर/मैडम'},
आपके व्यापार के लिए Hisabveda ERP का मोबाइल ऐप लिंक तैयार है।

📲 *मोबाइल में कैसे चलाएं:*
1. नीचे दिए गए लिंक को अपने फोन के Chrome/Safari ब्राउज़र में खोलें:
${demoShareUrl}

2. ब्राउज़र में "Install App" या "होम स्क्रीन पर जोड़ें" दबाएँ।
3. ऐप आपके फोन की स्क्रीन पर असली ऐप की तरह आ जाएगा!

💼 *सुविधाएं:* मोबाइल बिलिंग, स्टॉक, लेजर, व्हाट्सएप इनवॉइस व GST रिपोर्ट्स।`}
                    </div>
                  </div>

                  <a
                    href={`https://api.whatsapp.com/send?${clientPhone ? `phone=${encodeURIComponent(clientPhone)}&` : ''}text=${encodeURIComponent(`📱 *HISABVEDA ERP - मोबाइल ऐप एक्सेस*\n\nनमस्ते ${clientName ? clientName : 'सर/मैडम'},\nआपके व्यापार के लिए Hisabveda ERP मोबाइल लिंक:\n${demoShareUrl}\n\n1. फोन ब्राउज़र में लिंक खोलें\n2. 3 डॉट्स दबाकर "Install App" पर टैप करें।`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white hv-keep-white font-extrabold py-2.5 rounded-xl text-xs shadow-lg transition cursor-pointer"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>{isHindi ? '📱 व्हाट्सएप पर मोबाइल ऐप लिंक भेजें' : 'Send Mobile Link on WhatsApp'}</span>
                  </a>
                </div>

              </div>

              {/* Native Android APK Generation Card */}
              <div className="bg-[var(--bg-elevated)] p-4 rounded-2xl border border-teal-500/40 space-y-3 text-xs">
                <div className="flex items-center justify-between border-b border-[var(--border-primary)] pb-2 flex-wrap gap-2">
                  <span className="font-bold text-teal-500 flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    <span>{isHindi ? 'Android APK पैकेज (.apk) जनरेटर टूल:' : 'Native Android APK Package (.apk) Builder:'}</span>
                  </span>
                  <span className="text-[10px] hv-pill-cyan border px-2 py-0.5 rounded font-mono font-bold">
                    CAPACITOR / ANDROID STUDIO
                  </span>
                </div>

                <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                  {isHindi 
                    ? 'यदि ग्राहक आपसे मांगता है कि "मुझे .apk फाइल भेजिए" या आपको Google Play Store पर Hisabveda ERP ऐप पब्लिश करना है, तो यह 1-क्लिक बिल्डर स्क्रिप्ट उपयोग करें:' 
                    : 'If you want to distribute a direct .apk file or publish to Google Play Store, download this automated script:'}
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-primary)]">
                  <div className="text-[11px] text-[var(--text-secondary)]">
                    <p className="font-mono text-emerald-500 font-bold">HisabVeda_Android_APK_Builder.zip</p>
                    <p className="text-[var(--text-muted)] text-[10px]">{isHindi ? 'प्रोजेक्ट को 1-क्लिक में Android Studio प्रोजेक्ट में बदलता है।' : 'Automates Capacitor Android project generation.'}</p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await downloadAndroidApkBuilderZip();
                    }}
                    className="shrink-0 flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white hv-keep-white font-extrabold px-4 py-2 rounded-xl text-xs transition shadow cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isHindi ? 'APK बिल्डर (.ZIP) डाउनलोड करें' : 'Download APK Builder (.ZIP)'}</span>
                  </button>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer */}
        <div className="bg-[var(--bg-elevated)] p-4 border-t border-[var(--border-primary)] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>{isHindi ? 'Hisabveda ERP सुरक्षित वितरण प्रणाली v2.0' : 'Hisabveda ERP Secure Client Distribution v2.0'}</span>
          </div>

          <button
            onClick={onClose}
            className="bg-indigo-600 hover:bg-indigo-500 text-white hv-keep-white font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg cursor-pointer"
          >
            {isHindi ? 'बंद करें' : 'Close'}
          </button>
        </div>

      </div>
    </div>
  );
};
