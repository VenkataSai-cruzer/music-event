const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const generateBarcode = require('./generateBarcode');

const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const SVG_PATH = path.join(__dirname, '..', 'templates', 'finalticket.svg');
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const BACKGROUND_PATH = path.join(TEMPLATES_DIR, 'background.png');

// Ensure tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

// ══════════════════════════════════════════════════
//  CACHED RESOURCES — loaded once at module load
// ══════════════════════════════════════════════════

let cachedBrowser = null;
/** @type {string|null} SVG with background IMAGE REMOVED (overlays only) */
let cachedOverlaySvg = null;

/**
 * Loads or reloads the SVG overlay template from disk.
 * Removes the embedded <image> element containing the huge background PNG
 * data URI, so only overlay elements (text, QR, barcode) remain.
 */
function loadOverlaySvgCache() {
  if (!fs.existsSync(SVG_PATH)) {
    throw new Error(`SVG template not found at: ${SVG_PATH}`);
  }
  let content = fs.readFileSync(SVG_PATH, 'utf-8');

  // Strip anything after </svg> (C2PA content authenticity metadata) to avoid
  // confusing the HTML5 parser when the SVG is embedded inside <body>.
  const svgEnd = content.lastIndexOf('</svg>');
  if (svgEnd !== -1) {
    content = content.substring(0, svgEnd + 6);
  }

  // Remove the full-size background <image> element (x="0" y="0") to eliminate
  // the ~2.89 MB embedded base64 data URI that causes Chromium rendering failures.
  // The background is loaded separately as an <img> tag via file:// URL.
  content = content.replace(/<image\s+x="0"\s+y="0"[^>]*\/>/, '');

  // Also remove the XML declaration — we embed the SVG in HTML5
  content = content.replace(/<\?xml[^>]*\?>\n?/, '');

  // Verify the background image exists on disk as a fallback
  if (!fs.existsSync(BACKGROUND_PATH)) {
    console.warn(`[PDF] Background image not found at: ${BACKGROUND_PATH}`);
  }

  cachedOverlaySvg = content;
  console.log(`[PDF] Overlay SVG cached (${(cachedOverlaySvg.length / 1024).toFixed(1)} KB) — background removed`);
}

// Initial load — runs once at module load
loadOverlaySvgCache();

// ══════════════════════════════════════════════════
//  BROWSER MANAGEMENT — launch once, reuse forever
// ══════════════════════════════════════════════════

async function getBrowser() {
  if (cachedBrowser && cachedBrowser.connected) {
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
//  PDF GENERATION — Background image + SVG overlays
// ══════════════════════════════════════════════════

/**
 * Generates a PDF ticket.
 *
 * Pipeline:
 *   1. Load background PNG from disk as a file:// URL (no data URI limits)
 *   2. Load SVG overlay template (placeholders replaced with ticket data)
 *   3. Compose in HTML: <img> for background, <svg> for overlays
 *   4. Load via file:// HTML page in Puppeteer (avoids CORS/data-URI limits)
 *   5. Generate exactly one PDF page
 *
 * @param {Object} ticket - Ticket object with name, gender, email, mobile, ticket_id, qr_token.
 * @param {Buffer} qrBuffer - PNG buffer for the QR code.
 * @returns {Promise<Buffer>} - PDF file buffer.
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');
  const qrDataUri = `data:image/png;base64,${qrBase64}`;

  // Generate Code128 barcode as SVG data URI
  const barcodeDataUri = await generateBarcode(ticket.ticket_id);

  // Ensure overlay SVG is cached
  if (!cachedOverlaySvg) {
    loadOverlaySvgCache();
  }

  // ── Replace placeholders in the overlay SVG ──
  let svgContent = cachedOverlaySvg;
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

  // ── Build HTML page ──
  // Background loaded as <img> from local file (no data URI size limit).
  // SVG overlays placed directly in the page (already has its own <svg> wrapper).
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 1536px;
      height: 1024px;
      overflow: hidden;
      background: #ffffff;
    }
    .ticket-wrapper {
      position: relative;
      width: 1536px;
      height: 1024px;
    }
    .ticket-wrapper img.background {
      position: absolute;
      top: 0;
      left: 0;
      width: 1536px;
      height: 1024px;
      display: block;
    }
    .ticket-wrapper svg {
      position: absolute;
      top: 0;
      left: 0;
      width: 1536px;
      height: 1024px;
    }
  </style>
</head>
<body>
  <div class="ticket-wrapper">
    <img class="background" src="background.png" alt="" />
    ${svgContent}
  </div>
</body>
</html>`;

  // ═══════════════════════════════════════════════════
  //  Write HTML to a temp file in the templates directory
  //  so file:// relatives resolve to background.png.
  // ═══════════════════════════════════════════════════
  const tempHtmlName = `_ticket_${ticket.qr_token || Date.now()}.html`;
  const tempHtmlPath = path.join(TEMPLATES_DIR, tempHtmlName);
  fs.writeFileSync(tempHtmlPath, html, 'utf-8');

  // ── Debug: write rendered SVG for manual inspection ──
  const debugDir = path.join(__dirname, '..', 'debug-output');
  if (!fs.existsSync(debugDir)) {
    fs.mkdirSync(debugDir, { recursive: true });
  }
  const debugId = ticket.qr_token || Date.now();
  fs.writeFileSync(path.join(debugDir, `${debugId}.svg`), svgContent);
  fs.writeFileSync(path.join(debugDir, `${debugId}.html`), html);

  // Get or launch cached Chrome browser
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Viewport matches the ticket dimensions exactly (1536×1024, 3:2 ratio)
    await page.setViewport({ width: 1536, height: 1024 });
    page.setDefaultTimeout(120000);

    // Load from file:// URL so background.png resolves correctly via relative path
    const fileUrl = `file:///${tempHtmlPath.split('\\').join('/')}`;
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: 120000,
    });

    // Brief settle for final rendering
    await new Promise(r => setTimeout(r, 1000));

    // Landscape, single page, zero margins, print background, scale=1
    const pdfBuffer = await page.pdf({
      format: undefined,
      width: '6in',
      height: '4in',
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      scale: 1,
      pageRanges: '1',
    });

    // Also write to disk as a fallback cache for static serving
    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    return pdfBuffer;
  } finally {
    await page.close().catch(() => {});
    // Clean up temp HTML file
    try { fs.unlinkSync(tempHtmlPath); } catch (_) {}
  }
}

module.exports = generatePuppeteerPDF;
