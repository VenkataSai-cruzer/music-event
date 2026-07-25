const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const pool = require('../db/db');
const generateQR = require('../utils/generateQR');
const generatePDF = require('../utils/generatePDF');

/**
 * POST /api/tickets
 * Creates a new ticket, generates a QR code and PDF, saves to DB.
 */
async function createTicket(req, res) {
  const { attendee_name, email, event_name, event_date, venue, seat_number } = req.body;

  if (!attendee_name || !email || !event_name || !event_date || !venue) {
    return res.status(400).json({ error: 'Missing required fields: attendee_name, email, event_name, event_date, venue' });
  }

  const ticketId = uuidv4();

  try {
    // Generate QR code image
    const qrPath = await generateQR(ticketId);

    // Insert ticket into the database
    const result = await pool.query(
      `INSERT INTO tickets (id, attendee_name, email, event_name, event_date, venue, seat_number, qr_code_path)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [ticketId, attendee_name, email, event_name, event_date, venue, seat_number || null, qrPath]
    );

    const ticket = result.rows[0];

    // Generate PDF ticket
    const pdfPath = await generatePDF(ticket, qrPath);

    // Update the DB row with the PDF path
    await pool.query(
      `UPDATE tickets SET pdf_path = $1 WHERE id = $2`,
      [pdfPath, ticketId]
    );

    return res.status(201).json({
      message: 'Ticket created successfully',
      ticket: { ...ticket, pdf_path: pdfPath },
    });
  } catch (err) {
    console.error('Error creating ticket:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/tickets
 * Returns all tickets.
 */
async function getAllTickets(req, res) {
  try {
    const result = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching tickets:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/tickets/:id
 * Returns a single ticket by ID.
 */
async function getTicketById(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching ticket:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * GET /api/tickets/:id/download
 * Streams the PDF file for download.
 */
async function downloadTicket(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT pdf_path FROM tickets WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const pdfPath = result.rows[0].pdf_path;
    if (!pdfPath || !fs.existsSync(pdfPath)) {
      return res.status(404).json({ error: 'PDF file not found on server' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ticket-${id}.pdf"`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (err) {
    console.error('Error downloading ticket:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * DELETE /api/tickets/:id
 * Deletes a ticket and its associated files.
 */
async function deleteTicket(req, res) {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT qr_code_path, pdf_path FROM tickets WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const { qr_code_path, pdf_path } = result.rows[0];

    // Delete associated files
    [qr_code_path, pdf_path].forEach((filePath) => {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    await pool.query('DELETE FROM tickets WHERE id = $1', [id]);
    return res.json({ message: 'Ticket deleted successfully' });
  } catch (err) {
    console.error('Error deleting ticket:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = { createTicket, getAllTickets, getTicketById, downloadTicket, deleteTicket };
