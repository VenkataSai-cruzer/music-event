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
 *   3. Compose in HTML with proper z-index stacking
 *   4. Load via file:// HTML page in Puppeteer
 *   5. Wait for all images to load
 *   6. Verify composition before PDF generation
 *   7. Take debug screenshot
 *   8. Generate exactly one PDF page
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

  // ═══════════════════════════════════════════════════════
  //  Build HTML page with CORRECT z-index stacking
  //  .ticket-background (z-index: 1) — background artwork
  //  .ticket-overlay    (z-index: 2) — SVG with text/QR/barcode
  // ═══════════════════════════════════════════════════════
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: 6in 4in;
      margin: 0;
    }

    html, body {
      width: 6in;
      height: 4in;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: transparent;
    }

    .ticket {
      position: relative;
      width: 1536px;
      height: 1024px;
      overflow: hidden;
      transform-origin: top left;
    }

    .ticket-background,
    .ticket-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 1536px;
      height: 1024px;
      display: block;
    }

    .ticket-background {
      z-index: 1;
    }

    .ticket-overlay {
      z-index: 2;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="ticket">
    <img
      class="ticket-background"
      src="./background.png"
      width="1536"
      height="1024"
      alt=""
    />

    <div class="ticket-overlay">
      ${svgContent}
    </div>
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
    // Viewport matches the ticket dimensions exactly (1536×1024, 3:2 ratio)
    await page.setViewport({ width: 1536, height: 1024 });
    page.setDefaultTimeout(120000);

    // Load from file:// URL so background.png resolves correctly via relative path
    const fileUrl = `file:///${tempHtmlPath.split('\\\\').join('/')}`;
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    });

    // ═══════════════════════════════════════════════════
    //  Wait for ALL images (background, QR, barcode) to load
    // ═══════════════════════════════════════════════════
    await page.evaluate(async () => {
      const images = Array.from(document.images);

      await Promise.all(
        images.map((image) => {
          if (image.complete && image.naturalWidth > 0) {
            return Promise.resolve();
          }

          return new Promise((resolve, reject) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener(
              'error',
              () => reject(new Error(`Failed to load image: ${image.src}`)),
              { once: true }
            );
          });
        })
      );

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
    });

    // ═══════════════════════════════════════════════════
    //  Verify composition before generating PDF
    // ═══════════════════════════════════════════════════
    const verification = await page.evaluate(() => {
      const background = document.querySelector('.ticket-background');
      const overlay = document.querySelector('.ticket-overlay');
      const svg = overlay?.querySelector('svg');

      return {
        backgroundLoaded:
          Boolean(background) &&
          background.complete &&
          background.naturalWidth === 1536 &&
          background.naturalHeight === 1024,

        overlayExists: Boolean(overlay),
        svgExists: Boolean(svg),

        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,

        remainingPlaceholders:
          document.documentElement.innerHTML.match(/\{\{[^}]+\}\}/g) || [],
      };
    });

    console.log('[PDF verification]', JSON.stringify(verification));

    // Throw if critical checks fail
    if (!verification.backgroundLoaded) {
      throw new Error(
        `Background image verification failed: ${JSON.stringify(verification)}`
      );
    }
    if (!verification.overlayExists || !verification.svgExists) {
      throw new Error(
        `SVG overlay missing: ${JSON.stringify(verification)}`
      );
    }
    if (verification.remainingPlaceholders.length > 0) {
      throw new Error(
        `Unreplaced placeholders found: ${verification.remainingPlaceholders.join(', ')}`
      );
    }

    // ═══════════════════════════════════════════════════
    //  Debug screenshot — inspect before PDF generation
    // ═══════════════════════════════════════════════════
    const debugScreenshotPath = path.join(debugDir, `${debugId}_preview.png`);
    await page.screenshot({
      path: debugScreenshotPath,
      fullPage: false,
    });
    console.log(`[PDF] Debug screenshot saved: ${debugScreenshotPath}`);

    // ═══════════════════════════════════════════════════
    //  Generate PDF — explicit dimensions, single page
    // ═══════════════════════════════════════════════════
    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    await page.pdf({
      path: filePath,
      width: '6in',
      height: '4in',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      pageRanges: '1',
    });

    // Read back the PDF buffer for DB storage
    const pdfBuffer = fs.readFileSync(filePath);

    console.log(`[PDF] Generated: ${fileName} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`);

    return pdfBuffer;
  } finally {
    await page.close().catch(() => {});
    // Clean up temp HTML file
    try { fs.unlinkSync(tempHtmlPath); } catch (_) {}
  }
}

module.exports = generatePuppeteerPDF;
