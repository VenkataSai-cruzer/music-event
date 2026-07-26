const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const generateBarcode = require('./generateBarcode');

const TICKET_ARTWORK_PATH = path.join(__dirname, '..', 'public', 'assets', 'brand', 'finalticket.png');
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
let cachedArtworkBase64 = null;

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
  cachedArtworkBase64 = readImageBase64(TICKET_ARTWORK_PATH);

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
 * Generates a landscape ticket PDF using the exact aspect ratio of the
 * approved artwork (1536×1024 — 3:2 landscape). The artwork is used as a
 * fixed background, and only dynamic fields are overlaid on top.
 *
 * Rendering approach:
 * 1. The approved ticket artwork (finalticket.png) is used as a fixed background.
 * 2. Dynamic fields (name, gender, email, mobile, ticket ID) are overlaid
 *    at exact pixel coordinates matching the artwork.
 * 3. QR code (PNG) and Code128 barcode (SVG) are generated as images and overlaid.
 * 4. The template, artwork, and Chrome browser are all cached in memory.
 * 5. PDF page is sized to match the artwork exactly — no scaling, no margins.
 *
 * @param {Object} ticket - Ticket object with name, gender, email, mobile, ticket_id, qr_token.
 * @param {Buffer} qrBuffer - PNG buffer for the QR code.
 * @returns {Promise<string>} - Relative path to the generated PDF (e.g., /tickets/xxx.pdf).
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');

  // Generate Code128 barcode as SVG data URI from Ticket ID
  const barcodeDataUri = await generateBarcode(ticket.ticket_id);

  if (!cachedArtworkBase64) {
    // Artwork wasn't cached at load time, try loading now
    loadCache();
    if (!cachedArtworkBase64) {
      throw new Error('Final ticket artwork not found. Ensure finalticket.png exists in public/assets/brand/');
    }
  }

  // Build replacements map with cached artwork (no disk I/O per request)
  const replacements = {
    'BACKGROUND_BASE64': cachedArtworkBase64,
    'ATTENDEE_NAME': ticket.name || '',
    'ATTENDEE_GENDER': ticket.gender || '',
    'ATTENDEE_EMAIL': ticket.email || '',
    'ATTENDEE_MOBILE': ticket.mobile || '',
    'TICKET_ID': ticket.ticket_id || '',
    'QR_BASE64': qrBase64,
    'BARCODE_BASE64': barcodeDataUri,
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

    // All content is inline base64 (no network requests) — 'load' is sufficient
    // Use generous timeout because the first request also launches Chrome
    page.setDefaultTimeout(60000);
    await page.setContent(html, {
      waitUntil: 'load',
      timeout: 60000,
    });

    // Brief settle time for fonts and rendering to complete
    await new Promise(r => setTimeout(r, 400));

    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    // Generate PDF matching the artwork's exact dimensions — no scaling, no cropping
    // Page size is driven by the @page CSS rule (1536px × 1024px)
    await page.pdf({
      path: filePath,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
      scale: 1,
    });

    return `/tickets/${fileName}`;
  } finally {
    // Close only the page — keep browser alive for subsequent generations
    await page.close().catch(() => {});
  }
}

module.exports = generatePuppeteerPDF;
