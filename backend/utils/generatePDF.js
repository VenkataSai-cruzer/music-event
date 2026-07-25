const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'tickets');

// Ensure the tickets directory exists
if (!fs.existsSync(TICKETS_DIR)) {
  fs.mkdirSync(TICKETS_DIR, { recursive: true });
}

/**
 * Generates a PDF ticket for the given ticket data.
 * @param {Object} ticket - Ticket details from the database.
 * @param {string} qrPath - Absolute path to the QR code image.
 * @returns {Promise<string>} - Resolves with the absolute file path of the saved PDF.
 */
function generatePDF(ticket, qrPath) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(TICKETS_DIR, `${ticket.id}.pdf`);
    const doc = new PDFDocument({ margin: 50 });
    const writeStream = fs.createWriteStream(filePath);

    doc.pipe(writeStream);

    // Header
    doc
      .fontSize(26)
      .fillColor('#1a1a2e')
      .text('🎵 Music Event Ticket', { align: 'center' });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e94560').lineWidth(2).stroke();
    doc.moveDown();

    // Ticket details
    doc.fontSize(14).fillColor('#333333');

    const fields = [
      ['Ticket ID', ticket.id],
      ['Attendee Name', ticket.attendee_name],
      ['Email', ticket.email],
      ['Event', ticket.event_name],
      ['Date', new Date(ticket.event_date).toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })],
      ['Venue', ticket.venue],
      ['Seat', ticket.seat_number || 'General Admission'],
    ];

    fields.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true });
      doc.font('Helvetica').text(value || 'N/A');
    });

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(550, doc.y).strokeColor('#e94560').lineWidth(1).stroke();
    doc.moveDown();

    // QR Code
    doc.fontSize(12).fillColor('#555555').text('Scan QR code at the venue entrance:', { align: 'center' });
    doc.moveDown(0.5);

    if (fs.existsSync(qrPath)) {
      doc.image(qrPath, { fit: [150, 150], align: 'center' });
    }

    doc.moveDown();
    doc
      .fontSize(10)
      .fillColor('#999999')
      .text('This ticket is non-transferable. Present this PDF or printed copy at entry.', {
        align: 'center',
      });

    doc.end();

    writeStream.on('finish', () => resolve(filePath));
    writeStream.on('error', reject);
  });
}

module.exports = generatePDF;
