const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const QR_DIR = path.join(__dirname, '..', 'public', 'qrcodes');

// Ensure the qrcodes directory exists
if (!fs.existsSync(QR_DIR)) {
  fs.mkdirSync(QR_DIR, { recursive: true });
}

/**
 * Generates a high-quality QR code PNG containing ONLY the UUID (no personal data).
 * Uses high error correction (H level = 30% recovery) and proper quiet zone.
 * Saves to filesystem for caching, returns the relative URL path.
 * @param {string} qrToken - The unique UUID to encode in the QR.
 * @returns {Promise<string>} - Resolves with the relative URL path to the QR image.
 */
async function generateQR(qrToken) {
  const fileName = `${qrToken}.png`;
  const filePath = path.join(QR_DIR, fileName);

  // Skip generation if already cached
  if (!fs.existsSync(filePath)) {
    await QRCode.toFile(filePath, qrToken, {
      color: {
        dark: '#1a1a2e',
        light: '#ffffff',
      },
      // Error correction level: H (highest, ~30% recovery)
      errorCorrectionLevel: 'H',
      // High resolution for instant scanning
      width: 600,
      // Proper quiet zone (white border around QR)
      margin: 4,
      // Render type for crisp output
      type: 'png',
    });
  }

  return `/qrcodes/${fileName}`;
}

module.exports = generateQR;
