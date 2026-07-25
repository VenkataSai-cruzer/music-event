const pool = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const generateTicketId = require('../utils/generateTicketId');
const generateQR = require('../utils/generateQR');
const generatePDF = require('../utils/generatePDF');
const path = require('path');

/**
 * Gets event_settings for use in ticket creation.
 */
async function getEventSettings() {
  const result = await pool.query('SELECT * FROM event_settings WHERE id = 1');
  return result.rows[0] || null;
}

/**
 * Checks if a ticket with the same email or mobile already exists.
 * Returns existing ticket if found.
 */
async function findDuplicate(email, mobile) {
  const result = await pool.query(
    `SELECT ticket_id, name, status FROM tickets
     WHERE email = $1 OR mobile = $2
     LIMIT 1`,
    [email, mobile]
  );
  return result.rows[0] || null;
}

/**
 * Creates a new ticket with QR and PDF generation.
 * Uses event_settings for event_date and event_address if not provided.
 */
async function createTicket(ticketData) {
  const { name, gender, email, mobile, event_date, event_address } = ticketData;

  // Resolve event details from settings if not provided
  const settings = await getEventSettings();
  const finalDate = event_date || (settings ? settings.event_date : null);
  const finalAddress = event_address || (settings ? settings.venue_address || '' : '');

  if (!finalDate) {
    const err = new Error('Event date not configured. Please set it in Settings first.');
    err.statusCode = 400;
    throw err;
  }

  const qrToken = uuidv4();
  const ticketId = await generateTicketId();

  // Generate QR code (PNG data buffer, no file storage)
  const qrDataUrl = await generateQR(qrToken);

  // Insert ticket into database (store qr_token only, no file paths)
  const result = await pool.query(
    `INSERT INTO tickets (ticket_id, qr_token, name, gender, email, mobile, event_date, event_address, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALID')
     RETURNING *`,
    [ticketId, qrToken, name, gender, email, mobile, finalDate, finalAddress]
  );

  const ticket = result.rows[0];

  // Generate PDF (returns buffer, saved to temp for response only)
  const pdfRelativePath = await generatePDF(ticket, qrDataUrl);

  // Store the PDF path for download reference
  const updated = await pool.query(
    `UPDATE tickets SET pdf_path = $1 WHERE id = $2 RETURNING *`,
    [pdfRelativePath, ticket.id]
  );

  return updated.rows[0];
}

/**
 * Retrieves all tickets with optional search, filter, and pagination.
 */
async function getAllTickets({ search, status, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];

  if (search) {
    conditions.push(`(name ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1} OR ticket_id ILIKE $${params.length + 1} OR mobile ILIKE $${params.length + 1})`);
    params.push(`%${search}%`);
  }

  if (status) {
    conditions.push(`status = $${params.length + 1}`);
    params.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await pool.query(`SELECT COUNT(*) FROM tickets ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT * FROM tickets ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    tickets: result.rows,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Retrieves a single ticket by ID.
 */
async function getTicketById(id) {
  const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
  return result.rows[0] || null;
}

/**
 * Retrieves a single ticket by ticket_id format (ME-2026-XXXXXX).
 */
async function getTicketByTicketId(ticketId) {
  const result = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [ticketId]);
  return result.rows[0] || null;
}

/**
 * Verifies a QR token (UUID) and returns the ticket if valid.
 */
async function verifyTicketByQrToken(qrToken) {
  const result = await pool.query('SELECT * FROM tickets WHERE qr_token = $1', [qrToken]);
  return result.rows[0] || null;
}

/**
 * Marks a ticket as USED with scanned_at timestamp.
 * Prevents duplicate usage.
 */
async function useTicket(ticketId) {
  const ticket = await getTicketByTicketId(ticketId);
  if (!ticket) {
    const error = new Error('Ticket not found');
    error.statusCode = 404;
    throw error;
  }

  if (ticket.status === 'USED') {
    const error = new Error('Ticket already used');
    error.statusCode = 409;
    error.ticket = ticket;
    throw error;
  }

  if (ticket.status === 'CANCELLED') {
    const error = new Error('Ticket has been cancelled');
    error.statusCode = 409;
    error.ticket = ticket;
    throw error;
  }

  const result = await pool.query(
    `UPDATE tickets SET status = 'USED', scanned_at = NOW(), updated_at = NOW()
     WHERE ticket_id = $1 RETURNING *`,
    [ticketId]
  );

  return result.rows[0];
}

/**
 * Deletes a ticket.
 */
async function deleteTicket(ticketId) {
  const result = await pool.query(
    'DELETE FROM tickets WHERE ticket_id = $1 RETURNING *',
    [ticketId]
  );
  return result.rows[0] || null;
}

/**
 * Regenerates PDF for an existing ticket.
 */
async function regeneratePDF(ticketId) {
  const ticket = await getTicketByTicketId(ticketId);
  if (!ticket) {
    const error = new Error('Ticket not found');
    error.statusCode = 404;
    throw error;
  }

  const qrAbsolutePath = path.join(__dirname, '..', 'public', ticket.qr_path);
  const pdfPath = await generatePDF(ticket, qrAbsolutePath);

  const updated = await pool.query(
    `UPDATE tickets SET pdf_path = $1, updated_at = NOW() WHERE ticket_id = $2 RETURNING *`,
    [pdfPath, ticketId]
  );

  return updated.rows[0];
}

/**
 * Gets dashboard stats.
 */
async function getDashboardStats() {
  const totalResult = await pool.query('SELECT COUNT(*) FROM tickets');
  const validResult = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'VALID'");
  const usedResult = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'USED'");
  const cancelledResult = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'CANCELLED'");
  const todayResult = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE DATE(created_at) = CURRENT_DATE"
  );

  const recentResult = await pool.query(
    'SELECT * FROM tickets ORDER BY created_at DESC LIMIT 5'
  );

  const activityResult = await pool.query(
    `SELECT ticket_id, name, status, updated_at FROM tickets
     ORDER BY updated_at DESC LIMIT 10`
  );

  return {
    total: parseInt(totalResult.rows[0].count, 10),
    valid: parseInt(validResult.rows[0].count, 10),
    used: parseInt(usedResult.rows[0].count, 10),
    cancelled: parseInt(cancelledResult.rows[0].count, 10),
    todayEntries: parseInt(todayResult.rows[0].count, 10),
    latestTickets: recentResult.rows,
    recentActivity: activityResult.rows,
  };
}

module.exports = {
  createTicket,
  getAllTickets,
  getTicketById,
  getTicketByTicketId,
  verifyTicketByQrToken,
  useTicket,
  deleteTicket,
  regeneratePDF,
  getDashboardStats,
};
