const pool = require('../db/db');

/**
 * Generates a sequential ticket ID in the format ME-YYYY-XXXXXX
 * Example: ME-2026-000001
 */
async function generateTicketId() {
  const currentYear = new Date().getFullYear();
  const prefix = `ME-${currentYear}-`;

  // Find the latest ticket_id with the same year prefix
  const result = await pool.query(
    `SELECT ticket_id FROM tickets
     WHERE ticket_id LIKE $1
     ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSequence = 1;

  if (result.rows.length > 0) {
    const lastId = result.rows[0].ticket_id;
    const lastSequence = parseInt(lastId.split('-')[2], 10);
    if (!isNaN(lastSequence)) {
      nextSequence = lastSequence + 1;
    }
  }

  return `${prefix}${String(nextSequence).padStart(6, '0')}`;
}

module.exports = generateTicketId;
