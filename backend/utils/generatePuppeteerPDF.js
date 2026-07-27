const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const generateBarcode = require('./generateBarcode');

const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const SVG_PATH = path.join(__dirname, '..', 'templates', 'finalticket.svg');

// Ensure tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

// ══════════════════════════════════════════════════
//  CACHED RESOURCES — loaded once at module load
// ══════════════════════════════════════════════════

let cachedBrowser = null;
let cachedSvg = null;

/**
 * Loads or reloads the cached SVG template from disk.
 */
function loadSvgCache() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`SVG template not found at: ${SVG_PATH}`);
  }
  cachedSvg = fs.readFileSync(SVG_PATH, 'utf-8');
  console.log(`[PDF] SVG template cached (${(cachedSvg.length / 1024).toFixed(1)} KB)`);
}

// Initial load — runs once at module load
loadSvgCache();

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
//  PDF GENERATION — SVG-based, no HTML layout
// ══════════════════════════════════════════════════

/**
 * Generates a PDF ticket from the SVG master artwork.
 *
 * The SVG is the ONLY ticket design. No HTML/CSS recreation.
 * Only placeholders are replaced inside the SVG.
 * The SVG is wrapped in a minimal HTML shell for Puppeteer.
 *
 * @param {Object} ticket - Ticket object with name, gender, email, mobile, ticket_id, qr_token.
 * @param {Buffer} qrBuffer - PNG buffer for the QR code.
 * @returns {Promise<string>} - Relative path to the generated PDF (e.g., /tickets/xxx.pdf).
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');
  const qrDataUri = `data:image/png;base64,${qrBase64}`;

  // Generate Code128 barcode as SVG data URI
  const barcodeDataUri = await generateBarcode(ticket.ticket_id);

  // Ensure SVG is cached
  if (!cachedSvg) {
    loadSvgCache();
  }

  // Replace placeholders in the SVG (no HTML/CSS changes, no layout)
  let svgContent = cachedSvg;
  const replacements = {
    'NAME': ticket.name || '',
    'GENDER': ticket.gender || '',
    'EMAIL': ticket.email || '',
    'MOBILE': ticket.mobile || '',
    'TICKET_ID': ticket.ticket_id || '',
    'QR_IMAGE': qrDataUri,
    'BARCODE_IMAGE': barcodeDataUri,
  };

  for (const [key, value] of Object.entries(replacements)) {
    svgContent = svgContent.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(value));
  }

  // Minimal HTML wrapper — NO CSS, NO layout, NO flexbox, NO grid
  const html = `<html><body style="margin:0">${svgContent}</body></html>`;

  // Get or launch cached Chrome browser
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Viewport matches the SVG dimensions exactly (1536×1024, 3:2 ratio)
    await page.setViewport({ width: 1536, height: 1024 });
    page.setDefaultTimeout(60000);

    await page.setContent(html, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Brief settle for rendering
    await new Promise(r => setTimeout(r, 200));

    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    // Landscape, single page, zero margins, print background, scale=1
    await page.pdf({
      path: filePath,
      format: undefined,  // no format — use explicit dimensions
      width: '6in',
      height: '4in',
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
      pageRanges: '1',  // force exactly ONE page
    });

    return `/tickets/${fileName}`;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = generatePuppeteerPDF;
