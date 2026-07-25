const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const QR_DIR = path.join(__dirname, '..', 'qrcodes');

// Ensure the qrcodes directory exists
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * Generates a QR code PNG for the given ticket ID.
 * @param {string} ticketId - The unique ticket identifier (UUID).
 * @returns {Promise<string>} - Resolves with the absolute file path of the saved QR image.
 */
async function generateQR(ticketId) {
  const filePath = path.join(QR_DIR, `${ticketId}.png`);
  await QRCode.toFile(filePath, ticketId, {
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    width: 300,
    margin: 2,
  });
  return filePath;
}

module.exports = generateQR;
