const pool = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const generateTicketId = require('../utils/generateTicketId');
const generateQR = require('../utils/generateQR');
const generatePDF = require('../utils/generatePuppeteerPDF');

/**
 * Creates a new ticket with QR (in-memory) and PDF generation.
 */
async function createTicket(ticketData) {
  const { name, gender, email, mobile } = ticketData;

  const qrToken = uuidv4();
  const ticketId = await generateTicketId();

  // Generate QR code buffer (in-memory, no file saved)
  const qrBuffer = await generateQR(qrToken);

  // Insert ticket into database (no qr_path — store only UUID)
  const result = await pool.query(
    `INSERT INTO tickets (ticket_id, qr_token, name, gender, email, mobile, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'VALID')
     RETURNING *`,
    [ticketId, qrToken, name, gender, email, mobile]
  );

  const ticket = result.rows[0];

  // Generate PDF with in-memory QR buffer
  const pdfRelativePath = await generatePDF(ticket, qrBuffer);

  // Store the PDF path
  const updated = await pool.query(
    `UPDATE tickets SET pdf_path = $1 WHERE id = $2 RETURNING *`,
    [pdfRelativePath, ticket.id]
  );

  return updated.rows[0];
}

/**
 * Retrieves all tickets with optional search and pagination.
 */
async function getAllTickets({ search, page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];

  if (search) {
    conditions.push(`(name ILIKE $${params.length + 1} OR email ILIKE $${params.length + 1} OR ticket_id ILIKE $${params.length + 1} OR mobile ILIKE $${params.length + 1})`);
    params.push(`%${search}%`);
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
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function getTicketById(id) {
  const result = await pool.query('SELECT * FROM tickets WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function getTicketByTicketId(ticketId) {
  const result = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [ticketId]);
  return result.rows[0] || null;
}

/**
 * Verifies a QR token (UUID). If VALID, atomically approves entry.
 */
async function verifyAndApprove(qrToken, scannedBy) {
  const ticketResult = await pool.query('SELECT * FROM tickets WHERE qr_token = $1', [qrToken]);
  const ticket = ticketResult.rows[0];

  if (!ticket) return { ticket: null, action: 'invalid' };
  if (ticket.status === 'USED') return { ticket, action: 'already_used' };

  // Atomically approve entry (VALID → USED) — prevents race conditions
  const updateResult = await pool.query(
    `UPDATE tickets SET status = 'USED', scanned_at = NOW(), scanned_by = $1
     WHERE qr_token = $2 AND status = 'VALID'
     RETURNING *`,
    [scannedBy || null, qrToken]
  );

  // Race condition: another scanner already approved
  if (updateResult.rows.length === 0) {
    const refreshed = await pool.query('SELECT * FROM tickets WHERE qr_token = $1', [qrToken]);
    return { ticket: refreshed.rows[0] || ticket, action: 'already_used' };
  }

  return { ticket: updateResult.rows[0], action: 'approved' };
}

/**
 * Marks a ticket as USED by ticket ID lookup.
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

  const result = await pool.query(
    `UPDATE tickets SET status = 'USED', scanned_at = NOW() WHERE ticket_id = $1 RETURNING *`,
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
 * Regenerates PDF for an existing ticket (for Render's ephemeral filesystem).
 * Generates QR on-the-fly from the stored UUID token.
 */
async function regeneratePDF(ticketId) {
  const ticket = await getTicketByTicketId(ticketId);
  if (!ticket) {
    const error = new Error('Ticket not found');
    error.statusCode = 404;
    throw error;
  }

  // Regenerate QR buffer from stored UUID
  const qrBuffer = await require('../utils/generateQR')(ticket.qr_token);
  const pdfPath = await generatePDF(ticket, qrBuffer);

  const updated = await pool.query(
    `UPDATE tickets SET pdf_path = $1 WHERE ticket_id = $2 RETURNING *`,
    [pdfPath, ticketId]
  );
  return updated.rows[0];
}

/**
 * Gets dashboard stats.
 */
async function getDashboardStats() {
  const totalResult = await pool.query('SELECT COUNT(*) FROM tickets');
  const usedResult = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'USED'");
  const todayScannedResult = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE DATE(scanned_at) = CURRENT_DATE"
  );

  const latestScanResult = await pool.query(
    `SELECT ticket_id, name, scanned_at, scanned_by FROM tickets
     WHERE scanned_at IS NOT NULL ORDER BY scanned_at DESC LIMIT 1`
  );

  const lastGeneratedResult = await pool.query(
    'SELECT ticket_id, name, created_at FROM tickets ORDER BY created_at DESC LIMIT 1'
  );

  return {
    total: parseInt(totalResult.rows[0].count, 10),
    used: parseInt(usedResult.rows[0].count, 10),
    remaining: parseInt(totalResult.rows[0].count, 10) - parseInt(usedResult.rows[0].count, 10),
    todayScanned: parseInt(todayScannedResult.rows[0].count, 10),
    latestScan: latestScanResult.rows[0] || null,
    lastGenerated: lastGeneratedResult.rows[0] || null,
  };
}

module.exports = {
  createTicket,
  getAllTickets,
  getTicketById,
  getTicketByTicketId,
  verifyAndApprove,
  useTicket,
  deleteTicket,
  regeneratePDF,
  getDashboardStats,
};
