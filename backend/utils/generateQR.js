const QRCode = require('qrcode');

/**
 * Generates a QR code PNG buffer containing ONLY the UUID (no personal data).
 * No files saved to disk — returns buffer for immediate use in PDF.
 * @param {string} qrToken - The unique UUID to encode in the QR.
 * @returns {Promise<Buffer>} - PNG image buffer.
 */
async function generateQR(qrToken) {
  return QRCode.toBuffer(qrToken, {
    color: { dark: '#1a1a2e', light: '#ffffff' },
    errorCorrectionLevel: 'H',
    width: 600,
    margin: 4,
    type: 'png',
  });
}

module.exports = generateQR;
