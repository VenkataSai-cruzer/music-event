const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'public', 'tickets');

// Ensure the tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

/**
 * Generates a professional A4 portrait PDF ticket.
 * @param {Object} ticket - Ticket details from the database.
 * @param {string} qrAbsolutePath - Absolute path to the QR code image.
 * @returns {Promise<string>} - Resolves with the relative URL path of the saved PDF.
 */
function generatePDF(ticket, qrAbsolutePath) {
  return new Promise((resolve, reject) => {
    const fileName = `${ticket.qr_token}.pdf`;
    const filePath = path.join(TICKETS_DIR, fileName);
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Ticket ${ticket.ticket_id}`,
        Author: 'Music Event',
      },
    });

    const writeStream = fs.createWriteStream(filePath);
    doc.pipe(writeStream);

    const pageWidth = doc.page.width - 100; // 595.28 - 100 = 495.28
    const centerX = doc.page.width / 2;

    // ── Decorative top border ──
    doc
      .rect(0, 0, doc.page.width, 12)
      .fill('#1a1a2e');

    doc
      .rect(0, doc.page.height - 12, doc.page.width, 12)
      .fill('#1a1a2e');

    // ── Event Logo Placeholder ──
    doc
      .save()
      .roundedRect(centerX - 30, 40, 60, 60, 8)
      .fill('#e94560');

    doc
      .fontSize(28)
      .fillColor('#ffffff')
      .text('♪', centerX - 10, 52, { width: 20, align: 'center' });

    doc.restore();

    // ── Event Name ──
    doc
      .fontSize(26)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('MUSIC EVENT', { align: 'center' });

    doc.moveDown(0.3);

    doc
      .fontSize(10)
      .fillColor('#888888')
      .font('Helvetica')
      .text('~ Entry Pass ~', { align: 'center' });

    doc.moveDown(0.5);

    // ── Dashed separator ──
    const dashY = doc.y;
    for (let i = 0; i < 40; i++) {
      doc
        .rect(50 + i * 12, dashY, 6, 1)
        .fill('#e94560');
    }
    doc.moveDown(1);

    // ── Ticket ID (prominent) ──
    doc
      .fontSize(18)
      .fillColor('#e94560')
      .font('Helvetica-Bold')
      .text(ticket.ticket_id, { align: 'center' });

    doc.moveDown(1);

    // ── Divider line ──
    doc
      .moveTo(50, doc.y)
      .lineTo(doc.page.width - 50, doc.y)
      .strokeColor('#eeeeee')
      .lineWidth(1)
      .stroke();

    doc.moveDown(0.8);

    // ── Attendee Details (fixed two-column layout using absolute positions) ──
    const leftX = 60;
    const rightX = doc.page.width / 2 + 20;
    const labelColor = '#888888';
    const valueColor = '#333333';
    const rowHeight = 22;
    const startY = doc.y;

    const col1 = [
      { label: 'ATTENDEE', value: ticket.name },
      { label: 'GENDER', value: ticket.gender },
    ];
    const col2 = [
      { label: 'EMAIL', value: ticket.email },
      { label: 'MOBILE', value: ticket.mobile },
    ];

    // Draw left column
    col1.forEach((field, i) => {
      const yPos = startY + i * rowHeight * 2;
      doc
        .fontSize(8)
        .fillColor(labelColor)
        .font('Helvetica-Bold')
        .text(field.label, leftX, yPos, { width: 150 });
      doc
        .fontSize(11)
        .fillColor(valueColor)
        .font('Helvetica')
        .text(field.value, leftX, yPos + 12, { width: 180 });
    });

    // Draw right column
    col2.forEach((field, i) => {
      const yPos = startY + i * rowHeight * 2;
      doc
        .fontSize(8)
        .fillColor(labelColor)
        .font('Helvetica-Bold')
        .text(field.label, rightX, yPos, { width: 150 });
      doc
        .fontSize(11)
        .fillColor(valueColor)
        .font('Helvetica')
        .text(field.value, rightX, yPos + 12, { width: 180 });
    });

    const detailsY = startY + rowHeight * 4 + 10;
    doc.y = detailsY;

    // ── Event Details ──
    doc
      .fontSize(8)
      .fillColor(labelColor)
      .font('Helvetica-Bold')
      .text('EVENT DATE', leftX, doc.y);
    doc
      .fontSize(11)
      .fillColor(valueColor)
      .font('Helvetica')
      .text(
        new Date(ticket.event_date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        leftX,
        doc.y + 12,
        { width: 200 }
      );

    doc
      .fontSize(8)
      .fillColor(labelColor)
      .font('Helvetica-Bold')
      .text('VENUE', rightX, detailsY);
    doc
      .fontSize(11)
      .fillColor(valueColor)
      .font('Helvetica')
      .text(ticket.event_address, rightX, detailsY + 12, { width: 200 });

    doc.y = detailsY + 40;
    doc.moveDown(1);

    // ── Divider line ──
    const divY = doc.y;
    doc
      .moveTo(50, divY)
      .lineTo(doc.page.width - 50, divY)
      .strokeColor('#eeeeee')
      .lineWidth(1)
      .stroke();

    doc.moveDown(1.5);

    // ── QR Code Section ──
    doc
      .fontSize(10)
      .fillColor('#555555')
      .font('Helvetica')
      .text('Scan QR code at entrance for verification', { align: 'center' });

    doc.moveDown(0.5);

    if (qrAbsolutePath && fs.existsSync(qrAbsolutePath)) {
      const qrSize = 130;
      const qrX = centerX - qrSize / 2;
      doc.image(qrAbsolutePath, qrX, doc.y, {
        fit: [qrSize, qrSize],
      });
      doc.moveDown(4.5);
    } else {
      doc.moveDown(2);
    }

    // ── Status Badge ──
    const badgeColor = ticket.status === 'VALID' ? '#22c55e' : ticket.status === 'USED' ? '#f59e0b' : '#ef4444';
    doc
      .roundedRect(centerX - 40, doc.y, 80, 24, 12)
      .fill(badgeColor);

    doc
      .fontSize(11)
      .fillColor('#ffffff')
      .font('Helvetica-Bold')
      .text(ticket.status, centerX - 35, doc.y + 5, { width: 70, align: 'center' });

    doc.moveDown(2.5);

    // ── Footer ──
    doc
      .fontSize(9)
      .fillColor('#aaaaaa')
      .font('Helvetica')
      .text('This ticket is non-transferable. Present this PDF or a printed copy at the venue entry.', {
        align: 'center',
      });

    doc.moveDown(0.5);

    doc
      .fontSize(10)
      .fillColor('#1a1a2e')
      .font('Helvetica-Bold')
      .text('Powered by Music Event', { align: 'center' });

    // ── Generated timestamp ──
    doc
      .fontSize(7)
      .fillColor('#cccccc')
      .font('Helvetica')
      .text(`Generated: ${new Date().toISOString()}`, { align: 'center' });

    doc.end();

    writeStream.on('finish', () => resolve(`/tickets/${fileName}`));
    writeStream.on('error', reject);
  });
}

module.exports = generatePDF;
