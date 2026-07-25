const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const QR_DIR = path.join(__dirname, '..', 'public', 'qrcodes');

// Ensure the qrcodes directory exists
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * Generates a QR code PNG containing ONLY the UUID (no personal data).
 * @param {string} qrToken - The unique UUID to encode in the QR.
 * @returns {Promise<string>} - Resolves with the relative path of the saved QR image.
 */
async function generateQR(qrToken) {
  const fileName = `${qrToken}.png`;
  const filePath = path.join(QR_DIR, fileName);

  await QRCode.toFile(filePath, qrToken, {
    color: {
      dark: '#1a1a2e',
      light: '#ffffff',
    },
    width: 400,
    margin: 2,
  });

  return `/qrcodes/${fileName}`;
}

module.exports = generateQR;
