const QRCode = require('qrcode');

/**
 * Generates a QR code PNG buffer containing ONLY the UUID (no personal data).
 * QR is 250×250 px with white background, no border, no shadow.
 * No files saved to disk — returns buffer for immediate use in PDF.
 * @param {string} qrToken - The unique UUID to encode in the QR.
 * @returns {Promise<Buffer>} - PNG image buffer.
 */
async function generateQR(qrToken) {
  return QRCode.toBuffer(qrToken, {
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'H',
    width: 250,
    margin: 0,
    type: 'png',
  });
}

module.exports = generateQR;
