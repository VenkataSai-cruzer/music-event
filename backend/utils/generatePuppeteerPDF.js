const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BRAND_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket.html');

if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

// ══════════════════════════════════════════════════
//  CACHED RESOURCES — loaded once at module load
// ══════════════════════════════════════════════════

let cachedBrowser = null;
let cachedTemplate = null;
const cachedLogos = {};

function readImageBase64(filePath) {
  if (!fs.existsSync(filePath)) return '';
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' :
                 ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch (e) {
    return '';
  }
}

function cacheLogos() {
  const LOGO_FILES = {
    '7notes': '7notes-logo.png',
    'cafooze': 'cafooze-logo.png',
    'yoursdigital': 'yoursdigital.png',
    'fisandy': 'fisandy.png',
    'poster': 'poster.png',
  };
  for (const [key, filename] of Object.entries(LOGO_FILES)) {
    cachedLogos[key] = readImageBase64(path.join(BRAND_DIR, filename));
  }
}

// Load everything into cache at module load
cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
cacheLogos();

// ══════════════════════════════════════════════════
//  BROWSER MANAGEMENT — launch once, reuse forever
// ══════════════════════════════════════════════════

async function getBrowser() {
  if (cachedBrowser && cachedBrowser.isConnected()) {
    return cachedBrowser;
  }
  cachedBrowser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  return cachedBrowser;
}

async function closeBrowser() {
  if (cachedBrowser) {
    try { await cachedBrowser.close(); } catch (_) {}
    cachedBrowser = null;
  }
}

// Cleanup on SIGTERM/SIGINT (e.g., Railway restart)
process.on('SIGTERM', () => closeBrowser());
process.on('SIGINT', () => closeBrowser());

// ══════════════════════════════════════════════════
//  PDF GENERATION
// ══════════════════════════════════════════════════

/**
 * Generates an A5 concert pass PDF using a persistent Chrome instance.
 * Template, logos, and Chrome are all cached — only dynamic data changes.
 * Expected time: 2-6 seconds for first ticket, faster for subsequent.
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');

  const hide = (val) => (val && val.length > 0) ? '' : 'display:none;';

  const replacements = {
    'ATTENDEE_NAME': ticket.name || '',
    'ATTENDEE_GENDER': ticket.gender || '',
    'ATTENDEE_EMAIL': ticket.email || '',
    'ATTENDEE_MOBILE': ticket.mobile || '',
    'TICKET_ID': ticket.ticket_id || '',
    'QR_BASE64': qrBase64,
    'LOGO_7NOTES': cachedLogos['7notes'] || '',
    'LOGO_CAFOOZE': cachedLogos['cafooze'] || '',
    'LOGO_YOURSDIGITAL': cachedLogos['yoursdigital'] || '',
    'LOGO_FISANDY': cachedLogos['fisandy'] || '',
    'POSTER_BG': cachedLogos['poster'] || '',
    'HIDE_7NOTES': hide(cachedLogos['7notes']),
    'HIDE_CAFOOZE': hide(cachedLogos['cafooze']),
    'HIDE_YOURS': hide(cachedLogos['yoursdigital']),
    'HIDE_FISANDY': hide(cachedLogos['fisandy']),
    'HIDE_POSTER': hide(cachedLogos['poster']),
  };

  // Replace placeholders in cached template (fast, no disk I/O)
  let html = cachedTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value != null ? String(value) : '');
  }

  // Use cached Chrome browser (launched once at first use)
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setViewport({ width: 595, height: 842, deviceScaleFactor: 2 });

    // setContent with all data inline (base64 logos + QR — no file:// or disk reads)
    await page.setContent(html, {
      waitUntil: ['load', 'networkidle2'],
      timeout: 30000,
    });

    // Short settle for font loading and rendering
    await new Promise(r => setTimeout(r, 500));

    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    await page.pdf({
      path: filePath,
      format: 'A5',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      preferCSSPageSize: true,
    });

    return `/tickets/${fileName}`;
  } finally {
    // Close only the page — keep browser alive for next generation
    await page.close().catch(() => {});
  }
}

module.exports = generatePuppeteerPDF;
