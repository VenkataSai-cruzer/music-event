const pool = require('../db/db');

/**
 * GET /api/settings
 * Returns current event settings.
 */
async function getSettings(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM event_settings WHERE id = 1');
    return res.json(result.rows[0] || {});
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/settings
 * Updates event settings.
 */
async function updateSettings(req, res, next) {
  const {
    event_name,
    event_logo,
    event_date,
    event_time,
    venue_name,
    venue_address,
    organizer_name,
    contact_number,
    support_email,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE event_settings SET
        event_name = COALESCE($1, event_name),
        event_logo = COALESCE($2, event_logo),
        event_date = COALESCE($3, event_date),
        event_time = COALESCE($4, event_time),
        venue_name = COALESCE($5, venue_name),
        venue_address = COALESCE($6, venue_address),
        organizer_name = COALESCE($7, organizer_name),
        contact_number = COALESCE($8, contact_number),
        support_email = COALESCE($9, support_email),
        updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        event_name || null,
        event_logo || null,
        event_date || null,
        event_time || null,
        venue_name || null,
        venue_address || null,
        organizer_name || null,
        contact_number || null,
        support_email || null,
      ]
    );

    return res.json({ message: 'Settings updated', settings: result.rows[0] });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };
