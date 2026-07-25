const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const BADGES_DIR = path.join(__dirname, '..', 'public', 'tickets');

if (!fs.existsSync(BADGES_DIR)) {
  fs.mkdirSync(BADGES_DIR, { recursive: true });
}

/**
 * Generates a printable name badge PDF (half-letter size).
 * @param {Object} ticket - Ticket details from the database.
 * @param {string} qrPath - Relative URL path to QR image.
 * @param {string|null} eventLogoPath - Absolute path to event logo.
 * @returns {Promise<string>} - Relative URL path of the saved badge PDF.
 */
function generateBadge(ticket, qrPath, eventLogoPath) {
  return new Promise((resolve, reject) => {
    const fileName = `badge-${ticket.qr_token}.pdf`;
    const filePath = path.join(BADGES_DIR, fileName);
    const doc = new PDFDocument({
      size: [360, 540], // Half-letter / badge size
      margin: 20,
      info: {
        Title: `Badge ${ticket.ticket_id}`,
        Author: 'Music Event',
      },
    });

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const centerX = doc.page.width / 2;

    // Background
    doc.rect(0, 0, doc.page.width, doc.page.height).fill('#ffffff');

    // Top accent bar
    doc.rect(0, 0, doc.page.width, 8).fill('#1a1a2e');

    // Event Logo or placeholder
    if (eventLogoPath && fs.existsSync(eventLogoPath)) {
      doc.image(eventLogoPath, centerX - 20, 20, { fit: [40, 40], align: 'center' });
    }

    // Event name
    doc
      .fontSize(14)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('MUSIC EVENT', { align: 'center' });

    doc.moveDown(0.5);

    // Separator
    doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#e94560').lineWidth(1).stroke();
    doc.moveDown(1);

    // Attendee Name (large)
    doc
      .fontSize(22)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text(ticket.name.toUpperCase(), { align: 'center' });

    doc.moveDown(0.5);

    // Ticket ID
    doc
      .fontSize(9)
      .fillColor('#888888')
      .font('Helvetica')
      .text(ticket.ticket_id, { align: 'center' });

    doc.moveDown(1.5);

    // QR Code
    const qrAbsolutePath = qrPath
      ? path.join(__dirname, '..', 'public', qrPath.replace(/^\//, ''))
      : null;

    if (qrAbsolutePath && fs.existsSync(qrAbsolutePath)) {
      const qrSize = 120;
      doc.image(qrAbsolutePath, centerX - qrSize / 2, doc.y, { fit: [qrSize, qrSize] });
      doc.moveDown(4.5);
    }

    doc.moveDown(0.5);

    // Status
    const badgeColor = ticket.status === 'VALID' ? '#22c55e' : ticket.status === 'USED' ? '#f59e0b' : '#ef4444';
    doc
      .roundedRect(centerX - 30, doc.y, 60, 20, 10)
      .fill(badgeColor);
    doc
      .fontSize(9)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(ticket.status, centerX - 25, doc.y + 4, { width: 50, align: 'center' });

    doc.end();

    writeStream.on('finish', () => resolve(`/tickets/${fileName}`));
    writeStream.on('error', reject);
  });
}

module.exports = generateBadge;
