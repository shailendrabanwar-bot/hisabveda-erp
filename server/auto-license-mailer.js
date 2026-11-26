/**
 * HisabVeda ERP — Standalone / Serverless Ed25519 License Auto-Signer & Mailer
 *
 * Deploy to Render, Railway, Cloud Run, Vercel, Netlify, or any Node.js server.
 * Required Environment Variables:
 *   PRIVATE_KEY   - 32-byte Base64 seed (or 64-byte secretKey / PKCS8 PEM) matching VITE_LICENSE_PUBLIC_KEY
 *   SMTP_HOST     - SMTP host (e.g. smtp.gmail.com)
 *   SMTP_PORT     - SMTP port (587 or 465)
 *   SMTP_USER     - SMTP username / sender email
 *   SMTP_PASS     - SMTP password or App Password
 *   SMTP_FROM     - Optional display From address
 *   ADMIN_EMAIL   - Optional admin email to receive a BCC/copy of every issued certificate
 *   ALLOWED_ORIGIN- Optional comma-separated allowed CORS origins
 *   PORT          - HTTP listen port (default: 4000)
 */

import crypto from 'node:crypto';
import http from 'node:http';
import nacl from 'tweetnacl';

const MAX_REQUESTS_PER_WINDOW = 10;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const rateBuckets = new Map();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(b64u) {
  const normalized = String(b64u || '').replace(/-/g, '+').replace(/_/g, '/').trim();
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return new Uint8Array(Buffer.from(padded, 'base64'));
}

function parsePrivateKey(rawInput) {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    throw new Error('Server signing key (PRIVATE_KEY or LICENSE_PRIVATE_KEY) is not configured.');
  }

  if (trimmed.includes('BEGIN PRIVATE KEY')) {
    const keyObj = crypto.createPrivateKey(trimmed);
    const jwk = keyObj.export({ format: 'jwk' });
    if (!jwk || !jwk.d) {
      throw new Error('Invalid PKCS8 Ed25519 private key.');
    }
    return nacl.sign.keyPair.fromSeed(fromBase64Url(jwk.d));
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return nacl.sign.keyPair.fromSeed(new Uint8Array(Buffer.from(trimmed, 'hex')));
  }
  if (/^[0-9a-fA-F]{128}$/.test(trimmed)) {
    return nacl.sign.keyPair.fromSecretKey(new Uint8Array(Buffer.from(trimmed, 'hex')));
  }

  const bytes = fromBase64Url(trimmed);
  if (bytes.length === 32) {
    return nacl.sign.keyPair.fromSeed(bytes);
  }
  if (bytes.length === 64) {
    return nacl.sign.keyPair.fromSecretKey(bytes);
  }
  throw new Error('Unsupported Ed25519 private key format.');
}

function resolvePlanSpec(rawPlan) {
  const normalized = String(rawPlan || 'STANDARD_ANNUAL').trim().toUpperCase();
  if (normalized === 'TRIAL') {
    return { plan: 'TRIAL', label: '7-Day Extended Trial', validityDays: 7 };
  }
  if (normalized === 'PRO_PERPETUAL' || normalized === 'LIFETIME') {
    return { plan: 'PRO_PERPETUAL', label: 'Lifetime Perpetual Commercial', validityDays: 9999 };
  }
  if (normalized === 'ENTERPRISE') {
    return { plan: 'ENTERPRISE', label: 'Enterprise Annual', validityDays: 365 };
  }
  return { plan: 'STANDARD_ANNUAL', label: 'Annual Commercial (1 Year)', validityDays: 365 };
}

