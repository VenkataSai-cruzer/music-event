const puppeteer = require('puppeteer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'public', 'assets');
const BRAND_DIR = path.join(ASSETS_DIR, 'brand');
const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket.html');

// Ensure the tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

/**
 * Reads a template file and replaces placeholders with actual values.
 * @param {string} templatePath - Path to the HTML template.
 * @param {Object} data - Key-value pairs for {{PLACEHOLDER}} replacement.
 * @returns {string} - HTML string with placeholders replaced.
 */
function fillTemplate(templatePath, data) {
  let html = fs.readFileSync(templatePath, 'utf-8');
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value != null ? String(value) : '');
  }
  return html;
}

/**
 * Reads a QR image file and returns it as a base64 data URI.
 * If the file doesn't exist (e.g., after Render restart), generates the QR
 * on-the-fly from the UUID token so the PDF always has a valid QR code.
 * @param {string} qrAbsolutePath - Absolute path to QR PNG file.
 * @param {string} qrToken - The UUID token to encode (fallback if file missing).
 * @returns {Promise<string>} - Base64-encoded PNG data URI.
 */
async function getQRBase64(qrAbsolutePath, qrToken) {
  if (qrAbsolutePath && fs.existsSync(qrAbsolutePath)) {
    const imageBuffer = fs.readFileSync(qrAbsolutePath);
    return imageBuffer.toString('base64');
  }

  // File not found — generate QR on-the-fly from the UUID
  if (qrToken) {
    try {
      const buffer = await QRCode.toBuffer(qrToken, {
        color: { dark: '#1a1a2e', light: '#ffffff' },
        errorCorrectionLevel: 'H',
        width: 600,
        margin: 4,
        type: 'png',
      });
      return buffer.toString('base64');
    } catch (e) {
      console.error('Failed to generate QR on the fly:', e.message);
    }
  }

  // Ultimate fallback: transparent pixel
  return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
}

/**
 * Reads an image file and returns a base64 data URI.
 * Returns null if the file doesn't exist.
 */
function readImageBase64(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch (e) {
    console.error('Failed to read image:', e.message);
    return null;
  }
}

/**
 * Logo filenames the code will search for in both assets/ and assets/brand/.
 * Each array lists acceptable names for one partner, tried in order.
 */
const PARTNER_LOGO_FILES = [
  ['7notes-logo.png', '7n-logo.png', '7n.png', '7notes.png'],
  ['cafooze-logo.png', 'cf-logo.png', 'cf.png', 'cafooze.png'],
  ['ydm-logo.png', 'yours-digital.png', 'ydm.png'],
  ['fisandy-logo.png', 'fisandy.png', 'fs.png', 'stories-by-fisandy.png'],
];

const PARTNER_META = [
  { alt: '7 NOTES', label: '7 NOTES', short: '7N' },
  { alt: 'CAFOOZE', label: 'CAFOOZE', short: 'CF' },
  { alt: 'Yours Digital Marketing', label: 'Yours Digital<br/>Marketing', short: 'YDM' },
  { alt: 'Stories by Fisandy', label: 'Stories by<br/>Fisandy', short: 'FS' },
];

/**
 * Tries to find a partner logo image in assets/ or assets/brand/.
 * @param {string[]} filenames - List of acceptable filenames for this partner.
 * @returns {string|null} - Base64 data URI or null.
 */
function findPartnerLogo(filenames) {
  const searchDirs = [ASSETS_DIR];
  if (fs.existsSync(BRAND_DIR)) searchDirs.push(BRAND_DIR);

  for (const dir of searchDirs) {
    for (const file of filenames) {
      const filePath = path.join(dir, file);
      const dataUri = readImageBase64(filePath);
      if (dataUri) return dataUri;
    }
  }
  return null;
}

/**
 * Generates partner logos HTML from public/assets/ or public/assets/brand/.
 * Scans in order:
 *   1. Known filenames in assets/ or assets/brand/
 *   2. If NONE of the known filenames are found, scans brand/ for any image
 *      (catch-all for uploaded files with unexpected names)
 *   3. Final fallback: styled text placeholders
 */
function generatePartnerLogosHTML() {
  // Phase 1: Try known filenames in assets/ and brand/
  // For each partner: if logo found, use image; if not, use text placeholder
  // This preserves all 4 partner slots regardless of which logos exist
  let anyLogoFound = false;
  const phase1Results = PARTNER_META.map((m, i) => {
    const dataUri = findPartnerLogo(PARTNER_LOGO_FILES[i]);
    if (dataUri) {
      anyLogoFound = true;
      return `<div class="partner-item">
        <div class="partner-icon"><img src="${dataUri}" alt="${m.alt}" /></div>
        <span class="partner-label">${m.label}</span>
      </div>`;
    }
    return `<div class="partner-item">
      <div class="partner-icon">${m.short}</div>
      <span class="partner-label">${m.label}</span>
    </div>`;
  });

  if (anyLogoFound) {
    return phase1Results.join('\n');
  }

  // Phase 2: Catch-all — scan brand/ for any image files
  const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];
  try {
    if (fs.existsSync(BRAND_DIR)) {
      const brandImages = fs.readdirSync(BRAND_DIR)
        .filter(f => imageExtensions.includes(path.extname(f).toLowerCase()))
        .sort()
        .slice(0, 6);

      if (brandImages.length > 0) {
        return brandImages.map(file => {
          const filePath = path.join(BRAND_DIR, file);
          const dataUri = readImageBase64(filePath);
          if (dataUri) {
            const alt = path.basename(file, path.extname(file)).replace(/[-_]/g, ' ');
            return `<div class="partner-item">
              <div class="partner-icon"><img src="${dataUri}" alt="${alt}" /></div>
              <span class="partner-label" style="max-width:70px;">${alt}</span>
            </div>`;
          }
          return '';
        }).filter(Boolean).join('\n');
      }
    }
  } catch (e) {
    console.error('Failed to scan brand directory:', e.message);
  }

  // Phase 3: Ultimate fallback — styled text placeholders
  return PARTNER_META.map(p =>
    `<div class="partner-item">
      <div class="partner-icon">${p.short}</div>
      <span class="partner-label">${p.label}</span>
    </div>`
  ).join('\n');
}

