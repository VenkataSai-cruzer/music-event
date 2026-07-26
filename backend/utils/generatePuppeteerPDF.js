const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BRAND_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket.html');

if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

/**
 * Returns a file:// URL for a brand asset, or empty string if missing.
 * Chromium loads PNGs from disk via file:// URLs in milliseconds —
 * much faster than embedding multi-MB base64 strings in the HTML.
 */
function logoFileUrl(filename) {
  const filePath = path.join(BRAND_DIR, filename);
  if (!fs.existsSync(filePath)) return '';
  const absPath = path.resolve(filePath);
  // file:// URL format (add extra / for Windows paths)
  return 'file:///' + absPath.replace(/\\/g, '/');
}

/**
 * Generates a professional A4 ticket PDF using Puppeteer.
 * Brand images loaded via file:// URLs (NOT base64) for speed.
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');

  // Use file:// URLs instead of base64 — dramatically faster for large PNGs
  const logo7notes = logoFileUrl('7notes-logo.png');
  const logoCafooze = logoFileUrl('cafooze-logo.png');
  const logoYours = logoFileUrl('yoursdigital.png');
  const logoFisandy = logoFileUrl('fisandy.png');
  const posterBg = logoFileUrl('poster.png');

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Graceful fallback: if a logo is missing, inject CSS to hide its container
  const hideMissingLogo = (url) => url ? '' : 'display:none;';

  const replacements = {
    'ATTENDEE_NAME': ticket.name || '',
    'ATTENDEE_GENDER': ticket.gender || '',
    'ATTENDEE_EMAIL': ticket.email || '',
    'ATTENDEE_MOBILE': ticket.mobile || '',
    'TICKET_ID': ticket.ticket_id || '',
    'QR_BASE64': qrBase64,
    'LOGO_7NOTES': logo7notes,
    'LOGO_CAFOOZE': logoCafooze,
    'LOGO_YOURSDIGITAL': logoYours,
    'LOGO_FISANDY': logoFisandy,
    'POSTER_BG': posterBg,
    'HIDE_7NOTES': hideMissingLogo(logo7notes),
    'HIDE_CAFOOZE': hideMissingLogo(logoCafooze),
    'HIDE_YOURS': hideMissingLogo(logoYours),
    'HIDE_FISANDY': hideMissingLogo(logoFisandy),
    'HIDE_POSTER': hideMissingLogo(posterBg),
  };

  for (const [key, value] of Object.entries(replacements)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value != null ? String(value) : '');
  }

  // Write HTML to a temp file so we can use page.goto() instead of
  // page.setContent(). goto() with file:// lets Chrome load images
  // from disk natively — orders of magnitude faster than base64.
  const tempDir = path.join(__dirname, '..', 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const tempHtmlPath = path.join(tempDir, `ticket-${ticket.qr_token}.html`);
  fs.writeFileSync(tempHtmlPath, html, 'utf-8');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    // page.goto with file:// loads images from disk natively — much faster
    await page.goto('file:///' + tempHtmlPath.replace(/\\/g, '/'), {
      waitUntil: ['load', 'networkidle2'],
      timeout: 30000,
    });

    // Short settle time (1s is enough when images load from disk)
    await new Promise(r => setTimeout(r, 1000));

    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      preferCSSPageSize: true,
    });

    // Clean up temp HTML file
    try { fs.unlinkSync(tempHtmlPath); } catch (_) {}

    return `/tickets/${fileName}`;
  } finally {
    await browser.close();
  }
}

module.exports = generatePuppeteerPDF;
