/**
 * generatePDF.js
 *
 * Generates a premium A4 event ticket PDF using an HTML/CSS template
 * rendered via Puppeteer. The template is branded for the "7 NOTES"
 * event (Live Jamming Session) with gold/black theme, QR code,
 * Code128 barcode, attendee details, and partner logos.
 *
 * This replaces the old PDFKit-based implementation.
 *
 * @see generatePuppeteerPDF.js for the actual rendering logic.
 */

const generatePuppeteerPDF = require('./generatePuppeteerPDF');

/**
 * Generates a premium A4 event ticket using the HTML+Puppeteer engine.
 *
 * @param {Object} ticket - Ticket details from the database.
 * @param {string} qrPathOrUrl - QR image path (relative URL) or absolute path.
 * @param {string|null} [eventLogoPath] - Optional absolute path to event logo image.
 * @param {Object} [settings={}] - Event settings (unused in hardcoded template).
 * @returns {Promise<string>} - Resolves with the relative URL path of the saved PDF.
 */
async function generatePDF(ticket, qrPathOrUrl, eventLogoPath, settings = {}) {
  return generatePuppeteerPDF(ticket, qrPathOrUrl, eventLogoPath, settings);
}

module.exports = generatePDF;
