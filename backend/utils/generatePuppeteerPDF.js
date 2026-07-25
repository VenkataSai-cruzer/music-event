const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
 * @param {string} qrAbsolutePath - Absolute path to QR PNG file.
 * @returns {string} - Base64-encoded PNG data URI.
 */
function getQRBase64(qrAbsolutePath) {
  if (!qrAbsolutePath || !fs.existsSync(qrAbsolutePath)) {
    // Return a placeholder transparent pixel
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  }
  const imageBuffer = fs.readFileSync(qrAbsolutePath);
  return imageBuffer.toString('base64');
}

/**
 * Generates the logo-bar HTML for the ticket.
 * @param {string|null} eventLogoPath - Absolute path to event logo.
 * @returns {string} - HTML string for the logo bar.
 */
function generateLogosHTML(eventLogoPath) {
  const logos = [];

  // 7 NOTES logo
  if (eventLogoPath && fs.existsSync(eventLogoPath)) {
    const ext = path.extname(eventLogoPath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
    const data = fs.readFileSync(eventLogoPath).toString('base64');
    logos.push(`<div class="logo-item"><img class="logo-img" src="data:${mime};base64,${data}" alt="7 NOTES" /></div>`);
  } else {
    logos.push(`<div class="logo-item"><span class="logo-text">7 NOTES</span></div>`);
  }

  logos.push(`<div class="logo-sep"></div>`);

  // CAFOOZE logo (venue)
  logos.push(`<div class="logo-item"><span class="logo-text" style="font-size:14px; opacity:0.5;">CAFOOZE</span></div>`);

  return logos.join('\n');
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

function renderTicketHTML(ticket, qrAbsolutePath, eventLogoPath) {
  const qrBase64 = getQRBase64(qrAbsolutePath);

  const statusColors = { VALID: 'valid', USED: 'used', CANCELLED: 'cancelled' };
  const statusClass = statusColors[ticket.status] || 'valid';
  const statusLabel = ticket.status === 'VALID' ? 'VALID TICKET' : ticket.status;
  const logosHTML = generateLogosHTML(eventLogoPath);

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
    LOGOS_HTML: logosHTML,
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
  let html = renderTicketHTML(ticket, qrAbsolutePath, eventLogoPath);

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
    await page.waitForTimeout(2000);

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
