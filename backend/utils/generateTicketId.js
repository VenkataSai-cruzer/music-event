const pool = require('../db/db');

/**
 * Generates a sequential ticket ID in the format ME-YYYY-XXXXXX
 * Example: ME-2026-000001
 * Uses a PostgreSQL sequence for concurrent-safe ID generation.
 */
async function generateTicketId() {
  const currentYear = new Date().getFullYear();

  // Use PostgreSQL sequence for atomic, concurrent-safe increments
  const seqResult = await pool.query("SELECT nextval('ticket_id_seq')");
  let seq = parseInt(seqResult.rows[0].nextval, 10);

  // Pad to 6 digits
  return `ME-${currentYear}-${String(seq).padStart(6, '0')}`;
}

module.exports = generateTicketId;
