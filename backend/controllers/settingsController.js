const pool = require('../db/db');
const path = require('path');

/**
 * GET /api/settings
 * Returns current event settings.
 */
async function getSettings(req, res, next) {
  try {
    const result = await pool.query('SELECT * FROM event_settings WHERE id = 1');
    const settings = result.rows[0] || {};

    // If event_logo is a relative path, prepend the base URL
    if (settings.event_logo && !settings.event_logo.startsWith('http')) {
      settings.event_logo_url = `${req.protocol}://${req.get('host')}${settings.event_logo}`;
    }

    return res.json(settings);
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
        event_date = COALESCE($2, event_date),
        event_time = COALESCE($3, event_time),
        venue_name = COALESCE($4, venue_name),
        venue_address = COALESCE($5, venue_address),
        organizer_name = COALESCE($6, organizer_name),
        contact_number = COALESCE($7, contact_number),
        support_email = COALESCE($8, support_email),
        updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        event_name || null,
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

/**
 * POST /api/settings/logo
 * Uploads an event logo image. Stores in public/logos and saves path to DB.
 */
async function uploadLogo(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Only PNG, JPEG, WebP, and SVG images are allowed' });
    }

    const logoPath = `/logos/${req.file.filename}`;

    await pool.query(
      `UPDATE event_settings SET event_logo = $1, updated_at = NOW() WHERE id = 1`,
      [logoPath]
    );

    return res.json({
      message: 'Logo uploaded successfully',
      logo_url: logoPath,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings, uploadLogo };