export function signLicenseCertificate({ fullName, machineId, plan, mode, maxSeats }) {
  const rawPrivateKey = process.env.PRIVATE_KEY || process.env.LICENSE_PRIVATE_KEY || '';
  const keyPair = parsePrivateKey(rawPrivateKey);
  const planSpec = resolvePlanSpec(plan);
  const nowMs = Date.now();
  const expiresAtMs =
    planSpec.validityDays >= 9999
      ? Date.UTC(2099, 11, 31, 23, 59, 59, 999)
      : nowMs + planSpec.validityDays * 86400000;

  const cleanMode = String(mode || '').toUpperCase() === 'MULTI_USER' ? 'MULTI_USER' : 'SINGLE_USER';
  const resolvedSeats = cleanMode === 'SINGLE_USER' ? 1 : Math.min(50, Math.max(2, Number(maxSeats || 5)));

  const payload = {
    v: 3,
    app: 'HISABVEDA_ERP',
    licenseId: `lic_${crypto.randomBytes(8).toString('hex')}`,
    clientName: fullName,
    gstinOrReg: 'UNREGISTERED',
    hwid: machineId,
    plan: planSpec.plan,
    mode: cleanMode,
    maxSeats: resolvedSeats,
    issuedAtMs: nowMs,
    expiresAtMs,
    serverTimeMs: nowMs,
    nonce: crypto.randomBytes(12).toString('hex'),
  };

  const payloadB64Url = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const unsignedToken = `HV-LIC-V3.${payloadB64Url}`;
  const signature = nacl.sign.detached(new TextEncoder().encode(unsignedToken), keyPair.secretKey);
  const certificate = `${unsignedToken}.${toBase64Url(signature)}`;

  return {
    certificate,
    payload,
    planLabel: planSpec.label,
    expiresDate: new Date(expiresAtMs).toISOString().split('T')[0],
  };
}

async function createMailerTransport() {
  const host = String(process.env.SMTP_HOST || '').trim();
  const port = Number(process.env.SMTP_PORT || 587);
  const user = String(process.env.SMTP_USER || '').trim();
  const pass = String(process.env.SMTP_PASS || '').trim();

  if (!host || !user || !pass) {
    throw new Error('SMTP mail credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) are not configured.');
  }

  const nodemailerMod = await import('nodemailer');
  const nodemailer = nodemailerMod.default || nodemailerMod;
  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: { user, pass },
  });
}

