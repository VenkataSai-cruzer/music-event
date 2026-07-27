const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const generateBarcode = require('./generateBarcode');

const BRAND_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket-template.html');

// Ensure tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

// ══════════════════════════════════════════════════
//  CACHED RESOURCES — loaded once at module load
// ══════════════════════════════════════════════════

let cachedBrowser = null;
let cachedTemplate = null;
let cachedLogos = {};

// Logo files to cache
const LOGO_FILES = {
  '7notes': '7notes-logo.png',
  'yoursdigital': 'yoursdigital.png',
  'fisandy': 'fisandy.png',
};

/**
 * Reads an image file and returns it as a base64 data URI.
 */
function readImageBase64(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`[PDF] Artwork not found at: ${filePath}`);
    return '';
  }
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch (e) {
    console.error(`[PDF] Failed to read artwork:`, e.message);
    return '';
  }
}

/**
 * Loads or reloads the cached template and artwork from disk.
 */
function loadCache() {
  // Cache partner logos for dynamic injection
  for (const [key, filename] of Object.entries(LOGO_FILES)) {
    cachedLogos[key] = readImageBase64(path.join(BRAND_DIR, filename));
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Template not found at: ${TEMPLATE_PATH}`);
  }
  cachedTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
}

// Initial load — runs once at module load
loadCache();

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

// Cleanup on process termination
process.on('SIGTERM', () => closeBrowser());
process.on('SIGINT', () => closeBrowser());

// ══════════════════════════════════════════════════
//  PDF GENERATION
// ══════════════════════════════════════════════════

/**
 * Generates a premium landscape concert ticket PDF (3:2 ratio, 6×4 inch).
 *
 * The ticket is a pure HTML+CSS design with:
 * - Abstract concert background (CSS gradients)
 * - Left 65%: event branding (7 NOTES, venue, date, partner logos)
 * - Right 35%: attendee info panel (name, gender, email, mobile, QR, barcode)
 * - Gold accents, dark theme, glass-effect panel
 * - Partner logos loaded from brand assets and injected as base64
 * - Google Fonts (Oswald + Inter) with system font fallbacks
 *
 * Caching strategy:
 * - Chrome browser: launched once, reused for all generations
 * - HTML template: loaded from disk at module init, string-replaced per request
 * - Logos: loaded as base64 at module init, injected into template
 *
 * @param {Object} ticket - Ticket object with name, gender, email, mobile, ticket_id, qr_token.
 * @param {Buffer} qrBuffer - PNG buffer for the QR code.
 * @returns {Promise<string>} - Relative path to the generated PDF (e.g., /tickets/xxx.pdf).
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');

  // Generate Code128 barcode as SVG data URI from Ticket ID
  const barcodeDataUri = await generateBarcode(ticket.ticket_id);

  // Ensure logos are cached
  if (!cachedLogos['7notes']) {
    loadCache();
  }

  // Build replacements map with cached resources (no disk I/O per request)
  const replacements = {
    'ATTENDEE_NAME': ticket.name || '',
    'ATTENDEE_GENDER': ticket.gender || '',
    'ATTENDEE_EMAIL': ticket.email || '',
    'ATTENDEE_MOBILE': ticket.mobile || '',
    'TICKET_ID': ticket.ticket_id || '',
    'QR_BASE64': qrBase64,
    'BARCODE_BASE64': barcodeDataUri,
    'LOGO_7NOTES': cachedLogos['7notes'] || '',
    'LOGO_YOURSDIGITAL': cachedLogos['yoursdigital'] || '',
    'LOGO_FISANDY': cachedLogos['fisandy'] || '',
  };

  // Apply replacements to cached template (fast string replace, no disk I/O)
  let html = cachedTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value != null ? String(value) : '');
  }

  // Get or launch cached Chrome browser (launched once, reused forever)
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Set viewport to match artwork dimensions exactly
    await page.setViewport({ width: 1536, height: 1024, deviceScaleFactor: 2 });

    // All content is inline base64 (except Google Fonts CSS).
    // Use 'domcontentloaded' — fires as soon as HTML is parsed, doesn't wait
    // for Google Fonts to finish downloading (saves 2-5 seconds on cold start).
    // Fonts that don't load in time will use system fallbacks (Inter → system-ui).
    page.setDefaultTimeout(60000);
    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Brief settle for CSS rendering to paint
    await new Promise(r => setTimeout(r, 200));

    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    // Generate PDF at the artwork's 3:2 aspect ratio
    // Using explicit width/height (6×4 inch) instead of @page CSS because
    // Puppeteer converts CSS px → pt (1px = 1pt), making @page much larger
    // than the body content and producing white borders around the ticket.
    //
    // Viewport (1536×1024) matches the 3:2 ratio of 6×4 inches, so the
    // artwork fills the entire PDF page with zero margins — no white borders.
    await page.pdf({
      path: filePath,
      width: '6in',
      height: '4in',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
    });

    return `/tickets/${fileName}`;
  } finally {
    // Close only the page — keep browser alive for subsequent generations
    await page.close().catch(() => {});
  }
}

module.exports = generatePuppeteerPDF;
