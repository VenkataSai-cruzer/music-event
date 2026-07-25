const nodemailer = require('nodemailer');
const fs = require('fs');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@musicevent.com';

let transporter = null;

function getTransporter() {
  if (!transporter && SMTP_HOST && SMTP_USER) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

/**
 * Sends a ticket PDF to the attendee's email.
 * @param {string} to - Recipient email.
 * @param {Object} ticket - Ticket details.
 * @param {string} pdfAbsolutePath - Absolute path to the PDF file.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function sendTicketEmail(to, ticket, pdfAbsolutePath) {
  const transport = getTransporter();

  if (!transport) {
    return {
      success: false,
      message: 'Email is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS env vars.',
    };
  }

  if (!fs.existsSync(pdfAbsolutePath)) {
    return { success: false, message: 'PDF file not found. Please regenerate the ticket first.' };
  }

  try {
    await transport.sendMail({
      from: FROM_EMAIL,
      to,
      subject: `Your Ticket: ${ticket.ticket_id} — Music Event`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: #1a1a2e; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 22px;">🎵 Music Event</h1>
          </div>
          <div style="background: #f8f8f8; padding: 30px; border-radius: 0 0 10px 10px;">
            <p style="font-size: 16px; margin: 0 0 20px;">Hello <strong>${ticket.name}</strong>,</p>
            <p style="color: #555; margin: 0 0 20px;">Your ticket for the event is attached.</p>
            <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
              <p style="margin: 0 0 5px;"><strong>Ticket ID:</strong> ${ticket.ticket_id}</p>
              <p style="margin: 0 0 5px;"><strong>Event Date:</strong> ${new Date(ticket.event_date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style="margin: 0;"><strong>Venue:</strong> ${ticket.event_address}</p>
            </div>
            <p style="color: #888; font-size: 12px; margin: 0;">Please present this ticket (printed or on your phone) at the venue entrance.</p>
          </div>
          <p style="text-align: center; color: #aaa; font-size: 11px; margin-top: 10px;">Powered by Music Event</p>
        </div>
      `,
      attachments: [
        {
          filename: `${ticket.ticket_id}.pdf`,
          path: pdfAbsolutePath,
        },
      ],
    });

    return { success: true, message: 'Email sent successfully' };
  } catch (err) {
    console.error('Failed to send email:', err);
    return { success: false, message: `Failed to send email: ${err.message}` };
  }
}

module.exports = { sendTicketEmail };
