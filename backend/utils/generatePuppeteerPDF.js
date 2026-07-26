const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BRAND_DIR = path.join(__dirname, '..', 'public', 'assets', 'brand');
const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'ticket.html');

if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

function readImageBase64(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const ext = path.extname(filePath).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' :
                 ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch (e) {
    return null;
  }
}

function loadBrandLogo(filename) {
  const filePath = path.join(BRAND_DIR, filename);
  return readImageBase64(filePath) || '';
}

/**
 * Generates a professional A4 ticket PDF using Puppeteer.
 * Loads specific brand assets by filename — no directory scanning.
 */
async function generatePuppeteerPDF(ticket, qrBuffer) {
  const qrBase64 = qrBuffer.toString('base64');

  // Load specific brand assets by known filename
  const logo7notes = loadBrandLogo('7notes-logo.png');
  const logoCafooze = loadBrandLogo('cafooze-logo.png');
  const logoYours = loadBrandLogo('yoursdigital.png');
  const logoFisandy = loadBrandLogo('fisandy.png');
  const posterBg = loadBrandLogo('poster.png');

  let html = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Graceful fallback: if a logo is missing, inject CSS to hide its container
  const hideMissingLogo = (logo) => logo ? '' : 'display:none;';

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

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });

    await page.setContent(html, {
      waitUntil: ['load', 'networkidle2'],
      timeout: 45000,
    });

    await new Promise(r => setTimeout(r, 1500));

    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);

    await page.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
      preferCSSPageSize: true,
    });

    return `/tickets/${fileName}`;
  } finally {
    await browser.close();
  }
}

module.exports = generatePuppeteerPDF;
