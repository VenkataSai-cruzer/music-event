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
 * Strips anything after </svg> (C2PA metadata) to avoid HTML parser issues.
 */
function loadSvgCache() {
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
  cachedSvg = content;
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

  // ── Replace placeholders ──
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

  // ── Build proper HTML wrapper ──
  // DOCTYPE + meta charset + SVG sizing CSS = tells Chromium exactly how to render
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>${svgContent}</body>
</html>`;

  // ── Debug: write rendered files for manual inspection ──
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
    // Viewport matches the SVG dimensions exactly (1536×1024, 3:2 ratio)
    await page.setViewport({ width: 1536, height: 1024 });
    page.setDefaultTimeout(60000);

    // Use networkidle0 to ensure all embedded images (QR, barcode) are fully loaded
    await page.setContent(html, {
      waitUntil: 'networkidle0',
      timeout: 120000,
    });

    // Brief settle for final rendering (large SVG may need extra time)
    await new Promise(r => setTimeout(r, 1000));

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
