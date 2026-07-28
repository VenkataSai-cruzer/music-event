const pool = require('../db/db');
const { v4: uuidv4 } = require('uuid');
const generateTicketId = require('../utils/generateTicketId');
const generateQR = require('../utils/generateQR');
const generatePDF = require('../utils/generatePDF');

/** ── Helpers ── */

/**
 * Logs an action to the activity_log table.
 */
async function logActivity({ action, description, ticketId, performedBy, result }) {
  try {
    await pool.query(
      `INSERT INTO activity_log (action, description, ticket_id, performed_by, result)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, description || null, ticketId || null, performedBy || null, result || null]
    );
  } catch (err) {
    console.error('[logActivity] Failed:', err.message);
  }
}

/**
 * Gets event settings from the database.
 */
async function getEventSettings() {
  const result = await pool.query('SELECT * FROM event_settings WHERE id = 1');
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

/** ── Core Functions ── */

/**
 * Creates a new ticket with QR and PDF generation.
 * Uses a DB transaction for the INSERT, then generates PDF outside the transaction.
 * Flow: BEGIN → INSERT → COMMIT (DB is source of truth) → generate PDF → UPDATE pdf_data
 */
async function createTicket(ticketData) {
  const { name, gender, email, mobile } = ticketData;
  const qrToken = uuidv4();
  const ticketId = await generateTicketId();

  // Generate QR code buffer (in-memory, no file saved)
  const qrBuffer = await generateQR(qrToken);

  // Step 1: Transaction — ensure DB is the source of truth
  // Uses pool.connect() to keep BEGIN/INSERT/COMMIT on the same connection
  let ticket;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `INSERT INTO tickets (ticket_id, qr_token, name, gender, email, mobile, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'VALID')
       RETURNING *`,
      [ticketId, qrToken, name, gender, email, mobile]
    );
    await client.query('COMMIT');
    ticket = result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  // Step 2: Generate PDF from the stored database record (outside transaction)
  try {
    // Get event settings for PDF
    const eventSettings = await getEventSettings();
    const pdfBuffer = await generatePDF(ticket, qrBuffer, eventSettings);

    // Store the PDF buffer directly in the database
    const updated = await pool.query(
      `UPDATE tickets SET pdf_data = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, ticket_id, name, gender, email, mobile, status,
                 scanned_by, scanned_at, created_at, updated_at, pdf_data`,
      [pdfBuffer, ticket.id]
    );

    await logActivity({
      action: 'REGISTRATION_CREATED',
      description: `Registration ${ticket.ticket_id} created for ${name}`,
      ticketId: ticket.ticket_id,
      performedBy: 'admin',
      result: 'SUCCESS',
    });

    return updated.rows[0];
  } catch (pdfErr) {
    console.error(`[createTicket] PDF generation failed for ticket_id=${ticket.ticket_id}:`, pdfErr.message);
    // Ticket still exists in DB — download endpoint will retry PDF generation
    return ticket;
  }
}

/**
 * Retrieves all tickets with optional search and pagination.
 * Excludes qr_token (UUID) and pdf_data from list queries for security/performance.
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

  // qr_token excluded from list view — UUIDs are internal only
  const result = await pool.query(
    `SELECT id, ticket_id, name, gender, email, mobile, status,
            scanned_by, scanned_at, created_at, updated_at
     FROM tickets ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
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
 * Handles: APPROVED, ALREADY_USED, CANCELLED, INVALID
 * Uses atomic UPDATE ... RETURNING for concurrency safety.
 */
async function verifyAndApprove(qrToken, scannedBy) {
  const ticketResult = await pool.query('SELECT * FROM tickets WHERE qr_token = $1', [qrToken]);
  const ticket = ticketResult.rows[0];

  if (!ticket) return { ticket: null, action: 'invalid' };

  if (ticket.status === 'CANCELLED') return { ticket, action: 'cancelled' };
  if (ticket.status === 'USED') return { ticket, action: 'already_used' };

  // Single atomic UPDATE — this is the production-safe lock
  const updateResult = await pool.query(
    `UPDATE tickets SET status = 'USED', scanned_at = NOW(), scanned_by = $1, updated_at = NOW()
     WHERE qr_token = $2 AND status = 'VALID'
     RETURNING *`,
    [scannedBy || null, qrToken]
  );

  // Race condition: another scanner already approved
  if (updateResult.rows.length === 0) {
    const refreshed = await pool.query('SELECT * FROM tickets WHERE qr_token = $1', [qrToken]);
    const refreshedTicket = refreshed.rows[0];
    if (refreshedTicket.status === 'CANCELLED') return { ticket: refreshedTicket, action: 'cancelled' };
    return { ticket: refreshedTicket || ticket, action: 'already_used' };
  }

  // Log successful entry
  await logActivity({
    action: 'ENTRY_APPROVED',
    description: `Entry approved for ${updateResult.rows[0].name} (${updateResult.rows[0].ticket_id})`,
    ticketId: updateResult.rows[0].ticket_id,
    performedBy: scannedBy,
    result: 'APPROVED',
  });

  return { ticket: updateResult.rows[0], action: 'approved' };
}

/**
 * Marks a ticket as USED by ticket ID lookup (non-atomic fallback).
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
 * Cancels a VALID ticket.
 */
async function cancelTicket(ticketId, cancelledBy) {
  const ticket = await getTicketByTicketId(ticketId);
  if (!ticket) {
    const error = new Error('Registration not found');
    error.statusCode = 404;
    throw error;
  }
  if (ticket.status === 'USED') {
    const error = new Error('Cannot cancel a registration that has already been used');
    error.statusCode = 409;
    throw error;
  }
  if (ticket.status === 'CANCELLED') {
    const error = new Error('Registration is already cancelled');
    error.statusCode = 409;
    throw error;
  }

  const result = await pool.query(
    `UPDATE tickets SET status = 'CANCELLED', cancelled_at = NOW(), updated_at = NOW()
     WHERE ticket_id = $1 AND status = 'VALID'
     RETURNING *`,
    [ticketId]
  );

  if (result.rows.length === 0) {
    const error = new Error('Unable to cancel registration');
    error.statusCode = 500;
    throw error;
  }

  await logActivity({
    action: 'REGISTRATION_CANCELLED',
    description: `Registration ${ticketId} cancelled`,
    ticketId: ticketId,
    performedBy: cancelledBy,
    result: 'CANCELLED',
  });

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
 * Only regenerates the document — preserves UUID, ticket ID, and status.
 */
async function regeneratePDF(ticketId) {
  const ticket = await getTicketByTicketId(ticketId);
  if (!ticket) {
    const error = new Error('Ticket not found');
    error.statusCode = 404;
    throw error;
  }

  const qrBuffer = await require('../utils/generateQR')(ticket.qr_token);
  const eventSettings = await getEventSettings();
  const pdfBuffer = await generatePDF(ticket, qrBuffer, eventSettings);

  const updated = await pool.query(
    `UPDATE tickets SET pdf_data = $1, updated_at = NOW()
     WHERE ticket_id = $2
     RETURNING id, ticket_id, name, gender, email, mobile,
               status, scanned_by, scanned_at, created_at, updated_at, pdf_data`,
    [pdfBuffer, ticketId]
  );

  await logActivity({
    action: 'PDF_REGENERATED',
    description: `PDF regenerated for ${ticketId}`,
    ticketId: ticketId,
    performedBy: 'admin',
    result: 'SUCCESS',
  });

  return updated.rows[0];
}

/**
 * Gets dashboard stats including cancelled count, pending, today's registrations.
 */
async function getDashboardStats() {
  const totalResult = await pool.query('SELECT COUNT(*) FROM tickets');
  const usedResult = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'USED'");
  const cancelledResult = await pool.query("SELECT COUNT(*) FROM tickets WHERE status = 'CANCELLED'");
  const todayScannedResult = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE DATE(scanned_at) = CURRENT_DATE"
  );
  const todayRegistrationsResult = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE DATE(created_at) = CURRENT_DATE"
  );

  const latestScanResult = await pool.query(
    `SELECT ticket_id, name, scanned_at, scanned_by FROM tickets
     WHERE scanned_at IS NOT NULL ORDER BY scanned_at DESC LIMIT 1`
  );

  const lastGeneratedResult = await pool.query(
    'SELECT ticket_id, name, created_at FROM tickets ORDER BY created_at DESC LIMIT 1'
  );

  const totalInt = parseInt(totalResult.rows[0].count, 10);
  const usedInt = parseInt(usedResult.rows[0].count, 10);
  const cancelledInt = parseInt(cancelledResult.rows[0].count, 10);

  return {
    total: totalInt,
    used: usedInt,
    cancelled: cancelledInt,
    pending: totalInt - usedInt - cancelledInt,
    remaining: totalInt - usedInt - cancelledInt,
    todayScanned: parseInt(todayScannedResult.rows[0].count, 10),
    todayRegistrations: parseInt(todayRegistrationsResult.rows[0].count, 10),
    latestScan: latestScanResult.rows[0] || null,
    lastGenerated: lastGeneratedResult.rows[0] || null,
  };
}

/**
 * Gets all scan logs (USED tickets with scan details).
 */
async function getScanLogs({ page = 1, limit = 30 }) {
  const offset = (page - 1) * limit;

  const countResult = await pool.query(
    "SELECT COUNT(*) FROM tickets WHERE status = 'USED' AND scanned_at IS NOT NULL"
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const result = await pool.query(
    `SELECT ticket_id, name, mobile, status, scanned_at, scanned_by, created_at
     FROM tickets
     WHERE status = 'USED' AND scanned_at IS NOT NULL
     ORDER BY scanned_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return {
    logs: result.rows,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Exports all registrations as CSV data.
 */
async function exportCSV() {
  const result = await pool.query(
    `SELECT ticket_id, name, gender, email, mobile, status,
            created_at, scanned_at, scanned_by
     FROM tickets
     ORDER BY created_at DESC`
  );

  const headers = ['Ticket ID', 'Name', 'Gender', 'Email', 'Mobile', 'Status', 'Registration Date', 'Scan Time', 'Scanned By'];
  const rows = result.rows.map(t => [
    t.ticket_id,
    `"${(t.name || '').replace(/"/g, '""')}"`,
    t.gender || '',
    t.email || '',
    t.mobile || '',
    t.status,
    t.created_at ? new Date(t.created_at).toLocaleString('en-IN') : '',
    t.scanned_at ? new Date(t.scanned_at).toLocaleString('en-IN') : '',
    t.scanned_by || '',
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

module.exports = {
  createTicket,
  getAllTickets,
  getTicketById,
  getTicketByTicketId,
  verifyAndApprove,
  useTicket,
  cancelTicket,
  deleteTicket,
  regeneratePDF,
  getDashboardStats,
  getScanLogs,
  getEventSettings,
  exportCSV,
  logActivity,
};