/**
 * Builds the complete HTML ticket by filling the template with ticket data.
 * Exported for reuse by both the PDF generator and the preview endpoint.
 *
 * @param {Object} ticket - Ticket details from the database.
 * @param {string|null} qrAbsolutePath - Absolute path to QR PNG (or null).
 * @param {string|null} eventLogoPath - Absolute path to event logo (or null).
 * @returns {string} - Complete HTML string for the ticket.
 */
// Path to jsbarcode library (served locally, no CDN needed)
const JSBARCODE_PATH = path.join(__dirname, '..', 'node_modules', 'jsbarcode', 'dist', 'JsBarcode.all.min.js');

async function renderTicketHTML(ticket, qrAbsolutePath, eventLogoPath) {
  const qrBase64 = await getQRBase64(qrAbsolutePath, ticket.qr_token);

  const statusColors = { VALID: 'valid', USED: 'used', CANCELLED: 'cancelled' };
  const statusClass = statusColors[ticket.status] || 'valid';
  const statusLabel = ticket.status === 'VALID' ? 'VALID' : ticket.status;
  const partnerLogosHTML = generatePartnerLogosHTML();

  // Read and inline jsbarcode so it works in both Puppeteer (about:blank) and browser preview
  let jsbarcodeScript = '';
  try {
    if (fs.existsSync(JSBARCODE_PATH)) {
      jsbarcodeScript = fs.readFileSync(JSBARCODE_PATH, 'utf-8');
    }
  } catch (e) {
    console.error('Failed to read jsbarcode:', e.message);
  }

  const templateData = {
    STATUS_CLASS: statusClass,
    STATUS_LABEL: statusLabel,
    PARTNER_LOGOS_HTML: partnerLogosHTML,
    ATTENDEE_NAME: ticket.name || '',
    ATTENDEE_GENDER: ticket.gender || '',
    ATTENDEE_EMAIL: ticket.email || '',
    ATTENDEE_MOBILE: ticket.mobile || '',
    TICKET_ID: ticket.ticket_id || '',
    QR_BASE64: qrBase64,
    GENERATED_TIME: new Date().toISOString().replace('T', ' ').substring(0, 19),
    JSBARCODE_SCRIPT: jsbarcodeScript,
  };

  return fillTemplate(TEMPLATE_PATH, templateData);
}

/**
 * Generates a premium A4 event ticket PDF using HTML + CSS + Puppeteer.
 * @param {Object} ticket - Ticket details from the database.
 * @param {string} qrPathOrUrl - QR image path (relative URL) or absolute path.
 * @param {string|null} eventLogoPath - Optional absolute path to event logo image.
 * @param {Object} [settings={}] - Event settings for additional config.
 * @returns {Promise<string>} - Resolves with the relative URL path of the saved PDF.
 */
async function generatePuppeteerPDF(ticket, qrPathOrUrl, eventLogoPath, settings = {}) {
  // Resolve absolute QR path
  let qrAbsolutePath = qrPathOrUrl
    ? path.join(__dirname, '..', 'public', qrPathOrUrl.replace(/^\//, ''))
    : null;
  if (!qrAbsolutePath || !fs.existsSync(qrAbsolutePath)) {
    qrAbsolutePath = qrPathOrUrl; // Might already be absolute
  }

  // Build HTML using shared render function
  let html = await renderTicketHTML(ticket, qrAbsolutePath, eventLogoPath);

  // Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });

  try {
    const page = await browser.newPage();

    // Set viewport to A4 size
    await page.setViewport({
      width: 794,  // ~210mm at 96dpi
      height: 1123, // ~297mm at 96dpi
      deviceScaleFactor: 2,
    });

    // Set content and wait for jsbarcode to render
    await page.setContent(html, {
      waitUntil: ['load', 'networkidle0'],
      timeout: 15000,
    });

    // Wait for jsbarcode to render (no CDN needed - loaded locally)
    await new Promise(r => setTimeout(r, 2000));

    // Generate PDF
    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
      preferCSSPageSize: true,
    });

    return `/tickets/${fileName}`;
  } finally {
    await browser.close();
  }
}

module.exports = generatePuppeteerPDF;
module.exports.renderTicketHTML = renderTicketHTML;