function buildCustomerEmailHtml({ fullName, email, mobile, machineId, planLabel, expiresDate, certificate }) {
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:24px;border-radius:16px;border:1px solid #334155;">
      <h2 style="margin:0 0 8px;color:#38bdf8;">HisabVeda ERP — License Certificate</h2>
      <p style="margin:0 0 18px;color:#94a3b8;font-size:13px;">Namaste ${escapeHtml(fullName)}, thank you for registering with HisabVeda ERP.</p>

      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:18px;font-size:13px;">
        <div><strong>Customer / Business:</strong> ${escapeHtml(fullName)}</div>
        <div style="margin-top:6px;"><strong>Email:</strong> ${escapeHtml(email)} &nbsp;|&nbsp; <strong>Mobile:</strong> ${escapeHtml(mobile)}</div>
        <div style="margin-top:6px;"><strong>Plan:</strong> ${escapeHtml(planLabel)} (Valid until: ${escapeHtml(expiresDate)})</div>
        <div style="margin-top:6px;"><strong>Locked Hardware Machine ID:</strong> <code>${escapeHtml(machineId)}</code></div>
      </div>

      <div style="margin-bottom:18px;">
        <div style="font-size:12px;font-weight:bold;color:#fbbf24;margin-bottom:6px;">YOUR SIGNED LICENSE CERTIFICATE (COPY FULL TEXT BELOW):</div>
        <pre style="white-space:pre-wrap;word-break:break-all;background:#020617;color:#fcd34d;border:1px solid #4f46e5;border-radius:10px;padding:14px;font-size:12px;line-height:1.5;">${escapeHtml(certificate)}</pre>
      </div>

      <div style="background:#064e3b;border:1px solid #10b981;border-radius:12px;padding:14px;font-size:13px;color:#d1fae5;">
        <strong>Activation Steps inside HisabVeda ERP:</strong>
        <ol style="margin:8px 0 0 18px;padding:0;line-height:1.6;">
          <li>Open HisabVeda ERP Desktop and click <strong>Activate License</strong>.</li>
          <li>Stay on the <strong>Activate License Key</strong> tab.</li>
          <li>Paste the entire <code>HV-LIC-V3...</code> certificate above into the License Certificate box.</li>
          <li>Click <strong>Activate Commercial License</strong> — your software unlocks permanently for this PC.</li>
        </ol>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.6;">
        <strong style="color:#e2e8f0;">HisabVeda-ERP Accounting Solution</strong> · A3 401, Fortune Somya Heritage, 4th Floor, Behind IPS School, Huzur, Bhopal, MP - 462047, India<br/>
        Need help? Email <a href="mailto:support@hisabveda.com" style="color:#38bdf8;">support@hisabveda.com</a> · Phone/WhatsApp: +91-7489655303 · Visit <a href="https://hisabveda.com" style="color:#38bdf8;">hisabveda.com</a>
      </p>
    </div>
  `;
}

function isRateLimited(ipKey) {
  const now = Date.now();
  const bucket = rateBuckets.get(ipKey);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(ipKey, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_REQUESTS_PER_WINDOW;
}

function applyCorsHeaders(req, res) {
  const origin = String(req.headers.origin || '').trim();
  const defaultOrigins = [
    'app://hisabveda',
    'https://hisabveda.com',
    'https://www.hisabveda.com',
    'https://hisabveda.in',
    'https://www.hisabveda.in',
  ];
  const configured = String(process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedList = configured.length > 0 ? [...new Set([...defaultOrigins, ...configured])] : defaultOrigins;

  if (origin && (allowedList.includes(origin) || configured.length === 0)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    return Promise.resolve(req.body);
  }
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 32 * 1024) {
        reject(new Error('Request payload too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON request body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(payload);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export async function handleLicenseRequest(req, res) {
  applyCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed. Use POST.' });
  }

  const clientIp = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0]
    .trim();
  if (isRateLimited(clientIp)) {
    return sendJson(res, 429, { error: 'Too many license requests. Please wait 15 minutes and try again.' });
  }

  try {
    const body = await readJsonBody(req);
    const fullName = String(body.fullName || body.ownerName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const mobile = String(body.mobile || body.phone || '').trim();
    const plan = String(body.plan || 'STANDARD_ANNUAL').trim().toUpperCase();
    const machineId = String(body.machineId || '').trim().toUpperCase();

    if (!fullName || fullName.length < 2 || fullName.length > 120) {
      return sendJson(res, 400, { error: 'Please provide a valid Full Name or Business Name.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Please provide a valid customer email address.' });
    }
    if (!/^[0-9+\-\s()]{7,20}$/.test(mobile)) {
      return sendJson(res, 400, { error: 'Please provide a valid mobile number.' });
    }
    if (!/^HV-HWID-[A-F0-9]{16,64}$/.test(machineId)) {
      return sendJson(res, 400, { error: 'Invalid Hardware Machine ID format.' });
    }

    const signed = signLicenseCertificate({
      fullName,
      machineId,
      plan,
      mode: body.mode,
      maxSeats: body.maxSeats,
    });

    const transporter = await createMailerTransport();
    const fromAddr = String(process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim();
    const supportEmail = String(process.env.SUPPORT_EMAIL || 'support@hisabveda.com').trim();

    await transporter.sendMail({
      from: fromAddr,
      to: email,
      replyTo: supportEmail,
      ...(adminEmail && adminEmail.toLowerCase() !== email ? { bcc: adminEmail } : {}),
      subject: `HisabVeda ERP License Certificate (${signed.planLabel})`,
      html: buildCustomerEmailHtml({
        fullName,
        email,
        mobile,
        machineId,
        planLabel: signed.planLabel,
        expiresDate: signed.expiresDate,
        certificate: signed.certificate,
      }),
      text: [
        `HisabVeda ERP License Certificate (${signed.planLabel})`,
        `Customer: ${fullName}`,
        `Machine ID: ${machineId}`,
        `Valid Until: ${signed.expiresDate}`,
        '',
        `Certificate:`,
        signed.certificate,
      ].join('\n'),
    });

    return sendJson(res, 200, {
      success: true,
      message: `License certificate signed and emailed to ${email}.`,
      licenseId: signed.payload.licenseId,
      plan: signed.payload.plan,
      expiresDate: signed.expiresDate,
    });
  } catch (err) {
    console.error('Auto license mailer error:', err?.message || err);
    return sendJson(res, 500, {
      error: 'Unable to process license email request right now. Check server configuration.',
    });
  }
}

// Start standalone HTTP server when executed directly: `node server/auto-license-mailer.js`
const isDirectRun =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].endsWith('auto-license-mailer.js');

if (isDirectRun) {
  const port = Number(process.env.PORT || 4000);
  const server = http.createServer((req, res) => {
    const reqPath = String(req.url || '/').split('?')[0];
    if (req.method === 'GET' && reqPath === '/health') {
      return sendJson(res, 200, { status: 'ok', service: 'hisabveda-auto-license-mailer' });
    }
    if (reqPath === '/' || reqPath === '/api/license/request') {
      return handleLicenseRequest(req, res);
    }
    return sendJson(res, 404, { error: 'Not Found' });
  });

  server.listen(port, () => {
    console.log(`HisabVeda Auto-License Mailer listening on port ${port}`);
  });
}

export default handleLicenseRequest;
